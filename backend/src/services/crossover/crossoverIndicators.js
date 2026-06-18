/**
 * Crossover Indicators — EMA34 & TEMA34 (saf matematik, bağımsız & test edilebilir)
 *
 * Bu modül dış servise dokunmaz; yalnızca kapanış dizisi alır, indikatör serisi
 * üretir ve son (ONAYLANMIŞ) bardaki kesişim durumunu sınıflandırır. Formüller
 * tema34Bot/tema34Engine.js ile BİREBİR aynıdır (Pine Script v6 davranışı): EMA
 * ilk barda kaynağın değeriyle başlatılır.
 *
 * "İlk kırılım" tanımı: kapanış, indikatör çizgisini geçtiği bardır.
 *   cross_above — önceki kapanış çizginin altında/eşit, bugünkü kapanış üstünde
 *                 (yukarı ilk kırılım → AL bölgesi)
 *   cross_below — önceki kapanış çizginin üstünde, bugünkü kapanış altında/eşit
 *                 (düşüşte ilk kırılım → SAT bölgesi)
 * Bir sonraki gün hisse çizgi üstünde/altında kalmaya devam ederse artık "kesişim"
 * değil 'above'/'below' olur → her kırılım yalnızca olduğu gün raporlanır.
 */

// EMA serisi — Pine-style seed (ilk bar = ilk kapanış).
function calcEMASeries(closes, period) {
  const n = closes.length;
  if (n === 0) return [];
  const k = 2 / (period + 1);
  const out = new Array(n);
  out[0] = closes[0];
  for (let i = 1; i < n; i++) out[i] = k * closes[i] + (1 - k) * out[i - 1];
  return out;
}

// TEMA serisi — Triple EMA: ema1=EMA(close), ema2=EMA(ema1), ema3=EMA(ema2),
//   TEMA = 3*(ema1 - ema2) + ema3. tema34Engine.calcTEMASeries ile birebir.
function calcTEMASeries(closes, period) {
  const n = closes.length;
  if (n === 0) return [];
  const k = 2 / (period + 1);
  const ema1 = new Array(n);
  const ema2 = new Array(n);
  const ema3 = new Array(n);
  const tema = new Array(n);
  ema1[0] = ema2[0] = ema3[0] = tema[0] = closes[0];
  for (let i = 1; i < n; i++) {
    ema1[i] = k * closes[i] + (1 - k) * ema1[i - 1];
    ema2[i] = k * ema1[i] + (1 - k) * ema2[i - 1];
    ema3[i] = k * ema2[i] + (1 - k) * ema3[i - 1];
    tema[i] = 3 * (ema1[i] - ema2[i]) + ema3[i];
  }
  return tema;
}

/**
 * Son onaylanmış bardaki kapanış-çizgi durumunu sınıflandır.
 * closes ve line aynı uzunlukta olmalı. Sonuç:
 *   { signal: 'cross_above'|'cross_below'|'above'|'below', distancePct, lastClose, prevClose, line, linePrev }
 * Veri bozuk/eksikse null.
 */
function classifyCross(closes, line) {
  const n = closes.length;
  if (!Array.isArray(closes) || !Array.isArray(line) || n < 2 || line.length !== n) return null;
  const lastClose = closes[n - 1];
  const prevClose = closes[n - 2];
  const lineNow = line[n - 1];
  const linePrev = line[n - 2];
  if (![lastClose, prevClose, lineNow, linePrev].every(Number.isFinite)) return null;

  const aboveNow = lastClose > lineNow;
  const abovePrev = prevClose > linePrev;
  let signal;
  if (!abovePrev && aboveNow) signal = 'cross_above';      // yukarı ilk kırılım
  else if (abovePrev && !aboveNow) signal = 'cross_below'; // düşüşte ilk kırılım
  else if (aboveNow) signal = 'above';
  else signal = 'below';

  const distancePct = lineNow ? +(((lastClose - lineNow) / lineNow) * 100).toFixed(2) : 0;
  return {
    signal,
    aboveNow,
    abovePrev,
    distancePct,
    lastClose: +lastClose.toFixed(4),
    prevClose: +prevClose.toFixed(4),
    line: +lineNow.toFixed(4),
    linePrev: +linePrev.toFixed(4),
  };
}

module.exports = { calcEMASeries, calcTEMASeries, classifyCross };
