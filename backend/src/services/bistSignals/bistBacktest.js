/**
 * bistBacktest — BIST ≥75 LONG sinyalleri için GLOBAL kalibrasyon geçmişi.
 *
 * BIST'te tek sembolde yeterli örnek yok (1y günlük ≈ az sinyal) → kalibrasyon
 * GLOBAL: temsili bir evren (vars. 60 sembol) geçmiş mumlarda taranır, üretilen
 * LONG sinyaller backtesting.py SIDECAR'ında ileri-sarılır, sonuçlar İNCE güven
 * kovalarına (b50,b55,...,b95) GLOBAL toplanır. Böylece kalibrasyon ayrımcı olur:
 * tarihsel KÖTÜ kova aşağı (bazıları eşik-altı kalır), İYİ kova yukarı (alt-eşik
 * sinyaller terfi eder) — tek-tip çöküş yok. Sidecar yoksa JS'e düşer.
 *
 * forex ile aynı kalibrasyon matematiği (forexAggregator.calibrateConfidence) —
 * PF/expectancy temelli, SINIRLI delta. Ağır iş → günde 1 kez (cron).
 */

const fs = require('fs');
const path = require('path');
const liveDataService = require('../liveDataService');
const { allBistStocks } = require('../../data/allBistStocks');
const genel = require('../forex/strategies/genelTarama');
const ema34 = require('../forex/strategies/ema34');
const tema34 = require('../forex/strategies/tema34');
const snrStrat = require('../forex/strategies/snr');
const smcStrat = require('../forex/strategies/smc');
const { aggregate, computeConfidence, CAL } = require('../forex/forexAggregator');
const levelsLib = require('../forex/forexLevels');
const { atr } = require('../forex/indicators');
const sidecar = require('../backtest/sidecarClient');

// Yahoo historical satırlarını forex mum formatına çevir (bistScoreEngine ile aynı;
// burada inline → bistScoreEngine ↔ bistBacktest döngüsel require'ı kırılır).
function toCandles(hist) {
  return (hist || [])
    .filter(r => r && r.close != null && r.high != null && r.low != null && r.open != null)
    .map(r => ({
      time: Math.floor((r.timestamp || new Date(r.date).getTime()) / 1000),
      open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume || 0,
    }));
}

function envNum(name, def) { const v = Number(process.env[name]); return Number.isFinite(v) ? v : def; }
const STORE_FILE = process.env.BIST_BACKTEST_FILE || path.join(__dirname, '..', '..', 'data', 'bist-signals-backtest.json');
const UNIVERSE_LIMIT = envNum('BIST_BACKTEST_LIMIT', 60);   // temsili örneklem (maliyet sınırı)
const HORIZON = envNum('BIST_BACKTEST_HORIZON', 10);         // ileri bar (gün)
const LOOKBACK = envNum('BIST_BACKTEST_LOOKBACK', 120);
const MIN_HISTORY = 160;
const MIN_CONF = 50;            // eşik-altı veri de toplansın (terfi için)
const PRECISION = 2;
const BATCH_SIZE = 5;
const BATCH_PAUSE_MS = 250;

let store = null;              // { generatedAt, engine, scanned, buckets:{ bNN:{win,loss,open,grossWin,grossLoss} } }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function bucketOf(conf) { return 'b' + (Math.floor(conf / 5) * 5); }
function blank() { return { win: 0, loss: 0, open: 0, grossWin: 0, grossLoss: 0 }; }

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
  } catch (_) {}
}

// Tek sembol: geçmiş LONG sinyallerini ÜRET (canlı bistScoreEngine ile aynı stack).
async function buildSymbolSignals(symbol, candles) {
  const end = candles.length - HORIZON;
  const start = Math.max(120, end - LOOKBACK);
  const signals = [];
  if (end <= start) return signals;
  for (let i = start; i < end; i++) {
    const hist = candles.slice(0, i + 1);
    if (hist.length < 100) continue;
    const [snrR, smcR] = await Promise.all([
      snrStrat.evaluate(hist, symbol, `1d#bt${i}`, 'stock'),
      smcStrat.evaluate(hist, symbol, `1d#bt${i}`, 'stock'),
    ]);
    const gen = genel.evaluate(hist), e = ema34.evaluate(hist), t = tema34.evaluate(hist);
    const agg = aggregate([gen, e, t, snrR, smcR], gen?.ind);
    if (agg.direction !== 'long') continue;          // BIST: sadece long
    const a = atr(hist, 14);
    const entry = hist[i].close;
    const lv = levelsLib.buildLevels('long', entry, a, '1d', PRECISION);
    if (!lv) continue;
    const conf = computeConfidence({ consensus: agg.consensus, avgScore: agg.avgScore, trendStrength: agg.trendStrength, momentum: agg.momentum, rr1: lv.rr1, confluence: 0 });
    if (conf < MIN_CONF) continue;
    signals.push({ index: i, direction: 'long', entry, stop: lv.stop, target: lv.target1, band: bucketOf(conf), atr: a });
  }
  return signals;
}

// JS fallback: long sinyali ileri-sar (SL önce → tutucu).
function evalForwardLong(s, candles) {
  const fwd = candles.slice(s.index + 1, s.index + 1 + HORIZON);
  for (const c of fwd) {
    if (c.low <= s.stop) return { res: 'loss', ret: (s.stop - s.entry) / s.entry * 100 };
    if (c.high >= s.target) return { res: 'win', ret: (s.target - s.entry) / s.entry * 100 };
  }
  const last = fwd[fwd.length - 1];
  return { res: 'open', ret: last ? (last.close - s.entry) / s.entry * 100 : 0 };
}

function addOutcome(buckets, band, res, ret) {
  const b = buckets[band] || (buckets[band] = blank());
  b[res]++;
  if (res === 'win') b.grossWin += ret; else if (res === 'loss') b.grossLoss += Math.abs(ret);
}

// Sidecar perBand (ince kovalar dahil) → global buckets'a EKLE (ham sayılarla birleştir).
function mergeSidecarPerBand(buckets, perBand) {
  for (const [band, x] of Object.entries(perBand || {})) {
    if (band === 'all' || band === 'high' || band === 'mid' || band === 'low') continue; // yalnız ince kovalar
    const b = buckets[band] || (buckets[band] = blank());
    b.win += x.win || 0; b.loss += x.loss || 0; b.open += x.open || 0;
    b.grossWin += x.grossWin || 0; b.grossLoss += x.grossLoss || 0;
  }
}

async function runAll(opts = {}) {
  loadStore();
  const universe = (opts.universe || allBistStocks).slice(0, opts.limit || UNIVERSE_LIMIT);
  const buckets = {};
  let scanned = 0;
  const useSidecar = sidecar.available();
  const pending = [];   // sidecar batch payload biriktir

  async function flushBatch() {
    if (!pending.length) return;
    const items = pending.splice(0, pending.length);
    const payloads = items.map(({ _candles, ...rest }) => rest);   // candles'ı bir kez yolla
    const res = await sidecar.batch(payloads);
    if (res && res.results) {
      for (const r of res.results) if (r && r.ok && r.perBand) mergeSidecarPerBand(buckets, r.perBand);
    } else {
      // batch çöktü → bu partiyi JS ile kurtar (birebir aynı semantik)
      for (const it of items) for (const s of it.signals) {
        const { res: outc, ret } = evalForwardLong(s, it._candles || []);
        addOutcome(buckets, s.band, outc, ret);
      }
    }
  }

  for (let i = 0; i < universe.length; i += BATCH_SIZE) {
    const batch = universe.slice(i, i + BATCH_SIZE);
    const built = await Promise.all(batch.map(async (stock) => {
      const symbol = (stock.symbol || stock).replace('.IS', '');
      try {
        const hist = await liveDataService.fetchHistoricalData(symbol, '1y', '1d');
        const candles = toCandles(hist);
        if (candles.length < MIN_HISTORY) return null;
        const signals = await buildSymbolSignals(symbol, candles);
        if (!signals.length) return null;
        return { symbol, candles, signals };
      } catch (_) { return null; }
    }));

    for (const b of built) {
      if (!b) continue;
      scanned++;
      if (useSidecar) {
        pending.push({ symbol: b.symbol, timeframe: '1d', ohlcv: b.candles, signals: b.signals, config: { horizon: HORIZON }, _candles: b.candles });
      } else {
        for (const s of b.signals) {
          const { res, ret } = evalForwardLong(s, b.candles);
          addOutcome(buckets, s.band, res, ret);
        }
      }
    }
    if (useSidecar && pending.length >= BATCH_SIZE * 2) await flushBatch();
    if (i + BATCH_SIZE < universe.length) await sleep(BATCH_PAUSE_MS);
  }
  if (useSidecar) await flushBatch();

  store = { generatedAt: new Date().toISOString(), engine: useSidecar ? 'backtesting.py' : 'js', scanned, buckets };
  persist();
  const totalClosed = Object.values(buckets).reduce((s, b) => s + b.win + b.loss, 0);
  return { scanned, buckets: Object.keys(buckets).length, closedSignals: totalClosed, engine: store.engine, generatedAt: store.generatedAt };
}

// Bir kova listesini birleştir → kalibrasyon geçmişi {winRate, sampleSize, expectancy, profitFactor}.
function mergeBuckets(list) {
  const m = blank();
  for (const b of list) { if (!b) continue; m.win += b.win; m.loss += b.loss; m.open += b.open; m.grossWin += b.grossWin; m.grossLoss += b.grossLoss; }
  const closed = m.win + m.loss;
  if (closed === 0) return null;
  let pf = null;
  if (m.grossLoss > 0) pf = +(m.grossWin / m.grossLoss).toFixed(3);
  else if (m.grossWin > 0 && m.loss === 0) pf = 999;   // gerçekten kayıpsız (sidecar parity)
  return {
    winRate: +(m.win / closed * 100).toFixed(1),
    sampleSize: closed,
    expectancy: +((m.grossWin - m.grossLoss) / closed).toFixed(3),
    profitFactor: pf,
    avgReturn: null,
  };
}

// Canlı bistScoreEngine'in çağırdığı: güven → kalibrasyon geçmişi (ince kova →
// komşu → ≥70 → all fallback). Yeterli örnek yoksa null (kalibrasyon NO-OP).
function getHistory(confidence) {
  const s = loadStore();
  const buckets = s.buckets;
  if (!buckets) return null;
  const MIN = CAL.MIN_SAMPLE;
  const base = Math.floor(confidence / 5) * 5;
  // 1) tam kova
  let h = mergeBuckets([buckets['b' + base]]);
  if (h && h.sampleSize >= MIN) return { ...h, bucket: 'b' + base };
  // 2) komşu kovalar (±5)
  h = mergeBuckets([buckets['b' + (base - 5)], buckets['b' + base], buckets['b' + (base + 5)]]);
  if (h && h.sampleSize >= MIN) return { ...h, bucket: `b${base - 5}..b${base + 5}` };
  // 3) yüksek bant (≥70)
  if (confidence >= 70) {
    h = mergeBuckets(Object.entries(buckets).filter(([k]) => +k.slice(1) >= 70).map(([, v]) => v));
    if (h && h.sampleSize >= MIN) return { ...h, bucket: 'high' };
  }
  // 4) tüm kovalar
  h = mergeBuckets(Object.values(buckets));
  if (h && h.sampleSize >= MIN) return { ...h, bucket: 'all' };
  return null;
}

function getLatest() { return loadStore(); }
function __resetForTest() { store = null; }

module.exports = { runAll, getHistory, getLatest, buildSymbolSignals, mergeBuckets, bucketOf, __resetForTest };
