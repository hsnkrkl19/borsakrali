/**
 * BBRSI Strategy — port from freqtrade-strategies BbandRsi.py
 *
 * Klasik mean-reversion: fiyat alt Bollinger bandının altına düştüğünde +
 * RSI 30 aşırı satım bölgesindeyken AL. Fiyat orta banda (SMA20) ulaştığında
 * SAT. Tek yön (long-only). Stoploss ATR tabanlı.
 *
 * Çok cite edilen, en eski açık kaynak Freqtrade stratejilerinden biri. BB
 * sıkışma + RSI dip kombosu — boğa piyasalarında sağlıklı düzeltmelerde iyi.
 */

const ind = require('../indicators');

module.exports = {
  id: 'bbrsi',
  name: 'BB + RSI Mean-Reversion',
  description: 'Alt Bollinger Bandı + RSI<30 dip → orta bant geri dönüş satışı. Klasik Freqtrade BbandRsi portu.',
  timeframe: '1h',
  direction: 'long',
  warmup: 50,
  params: { bbPeriod: 20, bbMult: 2, rsiPeriod: 14, rsiOversold: 30, atrPeriod: 14, atrStopMult: 2 },

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

  entryLong(ctx, i) {
    const { bb, rsi: rsiArr, _p } = ctx;
    if (i < this.warmup) return false;
    const close = ctx.candles[i].close;
    const lower = bb.lower[i];
    const r = rsiArr[i];
    if (lower == null || r == null) return false;
    return close < lower && r < _p.rsiOversold;
  },

  exitLong(ctx, i) {
    const { bb } = ctx;
    if (i < this.warmup) return false;
    const close = ctx.candles[i].close;
    return bb.mid[i] != null && close >= bb.mid[i];
  },

  stopLoss(entryPrice, ctx, i) {
    const a = ctx.atr[i];
    if (a == null) return entryPrice * 0.95;
    return entryPrice - ctx._p.atrStopMult * a;
  },

  takeProfit(entryPrice, ctx, i) {
    const a = ctx.atr[i];
    if (a == null) return entryPrice * 1.08;
    return entryPrice + ctx._p.atrStopMult * a * 1.5;
  },
};
