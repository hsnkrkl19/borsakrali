'use strict';
const ind = require('../../src/services/signalQuality/indicators');
const { buildTrend, buildChop } = require('./_helpers');

describe('indicators — EMA', () => {
  test('sabit seride EMA sabittir', () => {
    const e = ind.ema([5, 5, 5, 5, 5, 5], 3);
    expect(ind.lastNonNull(e)).toBeCloseTo(5, 6);
  });
  test('artan seride EMA artar', () => {
    const e = ind.ema([1, 2, 3, 4, 5, 6, 7, 8], 3);
    const vals = e.filter((v) => v !== null);
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
  });
});

describe('indicators — ATR', () => {
  test('pozitif ve warmup öncesi null', () => {
    const c = buildTrend(40);
    const a = ind.atr(c, 14);
    expect(a[0]).toBeNull();
    expect(ind.lastNonNull(a)).toBeGreaterThan(0);
  });
});

describe('indicators — ADX / Choppiness ayrımı', () => {
  test('trend: yüksek ADX, düşük choppiness', () => {
    const c = buildTrend(80);
    const adxLast = ind.lastNonNull(ind.adx(c, 14).adx);
    const chopLast = ind.lastNonNull(ind.choppiness(c, 14));
    expect(adxLast).toBeGreaterThan(30);
    expect(chopLast).toBeLessThan(40);
  });

  test('yatay: düşük ADX, yüksek choppiness', () => {
    const c = buildChop(80);
    const adxLast = ind.lastNonNull(ind.adx(c, 14).adx);
    const chopLast = ind.lastNonNull(ind.choppiness(c, 14));
    expect(adxLast).toBeLessThan(20);
    expect(chopLast).toBeGreaterThan(55);
  });

  test('trend ADX > yatay ADX ve trend CI < yatay CI', () => {
    const t = buildTrend(80);
    const h = buildChop(80);
    const adxT = ind.lastNonNull(ind.adx(t, 14).adx);
    const adxH = ind.lastNonNull(ind.adx(h, 14).adx);
    const ciT = ind.lastNonNull(ind.choppiness(t, 14));
    const ciH = ind.lastNonNull(ind.choppiness(h, 14));
    expect(adxT).toBeGreaterThan(adxH);
    expect(ciT).toBeLessThan(ciH);
  });

  test('+DI yükselen trendde -DI’dan büyük', () => {
    const c = buildTrend(80, { dir: 1 });
    const o = ind.adx(c, 14);
    expect(ind.lastNonNull(o.plusDI)).toBeGreaterThan(ind.lastNonNull(o.minusDI));
  });
});
