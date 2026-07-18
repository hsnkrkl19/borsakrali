/**
 * signalQuality/walkForward.js
 * ---------------------------------------------------------------------------
 * Faz 3 — Genisleyen pencere (walk-forward) DOGRULAMA + kalibratör tohumlama.
 *
 * Teshis: Backtest'ler ornek-ici (in-sample); asiri-uyum gorunmez. Bu arac,
 * zaman sirali (namespace, score, win) kayitlarini zaman FOLD'larina boler,
 * her fold'u ONCEKI fold'larla egitilip test eder (ornek-disi). Naive
 * "skor=guven" ile kalibre olasiligin OOS ECE/Brier'ini karsilastirir.
 *
 * Ayrica seedCalibrator: tarihsel backtest sonuclarindan bir Calibrator kurar
 * (canli oncesi bootstrap).
 *
 * Saf; dis bagimlilik yok (yalnizca ./calibration).
 */

'use strict';

const { Calibrator } = require('./calibration');

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function ece(preds, wins, bins) {
  bins = bins || 10;
  const b = [];
  for (let i = 0; i < bins; i++) b.push({ n: 0, sp: 0, sw: 0 });
  for (let i = 0; i < preds.length; i++) {
    let k = Math.floor(clamp(preds[i], 0, 1) * bins);
    if (k >= bins) k = bins - 1;
    b[k].n += 1;
    b[k].sp += preds[i];
    b[k].sw += wins[i] ? 1 : 0;
  }
  const N = preds.length || 1;
  let e = 0;
  for (const bin of b) {
    if (!bin.n) continue;
    e += (bin.n / N) * Math.abs(bin.sw / bin.n - bin.sp / bin.n);
  }
  return e;
}

function brier(preds, wins) {
  if (!preds.length) return null;
  let s = 0;
  for (let i = 0; i < preds.length; i++) s += Math.pow((wins[i] ? 1 : 0) - preds[i], 2);
  return s / preds.length;
}

/**
 * @param {Array<{ns:string, score:number, win:boolean, t?:number}>} records
 * @param {object} opts { folds=5, calibratorOpts }
 */
function walkForwardValidate(records, opts = {}) {
  const folds = Math.max(2, opts.folds || 5);
  const rows = (records || [])
    .filter((r) => r && r.ns != null && Number.isFinite(Number(r.score)))
    .slice()
    .sort((a, b) => (a.t || 0) - (b.t || 0));
  if (rows.length < folds * 2) {
    return { ok: false, reason: 'insufficient_data', n: rows.length };
  }
  const foldSize = Math.floor(rows.length / folds);
  const perFold = [];
  let naiveP = [];
  let calP = [];
  let allWins = [];

  for (let f = 1; f < folds; f++) {
    const trainEnd = foldSize * f;
    const testEnd = f === folds - 1 ? rows.length : foldSize * (f + 1);
    const train = rows.slice(0, trainEnd);
    const test = rows.slice(trainEnd, testEnd);
    if (!test.length) continue;

    const calib = new Calibrator(opts.calibratorOpts);
    for (const r of train) calib.record(r.ns, Number(r.score), !!r.win);

    const nP = [];
    const cP = [];
    const w = [];
    for (const r of test) {
      nP.push(clamp(Number(r.score), 0, 1));
      cP.push(calib.probability(r.ns, Number(r.score)).p);
      w.push(!!r.win);
    }
    perFold.push({
      fold: f,
      train: train.length,
      test: test.length,
      naive: { ece: round(ece(nP, w), 4), brier: round(brier(nP, w), 4) },
      calibrated: { ece: round(ece(cP, w), 4), brier: round(brier(cP, w), 4) },
    });
    naiveP = naiveP.concat(nP);
    calP = calP.concat(cP);
    allWins = allWins.concat(w);
  }

  return {
    ok: true,
    folds: perFold.length,
    n: rows.length,
    aggregate: {
      naive: { ece: round(ece(naiveP, allWins), 4), brier: round(brier(naiveP, allWins), 4) },
      calibrated: { ece: round(ece(calP, allWins), 4), brier: round(brier(calP, allWins), 4) },
    },
    perFold,
  };
}

/** Tarihsel kayitlardan bir Calibrator kur (canli oncesi bootstrap). */
function seedCalibrator(records, opts = {}) {
  const calib = new Calibrator(opts.calibratorOpts);
  for (const r of records || []) {
    if (!r || r.ns == null) continue;
    const s = Number(r.score);
    if (!Number.isFinite(s)) continue;
    calib.record(r.ns, s, r.win == null ? Number(r.r) > 0 : !!r.win);
  }
  return calib;
}

function round(x, d) {
  if (d == null) d = 2;
  if (x === null || !Number.isFinite(x)) return null;
  const m = Math.pow(10, d);
  return Math.round(x * m) / m;
}

module.exports = { walkForwardValidate, seedCalibrator, ece, brier };
