/**
 * signalQuality/confluence.js
 * ---------------------------------------------------------------------------
 * KOLINYERLIK-farkinda konfluans birlestirme.
 *
 * Teshis: 11 teknik buyuk olcude ayni fiyat hareketini olcuyor (EMA + RSI +
 * MACD trend piyasasinda rho ~ 0.7). Her biri +1 sayilinca SAHTE bir
 * "konsensus" olusuyor ve guven sisiyor.
 *
 * Cozum: Teknikler korelasyon GRUPLARINA ayrilir.
 *   - Grup ICI: uyeler azalan getiri (noisy-OR + korelasyon indirimi) ile
 *     birlesir -> 3 korelasyonlu uye 3 puan degil ~1.2 "efektif" puan uretir.
 *   - Gruplar ARASI: gorece bagimsiz bloklar noisy-OR ile PEKISTIRILIR ->
 *     bagimsiz dogrulama, tek grupta yigilmis korelasyonlu oylardan daha
 *     yuksek kalite uretir.
 *
 * Saf fonksiyon.
 */

'use strict';

// Teknik adi -> korelasyon grubu. Bilinmeyen teknik kendi tekil grubuna duser.
const DEFAULT_GROUPS = Object.freeze({
  genel: 'trend_ma',
  ema34: 'trend_ma',
  tema34: 'trend_ma',
  ema_stack: 'trend_ma',
  price_vs_ema200: 'trend_ma',
  supertrend: 'trend_ma',
  ribbon: 'trend_ma',
  zlema: 'trend_ma',
  rsi: 'momentum',
  macd: 'momentum',
  momentum: 'momentum',
  stochrsi: 'momentum',
  divergence: 'momentum',
  smc: 'structure',
  snr: 'structure',
  fractal: 'structure',
  vwap: 'structure',
  candlestick: 'pattern',
  harmonic: 'pattern',
  elliott: 'pattern',
  volume: 'volume',
  adx: 'strength',
  ta4j: 'strength',
});

const DEFAULT_IMPORTANCE = Object.freeze({
  trend_ma: 1.0,
  structure: 1.0,
  momentum: 0.8,
  pattern: 0.6,
  volume: 0.5,
  strength: 0.7,
  _default: 0.6,
});

const DEFAULT_RHO = 0.7;

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function combineWithinGroup(strengths, rho) {
  const xs = strengths
    .map((s) => clamp(Number(s) || 0, 0, 1))
    .filter((s) => s > 0)
    .sort((a, b) => b - a);
  if (!xs.length) return 0;
  let remain = 1 - xs[0];
  for (let i = 1; i < xs.length; i++) {
    remain *= 1 - (1 - rho) * xs[i];
  }
  return clamp(1 - remain, 0, 1);
}

function aggregateConfluence(votes, opts) {
  opts = opts || {};
  const groupMap = Object.assign({}, DEFAULT_GROUPS, opts.groups || {});
  const importance = Object.assign({}, DEFAULT_IMPORTANCE, opts.importance || {});
  const rho = opts.rho != null ? opts.rho : DEFAULT_RHO;

  let REF = 1e-9;
  for (const v of Object.values(importance)) {
    if (Number.isFinite(v) && v > REF) REF = v;
  }

  const byGroup = new Map();
  for (const v of votes || []) {
    if (!v || v.vote === 'neutral' || !v.vote) continue;
    const g = v.group || groupMap[(v.technique || '').toLowerCase()] || ('solo:' + v.technique);
    if (!byGroup.has(g)) byGroup.set(g, { long: [], short: [] });
    const s = v.strength == null ? 0.6 : clamp(Number(v.strength), 0, 1);
    if (v.vote === 'long') byGroup.get(g).long.push(s);
    else if (v.vote === 'short') byGroup.get(g).short.push(s);
  }

  let capacity = 0;
  let effectiveBlocks = 0;
  let remainLong = 1;
  let remainShort = 1;
  const groups = {};

  for (const [g, sides] of byGroup.entries()) {
    const imp = importance[g] != null ? importance[g] : importance._default;
    const impFactor = clamp(imp / REF, 0, 1);
    const longStr = combineWithinGroup(sides.long, rho);
    const shortStr = combineWithinGroup(sides.short, rho);
    const longContrib = longStr * impFactor;
    const shortContrib = shortStr * impFactor;
    remainLong *= 1 - longContrib;
    remainShort *= 1 - shortContrib;
    capacity += imp;
    const net = longStr - shortStr;
    const domContrib = Math.max(longContrib, shortContrib);
    if (domContrib >= 0.2) effectiveBlocks += 1;
    groups[g] = {
      dir: net > 1e-9 ? 'long' : net < -1e-9 ? 'short' : 'neutral',
      net: round(net, 4),
      long: round(longStr, 4),
      short: round(shortStr, 4),
      members: sides.long.length + sides.short.length,
    };
  }

  const qLong = clamp(1 - remainLong, 0, 1);
  const qShort = clamp(1 - remainShort, 0, 1);
  const evidence = qLong - qShort;
  const direction = evidence > 1e-9 ? 'long' : evidence < -1e-9 ? 'short' : 'neutral';
  const rawQuality = clamp(Math.abs(evidence), 0, 1);
  const totalDir = qLong + qShort;
  const agreement = totalDir > 0 ? Math.max(qLong, qShort) / totalDir : 0;

  return {
    direction,
    rawQuality: round(rawQuality, 4),
    agreement: round(agreement, 4),
    evidence: round(evidence, 4),
    qualityLong: round(qLong, 4),
    qualityShort: round(qShort, 4),
    capacity: round(capacity, 4),
    effectiveBlocks,
    groups,
  };
}

function round(x, d) {
  if (d == null) d = 2;
  if (x === null || !Number.isFinite(x)) return null;
  const m = Math.pow(10, d);
  return Math.round(x * m) / m;
}

module.exports = {
  aggregateConfluence,
  combineWithinGroup,
  DEFAULT_GROUPS,
  DEFAULT_IMPORTANCE,
  DEFAULT_RHO,
};
