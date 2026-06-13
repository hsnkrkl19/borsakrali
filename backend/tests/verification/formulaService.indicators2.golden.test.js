/**
 * GOLDEN TESTS (2) — formulaService kalan indikatörler (kapsam genişletme, D3)
 * Hand-derivable olanlar kesin değer; ADX/Supertrend gibi kompleksler için
 * davranış-özellik (property) assert'leri (sign/direction/aralık + crash yok).
 */
const F = require('../../src/services/formulaService');

describe('calculateAllEMAs', () => {
  test('sabit seri → tüm EMA = sabit, ema200 null (yetersiz)', () => {
    const r = F.calculateAllEMAs(new Array(60).fill(10));
    expect(r.ema5).toBeCloseTo(10, 4);
    expect(r.ema9).toBeCloseTo(10, 4);
    expect(r.ema21).toBeCloseTo(10, 4);
    expect(r.ema50).toBeCloseTo(10, 4);
    expect(r.ema200).toBeNull();
  });
});

describe('calculatePriceSaturation', () => {
  const emas = { ema5: 10, ema9: 12, ema21: 14, ema50: 16, ema200: 20 };
  test('orta → 50', () => expect(F.calculatePriceSaturation(15, emas)).toBe(50));
  test('üst sınır clamp → 100', () => expect(F.calculatePriceSaturation(25, emas)).toBe(100));
  test('alt sınır clamp → 0', () => expect(F.calculatePriceSaturation(5, emas)).toBe(0));
});

describe('calculateStochasticFull', () => {
  test('elle türetilmiş K/D (range sabit 100)', () => {
    const highs = new Array(17).fill(100);
    const lows = new Array(17).fill(0);
    const closes = [...new Array(13).fill(0), 50, 60, 70, 80];
    const r = F.calculateStochasticFull(highs, lows, closes, 14, 3);
    expect(r.k).toBeCloseTo(80, 2);   // son %K = close (range 0-100)
    expect(r.d).toBeCloseTo(70, 2);   // 3-SMA(60,70,80)
  });
});

describe('calculateFibonacciLevels', () => {
  test('swingHigh=100 swingLow=50 → seviyeler', () => {
    const highs = new Array(50).fill(100);
    const lows = new Array(50).fill(50);
    const closes = new Array(50).fill(76);
    const r = F.calculateFibonacciLevels(highs, lows, closes);
    expect(r.swingHigh).toBe(100);
    expect(r.swingLow).toBe(50);
    expect(r.levels.level_500).toBeCloseTo(75, 2);
    expect(r.levels.level_236).toBeCloseTo(61.8, 1);
    expect(r.levels.level_618).toBeCloseTo(80.9, 1);
  });
  test('yetersiz veri (<50) → 0/0', () => {
    const r = F.calculateFibonacciLevels([1, 2], [1, 2], [1, 2]);
    expect(r.support).toBe(0);
    expect(r.resistance).toBe(0);
  });
});

describe('calculateIchimoku', () => {
  test('sabit high/low → tenkan=kijun=senkou=75, fiyat üstte → bullish', () => {
    const highs = new Array(60).fill(100);
    const lows = new Array(60).fill(50);
    const closes = new Array(60).fill(80);
    const r = F.calculateIchimoku(highs, lows, closes);
    expect(r.tenkanSen).toBeCloseTo(75, 2);
    expect(r.kijunSen).toBeCloseTo(75, 2);
    expect(r.senkouSpanA).toBeCloseTo(75, 2);
    expect(r.senkouSpanB).toBeCloseTo(75, 2);
    expect(r.aboveCloud).toBe(true);
    expect(r.signal).toBe('bullish');
  });
  test('yetersiz veri → null', () => {
    expect(F.calculateIchimoku([1, 2], [1, 2], [1, 2])).toBeNull();
  });
});

describe('calculateADX — net yükseliş trendi (property)', () => {
  const n = 41;
  const highs = Array.from({ length: n }, (_, i) => 100 + i);
  const lows = Array.from({ length: n }, (_, i) => 95 + i);
  const closes = Array.from({ length: n }, (_, i) => 98 + i);
  const r = F.calculateADX(highs, lows, closes, 14);
  test('non-null + geçerli aralık', () => {
    expect(r).not.toBeNull();
    expect(r.adx).toBeGreaterThanOrEqual(0);
    expect(r.adx).toBeLessThanOrEqual(100);
  });
  test('yükseliş → +DI > -DI, bullish', () => {
    expect(r.plusDI).toBeGreaterThan(r.minusDI);
    expect(r.bullish).toBe(true);
  });
  test('yetersiz veri → null', () => {
    expect(F.calculateADX([1, 2], [1, 2], [1, 2], 14)).toBeNull();
  });
});

describe('calculateSupertrend — yükseliş trendi (property)', () => {
  const n = 30;
  const highs = Array.from({ length: n }, (_, i) => 100 + i * 2);
  const lows = Array.from({ length: n }, (_, i) => 98 + i * 2);
  const closes = Array.from({ length: n }, (_, i) => 99 + i * 2);
  test('yükselişte bullish + direction 1', () => {
    const r = F.calculateSupertrend(highs, lows, closes, 10, 3);
    expect(r).not.toBeNull();
    expect(r.isBullish).toBe(true);
    expect(r.direction).toBe(1);
  });
  test('yetersiz veri → null', () => {
    expect(F.calculateSupertrend([1, 2, 3], [1, 2, 3], [1, 2, 3], 10, 3)).toBeNull();
  });
});

describe('detectSupportResistance / detectRSIDivergence — yapı + warm-up', () => {
  test('detectSupportResistance geçerli girdide {support,resistance} dizileri döner', () => {
    const prices = Array.from({ length: 60 }, (_, i) => 50 + Math.round(10 * Math.sin(i / 3)));
    const r = F.detectSupportResistance(prices, 5);
    expect(Array.isArray(r.support)).toBe(true);
    expect(Array.isArray(r.resistance)).toBe(true);
  });
  test('detectSupportResistance yetersiz veri → boş diziler', () => {
    const r = F.detectSupportResistance([1, 2, 3], 20);
    expect(r).toEqual({ support: [], resistance: [] });
  });
  test('detectRSIDivergence yetersiz veri → null', () => {
    expect(F.detectRSIDivergence([1, 2, 3], 14)).toBeNull();
  });
  test('detectRSIDivergence yeterli veride 3 alan döner', () => {
    const prices = Array.from({ length: 40 }, (_, i) => 100 + i);
    const r = F.detectRSIDivergence(prices, 14);
    expect(r).toHaveProperty('bullishDivergence');
    expect(r).toHaveProperty('bearishDivergence');
    expect(r).toHaveProperty('currentRSI');
  });
});
