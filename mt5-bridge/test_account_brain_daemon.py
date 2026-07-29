#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Central daemon rule tests; no terminal and no live order required."""

import time
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import borsakrali_account_brain as brain


def pos(pnl, ticket=1):
    return SimpleNamespace(
        profit=pnl, swap=0.0, ticket=ticket, symbol="XAUUSD", magic=550055,
        type=0, volume=0.10, sl=3990.0, tp=4040.0, price_open=4000.0,
        price_current=4000.0, time=int(time.time()) - 60, comment="BK#42A",
        identifier=ticket,
    )


def t_global_buffers():
    cfg = dict(brain.DEFAULTS)
    def snap(**changes):
        row = {"profitPct": 0, "dailyLossPct": 0, "totalDrawdownPct": 0,
               "openRiskPct": 0, "maxBotRiskPct": 0,
               "maxSymbolSideRiskPct": 0, "unboundedTickets": []}
        row.update(changes)
        return row

    assert brain._global_exit_reason(cfg, snap(profitPct=10.0)).startswith("profit-target")
    assert brain._global_exit_reason(cfg, snap(dailyLossPct=4.25)).startswith("daily-loss")
    assert brain._global_exit_reason(cfg, snap(totalDrawdownPct=9.25)).startswith("total-drawdown")
    assert brain._global_exit_reason(cfg, snap(openRiskPct=2.001)).startswith("open-risk")
    assert brain._global_exit_reason(cfg, snap(maxBotRiskPct=0.501)).startswith("bot-risk")
    assert brain._global_exit_reason(cfg, snap(maxSymbolSideRiskPct=0.501)).startswith("symbol-side")
    assert brain._global_exit_reason(cfg, snap(unboundedTickets=["7"])) == "unbounded-open-risk"
    assert brain._global_exit_reason(cfg, snap(
        profitPct=9.99, dailyLossPct=4.24, totalDrawdownPct=9.24,
        openRiskPct=2.0, maxBotRiskPct=0.5,
        maxSymbolSideRiskPct=0.5)) is None
    widened = dict(cfg, daily_flatten_pct=99, total_flatten_pct=99,
                   hard_max_open_risk_pct=99,
                   max_bot_risk_pct=99, max_symbol_side_risk_pct=99)
    assert brain._global_exit_reason(widened, snap(dailyLossPct=4.25))
    assert brain._global_exit_reason(widened, snap(totalDrawdownPct=9.25))
    assert brain._global_exit_reason(widened, snap(openRiskPct=2.001))
    print("OK account global buffer/profit-stop thresholds")


def t_equity_baselines_ignore_balance_offset():
    ai = SimpleNamespace(login=1, balance=11_000.0, equity=9_800.0)
    state = {
        "version": 2, "login": 1, "initialBalance": 10_000.0,
        "initialEquity": 10_000.0, "peakEquity": 10_000.0,
        "day": brain._trading_day(), "dayStartEquity": 10_000.0,
        "tickets": {}, "close_reasons": {},
    }
    snap = brain._snapshot(dict(brain.DEFAULTS), ai, [], [], state)
    assert snap["dailyLossPct"] == 2.0, snap
    assert snap["profitPct"] == -2.0, snap
    print("OK daily/initial risk baselines use durable equity, not balance offset")


def t_profit_giveback_exit():
    cfg = dict(brain.DEFAULTS)
    now = time.time()
    meta = {"peakPnl": 100.0, "peakSec": now - 30, "lastPnl": 100.0,
            "lastSec": now - 2, "initialRiskUsd": 100.0}
    reason = brain._dynamic_exit_reason(cfg, pos(79.0), meta, now)
    assert reason and reason.startswith("profit-giveback"), reason
    # Peak armed değilse kuruş kârında gereksiz çıkış yok.
    meta2 = {"peakPnl": 12.0, "peakSec": now, "lastPnl": 12.0,
             "lastSec": now - 2, "initialRiskUsd": 100.0}
    assert brain._dynamic_exit_reason(cfg, pos(10.0), meta2, now) is None
    # 1R gorulmeden kar kilidi SILAHLANMAZ: risk $100, tepe $50 (0.5R),
    # simdiki $35 -> eski davranis ($20 arm) erken kapatirdi, artik HOLD.
    meta3 = {"peakPnl": 50.0, "peakSec": now - 30, "lastPnl": 50.0,
             "lastSec": now - 2, "initialRiskUsd": 100.0}
    assert brain._dynamic_exit_reason(cfg, pos(35.0), meta3, now) is None, \
        "0.5R tepede giveback tetiklenmemeli (churn onlemi)"
    print("OK peak-profit giveback (1R arm) + tiny-PnL anti-churn")


def t_fast_adverse_exit():
    cfg = dict(brain.DEFAULTS)
    now = time.time()
    meta = {"peakPnl": 0.0, "peakSec": now - 30, "lastPnl": 0.0,
            "lastSec": now - 2, "initialRiskUsd": 100.0}
    reason = brain._dynamic_exit_reason(cfg, pos(-60.0), meta, now)
    assert reason and reason.startswith("fast-adverse"), reason
    print("OK accelerated adverse move can exit before broker SL")


def t_broker_lifecycle_rows():
    opened = brain._open_rows([pos(25.0)])[0]
    assert opened["ticket"] == "1" and opened["code"] == "42A"
    assert opened["positionIdentifier"] == "1"
    assert opened["entryPrice"] == 4000.0 and opened["sl"] == 3990.0 and opened["tp"] == 4040.0
    opened_deal = SimpleNamespace(
        entry=0, magic=550055, ticket=87, position_id=1, comment="BK#42A",
        symbol="XAUUSD", volume=0.10, price=4000.0, profit=0.0,
        commission=-1.5, swap=0.0, fee=-0.2,
        time=int(time.time()) - 60, time_msc=1, reason=0,
    )
    deal = SimpleNamespace(
        entry=1, magic=550055, ticket=88, position_id=1, comment="BK#42A",
        symbol="XAUUSD", volume=0.10, price=4020.0, profit=205.0,
        commission=-2.0, swap=-1.0, fee=-0.5, time=int(time.time()),
        time_msc=2, reason=5,
    )
    state = {"close_reasons": {"1": {"reason": "profit-giveback"}}}
    with patch.object(brain, "_position_history",
                      return_value=[opened_deal, deal]):
        # A partial close does not become a final Telegram closure while the
        # broker position ticket still exists.
        assert brain._closed_rows(
            [deal], state, live_position_tickets=("1",)) == []
        closed = brain._closed_rows([deal], state)[0]
    assert closed["exitPrice"] == 4020.0
    assert closed["pnl"] == 199.8
    assert closed["commission"] == -3.5 and closed["swap"] == -1.0
    assert closed["fee"] == -0.7 and closed["componentsExact"] is True
    assert closed["reason"] == "profit-giveback"
    print("OK broker-confirmed open/close rows contain exact entry/SL/TP/net costs")


def t_identifier_and_cursor_retry_are_lossless():
    live = pos(10.0, ticket=77)
    live.identifier = 7007
    opened = brain._open_rows([live], account=123, server="Broker-Demo")[0]
    assert opened["positionTicket"] == "77"
    assert opened["positionIdentifier"] == "7007"
    assert opened["account"] == 123 and opened["server"] == "Broker-Demo"

    now = int(time.time())
    close_a = SimpleNamespace(
        entry=1, magic=550055, ticket=901, position_id=7007, comment="BK#A",
        symbol="XAUUSD", volume=.1, price=4010, profit=10, commission=-1,
        swap=0, fee=0, time=now - 2, time_msc=1, reason=5)
    # A live POSITION_IDENTIFIER prevents a partial close from masquerading as final.
    assert brain._closed_rows(
        [close_a], {"close_reasons": {}}, live_position_tickets=("7007",)) == []

    close_b = SimpleNamespace(
        entry=1, magic=550055, ticket=902, position_id=8008, comment="BK#B",
        symbol="EURUSD", volume=.2, price=1.1, profit=20, commission=-2,
        swap=0, fee=0, time=now - 1, time_msc=2, reason=5)
    state = {"notificationCursorSec": now - 10, "close_reasons": {}}
    sent = {}

    def lifecycle(position_id):
        return None if str(position_id) == "7007" else [close_b]

    def post(_url, **kwargs):
        sent.update(kwargs["json"])
        return SimpleNamespace(status_code=200, text="ok")

    cfg = dict(brain.DEFAULTS, exec_token="x", backend_url="https://example.test")
    with patch.object(brain, "_position_history", side_effect=lifecycle), \
            patch.object(brain.mt5_brain_adapter, "flush_broker_event_outbox", return_value=True), \
            patch.object(brain.mt5_brain_adapter, "broker_event_outbox_count", return_value=0), \
            patch.object(brain.requests, "post", side_effect=post):
        assert brain._report_state(
            cfg, [], [close_a, close_b], state,
            {"login": 123, "server": "Broker-Demo"},
            history_cutoff_sec=now)
    assert state["notificationCursorSec"] == now - 10, state
    assert len(sent["closed"]) == 1
    assert sent["closed"][0]["positionIdentifier"] == "8008"
    assert sent["closed"][0]["notificationRequired"] is True
    print("OK POSITION_IDENTIFIER partial guard + lifecycle failure keeps cursor retryable")


def t_close_only_latch_retries_residual_positions():
    residual = pos(-5.0, ticket=41)
    ai = SimpleNamespace(login=1, balance=10_000.0, equity=10_000.0, server="Demo")
    cfg = dict(brain.DEFAULTS, dry_run=False, allowed_account=1,
               exec_token="x", report_interval_seconds=999)
    state = {"tickets": {}, "close_reasons": {}}
    safe = {
        "profitPct": 0, "dailyLossPct": 0, "totalDrawdownPct": 0,
        "openRiskPct": 0, "maxBotRiskPct": 0, "maxSymbolSideRiskPct": 0,
        "unboundedTickets": [], "ok": True,
    }
    closed = []
    with patch.object(brain.mt5, "account_info", return_value=ai), \
            patch.object(brain.mt5, "positions_get", return_value=[residual]), \
            patch.object(brain, "_history", return_value=[]), \
            patch.object(brain, "_snapshot", return_value=safe.copy()), \
            patch.object(brain.mt5_brain_adapter, "broker_event_outbox_count", return_value=0), \
            patch.object(brain, "_atomic_json"), patch.object(brain, "_write_stop"), \
            patch.object(brain, "_save_state"), \
            patch.object(brain, "_close_position",
                         side_effect=lambda _c, p, reason, _s: closed.append((p.ticket, reason)) or True):
        brain.run_once(cfg, state, last_report=time.time(), forced_stop_reason="daily-brake")
        brain.run_once(cfg, state, last_report=time.time())
    assert closed == [(41, "daily-brake"), (41, "daily-brake")], closed
    assert state["emergencyFlatten"]["active"] is True
    print("OK close-only emergency latch retries residual positions every turn")


def t_live_state_schema_and_stop_modes():
    ai = SimpleNamespace(login=9, server="Demo")
    cfg = dict(brain.DEFAULTS, dry_run=False, allowed_account=9)
    # v2 state (server alani yok) artik GECERSIZ — sema v3'e yukseltildi.
    assert brain._live_state_error({"version": 2, "login": 9}, cfg, ai) == \
        "live-state-version-invalid"
    assert brain._live_state_error({"version": [], "login": 9}, cfg, ai) == \
        "live-state-version-invalid"
    assert brain._live_state_error({"version": 3, "login": {}}, cfg, ai) == \
        "live-state-account-mismatch"
    valid = {
        "version": 3, "login": 9, "server": "Demo", "initialEquity": 10_000,
        "dayStartEquity": 10_000, "peakEquity": 10_000,
        "day": "2026-07-29", "tickets": {}, "close_reasons": {},
    }
    assert brain._live_state_error(dict(valid, server="Other"), cfg, ai) == \
        "live-state-server-mismatch"
    assert brain._live_state_error(valid, cfg, ai) is None
    bad_day = dict(valid, day="garbage")
    assert brain._live_state_error(bad_day, cfg, ai) == "live-state-day-invalid"
    future_day = dict(valid, day="2999-01-01")
    assert brain._live_state_error(future_day, cfg, ai) == "live-state-day-in-future"
    with tempfile.TemporaryDirectory() as tmp:
        stop = Path(tmp) / "STOP_MASTER"
        stop.write_text("manual", encoding="utf-8")
        assert brain._stop_mode(str(stop))[0] == "manual"
        stop.write_text('{"closeOnly":true,"emergencyFlatten":true,"reason":"risk"}',
                        encoding="utf-8")
        assert brain._stop_mode(str(stop)) == ("close-only", "risk")
    print("OK live state schema fails closed; manual/risk STOP semantics differ")


def t_order_calc_profit_measures_loss_and_trailing_stop_zero_risk():
    p = pos(0)
    with patch.object(brain.mt5, "order_calc_profit", return_value=-123.45,
                      create=True):
        assert brain._initial_risk_usd(p) == 123.45
    p.sl = 4010.0
    with patch.object(brain.mt5, "order_calc_profit", return_value=50.0,
                      create=True):
        assert brain._initial_risk_usd(p) == 0.0
    p.sl = 3990.0
    zero_info = SimpleNamespace(
        trade_tick_value_loss=0, trade_tick_value=0, trade_tick_size=0,
        trade_contract_size=0)
    with patch.object(brain.mt5, "order_calc_profit", return_value=0.0,
                      create=True), \
            patch.object(brain.mt5, "symbol_info", return_value=zero_info):
        assert brain._initial_risk_usd(p) is None
    print("OK broker order_calc_profit measures loss; profitable trailing SL is zero risk")


def t_discretionary_close_records_reentry_cooldown():
    live = pos(120.0, ticket=61)
    ai = SimpleNamespace(login=1, balance=10_000.0, equity=10_000.0, server="Demo")
    cfg = dict(brain.DEFAULTS, dry_run=False, allowed_account=1,
               exec_token="x", report_interval_seconds=999)
    state = {"tickets": {}, "close_reasons": {}}
    safe = {
        "profitPct": 0, "dailyLossPct": 0, "totalDrawdownPct": 0,
        "openRiskPct": 0, "maxBotRiskPct": 0, "maxSymbolSideRiskPct": 0,
        "unboundedTickets": [], "ok": True,
    }
    with patch.object(brain.mt5, "account_info", return_value=ai), \
            patch.object(brain.mt5, "positions_get", return_value=[live]), \
            patch.object(brain, "_history", return_value=[]), \
            patch.object(brain, "_snapshot", return_value=safe.copy()), \
            patch.object(brain.mt5_brain_adapter, "broker_event_outbox_count", return_value=0), \
            patch.object(brain, "_atomic_json"), patch.object(brain, "_save_state"), \
            patch.object(brain, "_dynamic_exit_reason",
                         return_value="profit-giveback-test"), \
            patch.object(brain, "_close_position", return_value=True):
        brain.run_once(cfg, state, last_report=time.time())
    row = state.get("reentryCooldowns", {}).get("XAUUSD")
    assert row and row["direction"] == "long", state.get("reentryCooldowns")
    assert row["untilSec"] > time.time() + 60, row
    print("OK beyin kapatinca ayni-yon yeniden-giris sogumasi kaydediliyor")


def t_trailing_stop_after_3r():
    info = SimpleNamespace(point=0.01, digits=2, trade_stops_level=0, spread=10)
    sent = []

    def order_send(req):
        sent.append(dict(req))
        return SimpleNamespace(retcode=10009)

    cfg = dict(brain.DEFAULTS, dry_run=False)

    # LONG: +3.2R -> SL tepe R'nin 1R gerisine (4000 + 2.2*10 = 4022) tasinir.
    p = pos(320.0)
    meta = {"initialSlPrice": 3990.0}
    with patch.object(brain.mt5, "symbol_info", return_value=info), \
            patch.object(brain.mt5, "symbol_info_tick",
                         return_value=SimpleNamespace(bid=4032.0, ask=4032.3)), \
            patch.object(brain.mt5, "order_send", side_effect=order_send):
        brain._maybe_trail_stop(cfg, p, meta)
    assert len(sent) == 1, sent
    assert sent[0]["position"] == 1 and abs(sent[0]["sl"] - 4022.0) < 1e-9, sent
    assert sent[0]["tp"] == 4040.0, "TP degismemeli"
    assert abs(meta["peakR"] - 3.2) < 1e-9, meta

    # 3R altinda SL'e dokunulmaz.
    sent.clear()
    with patch.object(brain.mt5, "symbol_info", return_value=info), \
            patch.object(brain.mt5, "symbol_info_tick",
                         return_value=SimpleNamespace(bid=4020.0, ask=4020.3)), \
            patch.object(brain.mt5, "order_send", side_effect=order_send):
        brain._maybe_trail_stop(cfg, p, {"initialSlPrice": 3990.0})
    assert sent == [], "3R altinda trail olmamali"

    # Geri cekilmede SL ASLA gevsetilmez (peakR kalici, churn yok).
    sent.clear()
    p2 = pos(280.0)
    p2.sl = 4022.0
    meta2 = {"initialSlPrice": 3990.0, "peakR": 3.2}
    with patch.object(brain.mt5, "symbol_info", return_value=info), \
            patch.object(brain.mt5, "symbol_info_tick",
                         return_value=SimpleNamespace(bid=4028.0, ask=4028.3)), \
            patch.object(brain.mt5, "order_send", side_effect=order_send):
        brain._maybe_trail_stop(cfg, p2, meta2)
    assert sent == [], "ayni kilit seviyesi tekrar gonderilmemeli"

    # SHORT: entry 4000, SL 4010, fiyat 3965 -> +3.5R, kilit 2.5R -> SL 3975.
    sent.clear()
    ps = pos(350.0)
    ps.type = 1
    ps.sl = 4010.0
    ps.tp = 3960.0
    with patch.object(brain.mt5, "symbol_info", return_value=info), \
            patch.object(brain.mt5, "symbol_info_tick",
                         return_value=SimpleNamespace(bid=3964.8, ask=3965.0)), \
            patch.object(brain.mt5, "order_send", side_effect=order_send):
        brain._maybe_trail_stop(cfg, ps, {"initialSlPrice": 4010.0})
    assert len(sent) == 1 and abs(sent[0]["sl"] - 3975.0) < 1e-9, sent

    # dry_run yalniz loglar, emir gondermez.
    sent.clear()
    with patch.object(brain.mt5, "symbol_info", return_value=info), \
            patch.object(brain.mt5, "symbol_info_tick",
                         return_value=SimpleNamespace(bid=4032.0, ask=4032.3)), \
            patch.object(brain.mt5, "order_send", side_effect=order_send):
        brain._maybe_trail_stop(dict(cfg, dry_run=True), pos(320.0),
                                {"initialSlPrice": 3990.0})
    assert sent == [], "dry_run'da SLTP emri gitmemeli"

    # Basarisiz modify -> ustel geri cekilme; ikinci cagri hemen tekrar DENEMEZ.
    sent.clear()
    fail_meta = {"initialSlPrice": 3990.0}

    def order_fail(req):
        sent.append(dict(req))
        return SimpleNamespace(retcode=10018)  # MARKET_CLOSED

    with patch.object(brain.mt5, "symbol_info", return_value=info), \
            patch.object(brain.mt5, "symbol_info_tick",
                         return_value=SimpleNamespace(bid=4032.0, ask=4032.3)), \
            patch.object(brain.mt5, "order_send", side_effect=order_fail):
        brain._maybe_trail_stop(cfg, pos(320.0), fail_meta)
        brain._maybe_trail_stop(cfg, pos(320.0), fail_meta)
    assert len(sent) == 1, "backoff ikinci denemeyi ertelemeli: %s" % sent
    assert fail_meta.get("trailFailCount") == 1
    assert fail_meta.get("trailRetryAfterSec", 0) > time.time()
    print("OK 3R sonrasi iz suren stop (long/short, tek yon, churn yok, dry-run, backoff)")


def t_history_and_disk_failures_do_not_skip_global_flatten():
    manual = pos(-50.0, ticket=11)
    manual.magic = 0
    bot = pos(-50.0, ticket=12)
    ai = SimpleNamespace(login=1, balance=10_000.0, equity=9_500.0)
    cfg = dict(brain.DEFAULTS, dry_run=False, allowed_account=1,
               report_interval_seconds=999)
    state = {"login": 1, "tickets": {}, "close_reasons": {}}
    snap = {
        "profitPct": -5.0, "dailyLossPct": 4.25,
        "totalDrawdownPct": 5.0, "openRiskPct": 0.0,
        "maxBotRiskPct": 0.0, "maxSymbolSideRiskPct": 0.0,
        "unboundedTickets": [], "ok": False,
    }
    closed = []

    def remember(_cfg, position, reason, _state):
        closed.append((str(position.ticket), reason))
        return True

    with patch.object(brain.mt5, "account_info", return_value=ai), \
            patch.object(brain.mt5, "positions_get", return_value=[manual, bot]), \
            patch.object(brain, "_history", side_effect=RuntimeError("history down")), \
            patch.object(brain, "_snapshot", return_value=snap), \
            patch.object(brain, "_atomic_json", side_effect=OSError("disk full")), \
            patch.object(brain, "_write_stop", side_effect=OSError("disk full")), \
            patch.object(brain, "_close_position", side_effect=remember), \
            patch.object(brain, "_save_state"):
        brain.run_once(cfg, state, last_report=time.time())
    assert [ticket for ticket, _ in closed] == ["11", "12"], closed
    print("OK history/heartbeat/STOP disk failures cannot skip manual+bot flatten")


if __name__ == "__main__":
    t_global_buffers()
    t_equity_baselines_ignore_balance_offset()
    t_profit_giveback_exit()
    t_fast_adverse_exit()
    t_broker_lifecycle_rows()
    t_identifier_and_cursor_retry_are_lossless()
    t_close_only_latch_retries_residual_positions()
    t_live_state_schema_and_stop_modes()
    t_order_calc_profit_measures_loss_and_trailing_stop_zero_risk()
    t_discretionary_close_records_reentry_cooldown()
    t_trailing_stop_after_3r()
    t_history_and_disk_failures_do_not_skip_global_flatten()
    print("\nTUM MERKEZI DAEMON TESTLERI GECTI - OK")
