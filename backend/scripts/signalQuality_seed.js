#!/usr/bin/env node
/**
 * signalQuality — kalibratör TOHUMLAMA (bootstrap).
 * Tarihsel backtest verilerini (skor→kazanç/kayıp) Calibrator'a replay eder ve
 * data/signalQuality/calibration.seed.json üretir. Bridge, canlı calibration.json
 * yoksa bu seed'i yükler → sistem ilk günden kalibre başlar.
 *
 * Kaynaklar (canlı hook namespace'leriyle BİREBİR eşleşir):
 *   1) crypto-mtf/calibration.json .table  <TF>__<ratio>__<dir> → mtfScorer:<TF>:<dir>, skor=ratio
 *   2) bist-signals-backtest.json .buckets bNN (ayrık 5-pt bant) → bistScoreEngine:trend:long
 *   3) pro-signals-stats.json .byPair <inst>.<dir>{win,loss}    → proEngine:<inst>:<dir> (gerçek, az örnek)
 *   4) beast/beastConfig EDGE <inst>:<tf>.winRate              → beast:<inst>:<dir> (HAFİF PRIOR)
 *
 * Çalıştır: node scripts/signalQuality_seed.js
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { Calibrator } = require('../src/services/signalQuality');
const monitor = require('../src/services/signalQuality/monitor');

const DATA = path.join(__dirname, '..', 'src', 'data');
const OUT = path.join(DATA, 'signalQuality', 'calibration.seed.json');
const calib = new Calibrator();
let mtfN = 0, bistN = 0, proN = 0, beastN = 0;

function rep(ns, score, wins, losses) {
  for (let i = 0; i < wins; i++) calib.record(ns, score, true);
  for (let i = 0; i < losses; i++) calib.record(ns, score, false);
}

// 1) MTF — Beta(alpha,beta,samples); ampirik kazanç ≈ alpha-1, kayıp ≈ beta-1 (prior≈2)
try {
  const table = require(path.join(DATA, 'crypto-mtf', 'calibration.json')).table || {};
  for (const key of Object.keys(table)) {
    const parts = key.split('__'); if (parts.length !== 3) continue;
    const [tf, ratio, dir] = parts; const e = table[key]; const samples = e.samples || 0;
    if (!samples) continue;
    const wins = Math.max(0, Math.round((e.alpha || 1) - 1));
    const losses = Math.max(0, Math.round((e.beta || 1) - 1));
    const score = parseFloat(ratio); if (!Number.isFinite(score)) continue;
    rep(`mtfScorer:${tf}:${dir}`, score, wins, losses); mtfN += wins + losses;
  }
} catch (e) { console.error('mtf seed atlandı:', e.message); }

// 2) BIST — ayrık 5-pt bantlar; ham win/loss temsili skorla
try {
  const buckets = require(path.join(DATA, 'bist-signals-backtest.json')).buckets || {};
  for (const band of Object.keys(buckets)) {
    const th = parseInt(band.slice(1), 10); if (!Number.isFinite(th)) continue;
    const x = buckets[band]; rep('bistScoreEngine:trend:long', (th + 2) / 100, x.win || 0, x.loss || 0);
    bistN += (x.win || 0) + (x.loss || 0);
  }
} catch (e) { console.error('bist seed atlandı:', e.message); }

// 3) PRO — gerçek byPair win/loss (az örnek; temsili skor 0.6)
try {
  const bp = require(path.join(DATA, 'pro-signals-stats.json')).byPair || {};
  for (const inst of Object.keys(bp)) {
    for (const dir of ['long', 'short']) {
      const x = bp[inst][dir]; if (!x) continue;
      const wins = x.win || 0, losses = x.loss || 0; if (wins + losses === 0) continue;
      rep(`proEngine:${inst}:${dir}`, 0.6, wins, losses); proN += wins + losses;
    }
  }
} catch (e) { console.error('pro seed atlandı:', e.message); }

// 4) BEAST — EDGE backtest isabet oranı → HAFİF PRIOR (enstrüman başına, N=15/yön)
const BEAST_PRIOR_N = 15;
try {
  const EDGE = require('../src/services/beast/beastConfig').EDGE || {};
  const byInst = {};
  for (const key of Object.keys(EDGE)) {
    const inst = key.split(':')[0]; const wr = EDGE[key].winRate;
    if (Number.isFinite(wr)) (byInst[inst] = byInst[inst] || []).push(wr);
  }
  for (const inst of Object.keys(byInst)) {
    const wrs = byInst[inst]; const avg = wrs.reduce((a, b) => a + b, 0) / wrs.length / 100;
    const wins = Math.round(BEAST_PRIOR_N * avg), losses = BEAST_PRIOR_N - wins;
    for (const dir of ['long', 'short']) { rep(`beast:${inst}:${dir}`, 0.6, wins, losses); beastN += wins + losses; }
  }
} catch (e) { console.error('beast seed atlandı:', e.message); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(calib.serialize()));

console.log('=== SEED yazıldı ===');
console.log('dosya:', OUT);
console.log('örnekler → mtf:', mtfN, '| bist:', bistN, '| pro:', proN, '| beast(prior):', beastN, '| TOPLAM:', mtfN + bistN + proN + beastN);
console.log('\n=== namespace sağlık ===');
for (const r of monitor.report(calib)) console.log(r.namespace.padEnd(30), 'n=' + String(r.n).padStart(4), 'ECE=' + r.ece, r.trustworthy ? 'OK' : '[' + r.flags.join(',') + ']');
