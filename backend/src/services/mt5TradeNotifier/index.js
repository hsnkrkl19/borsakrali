'use strict';

/**
 * mt5TradeNotifier — SİNYAL = İŞLEM (1:1 garantisi).
 *
 * Kullanıcı isteği (2026-07-21): "telegrama giden tüm sinyaller işlem olarak
 * muhakkak mt5 de açılacak, kapatılınca da kapatılacak. sinyal farklı işlem
 * farklı olmayacak."
 *
 * SORUN (derin analizin bulduğu mimari kopukluk): Telegram sinyalleri notifier/
 * tracker zincirinden, MT5 işlemleri ise competition/bridgeFeed zincirinden
 * doğuyordu → iki AYRI yol, kaçınılmaz sapma.
 *
 * ÇÖZÜM: MT5 GERÇEKLİĞİ Telegram'ı sürer. Köprü her turda MT5'teki açık
 * pozisyonlarını + kapanan deal'leri bildirir; burada daha önce duyurulmamış
 * olanlar için Telegram mesajı atılır. Böylece:
 *   • MT5'te açılan HER işlem → Telegram'da sinyal (kaçmaz)
 *   • MT5'te kapanan HER işlem → Telegram'da kapanış (kaçmaz)
 *   • Telegram'da olup MT5'te olmayan işlem → İMKÂNSIZ (kaynak MT5'in kendisi)
 *
 * Kalıcılık: bildirilenler diske/Supabase'e yazılır → yeniden başlatma aynı
 * işlemi TEKRAR duyurmaz (NR7 gölge spam olayının dersi).
 */

const fs = require('fs');
const path = require('path');
const botPersistence = require('../botPersistence');
const { magicToBot } = require('../realResults/store');
const { botLabel } = require('../botCompetition/botLabels');

const SUBDIR = 'mt5-notify';
const FILE = 'notified.json';
const DATA_DIR = process.env.BOT_DATA_DIR
  ? path.join(process.env.BOT_DATA_DIR, SUBDIR)
  : path.join(__dirname, '..', '..', 'data', SUBDIR);
const STATE_FILE = path.join(DATA_DIR, FILE);
const TEST_EPHEMERAL = process.env.NODE_ENV === 'test' && !process.env.MT5_NOTIFY_DATA_DIR;
const MAX_KEEP = 4000;          // bellek/dosya sınırı
const TTL_MS = 7 * 24 * 3600 * 1000;

let state = { opens: {}, closes: {}, updatedAt: null };
let loaded = false;

function nowISO() { return new Date().toISOString(); }
function disabled() { return process.env.MT5_TRADE_NOTIFY_DISABLED === '1'; }

function load() {
  if (loaded) return state;
  loaded = true;
  try {
    if (!TEST_EPHEMERAL && fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (raw && typeof raw === 'object') {
        state.opens = raw.opens && typeof raw.opens === 'object' ? raw.opens : {};
        state.closes = raw.closes && typeof raw.closes === 'object' ? raw.closes : {};
      }
    }
  } catch (_) { /* ilk çalıştırma */ }
  return state;
}

function prune() {
  const cut = Date.now() - TTL_MS;
  for (const bag of [state.opens, state.closes]) {
    const keys = Object.keys(bag);
    for (const k of keys) if (!(bag[k] > cut)) delete bag[k];
    if (Object.keys(bag).length > MAX_KEEP) {
      const sorted = Object.entries(bag).sort((a, b) => a[1] - b[1]);
      for (const [k] of sorted.slice(0, sorted.length - MAX_KEEP)) delete bag[k];
    }
  }
}

function persist() {
  state.updatedAt = nowISO();
  if (TEST_EPHEMERAL) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
  } catch (_) { /* yut */ }
  try { botPersistence.save(SUBDIR, FILE, state); } catch (_) { /* yut */ }
}

function fmt(v, d = 5) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const dec = abs >= 1000 ? 2 : abs >= 10 ? 3 : d;
  return n.toFixed(dec);
}
function dirWord(d) { return String(d).toLowerCase() === 'long' ? 'LONG 🟢⬆️' : 'SHORT 🔴⬇️'; }

function headerFor(magic) {
  const bot = magicToBot(magic);
  const label = bot.no ? botLabel(bot.botId) : bot.name;
  return `🤖 <b>${label || bot.name}</b>`;
}

function openMessage(p) {
  return [
    headerFor(p.magic),
    `📊 <b>${p.symbol}</b> · <b>${dirWord(p.direction)}</b> · ${p.lot} lot`,
    `Giriş: <b>${fmt(p.price)}</b>`,
    `🛑 SL: <b>${fmt(p.sl)}</b> · 🎯 TP: <b>${fmt(p.tp)}</b>`,
    `🎫 <code>#${p.ticket}</code> · MT5'te AÇILDI`,
  ].join('\n');
}

function closeMessage(d) {
  const pnl = Number(d.pnl) || 0;
  const icon = pnl > 0 ? '✅' : pnl < 0 ? '🛑' : '⚪';
  const word = pnl > 0 ? 'KÂR' : pnl < 0 ? 'ZARAR' : 'BAŞABAŞ';
  return [
    headerFor(d.magic),
    `${icon} <b>${d.symbol}</b> · <b>KAPANDI</b> (${d.reason || word})`,
    `K/Z: <b>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</b>`,
    `🎫 <code>#${d.id}</code>`,
  ].join('\n');
}

async function send(text) {
  const telegram = require('../telegramService');
  const { signalChannel } = require('../signalDelivery');
  const chatId = process.env.TELEGRAM_TRADE_CHANNEL || signalChannel();
  if (!chatId) return false;
  await telegram.sendMessage(chatId, text, 'HTML');
  return true;
}

/**
 * Köprünün bildirdiği canlı MT5 durumunu işler.
 * @param {{open:Array, closed:Array}} payload
 * @returns {Promise<{openNotified:number, closeNotified:number, skipped:number}>}
 */
async function ingestState(payload = {}) {
  load();
  if (disabled()) return { openNotified: 0, closeNotified: 0, skipped: 0, disabled: true };

  const open = Array.isArray(payload.open) ? payload.open : [];
  const closed = Array.isArray(payload.closed) ? payload.closed : [];
  let openNotified = 0, closeNotified = 0, skipped = 0;

  for (const p of open) {
    const key = String(p && p.ticket || '');
    if (!key || state.opens[key]) { skipped++; continue; }
    state.opens[key] = Date.now();      // ÖNCE işaretle (gönderim patlarsa bile tekrar deneme spam'i olmasın)
    try { if (await send(openMessage(p))) openNotified++; } catch (_) { /* yut */ }
  }
  for (const d of closed) {
    const key = String(d && d.id || '');
    if (!key || state.closes[key]) { skipped++; continue; }
    state.closes[key] = Date.now();
    try { if (await send(closeMessage(d))) closeNotified++; } catch (_) { /* yut */ }
  }

  if (openNotified || closeNotified) { prune(); persist(); }
  return { openNotified, closeNotified, skipped };
}

function stats() {
  load();
  return { opens: Object.keys(state.opens).length, closes: Object.keys(state.closes).length, updatedAt: state.updatedAt };
}

function resetForTest() { state = { opens: {}, closes: {}, updatedAt: null }; loaded = true; }

module.exports = { ingestState, stats, openMessage, closeMessage, resetForTest };
