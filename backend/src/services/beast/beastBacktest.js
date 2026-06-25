/**
 * beastBacktest — BEAST Trend için ileri-bakışsız, gerçekçi backtest motoru.
 *
 * Gerçekçilik:
 *  - Sinyal bar i'de üretilir, giriş bar i+1 AÇILIŞINDA (next-open fill) → sızıntı yok.
 *  - Aynı anda tek pozisyon (canlı dedup'u aynalar); çıkışa kadar yeni sinyal aranmaz.
 *  - Kademeli çıkış: TP1'de %50 realize + stop BE'ye, kalan %50 ATR iz-süren stop / TP2.
 *  - Muhafazakâr sıralama: stop ve TP aynı barda ise STOP önce (en kötü durum).
 *  - Maliyet: notional × 2 × costPct (komisyon+slipaj) — dar stop = yüksek notional cezası.
 *  - Sabit-kesir risk (her işlem equity'nin %riskPct'i) → net%, maxDD anlamlı.
 *
 * HTF bias: sinyal mumları `factor` ile resample edilip ÜST-TF serisi çıkarılır;
 * sinyal bar idx için kullanılabilir HTF grup = floor(idx/factor) - 1 (TAM kapanmış).
 */

'use strict';

const S = require('./beastStrategy');
const I = require('./beastIndicators');

const RISK_PCT = 0.01;        // işlem başına equity'nin %1'i risk
const COST_PCT = 0.0005;      // tek yön komisyon+slipaj (0.05%)
const MAX_NOTIONAL = 2.0;     // notional/equity tavanı (gerçekçilik)

function runBacktest(candles, factor, cfg, tfDef, precision = 2, opts = {}) {
  const riskPct = opts.riskPct != null ? opts.riskPct : RISK_PCT;
  const costPct = opts.costPct != null ? opts.costPct : COST_PCT;
  const horizon = (tfDef && tfDef.horizon) || 40;
  const n = candles.length;
  if (n < 120) return emptyResult('insufficient_candles');

  const ind = S.prepare(candles, cfg);
  const htfCandles = factor > 1 ? I.resample(candles, factor) : candles;
  const htf = S.prepareHTF(htfCandles, cfg);

  const trades = [];
  let equity = 1.0, peak = 1.0, maxDD = 0;
  const equityCurve = [];

  // warmup: atr(zlLength) + ichimoku self-gate (spanB+disp≈78) hazır olsun.
  // Band'in highest penceresi erken barlarda kısalır ama geçerlidir → tüm seriyi kullanma.
  let i = Math.max(100, cfg.zlLength + 40);
  while (i < n - 2) {
    const htfIdx = htf ? Math.floor(i / factor) - 1 : -1;
    const htfSnap = S.htfSnapshot(htf, htfIdx);
    const sig = S.evaluateAt(candles, ind, cfg, i, '', htfSnap, precision);
    if (!sig) { i++; continue; }

    // Giriş: bar i+1 açılışı; seviyeleri gerçek fill'e göre yeniden kur (temiz R/R)
    const entryFill = candles[i + 1].open;
    const atr = ind.atr[i];
    const swing = I.recentSwing(candles, i, cfg.swingLeft, cfg.swingRight, cfg.swingLookback);
    const lv = S.buildLevels(sig.direction, entryFill, atr, swing, cfg, precision);
    if (!lv || !(lv.riskDist > 0)) { i++; continue; }

    const sim = simulateTrade(candles, i, entryFill, lv, atr, cfg, horizon, n);
    const { exitR, exitReason, exitIdx } = sim;
    const risk = lv.riskDist;

    // Equity güncelle (maliyet dahil)
    const stopPct = risk / entryFill;
    const notional = Math.min(MAX_NOTIONAL, riskPct / Math.max(stopPct, 1e-6));
    const grossFrac = exitR * riskPct;
    const costFrac = notional * 2 * costPct;
    const netFrac = grossFrac - costFrac;
    equity *= (1 + netFrac);
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, (peak - equity) / peak);
    equityCurve.push(+equity.toFixed(6));

    trades.push({
      dir: sig.direction, entryIdx: i + 1, exitIdx, entry: +entryFill.toFixed(precision),
      stop: lv.stop, tp1: lv.target1, tp2: lv.target2, exitReason, R: +exitR.toFixed(3), netFrac: +netFrac.toFixed(5),
      score: sig.score, confidence: sig.confidence, trigger: sig.trigger,
      holdBars: exitIdx - (i + 1), time: candles[i + 1].time,
    });

    i = exitIdx + 1; // çıkıştan sonra devam (örtüşme yok)
  }

  return metricsFrom(trades, equity, maxDD, candles, n);
}

/**
 * Tek işlemi ileri simüle et. Mod (cfg.partialMode):
 *  'partial' — TP1'de %50 realize + BE + chandelier iz-süren, kalan TP2/trail (varsayılan)
 *  'runner'  — tam boy; +1R'de BE'ye, sonra chandelier trail; çıkış trail/TP2 (winner'lar koşar)
 *  'fixed'   — tam boy; sabit stop, tek hedef rr1; trail/partial yok (temiz R/R)
 * Muhafazakâr: stop ve TP aynı barda → stop önce.
 */
function simulateTrade(candles, i, entryFill, lv, atr, cfg, horizon, n) {
  const isLong = lv.target1 > lv.entry;
  const risk = lv.riskDist;
  const mode = cfg.partialMode || 'partial';
  const tp1 = lv.target1, tp2 = lv.target2;
  const jEnd = Math.min(n - 1, i + 1 + horizon);
  let stop = lv.stop;
  let tp1Done = false, beMoved = false;
  let runExt = isLong ? -Infinity : Infinity;
  const trailStop = (bar) => {
    runExt = isLong ? Math.max(runExt, bar.high) : Math.min(runExt, bar.low);
    const t = isLong ? runExt - cfg.trailATR * atr : runExt + cfg.trailATR * atr;
    stop = isLong ? Math.max(stop, t) : Math.min(stop, t);
  };
  const remR = () => isLong ? (stop - entryFill) / risk : (entryFill - stop) / risk;
  const reason = () => (isLong ? stop > entryFill : stop < entryFill) ? 'trail' : 'be';

  for (let j = i + 1; j <= jEnd; j++) {
    const bar = candles[j];
    const stopHit = isLong ? bar.low <= stop : bar.high >= stop;
    const tp1Hit = isLong ? bar.high >= tp1 : bar.low <= tp1;
    const tp2Hit = isLong ? bar.high >= tp2 : bar.low <= tp2;

    if (mode === 'fixed') {
      if (stopHit) return { exitR: -1, exitReason: 'stop', exitIdx: j };
      if (tp1Hit) return { exitR: cfg.rr1, exitReason: 'tp1', exitIdx: j };
      continue;
    }

    if (mode === 'runner') {
      if (stopHit) return { exitR: remR(), exitReason: beMoved ? reason() : 'stop', exitIdx: j };
      if (tp2Hit) return { exitR: cfg.rr2, exitReason: 'tp2', exitIdx: j };
      // +1R'ye ulaşınca BE'ye çek, sonra chandelier trail
      const reachedR = isLong ? (bar.high - entryFill) / risk : (entryFill - bar.low) / risk;
      if (!beMoved && reachedR >= 1) { stop = entryFill; beMoved = true; }
      if (beMoved) trailStop(bar);
      continue;
    }

    // mode === 'partial'
    if (!tp1Done) {
      if (stopHit) return { exitR: -1, exitReason: 'stop', exitIdx: j };
      if (tp1Hit) {
        tp1Done = true; stop = entryFill;
        if (tp2Hit) return { exitR: 0.5 * cfg.rr1 + 0.5 * cfg.rr2, exitReason: 'tp2', exitIdx: j };
      }
      continue;
    }
    trailStop(bar);
    if (tp2Hit) return { exitR: 0.5 * cfg.rr1 + 0.5 * cfg.rr2, exitReason: 'tp2', exitIdx: j };
    const stopHit2 = isLong ? bar.low <= stop : bar.high >= stop;
    if (stopHit2) return { exitR: 0.5 * cfg.rr1 + 0.5 * remR(), exitReason: reason(), exitIdx: j };
  }

  // Ufuk doldu → kalanı son kapanışta mark-to-market
  const last = candles[jEnd];
  const mtm = isLong ? (last.close - entryFill) / risk : (entryFill - last.close) / risk;
  const exitR = mode === 'partial' && tp1Done ? (0.5 * cfg.rr1 + 0.5 * mtm) : mtm;
  return { exitR, exitReason: 'timeout', exitIdx: jEnd };
}

function metricsFrom(trades, equity, maxDD, candles, n) {
  const closed = trades.length;
  const wins = trades.filter(t => t.R > 0);
  const losses = trades.filter(t => t.R <= 0);
  const sumWinR = wins.reduce((s, t) => s + t.R, 0);
  const sumLossR = Math.abs(losses.reduce((s, t) => s + t.R, 0));
  const exitBreak = {};
  for (const t of trades) exitBreak[t.exitReason] = (exitBreak[t.exitReason] || 0) + 1;
  const span = candles && n ? (candles[n - 1].time - candles[0].time) / 86400 : 0;
  return {
    trades: closed,
    winRate: closed ? +(wins.length / closed * 100).toFixed(1) : 0,
    avgR: closed ? +(trades.reduce((s, t) => s + t.R, 0) / closed).toFixed(3) : 0,
    profitFactor: sumLossR > 0 ? +(sumWinR / sumLossR).toFixed(2) : (sumWinR > 0 ? 99 : 0),
    expectancyR: closed ? +(trades.reduce((s, t) => s + t.R, 0) / closed).toFixed(3) : 0,
    netPct: +((equity - 1) * 100).toFixed(1),
    maxDDPct: +(maxDD * 100).toFixed(1),
    avgHoldBars: closed ? +(trades.reduce((s, t) => s + t.holdBars, 0) / closed).toFixed(1) : 0,
    exitBreak,
    spanDays: Math.round(span),
    tradesPerMonth: span > 0 ? +(closed / (span / 30)).toFixed(1) : 0,
    _trades: trades,
  };
}

function emptyResult(reason) {
  return { trades: 0, winRate: 0, avgR: 0, profitFactor: 0, expectancyR: 0, netPct: 0, maxDDPct: 0, avgHoldBars: 0, exitBreak: {}, spanDays: 0, tradesPerMonth: 0, error: reason, _trades: [] };
}

// vs-random taban çizgisi: aynı seviye/çıkış mantığı, ama RASTGELE barlarda RASTGELE
// yönde N giriş. BEAST'in avgR'ı bunu belirgin yenmeli (giriş kenarı gerçek mi?).
function runRandomBaseline(candles, cfg, tfDef, precision, nEntries, rnd) {
  const horizon = (tfDef && tfDef.horizon) || 40;
  const n = candles.length;
  const ind = S.prepare(candles, cfg);
  const trades = [];
  const lo = Math.max(100, cfg.zlLength + 40), hi = n - 2;
  for (let k = 0; k < nEntries; k++) {
    const i = lo + Math.floor(rnd() * (hi - lo));
    if (i <= lo || i >= hi) continue;
    const atr = ind.atr[i];
    if (!(atr > 0)) continue;
    const dir = rnd() < 0.5 ? 'long' : 'short';
    const entryFill = candles[i + 1].open;
    const swing = I.recentSwing(candles, i, cfg.swingLeft, cfg.swingRight, cfg.swingLookback);
    const lv = S.buildLevels(dir, entryFill, atr, swing, cfg, precision);
    if (!lv || !(lv.riskDist > 0)) continue;
    const sim = simulateTrade(candles, i, entryFill, lv, atr, cfg, horizon, n);
    trades.push({ R: sim.exitR, exitReason: sim.exitReason });
  }
  return trades;
}

module.exports = { runBacktest, metricsFrom, simulateTrade, runRandomBaseline };
