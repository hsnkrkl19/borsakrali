#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Teshis: feed sinyalleri vs broker fiyati/SL-TP mesafeleri. EMIR ACMAZ."""
import json
import os
import requests
import MetaTrader5 as mt5

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
mt5.initialize()

url = cfg["backend_url"].rstrip("/") + "/api/forex/positions"
feed = requests.get(url, params={"token": cfg["exec_token"]}, timeout=20).json()["positions"]
symmap = cfg["symbols"]

for s in feed:
    inst = s["instrumentId"]; sym = symmap.get(inst)
    if not sym:
        continue
    si = mt5.symbol_info(sym); tick = mt5.symbol_info_tick(sym)
    if si is None or tick is None:
        print(f"{inst}: sembol yok"); continue
    is_long = s["direction"] == "long"
    price = tick.ask if is_long else tick.bid
    sl, tp = float(s["stop"]), float(s["target1"])  # MUTLAK (yeni mantik)
    reward, risk = abs(tp - price), abs(price - sl)
    rr = reward / risk if risk > 0 else 0.0
    md = max(si.trade_stops_level or 0, si.trade_freeze_level or 0) * si.point
    bracket = (sl < price < tp) if is_long else (tp < price < sl)
    if not bracket:
        dec = "ATLA (fiyat SL-TP disinda / bayat)"
    elif rr < 0.7:
        dec = f"ATLA (kalan R:R {rr:.2f} < 0.70)"
    elif md > 0 and (risk < md or reward < md):
        dec = "ATLA (SL/TP broker min mesafeye cok yakin)"
    else:
        dec = f"AC (R:R {rr:.2f})"
    print(f"{inst:7s} {sym:11s} #{s['code']} {s['direction']:5s} conf={s.get('confidence')}  ->  {dec}")
    print(f"   fiyat={price:<11g} SL={round(sl, si.digits):<11g} TP={round(tp, si.digits):<11g}  (Telegram ile AYNI seviye)")
mt5.shutdown()
