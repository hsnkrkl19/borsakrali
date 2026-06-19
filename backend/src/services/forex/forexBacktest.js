/**
 * forexBacktest — Forex MTF sinyalleri için GEÇMİŞ BAŞARI ORANI (backtest).
 *
 * "Sinyaller komuta merkezi"ndeki backtest-tabanlı başarı etiketinin forex
 * karşılığı. Her (enstrüman, TF) için geçmiş mumlarda motorun ürettiği yönlü
 * sinyalleri ileri sararak TP1 mi yoksa SL mi önce vurmuş bakar; güven bandına
 * (high/mid/low) göre kazanma oranı + örneklem + ortalama getiri biriktirir.
 *
 * Ağır iştir → günde 1 kez (cron) çalışır, diske yazılır; canlı motor sonucu
 * okuyup her sinyale historicalWinRate/sampleSize/confidenceBand ekler.
 */

const fs = require('fs');
const path = require('path');
const forexKlines = require('./forexKlines');
const { atr } = require('./indicators');
const genel = require('./strategies/genelTarama');
const ema34 = require('./strategies/ema34');
const tema34 = require('./strategies/tema34');
const snrStrat = require('./strategies/snr');
const smcStrat = require('./strategies/smc');
const { aggregate, computeConfidence } = require('./forexAggregator');
const { buildLevels } = require('./forexLevels');
const { INSTRUMENTS } = require('./forexInstruments');

const STORE_FILE = path.join(__dirname, '..', '..', 'data', 'forex-backtest.json');
const TFS = ['5m', '15m', '1h', '4h', '1d'];
const HORIZON = { '5m': 24, '15m': 16, '1h': 12, '4h': 10, '1d': 8 }; // ileri bar
const MIN_CONFIDENCE = 40;
const LOOKBACK_BARS = 120;     // kaç geçmiş bardan sinyal denesin
const MIN_HISTORY = 260;       // ema200 + lookback + horizon için

let store = null;              // { 'id:tf': {high,mid,low,all}, ... , generatedAt }

function assetTypeFor(cls) { return cls === 'crypto' ? 'crypto' : cls === 'metal' ? 'commodity' : 'stock'; }
function blank() { return { win: 0, loss: 0, open: 0, sumRet: 0 }; }

function loadStore() {
  if (store) return store;
  try { if (fs.existsSync(STORE_FILE)) store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch (_) {}
  return store || {};
}
function persist() {
  try {
    const dir = path.dirname(STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) { /* sessiz */ }
}

// İleri sar: TP1 mi SL mi önce? (aynı barda ikisi de → tutucu: SL)
function evalForward(direction, lv, fwd) {
  const isLong = direction === 'long';
  for (const c of fwd) {
    const slHit = isLong ? c.low <= lv.stop : c.high >= lv.stop;
    const tpHit = isLong ? c.high >= lv.target1 : c.low <= lv.target1;
    if (slHit) { const r = isLong ? (lv.stop - lv.entry) : (lv.entry - lv.stop); return { res: 'loss', ret: r / lv.entry * 100 }; }
    if (tpHit) { const r = isLong ? (lv.target1 - lv.entry) : (lv.entry - lv.target1); return { res: 'win', ret: r / lv.entry * 100 }; }
  }
  const last = fwd[fwd.length - 1];
  const r = last ? (isLong ? (last.close - lv.entry) : (lv.entry - last.close)) : 0;
  return { res: 'open', ret: r / lv.entry * 100 };
}

function summarize(b) {
  const closed = b.win + b.loss;
  return {
    winRate: closed > 0 ? +(b.win / closed * 100).toFixed(1) : null,
    sampleSize: closed,
    open: b.open,
    avgReturn: (b.win + b.loss + b.open) > 0 ? +(b.sumRet / (b.win + b.loss + b.open)).toFixed(2) : null,
  };
}

// opts.lookback = pencere uzunluğu (bar), opts.endOffset = pencereyi kaç bar
// geriye kaydır (farklı zaman aralıkları test etmek için).
async function backtestTF(inst, tf, opts = {}) {
  const horizon = HORIZON[tf] || 12;
  const candles = await forexKlines.fetchCandles(inst.yahoo, tf, 900);
  if (!candles || candles.length < MIN_HISTORY) return null;
  const assetType = assetTypeFor(inst.class);
  const buckets = { high: blank(), mid: blank(), low: blank(), all: blank() };

  const lookback = opts.lookback || LOOKBACK_BARS;
  const endOffset = opts.endOffset || 0;
  const end = candles.length - horizon - endOffset;
  const start = Math.max(220, end - lookback);
  if (end <= start) return { high: summarize(blank()), mid: summarize(blank()), low: summarize(blank()), all: summarize(blank()) };
  for (let i = start; i < end; i++) {
    const hist = candles.slice(0, i + 1);
    const [snrR, smcR] = await Promise.all([
      snrStrat.evaluate(hist, inst.id, `${tf}#bt${i}`, assetType),
      smcStrat.evaluate(hist, inst.id, `${tf}#bt${i}`, assetType),
    ]);
    const gen = genel.evaluate(hist), e = ema34.evaluate(hist), t = tema34.evaluate(hist);
    const agg = aggregate([gen, e, t, snrR, smcR], gen?.ind);
    if (agg.direction === 'neutral') continue;
    const a = atr(hist, 14);
    const lv = buildLevels(agg.direction, hist[i].close, a, tf, inst.precision, hist); // canlıyla tutarlı: fib seviyeleri
    if (!lv) continue;
    const conf = computeConfidence({ consensus: agg.consensus, avgScore: agg.avgScore, trendStrength: (gen?.ind?.adx || 0) / 40, momentum: agg.momentum, rr1: Math.max(lv.rr1 || 1, 1.6), confluence: 0 });
    if (conf < MIN_CONFIDENCE) continue;
    const { res, ret } = evalForward(agg.direction, lv, candles.slice(i + 1, i + 1 + horizon));
    const band = conf >= 70 ? 'high' : conf >= 50 ? 'mid' : 'low';
    for (const key of [band, 'all']) {
      buckets[key][res]++; buckets[key].sumRet += ret;
    }
  }
  return { high: summarize(buckets.high), mid: summarize(buckets.mid), low: summarize(buckets.low), all: summarize(buckets.all) };
}

// Tüm evren — günde 1 kez. opts.only = [{id,tf}] ile alt küme (test).
async function runAll(opts = {}) {
  loadStore();
  store = store || {};
  const pairs = [];
  for (const inst of INSTRUMENTS) for (const tf of TFS) pairs.push({ inst, tf });
  const subset = opts.only ? pairs.filter(p => opts.only.some(o => o.id === p.inst.id && o.tf === p.tf)) : pairs;
  let done = 0;
  for (const { inst, tf } of subset) {
    try {
      const r = await backtestTF(inst, tf);
      if (r) { store[`${inst.id}:${tf}`] = r; done++; }
    } catch (_) {}
  }
  store.generatedAt = new Date().toISOString();
  persist();
  return { done, total: subset.length, generatedAt: store.generatedAt };
}

// Canlı motorun her sinyale eklemesi için — güven bandına göre geçmiş başarı.
function getHistory(id, tf, confidence) {
  const s = loadStore();
  const rec = s[`${id}:${tf}`];
  if (!rec) return null;
  const band = confidence >= 70 ? 'high' : confidence >= 50 ? 'mid' : 'low';
  const b = rec[band];
  // Banda yeterli örnek yoksa 'all'a düş
  if (!b || b.sampleSize < 8) {
    const all = rec.all;
    if (all && all.sampleSize >= 8) return { winRate: all.winRate, sampleSize: all.sampleSize, avgReturn: all.avgReturn, band: 'all' };
    return b && b.sampleSize > 0 ? { ...b, band } : null;
  }
  return { winRate: b.winRate, sampleSize: b.sampleSize, avgReturn: b.avgReturn, band };
}

module.exports = { runAll, backtestTF, getHistory, TFS };
