/**
 * forexSignalTracker — Sinyal NO + yaşam döngüsü takibi (Borsa Krali)
 *
 * - Her gönderilen sinyale benzersiz kod verir: "NNNX" (3 rakam + 1 harf, ör. 074A).
 *   Mesajlarda "parite · #074A" şeklinde gösterilir.
 * - Açık sinyalleri tutar; her dk fiyatla karşılaştırıp TP1/SL/SÜRE kapanışını
 *   tespit eder ve AYNI kodla teyit/kapanış olayı döndürür.
 * - Ters sinyal (aynı paritede zıt yönde açık sinyal) ve aynı paritede çoklu
 *   açık sinyal durumunu bildirir.
 *
 * Kalıcılık: Supabase Storage 'bot-state' bucket → 'forex/open-signals.json'
 * (Render diski uçucu). Supabase yoksa yalnız-bellek/disk; cron'u asla kırmaz.
 */

const fs = require('fs');
const path = require('path');
const forexKlines = require('./forexKlines');
const { getInstrument } = require('./forexInstruments');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'forex/open-signals.json';
const DISK_FILE = path.join(__dirname, '..', '..', 'data', 'forex-open-signals.json');

// Kapanış kontrolü için TF'ye göre "süre doldu" eşiği (saniye)
const EXPIRE_SEC = { '5m': 3 * 3600, '15m': 6 * 3600, '1h': 18 * 3600, '4h': 2 * 86400, '1d': 4 * 86400 };

let state = { counter: 0, open: {}, version: 1 };
let loaded = false;
let saveTimer = null;

function nowSec() { return Math.floor(Date.now() / 1000); }

async function load() {
  if (loaded) return;
  loaded = true;
  // Önce Supabase
  if (supaEnabled && supaEnabled()) {
    try {
      const { data } = await supa.storage.from(BUCKET).download(SUPA_KEY);
      if (data) {
        const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
        const parsed = JSON.parse(text);
        if (parsed && parsed.open) { state = { counter: parsed.counter || 0, open: parsed.open || {}, version: 1 }; return; }
      }
    } catch (_) { /* yok/erişilemedi */ }
  }
  // Disk fallback
  try { if (fs.existsSync(DISK_FILE)) { const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8')); if (p && p.open) state = { counter: p.counter || 0, open: p.open || {}, version: 1 }; } } catch (_) {}
}

function persist() {
  // Disk (anında)
  try {
    const dir = path.dirname(DISK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISK_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
  // Supabase (debounce)
  if (supaEnabled && supaEnabled()) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const body = Buffer.from(JSON.stringify(state), 'utf8');
        await supa.storage.from(BUCKET).upload(SUPA_KEY, body, { contentType: 'application/json', upsert: true });
      } catch (_) {}
    }, 2500);
    if (saveTimer.unref) saveTimer.unref();
  }
}

function nextCode() {
  state.counter = (state.counter || 0) + 1;
  const n = state.counter;
  const digits = String(n % 1000).padStart(3, '0');
  const letter = String.fromCharCode(65 + Math.floor(n / 1000) % 26);
  return digits + letter; // 074A
}

function openList() { return Object.values(state.open); }

/**
 * Yeni sinyali kaydet (push edilirken çağrılır). Aynı (id,tf,yön) zaten açıksa
 * mevcut kodu döner (tekrar açmaz). Ters/çoklu bayraklarını hesaplar.
 */
async function register(sig) {
  await load();
  const opp = sig.direction === 'long' ? 'short' : 'long';

  // Aynı (enstrüman, TF, yön) zaten açık mı?
  const existing = openList().find(o => o.instrumentId === sig.id && o.tf === sig.tf && o.direction === sig.direction);
  // Ters: aynı enstrümanda zıt yönde açık sinyal(ler)
  const reverseOf = openList().filter(o => o.instrumentId === sig.id && o.direction === opp).map(o => o.code);
  // Aynı paritede şu an açık toplam (bu dahil)
  const samePairTFs = openList().filter(o => o.instrumentId === sig.id);

  if (existing) {
    return { code: existing.code, isNew: false, reverseOf, samePairCount: samePairTFs.length, samePairTFs: samePairTFs.map(o => `${o.tf} ${o.direction === 'long' ? 'AL' : 'SAT'}`) };
  }

  const code = nextCode();
  const units = (sig.sizing && sig.entry && sig.stop) ? (sig.sizing.riskUsd / Math.abs(sig.entry - sig.stop)) : null;
  state.open[code] = {
    code,
    instrumentId: sig.id, symbol: sig.symbol, tf: sig.tf, direction: sig.direction,
    entry: sig.entry, stop: sig.stop, target1: sig.target1, target2: sig.target2,
    confidence: sig.confidence, precision: sig.precision,
    riskUsd: sig.sizing?.riskUsd ?? null, tp1ProfitUsd: sig.pnl?.tp1ProfitUsd ?? null, tp2ProfitUsd: sig.pnl?.tp2ProfitUsd ?? null,
    units,
    issuedAt: new Date().toISOString(), issueTimeSec: nowSec(),
  };
  persist();
  const after = openList().filter(o => o.instrumentId === sig.id);
  return { code, isNew: true, reverseOf, samePairCount: after.length, samePairTFs: after.filter(o => o.code !== code).map(o => `${o.tf} ${o.direction === 'long' ? 'AL' : 'SAT'}`) };
}

// Tek açık sinyalin kapanışını 5m mumlarla kontrol et
async function evalOne(rec) {
  const inst = getInstrument(rec.instrumentId);
  if (!inst) return null;
  const candles = await forexKlines.fetchCandles(inst.yahoo, '5m', 300);
  const isLong = rec.direction === 'long';
  let outcome = null, exit = null;
  if (candles && candles.length) {
    const bars = candles.filter(c => c.time > rec.issueTimeSec);
    for (const b of bars) {
      const slHit = isLong ? b.low <= rec.stop : b.high >= rec.stop;
      const tpHit = isLong ? b.high >= rec.target1 : b.low <= rec.target1;
      if (slHit) { outcome = 'SL'; exit = rec.stop; break; }
      if (tpHit) { outcome = 'TP1'; exit = rec.target1; break; }
    }
  }
  if (!outcome) {
    const exp = EXPIRE_SEC[rec.tf] || 86400;
    if (nowSec() - rec.issueTimeSec > exp) {
      outcome = 'EXPIRE';
      const last = candles && candles.length ? candles[candles.length - 1].close : rec.entry;
      exit = last;
    }
  }
  if (!outcome) return null;
  const dir = isLong ? 1 : -1;
  const pnlPct = +(((exit - rec.entry) / rec.entry) * 100 * dir).toFixed(3);
  let pnlUsd = null;
  if (outcome === 'TP1' && rec.tp1ProfitUsd != null) pnlUsd = rec.tp1ProfitUsd;
  else if (outcome === 'SL' && rec.riskUsd != null) pnlUsd = -rec.riskUsd;
  else if (rec.units != null) pnlUsd = +(rec.units * (exit - rec.entry) * dir).toFixed(2);
  return { ...rec, outcome, exit, pnlPct, pnlUsd };
}

/** Tüm açık sinyalleri kontrol et; kapananları döndür ve listeden çıkar. */
async function checkClosures() {
  await load();
  const events = [];
  for (const rec of openList()) {
    try {
      const ev = await evalOne(rec);
      if (ev) { events.push(ev); delete state.open[rec.code]; }
    } catch (_) {}
  }
  if (events.length) persist();
  return events;
}

function getOpen() { return openList(); }

module.exports = { load, register, checkClosures, getOpen, nextCode };
