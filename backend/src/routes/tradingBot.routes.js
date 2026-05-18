/**
 * Trading Bot v6 HTTP routes — sinyal-takipli sanal portföy + immutable log
 *
 *   GET  /api/trading-bot/status        — portföy KPI + config + equity history
 *   GET  /api/trading-bot/positions     — { open: [...], pending: [...] }
 *   GET  /api/trading-bot/trades        — kapalı işlemler (yeniden eski)
 *   GET  /api/trading-bot/signal-log    — append-only sinyal logu
 *   POST /api/trading-bot/tick          — manuel tick (admin)
 *   POST /api/trading-bot/reset         — bot sıfırla (admin)
 *   POST /api/trading-bot/ingest        — manuel snapshot ingest (admin, debug)
 */

const express = require('express');
const router = express.Router();

const botEngine = require('../services/tradingBotV2/botEngine');
const positionStore = require('../services/tradingBotV2/positionStore');
const authService = require('../services/authService');
const snapshotStore = require('../services/snapshotStore');

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
router.get('/status', async (_req, res) => {
  try {
    const status = await botEngine.getStatus();
    res.json({ ok: true, status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/positions', (_req, res) => {
  try {
    const open = positionStore.listOpen();
    const pending = positionStore.listPending();
    res.json({ ok: true, open, pending });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/trades', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    const trades = positionStore.listTrades(limit);
    res.json({ ok: true, trades });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/signal-log', (req, res) => {
  try {
    const {
      symbol, strategy, fromDate, toDate, outcome,
    } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 5000);
    const entries = positionStore.listSignalLog({
      symbol, strategy, fromDate, toDate, outcome, limit,
    });
    res.json({ ok: true, entries });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Admin endpoints (tick / reset / ingest) ───────────────────────────────
router.post('/tick', requireAdmin, async (req, res) => {
  try {
    const result = await botEngine.tick(req.body || {});
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/reset', requireAdmin, (_req, res) => {
  try {
    const result = positionStore.reset();
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/ingest', requireAdmin, async (req, res) => {
  try {
    const { date, phase } = req.body || {};
    const snap = snapshotStore.read(date || snapshotStore.dateKey());
    if (!snap) return res.status(404).json({ ok: false, error: 'Snapshot bulunamadı' });
    const phaseData = phase === 'revision' ? snap.revision
      : phase === 'intraday' ? (snap.intraday?.[snap.intraday.length - 1])
      : snap.premarket;
    if (!phaseData) return res.status(404).json({ ok: false, error: `Faz bulunamadı: ${phase}` });
    const result = await botEngine.ingestSnapshot({ ...phaseData, phase: phase || 'premarket' });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
