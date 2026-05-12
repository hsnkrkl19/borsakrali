const express = require('express');
const rateLimit = require('express-rate-limit');

const authService = require('../services/authService');
const pushNotificationService = require('../services/pushNotificationService');
const dailyPerformanceService = require('../services/dailyPerformanceService');
const cronJobsService = require('../services/cronJobs');

const router = express.Router();

const VALID_TRIGGER_TYPES = new Set(['market-open', 'market-close', 'calendar-warning']);

const sendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Cok fazla bildirim gonderim denemesi yapildi. Lutfen biraz sonra tekrar deneyin.',
  },
});

async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token gerekli' });
  }

  const token = authHeader.split(' ')[1];
  const verified = await authService.verifyToken(token);

  if (!verified.success) {
    return res.status(401).json(verified);
  }

  if (verified.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Bu alan yalnizca admin kullanicilar icindir',
    });
  }

  req.user = verified.user;
  next();
}

router.use(requireAdmin);

router.get('/notifications/summary', (req, res) => {
  res.json({
    ...pushNotificationService.getSummary(),
    currentUser: req.user,
  });
});

router.post('/notifications/broadcast', sendLimiter, async (req, res) => {
  const result = await pushNotificationService.broadcastNotification({
    ...req.body,
    sender: req.user,
  });

  res.status(result.statusCode || (result.success ? 200 : 500)).json(result);
});

// Manuel broadcast tetikleme — admin paneli için.
//   POST /api/admin/trigger-notification?type=market-open|market-close|calendar-warning
// type=calendar-warning yarın yüksek-etkili olay yoksa null döner; bu beklenen davranış.
// market-open/market-close TR resmi tatil günlerinde de null döner.
router.post('/trigger-notification', sendLimiter, async (req, res) => {
  const type = String(req.query.type || req.body?.type || '').trim();
  if (!VALID_TRIGGER_TYPES.has(type)) {
    return res.status(400).json({
      success: false,
      error: `Geçersiz type. Beklenen: ${[...VALID_TRIGGER_TYPES].join(' | ')}`,
    });
  }

  try {
    const result = await cronJobsService.triggerNotification(type);
    if (result == null) {
      return res.json({
        success: true,
        triggered: type,
        skipped: true,
        message: type === 'calendar-warning'
          ? 'Yarın için yüksek-etkili veri yok — bildirim atılmadı.'
          : 'Bugün resmi tatil — bildirim atılmadı.',
      });
    }
    return res.json({ success: true, triggered: type, ...result });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Manuel: o gün için gün sonu performansını hesapla ve snapshot'a yaz.
//   POST /api/admin/compute-performance?date=YYYY-MM-DD
router.post('/compute-performance', async (req, res) => {
  try {
    const date = req.query.date || req.body?.date;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'date YYYY-MM-DD formatında olmalı' });
    }
    const result = await dailyPerformanceService.computeAndStore(date);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
