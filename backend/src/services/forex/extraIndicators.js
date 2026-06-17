/**
 * Ek teknik indikatörler — forex çoklu-strateji motoru.
 *
 * Standart formüller (Ichimoku 9/26/52, Bollinger 20/2, Stochastic 14/3,
 * CCI 20, Williams %R 14, ROC, OBV, PSAR). Temel ema/rsi/macd/adx/atr/sma
 * indicators.js'te. Tümü close/HLC dizileri veya mum dizisi alır; son değeri
 * (ve gerektiğinde önceki değeri) döndürür. Yetersiz veri → null.
 */

function sma(values, period) {
  if (!values || values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function stddev(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  const m = slice.reduce((a, b) => a + b, 0) / period;
  const v = slice.reduce((a, b) => a + (b - m) * (b - m), 0) / period;
  return Math.sqrt(v);
}

// Bollinger Bands (20, 2σ) → { mid, upper, lower, pctB, bandwidth }
function bollinger(closes, period = 20, mult = 2) {
  if (!closes || closes.length < period) return null;
  const mid = sma(closes, period);
  const sd = stddev(closes, period);
  if (mid == null || sd == null) return null;
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const last = closes[closes.length - 1];
  const pctB = upper === lower ? 0.5 : (last - lower) / (upper - lower);
  return { mid, upper, lower, pctB: +pctB.toFixed(4), bandwidth: +((upper - lower) / mid).toFixed(5) };
}

// Stochastic (14, 3, 3) → { k, d }
function stochastic(candles, kPeriod = 14, dPeriod = 3) {
  if (!candles || candles.length < kPeriod + dPeriod) return null;
  const ks = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    const win = candles.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...win.map(c => c.high));
    const ll = Math.min(...win.map(c => c.low));
    const c = candles[i].close;
    ks.push(hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100);
  }
  if (ks.length < dPeriod) return null;
  const k = ks[ks.length - 1];
  const d = ks.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
  const kPrev = ks.length >= 2 ? ks[ks.length - 2] : null;
  return { k: +k.toFixed(2), d: +d.toFixed(2), kPrev: kPrev == null ? null : +kPrev.toFixed(2) };
}

// Ichimoku (9/26/52) — current tenkan/kijun + cloud (senkouA/B kaydırılmış)
function ichimoku(candles, conv = 9, base = 26, spanB = 52) {
  if (!candles || candles.length < spanB + base) return null;
  const hl = (period, endIdx) => {
    const win = candles.slice(endIdx - period + 1, endIdx + 1);
    return (Math.max(...win.map(c => c.high)) + Math.min(...win.map(c => c.low))) / 2;
  };
  const n = candles.length - 1;
  const tenkan = hl(conv, n);
  const kijun = hl(base, n);
  // Bulut bugünkü fiyatın altında/üstünde mi: senkou A/B 26 bar önce hesaplanıp öne kaydırılır
  const past = n - base;
  const senkouA = (hl(conv, past) + hl(base, past)) / 2;
  const senkouB = hl(spanB, past);
  const close = candles[n].close;
  return {
    tenkan, kijun, senkouA, senkouB,
    cloudTop: Math.max(senkouA, senkouB),
    cloudBottom: Math.min(senkouA, senkouB),
    aboveCloud: close > Math.max(senkouA, senkouB),
    belowCloud: close < Math.min(senkouA, senkouB),
    tkBull: tenkan > kijun,
  };
}

// CCI (20)
function cci(candles, period = 20) {
  if (!candles || candles.length < period) return null;
  const tps = candles.map(c => (c.high + c.low + c.close) / 3);
  const slice = tps.slice(-period);
  const m = slice.reduce((a, b) => a + b, 0) / period;
  const meanDev = slice.reduce((a, b) => a + Math.abs(b - m), 0) / period;
  if (meanDev === 0) return 0;
  return +(((tps[tps.length - 1] - m) / (0.015 * meanDev))).toFixed(2);
}

// Williams %R (14)
function williamsR(candles, period = 14) {
  if (!candles || candles.length < period) return null;
  const win = candles.slice(-period);
  const hh = Math.max(...win.map(c => c.high));
  const ll = Math.min(...win.map(c => c.low));
  const c = candles[candles.length - 1].close;
  if (hh === ll) return -50;
  return +(((hh - c) / (hh - ll)) * -100).toFixed(2);
}

// Rate of Change (%)
function roc(closes, period = 12) {
  if (!closes || closes.length < period + 1) return null;
  const prev = closes[closes.length - 1 - period];
  if (!prev) return null;
  return +(((closes[closes.length - 1] - prev) / prev) * 100).toFixed(3);
}

// On-Balance Volume (yön + son değer)
function obv(candles) {
  if (!candles || candles.length < 2) return null;
  let v = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) v += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) v -= candles[i].volume;
  }
  return v;
}

module.exports = { sma, stddev, bollinger, stochastic, ichimoku, cci, williamsR, roc, obv };
