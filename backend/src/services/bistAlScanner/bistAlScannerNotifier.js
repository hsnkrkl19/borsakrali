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
    if (!priceAboveEma || !volConfirms) return null;

    return {
      ...sig,
      gate: {
        ema34: +ema34.toFixed(sig.precision ?? 2),
        priceAboveEma,
        volNow,
        avgVol20: Math.round(avgVol20),
        volConfirms,
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
    `📊 Trend ✓ (EMA34 ${fmt(p.gate?.ema34, pr)} üzeri) · Hacim ✓`,
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
  MIN_AVGSCORE, TOP_N, VOL_MULT, MIN_ADX, MAX_RSI, DEEP_LINK,
};
