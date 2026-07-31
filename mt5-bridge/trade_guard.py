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


# ── YASAKLI ENSTRÜMANLAR (2026-07-24, kullanıcı: "gümüş işlemleri yasak") ──────
# Backend'in instrumentBans.js'iyle AYNI kural — köprü savunma derinliğidir:
# backend'e dokunulamadığı/eski sürümde kaldığı durumda da gümüş emri açılmaz.
#
# ⚠️ YALNIZ **YENİ EMİR AÇMAYI** engeller. Kapatma/trailing yolları BİLEREK muaf:
# aksi hâlde MT5'te açık duran bir gümüş pozisyonu yönetilemez hâle gelirdi.
# Kill switch: config'te "instrument_bans_disabled": true
_BANNED_PREFIXES = ("XAG", "SILVER")
_BANNED_EXACT = {"SIF"}          # Yahoo 'SI=F'


def _norm_symbol(raw):
    """'XAG/USD'→'XAGUSD' · 'SI=F'→'SIF' · 'XAGUSD.'→'XAGUSD' · 'OANDA:XAGUSD'→'XAGUSD'"""
    s = str(raw or "").upper().strip()
    if ":" in s:
        s = s.rsplit(":", 1)[1]
    return "".join(ch for ch in s if ch.isalnum())


def is_banned_symbol(symbol, cfg=None):
    """Bu sembole YENİ pozisyon açmak yasak mı? Her yazımı (feed id, broker adı,
    Yahoo sembolü, sonek varyantları) kabul eder."""
    if cfg and cfg.get("instrument_bans_disabled"):
        return False
    n = _norm_symbol(symbol)
    if not n:
        return False
    if n in _BANNED_EXACT:
        return True
    if any(n.startswith(p) for p in _BANNED_PREFIXES):
        return True
    for extra in (cfg or {}).get("banned_instruments") or []:
        e = _norm_symbol(extra)
        if e and n.startswith(e):
            return True
    return False


# ── LOT SINIRLARI ────────────────────────────────────────────────────────
# Eski/merkezî-beyinsiz köprüler savunma derinliği olarak 0.15 lot (konsensüs
# 0.20) tavanında kalır. Yeni merkezî beyin modunda lot, sabit bir sayıdan değil
# SL mesafesindeki gerçek dolar riskinden hesaplanır; hesap kademesi izin verirse 1.0
# lota kadar çıkabilir. Bu yüksek tavan YALNIZ `central_brain_enabled=true` iken
# kullanılır; köprüde merkezî pre-trade kararı alınamazsa emir fail-closed reddedilir.
LOT_HARD_MIN = 0.01
LOT_LEGACY_HARD_MAX = 0.15
LOT_BRAIN_HARD_MAX = 1.00
# Geriye uyum: eski test/import'lar bu sabiti kullanıyor.
LOT_HARD_MAX = LOT_LEGACY_HARD_MAX
# Konsensüs botu (Bot 37, magic 5749) — birden çok botun ortak kararı.
CONSENSUS_LOT = 0.20
CONSENSUS_BOT_ID = "consensus-radar"
CONSENSUS_MAGIC = 5749


def is_consensus(feed_row):
    """Bu feed satırı Bot 37 konsensüs pozisyonu mu? (botId VEYA magic ile —
    biri eksik/eski sürüm olsa da diğeri yakalar.)"""
    if not isinstance(feed_row, dict):
        return False
    if str(feed_row.get("botId") or "") == CONSENSUS_BOT_ID:
        return True
    try:
        return int(feed_row.get("magic") or 0) == CONSENSUS_MAGIC
    except (TypeError, ValueError):
        return False


def lot_cap_for(feed_row=None, cfg=None):
    """Bu işlem için izin verilen azami lot.

    Merkezî beyin kapalıysa eski 0.15/0.20 savunma tavanı korunur. Beyin açıksa
    sabit konsensüs ayrıcalığı yoktur: her bot aynı dolar-risk kapılarından geçer
    ve yalnız hesap kademesi/config tavanına kadar (mutlak 1.0) büyüyebilir.
    """
    cfg = cfg or {}
    brain_on = cfg.get("central_brain_enabled") is True
    cap = LOT_BRAIN_HARD_MAX if brain_on else (
        CONSENSUS_LOT if is_consensus(feed_row) else LOT_LEGACY_HARD_MAX
    )
    # Backend feed'i per-pozisyon tavan bildiriyorsa (bridgeFeed `lotCap`) onu da
    # dikkate al — ama YALNIZ DÜŞÜRÜCÜ yönde; feed bizden yüksek tavan isteyemez.
    # Eski backend `lotCap` alanı 0.15/0.20 sabitidir. Merkezî beyin modunda
    # risk-doğrulanmış dinamik lotu yanlışlıkla kırpmaması için kullanılmaz.
    if not brain_on and isinstance(feed_row, dict) and feed_row.get("lotCap") is not None:
        try:
            feed_cap = float(feed_row["lotCap"])
            if feed_cap > 0:
                cap = min(cap, feed_cap)
        except (TypeError, ValueError):
            pass
    # config yalnız DÜŞÜREBİLİR (güvenlik yönü tek taraflı).
    try:
        tier_cap = cfg.get("account_tier_max_lot", cfg.get("brain_max_lot", cap))
        cfg_cap = float(cfg.get("max_lot", tier_cap) if not brain_on else tier_cap)
        if cfg_cap > 0:
            cap = min(cap, cfg_cap)
    except (TypeError, ValueError):
        pass
    return cap


def clamp_lot(lot, info=None, feed_row=None, cfg=None):
    """Lot'u etkin emniyet tavanına ve broker adımına AŞAĞI oturtur.

    Hesaplanan güvenli lot broker minimumunun altındaysa yukarı büyütmez; 0.0
    döndürüp işlemi reddeder. Aksi davranış geniş stopta hedef dolar riskini
    sessizce aşardı.

    Dönen 0.0 = bu broker'da geçerli lot üretilemedi (işlem açılmamalı)."""
    try:
        lot = float(lot)
    except (TypeError, ValueError):
        return 0.0
    if not (lot > 0):
        return 0.0
    step = float(getattr(info, "volume_step", 0) or 0.01)
    vmin = float(getattr(info, "volume_min", 0) or LOT_HARD_MIN)
    vmax = float(getattr(info, "volume_max", 0) or LOT_BRAIN_HARD_MAX)
    cap = lot_cap_for(feed_row, cfg)
    floor_lot = max(LOT_HARD_MIN, vmin)
    # Taban tavanı aşıyorsa (örn. broker volume_min 0.5 > 0.15) işlem AÇILAMAZ.
    if floor_lot > cap + 1e-9 or floor_lot > vmax + 1e-9:
        return 0.0
    raw_lot = min(lot, cap, vmax)
    if raw_lot + 1e-9 < floor_lot:
        return 0.0
    # ⚠️ Adıma AŞAĞI otur — repo değişmezi: yuvarlama riski sinyalin üstüne
    # ASLA taşımaz (en yakına yuvarlamak 0.017→0.02 yapıp riski büyütürdü).
    lot = round(int(raw_lot / step + 1e-9) * step, 2)
    if lot < floor_lot:
        return 0.0
    return lot


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
    """1.0 lotun stop mesafesindeki hesap-parasi zarari.

    Risk yonunde ``trade_tick_value_loss`` esastir; profit alias'i ancak broker
    loss degerini vermiyorsa geriye uyumlu yedektir.
    """
    tv = float(getattr(info, "trade_tick_value_loss", 0)
               or getattr(info, "trade_tick_value", 0) or 0)
    ts = float(getattr(info, "trade_tick_size", 0) or 0)
    if tv > 0 and ts > 0:
        return stop_dist / ts * tv
    # Contract-size * price-distance is denominated in the symbol's quote
    # currency, not necessarily the account currency (EURGBP on a USD account
    # is the classic failure). Missing broker tick conversion is therefore
    # unknown risk and must stay 0 so central callers reject/mark unbounded.
    return 0.0


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


def _is_trading_deal(d):
    """True yalnız gerçek AL/SAT (pozisyon) deal'i için. Bilanço hareketleri
    (DEAL_TYPE_BALANCE=2 yatırma/çekme, credit/charge/correction=3..) trading
    P/L değildir; HESAP katmanı bunları zarar/kar sayarsa günlük fren yanlış
    tetiklenir ya da gerçek zararı maskeler. type alanı yoksa (test stub'ları)
    geriye-uyum için trading kabul edilir; gerçek MT5 deal'lerinde tip hep vardır."""
    t = getattr(d, "type", None)
    return t is None or t in (0, 1)  # 0=DEAL_TYPE_BUY, 1=DEAL_TYPE_SELL


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
        if not _is_trading_deal(d):
            continue  # bilanço/komisyon-dışı hareketler trading P/L'i değildir
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
    Yüzde tabanı = gün-başı bakiye ≈ bakiye − bugünkü realized.
    `risk_fail_closed=true` (merkezî beyin modunda varsayılan) ise hesap/history/
    pozisyon verisi okunamadığında yeni emirler bloke edilir.
    Dönüş: (blok?, sebep|None)."""
    fail_closed = bool(cfg.get("risk_fail_closed", cfg.get("central_brain_enabled", False)))
    layers = [
        ("HESAP", None, float(cfg.get("max_daily_loss_pct_account", 4.5) or 0)),
        ("BOT", cfg.get("magic"), float(cfg.get("max_daily_loss_pct", 3.0) or 0)),
    ]
    if all(pct <= 0 for _, _, pct in layers):
        return False, None
    ai = mt5mod.account_info()
    balance = getattr(ai, "balance", None) if ai else None
    if not balance or balance <= 0:
        reason = "hesap bilgisi/bakiye okunamadi"
        if fail_closed and logger:
            logger.error("gunluk zarar freni: %s (fail-closed).", reason)
        return (True, reason) if fail_closed else (False, None)
    if deals is None:
        deals = fetch_recent_deals(mt5mod, 0, skew=skew)
    if deals is None:
        if logger:
            logger.error("gunluk zarar freni: deal history okunamadi (%s).",
                         "fail-closed" if fail_closed else "fail-open")
        return (True, "deal history okunamadi") if fail_closed else (False, None)
    if positions is None:
        positions = mt5mod.positions_get()
    if positions is None:
        reason = "acik pozisyonlar okunamadi"
        if fail_closed and logger:
            logger.error("gunluk zarar freni: %s (fail-closed).", reason)
        return (True, reason) if fail_closed else (False, None)
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


def paper_close_allowed(cfg):
    """Kagit yarisma GERCEK pozisyonu kapatabilir mi?

    Kullanici karari (2026-07-31): yaris modunda gercek pozisyonu yalniz beyin
    ya da broker kapatir (TP / SL / iz suren stop / kar kilidi / suru donusu).
    Sitedeki kagit yarismanin sinyali bitti diye gercek islemi kapatmak, beynin
    3R hedefini ve trail'ini devreye giremeden olduruyordu -> kurusluk kapanislar.

    Bu kapi YALNIZ "feed'den dustu, kapat" yolunu etkiler. Gun-sonu supurmesi,
    hafta sonu tahliyesi, haber molasi ve yasakli enstruman tahliyesi AYRI
    risk katmanlaridir ve her zaman calisir.
    """
    cfg = cfg or {}
    if cfg.get("race_mode") is True:
        return False
    # Eski anahtar adlari korunur: birlesik kopru close_on_feed_drift,
    # forex/tarayici close_on_backend_close kullanir.
    for key in ("close_on_feed_drift", "close_on_backend_close"):
        if key in cfg:
            return bool(cfg.get(key))
    return True
