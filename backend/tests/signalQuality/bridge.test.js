'use strict';
// Not: bridge varsayılan 'shadow' modunda yüklenir (env yoksa).
const bridge = require('../../src/services/signalQuality/bridge');

describe('bridge — fail-safe davranış', () => {
  test('geçersiz girdi asla fırlatmaz', () => {
    expect(bridge.observe(null)).toBeNull();
    expect(bridge.observe(undefined)).toBeNull();
    expect(bridge.recordOutcome(null, true)).toBe(false);
    expect(bridge.recordOutcome({}, true)).toBe(false); // ns/qualityScore yok
  });

  test('shadow modda observe kalibre sonuç döner (yayın kararı hesaplı)', () => {
    const r = bridge.observe({
      engine: 'cryptoScorer', strategy: 'futures_long', direction: 'long',
      rawScore: 8, rawScoreScale: { min: 0, max: 10 },
      candles: null, levels: { entry: 100, stop: 98, target: 105 }, assetClass: 'crypto',
    });
    expect(r).not.toBeNull();
    expect(r.namespace).toBe('cryptoScorer:futures_long:long');
    expect(typeof r.confidence).toBe('number');
    expect(typeof r.publish).toBe('boolean');
  });

  test('MODE bir string', () => {
    expect(typeof bridge.MODE).toBe('string');
  });
});

describe('bridge — off modu', () => {
  test('off modda observe devre dışı (null)', () => {
    jest.resetModules();
    const prev = process.env.SIGNAL_QUALITY_MODE;
    process.env.SIGNAL_QUALITY_MODE = 'off';
    const b2 = require('../../src/services/signalQuality/bridge');
    expect(b2.observe({ engine: 'x', strategy: 's', direction: 'long', rawScore: 5, rawScoreScale: { min: 0, max: 10 } })).toBeNull();
    if (prev === undefined) delete process.env.SIGNAL_QUALITY_MODE;
    else process.env.SIGNAL_QUALITY_MODE = prev;
    jest.resetModules();
  });
});
