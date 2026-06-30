#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Okuma-testi: MT5 baglanti + hesap + config sembolleri var mi? EMIR ACMAZ.
Calistir: python preflight.py"""
import json
import os
import MetaTrader5 as mt5

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))

if not mt5.initialize():
    print("BAGLANAMADI:", mt5.last_error(), "-> MT5 acik ve giris yapilmis mi?")
    raise SystemExit(1)

ai = mt5.account_info()
if ai is None:
    print("account_info YOK -> MT5'te hesaba giris yap.")
    mt5.shutdown(); raise SystemExit(1)

mode = {0: "DEMO", 1: "CONTEST", 2: "GERCEK/REAL"}.get(ai.trade_mode, ai.trade_mode)
print("=== HESAP ===")
print(f"login={ai.login}  server={ai.server}  tur={mode}")
print(f"bakiye={ai.balance} {ai.currency}  serbest_marj={ai.margin_free}  ALGO_IZIN={ai.trade_allowed}")
if not ai.trade_allowed:
    print("!! Algo Trading KAPALI -> terminalde ust bardaki 'Algo Trading' dugmesini AC (yesil).")

print("=== SEMBOL KONTROL (config.symbols) ===")
missing = []
for inst, sym in cfg["symbols"].items():
    si = mt5.symbol_info(sym)
    if si is None:
        print(f"  YOK    {inst:8s} -> {sym}")
        missing.append((inst, sym))
    else:
        print(f"  var    {inst:8s} -> {sym:12s} spread~{si.spread}  min_lot={si.volume_min}  step={si.volume_step}")

print("=== OZET ===")
print(f"toplam {len(cfg['symbols'])} sembol, {len(missing)} tanesi broker'da YOK.")
if missing:
    print("Eksikler (broker'daki dogru adi soyle, config'i duzeltelim):", ", ".join(f"{i}({s})" for i, s in missing))
mt5.shutdown()
