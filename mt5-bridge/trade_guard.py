#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ortak İŞLEM KORUMASI — iki MT5 köprüsü için (forex 550055 + gün-içi tarayıcı 550066)
====================================================================================
İki kural, TEK yerde (kod tekrarını önlemek + tek noktadan değiştirmek için):

  1) HAFTA SONU (yalnız KRİPTO-DIŞI): Cuma 23:45 TSI → Pazartesi 03:00 TSI arası
     kripto-dışı (forex/altın/gümüş/endeks) pozisyonlar KAPATILIR ve YENİ AÇILMAZ.
     Kripto (BTC/ETH/XRP/SOL) 7/24 → hafta sonundan ETKİLENMEZ.
     → Tamamen YEREL zaman hesabı (ağ gerekmez) = her koşulda güvenli çalışır.

  2) HABER MOLASI (TÜM enstrümanlar, kripto DAHİL): ABD önemli verisi
     (TÜFE/NFP/işsizlik/FOMC/Fed konuşmaları) ±30 dk penceresinde TÜM pozisyonlar
     KAPATILIR ve YENİ AÇILMAZ. Pencere listesi backend'den (/api/market-guard)
     çekilir ve diske cache'lenir → backend anlık düşse bile son-iyi liste korur.
     Pencere HİÇ bilinmiyorsa (ilk açılış + backend düşük + cache yok) → fail-OPEN
     (işlem serbest) + uyarı loglar (bot kilitlenmez).

Zaman: TSI = UTC+3 sabit (Türkiye DST uygulamaz) — köprülerdeki tr zamanıyla aynı.
"""
import os
import json
import time
import logging
from datetime import datetime, timezone, timedelta

log = logging.getLogger("bk-guard")

TR_OFFSET = timedelta(hours=3)                 # Türkiye sabit UTC+3
CRYPTO_IDS = {"BTCUSD", "ETHUSD", "XRPUSD", "SOLUSD"}

# Hafta sonu KAPALI penceresi (TSI):
WEEKEND_CLOSE_DOW = 4              # Cuma (Pzt=0 ... Paz=6)
WEEKEND_CLOSE_MIN = 23 * 60 + 45  # 23:45 TSI
WEEKEND_OPEN_DOW = 0              # Pazartesi
WEEKEND_OPEN_MIN = 3 * 60         # 03:00 TSI

DEFAULT_NEWS_TTL = 600            # backend'i en çok 10 dk'da bir yokla (pencereler yavaş değişir)


def is_crypto(instrument_id):
    """BTC/ETH/XRP/SOL → True (hafta sonundan muaf). Diğer her şey → False."""
    return str(instrument_id or "").upper() in CRYPTO_IDS


def inst_for_symbol(cfg, broker_sym):
    """Broker sembolünden (örn 'US100.cash') enstrüman kimliğini (örn 'NAS100')
    çöz — cfg['symbols'] instrumentId→broker eşlemesini TERS çevirerek."""
    for inst, sym in (cfg.get("symbols") or {}).items():
        if sym == broker_sym:
            return inst
    return broker_sym  # eşleşme yoksa sembolün kendisi (kripto listesinde değilse kripto-dışı sayılır)


def _tr_now(now_utc=None):
    return (now_utc or datetime.now(timezone.utc)) + TR_OFFSET


def in_weekend_closed(now_utc=None):
    """Kripto-DIŞI için hafta sonu KAPALI penceresinde miyiz?
    Cuma 23:45 TSI → Pazartesi 03:00 TSI (Cmt/Paz tam gün)."""
    tr = _tr_now(now_utc)
    dow = tr.weekday()
    minute = tr.hour * 60 + tr.minute
    if dow in (5, 6):                                             # Cumartesi / Pazar
        return True
    if dow == WEEKEND_CLOSE_DOW and minute >= WEEKEND_CLOSE_MIN:  # Cuma 23:45+
        return True
    if dow == WEEKEND_OPEN_DOW and minute < WEEKEND_OPEN_MIN:     # Pazartesi <03:00
        return True
    return False


def _static_news_event(now_epoch=None):
    """FAIL-CLOSED yedegi: backend+cache YOKken bile bilinen en yuksek-etkili
    tekrarlayan ABD olayini (NFP = ayin ilk Cumasi ~08:30 ET) GENIS, DST-guvenli
    pencereyle blokla. Ag gerekmez. Yalniz bu pencerede olay dondurur; disinda None."""
    now = (datetime.fromtimestamp(now_epoch, timezone.utc)
           if now_epoch else datetime.now(timezone.utc))
    if now.weekday() == 4 and now.day <= 7:            # ayin ilk Cumasi
        minute = now.hour * 60 + now.minute
        if 12 * 60 <= minute <= 14 * 60:               # 12:00-14:00 UTC (EDT 12:30 & EST 13:30)
            return {"title": "ABD NFP (statik yedek - backend erisilemedi)"}
    return None


# ── ORTAK RİSK MATEMATİĞİ (iki köprü de kullanır — 2026-07-06 review: kopyalar
# ayrışırsa iki canlı bot aynı hesapta FARKLI dolar-riski uygular) ─────────────

def contract_size(info):
    cs = getattr(info, "trade_contract_size", 0) or 0
    try:
        cs = float(cs)
    except (TypeError, ValueError):
        return 0.0
    return cs if cs > 0 else 0.0


def per_lot_risk_usd(info, stop_dist):
    """1.0 lotun stop mesafesindeki $ riski. trade_tick_value/trade_tick_size HESAP
    para biriminde dogru deger verir (USDJPY gibi USD-quote-olmayanlar dahil);
    yoksa contract_size'a duser (USD-quote varsayimi)."""
    tv = float(getattr(info, "trade_tick_value", 0) or 0)
    ts = float(getattr(info, "trade_tick_size", 0) or 0)
    if tv > 0 and ts > 0:
        return stop_dist / ts * tv
    contract = contract_size(info)
    return stop_dist * contract if contract > 0 else 0.0


# ── GÜNLÜK ZARAR DEVRE-KESİCİSİ (2026-07-06 olayı) ──────────────────────────
# Gece tek seferde -%3.3 birikti (FTMO günlük %5 limitine ramak); hiçbir katman
# "bugün yeter" demiyordu. Bu fren TR-günü gerçekleşen + açık (floating) P/L'i
# MT5'ten okur; eşik aşılırsa köprü YENİ pozisyon açmaz (mevcutlar yönetilir).
# Durum tutmaz (restart-safe). Köprü, deal listesini TUR BAŞINA BİR KEZ çeker
# (fetch_recent_deals) ve hem bu frene hem sembol-frenine verir (review: eski
# hali tur başına 3 ayrı tam-gün history taraması yapıyordu).

def _tr_day_start_utc(now_utc=None):
    """İçinde bulunulan TR-gününün başlangıcı (UTC datetime)."""
    tr = _tr_now(now_utc)
    tr_midnight = tr.replace(hour=0, minute=0, second=0, microsecond=0)
    return tr_midnight - TR_OFFSET


def server_clock_skew(mt5mod, cfg=None):
    """⚠️ MT5 deal/tick zaman damgaları BROKER-SAATİ epoklarıdır (FTMO EET = UTC+2/+3),
    gerçek-UTC değil (review 2026-07-06: sapma düzeltilmezse fren pencereleri son
    ~3 saatin kapanışlarını GÖRMEZ — devre-kesici tam ihtiyaç anında kör kalır).
    Sapma en taze tick'ten ölçülür (kripto 7/24 → hafta sonu bile güvenilir);
    ölçülemezse 0 (geniş fetch marjları yine korur)."""
    try:
        for sym in ((cfg or {}).get("symbols") or {}).values():
            t = mt5mod.symbol_info_tick(sym)
            ts = getattr(t, "time", 0) or 0
            if ts > 0:
                skew = ts - time.time()
                if abs(skew) <= 26 * 3600:
                    return skew
    except Exception:  # noqa
        pass
    return 0.0


def fetch_recent_deals(mt5mod, lookback_extra_min=60, skew=0.0):
    """TR-günü başından (veya sembol-freni penceresi daha erken başlıyorsa oradan)
    şimdiye dek TÜM deal'ler. Sınırlar broker-saat sapmasıyla kaydırılır ve ±4h
    marj bırakılır (kütüphane/terminal zaman-yorumu farkları emilsin; fazlası
    zaten deal.time filtreleriyle elenir). None = history okunamadı (fail-open)."""
    now = datetime.now(timezone.utc)
    start = min(_tr_day_start_utc(), now - timedelta(minutes=float(lookback_extra_min) + 5))
    start = start + timedelta(seconds=skew) - timedelta(hours=4)
    end = now + timedelta(seconds=skew) + timedelta(hours=4)
    return mt5mod.history_deals_get(start, end)


def _deal_pnl(d):
    return (getattr(d, "profit", 0) or 0) + (getattr(d, "swap", 0) or 0) + (getattr(d, "commission", 0) or 0)


def daily_pnl_usd(mt5mod, magic=None, now_utc=None, deals=None, positions=None, skew=0.0):
    """(realized, floating, ok): bugünkü (TR) kapanan deal P/L toplamı
    (profit+swap+commission) + açık pozisyonların anlık P/L'i. magic verilirse
    yalnız o botun işlemleri; None → hesabın TÜMÜ. deals/positions verilmişse
    yeniden çekilmez (tur-başı tek çekim); deal.time (broker-saati) skew ile
    düzeltilmiş TR-gün başıyla filtrelenir. History okunamazsa ok=False (fail-open)."""
    if deals is None:
        deals = fetch_recent_deals(mt5mod, 0, skew=skew)
    if deals is None:
        return 0.0, 0.0, False
    # 15 dk tolerans: sapma ölçümü tick-taze olmayabilir; fren için gün sınırının
    # dakikalar düzeyinde oynaması kabul edilebilir, deal KAÇIRMAK edilemez.
    day_start_epoch = _tr_day_start_utc(now_utc).timestamp() + skew - 900
    realized = 0.0
    for d in deals:
        if magic is not None and getattr(d, "magic", None) != int(magic):
            continue
        t = getattr(d, "time", None)
        if t is not None and t < day_start_epoch:
            continue  # fetch penceresi gün başından erken başlayabilir (sembol-freni payı)
        realized += _deal_pnl(d)
    if positions is None:
        positions = mt5mod.positions_get()
    floating = 0.0
    for p in (positions or []):
        if magic is not None and getattr(p, "magic", None) != int(magic):
            continue
        floating += (getattr(p, "profit", 0) or 0) + (getattr(p, "swap", 0) or 0)
    return realized, floating, True


def daily_loss_blocked(mt5mod, cfg, logger=None, deals=None, positions=None, skew=0.0):
    """İki katmanlı kontrol (tek deal/pozisyon çekimiyle):
      • HESAP katmanı: TÜM magic'lerin toplamı ≤ -max_daily_loss_pct_account → blok
        (FTMO günlük %5 limitini diğer botlarla BİRLİKTE korur).
      • BOT katmanı: bu botun (magic) günlük realized+floating ≤ -max_daily_loss_pct → blok.
    Yüzde tabanı = gün-başı bakiye ≈ bakiye − bugünkü realized. Veri yoksa fail-open.
    Dönüş: (blok?, sebep|None)."""
    layers = [
        ("HESAP", None, float(cfg.get("max_daily_loss_pct_account", 4.5) or 0)),
        ("BOT", cfg.get("magic"), float(cfg.get("max_daily_loss_pct", 3.0) or 0)),
    ]
    if all(pct <= 0 for _, _, pct in layers):
        return False, None
    ai = mt5mod.account_info()
    balance = getattr(ai, "balance", None) if ai else None
    if not balance or balance <= 0:
        return False, None
    if deals is None:
        deals = fetch_recent_deals(mt5mod, 0, skew=skew)
    if deals is None:
        if logger:
            logger.warning("gunluk zarar freni: deal history okunamadi (fail-open).")
        return False, None
    if positions is None:
        positions = mt5mod.positions_get()
    for name, magic, pct in layers:
        if pct <= 0:
            continue
        realized, floating, ok = daily_pnl_usd(mt5mod, magic=magic, deals=deals, positions=positions, skew=skew)
        if not ok:
            continue
        day_start = balance - realized
        if day_start > 0 and (realized + floating) <= -(day_start * pct / 100.0):
            reason = ("%s gunluk P/L %.2f$ (gerceklesen %.2f + acik %.2f) <= -%%%s"
                      % (name, realized + floating, realized, floating, pct))
            if logger:
                logger.warning("🛑 GUNLUK ZARAR FRENI (%s): %s — yeni islem YOK.", name.lower(), reason)
            return True, reason
    return False, None


def symbols_with_recent_loss(mt5mod, magic, minutes, deals=None, skew=0.0):
    """Son `minutes` dakikada bu botun (magic) ZARARLA kapattığı semboller kümesi —
    köprü tarafı yeniden-giriş freni (backend cooldown'unun broker-tarafı sigortası).
    deals verilmişse yeniden çekilmez; pencere deal.time'ın broker-saati olduğu
    varsayımıyla skew-düzeltmeli kesilir (time alanı olmayan stub-deal dahil edilir).
    History okunamazsa boş küme (fail-open)."""
    if not minutes or minutes <= 0:
        return set()
    if deals is None:
        deals = fetch_recent_deals(mt5mod, float(minutes), skew=skew)
    if deals is None:
        return set()
    cutoff = time.time() + skew - float(minutes) * 60 - 300
    out = set()
    for d in deals:
        if getattr(d, "magic", None) != int(magic):
            continue
        if getattr(d, "entry", None) == getattr(mt5mod, "DEAL_ENTRY_IN", 0):
            continue  # giriş deal'i değil, kapanışlar
        t = getattr(d, "time", None)
        if t is not None and t < cutoff:
            continue
        if _deal_pnl(d) < 0:
            out.add(getattr(d, "symbol", ""))
    out.discard("")
    return out


def deal_close_info(mt5mod, ticket):
    """Pozisyonun kapanış deal'lerinden (toplam P/L, son kapanış fiyatı) çıkar —
    vanish/kapatma bildirimlerine gerçek sonucu eklemek için. Yoksa (None, None)."""
    try:
        deals = mt5mod.history_deals_get(position=ticket)
        if not deals:
            return None, None
        outs = [d for d in deals if getattr(d, "entry", None) != getattr(mt5mod, "DEAL_ENTRY_IN", 0)]
        if not outs:
            return None, None
        profit = sum(_deal_pnl(d) for d in outs)
        price = getattr(outs[-1], "price", None) or None
        return round(profit, 2), price
    except Exception:  # noqa
        return None, None


class NewsGuard:
    """Backend'den ABD haber pencerelerini çeker + diske cache'ler + 'şu an
    molada mıyız?' der. Ağ hatasında son-iyi cache korunur."""

    def __init__(self, backend_url, cache_path, ttl=DEFAULT_NEWS_TTL):
        self.url = (backend_url or "").rstrip("/") + "/api/market-guard"
        self.cache_path = cache_path
        self.ttl = ttl
        self._windows = None          # None = HİÇ bilinmiyor (fail-open), [] = bilinen boş
        self._fetched_at = 0.0
        self._load_disk()

    def _load_disk(self):
        try:
            with open(self.cache_path, "r", encoding="utf-8") as f:
                d = json.load(f)
            if isinstance(d, dict) and isinstance(d.get("windows"), list):
                self._windows = d["windows"]
                self._fetched_at = float(d.get("fetchedAt", 0) or 0)
        except Exception:  # noqa — cache yoksa/bozuksa sessiz geç
            pass

    def _save_disk(self):
        try:
            tmp = self.cache_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({"windows": self._windows or [], "fetchedAt": self._fetched_at}, f)
            os.replace(tmp, self.cache_path)
        except Exception as e:  # noqa
            log.warning("haber cache yazılamadı: %s", e)

    def refresh(self):
        """TTL dolduysa backend'den taze çek. Hata → eski cache aynen kalır."""
        if self._windows is not None and (time.time() - self._fetched_at) < self.ttl:
            return
        try:
            import requests
            r = requests.get(self.url, timeout=15)
            r.raise_for_status()
            data = r.json()
            wins = data.get("windows")
            if isinstance(wins, list):
                self._windows = wins
                self._fetched_at = time.time()
                self._save_disk()
        except Exception as e:  # noqa
            log.warning("haber penceresi çekilemedi (%s) — eski cache kullanılıyor.", e)

    def blackout_now(self, now_epoch=None):
        """(aktif?, olay|None) döndür. Pencere HİÇ bilinmiyorsa fail-OPEN → (False, None)."""
        self.refresh()
        if self._windows is None:
            # FAIL-CLOSED yedegi (C6): backend+cache yokken bile NFP gibi bilinen
            # yuksek-etkili olayi statik pencereyle blokla (eskiden fail-OPEN idi).
            ev = _static_news_event(now_epoch)
            return (True, ev) if ev else (False, None)
        now = now_epoch if now_epoch is not None else time.time()
        for w in self._windows:
            try:
                if float(w["startSec"]) <= now <= float(w["endSec"]):
                    return (True, w)
            except Exception:  # noqa — bozuk pencere satırını atla
                continue
        return (False, None)
