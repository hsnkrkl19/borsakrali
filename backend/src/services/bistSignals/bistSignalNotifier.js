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
const tracker = require('./bistSignalTracker');
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

// ── Gönderim ─────────────────────────────────────────────────────────────────
async function evaluateAndPush(signals) {
  if (process.env.BIST_SIGNAL_PUSH_DISABLED === '1') return { telegram: 0, app: 0, considered: 0, disabled: true };
  const eligible = (signals || []).filter(s => s && s.direction === 'long' && s.confidence >= MIN_CONFIDENCE);

  let events = [];
  try { events = await withTimeout(tracker.syncPositions(eligible), 12000, 'sync'); }
  catch (e) { logger.error(`[BistSignal] sync: ${e.message}`); return { telegram: 0, app: 0, considered: 0, eligible: eligible.length }; }

  const cid = chatId();
  const now = Date.now();
  let tg = 0, app = 0, sent = 0;
  for (const ev of events) {
    const p = ev.position;
    if (ev.type === 'update') {
      const last = lastSent.get(p.code) || 0;
      if (now - last < UPDATE_COOLDOWN_MS) continue;
    }
    const tgMsg = ev.type === 'new' ? buildNewTelegram(p) : buildUpdateTelegram(p, ev);
    const appMsg = ev.type === 'new' ? buildBroadcastNew(p) : buildBroadcastUpdate(p);
    if (cid) { try { const r = await withTimeout(telegramService.sendMessage(cid, tgMsg), 16000, 'tg'); if (r && r.success) tg++; } catch (e) { logger.error(`[BistSignal] tg #${p.code}: ${e.message}`); } }
    try { const r = await withTimeout(pushNotificationService.broadcastNotification(appMsg), 12000, 'app'); if (r && r.success) app++; } catch (e) { logger.error(`[BistSignal] app #${p.code}: ${e.message}`); }
    lastSent.set(p.code, now);
    sent++;
  }
  return { telegram: tg, app, considered: sent, eligible: eligible.length, chatSet: !!cid };
}

async function pushClosures(events) {
  if (process.env.BIST_SIGNAL_PUSH_DISABLED === '1') return { telegram: 0, app: 0 };
  const cid = chatId();
  let tg = 0, app = 0;
  for (const ev of (events || [])) {
    if (cid) { try { const r = await withTimeout(telegramService.sendMessage(cid, buildClosureTelegram(ev)), 16000, 'closeTg'); if (r && r.success) tg++; } catch (e) { logger.error(`[BistSignal] closeTg #${ev.code}: ${e.message}`); } }
    try { const r = await withTimeout(pushNotificationService.broadcastNotification(buildBroadcastClosure(ev)), 12000, 'closeApp'); if (r && r.success) app++; } catch (e) { logger.error(`[BistSignal] closeApp #${ev.code}: ${e.message}`); }
  }
  if (tg || app) logger.info(`📈✅ BIST sinyal kapanış — ${events.length} · TG ${tg} · App ${app}`);
  return { telegram: tg, app };
}

module.exports = {
  evaluateAndPush, pushClosures,
  buildNewTelegram, buildUpdateTelegram, buildBroadcastNew, buildBroadcastUpdate,
  buildClosureTelegram, buildBroadcastClosure,
  MIN_CONFIDENCE, DEEP_LINK,
};
