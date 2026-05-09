/**
 * Snapshot Store — Borsa Krali
 *
 * Günlük sinyal anlık görüntülerini disk üzerinde JSON olarak tutar.
 * Her gün için tek dosya: backend/src/data/signals/YYYY-MM-DD.json
 *
 * Format:
 * {
 *   date: '2026-05-09',
 *   premarket: { generatedAt, signals: [...] },
 *   revision:  { generatedAt, signals: [...], diff: [...] },
 *   intraday:  [{ generatedAt, signals: [...], diff: [...] }, ...]
 * }
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOT_DIR = path.join(__dirname, '..', 'data', 'signals');

function ensureDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

function dateKey(d = new Date()) {
  // Türkiye saat dilimine göre tarih (UTC+3, BIST takvimi)
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
    console.error(`[SnapshotStore] Bozuk dosya: ${fp}`, e.message);
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
    if (existing.intraday.length > 12) existing.intraday = existing.intraday.slice(-12);
  } else {
    existing[phase] = data;
  }
  return write(date, existing);
}

function listAvailableDates(limit = 30) {
  ensureDir();
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

module.exports = {
  read,
  write,
  setPhase,
  listAvailableDates,
  getLatest,
  dateKey,
  SNAPSHOT_DIR,
};
