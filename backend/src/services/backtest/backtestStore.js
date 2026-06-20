/**
 * Backtest — Çalıştırma kayıt deposu (yalnız yerel JSON)
 *
 * Backtest sonuçları yeniden-üretilebilir ARAŞTIRMA çıktılarıdır (gerçek para
 * state'i değil) → sade yerel kalıcılık yeterli. Her çalıştırma kendi dosyasında
 * (`data/backtests/<id>.json`), özet indeksi `index.json`'da tutulur.
 *
 * NOT: Render efemer disk'inde redeploy'da silinir — backtest'ler her an yeniden
 * koşulabildiği için kabul edilebilir. (Supabase write-through ileride eklenebilir;
 * botPersistence allowlist'i 'backtests' alt-dizinini henüz tanımıyor.)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_ROOT = process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DIR = path.join(DATA_ROOT, 'backtests');
const INDEX_FILE = path.join(DIR, 'index.json');
const MAX_RUNS = 60;   // en eski koşular taşınca düşer

function ensureDir() { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); }
function newId() { return crypto.randomBytes(5).toString('hex'); }
function nowISO() { return new Date().toISOString(); }
function runFile(id) { return path.join(DIR, `${id}.json`); }

function readIndex() {
  ensureDir();
  if (!fs.existsSync(INDEX_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('[BacktestStore] index.json bozuk:', e.message);
    return [];
  }
}

function writeIndex(list) {
  ensureDir();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2), 'utf8');
}

// Çalıştırmanın indeks özeti (liste görünümü için hafif)
function toSummary(run) {
  return {
    id: run.id,
    botId: run.botId || null,
    botName: run.botName || null,
    strategyId: run.strategyId,
    strategyLabel: run.strategyLabel,
    mode: run.mode,
    symbols: run.symbols,
    range: run.range,
    period: run.period,
    createdAt: run.createdAt,
    totalReturnPct: run.metrics?.totalReturnPct ?? null,
    maxDrawdownPct: run.metrics?.maxDrawdownPct ?? null,
    winRate: run.metrics?.winRate ?? null,
    totalTrades: run.metrics?.totalTrades ?? null,
  };
}

/** Yeni çalıştırmayı kaydeder; id atar; eski koşuları MAX_RUNS'a budar. */
function saveRun(run) {
  ensureDir();
  const id = run.id || newId();
  const record = { ...run, id, createdAt: run.createdAt || nowISO() };
  try {
    fs.writeFileSync(runFile(id), JSON.stringify(record, null, 2), 'utf8');
  } catch (e) {
    console.error('[BacktestStore] kayıt yazılamadı:', e.message);
  }

  let index = readIndex();
  index = index.filter(r => r.id !== id);
  index.push(toSummary(record));
  // En yeniden eskiye sırala, MAX_RUNS'ı aş → en eskiyi sil (dosyayı da)
  index.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  while (index.length > MAX_RUNS) {
    const dropped = index.pop();
    try { if (dropped && fs.existsSync(runFile(dropped.id))) fs.unlinkSync(runFile(dropped.id)); } catch (_) {}
  }
  writeIndex(index);
  return record;
}

/** Özet listesi (opsiyonel botId filtresi). En yeni en başta. */
function listRuns({ botId = null, limit = 30 } = {}) {
  let index = readIndex().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (botId) index = index.filter(r => r.botId === botId);
  return index.slice(0, Math.min(limit, MAX_RUNS));
}

/** Tam çalıştırma kaydı (equity eğrisi + işlemler dahil). */
function getRun(id) {
  ensureDir();
  if (!fs.existsSync(runFile(id))) return null;
  try {
    return JSON.parse(fs.readFileSync(runFile(id), 'utf8'));
  } catch (e) {
    console.error('[BacktestStore] kayıt okunamadı:', e.message);
    return null;
  }
}

function deleteRun(id) {
  let index = readIndex();
  const existed = index.some(r => r.id === id) || fs.existsSync(runFile(id));
  index = index.filter(r => r.id !== id);
  writeIndex(index);
  try { if (fs.existsSync(runFile(id))) fs.unlinkSync(runFile(id)); } catch (_) {}
  return existed;
}

module.exports = { saveRun, listRuns, getRun, deleteRun, MAX_RUNS };
