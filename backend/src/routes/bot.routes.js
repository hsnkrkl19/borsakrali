/**
 * Altın Botu proxy rotaları — Node backend → Windows'taki Python/MT5 botu.
 *
 * TÜM uçlar admin korumalı: bot brokerın MT5 demo hesabına emir gönderdiği için
 * yalnızca admin (hsnkrkl19@gmail.com / ADMIN_EMAILS)
 * bu sayfayı görebilir ve komut gönderebilir. Tarayıcı same-origin /api/bot/*
 * çağırır; bu router bota (botClient) proxy'ler ve bot yanıtını olduğu gibi döner.
 *
 *   GET  /api/bot/status | positions | trades | events | config | stats | learn | strategies | scoreboard
 *        /api/bot/research/status | research/latest | health
 *   POST /api/bot/engine/start | engine/stop | config | account/bind_current_demo
 *        /api/bot/trade/open | trade/close | trade/close_all
 *        /api/bot/research/run | research/approve | research/rollback
 */

const express = require('express');
const router = express.Router();

const authService = require('../services/authService');
const botClient = require('../services/botClient');

async function requireAdmin(req, res, next) {
  try {
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
    return next();
  } catch (error) {
    return res.status(503).json({ ok: false, error: `Kimlik doğrulama servisi kullanılamıyor: ${error.message}` });
  }
}

// Bot çağrısını tek yerde hata-yönet: yapılandırılmamışsa 503, ulaşılamıyorsa 502.
function handle(promiseFactory) {
  return async (req, res) => {
    try {
      const data = await promiseFactory(req);
      return res.json(data);
    } catch (e) {
      if (e && e.code === 'DISABLED') {
        return res.status(503).json({ ok: false, error: `Bot API yapılandırılmadı: ${e.message}` });
      }
      const upstreamStatus = Number(e?.response?.status || 0);
      const upstreamDetail = e?.response?.data?.detail || e?.response?.data?.message;
      if (upstreamStatus === 400 || upstreamStatus === 409) {
        return res.status(upstreamStatus).json({
          ok: false,
          error: upstreamDetail || 'Bot isteği güvenlik kapısı tarafından reddedildi.',
        });
      }
      if (upstreamStatus === 401 || upstreamStatus === 403) {
        return res.status(502).json({
          ok: false,
          error: 'Bot API kimlik doğrulaması başarısız. Sunucu bağlantı anahtarını kontrol edin.',
        });
      }
      return res.status(502).json({
        ok: false,
        error: `Bota ulaşılamıyor: ${upstreamDetail || e.message}`,
      });
    }
  };
}

// VPS bu ucu çağırarak kendisine gelen site oturumunun hâlâ admin olduğunu
// doğrular. Yalnızca kimlik sonucu döner; bot verisi veya komut içermez.
router.get('/session/verify', requireAdmin, (req, res) => res.json({
  ok: true,
  role: 'admin',
  user_id: req.user.id,
}));

// Tüm bot rotaları admin.
router.use(requireAdmin);

const bearer = (req) => req.headers.authorization;

// ── Okuma uçları ───────────────────────────────────────────────────────────
router.get('/status', handle((req) => botClient.get('/api/status', undefined, bearer(req))));
router.get('/positions', handle((req) => botClient.get('/api/positions', undefined, bearer(req))));
router.get('/trades', handle((req) => botClient.get('/api/trades', { limit: req.query.limit || 100 }, bearer(req))));
router.get('/events', handle((req) => botClient.get('/api/events', { limit: req.query.limit || 100 }, bearer(req))));
router.get('/config', handle((req) => botClient.get('/api/config', undefined, bearer(req))));
router.get('/stats', handle((req) => botClient.get('/api/stats', undefined, bearer(req))));
router.get('/learn', handle((req) => botClient.get('/api/learn', undefined, bearer(req))));
router.get('/strategies', handle((req) => botClient.get('/api/strategies', undefined, bearer(req))));
router.get('/scoreboard', handle((req) => botClient.get('/api/scoreboard', undefined, bearer(req))));
router.get('/health', handle((req) => botClient.get('/api/health', undefined, bearer(req))));
router.get('/research/status', handle((req) => botClient.get('/api/research/status', undefined, bearer(req))));
router.get('/research/latest', handle((req) => botClient.get('/api/research/latest', undefined, bearer(req))));

// ── Komut uçları ───────────────────────────────────────────────────────────
router.post('/engine/start', handle((req) => botClient.post('/api/engine/start', undefined, bearer(req))));
router.post('/engine/stop', handle((req) => botClient.post('/api/engine/stop', undefined, bearer(req))));
router.post('/config', handle((req) => botClient.post('/api/config', req.body || {}, bearer(req))));
router.post('/account/bind_current_demo', handle((req) => botClient.post('/api/account/bind_current_demo', undefined, bearer(req))));
router.post('/trade/open', handle((req) => botClient.post('/api/trade/open', req.body || {}, bearer(req))));
router.post('/trade/close', handle((req) => botClient.post('/api/trade/close', req.body || {}, bearer(req))));
router.post('/trade/close_all', handle((req) => botClient.post('/api/trade/close_all', req.body || {}, bearer(req))));
router.post('/research/run', handle((req) => botClient.post('/api/research/run', undefined, bearer(req))));
router.post('/research/approve', handle((req) => botClient.post('/api/research/approve', req.body || {}, bearer(req))));
router.post('/research/rollback', handle((req) => botClient.post('/api/research/rollback', req.body || {}, bearer(req))));

module.exports = router;
