/**
 * forexKlines — Forex/parite OHLC veri katmanı (Yahoo Finance chart endpoint).
 *
 * cryptoKlines ile aynı altyapı, fakat sembol Yahoo'da olduğu gibi tam verilir
 * (EURUSD=X, GC=F, NQ=F, BTC-USD ...). Çoklu zaman dilimi (her birine ayrı
 * sinyal): 5m, 15m, 1h, 4h, 1d (+ canlı fiyat için 1m).
 *   4h → Yahoo'da yok, 1h çekilip 4'erli (UTC sınırına hizalı) toplanır.
 *
 * Mum formatı: { time(saniye), open, high, low, close, volume } — eski→yeni.
 * Her (sembol, tf) için kısa TTL cache — her dk tarama Yahoo'yu boğmasın.
 */
const axios = require('axios');

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Doğrudan Yahoo interval'ı olan TF'ler (4h hariç — 1h'ten resample edilir)
const YH_INTERVAL = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '1d': '1d', '1wk': '1wk' };
// 250+ mum için yeterli range. 4h/8h için 1h'i geniş çekip resample ederiz.
const YH_RANGE    = { '1m': '1d', '5m': '5d', '15m': '1mo', '30m': '2mo', '1h': '3mo', '4h': '6mo', '8h': '1y', '1d': '2y', '1wk': '5y' };

// Cache ömrü — düşük TF sık, yüksek TF seyrek tazelenir.
const TTL_MS = {
  '1m': 50 * 1000, '5m': 4 * 60 * 1000, '15m': 9 * 60 * 1000,
  '1h': 30 * 60 * 1000, '4h': 30 * 60 * 1000, '8h': 30 * 60 * 1000, '1d': 60 * 60 * 1000,
};

const cache = new Map(); // key -> { data, t }

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

async function yahooFetch(yahooSymbol, params) {
  const res = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(yahooSymbol)}`, {
    params, timeout: 15000, headers: { 'User-Agent': UA },
  });
  return parseChart(res.data);
}

/**
 * Güncel mumlar (oldest→newest). yahooSymbol Yahoo formatında tam sembol.
 * Yetersiz/erişilemez → null.
 */
async function fetchCandles(yahooSymbol, tf, limit = 300) {
  const key = `${yahooSymbol}:${tf}:${limit}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < (TTL_MS[tf] || 60 * 1000)) return hit.data;
  try {
    let candles;
    if (tf === '4h' || tf === '8h') {
      const hrs = tf === '4h' ? 4 : 8;
      candles = resampleHours(await yahooFetch(yahooSymbol, { interval: '1h', range: YH_RANGE[tf] }), hrs);
    } else {
      const yi = YH_INTERVAL[tf];
      if (!yi) return null;
      candles = await yahooFetch(yahooSymbol, { interval: yi, range: YH_RANGE[tf] || '5d' });
    }
    const data = candles && candles.length ? candles.slice(-limit) : null;
    cache.set(key, { data, t: now });
    return data;
  } catch (e) {
    // Hata anında bayat cache'i (varsa) döndür — kısa kesintilerde sinyal düşmesin
    if (hit) return hit.data;
    cache.set(key, { data: null, t: now });
    return null;
  }
}

module.exports = { fetchCandles };
