/**
 * TEMA34 Scanner Notifier — YALNIZ TEMA34 günlük "ilk kırılım" bildirimcisi.
 *
 * Tüm BIST taranır (mevcut crossoverScanner yeniden kullanılır — aynı kapanış
 * dizisinden EMA34+TEMA34 hesaplar) ama bu bot YALNIZCA TEMA34 kovalarını
 * (yukarı = AL bölgesi, düşüşte = SAT bölgesi) kullanır ve sonucu AYRI, YENİ bir
 * Telegram kanalına gönderir:
 *   Kanal = TELEGRAM_TEMA34_CHANNEL  (zorunlu — kullanıcının kuracağı yeni kanal).
 *   ⚠️ Kanal env'i AYARLI DEĞİLSE hiçbir yere göndermez (ana/forex kanalına ASLA
 *      düşmez — bu bot tamamen kendi kanalına özeldir).
 *
 * Bu bot uygulama/web push GÖNDERMEZ; yalnız Telegram kanalı (kullanıcı isteği).
 * Idempotluk: aynı işlem günü için (markNotified/lastCandleDate) yalnız bir kez
 * gönderir; restart/deploy sonrası tekrar atmaz. Kırılım yoksa sessizdir.
 * Kill-switch: TEMA34_SCANNER_DISABLED=1 → tarar + kaydeder ama bildirim atmaz.
 */

const scanner = require('../crossover/crossoverScanner');
const store = require('./tema34ScannerStore');
const telegramService = require('../telegramService');
const logger = require('../../utils/logger');

const DEEP_LINK = '/firsatlar?tab=tarama';
const TELEGRAM_MAX = 3900;          // 4096 limitin altında güvenli pay
const SECTION_CAP = 80;             // bir kovada Telegram'da listelenecek en fazla hisse
const HARD_TIMEOUT_MS = 16000;      // tek bir dış çağrı asla cron'u dondurmasın

// Hiçbir dış çağrı (Telegram) işi dondurmasın — sert zaman aşımı.
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

// Yeni kanalın hedef kimliği. Ayarlı değilse boş döner → gönderim yapılmaz.
function channelId() {
  return process.env.TELEGRAM_TEMA34_CHANNEL || '';
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
  const { candleDate, scanned, tema34 } = result;
  const header =
    `📊 <b>TEMA34 TARAMASI</b> — ${htmlEscape(candleDate || '-')}\n` +
    `Taranan ${scanned} hisse · TEMA34 günlük kapanış kesişimi`;
  const sections = [
    buildTelegramSection('🟢', 'TEMA34 — Yukarı ilk kırılım (AL bölgesi)', tema34.up),
    buildTelegramSection('🔴', 'TEMA34 — Düşüşte ilk kırılım (SAT bölgesi)', tema34.down),
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

async function sendTelegram(result) {
  const chatId = channelId();
  if (!chatId) return { sent: 0, chatSet: false };  // yeni kanal ayarlı değil → sessiz
  const messages = buildTelegramMessages(result);
  let sent = 0;
  for (const msg of messages) {
    try {
      const r = await withTimeout(telegramService.sendMessage(chatId, msg), HARD_TIMEOUT_MS, 'tg');
      if (r?.success) sent++;
      else logger.error(`[TEMA34Scanner] Telegram başarısız: ${r?.error || '?'}`);
    } catch (e) {
      logger.error(`[TEMA34Scanner] Telegram hata: ${e.message}`);
    }
  }
  return { sent, total: messages.length, chatSet: true };
}

/**
 * Tara + (gerekirse) bildir + durum kaydet. opts.force=true → dedup atlanır
 * (manuel/test). Dönen özet route + log için kullanılır.
 */
async function runAndNotify(opts = {}) {
  const force = !!opts.force;
  const result = await scanner.scanAll();

  if (!result.ok) {
    logger.error(`[TEMA34Scanner] tarama başarısız: ${result.error || (result.busy ? 'meşgul' : 'bilinmeyen')}`);
    return { ok: false, notified: false, error: result.error, busy: result.busy };
  }

  const { candleDate, scanned, fetchErrors, counts } = result;
  const total = counts.temaUp + counts.temaDown;     // YALNIZ TEMA34
  const last = store.getLastCandleDate();
  const alreadyDone = !!(last && candleDate && last === candleDate);
  const disabled = process.env.TEMA34_SCANNER_DISABLED === '1';

  let notified = false;
  let skippedReason = null;
  let telegram = { sent: 0 };

  if (!force && alreadyDone) {
    skippedReason = 'already-notified';      // bu işlem günü zaten bildirildi
  } else if (total === 0) {
    skippedReason = 'no-crossings';          // TEMA34 kırılımı yok → sessiz
    store.markNotified(candleDate);          // günü işlenmiş say
  } else if (disabled) {
    skippedReason = 'disabled';              // kill-switch — lastCandleDate ilerletme
  } else if (!channelId()) {
    skippedReason = 'no-channel';            // yeni kanal henüz ayarlanmadı — sessiz, günü işaretleme
  } else {
    telegram = await sendTelegram(result);
    notified = telegram.sent > 0;
    if (notified) store.markNotified(candleDate);
    logger.info(
      `📊 TEMA34 tarama bildirim — ${candleDate}: ↑${counts.temaUp}/↓${counts.temaDown} · TG ${telegram.sent}`
    );
  }

  const summary = {
    runAt: new Date().toISOString(),
    candleDate, scanned, fetchErrors,
    counts: { temaUp: counts.temaUp, temaDown: counts.temaDown },
    total,
    notified, skippedReason, forced: force,
    telegramSent: telegram.sent || 0,
    // Geçmişte sembol listesini sade tutmak için yalnız ilk birkaçını sakla
    preview: {
      temaUp: result.tema34.up.slice(0, 10).map(r => r.symbol),
      temaDown: result.tema34.down.slice(0, 10).map(r => r.symbol),
    },
  };
  store.recordRun(summary);
  return { ok: true, ...summary };
}

module.exports = {
  runAndNotify,
  channelId,
  // pure builders — test edilebilir
  buildTelegramMessages,
  buildTelegramSection,
  DEEP_LINK,
};
