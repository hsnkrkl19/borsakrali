/**
 * Auth Routes - BORSA KRALI
 */

const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const authController = require('../controllers/auth.controller');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Cok fazla auth denemesi yapildi. Lutfen daha sonra tekrar deneyin.',
  },
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/verify-code', authLimiter, authController.verifyCode);
router.post('/send-code', authController.sendCode);
router.post('/refresh', authController.refreshToken);
router.get('/me', authController.me);
router.post('/change-password', authLimiter, authController.changePassword);
router.post('/logout', authController.logout);
router.post('/account-deletion-request', authController.requestAccountDeletion);
router.delete('/delete-account', authController.deleteAccount);

module.exports = router;
