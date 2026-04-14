/**
 * Financial Formulas Service
 * Altman Z-Score, Piotroski F-Score, Beneish M-Score, Technical Indicators
 * Ichimoku Cloud, ADX, Supertrend, Stochastic - Tum hesaplamalar duzeltilmistir
 */

class FinancialFormulasService {

  /**
   * Calculate Exponential Moving Average (EMA)
   * @param {Array} prices - Array of closing prices
   * @param {number} period - EMA period
   * @returns {number|null} Son EMA degeri
   */
  calculateEMA(prices, period) {
    if (!prices || prices.length < period) return null;

    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] * k) + (ema * (1 - k));
    }

    return parseFloat(ema.toFixed(4));
  }

  /**
   * Calculate EMA series (array of values)
   */
  calculateEMASeries(prices, period) {
    if (!prices || prices.length < period) return [];

    const k = 2 / (period + 1);
    const result = new Array(period - 1).fill(null);
    let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
    result.push(ema);

    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
      result.push(ema);
    }
    return result;
  }

  /**
   * Calculate all EMAs for a price series
   */
  calculateAllEMAs(prices) {
    return {
      ema5: this.calculateEMA(prices, 5),
      ema9: this.calculateEMA(prices, 9),
      ema21: this.calculateEMA(prices, 21),
      ema50: this.calculateEMA(prices, 50),
      ema200: this.calculateEMA(prices, 200)
    };
  }

  /**
   * Calculate Relative Strength Index (RSI)
   * @param {Array} prices - Array of closing prices
   * @param {number} period - RSI period (default: 14)
   * @returns {number|null} Son RSI degeri
   */
  calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) return null;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change >= 0) gains += change;
      else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      avgGain = ((avgGain * (period - 1)) + (change >= 0 ? change : 0)) / period;
      avgLoss = ((avgLoss * (period - 1)) + (change < 0 ? -change : 0)) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return parseFloat((100 - (100 / (1 + rs))).toFixed(2));
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   * DUZELTILMIS: Gercek 9-donem EMA sinyal hatti
   */
  calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!prices || prices.length < slowPeriod + signalPeriod) return null;

    const kFast = 2 / (fastPeriod + 1);
    const kSlow = 2 / (slowPeriod + 1);

    // EMA baslangic degerleri
    let emaFast = prices.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
    let emaSlow = prices.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;

    // fastPeriod'dan slowPeriod'a kadar emaFast'i ilerlet
    for (let i = fastPeriod; i < slowPeriod; i++) {
      emaFast = prices[i] * kFast + emaFast * (1 - kFast);
    }

    // MACD serisi olustur
    const macdSeries = [];
    for (let i = slowPeriod; i < prices.length; i++) {
      emaFast = prices[i] * kFast + emaFast * (1 - kFast);
      emaSlow = prices[i] * kSlow + emaSlow * (1 - kSlow);
      macdSeries.push(emaFast - emaSlow);
    }

    if (macdSeries.length < signalPeriod) return null;

    // Signal line = signalPeriod EMA of MACD series
    const kSignal = 2 / (signalPeriod + 1);
    let signal = macdSeries.slice(0, signalPeriod).reduce((a, b) => a + b, 0) / signalPeriod;
    for (let i = signalPeriod; i < macdSeries.length; i++) {
      signal = macdSeries[i] * kSignal + signal * (1 - kSignal);
    }

    const macdValue = macdSeries[macdSeries.length - 1];
    const histogram = macdValue - signal;

    return {
      macd: parseFloat(macdValue.toFixed(4)),
      signal: parseFloat(signal.toFixed(4)),
      histogram: parseFloat(histogram.toFixed(4))
    };
  }

  /**
   * Calculate Ichimoku Cloud
   * @returns {object} Ichimoku bileşenleri ve sinyal
   */
  calculateIchimoku(highPrices, lowPrices, closePrices, tenkanPeriod = 9, kijunPeriod = 26, senkouBPeriod = 52) {
    if (!highPrices || highPrices.length < senkouBPeriod) return null;

    const getHL2 = (highs, lows, start, end) => {
      const slice_highs = highs.slice(start, end);
      const slice_lows = lows.slice(start, end);
      return (Math.max(...slice_highs) + Math.min(...slice_lows)) / 2;
    };

    const lastIdx = highPrices.length - 1;
    const currentPrice = closePrices[lastIdx];

    // Tenkan-Sen (Kisa donem donusum cizgisi - 9 gun)
    const tenkanSen = getHL2(highPrices, lowPrices, lastIdx - tenkanPeriod + 1, lastIdx + 1);

    // Kijun-Sen (Orta donem temel cizgi - 26 gun)
    const kijunSen = getHL2(highPrices, lowPrices, lastIdx - kijunPeriod + 1, lastIdx + 1);

    // Senkou Span A = (Tenkan + Kijun) / 2
    const senkouSpanA = (tenkanSen + kijunSen) / 2;

    // Senkou Span B = (High + Low) / 2 of last 52 periods
    const senkouSpanB = getHL2(highPrices, lowPrices, lastIdx - senkouBPeriod + 1, lastIdx + 1);

    // Chikou Span = current close plotted 26 periods back
    const chikouSpan = currentPrice;

    // Bulut (Kumo) usstu mu altinda mi?
    const cloudTop = Math.max(senkouSpanA, senkouSpanB);
    const cloudBottom = Math.min(senkouSpanA, senkouSpanB);

    const aboveCloud = currentPrice > cloudTop;
    const belowCloud = currentPrice < cloudBottom;
    const inCloud = currentPrice >= cloudBottom && currentPrice <= cloudTop;

    // TK Cross sinyali
    const tkBullish = tenkanSen > kijunSen; // Tenkan Kijun'u yukari kesti

    // Bulut rengi (Gelecegin bulutunu temsil eder)
    const bullishCloud = senkouSpanA > senkouSpanB;

    // Sinyal belirleme
    let signal = 'neutral';
    let signalStrength = 0;

    if (aboveCloud) signalStrength += 2;
    if (tkBullish) signalStrength += 1;
    if (bullishCloud) signalStrength += 1;
    if (currentPrice > tenkanSen) signalStrength += 1;

    if (signalStrength >= 4) signal = 'strong_bullish';
    else if (signalStrength >= 2) signal = 'bullish';
    else if (belowCloud) signal = 'bearish';

    return {
      tenkanSen: parseFloat(tenkanSen.toFixed(2)),
      kijunSen: parseFloat(kijunSen.toFixed(2)),
      senkouSpanA: parseFloat(senkouSpanA.toFixed(2)),
      senkouSpanB: parseFloat(senkouSpanB.toFixed(2)),
      chikouSpan: parseFloat(chikouSpan.toFixed(2)),
      cloudTop: parseFloat(cloudTop.toFixed(2)),
      cloudBottom: parseFloat(cloudBottom.toFixed(2)),
      aboveCloud,
      belowCloud,
      inCloud,
      tkBullish,
      bullishCloud,
      signal
    };
  }

  /**
   * Calculate ADX (Average Directional Index)
   * Trend gucu olcumu - Wilder's smoothing kullanir
   */
  calculateADX(highPrices, lowPrices, closePrices, period = 14) {
    if (!highPrices || highPrices.length < period * 2 + 1) return null;

    const trValues = [];
    const plusDMs = [];
    const minusDMs = [];

    for (let i = 1; i < highPrices.length; i++) {
      const high = highPrices[i];
      const low = lowPrices[i];
      const prevHigh = highPrices[i - 1];
      const prevLow = lowPrices[i - 1];
      const prevClose = closePrices[i - 1];

      trValues.push(Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      ));

      const upMove = high - prevHigh;
      const downMove = prevLow - low;

      plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    // Wilder's smoothing (ilk period'un toplami)
    let smoothedTR = trValues.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothedPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothedMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);

    const dxValues = [];

    for (let i = period; i < trValues.length; i++) {
      smoothedTR = smoothedTR - (smoothedTR / period) + trValues[i];
      smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDMs[i];
      smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDMs[i];

      if (smoothedTR === 0) { dxValues.push(0); continue; }

      const plusDI = (smoothedPlusDM / smoothedTR) * 100;
      const minusDI = (smoothedMinusDM / smoothedTR) * 100;
      const sumDI = plusDI + minusDI;

      dxValues.push(sumDI === 0 ? 0 : (Math.abs(plusDI - minusDI) / sumDI) * 100);
    }

    if (dxValues.length < period) return null;

    // ADX = period EMA of DX (Wilder)
    let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxValues.length; i++) {
      adx = (adx * (period - 1) + dxValues[i]) / period;
    }

    // Son +DI ve -DI
    const plusDI = (smoothedPlusDM / smoothedTR) * 100;
    const minusDI = (smoothedMinusDM / smoothedTR) * 100;

    return {
      adx: parseFloat(adx.toFixed(2)),
      plusDI: parseFloat(plusDI.toFixed(2)),
      minusDI: parseFloat(minusDI.toFixed(2)),
      trendStrength: adx > 25 ? 'strong' : adx > 15 ? 'moderate' : 'weak',
      bullish: plusDI > minusDI
    };
  }

  /**
   * Calculate Stochastic Oscillator %K and %D
   */
  calculateStochasticFull(highPrices, lowPrices, closePrices, kPeriod = 14, dPeriod = 3) {
    if (!highPrices || highPrices.length < kPeriod + dPeriod) return null;

    const kValues = [];
    for (let i = kPeriod - 1; i < highPrices.length; i++) {
      const high = Math.max(...highPrices.slice(i - kPeriod + 1, i + 1));
      const low = Math.min(...lowPrices.slice(i - kPeriod + 1, i + 1));
      const close = closePrices[i];

      kValues.push(high === low ? 50 : ((close - low) / (high - low)) * 100);
    }

    // %D = SMA of %K
    const dValues = [];
    for (let i = dPeriod - 1; i < kValues.length; i++) {
      dValues.push(kValues.slice(i - dPeriod + 1, i + 1).reduce((a, b) => a + b, 0) / dPeriod);
    }

    const k = kValues[kValues.length - 1];
    const d = dValues[dValues.length - 1];

    return {
      k: parseFloat(k.toFixed(2)),
      d: parseFloat(d.toFixed(2)),
      oversold: k < 20 && d < 20,
      overbought: k > 80 && d > 80,
      bullishCross: k > d && kValues[kValues.length - 2] <= dValues[dValues.length - 2]
    };
  }

  /**
   * Calculate Supertrend
   * @param {Array} highPrices
   * @param {Array} lowPrices
   * @param {Array} closePrices
   * @param {number} period - ATR period (default 10)
   * @param {number} multiplier - ATR multiplier (default 3)
   */
  calculateSupertrend(highPrices, lowPrices, closePrices, period = 10, multiplier = 3) {
    if (!highPrices || highPrices.length < period + 5) return null;

    // ATR hesapla
    const atrValues = this.calculateATR(highPrices, lowPrices, closePrices, period);
    if (!atrValues) return null;

    // ATR serisini hesapla
    const trValues = [];
    for (let i = 1; i < highPrices.length; i++) {
      trValues.push(Math.max(
        highPrices[i] - lowPrices[i],
        Math.abs(highPrices[i] - closePrices[i - 1]),
        Math.abs(lowPrices[i] - closePrices[i - 1])
      ));
    }

    // ATR serisini hesapla (Wilder)
    const atrSeries = [trValues[0]];
    for (let i = 1; i < trValues.length; i++) {
      atrSeries.push((atrSeries[i - 1] * (period - 1) + trValues[i]) / period);
    }

    // Supertrend hesapla
    const upperBand = [];
    const lowerBand = [];
    const supertrend = [];
    const direction = []; // 1 = bullish (buy), -1 = bearish (sell)

    for (let i = 0; i < atrSeries.length; i++) {
      const idx = i + 1; // prices index offset
      const hl2 = (highPrices[idx] + lowPrices[idx]) / 2;
      const atr = atrSeries[i];

      upperBand.push(hl2 + multiplier * atr);
      lowerBand.push(hl2 - multiplier * atr);
    }

    // Supertrend direction
    let prevSupertrend = closePrices[1] > upperBand[0] ? lowerBand[0] : upperBand[0];
    let prevDirection = closePrices[1] > upperBand[0] ? 1 : -1;

    supertrend.push(prevSupertrend);
    direction.push(prevDirection);

    for (let i = 1; i < upperBand.length; i++) {
      const idx = i + 1;
      let currentST, currentDir;

      if (prevDirection === 1) {
        currentST = Math.max(lowerBand[i], prevSupertrend);
        currentDir = closePrices[idx] < currentST ? -1 : 1;
      } else {
        currentST = Math.min(upperBand[i], prevSupertrend);
        currentDir = closePrices[idx] > currentST ? 1 : -1;
      }

      supertrend.push(currentST);
      direction.push(currentDir);
      prevSupertrend = currentST;
      prevDirection = currentDir;
    }

    const lastIdx = direction.length - 1;
    const isBullish = direction[lastIdx] === 1;
    const justFlipped = direction[lastIdx] !== direction[lastIdx - 1];

    return {
      value: parseFloat(supertrend[lastIdx].toFixed(2)),
      direction: direction[lastIdx],
      isBullish,
      isBearish: !isBullish,
      justTurnedBullish: isBullish && justFlipped,
      justTurnedBearish: !isBullish && justFlipped
    };
  }

  /**
   * Calculate VWAP (Volume Weighted Average Price)
   */
  calculateVWAP(highPrices, lowPrices, closePrices, volumes) {
    if (!highPrices || highPrices.length === 0) return null;

    let cumulativeTPV = 0;
    let cumulativeVol = 0;

    for (let i = 0; i < highPrices.length; i++) {
      const tp = (highPrices[i] + lowPrices[i] + closePrices[i]) / 3;
      cumulativeTPV += tp * volumes[i];
      cumulativeVol += volumes[i];
    }

    return cumulativeVol === 0 ? closePrices[closePrices.length - 1] : parseFloat((cumulativeTPV / cumulativeVol).toFixed(2));
  }

  /**
   * Calculate CCI (Commodity Channel Index)
   */
  calculateCCI(highPrices, lowPrices, closePrices, period = 20) {
    if (!highPrices || highPrices.length < period) return null;

    const typicalPrices = highPrices.map((h, i) => (h + lowPrices[i] + closePrices[i]) / 3);
    const recentTP = typicalPrices.slice(-period);
    const sma = recentTP.reduce((a, b) => a + b, 0) / period;
    const meanDev = recentTP.reduce((sum, tp) => sum + Math.abs(tp - sma), 0) / period;

    if (meanDev === 0) return 0;

    const currentTP = typicalPrices[typicalPrices.length - 1];
    return parseFloat(((currentTP - sma) / (0.015 * meanDev)).toFixed(2));
  }

  /**
   * Calculate Altman Z-Score
   */
  calculateAltmanZScore(financials) {
    const { workingCapital, totalAssets, retainedEarnings, ebit, marketValueEquity, totalLiabilities, sales } = financials;

    if (!totalAssets || totalAssets === 0) return null;

    const X1 = workingCapital / totalAssets;
    const X2 = retainedEarnings / totalAssets;
    const X3 = ebit / totalAssets;
    const X4 = marketValueEquity / (totalLiabilities || 1);
    const X5 = sales / totalAssets;

    const zScore = (1.2 * X1) + (1.4 * X2) + (3.3 * X3) + (0.6 * X4) + (1.0 * X5);
    return parseFloat(zScore.toFixed(4));
  }

  interpretAltmanZScore(zScore) {
    if (zScore > 2.99) return { zone: 'safe', risk: 'low', label: 'GÜVENLİ BÖLGE' };
    if (zScore > 1.81) return { zone: 'grey', risk: 'medium', label: 'GRİ BÖLGE' };
    return { zone: 'distress', risk: 'high', label: 'RİSK BÖLGESİ' };
  }

  /**
   * Calculate Piotroski F-Score (9 criteria)
   */
  calculatePiotroskiScore(current, previous) {
    let score = 0;
    if (current.netIncome > 0) score++;
    if (current.roa > 0) score++;
    if (current.operatingCashFlow > 0) score++;
    if (current.operatingCashFlow > current.netIncome) score++;
    if (current.longTermDebt < previous.longTermDebt) score++;
    if (current.currentRatio > previous.currentRatio) score++;
    if (current.sharesOutstanding <= previous.sharesOutstanding) score++;
    if (current.grossMargin > previous.grossMargin) score++;
    if (current.assetTurnover > previous.assetTurnover) score++;
    return score;
  }

  interpretPiotroskiScore(score) {
    if (score >= 7) return { level: 'strong', label: 'GÜÇLÜ (7-9)' };
    if (score >= 4) return { level: 'medium', label: 'ORTA (4-6)' };
    return { level: 'weak', label: 'ZAYIF (0-3)' };
  }

  /**
   * Calculate Beneish M-Score (Fraud Detection)
   */
  calculateBeneishMScore(current, previous) {
    const DSRI = (current.receivables / current.sales) / (previous.receivables / previous.sales);
    const GMI = (previous.grossProfit / previous.sales) / (current.grossProfit / current.sales);
    const AQI = (1 - ((current.currentAssets + current.ppe) / current.totalAssets)) /
                (1 - ((previous.currentAssets + previous.ppe) / previous.totalAssets));
    const SGI = current.sales / previous.sales;
    const DEPI = (previous.depreciation / (previous.depreciation + previous.ppe)) /
                 (current.depreciation / (current.depreciation + current.ppe));
    const SGAI = (current.sga / current.sales) / (previous.sga / previous.sales);
    const LVGI = ((current.longTermDebt + current.currentLiabilities) / current.totalAssets) /
                 ((previous.longTermDebt + previous.currentLiabilities) / previous.totalAssets);
    const TATA = (current.netIncome - current.operatingCashFlow) / current.totalAssets;

    const mScore = -4.84 + (0.92 * DSRI) + (0.528 * GMI) + (0.404 * AQI) +
                   (0.892 * SGI) + (0.115 * DEPI) - (0.172 * SGAI) +
                   (4.679 * LVGI) - (0.327 * TATA);
    return parseFloat(mScore.toFixed(4));
  }

  interpretBeneishMScore(mScore) {
    if (mScore > -1.78) return { risk: 'high', label: 'RİSKLİ (Manipülasyon İhtimali)' };
    return { risk: 'low', label: 'TEMİZ' };
  }

  /**
   * Calculate Price Saturation (0-100)
   */
  calculatePriceSaturation(currentPrice, emas) {
    const { ema5, ema9, ema21, ema50, ema200 } = emas;
    const allEmas = [ema5, ema9, ema21, ema50, ema200].filter(e => e);
    if (allEmas.length === 0) return 50;

    const maxEma = Math.max(...allEmas);
    const minEma = Math.min(...allEmas);
    const range = maxEma - minEma || 1;

    let saturation = ((currentPrice - minEma) / range) * 100;
    return Math.round(Math.max(0, Math.min(100, saturation)));
  }

  /**
   * Calculate Bollinger Bands
   */
  calculateBollingerBands(prices, period = 20, stdDev = 2) {
    if (!prices || prices.length < period) return null;

    const recentPrices = prices.slice(-period);
    const sma = recentPrices.reduce((sum, p) => sum + p, 0) / period;
    const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const sd = Math.sqrt(variance);
    const bandwidth = ((2 * stdDev * sd) / sma) * 100;

    return {
      middle: parseFloat(sma.toFixed(2)),
      upper: parseFloat((sma + (stdDev * sd)).toFixed(2)),
      lower: parseFloat((sma - (stdDev * sd)).toFixed(2)),
      bandwidth: parseFloat(bandwidth.toFixed(2)),
      squeezed: bandwidth < 5 // Bollinger squeeze
    };
  }

  /**
   * Calculate Average True Range (ATR)
   */
  calculateATR(highPrices, lowPrices, closePrices, period = 14) {
    if (!highPrices || highPrices.length < period + 1) return null;

    const trueRanges = [];
    for (let i = 1; i < highPrices.length; i++) {
      trueRanges.push(Math.max(
        highPrices[i] - lowPrices[i],
        Math.abs(highPrices[i] - closePrices[i - 1]),
        Math.abs(lowPrices[i] - closePrices[i - 1])
      ));
    }

    if (trueRanges.length < period) return null;

    let atr = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
    for (let i = period; i < trueRanges.length; i++) {
      atr = ((atr * (period - 1)) + trueRanges[i]) / period;
    }
    return parseFloat(atr.toFixed(2));
  }

  /**
   * Calculate Stochastic Oscillator (son deger)
   */
  calculateStochastic(highPrices, lowPrices, closePrices, period = 14) {
    if (!highPrices || highPrices.length < period) return null;

    const recentHighs = highPrices.slice(-period);
    const recentLows = lowPrices.slice(-period);
    const currentClose = closePrices[closePrices.length - 1];

    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);

    if (highestHigh === lowestLow) return 50;
    return parseFloat((((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100).toFixed(2));
  }

  /**
   * Detect Support and Resistance Levels
   */
  detectSupportResistance(prices, period = 20) {
    if (!prices || prices.length < period) return { support: [], resistance: [] };

    const support = [];
    const resistance = [];

    for (let i = period; i < prices.length - period; i++) {
      const slice = prices.slice(i - period, i + period);
      const current = prices[i];
      if (current === Math.min(...slice)) support.push(parseFloat(current.toFixed(2)));
      if (current === Math.max(...slice)) resistance.push(parseFloat(current.toFixed(2)));
    }

    return {
      support: support.slice(-3),
      resistance: resistance.slice(-3)
    };
  }

  /**
   * Calculate Fibonacci Retracement Levels
   */
  calculateFibonacciLevels(highPrices, lowPrices, closePrices) {
    if (!highPrices || !lowPrices || highPrices.length < 50) {
      return { support: 0, resistance: 0, levels: {} };
    }

    const period = Math.min(50, highPrices.length);
    const recentHighs = highPrices.slice(-period);
    const recentLows = lowPrices.slice(-period);
    const recentCloses = closePrices.slice(-period);

    const swingHigh = Math.max(...recentHighs);
    const swingLow = Math.min(...recentLows);
    const currentPrice = recentCloses[recentCloses.length - 1];
    const diff = swingHigh - swingLow;

    const fibLevels = {
      level_0: parseFloat(swingLow.toFixed(2)),
      level_236: parseFloat((swingLow + diff * 0.236).toFixed(2)),
      level_382: parseFloat((swingLow + diff * 0.382).toFixed(2)),
      level_500: parseFloat((swingLow + diff * 0.500).toFixed(2)),
      level_618: parseFloat((swingLow + diff * 0.618).toFixed(2)),
      level_786: parseFloat((swingLow + diff * 0.786).toFixed(2)),
      level_100: parseFloat(swingHigh.toFixed(2))
    };

    const allLevels = Object.values(fibLevels).sort((a, b) => a - b);
    let support = fibLevels.level_0;
    let resistance = fibLevels.level_100;

    for (let i = 0; i < allLevels.length; i++) {
      if (allLevels[i] < currentPrice) support = allLevels[i];
      if (allLevels[i] > currentPrice && resistance === fibLevels.level_100) resistance = allLevels[i];
    }

    if (currentPrice >= swingHigh) {
      support = fibLevels.level_786;
      resistance = parseFloat((swingHigh + diff * 0.236).toFixed(2));
    }

    if (currentPrice <= swingLow) {
      resistance = fibLevels.level_236;
      support = parseFloat((swingLow - diff * 0.236).toFixed(2));
    }

    return {
      support,
      resistance,
      levels: fibLevels,
      swingHigh,
      swingLow,
      trend: currentPrice > fibLevels.level_500 ? 'bullish' : 'bearish'
    };
  }

  /**
   * Williams %R
   */
  calculateWilliamsR(highPrices, lowPrices, closePrices, period = 14) {
    if (!highPrices || highPrices.length < period) return null;

    const recentHighs = highPrices.slice(-period);
    const recentLows = lowPrices.slice(-period);
    const close = closePrices[closePrices.length - 1];

    const highest = Math.max(...recentHighs);
    const lowest = Math.min(...recentLows);

    if (highest === lowest) return -50;
    return parseFloat((((highest - close) / (highest - lowest)) * -100).toFixed(2));
  }

  /**
   * OBV (On Balance Volume)
   */
  calculateOBV(closePrices, volumes) {
    if (!closePrices || closePrices.length < 2) return null;

    let obv = 0;
    for (let i = 1; i < closePrices.length; i++) {
      if (closePrices[i] > closePrices[i - 1]) obv += volumes[i];
      else if (closePrices[i] < closePrices[i - 1]) obv -= volumes[i];
    }
    return obv;
  }

  /**
   * RSI Divergence Detection
   * Fiyat yeni dip yaparken RSI daha yuksek dip yapiyor mu? (Bullish divergence)
   */
  detectRSIDivergence(closePrices, lookback = 14) {
    if (!closePrices || closePrices.length < lookback * 2) return null;

    const recent = closePrices.slice(-lookback);
    const prev = closePrices.slice(-lookback * 2, -lookback);

    const recentLow = Math.min(...recent);
    const prevLow = Math.min(...prev);

    const recentRSI = this.calculateRSI(closePrices, 14);
    const prevRSI = this.calculateRSI(closePrices.slice(0, -lookback), 14);

    if (!recentRSI || !prevRSI) return null;

    // Bullish divergence: fiyat daha dusuk dip, RSI daha yuksek dip
    const bullishDivergence = recentLow < prevLow && recentRSI > prevRSI;
    // Bearish divergence: fiyat daha yuksek tepe, RSI daha dusuk tepe
    const recentHigh = Math.max(...recent);
    const prevHigh = Math.max(...prev);
    const bearishDivergence = recentHigh > prevHigh && recentRSI < prevRSI;

    return { bullishDivergence, bearishDivergence, currentRSI: recentRSI };
  }
}

module.exports = new FinancialFormulasService();
