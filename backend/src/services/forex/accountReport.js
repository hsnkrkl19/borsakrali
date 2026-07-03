/**
 * accountReport — VPS'teki köprünün MT5'ten okuduğu GERÇEK (broker) kâr/zararı
 * Telegram'a basar. Sanal/backend muhasebesi DEĞİL; FTMO hesabının gerçek
 * kapanan işlem P/L'i (deal history). VPS Telegram token'ı tutmaz → köprü
 * gerçek P/L'i buraya POST'lar, backend kanala gönderir.
 *
 * İki mesaj türü (payload.kind):
 *   'close' — yeni kapanan gerçek işlem(ler) + günlük koşan toplam.
 *   'daily' — gün sonu gerçek P/L özeti (net/isabet/en iyi-en kötü/bakiye).
 *
 * Kanal: TELEGRAM_PNL_CHANNEL (yoksa signalDelivery.signalChannel()).
 * Kill: PNL_REPORT_DISABLED=1.
 */

const telegramService = require('../telegramService');
const signalDelivery = require('../signalDelivery');
const logger = require('../../utils/logger');

function channelId() {
  return process.env.TELEGRAM_PNL_CHANNEL || signalDelivery.signalChannel();
}
function disabled() { return process.env.PNL_REPORT_DISABLED === '1'; }

function usd(v) {
  if (v == null || !Number.isFinite(Number(v))) return '-';
  const n = Number(v);
  return `${n < 0 ? '−' : '+'}$${Math.abs(n).toFixed(2)}`;
}
function money(v) {
  if (v == null || !Number.isFinite(Number(v))) return '-';
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function dirWord(d) { return String(d).toLowerCase() === 'buy' || String(d).toLowerCase() === 'long' ? 'BUY' : 'SELL'; }

function buildClose(p) {
  const lines = [`💰 <b>GERÇEK KAPANIŞ</b> (FTMO ${p.account || ''})`.trim()];
  for (const c of (p.closes || []).slice(0, 20)) {
    const icon = (c.profit || 0) >= 0 ? '✅' : '❌';
    const code = c.code ? `  (${c.code})` : '';
    lines.push(`${icon} ${c.symbol} ${dirWord(c.dir)} ${c.lots ?? '?'} lot → <b>${usd(c.profit)}</b>${code}`);
  }
  if (p.realizedToday != null) {
    lines.push(`📊 Bugün gerçekleşen toplam: <b>${usd(p.realizedToday)}</b>${p.balance != null ? ` · bakiye ${money(p.balance)}` : ''}`);
  }
  return lines.join('\n');
}

function buildDaily(p) {
  const total = (p.wins || 0) + (p.losses || 0);
  const hit = total > 0 ? Math.round(((p.wins || 0) / total) * 100) : null;
  const lines = [
    `📊 <b>GÜNLÜK GERÇEK KÂR/ZARAR</b>${p.date ? ` — ${p.date}` : ''} (FTMO ${p.account || ''})`.trim(),
    `Net: <b>${usd(p.net)}</b> · ${total} kapanış (${p.wins || 0} ✅ / ${p.losses || 0} ❌)${hit != null ? ` · isabet <b>%${hit}</b>` : ''}`,
  ];
  if (p.best && p.best.symbol) lines.push(`En iyi: ${p.best.symbol} ${usd(p.best.profit)} · En kötü: ${p.worst?.symbol || '-'} ${usd(p.worst?.profit)}`);
  if (p.balance != null) lines.push(`Bakiye: <b>${money(p.balance)}</b>${p.equity != null ? ` · Öz sermaye: ${money(p.equity)}` : ''}`);
  return lines.join('\n');
}

async function push(payload) {
  if (disabled()) return { sent: 0, disabled: true };
  const chat = channelId();
  if (!chat) return { sent: 0, error: 'kanal ayarlı değil (TELEGRAM_PNL_CHANNEL/SIGNAL_CHANNEL)' };
  let msg;
  if (payload.kind === 'daily') msg = buildDaily(payload);
  else if (payload.kind === 'close' && (payload.closes || []).length) msg = buildClose(payload);
  else return { sent: 0, skipped: 'boş/tanınmayan payload' };
  try {
    const r = await telegramService.sendMessage(chat, msg);
    if (r && r.success) { logger.info(`💰 Gerçek P/L Telegram (${payload.kind}) gönderildi`); return { sent: 1 }; }
    return { sent: 0, error: 'telegram gönderilemedi' };
  } catch (e) {
    logger.error(`[accountReport] ${e.message}`);
    return { sent: 0, error: e.message };
  }
}

module.exports = { push, buildClose, buildDaily };
