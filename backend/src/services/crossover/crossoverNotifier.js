/**
 * Crossover Notifier — EMA34 & TEMA34 günlük "ilk kırılım" bildirimcisi.
 *
 * Tüm BIST taranır (crossoverScanner); yukarı ilk kırılım (cross_above) ve düşüşte
 * ilk kırılım (cross_below) sinyalleri İKİ kanaldan iletilir:
 *   1) Telegram   — ana kanal (TELEGRAM_CROSSOVER_CHANNEL || TELEGRAM_CHAT_ID),
 *                   uzun listeler ≤3900 karakterlik mesajlara bölünür.
 *   2) Uygulama/Web — pushNotificationService.broadcastNotification (FCM topic
 *                   'all' = telefon uygulaması + Socket.IO 'all' = web tarayıcı).
 *
 * Idempotluk: aynı işlem günü için (markNotified/lastCandleDate) yalnız bir kez
 * gönderir; restart/deploy sonrası tekrar atmaz. Kırılım yoksa sessizdir.
 * Kill-switch: CROSSOVER_PUSH_DISABLED=1 → tarar + kaydeder ama bildirim atmaz.
 */

const scanner = require('./crossoverScanner');
const store = require('./crossoverStore');
const telegramService = require('../telegramService');
const pushNotificationService = require('../pushNotificationService');
const logger = require('../../utils/logger');

const DEEP_LINK = '/firsatlar?tab=tarama';
const TELEGRAM_MAX = 3900;          // 4096 limitin altında güvenli pay
const SECTION_CAP = 80;             // bir kovada Telegram'da listelenecek en fazla hisse
const HARD_TIMEOUT_MS = 16000;      // tek bir dış çağrı asla cron'u dondurmasın

// Hiçbir dış çağrı (Telegram/FCM) işi dondurmasın — sert zaman aşımı.
function withTimeout(promise, ms, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms)),
  ]);
}

function htmlEscape(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtPrice(v) {
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function sign(v) { return Number(v) >= 0 ? '+' : ''; }

// İlk k sembolün kısa özeti: "THYAO, GARAN, EREGL +4"
function topSyms(rows, k = 3) {
  if (!rows || !rows.length) return '—';
  const head = rows.slice(0, k).map(r => r.symbol).join(', ');
  const extra = rows.length - Math.min(k, rows.length);
  return extra > 0 ? `${head} +${extra}` : head;
}

// ── Telegram mesaj gövdesi (≤3900 karakterlik parçalara bölünmüş) ───────────
function buildTelegramSection(emoji, title, rows) {
  if (!rows.length) return '';
  const lines = [`${emoji} <b>${htmlEscape(title)}</b> (${rows.length})`];
  for (const r of rows.slice(0, SECTION_CAP)) {
    lines.push(`• ${htmlEscape(r.symbol)}  ${fmtPrice(r.close)} TL  (${sign(r.distancePct)}${r.distancePct}%)`);
  }
  if (rows.length > SECTION_CAP) lines.push(`  …ve ${rows.length - SECTION_CAP} hisse daha`);
  return lines.join('\n');
}

function buildTelegramMessages(result) {
  const { candleDate, scanned, tema34, ema34 } = result;
  const header =
    `📐 <b>GÜNLÜK KIRILIM TARAMASI</b> — ${htmlEscape(candleDate || '-')}\n` +
    `Taranan ${scanned} hisse · EMA34 &amp; TEMA34 günlük kapanış`;
  const sections = [
    buildTelegramSection('🟢', 'TEMA34 — Yukarı ilk kırılım (AL bölgesi)', tema34.up),
    buildTelegramSection('🔴', 'TEMA34 — Düşüşte ilk kırılım (SAT bölgesi)', tema34.down),
    buildTelegramSection('🟢', 'EMA34 — Yukarı ilk kırılım (AL bölgesi)', ema34.up),
    buildTelegramSection('🔴', 'EMA34 — Düşüşte ilk kırılım (SAT bölgesi)', ema34.down),
  ].filter(Boolean);
  const footer = `Detay: ${DEEP_LINK}\nNot: Yatırım tavsiyesi değildir.`;

  // header + her bölüm + footer'ı boş satırla ayırıp ≤TELEGRAM_MAX parçalara böl
  const blocks = [header, ...sections, footer];
  const messages = [];
  let cur = '';
  for (const block of blocks) {
    const candidate = cur ? `${cur}\n\n${block}` : block;
    if (candidate.length > TELEGRAM_MAX && cur) {
      messages.push(cur);
      cur = block;
    } else {
      cur = candidate;
    }
  }
  if (cur) messages.push(cur);
  return messages;
}

// ── Uygulama/Web push (broadcast) gövdesi ───────────────────────────────────
function buildBroadcast(result) {
  const { candleDate, tema34, ema34, counts } = result;
  const total = counts.temaUp + counts.temaDown + counts.emaUp + counts.emaDown;
  const title = `📐 EMA34/TEMA34 kırılımı — ${total} hisse`;
  const body =
    `▲ Yukarı  TEMA: ${topSyms(tema34.up)} · EMA: ${topSyms(ema34.up)}\n` +
    `▼ Düşüş  TEMA: ${topSyms(tema34.down)} · EMA: ${topSyms(ema34.down)}`;
  return {
    title,
    body: body.slice(0, 480),
    path: DEEP_LINK,
    topic: 'all',
    category: 'crossover',
  };
}

async function sendTelegram(result) {
  // Crossover kanalı yoksa ANA kanala düşer (kullanıcı DM'ine ASLA). Broadcast (uygulama) ayrı.
  const chatId = process.env.TELEGRAM_CROSSOVER_CHANNEL || require('../signalDelivery').signalChannel();
  if (!chatId) return { sent: 0, chatSet: false };
  const messages = buildTelegramMessages(result);
  let sent = 0;
  for (const msg of messages) {
    try {
      const r = await withTimeout(telegramService.sendMessage(chatId, msg), HARD_TIMEOUT_MS, 'tg');
      if (r?.success) sent++;
      else logger.error(`[Crossover] Telegram başarısız: ${r?.error || '?'}`);
    } catch (e) {
      logger.error(`[Crossover] Telegram hata: ${e.message}`);
    }
  }
  return { sent, total: messages.length, chatSet: true };
}

async function sendBroadcast(result) {
  try {
    const r = await withTimeout(
      pushNotificationService.broadcastNotification(buildBroadcast(result)),
      HARD_TIMEOUT_MS, 'broadcast');
    return { ok: !!r?.success, fcmStatus: r?.broadcast?.fcmStatus || null };
  } catch (e) {
    logger.error(`[Crossover] Broadcast hata: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

/**
 * Tara + (gerekirse) bildir + durum kaydet. opts.force=true → dedup atlanır
 * (manuel/test). Dönen özet route + log için kullanılır.
 */
async function runAndNotify(opts = {}) {
  const force = !!opts.force;
  const result = await scanner.scanAll();

  if (!result.ok) {
    logger.error(`[Crossover] tarama başarısız: ${result.error || result.busy ? 'meşgul' : 'bilinmeyen'}`);
    return { ok: false, notified: false, error: result.error, busy: result.busy };
  }

  const { candleDate, scanned, fetchErrors, counts } = result;
  const total = counts.temaUp + counts.temaDown + counts.emaUp + counts.emaDown;
  const last = store.getLastCandleDate();
  const alreadyDone = !!(last && candleDate && last === candleDate);
  const disabled = process.env.CROSSOVER_PUSH_DISABLED === '1';

  let notified = false;
  let skippedReason = null;
  let telegram = { sent: 0 };
  let broadcast = null;

  if (!force && alreadyDone) {
    skippedReason = 'already-notified';      // bu işlem günü zaten bildirildi
  } else if (total === 0) {
    skippedReason = 'no-crossings';          // kırılım yok → sessiz
    store.markNotified(candleDate);          // günü işlenmiş say
  } else if (disabled) {
    skippedReason = 'disabled';              // kill-switch — lastCandleDate ilerletme
  } else {
    telegram = await sendTelegram(result);
    broadcast = await sendBroadcast(result);
    notified = telegram.sent > 0 || !!broadcast?.ok;
    if (notified) store.markNotified(candleDate);
    logger.info(
      `📐 Crossover bildirim — ${candleDate}: TEMA ↑${counts.temaUp}/↓${counts.temaDown} · ` +
      `EMA ↑${counts.emaUp}/↓${counts.emaDown} · TG ${telegram.sent} · FCM ${broadcast?.fcmStatus || '-'}`
    );
  }

  const summary = {
    runAt: new Date().toISOString(),
    candleDate, scanned, fetchErrors, counts, total,
    notified, skippedReason, forced: force,
    telegramSent: telegram.sent || 0,
    broadcast: broadcast ? { ok: broadcast.ok, fcmStatus: broadcast.fcmStatus || null } : null,
    // Geçmişte sembol listesini sade tutmak için yalnız ilk birkaçını sakla
    preview: {
      temaUp: result.tema34.up.slice(0, 10).map(r => r.symbol),
      temaDown: result.tema34.down.slice(0, 10).map(r => r.symbol),
      emaUp: result.ema34.up.slice(0, 10).map(r => r.symbol),
      emaDown: result.ema34.down.slice(0, 10).map(r => r.symbol),
    },
  };
  store.recordRun(summary);
  return { ok: true, ...summary };
}

module.exports = {
  runAndNotify,
  // pure builders — test edilebilir
  buildTelegramMessages,
  buildTelegramSection,
  buildBroadcast,
  topSyms,
  DEEP_LINK,
};
