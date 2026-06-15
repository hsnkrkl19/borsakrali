/**
 * Custom Bots — Indikatör Kütüphanesi (saf, look-ahead-bias'sız)
 *
 * Kullanıcının oluşturduğu botların stratejileri bu seri-tabanlı indikatörleri
 * kullanır. Her fonksiyon kapanış/mum dizisi alır ve aynı uzunlukta bir DİZİ
 * döndürür; warmup tamamlanmadan önceki barlar `null`'dır. Böylece bir barın
 * indikatör değeri YALNIZCA o ana kadarki veriden hesaplanır (geleceğe bakmaz).
 *
 * Tüm fonksiyonlar yan etkisizdir → golden test'lenebilir.
 */

// ── Yardımcılar ──────────────────────────────────────────────────────────────
function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

// Basit Hareketli Ortalama — i barında son `period` kapanışın ortalaması.
function sma(values, period) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Üssel Hareketli Ortalama (EMA). İlk geçerli değer ilk `period` barın SMA'sıyla
 * tohumlanır (Wilder/TradingView ile uyumlu yaygın yaklaşım); öncesi null.
 */
function ema(values, period) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (period <= 0 || n < period) return out;
  const k = 2 / (period + 1);
  // İlk EMA = ilk `period` değerin SMA'sı
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  seed /= period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < n; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/**
 * RSI (Wilder). İlk değer `period` bardan sonra oluşur. Kayıp yoksa RSI=100.
 */
function rsi(closes, period = 14) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  if (n <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < n; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/**
 * MACD — { macd, signal, hist } dizileri.
 *   macd   = ema(fast) − ema(slow)
 *   signal = ema(macd, signalPeriod)  (macd'nin geçerli olduğu yerden tohumlanır)
 *   hist   = macd − signal
 */
function macd(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const n = closes.length;
  const emaFast = ema(closes, fastPeriod);
  const emaSlow = ema(closes, slowPeriod);
  const macdLine = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (isNum(emaFast[i]) && isNum(emaSlow[i])) macdLine[i] = emaFast[i] - emaSlow[i];
  }
  // signal = EMA(macdLine) ama macdLine null değerlerle başlıyor → ilk geçerli
  // indeksten itibaren sıkıştır, EMA al, geri yerleştir.
  const firstIdx = macdLine.findIndex(isNum);
  const signal = new Array(n).fill(null);
  const hist = new Array(n).fill(null);
  if (firstIdx !== -1) {
    const compact = macdLine.slice(firstIdx).map(v => (isNum(v) ? v : 0));
    const sig = ema(compact, signalPeriod);
    for (let j = 0; j < sig.length; j++) {
      const i = firstIdx + j;
      if (isNum(sig[j])) {
        signal[i] = sig[j];
        if (isNum(macdLine[i])) hist[i] = macdLine[i] - sig[j];
      }
    }
  }
  return { macd: macdLine, signal, hist };
}

/**
 * ATR (Wilder) dizisi. candles: [{high, low, close}]. İlk değer `period`+1 barda.
 */
function atr(candles, period = 14) {
  const n = candles.length;
  const out = new Array(n).fill(null);
  if (n < period + 1) return out;
  const tr = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  // İlk ATR = ilk `period` TR'nin ortalaması (i=1..period)
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
 * Tek-değer ATR (son bar) — pozisyon açarken SL/TP mesafesi için kullanılır.
 * Dizi varyantının son geçerli değerini döndürür; yoksa 0.
 */
function atrLast(candles, period = 14) {
  const series = atr(candles, period);
  for (let i = series.length - 1; i >= 0; i--) if (isNum(series[i])) return series[i];
  return 0;
}

/**
 * Bollinger Bantları — { middle, upper, lower } dizileri.
 *   middle = SMA(period); upper/lower = middle ± mult × stddev(period)
 */
function bollinger(closes, period = 20, mult = 2) {
  const n = closes.length;
  const middle = sma(closes, period);
  const upper = new Array(n).fill(null);
  const lower = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    if (!isNum(middle[i])) continue;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j] - middle[i];
      variance += d * d;
    }
    const sd = Math.sqrt(variance / period);
    upper[i] = middle[i] + mult * sd;
    lower[i] = middle[i] - mult * sd;
  }
  return { middle, upper, lower };
}

/**
 * Supertrend — { trend, line } dizileri.
 *   trend[i] =  1 (yükseliş) | -1 (düşüş)
 *   line[i]  = o anki supertrend çizgisi
 * Klasik ATR-tabanlı formül (multiplier × ATR ile band, kırılımda trend flip).
 */
function supertrend(candles, atrPeriod = 10, multiplier = 3) {
  const n = candles.length;
  const trend = new Array(n).fill(null);
  const line = new Array(n).fill(null);
  const atrArr = atr(candles, atrPeriod);
  let prevUpper = null, prevLower = null, prevTrend = 1, prevLine = null;
  let started = false;
  for (let i = 0; i < n; i++) {
    if (!isNum(atrArr[i])) continue;
    const hl2 = (candles[i].high + candles[i].low) / 2;
    let basicUpper = hl2 + multiplier * atrArr[i];
    let basicLower = hl2 - multiplier * atrArr[i];
    const close = candles[i].close;
    const prevClose = candles[i - 1] ? candles[i - 1].close : close;

    let finalUpper, finalLower;
    if (!started) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      prevTrend = close >= hl2 ? 1 : -1;
      started = true;
    } else {
      finalUpper = (basicUpper < prevUpper || prevClose > prevUpper) ? basicUpper : prevUpper;
      finalLower = (basicLower > prevLower || prevClose < prevLower) ? basicLower : prevLower;
    }

    let curTrend;
    if (prevTrend === 1) {
      curTrend = close < finalLower ? -1 : 1;
    } else {
      curTrend = close > finalUpper ? 1 : -1;
    }
    const curLine = curTrend === 1 ? finalLower : finalUpper;

    trend[i] = curTrend;
    line[i] = curLine;
    prevUpper = finalUpper;
    prevLower = finalLower;
    prevTrend = curTrend;
    prevLine = curLine;
  }
  return { trend, line };
}

/**
 * Donchian kanalı — { upper, lower } dizileri.
 *   upper[i] = ÖNCEKİ `period` barın en yüksek HIGH'ı (i hariç)
 *   lower[i] = ÖNCEKİ `period` barın en düşük LOW'u (i hariç)
 * i barını hariç tutmak kırılımı doğru yakalar: "bugünkü kapanış düne kadarki
 * en yükseği geçti mi?".
 */
function donchian(candles, period = 20) {
  const n = candles.length;
  const upper = new Array(n).fill(null);
  const lower = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - period; j < i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low < lo) lo = candles[j].low;
    }
    upper[i] = hi;
    lower[i] = lo;
  }
  return { upper, lower };
}

// Kesişim yardımcıları (look-ahead-free): i-1 ve i değerlerine bakar.
function crossesAbove(a, b, i) {
  if (i < 1) return false;
  return isNum(a[i - 1]) && isNum(b[i - 1]) && isNum(a[i]) && isNum(b[i]) &&
    a[i - 1] <= b[i - 1] && a[i] > b[i];
}
function crossesBelow(a, b, i) {
  if (i < 1) return false;
  return isNum(a[i - 1]) && isNum(b[i - 1]) && isNum(a[i]) && isNum(b[i]) &&
    a[i - 1] >= b[i - 1] && a[i] < b[i];
}

module.exports = {
  sma, ema, rsi, macd, atr, atrLast, bollinger, supertrend, donchian,
  crossesAbove, crossesBelow, isNum,
};
