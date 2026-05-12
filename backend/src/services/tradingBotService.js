/**
 * Trading Bot Service — Borsa Krali
 *
 * Üst seviye API: Freqtrade'den portlanmış stratejileri + bizim eklediğimiz
 * doğrulama katmanını backend route'larına bağlar.
 *
 * Hem BIST (Yahoo Finance) hem kripto (Binance) destekler. Veri kaynağı
 * tradingBot/dataSources.js'te izole.
 *
 * Endpoint'ler tradingBot.routes.js'te.
 */

const strategies = require('./tradingBot/strategies');
const { runBacktest, getBarsPerYear } = require('./tradingBot/backtest');
const validation = require('./tradingBot/validation');
const { fetchCandles } = require('./tradingBot/dataSources');
const logger = require('../utils/logger');

const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function cacheKey(parts) { return parts.join('|'); }
function getCache(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.t > TTL_MS) { cache.delete(key); return null; }
  return v.data;
}
function setCache(key, data) { cache.set(key, { t: Date.now(), data }); }

function getStrategies() {
  return strategies.list();
}

async function backtest({ market, symbol, strategyId, timeframe, params, lookback, useCache = true }) {
  const strat = strategies.get(strategyId);
  if (!strat) throw new Error(`Strateji bulunamadı: ${strategyId}`);
  const tf = timeframe || strat.timeframe;
  const key = cacheKey(['bt', market, symbol, strategyId, tf, JSON.stringify(params || {}), lookback || '']);
  if (useCache) {
    const c = getCache(key);
    if (c) return c;
  }
  const candles = await fetchCandles({ market, symbol, timeframe: tf, lookback });
  if (!candles || candles.length < strat.warmup + 50) {
    throw new Error(`Yetersiz veri: ${candles?.length || 0} mum, en az ${strat.warmup + 50} gerekli`);
  }
  const barsPerYear = getBarsPerYear(tf, market);
  const res = runBacktest(candles, strat, { params, barsPerYear });
  const out = {
    market, symbol, strategyId, timeframe: tf,
    candlesCount: candles.length,
    from: new Date(candles[0].time * 1000).toISOString(),
    to: new Date(candles[candles.length - 1].time * 1000).toISOString(),
    ...res,
  };
  setCache(key, out);
  return out;
}

async function validate({ market, symbol, strategyId, timeframe, params, lookback }) {
  const strat = strategies.get(strategyId);
  if (!strat) throw new Error(`Strateji bulunamadı: ${strategyId}`);
  const tf = timeframe || strat.timeframe;
  const key = cacheKey(['val', market, symbol, strategyId, tf, JSON.stringify(params || {}), lookback || '']);
  const cached = getCache(key);
  if (cached) return cached;
  const candles = await fetchCandles({ market, symbol, timeframe: tf, lookback });
  if (!candles || candles.length < strat.warmup * 2 + 200) {
    throw new Error(`Sınama için yetersiz veri: ${candles?.length || 0} mum, en az ${strat.warmup * 2 + 200} gerekli`);
  }
  const res = validation.fullValidation(candles, strat, { params, timeframe: tf, market });
  const out = {
    market, symbol, strategyId, timeframe: tf,
    candlesCount: candles.length,
    from: new Date(candles[0].time * 1000).toISOString(),
    to: new Date(candles[candles.length - 1].time * 1000).toISOString(),
    ...res,
  };
  setCache(key, out);
  return out;
}

async function paramSweep({ market, symbol, strategyId, timeframe, paramName, range, baseParams, lookback }) {
  const strat = strategies.get(strategyId);
  if (!strat) throw new Error(`Strateji bulunamadı: ${strategyId}`);
  const tf = timeframe || strat.timeframe;
  const candles = await fetchCandles({ market, symbol, timeframe: tf, lookback });
  if (!candles || candles.length < strat.warmup + 100) {
    throw new Error(`Yetersiz veri`);
  }
  return validation.parameterStability(candles, strat, paramName, range, { timeframe: tf, baseParams });
}

async function currentSignal({ market, symbol, strategyId, timeframe }) {
  const strat = strategies.get(strategyId);
  if (!strat) throw new Error(`Strateji bulunamadı: ${strategyId}`);
  const tf = timeframe || strat.timeframe;
  const candles = await fetchCandles({ market, symbol, timeframe: tf, lookback: 365 });
  if (!candles || candles.length < strat.warmup + 5) {
    return { signal: 'no_data', candlesCount: candles?.length || 0 };
  }
  const ctxBase = strat.populate(candles);
  const ctx = { ...ctxBase, candles };
  const i = candles.length - 1;
  const lastCandle = candles[i];
  const dir = strat.direction || 'long';

  let signal = 'NONE';
  let stop = null, target = null;
  if ((dir === 'long' || dir === 'both') && strat.entryLong && strat.entryLong(ctx, i)) {
    signal = 'ENTRY_LONG';
    stop = strat.stopLoss ? strat.stopLoss(lastCandle.close, ctx, i) : null;
    target = strat.takeProfit ? strat.takeProfit(lastCandle.close, ctx, i) : null;
  } else if ((dir === 'short' || dir === 'both') && strat.entryShort && strat.entryShort(ctx, i)) {
    signal = 'ENTRY_SHORT';
    stop = strat.stopLossShort ? strat.stopLossShort(lastCandle.close, ctx, i) : null;
    target = strat.takeProfitShort ? strat.takeProfitShort(lastCandle.close, ctx, i) : null;
  } else if (dir === 'long' && strat.exitLong && strat.exitLong(ctx, i)) {
    signal = 'EXIT_LONG';
  } else if (dir === 'short' && strat.exitShort && strat.exitShort(ctx, i)) {
    signal = 'EXIT_SHORT';
  }
  let expectedRR = null;
  if (stop != null && target != null) {
    if (signal === 'ENTRY_LONG' && lastCandle.close > stop) {
      expectedRR = +((target - lastCandle.close) / (lastCandle.close - stop)).toFixed(2);
    } else if (signal === 'ENTRY_SHORT' && stop > lastCandle.close) {
      expectedRR = +((lastCandle.close - target) / (stop - lastCandle.close)).toFixed(2);
    }
  }
  const regime = validation.regimeFilter(candles);
  return {
    market, symbol, strategyId, timeframe: tf,
    lastClose: lastCandle.close,
    lastTime: new Date(lastCandle.time * 1000).toISOString(),
    signal,
    suggestedStop: stop,
    suggestedTarget: target,
    expectedRR,
    regime,
  };
}

async function scan({ market, strategyId, timeframe, universe }) {
  const strat = strategies.get(strategyId);
  if (!strat) throw new Error(`Strateji bulunamadı: ${strategyId}`);
  const tf = timeframe || strat.timeframe;
  let symbols = [];
  if (market === 'crypto') {
    symbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'AVAX', 'DOGE', 'DOT', 'MATIC', 'LINK', 'TRX', 'LTC', 'BCH', 'NEAR'];
  } else if (market === 'bist') {
    const { bist30Stocks } = require('../data/allBistStocks');
    symbols = (bist30Stocks || []).map(s => s.symbol).slice(0, 30);
  } else {
    throw new Error('Bilinmeyen market');
  }
  const results = [];
  const batchSize = 4;
  for (let b = 0; b < symbols.length; b += batchSize) {
    const batch = symbols.slice(b, b + batchSize);
    const batchRes = await Promise.allSettled(batch.map(sym => currentSignal({ market, symbol: sym, strategyId, timeframe: tf })));
    for (const r of batchRes) {
      if (r.status === 'fulfilled' && (r.value.signal === 'ENTRY_LONG' || r.value.signal === 'ENTRY_SHORT')) {
        results.push(r.value);
      }
    }
    if (b + batchSize < symbols.length) await new Promise(res => setTimeout(res, 200));
  }
  return { market, strategyId, timeframe: tf, universe: universe || (market === 'crypto' ? 'top15' : 'bist30'), scannedAt: new Date().toISOString(), hits: results };
}

async function compareAll({ market, symbol, timeframe, lookback }) {
  const key = cacheKey(['cmp', market, symbol, timeframe || 'auto', lookback || '']);
  const cached = getCache(key);
  if (cached) return cached;
  const list = strategies.list();
  const tasks = list.map(async (s) => {
    try {
      const tf = timeframe || s.timeframe;
      const r = await backtest({ market, symbol, strategyId: s.id, timeframe: tf, lookback, useCache: true });
      return {
        strategyId: s.id,
        name: s.name,
        direction: s.direction,
        timeframe: tf,
        metrics: r.metrics,
        candlesCount: r.candlesCount,
        finalBalance: r.finalBalance,
        ok: true,
      };
    } catch (e) {
      return { strategyId: s.id, name: s.name, ok: false, error: e.message };
    }
  });
  const results = await Promise.all(tasks);
  const okResults = results.filter(r => r.ok);
  okResults.sort((a, b) => (b.metrics?.sharpe || -Infinity) - (a.metrics?.sharpe || -Infinity));
  const out = {
    market, symbol, timeframe,
    rankedBySharpe: okResults,
    failed: results.filter(r => !r.ok),
    bestStrategy: okResults[0]?.strategyId || null,
    scannedAt: new Date().toISOString(),
  };
  setCache(key, out);
  return out;
}

module.exports = { getStrategies, backtest, validate, paramSweep, currentSignal, scan, compareAll };
