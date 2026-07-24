#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gümüş yasağı + lot sınırı testleri (2026-07-24 kullanıcı talebi).
MT5 stub'lı — terminal gerekmez. Çalıştır: python test_ban_lot.py

Kapsam:
  1) is_banned_symbol — gümüşün her yazımı yasak, altın/SILVR yanlış pozitif değil
  2) clamp_lot        — [0.01, 0.15]; Bot 37 konsensüs [0.01, 0.20]
  3) is_consensus     — botId VEYA magic ile tanıma
"""
import sys
import os
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trade_guard  # noqa: E402


def info(step=0.01, vmin=0.01, vmax=100):
    return SimpleNamespace(volume_step=step, volume_min=vmin, volume_max=vmax)


def t_banned_symbols():
    # Backend instrumentBans.js ile AYNI kümeyi tanımalı.
    for s in ("XAGUSD", "xagusd", "XAG/USD", "SI=F", "SILVER", "XAGUSD.",
              "XAGUSDm", "XAGUSD.raw", "OANDA:XAGUSD", "silver_usd", "XAGTRY"):
        assert trade_guard.is_banned_symbol(s), s
    # Yanlış pozitif olmamalı: altın, BIST 'SILVR' hissesi, endeksler.
    for s in ("XAUUSD", "GC=F", "GOLD", "XAUTRY", "SILVR", "EURUSD",
              "BTCUSD", "US100.cash", "SPX500", "NQ=F", "", None):
        assert not trade_guard.is_banned_symbol(s), s
    # Kill switch + config ile genişletme.
    assert not trade_guard.is_banned_symbol("XAGUSD", {"instrument_bans_disabled": True})
    assert trade_guard.is_banned_symbol("USDJPY", {"banned_instruments": ["USDJPY"]})
    print("OK is_banned_symbol (tum yazimlar + yanlis pozitif korumasi)")


def t_consensus_detect():
    assert trade_guard.is_consensus({"botId": "consensus-radar"})
    assert trade_guard.is_consensus({"magic": 5749})
    assert not trade_guard.is_consensus({"botId": "mt5-trend", "magic": 5717})
    assert not trade_guard.is_consensus(None)
    print("OK is_consensus (botId VEYA magic)")


def t_clamp_lot():
    i = info()
    cfg = {"max_lot": 10}      # config tavani YUKSEK olsa da kod tavani gecerli
    assert trade_guard.clamp_lot(1.1, i, None, cfg) == 0.15
    assert trade_guard.clamp_lot(0.5, i, None, cfg) == 0.15
    assert trade_guard.clamp_lot(0.07, i, None, cfg) == 0.07
    assert trade_guard.clamp_lot(0.004, i, None, cfg) == 0.01   # taban
    assert trade_guard.clamp_lot(0, i, None, cfg) == 0.0
    assert trade_guard.clamp_lot("x", i, None, cfg) == 0.0
    # Bot 37: 0.20
    assert trade_guard.clamp_lot(3.0, i, {"botId": "consensus-radar"}, cfg) == 0.20
    assert trade_guard.clamp_lot(3.0, i, {"magic": 5749}, cfg) == 0.20
    # Baska bot 0.20 alamaz
    assert trade_guard.clamp_lot(3.0, i, {"botId": "mt5-trend", "magic": 5717}, cfg) == 0.15
    print("OK clamp_lot (0.01-0.15; Bot 37 konsensus 0.20)")


def t_cfg_only_lowers():
    i = info()
    # config DUSUREBILIR
    assert trade_guard.clamp_lot(1.0, i, None, {"max_lot": 0.05}) == 0.05
    # config YUKSELTEMEZ (kod tavani son soz)
    assert trade_guard.clamp_lot(1.0, i, None, {"max_lot": 5.0}) == 0.15
    # feed'in lotCap'i de yalniz dusurur
    assert trade_guard.clamp_lot(1.0, i, {"lotCap": 0.05}, {"max_lot": 10}) == 0.05
    assert trade_guard.clamp_lot(1.0, i, {"lotCap": 9.0}, {"max_lot": 10}) == 0.15
    print("OK config/feed tavani yalniz DUSURUR, yukseltemez")


def t_broker_limits():
    # Broker adimi 0.1 ise 0.15 -> 0.1'e AŞAĞI oturur (tavan asilmaz)
    assert trade_guard.clamp_lot(1.0, info(step=0.1), None, {}) == 0.1
    # Broker asgarisi tavanimizin USTUNDE ise islem acilamaz
    assert trade_guard.clamp_lot(1.0, info(vmin=0.5), None, {}) == 0.0
    # Broker azamisi bizimkinden dusukse o gecerli
    assert trade_guard.clamp_lot(1.0, info(vmax=0.05), None, {}) == 0.05
    print("OK broker volume_step/min/max kisitlari")


def t_rounds_down():
    """DEĞİŞMEZ: adım yuvarlaması riski sinyalin ÜSTÜNE taşımaz (AŞAĞI yuvarla)."""
    i = info()
    assert trade_guard.clamp_lot(0.017, i, None, {}) == 0.01, "0.017 -> 0.01 (0.02 DEGIL)"
    assert trade_guard.clamp_lot(0.149, i, None, {}) == 0.14
    assert trade_guard.clamp_lot(0.0999, i, None, {}) == 0.09
    print("OK adim yuvarlamasi AŞAĞI (risk artmaz)")


if __name__ == "__main__":
    t_banned_symbols()
    t_consensus_detect()
    t_clamp_lot()
    t_cfg_only_lowers()
    t_broker_limits()
    t_rounds_down()
    print("\nHEPSI YESIL - OK")
