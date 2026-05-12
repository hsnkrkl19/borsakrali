/**
 * Trading Bot — Indicators (series form, look-ahead-bias-free)
 *
 * Her indikatör, candle dizisiyle aynı uzunlukta bir seri döner. Warm-up
 * sırasındaki barlar `null` olur. Strateji `series[i]` okuduğunda yalnız
 * `candles[0..i]`'dan türetilmiş değeri görür — geleceğe sızıntı yok.
 *
 * candle = { time, open, high, low, close, volume }
 */

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let e = 0;
  for (let i = 0; i < period; i++) e += values[i];
  e /= period;
  out[period - 1] = e;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function macd(values, fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  );
  const validIdx = macdLine.findIndex(v => v != null);
  const signalSrc = validIdx === -1 ? [] : macdLine.slice(validIdx).filter(v => v != null);
  const signalEma = ema(signalSrc, signal);
  const signalLine = new Array(values.length).fill(null);
  for (let i = 0; i < signalEma.length; i++) {
    if (signalEma[i] != null) signalLine[validIdx + i] = signalEma[i];
  }
  const hist = macdLine.map((v, i) =>
    v != null && signalLine[i] != null ? v - signalLine[i] : null
  );
  return { macd: macdLine, signal: signalLine, hist };
}

function trueRange(candles) {
  const out = [0];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    out.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return out;
}

function atr(candles, period = 14) {
  const tr = trueRange(candles);
  const out = new Array(candles.length).fill(null);
  if (candles.length < period + 1) return out;
  let a = 0;
  for (let i = 1; i <= period; i++) a += tr[i];
  a /= period;
  out[period] = a;
  for (let i = period + 1; i < candles.length; i++) {
    a = (a * (period - 1) + tr[i]) / period;
    out[i] = a;
  }
  return out;
}

function bollingerBands(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    if (mid[i] == null) continue;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j] - mid[i];
      sumSq += d * d;
    }
    const sd = Math.sqrt(sumSq / period);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { upper, mid, lower };
}

function supertrend(candles, period = 10, mult = 3) {
  const atrSeries = atr(candles, period);
  const upper = new Array(candles.length).fill(null);
  const lower = new Array(candles.length).fill(null);
  const trend = new Array(candles.length).fill(null);
  const value = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    if (atrSeries[i] == null) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const basicU = hl2 + mult * atrSeries[i];
    const basicL = hl2 - mult * atrSeries[i];
    const prevU = upper[i - 1];
    const prevL = lower[i - 1];
    upper[i] = prevU == null || basicU < prevU || candles[i - 1].close > prevU ? basicU : prevU;
    lower[i] = prevL == null || basicL > prevL || candles[i - 1].close < prevL ? basicL : prevL;
    const prevTrend = trend[i - 1];
    if (prevTrend === 1 && candles[i].close < lower[i]) trend[i] = -1;
    else if (prevTrend === -1 && candles[i].close > upper[i]) trend[i] = 1;
    else trend[i] = prevTrend || (candles[i].close > hl2 ? 1 : -1);
    value[i] = trend[i] === 1 ? lower[i] : upper[i];
  }
  return { trend, value, upper, lower };
}

function stochastic(candles, kPeriod = 14, dPeriod = 3, smooth = 3) {
  const kRaw = new Array(candles.length).fill(null);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    kRaw[i] = range === 0 ? 50 : ((candles[i].close - ll) / range) * 100;
  }
  const kVals = kRaw.filter(v => v != null);
  const kSmoothed = sma(kVals, smooth);
  const kStart = kRaw.findIndex(v => v != null);
  const k = new Array(candles.length).fill(null);
  for (let i = 0; i < kSmoothed.length; i++) {
    if (kSmoothed[i] != null) k[kStart + i] = kSmoothed[i];
  }
  const kFiltered = k.filter(v => v != null);
  const dSmoothed = sma(kFiltered, dPeriod);
  const dStart = k.findIndex(v => v != null);
  const d = new Array(candles.length).fill(null);
  for (let i = 0; i < dSmoothed.length; i++) {
    if (dSmoothed[i] != null) d[dStart + i] = dSmoothed[i];
  }
  return { k, d };
}

function adx(candles, period = 14) {
  const len = candles.length;
  const tr = trueRange(candles);
  const plusDM = new Array(len).fill(0);
  const minusDM = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const out = new Array(len).fill(null);
  if (len < period * 2 + 1) return out;
  let smTR = 0, smPDM = 0, smMDM = 0;
  for (let i = 1; i <= period; i++) {
    smTR += tr[i]; smPDM += plusDM[i]; smMDM += minusDM[i];
  }
  const dxSeries = [];
  let firstDxIdx = -1;
  for (let i = period + 1; i < len; i++) {
    smTR = smTR - smTR / period + tr[i];
    smPDM = smPDM - smPDM / period + plusDM[i];
    smMDM = smMDM - smMDM / period + minusDM[i];
    const pDI = smTR === 0 ? 0 : (smPDM / smTR) * 100;
    const mDI = smTR === 0 ? 0 : (smMDM / smTR) * 100;
    const sum = pDI + mDI;
    const dx = sum === 0 ? 0 : (Math.abs(pDI - mDI) / sum) * 100;
    dxSeries.push(dx);
    if (firstDxIdx === -1) firstDxIdx = i;
  }
  if (dxSeries.length < period) return out;
  let adxVal = dxSeries.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[firstDxIdx + period - 1] = adxVal;
  for (let i = period; i < dxSeries.length; i++) {
    adxVal = (adxVal * (period - 1) + dxSeries[i]) / period;
    out[firstDxIdx + i] = adxVal;
  }
  return out;
}

function volumeAvg(candles, period = 20) {
  return sma(candles.map(c => c.volume || 0), period);
}

function highest(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let h = -Infinity;
    for (let j = i - period + 1; j <= i; j++) if (values[j] > h) h = values[j];
    out[i] = h;
  }
  return out;
}

function lowest(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let l = Infinity;
    for (let j = i - period + 1; j <= i; j++) if (values[j] < l) l = values[j];
    out[i] = l;
  }
  return out;
}

function crossOver(a, b, i) {
  if (i < 1) return false;
  const aPrev = a[i - 1], bPrev = b[i - 1], aNow = a[i], bNow = b[i];
  if (aPrev == null || bPrev == null || aNow == null || bNow == null) return false;
  return aPrev <= bPrev && aNow > bNow;
}

function crossUnder(a, b, i) {
  if (i < 1) return false;
  const aPrev = a[i - 1], bPrev = b[i - 1], aNow = a[i], bNow = b[i];
  if (aPrev == null || bPrev == null || aNow == null || bNow == null) return false;
  return aPrev >= bPrev && aNow < bNow;
}

module.exports = {
  sma, ema, rsi, macd, atr, bollingerBands, supertrend,
  stochastic, adx, volumeAvg, highest, lowest,
  crossOver, crossUnder, trueRange,
};
