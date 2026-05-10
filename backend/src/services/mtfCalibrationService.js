/**
 * MTF Calibration Service — Borsa Krali
 *
 * Bayesian-style win probability calibration: TF × skor bucket × yön için
 * Beta(α, β) posterior tutar. Bootstrap heuristic ile başlar; backtest
 * sonuçlarıyla iteratif güncellenir.
 *
 * Yaklaşım:
 *   1. PRIOR_LOGISTIC: skor oranına göre logistic eğri (uncalibrated heuristic)
 *      Ortalama trend-takip sistemleri için makul başlangıç:
 *        ratio=0.50 → ~%51, 0.75 → ~%66, 1.00 → ~%78
 *
 *   2. Beta posterior güncelleme:
 *        α_new = α_prior + hit_target_count
 *        β_new = β_prior + hit_stop_count
 *      Posterior mean = α / (α + β) — gerçek win probability
 *      Posterior std  = sqrt(α*β / ((α+β)² (α+β+1))) — belirsizlik
 *
 *   3. Sample size yetersizken (n < 10) prior ağırlığı yüksek tutulur
 *      (Bayesian shrinkage) — over-fitting'i önler.
 *
 * Calibration table disk persisted:
 *   backend/src/data/crypto-mtf/calibration.json
 *
 * Public API:
 *   - getWinProbability(tf, score, applicableMax, direction)
 *   - updateFromBacktest(tf, signals)  — sonradan iteratif geliştirilebilir
 *   - load() / save() — disk I/O
 */

const fs = require('fs');
const path = require('path');

const CALIB_FILE = path.join(__dirname, '..', 'data', 'crypto-mtf', 'calibration.json');

// ───────────────────────────────────────────────────────────────────────────
// PRIOR — heuristic logistic curve
// ───────────────────────────────────────────────────────────────────────────

/**
 * Score ratio (0-1) → win probability.
 *   logOdds = a + b * ratio
 *   p = 1 / (1 + e^(-logOdds))  (sigmoid)
 *
 * Parametreler:
 *   a = -2.2 (intercept) — ratio=0'da p ≈ 0.10
 *   b =  4.4 (slope)    — ratio=1.0'da p ≈ 0.90
 *   ratio=0.5'te p ≈ 0.50 (cross)
 */
function priorLogistic(ratio) {
  if (ratio == null || isNaN(ratio)) return 0.5;
  const r = Math.max(0, Math.min(1, ratio));
  const logOdds = -2.2 + 4.4 * r;
  return 1 / (1 + Math.exp(-logOdds));
}

// Bucket ratio → 0.0, 0.1, ..., 1.0 (11 bucket)
function bucketRatio(ratio) {
  if (ratio == null || isNaN(ratio)) return 0.5;
  return Math.max(0, Math.min(1, +(Math.round(ratio * 10) / 10).toFixed(1)));
}

// ───────────────────────────────────────────────────────────────────────────
// Bayesian state
// ───────────────────────────────────────────────────────────────────────────

/**
 * key: `${tf}__${bucket}__${dir}` → { alpha, beta, samples, lastUpdated }
 *
 * Her bucket için Beta(α, β) posterior. α + β = effective sample size + 2 (prior).
 * mean = α / (α + β)
 */
const calibrationTable = new Map();
let lastSaveAt = null;

function getKey(tf, bucket, direction) {
  return `${tf}__${bucket}__${direction}`;
}

function getOrCreateBucket(tf, bucket, direction) {
  const key = getKey(tf, bucket, direction);
  let entry = calibrationTable.get(key);
  if (!entry) {
    // Prior strength: küçük ama 0 değil. 1+1=2 effective prior samples.
    // Prior mean = priorLogistic(bucket).
    const priorMean = priorLogistic(bucket);
    // α/(α+β) = priorMean, α+β = 2 → α = 2*priorMean, β = 2*(1-priorMean)
    entry = {
      alpha: +(2 * priorMean).toFixed(2),
      beta:  +(2 * (1 - priorMean)).toFixed(2),
      samples: 0,
      lastUpdated: null,
    };
    calibrationTable.set(key, entry);
  }
  return entry;
}

// ───────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────

/**
 * tf:    '1h' | '4h' | '1d' | ...
 * score: koşul sayısı (0-12)
 * applicableMax: max possible (12)
 * direction: 'long' | 'short'
 *
 * Döndürür: { probability, confidence, samples, mean, prior }
 *   probability: posterior mean (0-1)
 *   confidence:  1 - Beta std × 4 (örnek arttıkça artar, sezgisel skala)
 *   samples:     bu bucket'tan gelen geçmiş sinyal sayısı
 */
function getWinProbability(tf, score, applicableMax, direction) {
  const ratio = applicableMax > 0 ? score / applicableMax : 0;
  const bucket = bucketRatio(ratio);
  const entry = getOrCreateBucket(tf, bucket, direction);
  const mean = entry.alpha / (entry.alpha + entry.beta);
  const variance = (entry.alpha * entry.beta) /
    ((entry.alpha + entry.beta) ** 2 * (entry.alpha + entry.beta + 1));
  const std = Math.sqrt(variance);
  // Sample size'a duyarlı confidence: prior'da 0.20, n=50'de ~0.95
  const confidence = Math.max(0, Math.min(1, 1 - std * 4));
  return {
    probability: +mean.toFixed(3),
    confidence: +confidence.toFixed(2),
    samples: entry.samples,
    bucket,
    prior: +priorLogistic(bucket).toFixed(3),
    posteriorAlpha: entry.alpha,
    posteriorBeta:  entry.beta,
  };
}

/**
 * Backtest sonuçlarından Bayesian update.
 * signals: [{ score, applicableMax, direction, outcome }] — outcome: 'hit_target'|'hit_stop'|'still_running'|'no_trigger'
 *
 * Sadece hit_target ve hit_stop sayılır (kapanmış pozisyonlar). still_running atlanır.
 */
function updateFromBacktest(tf, signals) {
  if (!Array.isArray(signals) || signals.length === 0) return { updated: 0, skipped: 0 };
  let updated = 0, skipped = 0;
  const now = new Date().toISOString();

  for (const s of signals) {
    if (!s || !s.applicableMax || s.score == null) { skipped++; continue; }
    if (s.outcome !== 'hit_target' && s.outcome !== 'hit_stop') { skipped++; continue; }

    const ratio = s.score / s.applicableMax;
    const bucket = bucketRatio(ratio);
    const entry = getOrCreateBucket(tf, bucket, s.direction);

    if (s.outcome === 'hit_target') entry.alpha += 1;
    else                            entry.beta  += 1;
    entry.samples += 1;
    entry.lastUpdated = now;
    updated++;
  }
  return { updated, skipped };
}

/**
 * Tablo özeti — debug / admin paneli için.
 */
function getSnapshot() {
  const out = {};
  for (const [key, entry] of calibrationTable.entries()) {
    const [tf, bucket, dir] = key.split('__');
    out[tf] = out[tf] || {};
    out[tf][dir] = out[tf][dir] || {};
    const mean = entry.alpha / (entry.alpha + entry.beta);
    out[tf][dir][bucket] = {
      probability: +mean.toFixed(3),
      samples: entry.samples,
      alpha: entry.alpha,
      beta: entry.beta,
    };
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// Persistence
// ───────────────────────────────────────────────────────────────────────────

function load() {
  try {
    if (!fs.existsSync(CALIB_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(CALIB_FILE, 'utf8'));
    calibrationTable.clear();
    for (const [key, entry] of Object.entries(data.table || {})) {
      calibrationTable.set(key, entry);
    }
    return true;
  } catch (e) {
    console.error('[MTFCalib] load hata:', e.message);
    return false;
  }
}

function save() {
  try {
    const dir = path.dirname(CALIB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = {
      version: 1,
      generatedAt: new Date().toISOString(),
      bucketCount: calibrationTable.size,
      table: Object.fromEntries(calibrationTable),
    };
    fs.writeFileSync(CALIB_FILE, JSON.stringify(data, null, 2), 'utf8');
    lastSaveAt = data.generatedAt;
    return true;
  } catch (e) {
    console.error('[MTFCalib] save hata:', e.message);
    return false;
  }
}

// Boot'ta diskten yükle (varsa)
load();

module.exports = {
  getWinProbability,
  updateFromBacktest,
  getSnapshot,
  load,
  save,
  priorLogistic,
  bucketRatio,
  CALIB_FILE,
};
