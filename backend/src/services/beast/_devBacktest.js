/**
 * _devBacktest — BEAST Trend geliştirme/araştırma aracı (uygulama require ETMEZ).
 * Kullanım: node src/services/beast/_devBacktest.js [baseline|sweep] [pairFilter]
 */
'use strict';

const cryptoKlines = require('../cryptoKlines');
const forexKlines = require('../forex/forexKlines');
const { INSTRUMENTS, SIGNAL_TFS, TF_DEFS } = require('./beastInstruments');
const bt = require('./beastBacktest');

// Per-TF zero-lag uzunluğu (araştırma: kısa TF → kısa length, alt uç)
const TF_ZL = { '1h': 34, '4h': 50, '1d': 60 };
const FETCH_LIMIT = { '1h': 1500, '4h': 800, '1d': 730 };

async function fetchData(inst, tf) {
  if (inst.source === 'crypto') return cryptoKlines.fetchCandles(inst.dataSymbol, tf, FETCH_LIMIT[tf]);
  return forexKlines.fetchCandles(inst.yahoo, tf, FETCH_LIMIT[tf]);
}

function cfgFor(inst, tf, over = {}) {
  return Object.assign({}, inst.cfg, { zlLength: TF_ZL[tf] }, over);
}

function fmtMetrics(m) {
  return `tr=${String(m.trades).padStart(3)} wr=${String(m.winRate).padStart(5)}% PF=${String(m.profitFactor).padStart(5)} avgR=${String(m.avgR).padStart(6)} net=${String(m.netPct).padStart(7)}% DD=${String(m.maxDDPct).padStart(5)}% /mo=${String(m.tradesPerMonth).padStart(4)} ${JSON.stringify(m.exitBreak)}`;
}

async function baseline(pairFilter) {
  const modes = ['partial', 'runner', 'fixed'];
  for (const inst of INSTRUMENTS) {
    if (pairFilter && !inst.id.includes(pairFilter.toUpperCase())) continue;
    console.log(`\n═══════════ ${inst.id} (${inst.name}) ═══════════`);
    for (const tf of SIGNAL_TFS) {
      const candles = await fetchData(inst, tf);
      if (!candles || candles.length < 150) { console.log(`  ${tf}: veri yok (${candles ? candles.length : 0})`); continue; }
      const factor = TF_DEFS[tf].htfFactor;
      console.log(`  ── ${tf} (${candles.length} bar, ${Math.round((candles[candles.length-1].time-candles[0].time)/86400)}g) ──`);
      for (const mode of modes) {
        const cfg = cfgFor(inst, tf, { partialMode: mode });
        const m = bt.runBacktest(candles, factor, cfg, TF_DEFS[tf], inst.precision);
        console.log(`     ${mode.padEnd(8)} ${fmtMetrics(m)}`);
      }
    }
  }
}

// Bir işlem havuzundan metrikler (sızıntısız OOS değerlendirme için).
function poolMetrics(trades) {
  const n = trades.length;
  if (!n) return { n: 0, winRate: 0, avgR: 0, pf: 0 };
  const wins = trades.filter(t => t.R > 0);
  const sw = wins.reduce((s, t) => s + t.R, 0);
  const sl = Math.abs(trades.filter(t => t.R <= 0).reduce((s, t) => s + t.R, 0));
  return {
    n, winRate: +(wins.length / n * 100).toFixed(1),
    avgR: +(trades.reduce((s, t) => s + t.R, 0) / n).toFixed(3),
    pf: sl > 0 ? +(sw / sl).toFixed(2) : (sw > 0 ? 99 : 0),
  };
}

// HAVUZLU sweep: tüm parite×TF hücrelerinin işlemleri TEK popülasyonda toplanır
// (her hücre 8-16 işlem → tek başına anlamsız; havuz ~60-100 işlem). 70/30
// zaman bölmesi: parametreler IN-SAMPLE seçilir, OUT-OF-SAMPLE raporlanır.
// Mod TF'e göre: 1h→partial (gürültülü), 4h/1d→runner (trend koşar).
const MODE_BY_TF = { '1h': 'partial', '4h': 'runner', '1d': 'runner' };

async function sweep(pairFilter) {
  // Tüm veriyi önceden yükle
  const data = {};
  for (const inst of INSTRUMENTS) {
    if (pairFilter && !inst.id.includes(pairFilter.toUpperCase())) continue;
    data[inst.id] = {};
    for (const tf of SIGNAL_TFS) data[inst.id][tf] = await fetchData(inst, tf);
  }
  const grid = {
    zlMult: [1.0, 1.2, 1.5],
    minScore: [3, 4, 5],
    stopBand: [[1.5, 2.5], [1.8, 2.8], [2.0, 3.0]],
    rr: [[1.5, 3.0], [2.0, 4.0], [2.5, 5.0]],
    trailATR: [2.0, 3.0],
  };
  let best = null, bestCfg = null, bestStats = null, count = 0;
  for (const zlMult of grid.zlMult)
  for (const minScore of grid.minScore)
  for (const stopBand of grid.stopBand)
  for (const rr of grid.rr)
  for (const trailATR of grid.trailATR) {
    const train = [], test = [];
    for (const inst of INSTRUMENTS) {
      if (!data[inst.id]) continue;
      for (const tf of SIGNAL_TFS) {
        const candles = data[inst.id][tf];
        if (!candles || candles.length < 200) continue;
        const cfg = cfgFor(inst, tf, {
          zlMult, minScore, minStopATR: stopBand[0], maxStopATR: stopBand[1],
          rr1: rr[0], rr2: rr[1], trailATR, partialMode: MODE_BY_TF[tf],
        });
        const m = bt.runBacktest(candles, TF_DEFS[tf].htfFactor, cfg, TF_DEFS[tf], inst.precision);
        const split = Math.floor(candles.length * 0.7);
        for (const t of m._trades) (t.entryIdx < split ? train : test).push(t);
      }
    }
    count++;
    const tr = poolMetrics(train);
    if (tr.n < 40) continue;
    const obj = tr.avgR * 10 + (Math.min(tr.pf, 3) - 1) * 2 + Math.min(1, tr.n / 80);
    if (best == null || obj > best) {
      best = obj; bestCfg = { zlMult, minScore, stopBand, rr, trailATR };
      bestStats = { train: tr, test: poolMetrics(test) };
    }
  }
  console.log(`\nHAVUZLU SWEEP — ${count} kombinasyon (4 parite × 3 TF havuzu, 70/30 zaman bölmesi)`);
  console.log(`EN İYİ (in-sample obj=${best.toFixed(2)}):`);
  console.log(`  cfg : ${JSON.stringify(bestCfg)}  mode: 1h=partial 4h/1d=runner`);
  console.log(`  IN-SAMPLE  : n=${bestStats.train.n} wr=${bestStats.train.winRate}% PF=${bestStats.train.pf} avgR=${bestStats.train.avgR}`);
  console.log(`  OUT-SAMPLE : n=${bestStats.test.n} wr=${bestStats.test.winRate}% PF=${bestStats.test.pf} avgR=${bestStats.test.avgR}`);

  // En iyi global cfg ile hücre-hücre dökümü (hangi parite×TF aktif kalmalı?)
  console.log(`\n── EN İYİ CFG ile hücre dökümü (pozitif avgR olanlar AKTİF) ──`);
  for (const inst of INSTRUMENTS) {
    if (!data[inst.id]) continue;
    for (const tf of SIGNAL_TFS) {
      const candles = data[inst.id][tf];
      if (!candles || candles.length < 200) continue;
      const cfg = cfgFor(inst, tf, {
        zlMult: bestCfg.zlMult, minScore: bestCfg.minScore,
        minStopATR: bestCfg.stopBand[0], maxStopATR: bestCfg.stopBand[1],
        rr1: bestCfg.rr[0], rr2: bestCfg.rr[1], trailATR: bestCfg.trailATR, partialMode: MODE_BY_TF[tf],
      });
      const m = bt.runBacktest(candles, TF_DEFS[tf].htfFactor, cfg, TF_DEFS[tf], inst.precision);
      const flag = m.avgR > 0.05 ? 'AKTİF ' : 'kapalı';
      console.log(`  ${flag} ${inst.short.padEnd(3)} ${tf.padEnd(3)} ${fmtMetrics(m)}`);
    }
  }
}

// Tuned global config (havuzlu sweep + OOS kazananı)
const TUNED = { zlMult: 1.0, minScore: 4, minStopATR: 2.0, maxStopATR: 3.0, rr1: 2.0, rr2: 4.0, trailATR: 2.0 };
const ENABLED = { BTCUSD: ['1h', '4h', '1d'], ETHUSD: ['1h', '4h', '1d'], XAUUSD: ['4h', '1d'], XAGUSD: ['1h', '4h'] };

// Basit deterministik PRNG (tekrarlanabilir)
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

async function vsRandom(pairFilter) {
  const beastPool = [], randPool = [];
  for (const inst of INSTRUMENTS) {
    if (pairFilter && !inst.id.includes(pairFilter.toUpperCase())) continue;
    for (const tf of SIGNAL_TFS) {
      if (!ENABLED[inst.id].includes(tf)) continue;
      const candles = await fetchData(inst, tf);
      if (!candles || candles.length < 200) continue;
      const cfg = cfgFor(inst, tf, Object.assign({}, TUNED, { partialMode: MODE_BY_TF[tf] }));
      const m = bt.runBacktest(candles, TF_DEFS[tf].htfFactor, cfg, TF_DEFS[tf], inst.precision);
      for (const t of m._trades) beastPool.push(t);
      // Aynı sayıda işlemi 30× rastgele dene, ortalamasını al (gürültü azalt)
      const rnd = mulberry32(12345);
      for (let rep = 0; rep < 30; rep++) {
        const rt = bt.runRandomBaseline(candles, cfg, TF_DEFS[tf], inst.precision, m._trades.length, rnd);
        for (const t of rt) randPool.push(t);
      }
    }
  }
  const b = poolMetrics(beastPool), r = poolMetrics(randPool);
  console.log(`\nvs-RANDOM TABAN ÇİZGİSİ (yalnız aktif hücreler, aynı seviye/çıkış mantığı)`);
  console.log(`  BEAST   : n=${b.n}  wr=${b.winRate}%  PF=${b.pf}  avgR=${b.avgR}`);
  console.log(`  RANDOM  : n=${r.n}  wr=${r.winRate}%  PF=${r.pf}  avgR=${r.avgR}  (30 tekrar havuzu)`);
  console.log(`  → Giriş kenarı (BEAST avgR − RANDOM avgR) = ${(b.avgR - r.avgR).toFixed(3)} R/işlem`);
}

(async () => {
  const mode = process.argv[2] || 'baseline';
  const pair = process.argv[3] || '';
  const t0 = Date.now();
  if (mode === 'sweep') await sweep(pair);
  else if (mode === 'random') await vsRandom(pair);
  else await baseline(pair);
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
})();
