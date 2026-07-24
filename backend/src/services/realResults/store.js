'use strict';

/**
 * Gerçek MT5 Sonuç Deposu — köprünün beslediği FİİLEN kapanan işlemler.
 *
 * Birleşik köprü (borsakrali_mt5_all.py) MT5 hesabının deal geçmişini magic'e
 * göre okuyup POST /api/bridge/results ile buraya yollar. Böylece lider tablosu
 * ve günlük rapor SİMÜLASYON değil, gerçek hesap sonuçlarını gösterir.
 *
 * magic → bot eşlemesi: 5701-5715 = 15 yarışçı (catalog), 5720+ = özel botlar
 * (bot-builder), 20260707 = altın botu.
 */

const fs = require('fs');
const path = require('path');
const botPersistence = require('../botPersistence');
const catalog = require('../botCompetition/catalog');

const DATA_DIR = process.env.BOT_DATA_DIR
  ? path.join(process.env.BOT_DATA_DIR, 'real-results')
  : path.join(__dirname, '..', '..', 'data', 'real-results');
const STATE_FILE = path.join(DATA_DIR, 'deals.json');
const TEST_EPHEMERAL = process.env.NODE_ENV === 'test' && !process.env.REAL_RESULTS_DATA_DIR;
const MAX_DEALS = 8000;
const PRUNE_DAYS = 60;
const GOLD_MAGIC = 20260707;

// Bir botun MT5'te birden çok magic'i olabilir:
//  • magic              → birleşik köprünün (borsakrali_mt5_all.py) kimliği
//  • magicByStrategy     → çok-motorlu botun alt motorları (BK XAU scalp/swing)
//  • dedicatedBridgeMagic→ adanmış köprünün kimliği (forex 550055, tarayıcı 550066)
// Hepsi AYNI bota işaret eder. Eşlenmezse deal "Magic 550055" diye etiketlenip
// hem lider tablosunda kayboluyor hem Telegram kapanış mesajında öyle görünüyordu.
const CATALOG_BY_MAGIC = new Map();
for (const e of catalog) {
  for (const m of [e.magic, e.dedicatedBridgeMagic, ...Object.values(e.magicByStrategy || {})]) {
    if (Number.isFinite(Number(m)) && Number(m) > 0 && !CATALOG_BY_MAGIC.has(Number(m))) {
      CATALOG_BY_MAGIC.set(Number(m), e);
    }
  }
}

function nowSec() { return Math.floor(Date.now() / 1000); }
function round(v, d = 2) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : 0; }

let state = { deals: {}, updatedAt: null };
let loaded = false;

function persist() {
  if (TEST_EPHEMERAL) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
  } catch (_) {}
  try { botPersistence.save('real-results', 'deals.json', state); } catch (_) {}
}
function load() {
  if (loaded) return state;
  try {
    if (!TEST_EPHEMERAL && fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (raw && raw.deals) state = { deals: raw.deals, updatedAt: raw.updatedAt || null };
    }
  } catch (_) { state = { deals: {}, updatedAt: null }; }
  loaded = true;
  return state;
}

function magicToBot(magic) {
  const m = Number(magic);
  const entry = CATALOG_BY_MAGIC.get(m);
  if (entry) return { botId: entry.id, no: entry.no, name: entry.name, category: entry.category, kind: 'competitor' };
  if (m === GOLD_MAGIC) return { botId: 'altin-botu', no: null, name: 'Altın Botu', category: 'Emtia', kind: 'gold' };
  // Özel botlar (bot-builder) — çalışma anında yükle (döngüsel bağımlılık yok).
  try {
    const bot = require('../botBuilder/store').listCustom().find((b) => Number(b.magic) === m);
    if (bot) return { botId: bot.id, no: null, name: bot.name, category: 'Özel', kind: 'custom' };
  } catch (_) {}
  return { botId: `magic-${m}`, no: null, name: `Magic ${m}`, category: '—', kind: 'unknown' };
}

/** Köprüden gelen deal listesini içeri al (dedup + budama). */
function ingest(deals) {
  load();
  if (!Array.isArray(deals)) return { ingested: 0, total: 0 };
  let added = 0;
  for (const d of deals) {
    const id = String(d.id || d.dealId || '');
    if (!id) continue;
    const magic = Number(d.magic);
    const pnl = Number(d.pnl);
    const closedSec = Number(d.closedSec || d.time);
    if (!Number.isFinite(magic) || !Number.isFinite(pnl) || !Number.isFinite(closedSec)) continue;
    if (!state.deals[id]) added++;
    state.deals[id] = { magic, pnl: round(pnl, 2), closedSec, reason: Number(d.reason) || 0, symbol: String(d.symbol || '') };
  }
  // budama: 60 günden eski + kapak
  const cutoff = nowSec() - PRUNE_DAYS * 86400;
  let entries = Object.entries(state.deals).filter(([, v]) => v.closedSec >= cutoff);
  if (entries.length > MAX_DEALS) {
    entries.sort((a, b) => b[1].closedSec - a[1].closedSec);
    entries = entries.slice(0, MAX_DEALS);
  }
  state.deals = Object.fromEntries(entries);
  state.updatedAt = new Date().toISOString();
  if (added || deals.length) persist();
  return { ingested: added, total: Object.keys(state.deals).length };
}

/** sinceSec'ten beri kapanan işlemleri magic-bazlı topla → bot dökümü. */
function aggregate(sinceSec = 0) {
  load();
  const by = new Map();
  for (const d of Object.values(state.deals)) {
    if (d.closedSec < sinceSec) continue;
    let b = by.get(d.magic);
    if (!b) { b = { magic: d.magic, trades: 0, tp: 0, sl: 0, profit: 0, loss: 0, net: 0 }; by.set(d.magic, b); }
    b.trades++; b.net += d.pnl;
    if (d.pnl > 0) b.profit += d.pnl; else if (d.pnl < 0) b.loss += d.pnl;
    const isTp = d.reason === 5 ? true : d.reason === 4 ? false : d.pnl >= 0; // 5=TP, 4=SL
    if (isTp) b.tp++; else b.sl++;
  }
  return [...by.values()].map((b) => {
    const bot = magicToBot(b.magic);
    return { ...bot, magic: b.magic, trades: b.trades, tp: b.tp, sl: b.sl, profit: round(b.profit), loss: round(b.loss), net: round(b.net) };
  });
}

function hasData() { load(); return Object.keys(state.deals).length > 0; }
function summary() { load(); return { deals: Object.keys(state.deals).length, updatedAt: state.updatedAt }; }

module.exports = {
  ingest, aggregate, magicToBot, hasData, summary,
  GOLD_MAGIC,
  _dangerouslyResetForTest() { state = { deals: {}, updatedAt: null }; loaded = true; },
};
