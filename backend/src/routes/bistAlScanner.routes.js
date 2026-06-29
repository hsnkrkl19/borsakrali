/**
 * BIST "≥80 kaliteli AL" Tarama Bildirimcisi — HTTP rotaları
 *
 *   GET  /api/bist-al-scanner/status   — son tarama özeti + günlük dedup durumu
 *   GET  /api/bist-al-scanner/runs     — tarama günlüğü (yeniden eskiye)
 *   POST /api/bist-al-scanner/run      — manuel tarama + bildirim tetikle (admin)
 *                                         body: { force?: boolean }
 *
 * Tüm BIST taranır; güven≥80 + fiyat EMA34 üstü + hacim teyidi geçen top 5 AL
 * (spot-long) sinyali AYRI yeni Telegram kanalına (TELEGRAM_BIST_AL_CHANNEL) gider.
 */

const express = require('express');
const router = express.Router();

const store = require('../services/bistAlScanner/bistAlScannerStore');
const notifier = require('../services/bistAlScanner/bistAlScannerNotifier');
const cronJobs = require('../services/cronJobs');
const authService = require('../services/authService');

async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Token gerekli' });
  }
  const token = authHeader.split(' ')[1];
  const verified = await authService.verifyToken(token);
  if (!verified.success) return res.status(401).json({ ok: false, ...verified });
  if (verified.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin yetkisi gerekli' });
  }
  req.user = verified.user;
  next();
}

// ── Public read endpoints ─────────────────────────────────────────────────
router.get('/status', (_req, res) => {
  try {
    res.json({
      ok: true,
      tradingDate: store.getTradingDate(),
      sentSymbols: store.getSentSymbols(),
      lastResult: store.getLastResult(),
      channelSet: !!notifier.channelId(),
      pushDisabled: process.env.BIST_AL_SCANNER_DISABLED === '1',
      config: { minConfidence: notifier.MIN_CONFIDENCE, topN: notifier.TOP_N, volMult: notifier.VOL_MULT },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/runs', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 60);
    res.json({ ok: true, runs: store.listRuns(limit) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Admin endpoint ─────────────────────────────────────────────────────────
router.post('/run', requireAdmin, (req, res) => {
  try {
    const force = req.body?.force === true || req.query.force === 'true';
    // Tüm BIST taraması 1-2 dk sürebilir — arka planda başlat, anında yanıt ver.
    cronJobs.triggerBistAlScanner({ force }).catch((err) => {
      console.error('[BistAlScanner] manuel tarama hatası:', err.message);
    });
    res.json({ ok: true, started: true, force, message: 'Tüm BIST taranıyor — 1-2 dakika sürebilir.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
