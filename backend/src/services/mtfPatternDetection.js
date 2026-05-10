/**
 * MTF Pattern Detection — Borsa Krali
 *
 * Çoklu zaman dilimi sinyal motoru için matematik + örüntü katmanı.
 * Üç ana modül:
 *
 *   1) CANDLESTICK PATTERN — engulfing, hammer, shooting star, doji, harami,
 *      pin bar (TA-Lib eşdeğeri saf JS).
 *   2) DIVERGENCE — fiyat/RSI ve fiyat/MACD arası regular & hidden divergence.
 *   3) VOLATILITY REGIME — ATR-band tabanlı low/normal/high sınıflama.
 *
 * Skorlama motoruna +1/0 input verir; hiçbir karar tek başına buradan çıkmaz.
 * Tüm fonksiyonlar saf (side-effect yok), test edilebilir.
 */

// ───────────────────────────────────────────────────────────────────────────
// CANDLESTICK PATTERNS
// ───────────────────────────────────────────────────────────────────────────

function bodySize(c)  { return Math.abs(c.close - c.open); }
function totalRange(c){ return c.high - c.low; }
function upperWick(c) { return c.high - Math.max(c.open, c.close); }
function lowerWick(c) { return Math.min(c.open, c.close) - c.low; }
function isBull(c)    { return c.close > c.open; }
function isBear(c)    { return c.close < c.open; }

/**
 * Engulfing — son iki mum, bir öncekinin gövdesini tamamen kapsıyor.
 *   bullish: bear → bull, current.body > prev.body, current.close > prev.open, current.open < prev.close
 *   bearish: bull → bear, ters
 */
function detectEngulfing(candles) {
  if (!candles || candles.length < 2) return null;
  const prev = candles[candles.length - 2];
  const curr = candles[candles.length - 1];
  if (!prev || !curr) return null;

  const prevBody = bodySize(prev);
  const currBody = bodySize(curr);
  if (currBody < prevBody * 1.05) return null; // gövde daha büyük olmalı (~%5)

  if (isBear(prev) && isBull(curr) &&
      curr.close > prev.open && curr.open < prev.close) {
    return { type: 'bullish_engulfing', strength: +(currBody / prevBody).toFixed(2) };
  }
  if (isBull(prev) && isBear(curr) &&
      curr.close < prev.open && curr.open > prev.close) {
    return { type: 'bearish_engulfing', strength: +(currBody / prevBody).toFixed(2) };
  }
  return null;
}

/**
 * Hammer / Shooting Star (pin bar)
 *   hammer:        küçük gövde, uzun alt fitil (≥2× gövde), kısa üst fitil
 *   shooting star: küçük gövde, uzun üst fitil (≥2× gövde), kısa alt fitil
 */
function detectPinBar(candles) {
  if (!candles || candles.length < 1) return null;
  const c = candles[candles.length - 1];
  const body = bodySize(c);
  const range = totalRange(c);
  if (range === 0 || body / range > 0.35) return null; // gövde aşırı büyükse pin değil

  const upper = upperWick(c);
  const lower = lowerWick(c);

  if (lower >= body * 2 && lower >= upper * 2.5) {
    return { type: 'hammer', wickRatio: +(lower / Math.max(body, range * 0.01)).toFixed(2) };
  }
  if (upper >= body * 2 && upper >= lower * 2.5) {
    return { type: 'shooting_star', wickRatio: +(upper / Math.max(body, range * 0.01)).toFixed(2) };
  }
  return null;
}

/**
 * Doji — open ≈ close, gövde range'in %10'undan küçük. Kararsızlık göstergesi.
 */
function detectDoji(candles) {
  if (!candles || candles.length < 1) return null;
  const c = candles[candles.length - 1];
  const range = totalRange(c);
  if (range === 0) return null;
  const ratio = bodySize(c) / range;
  if (ratio > 0.10) return null;
  // Long-legged doji: hem üst hem alt fitil ≥ %35 of range
  const upperPct = upperWick(c) / range;
  const lowerPct = lowerWick(c) / range;
  if (upperPct > 0.35 && lowerPct > 0.35) {
    return { type: 'long_legged_doji', bodyRatio: +ratio.toFixed(3) };
  }
  return { type: 'doji', bodyRatio: +ratio.toFixed(3) };
}

/**
 * Harami — son mum, bir öncekinin gövdesi içinde kalan küçük mum.
 *   bullish: bear ana mum → bull küçük mum (gövdesi prev.open ile prev.close arasında)
 *   bearish: bull ana mum → bear küçük mum
 */
function detectHarami(candles) {
  if (!candles || candles.length < 2) return null;
  const prev = candles[candles.length - 2];
  const curr = candles[candles.length - 1];
  if (bodySize(curr) > bodySize(prev) * 0.6) return null; // küçük olmalı

  const inside =
    Math.max(curr.open, curr.close) <= Math.max(prev.open, prev.close) &&
    Math.min(curr.open, curr.close) >= Math.min(prev.open, prev.close);
  if (!inside) return null;

  if (isBear(prev) && isBull(curr)) return { type: 'bullish_harami' };
  if (isBull(prev) && isBear(curr)) return { type: 'bearish_harami' };
  return null;
}

function detectAllPatterns(candles) {
  return {
    engulfing: detectEngulfing(candles),
    pinBar:    detectPinBar(candles),
    doji:      detectDoji(candles),
    harami:    detectHarami(candles),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// DIVERGENCE — RSI / MACD vs PRICE
// ───────────────────────────────────────────────────────────────────────────

/**
 * Regular Bullish Divergence:  fiyat lower-low, indikatör higher-low → trend bitiyor (long)
 * Regular Bearish Divergence:  fiyat higher-high, indikatör lower-high → trend bitiyor (short)
 * Hidden Bullish:              fiyat higher-low, indikatör lower-low → trend devam (long pullback)
 * Hidden Bearish:              fiyat lower-high, indikatör higher-high → trend devam (short pullback)
 */

// Son N barda lokal swing'leri bul (3-bar pivot mantığı)
function findSwingPoints(values, lookback = 30) {
  const n = values.length;
  if (n < 7) return { lows: [], highs: [] };
  const start = Math.max(2, n - lookback);
  const lows = [], highs = [];
  for (let i = start; i < n - 2; i++) {
    if (values[i] < values[i - 1] && values[i] < values[i - 2] &&
        values[i] < values[i + 1] && values[i] < values[i + 2]) {
      lows.push({ index: i, value: values[i] });
    }
    if (values[i] > values[i - 1] && values[i] > values[i - 2] &&
        values[i] > values[i + 1] && values[i] > values[i + 2]) {
      highs.push({ index: i, value: values[i] });
    }
  }
  return { lows, highs };
}

function detectDivergence(prices, indicator, lookback = 30) {
  if (!prices || !indicator) return null;
  if (prices.length !== indicator.length) return null;
  if (prices.length < 10) return null;

  const pricePoints = findSwingPoints(prices, lookback);
  const indPoints   = findSwingPoints(indicator, lookback);

  // En son iki pivot'u eşleştir
  const matchPair = (priceList, indList) => {
    if (priceList.length < 2 || indList.length < 2) return null;
    const p1 = priceList[priceList.length - 2];
    const p2 = priceList[priceList.length - 1];
    // İndikatörde zaman olarak yakın (±3 bar) iki pivot bul
    const findNear = (idx) => indList.find(p => Math.abs(p.index - idx) <= 3);
    const i1 = findNear(p1.index);
    const i2 = findNear(p2.index);
    if (!i1 || !i2) return null;
    return { p1, p2, i1, i2 };
  };

  const lowMatch  = matchPair(pricePoints.lows, indPoints.lows);
  const highMatch = matchPair(pricePoints.highs, indPoints.highs);

  // Bullish regular: price lower-low + ind higher-low
  if (lowMatch && lowMatch.p2.value < lowMatch.p1.value && lowMatch.i2.value > lowMatch.i1.value) {
    return { type: 'regular_bullish', priceDelta: +(lowMatch.p2.value - lowMatch.p1.value).toFixed(4), indDelta: +(lowMatch.i2.value - lowMatch.i1.value).toFixed(2) };
  }
  // Bearish regular: price higher-high + ind lower-high
  if (highMatch && highMatch.p2.value > highMatch.p1.value && highMatch.i2.value < highMatch.i1.value) {
    return { type: 'regular_bearish', priceDelta: +(highMatch.p2.value - highMatch.p1.value).toFixed(4), indDelta: +(highMatch.i2.value - highMatch.i1.value).toFixed(2) };
  }
  // Hidden bullish: price higher-low + ind lower-low  (uptrend pullback)
  if (lowMatch && lowMatch.p2.value > lowMatch.p1.value && lowMatch.i2.value < lowMatch.i1.value) {
    return { type: 'hidden_bullish' };
  }
  // Hidden bearish: price lower-high + ind higher-high  (downtrend pullback)
  if (highMatch && highMatch.p2.value < highMatch.p1.value && highMatch.i2.value > highMatch.i1.value) {
    return { type: 'hidden_bearish' };
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// VOLATILITY REGIME — ATR / Price tabanlı low/normal/high
// ───────────────────────────────────────────────────────────────────────────

/**
 * ATR%-based regime:
 *   - low:    ATR/price < mean - 1σ
 *   - high:   ATR/price > mean + 1σ
 *   - normal: aralarda
 *
 * Yüksek volatilitede stop daha geniş, normal/low'da indikatör daha güvenilir.
 */
function detectVolatilityRegime(candles, atrPeriod = 14, lookback = 60) {
  if (!candles || candles.length < atrPeriod + 5) return { regime: 'unknown', atrPct: 0 };

  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (trueRanges.length < atrPeriod) return { regime: 'unknown', atrPct: 0 };

  // ATR serisini oluştur
  const atrSeries = [];
  let atrSma = trueRanges.slice(0, atrPeriod).reduce((a, b) => a + b, 0) / atrPeriod;
  atrSeries.push(atrSma);
  for (let i = atrPeriod; i < trueRanges.length; i++) {
    atrSma = (atrSma * (atrPeriod - 1) + trueRanges[i]) / atrPeriod;
    atrSeries.push(atrSma);
  }

  // ATR%-serisi
  const atrPctSeries = [];
  for (let i = 0; i < atrSeries.length; i++) {
    const candleIdx = i + atrPeriod;
    if (candleIdx >= candles.length) break;
    const price = candles[candleIdx].close;
    if (price > 0) atrPctSeries.push(atrSeries[i] / price);
  }
  if (atrPctSeries.length < 5) return { regime: 'unknown', atrPct: 0 };

  const recent = atrPctSeries.slice(-Math.min(lookback, atrPctSeries.length));
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length;
  const std = Math.sqrt(variance);
  const last = atrPctSeries[atrPctSeries.length - 1];

  let regime = 'normal';
  if (last < mean - std)      regime = 'low';
  else if (last > mean + std) regime = 'high';

  return {
    regime,
    atrPct: +(last * 100).toFixed(3),
    meanAtrPct: +(mean * 100).toFixed(3),
    stdAtrPct:  +(std * 100).toFixed(3),
    zScore: std > 0 ? +((last - mean) / std).toFixed(2) : 0,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// MOMENTUM ACCELERATION — MACD histogram'ın 2. türevi
// ───────────────────────────────────────────────────────────────────────────

/**
 * MACD histogram bir momentum göstergesi; ardışık üç bar artıyorsa "acceleration"
 * (long lehine), azalıyorsa "deceleration".
 */
function detectMomentumAcceleration(macdHistSeries) {
  if (!macdHistSeries || macdHistSeries.length < 3) return null;
  const n = macdHistSeries.length;
  const a = macdHistSeries[n - 3];
  const b = macdHistSeries[n - 2];
  const c = macdHistSeries[n - 1];

  const d1 = b - a;
  const d2 = c - b;
  const accel = d2 - d1;

  if (c > 0 && d1 > 0 && d2 > 0 && accel > 0) {
    return { type: 'bullish_acceleration', accel: +accel.toFixed(4) };
  }
  if (c > 0 && d1 < 0 && d2 < 0) {
    return { type: 'bullish_decay', accel: +accel.toFixed(4) };
  }
  if (c < 0 && d1 < 0 && d2 < 0 && accel < 0) {
    return { type: 'bearish_acceleration', accel: +accel.toFixed(4) };
  }
  if (c < 0 && d1 > 0 && d2 > 0) {
    return { type: 'bearish_decay', accel: +accel.toFixed(4) };
  }
  return null;
}

module.exports = {
  detectEngulfing,
  detectPinBar,
  detectDoji,
  detectHarami,
  detectAllPatterns,
  findSwingPoints,
  detectDivergence,
  detectVolatilityRegime,
  detectMomentumAcceleration,
};
