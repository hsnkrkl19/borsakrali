const express = require('express');
const rateLimit = require('express-rate-limit');

const authService = require('../services/authService');
const pushNotificationService = require('../services/pushNotificationService');

const router = express.Router();

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Cok fazla push kaydi denemesi yapildi. Biraz sonra tekrar deneyin.',
  },
});

function getOptionalUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  const verified = authService.verifyToken(token);
  return verified.success ? verified.user : null;
}

router.get('/status', (req, res) => {
  res.json(pushNotificationService.getSummary());
});

router.post('/register', registerLimiter, async (req, res) => {
  const result = await pushNotificationService.registerDevice({
    ...req.body,
    user: getOptionalUser(req),
  });

  res.status(result.statusCode || (result.success ? 200 : 500)).json(result);
});

router.post('/unregister', registerLimiter, async (req, res) => {
  const result = await pushNotificationService.unregisterDevice(req.body);
  res.status(result.statusCode || (result.success ? 200 : 500)).json(result);
});

module.exports = router;
