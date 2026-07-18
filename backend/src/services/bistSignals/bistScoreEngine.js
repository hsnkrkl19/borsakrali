/**
 * bistScoreEngine — TÜM BIST hisselerini (510) tüm analiz teknikleriyle 0-100
 * GÜVEN notuna indirger; SADECE LONG (spot al) + güven ≥ eşik (vars. 75) sinyali
 * döndürür. Bu, Forex motorunun (forexEngineMTF.evalTF) tek-TF (günlük) BIST
 * uyarlamasıdır — strateji modülleri jenerik mum aldığı için yeniden port yok.
 *
 * 5 teknik (forex ile aynı set): Genel Tarama (17 strateji) + EMA34 Wave +
 * TEMA34 + Malaysian SNR + SMC. Birleştirme: forexAggregator (ağırlıklı oy →
 * 0-100). Seviyeler: forexLevels (1d ATR çarpanları). Veri: Yahoo günlük
 * (liveDataService.fetchHistoricalData) — boşsa İş Yatırım fallback.
 */

const liveDataService = require('../liveDataService');
const { allBistStocks } = require('../../data/allBistStocks');
const genel = require('../forex/strategies/genelTarama');
const ema34 = require('../forex/strategies/ema34');
const tema34 = require('../forex/strategies/tema34');
const snrStrat = require('../forex/strategies/snr');
const smcStrat = require('../forex/strategies/smc');
const { aggregate, computeConfidence, calibrateConfidence, gradeFor, bandFor } = require('../forex/forexAggregator');
const levelsLib = require('../forex/forexLevels');
const { atr } = require('../forex/indicators');
const logger = require('../../utils/logger');

function envNum(name, def) { const v = Number(process.env[name]); return Number.isFinite(v) ? v : def; }
const MIN_CONFIDENCE = envNum('BIST_SIGNAL_MIN_CONFIDENCE', 75); // ≥75 = MUKEMMEL
// Aktif kalibrasyon: backtesting.py global ince-kova geçmişi → güveni SINIRLI
// delta'yla düzelt ve EŞİK kararında uygula. Kill-switch: BIST_CALIBRATION_ACTIVE=0.
const CALIBRATION_ACTIVE = process.env.BIST_CALIBRATION_ACTIVE !== '0';
// Döngüsel require yok: bistBacktest artık bistScoreEngine'i import ETMİYOR.
const bistBacktest = require('./bistBacktest');
const TOP_N = envNum('BIST_SIGNAL_TOP_N', 10);
const PRECISION = 2;                       // BIST fiyatları 2 ondalık
const BATCH_SIZE = 8;                       // dailySignalsService deseni
const BATCH_PAUSE_MS = 200;
const SCAN_CACHE_MS = 15 * 60 * 1000;       // günlük mum gün-içi az değişir
const MIN_CANDLES = 100;                    // tema34 100 mum ister

let _cache = null;       // { generatedAt, scanned, qualified, minConfidence, all, top }
let _scanning = null;    // eşzamanlı tarama kilidi

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Yahoo historical satırlarını forex mum formatına çevir.
function toCandles(hist) {
  return (hist || [])
    .filter(r => r && r.close != null && r.high != null && r.low != null && r.open != null)
    .map(r => ({
      time: Math.floor((r.timestamp || new Date(r.date).getTime()) / 1000),
      open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume || 0,
    }));
}

// Tek hisse: 5 tekniği çalıştır → LONG + ≥eşik ise sinyal nesnesi, değilse null.
// opts.minConfidence: güven eşiğini geçici geçersiz kıl (vars. MIN_CONFIDENCE=75).
//   BIST AL tarayıcısı gibi avgScore-tabanlı süzenler için 0 geçebilir → tüm long
//   adaylar (avgVoteScore ile) döner; ≥75 ana sistem bu param'ı GEÇMEZ, değişmez.
async function scoreSymbol(stock, opts = {}) {
  const minConf = Number.isFinite(opts.minConfidence) ? opts.minConfidence : MIN_CONFIDENCE;
  const symbol = (stock.symbol || stock).replace('.IS', '');
  try {
    const hist = await liveDataService.fetchHistoricalData(symbol, '1y', '1d');
    const candles = toCandles(hist);
    if (candles.length < MIN_CANDLES) return null;

    const [snrRes, smcRes] = await Promise.all([
      snrStrat.evaluate(candles, symbol, '1d', 'stock'),
      smcStrat.evaluate(candles, symbol, '1d', 'stock'),
    ]);
    const gen = genel.evaluate(candles);
    const e34 = ema34.evaluate(candles);
    const t34 = tema34.evaluate(candles);

    const agg = aggregate([gen, e34, t34, snrRes, smcRes], gen && gen.ind);
    if (agg.direction !== 'long') return null;          // sadece spot-alım (long)

    const atrVal = atr(candles, 14);
    const entry = candles[candles.length - 1].close;
    const levels = levelsLib.buildLevels('long', entry, atrVal, '1d', PRECISION);
    if (!levels) return null;

    const rawConfidence = computeConfidence({
      consensus: agg.consensus, avgScore: agg.avgScore,
      trendStrength: agg.trendStrength, momentum: agg.momentum,
      rr1: levels.rr1, confluence: 0,
    });
    // AKTİF KALİBRASYON: global backtesting.py geçmişiyle güveni düzelt → EŞİK
    // bunun üzerinden. İnce kovalar ayrımcı: kötü kova bazılarını eler, iyi kova
    // alt-eşik sinyali terfi eder (tek-tip çöküş yok). Veri yoksa NO-OP (=ham).
    const calHistory = CALIBRATION_ACTIVE ? bistBacktest.getHistory(rawConfidence) : null;
    const cal = calibrateConfidence(rawConfidence, calHistory);
    const confidence = CALIBRATION_ACTIVE ? cal.confidence : rawConfidence;
    if (confidence < minConf) return null;

    const conditions = [];
    for (const m of agg.modules) {
      for (const c of (m.conditions || [])) if (c.met) conditions.push({ ...c, technique: m.technique });
    }

    const __sqSig = {
      symbol, name: stock.name || symbol, direction: 'long',
      confidence, rawConfidence: cal.rawConfidence,
      calibration: cal.delta !== 0 ? { empirical: cal.empirical, trust: cal.trust, delta: cal.delta, winRate: calHistory?.winRate ?? null, profitFactor: calHistory?.profitFactor ?? null } : null,
      grade: gradeFor(confidence), confidenceBand: bandFor(confidence),
      consensus: +agg.consensus.toFixed(2), avgVoteScore: Math.round(agg.avgScore),
      precision: PRECISION,
      ...levels,                          // entry, stop, target1, target2, rr1, rr2, atr
      horizon: levelsLib.tradeHorizon('1d'),
      votes: agg.votes, conditions,
      indicators: (gen && gen.ind) || null,
    };
    // signalQuality — fail-safe shadow gözlem (yayın kararını DEĞİŞTİRMEZ)
    try {
      require('../signalQuality/bridge').observe({ engine: 'bistScoreEngine', strategy: 'trend', direction: 'long', rawScore: confidence, rawScoreScale: { min: 0, max: 100 }, candles: (typeof candles !== 'undefined' ? candles : null), levels: { entry: __sqSig.entry, stop: __sqSig.stop, target: __sqSig.target1 }, assetClass: 'bist_equity', symbol });
    } catch (_) {}
    return __sqSig;
  } catch (e) {
    return null;
  }
}

// Tüm evreni batch'lerle tara. force=true cache'i atlar. Eşzamanlı çağrı tek tur.
async function scan(opts = {}) {
  const { force = false, universe, minConfidence } = opts;
  // Override mod (ör. BIST AL tarayıcısı minConfidence:0): paylaşılan _cache/_scanning'e
  // DOKUNMA — ≥75 ana sistemin cache'ini kirletmesin. Her zaman taze döner.
  const override = Number.isFinite(minConfidence) && minConfidence !== MIN_CONFIDENCE;
  if (!override && !force && _cache && Date.now() - new Date(_cache.generatedAt).getTime() < SCAN_CACHE_MS) {
    return _cache;
  }
  if (!override && _scanning) return _scanning;   // süren tarama varsa onu bekle (mükerrer Yahoo yükü yok)

  const runner = (async () => {
    const stocks = universe || allBistStocks;
    const all = [];
    for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
      const batch = stocks.slice(i, i + BATCH_SIZE);
      const res = await Promise.all(batch.map(s => scoreSymbol(s, override ? { minConfidence } : undefined)));
      for (const r of res) if (r) all.push(r);
      if (i + BATCH_SIZE < stocks.length) await sleep(BATCH_PAUSE_MS);
    }
    all.sort((a, b) => b.confidence - a.confidence);
    const snap = {
      generatedAt: new Date().toISOString(),
      scanned: stocks.length,
      minConfidence: override ? minConfidence : MIN_CONFIDENCE,
      qualified: all.length,
      all,
      top: all.slice(0, TOP_N),
    };
    if (!override) _cache = snap;
    return snap;
  })();

  if (override) return await runner;    // izole: _scanning kilidine dokunma
  _scanning = runner;
  try { return await _scanning; }
  finally { _scanning = null; }
}

function getLatest() { return _cache; }

// test için durumu sıfırla
function __resetForTest() { _cache = null; _scanning = null; }

module.exports = {
  scan, scoreSymbol, getLatest, toCandles, __resetForTest,
  MIN_CONFIDENCE, TOP_N, PRECISION,
};
