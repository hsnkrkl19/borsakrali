/**
 * TEMA34 — Triple EMA(34) kesişimi. Formül (tema34Engine ile birebir):
 *   ema1=EMA(close,34), ema2=EMA(ema1,34), ema3=EMA(ema2,34) [ilk bar seed]
 *   TEMA = 3*(ema1 - ema2) + ema3
 * Giriş: close yukarı keser (cross_above) → long. Çıkış/short: aşağı keser.
 */
const { emaSeries } = require('../strategyHelpers');

function temaSeries(closes, period = 34) {
  const e1 = emaSeries(closes, period);
  const e2 = emaSeries(e1, period);
  const e3 = emaSeries(e2, period);
  return closes.map((_, i) => 3 * (e1[i] - e2[i]) + e3[i]);
}

function evaluate(candles) {
  if (!candles || candles.length < 100) return null;
  const closes = candles.map(c => c.close);
  const tema = temaSeries(closes, 34);
  const n = closes.length - 1;
  const close = closes[n], closePrev = closes[n - 1];
  const t = tema[n], tPrev = tema[n - 1];

  const above = close > t;
  const crossAbove = closePrev <= tPrev && close > t;
  const crossBelow = closePrev > tPrev && close <= t;
  const distPct = t ? Math.abs(close - t) / t * 100 : 0;

  // Ranking skoru (extraction'dan)
  let score = 50;
  score += above ? 20 : -20;
  if (crossAbove) score += 20;
  if (crossBelow) score -= 15;
  if (distPct <= 3) score += 10; else if (distPct <= 8) score += 5;
  score = Math.max(0, Math.min(100, score));

  let vote, strength, typeLabel;
  if (crossAbove) { vote = 'long'; strength = 0.9; typeLabel = 'Yukarı kesişim (AL)'; }
  else if (crossBelow) { vote = 'short'; strength = 0.9; typeLabel = 'Aşağı kesişim (SAT)'; }
  else if (above) { vote = 'long'; strength = 0.45; typeLabel = 'TEMA34 üstü'; }
  else { vote = 'short'; strength = 0.45; typeLabel = 'TEMA34 altı'; }

  return {
    technique: 'tema34', label: 'TEMA34', weight: 1.5,
    vote, strength, score,
    conditions: [
      { id: 'tema34_state', label: typeLabel, group: 'tema34', met: true },
      { id: 'tema34_dist', label: `TEMA mesafe ${distPct.toFixed(2)}%`, group: 'tema34', met: distPct <= 8 },
    ],
    detail: { tema: +t.toFixed(6), distPct: +distPct.toFixed(2), crossAbove, crossBelow },
  };
}

module.exports = { evaluate, temaSeries };
