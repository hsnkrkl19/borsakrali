/**
 * GOLDEN TESTS — ALTIN · Yön (Bias) Motoru (altinBias).
 *
 * Kilitlenen davranışlar:
 *   1) Temiz YÜKSELİŞ haftalık fixture → weeklyBias.dir 'bull' (EMA100 üstü).
 *   2) Temiz DÜŞÜŞ haftalık fixture → weeklyBias.dir 'bear' (EMA100 altı).
 *   3) weeklyBiasAt: yeterli geçmiş olan bir zamanda doğru yön; <110 bar → 'neutral'.
 *   4) combinedBias: haftalık+günlük aynı yönde → alignment 'tam'; yön = haftalık.
 *   5) DETERMİNİZM: aynı mumlar iki kez → birebir aynı sonuç.
 *
 * Fixture üreticisi SAF + DETERMİNİSTİK: tohumlu LCG (Date.now/Math.random YOK).
 * Mumlar doğrudan saf fonksiyonlara geçer → ağ YOK, hermetik.
 */

const altinBias = require('../../src/services/altin/altinBias');

// Deterministik sözde-rasgele (LCG) — tohum başına aynı dizi.
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
}

// Tohumlu, sabit-eğilimli mum fixture'ı. drift>0 yükseliş, drift<0 düşüş.
// Mum: { time(unix sn), open, high, low, close, volume } eski→yeni.
function trend(seed, start, drift, n, step) {
  const rnd = lcg(seed);
  const c = [];
  const t0 = 1500000000;
  let price = start;
  for (let i = 0; i < n; i++) {
    const wob = (rnd() - 0.5) * Math.abs(drift) * 0.6;
    const open = price;
    price = +(price + drift + wob).toFixed(4);
    const close = price;
    const high = +(Math.max(open, close) + Math.abs(wob) * 0.5 + Math.abs(drift) * 0.3).toFixed(4);
    const low = +(Math.min(open, close) - Math.abs(wob) * 0.5 - Math.abs(drift) * 0.3).toFixed(4);
    c.push({ time: t0 + i * step, open: +open.toFixed(4), high, low, close, volume: 1000 + Math.floor(rnd() * 200) });
  }
  return c;
}

const WK = 7 * 86400;
const WEEKLY_UP = trend(101, 1000, 5, 160, WK);     // güçlü yükseliş
const WEEKLY_DN = trend(202, 3000, -8, 160, WK);    // güçlü düşüş
const DAILY_UP = trend(303, 1500, 4, 120, 86400);   // günlük yükseliş

describe('altinBias.weeklyBias — yön tespiti', () => {
  test('temiz YÜKSELİŞ → dir bull, fiyat EMA100 üstü, strength>0', () => {
    const w = altinBias.weeklyBias(WEEKLY_UP);
    expect(w.dir).toBe('bull');
    expect(w.close).toBeGreaterThan(w.ema100);
    expect(w.distPct).toBeGreaterThan(0);
    expect(w.strength).toBeGreaterThan(0);
    expect(w.strength).toBeLessThanOrEqual(1);
  });

  test('temiz DÜŞÜŞ → dir bear, fiyat EMA100 altı', () => {
    const w = altinBias.weeklyBias(WEEKLY_DN);
    expect(w.dir).toBe('bear');
    expect(w.close).toBeLessThan(w.ema100);
    expect(w.distPct).toBeLessThan(0);
  });

  test('<110 bar → neutral (yetersiz veri)', () => {
    const w = altinBias.weeklyBias(WEEKLY_UP.slice(0, 50));
    expect(w.dir).toBe('neutral');
    expect(w.strength).toBe(0);
  });
});

describe('altinBias.dailyBias — günlük teyit', () => {
  test('günlük yükseliş → dir bull, EMA50 üstü', () => {
    const d = altinBias.dailyBias(DAILY_UP);
    expect(d.dir).toBe('bull');
    expect(typeof d.ema50).toBe('number');
  });

  test('<60 bar → neutral', () => {
    expect(altinBias.dailyBias(DAILY_UP.slice(0, 40)).dir).toBe('neutral');
  });
});

describe('altinBias.weeklyBiasAt — belirli zamandaki yön', () => {
  test('yeterli geçmiş olan son barda bull', () => {
    const tLast = WEEKLY_UP[WEEKLY_UP.length - 1].time;
    expect(altinBias.weeklyBiasAt(WEEKLY_UP, tLast)).toBe('bull');
  });

  test('orta bir barda (idx 120) bull', () => {
    expect(altinBias.weeklyBiasAt(WEEKLY_UP, WEEKLY_UP[120].time)).toBe('bull');
  });

  test('<110 bar geçmiş (erken zaman) → neutral', () => {
    expect(altinBias.weeklyBiasAt(WEEKLY_UP, WEEKLY_UP[50].time)).toBe('neutral');
  });

  test('düşüş serisinde son barda bear', () => {
    const tLast = WEEKLY_DN[WEEKLY_DN.length - 1].time;
    expect(altinBias.weeklyBiasAt(WEEKLY_DN, tLast)).toBe('bear');
  });
});

describe('altinBias.combinedBias — haftalık+günlük birleşimi', () => {
  test('haftalık bull + günlük bull → alignment "tam", yön bull', () => {
    const cb = altinBias.combinedBias(WEEKLY_UP, DAILY_UP);
    expect(cb.dir).toBe('bull');
    expect(cb.tradeBias).toBe('bull');
    expect(cb.alignment).toBe('tam');     // her iki TF aynı yönde
    expect(cb.weekly.dir).toBe('bull');
    expect(cb.daily.dir).toBe('bull');
  });

  test('haftalık bull + günlük yetersiz (neutral) → alignment "kısmi"', () => {
    const cb = altinBias.combinedBias(WEEKLY_UP, DAILY_UP.slice(0, 40));
    expect(cb.dir).toBe('bull');
    expect(cb.alignment).toBe('kısmi');   // günlük teyit yok → tam değil
  });

  test('haftalık yetersiz (neutral) → alignment "belirsiz"', () => {
    const cb = altinBias.combinedBias(WEEKLY_UP.slice(0, 50), DAILY_UP);
    expect(cb.dir).toBe('neutral');
    expect(cb.alignment).toBe('belirsiz');
  });
});

describe('altinBias — DETERMİNİZM', () => {
  test('aynı mumlar iki kez → birebir aynı sonuç', () => {
    expect(altinBias.weeklyBias(WEEKLY_UP)).toEqual(altinBias.weeklyBias(WEEKLY_UP));
    expect(altinBias.combinedBias(WEEKLY_UP, DAILY_UP)).toEqual(altinBias.combinedBias(WEEKLY_UP, DAILY_UP));
    expect(altinBias.weeklyBiasAt(WEEKLY_UP, WEEKLY_UP[130].time)).toBe(altinBias.weeklyBiasAt(WEEKLY_UP, WEEKLY_UP[130].time));
  });
});
