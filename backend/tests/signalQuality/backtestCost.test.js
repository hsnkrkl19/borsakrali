'use strict';
const bc = require('../../src/services/signalQuality/backtestCost');

describe('backtestCost — maliyet uygulama', () => {
  test('crypto: %2.5 getiri, ~30bps maliyet düşer', () => {
    expect(bc.applyCostToReturnPct(2.5, 'crypto')).toBeCloseTo(2.2, 6); // 2.5 - 0.30
  });
  test('net getiri her zaman brütten küçük', () => {
    expect(bc.applyCostToReturnPct(1.0, 'bist_equity')).toBeLessThan(1.0);
  });
});

describe('backtestCost — yıllıklandırma', () => {
  test('kripto 365, diğerleri 252', () => {
    expect(bc.tradingPeriodsPerYear('crypto')).toBe(365);
    expect(bc.tradingPeriodsPerYear('fx')).toBe(252);
    expect(bc.tradingPeriodsPerYear('bist_equity')).toBe(252);
  });
});

describe('backtestCost — özet', () => {
  test('net beklenti < brüt beklenti', () => {
    const s = bc.summarizeWithCost([{ returnPct: 3 }, { returnPct: -1 }, { returnPct: 2 }], 'crypto');
    expect(s.netExpectancyPct).toBeLessThan(s.grossExpectancyPct);
    expect(s.netWinRate).toBeLessThanOrEqual(s.grossWinRate);
    expect(s.trades).toBe(3);
  });
});
