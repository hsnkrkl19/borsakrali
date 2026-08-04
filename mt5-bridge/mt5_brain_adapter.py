#!/usr/bin/env python3
"""MT5 -> account_brain adapter shared by every order-opening bridge."""

from __future__ import annotations

import json
import math
import os
import time
import uuid
from dataclasses import dataclass, replace

import account_brain
import trade_guard
import requests


HERE = os.path.dirname(os.path.abspath(__file__))
STATE_PATH = os.path.join(HERE, "account_brain_pretrade_state.json")
HEARTBEAT_PATH = os.path.join(HERE, "account_brain_heartbeat.json")
# AI konseyi tavsiyesi (ai_council.py yazar; beyin YALNIZ kisma yonunde okur).
ADVISORY_PATH = os.path.join(HERE, "ai_advisory.json")
EVENT_OUTBOX_PATH = os.path.join(HERE, "account_brain_event_outbox.json")
STOP_MASTER = os.path.join(HERE, "STOP_MASTER")


@dataclass
class BrainPlan:
    decision: account_brain.PreTradeDecision
    controller: account_brain.AccountBrain | None
    candidate_id: str
    cfg: dict | None = None
    metadata: dict | None = None

    @property
    def allowed(self):
        return bool(self.decision.allowed)

    @property
    def lot(self):
        return float(self.decision.lot or 0.0)


def enabled(cfg):
    # Production configs are merged with a central_brain_enabled key.  An
    # explicit false may disable the brain only in paper/dry-run; live mode is
    # always routed through the shared gate.
    # Every value other than the literal JSON boolean true is potentially
    # live to the bridges (missing/0/null/false are falsy there). Route all of
    # them through the central gate; neither an omitted key nor malformed type
    # can unlock a legacy live order path.
    if cfg.get("dry_run") is not True:
        return True
    return cfg.get("central_brain_enabled") is True


def _value(cfg, *names, default=None):
    for name in names:
        if cfg.get(name) is not None:
            return cfg.get(name)
    return default


def _allowed_account(cfg):
    """Return a literal non-negative login; never coerce strings/bools."""
    value = (cfg or {}).get("allowed_account", 0)
    if type(value) is not int or value < 0:
        raise ValueError("allowed_account must be a non-negative JSON integer")
    return value


def _bounded(value, default, low, high):
    try:
        value = float(value)
    except (TypeError, ValueError):
        value = float(default)
    return max(float(low), min(float(high), value))


def build_config(cfg):
    """Map old/new config spellings while never widening a hard safety cap."""
    profile = str(_value(cfg, "risk_profile", default="balanced") or "balanced").lower()
    if profile not in ("balanced", "aggressive"):
        raise ValueError("risk_profile must be balanced or aggressive")
    raw_opt_in = _value(cfg, "aggressive_opt_in", default=False)
    if not isinstance(raw_opt_in, bool):
        raise ValueError("aggressive_opt_in must be a literal JSON boolean")
    opt_in = raw_opt_in is True
    explicit_risk = _value(cfg, "trade_risk_pct", "per_trade_risk_pct", default=None)
    if explicit_risk is None:
        if profile == "aggressive":
            explicit_risk = _value(cfg, "risk_pct", "risk_pct_max", default=0.50)
        else:
            explicit_risk = _value(cfg, "risk_pct", "risk_pct_max", default=0.25)
    if profile == "aggressive":
        trade_risk = _bounded(explicit_risk, 0.50, 0.50, 1.00)
    else:
        trade_risk = _bounded(explicit_risk, 0.25, 0.10, 0.25)

    daily_warning = _bounded(
        _value(cfg, "daily_loss_warning_pct_account", "daily_flatten_warning_pct", default=4.0),
        4.0, 0.1, 4.0)
    daily_flatten = _bounded(
        _value(cfg, "daily_loss_flatten_pct_account", "daily_flatten_pct", default=4.25),
        4.25, daily_warning + 0.01, 4.49)
    total_warning = _bounded(
        _value(cfg, "total_drawdown_warning_pct_account", "total_flatten_warning_pct", default=9.0),
        9.0, 0.1, 9.0)
    total_flatten = _bounded(
        _value(cfg, "total_drawdown_flatten_pct_account", "total_flatten_pct", default=9.25),
        9.25, total_warning + 0.01, 9.49)
    # User policy floor: entries target at least 3R; a config can only demand
    # more (4R/5R), never less.  Only the dedicated brain_min_rr key feeds the
    # brain — the bridges' local min_rr is a staleness filter with different
    # semantics and must not silently raise the brain policy.
    requested_rr = _bounded(
        _value(cfg, "brain_min_rr", default=3.0), 3.0, 3.0, 5.0)
    min_rr = 5.0 if requested_rr >= 5.0 else 4.0 if requested_rr >= 4.0 else 3.0

    return account_brain.BrainConfig(
        risk_profile=profile,
        aggressive_opt_in=opt_in,
        race_mode=(cfg.get("race_mode") is True),
        trade_risk_pct=trade_risk,
        max_portfolio_risk_pct=_bounded(
            _value(cfg, "max_portfolio_risk_pct", default=1.5), 1.5, 0.01, 2.0),
        max_open_risk_pct=_bounded(
            _value(cfg, "max_open_risk_pct", "max_account_open_risk_pct", default=1.5),
            1.5, 0.01, 2.0),
        hard_max_open_risk_pct=_bounded(
            _value(cfg, "hard_max_open_risk_pct", default=2.0), 2.0, 0.01, 2.0),
        max_symbol_side_risk_pct=_bounded(
            _value(cfg, "max_symbol_side_risk_pct", "max_symbol_direction_risk_pct", default=0.5),
            0.5, 0.01, 0.5),
        max_bot_risk_pct=_bounded(
            _value(cfg, "max_bot_risk_pct", "max_bot_open_risk_pct", default=0.5),
            0.5, 0.01, 0.5),
        daily_entry_brake_pct=_bounded(
            _value(cfg, "daily_entry_brake_pct", default=1.5), 1.5, 0.01, 1.5),
        daily_loss_warning_pct_account=daily_warning,
        daily_loss_flatten_pct_account=daily_flatten,
        max_daily_loss_pct_account=_bounded(
            _value(cfg, "max_daily_loss_pct_account", "daily_hard_limit_pct", default=4.5),
            4.5, daily_flatten + 0.01, 4.5),
        total_drawdown_warning_pct_account=total_warning,
        total_drawdown_flatten_pct_account=total_flatten,
        max_total_drawdown_pct_account=_bounded(
            _value(cfg, "max_total_drawdown_pct_account", "total_hard_limit_pct", default=9.5),
            9.5, total_flatten + 0.01, 9.5),
        # User hard requirement; a config cannot silently move this target.
        profit_target_pct_account=10.0,
        min_expected_profit_usd=max(15.0, float(_value(
            cfg, "min_expected_profit_usd", "min_expected_pnl_usd", default=15.0))),
        min_initial_risk_usd=max(15.0, float(_value(
            cfg, "min_initial_risk_usd", default=15.0))),
        # Islem basina mutlak dolar tavani: config yalniz DUSURebilir.
        max_trade_risk_usd=_bounded(
            _value(cfg, "max_trade_risk_usd", default=250.0), 250.0, 15.0, 250.0),
        race_max_open_risk_pct=_bounded(
            _value(cfg, "race_max_open_risk_pct", default=3.0), 3.0, 0.5, 3.0),
        min_rr=min_rr,
        min_feed_rr=_bounded(
            _value(cfg, "min_feed_rr", default=1.5), 1.5, 0.0, 3.0),
        reversal_confirmation_min=_bounded(
            _value(cfg, "reversal_confirmation_min", default=0.85), 0.85, 0.5, 1.0),
        reversal_hysteresis=_bounded(
            _value(cfg, "reversal_hysteresis", default=0.15), 0.15, 0.0, 0.99),
        reversal_confirmations=max(1, int(_value(cfg, "reversal_confirmations", default=2))),
        reversal_observation_window_seconds=max(1.0, float(_value(
            cfg, "reversal_observation_window_seconds", "reversal_window_seconds", default=30))),
        reversal_cooldown_seconds=max(1.0, float(_value(
            cfg, "reversal_cooldown_seconds", default=15))),
        heartbeat_max_age_seconds=_bounded(_value(
            cfg, "heartbeat_max_age_seconds", "brain_heartbeat_max_age_seconds", default=10),
            10.0, 2.0, 10.0),
        reservation_ttl_seconds=max(10.0, float(_value(
            cfg, "reservation_ttl_seconds", default=120))),
        profit_giveback_activation_r=max(0.1, float(_value(
            cfg, "profit_giveback_activation_r", default=1.0))),
        max_profit_giveback_fraction=_bounded(
            _value(cfg, "max_profit_giveback_fraction", default=0.25), 0.25, 0.05, 0.9),
        volatility_exit_multiple=max(1.01, float(_value(
            cfg, "volatility_exit_multiple", default=2.0))),
        volatility_adverse_r=max(0.0, float(_value(
            cfg, "volatility_adverse_r", default=0.25))),
    )


def _load_heartbeat(path):
    try:
        with open(path, "r", encoding="utf-8-sig") as fh:
            value = json.load(fh)
        return value if isinstance(value, dict) else None
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None


def _reject(reason, candidate_id, cfg=None, metadata=None, report=False):
    decision = account_brain.PreTradeDecision(
        False, account_brain.DecisionAction.REJECT, (reason,))
    plan = BrainPlan(decision, None, candidate_id, cfg=cfg, metadata=metadata)
    if report:
        _post_decision(plan, False, reason)
    return plan


def _backend_base(cfg):
    base = str((cfg or {}).get("backend_url") or "").rstrip("/")
    if "://borsakrali.com" in base:
        base = base.replace("://borsakrali.com", "://www.borsakrali.com", 1)
    return base


def _backend_ready(cfg):
    """Authenticate immediately before a live order; never trust stale boot state."""
    token = str((cfg or {}).get("exec_token") or "").strip()
    base = _backend_base(cfg or {})
    if not token or not base:
        return False
    try:
        response = requests.get(
            base + "/api/bridge/ready",
            headers={"Authorization": "Bearer " + token},
            timeout=5, allow_redirects=False)
        if response.status_code != 200:
            return False
        payload = response.json()
        return isinstance(payload, dict) and payload.get("ready") is True
    except Exception:
        return False


def _lifecycle_report_fresh(heartbeat, max_age, now=None):
    if not isinstance(heartbeat, dict):
        return False
    value = heartbeat.get("lastReportSuccessSec")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    value = float(value)
    now = float(time.time() if now is None else now)
    return math.isfinite(value) and 0 <= now - value <= float(max_age)


def _lifecycle_report_max_age(cfg):
    """Lifecycle delivery freshness is distinct from process heartbeat age."""
    return _bounded(_value(
        cfg or {}, "lifecycle_report_max_age_seconds", default=30),
        30.0, 15.0, 300.0)


def _stop_path(cfg):
    return str(_value(cfg or {}, "stop_master_path", default=STOP_MASTER))


def _runtime_path(cfg, config_key, canonical):
    """Live bridges share one canonical brain; path overrides are paper/test only."""
    if (cfg or {}).get("dry_run") is True:
        return str(_value(cfg or {}, config_key, default=canonical))
    return str(canonical)


def _stop_active(cfg, heartbeat=None):
    # A configurable mirror may only add a stop location; it can never hide
    # the package's canonical kill switch.
    return (
        os.path.exists(STOP_MASTER)
        or os.path.exists(_stop_path(cfg))
        or bool(isinstance(heartbeat, dict)
                and heartbeat.get("stopMaster") is True)
    )


def _decision_row(plan, accepted, reason, ticket=None):
    meta = plan.metadata or {}
    return {
        "id": "%s:%s" % (plan.candidate_id, "accepted" if accepted else "rejected"),
        "decisionId": "%s:%s" % (plan.candidate_id, int(time.time() * 1000)),
        "code": meta.get("code") or plan.candidate_id,
        "magic": meta.get("magic"),
        "botId": meta.get("bot_id"),
        "symbol": meta.get("symbol"),
        "direction": meta.get("direction"),
        "accepted": bool(accepted),
        "status": "accepted" if accepted else "rejected",
        "reason": str(reason or ("broker-confirmed" if accepted else "rejected"))[:180],
        "lot": plan.lot,
        "riskUsd": float(plan.decision.risk_usd or 0),
        "ticket": str(ticket or ""),
        "account": int(meta.get("account") or 0),
        "accountLogin": int(meta.get("account") or 0),
        "server": str(meta.get("server") or ""),
    }


def _post_decision(plan, accepted, reason, ticket=None):
    cfg = plan.cfg or {}
    token = str(cfg.get("exec_token") or "")
    base = _backend_base(cfg)
    if not token or not base:
        return False
    row = _decision_row(plan, accepted, reason, ticket=ticket)
    try:
        response = requests.post(
            base + "/api/bridge/state", json={"decisions": [row]},
            headers={"Authorization": "Bearer " + token}, timeout=8,
            allow_redirects=False,
        )
        return response.status_code == 200
    except Exception:
        return False


def _event_outbox_path(cfg):
    return _runtime_path(cfg or {}, "broker_event_outbox_path", EVENT_OUTBOX_PATH)


def _broker_open_payload(plan, ticket, fill_price=None, filled_volume=None):
    meta = plan.metadata or {}
    ticket_text = str(ticket or "").strip()
    if not ticket_text:
        return None
    entry = float(fill_price or meta.get("entry") or 0)
    volume = float(filled_volume or plan.lot or 0)
    if entry <= 0 or volume <= 0:
        return None
    row = {
        "ticket": ticket_text,
        "positionTicket": ticket_text,
        "account": int(meta.get("account") or 0),
        "accountLogin": int(meta.get("account") or 0),
        "server": str(meta.get("server") or ""),
        "code": meta.get("code") or plan.candidate_id,
        "magic": meta.get("magic"),
        "botId": meta.get("bot_id"),
        "symbol": meta.get("symbol"),
        "direction": meta.get("direction"),
        "lot": volume,
        "entryPrice": entry,
        "sl": float(meta.get("sl") or 0),
        "tp": float(meta.get("tp") or 0),
        "openedSec": int(meta.get("opened_sec") or time.time()),
        "brokerConfirmed": True,
        "closeBeforeOpenTickets": list(meta.get("close_before_open_tickets") or ()),
    }
    return {
        "source": "broker-fill-outbox",
        "account": int(meta.get("account") or 0),
        "server": str(meta.get("server") or ""),
        "open": [row],
        "decisions": [_decision_row(
            plan, True, "broker_order_confirmed", ticket=ticket_text)],
    }


def _queue_broker_open(plan, ticket, fill_price=None, filled_volume=None):
    """Durably record the real fill before attempting Telegram/backend I/O."""
    cfg = plan.cfg or {}
    try:
        payload = _broker_open_payload(
            plan, ticket, fill_price=fill_price, filled_volume=filled_volume)
        if payload is None:
            return False
        ticket_text = str(ticket or "").strip()
        meta = plan.metadata or {}
        event_id = "open:%s:%s:%s:%s" % (
            int(meta.get("account") or 0), str(meta.get("server") or ""),
            ticket_text, plan.candidate_id)
        event = {
            "id": event_id,
            "createdSec": int(time.time()),
            "payload": payload,
        }
        store = account_brain.JsonStateStore(_event_outbox_path(cfg))

        def update(state):
            events = state.get("events", {})
            if not isinstance(events, dict):
                raise account_brain.StateStoreError("event outbox is not an object")
            events[event_id] = event
            state["events"] = events
            return state, True

        return bool(store.transact(update))
    except Exception:
        return False


def _post_broker_open_direct(plan, ticket, fill_price=None, filled_volume=None):
    """Last-resort delivery when local persistence itself is unavailable."""
    cfg = plan.cfg or {}
    token = str(cfg.get("exec_token") or "")
    base = _backend_base(cfg)
    try:
        payload = _broker_open_payload(
            plan, ticket, fill_price=fill_price, filled_volume=filled_volume)
        if payload is None or not token or not base:
            return False
        response = requests.post(
            base + "/api/bridge/state", json=payload,
            headers={"Authorization": "Bearer " + token}, timeout=8,
            allow_redirects=False,
        )
        return response.status_code == 200
    except Exception:
        return False


def _activate_close_only_stop(cfg, reason):
    """Latch a canonical risk STOP without overwriting a manual text STOP."""
    value = {
        "createdSec": int(time.time()),
        "reason": str(reason or "broker-lifecycle-integrity-failure")[:240],
        "source": "broker-lifecycle-integrity",
        "closeOnly": True,
        "emergencyFlatten": True,
        "resume": "Pozisyonlar brokerda sifirlanip insan incelemesi yapilmadan DEVAM etmeyin.",
    }
    canonical_ok = False
    for path in dict.fromkeys((STOP_MASTER, _stop_path(cfg or {}))):
        should_write = not os.path.exists(path)
        if os.path.exists(path):
            # Preserve manual plaintext STOP semantics.  A legacy JSON risk
            # latch with only one required literal boolean is unmistakably a
            # risk STOP and is atomically upgraded to the full contract.
            try:
                with open(path, "r", encoding="utf-8-sig") as fh:
                    existing = json.load(fh)
                if not isinstance(existing, dict):
                    continue
                close_only = existing.get("closeOnly") is True
                flatten = existing.get("emergencyFlatten") is True
                if close_only and flatten:
                    canonical_ok = canonical_ok or path == STOP_MASTER
                    continue
                if close_only or flatten:
                    value = dict(existing, **value)
                    should_write = True
                else:
                    continue
            except Exception:
                # Invalid JSON/plaintext is a manual STOP and is never replaced.
                continue
        if not should_write:
            continue
        tmp = "%s.%s.tmp" % (path, os.getpid())
        try:
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(value, fh, ensure_ascii=False, indent=2)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, path)
            canonical_ok = canonical_ok or path == STOP_MASTER
        except OSError:
            try:
                os.unlink(tmp)
            except OSError:
                pass
    return canonical_ok


def broker_event_outbox_count(cfg):
    try:
        state = account_brain.JsonStateStore(_event_outbox_path(cfg)).read()
        events = state.get("events", {})
        return len(events) if isinstance(events, dict) else 10 ** 9
    except Exception:
        return 10 ** 9


def _broker_event_outbox_ready(cfg, logger=None):
    """Flush older fills and fail closed while any broker fact is unresolved."""
    count = broker_event_outbox_count(cfg)
    if count:
        flush_broker_event_outbox(cfg, logger=logger)
        count = broker_event_outbox_count(cfg)
    if count and count >= 10 ** 9 and not (cfg or {}).get("dry_run", True):
        _activate_close_only_stop(cfg or {}, "broker-open-outbox-unreadable")
    return count == 0, count


def flush_broker_event_outbox(cfg, logger=None):
    """Retry durable broker facts with a cross-process delivery lease."""
    token = str((cfg or {}).get("exec_token") or "")
    base = _backend_base(cfg or {})
    if not token or not base:
        return False
    store = account_brain.JsonStateStore(_event_outbox_path(cfg))
    lease_id = "%s:%s" % (os.getpid(), uuid.uuid4().hex)
    now = time.time()

    def claim(current):
        events = current.get("events", {})
        if not isinstance(events, dict):
            raise account_brain.StateStoreError("event outbox is not an object")
        claimed = []
        for event_id in sorted(events):
            event = events[event_id]
            if not isinstance(event, dict):
                raise account_brain.StateStoreError("event outbox row is not an object")
            if float(event.get("leaseUntil", 0) or 0) > now:
                continue
            event["leaseId"] = lease_id
            event["leaseUntil"] = now + 30.0
            claimed.append((event_id, event.get("payload", {})))
        current["events"] = events
        return current, {"total": len(events), "claimed": claimed}

    try:
        batch = store.transact(claim)
        claimed = batch.get("claimed", [])
        if not claimed:
            # Empty is success. Non-empty but leased means another process owns
            # delivery; callers preserve close ordering until it finishes.
            return int(batch.get("total", 0) or 0) == 0
        ids = [event_id for event_id, _ in claimed]
        payload = {"source": "broker-fill-outbox", "open": [], "decisions": []}
        for _, event_payload in claimed:
            if not isinstance(event_payload, dict):
                raise account_brain.StateStoreError("event payload is not an object")
            payload["open"].extend(event_payload.get("open", []))
            payload["decisions"].extend(event_payload.get("decisions", []))
        response = requests.post(
            base + "/api/bridge/state", json=payload,
            headers={"Authorization": "Bearer " + token}, timeout=8,
            allow_redirects=False,
        )
        if response.status_code != 200:
            def release(current):
                bag = current.get("events", {})
                if not isinstance(bag, dict):
                    raise account_brain.StateStoreError("event outbox is not an object")
                for event_id in ids:
                    event = bag.get(event_id)
                    if isinstance(event, dict) and event.get("leaseId") == lease_id:
                        event.pop("leaseId", None)
                        event.pop("leaseUntil", None)
                current["events"] = bag
                return current, True

            store.transact(release)
            if logger:
                logger.error("Broker event outbox POST %s; olaylar saklandi",
                             response.status_code)
            return False

        def remove_delivered(current):
            bag = current.get("events", {})
            if not isinstance(bag, dict):
                raise account_brain.StateStoreError("event outbox is not an object")
            for event_id in ids:
                event = bag.get(event_id)
                if isinstance(event, dict) and event.get("leaseId") == lease_id:
                    bag.pop(event_id, None)
            current["events"] = bag
            return current, True

        return bool(store.transact(remove_delivered))
    except Exception as exc:
        # A process may die or fail before releasing. The bounded lease makes
        # the same event eligible for another process after 30 seconds.
        if logger:
            logger.error("Broker event outbox gonderilemedi; kalici kuyrukta: %s", exc)
        return False


def _position_risk(mt5mod, pos, equity):
    sl = float(getattr(pos, "sl", 0) or 0)
    opened = float(getattr(pos, "price_open", 0) or 0)
    volume = float(getattr(pos, "volume", 0) or 0)
    if sl <= 0 or opened <= 0 or volume <= 0:
        # An unbounded bot position is treated as consuming the whole account,
        # never as zero risk.
        return max(1.0, float(equity or 0))
    is_buy = int(getattr(pos, "type", 0) or 0) == getattr(
        mt5mod, "POSITION_TYPE_BUY", 0)
    adverse = sl < opened if is_buy else sl > opened
    if not adverse:
        return 0.0
    calc = getattr(mt5mod, "order_calc_profit", None)
    if callable(calc):
        try:
            order_type = (getattr(mt5mod, "ORDER_TYPE_BUY", 0) if is_buy
                          else getattr(mt5mod, "ORDER_TYPE_SELL", 1))
            at_stop = calc(order_type, getattr(pos, "symbol", ""),
                           volume, opened, sl)
            if (at_stop is not None and math.isfinite(float(at_stop))
                    and float(at_stop) < 0):
                return -float(at_stop)
        except Exception:
            pass
    info = mt5mod.symbol_info(pos.symbol)
    if info is None:
        return max(1.0, float(equity or 0))
    risk = trade_guard.per_lot_risk_usd(info, abs(opened - sl)) * volume
    return risk if math.isfinite(risk) and risk > 0 else max(1.0, float(equity or 0))


# ── TREND UYUMU KAPISI (2026-08-05) ──────────────────────────────────────────
# Kullanici karari: "islem ve risk limitini kaldir ama AI sacma islemlere,
# gereksiz islemlere izin vermesin. mantikli ve trende uygun islemler acalim."
#
# Limitler kalkinca giris sayisi artar; kaliteyi ayakta tutan sey artik
# TAVAN degil FILTRE olmalidir. Bu kapi DETERMINISTIKtir (LLM'e bel baglamaz):
# ust zaman diliminde (varsayilan H4) EMA egimi ve fiyatin EMA'ya gore konumu
# sinyal yonuyle celisiyorsa giris reddedilir.
#
# FAIL-OPEN: mum verisi okunamazsa giris ENGELLENMEZ. Kullanicinin kirmizi
# cizgisi "tum botlar islem alsin"; veri yoklugu bir trend gorusu DEGILDIR.
TREND_TF_ADI = {
    "M15": "TIMEFRAME_M15", "M30": "TIMEFRAME_M30", "H1": "TIMEFRAME_H1",
    "H4": "TIMEFRAME_H4", "D1": "TIMEFRAME_D1",
}


def _ema(degerler, uzunluk):
    if len(degerler) < uzunluk:
        return None
    k = 2.0 / (uzunluk + 1.0)
    ema = sum(degerler[:uzunluk]) / float(uzunluk)
    for v in degerler[uzunluk:]:
        ema = v * k + ema * (1.0 - k)
    return ema


def trend_uyumlu(mt5mod, cfg, symbol, direction):
    """(uyumlu, gerekce) — veri yoksa (True, "trend-verisi-yok").

    Kapali barlarla calisir: son (olusmakta olan) bar HARIC tutulur, yoksa
    yarim mum trendi anlik olarak ters gosterebilir.
    """
    if not bool(cfg.get("trend_filter_enabled", True)):
        return True, "trend-filtresi-kapali"
    tf_ad = str(cfg.get("trend_timeframe", "H4")).upper()
    tf = getattr(mt5mod, TREND_TF_ADI.get(tf_ad, "TIMEFRAME_H4"), None)
    if tf is None:
        return True, "trend-verisi-yok"
    uzunluk = max(5, int(cfg.get("trend_ema_length", 50) or 50))
    try:
        # +2: olusmakta olan barin atilmasi + egim icin bir onceki deger
        bars = mt5mod.copy_rates_from_pos(symbol, tf, 0, uzunluk + 60)
    except Exception:
        return True, "trend-verisi-yok"
    if bars is None or len(bars) < uzunluk + 3:
        return True, "trend-verisi-yok"
    kapanis = [float(b["close"]) for b in bars[:-1]]   # olusmakta olan bar HARIC
    simdi = _ema(kapanis, uzunluk)
    onceki = _ema(kapanis[:-1], uzunluk)
    if simdi is None or onceki is None:
        return True, "trend-verisi-yok"
    fiyat = kapanis[-1]
    yukari = fiyat > simdi and simdi >= onceki
    asagi = fiyat < simdi and simdi <= onceki
    yon = str(direction or "").lower()
    if yon in ("buy", "long"):
        return (True, "trend-yukari") if yukari else (False, "trend-yukari-degil")
    if yon in ("sell", "short"):
        return (True, "trend-asagi") if asagi else (False, "trend-asagi-degil")
    return True, "yon-bilinmiyor"


def _symbol_spec(info, cfg):
    tick_size = float(getattr(info, "trade_tick_size", 0) or getattr(info, "point", 0) or 0)
    tick_value = float(getattr(info, "trade_tick_value_loss", 0)
                       or getattr(info, "trade_tick_value", 0) or 0)
    # Yaris modu (2026-08-05): lot tavani config'ten YUKSELTILEBILIR hale geldi.
    # Kodda yine mutlak bir emniyet ağı var (10 lot): tek bir hesap/spec hatasi
    # butun hesabi tek emirde silemesin. Config bunun ustune cikamaz.
    absolute_lot_cap = min(10.0, float(_value(
        cfg, "account_tier_max_lot", "brain_max_lot", default=1.0)))
    return account_brain.SymbolSpec(
        tick_size=tick_size,
        tick_value=tick_value,
        volume_min=float(getattr(info, "volume_min", 0) or 0),
        volume_step=float(getattr(info, "volume_step", 0) or 0),
        volume_max=min(float(getattr(info, "volume_max", 0) or 0), absolute_lot_cap),
    )


def evaluate(mt5mod, cfg, info, *, candidate_id, bot_id, symbol, direction,
             timeframe, entry, stop, target, confidence=None, confirmations=1,
             code=None, logger=None):
    """Create and atomically reserve one broker-ready pretrade plan."""
    candidate_id = str(candidate_id or "")
    try:
        magic = int(bot_id or 0)
    except (TypeError, ValueError):
        magic = 0
    metadata = {
        "code": str(code or candidate_id),
        "magic": magic,
        "bot_id": str(bot_id or ""),
        "symbol": str(symbol or ""),
        "direction": str(direction or ""),
        "entry": entry,
        "sl": stop,
        "tp": target,
        "opened_sec": int(time.time()),
        "account": 0,
        "server": str(cfg.get("account_server") or ""),
    }
    try:
        wanted = _allowed_account(cfg)
        metadata["account"] = wanted
    except (TypeError, ValueError, OverflowError) as exc:
        if cfg.get("dry_run") is not True:
            _activate_close_only_stop(cfg, "invalid-allowed-account")
        if logger:
            logger.error("Merkezi beyin hesap config RED: %s", exc)
        return _reject(
            "fail_closed:invalid_allowed_account", candidate_id,
            cfg, metadata, True)
    if not enabled(cfg):
        return _reject("central_brain_disabled", candidate_id, cfg, metadata)
    if magic <= 0:
        return _reject("fail_closed:non_positive_bot_magic", candidate_id,
                       cfg, metadata, True)
    try:
        policy = build_config(cfg)
        strength = float(confidence if confidence is not None else 50.0)
        if strength > 1.0:
            strength /= 100.0
        strength = max(0.0, min(1.0, strength))
        confirm_count = max(1, int(confirmations or 1))
        # Confidence controls risk only inside the selected profile band.
        # Consensus (>=3 independent bots) receives the band maximum, never an
        # exemption from symbol/bot/account caps.
        if policy.risk_profile == "balanced":
            dynamic_risk = 0.10 + 0.15 * strength
            if confirm_count >= 3:
                dynamic_risk = 0.25
            dynamic_risk = min(float(policy.trade_risk_pct), dynamic_risk)
        else:
            dynamic_risk = 0.50 + 0.50 * strength
            if confirm_count >= 3:
                dynamic_risk = 1.00
            dynamic_risk = min(float(policy.trade_risk_pct), dynamic_risk)
        policy = replace(policy, trade_risk_pct=dynamic_risk)
    except Exception as exc:
        if logger:
            logger.error("Merkezi beyin config RED: %s", exc)
        return _reject("fail_closed:invalid_brain_config", candidate_id, cfg, metadata, True)

    heartbeat_path = _runtime_path(cfg, "brain_heartbeat_path", HEARTBEAT_PATH)
    state_path = _runtime_path(cfg, "brain_state_path", STATE_PATH)
    heartbeat = _load_heartbeat(heartbeat_path)
    now = time.time()
    if _stop_active(cfg, heartbeat):
        return _reject("fail_closed:stop_master_active", candidate_id, cfg, metadata, True)
    if not account_brain.heartbeat_ok(heartbeat_path, policy.heartbeat_max_age_seconds, now):
        return _reject("fail_closed:central_brain_heartbeat_stale", candidate_id, cfg, metadata, True)
    if heartbeat is None:
        return _reject("fail_closed:central_brain_heartbeat_invalid", candidate_id, cfg, metadata, True)
    # Trend uyumu: limitler kalkinca kaliteyi FILTRE ayakta tutar. Veri yoksa
    # giris engellenmez (fail-open) — "tum botlar islem alsin" cizgisi korunur.
    uyumlu, trend_gerekce = trend_uyumlu(mt5mod, cfg, symbol, direction)
    if not uyumlu:
        if logger:
            logger.info("TREND RED %s %s (%s)", symbol, direction, trend_gerekce)
        return _reject("trend_uyumsuz:" + trend_gerekce, candidate_id, cfg, metadata, True)
    # A live bridge may not rely on a dry-run manager: exits/reporting would be fake.
    if bool(heartbeat.get("dryRun", True)) != bool(cfg.get("dry_run", True)):
        return _reject("fail_closed:bridge_brain_dry_run_mismatch", candidate_id, cfg, metadata, True)
    if (cfg.get("dry_run") is not True
            and not _lifecycle_report_fresh(
                heartbeat, _lifecycle_report_max_age(cfg), now)):
        return _reject("fail_closed:broker_lifecycle_report_stale",
                       candidate_id, cfg, metadata, True)
    if (not cfg.get("dry_run", True)
            and (not str(cfg.get("exec_token") or "").strip()
                 or not _backend_base(cfg))):
        return _reject("fail_closed:broker_lifecycle_backend_not_configured",
                       candidate_id, cfg, metadata, True)
    # Beyin az once bu enstrumani kendisi kapattiysa AYNI YONDE hemen yeniden
    # acilmaz (kapan-ac dongusu / Telegram spami onlemi); ters yon serbest.
    cooldown_rows = heartbeat.get("reentryCooldowns")
    if isinstance(cooldown_rows, dict):
        asset = account_brain.canonical_underlying(str(symbol or ""))
        row = cooldown_rows.get(asset)
        if isinstance(row, dict):
            until = row.get("untilSec")
            side = str(row.get("direction") or "")
            if (isinstance(until, (int, float)) and not isinstance(until, bool)
                    and now < float(until)
                    and (not side or side == str(direction or ""))):
                return _reject("reentry_cooldown_active", candidate_id,
                               cfg, metadata, True)
    outbox_ready, outbox_count = _broker_event_outbox_ready(cfg, logger=logger)
    if not outbox_ready:
        return _reject(
            "fail_closed:broker_event_outbox_%s" % (
                "unreadable" if outbox_count >= 10 ** 9 else "pending"),
            candidate_id, cfg, metadata, True)

    ai = mt5mod.account_info()
    raw = mt5mod.positions_get()
    if ai is None or raw is None:
        return _reject("fail_closed:account_or_positions_unavailable", candidate_id, cfg, metadata, True)
    login = int(getattr(ai, "login", 0) or 0)
    metadata["account"] = login
    connected_server = str(getattr(ai, "server", "") or "").strip()
    metadata["server"] = connected_server
    if wanted and login != wanted:
        return _reject("fail_closed:allowed_account_mismatch", candidate_id, cfg, metadata, True)
    configured_server = str(cfg.get("account_server") or "").strip()
    if (configured_server and (
            not connected_server
            or configured_server.lower() != connected_server.lower())):
        return _reject("fail_closed:allowed_account_server_mismatch",
                       candidate_id, cfg, metadata, True)
    heartbeat_login = int(heartbeat.get("login", 0) or 0)
    if heartbeat_login and heartbeat_login != login:
        return _reject("fail_closed:heartbeat_account_mismatch", candidate_id, cfg, metadata, True)
    heartbeat_server = str(heartbeat.get("server") or "").strip()
    if (cfg.get("dry_run") is not True and (
            not heartbeat_server or not connected_server
            or heartbeat_server.lower() != connected_server.lower())):
        return _reject("fail_closed:heartbeat_account_server_mismatch",
                       candidate_id, cfg, metadata, True)
    balance = float(getattr(ai, "balance", 0) or 0)
    equity = float(getattr(ai, "equity", 0) or 0)
    terminal = mt5mod.terminal_info()
    trading_allowed = bool(cfg.get("dry_run", True)) or bool(
        getattr(ai, "trade_allowed", False)
        and terminal and getattr(terminal, "trade_allowed", False))
    snapshot = account_brain.AccountSnapshot(
        balance=balance,
        equity=equity,
        start_balance=float(heartbeat.get(
            "initialEquity", heartbeat.get("initialBalance", balance)) or balance),
        day_start_equity=float(heartbeat.get(
            "dayStartEquity", heartbeat.get("dayStartBalance", balance)) or balance),
        high_water_equity=float(heartbeat.get("peakEquity", equity) or equity),
        mt5_ok=True,
        account_ok=(not wanted or login == wanted),
        positions_ok=True,
        deals_ok=heartbeat.get("ok") is True,
        trading_allowed=trading_allowed,
        as_of=now,
    )
    buy_type = getattr(mt5mod, "POSITION_TYPE_BUY", 0)
    open_risks = []
    for pos in raw:
        magic = int(getattr(pos, "magic", 0) or 0)
        open_risks.append(account_brain.OpenRisk(
            ticket=str(getattr(pos, "ticket", "")),
            bot_id=str(magic) if magic > 0 else "manual-or-unknown",
            symbol=str(getattr(pos, "symbol", "")),
            direction="buy" if getattr(pos, "type", 0) == buy_type else "sell",
            timeframe="account",
            risk_usd=_position_risk(mt5mod, pos, equity),
            signal_strength=0.50,
        ))
    try:
        request = account_brain.TradeRequest(
            candidate_id=candidate_id,
            bot_id=str(bot_id),
            symbol=str(symbol),
            direction=direction,
            timeframe=str(timeframe or "default"),
            entry=float(entry), stop=float(stop), target=float(target),
            signal_strength=strength,
            confirmations=confirm_count,
            now_ts=now,
        )
        spec = _symbol_spec(info, cfg)
        controller = account_brain.AccountBrain(
            policy, state_path, heartbeat_path,
            require_fresh_heartbeat=bool(cfg.get("brain_required", True)))
        # AI konseyi tavsiyesi: dosya yok/bayat/bozuk => 1.0 (notr). Carpan
        # yalniz KISABILIR; kirpma hem burada (load) hem beyinde yapilir.
        advisory_scale = account_brain.load_advisory_scale(
            _runtime_path(cfg, "ai_advisory_path", ADVISORY_PATH), now)
        decision = controller.evaluate_and_reserve(
            snapshot, tuple(open_risks), request, spec,
            advisory_scale=advisory_scale)
    except Exception as exc:
        if logger:
            logger.error("Merkezi beyin veri/karar RED: %s", exc)
        return _reject("fail_closed:brain_adapter_error", candidate_id, cfg, metadata, True)
    if decision.allowed and float(getattr(decision, "target", 0) or 0) > 0:
        # The score-based 3R/4R/5R target is the broker TP the bridges send;
        # Telegram lifecycle rows must carry the same value.
        metadata["tp"] = float(decision.target)
    if logger:
        level = logger.info if decision.allowed else logger.warning
        level("BEYIN %s %s %s lot=%.2f risk=$%.2f odul=$%.2f RR=%.2f hedef=%.5f (%.1fR) neden=%s",
              decision.action.value, symbol, direction, decision.lot,
              decision.risk_usd, decision.reward_usd, decision.rr,
              float(getattr(decision, "target", 0) or 0),
              float(getattr(decision, "target_r", 0) or 0),
              ",".join(decision.reasons))
    raw_by_ticket = {
        str(getattr(pos, "ticket", "")): pos for pos in raw
        if str(getattr(pos, "ticket", ""))
    }
    close_dependencies = []
    for ticket in (decision.close_tickets or ()):
        ticket_text = str(ticket)
        if not ticket_text or ticket_text.startswith("reservation:"):
            continue
        pos = raw_by_ticket.get(ticket_text)
        close_dependencies.append(str(
            getattr(pos, "identifier", "") or ticket_text))
    metadata["close_before_open_tickets"] = list(dict.fromkeys(close_dependencies))
    if decision.action in (account_brain.DecisionAction.FLATTEN_ALL,
                           account_brain.DecisionAction.STOP_PROFIT_TARGET):
        _ensure_stop_master(decision.reasons, snapshot, cfg)
    plan = BrainPlan(decision, controller, candidate_id, cfg=cfg, metadata=metadata)
    if not decision.allowed:
        _post_decision(plan, False, ",".join(decision.reasons))
    return plan


def pre_send_check(mt5mod, cfg, plan=None, logger=None):
    """Revalidate the kill-switch and account immediately before order_send."""
    reason = None
    try:
        if plan is not None and not plan.allowed:
            reason = "plan_not_allowed"
        # Network delivery may block for several seconds. Flush it before the
        # final STOP/heartbeat/account/reservation snapshot so no stale-safe
        # decision survives a STOP created during that I/O.
        if reason is None:
            outbox_ready, outbox_count = _broker_event_outbox_ready(cfg, logger=logger)
            if not outbox_ready:
                reason = "broker_event_outbox_%s" % (
                    "unreadable" if outbox_count >= 10 ** 9 else "pending")
        if (reason is None and cfg.get("dry_run") is not True
                and not _backend_ready(cfg)):
            reason = "broker_lifecycle_backend_not_ready"
        if (reason is None and plan is not None and plan.controller is not None
                and not plan.controller.reservation_active(plan.candidate_id)):
            reason = "execution_reservation_not_active"
        policy = build_config(cfg)
        heartbeat_path = _runtime_path(cfg, "brain_heartbeat_path", HEARTBEAT_PATH)
        heartbeat = _load_heartbeat(heartbeat_path)
        now = time.time()
        if reason is None and _stop_active(cfg, heartbeat):
            reason = "stop_master_active"
        if reason is None and not account_brain.heartbeat_ok(
                heartbeat_path, policy.heartbeat_max_age_seconds, now):
            reason = "central_brain_heartbeat_stale"
        if reason is None and heartbeat is None:
            reason = "central_brain_heartbeat_invalid"
        if (reason is None and bool(heartbeat.get("dryRun", True))
                != bool(cfg.get("dry_run", True))):
            reason = "bridge_brain_dry_run_mismatch"
        if (reason is None and cfg.get("dry_run") is not True
                and not _lifecycle_report_fresh(
                    heartbeat, _lifecycle_report_max_age(cfg), now)):
            reason = "broker_lifecycle_report_stale"
        ai = mt5mod.account_info() if reason is None else None
        wanted = _allowed_account(cfg)
        login = int(getattr(ai, "login", 0) or 0) if ai is not None else 0
        if reason is None and ai is None:
            reason = "account_unavailable"
        if reason is None and wanted and login != wanted:
            reason = "allowed_account_mismatch"
        connected_server = str(getattr(ai, "server", "") or "").strip() \
            if ai is not None else ""
        configured_server = str(cfg.get("account_server") or "").strip()
        if (reason is None and configured_server and (
                not connected_server
                or configured_server.lower() != connected_server.lower())):
            reason = "allowed_account_server_mismatch"
        heartbeat_login = int((heartbeat or {}).get("login", 0) or 0)
        if reason is None and heartbeat_login and heartbeat_login != login:
            reason = "heartbeat_account_mismatch"
        heartbeat_server = str((heartbeat or {}).get("server") or "").strip()
        if (reason is None and cfg.get("dry_run") is not True and (
                not heartbeat_server or not connected_server
                or heartbeat_server.lower() != connected_server.lower())):
            reason = "heartbeat_account_server_mismatch"
        if (reason is None and not cfg.get("dry_run", True)
                and (not str(cfg.get("exec_token") or "").strip()
                     or not _backend_base(cfg))):
            reason = "broker_lifecycle_backend_not_configured"
        if reason is None and not cfg.get("dry_run", True):
            terminal = mt5mod.terminal_info()
            if not (getattr(ai, "trade_allowed", False)
                    and terminal and getattr(terminal, "trade_allowed", False)):
                reason = "trading_not_allowed"
    except Exception as exc:
        reason = "pre_send_gate_error:%s" % type(exc).__name__
        if cfg.get("dry_run") is not True:
            _activate_close_only_stop(cfg, reason)
    if reason:
        if logger:
            logger.error("BEYIN EMIR-ONCESI RED: %s", reason)
        return False
    return True


def _ensure_stop_master(reasons, snapshot, cfg):
    if cfg.get("dry_run", True):
        return
    _activate_close_only_stop(
        cfg, "%s equity=%.2f" % (",".join(reasons), snapshot.equity))


def finalize(plan, success, ticket=None, logger=None, reason=None,
             fill_price=None, filled_volume=None):
    """Finish a reservation only after the broker result is known.

    A confirmed fill is written to a process-safe local outbox before any
    network call.  This closes the fast-open/fast-close gap: even when the
    position disappears between daemon polls, its opening fact remains
    retryable and Telegram can preserve open -> close ordering.
    """
    if not plan or plan.controller is None:
        return False
    if success:
        ok = plan.controller.commit_reservation(plan.candidate_id, ticket=ticket)
        if not ok and logger:
            logger.critical("Beyin rezervasyonu commit edilemedi: %s", plan.candidate_id)
        queued = _queue_broker_open(
            plan, ticket, fill_price=fill_price, filled_volume=filled_volume)
        if not queued:
            # The order already exists at the broker.  Fail loudly and stop
            # claiming success to the caller; the account daemon can still
            # reconstruct the position on its next one-second poll.
            if logger:
                logger.critical(
                    "BROKER DOLUMU KALICI KUYRUGA YAZILAMADI: %s ticket=%s",
                    plan.candidate_id, ticket)
            _activate_close_only_stop(
                plan.cfg or {}, "broker-open-outbox-persist-failed:%s" %
                plan.candidate_id)
            delivered = _post_broker_open_direct(
                plan, ticket, fill_price=fill_price,
                filled_volume=filled_volume)
            if logger:
                logger.critical(
                    "YEREL KUYRUK HATASI: canonical STOP=%s dogrudanBildirim=%s",
                    _stop_active(plan.cfg or {}), delivered)
            return False
        if not ok:
            # The broker fill is real and durably reported, but losing the
            # reservation commit would reopen same-underlying race capacity.
            # Freeze entries and let the account daemon flatten/reconcile.
            _activate_close_only_stop(
                plan.cfg or {}, "broker-fill-reservation-commit-failed:%s" %
                plan.candidate_id)
            flush_broker_event_outbox(plan.cfg or {}, logger=logger)
            return False
        # Delivery is best-effort here and durable regardless of the result.
        # The account daemon retries the same idempotent event continuously.
        flush_broker_event_outbox(plan.cfg or {}, logger=logger)
        return bool(ok and queued)
    ok = plan.controller.release_reservation(plan.candidate_id)
    fallback = "dry_run_no_broker_order" if (plan.cfg or {}).get("dry_run", True) \
        else "broker_order_not_confirmed"
    _post_decision(plan, False, reason or fallback, ticket=ticket)
    return ok


def close_for_reversal(mt5mod, cfg, tickets, logger=None, plan=None):
    """Close exactly the tickets in the atomic plan and verify they disappeared."""
    wanted_tickets = {str(t) for t in tickets}
    if not wanted_tickets:
        return True
    if any(ticket.startswith("reservation:") for ticket in wanted_tickets):
        if logger:
            logger.critical("Rezervasyon broker ticketi gibi ters kapatilamaz: %s",
                            sorted(wanted_tickets))
        return False
    if _stop_active(cfg, _load_heartbeat(str(_value(
            cfg, "brain_heartbeat_path", default=HEARTBEAT_PATH)))):
        return False
    if cfg.get("dry_run", True):
        return True
    if plan is None or not pre_send_check(
            mt5mod, cfg, plan=plan, logger=logger):
        if logger:
            logger.error("Atomik ters kapatma guvenlik kapisindan gecemedi")
        return False
    ai = mt5mod.account_info()
    try:
        wanted_account = _allowed_account(cfg)
    except (TypeError, ValueError, OverflowError):
        _activate_close_only_stop(cfg, "invalid-allowed-account-on-reversal")
        return False
    connected_server = str(getattr(ai, "server", "") or "").strip() \
        if ai is not None else ""
    wanted_server = str(cfg.get("account_server") or "").strip()
    if (ai is None
            or (wanted_account and int(getattr(ai, "login", 0) or 0) != wanted_account)
            or (wanted_server and connected_server.lower() != wanted_server.lower())):
        return False
    raw = mt5mod.positions_get()
    if raw is None:
        return False
    by_ticket = {str(getattr(p, "ticket", "")): p for p in raw}
    for ticket in wanted_tickets:
        pos = by_ticket.get(ticket)
        if pos is None:
            continue
        is_buy = getattr(pos, "type", 0) == getattr(mt5mod, "POSITION_TYPE_BUY", 0)
        tick = mt5mod.symbol_info_tick(pos.symbol)
        price = float((tick.bid if is_buy else tick.ask) if tick is not None else 0)
        if price <= 0:
            price = float(getattr(pos, "price_current", 0) or 0)
        if price <= 0:
            return False
        request = {
            "action": mt5mod.TRADE_ACTION_DEAL,
            "symbol": pos.symbol,
            "volume": float(pos.volume),
            "type": mt5mod.ORDER_TYPE_SELL if is_buy else mt5mod.ORDER_TYPE_BUY,
            "position": int(pos.ticket),
            "price": price,
            "deviation": int(cfg.get("deviation_points", 30)),
            "magic": int(getattr(pos, "magic", 0) or 0),
            "comment": "brain-reverse",
            "type_time": mt5mod.ORDER_TIME_GTC,
        }
        result = None
        for fill in (mt5mod.ORDER_FILLING_IOC, mt5mod.ORDER_FILLING_FOK,
                     mt5mod.ORDER_FILLING_RETURN):
            request["type_filling"] = fill
            result = mt5mod.order_send(request)
            if result is None:
                break
            if result.retcode in (getattr(mt5mod, "TRADE_RETCODE_DONE", 10009),
                                  getattr(mt5mod, "TRADE_RETCODE_DONE_PARTIAL", 10010)):
                break
            if result.retcode != 10030:
                break
        if result is None or result.retcode not in (
                getattr(mt5mod, "TRADE_RETCODE_DONE", 10009),
                getattr(mt5mod, "TRADE_RETCODE_DONE_PARTIAL", 10010)):
            if logger:
                logger.error("Atomik ters kapatma basarisiz ticket=%s retcode=%s",
                             ticket, getattr(result, "retcode", None))
            return False
    for _ in range(5):
        current = mt5mod.positions_get()
        if current is None:
            return False
        still_open = {str(getattr(p, "ticket", "")) for p in current} & wanted_tickets
        if not still_open:
            return True
        time.sleep(0.1)
    if logger:
        logger.error("Atomik ters kapatma brokerda dogrulanamadi: %s", sorted(still_open))
    return False
