/**
 * BIST AL Scanner Store — "≥80 kaliteli AL" tam-BIST taramasının durum deposu.
 *
 * Tek dosya (data/bist-al-scanner/runs.json):
 *   { tradingDate, sentSymbols: [...], lastResult, history: [...son N tur] }
 *
 * Dedup mantığı (saatlik kadans için): aynı işlem gününde (tradingDate) bir hisse
 * YALNIZ BİR KEZ gönderilir. Gün değişince sentSymbols sıfırlanır → ertesi gün
 * aynı hisse yeniden nitelenirse tekrar gönderilebilir. Böylece saatte bir
 * tarayıp yalnız o gün HENÜZ gönderilmemiş yeni AL sinyallerini yayınlarız
 * (her saat aynı listeyi tekrar atmaz). Restart/deploy sonrası da tekrar atmaz:
 * botPersistence ile 'bist-al-scanner/runs.json' Supabase'e write-through edilir.
 *
 * Ana kanal BIST sinyal bildirimcisinden (bistSignalTracker) BAĞIMSIZ ayrı state
 * → kendi (yeni) Telegram kanalı için ayrı dedup.
 */

const fs = require('fs');
const path = require('path');
const botPersistence = require('../botPersistence');

const SUBDIR = 'bist-al-scanner';
const FILENAME = 'runs.json';
const HISTORY_LIMIT = 60;
const DATA_ROOT = process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DIR = path.join(DATA_ROOT, SUBDIR);
const FILE = path.join(DIR, FILENAME);

function emptyState() {
  return { tradingDate: null, sentSymbols: [], lastResult: null, history: [] };
}

function read() {
  try {
    if (!fs.existsSync(FILE)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return {
      tradingDate: parsed?.tradingDate || null,
      sentSymbols: Array.isArray(parsed?.sentSymbols) ? parsed.sentSymbols : [],
      lastResult: parsed?.lastResult || null,
      history: Array.isArray(parsed?.history) ? parsed.history.slice(-HISTORY_LIMIT) : [],
    };
  } catch (e) {
    console.error('[BistAlScanner] state okuma hatası:', e.message);
    return emptyState();
  }
}

function write(state) {
  const safe = {
    tradingDate: state?.tradingDate || null,
    sentSymbols: Array.isArray(state?.sentSymbols) ? state.sentSymbols : [],
    lastResult: state?.lastResult || null,
    history: Array.isArray(state?.history) ? state.history.slice(-HISTORY_LIMIT) : [],
  };
  try {
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(safe, null, 2), 'utf8');
  } catch (e) {
    console.error('[BistAlScanner] state yazma hatası:', e.message);
  }
  try { botPersistence.save(SUBDIR, FILENAME, safe); } catch (_) { /* sessiz */ }
  return safe;
}

// Bu işlem günü için zaten gönderilmiş sembollerin Set'i. tradingDate değişmişse
// (yeni gün) boş döner → günün ilk turunda hepsi yeniden gönderilebilir.
function sentSetFor(tradingDate) {
  const state = read();
  if (!tradingDate || state.tradingDate !== tradingDate) return new Set();
  return new Set(state.sentSymbols);
}

// Gönderilen sembolleri bu işlem gününe ekle. Gün değişmişse listeyi sıfırlar.
function markSent(tradingDate, symbols) {
  const state = read();
  if (state.tradingDate !== tradingDate) {
    state.tradingDate = tradingDate;
    state.sentSymbols = [];
  }
  const set = new Set(state.sentSymbols);
  for (const s of (symbols || [])) set.add(s);
  state.sentSymbols = [...set];
  return write(state);
}

// Bir turun özetini geçmişe + lastResult'a ekle. sentSymbols'a DOKUNMAZ.
function recordRun(summary) {
  const state = read();
  state.lastResult = summary;
  state.history = [...(state.history || []), summary].slice(-HISTORY_LIMIT);
  return write(state);
}

function getTradingDate() { return read().tradingDate; }
function getSentSymbols() { return read().sentSymbols; }
function getLastResult() { return read().lastResult; }
function listRuns(limit = 30) {
  return read().history.slice().reverse().slice(0, Math.min(HISTORY_LIMIT, Math.max(1, limit)));
}

function reset() {
  write(emptyState());
  return { ok: true, reset: true };
}

module.exports = {
  read, recordRun, sentSetFor, markSent,
  getTradingDate, getSentSymbols, getLastResult, listRuns, reset,
  SUBDIR, FILENAME,
};
