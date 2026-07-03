#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VPS TANI (diagnostics) — tek komutta TÜM botların sağlık + karar + hata özeti.
=============================================================================
"Botlar VPS'te veri toplar, hatalarını öğrenir, log çıkarır; biz o logları
çekip güncelleme yaparız" döngüsünün araç ayağı. VPS'te çalıştırınca üç kaynağı
tek okunur rapora toplar; sen dosyayı bize geri getirirsin (RDP kopya/paylaşım).

Topladıkları:
  1) Gold bot (gold-structure-bot): live_log kararları, açık pozisyon, model-başı
     gerçekleşen R, governor durumu, aktif ayar, son selftune sıralaması.
  2) MT5 köprüleri (bridge.log + scanner_bridge.log): emir gerçekleri (fill/ret),
     yeniden bağlanmalar, HESAP KİLİDİ ihlalleri, hatalar.
  3) Backend öğrenme durumu (Render API): gölge kombolar, risk çarpanları,
     son mod-değişim kararları.

En sonda ⚠️ ANORMALLİKLER bölümü: bizim MANUEL müdahale etmemiz gereken şeyleri
otomatik işaretler (tekrarlayan hatalar, reddedilen emirler, governor molası,
gölgeye düşen kombolar, yeniden-bağlanma fırtınası).

Çalıştır:  python vps_tani.py            (rapor + konsol)
           python vps_tani.py --gunluk N (son N gün; vars. 3)
Yollar env ile: GSB_DIR (gold bot klasörü), BK_BACKEND_URL, BK_EXEC_TOKEN.
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BRIDGE_DIR = os.path.dirname(HERE)                         # ...\mt5-bridge

# Gold bot klasörü: env > yaygın VPS/Masaüstü konumları > bulunamazsa atla
def _find_gold():
    cand = [os.environ.get("GSB_DIR", "")]
    home = os.path.expanduser("~")
    cand += [os.path.join(home, "Desktop", "gold-structure-bot"),
             r"C:\gold-structure-bot", r"C:\bots\gold-structure-bot"]
    for c in cand:
        if c and os.path.isdir(c):
            return c
    return None

GOLD_DIR = _find_gold()
BACKEND_URL = os.environ.get("BK_BACKEND_URL", "https://www.borsakrali.com").rstrip("/")
EXEC_TOKEN = os.environ.get("BK_EXEC_TOKEN", "")

anomalies: list[str] = []


def flag(msg: str) -> None:
    anomalies.append(msg)


def _read_jsonl(path: str, since_ts: float | None = None):
    rows = []
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                rows.append(r)
    except OSError:
        return []
    if since_ts is not None:
        def _t(r):
            try:
                return dt.datetime.fromisoformat(r.get("t", "").replace("Z", "+00:00")).timestamp()
            except Exception:
                return 0
        rows = [r for r in rows if _t(r) >= since_ts]
    return rows


def _tail_lines(path: str, n: int = 4000):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.readlines()[-n:]
    except OSError:
        return []


def _stats_from_rs(rs):
    rs = [x for x in rs if isinstance(x, (int, float))]
    n = len(rs)
    s = round(sum(rs), 2)
    gw = sum(x for x in rs if x > 0)
    gl = abs(sum(x for x in rs if x < 0))
    pf = round(gw / gl, 2) if gl > 0 else (99 if gw > 0 else 0)
    wins = len([x for x in rs if x > 0])
    return {"n": n, "sumR": s, "pf": pf, "winRate": (round(100 * wins / n) if n else None)}


# ── 1) GOLD BOT ─────────────────────────────────────────────────────────────
def section_gold(out, since_ts, gunluk):
    out.append("\n" + "=" * 70)
    out.append("1) GOLD BOT (gold-structure-bot)")
    out.append("=" * 70)
    if not GOLD_DIR:
        out.append("  ⚠️ Gold bot klasörü bulunamadı (GSB_DIR env'i ayarla).")
        flag("Gold bot klasörü bulunamadı — tanıya dahil edilemedi.")
        return
    data = os.path.join(GOLD_DIR, "data")
    out.append(f"  klasör: {GOLD_DIR}")

    # aktif ayar
    try:
        with open(os.path.join(data, "active_config.json"), encoding="utf-8") as f:
            ac = json.load(f)
        out.append(f"  aktif ayar: scalp={ac.get('scalp_key','?')} · trend={ac.get('trend_key','(varsayilan)')}")
        out.append(f"  son güncelleme: {ac.get('updated','?')}")
    except OSError:
        out.append("  aktif ayar: (yok — henüz selftune koşmamış)")

    # canlı state: model başı R + governor
    try:
        with open(os.path.join(data, "live_state.json"), encoding="utf-8") as f:
            st = json.load(f)
        for m in ("trend", "scalp"):
            ms = st.get(m, {})
            stt = _stats_from_rs(ms.get("live_rs", []))
            tic = ms.get("ticket")
            paused = ms.get("pause_until", 0)
            now = dt.datetime.now(dt.timezone.utc).timestamp()
            pflag = ""
            if paused and paused > now:
                kaldi = round((paused - now) / 86400, 1)
                pflag = f" · ⏸ GOVERNOR MOLASI ({kaldi}g kaldı)"
                flag(f"Gold {m}: governor molasında ({kaldi} gün) — kötü seri.")
            out.append(f"  [{m}] canlı: n={stt['n']} sumR={stt['sumR']:+} PF={stt['pf']} "
                       f"isabet={stt['winRate']}% · açık ticket={tic or '-'}{pflag}")
    except OSError:
        out.append("  canlı state: (yok)")

    # son kararlar / açılış / kapanış / hatalar
    rows = _read_jsonl(os.path.join(data, "live_log.jsonl"), since_ts)
    kinds = {}
    opens, closes, errs, govs = [], [], [], []
    for r in rows:
        k = r.get("kind", "?")
        kinds[k] = kinds.get(k, 0) + 1
        if k == "ACILDI":
            opens.append(r)
        elif k == "kapandi":
            closes.append(r)
        elif k in ("hata", "uyari"):
            errs.append(r)
        elif k == "governor":
            govs.append(r)
    out.append(f"  son {gunluk}g olay: " + (", ".join(f"{k}={v}" for k, v in sorted(kinds.items())) or "yok"))
    if opens:
        out.append(f"  açılışlar ({len(opens)}):")
        for r in opens[-8:]:
            out.append(f"    {r.get('t','')[:16]} {r.get('model')} {r.get('yon')} lot={r.get('lot')} "
                       f"risk${r.get('risk_usd')} çarpan={r.get('risk_carpani')}")
    if closes:
        rs = [c.get("pnl_usd") for c in closes if isinstance(c.get("pnl_usd"), (int, float))]
        net = round(sum(rs), 2) if rs else 0
        out.append(f"  kapanışlar ({len(closes)}) net=${net}:")
        for r in closes[-8:]:
            out.append(f"    {r.get('t','')[:16]} {r.get('model')} {r.get('yol')} pnl=${r.get('pnl_usd')}")
    if govs:
        for r in govs[-5:]:
            out.append(f"  🎚 governor: {r.get('t','')[:16]} {r.get('model')} {r.get('karar','')}")
    if errs:
        out.append(f"  ⚠️ hata/uyarı ({len(errs)}):")
        for r in errs[-8:]:
            out.append(f"    {r.get('t','')[:16]} {r.get('kind')} {r.get('neden', r.get('islem',''))}")
        if len(errs) >= 5:
            flag(f"Gold bot: son {gunluk} günde {len(errs)} hata/uyarı — logu incele.")

    # son selftune sıralaması (kısaca kazananlar)
    stl = _read_jsonl(os.path.join(data, "selftune_log.jsonl"))
    if stl:
        out.append("  son selftune:")
        for r in stl[-2:]:
            out.append(f"    {r.get('t','')[:16]} [{r.get('model','?')}] {r.get('note','')}")


# ── 2) MT5 KÖPRÜLERİ ────────────────────────────────────────────────────────
# ZAMAN-FARKINDALIK: bir hata GÜNCEL mi (son RECENT_MIN dk) yoksa çözülmüş/eski mi?
# 3 günlük pencerede biriken eski hatalar (ör. düğme sonradan açıldı) yanlış alarm
# vermesin — anormallik YALNIZ güncel hatalar için işaretlenir.
_RE_TS = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})")
RECENT_MIN = 30


def _line_ts(ln):
    m = _RE_TS.match(ln)
    if not m:
        return None
    try:
        return dt.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def _fmt_ago(ts, now):
    if ts is None:
        return "?"
    dmin = (now - ts).total_seconds() / 60
    if dmin < 60:
        return f"{int(dmin)} dk once"
    if dmin < 1440:
        return f"{dmin / 60:.1f} saat once"
    return f"{dmin / 1440:.1f} gun once"


def _bridge_report(out, name, logfile, since_ts, gunluk):
    now = dt.datetime.now()
    recent_cut = now - dt.timedelta(minutes=RECENT_MIN)
    path = os.path.join(BRIDGE_DIR, logfile)
    lines = _tail_lines(path)
    if not lines:
        out.append(f"  [{name}] log yok: {logfile}")
        return
    cutoff = dt.datetime.fromtimestamp(since_ts) if since_ts else None
    kept = []
    for ln in lines:
        ts = _line_ts(ln)
        if ts and cutoff and ts < cutoff:
            continue
        kept.append((ln.rstrip(), ts))

    def recent(sub):
        return [x for x in sub if x[1] and x[1] >= recent_cut]

    def last_ts(sub):
        tss = [x[1] for x in sub if x[1]]
        return max(tss) if tss else None

    errs      = [x for x in kept if " ERROR " in x[0]]
    warns     = [x for x in kept if " WARNING " in x[0]]
    autotr    = [x for x in errs if "AutoTrading disabled" in x[0]]
    invstops  = [x for x in kept if "Invalid stops" in x[0] or "retcode=10016" in x[0]]
    recon     = [x for x in kept if re.search(r"eniden bağlan|reconnect|bağlantı yok", x[0], re.I)]
    locks     = [x for x in kept if "HESAP KİLİDİ" in x[0] or "HESAP KILIDI" in x[0]]
    orders_ok = [x for x in kept if re.search(r"AÇILDI|KAPANDI", x[0]) and "AMADI" not in x[0]]
    other     = [x for x in errs if x not in autotr and x not in invstops]

    out.append(f"  [{name}] satir={len(kept)} · ERROR={len(errs)} WARNING={len(warns)}")
    lo = last_ts(orders_ok)
    if lo:
        out.append(f"    ✅ son basarili emir/kapanis: {lo:%H:%M} ({_fmt_ago(lo, now)})")

    if locks:
        rl = recent(locks)
        out.append(f"    🔒 HESAP KILIDI kaydi: {len(locks)} (son {_fmt_ago(last_ts(locks), now)})")
        if rl:
            flag(f"{name}: HESAP KILIDI GUNCEL ({len(rl)} son {RECENT_MIN}dk) — terminal_path/hesap yanlis!")

    if autotr:
        r = recent(autotr)
        if r:
            out.append(f"    ⚠️🔴 AutoTrading DUGMESI KAPALI — GUNCEL ({len(r)} son {RECENT_MIN}dk). Ctrl+E ile ac!")
            flag(f"{name}: AutoTrading dugmesi KAPALI (guncel) — terminalde Ctrl+E ile ac (YESIL).")
        else:
            out.append(f"    ✓ AutoTrading: {len(autotr)} eski hata (son {_fmt_ago(last_ts(autotr), now)}) — dugme acildi, COZULDU.")

    if recon:
        r = recent(recon)
        out.append(f"    🔁 reconnect: {len(recon)} (son {_fmt_ago(last_ts(recon), now)})")
        if len(r) >= 3:
            flag(f"{name}: {len(r)} reconnect son {RECENT_MIN}dk — terminal/VPS kararsiz.")

    if invstops:
        r = recent(invstops)
        tag = "GUNCEL" if r else "eski/cozulmus"
        out.append(f"    ⛔ Invalid stops (retcode 10016): {len(invstops)} [{tag}], son {_fmt_ago(last_ts(invstops), now)}")
        for l, _ in invstops[-2:]:
            out.append(f"      {l[:110]}")
        if r:
            flag(f"{name}: 'Invalid stops' GUNCEL ({len(r)} son {RECENT_MIN}dk) — o sembollerin min-stop mesafesi; kod-fix adayi.")

    if other:
        r = recent(other)
        for l, _ in other[-3:]:
            out.append(f"    ❌ {l[:110]}")
        if len(r) >= 3:
            flag(f"{name}: {len(r)} baska ERROR son {RECENT_MIN}dk (son {_fmt_ago(last_ts(other), now)}) — logu incele.")


def section_bridges(out, since_ts, gunluk):
    out.append("\n" + "=" * 70)
    out.append("2) MT5 KÖPRÜLERİ (emir gerçekleri)")
    out.append("=" * 70)
    _bridge_report(out, "forex-köprü 550055", "bridge.log", since_ts, gunluk)
    _bridge_report(out, "günizi-köprü 550066", "scanner_bridge.log", since_ts, gunluk)


# ── 3) BACKEND ÖĞRENME DURUMU (Render API) ──────────────────────────────────
def section_learning(out):
    out.append("\n" + "=" * 70)
    out.append("3) BACKEND ÖĞRENME DURUMU (Render)")
    out.append("=" * 70)
    try:
        import urllib.request
        url = f"{BACKEND_URL}/api/mt5-scanner/status"
        req = urllib.request.Request(url, headers={"User-Agent": "vps-tani"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        lr = data.get("learning", {})
        out.append(f"  MT5 tarayıcı: açık={data.get('openCount')} gölge={data.get('shadowOpenCount')} "
                   f"öğrenme={'AÇIK' if lr.get('enabled') else 'kapalı'}")
        if lr.get("shadowCombos"):
            out.append(f"    🌑 gölgede (işlem yok): {', '.join(lr['shadowCombos'])}")
            flag(f"MT5 tarayıcı: {len(lr['shadowCombos'])} kombo gölgede — kalıcı kötüyse strateji gözden geçir.")
        if lr.get("boostedCombos"):
            out.append(f"    📈 risk artırıldı: {', '.join(lr['boostedCombos'])}")
        if lr.get("reducedCombos"):
            out.append(f"    📉 risk kısıldı: {', '.join(lr['reducedCombos'])}")
        b = data.get("budget", {})
        if b:
            out.append(f"    bütçe: günlük kalan ${b.get('remainingDailyUsd')}/{b.get('dailyCapUsd')} · "
                       f"toplam ${b.get('remainingTotalUsd')}/{b.get('totalCapUsd')}")
    except Exception as e:  # noqa: BLE001
        out.append(f"  ⚠️ Render API'ye ulaşılamadı: {e}")
        out.append("  (İnternet yoksa veya site kapalıysa bu bölüm atlanır — kritik değil.)")


# ── ANA ─────────────────────────────────────────────────────────────────────
def main():
    # Windows Türkçe konsolu (cp1254) emoji basamaz → UTF-8'e sabitle (rapor
    # dosyası zaten UTF-8; bu yalnız konsol çıktısını korur).
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--gunluk", type=int, default=3, help="son kaç gün (vars. 3)")
    ap.add_argument("--cikti", default=None, help="rapor dosyası yolu")
    args = ap.parse_args()

    now = dt.datetime.now()
    since_ts = (now - dt.timedelta(days=args.gunluk)).timestamp()
    out = []
    out.append("#" * 70)
    out.append(f"# BORSA KRALI — VPS TANI RAPORU  {now:%Y-%m-%d %H:%M:%S}")
    out.append(f"# kapsam: son {args.gunluk} gün · VPS: {os.environ.get('COMPUTERNAME','?')}")
    out.append("#" * 70)

    section_gold(out, since_ts, args.gunluk)
    section_bridges(out, since_ts, args.gunluk)
    section_learning(out)

    out.append("\n" + "=" * 70)
    out.append("⚠️  ANORMALLİKLER — bizim MANUEL bakmamız gerekenler")
    out.append("=" * 70)
    if anomalies:
        for i, a in enumerate(anomalies, 1):
            out.append(f"  {i}. {a}")
    else:
        out.append("  ✓ Otomatik tarama anormallik bulmadı (her şey normal görünüyor).")

    report = "\n".join(out)
    print(report)

    cikti = args.cikti or os.path.join(HERE, f"tani_{now:%Y%m%d_%H%M}.txt")
    try:
        with open(cikti, "w", encoding="utf-8") as f:
            f.write(report)
        print(f"\n>>> Rapor yazıldı: {cikti}")
        print(">>> Bu dosyayı bize geri getir (RDP kopya / paylaşılan klasör).")
    except OSError as e:
        print(f"\n(Rapor dosyaya yazılamadı: {e} — yukarıdaki konsol çıktısını kopyala.)")


if __name__ == "__main__":
    main()
