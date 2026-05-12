/**
 * Trading Bot HTTP routes
 *
 *   GET  /api/trading-bot/strategies                  — kayıtlı stratejiler
 *   POST /api/trading-bot/backtest                    — { market, symbol, strategyId, timeframe?, params?, lookback? }
 *   POST /api/trading-bot/validate                    — { market, symbol, strategyId, timeframe?, params? }
 *   POST /api/trading-bot/param-sweep                 — { market, symbol, strategyId, paramName, range, baseParams?, timeframe? }
 *   GET  /api/trading-bot/signal                      — ?market=&symbol=&strategyId=&timeframe=
 *   GET  /api/trading-bot/scan                        — ?market=&strategyId=&timeframe=
 */

const express = require('express');
const router = express.Router();
const svc = require('../services/tradingBotService');

router.get('/strategies', (_req, res) => {
  try {
    res.json({ ok: true, strategies: svc.getStrategies() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/backtest', async (req, res) => {
  try {
    const { market, symbol, strategyId, timeframe, params, lookback } = req.body || {};
    if (!market || !symbol || !strategyId) {
      return res.status(400).json({ ok: false, error: 'market, symbol ve strategyId zorunlu' });
    }
    const result = await svc.backtest({ market, symbol, strategyId, timeframe, params, lookback });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/validate', async (req, res) => {
  try {
    const { market, symbol, strategyId, timeframe, params, lookback } = req.body || {};
    if (!market || !symbol || !strategyId) {
      return res.status(400).json({ ok: false, error: 'market, symbol ve strategyId zorunlu' });
    }
    const result = await svc.validate({ market, symbol, strategyId, timeframe, params, lookback });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/param-sweep', async (req, res) => {
  try {
    const { market, symbol, strategyId, timeframe, paramName, range, baseParams, lookback } = req.body || {};
    if (!market || !symbol || !strategyId || !paramName || !Array.isArray(range)) {
      return res.status(400).json({ ok: false, error: 'market, symbol, strategyId, paramName, range zorunlu' });
    }
    const result = await svc.paramSweep({ market, symbol, strategyId, timeframe, paramName, range, baseParams, lookback });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/signal', async (req, res) => {
  try {
    const { market, symbol, strategyId, timeframe } = req.query;
    if (!market || !symbol || !strategyId) {
      return res.status(400).json({ ok: false, error: 'market, symbol ve strategyId zorunlu' });
    }
    const result = await svc.currentSignal({ market, symbol, strategyId, timeframe });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/compare-all', async (req, res) => {
  try {
    const { market, symbol, timeframe, lookback } = req.body || {};
    if (!market || !symbol) {
      return res.status(400).json({ ok: false, error: 'market ve symbol zorunlu' });
    }
    const result = await svc.compareAll({ market, symbol, timeframe, lookback });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/scan', async (req, res) => {
  try {
    const { market, strategyId, timeframe } = req.query;
    if (!market || !strategyId) {
      return res.status(400).json({ ok: false, error: 'market ve strategyId zorunlu' });
    }
    const result = await svc.scan({ market, strategyId, timeframe });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
