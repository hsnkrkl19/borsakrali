#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Köprü işlem matematiği testleri (MT5 stub'lanır — terminal gerekmez).
Çalıştır: python test_bridge.py"""
from types import SimpleNamespace
import MetaTrader5 as mt5
import borsakrali_mt5 as bk

CFG = {"lot_min": 0.01, "lot_max": 0.03, "conf_min": 60, "conf_max": 100,
       "max_lot": 0.05, "min_rr": 0.7, "magic": 550055, "deviation_points": 30, "dry_run": False}

sent = []


def fake_info(name="EURUSD", stops=0):
    digits = 2 if name == "BTCUSD" else 5
    return SimpleNamespace(name=name, digits=digits, point=10 ** (-digits),
                           volume_step=0.01, volume_min=0.01, volume_max=100.0,
                           visible=True, trade_stops_level=stops, trade_freeze_level=0)


def setup_stubs(ask, bid):
    sent.clear()
    mt5.symbol_info = lambda n: fake_info(n)
    mt5.symbol_info_tick = lambda n: SimpleNamespace(ask=ask, bid=bid)
    mt5.symbol_select = lambda *a: True

    def cap(req):
        sent.append(req)
        return SimpleNamespace(retcode=mt5.TRADE_RETCODE_DONE, order=1, price=req.get("price", 0), comment="ok")
    mt5.order_send = cap
    mt5.last_error = lambda: (0, "ok")


def approx(a, b, tol=1e-3):
    return abs(a - b) <= tol


def t_lot():
    info = fake_info()
    assert approx(bk.lot_for_confidence(CFG, 60, info), 0.01)
    assert approx(bk.lot_for_confidence(CFG, 80, info), 0.02)
    assert approx(bk.lot_for_confidence(CFG, 100, info), 0.03)
    bad = SimpleNamespace(volume_step=0.01, volume_min=0.10, volume_max=100.0)
    assert bk.lot_for_confidence(CFG, 100, bad) == 0.0, "vmin>max_lot→0"
    print("OK lot_for_confidence")


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


def t_account_lock():
    # Saf mantık: kilit kapalı → hep izin; kilit açık → fail-closed + login eşleşmesi
    assert bk.account_allowed({"allowed_account": 0}, None) is True, "kilit kapali: izin"
    assert bk.account_allowed({}, None) is True, "anahtar yok: eski davranis"
    assert bk.account_allowed({"allowed_account": 1513857844}, None) is False, "kilit acik + ai None: FAIL-CLOSED"
    wrong = SimpleNamespace(login=999)
    assert bk.account_allowed({"allowed_account": 1513857844}, wrong) is False, "yanlis hesap: RED"
    right = SimpleNamespace(login=1513857844)
    assert bk.account_allowed({"allowed_account": 1513857844}, right) is True, "dogru hesap: izin"
    print("OK hesap kilidi (fail-closed + login eslesmesi)")


def t_wrong_account_no_order():
    # YANLIS hesaba bagliyken open_trade EMIR GONDERMEMELI (emir-oncesi guard)
    setup_stubs(ask=100.05, bid=100.04)
    mt5.account_info = lambda: SimpleNamespace(login=999, trade_allowed=True)
    locked = dict(CFG); locked["allowed_account"] = 1513857844
    bk.open_trade(locked, {"code": "099", "direction": "long", "entry": 100.0, "stop": 98.0,
                           "target1": 104.0, "target2": 108.0, "confidence": 80}, fake_info())
    assert not sent, "yanlis hesapta emir ACILMAMALI (hesap kilidi)"
    # Dogru hesaba baglaninca ayni sinyal ACILIR
    mt5.account_info = lambda: SimpleNamespace(login=1513857844, trade_allowed=True)
    bk.open_trade(locked, {"code": "099", "direction": "long", "entry": 100.0, "stop": 98.0,
                           "target1": 104.0, "target2": 108.0, "confidence": 80}, fake_info())
    assert sent, "dogru hesapta emir gitmeli"
    print("OK yanlis hesapta emir yok / dogru hesapta emir var")


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
    t_account_lock(); t_wrong_account_no_order(); t_autotrading_button()
    print("\nTUM TESTLER GECTI - OK")
