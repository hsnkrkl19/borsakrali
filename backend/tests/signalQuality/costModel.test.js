'use strict';
const cost = require('../../src/services/signalQuality/costModel');

describe('costModel — net R:R', () => {
  test('maliyet net R:R’ı brütün altına çeker (crypto)', () => {
    const r = cost.netRR(100, 98, 104, { assetClass: 'crypto' });
    expect(r.grossRR).toBeCloseTo(2, 6); // reward 4 / risk 2
    expect(r.netRR).toBeLessThan(r.grossRR);
    expect(r.costR).toBeGreaterThan(0);
  });
  test('ucuz sınıf (fx_major) net ≈ brüt', () => {
    const r = cost.netRR(1.1, 1.09, 1.12, { assetClass: 'fx' });
    expect(r.netRR).toBeGreaterThan(r.grossRR * 0.9);
  });
  test('pahalı sınıf (bist) < ucuz sınıf (fx) aynı seviyelerde', () => {
    const bist = cost.netRR(100, 98, 104, { assetClass: 'bist_equity' });
    const fx = cost.netRR(100, 98, 104, { assetClass: 'fx_major' });
    expect(bist.netRR).toBeLessThan(fx.netRR);
  });
});

describe('costModel — breakeven', () => {
  test('R:R 2 => başabaş ~%33.3', () => {
    expect(cost.breakevenWinRate(2)).toBeCloseTo(1 / 3, 3);
  });
  test('R:R 1 => başabaş %50', () => {
    expect(cost.breakevenWinRate(1)).toBeCloseTo(0.5, 6);
  });
});

describe('costModel — net beklenti', () => {
  test('yüksek olasılık + iyi R:R => pozitif', () => {
    const e = cost.netExpectancyR(0.6, 100, 98, 104, { assetClass: 'crypto' });
    expect(e).toBeGreaterThan(0);
  });
  test('düşük olasılık => negatif', () => {
    const e = cost.netExpectancyR(0.25, 100, 98, 104, { assetClass: 'crypto' });
    expect(e).toBeLessThan(0);
  });
});

describe('costModel — geçersiz girdi', () => {
  test('sıfır risk güvenli döner', () => {
    const r = cost.netRR(100, 100, 104, { assetClass: 'crypto' });
    expect(r.netRR).toBeNull();
  });
});
