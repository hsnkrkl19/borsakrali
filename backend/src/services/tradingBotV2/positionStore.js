/**
 * Position Store — Trading Bot v6
 *
 * Disk üzerinde JSON dosyalarla sanal portföyü, açık/pending pozisyonları,
 * kapalı işlemleri ve append-only sinyal logunu yönetir.
 *
 * Dosyalar: backend/src/data/bot/
 *   - portfolio.json   → bakiye + KPI + equity history (state, mutable)
 *   - positions.json   → açık + pending pozisyon array'i (state, mutable)
 *   - trades.json      → kapalı işlemler (append-only, asla silinmez)
 *   - signal-log.json  → bot tarafından gözlenen sinyal logu
 *                        (append; sadece outcome/exit alanları update edilir,
 *                         sinyalin kendisi — entry/stop/target/skor — değişmez)
 *
 * snapshotStore.js patternini taklit eder (atomik write, JSON-on-disk).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BOT_DIR = path.join(__dirname, '..', '..', 'data', 'bot');
const PORTFOLIO_FILE  = path.join(BOT_DIR, 'portfolio.json');
const POSITIONS_FILE  = path.join(BOT_DIR, 'positions.json');
const TRADES_FILE     = path.join(BOT_DIR, 'trades.json');
const SIGNAL_LOG_FILE = path.join(BOT_DIR, 'signal-log.json');

const INITIAL_CAPITAL = 100000;

function ensureDir() {
  if (!fs.existsSync(BOT_DIR)) fs.mkdirSync(BOT_DIR, { recursive: true });
}

function readJSON(file, fallback) {
  ensureDir();
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[PositionStore] Bozuk dosya: ${file}`, e.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

function nowISO() {
  return new Date().toISOString();
}

// ── Portföy ────────────────────────────────────────────────────────────────
function defaultPortfolio() {
  return {
    capital: INITIAL_CAPITAL,
    cash: INITIAL_CAPITAL,
    equity: INITIAL_CAPITAL,
    totalRealizedPnL: 0,
    totalRealizedPnLPct: 0,
    openCount: 0,
    winCount: 0,
    lossCount: 0,
    winRate: 0,
    startedAt: nowISO(),
    resetAt: null,
    equityHistory: [], // [{ date: ISO, equity }]
  };
}

function getPortfolio() {
  const p = readJSON(PORTFOLIO_FILE, null);
  if (!p) {
    const def = defaultPortfolio();
    writeJSON(PORTFOLIO_FILE, def);
    return def;
  }
  return p;
}

function savePortfolio(p) {
  writeJSON(PORTFOLIO_FILE, p);
  return p;
}

function recordEquityPoint(equity) {
  const p = getPortfolio();
  const today = new Date().toISOString().slice(0, 10);
  const history = p.equityHistory || [];
  // Aynı gün için son point'i overwrite — daily resolution yeter
  if (history.length && history[history.length - 1].date === today) {
    history[history.length - 1].equity = equity;
  } else {
    history.push({ date: today, equity });
    if (history.length > 365) history.shift();
  }
  p.equityHistory = history;
  p.equity = equity;
  savePortfolio(p);
}

// ── Pozisyonlar ────────────────────────────────────────────────────────────
function listPositions() {
  return readJSON(POSITIONS_FILE, []);
}

function listOpen() {
  return listPositions().filter(p => p.status === 'open');
}

function listPending() {
  return listPositions().filter(p => p.status === 'pending');
}

function findById(id) {
  return listPositions().find(p => p.id === id) || null;
}

function findBySymbol(symbol, statuses = ['open', 'pending']) {
  return listPositions().find(
    p => p.symbol === symbol && statuses.includes(p.status)
  ) || null;
}

function addPosition(pos) {
  const all = listPositions();
  const entry = { id: pos.id || newId(), createdAt: nowISO(), ...pos };
  all.push(entry);
  writeJSON(POSITIONS_FILE, all);
  return entry;
}

function updatePosition(id, patch) {
  const all = listPositions();
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch, updatedAt: nowISO() };
  writeJSON(POSITIONS_FILE, all);
  return all[idx];
}

function appendNote(id, action, text) {
  const pos = findById(id);
  if (!pos) return null;
  const notes = Array.isArray(pos.notes) ? pos.notes : [];
  notes.push({ time: nowISO(), action, text });
  return updatePosition(id, { notes });
}

function removePosition(id) {
  const all = listPositions().filter(p => p.id !== id);
  writeJSON(POSITIONS_FILE, all);
}

// ── Trades (kapalı işlemler, append-only) ─────────────────────────────────
function listTrades(limit = 100) {
  const all = readJSON(TRADES_FILE, []);
  // En yenisi üstte
  return all.slice(-limit).reverse();
}

function appendTrade(trade) {
  const all = readJSON(TRADES_FILE, []);
  const entry = { ...trade, recordedAt: nowISO() };
  all.push(entry);
  writeJSON(TRADES_FILE, all);
  return entry;
}

// ── Signal Log (append-only, sadece outcome güncellenir) ──────────────────
function listSignalLog(opts = {}) {
  let all = readJSON(SIGNAL_LOG_FILE, []);
  const { symbol, strategy, fromDate, toDate, outcome, limit = 500 } = opts;
  if (symbol)   all = all.filter(s => s.symbol === symbol);
  if (strategy) all = all.filter(s => s.strategy === strategy);
  if (outcome)  all = all.filter(s => s.outcome === outcome);
  if (fromDate) all = all.filter(s => (s.signalDate || '').slice(0, 10) >= fromDate);
  if (toDate)   all = all.filter(s => (s.signalDate || '').slice(0, 10) <= toDate);
  // En yenisi üstte
  return all.slice(-limit).reverse();
}

function findSignalLog(predicate) {
  const all = readJSON(SIGNAL_LOG_FILE, []);
  return all.find(predicate) || null;
}

function findSignalLogBySymbolDatePhase(symbol, signalDate, signalPhase, strategy) {
  return findSignalLog(s =>
    s.symbol === symbol &&
    s.signalDate === signalDate &&
    s.signalPhase === signalPhase &&
    s.strategy === strategy
  );
}

function appendSignalLog(entry) {
  const all = readJSON(SIGNAL_LOG_FILE, []);
  const record = { id: entry.id || newId(), loggedAt: nowISO(), ...entry };
  all.push(record);
  writeJSON(SIGNAL_LOG_FILE, all);
  return record;
}

/**
 * Sinyal logu append-only — sinyalin kendisi (entry/stop/target/skor/date)
 * asla değişmez. Sadece outcome/exit/positionId alanları update edilebilir.
 */
const MUTABLE_LOG_FIELDS = new Set([
  'outcome', 'positionId',
  'triggerDate', 'triggerPrice',
  'exitDate', 'exitPrice', 'exitReason',
  'finalReturnPct', 'finalPnL',
  'updatedAt',
]);

function updateSignalLog(id, patch) {
  const all = readJSON(SIGNAL_LOG_FILE, []);
  const idx = all.findIndex(s => s.id === id);
  if (idx === -1) return null;
  const allowedPatch = {};
  for (const key of Object.keys(patch || {})) {
    if (MUTABLE_LOG_FIELDS.has(key)) allowedPatch[key] = patch[key];
  }
  allowedPatch.updatedAt = nowISO();
  all[idx] = { ...all[idx], ...allowedPatch };
  writeJSON(SIGNAL_LOG_FILE, all);
  return all[idx];
}

// ── Reset (admin) ──────────────────────────────────────────────────────────
function reset() {
  ensureDir();
  const fresh = defaultPortfolio();
  fresh.resetAt = nowISO();
  writeJSON(PORTFOLIO_FILE, fresh);
  writeJSON(POSITIONS_FILE, []);
  writeJSON(TRADES_FILE, []);
  writeJSON(SIGNAL_LOG_FILE, []);
  return { ok: true, portfolio: fresh };
}

module.exports = {
  // Portfolio
  getPortfolio,
  savePortfolio,
  recordEquityPoint,
  // Positions
  listPositions,
  listOpen,
  listPending,
  findById,
  findBySymbol,
  addPosition,
  updatePosition,
  appendNote,
  removePosition,
  // Trades
  listTrades,
  appendTrade,
  // Signal log
  listSignalLog,
  findSignalLog,
  findSignalLogBySymbolDatePhase,
  appendSignalLog,
  updateSignalLog,
  // Admin
  reset,
  // Helpers/constants
  INITIAL_CAPITAL,
  BOT_DIR,
};
