/**
 * MTF Scorer — Borsa Krali (Multi-Timeframe)
 *
 * TF-generic skorlama motoru: tek bir timeframe için spot/long/short sinyalleri
 * üretir. cryptoScorer.js'in TF-bağımsız jenerik versiyonu.
 *
 * Her TF için 12 koşul × 3 strateji üzerinden değerlendirme yapar:
 *   - 5 koşul "current TF" üzerinde (entry timeframe)
 *   - 4 koşul "higher TF" üzerinde (macro context)
 *   - 3 koşul gelişmiş matematik/örüntü (divergence, candlestick, volatilite rejimi)
 *
 * AI/Math katmanı:
 *   - RSI/MACD divergence (mtfPatternDetection.detectDivergence)
 *   - Candlestick pattern teyidi (engulfing, hammer, shooting star)
 *   - Volatilite rejimi filtresi (yüksek volatilitede kontra-trend riskli)
 *   - Momentum ivmesi (MACD histogram 2. türevi)
 *
 * ZORUNLU koşullar geçmediyse strateji null döner.
 */

const patterns = require('./mtfPatternDetection');
const calibration = require('./mtfCalibrationService');

// ───────────────────────────────────────────────────────────────────────────
// SPOT / FUTURES_LONG koşul kataloğu (12 koşul, max 12 puan)
// ───────────────────────────────────────────────────────────────────────────

const LONG_CONDITIONS = [
  // ── Current TF ──────────────────────────────────────────────────────────
  {
    id: 'current_uptrend',
    label: ctx => `${ctx._currentTF} EMA20 > EMA50`,
    why: 'Entry zaman diliminde kısa vadeli yapı yukarı yönlü.',
    group: 'trend',
    required: true,
    evaluate: (ctx) => ctx.current?.ema20 != null && ctx.current?.ema50 != null && ctx.current.ema20 > ctx.current.ema50,
  },
  {
    id: 'current_above_ema200',
    label: ctx => `${ctx._currentTF} fiyat EMA200 üstü`,
    why: 'Entry TF\'de uzun vadeli ana trend boğa.',
    group: 'trend',
    evaluate: (ctx) => ctx.lastClose != null && ctx.current?.ema200 != null && ctx.lastClose > ctx.current.ema200,
  },
  {
    id: 'current_rsi_healthy',
    label: ctx => `${ctx._currentTF} RSI 45-72`,
    why: 'Aşırı satımdan çıkmış, aşırı alıma girmemiş — sağlıklı momentum.',
    group: 'ind',
    required: true,
    evaluate: (ctx) => {
      const r = ctx.current?.rsi;
      return r != null && r >= 45 && r <= 72;
    },
  },
  {
    id: 'current_macd_bullish',
    label: ctx => `${ctx._currentTF} MACD pozitif + büyüyor`,
    why: 'MACD histogramı pozitif ve son barda büyüyor — momentum güçleniyor.',
    group: 'ind',
    evaluate: (ctx) => {
      const h = ctx.current?.macdHist, hP = ctx.current?.macdHistPrev;
      if (h == null) return false;
      return h > 0 && (hP == null ? true : h > hP);
    },
  },
  {
    id: 'current_volume_above_avg',
    label: ctx => `${ctx._currentTF} hacim 20-bar SMA üstü`,
    why: 'Son mum hacmi ortalama üstünde — alıcı katılımı var.',
    group: 'ind',
    evaluate: (ctx) => {
      const v = ctx.current?.lastVolume, avg = ctx.current?.volumeAvg20;
      return v && avg && v > avg;
    },
  },
  // ── Higher TF (macro context) ───────────────────────────────────────────
  {
    id: 'higher_uptrend',
    label: ctx => `${ctx._higherTF} EMA20 > EMA50 (macro)`,
    why: 'Üst zaman diliminde de yapı yukarı — kontra-trend değil.',
    group: 'macro',
    evaluate: (ctx) => ctx.higher?.ema20 != null && ctx.higher?.ema50 != null && ctx.higher.ema20 > ctx.higher.ema50,
  },
  {
    id: 'higher_above_ema50',
    label: ctx => `${ctx._higherTF} fiyat EMA50 üstü`,
    why: 'Üst TF orta vadeli ortalama üstünde — sağlam zemin.',
    group: 'macro',
    evaluate: (ctx) => ctx.lastClose != null && ctx.higher?.ema50 != null && ctx.lastClose > ctx.higher.ema50,
  },
  {
    id: 'higher_rsi_not_overbought',
    label: ctx => `${ctx._higherTF} RSI < 75`,
    why: 'Üst TF aşırı alımda değil — yukarı alanı var.',
    group: 'macro',
    evaluate: (ctx) => {
      const r = ctx.higher?.rsi;
      return r != null && r < 75;
    },
  },
  {
    id: 'higher_macd_aligned',
    label: ctx => `${ctx._higherTF} MACD ≥ 0`,
    why: 'Üst TF momentumu da long lehine.',
    group: 'macro',
    evaluate: (ctx) => {
      const h = ctx.higher?.macdHist;
      return h != null && h >= 0;
    },
  },
  // ── AI/Math katmanı ─────────────────────────────────────────────────────
  {
    id: 'bullish_divergence',
    label: () => 'Bullish RSI divergence',
    why: 'Fiyat lower-low, RSI higher-low — trend dönüşü olası.',
    group: 'math',
    evaluate: (ctx) => {
      const div = ctx.divergence;
      return div && (div.type === 'regular_bullish' || div.type === 'hidden_bullish');
    },
  },
  {
    id: 'bullish_candlestick',
    label: () => 'Boğa candlestick formasyonu',
    why: 'Bullish engulfing / hammer / bullish harami son barda var.',
    group: 'pattern',
    evaluate: (ctx) => {
      const p = ctx.patterns;
      if (!p) return false;
      return p.engulfing?.type === 'bullish_engulfing'
          || p.pinBar?.type === 'hammer'
          || p.harami?.type === 'bullish_harami';
    },
  },
  {
    id: 'volatility_supportive',
    label: () => 'Volatilite trade için uygun',
    why: 'ATR rejimi normal/low — yüksek volatilitede kontra-trend giriş riskli.',
    group: 'math',
    evaluate: (ctx) => ctx.volatility?.regime !== 'high',
  },
];

// ───────────────────────────────────────────────────────────────────────────
// FUTURES_SHORT koşul kataloğu (12 koşul) — long'un ayna görüntüsü
// ───────────────────────────────────────────────────────────────────────────

const SHORT_CONDITIONS = [
  // ── Current TF ──────────────────────────────────────────────────────────
  {
    id: 'current_downtrend',
    label: ctx => `${ctx._currentTF} EMA20 < EMA50`,
    why: 'Entry TF\'de kısa vadeli yapı aşağı yönlü.',
    group: 'trend',
    required: true,
    evaluate: (ctx) => ctx.current?.ema20 != null && ctx.current?.ema50 != null && ctx.current.ema20 < ctx.current.ema50,
  },
  {
    id: 'current_below_ema200',
    label: ctx => `${ctx._currentTF} fiyat EMA200 altı`,
    why: 'Entry TF\'de uzun vadeli ana trend ayı.',
    group: 'trend',
    evaluate: (ctx) => ctx.lastClose != null && ctx.current?.ema200 != null && ctx.lastClose < ctx.current.ema200,
  },
  {
    id: 'current_rsi_overbought_recently',
    label: ctx => `${ctx._currentTF} RSI overbought'tan döndü`,
    why: 'Son 10 barda RSI 70 üstünü gördü, şimdi aşağı dönüyor.',
    group: 'ind',
    required: true,
    evaluate: (ctx) => {
      const r = ctx.current?.rsi;
      const rMax = ctx.current?.rsiRecentMax;
      if (r == null || rMax == null) return false;
      return rMax >= 70 && r < rMax && r < 65;
    },
  },
  {
    id: 'current_macd_bearish',
    label: ctx => `${ctx._currentTF} MACD negatif + büyüyor`,
    why: 'MACD histogramı negatif ve daha negatif oluyor — düşüş momentumu artıyor.',
    group: 'ind',
    evaluate: (ctx) => {
      const h = ctx.current?.macdHist, hP = ctx.current?.macdHistPrev;
      if (h == null) return false;
      return h < 0 && (hP == null ? true : h < hP);
    },
  },
  {
    id: 'current_volume_on_decline',
    label: ctx => `${ctx._currentTF} hacimli düşüş`,
    why: 'Son mum kırmızı + hacim ortalama üstü — satıcı baskısı güçlü.',
    group: 'ind',
    evaluate: (ctx) => {
      const last = ctx.current?.lastCandle;
      if (!last) return false;
      const isRed = last.close < last.open;
      const v = last.volume, avg = ctx.current?.volumeAvg20;
      return isRed && v && avg && v > avg;
    },
  },
  // ── Higher TF ───────────────────────────────────────────────────────────
  {
    id: 'higher_downtrend',
    label: ctx => `${ctx._higherTF} EMA20 < EMA50 (macro)`,
    why: 'Üst TF\'de yapı da aşağı.',
    group: 'macro',
    evaluate: (ctx) => ctx.higher?.ema20 != null && ctx.higher?.ema50 != null && ctx.higher.ema20 < ctx.higher.ema50,
  },
  {
    id: 'higher_below_ema50',
    label: ctx => `${ctx._higherTF} fiyat EMA50 altı`,
    why: 'Üst TF orta vadeli ortalama altında.',
    group: 'macro',
    evaluate: (ctx) => ctx.lastClose != null && ctx.higher?.ema50 != null && ctx.lastClose < ctx.higher.ema50,
  },
  {
    id: 'higher_rsi_not_oversold',
    label: ctx => `${ctx._higherTF} RSI > 25`,
    why: 'Üst TF aşırı satımda değil — aşağı alanı var.',
    group: 'macro',
    evaluate: (ctx) => {
      const r = ctx.higher?.rsi;
      return r != null && r > 25;
    },
  },
  {
    id: 'higher_macd_negative',
    label: ctx => `${ctx._higherTF} MACD ≤ 0`,
    why: 'Üst TF momentumu da short lehine.',
    group: 'macro',
    evaluate: (ctx) => {
      const h = ctx.higher?.macdHist;
      return h != null && h <= 0;
    },
  },
  // ── AI/Math ─────────────────────────────────────────────────────────────
  {
    id: 'bearish_divergence',
    label: () => 'Bearish RSI divergence',
    why: 'Fiyat higher-high, RSI lower-high — trend dönüşü olası.',
    group: 'math',
    evaluate: (ctx) => {
      const div = ctx.divergence;
      return div && (div.type === 'regular_bearish' || div.type === 'hidden_bearish');
    },
  },
  {
    id: 'bearish_candlestick',
    label: () => 'Ayı candlestick formasyonu',
    why: 'Bearish engulfing / shooting star / bearish harami son barda var.',
    group: 'pattern',
    evaluate: (ctx) => {
      const p = ctx.patterns;
      if (!p) return false;
      return p.engulfing?.type === 'bearish_engulfing'
          || p.pinBar?.type === 'shooting_star'
          || p.harami?.type === 'bearish_harami';
    },
  },
  {
    id: 'volatility_supportive',
    label: () => 'Volatilite trade için uygun',
    why: 'ATR rejimi normal/low — high volatilite false breakout riski.',
    group: 'math',
    evaluate: (ctx) => ctx.volatility?.regime !== 'high',
  },
];

// ───────────────────────────────────────────────────────────────────────────
// CONDITION GROUPS
// ───────────────────────────────────────────────────────────────────────────

const CONDITION_GROUPS = {
  trend:   { label: 'Trend',         color: 'sky' },
  ind:     { label: 'İndikatörler',  color: 'emerald' },
  macro:   { label: 'Üst Zaman Dilimi', color: 'fuchsia' },
  math:    { label: 'Matematik / AI', color: 'purple' },
  pattern: { label: 'Mum Formasyonu', color: 'amber' },
};

// TF-spesifik R/R ve stop multiplier
//   - Kısa TF'de daha sıkı stop, küçük target (scalping mantığı)
//   - Uzun TF'de geniş stop, büyük target (swing/pozisyon mantığı)
//   - leverageBase: scalping'de 5x maks (volatilite riskli), 4h/swing'de 5-7x optimum
const TF_RISK_PROFILE = {
  '1m':  { stopAtrMult: 0.8, target1AtrMult: 1.0, target2AtrMult: 1.5, leverageBase: 4 },
  '5m':  { stopAtrMult: 1.0, target1AtrMult: 1.3, target2AtrMult: 2.0, leverageBase: 5 },
  '15m': { stopAtrMult: 1.2, target1AtrMult: 1.6, target2AtrMult: 2.5, leverageBase: 5 },
  '1h':  { stopAtrMult: 1.2, target1AtrMult: 1.8, target2AtrMult: 3.0, leverageBase: 3 },
  '4h':  { stopAtrMult: 1.5, target1AtrMult: 2.5, target2AtrMult: 4.0, leverageBase: 5 },
  '1d':  { stopAtrMult: 2.0, target1AtrMult: 3.5, target2AtrMult: 6.0, leverageBase: 3 },
  '1w':  { stopAtrMult: 2.5, target1AtrMult: 5.0, target2AtrMult: 10.0, leverageBase: 1 },
};

// ───────────────────────────────────────────────────────────────────────────
// SCORING
// ───────────────────────────────────────────────────────────────────────────

function gradeFromRatio(r) {
  if (r >= 0.75) return 'MUKEMMEL';
  if (r >= 0.55) return 'GUCLU';
  if (r >= 0.35) return 'ORTA';
  return 'ZAYIF';
}

function precisionFor(price) {
  if (price >= 1000) return 2;
  if (price >= 10) return 3;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  return 8;
}

function buildLevels(direction, lastClose, atr, tf) {
  const profile = TF_RISK_PROFILE[tf] || TF_RISK_PROFILE['4h'];
  const p = precisionFor(lastClose);
  if (direction === 'long') {
    return {
      entry:   +lastClose.toFixed(p),
      stop:    +(lastClose - profile.stopAtrMult    * atr).toFixed(p),
      target1: +(lastClose + profile.target1AtrMult * atr).toFixed(p),
      target2: +(lastClose + profile.target2AtrMult * atr).toFixed(p),
    };
  }
  return {
    entry:   +lastClose.toFixed(p),
    stop:    +(lastClose + profile.stopAtrMult    * atr).toFixed(p),
    target1: +(lastClose - profile.target1AtrMult * atr).toFixed(p),
    target2: +(lastClose - profile.target2AtrMult * atr).toFixed(p),
  };
}

function suggestLeverage(tf, score, direction) {
  const profile = TF_RISK_PROFILE[tf] || TF_RISK_PROFILE['4h'];
  if (direction === 'spot') return 1;
  // Yüksek skorda daha düşük kaldıraç (büyüklüğü artar)
  if (score >= 10) return Math.min(profile.leverageBase + 2, 10);
  if (score >= 8)  return profile.leverageBase;
  if (score >= 6)  return Math.max(profile.leverageBase - 1, 2);
  return 2;
}

function evaluateConditions(catalog, ctx) {
  return catalog.map(c => {
    let met = false;
    try { met = !!c.evaluate(ctx); } catch { met = false; }
    return {
      id: c.id,
      label: typeof c.label === 'function' ? c.label(ctx) : c.label,
      group: c.group,
      why: c.why,
      met,
      applicable: true,
      required: !!c.required,
    };
  });
}

function scoreDirection(catalog, ctx, direction, currentTF) {
  if (!ctx.lastClose || !ctx.atr) return null;
  const conditions = evaluateConditions(catalog, ctx);
  const requiredFailed = conditions.find(c => c.required && !c.met);
  if (requiredFailed) return null;

  const totalScore = conditions.filter(c => c.met).length;
  const applicableMax = conditions.length;
  const ratio = totalScore / applicableMax;
  const levels = buildLevels(direction, ctx.lastClose, ctx.atr, currentTF);

  const __sqSig = {
    strategy: direction === 'long' ? 'long' : 'short',
    direction,
    timeframe: currentTF,
    higherTimeframe: ctx._higherTF,
    totalScore,
    applicableMax,
    ratio: +ratio.toFixed(2),
    grade: gradeFromRatio(ratio),
    conditions,
    ...levels,
    leverage_suggest: suggestLeverage(currentTF, totalScore, direction),
    winProbability: calibration.getWinProbability(currentTF, totalScore, applicableMax, direction),
    indicators: {
      current_rsi: ctx.current?.rsi,
      current_macdHist: ctx.current?.macdHist,
      higher_rsi: ctx.higher?.rsi,
      higher_macdHist: ctx.higher?.macdHist,
    },
    patterns: ctx.patterns,
    divergence: ctx.divergence,
    volatility: ctx.volatility,
    momentum: ctx.momentum,
    lastClose: ctx.lastClose,
    atr: ctx.atr,
    updatedAt: new Date().toISOString(),
  };
  // signalQuality — fail-safe shadow gözlem (yayın kararını DEĞİŞTİRMEZ)
  try {
    require('./signalQuality/bridge').observe({ engine: 'mtfScorer', strategy: currentTF, direction, rawScore: totalScore, rawScoreScale: { min: 0, max: applicableMax }, candles: (ctx.current && ctx.current.recentBars) || null, levels: { entry: __sqSig.entry, stop: __sqSig.stop, target: __sqSig.target1 }, assetClass: 'crypto', symbol: ctx.symbol });
  } catch (_) {}
  return __sqSig;
}

/**
 * Ana giriş — bir TF için (current) + üst TF (higher) verisiyle long ve short skorla.
 *
 * ctx beklenir:
 *   {
 *     _currentTF: '1h',
 *     _higherTF:  '4h',
 *     lastClose, atr,
 *     current: { ema20, ema50, ema200, rsi, rsiRecentMax, macdHist, macdHistPrev,
 *                volumeAvg20, lastVolume, lastCandle, recentBars },
 *     higher:  { ema20, ema50, rsi, macdHist },
 *     patterns: { engulfing, pinBar, doji, harami },
 *     divergence: { type, ... },
 *     volatility: { regime, atrPct, ... },
 *     momentum: { type, accel },
 *   }
 */
function scoreSingleTimeframe(ctx) {
  if (!ctx?._currentTF) throw new Error('ctx._currentTF zorunlu');
  return {
    timeframe: ctx._currentTF,
    higherTimeframe: ctx._higherTF,
    long:  scoreDirection(LONG_CONDITIONS,  ctx, 'long',  ctx._currentTF),
    short: scoreDirection(SHORT_CONDITIONS, ctx, 'short', ctx._currentTF),
  };
}

module.exports = {
  scoreSingleTimeframe,
  scoreDirection,
  LONG_CONDITIONS,
  SHORT_CONDITIONS,
  CONDITION_GROUPS,
  TF_RISK_PROFILE,
  gradeFromRatio,
  precisionFor,
};
