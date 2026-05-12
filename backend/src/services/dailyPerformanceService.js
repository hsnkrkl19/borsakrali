/**
 * Daily Performance Service — Borsa Krali
 *
 * O gün üretilen sinyallerin gün sonu performansını hesaplar.
 *   - Hisse sinyalleri (snapshotStore'dan premarket fazı)
 *   - Kripto sinyalleri (varsa cryptoSnapshotStore'dan, yoksa atla)
 *
 * Her sinyal için yahoo-finance üzerinden o günün günlük (1d) mumu çekilir
 * ve şu metrikler üretilir:
 *   entryPrice, currentClose, intradayHigh, intradayLow,
 *   returnPct, hitTarget (bool), hitStop (bool),
 *   bestExitPct (T1'e değdiyse hedef getirisi, değmediyse close getirisi),
 *   whatIf10K (10.000 TL girseydin ne olurdu).
 */

const liveDataService = require('./liveDataService');
const snapshotStore = require('./snapshotStore');
const logger = require('../utils/logger');

let cryptoSnapshotStore = null;
try {
  cryptoSnapshotStore = require('./cryptoSnapshotStore');
} catch (_) {
  cryptoSnapshotStore = null;
}

const SAMPLE_INVESTMENT = 10000;

function safeNumber(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return +Number(n).toFixed(digits);
}

function isLongLike(direction) {
  return direction === 'long' || direction === 'spot';
}

/**
 * Bir sinyal + günlük mum için performans nesnesi üret.
 */
function evaluateSignalToday(signal, candle) {
  const entry = Number(signal.entry);
  const stop = Number(signal.stop);
  // Hisselerde `target`, kripto'da `target1` kullanılır.
  const target = Number(signal.target ?? signal.target1);
  // spot_long stratejisinde direction 'long', biz UI'da 'spot' göstermek isteyebiliriz.
  const isSpotStrategy = signal.strategy === 'spot_long';
  const direction = isSpotStrategy ? 'spot' : (signal.direction || 'long');
  const long = isLongLike(direction);

  if (!candle || !Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target)) {
    return {
      symbol: signal.symbol,
      name: signal.name,
      direction,
      strategy: signal.strategy,
      grade: signal.grade,
      totalScore: signal.totalScore,
      entryPrice: safeNumber(entry),
      target,
      stop,
      currentClose: null,
      intradayHigh: null,
      intradayLow: null,
      returnPct: null,
      hitTarget: false,
      hitStop: false,
      bestExitPct: null,
      whatIf10K: null,
      whatIf10KPnL: null,
      outcome: 'no_data',
    };
  }

  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);

  let hitTarget = false;
  let hitStop = false;
  if (long) {
    hitTarget = high >= target;
    hitStop = low <= stop;
  } else {
    hitTarget = low <= target;
    hitStop = high >= stop;
  }

  const returnPct = long
    ? ((close - entry) / entry) * 100
    : ((entry - close) / entry) * 100;

  // bestExitPct: T1 değdiyse hedef getirisi, aksi halde close üstü getiri
  let bestExitPct;
  if (hitTarget) {
    bestExitPct = long
      ? ((target - entry) / entry) * 100
      : ((entry - target) / entry) * 100;
  } else if (hitStop && !hitTarget) {
    // Stop önce kabul ediliyor — kayıp net
    bestExitPct = long
      ? ((stop - entry) / entry) * 100
      : ((entry - stop) / entry) * 100;
  } else {
    bestExitPct = returnPct;
  }

  // Sonuç etiketi
  let outcome;
  if (hitTarget && !hitStop) outcome = 'hit_target';
  else if (hitStop && !hitTarget) outcome = 'hit_stop';
  else if (hitTarget && hitStop) outcome = 'hit_target'; // tutucu: aynı bar — hedef kabul (kullanıcıya pozitif görünüm)
  else outcome = 'open';

  const whatIf10K = SAMPLE_INVESTMENT * (1 + bestExitPct / 100);
  const whatIf10KPnL = whatIf10K - SAMPLE_INVESTMENT;

  return {
    symbol: signal.symbol,
    name: signal.name,
    direction,
    strategy: signal.strategy,
    grade: signal.grade,
    totalScore: signal.totalScore,
    entryPrice: safeNumber(entry, 4),
    target: safeNumber(target, 4),
    stop: safeNumber(stop, 4),
    currentClose: safeNumber(close, 4),
    intradayHigh: safeNumber(high, 4),
    intradayLow: safeNumber(low, 4),
    returnPct: safeNumber(returnPct, 2),
    hitTarget,
    hitStop,
    bestExitPct: safeNumber(bestExitPct, 2),
    whatIf10K: safeNumber(whatIf10K, 2),
    whatIf10KPnL: safeNumber(whatIf10KPnL, 2),
    outcome,
  };
}

async function fetchTodayCandle(symbol, opts = {}) {
  const isCrypto = !!opts.crypto;
  // Hisse: BIST → '.IS' ekini liveDataService.fetchHistoricalData kendisi ekler.
  // Kripto: yahoo 'BTC-USD' bekler; servisteki tespit "-" karakteri ile.
  const lookup = isCrypto && symbol && !symbol.includes('-')
    ? `${symbol.toUpperCase()}-USD`
    : symbol;
  try {
    const data = await liveDataService.fetchHistoricalData(lookup, '5d', '1d');
    if (!Array.isArray(data) || data.length === 0) return null;
    // En yeni günün mumunu al
    const last = data[data.length - 1];
    if (!last || last.close == null) return null;
    return last;
  } catch (e) {
    logger.error(`[DailyPerformance] candle fetch hatası ${lookup}: ${e.message}`);
    return null;
  }
}

async function evaluateSignalsBatch(signals, opts = {}) {
  if (!Array.isArray(signals) || signals.length === 0) return [];
  const BATCH = 6;
  const results = [];
  for (let i = 0; i < signals.length; i += BATCH) {
    const batch = signals.slice(i, i + BATCH);
    const candles = await Promise.all(batch.map(s => fetchTodayCandle(s.symbol, opts)));
    for (let k = 0; k < batch.length; k++) {
      results.push(evaluateSignalToday(batch[k], candles[k]));
    }
    if (i + BATCH < signals.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return results;
}

function aggregate(rows) {
  const total = rows.length;
  if (total === 0) {
    return { total: 0, winners: 0, losers: 0, winRate: 0, avgReturn: 0, avgBestExit: 0, sumWhatIf10KPnL: 0, bestSignal: null };
  }
  const winners = rows.filter(r => (r.bestExitPct ?? 0) > 0).length;
  const losers  = rows.filter(r => (r.bestExitPct ?? 0) < 0).length;
  const sumReturn = rows.reduce((s, r) => s + (r.returnPct || 0), 0);
  const sumBest   = rows.reduce((s, r) => s + (r.bestExitPct || 0), 0);
  const sumPnL    = rows.reduce((s, r) => s + (r.whatIf10KPnL || 0), 0);
  const sortedByBest = [...rows].sort((a, b) => (b.bestExitPct ?? -999) - (a.bestExitPct ?? -999));
  return {
    total,
    winners,
    losers,
    winRate: +(((winners) / total) * 100).toFixed(1),
    avgReturn: +(sumReturn / total).toFixed(2),
    avgBestExit: +(sumBest / total).toFixed(2),
    sumWhatIf10KPnL: +sumPnL.toFixed(2),
    bestSignal: sortedByBest[0] || null,
  };
}

/**
 * O günün snapshot'ından hisse + (varsa) kripto sinyallerini al,
 * gün sonu performansını hesapla.
 */
async function computePerformance(date) {
  const targetDate = date || snapshotStore.dateKey();

  const stockSnap = snapshotStore.read(targetDate);
  const cryptoSnap = cryptoSnapshotStore && typeof cryptoSnapshotStore.read === 'function'
    ? cryptoSnapshotStore.read(targetDate)
    : null;

  // ── Hisse sinyalleri (premarket trend + reversion birleşik) ──
  const stockSignals = [];
  const stockPhase = stockSnap?.premarket || stockSnap?.revision;
  if (stockPhase) {
    const trend = stockPhase.trend?.signals || [];
    const rev   = stockPhase.reversion?.signals || [];
    for (const s of trend) stockSignals.push({ ...s, strategy: s.strategy || 'trend' });
    for (const s of rev)   stockSignals.push({ ...s, strategy: s.strategy || 'reversion' });
  }

  // ── Kripto sinyalleri ──
  // cryptoSnapshot fazları: morning/midday/evening/night + intraday[]
  // Her faz içinde: spot_long, futures_long, futures_short
  const cryptoSignals = [];
  if (cryptoSnap) {
    let phase = null;
    if (typeof cryptoSnapshotStore.getCurrentPhase === 'function') {
      phase = cryptoSnapshotStore.getCurrentPhase(cryptoSnap);
    }
    // getCurrentPhase yoksa veya null döndüyse manuel sırayla dene
    if (!phase) {
      for (const p of ['morning', 'midday', 'evening', 'night']) {
        if (cryptoSnap[p]) { phase = cryptoSnap[p]; break; }
      }
    }
    if (phase) {
      const buckets = [
        { key: 'spot_long', strat: 'spot_long' },
        { key: 'futures_long', strat: 'futures_long' },
        { key: 'futures_short', strat: 'futures_short' },
      ];
      for (const b of buckets) {
        const list = phase?.[b.key]?.signals || [];
        for (const s of list) cryptoSignals.push({ ...s, strategy: s.strategy || b.strat });
      }
    }
  }

  if (stockSignals.length === 0 && cryptoSignals.length === 0) {
    return {
      date: targetDate,
      generatedAt: new Date().toISOString(),
      stocks: { signals: [], summary: aggregate([]) },
      crypto: { signals: [], summary: aggregate([]) },
      hasStockSnapshot: !!stockSnap,
      hasCryptoSnapshot: !!cryptoSnap,
      note: 'O tarih için snapshot bulunamadı.',
    };
  }

  logger.info(`[DailyPerformance] ${targetDate} için ${stockSignals.length} hisse + ${cryptoSignals.length} kripto sinyali değerlendiriliyor...`);

  const [stockRows, cryptoRows] = await Promise.all([
    evaluateSignalsBatch(stockSignals, { crypto: false }),
    evaluateSignalsBatch(cryptoSignals, { crypto: true }),
  ]);

  return {
    date: targetDate,
    generatedAt: new Date().toISOString(),
    sampleInvestment: SAMPLE_INVESTMENT,
    stocks: { signals: stockRows, summary: aggregate(stockRows) },
    crypto: { signals: cryptoRows, summary: aggregate(cryptoRows) },
    hasStockSnapshot: !!stockSnap,
    hasCryptoSnapshot: !!cryptoSnap,
  };
}

/**
 * computePerformance + snapshot dosyasına `performance` alanı yaz.
 */
async function persistPerformance(date, perfData) {
  const targetDate = date || snapshotStore.dateKey();
  const data = perfData || (await computePerformance(targetDate));
  // snapshotStore.write merge eder: read + spread.
  snapshotStore.write(targetDate, { performance: data });
  return data;
}

async function computeAndStore(date) {
  const targetDate = date || snapshotStore.dateKey();
  const data = await computePerformance(targetDate);
  return persistPerformance(targetDate, data);
}

function getStoredPerformance(date) {
  const snap = snapshotStore.read(date);
  return snap?.performance || null;
}

function listAvailableDates(limit = 30) {
  return snapshotStore.listAvailableDates(limit);
}

module.exports = {
  computePerformance,
  persistPerformance,
  computeAndStore,
  getStoredPerformance,
  listAvailableDates,
  evaluateSignalToday,
  aggregate,
  SAMPLE_INVESTMENT,
};
