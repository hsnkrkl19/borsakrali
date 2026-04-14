const express = require('express');
const router = express.Router();
const yahooFinanceService = require('../services/yahooFinanceService');
const formulaService = require('../services/formulaService');
const logger = require('../utils/logger');

// Hisse isim map
const STOCK_NAMES = {
  'THYAO': 'Türk Hava Yolları', 'GARAN': 'Garanti BBVA', 'AKBNK': 'Akbank',
  'ASELS': 'Aselsan', 'EREGL': 'Ereğli Demir Çelik', 'SISE': 'Şişe Cam',
  'KCHOL': 'Koç Holding', 'TUPRS': 'Tüpraş', 'TCELL': 'Turkcell', 'SAHOL': 'Sabancı Holding',
  'ISCTR': 'İş Bankası', 'YKBNK': 'Yapı Kredi', 'HALKB': 'Halkbank', 'VAKBN': 'Vakıfbank',
  'FROTO': 'Ford Otosan', 'TOASO': 'Tofaş', 'BIMAS': 'BİM', 'MGROS': 'Migros',
  'ARCLK': 'Arçelik', 'VESTL': 'Vestel', 'ENKAI': 'Enka İnşaat', 'PETKM': 'Petkim'
};

const STOCK_SECTORS = {
  'THYAO': 'Ulaştırma', 'GARAN': 'Bankacılık', 'AKBNK': 'Bankacılık',
  'ASELS': 'Savunma', 'EREGL': 'Metal Ana', 'SISE': 'Cam',
  'KCHOL': 'Holding', 'TUPRS': 'Petrol', 'TCELL': 'Telekomünikasyon', 'SAHOL': 'Holding',
  'ISCTR': 'Bankacılık', 'YKBNK': 'Bankacılık', 'HALKB': 'Bankacılık', 'VAKBN': 'Bankacılık',
  'FROTO': 'Otomotiv', 'TOASO': 'Otomotiv', 'BIMAS': 'Perakende', 'MGROS': 'Perakende',
  'ARCLK': 'Dayanıklı Tüketim', 'VESTL': 'Dayanıklı Tüketim', 'ENKAI': 'İnşaat', 'PETKM': 'Kimya'
};

/**
 * GET /api/analysis/technical/:symbol
 * Teknik Analiz - RSI, MACD, Bollinger, EMA, Ichimoku, ADX, Supertrend, Fibonacci
 */
router.get('/technical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();

    const historical = await yahooFinanceService.getHistoricalData(sym, '1y', '1d');

    if (!historical || historical.length < 60) {
      return res.status(404).json({ error: `${sym} için yeterli veri bulunamadı.` });
    }

    const closePrices = historical.map(d => parseFloat(d.close));
    const highPrices = historical.map(d => parseFloat(d.high));
    const lowPrices = historical.map(d => parseFloat(d.low));
    const volumes = historical.map(d => parseFloat(d.volume));

    const currentPrice = closePrices[closePrices.length - 1];
    const previousPrice = closePrices[closePrices.length - 2];
    const priceChange = currentPrice - previousPrice;
    const priceChangePercent = ((priceChange / previousPrice) * 100).toFixed(2);

    // Tüm EMA'lar
    const ema5 = formulaService.calculateEMA(closePrices, 5);
    const ema9 = formulaService.calculateEMA(closePrices, 9);
    const ema21 = formulaService.calculateEMA(closePrices, 21);
    const ema50 = formulaService.calculateEMA(closePrices, 50);
    const ema200 = formulaService.calculateEMA(closePrices, 200);

    const rsi = formulaService.calculateRSI(closePrices, 14);
    const macdData = formulaService.calculateMACD(closePrices);
    const bollinger = formulaService.calculateBollingerBands(closePrices, 20, 2);
    const atr = formulaService.calculateATR(highPrices, lowPrices, closePrices, 14);
    const stoch = formulaService.calculateStochasticFull(highPrices, lowPrices, closePrices);
    const adx = formulaService.calculateADX(highPrices, lowPrices, closePrices);
    const supertrend = formulaService.calculateSupertrend(highPrices, lowPrices, closePrices);
    const williamsR = formulaService.calculateWilliamsR(highPrices, lowPrices, closePrices);
    const cci = formulaService.calculateCCI(highPrices, lowPrices, closePrices);
    const vwap = formulaService.calculateVWAP(highPrices, lowPrices, closePrices, volumes);
    const fibonacci = formulaService.calculateFibonacciLevels(highPrices, lowPrices, closePrices);

    let ichimoku = null;
    if (highPrices.length >= 52) {
      ichimoku = formulaService.calculateIchimoku(highPrices, lowPrices, closePrices);
    }

    // Volatilite
    const recentPrices = closePrices.slice(-20);
    const avgPrice = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / recentPrices.length;
    const volatility = ((Math.sqrt(variance) / avgPrice) * 100).toFixed(2);
    const momentum10 = closePrices.length > 10
      ? ((currentPrice / closePrices[closePrices.length - 11] - 1) * 100).toFixed(2)
      : 0;

    // Trend
    let trend = 'Yatay';
    if (ema21 && ema50 && currentPrice > ema21 && ema21 > ema50) trend = 'Yükseliş';
    else if (ema21 && ema50 && currentPrice < ema21 && ema21 < ema50) trend = 'Düşüş';
    else if (ema50 && ema200 && ema50 > ema200) trend = 'Orta Vadeli Yükseliş';

    // Kapsamlı sinyaller
    const signals = [];

    if (rsi !== null) {
      if (rsi < 30) signals.push({ indicator: 'RSI (14)', signal: 'Aşırı Satım - Alış Fırsatı', value: rsi.toFixed(1), strength: 'strong', direction: 'buy' });
      else if (rsi < 40) signals.push({ indicator: 'RSI (14)', signal: 'Satım Bölgesi - Dikkat', value: rsi.toFixed(1), strength: 'medium', direction: 'watch' });
      else if (rsi > 70) signals.push({ indicator: 'RSI (14)', signal: 'Aşırı Alım - Satış Düşün', value: rsi.toFixed(1), strength: 'strong', direction: 'sell' });
      else if (rsi > 60) signals.push({ indicator: 'RSI (14)', signal: 'Alım Bölgesi', value: rsi.toFixed(1), strength: 'medium', direction: 'buy' });
      else signals.push({ indicator: 'RSI (14)', signal: 'Nötr Bölge', value: rsi.toFixed(1), strength: 'neutral', direction: 'neutral' });
    }

    if (macdData) {
      const macdPrev = formulaService.calculateMACD(closePrices.slice(0, -1));
      const crossedUp = macdPrev && macdData.macd > macdData.signal && macdPrev.macd <= macdPrev.signal;
      const crossedDown = macdPrev && macdData.macd < macdData.signal && macdPrev.macd >= macdPrev.signal;

      if (crossedUp) signals.push({ indicator: 'MACD', signal: 'Yukarı Kesişim - Güçlü Alış', value: macdData.macd.toFixed(3), strength: 'strong', direction: 'buy' });
      else if (crossedDown) signals.push({ indicator: 'MACD', signal: 'Aşağı Kesişim - Güçlü Satış', value: macdData.macd.toFixed(3), strength: 'strong', direction: 'sell' });
      else if (macdData.macd > macdData.signal) signals.push({ indicator: 'MACD', signal: 'Yükseliş Sinyali', value: macdData.macd.toFixed(3), strength: 'medium', direction: 'buy' });
      else signals.push({ indicator: 'MACD', signal: 'Düşüş Sinyali', value: macdData.macd.toFixed(3), strength: 'medium', direction: 'sell' });
    }

    if (ema50 && ema200) {
      if (ema50 > ema200 && currentPrice > ema50) signals.push({ indicator: 'EMA 50/200', signal: 'Güçlü Yükseliş Trendi', value: `${ema50.toFixed(2)}`, strength: 'strong', direction: 'buy' });
      else if (ema50 < ema200 && currentPrice < ema50) signals.push({ indicator: 'EMA 50/200', signal: 'Güçlü Düşüş Trendi', value: `${ema50.toFixed(2)}`, strength: 'strong', direction: 'sell' });
      else signals.push({ indicator: 'EMA 50/200', signal: 'Karışık Sinyal', value: `${ema50.toFixed(2)}`, strength: 'neutral', direction: 'neutral' });
    }

    if (ema50 && ema200 && closePrices.length > 210) {
      const prevEma50 = formulaService.calculateEMA(closePrices.slice(0, -5), 50);
      const prevEma200 = formulaService.calculateEMA(closePrices.slice(0, -5), 200);
      if (prevEma50 && prevEma200) {
        if (ema50 > ema200 && prevEma50 <= prevEma200) {
          signals.push({ indicator: 'Altın Kesişim', signal: 'Golden Cross - Çok Güçlü Alış', value: 'EMA 50/200', strength: 'strong', direction: 'buy' });
        } else if (ema50 < ema200 && prevEma50 >= prevEma200) {
          signals.push({ indicator: 'Ölüm Kesişimi', signal: 'Death Cross - Çok Güçlü Satış', value: 'EMA 50/200', strength: 'strong', direction: 'sell' });
        }
      }
    }

    if (bollinger) {
      if (currentPrice <= bollinger.lower) signals.push({ indicator: 'Bollinger Bands', signal: 'Alt Banda Değdi - Alış Fırsatı', value: bollinger.lower.toFixed(2), strength: 'strong', direction: 'buy' });
      else if (currentPrice >= bollinger.upper) signals.push({ indicator: 'Bollinger Bands', signal: 'Üst Banda Değdi - Satış Düşün', value: bollinger.upper.toFixed(2), strength: 'strong', direction: 'sell' });
      else {
        const pos = Math.round(((currentPrice - bollinger.lower) / (bollinger.upper - bollinger.lower)) * 100);
        signals.push({ indicator: 'Bollinger Bands', signal: `Bant İçi (%${pos} pozisyon)`, value: bollinger.middle.toFixed(2), strength: 'neutral', direction: 'neutral' });
      }
      if (bollinger.squeezed) {
        signals.push({ indicator: 'Bollinger Sıkışması', signal: 'Dar Bant - Büyük Hareket Yakın!', value: `Bant: %${bollinger.bandwidth.toFixed(1)}`, strength: 'medium', direction: 'watch' });
      }
    }

    if (stoch) {
      if (stoch.oversold) signals.push({ indicator: 'Stokastik (%K/%D)', signal: 'Aşırı Satım Bölgesi', value: `${stoch.k.toFixed(1)}/${stoch.d.toFixed(1)}`, strength: 'medium', direction: 'buy' });
      else if (stoch.overbought) signals.push({ indicator: 'Stokastik (%K/%D)', signal: 'Aşırı Alım Bölgesi', value: `${stoch.k.toFixed(1)}/${stoch.d.toFixed(1)}`, strength: 'medium', direction: 'sell' });
    }

    if (adx) {
      const adxLabel = adx.trendStrength === 'strong' ? 'Güçlü Trend' : adx.trendStrength === 'moderate' ? 'Orta Güçte' : 'Zayıf Trend';
      signals.push({ indicator: 'ADX (Trend Gücü)', signal: `${adxLabel} - ${adx.bullish ? '+DI Önde (Yükseliş)' : '-DI Önde (Düşüş)'}`, value: adx.adx.toFixed(1), strength: adx.adx > 25 ? 'strong' : 'neutral', direction: adx.bullish ? 'buy' : 'sell' });
    }

    if (ichimoku) {
      if (ichimoku.aboveCloud && ichimoku.tkBullish) signals.push({ indicator: 'Ichimoku Bulutu', signal: 'Bulut Üstü + TK Kesişim - Güçlü Alış', value: `Bulut: ${ichimoku.cloudBottom.toFixed(2)}-${ichimoku.cloudTop.toFixed(2)}`, strength: 'strong', direction: 'buy' });
      else if (ichimoku.belowCloud && !ichimoku.tkBullish) signals.push({ indicator: 'Ichimoku Bulutu', signal: 'Bulut Altı - Satış', value: `Bulut: ${ichimoku.cloudBottom.toFixed(2)}-${ichimoku.cloudTop.toFixed(2)}`, strength: 'strong', direction: 'sell' });
      else if (ichimoku.inCloud) signals.push({ indicator: 'Ichimoku Bulutu', signal: 'Bulut İçinde - Belirsiz', value: `${ichimoku.cloudBottom.toFixed(2)}-${ichimoku.cloudTop.toFixed(2)}`, strength: 'neutral', direction: 'neutral' });
    }

    if (supertrend) {
      if (supertrend.justTurnedBullish) signals.push({ indicator: 'Supertrend', signal: 'Yeni Alış Sinyali Oluştu!', value: supertrend.value.toFixed(2), strength: 'strong', direction: 'buy' });
      else if (supertrend.justTurnedBearish) signals.push({ indicator: 'Supertrend', signal: 'Yeni Satış Sinyali Oluştu!', value: supertrend.value.toFixed(2), strength: 'strong', direction: 'sell' });
      else if (supertrend.isBullish) signals.push({ indicator: 'Supertrend', signal: 'Alış Trendi Devam', value: supertrend.value.toFixed(2), strength: 'medium', direction: 'buy' });
      else signals.push({ indicator: 'Supertrend', signal: 'Satış Trendi Devam', value: supertrend.value.toFixed(2), strength: 'medium', direction: 'sell' });
    }

    if (williamsR !== null) {
      if (williamsR < -80) signals.push({ indicator: 'Williams %R', signal: 'Aşırı Satım Bölgesi', value: williamsR.toFixed(1), strength: 'medium', direction: 'buy' });
      else if (williamsR > -20) signals.push({ indicator: 'Williams %R', signal: 'Aşırı Alım Bölgesi', value: williamsR.toFixed(1), strength: 'medium', direction: 'sell' });
    }

    if (cci !== null) {
      if (cci < -100) signals.push({ indicator: 'CCI (20)', signal: 'Aşırı Satım - Geri Dönüş Bekleniyor', value: cci.toFixed(0), strength: 'medium', direction: 'buy' });
      else if (cci > 100) signals.push({ indicator: 'CCI (20)', signal: 'Aşırı Alım - Düzeltme Bekleniyor', value: cci.toFixed(0), strength: 'medium', direction: 'sell' });
    }

    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const todayVolume = volumes[volumes.length - 1];
    const volRatio = todayVolume / avgVolume;
    if (volRatio > 2) {
      signals.push({ indicator: 'Hacim', signal: `Anormal Yüksek Hacim (${volRatio.toFixed(1)}x)`, value: Math.round(todayVolume).toLocaleString(), strength: 'medium', direction: 'watch' });
    }

    if (vwap) {
      if (currentPrice > vwap) signals.push({ indicator: 'VWAP', signal: 'Fiyat VWAP Üstünde (Boğa)', value: vwap.toFixed(2), strength: 'medium', direction: 'buy' });
      else signals.push({ indicator: 'VWAP', signal: 'Fiyat VWAP Altında (Ayı)', value: vwap.toFixed(2), strength: 'medium', direction: 'sell' });
    }

    const buySignals = signals.filter(s => s.direction === 'buy').length;
    const sellSignals = signals.filter(s => s.direction === 'sell').length;
    const overallDirection = buySignals > sellSignals ? 'AL' : buySignals < sellSignals ? 'SAT' : 'NÖTR';

    res.json({
      symbol: sym,
      name: STOCK_NAMES[sym] || `${sym} Hisse Senedi`,
      sector: STOCK_SECTORS[sym] || 'BIST',
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      change: parseFloat(priceChange.toFixed(2)),
      changePercent: parseFloat(priceChangePercent),
      trend,
      overallSignal: overallDirection,
      buySignalCount: buySignals,
      sellSignalCount: sellSignals,
      indicators: {
        rsi: rsi ? parseFloat(rsi.toFixed(2)) : null,
        macd: macdData?.macd ? parseFloat(macdData.macd.toFixed(4)) : 0,
        macdSignal: macdData?.signal ? parseFloat(macdData.signal.toFixed(4)) : 0,
        macdHistogram: macdData?.histogram ? parseFloat(macdData.histogram.toFixed(4)) : 0,
        ema5: ema5 ? parseFloat(ema5.toFixed(2)) : null,
        ema9: ema9 ? parseFloat(ema9.toFixed(2)) : null,
        ema21: ema21 ? parseFloat(ema21.toFixed(2)) : null,
        ema50: ema50 ? parseFloat(ema50.toFixed(2)) : null,
        ema200: ema200 ? parseFloat(ema200.toFixed(2)) : null,
        bollingerUpper: bollinger?.upper || null,
        bollingerMiddle: bollinger?.middle || null,
        bollingerLower: bollinger?.lower || null,
        bollingerBandwidth: bollinger?.bandwidth || null,
        atr,
        stochasticK: stoch?.k || null,
        stochasticD: stoch?.d || null,
        adx: adx?.adx || null,
        plusDI: adx?.plusDI || null,
        minusDI: adx?.minusDI || null,
        williamsR,
        cci,
        vwap,
        supertrendValue: supertrend?.value || null,
        supertrendBullish: supertrend?.isBullish || null
      },
      ichimoku: ichimoku ? {
        tenkanSen: ichimoku.tenkanSen,
        kijunSen: ichimoku.kijunSen,
        senkouSpanA: ichimoku.senkouSpanA,
        senkouSpanB: ichimoku.senkouSpanB,
        cloudTop: ichimoku.cloudTop,
        cloudBottom: ichimoku.cloudBottom,
        aboveCloud: ichimoku.aboveCloud,
        belowCloud: ichimoku.belowCloud,
        tkBullish: ichimoku.tkBullish,
        signal: ichimoku.signal
      } : null,
      support: fibonacci.support,
      resistance: fibonacci.resistance,
      fibonacciLevels: fibonacci.levels,
      volatility: parseFloat(volatility),
      momentum: parseFloat(momentum10),
      signals,
      volume: { current: todayVolume, average20: Math.round(avgVolume), ratio: parseFloat(volRatio.toFixed(2)) },
      lastUpdate: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Technical analysis error for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Teknik analiz sırasında bir hata oluştu.', details: error.message });
  }
});

/**
 * GET /api/analysis/fundamental/:symbol
 * Temel Analiz - Yahoo Finance'dan gerçek verilerle tüm skorlar
 */
router.get('/fundamental/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();

    const [quote, financials, historical] = await Promise.all([
      yahooFinanceService.getCurrentQuote(sym),
      yahooFinanceService.getFinancialData(sym),
      yahooFinanceService.getHistoricalData(sym, '3mo', '1d')
    ]);

    if (!quote) {
      return res.status(404).json({ error: `${sym} için veri bulunamadı. Lütfen geçerli bir BIST hisse kodu girin.` });
    }

    const fd = financials || {};

    const peRatio = fd.peRatio ? parseFloat(fd.peRatio.toFixed(2)) : null;
    const pbRatio = fd.pbRatio ? parseFloat(fd.pbRatio.toFixed(2)) : null;
    const roe = fd.returnOnEquity ? parseFloat((fd.returnOnEquity * 100).toFixed(2)) : null;
    const roa = fd.returnOnAssets ? parseFloat((fd.returnOnAssets * 100).toFixed(2)) : null;
    const profitMargin = fd.profitMargin ? parseFloat((fd.profitMargin * 100).toFixed(2)) : null;
    const debtToEquity = fd.debtToEquity ? parseFloat(fd.debtToEquity.toFixed(2)) : null;
    const currentRatio = fd.currentRatio ? parseFloat(fd.currentRatio.toFixed(2)) : null;
    const quickRatio = fd.quickRatio ? parseFloat(fd.quickRatio.toFixed(2)) : null;
    const revenueGrowth = fd.revenueGrowth ? parseFloat((fd.revenueGrowth * 100).toFixed(2)) : null;
    const dividendYield = fd.dividendYield ? parseFloat((fd.dividendYield * 100).toFixed(2)) : null;

    // Altman Z-Score tahmini (Yahoo Finance verilerine dayali)
    let altmanZScore = null;
    let altmanInterpretation = 'Veri yetersiz';

    if (roa !== null && debtToEquity !== null) {
      const x1 = currentRatio ? Math.min(0.35, (currentRatio - 1) * 0.15) : 0.08;
      const x2 = roe ? Math.min(0.45, roe / 100 * 0.4) : 0.10;
      const x3 = roa ? roa / 100 : 0.04;
      const x4 = debtToEquity > 0 ? Math.min(2.5, (pbRatio || 1.5) / Math.max(0.1, debtToEquity)) : (pbRatio || 1.5);
      const x5 = revenueGrowth ? Math.max(0.4, 0.8 + revenueGrowth / 100) : 0.75;

      altmanZScore = parseFloat((1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5).toFixed(2));
      const interp = formulaService.interpretAltmanZScore(altmanZScore);
      altmanInterpretation = interp.label;
    } else {
      altmanZScore = 2.2;
      altmanInterpretation = 'GRİ BÖLGE (Tahmin)';
    }

    // Piotroski F-Score
    let piotroskiFScore = 0;
    if (roa !== null && profitMargin !== null) {
      if (roa > 0) piotroskiFScore++;
      if (profitMargin > 0) piotroskiFScore++;
      if (revenueGrowth !== null && revenueGrowth > 0) piotroskiFScore++;
      if (currentRatio !== null && currentRatio > 1.5) piotroskiFScore++;
      if (debtToEquity !== null && debtToEquity < 1.0) piotroskiFScore++;
      if (roe !== null && roe > 10) piotroskiFScore++;
      if (fd.operatingMargins && fd.operatingMargins > 0.08) piotroskiFScore++;
      if (dividendYield !== null && dividendYield > 0) piotroskiFScore++;
      if (pbRatio !== null && pbRatio < 3) piotroskiFScore++;
    } else {
      piotroskiFScore = 5;
    }

    const piotroskiInterp = formulaService.interpretPiotroskiScore(piotroskiFScore);
    const piotroskiInterpretation = piotroskiInterp.label;

    // Beneish M-Score tahmini
    let beneishMScore = -2.5;
    let beneishInterpretation = 'TEMİZ';

    if (revenueGrowth !== null && profitMargin !== null) {
      beneishMScore = parseFloat((-4.84 +
        (revenueGrowth > 50 ? 0.9 : revenueGrowth > 20 ? 0.4 : 0) +
        (profitMargin < 2 ? 0.6 : profitMargin < 5 ? 0.3 : 0) +
        (debtToEquity !== null && debtToEquity > 2 ? 0.5 : 0) +
        (currentRatio !== null && currentRatio < 1 ? 0.4 : 0)
      ).toFixed(2));
      beneishInterpretation = beneishMScore > -1.78 ? 'RİSKLİ (Manipülasyon İhtimali)' : 'TEMİZ';
    }

    const priceToSales = peRatio && profitMargin ? parseFloat((peRatio * (profitMargin / 100)).toFixed(2)) : null;
    const evToEbitda = peRatio ? parseFloat((peRatio * 0.75).toFixed(2)) : null;

    // Teknik skor
    let techScore = 50;
    if (historical && historical.length > 30) {
      const closes = historical.map(d => d.close);
      const rsiVal = formulaService.calculateRSI(closes, 14);
      const ema21Val = formulaService.calculateEMA(closes, 21);
      const ema50Val = formulaService.calculateEMA(closes, 50);
      const currentP = closes[closes.length - 1];
      if (rsiVal !== null) {
        if (rsiVal < 40) techScore += 10;
        if (rsiVal > 60) techScore -= 10;
      }
      if (ema21Val && currentP > ema21Val) techScore += 8;
      if (ema50Val && currentP > ema50Val) techScore += 7;
      techScore = Math.max(0, Math.min(100, techScore));
    }

    res.json({
      symbol: sym,
      name: STOCK_NAMES[sym] || `${sym} Hisse Senedi`,
      sector: STOCK_SECTORS[sym] || 'BIST',
      currentPrice: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      marketCap: quote.marketCap,

      // Akademik skorlar
      altmanZScore,
      altmanInterpretation,
      piotroskiFScore,
      piotroskiInterpretation,
      beneishMScore,
      beneishInterpretation,

      // Temel oranlar
      priceToEarnings: peRatio,
      priceToBook: pbRatio,
      priceToSales,
      evToEbitda,
      debtToEquity,
      currentRatio,
      quickRatio,
      returnOnEquity: roe,
      returnOnAssets: roa,
      netProfitMargin: profitMargin,
      revenueGrowth,
      dividendYield,
      technicalScore: Math.round(techScore),

      lastUpdate: new Date().toISOString(),
      dataNote: 'Altman/Beneish skorları Yahoo Finance verilerine dayalı tahmindir. Tam bilanço verileriyle daha doğru hesaplanır.'
    });

  } catch (error) {
    logger.error(`Fundamental analysis error for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'Temel analiz sırasında bir hata oluştu.', details: error.message });
  }
});

/**
 * GET /api/analysis/ai-score/:symbol
 */
router.get('/ai-score/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const sym = symbol.toUpperCase();

    const [historical, financials] = await Promise.all([
      yahooFinanceService.getHistoricalData(sym, '1y', '1d'),
      yahooFinanceService.getFinancialData(sym)
    ]);

    if (!historical || historical.length < 60) {
      return res.status(404).json({ error: `${sym} için yeterli veri bulunamadı.` });
    }

    const closePrices = historical.map(d => parseFloat(d.close));
    const highPrices = historical.map(d => parseFloat(d.high));
    const lowPrices = historical.map(d => parseFloat(d.low));

    const currentPrice = closePrices[closePrices.length - 1];
    const ema21 = formulaService.calculateEMA(closePrices, 21);
    const ema50 = formulaService.calculateEMA(closePrices, 50);
    const ema200 = formulaService.calculateEMA(closePrices, 200);
    const rsi = formulaService.calculateRSI(closePrices, 14);
    const macdData = formulaService.calculateMACD(closePrices);
    const bollinger = formulaService.calculateBollingerBands(closePrices, 20, 2);
    const adx = formulaService.calculateADX(highPrices, lowPrices, closePrices);
    const supertrend = formulaService.calculateSupertrend(highPrices, lowPrices, closePrices);
    const fibonacci = formulaService.calculateFibonacciLevels(highPrices, lowPrices, closePrices);

    let ichimoku = null;
    if (highPrices.length >= 52) ichimoku = formulaService.calculateIchimoku(highPrices, lowPrices, closePrices);

    let technicalScore = 50;
    if (rsi !== null) {
      if (rsi < 30) technicalScore += 15;
      else if (rsi < 40) technicalScore += 8;
      else if (rsi > 70) technicalScore -= 15;
      else if (rsi > 60) technicalScore -= 5;
      else if (rsi > 50) technicalScore += 3;
    }
    if (ema21 && currentPrice > ema21) technicalScore += 8;
    if (ema50 && currentPrice > ema50) technicalScore += 8;
    if (ema200 && currentPrice > ema200) technicalScore += 8;
    if (ema21 && ema50 && ema21 > ema50) technicalScore += 6;
    if (ema50 && ema200 && ema50 > ema200) technicalScore += 5;
    if (macdData && macdData.macd > macdData.signal) technicalScore += 10;
    if (macdData && macdData.histogram > 0) technicalScore += 5;
    if (bollinger && currentPrice < bollinger.lower) technicalScore += 8;
    if (ichimoku && ichimoku.aboveCloud) technicalScore += 10;
    if (supertrend && supertrend.isBullish) technicalScore += 8;
    if (adx && adx.adx > 25 && adx.bullish) technicalScore += 5;
    technicalScore = Math.max(0, Math.min(100, Math.round(technicalScore)));

    const fd = financials || {};
    let fundamentalScore = 50;
    if (fd.returnOnEquity && fd.returnOnEquity > 0.15) fundamentalScore += 15;
    else if (fd.returnOnEquity && fd.returnOnEquity > 0.08) fundamentalScore += 8;
    else if (fd.returnOnEquity && fd.returnOnEquity < 0) fundamentalScore -= 15;
    if (fd.profitMargin && fd.profitMargin > 0.15) fundamentalScore += 10;
    else if (fd.profitMargin && fd.profitMargin > 0.05) fundamentalScore += 5;
    else if (fd.profitMargin && fd.profitMargin < 0) fundamentalScore -= 10;
    if (fd.revenueGrowth && fd.revenueGrowth > 0.2) fundamentalScore += 10;
    else if (fd.revenueGrowth && fd.revenueGrowth > 0) fundamentalScore += 5;
    if (fd.currentRatio && fd.currentRatio > 1.5) fundamentalScore += 5;
    if (fd.debtToEquity && fd.debtToEquity < 1) fundamentalScore += 5;
    if (fd.peRatio && fd.peRatio > 0 && fd.peRatio < 15) fundamentalScore += 5;
    fundamentalScore = Math.max(0, Math.min(100, Math.round(fundamentalScore)));

    const recentPrices = closePrices.slice(-20);
    const avgPrice = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / recentPrices.length;
    const volatility = (Math.sqrt(variance) / avgPrice) * 100;

    let riskScore = 40;
    if (volatility > 8) riskScore += 25;
    else if (volatility > 5) riskScore += 15;
    else if (volatility > 3) riskScore += 8;
    if (rsi && (rsi > 80 || rsi < 20)) riskScore += 15;
    if (fd.debtToEquity && fd.debtToEquity > 2) riskScore += 15;
    riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));

    const overallScore = Math.round((technicalScore * 0.4) + (fundamentalScore * 0.35) + ((100 - riskScore) * 0.25));

    let recommendation = 'TUT';
    if (overallScore >= 70 && rsi && rsi < 65 && technicalScore >= 60) recommendation = 'AL';
    else if (overallScore <= 35 || (rsi && rsi > 78) || fundamentalScore < 30) recommendation = 'SAT';
    else if (overallScore >= 60) recommendation = 'AL';

    const signals = [];
    if (rsi !== null) {
      if (rsi < 30) signals.push({ indicator: 'RSI', signal: 'Aşırı Satım - Alış Fırsatı' });
      else if (rsi > 70) signals.push({ indicator: 'RSI', signal: 'Aşırı Alım - Satış Düşün' });
    }
    if (macdData && macdData.macd > macdData.signal) signals.push({ indicator: 'MACD', signal: 'Yükseliş Sinyali' });
    if (ema50 && currentPrice > ema50) signals.push({ indicator: 'EMA 50', signal: 'Fiyat Üstünde - Pozitif' });
    if (bollinger && currentPrice < bollinger.lower) signals.push({ indicator: 'Bollinger', signal: 'Alt Banda Yakın - Alış Fırsatı' });
    if (ichimoku && ichimoku.aboveCloud) signals.push({ indicator: 'Ichimoku', signal: 'Bulut Üstü - Güçlü Boğa' });
    if (supertrend && supertrend.isBullish) signals.push({ indicator: 'Supertrend', signal: 'Alış Trendi Aktif' });
    if (adx && adx.adx > 25) signals.push({ indicator: 'ADX', signal: `Güçlü Trend (${adx.adx})` });

    res.json({
      symbol: sym,
      name: STOCK_NAMES[sym] || `${sym} Hisse Senedi`,
      sector: STOCK_SECTORS[sym] || 'BIST',
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      technicalScore,
      fundamentalScore,
      riskScore,
      overallScore,
      recommendation,
      indicators: {
        rsi: rsi ? parseFloat(rsi.toFixed(2)) : null,
        macd: macdData?.macd ? parseFloat(macdData.macd.toFixed(4)) : null,
        macdSignal: macdData?.signal ? parseFloat(macdData.signal.toFixed(4)) : null,
        ema21: ema21 ? parseFloat(ema21.toFixed(2)) : null,
        ema50: ema50 ? parseFloat(ema50.toFixed(2)) : null,
        ema200: ema200 ? parseFloat(ema200.toFixed(2)) : null,
        bollingerUpper: bollinger?.upper || null,
        bollingerMiddle: bollinger?.middle || null,
        bollingerLower: bollinger?.lower || null,
        adx: adx?.adx || null,
        supertrendBullish: supertrend?.isBullish || null,
        ichimokuSignal: ichimoku?.signal || null
      },
      fundamentals: {
        returnOnEquity: fd.returnOnEquity ? parseFloat((fd.returnOnEquity * 100).toFixed(2)) : null,
        returnOnAssets: fd.returnOnAssets ? parseFloat((fd.returnOnAssets * 100).toFixed(2)) : null,
        profitMargin: fd.profitMargin ? parseFloat((fd.profitMargin * 100).toFixed(2)) : null,
        peRatio: fd.peRatio ? parseFloat(fd.peRatio.toFixed(2)) : null,
        pbRatio: fd.pbRatio ? parseFloat(fd.pbRatio.toFixed(2)) : null,
        debtToEquity: fd.debtToEquity ? parseFloat(fd.debtToEquity.toFixed(2)) : null,
        dividendYield: fd.dividendYield ? parseFloat((fd.dividendYield * 100).toFixed(2)) : null
      },
      fibonacci: fibonacci.levels,
      support: fibonacci.support,
      resistance: fibonacci.resistance,
      volatility: parseFloat(volatility.toFixed(2)),
      signals,
      lastUpdate: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`AI Score error for ${req.params.symbol}:`, error);
    res.status(500).json({ error: 'AI Skor analizi sırasında bir hata oluştu.', details: error.message });
  }
});

module.exports = router;
