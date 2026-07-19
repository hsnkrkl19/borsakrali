/**
 * bistPortfolio/backtest — kuralı GEÇMİŞE SAR: "≥75 LONG" model portföyünün
 * tarihsel getiri/drawdown/kazanma oranını + BIST100'e karşı alfayı ölçer.
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

const bistBacktest = require('../bistSignals/bistBacktest');
const liveDataService = require('../liveDataService');
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

// buildSymbolSignals çıktısını (index/entry/stop/target/band) motor adayına çevir.
function toCandidate(sig, symbol, candles) {
  const score = Number(String(sig.band || '').replace('b', '')) || null;
  return {
    symbol, name: symbol, direction: 'long',
    entry: sig.entry, stop: sig.stop, target1: sig.target, target2: null,
    rr1: null, rr2: null, avgVoteScore: score, confidence: score, precision: 2,
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
    // 3) Gün sonu equity işaretle (D kapanışıyla)
    const pf = store.getPortfolio();
    const openVal = store.listOpen().reduce((s, p) => s + ((p.lastPrice || p.entryPrice) * p.shares), 0);
    equityHistory.push({ date: D, equity: +(pf.cash + openVal).toFixed(2) });
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
  return {
    capital, finalEquity: finalEq, totalReturnPct, days: sim.days,
    closedTrades: (sim.trades || []).length,
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
        const signals = await bistBacktest.buildSymbolSignals(symbol, candles);
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

module.exports = { run, replay, report, toCandidate, toCandles };
