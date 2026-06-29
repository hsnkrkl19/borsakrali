/**
 * TEMA34 Tarama Bildirimcisi — HTTP rotaları
 *
 *   GET  /api/tema34-scanner/status   — son tarama özeti + idempotluk durumu
 *   GET  /api/tema34-scanner/runs     — tarama günlüğü (yeniden eskiye)
 *   POST /api/tema34-scanner/run      — manuel tarama + bildirim tetikle (admin)
 *                                        body: { force?: boolean }
 *
 * Tüm BIST taranır; YALNIZ TEMA34 yukarı (cross_above) ve düşüşte (cross_below)
 * ilk kırılımları AYRI bir Telegram kanalına (TELEGRAM_TEMA34_CHANNEL) gönderir.
 */

const express = require('express');
const router = express.Router();

const tema34ScannerStore = require('../services/tema34Scanner/tema34ScannerStore');
const tema34ScannerNotifier = require('../services/tema34Scanner/tema34ScannerNotifier');
const crossoverScanner = require('../services/crossover/crossoverScanner');
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
      lastCandleDate: tema34ScannerStore.getLastCandleDate(),
      lastResult: tema34ScannerStore.getLastResult(),
      running: crossoverScanner.isRunning(),
      channelSet: !!tema34ScannerNotifier.channelId(),
      pushDisabled: process.env.TEMA34_SCANNER_DISABLED === '1',
      config: crossoverScanner.CONFIG,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/runs', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 60);
    res.json({ ok: true, runs: tema34ScannerStore.listRuns(limit) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Admin endpoint ─────────────────────────────────────────────────────────
router.post('/run', requireAdmin, (req, res) => {
  try {
    if (crossoverScanner.isRunning()) {
      return res.json({ ok: false, busy: true, error: 'Tarama zaten sürüyor' });
    }
    const force = req.body?.force === true || req.query.force === 'true';
    // Tüm BIST taraması 1-2 dk sürer — arka planda başlat, anında yanıt ver.
    cronJobs.triggerTema34Scanner({ force }).catch((err) => {
      console.error('[TEMA34Scanner] manuel tarama hatası:', err.message);
    });
    res.json({ ok: true, started: true, force, message: 'Tüm BIST taranıyor — 1-2 dakika sürebilir.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
