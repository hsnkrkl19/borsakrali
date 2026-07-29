#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BIR SEFERLIK eski-pozisyon temizligi.

Merkezi beyin oncesi acilmis (yeni risk kurallarini ihlal eden) tum acik
pozisyonlari piyasa fiyatindan kapatir. Beyin, sembol+yon riski %0.5'i asan
eski defterle saglikli sayilmaz ve sistem canliya gecemez; bu arac o dugumu
tek seferde cozer.

GUVENLIK: config'teki allowed_account/account_server ile bagli hesap
eslesmezse HICBIR SEY kapatmaz. Onay istenir (--evet ile atlanir).
"""

import json
import os
import sys
import time

try:
    import MetaTrader5 as mt5
except ImportError:
    print("MetaTrader5 paketi yok. Kur: pip install MetaTrader5", file=sys.stderr)
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
RETCODES_OK = (10009, 10010)


def _load_cfg():
    for name in ("config_all.json", "config.json", "config_brain.json"):
        path = os.path.join(HERE, name)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8-sig") as fh:
                cfg = json.load(fh)
            if isinstance(cfg, dict):
                return cfg, name
    return {}, None


def main():
    onayli = "--evet" in sys.argv
    cfg, cfg_name = _load_cfg()
    terminal = str(cfg.get("terminal_path") or "").strip()
    wanted = cfg.get("allowed_account")
    wanted = int(wanted) if isinstance(wanted, int) and wanted > 0 else 0
    wanted_server = str(cfg.get("account_server") or "").strip()

    ok = mt5.initialize(path=terminal) if terminal else mt5.initialize()
    if not ok:
        print("MT5 initialize basarisiz: %s" % (mt5.last_error(),))
        return 1
    ai = mt5.account_info()
    if ai is None:
        print("Hesap bilgisi alinamadi (MT5 acik ve girisli mi?)")
        return 1
    login = int(getattr(ai, "login", 0) or 0)
    server = str(getattr(ai, "server", "") or "")
    if wanted and login != wanted:
        print("HESAP KILIDI: bagli hesap %s != izinli %s (%s) - IPTAL"
              % (login, wanted, cfg_name))
        return 2
    if wanted_server and server.lower() != wanted_server.lower():
        print("SUNUCU KILIDI: bagli %s != izinli %s - IPTAL" % (server, wanted_server))
        return 2

    raw = mt5.positions_get()
    positions = list(raw or [])
    if not positions:
        print("Acik pozisyon yok - temizlik gerekmiyor.")
        return 0
    toplam = sum(float(getattr(p, "profit", 0) or 0) + float(getattr(p, "swap", 0) or 0)
                 for p in positions)
    print("Hesap %s (%s): %d acik pozisyon, anlik toplam P/L: %+.2f USD"
          % (login, server, len(positions), toplam))
    if not onayli:
        cevap = input("HEPSI piyasa fiyatindan KAPATILACAK. Onayliyor musun? (E/H): ").strip()
        if cevap.lower() not in ("e", "evet"):
            print("Iptal edildi; hicbir pozisyon kapatilmadi.")
            return 0

    for tur in range(1, 6):
        raw = mt5.positions_get()
        positions = list(raw or [])
        if not positions:
            break
        print("--- tur %d: %d pozisyon kapatiliyor ---" % (tur, len(positions)))
        for pos in positions:
            is_buy = int(getattr(pos, "type", 0) or 0) == getattr(mt5, "POSITION_TYPE_BUY", 0)
            tick = mt5.symbol_info_tick(pos.symbol)
            price = float((tick.bid if is_buy else tick.ask) if tick else 0) or \
                float(getattr(pos, "price_current", 0) or 0)
            if price <= 0:
                print("  [!] %s ticket=%s fiyat yok, sonraki turda denenecek"
                      % (pos.symbol, pos.ticket))
                continue
            req = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": pos.symbol,
                "volume": float(pos.volume),
                "type": mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
                "position": int(pos.ticket),
                "price": price,
                "deviation": 50,
                "magic": int(getattr(pos, "magic", 0) or 0),
                "comment": "temizlik",
                "type_time": mt5.ORDER_TIME_GTC,
            }
            result = None
            for fill in (mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK,
                         mt5.ORDER_FILLING_RETURN):
                req["type_filling"] = fill
                result = mt5.order_send(req)
                if result is None or result.retcode != 10030:
                    break
            rc = getattr(result, "retcode", None)
            pnl = float(getattr(pos, "profit", 0) or 0) + float(getattr(pos, "swap", 0) or 0)
            if result is not None and rc in RETCODES_OK:
                print("  [OK] %s ticket=%s pnl=%+.2f kapatildi"
                      % (pos.symbol, pos.ticket, pnl))
            else:
                print("  [HATA] %s ticket=%s retcode=%s %s"
                      % (pos.symbol, pos.ticket, rc, mt5.last_error()))
        time.sleep(1.0)

    kalan = list(mt5.positions_get() or [])
    if kalan:
        print("BITMEDI: %d pozisyon kapanamadi (piyasa kapali olabilir)." % len(kalan))
        print("Piyasa acikken bu araci tekrar calistir.")
        return 1
    print("TAMAM: tum pozisyonlar kapatildi. Simdi BASLAT.bat calistirabilirsin.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
