#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Köprü işlem matematiği testleri (MT5 stub'lanır — terminal gerekmez).
Çalıştır: python test_bridge.py"""
from types import SimpleNamespace
import MetaTrader5 as mt5
import borsakrali_mt5 as bk

CFG = {"lot_min": 0.01, "lot_max": 0.03, "conf_min": 60, "conf_max": 100,
       "max_lot": 0.05, "magic": 550055, "deviation_points": 30, "dry_run": False}

sent = []


def fake_info(name="EURUSD", digits=5, vmin=0.01, vmax=100.0, stops=0):
    return SimpleNamespace(name=name, digits=digits, point=10 ** (-digits),
                           volume_step=0.01, volume_min=vmin, volume_max=vmax,
                           visible=True, trade_stops_level=stops)


def setup_stubs(ask, bid):
    sent.clear()
    mt5.symbol_info = lambda n: fake_info(n) if n == "BTCUSD" else fake_info(n, digits=(2 if n == "BTCUSD" else 5))
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
    assert approx(bk.lot_for_confidence(CFG, 60, info), 0.01), "conf60→0.01"
    assert approx(bk.lot_for_confidence(CFG, 80, info), 0.02), "conf80→0.02"
    assert approx(bk.lot_for_confidence(CFG, 100, info), 0.03), "conf100→0.03"
    # broker min > max_lot → 0 (atla)
    assert bk.lot_for_confidence(CFG, 100, fake_info(vmin=0.10)) == 0.0, "vmin>max_lot→0"
    print("OK lot_for_confidence")


def t_open_long():
    setup_stubs(ask=100.05, bid=100.04)
    info = fake_info("EURUSD", digits=5)
    bk.open_trade(CFG, {"code": "001", "direction": "long", "entry": 100.0, "stop": 98.0,
                        "target1": 104.0, "target2": 108.0, "confidence": 80}, info)
    r = sent[-1]
    assert r["type"] == mt5.ORDER_TYPE_BUY, "long=BUY"
    assert approx(r["price"], 100.05), "long fill=ask"
    assert approx(r["sl"], 98.049), f"long sl {r['sl']}"   # 100.05*(1-0.02)
    assert approx(r["tp"], 104.052), f"long tp {r['tp']}"  # 100.05*(1+0.04)
    assert r["sl"] < r["price"] < r["tp"], "long: sl<fill<tp"
    assert r["comment"] == "BK#001"
    print("OK open_trade LONG (sl<fill<tp, %-mesafe brokera uygulandı)")


def t_open_short():
    setup_stubs(ask=1.1006, bid=1.0995)
    info = fake_info("GBPUSD", digits=5)
    bk.open_trade(CFG, {"code": "002", "direction": "short", "entry": 1.10, "stop": 1.11,
                        "target1": 1.08, "target2": 1.06, "confidence": 100}, info)
    r = sent[-1]
    assert r["type"] == mt5.ORDER_TYPE_SELL, "short=SELL"
    assert approx(r["price"], 1.0995), "short fill=bid"
    assert r["sl"] > r["price"] > r["tp"], f"short: sl>fill>tp ({r['sl']},{r['price']},{r['tp']})"
    print("OK open_trade SHORT (sl>fill>tp)")


def t_trail_into_profit():
    # Backend stop girişi GEÇTİ (kilitli kâr): SL fill ÜSTÜNE gitmeli (eski hata: altına düşüyordu)
    setup_stubs(ask=0, bid=0)
    pos = SimpleNamespace(type=mt5.POSITION_TYPE_BUY, price_open=100050.0, sl=99549.0,
                          tp=110000.0, ticket=1, comment="BK#001", symbol="BTCUSD")
    bk.maybe_trail(CFG, pos, {"direction": "long", "entry": 100000.0, "stop": 104000.0})
    assert sent, "trail emri gitmeli"
    r = sent[-1]
    assert r["action"] == mt5.TRADE_ACTION_SLTP
    assert approx(r["sl"], 104052.0, tol=1.0), f"trail sl kâr tarafında olmalı: {r['sl']}"
    assert r["sl"] > pos.price_open, "kilitli kâr: SL fill üstünde"
    print("OK maybe_trail kâra geçen stop'u doğru tarafa taşıyor")


def t_trail_dir_mismatch():
    # Feed yönü ≠ pozisyon yönü → DOKUNMA (kod tekrar kullanımı koruması)
    setup_stubs(ask=0, bid=0)
    pos = SimpleNamespace(type=mt5.POSITION_TYPE_SELL, price_open=2000.0, sl=2010.0,
                          tp=1950.0, ticket=2, comment="BK#001", symbol="XAUUSD")
    bk.maybe_trail(CFG, pos, {"direction": "long", "entry": 1990.0, "stop": 1970.0})
    assert not sent, "yön uyuşmazlığında emir GİTMEMELİ"
    print("OK maybe_trail yön uyuşmazlığında dokunmuyor")


def t_dry_run_no_send():
    setup_stubs(ask=100.05, bid=100.04)
    dry = dict(CFG); dry["dry_run"] = True
    bk.open_trade(dry, {"code": "003", "direction": "long", "entry": 100.0, "stop": 98.0,
                        "target1": 104.0, "target2": 108.0, "confidence": 80}, fake_info())
    assert not sent, "dry_run'da order_send ÇAĞRILMAMALI"
    print("OK dry_run gerçekten emir göndermiyor")


if __name__ == "__main__":
    t_lot(); t_open_long(); t_open_short(); t_trail_into_profit()
    t_trail_dir_mismatch(); t_dry_run_no_send()
    print("\nTUM TESTLER GECTI - OK")
