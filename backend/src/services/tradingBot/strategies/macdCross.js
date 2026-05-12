/**
 * MACD Cross Strategy — port from freqtrade-strategies Strategy002/UniversalMACD
 *
 * MACD line signal line'ı yukarı keser (boğa cross) + hacim ortalama üstünde
 * + ADX trend modunda (≥20). Çıkış: MACD aşağı cross veya 8% kâr.
 */

const ind = require('../indicators');

module.exports = {
  id: 'macd-cross',
  name: 'MACD Cross + Volume',
  description: 'MACD yukarı kesişim + hacim teyidi + ADX trend onayı (≥20). Boğa cross al, ayı cross sat.',
  timeframe: '1h',
  direction: 'long',
  warmup: 60,
  params: { macdFast: 12, macdSlow: 26, macdSignal: 9, adxPeriod: 14, adxMin: 20, volPeriod: 20 },

  populate(candles, params = {}) {
    const p = { ...this.params, ...params };
    const closes = candles.map(c => c.close);
    return {
      macd: ind.macd(closes, p.macdFast, p.macdSlow, p.macdSignal),
      adx: ind.adx(candles, p.adxPeriod),
      volAvg: ind.volumeAvg(candles, p.volPeriod),
      atr: ind.atr(candles, 14),
      _p: p,
    };
  },

  entryLong(ctx, i) {
    if (i < this.warmup) return false;
    const cross = ind.crossOver(ctx.macd.macd, ctx.macd.signal, i);
    const volOk = ctx.candles[i].volume > (ctx.volAvg[i] || 0);
    const trendOk = (ctx.adx[i] || 0) >= ctx._p.adxMin;
    return cross && volOk && trendOk;
  },

  exitLong(ctx, i) {
    if (i < this.warmup) return false;
    return ind.crossUnder(ctx.macd.macd, ctx.macd.signal, i);
  },

  stopLoss(entryPrice, ctx, i) {
    const a = ctx.atr[i];
    return a == null ? entryPrice * 0.95 : entryPrice - 2.5 * a;
  },

  takeProfit(entryPrice) {
    return entryPrice * 1.08;
  },
};
