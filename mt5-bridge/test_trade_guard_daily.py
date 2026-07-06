#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""trade_guard GÜNLÜK ZARAR DEVRE-KESİCİSİ testleri (2026-07-06 olayı düzeltmesi).
MT5 stub'lı — terminal gerekmez. Çalıştır: python test_trade_guard_daily.py"""
import sys
import os
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trade_guard  # noqa: E402


def deal(magic, profit, entry=1, swap=0.0, commission=0.0, symbol="XAUUSD"):
    return SimpleNamespace(magic=magic, profit=profit, swap=swap,
                           commission=commission, entry=entry, symbol=symbol)


def pos(magic, profit, swap=0.0):
    return SimpleNamespace(magic=magic, profit=profit, swap=swap)


class FakeMT5:
    DEAL_ENTRY_IN = 0  # gerçek sabitle aynı anlam: 0 = giriş deal'i

    def __init__(self, deals=None, positions=None, balance=100000.0):
        self._deals = deals
        self._positions = positions or []
        self._balance = balance

    def history_deals_get(self, *a, **k):
        return self._deals

    def positions_get(self):
        return self._positions

    def account_info(self):
        if self._balance is None:
            return None
        return SimpleNamespace(balance=self._balance, equity=self._balance)


CFG = {"magic": 550055, "max_daily_loss_pct": 3.0, "max_daily_loss_pct_account": 4.5}


def t_daily_pnl():
    m = FakeMT5(deals=[deal(550055, -100), deal(550066, -50), deal(550055, -20, swap=-1, commission=-2)],
                positions=[pos(550055, -30), pos(660066, -10)])
    r, f, ok = trade_guard.daily_pnl_usd(m, magic=550055)
    assert ok and abs(r - (-123.0)) < 1e-9, r   # yalnız 550055 deal'leri (swap+komisyon dahil)
    assert abs(f - (-30.0)) < 1e-9, f           # yalnız 550055 pozisyonları
    r2, f2, ok2 = trade_guard.daily_pnl_usd(m, magic=None)
    assert ok2 and abs(r2 - (-173.0)) < 1e-9 and abs(f2 - (-40.0)) < 1e-9, (r2, f2)
    _, _, ok3 = trade_guard.daily_pnl_usd(FakeMT5(deals=None), magic=550055)
    assert ok3 is False, "history None → ok=False (fail-open sinyali)"
    print("OK daily_pnl_usd (magic filtresi, swap+komisyon, tum-hesap, history-None)")


def t_bot_layer_trips():
    # 100k bakiye, bugun -3500 gerceklesen → gun-basi 103500, esik %3 = 3105 → BLOK
    m = FakeMT5(deals=[deal(550055, -3500)], balance=100000.0)
    blocked, reason = trade_guard.daily_loss_blocked(m, CFG)
    assert blocked and "BOT" in reason, (blocked, reason)
    # -1000 → %1 civari → blok YOK
    m2 = FakeMT5(deals=[deal(550055, -1000)], balance=100000.0)
    blocked2, _ = trade_guard.daily_loss_blocked(m2, CFG)
    assert not blocked2
    print("OK bot katmani esikte tetikliyor / altinda tetiklemiyor")


def t_floating_counts():
    # gerceklesen -2000 + acik -1500 = -3500 → esigi ASAR (floating dahil)
    m = FakeMT5(deals=[deal(550055, -2000)], positions=[pos(550055, -1500)], balance=100000.0)
    blocked, _ = trade_guard.daily_loss_blocked(m, CFG)
    assert blocked, "floating zarar da sayilmali"
    print("OK floating (acik pozisyon) zarari dahil")


def t_account_layer():
    # Bot tek basina esik alti (-1000) ama HESAP toplami (3 bot) -5000 → hesap katmani bloklar
    m = FakeMT5(deals=[deal(550055, -1000), deal(550066, -2500), deal(660066, -1500)], balance=100000.0)
    blocked, reason = trade_guard.daily_loss_blocked(m, CFG)
    assert blocked and "HESAP" in reason, (blocked, reason)
    print("OK hesap katmani (tum magic'ler) FTMO gunluk limitini koruyor")


def t_fail_open():
    assert trade_guard.daily_loss_blocked(FakeMT5(deals=None), CFG)[0] is False, "history yok → fail-open"
    assert trade_guard.daily_loss_blocked(FakeMT5(deals=[], balance=None), CFG)[0] is False, "bakiye yok → fail-open"
    off = dict(CFG, max_daily_loss_pct=0, max_daily_loss_pct_account=0)
    assert trade_guard.daily_loss_blocked(FakeMT5(deals=[deal(550055, -99999)]), off)[0] is False, "0 = kapali"
    print("OK fail-open (veri yok) + 0=kapali")


def t_recent_loss_symbols():
    m = FakeMT5(deals=[
        deal(550055, -50, symbol="XAGUSD"),          # zararla kapandi → frende
        deal(550055, +80, symbol="BTCUSD"),          # karla kapandi → frende DEGIL
        deal(550055, -10, entry=0, symbol="ETHUSD"),  # giris deal'i (IN) → sayilmaz
        deal(550066, -30, symbol="SOLUSD"),          # baska magic → sayilmaz
    ])
    syms = trade_guard.symbols_with_recent_loss(m, 550055, 45)
    assert syms == {"XAGUSD"}, syms
    assert trade_guard.symbols_with_recent_loss(FakeMT5(deals=None), 550055, 45) == set()
    assert trade_guard.symbols_with_recent_loss(m, 550055, 0) == set(), "0 dk = kapali"
    print("OK symbols_with_recent_loss (zarar/kar/IN-deal/magic ayrimi)")


if __name__ == "__main__":
    t_daily_pnl()
    t_bot_layer_trips()
    t_floating_counts()
    t_account_layer()
    t_fail_open()
    t_recent_loss_symbols()
    print("\nHEPSI YESIL - OK")
