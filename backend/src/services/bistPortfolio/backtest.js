/**
 * bistPortfolio/backtest — kuralı GEÇMİŞE SAR: model portföyünün tarihsel
 * getiri/drawdown/kazanma oranını + BIST100'e karşı alfayı ölçer.
 *
 * VARSAYILAN ÖLÇÜT: **avgVoteScore ≥ 80** — yani CANLI @borsasinyal34 (AL) botunun
 * ölçütü. ⚠️ Consensus-CONFIDENCE BIST'te ~45'te takılır (≥75 pratikte hiç oluşmaz),
 * bu yüzden "≥75" ile backtest anlamsızdır; mode:'signals' + minConfidence ile ayrıca
 * ölçülebilir (bistBacktest kalibrasyonu bilerek 50 eşiğini kullanır).
 *
 * NOKTA-ANI (look-ahead'siz): her sembol için `bistBacktest.buildSymbolSignals`
 * (canlı 5-strateji hattının birebir aynısı, YALNIZ o güne kadarki mumlarla)
 * sinyalleri üretir. Sonra `replay` bu sinyalleri gün-gün GERÇEK portföy motorundan
 * (syncBuys + manageHeld + commitCloses) geçirir → equity eğrisi + işlemler.
 * "Backtest = canlı motor, geçmişe sarılmış" — aynı para matematiği, aynı held-only
 * invaryantı. Analitik + benchmark AYNI fonksiyonlarla ölçülür.
 *
 * ⚠️ ≥75 CONFIDENCE stratejisidir (signals botu). AL botu avgScore≥80 farklı
 * ölçüt kullanır — onun backtest'i ayrı bir adımdır (band, confidence-kovasıdır).
 */

const liveDataService = require('../liveDataService');
// Nokta-anı skorlama: CANLI hattın birebir aynı modülleri (saf; mum dilimi alır)
const genelTarama = require('../forex/strategies/genelTarama');
const ema34Strat = require('../forex/strategies/ema34');
const tema34Strat = require('../forex/strategies/tema34');
const snrStrat = require('../forex/strategies/snr');
const smcStrat = require('../forex/strategies/smc');
const { aggregate, computeConfidence } = require('../forex/forexAggregator');
const levelsLib = require('../forex/forexLevels');
const { atr } = require('../forex/indicators');
const { allBistStocks } = require('../../data/allBistStocks');
const engine = require('./portfolioEngine');
const analytics = require('./analytics');
const benchmark = require('./benchmark');
const { createInMemoryStore } = require('../backtest/inMemoryStore');
const logger = require('../../utils/logger');

function toCandles(hist) {
  return (hist || [])
    .filter(r => r && r.close != null && r.high != null && r.low != null)
    .map(r => ({
      date: r.date || (Number.isFinite(r.timestamp) ? new Date(r.timestamp).toISOString().slice(0, 10) : null),
      open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume || 0,
    }))
    .filter(c => c.date);
}

/**
 * NOKTA-ANI skor — YALNIZ verilen mum dilimiyle (look-ahead YOK). bistScoreEngine
 * .scoreSymbol'ün ağsız ikizi: aynı 5 strateji + aggregate + levels + confidence.
 * TP2/rr de döner (canlı scale-out'un backtest'te de çalışabilmesi için).
 */
// ⚠️ tfKey: snr/smc sonuçlarını (sembol+timeframe) anahtarıyla ÖNBELLEKLEYEBİLİR.
// Her mum dilimi için BENZERSİZ anahtar ver (buildSymbolSignals'ın '1d#bt<i>' deseni),
// yoksa ilk dilimin sonucu tüm dilimlerde tekrar kullanılır → kirlenme/look-ahead.
async function scoreAt(candles, symbol, tfKey = '1d') {
  if (!candles || candles.length < 100) return null;
  const [snrR, smcR] = await Promise.all([
    snrStrat.evaluate(candles, symbol, tfKey, 'stock'),
    smcStrat.evaluate(candles, symbol, tfKey, 'stock'),
  ]);
  const gen = genelTarama.evaluate(candles);
  const agg = aggregate([gen, ema34Strat.evaluate(candles), tema34Strat.evaluate(candles), snrR, smcR], gen && gen.ind);
  if (agg.direction !== 'long') return null;                 // BIST: yalnız long
  const a = atr(candles, 14);
  const entry = candles[candles.length - 1].close;
  const lv = levelsLib.buildLevels('long', entry, a, '1d', 2);
  if (!lv) return null;
  const confidence = computeConfidence({
    consensus: agg.consensus, avgScore: agg.avgScore,
    trendStrength: agg.trendStrength, momentum: agg.momentum, rr1: lv.rr1, confluence: 0,
  });
  return {
    entry: lv.entry, stop: lv.stop, target1: lv.target1, target2: lv.target2,
    rr1: lv.rr1, rr2: lv.rr2, confidence, avgVoteScore: Math.round(agg.avgScore),
    indicators: (gen && gen.ind) || null,
  };
}

/**
 * Bir sembolün nitelikli nokta-anı sinyalleri.
 * mode 'al'      → avgVoteScore ≥ minAvgScore (VARSAYILAN — CANLI @borsasinyal34 botunun ölçütü)
 * mode 'signals' → confidence ≥ minConfidence
 * ⚠️ BIST'te consensus-CONFIDENCE ~45'te takılır (≥75 pratikte HİÇ üretilmez) — bu yüzden
 *    canlı AL botu avgVoteScore kullanır ve backtest de varsayılan olarak onu ölçer.
 */
async function buildSignals(symbol, candles, opts = {}) {
  const mode = opts.mode || 'al';
  const minConf = opts.minConfidence != null ? opts.minConfidence : 50;
  const minAvg = opts.minAvgScore != null ? opts.minAvgScore : 80;
  const buffer = opts.buffer != null ? opts.buffer : 5;       // son N barı giriş adayı sayma
  const lookback = opts.lookback != null ? opts.lookback : 120;
  const end = candles.length - buffer;
  const start = Math.max(100, end - lookback);
  const out = [];
  for (let i = start; i < end; i++) {
    const s = await scoreAt(candles.slice(0, i + 1), symbol, `1d#bt${i}`);
    if (!s) continue;
    const pass = mode === 'al' ? (s.avgVoteScore >= minAvg) : (s.confidence >= minConf);
    if (!pass) continue;
    out.push({ index: i, ...s });
  }
  return out;
}

// Nokta-anı sinyali motor adayına çevir (TP2 dahil → scale-out backtest'te de aktif).
function toCandidate(sig, symbol, candles) {
  return {
    symbol, name: symbol, direction: 'long',
    entry: sig.entry, stop: sig.stop, target1: sig.target1, target2: sig.target2,
    rr1: sig.rr1, rr2: sig.rr2,
    avgVoteScore: sig.avgVoteScore, confidence: sig.confidence, precision: 2,
    _entryDate: candles[sig.index] && candles[sig.index].date,
  };
}

/**
 * SAF portföy replay'i (ağ yok — test edilebilir).
 * @param perSymbol [{ symbol, candles:[{date,open,high,low,close,volume}], signals:[{index,entry,stop,target,band}] }]
 * @param cfg engine.buildConfig(...)
 * @returns { equityHistory, trades, portfolio, days }
 */
async function replay(perSymbol, cfg, opts = {}) {
  const capital = opts.capital != null ? opts.capital : cfg.capital;
  const store = createInMemoryStore(capital, 'TRY');

  // Sembol → (tarih→mum) ve tarih→aday, tarih→nitelikli-set
  const dateSet = new Set();
  const candlesBySym = {};
  const candByDate = {};       // date -> [candidate]
  const qualByDate = {};       // date -> Set(symbol)
  for (const s of perSymbol) {
    const cs = (s.candles || []).filter(c => c && c.date && Number.isFinite(c.close));
    candlesBySym[s.symbol] = cs;
    for (const c of cs) dateSet.add(c.date);
    for (const sig of (s.signals || [])) {
      const cand = toCandidate(sig, s.symbol, cs);
      const d = cand._entryDate;
      if (!d) continue;
      (candByDate[d] = candByDate[d] || []).push(cand);
      (qualByDate[d] = qualByDate[d] || new Set()).add(s.symbol);
    }
  }
  // Yalnız sinyal ürettiğimiz pencereyi replay et (ilk sinyalden son muma)
  const signalDates = Object.keys(candByDate).sort();
  if (!signalDates.length) return { equityHistory: [], trades: [], portfolio: store.getPortfolio(), days: 0 };
  const first = signalDates[0];
  const timeline = [...dateSet].filter(d => d >= first).sort();

  const slicedTo = (sym, d) => (candlesBySym[sym] || []).filter(c => c.date <= d);
  const equityHistory = [];

  for (const D of timeline) {
    const now = new Date(`${D}T16:00:00Z`);   // gün D kapanışı → oluşan-bar düşmesin (D tamam)
    // 1) O gün nitelenen yeni adayları AL (held-guard + slot/nakit)
    if (candByDate[D]) engine.syncBuys(store, candByDate[D], cfg, { now });
    // 2) Açık pozisyonları yönet (STOP/TP/timeout + strateji-SAT: nitelik-dışı+EMA34)
    const candlesForHeld = {};
    for (const pos of store.listOpen()) candlesForHeld[pos.symbol] = slicedTo(pos.symbol, D);
    const { intents } = await engine.manageHeld(store, cfg, { qualifiedSymbols: qualByDate[D] || new Set(), candlesBySymbol: candlesForHeld, now });
    engine.commitCloses(store, cfg, intents, { now });
    // 3) Gün sonu equity + MARUZİYET işaretle (D kapanışıyla)
    const pf = store.getPortfolio();
    const openVal = store.listOpen().reduce((s, p) => s + ((p.lastPrice || p.entryPrice) * p.shares), 0);
    const eq = +(pf.cash + openVal).toFixed(2);
    equityHistory.push({ date: D, equity: eq, invested: +(eq > 0 ? (openVal / eq) * 100 : 0).toFixed(1), openCount: store.listOpen().length });
  }

  const trades = typeof store.listTradesChrono === 'function' ? store.listTradesChrono() : store.listTrades(99999);
  return { equityHistory, trades, portfolio: store.getPortfolio(), days: timeline.length };
}

// Rapor: equity + trades → metrikler + benchmark
async function report(sim, cfg) {
  const eh = sim.equityHistory || [];
  const capital = cfg.capital;
  const finalEq = eh.length ? eh[eh.length - 1].equity : capital;
  const totalReturnPct = +(((finalEq - capital) / capital) * 100).toFixed(2);
  const metrics = analytics.computeMetrics({ trades: sim.trades, equityHistory: eh });
  let bench = null;
  try { bench = await benchmark.compare(eh, totalReturnPct); } catch (_) {}
  // MARUZİYET: ortalama yatırımda kalma oranı — düşükse portföy nakitte bekliyor
  // demektir ve yükselen piyasada endeksi yapısal olarak geçemez.
  const invs = eh.map(p => p.invested).filter(v => Number.isFinite(v));
  const avgExposurePct = invs.length ? +(invs.reduce((s, v) => s + v, 0) / invs.length).toFixed(1) : 0;
  const daysFlat = invs.filter(v => v < 5).length;
  return {
    capital, finalEquity: finalEq, totalReturnPct, days: sim.days,
    closedTrades: (sim.trades || []).length,
    avgExposurePct, flatDays: daysFlat, flatDaysPct: invs.length ? +((daysFlat / invs.length) * 100).toFixed(1) : 0,
    metrics, benchmark: bench,
    equityHistory: eh,
    from: eh[0] && eh[0].date, to: eh[eh.length - 1] && eh[eh.length - 1].date,
  };
}

// CANLI çalıştır: evreni çek → nokta-anı sinyaller → replay → rapor.
async function run(opts = {}) {
  const cfg = engine.buildConfig({ key: 'backtest', ...(opts.cfg || {}) });
  const universe = (opts.universe || allBistStocks).slice(0, opts.limit || 60);
  const BATCH = 8, PAUSE = 150;
  const perSymbol = [];
  for (let i = 0; i < universe.length; i += BATCH) {
    const batch = universe.slice(i, i + BATCH);
    const built = await Promise.all(batch.map(async (stock) => {
      const symbol = (stock.symbol || stock).replace('.IS', '');
      try {
        const candles = toCandles(await liveDataService.fetchHistoricalData(symbol, '1y', '1d'));
        if (candles.length < 130) return null;
        const signals = await buildSignals(symbol, candles, opts.signal || {});
        if (!signals || !signals.length) return null;
        return { symbol, candles, signals };
      } catch (_) { return null; }
    }));
    for (const b of built) if (b) perSymbol.push(b);
    if (i + BATCH < universe.length) await new Promise(r => setTimeout(r, PAUSE));
  }
  const sim = await replay(perSymbol, cfg, { capital: cfg.capital });
  const rep = await report(sim, cfg);
  rep.symbolsWithSignals = perSymbol.length;
  rep.universeScanned = universe.length;
  logger.info(`🧪 BIST portföy backtest — ${perSymbol.length} sembol · ${rep.closedTrades} işlem · getiri ${rep.totalReturnPct}% · alfa ${rep.benchmark ? rep.benchmark.alphaPct : '?'}%`);
  return rep;
}

module.exports = { run, replay, report, toCandidate, toCandles, scoreAt, buildSignals };
