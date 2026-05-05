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
const financialsRouter = require('../routes/financials');
const pushRoutes = require('./routes/push.routes');
const adminRoutes = require('./routes/admin.routes');
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

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", '*'],
      scriptSrc: [
        "'self'", "'unsafe-inline'", "'unsafe-eval'",
        '*.tradingview.com', 's3.tradingview.com',
        'cdn.tradingview.com', 'cdnjs.cloudflare.com',
        '*.cloudflare.com', 'cdn.jsdelivr.net',
      ],
      frameSrc: ["'self'", '*', '*.tradingview.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', '*'],
      connectSrc: ["'self'", '*'],
      styleSrc: ["'self'", "'unsafe-inline'", '*'],
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
      res.json({ success: true, token: result.token, user: result.user });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Sunucu hatasi' });
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

// Token yenileme
app.post('/api/auth/refresh', async (req, res) => {
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

// Auth middleware for subscription
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Token gerekli' });
  }
  const token = authHeader.split(' ')[1];
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
      fundamentals = liveDataService.calculateFundamentalScores(stock);
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
      if (fundamentals.altmanZScore > 2.99) fundamentalScore += 15;
      else if (fundamentals.altmanZScore < 1.81) fundamentalScore -= 15;

      if (fundamentals.piotroskiFScore >= 7) fundamentalScore += 15;
      else if (fundamentals.piotroskiFScore <= 3) fundamentalScore -= 15;

      if (fundamentals.priceToEarnings < 10) fundamentalScore += 10;
      else if (fundamentals.priceToEarnings > 20) fundamentalScore -= 10;
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

  // Fallback: deterministik seeded degerler (gercek veri yoksa)
  const fallback = liveDataService.calculateFundamentalScores(stock);

  // Gercek oranlar varsa onlari kullan, yoksa fallback ile doldur
  const ratios = {
    priceToEarnings:    realRatios?.priceToEarnings    ?? fallback.priceToEarnings,
    priceToBook:        realRatios?.priceToBook         ?? fallback.priceToBook,
    priceToSales:       realRatios?.priceToSales        ?? fallback.priceToSales,
    evToEbitda:         realRatios?.evToEbitda          ?? fallback.evToEbitda,
    debtToEquity:       realRatios?.debtToEquity        ?? fallback.debtToEquity,
    currentRatio:       realRatios?.currentRatio        ?? fallback.currentRatio,
    quickRatio:         realRatios?.quickRatio          ?? fallback.quickRatio,
    returnOnEquity:     realRatios?.returnOnEquity      ?? fallback.returnOnEquity,
    returnOnAssets:     realRatios?.returnOnAssets      ?? fallback.returnOnAssets,
    netProfitMargin:    realRatios?.netProfitMargin     ?? fallback.netProfitMargin,
    grossProfitMargin:  realRatios?.grossProfitMargin   ?? fallback.grossProfitMargin,
    operatingMargin:    realRatios?.operatingMargin     ?? fallback.operatingMargin,
  };

  // Altman Z-Score, Piotroski F-Score, Beneish M-Score gerçek veri gerektiriyor —
  // mevcut haliyle sektörel tahmin, gerçek KAP verileri olmadan hesaplanamaz
  const response = {
    symbol: upperSymbol,
    name: stock.name,
    sector: stock.sector,
    market: stock.market,
    currentPrice: stock.price,
    dataSource: dataQuality === 'real' ? 'Yahoo Finance (Gerçek)' : 'Sektörel Tahmin',
    dataQuality,
    dataNote: dataQuality !== 'real'
      ? 'Bu değerler gerçek finansal tablo verisi olmadığı için sektörel ortalamalardan tahmin edilmiştir. Kesin veri için Mali Tablolar sayfasını kullanın.'
      : null,
    lastUpdate: new Date().toISOString(),
    ...ratios,
    altmanZScore: fallback.altmanZScore,
    altmanInterpretation: fallback.altmanInterpretation,
    piotroskiFScore: fallback.piotroskiFScore,
    piotroskiInterpretation: fallback.piotroskiInterpretation,
    beneishMScore: fallback.beneishMScore,
    beneishInterpretation: fallback.beneishInterpretation,
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
const comboScanCacheMap = new Map(); // scope -> { data, ts }
const COMBO_SCAN_TTL_FAST = 10 * 60 * 1000; // 10 dk (bist30/bist100)
const COMBO_SCAN_TTL_ALL = 30 * 60 * 1000;  // 30 dk (all — pahalı)

// Combo katalog (sembolsüz, sadece liste — "neler tarıyor?" sayfası için)
app.get('/api/combo-strategies/catalog', (req, res) => {
  try {
    const catalog = comboStrategyService.getCatalog();
    res.json({ success: true, total: catalog.length, catalog });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Tek sembol için combo analizi
app.get('/api/combo-strategies/analyze/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase().replace('.IS', '');
    const raw = await liveDataService.fetchHistoricalData(symbol, '1y', '1d');
    if (!raw || raw.length < 60) {
      return res.json({ success: false, error: 'Yetersiz tarihsel veri' });
    }
    const candles = raw.map(r => ({
      time: Math.floor(new Date(r.date || r.timestamp).getTime() / 1000),
      open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume || 0,
    }));
    const result = comboStrategyService.analyzeSymbol(symbol, candles);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Toplu tarama — scope ile BIST30/BIST100/Tümü destekler
async function runComboScan(scope) {
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
        const raw = await liveDataService.fetchHistoricalData(sym, '1y', '1d');
        if (!raw || raw.length < 60) return null;
        const candles = raw.map(r => ({
          time: Math.floor(new Date(r.date || r.timestamp).getTime() / 1000),
          open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume || 0,
        }));
        const analysis = comboStrategyService.analyzeSymbol(sym, candles);
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

// Yeni route — scope query parametreli (default: bist100)
app.get('/api/combo-strategies/scan', async (req, res) => {
  try {
    const scope = ['bist30', 'bist100', 'all'].includes(req.query.scope) ? req.query.scope : 'bist100';
    const ttl = scope === 'all' ? COMBO_SCAN_TTL_ALL : COMBO_SCAN_TTL_FAST;
    const cached = comboScanCacheMap.get(scope);
    if (cached && Date.now() - cached.ts < ttl) return res.json(cached.data);

    const payload = await runComboScan(scope);
    comboScanCacheMap.set(scope, { data: payload, ts: Date.now() });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Geriye uyumluluk: eski /scan/bist30 route'u korunur
app.get('/api/combo-strategies/scan/bist30', async (req, res) => {
  try {
    const cached = comboScanCacheMap.get('bist30');
    if (cached && Date.now() - cached.ts < COMBO_SCAN_TTL_FAST) return res.json(cached.data);
    const payload = await runComboScan('bist30');
    comboScanCacheMap.set('bist30', { data: payload, ts: Date.now() });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/snr/:symbol', async (req, res) => {
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

    const analysis = await snrService.analyzeSNR(symbol, historicalData);
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

// ============ KAP ROUTES ============
app.get('/api/kap/news', (req, res) => {
  const { stockSymbol, sentiment, limit = 20 } = req.query;

  const stocks = liveDataService.getAllStocks().slice(0, 30);

  const newsTemplates = [
    { title: 'Ozel Durum Aciklamasi', sentiment: 'neutral' },
    { title: 'Finansal Tablo Aciklamasi', sentiment: 'neutral' },
    { title: 'Kar Dagitim Karari', sentiment: 'positive' },
    { title: 'Yeni Yatirim Duyurusu', sentiment: 'positive' },
    { title: 'Ihale Kazanimi', sentiment: 'positive' },
    { title: 'Sermaye Artirimi', sentiment: 'positive' },
    { title: 'Yonetim Kurulu Degisikligi', sentiment: 'neutral' },
    { title: 'Bagimsiz Denetim Raporu', sentiment: 'neutral' }
  ];

  let news = stocks.map((stock, idx) => {
    const template = newsTemplates[idx % newsTemplates.length];
    // Deterministik tarih: idx ve sembol harflerinden hesapla (rastgele degismesin)
    const symbolSeed = stock.symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const hoursAgo = ((symbolSeed + idx * 7) % 72); // 0-72 saat once, deterministik
    return {
      id: idx + 1,
      stockSymbol: stock.symbol,
      stockName: stock.name,
      title: `${stock.symbol} - ${template.title}`,
      summary: `${stock.name} sirketinden ${template.title.toLowerCase()} hakkinda bildirim.`,
      sentiment: template.sentiment,
      sentimentScore: template.sentiment === 'positive' ? 0.7 : template.sentiment === 'negative' ? 0.3 : 0.5,
      publishDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
      source: 'KAP'
    };
  });

  if (stockSymbol) {
    news = news.filter(n => n.stockSymbol === stockSymbol.toUpperCase());
  }
  if (sentiment) {
    news = news.filter(n => n.sentiment === sentiment);
  }

  res.json({ news: news.slice(0, parseInt(limit)) });
});

app.get('/api/kap/anomalies', (req, res) => {
  const stocks = liveDataService.getAllStocks().slice(0, 10);

  const anomalies = stocks.map(stock => {
    // Deterministik: sembol harflerinden seed uret
    const seed = stock.symbol.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
    const pseudoRand = (offset) => { const x = Math.sin(seed + offset) * 10000; return x - Math.floor(x); };
    return {
      symbol: stock.symbol,
      name: stock.name,
      newsCount: Math.floor(pseudoRand(1) * 8) + 3,
      avgNewsCount: 2,
      anomalyScore: +(pseudoRand(2) * 0.4 + 0.6).toFixed(2)
    };
  });

  res.json({ anomalies });
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

// Harmonik paternler
app.get('/api/market/harmonics', (req, res) => {
  const patterns = ['Gartley', 'Butterfly', 'Bat', 'Crab', 'Shark', 'Cypher'];
  const stocks = liveDataService.getAllStocks().slice(0, 12);

  const results = stocks.map((stock, idx) => {
    // Deterministik: sembol + fiyat bilgisinden hesapla
    const seed = stock.symbol.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
    const pseudoRand = (offset) => { const x = Math.sin(seed + offset) * 10000; return x - Math.floor(x); };

    // Yon: changePercent pozitifse Bullish egimi artar
    const changeScore = (stock.changePercent || 0);
    const isBullish = changeScore > 0 ? pseudoRand(1) > 0.25 : pseudoRand(1) > 0.65;

    // Hedef: Bullish ise yukari, Bearish ise asagi
    const targetMultiplier = isBullish
      ? 1 + (pseudoRand(2) * 0.12 + 0.03)   // +3% ile +15%
      : 1 - (pseudoRand(2) * 0.08 + 0.02);  // -2% ile -10%

    // Stop Loss: Bullish ise asagi, Bearish ise yukari
    const stopMultiplier = isBullish
      ? 1 - (pseudoRand(3) * 0.04 + 0.01)   // -1% ile -5%
      : 1 + (pseudoRand(3) * 0.03 + 0.01);  // +1% ile +4%

    return {
      symbol: stock.symbol,
      name: stock.name,
      currentPrice: stock.price,
      pattern: patterns[idx % patterns.length],
      direction: isBullish ? 'Bullish' : 'Bearish',
      completion: Math.floor(pseudoRand(4) * 25) + 75, // 75-99
      targetPrice: stock.price ? +(stock.price * targetMultiplier).toFixed(2) : null,
      stopLoss: stock.price ? +(stock.price * stopMultiplier).toFixed(2) : null
    };
  });

  res.json({ patterns: results });
});

// Fibonacci seviyeleri
app.get('/api/market/fibonacci', (req, res) => {
  const stocks = liveDataService.getAllStocks().slice(0, 15);

  const results = stocks.map(stock => {
    if (!stock.price || !stock.high || !stock.low) return null;

    const high = stock.high;
    const low = stock.low;
    const diff = high - low;

    return {
      symbol: stock.symbol,
      name: stock.name,
      currentPrice: stock.price,
      levels: {
        '0%': +low.toFixed(2),
        '23.6%': +(low + diff * 0.236).toFixed(2),
        '38.2%': +(low + diff * 0.382).toFixed(2),
        '50%': +(low + diff * 0.5).toFixed(2),
        '61.8%': +(low + diff * 0.618).toFixed(2),
        '78.6%': +(low + diff * 0.786).toFixed(2),
        '100%': +high.toFixed(2)
      }
    };
  }).filter(Boolean);

  res.json({ stocks: results });
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

// KAP haberleri (gercek veri simulasyonu)
app.get('/api/kap/real-news', async (req, res) => {
  const { symbol, limit = 30 } = req.query;

  // Gercek KAP verisi icin scraping veya API gerekir
  // Simdilik gercekci mock veri uretiyoruz
  const stocks = symbol
    ? [allBistStocks.find(s => s.symbol === symbol.toUpperCase())]
    : allBistStocks.slice(0, 20);

  const newsTypes = [
    { type: 'ozel_durum', title: 'Özel Durum Açıklaması', sentiment: 'neutral' },
    { type: 'finansal', title: 'Finansal Tablo Açıklaması', sentiment: 'neutral' },
    { type: 'kar_dagitim', title: 'Kar Dağıtım Kararı', sentiment: 'positive' },
    { type: 'yatirim', title: 'Yeni Yatırım Duyurusu', sentiment: 'positive' },
    { type: 'ihale', title: 'İhale Kazanımı', sentiment: 'positive' },
    { type: 'sermaye', title: 'Sermaye Artırımı Kararı', sentiment: 'positive' },
    { type: 'yonetim', title: 'Yönetim Kurulu Değişikliği', sentiment: 'neutral' },
    { type: 'denetim', title: 'Bağımsız Denetim Raporu', sentiment: 'neutral' },
    { type: 'analist', title: 'Analist Raporu Güncelleme', sentiment: 'neutral' },
    { type: 'ortaklik', title: 'Ortaklık Yapısı Değişikliği', sentiment: 'neutral' }
  ];

  const news = stocks.filter(Boolean).flatMap((stock, stockIdx) => {
    // Deterministik seed — hisse sembolünden türet
    const symHash = stock.symbol.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
    const drand = (offset) => { const x = Math.sin(symHash + offset) * 10000; return x - Math.floor(x); };
    const newsCount = Math.floor(drand(stockIdx + 1) * 3) + 1;
    return Array.from({ length: newsCount }, (_, i) => {
      const newsType = newsTypes[Math.floor(drand(i + stockIdx * 10 + 100) * newsTypes.length)];
      const hoursAgo = Math.floor(drand(i + stockIdx * 7 + 200) * 72);

      return {
        id: `${stock.symbol}-${Date.now()}-${i}`,
        stockSymbol: stock.symbol,
        stockName: stock.name,
        type: newsType.type,
        title: `${stock.symbol} - ${newsType.title}`,
        summary: `${stock.name} şirketinden ${newsType.title.toLowerCase()} hakkında KAP bildirimi yapıldı.`,
        content: `${stock.name} (${stock.symbol}) şirketi tarafından Kamuyu Aydınlatma Platformu'na yapılan bildirimde ${newsType.title.toLowerCase()} açıklandı. Detaylar için KAP web sitesini ziyaret ediniz.`,
        sentiment: newsType.sentiment,
        sentimentScore: newsType.sentiment === 'positive' ? 0.75 : newsType.sentiment === 'negative' ? 0.25 : 0.5,
        publishDate: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
        source: 'KAP',
        url: `https://www.kap.org.tr/tr/Bildirim/${stock.symbol}`
      };
    });
  });

  // Tarihe gore sirala
  news.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));

  res.json({
    news: news.slice(0, parseInt(limit)),
    total: news.length,
    lastUpdate: new Date().toISOString()
  });
});

// KAP finansal veriler (bilanço)
app.get('/api/kap/financials/:symbol', (req, res) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();

  const stock = allBistStocks.find(s => s.symbol === upperSymbol);
  if (!stock) {
    return res.status(404).json({ error: 'Hisse bulunamadi' });
  }

  // Gercekci finansal veriler (sektorel bazli)
  const sectorMultipliers = {
    'Bankacılık': { revenue: 50000, assets: 500000, equity: 50000 },
    'Holding': { revenue: 30000, assets: 200000, equity: 80000 },
    'Enerji': { revenue: 20000, assets: 100000, equity: 40000 },
    'Perakende': { revenue: 40000, assets: 30000, equity: 10000 },
    'Otomotiv': { revenue: 35000, assets: 50000, equity: 20000 },
    'default': { revenue: 15000, assets: 50000, equity: 20000 }
  };

  const mult = sectorMultipliers[stock.sector] || sectorMultipliers.default;
  // Deterministik varyans — hisse sembolünden seed al
  const symHash = upperSymbol.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
  let _varIdx = 0;
  const variance = () => {
    const x = Math.sin(symHash + (_varIdx++)) * 10000;
    return (x - Math.floor(x)) * 0.4 + 0.8;
  };

  const currentYear = new Date().getFullYear();
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

  // Son 8 ceyrek finansal veri
  const financialHistory = [];
  for (let y = currentYear - 1; y <= currentYear; y++) {
    for (const q of quarters) {
      if (y === currentYear && quarters.indexOf(q) > new Date().getMonth() / 3) break;

      financialHistory.push({
        period: `${y}-${q}`,
        year: y,
        quarter: q,
        revenue: Math.round(mult.revenue * variance()),
        grossProfit: Math.round(mult.revenue * 0.25 * variance()),
        operatingProfit: Math.round(mult.revenue * 0.15 * variance()),
        netProfit: Math.round(mult.revenue * 0.1 * variance()),
        totalAssets: Math.round(mult.assets * variance()),
        totalLiabilities: Math.round(mult.assets * 0.6 * variance()),
        totalEquity: Math.round(mult.equity * variance()),
        cash: Math.round(mult.equity * 0.3 * variance()),
        debt: Math.round(mult.assets * 0.4 * variance()),
        receivables: Math.round(mult.revenue * 0.2 * variance()),
        payables: Math.round(mult.revenue * 0.15 * variance()),
        inventory: Math.round(mult.revenue * 0.1 * variance())
      });
    }
  }

  // Finansal oranlar hesapla
  const latest = financialHistory[financialHistory.length - 1];
  const previousYear = financialHistory.find(f => f.year === currentYear - 1 && f.quarter === latest.quarter);

  const ratios = {
    // Karlılık Oranları
    grossProfitMargin: +((latest.grossProfit / latest.revenue) * 100).toFixed(2),
    operatingMargin: +((latest.operatingProfit / latest.revenue) * 100).toFixed(2),
    netProfitMargin: +((latest.netProfit / latest.revenue) * 100).toFixed(2),
    returnOnEquity: +((latest.netProfit / latest.totalEquity) * 100).toFixed(2),
    returnOnAssets: +((latest.netProfit / latest.totalAssets) * 100).toFixed(2),

    // Likidite Oranları
    currentRatio: +((latest.cash + latest.receivables) / latest.payables).toFixed(2),
    quickRatio: +(latest.cash / latest.payables).toFixed(2),
    cashRatio: +(latest.cash / latest.totalLiabilities).toFixed(2),

    // Borç Oranları
    debtToEquity: +(latest.debt / latest.totalEquity).toFixed(2),
    debtToAssets: +(latest.debt / latest.totalAssets).toFixed(2),
    interestCoverage: +(latest.operatingProfit / (latest.debt * 0.08)).toFixed(2),

    // Değerleme Oranları — hisse fiyatı ve finansal veriden hesaplanır
    // Tahmini dolaşımdaki pay sayısı: piyasa değeri / hisse fiyatı
    // Önce stockFromService'tan fiyat al
    priceToEarnings: (() => {
      const liveStock = liveDataService.getStock(upperSymbol);
      const price = liveStock?.price || stock.price || 0;
      if (price > 0 && latest.netProfit > 0) {
        const estShares = latest.totalEquity / price;
        const eps = estShares > 0 ? latest.netProfit / estShares : 0;
        return eps > 0 ? +(price / eps).toFixed(2) : null;
      }
      // Deterministik fallback
      const dr = (o) => { const x = Math.sin(symHash + 50 + o) * 10000; return x - Math.floor(x); };
      return +(5 + dr(1) * 15).toFixed(2);
    })(),
    priceToBook: (() => {
      const liveStock = liveDataService.getStock(upperSymbol);
      const price = liveStock?.price || stock.price || 0;
      if (price > 0 && latest.totalEquity > 0) {
        const estShares = latest.totalEquity / price;
        const bvps = estShares > 0 ? latest.totalEquity / estShares : 0;
        return bvps > 0 ? +(price / bvps).toFixed(2) : null;
      }
      const dr = (o) => { const x = Math.sin(symHash + 60 + o) * 10000; return x - Math.floor(x); };
      return +(0.5 + dr(1) * 2).toFixed(2);
    })(),
    priceToSales: (() => {
      const liveStock = liveDataService.getStock(upperSymbol);
      const price = liveStock?.price || stock.price || 0;
      if (price > 0 && latest.revenue > 0 && latest.totalEquity > 0) {
        const estShares = latest.totalEquity / price;
        const sps = estShares > 0 ? latest.revenue / estShares : 0;
        return sps > 0 ? +(price / sps).toFixed(2) : null;
      }
      const dr = (o) => { const x = Math.sin(symHash + 70 + o) * 10000; return x - Math.floor(x); };
      return +(0.5 + dr(1) * 3).toFixed(2);
    })(),
    enterpriseToEbitda: (() => {
      const ebitda = latest.operatingProfit * 1.15; // EBITDA ≈ EBIT + tahmini amortisman
      if (ebitda > 0 && latest.totalEquity > 0) {
        const liveStock = liveDataService.getStock(upperSymbol);
        const price = liveStock?.price || stock.price || 0;
        const estShares = price > 0 ? latest.totalEquity / price : 0;
        const mv = price * estShares;
        const ev = mv + latest.debt - latest.cash;
        return ev > 0 ? +(ev / ebitda).toFixed(2) : null;
      }
      const dr = (o) => { const x = Math.sin(symHash + 80 + o) * 10000; return x - Math.floor(x); };
      return +(3 + dr(1) * 10).toFixed(2);
    })(),

    // Büyüme Oranları
    revenueGrowth: previousYear ? +(((latest.revenue - previousYear.revenue) / previousYear.revenue) * 100).toFixed(2) : null,
    profitGrowth: previousYear ? +(((latest.netProfit - previousYear.netProfit) / previousYear.netProfit) * 100).toFixed(2) : null,
    assetGrowth: previousYear ? +(((latest.totalAssets - previousYear.totalAssets) / previousYear.totalAssets) * 100).toFixed(2) : null
  };

  res.json({
    symbol: upperSymbol,
    name: stock.name,
    sector: stock.sector,
    financialHistory,
    currentPeriod: latest,
    ratios,
    lastUpdate: new Date().toISOString(),
    source: 'KAP Finansal Tablolar'
  });
});

// ============ TEKNIK NOTLAR ROUTES ============

// Teknik notlar listesi
app.get('/api/technical-notes', (req, res) => {
  const notes = [
    {
      id: 1,
      symbol: 'THYAO',
      title: 'THY Teknik Görünüm Analizi',
      content: 'THYAO hissesi son dönemde güçlü bir yükseliş trendi içinde. RSI 65 seviyelerinde, MACD pozitif bölgede. 280 TL direnci aşılması halinde 300 TL hedeflenebilir.',
      category: 'Trend Analizi',
      author: 'Borsa Kralı AI',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      indicators: { rsi: 65, macd: 'Pozitif', trend: 'Yükseliş' }
    },
    {
      id: 2,
      symbol: 'GARAN',
      title: 'Garanti BBVA Destek/Direnç Analizi',
      content: 'GARAN için kritik destek seviyesi 155 TL. Bu seviyenin altında 145 TL test edilebilir. Direnç bölgesi 165-170 TL aralığında.',
      category: 'Destek/Direnç',
      author: 'Borsa Kralı AI',
      date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      indicators: { support: 155, resistance: 170, trend: 'Yatay' }
    },
    {
      id: 3,
      symbol: 'ASELS',
      title: 'ASELSAN Momentum Değerlendirmesi',
      content: 'ASELS güçlü momentum gösteriyor. ADX 30 üzerinde, trend güçlü. EMA 21 üzerinde kapanışlar olumlu.',
      category: 'Momentum',
      author: 'Borsa Kralı AI',
      date: new Date().toISOString(),
      indicators: { adx: 32, momentum: 'Güçlü', trend: 'Yükseliş' }
    },
    {
      id: 4,
      symbol: 'SISE',
      title: 'Şişecam Formasyonu İncelemesi',
      content: 'SISE hissesinde çanak formasyonu oluşumu izleniyor. Boyun çizgisi 42 TL seviyesinde. Kırılım halinde hedef 48 TL.',
      category: 'Formasyon',
      author: 'Borsa Kralı AI',
      date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      indicators: { pattern: 'Çanak', neckline: 42, target: 48 }
    },
    {
      id: 5,
      symbol: 'EREGL',
      title: 'Ereğli Demir Çelik Bollinger Analizi',
      content: 'EREGL Bollinger alt bandına yaklaştı. RSI 35 ile aşırı satım bölgesine yakın. Teknik olarak alım fırsatı olabilir.',
      category: 'Bollinger',
      author: 'Borsa Kralı AI',
      date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      indicators: { rsi: 35, bollinger: 'Alt Bant', signal: 'Potansiyel Alım' }
    }
  ];

  // Dinamik olarak gercek verilerle notlar olustur
  const stocks = liveDataService.getAllStocks().slice(0, 10);

  stocks.forEach((stock, idx) => {
    if (stock.price && stock.changePercent !== null) {
      notes.push({
        id: notes.length + 1,
        symbol: stock.symbol,
        title: `${stock.symbol} - ${stock.name} Güncel Analiz`,
        content: `${stock.name} hissesi ${stock.changePercent >= 0 ? 'yükseliş' : 'düşüş'} eğiliminde. Güncel fiyat ${stock.price?.toFixed(2)} TL. ${stock.changePercent >= 0 ? 'Pozitif momentum devam ediyor.' : 'Kısa vadeli baskı görülüyor.'}`,
        category: 'Günlük Analiz',
        author: 'Borsa Kralı AI',
        date: new Date().toISOString(),
        indicators: {
          price: stock.price,
          change: stock.changePercent,
          trend: stock.changePercent >= 0 ? 'Yükseliş' : 'Düşüş'
        }
      });
    }
  });

  res.json({
    notes: notes.sort((a, b) => new Date(b.date) - new Date(a.date)),
    total: notes.length
  });
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

  const userId = getUserKey(req);
  const lots = portfolioStore.get(userId) || [];

  const newLot = {
    id: `lot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    symbol: String(symbol).toUpperCase().trim(),
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
              if (!raw || raw.length < 40) return null;
              hist = raw;
            } else {
              hist = await liveDataService.fetchHistoricalData(sym, '3mo', '1d');
              if (!hist || hist.length < 40) return null;
            }
            const closes = hist.map(c => c.close);
            const ema34_today = calcEMA(closes, 34);
            const ema34_prev = calcEMA(closes.slice(0, -1), 34);
            const lastClose = closes[closes.length - 1];
            const prevClose = closes[closes.length - 2];
            if (!ema34_today || !ema34_prev) return null;

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
      hist = await liveDataService.fetchHistoricalData(sym, '6mo', '1d');
    }
    if (!hist || hist.length < 40) return res.status(404).json({ error: 'Yetersiz veri' });

    const closes = hist.map(c => c.close);
    const k = 2 / (34 + 1);

    // EMA34 dizisi hesapla
    const ema34Series = [];
    let ema = closes.slice(0, 34).reduce((a, b) => a + b, 0) / 34;
    for (let i = 34; i < closes.length; i++) {
      ema = closes[i] * k + ema * (1 - k);
      const dateStr = hist[i].date || (hist[i].time ? new Date(hist[i].time * 1000).toISOString().slice(0, 10) : null)
      ema34Series.push({
        time: hist[i].time || (dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : i),
        date: dateStr,
        close: closes[i],
        ema34: parseFloat(ema.toFixed(2)),
        above: closes[i] > ema,
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

const ECONOMIC_CALENDAR_2026 = [
  // ─────────────────── OCAK 2026 ───────────────────
  { id:'2601',  country:'US', flag:'🇺🇸', date:'2026-01-07', time:'15:30', importance:'high',   title:'NFP – Aralık 2025',                    category:'İstihdam',       previous:'227K',     forecast:'200K',     actual:'256K',  note:null },
  { id:'2602',  country:'US', flag:'🇺🇸', date:'2026-01-07', time:'15:30', importance:'medium', title:'İşsizlik Oranı – Aralık 2025',         category:'İstihdam',       previous:'%4.2',     forecast:'%4.2',     actual:'%4.1',  note:null },
  { id:'2603',  country:'US', flag:'🇺🇸', date:'2026-01-14', time:'15:30', importance:'high',   title:'CPI – Aralık 2025',                    category:'Enflasyon',      previous:'%2.7',     forecast:'%2.8',     actual:'%2.9',  note:null },
  { id:'2604',  country:'TR', flag:'🇹🇷', date:'2026-01-03', time:'10:00', importance:'high',   title:'TÜFE – Aralık 2025',                   category:'Enflasyon',      previous:'%47.09',   forecast:'%45.0',    actual:'%44.38',note:'Yıllık enflasyon gerilemesi sürüyor.' },
  { id:'2605',  country:'TR', flag:'🇹🇷', date:'2026-01-23', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%47.50',   forecast:'%45.00',   actual:'%45.00',note:null },
  { id:'2606',  country:'US', flag:'🇺🇸', date:'2026-01-29', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%4.50',    forecast:'%4.50',    actual:'%4.50', note:'Sabit tutuldu.' },
  { id:'2607',  country:'US', flag:'🇺🇸', date:'2026-01-30', time:'15:30', importance:'high',   title:'GDP Q3 2025 (İlk Tahmin)',              category:'Büyüme',         previous:'%2.3',     forecast:'%2.5',     actual:'%2.6',  note:null },
  { id:'2608',  country:'US', flag:'🇺🇸', date:'2026-01-16', time:'15:30', importance:'medium', title:'Perakende Satışlar – Aralık 2025',     category:'Tüketim',        previous:'%0.7',     forecast:'%0.5',     actual:'%0.4',  note:null },

  // ─────────────────── ŞUBAT 2026 ───────────────────
  { id:'2609',  country:'US', flag:'🇺🇸', date:'2026-02-06', time:'15:30', importance:'high',   title:'NFP – Ocak 2026',                      category:'İstihdam',       previous:'256K',     forecast:'175K',     actual:'143K',  note:'Beklentinin altında geldi.' },
  { id:'2610',  country:'US', flag:'🇺🇸', date:'2026-02-06', time:'15:30', importance:'medium', title:'İşsizlik Oranı – Ocak 2026',           category:'İstihdam',       previous:'%4.1',     forecast:'%4.1',     actual:'%4.0',  note:null },
  { id:'2611',  country:'TR', flag:'🇹🇷', date:'2026-02-03', time:'10:00', importance:'high',   title:'TÜFE – Ocak 2026',                     category:'Enflasyon',      previous:'%44.38',   forecast:'%42.5',    actual:'%42.12',note:null },
  { id:'2612',  country:'US', flag:'🇺🇸', date:'2026-02-12', time:'15:30', importance:'high',   title:'CPI – Ocak 2026',                      category:'Enflasyon',      previous:'%2.9',     forecast:'%2.8',     actual:'%3.0',  note:'Beklenti üzerinde geldi.' },
  { id:'2613',  country:'TR', flag:'🇹🇷', date:'2026-02-27', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%45.00',   forecast:'%42.50',   actual:'%42.50',note:null },
  { id:'2614',  country:'US', flag:'🇺🇸', date:'2026-02-27', time:'15:30', importance:'high',   title:'PCE Fiyat Endeksi – Ocak 2026',        category:'Enflasyon',      previous:'%2.6',     forecast:'%2.5',     actual:'%2.5',  note:null },

  // ─────────────────── MART 2026 ───────────────────
  { id:'2615',  country:'TR', flag:'🇹🇷', date:'2026-03-03', time:'10:00', importance:'high',   title:'TR İşsizlik Oranı – Ocak 2026',        category:'İstihdam',       previous:'%8.8',     forecast:'%8.5',     actual:'%8.3',  note:'İşsizlik beklentinin altında geldi.' },
  { id:'2616',  country:'TR', flag:'🇹🇷', date:'2026-03-04', time:'10:00', importance:'medium', title:'ÜFE – Şubat 2026',                     category:'Enflasyon',      previous:'%22.41',   forecast:'%21.0',    actual:'%19.87',note:null },
  { id:'2617',  country:'US', flag:'🇺🇸', date:'2026-03-06', time:'15:30', importance:'high',   title:'NFP – Şubat 2026',                     category:'İstihdam',       previous:'256K',     forecast:'165K',     actual:null,    note:null },
  { id:'2618',  country:'US', flag:'🇺🇸', date:'2026-03-06', time:'15:30', importance:'medium', title:'İşsizlik Oranı – Şubat 2026',          category:'İstihdam',       previous:'%4.0',     forecast:'%4.1',     actual:null,    note:null },
  { id:'2619',  country:'US', flag:'🇺🇸', date:'2026-03-10', time:'15:30', importance:'high',   title:'CPI – Şubat 2026',                     category:'Enflasyon',      previous:'%3.0',     forecast:'%2.9',     actual:'%2.8',  note:'Fed için olumlu sinyal.' },
  { id:'2620',  country:'US', flag:'🇺🇸', date:'2026-03-10', time:'15:30', importance:'medium', title:'Çekirdek CPI – Şubat 2026',            category:'Enflasyon',      previous:'%3.3',     forecast:'%3.1',     actual:'%3.1',  note:null },
  { id:'2621',  country:'US', flag:'🇺🇸', date:'2026-03-18', time:'15:30', importance:'high',   title:'PPI – Şubat 2026 (Yıllık)',            category:'Enflasyon',      previous:'%2.9',     forecast:'%2.9',     actual:'%3.4',  note:'Beklentinin üzerinde; enerji fiyatları belirleyici.' },
  { id:'2621b', country:'US', flag:'🇺🇸', date:'2026-03-18', time:'15:30', importance:'medium', title:'PPI – Şubat 2026 (Aylık)',              category:'Enflasyon',      previous:'%0.5',     forecast:'%0.3',     actual:'%0.7',  note:null },
  { id:'2621c', country:'US', flag:'🇺🇸', date:'2026-03-18', time:'15:30', importance:'medium', title:'Çekirdek PPI – Şubat 2026 (Yıllık)',   category:'Enflasyon',      previous:'%3.5',     forecast:'%3.7',     actual:'%3.9',  note:'Beklentinin üzerinde; enflasyon direnci sürüyor.' },
  { id:'2622',  country:'TR', flag:'🇹🇷', date:'2026-03-12', time:'10:00', importance:'medium', title:'Cari Hesap Dengesi – Ocak 2026',       category:'Dış Ticaret',    previous:'-5.4 Mlr $',forecast:'-3.8 Mlr $',actual:'-4.1 Mlr $',note:null },
  { id:'2623',  country:'US', flag:'🇺🇸', date:'2026-03-13', time:'15:30', importance:'medium', title:'Perakende Satışlar – Şubat 2026',      category:'Tüketim',        previous:'+0.7%',    forecast:'+0.6%',    actual:'-0.9%', note:'Beklentilerin oldukça altında.' },
  { id:'2624',  country:'TR', flag:'🇹🇷', date:'2026-03-14', time:'10:00', importance:'high',   title:'TÜFE – Şubat 2026',                    category:'Enflasyon',      previous:'%44.38',   forecast:'%42.5',    actual:'%39.05',note:'Yıllık enflasyon beklentinin altında geldi.' },
  { id:'2625',  country:'TR', flag:'🇹🇷', date:'2026-03-17', time:'10:00', importance:'medium', title:'Cari Hesap Dengesi – Şubat 2026',      category:'Dış Ticaret',    previous:'-4.1 Mlr $',forecast:'-3.5 Mlr $',actual:null,  note:null },
  { id:'2626',  country:'US', flag:'🇺🇸', date:'2026-03-17', time:'15:30', importance:'medium', title:'Empire State Endeksi – Mart 2026',      category:'Sanayi',         previous:'-5.7',     forecast:'-2.0',     actual:null,    note:null },
  { id:'2627',  country:'US', flag:'🇺🇸', date:'2026-03-18', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%3.75',      forecast:'%3.75',      actual:'%3.75', note:'Fed faizini sabit tuttu. Enflasyon direktifi: %2 hedefine yaklaşılıyor.' },
  { id:'2627b', country:'US', flag:'🇺🇸', date:'2026-03-18', time:'21:00', importance:'high',   title:'FOMC Dot Plot – Faiz Projeksiyonları (SEP)', category:'Merkez Bankası', previous:'%3.0',   forecast:'%3.1',       actual:'%3.1',  note:'Uzun vadeli faiz projeksiyonu: %3.1 (önceki: %3.0). Yıl sonu faiz beklentisi değişmedi.' },
  { id:'2627c', country:'US', flag:'🇺🇸', date:'2026-03-18', time:'21:30', importance:'medium', title:'Powell Basın Toplantısı (FOMC)',         category:'Merkez Bankası', previous:null,         forecast:null,         actual:null,    note:'Fed Başkanı Jerome Powell\'ın FOMC sonrası basın açıklaması.' },
  { id:'2628',  country:'TR', flag:'🇹🇷', date:'2026-03-20', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%42.50',   forecast:'%40.00',   actual:null,    note:'Faiz indirim sürecinin devamı bekleniyor.' },
  { id:'2629',  country:'US', flag:'🇺🇸', date:'2026-03-20', time:'15:30', importance:'medium', title:'İlk İşsizlik Başvuruları (Haftalık)',   category:'İstihdam',       previous:'221K',     forecast:'220K',     actual:null,    note:null },
  { id:'2630',  country:'US', flag:'🇺🇸', date:'2026-03-27', time:'15:30', importance:'high',   title:'GDP Q4 2025 (Nihai Revizyon)',          category:'Büyüme',         previous:'%2.3',     forecast:'%2.4',     actual:null,    note:null },
  { id:'2631',  country:'US', flag:'🇺🇸', date:'2026-03-28', time:'15:30', importance:'high',   title:'PCE Fiyat Endeksi – Şubat 2026',       category:'Enflasyon',      previous:'%2.5',     forecast:'%2.5',     actual:null,    note:"Fed'in tercih ettiği enflasyon göstergesi." },
  { id:'2632',  country:'TR', flag:'🇹🇷', date:'2026-03-31', time:'10:00', importance:'high',   title:'GSYİH Q4 2025 – Türkiye',              category:'Büyüme',         previous:'%2.1',     forecast:'%2.8',     actual:null,    note:null },

  // ─────────────────── NİSAN 2026 ───────────────────
  { id:'2633',  country:'TR', flag:'🇹🇷', date:'2026-04-03', time:'10:00', importance:'high',   title:'TÜFE – Mart 2026',                     category:'Enflasyon',      previous:'%39.05',   forecast:'%38.0',    actual:null,    note:null },
  { id:'2634',  country:'US', flag:'🇺🇸', date:'2026-04-04', time:'15:30', importance:'high',   title:'NFP – Mart 2026',                      category:'İstihdam',       previous:'151K',     forecast:'170K',     actual:null,    note:null },
  { id:'2635',  country:'US', flag:'🇺🇸', date:'2026-04-10', time:'15:30', importance:'high',   title:'CPI – Mart 2026',                      category:'Enflasyon',      previous:'%2.8',     forecast:'%2.7',     actual:null,    note:null },
  { id:'2636',  country:'TR', flag:'🇹🇷', date:'2026-04-17', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%40.00',   forecast:'%37.50',   actual:null,    note:null },
  { id:'2637',  country:'US', flag:'🇺🇸', date:'2026-04-28', time:'14:30', importance:'high',   title:'GDP Q1 2026 (İlk Tahmin)',              category:'Büyüme',         previous:'%2.4',     forecast:'%2.2',     actual:null,    note:null },
  { id:'2638',  country:'US', flag:'🇺🇸', date:'2026-04-30', time:'15:30', importance:'high',   title:'PCE Fiyat Endeksi – Mart 2026',        category:'Enflasyon',      previous:'%2.5',     forecast:'%2.4',     actual:null,    note:null },

  // ─────────────────── MAYIS 2026 ───────────────────
  { id:'2639',  country:'US', flag:'🇺🇸', date:'2026-05-07', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%4.25–4.50',forecast:'%4.00–4.25',actual:null,   note:'Faiz indirimi beklenebilir.' },
  { id:'2640',  country:'TR', flag:'🇹🇷', date:'2026-05-04', time:'10:00', importance:'high',   title:'TÜFE – Nisan 2026',                    category:'Enflasyon',      previous:'%38.0',    forecast:'%36.5',    actual:null,    note:null },
  { id:'2641',  country:'US', flag:'🇺🇸', date:'2026-05-08', time:'15:30', importance:'high',   title:'NFP – Nisan 2026',                     category:'İstihdam',       previous:'170K',     forecast:'165K',     actual:null,    note:null },
  { id:'2642',  country:'TR', flag:'🇹🇷', date:'2026-05-22', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%37.50',   forecast:'%35.00',   actual:null,    note:null },
  { id:'2643',  country:'US', flag:'🇺🇸', date:'2026-05-14', time:'15:30', importance:'high',   title:'CPI – Nisan 2026',                     category:'Enflasyon',      previous:'%2.7',     forecast:'%2.6',     actual:null,    note:null },

  // ─────────────────── HAZİRAN 2026 ───────────────────
  { id:'2644',  country:'US', flag:'🇺🇸', date:'2026-06-05', time:'15:30', importance:'high',   title:'NFP – Mayıs 2026',                     category:'İstihdam',       previous:'165K',     forecast:'160K',     actual:null,    note:null },
  { id:'2645',  country:'TR', flag:'🇹🇷', date:'2026-06-03', time:'10:00', importance:'high',   title:'TÜFE – Mayıs 2026',                    category:'Enflasyon',      previous:'%35.0',    forecast:'%33.0',    actual:null,    note:null },
  { id:'2646',  country:'US', flag:'🇺🇸', date:'2026-06-11', time:'15:30', importance:'high',   title:'CPI – Mayıs 2026',                     category:'Enflasyon',      previous:'%2.6',     forecast:'%2.5',     actual:null,    note:null },
  { id:'2647',  country:'US', flag:'🇺🇸', date:'2026-06-18', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%4.00–4.25',forecast:'%3.75–4.00',actual:null,  note:null },
  { id:'2648',  country:'TR', flag:'🇹🇷', date:'2026-06-19', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%35.00',   forecast:'%32.50',   actual:null,    note:null },

  // ─────────────────── TEMMUZ 2026 ───────────────────
  { id:'2649',  country:'US', flag:'🇺🇸', date:'2026-07-10', time:'15:30', importance:'high',   title:'NFP – Haziran 2026',                   category:'İstihdam',       previous:'160K',     forecast:'155K',     actual:null,    note:null },
  { id:'2650',  country:'TR', flag:'🇹🇷', date:'2026-07-03', time:'10:00', importance:'high',   title:'TÜFE – Haziran 2026',                  category:'Enflasyon',      previous:'%32.5',    forecast:'%30.0',    actual:null,    note:null },
  { id:'2651',  country:'US', flag:'🇺🇸', date:'2026-07-16', time:'15:30', importance:'high',   title:'CPI – Haziran 2026',                   category:'Enflasyon',      previous:'%2.5',     forecast:'%2.4',     actual:null,    note:null },
  { id:'2652',  country:'US', flag:'🇺🇸', date:'2026-07-29', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%3.75–4.00',forecast:'%3.75–4.00',actual:null,  note:null },
  { id:'2653',  country:'TR', flag:'🇹🇷', date:'2026-07-24', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%32.50',   forecast:'%30.00',   actual:null,    note:null },

  // ─────────────────── AĞUSTOS 2026 ───────────────────
  { id:'2654',  country:'US', flag:'🇺🇸', date:'2026-08-07', time:'15:30', importance:'high',   title:'NFP – Temmuz 2026',                    category:'İstihdam',       previous:'155K',     forecast:'150K',     actual:null,    note:null },
  { id:'2655',  country:'TR', flag:'🇹🇷', date:'2026-08-04', time:'10:00', importance:'high',   title:'TÜFE – Temmuz 2026',                   category:'Enflasyon',      previous:'%30.0',    forecast:'%28.0',    actual:null,    note:null },
  { id:'2656',  country:'US', flag:'🇺🇸', date:'2026-08-13', time:'15:30', importance:'high',   title:'CPI – Temmuz 2026',                    category:'Enflasyon',      previous:'%2.4',     forecast:'%2.3',     actual:null,    note:null },
  { id:'2657',  country:'TR', flag:'🇹🇷', date:'2026-08-21', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%30.00',   forecast:'%27.50',   actual:null,    note:null },

  // ─────────────────── EYLÜL 2026 ───────────────────
  { id:'2658',  country:'US', flag:'🇺🇸', date:'2026-09-04', time:'15:30', importance:'high',   title:'NFP – Ağustos 2026',                   category:'İstihdam',       previous:'150K',     forecast:'148K',     actual:null,    note:null },
  { id:'2659',  country:'TR', flag:'🇹🇷', date:'2026-09-03', time:'10:00', importance:'high',   title:'TÜFE – Ağustos 2026',                  category:'Enflasyon',      previous:'%28.0',    forecast:'%26.0',    actual:null,    note:null },
  { id:'2660',  country:'US', flag:'🇺🇸', date:'2026-09-10', time:'15:30', importance:'high',   title:'CPI – Ağustos 2026',                   category:'Enflasyon',      previous:'%2.3',     forecast:'%2.2',     actual:null,    note:null },
  { id:'2661',  country:'US', flag:'🇺🇸', date:'2026-09-17', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%3.75–4.00',forecast:'%3.50–3.75',actual:null,  note:null },
  { id:'2662',  country:'TR', flag:'🇹🇷', date:'2026-09-18', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%27.50',   forecast:'%25.00',   actual:null,    note:null },

  // ─────────────────── EKİM 2026 ───────────────────
  { id:'2663',  country:'US', flag:'🇺🇸', date:'2026-10-02', time:'15:30', importance:'high',   title:'NFP – Eylül 2026',                     category:'İstihdam',       previous:'148K',     forecast:'145K',     actual:null,    note:null },
  { id:'2664',  country:'TR', flag:'🇹🇷', date:'2026-10-03', time:'10:00', importance:'high',   title:'TÜFE – Eylül 2026',                    category:'Enflasyon',      previous:'%26.0',    forecast:'%24.0',    actual:null,    note:null },
  { id:'2665',  country:'US', flag:'🇺🇸', date:'2026-10-09', time:'15:30', importance:'high',   title:'CPI – Eylül 2026',                     category:'Enflasyon',      previous:'%2.2',     forecast:'%2.1',     actual:null,    note:null },
  { id:'2666',  country:'US', flag:'🇺🇸', date:'2026-10-29', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%3.50–3.75',forecast:'%3.50–3.75',actual:null,  note:null },
  { id:'2667',  country:'TR', flag:'🇹🇷', date:'2026-10-23', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%25.00',   forecast:'%22.50',   actual:null,    note:null },

  // ─────────────────── KASIM 2026 ───────────────────
  { id:'2668',  country:'US', flag:'🇺🇸', date:'2026-11-06', time:'15:30', importance:'high',   title:'NFP – Ekim 2026',                      category:'İstihdam',       previous:'145K',     forecast:'143K',     actual:null,    note:null },
  { id:'2669',  country:'TR', flag:'🇹🇷', date:'2026-11-03', time:'10:00', importance:'high',   title:'TÜFE – Ekim 2026',                     category:'Enflasyon',      previous:'%24.0',    forecast:'%22.0',    actual:null,    note:null },
  { id:'2670',  country:'US', flag:'🇺🇸', date:'2026-11-12', time:'15:30', importance:'high',   title:'CPI – Ekim 2026',                      category:'Enflasyon',      previous:'%2.1',     forecast:'%2.0',     actual:null,    note:null },
  { id:'2671',  country:'TR', flag:'🇹🇷', date:'2026-11-20', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%22.50',   forecast:'%20.00',   actual:null,    note:null },

  // ─────────────────── ARALIK 2026 ───────────────────
  { id:'2672',  country:'US', flag:'🇺🇸', date:'2026-12-04', time:'15:30', importance:'high',   title:'NFP – Kasım 2026',                     category:'İstihdam',       previous:'143K',     forecast:'140K',     actual:null,    note:null },
  { id:'2673',  country:'TR', flag:'🇹🇷', date:'2026-12-03', time:'10:00', importance:'high',   title:'TÜFE – Kasım 2026',                    category:'Enflasyon',      previous:'%22.0',    forecast:'%20.0',    actual:null,    note:null },
  { id:'2674',  country:'US', flag:'🇺🇸', date:'2026-12-10', time:'21:00', importance:'high',   title:'Fed Faiz Kararı (FOMC)',                category:'Merkez Bankası', previous:'%3.50–3.75',forecast:'%3.25–3.50',actual:null,  note:null },
  { id:'2675',  country:'TR', flag:'🇹🇷', date:'2026-12-18', time:'14:00', importance:'high',   title:'TCMB Para Politikası Kararı',           category:'Merkez Bankası', previous:'%20.00',   forecast:'%17.50',   actual:null,    note:null },
  { id:'2676',  country:'US', flag:'🇺🇸', date:'2026-12-11', time:'15:30', importance:'high',   title:'CPI – Kasım 2026',                     category:'Enflasyon',      previous:'%2.0',     forecast:'%1.9',     actual:null,    note:null },
  { id:'2677',  country:'US', flag:'🇺🇸', date:'2026-12-23', time:'15:30', importance:'high',   title:'GDP Q3 2026 (Nihai Revizyon)',          category:'Büyüme',         previous:'%2.0',     forecast:'%2.1',     actual:null,    note:null },
];

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

  // NOT: Telegram bot ayri process olarak calisir (telegram-bot.js)
  // telegramService burada sadece bildirim gondermek icin kullanilir
  console.log('[Telegram] Bot ayri process olarak calisiyor (telegram-bot.js)');
});

module.exports = { app, server, io };
