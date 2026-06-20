/**
 * GOLDEN TESTS — ta4j tarzı TA katmanı (src/services/ta4j/taLibrary.js)
 *
 * Bu katman `trading-signals` (ta4j-eşi, akışkan indikatörler) sarmalayıcısıdır ve
 * MEVCUT canlı sinyal indikatörlerinden bağımsızdır. Beklenen değerler ya elle
 * türetilmiş kesin sonuçlardır ya da kanonik formül tanımından gelir.
 *
 * GEÇERSE: sarmalayıcı girdi-şekli eşlemesi, ısınma davranışı ve katalog
 * bütünlüğü doğrulanmış olur; regresyonlar yakalanır.
 */
const ta = require('../../src/services/ta4j/taLibrary');

// Kapanış dizisinden sentetik OHLCV mumları (high=+1, low=-1, volume=100).
const fromCloses = (closes) =>
  closes.map((c, i) => ({ time: i, open: c, high: c + 1, low: c - 1, close: c, volume: 100 }));

describe('katalog bütünlüğü', () => {
  test('listIndicators sayısı INDICATORS ile aynı ve her giriş tam', () => {
    const list = ta.listIndicators();
    expect(list.length).toBe(Object.keys(ta.INDICATORS).length);
    for (const it of list) {
      expect(typeof it.key).toBe('string');
      expect(typeof it.label).toBe('string');
      expect(ta.MAPPERS[it.kind]).toBeInstanceOf(Function); // geçerli girdi-şekli
      expect(it.params).toBeDefined();
    }
  });

  test('her indikatör 60 mumluk seride hatasız çalışır (sweep)', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 5 + i * 0.2);
    const candles = fromCloses(closes.map((x) => +x.toFixed(3)));
    for (const key of Object.keys(ta.INDICATORS)) {
      const r = ta.compute(key, candles);
      expect(r.key).toBe(key);
      expect(Array.isArray(r.values)).toBe(true);
      expect(r.values.length).toBe(candles.length); // seri girdiyle hizalı
    }
  });

  test('bilinmeyen indikatör → hata', () => {
    expect(() => ta.compute('yokboyle', fromCloses([1, 2, 3]))).toThrow();
  });
});

describe('hareketli ortalamalar — kesin değerler', () => {
  test('SMA(3) [2,4,6,8,10] → [null,null,4,6,8], last=8', () => {
    const r = ta.compute('sma', fromCloses([2, 4, 6, 8, 10]), { period: 3 });
    expect(r.values).toEqual([null, null, 4, 6, 8]);
    expect(r.last).toBe(8);
    expect(typeof r.last).toBe('number'); // düz sayı (big.js sarmalayıcı yok)
  });

  test('sabit seri → EMA/WMA/TEMA = sabit', () => {
    const flat = fromCloses(new Array(40).fill(100));
    expect(ta.compute('ema', flat, { period: 10 }).last).toBeCloseTo(100, 6);
    expect(ta.compute('wma', flat, { period: 10 }).last).toBeCloseTo(100, 6);
    expect(ta.compute('tema', flat, { period: 5 }).last).toBeCloseTo(100, 6); // 3c-3c+c=c
  });
});

describe('momentum', () => {
  test('RSI: tüm artış → 100, tüm düşüş → 0', () => {
    const inc = fromCloses(Array.from({ length: 30 }, (_, i) => i + 1));
    const dec = fromCloses(Array.from({ length: 30 }, (_, i) => 30 - i));
    expect(ta.compute('rsi', inc, { period: 14 }).last).toBe(100);
    expect(ta.compute('rsi', dec, { period: 14 }).last).toBe(0);
  });

  test('MACD bileşik nesne şekli { macd, signal, histogram }', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const r = ta.compute('macd', fromCloses(closes));
    expect(r.composite).toBe(true);
    expect(r.last).toHaveProperty('macd');
    expect(r.last).toHaveProperty('signal');
    expect(r.last).toHaveProperty('histogram');
  });

  test('Stochastic bileşik nesne şekli { stochK, stochD }', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 8);
    const r = ta.compute('stochastic', fromCloses(closes));
    expect(r.last).toHaveProperty('stochK');
    expect(r.last).toHaveProperty('stochD');
  });
});

describe('volatilite — HLC girdisi', () => {
  test('sabit kapanış, sabit TR=2 → ATR=2', () => {
    const flat = fromCloses(new Array(30).fill(100)); // high=101 low=99 → TR=2
    expect(ta.compute('atr', flat, { period: 14 }).last).toBeCloseTo(2, 6);
  });

  test('Bollinger sabit seri → bantlar çakışır (stddev 0)', () => {
    const flat = fromCloses(new Array(30).fill(100));
    const bb = ta.compute('bb', flat, { period: 20, multiplier: 2 }).last;
    expect(bb.middle).toBeCloseTo(100, 6);
    expect(bb.upper).toBeCloseTo(100, 6);
    expect(bb.lower).toBeCloseTo(100, 6);
  });
});

describe('hacim — OHLCV girdisi', () => {
  test('OBV: art arda yükseliş, hacim 100 → birikimli +300', () => {
    const r = ta.compute('obv', fromCloses([100, 101, 102, 103]), { period: 2 });
    expect(r.last).toBe(300); // 3 yukarı adım × 100
  });
});

describe('ısınma (warm-up) davranışı', () => {
  test('yetersiz veri → tüm seri null, last=null, isStable=false', () => {
    const r = ta.compute('sma', fromCloses([1, 2, 3]), { period: 5 });
    expect(r.values).toEqual([null, null, null]);
    expect(r.last).toBeNull();
    expect(r.isStable).toBe(false);
  });

  test('candles dizi değilse → hata', () => {
    expect(() => ta.compute('sma', null)).toThrow();
  });
});

describe('computeAll + analyze', () => {
  const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 6 + i * 0.1);
  const candles = fromCloses(closes.map((x) => +x.toFixed(3)));

  test('computeAll istenen anahtarların son değerlerini döndürür', () => {
    const snap = ta.computeAll(candles, { keys: ['rsi', 'ema', 'atr'] });
    expect(Object.keys(snap).sort()).toEqual(['atr', 'ema', 'rsi']);
    expect(typeof snap.rsi).toBe('number');
  });

  test('analyze → overall bull/bear/neutral kümesinde, signals dizi', () => {
    const rep = ta.analyze(candles);
    expect(['bullish', 'bearish', 'neutral']).toContain(rep.overall);
    expect(Array.isArray(rep.signals)).toBe(true);
    expect(rep.close).toBeCloseTo(candles[candles.length - 1].close, 6);
  });
});
