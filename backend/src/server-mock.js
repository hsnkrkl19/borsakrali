/**
 * Mock Server - Veritabanı olmadan çalışan sunucu
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const mockData = require('./data/mockData');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mode: 'mock',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============ AUTH ROUTES ============
app.post('/api/auth/login', (req, res) => {
  const { email } = req.body;
  res.json({
    success: true,
    user: { ...mockData.mockUser, email: email || mockData.mockUser.email },
    token: 'mock-jwt-token-' + Date.now(),
    refreshToken: 'mock-refresh-token-' + Date.now()
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email } = req.body;
  res.json({
    success: true,
    message: 'Kayıt başarılı',
    user: { ...mockData.mockUser, name, email }
  });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: mockData.mockUser });
});

app.post('/api/auth/refresh', (req, res) => {
  res.json({
    token: 'mock-jwt-token-' + Date.now(),
    refreshToken: 'mock-refresh-token-' + Date.now()
  });
});

// ============ MARKET ROUTES ============

// BIST 100
app.get('/api/market/bist100', (req, res) => {
  res.json(mockData.generateBist100());
});

// BIST 30
app.get('/api/market/bist30', (req, res) => {
  const stocks = mockData.stocks.slice(0, 30).map(s => mockData.generateStockData(s));
  res.json({ stocks, count: stocks.length, lastUpdate: new Date().toISOString() });
});

// Canli veri (heatmap)
app.get('/api/market/live', (req, res) => {
  const stocks = mockData.stocks.slice(0, 30).map(s => mockData.generateStockData(s));
  res.json({ stocks, lastUpdate: new Date().toISOString() });
});

// En çok yükselenler
app.get('/api/market/gainers', (req, res) => {
  const { limit = 10 } = req.query;
  const stocks = mockData.stocks
    .map(s => mockData.generateStockData(s))
    .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0))
    .slice(0, parseInt(limit));
  res.json({ stocks, count: stocks.length });
});

// En çok düşenler
app.get('/api/market/losers', (req, res) => {
  const { limit = 10 } = req.query;
  const stocks = mockData.stocks
    .map(s => mockData.generateStockData(s))
    .sort((a, b) => (a.changePercent || 0) - (b.changePercent || 0))
    .slice(0, parseInt(limit));
  res.json({ stocks, count: stocks.length });
});

// En aktif hisseler
app.get('/api/market/active', (req, res) => {
  const { limit = 10 } = req.query;
  const stocks = mockData.stocks
    .map(s => mockData.generateStockData(s))
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, parseInt(limit));
  res.json({ stocks, count: stocks.length });
});

// Tüm hisseler
app.get('/api/market/stocks', (req, res) => {
  const { sector, page = 1, limit = 50 } = req.query;
  let filteredStocks = mockData.stocks;

  if (sector) {
    filteredStocks = filteredStocks.filter(s => s.sector === sector);
  }

  const stocksWithData = filteredStocks.map(stock => mockData.generateStockData(stock));

  const startIdx = (parseInt(page) - 1) * parseInt(limit);
  const paginatedStocks = stocksWithData.slice(startIdx, startIdx + parseInt(limit));

  res.json({
    stocks: paginatedStocks,
    total: filteredStocks.length,
    page: parseInt(page),
    totalPages: Math.ceil(filteredStocks.length / parseInt(limit))
  });
});

// Hisse arama
app.get('/api/market/stocks/search', (req, res) => {
  const { q } = req.query;

  if (!q || q.length < 1) {
    return res.json({ stocks: [] });
  }

  const query = q.toUpperCase();
  const results = mockData.stocks
    .filter(s => s.symbol.includes(query) || s.name.toUpperCase().includes(query))
    .slice(0, 10)
    .map(stock => mockData.generateStockData(stock));

  res.json({ stocks: results });
});

// Hisse detay
app.get('/api/market/stock/:symbol', (req, res) => {
  const { symbol } = req.params;
  const stock = mockData.stocks.find(s => s.symbol === symbol.toUpperCase());

  if (!stock) {
    return res.status(404).json({ error: `Stock ${symbol} not found` });
  }

  res.json(mockData.generateStockData(stock));
});

// Historik veri
app.get('/api/market/stock/:symbol/historical', (req, res) => {
  const { symbol } = req.params;
  const { period = '3mo' } = req.query;

  const days = {
    '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '5y': 1825
  }[period] || 90;

  const data = mockData.generateHistoricalData(symbol.toUpperCase(), days);
  res.json({ symbol: symbol.toUpperCase(), data });
});

// İndikatörler
app.get('/api/market/stock/:symbol/indicators', (req, res) => {
  const { symbol } = req.params;
  const stock = mockData.stocks.find(s => s.symbol === symbol.toUpperCase());

  if (!stock) {
    return res.status(404).json({ error: `Stock ${symbol} not found` });
  }

  const stockData = mockData.generateStockData(stock);
  res.json({
    symbol: stock.symbol,
    currentPrice: stockData.price,
    ...stockData.indicators
  });
});

// Sektör performansı
app.get('/api/market/sectors', (req, res) => {
  res.json({ sectors: mockData.generateSectorPerformance() });
});

// Günlük sinyaller
app.get('/api/market/signals', (req, res) => {
  const { strategy, status, limit = 50 } = req.query;
  let signals = mockData.generateSignals();

  if (strategy) {
    signals = signals.filter(s => s.strategy === strategy);
  }
  if (status) {
    signals = signals.filter(s => s.status === status);
  }

  res.json({ signals: signals.slice(0, parseInt(limit)) });
});

// Algoritma performansı - AlgoritmaPerformans.jsx beklenen format: {summary, champion, topPerformers, strategies}
app.get('/api/market/algorithm-performance', (req, res) => {
  res.json({
    summary: {
      activeTracks: 8,
      totalSuccessful: 47,
      successRate: 67,
      totalReturn: 12.4,
      avgReturn: 3.2,
      totalSignals: 70
    },
    champion: { symbol: 'THYAO', strategy: 'EMA Crossover', return: 8.2, days: 5 },
    topPerformers: mockData.stocks.slice(0, 6).map((s, i) => ({
      symbol: s.symbol,
      strategy: ['EMA Crossover', 'RSI Signal', 'MACD Crossover', 'Bollinger Breakout', 'Volume Spike', 'EMA Crossover'][i],
      return: +(3 + i * 1.2).toFixed(1),
      days: i + 1
    })),
    strategies: [
      { name: 'EMA Crossover', signals: 25, successful: 18, successRate: 72, avgReturn: 4.2 },
      { name: 'RSI Signal', signals: 18, successful: 11, successRate: 61, avgReturn: 2.8 },
      { name: 'MACD Crossover', signals: 15, successful: 10, successRate: 67, avgReturn: 3.5 },
      { name: 'Bollinger Breakout', signals: 12, successful: 8, successRate: 67, avgReturn: 5.1 }
    ],
    lastUpdate: new Date().toISOString()
  });
});

// Batch quotes
app.post('/api/market/batch-quotes', (req, res) => {
  const { symbols } = req.body;

  if (!Array.isArray(symbols)) {
    return res.status(400).json({ error: 'Symbols array required' });
  }

  const quotes = symbols.map(symbol => {
    const stock = mockData.stocks.find(s => s.symbol === symbol.toUpperCase());
    return stock ? mockData.generateStockData(stock) : null;
  }).filter(Boolean);

  res.json({ quotes });
});

// ============ ANALYSIS ROUTES ============

// AI Skor
app.get('/api/analysis/ai-score/:symbol', (req, res) => {
  const { symbol } = req.params;
  const score = mockData.generateAIScore(symbol.toUpperCase());

  if (!score) {
    return res.status(404).json({ error: `Stock ${symbol} not found` });
  }

  res.json(score);
});

// Temel Analiz
app.get('/api/analysis/fundamental/:symbol', (req, res) => {
  const { symbol } = req.params;
  const stock = mockData.stocks.find(s => s.symbol === symbol.toUpperCase());

  if (!stock) {
    return res.status(404).json({ error: `Stock ${symbol} not found` });
  }

  res.json({
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    altmanZScore: +(Math.random() * 4 + 1).toFixed(2),
    altmanInterpretation: 'Güvenli Bölge',
    piotroskiFScore: Math.floor(Math.random() * 4) + 5,
    piotroskiInterpretation: 'Finansal Açıdan Güçlü',
    beneishMScore: +(Math.random() * 2 - 3).toFixed(2),
    beneishInterpretation: 'Manipülasyon Riski Düşük',
    ratios: {
      priceToEarnings: +(Math.random() * 20 + 5).toFixed(2),
      priceToBook: +(Math.random() * 3 + 0.5).toFixed(2),
      priceToSales: +(Math.random() * 5 + 0.5).toFixed(2),
      debtToEquity: +(Math.random() * 1.5).toFixed(2),
      currentRatio: +(Math.random() * 2 + 0.5).toFixed(2),
      quickRatio: +(Math.random() * 1.5 + 0.3).toFixed(2),
      returnOnEquity: +(Math.random() * 30 + 5).toFixed(2),
      returnOnAssets: +(Math.random() * 15 + 2).toFixed(2),
      netProfitMargin: +(Math.random() * 20 + 5).toFixed(2),
      grossProfitMargin: +(Math.random() * 40 + 20).toFixed(2)
    }
  });
});

// Teknik Analiz
app.get('/api/analysis/technical/:symbol', (req, res) => {
  const { symbol } = req.params;
  const stock = mockData.stocks.find(s => s.symbol === symbol.toUpperCase());

  if (!stock) {
    return res.status(404).json({ error: `Stock ${symbol} not found` });
  }

  const stockData = mockData.generateStockData(stock);

  res.json({
    symbol: stock.symbol,
    name: stock.name,
    currentPrice: stockData.price,
    indicators: stockData.indicators,
    trend: Math.random() > 0.5 ? 'Yükseliş' : 'Düşüş',
    momentum: Math.random() > 0.5 ? 'Güçlü' : 'Zayıf',
    volatility: +(Math.random() * 30 + 10).toFixed(2),
    support: +(stockData.price * 0.95).toFixed(2),
    resistance: +(stockData.price * 1.05).toFixed(2),
    signals: [
      { indicator: 'RSI', signal: stockData.indicators.rsi < 30 ? 'Aşırı Satım' : stockData.indicators.rsi > 70 ? 'Aşırı Alım' : 'Nötr' },
      { indicator: 'MACD', signal: stockData.indicators.macd > stockData.indicators.macdSignal ? 'Alış' : 'Satış' },
      { indicator: 'EMA Kesişim', signal: stockData.price > stockData.indicators.ema21 ? 'Pozitif' : 'Negatif' },
      { indicator: 'Bollinger', signal: 'Bant İçinde' }
    ]
  });
});

// ============ KAP ROUTES ============
app.get('/api/kap/news', (req, res) => {
  const { stockSymbol, sentiment, limit = 20 } = req.query;
  let news = mockData.generateKAPNews();

  if (stockSymbol) {
    news = news.filter(n => n.stockSymbol === stockSymbol.toUpperCase());
  }
  if (sentiment) {
    news = news.filter(n => n.sentiment === sentiment);
  }

  res.json({ news: news.slice(0, parseInt(limit)) });
});

app.get('/api/kap/anomalies', (req, res) => {
  const anomalies = mockData.stocks.slice(0, 5).map(stock => ({
    symbol: stock.symbol,
    name: stock.name,
    newsCount: Math.floor(Math.random() * 10) + 5,
    avgNewsCount: 2,
    anomalyScore: +(Math.random() * 0.5 + 0.5).toFixed(2)
  }));

  res.json({ anomalies });
});

// ============ USER ROUTES ============

// Takip listesi getir
app.get('/api/user/watchlist', (req, res) => {
  const watchlistStocks = mockData.watchlist
    .map(symbol => {
      const stock = mockData.stocks.find(s => s.symbol === symbol);
      return stock ? mockData.generateStockData(stock) : null;
    })
    .filter(Boolean);

  res.json({ watchlist: watchlistStocks });
});

// Takip listesine ekle
app.post('/api/user/watchlist', (req, res) => {
  const { symbol } = req.body;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }

  const upperSymbol = symbol.toUpperCase();

  if (!mockData.watchlist.includes(upperSymbol)) {
    mockData.watchlist.push(upperSymbol);
  }

  res.json({ success: true, message: `${upperSymbol} takip listesine eklendi` });
});

// Takip listesinden çıkar
app.delete('/api/user/watchlist/:symbol', (req, res) => {
  const { symbol } = req.params;
  const upperSymbol = symbol.toUpperCase();

  mockData.watchlist = mockData.watchlist.filter(s => s !== upperSymbol);

  res.json({ success: true, message: `${upperSymbol} takip listesinden çıkarıldı` });
});

// Kullanıcı ayarları
app.get('/api/user/settings', (req, res) => {
  res.json({ user: mockData.mockUser });
});

app.put('/api/user/settings', (req, res) => {
  const updates = req.body;
  Object.assign(mockData.mockUser, updates);
  res.json({ success: true, user: mockData.mockUser });
});

// ============ CHART ROUTES ============
app.get('/api/chart/tradingview/:symbol', (req, res) => {
  const { symbol } = req.params;
  res.json({
    url: `https://tr.tradingview.com/chart/?symbol=BIST:${symbol.toUpperCase()}`,
    widgetUrl: `https://s.tradingview.com/widgetembed/?symbol=BIST:${symbol.toUpperCase()}`
  });
});

app.get('/api/chart/data/:symbol', (req, res) => {
  const { symbol } = req.params;
  const { interval = '1d', range = '3mo' } = req.query;

  const days = {
    '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365
  }[range] || 90;

  const data = mockData.generateHistoricalData(symbol.toUpperCase(), days);
  res.json({ symbol: symbol.toUpperCase(), interval, data });
});

app.get('/api/chart/intervals', (req, res) => {
  res.json({
    intervals: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'],
    ranges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '5y', 'all']
  });
});

// ============ SCAN ROUTES ============
app.get('/api/market/scans/:type', (req, res) => {
  const { type } = req.params;
  const scanTypes = {
    'ema-crossover': 'EMA Kesişimi',
    'rsi-oversold': 'RSI Aşırı Satım',
    'rsi-overbought': 'RSI Aşırı Alım',
    'macd-bullish': 'MACD Pozitif',
    'volume-spike': 'Hacim Patlaması',
    'bollinger-squeeze': 'Bollinger Sıkışma',
    'golden-cross': 'Altın Kesişim',
    'death-cross': 'Ölüm Kesişimi',
    'bollinger-lower': 'Bollinger Alt Bant',
    'stoch-oversold': 'Stoch Aşırı Satım',
    'williams-oversold': 'Williams Aşırı Satım',
    'cci-oversold': 'CCI Aşırı Satım',
    'supertrend-buy': 'Supertrend Alış',
    'rsi-adx-strong': 'RSI+ADX Güçlü Trend',
    'price-above-vwap': 'Fiyat VWAP Üstü',
    'ichimoku-bullish': 'Ichimoku Bullish'
  };

  const allStocks = mockData.stocks.map(stock => mockData.generateStockData(stock));
  // Tarama sonucunu simule et: her tip icin bazi hisseler eslesiyor
  const seed = type.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const stocks = allStocks.filter((_, idx) => (seed + idx) % 3 === 0).slice(0, 8);

  // Taramalar.jsx beklenen format: {stocks, total, scanned, strategy, timestamp}
  res.json({
    stocks,
    total: stocks.length,
    scanned: allStocks.length,
    strategy: scanTypes[type] || type,
    timestamp: new Date().toISOString()
  });
});

// Harmonik paternler
app.get('/api/market/harmonics', (req, res) => {
  const patterns = ['Gartley', 'Butterfly', 'Bat', 'Crab', 'Shark'];

  const results = mockData.stocks.slice(0, 8).map((stock, idx) => ({
    symbol: stock.symbol,
    name: stock.name,
    pattern: patterns[idx % patterns.length],
    direction: Math.random() > 0.5 ? 'Bullish' : 'Bearish',
    completion: Math.floor(Math.random() * 30) + 70,
    targetPrice: mockData.generateStockData(stock).price * (1 + (Math.random() * 0.2 - 0.1))
  }));

  res.json({ patterns: results });
});

// Fibonacci seviyeleri
app.get('/api/market/fibonacci', (req, res) => {
  const results = mockData.stocks.slice(0, 10).map(stock => {
    const data = mockData.generateStockData(stock);
    const high = data.high;
    const low = data.low;
    const diff = high - low;

    return {
      symbol: stock.symbol,
      name: stock.name,
      currentPrice: data.price,
      levels: {
        '0%': low,
        '23.6%': +(low + diff * 0.236).toFixed(2),
        '38.2%': +(low + diff * 0.382).toFixed(2),
        '50%': +(low + diff * 0.5).toFixed(2),
        '61.8%': +(low + diff * 0.618).toFixed(2),
        '100%': high
      }
    };
  });

  res.json({ stocks: results });
});

// ============ SIGNALS & ALERTS ============

// Sinyal kontrolu
app.post('/api/signals/check', (req, res) => {
  const signals = mockData.generateSignals().slice(0, 5);
  res.json({ success: true, signals, count: signals.length });
});

// Aktif alarmlar
app.get('/api/alerts', (req, res) => {
  res.json({ alerts: [], unreadCount: 0, total: 0 });
});

// Alarm okundu isaretle
app.post('/api/alerts/:id/read', (req, res) => {
  res.json({ success: true });
});

// Tum alarmlari temizle
app.delete('/api/alerts', (req, res) => {
  res.json({ success: true });
});

// Canli sinyaller
app.get('/api/signals/live', (req, res) => {
  res.json({ signals: mockData.generateSignals().slice(0, 10) });
});

// Teknik notlar
app.get('/api/technical-notes', (req, res) => {
  res.json({ notes: [], total: 0 });
});

// SNR endpoints
app.get('/api/snr/:symbol', (req, res) => {
  const { symbol } = req.params;
  res.json({ symbol: symbol.toUpperCase(), zones: [], storyline: 'neutral', atr: 0, score: 50 });
});

app.get('/api/snr/scanner/bist30', (req, res) => {
  res.json({ results: [], scanned: 30, lastUpdate: new Date().toISOString() });
});

// EMA34 endpoints
app.get('/api/ema34/scan', (req, res) => {
  res.json({ results: [], scanned: 30, lastUpdate: new Date().toISOString() });
});

app.get('/api/ema34/track/:symbol', (req, res) => {
  const { symbol } = req.params;
  res.json({ symbol: symbol.toUpperCase(), ema34: 0, signal: 'above', series: [] });
});

// Requests (Istek Paneli)
let mockRequests = [];
app.get('/api/requests', (req, res) => {
  res.json({ success: true, requests: mockRequests });
});
app.post('/api/requests', (req, res) => {
  const req_ = { id: Date.now().toString(), ...req.body, votes: 0, createdAt: new Date().toISOString() };
  mockRequests.unshift(req_);
  res.json({ success: true, request: req_ });
});
app.post('/api/requests/:id/vote', (req, res) => {
  const item = mockRequests.find(r => r.id === req.params.id);
  if (item) item.votes = (item.votes || 0) + 1;
  res.json({ success: true });
});

// Notes (Finansal Notlar API - server-live.js'de mevcut)
let mockNotes = [];
app.get('/api/notes', (req, res) => {
  res.json({ notes: mockNotes });
});
app.post('/api/notes', (req, res) => {
  const note = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
  mockNotes.unshift(note);
  res.json({ success: true, note });
});
app.put('/api/notes/:id', (req, res) => {
  mockNotes = mockNotes.map(n => n.id === req.params.id ? { ...n, ...req.body } : n);
  res.json({ success: true });
});
app.delete('/api/notes/:id', (req, res) => {
  mockNotes = mockNotes.filter(n => n.id !== req.params.id);
  res.json({ success: true });
});

// KAP real-news (GunlukTespitler icin)
app.get('/api/kap/real-news', (req, res) => {
  res.json({ news: [] });
});

// Abonelik
app.get('/api/subscription/plans', (req, res) => {
  res.json({ plans: [{ id: 'free', name: 'Ücretsiz', price: 0 }, { id: 'pro', name: 'Pro', price: 299 }] });
});
app.get('/api/subscription/status', (req, res) => {
  res.json({ plan: 'pro', active: true });
});
app.post('/api/subscription/upgrade', (req, res) => {
  res.json({ success: true });
});

// Strategy scan (TaramaAnalizMerkezi)
app.get('/api/market/strategy-scan', (req, res) => {
  res.json({
    total: 0,
    scanTime: new Date().toISOString(),
    highlights: { enYuksekDegisim: null, haftaninLideri: null, enKararli: null, yeniTespit: null },
    bogaStrategies: [],
    ayiStrategies: []
  });
});

// Pro analiz
app.get('/api/pro-analiz/scanner', (req, res) => {
  res.json({ results: [], scanned: 0, lastUpdate: new Date().toISOString() });
});
app.get('/api/pro-analiz/:symbol', (req, res) => {
  res.json({ symbol: req.params.symbol.toUpperCase(), score: 50, indicators: {} });
});
app.get('/api/pro-analiz/crypto/:coinId', (req, res) => {
  res.json({ coinId: req.params.coinId, price: 0, indicators: {} });
});
app.get('/api/pro-analiz/crypto-list', (req, res) => {
  res.json({ coins: [] });
});

// EMA34 tarayici bist30/bist100
app.get('/api/market/stocks/bist30', (req, res) => {
  const stocks = mockData.stocks.slice(0, 30).map(s => mockData.generateStockData(s));
  res.json({ stocks });
});
app.get('/api/market/stocks/bist100', (req, res) => {
  const stocks = mockData.stocks.slice(0, 100).map(s => mockData.generateStockData(s));
  res.json({ stocks });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Mock Server running on port ${PORT}`);
  console.log(`📊 Mode: Mock (no database required)`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  console.log(`❤️ Health: http://localhost:${PORT}/health`);
});

module.exports = app;
