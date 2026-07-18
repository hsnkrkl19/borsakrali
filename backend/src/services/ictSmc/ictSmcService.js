'use strict';

/**
 * ICT/SMC servisi — motor + stratejileri sinyal-teslimat / botCompetition
 * sözleşmesine bağlar. Pine f_finalSL / f_finalTP risk mantığı portlanmış,
 * ayrıca 0-100 güven skoru üretilir (yapı uyumu + killzone + R:R + displacement).
 *
 * analyzeCandles(candles, strategy, opts): tek strateji, tüm barlardaki sinyaller.
 * analyzeLatest(candles, strategies, opts): son `freshBars` içindeki sinyaller (canlı).
 * buildSnapshot(...): { signals } — competition observeSnapshot + delivery için.
 */

const { runEngine } = require('./ictSmcEngine');
const { STRATS } = require('./ictSmcStrategies');

const SUPPORTED_STRATEGIES = Object.keys(STRATS);
// Canlıda öntanımlı çalışan yüksek-değerli alt küme (hepsi panelden açılabilir).
const DEFAULT_STRATEGIES = ['ict2022', 'silver_bullet', 'ob_retest', 'fvg_retest', 'sweep_reversal', 'choch', 'bos_continuation'];

function finite(v, f = NaN) { const n = Number(v); return Number.isFinite(n) ? n : f; }

// Pine f_finalSL: yapısal / ATR / yüzde; güvensiz seviyede ATR'a düşer.
function finalSL(side, entry, slRaw, atr, O) {
  const buf = atr * (O.slBufAtr != null ? O.slBufAtr : 0.15);
  const mult = O.slAtrMult != null ? O.slAtrMult : 1.5;
  let sl;
  if ((O.slMode || 'struct') === 'struct' && Number.isFinite(slRaw)) sl = side === 'long' ? slRaw - buf : slRaw + buf;
  else if (O.slMode === 'pct') { const p = (O.slPct != null ? O.slPct : 1.0) / 100; sl = side === 'long' ? entry * (1 - p) : entry * (1 + p); }
  else sl = side === 'long' ? entry - atr * mult : entry + atr * mult;
  if (side === 'long' && (!Number.isFinite(sl) || sl >= entry)) sl = entry - atr * mult;
  if (side === 'short' && (!Number.isFinite(sl) || sl <= entry)) sl = entry + atr * mult;
  return sl;
}

// Pine f_finalTP: TP1 = rr1·R, TP2 = rr2·R; likidite hedefi opsiyonel (tpOverride).
function finalTP(side, entry, sl, tpOverride, O) {
  const r = Math.abs(entry - sl);
  const rr1 = O.rr1 != null ? O.rr1 : 1.0;
  const rr2 = O.rr2 != null ? O.rr2 : 2.0;
  const t1 = side === 'long' ? entry + rr1 * r : entry - rr1 * r;
  let t2 = side === 'long' ? entry + rr2 * r : entry - rr2 * r;
  if ((O.tpMode === 'liq') && Number.isFinite(tpOverride)) {
    const minRR = O.liqMinRR != null ? O.liqMinRR : 1.0;
    const ok = side === 'long' ? tpOverride > entry + r * minRR : tpOverride < entry - r * minRR;
    if (ok) t2 = tpOverride;
  }
  return { target1: t1, target2: t2 };
}

// 0-100 güven: temel 50 + yapı uyumu + killzone + displacement + sağlıklı R:R.
function scoreConfidence(sig, B, entry, sl, target2) {
  let s = 50;
  const dirTrend = sig.side === 'long' ? 1 : -1;
  if (B.swTrend === dirTrend) s += 12;
  if (B.iTrend === dirTrend) s += 8;
  if (B.htfBias === dirTrend) s += 8;
  if (B.inAnyKZ) s += 6;
  if (sig.side === 'long' ? B.inDisc : B.inPrem) s += 6;
  if (sig.side === 'long' ? B.dispBull : B.dispBear) s += 5;
  const risk = Math.abs(entry - sl);
  const rr = risk > 0 ? Math.abs(target2 - entry) / risk : 0;
  if (rr >= 2) s += 6; else if (rr >= 1.5) s += 3; else if (rr < 1) s -= 8;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function analyzeCandles(candles, strategy, opts = {}) {
  if (!SUPPORTED_STRATEGIES.includes(strategy)) throw new Error(`Bilinmeyen ICT/SMC stratejisi: ${strategy}`);
  const O = { strategy, ...opts };
  const { bars, signals } = runEngine(candles, O);
  const out = [];
  for (const raw of signals) {
    const B = bars[raw.i];
    if (!B) continue;
    const atr = finite(B.atr, 0);
    if (!(atr > 0)) continue;
    const entry = raw.entry;
    const sl = finalSL(raw.side, entry, raw.slRaw, atr, O);
    const { target1, target2 } = finalTP(raw.side, entry, sl, raw.tpOverride, O);
    if (!(Math.abs(entry - sl) > 0)) continue;
    out.push({
      strategy, strategyName: STRATS[strategy], side: raw.side, direction: raw.side,
      i: raw.i, time: raw.time, entry, stop: sl, target1, target2,
      confidence: scoreConfidence(raw, B, entry, sl, target2),
      atr,
    });
  }
  return { strategy, signals: out, barCount: bars.length };
}

// Son `freshBars` içindeki sinyaller — canlı üretim için (varsayılan 2 bar).
function analyzeLatest(candles, strategies = DEFAULT_STRATEGIES, opts = {}) {
  const freshBars = opts.freshBars != null ? opts.freshBars : 2;
  const lastIdx = candles.length - 1;
  const all = [];
  for (const strat of strategies) {
    let res;
    try { res = analyzeCandles(candles, strat, opts); } catch (_) { continue; }
    for (const sig of res.signals) {
      if (lastIdx - sig.i <= freshBars) all.push(sig);
    }
  }
  return all;
}

/**
 * botCompetition observeSnapshot + signalDelivery için snapshot şekli.
 * instrumentSignals: [{ instrument:{id,symbol,yahoo}, signals:[analyzeLatest çıktısı] }]
 */
function buildSnapshot(instrumentSignals, meta = {}) {
  const signals = [];
  for (const row of instrumentSignals) {
    const inst = row.instrument || {};
    for (const s of row.signals || []) {
      signals.push({
        signalId: `${inst.id || inst.symbol}:${s.strategy}:${s.time || s.i}`,
        instrumentId: inst.id || inst.symbol,
        symbol: inst.symbol || inst.id,
        yahoo: inst.yahoo,
        strategy: s.strategy,
        strategyName: s.strategyName,
        tf: meta.tf || optTf(meta),
        timeframe: meta.tf || optTf(meta),
        direction: s.side,
        entry: s.entry,
        stop: s.stop,
        target1: s.target1,
        target2: s.target2,
        confidence: s.confidence,
        generatedAt: new Date(meta.nowMs || (s.time || Date.now())).toISOString(),
        candleDate: s.time ? new Date(s.time).toISOString() : undefined,
      });
    }
  }
  return {
    engine: 'ict-smc',
    generatedAt: new Date(meta.nowMs || Date.now()).toISOString(),
    summary: {
      signals: signals.length,
      long: signals.filter((x) => x.direction === 'long').length,
      short: signals.filter((x) => x.direction === 'short').length,
    },
    prices: meta.prices || undefined,
    signals,
  };
}
function optTf(meta) { return meta && meta.timeframe ? meta.timeframe : '15m'; }

// ───────────────────────── canlı adaptör (forexKlines) ─────────────────────────
const DEFAULT_INSTRUMENT_IDS = ['XAUUSD', 'NAS100', 'EURUSD', 'BTCUSD'];
const FETCH_LIMIT = 401;

function configuredInstrumentIds(getInstrument) {
  const configured = String(process.env.ICT_SMC_INSTRUMENTS || '')
    .split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
  const ids = configured.length ? configured : DEFAULT_INSTRUMENT_IDS;
  return [...new Set(ids)].filter((id) => Boolean(getInstrument(id)));
}

function configuredStrategies() {
  const configured = String(process.env.ICT_SMC_STRATEGIES || '')
    .split(',').map((v) => v.trim()).filter(Boolean);
  const strats = configured.length ? configured : DEFAULT_STRATEGIES;
  return strats.filter((s) => SUPPORTED_STRATEGIES.includes(s));
}

// forexKlines mumları saniye cinsinden time taşır; motor seans hesabı için ms ister.
function toMsCandles(raw) {
  return (raw || [])
    .filter((c) => c && Number.isFinite(c.open) && Number.isFinite(c.close))
    .map((c) => ({ time: c.time < 1e12 ? c.time * 1000 : c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 }));
}

/**
 * Canlı üretim: yapılandırılan enstrümanlar × stratejiler için son barlardaki
 * ICT/SMC sinyallerini üretir ve competition/delivery snapshot'ı döndürür.
 */
async function generate(options = {}) {
  const forexKlines = require('../forex/forexKlines');
  const { getInstrument } = require('../forex/forexInstruments');
  const tf = options.tf || process.env.ICT_SMC_TF || '15m';
  const strategies = options.strategies || configuredStrategies();
  const ids = options.instrumentIds || configuredInstrumentIds(getInstrument);
  const instruments = ids.map((id) => getInstrument(id)).filter(Boolean);
  const opts = { freshBars: options.freshBars != null ? options.freshBars : 2, ...(options.engineOpts || {}) };

  const prices = {};
  const rows = await Promise.all(instruments.map(async (inst) => {
    try {
      const raw = await forexKlines.fetchCandles(inst.yahoo, tf, FETCH_LIMIT);
      const candles = toMsCandles(raw);
      if (candles.length) prices[inst.symbol || inst.id] = candles[candles.length - 1].close;
      if (candles.length < 60) return { instrument: inst, signals: [], reason: 'insufficient_data' };
      const signals = analyzeLatest(candles, strategies, opts);
      return { instrument: inst, signals };
    } catch (err) {
      return { instrument: inst, signals: [], reason: 'fetch_failed', error: String(err && err.message || err) };
    }
  }));

  // prices: her tur tüm enstrümanların son fiyatı → observeSnapshot açık paper
  // pozisyonları SL/TP'de kapatabilsin (yeni sinyal olmasa da).
  return buildSnapshot(rows, { tf, timeframe: tf, nowMs: options.nowMs, prices });
}

module.exports = {
  analyzeCandles, analyzeLatest, buildSnapshot, generate,
  finalSL, finalTP, scoreConfidence, toMsCandles, configuredStrategies,
  SUPPORTED_STRATEGIES, DEFAULT_STRATEGIES, DEFAULT_INSTRUMENT_IDS, STRATS,
};
