/**
 * Market Routes - Dynamic for ALL stocks
 * Any BIST stock can be queried
 */

const express = require('express');
const router = express.Router();
const marketController = require('../controllers/market.controller');
const cryptoSignalsService = require('../services/cryptoSignalsService');
const cryptoSnapshotStore = require('../services/cryptoSnapshotStore');
const cronJobsService = require('../services/cronJobs');
const { authenticate } = require('../middleware/auth');

// Public routes (no auth needed)
router.get('/bist100', marketController.getBist100);
router.get('/macro', marketController.getMacroSnapshot);
router.get('/sectors', marketController.getSectorPerformance);
router.get('/stocks', marketController.getAllStocks);
router.get('/stocks/search', marketController.searchStocks);

// Stock-specific routes (dynamic symbol parameter)
router.get('/stock/:symbol', marketController.getStockDetail);
router.get('/stock/:symbol/historical', marketController.getHistoricalData);
router.get('/stock/:symbol/indicators', marketController.getIndicators);
router.get('/stock/:symbol/analysis', marketController.getStockAnalysis);

// Signals and scans
router.get('/signals', marketController.getDailySignals);
router.get('/scans/:type', marketController.getScans);
router.get('/harmonics', marketController.getHarmonicPatterns);
router.get('/fibonacci', marketController.getFibonacciReversals);

// Performance
router.get('/algorithm-performance', marketController.getAlgorithmPerformance);

// Crypto signals — top 100 coin için spot/futures sinyalleri
router.get('/crypto/signals', async (req, res) => {
  try {
    const date = cryptoSnapshotStore.dateKey();
    const snap = cryptoSnapshotStore.read(date);
    if (!snap) {
      const result = await cronJobsService.triggerCryptoPhase('intraday');
      if (!result) {
        return res.status(503).json({
          success: false,
          error: 'Kripto sinyalleri henüz hazır değil — birkaç dakika sonra tekrar deneyin',
        });
      }
      return res.json({ success: true, ...result, source: 'fresh' });
    }
    const phaseData = cryptoSnapshotStore.getCurrentPhase(snap);
    res.json({
      success: true,
      date: snap.date,
      ...phaseData,
      availablePhases: ['morning', 'midday', 'evening', 'night']
        .filter(p => snap[p]).reduce((m, p) => { m[p] = snap[p].generatedAt; return m; }, {}),
      intradayCount: snap.intraday?.length || 0,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/crypto/signals/history', (req, res) => {
  try {
    const { date } = req.query;
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, error: 'Geçersiz tarih formatı (YYYY-MM-DD)' });
      }
      const data = cryptoSnapshotStore.read(date);
      if (!data) return res.status(404).json({ success: false, error: 'Bu tarihte kayıt yok' });
      return res.json({ success: true, ...data });
    }
    const limit = Math.min(parseInt(req.query.days || '30', 10), 90);
    const dates = cryptoSnapshotStore.listAvailableDates(limit);
    res.json({ success: true, dates });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/crypto/coin/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ success: false, error: 'Sembol zorunlu' });
    const result = await cryptoSignalsService.analyzeSingleCoin(symbol);
    if (!result) {
      return res.status(404).json({ success: false, error: `${symbol} top 100'de yok ya da Binance USDT paritesinde değil` });
    }
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Batch operations
router.post('/batch-quotes', marketController.getBatchQuotes);

// Protected routes (require authentication)
router.use(authenticate);
router.get('/watchlist', marketController.getWatchlist);

module.exports = router;
