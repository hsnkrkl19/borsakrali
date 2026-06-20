/**
 * proSignalLog — YENİ ROBOT ayrıntılı adli (forensic) per-sinyal log.
 *
 * Her sinyal emit edildiğinde tüm karar bağlamı (oylar, koşullar, seviyeler,
 * backtest kalibrasyonu, kapı kararı) kaydedilir; kapanışta aynı kod ile sonuç
 * (outcome) yamanır. "Sinyal neden geldi / nasıl kapandı" sorularını cevaplar.
 *
 * Kalıcılık: disk data/pro-signals/signal-log.json + Supabase 'bot-state'/
 * 'pro-signals/signal-log.json' (botPersistence.save ile, debounce'lu mirror).
 * Bellekte son 500 kayıt tutulur (yeni→eski erişim için list/get).
 *
 * NOT: botPersistence whitelist'ine 'pro-signals' alt-dizini başka biri tarafından
 * eklenecek; save() yine de çağrılır (whitelist eklenince mirror aktif olur, o
 * zamana kadar disk kalıcılığı yeterli, save() sessizce no-op döner).
 */
const fs = require('fs');
const path = require('path');
const botPersistence = require('../botPersistence');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUBDIR = 'pro-signals';
const FILENAME = 'signal-log.json';
const SUPA_KEY = `${SUBDIR}/${FILENAME}`;
const DISK_FILE = path.join(__dirname, '..', '..', 'data', SUBDIR, FILENAME);
const CAP = 500;

let records = [];
let loaded = false;

function persist() {
  // Disk (her zaman) + Supabase mirror (botPersistence debounce'lu write-through).
  try {
    const dir = path.dirname(DISK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISK_FILE, JSON.stringify(records, null, 2), 'utf8');
  } catch (_) {}
  try { botPersistence.save(SUBDIR, FILENAME, records); } catch (_) {}
}

function applyCap() { if (records.length > CAP) records = records.slice(-CAP); }

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
        if (Array.isArray(p)) { records = p; got = true; }
      }
    } catch (_) {}
  }
  if (!got) {
    try { if (fs.existsSync(DISK_FILE)) { const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8')); if (Array.isArray(p)) records = p; } } catch (_) {}
  }
  applyCap();
}

/**
 * Sinyal emit anında çağrılır. record şekli:
 *   { code, ts, instrumentId, symbol, direction, tfs:[], confidence, rawConfidence,
 *     calibratedDelta, votes:[{technique,vote,score,weight}], conditions:[],
 *     levels:{entry,stop,target1,target2,rr1,rr2},
 *     backtest:{winRate,profitFactor,expectancy,sampleSize,band},
 *     gate:{passed,reasons:[]}, outcome:null }
 * Saklanan kaydı döndürür.
 */
function append(record) {
  const rec = {
    code: record.code,
    ts: record.ts || new Date().toISOString(),
    instrumentId: record.instrumentId,
    symbol: record.symbol,
    direction: record.direction,
    tfs: Array.isArray(record.tfs) ? [...record.tfs] : [],
    confidence: record.confidence,
    rawConfidence: record.rawConfidence,
    calibratedDelta: record.calibratedDelta,
    votes: Array.isArray(record.votes) ? record.votes.map(v => ({ ...v })) : [],
    conditions: Array.isArray(record.conditions) ? [...record.conditions] : [],
    levels: record.levels ? { ...record.levels } : null,
    backtest: record.backtest ? { ...record.backtest } : null,
    gate: record.gate ? { passed: record.gate.passed, reasons: Array.isArray(record.gate.reasons) ? [...record.gate.reasons] : [] } : null,
    outcome: record.outcome != null ? record.outcome : null,
  };
  records.push(rec);
  applyCap();
  persist();
  return rec;
}

/**
 * Kapanışta sonucu yamar. outcome:
 *   { result:'TP1'|'SL'|'TRAIL'|'EXPIRE', exit, pnlPct, pnlUsd, closedAt }
 * Eşleşen kod + outcome==null olan EN SON kaydı bulur. Bulduysa true döner.
 */
function patchOutcome(code, outcome) {
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].code === code && records[i].outcome == null) {
      records[i].outcome = {
        result: outcome?.result,
        exit: outcome?.exit,
        pnlPct: outcome?.pnlPct,
        pnlUsd: outcome?.pnlUsd != null ? outcome.pnlUsd : null,
        closedAt: outcome?.closedAt || new Date().toISOString(),
      };
      persist();
      return true;
    }
  }
  return false;
}

// Yeni→eski sıralı liste; opsiyonel enstrüman filtresi + limit.
function list({ limit = 100, instrument = null } = {}) {
  let arr = records;
  if (instrument) {
    const id = String(instrument).toUpperCase();
    arr = arr.filter(r => (r.instrumentId || '').toUpperCase() === id);
  }
  const reversed = [...arr].reverse();
  return limit != null ? reversed.slice(0, limit) : reversed;
}

// Bir kod için EN SON kayıt (yeni→eski).
function get(code) {
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].code === code) return records[i];
  }
  return null;
}

// ── Test kancası (golden testler için; üretimde kullanılmaz) ─────────────────
function __resetForTest() { records = []; loaded = true; }

module.exports = { load, append, patchOutcome, list, get, __resetForTest };
