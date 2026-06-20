/**
 * YENİ ROBOT · Routes — /api/pro-signals
 *
 * Derin konfluans sinyal sistemi (BTC / Ons Altın / S&P 500 / EUR-USD).
 * Misafir modeline uygun public (auth yok). Cron her 3 dk üretir, bellekte tutulur.
 * Eski /api/forex ile PARALEL — sinyaller "🤖 YENİ ROBOT" markalıdır.
 *
 * ?equity=  → portföy değeri (varsayılan 10000); lot/kâr-zarar anında ölçeklenir.
 */

const express = require('express');
const router = express.Router();

const proEngine = require('../services/proSignals/proEngine');
const proBacktest = require('../services/proSignals/proBacktest');
const proStatsStore = require('../services/proSignals/proStatsStore');
const proSignalLog = require('../services/proSignals/proSignalLog');
const proSelfTest = require('../services/proSignals/proSelfTest');
const proTracker = require('../services/proSignals/proSignalTracker');
const { listInstruments } = require('../services/proSignals/proInstruments');

function parseEquity(req) {
  const e = parseFloat(req.query.equity);
  if (!(e > 0)) return undefined;
  return Math.max(100, Math.min(10_000_000, e));
}

router.get('/instruments', (req, res) => {
  res.json({ success: true, robot: 'YENİ ROBOT', instruments: listInstruments(), tfs: proEngine.TFS });
});

router.get('/signals', async (req, res) => {
  try {
    const equity = parseEquity(req);
    let snap = proEngine.getLatest();
    if (!snap) snap = await proEngine.generate(equity || proEngine.DEFAULT_EQUITY);
    else if (equity && equity !== snap.equity) snap = proEngine.rescale(equity);
    if (!snap) return res.status(503).json({ success: false, error: 'Yeni robot sinyalleri henüz hazır değil — birkaç saniye sonra tekrar deneyin' });
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const equity = parseEquity(req) || (parseFloat(req.body?.equity) > 0 ? parseFloat(req.body.equity) : undefined);
    const snap = await proEngine.generate(equity || proEngine.DEFAULT_EQUITY);
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/signal/:id', async (req, res) => {
  try {
    const equity = parseEquity(req) || proEngine.DEFAULT_EQUITY;
    const result = await proEngine.analyzeOne(req.params.id, equity);
    if (!result) return res.status(404).json({ success: false, error: `${req.params.id} yeni robot evreninde yok` });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Detaylı sinyal logu (teknikler/skorlar/seviyeler/backtest verdikti/outcome)
router.get('/log', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 100));
    const instrument = req.query.instrument || null;
    const records = proSignalLog.list({ limit, instrument });
    res.json({ success: true, count: records.length, records });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Canlı performans + self-test durumu (canlı vs backtest, tuned ağırlık/eşik)
router.get('/performance', (req, res) => {
  try {
    res.json({
      success: true,
      robot: 'YENİ ROBOT',
      stats: proStatsStore.getStats(),
      open: proTracker.getOpen ? proTracker.getOpen() : [],
      selfTest: proSelfTest.getState ? proSelfTest.getState() : null,
      weights: proSelfTest.getTunedWeights(),
      pushThreshold: proSelfTest.getPushThreshold(),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Backtest sonuçları (enstrüman:tf → bant başına winRate/PF/expectancy)
router.get('/backtest', (req, res) => {
  try {
    const store = proBacktest.getStore ? proBacktest.getStore() : null;
    res.json({ success: true, ...(store || { data: {}, generatedAt: null }) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
