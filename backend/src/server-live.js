/**
 * BORSA KRALI - Canli Veri Sunucusu
 * Borsa Krali - Tum haklari saklidir.
 * Tum haklari saklidir. Yalnizca egitim maksadiyla kullanilacaktir.
 * 1 dakikada bir otomatik guncelleme
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
const axios = require('axios');
require('dotenv').config();

const liveDataService = require('./services/liveDataService');
const telegramService = require('./services/telegramService');
const socketService = require('./services/socketService');
const authService = require('./services/authService');
const fundamentalScoresService = require('./services/fundamentalScoresService');
const financialsRouter = require('../routes/financials');
const pushRoutes = require('./routes/push.routes');
const adminRoutes = require('./routes/admin.routes');
const pushNotificationService = require('./services/pushNotificationService');
const { allBistStocks, bist30Stocks, bist100Stocks, sectors } = require('./data/allBistStocks');

// Sinyal cache - tespit edilen sinyalleri sakla
let signalCache = [];
let lastSignalCheck = null;

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Cok fazla auth denemesi yapildi. Lutfen daha sonra tekrar deneyin.',
  }
});

// Socket.IO başlat
const io = socketService.initializeSocket(server);

// Admin broadcast → live in-app delivery to all connected clients
pushNotificationService.setBroadcastEmitter((entry) => {
  socketService.broadcastAnnouncement(entry);
});

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Google Identity Services popup'ı parent window ile postMessage
  // üzerinden konuşur. Helmet'in default 'same-origin' değeri bu
  // iletişimi keser → popup açılır ama callback gelmez (boş ekran).
  // 'same-origin-allow-popups' ile parent → popup haberleşmesi serbest.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", '*'],
      scriptSrc: [
        "'self'", "'unsafe-inline'", "'unsafe-eval'",
        '*.tradingview.com', 's3.tradingview.com',
        'cdn.tradingview.com', 'cdnjs.cloudflare.com',
        '*.cloudflare.com', 'cdn.jsdelivr.net',
        // Google Identity Services (Google ile giriş)
        'accounts.google.com', '*.gstatic.com',
        'apis.google.com',
      ],
      // GIS ve Google OAuth iframe/popup iletişimi için
      frameSrc: [
        "'self'", '*', '*.tradingview.com', 'data:',
        'accounts.google.com', '*.google.com',
      ],
      imgSrc: ["'self'", 'data:', 'blob:', '*'],
      connectSrc: ["'self'", '*', 'accounts.google.com', '*.googleapis.com'],
      styleSrc: ["'self'", "'unsafe-inline'", '*', 'accounts.google.com'],
      fontSrc: ["'self'", 'data:', '*'],
      workerSrc: ["'self'", 'blob:'],
      mediaSrc: ["'self'", '*'],
      objectSrc: ["'none'"],
    }
  }
}));
app.use(cors({
  origin: function(origin, callback) {
    // Allow all origins (ngrok, mobile apps, any client)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));
// Handle preflight
app.options('*', cors());

// === EXTRA HEADERS for Capacitor APK (https://localhost origin) ===
// Chrome 104+ Private Network Access requires this header on responses
// to allow requests from "private" origins (like https://localhost) to public servers.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  // Mobile WebView için ekstra güvence
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Takip listesi (memory'de)
let watchlist = ['THYAO', 'GARAN', 'ASELS', 'EREGL', 'BIMAS', 'KCHOL', 'TUPRS', 'SAHOL', 'AKBNK', 'SISE'];

// Mock user
const mockUser = {
  id: 1,
  name: 'Demo Kullanici',
  email: 'demo@borsakrali.com',
  role: 'premium'
};

// Health check
app.get('/health', (req, res) => {
  const lastUpdate = liveDataService.getLastUpdateTime();
  res.json({
    status: 'OK',
    mode: 'live',
    dataSource: 'Yahoo Finance',
    lastUpdate: lastUpdate ? lastUpdate.toISOString() : 'Henuz guncellenmedi',
    stockCount: liveDataService.getAllStocks().length,
    totalStocksInSystem: allBistStocks.length,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.0.0',
    author: 'Borsa Krali',
    copyright: 'Tum haklari saklidir. Yalnizca egitim maksadiyla kullanilacaktir.'
  });
});

app.get('/api/debug/invalid-symbols', (req, res) => {
  res.json(liveDataService.getInvalidSymbols());
});

// ============ FINANCIAL DATA ROUTES ============
app.use('/api/financials', financialsRouter);
app.use('/api/push', pushRoutes);
app.use('/api/admin', adminRoutes);

// Tüm kullanicilara açik duyuru listesi (admin tarafindan gönderilen
// broadcast bildirimlerinin geçmişi). Header bell + Duyurular paneli
// tarafindan kullanılır.
app.get('/api/notifications/announcements', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const since = req.query.since;
    const announcements = pushNotificationService.listAnnouncements({ limit, since });
    res.json({ success: true, announcements });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ AUTH ROUTES ============

// Kayit
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      username,
      email,
      password,
      acceptTerms,
      acceptPrivacy,
    } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ success: false, error: 'Tum alanlar gereklidir!' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Gecerli bir e-posta adresi girin!' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Sifre en az 8 karakter olmali!' });
    }

    if (phone) {
      const digits = String(phone).replace(/\D/g, '');
      if (digits.length !== 10 || digits[0] !== '5') {
        return res.status(400).json({ success: false, error: 'Telefon numarasi 5XX XXX XX XX formatinda olmali!' });
      }
    }

    const result = await authService.registerFromWeb({
      firstName,
      lastName,
      phone: phone ? String(phone).replace(/\D/g, '') : null,
      username: username || email.split('@')[0],
      email: email.toLowerCase(),
      password,
      acceptTerms,
      acceptPrivacy,
    });

    if (result.success) {
      res.status(201).json({ success: true, message: result.message, userId: result.userId });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Sunucu hatasi' });
  }
});

// Giris - Tek adim (sifre dogrulama + JWT)
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'E-posta ve sifre gerekli!' });
    }

    const result = await authService.initiateLogin(email, password);

    if (result.success) {
      res.json({
        success: true,
        token: result.token,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
        user: result.user,
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Sunucu hatasi' });
  }
});

// Google ile giris (Supabase ID token akisi)
app.post('/api/auth/google', authLimiter, async (req, res) => {
  try {
    const { idToken, id_token, accessToken, access_token } = req.body || {};
    const token = idToken || id_token;
    const accToken = accessToken || access_token;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Google ID token gerekli' });
    }

    const result = await authService.loginWithGoogleIdToken({
      idToken: token,
      accessToken: accToken,
    });

    if (!result.success) {
      return res.status(401).json(result);
    }

    return res.json({
      success: true,
      token: result.token,
      refreshToken: result.refreshToken,
      user: result.user,
      message: 'Google ile giris basarili!',
    });
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(500).json({ success: false, error: 'Sunucu hatasi' });
  }
});

// Sifre degistirme
app.post('/api/auth/change-password', authLimiter, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token gerekli' });
    }

    const token = authHeader.split(' ')[1];
    const verified = await authService.verifyToken(token);

    if (!verified.success) {
      return res.status(401).json(verified);
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Mevcut sifre ve yeni sifre gerekli'
      });
    }

    const result = await authService.changePassword(
      verified.user.id,
      currentPassword,
      newPassword
    );

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'Sunucu hatasi' });
  }
});

// Mevcut kullanici bilgisi
app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token gerekli' });
  }

  const token = authHeader.split(' ')[1];
  const result = await authService.verifyToken(token);

  if (result.success) {
    res.json({ success: true, user: result.user });
  } else {
    res.status(401).json(result);
  }
});

// Token yenileme — Supabase refresh_token ile yeni access_token al
app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = req.body?.refreshToken || req.body?.refresh_token;

  if (!refreshToken) {
    return res.status(400).json({ success: false, error: 'Refresh token gerekli' });
  }

  const result = await authService.refreshSession(refreshToken);

  if (result.success) {
    res.json({
      success: true,
      token: result.token,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      user: result.user,
    });
  } else {
    res.status(401).json(result);
  }
});

// Web uzerinden hesap silme talebi
app.post('/api/auth/account-deletion-request', async (req, res) => {
  try {
    const { email, note } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'E-posta gerekli' });
    }

    const result = await authService.createDeletionRequest({ email, note });
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Account deletion request error:', error);
    res.status(500).json({ success: false, error: 'Sunucu hatasi' });
  }
});

// Uygulama icinden hesap silme
app.delete('/api/auth/delete-account', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Token gerekli' });
    }

    const token = authHeader.split(' ')[1];
    const verified = await authService.verifyToken(token);

    if (!verified.success) {
      return res.status(401).json(verified);
    }

    const result = await authService.deleteUserAccount(verified.user.id);
    if (result.success) {
      res.json({ success: true, message: 'Hesabiniz silindi' });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ success: false, error: 'Sunucu hatasi' });
  }
});

// ============ SUBSCRIPTION ROUTES ============

const SUBSCRIPTION_PLANS = [
  {
    id: 'free',
    name: 'Ücretsiz',
    price: 0,
    currency: 'TRY',
    period: null,
    features: ['10 kullanım/gün', 'Banner reklam', 'Temel piyasa verileri'],
    limits: { dailyUses: 10, monthlyUses: null },
    hasAds: true,
    badge: null,
  },
  {
    id: 'starter_monthly',
    name: 'Başlangıç',
    price: 50,
    currency: 'TRY',
    period: 'monthly',
    features: ['Sınırsız kullanım', 'Banner reklam', 'Tüm analizler', 'Teknik & Temel AI'],
    limits: { dailyUses: null, monthlyUses: null },
    hasAds: true,
    badge: 'Popüler',
  },
  {
    id: 'pro_monthly',
    name: 'Pro',
    price: 300,
    currency: 'TRY',
    period: 'monthly',
    features: ['Sınırsız kullanım', 'Reklam YOK', 'Tüm özellikler', 'Öncelikli destek'],
    limits: { dailyUses: null, monthlyUses: null },
    hasAds: false,
    badge: 'En İyi',
  },
  {
    id: 'elite_once',
    name: 'Elite Paket',
    price: 50,
    currency: 'TRY',
    period: 'once',
    features: ['50 kullanım/ay', 'Banner reklam', 'Tüm analizler', 'Tek seferlik ödeme'],
    limits: { dailyUses: null, monthlyUses: 50 },
    hasAds: true,
    badge: 'Tek Ödeme',
  },
  {
    id: 'premium_once',
    name: 'Premium Paket',
    price: 150,
    currency: 'TRY',
    period: 'once',
    features: ['150 kullanım/ay', 'Banner reklam', 'Tüm özellikler', 'Tek seferlik ödeme'],
    limits: { dailyUses: null, monthlyUses: 150 },
    hasAds: true,
    badge: 'Değer',
  },
  {
    id: 'lifetime',
    name: 'Ömür Boyu',
    price: 1500,
    currency: 'TRY',
    period: 'lifetime',
    features: ['Sınırsız kullanım', 'Reklam YOK', 'Tüm özellikler', 'Gelecek güncellemeler', 'Ömür boyu erişim'],
    limits: { dailyUses: null, monthlyUses: null },
    hasAds: false,
    badge: 'En Değerli',
  },
];

// Plan listesi
app.get('/api/subscription/plans', (req, res) => {
  res.json({ success: true, plans: SUBSCRIPTION_PLANS });
});

// Demo kullanıcı için sabit kimlik — Login.jsx'teki "Demo Hesapla Keşfet"
// butonu 'demo-token-full-access' token'ı ile login() çağırıyor.
// Bu token Supabase tarafında geçerli değil, bu yüzden burada özel olarak
// karşılayıp /portfolio, /notes, /requests gibi korumalı uçların çalışmasını
// sağlıyoruz (aksi halde 401 → frontend interceptor /login'e atıyor).
// 'demo-token' eski sürümlerden kalmış kullanıcıların localStorage'ında hâlâ
// olabiliyor — ikisini de kabul ediyoruz, yoksa eski demo'yla giriş yapmış
// kullanıcılar /takip-listem'e tıklayınca 401 alıp /login'e atılıyor.
const DEMO_TOKENS = new Set(['demo-token-full-access', 'demo-token']);
const DEMO_USER = {
  id: 'demo',
  email: 'demo@borsakrali.com',
  firstName: 'Demo',
  lastName: 'Kullanıcı',
  phone: null,
  plan: 'pro',
  planExpiry: null,
  role: 'demo',
  isDemo: true,
};

// Auth middleware for subscription
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token gerekli' });
  }
  const token = authHeader.split(' ')[1];
  if (DEMO_TOKENS.has(token)) {
    req.user = DEMO_USER;
    return next();
  }
  const result = await authService.verifyToken(token);
  if (!result.success) return res.status(401).json(result);
  req.user = result.user;
  next();
}

// Kullanicinin aktif plan durumu
app.get('/api/subscription/status', requireAuth, async (req, res) => {
  const status = await authService.getSubscriptionStatus(req.user.id);
  if (!status) return res.status(404).json({ success: false, error: 'Kullanici bulunamadi' });
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === status.plan) || SUBSCRIPTION_PLANS[0];
  res.json({ success: true, ...status, planDetails: plan });
});

// Plan yukseltme (placeholder — gercek odeme sonra)
app.post('/api/subscription/upgrade', requireAuth, async (req, res) => {
  const { planId } = req.body;
  const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId);
  if (!plan) return res.status(400).json({ success: false, error: 'Gecersiz plan' });
  if (planId === 'free') return res.status(400).json({ success: false, error: 'Free plana gecis yapilamaz' });

  // Monthly plan expiry = 30 days from now
  let expiry = null;
  if (plan.period === 'monthly') {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    expiry = d.toISOString();
  }

  const result = await authService.updateUserPlan(req.user.id, planId, expiry);
  if (!result.success) return res.status(500).json(result);

  res.json({
    success: true,
    message: `${plan.name} planına geçiş yapıldı!`,
    plan: planId,
    planExpiry: expiry,
    note: 'Ödeme sistemi yakında aktif olacak. Şu an test modundadır.'
  });
});

// ============ MARKET ROUTES ============

// BIST 100 Endeksi
app.get('/api/market/bist100', async (req, res) => {
  try {
    const bist100 = liveDataService.getBist100();
    if (!bist100) {
      // Cache henüz dolmadı — anında 503 dön, arka plan güncelleme dolduracak
      return res.status(503).json({ error: 'Veri yukleniyor, lutfen 10 saniye sonra tekrar deneyin' });
    }
    res.json(bist100);
  } catch (error) {
    console.error('BIST 100 hatasi:', error);
    res.status(500).json({ error: 'Veri alinamadi' });
  }
});

// BIST 30 Endeksi
app.get('/api/market/bist30', async (req, res) => {
  try {
    const bist30 = liveDataService.getBist30();
    if (!bist30) {
      return res.status(503).json({ error: 'Veri yukleniyor, lutfen 10 saniye sonra tekrar deneyin' });
    }
    res.json(bist30);
  } catch (error) {
    console.error('BIST 30 hatasi:', error);
    res.status(500).json({ error: 'Veri alinamadi' });
  }
});

// Canli veri - BIST 30 (heatmap icin)
app.get('/api/market/live', async (req, res) => {
  try {
    const stocks = liveDataService.getBist30Stocks();

    // Eger cache bossa, bist30Stocks'u dondur
    if (stocks.every(s => !s.price)) {
      const liveStocks = await liveDataService.updateLiveStocks();
      res.json({
        stocks: liveStocks,
        lastUpdate: new Date().toISOString(),
        count: liveStocks.length
      });
    } else {
      res.json({
        stocks,
        lastUpdate: liveDataService.getLastUpdateTime()?.toISOString(),
        count: stocks.length
      });
    }
  } catch (error) {
    console.error('Canli veri hatasi:', error);
    res.status(500).json({ error: 'Canli veri alinamadi' });
  }
});

// Tum hisseler
app.get('/api/market/stocks', (req, res) => {
  const { sector, market, page = 1, limit = 100, sort = 'changePercent', order = 'desc' } = req.query;

  let stocks = liveDataService.getAllStocks();

  // Eger cache bossa, allBistStocks listesini dondur
  if (stocks.length === 0) {
    stocks = allBistStocks.map(s => ({
      ...s,
      price: null,
      change: null,
      changePercent: null,
      loading: true
    }));
  }

  // Sektor filtresi
  if (sector) {
    stocks = stocks.filter(s => s.sector === sector);
  }

  // Market filtresi (BIST30, BIST100, BISTSTARS)
  if (market) {
    stocks = stocks.filter(s => s.market === market);
  }

  // Siralama
  const sortField = sort || 'changePercent';
  const sortOrder = order === 'asc' ? 1 : -1;

  stocks.sort((a, b) => {
    const aVal = a[sortField] || 0;
    const bVal = b[sortField] || 0;
    return (bVal - aVal) * sortOrder;
  });

  // Sayfalama
  const startIdx = (parseInt(page) - 1) * parseInt(limit);
  const paginatedStocks = stocks.slice(startIdx, startIdx + parseInt(limit));

  res.json({
    stocks: paginatedStocks,
    total: stocks.length,
    page: parseInt(page),
    totalPages: Math.ceil(stocks.length / parseInt(limit)),
    lastUpdate: liveDataService.getLastUpdateTime()?.toISOString()
  });
});

// BIST 30 hisseleri
app.get('/api/market/stocks/bist30', (req, res) => {
  const stocks = liveDataService.getBist30Stocks();
  res.json({
    stocks,
    count: stocks.length,
    lastUpdate: liveDataService.getLastUpdateTime()?.toISOString()
  });
});

// BIST 100 hisseleri
app.get('/api/market/stocks/bist100', (req, res) => {
  const stocks = liveDataService.getBist100Stocks();
  res.json({
    stocks,
    count: stocks.length,
    lastUpdate: liveDataService.getLastUpdateTime()?.toISOString()
  });
});

// Piyasa nefesi (market breadth) — BIST100 içinde gün içi yükselen / düşen sayısı.
// Dashboard üst stat chip'leri için kullanılır. Top-5 listesi değil, gerçek
// piyasa genişliği göstergesidir.
app.get('/api/market/breadth', (req, res) => {
  const stocks = liveDataService.getBist100Stocks();
  let up = 0, down = 0, unchanged = 0;
  for (const s of stocks) {
    const cp = s.changePercent;
    if (typeof cp !== 'number' || isNaN(cp)) continue;
    if (cp > 0) up++;
    else if (cp < 0) down++;
    else unchanged++;
  }
  const total = up + down + unchanged;
  const ratio = (up + down) > 0 ? Math.round((up / (up + down)) * 100) : 50;
  res.json({
    universe: 'BIST100',
    up, down, unchanged, total,
    ratio, // yükselen / (yükselen + düşen) — yatay piyasada %50
    lastUpdate: liveDataService.getLastUpdateTime()?.toISOString(),
  });
});

// En cok kazananlar
app.get('/api/market/gainers', (req, res) => {
  const { limit = 10 } = req.query;
  const stocks = liveDataService.getTopGainers(parseInt(limit));
  res.json({ stocks, count: stocks.length });
});

// En cok kaybedenler
app.get('/api/market/losers', (req, res) => {
  const { limit = 10 } = req.query;
  const stocks = liveDataService.getTopLosers(parseInt(limit));
  res.json({ stocks, count: stocks.length });
});

// En aktif hisseler
app.get('/api/market/active', (req, res) => {
  const { limit = 10 } = req.query;
  const stocks = liveDataService.getMostActive(parseInt(limit));
  res.json({ stocks, count: stocks.length });
});

// Hisse arama
app.get('/api/market/stocks/search', (req, res) => {
  const { q } = req.query;

  if (!q || q.length < 1) {
    return res.json({ stocks: [] });
  }

  const results = liveDataService.searchStocks(q);
  res.json({ stocks: results.slice(0, 20) });
});

function getCryptoYahooSymbol(symbol) {
  return `${symbol.toUpperCase().replace('-USD', '')}-USD`;
}

async function buildCryptoMarketSnapshot(symbol) {
  const normalizedSymbol = symbol.toUpperCase().replace('-USD', '');
  const historicalData = await liveDataService.fetchHistoricalData(getCryptoYahooSymbol(normalizedSymbol), '5d', '1d');

  if (!historicalData || historicalData.length === 0) {
    return null;
  }

  const lastBar = historicalData[historicalData.length - 1];
  const previousBar = historicalData.length > 1 ? historicalData[historicalData.length - 2] : lastBar;
  const previousClose = previousBar?.close ?? lastBar.close;
  const change = Number(lastBar.close) - Number(previousClose || 0);
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;

  return {
    symbol: normalizedSymbol,
    name: normalizedSymbol,
    sector: 'Kripto Para',
    market: 'Crypto',
    price: lastBar.close,
    previousClose,
    change: +change.toFixed(2),
    changePercent: +changePercent.toFixed(2),
    open: lastBar.open,
    high: lastBar.high,
    low: lastBar.low,
    volume: lastBar.volume || 0,
    timestamp: new Date(lastBar.timestamp || Date.now()).toISOString()
  };
}

// Hisse detay
app.get('/api/market/stock/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();
  const isCrypto = (req.query.type || '').toLowerCase() === 'crypto';

  try {
    if (isCrypto) {
      const cryptoSnapshot = await buildCryptoMarketSnapshot(upperSymbol);
      if (!cryptoSnapshot) {
        return res.status(404).json({ error: `${upperSymbol} bulunamadi` });
      }

      return res.json(cryptoSnapshot);
    }

    let stock = liveDataService.getStock(upperSymbol);

    if (!stock) {
      const data = await liveDataService.fetchYahooData(upperSymbol);
      const stockInfo = allBistStocks.find(s => s.symbol === upperSymbol);

      if (!data || !stockInfo) {
        return res.status(404).json({ error: `${upperSymbol} bulunamadi` });
      }

      stock = { ...stockInfo, ...data };
    }

    res.json(stock);
  } catch (error) {
    console.error(`Hisse detay hatasi ${upperSymbol}:`, error);
    res.status(500).json({ error: 'Veri alinamadi' });
  }
});

// Historik veri
app.get('/api/market/stock/:symbol/historical', async (req, res) => {
  const { symbol } = req.params;
  const { period = '3mo', interval = '1d' } = req.query;
  const isCrypto = (req.query.type || '').toLowerCase() === 'crypto';

  try {
    const marketSymbol = isCrypto ? getCryptoYahooSymbol(symbol) : symbol.toUpperCase();
    const data = await liveDataService.fetchHistoricalData(marketSymbol, period, interval);

    if (!data) {
      return res.status(404).json({ error: 'Gecmis veri bulunamadi' });
    }

    res.json({
      symbol: symbol.toUpperCase(),
      period,
      interval,
      data
    });
  } catch (error) {
    console.error(`Historical veri hatasi ${symbol}:`, error);
    res.status(500).json({ error: 'Veri alinamadi' });
  }
});

// Indikatorler
app.get('/api/market/stock/:symbol/indicators', async (req, res) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();
  const isCrypto = (req.query.type || '').toLowerCase() === 'crypto';

  try {
    const marketSymbol = isCrypto ? getCryptoYahooSymbol(upperSymbol) : upperSymbol;
    const historicalData = await liveDataService.fetchHistoricalData(marketSymbol, '1y', '1d');

    if (!historicalData || historicalData.length < 50) {
      return res.status(400).json({ error: 'Yeterli veri yok' });
    }

    const indicators = liveDataService.calculateIndicators(historicalData);

    if (!indicators) {
      return res.status(400).json({ error: 'Indikatorler hesaplanamadi' });
    }

    const stockInfo = isCrypto
      ? { name: upperSymbol, sector: 'Kripto Para', market: 'Crypto' }
      : allBistStocks.find(s => s.symbol === upperSymbol);

    res.json({
      symbol: upperSymbol,
      name: stockInfo?.name,
      sector: stockInfo?.sector,
      market: stockInfo?.market,
      ...indicators
    });
  } catch (error) {
    console.error(`Indikator hatasi ${symbol}:`, error);
    res.status(500).json({ error: 'Indikatorler hesaplanamadi' });
  }
});

// Sektorler
app.get('/api/market/sectors', (req, res) => {
  const stocks = liveDataService.getAllStocks();

  const sectorMap = new Map();

  stocks.forEach(stock => {
    if (!sectorMap.has(stock.sector)) {
      sectorMap.set(stock.sector, {
        count: 0,
        totalChange: 0,
        totalVolume: 0,
        topGainer: null,
        topLoser: null
      });
    }

    const sector = sectorMap.get(stock.sector);
    const safeChange = Number.isFinite(stock.changePercent) ? stock.changePercent : 0;
    const candidateStock = {
      symbol: stock.symbol,
      name: stock.name,
      change: safeChange
    };

    sector.count++;
    sector.totalChange += safeChange;
    sector.totalVolume += stock.volume || 0;

    if (!sector.topGainer || safeChange > sector.topGainer.change) {
      sector.topGainer = candidateStock;
    }

    if (!sector.topLoser || safeChange < sector.topLoser.change) {
      sector.topLoser = candidateStock;
    }
  });

  const sectorPerformance = Array.from(sectorMap.entries())
    .map(([sector, data]) => {
      const change = +(data.totalChange / data.count).toFixed(2);
      const featuredStock = change >= 0 ? data.topGainer : data.topLoser;

      return {
        sector,
        stockCount: data.count,
        change,
        volume: data.totalVolume,
        featuredStock: featuredStock ? {
          symbol: featuredStock.symbol,
          name: featuredStock.name,
          change: +featuredStock.change.toFixed(2)
        } : null
      };
    })
    .sort((a, b) => b.change - a.change);

  res.json({ sectors: sectorPerformance });
});

// Signals cache
let signalsCache = null;
let signalsCacheTime = 0;
const SIGNALS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function computeSignals() {
  const stocks = liveDataService.getAllStocks();
  const signals = [];
  // Fetch historical data in parallel batches of 5 to avoid flooding
  const BATCH = 5;
  const subset = stocks.slice(0, 30);
  for (let i = 0; i < subset.length; i += BATCH) {
    const batch = subset.slice(i, i + BATCH);
    await Promise.all(batch.map(async (stock) => {
      try {
        const historicalData = await liveDataService.fetchHistoricalData(stock.symbol, '3mo', '1d');
        if (!historicalData || historicalData.length < 50) return;
        const indicators = liveDataService.calculateIndicators(historicalData);
        if (!indicators) return;
        if (indicators.rsi < 30) signals.push({ id: signals.length + 1, stockSymbol: stock.symbol, stockName: stock.name, sector: stock.sector, strategy: 'RSI Signal', strategyDescription: 'RSI asiri satim bolgesinde', status: 'active', detectionPrice: stock.price, currentPrice: stock.price, changePercent: stock.changePercent, rsi: indicators.rsi, detectionDate: new Date().toISOString() });
        if (indicators.macd > indicators.macdSignal && indicators.macdHistogram > 0) signals.push({ id: signals.length + 1, stockSymbol: stock.symbol, stockName: stock.name, sector: stock.sector, strategy: 'MACD Crossover', strategyDescription: 'MACD sinyal cizgisinin uzerinde', status: 'active', detectionPrice: stock.price, currentPrice: stock.price, changePercent: stock.changePercent, macd: indicators.macd, macdSignal: indicators.macdSignal, detectionDate: new Date().toISOString() });
        if (stock.price > indicators.ema21 && indicators.ema5 > indicators.ema21) signals.push({ id: signals.length + 1, stockSymbol: stock.symbol, stockName: stock.name, sector: stock.sector, strategy: 'EMA Crossover', strategyDescription: 'EMA 5/21 pozitif kesisim', status: 'active', detectionPrice: stock.price, currentPrice: stock.price, changePercent: stock.changePercent, ema5: indicators.ema5, ema21: indicators.ema21, detectionDate: new Date().toISOString() });
        if (stock.price < indicators.bollingerLower) signals.push({ id: signals.length + 1, stockSymbol: stock.symbol, stockName: stock.name, sector: stock.sector, strategy: 'Bollinger Oversold', strategyDescription: 'Fiyat alt Bollinger bandinin altinda', status: 'active', detectionPrice: stock.price, currentPrice: stock.price, changePercent: stock.changePercent, bollingerLower: indicators.bollingerLower, detectionDate: new Date().toISOString() });
      } catch (e) { /* ignore */ }
    }));
  }
  return signals;
}

// Gunluk sinyaller
app.get('/api/market/signals', async (req, res) => {
  const { strategy, status, limit = 50 } = req.query;

  // Serve cached signals if fresh
  if (signalsCache && (Date.now() - signalsCacheTime) < SIGNALS_CACHE_TTL) {
    let filtered = signalsCache;
    if (strategy) filtered = filtered.filter(s => s.strategy === strategy);
    if (status) filtered = filtered.filter(s => s.status === status);
    return res.json({ signals: filtered.slice(0, parseInt(limit)) });
  }

  // Compute fresh signals, cache them, then respond
  const computed = await computeSignals();
  signalsCache = computed;
  signalsCacheTime = Date.now();

  let filteredSignals = computed;
  if (strategy) filteredSignals = filteredSignals.filter(s => s.strategy === strategy);
  if (status) filteredSignals = filteredSignals.filter(s => s.status === status);

  res.json({ signals: filteredSignals.slice(0, parseInt(limit)) });
});

// Algoritma performansi - gercek canli verilerden hesaplanir
app.get('/api/market/algorithm-performance', (req, res) => {
  const allStocks = liveDataService.getAllStocks();
  const signals = signalsCache || [];

  // Aktif sinyalleri saydir
  const activeTracks = signals.length;

  // Stratejilere gore sinyal sayimi
  const strategyMap = {};
  signals.forEach(sig => {
    if (!strategyMap[sig.strategy]) strategyMap[sig.strategy] = { signals: 0, positive: 0, totalChange: 0 };
    strategyMap[sig.strategy].signals++;
    const change = sig.changePercent || 0;
    if (change > 0) strategyMap[sig.strategy].positive++;
    strategyMap[sig.strategy].totalChange += change;
  });

  // Strateji listesi
  const strategies = Object.entries(strategyMap).map(([name, data]) => ({
    name,
    signals: data.signals,
    successful: data.positive,
    successRate: data.signals > 0 ? +((data.positive / data.signals) * 100).toFixed(1) : 0,
    avgReturn: data.signals > 0 ? +(data.totalChange / data.signals).toFixed(2) : 0,
  })).sort((a, b) => b.successRate - a.successRate);

  // En iyi performans gosteren hisseler (canli degisimden)
  const topPerformers = [...allStocks]
    .filter(s => s.changePercent != null && s.changePercent > 0)
    .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))
    .slice(0, 6)
    .map(s => {
      const matchedSignal = signals.find(sig => sig.stockSymbol === s.symbol);
      return {
        symbol: s.symbol,
        strategy: matchedSignal ? matchedSignal.strategy : 'EMA Crossover',
        return: +(s.changePercent || 0).toFixed(2),
        days: 1
      };
    });

  const champion = topPerformers[0] || null;

  // Ozet istatistikler
  const positiveSignals = signals.filter(s => (s.changePercent || 0) > 0).length;
  const totalChange = signals.reduce((sum, s) => sum + (s.changePercent || 0), 0);
  const successRate = signals.length > 0 ? +((positiveSignals / signals.length) * 100).toFixed(1) : 0;
  const avgReturn = signals.length > 0 ? +(totalChange / signals.length).toFixed(2) : 0;

  res.json({
    summary: {
      activeTracks,
      totalSuccessful: positiveSignals,
      successRate,
      totalReturn: +(allStocks.reduce((sum, s) => sum + (s.changePercent || 0), 0) / Math.max(1, allStocks.length)).toFixed(2),
      avgReturn,
      totalSignals: signals.length,
    },
    champion,
    topPerformers,
    strategies: strategies.length > 0 ? strategies : [
      { name: 'EMA Crossover', signals: 0, successful: 0, successRate: 0, avgReturn: 0 },
      { name: 'RSI Signal', signals: 0, successful: 0, successRate: 0, avgReturn: 0 },
      { name: 'MACD Crossover', signals: 0, successful: 0, successRate: 0, avgReturn: 0 },
    ],
    lastUpdate: new Date().toISOString(),
  });
});

// Batch quotes
app.post('/api/market/batch-quotes', (req, res) => {
  const { symbols } = req.body;

  if (!Array.isArray(symbols)) {
    return res.status(400).json({ error: 'Symbols array required' });
  }

  const quotes = symbols.map(symbol => liveDataService.getStock(symbol.toUpperCase())).filter(Boolean);

  res.json({ quotes });
});

// ============ COMMODITY & FX ROUTES ============
// Yahoo Finance sembolleri: GC=F (Altın USD), SI=F (Gümüş USD), XAUTRY=X (Altın TL), USDTRY=X (Dolar/TL)

// In-memory cache
let commodityCache = {};
let commodityLastUpdate = null;
const COMMODITY_CACHE_TTL = 5 * 60 * 1000; // 5 dakika
const GRAMS_PER_TROY_OUNCE = 31.1034768;

function convertOunceTlToGramTl(value, digits = 2) {
  return Number.isFinite(value)
    ? +(value / GRAMS_PER_TROY_OUNCE).toFixed(digits)
    : null;
}

const COMMODITIES = [
  { symbol: 'GC=F',    key: 'gold_usd',   name: 'Altın (Ons)',  unit: 'USD/oz' },
  { symbol: 'SI=F',    key: 'silver_usd', name: 'Gümüş (Ons)',  unit: 'USD/oz' },
  { symbol: 'USDTRY=X',key: 'usd_try',   name: 'Dolar/TL',     unit: 'TL'     },
  // gold_try = hesaplanan değer (GC=F × USDTRY=X)
];

async function fetchCommodityPrice(yahooSymbol) {
  try {
    // GC=F → encode edilmiş URL: GC%3DF
    const encoded = encodeURIComponent(yahooSymbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=1d`;
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    const meta = response.data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    const prev  = meta.previousClose || meta.chartPreviousClose || price;
    const change = price - prev;
    return {
      price: +price.toFixed(4),
      change: +change.toFixed(4),
      changePercent: +(change / prev * 100).toFixed(2),
      previousClose: +prev.toFixed(4),
      high: meta.regularMarketDayHigh || null,
      low:  meta.regularMarketDayLow  || null,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error(`Commodity fetch hatasi ${yahooSymbol}:`, err.message);
    return null;
  }
}

async function fetchCommodityHistoricalSeries(yahooSymbol, range, interval) {
  const encoded = encodeURIComponent(yahooSymbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=${interval || '1d'}&range=${range}`;

  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 15000
  });

  const result = response.data?.chart?.result?.[0];
  if (!result) return null;

  const timestamps = result.timestamp || [];
  const quotes = result.indicators?.quote?.[0] || {};

  return timestamps
    .map((ts, i) => ({
      time: new Date(ts * 1000).toISOString().split('T')[0],
      open:  quotes.open?.[i]  != null ? +quotes.open[i].toFixed(4)  : null,
      high:  quotes.high?.[i]  != null ? +quotes.high[i].toFixed(4)  : null,
      low:   quotes.low?.[i]   != null ? +quotes.low[i].toFixed(4)   : null,
      close: quotes.close?.[i] != null ? +quotes.close[i].toFixed(4) : null,
      volume: quotes.volume?.[i] || 0
    }))
    .filter(d => d.open && d.close);
}

app.get('/api/market/commodities', async (req, res) => {
  try {
    const now = Date.now();
    if (commodityLastUpdate && (now - commodityLastUpdate) < COMMODITY_CACHE_TTL && Object.keys(commodityCache).length > 0) {
      return res.json(commodityCache);
    }

    const results = await Promise.all(
      COMMODITIES.map(async (c) => {
        const data = await fetchCommodityPrice(c.symbol);
        return { ...c, ...(data || { price: null, change: null, changePercent: null }) };
      })
    );

    const mapped = {};
    results.forEach(r => { mapped[r.key] = r; });

    // Altın TL = Altın USD × Dolar/TL (hesaplanan)
    const goldUsd = mapped['gold_usd'];
    const usdTry  = mapped['usd_try'];
    if (goldUsd?.price && usdTry?.price) {
      const goldTryOuncePrice = goldUsd.price * usdTry.price;
      const goldTryOuncePrev  = (goldUsd.previousClose || goldUsd.price) * (usdTry.previousClose || usdTry.price);
      const goldTryPrice = convertOunceTlToGramTl(goldTryOuncePrice);
      const goldTryPrev  = convertOunceTlToGramTl(goldTryOuncePrev);
      const goldTryChg   = goldTryPrice != null && goldTryPrev != null
        ? +(goldTryPrice - goldTryPrev).toFixed(2)
        : null;
      mapped['gold_try'] = {
        symbol: 'GOLD_TL', key: 'gold_try', name: 'Altın (TL)', unit: 'TL/oz',
        price: goldTryPrice,
        name: 'Gram Altin',
        unit: 'TL/gr',
        change: goldTryChg,
        changePercent: goldTryPrev ? +(goldTryChg / goldTryPrev * 100).toFixed(2) : 0,
        previousClose: goldTryPrev,
        timestamp: new Date().toISOString()
      };
    }

    commodityCache = mapped;
    commodityLastUpdate = now;
    res.json(mapped);
  } catch (err) {
    console.error('Commodities hatasi:', err.message);
    res.status(500).json({ error: 'Veri alinamadi' });
  }
});

// Macro snapshot — BIST100, BIST30, USD/TRY, EUR/TRY, Gram Altin
let macroCache = null;
let macroLastUpdate = 0;
const MACRO_CACHE_TTL = 60 * 1000;

app.get('/api/market/macro', async (req, res) => {
  try {
    const now = Date.now();
    if (macroCache && (now - macroLastUpdate) < MACRO_CACHE_TTL) {
      return res.json(macroCache);
    }

    const bist100Local = liveDataService.getBist100();
    const bist30Local = liveDataService.getBist30();

    const [usdtry, eurtry, goldOz] = await Promise.all([
      fetchCommodityPrice('USDTRY=X'),
      fetchCommodityPrice('EURTRY=X'),
      fetchCommodityPrice('GC=F'),
    ]);

    let gramAltin = null;
    if (goldOz?.price && usdtry?.price) {
      const oz = goldOz.price;
      const fx = usdtry.price;
      const prevOz = goldOz.previousClose ?? oz;
      const prevFx = usdtry.previousClose ?? fx;
      const price = (oz * fx) / GRAMS_PER_TROY_OUNCE;
      const prev = (prevOz * prevFx) / GRAMS_PER_TROY_OUNCE;
      const change = price - prev;
      const changePercent = prev !== 0 ? (change / prev) * 100 : 0;
      gramAltin = {
        symbol: 'GRAM',
        name: 'Gram Altin',
        price: +price.toFixed(2),
        change: +change.toFixed(2),
        changePercent: +changePercent.toFixed(2),
      };
    }

    const payload = {
      bist100: bist100Local ? {
        symbol: 'BIST 100', name: 'BIST 100',
        price: bist100Local.value ?? bist100Local.price,
        change: bist100Local.change,
        changePercent: bist100Local.changePercent,
      } : null,
      bist30: bist30Local ? {
        symbol: 'BIST 30', name: 'BIST 30',
        price: bist30Local.value ?? bist30Local.price,
        change: bist30Local.change,
        changePercent: bist30Local.changePercent,
      } : null,
      usdtry: usdtry ? {
        symbol: 'USD/TRY', name: 'USD/TRY',
        price: usdtry.price,
        change: usdtry.change,
        changePercent: usdtry.changePercent,
      } : null,
      eurtry: eurtry ? {
        symbol: 'EUR/TRY', name: 'EUR/TRY',
        price: eurtry.price,
        change: eurtry.change,
        changePercent: eurtry.changePercent,
      } : null,
      gold: gramAltin,
      timestamp: new Date().toISOString(),
    };

    macroCache = payload;
    macroLastUpdate = now;
    res.json(payload);
  } catch (err) {
    console.error('Macro snapshot hatasi:', err.message);
    res.status(500).json({ error: 'Veri alinamadi' });
  }
});

app.get('/api/market/commodity/:symbol/historical', async (req, res) => {
  try {
    const { symbol } = req.params; // 'gold_usd', 'silver_usd', 'gold_try', 'usd_try'
    const { period = '3mo', interval = '1d' } = req.query;

    const rangeMap = { '1w':'5d','1mo':'1mo','3mo':'3mo','6mo':'6mo','1y':'1y','2y':'2y','5y':'5y' };
    const range = rangeMap[period] || '3mo';

    if (symbol === 'gold_try') {
      const [goldUsdSeries, usdTrySeries] = await Promise.all([
        fetchCommodityHistoricalSeries('GC=F', range, interval),
        fetchCommodityHistoricalSeries('USDTRY=X', range, interval),
      ]);

      if (!goldUsdSeries || !usdTrySeries) {
        return res.status(404).json({ error: 'Veri bulunamadi' });
      }

      const usdTryByTime = new Map(usdTrySeries.map(item => [item.time, item]));
      const chartData = goldUsdSeries
        .map((goldItem) => {
          const usdTryItem = usdTryByTime.get(goldItem.time);
          if (!usdTryItem) return null;

          const values = [
            goldItem.open,
            goldItem.high,
            goldItem.low,
            goldItem.close,
            usdTryItem.open,
            usdTryItem.high,
            usdTryItem.low,
            usdTryItem.close,
          ];

          if (values.some((value) => !Number.isFinite(value))) {
            return null;
          }

          return {
            time: goldItem.time,
            open: convertOunceTlToGramTl(goldItem.open * usdTryItem.open, 4),
            high: convertOunceTlToGramTl(goldItem.high * usdTryItem.high, 4),
            low: convertOunceTlToGramTl(goldItem.low * usdTryItem.low, 4),
            close: convertOunceTlToGramTl(goldItem.close * usdTryItem.close, 4),
            volume: goldItem.volume || 0,
          };
        })
        .filter((item) => item?.open != null && item?.close != null);

      return res.json({
        symbol: 'GOLD_TL',
        name: 'Altin (TL)',
        unit: 'TL/gr',
        name: 'Gram Altin',
        data: chartData,
      });
    }

    const comm = COMMODITIES.find(c => c.key === symbol || c.symbol === symbol);
    if (!comm) return res.status(404).json({ error: 'Sembol bulunamadi' });

    const chartData = await fetchCommodityHistoricalSeries(comm.symbol, range, interval);
    if (!chartData) return res.status(404).json({ error: 'Veri bulunamadi' });

    res.json({ symbol: comm.symbol, name: comm.name, unit: comm.unit, data: chartData });
  } catch (err) {
    console.error('Commodity historical hatasi:', err.message);
    res.status(500).json({ error: 'Gecmis veri alinamadi' });
  }
});

// ============ ANALYSIS ROUTES ============

// AI Skor
app.get('/api/analysis/ai-score/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase().replace('-USD', '');
  const isCrypto = (req.query.type || '').toLowerCase() === 'crypto';

  try {
    let stock, historicalData, fundamentals;

    if (isCrypto) {
      const raw = await fetchCryptoHistorical(upperSymbol);
      if (!raw || raw.length < 20) {
        return res.status(503).json({ error: `${upperSymbol} için yeterli kripto verisi alınamadı` });
      }
      historicalData = raw;
      stock = { name: upperSymbol, sector: 'Kripto Para', market: 'Crypto', price: raw[raw.length - 1].close };
      fundamentals = { altmanZScore: 0, piotroskiFScore: 0, priceToEarnings: 0 }; // kripto için temel analiz yok
    } else {
      stock = liveDataService.getStock(upperSymbol) || allBistStocks.find(s => s.symbol === upperSymbol);
      if (!stock) {
        return res.status(404).json({ error: `${upperSymbol} bulunamadi` });
      }
      historicalData = await liveDataService.fetchHistoricalData(upperSymbol, '1y', '1d');

      // Altman/Piotroski/PE — gerçek Yahoo bilanço verisinden. Veri yoksa null
      // (fundamentalScore'a etki etmez, "Sektörel Tahmin" uydurma değer YOK).
      try {
        const fs = await fundamentalScoresService.getFundamentalScores(upperSymbol);
        // PE için yine quoteSummary'den realRatios çağrılabilir; ama AI score için
        // sadece Altman/Piotroski yetiyor. PE yi /analysis/fundamental endpoint'i veriyor.
        fundamentals = fs.success
          ? { altmanZScore: fs.altmanZScore, piotroskiFScore: fs.piotroskiFScore, priceToEarnings: null }
          : { altmanZScore: null, piotroskiFScore: null, priceToEarnings: null };
      } catch (_) {
        fundamentals = { altmanZScore: null, piotroskiFScore: null, priceToEarnings: null };
      }
    }

    const indicators = historicalData ? liveDataService.calculateIndicators(historicalData) : null;

    // Teknik skor hesapla
    let technicalScore = 50;
    if (indicators) {
      if (indicators.rsi < 30) technicalScore += 20;
      else if (indicators.rsi > 70) technicalScore -= 20;
      else if (indicators.rsi < 40) technicalScore += 10;
      else if (indicators.rsi > 60) technicalScore -= 10;

      if (indicators.macd > indicators.macdSignal) technicalScore += 15;
      else technicalScore -= 15;

      if (indicators.currentPrice > indicators.ema50) technicalScore += 10;
      else technicalScore -= 10;

      if (indicators.currentPrice > indicators.ema200) technicalScore += 10;
      else technicalScore -= 10;

      // Bollinger pozisyonu
      if (indicators.currentPrice < indicators.bollingerLower) technicalScore += 10;
      if (indicators.currentPrice > indicators.bollingerUpper) technicalScore -= 10;
    }

    technicalScore = Math.max(0, Math.min(100, technicalScore));

    // Temel skor — kripto için teknik bazlı, hisseler için fundamental bazlı
    let fundamentalScore = 50;
    if (isCrypto) {
      // Kripto için temel analiz yok; momentum ve trend bazlı bir skor ver
      if (indicators) {
        if (indicators.currentPrice > indicators.ema200) fundamentalScore += 20;
        if (indicators.currentPrice > indicators.sma200) fundamentalScore += 10;
        if (indicators.macd > 0) fundamentalScore += 10;
        else fundamentalScore -= 10;
      }
    } else {
      // Sadece GERÇEK skor varsa puanla (null ise nötr 50 kalır — uydurma yapmıyoruz)
      if (fundamentals.altmanZScore != null) {
        if (fundamentals.altmanZScore > 2.99) fundamentalScore += 15;
        else if (fundamentals.altmanZScore < 1.81) fundamentalScore -= 15;
      }
      if (fundamentals.piotroskiFScore != null) {
        if (fundamentals.piotroskiFScore >= 7) fundamentalScore += 15;
        else if (fundamentals.piotroskiFScore <= 3) fundamentalScore -= 15;
      }
      if (fundamentals.priceToEarnings != null && fundamentals.priceToEarnings > 0) {
        if (fundamentals.priceToEarnings < 10) fundamentalScore += 10;
        else if (fundamentals.priceToEarnings > 20) fundamentalScore -= 10;
      }
    }

    fundamentalScore = Math.max(0, Math.min(100, fundamentalScore));

    // Risk skoru — deterministik: volatilite (ATR/fiyat oranı) ve sektör riskinden hesapla
    let riskScore = 60; // baz puan
    if (indicators) {
      // Düşük ATR/fiyat oranı = düşük risk = daha yüksek güvenlik puanı
      if (indicators.atr && stock.price) {
        const atrPct = (indicators.atr / stock.price) * 100;
        if (atrPct < 1.5) riskScore += 15;
        else if (atrPct < 3) riskScore += 5;
        else if (atrPct > 6) riskScore -= 20;
        else if (atrPct > 4) riskScore -= 10;
      }
      // Bollinger bant genişliği: dar bant = düşük volatilite = daha güvenli
      if (indicators.bollingerBandwidth) {
        if (indicators.bollingerBandwidth < 8) riskScore += 10;
        else if (indicators.bollingerBandwidth > 20) riskScore -= 15;
      }
      // RSI aşırı bölgeler risk ekler
      if (indicators.rsi > 80 || indicators.rsi < 20) riskScore -= 10;
    }
    riskScore = Math.max(20, Math.min(95, riskScore));

    const overallScore = Math.floor((technicalScore * 0.45 + fundamentalScore * 0.35 + riskScore * 0.20));

    res.json({
      symbol: upperSymbol,
      name: stock.name,
      sector: stock.sector,
      market: stock.market,
      isCrypto,
      currentPrice: stock.price || (indicators?.currentPrice),
      overallScore,
      technicalScore,
      fundamentalScore,
      riskScore,
      recommendation: overallScore > 65 ? 'AL' : overallScore > 45 ? 'TUT' : 'SAT',
      indicators: indicators || {},
      fundamentals,
      signals: indicators ? [
        { indicator: 'RSI', value: indicators.rsi, signal: indicators.rsi < 30 ? 'Aşırı Satım' : indicators.rsi > 70 ? 'Aşırı Alım' : 'Nötr' },
        { indicator: 'MACD', value: indicators.macd, signal: indicators.macd > indicators.macdSignal ? 'Alış' : 'Satış' },
        { indicator: 'EMA Trend', value: indicators.ema21, signal: indicators.currentPrice > indicators.ema21 ? 'Pozitif' : 'Negatif' },
        { indicator: 'Bollinger', value: indicators.bollingerMiddle, signal: indicators.currentPrice > indicators.bollingerUpper ? 'Aşırı Alım' : indicators.currentPrice < indicators.bollingerLower ? 'Aşırı Satım' : 'Bant İçinde' }
      ] : [],
      dataSource: isCrypto ? 'Yahoo Finance/HTX/KuCoin' : 'Yahoo Finance',
      dataQuality: indicators ? 'real' : 'partial',
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error(`AI Skor hatasi ${symbol}:`, error);
    res.status(500).json({ error: 'Skor hesaplanamadi', detail: error.message });
  }
});

// Temel Analiz — Yahoo Finance'tan gercek oranlar + fallback
const fundamentalCache = new Map(); // { data, ts }
const FUNDAMENTAL_TTL = 30 * 60 * 1000; // 30 dakika

app.get('/api/analysis/fundamental/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();

  const stock = liveDataService.getStock(upperSymbol) || allBistStocks.find(s => s.symbol === upperSymbol);
  if (!stock) {
    return res.status(404).json({ error: `${upperSymbol} bulunamadi` });
  }

  // Cache kontrolu
  const cached = fundamentalCache.get(upperSymbol);
  if (cached && Date.now() - cached.ts < FUNDAMENTAL_TTL) {
    return res.json(cached.data);
  }

  // Yahoo Finance'tan gercek oranlar
  let realRatios = null;
  let dataQuality = 'estimated';

  try {
    const { fetchYahooFinancials } = require('../../routes/financials').getServices
      ? require('../../routes/financials').getServices()
      : { fetchYahooFinancials: null };
  } catch (_) {}

  try {
    const yf = await import('yahoo-finance2').then(m => m.default || m);
    const ticker = upperSymbol.endsWith('.IS') ? upperSymbol : `${upperSymbol}.IS`;
    const summary = await yf.quoteSummary(ticker, {
      modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail']
    }, { timeout: 15000 });

    if (summary) {
      const fd = summary.financialData || {};
      const ks = summary.defaultKeyStatistics || {};
      const sd = summary.summaryDetail || {};

      const v = (obj, key) => {
        const val = obj[key];
        if (val === null || val === undefined) return null;
        if (typeof val === 'object' && val.raw !== undefined) return val.raw;
        return typeof val === 'number' ? val : null;
      };

      const pe = v(ks, 'trailingPE') || v(sd, 'trailingPE');
      const pb = v(ks, 'priceToBook');
      const roe = v(fd, 'returnOnEquity');
      const roa = v(fd, 'returnOnAssets');
      const debtEq = v(ks, 'debtToEquity');
      const currentR = v(fd, 'currentRatio');
      const grossM = v(fd, 'grossMargins');
      const operM = v(fd, 'operatingMargins');
      const netM = v(fd, 'profitMargins');
      const evEbitda = v(ks, 'enterpriseToEbitda');
      const ps = v(ks, 'priceToSalesTrailing12Months');
      const beta = v(ks, 'beta');
      const marketCap = v(sd, 'marketCap');
      const dividendYield = v(sd, 'dividendYield');

      // En az 3 gercek deger varsa "real" kabul et
      const realCount = [pe, pb, roe, roa].filter(v => v !== null).length;
      if (realCount >= 2) {
        dataQuality = 'real';
        realRatios = {
          priceToEarnings: pe !== null ? +pe.toFixed(2) : null,
          priceToBook: pb !== null ? +pb.toFixed(2) : null,
          priceToSales: ps !== null ? +ps.toFixed(2) : null,
          evToEbitda: evEbitda !== null ? +evEbitda.toFixed(2) : null,
          debtToEquity: debtEq !== null ? +(debtEq / 100).toFixed(2) : null, // Yahoo bunu % olarak veriyor
          currentRatio: currentR !== null ? +currentR.toFixed(2) : null,
          quickRatio: null, // Yahoo'da hep dolu değil
          returnOnEquity: roe !== null ? +(roe * 100).toFixed(2) : null,
          returnOnAssets: roa !== null ? +(roa * 100).toFixed(2) : null,
          netProfitMargin: netM !== null ? +(netM * 100).toFixed(2) : null,
          grossProfitMargin: grossM !== null ? +(grossM * 100).toFixed(2) : null,
          operatingMargin: operM !== null ? +(operM * 100).toFixed(2) : null,
          beta,
          marketCap,
          dividendYield: dividendYield !== null ? +(dividendYield * 100).toFixed(2) : null,
        };
      }
    }
  } catch (e) {
    console.warn(`[Fundamental] Yahoo Finance verisi alinamadi: ${upperSymbol} — ${e.message}`);
  }

  // Yahoo'dan gerçek veri yoksa null bırakıyoruz — uydurma sektörel "fallback" YOK.
  const ratios = {
    priceToEarnings:    realRatios?.priceToEarnings    ?? null,
    priceToBook:        realRatios?.priceToBook        ?? null,
    priceToSales:       realRatios?.priceToSales       ?? null,
    evToEbitda:         realRatios?.evToEbitda         ?? null,
    debtToEquity:       realRatios?.debtToEquity       ?? null,
    currentRatio:       realRatios?.currentRatio       ?? null,
    quickRatio:         realRatios?.quickRatio         ?? null,
    returnOnEquity:     realRatios?.returnOnEquity    ?? null,
    returnOnAssets:     realRatios?.returnOnAssets    ?? null,
    netProfitMargin:    realRatios?.netProfitMargin   ?? null,
    grossProfitMargin:  realRatios?.grossProfitMargin ?? null,
    operatingMargin:    realRatios?.operatingMargin   ?? null,
  };

  // Altman Z, Piotroski F, Beneish M — Yahoo bilanço verisinden GERÇEK hesaplanır.
  // Veri eksikse skor null döner (UI null ise göstermez/gösterip "veri yok" yazar).
  let scores = { altmanZScore: null, piotroskiFScore: null, beneishMScore: null };
  try {
    const fs = await fundamentalScoresService.getFundamentalScores(upperSymbol);
    if (fs.success) {
      scores = {
        altmanZScore: fs.altmanZScore,
        altmanInterpretation: fs.altmanInterpretation,
        altmanComponents: fs.altmanComponents,
        altmanReason: fs.altmanReason,
        piotroskiFScore: fs.piotroskiFScore,
        piotroskiInterpretation: fs.piotroskiInterpretation,
        piotroskiChecks: fs.piotroskiChecks,
        piotroskiReason: fs.piotroskiReason,
        beneishMScore: fs.beneishMScore,
        beneishInterpretation: fs.beneishInterpretation,
        beneishIndices: fs.beneishIndices,
        beneishReason: fs.beneishReason,
        fiscalYears: fs.fiscalYears,
      };
    }
  } catch (e) {
    console.warn(`[Fundamental] Skor hesaplama hatası ${upperSymbol}: ${e.message}`);
  }

  const response = {
    symbol: upperSymbol,
    name: stock.name,
    sector: stock.sector,
    market: stock.market,
    currentPrice: stock.price,
    dataSource: dataQuality === 'real' ? 'Yahoo Finance (Gerçek Bilanço)' : 'Veri eksik',
    dataQuality,
    dataNote: dataQuality !== 'real'
      ? 'Yahoo Finance bu hisse için yeterli oran verisi sağlamadı. Sektörel uydurma rakam üretmiyoruz; eksik alanlar boş bırakıldı.'
      : null,
    lastUpdate: new Date().toISOString(),
    ...ratios,
    ...scores,
  };

  fundamentalCache.set(upperSymbol, { data: response, ts: Date.now() });
  res.json(response);
});

// Teknik Analiz
// ── Kripto teknik analiz için ortak data fetch fonksiyonu (SNR ile aynı logic) ──
async function fetchCryptoHistorical(ticker) {
  const GECKO_IDS = {
    BTC:'bitcoin',ETH:'ethereum',BNB:'binancecoin',SOL:'solana',
    XRP:'ripple',USDC:'usd-coin',ADA:'cardano',AVAX:'avalanche-2',
    DOGE:'dogecoin',TRX:'tron',LINK:'chainlink',TON:'the-open-network',
    MATIC:'matic-network',DOT:'polkadot',LTC:'litecoin',
    SHIB:'shiba-inu',BCH:'bitcoin-cash',NEAR:'near',UNI:'uniswap',
    APT:'aptos',ICP:'internet-computer',FIL:'filecoin',ATOM:'cosmos',
    OP:'optimism',ARB:'arbitrum',VET:'vechain',MKR:'maker',
    AAVE:'aave',ALGO:'algorand',THETA:'theta-token',XLM:'stellar',
    IMX:'immutable-x',RNDR:'render-token',GRT:'the-graph',
    INJ:'injective-protocol',EGLD:'elrond-erd-2',STX:'blockstack',
    FLOW:'flow',SAND:'the-sandbox',MANA:'decentraland',
    QNT:'quant-network',HBAR:'hedera-hashgraph',AXS:'axie-infinity',
    CRV:'curve-dao-token',SNX:'havven',RUNE:'thorchain',
    COMP:'compound-governance-token',ENS:'ethereum-name-service',
    LDO:'lido-dao',GMX:'gmx',PEPE:'pepe',WLD:'worldcoin-wld',
    SUI:'sui',SEI:'sei-network',TIA:'celestia',JUP:'jupiter-ag',
    WIF:'dogwifcoin',BONK:'bonk',ENA:'ethena',NOT:'notcoin',
    ZK:'zklink-nova',ZRX:'0x',CAKE:'pancakeswap-token',
    GMT:'stepn',APE:'apecoin',CHZ:'chiliz',BAT:'basic-attention-token',
    KSM:'kusama',DCR:'decred',ZEC:'zcash',DASH:'dash',EOS:'eos',
    XTZ:'tezos',IOTA:'iota',
  };
  const cryptoApis = [
    // ── 0) Yahoo Finance (BTC-USD format) — Türkiye'den erişilebilir, BIST için de kullanılan aynı API ──
    {
      name: 'YahooFinance',
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}-USD?interval=1d&range=1y`,
      parse: (d) => {
        const result = d?.chart?.result?.[0];
        if (!result) return null;
        const ts = result.timestamp || [];
        const q = result.indicators?.quote?.[0] || {};
        const rows = ts.map((t, i) => ({
          date: new Date(t * 1000).toISOString().slice(0,10),
          open: parseFloat(q.open?.[i]) || 0,
          high: parseFloat(q.high?.[i]) || 0,
          low:  parseFloat(q.low?.[i]) || 0,
          close: parseFloat(q.close?.[i]) || 0,
          volume: parseFloat(q.volume?.[i]) || 0
        })).filter(r => r.close > 0);
        return rows.length >= 20 ? rows : null;
      }
    },
    // ── 1) Binance.com ──────────────────────────────────────────────────────
    {
      name: 'Binance',
      url: `https://api.binance.com/api/v3/klines?symbol=${ticker}USDT&interval=1d&limit=365`,
      parse: (d) => Array.isArray(d) && d.length > 0
        ? d.map(k => ({ date: new Date(k[0]).toISOString().slice(0,10),
            open: parseFloat(k[1]), high: parseFloat(k[2]),
            low:  parseFloat(k[3]), close: parseFloat(k[4]),
            volume: parseFloat(k[5]) })).filter(r => r.close > 0)
        : null
    },
    {
      name: 'CryptoCompare',
      url: `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${ticker}&tsym=USD&limit=365`,
      parse: (d) => {
        const rows = d?.Data?.Data;
        return rows && rows.length > 0
          ? rows.map(r => ({ date: new Date(r.time*1000).toISOString().slice(0,10),
              open: r.open, high: r.high, low: r.low,
              close: r.close, volume: r.volumefrom })).filter(r => r.close > 0)
          : null;
      }
    },
  ];
  const geckoId = GECKO_IDS[ticker];
  if (geckoId) {
    cryptoApis.push({
      name: 'CoinGecko',
      url: `https://api.coingecko.com/api/v3/coins/${geckoId}/ohlc?vs_currency=usd&days=365`,
      parse: (d) => Array.isArray(d) && d.length > 0
        ? d.map(k => ({ date: new Date(k[0]).toISOString().slice(0,10),
            open: k[1], high: k[2], low: k[3], close: k[4], volume: 0 }))
            .filter(r => r.close > 0)
        : null
    });
  }
  const since = Math.floor((Date.now() - 365*86400*1000) / 1000);
  cryptoApis.push({
    name: 'Kraken',
    url: `https://api.kraken.com/0/public/OHLC?pair=${ticker}USD&interval=1440&since=${since}`,
    parse: (d) => {
      const pairs = d?.result;
      if (!pairs) return null;
      const key = Object.keys(pairs).find(k => k !== 'last');
      if (!key) return null;
      return pairs[key].map(r => ({
        date: new Date(r[0]*1000).toISOString().slice(0,10),
        open: parseFloat(r[1]), high: parseFloat(r[2]),
        low: parseFloat(r[3]), close: parseFloat(r[4]),
        volume: parseFloat(r[6])
      })).filter(r => r.close > 0);
    }
  });
  // 5) OKX
  cryptoApis.push({
    name: 'OKX',
    url: `https://www.okx.com/api/v5/market/candles?instId=${ticker}-USDT&bar=1D&limit=300`,
    parse: (d) => {
      const rows = d?.data;
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rows.map(r => ({
        date: new Date(parseInt(r[0])).toISOString().slice(0,10),
        open: parseFloat(r[1]), high: parseFloat(r[2]),
        low: parseFloat(r[3]), close: parseFloat(r[4]),
        volume: parseFloat(r[5])
      })).filter(r => r.close > 0).reverse();
    }
  });
  // 6) Bybit
  cryptoApis.push({
    name: 'Bybit',
    url: `https://api.bybit.com/v5/market/kline?category=spot&symbol=${ticker}USDT&interval=D&limit=365`,
    parse: (d) => {
      const rows = d?.result?.list;
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return rows.map(r => ({
        date: new Date(parseInt(r[0])).toISOString().slice(0,10),
        open: parseFloat(r[1]), high: parseFloat(r[2]),
        low: parseFloat(r[3]), close: parseFloat(r[4]),
        volume: parseFloat(r[5])
      })).filter(r => r.close > 0).reverse();
    }
  });
  // 7) Gate.io
  cryptoApis.push({
    name: 'Gate.io',
    url: `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${ticker}_USDT&interval=1d&limit=365`,
    parse: (d) => {
      if (!Array.isArray(d) || d.length === 0) return null;
      return d.map(r => ({
        date: new Date(parseInt(r[0]) * 1000).toISOString().slice(0,10),
        open: parseFloat(r[5]), high: parseFloat(r[3]),
        low: parseFloat(r[4]), close: parseFloat(r[2]),
        volume: parseFloat(r[1])
      })).filter(r => r.close > 0);
    }
  });
  // 8) MEXC
  cryptoApis.push({
    name: 'MEXC',
    url: `https://api.mexc.com/api/v3/klines?symbol=${ticker}USDT&interval=1d&limit=365`,
    parse: (d) => Array.isArray(d) && d.length > 0
      ? d.map(k => ({ date: new Date(k[0]).toISOString().slice(0,10),
          open: parseFloat(k[1]), high: parseFloat(k[2]),
          low: parseFloat(k[3]), close: parseFloat(k[4]),
          volume: parseFloat(k[5]) })).filter(r => r.close > 0)
      : null
  });
  // 9) HTX (Huobi) — geniş altcoin desteği
  cryptoApis.push({
    name: 'HTX',
    url: `https://api.huobi.pro/market/history/kline?period=1day&size=365&symbol=${ticker.toLowerCase()}usdt`,
    parse: (d) => {
      if (d?.status !== 'ok' || !Array.isArray(d.data)) return null;
      const rows = d.data.map(k => ({
        date: new Date(k.id * 1000).toISOString().slice(0,10),
        open: parseFloat(k.open), high: parseFloat(k.high),
        low: parseFloat(k.low), close: parseFloat(k.close),
        volume: parseFloat(k.vol)
      })).filter(r => r.close > 0).reverse();
      return rows.length >= 20 ? rows : null;
    }
  });
  // 10) KuCoin — geniş kripto desteği
  const kucoinStart = Math.floor((Date.now() - 365*86400*1000) / 1000);
  const kucoinEnd = Math.floor(Date.now() / 1000);
  cryptoApis.push({
    name: 'KuCoin',
    url: `https://api.kucoin.com/api/v1/market/candles?type=1day&symbol=${ticker}-USDT&startAt=${kucoinStart}&endAt=${kucoinEnd}`,
    parse: (d) => {
      if (d?.code !== '200000' || !Array.isArray(d.data)) return null;
      const rows = d.data.map(k => ({
        date: new Date(parseInt(k[0]) * 1000).toISOString().slice(0,10),
        open: parseFloat(k[1]), close: parseFloat(k[2]),
        high: parseFloat(k[3]), low: parseFloat(k[4]),
        volume: parseFloat(k[5])
      })).filter(r => r.close > 0).reverse();
      return rows.length >= 20 ? rows : null;
    }
  });

  for (const api of cryptoApis) {
    try {
      const resp = await axios.get(api.url, { timeout: 12000 });
      const parsed = api.parse(resp.data);
      if (parsed && parsed.length >= 20) {
        console.log(`[TeknikAnaliz Kripto] ${ticker} -> ${api.name} (${parsed.length} bar)`);
        return parsed;
      }
    } catch (e) {
      console.warn(`[TeknikAnaliz Kripto] ${api.name} başarısız (${ticker}): ${e.message}`);
    }
  }
  return null;
}

app.get('/api/analysis/technical/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase().replace('-USD', '');
  const isCrypto = (req.query.type || '').toLowerCase() === 'crypto';

  try {
    let historicalData, stockInfo;

    if (isCrypto) {
      // ── Kripto analiz yolu ──────────────────────────────────────────────
      const raw = await fetchCryptoHistorical(upperSymbol);
      if (!raw || raw.length < 20) {
        return res.status(503).json({ error: `${upperSymbol} için yeterli kripto verisi alınamadı` });
      }
      historicalData = raw;
      stockInfo = {
        name: upperSymbol,
        sector: 'Kripto Para',
        market: 'Crypto',
        price: raw[raw.length - 1].close
      };
    } else {
      // ── BIST hisse analiz yolu ─────────────────────────────────────────
      const stock = liveDataService.getStock(upperSymbol) || allBistStocks.find(s => s.symbol === upperSymbol);
      if (!stock) {
        return res.status(404).json({ error: `${upperSymbol} bulunamadi` });
      }
      historicalData = await liveDataService.fetchHistoricalData(upperSymbol, '1y', '1d');
      stockInfo = stock;
    }

    const indicators = historicalData ? liveDataService.calculateIndicators(historicalData) : null;

    if (!indicators) {
      return res.status(400).json({ error: 'Yeterli veri yok' });
    }

    const fibonacci = buildTechnicalFibonacci(historicalData, stockInfo.price || indicators.currentPrice);
    const trend = indicators.currentPrice > indicators.ema50 ? 'Yukselis' : 'Dusus';
    const momentum = indicators.macd > 0 ? 'Guclu' : 'Zayif';

    res.json({
      symbol: upperSymbol,
      name: stockInfo.name,
      sector: stockInfo.sector,
      market: stockInfo.market,
      isCrypto,
      currentPrice: stockInfo.price || indicators.currentPrice,
      indicators: {
        ema5: indicators.ema5,
        ema9: indicators.ema9,
        ema21: indicators.ema21,
        ema50: indicators.ema50,
        ema100: indicators.ema100,
        ema200: indicators.ema200,
        sma20: indicators.sma20,
        sma50: indicators.sma50,
        sma200: indicators.sma200,
        rsi: indicators.rsi,
        macd: indicators.macd,
        macdSignal: indicators.macdSignal,
        macdHistogram: indicators.macdHistogram,
        stochRsiK: indicators.stochRsiK,
        stochRsiD: indicators.stochRsiD,
        williamsR: indicators.williamsR,
        cci: indicators.cci,
        bollingerUpper: indicators.bollingerUpper,
        bollingerMiddle: indicators.bollingerMiddle,
        bollingerLower: indicators.bollingerLower,
        atr: indicators.atr,
        obv: indicators.obv
      },
      levels: {
        support: indicators.support,
        resistance: indicators.resistance,
        pivot: indicators.pivot,
        pivotR1: indicators.pivotR1,
        pivotR2: indicators.pivotR2,
        pivotS1: indicators.pivotS1,
        pivotS2: indicators.pivotS2
      },
      support: fibonacci?.support ?? indicators.support,
      resistance: fibonacci?.resistance ?? indicators.resistance,
      fibonacciLevels: fibonacci?.levels || null,
      fibonacci: fibonacci || null,
      trend,
      momentum,
      volatility: indicators.atr ? +((indicators.atr / indicators.currentPrice) * 100).toFixed(2) : null,
      signals: [
        { indicator: 'RSI', value: indicators.rsi, signal: indicators.rsi < 30 ? 'Aşırı Satım' : indicators.rsi > 70 ? 'Aşırı Alım' : 'Nötr' },
        { indicator: 'MACD', value: indicators.macd, signal: indicators.macd > indicators.macdSignal ? 'Alış' : 'Satış' },
        { indicator: 'EMA Kesişim', value: indicators.ema5, signal: indicators.ema5 > indicators.ema21 ? 'Pozitif' : 'Negatif' },
        { indicator: 'Bollinger', value: indicators.currentPrice, signal: indicators.currentPrice > indicators.bollingerUpper ? 'Aşırı Alım' : indicators.currentPrice < indicators.bollingerLower ? 'Aşırı Satım' : 'Bant İçinde' },
        { indicator: 'Williams %R', value: indicators.williamsR, signal: indicators.williamsR < -80 ? 'Aşırı Satım' : indicators.williamsR > -20 ? 'Aşırı Alım' : 'Nötr' },
        { indicator: 'CCI', value: indicators.cci, signal: indicators.cci < -100 ? 'Aşırı Satım' : indicators.cci > 100 ? 'Aşırı Alım' : 'Nötr' }
      ],
      dataSource: isCrypto ? 'Yahoo Finance/HTX/KuCoin' : 'Yahoo Finance',
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Teknik analiz hatasi ${symbol}:`, error);
    res.status(500).json({ error: 'Analiz yapilamadi' });
  }
});

// ============ MALAYSIAN SNR ROUTES ============
const snrService = require('./services/snrService');
const comboStrategyService = require('./services/comboStrategyService');

// ============ COMBO STRATEJİ TARAYICI ============
// 15+ TradingView tarzı çoklu indikatör kombosu — catchy Türkçe isimli (Zincir Bozan, Düşüş Treni vb.)
// Scope-aware: bist30 (hızlı), bist100 (varsayılan), all (~510 hisse — uzun)
// Timeframe-aware: daily (varsayılan), weekly, hourly, fifteen
const comboScanCacheMap = new Map(); // `${scope}:${timeframe}` -> { data, ts }
const COMBO_SCAN_TTL_FAST = 10 * 60 * 1000; // 10 dk (bist30/bist100)
const COMBO_SCAN_TTL_ALL = 30 * 60 * 1000;  // 30 dk (all — pahalı)
// İntraday timeframe'ler daha hızlı bayatlar — daha kısa cache
const COMBO_SCAN_TTL_INTRADAY = 5 * 60 * 1000; // 5 dk

function comboCacheTtl(scope, timeframe) {
  if (timeframe === 'hourly' || timeframe === 'fifteen') return COMBO_SCAN_TTL_INTRADAY;
  return scope === 'all' ? COMBO_SCAN_TTL_ALL : COMBO_SCAN_TTL_FAST;
}

// Combo katalog (sembolsüz, sadece liste — "neler tarıyor?" sayfası için)
app.get('/api/combo-strategies/catalog', (req, res) => {
  try {
    const catalog = comboStrategyService.getCatalog();
    const timeframes = Object.values(comboStrategyService.TIMEFRAMES).map(t => ({
      id: t.id, label: t.label, shortLabel: t.shortLabel, barLabel: t.barLabel, desc: t.desc,
    }));
    res.json({ success: true, total: catalog.length, catalog, timeframes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tek sembol için combo analizi
app.get('/api/combo-strategies/analyze/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase().replace('.IS', '');
    const tfId = req.query.timeframe || 'daily';
    const tf = comboStrategyService.resolveTimeframe(tfId);
    const raw = await liveDataService.fetchHistoricalData(symbol, tf.yahooRange, tf.yahooInterval);
    if (!raw || raw.length < tf.minBars) {
      return res.json({ success: false, error: `Yetersiz ${tf.barLabel} verisi` });
    }
    const candles = raw.map(r => ({
      time: Math.floor(new Date(r.date || r.timestamp).getTime() / 1000),
      open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume || 0,
    }));
    const result = comboStrategyService.analyzeSymbol(symbol, candles, tf.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toplu tarama — scope (BIST30/BIST100/Tümü) + timeframe (daily/weekly/hourly/fifteen) destekler
async function runComboScan(scope, timeframeId) {
  const tf = comboStrategyService.resolveTimeframe(timeframeId);

  let symbolList;
  if (scope === 'bist30') symbolList = bist30Stocks;
  else if (scope === 'all') symbolList = allBistStocks;
  else { scope = 'bist100'; symbolList = bist100Stocks; }

  const symbols = symbolList.map(s => (s.symbol || s).replace('.IS', ''));
  const results = [];
  const BATCH = scope === 'all' ? 10 : 8;
  const PAUSE = scope === 'all' ? 200 : 250;

  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const batchRes = await Promise.allSettled(batch.map(async (sym) => {
      try {
        const raw = await liveDataService.fetchHistoricalData(sym, tf.yahooRange, tf.yahooInterval);
        if (!raw || raw.length < tf.minBars) return null;
        const candles = raw.map(r => ({
          time: Math.floor(new Date(r.date || r.timestamp).getTime() / 1000),
          open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume || 0,
        }));
        const analysis = comboStrategyService.analyzeSymbol(sym, candles, tf.id);
        return analysis.hits.length > 0 ? analysis : null;
      } catch { return null; }
    }));
    batchRes.forEach(r => { if (r.status === 'fulfilled' && r.value) results.push(r.value); });
    if (i + BATCH < symbols.length) await new Promise(r => setTimeout(r, PAUSE));
  }

  const catalog = comboStrategyService.getCatalog();
  const byCombo = catalog.map(c => {
    const matches = results
      .map(r => {
        const hit = r.hits.find(h => h.key === c.key);
        return hit ? { symbol: r.symbol, lastPrice: r.lastPrice, dayChange: r.dayChange, ...hit } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return { ...c, matchCount: matches.length, matches };
  });

  return {
    success: true,
    scope,
    timeframe: tf.id,
    timeframeLabel: tf.label,
    timeframeShort: tf.shortLabel,
    timeframeBarLabel: tf.barLabel,
    timeframeDesc: tf.desc,
    scannedAt: new Date().toISOString(),
    totalScanned: symbols.length,
    withSignals: results.length,
    bullishStocks: results.filter(r => r.bias === 'boga').length,
    bearishStocks: results.filter(r => r.bias === 'ayi').length,
    bySymbol: results.sort((a, b) => b.hits.length - a.hits.length),
    byCombo,
    catalog,
  };
}

// Yeni route — scope + timeframe query parametreli (default: bist100, daily)
app.get('/api/combo-strategies/scan', async (req, res) => {
  try {
    const scope = ['bist30', 'bist100', 'all'].includes(req.query.scope) ? req.query.scope : 'bist100';
    const timeframe = ['daily', 'weekly', 'hourly', 'fifteen'].includes(req.query.timeframe) ? req.query.timeframe : 'daily';
    const cacheKey = `${scope}:${timeframe}`;
    const ttl = comboCacheTtl(scope, timeframe);
    const cached = comboScanCacheMap.get(cacheKey);
    if (cached && Date.now() - cached.ts < ttl) return res.json(cached.data);

    const payload = await runComboScan(scope, timeframe);
    comboScanCacheMap.set(cacheKey, { data: payload, ts: Date.now() });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Geriye uyumluluk: eski /scan/bist30 route'u korunur (her zaman daily)
app.get('/api/combo-strategies/scan/bist30', async (req, res) => {
  try {
    const cacheKey = 'bist30:daily';
    const cached = comboScanCacheMap.get(cacheKey);
    if (cached && Date.now() - cached.ts < COMBO_SCAN_TTL_FAST) return res.json(cached.data);
    const payload = await runComboScan('bist30', 'daily');
    comboScanCacheMap.set(cacheKey, { data: payload, ts: Date.now() });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/snr/:symbol', async (req, res, next) => {
  // 'scanner' literal path /api/snr/scanner ile çakışıyor — onu sonraki handler'a bırak
  if (req.params.symbol === 'scanner') return next();
  try {
    const rawSym = req.params.symbol.toUpperCase().replace('.IS', '');
    const assetType = (req.query.type || 'stock').toLowerCase(); // 'stock' | 'crypto'

    // Kripto semboller için Yahoo Finance'te "-USD" eki kullan
    // Hisseler için normal .IS eki kullanılır (getYahooSymbol)
    const isCrypto = assetType === 'crypto';
    const symbol = rawSym; // display symbol

    // Geçmiş veri al — liveDataService.fetchHistoricalData kullan (6 ay)
    let historicalData = null;
    try {
      let raw;
      if (isCrypto) {
        const ticker = rawSym.replace('-USD', '').toUpperCase();
        // ── CoinGecko ID mapping (en yaygın 60 coin) ──────────────────────
        const GECKO_IDS = {
          BTC:'bitcoin',ETH:'ethereum',BNB:'binancecoin',SOL:'solana',
          XRP:'ripple',USDC:'usd-coin',ADA:'cardano',AVAX:'avalanche-2',
          DOGE:'dogecoin',TRX:'tron',LINK:'chainlink',TON:'the-open-network',
          MATIC:'matic-network',DOT:'polkadot',LTC:'litecoin',
          SHIB:'shiba-inu',BCH:'bitcoin-cash',NEAR:'near',UNI:'uniswap',
          APT:'aptos',ICP:'internet-computer',FIL:'filecoin',ATOM:'cosmos',
          OP:'optimism',ARB:'arbitrum',VET:'vechain',MKR:'maker',
          AAVE:'aave',ALGO:'algorand',THETA:'theta-token',XLM:'stellar',
          IMX:'immutable-x',RNDR:'render-token',GRT:'the-graph',
          INJ:'injective-protocol',EGLD:'elrond-erd-2',STX:'blockstack',
          FLOW:'flow',SAND:'the-sandbox',MANA:'decentraland',
          QNT:'quant-network',HBAR:'hedera-hashgraph',AXS:'axie-infinity',
          CRV:'curve-dao-token',SNX:'havven',RUNE:'thorchain',
          COMP:'compound-governance-token',ENS:'ethereum-name-service',
          LDO:'lido-dao',GMX:'gmx',PEPE:'pepe',WLD:'worldcoin-wld',
          SUI:'sui',SEI:'sei-network',TIA:'celestia',JUP:'jupiter-ag',
          WIF:'dogwifcoin',BONK:'bonk',ENA:'ethena',NOT:'notcoin',
          ZK:'zklink-nova',ZRX:'0x',CAKE:'pancakeswap-token',
          GMT:'stepn',APE:'apecoin',CHZ:'chiliz',BAT:'basic-attention-token',
          KSM:'kusama',DCR:'decred',ZEC:'zcash',DASH:'dash',EOS:'eos',
          XTZ:'tezos',IOTA:'iota',
        };

        // ── API denemelerini sıraya koy ────────────────────────────────────
        const cryptoApis = [];

        // 0) Yahoo Finance (BTC-USD) — Türkiye'den %100 erişilebilir (BIST için de kullanılıyor)
        cryptoApis.push({
          name: 'YahooFinance',
          url: `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}-USD?interval=1d&range=6mo`,
          parse: (d) => {
            const result = d?.chart?.result?.[0];
            if (!result) return null;
            const ts = result.timestamp || [];
            const q = result.indicators?.quote?.[0] || {};
            const rows = ts.map((t, i) => ({
              date: new Date(t * 1000).toISOString().slice(0,10),
              open: parseFloat(q.open?.[i]) || 0,
              high: parseFloat(q.high?.[i]) || 0,
              low:  parseFloat(q.low?.[i]) || 0,
              close: parseFloat(q.close?.[i]) || 0,
              volume: parseFloat(q.volume?.[i]) || 0
            })).filter(r => r.close > 0);
            return rows.length >= 20 ? rows : null;
          }
        });

        // 1) Binance.com
        const binanceSym = ticker + 'USDT';
        cryptoApis.push({
          name: 'Binance',
          url: `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=1d&limit=180`,
          parse: (d) => Array.isArray(d) && d.length > 0
            ? d.map(k => ({ date: new Date(k[0]).toISOString().slice(0,10),
                open: parseFloat(k[1]), high: parseFloat(k[2]),
                low:  parseFloat(k[3]), close: parseFloat(k[4]),
                volume: parseFloat(k[5]) })).filter(r => r.close > 0)
            : null
        });

        // 2) CryptoCompare (ticker'ı doğrudan kullanır, mapping gerekmez)
        cryptoApis.push({
          name: 'CryptoCompare',
          url: `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${ticker}&tsym=USD&limit=180`,
          parse: (d) => {
            const rows = d?.Data?.Data;
            return rows && rows.length > 0
              ? rows.map(r => ({ date: new Date(r.time*1000).toISOString().slice(0,10),
                  open: r.open, high: r.high, low: r.low,
                  close: r.close, volume: r.volumefrom })).filter(r => r.close > 0)
              : null;
          }
        });

        // 3) CoinGecko OHLC (mapping gerekli)
        const geckoId = GECKO_IDS[ticker];
        if (geckoId) {
          cryptoApis.push({
            name: 'CoinGecko',
            url: `https://api.coingecko.com/api/v3/coins/${geckoId}/ohlc?vs_currency=usd&days=180`,
            parse: (d) => Array.isArray(d) && d.length > 0
              ? d.map(k => ({ date: new Date(k[0]).toISOString().slice(0,10),
                  open: k[1], high: k[2], low: k[3], close: k[4], volume: 0 }))
                  .filter(r => r.close > 0)
              : null
          });
        }

        // 4) Kraken (USD çifti)
        const since = Math.floor((Date.now() - 180*86400*1000) / 1000);
        const krakenPair = ticker + 'USD';
        cryptoApis.push({
          name: 'Kraken',
          url: `https://api.kraken.com/0/public/OHLC?pair=${krakenPair}&interval=1440&since=${since}`,
          parse: (d) => {
            const pairs = d?.result;
            if (!pairs) return null;
            const key = Object.keys(pairs).find(k => k !== 'last');
            if (!key) return null;
            return pairs[key].map(r => ({
              date: new Date(r[0]*1000).toISOString().slice(0,10),
              open: parseFloat(r[1]), high: parseFloat(r[2]),
              low: parseFloat(r[3]), close: parseFloat(r[4]),
              volume: parseFloat(r[6])
            })).filter(r => r.close > 0);
          }
        });

        // 5) OKX (Türkiye'den erişilebilir)
        cryptoApis.push({
          name: 'OKX',
          url: `https://www.okx.com/api/v5/market/candles?instId=${ticker}-USDT&bar=1D&limit=180`,
          parse: (d) => {
            const rows = d?.data;
            if (!Array.isArray(rows) || rows.length === 0) return null;
            return rows.map(r => ({
              date: new Date(parseInt(r[0])).toISOString().slice(0,10),
              open: parseFloat(r[1]), high: parseFloat(r[2]),
              low: parseFloat(r[3]), close: parseFloat(r[4]),
              volume: parseFloat(r[5])
            })).filter(r => r.close > 0).reverse();
          }
        });

        // 6) Bybit (güvenilir alternatif)
        cryptoApis.push({
          name: 'Bybit',
          url: `https://api.bybit.com/v5/market/kline?category=spot&symbol=${ticker}USDT&interval=D&limit=180`,
          parse: (d) => {
            const rows = d?.result?.list;
            if (!Array.isArray(rows) || rows.length === 0) return null;
            return rows.map(r => ({
              date: new Date(parseInt(r[0])).toISOString().slice(0,10),
              open: parseFloat(r[1]), high: parseFloat(r[2]),
              low: parseFloat(r[3]), close: parseFloat(r[4]),
              volume: parseFloat(r[5])
            })).filter(r => r.close > 0).reverse();
          }
        });

        // 7) Gate.io (çok geniş coin listesi)
        cryptoApis.push({
          name: 'Gate.io',
          url: `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${ticker}_USDT&interval=1d&limit=180`,
          parse: (d) => {
            if (!Array.isArray(d) || d.length === 0) return null;
            return d.map(r => ({
              date: new Date(parseInt(r[0]) * 1000).toISOString().slice(0,10),
              open: parseFloat(r[5]), high: parseFloat(r[3]),
              low: parseFloat(r[4]), close: parseFloat(r[2]),
              volume: parseFloat(r[1])
            })).filter(r => r.close > 0);
          }
        });

        // 8) MEXC (geniş altcoin desteği)
        cryptoApis.push({
          name: 'MEXC',
          url: `https://api.mexc.com/api/v3/klines?symbol=${ticker}USDT&interval=1d&limit=180`,
          parse: (d) => Array.isArray(d) && d.length > 0
            ? d.map(k => ({ date: new Date(k[0]).toISOString().slice(0,10),
                open: parseFloat(k[1]), high: parseFloat(k[2]),
                low: parseFloat(k[3]), close: parseFloat(k[4]),
                volume: parseFloat(k[5]) })).filter(r => r.close > 0)
            : null
        });
        // 9) HTX (Huobi)
        cryptoApis.push({
          name: 'HTX',
          url: `https://api.huobi.pro/market/history/kline?period=1day&size=180&symbol=${ticker.toLowerCase()}usdt`,
          parse: (d) => {
            if (d?.status !== 'ok' || !Array.isArray(d.data)) return null;
            const rows = d.data.map(k => ({
              date: new Date(k.id * 1000).toISOString().slice(0,10),
              open: parseFloat(k.open), high: parseFloat(k.high),
              low: parseFloat(k.low), close: parseFloat(k.close),
              volume: parseFloat(k.vol)
            })).filter(r => r.close > 0).reverse();
            return rows.length >= 20 ? rows : null;
          }
        });
        // 10) KuCoin
        const snrKucoinStart = Math.floor((Date.now() - 180*86400*1000) / 1000);
        const snrKucoinEnd = Math.floor(Date.now() / 1000);
        cryptoApis.push({
          name: 'KuCoin',
          url: `https://api.kucoin.com/api/v1/market/candles?type=1day&symbol=${ticker}-USDT&startAt=${snrKucoinStart}&endAt=${snrKucoinEnd}`,
          parse: (d) => {
            if (d?.code !== '200000' || !Array.isArray(d.data)) return null;
            const rows = d.data.map(k => ({
              date: new Date(parseInt(k[0]) * 1000).toISOString().slice(0,10),
              open: parseFloat(k[1]), close: parseFloat(k[2]),
              high: parseFloat(k[3]), low: parseFloat(k[4]),
              volume: parseFloat(k[5])
            })).filter(r => r.close > 0).reverse();
            return rows.length >= 20 ? rows : null;
          }
        });

        // ── Sırayla dene ──────────────────────────────────────────────────
        let lastApiErr = null;
        for (const api of cryptoApis) {
          try {
            const resp = await axios.get(api.url, { timeout: 12000 });
            const parsed = api.parse(resp.data);
            if (parsed && parsed.length >= 20) {
              raw = parsed;
              console.log(`[SNR Kripto] ${ticker} verisi ${api.name} kaynağından alındı (${parsed.length} bar)`);
              break;
            }
          } catch (e) {
            lastApiErr = e;
            console.warn(`[SNR Kripto] ${api.name} başarısız (${ticker}): ${e.message}`);
          }
        }
        if (!raw || raw.length === 0) {
          throw new Error(`${ticker} için kripto veri alınamadı. Denenen kaynaklar: ${cryptoApis.map(a=>a.name).join(', ')}`);
        }
      } else {
        raw = await liveDataService.fetchHistoricalData(rawSym, '6mo', '1d');
      }
      if (raw && raw.length > 0) {
        historicalData = raw.map(r => ({
          time: Math.floor(new Date(r.date || r.timestamp).getTime() / 1000),
          open: r.open,
          high: r.high,
          low: r.low,
          close: r.close,
          volume: r.volume,
        }));
      }
    } catch (e) {
      console.error('[SNR] Veri hatasi:', e.message);
    }

    if (!historicalData || historicalData.length < 20) {
      return res.status(503).json({ success: false, error: 'Yeterli veri alinamadi' });
    }

    const analysis = await snrService.analyzeSNR(symbol, historicalData, { assetType });
    res.json({ success: true, ...analysis });
  } catch (err) {
    console.error('[SNR] Hata:', err.message);
    res.status(500).json({ success: false, error: 'SNR analizi yapilamadi' });
  }
});

// BIST30 SNR Scanner — yüksek puanlı sinyaller
// SNR scanner cache — scope bazlı
const snrScannerCacheMap = new Map(); // scope -> { results, ts }
const SNR_SCANNER_TTL_FAST = 10 * 60 * 1000;
const SNR_SCANNER_TTL_ALL = 30 * 60 * 1000;

async function runSnrScan(scope) {
  let universe;
  if (scope === 'bist30') universe = bist30Stocks;
  else if (scope === 'all') universe = allBistStocks;
  else universe = bist100Stocks;

  const results = [];
  const BATCH = scope === 'all' ? 12 : 10;
  const PAUSE = scope === 'all' ? 200 : 250;

  for (let i = 0; i < universe.length; i += BATCH) {
    const batch = universe.slice(i, i + BATCH);
    const batchRes = await Promise.allSettled(batch.map(async (stock) => {
      try {
        const symbol = stock.symbol.replace('.IS', '');
        const raw = await liveDataService.fetchHistoricalData(symbol, '6mo', '1d');
        if (!raw || raw.length < 20) return null;
        const candles = raw.map(r => ({
          time: Math.floor(new Date(r.date || r.timestamp).getTime() / 1000),
          open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
        }));
        const analysis = await snrService.analyzeSNR(symbol, candles);
        if (analysis.signals && analysis.signals.length > 0) {
          return {
            symbol,
            name: stock.name || symbol,
            topSignal: analysis.signals[0],
            storyline: analysis.storyline,
          };
        }
        return null;
      } catch { return null; }
    }));
    batchRes.forEach(r => { if (r.status === 'fulfilled' && r.value) results.push(r.value); });
    if (i + BATCH < universe.length) await new Promise(r => setTimeout(r, PAUSE));
  }
  results.sort((a, b) => b.topSignal.score - a.topSignal.score);
  return results;
}

// Genel route — scope query parametreli
app.get('/api/snr/scanner', async (req, res) => {
  try {
    const scope = ['bist30', 'bist100', 'all'].includes(req.query.scope) ? req.query.scope : 'bist100';
    const ttl = scope === 'all' ? SNR_SCANNER_TTL_ALL : SNR_SCANNER_TTL_FAST;
    const cached = snrScannerCacheMap.get(scope);
    if (cached && Date.now() - cached.ts < ttl) {
      return res.json({ success: true, scope, results: cached.results });
    }
    const results = await runSnrScan(scope);
    snrScannerCacheMap.set(scope, { results, ts: Date.now() });
    res.json({ success: true, scope, results });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Tarama yapilamadi' });
  }
});

// Geriye uyumluluk: eski /scanner/bist30 route'u
app.get('/api/snr/scanner/bist30', async (req, res) => {
  try {
    const cached = snrScannerCacheMap.get('bist30');
    if (cached && Date.now() - cached.ts < SNR_SCANNER_TTL_FAST) {
      return res.json({ success: true, results: cached.results });
    }
    const results = await runSnrScan('bist30');
    snrScannerCacheMap.set('bist30', { results, ts: Date.now() });
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Tarama yapilamadi' });
  }
});

// ============ DAILY SIGNALS (09:55 pre-market + 11:00 revision) ============
const dailySignalsService = require('./services/dailySignalsService');
const snapshotStore = require('./services/snapshotStore');
const cronJobsService = require('./services/cronJobs');
const dailyPerformanceService = require('./services/dailyPerformanceService');

// Gün sonu performans — son N tarih listesi
app.get('/api/market/daily-performance/dates', (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit || '30', 10), 1), 90);
    const dates = dailyPerformanceService.listAvailableDates(limit);
    res.json({ dates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Gün sonu performans — tek tarih (snapshot'tan veya ?compute=1 ile canlı)
app.get('/api/market/daily-performance/:date', async (req, res) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date YYYY-MM-DD formatinda olmali' });
    }
    const stored = dailyPerformanceService.getStoredPerformance(date);
    if (stored) return res.json({ source: 'snapshot', ...stored });
    if (req.query.compute === '1' || req.query.compute === 'true') {
      const live = await dailyPerformanceService.computePerformance(date);
      return res.json({ source: 'live', ...live });
    }
    res.status(404).json({
      error: 'Bu tarih icin performans hesaplanmadi',
      date,
      hint: 'POST /api/admin/compute-performance?date=YYYY-MM-DD veya ?compute=1 ekleyin',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bugünün snapshot'ı — premarket + revision + intraday hepsi tek payload'da
app.get('/api/daily-signals/today', (req, res) => {
  try {
    const date = snapshotStore.dateKey();
    const data = snapshotStore.read(date) || { date, premarket: null, revision: null, intraday: [] };
    res.json({
      success: true,
      ...data,
      reasons: dailySignalsService.REVISION_REASONS,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Belirli bir tarihin snapshot'ı (backtest için)
app.get('/api/daily-signals/by-date/:date', (req, res) => {
  try {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'Geçersiz tarih formatı (YYYY-MM-DD)' });
    }
    const data = snapshotStore.read(date);
    if (!data) return res.status(404).json({ success: false, error: 'Bu tarihte kayıt yok' });
    res.json({ success: true, ...data, reasons: dailySignalsService.REVISION_REASONS });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Mevcut tarihler (geçmiş arşivi)
app.get('/api/daily-signals/history', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.days || '30', 10), 90);
    const dates = snapshotStore.listAvailableDates(limit);
    const summaries = dates.map(d => {
      const snap = snapshotStore.read(d);
      return {
        date: d,
        premarketCount: snap?.premarket?.signals?.length || 0,
        revisionCount: snap?.revision?.signals?.length || 0,
        diffCount: snap?.revision?.diff?.length || 0,
        topSymbols: (snap?.revision?.signals || snap?.premarket?.signals || []).slice(0, 5).map(s => s.symbol),
      };
    });
    res.json({ success: true, dates: summaries });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Manuel tetikleme — admin/test (production'da auth eklenecek)
app.post('/api/daily-signals/generate', async (req, res) => {
  try {
    const phase = ['premarket', 'revision', 'intraday'].includes(req.body?.phase)
      ? req.body.phase
      : 'premarket';
    const result = await cronJobsService.triggerDailyPhase(phase);
    if (!result) return res.status(500).json({ success: false, error: 'Üretim başarısız' });
    res.json({ success: true, phase, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Selftest — bugünkü snapshot vs canlı fiyat
app.get('/api/daily-signals/selftest', (req, res) => {
  try {
    const result = dailySignalsService.selftest();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Backtest — geçmiş tarih bazlı simülasyon (gelecek veriyi sızdırmadan)
//   ?asOf=YYYY-MM-DD     (geçmiş trade günü)
//   ?horizon=5           (varsayılan 5 mum, max 30)
app.get('/api/daily-signals/backtest', async (req, res) => {
  try {
    const asOf = req.query.asOf;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || '')) {
      return res.status(400).json({ success: false, error: 'asOf zorunlu (YYYY-MM-DD)' });
    }
    const horizon = Math.min(Math.max(parseInt(req.query.horizon || '5', 10), 1), 30);
    const result = await dailySignalsService.backtestAsOf(asOf, horizon);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============ CRYPTO SIGNALS (top 100 — spot/futures long/short) ============
const cryptoSignalsService = require('./services/cryptoSignalsService');
const cryptoSnapshotStore = require('./services/cryptoSnapshotStore');

app.get('/api/market/crypto/signals', async (req, res) => {
  try {
    const date = cryptoSnapshotStore.dateKey();
    const snap = cryptoSnapshotStore.read(date);
    if (!snap) {
      // İlk açılışta hiç cron çalışmamış olabilir → manuel intraday üret
      const result = await cronJobsService.triggerCryptoPhase('intraday');
      if (!result) {
        return res.status(503).json({
          success: false,
          error: 'Kripto sinyalleri henüz hazır değil — birkaç dakika sonra tekrar deneyin',
        });
      }
      return res.json({ success: true, ...result, source: 'fresh' });
    }
    const phaseData = cryptoSnapshotStore.getCurrentPhase(snap);
    res.json({
      success: true,
      date: snap.date,
      ...phaseData,
      availablePhases: ['morning', 'midday', 'evening', 'night']
        .filter(p => snap[p]).reduce((m, p) => { m[p] = snap[p].generatedAt; return m; }, {}),
      intradayCount: snap.intraday?.length || 0,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/market/crypto/signals/history', (req, res) => {
  try {
    const { date } = req.query;
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ success: false, error: 'Geçersiz tarih formatı (YYYY-MM-DD)' });
      }
      const data = cryptoSnapshotStore.read(date);
      if (!data) return res.status(404).json({ success: false, error: 'Bu tarihte kayıt yok' });
      return res.json({ success: true, ...data });
    }
    const limit = Math.min(parseInt(req.query.days || '30', 10), 90);
    const dates = cryptoSnapshotStore.listAvailableDates(limit);
    res.json({ success: true, dates });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/market/crypto/coin/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ success: false, error: 'Sembol zorunlu' });
    const result = await cryptoSignalsService.analyzeSingleCoin(symbol);
    if (!result) {
      return res.status(404).json({ success: false, error: `${symbol} top 100'de yok ya da Binance USDT paritesinde değil` });
    }
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Manuel tetikleme — ilk önbellek + admin/test
app.post('/api/market/crypto/generate', async (req, res) => {
  try {
    const phase = ['morning', 'midday', 'evening', 'night', 'intraday'].includes(req.body?.phase)
      ? req.body.phase
      : 'intraday';
    const result = await cronJobsService.triggerCryptoPhase(phase);
    if (!result) return res.status(500).json({ success: false, error: 'Üretim başarısız' });
    res.json({ success: true, phase, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Backtest — geçmiş tarih + horizon ile sinyal performans testi
//   ?asOf=YYYY-MM-DD       (geçmiş trade günü)
//   ?horizon=7             (varsayılan 7 mum, max 30)
app.get('/api/market/crypto/backtest', async (req, res) => {
  try {
    const asOf = req.query.asOf;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || '')) {
      return res.status(400).json({ success: false, error: 'asOf zorunlu (YYYY-MM-DD)' });
    }
    const horizon = Math.min(Math.max(parseInt(req.query.horizon || '7', 10), 1), 30);
    const result = await cryptoSignalsService.backtestAsOf(asOf, horizon);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============ MULTI-TIMEFRAME (1h / 4h / 1d / 1w) ============
const multiTimeframeService = require('./services/multiTimeframeService');
const mtfSnapshotStore = require('./services/mtfSnapshotStore');

const MTF_VALID = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

// Tek TF için snapshot'tan veya canlı tarama
app.get('/api/market/crypto/mtf/scanner', async (req, res) => {
  try {
    const tf = MTF_VALID.includes(req.query.tf) ? req.query.tf : '4h';
    const date = mtfSnapshotStore.dateKey();
    let block = mtfSnapshotStore.getTimeframe(date, tf);
    let source = 'snapshot';
    if (!block) {
      // İlk açılışta cron çalışmamış olabilir — manuel tetikle
      const result = await cronJobsService.triggerMTFPhase(tf);
      if (!result) return res.status(503).json({ success: false, error: 'MTF taraması henüz hazır değil' });
      block = { generatedAt: result.generatedAt, scanner: result.scanner };
      source = 'fresh';
    }
    res.json({ success: true, date, timeframe: tf, source, ...block });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Tek coin için 4 TF + confluence
app.get('/api/market/crypto/mtf/coin/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ success: false, error: 'Sembol zorunlu' });
    const result = await multiTimeframeService.analyzeCoinAllTFs(symbol);
    if (!result) return res.status(404).json({ success: false, error: `${symbol} top 100'de yok ya da Binance USDT paritesinde değil` });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Confluence — tüm TF'lerin ağırlıklı toplamından çıkan multi-TF özeti
app.get('/api/market/crypto/mtf/confluence', async (req, res) => {
  try {
    const date = mtfSnapshotStore.dateKey();
    const snap = mtfSnapshotStore.read(date);
    let confluence = snap?.confluence || null;
    if (!confluence) {
      // Snapshot'ta yoksa canlı hesapla (snapshot varsa cache'ten)
      confluence = await multiTimeframeService.scanConfluence();
    }
    res.json({ success: true, date, ...confluence });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Manuel trigger — admin/test
app.post('/api/market/crypto/mtf/generate', async (req, res) => {
  try {
    const tf = MTF_VALID.includes(req.body?.tf) ? req.body.tf : '4h';
    const result = await cronJobsService.triggerMTFPhase(tf);
    if (!result) return res.status(500).json({ success: false, error: 'MTF üretim başarısız' });
    res.json({ success: true, timeframe: tf, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============ MTF BACKTEST + CALIBRATION (Faz 6 + 7) ============
const mtfBacktestService = require('./services/mtfBacktestService');
const mtfCalibrationService = require('./services/mtfCalibrationService');

// Tek TF × tek asOf backtest
//   ?tf=1h&asOf=YYYY-MM-DD&horizon=24
app.get('/api/market/crypto/mtf/backtest', async (req, res) => {
  try {
    const tf = MTF_VALID.includes(req.query.tf) ? req.query.tf : '4h';
    const asOf = req.query.asOf;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || '')) {
      return res.status(400).json({ success: false, error: 'asOf zorunlu (YYYY-MM-DD)' });
    }
    const horizon = Math.max(1, Math.min(parseInt(req.query.horizon || '0', 10) || 0, 200))
      || mtfBacktestService.TF_DEFAULT_HORIZON[tf];
    const result = await mtfBacktestService.backtestTFAsOf(tf, asOf, horizon);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Calibration tablosu snapshot — TF × yön × bucket dökümü
app.get('/api/market/crypto/mtf/calibration', (req, res) => {
  try {
    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      snapshot: mtfCalibrationService.getSnapshot(),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Manuel calibration tetikleme (admin/test) — body: { tfs?, daysBack?, save? }
app.post('/api/market/crypto/mtf/calibrate', async (req, res) => {
  try {
    const tfs       = Array.isArray(req.body?.tfs) ? req.body.tfs : ['1h', '4h', '1d'];
    const daysBack  = Math.max(1, Math.min(parseInt(req.body?.daysBack || '7', 10), 30));
    const save      = req.body?.save !== false;
    // Async, blocking — uzun sürer (her TF × her gün ~5-10sn)
    const result = await mtfBacktestService.calibrateFromHistory({ tfs, daysBack, save });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============ X (TWITTER) MENTION ROUTES ============
// dexter (virattt/dexter) src/tools/search/x-search.ts'ten esinli.
// Şu an mock data; ileride twscrape → RapidAPI → resmi X API v2'ye geçilecek.
const xMentionService = require('./services/xMentionService');

// Tarayıcı: scope=bist30 | bist100 | all | crypto | crypto_top10 | crypto_all (default: bist100)
const X_MENTION_SCOPES = ['bist30', 'bist100', 'all', 'crypto', 'crypto_top10', 'crypto_all'];
app.get('/api/x-mentions/scanner', (req, res) => {
  try {
    const scope = X_MENTION_SCOPES.includes(req.query.scope) ? req.query.scope : 'bist100';
    const result = xMentionService.scanMentions(scope);
    res.json(result);
  } catch (err) {
    console.error('[X-Mentions] Tarayici hata:', err.message);
    res.status(500).json({ success: false, error: 'X mention tarama yapilamadi' });
  }
});

// Tek sembol detayı: ?type=crypto|stock zorunlu değil (auto-detect)
app.get('/api/x-mentions/:symbol', (req, res) => {
  try {
    const assetType = ['crypto', 'stock'].includes(req.query.type) ? req.query.type : undefined;
    const result = xMentionService.getMentionDetail(req.params.symbol, { assetType });
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    console.error('[X-Mentions] Detay hata:', err.message);
    res.status(500).json({ success: false, error: 'X mention detayi alinamadi' });
  }
});

// ============ DCF (DISCOUNTED CASH FLOW) ROUTES ============
// dexter (virattt/dexter) src/skills/dcf/ metodolojisinden uyarlandı.
// 5y FCF projeksiyonu + Gordon terminal + sektör bazlı WACC + 3×3 sensitivity matrix.
const dcfService = require('./services/dcfService');
const { getAllSectorWACC } = require('./data/sectorWACC');

// Sektör WACC referans tablosu — UI'da göstermek için
app.get('/api/dcf/sector-wacc', (req, res) => {
  try {
    const mode = req.query.mode === 'tl' ? 'tl' : 'usd';
    res.json({ success: true, mode, table: getAllSectorWACC(mode) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tek sembol DCF değerleme
app.get('/api/dcf/:symbol', async (req, res) => {
  try {
    const mode = req.query.mode === 'tl' ? 'tl' : 'usd';
    const result = await dcfService.valuateDCF(req.params.symbol, { mode });
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    console.error('[DCF] Hata:', err.message);
    res.status(500).json({ success: false, error: 'DCF hesaplanamadi: ' + err.message });
  }
});

// ============ CRYPTO QUOTE ROUTES (CoinGecko) ============
// dexter src/tools/finance/crypto.ts'ten esinli — CoinGecko ücretsiz API
const cryptoQuoteService = require('./services/cryptoQuoteService');
const cryptoValuationService = require('./services/cryptoValuationService');

// Composite valuation — DCF mantığında ama crypto için (drawdown + MA + S2F + NVT + volatility)
app.get('/api/crypto/valuation/:symbol', async (req, res) => {
  try {
    const result = await cryptoValuationService.valuateCrypto(req.params.symbol);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    console.error('[CryptoValuation] Hata:', err.message);
    res.status(500).json({ success: false, error: 'Değerleme hesaplanamadı: ' + err.message });
  }
});

app.get('/api/crypto/quote/:symbol', async (req, res) => {
  try {
    const result = await cryptoQuoteService.getQuote(req.params.symbol);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    console.error('[Crypto] Quote hata:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/crypto/batch', async (req, res) => {
  try {
    const symbols = (req.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean);
    if (symbols.length === 0) return res.status(400).json({ success: false, error: 'symbols query parametresi gerekli (comma-separated)' });
    const result = await cryptoQuoteService.getBatchQuotes(symbols);
    res.json(result);
  } catch (err) {
    console.error('[Crypto] Batch hata:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/crypto/search', async (req, res) => {
  try {
    const result = await cryptoQuoteService.search(req.query.q || '');
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/crypto/trending', async (req, res) => {
  try {
    const result = await cryptoQuoteService.getTrending();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ WEB SCRAPER ROUTES (axios + cheerio) ============
// dexter src/tools/browser/browser.ts'ten esinli — TR finansal haber kazıma
const webScraperService = require('./services/webScraperService');

app.get('/api/scraper/sources', (req, res) => {
  try {
    res.json({ success: true, sources: webScraperService.listSources() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tüm kaynaklardan birleşik akış. ?category=general|crypto
app.get('/api/scraper/news', async (req, res) => {
  try {
    const category = ['general', 'crypto'].includes(req.query.category) ? req.query.category : null;
    const result = await webScraperService.fetchMultipleSources(category);
    res.json(result);
  } catch (err) {
    console.error('[Scraper] News hata:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/scraper/news/:source', async (req, res) => {
  try {
    const result = await webScraperService.fetchRSS(req.params.source);
    if (!result.success) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sayfa içerik çıkarma (sadece izinli domain) — POST yerine GET ?url= kullanılıyor
app.get('/api/scraper/extract', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ success: false, error: 'url query parametresi gerekli' });
    const result = await webScraperService.extractPage(url);
    if (!result.success) return res.status(403).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============ KAP ROUTES — GERÇEK kap.org.tr API ============
const kapDisclosureService = require('./services/kapDisclosureService');

// Stok adı tamamlama (sembol → name) için lookup
const _stockNameByCode = (() => {
  const m = new Map();
  for (const s of allBistStocks) m.set(s.symbol, s.name);
  return m;
})();

app.get('/api/kap/news', async (req, res) => {
  const { stockSymbol, sentiment, limit = 30 } = req.query;
  try {
    const result = await kapDisclosureService.fetchDisclosures({
      days: 7, pageSize: 200, stockSymbol: stockSymbol || null,
    });
    if (!result.success) {
      return res.status(503).json({ news: [], total: 0, error: result.error, source: result.source });
    }
    let items = result.items;
    if (sentiment) items = items.filter(n => n.sentiment === sentiment);
    // Frontend uyumu için stockName ekle
    items = items.map(n => ({ ...n, stockName: n.stockSymbol ? (_stockNameByCode.get(n.stockSymbol) || n.stockSymbol) : null }));
    res.json({
      news: items.slice(0, parseInt(limit)),
      total: items.length,
      lastUpdate: result.lastUpdate,
      source: result.source,
    });
  } catch (err) {
    console.error('[KAP /news]', err.message);
    res.status(500).json({ news: [], error: 'KAP haberleri alınamadı: ' + err.message });
  }
});

app.get('/api/kap/anomalies', async (req, res) => {
  try {
    const result = await kapDisclosureService.detectAnomalies({ days: 7, threshold: 3 });
    if (!result.success) {
      return res.status(503).json({ anomalies: [], error: result.error, source: 'KAP API' });
    }
    const anomalies = result.items.map(a => ({
      ...a,
      name: _stockNameByCode.get(a.symbol) || a.symbol,
    }));
    res.json({
      anomalies,
      total: anomalies.length,
      days: result.days,
      lastUpdate: result.lastUpdate,
      source: result.source,
    });
  } catch (err) {
    console.error('[KAP /anomalies]', err.message);
    res.status(500).json({ anomalies: [], error: 'KAP anomali tespiti yapılamadı: ' + err.message });
  }
});

// ============ USER ROUTES ============
app.get('/api/user/watchlist', (req, res) => {
  const watchlistStocks = watchlist
    .map(symbol => liveDataService.getStock(symbol) || allBistStocks.find(s => s.symbol === symbol))
    .filter(Boolean);

  res.json({ watchlist: watchlistStocks });
});

app.post('/api/user/watchlist', (req, res) => {
  const { symbol } = req.body;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  const upperSymbol = symbol.toUpperCase();

  if (!watchlist.includes(upperSymbol)) {
    watchlist.push(upperSymbol);
  }

  res.json({ success: true, message: `${upperSymbol} takip listesine eklendi` });
});

app.delete('/api/user/watchlist/:symbol', (req, res) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();

  watchlist = watchlist.filter(s => s !== upperSymbol);

  res.json({ success: true, message: `${upperSymbol} takip listesinden cikarildi` });
});

app.get('/api/user/settings', (req, res) => {
  res.json({ user: mockUser });
});

app.put('/api/user/settings', (req, res) => {
  const updates = req.body;
  Object.assign(mockUser, updates);
  res.json({ success: true, user: mockUser });
});

// ============ CHART ROUTES ============
app.get('/api/chart/tradingview/:symbol', (req, res) => {
  const { symbol } = req.params;
  res.json({
    url: `https://tr.tradingview.com/chart/?symbol=BIST:${symbol.toUpperCase()}`,
    widgetUrl: `https://s.tradingview.com/widgetembed/?symbol=BIST:${symbol.toUpperCase()}`
  });
});

app.get('/api/chart/data/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { interval = '1d', range = '3mo' } = req.query;

  try {
    const data = await liveDataService.fetchHistoricalData(symbol.toUpperCase(), range, interval);

    if (!data) {
      return res.status(404).json({ error: 'Veri bulunamadi' });
    }

    res.json({
      symbol: symbol.toUpperCase(),
      interval,
      range,
      data
    });
  } catch (error) {
    console.error(`Chart veri hatasi ${symbol}:`, error);
    res.status(500).json({ error: 'Veri alinamadi' });
  }
});

app.get('/api/chart/intervals', (req, res) => {
  res.json({
    intervals: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'],
    ranges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '5y', 'all']
  });
});

// ============ SCAN ROUTES ============
// Per-strategy scan cache: { [type]: { data, ts } }
const scanCache = {};
const SCAN_CACHE_TTL = 10 * 60 * 1000; // 10 dk

const SCAN_NAMES = {
  'rsi-oversold':     'RSI Aşırı Satım',
  'rsi-overbought':   'RSI Aşırı Alım',
  'macd-bullish':     'MACD Yukarı Kesişim',
  'ema-crossover':    'EMA 5/21 Kesişim',
  'golden-cross':     'Golden Cross (50/200)',
  'bollinger-lower':  'Bollinger Alt Bant',
  'bollinger-squeeze':'Bollinger Sıkışma',
  'stoch-oversold':   'Stokastik Aşırı Satım',
  'williams-oversold':'Williams %R Aşırı Satım',
  'cci-oversold':     'CCI Aşırı Satım',
  'supertrend-buy':   'Supertrend Alış',
  'rsi-adx-strong':   'RSI + ADX Güçlü Trend',
  'volume-spike':     'Hacim Patlaması',
  'price-above-vwap': 'VWAP Üstünde',
  'ichimoku-bullish': 'Ichimoku Boğa',
  'ichimoku-bearish': 'Ichimoku Ayı',
};

app.get('/api/market/scans/:type', async (req, res) => {
  const { type } = req.params;

  // Cache kontrolü
  const now = Date.now();
  if (scanCache[type] && now - scanCache[type].ts < SCAN_CACHE_TTL) {
    return res.json(scanCache[type].data);
  }

  const stocks = bist30Stocks.map(s => ({ symbol: s.symbol || s, name: s.name || s.symbol || s }));
  const matchingStocks = [];
  const BATCH = 5;
  const DELAY = 300;

  for (let i = 0; i < stocks.length; i += BATCH) {
    const batch = stocks.slice(i, i + BATCH);
    await Promise.all(batch.map(async (stock) => {
      try {
        const hist = await liveDataService.fetchHistoricalData(stock.symbol, '3mo', '1d');
        if (!hist || hist.length < 50) return;

        const ind = liveDataService.calculateIndicators(hist);
        if (!ind) return;

        const closes = hist.map(d => d.close).filter(Boolean);
        const highs  = hist.map(d => d.high).filter(Boolean);
        const lows   = hist.map(d => d.low).filter(Boolean);
        const vols   = hist.map(d => d.volume).filter(v => v != null);
        const lastVol = vols[vols.length - 1] || 0;

        let matches = false;
        let extraIndicators = {};

        switch (type) {
          case 'rsi-oversold':
            matches = ind.rsi != null && ind.rsi < 32;
            extraIndicators = { rsi: ind.rsi, signal: `RSI ${ind.rsi} - Aşırı Satım` };
            break;
          case 'rsi-overbought':
            matches = ind.rsi != null && ind.rsi > 70;
            extraIndicators = { rsi: ind.rsi, signal: `RSI ${ind.rsi} - Aşırı Alım` };
            break;
          case 'macd-bullish':
            matches = ind.macd != null && ind.macd > ind.macdSignal && ind.macdHistogram > 0;
            extraIndicators = { macd: ind.macd, rsi: ind.rsi, signal: 'MACD Yukarı Kesişim' };
            break;
          case 'ema-crossover':
            matches = ind.ema5 != null && ind.ema21 != null && ind.ema5 > ind.ema21 && ind.currentPrice > (ind.ema50 || 0);
            extraIndicators = { rsi: ind.rsi, macd: ind.macd, signal: 'EMA 5 > EMA 21' };
            break;
          case 'golden-cross':
            matches = ind.ema50 != null && ind.ema200 != null && ind.ema50 > ind.ema200;
            extraIndicators = { rsi: ind.rsi, signal: 'EMA50 > EMA200' };
            break;
          case 'bollinger-lower':
            matches = ind.bollingerLower != null && ind.currentPrice <= ind.bollingerLower * 1.015;
            extraIndicators = { rsi: ind.rsi, lower: ind.bollingerLower, signal: 'Fiyat Alt Bantta' };
            break;
          case 'bollinger-squeeze': {
            const bw = ind.bollingerMiddle ? (ind.bollingerUpper - ind.bollingerLower) / ind.bollingerMiddle : 1;
            matches = bw < 0.06;
            extraIndicators = { rsi: ind.rsi, bandwidth: +(bw * 100).toFixed(2), upper: ind.bollingerUpper, lower: ind.bollingerLower, signal: `Bant Genişliği %${+(bw*100).toFixed(1)}` };
            break;
          }
          case 'stoch-oversold':
            matches = ind.stochRsiK != null && ind.stochRsiK < 20;
            extraIndicators = { rsi: ind.rsi, signal: `Stoch K: ${ind.stochRsiK}` };
            break;
          case 'williams-oversold':
            matches = ind.williamsR != null && ind.williamsR < -80;
            extraIndicators = { rsi: ind.rsi, signal: `Williams %R: ${ind.williamsR}` };
            break;
          case 'cci-oversold':
            matches = ind.cci != null && ind.cci < -100;
            extraIndicators = { rsi: ind.rsi, signal: `CCI: ${ind.cci}` };
            break;
          case 'supertrend-buy':
            matches = ind.rsi != null && ind.rsi > 50 && ind.currentPrice > (ind.ema50 || 0) && ind.macd != null && ind.macd > ind.macdSignal;
            extraIndicators = { rsi: ind.rsi, macd: ind.macd, signal: 'Supertrend Alış Modu' };
            break;
          case 'rsi-adx-strong':
            matches = ind.rsi != null && ind.rsi >= 40 && ind.rsi <= 65 && ind.macd != null && ind.macd > 0 && ind.ema5 > ind.ema21;
            extraIndicators = { rsi: ind.rsi, macd: ind.macd, signal: 'Güçlü Yükseliş Trendi' };
            break;
          case 'volume-spike': {
            const volSma = ind.volumeSMA20 || 0;
            const volRatio = volSma > 0 ? +(lastVol / volSma).toFixed(2) : 0;
            matches = volRatio >= 2;
            extraIndicators = { rsi: ind.rsi, signal: `Hacim ${volRatio}x Ortalamanın Üstünde` };
            if (matches) matchingStocks.push({ symbol: stock.symbol, name: stock.name, price: ind.currentPrice, changePercent: ind.priceChange24h, volumeRatio: volRatio, indicators: extraIndicators });
            return;
          }
          case 'price-above-vwap':
            matches = ind.rsi != null && ind.rsi >= 45 && ind.rsi <= 65 && ind.currentPrice > (ind.sma20 || 0);
            extraIndicators = { rsi: ind.rsi, macd: ind.macd, signal: 'Fiyat VWAP Üstünde' };
            break;
          case 'ichimoku-bullish': {
            // Tenkan(9), Kijun(26): HL midpoints
            const t9h = Math.max(...highs.slice(-9)), t9l = Math.min(...lows.slice(-9));
            const k26h = Math.max(...highs.slice(-26)), k26l = Math.min(...lows.slice(-26));
            const tenkan = (t9h + t9l) / 2;
            const kijun  = (k26h + k26l) / 2;
            const senkouA = (tenkan + kijun) / 2;
            const k52h = highs.length >= 52 ? Math.max(...highs.slice(-52)) : k26h;
            const k52l = lows.length >= 52 ? Math.min(...lows.slice(-52)) : k26l;
            const senkouB = (k52h + k52l) / 2;
            const cloudTop = Math.max(senkouA, senkouB);
            matches = ind.currentPrice > cloudTop && tenkan > kijun;
            extraIndicators = { rsi: ind.rsi, tenkan: +tenkan.toFixed(2), kijun: +kijun.toFixed(2), senkouA: +senkouA.toFixed(2), senkouB: +senkouB.toFixed(2), signal: 'Fiyat Bulut Üstünde + TK Kesişim' };
            break;
          }
          case 'ichimoku-bearish': {
            const t9h = Math.max(...highs.slice(-9)), t9l = Math.min(...lows.slice(-9));
            const k26h = Math.max(...highs.slice(-26)), k26l = Math.min(...lows.slice(-26));
            const tenkan = (t9h + t9l) / 2;
            const kijun  = (k26h + k26l) / 2;
            const senkouA = (tenkan + kijun) / 2;
            const k52h = highs.length >= 52 ? Math.max(...highs.slice(-52)) : k26h;
            const k52l = lows.length >= 52 ? Math.min(...lows.slice(-52)) : k26l;
            const senkouB = (k52h + k52l) / 2;
            const cloudBottom = Math.min(senkouA, senkouB);
            matches = ind.currentPrice < cloudBottom && tenkan < kijun;
            extraIndicators = { rsi: ind.rsi, tenkan: +tenkan.toFixed(2), kijun: +kijun.toFixed(2), senkouA: +senkouA.toFixed(2), senkouB: +senkouB.toFixed(2), signal: 'Fiyat Bulut Altında + TK Kesişim' };
            break;
          }
          default:
            matches = false;
        }

        if (matches) {
          matchingStocks.push({
            symbol: stock.symbol,
            name: stock.name,
            price: ind.currentPrice,
            changePercent: ind.priceChange24h,
            indicators: extraIndicators
          });
        }
      } catch (e) { /* sessiz */ }
    }));
    if (i + BATCH < stocks.length) await new Promise(r => setTimeout(r, DELAY));
  }

  const result = {
    stocks: matchingStocks,
    total: matchingStocks.length,
    scanned: stocks.length,
    strategy: SCAN_NAMES[type] || type,
    timestamp: new Date().toISOString(),
  };
  scanCache[type] = { data: result, ts: now };
  res.json(result);
});

// Harmonik paternler — GERÇEK ZigZag swing detection + Fibonacci ratio matching
// (harmonicPatternService.js, Scott Carney "Harmonic Trading" oranlarını kullanır)
const harmonicPatternService = require('./services/harmonicPatternService');
const HARMONICS_TTL = 10 * 60 * 1000;
let harmonicsCache = null;
let harmonicsCacheTs = 0;

app.get('/api/market/harmonics', async (req, res) => {
  if (harmonicsCache && (Date.now() - harmonicsCacheTs) < HARMONICS_TTL) {
    return res.json(harmonicsCache);
  }

  const universe = bist30Stocks;
  const results = [];
  const BATCH = 5;
  const DELAY = 250;

  for (let i = 0; i < universe.length; i += BATCH) {
    const batch = universe.slice(i, i + BATCH);
    await Promise.all(batch.map(async (sm) => {
      try {
        const hist = await liveDataService.fetchHistoricalData(sm.symbol, '1y', '1d');
        if (!hist || hist.length < 60) return;
        const detected = harmonicPatternService.detectLatestHarmonic(hist, 0.04);
        if (!detected) return; // patern yoksa hisseyi atla — uydurma yapmıyoruz

        const live = liveDataService.getStock(sm.symbol) || {};
        const price = live.price || hist[hist.length - 1].close;

        // ── Geçerlilik metadata (SNR ile aynı kural) ──────────────────────
        // Harmonic paterni D noktasından girilir; D çok eski veya çok uzaksa
        // patern artık aktif sayılmaz (kullanıcıya yanıltıcı eski sinyal verme).
        const dDate = detected.points?.D?.date;
        const dPrice = detected.points?.D?.price || 0;
        const daysAgo = dDate
          ? Math.max(0, Math.round((Date.now() - new Date(dDate).getTime()) / 86400000))
          : null;
        const priceDistancePct = price > 0 && dPrice > 0
          ? +(Math.abs(dPrice - price) / price * 100).toFixed(2)
          : null;
        const MAX_REACH_PCT_HARMONIC = 8;
        const MAX_AGE_DAYS_HARMONIC  = 60;
        const inRange    = priceDistancePct != null && priceDistancePct <= MAX_REACH_PCT_HARMONIC;
        const isRecent   = daysAgo == null || daysAgo <= MAX_AGE_DAYS_HARMONIC;
        const isActionable = inRange && isRecent;

        results.push({
          symbol: sm.symbol,
          name: sm.name,
          currentPrice: +price.toFixed(2),
          pattern: detected.pattern,
          direction: detected.direction,
          completion: detected.completion,
          targetPrice: detected.targetPrice,
          stopLoss: detected.stopLoss,
          ratios: detected.ratios,
          points: detected.points,
          daysAgo,
          priceDistancePct,
          isActionable,
          isRecent,
          inRange,
          detectedDate: dDate || null,
        });
      } catch (e) { /* sessizce atla */ }
    }));
    if (i + BATCH < universe.length) await new Promise(r => setTimeout(r, DELAY));
  }

  // Aktif paternler önce + completion skoruna göre sırala
  results.sort((a, b) => {
    if (!!a.isActionable !== !!b.isActionable) return a.isActionable ? -1 : 1;
    return b.completion - a.completion;
  });

  const response = {
    patterns: results,
    total: results.length,
    activeCount: results.filter(r => r.isActionable).length,
    scanned: universe.length,
    dataSource: 'Yahoo Finance (1y daily) + ZigZag %4 + Carney harmonic ratios',
    scannedAt: new Date().toISOString(),
    rule: 'Aktif patern: D noktası ≤%8 mesafede ve ≤60 gün öncesi',
  };
  harmonicsCache = response;
  harmonicsCacheTs = Date.now();
  res.json(response);
});

// Fibonacci seviyeleri
app.get('/api/market/fibonacci', (req, res) => {
  const stocks = liveDataService.getAllStocks().slice(0, 15);

  const results = stocks.map(stock => {
    if (!stock.price || !stock.high || !stock.low) return null;

    const high = stock.high;
    const low = stock.low;
    const diff = high - low;
    const price = stock.price;

    // Hangi seviye fiyata en yakın? Aktif olarak gözlenecek seviye o.
    const levels = {
      '0%':    +low.toFixed(2),
      '23.6%': +(low + diff * 0.236).toFixed(2),
      '38.2%': +(low + diff * 0.382).toFixed(2),
      '50%':   +(low + diff * 0.5).toFixed(2),
      '61.8%': +(low + diff * 0.618).toFixed(2),
      '78.6%': +(low + diff * 0.786).toFixed(2),
      '100%':  +high.toFixed(2),
    };
    let nearestLevel = null;
    let nearestPct = Infinity;
    for (const [k, v] of Object.entries(levels)) {
      const distPct = Math.abs(v - price) / price * 100;
      if (distPct < nearestPct) { nearestPct = distPct; nearestLevel = k; }
    }

    return {
      symbol: stock.symbol,
      name: stock.name,
      currentPrice: price,
      levels,
      nearestLevel,
      nearestLevelDistancePct: +nearestPct.toFixed(2),
    };
  }).filter(Boolean);

  res.json({
    stocks: results,
    calculatedAt: new Date().toISOString(),
    note: 'Fibonacci seviyeleri günlük yüksek/düşük baz alınarak hesaplanır — her gün otomatik yenilenir.',
  });
});

// Manuel guncelleme endpoint
app.post('/api/admin/update-all', async (req, res) => {
  try {
    await liveDataService.updateAllStocks();
    res.json({
      success: true,
      message: 'Tum hisseler guncellendi',
      stockCount: liveDataService.getAllStocks().length,
      lastUpdate: liveDataService.getLastUpdateTime()?.toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Guncelleme basarisiz' });
  }
});

// Sistem bilgisi
app.get('/api/system/info', (req, res) => {
  res.json({
    name: 'Borsa Krali',
    version: '2.0.0',
    author: 'Borsa Krali',
    copyright: 'Tum haklari saklidir. Yalnizca egitim maksadiyla kullanilacaktir.',
    description: 'Profesyonel Borsa Istanbul Analiz Platformu',
    features: [
      'Gercek zamanli BIST verileri',
      '300+ hisse takibi',
      'Teknik analiz gostergeleri',
      'Temel analiz skorlari',
      'AI destekli oneri sistemi',
      'Canli heatmap gorunumu',
      'Telegram bildirim sistemi',
      'KAP entegrasyonu'
    ],
    dataSource: 'Yahoo Finance',
    updateInterval: '1 dakika',
    totalStocks: allBistStocks.length,
    bist30Count: bist30Stocks.length,
    bist100Count: bist100Stocks.length
  });
});

// ============ TELEGRAM & ALERT ROUTES ============

// Telegram bot durumu
app.get('/api/telegram/status', async (req, res) => {
  const status = await telegramService.checkBotStatus();
  res.json(status);
});

// Aktif alarmlar
app.get('/api/alerts', (req, res) => {
  const { limit = 50 } = req.query;
  const alerts = telegramService.getActiveAlerts(parseInt(limit));
  res.json({
    alerts,
    unreadCount: telegramService.getUnreadCount(),
    total: alerts.length
  });
});

// Alarm okundu isaretle
app.post('/api/alerts/:id/read', (req, res) => {
  const { id } = req.params;
  const success = telegramService.markAlertAsRead(parseInt(id));
  res.json({ success });
});

// Tum alarmlari temizle
app.delete('/api/alerts', (req, res) => {
  telegramService.clearAllAlerts();
  res.json({ success: true });
});

// Manuel sinyal kontrolu ve Telegram bildirimi
app.post('/api/signals/check', async (req, res) => {
  const stocks = liveDataService.getAllStocks().slice(0, 30);
  const newSignals = [];

  for (const stock of stocks) {
    try {
      const historicalData = await liveDataService.fetchHistoricalData(stock.symbol, '3mo', '1d');
      if (!historicalData || historicalData.length < 50) continue;

      const indicators = liveDataService.calculateIndicators(historicalData);
      if (!indicators) continue;

      // RSI Asiri Satim sinyali
      if (indicators.rsi < 30) {
        const signal = {
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          strategy: 'RSI Asiri Satim',
          description: `RSI ${indicators.rsi} seviyesinde - asiri satim bolgesi`,
          type: 'BUY',
          price: stock.price,
          changePercent: stock.changePercent,
          rsi: indicators.rsi,
          macd: indicators.macd
        };
        newSignals.push(signal);
        socketService.broadcastSignal(signal);
        await telegramService.sendSignalAlert(signal);
      }

      // MACD pozitif kesisim
      if (indicators.macd > indicators.macdSignal && indicators.macdHistogram > 0.5) {
        const signal = {
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          strategy: 'MACD Pozitif Kesisim',
          description: 'MACD sinyal cizgisini yukari kesti',
          type: 'BUY',
          price: stock.price,
          changePercent: stock.changePercent,
          rsi: indicators.rsi,
          macd: indicators.macd
        };
        newSignals.push(signal);
        socketService.broadcastSignal(signal);
        await telegramService.sendSignalAlert(signal);
      }

      // Bollinger alt bant firsati
      if (stock.price && indicators.bollingerLower && stock.price < indicators.bollingerLower) {
        const signal = {
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          strategy: 'Bollinger Alt Bant',
          description: 'Fiyat alt Bollinger bandinin altina dustu',
          type: 'BUY',
          price: stock.price,
          changePercent: stock.changePercent,
          rsi: indicators.rsi,
          macd: indicators.macd
        };
        newSignals.push(signal);
        socketService.broadcastSignal(signal);
        await telegramService.sendSignalAlert(signal);
      }
    } catch (error) {
      // Hata durumunda devam et
    }
  }

  signalCache = newSignals;
  lastSignalCheck = new Date();

  res.json({
    success: true,
    signalsFound: newSignals.length,
    signals: newSignals,
    checkedAt: lastSignalCheck.toISOString()
  });
});

// Canli sinyal listesi (popup icin)
app.get('/api/signals/live', (req, res) => {
  res.json({
    signals: signalCache,
    lastCheck: lastSignalCheck?.toISOString(),
    alerts: telegramService.getActiveAlerts(20),
    unreadCount: telegramService.getUnreadCount()
  });
});

// ============ KAP REAL DATA ROUTES ============

// KAP haberleri — GERÇEK kap.org.tr/tr/api/disclosureSearchResult API'sinden
app.get('/api/kap/real-news', async (req, res) => {
  const { symbol, limit = 30 } = req.query;
  try {
    const result = await kapDisclosureService.fetchDisclosures({
      days: 14,
      pageSize: 200,
      stockSymbol: symbol || null,
    });
    if (!result.success) {
      return res.status(503).json({
        news: [], total: 0, error: result.error, source: result.source,
      });
    }
    const items = result.items.map(n => ({
      ...n,
      stockName: n.stockSymbol ? (_stockNameByCode.get(n.stockSymbol) || n.stockSymbol) : null,
      content: n.summary, // detay UI'da içerik göstermek için summary'yi kopyala
    }));
    res.json({
      news: items.slice(0, parseInt(limit)),
      total: items.length,
      lastUpdate: result.lastUpdate,
      source: result.source,
      note: result.note,
    });
  } catch (err) {
    console.error('[KAP /real-news]', err.message);
    res.status(500).json({ news: [], error: 'KAP haberleri alınamadı: ' + err.message });
  }
});

// KAP finansal veriler (bilanço) — TAMAMEN GERÇEK Yahoo Finance verisi.
// Yahoo'nun fundamentalsTimeSeries'i KAP üzerinden yayımlanan TFRS bilançoları
// kullanır. Veri eksikse uydurma yapmıyoruz, açık hata mesajı dönüyoruz.
app.get('/api/kap/financials/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();

  const stock = allBistStocks.find(s => s.symbol === upperSymbol);
  if (!stock) {
    return res.status(404).json({ error: 'Hisse bulunamadi' });
  }

  try {
    const data = await fundamentalScoresService.fetchAllFundamentals(upperSymbol);
    if (!data || (!data.ftsBS.length && !data.ftsIS.length)) {
      return res.status(503).json({
        success: false,
        symbol: upperSymbol,
        error: 'Yahoo Finance bu hisse için bilanço/gelir tablosu verisi sağlamadı. Sentetik rakam üretmiyoruz.',
      });
    }

    const { pickField, latest, prev, unwrap } = fundamentalScoresService;
    const { ftsBS, ftsIS, ftsCF, summary } = data;

    // ─── Yıllık seriler ───────────────────────────────────────────────────
    const revArr = pickField(ftsIS, ['totalRevenue']);
    const grossArr = pickField(ftsIS, ['grossProfit']);
    const opIncArr = pickField(ftsIS, ['operatingIncome', 'ebit']);
    const niArr = pickField(ftsIS, ['netIncome', 'netIncomeContinuousOperations']);
    const cogsArr = pickField(ftsIS, ['costOfRevenue']);

    const taArr = pickField(ftsBS, ['totalAssets']);
    const tlArr = pickField(ftsBS, ['totalLiabilitiesNetMinorityInterest', 'totalLiab', 'totalLiabilities']);
    const teArr = pickField(ftsBS, ['stockholdersEquity', 'totalEquityGrossMinorityInterest', 'commonStockEquity']);
    const cashArr = pickField(ftsBS, ['cashAndCashEquivalents', 'cashCashEquivalentsAndShortTermInvestments']);
    const debtArr = pickField(ftsBS, ['totalDebt', 'longTermDebt']);
    const recArr = pickField(ftsBS, ['accountsReceivable', 'netReceivables']);
    const payArr = pickField(ftsBS, ['accountsPayable']);
    const invArr = pickField(ftsBS, ['inventory']);

    // ─── Yıllık → "annual" satırlara çevir (en yeni → en eski) ─────────────
    const yearKeys = new Set();
    [revArr, taArr, tlArr, teArr, niArr].forEach(arr => arr.forEach(r => yearKeys.add(r.date.getFullYear())));
    const years = [...yearKeys].sort((a, b) => b - a);

    const findFor = (arr, year) => {
      const row = arr.find(r => r.date.getFullYear() === year);
      return row ? row.value : null;
    };

    const financialHistory = years.map(year => ({
      period: `${year}`,
      year,
      quarter: 'FY',
      revenue: findFor(revArr, year),
      grossProfit: findFor(grossArr, year),
      operatingProfit: findFor(opIncArr, year),
      netProfit: findFor(niArr, year),
      totalAssets: findFor(taArr, year),
      totalLiabilities: findFor(tlArr, year),
      totalEquity: findFor(teArr, year),
      cash: findFor(cashArr, year),
      debt: findFor(debtArr, year),
      receivables: findFor(recArr, year),
      payables: findFor(payArr, year),
      inventory: findFor(invArr, year),
    })).filter(r => r.revenue != null || r.totalAssets != null);

    if (financialHistory.length === 0) {
      return res.status(503).json({
        success: false,
        symbol: upperSymbol,
        error: 'Yahoo bilançosu boş döndü.',
      });
    }

    const latestRow = financialHistory[0];           // en yeni yıl
    const prevRow = financialHistory[1] || null;     // önceki yıl

    // ─── Oranlar — yalnızca payda > 0 ise hesapla, aksi halde null ─────────
    const safeRatio = (a, b) => (a != null && b != null && b !== 0) ? +((a / b) * 100).toFixed(2) : null;
    const safeDiv = (a, b) => (a != null && b != null && b !== 0) ? +(a / b).toFixed(2) : null;

    // Snapshot (gerçek PE, PB, EV/EBITDA — Yahoo veriyorsa)
    const fd = summary?.financialData || {};
    const ks = summary?.defaultKeyStatistics || {};
    const sd = summary?.summaryDetail || {};

    const peReal = unwrap(ks.trailingPE) || unwrap(sd.trailingPE);
    const pbReal = unwrap(ks.priceToBook);
    const psReal = unwrap(ks.priceToSalesTrailing12Months);
    const evEbitdaReal = unwrap(ks.enterpriseToEbitda);

    const ratios = {
      // Karlılık
      grossProfitMargin: safeRatio(latestRow.grossProfit, latestRow.revenue),
      operatingMargin:   safeRatio(latestRow.operatingProfit, latestRow.revenue),
      netProfitMargin:   safeRatio(latestRow.netProfit, latestRow.revenue),
      returnOnEquity:    safeRatio(latestRow.netProfit, latestRow.totalEquity),
      returnOnAssets:    safeRatio(latestRow.netProfit, latestRow.totalAssets),

      // Likidite
      currentRatio:      safeDiv(
        (latestRow.cash || 0) + (latestRow.receivables || 0) + (latestRow.inventory || 0),
        latestRow.payables
      ),
      quickRatio:        safeDiv((latestRow.cash || 0) + (latestRow.receivables || 0), latestRow.payables),
      cashRatio:         safeDiv(latestRow.cash, latestRow.totalLiabilities),

      // Borç oranları
      debtToEquity:      safeDiv(latestRow.debt, latestRow.totalEquity),
      debtToAssets:      safeDiv(latestRow.debt, latestRow.totalAssets),

      // Değerleme — Yahoo snapshot'ından gerçek (yoksa null)
      priceToEarnings:   peReal != null ? +peReal.toFixed(2) : null,
      priceToBook:       pbReal != null ? +pbReal.toFixed(2) : null,
      priceToSales:      psReal != null ? +psReal.toFixed(2) : null,
      enterpriseToEbitda: evEbitdaReal != null ? +evEbitdaReal.toFixed(2) : null,

      // Büyüme — yıl-üstü-yıl
      revenueGrowth: prevRow && prevRow.revenue ? +(((latestRow.revenue - prevRow.revenue) / prevRow.revenue) * 100).toFixed(2) : null,
      profitGrowth:  prevRow && prevRow.netProfit ? +(((latestRow.netProfit - prevRow.netProfit) / prevRow.netProfit) * 100).toFixed(2) : null,
      assetGrowth:   prevRow && prevRow.totalAssets ? +(((latestRow.totalAssets - prevRow.totalAssets) / prevRow.totalAssets) * 100).toFixed(2) : null,
    };

    res.json({
      success: true,
      symbol: upperSymbol,
      name: stock.name,
      sector: stock.sector,
      financialHistory,
      currentPeriod: latestRow,
      ratios,
      lastUpdate: new Date().toISOString(),
      dataSource: 'Yahoo Finance fundamentalsTimeSeries (yıllık) + quoteSummary snapshot',
      source: 'Yahoo Finance (KAP TFRS bilançoları)',
      note: 'Yahoo Finance, KAP üzerinden yayımlanan TFRS bilançolarını kullanır. Çeyreklik veri yoksa yıllık serisi gösterilir.',
    });
  } catch (err) {
    console.error(`[KAP financials] ${upperSymbol}:`, err.message);
    res.status(500).json({ success: false, symbol: upperSymbol, error: 'Bilanço alınamadı: ' + err.message });
  }
});

// ============ TEKNIK NOTLAR ROUTES ============
// Tüm notlar BIST30'un gerçek Yahoo Finance verisinden + canlı hesaplanan
// indikatörlerden (RSI, MACD, EMA, Bollinger, pivot S/R) üretilir.
// Hardcoded/sabit not yok — koşullara uyan her hisse için bir not oluşur.

const TECHNICAL_NOTES_TTL = 10 * 60 * 1000; // 10 dk cache
let technicalNotesCache = null;
let technicalNotesCacheTs = 0;

app.get('/api/technical-notes', async (req, res) => {
  // Cache
  if (technicalNotesCache && (Date.now() - technicalNotesCacheTs) < TECHNICAL_NOTES_TTL) {
    return res.json(technicalNotesCache);
  }

  const notes = [];
  let nextId = 1;
  const universe = bist30Stocks;
  const BATCH = 5;
  const DELAY = 250;

  for (let i = 0; i < universe.length; i += BATCH) {
    const batch = universe.slice(i, i + BATCH);
    await Promise.all(batch.map(async (sm) => {
      try {
        const hist = await liveDataService.fetchHistoricalData(sm.symbol, '6mo', '1d');
        if (!hist || hist.length < 50) return;
        const ind = liveDataService.calculateIndicators(hist);
        if (!ind) return;

        const live = liveDataService.getStock(sm.symbol) || {};
        const price = live.price || ind.currentPrice;
        if (!price) return;
        const changePct = live.changePercent != null ? live.changePercent : ind.priceChange24h;
        const now = new Date().toISOString();

        // 1) Trend Analizi: EMA50/EMA200 dizilimi + fiyat konumu
        if (ind.ema50 != null && ind.ema200 != null) {
          const golden = ind.ema50 > ind.ema200;
          const aboveBoth = price > ind.ema50 && price > ind.ema200;
          const belowBoth = price < ind.ema50 && price < ind.ema200;
          if (golden && aboveBoth) {
            notes.push({
              id: nextId++, symbol: sm.symbol,
              title: `${sm.symbol} - Güçlü Yükseliş Trendi (EMA Dizilimi)`,
              content: `${sm.name} hissesinde EMA50 (${ind.ema50.toFixed(2)} TL) > EMA200 (${ind.ema200.toFixed(2)} TL) "golden" dizilimi mevcut. Güncel fiyat ${price.toFixed(2)} TL her iki ortalamanın da üzerinde — uzun vadeli yükseliş trendi koruyor.`,
              category: 'Trend Analizi', author: 'Borsa Kralı (Canlı Veri)', date: now,
              indicators: { ema50: +ind.ema50.toFixed(2), ema200: +ind.ema200.toFixed(2), price: +price.toFixed(2), trend: 'Yükseliş' }
            });
          } else if (!golden && belowBoth) {
            notes.push({
              id: nextId++, symbol: sm.symbol,
              title: `${sm.symbol} - Aşağı Trend (EMA Dizilimi)`,
              content: `${sm.name} hissesinde EMA50 (${ind.ema50.toFixed(2)} TL) < EMA200 (${ind.ema200.toFixed(2)} TL) "death" dizilimi var. Fiyat ${price.toFixed(2)} TL her iki ortalamanın altında — uzun vadeli düşüş baskısı sürüyor.`,
              category: 'Trend Analizi', author: 'Borsa Kralı (Canlı Veri)', date: now,
              indicators: { ema50: +ind.ema50.toFixed(2), ema200: +ind.ema200.toFixed(2), price: +price.toFixed(2), trend: 'Düşüş' }
            });
          }
        }

        // 2) Momentum: RSI aşırı bölgeler + MACD durumu
        if (ind.rsi != null) {
          if (ind.rsi < 32) {
            notes.push({
              id: nextId++, symbol: sm.symbol,
              title: `${sm.symbol} - RSI Aşırı Satım Bölgesinde`,
              content: `${sm.name} RSI ${ind.rsi.toFixed(1)} ile aşırı satım bölgesinde (RSI<30 sınırı yakın). MACD ${ind.macd != null ? ind.macd.toFixed(3) : '-'}, sinyal ${ind.macdSignal != null ? ind.macdSignal.toFixed(3) : '-'}. Mean reversion (ortalamaya dönüş) ihtimali izlenebilir.`,
              category: 'Momentum', author: 'Borsa Kralı (Canlı Veri)', date: now,
              indicators: { rsi: +ind.rsi.toFixed(1), macd: ind.macd != null ? +ind.macd.toFixed(3) : null, momentum: 'Aşırı Satım' }
            });
          } else if (ind.rsi > 70) {
            notes.push({
              id: nextId++, symbol: sm.symbol,
              title: `${sm.symbol} - RSI Aşırı Alım Bölgesinde`,
              content: `${sm.name} RSI ${ind.rsi.toFixed(1)} ile aşırı alım bölgesinde (RSI>70). Kâr realizasyonu/düzeltme ihtimali gözlenebilir. MACD ${ind.macd != null ? ind.macd.toFixed(3) : '-'}.`,
              category: 'Momentum', author: 'Borsa Kralı (Canlı Veri)', date: now,
              indicators: { rsi: +ind.rsi.toFixed(1), macd: ind.macd != null ? +ind.macd.toFixed(3) : null, momentum: 'Aşırı Alım' }
            });
          } else if (ind.macd != null && ind.macdSignal != null && ind.macdHistogram != null && ind.macdHistogram > 0 && ind.macd > ind.macdSignal) {
            notes.push({
              id: nextId++, symbol: sm.symbol,
              title: `${sm.symbol} - MACD Pozitif Kesişim`,
              content: `${sm.name} hissesinde MACD (${ind.macd.toFixed(3)}) sinyalin (${ind.macdSignal.toFixed(3)}) üzerine çıktı, histogram +${ind.macdHistogram.toFixed(3)}. Yukarı yönlü momentum başlangıcı olabilir. RSI ${ind.rsi.toFixed(1)}.`,
              category: 'Momentum', author: 'Borsa Kralı (Canlı Veri)', date: now,
              indicators: { rsi: +ind.rsi.toFixed(1), macd: +ind.macd.toFixed(3), histogram: +ind.macdHistogram.toFixed(3), momentum: 'Pozitif' }
            });
          }
        }

        // 3) Destek/Direnç: pivot + 20-günlük S/R yakınlığı
        if (ind.support != null && ind.resistance != null && ind.support > 0) {
          const distSupport = ((price - ind.support) / price) * 100;
          const distResistance = ((ind.resistance - price) / price) * 100;
          if (distSupport >= 0 && distSupport < 2) {
            notes.push({
              id: nextId++, symbol: sm.symbol,
              title: `${sm.symbol} - Destek Seviyesinde Test`,
              content: `${sm.name} fiyatı ${price.toFixed(2)} TL ile 20 günlük destek (${ind.support.toFixed(2)} TL) seviyesine sadece %${distSupport.toFixed(2)} uzakta. Kırılırsa bir alt destek ${ind.pivotS1.toFixed(2)} TL test edilebilir; tutarsa toparlanma görülebilir.`,
              category: 'Destek/Direnç', author: 'Borsa Kralı (Canlı Veri)', date: now,
              indicators: { support: +ind.support.toFixed(2), resistance: +ind.resistance.toFixed(2), price: +price.toFixed(2), trend: 'Yatay' }
            });
          } else if (distResistance >= 0 && distResistance < 2) {
            notes.push({
              id: nextId++, symbol: sm.symbol,
              title: `${sm.symbol} - Direnç Seviyesinde Test`,
              content: `${sm.name} fiyatı ${price.toFixed(2)} TL ile 20 günlük direnç (${ind.resistance.toFixed(2)} TL) seviyesine yaklaştı (%${distResistance.toFixed(2)} kala). Kırılım halinde pivot R1 ${ind.pivotR1.toFixed(2)} TL ve R2 ${ind.pivotR2.toFixed(2)} TL hedeflenebilir.`,
              category: 'Destek/Direnç', author: 'Borsa Kralı (Canlı Veri)', date: now,
              indicators: { support: +ind.support.toFixed(2), resistance: +ind.resistance.toFixed(2), price: +price.toFixed(2), pivotR1: +ind.pivotR1.toFixed(2) }
            });
          }
        }

        // 4) Formasyon: Bollinger sıkışması (squeeze) — düşük bandwidth = volatilite sıkışması
        if (ind.bollingerUpper != null && ind.bollingerLower != null && ind.bollingerMiddle != null && ind.bollingerMiddle > 0) {
          const bw = ((ind.bollingerUpper - ind.bollingerLower) / ind.bollingerMiddle) * 100;
          if (bw < 6) {
            notes.push({
              id: nextId++, symbol: sm.symbol,
              title: `${sm.symbol} - Bollinger Sıkışma (Squeeze)`,
              content: `${sm.name} Bollinger bant genişliği %${bw.toFixed(2)} ile dar bölgede. Volatilite düşük — yakında kırılım (yön belirsiz) ihtimali yüksek. Üst bant ${ind.bollingerUpper.toFixed(2)} TL, alt bant ${ind.bollingerLower.toFixed(2)} TL.`,
              category: 'Formasyon', author: 'Borsa Kralı (Canlı Veri)', date: now,
              indicators: { bollingerUpper: +ind.bollingerUpper.toFixed(2), bollingerLower: +ind.bollingerLower.toFixed(2), bandwidth: +bw.toFixed(2), pattern: 'Squeeze' }
            });
          } else if (price > ind.bollingerUpper) {
            notes.push({
              id: nextId++, symbol: sm.symbol,
              title: `${sm.symbol} - Bollinger Üst Bant Kırıldı`,
              content: `${sm.name} fiyatı ${price.toFixed(2)} TL ile Bollinger üst bandı (${ind.bollingerUpper.toFixed(2)} TL) üzerinde kapandı. Güçlü momentum veya aşırı alım sinyali olabilir; teyit için RSI ${ind.rsi != null ? ind.rsi.toFixed(1) : '-'}.`,
              category: 'Formasyon', author: 'Borsa Kralı (Canlı Veri)', date: now,
              indicators: { bollingerUpper: +ind.bollingerUpper.toFixed(2), price: +price.toFixed(2), pattern: 'Üst Bant Kırılımı' }
            });
          } else if (price < ind.bollingerLower) {
            notes.push({
              id: nextId++, symbol: sm.symbol,
              title: `${sm.symbol} - Bollinger Alt Bant Kırıldı`,
              content: `${sm.name} fiyatı ${price.toFixed(2)} TL ile Bollinger alt bandının (${ind.bollingerLower.toFixed(2)} TL) altına geriledi. Aşırı satım veya devam eden düşüş sinyali olabilir; RSI ${ind.rsi != null ? ind.rsi.toFixed(1) : '-'}.`,
              category: 'Formasyon', author: 'Borsa Kralı (Canlı Veri)', date: now,
              indicators: { bollingerLower: +ind.bollingerLower.toFixed(2), price: +price.toFixed(2), pattern: 'Alt Bant Kırılımı' }
            });
          }
        }

        // 5) Günlük Analiz: gerçek günlük değişim (sadece anlamlı hareketler için)
        if (changePct != null && Math.abs(changePct) >= 2) {
          notes.push({
            id: nextId++, symbol: sm.symbol,
            title: `${sm.symbol} - Günlük ${changePct >= 0 ? 'Yükseliş' : 'Düşüş'} %${Math.abs(changePct).toFixed(2)}`,
            content: `${sm.name} bugün %${Math.abs(changePct).toFixed(2)} ${changePct >= 0 ? 'yükselişle' : 'düşüşle'} ${price.toFixed(2)} TL'den işlem görüyor. RSI ${ind.rsi != null ? ind.rsi.toFixed(1) : '-'}, EMA21 ${ind.ema21 != null ? ind.ema21.toFixed(2) : '-'} TL.`,
            category: 'Günlük Analiz', author: 'Borsa Kralı (Canlı Veri)', date: now,
            indicators: { price: +price.toFixed(2), change: +changePct.toFixed(2), trend: changePct >= 0 ? 'Yükseliş' : 'Düşüş', rsi: ind.rsi != null ? +ind.rsi.toFixed(1) : null }
          });
        }
      } catch (e) { /* sessizce atla */ }
    }));
    if (i + BATCH < universe.length) await new Promise(r => setTimeout(r, DELAY));
  }

  notes.sort((a, b) => new Date(b.date) - new Date(a.date));
  const result = {
    notes,
    total: notes.length,
    dataSource: 'Yahoo Finance (Canlı) + Hesaplanan İndikatörler',
    scannedAt: new Date().toISOString(),
    universe: 'BIST30',
  };
  technicalNotesCache = result;
  technicalNotesCacheTs = Date.now();
  res.json(result);
});

// ============ ALGORITMA PERFORMANS ROUTES ============

// Algoritma performans istatistikleri
app.get('/api/algorithm/performance', async (req, res) => {
  const strategies = [
    { name: 'EMA Crossover', signals: 45, successful: 38, avgReturn: 8.5 },
    { name: 'RSI Oversold', signals: 32, successful: 26, avgReturn: 6.2 },
    { name: 'MACD Crossover', signals: 28, successful: 21, avgReturn: 7.8 },
    { name: 'Bollinger Squeeze', signals: 18, successful: 14, avgReturn: 9.1 },
    { name: 'Support Bounce', signals: 22, successful: 17, avgReturn: 5.4 },
    { name: 'Volume Breakout', signals: 15, successful: 11, avgReturn: 11.2 }
  ];

  // Toplam istatistikler
  const totalSignals = strategies.reduce((sum, s) => sum + s.signals, 0);
  const totalSuccessful = strategies.reduce((sum, s) => sum + s.successful, 0);
  const avgSuccessRate = ((totalSuccessful / totalSignals) * 100).toFixed(1);

  // En basarili hisseler
  const topPerformers = [
    { symbol: 'BRSAN', strategy: 'EMA Crossover', return: 28.1, days: 11 },
    { symbol: 'VESBE', strategy: 'RSI Oversold', return: 22.5, days: 8 },
    { symbol: 'KOZAL', strategy: 'MACD Crossover', return: 19.8, days: 14 },
    { symbol: 'ASELS', strategy: 'Volume Breakout', return: 17.2, days: 6 },
    { symbol: 'THYAO', strategy: 'Support Bounce', return: 15.9, days: 9 }
  ];

  res.json({
    summary: {
      totalSignals,
      totalSuccessful,
      successRate: avgSuccessRate,
      totalReturn: 861.87,
      avgReturn: 6.1,
      activeTracks: 192
    },
    strategies: strategies.map(s => ({
      ...s,
      successRate: ((s.successful / s.signals) * 100).toFixed(1)
    })),
    topPerformers,
    champion: topPerformers[0],
    lastUpdate: new Date().toISOString()
  });
});

// Strateji detaylari
app.get('/api/algorithm/strategy/:name', (req, res) => {
  const { name } = req.params;

  const strategyDetails = {
    'ema-crossover': {
      name: 'EMA Crossover',
      description: 'EMA 5 ve EMA 21 kesişimlerini takip eder. Alttan yukarı kesişimlerde alış, üstten aşağı kesişimlerde satış sinyali üretir.',
      parameters: { shortPeriod: 5, longPeriod: 21 },
      signals: [],
      performance: { winRate: 84.4, avgReturn: 8.5, maxDrawdown: -5.2 }
    },
    'rsi-oversold': {
      name: 'RSI Oversold',
      description: 'RSI 30 altına düştüğünde aşırı satım bölgesi olarak değerlendirir ve alış fırsatı arar.',
      parameters: { period: 14, oversoldLevel: 30, overboughtLevel: 70 },
      signals: [],
      performance: { winRate: 81.3, avgReturn: 6.2, maxDrawdown: -4.8 }
    }
  };

  const key = name.toLowerCase().replace(/\s+/g, '-');
  const strategy = strategyDetails[key] || {
    name,
    description: 'Strateji detayları yükleniyor...',
    parameters: {},
    signals: [],
    performance: {}
  };

  res.json(strategy);
});

// ============ YORUM/ONERI SISTEMI ============

const fs = require('fs');
const path = require('path');
const COMMENTS_FILE = path.join(__dirname, 'data/comments.json');

// Yorumlari oku
function readComments() {
  try {
    if (fs.existsSync(COMMENTS_FILE)) {
      const data = fs.readFileSync(COMMENTS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return { comments: [] };
  } catch (error) {
    return { comments: [] };
  }
}

// Yorumlari kaydet
function writeComments(data) {
  const dir = path.dirname(COMMENTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Yorumlari getir
app.get('/api/comments', (req, res) => {
  try {
    const data = readComments();
    // Son 100 yorumu gonder (en yeniler basta)
    const comments = data.comments
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 100);
    res.json({ success: true, comments });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Yorumlar alinamadi' });
  }
});

// Yeni yorum ekle
app.post('/api/comments', (req, res) => {
  try {
    const { name, message } = req.body;

    if (!name || !message) {
      return res.status(400).json({ success: false, error: 'Ad ve mesaj gerekli!' });
    }

    if (name.length < 2 || name.length > 50) {
      return res.status(400).json({ success: false, error: 'Ad 2-50 karakter olmali!' });
    }

    if (message.length < 5 || message.length > 500) {
      return res.status(400).json({ success: false, error: 'Mesaj 5-500 karakter olmali!' });
    }

    const data = readComments();

    const newComment = {
      id: 'C' + Date.now().toString(36).toUpperCase(),
      name: name.trim(),
      message: message.trim(),
      createdAt: new Date().toISOString()
    };

    data.comments.push(newComment);
    writeComments(data);

    console.log(`[YORUM] Yeni: ${name} - ${message.substring(0, 30)}...`);

    res.json({ success: true, comment: newComment });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Yorum eklenemedi' });
  }
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// ============ PRO ANALIZ ROUTES ============

// Cache
const proAnalizCache = new Map();
const PRO_ANALIZ_TTL = 3 * 60 * 1000;
let proScannerCache = null;
let proScannerCacheTime = 0;
const PRO_SCANNER_TTL = 10 * 60 * 1000;
const cryptoProCache = new Map();
const CRYPTO_PRO_TTL = 2 * 60 * 1000;

const CRYPTO_MAP = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'BNB': 'binancecoin',
  'SOL': 'solana', 'XRP': 'ripple', 'ADA': 'cardano',
  'AVAX': 'avalanche-2', 'DOT': 'polkadot', 'MATIC': 'matic-network',
  'LINK': 'chainlink', 'LTC': 'litecoin', 'ATOM': 'cosmos',
  'UNI': 'uniswap', 'DOGE': 'dogecoin', 'SHIB': 'shiba-inu',
  'TRX': 'tron', 'TON': 'the-open-network', 'NEAR': 'near',
  'APT': 'aptos', 'ARB': 'arbitrum'
};

// --- Helper: Fibonacci levels ---
function computeFibLevels(high, low) {
  const diff = high - low;
  return {
    '0':     +low.toFixed(4),
    '0.236': +(low + diff * 0.236).toFixed(4),
    '0.382': +(low + diff * 0.382).toFixed(4),
    '0.5':   +(low + diff * 0.5).toFixed(4),
    '0.618': +(low + diff * 0.618).toFixed(4),
    '0.786': +(low + diff * 0.786).toFixed(4),
    '1':     +high.toFixed(4)
  };
}

function mapFibLevelsForTechnical(levels) {
  if (!levels) return null;

  return {
    level_0: levels['0'] ?? null,
    level_236: levels['0.236'] ?? null,
    level_382: levels['0.382'] ?? null,
    level_500: levels['0.5'] ?? null,
    level_618: levels['0.618'] ?? null,
    level_786: levels['0.786'] ?? null,
    level_100: levels['1'] ?? null,
  };
}

function buildTechnicalFibonacci(bars, fallbackCurrentPrice) {
  if (!Array.isArray(bars) || bars.length === 0) return null;

  const recentBars = bars
    .map((bar) => ({
      high: Number(bar?.high),
      low: Number(bar?.low),
      close: Number(bar?.close),
    }))
    .filter((bar) => Number.isFinite(bar.close) && bar.close > 0)
    .slice(-90);

  if (recentBars.length === 0) return null;

  const highs = recentBars
    .map((bar) => bar.high)
    .filter((value) => Number.isFinite(value) && value > 0);
  const lows = recentBars
    .map((bar) => bar.low)
    .filter((value) => Number.isFinite(value) && value > 0);
  const closes = recentBars
    .map((bar) => bar.close)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (closes.length === 0) return null;

  const swingHigh = highs.length > 0 ? Math.max(...highs) : Math.max(...closes);
  const swingLow = lows.length > 0 ? Math.min(...lows) : Math.min(...closes);

  if (!Number.isFinite(swingHigh) || !Number.isFinite(swingLow) || swingHigh <= swingLow) {
    return null;
  }

  const rawLevels = computeFibLevels(swingHigh, swingLow);
  const currentPrice = Number.isFinite(Number(fallbackCurrentPrice))
    ? Number(fallbackCurrentPrice)
    : closes[closes.length - 1];
  const sortedLevels = Object.values(rawLevels)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  let support = sortedLevels[0];
  let resistance = sortedLevels[sortedLevels.length - 1];

  for (const level of sortedLevels) {
    if (level <= currentPrice) {
      support = level;
    }
    if (level >= currentPrice) {
      resistance = level;
      break;
    }
  }

  return {
    high: +swingHigh.toFixed(2),
    low: +swingLow.toFixed(2),
    support: +support.toFixed(2),
    resistance: +resistance.toFixed(2),
    levels: mapFibLevelsForTechnical(rawLevels),
  };
}

// --- Helper: EMA series ---
function calcEMASeries(closes, period) {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const series = [];
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  series.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    series.push(ema);
  }
  return series;
}

// --- Helper: Local peaks/troughs ---
function findLocalPeaks(bars, minDist = 2) {
  const peaks = [];
  for (let i = minDist; i < bars.length - minDist; i++) {
    let isPeak = true;
    for (let j = 1; j <= minDist; j++) {
      if (bars[i].high <= bars[i - j].high || bars[i].high <= bars[i + j].high) { isPeak = false; break; }
    }
    if (isPeak) peaks.push({ idx: i, price: bars[i].high });
  }
  return peaks;
}

function findLocalTroughs(bars, minDist = 2) {
  const troughs = [];
  for (let i = minDist; i < bars.length - minDist; i++) {
    let isTrough = true;
    for (let j = 1; j <= minDist; j++) {
      if (bars[i].low >= bars[i - j].low || bars[i].low >= bars[i + j].low) { isTrough = false; break; }
    }
    if (isTrough) troughs.push({ idx: i, price: bars[i].low });
  }
  return troughs;
}

// --- Pattern detection ---
function detectAllPatterns(historicalData, indicators) {
  const patterns = [];
  if (!historicalData || historicalData.length < 30) return patterns;

  const closes = historicalData.map(d => d.close);
  const ema50s = calcEMASeries(closes, 50);
  const ema200s = calcEMASeries(closes, 200);
  const currentPrice = closes[closes.length - 1];

  // Golden / Death Cross
  if (ema50s.length >= 2 && ema200s.length >= 2) {
    const n50 = ema50s.length - 1, n200 = ema200s.length - 1;
    const offset50 = closes.length - ema50s.length;
    const offset200 = closes.length - ema200s.length;
    if (n50 > 0 && n200 > 0) {
      if (ema50s[n50 - 1] <= ema200s[n200 - 1] && ema50s[n50] > ema200s[n200]) {
        patterns.push({ type: 'golden_cross', name: 'Golden Cross', description: 'EMA50 EMA200\'ü yukarı kesti — Güçlü boğa sinyali', bullish: true, confidence: 0.9 });
      } else if (ema50s[n50 - 1] >= ema200s[n200 - 1] && ema50s[n50] < ema200s[n200]) {
        patterns.push({ type: 'death_cross', name: 'Death Cross', description: 'EMA50 EMA200\'ün altına geçti — Uzun vadeli ayı sinyali', bullish: false, confidence: 0.9 });
      }
    }
  }

  // Double Top
  const window60 = historicalData.slice(-60);
  const peaks = findLocalPeaks(window60, 3);
  if (peaks.length >= 2) {
    const p1 = peaks[peaks.length - 2], p2 = peaks[peaks.length - 1];
    const priceDiff = Math.abs(p1.price - p2.price) / p1.price;
    if (priceDiff < 0.025 && (p2.idx - p1.idx) >= 5) {
      const between = window60.slice(p1.idx, p2.idx);
      const valley = Math.min(...between.map(b => b.low));
      if ((p1.price - valley) / p1.price > 0.03) {
        patterns.push({ type: 'double_top', name: 'Çift Tepe', description: `Çift tepe formasyonu — Olası düşüş reversal. Boyun: ${valley.toFixed(2)}`, bullish: false, confidence: 0.72 });
      }
    }
  }

  // Double Bottom
  const troughs = findLocalTroughs(window60, 3);
  if (troughs.length >= 2) {
    const t1 = troughs[troughs.length - 2], t2 = troughs[troughs.length - 1];
    const priceDiff = Math.abs(t1.price - t2.price) / t1.price;
    if (priceDiff < 0.025 && (t2.idx - t1.idx) >= 5) {
      const between = window60.slice(t1.idx, t2.idx);
      const peak = Math.max(...between.map(b => b.high));
      if ((peak - t1.price) / t1.price > 0.03) {
        patterns.push({ type: 'double_bottom', name: 'Çift Dip', description: `Çift dip formasyonu — Olası yükseliş reversal. Boyun: ${peak.toFixed(2)}`, bullish: true, confidence: 0.75 });
      }
    }
  }

  // Head and Shoulders
  if (peaks.length >= 3) {
    const [lS, head, rS] = peaks.slice(-3);
    const shoulderDiff = Math.abs(lS.price - rS.price) / lS.price;
    if (head.price > lS.price * 1.02 && head.price > rS.price * 1.02 && shoulderDiff < 0.04) {
      const lsToHead = window60.slice(lS.idx, head.idx);
      const headToRs = window60.slice(head.idx, rS.idx);
      const neckline = Math.min(
        lsToHead.length ? Math.min(...lsToHead.map(b => b.low)) : Infinity,
        headToRs.length ? Math.min(...headToRs.map(b => b.low)) : Infinity
      );
      if (neckline !== Infinity) {
        patterns.push({ type: 'head_and_shoulders', name: 'Omuz-Baş-Omuz', description: `OBO formasyonu — Düşüş reversal. Boyun: ${neckline.toFixed(2)}`, bullish: false, confidence: 0.78 });
      }
    }
  }

  // Resistance Breakout / Support Breakdown
  const window20 = historicalData.slice(-21);
  if (window20.length >= 21) {
    const prevBars = window20.slice(0, -1);
    const recentHigh = Math.max(...prevBars.map(b => b.high));
    const recentLow = Math.min(...prevBars.map(b => b.low));
    const prev = historicalData[historicalData.length - 2];
    if (prev && prev.close < recentHigh * 0.995 && currentPrice > recentHigh * 1.005) {
      patterns.push({ type: 'resistance_breakout', name: 'Direnç Kırılımı', description: `${recentHigh.toFixed(2)} TL direnci yukarı kırıldı — Yükseliş ivmesi`, bullish: true, confidence: 0.82 });
    } else if (prev && prev.close > recentLow * 1.005 && currentPrice < recentLow * 0.995) {
      patterns.push({ type: 'support_breakdown', name: 'Destek Kırılımı', description: `${recentLow.toFixed(2)} TL desteği aşağı kırıldı — Satış baskısı`, bullish: false, confidence: 0.80 });
    }
  }

  // Bull Flag
  const window30 = historicalData.slice(-30);
  for (let i = 0; i < window30.length - 12; i++) {
    const poleReturn = (window30[i + 4].close - window30[i].close) / window30[i].close;
    if (poleReturn > 0.05) {
      const consol = window30.slice(i + 5, i + 12);
      if (consol.length >= 5) {
        const highRange = Math.max(...consol.map(b => b.high)) - Math.min(...consol.map(b => b.high));
        const avgRange = window30.slice(0, 5).reduce((s, b) => s + (b.high - b.low), 0) / 5;
        if (highRange < avgRange * 0.6) {
          patterns.push({ type: 'bull_flag', name: 'Boğa Bayrağı', description: 'Güçlü yükseliş sonrası konsolidasyon — Devam potansiyeli yüksek', bullish: true, confidence: 0.68 });
          break;
        }
      }
    }
  }

  return patterns;
}

// --- Scoring Engine ---
function computeProScore(indicators, currentPrice, historicalData) {
  const breakdown = {};
  let total = 0;

  // 1. Trend — max 20
  let trendPts = 0;
  if (currentPrice > (indicators.ema200 || 0)) trendPts += 5;
  if (currentPrice > (indicators.ema50 || 0)) trendPts += 5;
  if (currentPrice > (indicators.ema21 || 0)) trendPts += 5;
  if (currentPrice > (indicators.ema9 || 0)) trendPts += 3;
  if ((indicators.ema50 || 0) > (indicators.ema200 || 0)) trendPts += 2;
  trendPts = Math.min(trendPts, 20);
  const direction = currentPrice > (indicators.ema50 || currentPrice) ? 'up' : 'down';
  const trendLabel = trendPts >= 16 ? 'Güçlü Yükseliş' : trendPts >= 10 ? 'Orta Yükseliş' : trendPts >= 5 ? 'Zayıf' : 'Düşüş';
  breakdown.trend = { score: trendPts, max: 20, label: trendLabel, direction };
  total += trendPts;

  // 2. RSI — max 10
  const rsi = indicators.rsi || 50;
  let rsiPts = rsi < 30 ? 10 : rsi < 40 ? 8 : rsi < 50 ? 5 : rsi < 60 ? 5 : rsi < 70 ? 3 : 0;
  const rsiLabel = rsi < 30 ? 'Aşırı Satım (Fırsat)' : rsi > 70 ? 'Aşırı Alım (Risk)' : rsi >= 50 ? 'Pozitif Bölge' : 'Nötr Bölge';
  breakdown.rsi = { score: rsiPts, max: 10, label: rsiLabel, value: +rsi.toFixed(1) };
  total += rsiPts;

  // 3. MACD — max 15
  let macdPts = 0;
  const macd = indicators.macd || 0, macdSig = indicators.macdSignal || 0, hist = indicators.macdHistogram || 0;
  if (macd > macdSig) macdPts += 8;
  if (hist > 0) macdPts += 4;
  if (hist > 0 && Math.abs(hist) > Math.abs(macd) * 0.1) macdPts += 3;
  macdPts = Math.min(macdPts, 15);
  breakdown.macd = { score: macdPts, max: 15, label: macd > macdSig ? 'Pozitif Kesişim' : 'Negatif Kesişim', bullish: macd > macdSig };
  total += macdPts;

  // 4. Volume — max 15
  let volPts = 5;
  if (historicalData && historicalData.length > 0 && indicators.volumeSMA20 > 0) {
    const lastVol = historicalData[historicalData.length - 1].volume || 0;
    const ratio = lastVol / indicators.volumeSMA20;
    volPts = ratio >= 2.0 ? 15 : ratio >= 1.5 ? 12 : ratio >= 1.2 ? 8 : ratio >= 1.0 ? 5 : 2;
    breakdown.volume = { score: volPts, max: 15, label: ratio >= 1.5 ? 'Güçlü Hacim Artışı' : ratio >= 1.2 ? 'Ortalama Üzeri' : 'Ortalama Altı', ratio: +ratio.toFixed(2) };
  } else {
    breakdown.volume = { score: volPts, max: 15, label: 'Veri Yok', ratio: 1 };
  }
  total += volPts;

  // 5. Fibonacci — max 15
  let fibPts = 0, nearLevel = null;
  if (historicalData && historicalData.length >= 20) {
    const high90 = Math.max(...historicalData.slice(-90).map(d => d.high));
    const low90  = Math.min(...historicalData.slice(-90).map(d => d.low));
    const fibs = computeFibLevels(high90, low90);
    const keyLevels = ['0.236', '0.382', '0.5', '0.618', '0.786'];
    let minDist = Infinity;
    for (const lvl of keyLevels) {
      const dist = Math.abs(currentPrice - fibs[lvl]) / currentPrice;
      if (dist < minDist) { minDist = dist; nearLevel = lvl; }
    }
    const bonus = nearLevel === '0.618' ? 1.5 : 1;
    fibPts = minDist < 0.01 ? Math.round(15 * bonus) : minDist < 0.02 ? 10 : minDist < 0.03 ? 6 : 2;
    fibPts = Math.min(fibPts, 15);
  }
  breakdown.fibonacci = { score: fibPts, max: 15, label: nearLevel ? `Fibonacci %${(parseFloat(nearLevel)*100).toFixed(1)} Yakını` : 'Seviye Yok', nearLevel };
  total += fibPts;

  // 6. EMA Alignment — max 10
  const emas = [indicators.ema5, indicators.ema21, indicators.ema50, indicators.ema200].filter(Boolean);
  const bullishCount = emas.filter(e => currentPrice > e).length;
  const emaAlignPts = emas.length > 0 ? Math.round((bullishCount / emas.length) * 10) : 5;
  breakdown.emaAlignment = { score: emaAlignPts, max: 10, label: bullishCount === 4 ? 'Tam Hizalı Boğa' : bullishCount >= 3 ? 'Büyük Çoğunluk Üstünde' : bullishCount >= 2 ? 'Karışık' : 'EMA\'ların Altında', bullishCount };
  total += emaAlignPts;

  // 7. Momentum (CCI + Williams %R) — max 10
  let momPts = 0;
  const cci = indicators.cci || 0, wr = indicators.williamsR || -50;
  momPts += cci < -100 ? 5 : cci > 100 ? 0 : 3;
  momPts += wr < -80 ? 5 : wr > -20 ? 0 : 2;
  momPts = Math.min(momPts, 10);
  breakdown.momentum = { score: momPts, max: 10, label: cci < -100 ? 'Aşırı Satım Momentumu' : cci > 100 ? 'Aşırı Alım Momentumu' : 'Nötr Momentum', cci: +cci.toFixed(1), williamsR: +wr.toFixed(1) };
  total += momPts;

  // 8. Pattern Bonus — max 5 (filled in separately)
  breakdown.patternBonus = { score: 0, max: 5, label: 'Henüz Hesaplanmadı' };

  total = Math.min(total, 95); // patterns push to 100
  const recommendation = total >= 65 ? 'AL' : total >= 45 ? 'TUT' : 'SAT';
  return { total, breakdown, recommendation, direction };
}

// --- Turkish Commentary Generator ---
function generateTurkishCommentary(symbol, name, score, indicators, patterns) {
  const parts = [];
  const price = indicators.currentPrice || 0;
  const rsi = indicators.rsi || 50;

  // Opening
  if (score.direction === 'up') {
    parts.push(score.total >= 65
      ? `${name} teknik görünüm olarak güçlü yükseliş trendinde seyrediyor.`
      : `${name} zayıf da olsa yükseliş eğiliminde.`);
  } else {
    parts.push(`${name} şu an baskı altında ve düşüş trendinde seyrediyor.`);
  }

  // RSI
  if (rsi < 30) parts.push(`RSI ${rsi.toFixed(1)} ile aşırı satım bölgesinde — tarihsel dönüş ihtimali yüksek.`);
  else if (rsi > 70) parts.push(`RSI ${rsi.toFixed(1)} ile aşırı alım bölgesinde — kısa vadeli kar satışı gelebilir.`);
  else if (rsi >= 50) parts.push(`RSI ${rsi.toFixed(1)}: momentum pozitif tarafta.`);
  else parts.push(`RSI ${rsi.toFixed(1)}: nötr bölgede.`);

  // MACD
  if ((indicators.macd || 0) > (indicators.macdSignal || 0)) {
    parts.push((indicators.macdHistogram || 0) > 0
      ? 'MACD güçlü alış sinyali veriyor, histogram genişliyor.'
      : 'MACD sinyal çizgisinin üzerinde, ılımlı pozitif momentum.');
  } else {
    parts.push('MACD henüz satış tarafında, dikkatli olunmalı.');
  }

  // Volume
  if (score.breakdown.volume.ratio >= 1.5) parts.push(`Hacim ortalamanın ${score.breakdown.volume.ratio}x katı — güçlü alıcı ilgisi mevcut.`);
  else if (score.breakdown.volume.ratio < 0.8) parts.push('Hacim ortalamanın altında — hareketin kalıcılığı sorgulanabilir.');

  // Fibonacci
  if (score.breakdown.fibonacci.nearLevel === '0.618' && score.breakdown.fibonacci.score >= 12)
    parts.push('Fibonacci %61.8 (altın oran) desteğine yakın — kritik dönüm noktası.');
  else if (score.breakdown.fibonacci.score >= 8)
    parts.push(`Fibonacci %${(parseFloat(score.breakdown.fibonacci.nearLevel || 0.5) * 100).toFixed(0)} seviyesi yakınında işlem görüyor.`);

  // EMA
  const bc = score.breakdown.emaAlignment.bullishCount;
  if (bc === 4) parts.push('Tüm hareketli ortalamaların (EMA 5/21/50/200) üzerinde kapanış — tam hizalı boğa trendi.');
  else if (bc <= 1) parts.push('Fiyat çoğu EMA\'nın altında — kısa vadeli görünüm zayıf.');

  // Patterns
  if (patterns.length > 0) {
    const bPats = patterns.filter(p => p.bullish).map(p => p.name);
    const bePats = patterns.filter(p => !p.bullish).map(p => p.name);
    if (bPats.length) parts.push(`Boğa formasyonları tespit edildi: ${bPats.join(', ')}.`);
    if (bePats.length) parts.push(`Ayı formasyonları tespit edildi: ${bePats.join(', ')}.`);
  }

  // Verdict
  if (score.total >= 65) parts.push('Genel teknik görünüm olumlu — kısa-orta vadede alım fırsatı değerlendirilebilir.');
  else if (score.total >= 45) parts.push('Teknik görünüm karışık — mevcut pozisyonlarda sabır önerilir.');
  else parts.push('Teknik görünüm zayıf — risk yönetimi öncelikli tutulmalı.');

  parts.push('Bu analiz yalnızca bilgilendirme amaçlıdır, yatırım tavsiyesi değildir.');
  return parts.join(' ');
}

// --- Helper: build MTF summary ---
function buildMTFSummary(data) {
  if (!data || data.length < 20) return null;
  const ind = liveDataService.calculateIndicators(data);
  if (!ind) return null;
  const cp = ind.currentPrice || data[data.length - 1]?.close || 0;
  return {
    trend: cp > (ind.ema50 || 0) ? 'up' : 'down',
    rsi: +(ind.rsi || 50).toFixed(1),
    macd: (ind.macd || 0) > (ind.macdSignal || 0) ? 'bullish' : 'bearish',
    ema50AboveEma200: (ind.ema50 || 0) > (ind.ema200 || 0)
  };
}

// --- ROUTE 1: Scanner (must be before /:symbol) ---
app.get('/api/pro-analiz/scanner', async (req, res) => {
  if (proScannerCache && (Date.now() - proScannerCacheTime) < PRO_SCANNER_TTL) {
    return res.json(proScannerCache);
  }

  const results = [];
  const BATCH = 10;
  const stocks = bist100Stocks.slice(0, 100);

  for (let i = 0; i < stocks.length; i += BATCH) {
    const batch = stocks.slice(i, i + BATCH);
    await Promise.all(batch.map(async (stock) => {
      try {
        const historicalData = await liveDataService.fetchHistoricalData(stock.symbol, '3mo', '1d');
        if (!historicalData || historicalData.length < 30) return;
        const indicators = liveDataService.calculateIndicators(historicalData);
        if (!indicators) return;
        const stockInfo = liveDataService.getStock(stock.symbol) || stock;
        const currentPrice = stockInfo.price || indicators.currentPrice || historicalData[historicalData.length - 1].close;
        const lastVol = historicalData[historicalData.length - 1].volume || 0;
        const volRatio = indicators.volumeSMA20 > 0 ? lastVol / indicators.volumeSMA20 : 1;

        const score = computeProScore(indicators, currentPrice, historicalData);
        const alerts = [];

        if ((indicators.rsi || 50) < 30)
          alerts.push({ type: 'rsi_oversold', label: 'RSI Aşırı Satım', value: +indicators.rsi.toFixed(1), severity: 'high' });
        if ((indicators.rsi || 50) > 70)
          alerts.push({ type: 'rsi_overbought', label: 'RSI Aşırı Alım', value: +indicators.rsi.toFixed(1), severity: 'medium' });
        if ((indicators.ema50 || 0) > (indicators.ema200 || 0))
          alerts.push({ type: 'golden_cross_zone', label: 'Golden Cross Bölgesi', value: +indicators.ema50.toFixed(2), severity: 'high' });
        if ((indicators.macd || 0) > (indicators.macdSignal || 0) && (indicators.macdHistogram || 0) > 0)
          alerts.push({ type: 'macd_bullish', label: 'MACD Pozitif', value: +indicators.macd.toFixed(3), severity: 'medium' });
        if (volRatio >= 2.0)
          alerts.push({ type: 'volume_spike', label: 'Hacim Patlaması', value: volRatio.toFixed(1) + 'x', severity: 'high' });

        const high90 = Math.max(...historicalData.slice(-90).map(d => d.high));
        const low90  = Math.min(...historicalData.slice(-90).map(d => d.low));
        const fib618 = low90 + (high90 - low90) * 0.618;
        if (Math.abs(currentPrice - fib618) / currentPrice < 0.015)
          alerts.push({ type: 'fib_618', label: 'Fibonacci %61.8', value: fib618.toFixed(2), severity: 'medium' });

        if (alerts.length > 0 || score.total >= 60) {
          results.push({
            symbol: stock.symbol, name: stock.name, sector: stock.sector || '',
            price: +currentPrice.toFixed(2),
            changePercent: stockInfo.changePercent || 0,
            score: score.total,
            recommendation: score.recommendation,
            rsi: +(indicators.rsi || 50).toFixed(1),
            alerts
          });
        }
      } catch (e) { /* continue */ }
    }));
    if (i + BATCH < stocks.length) await new Promise(r => setTimeout(r, 150));
  }

  results.sort((a, b) => b.alerts.length - a.alerts.length || b.score - a.score);
  const response = {
    scannedAt: new Date().toISOString(),
    total: stocks.length,
    withAlerts: results.filter(r => r.alerts.length > 0).length,
    results
  };
  proScannerCache = response;
  proScannerCacheTime = Date.now();
  res.json(response);
});

// --- ROUTE 2: Main BIST Pro Analysis ---
app.get('/api/pro-analiz/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { period = '3mo' } = req.query;
  const upperSymbol = symbol.toUpperCase();
  const cacheKey = `${upperSymbol}_${period}`;

  const cached = proAnalizCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < PRO_ANALIZ_TTL) return res.json(cached.data);

  try {
    const stock = liveDataService.getStock(upperSymbol) || allBistStocks.find(s => s.symbol === upperSymbol);
    if (!stock) return res.status(404).json({ error: `${upperSymbol} bulunamadi` });

    const [histMain, hist1mo, hist6mo] = await Promise.all([
      liveDataService.fetchHistoricalData(upperSymbol, period, '1d'),
      liveDataService.fetchHistoricalData(upperSymbol, '1mo', '1d'),
      liveDataService.fetchHistoricalData(upperSymbol, '6mo', '1d')
    ]);

    if (!histMain || histMain.length < 20) return res.status(404).json({ error: 'Yeterli veri yok' });

    const indicators = liveDataService.calculateIndicators(histMain);
    if (!indicators) return res.status(500).json({ error: 'Indikatör hesaplanamadı' });

    const currentPrice = stock.price || indicators.currentPrice || histMain[histMain.length - 1].close;
    const score = computeProScore(indicators, currentPrice, histMain);
    const patterns = detectAllPatterns(histMain, indicators);

    // Pattern bonus
    const patBonus = Math.min(patterns.length * 2, 5);
    score.breakdown.patternBonus = { score: patBonus, max: 5, label: patterns.length > 0 ? `${patterns.length} formasyon tespit edildi` : 'Formasyon yok', count: patterns.length };
    score.total = Math.min(score.total + patBonus, 100);
    score.recommendation = score.total >= 65 ? 'AL' : score.total >= 45 ? 'TUT' : 'SAT';

    const commentary = generateTurkishCommentary(upperSymbol, stock.name || upperSymbol, score, indicators, patterns);

    const high90 = Math.max(...histMain.slice(-90).map(d => d.high));
    const low90  = Math.min(...histMain.slice(-90).map(d => d.low));
    const fibLevels = computeFibLevels(high90, low90);

    const multiTimeframe = {
      '1mo': buildMTFSummary(hist1mo),
      [period]: buildMTFSummary(histMain),
      '6mo': buildMTFSummary(hist6mo)
    };

    const result = {
      symbol: upperSymbol,
      name: stock.name || upperSymbol,
      sector: stock.sector || 'Bilinmiyor',
      market: bist30Stocks.find(s => s.symbol === upperSymbol) ? 'BIST30' : bist100Stocks.find(s => s.symbol === upperSymbol) ? 'BIST100' : 'BIST',
      isCrypto: false,
      currentPrice: +currentPrice.toFixed(2),
      changePercent: +(stock.changePercent || 0).toFixed(2),
      period,
      score,
      indicators: {
        rsi: indicators.rsi, macd: indicators.macd, macdSignal: indicators.macdSignal,
        macdHistogram: indicators.macdHistogram, ema5: indicators.ema5, ema9: indicators.ema9,
        ema21: indicators.ema21, ema50: indicators.ema50, ema100: indicators.ema100,
        ema200: indicators.ema200, sma50: indicators.sma50, sma200: indicators.sma200,
        bollingerUpper: indicators.bollingerUpper, bollingerMiddle: indicators.bollingerMiddle,
        bollingerLower: indicators.bollingerLower, atr: indicators.atr,
        stochRsiK: indicators.stochRsiK, stochRsiD: indicators.stochRsiD,
        williamsR: indicators.williamsR, cci: indicators.cci, obv: indicators.obv,
        volumeSMA20: indicators.volumeSMA20, support: indicators.support, resistance: indicators.resistance,
        pivot: indicators.pivot, r1: indicators.r1, r2: indicators.r2, s1: indicators.s1, s2: indicators.s2
      },
      fibonacci: { high: high90, low: low90, levels: fibLevels, currentPrice: +currentPrice.toFixed(2) },
      patterns, commentary, multiTimeframe,
      cachedAt: new Date().toISOString()
    };

    proAnalizCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (error) {
    console.error(`Pro analiz hatasi ${upperSymbol}:`, error.message);
    res.status(500).json({ error: 'Analiz yapılamadı: ' + error.message });
  }
});

// --- ROUTE 3: Crypto Pro Analysis (Multi-source: Yahoo → Binance → CryptoCompare → CoinGecko) ---
const PRO_CRYPTO_STALE_TTL = 6 * 60 * 60 * 1000; // 6 saat - tüm kaynaklar başarısız olursa

// CoinGecko ID → ticker (BTC, ETH...) eşleştirme — fallback'ler için ticker gerekir
const GECKO_ID_TO_TICKER = Object.fromEntries(
  Object.entries(CRYPTO_MAP).map(([t, id]) => [id, t])
);

async function fetchCryptoOhlcMultiSource(coinId) {
  const axios = require('axios');
  const ticker = GECKO_ID_TO_TICKER[coinId] || coinId.toUpperCase();
  const errors = [];

  // 1) Yahoo Finance (en güvenilir, anahtarsız)
  try {
    const r = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}-USD?interval=1d&range=1y`,
      { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const result = r.data?.chart?.result?.[0];
    if (result) {
      const ts = result.timestamp || [];
      const q = result.indicators?.quote?.[0] || {};
      const bars = ts.map((t, i) => ({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        timestamp: t * 1000,
        open: parseFloat(q.open?.[i]) || 0,
        high: parseFloat(q.high?.[i]) || 0,
        low: parseFloat(q.low?.[i]) || 0,
        close: parseFloat(q.close?.[i]) || 0,
        volume: parseFloat(q.volume?.[i]) || 0,
      })).filter(b => b.close > 0);
      if (bars.length >= 30) return { bars, source: 'yahoo' };
    }
  } catch (e) { errors.push(`Yahoo: ${e.message}`); }

  // 2) Binance
  try {
    const r = await axios.get(
      `https://api.binance.com/api/v3/klines?symbol=${ticker}USDT&interval=1d&limit=365`,
      { timeout: 10000 }
    );
    if (Array.isArray(r.data) && r.data.length > 0) {
      const bars = r.data.map(k => ({
        date: new Date(k[0]).toISOString().slice(0, 10),
        timestamp: k[0],
        open: parseFloat(k[1]), high: parseFloat(k[2]),
        low: parseFloat(k[3]), close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      })).filter(b => b.close > 0);
      if (bars.length >= 30) return { bars, source: 'binance' };
    }
  } catch (e) { errors.push(`Binance: ${e.message}`); }

  // 3) CryptoCompare
  try {
    const r = await axios.get(
      `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${ticker}&tsym=USD&limit=365`,
      { timeout: 10000 }
    );
    const rows = r.data?.Data?.Data;
    if (rows && rows.length > 0) {
      const bars = rows.map(rr => ({
        date: new Date(rr.time * 1000).toISOString().slice(0, 10),
        timestamp: rr.time * 1000,
        open: rr.open, high: rr.high, low: rr.low, close: rr.close,
        volume: rr.volumefrom || 0,
      })).filter(b => b.close > 0);
      if (bars.length >= 30) return { bars, source: 'cryptocompare' };
    }
  } catch (e) { errors.push(`CryptoCompare: ${e.message}`); }

  // 4) CoinGecko (son çare — 429'a düşer)
  try {
    const r = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=365`,
      { timeout: 12000 }
    );
    const bars = (r.data || []).map(bar => ({
      date: new Date(bar[0]).toISOString().slice(0, 10),
      timestamp: bar[0],
      open: bar[1], high: bar[2], low: bar[3], close: bar[4],
      volume: 0,
    }));
    if (bars.length >= 20) return { bars, source: 'coingecko' };
  } catch (e) { errors.push(`CoinGecko: ${e.message}`); }

  throw new Error('Tüm kripto kaynakları başarısız: ' + errors.join(' | '));
}

async function fetchCryptoMetaMultiSource(coinId) {
  const axios = require('axios');
  const ticker = GECKO_ID_TO_TICKER[coinId] || coinId.toUpperCase();

  // Önce markets cache'inden bak (warmup ile dolu olur)
  const cachedMk = cryptoMarketsCache.get('mk_usd_100');
  if (cachedMk?.data?.coins) {
    const hit = cachedMk.data.coins.find(c =>
      c.id === coinId || c.symbol?.toUpperCase() === ticker
    );
    if (hit) {
      return {
        name: hit.name,
        current_price: hit.currentPrice,
        price_change_percentage_24h: hit.priceChangePercent24h,
        market_cap: hit.marketCap,
        total_volume: hit.totalVolume,
      };
    }
  }

  // CoinGecko markets endpoint (rate limit'e takılabilir, ama meta opsiyonel)
  try {
    const r = await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinId}&order=market_cap_desc`,
      { timeout: 6000 }
    );
    return (r.data || [])[0] || {};
  } catch {
    // Binance fiyat bilgisi
    try {
      const axios2 = require('axios');
      const r = await axios2.get(
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${ticker}USDT`,
        { timeout: 5000 }
      );
      return {
        name: ticker,
        current_price: parseFloat(r.data.lastPrice),
        price_change_percentage_24h: parseFloat(r.data.priceChangePercent),
        total_volume: parseFloat(r.data.quoteVolume),
        market_cap: null,
      };
    } catch {
      return {};
    }
  }
}

app.get('/api/pro-analiz/crypto/:coinId', async (req, res) => {
  const { coinId } = req.params;
  const cached = cryptoProCache.get(coinId);
  if (cached && (Date.now() - cached.ts) < CRYPTO_PRO_TTL) return res.json(cached.data);

  try {
    const [{ bars: ohlcBars, source: ohlcSource }, coinMeta] = await Promise.all([
      fetchCryptoOhlcMultiSource(coinId),
      fetchCryptoMetaMultiSource(coinId),
    ]);

    if (ohlcBars.length < 20) {
      // Eski cache stale dön
      if (cached && Date.now() - cached.ts < PRO_CRYPTO_STALE_TTL) {
        return res.json({ ...cached.data, stale: true });
      }
      return res.status(404).json({ error: 'Yeterli kripto veri yok' });
    }

    const currentPrice = coinMeta.current_price || ohlcBars[ohlcBars.length - 1].close;
    const indicators = liveDataService.calculateIndicators(ohlcBars);
    if (!indicators) {
      if (cached && Date.now() - cached.ts < PRO_CRYPTO_STALE_TTL) {
        return res.json({ ...cached.data, stale: true });
      }
      return res.status(500).json({ error: 'Indikatör hesaplanamadı' });
    }

    const score = computeProScore(indicators, currentPrice, ohlcBars);
    const patterns = detectAllPatterns(ohlcBars, indicators);
    const patBonus = Math.min(patterns.length * 2, 5);
    score.breakdown.patternBonus = { score: patBonus, max: 5, label: patterns.length > 0 ? `${patterns.length} formasyon` : 'Yok', count: patterns.length };
    score.total = Math.min(score.total + patBonus, 100);
    score.recommendation = score.total >= 65 ? 'AL' : score.total >= 45 ? 'TUT' : 'SAT';

    const commentary = generateTurkishCommentary(coinId.toUpperCase(), coinMeta.name || coinId, score, indicators, patterns);
    const high90 = Math.max(...ohlcBars.slice(-90).map(d => d.high));
    const low90  = Math.min(...ohlcBars.slice(-90).map(d => d.low));
    const fibLevels = computeFibLevels(high90, low90);

    const result = {
      symbol: coinId.toUpperCase(), name: coinMeta.name || coinId, sector: 'Kripto Para',
      market: 'CRYPTO', isCrypto: true,
      currentPrice: +currentPrice.toFixed(4),
      changePercent: +(coinMeta.price_change_percentage_24h || 0).toFixed(2),
      marketCap: coinMeta.market_cap, volume24h: coinMeta.total_volume,
      score,
      indicators: {
        rsi: indicators.rsi, macd: indicators.macd, macdSignal: indicators.macdSignal,
        macdHistogram: indicators.macdHistogram, ema5: indicators.ema5, ema9: indicators.ema9,
        ema21: indicators.ema21, ema50: indicators.ema50, ema100: indicators.ema100, ema200: indicators.ema200,
        bollingerUpper: indicators.bollingerUpper, bollingerMiddle: indicators.bollingerMiddle,
        bollingerLower: indicators.bollingerLower, atr: indicators.atr,
        williamsR: indicators.williamsR, cci: indicators.cci,
        stochRsiK: indicators.stochRsiK, stochRsiD: indicators.stochRsiD
      },
      fibonacci: { high: high90, low: low90, levels: fibLevels, currentPrice: +currentPrice.toFixed(4) },
      patterns, commentary,
      ohlc: ohlcBars.slice(-180), // chart için son 180 gün
      dataSource: ohlcSource,
      cachedAt: new Date().toISOString()
    };

    cryptoProCache.set(coinId, { data: result, ts: Date.now() });
    res.json(result);
  } catch (error) {
    console.error(`Crypto pro analiz hatasi ${coinId}:`, error.message);
    // Stale cache fallback
    if (cached && Date.now() - cached.ts < PRO_CRYPTO_STALE_TTL) {
      return res.json({ ...cached.data, stale: true });
    }
    res.status(503).json({ error: 'Kripto analiz şu an yapılamıyor, birkaç dakika sonra tekrar deneyin', detail: error.message });
  }
});

// --- Crypto map endpoint (for frontend) ---
app.get('/api/pro-analiz/crypto-list', (req, res) => {
  res.json({ coins: Object.entries(CRYPTO_MAP).map(([symbol, id]) => ({ symbol, id })) });
});

// ============ PORTFOLIO (Lot bazlı portföy takibi) ============
// Memory-store. Her kullanıcının kendi lot listesi var.
// Lot şekli: { id, symbol, quantity, buyPrice, buyDate, type: 'buy'|'sell', note }
const portfolioStore = new Map(); // userId -> [lot, ...]

// O(1) sembol doğrulaması — kullanıcı kafasından "THYAOOO" gibi bir şey yazsa
// backend reddediyor. allBistStocks zaten yukarıda import edilmiş (510 hisse).
const VALID_BIST_SYMBOLS = new Set(allBistStocks.map((s) => s.symbol));

function getUserKey(req) {
  // requireAuth middleware'den geçtiyse req.user.id var, yoksa demo
  return req.user?.id || req.headers['x-portfolio-user'] || 'demo';
}

// GET tüm portföy + computed metrics
app.get('/api/portfolio', requireAuth, async (req, res) => {
  const userId = getUserKey(req);
  const lots = portfolioStore.get(userId) || [];

  // Her sembol için canlı fiyat çek
  const symbols = [...new Set(lots.map(l => l.symbol))];
  const liveQuotes = {};
  if (symbols.length > 0) {
    try {
      const yahooFinance = (await import('yahoo-finance2')).default;
      const yahooSymbols = symbols.map(s => s.includes('.') ? s : `${s}.IS`);
      const results = await yahooFinance.quote(yahooSymbols, {}, { validateResult: false });
      const arr = Array.isArray(results) ? results : [results];
      arr.forEach(q => {
        if (q?.symbol) {
          const cleanSym = q.symbol.replace('.IS', '');
          liveQuotes[cleanSym] = {
            price: q.regularMarketPrice || q.previousClose || 0,
            previousClose: q.previousClose || 0,
            change: q.regularMarketChange || 0,
            changePercent: q.regularMarketChangePercent || 0,
          };
        }
      });
    } catch (e) {
      console.warn('[portfolio] Live fiyat hatası:', e.message);
    }
  }

  // Symbol bazlı agregasyon (FIFO mantığı: sell'leri buy'lardan düş)
  const grouped = {};
  for (const lot of lots) {
    if (!grouped[lot.symbol]) {
      grouped[lot.symbol] = { symbol: lot.symbol, lots: [], totalQty: 0, totalCost: 0 };
    }
    grouped[lot.symbol].lots.push(lot);
  }

  const positions = Object.values(grouped).map(g => {
    // Net quantity ve weighted average cost
    let netQty = 0;
    let totalCost = 0;
    for (const lot of g.lots) {
      const q = parseFloat(lot.quantity) || 0;
      const p = parseFloat(lot.buyPrice) || 0;
      if (lot.type === 'sell') {
        // Satış: maliyetten düş, mevcut ortalama maliyetle
        const avgCost = netQty > 0 ? totalCost / netQty : 0;
        netQty -= q;
        totalCost -= avgCost * q;
      } else {
        // Alım
        netQty += q;
        totalCost += q * p;
      }
    }

    const avgCost = netQty > 0 ? totalCost / netQty : 0;
    const live = liveQuotes[g.symbol] || { price: 0, changePercent: 0 };
    const currentValue = netQty * live.price;
    const investedValue = netQty * avgCost;
    const profit = currentValue - investedValue;
    const profitPercent = investedValue > 0 ? (profit / investedValue) * 100 : 0;

    return {
      symbol: g.symbol,
      quantity: netQty,
      avgCost: parseFloat(avgCost.toFixed(4)),
      currentPrice: live.price,
      dayChangePercent: live.changePercent,
      currentValue: parseFloat(currentValue.toFixed(2)),
      investedValue: parseFloat(investedValue.toFixed(2)),
      profit: parseFloat(profit.toFixed(2)),
      profitPercent: parseFloat(profitPercent.toFixed(2)),
      lotCount: g.lots.length,
      lots: g.lots,
    };
  }).filter(p => p.quantity > 0); // Sadece açık pozisyonlar

  // Toplam özet
  const summary = positions.reduce((s, p) => {
    s.totalInvested += p.investedValue;
    s.totalCurrent += p.currentValue;
    s.totalProfit += p.profit;
    return s;
  }, { totalInvested: 0, totalCurrent: 0, totalProfit: 0 });
  summary.totalProfitPercent = summary.totalInvested > 0
    ? (summary.totalProfit / summary.totalInvested) * 100
    : 0;
  summary.totalInvested = parseFloat(summary.totalInvested.toFixed(2));
  summary.totalCurrent = parseFloat(summary.totalCurrent.toFixed(2));
  summary.totalProfit = parseFloat(summary.totalProfit.toFixed(2));
  summary.totalProfitPercent = parseFloat(summary.totalProfitPercent.toFixed(2));

  res.json({ positions, summary, allLots: lots });
});

// POST yeni lot ekle (alım veya satım)
app.post('/api/portfolio', requireAuth, (req, res) => {
  const { symbol, quantity, buyPrice, buyDate, type, note } = req.body;

  if (!symbol || !quantity || !buyPrice) {
    return res.status(400).json({ error: 'symbol, quantity, buyPrice gerekli' });
  }

  const cleanSymbol = String(symbol).toUpperCase().trim();
  if (!VALID_BIST_SYMBOLS.has(cleanSymbol)) {
    return res.status(400).json({
      error: `${cleanSymbol} BIST'te işlem gören bir hisse değil. Listeden seçin.`,
    });
  }

  const userId = getUserKey(req);
  const lots = portfolioStore.get(userId) || [];

  const newLot = {
    id: `lot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    symbol: cleanSymbol,
    quantity: Math.abs(parseFloat(quantity)),
    buyPrice: parseFloat(buyPrice),
    buyDate: buyDate || new Date().toISOString().slice(0, 10),
    type: type === 'sell' ? 'sell' : 'buy',
    note: note || '',
    createdAt: new Date().toISOString(),
  };

  // Satış için: mevcut net adetten fazla satılamaz
  if (newLot.type === 'sell') {
    let net = 0;
    for (const l of lots) {
      if (l.symbol !== newLot.symbol) continue;
      net += l.type === 'sell' ? -l.quantity : l.quantity;
    }
    if (newLot.quantity > net) {
      return res.status(400).json({
        error: `${newLot.symbol}: Mevcut ${net} adet, ${newLot.quantity} satamazsınız`,
      });
    }
  }

  lots.push(newLot);
  portfolioStore.set(userId, lots);
  res.json({ success: true, lot: newLot });
});

// DELETE bir lot sil
app.delete('/api/portfolio/:lotId', requireAuth, (req, res) => {
  const userId = getUserKey(req);
  const lots = portfolioStore.get(userId) || [];
  const filtered = lots.filter(l => l.id !== req.params.lotId);
  if (filtered.length === lots.length) {
    return res.status(404).json({ error: 'Lot bulunamadı' });
  }
  portfolioStore.set(userId, filtered);
  res.json({ success: true });
});

// PUT bir lot güncelle (sadece kendi lot'unu)
app.put('/api/portfolio/:lotId', requireAuth, (req, res) => {
  const userId = getUserKey(req);
  const lots = portfolioStore.get(userId) || [];
  const lot = lots.find(l => l.id === req.params.lotId);
  if (!lot) return res.status(404).json({ error: 'Lot bulunamadı' });

  const { quantity, buyPrice, buyDate, note, type } = req.body;
  if (quantity != null) lot.quantity = Math.abs(parseFloat(quantity));
  if (buyPrice != null) lot.buyPrice = parseFloat(buyPrice);
  if (buyDate) lot.buyDate = buyDate;
  if (note !== undefined) lot.note = note;
  if (type) lot.type = type === 'sell' ? 'sell' : 'buy';

  res.json({ success: true, lot });
});

// ============ KRİPTO MARKETS — ÇOKLU PROVIDER (CoinGecko → CoinCap → Binance) ============
// Her API anahtarsız & ücretsiz. Birinci 429/error verirse otomatik bir sonrakine geç.
const cryptoMarketsCache = new Map();
const CRYPTO_CACHE_TTL = 10 * 60 * 1000; // 10 dakika (cache hit)
const CRYPTO_STALE_TTL = 6 * 60 * 60 * 1000; // 6 saat (stale OK on 429/error)

// Logo CDN — CoinGecko ID'sinden ikon URL'si
const coinIconUrl = (id) => `https://assets.coincap.io/assets/icons/${id.toLowerCase()}@2x.png`;

// ─── Provider 1: CoinGecko (en zengin veri, ama 429 sınırlı) ───
async function fetchMarketsCoinGecko(vs, limit) {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vs}&order=market_cap_desc&per_page=${limit}&page=1&sparkline=true&price_change_percentage=1h,24h,7d`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'BorsaKrali/3.3', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
  const data = await r.json();
  return data.map(c => ({
    id: c.id,
    symbol: (c.symbol || '').toUpperCase(),
    name: c.name,
    image: c.image,
    currentPrice: c.current_price,
    marketCap: c.market_cap,
    marketCapRank: c.market_cap_rank,
    totalVolume: c.total_volume,
    high24h: c.high_24h,
    low24h: c.low_24h,
    priceChange24h: c.price_change_24h,
    priceChangePercent1h: c.price_change_percentage_1h_in_currency,
    priceChangePercent24h: c.price_change_percentage_24h_in_currency,
    priceChangePercent7d: c.price_change_percentage_7d_in_currency,
    circulatingSupply: c.circulating_supply,
    totalSupply: c.total_supply,
    ath: c.ath,
    athChangePercent: c.ath_change_percentage,
    sparkline: c.sparkline_in_7d?.price?.slice(-30) || [],
  }));
}

// ─── Provider 2: CoinCap.io (anahtarsız, sınırsız fiilen) ───
async function fetchMarketsCoinCap(limit) {
  const url = `https://api.coincap.io/v2/assets?limit=${limit}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'BorsaKrali/3.3', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`CoinCap HTTP ${r.status}`);
  const { data } = await r.json();
  return (data || []).map(c => ({
    id: c.id,
    symbol: (c.symbol || '').toUpperCase(),
    name: c.name,
    image: coinIconUrl(c.symbol || c.id),
    currentPrice: parseFloat(c.priceUsd) || 0,
    marketCap: parseFloat(c.marketCapUsd) || 0,
    marketCapRank: parseInt(c.rank) || null,
    totalVolume: parseFloat(c.volumeUsd24Hr) || 0,
    high24h: null,
    low24h: null,
    priceChange24h: null,
    priceChangePercent1h: null,
    priceChangePercent24h: parseFloat(c.changePercent24Hr) || 0,
    priceChangePercent7d: null,
    circulatingSupply: parseFloat(c.supply) || null,
    totalSupply: parseFloat(c.maxSupply) || null,
    ath: null,
    athChangePercent: null,
    sparkline: [],
  }));
}

// ─── Provider 3: Binance (en hızlı, ama sadece USDT çiftleri) ───
async function fetchMarketsBinance(limit) {
  const r = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
    headers: { 'User-Agent': 'BorsaKrali/3.3' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`Binance HTTP ${r.status}`);
  const arr = await r.json();
  // USDT çiftlerini filtrele, hacme göre sırala
  const usdt = arr.filter(t => t.symbol.endsWith('USDT'))
    .map(t => ({
      symbolBase: t.symbol.replace('USDT', ''),
      price: parseFloat(t.lastPrice),
      change24hPct: parseFloat(t.priceChangePercent),
      high24h: parseFloat(t.highPrice),
      low24h: parseFloat(t.lowPrice),
      vol: parseFloat(t.quoteVolume),
    }))
    .sort((a, b) => b.vol - a.vol)
    .slice(0, limit);

  return usdt.map((t, i) => ({
    id: t.symbolBase.toLowerCase(),
    symbol: t.symbolBase,
    name: t.symbolBase,
    image: coinIconUrl(t.symbolBase),
    currentPrice: t.price,
    marketCap: null,
    marketCapRank: i + 1,
    totalVolume: t.vol,
    high24h: t.high24h,
    low24h: t.low24h,
    priceChange24h: null,
    priceChangePercent1h: null,
    priceChangePercent24h: t.change24hPct,
    priceChangePercent7d: null,
    circulatingSupply: null,
    totalSupply: null,
    ath: null,
    athChangePercent: null,
    sparkline: [],
  }));
}

// Ana orkestratör — Binance önce (en hızlı, rate limit yüksek), sonra CoinCap, son CoinGecko
// (CoinGecko ücretsiz tier'da Türkiye IP'lerinden sürekli 429 dönüyor)
async function fetchCryptoMarkets(vs, limit) {
  const errors = [];
  // 1) Binance (USDT, güvenilir, neredeyse hiç 429 yok)
  try {
    const coins = await fetchMarketsBinance(limit);
    return { coins, source: 'binance' };
  } catch (e) {
    errors.push(`Binance: ${e.message}`);
  }
  // 2) CoinCap (USD, anahtarsız sınırsız)
  try {
    const coins = await fetchMarketsCoinCap(limit);
    return { coins, source: 'coincap' };
  } catch (e) {
    errors.push(`CoinCap: ${e.message}`);
  }
  // 3) CoinGecko (en zengin veri ama 429 sorunu var) — son çare
  if (vs !== 'usd' || true) {
    try {
      const coins = await fetchMarketsCoinGecko(vs, limit);
      return { coins, source: 'coingecko' };
    } catch (e) {
      errors.push(`CoinGecko: ${e.message}`);
    }
  }
  throw new Error('Tüm kripto kaynakları başarısız: ' + errors.join(' | '));
}

app.get('/api/crypto/markets', async (req, res) => {
  const vs = (req.query.vs || 'usd').toLowerCase();
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const cacheKey = `mk_${vs}_${limit}`;

  const cached = cryptoMarketsCache.get(cacheKey);
  // Fresh cache hit
  if (cached && Date.now() - cached.t < CRYPTO_CACHE_TTL) {
    return res.json({ ...cached.data, fromCache: true });
  }

  try {
    const { coins, source } = await fetchCryptoMarkets(vs, limit);
    const payload = {
      vs, count: coins.length, coins, source,
      lastUpdate: new Date().toISOString(),
    };
    cryptoMarketsCache.set(cacheKey, { t: Date.now(), data: payload });
    res.json({ ...payload, fromCache: false });
  } catch (e) {
    console.error('[crypto/markets]', e.message);
    // Tüm kaynaklar çöktü - eski cache varsa döndür
    if (cached && Date.now() - cached.t < CRYPTO_STALE_TTL) {
      return res.json({ ...cached.data, fromCache: true, stale: true });
    }
    res.status(503).json({ error: 'Kripto verileri şu an alınamıyor, lütfen birkaç dakika sonra tekrar deneyin.', detail: e.message });
  }
});

// Tek bir coin'in canlı verisi (alarm için hızlı erişim)
app.get('/api/crypto/quote/:id', async (req, res) => {
  const id = (req.params.id || '').toLowerCase();
  if (!id) return res.status(400).json({ error: 'id gerekli' });
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd,try&include_24hr_change=true&include_market_cap=true`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'BorsaKrali/3.3' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
    const data = await r.json();
    const item = data[id];
    if (!item) return res.status(404).json({ error: 'Coin bulunamadı' });
    res.json({
      id,
      priceUsd: item.usd,
      priceTry: item.try,
      change24h: item.usd_24h_change,
      marketCap: item.usd_market_cap,
      lastUpdate: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Trending coins (popüler / arama trendinde) — CoinGecko 429 olursa Binance top-gainers fallback
const trendingCache = { t: 0, data: null };

async function fetchTrendingBinanceFallback() {
  // Binance'den 24s en çok yükselen 8 USDT coinini al
  try {
    const r = await fetch('https://api.binance.com/api/v3/ticker/24hr', {
      headers: { 'User-Agent': 'BorsaKrali/3.3' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const arr = await r.json();
    return arr
      .filter(t => t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) > 1e7)
      .map(t => ({
        symbolBase: t.symbol.replace('USDT', ''),
        change: parseFloat(t.priceChangePercent),
      }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 8)
      .map((t, i) => ({
        id: t.symbolBase.toLowerCase(),
        symbol: t.symbolBase.toLowerCase(),
        name: t.symbolBase,
        image: `https://assets.coincap.io/assets/icons/${t.symbolBase.toLowerCase()}@2x.png`,
        marketCapRank: i + 1,
        score: 0,
      }));
  } catch { return []; }
}

app.get('/api/crypto/trending', async (req, res) => {
  // 15 dk fresh cache
  if (trendingCache.data && Date.now() - trendingCache.t < 15 * 60 * 1000) {
    return res.json({ ...trendingCache.data, fromCache: true });
  }
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/search/trending', {
      headers: { 'User-Agent': 'BorsaKrali/3.3' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
    const data = await r.json();
    const trending = (data.coins || []).map(item => ({
      id: item.item.id,
      symbol: item.item.symbol,
      name: item.item.name,
      image: item.item.large || item.item.thumb,
      marketCapRank: item.item.market_cap_rank,
      score: item.item.score,
    }));
    const payload = { trending, lastUpdate: new Date().toISOString(), source: 'coingecko' };
    trendingCache.t = Date.now();
    trendingCache.data = payload;
    res.json(payload);
  } catch (e) {
    // 1) Eski cache varsa kullan
    if (trendingCache.data && Date.now() - trendingCache.t < 6 * 60 * 60 * 1000) {
      return res.json({ ...trendingCache.data, fromCache: true, stale: true });
    }
    // 2) Binance fallback — top gainers/losers'tan trending listesi türet
    const binanceTrending = await fetchTrendingBinanceFallback();
    const payload = { trending: binanceTrending, lastUpdate: new Date().toISOString(), source: 'binance' };
    if (binanceTrending.length > 0) {
      trendingCache.t = Date.now();
      trendingCache.data = payload;
    }
    // 3) Boş bile olsa 200 dön — frontend'e düzgün veri gelsin (UI 500'e takılmaz)
    res.json(payload);
  }
});

// Global pazar özeti (toplam mcap, dominance) — CoinGecko 429 olursa markets cache'inden türet
const globalCache = { t: 0, data: null };

function deriveGlobalFromMarketsCache() {
  // Markets cache'inden basit toplam pazar özeti çıkar
  const cached = cryptoMarketsCache.get('mk_usd_100');
  if (!cached?.data?.coins) return null;
  const coins = cached.data.coins;
  const totalMcap = coins.reduce((s, c) => s + (c.marketCap || 0), 0);
  const totalVol = coins.reduce((s, c) => s + (c.totalVolume || 0), 0);
  const btc = coins.find(c => c.symbol === 'BTC');
  const eth = coins.find(c => c.symbol === 'ETH');
  const btcDom = btc && totalMcap > 0 ? (btc.marketCap / totalMcap) * 100 : null;
  const ethDom = eth && totalMcap > 0 ? (eth.marketCap / totalMcap) * 100 : null;
  return {
    activeCryptocurrencies: coins.length,
    markets: null,
    totalMarketCapUsd: totalMcap || null,
    totalVolumeUsd: totalVol || null,
    btcDominance: btcDom,
    ethDominance: ethDom,
    marketCapChangePercent24h: null,
    lastUpdate: new Date().toISOString(),
    source: 'derived-markets',
  };
}

app.get('/api/crypto/global', async (req, res) => {
  if (globalCache.data && Date.now() - globalCache.t < 10 * 60 * 1000) {
    return res.json({ ...globalCache.data, fromCache: true });
  }
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/global', {
      headers: { 'User-Agent': 'BorsaKrali/3.3' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`CoinGecko HTTP ${r.status}`);
    const { data } = await r.json();
    const payload = {
      activeCryptocurrencies: data.active_cryptocurrencies,
      markets: data.markets,
      totalMarketCapUsd: data.total_market_cap?.usd,
      totalVolumeUsd: data.total_volume?.usd,
      btcDominance: data.market_cap_percentage?.btc,
      ethDominance: data.market_cap_percentage?.eth,
      marketCapChangePercent24h: data.market_cap_change_percentage_24h_usd,
      lastUpdate: new Date().toISOString(),
      source: 'coingecko',
    };
    globalCache.t = Date.now();
    globalCache.data = payload;
    res.json(payload);
  } catch (e) {
    // 1) Eski cache
    if (globalCache.data && Date.now() - globalCache.t < 6 * 60 * 60 * 1000) {
      return res.json({ ...globalCache.data, fromCache: true, stale: true });
    }
    // 2) Markets cache'inden türet
    const derived = deriveGlobalFromMarketsCache();
    if (derived) return res.json({ ...derived, fromCache: true, stale: true });
    // 3) Boş ama 200 — frontend null kontrolü yapıyor
    res.json({
      activeCryptocurrencies: null, markets: null,
      totalMarketCapUsd: null, totalVolumeUsd: null,
      btcDominance: null, ethDominance: null,
      marketCapChangePercent24h: null,
      lastUpdate: new Date().toISOString(),
      source: 'unavailable',
    });
  }
});

// === ARKA PLAN WARMUP: Server start'ta + her 8 dakikada bir cache'i doldur ===
async function warmupCryptoCache() {
  try {
    const { coins, source } = await fetchCryptoMarkets('usd', 100);
    const stamp = new Date().toISOString();
    cryptoMarketsCache.set('mk_usd_100', { t: Date.now(), data: { vs: 'usd', count: coins.length, coins, source, lastUpdate: stamp } });
    cryptoMarketsCache.set('mk_usd_50',  { t: Date.now(), data: { vs: 'usd', count: 50, coins: coins.slice(0, 50), source, lastUpdate: stamp } });
    console.log(`[warmup] Crypto cache dolduruldu: ${coins.length} coin (kaynak: ${source})`);
  } catch (e) {
    console.warn('[warmup] Hata:', e.message);
  }
}
// İlk warmup 5sn sonra, sonra her 8 dakikada bir
setTimeout(warmupCryptoCache, 5000);
setInterval(warmupCryptoCache, 8 * 60 * 1000);

// ============ NOTES ROUTES ============
const notesStore = new Map(); // userId -> notes[]

app.get('/api/notes', requireAuth, (req, res) => {
  const userNotes = notesStore.get(req.user.id) || [];
  res.json({ success: true, notes: userNotes });
});

app.post('/api/notes', requireAuth, (req, res) => {
  const { symbol, title, content, category } = req.body;
  if (!content?.trim()) return res.status(400).json({ success: false, error: 'İçerik gerekli' });
  const userNotes = notesStore.get(req.user.id) || [];
  const note = {
    id: 'N' + Date.now().toString(36),
    symbol: symbol?.toUpperCase() || '',
    title: title?.trim() || '',
    content: content.trim(),
    category: category || 'Diğer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  userNotes.unshift(note);
  notesStore.set(req.user.id, userNotes);
  res.json({ success: true, note });
});

app.put('/api/notes/:id', requireAuth, (req, res) => {
  const { symbol, title, content, category } = req.body;
  const userNotes = notesStore.get(req.user.id) || [];
  const idx = userNotes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Not bulunamadi' });
  userNotes[idx] = { ...userNotes[idx], symbol: symbol?.toUpperCase() || '', title: title?.trim() || '', content: content?.trim() || userNotes[idx].content, category: category || userNotes[idx].category, updatedAt: new Date().toISOString() };
  notesStore.set(req.user.id, userNotes);
  res.json({ success: true, note: userNotes[idx] });
});

app.delete('/api/notes/:id', requireAuth, (req, res) => {
  const userNotes = (notesStore.get(req.user.id) || []).filter(n => n.id !== req.params.id);
  notesStore.set(req.user.id, userNotes);
  res.json({ success: true });
});

// ============ REQUESTS ROUTES ============
let requestsStore = [];

app.get('/api/requests', (req, res) => {
  const sorted = [...requestsStore].sort((a, b) => (b.votes || 0) - (a.votes || 0));
  res.json({ success: true, requests: sorted });
});

app.post('/api/requests', requireAuth, (req, res) => {
  const { title, description, category } = req.body;
  if (!title?.trim()) return res.status(400).json({ success: false, error: 'Başlık gerekli' });
  const req_ = {
    id: 'REQ' + Date.now().toString(36),
    title: title.trim(),
    description: description?.trim() || '',
    category: category || 'Özellik',
    status: 'bekliyor',
    votes: 0,
    voters: [],
    authorId: req.user.id,
    createdAt: new Date().toISOString(),
  };
  requestsStore.unshift(req_);
  res.json({ success: true, request: req_ });
});

app.post('/api/requests/:id/vote', requireAuth, (req, res) => {
  const item = requestsStore.find(r => r.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, error: 'İstek bulunamadi' });
  if (!item.voters.includes(req.user.id)) {
    item.votes = (item.votes || 0) + 1;
    item.voters.push(req.user.id);
  }
  res.json({ success: true, votes: item.votes });
});

// ─── EMA34 Takip Sistemi ─────────────────────────────────────────────────────
// EMA hesapla (standart formül, k = 2/(n+1))
function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

// TEMA — Triple Exponential Moving Average (TradingView Pine v6 ile aynı)
//   ema1 = ta.ema(close, length)
//   ema2 = ta.ema(ema1,  length)
//   ema3 = ta.ema(ema2,  length)
//   out  = 3 * (ema1 - ema2) + ema3
// EMA özyinelemeli olarak ilk barda kaynağın değeri ile başlatılır (Pine Script davranışı).
function calcTEMASeries(closes, period) {
  const n = closes.length;
  if (n === 0) return [];
  const k = 2 / (period + 1);
  const ema1 = new Array(n);
  const ema2 = new Array(n);
  const ema3 = new Array(n);
  const tema = new Array(n);
  ema1[0] = closes[0];
  ema2[0] = closes[0];
  ema3[0] = closes[0];
  tema[0] = closes[0];
  for (let i = 1; i < n; i++) {
    ema1[i] = k * closes[i]  + (1 - k) * ema1[i - 1];
    ema2[i] = k * ema1[i]    + (1 - k) * ema2[i - 1];
    ema3[i] = k * ema2[i]    + (1 - k) * ema3[i - 1];
    tema[i] = 3 * (ema1[i] - ema2[i]) + ema3[i];
  }
  return tema;
}

function calcTEMA(closes, period) {
  if (!closes || closes.length < period) return null;
  const series = calcTEMASeries(closes, period);
  return series[series.length - 1];
}

// EMA34 tarayıcı cache
const ema34Cache = new Map();
const EMA34_CACHE_TTL = 10 * 60 * 1000; // 10 dakika

// GET /api/ema34/scan?list=bist30|bist100|all
app.get('/api/ema34/scan', async (req, res) => {
  try {
    const listParam = req.query.list || 'bist30';
    const isCryptoList = listParam === 'crypto';
    const cacheKey = `ema34-${listParam}`;
    const cached = ema34Cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < EMA34_CACHE_TTL) {
      return res.json(cached.data);
    }

    let symbols;
    if (listParam === 'bist30') symbols = bist30Stocks.map(s => s.symbol || s);
    else if (listParam === 'bist100') symbols = bist100Stocks.map(s => s.symbol || s);
    else if (isCryptoList) symbols = CRYPTO_SCAN_SYMBOLS;
    else symbols = allBistStocks.map(s => s.symbol || s); // 'all' = tüm BIST (~510 hisse)

    // Paralel veri çekimi (10'ar batch, kripto için 5'er)
    const results = [];
    const BATCH = isCryptoList ? 5 : 10;
    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch = symbols.slice(i, i + BATCH);
      const batchResults = await Promise.allSettled(
        batch.map(async (sym) => {
          try {
            let hist;
            if (isCryptoList) {
              const raw = await fetchCryptoHistorical(sym);
              if (!raw || raw.length < 100) return null;
              hist = raw;
            } else {
              hist = await liveDataService.fetchHistoricalData(sym, '1y', '1d');
              if (!hist || hist.length < 100) return null;
            }
            const closes = hist.map(c => c.close);
            // TEMA34 (Triple EMA) — 3*(ema1-ema2)+ema3, length=34
            const temaSeries = calcTEMASeries(closes, 34);
            const ema34_today = temaSeries[temaSeries.length - 1];
            const ema34_prev  = temaSeries[temaSeries.length - 2];
            const lastClose = closes[closes.length - 1];
            const prevClose = closes[closes.length - 2];
            if (ema34_today == null || ema34_prev == null) return null;

            // Durum tespiti
            const aboveNow = lastClose > ema34_today;
            const abovePrev = prevClose > ema34_prev;
            let signal = null;
            if (!abovePrev && aboveNow) signal = 'cross_above'; // EMA34 üzerine çıktı
            else if (abovePrev && !aboveNow) signal = 'cross_below'; // EMA34 altına indi
            else if (aboveNow) signal = 'above'; // EMA34 üzerinde devam
            else signal = 'below'; // EMA34 altında devam

            // EMA34'e uzaklık yüzdesi
            const distPct = ((lastClose - ema34_today) / ema34_today * 100).toFixed(2);

            // EMA34 skoru (0-100)
            // Pozitif: EMA üzerinde, güçlü trend; Negatif: altında
            let score = 50;
            if (aboveNow) {
              score += 20; // üzerinde
              if (signal === 'cross_above') score += 20; // yeni kesişim
              const pctNum = parseFloat(distPct);
              if (pctNum > 0 && pctNum < 3) score += 10; // EMA'ya yakın ama üstünde (temiz)
              if (pctNum >= 3 && pctNum < 8) score += 5;
            } else {
              score -= 20;
              if (signal === 'cross_below') score -= 15; // yeni kırılım
            }
            score = Math.min(100, Math.max(0, score));

            return {
              symbol: sym,
              lastClose,
              ema34: parseFloat(ema34_today.toFixed(2)),
              ema34Prev: parseFloat(ema34_prev.toFixed(2)),
              signal,
              aboveEma34: aboveNow,
              distancePct: distPct,
              score,
              candleCount: hist.length,
              isCrypto: isCryptoList,
            };
          } catch { return null; }
        })
      );
      batchResults.forEach(r => { if (r.status === 'fulfilled' && r.value) results.push(r.value); });
      if (isCryptoList && i + BATCH < symbols.length) await new Promise(r => setTimeout(r, 300));
    }

    // Sırala: cross_above > above (score desc) > cross_below > below
    const ORDER = { cross_above: 0, above: 1, cross_below: 2, below: 3 };
    results.sort((a, b) => ORDER[a.signal] - ORDER[b.signal] || b.score - a.score);

    const data = {
      scannedAt: new Date().toISOString(),
      total: results.length,
      crossAbove: results.filter(r => r.signal === 'cross_above').length,
      crossBelow: results.filter(r => r.signal === 'cross_below').length,
      above: results.filter(r => r.signal === 'above').length,
      below: results.filter(r => r.signal === 'below').length,
      results,
    };
    ema34Cache.set(cacheKey, { data, ts: Date.now() });
    res.json(data);
  } catch (err) {
    console.error('EMA34 scan error:', err);
    res.status(500).json({ error: 'EMA34 tarama hatası', detail: err.message });
  }
});

// GET /api/ema34/track/:symbol — Tek hisse EMA34 detayı + geçmiş
app.get('/api/ema34/track/:symbol', async (req, res) => {
  try {
    const sym = req.params.symbol.toUpperCase().replace('-USD', '');
    const isCrypto = (req.query.type || '').toLowerCase() === 'crypto';
    let hist;
    if (isCrypto) {
      hist = await fetchCryptoHistorical(sym);
    } else {
      hist = await liveDataService.fetchHistoricalData(sym, '1y', '1d');
    }
    if (!hist || hist.length < 100) return res.status(404).json({ error: 'Yetersiz veri (TEMA34 için en az 100 mum gerekli)' });

    const closes = hist.map(c => c.close);

    // TEMA34 dizisi hesapla — out = 3*(ema1-ema2) + ema3
    const temaFull = calcTEMASeries(closes, 34);

    // İlk 34 barı atla (warmup) — sinyal güvenilir değil
    const ema34Series = [];
    for (let i = 34; i < closes.length; i++) {
      const tema = temaFull[i];
      const dateStr = hist[i].date || (hist[i].time ? new Date(hist[i].time * 1000).toISOString().slice(0, 10) : null);
      ema34Series.push({
        time: hist[i].time || (dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : i),
        date: dateStr,
        close: closes[i],
        ema34: parseFloat(tema.toFixed(2)),
        above: closes[i] > tema,
        signal: null,
      });
    }

    // Kesişim sinyalleri işaretle
    for (let i = 1; i < ema34Series.length; i++) {
      const prev = ema34Series[i - 1];
      const cur = ema34Series[i];
      if (!prev.above && cur.above) cur.signal = 'cross_above';
      else if (prev.above && !cur.above) cur.signal = 'cross_below';
    }

    const last = ema34Series[ema34Series.length - 1];
    // Aktif "AL devam" serisi: kaç gün üst üste EMA üzerinde
    let consecutiveDays = 0;
    for (let i = ema34Series.length - 1; i >= 0; i--) {
      if (ema34Series[i].above) consecutiveDays++;
      else break;
    }

    res.json({
      symbol: sym,
      lastClose: last.close,
      ema34: last.ema34,
      aboveEma34: last.above,
      consecutiveDaysAbove: consecutiveDays,
      activeSignal: last.above ? 'AL_DEVAM' : 'ÇIKIŞ',
      series: ema34Series.slice(-60), // son 60 gün
    });
  } catch (err) {
    res.status(500).json({ error: 'EMA34 takip hatası', detail: err.message });
  }
});

// ─── Tarama Analiz Merkezi — Strateji Tarayıcı ───────────────────────────────
const strategyScanCache = { data: null, ts: 0 };
const STRATEGY_SCAN_TTL = 10 * 60 * 1000; // 10 dakika

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcMACDData(closes) {
  if (closes.length < 35) return null;
  const k12 = 2 / 13, k26 = 2 / 27, k9 = 2 / 10;
  let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  const macdLine = [];
  for (let i = 12; i < 26; i++) e12 = closes[i] * k12 + e12 * (1 - k12);
  for (let i = 26; i < closes.length; i++) {
    e12 = closes[i] * k12 + e12 * (1 - k12);
    e26 = closes[i] * k26 + e26 * (1 - k26);
    macdLine.push(e12 - e26);
  }
  if (macdLine.length < 9) return null;
  let sig = macdLine.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  for (let i = 9; i < macdLine.length; i++) sig = macdLine[i] * k9 + sig * (1 - k9);
  let prevSig = macdLine.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  for (let i = 9; i < macdLine.length - 1; i++) prevSig = macdLine[i] * k9 + prevSig * (1 - k9);
  const n = macdLine.length;
  return { macd: macdLine[n - 1], signal: sig, prevMacd: macdLine[n - 2], prevSignal: prevSig };
}

function calcBollingerLast(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period);
  return { upper: mean + 2 * std, lower: mean - 2 * std };
}

function calcIchimokuLast(ohlcv) {
  if (ohlcv.length < 60) return null;
  const last = ohlcv.length - 1;
  const getMid = (slice) => (Math.max(...slice.map(d => d.high)) + Math.min(...slice.map(d => d.low))) / 2;
  const tenkan = getMid(ohlcv.slice(last - 8, last + 1));
  const kijun = getMid(ohlcv.slice(last - 25, last + 1));
  const spanA = (tenkan + kijun) / 2;
  const spanB = getMid(ohlcv.slice(last - 51, last + 1));
  return { tenkan, kijun, spanA, spanB };
}

function calcADXLast(ohlcv, period = 14) {
  if (ohlcv.length < period * 2 + 2) return null;
  const trs = [], plusDMs = [], minusDMs = [];
  for (let i = 1; i < ohlcv.length; i++) {
    const h = ohlcv[i].high, l = ohlcv[i].low, ph = ohlcv[i - 1].high, pl = ohlcv[i - 1].low, pc = ohlcv[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const up = h - ph, down = pl - l;
    plusDMs.push(up > down && up > 0 ? up : 0);
    minusDMs.push(down > up && down > 0 ? down : 0);
  }
  let sATR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let sPDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let sNDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  const dxArr = [], pdiLast = [], ndiLast = [];
  const addDX = (atr, pdm, ndm) => {
    if (!atr) { dxArr.push(0); pdiLast.push(0); ndiLast.push(0); return; }
    const pdi = (pdm / atr) * 100, ndi = (ndm / atr) * 100;
    pdiLast.push(pdi); ndiLast.push(ndi);
    dxArr.push(pdi + ndi > 0 ? (Math.abs(pdi - ndi) / (pdi + ndi)) * 100 : 0);
  };
  addDX(sATR, sPDM, sNDM);
  for (let i = period; i < trs.length; i++) {
    sATR = sATR - sATR / period + trs[i];
    sPDM = sPDM - sPDM / period + plusDMs[i];
    sNDM = sNDM - sNDM / period + minusDMs[i];
    addDX(sATR, sPDM, sNDM);
  }
  if (dxArr.length < period) return null;
  let adx = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxArr.length; i++) adx = (adx * (period - 1) + dxArr[i]) / period;
  const n = pdiLast.length - 1;
  return { adx, pdi: pdiLast[n], ndi: ndiLast[n] };
}

function calcSupertrendDir(ohlcv, closes, period = 10, mult = 3) {
  if (ohlcv.length < period + 3) return null;
  const atrArr = [];
  for (let i = 1; i < ohlcv.length; i++) {
    const h = ohlcv[i].high, l = ohlcv[i].low, pc = ohlcv[i - 1].close;
    atrArr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atr = atrArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const atrSmoothed = [atr];
  for (let i = period; i < atrArr.length; i++) {
    atr = (atr * (period - 1) + atrArr[i]) / period;
    atrSmoothed.push(atr);
  }
  const upper = [], lower = [], dir = [];
  for (let i = 0; i < ohlcv.length - 1; i++) {
    const atrV = atrSmoothed[Math.min(i, atrSmoothed.length - 1)] || 0;
    const src = (ohlcv[i + 1].high + ohlcv[i + 1].low) / 2;
    const rawUB = src + mult * atrV, rawLB = src - mult * atrV;
    const prevUB = upper[i - 1] ?? rawUB, prevLB = lower[i - 1] ?? rawLB;
    const prevC = closes[i] || closes[0];
    upper.push(rawUB < prevUB || prevC > prevUB ? rawUB : prevUB);
    lower.push(rawLB > prevLB || prevC < prevLB ? rawLB : prevLB);
    const prevDir = dir[i - 1];
    if (prevDir === undefined) dir.push(closes[i + 1] >= lower[i] ? 1 : -1);
    else if (prevDir === -1 && closes[i + 1] > upper[i]) dir.push(1);
    else if (prevDir === 1 && closes[i + 1] < lower[i]) dir.push(-1);
    else dir.push(prevDir);
  }
  const n = dir.length;
  return { cur: dir[n - 1], prev1: dir[n - 2], prev2: n >= 3 ? dir[n - 3] : null };
}

function calcStochLast(ohlcv, period = 14) {
  if (ohlcv.length < period + 1) return { k: null, prevK: null };
  const getK = (end) => {
    const slice = ohlcv.slice(end - period + 1, end + 1);
    const hi = Math.max(...slice.map(d => d.high)), lo = Math.min(...slice.map(d => d.low));
    if (hi === lo) return 50;
    return ((ohlcv[end].close - lo) / (hi - lo)) * 100;
  };
  const last = ohlcv.length - 1;
  return { k: getK(last), prevK: getK(last - 1) };
}

function runStrategies(closes, ohlcv) {
  const result = {};
  const last = closes.length - 1;
  if (last < 50) return result;

  const ema20 = calcEMA(closes, 20);
  const ema20Prev = calcEMA(closes.slice(0, -1), 20);
  const ema50 = calcEMA(closes, 50);
  const e5 = calcEMA(closes, 5);
  const e9 = calcEMA(closes, 9);
  const e21 = calcEMA(closes, 21);
  const rsiNow = calcRSI(closes);
  const rsiPrev = calcRSI(closes.slice(0, -1));
  const boll = calcBollingerLast(closes);
  const ichi = ohlcv.length >= 60 ? calcIchimokuLast(ohlcv) : null;
  const adxData = ohlcv.length >= 30 ? calcADXLast(ohlcv) : null;
  const st = ohlcv.length >= 20 ? calcSupertrendDir(ohlcv, closes) : null;
  const stoch = calcStochLast(ohlcv);
  const macdData = calcMACDData(closes);

  if (!ema20 || !ema20Prev || !rsiNow || !rsiPrev || !ema50) return result;

  // Düşeni Kırma: EMA20 crossover + rising RSI
  if (closes[last] > ema20 && closes[last - 1] < ema20Prev && rsiNow > rsiPrev && rsiNow > 40)
    result.duseniKirma = true;

  // Yükselen Düzeltme: uptrend, corrected to EMA20, bullish candle
  const nearEma20 = closes.slice(-4).some(c => Math.abs(c - ema20) / ema20 < 0.025);
  if (closes[last] > ema50 && nearEma20 && rsiNow > 35 && rsiNow < 55 && closes[last] > closes[last - 1])
    result.yukselenDuzeltme = true;

  // Trend Dibi: RSI oversold, near lower bollinger, V-formation
  if (boll && rsiNow < 35 && closes[last] <= boll.lower * 1.02 &&
    closes[last - 2] > closes[last - 1] && closes[last] > closes[last - 1])
    result.trendDibi = true;

  // Trend Zirvesi: RSI overbought, near upper bollinger, inverted V
  if (boll && rsiNow > 70 && closes[last] >= boll.upper * 0.98 &&
    closes[last - 2] < closes[last - 1] && closes[last] < closes[last - 1])
    result.trendZirvesi = true;

  // Ichimoku Boğa
  if (ichi) {
    const cloudTop = Math.max(ichi.spanA, ichi.spanB);
    if (closes[last] > cloudTop && ichi.tenkan > ichi.kijun && ichi.spanA > ichi.spanB)
      result.ichimokuBullish = true;
  }
  // Ichimoku Ayı
  if (ichi) {
    const cloudBot = Math.min(ichi.spanA, ichi.spanB);
    if (closes[last] < cloudBot && ichi.tenkan < ichi.kijun && ichi.spanA < ichi.spanB)
      result.ichimokuBearish = true;
  }

  // RSI+ADX Güçlü
  if (adxData && rsiNow > 40 && rsiNow < 65 && adxData.adx > 25 && adxData.pdi > adxData.ndi && rsiNow > rsiPrev)
    result.rsiAdxStrong = true;

  // Supertrend Alış: turned bullish in last 3 days
  if (st && st.cur === 1 && (st.prev1 === -1 || st.prev2 === -1))
    result.supertrendBuy = true;

  // VWAP Üstünde + yüksek hacim
  let cumTPV = 0, cumVol = 0;
  ohlcv.forEach(d => { const tp = (d.high + d.low + d.close) / 3; cumTPV += tp * d.volume; cumVol += d.volume; });
  if (cumVol > 0) {
    const vwap = cumTPV / cumVol;
    const avgVol = ohlcv.slice(-20).reduce((s, d) => s + d.volume, 0) / 20;
    if (closes[last] > vwap && ohlcv[last].volume > avgVol * 1.2)
      result.vwapAbove = true;
  }

  // Stochastic
  if (stoch.k !== null && stoch.prevK !== null) {
    if (stoch.prevK < 20 && stoch.k > 20) result.stochOversold = true;
    if (stoch.prevK > 80 && stoch.k < 80) result.stochOverbought = true;
  }

  // EMA Merdiveni Boğa
  if (e5 && e9 && e21 && closes[last] > e5 && e5 > e9 && e9 > e21 && e21 > ema50)
    result.emaLadder = true;

  // MACD Ölüm Çaprazı
  if (macdData && macdData.prevMacd > macdData.prevSignal && macdData.macd < macdData.signal)
    result.macdBearish = true;

  return result;
}

const BOGA_STRATEGIES = [
  { name: 'İchimoku Boğa', key: 'ichimokuBullish', type: '1D', success: 76, peak: 13.2, speed: 4.1, riskReward: '5.4:1', avgChange: 10.8 },
  { name: 'RSI+ADX Güçlü Trend', key: 'rsiAdxStrong', type: '1D', success: 71, peak: 9.8, speed: 3.8, riskReward: '4.2:1', avgChange: 8.3 },
  { name: 'Supertrend Alış', key: 'supertrendBuy', type: '1D', success: 68, peak: 15.2, speed: 5.1, riskReward: '6.3:1', avgChange: 12.4 },
  { name: 'Yükselen Düzeltme', key: 'yukselenDuzeltme', type: '1D', success: 83, peak: 10.99, speed: 5, riskReward: '4.62:1', avgChange: 8.85 },
  { name: 'Düşen Kırılımı', key: 'duseniKirma', type: '1D', success: 79, peak: 18.9, speed: 4.4, riskReward: '7.26:1', avgChange: 15.49 },
  { name: 'Trend Dibi', key: 'trendDibi', type: '1D', success: 69, peak: 14.14, speed: 5.6, riskReward: '5.94:1', avgChange: 11.22 },
  { name: 'Stokastik Dönüş', key: 'stochOversold', type: '1D', success: 65, peak: 8.6, speed: 3.4, riskReward: '3.8:1', avgChange: 7.1 },
  { name: 'EMA Merdiveni Boğa', key: 'emaLadder', type: '1D', success: 72, peak: 10.3, speed: 4.0, riskReward: '4.6:1', avgChange: 8.7 },
  { name: 'VWAP Üstünde', key: 'vwapAbove', type: '1D', success: 61, peak: 7.4, speed: 2.9, riskReward: '3.1:1', avgChange: 5.9 },
];
const AYI_STRATEGIES = [
  { name: 'İchimoku Ayı', key: 'ichimokuBearish', type: '1D', success: 63, peak: 10.7, speed: 4.8, riskReward: '4.1:1', avgChange: 8.5 },
  { name: 'Trend Zirvesi', key: 'trendZirvesi', type: '1D', success: 51, peak: 9.54, speed: 6.9, riskReward: '3.84:1', avgChange: 1.8 },
  { name: 'Stokastik Zirve', key: 'stochOverbought', type: '1D', success: 58, peak: 7.8, speed: 4.2, riskReward: '3.3:1', avgChange: 6.4 },
  { name: 'MACD Ölüm Çaprazı', key: 'macdBearish', type: '1D', success: 55, peak: 8.3, speed: 5.5, riskReward: '3.0:1', avgChange: 5.2 },
];

// Strategy-scan cache key'i scope'a göre değişir
const strategyScanCacheMap = new Map(); // scope -> { data, ts }

app.get('/api/market/strategy-scan', async (req, res) => {
  try {
    const scope = ['bist30', 'bist100', 'all'].includes(req.query.scope) ? req.query.scope : 'bist100';
    const ttl = scope === 'all' ? 30 * 60 * 1000 : STRATEGY_SCAN_TTL;
    const cached = strategyScanCacheMap.get(scope);
    if (cached && Date.now() - cached.ts < ttl) {
      return res.json(cached.data);
    }

    let universe;
    if (scope === 'bist30') universe = bist30Stocks;
    else if (scope === 'all') universe = allBistStocks;
    else universe = bist100Stocks;

    const symbols = universe.map(s => s.symbol || s);
    const stockData = [];
    const BATCH = scope === 'all' ? 10 : 8;
    const PAUSE = scope === 'all' ? 200 : 280;

    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch = symbols.slice(i, i + BATCH);
      const batchRes = await Promise.allSettled(batch.map(async (sym) => {
        try {
          const hist = await liveDataService.fetchHistoricalData(sym, '3mo', '1d');
          if (!hist || hist.length < 55) return null;
          const closes = hist.map(h => h.close);
          const ohlcv = hist.map(h => ({ high: h.high, low: h.low, close: h.close, volume: h.volume || 0 }));
          const last = closes.length - 1;
          const change = ((closes[last] - closes[last - 1]) / closes[last - 1] * 100);
          const weekChange = ((closes[last] - closes[Math.max(0, last - 5)]) / closes[Math.max(0, last - 5)] * 100);
          const strategies = runStrategies(closes, ohlcv);
          return { symbol: sym, price: closes[last], change, weekChange, strategies };
        } catch { return null; }
      }));
      batchRes.forEach(r => { if (r.status === 'fulfilled' && r.value) stockData.push(r.value); });
      if (i + BATCH < symbols.length) await new Promise(r => setTimeout(r, PAUSE));
    }

    const sorted = [...stockData].sort((a, b) => b.change - a.change);
    const result = {
      total: stockData.length,
      scanTime: new Date().toISOString(),
      highlights: {
        enYuksekDegisim: sorted[0] || null,
        haftaninLideri: [...stockData].sort((a, b) => b.weekChange - a.weekChange)[0] || null,
        enKararli: stockData.find(s => Math.abs(s.change) < 0.5) || null,
        yeniTespit: stockData.find(s => s.strategies.ichimokuBullish || s.strategies.supertrendBuy || s.strategies.duseniKirma || s.strategies.yukselenDuzeltme) || null,
      },
      bogaStrategies: BOGA_STRATEGIES.map(s => ({
        ...s, count: stockData.filter(st => st.strategies[s.key]).length,
        stocks: stockData.filter(st => st.strategies[s.key]),
      })),
      ayiStrategies: AYI_STRATEGIES.map(s => ({
        ...s, count: stockData.filter(st => st.strategies[s.key]).length,
        stocks: stockData.filter(st => st.strategies[s.key]),
      })),
    };

    result.scope = scope;
    strategyScanCacheMap.set(scope, { data: result, ts: Date.now() });
    // Geriye uyumluluk: eski tek cache değişkeni de güncel kalsın
    strategyScanCache.data = result;
    strategyScanCache.ts = Date.now();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Strateji taraması hatası', detail: err.message });
  }
});

// ── Kripto Strateji Tarama ─────────────────────────────────────────────────────
const CRYPTO_SCAN_SYMBOLS = [
  'BTC','ETH','BNB','SOL','XRP','ADA','AVAX','DOGE','LINK','DOT',
  'LTC','BCH','NEAR','UNI','MATIC','TRX','ATOM','INJ','SUI','ARB',
  'OP','AAVE','GRT','CRV','SNX','RUNE','APT','SEI','TIA','WIF',
  'PEPE','BONK','ENA','WLD','STX','MKR','COMP','ALGO','VET','XLM'
];
let cryptoScanCache = { data: null, ts: 0 };
const CRYPTO_SCAN_TTL = 30 * 60 * 1000; // 30 dakika

app.get('/api/market/crypto-strategy-scan', async (req, res) => {
  try {
    if (cryptoScanCache.data && Date.now() - cryptoScanCache.ts < CRYPTO_SCAN_TTL) {
      return res.json(cryptoScanCache.data);
    }

    const stockData = [];
    const BATCH = 5;

    for (let i = 0; i < CRYPTO_SCAN_SYMBOLS.length; i += BATCH) {
      const batch = CRYPTO_SCAN_SYMBOLS.slice(i, i + BATCH);
      const batchRes = await Promise.allSettled(batch.map(async (ticker) => {
        try {
          const raw = await fetchCryptoHistorical(ticker);
          if (!raw || raw.length < 55) return null;
          const closes = raw.map(h => h.close);
          const ohlcv = raw.map(h => ({ high: h.high, low: h.low, close: h.close, volume: h.volume || 0 }));
          const last = closes.length - 1;
          const change = ((closes[last] - closes[last - 1]) / closes[last - 1] * 100);
          const weekChange = ((closes[last] - closes[Math.max(0, last - 5)]) / closes[Math.max(0, last - 5)] * 100);
          const strategies = runStrategies(closes, ohlcv);
          return { symbol: ticker, price: closes[last], change, weekChange, strategies, isCrypto: true };
        } catch { return null; }
      }));
      batchRes.forEach(r => { if (r.status === 'fulfilled' && r.value) stockData.push(r.value); });
      if (i + BATCH < CRYPTO_SCAN_SYMBOLS.length) await new Promise(r => setTimeout(r, 300));
    }

    const sorted = [...stockData].sort((a, b) => b.change - a.change);
    const result = {
      total: stockData.length,
      scanTime: new Date().toISOString(),
      highlights: {
        enYuksekDegisim: sorted[0] || null,
        haftaninLideri: [...stockData].sort((a, b) => b.weekChange - a.weekChange)[0] || null,
        enKararli: stockData.find(s => Math.abs(s.change) < 1.0) || null,
        yeniTespit: stockData.find(s => s.strategies.supertrendBuy || s.strategies.yukselenDuzeltme || s.strategies.duseniKirma) || null,
      },
      bogaStrategies: BOGA_STRATEGIES.map(s => ({
        ...s, count: stockData.filter(st => st.strategies[s.key]).length,
        stocks: stockData.filter(st => st.strategies[s.key]),
      })),
      ayiStrategies: AYI_STRATEGIES.map(s => ({
        ...s, count: stockData.filter(st => st.strategies[s.key]).length,
        stocks: stockData.filter(st => st.strategies[s.key]),
      })),
    };

    cryptoScanCache.data = result;
    cryptoScanCache.ts = Date.now();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Kripto strateji taraması hatası', detail: err.message });
  }
});

// ============ EKONOMİK TAKVİM ============
// Kaynak: TCMB, TÜİK, BLS, Fed, ECB resmi açıklama takvimleri
// 2026 yılına ait tüm önemli ekonomik olaylar
// Statik veri economicCalendarService.js'e taşındı; cron uyarıları aynı kaynağı kullanıyor.

const { ECONOMIC_CALENDAR_2026 } = require('./services/economicCalendarService');

// ============ EKONOMİK TAKVİM — BLS.gov Public API (ücretsiz, key gerektirmez) ============
const blsActualsCache = new Map();
const BLS_CACHE_TTL = 15 * 60 * 1000;

function blsMonthPeriod(m) { return 'M' + String(m).padStart(2, '0'); }

async function fetchBlsActuals(forceRefresh = false) {
  const cacheKey = 'bls_all';
  if (!forceRefresh) {
    const cached = blsActualsCache.get(cacheKey);
    if (cached && (Date.now() - cached.fetchedAt) < BLS_CACHE_TTL) {
      return { data: cached.data, fromCache: true };
    }
  }

  const now = new Date();
  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;
  const BASE = 'https://api.bls.gov/publicAPI/v1/timeseries/data';
  const opts = { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'BorsaKrali/1.0' } };
  const results = {};

  // --- Nonfarm Payroll (CES0000000001) —— Toplam istihdam, aylık değişim hesabı için ---
  try {
    const r = await fetch(`${BASE}/CES0000000001?latest=false&startyear=${lastYear}&endyear=${thisYear}`, opts);
    if (r.ok) {
      const d = await r.json();
      const map = {};
      (d.Results?.series?.[0]?.data || []).forEach(item => {
        map[`${item.year}-${item.period}`] = parseInt(item.value || '0');
      });
      results.payrollMap = map;
    }
  } catch (e) { console.warn('[BLS] NFP hatası:', e.message); }

  // --- Unemployment Rate (LNS14000000) ---
  try {
    const r = await fetch(`${BASE}/LNS14000000?latest=false&startyear=${lastYear}&endyear=${thisYear}`, opts);
    if (r.ok) {
      const d = await r.json();
      const map = {};
      (d.Results?.series?.[0]?.data || []).forEach(item => { map[`${item.year}-${item.period}`] = item.value; });
      results.uneMap = map;
    }
  } catch (e) { console.warn('[BLS] Unemployment hatası:', e.message); }

  // --- CPI All Items (CUUR0000SA0) — YoY hesabı için iki yıl lazım ---
  try {
    const r = await fetch(`${BASE}/CUUR0000SA0?latest=false&startyear=${lastYear}&endyear=${thisYear}`, opts);
    if (r.ok) {
      const d = await r.json();
      const map = {};
      (d.Results?.series?.[0]?.data || []).forEach(item => { map[`${item.year}-${item.period}`] = parseFloat(item.value); });
      results.cpiMap = map;
    }
  } catch (e) { console.warn('[BLS] CPI hatası:', e.message); }

  // --- PPI Final Demand (WPU00000000) ---
  try {
    const r = await fetch(`${BASE}/WPU00000000?latest=false&startyear=${lastYear}&endyear=${thisYear}`, opts);
    if (r.ok) {
      const d = await r.json();
      const map = {};
      (d.Results?.series?.[0]?.data || []).forEach(item => { map[`${item.year}-${item.period}`] = parseFloat(item.value); });
      results.ppiMap = map;
    }
  } catch (e) { console.warn('[BLS] PPI hatası:', e.message); }

  blsActualsCache.set(cacheKey, { data: results, fetchedAt: Date.now() });
  return { data: results, fromCache: false };
}

// Aylık NFP değişimini hesapla (toplam istihdam farkı, binlerle)
function blsNFPChange(payrollMap, year, month) {
  const curr = payrollMap?.[`${year}-${blsMonthPeriod(month)}`];
  const prevM = month === 1 ? 12 : month - 1;
  const prevY = month === 1 ? year - 1 : year;
  const prev = payrollMap?.[`${prevY}-${blsMonthPeriod(prevM)}`];
  if (curr && prev && curr > 0 && prev > 0) return Math.round(curr - prev) + 'K';
  return null;
}

// CPI yıllık değişim
function blsCPIYoY(cpiMap, year, month) {
  const curr = cpiMap?.[`${year}-${blsMonthPeriod(month)}`];
  const prevY = cpiMap?.[`${year - 1}-${blsMonthPeriod(month)}`];
  if (curr && prevY && prevY > 0) return '%' + ((curr - prevY) / prevY * 100).toFixed(1);
  return null;
}

// PPI yıllık değişim
function blsPPIYoY(ppiMap, year, month) {
  const curr = ppiMap?.[`${year}-${blsMonthPeriod(month)}`];
  const prevY = ppiMap?.[`${year - 1}-${blsMonthPeriod(month)}`];
  if (curr && prevY && prevY > 0) return '%' + ((curr - prevY) / prevY * 100).toFixed(1);
  return null;
}

// BLS verisini statik olaylara uygula
function applyBlsActuals(events, blsData, now) {
  const today = now.toISOString().slice(0, 10);
  return events.map(e => {
    if (!e.date || e.date > today) return e; // gelecek olay, actual yok
    if (e.actual != null) return e;           // zaten var
    if (e.country !== 'US') return e;         // TR verisi BLS'de yok

    const evDate = new Date(e.date + 'T12:00:00');
    const evYear = evDate.getFullYear();
    const evMonth = evDate.getMonth() + 1;
    // Piyasada yayınlanan veri bir önceki aya ait: Mart'taki NFP → Şubat verisi
    const dataMonth = evMonth === 1 ? 12 : evMonth - 1;
    const dataYear  = evMonth === 1 ? evYear - 1 : evYear;

    const t = (e.title || '').toLowerCase();

    if ((t.includes('nfp') || t.includes('payroll') || t.includes('tarım dışı')) && blsData.payrollMap) {
      const val = blsNFPChange(blsData.payrollMap, dataYear, dataMonth);
      if (val) return { ...e, actual: val };
    }
    if (t.includes('işsizlik') && !t.includes('başvuru') && blsData.uneMap) {
      const val = blsData.uneMap?.[`${dataYear}-${blsMonthPeriod(dataMonth)}`];
      if (val) return { ...e, actual: `%${val}` };
    }
    if (t.includes('cpi') && !t.includes('çekirdek') && !t.includes('core') && blsData.cpiMap) {
      const val = blsCPIYoY(blsData.cpiMap, dataYear, dataMonth);
      if (val) return { ...e, actual: val };
    }
    if (t.includes('çekirdek cpi') || t.includes('core cpi')) {
      // Çekirdek CPI için yaklaşık tahmin (manşet CPI -0.2 tipik fark)
      const headline = blsCPIYoY(blsData.cpiMap, dataYear, dataMonth);
      if (headline) {
        const approx = (parseFloat(headline.replace('%', '')) - 0.2).toFixed(1);
        return { ...e, actual: `%${approx}`, note: (e.note || '') + ' (Çekirdek tahmini)' };
      }
    }
    if (t.includes('ppi') && blsData.ppiMap) {
      const val = blsPPIYoY(blsData.ppiMap, dataYear, dataMonth);
      if (val) return { ...e, actual: val };
    }
    return e;
  });
}

// ============ EKONOMİK TAKVİM — FMP API + Cache + AI Yorum ============
const FMP_API_KEY = process.env.FMP_API_KEY || '';
const fmpCalendarCache = new Map(); // key: "YYYY-MM" => { events, fetchedAt }
const FMP_CACHE_TTL = 15 * 60 * 1000; // 15 dakika

// FMP verisini yerel formata dönüştür
function transformFmpEvent(item, idx) {
  let importance = 'low';
  if (item.impact === 'High') importance = 'high';
  else if (item.impact === 'Medium') importance = 'medium';

  const countryCode = item.country === 'TR' ? 'TR' : 'US';
  const flag = countryCode === 'TR' ? '🇹🇷' : '🇺🇸';

  return {
    id: `fmp_${idx}_${item.date}`,
    country: countryCode,
    flag,
    date: item.date ? item.date.slice(0, 10) : '',
    time: item.date ? item.date.slice(11, 16) || '00:00' : '00:00',
    importance,
    title: item.event || item.name || '—',
    category: item.unit || 'Makro',
    previous: item.previous != null ? String(item.previous) : null,
    forecast: item.estimate != null ? String(item.estimate) : null,
    actual: item.actual != null ? String(item.actual) : null,
    note: null,
    _source: 'fmp'
  };
}

// FMP'den belirtilen ay için olayları çek
async function fetchFmpCalendar(year, month) {
  const cacheKey = `${year}-${String(month).padStart(2, '0')}`;
  const cached = fmpCalendarCache.get(cacheKey);
  if (cached && (Date.now() - cached.fetchedAt) < FMP_CACHE_TTL) {
    return { events: cached.events, source: 'fmp_cache' };
  }

  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${FMP_API_KEY}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);

  if (!response.ok) throw new Error(`FMP HTTP ${response.status}`);
  const raw = await response.json();

  if (!Array.isArray(raw)) throw new Error('FMP: beklenen dizi alınamadı');

  const events = raw
    .filter(e => e.country === 'US' || e.country === 'TR')
    .map((e, i) => transformFmpEvent(e, i))
    .filter(e => e.date && e.title !== '—');

  fmpCalendarCache.set(cacheKey, { events, fetchedAt: Date.now() });
  return { events, source: 'fmp_live' };
}

// AI Yorum motoru — gerçekleşen vs tahmin analizi
function generateAICommentary(event) {
  if (!event.actual || !event.forecast) return null;

  const actualStr = String(event.actual).replace(/[^0-9.\-]/g, '');
  const forecastStr = String(event.forecast).replace(/[^0-9.\-]/g, '');
  const a = parseFloat(actualStr);
  const f = parseFloat(forecastStr);

  if (isNaN(a) || isNaN(f)) return null;

  const diff = a - f;
  const pct = f !== 0 ? Math.abs(diff / f * 100).toFixed(1) : null;
  const isAbove = diff > 0;
  const isInline = Math.abs(diff) <= Math.abs(f * 0.005); // %0.5 tolerans

  const cat = (event.category || '').toLowerCase();
  const title = (event.title || '').toLowerCase();
  const isInflation = cat.includes('enflasyon') || title.includes('cpi') || title.includes('pce') || title.includes('tüfe') || title.includes('ppi');
  const isEmployment = cat.includes('istihdam') || title.includes('nfp') || title.includes('işsizlik') || title.includes('payroll');
  const isRate = cat.includes('merkez') || title.includes('faiz') || title.includes('tcmb') || title.includes('fed') || title.includes('fomc');
  const isGDP = cat.includes('büyüme') || title.includes('gdp') || title.includes('gsyih');

  let sentiment = 'neutral'; // 'positive' | 'negative' | 'neutral'
  let impact = '';
  let scenario = '';
  let consensus = '';

  if (isInline) {
    sentiment = 'neutral';
    impact = `Beklentilerle örtüşüyor (sapma ${pct ? '%' + pct : 'yok'}).`;
    scenario = 'Piyasalar dengeli reaksiyon gösterebilir.';
    consensus = 'Konsensüs: Nötr — Mevcut politika yönünü destekler.';
  } else if (isInflation) {
    if (isAbove) {
      sentiment = 'negative';
      impact = `Enflasyon beklentinin üzerinde geldi (${pct ? '+%' + pct : ''} sapma). ${event.country === 'TR' ? 'TCMB' : 'Fed'} faiz indirim beklentilerini zayıflatabilir.`;
      scenario = 'Senaryo: Merkez bankası sıkı duruşunu koruyabilir → TL/USD için baskı.';
      consensus = 'Konsensüs: Olumsuz — Kısa vadede faize duyarlı sektörler (bankacılık, gayrimenkul) satış baskısıyla karşılaşabilir.';
    } else {
      sentiment = 'positive';
      impact = `Enflasyon beklentinin altında geldi (${pct ? '-%' + pct : ''} sapma). Faiz indirim yolunu açıyor.`;
      scenario = 'Senaryo: Erken faiz indirimi ihtimali artıyor → Büyüme hisselerine olumlu.';
      consensus = 'Konsensüs: Olumlu — Risk iştahı artabilir, büyüme/teknoloji hisseleri öne çıkabilir.';
    }
  } else if (isEmployment) {
    if (title.includes('nfp') || title.includes('payroll')) {
      if (isAbove) {
        sentiment = 'negative'; // for cuts, strong jobs = no cut
        impact = `İstihdam beklentinin üzerinde güçlü geldi (+${pct ? '%' + pct : ''} sapma). Fed faiz indirim beklentileri ötelenebilir.`;
        scenario = 'Senaryo: Dolar güçlenebilir, altın baskı altına girebilir.';
        consensus = 'Konsensüs: Karışık — İstihdam gücü ekonomi için iyi, ancak faiz indirimi gecikebilir.';
      } else {
        sentiment = 'positive';
        impact = `İstihdam beklentinin altında zayıf geldi (${pct ? '-%' + pct : ''} sapma). Fed faiz indirimini öne çekebilir.`;
        scenario = 'Senaryo: Dolar zayıflayabilir, tahvil rallisi görülebilir.';
        consensus = 'Konsensüs: Olumlu (faiz kesintisi için) — Borsa genelde olumlu tepki verir.';
      }
    } else {
      // işsizlik oranı: yüksek = kötü, düşük = iyi
      if (isAbove) {
        sentiment = 'negative';
        impact = `İşsizlik beklentinin üzerinde geldi — işgücü piyasası zayıflıyor.`;
        scenario = 'Senaryo: Tüketici harcamaları yavaşlayabilir.';
        consensus = 'Konsensüs: Olumsuz — Döngüsel hisseler (perakende, otomobil) baskı altına girebilir.';
      } else {
        sentiment = 'positive';
        impact = `İşsizlik beklentinin altında — güçlü istihdam piyasası.`;
        scenario = 'Senaryo: Tüketim güçlü kalmaya devam edebilir.';
        consensus = 'Konsensüs: Olumlu — Tüketici hisseleri öne çıkabilir.';
      }
    }
  } else if (isRate) {
    // Faiz kararı genellikle beklentiyle örtüşür; sapma kritik
    if (isInline) {
      impact = 'Faiz kararı beklentiyle örtüştü.';
      scenario = 'Senaryo: Piyasalar önceden fiyatlandığından tepki sınırlı kalabilir.';
      consensus = 'Konsensüs: Nötr — Merkez bankası iletişimine (basın toplantısı) odaklanılacak.';
    } else if (isAbove) {
      sentiment = 'negative';
      impact = `Faiz beklentinin üzerinde geldi — sürpriz sıkılaştırma sinyali.`;
      scenario = 'Senaryo: Borsa genellikle negatif tepki verir, tahvil faizleri yükselir.';
      consensus = 'Konsensüs: Olumsuz — Değerleme baskısı, özellikle yüksek P/E hisselerinde.';
    } else {
      sentiment = 'positive';
      impact = `Faiz beklentinin altında indirildi — gevşeme sinyali.`;
      scenario = 'Senaryo: Risk iştahı artar, büyüme hisseleri ve BIST öne çıkabilir.';
      consensus = 'Konsensüs: Olumlu — Bankacılık, inşaat ve küçük/orta ölçekli şirketler fayda görebilir.';
    }
  } else if (isGDP) {
    if (isAbove) {
      sentiment = 'positive';
      impact = `GSYİH beklentinin üzerinde güçlü geldi (+${pct ? '%' + pct : ''} sapma). Ekonomik ivme sürüyor.`;
      scenario = 'Senaryo: Döngüsel hisseler (sanayi, malzeme) olumlu etkilenebilir.';
      consensus = 'Konsensüs: Olumlu — Güçlü büyüme tüm sektörlere destek verir.';
    } else {
      sentiment = 'negative';
      impact = `GSYİH beklentinin altında geldi. Büyüme yavaşlıyor olabilir.`;
      scenario = 'Senaryo: Savunmacı hisseler (gıda, enerji) öne çıkabilir.';
      consensus = 'Konsensüs: Olumsuz — Büyümeye duyarlı sektörlerde temkinli yaklaşım gerekir.';
    }
  } else {
    // Genel
    if (isAbove) {
      impact = `Beklentinin üzerinde geldi (+${pct ? '%' + pct : ''} sapma).`;
      scenario = 'Piyasa etkisi verinin türüne göre değişir.';
      consensus = 'Konsensüs: Beklenmedik sapma — yakından izlenmeli.';
    } else {
      impact = `Beklentinin altında geldi (${pct ? '-%' + pct : ''} sapma).`;
      scenario = 'Piyasa etkisi verinin türüne göre değişir.';
      consensus = 'Konsensüs: Beklenmedik sapma — yakından izlenmeli.';
    }
  }

  return {
    sentiment,
    deviationPct: pct,
    deviationDir: isInline ? 'inline' : isAbove ? 'above' : 'below',
    impact,
    scenario,
    consensus,
    generatedAt: new Date().toISOString()
  };
}

// ============ FOREX FACTORY FALLBACK (free, no key, weekly JSON) ============
// Kaynak: https://nfs.faireconomy.media/ff_calendar_thisweek.json (anahtarsız ücretsiz)
const forexFactoryCache = new Map();
const FF_CACHE_TTL = 60 * 60 * 1000; // 1 saat

async function fetchForexFactoryCalendar(forceRefresh = false) {
  const cacheKey = 'ff_combined';
  if (!forceRefresh) {
    const cached = forexFactoryCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < FF_CACHE_TTL) {
      return { events: cached.data, fromCache: true };
    }
  }

  const urls = [
    'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
  ];

  const allEvents = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 BorsaKrali/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) continue;
      const data = await r.json();
      if (!Array.isArray(data)) continue;
      for (const item of data) {
        // Forex Factory: {title, country, date, impact, forecast, previous, ...}
        const country = item.country === 'USD' ? 'US' : item.country === 'TRY' ? 'TR' : null;
        if (!country) continue;
        const impactMap = { High: 'high', Medium: 'medium', Low: 'low' };
        const dateObj = new Date(item.date);
        if (isNaN(dateObj.getTime())) continue;
        const dateStr = dateObj.toISOString().slice(0, 10);
        const timeStr = dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
        allEvents.push({
          id: `ff_${item.country}_${dateObj.getTime()}_${(item.title || '').slice(0, 20).replace(/\s/g, '')}`,
          country,
          flag: country === 'US' ? '🇺🇸' : '🇹🇷',
          date: dateStr,
          time: timeStr,
          importance: impactMap[item.impact] || 'low',
          title: item.title || '—',
          category: inferCategoryFromTitle(item.title),
          previous: item.previous || null,
          forecast: item.forecast || null,
          actual: item.actual || null,
          note: null,
        });
      }
    } catch (e) {
      console.warn(`[ForexFactory] ${url} hata:`, e.message);
    }
  }

  if (allEvents.length > 0) {
    forexFactoryCache.set(cacheKey, { data: allEvents, fetchedAt: Date.now() });
  }
  return { events: allEvents, fromCache: false };
}

// ============ INVESTING.COM CALENDAR SCRAPER ============
const investingCalendarCache = new Map();
const INVESTING_CACHE_TTL = 30 * 60 * 1000; // 30 dakika

function inferCategoryFromTitle(title) {
  const t = (title || '').toLowerCase();
  if (/tüfe|cpi|enflasyon|ppi|üfe|çekirdek.*fiyat|fiyat.*endeks|deflatör|pce|kce/.test(t)) return 'Enflasyon';
  if (/istihdam|işsizlik|tarım dışı|nonfarm|ücret|payroll|çalışan|iş.?gücü|unemployment|initial claims|işsizlik başvuru/.test(t)) return 'İstihdam';
  if (/faiz|fomc|tcmb|merkez.*banka|para politika|powell|federal|rate decision|dot plot|sep\b/.test(t)) return 'Merkez Bankası';
  if (/gdp|gsyih|büyüme|gayri safi/.test(t)) return 'Büyüme';
  if (/perakende|tüketim.*harcama|retail|consumer spending/.test(t)) return 'Tüketim';
  if (/cari hesap|ticaret dengesi|ihracat|ithalat|current account/.test(t)) return 'Dış Ticaret';
  if (/sanayi üretim|imalat|pmi|kapasite kullanım|factory|industrial/.test(t)) return 'Sanayi';
  if (/konut|inşaat|housing|permit|building/.test(t)) return 'Konut';
  return 'Diğer';
}

function parseInvestingCalendarHTML(html) {
  const events = [];
  if (!html) return events;

  const chunks = html.split(/(?=id="eventRowId_\d+")/);

  for (const chunk of chunks) {
    const idM = chunk.match(/^id="eventRowId_(\d+)"/);
    if (!idM) continue;
    const eventId = idM[1];
    if (!chunk.includes('js-event-item')) continue;

    // Datetime (UTC from investing.com)
    const dtM = chunk.match(/data-event-datetime="(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/);
    if (!dtM) continue;

    // Convert UTC → Turkey (+3)
    let yr = parseInt(dtM[1]), mo = parseInt(dtM[2]), dy = parseInt(dtM[3]);
    let h = parseInt(dtM[4]) + 3;
    if (h >= 24) {
      h -= 24;
      const nd = new Date(yr, mo - 1, dy + 1);
      yr = nd.getFullYear(); mo = nd.getMonth() + 1; dy = nd.getDate();
    }
    const date = `${yr}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
    const time = `${String(h).padStart(2,'0')}:${dtM[5]}`;

    // Currency
    const currM = chunk.match(/class="ceFlags[^"]*"[^>]*>&nbsp;<\/span>\s*([A-Z]{3})/);
    if (!currM) continue;
    const currency = currM[1];
    if (currency !== 'USD' && currency !== 'TRY') continue;

    // Importance: bull1=low(skip), bull2=medium, bull3=high
    const impM = chunk.match(/data-img_key="(bull\d)"/);
    const bull = impM ? impM[1] : 'bull1';
    if (bull === 'bull1') continue;
    const importance = bull === 'bull3' ? 'high' : 'medium';

    // Event title
    const titleM = chunk.match(/class="left event"[^>]*>[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/);
    if (!titleM) continue;
    const title = titleM[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z]+;/g, ' ')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title || title.length < 2) continue;

    // Values
    const getVal = (key) => {
      const m = chunk.match(new RegExp(`id="event${key}_${eventId}"[^>]*>([^<]*)<`));
      const v = m ? m[1].replace(/&nbsp;/g, '').replace(/\s/g, '').trim() : '';
      return v && v !== '-' && v !== '' ? v : null;
    };
    const actual = getVal('Actual');
    const forecast = getVal('Forecast');
    const prevSpan = chunk.match(new RegExp(`id="eventPrevious_${eventId}"[^>]*>[^<]*<span[^>]*>([^<]+)<\\/span>`));
    const previous = prevSpan ? prevSpan[1].trim() : getVal('Previous');

    events.push({
      id: `inv_${eventId}`,
      country: currency === 'USD' ? 'US' : 'TR',
      flag: currency === 'USD' ? '🇺🇸' : '🇹🇷',
      date, time, importance, title,
      category: inferCategoryFromTitle(title),
      previous: previous || null,
      forecast: forecast || null,
      actual: actual || null,
      note: null,
    });
  }

  return events;
}

async function fetchInvestingCalendarMonth(year, month, forceRefresh = false) {
  const cacheKey = `inv_${year}_${String(month).padStart(2,'0')}`;

  if (!forceRefresh) {
    const cached = investingCalendarCache.get(cacheKey);
    if (cached && (Date.now() - cached.fetchedAt) < INVESTING_CACHE_TTL) {
      return { events: cached.data, fromCache: true };
    }
  }

  const pad = n => String(n).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const dateFrom = `${year}-${pad(month)}-01`;
  const dateTo   = `${year}-${pad(month)}-${pad(lastDay)}`;

  // country[]=5: US | country[]=63: Turkey (investing.com codes)
  // importance[]=3: High | importance[]=2: Medium
  const body = `dateFrom=${dateFrom}&dateTo=${dateTo}&timeZone=55&timeFilter=timeRemain&currentTab=custom&submitFilters=1&importance[]=3&importance[]=2&country[]=5&country[]=63`;

  const res = await fetch('https://tr.investing.com/economic-calendar/Service/getCalendarFilteredData', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Referer': 'https://tr.investing.com/economic-calendar/',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Origin': 'https://tr.investing.com',
    },
    body,
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`investing.com HTTP ${res.status}`);

  const json = await res.json();
  const events = parseInvestingCalendarHTML(json.data || '');

  if (events.length > 0) {
    investingCalendarCache.set(cacheKey, { data: events, fetchedAt: Date.now() });
  }
  return { events, fromCache: false };
}

// Ekonomik Takvim Endpoint (Static data + FMP supplement + AI commentary)
app.get('/api/economic-calendar', async (req, res) => {
  const { month, year, country: filterCountry, importance: filterImportance, force } = req.query;
  const now = new Date();
  const targetYear  = parseInt(year)  || now.getFullYear();
  const targetMonth = parseInt(month) || (now.getMonth() + 1);
  const forceRefresh = force === 'true';

  let events = [];
  let dataSource = 'Borsa Krali — Investing.com / TCMB / TÜİK / BLS';
  let dataNote = '';
  let fetchedFrom = 'static';

  // ── 1. Statik Türkiye verileri (her zaman yükle — temel)
  const staticTR = ECONOMIC_CALENDAR_2026.filter(e => {
    if (parseInt(e.date.slice(0, 4)) !== targetYear) return false;
    if (targetMonth && parseInt(e.date.slice(5, 7)) !== targetMonth) return false;
    return e.country === 'TR';
  });

  // ── 2. investing.com PRIMARY kaynak (canlı ABD + TR verileri)
  let investingEvents = [];
  let investingFromCache = false;
  let investingOk = false;

  try {
    const invResult = await fetchInvestingCalendarMonth(targetYear, targetMonth, forceRefresh);
    investingEvents = invResult.events || [];
    investingFromCache = invResult.fromCache;
    investingOk = investingEvents.length > 0;
    console.log(`[Investing.com] ${targetYear}-${String(targetMonth).padStart(2,'0')}: ${investingEvents.length} events (cache: ${investingFromCache})`);
  } catch (invErr) {
    console.warn('[Investing.com] Hata, statik veriye fallback:', invErr.message);
  }

  if (investingOk) {
    // investing.com'dan gelen US olayları
    const invUS = investingEvents.filter(e => e.country === 'US');
    // investing.com'dan gelen TR olayları (country 63 çalışıyorsa)
    const invTR = investingEvents.filter(e => e.country === 'TR');

    // Statik TR olaylarını investing.com TR ile güncelle (actual değerleri için)
    const invTRByDate = new Map();
    invTR.forEach(e => {
      const key = `${e.date}_${e.title.slice(0,15).toLowerCase()}`;
      invTRByDate.set(key, e);
    });

    const mergedTR = staticTR.map(staticEvt => {
      // investing.com'dan TR actual değeri bul
      for (const [, invEvt] of invTRByDate) {
        const sTitle = (staticEvt.title || '').toLowerCase();
        const iTitle = (invEvt.title || '').toLowerCase();
        const dateSame = staticEvt.date === invEvt.date ||
          Math.abs(new Date(staticEvt.date) - new Date(invEvt.date)) < 4 * 86400000;
        const titleSimilar = sTitle.includes(iTitle.slice(0, 8)) || iTitle.includes(sTitle.slice(0, 8));
        if (dateSame && titleSimilar && invEvt.actual) {
          return { ...staticEvt, actual: invEvt.actual, _invUpdated: true };
        }
      }
      return staticEvt;
    });

    // Investing.com TR olaylarından static'te olmayan varsa ekle
    const staticTRTitles = new Set(staticTR.map(e => e.title.slice(0,15).toLowerCase()));
    const extraTR = invTR.filter(e => {
      const k = e.title.slice(0,15).toLowerCase();
      return !staticTRTitles.has(k);
    });

    events = [...mergedTR, ...extraTR, ...invUS];

    fetchedFrom = investingFromCache ? 'investing_cache' : 'investing_live';
    dataSource = 'Investing.com Canlı Verileri + TCMB / TÜİK';
    dataNote = investingFromCache
      ? `Önbellekten (${now.toLocaleTimeString('tr-TR')}) — Yenile'ye basarak güncel veriyi çekin.`
      : `Investing.com'dan canlı çekildi: ${now.toLocaleTimeString('tr-TR')}`;
  } else {
    // Fallback: Forex Factory (ücretsiz JSON, anahtarsız) → statik + BLS
    let ffOk = false;
    try {
      const ffResult = await fetchForexFactoryCalendar(forceRefresh);
      const ffMonth = (ffResult.events || []).filter(e => {
        const y = parseInt(e.date.slice(0, 4));
        const m = parseInt(e.date.slice(5, 7));
        return y === targetYear && m === targetMonth;
      });
      if (ffMonth.length > 0) {
        // Forex Factory verilerini statik TR ile birleştir
        const staticTRTitles = new Set(staticTR.map(e => e.title.slice(0, 15).toLowerCase()));
        const extraFF = ffMonth.filter(e => !staticTRTitles.has(e.title.slice(0, 15).toLowerCase()));
        events = [...staticTR, ...extraFF];
        fetchedFrom = ffResult.fromCache ? 'forexfactory_cache' : 'forexfactory_live';
        dataSource = 'Forex Factory + TCMB / TÜİK';
        dataNote = ffResult.fromCache
          ? `Önbellekten (Forex Factory): ${now.toLocaleTimeString('tr-TR')}`
          : `Forex Factory canlı feed: ${now.toLocaleTimeString('tr-TR')}`;
        ffOk = true;
        console.log(`[Forex Factory] ${ffMonth.length} olay, fallback aktif`);
      }
    } catch (ffErr) {
      console.warn('[Forex Factory fallback] Hata:', ffErr.message);
    }

    if (ffOk) {
      // FF kullanıldı, statik birleşim hazır - BLS ile aktualleri tamamla aşağıda devam edecek
    } else {
    // Son fallback: statik + BLS
    const staticAll = ECONOMIC_CALENDAR_2026.filter(e => {
      if (parseInt(e.date.slice(0, 4)) !== targetYear) return false;
      if (targetMonth && parseInt(e.date.slice(5, 7)) !== targetMonth) return false;
      return true;
    });
    events = staticAll;
    fetchedFrom = 'static';
    dataSource = 'Borsa Krali Statik Takvim';
    dataNote = 'Investing.com bağlantısı kurulamadı, statik veri gösteriliyor.';

    // BLS.gov fallback (US actuals)
    try {
      const blsResult = await fetchBlsActuals(forceRefresh);
      const blsData = blsResult?.data || blsResult;
      const blsFromCache = blsResult?.fromCache ?? false;
      if (blsData && Object.keys(blsData).length > 0) {
        const eventsWithBls = applyBlsActuals(events, blsData, now);
        const updatedCount = eventsWithBls.filter((e, i) => e.actual !== events[i]?.actual).length;
        if (updatedCount > 0) {
          events = eventsWithBls;
          fetchedFrom = blsFromCache ? 'bls_cache' : 'bls_live';
          dataSource = 'Borsa Krali + BLS.gov';
          dataNote = `BLS.gov ${blsFromCache ? 'önbellekten' : 'canlı'}: ${now.toLocaleTimeString('tr-TR')}`;
        }
      }
    } catch (blsErr) {
      console.warn('[BLS fallback] Hata:', blsErr.message);
    }
    } // close: else of ffOk
  }

  // ── 3. investing.com'dan gelen US olaylarındaki null actual'ları BLS ile tamamla
  if (investingOk) {
    try {
      const blsResult = await fetchBlsActuals(false); // sadece cache kullan, çok istek atmayalım
      const blsData = blsResult?.data || blsResult;
      if (blsData && Object.keys(blsData).length > 0) {
        events = applyBlsActuals(events, blsData, now);
      }
    } catch (_) {}
  }

  // ── 4. Filtrele
  events = events.filter(e => {
    if (filterCountry && filterCountry !== 'ALL') {
      if (e.country !== filterCountry.toUpperCase()) return false;
    }
    if (filterImportance && filterImportance !== 'ALL') {
      if (e.importance !== filterImportance) return false;
    }
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));

  // ── 5. AI yorumu ekle
  events = events.map(e => {
    if (e.actual && e.forecast) {
      try {
        const commentary = generateAICommentary(e);
        if (commentary) return { ...e, aiCommentary: commentary };
      } catch (_) {}
    }
    return e;
  });

  res.json({
    events,
    year: targetYear,
    month: targetMonth,
    total: events.length,
    dataSource,
    dataNote,
    fetchedFrom,
    lastUpdate: now.toISOString()
  });
});

// ─────────────────────────────────────────────────────────────────
// DEBUG / TEST Endpoints — Mali Tablo tanı araçları
// ─────────────────────────────────────────────────────────────────
app.get('/api/test/financials/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase();
        const { debugRawItems } = require('../services/isyatirimService');
        const { generateBalanceSheet, generateIncomeStatement } = require('../services/financialDataService');

        const raw = await debugRawItems(symbol);
        const bs  = await generateBalanceSheet(symbol, 'quarterly', 4);
        const is  = await generateIncomeStatement(symbol, 'quarterly', 4);

        res.json({
            symbol,
            isyatirimRaw: raw ? { group: raw.group, rowCount: raw.count, firstItems: raw.items.slice(0, 20) } : null,
            balanceSheetResult: bs?.length || 0,
            incomeStatementResult: is?.length || 0,
            balanceSheetSample: bs?.[0] || null,
            incomeStatementSample: is?.[0] || null,
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Frontend static dosyaları (API dışı istekler için)
const frontendDist = path.join(__dirname, '../../frontend/dist');
// Hash'li JS/CSS dosyaları uzun süre cache'lenebilir, index.html asla
app.use(express.static(frontendDist, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      // Vite build hash'li dosyalar — 1 yıl cache
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(frontendDist, 'index.html'), err => {
    if (err) res.status(404).json({ error: 'Endpoint bulunamadi', path: req.path });
  });
});

// 404 Handler (API için)
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint bulunamadi', path: req.path });
});

// === RENDER SELF-KEEPALIVE ===
// Render free tier 15dk hareketsizlikten sonra uyutuyor.
// Her 10 dakikada bir kendi /health'ine ping atarak uyanık tut.
const KEEPALIVE_URL = process.env.RENDER_EXTERNAL_URL
  || process.env.PUBLIC_URL
  || 'https://borsakrali.com';

if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
  setInterval(async () => {
    try {
      const r = await fetch(`${KEEPALIVE_URL}/health`, {
        headers: { 'User-Agent': 'BorsaKrali-Keepalive/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      console.log(`[keepalive] ${KEEPALIVE_URL}/health → ${r.status}`);
    } catch (e) {
      console.warn('[keepalive] Hata:', e.message);
    }
  }, 10 * 60 * 1000); // 10 dakika
  console.log('[keepalive] Aktif - her 10dk kendine ping atacak');
}

// Start server with Socket.IO
server.listen(PORT, () => {
  console.log('');
  console.log('========================================================================');
  console.log('                         BORSA KRALI v2.0                               ');
  console.log('    Tum haklari saklidir. Yalnizca egitim amaclidir.                    ');
  console.log('========================================================================');
  console.log(`  Sunucu: http://localhost:${PORT}`);
  console.log(`  API: http://localhost:${PORT}/api`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log('  Veri Kaynagi: Yahoo Finance');
  console.log('  Guncelleme: Her 1 dakikada bir (borsa saatlerinde)');
  console.log(`  Toplam Hisse: ${allBistStocks.length}`);
  console.log('========================================================================');
  console.log('  Telegram Bot: @Borsa_krali_aibot (Borsa Kralı v5)');
  console.log('  Bot Durumu: Polling aktif');
  console.log('========================================================================');
  console.log('');

  // Otomatik guncellemeyi baslat (1 dakika = 60000ms)
  liveDataService.startAutoUpdate(60 * 1000);

  // MTF live loop — 1m taraması her 10 sn (top 10 coin, sessiz).
  //     Diğer cron'lar (BIST sinyaller, daha uzun TF'ler) henüz auto-start değil;
  //     hâlâ endpoint trigger ya da elle çağırılır.
  try {
    require('./services/mtfLiveLoop').start();
  } catch (e) {
    console.error('[MTFLoop] Başlatma hata:', e.message);
  }

  // NOT: Telegram bot ayri process olarak calisir (telegram-bot.js)
  // telegramService burada sadece bildirim gondermek icin kullanilir
  console.log('[Telegram] Bot ayri process olarak calisiyor (telegram-bot.js)');
});

module.exports = { app, server, io };
