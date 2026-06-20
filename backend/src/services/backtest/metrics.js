/**
 * Backtest — Metrik (tearsheet) hesaplayıcıları
 *
 * lumibot'un quantstats tearsheet'inden esinlenen, ama YERLİ ve saf (yan-etkisiz)
 * metrik fonksiyonları. Hepsi kapalı işlem listesi + günlük equity eğrisinden
 * türetilir → golden-test'lenebilir, look-ahead yok.
 *
 * Girdi sözleşmesi:
 *   equityCurve : [{ date:'YYYY-MM-DD', equity:number }]  (gün başına bir nokta)
 *   trades      : [{ realizedPnL, realizedPnLPct, exitReason, holdingBars, ... }]
 *   initialCapital : number
 *
 * Tüm yüzdeler "100 = %100" ölçeğindedir (UI fmtPct ile uyumlu).
 */

const TRADING_DAYS_PER_YEAR = 252;

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function round(v, d = 2) { return isNum(v) ? +v.toFixed(d) : null; }

/**
 * Equity eğrisinden en büyük tepe-dip düşüşü (drawdown).
 * @returns {{ maxDrawdownPct:number, maxDrawdownAbs:number, peakDate, troughDate }}
 */
function maxDrawdown(equityCurve = []) {
  let peak = -Infinity, peakDate = null;
  let maxPct = 0, maxAbs = 0, mddPeakDate = null, mddTroughDate = null;
  for (const pt of equityCurve) {
    if (!isNum(pt.equity)) continue;
    if (pt.equity > peak) { peak = pt.equity; peakDate = pt.date; }
    if (peak > 0) {
      const ddAbs = peak - pt.equity;
      const ddPct = (ddAbs / peak) * 100;
      if (ddPct > maxPct) {
        maxPct = ddPct; maxAbs = ddAbs;
        mddPeakDate = peakDate; mddTroughDate = pt.date;
      }
    }
  }
  return {
    maxDrawdownPct: round(maxPct),
    maxDrawdownAbs: round(maxAbs),
    peakDate: mddPeakDate,
    troughDate: mddTroughDate,
  };
}

/** İki ISO tarih arası gün sayısı (en az 1). */
function daySpan(fromDate, toDate) {
  if (!fromDate || !toDate) return 1;
  const a = new Date(fromDate).getTime();
  const b = new Date(toDate).getTime();
  if (!isNum(a) || !isNum(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86400000));
}

/** Yıllık bileşik getiri (CAGR). */
function cagr(initialCapital, finalEquity, fromDate, toDate) {
  if (!(initialCapital > 0) || !(finalEquity > 0)) return 0;
  const years = daySpan(fromDate, toDate) / 365;
  if (years <= 0) return 0;
  return (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100;
}

/** Günlük getirilerden yıllıklaştırılmış Sharpe (risksiz oran 0 varsayılır). */
function sharpe(equityCurve = []) {
  const rets = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity, cur = equityCurve[i].equity;
    if (isNum(prev) && isNum(cur) && prev > 0) rets.push(cur / prev - 1);
  }
  if (rets.length < 2) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(variance);
  if (sd === 0) return 0;
  return (mean / sd) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * Tüm metrikleri tek seferde derler.
 */
function computeMetrics({ initialCapital, finalEquity, equityCurve = [], trades = [] }) {
  const closed = trades.filter(t => isNum(t.realizedPnL));
  const wins = closed.filter(t => t.realizedPnL > 0);
  const losses = closed.filter(t => t.realizedPnL < 0);

  const grossProfit = wins.reduce((s, t) => s + t.realizedPnL, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.realizedPnL, 0));
  const netProfit = closed.reduce((s, t) => s + t.realizedPnL, 0);

  const totalTrades = closed.length;
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

  const avgWin = winCount > 0 ? grossProfit / winCount : 0;
  const avgLoss = lossCount > 0 ? grossLoss / lossCount : 0;
  const expectancy = totalTrades > 0 ? netProfit / totalTrades : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss
    : (grossProfit > 0 ? Infinity : 0);

  const pctReturns = closed.map(t => t.realizedPnLPct).filter(isNum);
  const avgReturnPct = pctReturns.length ? pctReturns.reduce((a, b) => a + b, 0) / pctReturns.length : 0;
  const bestTradePct = pctReturns.length ? Math.max(...pctReturns) : 0;
  const worstTradePct = pctReturns.length ? Math.min(...pctReturns) : 0;

  const holdBars = closed.map(t => t.holdingBars).filter(isNum);
  const avgHoldingBars = holdBars.length ? holdBars.reduce((a, b) => a + b, 0) / holdBars.length : 0;

  const fromDate = equityCurve.length ? equityCurve[0].date : null;
  const toDate = equityCurve.length ? equityCurve[equityCurve.length - 1].date : null;
  const finalEq = isNum(finalEquity) ? finalEquity
    : (equityCurve.length ? equityCurve[equityCurve.length - 1].equity : initialCapital);

  const totalReturnPct = initialCapital > 0 ? ((finalEq - initialCapital) / initialCapital) * 100 : 0;
  const dd = maxDrawdown(equityCurve);

  // Çıkış nedeni dağılımı (UI'da "neden kapandı" kırılımı için)
  const exitBreakdown = {};
  for (const t of closed) {
    const r = t.exitReason || 'unknown';
    exitBreakdown[r] = (exitBreakdown[r] || 0) + 1;
  }

  return {
    initialCapital: round(initialCapital),
    finalEquity: round(finalEq),
    totalReturnPct: round(totalReturnPct),
    netProfit: round(netProfit),
    cagrPct: round(cagr(initialCapital, finalEq, fromDate, toDate)),
    maxDrawdownPct: dd.maxDrawdownPct,
    maxDrawdownAbs: dd.maxDrawdownAbs,
    drawdownPeakDate: dd.peakDate,
    drawdownTroughDate: dd.troughDate,
    sharpe: round(sharpe(equityCurve)),
    totalTrades,
    winCount,
    lossCount,
    winRate: round(winRate, 1),
    profitFactor: profitFactor === Infinity ? null : round(profitFactor),
    profitFactorInf: profitFactor === Infinity,
    expectancy: round(expectancy),
    avgWin: round(avgWin),
    avgLoss: round(avgLoss),
    avgReturnPct: round(avgReturnPct),
    bestTradePct: round(bestTradePct),
    worstTradePct: round(worstTradePct),
    avgHoldingBars: round(avgHoldingBars, 1),
    exitBreakdown,
  };
}

module.exports = { computeMetrics, maxDrawdown, cagr, sharpe, daySpan, TRADING_DAYS_PER_YEAR };
