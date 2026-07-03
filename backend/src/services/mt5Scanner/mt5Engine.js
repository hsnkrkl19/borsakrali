/**
 * MT5 Gün-içi Tarayıcı Motoru — 9 enstrüman × 5 TF (5m/15m/1h/4h/1d), HER DK.
 *
 * Mevcut tarayıcıların TÜM analiz teknikleri her enstrüman×TF'e uygulanır:
 * Genel Tarama (17 strateji: RSI/EMA/Bollinger/Ichimoku/ADX/Supertrend/Stoch/
 * MACD/VWAP) + EMA34 Wave + TEMA34 kesişim + Malaysian SNR + SMC — forex
 * strateji katmanı BİREBİR yeniden kullanılır (ayrı port yok). Ağırlıklı oy →
 * yön + 0-100 GÜVEN NOTU (uzlaşı %32 + ort.skor %24 + ADX %16 + momentum %10 +
 * R/R %10 + çoklu-TF confluence %8).
 *
 * Farklar (kullanıcı kuralları):
 *   • Seviyeler GÜN-İÇİ (mt5Levels): TP1 yakın (isabet önceliği), günlük ATR kıskacı.
 *   • Lot = %1 risk hedefi → kural kıskacı (günlük %5/toplam %10) → 1:100 kaldıraç
 *     + marj tavanı → MT5 broker adımına yuvarlama. Lot/marj/risk/kâr-zarar
 *     mesajda AYNEN MT5'te açılacak pozisyon.
 *   • Her sinyale riskGate damgası: bütçe/pencere/yön-kilidi kontrolü (site
 *     "neden verilmedi"yi de gösterir; push yalnız geçenleri açar).
 *   • Canlı fiyat: köprü broker bid/ask beslemesi varsa broker mid (Yahoo vadeli
 *     basis'i giderilir), yoksa Yahoo 1m son kapanış. Bayat (>15dk) enstrüman elenir.
 */

const forexKlines = require('../forex/forexKlines');
const { atr } = require('../forex/indicators');
const genel = require('../forex/strategies/genelTarama');
const ema34 = require('../forex/strategies/ema34');
const tema34 = require('../forex/strategies/tema34');
const snrStrat = require('../forex/strategies/snr');
const smcStrat = require('../forex/strategies/smc');
const { aggregate, computeConfidence, gradeFor, bandFor } = require('../forex/forexAggregator');
const { computeSizing } = require('../forex/riskSizing');
const forexBacktest = require('../forex/forexBacktest');
const brokerPrices = require('../forex/brokerPrices');
const levelsLib = require('./mt5Levels');
const tracker = require('./mt5Tracker');
const learning = require('./mt5Learning');
const { INSTRUMENTS, getInstrument } = require('./mt5Instruments');

const TFS = ['5m', '15m', '1h', '4h', '1d'];  // kullanıcı isteği: 5 TF, hepsi ayrı sinyal
const STALE_MINUTES = 15;
const MIN_CONFIDENCE = 40;
function riskPct() {
  const v = Number(process.env.MT5_RISK_PER_TRADE_PCT);
  return Number.isFinite(v) && v > 0 && v <= 0.05 ? v : 0.01; // vars. işlem başına %1
}
// Öğrenme çarpanı dahil efektif işlem-başı risk — MUTLAK tavan %2
// (bütçe kapıları — günlük %5 / toplam %10 — her koşulda ayrıca geçerli).
const RISK_PCT_HARD_CAP = 0.02;
function effectiveRiskPct(id, tf) {
  return Math.min(riskPct() * learning.riskMultFor(id, tf), RISK_PCT_HARD_CAP);
}

let latest = null;

function assetTypeFor(cls) { return cls === 'crypto' ? 'crypto' : cls === 'metal' ? 'commodity' : 'stock'; }

// ── Tek (enstrüman, TF) ────────────────────────────────────────────────────
async function evalTF(inst, tf, livePrice, equity, dailyAtr) {
  const candles = await forexKlines.fetchCandles(inst.yahoo, tf, 300);
  if (!candles || candles.length < 60) return { tf, status: 'no_data' };

  const assetType = assetTypeFor(inst.class);
  const [snrRes, smcRes] = await Promise.all([
    snrStrat.evaluate(candles, inst.id, tf, assetType),
    smcStrat.evaluate(candles, inst.id, tf, assetType),
  ]);
  const gen = genel.evaluate(candles);
  const e34 = ema34.evaluate(candles);
  const t34 = tema34.evaluate(candles);

  const agg = aggregate([gen, e34, t34, snrRes, smcRes], gen?.ind);
  if (agg.direction === 'neutral') return { tf, status: 'neutral', votes: agg.votes };

  const atrVal = atr(candles, 14);
  const entry = livePrice || candles[candles.length - 1].close;
  const levels = levelsLib.buildLevels(agg.direction, entry, atrVal, tf, inst.precision, dailyAtr);
  if (!levels) return { tf, status: 'neutral', votes: agg.votes };

  // %1 hedef risk × öğrenme çarpanı → kural kıskacı → kaldıraç/marj → broker lot adımı
  const raw = computeSizing(
    { instrument: inst, entry: levels.entry, stop: levels.stop, direction: agg.direction },
    { equity, riskPerTradePct: effectiveRiskPct(inst.id, tf) }
  );
  const sizing = raw && levelsLib.snapSizingToBroker(raw, inst, levels.entry, levels.stop, {
    maxRiskUsd: equity * tracker.DAILY_MAX_LOSS_PCT,
  });
  if (!sizing) return { tf, status: 'neutral', votes: agg.votes };

  const pnl = levelsLib.buildPnL(sizing.units, levels.entry, levels);
  const mt5 = levelsLib.buildMt5(inst, agg.direction, sizing.lots, levels, tf, inst.precision);

  const conditions = [];
  for (const m of agg.modules) for (const c of (m.conditions || [])) if (c.met) conditions.push({ ...c, technique: m.technique });

  const confComponents = { consensus: agg.consensus, avgScore: agg.avgScore, trendStrength: agg.trendStrength, momentum: agg.momentum, rr1: levels.rr1 };

  // Öğrenme damgası: UI + notifier bu sinyalin gölge/gerçek olduğunu görür
  const lMode = learning.modeFor(inst.id, tf);
  const lMult = learning.riskMultFor(inst.id, tf);

  return {
    tf, status: 'signal',
    learning: { mode: lMode, riskMult: lMult },
    direction: agg.direction, action: agg.direction === 'long' ? 'LONG' : 'SHORT',
    horizon: levelsLib.tradeHorizon(),
    consensus: +agg.consensus.toFixed(2), avgVoteScore: Math.round(agg.avgScore),
    ...levels,
    sizing, pnl, mt5,
    votes: agg.votes, conditions,
    indicators: gen?.ind || null,
    _c: confComponents,
  };
}

// ── Tek enstrüman: 5 TF + confluence + güven + riskGate ────────────────────
async function evalInstrument(inst, equity) {
  const meta = { id: inst.id, name: inst.name, symbol: inst.symbol, class: inst.class, precision: inst.precision, tvSymbol: inst.tvSymbol, contractSize: inst.contractSize };
  const m1 = await forexKlines.fetchCandles(inst.yahoo, '1m', 60);
  let ref = (m1 && m1.length) ? m1[m1.length - 1] : null;
  if (!ref) { const m5 = await forexKlines.fetchCandles(inst.yahoo, '5m', 60); ref = (m5 && m5.length) ? m5[m5.length - 1] : null; }
  if (!ref) return { ...meta, status: 'no_data', perTf: {} };

  const ageMin = (Date.now() / 1000 - ref.time) / 60;
  const open = inst.alwaysOpen || ageMin <= STALE_MINUTES;
  if (!open) return { ...meta, status: 'closed', ageMin: Math.round(ageMin), perTf: {} };

  const bp = brokerPrices.get(inst.id);
  const livePrice = (bp && bp.mid > 0) ? bp.mid : ref.close;
  const priceSource = (bp && bp.mid > 0) ? 'broker' : 'yahoo';

  // Günlük ATR — gün-içi ulaşılabilirlik kıskacı için (tüm TF'lere geçilir)
  const d1 = await forexKlines.fetchCandles(inst.yahoo, '1d', 60);
  const dailyAtr = (d1 && d1.length >= 15) ? atr(d1, 14) : null;

  const arr = await Promise.all(TFS.map((tf) => evalTF(inst, tf, livePrice, equity, dailyAtr)));
  const perTf = {};
  for (const r of arr) perTf[r.tf] = r;

  const dirs = TFS.map((tf) => perTf[tf]?.direction).filter(Boolean);
  for (const tf of TFS) {
    const s = perTf[tf];
    if (!s || s.status !== 'signal') continue;
    const sameCount = dirs.filter((d) => d === s.direction).length;
    const confluence = Math.max(0, (sameCount - 1) / (TFS.length - 1));
    const confidence = computeConfidence({ ...s._c, confluence });
    s.confluence = +confluence.toFixed(2);
    s.sameTfCount = sameCount;
    s.confidence = confidence;
    s.grade = gradeFor(confidence);
    s.confidenceBand = bandFor(confidence);
    const h = forexBacktest.getHistory(meta.id, tf, confidence);
    if (h) { s.historicalWinRate = h.winRate; s.sampleSize = h.sampleSize; s.historicalAvgReturn = h.avgReturn; s.historyBand = h.band; }
    delete s._c;
    if (confidence < MIN_CONFIDENCE) { perTf[tf] = { tf, status: 'low_conf', direction: s.direction, confidence, votes: s.votes }; }
  }

  return { ...meta, status: 'open', livePrice, priceSource, ageMin: +ageMin.toFixed(1), perTf };
}

// ── Tüm evren ──────────────────────────────────────────────────────────────
async function generate(equityOverride) {
  await tracker.load();
  const equity = equityOverride > 0 ? equityOverride : tracker.getEquity();
  const insts = await Promise.all(INSTRUMENTS.map((i) => evalInstrument(i, equity)));
  const signals = [];
  for (const it of insts) {
    if (it.status !== 'open') continue;
    for (const tf of TFS) {
      const s = it.perTf[tf];
      if (s && s.status === 'signal') {
        const sig = { id: it.id, name: it.name, symbol: it.symbol, class: it.class, precision: it.precision, tvSymbol: it.tvSymbol, ...s };
        // Damga: bu sinyal ŞU AN verilebilir mi (bütçe/pencere/yön kilidi/dedup)?
        // Gölge kombolar kendi evreninde (bütçesiz) değerlendirilir.
        const g = tracker.gate(sig, equity, { shadow: sig.learning?.mode === 'shadow' });
        sig.riskGate = g.ok ? { ok: true } : { ok: false, reason: g.reason, code: g.code || null };
        signals.push(sig);
      }
    }
  }
  signals.sort((a, b) => b.confidence - a.confidence);

  latest = {
    generatedAt: new Date().toISOString(),
    equity,
    portfolio: {
      equity, leverage: tracker.LEVERAGE,
      dailyMaxLossPct: tracker.DAILY_MAX_LOSS_PCT * 100,
      totalMaxLossPct: tracker.TOTAL_MAX_LOSS_PCT * 100,
      riskPerTradePct: riskPct() * 100,
    },
    budget: tracker.budget(equity),
    tfs: TFS,
    counts: {
      scanned: INSTRUMENTS.length,
      open: insts.filter((i) => i.status === 'open').length,
      signal: signals.length,
      long: signals.filter((s) => s.direction === 'long').length,
      short: signals.filter((s) => s.direction === 'short').length,
      executable: signals.filter((s) => s.riskGate?.ok).length,
    },
    openPositions: tracker.getOpen(),
    instruments: insts,
    signals,
  };
  return latest;
}

function getLatest() { return latest; }

// Portföy değişince: yeniden taramadan lot/kâr-zarar/MT5 ölçekle (görünüm)
function rescale(equity) {
  if (!latest) return null;
  if (!equity || equity === latest.equity) return latest;
  const redo = (s) => {
    const i = getInstrument(s.id);
    if (!i) return s;
    const raw = computeSizing(
      { instrument: i, entry: s.entry, stop: s.stop, direction: s.direction },
      { equity, riskPerTradePct: effectiveRiskPct(s.id, s.tf) }
    );
    const sizing = raw && levelsLib.snapSizingToBroker(raw, i, s.entry, s.stop, { maxRiskUsd: equity * tracker.DAILY_MAX_LOSS_PCT });
    if (!sizing) return s;
    const pnl = levelsLib.buildPnL(sizing.units, s.entry, { stop: s.stop, target1: s.target1, target2: s.target2 });
    const mt5 = levelsLib.buildMt5(i, s.direction, sizing.lots, { entry: s.entry, stop: s.stop, target1: s.target1, target2: s.target2 }, s.tf, s.precision);
    return { ...s, sizing, pnl, mt5 };
  };
  const signals = latest.signals.map(redo);
  const instruments = latest.instruments.map((it) => {
    if (it.status !== 'open') return it;
    const perTf = {};
    for (const tf of TFS) { const s = it.perTf[tf]; perTf[tf] = (s && s.status === 'signal') ? redo(s) : s; }
    return { ...it, perTf };
  });
  return { ...latest, equity, portfolio: { ...latest.portfolio, equity }, budget: tracker.budget(equity), instruments, signals };
}

async function analyzeOne(id, equityOverride) {
  const inst = getInstrument(id);
  if (!inst) return null;
  await tracker.load();
  return evalInstrument(inst, equityOverride > 0 ? equityOverride : tracker.getEquity());
}

module.exports = { generate, getLatest, rescale, analyzeOne, TFS, MIN_CONFIDENCE };
