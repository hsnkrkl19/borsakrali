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
    # YARIS MODU: sembol/bot/havuz flatten'lari kapali; hesap frenleri aynen.
    race = dict(cfg, race_mode=True)
    assert brain._global_exit_reason(race, snap(maxSymbolSideRiskPct=5)) is None
    assert brain._global_exit_reason(race, snap(maxBotRiskPct=5)) is None
    assert brain._global_exit_reason(race, snap(openRiskPct=6)) is None
    assert brain._global_exit_reason(race, snap(dailyLossPct=4.25)).startswith("daily-loss")
    assert brain._global_exit_reason(race, snap(profitPct=10.0)).startswith("profit-target")
    assert brain._global_exit_reason(race, snap(unboundedTickets=["9"])) == "unbounded-open-risk"
    print("OK account global buffer/profit-stop thresholds (+race mode)")


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


def t_herd_reversal_cuts_losers_keeps_winners():
    cfg = dict(brain.DEFAULTS)
    now = time.time()

    def longpos(ticket, pnl):
        p = pos(pnl, ticket=ticket)
        p.type = 0
        return p

    def meta_at(peak_r):
        return {"initialRiskUsd": 100.0, "herdPeakR": peak_r, "herdPeakSec": now - 10}

    # GERCEK TERS DONUS: 8 long, 6'si zararda, her biri kendi tepesinden
    # ~1R geri verdi (tepe +0.5R -> simdi -0.5R).
    positions = [longpos(i, -50.0) for i in range(1, 7)]
    positions += [longpos(7, 120.0), longpos(8, 80.0)]
    tickets = {str(p.identifier): meta_at(0.5) for p in positions[:6]}
    tickets.update({str(p.identifier): meta_at(1.2) for p in positions[6:]})

    cuts, reason = brain.herd_reversal_cuts(cfg, positions, tickets, now)
    kesilen = sorted(int(p.ticket) for p, _m, _s in cuts)
    assert kesilen == [1, 2, 3, 4, 5, 6], kesilen
    assert all(side == "long" for _p, _m, side in cuts)
    assert reason and reason.startswith("herd-reversal-long"), reason

    # KRITIK REGRESYON: bir KAZANAN kapaninca (kume kucuulur) kalanlarin
    # fiyati hic degismemisken kesim OLMAMALI. Eski toplam-R mantiginda
    # runner TP'si dolar dolmaz kardes pozisyonlar infaz ediliyordu.
    kalanlar = [longpos(i, -13.0) for i in range(1, 6)]          # -0.13R, spread
    t2 = {str(p.identifier): meta_at(-0.13) for p in kalanlar}   # tepesi de -0.13R
    cuts2, reason2 = brain.herd_reversal_cuts(cfg, kalanlar, t2, now)
    assert cuts2 == [] and reason2 is None,         "kazanan cikisi kume toplamini dusurup kesim tetiklememeli: %s" % reason2

    # Cogunluk zararda ama kimse tepesinden anlamli geri vermemis -> kesme yok.
    t3 = {str(p.identifier): meta_at(-0.45) for p in positions[:6]}
    t3.update({str(p.identifier): meta_at(1.2) for p in positions[6:]})
    cuts3, _ = brain.herd_reversal_cuts(cfg, positions, t3, now)
    assert cuts3 == [], "yavas zarar suru kesmesi tetiklememeli"

    # Esik alti pozisyon sayisi -> hicbir sey yapilmaz.
    cuts4, _ = brain.herd_reversal_cuts(cfg, positions[:3], dict(tickets), now)
    assert cuts4 == [], "min pozisyon esigi altinda kesme olmamali"

    # Cogunluk kazancliyken (saglikli trend) kesme yok.
    healthy = [longpos(i, 90.0) for i in range(1, 8)] + [longpos(8, -40.0)]
    t5 = {str(p.identifier): meta_at(1.5) for p in healthy}
    cuts5, _ = brain.herd_reversal_cuts(cfg, healthy, t5, now)
    assert cuts5 == [], "kazanan surude kesme olmamali"

    # Tepe bilgisi YOKKEN ilk turda kesim olmaz (tepe o turda kurulur).
    t6 = {str(p.identifier): {"initialRiskUsd": 100.0} for p in positions}
    cuts6, _ = brain.herd_reversal_cuts(cfg, positions, t6, now)
    assert cuts6 == [], "tepe kurulmadan kesim olmamali"
    assert t6[str(positions[0].identifier)]["herdPeakR"] == -0.5
    print("OK suru ters-donus: pozisyon-basina geri verme, kume degisimine bagisik")


def t_herd_cooldown_only_after_successful_close():
    """Kapatma basarisizsa sogutma YAZILMAZ; mevcut daha uzun sogutma KISALMAZ."""
    now = time.time()
    cfg = dict(brain.DEFAULTS, dry_run=False, allowed_account=1,
               report_interval_seconds=999, herd_min_positions=5)
    ai = SimpleNamespace(login=1, balance=10_000.0, equity=10_000.0, server="Demo")
    safe = {"profitPct": 0, "dailyLossPct": 0, "totalDrawdownPct": 0,
            "openRiskPct": 0, "maxBotRiskPct": 0, "maxSymbolSideRiskPct": 0,
            "unboundedTickets": [], "ok": True}

    def longpos(ticket, pnl, symbol):
        p = pos(pnl, ticket=ticket)
        p.type = 0
        p.symbol = symbol
        return p

    syms = ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF"]
    positions = [longpos(i + 1, -50.0, s) for i, s in enumerate(syms)]
    state = {
        "tickets": {str(p.identifier): {"initialRiskUsd": 100.0, "herdPeakR": 0.5,
                                        "herdPeakSec": now - 10} for p in positions},
        "close_reasons": {},
        # EURUSD icin tekil cikistan kalan UZUN sogutma (45 dk).
        "reentryCooldowns": {"EURUSD": {"untilSec": int(now + 2700),
                                        "direction": "long", "reason": "eski"}},
    }
    # GBPUSD kapatilamiyor (broker reddi), digerleri kapaniyor.
    def close(_c, p, _r, _s):
        return p.symbol != "GBPUSD"

    with patch.object(brain.mt5, "account_info", return_value=ai),             patch.object(brain.mt5, "positions_get", return_value=positions),             patch.object(brain, "_history", return_value=[]),             patch.object(brain, "_snapshot", return_value=safe.copy()),             patch.object(brain.mt5_brain_adapter, "broker_event_outbox_count", return_value=0),             patch.object(brain, "_atomic_json"), patch.object(brain, "_save_state"),             patch.object(brain, "_maybe_trail_stop"),             patch.object(brain, "_maybe_extend_runner"),             patch.object(brain, "_dynamic_exit_reason", return_value=None),             patch.object(brain, "_close_position", side_effect=close):
        brain.run_once(cfg, state, last_report=time.time())

    cd = state.get("reentryCooldowns", {})
    assert "GBPUSD" not in cd, "kapatilamayan pozisyon icin sogutma yazilmamali"
    assert "AUDUSD" in cd and cd["AUDUSD"]["direction"] == "long"
    assert cd["EURUSD"]["untilSec"] >= int(now + 2699),         "mevcut 45dk sogutma 5dk ile ezilmemeli: %s" % cd["EURUSD"]
    print("OK suru sogutmasi: yalniz basarili kapanista + uzun sogutma korunur")


def t_runner_extends_tp_only_outward():
    info = SimpleNamespace(point=0.01, digits=2, trade_stops_level=0, spread=10)
    sent = []

    def order_send(req):
        sent.append(dict(req))
        return SimpleNamespace(retcode=10009)

    cfg = dict(brain.DEFAULTS, dry_run=False)
    # LONG entry 4000, SL 3990 (1R=10), tepe 3R -> TP 4000+10*10 = 4100.
    p = pos(300.0)
    meta = {"initialSlPrice": 3990.0, "peakR": 3.0, "initialRiskUsd": 100.0}
    with patch.object(brain.mt5, "symbol_info", return_value=info), \
            patch.object(brain.mt5, "order_send", side_effect=order_send):
        brain._maybe_extend_runner(cfg, p, meta)
    assert len(sent) == 1, sent
    assert abs(sent[0]["tp"] - 4100.0) < 1e-9, sent
    assert sent[0]["sl"] == 3990.0, "SL'e dokunulmamali"
    assert meta.get("runnerArmed") is True

    # Tepe esigin altinda -> TP'ye dokunma.
    sent.clear()
    with patch.object(brain.mt5, "symbol_info", return_value=info), \
            patch.object(brain.mt5, "order_send", side_effect=order_send):
        brain._maybe_extend_runner(cfg, pos(150.0),
                                   {"initialSlPrice": 3990.0, "peakR": 1.5,
                                    "initialRiskUsd": 100.0})
    assert sent == [], "arm esigi altinda tasima olmamali"

    # peakR hic yazilmamis olsa bile ANLIK R esigi asiyorsa runner tetiklenir
    # (runner trail'den once kosar; bir tur gecikme olmasin).
    sent.clear()
    with patch.object(brain.mt5, "symbol_info", return_value=info),             patch.object(brain.mt5, "order_send", side_effect=order_send):
        brain._maybe_extend_runner(cfg, pos(300.0),
                                   {"initialSlPrice": 3990.0, "initialRiskUsd": 100.0})
    assert len(sent) == 1 and abs(sent[0]["tp"] - 4100.0) < 1e-9, sent

    # TP zaten daha uzaktaysa geri cekilmez.
    sent.clear()
    far = pos(300.0)
    far.tp = 4300.0
    with patch.object(brain.mt5, "symbol_info", return_value=info), \
            patch.object(brain.mt5, "order_send", side_effect=order_send):
        brain._maybe_extend_runner(cfg, far, {"initialSlPrice": 3990.0, "peakR": 3.0,
                                              "initialRiskUsd": 100.0})
    assert sent == [], "TP asla yaklastirilmamali"

    # TRAIL, runner'in uzattigi TP'yi GERI ALMAMALI: SLTP yaziminda TP taze okunur.
    sent.clear()
    trailed = pos(320.0)
    trailed.tp = 4040.0                     # bayat okuma
    fresh = pos(320.0)
    fresh.tp = 4100.0                       # runner az once uzatti
    with patch.object(brain.mt5, "symbol_info", return_value=info),             patch.object(brain.mt5, "symbol_info_tick",
                         return_value=SimpleNamespace(bid=4032.0, ask=4032.3)),             patch.object(brain.mt5, "positions_get", return_value=[fresh]),             patch.object(brain.mt5, "order_send", side_effect=order_send):
        brain._maybe_trail_stop(cfg, trailed, {"initialSlPrice": 3990.0})
    assert len(sent) == 1, sent
    assert abs(sent[0]["tp"] - 4100.0) < 1e-9, "trail runner TP'sini korumali: %s" % sent
    print("OK runner TP: kazanan kosar, TP yalniz uzaga tasinir")


def t_closed_ledger_not_blocked_by_pending_opens():
    """A2: acilis kuyrugu doluyken bile KAPANIS satirlari POST edilir.

    2026-07-31 regresyonu: tek bir Telegram hiz-limiti acilisi kuyrukta
    biraktiginda `_report_state` erken donuyor, kapanislar deftere HIC
    yazilamiyordu (gercek -3.234,88 $ iken rapor -74,51 $ dedi).
    """
    now = int(time.time())
    close = SimpleNamespace(
        entry=1, magic=550055, ticket=901, position_id=5001, comment="BK#A1",
        symbol="EURUSD", volume=1.0, price=1.15, profit=-19.0, commission=-2.0,
        swap=0.0, fee=0.0, time=now - 5, time_msc=1, reason=4)
    state = {"notificationCursorSec": now - 600, "close_reasons": {}}
    sent = {}

    def post(_url, **kwargs):
        sent.update(kwargs["json"])
        return SimpleNamespace(status_code=200, text="ok")

    cfg = dict(brain.DEFAULTS, exec_token="x", backend_url="https://example.test")
    with patch.object(brain, "_position_history", return_value=[close]),             patch.object(brain.mt5_brain_adapter, "flush_broker_event_outbox", return_value=False),             patch.object(brain.mt5_brain_adapter, "broker_event_outbox_count", return_value=7),             patch.object(brain.requests, "post", side_effect=post):
        ok = brain._report_state(cfg, [], [close], state,
                                 {"login": 1, "server": "Demo"},
                                 history_cutoff_sec=now)
    assert ok is True, "acilis kuyrugu kapanis raporunu engellememeli"
    assert len(sent.get("closed", [])) == 1, sent
    assert sent["closed"][0]["pnl"] == -21.0
    print("OK A2: bekleyen acilis kuyrugu kapanis defterini durdurmuyor")


def t_live_snapshot_skip_does_not_advance_cursor():
    """A2b: anlik goruntude hala acik gorunen kapanis cursor'u ilerletmemeli."""
    now = int(time.time())
    # A: erken kapandi ama positions_get'te HALA canli gorunuyor (bayat snapshot)
    close_a = SimpleNamespace(
        entry=1, magic=5702, ticket=911, position_id=7007, comment="BK#A",
        symbol="XAUUSD", volume=0.1, price=4000, profit=-50, commission=-1,
        swap=0, fee=0, time=now - 60, time_msc=1, reason=4)
    # B: sonra kapandi ve raporlanabilir
    close_b = SimpleNamespace(
        entry=1, magic=5702, ticket=912, position_id=8008, comment="BK#B",
        symbol="EURUSD", volume=0.1, price=1.15, profit=20, commission=-1,
        swap=0, fee=0, time=now - 10, time_msc=2, reason=5)
    state = {"notificationCursorSec": now - 600, "close_reasons": {}}

    def lifecycle(position_id):
        return [close_a] if str(position_id) == "7007" else [close_b]

    with patch.object(brain, "_position_history", side_effect=lifecycle):
        rows, blocked, ids = brain._closed_rows(
            [close_a, close_b], state, min_closed_sec=now - 600,
            live_position_tickets=("7007",), return_status=True)
    assert [r["positionTicket"] for r in rows] == ["8008"], rows
    assert blocked is True, "live yuzunden atlanan pozisyon BLOKE sayilmali"
    assert "7007" in ids, ids
    print("OK A2b: atlanan kapanis cursor'u ilerletmiyor (kalici kayip yok)")


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
    t_closed_ledger_not_blocked_by_pending_opens()
    t_live_snapshot_skip_does_not_advance_cursor()
    t_herd_reversal_cuts_losers_keeps_winners()
    t_herd_cooldown_only_after_successful_close()
    t_runner_extends_tp_only_outward()
    t_history_and_disk_failures_do_not_skip_global_flatten()
    print("\nTUM MERKEZI DAEMON TESTLERI GECTI - OK")
