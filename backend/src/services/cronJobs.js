/**
 * Cron Jobs Service
 * Scheduled tasks for updating ALL BIST stocks dynamically
 */

const cron = require('node-cron');
const bulkDataUpdater = require('./bulkDataUpdaterService');
const signalDetectionService = require('./signalDetectionService');
const kapService = require('./kapService');
const logger = require('../utils/logger');

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
}

module.exports = new CronJobsService();
