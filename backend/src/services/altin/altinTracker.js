/**
 * ALTIN · POZİSYON İZLEYİCİ — "yaşayan çoklu-bot" (her zaman dilimi = bir bot).
 *
 * Her TF için AYNI ANDA YALNIZ BİR açık pozisyon tutulur. Motor (altinEngine)
 * zaten yön-uyumlu + S/R-süzülmüş sinyaller üretir; burada her TF için açık
 * pozisyon YOKSA, o TF'in EN YÜKSEK güvenli sinyali yeni pozisyon olarak açılır.
 *
 * Yaşam döngüsü:
 *   load()        — diskten + Supabase'ten açık pozisyon/işlem geçmişini geri yükler
 *   ingest(sigs)  — TF başına tek pozisyon aç (kod: AU-<TF>-NNN, TF başına sayaç)
 *   manageOpen()  — ileri-yönlü çıkış (trailing/SL/TP/zaman-stop), kapanışı kaydeder
 *   listOpen()    — açık pozisyonlar + anlık gerçekleşmemiş % (son mum kapanışıyla)
 *   getStats()    — (tf,yön) bazlı kazanma/kayıp/oran + genel (proStatsStore biçimi)
 *
 * Kalıcılık proSignalTracker/proStatsStore klonudur: disk (data/altin-*.json) +
 * Supabase 'bot-state'/'altin/*.json' + botPersistence.save('altin', ...). NO-LOOKAHEAD
 * çıkış yalnız stop-konuş zamanından (stopSetSec) SONRAki mumlarla değerlendirilir.
 */

const fs = require('fs');
const path = require('path');
const altinData = require('./altinData');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

let botPersistence = null;
try { botPersistence = require('../botPersistence'); } catch (_) {}

const BUCKET = 'bot-state';
const SUBDIR = 'altin';
const OPEN_KEY = 'altin/open-signals.json';
const STATS_KEY = 'altin/stats.json';
const OPEN_FILE = process.env.ALTIN_OPEN_FILE || path.join(__dirname, '..', '..', 'data', 'altin-open.json');
const STATS_FILE = path.join(__dirname, '..', '..', 'data', 'altin-stats.json');

const TF_ORDER = ['1d', '8h', '4h', '1h', '15m', '5m', '1m'];

// TF başına zaman-stop (saniye). Üst-TF işlemler uzun yaşar; scalp kısa.
const EXPIRE_SEC = {
  '1d': 20 * 86400,
  '8h': 10 * 86400,
  '4h': 6 * 86400,
  '1h': 3 * 86400,
  '15m': 1 * 86400,
  '5m': 8 * 3600,
  '1m': 3 * 3600,
};

// state.open: { code -> position }, state.counters: { tf -> n }, state.trades: [closure...]
let state = { counters: {}, open: {}, trades: [], version: 1 };
let stats = { byTf: {}, totalOpened: 0, totalClosed: 0, since: null };
let loaded = false;
let saveTimer = null;
let statsTimer = null;

const TRADES_CAP = 1000;

function nowSec() { return Math.floor(Date.now() / 1000); }
function openList() { return Object.values(state.open); }
function findOpenForTf(tf) { return openList().find(p => p.tf === tf); }

// ── Kalıcılık (proSignalTracker/proStatsStore klonu) ─────────────────────────
async function downloadSupa(key) {
  if (!(supaEnabled && supaEnabled())) return null;
  try {
    const { data } = await Promise.race([
      supa.storage.from(BUCKET).download(key),
      new Promise((_, rej) => setTimeout(() => rej(new Error('supa-timeout')), 8000)),
    ]);
    if (!data) return null;
    const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
    return JSON.parse(text);
  } catch (_) { return null; }
}

async function load() {
  if (loaded) return;
  loaded = true;

  // Açık pozisyon + işlem geçmişi
  let openGot = false;
  const supaOpen = await downloadSupa(OPEN_KEY);
  if (supaOpen && supaOpen.open) {
    state = { counters: supaOpen.counters || {}, open: supaOpen.open || {}, trades: supaOpen.trades || [], version: 1 };
    openGot = true;
  }
  if (!openGot) {
    try {
      if (fs.existsSync(OPEN_FILE)) {
        const p = JSON.parse(fs.readFileSync(OPEN_FILE, 'utf8'));
        if (p && p.open) state = { counters: p.counters || {}, open: p.open || {}, trades: p.trades || [], version: 1 };
      }
    } catch (_) {}
  }

  // İstatistik
  let statsGot = false;
  const supaStats = await downloadSupa(STATS_KEY);
  if (supaStats && supaStats.byTf) {
    stats = { byTf: supaStats.byTf || {}, totalOpened: supaStats.totalOpened || 0, totalClosed: supaStats.totalClosed || 0, since: supaStats.since || null };
    statsGot = true;
  }
  if (!statsGot) {
    try {
      if (fs.existsSync(STATS_FILE)) {
        const p = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        if (p && p.byTf) stats = { byTf: p.byTf || {}, totalOpened: p.totalOpened || 0, totalClosed: p.totalClosed || 0, since: p.since || null };
      }
    } catch (_) {}
  }
  sanitize();
}

function sanitize() {
  for (const code of Object.keys(state.open || {})) {
    const p = state.open[code];
    if (!p || typeof p.tf !== 'string' || !(p.entry > 0)) delete state.open[code];
  }
  if (!Array.isArray(state.trades)) state.trades = [];
}

function persistOpen() {
  const payload = { counters: state.counters, open: state.open, trades: state.trades.slice(-TRADES_CAP), version: 1 };
  try {
    const dir = path.dirname(OPEN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(OPEN_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (_) {}
  // botPersistence (whitelist'lenmiş 'altin' subdir) — pozisyon+işlem dosyaları
  if (botPersistence && typeof botPersistence.save === 'function') {
    try {
      botPersistence.save(SUBDIR, 'positions.json', { counters: state.counters, open: state.open, version: 1 });
      botPersistence.save(SUBDIR, 'trades.json', { trades: state.trades.slice(-TRADES_CAP) });
    } catch (_) {}
  }
  // Doğrudan Supabase aynası (proSignalTracker biçimi, debounce'lu)
  if (supaEnabled && supaEnabled()) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await supa.storage.from(BUCKET).upload(OPEN_KEY, Buffer.from(JSON.stringify(payload), 'utf8'), { contentType: 'application/json', upsert: true }); } catch (_) {}
    }, 2500);
    if (saveTimer.unref) saveTimer.unref();
  }
}

function persistStats() {
  try {
    const dir = path.dirname(STATS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
  } catch (_) {}
  if (supaEnabled && supaEnabled()) {
    if (statsTimer) clearTimeout(statsTimer);
    statsTimer = setTimeout(async () => {
      try { await supa.storage.from(BUCKET).upload(STATS_KEY, Buffer.from(JSON.stringify(stats), 'utf8'), { contentType: 'application/json', upsert: true }); } catch (_) {}
    }, 2500);
    if (statsTimer.unref) statsTimer.unref();
  }
}

// ── Kod üretimi: AU-<TF>-NNN (TF başına artan sayaç) ─────────────────────────
function tfTag(tf) { return String(tf).toUpperCase(); } // '4h' → '4H', '15m' → '15M'
function nextCode(tf) {
  state.counters = state.counters || {};
  state.counters[tf] = (state.counters[tf] || 0) + 1;
  return `AU-${tfTag(tf)}-${String(state.counters[tf]).padStart(3, '0')}`;
}

// ── İstatistik (proStatsStore biçimi) ────────────────────────────────────────
function blankRate() { return { win: 0, loss: 0, sumPnl: 0, n: 0 }; }
function ensureTf(tf) { if (!stats.byTf[tf]) stats.byTf[tf] = { long: blankRate(), short: blankRate() }; return stats.byTf[tf]; }

function recordClosure(ev) {
  if (!stats.since) stats.since = new Date().toISOString();
  const rec = ensureTf(ev.tf)[ev.direction === 'long' ? 'long' : 'short'];
  rec.n++;
  if ((ev.pnlPct || 0) > 0) rec.win++; else rec.loss++;
  rec.sumPnl += (ev.pnlPct || 0);
  stats.totalClosed++;
  persistStats();
}

// ── ingest: TF başına tek pozisyon aç ───────────────────────────────────────
/**
 * signals: motorun bias-uyumlu + S/R-süzülmüş sinyal dizisi (her elemanda tf,
 * direction, entry, stop, target, atr, tpAtr, slAtr, trail, confidence, wrEst...).
 * O TF için açık pozisyon yoksa EN YÜKSEK güvenli sinyali yeni pozisyon olarak açar.
 * Dönen: yeni açılan { code, tf, ... } olayları dizisi.
 */
async function ingest(signals) {
  await load();
  const opened = [];
  // TF başına en yüksek güvenli sinyali seç
  const byTf = new Map();
  for (const s of (signals || [])) {
    if (!s || !s.tf || !(s.entry > 0) || !s.direction) continue;
    const cur = byTf.get(s.tf);
    if (!cur || (s.confidence || 0) > (cur.confidence || 0)) byTf.set(s.tf, s);
  }
  for (const [tf, s] of byTf) {
    // Tek-pozisyon-per-TF kuralı: o TF'te zaten açık pozisyon varsa atla (ters yön dahil)
    if (findOpenForTf(tf)) continue;
    const code = nextCode(tf);
    const ts = nowSec();
    const pos = {
      code, tf, symbol: s.symbol || altinData.SYMBOL,
      type: s.type, label: s.label, direction: s.direction,
      entry: s.entry, stop: s.stop, initialStop: s.stop, target: s.target,
      atr: s.atr, tpAtr: s.tpAtr, slAtr: s.slAtr, trail: !!s.trail,
      confidence: s.confidence, wrEst: s.wrEst, scalp: !!s.scalp,
      issuedAt: new Date().toISOString(), issueTimeSec: s.barTime || ts, stopSetSec: ts,
      peak: s.entry, trough: s.entry,
    };
    state.open[code] = pos;
    stats.totalOpened++;
    if (!stats.since) stats.since = new Date().toISOString();
    opened.push({ ...pos });
  }
  if (opened.length) { persistOpen(); persistStats(); }
  return opened;
}

// ── manageOpen: ileri-yönlü çıkış ────────────────────────────────────────────
async function evalOne(p) {
  let candles;
  try { candles = await altinData.getCandles(p.tf); } catch (_) { candles = null; }
  const isLong = p.direction === 'long';
  const slAtr = p.slAtr, atr = p.atr;
  const stopSince = p.stopSetSec || p.issueTimeSec;
  let outcome = null, exit = null, trailed = false;

  if (candles && candles.length) {
    // Yalnız GİRİŞ barından SONRAki mumlar (forward-only)
    for (const b of candles) {
      if (b.time <= p.issueTimeSec) continue;

      // Trailing: tepe/dip güncelle, stop'u lehte kaydır
      if (p.trail && atr > 0 && slAtr > 0) {
        if (isLong) {
          if (b.high > p.peak) p.peak = b.high;
          const ns = +(p.peak - slAtr * atr);
          if (ns > p.stop) { p.stop = ns; trailed = true; }
        } else {
          if (b.low < p.trough) p.trough = b.low;
          const ns = +(p.trough + slAtr * atr);
          if (ns < p.stop) { p.stop = ns; trailed = true; }
        }
      }

      // Çıkış kontrolü (stop yalnız konuş-zamanından sonraki mumlarda)
      const slHit = (b.time > stopSince) && (isLong ? b.low <= p.stop : b.high >= p.stop);
      const tpHit = isLong ? b.high >= p.target : b.low <= p.target;
      if (slHit) {
        // Stop entry'yi lehte geçtiyse → 'TRAIL' (kâr kilidi), yoksa 'SL'
        const movedPastEntry = isLong ? p.stop >= p.entry : p.stop <= p.entry;
        outcome = movedPastEntry ? 'TRAIL' : 'SL';
        exit = p.stop; break;
      }
      if (tpHit) { outcome = 'TP'; exit = p.target; break; }
    }
  }

  // Zaman-stop
  if (!outcome) {
    const age = nowSec() - p.issueTimeSec;
    if (age > (EXPIRE_SEC[p.tf] || 3 * 86400)) {
      outcome = 'EXPIRE';
      exit = candles && candles.length ? candles[candles.length - 1].close : p.entry;
    }
  }
  if (!outcome) { if (trailed) return { trailedOnly: true }; return null; }

  const dir = isLong ? 1 : -1;
  const pnlPct = +(((exit - p.entry) / p.entry) * 100 * dir).toFixed(3);
  const pnlUsd = +(pnlPct).toFixed(2); // ≈ pnlPct (sanal birim)
  const denom = Math.abs(p.entry - p.initialStop);
  const R = denom > 0 ? +(((exit - p.entry) * dir) / denom).toFixed(3) : null;
  const win = pnlPct > 0;
  return {
    code: p.code, tf: p.tf, symbol: p.symbol, type: p.type, label: p.label, direction: p.direction,
    entry: p.entry, exit, pnlPct, pnlUsd, R, outcome, win,
    openedAt: p.issuedAt, closedAt: new Date().toISOString(),
  };
}

async function manageOpen() {
  await load();
  const closures = [];
  let dirty = false;
  for (const p of openList()) {
    let ev;
    try { ev = await evalOne(p); } catch (_) { ev = null; }
    if (!ev) continue;
    if (ev.trailedOnly) { p.stopSetSec = nowSec(); dirty = true; continue; }
    // Kapanış
    state.trades.push(ev);
    recordClosure(ev);
    delete state.open[p.code];
    closures.push(ev);
    dirty = true;
  }
  if (dirty || closures.length) persistOpen();
  return closures;
}

// ── listOpen: açık pozisyonlar + anlık gerçekleşmemiş % ──────────────────────
async function listOpen() {
  await load();
  const lastClose = {};
  const out = [];
  for (const p of openList()) {
    if (lastClose[p.tf] === undefined) {
      try { const c = await altinData.getCandles(p.tf); lastClose[p.tf] = (c && c.length) ? c[c.length - 1].close : null; }
      catch (_) { lastClose[p.tf] = null; }
    }
    const lc = lastClose[p.tf];
    let unrealizedPct = null;
    if (lc != null && p.entry > 0) {
      const dir = p.direction === 'long' ? 1 : -1;
      unrealizedPct = +(((lc - p.entry) / p.entry) * 100 * dir).toFixed(3);
    }
    out.push({ ...p, lastClose: lc, unrealizedPct });
  }
  out.sort((a, b) => TF_ORDER.indexOf(a.tf) - TF_ORDER.indexOf(b.tf));
  return out;
}

// ── getStats: (tf,yön) + genel (proStatsStore biçimi) ────────────────────────
async function getStats() {
  await load();
  const byTf = {};
  let totWin = 0, totN = 0, totPnl = 0;
  for (const tf of TF_ORDER) {
    const pr = stats.byTf[tf];
    if (!pr) continue;
    const L = pr.long || blankRate(), S = pr.short || blankRate();
    const mk = (r) => ({ win: r.win, loss: r.loss, n: r.n, winRate: r.n ? +(r.win / r.n * 100).toFixed(1) : null, sumPnl: +(r.sumPnl || 0).toFixed(2) });
    byTf[tf] = { long: mk(L), short: mk(S) };
    totWin += L.win + S.win; totN += L.n + S.n; totPnl += (L.sumPnl || 0) + (S.sumPnl || 0);
  }
  return {
    byTf,
    overall: { win: totWin, n: totN, winRate: totN ? +(totWin / totN * 100).toFixed(1) : null, sumPnl: +totPnl.toFixed(2) },
    totalOpened: stats.totalOpened,
    totalClosed: stats.totalClosed,
    since: stats.since,
  };
}

// ── Test kancası ─────────────────────────────────────────────────────────────
function __resetForTest() {
  state = { counters: {}, open: {}, trades: [], version: 1 };
  stats = { byTf: {}, totalOpened: 0, totalClosed: 0, since: null };
  loaded = true;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (statsTimer) { clearTimeout(statsTimer); statsTimer = null; }
}

module.exports = { load, ingest, manageOpen, listOpen, getStats, nextCode, __resetForTest };
