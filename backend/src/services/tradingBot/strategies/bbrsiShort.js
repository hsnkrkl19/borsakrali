/**
 * BB + RSI Short — bbrsi'nin ayna versiyonu.
 *
 * Aşırı alım dipleri yerine aşırı alım tepelerinden short.
 * Entry:  close > upper BB + RSI > 70
 * Exit:   close <= mid BB
 * Stop:   entry + 2×ATR
 * Target: entry - 2×ATR × 1.5
 */

const ind = require('../indicators');

module.exports = {
  id: 'bbrsi-short',
  name: 'BB + RSI Short (Tepe satışı)',
  description: 'Üst Bollinger Bandı + RSI>70 aşırı alım → orta bant geri dönüş alımı. BBRSI\'ın short aynası.',
  timeframe: '1h',
  direction: 'short',
  warmup: 50,
  params: { bbPeriod: 20, bbMult: 2, rsiPeriod: 14, rsiOverbought: 70, atrPeriod: 14, atrStopMult: 2 },

  populate(candles, params = {}) {
    const p = { ...this.params, ...params };
    const closes = candles.map(c => c.close);
    return {
      bb: ind.bollingerBands(closes, p.bbPeriod, p.bbMult),
      rsi: ind.rsi(closes, p.rsiPeriod),
      atr: ind.atr(candles, p.atrPeriod),
      _p: p,
    };
  },

  entryShort(ctx, i) {
    const { bb, rsi: rsiArr, _p } = ctx;
    if (i < this.warmup) return false;
    const close = ctx.candles[i].close;
    const upper = bb.upper[i];
    const r = rsiArr[i];
    if (upper == null || r == null) return false;
    return close > upper && r > _p.rsiOverbought;
  },

  exitShort(ctx, i) {
    const { bb } = ctx;
    if (i < this.warmup) return false;
    const close = ctx.candles[i].close;
    return bb.mid[i] != null && close <= bb.mid[i];
  },

  stopLossShort(entryPrice, ctx, i) {
    const a = ctx.atr[i];
    if (a == null) return entryPrice * 1.05;
    return entryPrice + ctx._p.atrStopMult * a;
  },

  takeProfitShort(entryPrice, ctx, i) {
    const a = ctx.atr[i];
    if (a == null) return entryPrice * 0.92;
    return entryPrice - ctx._p.atrStopMult * a * 1.5;
  },
};
