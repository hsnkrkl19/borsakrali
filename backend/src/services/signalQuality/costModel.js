/**
 * signalQuality/costModel.js
 * ---------------------------------------------------------------------------
 * İşlem MALİYETİ farkında R:R ve beklenti.
 *
 * Teşhis edilen sorun: JS backtest'lerinde komisyon/spread/slippage yok.
 * R:R saf geometrik hesaplanıyor → beklenti ve isabet eşiği iyimser çıkıyor,
 * canlı sonuç backtest'in altında kalıyor.
 *
 * Çözüm: Varlık sınıfı bazlı gidiş-dönüş maliyet (baz puan = bps) ile
 * NET R:R, maliyetin kaç R yediği ve kâr-zarar başabaş isabet oranı.
 *
 * Saf fonksiyon. Maliyetler makul VARSAYILAN büyüklüklerdir; her biri
 * override edilebilir ve gerçek broker/borsa verisiyle kalibre edilmelidir.
 */

'use strict';

// Gidiş-dönüş toplam maliyet (notional'ın bps'i). 1 bps = %0.01.
// Bileşenler şeffaflık için ayrık; totalBps birincil değer.
const COST_TABLE = Object.freeze({
  crypto_spot: { totalBps: 30, note: 'taker ~%0.1/yön + spread + slippage' },
  crypto_perp: { totalBps: 12, note: 'taker ~%0.04-0.05/yön; funding AYRI' },
  fx_major: { totalBps: 2, note: 'EURUSD ~0.1-0.2 pip spread' },
  fx_minor: { totalBps: 6, note: 'daha geniş spread' },
  metal: { totalBps: 6, note: 'XAUUSD birkaç bps + slippage' },
  index: { totalBps: 4, note: 'ES/US500 CFD/vadeli' },
  index_cfd: { totalBps: 4, note: 'index takma adı' },
  bist_equity: { totalBps: 40, note: 'komisyon %0.1-0.2 + spread' },
  us_equity: { totalBps: 10, note: 'komisyon + spread + slippage' },
  _default: { totalBps: 20, note: 'bilinmeyen sınıf — muhafazakâr varsayılan' },
});

// Enstrüman sınıfı adlarını (proInstruments'taki gibi) maliyet sınıfına eşle.
const CLASS_ALIAS = Object.freeze({
  crypto: 'crypto_spot',
  fx: 'fx_major',
  forex: 'fx_major',
  metal: 'metal',
  index: 'index',
  equity: 'bist_equity',
  bist: 'bist_equity',
  stock: 'bist_equity',
});

function resolveClass(assetClass) {
  if (!assetClass) return '_default';
  const k = String(assetClass).toLowerCase();
  if (COST_TABLE[k]) return k;
  if (CLASS_ALIAS[k]) return CLASS_ALIAS[k];
  return '_default';
}

/** Gidiş-dönüş maliyet (bps). */
function costBps(assetClass, override) {
  if (typeof override === 'number' && Number.isFinite(override)) return override;
  return COST_TABLE[resolveClass(assetClass)].totalBps;
}

/**
 * Maliyet-ayarlı R:R.
 * Maliyet fiyat cinsinden ödülü AZALTIR ve riski ARTIRIR (her iki tarafta).
 * @returns {{grossRR:number, netRR:number, costR:number, costPrice:number, risk:number, reward:number}}
 */
function netRR(entry, stop, target, opts = {}) {
  const e = Number(entry);
  const s = Number(stop);
  const t = Number(target);
  if (![e, s, t].every(Number.isFinite) || e <= 0) {
    return { grossRR: null, netRR: null, costR: null, costPrice: null, risk: null, reward: null };
  }
  const bps = costBps(opts.assetClass, opts.costBps);
  const costPrice = (e * bps) / 1e4; // gidiş-dönüş maliyet, fiyat biriminde
  const risk = Math.abs(e - s);
  const reward = Math.abs(t - e);
  if (risk <= 0) return { grossRR: null, netRR: null, costR: null, costPrice: round(costPrice, 8), risk, reward };
  const grossRR = reward / risk;
  const netReward = Math.max(0, reward - costPrice);
  const netRisk = risk + costPrice;
  const nrr = netReward / netRisk;
  return {
    grossRR: round(grossRR, 4),
    netRR: round(nrr, 4),
    costR: round(costPrice / risk, 4),
    costPrice: round(costPrice, 8),
    risk: round(risk, 8),
    reward: round(reward, 8),
  };
}

/** Verilen R:R için başabaş (breakeven) isabet oranı: p* = 1/(1+RR). */
function breakevenWinRate(rr) {
  const r = Number(rr);
  if (!Number.isFinite(r) || r <= 0) return null;
  return round(1 / (1 + r), 4);
}

/**
 * Net beklenti (R cinsinden, brüt risk birimiyle).
 * E_R = p * (netReward/risk) - (1-p) * (netRisk/risk)
 * @param {number} p kazanma olasılığı [0..1]
 */
function netExpectancyR(p, entry, stop, target, opts = {}) {
  const pr = clamp(Number(p), 0, 1);
  const rr = netRR(entry, stop, target, opts);
  if (rr.netRR === null || rr.risk === null || rr.risk <= 0) return null;
  const costPrice = rr.costPrice;
  const netRewardOverRisk = Math.max(0, rr.reward - costPrice) / rr.risk;
  const netLossOverRisk = (rr.risk + costPrice) / rr.risk;
  const e = pr * netRewardOverRisk - (1 - pr) * netLossOverRisk;
  return round(e, 4);
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
function round(x, d = 2) {
  if (x === null || !Number.isFinite(x)) return null;
  const m = Math.pow(10, d);
  return Math.round(x * m) / m;
}

module.exports = {
  COST_TABLE,
  CLASS_ALIAS,
  resolveClass,
  costBps,
  netRR,
  breakevenWinRate,
  netExpectancyR,
};
