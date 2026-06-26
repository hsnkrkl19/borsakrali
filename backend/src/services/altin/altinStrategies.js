/**
 * ALTIN · TF-bazlı Strateji Tablosu — her zaman dilimi için BACKTEST'LE
 * DOĞRULANMIŞ giriş + çıkış config'leri (goldLab top-down validasyonundan).
 *
 * Tüm girişler haftalık-yön (bias) ile UYUMLU açılır. Çıkış: TP=tp×ATR,
 * SL/trailing=sl×ATR. wrEst = 26y/2.4y backtest WR (gösterim + güven).
 *
 * 15m/5m/1m: backtest'te ≥%75 kenar YOK → "scalp/fırsat" (düşük güven), yalnız
 * üst-TF yön + S/R onayıyla; kullanıcıya dürüst etiketli sunulur.
 */
const IND = require('../customBots/indicators');

// confidence: yüksek/orta/düşük → numerik
const CONF = { yüksek: 82, orta: 70, düşük: 55 };

const TF_STRATEGIES = {
  '1d':  [
    { type: 'pullback35', tp: 1.5, sl: 3, trail: false, conf: 'yüksek', wrEst: 91, label: 'Günlük RSI35 geri çekilme (premium)' },
    { type: 'breakout20', tp: 1.5, sl: 3, trail: false, conf: 'orta',   wrEst: 77, label: 'Günlük Donchian-20 kırılımı' },
  ],
  '8h':  [
    { type: 'supertrend', tp: 1, sl: 4, trail: true, conf: 'orta', wrEst: 84, label: '8s Supertrend dönüşü' },
    { type: 'breakout20', tp: 1.5, sl: 3, trail: false, conf: 'orta', wrEst: 77, label: '8s Donchian-20 kırılımı' },
  ],
  '4h':  [
    { type: 'supertrend', tp: 1, sl: 4, trail: true, conf: 'yüksek', wrEst: 94, label: '4s Supertrend dönüşü' },
    { type: 'breakout20', tp: 1.5, sl: 3, trail: false, conf: 'orta', wrEst: 77, label: '4s Donchian-20 kırılımı' },
  ],
  '1h':  [
    { type: 'emacross',   tp: 1.5, sl: 3, trail: false, conf: 'yüksek', wrEst: 83, label: '1s EMA50/100 kesişimi' },
    { type: 'breakout20', tp: 1.5, sl: 3, trail: false, conf: 'orta', wrEst: 74, label: '1s Donchian-20 kırılımı' },
  ],
  '15m': [
    { type: 'supertrend', tp: 1, sl: 4, trail: true, conf: 'düşük', scalp: true, wrEst: 64, label: '15d Supertrend (scalp)' },
  ],
  '5m':  [
    { type: 'supertrend', tp: 1, sl: 3, trail: true, conf: 'düşük', scalp: true, wrEst: 60, label: '5d Supertrend (scalp)' },
  ],
  '1m':  [
    { type: 'supertrend', tp: 1, sl: 3, trail: true, conf: 'düşük', scalp: true, wrEst: 55, label: '1d Supertrend (scalp)' },
  ],
};

function prep(candles) {
  const close = candles.map(c => c.close);
  return {
    candles, close,
    ema50: IND.ema(close, 50), ema100: IND.ema(close, 100), ema200: IND.ema(close, 200),
    rsi14: IND.rsi(close, 14), atr14: IND.atr(candles, 14),
    don20: IND.donchian(candles, 20), st: IND.supertrend(candles, 10, 3),
  };
}

// Giriş tetiği (bar i, yalnız ≤i veri). biasDir: 'bull'→long, 'bear'→short, 'neutral'→yok.
function entryAt(P, i, type, biasDir) {
  if (i < 1 || biasDir === 'neutral') return null;
  const { close, rsi14, ema200, ema50, ema100, don20, st } = P;
  const trendUp = ema200[i] == null || close[i] > ema200[i] * 0.98;
  const trendDn = ema200[i] == null || close[i] < ema200[i] * 1.02;
  const wantLong = biasDir === 'bull' && trendUp;
  const wantShort = biasDir === 'bear' && trendDn;
  let long = false, short = false;
  if (type === 'breakout20') {
    if (don20.upper[i] != null && close[i] > don20.upper[i]) long = true;
    if (don20.lower[i] != null && close[i] < don20.lower[i]) short = true;
  } else if (type === 'supertrend') {
    if (st.trend[i] === 1 && st.trend[i - 1] === -1) long = true;
    if (st.trend[i] === -1 && st.trend[i - 1] === 1) short = true;
  } else if (type === 'pullback35') {
    if (rsi14[i] != null && rsi14[i - 1] != null) {
      if (rsi14[i - 1] < 35 && rsi14[i] >= 35) long = true;
      if (rsi14[i - 1] > 65 && rsi14[i] <= 65) short = true;
    }
  } else if (type === 'emacross') {
    if (IND.crossesAbove(ema50, ema100, i)) long = true;
    if (IND.crossesBelow(ema50, ema100, i)) short = true;
  }
  if (long && wantLong) return 'long';
  if (short && wantShort) return 'short';
  return null;
}

function levelsFor(entry, atrVal, spec, direction, precision = 2) {
  const r = (v) => +v.toFixed(precision);
  if (direction === 'long') return { entry: r(entry), stop: r(entry - spec.sl * atrVal), target: r(entry + spec.tp * atrVal) };
  return { entry: r(entry), stop: r(entry + spec.sl * atrVal), target: r(entry - spec.tp * atrVal) };
}

// Bir TF için EN SON barda tetiklenen sinyalleri döndür (canlı kullanım).
function evaluateLatest(candles, tf, biasDir) {
  const specs = TF_STRATEGIES[tf];
  if (!specs || !candles || candles.length < 220) return [];
  const P = prep(candles);
  const i = candles.length - 1;
  const atrVal = P.atr14[i];
  if (!(atrVal > 0)) return [];
  const out = [];
  for (const spec of specs) {
    const dir = entryAt(P, i, spec.type, biasDir);
    if (!dir) continue;
    const lv = levelsFor(candles[i].close, atrVal, spec, dir);
    const rr = Math.abs(lv.target - lv.entry) / Math.max(1e-9, Math.abs(lv.entry - lv.stop));
    out.push({
      tf, type: spec.type, label: spec.label, direction: dir, action: dir === 'long' ? 'LONG' : 'SHORT',
      confidence: CONF[spec.conf], confLabel: spec.conf, wrEst: spec.wrEst, scalp: !!spec.scalp,
      ...lv, atr: +atrVal.toFixed(2), rr: +rr.toFixed(2), tpAtr: spec.tp, slAtr: spec.sl, trail: !!spec.trail,
      barTime: candles[i].time,
    });
  }
  return out;
}

module.exports = { TF_STRATEGIES, prep, entryAt, levelsFor, evaluateLatest, CONF };
