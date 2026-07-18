'use strict';
const sq = require('../../src/services/signalQuality');
const { buildTrend, buildChop } = require('./_helpers');

function trainCalib(engine, strategy, direction) {
  const c = new sq.Calibrator();
  const ns = sq.makeNamespace(engine, strategy, direction);
  for (let k = 0; k < 80; k++) {
    c.record(ns, 0.85, k % 10 !== 0); // yüksek skor ~%90
    c.record(ns, 0.5, k % 2 === 0); // orta ~%50
    c.record(ns, 0.2, k % 5 === 0); // düşük ~%20
  }
  return c;
}

describe('unifiedConfidence — semantik', () => {
  test('confidence = olasılık × 100', () => {
    const calib = trainCalib('cryptoScorer', 'futures_long', 'long');
    const r = sq.evaluateSignal({
      engine: 'cryptoScorer',
      strategy: 'futures_long',
      direction: 'long',
      rawScore: 8.5,
      rawScoreScale: { min: 0, max: 10 },
      candles: buildTrend(80),
      levels: { entry: 100, stop: 98, target: 105 },
      assetClass: 'crypto',
      calibrator: calib,
    });
    expect(r.confidence).toBe(Math.round(r.probability * 100));
    expect(r.namespace).toBe('cryptoScorer:futures_long:long');
    expect(r.calibrated).toBe(true);
  });
});

describe('unifiedConfidence — rejim kapısı', () => {
  test('choppy piyasada publish=false', () => {
    const calib = trainCalib('mtfScorer', 'trend', 'long');
    const r = sq.evaluateSignal({
      engine: 'mtfScorer',
      strategy: 'trend',
      direction: 'long',
      rawScore: 9,
      rawScoreScale: { min: 0, max: 12 },
      candles: buildChop(80),
      levels: { entry: 100, stop: 98, target: 105 },
      assetClass: 'crypto',
      calibrator: calib,
    });
    expect(r.publish).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/rejim/);
  });

  test('trend + iyi R:R + avantaj => publish=true', () => {
    const calib = trainCalib('mtfScorer', 'trend', 'long');
    const r = sq.evaluateSignal({
      engine: 'mtfScorer',
      strategy: 'trend',
      direction: 'long',
      rawScore: 11,
      rawScoreScale: { min: 0, max: 12 },
      candles: buildTrend(80),
      levels: { entry: 100, stop: 97, target: 106 },
      assetClass: 'crypto',
      calibrator: calib,
    });
    expect(r.publish).toBe(true);
    expect(r.grade).not.toBe('ZAYIF');
    expect(r.edge).toBeGreaterThan(0);
  });
});

describe('unifiedConfidence — R:R kapısı', () => {
  test('kötü R:R publish’i engeller', () => {
    const calib = trainCalib('proEngine', 'confluence', 'long');
    const r = sq.evaluateSignal({
      engine: 'proEngine',
      strategy: 'confluence',
      direction: 'long',
      rawScore: 0.8,
      candles: buildTrend(80),
      levels: { entry: 100, stop: 95, target: 101 }, // R:R ~0.2
      assetClass: 'crypto',
      calibrator: calib,
      // minNetRR varsayılan 1.3
    });
    expect(r.publish).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/R:R/);
  });
});

describe('unifiedConfidence — kalibrasyon tutarlılığı (record ↔ serve)', () => {
  test('recordOutcome aynı namespace/qualityScore ile besler', () => {
    const calib = new sq.Calibrator();
    const base = {
      engine: 'beast',
      strategy: 'zl',
      direction: 'long',
      rawScore: 6,
      rawScoreScale: { min: 0, max: 8 },
      candles: buildTrend(80),
      levels: { entry: 100, stop: 98, target: 104 },
      assetClass: 'metal',
      calibrator: calib,
    };
    const e1 = sq.evaluateSignal(base);
    for (let k = 0; k < 40; k++) sq.recordOutcome(calib, e1, { win: k % 3 !== 0, r: k % 3 !== 0 ? 1.5 : -1 });
    const e2 = sq.evaluateSignal(base);
    expect(e2.namespace).toBe(e1.namespace);
    expect(e2.calibrationSamples).toBeGreaterThan(0);
  });
});

describe('unifiedConfidence — konfluans entegrasyonu', () => {
  test('korelasyonlu oylar tekil güveni şişirmez', () => {
    const calib = trainCalib('universalScorer', 'trend', 'long');
    const votes = [
      { technique: 'ema34', vote: 'long', strength: 0.9 },
      { technique: 'tema34', vote: 'long', strength: 0.9 },
      { technique: 'genel', vote: 'long', strength: 0.9 },
    ];
    const r = sq.evaluateSignal({
      engine: 'universalScorer',
      strategy: 'trend',
      direction: 'long',
      rawScore: 0.6,
      votes,
      candles: buildTrend(80),
      levels: { entry: 100, stop: 97, target: 106 },
      assetClass: 'bist_equity',
      calibrator: calib,
    });
    expect(r.confluence).not.toBeNull();
    expect(r.confluence.direction).toBe('long');
    // qualityScore, saf 0.9 konfluans değil; korelasyon indirimi uygulanmış
    expect(r.qualityScore).toBeLessThan(0.9);
  });
});
