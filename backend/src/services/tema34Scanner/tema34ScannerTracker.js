/**
 * tema34ScannerTracker — TEMA34 tarama sinyallerinin SONUÇ takibi (ters-kesişim).
 *
 * TEMA34 scanner'ın TP/SL seviyesi YOKTUR (crossover-tarzı: fiyat TEMA34'ü yukarı
 * kesince "yeni giren/AL", aşağı kesince "sat bölgesi"). Doğal "sonuç" bir TP/SL
 * değil, TERS KESİŞİMdir: AL bölgesine giren (cross_above) hisse sat bölgesine
 * geçtiğinde (cross_below / çizgi altında) sinyalin kazandırdığı/kaybettirdiği ölçülür.
 *
 * ⚠️ 2026-07-19 GÜVENİLİRLİK DÜZELTMELERİ ("kar/zarar bildirimi MUTLAKA gelsin"):
 *   • DETECT/COMMIT AYRIMI: `sync` kapanışları TESPİT eder ama pozisyonu HEMEN
 *     SİLMEZ. Notifier önce Telegram'a P&L mesajını gönderir, BAŞARIRSA
 *     `commitClosures` ile pozisyonu kapatır. Gönderim başarısızsa pozisyon AÇIK
 *     kalır → sonraki turda (kalıcı open state Supabase'te) yeniden tespit + tekrar
 *     denenir. Böylece tek bir Telegram hıçkırığı sonucu mesajı sonsuza dek
 *     KAYBETMEZ (eski "önce sil, sonra gönder" bug'ı giderildi).
 *   • KENDİNİ-ONARAN KAPANIŞ: kapanış yalnız tek geçiş barından (down/cross_below)
 *     değil, o an çizgi ALTINDA olan (belowAll) açık pozisyonlardan da türetilir →
 *     geçiş barı kaçırılsa (o gün o sembolde veri hatası) bile sonraki turda kapanır.
 *   • load() sessiz hata YEMEZ (loglar) — açık defterin sessizce boşalmasını yakala.
 *
 * Kapsam: YALNIZ günlük (1d). Kalıcılık: Supabase 'bot-state'/'tema34/open-signals.json'
 * + disk fallback. LONG-only → open state SEMBOL ile anahtarlanır.
 */

const fs = require('fs');
const path = require('path');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

let logger; try { logger = require('../../utils/logger'); } catch (_) { logger = { warn: () => {}, error: () => {}, info: () => {} }; }

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
    } catch (e) {
      logger.warn(`[TEMA34Scanner] açık-sinyal Supabase yükleme hatası: ${e.message} — diske düşülüyor`);
    }
  }
  if (!got) {
    try {
      if (fs.existsSync(DISK_FILE)) {
        const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8'));
        if (p && p.open) state = { open: p.open || {}, closed: p.closed || [], version: 1 };
      }
    } catch (e) {
      logger.error(`[TEMA34Scanner] açık-sinyal disk yükleme hatası: ${e.message}`);
    }
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

// Bir açık pozisyondan kapanış olayı kur (henüz open'dan SİLMEZ).
function closureOf(p, exit, exitDate) {
  const pnlPct = +(((exit - p.entry) / p.entry) * 100).toFixed(2);
  return {
    symbol: p.symbol, name: p.name, direction: 'long',
    entry: p.entry, entryDate: p.entryDate,
    exit: +Number(exit).toFixed(2), exitDate,
    daysHeld: daysBetween(p.entryDate, exitDate),
    outcome: 'CROSS_DOWN', pnlPct,
    distanceAtEntry: p.distanceAtEntry ?? null,
    issuedAt: p.issuedAt,
  };
}

/**
 * Bir günlük (1d) tarama sonucunu işle:
 *   1) `up` (cross_above) listesindeki HENÜZ açık olmayan hisseleri yeni pozisyon
 *      olarak KAYDET (giriş kapanışı = row.close, giriş tarihi = candleDate) — persist.
 *   2) Açık pozisyonlardan o an çizgi ALTINDA olanları (down ∪ belowAll) kapanış
 *      olayı olarak TESPİT ET — ama SİLME (commit gönderimden SONRA). Böylece
 *      gönderim başarısızsa pozisyon açık kalır → tekrar denenir.
 * Dönüş: { closures: [...], opened: [...symbol] }.
 */
async function sync(tfResult) {
  await load();
  if (!tfResult || !tfResult.ok || tfResult.tf !== '1d') return { closures: [], opened: [] };
  const up = Array.isArray(tfResult.up) ? tfResult.up : [];
  const down = Array.isArray(tfResult.down) ? tfResult.down : [];
  const belowAll = Array.isArray(tfResult.belowAll) ? tfResult.belowAll : [];
  const candleDate = tfResult.candleDate || null;

  let changed = false;

  // 1) Yeni girenler (cross_above) → açık değilse kaydet (sessiz; scanner zaten duyurur)
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
  if (changed) persist();

  // 2) Kapanış TESPİTİ: açık pozisyon o an çizgi altında mı? (down ∪ belowAll)
  //    belowAll (süregelen below) sayesinde kaçırılan geçiş barı sonraki turda yakalanır.
  const closeRows = new Map();
  for (const r of [...down, ...belowAll]) if (r && r.symbol) closeRows.set(r.symbol, r);
  const closures = [];
  for (const p of openList()) {
    const dr = closeRows.get(p.symbol);
    if (!dr) continue;
    const exit = dr.close;
    if (exit == null || !(p.entry > 0)) continue;   // bozuk veri → dokunma (bir sonraki tur)
    closures.push(closureOf(p, exit, candleDate));
  }
  return { closures, opened };
}

/**
 * TESPİT edilen kapanışları KESİNLEŞTİR: open'dan sil + closed'a yaz + persist.
 * Notifier bunu YALNIZ Telegram gönderimi BAŞARILINCA çağırır (garantili teslim).
 * Idempotent: open'da olmayan sembol atlanır.
 */
function commitClosures(closures) {
  const list = Array.isArray(closures) ? closures : [];
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
  return openList().sort((a, b) => (a.entryDate || '').localeCompare(b.entryDate || '') || a.symbol.localeCompare(b.symbol));
}

async function getClosedRecent() {
  await load();
  return state.closed || [];
}

function __resetForTest() { state = { open: {}, closed: [], version: 1 }; loaded = true; }

module.exports = { load, sync, commitClosures, getOpen, getClosedRecent, closureOf, __resetForTest };
