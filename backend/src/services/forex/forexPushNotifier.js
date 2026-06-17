/**
 * Forex Push Notifier — Telegram ANA kanal + uygulama-içi (FCM) tek kullanıcı.
 *
 * Güçlü (confidence ≥ eşik) çoklu-TF forex sinyallerini hem Telegram ana kanala
 * hem de tek kullanıcıya (hsnkrkl19@gmail.com) anlık push olarak gönderir.
 * Her (enstrüman, TF, yön) için 30 dk cooldown → her dk tarama spam yapmaz.
 * Mesaj MetaTrader5 emir detayını içerir (kullanıcı MT5'te işlem yapacak).
 */

const telegramService = require('../telegramService');
const pushNotificationService = require('../pushNotificationService');
const logger = require('../../utils/logger');

const PUSH_CONFIDENCE = 65;
const COOLDOWN_MS = 30 * 60 * 1000;
const TARGET_USER_EMAIL = process.env.FOREX_PUSH_EMAIL || 'hsnkrkl19@gmail.com';

const lastSent = new Map(); // `${id}:${tf}:${dir}` -> ts

function fmt(v, p) { return v == null ? '-' : Number(v).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p }); }
function usd(v, d = 0) { return v == null ? '-' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: d }); }

function buildTelegram(s) {
  const p = s.precision ?? 4;
  const z = s.sizing || {}, pnl = s.pnl || {};
  const votes = (s.votes || []).filter(v => v.vote !== 'neutral').map(v => `${v.technique}:${v.vote === 'long' ? 'AL' : 'SAT'}`).join(' ');
  return [
    `📊 <b>FOREX ${s.action} — ${s.symbol} (${s.tf})</b>`,
    `Güven: <b>${s.confidence}/100</b> (${s.grade}) · ${s.sameTfCount || 1}/5 TF uyum · ${s.horizon}`,
    ``,
    `Giriş: <b>${fmt(s.entry, p)}</b> (piyasa)`,
    `Stop: ${fmt(s.stop, p)}  |  TP1: ${fmt(s.target1, p)} (R/R ${s.rr1})  |  TP2: ${fmt(s.target2, p)} (R/R ${s.rr2})`,
    ``,
    `💼 Lot: <b>${z.lots}</b> · Marj: ${usd(z.requiredMarginUsd)} (${z.marginPct}%)`,
    `Risk: ${usd(z.riskUsd, 2)} (%${z.riskPct}) · TP1 kâr: ${usd(pnl.tp1ProfitUsd)} · TP2 kâr: ${usd(pnl.tp2ProfitUsd)}`,
    ``,
    `🤖 MT5: <code>${s.mt5?.summary || ''}</code>`,
    votes ? `Teknikler: ${votes}` : '',
  ].filter(Boolean).join('\n');
}

function buildAppPush(s) {
  const p = s.precision ?? 4;
  const z = s.sizing || {};
  return {
    title: `${s.action} ${s.symbol} ${s.tf} · Güven ${s.confidence}`,
    body: `Giriş ${fmt(s.entry, p)} · SL ${fmt(s.stop, p)} · TP1 ${fmt(s.target1, p)} · ${z.lots} lot (risk ${usd(z.riskUsd, 0)})`,
    path: '/firsatlar?tab=forex',
    channelId: 'borsa-krali-announcements',
  };
}

async function evaluateAndPush(signals) {
  // Üretim kill-switch'i — FOREX_PUSH_DISABLED=1 ise hiç push atmaz (test/bakım).
  if (process.env.FOREX_PUSH_DISABLED === '1') return { telegram: 0, app: 0, considered: 0, disabled: true };
  const chatId = process.env.TELEGRAM_CHAT_ID || '';
  const now = Date.now();
  let tg = 0, app = 0, considered = 0;

  for (const s of (signals || [])) {
    if (s.confidence < PUSH_CONFIDENCE) continue;
    const key = `${s.id}:${s.tf}:${s.direction}`;
    if (now - (lastSent.get(key) || 0) < COOLDOWN_MS) continue;
    considered++;

    if (chatId) {
      try { const r = await telegramService.sendMessage(chatId, buildTelegram(s)); if (r?.success) tg++; }
      catch (e) { logger.error(`[ForexPush] telegram ${key}: ${e.message}`); }
    }
    try { const r = await pushNotificationService.sendToUser(TARGET_USER_EMAIL, buildAppPush(s)); if (r?.success) app++; }
    catch (e) { logger.error(`[ForexPush] app ${key}: ${e.message}`); }

    lastSent.set(key, now); // eşik aşıldıysa cooldown başlat (spam önleme)
  }
  return { telegram: tg, app, considered };
}

module.exports = { evaluateAndPush, buildTelegram, PUSH_CONFIDENCE, TARGET_USER_EMAIL };
