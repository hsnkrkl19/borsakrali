/**
 * BIST Sinyal Routes — ≥75 LONG (spot al) sinyalleri. Misafir modeline uygun
 * public (auth yok). Açık numaralı sinyaller + son kapananlar + son tarama özeti.
 */

const express = require('express');
const router = express.Router();

const engine = require('../services/bistSignals/bistScoreEngine');
const tracker = require('../services/bistSignals/bistSignalTracker');

// GET /api/bist-signals → { open, closedRecent, lastScan, minConfidence }
router.get('/', async (req, res) => {
  try {
    const [open, closedRecent] = await Promise.all([tracker.getOpen(), tracker.getClosedRecent()]);
    const latest = engine.getLatest();
    res.json({
      success: true,
      minConfidence: engine.MIN_CONFIDENCE,
      open,
      closedRecent,
      lastScan: latest
        ? { generatedAt: latest.generatedAt, scanned: latest.scanned, qualified: latest.qualified, top: latest.top }
        : null,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/bist-signals/scan → mevcut tarama (cache; 15 dk). force ile yeniden tara.
router.get('/scan', async (req, res) => {
  try {
    const force = req.query.force === '1' || req.query.force === 'true';
    const snap = await engine.scan({ force });
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
