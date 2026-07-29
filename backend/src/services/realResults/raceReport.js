'use strict';

/**
 * Günlük YARIŞ raporu — GERÇEK MT5 sonuçlarından bot lider tablosu.
 *
 * Kaynak: realResults store (broker-onaylı kapanışlar; Supabase'te kalıcı —
 * VPS silinse de geçmiş burada durur). Her gün 23:55 TR'de Telegram'a gider;
 * aynı veri /api/bot/race/leaderboard ile sitede yayınlanır.
 *
 * Kill-switch: RACE_REPORT_DISABLED=1.
 */

const store = require('./store');
const telegramService = require('../telegramService');
const signalDelivery = require('../signalDelivery');
const logger = require('../../utils/logger');

const TR_OFFSET_SEC = 3 * 3600; // Türkiye DST uygulamaz — sabit UTC+3

function pushDisabled() { return process.env.RACE_REPORT_DISABLED === '1'; }

function channel() {
  return process.env.TELEGRAM_TRADE_CHANNEL || signalDelivery.signalChannel() || '';
}

function trDayStartSec(nowSec = Math.floor(Date.now() / 1000)) {
  const tr = nowSec + TR_OFFSET_SEC;
  return tr - (tr % 86400) - TR_OFFSET_SEC;
}

function trDateLabel(nowSec = Math.floor(Date.now() / 1000)) {
  return new Date((nowSec + TR_OFFSET_SEC) * 1000).toISOString().slice(0, 10);
}

function money(v) {
  const n = Number(v) || 0;
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}$`;
}

function rowLabel(row) {
  return row && row.name ? String(row.name) : `Magic ${row ? row.magic : '?'}`;
}

function sortByNet(rows) {
  return [...rows].sort((a, b) => (b.net || 0) - (a.net || 0));
}

/**
 * Saf biçimlendirici — test edilebilir olsun diye IO'suz.
 * @param {Array} today  aggregate(trDayStart) çıktısı
 * @param {Array} total  aggregate(0) çıktısı
 * @param {string} dateLabel YYYY-MM-DD
 */
function buildMessage(today, total, dateLabel) {
  const lines = [`🏁 <b>GÜNLÜK YARIŞ RAPORU</b> (${dateLabel})`];
  const dayTrades = today.reduce((s, r) => s + (r.trades || 0), 0);
  const dayNet = today.reduce((s, r) => s + (r.net || 0), 0);
  if (!dayTrades) {
    lines.push('Bugün kapanan gerçek işlem yok.');
  } else {
    lines.push(`Bugün: <b>${dayTrades}</b> gerçek işlem · net <b>${money(dayNet)}</b>`);
    const madalya = ['🥇', '🥈', '🥉'];
    sortByNet(today).slice(0, 10).forEach((r, i) => {
      lines.push(`${madalya[i] || `${i + 1}.`} ${rowLabel(r)} — ${r.trades} işlem · `
        + `net <b>${money(r.net)}</b> (✅${r.tp}/🛑${r.sl})`);
    });
    if (today.length > 10) {
      const rest = sortByNet(today).slice(10);
      const restNet = rest.reduce((s, r) => s + (r.net || 0), 0);
      lines.push(`… ve ${rest.length} bot daha (net ${money(restNet)})`);
    }
  }
  const allTrades = total.reduce((s, r) => s + (r.trades || 0), 0);
  const allNet = total.reduce((s, r) => s + (r.net || 0), 0);
  if (allTrades) {
    lines.push('');
    lines.push(`📊 GENEL: ${allTrades} işlem · net <b>${money(allNet)}</b>`);
    sortByNet(total).slice(0, 5).forEach((r, i) => {
      lines.push(`${i + 1}. ${rowLabel(r)} — ${r.trades} işlem · net ${money(r.net)}`);
    });
  }
  lines.push('');
  lines.push('Tümü broker-onaylı GERÇEK sonuçlardır. Detay: borsakrali.com/bot');
  return lines.join('\n');
}

function leaderboard() {
  const sinceDay = trDayStartSec();
  return {
    date: trDateLabel(),
    today: sortByNet(store.aggregate(sinceDay)),
    total: sortByNet(store.aggregate(0)),
    updatedAt: store.summary().updatedAt,
  };
}

async function pushDaily() {
  if (pushDisabled()) return { telegram: 0, disabled: true };
  const chatId = channel();
  if (!chatId) return { telegram: 0, error: 'kanal-yok' };
  const board = leaderboard();
  const msg = buildMessage(board.today, board.total, board.date);
  try {
    const result = await telegramService.sendMessage(chatId, msg, 'HTML');
    const ok = result && result.success === true;
    logger.info(`🏁 Günlük yarış raporu — TG ${ok ? 1 : 0}`);
    return { telegram: ok ? 1 : 0 };
  } catch (error) {
    logger.error(`Yarış raporu gönderilemedi: ${error.message}`);
    return { telegram: 0, error: error.message };
  }
}

module.exports = { buildMessage, leaderboard, pushDaily, trDayStartSec, trDateLabel };
