const authService = require('../services/authService');

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token gerekli' });
    }

    const user = await authService.getUserByToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Geçersiz token' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = { authenticate };
