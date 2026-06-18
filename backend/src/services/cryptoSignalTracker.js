/**
 * cryptoSignalTracker — Kripto sinyallerinin SÜREKLİ yayını için dedup + yaşam
 * döngüsü (forexSignalTracker'ın kripto uyarlaması). Kullanıcı isteği: kripto
 * 4 fazda değil, forex gibi SÜREKLİ taransın ve bulduğunu (tekrarsız) göndersin.
 *
 * • Anahtar = symbol:strategy (spot_long / futures_long / futures_short).
 * • Aynı sinyal açıkken tekrar GÖNDERİLMEZ (dedup). Kapanınca tekrar oluşabilir.
 * • Numara: strateji ön eki (KS/KL/KX) + sayı → KS01, KL01, KX01 (99→3 hane).
 * • Kapanış: 1h mumla TP1/SL/SÜRE (ileri-yönlü, stopSetSec). Aynı NO ile teyit.
 * • Kalıcılık: Supabase 'bot-state'/'crypto/open-signals.json' + disk.
 */

const fs = require('fs');
const path = require('path');
const cryptoKlines = require('./cryptoKlines');

let supa = null, supaEnabled = () => false;
try { const m = require('../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'crypto/open-signals.json';
const DISK_FILE = process.env.CRYPTO_SIGNALS_FILE || path.join(__dirname, '..', 'data', 'crypto-signals-open.json');
const EXPIRE_SEC = 7 * 86400;                 // kripto swing → 7 gün
const PREFIX = { spot_long: 'KS', futures_long: 'KL', futures_short: 'KX' };

let state = { counters: {}, open: {}, version: 1 };
let loaded = false, saveTimer = null;

function nowSec() { return Math.floor(Date.now() / 1000); }
function openList() { return Object.values(state.open); }
function keyOf(s) { return `${s.symbol}:${s.strategy}`; }
function findOpen(symbol, strategy) { return openList().find(p => p.symbol === symbol && p.strategy === strategy); }

async function load() {
  if (loaded) return; loaded = true;
  let got = false;
  if (supaEnabled && supaEnabled()) {
    try {
      const { data } = await Promise.race([
        supa.storage.from(BUCKET).download(SUPA_KEY),
        new Promise((_, rej) => setTimeout(() => rej(new Error('supa-timeout')), 8000)),
      ]);
      if (data) {
        const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
        const p = JSON.parse(text);
        if (p && p.open) { state = { counters: p.counters || {}, open: p.open || {}, version: 1 }; got = true; }
      }
    } catch (_) {}
  }
  if (!got) { try { if (fs.existsSync(DISK_FILE)) { const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8')); if (p && p.open) state = { counters: p.counters || {}, open: p.open || {}, version: 1 }; } } catch (_) {} }
}

function persist() {
  try {
    const dir = path.dirname(DISK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISK_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
  if (supaEnabled && supaEnabled()) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await supa.storage.from(BUCKET).upload(SUPA_KEY, Buffer.from(JSON.stringify(state), 'utf8'), { contentType: 'application/json', upsert: true }); } catch (_) {}
    }, 2500);
    if (saveTimer.unref) saveTimer.unref();
  }
}

function nextCode(strategy) {
  state.counters = state.counters || {};
  state.counters[strategy] = (state.counters[strategy] || 0) + 1;
  const pre = PREFIX[strategy] || 'K';
  return pre + String(state.counters[strategy]).padStart(2, '0');
}

// Uygun sinyalleri pozisyona çevir. Açık olan tekrar göndermez. 'new' olayları döner.
// opts.maxNew = bir turda en fazla kaç yeni (ilk taramada patlamayı önler).
async function syncSignals(eligible, opts = {}) {
  await load();
  const maxNew = opts.maxNew || 8;
  const events = [];
  for (const s of (eligible || [])) {
    if (!s || !(s.entry > 0) || !(s.stop > 0) || !(s.target1 > 0)) continue;
    if (findOpen(s.symbol, s.strategy)) continue;     // zaten açık → sessiz (dedup)
    if (events.length >= maxNew) break;
    const code = nextCode(s.strategy);
    const pos = {
      code, symbol: s.symbol, name: s.name || s.symbol, strategy: s.strategy, direction: s.direction,
      entry: s.entry, stop: s.stop, target1: s.target1, target2: s.target2 ?? null,
      totalScore: s.totalScore ?? null, historicalWinRate: s.historicalWinRate ?? null,
      issuedAt: new Date().toISOString(), issueTimeSec: nowSec(), stopSetSec: nowSec(),
    };
    state.open[code] = pos;
    events.push({ type: 'new', position: pos });
  }
  if (events.length) persist();
  return events;
}

async function evalOne(p) {
  let candles;
  try { candles = await cryptoKlines.fetchCandles(p.symbol, '1h', 300); } catch (_) { return null; }
  const isLong = p.direction === 'long';
  const stopSince = p.stopSetSec || p.issueTimeSec;
  let outcome = null, exit = null;
  if (candles && candles.length) {
    for (const b of candles) {
      if (b.time == null || b.time <= p.issueTimeSec) continue;
      const slHit = (b.time > stopSince) && (isLong ? b.low <= p.stop : b.high >= p.stop);
      const tpHit = isLong ? b.high >= p.target1 : b.low <= p.target1;
      if (slHit) { outcome = (isLong ? p.stop >= p.entry : p.stop <= p.entry) ? 'TRAIL' : 'SL'; exit = p.stop; break; }
      if (tpHit) { outcome = 'TP1'; exit = p.target1; break; }
    }
  }
  if (!outcome && nowSec() - p.issueTimeSec > EXPIRE_SEC) {
    outcome = 'EXPIRE'; exit = candles && candles.length ? candles[candles.length - 1].close : p.entry;
  }
  if (!outcome) return null;
  const dir = isLong ? 1 : -1;
  const pnlPct = +(((exit - p.entry) / p.entry) * 100 * dir).toFixed(2);
  return { code: p.code, symbol: p.symbol, name: p.name, strategy: p.strategy, direction: p.direction, entry: p.entry, exit, outcome, pnlPct, issuedAt: p.issuedAt };
}

async function checkClosures() {
  await load();
  const events = [];
  for (const p of openList()) {
    try { const ev = await evalOne(p); if (ev) { events.push(ev); delete state.open[p.code]; } } catch (_) {}
  }
  if (events.length) persist();
  return events;
}

function getOpen() { return openList(); }
function __resetForTest() { state = { counters: {}, open: {}, version: 1 }; loaded = true; if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } }

module.exports = { load, syncSignals, checkClosures, getOpen, nextCode, __resetForTest };
