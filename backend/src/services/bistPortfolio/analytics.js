/**
 * bistPortfolio/analytics — SAF portföy analitiği (I/O yok). Hem canlı akıştan
 * (equityHistory + trades) hem backtest'ten AYNI fonksiyonlarla beslenir.
 *   • maxDrawdown  — tepe-noktasından en büyük düşüş %
 *   • tradeStats   — kazanma oranı, ort. kazanç/kayıp, expectancy, profit factor,
 *                    ort. tutuş günü, en iyi/kötü, çıkış-nedeni dağılımı
 *   • sharpe       — günlük özsermaye getirilerinden yıllıklandırılmış (kaba)
 */

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function maxDrawdown(equityHistory) {
  const pts = (equityHistory || []).filter(p => p && Number.isFinite(p.equity));
  if (!pts.length) return { maxDrawdownPct: 0, peakEquity: null, troughEquity: null };
  let peak = pts[0].equity, maxDD = 0, peakAt = pts[0].equity, troughAt = pts[0].equity;
  for (const p of pts) {
    if (p.equity > peak) peak = p.equity;
    const dd = peak > 0 ? ((peak - p.equity) / peak) * 100 : 0;
    if (dd > maxDD) { maxDD = dd; peakAt = peak; troughAt = p.equity; }
  }
  return { maxDrawdownPct: +maxDD.toFixed(2), peakEquity: +peakAt.toFixed(2), troughEquity: +troughAt.toFixed(2) };
}

function daysBetween(a, b) {
  const t1 = new Date(a).getTime(), t2 = new Date(b).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.max(0, (t2 - t1) / 86400000);
}

function tradeStats(trades) {
  const list = (trades || []).filter(t => t && Number.isFinite(t.realizedPnL));
  const n = list.length;
  const empty = { count: 0, wins: 0, losses: 0, winRate: 0, avgWinPct: 0, avgLossPct: 0, avgWinTL: 0, avgLossTL: 0, expectancyTL: 0, profitFactor: 0, avgHoldDays: 0, bestPct: 0, worstPct: 0, byReason: {} };
  if (!n) return empty;
  const sum = (arr) => arr.reduce((s, x) => s + x, 0);
  const retPct = (t) => num(t.priceReturnPct ?? t.realizedPnLPct);
  const wins = list.filter(t => t.realizedPnL > 0);
  const losses = list.filter(t => t.realizedPnL < 0);
  const grossWin = sum(wins.map(t => t.realizedPnL));
  const grossLoss = Math.abs(sum(losses.map(t => t.realizedPnL)));
  const holds = list.map(t => daysBetween(t.entryDate, t.exitDate)).filter(d => d != null);
  const byReason = {};
  for (const t of list) { const r = t.exitReason || 'other'; byReason[r] = (byReason[r] || 0) + 1; }
  const winRate = wins.length / n;
  const avgWinTL = wins.length ? grossWin / wins.length : 0;
  const avgLossTL = losses.length ? -grossLoss / losses.length : 0;   // negatif
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 999 : 0);
  return {
    count: n, wins: wins.length, losses: losses.length,
    winRate: +(winRate * 100).toFixed(1),
    avgWinPct: wins.length ? +(sum(wins.map(retPct)) / wins.length).toFixed(2) : 0,
    avgLossPct: losses.length ? +(sum(losses.map(retPct)) / losses.length).toFixed(2) : 0,
    avgWinTL: +avgWinTL.toFixed(2), avgLossTL: +avgLossTL.toFixed(2),
    expectancyTL: +((winRate * avgWinTL) + ((1 - winRate) * avgLossTL)).toFixed(2),
    profitFactor: +pf.toFixed(2),
    avgHoldDays: holds.length ? +(sum(holds) / holds.length).toFixed(1) : 0,
    bestPct: +Math.max(...list.map(retPct)).toFixed(2),
    worstPct: +Math.min(...list.map(retPct)).toFixed(2),
    byReason,
  };
}

function sharpe(equityHistory) {
  const eq = (equityHistory || []).filter(p => p && Number.isFinite(p.equity)).map(p => p.equity);
  if (eq.length < 3) return 0;
  const rets = [];
  for (let i = 1; i < eq.length; i++) if (eq[i - 1] > 0) rets.push((eq[i] - eq[i - 1]) / eq[i - 1]);
  if (rets.length < 2) return 0;
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const variance = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(variance);
  if (sd === 0) return 0;
  return +((mean / sd) * Math.sqrt(252)).toFixed(2);   // günlük eq noktaları → yıllık
}

// Snapshot'a gömülü tek özet
function computeMetrics({ trades, equityHistory } = {}) {
  const dd = maxDrawdown(equityHistory);
  const ts = tradeStats(trades);
  return {
    maxDrawdownPct: dd.maxDrawdownPct,
    peakEquity: dd.peakEquity,
    sharpe: sharpe(equityHistory),
    profitFactor: ts.profitFactor,
    expectancyTL: ts.expectancyTL,
    avgWinPct: ts.avgWinPct, avgLossPct: ts.avgLossPct,
    avgWinTL: ts.avgWinTL, avgLossTL: ts.avgLossTL,
    avgHoldDays: ts.avgHoldDays,
    bestPct: ts.bestPct, worstPct: ts.worstPct,
    closedCount: ts.count, wins: ts.wins, losses: ts.losses,
    byReason: ts.byReason,
  };
}

module.exports = { maxDrawdown, tradeStats, sharpe, computeMetrics, daysBetween };
