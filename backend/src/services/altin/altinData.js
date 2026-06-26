/**
 * ALTIN · Veri Katmanı — XAUUSD (GC=F) çoklu zaman dilimi mum verisi.
 *
 * Uzun geçmiş (1wk/1d) için Yahoo chart API'yi doğrudan period1/period2 ile
 * çağırır (forexKlines 1d'yi 2y ile sınırlıyor → 26y için yetersiz). Gün-içi
 * (1h/15m/5m/1m) Yahoo range limitleriyle çekilir; 8h ve 4h 1h'ten resample.
 *
 * Mum: { time(unix sn), open, high, low, close, volume } (eski→yeni). Cache'li.
 */
const https = require('https');

const SYMBOL = 'GC=F';
const BASE = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOL)}`;
const P1_1995 = 788918400; // 1995-01-01 UTC (uzun geçmiş başlangıcı)

// TF → { interval, range | long } ; long=true → period1/period2 (max çözünürlük)
const TF_FETCH = {
  '1wk': { interval: '1wk', long: true },
  '1d': { interval: '1d', long: true },
  '1h': { interval: '1h', range: '730d' },
  '15m': { interval: '15m', range: '60d' },
  '5m': { interval: '5m', range: '60d' },
  '1m': { interval: '1m', range: '7d' },
};
// Resample kaynakları
const RESAMPLE = { '8h': { from: '1h', hours: 8 }, '4h': { from: '1h', hours: 4 } };

const CACHE_TTL = { '1m': 55e3, '5m': 4 * 60e3, '15m': 9 * 60e3, '1h': 30 * 60e3, '4h': 30 * 60e3, '8h': 30 * 60e3, '1d': 6 * 3600e3, '1wk': 12 * 3600e3 };
const cache = new Map(); // tf -> { at, data }

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, timeout: 25000 }, (res) => {
      let d = ''; res.on('data', c => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('parse')); } });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

function parseChart(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) return [];
  const q = r.indicators.quote[0]; const out = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({ time: r.timestamp[i], open: o, high: h, low: l, close: c, volume: q.volume ? (q.volume[i] || 0) : 0 });
  }
  return out;
}

function resample(h1, hours) {
  const out = []; let b = null, key = -1; const sec = hours * 3600;
  for (const c of h1) {
    const k = Math.floor(c.time / sec);
    if (k !== key) { if (b) out.push(b); b = { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }; key = k; }
    else { b.high = Math.max(b.high, c.high); b.low = Math.min(b.low, c.low); b.close = c.close; b.volume += c.volume; }
  }
  if (b) out.push(b);
  return out;
}

async function fetchRaw(tf) {
  const f = TF_FETCH[tf];
  if (!f) throw new Error('bilinmeyen tf ' + tf);
  const url = f.long
    ? `${BASE}?interval=${f.interval}&period1=${P1_1995}&period2=${Math.floor(Date.now() / 1000)}`
    : `${BASE}?interval=${f.interval}&range=${f.range}`;
  const j = await httpsGetJson(url);
  return parseChart(j);
}

// Tek TF mum dizisi (cache'li). 8h/4h → 1h'ten resample.
async function getCandles(tf) {
  const now = Date.now();
  const c = cache.get(tf);
  if (c && now - c.at < (CACHE_TTL[tf] || 30 * 60e3)) return c.data;
  let data;
  if (RESAMPLE[tf]) {
    const src = await getCandles(RESAMPLE[tf].from);
    data = resample(src, RESAMPLE[tf].hours);
  } else {
    try { data = await fetchRaw(tf); } catch (e) { data = c ? c.data : []; }
  }
  cache.set(tf, { at: now, data });
  return data;
}

const ALL_TFS = ['1wk', '1d', '8h', '4h', '1h', '15m', '5m', '1m'];
async function getAll(tfs = ALL_TFS) {
  const out = {};
  for (const tf of tfs) { try { out[tf] = await getCandles(tf); } catch (_) { out[tf] = []; } }
  return out;
}

module.exports = { getCandles, getAll, resample, ALL_TFS, SYMBOL };
