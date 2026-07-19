/**
 * bistSignalNotifier — BIST ≥75 LONG sinyallerini Telegram ana kanal + TÜM
 * uygulama kullanıcılarına (broadcast) gönderir; TP/SL olunca aynı NO ile teyit.
 *
 * Forex push'undan farkı: app tarafında tek hesaba `sendToUser` yerine
 * `broadcastNotification` (FCM topic + Socket.IO + 🔔 "Hisse Sinyalleri").
 * Eşik BIST_SIGNAL_MIN_CONFIDENCE (vars. 75). Kill-switch BIST_SIGNAL_PUSH_DISABLED=1.
 */

const telegramService = require('../telegramService');
const pushNotificationService = require('../pushNotificationService');
const tracker = require('./bistSignalTracker');   // yalnız cutover: eski açık sinyalleri bir kez adopt
const sigBot = require('../bistPortfolio/signalPortfolioBot');   // portföy defteri + AL/SAT/STOP/TP + broadcast
const logger = require('../../utils/logger');

const MIN_CONFIDENCE = (() => { const v = Number(process.env.BIST_SIGNAL_MIN_CONFIDENCE); return Number.isFinite(v) ? v : 75; })();
const UPDATE_COOLDOWN_MS = 30 * 60 * 1000;    // aynı pozisyon güncelleme spam'ini engelle
const DEEP_LINK = '/firsatlar?tab=sinyaller';
const CHANNEL_ID = 'borsa-krali-announcements';

const lastSent = new Map();                   // code -> ts

function withTimeout(promise, ms, label) {
  return Promise.race([Promise.resolve(promise), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms))]);
}
function fmt(v, p = 2) { return v == null ? '-' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: p, maximumFractionDigits: p }); }
// YALNIZ kendi kanalına (TELEGRAM_BIST_CHANNEL). Ayarlı DEĞİLSE Telegram'a
// GÖNDERMEZ — hisse (BIST) sinyali ana/kripto kanalına (signalChannel) SIZMASIN.
// (Eski davranış signalChannel'a düşüyordu → kripto kanalında hisse önerisi görünüyordu.)
// Broadcast (uygulama-içi) AYRI, etkilenmez.
function chatId() { return process.env.TELEGRAM_BIST_CHANNEL || ''; }

// ── Saf mesaj kurucular (test edilebilir) ───────────────────────────────────
function buildNewTelegram(p) {
  const pr = p.precision ?? 2;
  const lines = [
    `📈 <b>BIST LONG (Spot Al) — ${p.symbol}</b> · <b>#${p.code}</b>`,
    p.name && p.name !== p.symbol ? p.name : null,
    `Güven: <b>${p.confidence}/100</b> (${p.grade || ''})`.trim(),
    `Giriş: <b>${fmt(p.entry, pr)} TL</b>`,
    `Stop: ${fmt(p.stop, pr)} | TP1: ${fmt(p.target1, pr)} (R/R ${p.rr1}) | TP2: ${fmt(p.target2, pr)} (R/R ${p.rr2})`,
    `⏳ ${p.horizon || 'SWING'} · TP/SL olunca #${p.code} ile bildirilecek`,
  ];
  return lines.filter(Boolean).join('\n');
}

function buildUpdateTelegram(p, ev) {
  const pr = p.precision ?? 2;
  const lines = [`🔄 <b>GÜNCELLEME — #${p.code} ${p.symbol} LONG</b>`];
  if (ev.stopChanged) lines.push(`🛡 İz süren STOP: ${fmt(ev.prev.stop, pr)} → <b>${fmt(p.stop, pr)}</b>`);
  if (ev.tpChanged) lines.push(`🎯 TP1: ${fmt(ev.prev.target1, pr)} → ${fmt(p.target1, pr)} · TP2: ${fmt(ev.prev.target2, pr)} → ${fmt(p.target2, pr)}`);
  lines.push(`Güven: ${p.confidence}/100`);
  return lines.join('\n');
}

function buildBroadcastNew(p) {
  const pr = p.precision ?? 2;
  return {
    title: `📈 #${p.code} ${p.symbol} LONG · Güven ${p.confidence}`,
    body: `Spot al sinyali (${p.grade || ''}) — Giriş ${fmt(p.entry, pr)} · SL ${fmt(p.stop, pr)} · TP1 ${fmt(p.target1, pr)} · TP2 ${fmt(p.target2, pr)}`,
    category: 'signal', path: DEEP_LINK, channelId: CHANNEL_ID, topic: 'all',
  };
}

function buildBroadcastUpdate(p) {
  const pr = p.precision ?? 2;
  return {
    title: `🔄 #${p.code} ${p.symbol} güncellendi`,
    body: `İz süren SL ${fmt(p.stop, pr)} · TP1 ${fmt(p.target1, pr)} · TP2 ${fmt(p.target2, pr)} · Güven ${p.confidence}`,
    category: 'signal', path: DEEP_LINK, channelId: CHANNEL_ID, topic: 'all',
  };
}

function closureHead(outcome) {
  if (outcome === 'TP1') return '✅ <b>TP OLDU (Hedef)</b>';
  if (outcome === 'SL') return '🛑 <b>STOP OLDU</b>';
  return '⏱️ <b>SÜRE DOLDU (kapandı)</b>';
}
function buildClosureTelegram(ev) {
  const pr = ev.precision ?? 2;
  const sign = ev.pnlPct >= 0 ? '+' : '';
  return [
    `${closureHead(ev.outcome)} — <b>#${ev.code}</b> ${ev.symbol} LONG`,
    `Giriş ${fmt(ev.entry, pr)} → Çıkış ${fmt(ev.exit, pr)}${ev.exitDate ? ` (${ev.exitDate})` : ''}`,
    `Sonuç: <b>${sign}${ev.pnlPct}%</b>`,
  ].join('\n');
}
function buildBroadcastClosure(ev) {
  const pr = ev.precision ?? 2;
  const sign = ev.pnlPct >= 0 ? '+' : '';
  const head = ev.outcome === 'TP1' ? '✅ TP' : ev.outcome === 'SL' ? '🛑 STOP' : '⏱️ Süre doldu';
  return {
    title: `${head} · #${ev.code} ${ev.symbol}`,
    body: `${sign}${ev.pnlPct}% · Giriş ${fmt(ev.entry, pr)} → ${fmt(ev.exit, pr)}`,
    category: 'signal', path: DEEP_LINK, channelId: CHANNEL_ID, topic: 'all',
  };
}

// ── Gönderim — PORTFÖY yolu ──────────────────────────────────────────────────
// ≥75 LONG adayları risk-bazlı AL (held-guard) + açık pozisyonları yönet
// (SAT/STOP/TP — yalnız listOpen()). Telegram (kendi kanalı) + uygulama broadcast
// + site. Kill-switch (BIST_SIGNAL_PUSH_DISABLED) yalnız EMİSYONU susturur; defter sürer.
async function evaluateAndPush(signals) {
  const eligible = (signals || []).filter(s => s && s.direction === 'long' && s.confidence >= MIN_CONFIDENCE);
  // Cutover: eski tracker'ın açık sinyallerini bir kez portföye adopt et (orphan yok)
  try { await sigBot.adoptLegacy(await tracker.getOpen()); }
  catch (e) { logger.warn(`[BistPortfolio] adopt atlandı: ${e.message}`); }

  const buy = await sigBot.openBuys(eligible);
  const manage = await sigBot.manageAndReport(new Set(eligible.map(s => s.symbol)));
  return { telegram: buy.telegramSent || 0, app: buy.appSent || 0, considered: buy.openedCount, closed: manage.closed, eligible: eligible.length };
}

// 5dk tick: yalnız STOP/TP/timeout/trailing (taze tarama yok → strateji SAT değil)
async function tickManage() {
  const r = await sigBot.manageAndReport(undefined);
  return { closed: r.closed || 0 };
}

// Günlük portföy özeti — portföy botuna delege (Telegram + broadcast)
async function pushDailySummary(opts = {}) { return sigBot.pushDailySummary(opts); }

function getSnapshot() { return sigBot.getSnapshot(); }

module.exports = {
  evaluateAndPush, tickManage, pushDailySummary, getSnapshot,
  // Eski saf kurucular (deprecation penceresi)
  buildNewTelegram, buildUpdateTelegram, buildBroadcastNew, buildBroadcastUpdate,
  buildClosureTelegram, buildBroadcastClosure,
  MIN_CONFIDENCE, DEEP_LINK,
};
