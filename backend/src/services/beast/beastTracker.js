/**
 * beastTracker — BEAST sinyal yaşam döngüsü: numaralandırma, dedup, TP/SL takibi.
 *
 *  - Her (enstrüman, TF) hücresi tek pozisyon tutar; aynı yön tekrar gelirse stop
 *    LEHE trail edilir (ratchet), ters yön gelirse eski kapanır + yeni açılır.
 *  - Kod: enstrüman ön-eki + sayaç (BTC-01, XAU-03 ...).
 *  - Kapanış tespiti: pozisyonun TF mumlarıyla, BACKTEST ile aynı çıkış mantığı
 *    (partial→TP1+BE+chandelier / runner→BE@1R+chandelier) yeniden hesaplanır →
 *    canlı davranış backtest ile birebir tutar. İleri-yönlü (stopSetTime) → sahte-stop yok.
 *  - Kalıcılık: Supabase Storage ('beast/open-signals.json') + disk fallback (forex deseni).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { INSTRUMENTS, TF_DEFS, getInstrument } = require('./beastInstruments');
const cfgMod = require('./beastConfig');
const data = require('./beastData');
const I = require('./beastIndicators');

let supa = null;
try { supa = require('../../lib/supabase'); } catch (_) { supa = null; }

const SUPA_KEY = 'beast/open-signals.json';
const BUCKET = 'bot-state';
const DISK_FILE = process.env.BEAST_OPEN_FILE || path.join(__dirname, '..', '..', 'data', 'beast-open-signals.json');
const TF_SEC = { '1h': 3600, '4h': 14400, '1d': 86400 };

let state = { counters: {}, open: {}, closed: [], version: 1 };
let loaded = false;
let saveTimer = null;

async function load() {
  if (loaded) return;
  loaded = true;
  let restored = false;
  // 1) Supabase
  if (supa && supa.isSupabaseEnabled && supa.isSupabaseEnabled()) {
    try {
      const { data: blob, error } = await supa.supabaseAdmin.storage.from(BUCKET).download(SUPA_KEY);
      if (!error && blob) {
        const text = typeof blob.text === 'function' ? await blob.text() : Buffer.from(await blob.arrayBuffer()).toString('utf8');
        const j = JSON.parse(text);
        if (j && j.open) { state = Object.assign({ counters: {}, open: {}, closed: [], version: 1 }, j); restored = true; }
      }
    } catch (_) { /* diske düş */ }
  }
  // 2) Disk (Supabase yoksa/başarısızsa)
  if (!restored) {
    try {
      if (fs.existsSync(DISK_FILE)) {
        const j = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8'));
        if (j && j.open) state = Object.assign({ counters: {}, open: {}, closed: [], version: 1 }, j);
      }
    } catch (_) { /* temiz başla */ }
  }
  // Her iki yoldan sonra DA çalışır: config değişince (4h/1h kapandı) miras pozisyon temizliği
  pruneDisabled();
}

// Artık AKTİF olmayan (enabled değil) hücrelerin açık pozisyonlarını sessizce kaldırır.
// Config daraltılınca (4h/1h atılınca) miras pozisyonlar kanalı kirletmesin.
function pruneDisabled() {
  let pruned = 0;
  for (const code of Object.keys(state.open)) {
    const p = state.open[code];
    if (!cfgMod.isEnabled(p.id, p.tf)) { delete state.open[code]; pruned++; }
  }
  if (pruned) persist();
  return pruned;
}

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const body = JSON.stringify(state, null, 2);
    try {
      const dir = path.dirname(DISK_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DISK_FILE, body, 'utf8');
    } catch (_) { }
    if (supa && supa.isSupabaseEnabled && supa.isSupabaseEnabled()) {
      try {
        await supa.supabaseAdmin.storage.from(BUCKET).upload(SUPA_KEY, Buffer.from(body, 'utf8'), { contentType: 'application/json', upsert: true });
      } catch (_) { }
    }
  }, 2000);
  if (saveTimer.unref) saveTimer.unref();
}

function nextCode(id) {
  state.counters[id] = (state.counters[id] || 0) + 1;
  const inst = getInstrument(id);
  const prefix = (inst && inst.prefix) || id.slice(0, 3).toUpperCase();
  return `${prefix}-${String(state.counters[id]).padStart(2, '0')}`;
}

function keyOf(id, tf) { return `${id}:${tf}`; }
function findCell(id, tf) {
  for (const code of Object.keys(state.open)) {
    const p = state.open[code];
    if (p.id === id && p.tf === tf) return p;
  }
  return null;
}
// Pariteye göre YÖN KİLİDİ: aynı paritede ters yönde açık pozisyon var mı?
// (4h long + 1d short gibi "tutarsız" çelişkiyi engeller — tek yön/parite).
function pairHasOpposite(id, direction) {
  for (const code of Object.keys(state.open)) {
    const p = state.open[code];
    if (p.id === id && p.direction !== direction) return true;
  }
  return false;
}

// Yeni sinyalleri pozisyonlara işle → {type:'new'|'update'|'flip', position}[] olayları
async function syncPositions(signals) {
  await load();
  const events = [];
  for (const s of signals) {
    const existing = findCell(s.id, s.tf);
    // YÖN KİLİDİ: bu hücrede pozisyon yok ama paritede ters yön açıksa, çelişkili
    // sinyali AÇMA (örn. 1d short açıkken 4h long gelirse bastır).
    if (!existing && pairHasOpposite(s.id, s.direction)) {
      events.push({ type: 'suppressed', id: s.id, tf: s.tf, direction: s.direction });
      continue;
    }
    if (!existing) {
      const code = nextCode(s.id);
      const pos = {
        code, id: s.id, symbol: s.symbol, short: s.short, tf: s.tf, direction: s.direction,
        entry: s.entry, stop: s.stop, target1: s.target1, target2: s.target2,
        rr1: s.rr1, rr2: s.rr2, atr: s.atr, confidence: s.confidence, grade: s.grade,
        trigger: s.trigger, mode: s.mode, precision: s.precision,
        issuedAt: new Date().toISOString(), issueTime: s.time, stopSetTime: s.time,
      };
      state.open[code] = pos;
      events.push({ type: 'new', position: pos });
    } else if (existing.direction === s.direction) {
      // Aynı yön → stop'u LEHE trail et (ratchet), güveni tazele
      const isLong = s.direction === 'long';
      const better = isLong ? s.stop > existing.stop : s.stop < existing.stop;
      if (better) { existing.stop = s.stop; existing.stopSetTime = s.time; }
      existing.confidence = Math.max(existing.confidence, s.confidence);
      events.push({ type: 'update', position: existing });
    } else {
      // Ters yön → eski hücreyi kapat (flip), yeni aç
      delete state.open[existing.code];
      state.closed.unshift({ ...existing, outcome: 'FLIP', exit: s.entry, closedAt: new Date().toISOString() });
      const code = nextCode(s.id);
      const pos = {
        code, id: s.id, symbol: s.symbol, short: s.short, tf: s.tf, direction: s.direction,
        entry: s.entry, stop: s.stop, target1: s.target1, target2: s.target2,
        rr1: s.rr1, rr2: s.rr2, atr: s.atr, confidence: s.confidence, grade: s.grade,
        trigger: s.trigger, mode: s.mode, precision: s.precision,
        issuedAt: new Date().toISOString(), issueTime: s.time, stopSetTime: s.time,
      };
      state.open[code] = pos;
      events.push({ type: 'flip', position: pos, closed: existing.code });
    }
  }
  if (events.length) persist();
  return events;
}

// Bir pozisyonu güncel mumlarla değerlendir (backtest çıkış mantığı). → {closed, outcome, exit, currentStop}
function evalForward(pos, candles) {
  const isLong = pos.direction === 'long';
  const risk = Math.abs(pos.entry - pos.stop);
  if (!(risk > 0)) return { closed: false };
  const atr = pos.atr || risk / 2;
  const trailATR = cfgMod.TUNED.trailATR;
  const tf = pos.tf;
  const horizon = (TF_DEFS[tf] && TF_DEFS[tf].horizon) || 40;
  const mode = pos.mode || 'runner';
  let stop = pos.stop, tp1Done = false, beMoved = false;
  let runExt = isLong ? -Infinity : Infinity;
  let bars = 0;
  const after = pos.issueTime || 0;
  const stopSince = pos.stopSetTime || after;
  for (const bar of candles) {
    if (bar.time <= after) continue;
    bars++;
    const stopActive = bar.time > stopSince;
    const tp1Hit = isLong ? bar.high >= pos.target1 : bar.low <= pos.target1;
    const tp2Hit = isLong ? bar.high >= pos.target2 : bar.low <= pos.target2;
    const stopHit = stopActive && (isLong ? bar.low <= stop : bar.high >= stop);

    if (mode === 'partial') {
      if (!tp1Done) {
        if (stopHit) return { closed: true, outcome: 'SL', exit: stop, exitTime: bar.time };
        if (tp1Hit) { tp1Done = true; stop = pos.entry; if (tp2Hit) return { closed: true, outcome: 'TP2', exit: pos.target2, exitTime: bar.time }; continue; }
        continue;
      }
      runExt = isLong ? Math.max(runExt, bar.high) : Math.min(runExt, bar.low);
      const t = isLong ? runExt - trailATR * atr : runExt + trailATR * atr;
      stop = isLong ? Math.max(stop, t) : Math.min(stop, t);
      if (tp2Hit) return { closed: true, outcome: 'TP2', exit: pos.target2, exitTime: bar.time };
      if (isLong ? bar.low <= stop : bar.high >= stop) return { closed: true, outcome: stop > pos.entry === isLong ? 'TRAIL' : 'BE', exit: stop, exitTime: bar.time };
    } else if (mode === 'runner') {
      if (stopHit) return { closed: true, outcome: beMoved ? ((isLong ? stop > pos.entry : stop < pos.entry) ? 'TRAIL' : 'BE') : 'SL', exit: stop, exitTime: bar.time };
      if (tp2Hit) return { closed: true, outcome: 'TP2', exit: pos.target2, exitTime: bar.time };
      const reachedR = isLong ? (bar.high - pos.entry) / risk : (pos.entry - bar.low) / risk;
      if (!beMoved && reachedR >= 1) { stop = pos.entry; beMoved = true; }
      if (beMoved) { runExt = isLong ? Math.max(runExt, bar.high) : Math.min(runExt, bar.low); const t = isLong ? runExt - trailATR * atr : runExt + trailATR * atr; stop = isLong ? Math.max(stop, t) : Math.min(stop, t); }
    } else { // fixed
      if (stopHit) return { closed: true, outcome: 'SL', exit: stop, exitTime: bar.time };
      if (tp1Hit) return { closed: true, outcome: 'TP1', exit: pos.target1, exitTime: bar.time };
    }
    if (bars >= horizon) return { closed: true, outcome: 'EXPIRE', exit: bar.close, exitTime: bar.time };
  }
  return { closed: false, currentStop: stop };
}

// Açık pozisyonların kapanışını kontrol et → kapanış olayları
async function checkClosures() {
  await load();
  const events = [];
  for (const code of Object.keys(state.open)) {
    const pos = state.open[code];
    const inst = getInstrument(pos.id);
    if (!inst) continue;
    try {
      const candles = await data.fetchCandles(inst, pos.tf, 400);
      if (!candles || !candles.length) continue;
      const res = evalForward(pos, candles);
      if (res.closed) {
        const pnlPct = pos.direction === 'long'
          ? +((res.exit - pos.entry) / pos.entry * 100).toFixed(2)
          : +((pos.entry - res.exit) / pos.entry * 100).toFixed(2);
        const closedRec = { ...pos, outcome: res.outcome, exit: res.exit, pnlPct, closedAt: new Date().toISOString() };
        delete state.open[code];
        state.closed.unshift(closedRec);
        if (state.closed.length > 200) state.closed.length = 200;
        events.push({ type: 'closed', position: closedRec });
      } else if (res.currentStop != null && ((pos.direction === 'long' && res.currentStop > pos.stop) || (pos.direction === 'short' && res.currentStop < pos.stop))) {
        // İz-süren stop ilerledi → güncelle (bilgi amaçlı, kalıcı)
        pos.stop = +res.currentStop.toFixed(pos.precision || 2);
      }
    } catch (_) { /* tek pozisyon hatası diğerlerini düşürmesin */ }
  }
  if (events.length) persist();
  return events;
}

function getOpen() { return Object.values(state.open).sort((a, b) => b.confidence - a.confidence); }
function getClosedRecent(n = 30) { return state.closed.slice(0, n); }
function __resetForTest() { state = { counters: {}, open: {}, closed: [], version: 1 }; loaded = true; }

module.exports = { load, syncPositions, checkClosures, getOpen, getClosedRecent, nextCode, evalForward, pruneDisabled, __resetForTest };
