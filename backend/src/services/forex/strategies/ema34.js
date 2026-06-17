/**
 * EMA34 Wave Rider — analyzeEMA34 (8 sinyal tipi) portu.
 * Skor haritası: wave_long=90, cross_above=80, trending_up=75, above=60,
 * below=40, trending_down=25, cross_below=20, wave_short=10 (+ slope ±5).
 */
const { emaSeries } = require('../strategyHelpers');

const SCORE = { wave_long: 90, cross_above: 80, trending_up: 75, above: 60, below: 40, trending_down: 25, cross_below: 20, wave_short: 10 };
const LABEL = {
  wave_long: 'Wave Long (geri çekilme + dönüş)', cross_above: 'Yukarı kesişim',
  trending_up: 'Güçlü yukarı trend', above: 'EMA34 üstü', below: 'EMA34 altı',
  trending_down: 'Güçlü aşağı trend', cross_below: 'Aşağı kesişim', wave_short: 'Wave Short (geri çekilme + dönüş)',
};

function evaluate(candles) {
  if (!candles || candles.length < 45) return null;
  const closes = candles.map(c => c.close);
  const ema = emaSeries(closes, 34);
  const n = closes.length - 1;
  const close = closes[n];
  const aboveNow = close > ema[n];
  const abovePrev = closes[n - 1] > ema[n - 1];

  const base = ema[n - 5];
  const slopePct = base ? ((ema[n] - base) / base) * 100 : 0;

  // signed consecutive bar count vs EMA34
  let consec = 0;
  for (let i = n; i >= 0; i--) {
    if (closes[i] > ema[i]) { if (consec >= 0) consec++; else break; }
    else if (closes[i] < ema[i]) { if (consec <= 0) consec--; else break; }
    else break;
  }

  // son 5 barda EMA34'e dokunuş + öncesindeki trend gücü
  let touchIdx = -1;
  for (let i = n; i >= Math.max(1, n - 4); i--) {
    if (candles[i].low <= ema[i] && candles[i].high >= ema[i]) { touchIdx = i; break; }
  }
  let priorUp = 0, priorDown = 0;
  if (touchIdx > 0) {
    for (let i = touchIdx - 1; i >= 0; i--) { if (closes[i] > ema[i]) priorUp++; else break; }
    for (let i = touchIdx - 1; i >= 0; i--) { if (closes[i] < ema[i]) priorDown++; else break; }
  }
  const touched = touchIdx >= 0;

  let type;
  if (touched && priorUp >= 5 && aboveNow) type = 'wave_long';
  else if (touched && priorDown >= 5 && !aboveNow) type = 'wave_short';
  else if (!abovePrev && aboveNow) type = 'cross_above';
  else if (abovePrev && !aboveNow) type = 'cross_below';
  else if (aboveNow && consec >= 5 && slopePct > 0.3) type = 'trending_up';
  else if (!aboveNow && consec <= -5 && slopePct < -0.3) type = 'trending_down';
  else if (aboveNow) type = 'above';
  else type = 'below';

  let score = SCORE[type];
  if (slopePct > 0.3 && score >= 60) score = Math.min(100, score + 5);
  if (slopePct < -0.3 && score <= 40) score = Math.max(0, score - 5);

  const vote = score > 50 ? 'long' : score < 50 ? 'short' : 'neutral';
  const strength = Math.min(1, Math.abs(score - 50) / 40);

  return {
    technique: 'ema34', label: 'EMA34 Wave', weight: 1.5,
    vote, strength, score,
    conditions: [
      { id: `ema34_${type}`, label: LABEL[type], group: 'ema34', met: true },
      { id: 'ema34_slope', label: `Eğim ${slopePct.toFixed(2)}%`, group: 'ema34', met: Math.abs(slopePct) > 0.3 },
    ],
    detail: { type, slopePct: +slopePct.toFixed(2), consecutive: consec, ema34: ema[n] },
  };
}

module.exports = { evaluate };
