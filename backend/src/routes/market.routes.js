/**
 * Market Routes - Dynamic for ALL stocks
 * Any BIST stock can be queried
 */

const express = require('express');
const router = express.Router();
const marketController = require('../controllers/market.controller');
const { authenticate } = require('../middleware/auth');

// Public routes (no auth needed)
router.get('/bist100', marketController.getBist100);
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

// Batch operations
router.post('/batch-quotes', marketController.getBatchQuotes);

// Protected routes (require authentication)
router.use(authenticate);
router.get('/watchlist', marketController.getWatchlist);

module.exports = router;
