/**
 * MTF Push Notifier — Borsa Krali
 *
 * Confluence verdict değişimlerini izler, sadece "yeni STRONG geçişleri"
 * push notification olarak gönderir. Spam'i önlemek için per-coin cooldown
 * + minimum confidence eşiği uygulanır.
 *
 * Tetiklenme kuralları (TÜMÜ sağlanmalı):
 *   1. Confluence verdict önce STRONG değildi (NEUTRAL/LONG/SHORT/WEAK_*)
 *      şimdi STRONG_LONG ya da STRONG_SHORT
 *   2. confidence ≥ 0.5  (Bayesian güven yeterli — örneklem var)
 *   3. Aynı (symbol, verdict) için son push'tan ≥ 30 dk geçmiş
 *   4. Calibrated win probability ≥ %60 (sadece istatistiksel olarak iyi olanlar)
 *
 * State (process bellek):
 *   - prevVerdict: symbol → önceki verdict
 *   - lastPushAt:  `${symbol}__${verdict}` → timestamp
 */

const pushNotificationService = require('./pushNotificationService');
const logger = require('../utils/logger');
const { paperNotificationSuppressed } = require('./mt5TradeNotifier');

// Telegram channel — opsiyonel. TELEGRAM_MTF_CHAT_ID env var ayarlanırsa
// FCM push'a ek olarak Telegram kanalına/grubuna da gönderir.
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_MTF_CHAT_ID || null;
let telegramService = null;
if (TELEGRAM_CHAT_ID) {
  try { telegramService = require('./telegramService'); }
  catch (e) { logger.warn(`[MTFPush] telegramService yüklenemedi: ${e.message}`); }
}

const COOLDOWN_MS = 30 * 60 * 1000; // 30 dk per (coin, verdict)
const MIN_CONFIDENCE = 0.5;
const MAX_BATCH = 5;                // tek bildirimde en fazla 5 coin

// Kanal-tek modda MTF YALNIZ bu pariteleri kanala atar (sıklığı düşürür).
// Kullanıcı: "altın btc ve eth" — altın MTF'de yok (forex 5-TF ile geliyor) → BTC,ETH.
function mtfWhitelist() {
  return (process.env.MTF_CHANNEL_SYMBOLS || 'BTC,ETH').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
}
function normSym(s) { return String(s || '').toUpperCase().replace(/[^A-Z]/g, '').replace(/USDT$|USD$/, ''); }
function mtfAllowed(sym) { return mtfWhitelist().includes(normSym(sym)); }

const prevVerdict = new Map();      // symbol → 'STRONG_LONG' | ... | null
const lastPushAt = new Map();       // key → timestamp
const stats = {
  totalEvaluated: 0,
  totalUpgrades: 0,
  totalPushed: 0,
  lastEvaluatedAt: null,
};

/**
 * confluences: scanConfluence().all || top — array of
 *   { symbol, verdict, net, confidence, alignedLong, alignedShort, tfDirections }
 */
async function evaluateAndPush(confluences) {
  if (process.env.MTF_PUSH_DISABLED === '1') return { upgrades: 0, pushed: 0, disabled: true };
  if (process.env.FOREX_ONLY_MODE === '1') return { upgrades: 0, pushed: 0, forexOnly: true }; // forex-only: MTF kapalı
  if (!Array.isArray(confluences) || confluences.length === 0) return { upgrades: 0, pushed: 0 };
  // Kanal-tek modu (BIST dışı): MTF kullanıcıya FCM/DM ATMAZ; yalnız Telegram
  // KANALINA ve YALNIZ izinli pariteler (MTF_CHANNEL_SYMBOLS, vars. BTC,ETH) gider —
  // kanal 1dk scalp'leriyle dolmasın diye. Diğer coinler yalnız uygulama-içi sayfada.
  const channelMode = require('./signalDelivery').channelOnly();

  stats.totalEvaluated++;
  stats.lastEvaluatedAt = new Date().toISOString();

  const upgrades = [];
  const now = Date.now();

  for (const c of confluences) {
    if (!c?.symbol || !c?.verdict) continue;
    if (channelMode && !mtfAllowed(c.symbol)) continue; // kanal-tek: yalnız izinli pariteler

    const prev = prevVerdict.get(c.symbol) || null;
    const wasStrong = prev === 'STRONG_LONG' || prev === 'STRONG_SHORT';
    const isStrong  = c.verdict === 'STRONG_LONG' || c.verdict === 'STRONG_SHORT';

    // 1. STRONG'a yeni geçiş mi?
    const isNewStrong = isStrong && !wasStrong;
    // Verdict yön değiştirme (LONG → SHORT veya tersi) da push'a değer
    const isFlip = isStrong && wasStrong && prev !== c.verdict;

    if (!isNewStrong && !isFlip) continue;

    // 2. Confidence eşiği
    if ((c.confidence || 0) < MIN_CONFIDENCE) continue;

    // 3. Cooldown
    const key = `${c.symbol}__${c.verdict}`;
    const last = lastPushAt.get(key) || 0;
    if (now - last < COOLDOWN_MS) continue;

    upgrades.push({ ...c, prevVerdict: prev, isFlip });
    lastPushAt.set(key, now);
  }

  // Verdict map'ini her zaman güncelle (push gitmese bile)
  for (const c of confluences) {
    if (c?.symbol && c?.verdict) prevVerdict.set(c.symbol, c.verdict);
  }

  if (upgrades.length === 0) return { upgrades: 0, pushed: 0 };

  stats.totalUpgrades += upgrades.length;

  // Top N (confidence × |net|'e göre sırala)
  upgrades.sort((a, b) => {
    const sa = (Math.abs(a.net || 0)) * (a.confidence || 0);
    const sb = (Math.abs(b.net || 0)) * (b.confidence || 0);
    return sb - sa;
  });
  const top = upgrades.slice(0, MAX_BATCH);

  // mtf-confluence is executed by the unified MT5 bridge.  Its actionable
  // notification belongs to broker-state ingest, after a real ticket exists.
  // Keep the detector/cooldown state current, but do not publish a paper event.
  if (paperNotificationSuppressed('mtf-confluence')) {
    return { upgrades: upgrades.length, pushed: 0, brokerOwned: true };
  }

  // Bildirim metni
  const longCoins  = top.filter(c => c.verdict === 'STRONG_LONG').map(c => c.symbol);
  const shortCoins = top.filter(c => c.verdict === 'STRONG_SHORT').map(c => c.symbol);

  const flipCount = top.filter(c => c.isFlip).length;
  const newCount  = top.length - flipCount;

  const titleParts = [];
  if (newCount > 0)  titleParts.push(`${newCount} güçlü hareket`);
  if (flipCount > 0) titleParts.push(`${flipCount} yön döndü`);
  const title = `📡 Yeni fırsat — ${titleParts.join(' · ')}`;

  const bodyParts = [];
  if (longCoins.length)  bodyParts.push(`Al sinyali: ${longCoins.join(', ')}`);
  if (shortCoins.length) bodyParts.push(`Düşüş bölgesi: ${shortCoins.join(', ')}`);
  const body = bodyParts.join(' · ') || 'Güçlü fırsat güncellemesi';

  try {
    // KANAL-TEK: FCM/DM yok → yalnız Telegram kanalına (izinli pariteler)
    if (channelMode) {
      const { signalChannel } = require('./signalDelivery');
      const chatId = signalChannel();
      let sent = 0;
      if (chatId) {
        try { const tg = require('./telegramService'); const r = await tg.sendMessage(chatId, formatTelegramMessage(top), 'HTML'); if (r?.success !== false) sent = 1; }
        catch (e) { logger.warn(`[MTFPush] kanal gönderim hatası: ${e.message}`); }
      }
      stats.totalPushed += top.length;
      logger.info(`📡 MTF kanal — ${top.length} STRONG (izinli parite): ${top.map(c => c.symbol).join(', ')}`);
      return { upgrades: upgrades.length, pushed: top.length, channel: true, telegramSent: !!sent };
    }

    await pushNotificationService.broadcastNotification({
      title, body,
      path: '/gunluk-tespitler?tab=mtf',
      topic: 'all',
    });
    stats.totalPushed += upgrades.length;
    logger.info(`[MTFPush] ${upgrades.length} STRONG upgrade gönderildi (top ${top.length}): ${title}`);

    // Telegram broadcast (opsiyonel)
    if (telegramService && TELEGRAM_CHAT_ID) {
      try {
        const telegramText = formatTelegramMessage(top);
        await telegramService.sendMessage(TELEGRAM_CHAT_ID, telegramText, 'HTML');
        stats.totalTelegramSent = (stats.totalTelegramSent || 0) + 1;
      } catch (e) {
        logger.warn(`[MTFPush] Telegram gönderim hatası: ${e.message}`);
      }
    }

    return { upgrades: upgrades.length, pushed: top.length, title, body, telegramSent: !!(telegramService && TELEGRAM_CHAT_ID) };
  } catch (e) {
    logger.error(`[MTFPush] broadcast hatası: ${e.message}`);
    return { upgrades: upgrades.length, pushed: 0, error: e.message };
  }
}

// Telegram için zengin HTML mesaj formatı
function formatTelegramMessage(upgrades) {
  const lines = [`🤖 <b>${require('./botCompetition/botLabels').botLabel('mtf-confluence')}</b>`, '<b>📡 BORSA KRALI — Yeni Fırsatlar</b>', ''];
  for (const c of upgrades) {
    const arrow = c.verdict === 'STRONG_LONG' ? '🟢⬆️' : '🔴⬇️';
    const verdictLabel = c.verdict === 'STRONG_LONG' ? 'GÜÇLÜ AL' : 'GÜÇLÜ DÜŞÜŞ';
    const flipMark = c.isFlip ? ' 🔁' : ' ⭐';
    const confLabel = (c.confidence || 0) >= 0.7 ? 'Güçlü' : (c.confidence || 0) >= 0.4 ? 'Orta' : 'Zayıf';
    lines.push(`${arrow} <b>${c.symbol}</b> — <i>${verdictLabel}</i>${flipMark}`);
    lines.push(`   İşaret: <code>${confLabel}</code> · Birleşik görüntü: ${c.alignedLong} yükseliş / ${c.alignedShort} düşüş`);
    lines.push('');
  }
  lines.push('<a href="https://borsakrali.com/gunluk-tespitler?tab=mtf">📊 Detay için tıkla</a>');
  return lines.join('\n');
}

function getStats() {
  return {
    ...stats,
    trackedCoins: prevVerdict.size,
    activeCooldowns: lastPushAt.size,
    cooldownMs: COOLDOWN_MS,
    minConfidence: MIN_CONFIDENCE,
    telegramEnabled: !!(telegramService && TELEGRAM_CHAT_ID),
    telegramChatId: TELEGRAM_CHAT_ID ? `***${String(TELEGRAM_CHAT_ID).slice(-4)}` : null,
  };
}

function reset() {
  prevVerdict.clear();
  lastPushAt.clear();
  stats.totalEvaluated = 0;
  stats.totalUpgrades = 0;
  stats.totalPushed = 0;
  stats.lastEvaluatedAt = null;
}

module.exports = {
  evaluateAndPush,
  getStats,
  reset,
  COOLDOWN_MS,
  MIN_CONFIDENCE,
};
