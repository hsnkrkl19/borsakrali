/**
 * TEMA34 Scanner Store — çok-zaman-dilimli (4h + 1d) TEMA34 bildirimcisinin durum
 * deposu.
 *
 * Tek dosya (data/tema34-scanner/runs.json):
 *   { lastBar: { '4h': <barKey>, '1d': <barKey> }, lastResult, history: [...son N] }
 * lastBar idempotluk içindir: HER zaman dilimi için ayrı işlenmiş-bar işareti
 * tutulur → aynı 4h barı / aynı günlük mum iki kez bildirilmez (deploy/restart
 * sonrası da tekrar atmasın diye Supabase'e write-through). barKey: 1d → tarih
 * (YYYY-MM-DD); 4h → son bar ISO zamanı.
 *
 * botPersistence ile 'tema34-scanner/runs.json' Supabase Storage'a yedeklenir;
 * Supabase kapalıysa (yerel) sessizce yalnız-yerel çalışır.
 */

const fs = require('fs');
const path = require('path');
const botPersistence = require('../botPersistence');

const SUBDIR = 'tema34-scanner';
const FILENAME = 'runs.json';
const HISTORY_LIMIT = 60;
const DATA_ROOT = process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DIR = path.join(DATA_ROOT, SUBDIR);
const FILE = path.join(DIR, FILENAME);

function emptyState() {
  return { lastBar: {}, lastResult: null, history: [] };
}

function read() {
  try {
    if (!fs.existsSync(FILE)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return {
      lastBar: parsed?.lastBar && typeof parsed.lastBar === 'object' ? parsed.lastBar : {},
      lastResult: parsed?.lastResult || null,
      history: Array.isArray(parsed?.history) ? parsed.history.slice(-HISTORY_LIMIT) : [],
    };
  } catch (e) {
    console.error('[TEMA34Scanner] state okuma hatası:', e.message);
    return emptyState();
  }
}

function write(state) {
  const safe = {
    lastBar: state?.lastBar && typeof state.lastBar === 'object' ? state.lastBar : {},
    lastResult: state?.lastResult || null,
    history: Array.isArray(state?.history) ? state.history.slice(-HISTORY_LIMIT) : [],
  };
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(safe, null, 2), 'utf8');
  } catch (e) {
    console.error('[TEMA34Scanner] state yazma hatası:', e.message);
  }
  // Supabase write-through (debounce'lu, kapalıysa no-op)
  try { botPersistence.save(SUBDIR, FILENAME, safe); } catch (_) { /* sessiz */ }
  return safe;
}

// Bir turun özetini geçmişe + lastResult'a ekle. lastBar'a DOKUNMAZ
// (idempotluk işareti ayrı: markBar). Böylece push kapalıyken (disabled)
// kaydedilen tur, bar yeniden açıldığında bildirimi engellemez.
function recordRun(summary) {
  const state = read();
  state.lastResult = summary;
  state.history = [...(state.history || []), summary].slice(-HISTORY_LIMIT);
  return write(state);
}

// Bu zaman diliminin verili barının işlendiğini işaretle → aynı bar tekrar bildirilmez.
function markBar(tf, barKey) {
  if (!tf || !barKey) return read();
  const state = read();
  state.lastBar = { ...(state.lastBar || {}), [tf]: barKey };
  return write(state);
}

function getLastBar(tf) { return read().lastBar?.[tf] || null; }
function getLastResult() { return read().lastResult; }
function listRuns(limit = 30) {
  return read().history.slice().reverse().slice(0, Math.min(HISTORY_LIMIT, Math.max(1, limit)));
}

function reset() {
  write(emptyState());
  return { ok: true, reset: true };
}

module.exports = { read, recordRun, markBar, getLastBar, getLastResult, listRuns, reset, SUBDIR, FILENAME };
