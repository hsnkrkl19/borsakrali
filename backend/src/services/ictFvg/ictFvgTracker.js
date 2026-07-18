'use strict';

/**
 * ICT/FVG paper-position tracker.
 *
 * This module is deliberately independent from the MT5/broker path. The engine
 * supplies a confirmed, closed 5-minute fill candle; the tracker then follows
 * only later closed 5-minute candles and records exact TP1/SL/expiry exits.
 */

const fs = require('fs');
const path = require('path');
const forexKlines = require('../forex/forexKlines');
const { getInstrument } = require('../forex/forexInstruments');

let botPersistence = null;
try { botPersistence = require('../botPersistence'); } catch (_) {}

const SUBDIR = 'ict-fvg';
const FILENAME = 'positions.json';
const DISK_FILE = process.env.ICT_FVG_TRACKER_FILE
  || path.join(__dirname, '..', '..', 'data', SUBDIR, FILENAME);
const EXPIRE_SEC = 6 * 60 * 60;
const SEEN_CAP = 1000;
const CLOSED_CAP = 300;

function freshState() {
  return {
    counters: {},
    open: {},
    closed: [],
    seenSignalIds: [],
    seenSetupKeys: [],
    version: 1,
  };
}

let state = freshState();
let loaded = false;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toSec(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  const n = finite(value);
  if (n == null || n <= 0) return null;
  return Math.floor(n > 1e12 ? n / 1000 : n);
}

function cleanState(raw) {
  if (!raw || typeof raw !== 'object') return freshState();
  return {
    counters: raw.counters && typeof raw.counters === 'object' ? raw.counters : {},
    open: raw.open && typeof raw.open === 'object' ? raw.open : {},
    closed: Array.isArray(raw.closed) ? raw.closed.slice(0, CLOSED_CAP) : [],
    seenSignalIds: Array.isArray(raw.seenSignalIds) ? raw.seenSignalIds.slice(-SEEN_CAP) : [],
    seenSetupKeys: Array.isArray(raw.seenSetupKeys) ? raw.seenSetupKeys.slice(-SEEN_CAP) : [],
    version: 1,
  };
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(DISK_FILE)) {
      state = cleanState(JSON.parse(fs.readFileSync(DISK_FILE, 'utf8')));
    }
  } catch (_) {
    state = freshState();
  }
}

function persist() {
  try {
    const dir = path.dirname(DISK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISK_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
  try {
    if (botPersistence && typeof botPersistence.save === 'function') {
      botPersistence.save(SUBDIR, FILENAME, state);
    }
  } catch (_) {}
}

function instrumentKey(signal) {
  return String(signal.instrumentId || signal.id || signal.symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function nextCode(instrumentId) {
  const id = String(instrumentId || 'ICT').toUpperCase();
  state.counters[id] = (state.counters[id] || 0) + 1;
  const inst = getInstrument(id);
  const prefix = (inst && inst.prefix) || id.slice(0, 2) || 'IF';
  return `IF-${prefix}-${String(state.counters[id]).padStart(3, '0')}`;
}

function fillFrom(signal) {
  const bar = signal.fillBar || signal.fillCandle || null;
  const fillTf = String((bar && bar.tf) || signal.fillTf || '5m').toLowerCase();
  const explicitlyOpen = (bar && bar.closed === false)
    || signal.fillBarClosed === false
    || signal.fillConfirmed === false;
  if (fillTf !== '5m' || explicitlyOpen) return null;
  const time = toSec(
    (bar && (bar.closeTime ?? bar.time))
      ?? signal.fillTimeSec
      ?? signal.fillTime
      ?? signal.entryTimeSec,
  );
  const price = finite((bar && bar.close) ?? signal.fillPrice);
  return time && price > 0 ? { time, price, tf: '5m' } : null;
}

function normalizeSignal(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'invalid-signal' };
  const signalId = typeof raw.signalId === 'string' ? raw.signalId.trim() : '';
  const setupKey = typeof raw.setupKey === 'string' ? raw.setupKey.trim() : '';
  if (!signalId || !setupKey) return { error: 'missing-identity' };

  const key = instrumentKey(raw);
  const instrumentId = String(raw.instrumentId || raw.id || key).trim().toUpperCase();
  const direction = String(raw.direction || raw.side || '').toLowerCase();
  const fill = fillFrom(raw);
  const stop = finite(raw.stop ?? raw.stopLoss);
  const target1 = finite(raw.target1 ?? raw.target ?? raw.takeProfit);
  const target2 = finite(raw.target2);
  if (!key || !fill || !['long', 'short'].includes(direction) || !(stop > 0) || !(target1 > 0)) {
    return { error: 'invalid-levels-or-fill' };
  }
  const geometryOk = direction === 'long'
    ? stop < fill.price && target1 > fill.price
    : stop > fill.price && target1 < fill.price;
  if (!geometryOk) return { error: 'invalid-price-geometry' };

  const inst = getInstrument(instrumentId);
  return {
    key,
    signalId,
    setupKey,
    instrumentId,
    symbol: String(raw.symbol || (inst && inst.symbol) || instrumentId),
    yahoo: raw.yahoo || (inst && inst.yahoo) || null,
    direction,
    entry: fill.price,
    stop,
    target1,
    target2,
    tf: String(raw.tf || raw.timeframe || '15m'),
    strategy: String(raw.strategy || 'ICT / FVG'),
    barKey: raw.barKey == null ? null : String(raw.barKey),
    confidence: finite(raw.confidence ?? raw.score),
    precision: Number.isInteger(raw.precision) ? raw.precision : ((inst && inst.precision) ?? 4),
    fillTf: '5m',
    fillTimeSec: fill.time,
  };
}

function remember(signalId, setupKey) {
  state.seenSignalIds.push(signalId);
  state.seenSetupKeys.push(setupKey);
  state.seenSignalIds = [...new Set(state.seenSignalIds)].slice(-SEEN_CAP);
  state.seenSetupKeys = [...new Set(state.seenSetupKeys)].slice(-SEEN_CAP);
}

function makePosition(signal) {
  return {
    code: nextCode(signal.instrumentId),
    signalId: signal.signalId,
    setupKey: signal.setupKey,
    instrumentId: signal.instrumentId,
    symbol: signal.symbol,
    yahoo: signal.yahoo,
    direction: signal.direction,
    entry: signal.entry,
    stop: signal.stop,
    target1: signal.target1,
    target2: signal.target2,
    tf: signal.tf,
    strategy: signal.strategy,
    barKey: signal.barKey,
    confidence: signal.confidence,
    precision: signal.precision,
    fillTf: '5m',
    fillTimeSec: signal.fillTimeSec,
    issuedAt: new Date(signal.fillTimeSec * 1000).toISOString(),
  };
}

function closeRecord(position, exit, outcome, exitTimeSec) {
  const isLong = position.direction === 'long';
  const direction = isLong ? 1 : -1;
  const risk = Math.abs(position.entry - position.stop);
  const pnlPct = ((exit - position.entry) / position.entry) * 100 * direction;
  const rMultiple = risk > 0 ? ((exit - position.entry) * direction) / risk : null;
  return {
    code: position.code,
    signalId: position.signalId,
    setupKey: position.setupKey,
    instrumentId: position.instrumentId,
    symbol: position.symbol,
    direction: position.direction,
    entry: position.entry,
    stop: position.stop,
    target1: position.target1,
    target2: position.target2,
    tf: position.tf,
    strategy: position.strategy,
    barKey: position.barKey,
    precision: position.precision,
    fillTimeSec: position.fillTimeSec,
    issuedAt: position.issuedAt,
    exit,
    outcome,
    pnlPct: +pnlPct.toFixed(3),
    rMultiple: rMultiple == null ? null : +rMultiple.toFixed(3),
    exitTimeSec,
    closedAt: new Date(exitTimeSec * 1000).toISOString(),
  };
}

function storeClosure(closure) {
  state.closed.unshift(closure);
  if (state.closed.length > CLOSED_CAP) state.closed.length = CLOSED_CAP;
}

/**
 * Register new engine fills. Returns exact opening and flip-closure records.
 * A symbol owns at most one position. An opposite fill closes it at that fill's
 * confirmed 5m close before opening the replacement.
 */
async function syncSignals(signals) {
  await load();
  const opened = [];
  const closures = [];
  const skipped = [];
  let changed = false;
  const seenIds = new Set(state.seenSignalIds);
  const seenSetups = new Set(state.seenSetupKeys);

  for (const raw of (signals || [])) {
    const signal = normalizeSignal(raw);
    if (signal.error) {
      skipped.push({ signalId: raw && raw.signalId, reason: signal.error });
      continue;
    }
    if (seenIds.has(signal.signalId) || seenSetups.has(signal.setupKey)) {
      skipped.push({ signalId: signal.signalId, setupKey: signal.setupKey, reason: 'duplicate' });
      continue;
    }

    const existing = state.open[signal.key];
    if (existing && existing.direction === signal.direction) {
      remember(signal.signalId, signal.setupKey);
      seenIds.add(signal.signalId);
      seenSetups.add(signal.setupKey);
      changed = true;
      skipped.push({ signalId: signal.signalId, setupKey: signal.setupKey, reason: 'symbol-already-open' });
      continue;
    }

    if (existing) {
      const closure = closeRecord(existing, signal.entry, 'FLIP', signal.fillTimeSec);
      delete state.open[signal.key];
      storeClosure(closure);
      closures.push(closure);
    }

    const position = makePosition(signal);
    state.open[signal.key] = position;
    remember(signal.signalId, signal.setupKey);
    seenIds.add(signal.signalId);
    seenSetups.add(signal.setupKey);
    opened.push(position);
    changed = true;
  }

  if (changed) persist();
  return { opened, closures, skipped };
}

function closedBars(candles, afterSec) {
  if (!Array.isArray(candles) || candles.length < 2) return [];
  return candles
    .slice(0, -1) // Yahoo's newest candle may still be forming: never evaluate it.
    .filter((bar) => toSec(bar.time) > afterSec)
    .sort((a, b) => toSec(a.time) - toSec(b.time));
}

function evaluate(position, bars) {
  const isLong = position.direction === 'long';
  for (const bar of bars) {
    const low = finite(bar.low);
    const high = finite(bar.high);
    if (low == null || high == null) continue;
    const slHit = isLong ? low <= position.stop : high >= position.stop;
    const tpHit = isLong ? high >= position.target1 : low <= position.target1;
    // Intrabar ordering is unknowable from OHLC. Prefer the adverse outcome.
    if (slHit) return closeRecord(position, position.stop, 'SL', toSec(bar.time));
    if (tpHit) return closeRecord(position, position.target1, 'TP1', toSec(bar.time));
  }
  const latest = bars[bars.length - 1];
  if (latest && toSec(latest.time) >= position.fillTimeSec + EXPIRE_SEC) {
    const exit = finite(latest.close);
    if (exit > 0) return closeRecord(position, exit, 'EXPIRE', toSec(latest.time));
  }
  return null;
}

async function checkClosures() {
  await load();
  const closures = [];
  for (const [key, position] of Object.entries(state.open)) {
    const inst = getInstrument(position.instrumentId);
    const yahoo = position.yahoo || (inst && inst.yahoo);
    if (!yahoo) continue;
    try {
      const candles = await forexKlines.fetchCandles(yahoo, '5m', 300);
      const closure = evaluate(position, closedBars(candles, position.fillTimeSec));
      if (!closure) continue;
      delete state.open[key];
      storeClosure(closure);
      closures.push(closure);
    } catch (_) {
      // One data-source failure must not stop the other symbols.
    }
  }
  if (closures.length) persist();
  return closures;
}

async function getOpen() {
  await load();
  return Object.values(state.open).map((position) => ({ ...position }));
}

async function getClosedRecent(limit = 30) {
  await load();
  return state.closed.slice(0, Math.max(0, limit)).map((row) => ({ ...row }));
}

function __resetForTest(options = {}) {
  state = freshState();
  loaded = options.loaded !== false;
  if (options.clearDisk !== false) {
    try { fs.rmSync(DISK_FILE, { force: true }); } catch (_) {}
  }
}

async function __reloadForTest() {
  state = freshState();
  loaded = false;
  await load();
}

module.exports = {
  load,
  syncSignals,
  checkClosures,
  getOpen,
  getClosedRecent,
  nextCode,
  normalizeSignal,
  closedBars,
  evaluate,
  __resetForTest,
  __reloadForTest,
  EXPIRE_SEC,
};
