'use strict';
const { Calibrator, isotonicNonDecreasing } = require('../../src/services/signalQuality/calibration');

describe('calibration — fallback (veri yok)', () => {
  test('monoton lojistik: yüksek skor > düşük skor', () => {
    const c = new Calibrator();
    const hi = c.probability('eng:s:long', 0.9);
    const lo = c.probability('eng:s:long', 0.1);
    expect(hi.calibrated).toBe(false);
    expect(hi.source).toBe('fallback');
    expect(hi.p).toBeGreaterThan(lo.p);
  });
});

describe('calibration — öğrenme ve monotonluk', () => {
  function train(c, ns) {
    // düşük skor kovaları çoğunlukla kaybeder, yüksek kovalar kazanır
    for (let k = 0; k < 60; k++) {
      c.record(ns, 0.1, k % 5 === 0); // ~%20 kazanç
      c.record(ns, 0.5, k % 2 === 0); // ~%50
      c.record(ns, 0.9, k % 5 !== 0); // ~%80
    }
  }
  test('yüksek skor kalibre olasılığı > düşük skor', () => {
    const c = new Calibrator();
    train(c, 'eng:s:long');
    const p1 = c.probability('eng:s:long', 0.1).p;
    const p5 = c.probability('eng:s:long', 0.5).p;
    const p9 = c.probability('eng:s:long', 0.9).p;
    expect(p9).toBeGreaterThan(p5);
    expect(p5).toBeGreaterThan(p1);
  });
  test('yeterli örnekte calibrated=true', () => {
    const c = new Calibrator();
    train(c, 'eng:s:long');
    expect(c.probability('eng:s:long', 0.9).n).toBeGreaterThanOrEqual(15);
    expect(c.probability('eng:s:long', 0.9).calibrated).toBe(true);
  });
});

describe('calibration — shrinkage', () => {
  test('tek kazanç 1.0’a atlamaz (prior’a çekilir)', () => {
    const c = new Calibrator();
    c.record('eng:s:long', 0.95, true); // tek örnek, kazanç
    const p = c.probability('eng:s:long', 0.95);
    expect(p.p).toBeLessThan(0.9);
    expect(p.p).toBeGreaterThan(0.4);
    expect(p.calibrated).toBe(false); // n<minEffective
  });
});

describe('calibration — izotonik monotonluk', () => {
  test('PAVA azalmayan sonuç üretir', () => {
    const y = [0.2, 0.8, 0.5, 0.9, 0.4];
    const w = [1, 1, 1, 1, 1];
    const iso = isotonicNonDecreasing(y, w);
    for (let i = 1; i < iso.length; i++) expect(iso[i]).toBeGreaterThanOrEqual(iso[i - 1] - 1e-9);
  });
  test('gürültülü ampirik ters dönse bile kalibre eğri monoton', () => {
    const c = new Calibrator();
    // kasıtlı ters: 0.6 kovası 0.8 kovasından daha çok kazanıyor
    for (let k = 0; k < 40; k++) {
      c.record('eng:x:long', 0.65, true); // %100
      c.record('eng:x:long', 0.85, k % 2 === 0); // %50
    }
    const s = c.summary('eng:x:long');
    const cals = s.buckets.map((b) => b.calibrated);
    for (let i = 1; i < cals.length; i++) expect(cals[i]).toBeGreaterThanOrEqual(cals[i - 1] - 1e-9);
  });
});

describe('calibration — hata ölçütü & serileştirme', () => {
  test('brier ve ece sonlu', () => {
    const c = new Calibrator();
    for (let k = 0; k < 50; k++) {
      c.record('eng:s:long', 0.2, k % 4 === 0);
      c.record('eng:s:long', 0.8, k % 4 !== 0);
    }
    const e = c.calibrationError('eng:s:long');
    expect(e.brier).toBeGreaterThan(0);
    expect(e.brier).toBeLessThan(1);
    expect(e.ece).toBeGreaterThanOrEqual(0);
    expect(e.n).toBe(100);
  });
  test('serialize/deserialize olasılığı korur', () => {
    const c = new Calibrator();
    for (let k = 0; k < 30; k++) c.record('eng:s:long', 0.75, k % 3 !== 0);
    const before = c.probability('eng:s:long', 0.75).p;
    const c2 = Calibrator.deserialize(JSON.parse(JSON.stringify(c.serialize())));
    const after = c2.probability('eng:s:long', 0.75).p;
    expect(after).toBeCloseTo(before, 6);
  });
});
