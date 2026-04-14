const express = require('express');
const rateLimit = require('express-rate-limit');

const authService = require('../services/authService');
const pushNotificationService = require('../services/pushNotificationService');

const router = express.Router();

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

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token gerekli' });
  }

  const token = authHeader.split(' ')[1];
  const verified = authService.verifyToken(token);

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

module.exports = router;
