/**
 * tema34ScannerTracker — TEMA34 tarama sinyallerinin SONUÇ takibi (ters-kesişim).
 *
 * TEMA34 scanner'ın TP/SL seviyesi YOKTUR (crossover-tarzı: fiyat TEMA34'ü yukarı
 * kesince "yeni giren/AL", aşağı kesince "sat bölgesi"). Dolayısıyla doğal "sonuç"
 * bir TP/SL değil, TERS KESİŞİMdir: bir hisse AL bölgesine girdikten (cross_above)
 * sonra sat bölgesine geçtiğinde (cross_below) sinyalin ne kadar kazandırdığı/
 * kaybettirdiği ölçülür.
 *
 * ÖNEMLİ: Sonuç, MUM YENİDEN ÇEKİLMEDEN doğrudan taramanın kendi çıktısından
 * türetilir — cross_below zaten taramanın `down` listesinde çıkar. Bu yüzden
 * gecikmeli BIST verisiyle tam uyumludur: cross_below hangi turda görünürse o turda
 * kapanış yakalanır (idempotent — kapanınca open'dan silinir, tekrar tetiklenmez).
 *
 * Kapsam: YALNIZ günlük (1d) zaman dilimi izlenir (4h gürültü + resample-kapanış
 * belirsizliği). Kalıcılık: Supabase 'bot-state'/'tema34/open-signals.json' + disk
 * fallback. LONG-only → open state SEMBOL ile anahtarlanır.
 */

const fs = require('fs');
const path = require('path');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'tema34/open-signals.json';
const DISK_FILE = process.env.TEMA34_TRACKER_DISK_FILE || path.join(__dirname, '..', '..', 'data', 'tema34-signals-open.json');
const MAX_CLOSED = 80;

let state = { open: {}, closed: [], version: 1 };
let loaded = false;
let saveTimer = null;

function nowSec() { return Math.floor(Date.now() / 1000); }
function openList() { return Object.values(state.open); }

// İki YYYY-MM-DD tarih arası takvim günü (negatif olmaz).
function daysBetween(a, b) {
  if (!a || !b) return null;
  const d = (Date.parse(b) - Date.parse(a)) / 86400000;
  return Number.isFinite(d) ? Math.max(0, Math.round(d)) : null;
}

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
 * Bir günlük (1d) tarama sonucunu işle:
 *   1) Açık pozisyonlardan `down` (cross_below) listesinde görünenleri KAPAT
 *      (ters-kesişim sonucu: giriş→çıkış % + kaç gün tutuldu).
 *   2) `up` (cross_above) listesindeki HENÜZ açık olmayan hisseleri yeni pozisyon
 *      olarak KAYDET (giriş kapanışı = row.close, giriş tarihi = candleDate).
 * Dönüş: { closures: [...], opened: [...symbol] }. closures notifier tarafından
 * gönderilir; kayıt sessizdir (yeni girenleri scanner zaten duyurur).
 */
async function sync(tfResult) {
  await load();
  if (!tfResult || !tfResult.ok || tfResult.tf !== '1d') return { closures: [], opened: [] };
  const up = Array.isArray(tfResult.up) ? tfResult.up : [];
  const down = Array.isArray(tfResult.down) ? tfResult.down : [];
  const candleDate = tfResult.candleDate || null;

  const closures = [];
  let changed = false;

  // 1) Kapanışlar: açık pozisyon şimdi cross_below'da mı?
  const downBySym = new Map(down.map(r => [r.symbol, r]));
  for (const p of openList()) {
    const dr = downBySym.get(p.symbol);
    if (!dr) continue;
    const exit = dr.close;
    if (exit == null || !(p.entry > 0)) { delete state.open[p.symbol]; changed = true; continue; }
    const pnlPct = +(((exit - p.entry) / p.entry) * 100).toFixed(2);
    closures.push({
      symbol: p.symbol, name: p.name, direction: 'long',
      entry: p.entry, entryDate: p.entryDate,
      exit: +Number(exit).toFixed(2), exitDate: candleDate,
      daysHeld: daysBetween(p.entryDate, candleDate),
      outcome: 'CROSS_DOWN', pnlPct,
      issuedAt: p.issuedAt,
    });
    delete state.open[p.symbol];
    changed = true;
  }

  // 2) Yeni girenler (cross_above) → açık değilse kaydet
  const opened = [];
  for (const r of up) {
    if (!r || !r.symbol || r.close == null || !(r.close > 0)) continue;
    if (state.open[r.symbol]) continue;
    state.open[r.symbol] = {
      symbol: r.symbol, name: r.name || r.symbol, direction: 'long',
      entry: +Number(r.close).toFixed(2), entryDate: candleDate,
      distanceAtEntry: r.distancePct ?? null,
      issuedAt: new Date().toISOString(), issueTimeSec: nowSec(),
    };
    opened.push(r.symbol);
    changed = true;
  }

  if (closures.length) {
    const closedAt = new Date().toISOString();
    state.closed = [...closures.map(e => ({ ...e, closedAt })), ...(state.closed || [])].slice(0, MAX_CLOSED);
  }
  if (changed) persist();
  return { closures, opened };
}

async function getOpen() {
  await load();
  return openList().sort((a, b) => (a.entryDate || '').localeCompare(b.entryDate || '') || a.symbol.localeCompare(b.symbol));
}

async function getClosedRecent() {
  await load();
  return state.closed || [];
}

function __resetForTest() { state = { open: {}, closed: [], version: 1 }; loaded = true; }

module.exports = { load, sync, getOpen, getClosedRecent, __resetForTest };
