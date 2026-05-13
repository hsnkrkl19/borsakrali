/**
 * Data Sources — crypto (multi-exchange) + BIST (Yahoo Finance) candle adapters.
 *
 * Backtest engine'in beklediği shape:
 *   { time:unix_seconds, open, high, low, close, volume }
 *
 * Kripto için sırayla denenen kaynaklar:
 *   1) Binance (api.binance.com) — primary
 *   2) Binance Vision (data-api.binance.vision) — public market data CDN, çoğu zaman 451 atmıyor
 *   3) Bybit (api.bybit.com) — spot kline v5
 *   4) OKX (www.okx.com) — v5 candles (limit 300, gerekirse pagination)
 *   5) KuCoin (api.kucoin.com) — v1 candles
 *
 * Render gibi US data center IP'lerinden Binance HTTP 451 dönebilir;
 * o yüzden fallback zinciri zorunlu.
 */

const axios = require('axios');

const TF_TO_BINANCE = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h',
  '4h': '4h', '1d': '1d', '1w': '1w',
};

const TF_TO_BYBIT = {
  '1m': '1', '5m': '5', '15m': '15', '1h': '60',
  '4h': '240', '1d': 'D', '1w': 'W',
};

const TF_TO_OKX = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H',
  '4h': '4H', '1d': '1D', '1w': '1W',
};

const TF_TO_KUCOIN = {
  '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1hour',
  '4h': '4hour', '1d': '1day', '1w': '1week',
};

const TF_TO_YAHOO_INTERVAL = {
  '1d': '1d',
  '1w': '1wk',
  '1h': '1h',
  '5m': '5m',
};

const HTTP_TIMEOUT = 12000;

const UA = 'Mozilla/5.0 (compatible; BorsaKraliBot/1.0)';

function normalizeCandles(arr) {
  return (arr || [])
    .filter(c => c && Number.isFinite(c.close) && Number.isFinite(c.open))
    .sort((a, b) => a.time - b.time);
}

async function fromBinance(symbol, timeframe, limit, endTimeMs, base = 'https://api.binance.com') {
  const interval = TF_TO_BINANCE[timeframe];
  if (!interval) throw new Error(`Geçersiz timeframe: ${timeframe}`);
  const params = { symbol: `${symbol}USDT`, interval, limit };
  if (endTimeMs) params.endTime = endTimeMs;
  const res = await axios.get(`${base}/api/v3/klines`, {
    params,
    timeout: HTTP_TIMEOUT,
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  });
  const candles = (res.data || []).map(k => ({
    time: Math.floor(k[0] / 1000),
    open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
  }));
  if (!candles.length) throw new Error('Binance: boş yanıt');
  return normalizeCandles(candles);
}

async function fromBybit(symbol, timeframe, limit) {
  const interval = TF_TO_BYBIT[timeframe];
  if (!interval) throw new Error(`Bybit için desteklenmeyen timeframe: ${timeframe}`);
  const params = {
    category: 'spot',
    symbol: `${symbol}USDT`,
    interval,
    limit: Math.min(limit, 1000),
  };
  const res = await axios.get('https://api.bybit.com/v5/market/kline', {
    params,
    timeout: HTTP_TIMEOUT,
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  });
  if (res.data?.retCode !== 0) {
    throw new Error(`Bybit retCode=${res.data?.retCode} ${res.data?.retMsg || ''}`);
  }
  const list = res.data?.result?.list || [];
  const candles = list.map(k => ({
    time: Math.floor(Number(k[0]) / 1000),
    open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
  }));
  if (!candles.length) throw new Error('Bybit: boş yanıt');
  return normalizeCandles(candles);
}

async function fromOkx(symbol, timeframe, limit) {
  const bar = TF_TO_OKX[timeframe];
  if (!bar) throw new Error(`OKX için desteklenmeyen timeframe: ${timeframe}`);
  // OKX history-candles limit 100; market/candles 300. Pagination ile birleştir.
  const PAGE = 300;
  const target = Math.min(limit, 1000);
  let collected = [];
  let after = undefined;
  while (collected.length < target) {
    const params = { instId: `${symbol}-USDT`, bar, limit: PAGE };
    if (after) params.after = after;
    const res = await axios.get('https://www.okx.com/api/v5/market/candles', {
      params,
      timeout: HTTP_TIMEOUT,
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });
    if (res.data?.code !== '0') {
      throw new Error(`OKX code=${res.data?.code} ${res.data?.msg || ''}`);
    }
    const rows = res.data?.data || [];
    if (!rows.length) break;
    const batch = rows.map(k => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    }));
    collected = collected.concat(batch);
    // En eski timestamp'i 'after' olarak gönder ki ondan eskileri çeksin
    after = rows[rows.length - 1][0];
    if (rows.length < PAGE) break;
  }
  if (!collected.length) throw new Error('OKX: boş yanıt');
  return normalizeCandles(collected.slice(0, target));
}

async function fromKucoin(symbol, timeframe, limit) {
  const type = TF_TO_KUCOIN[timeframe];
  if (!type) throw new Error(`KuCoin için desteklenmeyen timeframe: ${timeframe}`);
  const tfSeconds = {
    '1m': 60, '5m': 300, '15m': 900, '1h': 3600,
    '4h': 14400, '1d': 86400, '1w': 604800,
  }[timeframe];
  const endAt = Math.floor(Date.now() / 1000);
  const startAt = endAt - tfSeconds * Math.min(limit, 1500);
  const res = await axios.get('https://api.kucoin.com/api/v1/market/candles', {
    params: { symbol: `${symbol}-USDT`, type, startAt, endAt },
    timeout: HTTP_TIMEOUT,
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
  });
  if (res.data?.code !== '200000') {
    throw new Error(`KuCoin code=${res.data?.code} ${res.data?.msg || ''}`);
  }
  const rows = res.data?.data || [];
  const candles = rows.map(k => ({
    time: Number(k[0]),
    open: +k[1], close: +k[2], high: +k[3], low: +k[4], volume: +k[5],
  }));
  if (!candles.length) throw new Error('KuCoin: boş yanıt');
  return normalizeCandles(candles);
}

const SOURCES = [
  { name: 'binance', fn: (sym, tf, lim) => fromBinance(sym, tf, lim, undefined, 'https://api.binance.com') },
  { name: 'binance-vision', fn: (sym, tf, lim) => fromBinance(sym, tf, lim, undefined, 'https://data-api.binance.vision') },
  { name: 'bybit', fn: fromBybit },
  { name: 'okx', fn: fromOkx },
  { name: 'kucoin', fn: fromKucoin },
];

// Hızlı kara liste: bir kaynak 451/blocked dönerse N süre boyunca tekrar deneme
const sourceBlackoutUntil = new Map();
const BLACKOUT_MS = 10 * 60 * 1000; // 10 dakika

function isPermanentBlock(err) {
  const status = err?.response?.status;
  // 451 (legal block), 403 (forbidden) → bu IP buraya erişemez
  return status === 451 || status === 403 || status === 418;
}

async function fetchCryptoCandles(symbol, timeframe, limit = 1000, endTimeMs) {
  // endTimeMs sadece Binance ailesi destekliyor (backtest as-of); fallback'lerde "şu anki"
  // veriye düşer. Production'da endTimeMs nadiren kullanılıyor.
  const errors = [];
  const now = Date.now();

  for (const src of SOURCES) {
    const blockedUntil = sourceBlackoutUntil.get(src.name) || 0;
    if (blockedUntil > now) {
      errors.push(`${src.name}: blackout`);
      continue;
    }
    try {
      const candles = endTimeMs && src.name.startsWith('binance')
        ? await fromBinance(symbol, timeframe, limit, endTimeMs, src.name === 'binance' ? 'https://api.binance.com' : 'https://data-api.binance.vision')
        : await src.fn(symbol, timeframe, limit);
      if (candles.length) return candles;
      errors.push(`${src.name}: boş`);
    } catch (e) {
      const msg = e?.response?.status ? `HTTP ${e.response.status}` : e.message;
      errors.push(`${src.name}: ${msg}`);
      if (isPermanentBlock(e)) {
        sourceBlackoutUntil.set(src.name, now + BLACKOUT_MS);
      }
    }
  }

  throw new Error(`Tüm kripto veri kaynakları başarısız oldu — ${errors.join(' | ')}`);
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

function getSourceStatus() {
  const now = Date.now();
  return SOURCES.map(s => ({
    name: s.name,
    blockedUntil: sourceBlackoutUntil.get(s.name) || 0,
    blocked: (sourceBlackoutUntil.get(s.name) || 0) > now,
  }));
}

module.exports = { fetchCryptoCandles, fetchBistCandles, fetchCandles, getSourceStatus };
