'use strict';
const {
  aggregateConfluence,
  combineWithinGroup,
} = require('../../src/services/signalQuality/confluence');

describe('confluence — grup içi azalan getiri', () => {
  test('3 korelasyonlu üye toplamdan (2.4) çok küçük kalır', () => {
    const combined = combineWithinGroup([0.8, 0.8, 0.8], 0.7);
    expect(combined).toBeGreaterThan(0.8); // tek üyeden biraz fazla
    expect(combined).toBeLessThan(0.95); // ama 3x değil
  });
  test('tek üye kendi gücünü verir', () => {
    expect(combineWithinGroup([0.7], 0.7)).toBeCloseTo(0.7, 6);
  });
});

describe('confluence — sahte konsensüs kırılır', () => {
  test('aynı grup 3 oy < farklı grup 3 oy (rawQuality)', () => {
    const sameGroup = aggregateConfluence([
      { technique: 'ema34', vote: 'long', strength: 0.8 },
      { technique: 'tema34', vote: 'long', strength: 0.8 },
      { technique: 'genel', vote: 'long', strength: 0.8 },
    ]);
    const diffGroup = aggregateConfluence([
      { technique: 'ema34', vote: 'long', strength: 0.8 }, // trend_ma
      { technique: 'rsi', vote: 'long', strength: 0.8 }, // momentum
      { technique: 'smc', vote: 'long', strength: 0.8 }, // structure
    ]);
    expect(diffGroup.rawQuality).toBeGreaterThan(sameGroup.rawQuality);
    expect(sameGroup.direction).toBe('long');
    expect(diffGroup.direction).toBe('long');
  });
});

describe('confluence — çelişki ve yön', () => {
  test('zıt oylar net’i sıfıra çeker', () => {
    const r = aggregateConfluence([
      { technique: 'ema34', vote: 'long', strength: 0.8 },
      { technique: 'tema34', vote: 'short', strength: 0.8 },
    ]);
    expect(Math.abs(r.evidence)).toBeLessThan(0.2);
    expect(r.rawQuality).toBeLessThan(0.2);
  });
  test('tümü aynı yön: agreement = 1', () => {
    const r = aggregateConfluence([
      { technique: 'ema34', vote: 'long', strength: 0.7 },
      { technique: 'rsi', vote: 'long', strength: 0.7 },
      { technique: 'smc', vote: 'long', strength: 0.7 },
    ]);
    expect(r.agreement).toBeCloseTo(1, 6);
    expect(r.direction).toBe('long');
  });
  test('boş / neutral güvenli', () => {
    const r = aggregateConfluence([{ technique: 'x', vote: 'neutral' }]);
    expect(r.direction).toBe('neutral');
    expect(r.rawQuality).toBe(0);
  });
});
