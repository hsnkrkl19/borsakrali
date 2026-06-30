/**
 * brokerPrices — MT5 köprüsünün gönderdiği CANLI broker bid/ask deposu (bellek-içi).
 *
 * Amaç: Yahoo vadeli (GC=F/NQ=F) ile broker spot/CFD arasındaki basis farkını gidermek.
 * Köprü (PC açıkken) her tur MT5'ten okuduğu fiyatları POST /api/forex/broker-prices ile
 * yollar; forexEngineMTF taze (≤ MAX_AGE) broker fiyatını livePrice olarak kullanır,
 * yoksa Yahoo'ya düşer. Böylece sinyal seviyeleri broker fiyatına oturur (Telegram=bot).
 */

const MAX_AGE_MS = 5 * 60 * 1000; // 5 dk'dan eski broker fiyatı bayat → Yahoo'ya düş
let store = {}; // instrumentId -> { bid, ask, mid, ts }

function set(prices) {
  if (!prices || typeof prices !== 'object') return 0;
  const now = Date.now();
  let n = 0;
  for (const [id, p] of Object.entries(prices)) {
    const bid = Number(p && p.bid), ask = Number(p && p.ask);
    if (!(bid > 0) || !(ask > 0)) continue;
    store[(id || '').toUpperCase()] = { bid, ask, mid: (bid + ask) / 2, ts: now };
    n++;
  }
  return n;
}

function get(instrumentId) {
  const p = store[(instrumentId || '').toUpperCase()];
  if (!p) return null;
  if (Date.now() - p.ts > MAX_AGE_MS) return null; // bayat
  return p;
}

function all() {
  const out = {};
  const now = Date.now();
  for (const [id, p] of Object.entries(store)) {
    out[id] = { ...p, ageMs: now - p.ts, fresh: now - p.ts <= MAX_AGE_MS };
  }
  return out;
}

function __resetForTest() { store = {}; }

module.exports = { set, get, all, MAX_AGE_MS, __resetForTest };
