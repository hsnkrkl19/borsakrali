#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HESAP NUMARASI GÜNCELLEME + TEŞHİS (2026-07-24).

Hesap değişince üç köprünün config'indeki `allowed_account` eski numarada kalır
→ köprü açılışta "HESAP KİLİDİ" deyip ÇIKAR → bot hiç işlem açmaz. Bu araç:

  1) MT5'e bağlanıp GERÇEK hesap numarasını okur (emir göndermez, yalnız okur),
  2) mevcut TÜM config'lerde allowed_account'u o numaraya çeker,
  3) her config'in durumunu (token var mı, dry_run, magic) yazar.

Kullanım:
    python hesap_guncelle.py            → hesabı MT5'ten OKU ve yaz
    python hesap_guncelle.py 1514061487 → numarayı ELLE ver (MT5 kapalıysa)
    python hesap_guncelle.py --kontrol  → hiçbir şey YAZMA, yalnız durumu göster

Config'ler BOM'suz UTF-8 yazılır (Not Defteri BOM'u köprüyü açılmaz yapıyordu).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

CONFIGLER = [
    ("config_all.json", "birleşik köprü      (37 bot)"),
    ("config.json", "forex köprüsü       (magic 550055)"),
    ("config_scanner.json", "gün-içi tarayıcı    (magic 550066)"),
]


def mt5_hesap():
    """Çalışan MT5 terminalinden hesap no + algo durumu. (None, sebep) dönebilir."""
    try:
        import MetaTrader5 as mt5
    except ImportError:
        return None, "MetaTrader5 paketi kurulu değil (pip install MetaTrader5)"
    try:
        if not mt5.initialize():
            return None, "MT5'e bağlanılamadı: %s  (terminal açık ve giriş yapılmış olmalı)" % (mt5.last_error(),)
        ai = mt5.account_info()
        ti = mt5.terminal_info()
        if ai is None:
            mt5.shutdown()
            return None, "terminal açık ama hesap bilgisi okunamadı (giriş yapılmamış olabilir)"
        bilgi = {
            "login": int(getattr(ai, "login", 0) or 0),
            "server": str(getattr(ai, "server", "")),
            "balance": float(getattr(ai, "balance", 0) or 0),
            "currency": str(getattr(ai, "currency", "")),
            "algo": bool(getattr(ti, "trade_allowed", False)) if ti else False,
        }
        mt5.shutdown()
        return bilgi, None
    except Exception as exc:  # noqa
        return None, "beklenmedik hata: %s" % exc


def oku(path):
    with open(path, "r", encoding="utf-8-sig") as f:   # BOM'lu da okunsun
        return json.load(f)


def yaz(path, cfg):
    # BOM'SUZ yaz: köprüler utf-8-sig okur ama başka araçlar BOM'a takılabilir.
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    arg = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
    sadece_kontrol = arg in ("--kontrol", "-k", "/k")
    elle = None
    if arg and not sadece_kontrol:
        if not arg.isdigit():
            print("HATA: hesap numarası yalnız rakam olmalı. Verilen: %r" % arg)
            return 2
        elle = int(arg)

    print("=" * 62)
    print("  HESAP NUMARASI GUNCELLEME / TESHIS")
    print("=" * 62)

    hedef = elle
    if hedef is None:
        bilgi, hata = mt5_hesap()
        if bilgi:
            hedef = bilgi["login"]
            print("MT5'ten okundu:")
            print("   HESAP NO : %s" % bilgi["login"])
            print("   SUNUCU   : %s" % bilgi["server"])
            print("   BAKIYE   : %.2f %s" % (bilgi["balance"], bilgi["currency"]))
            print("   ALGO     : %s" % ("ACIK" if bilgi["algo"]
                                        else "KAPALI  <-- MT5'te ustteki 'Algo Trading' dugmesine BAS!"))
        else:
            print("MT5'ten okunamadi: %s" % hata)
            if not sadece_kontrol:
                print("\n>>> Numarayi ELLE ver:   python hesap_guncelle.py <HESAPNO>")
                print("    (veya MT5 terminalini ac + giris yap, sonra tekrar calistir)")
                return 1
    print("-" * 62)

    degisen, atlanan = 0, 0
    for dosya, aciklama in CONFIGLER:
        path = os.path.join(HERE, dosya)
        if not os.path.exists(path):
            print("[YOK ] %-20s %s  -> BASLAT.bat olusturacak" % (dosya, aciklama))
            continue
        try:
            cfg = oku(path)
        except Exception as exc:  # noqa
            print("[HATA] %-20s okunamadi: %s" % (dosya, exc))
            atlanan += 1
            continue

        eski = cfg.get("allowed_account")
        token_var = bool(str(cfg.get("exec_token") or "").strip()) and "BURAYA" not in str(cfg.get("exec_token"))
        durum = "token %s | dry_run=%s | magic=%s" % (
            "VAR" if token_var else "YOK!",
            cfg.get("dry_run"),
            cfg.get("magic", "-"),
        )

        if hedef is None or sadece_kontrol:
            print("[    ] %-20s hesap=%-12s %s" % (dosya, eski, durum))
            continue

        if int(eski or 0) == int(hedef):
            print("[ =  ] %-20s zaten %s | %s" % (dosya, hedef, durum))
            continue

        cfg["allowed_account"] = int(hedef)
        try:
            yaz(path, cfg)
        except Exception as exc:  # noqa
            print("[HATA] %-20s yazilamadi: %s" % (dosya, exc))
            atlanan += 1
            continue
        print("[ OK ] %-20s %s -> %s | %s" % (dosya, eski, hedef, durum))
        degisen += 1

    print("-" * 62)
    if sadece_kontrol:
        print("Yalniz kontrol edildi, hicbir dosya degistirilmedi.")
    else:
        print("%d config guncellendi%s." % (degisen, (", %d atlandi" % atlanan) if atlanan else ""))
        if degisen:
            print("\n>>> Simdi DURDUR.bat sonra BASLAT.bat calistir.")
    print("NOT: token'i olmayan config varsa BASLAT.bat onu config_all.json'dan devralir.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
