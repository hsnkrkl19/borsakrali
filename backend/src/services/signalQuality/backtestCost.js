/**
 * signalQuality/backtestCost.js
 * ---------------------------------------------------------------------------
 * Faz 3 — Backtest'lere DURUST maliyet ve dogru yilliklandirma.
 *
 * Teshis: JS backtest'lerinde komisyon/spread/slippage yok; ayrica Sharpe her
 * varlik icin 252 gunle yilliklandiriliyor (kripto 7/24 => 365 olmali).
 *
 * Bu modul mevcut backtest metriklerine EK olarak cagrilir; hicbir seyi zorla
 * degistirmez. Saf fonksiyonlar.
 */

'use strict';

const cost = require('./costModel');

/**
 * Bir islemin YUZDE getirisine gidis-donus maliyetini uygular.
 * @param {number} grossReturnPct  brut getiri, yuzde ( or. 2.5 => %2.5)
 * @param {string} assetClass
 * @returns {number} net getiri (yuzde)
 */
function applyCostToReturnPct(grossReturnPct, assetClass, override) {
  const bps = cost.costBps(assetClass, override); // gidis-donus, bps
  const pct = Number(grossReturnPct);
  if (!Number.isFinite(pct)) return null;
  return round(pct - bps / 100, 6); // 1 bps = %0.01
}

/** Varlik sinifina gore yillik islem gunu (Sharpe yilliklandirmasi). */
function tradingPeriodsPerYear(assetClass) {
  const k = String(assetClass || '').toLowerCase();
  if (k.indexOf('crypto') >= 0) return 365; // 7/24
  return 252; // hisse/forex/emtia/endeks
}

/**
 * Islem dizisinden maliyet-ayarli ozet.
 * @param {Array<{returnPct:number}>} trades
 */
function summarizeWithCost(trades, assetClass, override) {
  const list = Array.isArray(trades) ? trades : [];
  let grossSum = 0;
  let netSum = 0;
  let wins = 0;
  let netWins = 0;
  let grossWinSum = 0;
  let grossLossSum = 0;
  let netWinSum = 0;
  let netLossSum = 0;
  for (const t of list) {
    const g = Number(t.returnPct);
    if (!Number.isFinite(g)) continue;
    const n = applyCostToReturnPct(g, assetClass, override);
    grossSum += g;
    netSum += n;
    if (g > 0) {
      wins += 1;
      grossWinSum += g;
    } else {
      grossLossSum += Math.abs(g);
    }
    if (n > 0) {
      netWins += 1;
      netWinSum += n;
    } else {
      netLossSum += Math.abs(n);
    }
  }
  const nT = list.length || 1;
  return {
    trades: list.length,
    grossWinRate: round(wins / nT, 4),
    netWinRate: round(netWins / nT, 4),
    grossExpectancyPct: round(grossSum / nT, 4),
    netExpectancyPct: round(netSum / nT, 4),
    grossProfitFactor: round(grossLossSum > 0 ? grossWinSum / grossLossSum : Infinity, 4),
    netProfitFactor: round(netLossSum > 0 ? netWinSum / netLossSum : Infinity, 4),
    costBps: cost.costBps(assetClass, override),
    annualizationPeriods: tradingPeriodsPerYear(assetClass),
  };
}

function round(x, d) {
  if (d == null) d = 2;
  if (x === null || !Number.isFinite(x)) return x === Infinity ? Infinity : null;
  const m = Math.pow(10, d);
  return Math.round(x * m) / m;
}

module.exports = { applyCostToReturnPct, tradingPeriodsPerYear, summarizeWithCost };
