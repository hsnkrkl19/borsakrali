/**
 * TEMA34 Scanner Notifier — çok-zaman-dilimli (4h + 1d), YALNIZ TEMA34 kırılım
 * bildirimcisi.
 *
 * Tüm BIST taranır (tema34ScanEngine; 4h = 1h'ten resample, 1d = günlük). Her
 * zaman dilimi için YALNIZ "yeni giren" (cross_above → AL bölgesi) ve "sat
 * bölgesine yeni geçen" (cross_below → SAT bölgesi) hisseler raporlanır. Sonuç
 * AYRI Telegram kanalına gider: TELEGRAM_TEMA34_CHANNEL (örn. @tema34sinyal).
 *   ⚠️ Env ayarlı değilse hiçbir yere göndermez.
 *
 * ⚠️ 2026-07-19: (1) kapanış P&L teslimi GARANTİLİ — önce Telegram'a gönder,
 * BAŞARIRSA tracker.commitClosures ile kapat; başarısızsa pozisyon açık kalır →
 * sonraki turda tekrar denenir. (2) GÜNLÜK açık-pozisyon kâr/zarar raporu eklendi
 * (kullanıcı isteği: "her gün sonuç"). (3) Giriş filtresi motor tarafında (whipsaw).
 *
 * Kill-switch: TEMA34_SCANNER_DISABLED=1 → tarar + kaydeder ama bildirim atmaz.
 */

const engine = require('./tema34ScanEngine');
const store = require('./tema34ScannerStore');
const tracker = require('./tema34ScannerTracker');
const liveDataService = require('../liveDataService');
const telegramService = require('../telegramService');
const competitionManager = require('../botCompetition/competitionManager');
const logger = require('../../utils/logger');

const DEEP_LINK = '/firsatlar?tab=tarama';
const TELEGRAM_MAX = 3900;          // 4096 limitin altında güvenli pay
const SECTION_CAP = 80;             // bir kovada Telegram'da listelenecek en fazla hisse
const HARD_TIMEOUT_MS = 16000;      // tek bir dış çağrı asla cron'u dondurmasın
const REPORT_FETCH_BATCH = 8;       // günlük rapor: açık sembol fiyat çekimi paralel batch

const TF_LABEL = { '4h': '4 SAATLİK', '1d': 'GÜNLÜK' };

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

// Blokları ≤TELEGRAM_MAX parçalara böl (ortak yardımcı).
function packMessages(blocks) {
  const messages = [];
  let cur = '';
  for (const block of blocks) {
    if (!block) continue;
    const candidate = cur ? `${cur}\n\n${block}` : block;
    if (candidate.length > TELEGRAM_MAX && cur) { messages.push(cur); cur = block; }
    else cur = candidate;
  }
  if (cur) messages.push(cur);
  return messages;
}

// Yeni kanalın hedef kimliği. Ayarlı değilse boş döner → gönderim yapılmaz.
function channelId() {
  return process.env.TELEGRAM_TEMA34_CHANNEL || '';
}

// Bir TF için idempotluk anahtarı: 1d → tarih; 4h → son bar ISO zamanı.
function barKeyOf(tfResult) {
  if (!tfResult) return null;
  if (tfResult.tf === '1d') return tfResult.candleDate || null;
  if (Number.isFinite(tfResult.barTime)) return new Date(tfResult.barTime).toISOString();
  return tfResult.candleDate || null;
}

// ── Telegram mesaj gövdesi (yeni giren / sat bölgesi) ────────────────────────
function buildTelegramSection(emoji, title, rows) {
  if (!rows.length) return '';
  const lines = [`${emoji} <b>${htmlEscape(title)}</b> (${rows.length})`];
  for (const r of rows.slice(0, SECTION_CAP)) {
    lines.push(`• ${htmlEscape(r.symbol)}  ${fmtPrice(r.close)} TL  (${sign(r.distancePct)}${r.distancePct}%)`);
  }
  if (rows.length > SECTION_CAP) lines.push(`  …ve ${rows.length - SECTION_CAP} hisse daha`);
  return lines.join('\n');
}

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
  return packMessages([header, ...sections, footer]);
}

async function sendMessages(messages) {
  const chatId = channelId();
  if (!chatId) return { sent: 0, total: messages.length, chatSet: false, delivered: false };
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
  return { sent, total: messages.length, chatSet: true, delivered: messages.length > 0 && sent === messages.length };
}

// ── SONUÇ (ters-kesişim) bildirimi ──────────────────────────────────────────
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

function buildClosureMessages(events) {
  const list = events || [];
  if (!list.length) return [];
  const header =
    '📊 <b>TEMA34 SONUÇ — Ters kesişim</b>\n' +
    'Daha önce AL bölgesine giren hisseler sat bölgesine geçti (sinyal sonucu).';
  const footer = `Detay: ${DEEP_LINK}\nNot: Yatırım tavsiyesi değildir.`;
  return packMessages([header, ...list.map(buildClosureBlock), footer]);
}

// Kapanışları @tema34sinyal kanalına gönder. Dönüş delivered ile tam-teslim bilgisi taşır.
async function pushClosures(events) {
  const list = events || [];
  if (!list.length) return { sent: 0, total: 0, delivered: false };
  if (process.env.TEMA34_SCANNER_DISABLED === '1') return { sent: 0, total: list.length, disabled: true, delivered: false };
  return sendMessages(buildClosureMessages(list));
}

// ── GÜNLÜK açık-pozisyon kâr/zarar raporu ────────────────────────────────────
// Bir açık pozisyonun güncel (onaylanmış) kapanışı — gün-içi yarım mumu düşer.
async function latestClose(symbol, now = new Date()) {
  const hist = await liveDataService.fetchHistoricalData(symbol, '3mo', '1d');
  if (!Array.isArray(hist) || !hist.length) return null;
  const c = engine.dropFormingDaily(hist, now);
  const last = c[c.length - 1];
  return last && Number.isFinite(last.close) ? +Number(last.close).toFixed(2) : null;
}
function dayCount(entryDate, dateKey) {
  if (!entryDate || !dateKey) return null;
  const d = (Date.parse(dateKey) - Date.parse(entryDate)) / 86400000;
  return Number.isFinite(d) ? Math.max(0, Math.round(d)) : null;
}

function buildDailyReportLine(r) {
  if (r.pnlPct == null || r.current == null) {
    return `• ${htmlEscape(r.symbol)}  giriş ${fmtPrice(r.entry)} → (fiyat yok)`;
  }
  const mark = r.pnlPct >= 0 ? '🟢' : '🔴';
  const days = r.days != null ? ` · ${r.days} gün` : '';
  return `${mark} ${htmlEscape(r.symbol)}  ${fmtPrice(r.entry)} → ${fmtPrice(r.current)}  (${sign(r.pnlPct)}${r.pnlPct}%)${days}`;
}

// Günlük rapor mesajları (saf → test edilebilir). rows: {symbol,entry,current,pnlPct,days},
// closedToday: bugün kapanan ters-kesişim olayları.
function buildDailyReportMessages({ dateKey, rows, closedToday }) {
  const priced = (rows || []).filter(r => r.pnlPct != null);
  const green = priced.filter(r => r.pnlPct >= 0).length;
  const red = priced.length - green;
  const avg = priced.length ? +(priced.reduce((s, r) => s + r.pnlPct, 0) / priced.length).toFixed(2) : null;
  const sorted = [...(rows || [])].sort((a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity));

  const header =
    `📊 <b>TEMA34 AÇIK POZİSYON DURUMU</b> — ${htmlEscape(dateKey)}\n` +
    `AL bölgesine giren sinyallerin bugünkü kâr/zararı (giriş kapanışına göre):`;

  const body = sorted.length
    ? sorted.slice(0, SECTION_CAP).map(buildDailyReportLine).join('\n') +
      (sorted.length > SECTION_CAP ? `\n  …ve ${sorted.length - SECTION_CAP} pozisyon daha` : '')
    : '(açık AL pozisyonu yok)';

  const summary = priced.length
    ? `Özet: ${rows.length} açık · ${green} 🟢 / ${red} 🔴 · ort. ${sign(avg)}${avg}%`
    : `Özet: ${(rows || []).length} açık pozisyon`;

  const blocks = [header, body, summary];
  if ((closedToday || []).length) {
    const cl = ['<b>Bugün kapananlar (sonuç):</b>',
      ...closedToday.map(ev => `${ev.pnlPct >= 0 ? '🟢' : '🔴'} ${htmlEscape(ev.symbol)} AL→SAT ${sign(ev.pnlPct)}${ev.pnlPct}%`)].join('\n');
    blocks.push(cl);
  }
  blocks.push(`Detay: ${DEEP_LINK}\nNot: Yatırım tavsiyesi değildir.`);
  return packMessages(blocks);
}

// Günlük raporu üret + gönder. Gün-bazlı dedup (aynı gün iki kez atmaz). Açık
// pozisyon YOKSA ve bugün kapanan da yoksa sessizce atlar (boş rapor spam'ı önler).
async function pushDailyReport(opts = {}) {
  const now = opts.now || new Date();
  const chatId = channelId();
  if (!chatId) return { sent: 0, chatSet: false };
  if (process.env.TEMA34_SCANNER_DISABLED === '1') return { sent: 0, disabled: true };
  const dateKey = engine.trDate(now);
  if (!opts.force && store.getDailyReportDate && store.getDailyReportDate() === dateKey) {
    return { sent: 0, skipped: 'already-sent' };
  }

  const open = await tracker.getOpen();
  const closedToday = (await tracker.getClosedRecent()).filter(c => c.exitDate === dateKey);
  if (!open.length && !closedToday.length) return { sent: 0, skipped: 'nothing-to-report' };

  const rows = [];
  for (let i = 0; i < open.length; i += REPORT_FETCH_BATCH) {
    const batch = open.slice(i, i + REPORT_FETCH_BATCH);
    const closes = await Promise.all(batch.map(async p => {
      try { return await withTimeout(latestClose(p.symbol, now), HARD_TIMEOUT_MS, 'price'); }
      catch (_) { return null; }
    }));
    batch.forEach((p, j) => {
      const current = closes[j];
      const pnlPct = (current != null && p.entry > 0) ? +(((current - p.entry) / p.entry) * 100).toFixed(2) : null;
      rows.push({ symbol: p.symbol, entry: p.entry, current, pnlPct, days: dayCount(p.entryDate, dateKey) });
    });
  }

  const res = await sendMessages(buildDailyReportMessages({ dateKey, rows, closedToday }));
  if (res.sent > 0 && store.markDailyReport) store.markDailyReport(dateKey);
  logger.info(`📊 TEMA34 günlük rapor — ${dateKey}: ${open.length} açık · ${closedToday.length} bugün kapanan · TG ${res.sent}`);
  return res;
}

// ── Tek TF değerlendir + gönder ──────────────────────────────────────────────
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
    if (barKey) store.markBar(tf, barKey);
  } else if (disabled) {
    skippedReason = 'disabled';
  } else if (!channelId()) {
    skippedReason = 'no-channel';
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
    filteredOut: tfResult.filteredOut || 0,
    notified, skippedReason, telegramSent: telegram.sent || 0,
    preview: { up: up.slice(0, 10).map(r => r.symbol), down: down.slice(0, 10).map(r => r.symbol) },
  };
}

/**
 * Tüm zaman dilimlerini tara + (gerekirse) bildir + durum kaydet.
 */
async function runAndNotify(opts = {}) {
  const result = await engine.scanAll();

  if (!result.ok) {
    logger.error(`[TEMA34Scanner] tarama başarısız: ${result.error || (result.busy ? 'meşgul' : 'bilinmeyen')}`);
    return { ok: false, notified: false, error: result.error, busy: result.busy };
  }

  try { competitionManager.observeSnapshot('tema34', result); }
  catch (e) { logger.warn(`[BotYarisi] tema34 gözlem atlandı: ${e.message}`); }

  const timeframes = {};
  let anyNotified = false;
  for (const tf of engine.TIMEFRAMES) {
    const r = await processTimeframe(result[tf], opts);
    timeframes[tf] = r;
    if (r.notified) anyNotified = true;
  }

  // SONUÇ takibi (yalnız 1d): AL girenleri kaydet + o an çizgi altına geçenleri
  // KAPAT. ⚠️ GARANTİLİ TESLİM: önce Telegram'a P&L gönder, BAŞARIRSA commit
  // (kapat). Gönderim başarısızsa pozisyon açık kalır → sonraki turda tekrar denenir.
  let closed = 0;
  const trackingOn = !!channelId() && process.env.TEMA34_SCANNER_DISABLED !== '1';
  if (trackingOn && result['1d']?.ok) {
    try {
      const { closures, opened } = await tracker.sync(result['1d']);
      if (opened.length) logger.info(`📊 TEMA34 takip — ${opened.length} yeni AL izlemede`);
      if (closures.length) {
        const push = await pushClosures(closures);
        if (push.delivered) {
          tracker.commitClosures(closures);
          try { competitionManager.recordClosures('tema34', closures); } catch (_) {}
          closed = push.sent || 0;
          logger.info(`📊 TEMA34 sonuç — ${closures.length} ters-kesişim teslim edildi · TG ${closed}`);
        } else {
          logger.warn(`📊 TEMA34 sonuç — ${closures.length} kapanış TESLİM EDİLEMEDİ, sonraki turda tekrar denenecek`);
        }
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
  pushDailyReport,
  // pure builders — test edilebilir
  buildTimeframeMessages,
  buildTelegramSection,
  buildClosureBlock,
  buildClosureMessages,
  buildDailyReportMessages,
  buildDailyReportLine,
  DEEP_LINK,
  TF_LABEL,
};
