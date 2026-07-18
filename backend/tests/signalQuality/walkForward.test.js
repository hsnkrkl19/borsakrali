'use strict';
const wf = require('../../src/services/signalQuality/walkForward');

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('walkForward — OOS kalibrasyon iyileştirir', () => {
  test('kalibre ECE < naive ECE (aggregate)', () => {
    const rand = rng(7);
    const recs = [];
    for (let i = 0; i < 3000; i++) {
      const score = rand();
      const pTrue = 0.1 + 0.8 * score * score; // doğrusal olmayan
      recs.push({ ns: 'eng:s:long', score, win: rand() < pTrue, t: i });
    }
    const res = wf.walkForwardValidate(recs, { folds: 5 });
    expect(res.ok).toBe(true);
    expect(res.folds).toBeGreaterThan(0);
    expect(res.aggregate.calibrated.ece).toBeLessThan(res.aggregate.naive.ece);
  });

  test('yetersiz veri güvenli döner', () => {
    const res = wf.walkForwardValidate([{ ns: 'a', score: 0.5, win: true }], { folds: 5 });
    expect(res.ok).toBe(false);
  });
});

describe('walkForward — seedCalibrator', () => {
  test('tarihsel kayıtlardan monoton kalibratör kurar', () => {
    const recs = [];
    for (let i = 0; i < 200; i++) {
      recs.push({ ns: 'eng:s:long', score: 0.2, win: i % 5 === 0 });
      recs.push({ ns: 'eng:s:long', score: 0.8, win: i % 5 !== 0 });
    }
    const calib = wf.seedCalibrator(recs);
    const lo = calib.probability('eng:s:long', 0.2).p;
    const hi = calib.probability('eng:s:long', 0.8).p;
    expect(hi).toBeGreaterThan(lo);
  });
});
