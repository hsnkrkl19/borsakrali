/**
 * forexSignalTracker — POZİSYON birleştirme + iz-süren seviye + yaşam döngüsü.
 *
 * Aynı parite + AYNI YÖN'deki tüm sinyaller (farklı TF'ler ve sonradan yeniden
 * oluşanlar) TEK pozisyonda birleştirilir: tek NO, katkı veren TF'ler listelenir.
 * Yeni sinyal geldikçe seviyeler İZ SÜRER (long: stop yukarı, TP yukarı; short
 * tersi). Farklı yön = AYRI pozisyon (ters sinyal bayrağı korunur).
 *
 * Kapanış: pozisyonun (iz-sürmüş) stop/TP1'i 5m mumlarla kontrol edilir → aynı
 * NO ile teyit. Kalıcılık: Supabase 'bot-state'/'forex/open-signals.json' + disk.
 */

const fs = require('fs');
const path = require('path');
const forexKlines = require('./forexKlines');
const { getInstrument } = require('./forexInstruments');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'forex/open-signals.json';
const DISK_FILE = process.env.FOREX_OPEN_SIGNALS_FILE || path.join(__dirname, '..', '..', 'data', 'forex-open-signals.json');

const TF_ORDER = ['5m', '15m', '1h', '4h', '1d'];
const EXPIRE_SEC = { '5m': 3 * 3600, '15m': 6 * 3600, '1h': 18 * 3600, '4h': 2 * 86400, '1d': 4 * 86400 };

let state = { counters: {}, open: {}, version: 3 };
let loaded = false;
let saveTimer = null;

function nowSec() { return Math.floor(Date.now() / 1000); }
function sortTfs(tfs) { return [...new Set(tfs)].sort((a, b) => TF_ORDER.indexOf(a) - TF_ORDER.indexOf(b)); }
function openList() { return Object.values(state.open); }
function findPosition(id, dir) { return openList().find(p => p.instrumentId === id && p.direction === dir); }
function maxExpire(tfs) { return Math.max(...tfs.map(t => EXPIRE_SEC[t] || 86400)); }

// Eski (v1, TF başına kayıt) formatını v2'ye taşı; bozuk/uyumsuzları at.
function sanitizeOpen() {
  for (const code of Object.keys(state.open || {})) {
    const p = state.open[code];
    if (!p || !Array.isArray(p.tfs)) {
      if (p && typeof p.tf === 'string') { p.tfs = [p.tf]; if (p.mt5Symbol == null) p.mt5Symbol = p.instrumentId; delete p.tf; }
      else delete state.open[code];
    }
  }
}

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
        if (p && p.open) { state = { counters: p.counters || {}, open: p.open || {}, version: 3 }; got = true; }
      }
    } catch (_) {}
  }
  if (!got) {
    try { if (fs.existsSync(DISK_FILE)) { const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8')); if (p && p.open) state = { counters: p.counters || {}, open: p.open || {}, version: 3 }; } } catch (_) {}
  }
  sanitizeOpen();
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

// Parite-başına sinyal NO: 2 harf ön ek + 2 hane (BT01..BT99..BT100).
function nextCode(id) {
  state.counters = state.counters || {};
  state.counters[id] = (state.counters[id] || 0) + 1;
  const n = state.counters[id];
  const inst = getInstrument(id);
  const prefix = (inst && inst.prefix) || (id || 'XX').slice(0, 2).toUpperCase();
  return prefix + String(n).padStart(2, '0');
}

// İz süren stop/yönetim YALNIZ ≥4h pozisyonlarda yapılır (kullanıcı isteği:
// 5m/15m/1h'te trailing gürültüyle vuruluyor, uygun değil).
function isManageable(p) {
  return Array.isArray(p.tfs) && p.tfs.some(tf => tf === '4h' || tf === '1d');
}

// R-merdiveni: fiyat lehte kaç R ilerlediyse stop'u kilitle.
//   reachedR ≥1.5 → BE(0); ≥2 → +0.5R; ≥2.5 → +1R ... (1.5R geriden 0.5R adımlı)
// Eşik 1.5R: managed-backtest (≥4h, 8 parite) BE@1R'nin trend işlemlerinde
// beklentiyi düşürdüğünü, BE@1.5R'nin beklentiyi koruyup (0.229≈RAW 0.230)
// gerçek kâr koruması sağladığını gösterdi (BE@2R neredeyse hiç tetiklenmiyor).
function ladderLockR(reachedR) {
  if (reachedR < 1.5) return null; // +1.5R'ye gelmeden stop'a dokunma (orijinal kalır)
  return Math.max(0, Math.floor(reachedR * 2) / 2 - 1.5);
}

/**
 * Uygun (eşik üstü) sinyalleri pozisyonlara işle. Olay listesi döner:
 *   { type:'new'|'update', position, addedTfs, stopChanged, tpChanged, prev, reverseOf }
 */
async function syncPositions(eligible) {
  await load();
  const groups = new Map();
  for (const s of (eligible || [])) {
    const k = `${s.id}:${s.direction}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const events = [];
  for (const sigs of groups.values()) {
    sigs.sort((a, b) => b.confidence - a.confidence);
    const basis = sigs[0];
    const id = basis.id, dir = basis.direction, p = basis.precision ?? 4;
    const tfs = sortTfs(sigs.map(s => s.tf));
    const opp = dir === 'long' ? 'short' : 'long';
    const reverseOf = openList().filter(x => x.instrumentId === id && x.direction === opp).map(x => x.code);
    const existing = findPosition(id, dir);

    if (!existing) {
      const code = nextCode(id);
      const units = (basis.sizing && basis.entry && basis.stop) ? basis.sizing.riskUsd / Math.abs(basis.entry - basis.stop) : null;
      const pos = {
        code, instrumentId: id, symbol: basis.symbol, direction: dir, precision: p,
        entry: basis.entry, stop: basis.stop, target1: basis.target1, target2: basis.target2,
        tfs, confidence: basis.confidence, rr1: basis.rr1, rr2: basis.rr2,
        mt5Symbol: basis.mt5?.symbol || id,
        marginUsd: basis.sizing?.requiredMarginUsd ?? null, marginPct: basis.sizing?.marginPct ?? null, units,
        origStopDist: Math.abs(basis.entry - basis.stop),
        issuedAt: new Date().toISOString(), issueTimeSec: nowSec(), lastUpdateSec: nowSec(), stopSetSec: nowSec(),
      };
      state.open[code] = pos;
      events.push({ type: 'new', position: pos, addedTfs: tfs, reverseOf });
    } else {
      // Mevcut pozisyon: TF'leri SESSİZCE birleştir + güveni güncelle. Stop/TP
      // DEĞİŞMEZ — seviye yönetimi manageOpenPositions (R-merdiveni, ≥4h) işidir.
      const newTfs = tfs.filter(t => !existing.tfs.includes(t));
      if (newTfs.length || basis.confidence > existing.confidence) {
        existing.tfs = sortTfs([...existing.tfs, ...tfs]);
        existing.confidence = Math.max(existing.confidence, basis.confidence);
        existing.lastUpdateSec = nowSec();
        persist();
      }
    }
  }
  if (events.length) persist();
  return events;
}

// Tek pozisyonun kapanış kontrolü (iz-sürmüş stop/TP1, 5m mumlar)
async function evalOne(p) {
  const inst = getInstrument(p.instrumentId);
  if (!inst) return null;
  const candles = await forexKlines.fetchCandles(inst.yahoo, '5m', 300);
  const isLong = p.direction === 'long';
  // Stop, YALNIZ o seviye konduktan sonraki mumlarla değerlendirilir (iz süren
  // stop yukarı kayınca eski geri-çekilmeler geriye dönük "stop" tetiklemesin).
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
  if (!outcome && nowSec() - p.issueTimeSec > maxExpire(p.tfs)) {
    outcome = 'EXPIRE';
    exit = candles && candles.length ? candles[candles.length - 1].close : p.entry;
  }
  if (!outcome) return null;
  const dir = isLong ? 1 : -1;
  const pnlPct = +(((exit - p.entry) / p.entry) * 100 * dir).toFixed(3);
  const pnlUsd = p.units != null ? +(p.units * (exit - p.entry) * dir).toFixed(2) : null;
  return { code: p.code, instrumentId: p.instrumentId, symbol: p.symbol, direction: p.direction, tfs: p.tfs, precision: p.precision, entry: p.entry, exit, outcome, pnlPct, pnlUsd, issuedAt: p.issuedAt };
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

// R-merdiveni yönetimi — YALNIZ ≥4h pozisyonlar. Fiyatın lehte ulaştığı en
// yüksek R'ye göre stop'u kademeli yukarı kilitler (BE → +0.5R → +1R ...).
// Stop kademe değiştirdiğinde olay döndürür (aynı NO ile "güncelleme" mesajı).
async function manageOpenPositions() {
  await load();
  const events = [];
  for (const p of openList()) {
    if (!isManageable(p)) continue;
    const R = p.origStopDist;
    if (!(R > 0)) continue;
    const inst = getInstrument(p.instrumentId);
    if (!inst) continue;
    let candles;
    try { candles = await forexKlines.fetchCandles(inst.yahoo, '5m', 300); } catch (_) { continue; }
    if (!candles || !candles.length) continue;
    const since = candles.filter(c => c.time > p.issueTimeSec);
    if (!since.length) continue;
    const isLong = p.direction === 'long';
    const mfe = isLong ? Math.max(...since.map(c => c.high)) : Math.min(...since.map(c => c.low)); // en iyi lehte hareket
    const reachedR = isLong ? (mfe - p.entry) / R : (p.entry - mfe) / R;
    const lockR = ladderLockR(reachedR);
    if (lockR == null) continue;
    const rnd = (v) => +Number(v).toFixed(p.precision ?? 4);
    const newSL = rnd(isLong ? p.entry + lockR * R : p.entry - lockR * R);
    const better = isLong ? newSL > p.stop : newSL < p.stop; // sadece lehe ratchet
    if (!better) continue;
    const prevStop = p.stop;
    p.stop = newSL; p.stopSetSec = nowSec(); p.mgmtLockR = lockR; p.lastUpdateSec = nowSec();
    events.push({ position: p, prevStop, lockR, reachedR: +reachedR.toFixed(2), stage: lockR === 0 ? 'BE' : `+${lockR}R` });
  }
  if (events.length) persist();
  return events;
}

function getOpen() { return openList(); }

// ── Test kancaları (golden testler için; üretimde kullanılmaz) ───────────────
function __resetForTest() { state = { counters: {}, open: {}, version: 3 }; loaded = true; if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } }

module.exports = { load, syncPositions, manageOpenPositions, checkClosures, getOpen, nextCode, ladderLockR, isManageable, __resetForTest };
