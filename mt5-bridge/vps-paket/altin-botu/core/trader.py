"""Order execution for the MT5 bot.

All order operations (open / close / modify) go through the Trader class.
This module is the only place besides core.mt5_client that talks to the
MetaTrader5 API directly (allowed by the SPEC for order constants and
order_send).

Filling-mode fallback: opening market orders use ORDER_FILLING_FOK ->
ORDER_FILLING_IOC. Close orders may additionally try ORDER_FILLING_RETURN.
When the trade server answers with retcode 10030 (unsupported filling mode)
the next mode in the applicable chain is tried.
"""

from __future__ import annotations

import math
import json
import os
import sys
import time
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

import MetaTrader5 as mt5

from core.config import MAGIC_NUMBER
from core.execution import is_paper
from core.logger import get_logger
from core.mt5_client import MT5Client, MT5_API_LOCK

# The packaged gold bot lives either beside ``mt5-bridge`` (release ZIP) or
# under ``mt5-bridge/vps-paket`` (source tree).  Both must use the exact same
# account brain; absence is a fail-closed condition, never a legacy fallback.
_ALTIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_BRAIN_DIRS = (
    os.path.join(os.path.dirname(_ALTIN_ROOT), "mt5-bridge"),
    os.path.abspath(os.path.join(_ALTIN_ROOT, "..", "..")),
)
for _brain_dir in _BRAIN_DIRS:
    if os.path.exists(os.path.join(_brain_dir, "mt5_brain_adapter.py")):
        if _brain_dir not in sys.path:
            sys.path.insert(0, _brain_dir)
        break
try:
    import mt5_brain_adapter
except ImportError:
    mt5_brain_adapter = None

if TYPE_CHECKING:
    from core.config import ConfigManager
    from core.journal import Journal
    from core.risk import RiskManager

# Retcodes considered a success for a market order.
_OK_RETCODES = {
    int(getattr(mt5, "TRADE_RETCODE_DONE", 10009)),
    int(getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010)),
}

_RETCODE_UNSUPPORTED_FILLING = 10030

# Filling-mode fallback chain (SPEC: FOK -> IOC -> RETURN).
_FILLING_CHAIN = (
    int(getattr(mt5, "ORDER_FILLING_FOK", 0)),
    int(getattr(mt5, "ORDER_FILLING_IOC", 1)),
    int(getattr(mt5, "ORDER_FILLING_RETURN", 2)),
)

_FILLING_NAMES = {
    _FILLING_CHAIN[0]: "FOK",
    _FILLING_CHAIN[1]: "IOC",
    _FILLING_CHAIN[2]: "RETURN",
}

_DIRECTION_TR = {"buy": "ALIŞ", "sell": "SATIŞ"}

# Turkish descriptions for the common MT5 trade server return codes.
_RETCODE_TR = {
    10004: "Yeniden fiyatlama (requote)",
    10006: "İstek reddedildi",
    10007: "İstek iptal edildi",
    10008: "Emir yerleştirildi",
    10009: "İstek tamamlandı",
    10010: "İstek kısmen tamamlandı",
    10011: "İstek işleme hatası",
    10012: "İstek zaman aşımına uğradı",
    10013: "Geçersiz istek",
    10014: "Geçersiz hacim (lot)",
    10015: "Geçersiz fiyat",
    10016: "Geçersiz SL/TP seviyeleri",
    10017: "İşlem devre dışı",
    10018: "Piyasa kapalı",
    10019: "Yetersiz bakiye/teminat",
    10020: "Fiyat değişti",
    10021: "Fiyat yok",
    10022: "Geçersiz emir süresi",
    10023: "Emir durumu değişti",
    10024: "Çok sık istek gönderildi",
    10025: "İstekte değişiklik yok",
    10026: "Sunucuda otomatik işlem devre dışı",
    10027: "Terminalde otomatik işlem devre dışı (Algo Trading butonunu kontrol edin)",
    10028: "İstek işlem için kilitli",
    10029: "Emir veya pozisyon dondurulmuş",
    10030: "Desteklenmeyen doldurma (filling) modu",
    10031: "Ticaret sunucusuyla bağlantı yok",
    10032: "İşlem sadece gerçek hesaplar için izinli",
    10033: "Bekleyen emir sayısı limitine ulaşıldı",
    10034: "Sembol için emir/pozisyon hacim limiti aşıldı",
    10038: "Kapatılacak hacim mevcut pozisyon hacmini aşıyor",
    10044: "Pozisyon yalnızca tamamen kapatılabilir",
}


class Trader:
    """Sends market orders and manages open positions via MT5."""

    def __init__(self, config: "ConfigManager", mt5c: "MT5Client",
                 risk: "RiskManager", journal: "Journal") -> None:
        self.config = config
        self.mt5c = mt5c
        self.risk = risk
        self.journal = journal
        self.logger = get_logger("trader")

    # ------------------------------------------------------------------ #
    # Public API                                                         #
    # ------------------------------------------------------------------ #

    def open_trade(self, symbol: str, direction: str, lot: float | None = None,
                   sl_price: float | None = None, tp_price: float | None = None,
                   comment: str = "manual", idempotency_key: str | None = None) -> dict:
        """Open a market position. Never raises to the caller."""
        try:
            # Applies to manual panel trades too: never open a position while
            # the terminal is unauthorized or logged into the wrong account.
            guard_ok, guard_reason = self.risk.account_guard()
            if not guard_ok:
                self.logger.warning("Emir engellendi: %s", guard_reason)
                return self._fail(guard_reason)
            # The daily limit is a discipline device — it must also stop
            # manual panel trades, otherwise it can be bypassed by hand.
            limit = self.risk.check_daily_limit()
            if limit.get("hit"):
                kind = "kar hedefine ulaşıldı" if limit.get("kind") == "profit" else "zarar limiti aşıldı"
                reason = "Günlük {} ({:+.2f}) — gün sonuna kadar yeni işlem açılamaz.".format(
                    kind, float(limit.get("pnl", 0.0))
                )
                self.logger.warning("Emir engellendi: %s", reason)
                return self._fail(reason)
            can_open, open_reason = self.risk.can_open(symbol, direction)
            if not can_open:
                self.logger.warning("Emir engellendi: %s", open_reason)
                return self._fail(open_reason)
            if idempotency_key and not self.journal.reserve_order_intent(
                idempotency_key,
                {"symbol": symbol, "direction": direction, "comment": comment},
            ):
                return self._fail("Bu kapalı mum sinyali daha önce işlendi; yinelenen emir engellendi.")
            result = self._open_trade(symbol, direction, lot, sl_price, tp_price,
                                      comment, idempotency_key=idempotency_key)
            if idempotency_key:
                self.journal.complete_order_intent(
                    idempotency_key, "sent" if result.get("ok") else "rejected", result
                )
            return result
        except Exception as exc:  # defensive: order path must never raise
            if idempotency_key:
                try:
                    self.journal.complete_order_intent(
                        idempotency_key, "error", {"error": str(exc)}
                    )
                except Exception:
                    pass
            self.logger.exception("Emir gönderilirken beklenmeyen hata: %s", exc)
            return self._fail(f"Emir gönderilirken beklenmeyen hata: {exc}")

    def close_position(self, ticket: int) -> dict:
        """Close an open position by sending an opposite market order."""
        try:
            guard_ok, guard_reason = self.risk.account_guard()
            if not guard_ok:
                return self._fail(guard_reason)
            return self._close_position(int(ticket))
        except Exception as exc:
            self.logger.exception("Pozisyon kapatılırken beklenmeyen hata: %s", exc)
            return self._fail(f"Pozisyon kapatılırken beklenmeyen hata: {exc}")

    def close_all(self, symbol: str | None = None) -> dict:
        """Close every bot position (optionally only for one symbol)."""
        try:
            guard_ok, guard_reason = self.risk.account_guard()
            if not guard_ok:
                return {"ok": False, "closed": 0, "errors": [guard_reason]}
            return self._close_all(symbol)
        except Exception as exc:
            self.logger.exception("Toplu kapatma sırasında beklenmeyen hata: %s", exc)
            return {"ok": False, "closed": 0,
                    "errors": [f"Toplu kapatma sırasında beklenmeyen hata: {exc}"]}

    def modify_position(self, ticket: int, sl: float | None, tp: float | None) -> dict:
        """Modify SL/TP of an open position. None keeps the current value."""
        try:
            guard_ok, guard_reason = self.risk.account_guard()
            if not guard_ok:
                return self._fail(guard_reason)
            return self._modify_position(int(ticket), sl, tp)
        except Exception as exc:
            self.logger.exception("Pozisyon güncellenirken beklenmeyen hata: %s", exc)
            return self._fail(f"Pozisyon güncellenirken beklenmeyen hata: {exc}")

    # ------------------------------------------------------------------ #
    # Internals                                                          #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _brain_config(cfg: dict) -> dict:
        limits = cfg.get("account_limits", {}) or {}
        risk_cfg = cfg.get("risk", {}) or {}
        safety = cfg.get("safety", {}) or {}
        trade_cfg = cfg.get("trade", {}) or {}
        bridge_dir = (os.path.dirname(os.path.abspath(mt5_brain_adapter.__file__))
                      if mt5_brain_adapter is not None else _BRAIN_DIRS[0])
        shared = {}
        try:
            with open(os.path.join(bridge_dir, "config_brain.json"),
                      "r", encoding="utf-8-sig") as handle:
                loaded = json.load(handle)
            if isinstance(loaded, dict):
                shared = loaded
        except (OSError, ValueError, TypeError):
            shared = {}
        mt5_cfg = cfg.get("mt5", {}) or {}
        raw_login = mt5_cfg.get("login", 0)
        gold_login = raw_login if type(raw_login) is int and raw_login >= 0 else 0
        shared_login = shared.get("allowed_account", 0)
        if not gold_login and type(shared_login) is int and shared_login >= 0:
            gold_login = shared_login
        account_server = str(mt5_cfg.get("server") or
                             shared.get("account_server") or "").strip()
        exec_token = str(os.environ.get("BK_EXEC_TOKEN") or
                         os.environ.get("FOREX_EXEC_TOKEN") or
                         shared.get("exec_token") or "").strip()
        backend_url = str(shared.get("backend_url") or
                          cfg.get("backend_url") or "").strip()
        return {
            "central_brain_enabled": cfg.get("central_brain_enabled", True) is True,
            "brain_required": cfg.get("brain_required", True) is True,
            "risk_fail_closed": True,
            "dry_run": is_paper(cfg),
            "allowed_account": gold_login,
            "account_server": account_server,
            "backend_url": backend_url,
            "exec_token": exec_token,
            "risk_profile": str(cfg.get("risk_profile", "balanced") or "balanced"),
            "aggressive_opt_in": cfg.get("aggressive_opt_in", False) is True,
            "trade_risk_pct": float(risk_cfg.get("risk_percent", 0.25) or 0.25),
            "max_portfolio_risk_pct": float(
                limits.get("open_risk_target_percent", 1.5) or 1.5),
            "max_open_risk_pct": float(
                limits.get("open_risk_target_percent", 1.5) or 1.5),
            "hard_max_open_risk_pct": float(
                limits.get("open_risk_hard_percent", 2.0) or 2.0),
            "max_symbol_side_risk_pct": float(
                limits.get("symbol_side_risk_hard_percent", 0.5) or 0.5),
            "max_bot_risk_pct": float(
                limits.get("bot_risk_hard_percent", 0.5) or 0.5),
            "daily_entry_brake_pct": 1.5,
            "daily_loss_warning_pct_account": float(
                limits.get("daily_loss_warning_percent", 4.0) or 4.0),
            "daily_loss_flatten_pct_account": float(
                limits.get("daily_loss_flatten_percent", 4.25) or 4.25),
            "max_daily_loss_pct_account": float(
                limits.get("daily_loss_hard_percent", 4.5) or 4.5),
            "total_drawdown_warning_pct_account": float(
                limits.get("total_drawdown_warning_percent", 9.0) or 9.0),
            "total_drawdown_flatten_pct_account": float(
                limits.get("total_drawdown_flatten_percent", 9.25) or 9.25),
            "max_total_drawdown_pct_account": float(
                limits.get("total_drawdown_hard_percent", 9.5) or 9.5),
            "profit_target_pct_account": 10.0,
            "min_expected_profit_usd": float(
                limits.get("min_expected_profit_usd", 15.0) or 15.0),
            "min_initial_risk_usd": float(
                limits.get("min_initial_risk_usd", 15.0) or 15.0),
            "min_rr": float(trade_cfg.get("min_rr", 2.0) or 2.0),
            "account_tier_max_lot": min(1.0, float(
                safety.get("account_tier_max_lot", 1.0) or 1.0)),
            "deviation_points": int(trade_cfg.get("deviation", 30) or 30),
            "brain_heartbeat_path": os.path.join(bridge_dir, "account_brain_heartbeat.json"),
            "brain_state_path": os.path.join(bridge_dir, "account_brain_pretrade_state.json"),
        }

    def _open_trade(self, symbol: str, direction: str, lot: float | None,
                    sl_price: float | None, tp_price: float | None,
                    comment: str, idempotency_key: str | None = None) -> dict:
        direction = str(direction or "").strip().lower()
        if direction not in ("buy", "sell"):
            return self._fail(f"Geçersiz işlem yönü: '{direction}' (buy/sell olmalı).")

        if not self.mt5c.ensure_connected():
            return self._fail("MT5 bağlantısı yok, emir gönderilemedi.")

        info = self.mt5c.symbol_info(symbol)
        if not info:
            return self._fail(f"Sembol bilgisi alınamadı: {symbol}")

        point = float(info.get("point") or 0.0)
        digits = int(info.get("digits") or 0)
        bid = float(info.get("bid") or 0.0)
        ask = float(info.get("ask") or 0.0)
        if point <= 0 or bid <= 0 or ask <= 0:
            return self._fail(f"{symbol} için fiyat verisi alınamadı, emir gönderilemedi.")

        cfg = self.config.get()
        trade_cfg = cfg.get("trade", {}) or {}
        safety_cfg = cfg.get("safety", {}) or {}
        default_sl_points = float(trade_cfg.get("default_sl_points", 3000) or 0.0)
        default_tp_points = float(trade_cfg.get("default_tp_points", 5000) or 0.0)
        deviation = int(trade_cfg.get("deviation", 30) or 30)

        tick_age = max(0.0, time.time() - float(info.get("time") or 0.0))
        max_tick_age = float(safety_cfg.get("max_tick_age_seconds", 30) or 30)
        if not info.get("time") or tick_age > max_tick_age:
            return self._fail(
                f"{symbol} fiyatı eski ({tick_age:.1f} sn > {max_tick_age:.1f} sn), emir gönderilmedi."
            )
        mid = (bid + ask) / 2.0
        spread_bps = ((ask - bid) / mid * 10_000.0) if mid > 0 else 99999.0
        max_spread_bps = float(safety_cfg.get("max_spread_bps", 20.0) or 20.0)
        if spread_bps > max_spread_bps:
            return self._fail(
                f"{symbol} spread çok yüksek ({spread_bps:.2f} bps > {max_spread_bps:.2f} bps)."
            )

        symbol_trade_mode = int(info.get("trade_mode", 0) or 0)
        disabled = int(getattr(mt5, "SYMBOL_TRADE_MODE_DISABLED", 0))
        long_only = int(getattr(mt5, "SYMBOL_TRADE_MODE_LONGONLY", 1))
        short_only = int(getattr(mt5, "SYMBOL_TRADE_MODE_SHORTONLY", 2))
        close_only = int(getattr(mt5, "SYMBOL_TRADE_MODE_CLOSEONLY", 3))
        if symbol_trade_mode in (disabled, close_only):
            return self._fail(f"{symbol} yeni işleme kapalı (trade_mode={symbol_trade_mode}).")
        if direction == "buy" and symbol_trade_mode == short_only:
            return self._fail(f"{symbol} yalnızca satış işlemine açık.")
        if direction == "sell" and symbol_trade_mode == long_only:
            return self._fail(f"{symbol} yalnızca alış işlemine açık.")

        if direction == "buy":
            price = ask
            if sl_price is None:
                sl_price = ask - default_sl_points * point if default_sl_points > 0 else 0.0
            if tp_price is None:
                tp_price = ask + default_tp_points * point if default_tp_points > 0 else 0.0
            order_type = mt5.ORDER_TYPE_BUY
        else:
            price = bid
            if sl_price is None:
                sl_price = bid + default_sl_points * point if default_sl_points > 0 else 0.0
            if tp_price is None:
                tp_price = bid - default_tp_points * point if default_tp_points > 0 else 0.0
            order_type = mt5.ORDER_TYPE_SELL

        # Normalize prices to symbol digits (SPEC: round SL/TP to digits).
        sl = round(float(sl_price), digits) if sl_price else 0.0
        tp = round(float(tp_price), digits) if tp_price else 0.0
        price = round(float(price), digits)
        if sl <= 0:
            return self._fail("SL olmadan emir gönderilemez.")
        if direction == "buy" and (sl >= price or (tp > 0 and tp <= price)):
            return self._fail("Alış emrinde SL fiyatın altında, TP fiyatın üstünde olmalıdır.")
        if direction == "sell" and (sl <= price or (tp > 0 and tp >= price)):
            return self._fail("Satış emrinde SL fiyatın üstünde, TP fiyatın altında olmalıdır.")
        min_stop_distance = float(info.get("trade_stops_level", 0) or 0) * point
        if min_stop_distance > 0 and abs(price - sl) < min_stop_distance:
            return self._fail(
                f"SL broker minimum mesafesinden dar ({abs(price-sl):.{digits}f} < {min_stop_distance:.{digits}f})."
            )
        if tp > 0 and min_stop_distance > 0 and abs(tp - price) < min_stop_distance:
            return self._fail("TP broker minimum mesafesinden dar.")

        # Lot and account exposure are decided by the same central brain used by
        # forex/scanner/all-bots. Panel/manual calls cannot bypass this gate.
        brain_plan = None
        requested_lot = lot
        brain_cfg = self._brain_config(cfg)
        # Live mode can never use the legacy sizing path, even when a stale
        # config explicitly sets central_brain_enabled=false. Paper mode may
        # still disable it for isolated simulations.
        central_required = (not is_paper(cfg)) or bool(
            brain_cfg.get("central_brain_enabled", True))
        if central_required:
            if mt5_brain_adapter is None:
                return self._fail("Merkezi hesap beyni bulunamadi; emir fail-closed reddedildi.")
            info_obj = SimpleNamespace(**info)
            candidate = idempotency_key or "altin:%s:%s:%s:%s" % (
                MAGIC_NUMBER, symbol, direction, int(time.time() // 10))
            brain_plan = mt5_brain_adapter.evaluate(
                mt5, brain_cfg, info_obj,
                candidate_id=candidate,
                bot_id=str(MAGIC_NUMBER), symbol=symbol, direction=direction,
                timeframe="gold", entry=price, stop=sl, target=tp,
                # Gold positions expose their broker comment in snapshots;
                # use the same bounded identity in the immediate fill outbox.
                confidence=90, confirmations=1, code=str(comment)[:31],
                logger=self.logger,
            )
            if not brain_plan.allowed:
                return self._fail("Merkezi beyin emri reddetti: %s" %
                                  ", ".join(brain_plan.decision.reasons))
            if brain_plan.decision.requires_atomic_execution:
                if not mt5_brain_adapter.close_for_reversal(
                        mt5, brain_cfg, brain_plan.decision.close_tickets,
                        logger=self.logger, plan=brain_plan):
                    mt5_brain_adapter.finalize(brain_plan, False, logger=self.logger)
                    return self._fail("Ters yon oncesi eski pozisyon brokerda kapanmadi.")
            lot = brain_plan.lot
            requested_lot = None  # risk-approved dynamic lot is not a manual request
        elif lot is None:
            # Defensive legacy path only when central brain is explicitly disabled.
            sl_distance_points = abs(price - sl) / point if sl > 0 else 0.0
            lot = self.risk.compute_lot(symbol, sl_distance_points)
        volume = self._normalize_volume(info, float(lot))
        if volume <= 0:
            if brain_plan:
                mt5_brain_adapter.finalize(brain_plan, False, logger=self.logger)
            return self._fail(f"Geçersiz lot değeri: {lot}")
        if requested_lot is not None:
            # Never silently upsize an explicitly requested lot: normalization
            # only floors to the step, so a larger volume means the request
            # was below the broker's minimum and got clamped up to volume_min.
            try:
                req = float(requested_lot)
            except (TypeError, ValueError):
                req = 0.0
            max_order_lot = float(safety_cfg.get("max_manual_lot", 0.10) or 0.10)
            if req > max_order_lot:
                if brain_plan:
                    mt5_brain_adapter.finalize(brain_plan, False, logger=self.logger)
                return self._fail(
                    f"İstenen lot {req:g}, güvenlik tavanı {max_order_lot:g} üstünde."
                )
            if req > 0 and volume > req * 1.0000001:
                if brain_plan:
                    mt5_brain_adapter.finalize(brain_plan, False, logger=self.logger)
                vmin = float(info.get("volume_min") or 0.01)
                return self._fail(
                    f"İstenen lot {req:g} minimum lot {vmin:g} altında, emir gönderilmedi."
                )

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(volume),
            "type": order_type,
            "price": float(price),
            "sl": float(sl),
            "tp": float(tp),
            "deviation": deviation,
            "magic": MAGIC_NUMBER,
            "comment": str(comment)[:31],
            "type_time": mt5.ORDER_TIME_GTC,
        }

        if is_paper(cfg):
            ticket = self.journal.record_paper_open(
                symbol=symbol,
                direction=direction,
                volume=float(volume),
                open_price=float(price),
                sl=float(sl),
                tp=float(tp),
                comment=str(comment)[:31],
                cfg=cfg,
            )
            dir_tr = _DIRECTION_TR[direction]
            msg = (f"[PAPER] {symbol} {dir_tr} simule edildi: {volume:g} lot, "
                   f"fiyat {price:.{digits}f}, SL {sl:.{digits}f}, TP {tp:.{digits}f}, "
                   f"bilet #{ticket}")
            if brain_plan:
                mt5_brain_adapter.finalize(brain_plan, False, logger=self.logger)
            return self._success(msg, 0, ticket)

        if brain_plan and not mt5_brain_adapter.pre_send_check(
                mt5, brain_cfg, brain_plan, logger=self.logger):
            mt5_brain_adapter.finalize(
                brain_plan, False, logger=self.logger,
                reason="fail_closed:pre_send_gate")
            return self._fail("Merkezi beyin emir-oncesi kontrolü reddetti.")

        result = self._send_with_filling(request, allow_return=False)
        dir_tr = _DIRECTION_TR[direction]
        if result is None:
            if brain_plan:
                mt5_brain_adapter.finalize(brain_plan, False, logger=self.logger)
            err = mt5.last_error()
            return self._fail(f"{symbol} {dir_tr} emri gönderilemedi: terminal yanıt vermedi ({err}).")

        retcode = int(result.retcode)
        if retcode in _OK_RETCODES:
            ticket = int(getattr(result, "order", 0) or 0) or int(getattr(result, "deal", 0) or 0) or None
            fill_price = float(getattr(result, "price", 0.0) or 0.0) or price
            filled_volume = float(getattr(result, "volume", 0) or volume)
            msg = (f"{symbol} {dir_tr} emri gerçekleşti: {filled_volume:g} lot, "
                   f"fiyat {fill_price:.{digits}f}, SL {sl:.{digits}f}, TP {tp:.{digits}f}, "
                   f"bilet #{ticket}")
            if brain_plan:
                finalized = mt5_brain_adapter.finalize(
                    brain_plan, True, ticket=ticket, logger=self.logger,
                    fill_price=fill_price,
                    filled_volume=filled_volume)
                if not finalized:
                    self.logger.critical(
                        "BROKER DOLUMU VAR AMA BEYIN FINALIZE BASARISIZ: "
                        "symbol=%s ticket=%s lot=%s",
                        symbol, ticket, filled_volume)
            return self._success(msg, retcode, ticket)

        msg = (f"{symbol} {dir_tr} emri başarısız: "
               f"{self._retcode_text(retcode, getattr(result, 'comment', ''))}")
        if brain_plan:
            mt5_brain_adapter.finalize(brain_plan, False, logger=self.logger)
        return self._fail(msg, retcode)

    def _close_position(self, ticket: int) -> dict:
        cfg = self.config.get()
        if is_paper(cfg):
            if not self.mt5c.ensure_connected():
                return self._fail("MT5 baglantisi yok, paper pozisyon fiyatlanamadi.")
            result = self.journal.close_paper_position(
                int(ticket), mt5c=self.mt5c, reason="manual", cfg=cfg
            )
            if result.get("ok"):
                return self._success(str(result.get("message")), 0, int(ticket))
            return self._fail(str(result.get("message") or "Paper pozisyon kapatilamadi."))

        if not self.mt5c.ensure_connected():
            return self._fail("MT5 bağlantısı yok, pozisyon kapatılamadı.")

        positions = self.mt5c.positions(magic=MAGIC_NUMBER)
        pos = next((p for p in positions if int(p.get("ticket", 0)) == ticket), None)
        if pos is None:
            return self._fail(f"Pozisyon bulunamadı: #{ticket}")

        symbol = pos["symbol"]
        volume = float(pos["volume"])
        direction = str(pos.get("direction", "")).lower()

        info = self.mt5c.symbol_info(symbol)
        if not info:
            return self._fail(f"Sembol bilgisi alınamadı: {symbol}")
        digits = int(info.get("digits") or 0)
        bid = float(info.get("bid") or 0.0)
        ask = float(info.get("ask") or 0.0)
        if bid <= 0 or ask <= 0:
            return self._fail(f"{symbol} için fiyat verisi alınamadı, pozisyon kapatılamadı.")

        # Opposite market order closes the position (request carries the ticket).
        if direction == "buy":
            order_type = mt5.ORDER_TYPE_SELL
            price = bid
        else:
            order_type = mt5.ORDER_TYPE_BUY
            price = ask

        cfg = self.config.get()
        deviation = int((cfg.get("trade", {}) or {}).get("deviation", 30) or 30)

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "position": ticket,
            "price": round(float(price), digits),
            "deviation": deviation,
            "magic": MAGIC_NUMBER,
            "comment": "close",
            "type_time": mt5.ORDER_TIME_GTC,
        }

        result = self._send_with_filling(request)
        if result is None:
            err = mt5.last_error()
            return self._fail(f"#{ticket} pozisyonu kapatılamadı: terminal yanıt vermedi ({err}).")

        retcode = int(result.retcode)
        if retcode in _OK_RETCODES:
            if self._position_absent(ticket):
                msg = f"Pozisyon kapatıldı: #{ticket} ({symbol}, {volume:g} lot)"
                return self._success(msg, retcode, ticket)
            filled = float(getattr(result, "volume", 0) or 0)
            return self._fail(
                f"#{ticket} kapanış dolumu tam kapanış değil: retcode={retcode}, "
                f"dolum={filled:g} lot; pozisyon brokerda hâlâ açık.",
                retcode,
            )

        msg = (f"#{ticket} pozisyonu kapatılamadı: "
               f"{self._retcode_text(retcode, getattr(result, 'comment', ''))}")
        return self._fail(msg, retcode)

    def _close_all(self, symbol: str | None) -> dict:
        cfg = self.config.get()
        if is_paper(cfg):
            if not self.mt5c.ensure_connected():
                return {"ok": False, "closed": 0, "errors": ["MT5 baglantisi yok, paper pozisyonlar fiyatlanamadi."]}
            result = self.journal.close_all_paper(
                mt5c=self.mt5c, symbol=symbol, reason="manual", cfg=cfg
            )
            summary = f"Paper toplu kapatma: {result.get('closed', 0)} pozisyon kapatildi."
            if result.get("errors"):
                summary += " Hatalar: " + "; ".join(result.get("errors") or [])
            self._record("order" if result.get("ok") else "error", summary)
            return result

        if not self.mt5c.ensure_connected():
            return {"ok": False, "closed": 0, "errors": ["MT5 bağlantısı yok, pozisyonlar kapatılamadı."]}

        positions = self.mt5c.positions(magic=MAGIC_NUMBER)
        if symbol:
            positions = [p for p in positions if p.get("symbol") == symbol]

        closed = 0
        errors: list[str] = []
        for pos in positions:
            res = self.close_position(int(pos["ticket"]))
            if res.get("ok"):
                closed += 1
            else:
                errors.append(f"#{pos['ticket']}: {res.get('message', 'bilinmeyen hata')}")

        ok = len(errors) == 0
        if positions:
            summary = f"Toplu kapatma tamamlandı: {closed}/{len(positions)} pozisyon kapatıldı."
            if errors:
                summary += f" Hatalar: {'; '.join(errors)}"
            self.logger.info(summary)
            self._record("order" if ok else "error", summary)
        else:
            self.logger.info("Kapatılacak açık pozisyon yok.")
        return {"ok": ok, "closed": closed, "errors": errors}

    def _modify_position(self, ticket: int, sl: float | None, tp: float | None) -> dict:
        if sl is None and tp is None:
            return self._fail("SL veya TP değerlerinden en az biri verilmelidir.")

        cfg = self.config.get()
        if is_paper(cfg):
            result = self.journal.modify_paper_position(int(ticket), sl, tp)
            if result.get("ok"):
                return self._success(str(result.get("message")), 0, int(ticket))
            return self._fail(str(result.get("message") or "Paper pozisyon guncellenemedi."))

        if not self.mt5c.ensure_connected():
            return self._fail("MT5 bağlantısı yok, pozisyon güncellenemedi.")

        positions = self.mt5c.positions(magic=MAGIC_NUMBER)
        pos = next((p for p in positions if int(p.get("ticket", 0)) == ticket), None)
        if pos is None:
            return self._fail(f"Pozisyon bulunamadı: #{ticket}")

        symbol = pos["symbol"]
        info = self.mt5c.symbol_info(symbol)
        if not info:
            return self._fail(f"Sembol bilgisi alınamadı: {symbol}")
        digits = int(info.get("digits") or 0)

        sl_val = round(float(sl), digits) if sl is not None else float(pos.get("sl") or 0.0)
        tp_val = round(float(tp), digits) if tp is not None else float(pos.get("tp") or 0.0)

        request = {
            "action": mt5.TRADE_ACTION_SLTP,
            "symbol": symbol,
            "position": ticket,
            "sl": float(sl_val),
            "tp": float(tp_val),
            "magic": MAGIC_NUMBER,
        }

        result = self._check_and_send(request)
        if result is None:
            err = mt5.last_error()
            return self._fail(f"#{ticket} pozisyonu güncellenemedi: terminal yanıt vermedi ({err}).")

        retcode = int(result.retcode)
        if retcode in _OK_RETCODES:
            msg = (f"Pozisyon güncellendi: #{ticket} ({symbol}) "
                   f"SL {sl_val:.{digits}f}, TP {tp_val:.{digits}f}")
            return self._success(msg, retcode, ticket)

        msg = (f"#{ticket} pozisyonu güncellenemedi: "
               f"{self._retcode_text(retcode, getattr(result, 'comment', ''))}")
        return self._fail(msg, retcode)

    # ------------------------------------------------------------------ #
    # Helpers                                                            #
    # ------------------------------------------------------------------ #

    def _position_absent(self, ticket: int, attempts: int = 5,
                         delay_seconds: float = 0.10) -> bool:
        """A successful close retcode is final only after the ticket disappears."""
        total_attempts = max(1, int(attempts))
        for attempt in range(total_attempts):
            try:
                with MT5_API_LOCK:
                    raw = mt5.positions_get()
            except Exception as exc:  # pragma: no cover - defensive
                self.logger.error("Kapanış doğrulaması positions_get hatası: %s", exc)
                return False
            if raw is None:
                self.logger.error(
                    "Kapanış doğrulanamadı: positions_get None (%s)", mt5.last_error())
                return False
            if not any(int(getattr(p, "ticket", 0) or 0) == int(ticket) for p in raw):
                return True
            if attempt + 1 < total_attempts:
                time.sleep(max(0.0, float(delay_seconds)))
        return False


    def _send_with_filling(self, request: dict, allow_return: bool = True) -> Any:
        """Run order_check, then send; try supported filling modes in order."""
        result = None
        modes = _FILLING_CHAIN if allow_return else _FILLING_CHAIN[:-1]
        for mode in modes:
            req = dict(request)
            req["type_filling"] = mode
            checked = self._order_check(req)
            if int(getattr(checked, "retcode", -1)) != 0:
                result = checked
                if int(getattr(checked, "retcode", -1)) == _RETCODE_UNSUPPORTED_FILLING:
                    continue
                return result
            with MT5_API_LOCK:
                result = mt5.order_send(req)
            if result is None:
                self.logger.error("order_send yanıt vermedi (mod %s): %s",
                                  _FILLING_NAMES.get(mode, mode), mt5.last_error())
                return None
            if int(result.retcode) == _RETCODE_UNSUPPORTED_FILLING:
                self.logger.info("Doldurma modu %s desteklenmiyor, sonraki mod deneniyor.",
                                 _FILLING_NAMES.get(mode, mode))
                continue
            return result
        return result

    def _order_check(self, request: dict) -> Any:
        """Normalize an MT5 order_check response into a result-like object."""
        try:
            with MT5_API_LOCK:
                checked = mt5.order_check(request)
        except Exception as exc:  # pragma: no cover - defensive
            return SimpleNamespace(retcode=-1, comment=f"order_check hatası: {exc}", order=0, deal=0, price=0.0)
        if checked is None:
            return SimpleNamespace(
                retcode=-1,
                comment=f"order_check yanıt vermedi: {mt5.last_error()}",
                order=0,
                deal=0,
                price=0.0,
            )
        retcode = int(getattr(checked, "retcode", -1))
        if retcode == 0:
            return checked
        return SimpleNamespace(
            retcode=retcode,
            comment="order_check reddi: " + str(getattr(checked, "comment", "")),
            order=0,
            deal=0,
            price=0.0,
        )

    def _check_and_send(self, request: dict) -> Any:
        checked = self._order_check(request)
        if int(getattr(checked, "retcode", -1)) != 0:
            return checked
        try:
            with MT5_API_LOCK:
                return mt5.order_send(request)
        except Exception as exc:  # pragma: no cover - defensive
            return SimpleNamespace(retcode=-1, comment=f"order_send hatası: {exc}", order=0, deal=0, price=0.0)

    @staticmethod
    def _normalize_volume(info: dict, lot: float) -> float:
        """Floor lot to volume_step and clamp to [volume_min, volume_max]."""
        if not math.isfinite(lot) or lot <= 0:
            return 0.0
        vmin = float(info.get("volume_min") or 0.01)
        vmax = float(info.get("volume_max") or 100.0)
        step = float(info.get("volume_step") or 0.01)
        if step > 0:
            lot = math.floor((lot + 1e-9) / step) * step
        lot = max(vmin, min(vmax, lot))
        # Round to the decimal precision implied by the step to avoid
        # floating point artifacts like 0.30000000000000004.
        step_str = ("%.8f" % step).rstrip("0")
        decimals = len(step_str.split(".")[1]) if "." in step_str and step_str.split(".")[1] else 0
        return round(lot, decimals)

    @staticmethod
    def _retcode_text(retcode: int, server_comment: str = "") -> str:
        desc = _RETCODE_TR.get(retcode)
        if not desc:
            desc = server_comment or "Bilinmeyen hata"
        elif server_comment:
            desc = f"{desc} [{server_comment}]"
        return f"{desc} (kod {retcode})"

    def _record(self, kind: str, message: str) -> None:
        try:
            self.journal.record_event(kind, message)
        except Exception as exc:  # journal must never break trading
            self.logger.error("Olay kaydedilemedi: %s", exc)

    def _success(self, message: str, retcode: int, ticket: int | None) -> dict:
        self.logger.info(message)
        self._record("order", message)
        return {"ok": True, "retcode": retcode, "ticket": ticket, "message": message}

    def _fail(self, message: str, retcode: int = -1) -> dict:
        self.logger.error(message)
        self._record("error", message)
        return {"ok": False, "retcode": retcode, "ticket": None, "message": message}
