/**
 * ta4j tarzı teknik analiz API'si (EKLEMELİ). Misafir modeline uygun public.
 *
 *  GET  /api/ta4j/catalog            → desteklenen indikatör kataloğu
 *  GET  /api/ta4j/:symbol            → sembol için anlık görüntü + yorum (Yahoo/İş Yat. mumları)
 *  POST /api/ta4j/compute            → istemcinin verdiği mumlar üzerinde hesap (seri/snapshot)
 *
 * Mevcut canlı sinyal indikatörlerinden bağımsızdır; yalnız `trading-signals`
 * tabanlı ta4j-eşi katmanı dışa açar.
 */

const express = require('express');
const router = express.Router();

const ta = require('../services/ta4j/taLibrary');
const liveDataService = require('../services/liveDataService');
const logger = require('../utils/logger');

// Yahoo/İş Yatırım historical satırlarını standart mum şekline çevir.
function toCandles(hist) {
  return (hist || [])
    .filter((r) => r && r.close != null && r.high != null && r.low != null && r.open != null)
    .map((r) => ({
      time: Math.floor((r.timestamp || new Date(r.date).getTime()) / 1000),
      open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume || 0,
    }));
}

// İstek girdisini ta4j indikatör listesine normalize et: ["rsi", {key,options}, ...]
function normalizeRequest(indicators) {
  if (!Array.isArray(indicators) || indicators.length === 0) {
    return Object.keys(ta.INDICATORS).map((key) => ({ key, options: {} }));
  }
  return indicators
    .map((it) => (typeof it === 'string' ? { key: it, options: {} } : { key: it.key, options: it.options || {} }))
    .filter((it) => it.key && ta.INDICATORS[it.key]);
}

// GET /api/ta4j/catalog → indikatör kataloğu (UI parametre formları için)
router.get('/catalog', (_req, res) => {
  res.json({ success: true, count: Object.keys(ta.INDICATORS).length, indicators: ta.listIndicators() });
});

// POST /api/ta4j/compute → body { candles, indicators?, series? }
router.post('/compute', (req, res) => {
  try {
    const { candles, indicators, series } = req.body || {};
    if (!Array.isArray(candles) || candles.length === 0) {
      return res.status(400).json({ success: false, error: 'candles (mum dizisi) gerekli' });
    }
    const reqs = normalizeRequest(indicators);
    const results = {};
    for (const { key, options } of reqs) {
      const r = ta.compute(key, candles, options);
      results[key] = series
        ? { last: r.last, values: r.values, isStable: r.isStable, label: r.label, group: r.group }
        : { last: r.last, isStable: r.isStable, label: r.label, group: r.group };
    }
    res.json({ success: true, count: candles.length, results });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/ta4j/:symbol?range=1y&interval=1d&indicators=rsi,macd,atr
router.get('/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || '').replace('.IS', '').toUpperCase();
  const range = req.query.range || '1y';
  const interval = req.query.interval || '1d';
  const keys = req.query.indicators
    ? String(req.query.indicators).split(',').map((s) => s.trim()).filter((k) => ta.INDICATORS[k])
    : null;
  try {
    const hist = await liveDataService.fetchHistoricalData(symbol, range, interval);
    const candles = toCandles(hist);
    if (candles.length < 30) {
      return res.status(404).json({ success: false, error: `Yeterli mum verisi yok (${candles.length})` });
    }
    const report = ta.analyze(candles, {});
    const snapshot = keys ? ta.computeAll(candles, { keys }) : report.snapshot;
    res.json({
      success: true,
      symbol,
      range,
      interval,
      candles: candles.length,
      lastClose: report.close,
      overall: report.overall,
      signals: report.signals,
      snapshot,
    });
  } catch (e) {
    logger.error?.(`ta4j /${symbol} hata: ${e.message}`);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
