/**
 * NostalgiaLite — sadeleştirilmiş port: iterativv/NostalgiaForInfinity X6/X7
 *
 * Tam NFI multi-pair, multi-condition complex'tir (50+ entry koşulu). Burada
 * en sık tetikleyen "low-RSI + alt BB + hacim spike" girişini ve ROI tablosu
 * + trailing stop pattern'ı koruyoruz.
 *
 * Entry koşulları (hepsi gerekli):
 *   1. RSI(14) < 35 — orta aşırı satım
 *   2. Close < BB lower (20, 2.0)
 *   3. Close > EMA200 — ana trend boğa
 *   4. Volume > 1.3 × Vol_SMA(20) — katılım var
 *   5. Stoch_K < 30 — momentum oversold teyidi
 *
 * ROI tablosu (Freqtrade'den 1:1):
 *   0sn   → +%4
 *   30dk  → +%3
 *   1sa   → +%2
 *   3sa   → +%1
 *   6sa+  → kapat
 */

const ind = require('../indicators');

module.exports = {
  id: 'nostalgia-lite',
  name: 'Nostalgia Lite (NFI port)',
  description: '5-koşul ağır filtreli giriş + zamana bağlı ROI çıkışı. NostalgiaForInfinity X6\'nın özet versiyonu.',
  timeframe: '1h',
  direction: 'long',
  warmup: 220,
  params: {
    rsiPeriod: 14, rsiMax: 35,
    bbPeriod: 20, bbMult: 2,
    emaTrend: 200,
    volPeriod: 20, volMult: 1.3,
    stochK: 14, stochD: 3, stochMax: 30,
    atrStop: 3,
  },
  roiTable: [
    { hours: 0,    pct: 4 },
    { hours: 0.5,  pct: 3 },
    { hours: 1,    pct: 2 },
    { hours: 3,    pct: 1 },
    { hours: 6,    pct: 0 },
  ],

  populate(candles, params = {}) {
    const p = { ...this.params, ...params };
    const closes = candles.map(c => c.close);
    return {
      rsi: ind.rsi(closes, p.rsiPeriod),
      bb: ind.bollingerBands(closes, p.bbPeriod, p.bbMult),
      ema200: ind.ema(closes, p.emaTrend),
      volAvg: ind.volumeAvg(candles, p.volPeriod),
      stoch: ind.stochastic(candles, p.stochK, p.stochD, 3),
      atr: ind.atr(candles, 14),
      _p: p,
    };
  },

  entryLong(ctx, i) {
    if (i < this.warmup) return false;
    const c = ctx.candles[i];
    const _p = ctx._p;
    const c1 = ctx.rsi[i] != null && ctx.rsi[i] < _p.rsiMax;
    const c2 = ctx.bb.lower[i] != null && c.close < ctx.bb.lower[i];
    const c3 = ctx.ema200[i] != null && c.close > ctx.ema200[i];
    const c4 = ctx.volAvg[i] != null && c.volume > _p.volMult * ctx.volAvg[i];
    const c5 = ctx.stoch.k[i] != null && ctx.stoch.k[i] < _p.stochMax;
    return c1 && c2 && c3 && c4 && c5;
  },

  exitLong() {
    return false;
  },

  customExit(entry, ctx, i) {
    const candle = ctx.candles[i];
    const heldMs = (candle.time - entry.time) * 1000;
    const heldHr = heldMs / (1000 * 60 * 60);
    const pnlPct = ((candle.close - entry.price) / entry.price) * 100;
    for (let k = this.roiTable.length - 1; k >= 0; k--) {
      const row = this.roiTable[k];
      if (heldHr >= row.hours && pnlPct >= row.pct) return { reason: `roi_${row.pct}@${row.hours}h` };
    }
    if (heldHr >= 12) return { reason: 'max_hold_12h' };
    return null;
  },

  stopLoss(entryPrice, ctx, i) {
    const a = ctx.atr[i];
    return a == null ? entryPrice * 0.94 : entryPrice - ctx._p.atrStop * a;
  },

  takeProfit() {
    return null;
  },
};
