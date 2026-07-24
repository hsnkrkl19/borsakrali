'use strict';

/**
 * Runtime data adapter for the ICT/FVG paper strategy.
 *
 * The pure engine owns signal logic. This service only fetches Yahoo candles,
 * rejects stale markets and attaches the canonical instrument metadata used by
 * the tracker, Telegram notifier and paper competition.
 */

const forexKlines = require('../forex/forexKlines');
const { getInstrument } = require('../forex/forexInstruments');
const engine = require('./ictFvgEngine');
const instrumentBans = require('../instrumentBans');

const DEFAULT_INSTRUMENT_IDS = Object.freeze(['XAUUSD', 'NAS100', 'EURUSD', 'BTCUSD']);
const FETCH_LIMIT = 302; // 300 closed bars plus Yahoo's forming bar and quote row.
const DEFAULT_MAX_STALE_MINUTES = 20;

// Single source of truth for the four series: the same value is used to fetch a
// timeframe and to tell the engine which timeframe that array was fetched with.
// The engine's closed-bar filter is time-based, so a fetch/analyze mismatch here
// would trim the wrong tail — they must never drift apart.
const TIMEFRAMES = Object.freeze({ bias: '4h', structure: '1h', zone: '15m', fill: '5m' });

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function configuredInstrumentIds() {
  const configured = String(process.env.ICT_FVG_INSTRUMENTS || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const ids = configured.length ? configured : DEFAULT_INSTRUMENT_IDS;
  // ICT_FVG_INSTRUMENTS env'i yasaklı enstrümanı geri getiremez (2026-07-24).
  return instrumentBans.filterSymbols([...new Set(ids)]).filter((id) => Boolean(getInstrument(id)));
}

function lastClosedTrigger(rawCandles) {
  const closed = engine.prepareRawCandles(rawCandles, TIMEFRAMES.fill);
  return closed.length ? closed[closed.length - 1] : null;
}

function staleInfo(rawCandles, nowMs = Date.now()) {
  const last = lastClosedTrigger(rawCandles);
  if (!last) return { stale: true, ageSec: null, lastClosedAtSec: null };
  const lastClosedAtSec = Number(last.time) + engine.timeframeSeconds(TIMEFRAMES.fill);
  const ageSec = Math.max(0, Math.floor(nowMs / 1000) - lastClosedAtSec);
  const maxMinutes = Math.max(5, finite(process.env.ICT_FVG_MAX_STALE_MIN, DEFAULT_MAX_STALE_MINUTES));
  return { stale: ageSec > maxMinutes * 60, ageSec, lastClosedAtSec };
}

async function fetchInstrumentCandles(instrument) {
  const [biasCandles, structureCandles, zoneCandles, triggerCandles] = await Promise.all([
    forexKlines.fetchCandles(instrument.yahoo, TIMEFRAMES.bias, FETCH_LIMIT),
    forexKlines.fetchCandles(instrument.yahoo, TIMEFRAMES.structure, FETCH_LIMIT),
    forexKlines.fetchCandles(instrument.yahoo, TIMEFRAMES.zone, FETCH_LIMIT),
    forexKlines.fetchCandles(instrument.yahoo, TIMEFRAMES.fill, FETCH_LIMIT),
  ]);
  return { biasCandles, structureCandles, zoneCandles, triggerCandles };
}

function enrichSignal(signal, instrument) {
  const fillClosedAtSec = Number(signal.fillClosedAtSec || 0) || null;
  return {
    ...signal,
    instrumentId: instrument.id,
    symbol: instrument.symbol,
    yahoo: instrument.yahoo,
    precision: instrument.precision,
    // The setup belongs to the 15m FVG strategy; fillTf keeps the 5m execution
    // chronology explicit for the tracker.
    timeframe: TIMEFRAMES.zone,
    tf: TIMEFRAMES.zone,
    fillTf: TIMEFRAMES.fill,
    barKey: `${instrument.id}:${TIMEFRAMES.fill}:${fillClosedAtSec || signal.fillTimeSec}`,
  };
}

async function analyzeInstrument(instrument, options = {}) {
  const candles = options.candles || await fetchInstrumentCandles(instrument);
  const freshness = staleInfo(candles.triggerCandles, options.nowMs);
  if (freshness.stale) {
    return {
      instrumentId: instrument.id,
      ok: false,
      reason: freshness.lastClosedAtSec == null ? 'missing_closed_5m_data' : 'stale_closed_5m_data',
      freshness,
      signals: [],
    };
  }

  const minScore = Math.max(0, Math.min(100, finite(process.env.ICT_FVG_MIN_SCORE, 65)));
  const result = engine.analyzeRawCandles(candles, {
    symbol: instrument.id,
    // Passed explicitly so the engine trims each raw series with the very
    // timeframe fetchInstrumentCandles requested it with.
    biasTf: TIMEFRAMES.bias,
    structureTf: TIMEFRAMES.structure,
    zoneTf: TIMEFRAMES.zone,
    fillTf: TIMEFRAMES.fill,
    minScore,
    minRR: 2,
    target2RR: 3,
  });
  return {
    ...result,
    instrumentId: instrument.id,
    name: instrument.name,
    displaySymbol: instrument.symbol,
    yahoo: instrument.yahoo,
    freshness,
    signals: (result.signals || []).map((signal) => enrichSignal(signal, instrument)),
  };
}

async function generate(options = {}) {
  const ids = options.instrumentIds || configuredInstrumentIds();
  const instruments = ids.map((id) => getInstrument(id)).filter(Boolean);
  const settled = await Promise.allSettled(instruments.map((instrument) => analyzeInstrument(instrument, options)));
  const rows = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      instrumentId: instruments[index].id,
      ok: false,
      reason: 'data_fetch_failed',
      error: String(result.reason?.message || result.reason || 'unknown'),
      signals: [],
    };
  });
  const signals = rows.flatMap((row) => row.signals || []);
  return {
    ok: true,
    strategy: engine.STRATEGY_ID,
    execution: 'paper_only',
    generatedAt: new Date(options.nowMs || Date.now()).toISOString(),
    universe: instruments.map((instrument) => instrument.id),
    counts: {
      instruments: instruments.length,
      analyzed: rows.filter((row) => row.ok).length,
      stale: rows.filter((row) => row.reason === 'stale_closed_5m_data').length,
      signals: signals.length,
      long: signals.filter((signal) => signal.direction === 'long').length,
      short: signals.filter((signal) => signal.direction === 'short').length,
    },
    signals,
    results: rows,
  };
}

module.exports = {
  generate,
  analyzeInstrument,
  fetchInstrumentCandles,
  configuredInstrumentIds,
  lastClosedTrigger,
  staleInfo,
  enrichSignal,
  DEFAULT_INSTRUMENT_IDS,
  FETCH_LIMIT,
  TIMEFRAMES,
};
