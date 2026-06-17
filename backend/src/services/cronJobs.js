/**
 * Cron Jobs Service
 * Scheduled tasks for updating ALL BIST stocks dynamically
 */

const cron = require('node-cron');
const bulkDataUpdater = require('./bulkDataUpdaterService');
const signalDetectionService = require('./signalDetectionService');
const kapService = require('./kapService');
const dailySignalsService = require('./dailySignalsService');
const cryptoSignalsService = require('./cryptoSignalsService');
const forexEngine = require('./forex/forexEngineMTF');
const forexBacktest = require('./forex/forexBacktest');
const forexPushNotifier = require('./forex/forexPushNotifier');
const forexSignalTracker = require('./forex/forexSignalTracker');
const multiTimeframeService = require('./multiTimeframeService');
const signalConfidenceService = require('./signalConfidenceService');
const socketService = require('./socketService');
const pushNotificationService = require('./pushNotificationService');
const economicCalendarService = require('./economicCalendarService');
const botEngine = require('./tradingBotV2/botEngine');
const cryptoBotEngine = require('./cryptoBotV2/cryptoBotEngine');
const tema34Engine = require('./tema34Bot/tema34Engine');
const customBotEngine = require('./customBots/customBotEngine');
const customBotRegistry = require('./customBots/customBotRegistry');
const logger = require('../utils/logger');

// Türkiye saat dilimi — BIST takvimi
const TR_TZ = { timezone: 'Europe/Istanbul' };

// BIST'in kapalı olduğu 2026 resmi tatil günleri (YYYY-MM-DD).
// Borsa açılış/kapanış bildirimleri bu günlerde atılmaz.
// Ramazan/Kurban bayramları + arefe günleri dahil.
const TR_HOLIDAYS_2026 = new Set([
  '2026-01-01',                                      // Yılbaşı
  '2026-03-20', '2026-03-21', '2026-03-22',          // Ramazan Bayramı (1-3)
  '2026-04-23',                                      // Ulusal Egemenlik ve Çocuk Bayramı
  '2026-05-01',                                      // Emek ve Dayanışma Günü
  '2026-05-19',                                      // Atatürk'ü Anma, Gençlik ve Spor Bayramı
  '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', // Kurban Bayramı (arefe + 1-3)
  '2026-07-15',                                      // Demokrasi ve Millî Birlik Günü
  '2026-08-30',                                      // Zafer Bayramı
  '2026-10-28', '2026-10-29',                        // Cumhuriyet Bayramı (arefe + 1)
]);

// Avrupa/İstanbul saat diliminde bugünün YYYY-MM-DD anahtarını döndür.
function todayKeyTR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

// Avrupa/İstanbul saat diliminde yarının YYYY-MM-DD anahtarını döndür.
function tomorrowKeyTR() {
  const t = new Date(Date.now() + 86400000);
  return t.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

// ── BIST işlem saatleri (TR) ───────────────────────────────────────────────
// Tanım: borsa 09:45'te başlar, 18:30'da biter. Bu pencere dışında (ve hafta
// sonu / resmi tatil) BIST sinyal üretimi + bot tick YAPILMAZ. Kripto/altın
// 7/24 işlem gördüğü için bu kapıdan geçmez (her zaman çalışır).
const BIST_OPEN_MIN  = 9 * 60 + 45;   // 09:45 → 585
const BIST_CLOSE_MIN = 18 * 60 + 30;  // 18:30 → 1110

// TR saat diliminde gün-içi dakika (0–1439).
function trMinutesNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const hh = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const mm = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return hh * 60 + mm;
}

// TR saat diliminde haftanın günü (0=Pazar … 6=Cumartesi).
function trWeekday() {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', weekday: 'short' }).format(new Date());
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[s] != null ? map[s] : new Date().getDay();
}

// BIST şu an açık mı? Hafta içi + resmi tatil değil + 09:45–18:30 penceresi.
function isBistOpen() {
  if (TR_HOLIDAYS_2026.has(todayKeyTR())) return false;
  const wd = trWeekday();
  if (wd === 0 || wd === 6) return false;          // hafta sonu
  const m = trMinutesNow();
  return m >= BIST_OPEN_MIN && m <= BIST_CLOSE_MIN;
}

// Aynı taramanın üst üste binmesini engelleyen basit kilit. Bir 15 dk turu hâlâ
// çalışırken yeni tetik gelirse atlanır; kilit 14 dk sonra bayatlamış sayılır
// (önceki tur ölmüşse sistem kilitli kalmasın diye serbest bırakılır).
const CADENCE_STALE_MS = 14 * 60 * 1000;
let _bistCadenceLockAt = 0;
let _cryptoCadenceLockAt = 0;
// Forex turu her dk çalışır → daha kısa bayatlama penceresi (üst üste binmesin).
const FOREX_STALE_MS = 90 * 1000;
let _forexCadenceLockAt = 0;

// Borsa açılış bildirimi — TR resmi tatil günlerinde sessiz.
async function runMarketOpen() {
  try {
    const dateKey = todayKeyTR();
    if (TR_HOLIDAYS_2026.has(dateKey)) {
      logger.info(`⏭️ Market open: ${dateKey} resmi tatil — bildirim atlandı`);
      return null;
    }

    logger.info('⏰ Market open broadcast başlatıldı');
    const result = await pushNotificationService.broadcastNotification({
      title: '📈 Borsa açıldı',
      body: 'BIST seansı başladı. Bugünün fırsatları seni bekliyor.',
      path: '/gunluk-tespitler?tab=bugun',
      topic: 'all',
    });
    if (!result?.success) {
      logger.error(`[MarketOpen] broadcast başarısız: ${result?.error || 'bilinmeyen hata'}`);
    } else {
      logger.info(`✅ Market open broadcast tamamlandı (FCM: ${result.broadcast?.fcmStatus})`);
    }
    return result;
  } catch (e) {
    logger.error(`[MarketOpen] hata: ${e.message}`, e.stack);
    return null;
  }
}

// Borsa kapanış bildirimi — TR resmi tatil günlerinde sessiz.
async function runMarketClose() {
  try {
    const dateKey = todayKeyTR();
    if (TR_HOLIDAYS_2026.has(dateKey)) {
      logger.info(`⏭️ Market close: ${dateKey} resmi tatil — bildirim atlandı`);
      return null;
    }

    logger.info('⏰ Market close broadcast başlatıldı');
    const result = await pushNotificationService.broadcastNotification({
      title: '📉 Borsa kapandı',
      body: 'Seans bitti. Gün sonu raporu hazır.',
      path: '/gun-sonu-performans',
      topic: 'all',
    });
    if (!result?.success) {
      logger.error(`[MarketClose] broadcast başarısız: ${result?.error || 'bilinmeyen hata'}`);
    } else {
      logger.info(`✅ Market close broadcast tamamlandı (FCM: ${result.broadcast?.fcmStatus})`);
    }
    return result;
  } catch (e) {
    logger.error(`[MarketClose] hata: ${e.message}`, e.stack);
    return null;
  }
}

// Yarınki yüksek-etkili (importance:'high') olayları kontrol et;
// varsa kullanıcılara erken uyarı gönder. Yoksa sessiz.
async function runCalendarWarning() {
  try {
    const tomorrow = tomorrowKeyTR();
    const events = economicCalendarService.getHighImpactForDate(tomorrow);

    if (!events.length) {
      logger.info(`⏭️ Calendar warning: ${tomorrow} için yüksek-etkili veri yok — bildirim atlandı`);
      return null;
    }

    logger.info(`⏰ Calendar warning broadcast başlatıldı — ${tomorrow}: ${events.length} olay`);

    // Mesajda 3 olayın başlığını özet olarak göster — '–' işaretinden önceki kısmı al.
    const previewTitles = events
      .slice(0, 3)
      .map(e => (e.title || '').split('–')[0].trim())
      .filter(Boolean)
      .join(', ');
    const tail = events.length > 3 ? ` ve ${events.length - 3} daha` : '';
    const body = `Yarın gündemde: ${previewTitles}${tail}. Pozisyonlarını gözden geçir.`;

    const result = await pushNotificationService.broadcastNotification({
      title: `⚠️ Yarın ${events.length} kritik veri var`,
      body,
      path: '/ekonomik-takvim',
      topic: 'all',
    });
    if (!result?.success) {
      logger.error(`[CalendarWarning] broadcast başarısız: ${result?.error || 'bilinmeyen hata'}`);
    } else {
      logger.info(`✅ Calendar warning broadcast tamamlandı (FCM: ${result.broadcast?.fcmStatus})`);
    }
    return result;
  } catch (e) {
    logger.error(`[CalendarWarning] hata: ${e.message}`, e.stack);
    return null;
  }
}

// Daily signal cron'u sadece bir kere üretsin diye (manuel + cron çakışması olmasın)
async function runDailyPhase(phase, options = {}) {
  try {
    logger.info(`⏰ Daily signals (${phase}) başlatıldı`);
    const result = await dailySignalsService.runAndStore(phase);

    const trendCount     = result.trend?.signals?.length || 0;
    const reversionCount = result.reversion?.signals?.length || 0;
    const trendDiff      = result.trend?.diff?.length || 0;
    const reversionDiff  = result.reversion?.diff?.length || 0;

    // Socket.IO — frontend real-time tepki versin
    socketService.broadcastSignal({
      strategy: 'daily_signals', phase,
      generatedAt: result.generatedAt,
      trendCount, reversionCount,
      trendDiff, reversionDiff,
      stockSymbol: 'BIST_DAILY',
    });

    // FCM push (sadece premarket + revision; intraday sessiz)
    if (!options.silent && (phase === 'premarket' || phase === 'revision')) {
      // Sembol listelerini sade göster — skoru çıplak göstermeyelim, kullanıcıya bir şey ifade etmiyor.
      const trendTop     = (result.trend?.signals     || []).slice(0, 3).map(s => s.symbol).join(', ');
      const reversionTop = (result.reversion?.signals || []).slice(0, 3).map(s => s.symbol).join(', ');
      const title = phase === 'premarket'
        ? '📊 Bugünün fırsat listesi hazır (09:45)'
        : '🔄 Fırsat listesi güncellendi (11:00)';
      const body = phase === 'premarket'
        ? `Güçlü hisseler: ${trendTop || '—'} · Dönüş bölgesi: ${reversionTop || '—'}`
        : `${trendDiff + reversionDiff} hisse değişti. Güçlü: ${trendTop || '—'} · Dönüş: ${reversionTop || '—'}`;
      try {
        await pushNotificationService.broadcastNotification({
          title, body,
          path: '/gunluk-tespitler?tab=bugun',
          topic: 'all',
        });
      } catch (e) {
        logger.error(`[DailySignals] FCM push hata (${phase}): ${e.message}`);
      }
    }

    logger.info(`✅ Daily signals (${phase}) tamamlandı — Trend: ${trendCount}, Reversion: ${reversionCount}`);

    // Trading bot: yeni snapshot'ı sanal portföye ingest et (sinyal-takipli bot)
    try {
      const ingestResult = await botEngine.ingestSnapshot({ ...result, phase });
      logger.info(
        `🤖 Bot ingest (${phase}) — logged: ${ingestResult.logged}, opened: ${ingestResult.opened}, pending: ${ingestResult.addedPending}, closedByDrop: ${ingestResult.closedByDrop}`
      );
    } catch (botErr) {
      logger.error(`[Bot] ingest (${phase}) hata: ${botErr.message}`, botErr.stack);
    }

    return result;
  } catch (e) {
    logger.error(`Daily signals (${phase}) hata: ${e.message}`, e.stack);
    return null;
  }
}

// BIST 15-dk sinyal kadansı — işlem saatlerinde (09:45–18:30) her 15 dk üretir.
//   Faz içeride seçilir: günün ilk turu 'premarket' (push), 11:00+ ilk tur
//   'revision' (push), aradakiler 'intraday' (sessiz). Her turda bot snapshot'ı
//   ingest eder. Faz seçimi bugünkü snapshot'tan okunur → restart sonrası
//   mükerrer push olmaz. Pencere dışı/hafta sonu/tatil tetikleri sessizce eler.
async function runBistSignalCadence() {
  const now = Date.now();
  if (_bistCadenceLockAt && now - _bistCadenceLockAt < CADENCE_STALE_MS) {
    logger.info('⏭️ BIST sinyal turu hâlâ çalışıyor — bu 15 dk tetiği atlandı');
    return null;
  }
  if (!isBistOpen()) return null;

  _bistCadenceLockAt = now;
  try {
    const snapshotStore = require('./snapshotStore');
    const snap = snapshotStore.read(snapshotStore.dateKey());
    const hasAny = snap && (snap.premarket || snap.revision ||
      (Array.isArray(snap.intraday) && snap.intraday.length > 0));
    const m = trMinutesNow();

    let phase, silent;
    if (!hasAny) {
      phase = 'premarket'; silent = false;          // günün ilk listesi → push
    } else if (!snap.revision && m >= 11 * 60) {
      phase = 'revision';  silent = false;          // 11:00 sonrası ilk revize → push
    } else {
      phase = 'intraday';  silent = true;           // ara tazeleme → sessiz, bot ingest eder
    }
    return await runDailyPhase(phase, { silent });
  } finally {
    _bistCadenceLockAt = 0;
  }
}

// Trading bot tick — açık pozisyonların TP/SL/trailing kontrolü.
// Sadece BIST açıkken (09:45–18:30, hafta içi, tatil değil) çalışır.
async function runBotTick() {
  try {
    if (!isBistOpen()) return null;
    const result = await botEngine.tick();
    if (result?.closed || result?.trailed || result?.triggered) {
      logger.info(
        `🤖 Bot tick — checked: ${result.checked}, triggered: ${result.triggered}, trailed: ${result.trailed}, closed: ${result.closed}`
      );
    }
    return result;
  } catch (e) {
    logger.error(`[Bot] tick hata: ${e.message}`, e.stack);
    return null;
  }
}

// TEMA34 botu — BIST kapanışından sonra günlük tarama.
// Tüm BIST'i tarar; günlük kapanışı TEMA34 üzerine çıkan hisseyi alır,
// altına ineni satar. TR resmi tatil günlerinde sessiz (mum oluşmaz).
async function runTema34Bot() {
  try {
    const dateKey = todayKeyTR();
    if (TR_HOLIDAYS_2026.has(dateKey)) {
      logger.info(`⏭️ TEMA34 bot: ${dateKey} resmi tatil — tarama atlandı`);
      return null;
    }
    logger.info('⏰ TEMA34 bot günlük tarama başlatıldı');
    const result = await tema34Engine.runDaily();
    if (result?.skipped) {
      logger.info(`🤖 TEMA34 bot — ${result.reason} (mum: ${result.candleDate})`);
    } else if (result?.ok) {
      logger.info(
        `🤖 TEMA34 bot — taranan: ${result.scanned}, kesişim ↑${result.crossAbove}/↓${result.crossBelow}, alınan: ${result.opened}, satılan: ${result.closed}`
      );
    } else {
      logger.error(`[TEMA34 bot] tarama başarısız: ${result?.error || 'bilinmeyen hata'}`);
    }
    return result;
  } catch (e) {
    logger.error(`[TEMA34 bot] hata: ${e.message}`, e.stack);
    return null;
  }
}

// ── Kullanıcı-tanımlı (custom) botlar ──────────────────────────────────────
// Günlük tarama — BIST kapanışından sonra her aktif botun stratejisini evreninde
// koşturur (giriş/çıkış sinyalleri). TR resmi tatilinde sessiz. Botlar sırayla
// işlenir (Yahoo veri çekimini boğmamak için).
async function runCustomBotsDaily() {
  try {
    const dateKey = todayKeyTR();
    if (TR_HOLIDAYS_2026.has(dateKey)) {
      logger.info(`⏭️ Custom botlar: ${dateKey} resmi tatil — tarama atlandı`);
      return null;
    }
    const bots = customBotRegistry.list().filter(b => b.status !== 'paused');
    if (!bots.length) return null;
    logger.info(`⏰ Custom botlar günlük tarama başlatıldı (${bots.length} aktif bot)`);
    for (const bot of bots) {
      try {
        const r = await customBotEngine.runDaily(bot);
        if (r?.ok && !r.skipped) {
          logger.info(`🛠️🤖 Custom "${bot.name}" — taranan ${r.scanned}, giriş ${r.opened}, çıkış ${r.closed}`);
        }
      } catch (e) {
        logger.error(`[CustomBot ${bot.id}] günlük hata: ${e.message}`);
      }
    }
    return { ok: true, bots: bots.length };
  } catch (e) {
    logger.error(`[CustomBot] daily hata: ${e.message}`, e.stack);
    return null;
  }
}

// Gün-içi tick — BIST açık saatlerinde her aktif botun açık pozisyonlarının
// SL/TP/trailing/timeout kontrolü. isBistOpen() penceresi dışında çalışmaz.
async function runCustomBotsTick() {
  try {
    if (!isBistOpen()) return null;
    const bots = customBotRegistry.list().filter(b => b.status !== 'paused');
    if (!bots.length) return null;
    let totalClosed = 0, totalTrailed = 0;
    for (const bot of bots) {
      try {
        const r = await customBotEngine.tick(bot);
        totalClosed += r?.closed || 0;
        totalTrailed += r?.trailed || 0;
      } catch (e) {
        logger.error(`[CustomBot ${bot.id}] tick hata: ${e.message}`);
      }
    }
    if (totalClosed || totalTrailed) {
      logger.info(`🛠️🤖 Custom botlar tick — kapanan ${totalClosed}, trailing ${totalTrailed}`);
    }
    return { ok: true };
  } catch (e) {
    logger.error(`[CustomBot] tick hata: ${e.message}`, e.stack);
    return null;
  }
}

// Faz adı → bildirim başlığı + emoji
const CRYPTO_PHASE_TITLE = {
  morning:  '🪙 Kripto Sinyalleri (09:00)',
  midday:   '🪙 Kripto Sinyalleri (13:00)',
  evening:  '🪙 Kripto Sinyalleri (19:00)',
  night:    '🪙 Kripto Sinyalleri (01:00)',
  intraday: '🪙 Kripto Sinyalleri (intraday)',
};

async function runCryptoPhase(phase, options = {}) {
  try {
    logger.info(`⏰ Crypto signals (${phase}) başlatıldı`);
    const result = await cryptoSignalsService.runAndStore(phase);

    const spotCount  = result.spot_long?.signals?.length || 0;
    const longCount  = result.futures_long?.signals?.length || 0;
    const shortCount = result.futures_short?.signals?.length || 0;

    socketService.broadcastSignal({
      strategy: 'crypto_signals', phase,
      generatedAt: result.generatedAt,
      spotCount, longCount, shortCount,
      stockSymbol: 'CRYPTO_DAILY',
    });

    if (!options.silent && phase !== 'intraday') {
      const longTop  = (result.futures_long?.signals  || []).slice(0, 3).map(s => s.symbol).join(', ');
      const shortTop = (result.futures_short?.signals || []).slice(0, 3).map(s => s.symbol).join(', ');
      const spotTop  = (result.spot_long?.signals     || []).slice(0, 3).map(s => s.symbol).join(', ');
      const title = CRYPTO_PHASE_TITLE[phase] || '🪙 Kripto Sinyalleri';
      const body =
        `Al sinyali: ${longTop || spotTop || '—'}` +
        (shortTop ? ` · Düşüş bölgesi: ${shortTop}` : '');
      try {
        await pushNotificationService.broadcastNotification({
          title, body,
          path: '/gunluk-tespitler?tab=kripto',
          topic: 'all',
        });
      } catch (e) {
        logger.error(`[CryptoSignals] FCM push hata (${phase}): ${e.message}`);
      }
    }

    logger.info(`✅ Crypto signals (${phase}) tamamlandı — Spot: ${spotCount}, Long: ${longCount}, Short: ${shortCount}`);

    // Kripto bot: yeni snapshot'ı sanal portföye ingest et (long + short)
    try {
      const ingestResult = await cryptoBotEngine.ingestSnapshot({ ...result, phase });
      logger.info(
        `🪙🤖 Kripto bot ingest (${phase}) — logged: ${ingestResult.logged}, opened: ${ingestResult.opened}, skipped: ${ingestResult.skipped}`
      );
    } catch (botErr) {
      logger.error(`[KriptoBot] ingest (${phase}) hata: ${botErr.message}`, botErr.stack);
    }

    return result;
  } catch (e) {
    logger.error(`Crypto signals (${phase}) hata: ${e.message}`, e.stack);
    return null;
  }
}

// Kripto/altın 15-dk sinyal kadansı — 7/24 her 15 dk üretir (piyasa kapanmaz).
//   4 sabit saatte (09:00/13:00/19:00/01:00) push'lu faz, diğer turlar sessiz
//   intraday. Tek iş + kilit → eski 4 ayrı push job'u ile intraday'in aynı
//   anda çalışıp çift tarama yapması da ortadan kalkar.
const CRYPTO_PUSH_SLOTS = {
  [9 * 60]:  'morning',  // 09:00
  [13 * 60]: 'midday',   // 13:00
  [19 * 60]: 'evening',  // 19:00
  [1 * 60]:  'night',    // 01:00
};
async function runCryptoSignalCadence() {
  const now = Date.now();
  if (_cryptoCadenceLockAt && now - _cryptoCadenceLockAt < CADENCE_STALE_MS) {
    logger.info('⏭️ Kripto sinyal turu hâlâ çalışıyor — bu 15 dk tetiği atlandı');
    return null;
  }
  _cryptoCadenceLockAt = now;
  try {
    const slotPhase = CRYPTO_PUSH_SLOTS[trMinutesNow()];
    if (slotPhase) return await runCryptoPhase(slotPhase);          // push'lu faz
    return await runCryptoPhase('intraday', { silent: true });      // sessiz tazeleme, bot ingest eder
  } finally {
    _cryptoCadenceLockAt = 0;
  }
}

// Kripto bot tick — açık pozisyonların TP/SL/trailing kontrolü (7/24)
async function runCryptoBotTick() {
  try {
    const result = await cryptoBotEngine.tick();
    if (result?.closed || result?.trailed) {
      logger.info(
        `🪙🤖 Kripto bot tick — checked: ${result.checked}, trailed: ${result.trailed}, closed: ${result.closed}`
      );
    }
    return result;
  } catch (e) {
    logger.error(`[KriptoBot] tick hata: ${e.message}`, e.stack);
    return null;
  }
}

// ── Forex/Parite gün-içi sinyal kadansı — HER DAKİKA ──────────────────────
//    10 enstrüman (5 kripto + altın + gümüş + EURUSD + Nasdaq + S&P500) Yahoo
//    1m/5m/15m ile taranır, gün-içi long/short + lot/risk planı (10k$, 1:100,
//    günlük %5 / toplam %10) üretilir. Telegram push'u kendi cooldown'ını
//    (enstrüman+yön başına 30 dk) uygular → her dk çağrılması spam yapmaz.
//    Piyasası kapalı (mum bayat) enstrümanda sinyal üretilmez.
async function runForexSignalCadence() {
  const now = Date.now();
  if (_forexCadenceLockAt && now - _forexCadenceLockAt < FOREX_STALE_MS) {
    return null; // önceki tur hâlâ çalışıyor — bu dk tetiği atla
  }
  _forexCadenceLockAt = now;
  try {
    const snap = await forexEngine.generate();      // varsayılan 10k$ portföy
    const sigs = snap?.signals || [];
    // Socket.IO canlı bilgi
    try {
      socketService.broadcastSignal({
        strategy: 'forex', generatedAt: snap?.generatedAt,
        total: snap?.counts?.signal || 0,
        long: snap?.counts?.long || 0, short: snap?.counts?.short || 0,
        stockSymbol: 'FOREX',
      });
    } catch (_) { /* socket yoksa sessiz */ }
    // Telegram ana kanal + uygulama-içi (hsnkrkl19@gmail.com) push (cooldown içeride)
    const pushed = await forexPushNotifier.evaluateAndPush(sigs);
    if (pushed?.telegram || pushed?.app) {
      logger.info(`💱 Forex turu — ${sigs.length} sinyal · Telegram ${pushed.telegram} · App ${pushed.app}`);
    }
    // Açık sinyallerin kapanış/teyit kontrolü (TP1/STOP/SÜRE → aynı NO ile teyit)
    try {
      const closures = await forexSignalTracker.checkClosures();
      if (closures.length) await forexPushNotifier.pushClosures(closures);
    } catch (clErr) { logger.error(`Forex kapanış kontrol hata: ${clErr.message}`); }
    return snap;
  } catch (e) {
    logger.error(`Forex sinyal turu hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _forexCadenceLockAt = 0;
  }
}

// ── Forex backtest — geçmiş başarı oranı (günde 1, ağır) ──────────────────
let _forexBacktestRunning = false;
async function runForexBacktest() {
  if (_forexBacktestRunning) return null;
  _forexBacktestRunning = true;
  try {
    const t0 = Date.now();
    const r = await forexBacktest.runAll();
    logger.info(`💱📊 Forex backtest tamam — ${r.done}/${r.total} (enstrüman×TF) · ${Date.now() - t0}ms`);
    return r;
  } catch (e) {
    logger.error(`Forex backtest hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _forexBacktestRunning = false;
  }
}

// ── Multi-Timeframe (1h/4h/1d/1w) signal scanner ──────────────────────────
async function runMTFPhase(tf, options = {}) {
  try {
    logger.info(`⏰ MTF (${tf}) tarama başlatıldı`);
    const result = await multiTimeframeService.runAndStore(tf);

    const longCount  = result.scanner?.long?.signals?.length  || 0;
    const shortCount = result.scanner?.short?.signals?.length || 0;
    const analyzed   = result.scanner?.analyzedCount || 0;

    socketService.broadcastSignal({
      strategy: 'crypto_mtf', timeframe: tf,
      generatedAt: result.generatedAt,
      longCount, shortCount, analyzed,
      stockSymbol: 'CRYPTO_MTF',
    });

    // Push: confluence değişimlerini izle — sadece STRONG'a yeni geçiş /
    //   yön flip durumlarında bildirim. mtfPushNotifier cooldown + confidence
    //   eşiklerini içerde uygular (per (coin, verdict) 30 dk cooldown).
    if (!options.silent && (tf === '4h' || tf === '1d' || tf === '1w')) {
      try {
        const date = require('./mtfSnapshotStore').dateKey();
        const snap = require('./mtfSnapshotStore').read(date);
        const all = snap?.confluence?.all || snap?.confluence?.top || [];
        if (all.length > 0) {
          const notifier = require('./mtfPushNotifier');
          await notifier.evaluateAndPush(all);
        }
      } catch (e) {
        logger.error(`[MTF] FCM push hata (${tf}): ${e.message}`);
      }
    }

    logger.info(`✅ MTF (${tf}) tamamlandı — Long: ${longCount}, Short: ${shortCount}, Analyzed: ${analyzed}`);
    return result;
  } catch (e) {
    logger.error(`MTF (${tf}) hata: ${e.message}`, e.stack);
    return null;
  }
}

// Confidence summary update — son N tarih için backtest çalıştırır, bucket'ları birikimli günceller.
// Disk cache'i (data/confidence_summary.json) sinyal enrichment'ı için kullanılır.
// Yavaş bir iştir: BIST100 + Top100 kripto × N tarih. Düşük yoğunluklu saatte (haftada 1) çalışır.
async function runConfidenceUpdate(opts = {}) {
  try {
    logger.info('🧪 Confidence summary update başladı...');
    const t0 = Date.now();
    const result = await signalConfidenceService.updateSummary({
      days: opts.days ?? 3,                 // 3 farklı asOfDate
      gap: opts.gap ?? 7,                   // arası 7 gün
      horizonBist: opts.horizonBist ?? 5,
      horizonCrypto: opts.horizonCrypto ?? 7,
      ...opts,
    });
    const ms = Date.now() - t0;
    const totals = Object.fromEntries(
      Object.entries(result.buckets || {}).map(([k, v]) => [k, Object.values(v).reduce((s, b) => s + (b.sampleSize || 0), 0)])
    );
    logger.info(`✅ Confidence update tamam (${ms}ms). Toplam örneklemler: ${JSON.stringify(totals)}`);
    return result;
  } catch (e) {
    logger.error(`[Confidence] update hata: ${e.message}`, e.stack);
    return null;
  }
}

class CronJobsService {
  constructor() {
    this.jobs = [];
  }

  /**
   * Start all cron jobs
   */
  start() {
    logger.info('🕐 Starting cron jobs...');

    // 1. Update current prices every 5 minutes (market hours)
    const priceUpdateJob = cron.schedule(
      process.env.MARKET_DATA_CRON || '*/5 * * * *',
      async () => {
        try {
          logger.info('⏰ Running price update job for ALL stocks...');
          await bulkDataUpdater.updateCurrentPrices();
        } catch (error) {
          logger.error('Price update job failed:', error);
        }
      },
      { scheduled: false }
    );

    // 2. Calculate indicators every hour for ALL stocks
    const indicatorJob = cron.schedule(
      process.env.CALCULATION_CRON || '0 * * * *',
      async () => {
        try {
          logger.info('⏰ Running indicator calculation for ALL stocks...');
          await bulkDataUpdater.calculateIndicatorsForAll();
        } catch (error) {
          logger.error('Indicator calculation failed:', error);
        }
      },
      { scheduled: false }
    );

    // 3. Full data update daily at 7 PM (after market close)
    const dailyUpdateJob = cron.schedule(
      '0 19 * * *', // 7 PM every day
      async () => {
        try {
          logger.info('⏰ Running daily full update for ALL stocks...');
          await bulkDataUpdater.updateAllStocks();
        } catch (error) {
          logger.error('Daily update job failed:', error);
        }
      },
      { scheduled: false }
    );

    // 4. Run signal detection daily at 8 PM
    const signalDetectionJob = cron.schedule(
      '0 20 * * *', // 8 PM every day
      async () => {
        try {
          logger.info('⏰ Running signal detection for ALL stocks...');
          await signalDetectionService.detectSignalsForAll();
        } catch (error) {
          logger.error('Signal detection failed:', error);
        }
      },
      { scheduled: false }
    );

    // 5. Update KAP news every 15 minutes
    const kapUpdateJob = cron.schedule(
      '*/15 * * * *', // Every 15 minutes
      async () => {
        try {
          logger.info('⏰ Updating KAP news...');
          await kapService.updateKAPNews();
        } catch (error) {
          logger.error('KAP update failed:', error);
        }
      },
      { scheduled: false }
    );

    // 6. Update active signals every hour
    const signalUpdateJob = cron.schedule(
      '30 * * * *', // Every hour at :30
      async () => {
        try {
          logger.info('⏰ Updating active signals...');
          await signalDetectionService.updateActiveSignals();
        } catch (error) {
          logger.error('Signal update failed:', error);
        }
      },
      { scheduled: false }
    );

    // 7. BIST sinyal kadansı — işlem saatlerinde (09:45–18:30, Pzt-Cuma) HER 15 DK.
    //    Faz içeride seçilir: günün ilki premarket (push), 11:00+ ilk tur revision
    //    (push), aradakiler intraday (sessiz). Her turda bot snapshot'ı ingest eder.
    //    Tetik her 15 dk gelir; isBistOpen() pencere/hafta sonu/tatil dışını eler.
    const bistSignalJob = cron.schedule(
      '*/15 * * * *',
      () => runBistSignalCadence(),
      { scheduled: false, ...TR_TZ }
    );

    // 10. Kripto/altın sinyal kadansı — 7/24 HER 15 DK (piyasa kapanmaz).
    //     4 sabit saatte (09:00/13:00/19:00/01:00) push'lu faz, diğer turlar
    //     sessiz intraday. Her turda kripto botu snapshot'ı ingest eder (long+short).
    const cryptoSignalJob = cron.schedule(
      '*/15 * * * *',
      () => runCryptoSignalCadence(),
      { scheduled: false, ...TR_TZ }
    );

    // 14b. Forex/Parite gün-içi sinyal kadansı — HER DAKİKA, 7/24. 10 enstrüman
    //      taranır; piyasası kapalı olanlar (mum bayat) elenir. Telegram push'u
    //      kendi cooldown'ını uygular (enstrüman+yön başına 30 dk).
    const forexSignalJob = cron.schedule(
      '* * * * *',
      () => runForexSignalCadence(),
      { scheduled: false, ...TR_TZ }
    );

    // 14c. Forex backtest — geçmiş başarı oranı, günde 1 kez 03:35 TR (ağır).
    //      Açılıştan ~90 sn sonra bir kez de tetiklenir (ilk veri dolsun).
    const forexBacktestJob = cron.schedule(
      '35 3 * * *',
      () => runForexBacktest(),
      { scheduled: false, ...TR_TZ }
    );
    setTimeout(() => runForexBacktest(), 90 * 1000);

    // 15. MTF 1m — her dakika (top 10 coin scalping). Sessiz; Socket.IO push.
    //     30 sn klines cache + her dk tarama → ortalama 30 sn data tazeliği.
    const mtf1mJob = cron.schedule(
      '* * * * *',
      () => runMTFPhase('1m', { silent: true }),
      { scheduled: false, ...TR_TZ }
    );

    // 16. MTF 5m — her 5 dakika (top 10). Sessiz; Socket.IO push.
    const mtf5mJob = cron.schedule(
      '*/5 * * * *',
      () => runMTFPhase('5m', { silent: true }),
      { scheduled: false, ...TR_TZ }
    );

    // 17. MTF 15m — her 15 dakika (top 10). Sessiz; Socket.IO push.
    const mtf15mJob = cron.schedule(
      '*/15 * * * *',
      () => runMTFPhase('15m', { silent: true }),
      { scheduled: false, ...TR_TZ }
    );

    // 18. MTF 1h — her saat :05'te (top 20). Sessiz; Socket.IO push.
    const mtfHourlyJob = cron.schedule(
      '5 * * * *',
      () => runMTFPhase('1h', { silent: true }),
      { scheduled: false, ...TR_TZ }
    );

    // 19. MTF 4h — 4 saat aralıkla :10'da (top 20). STRONG confluence push'lu.
    const mtf4hJob = cron.schedule(
      '10 0,4,8,12,16,20 * * *',
      () => runMTFPhase('4h'),
      { scheduled: false, ...TR_TZ }
    );

    // 20. MTF 1d — günde bir, 00:30'da (top 30). STRONG confluence push'lu.
    const mtfDailyJob = cron.schedule(
      '30 0 * * *',
      () => runMTFPhase('1d'),
      { scheduled: false, ...TR_TZ }
    );

    // 21. MTF 1w — Pazartesi 01:00'da (top 30). STRONG confluence push'lu.
    const mtfWeeklyJob = cron.schedule(
      '0 1 * * 1',
      () => runMTFPhase('1w'),
      { scheduled: false, ...TR_TZ }
    );

    // 22. Borsa açılış bildirimi — 09:45 (BIST seans başlangıcı). Pzt-Cuma.
    //     Resmi tatil günlerinde fonksiyon kendi içinde atlatır.
    const marketOpenJob = cron.schedule(
      '45 9 * * 1-5',
      () => runMarketOpen(),
      { scheduled: false, ...TR_TZ }
    );

    // 23. Borsa kapanış bildirimi — 18:30 (BIST seans sonu). Pzt-Cuma.
    //     Resmi tatil günlerinde fonksiyon kendi içinde atlatır.
    const marketCloseJob = cron.schedule(
      '30 18 * * 1-5',
      () => runMarketClose(),
      { scheduled: false, ...TR_TZ }
    );

    // 24. Ekonomik takvim erken uyarısı — her gün 18:30. Yarınki yüksek-etkili
    //     (importance:'high') TR/US olayları varsa broadcast; yoksa sessiz.
    const calendarWarningJob = cron.schedule(
      '30 18 * * *',
      () => runCalendarWarning(),
      { scheduled: false, ...TR_TZ }
    );

    // 25. Confidence summary update — Pazar 03:00 TR. Son 3 tarih için backtest
    //     çalıştırır, BIST + Kripto sinyalleri için historicalWinRate bucket'larını
    //     birikimli günceller. Yavaş iş; piyasalar kapalıyken çalışır.
    const confidenceUpdateJob = cron.schedule(
      '0 3 * * 0',
      () => runConfidenceUpdate(),
      { scheduled: false, ...TR_TZ }
    );

    // 26. Trading Bot v6 tick — BIST açık saatlerinde (09:45–18:30) her 5 dk bir.
    //     Açık pozisyonların TP/SL/trailing kontrolü; pending pozisyonların
    //     triggerZone'a değiş kontrolü; pozisyon kapanışlarında portföy update.
    //     runBotTick() içindeki isBistOpen() kapısı kesin pencereyi uygular.
    const botTickJob = cron.schedule(
      '*/5 9-18 * * 1-5',
      () => runBotTick(),
      { scheduled: false, ...TR_TZ }
    );

    // 27. TEMA34 Bot — BIST kapanışından sonra günlük tarama. 18:30 TR, Pzt-Cuma.
    //     Tüm BIST taranır: günlük kapanışı TEMA34 üzerine çıkan alınır, altına
    //     inen satılır. Resmi tatil günlerinde fonksiyon kendi içinde atlatır.
    const tema34BotJob = cron.schedule(
      '30 18 * * 1-5',
      () => runTema34Bot(),
      { scheduled: false, ...TR_TZ }
    );

    // 28. Kripto Bot tick — her 15 dk, 7/24 (kripto piyasası kapanmaz).
    //     Açık long/short pozisyonların TP/SL/timeout/trailing kontrolü.
    const cryptoBotTickJob = cron.schedule(
      '*/15 * * * *',
      () => runCryptoBotTick(),
      { scheduled: false, ...TR_TZ }
    );

    // 29. Custom (kullanıcı-tanımlı) botlar — günlük strateji taraması. BIST
    //     kapanışından sonra (18:40 TR, TEMA34'ten sonra), Pzt-Cuma. Her aktif
    //     botun stratejisi evreninde koşar; tatil günlerinde fonksiyon sessizdir.
    const customBotDailyJob = cron.schedule(
      '40 18 * * 1-5',
      () => runCustomBotsDaily(),
      { scheduled: false, ...TR_TZ }
    );

    // 30. Custom botlar tick — BIST açık saatlerinde her 5 dk. Açık pozisyonların
    //     SL/TP/trailing/timeout kontrolü. runCustomBotsTick() içindeki isBistOpen()
    //     kapısı kesin pencereyi uygular.
    const customBotTickJob = cron.schedule(
      '*/5 9-18 * * 1-5',
      () => runCustomBotsTick(),
      { scheduled: false, ...TR_TZ }
    );

    // Start jobs only during market hours (9 AM - 6 PM, Monday-Friday)
    const marketHoursJob = cron.schedule(
      '* 9-18 * * 1-5', // Mon-Fri, 9 AM - 6 PM
      () => {
        if (!priceUpdateJob.running) {
          priceUpdateJob.start();
          logger.info('📈 Market hours: Price update job started');
        }
      },
      { scheduled: false }
    );

    // Stop price updates after market hours
    const afterHoursJob = cron.schedule(
      '0 18 * * 1-5', // 6 PM Mon-Fri
      () => {
        if (priceUpdateJob.running) {
          priceUpdateJob.stop();
          logger.info('📉 After hours: Price update job stopped');
        }
      },
      { scheduled: false }
    );

    // Borsapy makro warmup + TCMB PPK takvim uyarısı — günde 1 kez (sabah 08:30)
    const borsapyWarmupJob = cron.schedule(
      '30 8 * * *',
      async () => {
        try {
          const svc = require('./borsapyDataService');
          // Cache'i ısıt — UI hızlı açılsın (politika faizi canlı fetch'i dahil)
          const [, , , policyRes] = await Promise.allSettled([
            svc.getBondYields(),
            svc.getBankRates('USD'),
            svc.getBankRates('EUR'),
            svc.getTcmbPolicyRate(),
          ]);
          // Politika faizi teyit edilemediyse (canlı kaynak çöktü + yeni PPK geçti) uyar
          const policy = policyRes?.status === 'fulfilled' ? policyRes.value : null;
          if (policy?.stale) {
            logger.warn(`[Borsapy] ⚠️  Politika faizi teyit edilemedi (stale). Son toplantı: ${policy.asOfDate}, gösterilen: %${policy.policyRate}. Canlı kaynak + POLICY_BASELINE'ı kontrol edin: borsapyDataService.getTcmbPolicyRate()`);
          }
          if (!policy?.nextMeeting) {
            logger.warn('[Borsapy] ⚠️  PPK takvimi tükendi — borsapyDataService.PPK_MEETINGS listesine yeni dönem tarihlerini ekleyin.');
          }
          logger.info(`[Borsapy] Günlük makro cache warmup tamamlandı (faiz: %${policy?.policyRate ?? '?'}, kaynak: ${policy?.source ?? '?'})`);
        } catch (error) {
          logger.error('[Borsapy] Warmup job failed:', error.message);
        }
      },
      { scheduled: false }
    );

    // Borsapy makro warmup hemen başlat
    borsapyWarmupJob.start();

    // Store jobs
    this.jobs = [
      priceUpdateJob,
      indicatorJob,
      borsapyWarmupJob,
      dailyUpdateJob,
      signalDetectionJob,
      kapUpdateJob,
      signalUpdateJob,
      bistSignalJob,
      cryptoSignalJob,
      forexSignalJob,
      forexBacktestJob,
      mtf1mJob,
      mtf5mJob,
      mtf15mJob,
      mtfHourlyJob,
      mtf4hJob,
      mtfDailyJob,
      mtfWeeklyJob,
      marketOpenJob,
      marketCloseJob,
      calendarWarningJob,
      confidenceUpdateJob,
      botTickJob,
      tema34BotJob,
      cryptoBotTickJob,
      customBotDailyJob,
      customBotTickJob,
      marketHoursJob,
      afterHoursJob
    ];

    // Start all jobs
    this.jobs.forEach(job => job.start());
    
    logger.info(`✅ ${this.jobs.length} cron jobs started`);
  }

  /**
   * Stop all cron jobs
   */
  stop() {
    this.jobs.forEach(job => job.stop());
    logger.info('⏹️ All cron jobs stopped');
  }

  /**
   * Get job status
   */
  getStatus() {
    return {
      total: this.jobs.length,
      running: this.jobs.filter(job => job.running).length
    };
  }

  /**
   * Manuel tetikleme — admin paneli ve test için
   */
  async triggerDailyPhase(phase) {
    return runDailyPhase(phase, { silent: true });
  }

  /**
   * Manuel tetikleme — kripto sinyalleri (test + ilk önbellek için)
   */
  async triggerCryptoPhase(phase) {
    const valid = ['morning', 'midday', 'evening', 'night', 'intraday'];
    const safe = valid.includes(phase) ? phase : 'intraday';
    return runCryptoPhase(safe, { silent: true });
  }

  /**
   * Manuel tetikleme — forex/parite gün-içi sinyalleri (test + ilk önbellek)
   */
  async triggerForexCadence() {
    return runForexSignalCadence();
  }

  /**
   * Manuel tetikleme — MTF taraması (1m | 5m | 15m | 1h | 4h | 1d | 1w)
   */
  async triggerMTFPhase(tf) {
    const valid = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];
    const safe = valid.includes(tf) ? tf : '4h';
    return runMTFPhase(safe, { silent: true });
  }

  /**
   * Manuel tetikleme — confidence summary update (admin / test için)
   */
  async triggerConfidenceUpdate(opts = {}) {
    return runConfidenceUpdate(opts);
  }

  /**
   * Manuel tetikleme — broadcast bildirimleri (admin paneli + test).
   * type: 'market-open' | 'market-close' | 'calendar-warning'
   * Tatil/boş-takvim filtreleri normal cron'la aynı şekilde uygulanır.
   */
  async triggerNotification(type) {
    switch (type) {
      case 'market-open':       return runMarketOpen();
      case 'market-close':      return runMarketClose();
      case 'calendar-warning':  return runCalendarWarning();
      default:
        throw new Error(`Bilinmeyen bildirim tipi: ${type}`);
    }
  }
}

module.exports = new CronJobsService();
