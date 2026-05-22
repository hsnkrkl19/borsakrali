/**
 * TEMA34 Bot — Pozisyon & Portföy Deposu
 *
 * Disk üzerinde JSON dosyalarla TEMA34 botunun sanal portföyünü, açık
 * pozisyonlarını, kapanmış işlemlerini ve günlük tarama günlüğünü yönetir.
 * Trading Bot v6 positionStore desenini taklit eder, ama daha sade:
 * pending pozisyon / sinyal-log yok — bot her gün kapanışta tek hamlede
 * alır veya satar.
 *
 * Dosyalar: backend/src/data/tema34-bot/
 *   - portfolio.json  → bakiye + KPI + equity history (mutable state)
 *   - positions.json  → açık pozisyonlar (mutable)
 *   - trades.json     → kapanmış işlemler (append-only)
 *   - runs.json       → günlük tarama günlüğü (append-only, son 200 koşu)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BOT_DIR = path.join(__dirname, '..', '..', 'data', 'tema34-bot');
const PORTFOLIO_FILE = path.join(BOT_DIR, 'portfolio.json');
const POSITIONS_FILE = path.join(BOT_DIR, 'positions.json');
const TRADES_FILE    = path.join(BOT_DIR, 'trades.json');
const RUNS_FILE      = path.join(BOT_DIR, 'runs.json');

const INITIAL_CAPITAL = 100000;
const MAX_RUNS_KEPT   = 200;

function ensureDir() {
  if (!fs.existsSync(BOT_DIR)) fs.mkdirSync(BOT_DIR, { recursive: true });
}

function readJSON(file, fallback) {
  ensureDir();
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[Tema34Store] Bozuk dosya: ${file}`, e.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function newId() { return crypto.randomBytes(6).toString('hex'); }
function nowISO() { return new Date().toISOString(); }

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
    lastCandleDate: null,   // işlenen son günlük mumun tarihi (YYYY-MM-DD)
    lastRunAt: null,        // son tarama çalışma zamanı (ISO)
    equityHistory: [],      // [{ date, equity }]
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

function recordEquityPoint(equity, dateKey) {
  const p = getPortfolio();
  const date = dateKey || new Date().toISOString().slice(0, 10);
  const history = p.equityHistory || [];
  // Aynı işlem günü için son point'i overwrite — günlük çözünürlük yeter
  if (history.length && history[history.length - 1].date === date) {
    history[history.length - 1].equity = equity;
  } else {
    history.push({ date, equity });
    if (history.length > 365) history.shift();
  }
  p.equityHistory = history;
  p.equity = equity;
  savePortfolio(p);
}

// ── Pozisyonlar ────────────────────────────────────────────────────────────
function listPositions() { return readJSON(POSITIONS_FILE, []); }
function listOpen() { return listPositions().filter(p => p.status === 'open'); }
function findById(id) { return listPositions().find(p => p.id === id) || null; }
function findBySymbol(symbol) {
  return listPositions().find(p => p.symbol === symbol && p.status === 'open') || null;
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

function removePosition(id) {
  writeJSON(POSITIONS_FILE, listPositions().filter(p => p.id !== id));
}

// ── Trades (kapanmış işlemler, append-only) ───────────────────────────────
function listTrades(limit = 200) {
  const all = readJSON(TRADES_FILE, []);
  return all.slice(-limit).reverse(); // en yenisi üstte
}

function appendTrade(trade) {
  const all = readJSON(TRADES_FILE, []);
  all.push({ ...trade, recordedAt: nowISO() });
  writeJSON(TRADES_FILE, all);
  return trade;
}

// ── Runs (günlük tarama günlüğü, append-only) ─────────────────────────────
function listRuns(limit = 100) {
  const all = readJSON(RUNS_FILE, []);
  return all.slice(-limit).reverse(); // en yenisi üstte
}

function appendRun(run) {
  const all = readJSON(RUNS_FILE, []);
  all.push({ id: newId(), recordedAt: nowISO(), ...run });
  while (all.length > MAX_RUNS_KEPT) all.shift();
  writeJSON(RUNS_FILE, all);
  return run;
}

// ── Reset (admin) ──────────────────────────────────────────────────────────
function reset() {
  ensureDir();
  const fresh = defaultPortfolio();
  fresh.resetAt = nowISO();
  writeJSON(PORTFOLIO_FILE, fresh);
  writeJSON(POSITIONS_FILE, []);
  writeJSON(TRADES_FILE, []);
  writeJSON(RUNS_FILE, []);
  return { ok: true, portfolio: fresh };
}

module.exports = {
  getPortfolio,
  savePortfolio,
  recordEquityPoint,
  listPositions,
  listOpen,
  findById,
  findBySymbol,
  addPosition,
  updatePosition,
  removePosition,
  listTrades,
  appendTrade,
  listRuns,
  appendRun,
  reset,
  INITIAL_CAPITAL,
  BOT_DIR,
};
