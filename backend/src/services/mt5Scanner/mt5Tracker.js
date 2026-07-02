/**
 * mt5Tracker — GÜN-İÇİ pozisyon defteri + RİSK BÜTÇESİ (kullanıcı kuralları).
 *
 * Kurallar (kesin, 2026-07-02):
 *   • Portföy vars. 10.000$ (değiştirilebilir, kalıcı ayar) · kaldıraç 1:100.
 *   • GÜNLÜK toplam zarar %5'i, TOPLAM zarar %10'u AŞAMAZ → bütçeyi aşacak
 *     hiçbir işlem VERİLMEZ (gerçekleşen zarar + açık pozisyon riski birlikte).
 *   • Daytrade: her pozisyon EN GEÇ 23:45 TR'de kapanış sayılır (gün sonu),
 *     hiçbir pozisyon ertesi güne / hafta sonuna TAŞINMAZ. 23:00'ten sonra
 *     yeni işlem verilmez (pencere kapalı).
 *   • Pozisyon başına (enstrüman, TF) TEK kayıt; enstrümanda YÖN KİLİDİ
 *     (açık long varken short verilmez — çelişen sinyal karmaşası yaşanmıştı).
 *   • SL/TP SABİT (iz-süren yok): kullanıcı MT5'te elle işlem açıyor —
 *     telefondaki seviyeler MT5'tekiyle birebir kalmalı.
 *
 * Kapanış tespiti forexSignalTracker'ın DÜZELTİLMİŞ kurallarını kullanır:
 * yalnız KAPANMIŞ 5m mumlar, aynı mumda SL+TP → açılışa yakın seviye önce,
 * gap'te çıkış = mum açılışı.
 *
 * Kalıcılık: botPersistence 'mt5-scanner' subdir (positions.json + trades.json);
 * boot'ta loadAll() diski doldurur. MT5_RESET=<etiket> tek seferlik sıfırlama.
 */

const fs = require('fs');
const path = require('path');
const forexKlines = require('../forex/forexKlines');
const { getInstrument } = require('./mt5Instruments');

let botPersistence = null;
try { botPersistence = require('../botPersistence'); } catch (_) {}

const SUBDIR = 'mt5-scanner';
const DATA_DIR = path.join(process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data'), SUBDIR);
const POS_FILE = path.join(DATA_DIR, 'positions.json');
const TRADES_FILE = path.join(DATA_DIR, 'trades.json');

// ── Kurallar / sabitler ────────────────────────────────────────────────────
const DEFAULT_EQUITY = 10000;
const LEVERAGE = 100;
const DAILY_MAX_LOSS_PCT = 0.05;   // günlük %5
const TOTAL_MAX_LOSS_PCT = 0.10;   // toplam %10
const EOD_MIN = 23 * 60 + 45;      // 23:45 TR — gün sonu kapanışı
const NO_NEW_AFTER_MIN = 23 * 60;  // 23:00 TR sonrası yeni işlem yok
const REOPEN_COOLDOWN_SEC = 30 * 60; // kapanan (enstrüman,TF) 30 dk yeniden sinyal alamaz
const TRADES_CAP = 400;

// ── TR zaman yardımcıları ──────────────────────────────────────────────────
function nowSec() { return Math.floor(Date.now() / 1000); }
function todayKeyTR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}
function trMinutesNow() {
  // Test determinizmi: golden testler saat kaçta koşarsa koşsun aynı sonucu
  // alsın diye TR saatini sabitleyebilir (yalnız test env'inde kullanılır).
  const fake = Number(process.env.MT5_FAKE_TR_MIN);
  if (Number.isFinite(fake) && fake >= 0 && fake < 1440) return fake;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const hh = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const mm = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return hh * 60 + mm;
}
function minutesToEod() { return EOD_MIN - trMinutesNow(); }
function tradeWindowOpen() { const m = trMinutesNow(); return m < NO_NEW_AFTER_MIN; }
function eodDeadlineSec() { return nowSec() + Math.max(0, minutesToEod()) * 60; }

// ── Durum ──────────────────────────────────────────────────────────────────
function freshState() {
  return {
    version: 1, resetTag: null,
    counters: {},            // instrumentId -> son NO
    open: {},                // code -> pozisyon
    cooldownUntil: {},       // "id:tf" -> epoch sec
    day: { date: todayKeyTR(), realizedUsd: 0, opened: 0, tp: 0, sl: 0, eod: 0 },
    total: { realizedUsd: 0, opened: 0, closed: 0, wins: 0, losses: 0 },
    settings: { equity: DEFAULT_EQUITY },
  };
}
let state = freshState();
let loaded = false;

function readJson(file) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  return null;
}
function writeThrough(file, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
  try { if (botPersistence) botPersistence.save(SUBDIR, path.basename(file), data); } catch (_) {}
}
function persist() { writeThrough(POS_FILE, state); }

async function load() {
  if (loaded) return;
  loaded = true;
  const p = readJson(POS_FILE);
  if (p && p.open) {
    state = { ...freshState(), ...p };
    state.day = { ...freshState().day, ...(p.day || {}) };
    state.total = { ...freshState().total, ...(p.total || {}) };
    state.settings = { ...freshState().settings, ...(p.settings || {}) };
  }
  const tag = process.env.MT5_RESET;
  if (tag && state.resetTag !== tag) { state = freshState(); state.resetTag = tag; persist(); }
  rollDay();
}

// Gün değişince günlük sayaçları sıfırla (TR takvim günü)
function rollDay() {
  const today = todayKeyTR();
  if (state.day.date !== today) {
    state.day = { date: today, realizedUsd: 0, opened: 0, tp: 0, sl: 0, eod: 0 };
    persist();
  }
}

// ── Ayarlar (portföy) ──────────────────────────────────────────────────────
function getEquity() { return state.settings.equity > 0 ? state.settings.equity : DEFAULT_EQUITY; }
function setEquity(v) {
  const e = Math.max(100, Math.min(10_000_000, Number(v) || DEFAULT_EQUITY));
  state.settings.equity = e;
  persist();
  return e;
}

// ── Risk bütçesi ───────────────────────────────────────────────────────────
function openList() { return Object.values(state.open); }
function openRiskUsd() {
  let s = 0;
  for (const p of openList()) s += (p.units || 0) * Math.abs(p.entry - p.stop);
  return +s.toFixed(2);
}
function budget(equity = getEquity()) {
  rollDay();
  const openRisk = openRiskUsd();
  const dailyCap = equity * DAILY_MAX_LOSS_PCT;
  const totalCap = equity * TOTAL_MAX_LOSS_PCT;
  const usedDaily = Math.max(0, -state.day.realizedUsd) + openRisk;
  const usedTotal = Math.max(0, -state.total.realizedUsd) + openRisk;
  return {
    equity, leverage: LEVERAGE,
    dailyCapUsd: +dailyCap.toFixed(2), totalCapUsd: +totalCap.toFixed(2),
    openRiskUsd: openRisk,
    dayRealizedUsd: +state.day.realizedUsd.toFixed(2),
    totalRealizedUsd: +state.total.realizedUsd.toFixed(2),
    remainingDailyUsd: +(dailyCap - usedDaily).toFixed(2),
    remainingTotalUsd: +(totalCap - usedTotal).toFixed(2),
    windowOpen: tradeWindowOpen(),
    minutesToEod: minutesToEod(),
  };
}

/**
 * Yeni sinyal açılabilir mi? (dedup + yön kilidi + cooldown + pencere + bütçe)
 * Sadece kontrol — pozisyon AÇMAZ.
 */
function gate(signal, equity = getEquity()) {
  rollDay();
  const id = signal.id, tf = signal.tf, dir = signal.direction;
  const key = `${id}:${tf}`;
  if (!tradeWindowOpen()) return { ok: false, reason: 'window-closed' };
  const dup = openList().find((p) => p.instrumentId === id && p.tf === tf);
  if (dup) return { ok: false, reason: dup.direction === dir ? 'open-exists' : 'conflict', code: dup.code };
  const opp = openList().find((p) => p.instrumentId === id && p.direction !== dir);
  if (opp) return { ok: false, reason: 'conflict', code: opp.code };
  const cd = state.cooldownUntil[key] || 0;
  if (cd > nowSec()) return { ok: false, reason: 'cooldown', untilSec: cd };
  const riskUsd = signal.sizing?.riskUsd;
  if (!(riskUsd > 0)) return { ok: false, reason: 'no-sizing' };
  const b = budget(equity);
  if (riskUsd > b.remainingDailyUsd) return { ok: false, reason: 'budget-daily', remaining: b.remainingDailyUsd };
  if (riskUsd > b.remainingTotalUsd) return { ok: false, reason: 'budget-total', remaining: b.remainingTotalUsd };
  return { ok: true };
}

function nextCode(inst) {
  const n = (state.counters[inst.id] || 0) + 1;
  state.counters[inst.id] = n;
  return `G${inst.prefix}${String(n).padStart(2, '0')}`;
}

/**
 * Uygun sinyali pozisyona çevir (gate'i çağıran GEÇTİ varsayılır — yine de
 * son kez doğrulanır). Dönen: { ok, position | reason }.
 */
async function openPosition(signal, equity = getEquity()) {
  await load();
  const g = gate(signal, equity);
  if (!g.ok) return g;
  const inst = getInstrument(signal.id);
  if (!inst) return { ok: false, reason: 'unknown-instrument' };
  const code = nextCode(inst);
  const pos = {
    code, instrumentId: signal.id, symbol: signal.symbol, tf: signal.tf,
    direction: signal.direction, precision: signal.precision ?? inst.precision ?? 4,
    entry: signal.entry, stop: signal.stop, target1: signal.target1, target2: signal.target2,
    lots: signal.sizing?.lots ?? null, units: signal.sizing?.units ?? null,
    riskUsd: signal.sizing?.riskUsd ?? null, marginUsd: signal.sizing?.requiredMarginUsd ?? null,
    confidence: signal.confidence, rr1: signal.rr1,
    mt5Symbol: signal.mt5?.symbol || signal.id, equityAtOpen: equity,
    issuedAt: new Date().toISOString(), issueTimeSec: nowSec(),
    eodDeadlineSec: eodDeadlineSec(),
  };
  state.open[code] = pos;
  state.day.opened += 1;
  state.total.opened += 1;
  persist();
  return { ok: true, position: pos };
}

// ── Kapanış tespiti ────────────────────────────────────────────────────────
// forexSignalTracker.evalOne düzeltmeleri birebir: yalnız kapanmış mumlar,
// aynı mumda SL+TP → açılışa yakın olan önce, gap'te çıkış = mum açılışı.
async function evalOne(p) {
  const inst = getInstrument(p.instrumentId);
  if (!inst) return null;
  const candles = await forexKlines.fetchCandles(inst.yahoo, '5m', 300);
  const closed = (candles && candles.length) ? candles.slice(0, -1) : [];
  const isLong = p.direction === 'long';
  let outcome = null, exit = null, exitTimeSec = null;
  for (const b of closed) {
    if (b.time <= p.issueTimeSec) continue;
    // Gün sonunu aşan mumlara bakma — EOD kapanışı aşağıda ayrıca ele alınır
    if (b.time > p.eodDeadlineSec) break;
    const slHit = isLong ? b.low <= p.stop : b.high >= p.stop;
    const tpHit = isLong ? b.high >= p.target1 : b.low <= p.target1;
    if (!slHit && !tpHit) continue;
    const slExit = isLong ? Math.min(p.stop, b.open) : Math.max(p.stop, b.open);
    const tpExit = isLong ? Math.max(p.target1, b.open) : Math.min(p.target1, b.open);
    if (slHit && tpHit) {
      const dStop = Math.abs(b.open - p.stop), dTp = Math.abs(b.open - p.target1);
      if (dTp <= dStop) { exit = tpExit; outcome = 'TP1'; } else { exit = slExit; outcome = 'SL'; }
    } else if (slHit) { exit = slExit; outcome = 'SL'; }
    else { exit = tpExit; outcome = 'TP1'; }
    exitTimeSec = b.time;
    break;
  }
  // GÜN SONU: süresi geçtiyse son kapanmış mumun kapanışıyla kapat
  if (!outcome && nowSec() >= p.eodDeadlineSec) {
    const last = closed.length ? closed[closed.length - 1] : null;
    exit = last ? last.close : p.entry;
    outcome = 'EOD';
    exitTimeSec = last ? last.time : nowSec();
  }
  if (!outcome) return null;
  const dir = isLong ? 1 : -1;
  const pnlPct = +(((exit - p.entry) / p.entry) * 100 * dir).toFixed(3);
  const pnlUsd = p.units != null ? +(p.units * (exit - p.entry) * dir).toFixed(2) : null;
  return {
    code: p.code, instrumentId: p.instrumentId, symbol: p.symbol, tf: p.tf,
    direction: p.direction, precision: p.precision, entry: p.entry, exit,
    outcome, pnlPct, pnlUsd, lots: p.lots, issuedAt: p.issuedAt,
    exitTimeSec, closedAt: new Date().toISOString(),
  };
}

function appendTrade(ev) {
  const cur = readJson(TRADES_FILE) || { trades: [] };
  cur.trades.push(ev);
  if (cur.trades.length > TRADES_CAP) cur.trades = cur.trades.slice(-TRADES_CAP);
  writeThrough(TRADES_FILE, cur);
}

async function checkClosures() {
  await load();
  rollDay();
  const events = [];
  let changed = false;
  for (const p of openList()) {
    try {
      const ev = await evalOne(p);
      if (!ev) continue;
      events.push(ev);
      delete state.open[p.code];
      state.cooldownUntil[`${p.instrumentId}:${p.tf}`] = nowSec() + REOPEN_COOLDOWN_SEC;
      const usd = ev.pnlUsd || 0;
      state.day.realizedUsd = +(state.day.realizedUsd + usd).toFixed(2);
      state.total.realizedUsd = +(state.total.realizedUsd + usd).toFixed(2);
      state.total.closed += 1;
      if (usd > 0) state.total.wins += 1; else if (usd < 0) state.total.losses += 1;
      if (ev.outcome === 'TP1') state.day.tp += 1;
      else if (ev.outcome === 'SL') state.day.sl += 1;
      else state.day.eod += 1;
      appendTrade(ev);
      changed = true;
    } catch (_) { /* tek pozisyon hatası turu düşürmesin */ }
  }
  // cooldown sözlüğü şişmesin
  const now = nowSec();
  for (const k of Object.keys(state.cooldownUntil)) if (state.cooldownUntil[k] <= now) delete state.cooldownUntil[k];
  if (changed) persist();
  return events;
}

function getOpen() { return openList(); }
function getRecentTrades(limit = 50) {
  const cur = readJson(TRADES_FILE) || { trades: [] };
  return cur.trades.slice(-limit).reverse();
}
function getDayStats() { rollDay(); return { ...state.day }; }
function getTotalStats() { return { ...state.total }; }

module.exports = {
  load, gate, openPosition, checkClosures, budget, getOpen, getRecentTrades,
  getDayStats, getTotalStats, getEquity, setEquity, tradeWindowOpen, minutesToEod,
  DEFAULT_EQUITY, LEVERAGE, DAILY_MAX_LOSS_PCT, TOTAL_MAX_LOSS_PCT, SUBDIR,
};
