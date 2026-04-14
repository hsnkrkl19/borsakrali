/**
 * Chart Controller
 * Handles chart redirects and data
 */

const tradingViewService = require('../services/tradingViewService');
const yahooFinanceService = require('../services/yahooFinanceService');
const { Stock } = require('../models');
const logger = require('../utils/logger');

class ChartController {
  
  /**
   * Redirect to TradingView chart
   * GET /api/chart/tradingview/:symbol?interval=D
   */
  async redirectToTradingView(req, res) {
    try {
      const { symbol } = req.params;
      const { interval = 'D' } = req.query;

      // Validate stock exists
      const stock = await Stock.findOne({ where: { symbol, isActive: true } });
      if (!stock) {
        return res.status(404).json({ error: `Stock ${symbol} not found` });
      }

      // Validate interval
      if (!tradingViewService.isValidInterval(interval)) {
        return res.status(400).json({ 
          error: 'Invalid interval',
          validIntervals: tradingViewService.getTimeIntervals()
        });
      }

      // Get TradingView URL
      const chartUrl = tradingViewService.getChartUrl(symbol, interval);

      // Redirect
      res.redirect(chartUrl);

    } catch (error) {
      logger.error('redirectToTradingView error:', error);
      res.status(500).json({ error: 'Failed to redirect to chart' });
    }
  }

  /**
   * Get TradingView chart info (without redirect)
   * GET /api/chart/info/:symbol?interval=D
   */
  async getChartInfo(req, res) {
    try {
      const { symbol } = req.params;
      const { interval = 'D' } = req.query;

      // Validate stock
      const stock = await Stock.findOne({ where: { symbol, isActive: true } });
      if (!stock) {
        return res.status(404).json({ error: `Stock ${symbol} not found` });
      }

      const chartUrl = tradingViewService.getChartUrl(symbol, interval);
      const widgetUrl = tradingViewService.getWidgetUrl(symbol, interval);
      const embedCode = tradingViewService.getWidgetEmbedCode(symbol, interval);
      const intervals = tradingViewService.getTimeIntervals();

      res.json({
        stock: {
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector
        },
        chart: {
          url: chartUrl,
          widgetUrl,
          embedCode,
          currentInterval: interval,
          availableIntervals: intervals
        }
      });

    } catch (error) {
      logger.error('getChartInfo error:', error);
      res.status(500).json({ error: 'Failed to get chart info' });
    }
  }

  /**
   * Get chart data for custom charts (our own charts)
   * GET /api/chart/data/:symbol?interval=1d&range=1mo
   */
  async getChartData(req, res) {
    try {
      const { symbol } = req.params;
      const { interval = '1d', range = '1mo' } = req.query;

      // Validate stock
      const stock = await Stock.findOne({ where: { symbol, isActive: true } });
      if (!stock) {
        return res.status(404).json({ error: `Stock ${symbol} not found` });
      }

      // Fetch data from Yahoo Finance
      const data = await yahooFinanceService.getHistoricalData(symbol, range, interval);

      if (!data) {
        return res.status(404).json({ error: 'No chart data available' });
      }

      // Format for chart libraries (Recharts, Chart.js)
      const chartData = data.quotes.map(q => ({
        date: q.date,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume,
        timestamp: new Date(q.date).getTime()
      }));

      res.json({
        symbol,
        interval,
        range,
        data: chartData,
        meta: data.meta
      });

    } catch (error) {
      logger.error(`getChartData error for ${req.params.symbol}:`, error);
      res.status(500).json({ error: 'Failed to fetch chart data' });
    }
  }

  /**
   * Get available time intervals
   * GET /api/chart/intervals
   */
  async getIntervals(req, res) {
    try {
      const intervals = {
        tradingView: tradingViewService.getTimeIntervals(),
        yahoo: [
          // Intraday intervals
          { value: '1m', label: '1 Dakika', type: 'intraday', maxRange: '7d' },
          { value: '2m', label: '2 Dakika', type: 'intraday', maxRange: '60d' },
          { value: '5m', label: '5 Dakika', type: 'intraday', maxRange: '60d' },
          { value: '15m', label: '15 Dakika', type: 'intraday', maxRange: '60d' },
          { value: '30m', label: '30 Dakika', type: 'intraday', maxRange: '60d' },
          { value: '60m', label: '1 Saat', type: 'intraday', maxRange: '730d' },
          { value: '90m', label: '90 Dakika', type: 'intraday', maxRange: '60d' },
          
          // Daily and above
          { value: '1d', label: 'Günlük', type: 'daily', maxRange: 'max' },
          { value: '5d', label: '5 Gün', type: 'daily', maxRange: 'max' },
          { value: '1wk', label: 'Haftalık', type: 'weekly', maxRange: 'max' },
          { value: '1mo', label: 'Aylık', type: 'monthly', maxRange: 'max' },
          { value: '3mo', label: '3 Aylık', type: 'quarterly', maxRange: 'max' }
        ],
        ranges: [
          { value: '1d', label: '1 Gün' },
          { value: '5d', label: '5 Gün' },
          { value: '1mo', label: '1 Ay' },
          { value: '3mo', label: '3 Ay' },
          { value: '6mo', label: '6 Ay' },
          { value: '1y', label: '1 Yıl' },
          { value: '2y', label: '2 Yıl' },
          { value: '5y', label: '5 Yıl' },
          { value: 'ytd', label: 'Yıl Başından Beri' },
          { value: 'max', label: 'Tümü' }
        ]
      };

      res.json(intervals);

    } catch (error) {
      logger.error('getIntervals error:', error);
      res.status(500).json({ error: 'Failed to get intervals' });
    }
  }

  /**
   * Get TradingView widget embed code
   * POST /api/chart/embed
   */
  async getEmbedCode(req, res) {
    try {
      const { symbol, interval = 'D', height = 600 } = req.body;

      if (!symbol) {
        return res.status(400).json({ error: 'Symbol required' });
      }

      // Validate stock
      const stock = await Stock.findOne({ where: { symbol, isActive: true } });
      if (!stock) {
        return res.status(404).json({ error: `Stock ${symbol} not found` });
      }

      const embedCode = tradingViewService.getWidgetEmbedCode(symbol, interval, height);

      res.json({
        symbol,
        interval,
        embedCode
      });

    } catch (error) {
      logger.error('getEmbedCode error:', error);
      res.status(500).json({ error: 'Failed to generate embed code' });
    }
  }

  /**
   * Get multiple chart URLs (batch)
   * POST /api/chart/batch-urls
   */
  async getBatchChartUrls(req, res) {
    try {
      const { symbols, interval = 'D' } = req.body;

      if (!Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: 'Symbols array required' });
      }

      const urls = symbols.map(symbol => ({
        symbol,
        chartUrl: tradingViewService.getChartUrl(symbol, interval),
        widgetUrl: tradingViewService.getWidgetUrl(symbol, interval)
      }));

      res.json({ urls });

    } catch (error) {
      logger.error('getBatchChartUrls error:', error);
      res.status(500).json({ error: 'Failed to generate batch URLs' });
    }
  }
}

module.exports = new ChartController();
