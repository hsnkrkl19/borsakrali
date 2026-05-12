/**
 * Data Sources — crypto (Binance) + BIST (Yahoo Finance) candle adapters.
 *
 * Backtest engine'in beklediği shape:
 *   { time:unix_seconds, open, high, low, close, volume }
 */

const axios = require('axios');

const BINANCE_BASE = 'https://api.binance.com';

const TF_TO_BINANCE = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h',
  '4h': '4h', '1d': '1d', '1w': '1w',
};

const TF_TO_YAHOO_INTERVAL = {
  '1d': '1d',
  '1w': '1wk',
  '1h': '1h',
  '5m': '5m',
};

async function fetchCryptoCandles(symbol, timeframe, limit = 1000, endTimeMs) {
  const interval = TF_TO_BINANCE[timeframe];
  if (!interval) throw new Error(`Geçersiz timeframe: ${timeframe}`);
  const params = { symbol: `${symbol}USDT`, interval, limit };
  if (endTimeMs) params.endTime = endTimeMs;
  try {
    const res = await axios.get(`${BINANCE_BASE}/api/v3/klines`, { params, timeout: 15000 });
    return (res.data || []).map(k => ({
      time: Math.floor(k[0] / 1000),
      open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    }));
  } catch (e) {
    throw new Error(`Binance klines hatası ${symbol}/${interval}: ${e.message}`);
  }
}

let _yfInstance = null;
const getYF = async () => {
  if (!_yfInstance) {
    const mod = await import('yahoo-finance2');
    const YF = mod.default || mod;
    _yfInstance = new YF();
  }
  return _yfInstance;
};

async function fetchBistCandles(symbol, timeframe, lookbackDays = 365) {
  const interval = TF_TO_YAHOO_INTERVAL[timeframe];
  if (!interval) throw new Error(`BIST için desteklenmeyen timeframe: ${timeframe}`);
  const yahooSymbol = `${symbol.replace('.IS', '')}.IS`;
  const yf = await getYF();
  const period1 = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000);
  const res = await yf.chart(yahooSymbol, { period1, interval }, { timeout: 30000 });
  if (!res || !res.quotes) return [];
  return res.quotes
    .filter(q => q.close != null && q.open != null && q.high != null && q.low != null)
    .map(q => ({
      time: Math.floor(new Date(q.date).getTime() / 1000),
      open: +q.open,
      high: +q.high,
      low: +q.low,
      close: +q.close,
      volume: +(q.volume || 0),
    }));
}

async function fetchCandles({ market, symbol, timeframe, lookback }) {
  if (market === 'crypto') {
    const limit = Math.min(Math.max(lookback || 1000, 200), 1000);
    return fetchCryptoCandles(symbol, timeframe, limit);
  }
  if (market === 'bist') {
    return fetchBistCandles(symbol, timeframe, lookback || 365);
  }
  throw new Error(`Bilinmeyen market: ${market}`);
}

module.exports = { fetchCryptoCandles, fetchBistCandles, fetchCandles };
