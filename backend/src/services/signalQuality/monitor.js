/**
 * signalQuality/monitor.js
 * ---------------------------------------------------------------------------
 * Faz 4 — Izleme: her namespace icin kalibrasyon saglik ozeti.
 *
 * Kalibratörden (calibration.json) namespace basina ornek sayisi, ECE, Brier
 * ve kova kapsamini cikarir; esik-alti/az-ornek bayraklari uretir. Haftalik
 * yeniden-kalibrasyon/rapor gorevinden cagrilmak uzere tasarlandi.
 *
 * Saf mantik + opsiyonel guvenli disk okuma.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Calibrator } = require('./calibration');

const DEFAULT_CALIB_PATH = path.join(__dirname, '..', '..', 'data', 'signalQuality', 'calibration.json');

function loadCalibrator(p) {
  const file = p || DEFAULT_CALIB_PATH;
  try {
    return Calibrator.deserialize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (_) {
    return new Calibrator();
  }
}

/**
 * @param {Calibrator} calib
 * @param {object} opts { minSamples=15, eceWarn=0.08 }
 * @returns {Array<object>} namespace saglik satirlari
 */
function report(calib, opts = {}) {
  const minSamples = opts.minSamples != null ? opts.minSamples : 15;
  const eceWarn = opts.eceWarn != null ? opts.eceWarn : 0.08;
  const rows = [];
  if (!calib || !calib.ns) return rows;
  for (const ns of calib.ns.keys()) {
    const err = calib.calibrationError(ns);
    const sum = calib.summary(ns);
    const n = err.n || 0;
    const coverage = sum ? sum.buckets.filter((b) => b.total > 0).length : 0;
    const flags = [];
    if (n < minSamples) flags.push('az_ornek');
    if (err.ece != null && err.ece > eceWarn) flags.push('yuksek_ece');
    if (coverage < 3) flags.push('dar_kapsam');
    rows.push({
      namespace: ns,
      n,
      prior: sum ? sum.prior : null,
      ece: err.ece,
      brier: err.brier,
      coverageBuckets: coverage,
      trustworthy: flags.length === 0,
      flags,
    });
  }
  rows.sort((a, b) => b.n - a.n);
  return rows;
}

/** Shadow JSONL loglarindan namespace basina gozlem sayisi (opsiyonel). */
function summarizeShadow(dir) {
  const out = {};
  try {
    const d = dir || path.join(__dirname, '..', '..', 'data', 'signalQuality');
    const files = fs.readdirSync(d).filter((f) => /^shadow-.*\.jsonl$/.test(f));
    for (const f of files) {
      const lines = fs.readFileSync(path.join(d, f), 'utf8').split('\n');
      for (const ln of lines) {
        if (!ln.trim()) continue;
        try {
          const r = JSON.parse(ln);
          const key = r.ns || (r.engine + ':' + r.strategy + ':' + r.dir);
          if (!out[key]) out[key] = { observations: 0, published: 0 };
          out[key].observations += 1;
          if (r.publish) out[key].published += 1;
        } catch (_) {
          /* satiri atla */
        }
      }
    }
  } catch (_) {
    /* dizin yok */
  }
  return out;
}

/** Konsola okunabilir ozet bas (scheduled task icin). */
function printReport(p) {
  const calib = loadCalibrator(p);
  const rows = report(calib);
  const shadow = summarizeShadow();
  console.log('=== signalQuality izleme raporu ===');
  if (!rows.length) {
    console.log('Henuz kalibrasyon verisi yok. Shadow gozlemler birikiyor:');
    console.log(JSON.stringify(shadow, null, 2));
    return { rows, shadow };
  }
  for (const r of rows) {
    console.log(
      `${r.namespace.padEnd(34)} n=${String(r.n).padStart(4)} ECE=${fmt(r.ece)} Brier=${fmt(r.brier)} kapsam=${r.coverageBuckets} ${r.trustworthy ? 'OK' : '[' + r.flags.join(',') + ']'}`
    );
  }
  return { rows, shadow };
}

function fmt(x) {
  return x == null ? ' n/a ' : x.toFixed(4);
}

module.exports = { loadCalibrator, report, summarizeShadow, printReport, DEFAULT_CALIB_PATH };
