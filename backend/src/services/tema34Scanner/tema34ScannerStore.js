/**
 * TEMA34 Scanner Store — yalnız-TEMA34 günlük kırılım bildirimcisinin durum deposu.
 *
 * Tek dosya (data/tema34-scanner/runs.json) tutar:
 *   { lastCandleDate, lastResult, history: [...son N tur özeti] }
 * lastCandleDate idempotluk içindir: aynı işlem günü için mükerrer bildirim atılmaz
 * (deploy/restart sonrası da tekrar göndermesin diye Supabase'e write-through).
 *
 * botPersistence ile 'tema34-scanner/runs.json' Supabase Storage'a yedeklenir;
 * Supabase kapalıysa (yerel) sessizce yalnız-yerel çalışır. Bu modül, ana kanala
 * giden crossover bildirimcisinden (crossoverStore) BAĞIMSIZ ayrı bir state tutar
 * → kendi (yeni) Telegram kanalı için ayrı dedup.
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
  return { lastCandleDate: null, lastResult: null, history: [] };
}

function read() {
  try {
    if (!fs.existsSync(FILE)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return {
      lastCandleDate: parsed?.lastCandleDate || null,
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
    lastCandleDate: state?.lastCandleDate || null,
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

// Bir turun özetini geçmişe + lastResult'a ekle. lastCandleDate'e DOKUNMAZ
// (idempotluk işareti ayrı: markNotified). Böylece push kapalıyken (disabled)
// kaydedilen tur, gün yeniden açıldığında bildirimi engellemez.
function recordRun(summary) {
  const state = read();
  state.lastResult = summary;
  state.history = [...(state.history || []), summary].slice(-HISTORY_LIMIT);
  return write(state);
}

// Bu işlem gününün işlendiğini işaretle → aynı gün mükerrer bildirim atılmaz.
function markNotified(candleDate) {
  if (!candleDate) return read();
  const state = read();
  state.lastCandleDate = candleDate;
  return write(state);
}

function getLastCandleDate() { return read().lastCandleDate; }
function getLastResult() { return read().lastResult; }
function listRuns(limit = 30) {
  return read().history.slice().reverse().slice(0, Math.min(HISTORY_LIMIT, Math.max(1, limit)));
}

function reset() {
  write(emptyState());
  return { ok: true, reset: true };
}

module.exports = { read, recordRun, markNotified, getLastCandleDate, getLastResult, listRuns, reset, SUBDIR, FILENAME };
