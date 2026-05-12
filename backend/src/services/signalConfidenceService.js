/**
 * Signal Confidence Service — Borsa Krali
 *
 * Backtest tabanlı geçmiş başarı oranını (winRate) sinyallere besler.
 * Strateji × skor bantı bazında bucket'ler tutar. Disk cache:
 *   backend/src/data/confidence_summary.json
 *
 * Format:
 * {
 *   generatedAt: ISO,
 *   asOfRun: { dates: ['2026-05-05','2026-05-06',...] },
 *   buckets: {
 *     trend:         { '6': {winRate, avgReturn, sampleSize}, '7': {...}, ... },
 *     reversion:     { ... },
 *     spot_long:     { ... },
 *     futures_long:  { ... },
 *     futures_short: { ... },
 *   }
 * }
 *
 * Public API:
 *   - enrichSignal(signal, strategyKey)  → sinyale historicalWinRate, confidence ekler
 *   - getSummary()                       → cached summary
 *   - updateSummary({ days, gap })       → backtest çalıştırır, summary'yi günceller
 */

const fs = require('fs');
const path = require('path');

const SUMMARY_PATH = path.join(__dirname, '..', 'data', 'confidence_summary.json');

// In-memory cache (disk'ten lazy yüklenir)
let memCache = null;

function ensureDir() {
  const dir = path.dirname(SUMMARY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadFromDisk() {
  try {
    if (!fs.existsSync(SUMMARY_PATH)) return null;
    return JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
  } catch (e) {
    console.error('[SignalConfidence] disk read hata:', e.message);
    return null;
  }
}

function getSummary() {
  if (memCache) return memCache;
  memCache = loadFromDisk();
  return memCache;
}

function saveSummary(data) {
  ensureDir();
  try {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(data, null, 2));
    memCache = data;
  } catch (e) {
    console.error('[SignalConfidence] disk write hata:', e.message);
  }
}

// ── Confidence band kuralları ─────────────────────────────────────────────
// Sample size kritik — küçük örneklemde winRate gürültülüdür.
function confidenceBand(winRate, sampleSize) {
  if (sampleSize == null || sampleSize < 3)        return 'unknown';
  if (winRate >= 60 && sampleSize >= 8)            return 'high';
  if (winRate >= 50 && sampleSize >= 5)            return 'mid';
  return 'low';
}

function bandLabel(band) {
  return { high: 'Yüksek Güven', mid: 'Orta Güven', low: 'Düşük Güven', unknown: 'Yeterli Veri Yok' }[band] || band;
}

// ── Sinyale enrich et ─────────────────────────────────────────────────────
function enrichSignal(signal, strategyKey) {
  if (!signal) return signal;
  const summary = getSummary();
  const buckets = summary?.buckets?.[strategyKey] || null;

  // 1) Önce sinyalin kendi skoruna karşılık gelen bucket'ı dene
  let bucket = buckets ? buckets[String(signal.totalScore)] : null;

  // 2) O bucket küçükse "score+üstü" agrega kullan (daha çok örneklem)
  if (!bucket || bucket.sampleSize < 3) {
    bucket = buckets ? aggregateAtOrAbove(buckets, signal.totalScore) : null;
  }

  // 3) Hâlâ yoksa strateji genel ortalamasını kullan
  if (!bucket || bucket.sampleSize < 3) {
    bucket = buckets ? aggregateAll(buckets) : null;
  }

  if (!bucket) {
    return { ...signal, historicalWinRate: null, confidence: 'unknown', confidenceLabel: bandLabel('unknown'), sampleSize: 0 };
  }
  const band = confidenceBand(bucket.winRate, bucket.sampleSize);
  return {
    ...signal,
    historicalWinRate: bucket.winRate,
    historicalAvgReturn: bucket.avgReturn,
    sampleSize: bucket.sampleSize,
    confidence: band,
    confidenceLabel: bandLabel(band),
  };
}

function aggregateAtOrAbove(buckets, score) {
  const keys = Object.keys(buckets).map(k => +k).filter(k => k >= score).sort((a, b) => a - b);
  if (keys.length === 0) return null;
  return mergeBuckets(keys.map(k => buckets[String(k)]));
}

function aggregateAll(buckets) {
  const all = Object.values(buckets);
  if (all.length === 0) return null;
  return mergeBuckets(all);
}

function mergeBuckets(list) {
  let total = 0, wins = 0, losses = 0, sumReturn = 0;
  for (const b of list) {
    if (!b) continue;
    total += b.sampleSize || 0;
    wins  += b.hitTarget  || 0;
    losses+= b.hitStop    || 0;
    sumReturn += (b.avgReturn || 0) * (b.sampleSize || 0);
  }
  if (total === 0) return null;
  const closed = wins + losses;
  const winRate = closed > 0 ? +(wins / closed * 100).toFixed(1) : 0;
  const avgReturn = +(sumReturn / total).toFixed(2);
  return { winRate, avgReturn, sampleSize: total, hitTarget: wins, hitStop: losses };
}

// ── Backtest sonuçlarını bucket'lara çevir ────────────────────────────────
function bucketsFromBacktestList(signals) {
  const out = {};
  for (const s of signals || []) {
    if (s.totalScore == null) continue;
    const key = String(s.totalScore);
    if (!out[key]) out[key] = { hitTarget: 0, hitStop: 0, stillRunning: 0, noTrigger: 0, sumReturn: 0, sampleSize: 0 };
    out[key].sampleSize++;
    if (s.outcome === 'hit_target')    out[key].hitTarget++;
    if (s.outcome === 'hit_stop')      out[key].hitStop++;
    if (s.outcome === 'still_running') out[key].stillRunning++;
    if (s.outcome === 'no_trigger')    out[key].noTrigger++;
    out[key].sumReturn += s.returnPct || 0;
  }
  // Finalize: winRate, avgReturn hesapla
  for (const key of Object.keys(out)) {
    const b = out[key];
    const closed = b.hitTarget + b.hitStop;
    b.winRate = closed > 0 ? +(b.hitTarget / closed * 100).toFixed(1) : 0;
    b.avgReturn = b.sampleSize > 0 ? +(b.sumReturn / b.sampleSize).toFixed(2) : 0;
  }
  return out;
}

function mergeBucketsMap(baseMap, addMap) {
  const out = { ...baseMap };
  for (const key of Object.keys(addMap)) {
    if (!out[key]) {
      out[key] = { ...addMap[key] };
      continue;
    }
    const a = out[key], b = addMap[key];
    const merged = {
      sampleSize:   (a.sampleSize || 0) + (b.sampleSize || 0),
      hitTarget:    (a.hitTarget || 0)  + (b.hitTarget || 0),
      hitStop:      (a.hitStop || 0)    + (b.hitStop || 0),
      stillRunning: (a.stillRunning||0) + (b.stillRunning||0),
      noTrigger:    (a.noTrigger || 0)  + (b.noTrigger || 0),
      sumReturn:    (a.sumReturn || 0)  + (b.sumReturn || 0),
    };
    const closed = merged.hitTarget + merged.hitStop;
    merged.winRate = closed > 0 ? +(merged.hitTarget / closed * 100).toFixed(1) : 0;
    merged.avgReturn = merged.sampleSize > 0 ? +(merged.sumReturn / merged.sampleSize).toFixed(2) : 0;
    out[key] = merged;
  }
  return out;
}

// ── Summary update — backtest çalıştır, bucket'ları topla ─────────────────
function dateMinusDays(daysAgo) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Lazy require — circular dependency'yi önlemek için
function getDailyService() { return require('./dailySignalsService'); }
function getCryptoService() { return require('./cryptoSignalsService'); }

/**
 * Son N gün için backtest çalıştır, summary'yi güncelle.
 *
 * @param {object} opts
 * @param {number} opts.days        — kaç farklı asOfDate çalıştırılsın (default 4)
 * @param {number} opts.gap         — asOfDate'ler arasında gün sayısı (default 7)
 * @param {number} opts.horizonBist — BIST forward horizon gün (default 5)
 * @param {number} opts.horizonCrypto — kripto forward horizon gün (default 7)
 * @param {boolean} opts.skipBist   — sadece kripto güncelle
 * @param {boolean} opts.skipCrypto — sadece BIST güncelle
 */
async function updateSummary(opts = {}) {
  const days = opts.days ?? 4;
  const gap = opts.gap ?? 7;
  const horizonBist = opts.horizonBist ?? 5;
  const horizonCrypto = opts.horizonCrypto ?? 7;

  const startTs = Date.now();
  const datesRun = [];

  let trendBuckets = {}, reversionBuckets = {};
  let spotBuckets = {}, futuresLongBuckets = {}, futuresShortBuckets = {};

  for (let i = 0; i < days; i++) {
    // i. tarih: bugünden (horizon+gap*i+gap) gün geri
    const daysAgo = horizonBist + gap * (i + 1);
    const asOfDate = dateMinusDays(daysAgo);
    datesRun.push(asOfDate);

    if (!opts.skipBist) {
      try {
        const bist = await getDailyService().backtestAsOf(asOfDate, horizonBist);
        // top10 değil — tüm liste daha fazla örneklem
        trendBuckets    = mergeBucketsMap(trendBuckets,    bucketsFromBacktestList(bist.trend?.top10 || []));
        reversionBuckets= mergeBucketsMap(reversionBuckets,bucketsFromBacktestList(bist.reversion?.top10 || []));
      } catch (e) {
        console.error(`[SignalConfidence] BIST backtest ${asOfDate} hata:`, e.message);
      }
    }

    if (!opts.skipCrypto) {
      try {
        const cryptoAsOf = dateMinusDays(horizonCrypto + gap * (i + 1));
        const crypto = await getCryptoService().backtestAsOf(cryptoAsOf, horizonCrypto);
        spotBuckets        = mergeBucketsMap(spotBuckets,        bucketsFromBacktestList(crypto.spot_long?.top10 || []));
        futuresLongBuckets = mergeBucketsMap(futuresLongBuckets, bucketsFromBacktestList(crypto.futures_long?.top10 || []));
        futuresShortBuckets= mergeBucketsMap(futuresShortBuckets,bucketsFromBacktestList(crypto.futures_short?.top10 || []));
      } catch (e) {
        console.error(`[SignalConfidence] Kripto backtest ${asOfDate} hata:`, e.message);
      }
    }
  }

  const newSummary = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startTs,
    asOfRun: { dates: datesRun, horizonBist, horizonCrypto },
    buckets: {
      trend:         trendBuckets,
      reversion:     reversionBuckets,
      spot_long:     spotBuckets,
      futures_long:  futuresLongBuckets,
      futures_short: futuresShortBuckets,
    },
  };

  // Eski summary varsa MERGE et — birikimli istatistik daha sağlam
  const prev = getSummary();
  if (prev?.buckets && !opts.replace) {
    newSummary.buckets = {
      trend:         mergeBucketsMap(prev.buckets.trend         || {}, newSummary.buckets.trend),
      reversion:     mergeBucketsMap(prev.buckets.reversion     || {}, newSummary.buckets.reversion),
      spot_long:     mergeBucketsMap(prev.buckets.spot_long     || {}, newSummary.buckets.spot_long),
      futures_long:  mergeBucketsMap(prev.buckets.futures_long  || {}, newSummary.buckets.futures_long),
      futures_short: mergeBucketsMap(prev.buckets.futures_short || {}, newSummary.buckets.futures_short),
    };
    newSummary.mergedWith = prev.asOfRun?.dates || [];
  }

  saveSummary(newSummary);
  return newSummary;
}

// In-memory cache'i temizle (test/debug için)
function resetCache() { memCache = null; }

module.exports = {
  getSummary,
  enrichSignal,
  updateSummary,
  resetCache,
  confidenceBand,
  bandLabel,
  // Tek tek strateji buckets dışarıya
  bucketsFromBacktestList,
  mergeBucketsMap,
};
