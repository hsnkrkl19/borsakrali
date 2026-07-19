/**
 * BIST AL Scanner Notifier — TÜM BIST'i tarar, SIKI koşullu "AL" (spot-long)
 * sinyallerini AYRI, YENİ bir Telegram kanalına gönderir.
 *
 * Mevcut bistScoreEngine TÜM BIST'i (510) 5 teknikle puanlar ve LONG adayları
 * döndürür. Bu bot onun çıktısını yeniden kullanır ve ÜZERİNE SIKI KALİTE KAPISI
 * uygular (kullanıcı "daha eleyici" istedi):
 *   1) avgVoteScore (5 strateji ort.) ≥ BIST_AL_MIN_AVGSCORE (vars. 80)
 *   2) ADX ≥ BIST_AL_MIN_ADX (vars. 20) — gerçek trend (yatay/choppy elenir)
 *   3) RSI < BIST_AL_MAX_RSI (vars. 78) — aşırı-alım/geç giriş elenir
 *   4) Fiyat EMA34'ün ÜSTÜNDE (trend yukarı)
 *   5) Son hacim 20-gün ortalamanın üstünde × BIST_AL_VOL_MULT (vars. 1.3) (teyit)
 *   6) Likidite: ort. günlük ciro (avgVol20×fiyat) ≥ BIST_AL_MIN_TURNOVER
 *      (vars. 200M TL) — küçük-cap/spekülatif isimleri eler
 * Kalanlardan avgScore'a göre top BIST_AL_TOP_N (vars. 3) sinyal yayınlanır.
 *
 * Hedef kanal = TELEGRAM_BIST_AL_CHANNEL (zorunlu — kullanıcının kuracağı yeni
 * kanal). ⚠️ Kanal env'i AYARLI DEĞİLSE hiçbir yere göndermez (ana/forex kanalına
 * ASLA düşmez). Yalnız Telegram kanalı — uygulama/web push YOK.
 *
 * Dedup: aynı işlem gününde bir hisse YALNIZ BİR KEZ (store.sentSetFor) → saatlik
 * kadans aynı listeyi tekrar atmaz; yalnız o gün yeni nitelenen hisseler gider.
 * Kill-switch: BIST_AL_SCANNER_DISABLED=1 → tarar + kaydeder ama bildirim atmaz.
 */

const bistScoreEngine = require('../bistSignals/bistScoreEngine');
const liveDataService = require('../liveDataService');
const { ema, sma } = require('../forex/indicators');
const telegramService = require('../telegramService');
const store = require('./bistAlScannerStore');
const tracker = require('./bistAlScannerTracker');
const marketHours = require('../marketHours');
const competitionManager = require('../botCompetition/competitionManager');
const logger = require('../../utils/logger');

function envNum(name, def) { const v = Number(process.env[name]); return Number.isFinite(v) ? v : def; }
// Kalite ölçütü: motorun "consensus-güven"i BIST'te ≥75 üretemiyor (5 strateji
// nadiren anlaşır → güven ~45'te takılır). Bunun yerine 5 stratejinin ORTALAMA
// puanı (avgVoteScore, 0-100) kullanılır — kaliteli hisseler 75-82'ye ulaşır.
const MIN_AVGSCORE = envNum('BIST_AL_MIN_AVGSCORE', 80);
const TOP_N = envNum('BIST_AL_TOP_N', 3);
const VOL_MULT = envNum('BIST_AL_VOL_MULT', 1.3);
// Ek eleyici kapılar (motorun verdiği indikatörlerden — yeniden veri çekmeden):
//   ADX ≥ MIN_ADX → gerçek trend (yatay piyasa elenir); RSI < MAX_RSI → aşırı-alım
//   değil (geç/riskli giriş elenir).
const MIN_ADX = envNum('BIST_AL_MIN_ADX', 20);
const MAX_RSI = envNum('BIST_AL_MAX_RSI', 78);
// Likidite tabanı: ort. 20-gün günlük İŞLEM HACMİ (TL cirosu = avgVol20 × fiyat)
// bu eşiğin altındaysa ELE → küçük-cap/spekülatif isimler çıkar (kullanıcı isteği).
// Kalibrasyon (2026-07-03): gelen küçük-cap junk ≤~140M TL/gün; avgScore≥80 geçen
// LİKİT adaylar (YKBNK 6132M, SELEC 1533M, AKFYE 249M) ≥~250M → 200M TL/gün eşiği
// junk'ı eler ama likit kaliteli isimleri (AKFYE dahil) tutar. Env ile ayarlanır.
const MIN_TURNOVER = envNum('BIST_AL_MIN_TURNOVER', 200000000);
const EMA_PERIOD = 34;
const MIN_CANDLES = 50;            // EMA34 + 20-gün hacim ortalaması için yeterli geçmiş
const GATE_BATCH = 6;              // gate için az sayıda aday → küçük batch
const GATE_PAUSE_MS = 150;
const DEEP_LINK = '/firsatlar?tab=sinyaller';
const TELEGRAM_MAX = 3900;
const HARD_TIMEOUT_MS = 16000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function withTimeout(promise, ms, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms)),
  ]);
}
function htmlEscape(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmt(v, p = 2) {
  return v == null ? '-' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: p, maximumFractionDigits: p });
}
// Avrupa/İstanbul işlem günü anahtarı (YYYY-MM-DD) — günlük dedup için.
function tradingDateKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

// Yeni kanalın hedef kimliği. Ayarlı değilse boş → gönderim yapılmaz.
function channelId() {
  return process.env.TELEGRAM_BIST_AL_CHANNEL || '';
}

/**
 * SIKI KALİTE KAPISI — tek aday için trend + hacim teyidi. Engine zaten güven
 * ≥ eşik garantiledi; burada günlük mumdan EMA34 ve 20-gün hacim ortalaması
 * türetip fiyat>EMA34 ve hacim>ortalama×mult koşullarını doğrular.
 * Geçerse zenginleştirilmiş sinyali, değilse null döner.
 */
async function passesGate(sig) {
  try {
    const hist = await liveDataService.fetchHistoricalData(sig.symbol, '1y', '1d');
    const candles = bistScoreEngine.toCandles(hist);
    if (candles.length < MIN_CANDLES) return null;

    const closes = candles.map(c => c.close);
    const vols = candles.map(c => c.volume || 0);
    const ema34 = ema(closes, EMA_PERIOD);
    const close = closes[closes.length - 1];
    const volNow = vols[vols.length - 1];
    const avgVol20 = sma(vols, 20);

    if (ema34 == null || avgVol20 == null) return null;
    const priceAboveEma = close > ema34;
    const volConfirms = volNow > avgVol20 * VOL_MULT;
    const avgTurnover = avgVol20 * close;               // ort. 20-gün günlük TL cirosu
    const liquid = avgTurnover >= MIN_TURNOVER;         // likidite tabanı (küçük-cap eler)
    if (!priceAboveEma || !volConfirms || !liquid) return null;

    return {
      ...sig,
      gate: {
        ema34: +ema34.toFixed(sig.precision ?? 2),
        priceAboveEma,
        volNow,
        avgVol20: Math.round(avgVol20),
        volConfirms,
        turnoverM: +(avgTurnover / 1e6).toFixed(1),
        liquid,
      },
    };
  } catch (e) {
    return null;
  }
}

// ── Telegram mesaj gövdesi (≤TELEGRAM_MAX parçalara bölünmüş) ─────────────────
function buildSignalBlock(p) {
  const pr = p.precision ?? 2;
  return [
    `📈 <b>${htmlEscape(p.symbol)}</b> — AL · Güç <b>${p.avgVoteScore}/100</b>`,
    p.name && p.name !== p.symbol ? htmlEscape(p.name) : null,
    `Giriş: <b>${fmt(p.entry, pr)} TL</b>`,
    `Stop: ${fmt(p.stop, pr)} | TP1: ${fmt(p.target1, pr)} (R/R ${p.rr1}) | TP2: ${fmt(p.target2, pr)} (R/R ${p.rr2})`,
    `📊 Trend ✓ (EMA34 ${fmt(p.gate?.ema34, pr)} üzeri) · Hacim ✓ · Ciro ~${fmt(p.gate?.turnoverM, 0)}M TL`,
  ].filter(Boolean).join('\n');
}

function buildTelegramMessages(result) {
  const { tradingDate, scanned, signals } = result;
  const header =
    `📈 <b>BIST AL SİNYALLERİ</b> — ${htmlEscape(tradingDate || '-')}\n` +
    `Taranan ${scanned} hisse · Güç≥${MIN_AVGSCORE} (5 strateji ort.) + trend (EMA34/ADX) + hacim + RSI süzgeci`;
  const footer = `Detay: ${DEEP_LINK}\nNot: Yatırım tavsiyesi değildir.`;

  const blocks = [header, ...signals.map(buildSignalBlock), footer];
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
  if (!chatId) return { sent: 0, total: 0, chatSet: false };
  const messages = buildTelegramMessages(result);
  let sent = 0;
  for (const msg of messages) {
    try {
      const r = await withTimeout(telegramService.sendMessage(chatId, msg), HARD_TIMEOUT_MS, 'tg');
      if (r?.success) sent++;
      else logger.error(`[BistAlScanner] Telegram başarısız: ${r?.error || '?'}`);
    } catch (e) {
      logger.error(`[BistAlScanner] Telegram hata: ${e.message}`);
    }
  }
  return { sent, total: messages.length, chatSet: true };
}

// ── TP/SL kapanış bildirimi (verilen sinyalin sonucu — gecikmeli de olsa) ─────
function closureHead(outcome) {
  if (outcome === 'TP1') return '✅ <b>TP OLDU (Hedef)</b>';
  if (outcome === 'SL') return '🛑 <b>STOP OLDU</b>';
  return '⏱️ <b>SÜRE DOLDU (kapandı)</b>';
}
// Tek kapanış olayı → Telegram gövdesi. AL kanalı "Güç" (avgVoteScore) diliyle konuşur.
function buildClosureBlock(ev) {
  const pr = ev.precision ?? 2;
  const sign = ev.pnlPct >= 0 ? '+' : '';
  return [
    `${closureHead(ev.outcome)} — <b>${htmlEscape(ev.symbol)}</b> AL${ev.score != null ? ` · Güç ${ev.score}/100` : ''}`,
    `Giriş ${fmt(ev.entry, pr)} → Çıkış ${fmt(ev.exit, pr)}${ev.exitDate ? ` (${htmlEscape(ev.exitDate)})` : ''}`,
    `Sonuç: <b>${sign}${ev.pnlPct}%</b>`,
  ].join('\n');
}

// Kapanış olaylarını AL kanalına (@borsasinyal34) gönder. Kill-switch: bot kapalıysa
// (BIST_AL_SCANNER_DISABLED) veya kanal ayarlı değilse gönderme. `delivered` =
// kanal açık + TÜM olaylar başarıyla gönderildi (garantili-teslim commit kararı için).
async function pushClosures(events) {
  const list = events || [];
  if (!list.length) return { sent: 0, total: 0, delivered: false };
  if (process.env.BIST_AL_SCANNER_DISABLED === '1') return { sent: 0, total: list.length, disabled: true, delivered: false };
  const chatId = channelId();
  if (!chatId) return { sent: 0, total: list.length, chatSet: false, delivered: false };
  let sent = 0;
  for (const ev of list) {
    try {
      const r = await withTimeout(telegramService.sendMessage(chatId, buildClosureBlock(ev)), HARD_TIMEOUT_MS, 'closeTg');
      if (r?.success) sent++;
      else logger.error(`[BistAlScanner] kapanış Telegram başarısız (${ev.symbol}): ${r?.error || '?'}`);
    } catch (e) {
      logger.error(`[BistAlScanner] kapanış Telegram hata (${ev.symbol}): ${e.message}`);
    }
  }
  if (sent) logger.info(`📈✅ BIST AL kapanış — ${list.length} olay · TG ${sent}`);
  return { sent, total: list.length, chatSet: true, delivered: sent === list.length };
}

// Açık AL sinyallerinin TP/SL kapanışını TESPİT et + (garantili) bildir + KESİNLEŞTİR.
// ⚠️ 2026-07-19 GARANTİLİ TESLİM: önce Telegram'a gönder, BAŞARIRSA (veya bilinçli
// olarak gönderilmeyecekse: kill-switch / kanal yok) commitClosures ile kapat.
// Kanal açıkken gönderim başarısızsa pozisyon AÇIK kalır → sonraki 15 dk turunda
// evalOne geçmişten yeniden türetir → tekrar denenir (sonucu KAYBETMEZ).
async function checkAndPushClosures() {
  let events = [];
  try { events = await tracker.checkClosures(); }          // TESPİT (silmez)
  catch (e) { logger.error(`[BistAlScanner] kapanış kontrolü hata: ${e.message}`); return { closed: 0, sent: 0 }; }
  if (!events.length) return { closed: 0, sent: 0 };

  const push = await pushClosures(events);
  // Teslim edildi (delivered) VEYA bilinçli olarak gönderilmeyecek (disabled / kanal yok)
  // → kesinleştir. Yalnız GEÇİCİ gönderim hatasında (kanal açık ama TG hatası) açık bırak.
  if (push.delivered || push.disabled || push.chatSet === false) {
    tracker.commitClosures(events);
    try { competitionManager.recordClosures('bist-buy-scanner', events); } catch (_) {}
  } else {
    logger.warn(`[BistAlScanner] ${events.length} kapanış TESLİM EDİLEMEDİ, sonraki turda tekrar denenecek`);
  }
  return { closed: events.length, sent: push.sent || 0 };
}

// ── GÜNLÜK açık-pozisyon kâr/zarar raporu (kullanıcı isteği: "her gün sonuç") ──
// Bir açık pozisyonun güncel (onaylanmış) kapanışı — gün-içi yarım mumu düşer.
async function latestClose(symbol, now = new Date()) {
  const hist = await liveDataService.fetchHistoricalData(symbol, '3mo', '1d');
  if (!Array.isArray(hist) || !hist.length) return null;
  let arr = hist;
  const last = arr[arr.length - 1];
  const d = last.date || (Number.isFinite(last.timestamp) ? new Date(last.timestamp).toISOString().slice(0, 10) : null);
  const trToday = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  if (d === trToday && marketHours.minutesNow(now) < (marketHours.CLOSE_MIN + 5)) arr = arr.slice(0, -1);
  const c = arr[arr.length - 1];
  return c && Number.isFinite(c.close) ? +Number(c.close).toFixed(2) : null;
}

function buildDailyReportLine(r) {
  const pr = r.precision ?? 2;
  if (r.pnlPct == null || r.current == null) {
    return `• ${htmlEscape(r.symbol)}  giriş ${fmt(r.entry, pr)} → (fiyat yok)`;
  }
  const mark = r.pnlPct >= 0 ? '🟢' : '🔴';
  const s = r.pnlPct >= 0 ? '+' : '';
  return `${mark} ${htmlEscape(r.symbol)}  ${fmt(r.entry, pr)} → ${fmt(r.current, pr)}  (${s}${r.pnlPct}%) · TP1 ${fmt(r.target1, pr)} / Stop ${fmt(r.stop, pr)}`;
}

// Günlük rapor mesajları (saf → test edilebilir).
function buildDailyReportMessages({ dateKey, rows, closedToday }) {
  const priced = (rows || []).filter(r => r.pnlPct != null);
  const green = priced.filter(r => r.pnlPct >= 0).length;
  const red = priced.length - green;
  const avg = priced.length ? +(priced.reduce((s, r) => s + r.pnlPct, 0) / priced.length).toFixed(2) : null;
  const sorted = [...(rows || [])].sort((a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity));

  const header =
    `📈 <b>BIST AL AÇIK POZİSYON DURUMU</b> — ${htmlEscape(dateKey)}\n` +
    `Verilen AL sinyallerinin bugünkü kâr/zararı (giriş → güncel kapanış):`;
  const body = sorted.length
    ? sorted.map(buildDailyReportLine).join('\n')
    : '(açık AL pozisyonu yok)';
  const summary = priced.length
    ? `Özet: ${rows.length} açık · ${green} 🟢 / ${red} 🔴 · ort. ${avg >= 0 ? '+' : ''}${avg}%`
    : `Özet: ${(rows || []).length} açık pozisyon`;

  const blocks = [header, body, summary];
  if ((closedToday || []).length) {
    const cl = ['<b>Bugün kapananlar (sonuç):</b>',
      ...closedToday.map(ev => `${closureHead(ev.outcome)} ${htmlEscape(ev.symbol)} ${ev.pnlPct >= 0 ? '+' : ''}${ev.pnlPct}%`)].join('\n');
    blocks.push(cl);
  }
  blocks.push(`Detay: ${DEEP_LINK}\nNot: Yatırım tavsiyesi değildir.`);

  // ≤TELEGRAM_MAX parçalara böl
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

// Günlük raporu üret + gönder (cron; ~18:45 TR). Gün-bazlı dedup. Açık pozisyon +
// bugün kapanan yoksa sessiz. Kanal yok / kill-switch → gönderim yok.
async function pushDailyReport(opts = {}) {
  const now = opts.now || new Date();
  const chatId = channelId();
  if (!chatId) return { sent: 0, chatSet: false };
  if (process.env.BIST_AL_SCANNER_DISABLED === '1') return { sent: 0, disabled: true };
  const dateKey = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  if (!opts.force && store.getDailyReportDate && store.getDailyReportDate() === dateKey) {
    return { sent: 0, skipped: 'already-sent' };
  }

  const open = await tracker.getOpen();
  const closedToday = (await tracker.getClosedRecent()).filter(c => c.exitDate === dateKey);
  if (!open.length && !closedToday.length) return { sent: 0, skipped: 'nothing-to-report' };

  const rows = [];
  const BATCH = 6;
  for (let i = 0; i < open.length; i += BATCH) {
    const batch = open.slice(i, i + BATCH);
    const closes = await Promise.all(batch.map(async p => {
      try { return await withTimeout(latestClose(p.symbol, now), HARD_TIMEOUT_MS, 'price'); }
      catch (_) { return null; }
    }));
    batch.forEach((p, j) => {
      const current = closes[j];
      const pnlPct = (current != null && p.entry > 0) ? +(((current - p.entry) / p.entry) * 100).toFixed(2) : null;
      rows.push({ symbol: p.symbol, entry: p.entry, stop: p.stop, target1: p.target1, precision: p.precision, current, pnlPct });
    });
  }

  const messages = buildDailyReportMessages({ dateKey, rows, closedToday });
  const chatIdNow = channelId();
  let sent = 0;
  for (const msg of messages) {
    try {
      const r = await withTimeout(telegramService.sendMessage(chatIdNow, msg), HARD_TIMEOUT_MS, 'dailyTg');
      if (r?.success) sent++;
      else logger.error(`[BistAlScanner] günlük rapor Telegram başarısız: ${r?.error || '?'}`);
    } catch (e) { logger.error(`[BistAlScanner] günlük rapor hata: ${e.message}`); }
  }
  if (sent > 0 && store.markDailyReport) store.markDailyReport(dateKey);
  logger.info(`📈 BIST AL günlük rapor — ${dateKey}: ${open.length} açık · ${closedToday.length} bugün kapanan · TG ${sent}`);
  return { sent, total: messages.length };
}

/**
 * Tara + sıkı kapı + (günlük yeni olanları) bildir + durum kaydet.
 * opts.force=true → günlük dedup atlanır (manuel/test; aynı hisse tekrar gidebilir).
 */
async function runAndNotify(opts = {}) {
  const force = !!opts.force;
  const tradingDate = tradingDateKey();

  let snap;
  try {
    // minConfidence:0 → motor güven ön-filtresini ATLAR, TÜM long adayları
    // avgVoteScore ile döner (BIST'te consensus-güven ≥75 üretemiyor).
    snap = await bistScoreEngine.scan({ force: true, minConfidence: 0 });
  } catch (e) {
    logger.error(`[BistAlScanner] tarama başarısız: ${e.message}`);
    return { ok: false, notified: false, error: e.message };
  }

  const scanned = snap?.scanned || 0;
  // Kalite kapısı: LONG + avgVoteScore ≥ eşik + gerçek trend (ADX) + aşırı-alım
  // değil (RSI). ADX/RSI motorun indicators çıktısından okunur (ek veri çekmeden);
  // değer yoksa güvenli tarafta ELE (null ADX→0<eşik, null RSI→100≥eşik).
  const candidates = (snap?.all || [])
    .filter(s => s && s.direction === 'long'
      && (s.avgVoteScore || 0) >= MIN_AVGSCORE
      && (s.indicators?.adx ?? 0) >= MIN_ADX
      && (s.indicators?.rsi ?? 100) < MAX_RSI)
    .sort((a, b) => b.avgVoteScore - a.avgVoteScore);

  // SIKI KAPI: trend + hacim teyidi (küçük batch'lerle)
  const gated = [];
  for (let i = 0; i < candidates.length; i += GATE_BATCH) {
    const batch = candidates.slice(i, i + GATE_BATCH);
    const res = await Promise.all(batch.map(s => passesGate(s)));
    for (const r of res) if (r) gated.push(r);
    if (i + GATE_BATCH < candidates.length) await sleep(GATE_PAUSE_MS);
  }
  gated.sort((a, b) => b.avgVoteScore - a.avgVoteScore);
  const qualified = gated.slice(0, TOP_N);

  try { competitionManager.observeSnapshot('bist-buy-scanner', { ...snap, signals: qualified }); }
  catch (e) { logger.warn(`[BotYarisi] bist-buy gözlem atlandı: ${e.message}`); }

  const disabled = process.env.BIST_AL_SCANNER_DISABLED === '1';
  const sentSet = force ? new Set() : store.sentSetFor(tradingDate);
  const fresh = qualified.filter(s => !sentSet.has(s.symbol));

  let notified = false;
  let skippedReason = null;
  let telegram = { sent: 0 };

  if (qualified.length === 0) {
    skippedReason = 'no-signals';                 // sıkı kapıdan geçen yok → sessiz
  } else if (fresh.length === 0) {
    skippedReason = 'already-sent';               // bugün hepsi zaten gönderildi
  } else if (disabled) {
    skippedReason = 'disabled';                   // kill-switch — gönderme, sent'e ekleme
  } else if (!channelId()) {
    skippedReason = 'no-channel';                 // yeni kanal henüz ayarlanmadı — sessiz
  } else {
    telegram = await sendTelegram({ tradingDate, scanned, signals: fresh });
    notified = telegram.sent > 0;
    // ⚠️ 2026-07-19: takibe kaydı GÖNDERİMDEN AYIR — geçici Telegram hatası olsa
    // bile sinyalleri TP/SL takibine al (eski bug: "kanal düşükken üretilen sinyal
    // hiç izlenmiyor, sonucu hiç bildirilmiyor"). registerSignals idempotent
    // (sembol-bazlı). markSent YALNIZ gerçekten gönderilince → gönderilemeyen sinyal
    // "fresh" kalır, sonraki 15 dk turunda yeniden gönderilir.
    try { await tracker.registerSignals(fresh); }
    catch (e) { logger.error(`[BistAlScanner] takip kaydı hata: ${e.message}`); }
    if (notified) store.markSent(tradingDate, fresh.map(s => s.symbol));
    logger.info(`📈 BIST AL tarama — ${tradingDate}: ${fresh.length} yeni AL · TG ${telegram.sent}`);
  }

  const summary = {
    runAt: new Date().toISOString(),
    tradingDate, scanned,
    candidates: candidates.length,
    qualified: qualified.length,
    freshCount: fresh.length,
    notified, skippedReason, forced: force,
    telegramSent: telegram.sent || 0,
    signals: qualified.map(s => ({
      symbol: s.symbol, avgScore: s.avgVoteScore, confidence: s.confidence,
      entry: s.entry, stop: s.stop, target1: s.target1, target2: s.target2,
      fresh: fresh.includes(s),
    })),
  };
  store.recordRun(summary);
  return { ok: true, ...summary };
}

module.exports = {
  runAndNotify,
  channelId,
  passesGate,
  buildTelegramMessages,
  buildSignalBlock,
  buildClosureBlock, pushClosures, checkAndPushClosures,
  pushDailyReport, buildDailyReportMessages, buildDailyReportLine,
  MIN_AVGSCORE, TOP_N, VOL_MULT, MIN_ADX, MAX_RSI, MIN_TURNOVER, DEEP_LINK,
};
