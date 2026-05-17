/**
 * Liquidation Service — BORSA KRALI
 *
 * Bybit Futures (USDT-perp) `allLiquidation.{symbol}` WS akışı ile canlı dinler.
 * Son 24 saatlik likidasyonları RAM'de tutar, fiyat bantlarına grupla ısı haritası üretir.
 *
 * NOT: Önceden Binance `!forceOrder@arr` kullanılıyordu, ancak Binance Futures
 * stream'i hem Türkiye hem Render IP'lerinde sessizce 0 olay teslim ediyordu
 * (bağlantı OPEN ama hiç mesaj gelmiyor — coğrafi kısıt). Bybit aynı veriyi
 * herkese açık olarak veriyor.
 *
 * Coinglass-tarzı heatmap için kaynak data formatı (internal):
 *   { symbol, side: 'long' | 'short', price, quantity, notional($), time }
 *
 * Bağlantı kopunca exponential backoff ile reconnect.
 * Process restart'ta buffer sıfırlanır — bu kabul edilebilir (canlı veri ürünü).
 *
 * Public docs:
 *   https://bybit-exchange.github.io/docs/v5/websocket/public/all-liquidation
 */

const WebSocket = require('ws');
const https = require('https');

const BYBIT_WS_URL = 'wss://stream.bybit.com/v5/public/linear';
const BYBIT_TICKERS_URL = 'https://api.bybit.com/v5/market/tickers?category=linear';

// Bybit USDT-perp evreni boot'ta REST API'den dinamik çekilir — 24sa hacim sırasına
// göre top N coin. Hardcoded fallback liste de var (API ulaşılamazsa).
// NOT: Çok ucuz coinler 1000x kontratlarla işlem görür (SHIB1000USDT, 1000PEPEUSDT).
// MATICUSDT → POLUSDT, FTMUSDT delist edildi.
// Bybit subscribe BATCH'i atomik: tek geçersiz sembol tüm batch'i reddeder, bu yüzden
// her sembol için ayrı `subscribe` op'u gönderiyoruz (subscribe-per-symbol).
const TOP_SYMBOL_COUNT = 100;
const SYMBOL_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 saatte bir top liste yenile
const FALLBACK_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'BNBUSDT', 'ADAUSDT',
  'TRXUSDT', 'LINKUSDT', 'AVAXUSDT', 'SUIUSDT', 'DOTUSDT', 'TONUSDT', 'NEARUSDT',
  'OPUSDT', 'ARBUSDT', 'APTUSDT', 'ATOMUSDT', 'LTCUSDT', 'BCHUSDT', 'INJUSDT',
  'AAVEUSDT', 'WIFUSDT', 'JUPUSDT', 'ORDIUSDT', 'TIAUSDT', 'ENAUSDT',
  'HBARUSDT', 'POLUSDT', 'SHIB1000USDT', '1000PEPEUSDT', 'FILUSDT', 'LDOUSDT',
  'RENDERUSDT', 'ICPUSDT', 'CRVUSDT', 'RUNEUSDT', 'XLMUSDT', 'ETCUSDT', 'UNIUSDT',
];
let activeSymbols = FALLBACK_SYMBOLS.slice();
let activeSymbolSet = new Set(activeSymbols);

const BUFFER_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;    // 5 dk
const MIN_NOTIONAL_USD = 100;                // gürültü filtresi — küçük likidasyonları da yakala
const PING_INTERVAL_MS = 15 * 1000;          // Bybit 20sn timeout — 15sn'de bir app-level ping

// Per-symbol ringbuffer: symbol -> [{ side, price, qty, notional, time }, ...]
const buffer = new Map();

// İstatistikler
let stats = {
  connected: false,
  connectedSince: null,
  reconnectCount: 0,
  totalEvents: 0,
  lastEventTime: null,
  lastError: null,
};

let ws = null;
let reconnectTimer = null;
let pruneTimer = null;
let pingHandle = null;
let symbolRefreshTimer = null;
let backoff = 1000;
const MAX_BACKOFF = 60 * 1000;

// Bybit REST'den top N USDT-perp coin'i hacim sırasına göre çek.
// API ulaşılmazsa mevcut activeSymbols'u (fallback ya da önceki başarılı çek) koru.
function fetchTopSymbols() {
  return new Promise((resolve) => {
    const req = https.get(BYBIT_TICKERS_URL, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          if (!j.result || !Array.isArray(j.result.list)) {
            stats.lastError = 'Bybit tickers: malformed response';
            return resolve(false);
          }
          const top = j.result.list
            .filter((t) => typeof t.symbol === 'string' && t.symbol.endsWith('USDT'))
            .filter((t) => isFinite(parseFloat(t.turnover24h)))
            .sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
            .slice(0, TOP_SYMBOL_COUNT)
            .map((t) => t.symbol);
          if (top.length >= 10) {
            activeSymbols = top;
            activeSymbolSet = new Set(top);
            console.log(`[Liquidation] Top ${top.length} sembol hacim sırasına göre güncellendi`);
            return resolve(true);
          }
          stats.lastError = `Bybit tickers: only ${top.length} valid symbols`;
          resolve(false);
        } catch (e) {
          stats.lastError = `Bybit tickers parse: ${e.message}`;
          resolve(false);
        }
      });
    });
    req.on('error', (e) => { stats.lastError = `Bybit tickers: ${e.message}`; resolve(false); });
    req.on('timeout', () => { req.destroy(); stats.lastError = 'Bybit tickers: timeout'; resolve(false); });
  });
}

// Bybit `allLiquidation.{symbol}` veri formatı:
//   { topic: "allLiquidation.BTCUSDT", type: "snapshot", ts, data: [{ T, s, S, v, p }] }
// S = taker'ın yönü:
//   "Sell" → taker sattı → bir LONG pozisyon zorla kapatıldı (long liquidated)
//   "Buy"  → taker aldı  → bir SHORT pozisyon zorla kapatıldı (short liquidated)
function ingestOne(ev) {
  try {
    const symbol = String(ev.s || '').toUpperCase();
    if (!symbol.endsWith('USDT')) return;
    // Subscribe ettiğimiz sembollerin dışı (re-sub esnasında bir-iki orphan event olabilir)
    if (activeSymbolSet.size > 0 && !activeSymbolSet.has(symbol)) return;

    const price = parseFloat(ev.p);
    const qty = parseFloat(ev.v);
    if (!isFinite(price) || !isFinite(qty) || price <= 0 || qty <= 0) return;
    const notional = price * qty;
    if (notional < MIN_NOTIONAL_USD) return;

    const sideRaw = String(ev.S || '').toLowerCase();
    const side = sideRaw === 'sell' ? 'long' : 'short';
    const time = +ev.T || Date.now();

    const entry = { symbol, side, price, qty, notional, time };
    if (!buffer.has(symbol)) buffer.set(symbol, []);
    buffer.get(symbol).push(entry);

    stats.totalEvents += 1;
    stats.lastEventTime = time;
  } catch (e) {
    console.warn('[Liquidation] ingest hata:', e.message);
  }
}

function handleMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch (_) { return; }
  // Subscribe/ping/pong cevapları (kontrol mesajları)
  if (msg.op || msg.success !== undefined || msg.ret_msg !== undefined) {
    if (msg.success === false) {
      stats.lastError = `subscribe-fail: ${msg.ret_msg || 'unknown'}`;
      console.warn('[Liquidation] Bybit subscribe red:', msg.ret_msg);
    }
    return;
  }
  // Veri mesajları: topic + data array
  if (typeof msg.topic === 'string' && msg.topic.startsWith('allLiquidation.') && Array.isArray(msg.data)) {
    msg.data.forEach(ingestOne);
  }
}

function pruneOld() {
  const cutoff = Date.now() - BUFFER_TTL_MS;
  for (const [sym, arr] of buffer.entries()) {
    const fresh = arr.filter(e => e.time >= cutoff);
    if (fresh.length === 0) buffer.delete(sym);
    else buffer.set(sym, fresh);
  }
}

function subscribeAll() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  // Tek sembol per op — geçersiz bir sembol diğerlerini etkilemesin
  for (const sym of activeSymbols) {
    try {
      ws.send(JSON.stringify({ op: 'subscribe', args: [`allLiquidation.${sym}`] }));
    } catch (e) {
      stats.lastError = `subscribe send: ${e.message}`;
    }
  }
}

function connect() {
  if (ws) {
    try { ws.terminate(); } catch (_) { /* ignore */ }
  }
  try {
    ws = new WebSocket(BYBIT_WS_URL, {
      handshakeTimeout: 10000,
    });
  } catch (err) {
    stats.lastError = err.message;
    return scheduleReconnect();
  }

  ws.on('open', () => {
    stats.connected = true;
    stats.connectedSince = Date.now();
    backoff = 1000;
    console.log(`[Liquidation] Bybit allLiquidation WS bağlandı (${activeSymbols.length} sembol)`);
    subscribeAll();
  });

  ws.on('message', (data) => {
    handleMessage(data.toString());
  });

  ws.on('error', (err) => {
    stats.lastError = err.message;
    // 'error' genelde 'close'la birlikte gelir — reconnect close'da
  });

  ws.on('close', (code, reason) => {
    stats.connected = false;
    console.warn(`[Liquidation] WS kapandı: code=${code} reason=${reason || '-'}`);
    scheduleReconnect();
  });

  // Bybit 20sn aktivite şartı — app-level ping (WS pong yetmez, op:'ping' lazım)
  if (pingHandle) { clearInterval(pingHandle); pingHandle = null; }
  pingHandle = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ op: 'ping' })); } catch (_) {}
    } else {
      if (pingHandle) { clearInterval(pingHandle); pingHandle = null; }
    }
  }, PING_INTERVAL_MS);
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  stats.reconnectCount += 1;
  const delay = Math.min(backoff, MAX_BACKOFF);
  backoff = Math.min(backoff * 2, MAX_BACKOFF);
  console.log(`[Liquidation] ${delay}ms sonra yeniden bağlanılacak (deneme #${stats.reconnectCount})`);
  reconnectTimer = setTimeout(connect, delay);
}

async function refreshSymbolsAndResubscribe() {
  const prev = new Set(activeSymbols);
  const ok = await fetchTopSymbols();
  if (!ok) return;
  // Sembol kümesi değiştiyse WS'yi yeniden kur (subscribe diff'i için reconnect en kolay yol)
  const changed = activeSymbols.length !== prev.size || activeSymbols.some((s) => !prev.has(s));
  if (changed && ws && ws.readyState === WebSocket.OPEN) {
    console.log('[Liquidation] Sembol seti değişti → WS yeniden kuruluyor');
    try { ws.terminate(); } catch (_) {} // close handler reconnect tetikler
  }
}

async function start() {
  if (pruneTimer) clearInterval(pruneTimer);
  pruneTimer = setInterval(pruneOld, PRUNE_INTERVAL_MS);
  // Boot'ta top sembolleri çek (başarısız olursa fallback liste devrede)
  await fetchTopSymbols();
  connect();
  // Periyodik top sembol yenile (yeni listing'leri yakalamak için)
  if (symbolRefreshTimer) clearInterval(symbolRefreshTimer);
  symbolRefreshTimer = setInterval(refreshSymbolsAndResubscribe, SYMBOL_REFRESH_INTERVAL_MS);
}

function stop() {
  if (reconnectTimer)      { clearTimeout(reconnectTimer);      reconnectTimer = null; }
  if (pruneTimer)          { clearInterval(pruneTimer);         pruneTimer = null; }
  if (pingHandle)          { clearInterval(pingHandle);         pingHandle = null; }
  if (symbolRefreshTimer)  { clearInterval(symbolRefreshTimer); symbolRefreshTimer = null; }
  if (ws) {
    try { ws.removeAllListeners(); ws.terminate(); } catch (_) {}
  }
  ws = null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Son N saatteki bir sembolün likidasyonlarını fiyat bantlarına dağıt.
 * Coinglass-tarzı heatmap dataset'i üretir.
 *
 * @param {string} symbol - BTCUSDT formatında (uppercase)
 * @param {object} opts
 *   - hours: 1 | 4 | 12 | 24 (default 12)
 *   - buckets: bant sayısı (default 40)
 * @returns { bins: [{ priceLow, priceHigh, longUsd, shortUsd, count }], summary }
 */
function getHeatmap(symbol, opts = {}) {
  const sym = String(symbol || '').toUpperCase();
  const hours = Math.min(24, Math.max(1, +opts.hours || 12));
  const buckets = Math.min(100, Math.max(10, +opts.buckets || 40));
  const since = Date.now() - hours * 3600 * 1000;

  const list = (buffer.get(sym) || []).filter(e => e.time >= since);
  if (list.length === 0) {
    return { symbol: sym, hours, buckets, bins: [], summary: emptySummary(sym, hours), empty: true };
  }

  const prices = list.map(e => e.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // Görsel için biraz pad
  const pad = (max - min) * 0.02 || max * 0.001;
  const lo = min - pad;
  const hi = max + pad;
  const width = (hi - lo) / buckets;

  const bins = Array.from({ length: buckets }, (_, i) => ({
    priceLow: lo + i * width,
    priceHigh: lo + (i + 1) * width,
    longUsd: 0,
    shortUsd: 0,
    count: 0,
  }));

  list.forEach(e => {
    let idx = Math.floor((e.price - lo) / width);
    if (idx >= buckets) idx = buckets - 1;
    if (idx < 0) idx = 0;
    if (e.side === 'long') bins[idx].longUsd += e.notional;
    else bins[idx].shortUsd += e.notional;
    bins[idx].count += 1;
  });

  // Yuvarla
  bins.forEach(b => {
    b.longUsd = Math.round(b.longUsd);
    b.shortUsd = Math.round(b.shortUsd);
  });

  // Özet
  const longTotal = list.filter(e => e.side === 'long').reduce((a, e) => a + e.notional, 0);
  const shortTotal = list.filter(e => e.side === 'short').reduce((a, e) => a + e.notional, 0);
  const maxBin = bins.reduce((m, b) => Math.max(m, b.longUsd + b.shortUsd), 0);

  return {
    symbol: sym,
    hours,
    buckets,
    bins,
    priceRange: { min, max, lo, hi },
    summary: {
      symbol: sym,
      events: list.length,
      longUsd: Math.round(longTotal),
      shortUsd: Math.round(shortTotal),
      totalUsd: Math.round(longTotal + shortTotal),
      maxBinUsd: Math.round(maxBin),
      hours,
    },
  };
}

function emptySummary(sym, hours) {
  return { symbol: sym, events: 0, longUsd: 0, shortUsd: 0, totalUsd: 0, maxBinUsd: 0, hours };
}

/**
 * Tüm semboller toplam likidasyon özeti (son N saat).
 * Top N coin sıralı liste.
 */
function getMarketSummary(opts = {}) {
  const hours = Math.min(24, Math.max(1, +opts.hours || 4));
  const limit = Math.min(50, Math.max(5, +opts.limit || 20));
  const since = Date.now() - hours * 3600 * 1000;

  const result = [];
  for (const [sym, arr] of buffer.entries()) {
    const fresh = arr.filter(e => e.time >= since);
    if (fresh.length === 0) continue;
    const longUsd = fresh.filter(e => e.side === 'long').reduce((a, e) => a + e.notional, 0);
    const shortUsd = fresh.filter(e => e.side === 'short').reduce((a, e) => a + e.notional, 0);
    const lastPrice = fresh[fresh.length - 1].price;
    result.push({
      symbol: sym,
      coin: sym.replace('USDT', ''),
      events: fresh.length,
      longUsd: Math.round(longUsd),
      shortUsd: Math.round(shortUsd),
      totalUsd: Math.round(longUsd + shortUsd),
      lastPrice,
      ratio: longUsd > 0 || shortUsd > 0 ? (longUsd / Math.max(longUsd + shortUsd, 1)) : 0.5,
    });
  }
  result.sort((a, b) => b.totalUsd - a.totalUsd);
  return {
    hours,
    items: result.slice(0, limit),
    marketTotalUsd: result.reduce((a, r) => a + r.totalUsd, 0),
  };
}

/**
 * Son N büyük likidasyon (tüm semboller).
 */
function getRecentLarge(opts = {}) {
  const hours = Math.min(24, Math.max(1, +opts.hours || 1));
  const limit = Math.min(100, Math.max(5, +opts.limit || 30));
  const minUsd = Math.max(MIN_NOTIONAL_USD, +opts.minUsd || 25000);
  const since = Date.now() - hours * 3600 * 1000;

  const all = [];
  for (const arr of buffer.values()) {
    for (const e of arr) {
      if (e.time >= since && e.notional >= minUsd) all.push(e);
    }
  }
  all.sort((a, b) => b.time - a.time);
  return { hours, minUsd, items: all.slice(0, limit) };
}

function getStats() {
  return {
    ...stats,
    bufferedSymbols: buffer.size,
    bufferedEvents: Array.from(buffer.values()).reduce((a, arr) => a + arr.length, 0),
    subscribedSymbols: activeSymbols.length,
  };
}

module.exports = {
  start,
  stop,
  getHeatmap,
  getMarketSummary,
  getRecentLarge,
  getStats,
};
