/**
 * Forex / Parite Routes — Borsa Krali (çoklu-zaman, çoklu-strateji)
 *
 * 10 enstrüman × 5 TF (5m/15m/1h/4h/1d) gün-içi+swing long/short sinyalleri,
 * güven notu + giriş/SL/TP/lot/kâr-zarar + MetaTrader5 emri. Misafir modeline
 * uygun public (auth yok). Her dk cron üretir, bellekte tutulur.
 *
 * ?equity=  → portföy değeri (varsayılan 10000). Sinyaller yeniden taranmadan
 *             lot/kâr-zarar anında ölçeklenir.
 */

const express = require('express');
const router = express.Router();

const forexEngine = require('../services/forex/forexEngineMTF');
const { listInstruments } = require('../services/forex/forexInstruments');

function parseEquity(req) {
  const e = parseFloat(req.query.equity);
  if (!(e > 0)) return undefined;
  return Math.max(100, Math.min(10_000_000, e));
}

router.get('/instruments', (req, res) => {
  res.json({ success: true, instruments: listInstruments(), tfs: forexEngine.TFS });
});

router.get('/signals', async (req, res) => {
  try {
    const equity = parseEquity(req);
    let snap = forexEngine.getLatest();
    if (!snap) snap = await forexEngine.generate(equity || forexEngine.DEFAULT_EQUITY);
    else if (equity && equity !== snap.equity) snap = forexEngine.rescale(equity);
    if (!snap) return res.status(503).json({ success: false, error: 'Forex sinyalleri henüz hazır değil — birkaç saniye sonra tekrar deneyin' });
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const equity = parseEquity(req) || (parseFloat(req.body?.equity) > 0 ? parseFloat(req.body.equity) : undefined);
    const snap = await forexEngine.generate(equity || forexEngine.DEFAULT_EQUITY);
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/signal/:id', async (req, res) => {
  try {
    const equity = parseEquity(req) || forexEngine.DEFAULT_EQUITY;
    const result = await forexEngine.analyzeOne(req.params.id, equity);
    if (!result) return res.status(404).json({ success: false, error: `${req.params.id} forex evreninde yok` });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
