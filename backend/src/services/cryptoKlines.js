/**
 * cryptoKlines — Kripto OHLC veri katmanı (Yahoo Finance chart endpoint).
 *
 * Render prod ortamı (ABD datacenter IP) kripto borsalarına kapalı:
 *   - Binance REST  → HTTP 451 (coğrafi engel)
 *   - Bybit  REST   → HTTP 403 (coğrafi engel)
 *   - CoinGecko     → HTTP 429 (rate limit)
 * Yahoo Finance chart endpoint kripto için de açık (BIST tarafıyla aynı
 * altyapı; query1.finance.yahoo.com, crumb gerektirmez). Kripto sembolleri
 * Yahoo'da `{SYM}-USD` formatında (BTC-USD, ETH-USD ...).
 *
 * 4h interval'ı Yahoo'da yok → 1h çekilip 4'erli (UTC sınırına hizalı) toplanır.
 * Mum formatı: { time(saniye), open, high, low, close, volume } — eski→yeni.
 */
const axios = require('axios');

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// TF → Yahoo interval (4h/8h hariç — onlar 1h'ten resample edilir)
const YH_INTERVAL = {
  '1m': '1m', '2m': '2m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '1d': '1d', '1w': '1wk', '1M': '1mo',
};
// TF → 250+ mum için yeterli Yahoo `range`
const YH_RANGE = {
  '1m': '7d', '2m': '1mo', '5m': '1mo', '15m': '1mo', '30m': '2mo',
  '1h': '3mo', '4h': '6mo', '8h': '1y', '1d': '2y', '1w': '5y', '1M': '10y',
};
// TF → saniye (period1/period2 hesabı için)
const TF_SEC = {
  '1m': 60, '2m': 120, '5m': 300, '15m': 900, '30m': 1800,
  '1h': 3600, '4h': 14400, '8h': 28800, '1d': 86400, '1w': 604800, '1M': 2592000,
};

function parseChart(json) {
  const r = json?.chart?.result?.[0];
  if (!r || !r.timestamp) return null;
  const ts = r.timestamp;
  const q = r.indicators?.quote?.[0] || {};
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    if (!(c > 0)) continue;
    out.push({ time: ts[i], open: +o, high: +h, low: +l, close: +c, volume: +(q.volume?.[i] || 0) });
  }
  return out;
}

// 1h mumlarını N saatlik bara topla (UTC N*3600 sınırına hizalı). 4h→4, 8h→8.
function resampleHours(h1, hours) {
  if (!h1 || !h1.length) return h1 || [];
  const sec = hours * 3600;
  let start = 0;
  while (start < h1.length && h1[start].time % sec !== 0) start++;
  if (start >= h1.length) start = 0;
  const out = [];
  for (let i = start; i < h1.length; i += hours) {
    const g = h1.slice(i, i + hours);
    if (!g.length) break;
    out.push({
      time: g[0].time,
      open: g[0].open,
      high: Math.max(...g.map(c => c.high)),
      low: Math.min(...g.map(c => c.low)),
      close: g[g.length - 1].close,
      volume: g.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}
const resample4h = (h1) => resampleHours(h1, 4); // geriye uyum

async function yahooFetch(symbol, params) {
  const res = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(symbol)}-USD`, {
    params, timeout: 15000, headers: { 'User-Agent': UA },
  });
  return parseChart(res.data);
}

// Güncel mumlar (oldest→newest); yetersizse null
async function fetchCandles(symbol, tf, limit = 250) {
  try {
    let candles;
    if (tf === '4h' || tf === '8h') {
      const hrs = tf === '4h' ? 4 : 8;
      candles = resampleHours(await yahooFetch(symbol, { interval: '1h', range: YH_RANGE[tf] }), hrs);
    } else {
      const yi = YH_INTERVAL[tf];
      if (!yi) return null;
      candles = await yahooFetch(symbol, { interval: yi, range: YH_RANGE[tf] || '1y' });
    }
    if (!candles || !candles.length) return null;
    return candles.slice(-limit);
  } catch (e) {
    return null;
  }
}

// endMs'te biten geçmiş mumlar (backtest — geleceği sızdırmaz)
async function fetchCandlesHistorical(symbol, tf, endMs, limit = 250) {
  try {
    const p2 = Math.floor(endMs / 1000);
    let candles;
    if (tf === '4h') {
      const p1 = p2 - TF_SEC['1h'] * (limit + 8) * 4;
      candles = resample4h(await yahooFetch(symbol, { interval: '1h', period1: p1, period2: p2 }));
    } else {
      const yi = YH_INTERVAL[tf];
      if (!yi) return null;
      const p1 = p2 - (TF_SEC[tf] || 86400) * (limit + 8);
      candles = await yahooFetch(symbol, { interval: yi, period1: p1, period2: p2 });
    }
    if (!candles) return null;
    return candles.filter(c => c.time <= p2).slice(-limit);
  } catch (e) {
    return null;
  }
}

// startMs'ten sonraki ileri mumlar (backtest forward-return)
async function fetchCandlesForward(symbol, tf, startMs, limit = 30) {
  try {
    const p1 = Math.floor(startMs / 1000);
    const yi = tf === '4h' ? '1h' : YH_INTERVAL[tf];
    if (!yi) return [];
    const step = tf === '4h' ? TF_SEC['1h'] : (TF_SEC[tf] || 86400);
    const p2 = p1 + step * (limit + 8) * (tf === '4h' ? 4 : 1);
    let candles = await yahooFetch(symbol, { interval: yi, period1: p1, period2: p2 });
    if (tf === '4h') candles = resample4h(candles);
    if (!candles) return [];
    return candles.filter(c => c.time >= p1).slice(0, limit);
  } catch (e) {
    return [];
  }
}

// Anlık fiyat (son günlük kapanış)
async function getSpotPrice(symbol) {
  const c = await fetchCandles(symbol, '1d', 3);
  return c && c.length ? c[c.length - 1].close : null;
}

module.exports = { fetchCandles, fetchCandlesHistorical, fetchCandlesForward, getSpotPrice };
