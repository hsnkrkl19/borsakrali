#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Köprü işlem matematiği testleri (MT5 stub'lanır — terminal gerekmez).
Çalıştır: python test_bridge.py"""
from types import SimpleNamespace
try:
    import MetaTrader5 as mt5
except ModuleNotFoundError:
    from mt5_test_stub import install
    mt5 = install()
import borsakrali_mt5 as bk
import borsakrali_mt5_all as all_bk
import trade_guard

# Live bridge configs intentionally force the central brain. Unit tests below
# isolate bridge execution math unless a test explicitly enables a fake plan.
bk.mt5_brain_adapter.enabled = lambda cfg: bool(cfg.get("_offline_brain_enabled"))

TEST_LOGIN = 1514061487
TEST_SERVER = "FTMO-Demo"
CFG = {"lot_min": 0.01, "lot_max": 0.03, "conf_min": 60, "conf_max": 100,
       "max_lot": 0.05, "min_rr": 0.7, "magic": 550055, "deviation_points": 30,
       "dry_run": False, "lot_mode": "confidence",
       "allowed_account": TEST_LOGIN, "account_server": TEST_SERVER}

sent = []


def fake_info(name="EURUSD", stops=0):
    digits = 2 if name == "BTCUSD" else 5
    return SimpleNamespace(name=name, digits=digits, point=10 ** (-digits),
                           volume_step=0.01, volume_min=0.01, volume_max=100.0,
                           visible=True, trade_stops_level=stops, trade_freeze_level=0)


def setup_stubs(ask, bid, positions=()):
    sent.clear()
    mt5.symbol_info = lambda n: fake_info(n)
    mt5.symbol_info_tick = lambda n: SimpleNamespace(ask=ask, bid=bid)
    mt5.symbol_select = lambda *a: True
    mt5.positions_get = lambda: list(positions)
    mt5.account_info = lambda: SimpleNamespace(login=TEST_LOGIN, server=TEST_SERVER,
                                               trade_allowed=True)

    def cap(req):
        sent.append(req)
        return SimpleNamespace(retcode=mt5.TRADE_RETCODE_DONE, order=1, deal=2,
                               volume=req.get("volume", 0),
                               price=req.get("price", 0), comment="ok")
    mt5.order_send = cap
    mt5.last_error = lambda: (0, "ok")


def approx(a, b, tol=1e-3):
    return abs(a - b) <= tol


def t_lot():
    info = fake_info()
    assert approx(bk.lot_for_confidence(CFG, 60, info), 0.01)
    assert approx(bk.lot_for_confidence(CFG, 80, info), 0.02)
    assert approx(bk.lot_for_confidence(CFG, 100, info), 0.03)
    # ⚠️ 2026-07-24: tavan uygulaması lot_for_confidence'tan trade_guard.clamp_lot'a
    # TAŞINDI (reddetmek yerine aşağı kırpmak için). "Broker asgarisi tavanı aşarsa
    # işlem AÇILMAZ" değişmezi korunur — artık clamp_lot'ta.
    bad = SimpleNamespace(volume_step=0.01, volume_min=0.30, volume_max=100.0)
    assert trade_guard.clamp_lot(bk.lot_for_confidence(CFG, 100, bad), bad, None, CFG) == 0.0, \
        "broker vmin > lot tavani → islem yok"
    # Tavanı aşan ham lot artık ATLANMAZ, 0.15'e kırpılır.
    big = SimpleNamespace(volume_step=0.01, volume_min=0.01, volume_max=100.0)
    assert trade_guard.clamp_lot(1.10, big, None, CFG) == 0.05, "cfg max_lot (0.05) daha dusukse o gecerli"
    assert trade_guard.clamp_lot(1.10, big, None, {}) == 0.15, "cfg yoksa kod tavani 0.15"
    print("OK lot_for_confidence + clamp_lot tavani")


def t_open_long_absolute():
    setup_stubs(ask=100.05, bid=100.04)
    bk.open_trade(CFG, {"code": "001", "direction": "long", "entry": 100.0, "stop": 98.0,
                        "target1": 104.0, "target2": 108.0, "confidence": 80}, fake_info())
    r = sent[-1]
    assert r["type"] == mt5.ORDER_TYPE_BUY
    assert approx(r["sl"], 98.0), f"long SL=MUTLAK sinyal stop {r['sl']}"   # Telegram ile aynı
    assert approx(r["tp"], 104.0), f"long TP=MUTLAK sinyal target {r['tp']}"
    assert r["sl"] < r["price"] < r["tp"]
    print("OK open_trade LONG mutlak seviye (SL/TP = Telegram ile aynı)")


def t_open_short_absolute():
    setup_stubs(ask=1.1006, bid=1.0995)
    bk.open_trade(CFG, {"code": "002", "direction": "short", "entry": 1.10, "stop": 1.11,
                        "target1": 1.08, "target2": 1.06, "confidence": 100}, fake_info("GBPUSD"))
    r = sent[-1]
    assert r["type"] == mt5.ORDER_TYPE_SELL
    assert approx(r["sl"], 1.11) and approx(r["tp"], 1.08), f"short mutlak {r['sl']}/{r['tp']}"
    assert r["tp"] < r["price"] < r["sl"]
    print("OK open_trade SHORT mutlak seviye")


def t_skip_stale_rr():
    # Fiyat TP'ye çok yaklaşmış (ETH senaryosu) → kalan R:R düşük → AÇMA
    setup_stubs(ask=103.9, bid=103.89)
    bk.open_trade(CFG, {"code": "003", "direction": "long", "entry": 100.0, "stop": 98.0,
                        "target1": 104.0, "target2": 108.0, "confidence": 90}, fake_info())
    assert not sent, "düşük R:R sinyali AÇILMAMALI (kovalama yok)"
    print("OK bayat/düşük-R:R sinyali atlanıyor (ETH 10016 kökü)")


def t_skip_out_of_bracket():
    # Fiyat SL'in altına düşmüş → SL-TP aralığı dışında → AÇMA
    setup_stubs(ask=97.0, bid=96.99)
    bk.open_trade(CFG, {"code": "004", "direction": "long", "entry": 100.0, "stop": 98.0,
                        "target1": 104.0, "target2": 108.0, "confidence": 90}, fake_info())
    assert not sent, "aralık dışı sinyal AÇILMAMALI"
    print("OK SL-TP aralığı dışı sinyal atlanıyor")


def t_trail_absolute():
    # Backend stop'u 104000'e taşımış (Telegram güncellemesi) → SL tam ORAYA gitmeli
    setup_stubs(ask=104510, bid=104500)
    pos = SimpleNamespace(type=mt5.POSITION_TYPE_BUY, price_open=100050.0, sl=99549.0,
                          tp=110000.0, ticket=1, comment="BK#001", symbol="BTCUSD")
    bk.maybe_trail(CFG, pos, {"direction": "long", "entry": 100000.0, "stop": 104000.0})
    assert sent, "trail emri gitmeli"
    r = sent[-1]
    assert r["action"] == mt5.TRADE_ACTION_SLTP
    assert approx(r["sl"], 104000.0, tol=1.0), f"trail SL = MUTLAK stop (Telegram ile aynı): {r['sl']}"
    print("OK maybe_trail mutlak stop (Telegram güncellemesiyle birebir)")


def t_trail_dir_mismatch():
    setup_stubs(ask=2000, bid=2000)
    pos = SimpleNamespace(type=mt5.POSITION_TYPE_SELL, price_open=2000.0, sl=2010.0,
                          tp=1950.0, ticket=2, comment="BK#001", symbol="XAUUSD")
    bk.maybe_trail(CFG, pos, {"direction": "long", "entry": 1990.0, "stop": 1970.0})
    assert not sent, "yön uyuşmazlığında emir GİTMEMELİ"
    print("OK maybe_trail yön uyuşmazlığında dokunmuyor")


def t_no_hedge_suppress():
    feed = [
        {"instrumentId": "BTCUSD", "direction": "long", "code": "010A", "confidence": 70},
        {"instrumentId": "BTCUSD", "direction": "short", "code": "011A", "confidence": 60},
        {"instrumentId": "EURUSD", "direction": "long", "code": "012A", "confidence": 55},
    ]
    assert bk.suppressed_codes(feed, {"allow_hedge": False}) == {"011A"}, "düşük güvenli ters yön bastırılmalı"
    assert bk.suppressed_codes(feed, {"allow_hedge": True}) == set(), "hedge açıkken bastırma yok"
    print("OK no-hedge: çatışan düşük-güvenli yön bastırılıyor")


def t_dry_run_no_send():
    setup_stubs(ask=100.05, bid=100.04)
    dry = dict(CFG); dry["dry_run"] = True
    bk.open_trade(dry, {"code": "005", "direction": "long", "entry": 100.0, "stop": 98.0,
                        "target1": 104.0, "target2": 108.0, "confidence": 80}, fake_info())
    assert not sent, "dry_run'da order_send ÇAĞRILMAMALI"
    print("OK dry_run gerçekten emir göndermiyor")


def t_open_never_uses_return():
    setup_stubs(ask=100.05, bid=100.04)
    modes = []

    def unsupported(req):
        modes.append(req["type_filling"])
        return SimpleNamespace(retcode=10030, order=0, deal=0, volume=0,
                               price=0, comment="unsupported")

    mt5.order_send = unsupported
    bk.open_trade(CFG, {"code": "006", "direction": "long", "entry": 100.0,
                        "stop": 98.0, "target1": 104.0, "target2": 108.0,
                        "confidence": 80}, fake_info())
    assert modes == [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK]
    assert mt5.ORDER_FILLING_RETURN not in modes
    print("OK açılış IOC/FOK ile sınırlı; RETURN bekleyen kısmi emir riski yok")


def t_all_bridge_open_modes_exclude_return():
    modes = []

    def unsupported(req):
        modes.append(req["type_filling"])
        return SimpleNamespace(retcode=10030, order=0, deal=0, volume=0,
                               price=0, comment="unsupported")

    mt5.order_send = unsupported
    all_bk.send_with_filling({}, allow_return=False)
    assert modes == [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK]
    assert mt5.ORDER_FILLING_RETURN not in modes
    print("OK all-bots açılış filling zincirinde RETURN yok")


def t_all_feed_rr_between_1_5_and_2_reaches_brain():
    setup_stubs(ask=100.05, bid=100.04)
    mt5.positions_get = lambda *a, **k: []
    calls = []
    plan = SimpleNamespace(
        allowed=True,
        lot=0.01,
        decision=SimpleNamespace(
            requires_atomic_execution=False,
            target=130.0,
            reasons=[],
        ),
        metadata={},
    )
    originals = (
        all_bk.mt5_brain_adapter.enabled,
        all_bk.mt5_brain_adapter.evaluate,
        all_bk.mt5_brain_adapter.finalize,
    )
    cfg = dict(all_bk.DEFAULTS)
    cfg.update({
        "dry_run": True,
        "min_rr": 2.0,
        "min_feed_rr": 1.5,
        "max_per_symbol_side": 1,
    })
    signal = {
        "code": "RR170",
        "botId": 7,
        "botName": "RR test",
        "magic": 550057,
        "symbol": "EURUSD",
        "direction": "long",
        "entry": 100.0,
        "stop": 90.0,
        "target1": 117.0,
        "confidence": 80,
    }
    try:
        all_bk.mt5_brain_adapter.enabled = lambda _cfg: True

        def capture(*args, **kwargs):
            calls.append(kwargs)
            return plan

        all_bk.mt5_brain_adapter.evaluate = capture
        all_bk.mt5_brain_adapter.finalize = lambda *a, **k: True
        assert all_bk.open_from_feed(cfg, signal) == "dry"
        assert len(calls) == 1, "1.7R feed merkezi beyne ulasmali"

        too_low = dict(signal, code="RR149", target1=114.9)
        assert all_bk.open_from_feed(cfg, too_low) == "dusuk_rr"
        assert len(calls) == 1, "1.5R alti feed beyne ulasmamali"

        # Beyin kapali paper yolunda eski min_rr=2 yerel tabani aynen kalir.
        all_bk.mt5_brain_adapter.enabled = lambda _cfg: False
        assert all_bk.open_from_feed(cfg, signal) == "dusuk_rr"
    finally:
        (all_bk.mt5_brain_adapter.enabled,
         all_bk.mt5_brain_adapter.evaluate,
         all_bk.mt5_brain_adapter.finalize) = originals
    print("OK all-bots 1.5-2R feed beyne ulasiyor; legacy min_rr=2 korunuyor")


def t_finalize_failure_is_critical():
    setup_stubs(ask=100.05, bid=100.04)
    plan = SimpleNamespace(
        allowed=True, lot=0.02,
        decision=SimpleNamespace(requires_atomic_execution=False, reasons=[]),
    )
    originals = (
        bk.mt5_brain_adapter.enabled,
        bk.mt5_brain_adapter.evaluate,
        bk.mt5_brain_adapter.pre_send_check,
        bk.mt5_brain_adapter.finalize,
        bk.log.critical,
    )
    critical = []
    try:
        bk.mt5_brain_adapter.enabled = lambda cfg: True
        bk.mt5_brain_adapter.evaluate = lambda *a, **k: plan
        bk.mt5_brain_adapter.pre_send_check = lambda *a, **k: True
        bk.mt5_brain_adapter.finalize = lambda *a, **k: False
        bk.log.critical = lambda *a, **k: critical.append(a)
        bk.open_trade(CFG, {"code": "007", "direction": "long", "entry": 100.0,
                            "stop": 98.0, "target1": 104.0, "target2": 108.0,
                            "confidence": 80}, fake_info())
    finally:
        (bk.mt5_brain_adapter.enabled,
         bk.mt5_brain_adapter.evaluate,
         bk.mt5_brain_adapter.pre_send_check,
         bk.mt5_brain_adapter.finalize,
         bk.log.critical) = originals
    assert sent, "broker fill oluşmalı"
    assert critical and "FINALIZE" in critical[-1][0], "finalize False kritik log üretmeli"
    print("OK başarılı broker fill + finalize False kritik alarm")


def t_close_requires_position_absence():
    p = SimpleNamespace(type=mt5.POSITION_TYPE_BUY, ticket=41, identifier=4100,
                        comment="BK#041", symbol="EURUSD", volume=0.05)
    setup_stubs(ask=1.1010, bid=1.1008, positions=[p])

    def partial(req):
        sent.append(dict(req))
        return SimpleNamespace(retcode=getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010),
                               order=9, deal=10, volume=0.02,
                               price=req["price"], comment="partial")

    mt5.order_send = partial
    assert bk.close_position(CFG, p) is False, "kısmi dolumda pozisyon duruyorsa kapanmış sayılmaz"

    setup_stubs(ask=1.1010, bid=1.1008, positions=[])
    assert bk.close_position(CFG, p) is True, "ticket/identifier yoksa tam kapanış doğrulanır"
    print("OK kapanış retcode değil canlı pozisyon yokluğu ile doğrulanıyor")


def t_account_lock():
    # 2026-07: canli mod (dry_run != True) allowed_account + account_server ZORUNLU.
    assert bk.account_allowed({"allowed_account": 0, "dry_run": True}, None) is True, "dry-run + kilit kapali: izin"
    assert bk.account_allowed({"dry_run": True}, None) is True, "dry-run + anahtar yok: eski davranis"
    assert bk.account_allowed({"allowed_account": 0}, None) is False, "canli + kilitsiz: FAIL-CLOSED"
    assert bk.account_allowed({}, None) is False, "canli + anahtar yok: FAIL-CLOSED"
    live = {"allowed_account": TEST_LOGIN, "account_server": TEST_SERVER}
    assert bk.account_allowed(live, None) is False, "kilit acik + ai None: FAIL-CLOSED"
    assert bk.account_allowed({"allowed_account": TEST_LOGIN}, SimpleNamespace(login=TEST_LOGIN, server=TEST_SERVER)) is False, "canli + server yok: RED"
    wrong = SimpleNamespace(login=999, server=TEST_SERVER)
    assert bk.account_allowed(live, wrong) is False, "yanlis hesap: RED"
    wrong_srv = SimpleNamespace(login=TEST_LOGIN, server="Baska-Server")
    assert bk.account_allowed(live, wrong_srv) is False, "yanlis server: RED"
    right = SimpleNamespace(login=TEST_LOGIN, server=TEST_SERVER)
    assert bk.account_allowed(live, right) is True, "dogru hesap+server: izin"
    assert bk.account_allowed({"allowed_account": str(TEST_LOGIN), "account_server": TEST_SERVER}, right) is False, "string hesap: RED"
    print("OK hesap kilidi (fail-closed + login eslesmesi)")


def t_wrong_account_no_order():
    # YANLIS hesaba bagliyken open_trade EMIR GONDERMEMELI (emir-oncesi guard)
    setup_stubs(ask=100.05, bid=100.04)
    mt5.account_info = lambda: SimpleNamespace(login=999, server=TEST_SERVER, trade_allowed=True)
    locked = dict(CFG)
    bk.open_trade(locked, {"code": "099", "direction": "long", "entry": 100.0, "stop": 98.0,
                           "target1": 104.0, "target2": 108.0, "confidence": 80}, fake_info())
    assert not sent, "yanlis hesapta emir ACILMAMALI (hesap kilidi)"
    # Dogru hesaba baglaninca ayni sinyal ACILIR
    mt5.account_info = lambda: SimpleNamespace(login=TEST_LOGIN, server=TEST_SERVER, trade_allowed=True)
    bk.open_trade(locked, {"code": "099", "direction": "long", "entry": 100.0, "stop": 98.0,
                           "target1": 104.0, "target2": 108.0, "confidence": 80}, fake_info())
    assert sent, "dogru hesapta emir gitmeli"
    print("OK yanlis hesapta emir yok / dogru hesapta emir var")


def t_race_mode_still_has_risk_window_exits():
    """F5 (2026-08-01 dusman incelemesi): yaris modu kagit-yarisma kapatmasini
    devre disi birakir. Bu, birlesik kopruyu HICBIR cikis yolu olmadan
    birakiyordu: haber/hafta sonu yalnizca YENI EMRI engelliyordu.
    Artik feed'den BAGIMSIZ tahliye katmani var."""
    cfg = dict(CFG, race_mode=True, news_blackout=True, weekend_flatten=True)
    # Yaris modu kagit-kapatmayi kapatir (B4 davranisi korunuyor).
    assert trade_guard.paper_close_allowed(cfg) is False

    eur = SimpleNamespace(ticket=1, symbol="EURUSD", magic=550055, type=0,
                          volume=0.1, comment="BK#A", time=0, price_open=1.1)
    btc = SimpleNamespace(ticket=2, symbol="BTCUSD", magic=550055, type=0,
                          volume=0.1, comment="BK#B", time=0, price_open=60000.0)
    kapatilan = []

    def fake_close(_cfg, pos, reason):
        kapatilan.append((pos.symbol, reason))
        return True

    _pos, _close, _news, _weekend = (all_bk.our_positions, all_bk.close_position,
                                     all_bk.news_blackout_active,
                                     trade_guard.in_weekend_closed)
    try:
        all_bk.our_positions = lambda _c: [eur, btc]
        all_bk.close_position = fake_close

        # 1) Haber molasi -> kripto-disi pozisyon kapanir.
        all_bk.news_blackout_active = lambda _c: True
        trade_guard.in_weekend_closed = lambda *a, **k: False
        all_bk._flatten_for_risk_windows(cfg)
        assert kapatilan == [("EURUSD", "haber molasi")], kapatilan

        # 2) Hafta sonu -> kripto-disi pozisyon kapanir, kripto DOKUNULMAZ
        #    (bu koprude girise de izin verilir; asimetri olmasin).
        kapatilan.clear()
        all_bk.news_blackout_active = lambda _c: False
        trade_guard.in_weekend_closed = lambda *a, **k: True
        all_bk._flatten_for_risk_windows(cfg)
        assert kapatilan == [("EURUSD", "hafta sonu tahliyesi")], kapatilan

        # 3) Normal pencere -> hicbir sey kapanmaz.
        kapatilan.clear()
        trade_guard.in_weekend_closed = lambda *a, **k: False
        all_bk._flatten_for_risk_windows(cfg)
        assert kapatilan == [], kapatilan
    finally:
        all_bk.our_positions, all_bk.close_position = _pos, _close
        all_bk.news_blackout_active = _news
        trade_guard.in_weekend_closed = _weekend
    print("OK F5: yaris modunda bile haber/hafta sonu tahliyesi calisiyor")


def t_autotrading_button():
    # 'AutoTrading disabled by client' = terminal_info().trade_allowed (buton),
    # account_info().trade_allowed DEGIL. Dogru alani okumali.
    mt5.terminal_info = lambda: SimpleNamespace(trade_allowed=True)
    assert bk.autotrading_on() is True, "buton acik"
    mt5.terminal_info = lambda: SimpleNamespace(trade_allowed=False)
    assert bk.autotrading_on() is False, "buton kapali"
    mt5.terminal_info = lambda: None
    assert bk.autotrading_on() is False, "terminal_info None -> kapali say"
    print("OK autotrading butonu (terminal_info.trade_allowed)")


if __name__ == "__main__":
    t_lot(); t_open_long_absolute(); t_open_short_absolute(); t_skip_stale_rr()
    t_skip_out_of_bracket(); t_trail_absolute(); t_trail_dir_mismatch()
    t_no_hedge_suppress(); t_dry_run_no_send()
    t_open_never_uses_return(); t_all_bridge_open_modes_exclude_return()
    t_all_feed_rr_between_1_5_and_2_reaches_brain()
    t_finalize_failure_is_critical()
    t_close_requires_position_absence()
    t_account_lock(); t_wrong_account_no_order(); t_autotrading_button()
    t_race_mode_still_has_risk_window_exits()
    print("\nTUM TESTLER GECTI - OK")
