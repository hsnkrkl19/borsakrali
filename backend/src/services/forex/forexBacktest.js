/**
 * forexBacktest — Forex MTF sinyalleri için GEÇMİŞ BAŞARI (backtest) + KALİBRASYON.
 *
 * Her (enstrüman, TF) için geçmiş mumlarda motorun ürettiği yönlü sinyalleri
 * toplar; güven bandına (high/mid/low) göre kazanma oranı + örneklem + ortalama
 * getiri + **EXPECTANCY + PROFIT FACTOR** biriktirir. Bu istatistikleri
 * backtesting.py SIDECAR'ı (kernc/backtesting.py) üretir; sidecar yoksa/çökerse
 * birebir aynı semantikli JS hesabına (evalForward) düşer (üretim ölmez).
 *
 * Ağır iştir → günde 1 kez (cron) çalışır, diske yazılır; canlı motor sonucu
 * okuyup her sinyale historicalWinRate/sampleSize/profitFactor ekler ve
 * forexAggregator.calibrateConfidence ile güveni SINIRLI delta'yla düzeltir.
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
const sidecar = require('../backtest/sidecarClient');
const logger = require('../../utils/logger');

const STORE_FILE = path.join(__dirname, '..', '..', 'data', 'forex-backtest.json');
const TFS = ['15m', '1h', '4h', '1d']; // 5m KALDIRILDI (forex 15dk+ tarar)
const HORIZON = { '5m': 24, '15m': 16, '1h': 12, '4h': 10, '1d': 8 }; // ileri bar
const MIN_CONFIDENCE = 40;
const LOOKBACK_BARS = 120;     // kaç geçmiş bardan sinyal denesin
const MIN_HISTORY = 260;       // ema200 + lookback + horizon için

let store = null;              // { 'id:tf': {high,mid,low,all}, ... , generatedAt }

function assetTypeFor(cls) { return cls === 'crypto' ? 'crypto' : cls === 'metal' ? 'commodity' : 'stock'; }
function blank() { return { win: 0, loss: 0, open: 0, sumRet: 0, grossWin: 0, grossLoss: 0 }; }

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

// İleri sar: TP1 mi SL mi önce? (aynı barda ikisi de → tutucu: SL) — sidecar yoksa.
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
  const total = b.win + b.loss + b.open;
  let pf = null;
  if (b.grossLoss > 0) pf = +(b.grossWin / b.grossLoss).toFixed(3);
  else if (b.grossWin > 0 && b.loss === 0) pf = 999;   // gerçekten kayıpsız (sidecar parity)
  return {
    winRate: closed > 0 ? +(b.win / closed * 100).toFixed(1) : null,
    sampleSize: closed,
    open: b.open,
    avgReturn: total > 0 ? +(b.sumRet / total).toFixed(2) : null,
    expectancy: closed > 0 ? +((b.grossWin - b.grossLoss) / closed).toFixed(3) : null,
    profitFactor: pf,
  };
}

function bandOf(conf) { return conf >= 70 ? 'high' : conf >= 50 ? 'mid' : 'low'; }

// Bir (enstrüman, TF) için geçmiş sinyalleri ÜRET (Node stratejileriyle) — sidecar'a
// gönderilecek ham seri. Heavy: bar başına 5 teknik koşar.
async function buildSignals(inst, tf, candles, opts = {}) {
  const horizon = HORIZON[tf] || 12;
  const assetType = assetTypeFor(inst.class);
  const lookback = opts.lookback || LOOKBACK_BARS;
  const endOffset = opts.endOffset || 0;
  const end = candles.length - horizon - endOffset;
  const start = Math.max(220, end - lookback);
  const signals = [];
  if (end <= start) return { signals, horizon };
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
    const lv = buildLevels(agg.direction, hist[i].close, a, tf, inst.precision, hist); // canlıyla tutarlı: fib
    if (!lv) continue;
    // agg.trendStrength kullan (canlıyla birebir): ham adx/40 hem 1'i aşabiliyordu
    // hem de YÖN-KÖRDÜ — canlı motor artık DI-uyumsuz trendi 0'lıyor; kalibrasyonun
    // canlının üretmediği ters-yön sinyal popülasyonuyla beslenmemesi için hizalandı
    // (2026-07-06 review). Not: 4h+1d rejim vetosu backtest'te YOK (tek-TF bağlam) —
    // kalibrasyon bu yüzden bir miktar muhafazakâr kalır.
    const conf = computeConfidence({ consensus: agg.consensus, avgScore: agg.avgScore, trendStrength: agg.trendStrength, momentum: agg.momentum, rr1: Math.max(lv.rr1 || 1, 1.6), confluence: 0 });
    if (conf < MIN_CONFIDENCE) continue;
    signals.push({ index: i, direction: agg.direction, entry: hist[i].close, stop: lv.stop, target: lv.target1, band: bandOf(conf), atr: a });
  }
  return { signals, horizon };
}

// JS fallback: sinyalleri yerelde ileri-sar, bantlara böl, özetle.
function summarizeLocally(candles, signals, horizon) {
  const buckets = { high: blank(), mid: blank(), low: blank(), all: blank() };
  for (const s of signals) {
    const fwd = candles.slice(s.index + 1, s.index + 1 + horizon);
    const { res, ret } = evalForward(s.direction, { entry: s.entry, stop: s.stop, target1: s.target }, fwd);
    for (const key of [s.band, 'all']) {
      const b = buckets[key]; if (!b) continue;
      b[res]++; b.sumRet += ret;
      if (res === 'win') b.grossWin += ret; else if (res === 'loss') b.grossLoss += Math.abs(ret);
    }
  }
  return { high: summarize(buckets.high), mid: summarize(buckets.mid), low: summarize(buckets.low), all: summarize(buckets.all) };
}

// Sidecar perBand → bizim {high,mid,low,all} kayıt biçimine eşle.
function mapPerBand(perBand) {
  const pick = (b) => {
    const x = perBand[b] || {};
    return {
      winRate: x.winRate ?? null, sampleSize: x.sampleSize || 0, open: x.open || 0,
      avgReturn: x.avgReturn ?? null, expectancy: x.expectancy ?? null, profitFactor: x.profitFactor ?? null,
    };
  };
  return { high: pick('high'), mid: pick('mid'), low: pick('low'), all: pick('all') };
}

async function backtestTF(inst, tf, opts = {}) {
  const candles = await forexKlines.fetchCandles(inst.yahoo, tf, 900);
  if (!candles || candles.length < MIN_HISTORY) return null;
  const { signals, horizon } = await buildSignals(inst, tf, candles, opts);
  if (!signals.length) {
    const empty = summarize(blank());
    return { high: empty, mid: empty, low: empty, all: empty };
  }
  // 1) backtesting.py sidecar (varsa) — zengin perBand (PF/expectancy dahil)
  if (sidecar.available()) {
    const res = await sidecar.backtest({ symbol: inst.id, timeframe: tf, ohlcv: candles, signals, config: { horizon } });
    if (res && res.ok && res.perBand) {
      const mapped = mapPerBand(res.perBand);
      if (res.tearsheet) mapped.tearsheet = res.tearsheet;   // UI için sakla
      return mapped;
    }
  }
  // 2) JS fallback (birebir aynı semantik)
  return summarizeLocally(candles, signals, horizon);
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
    } catch (e) { logger.warn(`forexBacktest ${inst.id}:${tf} hata: ${e.message}`); }
  }
  store.generatedAt = new Date().toISOString();
  store.engine = sidecar.available() ? 'backtesting.py' : 'js';
  persist();
  return { done, total: subset.length, engine: store.engine, generatedAt: store.generatedAt };
}

// Canlı motorun her sinyale eklemesi için — güven bandına göre geçmiş başarı.
function getHistory(id, tf, confidence) {
  const s = loadStore();
  const rec = s[`${id}:${tf}`];
  if (!rec) return null;
  const band = bandOf(confidence);
  const b = rec[band];
  // Banda yeterli örnek yoksa 'all'a düş
  if (!b || b.sampleSize < 8) {
    const all = rec.all;
    if (all && all.sampleSize >= 8) return { winRate: all.winRate, sampleSize: all.sampleSize, avgReturn: all.avgReturn, expectancy: all.expectancy, profitFactor: all.profitFactor, band: 'all' };
    return b && b.sampleSize > 0 ? { ...b, band } : null;
  }
  return { winRate: b.winRate, sampleSize: b.sampleSize, avgReturn: b.avgReturn, expectancy: b.expectancy, profitFactor: b.profitFactor, band };
}

function getStore() { return loadStore(); }

module.exports = { runAll, backtestTF, buildSignals, summarizeLocally, getHistory, getStore, TFS };
