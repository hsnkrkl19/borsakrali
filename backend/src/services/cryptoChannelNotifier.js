/**
 * cryptoChannelNotifier — Kripto sinyallerini Telegram KANALINA gönderir.
 *
 * Kullanıcı isteği: BIST dışı sinyaller bot/uygulama yerine YALNIZ kanala.
 * Kripto eskiden sadece FCM push'luyordu → artık kanal-tek modda kanala özet
 * mesaj gider (faz başına: morning/midday/evening/night). Saf kurucu + gönderici.
 */

const telegramService = require('./telegramService');
const { signalChannel } = require('./signalDelivery');
const logger = require('../utils/logger');

const TOP = 5;

function fmtPrice(v) {
  if (v == null || !isFinite(v)) return '-';
  const a = Math.abs(v);
  const d = a >= 1000 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 5 : 8;
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
}

function line(s) {
  const sym = (s.symbol || '').toUpperCase();
  const lv = (s.entry && s.stop && s.target1)
    ? ` — giriş ${fmtPrice(s.entry)} · SL ${fmtPrice(s.stop)} · TP ${fmtPrice(s.target1)}`
    : '';
  const sc = s.totalScore != null ? ` (skor ${s.totalScore}${s.historicalWinRate != null ? `, geçmiş %${s.historicalWinRate}` : ''})` : '';
  return `• <b>${sym}</b>${lv}${sc}`;
}

function section(emojiTitle, list) {
  const sigs = (list?.signals || []).slice(0, TOP);
  if (!sigs.length) return '';
  return `\n${emojiTitle}\n` + sigs.map(line).join('\n');
}

function buildMessage(result, title) {
  const head = `🪙 <b>KRİPTO SİNYALLERİ</b> — ${title}`;
  const body = [
    section('📈 <b>SPOT / AL</b>', result.spot_long),
    section('🚀 <b>FUTURES LONG</b>', result.futures_long),
    section('🔻 <b>FUTURES SHORT</b>', result.futures_short),
  ].filter(Boolean).join('\n');
  if (!body) return null; // sinyal yoksa mesaj atma
  return `${head}\n${body}\n\nℹ️ Detaylar uygulamada · ⚠️ Yatırım tavsiyesi değildir.`;
}

async function pushToChannel(result, title) {
  const chatId = signalChannel();
  const msg = buildMessage(result, title);
  if (!chatId || !msg) return { telegram: 0 };
  try {
    const r = await Promise.race([
      telegramService.sendMessage(chatId, msg),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 16000)),
    ]);
    const ok = r?.success ? 1 : 0;
    if (ok) logger.info(`🪙 Kripto sinyalleri kanala gönderildi — ${title}`);
    return { telegram: ok };
  } catch (e) {
    logger.error(`[CryptoChannel] gönderim hata: ${e.message}`);
    return { telegram: 0 };
  }
}

module.exports = { buildMessage, pushToChannel };
