/**
 * signalQuality/bridge.js  — FAIL-SAFE koprucuk (shadow varsayilan).
 * Kalibrator yukleme sirasi: calibration.json -> calibration.seed.json -> bos.
 */
'use strict';
const path = require('path');
const fs = require('fs');
let sq = null;
try { sq = require('./index'); } catch (_) { sq = null; }
const MODE = (process.env.SIGNAL_QUALITY_MODE || 'shadow').toLowerCase();
const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'signalQuality');
const CALIB_PATH = path.join(DATA_DIR, 'calibration.json');
const SEED_PATH = path.join(DATA_DIR, 'calibration.seed.json');
const SAVE_THROTTLE_MS = 20000;
let calibrator = null, lastSaveAt = 0, dirty = false;
function ensureDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {} }
function tryLoad(p) { try { return sq.Calibrator.deserialize(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch (_) { return null; } }
function getCalibrator() {
  if (calibrator) return calibrator;
  if (!sq) return null;
  calibrator = tryLoad(CALIB_PATH) || tryLoad(SEED_PATH);
  if (!calibrator) { try { calibrator = new sq.Calibrator(); } catch (_) { calibrator = null; } }
  return calibrator;
}
function saveCalibrator(force) {
  if (!calibrator) return;
  const now = Date.now();
  if (!force && (!dirty || now - lastSaveAt < SAVE_THROTTLE_MS)) return;
  try { ensureDir(); fs.writeFileSync(CALIB_PATH, JSON.stringify(calibrator.serialize())); lastSaveAt = now; dirty = false; } catch (_) {}
}
const SHADOW_FLUSH_N = 30, SHADOW_FLUSH_MS = 15000;
let shadowBuf = [], shadowLastFlush = 0;
function shadowFlush() {
  if (!shadowBuf.length) return;
  try {
    ensureDir();
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(DATA_DIR, 'shadow-' + day + '.jsonl');
    fs.appendFileSync(file, shadowBuf.map((r) => JSON.stringify(r)).join('\n') + '\n');
    shadowBuf = []; shadowLastFlush = Date.now();
  } catch (_) { shadowBuf = []; }
}
function appendShadow(rec) {
  try { shadowBuf.push(rec); if (shadowBuf.length >= SHADOW_FLUSH_N || Date.now() - shadowLastFlush > SHADOW_FLUSH_MS) shadowFlush(); } catch (_) {}
}
function observe(d) {
  if (MODE === 'off' || !sq || !d) return null;
  try {
    const calib = getCalibrator();
    const res = sq.evaluateSignal({ engine: d.engine, strategy: d.strategy, direction: d.direction, rawScore: d.rawScore, rawScoreScale: d.rawScoreScale, votes: d.votes, candles: d.candles, levels: d.levels, assetClass: d.assetClass, calibrator: calib }, d.opts || {});
    appendShadow({ t: new Date().toISOString(), id: d.id || null, symbol: d.symbol || null, engine: d.engine, strategy: d.strategy, dir: d.direction, ns: res.namespace, qScore: res.qualityScore, conf: res.confidence, grade: res.grade, edge: res.edge, netRR: res.netRR, publish: res.publish, regime: res.regime ? res.regime.regime : null, sizeMult: res.sizeMultiplier, calibrated: res.calibrated, reasons: res.reasons });
    return res;
  } catch (_) { return null; }
}
function recordOutcome(ref, outcome) {
  if (MODE === 'off' || !sq || !ref) return false;
  try {
    const calib = getCalibrator();
    if (!calib) return false;
    if (ref.namespace == null || ref.qualityScore == null) return false;
    calib.record(ref.namespace, ref.qualityScore, outcome);
    dirty = true; saveCalibrator(false);
    return true;
  } catch (_) { return false; }
}
function flush() { try { saveCalibrator(true); } catch (_) {} try { shadowFlush(); } catch (_) {} }
try { process.once('exit', flush); } catch (_) {}
module.exports = { observe, recordOutcome, flush, MODE, _getCalibrator: getCalibrator };
