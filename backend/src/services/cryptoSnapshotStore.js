/**
 * Crypto Snapshot Store — Borsa Krali
 *
 * Günlük kripto sinyal anlık görüntülerini disk üzerinde JSON olarak tutar.
 * Her gün için tek dosya: backend/src/data/crypto-signals/YYYY-MM-DD.json
 *
 * Format:
 * {
 *   date: '2026-05-10',
 *   morning:  { generatedAt, spot_long, futures_long, futures_short },
 *   midday:   { ... },
 *   evening:  { ... },
 *   night:    { ... },
 *   intraday: [{ generatedAt, spot_long, futures_long, futures_short }, ...]
 * }
 *
 * snapshotStore ile aynı API yüzeyi — read/write/setPhase/listAvailableDates/getLatest.
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOT_DIR = path.join(__dirname, '..', 'data', 'crypto-signals');

const PHASE_NAMES = ['morning', 'midday', 'evening', 'night'];

function ensureDir() {
  try {
    if (!fs.existsSync(SNAPSHOT_DIR)) {
      fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    }
  } catch (e) {
    console.warn(`[CryptoSnapshotStore] ensureDir hatası: ${e.message}`);
  }
}

function dateKey(d = new Date()) {
  // Türkiye saat dilimine göre tarih (UTC+3)
  const tz = new Date(d.getTime() + 3 * 3600 * 1000);
  return tz.toISOString().slice(0, 10);
}

function filePath(date) {
  return path.join(SNAPSHOT_DIR, `${date}.json`);
}

function read(date) {
  ensureDir();
  const fp = filePath(date);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    console.error(`[CryptoSnapshotStore] Bozuk dosya: ${fp}`, e.message);
    return null;
  }
}

function write(date, data) {
  ensureDir();
  const fp = filePath(date);
  const payload = { ...(read(date) || { date }), ...data };
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function setPhase(date, phase, data) {
  const existing = read(date) || { date };
  if (phase === 'intraday') {
    existing.intraday = existing.intraday || [];
    existing.intraday.push(data);
    if (existing.intraday.length > 24) existing.intraday = existing.intraday.slice(-24);
  } else {
    existing[phase] = data;
  }
  return write(date, existing);
}

function listAvailableDates(limit = 30) {
  ensureDir();
  if (!fs.existsSync(SNAPSHOT_DIR)) return [];
  const files = fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => f.slice(0, -5))
    .sort()
    .reverse()
    .slice(0, limit);
  return files;
}

function getLatest() {
  const dates = listAvailableDates(1);
  return dates[0] ? read(dates[0]) : null;
}

// En güncel faz: gün içi varsa son intraday, yoksa son ana faz, yoksa premarket
function getCurrentPhase(snapshot) {
  if (!snapshot) return null;
  // Önce intraday'in son elemanı (en taze sessiz refresh)
  if (Array.isArray(snapshot.intraday) && snapshot.intraday.length > 0) {
    const last = snapshot.intraday[snapshot.intraday.length - 1];
    return { phase: 'intraday', ...last };
  }
  // Sonra son ana faz (night > evening > midday > morning sırası tersine — en son hangi vardiya yapıldı)
  for (const p of ['night', 'evening', 'midday', 'morning']) {
    if (snapshot[p]) return { phase: p, ...snapshot[p] };
  }
  return null;
}

module.exports = {
  read,
  write,
  setPhase,
  listAvailableDates,
  getLatest,
  getCurrentPhase,
  dateKey,
  PHASE_NAMES,
  SNAPSHOT_DIR,
};
