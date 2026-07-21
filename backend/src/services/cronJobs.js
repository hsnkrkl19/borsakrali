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
// YENİ ROBOT — derin konfluans sinyal sistemi (forex'ten BAĞIMSIZ, paralel)
const proEngine = require('./proSignals/proEngine');
const proBacktest = require('./proSignals/proBacktest');
const proSelfTest = require('./proSignals/proSelfTest');
const proPushNotifier = require('./proSignals/proPushNotifier');
const proSignalTracker = require('./proSignals/proSignalTracker');
const proStatsStore = require('./proSignals/proStatsStore');
// ALTIN — çoklu zaman dilimi altın botu (top-down: haftalık yön → alt-TF sinyaller)
const altinEngine = require('./altin/altinEngine');
const altinTracker = require('./altin/altinTracker');
const altinNotifier = require('./altin/altinNotifier');
const altinBacktest = require('./altin/altinBacktest');
// ICT/FVG — 4h yön + 1h yapı + 15m FVG + kapanmış 5m teyidi; yalnız paper yürütme.
const ictFvgService = require('./ictFvg/ictFvgService');
const ictSmcService = require('./ictSmc/ictSmcService');
const mt5Bots = require('./mt5Bots');
const customBotRunner = require('./botBuilder/customBotRunner');
const botDailyReport = require('./botDailyReport');
const ictFvgTracker = require('./ictFvg/ictFvgTracker');
const ictFvgNotifier = require('./ictFvg/ictFvgNotifier');
// BEAST TREND — Zero-Lag + Ichimoku + Scalper Beast füzyonu (altın/gümüş/BTC/ETH)
const beastEngine = require('./beast/beastEngine');
const beastNotifier = require('./beast/beastNotifier');
const bistScoreEngine = require('./bistSignals/bistScoreEngine');
const bistSignalNotifier = require('./bistSignals/bistSignalNotifier');
const bistSignalTracker = require('./bistSignals/bistSignalTracker');
const bistBacktest = require('./bistSignals/bistBacktest');
const multiTimeframeService = require('./multiTimeframeService');
const signalConfidenceService = require('./signalConfidenceService');
const socketService = require('./socketService');
const pushNotificationService = require('./pushNotificationService');
const economicCalendarService = require('./economicCalendarService');
// FTMO/ABD yüksek-etkili haber uyarıları — 24s/1s/30dk kala Telegram kanalına
const newsWarningService = require('./newsWarning/newsWarningService');
const botEngine = require('./tradingBotV2/botEngine');
const cryptoBotEngine = require('./cryptoBotV2/cryptoBotEngine');
const tema34Engine = require('./tema34Bot/tema34Engine');
const crossoverNotifier = require('./crossover/crossoverNotifier');
const tema34ScannerNotifier = require('./tema34Scanner/tema34ScannerNotifier');
const bistAlScannerNotifier = require('./bistAlScanner/bistAlScannerNotifier');
// MT5 GÜN-İÇİ tarayıcı — 9 enstrüman × 5 TF, her dk; gün-içi + risk bütçeli
const mt5Engine = require('./mt5Scanner/mt5Engine');
const mt5Tracker = require('./mt5Scanner/mt5Tracker');
const mt5Notifier = require('./mt5Scanner/mt5Notifier');
const waveScanEngine = require('./waveScan/waveScanEngine');
const waveScanNotifier = require('./waveScan/waveScanNotifier');
const waveScanTracker = require('./waveScan/waveScanTracker');
const cryptoChannelNotifier = require('./cryptoChannelNotifier');
const cryptoSignalTracker = require('./cryptoSignalTracker');
const signalDelivery = require('./signalDelivery');
const customBotEngine = require('./customBots/customBotEngine');
const customBotRegistry = require('./customBots/customBotRegistry');
const competitionManager = require('./botCompetition/competitionManager');
const logger = require('../utils/logger');

// ⚠️ FOREX-ONLY MODE: kullanıcı isteğiyle forex DIŞINDAKİ tüm sinyal/bot sistemleri
// (BIST, kripto, MTF, dalga, beast, altın, yeni-robot, crossover, trading/crypto/tema34/
// custom botlar) DEVRE DIŞI. Geri açmak için Render'da FOREX_ONLY_MODE'u kaldır/0 yap.
function forexOnly() { return process.env.FOREX_ONLY_MODE === '1'; }

function raceFeedEnabled(botId) {
  try { return competitionManager.runtimeEnabled(botId); }
  catch (_) { return false; }
}

function raceObserve(botId, snapshot, meta) {
  try { return competitionManager.observeSnapshot(botId, snapshot, meta); }
  catch (error) {
    logger.warn(`[BotYarisi] ${botId} gözlem atlandı: ${error.message}`);
    return null;
  }
}

function raceClose(botId, events, meta) {
  try { return competitionManager.recordClosures(botId, events, meta); }
  catch (error) {
    logger.warn(`[BotYarisi] ${botId} kapanış kaydı atlandı: ${error.message}`);
    return null;
  }
}

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
let _bistFullSignalLockAt = 0;
let _cryptoCadenceLockAt = 0;
// Forex turu her dk çalışır → daha kısa bayatlama penceresi (üst üste binmesin).
const FOREX_STALE_MS = 90 * 1000;
let _forexCadenceLockAt = 0;
// MT5 gün-içi tarayıcı da her dk → aynı kısa bayatlama penceresi.
const MT5_STALE_MS = 90 * 1000;
let _mt5CadenceLockAt = 0;
// Yeni Robot turu her 3 dk → 150 sn bayatlama penceresi (üst üste binmesin).
const PRO_STALE_MS = 150 * 1000;
let _proCadenceLockAt = 0;
let _proBacktestRunning = false;
let _proSelfTestRunning = false;
// Altın turu (çoklu-TF, tüm zaman dilimleri çekilir → daha uzun pencere)
const ALTIN_STALE_MS = 4 * 60 * 1000;
let _altinCadenceLockAt = 0;

const ICT_FVG_STALE_MS = 4 * 60 * 1000;
let _ictFvgCadenceLockAt = 0;
const ICT_SMC_STALE_MS = 4 * 60 * 1000;
let _ictSmcCadenceLockAt = 0;
const CUSTOM_BOT_STALE_MS = 4 * 60 * 1000;
let _customBotCadenceLockAt = 0;
let _altinBacktestRunning = false;
let _altinPrevBiasDir = null;
// BEAST turu her 5 dk → 240 sn bayatlama penceresi.
const BEAST_STALE_MS = 240 * 1000;
let _beastCadenceLockAt = 0;

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

// FTMO/ABD yüksek-etkili haber uyarısı kadansı — her dakika. Yaklaşan her haber
// için 24 saat / 1 saat / 30 dk kala tam bir kez Telegram uyarısı (kalıcı dedup).
// Boş tick'lerde sessiz; yalnız gönderim olunca log atar. FOREX_ONLY'den MUAF.
async function runNewsWarning() {
  try {
    return await newsWarningService.runCadence();
  } catch (e) {
    logger.error(`[NewsWarning] hata: ${e.message}`, e.stack);
    return null;
  }
}

// Daily signal cron'u sadece bir kere üretsin diye (manuel + cron çakışması olmasın)
async function runDailyPhase(phase, options = {}) {
  if (forexOnly()) return null;
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
  if (forexOnly()) return null;
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

// ── BIST "≥75 LONG" tam-evren sinyal kadansı — işlem saatlerinde her 15 dk ──
//    TÜM BIST (510) tüm tekniklerle 0-100 puanlanır; LONG + güven ≥ eşik (75)
//    olanlardan top N (10) numaralı sinyal olur → Telegram ana kanal + TÜM
//    kullanıcılara uygulama-içi yayın. Açık sinyallerin TP/SL kapanışı da
//    kontrol edilir (aynı NO ile teyit). isBistOpen() pencere dışını eler.
async function runBistFullSignalCadence() {
  if (forexOnly() && !raceFeedEnabled('bist-signals')) return null;
  const now = Date.now();
  if (_bistFullSignalLockAt && now - _bistFullSignalLockAt < CADENCE_STALE_MS) {
    logger.info('⏭️ BIST ≥75 sinyal turu hâlâ çalışıyor — bu tetik atlandı');
    return null;
  }
  if (!isBistOpen()) return null;

  _bistFullSignalLockAt = now;
  try {
    const snap = await bistScoreEngine.scan({ force: true });
    const top = (snap && snap.top) || [];
    raceObserve('bist-signals', { ...snap, signals: top });
    let pushed = { telegram: 0, app: 0 };
    try {
      pushed = await Promise.race([
        bistSignalNotifier.evaluateAndPush(top),
        new Promise((_, r) => setTimeout(() => r(new Error('bist-evalpush-timeout-45s')), 45000)),
      ]);
    } catch (pe) {
      logger.error(`BIST ≥75 sinyal push hata: ${pe.message}`);
    }
    // evaluateAndPush ARTIK portföy yolu: ≥75 adayları risk-bazlı AL + açık
    // pozisyonları yönet (SAT/STOP/TP). Kapanış yönetimi + yarış-kaydı içeride
    // (manageAndReport → competition 'bist-signals'). Ayrı checkClosures gerekmez.
    logger.info(`📈 BIST ≥${bistScoreEngine.MIN_CONFIDENCE} portföy — ${snap.qualified} uygun · top ${top.length} · AL ${pushed?.considered || 0} · kapanan ${pushed?.closed || 0} · TG ${pushed?.telegram || 0} · App ${pushed?.app || 0}`);
    return snap;
  } catch (e) {
    logger.error(`BIST ≥75 tam sinyal turu hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _bistFullSignalLockAt = 0;
  }
}

// Trading bot tick — açık pozisyonların TP/SL/trailing kontrolü.
// Sadece BIST açıkken (09:45–18:30, hafta içi, tatil değil) çalışır.
async function runBotTick() {
  if (forexOnly()) return null;
  try {
    if (!isBistOpen()) return null;
    const result = await botEngine.tick();
    if (result?.closed || result?.trailed || result?.triggered) {
      logger.info(
        `🤖 Bot tick — checked: ${result.checked}, triggered: ${result.triggered}, trailed: ${result.trailed}, closed: ${result.closed}`
      );
    }
    // BIST ≥75 portföyünü gün içinde ~5 dk'da yönet — YALNIZ STOP/TP/timeout/trailing
    // (taze tarama yok → strateji SAT değerlendirilmez; held-only, tutulmayana asla).
    try {
      await bistSignalNotifier.tickManage();
    } catch (e) {
      logger.error(`BIST ≥75 portföy tick hata: ${e.message}`);
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
  if (forexOnly()) return null;
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

// EMA34 & TEMA34 günlük "ilk kırılım" bildirimcisi — BIST kapanışından sonra
// tüm BIST'i tarar; yukarı (cross_above) ve düşüşte (cross_below) ilk kırılımları
// Telegram ana kanal + uygulama/web push (broadcast) ile gönderir. TR resmi
// tatil günlerinde sessiz (yeni günlük mum oluşmaz). Idempotluk içeride
// (lastCandleDate) → aynı işlem günü tekrar bildirilmez.
async function runCrossoverAlerts() {
  if (forexOnly() && !raceFeedEnabled('crossover')) return null;
  try {
    const dateKey = todayKeyTR();
    if (TR_HOLIDAYS_2026.has(dateKey)) {
      logger.info(`⏭️ Crossover bildirim: ${dateKey} resmi tatil — tarama atlandı`);
      return null;
    }
    logger.info('⏰ EMA34/TEMA34 kırılım taraması başlatıldı');
    const result = await crossoverNotifier.runAndNotify();
    if (!result?.ok) {
      logger.error(`[Crossover] tarama başarısız: ${result?.error || 'bilinmeyen hata'}`);
    } else if (result.skippedReason) {
      logger.info(`📐 Crossover — atlandı (${result.skippedReason}), taranan ${result.scanned}, kırılım ${result.total}`);
    } else {
      logger.info(
        `📐 Crossover — taranan ${result.scanned}, TEMA ↑${result.counts.temaUp}/↓${result.counts.temaDown}, ` +
        `EMA ↑${result.counts.emaUp}/↓${result.counts.emaDown}, bildirildi: ${result.notified}`
      );
    }
    return result;
  } catch (e) {
    logger.error(`[Crossover] hata: ${e.message}`, e.stack);
    return null;
  }
}

// TEMA34 Tarama bildirimcisi — tüm BIST'i çok-zaman-dilimli (4h + 1d) tarar; her
// TF için YALNIZ "yeni giren" (cross_above) ve "sat bölgesine yeni geçen"
// (cross_below) hisseleri AYRI Telegram kanalına gönderir (TELEGRAM_TEMA34_CHANNEL).
// ⚠️ Kullanıcının açık isteğiyle eklenen bu bot FOREX_ONLY_MODE freeze'inden
// MUAFTIR (forexOnly() kapısı YOK) → forex-only modda bile kendi kanalına yayın
// yapar. Kanal env'i yoksa sessiz. TR resmi tatilinde sessiz. Idempotluk TF-bazlı.
async function runTema34Scanner() {
  try {
    const dateKey = todayKeyTR();
    if (TR_HOLIDAYS_2026.has(dateKey)) {
      logger.info(`⏭️ TEMA34 tarama: ${dateKey} resmi tatil — tarama atlandı`);
      return null;
    }
    logger.info('⏰ TEMA34 taraması başlatıldı (4h + 1d)');
    const result = await tema34ScannerNotifier.runAndNotify();
    if (!result?.ok) {
      logger.error(`[TEMA34Scanner] tarama başarısız: ${result?.error || 'bilinmeyen hata'}`);
    } else {
      const parts = Object.values(result.timeframes || {}).map((t) =>
        `${t.tf}: ${t.skippedReason ? `atlandı(${t.skippedReason})` : `🟢${t.counts?.up ?? 0}/🔴${t.counts?.down ?? 0}`}`
      );
      logger.info(`📊 TEMA34 tarama — ${parts.join(' · ')} · bildirildi: ${result.notified}`);
    }
    return result;
  } catch (e) {
    logger.error(`[TEMA34Scanner] hata: ${e.message}`, e.stack);
    return null;
  }
}

// ── BIST "≥80 kaliteli AL" tam-evren tarama → AYRI yeni Telegram kanalı ──────
// Tüm BIST taranır (bistScoreEngine yeniden kullanılır — 15 dk cache'li, mükerrer
// Yahoo yükü yok); güven ≥80 + fiyat EMA34 üstü + hacim teyidi geçen top 5 AL
// sinyali YENİ kanala (TELEGRAM_BIST_AL_CHANNEL) gönderilir. ⚠️ Kullanıcının açık
// isteğiyle eklenen bu yeni bot FOREX_ONLY_MODE freeze'inden MUAFTIR (forexOnly()
// kapısı YOK) → forex-only modda bile kendi kanalına yayın yapar. Kanal env'i
// ayarlı değilse içeride sessiz. İşlem saatleri dışında/tatil/hafta sonu eler.
// Günlük dedup (aynı hisse günde 1 kez) bildirimcinin içindedir.
async function runBistAlScanner() {
  try {
    if (!isBistOpen()) return null;   // yalnız işlem saatlerinde (tatil/hafta sonu dahil eler)
    logger.info('⏰ BIST AL taraması başlatıldı');
    // runAndNotify ARTIK portföy yolu: nitelikli adayları risk-bazlı AL + açık
    // pozisyonları yönet (SAT/STOP/TP — yalnız listOpen()). Kapanış yönetimi
    // içeride (manageAndReport) → ayrı checkAndPushClosures gerekmez.
    const result = await bistAlScannerNotifier.runAndNotify();
    if (!result?.ok) {
      logger.error(`[BistAlScanner] tarama başarısız: ${result?.error || 'bilinmeyen hata'}`);
    } else {
      logger.info(`📈 BIST AL portföy — taranan ${result.scanned}, nitelikli ${result.qualified}, AL ${result.opened}, kapanan ${result.closed}, TG ${result.telegramSent}`);
    }
    // Portföy-seviyesi uyarı (drawdown eşiği / yeni-alım kesici) — gün-bazlı dedup
    try { await require('./bistPortfolio/alPortfolioBot').checkAlerts(); }
    catch (e) { logger.error(`[BistAlPortfolio] uyarı kontrolü hata: ${e.message}`); }
    // ≥75 portföyü de uyarı üretsin (kendi kanalına; forexOnly'de dormant olsa da
    // açık pozisyonu varsa drawdown/halt bildirimi gelmeli).
    try { await require('./bistPortfolio/signalPortfolioBot').checkAlerts(); }
    catch (e) { logger.error(`[BistSignalPortfolio] uyarı kontrolü hata: ${e.message}`); }
    return result;
  } catch (e) {
    logger.error(`[BistAlScanner] hata: ${e.message}`, e.stack);
    return null;
  }
}

// GÜNLÜK KÂR/ZARAR RAPORU — BIST kapanışından sonra (18:45 TR), TEMA34 tarama
// (@tema34sinyal) ve BIST AL (@borsasinyal34) kanallarına açık pozisyonların
// bugünkü kâr/zararı + o gün kapananların sonucunu özetler (kullanıcı isteği:
// "AL sinyallerinin sonucunu HER GÜN ver"). Her notifier kendi kanalına gönderir;
// kanal yok / kill-switch / gün-bazlı dedup fonksiyon içindedir. FOREX_ONLY_MODE'dan
// MUAF (bu iki bot zaten muaf). TR resmi tatilinde sessiz.
async function runDailyPnlReports() {
  try {
    const dateKey = todayKeyTR();
    if (TR_HOLIDAYS_2026.has(dateKey)) {
      logger.info(`⏭️ Günlük K/Z raporu: ${dateKey} resmi tatil — atlandı`);
      return null;
    }
    logger.info('⏰ Günlük kâr/zarar raporu (TEMA34 + BIST AL)');
    const out = {};
    try { out.tema34 = await tema34ScannerNotifier.pushDailyReport(); }
    catch (e) { logger.error(`[TEMA34Scanner] günlük rapor hata: ${e.message}`); }
    try { out.bistAl = await bistAlScannerNotifier.pushDailyReport(); }
    catch (e) { logger.error(`[BistAlScanner] günlük rapor hata: ${e.message}`); }
    try { out.bistSignal = await bistSignalNotifier.pushDailySummary(); }
    catch (e) { logger.error(`[BistSignal] günlük portföy özeti hata: ${e.message}`); }
    return out;
  } catch (e) {
    logger.error(`[GünlükRapor] hata: ${e.message}`);
    return null;
  }
}

// ── Kullanıcı-tanımlı (custom) botlar ──────────────────────────────────────
// Günlük tarama — BIST kapanışından sonra her aktif botun stratejisini evreninde
// koşturur (giriş/çıkış sinyalleri). TR resmi tatilinde sessiz. Botlar sırayla
// işlenir (Yahoo veri çekimini boğmamak için).
async function runCustomBotsDaily() {
  if (forexOnly()) return null;
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
  if (forexOnly()) return null;
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
  if (forexOnly() && !raceFeedEnabled('crypto-signals')) return null;
  try {
    logger.info(`⏰ Crypto signals (${phase}) başlatıldı`);
    const result = await cryptoSignalsService.runAndStore(phase);
    raceObserve('crypto-signals', result, { strategy: `crypto-${phase}` });

    const spotCount  = result.spot_long?.signals?.length || 0;
    const longCount  = result.futures_long?.signals?.length || 0;
    const shortCount = result.futures_short?.signals?.length || 0;

    socketService.broadcastSignal({
      strategy: 'crypto_signals', phase,
      generatedAt: result.generatedAt,
      spotCount, longCount, shortCount,
      stockSymbol: 'CRYPTO_DAILY',
    });

    if (signalDelivery.channelOnly()) {
      // SÜREKLİ yayın (faz YOK): her turda yeni bulunanları kanala (dedup tracker)
      // + açık sinyallerin TP/SL kapanış teyidi. Kullanıcı: "fazlarla değil sürekli".
      try {
        const r = await cryptoChannelNotifier.evaluateAndPush(result);
        const closures = await cryptoSignalTracker.checkClosures();
        raceClose('crypto-signals', closures);
        if (closures.length) await cryptoChannelNotifier.pushClosures(closures);
        if (r?.newCount || closures.length) logger.info(`🪙 Kripto kanal turu — yeni ${r?.newCount || 0} · kapanış ${closures.length}`);
      } catch (e) { logger.error(`[CryptoSignals] sürekli kanal gönderim hata: ${e.message}`); }
    } else if (!options.silent && phase !== 'intraday') {
      // Legacy (kanal kapalıyken): 4 fazda FCM broadcast
      const title = CRYPTO_PHASE_TITLE[phase] || '🪙 Kripto Sinyalleri';
      const longTop  = (result.futures_long?.signals  || []).slice(0, 3).map(s => s.symbol).join(', ');
      const shortTop = (result.futures_short?.signals || []).slice(0, 3).map(s => s.symbol).join(', ');
      const spotTop  = (result.spot_long?.signals     || []).slice(0, 3).map(s => s.symbol).join(', ');
      const body = `Al sinyali: ${longTop || spotTop || '—'}` + (shortTop ? ` · Düşüş bölgesi: ${shortTop}` : '');
      try {
        await pushNotificationService.broadcastNotification({ title, body, path: '/gunluk-tespitler?tab=kripto', topic: 'all' });
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
  if (forexOnly()) return null;
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
    raceObserve('forex-signals', snap);
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
    // evaluateAndPush'u cron seviyesinde de zaman aşımına bağla (asla dondurmasın)
    let pushed = { telegram: 0, app: 0 };
    try {
      pushed = await Promise.race([
        forexPushNotifier.evaluateAndPush(sigs),
        new Promise((_, r) => setTimeout(() => r(new Error('evalpush-timeout-45s')), 45000)),
      ]);
    } catch (pe) {
      logger.error(`Forex push hata: ${pe.message}`);
    }
    if (pushed?.telegram) {
      logger.info(`💱 Forex turu — ${sigs.length} sinyal · TG ${pushed.telegram} (yeni ${pushed.considered})`);
    }
    // Açık sinyallerin kapanış/teyit kontrolü (TP1/STOP/İZ-SÜREN/SÜRE → aynı NO ile teyit)
    try {
      const closures = await forexSignalTracker.checkClosures();
      raceClose('forex-signals', closures);
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

// ── MT5 GÜN-İÇİ tarayıcı kadansı — HER DAKİKA, 7/24 ───────────────────────
//    9 enstrüman (BTC/ETH/XRP/SOL + Altın + Gümüş + EURUSD + Nasdaq + S&P500,
//    hepsi forex/CFD fiyatı) × 5 TF (5m/15m/1h/4h/1d). Tüm tarayıcı teknikleri
//    + TEMA34 → 0-100 güven; LOT (broker adımlı) + MUTLAK SL/TP + risk bütçesi
//    (günlük %5 / toplam %10 — bütçeyi aşacak işlem VERİLMEZ). Gün-içi kural:
//    23:00'ten sonra yeni işlem yok, açık pozisyonlar 23:45'te gün sonu kapanışı.
//    ⚠️ Kullanıcının açık isteğiyle eklenen bu bot FOREX_ONLY_MODE freeze'inden
//    MUAFTIR (forexOnly() kapısı YOK). Kill-switch: MT5_SCANNER_DISABLED=1.
async function runMt5Scanner() {
  if (process.env.MT5_SCANNER_DISABLED === '1') return null;
  const now = Date.now();
  if (_mt5CadenceLockAt && now - _mt5CadenceLockAt < MT5_STALE_MS) {
    return null; // önceki tur hâlâ çalışıyor — bu dk tetiği atla
  }
  _mt5CadenceLockAt = now;
  try {
    const snap = await mt5Engine.generate();       // kalıcı portföy ayarı (vars. 10k$)
    raceObserve('mt5-scanner', snap);
    // Telegram kanal + uygulama-içi (hsnkrkl19@gmail.com) push — 45 sn tavan
    let pushed = { telegram: 0, app: 0, opened: 0 };
    try {
      pushed = await Promise.race([
        mt5Notifier.evaluateAndPush(snap),
        new Promise((_, r) => setTimeout(() => r(new Error('mt5push-timeout-45s')), 45000)),
      ]);
    } catch (pe) {
      logger.error(`MT5 tarayıcı push hata: ${pe.message}`);
    }
    if (pushed?.opened) {
      logger.info(`⚡ MT5 gün-içi turu — ${snap?.counts?.signal || 0} sinyal · açılan ${pushed.opened} · TG ${pushed.telegram} · app ${pushed.app}`);
    }
    // Açık pozisyonların kapanış kontrolü (TP1/SL/GÜN SONU → aynı NO ile teyit)
    try {
      const closures = await mt5Tracker.checkClosures();
      raceClose('mt5-scanner', closures);
      if (closures.length) await mt5Notifier.pushClosures(closures);
    } catch (clErr) { logger.error(`MT5 kapanış kontrol hata: ${clErr.message}`); }
    return snap;
  } catch (e) {
    logger.error(`MT5 tarayıcı turu hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _mt5CadenceLockAt = 0;
  }
}

// ── MT5 GÜN-İÇİ günlük rapor — her gün 23:50 TR (gün sonu kapanışlarından sonra) ──
async function runMt5DailyReport() {
  if (process.env.MT5_SCANNER_DISABLED === '1') return null;
  try {
    const r = await mt5Notifier.pushDailyReport();
    logger.info(`⚡📊 MT5 gün-içi rapor turu — TG ${r?.telegram || 0}`);
    return r;
  } catch (e) {
    logger.error(`MT5 rapor hata: ${e.message}`, e.stack);
    return null;
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

// ── BIST sinyal kalibrasyon backtest'i — global ince-kova geçmişi (günde 1, ağır) ──
let _bistBacktestRunning = false;
async function runBistBacktest() {
  if (forexOnly()) return null;
  if (_bistBacktestRunning) return null;
  _bistBacktestRunning = true;
  try {
    const t0 = Date.now();
    const r = await bistBacktest.runAll();
    logger.info(`🇹🇷📊 BIST kalibrasyon backtest tamam — ${r.scanned} sembol · ${r.closedSignals} kapalı sinyal · ${r.buckets} kova · ${r.engine} · ${Date.now() - t0}ms`);
    return r;
  } catch (e) {
    logger.error(`BIST kalibrasyon backtest hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _bistBacktestRunning = false;
  }
}

// ── Forex GÜNLÜK RAPOR — her gün 20:00 (TP/SL/iz-süren sayıları → kanal) ──────
async function runForexStats() {
  try {
    const r = await forexPushNotifier.pushStats();
    logger.info(`💱📊 Forex günlük rapor turu — TG ${r?.telegram || 0}`);
    return r;
  } catch (e) {
    logger.error(`Forex rapor hata: ${e.message}`, e.stack);
    return null;
  }
}

// ── YENİ ROBOT — derin konfluans sinyal kadansı (her 3 dk) ────────────────
//    4 enstrüman (BTC / Ons Altın / S&P500 / EUR-USD) × 4 TF (15m/1h/4h/1d).
//    TÜM teknikler (17-koşul + EMA34/TEMA34 + SNR + SMC + Elliott + Harmonik +
//    mum + uyumsuzluk + momentum ivmesi + ta4j) → 0-100 güven. ≥3/4 TF konfluans
//    + R/R≥1.6 + backtest kalite kapısı. Sinyaller "🤖 YENİ ROBOT" markalı.
async function runProSignalCadence() {
  if (forexOnly() && !raceFeedEnabled('pro-robot')) return null;
  const now = Date.now();
  if (_proCadenceLockAt && now - _proCadenceLockAt < PRO_STALE_MS) return null;
  _proCadenceLockAt = now;
  try {
    const snap = await proEngine.generate();
    const sigs = snap?.signals || [];
    raceObserve('pro-robot', snap);
    try {
      socketService.broadcastSignal({
        strategy: 'pro-signals', generatedAt: snap?.generatedAt,
        total: snap?.counts?.signal || 0,
        long: snap?.counts?.long || 0, short: snap?.counts?.short || 0,
        stockSymbol: 'YENI_ROBOT',
      });
    } catch (_) { /* socket yoksa sessiz */ }
    let pushed = { telegram: 0 };
    try {
      pushed = await Promise.race([
        proPushNotifier.evaluateAndPush(sigs),
        new Promise((_, r) => setTimeout(() => r(new Error('pro-evalpush-timeout-45s')), 45000)),
      ]);
    } catch (pe) { logger.error(`Yeni Robot push hata: ${pe.message}`); }
    if (pushed?.telegram) {
      logger.info(`🤖 Yeni Robot turu — ${sigs.length} sinyal · TG ${pushed.telegram}`);
    }
    try {
      const mgmt = await proSignalTracker.manageOpenPositions();
      if (mgmt.length) await proPushNotifier.pushManagementUpdates(mgmt);
    } catch (mErr) { logger.error(`Yeni Robot yönetim hata: ${mErr.message}`); }
    try {
      const closures = await proSignalTracker.checkClosures();
      raceClose('pro-robot', closures);
      if (closures.length) await proPushNotifier.pushClosures(closures);
    } catch (clErr) { logger.error(`Yeni Robot kapanış kontrol hata: ${clErr.message}`); }
    return snap;
  } catch (e) {
    logger.error(`Yeni Robot sinyal turu hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _proCadenceLockAt = 0;
  }
}

// ── YENİ ROBOT backtest — geçmiş başarı (günde 1, ağır) ───────────────────
async function runProBacktest() {
  if (forexOnly()) return null;
  if (_proBacktestRunning) return null;
  _proBacktestRunning = true;
  try {
    const t0 = Date.now();
    const r = await proBacktest.runAll();
    logger.info(`🤖📊 Yeni Robot backtest tamam — ${r?.done ?? '?'}/${r?.total ?? '?'} · ${Date.now() - t0}ms`);
    return r;
  } catch (e) {
    logger.error(`Yeni Robot backtest hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _proBacktestRunning = false;
  }
}

// ── YENİ ROBOT self-test — canlı vs backtest → sınırlı ağırlık/eşik ayarı ──
async function runProSelfTest() {
  if (forexOnly()) return null;
  if (_proSelfTestRunning) return null;
  _proSelfTestRunning = true;
  try {
    const r = await proSelfTest.run();
    logger.info(`🤖🔧 Yeni Robot self-test — ${r?.skipped ? 'atlandı:' + r.skipped : (r?.applied ? 'uygulandı' : 'kuru-çalışma')} · değişiklik ${r?.changes?.length || 0}`);
    return r;
  } catch (e) {
    logger.error(`Yeni Robot self-test hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _proSelfTestRunning = false;
  }
}

// ── YENİ ROBOT istatistik — günde 2 kez (parite başarı oranı, kanala) ─────
async function runProStats() {
  if (forexOnly()) return null;
  try {
    const r = await proPushNotifier.pushStats();
    logger.info(`🤖📊 Yeni Robot istatistik turu — TG ${r?.telegram || 0}`);
    return r;
  } catch (e) {
    logger.error(`Yeni Robot istatistik hata: ${e.message}`, e.stack);
    return null;
  }
}

// ── BEAST TREND — Zero-Lag + Ichimoku + Scalper Beast füzyonu ──────────────
//     SADECE altın/gümüş/BTC/ETH × 1h/4h/1d (aktif hücreler). Her 5 dk, 7/24
//     (metaller hafta sonu otomatik bayat → yeni sinyal yok). Push VARSAYILAN
//     KAPALI (BEAST_PUSH_DISABLED!=='0') — kullanıcı canlı doğrulayana kadar.
async function runBeastSignalCadence() {
  if (forexOnly() && !raceFeedEnabled('beast-signals')) return null;
  const now = Date.now();
  if (_beastCadenceLockAt && now - _beastCadenceLockAt < BEAST_STALE_MS) return null;
  _beastCadenceLockAt = now;
  try {
    const snap = await beastEngine.generate();
    const sigs = snap?.signals || [];
    raceObserve('beast-signals', snap);
    let pushed = { pushed: 0 };
    try {
      pushed = await Promise.race([
        beastNotifier.evaluateAndPush(sigs),
        new Promise((_, r) => setTimeout(() => r(new Error('beast-evalpush-timeout-45s')), 45000)),
      ]);
    } catch (pe) { logger.error(`BEAST push hata: ${pe.message}`); }
    try {
      await beastNotifier.pushClosures();
    } catch (clErr) { logger.error(`BEAST kapanış kontrol hata: ${clErr.message}`); }
    if (pushed?.pushed) logger.info(`🔱 BEAST turu — ${sigs.length} sinyal · TG ${pushed.pushed}`);
    return snap;
  } catch (e) {
    logger.error(`BEAST sinyal turu hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _beastCadenceLockAt = 0;
  }
}

// ── ALTIN — çoklu-TF altın botu kadansı (her 15 dk) ───────────────────────
//    Top-down: haftalık YÖN → 1g/8h/4h/1h sinyaller + 15m/5m/1m fırsat katmanı.
//    Destek/direnç + fraktal kırılımı. "🥇 ALTIN" markalı. Veri cache'li
//    (1g/1h 6-12s, gün-içi 30dk) → 15 dk turu Yahoo'yu yormaz.
async function runAltinCadence() {
  if (forexOnly() && !raceFeedEnabled('gold-signals')) return null;
  const now = Date.now();
  if (_altinCadenceLockAt && now - _altinCadenceLockAt < ALTIN_STALE_MS) return null;
  _altinCadenceLockAt = now;
  try {
    const snap = await altinEngine.generate();
    raceObserve('gold-signals', snap);
    try {
      socketService.broadcastSignal({
        strategy: 'altin', generatedAt: snap?.generatedAt,
        total: snap?.counts?.signals || 0, long: snap?.counts?.long || 0, short: snap?.counts?.short || 0,
        stockSymbol: 'ALTIN',
      });
    } catch (_) { /* socket yoksa sessiz */ }
    // Yeni sinyaller → pozisyon aç + push (notifier tracker.ingest çağırır)
    let pushed = { telegram: 0 };
    try {
      pushed = await Promise.race([
        altinNotifier.evaluateAndPush(snap),
        new Promise((_, r) => setTimeout(() => r(new Error('altin-evalpush-timeout-45s')), 45000)),
      ]);
    } catch (pe) { logger.error(`Altın push hata: ${pe.message}`); }
    if (pushed?.telegram) logger.info(`🥇 Altın turu — ${snap?.counts?.signals || 0} sinyal · TG ${pushed.telegram}`);
    // Açık pozisyon yönetimi (TP/SL/trailing/expire) → kapanış push
    try {
      const closures = await altinTracker.manageOpen();
      raceClose('gold-signals', closures);
      if (closures && closures.length) await altinNotifier.pushClosures(closures);
    } catch (cErr) { logger.error(`Altın yönetim hata: ${cErr.message}`); }
    // (Standalone S/R kırılım bildirimi KALDIRILDI — kullanıcı isteği: destek/direnç
    //  yalnız gerçek sinyalde, giriş/TP/SL'den sonra yazılır. "trend lehte/aleyhte" spam yok.)
    // Haftalık yön değişimi bildirimi
    try {
      const dir = snap?.bias?.dir;
      if (dir && _altinPrevBiasDir && dir !== _altinPrevBiasDir) await altinNotifier.pushBiasChange(_altinPrevBiasDir, snap.bias);
      if (dir) _altinPrevBiasDir = dir;
    } catch (_) {}
    return snap;
  } catch (e) {
    logger.error(`Altın sinyal turu hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _altinCadenceLockAt = 0;
  }
}

// ── ALTIN backtest — TF başına geçmiş başarı (günde 1, ağır: 26y günlük) ───
// ICT/FVG: 4h yön + 1h yapı + 15m bölge + kapanmış 5m teyidi.
// Gerçek emir yolu yoktur. Telegram kill-switch'i paper takibini durdurmaz.
async function runIctFvgCadence() {
  const now = Date.now();
  if (_ictFvgCadenceLockAt && now - _ictFvgCadenceLockAt < ICT_FVG_STALE_MS) return null;
  _ictFvgCadenceLockAt = now;
  try {
    const allClosures = [];

    // Yeni sinyal motoru dursa bile mevcut paper pozisyonların kapanışını izle.
    try {
      const closures = await ictFvgTracker.checkClosures();
      if (closures.length) {
        allClosures.push(...closures);
        raceClose('ict-fvg', closures);
        await ictFvgNotifier.pushClosures(closures);
      }
    } catch (error) {
      logger.error(`ICT/FVG kapanış kontrol hata: ${error.message}`);
    }

    const engineDisabled = process.env.ICT_FVG_DISABLED === '1';
    const frozenByScope = forexOnly() && !raceFeedEnabled('ict-fvg');
    if (engineDisabled || frozenByScope) {
      return { ok: true, disabled: engineDisabled, frozenByScope, signals: [], closures: allClosures };
    }

    const snap = await ictFvgService.generate();
    const tracked = await ictFvgTracker.syncSignals(snap?.signals || []);

    // Ters sinyal kapanışı yeni yön açılmadan önce aynı kimlikle işlenir.
    if (tracked.closures.length) {
      allClosures.push(...tracked.closures);
      raceClose('ict-fvg', tracked.closures);
      await ictFvgNotifier.pushClosures(tracked.closures);
    }
    if (tracked.opened.length) {
      raceObserve('ict-fvg', { signals: tracked.opened }, { source: 'ict-fvg-paper' });
      await ictFvgNotifier.pushOpenings(tracked.opened);
    }

    try {
      socketService.broadcastSignal({
        strategy: 'ict-fvg',
        generatedAt: snap?.generatedAt,
        total: tracked.opened.length,
        long: tracked.opened.filter((row) => row.direction === 'long').length,
        short: tracked.opened.filter((row) => row.direction === 'short').length,
        stockSymbol: 'ICT_FVG',
      });
    } catch (_) { /* socket yoksa sessiz */ }

    if (tracked.opened.length || allClosures.length) {
      logger.info(`ICT/FVG paper turu — açılan ${tracked.opened.length} · kapanan ${allClosures.length}`);
    }
    return { ...snap, tracking: tracked, closures: allClosures };
  } catch (error) {
    logger.error(`ICT/FVG sinyal turu hata: ${error.message}`, error.stack);
    return null;
  } finally {
    _ictFvgCadenceLockAt = 0;
  }
}

// ICT/SMC Çoklu Strateji paper botu — ICT_SMC_Indicator.pine portu (22 strateji).
// Gerçek emir yolu yoktur; botCompetition observeSnapshot kendi paper takibini
// yapar (prices ile SL/TP kapanışı + yeni sinyal açılışı). Her tur fiyat besler,
// böylece motor donuk olsa da açık pozisyonlar SL/TP'de kapanır.
async function runIctSmcCadence() {
  const now = Date.now();
  if (_ictSmcCadenceLockAt && now - _ictSmcCadenceLockAt < ICT_SMC_STALE_MS) return null;
  _ictSmcCadenceLockAt = now;
  try {
    const engineDisabled = process.env.ICT_SMC_DISABLED === '1';
    const frozenByScope = forexOnly() && !raceFeedEnabled('ict-smc');
    const snap = await ictSmcService.generate();
    if (engineDisabled || frozenByScope) {
      // Motor donuk: yalnız fiyat besle (açık paper pozisyonların kapanışı sürsün).
      raceObserve('ict-smc', { prices: snap && snap.prices, signals: [] }, { source: 'ict-smc-paper' });
      return { ok: true, disabled: engineDisabled, frozenByScope, signals: [] };
    }
    raceObserve('ict-smc', snap, { source: 'ict-smc-paper' });
    if (snap.signals.length) {
      logger.info(`ICT/SMC paper turu — sinyal ${snap.signals.length} (long ${snap.summary.long} / short ${snap.summary.short})`);
    }
    return snap;
  } catch (error) {
    logger.error(`ICT/SMC sinyal turu hata: ${error.message}`);
    return null;
  } finally {
    _ictSmcCadenceLockAt = 0;
  }
}

// MT5 BOT AİLESİ (4 preset) — YALNIZ FTMO/MT5'te işlem gören 15 enstrüman
// (4 kripto + 2 metal + 2 endeks + 7 parite). Her preset AYRI yarışmacı bottur;
// açık pozisyonları köprü feed'ine girer → MT5'te gerçek emir (her biri kendi
// magic'i ile). Yüksek TF + R:R≥1.5 + kapalı bar + stabil signalId.
let _mt5BotsCadenceLockAt = 0;
async function runMt5BotsCadence() {
  const now = Date.now();
  if (_mt5BotsCadenceLockAt && now - _mt5BotsCadenceLockAt < 4 * 60 * 1000) return null;
  _mt5BotsCadenceLockAt = now;
  const out = [];
  try {
    const engineDisabled = process.env.MT5_BOTS_DISABLED === '1';
    for (const preset of mt5Bots.PRESETS) {
      try {
        const snap = await mt5Bots.generate(preset.id);
        if (engineDisabled) {
          // Motor donuk: yalnız fiyat besle (açık paper pozisyonlar SL/TP'de kapansın).
          raceObserve(preset.id, { prices: snap && snap.prices, signals: [] }, { source: 'mt5-bots' });
        } else {
          raceObserve(preset.id, snap, { source: 'mt5-bots' });
          if (snap.signals.length) {
            logger.info(`${preset.name}: ${snap.signals.length} sinyal (long ${snap.summary.long} / short ${snap.summary.short})`);
          }
        }
        out.push({ id: preset.id, signals: snap.signals.length });
      } catch (error) {
        logger.error(`MT5 bot ${preset.id} turu hata: ${error.message}`);
      }
    }
    return out;
  } finally {
    _mt5BotsCadenceLockAt = 0;
  }
}

// Kullanıcının panelden oluşturduğu özel botlar (16., 17. ...). Kendi indikatör
// setleriyle sinyal üretir, kağıt takip eder; açık pozisyonlar köprü feed'ine
// girer → MT5'te gerçek emir. FOREX_ONLY'den bağımsız (kullanıcı botları).
async function runCustomBotCadence() {
  const now = Date.now();
  if (_customBotCadenceLockAt && now - _customBotCadenceLockAt < CUSTOM_BOT_STALE_MS) return null;
  _customBotCadenceLockAt = now;
  try {
    const r = await customBotRunner.run();
    if (r && (r.opened || r.closed)) {
      logger.info(`Özel bot turu — açılan ${r.opened} · kapanan ${r.closed} · açık ${r.openCount}`);
    }
    return r;
  } catch (error) {
    logger.error(`Özel bot turu hata: ${error.message}`);
    return null;
  } finally {
    _customBotCadenceLockAt = 0;
  }
}

async function runAltinBacktest() {
  if (forexOnly()) return null;
  if (_altinBacktestRunning) return null;
  _altinBacktestRunning = true;
  try {
    const t0 = Date.now();
    const r = await altinBacktest.runAll();
    logger.info(`🥇📊 Altın backtest tamam — ${Date.now() - t0}ms`);
    return r;
  } catch (e) {
    logger.error(`Altın backtest hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _altinBacktestRunning = false;
  }
}

// ── Dalga Taraması (Elliott + SNR + Mum + Fraktal) — BTC + Altın, 1d/4h ─────
//     Forex'ten BAĞIMSIZ, nadir, yalnız Telegram kanalı. Sayıma dahil değil.
let _waveScanRunning = false;
async function runWaveScan() {
  if (forexOnly() && !raceFeedEnabled('wave-scan')) return null;
  if (_waveScanRunning) return null;
  _waveScanRunning = true;
  try {
    const signals = await waveScanEngine.scan();
    raceObserve('wave-scan', signals);
    let pushed = { telegram: 0, newCount: 0 };
    try {
      pushed = await Promise.race([
        waveScanNotifier.evaluateAndPush(signals),
        new Promise((_, r) => setTimeout(() => r(new Error('wave-push-timeout-45s')), 45000)),
      ]);
    } catch (pe) { logger.error(`Dalga taraması push hata: ${pe.message}`); }
    if (pushed?.newCount) logger.info(`🌊 Dalga taraması — ${signals.length} kurulum · ${pushed.newCount} yeni · TG ${pushed.telegram}`);
    try {
      const closures = await waveScanTracker.checkClosures();
      raceClose('wave-scan', closures);
      if (closures.length) await waveScanNotifier.pushClosures(closures);
    } catch (clErr) { logger.error(`Dalga kapanış kontrol hata: ${clErr.message}`); }
    return signals;
  } catch (e) {
    logger.error(`Dalga taraması hata: ${e.message}`, e.stack);
    return null;
  } finally {
    _waveScanRunning = false;
  }
}

// ── Multi-Timeframe (1h/4h/1d/1w) signal scanner ──────────────────────────
async function runMTFPhase(tf, options = {}) {
  if (forexOnly() && !raceFeedEnabled('mtf-confluence')) return null;
  try {
    logger.info(`⏰ MTF (${tf}) tarama başlatıldı`);
    const result = await multiTimeframeService.runAndStore(tf);

    const longCount  = result.scanner?.long?.signals?.length  || 0;
    const shortCount = result.scanner?.short?.signals?.length || 0;
    const analyzed   = result.scanner?.analyzedCount || 0;

    if (!options.silent && (tf === '4h' || tf === '1d' || tf === '1w')) {
      const actionable = [
        ...(result.scanner?.long?.signals || []),
        ...(result.scanner?.short?.signals || []),
      ];
      raceObserve('mtf-confluence', { signals: actionable }, { timeframe: tf, strategy: 'mtf-confluence' });
    }

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

    // 7b. BIST "≥75 LONG" tam-evren sinyali — işlem saatlerinde her 15 dk, ama
    //     BIST100 kadansından kaydırılmış dakikalarda (7,22,37,52) çalışır ki
    //     Yahoo aynı anda boğulmasın. TÜM BIST (510) tüm tekniklerle 0-100
    //     puanlanır; LONG + güven ≥ eşik (75) top 10 numaralı sinyal olur →
    //     Telegram + tüm kullanıcılara yayın. TP/SL kapanışı da kontrol edilir.
    const bistFullSignalJob = cron.schedule(
      '7,22,37,52 * * * *',
      () => runBistFullSignalCadence(),
      { scheduled: false, ...TR_TZ }
    );

    // 10. Kripto/altın sinyal kadansı — 7/24 HER 15 DK (piyasa kapanmaz).
    //     Kanal-tek modda SÜREKLİ: her turda yeni bulunanlar kanala (dedup tracker)
    //     + TP/SL kapanış teyidi — faz YOK (kullanıcı isteği). Kanal kapalıyken
    //     eski 4-faz FCM davranışı. Her turda kripto botu snapshot'ı ingest eder.
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

    // 14b-2. MT5 GÜN-İÇİ tarayıcı — HER DAKİKA, 7/24 (FOREX_ONLY'den MUAF).
    //        9 enstrüman × 5 TF; push kendi risk-bütçesi + eşiğiyle sınırlı.
    const mt5ScannerJob = cron.schedule(
      '* * * * *',
      () => runMt5Scanner(),
      { scheduled: false, ...TR_TZ }
    );

    // 14b-3. MT5 GÜN-İÇİ günlük rapor — her gün 23:50 TR (gün sonu kapanışı 23:45).
    const mt5ReportJob = cron.schedule(
      '50 23 * * *',
      () => runMt5DailyReport(),
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

    // 14c-bis. BIST sinyal kalibrasyon backtest'i — günde 1 kez 04:10 TR (ağır).
    //          backtesting.py sidecar ile global ince-kova geçmişi üretir; canlı
    //          bistScoreEngine güveni bununla kalibre eder. Açılıştan ~3 dk sonra
    //          bir kez de tetiklenir (ilk geçmiş dolsun).
    const bistBacktestJob = cron.schedule(
      '10 4 * * *',
      () => runBistBacktest(),
      { scheduled: false, ...TR_TZ }
    );
    setTimeout(() => runBistBacktest(), 180 * 1000);

    // 14d. Forex GÜNLÜK RAPOR — her gün YALNIZ 20:00 TR. Kanala TP/STOP/iz-süren
    //      sayıları + başarı oranı (kullanıcı isteği).
    const forexStatsJob = cron.schedule(
      '0 20 * * *',
      () => runForexStats(),
      { scheduled: false, ...TR_TZ }
    );

    // 14f. YENİ ROBOT — derin konfluans sinyal kadansı, HER 3 DK, 7/24.
    //      4 enstrüman × 4 TF (15m/1h/4h/1d). Telegram push kendi cooldown'ını
    //      uygular (enstrüman+yön başına 30 dk). Kalite kapısı varsayılan AÇIK.
    const proSignalJob = cron.schedule(
      '*/3 * * * *',
      () => runProSignalCadence(),
      { scheduled: false, ...TR_TZ }
    );

    // 14g. YENİ ROBOT backtest — günde 1 kez 03:40 TR (forex'ten 5 dk sonra,
    //      sidecar/Yahoo çakışmasın). Açılıştan ~2 dk sonra bir kez de tetiklenir.
    const proBacktestJob = cron.schedule(
      '40 3 * * *',
      () => runProBacktest(),
      { scheduled: false, ...TR_TZ }
    );
    setTimeout(() => runProBacktest(), 120 * 1000);

    // 14h. YENİ ROBOT self-test — günde 1 kez 04:00 TR (gecelik backtest sonrası).
    //      Canlı vs backtest → sınırlı ağırlık/eşik ayarı (±0.15 / [55,80]).
    const proSelfTestJob = cron.schedule(
      '0 4 * * *',
      () => runProSelfTest(),
      { scheduled: false, ...TR_TZ }
    );

    // 14i. YENİ ROBOT istatistik — günde 2 kez 13:00 & 21:00 TR (forex'ten offset).
    const proStatsJob = cron.schedule(
      '0 13,21 * * *',
      () => runProStats(),
      { scheduled: false, ...TR_TZ }
    );

    // 14j. ALTIN — çoklu-TF altın botu kadansı, HER 15 DK, 7/24. Top-down yön +
    //      alt-TF sinyaller + S/R kırılım. Veri cache'li; "🥇 ALTIN" markalı.
    //      Açılıştan ~150 sn sonra bir kez tetiklenir (ilk anlık görüntü dolsun).
    const altinSignalJob = cron.schedule(
      '*/15 * * * *',
      () => runAltinCadence(),
      { scheduled: false, ...TR_TZ }
    );
    setTimeout(() => runAltinCadence(), 150 * 1000);

    // 14k. ALTIN backtest — günde 1 kez 04:20 TR (ağır: 26y günlük). Boot +200s.
    const altinBacktestJob = cron.schedule(
      '20 4 * * *',
      () => runAltinBacktest(),
      { scheduled: false, ...TR_TZ }
    );
    setTimeout(() => runAltinBacktest(), 200 * 1000);

    // 14j. BEAST TREND — Zero-Lag+Ichimoku+Scalper Beast füzyonu, HER 5 DK, 7/24.
    //      4 enstrüman × 1h/4h/1d (aktif hücreler). Push varsayılan KAPALI.
    // ICT/FVG paper botu — 5dk kapanışından iki dakika sonra. Motor yalnız
    // kapanmış mumları kullanır; bildirim kapalı olsa da yarış takibi sürer.
    const ictFvgJob = cron.schedule(
      '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
      () => runIctFvgCadence(),
      { scheduled: false, ...TR_TZ }
    );

    // ICT/SMC Çoklu Strateji paper botu — 5 dk'da bir (fiyat besler + sinyal açar).
    const ictSmcJob = cron.schedule(
      '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
      () => runIctSmcCadence(),
      { scheduled: false, ...TR_TZ }
    );

    // MT5 bot ailesi — 5 dk'da bir (ictSmc'den kaydırılmış dakikalarda).
    const mt5BotsJob = cron.schedule(
      '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
      () => runMt5BotsCadence(),
      { scheduled: false, ...TR_TZ }
    );

    // GÜNLÜK BOT RAPORU — her akşam 20:15 TR, tüm botların gün-içi istatistiği Telegram'a.
    const botDailyReportJob = cron.schedule(
      '15 20 * * *',
      async () => {
        try {
          const r = await botDailyReport.run();
          if (r && r.ok) logger.info(`Günlük bot raporu gönderildi — ${r.summary?.trades ?? 0} işlem, net ${r.summary?.net ?? 0}$`);
        } catch (e) { logger.error(`Günlük bot raporu hata: ${e.message}`); }
      },
      { scheduled: false, ...TR_TZ }
    );

    // Özel botlar (kullanıcı-tanımlı) — her 4 dk.
    const customBotJob = cron.schedule(
      '1,5,9,13,17,21,25,29,33,37,41,45,49,53,57 * * * *',
      () => runCustomBotCadence(),
      { scheduled: false, ...TR_TZ }
    );

    const beastSignalJob = cron.schedule(
      '*/5 * * * *',
      () => runBeastSignalCadence(),
      { scheduled: false, ...TR_TZ }
    );
    setTimeout(() => runBeastSignalCadence(), 60 * 1000); // açılıştan ~1 dk sonra ilk tur

    // 14e. Dalga Taraması (Elliott+SNR+Mum+Fraktal) — BTC + Altın, 1d/4h.
    //      Her 4 saatte bir (TR 00/04/08/12/16/20). Onaylı fraktal kullanır →
    //      tam kapanış saatine duyarlı değil. Nadir, yalnız Telegram kanalı;
    //      normal sinyal sayısına dahil DEĞİL.
    const waveScanJob = cron.schedule(
      '6 0,4,8,12,16,20 * * *',
      () => runWaveScan(),
      { scheduled: false, ...TR_TZ }
    );

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

    // 24b. FTMO/ABD yüksek-etkili haber uyarısı — HER DAKİKA. Yaklaşan her USD
    //      yüksek-etkili haberi (NFP/CPI/FOMC/Fed konuşması...) için 24 saat, 1 saat
    //      ve 30 dk kala Telegram kanalına (@borsakraliai) tam bir kez uyarı gönderir.
    //      Kaynak: statik ECONOMIC_CALENDAR_2026 + canlı Forex Factory (FTMO ile aynı).
    //      Kalıcı dedup → restart-güvenli. Kill: NEWS_WARNING_DISABLED=1.
    const newsWarningJob = cron.schedule(
      '* * * * *',
      () => runNewsWarning(),
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

    // 27b. EMA34 & TEMA34 günlük kırılım bildirimcisi — 18:50 TR, Pzt-Cuma.
    //      Tüm BIST taranır; yukarı (cross_above) + düşüşte (cross_below) ilk
    //      kırılımlar Telegram ana kanal + uygulama/web push ile gönderilir.
    //      18:30 TEMA34 botu ve 18:40 custom botlardan sonra (Yahoo'yu boğmasın).
    //      Resmi tatil + idempotluk fonksiyonun içinde uygulanır.
    const crossoverAlertJob = cron.schedule(
      '50 18 * * 1-5',
      () => runCrossoverAlerts(),
      { scheduled: false, ...TR_TZ }
    );

    // 27c. TEMA34 Tarama bildirimcisi — çok-zaman-dilimli (4h + 1d), Pzt-Cuma.
    //      Tüm BIST taranır; YALNIZ "yeni giren" (cross_above) ve "sat bölgesine
    //      yeni geçen" (cross_below) hisseler AYRI Telegram kanalına
    //      (TELEGRAM_TEMA34_CHANNEL) gönderilir. Her TF kendi barına göre ayrı
    //      dedup'lanır → SAATLİK çalışsa da yalnız ilerleyen bar gönderilir (spam yok):
    //      4h barı kırılınca beklemeden gider, 1d kapanışta bir kez. İşlem
    //      saatlerinde HER SAAT 10:00–19:00 TR (kapanış 4h ≈19:00 + günlük bar dahil).
    //      FOREX_ONLY_MODE'dan MUAF. Resmi tatil + idempotluk fonksiyon içinde.
    const tema34ScannerJob = cron.schedule(
      '0 10-19 * * 1-5',
      () => runTema34Scanner(),
      { scheduled: false, ...TR_TZ }
    );

    // 27d. BIST "kaliteli AL" taraması — işlem saatlerinde HER 15 DK (10:00–18:xx
    //      TR, Pzt-Cuma). Tüm BIST taranır; avgScore≥80 + ADX≥20 + RSI<78 +
    //      trend(EMA34) + hacim×1.3 geçen top 3 AL sinyali AYRI yeni kanala
    //      (TELEGRAM_BIST_AL_CHANNEL). FOREX_ONLY_MODE'dan MUAF. isBistOpen() +
    //      GÜNLÜK dedup (aynı hisse günde 1 kez → 15 dk'lık kadans spam yapmaz)
    //      fonksiyonun içinde uygulanır.
    const bistAlScannerJob = cron.schedule(
      '*/15 10-18 * * 1-5',
      () => runBistAlScanner(),
      { scheduled: false, ...TR_TZ }
    );

    // 27e. GÜNLÜK KÂR/ZARAR RAPORU — 18:45 TR, Pzt-Cuma (BIST kapanışından sonra).
    //      Açık AL pozisyonlarının bugünkü kâr/zararı + o gün kapananların sonucu →
    //      @tema34sinyal + @borsasinyal34. Kullanıcı isteği: "her gün sonuç ver".
    //      Kanal yok / kill-switch / gün-dedup / tatil fonksiyon içinde. FOREX_ONLY MUAF.
    const dailyPnlReportJob = cron.schedule(
      '45 18 * * 1-5',
      () => runDailyPnlReports(),
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
      bistFullSignalJob,
      cryptoSignalJob,
      forexSignalJob,
      mt5ScannerJob,
      mt5ReportJob,
      forexBacktestJob,
      bistBacktestJob,
      forexStatsJob,
      proSignalJob,
      proBacktestJob,
      proSelfTestJob,
      proStatsJob,
      altinSignalJob,
      altinBacktestJob,
      ictFvgJob,
      ictSmcJob,
      mt5BotsJob,
      customBotJob,
      botDailyReportJob,
      beastSignalJob,
      waveScanJob,
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
      newsWarningJob,
      confidenceUpdateJob,
      botTickJob,
      tema34BotJob,
      crossoverAlertJob,
      tema34ScannerJob,
      bistAlScannerJob,
      dailyPnlReportJob,
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
   * Manuel tetikleme — forex parite başarı istatistiğini şimdi paylaş (test/admin)
   */
  async triggerForexStats() {
    return runForexStats();
  }

  /**
   * Manuel tetikleme — MT5 gün-içi tarayıcı turu / günlük raporu (test/admin)
   */
  async triggerMt5Scanner() {
    return runMt5Scanner();
  }

  async triggerMt5Report() {
    return runMt5DailyReport();
  }

  /**
   * Manuel tetikleme — YENİ ROBOT (derin konfluans) sinyal turu (test/admin)
   */
  async triggerProCadence() {
    return runProSignalCadence();
  }

  /**
   * Manuel tetikleme — YENİ ROBOT backtest / self-test / istatistik (test/admin)
   */
  async triggerProBacktest() {
    return runProBacktest();
  }

  async triggerProSelfTest() {
    return runProSelfTest();
  }

  async triggerProStats() {
    return runProStats();
  }

  /**
   * Manuel tetikleme — ALTIN çoklu-TF turu / backtest (test/admin)
   */
  async triggerAltinCadence() {
    return runAltinCadence();
  }

  /** Manuel tetikleme — ICT/FVG paper sinyal ve kapanış turu. */
  async triggerIctFvgCadence() {
    return runIctFvgCadence();
  }

  async triggerAltinBacktest() {
    return runAltinBacktest();
  }

  /**
   * Manuel tetikleme — EMA34/TEMA34 kırılım taraması + bildirim (admin / test).
   * opts.force=true → aynı işlem günü tekrar bildirilse bile gönderir.
   */
  async triggerCrossoverAlerts(opts = {}) {
    return crossoverNotifier.runAndNotify(opts);
  }

  /**
   * Manuel tetikleme — YALNIZ TEMA34 taraması + ayrı kanala bildirim (admin / test).
   * opts.force=true → aynı işlem günü tekrar bildirilse bile gönderir.
   */
  async triggerTema34Scanner(opts = {}) {
    return tema34ScannerNotifier.runAndNotify(opts);
  }

  /**
   * Manuel tetikleme — BIST "≥80 kaliteli AL" taraması + ayrı yeni kanala bildirim
   * (admin / test). opts.force=true → günlük dedup atlanır (aynı hisse tekrar gider).
   */
  async triggerBistAlScanner(opts = {}) {
    return bistAlScannerNotifier.runAndNotify(opts);
  }

  /**
   * Manuel tetikleme — GÜNLÜK KÂR/ZARAR raporu (TEMA34 + BIST AL kanalları).
   * opts.force=true → gün-bazlı dedup atlanır (aynı gün tekrar gönderir).
   */
  async triggerDailyPnlReports(opts = {}) {
    const [tema34, bistAl, bistSignal] = await Promise.all([
      tema34ScannerNotifier.pushDailyReport(opts).catch((e) => ({ error: e.message })),
      bistAlScannerNotifier.pushDailyReport(opts).catch((e) => ({ error: e.message })),
      bistSignalNotifier.pushDailySummary(opts).catch((e) => ({ error: e.message })),
    ]);
    return { tema34, bistAl, bistSignal };
  }

  /**
   * Manuel tetikleme — dalga taraması (Elliott+SNR+Mum+Fraktal), BTC+Altın 1d/4h.
   */
  async triggerWaveScan() {
    return runWaveScan();
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
      case 'news-warning':      return runNewsWarning();
      default:
        throw new Error(`Bilinmeyen bildirim tipi: ${type}`);
    }
  }
}

module.exports = new CronJobsService();
