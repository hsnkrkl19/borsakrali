/**
 * Cron Jobs Service
 * Scheduled tasks for updating ALL BIST stocks dynamically
 */

const cron = require('node-cron');
const bulkDataUpdater = require('./bulkDataUpdaterService');
const signalDetectionService = require('./signalDetectionService');
const kapService = require('./kapService');
const dailySignalsService = require('./dailySignalsService');
const socketService = require('./socketService');
const pushNotificationService = require('./pushNotificationService');
const logger = require('../utils/logger');

// Türkiye saat dilimi — BIST takvimi
const TR_TZ = { timezone: 'Europe/Istanbul' };

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
      const trendTop     = (result.trend?.signals     || []).slice(0, 3).map(s => `${s.symbol}(${s.totalScore})`).join(', ');
      const reversionTop = (result.reversion?.signals || []).slice(0, 3).map(s => `${s.symbol}(${s.totalScore})`).join(', ');
      const title = phase === 'premarket'
        ? '📊 Borsa Açılış Sinyalleri (09:55)'
        : '🔄 Sinyal Revizyonu (11:00)';
      const body = phase === 'premarket'
        ? `Trend: ${trendTop || '—'} · Reversion: ${reversionTop || '—'}`
        : `Trend ${trendDiff} · Reversion ${reversionDiff} değişiklik. Trend: ${trendTop} · Rev: ${reversionTop}`;
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
    return result;
  } catch (e) {
    logger.error(`Daily signals (${phase}) hata: ${e.message}`, e.stack);
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

    // 7. Pre-market top-10 sinyal üretimi — 09:55 (BIST açılmadan 5 dk önce)
    //    Pazartesi-Cuma. Türkiye saat dilimi.
    const preMarketJob = cron.schedule(
      '55 9 * * 1-5',
      () => runDailyPhase('premarket'),
      { scheduled: false, ...TR_TZ }
    );

    // 8. Revize taraması — 11:00 (borsa açıldıktan 1 saat sonra)
    //    Pazartesi-Cuma. 09:55 snapshot ile diff alır.
    const revisionJob = cron.schedule(
      '0 11 * * 1-5',
      () => runDailyPhase('revision'),
      { scheduled: false, ...TR_TZ }
    );

    // 9. Intraday refresh — borsa saatlerinde 30 dk'da bir sessiz güncelleme
    //    Bildirim atmaz; UI canlı veri göstersin diye snapshot tazelenir.
    const intradayJob = cron.schedule(
      '15,45 10-17 * * 1-5',
      () => runDailyPhase('intraday', { silent: true }),
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

    // Store jobs
    this.jobs = [
      priceUpdateJob,
      indicatorJob,
      dailyUpdateJob,
      signalDetectionJob,
      kapUpdateJob,
      signalUpdateJob,
      preMarketJob,
      revisionJob,
      intradayJob,
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
}

module.exports = new CronJobsService();
