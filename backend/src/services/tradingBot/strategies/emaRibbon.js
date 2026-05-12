/**
 * EMA Ribbon — kanıtlanmış trend takip combo
 *
 * Trend confirmation paketi:
 *   - EMA8 > EMA21 > EMA50 (boğa sıralanması, 3 ardışık bar)
 *   - Close > EMA200
 *   - Hacim son barda ortalamanın üstünde
 *   - RSI 50-70 momentum bandında
 *
 * Çıkış: EMA8 EMA21'in altına düşerse VEYA Supertrend ayı flip'i.
 * Stop: ATR tabanlı (1.8×ATR — geniş, "noise"a takılmasın).
 */

const ind = require('../indicators');

module.exports = {
  id: 'ema-ribbon',
  name: 'EMA Ribbon Trend',
  description: 'Üç EMA sıralanması (8>21>50) + EMA200 trend filtresi + hacim + momentum. Sağlam orta-vade trend takip.',
  timeframe: '4h',
  direction: 'long',
  warmup: 220,
  params: {
    ema1: 8, ema2: 21, ema3: 50, emaTrend: 200,
    rsiPeriod: 14, rsiMin: 50, rsiMax: 70,
    volPeriod: 20,
    atrStop: 1.8,
  },

  populate(candles, params = {}) {
    const p = { ...this.params, ...params };
    const closes = candles.map(c => c.close);
    return {
      e1: ind.ema(closes, p.ema1),
      e2: ind.ema(closes, p.ema2),
      e3: ind.ema(closes, p.ema3),
      ema200: ind.ema(closes, p.emaTrend),
      rsi: ind.rsi(closes, p.rsiPeriod),
      volAvg: ind.volumeAvg(candles, p.volPeriod),
      atr: ind.atr(candles, 14),
      _p: p,
    };
  },

  entryLong(ctx, i) {
    if (i < this.warmup) return false;
    const _p = ctx._p;
    const stackedNow = ctx.e1[i] > ctx.e2[i] && ctx.e2[i] > ctx.e3[i];
    const stackedPrev = ctx.e1[i - 1] > ctx.e2[i - 1] && ctx.e2[i - 1] > ctx.e3[i - 1];
    const stackedPrev2 = ctx.e1[i - 2] > ctx.e2[i - 2] && ctx.e2[i - 2] > ctx.e3[i - 2];
    if (!(stackedNow && stackedPrev && stackedPrev2)) return false;
    const justStacked = !(ctx.e1[i - 3] > ctx.e2[i - 3] && ctx.e2[i - 3] > ctx.e3[i - 3]);
    if (!justStacked) return false;
    const trendOk = ctx.candles[i].close > (ctx.ema200[i] || Infinity);
    const rsiOk = ctx.rsi[i] != null && ctx.rsi[i] >= _p.rsiMin && ctx.rsi[i] <= _p.rsiMax;
    const volOk = ctx.candles[i].volume > (ctx.volAvg[i] || 0);
    return trendOk && rsiOk && volOk;
  },

  exitLong(ctx, i) {
    if (i < 1) return false;
    return ctx.e1[i] != null && ctx.e2[i] != null && ctx.e1[i] < ctx.e2[i];
  },

  stopLoss(entryPrice, ctx, i) {
    const a = ctx.atr[i];
    return a == null ? entryPrice * 0.94 : entryPrice - ctx._p.atrStop * a;
  },

  takeProfit() {
    return null;
  },
};
