/**
 * Daily Signals Service v2 — Borsa Krali
 *
 * BIST100'ü tarar. Her hisse için iki strateji ayrı puanlanır:
 *   1) Trend Takip (Combo + EMA + indikatör momentum) — market entry
 *   2) Reversion  (SNR support/resistance + harmonik) — zone entry
 *
 * Her strateji kendi top-10 listesine sahiptir. Snapshot:
 *   { date, premarket: { trend: {...}, reversion: {...} },
 *           revision:  { trend: { ..., diff }, reversion: { ..., diff } } }
 */

const liveDataService = require('./liveDataService');
const snrService = require('./snrService');
const harmonicPatternService = require('./harmonicPatternService');
const comboStrategyService = require('./comboStrategyService');
const kapService = require('./kapService');
const universalScorer = require('./universalScorer');
const snapshotStore = require('./snapshotStore');
const signalConfidenceService = require('./signalConfidenceService');

// ── Yapılandırma ──────────────────────────────────────────────────────────
const TOP_LIMIT = 10;
// v5: Sinyal kalitesi sıkılaştırma — scorer'da alt-zorunlular eklendi,
// min skorlar yükseldi. Sinyal sayısı azalır, kalite artar.
const MIN_SCORE_TREND = 6;     // 10 koşuldan en az 6 (storyline + ema_stack/combo ZORUNLU)
const MIN_SCORE_REVERSION = 7; // reversion: yakın+pivot ZORUNLU + engulfing/sweep ZORUNLU + 7 koşul
const BATCH_SIZE = 8;
const BATCH_PAUSE_MS = 200;

// ── ATR (Average True Range) — backtest ve scorer için ortak ──────────────
function calcATR(candles, period = 14) {
  if (!candles || candles.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// ── ADX hesabı (basit DMI versiyonu, 14-bar) ──────────────────────────────
function calcADX(candles, period = 14) {
  if (!candles || candles.length < period + 1) return 0;
  let plusDM = 0, minusDM = 0, trSum = 0;
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM  += (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM += (downMove > upMove && downMove > 0) ? downMove : 0;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    trSum += tr;
  }
  if (trSum === 0) return 0;
  const plusDI = (plusDM / trSum) * 100;
  const minusDI = (minusDM / trSum) * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1) * 100;
  return +dx.toFixed(1);
}

// ── Tek hisse için tüm veri kaynaklarını topla ────────────────────────────
async function gatherForSymbol(stock, opts = {}) {
  const symbol = (stock.symbol || stock).replace('.IS', '');
  try {
    // 1 yıllık günlük geçmiş — tüm servislerin ortak kaynağı
    const hist = await liveDataService.fetchHistoricalData(symbol, '1y', '1d');
    if (!hist || hist.length < 60) return null;

    // asOfDate verildiyse veriyi kes (backtest için, gelecek sızdırmayı önler)
    let pastHist = hist;
    let futureHist = [];
    if (opts.asOfDate) {
      const cutoff = new Date(opts.asOfDate + 'T23:59:59Z').getTime();
      pastHist = hist.filter(r => new Date(r.date || r.timestamp).getTime() <= cutoff);
      futureHist = hist.filter(r => new Date(r.date || r.timestamp).getTime() > cutoff);
      if (pastHist.length < 60) return null;
    }

    const candles = pastHist.map(r => ({
      time: Math.floor(new Date(r.date || r.timestamp).getTime() / 1000),
      open: r.open, high: r.high, low: r.low, close: r.close,
      volume: r.volume,
    }));

    // Paralel: SNR + Harmonic + Combo + News
    const cacheKey = opts.asOfDate ? `${symbol}::asof_${opts.asOfDate}` : symbol;
    const [snrResult, harmonicResult, comboResult, newsList] = await Promise.allSettled([
      snrService.analyzeSNR(cacheKey, candles, { assetType: 'stock' }),
      Promise.resolve(harmonicPatternService.detectLatestHarmonic(pastHist, 0.04)),
      Promise.resolve(safeCombo(symbol, candles)),
      opts.skipNews ? Promise.resolve([]) : kapService.getNewsByStock(symbol, 10).catch(() => []),
    ]);

    const snr = snrResult.status === 'fulfilled' ? snrResult.value : null;
    const harmonic = harmonicResult.status === 'fulfilled' ? harmonicResult.value : null;
    const combo = comboResult.status === 'fulfilled' ? comboResult.value : null;
    const news = newsList.status === 'fulfilled' ? newsList.value : [];

    // Indikatörler
    const indicatorsRaw = liveDataService.calculateIndicators(pastHist) || {};
    const closes = pastHist.map(r => r.close);
    const macdHistPrev = closes.length >= 36 ? approxMacdHistAt(closes, closes.length - 2) : null;
    const indicators = {
      ema20: indicatorsRaw.ema21,
      ema50: indicatorsRaw.ema50,
      ema200: indicatorsRaw.ema200,
      rsi: indicatorsRaw.rsi,
      macdHist: indicatorsRaw.macdHistogram,
      macdHistPrev,
      volumeAvg20: indicatorsRaw.volumeSMA20,
      adx: calcADX(candles),
    };

    // Son 6 bar (recent_breakout için)
    const recentBars = candles.slice(-6).map(c => ({ high: c.high, low: c.low, close: c.close }));

    // En iyi zone (SNR signals[0] — zaten in-range + recent filtreli)
    const bestZone = snr?.signals?.[0] || null;

    // Combo'dan en iyi strateji
    const bestStrategy = pickBestComboStrategy(combo);

    // Haber özeti — son 24s
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const positive24h = (news || []).filter(n => {
      const t = new Date(n.publishedAt || n.date || 0).getTime();
      return t >= dayAgo && (n.sentiment === 'positive' || n.sentimentScore > 0.3);
    }).length;
    const negative24h = (news || []).filter(n => {
      const t = new Date(n.publishedAt || n.date || 0).getTime();
      return t >= dayAgo && (n.sentiment === 'negative' || n.sentimentScore < -0.3);
    }).length;
    const latestNews = (news || [])[0] || null;

    const last = candles[candles.length - 1];
    const atr = calcATR(candles);

    return {
      ctx: {
        symbol, name: stock.name || symbol,
        lastClose: last?.close,
        lastVolume: last?.volume,
        atr,
        recentBars,
        indicators,
        snr, harmonic,
        combo: combo ? { ...combo, bestStrategy } : null,
        bestZone,
        news: { positive24h, negative24h, latest: latestNews ? {
          title: latestNews.title,
          publishedAt: latestNews.publishedAt || latestNews.date,
          sentiment: latestNews.sentiment,
        } : null },
      },
      future: futureHist,
    };
  } catch (e) {
    console.error(`[DailySignals] gather(${symbol}) hata:`, e.message);
    return null;
  }
}

function approxMacdHistAt(closes, idx) {
  if (idx < 35) return null;
  const slice = closes.slice(0, idx + 1);
  let ema12 = slice.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let ema26 = slice.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  const k12 = 2 / 13, k26 = 2 / 27, k9 = 2 / 10;
  for (let i = 12; i < 26; i++) ema12 = slice[i] * k12 + ema12 * (1 - k12);
  const macdSeries = [];
  for (let i = 26; i < slice.length; i++) {
    ema12 = slice[i] * k12 + ema12 * (1 - k12);
    ema26 = slice[i] * k26 + ema26 * (1 - k26);
    macdSeries.push(ema12 - ema26);
  }
  if (macdSeries.length < 9) return null;
  let signal = macdSeries.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  for (let i = 9; i < macdSeries.length; i++) signal = macdSeries[i] * k9 + signal * (1 - k9);
  const last = macdSeries[macdSeries.length - 1];
  return +(last - signal).toFixed(3);
}

function safeCombo(symbol, candles) {
  try { return comboStrategyService.analyzeSymbol(symbol, candles, 'daily'); }
  catch (e) { return null; }
}

function pickBestComboStrategy(comboResult) {
  if (!comboResult || !Array.isArray(comboResult.hits) || comboResult.hits.length === 0) return null;
  const sorted = [...comboResult.hits].sort((a, b) => (b.score || 0) - (a.score || 0));
  const t = sorted[0];
  return { key: t.key, name: t.name, side: t.side, tier: t.tier, score: t.score };
}

// ── BIST100 üzerinde tara, iki ayrı top-N seç ─────────────────────────────
async function generatePhase(phase) {
  const universe = liveDataService.getBist100Stocks() || [];
  const trendList = [];
  const reversionList = [];

  for (let i = 0; i < universe.length; i += BATCH_SIZE) {
    const batch = universe.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(s => gatherForSymbol(s)));
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const ctx = r.value.ctx;
      const { trend, reversion } = universalScorer.scoreAll(ctx);
      if (trend && trend.totalScore >= MIN_SCORE_TREND) {
        trendList.push({ ...trend, symbol: ctx.symbol, name: ctx.name, news: ctx.news });
      }
      if (reversion && reversion.totalScore >= MIN_SCORE_REVERSION) {
        reversionList.push({ ...reversion, symbol: ctx.symbol, name: ctx.name, news: ctx.news });
      }
    }
    if (i + BATCH_SIZE < universe.length) await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
  }

  const sortFn = (a, b) => b.totalScore - a.totalScore || b.ratio - a.ratio;
  trendList.sort(sortFn); reversionList.sort(sortFn);
  const generatedAt = new Date().toISOString();

  // Backtest tabanlı confidence enrichment — her sinyale historicalWinRate ekler.
  // signalConfidenceService disk cache'inden okur; cache yoksa null/unknown döner (UI tolere eder).
  const enrichedTrend     = trendList.map(s => signalConfidenceService.enrichSignal(s, 'trend'));
  const enrichedReversion = reversionList.map(s => signalConfidenceService.enrichSignal(s, 'reversion'));

  return {
    phase, generatedAt,
    trend:     { signals: enrichedTrend.slice(0, TOP_LIMIT),     allSignals: enrichedTrend     },
    reversion: { signals: enrichedReversion.slice(0, TOP_LIMIT), allSignals: enrichedReversion },
  };
}

// ── Revision diff — her strateji için ayrı ────────────────────────────────
const REVISION_REASONS = {
  unchanged:        { label: 'Değişiklik yok',        color: 'gray',    icon: '=' },
  recalculated:     { label: 'Hesaplama yenilendi',   color: 'blue',    icon: '↻' },
  technical_shift:  { label: 'Teknik görünüm değişti',color: 'yellow',  icon: '⚙' },
  direction_flip:   { label: 'Yön çevrildi',          color: 'orange',  icon: '↔' },
  dropped:          { label: 'Sinyal düştü',          color: 'red',     icon: '✕' },
  new:              { label: 'Yeni sinyal',           color: 'green',   icon: '＋' },
  news_correlated:  { label: 'Habere bağlı',          color: 'purple',  icon: '📰' },
};

function classifyDiff(prev, next) {
  if (!prev && next) return { code: 'new', detail: 'Borsa açıldıktan sonra koşullar oluştu' };
  if (prev.direction !== next.direction) {
    return { code: 'direction_flip', detail: `${prev.direction.toUpperCase()} → ${next.direction.toUpperCase()}` };
  }
  const scoreDelta = next.totalScore - prev.totalScore;
  const entryDelta = (prev.entry && next.entry) ? Math.abs(next.entry - prev.entry) / prev.entry * 100 : 0;
  const newsRelated = (next.news?.positive24h || 0) > 0 || (next.news?.negative24h || 0) > 0;
  if (newsRelated && (Math.abs(scoreDelta) >= 1 || entryDelta >= 1)) {
    return {
      code: 'news_correlated',
      detail: next.news?.latest?.title ? `KAP: ${next.news.latest.title.slice(0, 80)}` : 'Son 24s haber etkisi',
      scoreDelta, entryDelta,
    };
  }
  if (Math.abs(scoreDelta) >= 2) {
    return { code: 'technical_shift', detail: `Skor ${prev.totalScore} → ${next.totalScore}`, scoreDelta, entryDelta };
  }
  if (entryDelta >= 1.5) {
    return { code: 'recalculated', detail: `Giriş ${prev.entry?.toFixed(2)} → ${next.entry?.toFixed(2)}`, scoreDelta, entryDelta };
  }
  return { code: 'unchanged', detail: 'Önemli değişiklik yok', scoreDelta, entryDelta };
}

function buildDiff(prevPhase, nextPhase) {
  const prevAll = (prevPhase?.allSignals || []);
  const nextAll = (nextPhase?.allSignals || []);
  const byPrev = new Map(prevAll.map(s => [s.symbol, s]));
  const byNext = new Map(nextAll.map(s => [s.symbol, s]));
  const items = [];
  for (const sig of nextAll) {
    const prev = byPrev.get(sig.symbol);
    const reason = classifyDiff(prev, sig);
    items.push({
      symbol: sig.symbol, name: sig.name,
      status: prev ? reason.code : 'new', detail: reason.detail,
      scoreDelta: reason.scoreDelta, entryDelta: reason.entryDelta,
      prev: prev || null,
    });
  }
  for (const prev of prevAll) {
    if (!byNext.has(prev.symbol)) {
      items.push({
        symbol: prev.symbol, name: prev.name,
        status: 'dropped', detail: 'Koşullar artık karşılanmıyor', prev,
      });
    }
  }
  return items;
}

// ── Snapshot'ı diske yaz ──────────────────────────────────────────────────
async function runAndStore(phase) {
  const date = snapshotStore.dateKey();
  const result = await generatePhase(phase);

  if (phase === 'revision' || phase === 'intraday') {
    const existing = snapshotStore.read(date);
    const prev = existing?.premarket || existing?.revision;
    if (prev) {
      result.trend.diff     = buildDiff(prev.trend,     result.trend);
      result.reversion.diff = buildDiff(prev.reversion, result.reversion);
    }
  }

  if (phase === 'intraday') snapshotStore.setPhase(date, 'intraday', result);
  else                      snapshotStore.setPhase(date, phase, result);
  return { date, ...result };
}

// ── Backtest: Bir signal'ın ileri performansını değerlendir ───────────────
// fillMode 'market' → tetiklenmiş kabul, fill = signal.entry (= asOfClose)
// fillMode 'limit'  → trigger zone'a değiş bekler, fill = trigger seviyesi
function evaluateSignalForward(signal, futureCandles) {
  if (!signal.entry || !signal.stop || !signal.target) {
    return { outcome: 'no_levels', triggerDay: null, exitDay: null, exitPrice: null, returnPct: 0 };
  }
  const isLong = signal.direction === 'long';
  const fillMode = signal.fillMode || 'limit';
  let triggered = false, triggerDay = null, fillPrice = null;

  if (fillMode === 'market') {
    // Trend strateji: anında giriş — asOfClose'da fill, ilk gelecek bardan itibaren stop/target izle
    triggered = true;
    fillPrice = signal.entry;
    triggerDay = 'asOfClose';
  }

  for (let i = 0; i < futureCandles.length; i++) {
    const c = futureCandles[i];
    const cd = (c.date || c.timestamp || '').toString().slice(0, 10);

    // Limit emir: trigger zone'a değiş kontrolü
    if (!triggered && fillMode === 'limit') {
      const tz = signal.triggerZone;
      if (tz) {
        // Zone'a değiş = candle aralığı zone aralığıyla kesişir
        const overlap = c.low <= tz.top && c.high >= tz.bottom;
        if (overlap) {
          triggered = true;
          // Fill price: long için zone.top (üstten içeri girince), short için zone.bottom
          fillPrice = isLong ? Math.min(c.open, tz.top) : Math.max(c.open, tz.bottom);
          triggerDay = cd;
        }
      } else {
        // Trigger zone yoksa entry'ye değiş kontrolü
        const hit = isLong ? c.low <= signal.entry : c.high >= signal.entry;
        if (hit) { triggered = true; fillPrice = signal.entry; triggerDay = cd; }
      }
      if (!triggered) continue;
    }

    // Stop / Target
    const stopHit   = isLong ? c.low  <= signal.stop  : c.high >= signal.stop;
    const targetHit = isLong ? c.high >= signal.target: c.low  <= signal.target;

    if (stopHit && targetHit) {
      // Aynı candle'da hem stop hem target → tutucu: stop önce sayılır
      const ret = isLong ? (signal.stop - fillPrice) / fillPrice : (fillPrice - signal.stop) / fillPrice;
      return { outcome: 'hit_stop', triggerDay, exitDay: cd, exitPrice: signal.stop, returnPct: +(ret * 100).toFixed(2), bars: i + 1, fillPrice };
    }
    if (stopHit) {
      const ret = isLong ? (signal.stop - fillPrice) / fillPrice : (fillPrice - signal.stop) / fillPrice;
      return { outcome: 'hit_stop', triggerDay, exitDay: cd, exitPrice: signal.stop, returnPct: +(ret * 100).toFixed(2), bars: i + 1, fillPrice };
    }
    if (targetHit) {
      const ret = isLong ? (signal.target - fillPrice) / fillPrice : (fillPrice - signal.target) / fillPrice;
      return { outcome: 'hit_target', triggerDay, exitDay: cd, exitPrice: signal.target, returnPct: +(ret * 100).toFixed(2), bars: i + 1, fillPrice };
    }
  }

  if (!triggered) {
    return { outcome: 'no_trigger', triggerDay: null, exitDay: null, exitPrice: null, returnPct: 0 };
  }
  // Tetiklendi ama horizon sonuna kadar çıkış yok → açık pozisyon, son kapanışla değerlendir
  const lastF = futureCandles[futureCandles.length - 1];
  const exitPrice = lastF?.close;
  const ret = exitPrice && fillPrice ? (isLong ? (exitPrice - fillPrice) / fillPrice : (fillPrice - exitPrice) / fillPrice) : 0;
  return { outcome: 'still_running', triggerDay, exitDay: (lastF?.date || '').toString().slice(0, 10), exitPrice, returnPct: +(ret * 100).toFixed(2), bars: futureCandles.length, fillPrice };
}

async function backtestAsOf(asOfDate, horizonDays = 5) {
  const universe = liveDataService.getBist100Stocks() || [];
  const trendList = [], reversionList = [];

  for (let i = 0; i < universe.length; i += BATCH_SIZE) {
    const batch = universe.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(s => gatherForSymbol(s, { asOfDate, skipNews: true })));
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const { ctx, future } = r.value;
      const { trend, reversion } = universalScorer.scoreAll(ctx);
      const futureSlice = future.slice(0, horizonDays);

      if (trend && trend.totalScore >= MIN_SCORE_TREND) {
        const out = evaluateSignalForward(trend, futureSlice);
        trendList.push({ ...trend, symbol: ctx.symbol, name: ctx.name, ...out });
      }
      if (reversion && reversion.totalScore >= MIN_SCORE_REVERSION) {
        const out = evaluateSignalForward(reversion, futureSlice);
        reversionList.push({ ...reversion, symbol: ctx.symbol, name: ctx.name, ...out });
      }
    }
    if (i + BATCH_SIZE < universe.length) await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
  }

  const sortFn = (a, b) => b.totalScore - a.totalScore || b.ratio - a.ratio;
  trendList.sort(sortFn); reversionList.sort(sortFn);
  const trendTop     = trendList.slice(0, TOP_LIMIT);
  const reversionTop = reversionList.slice(0, TOP_LIMIT);

  return {
    asOfDate, horizonDays,
    generatedAt: new Date().toISOString(),
    trend: {
      top10: trendTop, allCount: trendList.length,
      stats: aggregateBacktest(trendTop),
      allStats: aggregateBacktest(trendList),
    },
    reversion: {
      top10: reversionTop, allCount: reversionList.length,
      stats: aggregateBacktest(reversionTop),
      allStats: aggregateBacktest(reversionList),
    },
  };
}

function aggregateBacktest(signals) {
  const total = signals.length;
  if (total === 0) return { total: 0, hitTarget: 0, hitStop: 0, noTrigger: 0, stillRunning: 0, winRate: 0, avgReturn: 0, sumReturn: 0 };
  const hitTarget    = signals.filter(s => s.outcome === 'hit_target').length;
  const hitStop      = signals.filter(s => s.outcome === 'hit_stop').length;
  const noTrigger    = signals.filter(s => s.outcome === 'no_trigger').length;
  const stillRunning = signals.filter(s => s.outcome === 'still_running').length;
  const triggered = total - noTrigger;
  const winRate = (hitTarget + hitStop) > 0 ? +(hitTarget / (hitTarget + hitStop) * 100).toFixed(1) : 0;
  const sumReturn = signals.reduce((sum, s) => sum + (s.returnPct || 0), 0);
  const avgReturn = +(sumReturn / total).toFixed(2);
  const triggeredAvgReturn = triggered > 0 ? +(signals.filter(s => s.outcome !== 'no_trigger').reduce((sum, s) => sum + (s.returnPct || 0), 0) / triggered).toFixed(2) : 0;
  return { total, hitTarget, hitStop, noTrigger, stillRunning, winRate, avgReturn, triggeredAvgReturn, sumReturn: +sumReturn.toFixed(2) };
}

// ── Selftest: Mevcut snapshot vs canlı fiyat ──────────────────────────────
function selftest() {
  const date = snapshotStore.dateKey();
  const snap = snapshotStore.read(date);
  if (!snap) return { error: 'Bugün için snapshot yok', date };
  const phase = snap.revision || snap.premarket;
  if (!phase) return { error: 'Bugün için faz yok', date };

  const evalOne = (sig) => {
    const live = liveDataService.getStock(sig.symbol);
    const livePrice = live?.price ?? sig.lastClose;
    if (!livePrice || !sig.entry || !sig.stop || !sig.target) {
      return { ...sig, livePrice, status: 'no_levels' };
    }
    const isLong = sig.direction === 'long';
    let status;
    if (sig.fillMode === 'market') {
      // Market entry: tetiklenmiş kabul. Stop/target ile kıyasla.
      if (isLong) {
        if (livePrice <= sig.stop)   status = 'stopped';
        else if (livePrice >= sig.target) status = 'target_hit';
        else status = 'open';
      } else {
        if (livePrice >= sig.stop)   status = 'stopped';
        else if (livePrice <= sig.target) status = 'target_hit';
        else status = 'open';
      }
    } else {
      // Limit (zone): fiyat zone'a değdi mi henüz?
      if (isLong) {
        if (livePrice <= sig.entry)         status = 'triggered';
        else                                status = 'pending'; // zone üstünde, pullback bekleniyor
        if (livePrice <= sig.stop)          status = 'stopped';
        else if (livePrice >= sig.target)   status = 'target_above'; // henüz tetiklenmedi ama target üstü
      } else {
        if (livePrice >= sig.entry)         status = 'triggered';
        else                                status = 'pending';
        if (livePrice >= sig.stop)          status = 'stopped';
        else if (livePrice <= sig.target)   status = 'target_below';
      }
    }
    const distancePct = +(Math.abs(livePrice - sig.entry) / sig.entry * 100).toFixed(2);
    const unrealizedPct = isLong
      ? +((livePrice - sig.entry) / sig.entry * 100).toFixed(2)
      : +((sig.entry - livePrice) / sig.entry * 100).toFixed(2);
    return {
      symbol: sig.symbol, strategy: sig.strategy, direction: sig.direction,
      totalScore: sig.totalScore, grade: sig.grade,
      entry: sig.entry, stop: sig.stop, target: sig.target,
      livePrice, status, distancePct, unrealizedPct,
    };
  };

  const trendItems     = (phase.trend?.signals || []).map(evalOne);
  const reversionItems = (phase.reversion?.signals || []).map(evalOne);
  const summarize = (items) => items.reduce((m, e) => { m[e.status] = (m[e.status] || 0) + 1; return m; }, {});

  return {
    date,
    phaseUsed: snap.revision ? 'revision' : 'premarket',
    generatedAt: phase.generatedAt,
    evaluatedAt: new Date().toISOString(),
    trend: { counts: summarize(trendItems), items: trendItems },
    reversion: { counts: summarize(reversionItems), items: reversionItems },
  };
}

module.exports = {
  generatePhase,
  runAndStore,
  classifyDiff,
  buildDiff,
  backtestAsOf,
  evaluateSignalForward,
  aggregateBacktest,
  selftest,
  REVISION_REASONS,
  TOP_LIMIT,
  MIN_SCORE_TREND,
  MIN_SCORE_REVERSION,
};
