#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Teshis: her ACIK pozisyon icin MT5 SL vs feed stop + maybe_trail neden guncellemiyor. EMIR ACMAZ."""
import json
import os
import requests
import MetaTrader5 as mt5

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))
mt5.initialize()

url = cfg["backend_url"].rstrip("/") + "/api/forex/positions"
feed = requests.get(url, headers={"Authorization": "Bearer " + cfg["exec_token"]}, timeout=20).json()["positions"]
by_code = {s["code"]: s for s in feed}


def pc(c):
    c = (c or "").strip()
    return c[3:] if c.startswith("BK#") else None


mags = [p for p in (mt5.positions_get() or []) if p.magic == int(cfg["magic"])]
print(f"acik pozisyon (bizim magic): {len(mags)} · feed sinyali: {len(feed)}")
print(f"trail_stops={cfg.get('trail_stops')} close_on_backend_close={cfg.get('close_on_backend_close')}\n")

for p in mags:
    code = pc(p.comment)
    is_long = p.type == mt5.POSITION_TYPE_BUY
    info = mt5.symbol_info(p.symbol)
    tick = mt5.symbol_info_tick(p.symbol)
    price = (tick.bid if is_long else tick.ask) if tick else 0
    d = info.digits if info else 5
    md = (max(info.trade_stops_level or 0, info.trade_freeze_level or 0) * info.point) if info else 0
    s = by_code.get(code)
    tag = "LONG" if is_long else "SHORT"
    line = f"#{str(code):5s} {p.symbol:11s} {tag:5s} SL={round(p.sl, d):<11g} fiyat={round(price, d):<11g}"
    if not s:
        print(line + "  -> feed'de YOK (backend kapatmis; close_on_backend_close true ise bot kapatacak)")
        continue
    new_sl = round(float(s["stop"]), d)
    dir_match = (s["direction"] == "long") == is_long
    side_ok = (new_sl < price - md) if is_long else (new_sl > price + md)
    eps = info.point / 2
    favorable = (is_long and (p.sl == 0 or new_sl > p.sl + eps)) or ((not is_long) and (p.sl == 0 or new_sl < p.sl - eps))
    if not dir_match:
        why = f"YÖN UYUŞMAZ (feed={s['direction']}, poz={tag}) -> DOKUNMAZ"
    elif not favorable:
        why = f"favori DEGIL (yeni {new_sl} vs mevcut {round(p.sl, d)}) -> guncelleme yok"
    elif not side_ok:
        why = f"YANLIS TARAF/cok yakin (yeni {new_sl}, fiyat {round(price, d)}, min {md}) -> REDDEDILIR"
    else:
        why = f"GUNCELLENIR: SL {round(p.sl, d)} -> {new_sl}"
    print(line + f"  feed_stop={new_sl:<11g} -> {why}")
mt5.shutdown()
