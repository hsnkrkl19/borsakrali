/**
 * GOLDEN TESTS — mtfBacktestService.evaluateForward + aggregateStats
 * Faz 3 / D3+D5. Backtest çıkış (forward) mantığını kilitler:
 *   - long/short stop/target getiri hesabı
 *   - AYNI bar'da stop+target → TUTUCU: stop önce (look-ahead/optimism önleme)
 *   - still_running / no_levels / no_future_data
 * Ağır servis bağımlılıkları mock'lanır (modül izole yüklensin); test edilen
 * fonksiyonlar saf — mock'lar sonucu etkilemez.
 */
jest.mock('../../src/services/cryptoSignalsService', () => ({ getTopNTradable: async () => [] }));
jest.mock('../../src/services/cryptoKlines', () => ({ fetchCandlesHistorical: async () => [], fetchCandlesForward: async () => [] }));
jest.mock('../../src/services/mtfScorer', () => ({ scoreSingleTimeframe: () => ({}) }));
jest.mock('../../src/services/mtfPatternDetection', () => ({
  detectAllPatterns: () => ({}), detectDivergence: () => ({}),
  detectVolatilityRegime: () => ({}), detectMomentumAcceleration: () => ({}),
}));
jest.mock('../../src/services/mtfCalibrationService', () => ({ updateFromBacktest: () => ({}), save: () => true, getSnapshot: () => ({}) }));
jest.mock('../../src/utils/logger', () => ({ info() {}, error() {}, warn() {} }));

const { evaluateForward, aggregateStats } = require('../../src/services/mtfBacktestService');

describe('evaluateForward — long', () => {
  const sig = { entry: 100, stop: 90, target1: 110, direction: 'long' };
  test('hedef vuruldu → +%10', () => {
    const ev = evaluateForward(sig, [{ low: 95, high: 111, close: 108 }]);
    expect(ev.outcome).toBe('hit_target');
    expect(ev.returnPct).toBeCloseTo(10, 2);
    expect(ev.bars).toBe(1);
  });
  test('stop vuruldu → -%10', () => {
    const ev = evaluateForward(sig, [{ low: 89, high: 105, close: 95 }]);
    expect(ev.outcome).toBe('hit_stop');
    expect(ev.returnPct).toBeCloseTo(-10, 2);
  });
  test('AYNI bar stop+target → TUTUCU stop önce', () => {
    const ev = evaluateForward(sig, [{ low: 89, high: 111, close: 100 }]);
    expect(ev.outcome).toBe('hit_stop');
    expect(ev.returnPct).toBeCloseTo(-10, 2);
  });
  test('horizon sonuna kadar açık → still_running, close ile getiri', () => {
    const ev = evaluateForward(sig, [{ low: 96, high: 104, close: 103 }]);
    expect(ev.outcome).toBe('still_running');
    expect(ev.returnPct).toBeCloseTo(3, 2);
  });
});

describe('evaluateForward — short', () => {
  const sig = { entry: 100, stop: 110, target1: 90, direction: 'short' };
  test('hedef (aşağı) vuruldu → +%10', () => {
    const ev = evaluateForward(sig, [{ low: 89, high: 105, close: 92 }]);
    expect(ev.outcome).toBe('hit_target');
    expect(ev.returnPct).toBeCloseTo(10, 2);
  });
  test('stop (yukarı) vuruldu → -%10', () => {
    const ev = evaluateForward(sig, [{ low: 95, high: 111, close: 108 }]);
    expect(ev.outcome).toBe('hit_stop');
    expect(ev.returnPct).toBeCloseTo(-10, 2);
  });
});

describe('evaluateForward — edge', () => {
  test('seviye yoksa → no_levels', () => {
    expect(evaluateForward({ entry: 100, direction: 'long' }, [{ low: 1, high: 2, close: 1 }]).outcome).toBe('no_levels');
  });
  test('gelecek veri yoksa → no_future_data', () => {
    expect(evaluateForward({ entry: 100, stop: 90, target1: 110, direction: 'long' }, []).outcome).toBe('no_future_data');
  });
});

describe('aggregateStats', () => {
  test('karışık sonuç → winRate kapalı işlemler üzerinden, avgReturn tüm sinyaller', () => {
    const s = aggregateStats([
      { outcome: 'hit_target', returnPct: 10 },
      { outcome: 'hit_stop', returnPct: -10 },
      { outcome: 'still_running', returnPct: 3 },
    ]);
    expect(s.total).toBe(3);
    expect(s.hitTarget).toBe(1);
    expect(s.hitStop).toBe(1);
    expect(s.winRate).toBeCloseTo(50, 1);      // 1/(1+1)
    expect(s.avgReturn).toBeCloseTo(1, 2);      // (10-10+3)/3
  });
  test('boş → sıfırlar', () => {
    const s = aggregateStats([]);
    expect(s.total).toBe(0);
    expect(s.winRate).toBe(0);
  });
});
