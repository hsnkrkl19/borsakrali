/**
 * backtestService HTTP routes — backtesting.py SIDECAR analizleri (salt-okunur + araç).
 *
 *   GET  /api/backtest-service/health    — sidecar sağlığı + kalibrasyon bayrakları
 *   GET  /api/backtest-service/forex     — forex (enstrüman:TF) perBand + tearsheet deposu
 *   GET  /api/backtest-service/bist      — BIST global kalibrasyon kovaları
 *   POST /api/backtest-service/optimize  — SL/TP ATR çarpan taraması (yalnız analiz)
 *
 * Bu uçlar CANLI sinyalleri DEĞİŞTİRMEZ — yalnız kalibrasyon/analiz verisini gösterir
 * ve isteğe bağlı SL/TP optimizasyonu (uygulanmaz) sunar. Global model (auth yok).
 */

const express = require('express');
const router = express.Router();

const sidecar = require('../services/backtest/sidecarClient');
const forexBacktest = require('../services/forex/forexBacktest');
const bistBacktest = require('../services/bistSignals/bistBacktest');

router.get('/health', async (_req, res) => {
  const h = await sidecar.health();
  res.json({
    ok: true,
    sidecar: h,
    calibration: {
      forexActive: process.env.FOREX_CALIBRATION_ACTIVE !== '0',
      bistActive: process.env.BIST_CALIBRATION_ACTIVE !== '0',
      maxDrop: Number(process.env.CALIBRATION_MAX_DROP) || 15,
      maxRise: Number(process.env.CALIBRATION_MAX_RISE) || 15,
    },
  });
});

router.get('/forex', (_req, res) => {
  const store = forexBacktest.getStore();
  res.json({ ok: true, generatedAt: store.generatedAt || null, engine: store.engine || null, data: store });
});

router.get('/bist', (_req, res) => {
  res.json({ ok: true, data: bistBacktest.getLatest() });
});

router.post('/optimize', async (req, res) => {
  if (!sidecar.isEnabled()) return res.status(503).json({ ok: false, error: 'backtest sidecar etkin değil (BACKTEST_SERVICE_URL set değil)' });
  const out = await sidecar.optimize(req.body || {});
  if (!out) return res.status(502).json({ ok: false, error: 'sidecar yanıt vermedi' });
  res.json(out);
});

module.exports = router;
