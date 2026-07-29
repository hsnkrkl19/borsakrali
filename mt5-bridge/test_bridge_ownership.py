#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Birleşik köprü SAHİPLİK testi (2026-07-24 denetimi).
MT5 + requests stub'lı — terminal/ağ gerekmez. Çalıştır: python test_bridge_ownership.py

HATA: report_mt5_state() `magic > 0` olan HER açık pozisyonu siteye bildiriyordu.
Oysa hesapta bu köprünün açmadığı işlemler de var:
  • 550055 → adanmış forex köprüsü (borsakrali_mt5.py)
  • 550066 → adanmış gün-içi tarayıcı köprüsü (borsakrali_mt5_scanner.py)
  • 20260707 → platform DIŞI standalone altın botu
Bunlar POST /api/bridge/state'e "bu köprü açtı" gibi gidiyor, mt5TradeNotifier
onları "🤖 Magic 550055" başlığıyla duyuruyordu.

KURAL: bu uçtan YALNIZ bu köprünün açtığı pozisyonlar (comment 'A#…') bildirilir —
our_positions() ile aynı ölçüt.
"""
import os
import sys
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# ── MT5 + requests stub'ları (import'tan ÖNCE) ──────────────────────────────
_POSITIONS = []


class _FakeMT5(SimpleNamespace):
    POSITION_TYPE_BUY = 0

    @staticmethod
    def positions_get():
        return list(_POSITIONS)


_POSTS = []


class _FakeResp:
    status_code = 200
    text = "ok"


def _fake_post(url, **kw):
    _POSTS.append({"url": url, "json": kw.get("json")})
    return _FakeResp()


sys.modules["MetaTrader5"] = _FakeMT5()
sys.modules["requests"] = SimpleNamespace(post=_fake_post, get=None, exceptions=SimpleNamespace())

import borsakrali_mt5_all as bridge  # noqa: E402


def pos(ticket, magic, comment, symbol="EURUSD"):
    return SimpleNamespace(ticket=ticket, magic=magic, comment=comment, symbol=symbol,
                           type=0, volume=0.05, price_open=1.1, sl=1.09, tp=1.12, time=1753300000)


CFG = {
    "backend_url": "https://www.borsakrali.com", "exec_token": "t",
    "dry_run": True, "central_brain_enabled": False,
}


def t_yalniz_kendi_pozisyonlarini_bildirir():
    global _POSITIONS
    _POSITIONS = [
        pos(111, 5716, "A#mt5-trend:1"),          # BU köprü açtı → bildirilmeli
        pos(222, 5750, "A#bk-xau:2", "XAUUSD"),   # BU köprü açtı → bildirilmeli
        pos(333, 550055, "BK#F12"),               # adanmış forex köprüsü → HAYIR
        pos(444, 550066, "BKG#G3", "XAUUSD"),     # adanmış tarayıcı köprüsü → HAYIR
        pos(555, 20260707, "gold-bot", "XAUUSD"), # standalone altın botu → HAYIR
        pos(666, 0, ""),                          # elle açılmış → HAYIR
    ]
    _POSTS.clear()
    bridge._notified_open.clear()
    bridge._last_state_report = 0.0
    bridge.report_mt5_state(CFG)

    assert len(_POSTS) == 1, "tek POST bekleniyordu, %d" % len(_POSTS)
    tickets = sorted(r["ticket"] for r in _POSTS[0]["json"]["open"])
    assert tickets == ["111", "222"], tickets
    magics = {r["magic"] for r in _POSTS[0]["json"]["open"]}
    for yabanci in (550055, 550066, 20260707):
        assert yabanci not in magics, "yabanci magic siteye bildirildi: %d" % yabanci
    print("OK report_mt5_state yalniz 'A#' comment'li kendi pozisyonlarini bildirir")


def t_yabanci_pozisyon_varsa_hic_post_atmaz():
    global _POSITIONS
    _POSITIONS = [pos(333, 550055, "BK#F12"), pos(555, 20260707, "gold", "XAUUSD")]
    _POSTS.clear()
    bridge._notified_open.clear()
    bridge._last_state_report = 0.0
    bridge.report_mt5_state(CFG)
    assert _POSTS == [], "bildirilecek kendi pozisyonu yokken POST atildi"
    print("OK yalniz yabanci pozisyon varken POST atilmaz")


def t_ayni_ticket_iki_kez_bildirilmez():
    global _POSITIONS
    _POSITIONS = [pos(111, 5716, "A#mt5-trend:1")]
    _POSTS.clear()
    bridge._notified_open.clear()
    bridge._last_state_report = 0.0
    bridge.report_mt5_state(CFG)
    bridge._last_state_report = 0.0        # throttle'i by-pass et
    bridge.report_mt5_state(CFG)
    assert len(_POSTS) == 1, "ayni ticket tekrar bildirildi (%d POST)" % len(_POSTS)
    print("OK ayni ticket tekrar bildirilmez (dedup korundu)")


def t_our_positions_comment_bazli():
    global _POSITIONS
    _POSITIONS = [pos(111, 5716, "A#x"), pos(333, 550055, "BK#F12")]
    own = bridge.our_positions(CFG)
    assert [p.ticket for p in own] == [111], [p.ticket for p in own]
    print("OK our_positions comment 'A#' bazli (magic'e bakmaz)")


def t_merkez_beyin_lifecycle_tek_sahip():
    global _POSITIONS
    _POSITIONS = [pos(111, 5716, "A#mt5-trend:1")]
    _POSTS.clear()
    bridge.report_mt5_state(dict(CFG, central_brain_enabled=True))
    assert _POSTS == [], "merkez lifecycle aktifken legacy POST atildi"
    print("OK merkez beyin aktifken legacy lifecycle susturulur")


if __name__ == "__main__":
    t_our_positions_comment_bazli()
    t_merkez_beyin_lifecycle_tek_sahip()
    t_yalniz_kendi_pozisyonlarini_bildirir()
    t_yabanci_pozisyon_varsa_hic_post_atmaz()
    t_ayni_ticket_iki_kez_bildirilmez()
    print("\nTUM TESTLER GECTI (kopru sahiplik)")
