/**
 * Chart Routes
 * Handles chart redirects and data endpoints
 */

const express = require('express');
const router = express.Router();
const chartController = require('../controllers/chart.controller');

// TradingView redirect
router.get('/tradingview/:symbol', chartController.redirectToTradingView);

// Chart info (without redirect)
router.get('/info/:symbol', chartController.getChartInfo);

// Custom chart data (for our own charts)
router.get('/data/:symbol', chartController.getChartData);

// Available intervals
router.get('/intervals', chartController.getIntervals);

// TradingView embed code
router.post('/embed', chartController.getEmbedCode);

// Batch chart URLs
router.post('/batch-urls', chartController.getBatchChartUrls);

module.exports = router;
