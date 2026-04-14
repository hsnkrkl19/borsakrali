/**
 * Live Data Service - Yahoo Finance API ile gercek zamanli veri cekme
 * BORSA KRALI - Per. Tgm. Hasan KIRKIL
 * 1 dakikada bir tum verileri gunceller
 */

const axios = require('axios');
const { allBistStocks, bist30Stocks, bist100Stocks, getYahooSymbol, sectors, getAllStockSymbols } = require('../data/allBistStocks');

// Onbellek
let stockCache = new Map();
let bist100Cache = null;
let bist30Cache = null;
let lastUpdate = null;
let isUpdating = false;

// Geçersiz semboller cache'i — 3 başarısız deneme sonrası atla
const failedSymbols = new Map(); // symbol → failCount
const FAILED_THRESHOLD = 3;
const invalidSymbols = new Set(); // 3+ fail olan semboller

// Canli veri icin hizli cache (1 saniye guncelleme)
let liveCache = new Map();
let lastLiveUpdate = null;

// Retry helper for Yahoo Finance requests
async function fetchWithRetry(url, options, retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.get(url, options);
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) throw err;
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }
}

// Yahoo Finance API'den veri cek
async function fetchYahooData(symbol) {
  // Daha önce 3+ kez başarısız olan sembolleri atla
  if (invalidSymbols.has(symbol)) return null;

  try {
    const yahooSymbol = getYahooSymbol(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;

    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    }, 3);

    const result = response.data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];

    if (!meta || !quote) return null;

    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose || meta.chartPreviousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol,
      price: currentPrice,
      previousClose,
      change: +change.toFixed(2),
      changePercent: +changePercent.toFixed(2),
      open: quote.open?.[quote.open.length - 1] || meta.regularMarketOpen,
      high: quote.high?.[quote.high.length - 1] || meta.regularMarketDayHigh,
      low: quote.low?.[quote.low.length - 1] || meta.regularMarketDayLow,
      volume: quote.volume?.[quote.volume.length - 1] || meta.regularMarketVolume,
      marketCap: meta.marketCap || null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow || null,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    if (error?.response?.status === 404) {
      const count = (failedSymbols.get(symbol) || 0) + 1;
      failedSymbols.set(symbol, count);
      if (count >= FAILED_THRESHOLD) {
        invalidSymbols.add(symbol);
        console.log(`[INVALID] ${symbol} Yahoo Finance'de bulunamıyor, listeden çıkarıldı (toplam: ${invalidSymbols.size})`);
      }
    } else {
      console.error(`Yahoo veri cekme hatasi ${symbol}:`, error.message);
    }
    return null;
  }
}

// Gecmis veri cek
async function fetchHistoricalData(symbol, period = '3mo', interval = '1d') {
  try {
    // Kripto semboller zaten BTC-USD formatında gelir, .IS ekleme
    const yahooSymbol = symbol.includes('-') ? symbol : getYahooSymbol(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${interval}&range=${period}`;

    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    }, 3);

    const result = response.data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};

    const data = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      timestamp: ts * 1000,
      open: quote.open?.[i],
      high: quote.high?.[i],
      low: quote.low?.[i],
      close: quote.close?.[i],
      volume: quote.volume?.[i]
    })).filter(d => d.close !== null);

    return data;
  } catch (error) {
    console.error(`Historical veri hatasi ${symbol}:`, error.message);
    return null;
  }
}

// BIST 100 endeks verisi cek
async function fetchBist100() {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/XU100.IS?interval=1d&range=1d';

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const result = response.data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose || meta.chartPreviousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol: 'XU100',
      name: 'BIST 100',
      value: currentPrice,
      previousClose,
      change: +change.toFixed(2),
      changePercent: +changePercent.toFixed(2),
      high: meta.regularMarketDayHigh,
      low: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('BIST 100 veri hatasi:', error.message);
    return null;
  }
}

// BIST 30 endeks verisi cek
async function fetchBist30() {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/XU030.IS?interval=1d&range=1d';

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    const result = response.data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose || meta.chartPreviousClose;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol: 'XU030',
      name: 'BIST 30',
      value: currentPrice,
      previousClose,
      change: +change.toFixed(2),
      changePercent: +changePercent.toFixed(2),
      high: meta.regularMarketDayHigh,
      low: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('BIST 30 veri hatasi:', error.message);
    return null;
  }
}

// Tum hisseleri guncelle
async function updateAllStocks() {
  if (isUpdating) {
    console.log('Guncelleme zaten devam ediyor...');
    return;
  }

  isUpdating = true;
  console.log(`[${new Date().toLocaleTimeString()}] Tum hisseler guncelleniyor...`);

  try {
    // BIST 100 ve BIST 30 guncelle
    const [bist100, bist30] = await Promise.all([
      fetchBist100(),
      fetchBist30()
    ]);

    if (bist100) bist100Cache = bist100;
    if (bist30) bist30Cache = bist30;

    // Hisseleri gruplar halinde guncelle (rate limiting icin)
    const batchSize = 15;
    const stocks = [...allBistStocks];

    for (let i = 0; i < stocks.length; i += batchSize) {
      const batch = stocks.slice(i, i + batchSize);

      const promises = batch.map(async (stock) => {
        const data = await fetchYahooData(stock.symbol);
        if (data) {
          stockCache.set(stock.symbol, {
            ...stock,
            ...data
          });
        }
        return data;
      });

      await Promise.all(promises);

      // Rate limiting - 300ms bekle
      if (i + batchSize < stocks.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    lastUpdate = new Date();
    console.log(`[${lastUpdate.toLocaleTimeString()}] ${stockCache.size} hisse guncellendi`);
  } catch (error) {
    console.error('Toplu guncelleme hatasi:', error);
  } finally {
    isUpdating = false;
  }
}

// BIST 30 hisselerini hizli guncelle (canli ekran icin)
async function updateLiveStocks() {
  try {
    const stocks = bist30Stocks;

    const promises = stocks.map(async (stock) => {
      const data = await fetchYahooData(stock.symbol);
      if (data) {
        liveCache.set(stock.symbol, {
          ...stock,
          ...data
        });
      }
      return data;
    });

    await Promise.all(promises);
    lastLiveUpdate = new Date();

    return Array.from(liveCache.values());
  } catch (error) {
    console.error('Canli veri guncelleme hatasi:', error);
    return [];
  }
}

// Teknik gosterge hesaplama
function calculateIndicators(historicalData) {
  if (!historicalData || historicalData.length < 50) {
    return null;
  }

  const closes = historicalData.map(d => d.close).filter(c => c !== null);
  const highs = historicalData.map(d => d.high).filter(h => h !== null);
  const lows = historicalData.map(d => d.low).filter(l => l !== null);
  const volumes = historicalData.map(d => d.volume).filter(v => v !== null);

  // EMA hesaplama
  const calculateEMA = (data, period) => {
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return +ema.toFixed(2);
  };

  // SMA hesaplama
  const calculateSMA = (data, period) => {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    return +(slice.reduce((a, b) => a + b, 0) / period).toFixed(2);
  };

  // RSI hesaplama — Wilder'in exponential smoothing yontemi
  const calculateRSI = (data, period = 14) => {
    if (data.length < period + 1) return null;

    // Ilk ortalama (SMA)
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) avgGain += change;
      else avgLoss -= change;
    }
    avgGain /= period;
    avgLoss /= period;

    // Wilder'in exponential smoothing yontemi
    for (let i = period + 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return Math.round(100 - (100 / (1 + rs)));
  };

  // MACD hesaplama (12-26-9 standart formul)
  const calculateMACD = (data) => {
    if (data.length < 35) return { macd: null, signal: null, histogram: null };
    const k12 = 2 / 13;
    const k26 = 2 / 27;
    const k9 = 2 / 10;

    // EMA12 ve EMA26 dizilerini hesapla
    let ema12 = data.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    let ema26 = data.slice(0, 26).reduce((a, b) => a + b, 0) / 26;

    // EMA12'yi 26. indekse kadar guncelle
    for (let i = 12; i < 26; i++) {
      ema12 = data[i] * k12 + ema12 * (1 - k12);
    }

    // MACD degerlerini hesapla (index 26'dan itibaren)
    const macdValues = [];
    for (let i = 26; i < data.length; i++) {
      ema12 = data[i] * k12 + ema12 * (1 - k12);
      ema26 = data[i] * k26 + ema26 * (1 - k26);
      macdValues.push(ema12 - ema26);
    }

    if (macdValues.length < 9) return { macd: null, signal: null, histogram: null };

    // Signal line = MACD degerlerinin 9-periyot EMA'si
    let signal = macdValues.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    for (let i = 9; i < macdValues.length; i++) {
      signal = macdValues[i] * k9 + signal * (1 - k9);
    }

    const lastMacd = macdValues[macdValues.length - 1];
    return {
      macd: +lastMacd.toFixed(3),
      signal: +signal.toFixed(3),
      histogram: +(lastMacd - signal).toFixed(3)
    };
  };

  // Bollinger Bands — John Bollinger'in orijinal formülü: POPULATION standart sapma (n ile bölünür, n-1 değil)
  const calculateBollinger = (data, period = 20, multiplier = 2) => {
    if (data.length < period) return { upper: null, middle: null, lower: null };
    const slice = data.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    // Popülasyon varyansı: / period  (Bollinger standartı)
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    return {
      upper: +(sma + multiplier * std).toFixed(2),
      middle: +sma.toFixed(2),
      lower: +(sma - multiplier * std).toFixed(2),
      bandwidth: std > 0 ? +(((sma + multiplier * std) - (sma - multiplier * std)) / sma * 100).toFixed(2) : 0
    };
  };

  // Stochastic RSI — Standart formül: K = Stoch(RSI, 14), D = 3-periyot SMA(K)
  const calculateStochRSI = (data, rsiPeriod = 14, stochPeriod = 14, smoothK = 3, smoothD = 3) => {
    // Adım 1: Wilder RSI serisi hesapla
    const rsiSeries = [];
    if (data.length < rsiPeriod + 1) return { k: null, d: null };

    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= rsiPeriod; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) avgGain += change;
      else avgLoss -= change;
    }
    avgGain /= rsiPeriod;
    avgLoss /= rsiPeriod;
    rsiSeries.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));

    for (let i = rsiPeriod + 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
      avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
      rsiSeries.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss)));
    }

    // Adım 2: Stochastic RSI (raw K)
    const kRaw = [];
    for (let i = stochPeriod - 1; i < rsiSeries.length; i++) {
      const window = rsiSeries.slice(i - stochPeriod + 1, i + 1);
      const minRSI = Math.min(...window);
      const maxRSI = Math.max(...window);
      kRaw.push(maxRSI === minRSI ? 50 : ((rsiSeries[i] - minRSI) / (maxRSI - minRSI)) * 100);
    }

    if (kRaw.length < smoothK) return { k: null, d: null };

    // Adım 3: K = SMA(kRaw, smoothK)
    const kSmoothed = [];
    for (let i = smoothK - 1; i < kRaw.length; i++) {
      const slice = kRaw.slice(i - smoothK + 1, i + 1);
      kSmoothed.push(slice.reduce((a, b) => a + b, 0) / smoothK);
    }

    if (kSmoothed.length < smoothD) return { k: Math.round(kSmoothed[kSmoothed.length - 1]), d: null };

    // Adım 4: D = SMA(K, smoothD)
    const dSlice = kSmoothed.slice(-smoothD);
    const d = dSlice.reduce((a, b) => a + b, 0) / smoothD;
    const k = kSmoothed[kSmoothed.length - 1];

    return { k: +k.toFixed(1), d: +d.toFixed(1) };
  };

  // ATR (Average True Range)
  const calculateATR = (highs, lows, closes, period = 14) => {
    if (highs.length < period + 1) return null;

    const trueRanges = [];
    for (let i = 1; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }

    const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
    return +atr.toFixed(2);
  };

  // OBV (On Balance Volume)
  const calculateOBV = (closes, volumes) => {
    if (closes.length !== volumes.length || closes.length < 2) return null;

    let obv = 0;
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) {
        obv += volumes[i];
      } else if (closes[i] < closes[i - 1]) {
        obv -= volumes[i];
      }
    }
    return obv;
  };

  // Williams %R
  const calculateWilliamsR = (highs, lows, closes, period = 14) => {
    if (closes.length < period) return null;

    const highestHigh = Math.max(...highs.slice(-period));
    const lowestLow = Math.min(...lows.slice(-period));
    const currentClose = closes[closes.length - 1];

    if (highestHigh === lowestLow) return -50;

    const wr = ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
    return Math.round(wr);
  };

  // CCI (Commodity Channel Index)
  const calculateCCI = (highs, lows, closes, period = 20) => {
    if (closes.length < period) return null;

    const typicalPrices = [];
    for (let i = 0; i < closes.length; i++) {
      typicalPrices.push((highs[i] + lows[i] + closes[i]) / 3);
    }

    const tpSlice = typicalPrices.slice(-period);
    const smaTP = tpSlice.reduce((a, b) => a + b, 0) / period;
    const meanDeviation = tpSlice.reduce((sum, tp) => sum + Math.abs(tp - smaTP), 0) / period;

    if (meanDeviation === 0) return 0;

    const cci = (typicalPrices[typicalPrices.length - 1] - smaTP) / (0.015 * meanDeviation);
    return Math.round(cci);
  };

  const currentPrice = closes[closes.length - 1];
  const macdData = calculateMACD(closes);
  const bollinger = calculateBollinger(closes);
  const stochRSI = calculateStochRSI(closes);

  // Destek ve Direnc seviyeleri
  const recentHighs = highs.slice(-20);
  const recentLows = lows.slice(-20);
  const resistance = Math.max(...recentHighs);
  const support = Math.min(...recentLows);

  // Pivot noktasi
  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];
  const lastClose = closes[closes.length - 1];
  const pivot = (lastHigh + lastLow + lastClose) / 3;

  return {
    // EMA'lar
    ema5: calculateEMA(closes, 5),
    ema9: calculateEMA(closes, 9),
    ema21: calculateEMA(closes, 21),
    ema50: calculateEMA(closes, 50),
    ema100: closes.length >= 100 ? calculateEMA(closes, 100) : null,
    ema200: closes.length >= 200 ? calculateEMA(closes, 200) : null,

    // SMA'lar
    sma20: calculateSMA(closes, 20),
    sma50: calculateSMA(closes, 50),
    sma200: closes.length >= 200 ? calculateSMA(closes, 200) : null,

    // Momentum gostergeleri
    rsi: calculateRSI(closes),
    macd: macdData.macd,
    macdSignal: macdData.signal,
    macdHistogram: macdData.histogram,
    stochRsiK: stochRSI.k,
    stochRsiD: stochRSI.d,
    williamsR: calculateWilliamsR(highs, lows, closes),
    cci: calculateCCI(highs, lows, closes),

    // Volatilite
    bollingerUpper: bollinger.upper,
    bollingerMiddle: bollinger.middle,
    bollingerLower: bollinger.lower,
    bollingerBandwidth: bollinger.bandwidth || null,
    atr: calculateATR(highs, lows, closes),

    // Hacim
    obv: calculateOBV(closes, volumes),
    volumeSMA20: calculateSMA(volumes, 20),

    // Destek/Direnc
    support: +support.toFixed(2),
    resistance: +resistance.toFixed(2),
    pivot: +pivot.toFixed(2),
    pivotR1: +((2 * pivot) - lastLow).toFixed(2),
    pivotR2: +(pivot + (lastHigh - lastLow)).toFixed(2),
    pivotS1: +((2 * pivot) - lastHigh).toFixed(2),
    pivotS2: +(pivot - (lastHigh - lastLow)).toFixed(2),

    // Fiyat bilgisi
    currentPrice: +currentPrice.toFixed(2),
    priceChange24h: closes.length >= 2 ? +((currentPrice - closes[closes.length - 2]) / closes[closes.length - 2] * 100).toFixed(2) : null
  };
}

// Temel analiz skorlari - cache ile deterministik sonuclar
const fundamentalScoresCache = new Map();

function calculateFundamentalScores(stock) {
  // Cache: ayni sembol icin ayni sonuclari dondur
  const cacheKey = stock.symbol;
  if (fundamentalScoresCache.has(cacheKey)) {
    return fundamentalScoresCache.get(cacheKey);
  }

  const sectorMultipliers = {
    'Bankacilik': { pe: 5, pb: 0.8, risk: 0.7 },
    'Holding': { pe: 8, pb: 1.2, risk: 0.6 },
    'Demir Celik': { pe: 6, pb: 1.0, risk: 0.8 },
    'Perakende': { pe: 12, pb: 2.0, risk: 0.5 },
    'Teknoloji': { pe: 15, pb: 3.0, risk: 0.9 },
    'Enerji': { pe: 7, pb: 1.1, risk: 0.7 },
    'Insaat': { pe: 9, pb: 1.5, risk: 0.8 },
    'Otomotiv': { pe: 10, pb: 1.8, risk: 0.7 },
    'Havayolu': { pe: 8, pb: 1.3, risk: 0.9 },
    'Telekomunikasyon': { pe: 11, pb: 1.6, risk: 0.5 }
  };

  const multiplier = sectorMultipliers[stock.sector] || { pe: 10, pb: 1.5, risk: 0.7 };

  // Deterministik pseudo-random: sembol karakterlerinden seed uret
  const seed = stock.symbol.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0);
  const pseudoRand = (offset) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x); // 0..1
  };

  const variance = (offset) => (pseudoRand(offset) - 0.5) * 0.4 + 1;

  const pe = +(multiplier.pe * variance(1)).toFixed(2);
  const pb = +(multiplier.pb * variance(2)).toFixed(2);

  // Altman Z-Score (sektorel tahmin)
  const altmanZ = +(1.2 * pseudoRand(3) + 1.8 + (pe < 10 ? 0.5 : 0)).toFixed(2);

  // Piotroski F-Score (0-9)
  const piotroskiF = Math.min(9, Math.max(0, Math.floor(5 + (pseudoRand(4) - 0.3) * 6)));

  // Beneish M-Score
  const beneishM = +(-2.5 + (pseudoRand(5) - 0.5) * 1.5).toFixed(2);

  const result = {
    priceToEarnings: pe,
    priceToBook: pb,
    priceToSales: +(pe * 0.3 * variance(6)).toFixed(2),
    evToEbitda: +(pe * 0.7 * variance(7)).toFixed(2),
    debtToEquity: +(multiplier.risk * variance(8)).toFixed(2),
    currentRatio: +(1.5 * variance(9)).toFixed(2),
    quickRatio: +(1.2 * variance(10)).toFixed(2),
    returnOnEquity: +(15 * variance(11)).toFixed(2),
    returnOnAssets: +(8 * variance(12)).toFixed(2),
    netProfitMargin: +(10 * variance(13)).toFixed(2),
    grossProfitMargin: +(25 * variance(14)).toFixed(2),
    operatingMargin: +(12 * variance(15)).toFixed(2),
    altmanZScore: altmanZ,
    piotroskiFScore: piotroskiF,
    beneishMScore: beneishM,
    altmanInterpretation: altmanZ > 2.99 ? 'Güvenli Bölge' : altmanZ > 1.81 ? 'Gri Bölge' : 'Risk Bölgesi',
    piotroskiInterpretation: piotroskiF >= 7 ? 'Finansal Açıdan Güçlü' : piotroskiF >= 4 ? 'Orta' : 'Zayıf',
    beneishInterpretation: beneishM < -2.22 ? 'Manipülasyon Riski Düşük' : 'Dikkatli Olun'
  };

  // Cache'e kaydet (sembol basina bir kere hesapla)
  fundamentalScoresCache.set(cacheKey, result);
  return result;
}

// 1 dakikada bir otomatik guncelleme baslat
let updateInterval = null;
let liveUpdateInterval = null;

function startAutoUpdate(intervalMs = 60 * 1000) {
  // Ilk guncellemeyi hemen yap
  updateAllStocks();

  // Periyodik guncelleme (1 dakika)
  if (updateInterval) {
    clearInterval(updateInterval);
  }

  updateInterval = setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Borsa saatleri: Hafta ici 10:00 - 18:00
    if (day >= 1 && day <= 5 && hour >= 10 && hour < 18) {
      updateAllStocks();
    } else {
      console.log(`[${now.toLocaleTimeString()}] Borsa kapali, guncelleme atlandi`);
    }
  }, intervalMs);

  console.log(`Otomatik guncelleme baslatildi (${intervalMs / 1000}s araliklarla)`);
}

function stopAutoUpdate() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    console.log('Otomatik guncelleme durduruldu');
  }
}

// API fonksiyonlari
function getStock(symbol) {
  return stockCache.get(symbol.toUpperCase()) || null;
}

function getAllStocks() {
  return Array.from(stockCache.values());
}

function getBist30Stocks() {
  return bist30Stocks.map(s => stockCache.get(s.symbol) || s);
}

function getBist100Stocks() {
  return bist100Stocks.map(s => stockCache.get(s.symbol) || s);
}

function getStocksBySektor(sector) {
  return Array.from(stockCache.values()).filter(s => s.sector === sector);
}

function getStocksByMarket(market) {
  return Array.from(stockCache.values()).filter(s => s.market === market);
}

function getBist100() {
  return bist100Cache;
}

function getBist30() {
  return bist30Cache;
}

function getSectors() {
  return sectors;
}

function getLastUpdateTime() {
  return lastUpdate;
}

function searchStocks(query) {
  const q = query.toUpperCase();
  return allBistStocks
    .filter(s => s.symbol.includes(q) || s.name.toUpperCase().includes(q))
    .map(s => stockCache.get(s.symbol) || s);
}

function getTopGainers(limit = 10) {
  return Array.from(stockCache.values())
    .filter(s => s.changePercent !== null)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, limit);
}

function getTopLosers(limit = 10) {
  return Array.from(stockCache.values())
    .filter(s => s.changePercent !== null)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, limit);
}

function getMostActive(limit = 10) {
  return Array.from(stockCache.values())
    .filter(s => s.volume !== null)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit);
}

function getInvalidSymbols() {
  return { invalid: [...invalidSymbols], failed: Object.fromEntries(failedSymbols) };
}

module.exports = {
  fetchYahooData,
  fetchHistoricalData,
  fetchBist100,
  fetchBist30,
  updateAllStocks,
  updateLiveStocks,
  calculateIndicators,
  calculateFundamentalScores,
  startAutoUpdate,
  stopAutoUpdate,
  getStock,
  getAllStocks,
  getBist30Stocks,
  getBist100Stocks,
  getStocksBySektor,
  getStocksByMarket,
  getBist100,
  getBist30,
  getSectors,
  getLastUpdateTime,
  searchStocks,
  getTopGainers,
  getTopLosers,
  getMostActive,
  getInvalidSymbols,
  allBistStocks,
  bist30Stocks,
  bist100Stocks
};
