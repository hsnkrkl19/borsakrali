'use strict';

/**
 * bkXau — "BorsaKrali XAU MT5 Bot Paketi v1.0" (MQL5) sinyal çekirdeğinin
 * backend portu. Kaynak: Desktop\BorsaKrali_XAU_MT5_Bot_Paketi_v1.0
 * (BK_XAU_Scalp.mq5 + BK_XAU_Swing.mq5 + BK_Common.mqh). Tek yarışmacı bot
 * (Bot 38 · BK XAU Runner) iki alt motoru birlikte çalıştırır:
 *
 *  • Scalp: XAUUSD M5 sinyal + M30 rejim — tamamlanmış M30 rejiminde hızlı
 *    EMA(5/8/13) geri çekilme kırılımı; NY 07:00–10:30 penceresi, 08:25–08:40
 *    haber bloğu hariç.
 *  • Swing: XAUUSD M30 sinyal + H8 rejim — tamamlanmış H8 rejiminde momentum
 *    kırılımı (önceki 4 barın tepesi/dibi); NY 02:00–09:30 penceresi.
 *    ⚠️ H8 barları forexKlines.resampleHours ile 1h'den UTC epoch kovalarına
 *    (00/08/16 UTC) bölünür; MT5'in PERIOD_H8'i broker sunucu saatine hizalıdır
 *    (UTC+2/+3 → 22/06/14 UTC). Yani H8 bar sınırları EA ile 2-3 saat kayıktır.
 *    Rejim filtresi EMA13/34 (≈4-11 günlük yumuşatma) olduğundan yön kararı
 *    pratikte aynı kalır; yalnız rejim dönüş anlarında birkaç bar sapabilir.
 *
 * EA'daki runner yönetimi (BE@1R, çeyrek kâr 1.5R/3R, ATR iz-süren, 20R hedef)
 * köprünün TEK-TP modeline TP1 = 2R / TP2 = 4R olarak çevrilir. Gerekçe:
 *  • Köprü (borsakrali_mt5_all.py) emre yalnız target1'i TP olarak yazar ve
 *    config_all min_rr=1.5 kapısı "reward/risk < 1.5 ise AÇMA" der. EA'nın ilk
 *    çeyrek kademesi (1.5R) bu kapının TAM sınırında kalıyordu → 8 haneye
 *    yuvarlanan feed değerlerinde oran 1.4999… çıkıp sinyal sessizce
 *    "dusuk_rr" ile reddedilebilirdi.
 *  • 2R, EA'nın banka edilen iki çeyreğinin (1.5R + 3R) ortalamasına yakın
 *    tek-TP yaklaşıklığıdır ve platformun "seviyeler ≥1.8 R:R üretir"
 *    kuralına uyar.
 * İlk stop stratejinin ATR/yapı kuralından birebir gelir.
 * Spread kapısı sunucu tarafında uygulanmaz (Yahoo mid fiyat; lot/maliyet
 * yönetimi köprüde). Günlük işlem limiti/cooldown yerine competition'ın
 * mum-başına dedup'u + ardışık-bar tetik bastırması kullanılır.
 *
 * MQL ile eşleşen anlamlar:
 *  - Pencereler YARI-AÇIK [start, end) (BK_InMinuteWindow).
 *  - ATR oranı: ATR / son 24 kapalı-bar ATR medyanı (BK_BufferMedian shift 1×24).
 *  - Cuma NY ≥ 12:00 kesimi EA'da bir ÇIKIŞ kuralıdır; bu port pozisyon
 *    yönetmediği için PORT EDİLMEDİ. Gerçek MT5 pozisyonunun hafta sonu
 *    koruması köprüdeki trade_guard weekend_flatten'dır (bkz. isFridayRiskCut).
 *  - Tüm değerlendirme KAPALI barlarla (forming mum düşürülür).
 *
 * Kill-switch: BK_XAU_DISABLED=1 (yalnız yeni sinyali keser; fiyat beslemesi
 * sürer → açık paper pozisyonlar SL/TP'de kapanmaya devam eder). Aile kill'i
 * MT5_BOTS_DISABLED cronJobs/bridgeFeed katmanında zaten uygulanır.
 */

const forexKlines = require('../forex/forexKlines');
const brokerPrices = require('../forex/brokerPrices');
const { getInstrument } = require('../forex/forexInstruments');
const { ema } = require('../botBuilder/customBotEngine');

const FETCH_LIMIT = 320;
const INSTRUMENT_ID = 'XAUUSD';
const { TF_MS, closedBars } = forexKlines;

/**
 * KAPALI BAR SÜZGECİ — kritik; artık AİLE GENELİNDE paylaşılıyor.
 *
 * Bu botun ilk sürümünde yerel bir kopyası vardı ve kapalılığı "hizalı bar +
 * hizasız kotasyon satırı" varsayımıyla çözüyordu. Süzgeç mt5Bots ailesinin
 * tamamına taşınırken (forexKlines.closedBars) o varsayım DÜŞTÜ: Yahoo'nun 1d
 * barları epoch'a hizalı değildir (GC=F 04:00 UTC damgalı, EURUSD=X DST ile
 * gezer), hiza süzgeci tüm günlük botları sessizce susturabilirdi. Yeni ölçüt
 * saf zamandır — bar.time + tfMs <= serinin son satırının zamanı. Gerekçenin
 * tamamı ve canlı ölçümler forexKlines.closedBars başlığındadır.
 */

// ── MT5 YERLEŞİK GÖSTERGE EŞLENİKLERİ ───────────────────────────────────────
// EA iATR/iADX kullanır ve MT5'in bu iki göstergesi KLASİK Wilder tanımı DEĞİLDİR.
// Paylaşılan customBotEngine (Wilder) ile hesaplamak sinyal setini sistematik
// olarak kaydırıyordu, bu yüzden bu bot MT5 formüllerini yerel olarak uygular.
// (Paylaşılan motora dokunulmadı — diğer 37 botun davranışı korunuyor.)

// MT5 ATR.mq5: TR = max(high, prevClose) − min(low, prevClose); ATR = TR'nin SMA'sı
// (Wilder RMA DEĞİL — RMA'nın etkin hafızası ~2× uzun, mutlak ATR eşiklerini kaydırır).
function mt5Atr(c, len) {
  const out = new Array(c.length).fill(NaN);
  const tr = new Array(c.length).fill(NaN);
  for (let i = 1; i < c.length; i++) {
    tr[i] = Math.max(c[i].high, c[i - 1].close) - Math.min(c[i].low, c[i - 1].close);
  }
  let sum = 0;
  for (let i = 1; i < c.length; i++) {
    sum += tr[i];
    if (i > len) sum -= tr[i - len];
    if (i >= len) out[i] = sum / len;
  }
  return out;
}

// MT5 ADX.mq5: her barda ÖNCE DM'ler bar TR'sine bölünüp yüzdeye çevrilir, SONRA
// k=2/(len+1) EMA'sı ile düzlenir; ADX = DX'in aynı EMA'sı. (Wilder ise TR/DM'leri
// önce biriktirip sonra böler ve 1/len düzlemesi kullanır → farklı seviye.)
function mt5Dmi(c, len) {
  const n = c.length;
  const plusDI = new Array(n).fill(NaN);
  const minusDI = new Array(n).fill(NaN);
  const adx = new Array(n).fill(NaN);
  if (n < 2) return { plusDI, minusDI, adx };
  const k = 2 / (len + 1);
  let p = NaN, m = NaN, a = NaN;
  for (let i = 1; i < n; i++) {
    let up = c[i].high - c[i - 1].high;
    let dn = c[i - 1].low - c[i].low;
    if (up < 0) up = 0;
    if (dn < 0) dn = 0;
    if (up > dn) dn = 0;
    else if (up < dn) up = 0;
    else { up = 0; dn = 0; }
    const tr = Math.max(
      Math.abs(c[i].high - c[i].low),
      Math.abs(c[i].high - c[i - 1].close),
      Math.abs(c[i].low - c[i - 1].close),
    );
    const rawP = tr !== 0 ? (100 * up) / tr : 0;
    const rawM = tr !== 0 ? (100 * dn) / tr : 0;
    p = Number.isFinite(p) ? rawP * k + p * (1 - k) : rawP;
    m = Number.isFinite(m) ? rawM * k + m * (1 - k) : rawM;
    plusDI[i] = p;
    minusDI[i] = m;
    const sum = p + m;
    const dx = sum !== 0 ? (100 * Math.abs(p - m)) / sum : 0;
    a = Number.isFinite(a) ? dx * k + a * (1 - k) : dx;
    adx[i] = a;
  }
  return { plusDI, minusDI, adx };
}

// ── New York saati (BK_Common: ABD DST — mart 2. pazar 07:00 UTC → kasım 1. pazar 06:00 UTC)
function nthSundayUtc(year, month, nth) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (nth - 1) * 7;
}

function isNyDstUtc(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 2, nthSundayUtc(y, 2, 2), 7, 0);
  const end = Date.UTC(y, 10, nthSundayUtc(y, 10, 1), 6, 0);
  return ms >= start && ms < end;
}

function nyParts(ms) {
  const offsetH = isNyDstUtc(ms) ? -4 : -5;
  const ny = new Date(ms + offsetH * 3600 * 1000);
  return { minuteOfDay: ny.getUTCHours() * 60 + ny.getUTCMinutes(), dayOfWeek: ny.getUTCDay() };
}

// Yarı-açık pencere: [start, end). Gece devri (start>end) BK_Common ile aynı.
function inMinuteWindow(minuteOfDay, start, end) {
  if (!(minuteOfDay >= 0)) return false;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
}

/**
 * EA'nın IsFridayRiskCut'ı (NY Cuma ≥ 12:00). EA'da bu bir ÇIKIŞ kuralıdır:
 * açık pozisyonu hafta sonu gap'ine bırakmamak için kapatır; girişte hiç
 * çağrılmaz (zaten sinyal pencereleri 12:00'den önce biter).
 *
 * ⚠️ Bu port POZİSYON YÖNETMEZ (çıkışlar competition SL/TP + köprüde), bu
 * yüzden kural giriş kapısı olarak kullanılırsa ÖLÜ KOD olur — pencereler
 * [07:00,10:30) ve [02:00,09:30) NY olduğundan ≥12:00 koşuluna hiç ulaşılmaz.
 * Gerçek MT5 pozisyonunun hafta sonu koruması köprüdedir: trade_guard
 * weekend_flatten (Cuma 23:45 TSI → kripto-dışı düz). Fonksiyon burada
 * yalnızca kuralın karşılığı olarak tutulur ve testte doğrulanır.
 */
function isFridayRiskCut(ms) {
  const ny = nyParts(ms);
  return ny.dayOfWeek === 5 && ny.minuteOfDay >= 12 * 60;
}

function medianOf(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length !== values.length || !v.length) return NaN;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function highestHigh(c, from, to) { let m = -Infinity; for (let j = Math.max(0, from); j <= to; j++) m = Math.max(m, c[j].high); return m; }
function lowestLow(c, from, to) { let m = Infinity; for (let j = Math.max(0, from); j <= to; j++) m = Math.min(m, c[j].low); return m; }
function clampConf(v) { return Math.max(0, Math.min(100, Math.round(v))); }

// EMA34 + bir önceki bar için gereken asgari üst-TF barı. Motorların kapısı ile
// htfRegime'in kapısı AYNI sabite bağlıdır: aksi halde tam sınırdaki bir HTF
// beslemesinde motor kendi kapısını geçer ama rejim hep {false,false} döner ve
// sinyalin neden çıkmadığı hiçbir yerde görünmez (bir-eksik hatası).
const HTF_MIN_BARS = 41;

// Üst-TF rejimi (her iki motor aynı şekli kullanır; minSeparation motora göre).
// MQL: htf_close>ema13 && ema13>ema34 && ema34 yükseliyor && ayrışma ≥ eşik.
function htfRegime(cHtf, minSeparation) {
  if (!Array.isArray(cHtf) || cHtf.length < HTF_MIN_BARS) return { bull: false, bear: false };
  const j = cHtf.length - 1;
  const cl = cHtf.map((x) => x.close);
  const fast = ema(cl, 13), slow = ema(cl, 34);
  const ah = mt5Atr(cHtf, 14)[j];
  if (![fast[j], slow[j], slow[j - 1]].every(Number.isFinite) || !(ah > 0)) {
    return { bull: false, bear: false };
  }
  const sep = Math.abs(fast[j] - slow[j]) / ah;
  const close = cHtf[j].close;
  return {
    bull: close > fast[j] && fast[j] > slow[j] && slow[j] > slow[j - 1] && sep >= minSeparation,
    bear: close < fast[j] && fast[j] < slow[j] && slow[j] < slow[j - 1] && sep >= minSeparation,
    sep,
  };
}

function makeSignal(direction, entry, stopDist, confidence, barTime) {
  if (!(stopDist > 0)) return null;
  const sign = direction === 'long' ? 1 : -1;
  return {
    direction,
    side: direction,
    entry,
    stop: entry - sign * stopDist,
    // Runner kademeleri köprünün tek-TP modeline: TP1=2R (min_rr 1.5 kapısını
    // güvenli marjla geçer), TP2=4R.
    target1: entry + sign * 2.0 * stopDist,
    target2: entry + sign * 4.0 * stopDist,
    confidence: clampConf(confidence),
    time: barTime,
  };
}

// ── SCALP: M5 sinyal + M30 rejim (BK_XAU_Scalp.mq5 ReadSignal + OpenTrade) ───
const SCALP = {
  NY_START: 7 * 60, NY_END: 10 * 60 + 30,
  NEWS_START: 8 * 60 + 25, NEWS_END: 8 * 60 + 40,
  ADX_MIN: 20, MIN_HTF_SEPARATION: 0.20,
  MIN_BODY_ATR: 0.25, MIN_CLOSE_QUALITY: 0.65,
  MIN_ATR_RATIO: 0.65, MAX_ATR_RATIO: 1.60, MAX_CANDLE_ATR: 2.50,
  STOP_ATR_MIN: 1.10, STOP_ATR_MAX: 1.80, STRUCTURE_BUFFER_ATR: 0.10,
};

function evalScalp(c5, c30) {
  const i = c5.length - 1;
  if (i < 60 || !Array.isArray(c30) || c30.length < HTF_MIN_BARS) return null;

  const bar = c5[i];
  const ny = nyParts(bar.time).minuteOfDay;
  if (!inMinuteWindow(ny, SCALP.NY_START, SCALP.NY_END)
    || inMinuteWindow(ny, SCALP.NEWS_START, SCALP.NEWS_END)) return null;

  const cl = c5.map((x) => x.close);
  const e5 = ema(cl, 5)[i], e8 = ema(cl, 8)[i], e13 = ema(cl, 13)[i];
  const aSeries = mt5Atr(c5, 14);
  const a = aSeries[i];
  const aMed = medianOf(aSeries.slice(i - 23, i + 1));
  const { plusDI, minusDI, adx } = mt5Dmi(c5, 14);
  if (![e5, e8, e13, adx[i], plusDI[i], minusDI[i]].every(Number.isFinite)
    || !(a > 0) || !(aMed > 0)) return null;

  const range = bar.high - bar.low;
  if (!(range > 0)) return null;
  const body = Math.abs(bar.close - bar.open);
  const closeLocation = (bar.close - bar.low) / range;
  const atrRatio = a / aMed;
  const volatilityOk = atrRatio >= SCALP.MIN_ATR_RATIO
    && atrRatio <= SCALP.MAX_ATR_RATIO && range <= a * SCALP.MAX_CANDLE_ATR;
  if (!volatilityOk) return null;

  const regime = htfRegime(c30, SCALP.MIN_HTF_SEPARATION);
  const ribbonBull = e5 > e8 && e8 > e13;
  const ribbonBear = e5 < e8 && e8 < e13;

  let direction = null;
  if (regime.bull && ribbonBull
    && bar.low <= e8 && bar.close > e5
    && bar.close > c5[i - 1].high && bar.close > bar.open
    && body >= a * SCALP.MIN_BODY_ATR
    && closeLocation >= SCALP.MIN_CLOSE_QUALITY
    && adx[i] >= SCALP.ADX_MIN && plusDI[i] > minusDI[i]) direction = 'long';
  else if (regime.bear && ribbonBear
    && bar.high >= e8 && bar.close < e5
    && bar.close < c5[i - 1].low && bar.close < bar.open
    && body >= a * SCALP.MIN_BODY_ATR
    && closeLocation <= 1.0 - SCALP.MIN_CLOSE_QUALITY
    && adx[i] >= SCALP.ADX_MIN && minusDI[i] > plusDI[i]) direction = 'short';
  if (!direction) return null;

  // Stop: yapı (son 3 kapalı barın dibi/tepesi ± 0.10×ATR) ile 1.10×ATR
  // tabanından UZAK olanı; 1.80×ATR'den genişse kurulum atlanır (EA birebir).
  const entry = bar.close;
  let stopDist;
  if (direction === 'long') {
    const structure = lowestLow(c5, i - 2, i) - a * SCALP.STRUCTURE_BUFFER_ATR;
    stopDist = entry - Math.min(structure, entry - a * SCALP.STOP_ATR_MIN);
  } else {
    const structure = highestHigh(c5, i - 2, i) + a * SCALP.STRUCTURE_BUFFER_ATR;
    stopDist = Math.max(structure, entry + a * SCALP.STOP_ATR_MIN) - entry;
  }
  if (!(stopDist > 0) || stopDist > a * SCALP.STOP_ATR_MAX) return null;

  const conf = 62 + Math.min(8, (adx[i] - SCALP.ADX_MIN) / 2)
    + Math.min(6, (regime.sep - SCALP.MIN_HTF_SEPARATION) * 10);
  return makeSignal(direction, entry, stopDist, conf, bar.time);
}

// ── SWING: M30 sinyal + H8 rejim (BK_XAU_Swing.mq5 ReadSignal + OpenTrade) ───
const SWING = {
  NY_START: 2 * 60, NY_END: 9 * 60 + 30,
  ADX_MIN: 22, MIN_HTF_SEPARATION: 0.25,
  MIN_BODY_ATR: 0.30, CLOSE_QUALITY: 0.70,
  MIN_ATR_RATIO: 0.50, MAX_ATR_RATIO: 1.80, MAX_CANDLE_ATR: 3.00,
  STOP_ATR: 1.80, TRIGGER_LEN: 4,
};

function evalSwing(c30, c8h) {
  const i = c30.length - 1;
  if (i < 110 || !Array.isArray(c8h) || c8h.length < HTF_MIN_BARS) return null;

  const bar = c30[i];
  const ny = nyParts(bar.time).minuteOfDay;
  if (!inMinuteWindow(ny, SWING.NY_START, SWING.NY_END)) return null;

  const cl = c30.map((x) => x.close);
  const eFast = ema(cl, 8), eSlow = ema(cl, 21);
  const aSeries = mt5Atr(c30, 14);
  const a = aSeries[i];
  const aMed = medianOf(aSeries.slice(i - 23, i + 1));
  const { plusDI, minusDI, adx } = mt5Dmi(c30, 14);
  if (![eFast[i], eFast[i - 3], eSlow[i], adx[i], plusDI[i], minusDI[i]].every(Number.isFinite)
    || !(a > 0) || !(aMed > 0)) return null;

  const range = bar.high - bar.low;
  if (!(range > 0)) return null;
  const body = Math.abs(bar.close - bar.open);
  const closeLocation = (bar.close - bar.low) / range;
  const atrRatio = a / aMed;
  const volatilityOk = atrRatio >= SWING.MIN_ATR_RATIO
    && atrRatio <= SWING.MAX_ATR_RATIO && range <= a * SWING.MAX_CANDLE_ATR;
  if (!volatilityOk) return null;

  const regime = htfRegime(c8h, SWING.MIN_HTF_SEPARATION);
  const localBull = eFast[i] > eSlow[i] && eFast[i] > eFast[i - 3];
  const localBear = eFast[i] < eSlow[i] && eFast[i] < eFast[i - 3];

  // Tetik: sinyal barından ÖNCEKİ 4 barın ekstremi (MQL shift 2..5).
  const triggerHigh = highestHigh(c30, i - SWING.TRIGGER_LEN, i - 1);
  const triggerLow = lowestLow(c30, i - SWING.TRIGGER_LEN, i - 1);

  let direction = null;
  if (regime.bull && localBull
    && bar.close > triggerHigh && bar.close > bar.open
    && body >= a * SWING.MIN_BODY_ATR
    && closeLocation >= SWING.CLOSE_QUALITY
    && adx[i] >= SWING.ADX_MIN && plusDI[i] > minusDI[i]) direction = 'long';
  else if (regime.bear && localBear
    && bar.close < triggerLow && bar.close < bar.open
    && body >= a * SWING.MIN_BODY_ATR
    && closeLocation <= 1.0 - SWING.CLOSE_QUALITY
    && adx[i] >= SWING.ADX_MIN && minusDI[i] > plusDI[i]) direction = 'short';
  if (!direction) return null;

  // Stop: sinyal kapanışı ± 1.8×ATR (EA birebir; entry = sinyal kapanışı).
  return makeSignal(direction, bar.close, a * SWING.STOP_ATR,
    62 + Math.min(8, (adx[i] - SWING.ADX_MIN) / 2)
    + Math.min(6, (regime.sep - SWING.MIN_HTF_SEPARATION) * 8), bar.time);
}

/**
 * Ardışık-bar tekrar bastırması: önceki bar da aynı yönde tetiklediyse bu barın
 * sinyali ÜRETİLMEZ (EA'nın tek-pozisyon kuralının paper karşılığı — piramitleme
 * yok; önceki barın sinyali zaten önceki turda açıldı).
 *
 * ⚠️ Önceki bar değerlendirilirken ÜST-TF serisi de o barın anına KIRPILMALIDIR.
 * Kırpılmazsa i−1 barı, o an henüz geçerli olmayan (i barındaki) rejimle yeniden
 * değerlendirilir; rejim tam o barda döndüyse i−1 canlıda asla üretmeyeceği bir
 * sinyal üretmiş gibi görünüp GERÇEK sinyali bastırır. Hatanın yönü tek taraflı
 * ("geçerli sinyali sustur") ve tam da rejim dönüşünden sonraki İLK kurulumu,
 * yani stratejinin en değerli girişini vurur.
 */
function withTriggerDiscipline(fn, cSignal, cHtf, htfTfMs) {
  const sig = fn(cSignal, cHtf);
  if (!sig) return null;
  const prevSignal = cSignal.slice(0, -1);
  if (!prevSignal.length) return sig;
  const prevBarTime = prevSignal[prevSignal.length - 1].time;
  // i−1 barı değerlendirilirken yalnız O ANDA kapanmış üst-TF barları görünür.
  const prevHtf = htfTfMs > 0
    ? cHtf.filter((b) => b.time + htfTfMs <= prevBarTime)
    : cHtf;
  const prev = fn(prevSignal, prevHtf);
  if (prev && prev.direction === sig.direction) return null;
  return sig;
}

// forexKlines saniye cinsinden time verebilir → ms'e çevir (index.js ile aynı).
// high/low de DOĞRULANIR: motorların her kapısı (ATR, aralık, closeLocation,
// stop mesafesi) bunlara dayanır ve bozuk değerlerin hata modu SESSİZDİR —
// `low: undefined` ATR'yi kalıcı NaN yapıp motoru tamamen susturur, `high: null`
// ise aritmetikte 0'a çevrilip ATR'yi altın fiyatı kadar şişirir (ikisi de log'suz).
function toMs(raw) {
  return (raw || [])
    .filter((c) => c && Number.isFinite(c.open) && Number.isFinite(c.close)
      && Number.isFinite(c.high) && Number.isFinite(c.low))
    .map((c) => ({
      time: c.time < 1e12 ? c.time * 1000 : c.time,
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0,
    }));
}

/**
 * Aile snapshot'ı üretir (index.js generate ile aynı şekil): yalnız XAUUSD,
 * scalp (5m) + swing (30m) motorları. Değerlendirme YALNIZ kapalı barlarla
 * (closedBars — Yahoo'nun forming barı + kotasyon satırı tuzağı için bkz. orası).
 */
async function generate(preset, options = {}) {
  const inst = getInstrument(INSTRUMENT_ID);
  if (!inst) throw new Error('XAUUSD enstrümanı bulunamadı');
  const disabled = process.env.BK_XAU_DISABLED === '1';

  const [raw5, raw30, raw8h] = await Promise.all(
    ['5m', '30m', '8h'].map((tf) => forexKlines
      .fetchCandles(inst.yahoo, tf, FETCH_LIMIT)
      .catch(() => [])),
  );
  const all5 = toMs(raw5), all30 = toMs(raw30), all8h = toMs(raw8h);

  // Fiyat beslemesi (competition SL/TP işaretlemesi): EN TAZE tik — burada
  // forming/kotasyon satırı İSTENİR, çünkü amaç güncel fiyattır, sinyal değil.
  // ⚠️ GC=F COMEX akışı ~10 dk gecikmelidir (ölçüldü 2026-07-23: 10.0-10.2 dk).
  // FİYAT BESLEMESİ (competition SL/TP işaretlemesi).
  // 1) TERCİH: köprünün VPS'ten POST ettiği CANLI broker fiyatı. Yahoo GC=F
  //    (COMEX) akışı ~10 dk gecikmelidir (ölçüldü 2026-07-23: 10.0-10.2 dk) ve
  //    SL/TP'yi o gecikmeyle işlemek istatistikleri sistematik çarpıtır.
  // 2) YEDEK: en taze mum serisi — sabit 5m tercihi DEĞİL, çünkü fetchCandles
  //    hata yolunda bayat cache'i tazelemeden döndürebilir (dizi boş değil
  //    DONMUŞ olur) ve fiyat donarsa açık pozisyonlar sessizce asılı kalır.
  const prices = {};
  const broker = brokerPrices.get(INSTRUMENT_ID);
  if (broker && broker.mid > 0) {
    prices[INSTRUMENT_ID] = broker.mid;
  } else {
    const freshest = [all5, all30, all8h]
      .filter((a) => a.length)
      .sort((a, b) => b[b.length - 1].time - a[a.length - 1].time)[0];
    if (freshest) prices[INSTRUMENT_ID] = freshest[freshest.length - 1].close;
  }

  const c5 = closedBars(all5, TF_MS['5m']);
  const c30 = closedBars(all30, TF_MS['30m']);
  const c8h = closedBars(all8h, TF_MS['8h']);

  const signals = [];
  if (!disabled) {
    const found = [
      { tf: '5m', label: 'Scalp', strategy: 'bk-xau-scalp', sig: withTriggerDiscipline(evalScalp, c5, c30, TF_MS['30m']) },
      { tf: '30m', label: 'Swing', strategy: 'bk-xau-swing', sig: withTriggerDiscipline(evalSwing, c30, c8h, TF_MS['8h']) },
    ];
    for (const { tf, label, strategy, sig } of found) {
      if (!sig) continue;
      signals.push({
        // Stabil kimlik → competition mum başına TEK pozisyon açar.
        signalId: `${INSTRUMENT_ID}:${preset.id}:${tf}:${sig.time}`,
        instrumentId: INSTRUMENT_ID,
        symbol: INSTRUMENT_ID,
        yahoo: inst.yahoo,
        strategy,
        strategyName: `${preset.name} · ${label}`,
        tf,
        timeframe: tf,
        direction: sig.direction,
        entry: sig.entry,
        stop: sig.stop,
        target1: sig.target1,
        target2: sig.target2,
        confidence: sig.confidence,
        candleDate: new Date(sig.time).toISOString(),
        generatedAt: new Date(options.nowMs || Date.now()).toISOString(),
      });
    }
  }

  return {
    engine: preset.id,
    botName: preset.name,
    generatedAt: new Date(options.nowMs || Date.now()).toISOString(),
    summary: {
      signals: signals.length,
      long: signals.filter((s) => s.direction === 'long').length,
      short: signals.filter((s) => s.direction === 'short').length,
    },
    prices,
    signals,
  };
}

module.exports = {
  generate,
  // test için içler:
  evalScalp, evalSwing, withTriggerDiscipline, htfRegime, closedBars,
  mt5Atr, mt5Dmi,
  nyParts, isNyDstUtc, inMinuteWindow, isFridayRiskCut, medianOf,
  SCALP, SWING, TF_MS,
};
