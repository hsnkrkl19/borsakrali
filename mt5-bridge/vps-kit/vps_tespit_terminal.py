#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FTMO TERMİNAL OTOMATİK TESPİTİ + config yazımı.
================================================
VPS'te birden çok MT5 kuruluysa, HANGİ terminal64.exe'nin FTMO hesabına
(1513908484) bağlı olduğunu OTOMATİK bulur: her kurulumu tek tek `initialize`
edip `account_info().login`'e bakar. Bulunca:
  • config.json + config_scanner.json'a terminal_path + allowed_account yazar,
  • yolu detected_terminal.txt'ye yazar (kur.ps1 GSB env'i için okur),
  • ekrana yolu basar.

ÖN KOŞUL: FTMO hesabı (1513908484) terminallerden BİRİNDE AÇIK/girişli olmalı.
Çalıştır:  python vps_tespit_terminal.py
"""
from __future__ import annotations

import glob
import json
import os
import sys

ALLOWED_ACCOUNT = 1513908484
HERE = os.path.dirname(os.path.abspath(__file__))
BRIDGE_DIR = os.path.dirname(HERE)
CONFIGS = [os.path.join(BRIDGE_DIR, "config.json"),
           os.path.join(BRIDGE_DIR, "config_scanner.json")]
OUT_PATH = os.path.join(HERE, "detected_terminal.txt")


def _p(msg):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    print(msg)


def candidate_terminals():
    """Sistemdeki tüm terminal64.exe yollarını topla (yaygın kurulum konumları)."""
    roots = [
        os.environ.get("ProgramFiles", r"C:\Program Files"),
        os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
        os.path.join(os.environ.get("APPDATA", ""), "MetaQuotes", "Terminal"),
    ]
    found = []
    for r in roots:
        if not r:
            continue
        # ...\<klasor>\terminal64.exe  ve  ...\<klasor>\*\terminal64.exe
        for pat in (os.path.join(r, "*", "terminal64.exe"),
                    os.path.join(r, "*", "*", "terminal64.exe")):
            found += glob.glob(pat)
    # tekilleştir, sırayı koru
    seen, out = set(), []
    for f in found:
        fn = os.path.normpath(f)
        if fn.lower() not in seen and os.path.isfile(fn):
            seen.add(fn.lower())
            out.append(fn)
    return out


def login_of(mt5, path):
    """Verilen terminale bağlanıp login'i döndür (bağlanamazsa None)."""
    try:
        mt5.shutdown()
    except Exception:
        pass
    try:
        if not mt5.initialize(path=path):
            return None, None
        ai = mt5.account_info()
        if ai is None:
            return None, None
        return int(ai.login), ai.server
    except Exception:
        return None, None
    finally:
        try:
            mt5.shutdown()
        except Exception:
            pass


def write_config(path, terminal_path):
    try:
        with open(path, encoding="utf-8") as f:
            cfg = json.load(f)
    except OSError:
        _p(f"  UYARI: {os.path.basename(path)} yok — atlandı (once .example'dan kopyala).")
        return False
    cfg["terminal_path"] = terminal_path
    cfg["allowed_account"] = ALLOWED_ACCOUNT
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    _p(f"  yazildi: {os.path.basename(path)}  (terminal_path + allowed_account)")
    return True


def main():
    _p("=== FTMO TERMINAL OTOMATIK TESPITI ===")
    try:
        import MetaTrader5 as mt5
    except ImportError:
        _p("HATA: MetaTrader5 paketi yok. Once: pip install MetaTrader5")
        sys.exit(2)

    cands = candidate_terminals()
    if not cands:
        _p("HATA: hic terminal64.exe bulunamadi. MT5 kurulu mu?")
        sys.exit(3)
    _p(f"{len(cands)} MT5 kurulumu bulundu, hesaplar taraniyor...")

    ftmo_path = None
    for path in cands:
        login, server = login_of(mt5, path)
        tag = ""
        if login == ALLOWED_ACCOUNT:
            ftmo_path = path
            tag = "  <<< FTMO 1513908484 — BU!"
        _p(f"  login={login if login else '(giris yok/baglanamadi)'} server={server or '-'}  {path}{tag}")
        if ftmo_path:
            break

    if not ftmo_path:
        _p("")
        _p(f"!!! Hicbir terminal {ALLOWED_ACCOUNT} hesabina bagli DEGIL.")
        _p("    FTMO hesabina (1513908484) bir terminalde GIRIS yap, sonra tekrar calistir.")
        sys.exit(1)

    _p(f"\nFTMO terminali: {ftmo_path}")
    for c in CONFIGS:
        write_config(c, ftmo_path)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(ftmo_path)
    _p(f"\nGSB_MT5_TERMINAL icin yol yazildi: {OUT_PATH}")
    _p("TESPIT TAMAM. Simdi: vps-kur.ps1 devam eder (veya vps-basla.ps1).")


if __name__ == "__main__":
    main()
