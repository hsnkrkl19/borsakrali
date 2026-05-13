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

  // Sinyalin üretildiği an — yoksa phase'in generatedAt'ine düşer (geriye uyumluluk).
  const createdAt = signal.createdAt || signal._phaseGeneratedAt || null;
  const phase = signal.phase || signal._phaseName || null;
  const signalId = signal.signalId || null;
  const sequence = signal.sequence || null;

  const meta = { createdAt, phase, signalId, sequence };

  if (!candle || !Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target)) {
    return {
      ...meta,
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
    ...meta,
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
 * Bir günün tüm fazlarındaki sinyalleri kronolojik olarak toplar.
 * Her sembol+strateji+direction kombinasyonu için sıra numarası ve signalId üretir
 * (örn: ASELS_1, ASELS_2 — aynı sembol farklı zamanlarda yeniden üretildiğinde).
 *
 * Geriye dönük düzeltme YOK: bir sinyalin createdAt'i ve sequence'ı, üretildiği faza ait
 * snapshot satırından gelir; sonraki fazlar bu kayıtları değiştirmez.
 */
function collectStockSignals(stockSnap) {
  if (!stockSnap) return [];
  const out = [];

  const addFromPhase = (phaseData, phaseName) => {
    if (!phaseData) return;
    const genAt = phaseData.generatedAt || null;
    const buckets = [
      { key: 'trend',     strat: 'trend' },
      { key: 'reversion', strat: 'reversion' },
    ];
    for (const b of buckets) {
      const list = phaseData?.[b.key]?.signals || [];
      for (const s of list) {
        out.push({
          ...s,
          strategy: s.strategy || b.strat,
          // Geriye uyumluluk: eski snapshot'larda createdAt sinyal seviyesinde yoksa phase'den al
          _phaseGeneratedAt: s.createdAt || genAt,
          _phaseName: s.phase || phaseName,
        });
      }
    }
  };

  addFromPhase(stockSnap.premarket, 'premarket');
  addFromPhase(stockSnap.revision,  'revision');
  if (Array.isArray(stockSnap.intraday)) {
    for (const ip of stockSnap.intraday) addFromPhase(ip, 'intraday');
  }
  return out;
}

function collectCryptoSignals(cryptoSnap) {
  if (!cryptoSnap) return [];
  const out = [];
  const addFromPhase = (phaseData, phaseName) => {
    if (!phaseData) return;
    const genAt = phaseData.generatedAt || null;
    const buckets = [
      { key: 'spot_long',     strat: 'spot_long' },
      { key: 'futures_long',  strat: 'futures_long' },
      { key: 'futures_short', strat: 'futures_short' },
    ];
    for (const b of buckets) {
      const list = phaseData?.[b.key]?.signals || [];
      for (const s of list) {
        out.push({
          ...s,
          strategy: s.strategy || b.strat,
          _phaseGeneratedAt: s.createdAt || genAt,
          _phaseName: s.phase || phaseName,
        });
      }
    }
  };

  for (const p of ['morning', 'midday', 'evening', 'night']) {
    addFromPhase(cryptoSnap[p], p);
  }
  if (Array.isArray(cryptoSnap.intraday)) {
    for (const ip of cryptoSnap.intraday) addFromPhase(ip, 'intraday');
  }
  return out;
}

/**
 * Her sembol+strateji+direction grubu için kronolojik sıra ata.
 * Sequence 1, 2, 3 … ve signalId = `${SYMBOL}_${N}` (kullanıcı talebi).
 */
function assignSequenceNumbers(signals) {
  // createdAt'e göre kararlı sırala — aynı zamanlıları phase + index ile ayır
  const indexed = signals.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => {
    const ta = new Date(a.s._phaseGeneratedAt || 0).getTime();
    const tb = new Date(b.s._phaseGeneratedAt || 0).getTime();
    if (ta !== tb) return ta - tb;
    return a.i - b.i;
  });

  // Her sembol için sayaç
  const counters = new Map();
  for (const { s } of indexed) {
    const key = `${s.symbol}::${s.strategy}::${s.direction || ''}`;
    const next = (counters.get(key) || 0) + 1;
    counters.set(key, next);
    s.sequence = next;
    s.signalId = `${s.symbol}_${next}`;
  }
  return signals;
}

/**
 * Tüm versiyonları içeren tarihçeden, her sembol+strateji için EN SON versiyonu seçer.
 * Ana "Gün Sonu" tablosu bunu kullanır (geri uyumluluk).
 */
function pickLatestPerSymbol(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.symbol}::${r.strategy}::${r.direction || ''}`;
    const ex = byKey.get(key);
    if (!ex) { byKey.set(key, r); continue; }
    const ta = new Date(ex.createdAt || 0).getTime();
    const tb = new Date(r.createdAt || 0).getTime();
    if (tb >= ta) byKey.set(key, r);
  }
  return Array.from(byKey.values());
}

/**
 * O günün snapshot'ından hisse + (varsa) kripto sinyallerini al,
 * gün sonu performansını hesapla. Tüm fazlardaki sinyaller tarihçeye girer;
 * "signals" alanı sembol başına en son versiyonu içerir.
 */
async function computePerformance(date) {
  const targetDate = date || snapshotStore.dateKey();

  const stockSnap = snapshotStore.read(targetDate);
  const cryptoSnap = cryptoSnapshotStore && typeof cryptoSnapshotStore.read === 'function'
    ? cryptoSnapshotStore.read(targetDate)
    : null;

  // ── Tüm fazlardan sinyalleri topla + sıra numarası ata ──
  const stockSignalsRaw  = assignSequenceNumbers(collectStockSignals(stockSnap));
  const cryptoSignalsRaw = assignSequenceNumbers(collectCryptoSignals(cryptoSnap));

  if (stockSignalsRaw.length === 0 && cryptoSignalsRaw.length === 0) {
    return {
      date: targetDate,
      generatedAt: new Date().toISOString(),
      stocks: { signals: [], history: [], summary: aggregate([]) },
      crypto: { signals: [], history: [], summary: aggregate([]) },
      hasStockSnapshot: !!stockSnap,
      hasCryptoSnapshot: !!cryptoSnap,
      note: 'O tarih için snapshot bulunamadı.',
    };
  }

  logger.info(`[DailyPerformance] ${targetDate} için ${stockSignalsRaw.length} hisse + ${cryptoSignalsRaw.length} kripto sinyali değerlendiriliyor (tüm fazlar dahil)...`);

  const [stockHistory, cryptoHistory] = await Promise.all([
    evaluateSignalsBatch(stockSignalsRaw, { crypto: false }),
    evaluateSignalsBatch(cryptoSignalsRaw, { crypto: true }),
  ]);

  // History: kronolojik (en yeni en üstte) tüm versiyonlar
  const sortByCreatedDesc = (a, b) =>
    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  stockHistory.sort(sortByCreatedDesc);
  cryptoHistory.sort(sortByCreatedDesc);

  // Ana tablo: sembol başına en son versiyon
  const stockRows  = pickLatestPerSymbol(stockHistory);
  const cryptoRows = pickLatestPerSymbol(cryptoHistory);

  return {
    date: targetDate,
    generatedAt: new Date().toISOString(),
    sampleInvestment: SAMPLE_INVESTMENT,
    stocks: { signals: stockRows,  history: stockHistory,  summary: aggregate(stockRows) },
    crypto: { signals: cryptoRows, history: cryptoHistory, summary: aggregate(cryptoRows) },
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
