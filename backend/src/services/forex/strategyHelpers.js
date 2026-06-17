/**
 * strategyHelpers — Genel Tarama / EMA34 / TEMA34 portları için indikatör
 * yardımcıları. BIST tarayıcılarıyla BİREBİR uyum için EMA "ilk barda seed"
 * (Pine/calcEMASeries) konvansiyonu kullanılır: ema[0]=values[0].
 *
 * (forex/indicators.js'teki ema SMA-seed'lidir ve orijinal gün-içi scorer'da
 *  kullanılır; karıştırma. Buradakiler tarayıcı portları içindir.)
 */

// Pine-style EMA serisi (ilk bar seed) — full array döner
function emaSeries(values, period) {
  if (!values || values.length === 0) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function last(arr) { return arr && arr.length ? arr[arr.length - 1] : null; }

// MACD line + signal line (son ve önceki değerler)
function macdLines(closes, fast = 12, slow = 26, signal = 9) {
  if (!closes || closes.length < slow + signal) return null;
  const ef = emaSeries(closes, fast);
  const es = emaSeries(closes, slow);
  const macdArr = closes.map((_, i) => ef[i] - es[i]);
  const sigArr = emaSeries(macdArr, signal);
  const n = macdArr.length - 1;
  return {
    macd: macdArr[n], signal: sigArr[n],
    macdPrev: macdArr[n - 1], signalPrev: sigArr[n - 1],
    hist: macdArr[n] - sigArr[n],
  };
}

// Wilder ATR serisi (Supertrend için)
function atrSeries(candles, period = 14) {
  if (!candles || candles.length < 2) return [];
  const trs = [0];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const out = new Array(candles.length).fill(null);
  // ilk ATR = ilk period TR ortalaması
  if (candles.length <= period) return out;
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  out[period] = sum / period;
  for (let i = period + 1; i < candles.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + trs[i]) / period;
  }
  return out;
}

// Supertrend (10, 3) → yön dizisi (1 = yukarı, -1 = aşağı)
function supertrend(candles, period = 10, mult = 3) {
  const n = candles.length;
  if (n < period + 2) return [];
  const atr = atrSeries(candles, period);
  const dir = new Array(n).fill(0);
  const finalUpper = new Array(n).fill(0);
  const finalLower = new Array(n).fill(0);
  let started = false;
  for (let i = 0; i < n; i++) {
    if (atr[i] == null) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const bUpper = hl2 + mult * atr[i];
    const bLower = hl2 - mult * atr[i];
    if (!started) {
      finalUpper[i] = bUpper; finalLower[i] = bLower; dir[i] = 1; started = true; continue;
    }
    finalUpper[i] = (bUpper < finalUpper[i - 1] || candles[i - 1].close > finalUpper[i - 1]) ? bUpper : finalUpper[i - 1];
    finalLower[i] = (bLower > finalLower[i - 1] || candles[i - 1].close < finalLower[i - 1]) ? bLower : finalLower[i - 1];
    if (candles[i].close > finalUpper[i - 1]) dir[i] = 1;
    else if (candles[i].close < finalLower[i - 1]) dir[i] = -1;
    else dir[i] = dir[i - 1] || 1;
  }
  return dir;
}

// VWAP (kümülatif). Hacim yoksa null.
function vwap(candles) {
  if (!candles || !candles.length) return null;
  let cumTPV = 0, cumV = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * (c.volume || 0);
    cumV += (c.volume || 0);
  }
  if (cumV <= 0) return null;
  return cumTPV / cumV;
}

// ADX + yön indikatörleri (Wilder). { adx, pdi, ndi } son değerler.
function adxFull(candles, period = 14) {
  if (!candles || candles.length < period * 2 + 1) return null;
  const trs = [], plusDMs = [], minusDMs = [];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDMs.push((up > down && up > 0) ? up : 0);
    minusDMs.push((down > up && down > 0) ? down : 0);
    trs.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    ));
  }
  let smTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let smP = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let smM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  const dxs = [];
  let lastPdi = 0, lastNdi = 0;
  for (let i = period; i < trs.length; i++) {
    smTR = smTR - smTR / period + trs[i];
    smP = smP - smP / period + plusDMs[i];
    smM = smM - smM / period + minusDMs[i];
    const pdi = smTR === 0 ? 0 : (smP / smTR) * 100;
    const ndi = smTR === 0 ? 0 : (smM / smTR) * 100;
    lastPdi = pdi; lastNdi = ndi;
    const sum = pdi + ndi;
    dxs.push(sum === 0 ? 0 : (Math.abs(pdi - ndi) / sum) * 100);
  }
  if (dxs.length < period) return null;
  let adx = dxs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxs.length; i++) adx = (adx * (period - 1) + dxs[i]) / period;
  return { adx: +adx.toFixed(1), pdi: +lastPdi.toFixed(1), ndi: +lastNdi.toFixed(1) };
}

module.exports = { emaSeries, macdLines, supertrend, vwap, adxFull, atrSeries, last };
