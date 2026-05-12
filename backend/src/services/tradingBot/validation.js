/**
 * Validation Layer — Borsa Krali Trading Bot
 *
 * Strateji bir backtest pasajında iyi sonuç verebilir. ASIL soru: "Bu sonuç
 * şans mı, gerçek bir edge mi?" Burada Robert Pardo'nun "Walk-Forward
 * Optimization" yaklaşımı + Monte Carlo permutation test'i + parameter
 * stability heatmap birleştiriliyor.
 *
 * 5 sınama:
 *   1. walkForward       — N pencere, her birinde in/out sample backtest
 *   2. outOfSample       — tek 70/30 split
 *   3. monteCarlo        — trade dizisini permüte/bootstrap, dağılım çıkar
 *   4. parameterStability— param sweep, performans nasıl değişir
 *   5. slippageStress    — slip artarken degrade
 *
 * Her sınama "robustness score" döner (0-100). Hepsi >= 60 ise "live trade'e
 * uygun" demektir. Aksi: sadece kâğıt üzerinde test edilmeli.
 */

const { runBacktest, getBarsPerYear } = require('./backtest');

function walkForward(candles, strategy, opts = {}) {
  const { windows = 5, trainRatio = 0.7, params, timeframe = '1h', market = 'crypto' } = opts;
  const barsPerYear = getBarsPerYear(timeframe, market);
  const results = [];
  const windowSize = Math.floor(candles.length / windows);
  if (windowSize < strategy.warmup + 50) {
    return { error: 'Yetersiz veri — pencere boyutu warmup\'tan küçük', windows: [], score: 0 };
  }
  for (let w = 0; w < windows; w++) {
    const start = w * windowSize;
    const end = w === windows - 1 ? candles.length : start + windowSize;
    const slice = candles.slice(start, end);
    const splitIdx = Math.floor(slice.length * trainRatio);
    const inSample = slice.slice(0, splitIdx);
    const outSample = slice.slice(splitIdx);
    if (inSample.length < strategy.warmup + 10 || outSample.length < 20) continue;
    const inRes = runBacktest(inSample, strategy, { params, barsPerYear });
    const outRes = runBacktest(outSample, strategy, { params, barsPerYear });
    results.push({
      window: w + 1,
      inSample: { ret: inRes.metrics.totalReturnPct, sharpe: inRes.metrics.sharpe, trades: inRes.metrics.totalTrades, winRate: inRes.metrics.winRate },
      outSample: { ret: outRes.metrics.totalReturnPct, sharpe: outRes.metrics.sharpe, trades: outRes.metrics.totalTrades, winRate: outRes.metrics.winRate },
      consistent: Math.sign(inRes.metrics.totalReturnPct) === Math.sign(outRes.metrics.totalReturnPct),
    });
  }
  const consistent = results.filter(r => r.consistent).length;
  const score = results.length === 0 ? 0 : Math.round((consistent / results.length) * 100);
  return { windows: results, consistencyRate: score, score };
}

function outOfSample(candles, strategy, opts = {}) {
  const { trainRatio = 0.7, params, timeframe = '1h', market = 'crypto' } = opts;
  const barsPerYear = getBarsPerYear(timeframe, market);
  const splitIdx = Math.floor(candles.length * trainRatio);
  const inSample = candles.slice(0, splitIdx);
  const outSample = candles.slice(splitIdx);
  if (inSample.length < strategy.warmup + 50 || outSample.length < 50) {
    return { error: 'Yetersiz veri', score: 0 };
  }
  const inRes = runBacktest(inSample, strategy, { params, barsPerYear });
  const outRes = runBacktest(outSample, strategy, { params, barsPerYear });
  const inSharpe = inRes.metrics.sharpe;
  const outSharpe = outRes.metrics.sharpe;
  let degradation = 0;
  if (inSharpe > 0) {
    degradation = Math.max(0, (inSharpe - outSharpe) / inSharpe) * 100;
  }
  const sameSign = Math.sign(inRes.metrics.totalReturnPct) === Math.sign(outRes.metrics.totalReturnPct);
  const score = Math.round(Math.max(0, 100 - degradation) * (sameSign ? 1 : 0.5));
  return {
    inSample: inRes.metrics,
    outSample: outRes.metrics,
    sharpeDegradationPct: +degradation.toFixed(1),
    consistent: sameSign,
    score,
  };
}

function monteCarlo(trades, opts = {}) {
  const { runs = 1000, initialBalance = 10000 } = opts;
  if (trades.length < 10) {
    return { error: 'En az 10 işlem gerekli', score: 0 };
  }
  const pnls = trades.map(t => t.pnl);
  const finalEquities = [];
  const maxDDs = [];
  for (let r = 0; r < runs; r++) {
    const shuffled = [];
    for (let i = 0; i < pnls.length; i++) {
      shuffled.push(pnls[Math.floor(Math.random() * pnls.length)]);
    }
    let eq = initialBalance, peak = initialBalance, dd = 0;
    for (const pnl of shuffled) {
      eq += pnl;
      if (eq > peak) peak = eq;
      const curDD = peak === 0 ? 0 : ((peak - eq) / peak) * 100;
      if (curDD > dd) dd = curDD;
    }
    finalEquities.push(eq);
    maxDDs.push(dd);
  }
  finalEquities.sort((a, b) => a - b);
  maxDDs.sort((a, b) => a - b);
  const median = finalEquities[Math.floor(runs / 2)];
  const p5 = finalEquities[Math.floor(runs * 0.05)];
  const p95 = finalEquities[Math.floor(runs * 0.95)];
  const ddMedian = maxDDs[Math.floor(runs / 2)];
  const ddP95 = maxDDs[Math.floor(runs * 0.95)];
  const profitableRuns = finalEquities.filter(e => e > initialBalance).length;
  const score = Math.round((profitableRuns / runs) * 100);
  return {
    runs,
    medianFinal: +median.toFixed(2),
    p5Final: +p5.toFixed(2),
    p95Final: +p95.toFixed(2),
    medianMaxDD: +ddMedian.toFixed(2),
    p95MaxDD: +ddP95.toFixed(2),
    profitableRate: score,
    score,
  };
}

function parameterStability(candles, strategy, paramName, range, opts = {}) {
  const { timeframe = '1h', baseParams = {}, market = 'crypto' } = opts;
  const barsPerYear = getBarsPerYear(timeframe, market);
  const results = [];
  for (const val of range) {
    const params = { ...baseParams, [paramName]: val };
    const res = runBacktest(candles, strategy, { params, barsPerYear });
    results.push({
      value: val,
      ret: res.metrics.totalReturnPct,
      sharpe: res.metrics.sharpe,
      trades: res.metrics.totalTrades,
      maxDD: res.metrics.maxDDPct,
      winRate: res.metrics.winRate,
    });
  }
  const profitable = results.filter(r => r.ret > 0).length;
  const score = Math.round((profitable / results.length) * 100);
  const sharpes = results.map(r => r.sharpe);
  const meanSh = sharpes.reduce((a, b) => a + b, 0) / sharpes.length;
  const sdSh = Math.sqrt(sharpes.reduce((a, b) => a + (b - meanSh) ** 2, 0) / sharpes.length);
  const cv = meanSh === 0 ? Infinity : Math.abs(sdSh / meanSh);
  return {
    paramName,
    sweep: results,
    profitableRate: score,
    coefficientOfVariation: +cv.toFixed(3),
    score,
  };
}

function slippageStress(candles, strategy, opts = {}) {
  const { params, timeframe = '1h', slippageBpsRange = [0, 5, 10, 20, 50], market = 'crypto' } = opts;
  const barsPerYear = getBarsPerYear(timeframe, market);
  const results = [];
  for (const slip of slippageBpsRange) {
    const res = runBacktest(candles, strategy, { params, slippageBps: slip, barsPerYear });
    results.push({
      slippageBps: slip,
      ret: res.metrics.totalReturnPct,
      sharpe: res.metrics.sharpe,
      trades: res.metrics.totalTrades,
      profitable: res.metrics.totalReturnPct > 0,
    });
  }
  const passes = results.filter(r => r.profitable).length;
  const score = Math.round((passes / results.length) * 100);
  return { stress: results, robustness: score, score };
}

function regimeFilter(candles, opts = {}) {
  const { lookback = 60 } = opts;
  if (candles.length < lookback) return { regime: 'unknown', score: 0 };
  const recent = candles.slice(-lookback);
  const closes = recent.map(c => c.close);
  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  const trendPct = ((lastClose - firstClose) / firstClose) * 100;
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const meanR = returns.reduce((a, b) => a + b, 0) / returns.length;
  const sdR = Math.sqrt(returns.reduce((a, b) => a + (b - meanR) ** 2, 0) / returns.length);
  const volPct = sdR * 100;
  let regime;
  if (Math.abs(trendPct) < 5 && volPct < 1.5) regime = 'ranging';
  else if (Math.abs(trendPct) >= 15 && volPct < 3) regime = 'trending';
  else if (volPct >= 3) regime = 'volatile';
  else regime = 'mixed';
  return { regime, trendPct: +trendPct.toFixed(2), dailyVolPct: +volPct.toFixed(2) };
}

function fullValidation(candles, strategy, opts = {}) {
  const market = opts.market || 'crypto';
  const tf = opts.timeframe || '1h';
  const wf = walkForward(candles, strategy, opts);
  const oos = outOfSample(candles, strategy, opts);
  const baseRun = runBacktest(candles, strategy, { params: opts.params, barsPerYear: getBarsPerYear(tf, market) });
  const mc = monteCarlo(baseRun.trades, { runs: 1000 });
  const slip = slippageStress(candles, strategy, opts);
  const regime = regimeFilter(candles);
  const scores = [wf.score || 0, oos.score || 0, mc.score || 0, slip.score || 0];
  const robustnessScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  let verdict;
  if (robustnessScore >= 75) verdict = 'STRONG — kâğıt ticarete uygun';
  else if (robustnessScore >= 60) verdict = 'OK — dikkatli kâğıt ticaret';
  else if (robustnessScore >= 40) verdict = 'WEAK — sadece araştırma';
  else verdict = 'REJECT — ticaret yapma';
  return {
    baseBacktest: baseRun.metrics,
    walkForward: wf,
    outOfSample: oos,
    monteCarlo: mc,
    slippageStress: slip,
    regime,
    robustnessScore,
    verdict,
  };
}

module.exports = { walkForward, outOfSample, monteCarlo, parameterStability, slippageStress, regimeFilter, fullValidation };
