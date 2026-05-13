/**
 * Crypto Scorer — Borsa Krali
 *
 * universalScorer'ın kripto'ya uyarlanmış versiyonu. Kripto'da KAP haberi /
 * SNR / harmonik patern kullanılmaz — sadece teknik indikatörler + funding
 * rate (futures için).
 *
 * Üç ayrı strateji:
 *
 *   SPOT_LONG     — Trend takip (4h trend + 1d EMA stack + RSI sağlıklı + hacim)
 *   FUTURES_LONG  — Momentum patlaması (4h kırılım + funding fırsatı + güçlü hacim)
 *   FUTURES_SHORT — Bozulan trend (RSI overbought + EMA stack ters + hacimli düşüş)
 *
 * Her strateji 10 koşul üzerinden puanlanır. Geçen her koşul +1 puan.
 * ZORUNLU koşullar geçmediyse strateji null döner (sinyal listede yer almaz).
 *
 * Ctx beklenir:
 *   {
 *     symbol, name,                      // 'BTC', 'Bitcoin'
 *     lastClose, lastVolume, atr,
 *     daily:  { ema20, ema50, ema200, rsi, macdHist, macdHistPrev, volumeAvg20, adx, recentBars },
 *     fourH:  { ema20, ema50, ema200, rsi, macdHist, macdHistPrev, volumeAvg20, recentBars,
 *               last20High, last20Low, lastClose, lastVolume },
 *     funding: { rate, nextTime } | null,  // sadece USDT-M perpetual'lerde
 *   }
 */

// ───────────────────────────────────────────────────────────────────────────
// SPOT_LONG — koşul kataloğu (10 koşul, max 10 puan)
// ───────────────────────────────────────────────────────────────────────────

const SPOT_LONG_CONDITIONS = [
  {
    id: 'daily_uptrend',
    label: '1D yukarı trend',
    why: '1D zaman diliminde EMA20 > EMA50 — ana trend yukarı.',
    group: 'trend',
    required: true,
    evaluate: (ctx) => {
      const e = ctx.daily || {};
      return e.ema20 != null && e.ema50 != null && e.ema20 > e.ema50;
    },
  },
  {
    id: 'daily_ema_stack',
    label: '1D EMA dizilimi (20>50>200)',
    why: 'Uzun vadeli yükseliş yapısı sağlam.',
    group: 'trend',
    evaluate: (ctx) => {
      const e = ctx.daily || {};
      return e.ema20 && e.ema50 && e.ema200 && e.ema20 > e.ema50 && e.ema50 > e.ema200;
    },
  },
  {
    id: 'price_above_ema200',
    label: 'Fiyat 1D EMA200 üstü',
    why: '1D EMA200 boğa-ayı ayrımı — üstünde olmak güvenli alan.',
    group: 'trend',
    evaluate: (ctx) => {
      const e = ctx.daily || {};
      return ctx.lastClose != null && e.ema200 != null && ctx.lastClose > e.ema200;
    },
  },
  {
    id: 'rsi_healthy',
    label: 'RSI sağlıklı bantta (35-70)',
    why: 'Aşırı satım bölgesinden çıkmış, aşırı alım bölgesine girmemiş.',
    group: 'ind',
    required: true,
    evaluate: (ctx) => {
      const r = ctx.daily?.rsi;
      return r != null && r >= 35 && r <= 70;
    },
  },
  {
    id: 'macd_bullish',
    label: '1D MACD pozitif + büyüyor',
    why: 'MACD histogramı pozitif ve son barda büyüyor — momentum güçleniyor.',
    group: 'ind',
    evaluate: (ctx) => {
      const h = ctx.daily?.macdHist, hP = ctx.daily?.macdHistPrev;
      if (h == null) return false;
      return h > 0 && (hP == null ? true : h > hP);
    },
  },
  {
    id: 'volume_above_avg',
    label: 'Hacim ortalama üstü',
    why: 'Son 1D mum hacmi 20-bar SMA üstünde — katılım var.',
    group: 'ind',
    evaluate: (ctx) => {
      const v = ctx.lastVolume, avg = ctx.daily?.volumeAvg20;
      return v && avg && v > avg;
    },
  },
  {
    id: 'adx_trending',
    label: 'ADX trend modunda (≥20)',
    why: '1D ADX ≥ 20 — fiyat yatay değil yönlü hareket ediyor.',
    group: 'ind',
    evaluate: (ctx) => (ctx.daily?.adx || 0) >= 20,
  },
  {
    id: '4h_uptrend',
    label: '4H trend uyumlu',
    why: '4H EMA20 > EMA50 — kısa vadeli yapı da yukarı.',
    group: 'trend',
    evaluate: (ctx) => {
      const e = ctx.fourH || {};
      return e.ema20 && e.ema50 && e.ema20 > e.ema50;
    },
  },
  {
    id: '4h_higher_high',
    label: '4H higher-high',
    why: 'Son 4H mum, son 20 4H mumun en yüksek kapanışı — momentum başlangıcı.',
    group: 'pa',
    evaluate: (ctx) => {
      const f = ctx.fourH || {};
      return f.lastClose != null && f.last20High != null && f.lastClose >= f.last20High * 0.99;
    },
  },
  {
    id: '4h_volume_breakout',
    label: '4H hacim patlaması',
    why: 'Son 4H mum hacmi 20-bar ortalamasının 1.5 katı — alıcı katılımı yüksek.',
    group: 'ind',
    evaluate: (ctx) => {
      const v = ctx.fourH?.lastVolume, avg = ctx.fourH?.volumeAvg20;
      return v && avg && v > avg * 1.5;
    },
  },
];

// ───────────────────────────────────────────────────────────────────────────
// FUTURES_LONG — momentum patlaması, kırılım sonrası agresif giriş
// ───────────────────────────────────────────────────────────────────────────

const FUTURES_LONG_CONDITIONS = [
  {
    id: '4h_breakout',
    label: '4H 20-bar yüksek kırıldı',
    why: '4H kapanış son 20 4H mum yüksek seviyesinin üstünde — kırılım gerçekleşti.',
    group: 'pa',
    required: true,
    evaluate: (ctx) => {
      const f = ctx.fourH || {};
      return f.lastClose != null && f.last20High != null && f.lastClose > f.last20High * 0.998;
    },
  },
  {
    id: '4h_uptrend',
    label: '4H yukarı trend',
    why: '4H EMA20 > EMA50 — kısa vadeli yapı yukarı yönlü.',
    group: 'trend',
    required: true,
    evaluate: (ctx) => {
      const e = ctx.fourH || {};
      return e.ema20 && e.ema50 && e.ema20 > e.ema50;
    },
  },
  {
    id: 'daily_uptrend',
    label: '1D yukarı trend uyumu',
    why: '1D EMA20 > EMA50 — kırılım ana trende uygun (kontra-trend değil).',
    group: 'trend',
    evaluate: (ctx) => {
      const e = ctx.daily || {};
      return e.ema20 && e.ema50 && e.ema20 > e.ema50;
    },
  },
  {
    id: 'rsi_strong',
    label: '4H RSI 50-75',
    why: 'RSI 50 üstü — alıcı kontrolde ama henüz aşırı alım değil.',
    group: 'ind',
    evaluate: (ctx) => {
      const r = ctx.fourH?.rsi;
      return r != null && r >= 50 && r <= 75;
    },
  },
  {
    id: 'macd_bullish_4h',
    label: '4H MACD pozitif + büyüyor',
    why: 'Momentum hızlanıyor — 4H MACD histogramı yukarı.',
    group: 'ind',
    evaluate: (ctx) => {
      const h = ctx.fourH?.macdHist, hP = ctx.fourH?.macdHistPrev;
      if (h == null) return false;
      return h > 0 && (hP == null ? true : h > hP);
    },
  },
  {
    id: 'volume_explosion',
    label: '4H hacim patlaması (2x+)',
    why: 'Kırılım hacimle teyit edildi — sürdürülebilir momentum.',
    group: 'ind',
    evaluate: (ctx) => {
      const v = ctx.fourH?.lastVolume, avg = ctx.fourH?.volumeAvg20;
      return v && avg && v > avg * 2;
    },
  },
  {
    id: 'funding_favorable',
    label: 'Funding rate avantajlı (≤0.05%)',
    why: 'Funding rate düşük/negatif — long pozisyon ucuz, short squeeze potansiyeli.',
    group: 'fund',
    evaluate: (ctx) => {
      const fr = ctx.funding?.rate;
      if (fr == null) return false;
      return fr <= 0.0005; // 0.05% per 8h funding ya da daha az
    },
  },
  {
    id: 'price_above_ema200_4h',
    label: '4H fiyat EMA200 üstü',
    why: '4H EMA200 üstünde olmak — ana 4H trend boğa.',
    group: 'trend',
    evaluate: (ctx) => {
      const e = ctx.fourH || {};
      return ctx.lastClose != null && e.ema200 != null && ctx.lastClose > e.ema200;
    },
  },
  {
    id: 'recent_4h_breakout',
    label: 'Son 5 4H mumda kırılım',
    why: 'Kırılım taze (son ~20 saat) — momentum henüz tükenmedi.',
    group: 'pa',
    evaluate: (ctx) => {
      const recent = ctx.fourH?.recentBars || [];
      if (recent.length < 6) return false;
      const lookback = recent.slice(0, -1);
      const last = recent[recent.length - 1];
      const maxHigh = Math.max(...lookback.map(b => b.high));
      return last.close > maxHigh;
    },
  },
  {
    id: 'daily_macd_aligned',
    label: '1D MACD pozitif',
    why: '1D MACD histogramı pozitif — büyük resim long için uygun.',
    group: 'ind',
    evaluate: (ctx) => {
      const h = ctx.daily?.macdHist;
      return h != null && h > 0;
    },
  },
];

// ───────────────────────────────────────────────────────────────────────────
// FUTURES_SHORT — bozulan trend, hacimli düşüş
// ───────────────────────────────────────────────────────────────────────────

const FUTURES_SHORT_CONDITIONS = [
  {
    id: '4h_downtrend',
    label: '4H aşağı trend',
    why: '4H EMA20 < EMA50 — kısa vadeli yapı aşağı yönlü.',
    group: 'trend',
    required: true,
    evaluate: (ctx) => {
      const e = ctx.fourH || {};
      return e.ema20 && e.ema50 && e.ema20 < e.ema50;
    },
  },
  {
    id: 'rsi_overbought_recently',
    label: '1D RSI overbought\'tan döndü',
    why: '1D RSI son barlarda 70+ vurdu, şimdi aşağı dönüyor — zirve formasyonu.',
    group: 'ind',
    required: true,
    evaluate: (ctx) => {
      const r = ctx.daily?.rsi;
      const rRecent = ctx.daily?.rsiRecentMax;
      if (r == null || rRecent == null) return false;
      return rRecent >= 70 && r < rRecent && r < 65;
    },
  },
  {
    id: 'ema_stack_inverted',
    label: '4H EMA stack ters dönüyor',
    why: '4H EMA20 < EMA50 < EMA200 — bütün ortalamalar aşağı sıralı.',
    group: 'trend',
    evaluate: (ctx) => {
      const e = ctx.fourH || {};
      return e.ema20 && e.ema50 && e.ema200 && e.ema20 < e.ema50 && e.ema50 < e.ema200;
    },
  },
  {
    id: 'price_below_ema200_4h',
    label: '4H fiyat EMA200 altı',
    why: 'Fiyat 4H EMA200 altına düştü — yapı bozuldu.',
    group: 'trend',
    evaluate: (ctx) => {
      const e = ctx.fourH || {};
      return ctx.lastClose != null && e.ema200 != null && ctx.lastClose < e.ema200;
    },
  },
  {
    id: 'macd_bearish_4h',
    label: '4H MACD negatif + büyüyor',
    why: 'MACD histogramı negatif ve daha negatif oluyor — düşüş momentumu artıyor.',
    group: 'ind',
    evaluate: (ctx) => {
      const h = ctx.fourH?.macdHist, hP = ctx.fourH?.macdHistPrev;
      if (h == null) return false;
      return h < 0 && (hP == null ? true : h < hP);
    },
  },
  {
    id: 'volume_on_decline',
    label: 'Hacimli düşüş',
    why: 'Son 4H mum kırmızı kapandı + hacim 20-bar ortalama üstünde.',
    group: 'ind',
    evaluate: (ctx) => {
      const recent = ctx.fourH?.recentBars || [];
      const last = recent[recent.length - 1];
      if (!last) return false;
      const v = last.volume, avg = ctx.fourH?.volumeAvg20;
      const isRed = last.close < last.open;
      return isRed && v && avg && v > avg;
    },
  },
  {
    id: 'lower_low_4h',
    label: '4H lower-low',
    why: 'Son 4H mum, son 20 4H mumun en düşük kapanışı — düşüş süreklilik kazandı.',
    group: 'pa',
    evaluate: (ctx) => {
      const f = ctx.fourH || {};
      return f.lastClose != null && f.last20Low != null && f.lastClose <= f.last20Low * 1.01;
    },
  },
  {
    id: 'funding_overheated',
    label: 'Funding rate aşırı pozitif',
    why: 'Funding rate yüksek (>0.05%) — long\'lar kalabalık, short squeeze değil long squeeze potansiyeli.',
    group: 'fund',
    evaluate: (ctx) => {
      const fr = ctx.funding?.rate;
      if (fr == null) return false;
      return fr >= 0.0005;
    },
  },
  {
    id: 'daily_macd_negative',
    label: '1D MACD negatif',
    why: '1D MACD histogramı negatif — büyük resim aşağı destekliyor.',
    group: 'ind',
    evaluate: (ctx) => {
      const h = ctx.daily?.macdHist;
      return h != null && h < 0;
    },
  },
  {
    id: 'recent_4h_breakdown',
    label: 'Son 5 4H mumda kırılım aşağı',
    why: 'Fiyat son 5 4H mumun en düşük seviyesini kırdı — momentum aşağı.',
    group: 'pa',
    evaluate: (ctx) => {
      const recent = ctx.fourH?.recentBars || [];
      if (recent.length < 6) return false;
      const lookback = recent.slice(0, -1);
      const last = recent[recent.length - 1];
      const minLow = Math.min(...lookback.map(b => b.low));
      return last.close < minLow;
    },
  },
];

// ───────────────────────────────────────────────────────────────────────────
// CONDITION GROUPS — UI gruplaması için
// ───────────────────────────────────────────────────────────────────────────

const CONDITION_GROUPS = {
  trend: { label: 'Trend',         color: 'sky' },
  pa:    { label: 'Fiyat Hareketi',color: 'amber' },
  ind:   { label: 'İndikatörler',  color: 'emerald' },
  fund:  { label: 'Funding',       color: 'fuchsia' },
};

// ───────────────────────────────────────────────────────────────────────────
// Skorlama — ortak motor
// ───────────────────────────────────────────────────────────────────────────

function gradeFromRatio(r) {
  if (r >= 0.80) return 'MUKEMMEL';
  if (r >= 0.60) return 'GUCLU';
  if (r >= 0.50) return 'ORTA';
  return 'ZAYIF';
}

function suggestLeverage(stratKey, score) {
  if (stratKey === 'spot_long') return 1; // spot
  // Futures: skor yüksekse daha düşük kaldıraç önerilir (büyüklüğü artar)
  if (score >= 8) return 5;
  if (score >= 6) return 3;
  return 2;
}

function evaluateConditions(catalog, ctx) {
  return catalog.map(c => {
    let met = false;
    try { met = !!c.evaluate(ctx); } catch { met = false; }
    return {
      id: c.id, label: c.label, group: c.group, why: c.why,
      met, applicable: true, required: !!c.required,
    };
  });
}

function buildLevels(stratKey, ctx) {
  const last = ctx.lastClose;
  const atr = ctx.atr;
  if (!last || !atr) return null;

  // Kripto'da ATR mum bazlı; futures'ta daha sıkı stop, spot'ta geniş stop
  if (stratKey === 'spot_long') {
    return {
      entry: +last.toFixed(precisionFor(last)),
      stop: +(last - 2.5 * atr).toFixed(precisionFor(last)),
      target1: +(last + 3.0 * atr).toFixed(precisionFor(last)),
      target2: +(last + 5.0 * atr).toFixed(precisionFor(last)),
    };
  }
  if (stratKey === 'futures_long') {
    return {
      entry: +last.toFixed(precisionFor(last)),
      stop: +(last - 1.5 * atr).toFixed(precisionFor(last)),
      target1: +(last + 2.0 * atr).toFixed(precisionFor(last)),
      target2: +(last + 3.5 * atr).toFixed(precisionFor(last)),
    };
  }
  // futures_short
  return {
    entry: +last.toFixed(precisionFor(last)),
    stop: +(last + 1.5 * atr).toFixed(precisionFor(last)),
    target1: +(last - 2.0 * atr).toFixed(precisionFor(last)),
    target2: +(last - 3.5 * atr).toFixed(precisionFor(last)),
  };
}

// Kripto fiyatları geniş aralıkta (BTC ~70000, SHIB ~0.000018) — uygun ondalık
function precisionFor(price) {
  if (price >= 1000) return 2;
  if (price >= 10) return 3;
  if (price >= 1) return 4;
  if (price >= 0.01) return 5;
  return 8;
}

// Strateji bazlı alt-zorunlu grupları — required:true koşulları yetmediği için
// "yapı kanıtı yoksa sinyal yok" mantığı eklendi (sinyal kalitesi sıkılaştırma).
const ALT_REQUIRED = {
  spot_long:     [['price_above_ema200', '4h_uptrend']],     // ana trend kanıtı şart
  futures_long:  [],                                          // zaten 2 zorunlu (breakout + uptrend)
  futures_short: [['ema_stack_inverted', 'lower_low_4h']],   // yapı bozulma kanıtı şart
};

function score(stratKey, ctx) {
  const catalog = stratKey === 'spot_long'      ? SPOT_LONG_CONDITIONS
                : stratKey === 'futures_long'   ? FUTURES_LONG_CONDITIONS
                : stratKey === 'futures_short'  ? FUTURES_SHORT_CONDITIONS
                : null;
  if (!catalog) return null;
  if (!ctx.lastClose || !ctx.atr) return null;

  const conditions = evaluateConditions(catalog, ctx);
  const requiredFailed = conditions.find(c => c.required && !c.met);
  if (requiredFailed) return null;

  // ALT-ZORUNLU: her grup içinde en az 1 koşul geçmeli
  const altRequired = ALT_REQUIRED[stratKey] || [];
  for (const group of altRequired) {
    const anyMet = group.some(id => conditions.find(c => c.id === id)?.met);
    if (!anyMet) return null;
  }

  const totalScore = conditions.filter(c => c.met).length;
  const applicableMax = conditions.length;
  const ratio = totalScore / applicableMax;

  const levels = buildLevels(stratKey, ctx);
  if (!levels) return null;

  const direction = stratKey === 'futures_short' ? 'short' : 'long';

  // R/R oranı (target1 bazlı)
  const reward = Math.abs(levels.target1 - levels.entry);
  const risk = Math.abs(levels.entry - levels.stop);
  const riskReward = risk > 0 ? +(reward / risk).toFixed(2) : null;

  return {
    strategy: stratKey,
    direction,
    totalScore,
    applicableMax,
    ratio: +ratio.toFixed(2),
    grade: gradeFromRatio(ratio),
    score10: +(totalScore).toFixed(0),
    conditions,
    ...levels,
    riskReward,
    leverage_suggest: suggestLeverage(stratKey, totalScore),
    indicators: {
      rsi_1d:  ctx.daily?.rsi,
      rsi_4h:  ctx.fourH?.rsi,
      adx_1d:  ctx.daily?.adx,
      macdHist_1d: ctx.daily?.macdHist,
      macdHist_4h: ctx.fourH?.macdHist,
    },
    funding: ctx.funding ? {
      rate: ctx.funding.rate,
      ratePct: +(ctx.funding.rate * 100).toFixed(4),
      nextTime: ctx.funding.nextTime,
    } : null,
    lastClose: ctx.lastClose,
    atr: ctx.atr,
    updatedAt: new Date().toISOString(),
  };
}

function scoreAll(ctx) {
  // Spot paritesi olmayan (yalnızca futures'ta listelenmiş) coin'lerde
  // SPOT_LONG anlamsız — kullanıcı spot pazarda alım yapamaz.
  const spotEligible = ctx?.hasSpot !== false;
  return {
    spot_long:     spotEligible ? score('spot_long', ctx) : null,
    futures_long:  score('futures_long', ctx),
    futures_short: score('futures_short', ctx),
  };
}

module.exports = {
  score,
  scoreAll,
  SPOT_LONG_CONDITIONS,
  FUTURES_LONG_CONDITIONS,
  FUTURES_SHORT_CONDITIONS,
  CONDITION_GROUPS,
  precisionFor,
};
