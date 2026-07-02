/**
 * MT5 Gün-içi Tarayıcı Routes — /api/mt5-scanner
 *
 * 9 enstrüman (BTC/ETH/XRP/SOL + Altın + Gümüş + EURUSD + Nasdaq + S&P500)
 * × 5 TF (5m/15m/1h/4h/1d) gün-içi long/short sinyalleri; güven notu +
 * giriş/SL/TP + LOT (broker adımına oturmuş) + marj + muhtemel kâr-zarar +
 * MT5 emri + risk bütçesi (günlük %5 / toplam %10). Misafir modeline uygun
 * public (auth yok). Her dk cron üretir, bellekte tutulur.
 *
 * ?equity= → yalnız GÖRÜNÜM ölçekler. POST /equity → KALICI ayar (Telegram
 * sinyalleri de yeni portföyle boyutlanır) + yeniden tarama tetiklenir.
 */

const express = require('express');
const router = express.Router();

const engine = require('../services/mt5Scanner/mt5Engine');
const tracker = require('../services/mt5Scanner/mt5Tracker');
const { listInstruments } = require('../services/mt5Scanner/mt5Instruments');

function parseEquity(v) {
  const e = parseFloat(v);
  if (!(e > 0)) return undefined;
  return Math.max(100, Math.min(10_000_000, e));
}

router.get('/instruments', (req, res) => {
  res.json({ success: true, instruments: listInstruments(), tfs: engine.TFS });
});

router.get('/signals', async (req, res) => {
  try {
    const equity = parseEquity(req.query.equity);
    let snap = engine.getLatest();
    if (!snap) snap = await engine.generate(equity);
    else if (equity && equity !== snap.equity) snap = engine.rescale(equity);
    if (!snap) return res.status(503).json({ success: false, error: 'MT5 gün-içi sinyalleri henüz hazır değil — birkaç saniye sonra tekrar deneyin' });
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const equity = parseEquity(req.query.equity) || parseEquity(req.body?.equity);
    const snap = await engine.generate(equity);
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Portföy KALICI ayarı (vars. 10.000$) — değişince sıfırdan tarama (kullanıcı kuralı)
router.post('/equity', async (req, res) => {
  try {
    const equity = parseEquity(req.body?.equity);
    if (!equity) return res.status(400).json({ success: false, error: 'equity > 0 olmalı' });
    await tracker.load();
    const saved = tracker.setEquity(equity);
    const snap = await engine.generate(saved);
    res.json({ success: true, equity: saved, counts: snap.counts, budget: snap.budget });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Açık pozisyonlar + risk bütçesi (site görünümü — public)
router.get('/open', async (req, res) => {
  try {
    await tracker.load();
    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      equity: tracker.getEquity(),
      budget: tracker.budget(),
      positions: tracker.getOpen(),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Kapanan işlemler (son N) + gün/toplam istatistik
router.get('/trades', async (req, res) => {
  try {
    await tracker.load();
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
    res.json({
      success: true,
      day: tracker.getDayStats(),
      total: tracker.getTotalStats(),
      trades: tracker.getRecentTrades(limit),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    await tracker.load();
    const snap = engine.getLatest();
    res.json({
      success: true,
      equity: tracker.getEquity(),
      budget: tracker.budget(),
      tfs: engine.TFS,
      lastGeneratedAt: snap?.generatedAt || null,
      counts: snap?.counts || null,
      openCount: tracker.getOpen().length,
      env: {
        scannerDisabled: process.env.MT5_SCANNER_DISABLED === '1',
        pushDisabled: process.env.MT5_PUSH_DISABLED === '1',
        channelSet: !!(process.env.TELEGRAM_MT5_CHANNEL || process.env.TELEGRAM_FOREX_CHANNEL || process.env.TELEGRAM_SIGNAL_CHANNEL),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/signal/:id', async (req, res) => {
  try {
    const result = await engine.analyzeOne(req.params.id, parseEquity(req.query.equity));
    if (!result) return res.status(404).json({ success: false, error: `${req.params.id} MT5 tarayıcı evreninde yok` });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
