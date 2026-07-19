'use strict';

/**
 * Günlük Bot Raporu — her akşam Telegram'a tüm botların gün-içi istatistiği.
 *
 * Örnek satır: "Bot 1 · Forex Sinyalleri — 5 işlem · 3 TP · 2 SL · net +12.40$"
 * Kaynaklar: botCompetition (15 numaralı bot, kağıt işlemler) + custom botlar
 * (kullanıcı botları) + opsiyonel altın botu (gerçek MT5, toplam).
 *
 * Hedef: env TELEGRAM_DAILY_REPORT_CHANNEL yoksa ana sinyal kanalı.
 * Kill: BOT_DAILY_REPORT_DISABLED=1.
 */

const competitionManager = require('../botCompetition/competitionManager');
const customBotRunner = require('../botBuilder/customBotRunner');
const telegramService = require('../telegramService');
const signalDelivery = require('../signalDelivery');

function trDayStartMs(now = Date.now()) {
  const shifted = new Date(now + 3 * 3600 * 1000); // TR = UTC+3
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 3 * 3600 * 1000;
}
function trDateLabel(now = Date.now()) {
  const d = new Date(now + 3 * 3600 * 1000);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}
function usd(v) { const n = Number(v) || 0; return `${n >= 0 ? '+' : ''}${n.toFixed(2)}$`; }
function rr(v) { const n = Number(v) || 0; return `${n >= 0 ? '+' : ''}${n.toFixed(2)}R`; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/** Rapor metnini üretir (Telegram HTML). */
function build(nowMs = Date.now(), goldStats = null) {
  const since = trDayStartMs(nowMs);
  const comp = competitionManager.dailyBreakdown(since);
  const custom = customBotRunner.dailyBreakdown(since);

  const lines = [];
  lines.push(`📊 <b>GÜNLÜK BOT RAPORU</b>`);
  lines.push(`🗓️ ${trDateLabel(nowMs)}`);
  lines.push('');
  lines.push('<b>— Yarışan Botlar —</b>');

  let dayTrades = 0, dayTp = 0, daySl = 0, dayNet = 0;
  for (const b of comp) {
    dayTrades += b.trades; dayTp += b.tp; daySl += b.sl; dayNet += b.net;
    if (b.trades > 0) {
      lines.push(`<b>Bot ${b.no}</b> · ${esc(b.name)}`);
      lines.push(`   ${b.trades} işlem · ${b.tp} TP · ${b.sl} SL · net <b>${usd(b.net)}</b>`);
    } else {
      lines.push(`<b>Bot ${b.no}</b> · ${esc(b.name)} — <i>işlem yok</i>`);
    }
  }

  if (custom.length) {
    lines.push('');
    lines.push('<b>— Özel Botların —</b>');
    for (const b of custom) {
      lines.push(`⭐ ${esc(b.name)} — ${b.trades} işlem · ${b.tp} TP · ${b.sl} SL · net <b>${rr(b.netR)}</b>`);
    }
  }

  if (goldStats && (goldStats.total > 0)) {
    lines.push('');
    lines.push('<b>— Altın Botu (gerçek MT5, toplam) —</b>');
    lines.push(`🥇 ${goldStats.total} işlem · %${Math.round(goldStats.win_rate || 0)} kazanma · ${usd(goldStats.total_profit)} · PF ${Number(goldStats.profit_factor || 0).toFixed(2)}`);
  }

  lines.push('');
  lines.push(`📈 <b>GÜN TOPLAMI:</b> ${dayTrades} işlem · ${dayTp} TP · ${daySl} SL · net <b>${usd(dayNet)}</b>`);
  lines.push(`<i>Her akşam güncellenir; sonuçlar günden güne birikir.</i>`);

  return { text: lines.join('\n'), summary: { trades: dayTrades, tp: dayTp, sl: daySl, net: Number(dayNet.toFixed(2)) } };
}

function target() {
  return process.env.TELEGRAM_DAILY_REPORT_CHANNEL || signalDelivery.signalChannel();
}

/** Raporu oluşturup Telegram'a gönderir. */
async function run(deps = {}) {
  if (process.env.BOT_DAILY_REPORT_DISABLED === '1') return { ok: false, disabled: true };
  const nowMs = deps.nowMs || Date.now();

  // Altın botu (gerçek MT5) toplamını en iyi çabayla ekle — ulaşılamazsa atla.
  let goldStats = null;
  try {
    const botClient = deps.botClient || require('../botClient');
    if (botClient.isEnabled && botClient.isEnabled()) {
      goldStats = await botClient.get('/api/stats');
    }
  } catch (_) { goldStats = null; }

  const { text, summary } = build(nowMs, goldStats);
  const chat = target();
  if (!chat) return { ok: false, error: 'no-telegram-target' };
  try {
    const send = deps.sendMessage || telegramService.sendMessage;
    const r = await send(chat, text, 'HTML');
    return { ok: !!(r && (r.success || r.ok || r.message_id || r.result)), summary };
  } catch (e) {
    return { ok: false, error: e.message, summary };
  }
}

module.exports = { run, build, trDayStartMs };
