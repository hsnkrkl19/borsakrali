/**
 * waveScanEngine — BTC + Altın için BAĞIMSIZ "Elliott + SNR + Mum + Fraktal"
 * konfluans taraması (1d ve 4h). Diğer forex sinyallerinden AYRIDIR; nadir,
 * yüksek-kaliteli, açıklayıcı notlarla gelir. Normal sinyal sayısına dahil DEĞİL.
 *
 * Bir sinyal yalnız ŞU ÜÇÜ DE aynı anda hizalanınca üretilir (→ nadir):
 *   1) Elliott: Dalga 2 veya 4 bitişi (forexFib fraktal zigzag, kurallı).
 *   2) SNR    : düzeltme pivotu güçlü destek/direnç bölgesinde (snrService).
 *   3) Mum    : son barlarda teyit eden formasyon (yutan/çekiç/harami).
 * Hepsi notlarda gerekçesiyle belirtilir.
 */

const forexKlines = require('../forex/forexKlines');
const { atr, ema } = require('../forex/indicators');
const { getInstrument } = require('../forex/forexInstruments');
const snrService = require('../snrService');
const patterns = require('../mtfPatternDetection');
const elliott = require('./elliott');

const PAIRS = ['BTCUSD', 'XAUUSD'];
const TFS = ['1d', '4h'];
const STOP_BUF_ATR = 0.25;     // stop tamponu (ATR oranı)
const MIN_RR1 = 1.2;           // düşük R/R kurulumları ele (kalite)
const CANDLE_LOOKBACK = 3;     // teyit mumunu son N barda ara

function assetTypeFor(cls) { return cls === 'crypto' ? 'crypto' : cls === 'metal' ? 'commodity' : 'stock'; }

// Ana trend hizası — Elliott impuls kurulumları YALNIZ ana trend yönünde alınır
// (karşı-trend "yakalama" sinyallerini eler). EMA100; yetersiz veri → filtre yok.
function trendOk(candles, direction) {
  const closes = candles.map(c => c.close);
  const e = ema(closes, 100);
  if (e == null) return true;
  const px = closes[closes.length - 1];
  return direction === 'long' ? px >= e : px <= e;
}

// Son CANDLE_LOOKBACK barda yöne uygun teyit mumu var mı? → {pattern,strength}|null
function candleConfirm(candles, direction) {
  for (let k = 0; k < CANDLE_LOOKBACK; k++) {
    const sub = k === 0 ? candles : candles.slice(0, -k);
    if (sub.length < 2) continue;
    const eng = patterns.detectEngulfing(sub);
    const pin = patterns.detectPinBar(sub);
    const har = patterns.detectHarami(sub);
    if (direction === 'long') {
      if (eng && eng.type === 'bullish_engulfing') return { pattern: 'Boğa yutan', strength: eng.strength, barsAgo: k };
      if (pin && pin.type === 'hammer') return { pattern: 'Çekiç', strength: pin.wickRatio, barsAgo: k };
      if (har && har.type === 'bullish_harami') return { pattern: 'Boğa harami', strength: 1, barsAgo: k };
    } else {
      if (eng && eng.type === 'bearish_engulfing') return { pattern: 'Ayı yutan', strength: eng.strength, barsAgo: k };
      if (pin && pin.type === 'shooting_star') return { pattern: 'Kayan yıldız', strength: pin.wickRatio, barsAgo: k };
      if (har && har.type === 'bearish_harami') return { pattern: 'Ayı harami', strength: 1, barsAgo: k };
    }
  }
  return null;
}

// SNR teyidi: yöne uygun bölge (long→destek, short→direnç) fiyata yakın mı?
function snrConfirm(snr, direction) {
  const want = direction === 'long' ? 'support' : 'resistance';
  const sig = (snr.signals || []).filter(s => s.type === want).sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  if (!sig) return null;
  const dist = sig.priceDistancePct != null ? Math.abs(sig.priceDistancePct) : null;
  if (dist != null && dist > 3.5) return null;       // fiyat bölgeden uzak → teyit yok
  return { grade: sig.grade, score: sig.score, distancePct: sig.priceDistancePct, level: sig.entry ?? null, zoneStop: sig.stop ?? null };
}

function buildLevels(direction, entry, setup, atrVal, precision, snrZoneStop) {
  const buf = STOP_BUF_ATR * atrVal;
  const isLong = direction === 'long';
  let stop = isLong ? setup.correctivePrice - buf : setup.correctivePrice + buf;
  if (snrZoneStop != null && snrZoneStop > 0) stop = isLong ? Math.min(stop, snrZoneStop - buf) : Math.max(stop, snrZoneStop + buf);
  const R = Math.abs(entry - stop);
  if (!(R > 0)) return null;
  let t1 = setup.prior, t2 = setup.proj;
  if (isLong) { if (!(t1 > entry)) t1 = entry + 1.5 * R; if (!(t2 > t1)) t2 = t1 + R; }
  else { if (!(t1 < entry)) t1 = entry - 1.5 * R; if (!(t2 < t1)) t2 = t1 - R; }
  const r = (v) => +v.toFixed(precision);
  return {
    entry: r(entry), stop: r(stop), target1: r(t1), target2: r(t2),
    rr1: +(Math.abs(t1 - entry) / R).toFixed(2), rr2: +(Math.abs(t2 - entry) / R).toFixed(2),
    atr: +atrVal.toFixed(precision),
  };
}

function scoreOf(snrC, candleC, setup) {
  let s = 55;
  if (snrC) s += Math.min(20, (snrC.score || 0) / 5);
  if (candleC) s += Math.min(12, (candleC.strength || 1) * 5);
  if (setup.kind === 'W2W3') s += 8;          // Dalga 3 girişi en güçlü
  if (setup.retr >= 0.5 && setup.retr <= 0.786) s += 5; // ideal düzeltme
  return Math.max(0, Math.min(100, Math.round(s)));
}

// Tek (parite, TF) — kurulum varsa sinyal nesnesi, yoksa null
async function analyzePair(id, tf) {
  const inst = getInstrument(id);
  if (!inst) return null;
  const candles = await forexKlines.fetchCandles(inst.yahoo, tf, 400);
  if (!candles || candles.length < 80) return null;
  const atrVal = atr(candles, 14);
  if (!(atrVal > 0)) return null;

  const setup = elliott.detectSetup(candles, atrVal);
  if (!setup) return null;
  const direction = setup.direction;
  if (!trendOk(candles, direction)) return null;     // ana trend hizası şart

  const snr = await snrService.analyzeSNR(`${id}#wave#${tf}`, candles, { assetType: assetTypeFor(inst.class) });
  const snrC = snrConfirm(snr, direction);
  if (!snrC) return null;                       // SNR teyidi şart (nadir)

  const candleC = candleConfirm(candles, direction);
  if (!candleC) return null;                     // mum teyidi şart (nadir)

  const entry = candles[candles.length - 1].close;
  const lv = buildLevels(direction, entry, setup, atrVal, inst.precision, snrC.zoneStop);
  if (!lv || lv.rr1 < MIN_RR1) return null;      // kalite kapısı

  const score = scoreOf(snrC, candleC, setup);
  const notes = [
    setup.note,
    `SNR: ${direction === 'long' ? 'Destek' : 'Direnç'} bölgesi (${snrC.grade || '-'}, skor ${Math.round(snrC.score || 0)})${snrC.distancePct != null ? `, fiyat ${Math.abs(snrC.distancePct).toFixed(1)}% mesafede` : ''}`,
    `Mum: ${candleC.pattern}${candleC.barsAgo ? ` (${candleC.barsAgo} bar önce)` : ''}`,
    `Fraktal: onaylı ${direction === 'long' ? 'dip' : 'tepe'} @ ${setup.correctivePrice}`,
  ];

  return {
    id, symbol: inst.symbol, name: inst.name, tf, direction,
    wave: setup.kind, waveLabel: setup.label,
    ...lv, score,
    mt5Symbol: (inst.id), tvSymbol: inst.tvSymbol, precision: inst.precision,
    elliott: { kind: setup.kind, retr: setup.retr, w1: setup.w1, proj: setup.proj },
    snr: snrC, candle: candleC, notes,
    correctiveTime: setup.correctiveTime, correctiveIdx: setup.correctiveIdx,
    generatedAt: new Date().toISOString(),
  };
}

// Tüm evren (BTC+XAU × 1d+4h) — kurulum bulunanların listesi
async function scan() {
  const out = [];
  for (const id of PAIRS) {
    for (const tf of TFS) {
      try { const s = await analyzePair(id, tf); if (s) out.push(s); } catch (_) { /* sessiz */ }
    }
  }
  return out;
}

module.exports = { scan, analyzePair, candleConfirm, snrConfirm, buildLevels, trendOk, PAIRS, TFS };
