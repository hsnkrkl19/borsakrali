/**
 * Kripto Bot HTTP routes — long+short sanal portföy + değişmez sinyal logu
 *
 *   GET  /api/crypto-bot/status        — portföy KPI + config + equity history
 *   GET  /api/crypto-bot/positions     — { open: [...], pending: [] }
 *   GET  /api/crypto-bot/trades        — kapalı işlemler (yeniden eski)
 *   GET  /api/crypto-bot/signal-log    — append-only sinyal logu
 *   POST /api/crypto-bot/tick          — manuel tick (admin)
 *   POST /api/crypto-bot/reset         — bot sıfırla (admin)
 *   POST /api/crypto-bot/ingest        — manuel snapshot ingest (admin, debug)
 */

const express = require('express');
const router = express.Router();

const cryptoBotEngine = require('../services/cryptoBotV2/cryptoBotEngine');
const positionStore = require('../services/cryptoBotV2/positionStore');
const authService = require('../services/authService');
const cryptoSnapshotStore = require('../services/cryptoSnapshotStore');

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
    const status = await cryptoBotEngine.getStatus();
    res.json({ ok: true, status });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/positions', (_req, res) => {
  try {
    const open = positionStore.listOpen();
    res.json({ ok: true, open, pending: [] });
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
    const { symbol, strategy, fromDate, toDate, outcome } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 5000);
    const entries = positionStore.listSignalLog({ symbol, strategy, fromDate, toDate, outcome, limit });
    res.json({ ok: true, entries });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Admin endpoints (tick / reset / ingest) ───────────────────────────────
router.post('/tick', requireAdmin, async (req, res) => {
  try {
    const result = await cryptoBotEngine.tick(req.body || {});
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
    const snap = cryptoSnapshotStore.read(date || cryptoSnapshotStore.dateKey());
    if (!snap) return res.status(404).json({ ok: false, error: 'Snapshot bulunamadı' });
    const phaseData = phase === 'intraday'
      ? (snap.intraday?.[snap.intraday.length - 1])
      : (snap[phase] || cryptoSnapshotStore.getCurrentPhase(snap));
    if (!phaseData) return res.status(404).json({ ok: false, error: `Faz bulunamadı: ${phase}` });
    const result = await cryptoBotEngine.ingestSnapshot({ ...phaseData, phase: phaseData.phase || phase || 'intraday' });
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
