/**
 * waveScanTracker — Dalga taraması pozisyon/yaşam döngüsü (forex'ten BAĞIMSIZ).
 *
 * Ayrı kalıcı depo (Supabase 'bot-state'/'wave-scan/state.json' + disk), ayrı
 * numara (W + parite ön eki: WBT01, WAU01). Aynı dalga kurulumu (düzeltme pivotu)
 * iki kez SİNYAL ÜRETMEZ (`seen` anahtarı). Açık pozisyon TP1/STOP/SÜRE ile
 * kapanır (1h mum, ileri-yönlü). Swing → uzun süre tanınır.
 */

const fs = require('fs');
const path = require('path');
const forexKlines = require('../forex/forexKlines');
const { getInstrument } = require('../forex/forexInstruments');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'wave-scan/state.json';
const DISK_FILE = process.env.WAVESCAN_FILE || path.join(__dirname, '..', '..', 'data', 'wave-scan-state.json');
const EXPIRE_SEC = { '4h': 10 * 86400, '1d': 30 * 86400 };  // swing → geniş
const SEEN_CAP = 600;

let state = { counters: {}, open: {}, seen: [], version: 1 };
let loaded = false, saveTimer = null;

function nowSec() { return Math.floor(Date.now() / 1000); }
function openList() { return Object.values(state.open); }
function findOpen(id, tf, dir) { return openList().find(p => p.id === id && p.tf === tf && p.direction === dir); }

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
        if (p && p.open) { state = { counters: p.counters || {}, open: p.open || {}, seen: p.seen || [], version: 1 }; got = true; }
      }
    } catch (_) {}
  }
  if (!got) { try { if (fs.existsSync(DISK_FILE)) { const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8')); if (p && p.open) state = { counters: p.counters || {}, open: p.open || {}, seen: p.seen || [], version: 1 }; } } catch (_) {} }
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

// W + parite ön eki + 2 hane (WBT01, WAU01 ... 99 sonrası 3 hane)
function nextCode(id) {
  state.counters = state.counters || {};
  state.counters[id] = (state.counters[id] || 0) + 1;
  const inst = getInstrument(id);
  const prefix = (inst && inst.prefix) || (id || 'XX').slice(0, 2).toUpperCase();
  return 'W' + prefix + String(state.counters[id]).padStart(2, '0');
}

function setupKey(s) { return `${s.id}:${s.tf}:${s.direction}:${s.correctiveTime}`; }

// Yeni kurulumları pozisyona çevir (dedup + tek-açık kuralı). 'new' olayları döner.
async function syncSignals(signals) {
  await load();
  const seen = new Set(state.seen);
  const events = [];
  for (const s of (signals || [])) {
    const key = setupKey(s);
    if (seen.has(key)) continue;                       // aynı dalga kurulumu zaten işlendi
    if (findOpen(s.id, s.tf, s.direction)) { seen.add(key); continue; } // bu parite/TF/yön açık
    const code = nextCode(s.id);
    const pos = {
      code, id: s.id, symbol: s.symbol, name: s.name, tf: s.tf, direction: s.direction,
      wave: s.wave, waveLabel: s.waveLabel, precision: s.precision,
      entry: s.entry, stop: s.stop, target1: s.target1, target2: s.target2, rr1: s.rr1, rr2: s.rr2,
      score: s.score, notes: s.notes, mt5Symbol: s.mt5Symbol, elliott: s.elliott,
      issuedAt: new Date().toISOString(), issueTimeSec: nowSec(), stopSetSec: nowSec(),
      setupKey: key,
    };
    state.open[code] = pos;
    seen.add(key);
    events.push({ type: 'new', position: pos });
  }
  state.seen = [...seen].slice(-SEEN_CAP);
  if (events.length || state.seen.length) persist();
  return events;
}

async function evalOne(p) {
  const inst = getInstrument(p.id);
  if (!inst) return null;
  const candles = await forexKlines.fetchCandles(inst.yahoo, '1h', 400);
  const isLong = p.direction === 'long';
  const stopSince = p.stopSetSec || p.issueTimeSec;
  let outcome = null, exit = null;
  if (candles && candles.length) {
    for (const b of candles) {
      if (b.time <= p.issueTimeSec) continue;
      const slHit = (b.time > stopSince) && (isLong ? b.low <= p.stop : b.high >= p.stop);
      const tpHit = isLong ? b.high >= p.target1 : b.low <= p.target1;
      if (slHit) { outcome = (isLong ? p.stop >= p.entry : p.stop <= p.entry) ? 'TRAIL' : 'SL'; exit = p.stop; break; }
      if (tpHit) { outcome = 'TP1'; exit = p.target1; break; }
    }
  }
  if (!outcome && nowSec() - p.issueTimeSec > (EXPIRE_SEC[p.tf] || 10 * 86400)) {
    outcome = 'EXPIRE'; exit = candles && candles.length ? candles[candles.length - 1].close : p.entry;
  }
  if (!outcome) return null;
  const dir = isLong ? 1 : -1;
  const pnlPct = +(((exit - p.entry) / p.entry) * 100 * dir).toFixed(2);
  return { code: p.code, id: p.id, symbol: p.symbol, tf: p.tf, direction: p.direction, wave: p.wave, precision: p.precision, entry: p.entry, exit, outcome, pnlPct, issuedAt: p.issuedAt };
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
function __resetForTest() { state = { counters: {}, open: {}, seen: [], version: 1 }; loaded = true; if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } }

module.exports = { load, syncSignals, checkClosures, getOpen, nextCode, setupKey, __resetForTest };
