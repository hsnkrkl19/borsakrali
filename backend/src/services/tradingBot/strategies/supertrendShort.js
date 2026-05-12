/**
 * Supertrend Short — Supertrend.py'nin short adaptasyonu.
 *
 * Trend ayı flip + EMA200 altında + RSI orta-bant.
 */

const ind = require('../indicators');

module.exports = {
  id: 'supertrend-short',
  name: 'Supertrend Short + EMA200',
  description: 'Supertrend aşağı flip\'i — EMA200 altı uzun-vade ayı trendi + RSI orta-bant onayı.',
  timeframe: '4h',
  direction: 'short',
  warmup: 220,
  params: { stPeriod: 10, stMult: 3, emaTrend: 200, rsiPeriod: 14, rsiMin: 30 },

  populate(candles, params = {}) {
    const p = { ...this.params, ...params };
    const closes = candles.map(c => c.close);
    return {
      st: ind.supertrend(candles, p.stPeriod, p.stMult),
      ema200: ind.ema(closes, p.emaTrend),
      rsi: ind.rsi(closes, p.rsiPeriod),
      atr: ind.atr(candles, p.stPeriod),
      _p: p,
    };
  },

  entryShort(ctx, i) {
    if (i < this.warmup || i < 1) return false;
    const flipDown = ctx.st.trend[i] === -1 && ctx.st.trend[i - 1] === 1;
    const belowTrend = ctx.candles[i].close < (ctx.ema200[i] || -Infinity);
    const safeRsi = ctx.rsi[i] != null && ctx.rsi[i] > ctx._p.rsiMin;
    return flipDown && belowTrend && safeRsi;
  },

  exitShort(ctx, i) {
    if (i < this.warmup || i < 1) return false;
    return ctx.st.trend[i] === 1 && ctx.st.trend[i - 1] === -1;
  },

  stopLossShort(entryPrice, ctx, i) {
    return ctx.st.value[i] || entryPrice * 1.05;
  },

  takeProfitShort() {
    return null;
  },
};
