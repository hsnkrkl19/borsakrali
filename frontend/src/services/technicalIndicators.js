/**
 * Teknik Analiz İndikatörleri
 * Tüm hesaplamalar bilimsel ve teknik kurallara uygun yapılmıştır.
 */

// ==================== HAREKETLI ORTALAMALAR ====================

/**
 * Basit Hareketli Ortalama (SMA)
 * @param {number[]} data - Fiyat verileri
 * @param {number} period - Periyot
 * @returns {number[]}
 */
export function calculateSMA(data, period) {
  const result = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)
      result.push(sum / period)
    }
  }
  return result
}

/**
 * Üssel Hareketli Ortalama (EMA)
 * Son fiyatlara daha fazla ağırlık verir
 * @param {number[]} data - Fiyat verileri
 * @param {number} period - Periyot
 * @returns {number[]}
 */
export function calculateEMA(data, period) {
  const result = []
  const multiplier = 2 / (period + 1)

  // İlk EMA değeri = SMA
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else if (i === period - 1) {
      result.push(ema)
    } else {
      ema = (data[i] - ema) * multiplier + ema
      result.push(ema)
    }
  }
  return result
}

/**
 * Ağırlıklı Hareketli Ortalama (WMA)
 * @param {number[]} data - Fiyat verileri
 * @param {number} period - Periyot
 * @returns {number[]}
 */
export function calculateWMA(data, period) {
  const result = []
  const weights = []
  let weightSum = 0

  for (let i = 1; i <= period; i++) {
    weights.push(i)
    weightSum += i
  }

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += data[i - period + 1 + j] * weights[j]
      }
      result.push(sum / weightSum)
    }
  }
  return result
}

// ==================== RSI (Göreceli Güç Endeksi) ====================

/**
 * RSI - Relative Strength Index
 * Aşırı alım (>70) ve aşırı satım (<30) seviyelerini belirler
 * @param {number[]} data - Kapanış fiyatları
 * @param {number} period - Periyot (varsayılan 14)
 * @returns {number[]}
 */
export function calculateRSI(data, period = 14) {
  const result = []
  const changes = []

  // Fiyat değişimlerini hesapla
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i] - data[i - 1])
  }

  // İlk ortalama kazanç ve kayıp
  let avgGain = 0
  let avgLoss = 0

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i]
    else avgLoss += Math.abs(changes[i])
  }

  avgGain /= period
  avgLoss /= period

  // İlk RSI değeri
  result.push(null) // İlk fiyat için değişim yok
  for (let i = 0; i < period; i++) {
    result.push(null)
  }

  if (avgLoss === 0) {
    result.push(100)
  } else {
    const rs = avgGain / avgLoss
    result.push(100 - (100 / (1 + rs)))
  }

  // Sonraki RSI değerleri (Wilder's Smoothing)
  for (let i = period + 1; i < changes.length; i++) {
    const change = changes[i]
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    if (avgLoss === 0) {
      result.push(100)
    } else {
      const rs = avgGain / avgLoss
      result.push(100 - (100 / (1 + rs)))
    }
  }

  return result
}

// ==================== MACD ====================

/**
 * MACD - Moving Average Convergence Divergence
 * Trend dönüşlerini tespit eder
 * @param {number[]} data - Kapanış fiyatları
 * @param {number} fastPeriod - Hızlı EMA periyodu (varsayılan 12)
 * @param {number} slowPeriod - Yavaş EMA periyodu (varsayılan 26)
 * @param {number} signalPeriod - Sinyal periyodu (varsayılan 9)
 * @returns {object} { macd, signal, histogram }
 */
export function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = calculateEMA(data, fastPeriod)
  const slowEMA = calculateEMA(data, slowPeriod)

  // MACD Line = Fast EMA - Slow EMA
  const macdLine = fastEMA.map((fast, i) => {
    if (fast === null || slowEMA[i] === null) return null
    return fast - slowEMA[i]
  })

  // Signal Line = 9 EMA of MACD Line
  const validMacd = macdLine.filter(v => v !== null)
  const signalEMA = calculateEMA(validMacd, signalPeriod)

  const signalLine = []
  let signalIndex = 0
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) {
      signalLine.push(null)
    } else {
      signalLine.push(signalEMA[signalIndex] || null)
      signalIndex++
    }
  }

  // Histogram = MACD Line - Signal Line
  const histogram = macdLine.map((macd, i) => {
    if (macd === null || signalLine[i] === null) return null
    return macd - signalLine[i]
  })

  return { macd: macdLine, signal: signalLine, histogram }
}

// ==================== BOLLINGER BANTLARI ====================

/**
 * Bollinger Bantları
 * Volatiliteyi ölçer ve fiyat aralıklarını belirler
 * @param {number[]} data - Kapanış fiyatları
 * @param {number} period - Periyot (varsayılan 20)
 * @param {number} stdDev - Standart sapma çarpanı (varsayılan 2)
 * @returns {object} { upper, middle, lower }
 */
export function calculateBollingerBands(data, period = 20, stdDev = 2) {
  const middle = calculateSMA(data, period)
  const upper = []
  const lower = []

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(null)
      lower.push(null)
    } else {
      const slice = data.slice(i - period + 1, i + 1)
      const mean = middle[i]
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period
      const std = Math.sqrt(variance)

      upper.push(mean + stdDev * std)
      lower.push(mean - stdDev * std)
    }
  }

  return { upper, middle, lower }
}

// ==================== STOKASTİK OSİLATÖR ====================

/**
 * Stokastik Osilatör
 * Fiyat momentumunu analiz eder
 * @param {object[]} data - { high, low, close } dizisi
 * @param {number} kPeriod - %K periyodu (varsayılan 14)
 * @param {number} dPeriod - %D periyodu (varsayılan 3)
 * @returns {object} { k, d }
 */
export function calculateStochastic(data, kPeriod = 14, dPeriod = 3) {
  const kValues = []

  for (let i = 0; i < data.length; i++) {
    if (i < kPeriod - 1) {
      kValues.push(null)
    } else {
      const slice = data.slice(i - kPeriod + 1, i + 1)
      const highestHigh = Math.max(...slice.map(d => d.high))
      const lowestLow = Math.min(...slice.map(d => d.low))
      const currentClose = data[i].close

      if (highestHigh === lowestLow) {
        kValues.push(50)
      } else {
        const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100
        kValues.push(k)
      }
    }
  }

  // %D = SMA of %K
  const dValues = calculateSMA(kValues.filter(v => v !== null), dPeriod)
  const dResult = []
  let dIndex = 0

  for (let i = 0; i < kValues.length; i++) {
    if (kValues[i] === null) {
      dResult.push(null)
    } else {
      dResult.push(dValues[dIndex] || null)
      dIndex++
    }
  }

  return { k: kValues, d: dResult }
}

// ==================== ATR (Ortalama Gerçek Aralık) ====================

/**
 * ATR - Average True Range
 * Piyasa volatilitesini ölçer
 * @param {object[]} data - { high, low, close } dizisi
 * @param {number} period - Periyot (varsayılan 14)
 * @returns {number[]}
 */
export function calculateATR(data, period = 14) {
  const trueRanges = []

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      trueRanges.push(data[i].high - data[i].low)
    } else {
      const tr = Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close)
      )
      trueRanges.push(tr)
    }
  }

  // ATR = EMA of True Range
  return calculateEMA(trueRanges, period)
}

// ==================== PARABOLİK SAR ====================

/**
 * Parabolik SAR
 * Trend takibi ve dönüş noktalarını belirler
 * @param {object[]} data - { high, low, close } dizisi
 * @param {number} step - Hızlanma faktörü başlangıç değeri (varsayılan 0.02)
 * @param {number} max - Maksimum hızlanma faktörü (varsayılan 0.2)
 * @returns {object} { sar, trend }
 */
export function calculateParabolicSAR(data, step = 0.02, max = 0.2) {
  const sar = []
  const trend = [] // 1 = uptrend, -1 = downtrend

  if (data.length < 2) return { sar: [], trend: [] }

  // İlk değerler
  let isUptrend = data[1].close > data[0].close
  let af = step
  let ep = isUptrend ? data[0].high : data[0].low
  let currentSar = isUptrend ? data[0].low : data[0].high

  sar.push(currentSar)
  trend.push(isUptrend ? 1 : -1)

  for (let i = 1; i < data.length; i++) {
    const prevSar = currentSar
    currentSar = prevSar + af * (ep - prevSar)

    // SAR'ın fiyatla kesişim kontrolü
    if (isUptrend) {
      currentSar = Math.min(currentSar, data[i - 1].low, i >= 2 ? data[i - 2].low : data[i - 1].low)

      if (data[i].low < currentSar) {
        // Trend değişimi (yukarıdan aşağı)
        isUptrend = false
        currentSar = ep
        ep = data[i].low
        af = step
      } else {
        if (data[i].high > ep) {
          ep = data[i].high
          af = Math.min(af + step, max)
        }
      }
    } else {
      currentSar = Math.max(currentSar, data[i - 1].high, i >= 2 ? data[i - 2].high : data[i - 1].high)

      if (data[i].high > currentSar) {
        // Trend değişimi (aşağıdan yukarı)
        isUptrend = true
        currentSar = ep
        ep = data[i].high
        af = step
      } else {
        if (data[i].low < ep) {
          ep = data[i].low
          af = Math.min(af + step, max)
        }
      }
    }

    sar.push(currentSar)
    trend.push(isUptrend ? 1 : -1)
  }

  return { sar, trend }
}

// ==================== ICHIMOKU BULUTU ====================

/**
 * Ichimoku Bulutu
 * Çok yönlü trend ve momentum analizi
 * @param {object[]} data - { high, low, close } dizisi
 * @returns {object} { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan }
 */
export function calculateIchimoku(data, tenkanPeriod = 9, kijunPeriod = 26, senkouBPeriod = 52) {
  const tenkanSen = [] // Dönüş çizgisi
  const kijunSen = [] // Standart çizgi
  const senkouSpanA = [] // Öncü Span A
  const senkouSpanB = [] // Öncü Span B
  const chikouSpan = [] // Gecikmeli çizgi

  const getHighLowMid = (slice) => {
    const high = Math.max(...slice.map(d => d.high))
    const low = Math.min(...slice.map(d => d.low))
    return (high + low) / 2
  }

  for (let i = 0; i < data.length; i++) {
    // Tenkan-Sen (9 periyot)
    if (i < tenkanPeriod - 1) {
      tenkanSen.push(null)
    } else {
      tenkanSen.push(getHighLowMid(data.slice(i - tenkanPeriod + 1, i + 1)))
    }

    // Kijun-Sen (26 periyot)
    if (i < kijunPeriod - 1) {
      kijunSen.push(null)
    } else {
      kijunSen.push(getHighLowMid(data.slice(i - kijunPeriod + 1, i + 1)))
    }

    // Senkou Span B (52 periyot, 26 gün ileri)
    if (i < senkouBPeriod - 1) {
      senkouSpanB.push(null)
    } else {
      senkouSpanB.push(getHighLowMid(data.slice(i - senkouBPeriod + 1, i + 1)))
    }

    // Chikou Span (26 gün geri)
    chikouSpan.push(data[i].close)
  }

  // Senkou Span A = (Tenkan-Sen + Kijun-Sen) / 2
  for (let i = 0; i < data.length; i++) {
    if (tenkanSen[i] === null || kijunSen[i] === null) {
      senkouSpanA.push(null)
    } else {
      senkouSpanA.push((tenkanSen[i] + kijunSen[i]) / 2)
    }
  }

  return { tenkanSen, kijunSen, senkouSpanA, senkouSpanB, chikouSpan }
}

// ==================== VWAP ====================

/**
 * VWAP - Volume Weighted Average Price
 * Hacim ağırlıklı ortalama fiyat
 * @param {object[]} data - { high, low, close, volume } dizisi
 * @returns {number[]}
 */
export function calculateVWAP(data) {
  const vwap = []
  let cumulativeTPV = 0 // Typical Price * Volume
  let cumulativeVolume = 0

  for (let i = 0; i < data.length; i++) {
    const typicalPrice = (data[i].high + data[i].low + data[i].close) / 3
    cumulativeTPV += typicalPrice * data[i].volume
    cumulativeVolume += data[i].volume

    if (cumulativeVolume === 0) {
      vwap.push(typicalPrice)
    } else {
      vwap.push(cumulativeTPV / cumulativeVolume)
    }
  }

  return vwap
}

// ==================== OBV ====================

/**
 * OBV - On Balance Volume
 * Hacim hareketleri ile trend analizi
 * @param {number[]} closes - Kapanış fiyatları
 * @param {number[]} volumes - Hacim verileri
 * @returns {number[]}
 */
export function calculateOBV(closes, volumes) {
  const obv = [0]

  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) {
      obv.push(obv[i - 1] + volumes[i])
    } else if (closes[i] < closes[i - 1]) {
      obv.push(obv[i - 1] - volumes[i])
    } else {
      obv.push(obv[i - 1])
    }
  }

  return obv
}

// ==================== ADX (Average Directional Index) ====================

/**
 * ADX - Average Directional Index
 * Trend gücünü ölçer
 * @param {object[]} data - { high, low, close } dizisi
 * @param {number} period - Periyot (varsayılan 14)
 * @returns {object} { adx, pdi, ndi }
 */
export function calculateADX(data, period = 14) {
  const tr = []
  const plusDM = []
  const minusDM = []

  for (let i = 1; i < data.length; i++) {
    const high = data[i].high
    const low = data[i].low
    const prevHigh = data[i - 1].high
    const prevLow = data[i - 1].low
    const prevClose = data[i - 1].close

    // True Range
    tr.push(Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    ))

    // +DM ve -DM
    const upMove = high - prevHigh
    const downMove = prevLow - low

    if (upMove > downMove && upMove > 0) {
      plusDM.push(upMove)
    } else {
      plusDM.push(0)
    }

    if (downMove > upMove && downMove > 0) {
      minusDM.push(downMove)
    } else {
      minusDM.push(0)
    }
  }

  // Smoothed değerler
  const smoothedTR = calculateEMA(tr, period)
  const smoothedPlusDM = calculateEMA(plusDM, period)
  const smoothedMinusDM = calculateEMA(minusDM, period)

  // +DI ve -DI
  const pdi = []
  const ndi = []
  const dx = []

  for (let i = 0; i < smoothedTR.length; i++) {
    if (smoothedTR[i] === null || smoothedTR[i] === 0) {
      pdi.push(null)
      ndi.push(null)
      dx.push(null)
    } else {
      const plusDI = (smoothedPlusDM[i] / smoothedTR[i]) * 100
      const minusDI = (smoothedMinusDM[i] / smoothedTR[i]) * 100
      pdi.push(plusDI)
      ndi.push(minusDI)

      const sumDI = plusDI + minusDI
      if (sumDI === 0) {
        dx.push(0)
      } else {
        dx.push((Math.abs(plusDI - minusDI) / sumDI) * 100)
      }
    }
  }

  // ADX = EMA of DX
  const adx = calculateEMA(dx.filter(v => v !== null), period)

  // Sonuç dizilerini düzenle
  const result = { adx: [], pdi: [null], ndi: [null] }

  let adxIndex = 0
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.adx.push(null)
    } else if (pdi[i - 1] === null) {
      result.adx.push(null)
      result.pdi.push(null)
      result.ndi.push(null)
    } else {
      result.adx.push(adx[adxIndex] || null)
      result.pdi.push(pdi[i - 1])
      result.ndi.push(ndi[i - 1])
      adxIndex++
    }
  }

  return result
}

// ==================== CCI (Commodity Channel Index) ====================

/**
 * CCI - Commodity Channel Index
 * @param {object[]} data - { high, low, close } dizisi
 * @param {number} period - Periyot (varsayılan 20)
 * @returns {number[]}
 */
export function calculateCCI(data, period = 20) {
  const cci = []
  const typicalPrices = data.map(d => (d.high + d.low + d.close) / 3)
  const sma = calculateSMA(typicalPrices, period)

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      cci.push(null)
    } else {
      const tp = typicalPrices[i]
      const mean = sma[i]

      // Mean Deviation hesapla
      const slice = typicalPrices.slice(i - period + 1, i + 1)
      const meanDev = slice.reduce((sum, val) => sum + Math.abs(val - mean), 0) / period

      if (meanDev === 0) {
        cci.push(0)
      } else {
        cci.push((tp - mean) / (0.015 * meanDev))
      }
    }
  }

  return cci
}

// ==================== Williams %R ====================

/**
 * Williams %R
 * @param {object[]} data - { high, low, close } dizisi
 * @param {number} period - Periyot (varsayılan 14)
 * @returns {number[]}
 */
export function calculateWilliamsR(data, period = 14) {
  const result = []

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      const slice = data.slice(i - period + 1, i + 1)
      const highestHigh = Math.max(...slice.map(d => d.high))
      const lowestLow = Math.min(...slice.map(d => d.low))
      const close = data[i].close

      if (highestHigh === lowestLow) {
        result.push(-50)
      } else {
        result.push(((highestHigh - close) / (highestHigh - lowestLow)) * -100)
      }
    }
  }

  return result
}

// ==================== MOMENTUM ====================

/**
 * Momentum
 * @param {number[]} data - Kapanış fiyatları
 * @param {number} period - Periyot (varsayılan 10)
 * @returns {number[]}
 */
export function calculateMomentum(data, period = 10) {
  const result = []

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(null)
    } else {
      result.push(data[i] - data[i - period])
    }
  }

  return result
}

// ==================== ROC (Rate of Change) ====================

/**
 * ROC - Rate of Change
 * @param {number[]} data - Kapanış fiyatları
 * @param {number} period - Periyot (varsayılan 10)
 * @returns {number[]}
 */
export function calculateROC(data, period = 10) {
  const result = []

  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      result.push(null)
    } else {
      const prevPrice = data[i - period]
      if (prevPrice === 0) {
        result.push(0)
      } else {
        result.push(((data[i] - prevPrice) / prevPrice) * 100)
      }
    }
  }

  return result
}

// ==================== YARDIMCI FONKSİYONLAR ====================

/**
 * Fiyat verilerini indikatör hesaplamaları için hazırla
 * @param {object[]} candles - Ham mum verileri
 * @returns {object}
 */
export function prepareData(candles) {
  return {
    opens: candles.map(c => c.open),
    highs: candles.map(c => c.high),
    lows: candles.map(c => c.low),
    closes: candles.map(c => c.close),
    volumes: candles.map(c => c.volume),
    ohlcv: candles.map(c => ({
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume
    }))
  }
}

/**
 * Sinyal üretici - İndikatörlere göre AL/SAT sinyalleri
 * @param {object} indicators - Hesaplanmış indikatörler
 * @param {number} currentIndex - Mevcut indeks
 * @returns {object} { signal, strength, reasons }
 */
export function generateSignal(indicators, currentIndex) {
  const signals = []
  let buyScore = 0
  let sellScore = 0

  const i = currentIndex

  // RSI Sinyalleri
  if (indicators.rsi && indicators.rsi[i] !== null) {
    const rsi = indicators.rsi[i]
    if (rsi < 30) {
      buyScore += 2
      signals.push('RSI aşırı satım bölgesinde')
    } else if (rsi > 70) {
      sellScore += 2
      signals.push('RSI aşırı alım bölgesinde')
    }
  }

  // MACD Sinyalleri
  if (indicators.macd && indicators.macd.macd[i] !== null && indicators.macd.signal[i] !== null) {
    const macd = indicators.macd.macd[i]
    const signal = indicators.macd.signal[i]
    const prevMacd = indicators.macd.macd[i - 1]
    const prevSignal = indicators.macd.signal[i - 1]

    if (prevMacd && prevSignal) {
      if (prevMacd < prevSignal && macd > signal) {
        buyScore += 3
        signals.push('MACD yukarı kesişim')
      } else if (prevMacd > prevSignal && macd < signal) {
        sellScore += 3
        signals.push('MACD aşağı kesişim')
      }
    }
  }

  // Bollinger Bantları Sinyalleri
  if (indicators.bollinger && indicators.bollinger.lower[i] !== null) {
    const close = indicators.closes[i]
    const upper = indicators.bollinger.upper[i]
    const lower = indicators.bollinger.lower[i]

    if (close < lower) {
      buyScore += 2
      signals.push('Fiyat alt Bollinger bandının altında')
    } else if (close > upper) {
      sellScore += 2
      signals.push('Fiyat üst Bollinger bandının üstünde')
    }
  }

  // Stokastik Sinyalleri
  if (indicators.stochastic && indicators.stochastic.k[i] !== null) {
    const k = indicators.stochastic.k[i]
    const d = indicators.stochastic.d[i]

    if (k < 20 && d < 20) {
      buyScore += 1
      signals.push('Stokastik aşırı satım')
    } else if (k > 80 && d > 80) {
      sellScore += 1
      signals.push('Stokastik aşırı alım')
    }
  }

  // EMA Kesişimleri
  if (indicators.ema9 && indicators.ema21 && indicators.ema9[i] !== null && indicators.ema21[i] !== null) {
    const ema9 = indicators.ema9[i]
    const ema21 = indicators.ema21[i]
    const prevEma9 = indicators.ema9[i - 1]
    const prevEma21 = indicators.ema21[i - 1]

    if (prevEma9 && prevEma21) {
      if (prevEma9 < prevEma21 && ema9 > ema21) {
        buyScore += 2
        signals.push('EMA9 EMA21\'i yukarı kesti')
      } else if (prevEma9 > prevEma21 && ema9 < ema21) {
        sellScore += 2
        signals.push('EMA9 EMA21\'i aşağı kesti')
      }
    }
  }

  // Sonuç
  const totalScore = buyScore - sellScore
  let signalType = 'NÖTR'
  let strength = 'Zayıf'

  if (totalScore >= 5) {
    signalType = 'GÜÇLÜ AL'
    strength = 'Güçlü'
  } else if (totalScore >= 2) {
    signalType = 'AL'
    strength = 'Orta'
  } else if (totalScore <= -5) {
    signalType = 'GÜÇLÜ SAT'
    strength = 'Güçlü'
  } else if (totalScore <= -2) {
    signalType = 'SAT'
    strength = 'Orta'
  }

  return {
    signal: signalType,
    strength,
    score: totalScore,
    buyScore,
    sellScore,
    reasons: signals
  }
}

// ==================== TARAMA STRATEJİLERİ ====================

/**
 * Düşeni Kırma Stratejisi
 * Fiyat düşüş trendindeyken yukarı dönüş sinyali
 */
export function detectDuseniKirma(data, closes) {
  const ema20 = calculateEMA(closes, 20)
  const rsi = calculateRSI(closes, 14)
  const lastIdx = closes.length - 1

  if (lastIdx < 20) return null

  // Son 5 günde düşüş trendi vardı mı?
  let wasDowntrend = true
  for (let i = lastIdx - 5; i < lastIdx - 1; i++) {
    if (closes[i] > ema20[i]) {
      wasDowntrend = false
      break
    }
  }

  // Şimdi EMA üstüne çıktı mı?
  const breakout = closes[lastIdx] > ema20[lastIdx] && closes[lastIdx - 1] < ema20[lastIdx - 1]

  // RSI momentum artıyor mu?
  const rsiRising = rsi[lastIdx] > rsi[lastIdx - 1] && rsi[lastIdx] > 40

  if (wasDowntrend && breakout && rsiRising) {
    return {
      type: 'Düşeni Kırma',
      signal: 'AL',
      strength: 'Güçlü',
      price: closes[lastIdx],
      rsi: rsi[lastIdx],
      ema20: ema20[lastIdx]
    }
  }

  return null
}

/**
 * Yükselen Düzeltme Stratejisi
 * Yükseliş trendinde geçici düzeltme sonrası devam sinyali
 */
export function detectYukselenDuzeltme(data, closes) {
  const ema50 = calculateEMA(closes, 50)
  const ema20 = calculateEMA(closes, 20)
  const rsi = calculateRSI(closes, 14)
  const lastIdx = closes.length - 1

  if (lastIdx < 50) return null

  // Genel trend yukarı mı? (EMA50 üstünde)
  const inUptrend = closes[lastIdx] > ema50[lastIdx]

  // Son günlerde düzeltme oldu mu? (EMA20'ye dokundu)
  let correction = false
  for (let i = lastIdx - 3; i <= lastIdx; i++) {
    if (Math.abs(closes[i] - ema20[i]) / ema20[i] < 0.02) {
      correction = true
      break
    }
  }

  // RSI aşırı satım değil ama düşük (40-50 arası ideal)
  const rsiGood = rsi[lastIdx] > 35 && rsi[lastIdx] < 55

  // Bugün yukarı kapanış
  const bullishClose = closes[lastIdx] > closes[lastIdx - 1]

  if (inUptrend && correction && rsiGood && bullishClose) {
    return {
      type: 'Yükselen Düzeltme',
      signal: 'AL',
      strength: 'Orta',
      price: closes[lastIdx],
      rsi: rsi[lastIdx],
      ema20: ema20[lastIdx],
      ema50: ema50[lastIdx]
    }
  }

  return null
}

/**
 * Trend Dibi Stratejisi
 * Uzun süreli düşüşten sonra dip oluşumu
 */
export function detectTrendDibi(data, closes) {
  const rsi = calculateRSI(closes, 14)
  const bollinger = calculateBollingerBands(closes, 20, 2)
  const lastIdx = closes.length - 1

  if (lastIdx < 20) return null

  // RSI aşırı satımda mı?
  const rsiOversold = rsi[lastIdx] < 35

  // Bollinger alt bandına yakın mı?
  const nearLowerBand = closes[lastIdx] <= bollinger.lower[lastIdx] * 1.02

  // Son 3 günde dip oluştu mu? (V formasyonu)
  const vFormation =
    closes[lastIdx - 2] > closes[lastIdx - 1] &&
    closes[lastIdx] > closes[lastIdx - 1]

  if (rsiOversold && nearLowerBand && vFormation) {
    return {
      type: 'Trend Dibi',
      signal: 'AL',
      strength: 'Güçlü',
      price: closes[lastIdx],
      rsi: rsi[lastIdx],
      bollingerLower: bollinger.lower[lastIdx]
    }
  }

  return null
}

/**
 * Trend Zirvesi Stratejisi
 * Uzun süreli yükselişten sonra tepe oluşumu
 */
export function detectTrendZirvesi(data, closes) {
  const rsi = calculateRSI(closes, 14)
  const bollinger = calculateBollingerBands(closes, 20, 2)
  const lastIdx = closes.length - 1

  if (lastIdx < 20) return null

  // RSI aşırı alımda mı?
  const rsiOverbought = rsi[lastIdx] > 70

  // Bollinger üst bandına yakın mı?
  const nearUpperBand = closes[lastIdx] >= bollinger.upper[lastIdx] * 0.98

  // Son 3 günde tepe oluştu mu? (ters V formasyonu)
  const invertedV =
    closes[lastIdx - 2] < closes[lastIdx - 1] &&
    closes[lastIdx] < closes[lastIdx - 1]

  if (rsiOverbought && nearUpperBand && invertedV) {
    return {
      type: 'Trend Zirvesi',
      signal: 'SAT',
      strength: 'Güçlü',
      price: closes[lastIdx],
      rsi: rsi[lastIdx],
      bollingerUpper: bollinger.upper[lastIdx]
    }
  }

  return null
}

/**
 * EMA34 Değen Hisseler
 * EMA34'e dokunan ve tepki veren hisseler
 */
export function detectEMA34Touch(data, closes) {
  const ema34 = calculateEMA(closes, 34)
  const lastIdx = closes.length - 1

  if (lastIdx < 34) return null

  // Son 3 günde EMA34'e dokundu mu?
  let touched = false
  let touchIdx = -1

  for (let i = lastIdx - 2; i <= lastIdx; i++) {
    const diff = Math.abs(data[i].low - ema34[i]) / ema34[i]
    if (diff < 0.01) {
      touched = true
      touchIdx = i
      break
    }
  }

  // Dokundu ve yukarı tepki verdi mi?
  if (touched && closes[lastIdx] > ema34[lastIdx]) {
    return {
      type: 'EMA34 Desteği',
      signal: 'AL',
      strength: 'Orta',
      price: closes[lastIdx],
      ema34: ema34[lastIdx],
      touchPrice: data[touchIdx]?.low
    }
  }

  return null
}

// ==================== GELIŞMIŞ TARAMA STRATEJİLERİ ====================

/**
 * İchimoku Boğa Sinyali
 * Fiyat bulutun üstünde, Tenkan > Kijun, yeşil yükselen bulut
 */
export function detectIchimokuBullish(data, closes) {
  if (data.length < 60) return null

  const ichimoku = calculateIchimoku(data)
  const lastIdx = data.length - 1

  const tenkan = ichimoku.tenkanSen[lastIdx]
  const kijun = ichimoku.kijunSen[lastIdx]
  const spanA = ichimoku.senkouSpanA[lastIdx]
  const spanB = ichimoku.senkouSpanB[lastIdx]
  const close = closes[lastIdx]

  if (!tenkan || !kijun || !spanA || !spanB) return null

  const cloudTop = Math.max(spanA, spanB)
  const aboveCloud = close > cloudTop
  const tkBullish = tenkan > kijun
  const greenCloud = spanA > spanB

  if (aboveCloud && tkBullish && greenCloud) {
    return {
      type: 'İchimoku Boğa',
      signal: 'AL',
      strength: 'Güçlü',
      price: close,
      tenkan,
      kijun,
      spanA,
      spanB,
      cloudTop
    }
  }
  return null
}

/**
 * İchimoku Ayı Sinyali
 * Fiyat bulutun altında, Tenkan < Kijun, kırmızı bulut
 */
export function detectIchimokuBearish(data, closes) {
  if (data.length < 60) return null

  const ichimoku = calculateIchimoku(data)
  const lastIdx = data.length - 1

  const tenkan = ichimoku.tenkanSen[lastIdx]
  const kijun = ichimoku.kijunSen[lastIdx]
  const spanA = ichimoku.senkouSpanA[lastIdx]
  const spanB = ichimoku.senkouSpanB[lastIdx]
  const close = closes[lastIdx]

  if (!tenkan || !kijun || !spanA || !spanB) return null

  const cloudBottom = Math.min(spanA, spanB)
  const belowCloud = close < cloudBottom
  const tkBearish = tenkan < kijun
  const redCloud = spanA < spanB

  if (belowCloud && tkBearish && redCloud) {
    return {
      type: 'İchimoku Ayı',
      signal: 'SAT',
      strength: 'Güçlü',
      price: close,
      tenkan,
      kijun,
      spanA,
      spanB,
      cloudBottom
    }
  }
  return null
}

/**
 * RSI + ADX Güçlü Yükseliş Trendi
 * ADX > 25 (güçlü trend), RSI 40-65 arası, +DI > -DI (yükseliş yönü)
 */
export function detectRSIADXStrong(data, closes) {
  if (data.length < 30) return null

  const rsi = calculateRSI(closes, 14)
  const adxResult = calculateADX(data, 14)
  const lastIdx = closes.length - 1

  const rsiVal = rsi[lastIdx]
  const adxVal = adxResult.adx[lastIdx]
  const pdi = adxResult.pdi[lastIdx]
  const ndi = adxResult.ndi[lastIdx]

  if (!rsiVal || !adxVal || !pdi || !ndi) return null

  const strongTrend = adxVal > 25
  const rsiGood = rsiVal > 40 && rsiVal < 65
  const bullishDI = pdi > ndi
  const rsiRising = rsiVal > (rsi[lastIdx - 1] || 0)

  if (strongTrend && rsiGood && bullishDI && rsiRising) {
    return {
      type: 'RSI+ADX Güçlü',
      signal: 'AL',
      strength: adxVal > 40 ? 'Güçlü' : 'Orta',
      price: closes[lastIdx],
      rsi: rsiVal,
      adx: adxVal,
      pdi,
      ndi
    }
  }
  return null
}

/**
 * Supertrend Alış Sinyali (ATR tabanlı)
 * Son 3 günde bearish'ten bullish'e geçiş
 */
export function detectSupertrendBuy(data, closes) {
  if (data.length < 20) return null

  const period = 10
  const multiplier = 3
  const lastIdx = data.length - 1
  const atr = calculateATR(data, period)

  const upperBand = []
  const lowerBand = []
  const direction = []

  for (let i = 0; i < data.length; i++) {
    if (atr[i] === null) {
      upperBand.push(null)
      lowerBand.push(null)
      direction.push(null)
      continue
    }
    const src = (data[i].high + data[i].low) / 2
    const rawUB = src + multiplier * atr[i]
    const rawLB = src - multiplier * atr[i]
    const prevUB = upperBand[i - 1] ?? rawUB
    const prevLB = lowerBand[i - 1] ?? rawLB
    const prevClose = i > 0 ? closes[i - 1] : closes[0]

    const finalUB = rawUB < prevUB || prevClose > prevUB ? rawUB : prevUB
    const finalLB = rawLB > prevLB || prevClose < prevLB ? rawLB : prevLB
    upperBand.push(finalUB)
    lowerBand.push(finalLB)

    const prevDir = direction[i - 1]
    if (prevDir === null || prevDir === undefined) {
      direction.push(closes[i] >= finalLB ? 1 : -1)
    } else if (prevDir === -1 && closes[i] > prevUB) {
      direction.push(1)
    } else if (prevDir === 1 && closes[i] < prevLB) {
      direction.push(-1)
    } else {
      direction.push(prevDir)
    }
  }

  const currentDir = direction[lastIdx]
  const prevDir1 = direction[lastIdx - 1]
  const prevDir2 = lastIdx >= 2 ? direction[lastIdx - 2] : null

  // Son 3 günde yeni boğa dönüşü
  const justTurnedBullish = currentDir === 1 && (prevDir1 === -1 || prevDir2 === -1)

  if (justTurnedBullish) {
    return {
      type: 'Supertrend Alış',
      signal: 'AL',
      strength: 'Güçlü',
      price: closes[lastIdx],
      supertrendLine: lowerBand[lastIdx],
      freshSignal: true
    }
  }
  return null
}

/**
 * VWAP Üstünde Yüksek Hacimli
 * Fiyat VWAP üstünde + hacim ortalamanın %20 üstünde
 */
export function detectVWAPAbove(data, closes) {
  if (data.length < 20) return null

  const vwap = calculateVWAP(data)
  const lastIdx = data.length - 1
  const close = closes[lastIdx]
  const currentVWAP = vwap[lastIdx]
  const prevVWAP = vwap[lastIdx - 1]

  if (!currentVWAP) return null

  const aboveVWAP = close > currentVWAP
  const avgVolume = data.slice(-20).reduce((sum, d) => sum + d.volume, 0) / 20
  const currentVolume = data[lastIdx].volume
  const highVolume = currentVolume > avgVolume * 1.2
  const crossedAbove = close > currentVWAP && closes[lastIdx - 1] < prevVWAP

  if (aboveVWAP && highVolume) {
    return {
      type: 'VWAP Üstünde',
      signal: crossedAbove ? 'AL' : 'İZLE',
      strength: crossedAbove ? 'Güçlü' : 'Orta',
      price: close,
      vwap: currentVWAP,
      volumeRatio: (currentVolume / avgVolume).toFixed(2)
    }
  }
  return null
}

/**
 * Stokastik Aşırı Satım Çaprazı
 * %K %D'yi aşırı satım bölgesinde (<20) yukarı kestiğinde
 */
export function detectStochOversoldCross(data, closes) {
  if (data.length < 20) return null

  const stoch = calculateStochastic(data, 14, 3)
  const lastIdx = data.length - 1

  const k = stoch.k[lastIdx]
  const d = stoch.d[lastIdx]
  const prevK = stoch.k[lastIdx - 1]
  const prevD = stoch.d[lastIdx - 1]

  if (k === null || d === null || prevK === null || prevD === null) return null

  // Aşırı satım bölgesinde %K %D'yi yukarı kesiyor
  const oversoldCross = prevK < prevD && k > d && k < 30
  // Ya da aşırı satım bölgesinden çıkış
  const exitOversold = prevK < 20 && k > 20

  if (oversoldCross || exitOversold) {
    return {
      type: 'Stokastik Dönüş',
      signal: 'AL',
      strength: oversoldCross ? 'Güçlü' : 'Orta',
      price: closes[lastIdx],
      stochK: k,
      stochD: d
    }
  }
  return null
}

/**
 * Stokastik Aşırı Alım - Satış Sinyali
 * %K %D'yi aşırı alım bölgesinde (>80) aşağı kestiğinde
 */
export function detectStochOverbought(data, closes) {
  if (data.length < 20) return null

  const stoch = calculateStochastic(data, 14, 3)
  const lastIdx = data.length - 1

  const k = stoch.k[lastIdx]
  const d = stoch.d[lastIdx]
  const prevK = stoch.k[lastIdx - 1]
  const prevD = stoch.d[lastIdx - 1]

  if (k === null || d === null || prevK === null || prevD === null) return null

  const overboughtCross = prevK > prevD && k < d && k > 70
  const exitOverbought = prevK > 80 && k < 80

  if (overboughtCross || exitOverbought) {
    return {
      type: 'Stokastik Zirve',
      signal: 'SAT',
      strength: overboughtCross ? 'Güçlü' : 'Orta',
      price: closes[lastIdx],
      stochK: k,
      stochD: d
    }
  }
  return null
}

/**
 * EMA Merdiveni Boğa
 * Fiyat > EMA5 > EMA9 > EMA21 > EMA50 tam sıralama
 */
export function detectEMALadderBull(closes) {
  if (closes.length < 55) return null

  const lastIdx = closes.length - 1
  const ema5 = calculateEMA(closes, 5)
  const ema9 = calculateEMA(closes, 9)
  const ema21 = calculateEMA(closes, 21)
  const ema50 = calculateEMA(closes, 50)

  const e5 = ema5[lastIdx]
  const e9 = ema9[lastIdx]
  const e21 = ema21[lastIdx]
  const e50 = ema50[lastIdx]
  const close = closes[lastIdx]

  if (!e5 || !e9 || !e21 || !e50) return null

  const perfectLadder = close > e5 && e5 > e9 && e9 > e21 && e21 > e50

  if (perfectLadder) {
    return {
      type: 'EMA Merdiveni',
      signal: 'AL',
      strength: 'Orta',
      price: close,
      ema5: e5,
      ema9: e9,
      ema21: e21,
      ema50: e50
    }
  }
  return null
}

/**
 * MACD Ölüm Çaprazı - Satış Sinyali
 * MACD sinyal çizgisini aşağı kesiyor, histogram negatife dönüyor
 */
export function detectMACDBearish(closes) {
  if (closes.length < 35) return null

  const macdResult = calculateMACD(closes)
  const lastIdx = closes.length - 1

  const macd = macdResult.macd[lastIdx]
  const signal = macdResult.signal[lastIdx]
  const prevMacd = macdResult.macd[lastIdx - 1]
  const prevSignal = macdResult.signal[lastIdx - 1]

  if (macd === null || signal === null || prevMacd === null || prevSignal === null) return null

  // MACD sinyal çizgisini aşağı kesti (ölüm çaprazı)
  const deathCross = prevMacd > prevSignal && macd < signal

  // MACD sıfırın altında (düşüş momentum)
  const belowZero = macd < 0

  if (deathCross) {
    return {
      type: 'MACD Ölüm Çaprazı',
      signal: 'SAT',
      strength: belowZero ? 'Güçlü' : 'Orta',
      price: closes[lastIdx],
      macd,
      macdSignal: signal,
      histogram: macd - signal
    }
  }
  return null
}

export default {
  calculateSMA,
  calculateEMA,
  calculateWMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateStochastic,
  calculateATR,
  calculateParabolicSAR,
  calculateIchimoku,
  calculateVWAP,
  calculateOBV,
  calculateADX,
  calculateCCI,
  calculateWilliamsR,
  calculateMomentum,
  calculateROC,
  prepareData,
  generateSignal,
  detectDuseniKirma,
  detectYukselenDuzeltme,
  detectTrendDibi,
  detectTrendZirvesi,
  detectEMA34Touch,
  detectIchimokuBullish,
  detectIchimokuBearish,
  detectRSIADXStrong,
  detectSupertrendBuy,
  detectVWAPAbove,
  detectStochOversoldCross,
  detectStochOverbought,
  detectEMALadderBull,
  detectMACDBearish
}
