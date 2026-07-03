/**
 * TEMA34 Scanner Notifier — çok-zaman-dilimli (4h + 1d), YALNIZ TEMA34 kırılım
 * bildirimcisi.
 *
 * Tüm BIST taranır (tema34ScanEngine; 4h = 1h'ten resample, 1d = günlük). Her
 * zaman dilimi için YALNIZ "yeni giren" (cross_above → AL bölgesi) ve "sat
 * bölgesine yeni geçen" (cross_below → SAT bölgesi) hisseler raporlanır; süregelen
 * above/below DURUMLARI gönderilmez. Sonuç AYRI/yeni Telegram kanalına gider:
 *   Kanal = TELEGRAM_TEMA34_CHANNEL  (kullanıcının kurduğu kanal; örn. @tema34sinyal).
 *   ⚠️ Env ayarlı değilse hiçbir yere göndermez (ana/forex kanalına ASLA düşmez).
 *
 * Her zaman dilimi KENDİ barına göre bağımsız dedup'lanır (store.lastBar[tf]) →
 * aynı 4h barı / aynı günlük mum iki kez bildirilmez; biri yenilenince diğeri
 * beklemeden gider. Kırılım yoksa o TF sessizdir. Uygulama/web push YOK.
 * Kill-switch: TEMA34_SCANNER_DISABLED=1 → tarar + kaydeder ama bildirim atmaz.
 */

const engine = require('./tema34ScanEngine');
const store = require('./tema34ScannerStore');
const tracker = require('./tema34ScannerTracker');
const telegramService = require('../telegramService');
const logger = require('../../utils/logger');

const DEEP_LINK = '/firsatlar?tab=tarama';
const TELEGRAM_MAX = 3900;          // 4096 limitin altında güvenli pay
const SECTION_CAP = 80;             // bir kovada Telegram'da listelenecek en fazla hisse
const HARD_TIMEOUT_MS = 16000;      // tek bir dış çağrı asla cron'u dondurmasın

const TF_LABEL = { '4h': '4 SAATLİK', '1d': 'GÜNLÜK' };

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

// Bir TF için idempotluk anahtarı: 1d → tarih; 4h → son bar ISO zamanı (gün-içi
// birden çok 4h barı ayrışsın). Üreten veri yoksa null.
function barKeyOf(tfResult) {
  if (!tfResult) return null;
  if (tfResult.tf === '1d') return tfResult.candleDate || null;
  if (Number.isFinite(tfResult.barTime)) return new Date(tfResult.barTime).toISOString();
  return tfResult.candleDate || null;
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

// Tek bir zaman dilimi sonucu → ≤TELEGRAM_MAX parçalara bölünmüş mesaj dizisi.
function buildTimeframeMessages(tfResult) {
  const tf = tfResult.tf;
  const stamp = tf === '1d'
    ? (tfResult.candleDate || '-')
    : (Number.isFinite(tfResult.barTime)
        ? new Date(tfResult.barTime).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' })
        : (tfResult.candleDate || '-'));
  const header =
    `📊 <b>TEMA34 TARAMASI — ${TF_LABEL[tf] || tf}</b>\n` +
    `${htmlEscape(stamp)} · Taranan ${tfResult.scanned} hisse · TEMA34 kapanış kesişimi`;
  const sections = [
    buildTelegramSection('🟢', 'Yeni girenler (AL bölgesi)', tfResult.up),
    buildTelegramSection('🔴', 'Sat bölgesine yeni geçenler', tfResult.down),
  ].filter(Boolean);
  const footer = `Detay: ${DEEP_LINK}\nNot: Yatırım tavsiyesi değildir.`;

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

async function sendMessages(messages) {
  const chatId = channelId();
  if (!chatId) return { sent: 0, chatSet: false };
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

// ── SONUÇ (ters-kesişim) bildirimi ──────────────────────────────────────────
// Bir kapanış olayı → Telegram bloğu. Sonuç kâr/zarara göre renklenir.
function buildClosureBlock(ev) {
  const s = ev.pnlPct >= 0 ? '+' : '';
  const mark = ev.pnlPct >= 0 ? '🟢' : '🔴';
  const days = ev.daysHeld != null ? ` · ${ev.daysHeld} gün` : '';
  return [
    `${mark} <b>${htmlEscape(ev.symbol)}</b> — TEMA34 AL→SAT (ters kesişim)`,
    `Giriş ${fmtPrice(ev.entry)}${ev.entryDate ? ` (${htmlEscape(ev.entryDate)})` : ''} → Çıkış ${fmtPrice(ev.exit)}${ev.exitDate ? ` (${htmlEscape(ev.exitDate)})` : ''}${days}`,
    `Sonuç: <b>${s}${ev.pnlPct}%</b>`,
  ].join('\n');
}

// Kapanış olayları → ≤TELEGRAM_MAX parçalara bölünmüş mesaj dizisi.
function buildClosureMessages(events) {
  const list = events || [];
  if (!list.length) return [];
  const header =
    '📊 <b>TEMA34 SONUÇ — Ters kesişim</b>\n' +
    'Daha önce AL bölgesine giren hisseler sat bölgesine geçti (sinyal sonucu).';
  const footer = `Detay: ${DEEP_LINK}\nNot: Yatırım tavsiyesi değildir.`;
  const blocks = [header, ...list.map(buildClosureBlock), footer];
  const messages = [];
  let cur = '';
  for (const block of blocks) {
    const candidate = cur ? `${cur}\n\n${block}` : block;
    if (candidate.length > TELEGRAM_MAX && cur) { messages.push(cur); cur = block; }
    else cur = candidate;
  }
  if (cur) messages.push(cur);
  return messages;
}

// Kapanışları @tema34sinyal kanalına gönder. Kanal yoksa/kapalıysa sessiz.
async function pushClosures(events) {
  const list = events || [];
  if (!list.length) return { sent: 0, total: 0 };
  if (process.env.TEMA34_SCANNER_DISABLED === '1') return { sent: 0, total: list.length, disabled: true };
  return sendMessages(buildClosureMessages(list));
}

// Tek bir TF sonucunu değerlendir + (gerekirse) gönder. Dönüş: per-TF özet.
async function processTimeframe(tfResult, opts) {
  const tf = tfResult?.tf;
  if (!tfResult || !tfResult.ok) {
    return { tf, ok: false, notified: false, skippedReason: 'scan-failed', error: tfResult?.error || null };
  }
  const force = !!opts.force;
  const disabled = process.env.TEMA34_SCANNER_DISABLED === '1';
  const up = tfResult.up || [];
  const down = tfResult.down || [];
  const total = up.length + down.length;
  const barKey = barKeyOf(tfResult);
  const alreadyDone = !!(barKey && store.getLastBar(tf) === barKey);

  let notified = false;
  let skippedReason = null;
  let telegram = { sent: 0 };

  if (!force && alreadyDone) {
    skippedReason = 'already-notified';
  } else if (total === 0) {
    skippedReason = 'no-crossings';
    if (barKey) store.markBar(tf, barKey);        // bar işlendi say
  } else if (disabled) {
    skippedReason = 'disabled';
  } else if (!channelId()) {
    skippedReason = 'no-channel';                 // kanal yok → barı işaretleme (yayını kaçırma)
  } else {
    telegram = await sendMessages(buildTimeframeMessages(tfResult));
    notified = telegram.sent > 0;
    if (notified && barKey) store.markBar(tf, barKey);
    logger.info(`📊 TEMA34 ${tf} bildirim — ${barKey}: 🟢${up.length}/🔴${down.length} · TG ${telegram.sent}`);
  }

  return {
    tf, ok: true, barKey,
    scanned: tfResult.scanned, fetchErrors: tfResult.fetchErrors,
    counts: { up: up.length, down: down.length }, total,
    notified, skippedReason, telegramSent: telegram.sent || 0,
    preview: { up: up.slice(0, 10).map(r => r.symbol), down: down.slice(0, 10).map(r => r.symbol) },
  };
}

/**
 * Tüm zaman dilimlerini tara + (gerekirse) bildir + durum kaydet.
 * opts.force=true → dedup atlanır (manuel/test). Dönen özet route + log için.
 */
async function runAndNotify(opts = {}) {
  const result = await engine.scanAll();

  if (!result.ok) {
    logger.error(`[TEMA34Scanner] tarama başarısız: ${result.error || (result.busy ? 'meşgul' : 'bilinmeyen')}`);
    return { ok: false, notified: false, error: result.error, busy: result.busy };
  }

  const timeframes = {};
  let anyNotified = false;
  for (const tf of engine.TIMEFRAMES) {
    const r = await processTimeframe(result[tf], opts);
    timeframes[tf] = r;
    if (r.notified) anyNotified = true;
  }

  // SONUÇ takibi (yalnız 1d): AL bölgesine girenleri kaydet, sat bölgesine geçince
  // (ters kesişim) kapat + bildir. Taramanın kendi up/down listesinden türetilir
  // (mum yeniden çekilmez → gecikmeli veriyle uyumlu). Kanal yok/kapalıysa izleme.
  let closed = 0;
  const trackingOn = !!channelId() && process.env.TEMA34_SCANNER_DISABLED !== '1';
  if (trackingOn && result['1d']?.ok) {
    try {
      const { closures, opened } = await tracker.sync(result['1d']);
      if (opened.length) logger.info(`📊 TEMA34 takip — ${opened.length} yeni AL izlemede`);
      if (closures.length) {
        const push = await pushClosures(closures);
        closed = push.sent || 0;
        logger.info(`📊 TEMA34 sonuç — ${closures.length} ters-kesişim · TG ${closed}`);
      }
    } catch (e) {
      logger.error(`[TEMA34Scanner] sonuç takibi hata: ${e.message}`);
    }
  }

  const summary = {
    runAt: new Date().toISOString(),
    forced: !!opts.force,
    notified: anyNotified,
    closures: closed,
    timeframes,
  };
  store.recordRun(summary);
  return { ok: true, ...summary };
}

module.exports = {
  runAndNotify,
  processTimeframe,
  channelId,
  barKeyOf,
  pushClosures,
  // pure builders — test edilebilir
  buildTimeframeMessages,
  buildTelegramSection,
  buildClosureBlock,
  buildClosureMessages,
  DEEP_LINK,
  TF_LABEL,
};
