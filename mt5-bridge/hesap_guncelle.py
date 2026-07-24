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


def terminal_yolu_gecerli_mi(cfg):
    """terminal_path dolu ama dosya YOKSA köprü 'IPC initialize failed' verip
    hiç bağlanamaz. Boş bırakılırsa MT5 ÇALIŞAN terminale bağlanır (doğrusu bu)."""
    yol = str(cfg.get("terminal_path") or "").strip()
    if not yol:
        return True, None
    if os.path.exists(yol):
        return True, None
    return False, yol


def main():
    argv = [a for a in sys.argv[1:] if a.strip()]
    token = None
    kalan = []
    for a in argv:
        if a.startswith("--token="):
            token = a.split("=", 1)[1].strip()
        elif a == "--token":
            token = "?"          # sonraki arg
        elif token == "?":
            token = a.strip()
        else:
            kalan.append(a)
    arg = (kalan[0] if kalan else "").strip()
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
            # Hesap okunamasa bile token / terminal_path düzeltmesi YAPILABİLİR —
            # burada erken dönersek BASLAT.bat'ın otomatik onarımı hiç çalışmaz
            # (MT5 henüz açılmamış olabilir). Yalnız yapacak İŞ YOKSA çık.
            if not sadece_kontrol and not token:
                print("\n>>> Numarayi ELLE ver:   python hesap_guncelle.py <HESAPNO>")
                print("    (veya MT5 terminalini ac + giris yap, sonra tekrar calistir)")
                return 1
            if not sadece_kontrol:
                print("   -> hesap ATLANIYOR, token/terminal_path yine de duzeltilecek.")
    print("-" * 62)

    degisen, atlanan = 0, 0
    eksik_token = []
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
        yol_ok, kotu_yol = terminal_yolu_gecerli_mi(cfg)
        durum = "token %s | dry_run=%s | magic=%s" % (
            "VAR" if token_var else "YOK!",
            cfg.get("dry_run"),
            cfg.get("magic", "-"),
        )

        if sadece_kontrol:
            print("[    ] %-20s hesap=%-12s %s" % (dosya, eski, durum))
            if not yol_ok:
                print("       ^ terminal_path YOK: %s" % kotu_yol)
            if not token_var:
                eksik_token.append(dosya)
            continue

        yapilan = []

        # 1) HESAP KİLİDİ
        if hedef is not None and int(eski or 0) != int(hedef):
            cfg["allowed_account"] = int(hedef)
            yapilan.append("hesap %s -> %s" % (eski, hedef))

        # 2) TERMİNAL YOLU — dolu ama dosya yoksa BOŞALT (çalışan terminale bağlan).
        #    "IPC initialize failed, Process create failed" hatasının sebebi budur.
        if not yol_ok:
            cfg["terminal_path"] = ""
            yapilan.append("terminal_path bosaltildi (yol yoktu: %s)" % kotu_yol)

        # 3) TOKEN
        if token and not token_var:
            cfg["exec_token"] = token
            yapilan.append("token yazildi")
            token_var = True
        elif not token_var:
            eksik_token.append(dosya)

        if not yapilan:
            print("[ =  ] %-20s zaten dogru | %s" % (dosya, durum))
            continue
        try:
            yaz(path, cfg)
        except Exception as exc:  # noqa
            print("[HATA] %-20s yazilamadi: %s" % (dosya, exc))
            atlanan += 1
            continue
        print("[ OK ] %-20s %s" % (dosya, " + ".join(yapilan)))
        degisen += 1

    print("-" * 62)
    if sadece_kontrol:
        print("Yalniz kontrol edildi, hicbir dosya degistirilmedi.")
    else:
        print("%d config guncellendi%s." % (degisen, (", %d atlandi" % atlanan) if atlanan else ""))

    if eksik_token:
        print("")
        print("!!! TOKEN EKSIK: %s" % ", ".join(eksik_token))
        print("    Token'siz kopru feed'i cekemez -> log'da '401 Unauthorized' gorursun.")
        print("    Token = Render'daki  FOREX_EXEC_TOKEN  degeri.")
        print("    Yazmak icin:  python hesap_guncelle.py --token=DEGER")
        print("    (hesap numarasiyla birlikte:  python hesap_guncelle.py 1514083666 --token=DEGER)")
        return 3

    if degisen and not sadece_kontrol:
        print("\n>>> Simdi DURDUR.bat sonra BASLAT.bat calistir.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
