/**
 * bistSignalTracker — BIST ≥75 LONG sinyallerinin yaşam döngüsü: numara + kalıcı
 * takip + TP/SL kapanış tespiti. (forexSignalTracker'ın BIST/LONG uyarlaması.)
 *
 * • Numara: GLOBAL artan sayaç → "001", "002" … (#001 olarak gösterilir).
 * • Birleştirme: LONG-only olduğundan anahtar yalnız SEMBOL. Aynı hisse yeniden
 *   ≥eşik sinyal üretirse AYNI NO korunur; stop/TP yukarı İZ SÜRER.
 * • Kapanış: günlük mumlarla (gerçek gün low/high) kontrol. Sahte-stop koruması:
 *   bozuk Yahoo low/high (önceki kapanışa göre ±%20 dışı) reddedilir, giriş günü
 *   ve öncesi yok sayılır. Süre dolarsa (vars. 20 takvim günü) EXPIRE.
 * • Kalıcılık: Supabase 'bot-state'/'bist/open-signals.json' + disk fallback —
 *   Render deploy'unda sıfırlanmaz.
 */

const fs = require('fs');
const path = require('path');
const liveDataService = require('../liveDataService');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'bist/open-signals.json';
const DISK_FILE = process.env.BIST_SIGNAL_DISK_FILE || path.join(__dirname, '..', '..', 'data', 'bist-signals-open.json');

const EXPIRE_DAYS = (() => { const v = Number(process.env.BIST_SIGNAL_EXPIRE_DAYS); return Number.isFinite(v) && v > 0 ? v : 20; })();
const BIST_BAND = 0.20;            // önceki kapanışa göre ±%20 dışı = bozuk veri (reddet)
const MAX_CLOSED = 50;             // route'un "son kapananlar" listesi

let state = { counter: 0, open: {}, closed: [], version: 1 };
let loaded = false;
let saveTimer = null;
let _checking = null;              // eşzamanlı kapanış kontrolü kilidi

function nowSec() { return Math.floor(Date.now() / 1000); }
function openList() { return Object.values(state.open); }
function findBySymbol(sym) { return openList().find(p => p.symbol === sym); }
function dateOf(c) { return c.date || new Date(c.timestamp || 0).toISOString().slice(0, 10); }

async function load() {
  if (loaded) return;
  loaded = true;
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
        if (p && p.open) { state = { counter: p.counter || 0, open: p.open || {}, closed: p.closed || [], version: 1 }; got = true; }
      }
    } catch (_) {}
  }
  if (!got) {
    try {
      if (fs.existsSync(DISK_FILE)) {
        const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8'));
        if (p && p.open) state = { counter: p.counter || 0, open: p.open || {}, closed: p.closed || [], version: 1 };
      }
    } catch (_) {}
  }
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

function nextCode() {
  state.counter = (state.counter || 0) + 1;
  return String(state.counter).padStart(3, '0');
}

/**
 * Uygun (≥eşik, LONG) sinyalleri pozisyonlara işle. Olay listesi döner:
 *   { type:'new'|'update', position, prev?, stopChanged?, tpChanged? }
 */
async function syncPositions(eligible) {
  await load();
  // aynı sembol birden çok kez gelebilir → en yüksek güveni temel al
  const bySym = new Map();
  for (const s of (eligible || [])) {
    if (!s || s.direction !== 'long' || !(s.entry > 0)) continue;
    const ex = bySym.get(s.symbol);
    if (!ex || s.confidence > ex.confidence) bySym.set(s.symbol, s);
  }
  const events = [];
  for (const s of bySym.values()) {
    const p = s.precision ?? 2;
    const r = (v) => +Number(v).toFixed(p);
    const existing = findBySymbol(s.symbol);
    if (!existing) {
      const pos = {
        code: nextCode(), symbol: s.symbol, name: s.name || s.symbol, direction: 'long', precision: p,
        entry: r(s.entry), stop: r(s.stop), target1: r(s.target1), target2: r(s.target2),
        rr1: s.rr1, rr2: s.rr2, confidence: s.confidence, grade: s.grade, horizon: s.horizon || null,
        issuedAt: new Date().toISOString(), issueTimeSec: nowSec(), lastUpdateSec: nowSec(),
        stopSetDate: new Date().toISOString().slice(0, 10),   // stop bu tarihten İTİBAREN geçerli
      };
      state.open[pos.code] = pos;
      events.push({ type: 'new', position: pos });
    } else {
      // LONG: stop & TP yukarı iz sürer (geri çekilmez)
      const tr = { stop: r(Math.max(existing.stop, s.stop)), target1: r(Math.max(existing.target1, s.target1)), target2: r(Math.max(existing.target2, s.target2)) };
      const stopChanged = tr.stop !== existing.stop;
      const tpChanged = tr.target1 !== existing.target1 || tr.target2 !== existing.target2;
      const confChanged = s.confidence > existing.confidence;
      if (stopChanged || tpChanged || confChanged) {
        const prev = { stop: existing.stop, target1: existing.target1, target2: existing.target2 };
        existing.stop = tr.stop; existing.target1 = tr.target1; existing.target2 = tr.target2;
        existing.confidence = Math.max(existing.confidence, s.confidence);
        existing.grade = s.grade || existing.grade;
        existing.rr1 = s.rr1; existing.rr2 = s.rr2; existing.lastUpdateSec = nowSec();
        // Stop yukarı taşındıysa: YENİ stop yalnız BU tarihten İTİBAREN geçerli olsun
        // (eski günlerin dipleri yükseltilen stopu geriye dönük tetiklemesin → sahte stop).
        if (stopChanged) existing.stopSetDate = new Date().toISOString().slice(0, 10);
        events.push({ type: 'update', position: existing, prev, stopChanged, tpChanged });
      }
    }
  }
  if (events.length) persist();
  return events;
}

// Tek pozisyonun kapanış kontrolü (gerçek günlük low/high + sahte-stop koruması).
async function evalOne(p) {
  const hist = await liveDataService.fetchHistoricalData(p.symbol, '2mo', '1d');
  const candles = (hist || []).filter(r => r && r.close != null);
  const issueDate = new Date(p.issuedAt).toISOString().slice(0, 10);
  const stopSince = p.stopSetDate || issueDate;         // stop YALNIZ konduğu tarihten sonra geçerli
  let outcome = null, exit = null, exitDate = null;
  let prevClose = null;
  for (const c of candles) {
    const d = dateOf(c);
    const pc = prevClose;
    prevClose = c.close;
    if (d <= issueDate) continue;                       // giriş günü + öncesi yok sayılır
    const lo = c.low, hi = c.high;
    // sahte-stop koruması: önceki kapanışa göre ±%20 dışı okuma = bozuk veri, reddet
    const badLow = lo == null || lo <= 0 || (pc && lo < pc * (1 - BIST_BAND));
    const badHigh = hi == null || (pc && hi > pc * (1 + BIST_BAND));
    // İLERİ-YÖNLÜ stop: stop yükseltildiyse yalnız sonraki günler tetikler (retroaktif sahte-stop önlenir)
    const slHit = !badLow && d > stopSince && lo <= p.stop;
    const tpHit = !badHigh && hi >= p.target1;
    if (slHit) { outcome = 'SL'; exit = p.stop; exitDate = d; break; }   // aynı barda ikisi de → ihtiyatlı SL
    if (tpHit) { outcome = 'TP1'; exit = p.target1; exitDate = d; break; }
  }
  if (!outcome) {
    const ageDays = (Date.now() - new Date(p.issuedAt).getTime()) / 86400000;
    if (ageDays > EXPIRE_DAYS) {
      outcome = 'EXPIRE';
      const last = candles.length ? candles[candles.length - 1] : null;
      exit = last ? last.close : p.entry;
      exitDate = last ? dateOf(last) : null;
    }
  }
  if (!outcome) return null;
  const pnlPct = +(((exit - p.entry) / p.entry) * 100).toFixed(2);
  return {
    code: p.code, symbol: p.symbol, name: p.name, direction: 'long', precision: p.precision ?? 2,
    entry: p.entry, stop: p.stop, target1: p.target1, target2: p.target2,
    exit: +Number(exit).toFixed(p.precision ?? 2), exitDate, outcome, pnlPct,
    confidence: p.confidence, issuedAt: p.issuedAt,
  };
}

async function checkClosures() {
  if (_checking) return [];           // eşzamanlı tetik (15dk kadans + 5dk tick) tek tur
  _checking = (async () => {
    await load();
    const events = [];
    for (const p of openList()) {
      try { const ev = await evalOne(p); if (ev) { events.push(ev); delete state.open[p.code]; } } catch (_) {}
    }
    if (events.length) {
      const closedAt = new Date().toISOString();
      state.closed = [...events.map(e => ({ ...e, closedAt })), ...(state.closed || [])].slice(0, MAX_CLOSED);
      persist();
    }
    return events;
  })();
  try { return await _checking; }
  finally { _checking = null; }
}

async function getOpen() {
  await load();
  return openList().sort((a, b) => b.confidence - a.confidence || a.code.localeCompare(b.code));
}

async function getClosedRecent() {
  await load();
  return state.closed || [];
}

// test için durumu sıfırla
function __resetForTest() { state = { counter: 0, open: {}, closed: [], version: 1 }; loaded = true; }

module.exports = {
  load, syncPositions, checkClosures, getOpen, getClosedRecent,
  nextCode, evalOne, __resetForTest, EXPIRE_DAYS, BIST_BAND,
};
