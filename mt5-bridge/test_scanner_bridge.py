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
try:
    import MetaTrader5 as mt5
except ModuleNotFoundError:
    from mt5_test_stub import install
    mt5 = install()
import borsakrali_mt5_scanner as bk

# Keep ordinary unit cases independent of the live central-brain daemon.
bk.mt5_brain_adapter.enabled = lambda cfg: bool(cfg.get("_offline_brain_enabled"))

TEST_LOGIN = 1514061487
TEST_SERVER = "FTMO-Demo"
CFG = {"max_lot": 10.0, "min_rr": 0.7, "magic": 550066, "deviation_points": 30,
       "dry_run": False, "no_new_after_tr_min": 1380, "eod_close_tr_min": 1425,
       "allowed_account": TEST_LOGIN, "account_server": TEST_SERVER}

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
    mt5.account_info = lambda: SimpleNamespace(login=TEST_LOGIN, server=TEST_SERVER,
                                               trade_allowed=True)

    def cap(req):
        sent.append(req)
        return SimpleNamespace(retcode=bk.RETCODE_OK, order=777, deal=778,
                               volume=req.get("volume", 0),
                               price=req.get("price", 0), comment="ok")
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


def fake_pos(ticket, comment, symbol="XAUUSD", magic=550066, ptype=0,
             price_current=4000.0, identifier=None, ptime=1):
    return SimpleNamespace(ticket=ticket, identifier=(ticket if identifier is None else identifier),
                           comment=comment, symbol=symbol, magic=magic, time=ptime,
                           type=ptype, volume=0.05, sl=3980.0, tp=4020.0, price_current=price_current)


# ── snap_lot: tavan aşımı artık RED değil AŞAĞI KIRPMA (2026-07-24) ──────────
# Kullanıcı lot aralığını 0.01–0.15'e indirdi. Eski davranış (tavanı aşan feed
# lotunu 0 döndürüp işlemi ATLAMAK) bu tavanla neredeyse HER sinyali sessizce
# iptal ederdi. Aşağı kırpmak riski asla artırmaz → kırpma doğru davranış.
def t_snap_lot():
    info = fake_info()
    assert approx(bk.snap_lot(0.05, info, CFG), 0.05), "tavan altı feed lotu aynen"
    assert approx(bk.snap_lot(0.15, info, CFG), 0.15), "tam tavan geçer"
    assert approx(bk.snap_lot(1.96, info, CFG), 0.15), "tavan üstü KIRPILIR (eskiden 0 dönerdi)"
    assert approx(bk.snap_lot(6.7, info, CFG), 0.15), "büyük lot da 0.15'e kırpılır"
    assert bk.snap_lot(0.005, info, CFG) == 0.0, "risk lotu vmin altindaysa yukari buyutulmez"
    assert approx(bk.snap_lot(0.017, info, CFG), 0.01), "adım-dışı lot AŞAĞI tabanlanır (risk artmaz)"
    assert bk.snap_lot(None, info, CFG) == 0.0 and bk.snap_lot("x", info, CFG) == 0.0
    assert bk.snap_lot(0, info, CFG) == 0.0
    # Broker asgarisi tavanımızın ÜSTÜNDEyse işlem açılamaz (fail-closed korunur).
    assert bk.snap_lot(1.0, fake_info(vmin=0.5), CFG) == 0.0, "broker vmin > 0.15 → işlem yok"
    # Broker azamisi bizim tavanımızdan düşükse o geçerli.
    assert approx(bk.snap_lot(1.0, fake_info(vmax=0.05), CFG), 0.05), "broker vmax daha düşükse o bağlar"
    print("OK snap_lot (0.01-0.15 tavanina KIRPMA, asagi tabanlama, fail-closed vmin)")


# ── TR saati (UTC+3 sabit) ───────────────────────────────────────────────────
def t_tr_minutes():
    assert bk.tr_minutes_now(datetime(2026, 7, 2, 20, 45, tzinfo=timezone.utc)) == 1425  # 23:45 TR
    assert bk.tr_minutes_now(datetime(2026, 7, 2, 20, 0, tzinfo=timezone.utc)) == 1380   # 23:00 TR
    assert bk.tr_minutes_now(datetime(2026, 7, 2, 21, 30, tzinfo=timezone.utc)) == 30    # 00:30 TR (gün sarması)
    print("OK tr_minutes_now (UTC+3, gün sarması)")


# ── open_trade: feed lot + MUTLAK SL/TP + canlı position identifier state ────
def t_open_long():
    use_temp_state()
    live = fake_pos(901, "BKG#GAU01", identifier=7001)
    setup_stubs(ask=4000.5, bid=4000.3, positions=[live])
    state = fresh_state()
    s = sig()
    bk.open_trade(CFG, s, fake_info(), state)
    r = sent[-1]
    assert r["type"] == mt5.ORDER_TYPE_BUY
    assert approx(r["volume"], 0.05), "lot feed'den AYNEN"
    assert approx(r["sl"], 3980.0) and approx(r["tp"], 4020.0), "MUTLAK seviye"
    assert r["comment"] == "BKG#GAU01" and r["magic"] == 550066
    meta = state["tickets"].get("7001")
    assert "777" not in state["tickets"], "order bileti position kimliği diye yazılamaz"
    assert meta and meta["ticket"] == "901" and meta["identifier"] == "7001"
    assert meta["code"] == "GAU01" and approx(meta["eod"], s["eodDeadlineSec"])
    print("OK open_trade LONG (canlı position ticket+identifier, EOD state)")


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
    live = fake_pos(902, "BKG#GAU01", identifier=7002)
    setup_stubs(ask=4000.5, bid=4000.3, positions=[live])

    def cap(req):
        sent.append(req)
        return SimpleNamespace(retcode=bk.RETCODE_PARTIAL, order=888, deal=889,
                               volume=0.02, price=req.get("price", 0), comment="partial")
    mt5.order_send = cap
    state = fresh_state()
    bk.open_trade(CFG, sig(), fake_info(), state)
    assert state["tickets"].get("7002"), "IOC/FOK kısmi dolumu canlı identifier ile yazılır"
    assert "888" not in state["tickets"], "order bileti state anahtarı değildir"
    print("OK IOC/FOK partial fill canlı position identifier ile reconcile edildi")


def t_open_never_uses_return():
    setup_stubs(ask=4000.5, bid=4000.3)
    modes = []

    def unsupported(req):
        modes.append(req["type_filling"])
        return SimpleNamespace(retcode=bk.RETCODE_BAD_FILLING, order=0, deal=0,
                               volume=0, price=0, comment="unsupported")

    mt5.order_send = unsupported
    bk.open_trade(CFG, sig(code="GAU02"), fake_info(), fresh_state())
    assert modes == [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK]
    assert mt5.ORDER_FILLING_RETURN not in modes
    print("OK scanner açılışı IOC/FOK ile sınırlı; RETURN denenmiyor")


def t_pending_fill_migrates_without_losing_eod():
    use_temp_state()
    setup_stubs(ask=4000.5, bid=4000.3, positions=[])
    state = fresh_state()
    s = sig(code="GAU12")
    bk.open_trade(CFG, s, fake_info(), state)
    assert "GAU12" in state.get("pending", {})
    assert "777" not in state["tickets"], "order/deal ticket state kimliği olamaz"
    live = fake_pos(912, "BKG#GAU12", identifier=7012)
    by_code, unknown = bk.identify_positions(CFG, [live], state)
    assert not unknown and "GAU12" in by_code
    assert "GAU12" not in state["pending"]
    assert approx(state["tickets"]["7012"]["eod"], s["eodDeadlineSec"])
    print("OK gecikmiş canlı position reconcile edildi; pending EOD korundu")


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
    p1 = fake_pos(101, "BKG#GAU01", identifier=9001)  # comment sağlam
    p2 = fake_pos(202, "", identifier=9002)           # comment silinmiş, state'te var
    p3 = fake_pos(3, "", symbol="BTCUSD")   # kimliksiz → unknown
    p4 = fake_pos(4, "BK#074A", magic=550055)  # FOREX köprüsünün pozisyonu — bizim değil
    setup_stubs(4000.5, 4000.3, positions=[p1, p2, p3, p4])
    eod = time.time() + 1800
    state = {"tickets": {"202": {"code": "GET05", "eod": eod}},
             "pending": {}, "done": {}}
    by_code, unknown = bk.identify_positions(CFG, [p1, p2, p3, p4], state)
    assert set(by_code.keys()) == {"GAU01", "GET05"}, by_code.keys()
    assert [p.ticket for p in unknown] == [3], "kimliksiz pozisyon unknown"
    assert state["tickets"].get("9001", {}).get("ticket") == "101"
    assert state["tickets"].get("9002", {}).get("code") == "GET05"
    assert approx(state["tickets"]["9002"]["eod"], eod), "legacy ticket EOD korunmalı"
    assert "202" not in state["tickets"], "legacy ticket anahtarı identifier'a taşınmalı"
    with open(path, encoding="utf-8") as f:
        assert json.load(f)["tickets"]["9002"]["code"] == "GET05"
    print("OK identify_positions canlı identifier + legacy ticket/EOD migration")


def t_service_ticket_change_keeps_eod():
    use_temp_state()
    eod = time.time() + 900
    state = {"tickets": {"9900": {"code": "GAU11", "eod": eod,
                                    "ticket": "301", "identifier": "9900"}},
             "pending": {}, "done": {}}
    changed_ticket = fake_pos(399, "", identifier=9900)
    by_code, unknown = bk.identify_positions(CFG, [changed_ticket], state)
    assert not unknown and by_code["GAU11"].ticket == 399
    assert state["tickets"]["9900"]["ticket"] == "399"
    assert approx(state["tickets"]["9900"]["eod"], eod)
    bk.reconcile_closures(state, open_position_ids={"9900"}, feed_codes={"GAU11"})
    assert "GAU11" not in state["done"], "ticket değişimi broker kapanışı sanılmamalı"
    print("OK service ticket değişiminde identifier ve EOD korunuyor")


# ── done-kodları: broker tarafında kapanan kod ASLA yeniden açılmaz ──────────
def t_reconcile_done():
    use_temp_state()
    state = {"tickets": {"10": {"code": "GBT01", "eod": None}, "11": {"code": "GET01", "eod": None}}, "done": {}}
    # ticket 10 MT5'te KAPANDI (broker SL) ama GBT01 hâlâ feed'de → done
    # ticket 11 hâlâ açık. Feed'den düşen done kaydı 3 ARDIŞIK dolu-feed'de
    # görünmeyince temizlenir (2026-07-06: tek geçici/eksik feed done'u silip
    # broker-kapalı kodun yeniden açılmasına izin veriyordu).
    state["done"]["GXX99"] = 123.0
    bk.reconcile_closures(state, open_position_ids={"11"}, feed_codes={"GBT01", "GET01"})
    assert "GBT01" in state["done"], "broker-kapanış → done (yeniden açılmaz — zincirleme stop koruması)"
    assert "10" not in state["tickets"] and "11" in state["tickets"]
    assert "GXX99" in state["done"], "1. eksik dolu-feed done'u HENÜZ silmez (geçici feed koruması)"
    bk.reconcile_closures(state, open_position_ids={"11"}, feed_codes={"GBT01", "GET01"})
    assert "GXX99" in state["done"], "2. eksik dolu-feed de silmez"
    # araya kod feed'e GERİ gelirse sayaç sıfırlanır
    bk.reconcile_closures(state, open_position_ids={"11"}, feed_codes={"GBT01", "GET01", "GXX99"})
    bk.reconcile_closures(state, open_position_ids={"11"}, feed_codes={"GBT01", "GET01"})
    bk.reconcile_closures(state, open_position_ids={"11"}, feed_codes={"GBT01", "GET01"})
    assert "GXX99" in state["done"], "geri gelen kod sayacı sıfırladı — 2 eksik yetmez"
    bk.reconcile_closures(state, open_position_ids={"11"}, feed_codes={"GBT01", "GET01"})
    assert "GXX99" not in state["done"], "3 ardışık eksik dolu-feed → done temizlendi"
    # BOŞ feed done'a asla dokunmaz
    state["done"]["GYY88"] = 456.0
    bk.reconcile_closures(state, open_position_ids={"11"}, feed_codes=set())
    assert "GYY88" in state["done"], "boş feed done'u SİLMEZ (backend arızası koruması)"
    print("OK reconcile_closures (broker SL -> done; 3-yoklama done temizligi + bos-feed korumasi)")


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


def t_account_lock():
    # 2026-07: canli mod (dry_run != True) allowed_account + account_server ZORUNLU.
    assert bk.account_allowed({"allowed_account": 0, "dry_run": True}, None) is True
    assert bk.account_allowed({"allowed_account": 0}, None) is False, "canli + kilitsiz: FAIL-CLOSED"
    live = {"allowed_account": TEST_LOGIN, "account_server": TEST_SERVER}
    assert bk.account_allowed(live, None) is False, "fail-closed"
    assert bk.account_allowed(live, SimpleNamespace(login=999, server=TEST_SERVER)) is False
    assert bk.account_allowed(live, SimpleNamespace(login=TEST_LOGIN, server="Baska")) is False
    assert bk.account_allowed(live, SimpleNamespace(login=TEST_LOGIN, server=TEST_SERVER)) is True
    print("OK hesap kilidi (fail-closed + login eslesmesi)")


def t_wrong_account_no_order():
    # YANLIS hesaba bagliyken open_trade EMIR GONDERMEMELI
    use_temp_state()
    setup_stubs(ask=4000.5, bid=4000.3)
    locked = dict(CFG)
    mt5.account_info = lambda: SimpleNamespace(login=999, server=TEST_SERVER, trade_allowed=True)
    bk.open_trade(locked, sig(), fake_info(), fresh_state())
    assert not sent, "yanlis hesapta emir ACILMAMALI"
    mt5.account_info = lambda: SimpleNamespace(login=TEST_LOGIN, server=TEST_SERVER, trade_allowed=True)
    bk.open_trade(locked, sig(), fake_info(), fresh_state())
    assert sent, "dogru hesapta emir gitmeli"
    print("OK yanlis hesapta emir yok / dogru hesapta emir var")


def t_autotrading_button():
    mt5.terminal_info = lambda: SimpleNamespace(trade_allowed=True)
    assert bk.autotrading_on() is True
    mt5.terminal_info = lambda: SimpleNamespace(trade_allowed=False)
    assert bk.autotrading_on() is False
    mt5.terminal_info = lambda: None
    assert bk.autotrading_on() is False
    print("OK autotrading butonu (terminal_info.trade_allowed)")


if __name__ == "__main__":
    t_snap_lot()
    t_tr_minutes()
    t_open_long()
    t_open_short()
    t_account_lock()
    t_wrong_account_no_order()
    t_autotrading_button()
    t_partial_fill_is_success()
    t_open_never_uses_return()
    t_pending_fill_migrates_without_losing_eod()
    t_stale_guards()
    t_identity()
    t_service_ticket_change_keeps_eod()
    t_reconcile_done()
    t_past_deadline()
    t_close_tick_fallback()
    t_state_upgrade()
    t_comment()
    print("\nHEPSI YESIL - OK")
