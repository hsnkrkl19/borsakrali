/**
 * signalQuality — Dogrulama Harness'i (deterministik)
 * ---------------------------------------------------------------------------
 * Amac: Ortak katmanin sinyalleri gercekten daha TUTARLI yaptigini sayisal
 * gostermek. "Ham skoru guven olarak kullanmak" (naive) ile "kalibre olasilik"
 * ORNEKLEM-DISI (out-of-sample) karsilastirilir. Olcut: Brier + ECE (dusuk=iyi).
 *
 * Ayrica rejim kapisinin choppy piyasayi eledigini gosterir.
 */
'use strict';
const sq = require('../src/services/signalQuality');
const { buildTrend, buildChop } = require('../tests/signalQuality/_helpers');

// Deterministik PRNG (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gercek (bilinmeyen) kazanma olasiligi: skorun DOGRUSAL OLMAYAN fonksiyonu.
// Naive "guven = skor" varsayimi bu yuzden hatalidir.
function pTrue(score) {
  return 0.1 + 0.8 * Math.pow(score, 2);
}

function ece(preds, wins, bins) {
  bins = bins || 10;
  const b = Array.from({ length: bins }, () => ({ n: 0, sumP: 0, sumW: 0 }));
  for (let i = 0; i < preds.length; i++) {
    let k = Math.floor(preds[i] * bins);
    if (k >= bins) k = bins - 1;
    if (k < 0) k = 0;
    b[k].n++; b[k].sumP += preds[i]; b[k].sumW += wins[i] ? 1 : 0;
  }
  let N = preds.length, e = 0;
  for (const bin of b) {
    if (!bin.n) continue;
    const conf = bin.sumP / bin.n, acc = bin.sumW / bin.n;
    e += (bin.n / N) * Math.abs(acc - conf);
  }
  return e;
}
function brier(preds, wins) {
  let s = 0;
  for (let i = 0; i < preds.length; i++) s += Math.pow((wins[i] ? 1 : 0) - preds[i], 2);
  return s / preds.length;
}

const rand = rng(12345);
const NS = 'demoEngine:strategy:long';
const calib = new sq.Calibrator();

const trainScore = [], trainWin = [];
const testScore = [], testWin = [];
const N = 6000;
for (let i = 0; i < N; i++) {
  const score = rand();
  const win = rand() < pTrue(score);
  if (rand() < 0.6) { calib.record(NS, score, win); trainScore.push(score); trainWin.push(win); }
  else { testScore.push(score); testWin.push(win); }
}

// Naive: guven = ham skor
const naivePreds = testScore.slice();
// Kalibre: egitim setinden ogrenilen olasilik
const calPreds = testScore.map((s) => calib.probability(NS, s).p);

const out = {
  ornek: { egitim: trainScore.length, test: testScore.length },
  naive: { brier: +brier(naivePreds, testWin).toFixed(4), ece: +ece(naivePreds, testWin).toFixed(4) },
  kalibre: { brier: +brier(calPreds, testWin).toFixed(4), ece: +ece(calPreds, testWin).toFixed(4) },
};
out.iyilesme = {
  brier_azalma_pct: +(100 * (1 - out.kalibre.brier / out.naive.brier)).toFixed(1),
  ece_azalma_pct: +(100 * (1 - out.kalibre.ece / out.naive.ece)).toFixed(1),
};

console.log('=== KALIBRASYON (ornek-disi) ===');
console.log(JSON.stringify(out, null, 2));

console.log('\n=== Guvenilirlik tablosu (kalibre eğri gercek olasiligi izliyor mu?) ===');
[0.1, 0.3, 0.5, 0.7, 0.9].forEach((s) => {
  const p = calib.probability(NS, s);
  console.log(
    `skor ${s.toFixed(2)} | naive %${(s * 100).toFixed(0).padStart(2)} | kalibre %${(p.p * 100).toFixed(0).padStart(2)} | gercek %${(pTrue(s) * 100).toFixed(0)} | n=${p.n}`
  );
});

console.log('\n=== REJIM KAPISI ===');
const rt = sq.detectRegime(buildTrend(80));
const rc = sq.detectRegime(buildChop(80));
console.log(`trend  -> rejim=${rt.regime} ADX=${rt.adx} CI=${rt.choppiness} gate.allow=${rt.gate.allow}`);
console.log(`yatay  -> rejim=${rc.regime} ADX=${rc.adx} CI=${rc.choppiness} gate.allow=${rc.gate.allow}`);

console.log('\n=== MALIYET FARKI (ayni seviyeler, farkli varlik) ===');
['fx_major', 'crypto', 'bist_equity'].forEach((cls) => {
  const r = sq.netRR(100, 98, 104, { assetClass: cls });
  console.log(`${cls.padEnd(12)} brutRR=${r.grossRR} netRR=${r.netRR} maliyet=${(r.costR * 100).toFixed(1)}%R`);
});
