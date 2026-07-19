/**
 * bistAlScannerTracker — "≥80 kaliteli AL" (@borsasinyal34) sinyallerinin yaşam
 * döngüsü + TP/SL kapanış tespiti. bistSignalTracker'ın AL-kanalı uyarlaması.
 *
 * Neden AYRI tracker (ana ≥75 tracker'ı reuse etmiyoruz):
 *   • AL scanner kendi kanalı + kendi günlük-dedup evreni; ana tracker'ın global
 *     #sayaç/sembol-birleştirme mantığıyla karışırsa numaralar çakışır.
 *   • Ana tracker CANLI ≥75 üretim yolu — ona dokunmak regresyon riski.
 * Bu yüzden KANITLANMIŞ evalOne/kapanış mantığı (instance değil) kopyalanır; yalnız
 * sabitler (kanal/kalıcılık key'i) değişir. AL LONG-only olduğundan open state
 * doğrudan SEMBOL ile anahtarlanır (global sayaç YOK).
 *
 * • Kapanış: günlük mumlarla (gerçek gün low/high). Sahte-stop koruması: önceki
 *   kapanışa göre ±%20 dışı bozuk Yahoo low/high reddedilir, giriş günü+öncesi yok
 *   sayılır, yükseltilen stop yalnız konduğu tarihten sonra tetikler. Süre dolarsa
 *   (vars. 20 takvim günü) EXPIRE. Gecikmeli BIST verisiyle uyumlu: pencere geniş,
 *   tarama idempotent → geç düşen mum sonraki turda onaylanır.
 * • Kalıcılık: Supabase 'bot-state'/'bist-al/open-signals.json' + disk fallback
 *   (ana ≥75 tracker'ın 'bist/open-signals.json' key'inden AYRI). Render deploy'unda
 *   sıfırlanmaz.
 */

const fs = require('fs');
const path = require('path');
const liveDataService = require('../liveDataService');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'bist-al/open-signals.json';
const DISK_FILE = process.env.BIST_AL_TRACKER_DISK_FILE || path.join(__dirname, '..', '..', 'data', 'bist-al-signals-open.json');

const EXPIRE_DAYS = (() => { const v = Number(process.env.BIST_AL_EXPIRE_DAYS); return Number.isFinite(v) && v > 0 ? v : 20; })();
const BIST_BAND = 0.20;            // önceki kapanışa göre ±%20 dışı = bozuk veri (reddet)
const MAX_CLOSED = 60;             // son kapananlar listesi (route/log)

let state = { open: {}, closed: [], version: 1 };
let loaded = false;
let saveTimer = null;
let _checking = null;              // eşzamanlı kapanış kontrolü kilidi

function nowSec() { return Math.floor(Date.now() / 1000); }
function openList() { return Object.values(state.open); }
function dateOf(c) { return c.date || new Date(c.timestamp || 0).toISOString().slice(0, 10); }

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
        if (p && p.open) { state = { open: p.open || {}, closed: p.closed || [], version: 1 }; got = true; }
      }
    } catch (_) {}
  }
  if (!got) {
    try {
      if (fs.existsSync(DISK_FILE)) {
        const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8'));
        if (p && p.open) state = { open: p.open || {}, closed: p.closed || [], version: 1 };
      }
    } catch (_) {}
  }
}

function persist() {
  try {
    const dir = path.dirname(DISK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISK_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
  if (supaEnabled && supaEnabled()) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await supa.storage.from(BUCKET).upload(SUPA_KEY, Buffer.from(JSON.stringify(state), 'utf8'), { contentType: 'application/json', upsert: true }); } catch (_) {}
    }, 2500);
    if (saveTimer.unref) saveTimer.unref();
  }
}

/**
 * Yeni yayınlanan (fresh) AL sinyallerini açık pozisyona işle. AL LONG-only →
 * SEMBOL bazlı: aynı hisse zaten açıksa stop/TP yukarı iz sürer (geri çekilmez),
 * yeni değilse yeni pozisyon açılır. Bildirim üretmez (yalnız kayıt); dönüş: eklenen
 * yeni sembollerin listesi (log için).
 */
async function registerSignals(freshSignals) {
  await load();
  const added = [];
  let changed = false;
  for (const s of (freshSignals || [])) {
    if (!s || s.direction !== 'long' || !(s.entry > 0) || !s.symbol) continue;
    const p = s.precision ?? 2;
    const r = (v) => +Number(v).toFixed(p);
    const existing = state.open[s.symbol];
    const score = s.avgVoteScore ?? s.score ?? s.confidence ?? null;
    if (!existing) {
      state.open[s.symbol] = {
        symbol: s.symbol, name: s.name || s.symbol, direction: 'long', precision: p,
        entry: r(s.entry), stop: r(s.stop), target1: r(s.target1), target2: r(s.target2),
        rr1: s.rr1, rr2: s.rr2, score,
        issuedAt: new Date().toISOString(), issueTimeSec: nowSec(), lastUpdateSec: nowSec(),
        stopSetDate: new Date().toISOString().slice(0, 10),   // stop bu tarihten İTİBAREN geçerli
      };
      added.push(s.symbol);
      changed = true;
    } else {
      // LONG: stop & TP yukarı iz sürer (geri çekilmez)
      const nStop = r(Math.max(existing.stop, s.stop));
      const nT1 = r(Math.max(existing.target1, s.target1));
      const nT2 = r(Math.max(existing.target2, s.target2));
      const stopChanged = nStop !== existing.stop;
      if (stopChanged || nT1 !== existing.target1 || nT2 !== existing.target2 || (score != null && score > (existing.score ?? -1))) {
        existing.stop = nStop; existing.target1 = nT1; existing.target2 = nT2;
        if (score != null) existing.score = Math.max(existing.score ?? 0, score);
        existing.rr1 = s.rr1; existing.rr2 = s.rr2; existing.lastUpdateSec = nowSec();
        // Stop yukarı taşındıysa YENİ stop yalnız BU tarihten itibaren geçerli (retroaktif sahte-stop önlenir)
        if (stopChanged) existing.stopSetDate = new Date().toISOString().slice(0, 10);
        changed = true;
      }
    }
  }
  if (changed) persist();
  return added;
}

// Tek pozisyonun kapanış kontrolü (gerçek günlük low/high + sahte-stop koruması).
// bistSignalTracker.evalOne ile BİREBİR aynı mantık (kanıtlanmış çekirdek).
async function evalOne(p) {
  const hist = await liveDataService.fetchHistoricalData(p.symbol, '2mo', '1d');
  const candles = (hist || []).filter(r => r && r.close != null);
  const issueDate = new Date(p.issuedAt).toISOString().slice(0, 10);
  const stopSince = p.stopSetDate || issueDate;         // stop YALNIZ konduğu tarihten sonra geçerli
  let outcome = null, exit = null, exitDate = null;
  let prevClose = null;
  for (const c of candles) {
    const d = dateOf(c);
    const pc = prevClose;
    prevClose = c.close;
    if (d <= issueDate) continue;                       // giriş günü + öncesi yok sayılır
    const lo = c.low, hi = c.high;
    // sahte-stop koruması: önceki kapanışa göre ±%20 dışı okuma = bozuk veri, reddet
    const badLow = lo == null || lo <= 0 || (pc && lo < pc * (1 - BIST_BAND));
    const badHigh = hi == null || (pc && hi > pc * (1 + BIST_BAND));
    // İLERİ-YÖNLÜ stop: stop yükseltildiyse yalnız sonraki günler tetikler
    const slHit = !badLow && d > stopSince && lo <= p.stop;
    const tpHit = !badHigh && hi >= p.target1;
    if (slHit) { outcome = 'SL'; exit = p.stop; exitDate = d; break; }   // aynı barda ikisi de → ihtiyatlı SL
    if (tpHit) { outcome = 'TP1'; exit = p.target1; exitDate = d; break; }
  }
  if (!outcome) {
    const ageDays = (Date.now() - new Date(p.issuedAt).getTime()) / 86400000;
    if (ageDays > EXPIRE_DAYS) {
      outcome = 'EXPIRE';
      const last = candles.length ? candles[candles.length - 1] : null;
      exit = last ? last.close : p.entry;
      exitDate = last ? dateOf(last) : null;
    }
  }
  if (!outcome) return null;
  const pnlPct = +(((exit - p.entry) / p.entry) * 100).toFixed(2);
  return {
    symbol: p.symbol, name: p.name, direction: 'long', precision: p.precision ?? 2,
    entry: p.entry, stop: p.stop, target1: p.target1, target2: p.target2,
    exit: +Number(exit).toFixed(p.precision ?? 2), exitDate, outcome, pnlPct,
    score: p.score, issuedAt: p.issuedAt,
  };
}

// TESPİT: açık pozisyonların TP/SL/EXPIRE kapanışlarını bul — ama SİLME.
// ⚠️ 2026-07-19: pozisyon burada silinmez. Notifier önce Telegram'a P&L gönderir,
// BAŞARIRSA commitClosures ile kapatır. Gönderim başarısızsa pozisyon açık kalır →
// evalOne geçmişten idempotent yeniden türetir → sonraki turda tekrar denenir.
// Böylece tek Telegram hıçkırığı sonucu mesajı KAYBETMEZ.
async function checkClosures() {
  if (_checking) return [];           // eşzamanlı tetik (15 dk kadans) tek tur
  _checking = (async () => {
    await load();
    const events = [];
    for (const p of openList()) {
      try { const ev = await evalOne(p); if (ev) events.push(ev); } catch (_) {}
    }
    return events;
  })();
  try { return await _checking; }
  finally { _checking = null; }
}

// KESİNLEŞTİR: TESPİT edilen kapanışları open'dan sil + closed'a yaz + persist.
// Notifier YALNIZ Telegram gönderimi BAŞARILINCA (veya bilinçli olarak
// gönderilmeyecekse) çağırır. Idempotent: open'da olmayan sembol atlanır.
function commitClosures(events) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return { committed: 0 };
  let committed = 0;
  const closedAt = new Date().toISOString();
  const records = [];
  for (const ev of list) {
    if (!ev || !ev.symbol) continue;
    if (state.open[ev.symbol]) { delete state.open[ev.symbol]; committed++; }
    records.push({ ...ev, closedAt });
  }
  if (records.length) state.closed = [...records, ...(state.closed || [])].slice(0, MAX_CLOSED);
  if (committed || records.length) persist();
  return { committed };
}

async function getOpen() {
  await load();
  return openList().sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.symbol.localeCompare(b.symbol));
}

async function getClosedRecent() {
  await load();
  return state.closed || [];
}

// test için durumu sıfırla
function __resetForTest() { state = { open: {}, closed: [], version: 1 }; loaded = true; }

module.exports = {
  load, registerSignals, checkClosures, commitClosures, getOpen, getClosedRecent,
  evalOne, __resetForTest, EXPIRE_DAYS, BIST_BAND,
};
