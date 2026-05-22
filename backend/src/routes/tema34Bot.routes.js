/**
 * TEMA34 Bot — HTTP rotaları
 *
 *   GET  /api/tema34-bot/status     — portföy KPI + config + tarama durumu
 *   GET  /api/tema34-bot/positions  — açık pozisyonlar
 *   GET  /api/tema34-bot/trades     — kapanmış işlemler (yeniden eskiye)
 *   GET  /api/tema34-bot/runs       — günlük tarama günlüğü (yeniden eskiye)
 *   POST /api/tema34-bot/run        — manuel tarama tetikle (admin)
 *   POST /api/tema34-bot/reset      — botu sıfırla (admin)
 */

const express = require('express');
const router = express.Router();

const tema34Engine = require('../services/tema34Bot/tema34Engine');
const tema34Store = require('../services/tema34Bot/tema34Store');
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
    res.json({ ok: true, status: tema34Engine.getStatus() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/positions', (_req, res) => {
  try {
    res.json({ ok: true, open: tema34Store.listOpen() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/trades', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    res.json({ ok: true, trades: tema34Store.listTrades(limit) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/runs', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200);
    res.json({ ok: true, runs: tema34Store.listRuns(limit) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Admin endpoints ───────────────────────────────────────────────────────
router.post('/run', requireAdmin, (_req, res) => {
  try {
    if (tema34Engine.isRunning()) {
      return res.json({ ok: false, busy: true, error: 'Tarama zaten sürüyor' });
    }
    // Tüm BIST taraması 1-2 dk sürer — arka planda başlat, anında yanıt ver.
    tema34Engine.runDaily({ force: true }).catch((err) => {
      console.error('[Tema34Bot] manuel tarama hatası:', err.message);
    });
    res.json({ ok: true, started: true, message: 'Tüm BIST taranıyor — 1-2 dakika sürebilir.' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/reset', requireAdmin, (_req, res) => {
  try {
    res.json(tema34Store.reset());
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
