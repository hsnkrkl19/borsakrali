/**
 * Liquidation Service — BORSA KRALI
 *
 * Binance Futures `!forceOrder@arr` WebSocket'i ile tüm sembolleri canlı dinler.
 * Son 24 saatlik likidasyonları RAM'de tutar, fiyat bantlarına grupla ısı haritası üretir.
 *
 * Coinglass-tarzı heatmap için kaynak data:
 *   { symbol, side: 'long' | 'short', price, quantity, notional($), time }
 *
 * Bağlantı kopunca exponential backoff ile reconnect.
 * Process restart'ta buffer sıfırlanır — bu kabul edilebilir (canlı veri ürünü).
 *
 * Public docs:
 *   https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams/Liquidation-Order-Streams
 */

const WebSocket = require('ws');

const BINANCE_WS_URL = 'wss://fstream.binance.com/ws/!forceOrder@arr';
const BUFFER_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;    // 5 dk
const MIN_NOTIONAL_USD = 1000;               // gürültü filtresi

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
let backoff = 1000;
const MAX_BACKOFF = 60 * 1000;

function ingest(payload) {
  try {
    const ev = payload.o;
    if (!ev) return;
    const symbol = String(ev.s || '').toUpperCase();
    if (!symbol.endsWith('USDT')) return; // Sadece USDT-margined

    const price = parseFloat(ev.ap || ev.p);   // avg price > order price
    const qty = parseFloat(ev.z || ev.q);      // accumulated filled qty
    if (!isFinite(price) || !isFinite(qty)) return;
    const notional = price * qty;
    if (notional < MIN_NOTIONAL_USD) return;

    // Binance forceOrder side semantiği:
    //   SELL force order = bir LONG pozisyon likide edildi (long liquidated)
    //   BUY  force order = bir SHORT pozisyon likide edildi (short liquidated)
    const side = ev.S === 'SELL' ? 'long' : 'short';
    const time = ev.T || Date.now();

    const entry = { symbol, side, price, qty, notional, time };
    if (!buffer.has(symbol)) buffer.set(symbol, []);
    buffer.get(symbol).push(entry);

    stats.totalEvents += 1;
    stats.lastEventTime = time;
  } catch (e) {
    // Tek bir mesaj hatası reconnect'i tetiklemesin
    console.warn('[Liquidation] ingest hata:', e.message);
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

function connect() {
  if (ws) {
    try { ws.terminate(); } catch (_) { /* ignore */ }
  }
  try {
    ws = new WebSocket(BINANCE_WS_URL, {
      // 30 sn ping — Binance 3 dk inaktivitede atar
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
    console.log('[Liquidation] Binance forceOrder WS bağlandı');
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      // !forceOrder@arr formatı: tek tek event veya combined
      if (Array.isArray(msg)) {
        msg.forEach(ingest);
      } else if (msg.e === 'forceOrder') {
        ingest(msg);
      } else if (msg.data && msg.data.e === 'forceOrder') {
        ingest(msg.data);
      }
    } catch (e) {
      // sessizce yut — bozuk frame
    }
  });

  ws.on('error', (err) => {
    stats.lastError = err.message;
    // 'error' genelde 'close'la birlikte geliyor — reconnect close'da
  });

  ws.on('close', (code, reason) => {
    stats.connected = false;
    console.warn(`[Liquidation] WS kapandı: code=${code} reason=${reason || '-'}`);
    scheduleReconnect();
  });

  // Sağlık: 3 dk inaktivite varsa ping
  ws.on('pong', () => {/* alive */});
  const pingHandle = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.ping(); } catch (_) {}
    } else {
      clearInterval(pingHandle);
    }
  }, 60 * 1000);
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  stats.reconnectCount += 1;
  const delay = Math.min(backoff, MAX_BACKOFF);
  backoff = Math.min(backoff * 2, MAX_BACKOFF);
  console.log(`[Liquidation] ${delay}ms sonra yeniden bağlanılacak (deneme #${stats.reconnectCount})`);
  reconnectTimer = setTimeout(connect, delay);
}

function start() {
  if (pruneTimer) clearInterval(pruneTimer);
  pruneTimer = setInterval(pruneOld, PRUNE_INTERVAL_MS);
  connect();
}

function stop() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pruneTimer) clearInterval(pruneTimer);
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
