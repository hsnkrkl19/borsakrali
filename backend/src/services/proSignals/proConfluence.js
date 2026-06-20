/**
 * YENİ ROBOT · DERİN KONFLUANS MOTORU
 *
 * Tek (enstrüman, TF) için sitedeki TÜM analiz tekniklerini çalıştırır ve her
 * birini normalize edilmiş bir "oy"a indirger:
 *   { technique, label, vote:'long'|'short'|'neutral', strength:0..1, score:0..100, weight }
 * Sonra eski forexAggregator ile yönü + ham 0-100 güven bileşenlerini üretir.
 *
 * Teknikler (hepsi mevcut modüllerden — yeniden hesap YOK):
 *   1) Genel Tarama (17 koşul)   2) EMA34 Wave   3) TEMA34
 *   4) Malaysian SNR             5) SMC          6) Elliott dalga
 *   7) Harmonik patern           8) Mum formasyonu (engulfing/hammer/harami)
 *   9) RSI+MACD uyumsuzluk       10) Momentum ivmesi (MACD hist 2. türev)
 *   11) ta4j bileşik (RSI/MACD/ADX/EMA/Bollinger)
 *   + Volatilite REJİMİ → yön oyu DEĞİL, güven KAPISI (düşük/choppy → güveni kıs).
 *
 * SAF/yan-etkisiz (cache'li alt servisler hariç) → golden test'lenebilir.
 * Skor konvansiyonu eski strateji modülleriyle BİREBİR: >50 = boğa, <50 = ayı.
 * Ağırlık vektörü self-test ile (sınırlı) ayarlanır; buraya dışarıdan enjekte
 * edilir → motor saf kalır, döngü olmaz.
 */

const genel = require('../forex/strategies/genelTarama');
const ema34 = require('../forex/strategies/ema34');
const tema34 = require('../forex/strategies/tema34');
const snrStrat = require('../forex/strategies/snr');
const smcStrat = require('../forex/strategies/smc');
const elliott = require('../waveScan/elliott');
const harmonic = require('../harmonicPatternService');
const mtf = require('../mtfPatternDetection');
const ta4j = require('../ta4j/taLibrary');
const { atr } = require('../forex/indicators');
const series = require('../customBots/indicators');
const { aggregate } = require('../forex/forexAggregator');

// Taban teknik ağırlıkları (çok-koşullu / yapısal teknikler daha güvenilir).
// self-test bunları [0.5, 4.0] arasında ±0.15/run sınırıyla ayarlar.
const BASE_WEIGHTS = Object.freeze({
  genel: 3.0, smc: 2.5, snr: 2.0, ema34: 1.5, tema34: 1.5,
  elliott: 1.5, harmonic: 1.2, ta4j: 1.5, candlestick: 1.0,
  divergence: 1.2, momentum: 1.0,
});
const TECHNIQUE_KEYS = Object.freeze(Object.keys(BASE_WEIGHTS));

// Düşük/sıkışık (choppy) volatilite rejiminde güveni kıs → az ama net sinyal.
const REGIME_MULT = { low: 0.85, normal: 1.0, high: 1.0, unknown: 1.0 };

function assetTypeFor(cls) {
  return cls === 'crypto' ? 'crypto' : cls === 'metal' ? 'commodity' : 'stock';
}

// ── Teknik adaptörleri (her biri normalize oy | null) ──────────────────────

function adaptElliott(candles, atrVal) {
  const s = elliott.detectSetup(candles, atrVal);
  if (!s) return null;
  const vote = s.direction; // 'long' | 'short'
  return {
    technique: 'elliott', label: 'Elliott Dalga', vote,
    strength: 0.7, score: vote === 'long' ? 78 : 22,
    conditions: [{ id: `elliott_${s.kind}`, label: s.label, group: 'elliott', met: true }],
    detail: { kind: s.kind, note: s.note },
  };
}

function adaptHarmonic(candles) {
  const h = harmonic.detectLatestHarmonic(candles, 0.04);
  if (!h) return null;
  const vote = h.direction === 'Bullish' ? 'long' : h.direction === 'Bearish' ? 'short' : 'neutral';
  if (vote === 'neutral') return null;
  const c = Math.max(50, Math.min(100, h.completion || 50));
  return {
    technique: 'harmonic', label: 'Harmonik Patern', vote,
    strength: +(c / 100).toFixed(2), score: vote === 'long' ? c : 100 - c,
    conditions: [{ id: `harmonic_${h.pattern}`, label: `${h.pattern} (${h.direction}, %${c})`, group: 'harmonic', met: true }],
    detail: { pattern: h.pattern, completion: c },
  };
}

function adaptCandlestick(candles) {
  const p = mtf.detectAllPatterns(candles);
  let bull = 0, bear = 0, str = 0.4;
  const hits = [];
  if (p.engulfing) {
    const big = Math.min(1, (p.engulfing.strength || 1) / 2);
    if (p.engulfing.type === 'bullish_engulfing') { bull++; str = Math.max(str, big); hits.push('Boğa Yutan'); }
    else { bear++; str = Math.max(str, big); hits.push('Ayı Yutan'); }
  }
  if (p.pinBar) {
    if (p.pinBar.type === 'hammer') { bull++; hits.push('Çekiç'); } else { bear++; hits.push('Kayan Yıldız'); }
  }
  if (p.harami) {
    if (p.harami.type === 'bullish_harami') { bull++; hits.push('Boğa Harami'); } else { bear++; hits.push('Ayı Harami'); }
  }
  if (bull === bear) return null; // doji/kararsız/eşit → oy yok
  const vote = bull > bear ? 'long' : 'short';
  const net = Math.abs(bull - bear);
  return {
    technique: 'candlestick', label: 'Mum Formasyonu', vote,
    strength: Math.min(1, 0.4 + 0.2 * net + (str - 0.4)),
    score: vote === 'long' ? Math.min(90, 55 + net * 12) : Math.max(10, 45 - net * 12),
    conditions: [{ id: 'candle_pat', label: hits.join(' + '), group: 'candlestick', met: true }],
  };
}

function alignedDivergence(closes, indArr) {
  const start = indArr.findIndex(v => v != null);
  if (start < 0) return null;
  const p = closes.slice(start);
  const ind = indArr.slice(start).map(v => (v == null ? 0 : v));
  if (p.length < 12) return null;
  return mtf.detectDivergence(p, ind, 40);
}

function adaptDivergence(closes, rsiArr, histArr) {
  const dRsi = alignedDivergence(closes, rsiArr);
  const dMacd = alignedDivergence(closes, histArr);
  let bull = 0, bear = 0, reg = false;
  const hits = [];
  for (const d of [dRsi, dMacd]) {
    if (!d) continue;
    if (d.type === 'regular_bullish') { bull++; reg = true; hits.push('RSI/MACD boğa uyumsuzluk'); }
    else if (d.type === 'hidden_bullish') { bull++; hits.push('gizli boğa uyumsuzluk'); }
    else if (d.type === 'regular_bearish') { bear++; reg = true; hits.push('RSI/MACD ayı uyumsuzluk'); }
    else if (d.type === 'hidden_bearish') { bear++; hits.push('gizli ayı uyumsuzluk'); }
  }
  if (bull === bear) return null;
  const vote = bull > bear ? 'long' : 'short';
  const strength = reg ? 0.6 : 0.4;
  return {
    technique: 'divergence', label: 'Uyumsuzluk', vote,
    strength, score: vote === 'long' ? (reg ? 66 : 58) : (reg ? 34 : 42),
    conditions: [{ id: 'divergence', label: hits.join(', '), group: 'divergence', met: true }],
  };
}

function adaptMomentum(histArr) {
  const clean = histArr.filter(v => v != null);
  const m = mtf.detectMomentumAcceleration(clean);
  if (!m) return null;
  let vote = 'neutral';
  if (m.type === 'bullish_acceleration') vote = 'long';
  else if (m.type === 'bearish_acceleration') vote = 'short';
  else return null; // decay → momentum sönüyor, yön oyu verme
  return {
    technique: 'momentum', label: 'Momentum İvmesi', vote,
    strength: 0.6, score: vote === 'long' ? 72 : 28,
    conditions: [{ id: 'momentum_accel', label: vote === 'long' ? 'Boğa momentum ivmesi' : 'Ayı momentum ivmesi', group: 'momentum', met: true }],
  };
}

function adaptTa4j(candles) {
  let t;
  try { t = ta4j.analyze(candles); } catch (_) { return null; }
  if (!t || t.overall === 'neutral') return null;
  const sig = t.signals || [];
  const bull = sig.filter(s => s.bias === 'bullish').length;
  const bear = sig.filter(s => s.bias === 'bearish').length;
  const tot = bull + bear || 1;
  const vote = t.overall === 'bullish' ? 'long' : 'short';
  const dom = Math.max(bull, bear) / tot;
  return {
    technique: 'ta4j', label: 'ta4j Bileşik', vote,
    strength: Math.min(1, dom),
    score: vote === 'long' ? Math.round(50 + dom * 40) : Math.round(50 - dom * 40),
    conditions: sig.filter(s => s.bias !== 'neutral').slice(0, 4)
      .map(s => ({ id: `ta4j_${s.indicator}`, label: s.note, group: 'ta4j', met: true })),
  };
}

/**
 * analyzeTF — bir (enstrüman, TF) mum dizisini TÜM tekniklerle değerlendir.
 * @param candles  [{time,open,high,low,close,volume}] eski→yeni (≥60)
 * @param opts     { id, tf, class|assetType, weights? }
 * @returns {status, direction, votes[], modules[], conditions[], components, indicators, atr, regime, regimeMultiplier}
 */
async function analyzeTF(candles, opts = {}) {
  if (!candles || candles.length < 60) return { status: 'no_data' };
  const weights = opts.weights || BASE_WEIGHTS;
  const assetType = opts.assetType || assetTypeFor(opts.class);
  const closes = candles.map(c => c.close);
  const atrVal = atr(candles, 14);
  const rsiArr = series.rsi(closes, 14);
  const histArr = series.macd(closes).hist;

  // SNR/SMC async (cache'li); diğerleri senkron
  const [snrRes, smcRes] = await Promise.all([
    snrStrat.evaluate(candles, opts.id, opts.tf, assetType),
    smcStrat.evaluate(candles, opts.id, opts.tf, assetType),
  ]);
  const gen = genel.evaluate(candles);
  const raw = [
    gen,
    ema34.evaluate(candles),
    tema34.evaluate(candles),
    snrRes,
    smcRes,
    adaptElliott(candles, atrVal),
    adaptHarmonic(candles),
    adaptCandlestick(candles),
    adaptDivergence(closes, rsiArr, histArr),
    adaptMomentum(histArr),
    adaptTa4j(candles),
  ].filter(Boolean);

  // Ağırlıkları enjekte et (self-test tuned vektörü)
  for (const m of raw) m.weight = weights[m.technique] ?? m.weight ?? 1;

  const agg = aggregate(raw, gen?.ind);
  const regime = mtf.detectVolatilityRegime(candles);
  const regimeMultiplier = REGIME_MULT[regime.regime] ?? 1;

  if (agg.direction === 'neutral') {
    return { status: 'neutral', direction: 'neutral', votes: agg.votes, regime, regimeMultiplier };
  }

  const conditions = [];
  for (const m of agg.modules) for (const c of (m.conditions || [])) if (c.met) conditions.push({ ...c, technique: m.technique });

  return {
    status: 'signal',
    direction: agg.direction,
    votes: agg.votes,
    modules: agg.modules,
    conditions,
    components: {
      consensus: agg.consensus,
      avgScore: agg.avgScore,
      trendStrength: agg.trendStrength,
      momentum: agg.momentum,
    },
    indicators: gen?.ind || null,
    atr: atrVal,
    regime,
    regimeMultiplier,
  };
}

module.exports = { analyzeTF, BASE_WEIGHTS, TECHNIQUE_KEYS, REGIME_MULT };
