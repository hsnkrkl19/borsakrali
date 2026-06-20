/**
 * YENİ ROBOT · ORKESTRATÖR (Derin Konfluans MTF Motoru)
 *
 * Her enstrüman (4) × her TF (15m/1h/4h/1d) için proConfluence ile TÜM teknikleri
 * çalıştırır; net Fibonacci/ATR seviyeleri + lot/kâr-zarar + MT5 emri ekler.
 *
 * "AZ AMA NET" kapısı (tutarlılık):
 *   • TF başına R/R1 < 1.6 kurulumlar elenir (proLevels).
 *   • Bir enstrüman ancak ≥3/4 TF AYNI yönde VE bu TF'ler arasında 4h veya 1d
 *     varsa sinyal üretir. Aksi halde sinyal YOK (no_confluence).
 *   • Düşük/sıkışık volatilite rejiminde güven kısılır (proConfluence kapısı).
 *
 * Güven: ham (teknik konfluans) + backtest KALİBRASYONU (PF/expectancy → ±15
 * sınırlı delta, eski forexAggregator). Self-test ağırlık vektörünü besler.
 *
 * Eski forex motoruyla AYNI public yüzey: generate/getLatest/rescale/analyzeOne.
 */

const forexKlines = require('../forex/forexKlines');
const { computeSizing } = require('../forex/riskSizing');
const { computeConfidence, calibrateConfidence, gradeFor, bandFor } = require('../forex/forexAggregator');
const proConfluence = require('./proConfluence');
const proLevels = require('./proLevels');
const { INSTRUMENTS, getInstrument } = require('./proInstruments');

const TFS = ['15m', '1h', '4h', '1d'];      // 5m bilinçli atıldı (gürültü)
const HIGH_TFS = ['4h', '1d'];
const MIN_CONFLUENCE_TFS = Number(process.env.PRO_MIN_CONFLUENCE_TFS) || 3; // ≥3/4 TF aynı yön (env ile gevşetilebilir)
const STALE_MINUTES = 20;
const MIN_CONFIDENCE = 50;                   // altı → işleme değer sinyal yok
const DEFAULT_EQUITY = 10000;
const FETCH_LIMIT = 320;
// Kalibrasyon kill-switch (eski forex ile aynı kalıp). PRO_CALIBRATION_ACTIVE=0 → ham skor.
const CALIBRATION_ACTIVE = process.env.PRO_CALIBRATION_ACTIVE !== '0';

let latest = null;

// Lazy require (yük sırası / döngü güvenliği)
function backtest() { try { return require('./proBacktest'); } catch (_) { return null; } }
function selfTest() { try { return require('./proSelfTest'); } catch (_) { return null; } }

function getWeights() {
  const st = selfTest();
  try { return (st && st.getTunedWeights && st.getTunedWeights()) || proConfluence.BASE_WEIGHTS; }
  catch (_) { return proConfluence.BASE_WEIGHTS; }
}
function getHistory(id, tf, rawConfidence) {
  const bt = backtest();
  try { return bt && bt.getHistory ? bt.getHistory(id, tf, rawConfidence) : null; }
  catch (_) { return null; }
}

// ── Tek (enstrüman, TF) ────────────────────────────────────────────────────
async function evalTF(inst, tf, livePrice, equity, weights) {
  const candles = await forexKlines.fetchCandles(inst.yahoo, tf, FETCH_LIMIT);
  if (!candles || candles.length < 60) return { tf, status: 'no_data' };

  const a = await proConfluence.analyzeTF(candles, { id: inst.id, tf, class: inst.class, weights });
  if (a.status === 'no_data') return { tf, status: 'no_data' };
  if (a.status !== 'signal') return { tf, status: 'neutral', votes: a.votes, regime: a.regime };

  const entry = livePrice || candles[candles.length - 1].close;
  const levels = proLevels.buildLevels(a.direction, entry, a.atr, tf, inst.precision, candles);
  if (!levels) return { tf, status: 'neutral', votes: a.votes, regime: a.regime }; // R/R<1.6 veya yapı yok → ele

  const sizing = computeSizing({ instrument: inst, entry: levels.entry, stop: levels.stop, direction: a.direction }, { equity });
  if (!sizing) return { tf, status: 'neutral', votes: a.votes };

  const pnl = proLevels.buildPnL(sizing.units, levels.entry, levels);
  const mt5 = proLevels.buildMt5(inst, a.direction, sizing.lots, levels, tf, inst.precision);

  return {
    tf, status: 'signal',
    direction: a.direction, action: a.direction === 'long' ? 'LONG' : 'SHORT',
    horizon: proLevels.tradeHorizon(tf),
    consensus: +a.components.consensus.toFixed(2), avgVoteScore: Math.round(a.components.avgScore),
    ...levels,
    sizing, pnl, mt5,
    votes: a.votes, conditions: a.conditions, indicators: a.indicators,
    regime: a.regime, regimeMultiplier: a.regimeMultiplier,
    _c: { ...a.components, rr1: levels.rr1 },
  };
}

// ── Tek enstrüman: tüm TF + konfluans kapısı + final güven ──────────────────
async function evalInstrument(inst, equity, weights) {
  const meta = { id: inst.id, name: inst.name, symbol: inst.symbol, class: inst.class, precision: inst.precision, tvSymbol: inst.tvSymbol, prefix: inst.prefix };

  const m5 = await forexKlines.fetchCandles(inst.yahoo, '5m', 60);
  let ref = (m5 && m5.length) ? m5[m5.length - 1] : null;
  if (!ref) { const m15 = await forexKlines.fetchCandles(inst.yahoo, '15m', 60); ref = (m15 && m15.length) ? m15[m15.length - 1] : null; }
  if (!ref) return { ...meta, status: 'no_data', perTf: {} };

  const ageMin = (Date.now() / 1000 - ref.time) / 60;
  const open = inst.alwaysOpen || ageMin <= STALE_MINUTES;
  if (!open) return { ...meta, status: 'closed', ageMin: Math.round(ageMin), perTf: {} };

  const livePrice = ref.close;
  const arr = await Promise.all(TFS.map(tf => evalTF(inst, tf, livePrice, equity, weights)));
  const perTf = {};
  for (const r of arr) perTf[r.tf] = r;

  // ── Konfluans: ≥3/4 TF aynı yön + (4h veya 1d) dahil ──
  const sigTfs = TFS.filter(tf => perTf[tf]?.status === 'signal');
  const longTfs = sigTfs.filter(tf => perTf[tf].direction === 'long');
  const shortTfs = sigTfs.filter(tf => perTf[tf].direction === 'short');
  const hasHigh = (tfs) => tfs.some(tf => HIGH_TFS.includes(tf));
  let domDir = null, domTfs = [];
  if (longTfs.length >= MIN_CONFLUENCE_TFS && hasHigh(longTfs)) { domDir = 'long'; domTfs = longTfs; }
  else if (shortTfs.length >= MIN_CONFLUENCE_TFS && hasHigh(shortTfs)) { domDir = 'short'; domTfs = shortTfs; }

  for (const tf of TFS) {
    const s = perTf[tf];
    if (!s || s.status !== 'signal') continue;
    if (domDir && s.direction === domDir && domTfs.includes(tf)) {
      const confluence = domTfs.length / TFS.length;
      let rawConfidence = computeConfidence({ ...s._c, confluence });
      rawConfidence = Math.round(rawConfidence * (s.regimeMultiplier ?? 1)); // volatilite kapısı
      const h = getHistory(meta.id, tf, rawConfidence);
      const cal = calibrateConfidence(rawConfidence, h);
      const confidence = CALIBRATION_ACTIVE ? cal.confidence : rawConfidence;
      s.confluence = +confluence.toFixed(2);
      s.sameTfCount = domTfs.length;
      s.confidence = confidence;
      s.rawConfidence = rawConfidence;
      s.calibratedConfidence = cal.confidence;
      s.confidenceCalibration = { empirical: cal.empirical, trust: cal.trust, delta: cal.delta };
      s.grade = gradeFor(confidence);
      s.confidenceBand = bandFor(confidence);
      if (h) { s.historicalWinRate = h.winRate; s.sampleSize = h.sampleSize; s.historicalAvgReturn = h.avgReturn; s.profitFactor = h.profitFactor; s.historyBand = h.band; }
      delete s._c;
      if (confidence < MIN_CONFIDENCE) perTf[tf] = { tf, status: 'low_conf', direction: s.direction, confidence, votes: s.votes };
    } else {
      // baskın konfluansta değil → bastır (mükerrer/zayıf sinyal yok)
      perTf[tf] = { tf, status: 'no_confluence', direction: s.direction, votes: s.votes };
    }
  }

  return { ...meta, status: 'open', livePrice, perTf, confluence: domDir ? { direction: domDir, tfs: domTfs } : null };
}

// ── Tüm evren ────────────────────────────────────────────────────────────────
async function generate(equity = DEFAULT_EQUITY) {
  const weights = getWeights();
  const insts = await Promise.all(INSTRUMENTS.map(i => evalInstrument(i, equity, weights)));
  const signals = [];
  for (const it of insts) {
    if (it.status !== 'open') continue;
    for (const tf of TFS) {
      const s = it.perTf[tf];
      if (s && s.status === 'signal') {
        signals.push({ id: it.id, name: it.name, symbol: it.symbol, class: it.class, precision: it.precision, tvSymbol: it.tvSymbol, prefix: it.prefix, ...s });
      }
    }
  }
  signals.sort((a, b) => b.confidence - a.confidence);

  latest = {
    generatedAt: new Date().toISOString(),
    robot: 'YENİ ROBOT',
    equity,
    portfolio: { equity, leverage: 100, dailyMaxLossPct: 5, totalMaxLossPct: 10 },
    tfs: TFS,
    weights,
    counts: {
      scanned: INSTRUMENTS.length,
      open: insts.filter(i => i.status === 'open').length,
      signal: signals.length,
      long: signals.filter(s => s.direction === 'long').length,
      short: signals.filter(s => s.direction === 'short').length,
    },
    instruments: insts,
    signals,
  };
  return latest;
}

function getLatest() { return latest; }

// ── Portföy değişince yeniden taramadan ölçekle ─────────────────────────────
function rescale(equity) {
  if (!latest) return null;
  if (!equity || equity === latest.equity) return latest;
  const redo = (s) => {
    const i = getInstrument(s.id);
    if (!i) return s;
    const sizing = computeSizing({ instrument: i, entry: s.entry, stop: s.stop, direction: s.direction }, { equity });
    if (!sizing) return s;
    const pnl = proLevels.buildPnL(sizing.units, s.entry, { stop: s.stop, target1: s.target1, target2: s.target2 });
    const mt5 = proLevels.buildMt5(i, s.direction, sizing.lots, { entry: s.entry, stop: s.stop, target1: s.target1, target2: s.target2 }, s.tf, s.precision);
    return { ...s, sizing, pnl, mt5 };
  };
  const signals = latest.signals.map(redo);
  const instruments = latest.instruments.map(it => {
    if (it.status !== 'open') return it;
    const perTf = {};
    for (const tf of TFS) { const s = it.perTf[tf]; perTf[tf] = (s && s.status === 'signal') ? redo(s) : s; }
    return { ...it, perTf };
  });
  return { ...latest, equity, portfolio: { ...latest.portfolio, equity }, instruments, signals };
}

async function analyzeOne(id, equity = DEFAULT_EQUITY) {
  const inst = getInstrument(id);
  if (!inst) return null;
  return evalInstrument(inst, equity, getWeights());
}

module.exports = { generate, getLatest, rescale, analyzeOne, TFS, MIN_CONFIDENCE, MIN_CONFLUENCE_TFS, DEFAULT_EQUITY };
