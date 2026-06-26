/**
 * ALTIN · MOTOR (top-down orkestratör) — "yaşayan çoklu-bot sistem".
 *
 * 1) Haftalık + günlükten YÖN (bias) hesaplar (altinBias).
 * 2) Her alt-TF (1d/8h/4h/1h/15m/5m/1m) için yön-uyumlu sinyaller üretir
 *    (altinStrategies — backtest'le doğrulanmış config'ler).
 * 3) Her sinyali Destek/Direnç + fraktal kırılımıyla teyit eder (altinSR):
 *    onay varsa güven artar; scalp (15m/5m/1m) sinyalleri YALNIZ S/R onayıyla
 *    geçer (backtest kenarı zayıf → dürüst süzme).
 *
 * Public yüzey: generate / getLatest / analyzeTf / getBias.
 */
const altinData = require('./altinData');
const altinBias = require('./altinBias');
const altinSR = require('./altinSR');
const altinStrategies = require('./altinStrategies');

const SIGNAL_TFS = ['1d', '8h', '4h', '1h', '15m', '5m', '1m'];
const SYMBOL = 'XAU/USD';

let latest = null;

function enrich(sig, sr) {
  const conf = altinSR.srConfluence(sr, sig.direction);
  let confidence = sig.confidence;
  let dropped = false;
  if (conf.ok) confidence = Math.min(96, confidence + (sig.scalp ? 14 : 7));
  else { confidence = sig.scalp ? 0 : Math.max(40, confidence - 12); if (sig.scalp) dropped = true; }
  return { ...sig, confidence, srNote: conf.note, srOk: conf.ok, dropped };
}

async function generate() {
  const data = await altinData.getAll();
  const bias = altinBias.combinedBias(data['1wk'], data['1d']);
  const perTf = {};
  const signals = [];
  const srBreaks = [];

  for (const tf of SIGNAL_TFS) {
    const cands = data[tf];
    const sr = altinSR.analyze(cands || []);
    let sigs = altinStrategies.evaluateLatest(cands || [], tf, bias.tradeBias)
      .map(s => enrich(s, sr))
      .filter(s => !s.dropped); // scalp + S/R onayı yoksa elenir
    for (const s of sigs) { s.symbol = SYMBOL; s.tf = tf; signals.push(s); }
    perTf[tf] = {
      tf,
      lastClose: sr ? sr.lastClose : (cands && cands.length ? cands[cands.length - 1].close : null),
      candleTime: cands && cands.length ? cands[cands.length - 1].time : null,
      sr,
      signals: sigs,
    };
    if (sr && sr.lastBreak) srBreaks.push({ tf, ...sr.lastBreak });
  }

  signals.sort((a, b) => b.confidence - a.confidence);

  latest = {
    generatedAt: new Date().toISOString(),
    robot: 'ALTIN',
    symbol: SYMBOL,
    tfs: SIGNAL_TFS,
    bias,
    perTf,
    signals,
    srBreaks,
    counts: {
      signals: signals.length,
      long: signals.filter(s => s.direction === 'long').length,
      short: signals.filter(s => s.direction === 'short').length,
      scalp: signals.filter(s => s.scalp).length,
      core: signals.filter(s => !s.scalp).length,
    },
  };
  return latest;
}

function getLatest() { return latest; }
function getBias() { return latest ? latest.bias : null; }

async function analyzeTf(tf) {
  const data = await altinData.getAll(['1wk', '1d', tf].filter((v, i, a) => a.indexOf(v) === i));
  const bias = altinBias.combinedBias(data['1wk'], data['1d']);
  const cands = data[tf] || [];
  const sr = altinSR.analyze(cands);
  const sigs = altinStrategies.evaluateLatest(cands, tf, bias.tradeBias).map(s => enrich(s, sr)).filter(s => !s.dropped);
  return { tf, bias, sr, signals: sigs };
}

module.exports = { generate, getLatest, getBias, analyzeTf, SIGNAL_TFS, SYMBOL };
