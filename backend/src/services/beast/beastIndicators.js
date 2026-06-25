/**
 * beastIndicators — BEAST Trend botu için bağımsız, SERİ-dönen, ileri-bakışsız
 * teknik gösterge kütüphanesi.
 *
 * Tasarım kuralları:
 *  - Her fonksiyon tüm seriyi (her bar için değer) döner → backtest bar-bar
 *    yürürken sızıntı (lookahead) olmadan geçmişi yeniden hesaplamaya gerek kalmaz.
 *  - Yetersiz veri olan barlarda değer `null`/`NaN` olur; çağıran kontrol eder.
 *  - Mum formatı: { time, open, high, low, close, volume } (eski→yeni).
 *
 * Üç Pine kaynağının füzyonu burada yaşar:
 *  - Zero-Lag Trend (AlgoAlpha): zlemaSeries + zeroLagTrend (volatilite bandı durum makinesi)
 *  - Ichimoku (Enhanced): ichimokuSeries (HTF rejim filtresi)
 *  - Scalper Beast: supertrendSeries, adxSeries, macd, stochRsi, vwapRolling (konfluans katmanları)
 */

'use strict';

// ───────────────────────── Hareketli ortalamalar ─────────────────────────

// Basit hareketli ortalama serisi
function smaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// EMA serisi (Wilder değil, klasik 2/(p+1)). SMA ile seed'lenir.
function emaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  // İlk EMA = ilk `period` değerin SMA'sı
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  seed /= period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Wilder düzleştirmeli RMA (ATR/ADX için)
function rmaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  seed /= period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

// ───────────────────────── Zero-Lag EMA (ZLEMA) ─────────────────────────
// AlgoAlpha: zlema = ema(src + (src - src[lag]), length), lag = floor((length-1)/2)
function zlemaSeries(closes, length) {
  const lag = Math.floor((length - 1) / 2);
  const src2 = new Array(closes.length);
  for (let i = 0; i < closes.length; i++) {
    src2[i] = i >= lag ? closes[i] + (closes[i] - closes[i - lag]) : closes[i];
  }
  return emaSeries(src2, length);
}

// ───────────────────────── ATR (Wilder) ─────────────────────────
function trueRangeSeries(candles) {
  const out = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) { out[i] = c.high - c.low; continue; }
    const pc = candles[i - 1].close;
    out[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  }
  return out;
}

function atrSeries(candles, period = 14) {
  const tr = trueRangeSeries(candles);
  // tr[0] geçerli; RMA seed için tr[0..period-1] kullanılır
  return rmaSeries(tr, period);
}

// ─────────── Zero-Lag Trend durum makinesi (AlgoAlpha çekirdeği) ───────────
// volatility = highest(ATR(length), length*3) * mult
// trend = +1 close, (zlema+vol)'u yukarı keserse; -1 (zlema-vol)'u aşağı keserse; aksi halde taşınır.
// Dönüş: { zlema:[], upper:[], lower:[], trend:[], entryLong:[], entryShort:[] }
function zeroLagTrend(candles, length = 70, mult = 1.2) {
  const closes = candles.map(c => c.close);
  const zlema = zlemaSeries(closes, length);
  const atr = atrSeries(candles, length);
  const volWin = length * 3;
  const n = candles.length;
  const volatility = new Array(n).fill(null);
  // highest(atr, length*3)
  for (let i = 0; i < n; i++) {
    if (atr[i] == null) continue;
    let hi = -Infinity;
    for (let j = Math.max(0, i - volWin + 1); j <= i; j++) {
      if (atr[j] != null && atr[j] > hi) hi = atr[j];
    }
    volatility[i] = hi === -Infinity ? null : hi * mult;
  }
  const upper = new Array(n).fill(null);
  const lower = new Array(n).fill(null);
  const trend = new Array(n).fill(0);
  const entryLong = new Array(n).fill(false);
  const entryShort = new Array(n).fill(false);
  let prevTrend = 0;
  for (let i = 0; i < n; i++) {
    if (zlema[i] == null || volatility[i] == null) { trend[i] = prevTrend; continue; }
    upper[i] = zlema[i] + volatility[i];
    lower[i] = zlema[i] - volatility[i];
    let t = prevTrend;
    if (i > 0 && upper[i - 1] != null && lower[i - 1] != null) {
      const crossUp = closes[i] > upper[i] && closes[i - 1] <= upper[i - 1];
      const crossDn = closes[i] < lower[i] && closes[i - 1] >= lower[i - 1];
      if (crossUp) t = 1;
      else if (crossDn) t = -1;
      // Giriş okları: close, zlema basis'i trend yönünde tekrar keserse (pullback-resume)
      if (t === 1 && prevTrend === 1 && closes[i] > zlema[i] && closes[i - 1] <= zlema[i - 1]) entryLong[i] = true;
      if (t === -1 && prevTrend === -1 && closes[i] < zlema[i] && closes[i - 1] >= zlema[i - 1]) entryShort[i] = true;
    }
    trend[i] = t;
    prevTrend = t;
  }
  return { zlema, upper, lower, trend, entryLong, entryShort, atr };
}

// ───────────────────────── SuperTrend (kanonik TradingView) ─────────────────────────
// Dönüş: { st:[], dir:[] }  dir: +1 boğa (fiyat üstte), -1 ayı. flip = dir[i]!=dir[i-1]
function supertrendSeries(candles, period = 10, mult = 3) {
  const n = candles.length;
  const atr = atrSeries(candles, period);
  const st = new Array(n).fill(null);
  const dir = new Array(n).fill(null);
  const finalUpper = new Array(n).fill(null);
  const finalLower = new Array(n).fill(null);
  let prevDir = 1, prevFU = null, prevFL = null, prevST = null;
  for (let i = 0; i < n; i++) {
    if (atr[i] == null) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const bu = hl2 + mult * atr[i];
    const bl = hl2 - mult * atr[i];
    const close = candles[i].close;
    const prevClose = i > 0 ? candles[i - 1].close : close;
    let fu, fl;
    if (prevFU == null) { fu = bu; fl = bl; }
    else {
      fu = (bu < prevFU || prevClose > prevFU) ? bu : prevFU;
      fl = (bl > prevFL || prevClose < prevFL) ? bl : prevFL;
    }
    let d;
    if (prevST == null) {
      d = close > hl2 ? 1 : -1;
    } else if (prevST === prevFU) {
      d = close > fu ? 1 : -1;
    } else {
      d = close < fl ? -1 : 1;
    }
    const stv = d === 1 ? fl : fu;
    st[i] = stv; dir[i] = d;
    finalUpper[i] = fu; finalLower[i] = fl;
    prevDir = d; prevFU = fu; prevFL = fl; prevST = stv;
  }
  return { st, dir };
}

// ───────────────────────── ADX / DMI (Wilder) ─────────────────────────
// Dönüş: { adx:[], plusDI:[], minusDI:[] }
function adxSeries(candles, period = 14) {
  const n = candles.length;
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  const tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const dn = candles[i - 1].low - candles[i].low;
    plusDM[i] = (up > dn && up > 0) ? up : 0;
    minusDM[i] = (dn > up && dn > 0) ? dn : 0;
    const pc = candles[i - 1].close;
    tr[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - pc), Math.abs(candles[i].low - pc));
  }
  // Wilder düzleştirme (ilk değer period toplamı, sonra rolling)
  const smPlus = new Array(n).fill(null);
  const smMinus = new Array(n).fill(null);
  const smTR = new Array(n).fill(null);
  let sp = 0, sm = 0, st = 0;
  for (let i = 1; i < n; i++) {
    if (i <= period) { sp += plusDM[i]; sm += minusDM[i]; st += tr[i]; if (i === period) { smPlus[i] = sp; smMinus[i] = sm; smTR[i] = st; } }
    else {
      smPlus[i] = smPlus[i - 1] - smPlus[i - 1] / period + plusDM[i];
      smMinus[i] = smMinus[i - 1] - smMinus[i - 1] / period + minusDM[i];
      smTR[i] = smTR[i - 1] - smTR[i - 1] / period + tr[i];
    }
  }
  const plusDI = new Array(n).fill(null);
  const minusDI = new Array(n).fill(null);
  const dx = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    if (smTR[i] == null || smTR[i] === 0) continue;
    plusDI[i] = 100 * smPlus[i] / smTR[i];
    minusDI[i] = 100 * smMinus[i] / smTR[i];
    const sum = plusDI[i] + minusDI[i];
    dx[i] = sum === 0 ? 0 : 100 * Math.abs(plusDI[i] - minusDI[i]) / sum;
  }
  // ADX = Wilder RMA of DX, başlangıç period*2-1 civarı
  const adx = new Array(n).fill(null);
  const firstDx = period;
  let adxSeed = 0, cnt = 0, started = -1;
  for (let i = firstDx; i < n; i++) {
    if (dx[i] == null) continue;
    cnt++;
    adxSeed += dx[i];
    if (cnt === period) { adx[i] = adxSeed / period; started = i; break; }
  }
  if (started > 0) {
    for (let i = started + 1; i < n; i++) {
      if (dx[i] == null) { adx[i] = adx[i - 1]; continue; }
      adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }
  }
  return { adx, plusDI, minusDI };
}

// ───────────────────────── MACD ─────────────────────────
function macdSeries(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const macd = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) macd[i] = emaFast[i] - emaSlow[i];
  }
  // signal = EMA of macd (yalnız geçerli kısım)
  const valid = macd.filter(v => v != null);
  const sigValid = emaSeries(valid, signal);
  const sig = new Array(closes.length).fill(null);
  let k = 0;
  for (let i = 0; i < closes.length; i++) {
    if (macd[i] != null) { sig[i] = sigValid[k]; k++; }
  }
  const hist = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (macd[i] != null && sig[i] != null) hist[i] = macd[i] - sig[i];
  }
  return { macd, signal: sig, hist };
}

// ───────────────────────── RSI + Stochastic RSI ─────────────────────────
function rsiSeries(closes, period = 14) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  if (n < period + 1) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgG = gain / period, avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch >= 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

// StochRSI %K/%D (Scalper Beast: rsiLen, stochLen, k, d). Dönüş 0..1 ölçeğinde.
function stochRsiSeries(closes, rsiLen = 14, stochLen = 14, kSmooth = 3, dSmooth = 3) {
  const rsi = rsiSeries(closes, rsiLen);
  const n = closes.length;
  const raw = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (rsi[i] == null) continue;
    let lo = Infinity, hi = -Infinity, ok = true;
    for (let j = i - stochLen + 1; j <= i; j++) {
      if (j < 0 || rsi[j] == null) { ok = false; break; }
      if (rsi[j] < lo) lo = rsi[j];
      if (rsi[j] > hi) hi = rsi[j];
    }
    if (!ok) continue;
    raw[i] = hi === lo ? 0.5 : (rsi[i] - lo) / (hi - lo);
  }
  // %K = SMA(raw, kSmooth), %D = SMA(%K, dSmooth)
  const kArr = smaNullable(raw, kSmooth);
  const dArr = smaNullable(kArr, dSmooth);
  return { k: kArr, d: dArr };
}

// null-toleranslı SMA (boş başlangıçları atlar)
function smaNullable(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    let sum = 0, cnt = 0, ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      if (j < 0 || values[j] == null) { ok = false; break; }
      sum += values[j]; cnt++;
    }
    if (ok && cnt === period) out[i] = sum / period;
  }
  return out;
}

// ───────────────────────── Ichimoku ─────────────────────────
// Rejim filtresi için: her bar, o anda GÖRÜNEN bulutun üst/altı (displacement geri).
// Dönüş: { tenkan:[], kijun:[], spanA:[], spanB:[], cloudTop:[], cloudBottom:[], aboveCloud:[], belowCloud:[] }
function ichimokuSeries(candles, conv = 9, base = 26, spanBLen = 52, displacement = 26) {
  const n = candles.length;
  const donchian = (len, i) => {
    if (i < len - 1) return null;
    let hi = -Infinity, lo = Infinity;
    for (let j = i - len + 1; j <= i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    return (hi + lo) / 2;
  };
  const tenkan = new Array(n).fill(null);
  const kijun = new Array(n).fill(null);
  const spanA = new Array(n).fill(null);
  const spanB = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    tenkan[i] = donchian(conv, i);
    kijun[i] = donchian(base, i);
    if (tenkan[i] != null && kijun[i] != null) spanA[i] = (tenkan[i] + kijun[i]) / 2;
    spanB[i] = donchian(spanBLen, i);
  }
  const cloudTop = new Array(n).fill(null);
  const cloudBottom = new Array(n).fill(null);
  const aboveCloud = new Array(n).fill(false);
  const belowCloud = new Array(n).fill(false);
  const back = displacement - 1;
  for (let i = 0; i < n; i++) {
    const sa = spanA[i - back], sb = spanB[i - back];
    if (i - back < 0 || sa == null || sb == null) continue;
    cloudTop[i] = Math.max(sa, sb);
    cloudBottom[i] = Math.min(sa, sb);
    aboveCloud[i] = candles[i].close > cloudTop[i];
    belowCloud[i] = candles[i].close < cloudBottom[i];
  }
  return { tenkan, kijun, spanA, spanB, cloudTop, cloudBottom, aboveCloud, belowCloud };
}

// ───────────────────────── Rolling VWAP (çapasız, N-bar) ─────────────────────────
// Gerçek seans-VWAP yerine, çok zaman dilimli sürekli akış için N-bar yuvarlanan VWAP.
function vwapRollingSeries(candles, period = 20) {
  const n = candles.length;
  const out = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    let tpv = 0, vol = 0, ok = true;
    for (let j = i - period + 1; j <= i; j++) {
      if (j < 0) { ok = false; break; }
      const c = candles[j];
      const tp = (c.high + c.low + c.close) / 3;
      const v = c.volume || 0;
      tpv += tp * v; vol += v;
    }
    if (ok) out[i] = vol > 0 ? tpv / vol : candles[i].close;
  }
  return out;
}

// ───────────────────────── Fraktal pivotlar (yapısal stop için) ─────────────────────────
// En güncel onaylı swing dip (long) / tepe (short). Son `right` bar pivot olamaz → lookahead yok.
function recentSwing(candles, endIdx, left = 3, right = 3, lookback = 40) {
  let lowI = -1, highI = -1;
  const from = Math.max(left, endIdx - lookback);
  for (let i = from; i <= endIdx - right; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (j < 0 || j >= candles.length) { isHigh = false; isLow = false; break; }
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highI = i;
    if (isLow) lowI = i;
  }
  return {
    swingLow: lowI >= 0 ? candles[lowI].low : null,
    swingHigh: highI >= 0 ? candles[highI].high : null,
  };
}

// ───────────────────────── Resample (alt TF → üst TF) ─────────────────────────
// Ardışık `factor` barı tek üst-TF barına toplar (HTF bias için). Sadece TAM
// kapanmış gruplar döner → ileri-bakış yok. time = grubun ilk barının zamanı.
function resample(candles, factor) {
  if (factor <= 1) return candles.slice();
  const out = [];
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const g = candles.slice(i, i + factor);
    out.push({
      time: g[0].time,
      open: g[0].open,
      high: Math.max(...g.map(c => c.high)),
      low: Math.min(...g.map(c => c.low)),
      close: g[g.length - 1].close,
      volume: g.reduce((s, c) => s + (c.volume || 0), 0),
      endTime: g[g.length - 1].time, // grubun kapanış-barı zamanı (eşleme için)
    });
  }
  return out;
}

module.exports = {
  smaSeries, emaSeries, rmaSeries, zlemaSeries,
  trueRangeSeries, atrSeries, zeroLagTrend,
  supertrendSeries, adxSeries, macdSeries,
  rsiSeries, stochRsiSeries, smaNullable,
  ichimokuSeries, vwapRollingSeries, recentSwing, resample,
};
