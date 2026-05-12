/**
 * Supertrend Strategy — port from freqtrade-strategies Supertrend.py
 *
 * Supertrend trend takip. EMA200 uzun-vade filtre + RSI<70 momentum güvenli
 * bant. Trend flip'i alım/satım. Long-only.
 *
 * QuantifiedStrategies backtest: ortalama %11/trade. Crypto için ATR=10
 * mult=3 default, BIST için biraz daha geniş (ATR=10, mult=3.5) test edilmeli.
 */

const ind = require('../indicators');

module.exports = {
  id: 'supertrend',
  name: 'Supertrend + EMA200',
  description: 'Supertrend yön flip\'i — EMA200 üstü/altı uzun-vade trend filtresi + RSI orta-bant onayı.',
  timeframe: '4h',
  direction: 'long',
  warmup: 220,
  params: { stPeriod: 10, stMult: 3, emaTrend: 200, rsiPeriod: 14, rsiMax: 70 },

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

  entryLong(ctx, i) {
    if (i < this.warmup || i < 1) return false;
    const flipUp = ctx.st.trend[i] === 1 && ctx.st.trend[i - 1] === -1;
    const aboveTrend = ctx.candles[i].close > (ctx.ema200[i] || Infinity);
    const safeRsi = ctx.rsi[i] != null && ctx.rsi[i] < ctx._p.rsiMax;
    return flipUp && aboveTrend && safeRsi;
  },

  exitLong(ctx, i) {
    if (i < this.warmup || i < 1) return false;
    return ctx.st.trend[i] === -1 && ctx.st.trend[i - 1] === 1;
  },

  stopLoss(entryPrice, ctx, i) {
    return ctx.st.value[i] || entryPrice * 0.95;
  },

  takeProfit() {
    return null;
  },
};
