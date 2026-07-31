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

const DATA_DIR = process.env.REAL_RESULTS_DATA_DIR
  || (process.env.BOT_DATA_DIR
    ? path.join(process.env.BOT_DATA_DIR, 'real-results')
    : path.join(__dirname, '..', '..', 'data', 'real-results'));
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
function finite(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function clean(v) { return v == null ? '' : String(v).trim(); }
function accountFields(raw = {}, context = {}) {
  const nested = raw && raw.account && typeof raw.account === 'object' ? raw.account : {};
  const primitive = raw && raw.account !== null && typeof raw.account !== 'object' ? raw.account : null;
  const fallback = context && context.account && typeof context.account === 'object' ? context.account : context;
  return {
    accountLogin: clean(raw.accountLogin ?? raw.login ?? raw.accountNumber
      ?? nested.accountLogin ?? nested.login ?? nested.accountNumber
      ?? primitive ?? fallback.accountLogin ?? fallback.login ?? fallback.accountNumber),
    accountServer: clean(raw.accountServer ?? raw.server ?? raw.brokerServer
      ?? nested.accountServer ?? nested.server ?? nested.brokerServer
      ?? fallback.accountServer ?? fallback.server ?? fallback.brokerServer),
  };
}
function accountScope(raw = {}) {
  const { accountLogin, accountServer } = accountFields(raw);
  if (!accountLogin && !accountServer) return '';
  return `${encodeURIComponent(accountLogin || '?')}@${encodeURIComponent(accountServer.toUpperCase() || '?')}`;
}
function dealStorageKey(deal) {
  const scope = accountScope(deal);
  return scope ? `${scope}|${deal.id}` : deal.id;
}
function codeFrom(raw) {
  const value = clean(raw && (raw.code || raw.signalId || raw.comment));
  const prefixed = /^(?:A|BK|BKG)#(.+)$/i.exec(value);
  return clean(prefixed ? prefixed[1] : value).slice(0, 96);
}

// MetaTrader 5 DEAL_REASON values.  Keep the numeric code as well: brokers may
// add a value that this backend version does not know yet.
const REASON_LABELS = Object.freeze({
  0: 'terminal/client', 1: 'mobile', 2: 'web', 3: 'expert-advisor',
  4: 'stop-loss', 5: 'take-profit', 6: 'stop-out', 7: 'rollover',
  8: 'variation-margin', 9: 'split', 10: 'corporate-action',
});
function reasonLabel(code, supplied) {
  const named = clean(supplied);
  if (named && !/^\d+$/.test(named)) return named;
  const n = finite(code);
  return n !== null && REASON_LABELS[n] ? REASON_LABELS[n] : (n !== null ? `mt5-reason-${n}` : 'broker-exit');
}

/**
 * Canonical broker exit deal.  A close must have a broker deal id, magic,
 * close timestamp and financial result.  If the bridge supplies the raw
 * profit/commission/swap components (plus the central daemon's optional signed
 * `fee`), net P/L is recomputed here; otherwise legacy `pnl` is treated as the
 * already-net broker amount.
 */
function normalizeExitDeal(raw, context = {}) {
  if (!raw || typeof raw !== 'object' || raw.isExit === false) return null;
  const entry = clean(raw.entry).toLowerCase();
  // MT5 DEAL_ENTRY_IN is numeric 0; textual bridges commonly send "in".
  // Missing entry remains accepted for the legacy bridge, which pre-filters
  // history_deals_get to DEAL_ENTRY_OUT before posting.
  if (entry === 'in' || entry === '0') return null;
  const id = clean(raw.dealId || raw.id || raw.dealTicket);
  const magic = finite(raw.magic);
  const closedSec = finite(raw.closedSec || raw.closedAtSec || raw.time);
  const hasComponents = finite(raw.profit) !== null;
  const legacyNet = finite(raw.netPnl ?? raw.pnl);
  if (!id || magic === null || magic <= 0 || closedSec === null || closedSec <= 0
    || (!hasComponents && legacyNet === null)) return null;
  const profit = hasComponents ? (finite(raw.profit) || 0) : legacyNet;
  const commission = hasComponents ? (finite(raw.commission) || 0) : null;
  const swap = hasComponents ? (finite(raw.swap) || 0) : null;
  const fee = hasComponents ? (finite(raw.fee) || 0) : finite(raw.fee);
  // `fee` is a signed extra broker charge used by the central daemon. Legacy
  // `pnl` is already net and must not have the fee applied a second time.
  const pnl = hasComponents ? profit + commission + swap + fee : legacyNet;
  const reasonCode = finite(raw.reasonCode ?? raw.reason);
  const account = accountFields(raw, context);
  return {
    id, magic, pnl: round(pnl, 2), netPnl: round(pnl, 2),
    profit: round(profit, 2),
    commission: commission === null ? null : round(commission, 2),
    swap: swap === null ? null : round(swap, 2),
    fee: fee === null ? null : round(fee, 2),
    componentsExact: hasComponents,
    closedSec,
    reasonCode: reasonCode === null ? null : reasonCode,
    reason: reasonLabel(reasonCode, raw.reasonText || (typeof raw.reason === 'string' ? raw.reason : '')),
    symbol: clean(raw.symbol), direction: clean(raw.direction || raw.side).toLowerCase(),
    exitPrice: finite(raw.exitPrice ?? raw.priceExit ?? raw.price),
    positionTicket: clean(raw.positionTicket || raw.positionId || raw.openTicket),
    positionIdentifier: clean(raw.positionIdentifier || raw.position_identifier),
    code: codeFrom(raw), volume: finite(raw.volume ?? raw.lot), ...account,
  };
}

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

/**
 * D3g — ENSTRÜMAN KARNESİ: sembol+yön çiftinin gerçek karnesi.
 * Kesme yapmaz, yalnız görünürlük sağlar: "XAUUSD long −820 $ / 9 işlem".
 * Kazanma sayısı `pnl > 0` ile ölçülür (reason koduna güvenilmez: beyin
 * kapattığında MT5 sebebi 3 = expert-advisor döner, TP/SL değil).
 */
function aggregateBySymbol(sinceSec = 0) {
  load();
  const by = new Map();
  for (const d of Object.values(state.deals)) {
    if (d.closedSec < sinceSec) continue;
    const symbol = d.symbol || '—';
    const direction = d.direction === 'short' || d.direction === 'sell' ? 'short' : 'long';
    const key = `${symbol}|${direction}`;
    let b = by.get(key);
    if (!b) { b = { symbol, direction, trades: 0, wins: 0, losses: 0, net: 0 }; by.set(key, b); }
    b.trades++; b.net += d.pnl;
    if (d.pnl > 0) b.wins++; else if (d.pnl < 0) b.losses++;
  }
  return [...by.values()].map((b) => ({ ...b, net: round(b.net) }));
}

/**
 * D1g — BOT KARNESİ: yeterli örneklem biriktirmiş, net zararda ve isabeti
 * düşük botlar. Otomatik eleme YOK (kullanıcı kararı D4: yalnız rapor).
 */
function scorecard(sinceSec = 0) {
  load();
  const by = new Map();
  for (const d of Object.values(state.deals)) {
    if (d.closedSec < sinceSec) continue;
    let b = by.get(d.magic);
    if (!b) { b = { magic: d.magic, trades: 0, wins: 0, losses: 0, net: 0 }; by.set(d.magic, b); }
    b.trades++; b.net += d.pnl;
    if (d.pnl > 0) b.wins++; else if (d.pnl < 0) b.losses++;
  }
  return [...by.values()].map((b) => ({
    ...magicToBot(b.magic), magic: b.magic, trades: b.trades, wins: b.wins,
    losses: b.losses, net: round(b.net),
    winRate: b.trades ? Math.round((b.wins / b.trades) * 100) : 0,
  }));
}

/** Köprüden gelen deal listesini içeri al (dedup + budama). */
function ingest(deals, context = {}) {
  load();
  if (!Array.isArray(deals)) return { ingested: 0, invalid: 0, total: Object.keys(state.deals).length };
  let added = 0, invalid = 0;
  for (const raw of deals) {
    const d = normalizeExitDeal(raw, context);
    if (!d) { invalid++; continue; }
    const storageKey = dealStorageKey(d);
    if (!state.deals[storageKey] && storageKey !== d.id && state.deals[d.id]
      && !accountScope(state.deals[d.id])) {
      state.deals[storageKey] = state.deals[d.id];
      delete state.deals[d.id];
    }
    if (!state.deals[storageKey]) added++;
    // Repeated seven-day bridge batches must not erase richer fields previously
    // supplied by a state/deal payload.  Only defined values replace old ones.
    const old = state.deals[storageKey] || {};
    const merged = { ...old };
    for (const [key, value] of Object.entries(d)) {
      if (old.componentsExact && !d.componentsExact
        && ['profit', 'commission', 'swap', 'fee', 'pnl', 'netPnl', 'componentsExact'].includes(key)) continue;
      if (value !== undefined && value !== null && value !== '') merged[key] = value;
    }
    state.deals[storageKey] = merged;
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
  return { ingested: added, invalid, total: Object.keys(state.deals).length };
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
    const reasonCode = d.reasonCode ?? d.reason;
    const isTp = reasonCode === 5 ? true : reasonCode === 4 ? false : d.pnl >= 0; // 5=TP, 4=SL
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
  ingest, aggregate, aggregateBySymbol, scorecard,
  magicToBot, hasData, summary, normalizeExitDeal, reasonLabel,
  GOLD_MAGIC,
  _dangerouslyResetForTest() { state = { deals: {}, updatedAt: null }; loaded = true; },
};
