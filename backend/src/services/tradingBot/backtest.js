/**
 * Backtest Engine — Borsa Krali Trading Bot
 *
 * Look-ahead-bias-free, bar-bar simülasyon:
 *   1. Bar i'de sinyal üretilirse, GİRİŞ bir sonraki barın açılış fiyatından
 *      olur (sinyal mumun kapanışında belli olur, sonraki mumun açılışında
 *      işlem girilir). Jesse'nin disiplini.
 *   2. ÇIKIŞ önceliği: intra-bar stop loss → take profit → strateji exit →
 *      custom exit (ROI tablosu vs.). Stop ve target aynı barda tetiklenirse
 *      stop önce kabul edilir (muhafazakâr).
 *   3. Komisyon her giriş + her çıkışta uygulanır (default %0.1, Binance
 *      taker). Slippage entry'de open + slipBps, exit stop'ta stop - slipBps.
 *
 * Metrikler: totalReturnPct, sharpe (yıllık), sortino, profitFactor, maxDDPct,
 * winRate, expectancyR, avgTradeBars, totalTrades.
 */

const DEFAULTS = {
  initialBalance: 10000,
  feePerSide: 0.001,    // %0.1
  slippageBps: 5,       // 5 bps = %0.05
  positionSizePct: 1.0, // tüm bakiye (single-position simulator)
  barsPerYear: 365 * 24,// 1h candles için (TF'e göre dışarıdan override)
};

function applyFee(price, fee, side) {
  return side === 'buy' ? price * (1 + fee) : price * (1 - fee);
}

function applySlippage(price, slipBps, side) {
  const s = slipBps / 10000;
  return side === 'buy' ? price * (1 + s) : price * (1 - s);
}

function runBacktest(candles, strategy, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const params = opts.params || {};
  const ctxBase = strategy.populate(candles, params);
  const ctx = { ...ctxBase, candles };

  let balance = cfg.initialBalance;
  let position = null;
  let pendingEntry = null;
  const trades = [];
  const equityCurve = [];

  const allowedSide = strategy.direction || 'long';

  for (let i = 0; i < candles.length; i++) {
    if (pendingEntry && pendingEntry.bar === i) {
      const rawOpen = candles[i].open;
      if (!isFinite(rawOpen) || rawOpen <= 0) { pendingEntry = null; }
      else {
        const side = pendingEntry.side;
        const fillSide = side === 'long' ? 'buy' : 'sell';
        const fillPrice = applyFee(applySlippage(rawOpen, cfg.slippageBps, fillSide), cfg.feePerSide, fillSide);
        const signalIdx = Math.max(0, i - 1);
        const slFn = side === 'long' ? strategy.stopLoss : strategy.stopLossShort;
        const tpFn = side === 'long' ? strategy.takeProfit : strategy.takeProfitShort;
        let sl = slFn ? slFn(fillPrice, ctx, signalIdx) : null;
        let tp = tpFn ? tpFn(fillPrice, ctx, signalIdx) : null;
        if (side === 'long') {
          if (sl != null && (!isFinite(sl) || sl >= fillPrice)) sl = null;
          if (tp != null && (!isFinite(tp) || tp <= fillPrice)) tp = null;
        } else {
          if (sl != null && (!isFinite(sl) || sl <= fillPrice)) sl = null;
          if (tp != null && (!isFinite(tp) || tp >= fillPrice)) tp = null;
        }
        const size = (balance * cfg.positionSizePct) / fillPrice;
        const riskDelta = side === 'long' ? fillPrice - sl : sl - fillPrice;
        const initialRisk = sl != null && riskDelta > 0 ? riskDelta : null;
        position = {
          side,
          entryBar: i,
          entryTime: candles[i].time,
          entryPrice: fillPrice,
          rawEntry: rawOpen,
          size,
          stopLoss: sl,
          takeProfit: tp,
          initialRisk,
        };
        pendingEntry = null;
      }
    }

    if (position) {
      const c = candles[i];
      let exitInfo = null;
      const isLong = position.side === 'long';
      const fillSide = isLong ? 'sell' : 'buy';
      const stopHit = isLong
        ? (position.stopLoss != null && c.low <= position.stopLoss)
        : (position.stopLoss != null && c.high >= position.stopLoss);
      const targetHit = isLong
        ? (position.takeProfit != null && c.high >= position.takeProfit)
        : (position.takeProfit != null && c.low <= position.takeProfit);
      if (stopHit && i > position.entryBar) {
        const px = applyFee(applySlippage(position.stopLoss, cfg.slippageBps, fillSide), cfg.feePerSide, fillSide);
        exitInfo = { price: px, reason: 'stop_loss', time: c.time };
      } else if (targetHit && i > position.entryBar) {
        const px = applyFee(applySlippage(position.takeProfit, cfg.slippageBps, fillSide), cfg.feePerSide, fillSide);
        exitInfo = { price: px, reason: 'take_profit', time: c.time };
      } else if (i > position.entryBar) {
        const exitFn = isLong ? strategy.exitLong : strategy.exitShort;
        if (exitFn && exitFn(ctx, i)) {
          const px = applyFee(applySlippage(c.close, cfg.slippageBps, fillSide), cfg.feePerSide, fillSide);
          exitInfo = { price: px, reason: 'strategy_exit', time: c.time };
        } else if (strategy.customExit) {
          const r = strategy.customExit({ time: position.entryTime, price: position.entryPrice, side: position.side }, ctx, i);
          if (r) {
            const px = applyFee(applySlippage(c.close, cfg.slippageBps, fillSide), cfg.feePerSide, fillSide);
            exitInfo = { price: px, reason: r.reason || 'custom_exit', time: c.time };
          }
        }
      }
      if (exitInfo) {
        const dirSign = isLong ? 1 : -1;
        const pnl = (exitInfo.price - position.entryPrice) * position.size * dirSign;
        const pnlPct = ((exitInfo.price - position.entryPrice) / position.entryPrice) * 100 * dirSign;
        const R = position.initialRisk && position.initialRisk > 0
          ? ((exitInfo.price - position.entryPrice) * dirSign) / position.initialRisk
          : null;
        balance += pnl;
        trades.push({
          side: position.side,
          entryTime: position.entryTime,
          entryPrice: position.entryPrice,
          exitTime: exitInfo.time,
          exitPrice: exitInfo.price,
          size: position.size,
          pnl,
          pnlPct,
          R,
          reason: exitInfo.reason,
          barsHeld: i - position.entryBar,
        });
        position = null;
      }
    }

    if (!position && pendingEntry == null) {
      if ((allowedSide === 'long' || allowedSide === 'both') && strategy.entryLong && strategy.entryLong(ctx, i)) {
        pendingEntry = { bar: i + 1, side: 'long' };
      } else if ((allowedSide === 'short' || allowedSide === 'both') && strategy.entryShort && strategy.entryShort(ctx, i)) {
        pendingEntry = { bar: i + 1, side: 'short' };
      }
    }

    const equity = position
      ? balance + (candles[i].close - position.entryPrice) * position.size * (position.side === 'long' ? 1 : -1)
      : balance;
    equityCurve.push({ time: candles[i].time, equity });
  }

  if (position) {
    const lastBar = candles.length - 1;
    const c = candles[lastBar];
    const isLong = position.side === 'long';
    const fillSide = isLong ? 'sell' : 'buy';
    const dirSign = isLong ? 1 : -1;
    const px = applyFee(applySlippage(c.close, cfg.slippageBps, fillSide), cfg.feePerSide, fillSide);
    const pnl = (px - position.entryPrice) * position.size * dirSign;
    const pnlPct = ((px - position.entryPrice) / position.entryPrice) * 100 * dirSign;
    balance += pnl;
    trades.push({
      side: position.side,
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      exitTime: c.time,
      exitPrice: px,
      size: position.size,
      pnl,
      pnlPct,
      R: position.initialRisk && position.initialRisk > 0 ? ((px - position.entryPrice) * dirSign) / position.initialRisk : null,
      reason: 'end_of_data',
      barsHeld: lastBar - position.entryBar,
    });
  }

  const metrics = computeMetrics(trades, equityCurve, cfg);
  return { trades, equityCurve, metrics, finalBalance: balance, initialBalance: cfg.initialBalance };
}

function computeMetrics(trades, equityCurve, cfg) {
  if (trades.length === 0) {
    return {
      totalReturnPct: 0,
      sharpe: 0,
      sortino: 0,
      profitFactor: 0,
      maxDDPct: 0,
      winRate: 0,
      expectancyR: 0,
      avgTradeBars: 0,
      totalTrades: 0,
      grossProfit: 0,
      grossLoss: 0,
    };
  }
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const finalEq = equityCurve[equityCurve.length - 1].equity;
  const totalReturnPct = ((finalEq - cfg.initialBalance) / cfg.initialBalance) * 100;

  let peak = -Infinity, maxDD = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak === 0 ? 0 : ((peak - p.equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const r = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
    returns.push(r);
  }
  const meanR = returns.reduce((a, b) => a + b, 0) / Math.max(returns.length, 1);
  const sdR = Math.sqrt(returns.reduce((a, b) => a + (b - meanR) ** 2, 0) / Math.max(returns.length - 1, 1));
  const annual = cfg.barsPerYear;
  const sharpe = sdR === 0 ? 0 : (meanR / sdR) * Math.sqrt(annual);
  const downside = returns.filter(r => r < 0);
  const sdDown = Math.sqrt(downside.reduce((a, b) => a + b * b, 0) / Math.max(downside.length - 1, 1));
  const sortino = sdDown === 0 ? 0 : (meanR / sdDown) * Math.sqrt(annual);

  const RArr = trades.filter(t => t.R != null).map(t => t.R);
  const expectancyR = RArr.length ? RArr.reduce((a, b) => a + b, 0) / RArr.length : 0;
  const avgBars = trades.reduce((a, t) => a + t.barsHeld, 0) / trades.length;

  return {
    totalReturnPct: +totalReturnPct.toFixed(2),
    sharpe: +sharpe.toFixed(3),
    sortino: +sortino.toFixed(3),
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? 999.99 : 0) : +(grossProfit / grossLoss).toFixed(2),
    maxDDPct: +maxDD.toFixed(2),
    winRate: +((wins.length / trades.length) * 100).toFixed(2),
    expectancyR: +expectancyR.toFixed(3),
    avgTradeBars: +avgBars.toFixed(1),
    totalTrades: trades.length,
    grossProfit: +grossProfit.toFixed(2),
    grossLoss: +grossLoss.toFixed(2),
  };
}

// Kripto 24/7 piyasalar. BIST 10:00-18:00 (≈7sa) × 252 işgünü.
const BARS_PER_YEAR_CRYPTO = {
  '1m':  525600, '5m': 105120, '15m': 35040, '1h': 8760,
  '4h':  2190,   '1d': 365,    '1w': 52,
};
const BARS_PER_YEAR_BIST = {
  '5m': 21168, '15m': 7056, '1h': 1764,
  '4h': 441,   '1d': 252,   '1w': 52,
};

function getBarsPerYear(timeframe, market = 'crypto') {
  const map = market === 'bist' ? BARS_PER_YEAR_BIST : BARS_PER_YEAR_CRYPTO;
  return map[timeframe] || (market === 'bist' ? 252 : 8760);
}

const BARS_PER_YEAR = BARS_PER_YEAR_CRYPTO; // geriye uyumluluk

module.exports = { runBacktest, computeMetrics, BARS_PER_YEAR, BARS_PER_YEAR_BIST, getBarsPerYear };
