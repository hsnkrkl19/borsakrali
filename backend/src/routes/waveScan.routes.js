/**
 * Dalga Taraması (Elliott + SNR + Mum + Fraktal) — HTTP rotaları.
 * BTC + Altın, 1d/4h. Diğer sinyallerden BAĞIMSIZ; yalnız Telegram kanalına gider.
 *
 *   GET  /api/wave-scan/open    — açık dalga pozisyonları
 *   GET  /api/wave-scan/status  — yapılandırma + kill-switch durumu
 *   POST /api/wave-scan/scan    — manuel tarama tetikle (admin)
 */

const express = require('express');
const router = express.Router();

const tracker = require('../services/waveScan/waveScanTracker');
const engine = require('../services/waveScan/waveScanEngine');
const cronJobs = require('../services/cronJobs');
const authService = require('../services/authService');

async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Token gerekli' });
  const verified = await authService.verifyToken(authHeader.split(' ')[1]);
  if (!verified.success) return res.status(401).json({ ok: false, ...verified });
  if (verified.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin yetkisi gerekli' });
  req.user = verified.user;
  next();
}

router.get('/open', async (_req, res) => {
  try { await tracker.load(); res.json({ ok: true, open: tracker.getOpen() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/status', (_req, res) => {
  res.json({ ok: true, pairs: engine.PAIRS, tfs: engine.TFS, pushDisabled: process.env.WAVESCAN_PUSH_DISABLED === '1' });
});

router.post('/scan', requireAdmin, (_req, res) => {
  try {
    cronJobs.triggerWaveScan().catch((err) => console.error('[WaveScan] manuel tarama hatası:', err.message));
    res.json({ ok: true, started: true, message: 'Dalga taraması başlatıldı (BTC + Altın, 1d/4h).' });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
