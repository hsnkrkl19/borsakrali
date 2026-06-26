/**
 * ALTIN · Routes — /api/altin
 *
 * Top-down XAU/USD (Ons Altın) çoklu-TF sinyal sistemi. Misafir modeline uygun
 * public (auth yok). Cron periyodik üretir, bellekte tutulur; hazır değilse 503.
 * Sinyaller "🥇 ALTIN" markalıdır.
 *
 * Envelope: tüm yanıtlar { success:true, ... } veya { success:false, error }.
 */

const express = require('express');
const router = express.Router();

const altinEngine = require('../services/altin/altinEngine');
const altinTracker = require('../services/altin/altinTracker');
const altinBacktest = require('../services/altin/altinBacktest');

// GET /signals → en son anlık görüntü (yoksa üret).
router.get('/signals', async (req, res) => {
  try {
    let snap = altinEngine.getLatest();
    if (!snap) snap = await altinEngine.generate();
    if (!snap) return res.status(503).json({ success: false, error: 'Altın sinyalleri henüz hazır değil — birkaç saniye sonra tekrar deneyin' });
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /generate → zorla yeniden üret.
router.post('/generate', async (req, res) => {
  try {
    const snap = await altinEngine.generate();
    if (!snap) return res.status(503).json({ success: false, error: 'Altın sinyalleri üretilemedi' });
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /bias → haftalık+günlük yön (yoksa üret).
router.get('/bias', async (req, res) => {
  try {
    let bias = altinEngine.getBias();
    if (!bias) {
      const snap = await altinEngine.generate();
      bias = snap ? snap.bias : null;
    }
    if (!bias) return res.status(503).json({ success: false, error: 'Altın yön analizi henüz hazır değil' });
    res.json({ success: true, bias });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /sr → TF başına S/R + son fraktal kırılımlar.
router.get('/sr', async (req, res) => {
  try {
    let snap = altinEngine.getLatest();
    if (!snap) snap = await altinEngine.generate();
    if (!snap) return res.status(503).json({ success: false, error: 'Altın S/R verisi henüz hazır değil' });
    const perTf = {};
    for (const tf of Object.keys(snap.perTf || {})) perTf[tf] = { sr: snap.perTf[tf].sr };
    res.json({ success: true, perTf, srBreaks: snap.srBreaks || [] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /tf/:tf → tek TF derin analizi (404 geçersiz TF).
router.get('/tf/:tf', async (req, res) => {
  try {
    const tf = req.params.tf;
    if (!altinEngine.SIGNAL_TFS.includes(tf)) {
      return res.status(404).json({ success: false, error: `Geçersiz zaman dilimi: ${tf}` });
    }
    const result = await altinEngine.analyzeTf(tf);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /backtest → her TF/strateji geçmiş kenarı (cron'la üretilen depo).
router.get('/backtest', (req, res) => {
  try {
    const store = altinBacktest.getStore ? altinBacktest.getStore() : null;
    res.json({ success: true, ...(store || { perTf: {}, generatedAt: null }) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /performance → canlı istatistik + açık pozisyonlar.
router.get('/performance', async (req, res) => {
  try {
    const [stats, open] = await Promise.all([altinTracker.getStats(), altinTracker.listOpen()]);
    res.json({ success: true, stats, open });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /positions → açık pozisyonlar (anlık gerçekleşmemiş % ile).
router.get('/positions', async (req, res) => {
  try {
    const open = await altinTracker.listOpen();
    res.json({ success: true, positions: open });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
