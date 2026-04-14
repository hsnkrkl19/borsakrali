/**
 * Auth Controller - BORSA KRALI
 * Telegram 2FA ile kullanici giris sistemi
 * Per.Tgm. Hasan KIRKIL
 */

const authService = require('../services/authService');
const logger = require('../utils/logger');

class AuthController {
  // Web kayıt
  async register(req, res) {
    try {
      const { firstName, lastName, phone, email, password } = req.body;

      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ success: false, error: 'Ad, soyad, e-posta ve şifre gerekli' });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, error: 'Şifre en az 8 karakter olmalı' });
      }
      if (phone) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length !== 10 || digits[0] !== '5') {
          return res.status(400).json({ success: false, error: 'Telefon numarası 5XX XXX XX XX formatında olmalı' });
        }
      }

      const result = await authService.registerFromWeb({ firstName, lastName, phone: phone?.replace(/\D/g, ''), email, password });

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      logger.error('Register error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Giris 1. Adim - E-posta ve sifre kontrolu
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'E-posta ve sifre gerekli'
        });
      }

      const result = await authService.initiateLogin(email, password);

      if (!result.success) {
        return res.status(401).json(result);
      }

      res.json({
        success: true,
        token: result.token,
        user: result.user,
        message: 'Giris basarili!'
      });

    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Giris 2. Adim - Telegram'dan gelen kodu dogrula
  async verifyCode(req, res) {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({
          success: false,
          error: 'E-posta ve dogrulama kodu gerekli'
        });
      }

      const result = await authService.verifyLoginCode(email, code);

      if (!result.success) {
        return res.status(401).json(result);
      }

      res.json({
        success: true,
        token: result.token,
        user: result.user,
        message: 'Giris basarili!'
      });

    } catch (error) {
      logger.error('Verify code error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Telegram'dan kod isteme (site tetiklemez, bot tetikler)
  async sendCode(req, res) {
    try {
      res.json({
        success: true,
        message: 'Telegram botuna /giris yazarak dogrulama kodunuzu alin.'
      });
    } catch (error) {
      logger.error('Send code error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Token yenileme
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token gerekli'
        });
      }

      // JWT verify ile token yenile
      const result = authService.verifyToken(refreshToken);

      if (!result.success) {
        return res.status(401).json(result);
      }

      res.json({
        success: true,
        user: result.user
      });

    } catch (error) {
      logger.error('Refresh token error:', error);
      res.status(401).json({ success: false, error: error.message });
    }
  }

  // Mevcut kullanici bilgisi
  async me(req, res) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Token gerekli'
        });
      }

      const token = authHeader.split(' ')[1];
      const result = authService.verifyToken(token);

      if (!result.success) {
        return res.status(401).json(result);
      }

      res.json({
        success: true,
        user: result.user
      });

    } catch (error) {
      logger.error('Me error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // Cikis
  async logout(req, res) {
    try {
      res.json({
        success: true,
        message: 'Cikis yapildi'
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async requestAccountDeletion(req, res) {
    try {
      const { email, note } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'E-posta gerekli'
        });
      }

      const result = authService.createDeletionRequest({ email, note });
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('Account deletion request error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async deleteAccount(req, res) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Token gerekli'
        });
      }

      const token = authHeader.split(' ')[1];
      const verified = authService.verifyToken(token);

      if (!verified.success) {
        return res.status(401).json(verified);
      }

      const result = authService.deleteUserAccount(verified.user.id);
      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json({
        success: true,
        message: 'Hesabiniz silindi'
      });
    } catch (error) {
      logger.error('Delete account error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new AuthController();
