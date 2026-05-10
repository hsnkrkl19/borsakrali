/**
 * MTF Backtest Service — Borsa Krali
 *
 * TF-generic geriye dönük simulasyon — Binance klines endTime/startTime
 * parametreleriyle "geçmişe-bakış sızıntısı" olmadan sinyalleri test eder.
 * Sonuçları mtfCalibrationService'e besler → Beta posterior günceller.
 *
 * Public API:
 *   - backtestTFAsOf(tf, asOfDate, horizon, opts)  — tek tarih × tek TF
 *   - calibrateFromHistory(opts)                   — çoklu tarih × çoklu TF + calibration update
 *   - aggregateStats(signals)                      — top10/total stat hesabı
 *
 * Default horizons (mum sayısı — TF'e göre):
 *   1m=60 (1sa), 5m=60 (5sa), 15m=60 (15sa), 1h=24 (1g), 4h=30 (5g), 1d=7 (1h), 1w=4 (1ay)
 */

const axios = require('axios');
const cryptoSignalsService = require('./cryptoSignalsService');
const mtfScorer = require('./mtfScorer');
const patterns = require('./mtfPatternDetection');
const calibration = require('./mtfCalibrationService');
const logger = require('../utils/logger');

const BINANCE_BASE = 'https://api.binance.com';

const HIGHER_TF_MAP = {
  '1m':  '5m',
  '5m':  '15m',
  '15m': '1h',
  '1h':  '4h',
  '4h':  '1d',
  '1d':  '1w',
  '1w':  '1M',
};

const TF_TIER = {
  '1m':  10,
  '5m':  10,
  '15m': 10,
  '1h':  20,
  '4h':  20,
  '1d':  30,
  '1w':  30,
};

const TF_DEFAULT_HORIZON = {
  '1m':  60,    // 60 dk
  '5m':  60,    // 5 sa
  '15m': 60,    // 15 sa
  '1h':  24,    // 1 g
  '4h':  30,    // 5 g
  '1d':  7,     // 1 hafta
  '1w':  4,     // 1 ay
};

const BATCH_SIZE = 5;
const BATCH_PAUSE_MS = 250;

// ───────────────────────────────────────────────────────────────────────────
// Klines fetcher'ları (cache YOK — backtest taze veri ister)
// ───────────────────────────────────────────────────────────────────────────

async function fetchKlinesHistorical(symbol, interval, endTimeMs, limit = 250) {
  try {
    const res = await axios.get(`${BINANCE_BASE}/api/v3/klines`, {
      params: { symbol: `${symbol}USDT`, interval, limit, endTime: endTimeMs },
      timeout: 15000,
    });
    return (res.data || []).map(k => ({
      time: Math.floor(k[0] / 1000),
      open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    }));
  } catch (e) {
    return null;
  }
}

async function fetchForwardKlines(symbol, interval, startTimeMs, limit) {
  try {
    const res = await axios.get(`${BINANCE_BASE}/api/v3/klines`, {
      params: { symbol: `${symbol}USDT`, interval, limit, startTime: startTimeMs },
      timeout: 15000,
    });
    return (res.data || []).map(k => ({
      time: Math.floor(k[0] / 1000),
      open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    }));
  } catch (e) {
    return [];
  }
}

// ───────────────────────────────────────────────────────────────────────────
// İndikatörler (light kopya — backtest izole olsun diye)
// ───────────────────────────────────────────────────────────────────────────

function ema(values, period) {
  if (!values || values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values, period = 14) {
  if (!values || values.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2);
}

function rsiSeries(values, period = 14) {
  if (!values || values.length < period + 2) return [];
  const out = [];
  for (let i = period + 1; i <= values.length; i++) {
    const r = rsi(values.slice(0, i), period);
    if (r != null) out.push(r);
  }
  return out;
}

function rsiRecentMax(values, lookback = 10, period = 14) {
  const series = rsiSeries(values, period);
  if (series.length === 0) return null;
  return +Math.max(...series.slice(-lookback)).toFixed(2);
}

function macdHist(values, fast = 12, slow = 26, signal = 9) {
  if (!values || values.length < slow + signal) return { hist: null, prev: null, series: [] };
  const k_fast = 2 / (fast + 1), k_slow = 2 / (slow + 1), k_sig = 2 / (signal + 1);
  let emaFast = values.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  let emaSlow = values.slice(0, slow).reduce((a, b) => a + b, 0) / slow;
  for (let i = fast; i < slow; i++) emaFast = values[i] * k_fast + emaFast * (1 - k_fast);
  const macdSeries = [];
  for (let i = slow; i < values.length; i++) {
    emaFast = values[i] * k_fast + emaFast * (1 - k_fast);
    emaSlow = values[i] * k_slow + emaSlow * (1 - k_slow);
    macdSeries.push(emaFast - emaSlow);
  }
  if (macdSeries.length < signal) return { hist: null, prev: null, series: [] };
  let sig = macdSeries.slice(0, signal).reduce((a, b) => a + b, 0) / signal;
  const hists = [];
  for (let i = signal; i < macdSeries.length; i++) {
    sig = macdSeries[i] * k_sig + sig * (1 - k_sig);
    hists.push(macdSeries[i] - sig);
  }
  return {
    hist: hists.length ? +hists[hists.length - 1].toFixed(4) : null,
    prev: hists.length >= 2 ? +hists[hists.length - 2].toFixed(4) : null,
    series: hists,
  };
}

function atr(candles, period = 14) {
  if (!candles || candles.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function sma(values, period) {
  if (!values || values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ───────────────────────────────────────────────────────────────────────────
// Context oluştur — asOfDate cutoff'lu
// ───────────────────────────────────────────────────────────────────────────

function buildContext(coin, tf, currentCandles, higherCandles) {
  if (!currentCandles || currentCandles.length < 60) return null;
  if (!higherCandles || higherCandles.length < 30) return null;

  const curCloses    = currentCandles.map(c => c.close);
  const curVolumes   = currentCandles.map(c => c.volume);
  const higherCloses = higherCandles.map(c => c.close);
  const last = currentCandles[currentCandles.length - 1];

  const curMacd  = macdHist(curCloses);
  const hMacd    = macdHist(higherCloses);

  const candlePatterns = patterns.detectAllPatterns(currentCandles);
  const rsiArr = rsiSeries(curCloses, 14);
  const divergence = patterns.detectDivergence(curCloses.slice(-rsiArr.length), rsiArr, 30);
  const volatility = patterns.detectVolatilityRegime(currentCandles);
  const momentum = patterns.detectMomentumAcceleration(curMacd.series);

  return {
    _currentTF: tf,
    _higherTF: HIGHER_TF_MAP[tf],
    symbol: coin.symbol,
    name: coin.name,
    lastClose: last.close,
    atr: atr(currentCandles),
    current: {
      ema20: ema(curCloses, 20),
      ema50: ema(curCloses, 50),
      ema200: curCloses.length >= 200 ? ema(curCloses, 200) : null,
      rsi: rsi(curCloses, 14),
      rsiRecentMax: rsiRecentMax(curCloses, 10, 14),
      macdHist: curMacd.hist,
      macdHistPrev: curMacd.prev,
      volumeAvg20: sma(curVolumes, 20),
      lastVolume: last.volume,
      lastCandle: last,
      recentBars: currentCandles.slice(-6).map(c => ({ ...c })),
    },
    higher: {
      ema20: ema(higherCloses, 20),
      ema50: ema(higherCloses, 50),
      ema200: higherCloses.length >= 200 ? ema(higherCloses, 200) : null,
      rsi: rsi(higherCloses, 14),
      macdHist: hMacd.hist,
    },
    patterns: candlePatterns,
    divergence,
    volatility,
    momentum,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Forward evaluation — target1/stop hit kontrolü
// ───────────────────────────────────────────────────────────────────────────

function evaluateForward(signal, futureCandles) {
  if (!signal?.entry || !signal?.stop || !signal?.target1) {
    return { outcome: 'no_levels', returnPct: 0, bars: 0 };
  }
  if (!futureCandles || futureCandles.length === 0) {
    return { outcome: 'no_future_data', returnPct: 0, bars: 0 };
  }
  const isLong = signal.direction === 'long';
  const fill = signal.entry;

  for (let i = 0; i < futureCandles.length; i++) {
    const c = futureCandles[i];
    const stopHit   = isLong ? c.low  <= signal.stop    : c.high >= signal.stop;
    const targetHit = isLong ? c.high >= signal.target1 : c.low  <= signal.target1;

    if (stopHit && targetHit) {
      // Tutucu: stop önce
      const ret = isLong ? (signal.stop - fill) / fill : (fill - signal.stop) / fill;
      return { outcome: 'hit_stop', returnPct: +(ret * 100).toFixed(2), bars: i + 1 };
    }
    if (stopHit) {
      const ret = isLong ? (signal.stop - fill) / fill : (fill - signal.stop) / fill;
      return { outcome: 'hit_stop', returnPct: +(ret * 100).toFixed(2), bars: i + 1 };
    }
    if (targetHit) {
      const ret = isLong ? (signal.target1 - fill) / fill : (fill - signal.target1) / fill;
      return { outcome: 'hit_target', returnPct: +(ret * 100).toFixed(2), bars: i + 1 };
    }
  }

  // Horizon sonuna kadar açık
  const lastF = futureCandles[futureCandles.length - 1];
  const exit = lastF?.close;
  const ret = exit ? (isLong ? (exit - fill) / fill : (fill - exit) / fill) : 0;
  return { outcome: 'still_running', returnPct: +(ret * 100).toFixed(2), bars: futureCandles.length };
}

// ───────────────────────────────────────────────────────────────────────────
// Tek TF × tek asOf backtest
// ───────────────────────────────────────────────────────────────────────────

async function backtestTFAsOf(tf, asOfDate, horizonCount) {
  if (!HIGHER_TF_MAP[tf]) throw new Error(`Desteklenmeyen TF: ${tf}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate || '')) throw new Error('asOfDate YYYY-MM-DD olmalı');

  const horizon = horizonCount || TF_DEFAULT_HORIZON[tf] || 24;
  const cutoffMs = new Date(asOfDate + 'T23:59:59Z').getTime();
  const futureStartMs = cutoffMs + 1;
  const higherTF = HIGHER_TF_MAP[tf];

  const tierLimit = TF_TIER[tf] || 30;
  const tradable = await cryptoSignalsService.getTopNTradable(tierLimit);
  if (!tradable.length) return { tf, asOfDate, error: 'Universe boş', longResults: [], shortResults: [] };

  const longResults = [], shortResults = [];

  for (let i = 0; i < tradable.length; i += BATCH_SIZE) {
    const batch = tradable.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async coin => {
      const [cur, higher, future] = await Promise.allSettled([
        fetchKlinesHistorical(coin.symbol, tf, cutoffMs, 250),
        fetchKlinesHistorical(coin.symbol, higherTF, cutoffMs, 250),
        fetchForwardKlines(coin.symbol, tf, futureStartMs, horizon),
      ]);
      const curC    = cur.status === 'fulfilled' ? cur.value : null;
      const higherC = higher.status === 'fulfilled' ? higher.value : null;
      const futureC = future.status === 'fulfilled' ? future.value : [];
      const ctx = buildContext(coin, tf, curC, higherC);
      if (!ctx) return null;
      const out = mtfScorer.scoreSingleTimeframe(ctx);
      return { coin, ctx, out, futureC };
    }));

    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const { coin, out, futureC } = r.value;
      const base = { symbol: coin.symbol, name: coin.name };
      if (out.long) {
        const ev = evaluateForward(out.long, futureC);
        longResults.push({ ...out.long, ...base, ...ev });
      }
      if (out.short) {
        const ev = evaluateForward(out.short, futureC);
        shortResults.push({ ...out.short, ...base, ...ev });
      }
    }
    if (i + BATCH_SIZE < tradable.length) {
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  return {
    tf,
    asOfDate,
    horizon,
    higherTF,
    tierLimit,
    analyzedCount: tradable.length,
    longResults,
    shortResults,
    stats: {
      long: aggregateStats(longResults),
      short: aggregateStats(shortResults),
    },
  };
}

function aggregateStats(signals) {
  const total = signals.length;
  if (total === 0) return { total: 0, hitTarget: 0, hitStop: 0, stillRunning: 0, noFuture: 0, winRate: 0, avgReturn: 0 };
  const hitTarget    = signals.filter(s => s.outcome === 'hit_target').length;
  const hitStop      = signals.filter(s => s.outcome === 'hit_stop').length;
  const stillRunning = signals.filter(s => s.outcome === 'still_running').length;
  const noFuture     = signals.filter(s => s.outcome === 'no_future_data').length;
  const closed = hitTarget + hitStop;
  const winRate  = closed > 0 ? +(hitTarget / closed * 100).toFixed(1) : 0;
  const avgRet   = +(signals.reduce((s, x) => s + (x.returnPct || 0), 0) / total).toFixed(2);
  return { total, hitTarget, hitStop, stillRunning, noFuture, winRate, avgReturn: avgRet };
}

// ───────────────────────────────────────────────────────────────────────────
// Calibration loop — backtest sonuçlarını Bayesian update'e besler
// ───────────────────────────────────────────────────────────────────────────

/**
 * opts:
 *   tfs:        ['1h','4h','1d'] (default)
 *   daysBack:   7 (default — son 7 gün her gün için backtest)
 *   stepDays:   1 (default — günlük adım)
 *   save:       true (default — calibration'ı diske yaz)
 */
async function calibrateFromHistory(opts = {}) {
  const tfs = opts.tfs || ['1h', '4h', '1d'];
  const daysBack = opts.daysBack || 7;
  const stepDays = opts.stepDays || 1;
  const doSave = opts.save !== false;

  const today = new Date();
  // En son kapanmış gün başlangıç: today - 1 gün
  const startDay = new Date(today.getTime() - 24 * 3600 * 1000);

  const asOfDates = [];
  for (let i = 0; i < daysBack; i += stepDays) {
    const d = new Date(startDay.getTime() - i * 24 * 3600 * 1000);
    asOfDates.push(d.toISOString().slice(0, 10));
  }

  const totalSteps = tfs.length * asOfDates.length;
  logger.info(`[MTFCalib] Başlatıldı — TFs: ${tfs.join(',')}, days: ${asOfDates.length}, total backtests: ${totalSteps}`);

  // Socket.IO progress publisher (lazy require — circular import yok)
  let socket = null;
  try { socket = require('./socketService'); } catch (_) {}

  const startedAt = Date.now();
  const emit = (payload) => {
    if (!socket?.broadcastSignal) return;
    try {
      socket.broadcastSignal({
        strategy: 'mtf_calibration_progress',
        ...payload,
        elapsedMs: Date.now() - startedAt,
        stockSymbol: 'MTF_CALIB',
      });
    } catch (_) {}
  };

  emit({ phase: 'started', totalSteps, completedSteps: 0, tfs, asOfDates });

  const summary = [];
  let stepIndex = 0;
  for (const tf of tfs) {
    for (const asOf of asOfDates) {
      stepIndex += 1;
      emit({ phase: 'running', currentTF: tf, currentDate: asOf, completedSteps: stepIndex - 1, totalSteps });
      try {
        const result = await backtestTFAsOf(tf, asOf, TF_DEFAULT_HORIZON[tf]);
        const allSignals = [...result.longResults, ...result.shortResults].map(s => ({
          score: s.totalScore,
          applicableMax: s.applicableMax,
          direction: s.direction,
          outcome: s.outcome,
        }));
        const upd = calibration.updateFromBacktest(tf, allSignals);
        const stepRow = {
          tf, asOfDate: asOf,
          longCount: result.longResults.length,
          shortCount: result.shortResults.length,
          longWinRate:  result.stats.long.winRate,
          shortWinRate: result.stats.short.winRate,
          updated: upd.updated,
          skipped: upd.skipped,
        };
        summary.push(stepRow);
        emit({ phase: 'step_done', completedSteps: stepIndex, totalSteps, step: stepRow });
        logger.info(`[MTFCalib] ${tf}@${asOf}: long ${result.stats.long.winRate}% (${result.stats.long.total}) · short ${result.stats.short.winRate}% (${result.stats.short.total}) · updated ${upd.updated}`);
      } catch (e) {
        logger.error(`[MTFCalib] ${tf}@${asOf} hata: ${e.message}`);
        const stepRow = { tf, asOfDate: asOf, error: e.message };
        summary.push(stepRow);
        emit({ phase: 'step_error', completedSteps: stepIndex, totalSteps, step: stepRow });
      }
    }
  }

  if (doSave) {
    const ok = calibration.save();
    logger.info(`[MTFCalib] Calibration tablosu diske ${ok ? 'yazıldı' : 'YAZILAMADI'}`);
  }

  emit({ phase: 'completed', completedSteps: totalSteps, totalSteps, summary });

  return {
    completedAt: new Date().toISOString(),
    tfs, asOfDates,
    summary,
    snapshot: calibration.getSnapshot(),
  };
}

module.exports = {
  backtestTFAsOf,
  calibrateFromHistory,
  aggregateStats,
  evaluateForward,
  TF_DEFAULT_HORIZON,
  TF_TIER,
  HIGHER_TF_MAP,
};
