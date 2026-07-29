"""Risk management: lot sizing, daily P/L tracking and trade permission gates."""

from __future__ import annotations

import math
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation, ROUND_FLOOR
from typing import TYPE_CHECKING

from core.config import MAGIC_NUMBER
from core.execution import is_paper, require_demo_account
from core.logger import get_logger

if TYPE_CHECKING:  # pragma: no cover - only for type hints
    from core.config import ConfigManager
    from core.journal import Journal
    from core.mt5_client import MT5Client


class RiskManager:
    """Computes lot sizes and enforces position/daily-limit rules."""

    def __init__(self, config: "ConfigManager", mt5c: "MT5Client", journal: "Journal"):
        self._config = config
        self._mt5c = mt5c
        self._journal = journal
        self._log = get_logger("risk")

    # ------------------------------------------------------------------ #
    # balance & point value
    # ------------------------------------------------------------------ #
    def account_balance(self) -> float:
        """Configured override if > 0, otherwise the live MT5 balance."""
        cfg = self._config.get()
        try:
            override = float(cfg.get("account", {}).get("size_override", 0.0) or 0.0)
        except (TypeError, ValueError):
            override = 0.0
        if override > 0:
            return override
        if is_paper(cfg):
            try:
                account = self._journal.paper_account(self._mt5c, cfg)
                return float(account.get("balance", 0.0) or 0.0)
            except Exception as exc:
                self._log.warning("Paper bakiye okunamadi: %s", exc)
                return 0.0
        info = self._mt5c.account_info()
        if not info:
            return 0.0
        try:
            return float(info.get("balance", 0.0) or 0.0)
        except (TypeError, ValueError):
            return 0.0

    def point_value_per_lot(self, symbol: str) -> float:
        """Account-currency value of a 1-point move with 1.0 lot."""
        info = self._mt5c.symbol_info(symbol)
        if not info:
            return 0.0
        try:
            tick_value = float(info.get("trade_tick_value", 0.0) or 0.0)
            tick_size = float(info.get("trade_tick_size", 0.0) or 0.0)
            point = float(info.get("point", 0.0) or 0.0)
        except (TypeError, ValueError):
            return 0.0
        if tick_size <= 0 or tick_value <= 0 or point <= 0:
            return 0.0
        value = tick_value / tick_size * point
        return value if math.isfinite(value) else 0.0

    # ------------------------------------------------------------------ #
    # lot sizing
    # ------------------------------------------------------------------ #
    @staticmethod
    def _floor_to_step(lot: float, vmin: float, vmax: float, vstep: float) -> float:
        """Floor `lot` to the volume step and clamp into [vmin, vmax].

        Never returns NaN/inf — falls back to vmin on any numeric problem.
        """
        if not math.isfinite(lot) or lot <= 0:
            return vmin
        try:
            step_d = Decimal(str(vstep))
            if step_d <= 0:
                step_d = Decimal("0.01")
            lot_d = (Decimal(str(lot)) / step_d).to_integral_value(rounding=ROUND_FLOOR) * step_d
            floored = float(lot_d)
        except (InvalidOperation, ValueError, OverflowError):
            return vmin
        if not math.isfinite(floored):
            return vmin
        if floored < vmin:
            return vmin
        if floored > vmax:
            try:
                vmax_d = (Decimal(str(vmax)) / step_d).to_integral_value(rounding=ROUND_FLOOR) * step_d
                capped = float(vmax_d)
            except (InvalidOperation, ValueError, OverflowError):
                capped = vmax
            if not math.isfinite(capped) or capped < vmin:
                return vmin
            return capped
        return floored

    def compute_lot(self, symbol: str, sl_points: float) -> float:
        """Lot size per config: fixed manual lot or %-risk based auto lot."""
        cfg = self._config.get()
        risk_cfg = cfg.get("risk", {})
        info = self._mt5c.symbol_info(symbol)
        if not info:
            self._log.warning("Lot hesaplanamadı: %s sembol bilgisi alınamadı; emir atlanacak.", symbol)
            return 0.0

        def _num(key: str, fallback: float) -> float:
            try:
                value = float(info.get(key, 0.0) or 0.0)
            except (TypeError, ValueError):
                return fallback
            return value if math.isfinite(value) and value > 0 else fallback

        vmin = _num("volume_min", 0.01)
        vmax = _num("volume_max", 100.0)
        vstep = _num("volume_step", 0.01)
        try:
            safety_cap = float((cfg.get("safety", {}) or {}).get("max_manual_lot", 0.10) or 0.10)
        except (TypeError, ValueError):
            safety_cap = 0.10
        vmax = min(vmax, max(vmin, safety_cap))
        if vmax < vmin:
            vmax = vmin

        lot_mode = str(risk_cfg.get("lot_mode", "auto") or "auto").lower()
        if lot_mode == "manual":
            try:
                manual_lot = float(risk_cfg.get("manual_lot", vmin) or vmin)
            except (TypeError, ValueError):
                manual_lot = vmin
            if manual_lot < vmin or manual_lot > vmax:
                self._log.warning("Manuel lot güvenlik sınırı dışında: %.4f (izin %.4f-%.4f)", manual_lot, vmin, vmax)
                return 0.0
            return self._floor_to_step(manual_lot, vmin, vmax, vstep)

        # auto mode
        try:
            sl_pts = float(sl_points)
        except (TypeError, ValueError):
            sl_pts = 0.0
        if not math.isfinite(sl_pts) or sl_pts <= 0:
            return 0.0
        balance = self.account_balance()
        point_value = self.point_value_per_lot(symbol)
        if balance <= 0 or point_value <= 0:
            return 0.0
        try:
            risk_percent = float(risk_cfg.get("risk_percent", 1.0) or 0.0)
        except (TypeError, ValueError):
            risk_percent = 0.0
        if risk_percent <= 0:
            return 0.0
        risk_amount = balance * risk_percent / 100.0
        denominator = sl_pts * point_value
        if denominator <= 0 or not math.isfinite(denominator):
            return 0.0
        lot = risk_amount / denominator
        if lot < vmin:
            self._log.warning(
                "%s için güvenli risk lotu %.6f broker minimumu %.6f altında; emir atlanacak.",
                symbol, lot, vmin,
            )
            return 0.0
        return self._floor_to_step(lot, vmin, vmax, vstep)

    # ------------------------------------------------------------------ #
    # daily P/L & limits
    # ------------------------------------------------------------------ #
    def daily_pnl(self) -> dict:
        """Realized + floating P/L for the current local calendar day."""
        if not self._mt5c.is_connected():
            return {"closed": 0.0, "floating": 0.0, "total": 0.0}

        cfg = self._config.get()
        if is_paper(cfg):
            try:
                return self._journal.paper_daily_pnl(self._mt5c)
            except Exception as exc:
                self._log.warning("Paper gunluk K/Z hesaplanamadi: %s", exc)
                return {"closed": 0.0, "floating": 0.0, "total": 0.0}

        midnight = datetime.combine(date.today(), time.min)
        closed = 0.0
        try:
            # Fetch without a magic filter: a bot position closed manually in
            # the terminal produces a closing deal with magic 0, which would
            # otherwise be invisible to the daily loss limit. Bot positions
            # are identified by their opening ("in") deal carrying our magic.
            deals = self._mt5c.history_deals(
                midnight, datetime.now() + timedelta(hours=12), magic=None
            ) or []

            def _magic(deal: dict) -> int:
                try:
                    return int(deal.get("magic", 0) or 0)
                except (TypeError, ValueError):
                    return 0

            bot_pids = {
                deal.get("position_id")
                for deal in deals
                if str(deal.get("entry", "")) == "in" and _magic(deal) == MAGIC_NUMBER
            }
            for deal in deals:
                if _magic(deal) != MAGIC_NUMBER and deal.get("position_id") not in bot_pids:
                    continue
                entry = str(deal.get("entry", ""))
                if entry == "in":
                    # opening deals carry no P/L, but commission-based accounts
                    # charge the entry commission/fee on the "in" deal — that is
                    # money already deducted, so it belongs in the daily total
                    keys = ("commission", "fee")
                elif entry in ("out", "out_by", "inout"):
                    # "out_by" (close by) and "inout" (netting reversal) deals
                    # also realize P/L, not only plain "out" deals.
                    keys = ("profit", "commission", "swap", "fee")
                else:
                    continue
                for key in keys:
                    try:
                        closed += float(deal.get(key, 0.0) or 0.0)
                    except (TypeError, ValueError):
                        continue
        except Exception as exc:
            self._log.warning("Günlük kapanan işlem verisi alınamadı: %s", exc)

        floating = 0.0
        try:
            for pos in self._mt5c.positions(magic=MAGIC_NUMBER) or []:
                for key in ("profit", "swap"):
                    try:
                        floating += float(pos.get(key, 0.0) or 0.0)
                    except (TypeError, ValueError):
                        continue
        except Exception as exc:
            self._log.warning("Açık pozisyon verisi alınamadı: %s", exc)

        closed = round(closed, 2)
        floating = round(floating, 2)
        return {"closed": closed, "floating": floating, "total": round(closed + floating, 2)}

    def check_daily_limit(self) -> dict:
        """Check the configured daily loss/profit limits against today's P/L."""
        cfg = self._config.get()
        limit_cfg = cfg.get("risk", {}).get("daily_limit", {})
        enabled = bool(limit_cfg.get("enabled", False))
        action = str(limit_cfg.get("action", "close_all_stop") or "close_all_stop")

        def _limit_value(key: str) -> float:
            try:
                value = float(limit_cfg.get(key, 0.0) or 0.0)
            except (TypeError, ValueError):
                return 0.0
            return value if math.isfinite(value) else 0.0

        max_loss = _limit_value("max_loss")
        max_profit = _limit_value("max_profit")
        total = self.daily_pnl()["total"]

        result = {"hit": False, "kind": None, "action": action, "pnl": total, "limit": 0.0}
        if not enabled:
            return result
        if max_loss > 0 and total <= -max_loss:
            result.update({"hit": True, "kind": "loss", "limit": -max_loss})
        elif max_profit > 0 and total >= max_profit:
            result.update({"hit": True, "kind": "profit", "limit": max_profit})
        return result

    # ------------------------------------------------------------------ #
    # permission gate
    # ------------------------------------------------------------------ #
    def account_guard(self) -> tuple[bool, str]:
        """Verify the terminal has an authorized account and, when a login is
        pinned in config (mt5.login > 0), that it is the expected one."""
        cfg = self._config.get()
        if is_paper(cfg):
            return True, ""
        acc = self._mt5c.account_info()
        terminal = self._mt5c.terminal_status() if acc else {}
        return self._validate_account_snapshot(cfg, acc, terminal)

    def account_guard_snapshot(
        self,
        account: dict | None,
        terminal: dict | None,
    ) -> tuple[bool, str]:
        """Validate an already-read engine snapshot without calling MT5.

        The web panel uses this pure path so a long MT5 history read cannot
        freeze status rendering or the start/stop controls. Live order paths
        continue to call :meth:`account_guard`, which performs fresh checks.
        """
        return self._validate_account_snapshot(
            self._config.get(), account or {}, terminal or {}
        )

    @staticmethod
    def _validate_account_snapshot(
        cfg: dict,
        acc: dict | None,
        terminal: dict | None,
    ) -> tuple[bool, str]:
        if is_paper(cfg):
            return True, ""
        try:
            login = int((acc or {}).get("login", 0) or 0)
        except (TypeError, ValueError):
            login = 0
        if login <= 0:
            return False, "MT5 hesabı yetkilendirilmemiş (terminalde oturum açık değil), işlem yapılamaz."
        if require_demo_account(cfg):
            trade_mode = str((acc or {}).get("trade_mode_label") or "").lower()
            if trade_mode != "demo":
                return False, (
                    "MT5 demo hesap zorunlu; bagli hesap modu '{}' gorunuyor, "
                    "islem engellendi."
                ).format(trade_mode or "unknown")
        if not bool((acc or {}).get("trade_allowed", False)):
            return False, "Bağlı MT5 hesabında işlem izni kapalı."
        if not bool((acc or {}).get("trade_expert", False)):
            return False, "Bağlı MT5 hesabında otomatik/Expert işlem izni kapalı."
        raw_expected = (cfg.get("mt5", {}) or {}).get("login", 0)
        if type(raw_expected) is not int or raw_expected <= 0:
            return False, "Canli mod literal mt5.login hesap kilidi gerektirir."
        expected = raw_expected
        if login != expected:
            return False, "YANLIŞ HESAP: bağlı hesap {} ama bot {} numaralı hesaba kilitli — işlem engellendi.".format(
                login, expected
            )
        expected_server = str((cfg.get("mt5", {}) or {}).get("server", "") or "").strip()
        actual_server = str((acc or {}).get("server", "") or "").strip()
        if not expected_server:
            return False, "Canli mod mt5.server hesap kilidi gerektirir."
        if expected_server and actual_server.casefold() != expected_server.casefold():
            return False, "YANLIŞ SUNUCU: bağlı sunucu '{}' ama bot '{}' sunucusuna kilitli.".format(
                actual_server or "unknown", expected_server
            )
        terminal = terminal or {}
        if not terminal.get("connected"):
            return False, "MT5 terminali işlem sunucusuna bağlı değil."
        if not terminal.get("trade_allowed"):
            return False, "MT5 terminalinde Algo Trading kapalı; işlem engellendi."
        margin = float((acc or {}).get("margin", 0.0) or 0.0)
        margin_level = float((acc or {}).get("margin_level", 0.0) or 0.0)
        min_margin = float((cfg.get("safety", {}) or {}).get("min_margin_level_percent", 200.0) or 200.0)
        if margin > 0 and margin_level > 0 and margin_level < min_margin:
            return False, "Margin seviyesi çok düşük: %{:.1f} < %{:.1f}.".format(
                margin_level, min_margin
            )
        return True, ""

    def can_open(self, symbol: str, direction: str | None = None) -> tuple[bool, str]:
        """Whether a new position may be opened on `symbol` right now."""
        if not self._mt5c.is_connected():
            return False, "MT5 bağlantısı yok, yeni işlem açılamaz."

        guard_ok, guard_reason = self.account_guard()
        if not guard_ok:
            return False, guard_reason

        limit = self.check_daily_limit()
        if limit["hit"]:
            if limit["kind"] == "loss":
                return False, "Günlük zarar limiti aşıldı ({:+.2f}), yeni işlem açılamaz.".format(limit["pnl"])
            return False, "Günlük kar hedefine ulaşıldı ({:+.2f}), yeni işlem açılamaz.".format(limit["pnl"])

        cfg = self._config.get()
        risk_cfg = cfg.get("risk", {})
        try:
            max_open = int(risk_cfg.get("max_open_positions", 2) or 0)
        except (TypeError, ValueError):
            max_open = 2
        try:
            max_per_symbol = int(risk_cfg.get("max_positions_per_symbol", 1) or 0)
        except (TypeError, ValueError):
            max_per_symbol = 1

        try:
            if is_paper(cfg):
                positions = self._journal.paper_positions(self._mt5c) or []
            else:
                positions = self._mt5c.positions(magic=MAGIC_NUMBER) or []
        except Exception as exc:
            self._log.warning("Pozisyonlar okunamadı: %s", exc)
            return False, "Pozisyon bilgisi alınamadı, yeni işlem açılamaz."

        wanted_direction = str(direction or "").strip().lower()
        if wanted_direction == "long":
            wanted_direction = "buy"
        elif wanted_direction == "short":
            wanted_direction = "sell"
        allow_atomic_reversal = (
            cfg.get("central_brain_enabled", True) is True
            and wanted_direction in ("buy", "sell"))
        if allow_atomic_reversal:
            positions_for_capacity = [
                p for p in positions
                if not (str(p.get("symbol", "")) == symbol
                        and str(p.get("direction", "")).strip().lower()
                        in ("buy", "sell")
                        and str(p.get("direction", "")).strip().lower()
                        != wanted_direction)
            ]
        else:
            positions_for_capacity = positions

        if len(positions_for_capacity) >= max_open:
            return False, "Maksimum açık işlem sayısına ulaşıldı ({}/{}).".format(len(positions_for_capacity), max_open)

        on_symbol = sum(1 for p in positions_for_capacity if str(p.get("symbol", "")) == symbol)
        if on_symbol >= max_per_symbol:
            return False, "{} için sembol başına maksimum pozisyon sayısına ulaşıldı ({}/{}).".format(
                symbol, on_symbol, max_per_symbol
            )
        return True, ""
