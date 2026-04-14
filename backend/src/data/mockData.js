/**
 * Mock Data - Veritabanı olmadan çalışacak tam veri seti
 */

// BIST Hisse Senetleri Listesi
const stocks = [
  { id: 1, symbol: 'THYAO', name: 'Türk Hava Yolları', sector: 'Ulaştırma', market: 'BIST30', isActive: true },
  { id: 2, symbol: 'GARAN', name: 'Garanti BBVA Bankası', sector: 'Bankacılık', market: 'BIST30', isActive: true },
  { id: 3, symbol: 'AKBNK', name: 'Akbank', sector: 'Bankacılık', market: 'BIST30', isActive: true },
  { id: 4, symbol: 'EREGL', name: 'Ereğli Demir Çelik', sector: 'Metal Ana Sanayi', market: 'BIST30', isActive: true },
  { id: 5, symbol: 'SISE', name: 'Şişecam', sector: 'Cam', market: 'BIST30', isActive: true },
  { id: 6, symbol: 'KCHOL', name: 'Koç Holding', sector: 'Holding', market: 'BIST30', isActive: true },
  { id: 7, symbol: 'SAHOL', name: 'Sabancı Holding', sector: 'Holding', market: 'BIST30', isActive: true },
  { id: 8, symbol: 'ASELS', name: 'Aselsan', sector: 'Savunma', market: 'BIST30', isActive: true },
  { id: 9, symbol: 'TUPRS', name: 'Tüpraş', sector: 'Petrokimya', market: 'BIST30', isActive: true },
  { id: 10, symbol: 'FROTO', name: 'Ford Otosan', sector: 'Otomotiv', market: 'BIST30', isActive: true },
  { id: 11, symbol: 'BIMAS', name: 'BİM Mağazalar', sector: 'Perakende', market: 'BIST30', isActive: true },
  { id: 12, symbol: 'TCELL', name: 'Turkcell', sector: 'Telekomünikasyon', market: 'BIST30', isActive: true },
  { id: 13, symbol: 'PGSUS', name: 'Pegasus', sector: 'Ulaştırma', market: 'BIST30', isActive: true },
  { id: 14, symbol: 'TOASO', name: 'Tofaş', sector: 'Otomotiv', market: 'BIST30', isActive: true },
  { id: 15, symbol: 'YKBNK', name: 'Yapı Kredi Bankası', sector: 'Bankacılık', market: 'BIST30', isActive: true },
  { id: 16, symbol: 'HALKB', name: 'Halk Bankası', sector: 'Bankacılık', market: 'BIST100', isActive: true },
  { id: 17, symbol: 'VAKBN', name: 'Vakıflar Bankası', sector: 'Bankacılık', market: 'BIST100', isActive: true },
  { id: 18, symbol: 'KOZAL', name: 'Koza Altın', sector: 'Madencilik', market: 'BIST100', isActive: true },
  { id: 19, symbol: 'KOZAA', name: 'Koza Anadolu Metal', sector: 'Madencilik', market: 'BIST100', isActive: true },
  { id: 20, symbol: 'PETKM', name: 'Petkim', sector: 'Petrokimya', market: 'BIST100', isActive: true },
  { id: 21, symbol: 'EKGYO', name: 'Emlak Konut GYO', sector: 'Gayrimenkul', market: 'BIST100', isActive: true },
  { id: 22, symbol: 'ENKAI', name: 'Enka İnşaat', sector: 'İnşaat', market: 'BIST100', isActive: true },
  { id: 23, symbol: 'TTKOM', name: 'Türk Telekom', sector: 'Telekomünikasyon', market: 'BIST100', isActive: true },
  { id: 24, symbol: 'ARCLK', name: 'Arçelik', sector: 'Beyaz Eşya', market: 'BIST100', isActive: true },
  { id: 25, symbol: 'VESTL', name: 'Vestel Elektronik', sector: 'Beyaz Eşya', market: 'BIST100', isActive: true },
  { id: 26, symbol: 'TAVHL', name: 'TAV Havalimanları', sector: 'Ulaştırma', market: 'BIST100', isActive: true },
  { id: 27, symbol: 'DOHOL', name: 'Doğan Holding', sector: 'Holding', market: 'BIST100', isActive: true },
  { id: 28, symbol: 'TTRAK', name: 'Türk Traktör', sector: 'Otomotiv', market: 'BIST100', isActive: true },
  { id: 29, symbol: 'SASA', name: 'SASA Polyester', sector: 'Tekstil', market: 'BIST100', isActive: true },
  { id: 30, symbol: 'KORDS', name: 'Kordsa', sector: 'Tekstil', market: 'BIST100', isActive: true },
  { id: 31, symbol: 'AKSEN', name: 'Aksa Enerji', sector: 'Enerji', market: 'BIST100', isActive: true },
  { id: 32, symbol: 'AEFES', name: 'Anadolu Efes', sector: 'Gıda', market: 'BIST100', isActive: true },
  { id: 33, symbol: 'ULKER', name: 'Ülker Bisküvi', sector: 'Gıda', market: 'BIST100', isActive: true },
  { id: 34, symbol: 'CCOLA', name: 'Coca-Cola İçecek', sector: 'Gıda', market: 'BIST100', isActive: true },
  { id: 35, symbol: 'OTKAR', name: 'Otokar', sector: 'Otomotiv', market: 'BIST100', isActive: true },
  { id: 36, symbol: 'MGROS', name: 'Migros', sector: 'Perakende', market: 'BIST100', isActive: true },
  { id: 37, symbol: 'SOKM', name: 'Şok Marketler', sector: 'Perakende', market: 'BIST100', isActive: true },
  { id: 38, symbol: 'DOAS', name: 'Doğuş Otomotiv', sector: 'Otomotiv', market: 'BIST100', isActive: true },
  { id: 39, symbol: 'TKFEN', name: 'Tekfen Holding', sector: 'Holding', market: 'BIST100', isActive: true },
  { id: 40, symbol: 'GUBRF', name: 'Gübre Fabrikaları', sector: 'Kimya', market: 'BIST100', isActive: true },
  { id: 41, symbol: 'ISCTR', name: 'Türkiye İş Bankası', sector: 'Bankacılık', market: 'BIST30', isActive: true },
  { id: 42, symbol: 'KONTR', name: 'Kontrolmatik Teknoloji', sector: 'Teknoloji', market: 'BIST100', isActive: true },
  { id: 43, symbol: 'LOGO', name: 'Logo Yazılım', sector: 'Teknoloji', market: 'BIST100', isActive: true },
  { id: 44, symbol: 'NETAS', name: 'Netaş Telekomünikasyon', sector: 'Teknoloji', market: 'BIST100', isActive: true },
  { id: 45, symbol: 'ALARK', name: 'Alarko Holding', sector: 'Holding', market: 'BIST100', isActive: true },
  { id: 46, symbol: 'ISMEN', name: 'İş Yatırım Menkul', sector: 'Finans', market: 'BIST100', isActive: true },
  { id: 47, symbol: 'SKBNK', name: 'Şekerbank', sector: 'Bankacılık', market: 'BIST100', isActive: true },
  { id: 48, symbol: 'TSKB', name: 'TSKB', sector: 'Bankacılık', market: 'BIST100', isActive: true },
  { id: 49, symbol: 'ALGYO', name: 'Alarko GYO', sector: 'Gayrimenkul', market: 'BIST100', isActive: true },
  { id: 50, symbol: 'ISGYO', name: 'İş GYO', sector: 'Gayrimenkul', market: 'BIST100', isActive: true }
];

// Sektörler
const sectors = [
  'Bankacılık', 'Holding', 'Ulaştırma', 'Otomotiv', 'Metal Ana Sanayi',
  'Perakende', 'Telekomünikasyon', 'Savunma', 'Petrokimya', 'Cam',
  'Madencilik', 'Gayrimenkul', 'İnşaat', 'Beyaz Eşya', 'Tekstil',
  'Enerji', 'Gıda', 'Kimya', 'Teknoloji', 'Finans'
];

// Rastgele fiyat üretici
function generateRandomPrice(basePrice, volatility = 0.05) {
  const change = (Math.random() - 0.5) * 2 * volatility;
  return +(basePrice * (1 + change)).toFixed(2);
}

// Rastgele değişim üretici
function generateRandomChange() {
  return +(Math.random() * 10 - 5).toFixed(2);
}

// Hisse için mock veri üret
function generateStockData(stock) {
  const basePrices = {
    'THYAO': 285.50, 'GARAN': 52.80, 'AKBNK': 48.60, 'EREGL': 42.30, 'SISE': 38.90,
    'KCHOL': 158.40, 'SAHOL': 68.20, 'ASELS': 95.60, 'TUPRS': 165.80, 'FROTO': 1085.00,
    'BIMAS': 285.00, 'TCELL': 48.50, 'PGSUS': 425.00, 'TOASO': 245.00, 'YKBNK': 24.80,
    'HALKB': 18.50, 'VAKBN': 16.80, 'KOZAL': 245.00, 'KOZAA': 42.50, 'PETKM': 18.90,
    'EKGYO': 12.50, 'ENKAI': 58.40, 'TTKOM': 42.80, 'ARCLK': 185.00, 'VESTL': 28.50,
    'TAVHL': 125.00, 'DOHOL': 8.50, 'TTRAK': 485.00, 'SASA': 68.50, 'KORDS': 85.00,
    'AKSEN': 28.50, 'AEFES': 285.00, 'ULKER': 185.00, 'CCOLA': 385.00, 'OTKAR': 1250.00,
    'MGROS': 385.00, 'SOKM': 58.50, 'DOAS': 185.00, 'TKFEN': 125.00, 'GUBRF': 145.00,
    'ISCTR': 15.80, 'KONTR': 245.00, 'LOGO': 285.00, 'NETAS': 28.50, 'ALARK': 85.00,
    'ISMEN': 12.80, 'SKBNK': 4.85, 'TSKB': 8.50, 'ALGYO': 42.00, 'ISGYO': 28.50
  };

  const basePrice = basePrices[stock.symbol] || 50;
  const price = generateRandomPrice(basePrice, 0.02);
  const change = generateRandomChange();
  const changePercent = +(change / price * 100).toFixed(2);
  const volume = Math.floor(Math.random() * 50000000) + 1000000;

  // EMA değerleri
  const ema5 = generateRandomPrice(price, 0.01);
  const ema9 = generateRandomPrice(price, 0.015);
  const ema21 = generateRandomPrice(price, 0.02);
  const ema50 = generateRandomPrice(price, 0.03);
  const ema200 = generateRandomPrice(price, 0.05);

  // RSI
  const rsi = Math.floor(Math.random() * 60) + 20;

  // MACD
  const macd = +(Math.random() * 4 - 2).toFixed(3);
  const macdSignal = +(Math.random() * 3 - 1.5).toFixed(3);
  const macdHistogram = +(macd - macdSignal).toFixed(3);

  return {
    ...stock,
    price,
    change,
    changePercent,
    volume,
    high: generateRandomPrice(price, 0.02),
    low: generateRandomPrice(price * 0.98, 0.02),
    open: generateRandomPrice(price, 0.01),
    previousClose: price - change,
    indicators: {
      ema5, ema9, ema21, ema50, ema200,
      rsi,
      macd, macdSignal, macdHistogram,
      bollingerUpper: +(price * 1.05).toFixed(2),
      bollingerMiddle: price,
      bollingerLower: +(price * 0.95).toFixed(2)
    }
  };
}

// BIST 100 Endeksi
function generateBist100() {
  const baseValue = 9850;
  const value = generateRandomPrice(baseValue, 0.01);
  const change = generateRandomChange();
  const changePercent = +(change / value * 100).toFixed(2);

  return {
    symbol: 'XU100',
    name: 'BIST 100',
    value,
    change,
    changePercent,
    volume: Math.floor(Math.random() * 10000000000) + 5000000000,
    timestamp: new Date().toISOString()
  };
}

// Sektör performansı
function generateSectorPerformance() {
  return sectors.map(sector => ({
    sector,
    change: generateRandomChange(),
    stockCount: Math.floor(Math.random() * 20) + 5,
    volume: Math.floor(Math.random() * 1000000000) + 100000000
  })).sort((a, b) => b.change - a.change);
}

// Günlük sinyaller
function generateSignals() {
  const strategies = [
    { name: 'EMA Crossover', description: 'EMA 5/21 kesişimi' },
    { name: 'RSI Signal', description: 'RSI aşırı alım/satım' },
    { name: 'MACD Crossover', description: 'MACD sinyal kesişimi' },
    { name: 'Bollinger Breakout', description: 'Bollinger band kırılımı' },
    { name: 'Volume Spike', description: 'Hacim patlaması' }
  ];

  const statuses = ['active', 'positive', 'negative'];

  return stocks.slice(0, 30).map((stock, idx) => {
    const strategy = strategies[idx % strategies.length];
    const status = statuses[Math.floor(Math.random() * 3)];
    const detectionPrice = generateRandomPrice(50, 0.3);
    const currentPrice = generateRandomPrice(detectionPrice, 0.1);
    const changePercent = +((currentPrice - detectionPrice) / detectionPrice * 100).toFixed(2);

    return {
      id: idx + 1,
      stockSymbol: stock.symbol,
      stockName: stock.name,
      sector: stock.sector,
      strategy: strategy.name,
      strategyDescription: strategy.description,
      status,
      detectionPrice,
      currentPrice,
      changePercent,
      detectionDate: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
    };
  });
}

// KAP Haberleri
function generateKAPNews() {
  const newsTemplates = [
    { title: 'Özel Durum Açıklaması', sentiment: 'neutral' },
    { title: 'Kar Dağıtım Kararı', sentiment: 'positive' },
    { title: 'Sermaye Artırımı', sentiment: 'neutral' },
    { title: 'Yeni Yatırım Duyurusu', sentiment: 'positive' },
    { title: 'Finansal Tablo Açıklaması', sentiment: 'neutral' },
    { title: 'İhale Kazanımı', sentiment: 'positive' },
    { title: 'Ortaklık Anlaşması', sentiment: 'positive' },
    { title: 'Üretim Kapasitesi Artışı', sentiment: 'positive' },
    { title: 'Risk Bildirimi', sentiment: 'negative' },
    { title: 'Denetim Raporu', sentiment: 'neutral' }
  ];

  return stocks.slice(0, 20).map((stock, idx) => {
    const template = newsTemplates[idx % newsTemplates.length];
    return {
      id: idx + 1,
      stockSymbol: stock.symbol,
      stockName: stock.name,
      title: `${stock.symbol} - ${template.title}`,
      summary: `${stock.name} şirketinden ${template.title.toLowerCase()} hakkında önemli bildirim yapıldı.`,
      sentiment: template.sentiment,
      sentimentScore: template.sentiment === 'positive' ? 0.7 : template.sentiment === 'negative' ? 0.3 : 0.5,
      publishDate: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000).toISOString(),
      source: 'KAP'
    };
  });
}

// Algoritma performansı
function generateAlgorithmPerformance() {
  const strategies = ['EMA Crossover', 'RSI Signal', 'MACD Crossover', 'Bollinger Breakout', 'Volume Spike'];
  const periods = ['1 Hafta', '1 Ay', '3 Ay', '6 Ay', '1 Yıl'];

  return strategies.map(strategy => ({
    strategy,
    periods: periods.map(period => ({
      period,
      totalSignals: Math.floor(Math.random() * 100) + 20,
      successfulSignals: Math.floor(Math.random() * 60) + 10,
      successRate: Math.floor(Math.random() * 40) + 50,
      avgReturn: +(Math.random() * 20 - 5).toFixed(2)
    }))
  }));
}

// Historik veri üret
function generateHistoricalData(symbol, days = 100) {
  const basePrices = {
    'THYAO': 285.50, 'GARAN': 52.80, 'AKBNK': 48.60, 'EREGL': 42.30, 'SISE': 38.90,
    'KCHOL': 158.40, 'SAHOL': 68.20, 'ASELS': 95.60, 'TUPRS': 165.80, 'FROTO': 1085.00
  };

  let price = basePrices[symbol] || 50;
  const data = [];

  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    const change = (Math.random() - 0.5) * price * 0.04;
    price = +(price + change).toFixed(2);

    const high = +(price * (1 + Math.random() * 0.02)).toFixed(2);
    const low = +(price * (1 - Math.random() * 0.02)).toFixed(2);
    const open = +(low + Math.random() * (high - low)).toFixed(2);
    const volume = Math.floor(Math.random() * 10000000) + 500000;

    data.push({
      date: date.toISOString().split('T')[0],
      timestamp: date.getTime(),
      open,
      high,
      low,
      close: price,
      volume
    });
  }

  return data;
}

// AI Skor üret
function generateAIScore(symbol) {
  const stock = stocks.find(s => s.symbol === symbol);
  if (!stock) return null;

  const technicalScore = Math.floor(Math.random() * 40) + 40;
  const fundamentalScore = Math.floor(Math.random() * 40) + 40;
  const riskScore = Math.floor(Math.random() * 40) + 30;
  const overallScore = Math.floor((technicalScore + fundamentalScore + riskScore) / 3);

  return {
    symbol,
    name: stock.name,
    sector: stock.sector,
    overallScore,
    technicalScore,
    fundamentalScore,
    riskScore,
    recommendation: overallScore > 70 ? 'AL' : overallScore > 50 ? 'TUT' : 'SAT',
    analysis: {
      altmanZScore: +(Math.random() * 4 + 1).toFixed(2),
      piotroskiFScore: Math.floor(Math.random() * 5) + 4,
      priceToEarnings: +(Math.random() * 20 + 5).toFixed(2),
      priceToBook: +(Math.random() * 3 + 0.5).toFixed(2),
      debtToEquity: +(Math.random() * 1.5).toFixed(2),
      returnOnEquity: +(Math.random() * 30 + 5).toFixed(2)
    },
    signals: [
      { indicator: 'RSI', value: Math.floor(Math.random() * 60) + 20, signal: 'Nötr' },
      { indicator: 'MACD', value: +(Math.random() * 4 - 2).toFixed(2), signal: Math.random() > 0.5 ? 'Alış' : 'Satış' },
      { indicator: 'EMA Trend', value: 'Yukarı', signal: 'Pozitif' }
    ],
    lastUpdate: new Date().toISOString()
  };
}

// Takip listesi
let watchlist = ['THYAO', 'GARAN', 'ASELS', 'EREGL', 'BIMAS'];

// Kullanıcı
const mockUser = {
  id: 1,
  name: 'Hsnkrkl',
  email: 'demo@borsasanati.com',
  role: 'user',
  preferences: {
    theme: 'dark',
    notifications: true
  }
};

module.exports = {
  stocks,
  sectors,
  generateStockData,
  generateBist100,
  generateSectorPerformance,
  generateSignals,
  generateKAPNews,
  generateAlgorithmPerformance,
  generateHistoricalData,
  generateAIScore,
  watchlist,
  mockUser
};
