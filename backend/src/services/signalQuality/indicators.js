/**
 * signalQuality/indicators.js
 * ---------------------------------------------------------------------------
 * BAĞIMSIZ, saf (yan etkisiz) teknik gösterge çekirdeği.
 *
 * Amaç: Ortak kalite katmanının (rejim filtresi, konfluans, kalibrasyon)
 * hiçbir dış bağımlılığa ve mevcut motorların indikatör uygulamalarına
 * ihtiyaç duymadan, TEK ve TEST EDİLEBİLİR bir kaynaktan beslenmesi.
 *
 * Tüm fonksiyonlar `candles` olarak { high, low, close } dizisi bekler
 * (kronolojik: en yeni EN SON). Girdi mutasyona uğratılmaz.
 *
 * Konvansiyon: her seri, girdiyle AYNI uzunlukta bir dizi döndürür;
 * hesaplanamayan (ısınma/warmup) noktalar `null`'dır. Böylece indeks hizası
 * çağıran tarafta korunur.
 */

'use strict';

function num(x) {
  const v = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(v) ? v : null;
}

function mean(arr) {
  const xs = arr.filter((v) => Number.isFinite(v));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(arr, sample = true) {
  const xs = arr.filter((v) => Number.isFinite(v));
  const n = xs.length;
  if (n < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const ss = xs.reduce((a, b) => a + (b - m) * (b - m), 0);
  return Math.sqrt(ss / (sample ? n - 1 : n));
}

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Üstel hareketli ortalama. İlk `period` bar SMA ile seed edilir. */
function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function trueRange(cur, prevClose) {
  const hl = cur.high - cur.low;
  const hc = Math.abs(cur.high - prevClose);
  const lc = Math.abs(cur.low - prevClose);
  return Math.max(hl, hc, lc);
}

/** True Range serisi (index 0 = high-low). */
function trSeries(candles) {
  const n = candles.length;
  const tr = new Array(n).fill(0);
  if (!n) return tr;
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) tr[i] = trueRange(candles[i], candles[i - 1].close);
  return tr;
}

/** Wilder ATR. `period` kadar TR ortalamasıyla seed, sonra Wilder yumuşatma. */
function atr(candles, period = 14) {
  const n = candles.length;
  const out = new Array(n).fill(null);
  if (n < period + 1) return out;
  const tr = trSeries(candles);
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < n; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/**
 * Wilder ADX / +DI / -DI.
 * ADX ilk değeri index (2*period - 1)'de oluşur.
 */
function adx(candles, period = 14) {
  const n = candles.length;
  const out = {
    adx: new Array(n).fill(null),
    plusDI: new Array(n).fill(null),
    minusDI: new Array(n).fill(null),
  };
  if (n < 2 * period + 1) return out;

  const tr = new Array(n).fill(0);
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = trueRange(candles[i], candles[i - 1].close);
  }

  let trS = 0;
  let plusS = 0;
  let minusS = 0;
  for (let i = 1; i <= period; i++) {
    trS += tr[i];
    plusS += plusDM[i];
    minusS += minusDM[i];
  }

  const dxBuf = [];
  const emitDI = (idx) => {
    const pDI = trS > 0 ? 100 * (plusS / trS) : 0;
    const mDI = trS > 0 ? 100 * (minusS / trS) : 0;
    out.plusDI[idx] = pDI;
    out.minusDI[idx] = mDI;
    const denom = pDI + mDI;
    const dx = denom > 0 ? (100 * Math.abs(pDI - mDI)) / denom : 0;
    dxBuf.push(dx);
    return dx;
  };

  emitDI(period);
  for (let i = period + 1; i < n; i++) {
    trS = trS - trS / period + tr[i];
    plusS = plusS - plusS / period + plusDM[i];
    minusS = minusS - minusS / period + minusDM[i];
    const dx = emitDI(i);
    if (dxBuf.length === period) {
      out.adx[i] = mean(dxBuf);
    } else if (dxBuf.length > period) {
      out.adx[i] = (out.adx[i - 1] * (period - 1) + dx) / period;
    }
  }
  return out;
}

/**
 * Choppiness Index (0..100). ~100 => yatay/choppy, ~0 => güçlü trend.
 * CI = 100 * log10( ΣTR(n) / (maxHigh_n - minLow_n) ) / log10(n)
 */
function choppiness(candles, period = 14) {
  const n = candles.length;
  const out = new Array(n).fill(null);
  if (n < period + 1) return out;
  const tr = trSeries(candles);
  const logP = Math.log10(period);
  for (let i = period; i < n; i++) {
    let sumTR = 0;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      sumTR += tr[j];
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    out[i] = range > 0 ? (100 * Math.log10(sumTR / range)) / logP : null;
  }
  return out;
}

function lastNonNull(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null && Number.isFinite(arr[i])) return arr[i];
  }
  return null;
}

module.exports = {
  num,
  mean,
  stdev,
  sma,
  ema,
  trueRange,
  trSeries,
  atr,
  adx,
  choppiness,
  lastNonNull,
};
