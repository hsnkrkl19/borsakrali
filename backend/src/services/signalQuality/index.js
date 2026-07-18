/**
 * signalQuality — Ortak Sinyal Kalite Katmanı (Faz 1)
 * ---------------------------------------------------------------------------
 * Tüm sinyal motorlarının (proEngine, mtfScorer, cryptoScorer, beast,
 * universalScorer) ORTAK kullanacağı, BAĞIMSIZ ve TEST EDİLMİŞ altyapı.
 *
 * Bu katman canlı motorları DEĞİŞTİRMEZ; motorlar isteğe bağlı olarak bu
 * fonksiyonları çağırarak:
 *   - choppy piyasada sinyali eler (regime),
 *   - korelasyonlu indikatörlerin sahte konsensüsünü kırar (confluence),
 *   - ham skoru gerçek olasılığa kalibre eder (calibration),
 *   - işlem maliyetini R:R'a yansıtır (costModel),
 *   - hepsini TEK tutarlı 0..100 güven skalasına bağlar (unifiedConfidence).
 *
 * Kullanım (özet):
 *   const sq = require('../signalQuality');
 *   const calib = sq.Calibrator.deserialize(loadedJson || {});
 *   const evalRes = sq.evaluateSignal({ engine, strategy, direction, rawScore,
 *       rawScoreScale, votes, candles, levels, assetClass, calibrator: calib });
 *   if (evalRes.publish) publish(evalRes);
 *   // pozisyon kapanınca:
 *   sq.recordOutcome(calib, evalRes, { win: true, r: 1.8 });
 *   persist(calib.serialize());
 */

'use strict';

const indicators = require('./indicators');
const regime = require('./regime');
const confluence = require('./confluence');
const calibration = require('./calibration');
const costModel = require('./costModel');
const unified = require('./unifiedConfidence');

module.exports = {
  indicators,
  // rejim
  detectRegime: regime.detectRegime,
  // konfluans
  aggregateConfluence: confluence.aggregateConfluence,
  // kalibrasyon
  Calibrator: calibration.Calibrator,
  isotonicNonDecreasing: calibration.isotonicNonDecreasing,
  // maliyet
  costModel,
  netRR: costModel.netRR,
  breakevenWinRate: costModel.breakevenWinRate,
  // birleşik güven
  evaluateSignal: unified.evaluateSignal,
  recordOutcome: unified.recordOutcome,
  makeNamespace: unified.makeNamespace,
  // alt modüller (ileri kullanım)
  _modules: { indicators, regime, confluence, calibration, costModel, unified },
};
