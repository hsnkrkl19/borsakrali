/**
 * _devHitrate — YÜKSEK İSABET (win rate) odaklı yeniden ayar deneyi.
 * Kullanıcı: "isabet oranı düşük". 2:1 trend sistemi tasarım gereği <%50 isabet.
 * Daha yakın TP + temiz giriş → isabeti yükselt. node _devHitrate.js
 */
'use strict';
const cryptoKlines = require('../cryptoKlines');
const forexKlines = require('../forex/forexKlines');
const { INSTRUMENTS, TF_DEFS } = require('./beastInstruments');
const bt = require('./beastBacktest');

const TF_ZL = { '1h': 34, '4h': 50, '1d': 60 };
const FETCH_LIMIT = { '1h': 1500, '4h': 800, '1d': 730 };

async function fetchData(inst, tf) {
  if (inst.source === 'crypto') return cryptoKlines.fetchCandles(inst.dataSymbol, tf, FETCH_LIMIT[tf]);
  return forexKlines.fetchCandles(inst.yahoo, tf, FETCH_LIMIT[tf]);
}
function cfgFor(inst, tf, over) { return Object.assign({}, inst.cfg, { zlLength: TF_ZL[tf] }, over); }

(async () => {
  const data = {};
  for (const inst of INSTRUMENTS) { data[inst.id] = {}; for (const tf of ['1h','4h','1d']) data[inst.id][tf] = await fetchData(inst, tf); }

  // 1) Her hücre × yakın-TP konfigleri → İSABET tablosu
  const rrSet = [[0.8,1.6],[1.0,2.0],[1.25,2.5],[1.5,3.0]];
  const modes = ['fixed','partial'];
  console.log('\n=== İSABET (win rate) TARAMASI — minScore 4, stop 2-3×ATR, ADX kapalı ===');
  console.log('pair tf  | mode    rr1 | trades  winRate  avgR    PF     net%');
  const cells = {};
  for (const inst of INSTRUMENTS) {
    for (const tf of ['1h','4h','1d']) {
      const candles = data[inst.id][tf]; if (!candles || candles.length < 200) continue;
      for (const rr of rrSet) for (const mode of modes) {
        const cfg = cfgFor(inst, tf, { zlMult:1.0, minScore:4, minStopATR:2.0, maxStopATR:3.0, rr1:rr[0], rr2:rr[1], trailATR:2.0, partialMode:mode });
        const m = bt.runBacktest(candles, TF_DEFS[tf].htfFactor, cfg, TF_DEFS[tf], inst.precision);
        const key = `${inst.short}:${tf}:${mode}:${rr[0]}`;
        cells[key] = { inst:inst.short, tf, mode, rr1:rr[0], ...m };
      }
    }
  }
  // En yüksek isabetli, ≥8 işlem, pozitif avgR konfigler
  const ranked = Object.values(cells).filter(c => c.trades>=8 && c.avgR>0).sort((a,b)=>b.winRate-a.winRate);
  console.log('\n-- En yüksek İSABET (pozitif beklenti, ≥8 işlem) ilk 20 --');
  for (const c of ranked.slice(0,20))
    console.log(`  ${c.inst.padEnd(3)} ${c.tf.padEnd(3)} | ${c.mode.padEnd(7)} ${String(c.rr1).padEnd(4)} | ${String(c.trades).padStart(3)}  ${String(c.winRate).padStart(5)}%  ${String(c.avgR).padStart(6)}  ${String(c.profitFactor).padStart(5)}  ${String(c.netPct).padStart(6)}%`);

  // 2) Sabit rr1=1.0 fixed ile pariteye göre 4h+1d POOL isabet (tek-TF tutarlılık)
  console.log('\n=== rr1=1.0 FIXED, 4h+1d (gürültülü 1h ATILDI) havuz isabet ===');
  for (const rr of [[1.0,2.0],[1.25,2.5]]) for (const mode of ['fixed','partial']) {
    const pool=[];
    for (const inst of INSTRUMENTS) for (const tf of ['4h','1d']) {
      const candles = data[inst.id][tf]; if (!candles||candles.length<200) continue;
      const cfg = cfgFor(inst, tf, { zlMult:1.0, minScore:4, minStopATR:2.0, maxStopATR:3.0, rr1:rr[0], rr2:rr[1], trailATR:2.0, partialMode:mode });
      const m = bt.runBacktest(candles, TF_DEFS[tf].htfFactor, cfg, TF_DEFS[tf], inst.precision);
      for (const t of m._trades) pool.push(t);
    }
    const w=pool.filter(t=>t.R>0).length, n=pool.length;
    const sw=pool.filter(t=>t.R>0).reduce((s,t)=>s+t.R,0), sl=Math.abs(pool.filter(t=>t.R<=0).reduce((s,t)=>s+t.R,0));
    const avgR=n?pool.reduce((s,t)=>s+t.R,0)/n:0;
    console.log(`  rr1=${rr[0]} ${mode.padEnd(7)} | n=${n}  winRate=${(w/n*100).toFixed(1)}%  avgR=${avgR.toFixed(3)}  PF=${(sw/sl).toFixed(2)}`);
  }

  // 3) minScore'u yükseltmenin (daha temiz giriş) isabete etkisi — 4h+1d, rr1=1.0 fixed
  console.log('\n=== minScore etkisi (4h+1d, rr1=1.0 fixed) — daha temiz giriş = daha yüksek isabet? ===');
  for (const ms of [3,4,5,6]) {
    const pool=[];
    for (const inst of INSTRUMENTS) for (const tf of ['4h','1d']) {
      const candles = data[inst.id][tf]; if (!candles||candles.length<200) continue;
      const cfg = cfgFor(inst, tf, { zlMult:1.0, minScore:ms, minStopATR:2.0, maxStopATR:3.0, rr1:1.0, rr2:2.0, trailATR:2.0, partialMode:'fixed' });
      const m = bt.runBacktest(candles, TF_DEFS[tf].htfFactor, cfg, TF_DEFS[tf], inst.precision);
      for (const t of m._trades) pool.push(t);
    }
    const w=pool.filter(t=>t.R>0).length, n=pool.length||1;
    const avgR=pool.reduce((s,t)=>s+t.R,0)/n;
    console.log(`  minScore=${ms} | n=${n}  winRate=${(w/n*100).toFixed(1)}%  avgR=${avgR.toFixed(3)}`);
  }
})();
