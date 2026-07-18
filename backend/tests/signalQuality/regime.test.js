'use strict';
const { detectRegime } = require('../../src/services/signalQuality/regime');
const { buildTrend, buildChop, buildHighVolTail } = require('./_helpers');

describe('regime — trend', () => {
  test('yükselen trend: gate açık, yön long', () => {
    const r = detectRegime(buildTrend(80, { dir: 1 }));
    expect(r.ok).toBe(true);
    expect(r.trending).toBe(true);
    expect(r.direction).toBe('long');
    expect(r.gate.allow).toBe(true);
    expect(r.regime.startsWith('trend_up')).toBe(true);
    expect(r.gate.sizeMultiplier).toBeGreaterThan(0);
  });

  test('düşen trend: yön short', () => {
    const r = detectRegime(buildTrend(80, { dir: -1, start: 200 }));
    expect(r.direction).toBe('short');
    expect(r.trending).toBe(true);
  });
});

describe('regime — chop', () => {
  test('yatay piyasa: gate BLOKLU, boyut 0', () => {
    const r = detectRegime(buildChop(80));
    expect(r.ok).toBe(true);
    expect(r.trending).toBe(false);
    expect(r.gate.allow).toBe(false);
    expect(r.gate.sizeMultiplier).toBe(0);
    expect(r.regime.startsWith('chop')).toBe(true);
  });
});

describe('regime — high vol', () => {
  test('volatilite patlaması: high vol + düşük boyut çarpanı', () => {
    const r = detectRegime(buildHighVolTail(80));
    expect(r.volState).toBe('high');
    expect(r.highVol).toBe(true);
    // trend hâlâ var ama boyut kısılmış
    if (r.gate.allow) expect(r.gate.sizeMultiplier).toBeLessThan(1);
  });
});

describe('regime — yetersiz veri', () => {
  test('kısa seri güvenli döner', () => {
    const r = detectRegime(buildTrend(10));
    expect(r.ok).toBe(false);
    expect(r.gate.allow).toBe(false);
  });
});
