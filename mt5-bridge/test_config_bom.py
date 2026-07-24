#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Config okuma dayanikliligi — BOM regresyonu (2026-07-24).
MT5 + requests stub'li. Calistir: python test_config_bom.py

HATA: load_config() `encoding="utf-8"` kullaniyordu. Windows Not Defteri ve
PowerShell `Set-Content -Encoding utf8` dosyayi BOM (EF BB BF) ile kaydeder ->
json.load "Unexpected UTF-8 BOM" firlatir -> KOPRU HIC ACILMAZ.

Bu ozellikle tehlikeliydi cunku BASLAT.bat config'i duzenlemek icin NOT DEFTERI
aciyor: kullanici token'i yazip kaydedince kopru bir daha kalkmiyordu.

KURAL: uc koprunun de load_config'i BOM'lu VE BOM'suz dosyayi okuyabilmeli.
"""
import importlib.util
import json
import os
import sys
import tempfile
import types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.modules.setdefault("MetaTrader5", types.SimpleNamespace())
sys.modules.setdefault("requests", types.SimpleNamespace())

KOPRULER = [
    ("borsakrali_mt5.py", "forex koprusu"),
    ("borsakrali_mt5_all.py", "birlesik kopru"),
    ("borsakrali_mt5_scanner.py", "gun-ici tarayici"),
]


def _yukle(dosya, config_path):
    """Kopru modulunu verilen config yolu ile yukle ve load_config()'i dondur."""
    eski_argv = sys.argv
    sys.argv = ["x", config_path]
    try:
        spec = importlib.util.spec_from_file_location("k_" + dosya, os.path.join(HERE, dosya))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.load_config()
    finally:
        sys.argv = eski_argv


def _yaz(icerik, bom):
    fd, path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    veri = json.dumps(icerik, ensure_ascii=False).encode("utf-8")
    if bom:
        veri = b"\xef\xbb\xbf" + veri
    with open(path, "wb") as f:
        f.write(veri)
    return path


def t_bom_toleransi():
    ayar = {"exec_token": "TOKEN-123", "allowed_account": 1514061487, "dry_run": False}
    for dosya, ad in KOPRULER:
        for bom in (True, False):
            path = _yaz(ayar, bom)
            try:
                cfg = _yukle(dosya, path)
                etiket = "BOM'lu" if bom else "BOM'suz"
                assert cfg["exec_token"] == "TOKEN-123", "%s (%s) token okunamadi" % (ad, etiket)
                assert int(cfg["allowed_account"]) == 1514061487, "%s (%s) hesap okunamadi" % (ad, etiket)
                assert cfg["dry_run"] is False, "%s (%s) dry_run bozuldu" % (ad, etiket)
            finally:
                os.unlink(path)
        print("OK %-22s BOM'lu ve BOM'suz config okunuyor" % ad)


def t_varsayilanlar_korunuyor():
    """Kismi config: verilmeyen alanlar DEFAULTS'tan gelmeli (birlesik kopru)."""
    path = _yaz({"exec_token": "T"}, bom=True)
    try:
        cfg = _yukle("borsakrali_mt5_all.py", path)
        assert cfg["exec_token"] == "T"
        assert "poll_seconds" in cfg and cfg["poll_seconds"] > 0, "varsayilanlar kayboldu"
        assert cfg.get("max_open_per_bot") is not None
    finally:
        os.unlink(path)
    print("OK birlesik kopru        BOM'lu kismi config + varsayilanlar")


if __name__ == "__main__":
    t_bom_toleransi()
    t_varsayilanlar_korunuyor()
    print("\nTUM TESTLER GECTI (config BOM dayanikliligi)")
