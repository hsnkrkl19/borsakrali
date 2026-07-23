'use strict';

/**
 * ICT + Fair Value Gap paper-signal engine.
 *
 * The engine is deliberately pure and execution-agnostic:
 *   - the 15m side discovers a CLOSED-candle FVG and validates trend,
 *     liquidity sweep and market structure with the existing SMC primitives;
 *   - the latest CLOSED 5m candle must actually trade into the zone and reclaim
 *     it before an entry is emitted;
 *   - entry is the 5m confirmation close (never the unfilled historical zone);
 *   - no broker, MT5, Telegram or persistence dependency exists here.
 *
 * Candle timestamps are treated as bar-open epoch seconds by default, matching
 * forexKlines. Set `timestampsRepresentClose: true` for close-time feeds.
 */

const crypto = require('crypto');
const smc = require('../smcService');
const indicators = require('../customBots/indicators');

const STRATEGY_ID = 'ict_fvg';
const DEFAULTS = Object.freeze({
  biasTf: '4h',
  structureTf: '1h',
  zoneTf: '15m',
  fillTf: '5m',
  trendFast: 20,
  trendSlow: 50,
  atrPeriod: 14,
  swingLen: 1,
  liquidityRangePct: 0.005,
  maxGapAgeBars: 8,
  maxStructureAgeBars: 24,
  maxHigherStructureAgeBars: 32,
  maxSweepAgeBars: 20,
  minGapAtr: 0.08,
  minDisplacementAtr: 0.65,
  stopAtrBuffer: 0.15,
  minRR: 2,
  target2RR: 3,
  minScore: 65,
  maxSignals: 1,
  timestampsRepresentClose: false,
});

function finite(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function round(value, digits = 8) {
  const p = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * p) / p;
}

function cleanSymbol(value) {
  return String(value || 'UNKNOWN').trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '') || 'UNKNOWN';
}

function toEpochSec(value) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  const n = finite(value);
  if (n != null) {
    if (n > 10_000_000_000) return Math.floor(n / 1000); // epoch milliseconds
    return Math.floor(n);
  }
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function timeframeSeconds(tf) {
  const m = String(tf || '').trim().toLowerCase().match(/^(\d+)(m|h|d|wk|w)$/);
  if (!m) return 0;
  const amount = Number(m[1]);
  const unit = m[2];
  if (unit === 'm') return amount * 60;
  if (unit === 'h') return amount * 60 * 60;
  if (unit === 'd') return amount * 24 * 60 * 60;
  return amount * 7 * 24 * 60 * 60;
}

function normalizeCandles(input) {
  if (!Array.isArray(input)) return [];
  const byTime = new Map();

  for (const row of input) {
    if (!row || typeof row !== 'object') continue;
    const time = toEpochSec(row.time ?? row.timestamp ?? row.datetime ?? row.date);
    const open = finite(row.open ?? row.o);
    const high = finite(row.high ?? row.h);
    const low = finite(row.low ?? row.l);
    const close = finite(row.close ?? row.c);
    if (time == null || !(open > 0) || !(high > 0) || !(low > 0) || !(close > 0)) continue;
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) continue;
    byTime.set(time, {
      time,
      open,
      high,
      low,
      close,
      volume: Math.max(0, finite(row.volume ?? row.v) || 0),
      _open: row.closed === false || row.isClosed === false || row.complete === false,
    });
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/**
 * Time-based CLOSED-BAR filter — the pure twin of forexKlines.closedBars.
 *
 * The engine must stay I/O-free, so it cannot require the Yahoo data layer;
 * the rule is deliberately identical (full rationale and the live measurements
 * live in services/forex/forexKlines.js):
 *
 *   a bar is closed  <=>  the feed produced a row AFTER that bar ended
 *                    <=>  bar.time + tfSec <= time of the last row
 *
 * `slice(0, -1)` is NOT enough. Yahoo appends a live-quote row *after* the
 * still-forming bar, so dropping a single tail leaves a repainting bar behind
 * (measured live 2026-07-23: the bar slice(0,-1) called closed changed its own
 * close within 100s on GC=F 5m/15m/1h, NQ=F 15m and BTC-USD 15m). Here that bar
 * would seed an FVG or fake the 5m fill confirmation.
 *
 * A fixed slice(0, -2) is wrong the other way: with the session closed there is
 * no forming bar and a real closed bar would be dropped. An alignment test
 * (time % tfSec === 0) is wrong too: Yahoo daily bars are not epoch aligned
 * (GC=F/NQ=F are stamped 04:00 UTC, EURUSD=X drifts with DST). Wall-clock is
 * unusable as well because the GC=F feed runs ~10 minutes behind.
 *
 * Input rows are already normalized (finite epoch seconds, ascending, de-duped).
 * The last row can never satisfy the condition, so the result is always a subset
 * of slice(0, -1): no caller starts seeing a bar it did not see before.
 */
function closedRowsByTime(rows, tfSec) {
  if (!rows.length) return [];
  const dataEndSec = rows[rows.length - 1].time;
  let end = rows.length;
  while (end > 0 && !(rows[end - 1].time + tfSec <= dataEndSec)) end -= 1;
  return rows.slice(0, end);
}

/**
 * Accepts a raw feed whose tail may be a forming bar plus a live-quote row, and
 * keeps only the bars the feed itself has already moved past.
 *
 * `tf` is the timeframe the series was fetched with ('5m', '15m', '1h', '4h',
 * ...) and is REQUIRED: without it the closed-bar decision degrades to a
 * positional slice, which is exactly the repaint bug this filter removes. An
 * unresolvable timeframe therefore throws instead of silently guessing.
 */
function prepareRawCandles(input, tf) {
  const tfSec = timeframeSeconds(tf);
  if (!(tfSec > 0)) {
    throw new TypeError(`prepareRawCandles: timeframe is required, got ${JSON.stringify(tf)}`);
  }
  const rows = normalizeCandles(input);
  return closedRowsByTime(rows, tfSec).filter((row) => !row._open).map(stripInternal);
}

/** Accepts an explicitly CLOSED-candle array; explicit open rows are ignored. */
function prepareClosedCandles(input) {
  return normalizeCandles(input).filter((row) => !row._open).map(stripInternal);
}

function stripInternal(row) {
  const { _open, ...clean } = row;
  return clean;
}

function barCloseTime(row, tf, config) {
  return row.time + (config.timestampsRepresentClose ? 0 : timeframeSeconds(tf));
}

function gradeFor(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  return 'C';
}

function hashKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

function setupKey(symbol, zoneTf, fvg) {
  // Never include the array index: a rolling provider window can move the same
  // historical FVG to another index while its origin time and zone stay fixed.
  const basis = [
    STRATEGY_ID,
    cleanSymbol(symbol),
    zoneTf,
    fvg.type,
    fvg.time,
    round(fvg.bottom),
    round(fvg.top),
  ].join('|');
  return `ICTFVG-${hashKey(basis)}`;
}

function atrAt(candles, index, period) {
  const series = indicators.atr(candles.slice(0, index + 1), period);
  const value = series[index];
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Reuses smcService's three-candle detector, then adds formation metadata.
 * The input must contain only closed candles.
 */
function detectClosedFvgs(input, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const candles = prepareClosedCandles(input);
  if (candles.length < 3) return [];
  return smc.detectFVG(candles, false).map((fvg) => {
    const formedIndex = fvg.i + 1;
    const formed = candles[formedIndex];
    return {
      ...fvg,
      formedIndex,
      originTimeSec: candles[fvg.i].time,
      formedTimeSec: formed.time,
      formedCloseTimeSec: barCloseTime(formed, config.zoneTf, config),
      size: fvg.top - fvg.bottom,
    };
  });
}

function directionForFvg(fvg) { return fvg.type === 'bullish' ? 'long' : 'short'; }

function alignedTrend(prefix, fvg, config) {
  const closes = prefix.map((c) => c.close);
  const fast = indicators.ema(closes, config.trendFast);
  const slow = indicators.ema(closes, config.trendSlow);
  const i = prefix.length - 1;
  const fastValue = fast[i];
  const slowValue = slow[i];
  if (!Number.isFinite(fastValue) || !Number.isFinite(slowValue)) return null;
  const close = prefix[i].close;
  const direction = fastValue > slowValue && close > fastValue
    ? 'long'
    : (fastValue < slowValue && close < fastValue ? 'short' : 'neutral');
  if (direction !== directionForFvg(fvg)) return null;
  return { direction, fast: round(fastValue), slow: round(slowValue), close: round(close) };
}

function closedTrendDirection(candles, config) {
  const closes = candles.map((c) => c.close);
  const fast = indicators.ema(closes, config.trendFast);
  const slow = indicators.ema(closes, config.trendSlow);
  const i = candles.length - 1;
  const fastValue = fast[i];
  const slowValue = slow[i];
  if (!Number.isFinite(fastValue) || !Number.isFinite(slowValue)) return null;
  const close = candles[i].close;
  const direction = fastValue > slowValue && close > fastValue
    ? 'long'
    : (fastValue < slowValue && close < fastValue ? 'short' : 'neutral');
  return {
    timeframe: config.biasTf,
    direction,
    fast: round(fastValue),
    slow: round(slowValue),
    close: round(close),
    barTime: candles[i].time,
  };
}

function closedStructureDirection(candles, config) {
  const swings = smc.swingHighsLows(candles, config.swingLen);
  const events = smc.detectBOSCHoCH(candles, swings);
  const lastIndex = candles.length - 1;
  const recent = events.filter((row) => row.breakIndex <= lastIndex
    && lastIndex - row.breakIndex <= config.maxHigherStructureAgeBars);
  const event = recent.length ? recent[recent.length - 1] : null;
  if (!event) return null;
  return {
    timeframe: config.structureTf,
    direction: event.direction === 'bullish' ? 'long' : 'short',
    event: event.type,
    level: round(event.level),
    breakIndex: event.breakIndex,
    breakTimeSec: candles[event.breakIndex]?.time || null,
    barTime: candles[lastIndex].time,
  };
}

function alignedStructure(prefix, fvg, config) {
  const swings = smc.swingHighsLows(prefix, config.swingLen);
  const events = smc.detectBOSCHoCH(prefix, swings);
  const expected = fvg.type === 'bullish' ? 'bullish' : 'bearish';
  const event = [...events].reverse().find((row) => row.direction === expected
    && row.breakIndex <= fvg.i
    && fvg.i - row.breakIndex <= config.maxStructureAgeBars);
  if (!event) return null;
  return {
    event,
    swings,
    evidence: {
      type: event.type,
      direction: event.direction,
      level: round(event.level),
      breakIndex: event.breakIndex,
      breakTimeSec: prefix[event.breakIndex]?.time || null,
    },
  };
}

function alignedLiquidity(prefix, fvg, swings, config) {
  const zones = smc.detectLiquidity(prefix, swings, config.liquidityRangePct);
  // smcService's historical labels call equal lows `buy_side` and equal highs
  // `sell_side`; translate them to unambiguous evidence names at our boundary.
  const expected = fvg.type === 'bullish' ? 'buy_side' : 'sell_side';
  const zone = [...zones].reverse().find((row) => row.type === expected
    && row.sweptIndex != null
    && row.sweptIndex <= fvg.i
    && fvg.i - row.sweptIndex <= config.maxSweepAgeBars);
  if (!zone) return null;
  return {
    ...zone,
    kind: fvg.type === 'bullish' ? 'equal_lows_swept' : 'equal_highs_swept',
    level: round(zone.level),
    sweepTimeSec: prefix[zone.sweptIndex]?.time || null,
  };
}

function formationContext(zoneCandles, fvg, config) {
  // Only formation-time history is supplied to the SMC filters. Later candles
  // cannot retroactively create trend/structure/liquidity evidence.
  const prefix = zoneCandles.slice(0, fvg.formedIndex + 1);
  const atr = atrAt(prefix, prefix.length - 1, config.atrPeriod);
  if (!(atr > 0)) return null;
  const middle = prefix[fvg.i];
  const gapAtr = (fvg.top - fvg.bottom) / atr;
  const displacementAtr = Math.abs(middle.close - middle.open) / atr;
  if (gapAtr < config.minGapAtr || displacementAtr < config.minDisplacementAtr) return null;

  const trend = alignedTrend(prefix, fvg, config);
  if (!trend) return null;
  const structure = alignedStructure(prefix, fvg, config);
  if (!structure) return null;
  const liquidity = alignedLiquidity(prefix, fvg, structure.swings, config);
  if (!liquidity) return null;

  return { atr, gapAtr, displacementAtr, trend, structure: structure.evidence, liquidity };
}

function zoneInvalidated(fvg, candle) {
  return fvg.type === 'bullish' ? candle.close <= fvg.bottom : candle.close >= fvg.top;
}

function confirmsFvg(fvg, candle) {
  if (fvg.type === 'bullish') return candle.low <= fvg.top && candle.close > fvg.top;
  return candle.high >= fvg.bottom && candle.close < fvg.bottom;
}

function isActiveOnZoneTf(zoneCandles, fvg) {
  for (let i = fvg.formedIndex + 1; i < zoneCandles.length; i++) {
    if (zoneInvalidated(fvg, zoneCandles[i])) return false;
  }
  return true;
}

function firstFillConfirmation(triggerCandles, fvg, config) {
  const eligible = triggerCandles.filter((row) => barCloseTime(row, config.fillTf, config) > fvg.formedCloseTimeSec);
  if (!eligible.length) return null;
  const latest = eligible[eligible.length - 1];

  // A setup is emitted only on its first confirmation. This makes repeated
  // polling idempotent even before the competition manager's own de-dup gate.
  for (let i = 0; i < eligible.length - 1; i++) {
    if (zoneInvalidated(fvg, eligible[i]) || confirmsFvg(fvg, eligible[i])) return null;
  }
  if (zoneInvalidated(fvg, latest) || !confirmsFvg(fvg, latest)) return null;
  return latest;
}

function qualityScore(context, fvg, fill) {
  const range = Math.max(fill.high - fill.low, Number.EPSILON);
  const reclaim = fvg.type === 'bullish'
    ? (fill.close - fvg.top) / range
    : (fvg.bottom - fill.close) / range;
  const score = 65
    + Math.min(9, context.gapAtr * 12)
    + Math.min(8, context.displacementAtr * 3)
    + (context.structure.type === 'choch' ? 7 : 5)
    + Math.min(5, Math.max(0, reclaim) * 10)
    + (context.liquidity.count >= 3 ? 4 : 2);
  return clamp(Math.round(score), 0, 100);
}

function buildSignal({ symbol, fvg, fill, context, config, ageBars }) {
  const direction = directionForFvg(fvg);
  const entry = fill.close;
  const farEdge = direction === 'long' ? fvg.bottom : fvg.top;
  const stop = direction === 'long'
    ? farEdge - context.atr * config.stopAtrBuffer
    : farEdge + context.atr * config.stopAtrBuffer;
  const risk = Math.abs(entry - stop);
  if (!(risk > 0) || (direction === 'long' ? stop >= entry : stop <= entry)) return null;

  const rr1 = Math.max(2, finite(config.minRR) || DEFAULTS.minRR);
  const rr2 = Math.max(rr1, finite(config.target2RR) || DEFAULTS.target2RR);
  const target1 = direction === 'long' ? entry + rr1 * risk : entry - rr1 * risk;
  const target2 = direction === 'long' ? entry + rr2 * risk : entry - rr2 * risk;
  if (!(target1 > 0) || !(target2 > 0)) return null;

  const score = qualityScore(context, fvg, fill);
  if (score < config.minScore) return null;
  const id = setupKey(symbol, config.zoneTf, fvg);
  const issuedAt = new Date(fill.time * 1000).toISOString();
  const fillClosedAtSec = barCloseTime(fill, config.fillTf, config);

  return {
    signalId: id,
    setupKey: id,
    strategy: STRATEGY_ID,
    source: 'ict_fvg_closed_retest',
    symbol: cleanSymbol(symbol),
    timeframe: config.fillTf,
    tf: config.fillTf,
    zoneTimeframe: config.zoneTf,
    fillTf: config.fillTf,
    direction,
    action: direction === 'long' ? 'LONG' : 'SHORT',
    entry: round(entry),
    fillPrice: round(entry),
    stop: round(stop),
    target: round(target1),
    target1: round(target1),
    target2: round(target2),
    rr: round(rr1, 2),
    rr1: round(rr1, 2),
    rr2: round(rr2, 2),
    score,
    confidence: score,
    grade: gradeFor(score),
    barTime: fill.time,
    fillTimeSec: fill.time,
    fillClosedAtSec,
    issuedAt,
    fillBar: { time: fill.time, close: round(fill.close), closed: true, tf: config.fillTf },
    fvg: {
      type: fvg.type,
      bottom: round(fvg.bottom),
      top: round(fvg.top),
      originTimeSec: fvg.originTimeSec,
      formedTimeSec: fvg.formedTimeSec,
      formedCloseTimeSec: fvg.formedCloseTimeSec,
      ageBars,
    },
    filters: {
      trend: context.trend,
      structure: context.structure,
      liquidity: context.liquidity,
      atr: round(context.atr),
      gapAtr: round(context.gapAtr, 3),
      displacementAtr: round(context.displacementAtr, 3),
    },
    execution: 'paper_only',
  };
}

function resultBase(symbol, config, biasCandles, structureCandles, zoneCandles, triggerCandles) {
  return {
    ok: true,
    strategy: STRATEGY_ID,
    execution: 'paper_only',
    symbol: cleanSymbol(symbol),
    biasTimeframe: config.biasTf,
    structureTimeframe: config.structureTf,
    zoneTimeframe: config.zoneTf,
    timeframe: config.fillTf,
    candleTime: triggerCandles.length ? triggerCandles[triggerCandles.length - 1].time : null,
    closedCandles: {
      bias: biasCandles.length,
      structure: structureCandles.length,
      zone: zoneCandles.length,
      trigger: triggerCandles.length,
    },
    signals: [],
    higherTimeframes: { bias: null, structure: null },
    diagnostics: {
      detectedFvgs: 0,
      recentFvgs: 0,
      alignedFvgs: 0,
      htfAlignedFvgs: 0,
      confirmedFvgs: 0,
    },
  };
}

/**
 * Main pure API. All four arrays must contain CLOSED candles only.
 * Defaults: 4h bias, 1h structure, 15m FVG zone and 5m fill trigger.
 */
function analyzeClosedCandles({ biasCandles, structureCandles, zoneCandles, triggerCandles } = {}, options = {}) {
  const config = { ...DEFAULTS, ...options };
  config.minRR = Math.max(2, finite(config.minRR) || DEFAULTS.minRR);
  config.target2RR = Math.max(config.minRR, finite(config.target2RR) || DEFAULTS.target2RR);
  config.maxSignals = Math.max(1, Math.floor(finite(config.maxSignals) || DEFAULTS.maxSignals));

  let biases = prepareClosedCandles(biasCandles);
  let structures = prepareClosedCandles(structureCandles);
  let zones = prepareClosedCandles(zoneCandles);
  const triggers = prepareClosedCandles(triggerCandles);
  const symbol = options.symbol || 'UNKNOWN';
  const result = resultBase(symbol, config, biases, structures, zones, triggers);

  if (biases.length < config.trendSlow || structures.length < config.swingLen * 4 + 5
      || zones.length < config.trendSlow + 3 || !triggers.length) {
    result.ok = false;
    result.reason = 'insufficient_closed_candles';
    return result;
  }

  const lastTrigger = triggers[triggers.length - 1];
  const lastTriggerClose = barCloseTime(lastTrigger, config.fillTf, config);
  // A closed higher-timeframe bar that completes after the confirmation candle
  // is future information for that decision and must be excluded.
  biases = biases.filter((row) => barCloseTime(row, config.biasTf, config) <= lastTriggerClose);
  structures = structures.filter((row) => barCloseTime(row, config.structureTf, config) <= lastTriggerClose);
  zones = zones.filter((row) => barCloseTime(row, config.zoneTf, config) <= lastTriggerClose);
  result.closedCandles.bias = biases.length;
  result.closedCandles.structure = structures.length;
  result.closedCandles.zone = zones.length;
  if (biases.length < config.trendSlow || structures.length < config.swingLen * 4 + 5
      || zones.length < config.trendSlow + 3) {
    result.ok = false;
    result.reason = 'insufficient_aligned_zone_candles';
    return result;
  }

  const higherBias = closedTrendDirection(biases, config);
  const higherStructure = closedStructureDirection(structures, config);
  result.higherTimeframes = { bias: higherBias, structure: higherStructure };

  const detected = detectClosedFvgs(zones, config);
  result.diagnostics.detectedFvgs = detected.length;
  const recent = detected.filter((fvg) => {
    const ageBars = zones.length - 1 - fvg.formedIndex;
    return ageBars >= 0 && ageBars <= config.maxGapAgeBars && fvg.formedCloseTimeSec < lastTriggerClose;
  });
  result.diagnostics.recentFvgs = recent.length;

  const signals = [];
  for (const fvg of recent) {
    if (!isActiveOnZoneTf(zones, fvg)) continue;
    const context = formationContext(zones, fvg, config);
    if (!context) continue;
    result.diagnostics.alignedFvgs += 1;
    const expectedDirection = directionForFvg(fvg);
    if (!higherBias || !higherStructure
        || higherBias.direction !== expectedDirection
        || higherStructure.direction !== expectedDirection) continue;
    result.diagnostics.htfAlignedFvgs += 1;
    const fill = firstFillConfirmation(triggers, fvg, config);
    if (!fill || fill.time !== lastTrigger.time) continue;
    const ageBars = zones.length - 1 - fvg.formedIndex;
    const signal = buildSignal({ symbol, fvg, fill, context, config, ageBars });
    if (signal) {
      signal.filters.higherTimeframes = { bias: higherBias, structure: higherStructure };
      result.diagnostics.confirmedFvgs += 1;
      signals.push(signal);
    }
  }

  signals.sort((a, b) => b.fvg.formedTimeSec - a.fvg.formedTimeSec || b.score - a.score || a.signalId.localeCompare(b.signalId));
  result.signals = signals.slice(0, config.maxSignals);
  return result;
}

/** Alias with a domain-oriented name for runtime callers. */
function analyzeSetup(payload, options) { return analyzeClosedCandles(payload, options); }

/**
 * Convenience adapter for Yahoo-style arrays whose tail may still be forming.
 * Each series is filtered with the timeframe it was fetched with, so the
 * closed-bar decision is time-based instead of positional; the timeframes come
 * from the same config fields the analysis itself uses, so a caller that
 * overrides e.g. `zoneTf` automatically filters that series with it.
 */
function analyzeRawCandles({ biasCandles, structureCandles, zoneCandles, triggerCandles } = {}, options = {}) {
  const config = { ...DEFAULTS, ...options };
  return analyzeClosedCandles({
    biasCandles: prepareRawCandles(biasCandles, config.biasTf),
    structureCandles: prepareRawCandles(structureCandles, config.structureTf),
    zoneCandles: prepareRawCandles(zoneCandles, config.zoneTf),
    triggerCandles: prepareRawCandles(triggerCandles, config.fillTf),
  }, options);
}

module.exports = {
  STRATEGY_ID,
  DEFAULTS,
  analyzeSetup,
  analyzeClosedCandles,
  analyzeRawCandles,
  detectClosedFvgs,
  prepareClosedCandles,
  prepareRawCandles,
  timeframeSeconds,
  // Small pure predicates are exported for focused golden tests and adapters.
  confirmsFvg,
  zoneInvalidated,
};
