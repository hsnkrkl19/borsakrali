/**
 * MTF Snapshot Store — Borsa Krali (Multi-Timeframe)
 *
 * Çoklu zaman dilimi sinyallerini disk + bellek karması olarak tutar.
 * Frequencies:
 *   - 1h, 4h, 1d, 1w taramaları için ayrı snapshot
 *   - Tarih: backend/src/data/crypto-mtf/YYYY-MM-DD.json
 *   - Confluence: tüm TF'lerin ağırlıklı toplamından çıkan özet
 *
 * Format:
 * {
 *   date: '2026-05-10',
 *   timeframes: {
 *     '1h': { generatedAt, scanner: { signals, allSignals } },
 *     '4h': { ... },
 *     '1d': { ... },
 *     '1w': { ... },
 *   },
 *   confluence: { generatedAt, top: [...] },  // ağırlıklı multi-TF özet
 * }
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOT_DIR = path.join(__dirname, '..', 'data', 'crypto-mtf');
const SUPPORTED_TFS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

function ensureDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

function dateKey(d = new Date()) {
  // UTC+3 (Türkiye)
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
    console.error(`[MTFSnapshotStore] Bozuk dosya: ${fp}`, e.message);
    return null;
  }
}

function write(date, data) {
  ensureDir();
  const fp = filePath(date);
  const existing = read(date) || { date, timeframes: {} };
  const payload = {
    ...existing,
    ...data,
    timeframes: { ...(existing.timeframes || {}), ...(data.timeframes || {}) },
  };
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function setTimeframe(date, tf, blockData) {
  if (!SUPPORTED_TFS.includes(tf)) throw new Error(`Desteklenmeyen TF: ${tf}`);
  const existing = read(date) || { date, timeframes: {} };
  existing.timeframes = existing.timeframes || {};
  existing.timeframes[tf] = blockData;
  return write(date, existing);
}

function setConfluence(date, confluenceData) {
  const existing = read(date) || { date, timeframes: {} };
  existing.confluence = confluenceData;
  return write(date, existing);
}

function getTimeframe(date, tf) {
  const snap = read(date);
  return snap?.timeframes?.[tf] || null;
}

function getLatestTimeframe(tf) {
  const dates = listAvailableDates(7);
  for (const d of dates) {
    const block = getTimeframe(d, tf);
    if (block) return { date: d, ...block };
  }
  return null;
}

function listAvailableDates(limit = 30) {
  ensureDir();
  if (!fs.existsSync(SNAPSHOT_DIR)) return [];
  return fs.readdirSync(SNAPSHOT_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => f.slice(0, -5))
    .sort()
    .reverse()
    .slice(0, limit);
}

function getLatest() {
  const dates = listAvailableDates(1);
  return dates[0] ? read(dates[0]) : null;
}

module.exports = {
  read,
  write,
  setTimeframe,
  setConfluence,
  getTimeframe,
  getLatestTimeframe,
  listAvailableDates,
  getLatest,
  dateKey,
  SNAPSHOT_DIR,
  SUPPORTED_TFS,
};
