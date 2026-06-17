/**
 * Teknik indikatörler — forex/parite motoru için.
 *
 * cryptoSignalsService içindeki kanıtlanmış uygulamaların birebir kopyası
 * (ema/rsi/macdHistogram/adx/atr/sma + rsiRecentMax). Forex motoru kendi
 * içinde kapalı kalsın diye paylaşımlı modüle bağlanmadı (indikatör
 * konsolidasyonu ayrı bir iş; bkz. proje notları).
 */

function ema(values, period) {
  if (!values || values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values, period = 14) {
  if (!values || values.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

function rsiRecentMax(values, lookback = 10, period = 14) {
  if (!values || values.length < period + lookback) return null;
  let max = -Infinity;
  for (let i = 0; i < lookback; i++) {
    const slice = values.slice(0, values.length - i);
    const r = rsi(slice, period);
    if (r != null && r > max) max = r;
  }
  return max === -Infinity ? null : +max.toFixed(2);
}

function rsiRecentMin(values, lookback = 10, period = 14) {
  if (!values || values.length < period + lookback) return null;
  let min = Infinity;
  for (let i = 0; i < lookback; i++) {
    const slice = values.slice(0, values.length - i);
    const r = rsi(slice, period);
    if (r != null && r < min) min = r;
  }
  return min === Infinity ? null : +min.toFixed(2);
}

function macdHistogram(values, fast = 12, slow = 26, signal = 9) {
  if (!values || values.length < slow + signal) return { hist: null, prev: null };
  const k_fast = 2 / (fast + 1), k_slow = 2 / (slow + 1), k_sig = 2 / (signal + 1);
  let emaFast = values.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  let emaSlow = values.slice(0, slow).reduce((a, b) => a + b, 0) / slow;
  for (let i = fast; i < slow; i++) emaFast = values[i] * k_fast + emaFast * (1 - k_fast);
  const macdSeries = [];
  for (let i = slow; i < values.length; i++) {
    emaFast = values[i] * k_fast + emaFast * (1 - k_fast);
    emaSlow = values[i] * k_slow + emaSlow * (1 - k_slow);
    macdSeries.push(emaFast - emaSlow);
  }
  if (macdSeries.length < signal) return { hist: null, prev: null };
  let sig = macdSeries.slice(0, signal).reduce((a, b) => a + b, 0) / signal;
  const hists = [];
  for (let i = signal; i < macdSeries.length; i++) {
    sig = macdSeries[i] * k_sig + sig * (1 - k_sig);
    hists.push(macdSeries[i] - sig);
  }
  if (hists.length === 0) return { hist: null, prev: null };
  return {
    hist: +hists[hists.length - 1].toFixed(6),
    prev: hists.length >= 2 ? +hists[hists.length - 2].toFixed(6) : null,
  };
}

function adx(candles, period = 14) {
  if (!candles || candles.length < period * 2 + 1) return null;
  const trs = [], plusDMs = [], minusDMs = [];
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDMs.push((upMove > downMove && upMove > 0) ? upMove : 0);
    minusDMs.push((downMove > upMove && downMove > 0) ? downMove : 0);
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    ));
  }
  let smTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let smPlusDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smMinusDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  const dxs = [];
  for (let i = period; i < trs.length; i++) {
    smTR = smTR - (smTR / period) + trs[i];
    smPlusDM = smPlusDM - (smPlusDM / period) + plusDMs[i];
    smMinusDM = smMinusDM - (smMinusDM / period) + minusDMs[i];
    if (smTR === 0) { dxs.push(0); continue; }
    const plusDI = (smPlusDM / smTR) * 100;
    const minusDI = (smMinusDM / smTR) * 100;
    const sumDI = plusDI + minusDI;
    dxs.push(sumDI === 0 ? 0 : (Math.abs(plusDI - minusDI) / sumDI) * 100);
  }
  if (dxs.length < period) return null;
  let adxVal = dxs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxs.length; i++) {
    adxVal = (adxVal * (period - 1) + dxs[i]) / period;
  }
  return +adxVal.toFixed(1);
}

function atr(candles, period = 14) {
  if (!candles || candles.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function sma(values, period) {
  if (!values || values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

module.exports = { ema, rsi, rsiRecentMax, rsiRecentMin, macdHistogram, adx, atr, sma };
