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

async function getOptionalUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  const verified = await authService.verifyToken(token);
  return verified.success ? verified.user : null;
}

router.get('/status', (req, res) => {
  res.json(pushNotificationService.getSummary());
});

// GEÇİCİ — frontend push akışını debug etmek için. Production'da kaldırılacak.
const debugLogs = [];
router.post('/debug-log', (req, res) => {
  const entry = { ...req.body, ip: req.ip, at: new Date().toISOString() };
  debugLogs.push(entry);
  if (debugLogs.length > 50) debugLogs.shift();
  console.log('[PUSH DEBUG]', JSON.stringify(entry));
  res.json({ success: true });
});
router.get('/debug-log', (req, res) => {
  res.json({ logs: debugLogs.slice(-30) });
});

// GEÇİCİ test broadcast — kayıtlı tüm cihazlara bildirim atar.
// Production'da silinecek.
router.post('/test-broadcast', async (req, res) => {
  const result = await pushNotificationService.broadcastNotification({
    title: req.body?.title || 'Borsa Kralı — Test Bildirimi',
    body: req.body?.body || 'FCM kurulumu başarılı! 🎉 Bildirim sistemi çalışıyor.',
    path: req.body?.path || '/',
  });
  res.json(result);
});

// FCM canlı test — admin SDK auth durumunu net görmek için
router.get('/diagnose', async (req, res) => {
  const result = { ok: false, steps: [] };
  try {
    const summary = pushNotificationService.getSummary();
    result.steps.push({ step: 'getSummary', ok: summary.success, configured: summary.configured });

    // Service account'ın project_id'sini açığa çıkar
    let saProjectId = null;
    try {
      const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
      if (inline) saProjectId = JSON.parse(inline).project_id;
      else if (b64) saProjectId = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')).project_id;
    } catch { /* ignore */ }
    result.steps.push({ step: 'serviceAccount.projectId', value: saProjectId });

    // Cihaz olmadan FCM auth'ı test eden minimum çağrı: dryRun mesaj
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      return res.json({ ...result, error: 'admin app yok' });
    }
    const messaging = admin.messaging();
    try {
      // Dummy token ile dryRun: token geçersiz olsa bile auth başarısızsa farklı hata gelir
      await messaging.send({
        token: 'dummy_token_for_auth_test',
        notification: { title: 'diagnose', body: 'test' },
      }, true /* dryRun */);
      result.steps.push({ step: 'fcm.send(dryRun)', ok: true });
      result.ok = true;
    } catch (e) {
      result.steps.push({
        step: 'fcm.send(dryRun)',
        ok: false,
        code: e?.code,
        errorInfo: e?.errorInfo,
        message: (e?.message || String(e)).slice(0, 500),
      });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, fatal: e?.message || String(e), steps: result.steps });
  }
});

router.post('/register', registerLimiter, async (req, res) => {
  const result = await pushNotificationService.registerDevice({
    ...req.body,
    user: await getOptionalUser(req),
  });

  res.status(result.statusCode || (result.success ? 200 : 500)).json(result);
});

router.post('/unregister', registerLimiter, async (req, res) => {
  const result = await pushNotificationService.unregisterDevice(req.body);
  res.status(result.statusCode || (result.success ? 200 : 500)).json(result);
});

module.exports = router;
