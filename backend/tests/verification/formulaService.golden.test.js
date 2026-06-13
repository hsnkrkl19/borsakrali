/**
 * GOLDEN TESTS — formulaService.js (teknik indikatörler + temel skorlar)
 * Faz 1 doğrulama harness'i. Beklenen değerler ya elle türetilmiş kesin
 * sonuçlardır ya da kanonik formül tanımından gelir. Tolerans: pre-rounded
 * çıktılar için toBeCloseTo(x, 2).
 *
 * Amaç: Bu testler GEÇERSE çekirdek indikatör matematiği doğrulanmış olur ve
 * gelecekteki regresyonlar yakalanır. GEÇMEZSE → Faz 3'te kök-neden + tamir.
 */
const F = require('../../src/services/formulaService');

describe('EMA (calculateEMA)', () => {
  test('SMA-seeded EMA — elle türetilmiş kesin değer', () => {
    // seed=(2+4+6)/3=4, k=0.5 → i3: 8*.5+4*.5=6 → i4: 10*.5+6*.5=8
    expect(F.calculateEMA([2, 4, 6, 8, 10], 3)).toBeCloseTo(8, 4);
  });
  test('sabit seri → EMA = sabit', () => {
    expect(F.calculateEMA([5, 5, 5, 5, 5], 3)).toBeCloseTo(5, 4);
  });
  test('yetersiz veri → null (warm-up)', () => {
    expect(F.calculateEMA([1, 2], 3)).toBeNull();
    expect(F.calculateEMA(null, 3)).toBeNull();
  });
  test('calculateEMASeries — başta null dolgu + doğru kuyruk', () => {
    expect(F.calculateEMASeries([2, 4, 6, 8, 10], 3)).toEqual([null, null, 4, 6, 8]);
  });
});

describe('RSI (calculateRSI) — Wilder', () => {
  test('period=2 elle türetilmiş → 75.00', () => {
    // [10,11,10,11]: init avgGain=.5 avgLoss=.5 → step avgGain=.75 avgLoss=.25 → RS=3 → RSI=75
    expect(F.calculateRSI([10, 11, 10, 11], 2)).toBeCloseTo(75, 2);
  });
  test('tüm artışlar → 100 (avgLoss=0)', () => {
    expect(F.calculateRSI([1, 2, 3, 4, 5, 6], 3)).toBe(100);
  });
  test('tüm düşüşler → 0', () => {
    expect(F.calculateRSI([6, 5, 4, 3, 2, 1], 3)).toBeCloseTo(0, 2);
  });
  test('yetersiz veri → null', () => {
    expect(F.calculateRSI([1, 2, 3], 5)).toBeNull();
    expect(F.calculateRSI(null)).toBeNull();
  });
});

describe('MACD (calculateMACD)', () => {
  test('sabit seri → macd/signal/histogram = 0', () => {
    const flat = new Array(40).fill(100);
    const m = F.calculateMACD(flat);
    expect(m.macd).toBeCloseTo(0, 4);
    expect(m.signal).toBeCloseTo(0, 4);
    expect(m.histogram).toBeCloseTo(0, 4);
  });
  test('artan seride macd > 0 (fast EMA, slow EMA üstünde)', () => {
    const rising = Array.from({ length: 60 }, (_, i) => 100 + i);
    const m = F.calculateMACD(rising);
    expect(m.macd).toBeGreaterThan(0);
  });
  test('yetersiz veri → null', () => {
    expect(F.calculateMACD(new Array(10).fill(1))).toBeNull();
  });
});

describe('ATR (calculateATR) — Wilder', () => {
  test('sabit bar genişliği → ATR = aralık', () => {
    const h = [12, 12, 12, 12], l = [10, 10, 10, 10], c = [11, 11, 11, 11];
    expect(F.calculateATR(h, l, c, 2)).toBeCloseTo(2, 2);
  });
  test('yetersiz veri → null', () => {
    expect(F.calculateATR([1, 2], [0, 1], [1, 1], 14)).toBeNull();
  });
});

describe('Bollinger Bands (calculateBollingerBands) — popülasyon σ', () => {
  test('[1..20], period=20 → elle türetilmiş', () => {
    const prices = Array.from({ length: 20 }, (_, i) => i + 1);
    const bb = F.calculateBollingerBands(prices, 20, 2);
    // mean=10.5, popVar=33.25, σ=5.766281
    expect(bb.middle).toBeCloseTo(10.5, 2);
    expect(bb.upper).toBeCloseTo(22.03, 2);
    expect(bb.lower).toBeCloseTo(-1.03, 2);
    expect(bb.bandwidth).toBeCloseTo(219.67, 1);
  });
  test('sabit seri → σ=0, squeeze=true', () => {
    const bb = F.calculateBollingerBands(new Array(20).fill(50), 20, 2);
    expect(bb.upper).toBeCloseTo(50, 2);
    expect(bb.lower).toBeCloseTo(50, 2);
    expect(bb.bandwidth).toBeCloseTo(0, 2);
    expect(bb.squeezed).toBe(true);
  });
  test('yetersiz veri → null', () => {
    expect(F.calculateBollingerBands([1, 2, 3], 20)).toBeNull();
  });
});

describe('Stochastic (calculateStochastic) — son %K', () => {
  test('orta nokta → 50', () => {
    expect(F.calculateStochastic([10, 10, 10], [0, 0, 0], [5, 5, 5], 3)).toBeCloseTo(50, 2);
  });
  test('tepe → 100, dip → 0', () => {
    expect(F.calculateStochastic([10, 10, 10], [0, 0, 0], [5, 5, 10], 3)).toBeCloseTo(100, 2);
    expect(F.calculateStochastic([10, 10, 10], [0, 0, 0], [5, 5, 0], 3)).toBeCloseTo(0, 2);
  });
  test('high===low → 50 (bölme-sıfır koruması)', () => {
    expect(F.calculateStochastic([5, 5, 5], [5, 5, 5], [5, 5, 5], 3)).toBe(50);
  });
});

describe('Williams %R (calculateWilliamsR)', () => {
  test('tepe → 0, dip → -100', () => {
    expect(F.calculateWilliamsR([10, 10, 10], [0, 0, 0], [5, 5, 10], 3)).toBeCloseTo(0, 2);
    expect(F.calculateWilliamsR([10, 10, 10], [0, 0, 0], [5, 5, 0], 3)).toBeCloseTo(-100, 2);
  });
  test('high===low → -50 (bölme-sıfır koruması)', () => {
    expect(F.calculateWilliamsR([5, 5, 5], [5, 5, 5], [5, 5, 5], 3)).toBe(-50);
  });
});

describe('OBV (calculateOBV)', () => {
  test('elle türetilmiş → 300', () => {
    // +200 (11>10), -300 (10<11), +400 (12>10) = 300
    expect(F.calculateOBV([10, 11, 10, 12], [100, 200, 300, 400])).toBe(300);
  });
});

describe('VWAP (calculateVWAP)', () => {
  test('hacim ağırlıklı ortalama → 3.50', () => {
    // tp=[2,4], vol=[1,3] → (2*1+4*3)/4 = 14/4 = 3.5
    expect(F.calculateVWAP([2, 4], [2, 4], [2, 4], [1, 3])).toBeCloseTo(3.5, 2);
  });
  test('toplam hacim 0 → son kapanışa düşer', () => {
    expect(F.calculateVWAP([2, 4], [2, 4], [2, 4], [0, 0])).toBeCloseTo(4, 2);
  });
});

describe('CCI (calculateCCI)', () => {
  test('sabit tipik fiyat → meanDev 0 → 0', () => {
    const arr = new Array(20).fill(5);
    expect(F.calculateCCI(arr, arr, arr, 20)).toBe(0);
  });
});

describe('Altman Z-Score', () => {
  test('elle türetilmiş → 2.94 (grey zone)', () => {
    const z = F.calculateAltmanZScore({
      workingCapital: 20, totalAssets: 100, retainedEarnings: 30,
      ebit: 10, marketValueEquity: 50, totalLiabilities: 40, sales: 120,
    });
    expect(z).toBeCloseTo(2.94, 2);
    expect(F.interpretAltmanZScore(z).zone).toBe('grey');
  });
  test('totalAssets 0 → null (bölme-sıfır)', () => {
    expect(F.calculateAltmanZScore({ totalAssets: 0 })).toBeNull();
  });
  test('zone sınırları', () => {
    expect(F.interpretAltmanZScore(3.5).zone).toBe('safe');
    expect(F.interpretAltmanZScore(1.0).zone).toBe('distress');
  });
});

describe('Piotroski F-Score', () => {
  test('9 kriterin tümü geçer → 9', () => {
    const current = { netIncome: 10, roa: 5, operatingCashFlow: 15, longTermDebt: 50, currentRatio: 2, sharesOutstanding: 100, grossMargin: 40, assetTurnover: 1.2 };
    const previous = { longTermDebt: 60, currentRatio: 1.5, sharesOutstanding: 100, grossMargin: 35, assetTurnover: 1.0 };
    expect(F.calculatePiotroskiScore(current, previous)).toBe(9);
    expect(F.interpretPiotroskiScore(9).level).toBe('strong');
  });
  test('tümü başarısız → 0', () => {
    const current = { netIncome: -10, roa: -5, operatingCashFlow: -15, longTermDebt: 70, currentRatio: 1.0, sharesOutstanding: 120, grossMargin: 30, assetTurnover: 0.8 };
    const previous = { longTermDebt: 60, currentRatio: 1.5, sharesOutstanding: 100, grossMargin: 35, assetTurnover: 1.0 };
    expect(F.calculatePiotroskiScore(current, previous)).toBe(0);
    expect(F.interpretPiotroskiScore(0).level).toBe('weak');
  });
});

describe('Beneish M-Score', () => {
  test('tüm oranlar=1, TATA=0 → katsayı toplamı ≈ 2.526', () => {
    const same = {
      receivables: 10, sales: 100, grossProfit: 30, currentAssets: 40, ppe: 60,
      totalAssets: 200, depreciation: 5, sga: 20, longTermDebt: 50,
      currentLiabilities: 30, netIncome: 10, operatingCashFlow: 10,
    };
    expect(F.calculateBeneishMScore({ ...same }, { ...same })).toBeCloseTo(2.526, 2);
  });
});
