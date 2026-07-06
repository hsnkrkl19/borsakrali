/**
 * Forex Çoklu-Zaman (MTF) Çoklu-Strateji Motoru — Borsa Krali
 *
 * Her enstrüman (10) × her TF (5m/15m/1h/4h/1d) için 5 tekniği çalıştırır
 * (Genel Tarama + EMA34 + TEMA34 + SNR + SMC), yönü ve 0-100 GÜVEN NOTunu
 * üretir; giriş/SL/TP/lot/muhtemel kâr-zarar + MT5 emri ekler. Her dk çağrılır.
 * Canlı fiyat 1m mumdan; piyasası kapalı (bayat) enstrüman elenir.
 *
 * Portföy değeri ayarlanabilir (varsayılan 10k$); custom equity için sinyaller
 * yeniden taranmadan lot/kâr-zarar anında ölçeklenir (rescale).
 */

const forexKlines = require('./forexKlines');
const { atr } = require('./indicators');
const genel = require('./strategies/genelTarama');
const ema34 = require('./strategies/ema34');
const tema34 = require('./strategies/tema34');
const snrStrat = require('./strategies/snr');
const smcStrat = require('./strategies/smc');
const { aggregate, computeConfidence, calibrateConfidence, gradeFor, bandFor } = require('./forexAggregator');
const levelsLib = require('./forexLevels');
const { computeSizing } = require('./riskSizing');
const forexBacktest = require('./forexBacktest');
const brokerPrices = require('./brokerPrices');
const { INSTRUMENTS, getInstrument } = require('./forexInstruments');

const TFS = ['15m', '1h', '4h', '1d']; // 5m KALDIRILDI (kullanıcı: az sinyal/düzeltme, az yanlış)
const STALE_MINUTES = 15;
const MIN_CONFIDENCE = 40;     // altı → "neutral" (işleme değer sinyal yok)
const DEFAULT_EQUITY = 10000;

let latest = null;             // bellek-içi son anlık görüntü (equity=DEFAULT)

function assetTypeFor(cls) { return cls === 'crypto' ? 'crypto' : cls === 'metal' ? 'commodity' : 'stock'; }

// ── Tek (enstrüman, TF) değerlendirmesi ────────────────────────────────────
async function evalTF(inst, tf, livePrice, equity) {
  // B1 (repaint fix, denetim 2026-07-05): OLUSAN (yarim) mumu dusur -> sinyal
  // yalniz KAPALI mumda uretilir (canli=backtest). forexKlines forming bar'i
  // dusurmuyordu; 1m canli-fiyat/bayatlik akisina DOKUNULMAZ (o evalInstrument'ta).
  const _rawCandles = await forexKlines.fetchCandles(inst.yahoo, tf, 301);
  const candles = (_rawCandles && _rawCandles.length) ? _rawCandles.slice(0, -1) : _rawCandles;
  if (!candles || candles.length < 60) return { tf, status: 'no_data' };

  const assetType = assetTypeFor(inst.class);
  const [snrRes, smcRes] = await Promise.all([
    snrStrat.evaluate(candles, inst.id, tf, assetType),
    smcStrat.evaluate(candles, inst.id, tf, assetType),
  ]);
  const gen = genel.evaluate(candles);
  const e34 = ema34.evaluate(candles);
  const t34 = tema34.evaluate(candles);

  const agg = aggregate([gen, e34, t34, snrRes, smcRes], gen?.ind);
  if (agg.direction === 'neutral') return { tf, status: 'neutral', votes: agg.votes };

  const atrVal = atr(candles, 14);
  const entry = livePrice || candles[candles.length - 1].close;
  const levels = levelsLib.buildLevels(agg.direction, entry, atrVal, tf, inst.precision);
  if (!levels) return { tf, status: 'neutral', votes: agg.votes };

  const sizing = computeSizing({ instrument: inst, entry: levels.entry, stop: levels.stop, direction: agg.direction }, { equity });
  if (!sizing) return { tf, status: 'neutral', votes: agg.votes };

  const pnl = levelsLib.buildPnL(sizing.units, levels.entry, levels);
  const mt5 = levelsLib.buildMt5(inst, agg.direction, sizing.lots, levels, tf, inst.precision);

  const conditions = [];
  for (const m of agg.modules) for (const c of (m.conditions || [])) if (c.met) conditions.push({ ...c, technique: m.technique });

  // confluence sonra eklenecek; güven bileşenlerini sakla
  const confComponents = { consensus: agg.consensus, avgScore: agg.avgScore, trendStrength: agg.trendStrength, momentum: agg.momentum, rr1: levels.rr1 };

  return {
    tf, status: 'signal',
    direction: agg.direction, action: agg.direction === 'long' ? 'LONG' : 'SHORT',
    horizon: levelsLib.tradeHorizon(tf),
    consensus: +agg.consensus.toFixed(2), avgVoteScore: Math.round(agg.avgScore),
    ...levels,
    sizing, pnl, mt5,
    votes: agg.votes, conditions,
    indicators: gen?.ind || null,
    _c: confComponents,
  };
}

// ── Tek enstrüman: tüm TF'ler + confluence + final güven notu ──────────────
async function evalInstrument(inst, equity) {
  const meta = { id: inst.id, name: inst.name, symbol: inst.symbol, class: inst.class, precision: inst.precision, tvSymbol: inst.tvSymbol };
  const m1 = await forexKlines.fetchCandles(inst.yahoo, '1m', 60);
  let ref = (m1 && m1.length) ? m1[m1.length - 1] : null;
  if (!ref) { const m5 = await forexKlines.fetchCandles(inst.yahoo, '5m', 60); ref = (m5 && m5.length) ? m5[m5.length - 1] : null; }
  if (!ref) return { ...meta, status: 'no_data', perTf: {} };

  const ageMin = (Date.now() / 1000 - ref.time) / 60;
  const open = inst.alwaysOpen || ageMin <= STALE_MINUTES;
  if (!open) return { ...meta, status: 'closed', ageMin: Math.round(ageMin), perTf: {} };

  // Fiyat kaynağı: köprü taze broker bid/ask gönderdiyse ONU kullan (Yahoo vadeli
  // basis'ini giderir → sinyal seviyeleri broker'a oturur); yoksa Yahoo son kapanış.
  const bp = brokerPrices.get(inst.id);
  const livePrice = (bp && bp.mid > 0) ? bp.mid : ref.close;
  const priceSource = (bp && bp.mid > 0) ? 'broker' : 'yahoo';
  const arr = await Promise.all(TFS.map(tf => evalTF(inst, tf, livePrice, equity)));
  const perTf = {};
  for (const r of arr) perTf[r.tf] = r;

  // Confluence: aynı yöndeki TF sayısı (kendisi dahil) / toplam TF
  const dirs = TFS.map(tf => perTf[tf]?.direction).filter(Boolean);
  for (const tf of TFS) {
    const s = perTf[tf];
    if (!s || s.status !== 'signal') continue;
    const sameCount = dirs.filter(d => d === s.direction).length;
    const confluence = Math.max(0, (sameCount - 1) / (TFS.length - 1));
    const rawConfidence = computeConfidence({ ...s._c, confluence });
    // Backtest-tabanlı geçmiş başarı (Sinyaller komuta merkezi mantığı)
    const h = forexBacktest.getHistory(meta.id, tf, rawConfidence);
    // AKTİF KALİBRASYON: ampirik PF/expectancy güveni SINIRLI delta (±15) ile
    // düzeltir — daha önce yalnız görüntülenip hiç UYGULANMIYORDU (ölü koddu).
    // Kapatma: FOREX_CALIBRATION_ACTIVE=0
    let confidence = rawConfidence;
    if (process.env.FOREX_CALIBRATION_ACTIVE !== '0' && h) {
      const cal = calibrateConfidence(rawConfidence, h);
      confidence = cal.confidence;
      if (cal.delta) s.calibration = { delta: cal.delta, empirical: cal.empirical, trust: cal.trust };
    }
    s.confluence = +confluence.toFixed(2);
    s.sameTfCount = sameCount;
    s.rawConfidence = rawConfidence;
    s.confidence = confidence;
    s.grade = gradeFor(confidence);
    s.confidenceBand = bandFor(confidence);
    if (h) { s.historicalWinRate = h.winRate; s.sampleSize = h.sampleSize; s.historicalAvgReturn = h.avgReturn; s.historyBand = h.band; }
    delete s._c;
    if (confidence < MIN_CONFIDENCE) { perTf[tf] = { tf, status: 'low_conf', direction: s.direction, confidence, votes: s.votes }; }
  }

  // ── REJİM (2026-07-06): 4h VE 1d aynı yönü gösteriyorsa bu bir rejimdir. Her
  // geçen sinyale eklenir (s.regime) — tracker'ın anti-FOMO trend istisnası buna
  // bakar (giriş-TF'inin kendi DI'sı kendi kendini onaylıyordu, review bulgusu).
  const d4 = perTf['4h']?.direction, d1 = perTf['1d']?.direction;
  const regime = (d4 && d1 && d4 === d1) ? d4 : null;
  for (const tf of TFS) {
    const s = perTf[tf];
    if (s && s.status === 'signal') s.regime = regime;
  }
  // ── REJİM VETOSU: ters-yön sinyal ancak ÇOK yüksek güvenle geçer. Gece boyu
  // düşen piyasada ters-yön dip-alım long'ları (hepsi zarar) bu kapının yokluğundan
  // açıldı. Kapatma: FOREX_COUNTERTREND_GATE_DISABLED=1 · eşik: FOREX_COUNTERTREND_MIN_CONF (80).
  if (regime && process.env.FOREX_COUNTERTREND_GATE_DISABLED !== '1') {
    const minCf = Number(process.env.FOREX_COUNTERTREND_MIN_CONF) || 80;
    for (const tf of TFS) {
      const s = perTf[tf];
      if (s && s.status === 'signal' && s.direction !== regime && s.confidence < minCf) {
        perTf[tf] = { tf, status: 'counter_trend', direction: s.direction, confidence: s.confidence, regime, votes: s.votes };
      }
    }
  }

  return { ...meta, status: 'open', livePrice, priceSource, perTf };
}

// ── Tüm evren ──────────────────────────────────────────────────────────────
async function generate(equity = DEFAULT_EQUITY) {
  const insts = await Promise.all(INSTRUMENTS.map(i => evalInstrument(i, equity)));
  const signals = [];
  for (const it of insts) {
    if (it.status !== 'open') continue;
    for (const tf of TFS) {
      const s = it.perTf[tf];
      if (s && s.status === 'signal') {
        signals.push({ id: it.id, name: it.name, symbol: it.symbol, class: it.class, precision: it.precision, tvSymbol: it.tvSymbol, ...s });
      }
    }
  }
  signals.sort((a, b) => b.confidence - a.confidence);

  latest = {
    generatedAt: new Date().toISOString(),
    equity,
    portfolio: { equity, leverage: 100, dailyMaxLossPct: 5, totalMaxLossPct: 10 },
    tfs: TFS,
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

// ── Portföy değişince: yeniden taramadan lot/kâr-zarar/MT5 ölçekle ──────────
function rescale(equity) {
  if (!latest) return null;
  if (!equity || equity === latest.equity) return latest;
  const inst = (id) => getInstrument(id);
  const redo = (s) => {
    const i = inst(s.id);
    if (!i) return s;
    const sizing = computeSizing({ instrument: i, entry: s.entry, stop: s.stop, direction: s.direction }, { equity });
    if (!sizing) return s;
    const pnl = levelsLib.buildPnL(sizing.units, s.entry, { stop: s.stop, target1: s.target1, target2: s.target2 });
    const mt5 = levelsLib.buildMt5(i, s.direction, sizing.lots, { entry: s.entry, stop: s.stop, target1: s.target1, target2: s.target2 }, s.tf, s.precision);
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

// ── Tek enstrüman canlı analiz ─────────────────────────────────────────────
async function analyzeOne(id, equity = DEFAULT_EQUITY) {
  const inst = getInstrument(id);
  if (!inst) return null;
  return evalInstrument(inst, equity);
}

module.exports = { generate, getLatest, rescale, analyzeOne, TFS, MIN_CONFIDENCE, DEFAULT_EQUITY };
