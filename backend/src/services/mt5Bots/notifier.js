'use strict';

/**
 * mt5Bots bildirimcisi — MT5 bot ailesinin YENİ açılan pozisyonlarını Telegram
 * kanalına "Bot N · İsim" etiketiyle duyurur.
 *
 * Kullanıcı isteği (2026-07-21): "şu an sadece bot1 sinyal atıyor" — MT5 bot
 * ailesi yalnız paper yarış + köprü feed'ine yazıyordu, kanala hiç mesaj
 * atmıyordu. Bu modül observeSnapshot'ın openedPositions çıktısını kullanır:
 * yalnız GERÇEKTEN yeni açılan pozisyonlar (dedup'tan geçenler) duyurulur,
 * bot.seen kalıcı olduğu için restart sonrası mükerrer duyuru olmaz (NR7 dersi).
 *
 * Spam koruması: bot başına TEK toplu mesaj/tur + mesaj içi en çok MAX_LINES
 * sinyal ("… ve N sinyal daha"). Kill-switch: MT5_BOTS_PUSH_DISABLED=1.
 */

const telegram = require('../telegramService');
const delivery = require('../signalDelivery');
const { botLabel } = require('../botCompetition/botLabels');
const { getInstrument } = require('../forex/forexInstruments');
const { paperNotificationSuppressed } = require('../mt5TradeNotifier');

const MAX_LINES = 4;

function pushDisabled(botId) {
  return process.env.MT5_BOTS_PUSH_DISABLED === '1' || paperNotificationSuppressed(botId);
}

function fmt(value, symbol) {
  const precision = getInstrument(symbol)?.precision ?? 2;
  return Number(value).toFixed(precision);
}

function positionLines(pos) {
  const arrow = pos.side === 'long' ? '🟢 AL' : '🔴 SAT';
  const inst = getInstrument(pos.symbol);
  const name = inst ? inst.symbol : pos.symbol;
  const lines = [
    `${arrow} <b>${name}</b> · ${pos.timeframe || ''}`.trim(),
    `Giriş: <b>${fmt(pos.entry, pos.symbol)}</b> · 🛡 ${fmt(pos.stop, pos.symbol)}`,
  ];
  const tps = [];
  if (pos.target > 0) tps.push(`🎯 TP1: ${fmt(pos.target, pos.symbol)}`);
  if (pos.target2 > 0) tps.push(`TP2: ${fmt(pos.target2, pos.symbol)}`);
  if (tps.length) lines.push(tps.join('  ·  '));
  return lines.join('\n');
}

// Bot başına TEK toplu mesaj: başlık + en çok MAX_LINES sinyal bloğu.
function buildMessage(botId, positions) {
  const label = botLabel(botId);
  const header = label ? `🤖 <b>${label}</b>` : `🤖 <b>${botId}</b>`;
  const shown = positions.slice(0, MAX_LINES).map(positionLines);
  const extra = positions.length > MAX_LINES
    ? `\n… ve ${positions.length - MAX_LINES} sinyal daha` : '';
  return `${header}\n\n${shown.join('\n\n')}${extra}`;
}

/**
 * Yeni açılan pozisyonları kanala duyurur. positions = observeSnapshot().openedPositions.
 * Sessiz-başarısız: Telegram hatası sinyal turunu düşürmez.
 */
async function notifyOpened(botId, positions) {
  if (!Array.isArray(positions) || positions.length === 0) return { pushed: 0 };
  if (pushDisabled(botId)) {
    return {
      pushed: 0,
      disabled: process.env.MT5_BOTS_PUSH_DISABLED === '1',
      brokerOwned: paperNotificationSuppressed(botId),
    };
  }
  const chat = delivery.signalChannel();
  if (!chat) return { pushed: 0, noChannel: true };
  try {
    await telegram.sendMessage(chat, buildMessage(botId, positions), 'HTML');
    return { pushed: positions.length };
  } catch (_) {
    return { pushed: 0, failed: true };
  }
}

module.exports = { notifyOpened, buildMessage, pushDisabled, MAX_LINES };
