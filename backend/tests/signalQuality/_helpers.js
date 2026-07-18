/**
 * Sentetik mum üreteçleri (deterministik — Math.random YOK).
 * Rejim/indikatör testleri için trend, yatay ve yüksek-vol serileri.
 */
'use strict';

/** Düz yükselen (veya düşen) trend: yüksek ADX, düşük choppiness. */
function buildTrend(n = 80, { start = 100, step = 1, spread = 0.4, dir = 1 } = {}) {
  const c = [];
  for (let i = 0; i < n; i++) {
    const base = start + dir * step * i;
    c.push({ time: i, open: base - dir * step * 0.5, high: base + spread, low: base - spread, close: base });
  }
  return c;
}

/** Yatay/choppy: fiyat neredeyse dönüşümlü zıplar → düşük ADX, yüksek CI. */
function buildChop(n = 80, { mid = 100, amp = 1.0, spread = 0.5 } = {}) {
  const c = [];
  for (let i = 0; i < n; i++) {
    const wobble = ((i * 7) % 5) / 20; // küçük deterministik salınım
    const base = mid + (i % 2 === 0 ? 0 : amp) + wobble;
    c.push({ time: i, open: base, high: base + spread, low: base - spread, close: base });
  }
  return c;
}

/** Trend + son barlarda volatilite patlaması (yüksek-vol rejimi). */
function buildHighVolTail(n = 80, { start = 100, step = 1 } = {}) {
  const c = [];
  for (let i = 0; i < n; i++) {
    const base = start + step * i;
    const wide = i >= n - 10;
    const spread = wide ? 4.5 : 0.4;
    c.push({ time: i, open: base - 0.5, high: base + spread, low: base - spread, close: base });
  }
  return c;
}

module.exports = { buildTrend, buildChop, buildHighVolTail };
