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
// ⚠️ 30m: '2mo' Yahoo tarafından 422 ile REDDEDİLİR ("30m data ... must be within
// the last 60 days" — 2 ay 60 günü aşıyor). Ölçüldü (2026-07-23): 2mo→422/0 bar,
// 1mo→1202 bar. Bu yüzden 30m aralığı '1mo'. (15m zaten '1mo' ile aynı sınırda.)
const YH_RANGE    = { '1m': '1d', '5m': '5d', '15m': '1mo', '30m': '1mo', '1h': '3mo', '4h': '6mo', '8h': '1y', '1d': '2y', '1wk': '5y' };

// Cache ömrü — düşük TF sık, yüksek TF seyrek tazelenir.
const TTL_MS = {
  '1m': 50 * 1000, '5m': 4 * 60 * 1000, '15m': 9 * 60 * 1000, '30m': 15 * 60 * 1000,
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

// 1h mumlarını N saatlik bara topla. Her bar KENDİ zaman damgasının
// floor(time / N*3600) buketine atanır (UTC sınırı) — dizi pozisyonuyla
// gruplama YOK: eksik 1h bar (endeks vadelisi bakım saati → 23 barlık gün,
// FX hafta sonu, Yahoo veri deliği) sonraki buketlerin hizasını kaydıramaz.
function resampleHours(h1, hours) {
  if (!h1 || !h1.length) return h1 || [];
  const sec = hours * 3600;
  const out = [];
  let cur = null;
  for (const c of h1) {
    const bucket = Math.floor(c.time / sec) * sec;
    if (!cur || cur.time !== bucket) {
      cur = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
      out.push(cur);
    } else {
      if (c.high > cur.high) cur.high = c.high;
      if (c.low < cur.low) cur.low = c.low;
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  // Pencere buket ortasında açıldıysa ilk buketin açılış saatleri eksik → düş.
  if (out.length > 1 && h1[0].time % sec !== 0) out.shift();
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

module.exports = { fetchCandles, resampleHours, YH_INTERVAL, YH_RANGE };
