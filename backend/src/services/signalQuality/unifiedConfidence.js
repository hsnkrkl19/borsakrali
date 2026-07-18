/**
 * signalQuality/unifiedConfidence.js
 * ---------------------------------------------------------------------------
 * TÜM motorları TEK, tutarlı, olasılığa dayalı güven sözleşmesine bağlar.
 *
 * Sözleşme: `confidence` (0..100) = MODELLENEN kazanma olasılığı × 100.
 * Yani "72" => ~%72 kalibre kazanma olasılığı — motor fark etmeksizin AYNI anlam.
 *
 * Akış:
 *   ham skor --normalize--> qualityScore
 *        + (opsiyonel) kolinyerlik-farkında konfluans
 *        --kalibrasyon--> olasılık p (Beta-Bayes + izotonik)
 *   rejim filtresi --> gate (choppy'de blokla) + pozisyon boyutu çarpanı
 *   maliyet modeli --> net R:R + başabaş isabet --> EDGE = p - p*
 *   grade & publish kararı EDGE'e göre (keyfi eşik yok)
 *
 * Saf fonksiyon (paylaşılan Calibrator örneği DIŞARIDAN verilir).
 */

'use strict';

const { detectRegime } = require('./regime');
const { aggregateConfluence } = require('./confluence');
const cost = require('./costModel');

const DEFAULTS = Object.freeze({
  minNetRR: 1.3, // net R:R bu değerin altındaysa yayınlama
  minEdge: 0.02, // p - breakeven bu değerin altındaysa "avantaj yok"
  confluenceWeight: 0.5, // qualityScore = w*normScore + (1-w)*confluenceQuality
  allowUncalibratedPublish: true, // veri birikene kadar fallback ile yayınlansın mı
  requireRegimeAlign: false, // trend yönüne ters sinyali sert blokla
  gradeCuts: { mukemmel: 0.12, guclu: 0.06, orta: 0.02 },
});

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
function round(x, d = 2) {
  if (x === null || !Number.isFinite(x)) return null;
  const m = Math.pow(10, d);
  return Math.round(x * m) / m;
}

function normalize(raw, scale) {
  if (!scale) return clamp(Number(raw) || 0, 0, 1);
  const { min = 0, max = 1 } = scale;
  if (max === min) return 0;
  return clamp((Number(raw) - min) / (max - min), 0, 1);
}

function makeNamespace(engine, strategy, direction) {
  return `${engine || 'engine'}:${strategy || 'default'}:${direction || 'long'}`;
}

function gradeFromEdge(edge, cuts) {
  if (edge >= cuts.mukemmel) return 'MUKEMMEL';
  if (edge >= cuts.guclu) return 'GUCLU';
  if (edge >= cuts.orta) return 'ORTA';
  return 'ZAYIF';
}

/**
 * Bir sinyal adayını değerlendir.
 * @param {object} sig
 * @param {string} sig.engine
 * @param {string} sig.strategy
 * @param {'long'|'short'} sig.direction
 * @param {number} sig.rawScore
 * @param {{min:number,max:number}} [sig.rawScoreScale]
 * @param {Array} [sig.votes]  konfluans için teknik oyları
 * @param {Array} [sig.candles] rejim için mumlar
 * @param {{entry:number,stop:number,target:number}} [sig.levels]
 * @param {string} [sig.assetClass]
 * @param {import('./calibration').Calibrator} [sig.calibrator]
 * @param {object} [opts]
 */
function evaluateSignal(sig, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts, gradeCuts: { ...DEFAULTS.gradeCuts, ...(opts.gradeCuts || {}) } };
  const reasons = [];
  const direction = sig.direction === 'short' ? 'short' : 'long';

  // 1) Skor normalize + konfluans
  const normScore = normalize(sig.rawScore, sig.rawScoreScale);
  let confluence = null;
  let qualityScore = normScore;
  if (Array.isArray(sig.votes) && sig.votes.length) {
    confluence = aggregateConfluence(sig.votes, opts.confluenceOpts);
    qualityScore = clamp(
      cfg.confluenceWeight * normScore + (1 - cfg.confluenceWeight) * confluence.rawQuality,
      0,
      1
    );
    if (confluence.direction !== 'neutral' && confluence.direction !== direction) {
      reasons.push(`konfluans yönü (${confluence.direction}) sinyal yönüyle çelişiyor`);
    }
  }

  // 2) Rejim filtresi
  let regime = null;
  if (Array.isArray(sig.candles) && sig.candles.length) {
    regime = detectRegime(sig.candles, opts.regimeOpts);
  }

  // 3) Kalibrasyon
  const namespace = makeNamespace(sig.engine, sig.strategy, direction);
  let prob;
  if (sig.calibrator) {
    prob = sig.calibrator.probability(namespace, qualityScore);
  } else {
    prob = { p: fallbackLogistic(qualityScore), calibrated: false, source: 'fallback', n: 0, lo: null, hi: null };
  }
  const p = prob.p;

  // 4) Maliyet / R:R / edge
  let rr = { grossRR: null, netRR: null, costR: null };
  let breakeven = null;
  let edge = null;
  let expectancyR = null;
  if (sig.levels && sig.levels.entry != null && sig.levels.stop != null && sig.levels.target != null) {
    rr = cost.netRR(sig.levels.entry, sig.levels.stop, sig.levels.target, { assetClass: sig.assetClass, costBps: opts.costBps });
    breakeven = cost.breakevenWinRate(rr.netRR);
    if (breakeven != null && p != null) edge = round(p - breakeven, 4);
    expectancyR = cost.netExpectancyR(p, sig.levels.entry, sig.levels.stop, sig.levels.target, {
      assetClass: sig.assetClass,
      costBps: opts.costBps,
    });
  }

  // 5) Kapı (gate) kararları
  let publish = true;
  let sizeMultiplier = 1;

  if (regime) {
    sizeMultiplier = regime.gate.sizeMultiplier;
    if (!regime.gate.allow) {
      publish = false;
      reasons.push(`rejim kapısı: ${regime.gate.reason}`);
    }
    if (cfg.requireRegimeAlign && regime.trending && regime.direction !== 'neutral' && regime.direction !== direction) {
      publish = false;
      reasons.push(`trend yönüne ters (${regime.direction} trendinde ${direction})`);
    }
  }

  if (rr.netRR != null && rr.netRR < cfg.minNetRR) {
    publish = false;
    reasons.push(`net R:R ${rr.netRR} < ${cfg.minNetRR}`);
  }

  if (edge != null && edge < cfg.minEdge) {
    publish = false;
    reasons.push(`avantaj yetersiz: edge ${edge} < ${cfg.minEdge}`);
  }

  if (!prob.calibrated && !cfg.allowUncalibratedPublish) {
    publish = false;
    reasons.push('kalibrasyon verisi yetersiz (fallback yayını kapalı)');
  }

  const confidence = p != null ? Math.round(clamp(p, 0, 1) * 100) : null;
  const grade = edge != null ? gradeFromEdge(edge, cfg.gradeCuts) : gradeFromEdge((p || 0) - 0.5, cfg.gradeCuts);
  const band = confidence == null ? 'unknown' : confidence >= 65 ? 'high' : confidence >= 55 ? 'mid' : 'low';

  return {
    namespace,
    direction,
    // TEK, tutarlı çıktı:
    confidence, // 0..100 = olasılık×100
    probability: p,
    probabilityInterval: prob.lo != null ? [prob.lo, prob.hi] : null,
    calibrated: !!prob.calibrated,
    calibrationSource: prob.source,
    calibrationSamples: prob.n,
    grade,
    band,
    edge,
    breakevenWinRate: breakeven,
    netRR: rr.netRR,
    grossRR: rr.grossRR,
    costR: rr.costR,
    expectancyR,
    qualityScore: round(qualityScore, 4),
    normScore: round(normScore, 4),
    sizeMultiplier: round(sizeMultiplier, 3),
    regime: regime ? { regime: regime.regime, adx: regime.adx, choppiness: regime.choppiness, volState: regime.volState, trending: regime.trending } : null,
    confluence: confluence
      ? { direction: confluence.direction, rawQuality: confluence.rawQuality, agreement: confluence.agreement, effectiveBlocks: confluence.effectiveBlocks }
      : null,
    publish,
    reasons,
  };
}

/**
 * Sonuç kapandığında kalibrasyonu besle — SUN ile AYNI qualityScore ve namespace
 * kullanılır (eğitim/servis tutarlılığı garanti).
 */
function recordOutcome(calibrator, evaluation, outcome) {
  if (!calibrator || !evaluation) return;
  calibrator.record(evaluation.namespace, evaluation.qualityScore, outcome);
}

function fallbackLogistic(score) {
  const s = clamp(Number(score) || 0, 0, 1);
  return round(1 / (1 + Math.exp(-3.6 * 2 * (s - 0.5))), 4);
}

module.exports = { evaluateSignal, recordOutcome, makeNamespace, normalize, DEFAULTS };
