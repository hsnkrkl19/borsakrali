/**
 * Auth Routes - BORSA KRALI
 * Per.Tgm. Hasan KIRKIL
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

// Kayit - Telegram uzerinden yapilir
router.post('/register', authController.register);

// Giris - 1. Adim: E-posta ve sifre
router.post('/login', authController.login);

// Giris - 2. Adim: Telegram kodu dogrulama
router.post('/verify-code', authController.verifyCode);

// Kod gonder bilgisi
router.post('/send-code', authController.sendCode);

// Token yenileme
router.post('/refresh', authController.refreshToken);

// Mevcut kullanici bilgisi
router.get('/me', authController.me);

// Cikis
router.post('/logout', authController.logout);

// Web uzerinden hesap silme talebi
router.post('/account-deletion-request', authController.requestAccountDeletion);

// Uygulama icinden hesap silme
router.delete('/delete-account', authController.deleteAccount);

module.exports = router;
