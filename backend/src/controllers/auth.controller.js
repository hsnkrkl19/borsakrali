/**
 * Auth Controller - BORSA KRALI
 */

const authService = require('../services/authService');
const logger = require('../utils/logger');

function readBearerToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.split(' ')[1];
}

class AuthController {
  async register(req, res) {
    try {
      const {
        firstName,
        lastName,
        phone,
        email,
        password,
        acceptTerms,
        acceptPrivacy,
      } = req.body;

      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Ad, soyad, e-posta ve sifre gerekli',
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(email || '').trim())) {
        return res.status(400).json({
          success: false,
          error: 'Gecerli bir e-posta adresi girin',
        });
      }

      if (phone) {
        const digits = String(phone).replace(/\D/g, '');
        if (digits.length !== 10 || digits[0] !== '5') {
          return res.status(400).json({
            success: false,
            error: 'Telefon numarasi 5XX XXX XX XX formatinda olmali',
          });
        }
      }

      const result = await authService.registerFromWeb({
        firstName,
        lastName,
        phone: phone?.replace(/\D/g, ''),
        email,
        password,
        acceptTerms,
        acceptPrivacy,
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.status(201).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error('Register error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'E-posta ve sifre gerekli',
        });
      }

      const result = await authService.initiateLogin(email, password);

      if (!result.success) {
        return res.status(401).json(result);
      }

      return res.json({
        success: true,
        token: result.token,
        user: result.user,
        message: 'Giris basarili!',
      });
    } catch (error) {
      logger.error('Login error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async verifyCode(req, res) {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({
          success: false,
          error: 'E-posta ve dogrulama kodu gerekli',
        });
      }

      if (typeof authService.verifyLoginCode !== 'function') {
        return res.status(501).json({
          success: false,
          error: 'Kod dogrulama bu surumde aktif degil',
        });
      }

      const result = await authService.verifyLoginCode(email, code);

      if (!result.success) {
        return res.status(401).json(result);
      }

      return res.json({
        success: true,
        token: result.token,
        user: result.user,
        message: 'Giris basarili!',
      });
    } catch (error) {
      logger.error('Verify code error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async sendCode(req, res) {
    try {
      return res.json({
        success: true,
        message: 'Telegram botuna /giris yazarak dogrulama kodunuzu alin.',
      });
    } catch (error) {
      logger.error('Send code error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token gerekli',
        });
      }

      const result = await authService.verifyToken(refreshToken);

      if (!result.success) {
        return res.status(401).json(result);
      }

      return res.json({
        success: true,
        user: result.user,
      });
    } catch (error) {
      logger.error('Refresh token error:', error);
      return res.status(401).json({ success: false, error: error.message });
    }
  }

  async me(req, res) {
    try {
      const token = readBearerToken(req);

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Token gerekli',
        });
      }

      const result = await authService.verifyToken(token);

      if (!result.success) {
        return res.status(401).json(result);
      }

      return res.json({
        success: true,
        user: result.user,
      });
    } catch (error) {
      logger.error('Me error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async changePassword(req, res) {
    try {
      const token = readBearerToken(req);

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Token gerekli',
        });
      }

      const verified = await authService.verifyToken(token);
      if (!verified.success) {
        return res.status(401).json(verified);
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Mevcut sifre ve yeni sifre gerekli',
        });
      }

      const result = await authService.changePassword(
        verified.user.id,
        currentPassword,
        newPassword
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error) {
      logger.error('Change password error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async logout(req, res) {
    try {
      return res.json({
        success: true,
        message: 'Cikis yapildi',
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async requestAccountDeletion(req, res) {
    try {
      const { email, note } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'E-posta gerekli',
        });
      }

      const result = await authService.createDeletionRequest({ email, note });
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error) {
      logger.error('Account deletion request error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  async deleteAccount(req, res) {
    try {
      const token = readBearerToken(req);

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Token gerekli',
        });
      }

      const verified = await authService.verifyToken(token);

      if (!verified.success) {
        return res.status(401).json(verified);
      }

      const result = await authService.deleteUserAccount(verified.user.id);
      if (!result.success) {
        return res.status(404).json(result);
      }

      return res.json({
        success: true,
        message: 'Hesabiniz silindi',
      });
    } catch (error) {
      logger.error('Delete account error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new AuthController();
