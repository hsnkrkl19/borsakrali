#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""GÜN-İÇİ tarayıcı köprüsü testleri (MT5 stub'lanır — terminal gerekmez).
Çalıştır: python -X utf8 test_scanner_bridge.py"""
import os
import json
import time
import tempfile
from datetime import datetime, timezone
from types import SimpleNamespace
import MetaTrader5 as mt5
import borsakrali_mt5_scanner as bk

CFG = {"max_lot": 10.0, "min_rr": 0.7, "magic": 550066, "deviation_points": 30,
       "dry_run": False, "no_new_after_tr_min": 1380, "eod_close_tr_min": 1425}

sent = []


def fake_info(name="XAUUSD", stops=0, vmin=0.01, vmax=100.0, step=0.01):
    digits = 2 if name in ("XAUUSD", "BTCUSD") else 5
    return SimpleNamespace(name=name, digits=digits, point=10 ** (-digits),
                           volume_step=step, volume_min=vmin, volume_max=vmax,
                           visible=True, trade_stops_level=stops, trade_freeze_level=0)


def setup_stubs(ask, bid, positions=()):
    sent.clear()
    mt5.symbol_info = lambda n: fake_info(n)
    mt5.symbol_info_tick = lambda n: SimpleNamespace(ask=ask, bid=bid)
    mt5.symbol_select = lambda *a: True
    mt5.positions_get = lambda: list(positions)

    def cap(req):
        sent.append(req)
        return SimpleNamespace(retcode=bk.RETCODE_OK, order=777, price=req.get("price", 0), comment="ok")
    mt5.order_send = cap
    mt5.last_error = lambda: (0, "ok")


def use_temp_state():
    fd, path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    os.unlink(path)
    bk.STATE_PATH = path
    return path


def fresh_state():
    return {"tickets": {}, "done": {}}


def approx(a, b, tol=1e-6):
    return abs(a - b) <= tol


def sig(**over):
    base = {"code": "GAU01", "instrumentId": "XAUUSD", "tf": "15m", "direction": "long",
            "entry": 4000.0, "stop": 3980.0, "target1": 4020.0, "target2": 4035.0,
            "lots": 0.05, "confidence": 72, "eodDeadlineSec": time.time() + 3600}
    base.update(over)
    return base


def fake_pos(ticket, comment, symbol="XAUUSD", magic=550066, ptype=0, price_current=4000.0):
    return SimpleNamespace(ticket=ticket, comment=comment, symbol=symbol, magic=magic,
                           type=ptype, volume=0.05, sl=3980.0, tp=4020.0, price_current=price_current)


# ── snap_lot: feed lotu aynen; limit aşımı KIRPMA değil RED; adım-dışı AŞAĞI ──
def t_snap_lot():
    info = fake_info()
    assert approx(bk.snap_lot(0.05, info, CFG), 0.05), "feed lotu aynen"
    assert approx(bk.snap_lot(1.96, info, CFG), 1.96), "büyük feed lotu aynen"
    assert approx(bk.snap_lot(6.7, info, CFG), 6.7), "SPX 5m tarzı büyük lot max_lot=10 altında geçer"
    assert bk.snap_lot(10.01, info, CFG) == 0.0, "max_lot aşımı → 0 (kırpılmaz)"
    assert bk.snap_lot(0.005, info, CFG) == 0.0, "vmin altı → 0"
    assert approx(bk.snap_lot(0.017, info, CFG), 0.01), "adım-dışı lot AŞAĞI tabanlanır (risk artmaz)"
    assert bk.snap_lot(None, info, CFG) == 0.0 and bk.snap_lot("x", info, CFG) == 0.0
    big = fake_info(vmax=1.0)
    assert bk.snap_lot(1.5, big, CFG) == 0.0, "broker vmax üstü → 0"
    print("OK snap_lot (feed lotu birebir, limit aşımı red, aşağı tabanlama)")


# ── TR saati (UTC+3 sabit) ───────────────────────────────────────────────────
def t_tr_minutes():
    assert bk.tr_minutes_now(datetime(2026, 7, 2, 20, 45, tzinfo=timezone.utc)) == 1425  # 23:45 TR
    assert bk.tr_minutes_now(datetime(2026, 7, 2, 20, 0, tzinfo=timezone.utc)) == 1380   # 23:00 TR
    assert bk.tr_minutes_now(datetime(2026, 7, 2, 21, 30, tzinfo=timezone.utc)) == 30    # 00:30 TR (gün sarması)
    print("OK tr_minutes_now (UTC+3, gün sarması)")


# ── open_trade: feed lot + MUTLAK SL/TP + BKG# + state (ticket→{code,eod}) ───
def t_open_long():
    use_temp_state()
    setup_stubs(ask=4000.5, bid=4000.3)
    state = fresh_state()
    s = sig()
    bk.open_trade(CFG, s, fake_info(), state)
    r = sent[-1]
    assert r["type"] == mt5.ORDER_TYPE_BUY
    assert approx(r["volume"], 0.05), "lot feed'den AYNEN"
    assert approx(r["sl"], 3980.0) and approx(r["tp"], 4020.0), "MUTLAK seviye"
    assert r["comment"] == "BKG#GAU01" and r["magic"] == 550066
    meta = state["tickets"].get("777")
    assert meta and meta["code"] == "GAU01" and approx(meta["eod"], s["eodDeadlineSec"]), "ticket→{code,eod} yedeği"
    print("OK open_trade LONG (feed lot, mutlak SL/TP, BKG#, state {code,eod})")


def t_open_short():
    use_temp_state()
    setup_stubs(ask=4000.5, bid=4000.3)
    bk.open_trade(CFG, sig(direction="short", stop=4020.0, target1=3980.0, target2=3965.0), fake_info(), fresh_state())
    r = sent[-1]
    assert r["type"] == mt5.ORDER_TYPE_SELL
    assert approx(r["sl"], 4020.0) and approx(r["tp"], 3980.0)
    assert r["tp"] < r["price"] < r["sl"]
    print("OK open_trade SHORT simetri")


def t_partial_fill_is_success():
    use_temp_state()
    setup_stubs(ask=4000.5, bid=4000.3)

    def cap(req):
        sent.append(req)
        return SimpleNamespace(retcode=bk.RETCODE_PARTIAL, order=888, price=req.get("price", 0), comment="partial")
    mt5.order_send = cap
    state = fresh_state()
    bk.open_trade(CFG, sig(), fake_info(), state)
    assert state["tickets"].get("888"), "KISMİ dolum başarı sayılır — kimlik yazılır (inceleme bulgusu)"
    print("OK partial fill (10010) başarı sayılır, state yazılır")


# ── bayat/kovalama korumaları ────────────────────────────────────────────────
def t_stale_guards():
    use_temp_state()
    setup_stubs(ask=4025.0, bid=4024.8)            # fiyat TP üstünde → bayat
    bk.open_trade(CFG, sig(), fake_info(), fresh_state())
    assert not sent, "SL–TP dışı → emir yok"
    setup_stubs(ask=4018.0, bid=4017.8)            # kalan RR (2/38) < 0.7
    bk.open_trade(CFG, sig(), fake_info(), fresh_state())
    assert not sent, "düşük kalan R:R → emir yok"
    setup_stubs(ask=4000.5, bid=4000.3)            # dry_run → emir yok
    bk.open_trade({**CFG, "dry_run": True}, sig(), fake_info(), fresh_state())
    assert not sent, "dry_run → emir yok"
    print("OK bayat fiyat + düşük RR + dry_run korumaları")


# ── kimlik: comment → state fallback → unknown bloklama ──────────────────────
def t_identity():
    path = use_temp_state()
    p1 = fake_pos(1, "BKG#GAU01")          # comment sağlam
    p2 = fake_pos(2, "")                    # comment silinmiş, state'te var
    p3 = fake_pos(3, "", symbol="BTCUSD")   # kimliksiz → unknown
    p4 = fake_pos(4, "BK#074A", magic=550055)  # FOREX köprüsünün pozisyonu — bizim değil
    setup_stubs(4000.5, 4000.3, positions=[p1, p2, p3, p4])
    state = {"tickets": {"2": {"code": "GET05", "eod": None}}, "done": {}}
    by_code, unknown = bk.identify_positions(CFG, [p1, p2, p3, p4], state)
    assert set(by_code.keys()) == {"GAU01", "GET05"}, by_code.keys()
    assert [p.ticket for p in unknown] == [3], "kimliksiz pozisyon unknown"
    assert state["tickets"].get("1", {}).get("code") == "GAU01", "comment'ten öğrenilen kod state'e yazıldı"
    with open(path, encoding="utf-8") as f:
        assert json.load(f)["tickets"]["2"]["code"] == "GET05"
    print("OK identify_positions kimlik (comment → state → unknown) + forex magic ayrımı")


# ── done-kodları: broker tarafında kapanan kod ASLA yeniden açılmaz ──────────
def t_reconcile_done():
    use_temp_state()
    state = {"tickets": {"10": {"code": "GBT01", "eod": None}, "11": {"code": "GET01", "eod": None}}, "done": {}}
    # ticket 10 MT5'te KAPANDI (broker SL) ama GBT01 hâlâ feed'de → done
    # ticket 11 hâlâ açık. Feed'de olmayan eski done kaydı temizlenir.
    state["done"]["GXX99"] = 123.0
    bk.reconcile_closures(state, open_tickets={"11"}, feed_codes={"GBT01", "GET01"})
    assert "GBT01" in state["done"], "broker-kapanış → done (yeniden açılmaz — zincirleme stop koruması)"
    assert "10" not in state["tickets"] and "11" in state["tickets"]
    assert "GXX99" not in state["done"], "feed'den düşen done kaydı temizlendi"
    print("OK reconcile_closures (broker SL → done; done temizliği)")


# ── saklanan gün-sonu vakti: pencereden/feed'den bağımsız kapanış listesi ────
def t_past_deadline():
    use_temp_state()
    p = fake_pos(20, "BKG#GAU05")
    state = {"tickets": {"20": {"code": "GAU05", "eod": time.time() - 60}}, "done": {}}
    out = bk.past_deadline_positions(state, {"GAU05": p})
    assert [x.ticket for x in out] == [20], "süresi geçen pozisyon kapanış listesinde"
    state["tickets"]["20"]["eod"] = time.time() + 3600
    assert bk.past_deadline_positions(state, {"GAU05": p}) == [], "süresi gelmeyen listede değil"
    state["tickets"]["20"]["eod"] = None
    assert bk.past_deadline_positions(state, {"GAU05": p}) == [], "eod bilinmiyorsa 23:45 süpürmesine kalır"
    print("OK past_deadline_positions (saklanan vakitle feed-bağımsız gün sonu)")


# ── close_position: tick yoksa price_current fallback (sessiz atlama YOK) ────
def t_close_tick_fallback():
    use_temp_state()
    setup_stubs(4000.5, 4000.3)
    mt5.symbol_info_tick = lambda n: None  # tick akışı kesik
    p = fake_pos(30, "BKG#GAU07", price_current=4011.5)
    ok = bk.close_position(CFG, p, "test")
    assert ok and sent, "tick None → price_current ile kapanış DENENDİ (inceleme bulgusu)"
    assert approx(sent[-1]["price"], 4011.5)
    print("OK close_position tick-None fallback (price_current, loglu)")


# ── eski düz state şeması otomatik yükseltilir ───────────────────────────────
def t_state_upgrade():
    path = use_temp_state()
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"5": "GBT03"}, f)
    st = bk.load_state()
    assert st["tickets"]["5"]["code"] == "GBT03" and st["done"] == {}
    print("OK eski state şeması yükseltme")


# ── comment yardımcıları ─────────────────────────────────────────────────────
def t_comment():
    assert bk.code_comment("GBT01") == "BKG#GBT01"
    assert bk.parse_code("BKG#GBT01") == "GBT01"
    assert bk.parse_code("BK#074A") is None, "forex comment'i bizim değil"
    assert bk.parse_code("") is None and bk.parse_code(None) is None
    print("OK comment/parse (BKG# öneki, forex BK# ile karışmaz)")


if __name__ == "__main__":
    t_snap_lot()
    t_tr_minutes()
    t_open_long()
    t_open_short()
    t_partial_fill_is_success()
    t_stale_guards()
    t_identity()
    t_reconcile_done()
    t_past_deadline()
    t_close_tick_fallback()
    t_state_upgrade()
    t_comment()
    print("\nHEPSİ YEŞİL ✅")
