"""Background trading engine.

Runs as a daemon thread. Every loop iteration:
  1. Ensures the MT5 connection is alive.
  2. Syncs the journal (30 days on the first successful sync, 2 days later).
  3. Checks the daily P/L limit and handles it once per local day.
  4. If auto-trading is enabled and no limit is hit, evaluates each enabled
     symbol with its assigned strategy (new-bar gated) and opens trades.
  5. Publishes a thread-safe, JSON-serializable status snapshot.

Every iteration is wrapped in try/except so the loop never dies.
"""

from __future__ import annotations

import copy
import numbers
import threading
from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from core.config import MAGIC_NUMBER
from core.execution import is_paper, mode as execution_mode
from core.logger import get_logger
from strategies import registry

if TYPE_CHECKING:
    from core.config import ConfigManager
    from core.journal import Journal
    from core.mt5_client import MT5Client
    from core.risk import RiskManager
    from core.trader import Trader

_DIRECTION_TR = {"buy": "ALIŞ", "sell": "SATIŞ"}

_DEFAULT_POLL_SECONDS = 5.0


def _json_safe(value: Any) -> Any:
    """Convert a value tree into plain JSON-serializable Python types.

    numpy scalars, pandas timestamps, datetimes etc. are cast to
    float/int/str so status() output can always be serialized.
    """
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, int):
        return int(value)
    if isinstance(value, float):
        return float(value)
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    # numpy scalar types expose .item() returning the native Python value
    item = getattr(value, "item", None)
    if callable(item):
        try:
            return _json_safe(value.item())
        except Exception:
            pass
    if isinstance(value, numbers.Integral):
        return int(value)
    if isinstance(value, numbers.Real):
        return float(value)
    return str(value)


class Engine(threading.Thread):
    """Trading loop thread. Always running; ``engine.enabled`` in the config
    only gates signal -> order execution."""

    def __init__(self, config: "ConfigManager", mt5c: "MT5Client",
                 risk: "RiskManager", trader: "Trader", journal: "Journal") -> None:
        super().__init__(daemon=True, name="Engine")
        self.config = config
        self.mt5c = mt5c
        self.risk = risk
        self.trader = trader
        self.journal = journal
        self.logger = get_logger("engine")

        self._stop_event = threading.Event()
        self._lock = threading.RLock()

        self._first_sync_done = False
        self._limit_handled = False
        self._limit_date: date = datetime.now().date()
        self._last_bar_times: dict = {}   # (symbol, timeframe) -> last seen bar time
        self._last_signals: dict = {}     # symbol -> {"direction","reason","time"}
        self._last_recorded_decisions: dict = {}
        self._loop_errors = 0
        self._warned_strategies: set[str] = set()

        self._status: dict = {
            "connected": False,
            "engine_enabled": False,
            "limit": {"hit": False, "kind": None, "action": "",
                      "pnl": 0.0, "limit": 0.0, "handled": False},
            "account": {},
            "terminal": {},
            "account_guard": {
                "ok": False,
                "reason": "MT5 durum bilgisi bekleniyor; yeni işlemler engelli.",
            },
            "symbols": {},
            "market_health": {"ready": False, "rows": [], "blockers": ["Piyasa verisi bekleniyor."]},
            "daily": {"closed": 0.0, "floating": 0.0, "total": 0.0},
            "active_strategy": "",
            "strategy_assignments": {},
            "execution_mode": "mt5",
            "last_signals": {},
            "last_loop": "",
            "loop_errors": 0,
        }

    # ------------------------------------------------------------------ #
    # Thread control                                                     #
    # ------------------------------------------------------------------ #

    def run(self) -> None:
        self.logger.info("Motor başlatıldı (arka plan iş parçacığı).")
        while not self._stop_event.is_set():
            try:
                self._iterate()
            except Exception as exc:
                with self._lock:
                    self._loop_errors += 1
                    self._status["loop_errors"] = self._loop_errors
                self.logger.exception("Motor döngüsünde hata: %s", exc)
                try:
                    self.journal.record_event("error", f"Motor döngüsünde hata: {exc}")
                except Exception:
                    pass
            self._stop_event.wait(self._poll_seconds())
        self.logger.info("Motor durduruldu.")

    def stop(self) -> None:
        """Signal the loop to exit cleanly."""
        self._stop_event.set()

    def status(self) -> dict:
        """Thread-safe snapshot for the web API (plain JSON types only)."""
        with self._lock:
            return copy.deepcopy(self._status)

    def preflight(self, check_account: bool = True) -> dict:
        """Validate strategy configuration and optionally the live account.

        ``check_account=False`` is intentionally MT5-free and is used by the
        panel. Enabling the loop while MT5 is reconnecting is safe because
        every actual order still performs the fresh account guard.
        """
        cfg = self.config.get()
        if check_account:
            guard_ok, guard_reason = self.risk.account_guard()
        else:
            snapshot_guard = self.status().get("account_guard") or {}
            guard_ok = bool(snapshot_guard.get("ok", False))
            guard_reason = str(snapshot_guard.get("reason") or "")
        active_name = str((cfg.get("strategy") or {}).get("active", "") or "")
        assignments = self._strategy_assignments(cfg, active_name)
        runnable: list[dict] = []
        blocked: list[dict] = []
        for key, strategy_names in assignments.items():
            broker_symbol = str((cfg.get("symbols") or {}).get(key) or key)
            for strategy_name in strategy_names:
                allowed, reason = self._strategy_allowed_for_symbol(cfg, key, strategy_name)
                if allowed and check_account and not guard_ok:
                    allowed = False
                    reason = guard_reason
                if allowed:
                    try:
                        strategy = registry.get(strategy_name)
                    except Exception:
                        allowed = False
                        reason = f"Strateji bulunamadi: {strategy_name}"
                    else:
                        supported = getattr(strategy, "symbols", None)
                        if supported is not None and key not in supported:
                            allowed = False
                            reason = f"Strateji bu sembolu desteklemiyor: {strategy_name} -> {key}"
                row = {
                    "symbol_key": key,
                    "symbol": broker_symbol,
                    "strategy": strategy_name,
                }
                if allowed:
                    runnable.append({**row, "ok": True})
                else:
                    blocked.append({**row, "ok": False, "reason": reason})
        return {
            "ok": bool(runnable) and (guard_ok or not check_account),
            "account_check_performed": bool(check_account),
            "account_guard": {"ok": guard_ok, "reason": guard_reason},
            "active_strategy": active_name,
            "execution_mode": execution_mode(cfg),
            "assignments": assignments,
            "runnable": runnable,
            "blocked": blocked,
        }

    # ------------------------------------------------------------------ #
    # Loop body                                                          #
    # ------------------------------------------------------------------ #

    def _iterate(self) -> None:
        now = datetime.now()

        # Reset the daily-limit "handled" flag when the local date changes.
        today = now.date()
        if today != self._limit_date:
            self._limit_date = today
            self._limit_handled = False
            self.logger.info("Yeni gün başladı, günlük limit bayrağı sıfırlandı.")

        cfg = self.config.get()
        engine_enabled = bool((cfg.get("engine") or {}).get("enabled", False))
        active_name = str((cfg.get("strategy") or {}).get("active", "") or "")
        assignments = self._strategy_assignments(cfg, active_name)
        exec_mode = execution_mode(cfg)

        # 1. Connection
        if not self.mt5c.ensure_connected():
            self._merge_status({
                "connected": False,
                "engine_enabled": engine_enabled,
                "account": {},
                "terminal": {},
                "account_guard": {
                    "ok": False,
                    "reason": "MT5 bağlantısı bekleniyor; yeni işlemler engelli.",
                },
                "market_health": {
                    "ready": False,
                    "rows": [],
                    "blockers": ["MT5 bağlantısı yok; sembol ve mum verisi okunamıyor."],
                },
                "active_strategy": active_name,
                "strategy_assignments": assignments,
                "execution_mode": exec_mode,
                "last_loop": now.isoformat(timespec="seconds"),
            })
            return

        # 2. Journal sync: full 30 days once, then a cheap 2-day refresh.
        # Only mark the full backfill as done when sync reports success, so
        # a transient failure on the first iteration is retried with days=30.
        try:
            if is_paper(cfg):
                self.journal.update_paper_positions(self.mt5c, cfg)
            else:
                ok = self.journal.sync(self.mt5c, days=30 if not self._first_sync_done else 2)
                if ok:
                    self._first_sync_done = True
        except Exception as exc:
            self.logger.error("İşlem günlüğü senkronizasyon hatası: %s", exc)

        # 3. Daily limit
        limit = self.risk.check_daily_limit()
        limit_hit = bool(limit.get("hit"))
        if limit_hit and not self._limit_handled:
            self._handle_limit(limit)

        # Resolved broker symbol names (cached inside MT5Client).
        symbols_map: dict = {}
        try:
            symbols_map = self.mt5c.resolve_symbols() or {}
        except Exception as exc:
            self.logger.error("Sembol çözümleme hatası: %s", exc)
        market_health = self._market_health(cfg, symbols_map, assignments)

        # 4. Strategy step. When the engine is enabled we run it every loop so
        # exit management (manage(), e.g. structural CHoCH closes) keeps working
        # even while a daily limit blocks NEW entries. Entries stay gated by the
        # daily limit via `entries_allowed`.
        if engine_enabled:
            self._process_symbols(cfg, active_name, symbols_map, now,
                                  entries_allowed=not limit_hit)

        # 5. Status snapshot
        account: dict = {}
        terminal: dict = {}
        try:
            if is_paper(cfg):
                account = self.journal.paper_account(self.mt5c, cfg)
                terminal = {"connected": True, "trade_allowed": True}
            else:
                account = self.mt5c.account_info() or {}
                terminal = self.mt5c.terminal_status() or {}
        except Exception as exc:
            self.logger.error("Hesap bilgisi alınamadı: %s", exc)

        try:
            guard_ok, guard_reason = self.risk.account_guard_snapshot(account, terminal)
        except Exception as exc:
            guard_ok, guard_reason = False, f"Hesap güvenlik kontrolü okunamadı: {exc}"

        daily = {"closed": 0.0, "floating": 0.0, "total": 0.0}
        try:
            daily = self.risk.daily_pnl()
        except Exception as exc:
            self.logger.error("Günlük K/Z hesaplanamadı: %s", exc)

        self._merge_status({
            "connected": True,
            "engine_enabled": engine_enabled,
            "limit": {**limit, "handled": self._limit_handled},
            "account": account,
            "terminal": terminal,
            "account_guard": {"ok": guard_ok, "reason": guard_reason},
            "symbols": symbols_map,
            "market_health": market_health,
            "daily": daily,
            "active_strategy": active_name,
            "strategy_assignments": assignments,
            "execution_mode": exec_mode,
            "last_signals": dict(self._last_signals),
            "last_loop": now.isoformat(timespec="seconds"),
        })

    def _handle_limit(self, limit: dict) -> None:
        """One-shot handling of a freshly hit daily limit."""
        kind = limit.get("kind")
        pnl = float(limit.get("pnl") or 0.0)
        action = str(limit.get("action") or "")

        if kind == "profit":
            base = f"Günlük kar limiti aşıldı ({pnl:+.2f})."
        else:
            base = f"Günlük zarar limiti aşıldı ({pnl:+.2f})."
        if action == "close_all_stop":
            msg = base + " Tüm işlemler kapatılıyor."
        else:
            msg = base + " Yeni işlemler durduruldu."

        self.logger.warning(msg)
        try:
            self.journal.record_event("limit", msg)
        except Exception:
            pass

        if action == "close_all_stop":
            result = self.trader.close_all()
            self.logger.info("Günlük limit: %s pozisyon kapatıldı.", result.get("closed", 0))
            for err in result.get("errors") or []:
                self.logger.error("Günlük limit kapatma hatası: %s", err)

        self._limit_handled = True

    def _market_health(self, cfg: dict, symbols_map: dict, assignments: dict) -> dict:
        """Publish whether at least one verified symbol has fresh broker data.

        This closes a dangerous observability gap where strategy preflight was
        green although the resolved symbol was disabled or returned no rates.
        The fresh account/order guard remains authoritative for actual orders.
        """
        enabled_map = (cfg.get("symbols") or {}).get("enabled") or {}
        configured = cfg.get("symbols") or {}
        max_tick_age = int((cfg.get("safety") or {}).get("max_tick_age_seconds", 30) or 30)
        rows: list[dict] = []

        for key, enabled in enabled_map.items():
            if not enabled:
                continue
            names = assignments.get(str(key), [])
            if not names:
                rows.append({
                    "symbol_key": str(key),
                    "symbol": str(configured.get(key) or key),
                    "strategy": "",
                    "ok": False,
                    "reason": "Bu sembol için atanmış strateji yok.",
                })
                continue

            broker_symbol = str(symbols_map.get(key) or "")
            for strategy_name in names:
                row = {
                    "symbol_key": str(key),
                    "symbol": broker_symbol or str(configured.get(key) or key),
                    "strategy": str(strategy_name),
                    "ok": False,
                    "reason": "",
                }
                if not broker_symbol:
                    row["reason"] = "Brokerda seçilebilir sembol bulunamadı."
                    rows.append(row)
                    continue

                info_getter = getattr(self.mt5c, "symbol_info", None)
                info = info_getter(broker_symbol) if callable(info_getter) else {}
                if info is None:
                    row["reason"] = "Sembol bilgisi alınamadı."
                    rows.append(row)
                    continue
                trade_mode = int((info or {}).get("trade_mode", 4) or 0)
                if trade_mode not in (1, 2, 4):
                    row["reason"] = f"Sembol yeni işleme kapalı (trade_mode={trade_mode})."
                    rows.append(row)
                    continue

                try:
                    strategy = registry.get(str(strategy_name))
                    timeframe = str(strategy.entry_timeframe(self._strategy_params(cfg, strategy)))
                except Exception as exc:
                    row["reason"] = f"Strateji/zaman dilimi okunamadı: {exc}"
                    rows.append(row)
                    continue

                rates = self.mt5c.get_rates(broker_symbol, timeframe, 2)
                if rates is None or len(rates) == 0:
                    row["timeframe"] = timeframe
                    row["reason"] = f"{timeframe} mum verisi alınamadı."
                    rows.append(row)
                    continue

                tick_getter = getattr(self.mt5c, "tick", None)
                tick = tick_getter(broker_symbol) if callable(tick_getter) else None
                if callable(tick_getter):
                    tick_time = float((tick or {}).get("time", 0) or 0)
                    tick_age = max(0.0, datetime.now().timestamp() - tick_time) if tick_time else float("inf")
                    row["tick_age_seconds"] = round(tick_age, 1) if tick_age != float("inf") else None
                    if not tick or tick_age > max_tick_age:
                        row["timeframe"] = timeframe
                        row["last_bar"] = str(rates["time"].iloc[-1])
                        row["reason"] = "Canlı fiyat eski veya alınamıyor; piyasanın açılması bekleniyor."
                        rows.append(row)
                        continue

                row.update({
                    "ok": True,
                    "timeframe": timeframe,
                    "last_bar": str(rates["time"].iloc[-1]),
                    "reason": "Piyasa verisi hazır; yeni mum/sinyal bekleniyor.",
                })
                rows.append(row)

        blockers = list(dict.fromkeys(str(row.get("reason") or "") for row in rows if not row.get("ok")))
        return {"ready": any(bool(row.get("ok")) for row in rows), "rows": rows, "blockers": blockers}

    def _process_symbols(self, cfg: dict, active_name: str,
                         symbols_map: dict, now: datetime,
                         entries_allowed: bool = True) -> None:
        enabled_map = (cfg.get("symbols") or {}).get("enabled") or {}
        assignments = self._strategy_assignments(cfg, active_name)
        for key in enabled_map.keys():
            if not enabled_map.get(key, False):
                continue
            broker_symbol = symbols_map.get(key)
            if not broker_symbol:
                configured_symbol = str((cfg.get("symbols") or {}).get(key) or key)
                for strategy_name in assignments.get(str(key), []):
                    self._publish_decision(
                        configured_symbol, strategy_name, "none",
                        "Brokerda seçilebilir ve işlemsel sembol bulunamadı.",
                        now, persist=True,
                    )
                continue
            for strategy_name in assignments.get(str(key), []):
                allowed, reason = self._strategy_allowed_for_symbol(cfg, str(key), strategy_name)
                if not allowed:
                    self._publish_decision(
                        str(broker_symbol), strategy_name, "none", reason,
                        now, persist=True,
                    )
                    continue
                strategy = self._get_strategy(strategy_name)
                if strategy is None:
                    continue
                params = self._strategy_params(cfg, strategy)
                supported = getattr(strategy, "symbols", None)
                if supported is not None and key not in supported:
                    self._publish_decision(
                        str(broker_symbol), strategy_name, "none",
                        "Strateji bu sembolu desteklemiyor", now, persist=True,
                    )
                    continue
                try:
                    self._process_symbol(str(broker_symbol), strategy, params, now,
                                         entries_allowed=entries_allowed)
                except Exception as exc:
                    with self._lock:
                        self._loop_errors += 1
                        self._status["loop_errors"] = self._loop_errors
                    self.logger.exception("%s %s sinyal isleme hatasi: %s",
                                          broker_symbol, strategy_name, exc)

    def _strategy_assignments(self, cfg: dict, active_name: str) -> dict:
        """Return effective strategy names for each enabled logical symbol."""
        strategy_cfg = cfg.get("strategy") or {}
        raw_assignments = strategy_cfg.get("assignments") or {}
        enabled_map = (cfg.get("symbols") or {}).get("enabled") or {}
        out: dict[str, list[str]] = {}
        for key, enabled in enabled_map.items():
            if not enabled:
                continue
            raw = raw_assignments.get(key)
            if isinstance(raw, list):
                names = [str(item).strip() for item in raw if str(item).strip()]
            elif raw:
                names = [str(raw).strip()]
            else:
                names = [str(active_name).strip()] if active_name else []
            # Stable de-duplication keeps the user's priority order.
            deduped = list(dict.fromkeys(name for name in names if name))
            if deduped:
                out[str(key)] = deduped
        return out

    def _strategy_params(self, cfg: dict, strategy: Any) -> dict:
        """Merge strategy defaults with config overrides for one strategy."""
        params = copy.deepcopy(getattr(strategy, "default_params", {}) or {})
        overrides = ((cfg.get("strategy") or {}).get("params") or {}).get(strategy.name) or {}
        if isinstance(overrides, dict):
            params.update(overrides)
        return params

    def _strategy_allowed_for_symbol(self, cfg: dict, key: str,
                                     strategy_name: str) -> tuple[bool, str]:
        """Gate strategy/symbol pairs to combinations proven by backtest."""
        strategy_cfg = cfg.get("strategy") or {}
        if bool(strategy_cfg.get("allow_unverified", False)):
            return True, ""
        verified = strategy_cfg.get("verified_assignments") or {}
        allowed = verified.get(key)
        candidates = strategy_cfg.get("candidate_assignments") or {}
        candidate_names = {
            str(item) for item in candidates.get(key, [])
        } if isinstance(candidates.get(key), list) else set()
        if strategy_name in candidate_names:
            return False, (
                f"{key} icin '{strategy_name}' aday/izleme listesinde; "
                "stabilite onayi olmadigi icin uretim izni yok"
            )
        if not isinstance(allowed, list) or not allowed:
            return False, (
                f"{key} icin dogrulanmis strateji yok; allow_unverified=false"
            )
        if strategy_name in {str(item) for item in allowed}:
            return True, ""
        return False, (
            f"{key} icin '{strategy_name}' backtest ile dogrulanmadi; "
            f"izin verilenler: {', '.join(str(item) for item in allowed)}"
        )

    def _strategy_positions(self, symbol: str, strategy_name: str) -> "list[dict]":
        """Our open positions on `symbol` that belong to `strategy_name`
        (order comment "tm|<name>")."""
        out = []
        try:
            if is_paper(self.config.get()):
                return self.journal.paper_positions(
                    mt5c=self.mt5c, symbol=symbol, strategy=strategy_name
                )
            for pos in self.mt5c.positions(magic=MAGIC_NUMBER) or []:
                if str(pos.get("symbol", "")) != symbol:
                    continue
                comment = str(pos.get("comment", "") or "")
                if comment == "tm|" + strategy_name:
                    out.append(pos)
        except Exception as exc:
            self.logger.warning("%s pozisyonları okunamadı: %s", symbol, exc)
        return out

    def _apply_manage_actions(self, symbol: str, actions: "list[dict]") -> None:
        """Apply exit-management actions returned by a strategy's manage()."""
        for act in actions or []:
            try:
                kind = str(act.get("action", "") or "").lower()
                ticket = int(act.get("ticket", 0) or 0)
                reason = str(act.get("reason", "") or "")
                if ticket == 0:
                    continue
                if kind == "close":
                    result = self.trader.close_position(ticket)
                    ok = bool(result.get("ok"))
                    msg = f"{symbol} #{ticket} yönetim kapatması: {reason}"
                    self.logger.info(msg) if ok else self.logger.warning(
                        "%s #%d kapatılamadı: %s", symbol, ticket, result.get("message"))
                    if ok:
                        try:
                            self.journal.record_event("order", msg)
                        except Exception:
                            pass
                elif kind == "modify":
                    result = self.trader.modify_position(
                        ticket, act.get("sl"), act.get("tp"))
                    if bool(result.get("ok")):
                        try:
                            self.journal.record_event(
                                "order", f"{symbol} #{ticket} SL/TP güncellendi: {reason}")
                        except Exception:
                            pass
            except Exception as exc:
                self.logger.exception("%s yönetim aksiyonu hatası: %s", symbol, exc)

    def _process_symbol(self, symbol: str, strategy: Any, params: dict,
                        now: datetime, entries_allowed: bool = True) -> None:
        timeframe = str(strategy.entry_timeframe(params))

        # New-bar gate: only act when a new bar has opened on the strategy's
        # entry timeframe.
        bar_time = self._latest_bar_time(symbol, timeframe)
        if bar_time is None:
            self._publish_decision(
                symbol, str(strategy.name), "none",
                f"{timeframe} mum verisi alınamadı; sembol/terminal bağlantısı kontrol ediliyor.",
                now, timeframe=timeframe, persist=True,
            )
            return
        # First observation after startup only primes the gate: the current
        # bar's signal may be up to a full timeframe old (e.g. re-firing on a
        # cross that already played out before a restart), so wait for the
        # first genuinely new bar before analyzing.
        gate_key = (symbol, str(strategy.name), timeframe)
        prev = self._last_bar_times.get(gate_key)
        self._last_bar_times[gate_key] = bar_time
        if prev is None:
            self._publish_decision(
                symbol, str(strategy.name), "none",
                f"İlk {timeframe} mum gözlemi kaydedildi; bir sonraki yeni mumda analiz başlayacak.",
                now, timeframe=timeframe, bar_time=bar_time, persist=True,
            )
            return
        if prev == bar_time:
            return

        # Exit management runs first and ALWAYS (even under a daily limit) —
        # closing a losing/reversing position is always allowed.
        positions = self._strategy_positions(symbol, str(strategy.name))
        if positions:
            try:
                actions = strategy.manage(symbol, self.mt5c, params, positions)
            except Exception as exc:
                actions = []
                self.logger.exception("%s manage() hatası: %s", symbol, exc)
            self._apply_manage_actions(symbol, actions)

        # Entries are gated by the daily limit.
        if not entries_allowed:
            self._publish_decision(
                symbol, str(strategy.name), "none",
                "Günlük risk limiti aktif; yeni girişler durduruldu.",
                now, timeframe=timeframe, bar_time=bar_time, persist=True,
            )
            return

        signal = strategy.analyze(symbol, self.mt5c, params)
        direction = str(getattr(signal, "direction", "none") or "none").lower()
        reason = str(getattr(signal, "reason", "") or "")

        self._publish_decision(
            symbol, str(strategy.name), direction, reason or "Strateji giriş koşulları oluşmadı.",
            now, timeframe=timeframe, bar_time=bar_time,
            persist=direction not in ("buy", "sell"),
        )

        if direction not in ("buy", "sell"):
            return

        dir_tr = _DIRECTION_TR.get(direction, direction)
        try:
            self.journal.record_event("signal", f"{symbol} {dir_tr} sinyali: {reason}")
        except Exception:
            pass

        ok, deny_reason = self.risk.can_open(symbol, direction)
        if not ok:
            msg = f"{symbol} {dir_tr} sinyali atlandı: {deny_reason}"
            self.logger.info(msg)
            try:
                self.journal.record_event("info", msg)
            except Exception:
                pass
            return

        result = self.trader.open_trade(
            symbol,
            direction,
            lot=None,
            sl_price=getattr(signal, "sl_price", None),
            tp_price=getattr(signal, "tp_price", None),
            comment="tm|" + str(strategy.name),
            idempotency_key="{}|{}|{}|{}|{}|{}".format(
                int(((self.config.get().get("mt5") or {}).get("login", 0) or 0)),
                symbol,
                str(strategy.name),
                timeframe,
                bar_time,
                direction,
            ),
        )
        if not result.get("ok"):
            self.logger.warning("%s otomatik emir başarısız: %s",
                                symbol, result.get("message"))

    # ------------------------------------------------------------------ #
    # Helpers                                                            #
    # ------------------------------------------------------------------ #

    def _get_strategy(self, name: str) -> Any:
        strategy = None
        try:
            strategy = registry.get(name)
        except Exception:
            strategy = None
        if strategy is None:
            if name not in self._warned_strategies:
                self._warned_strategies.add(name)
                msg = (f"Aktif strateji bulunamadı: '{name}'. "
                       f"Otomatik işlem sinyalleri üretilemiyor.")
                self.logger.error(msg)
                try:
                    self.journal.record_event("error", msg)
                except Exception:
                    pass
        else:
            self._warned_strategies.discard(name)
        return strategy

    @staticmethod
    def _signal_key(symbol: str, strategy_name: str) -> str:
        return f"{symbol}/{strategy_name}"

    def _publish_decision(self, symbol: str, strategy_name: str, direction: str,
                          reason: str, now: datetime, timeframe: str = "",
                          bar_time: str | None = None, persist: bool = False) -> None:
        """Expose every gate decision and persist only changed/new-bar reasons."""
        key = self._signal_key(symbol, strategy_name)
        row = {
            "symbol": symbol,
            "strategy": strategy_name,
            "direction": direction,
            "reason": reason,
            "time": now.isoformat(timespec="seconds"),
            "timeframe": timeframe,
            "bar_time": bar_time,
        }
        marker = (direction, reason, timeframe, bar_time)
        should_persist = False
        with self._lock:
            self._last_signals[key] = row
            if persist and self._last_recorded_decisions.get(key) != marker:
                self._last_recorded_decisions[key] = marker
                should_persist = True
        if should_persist:
            message = f"{symbol} {strategy_name}: {reason}"
            self.logger.info(message)
            try:
                self.journal.record_event("decision", message)
            except Exception:
                pass

    def _latest_bar_time(self, symbol: str, timeframe: str) -> str | None:
        """Open time of the newest (possibly forming) bar, as a string."""
        df = self.mt5c.get_rates(symbol, timeframe, 2)
        if df is None or len(df) == 0:
            return None
        return str(df["time"].iloc[-1])

    def _poll_seconds(self) -> float:
        try:
            poll = float((self.config.get().get("engine") or {})
                         .get("poll_seconds", _DEFAULT_POLL_SECONDS))
        except Exception:
            poll = _DEFAULT_POLL_SECONDS
        if not poll or poll <= 0:
            poll = _DEFAULT_POLL_SECONDS
        return min(max(poll, 1.0), 300.0)

    def _merge_status(self, fields: dict) -> None:
        with self._lock:
            self._status.update(_json_safe(fields))
            self._status["loop_errors"] = self._loop_errors
