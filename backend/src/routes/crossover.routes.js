/**
 * EMA34 / TEMA34 Kırılım Bildirimcisi — HTTP rotaları
 *
 *   GET  /api/crossover/status   — son tarama özeti + idempotluk durumu
 *   GET  /api/crossover/runs     — tarama günlüğü (yeniden eskiye)
 *   POST /api/crossover/run      — manuel tarama + bildirim tetikle (admin)
 *                                   body: { force?: boolean }
 *
 * Tüm BIST taranır; yukarı (cross_above) ve düşüşte (cross_below) ilk kırılımlar
 * Telegram ana kanal + uygulama/web push ile gönderilir.
 */

const express = require('express');
const router = express.Router();

const crossoverStore = require('../services/crossover/crossoverStore');
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
      lastCandleDate: crossoverStore.getLastCandleDate(),
      lastResult: crossoverStore.getLastResult(),
      running: crossoverScanner.isRunning(),
      pushDisabled: process.env.CROSSOVER_PUSH_DISABLED === '1',
      config: crossoverScanner.CONFIG,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/runs', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 60);
    res.json({ ok: true, runs: crossoverStore.listRuns(limit) });
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
    cronJobs.triggerCrossoverAlerts({ force }).catch((err) => {
      console.error('[Crossover] manuel tarama hatası:', err.message);
    });
    res.json({ ok: true, started: true, force, message: 'Tüm BIST taranıyor — 1-2 dakika sürebilir.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
