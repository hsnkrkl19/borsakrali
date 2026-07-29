'use strict';

/**
 * Telegram delivery for the ICT/FVG paper strategy.
 *
 * Position tracking is always performed. ICT_FVG_PUSH_DISABLED=1 disables only
 * Telegram delivery, so paper competition results keep advancing independently.
 */

const telegramService = require('../telegramService');
const signalDelivery = require('../signalDelivery');
const tracker = require('./ictFvgTracker');
const logger = require('../../utils/logger');
const { paperNotificationSuppressed } = require('../mt5TradeNotifier');

function pushDisabled() {
  return process.env.ICT_FVG_PUSH_DISABLED === '1' || paperNotificationSuppressed('ict-fvg');
}

function channel() {
  return process.env.TELEGRAM_ICT_FVG_CHANNEL || signalDelivery.signalChannel() || '';
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fmt(value, precision = 4) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(Math.max(0, Math.min(8, precision))) : '-';
}

function directionLabel(direction) {
  return direction === 'long' ? 'LONG (AL)' : 'SHORT (SAT)';
}

function buildOpenMessage(position) {
  const p = Number.isInteger(position.precision) ? position.precision : 4;
  const risk = Math.abs(position.entry - position.stop);
  const rr = risk > 0 ? Math.abs(position.target1 - position.entry) / risk : null;
  const lines = [
    `🤖 <b>${require('../botCompetition/botLabels').botLabel('ict-fvg')}</b>`,
    `🧠 <b>ICT / FVG</b> · <b>${escapeHtml(position.symbol)}</b>`,
    `Yön: <b>${directionLabel(position.direction)}</b> · Uygulama: ${escapeHtml(position.fillTf || '5m')}`,
    '',
    `Giriş (kapalı 5dk mum): <b>${fmt(position.entry, p)}</b>`,
    `🛡 Stop: ${fmt(position.stop, p)}`,
    `🎯 TP1: ${fmt(position.target1, p)}${position.target2 != null ? ` · TP2: ${fmt(position.target2, p)}` : ''}`,
  ];
  if (rr != null) lines.push(`R/R: ${rr.toFixed(2)}`);
  lines.push('', `Sinyal: <code>${escapeHtml(position.signalId)}</code>`);
  lines.push('ℹ️ Paper yarış kaydıdır; gerçek emir değildir. Yatırım tavsiyesi değildir.');
  return lines.join('\n');
}

function buildCloseMessage(closure) {
  const p = Number.isInteger(closure.precision) ? closure.precision : 4;
  const title = closure.outcome === 'TP1'
    ? '✅ TP1'
    : closure.outcome === 'SL'
      ? '🛑 STOP'
      : closure.outcome === 'FLIP'
        ? '🔄 YÖN DEĞİŞİMİ'
        : '⏱ SÜRE DOLDU';
  const pnl = Number(closure.pnlPct);
  return [
    `🧠 <b>ICT / FVG</b> · <b>${escapeHtml(closure.symbol)}</b>`,
    `<b>${title}</b> · ${directionLabel(closure.direction)}`,
    `Giriş ${fmt(closure.entry, p)} → Çıkış <b>${fmt(closure.exit, p)}</b>`,
    `Sonuç: <b>${Number.isFinite(pnl) && pnl > 0 ? '+' : ''}${Number.isFinite(pnl) ? pnl.toFixed(3) : '-'}%</b>`,
    `Sinyal: <code>${escapeHtml(closure.signalId)}</code>`,
  ].join('\n');
}

async function send(text) {
  const chatId = channel();
  if (!chatId || pushDisabled()) return false;
  try {
    const result = await telegramService.sendMessage(chatId, text, 'HTML');
    return result && result.success === true;
  } catch (error) {
    logger.error(`[ICT/FVG] Telegram gönderimi başarısız: ${error.message}`);
    return false;
  }
}

async function pushOpenings(positions) {
  const rows = Array.isArray(positions) ? positions : [];
  if (pushDisabled()) return { telegram: 0, considered: rows.length, disabled: true };
  let telegram = 0;
  for (const position of rows) {
    if (await send(buildOpenMessage(position))) telegram++;
  }
  return { telegram, considered: rows.length, disabled: false };
}

async function pushClosures(closures) {
  const rows = Array.isArray(closures) ? closures : [];
  if (pushDisabled()) return { telegram: 0, considered: rows.length, disabled: true };
  let telegram = 0;
  for (const closure of rows) {
    if (await send(buildCloseMessage(closure))) telegram++;
  }
  return { telegram, considered: rows.length, disabled: false };
}

/** Register engine fills, then notify any flip closures and new openings. */
async function evaluateAndPush(signals) {
  const result = await tracker.syncSignals(signals);
  const closedPush = await pushClosures(result.closures);
  const openPush = await pushOpenings(result.opened);
  return {
    ...result,
    telegram: closedPush.telegram + openPush.telegram,
    disabled: pushDisabled(),
  };
}

/** Evaluate exits, then deliver their confirmations. */
async function checkAndPushClosures() {
  const closures = await tracker.checkClosures();
  const pushed = await pushClosures(closures);
  return { closures, telegram: pushed.telegram, disabled: pushDisabled() };
}

module.exports = {
  evaluateAndPush,
  checkAndPushClosures,
  pushOpenings,
  pushClosures,
  buildOpenMessage,
  buildCloseMessage,
  pushDisabled,
  channel,
};
