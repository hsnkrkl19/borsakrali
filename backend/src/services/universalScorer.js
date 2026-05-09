/**
 * Universal Scorer v2 — Borsa Krali
 *
 * İki ayrı strateji ayrı puanlanır. Her strateji kendi koşul kataloğuna,
 * kendi entry/stop/target hesabına, kendi tetik mantığına sahiptir.
 *
 * STRATEJİ 1 — TREND TAKİP (momentum / market entry)
 *   Mantık: Trend yönünde piyasa fiyatından AL/SAT. Combo + EMA + indikatör uyumu.
 *   Entry: asOfClose (market)
 *   Stop:  entry ∓ 1.5×ATR
 *   Target:entry ± 2.5×ATR     (R/R ≈ 1.67)
 *   Tetik: anında (entry = market)
 *
 * STRATEJİ 2 — REVERSION (mean-reversion / zone entry)
 *   Mantık: SNR support/resistance zone'una geri çekilmede tepki. Pullback bekler.
 *   Entry: SNR zone seviyesi
 *   Stop:  zone sınırı ∓ 1.0×ATR
 *   Target:entry ± 2×risk      (R/R = 2.0)
 *   Tetik: fiyat zone'a değdiğinde (low ≤ entry long, high ≥ entry short)
 *
 * Her strateji 10 koşul üzerinden puanlanır. Yön (long/short) tek seçim, koşul
 * kataloğu yön ekseniyle yorumlanır. ZORUNLU koşullar geçmediyse strateji null.
 */

// ───────────────────────────────────────────────────────────────────────────
// TREND TAKİP — koşul kataloğu (10 koşul, max 10 puan)
// ───────────────────────────────────────────────────────────────────────────

const TREND_CONDITIONS = [
  {
    id: 'storyline_aligned',
    label: 'Storyline yön uyumlu',
    why: 'EMA20/50 ile belirlenen trend, sinyal yönüyle aynı.',
    group: 'trend',
    required: true, // ZORUNLU — yoksa trend stratejisi devre dışı
    evaluate: (ctx, dir) => {
      const s = ctx.snr?.storyline;
      if (!s || s === 'neutral') return false;
      return (dir === 'long' && s === 'bullish') || (dir === 'short' && s === 'bearish');
    },
  },
  {
    id: 'price_vs_ema200',
    label: 'EMA200 yön uyumlu',
    why: 'Uzun vadeli ana trend filtresi (long ⇒ fiyat>EMA200, short ⇒ fiyat<EMA200).',
    group: 'trend',
    evaluate: (ctx, dir) => {
      const last = ctx.lastClose, ema200 = ctx.indicators?.ema200;
      if (!last || !ema200) return false;
      return dir === 'long' ? last > ema200 : last < ema200;
    },
  },
  {
    id: 'ema_stack',
    label: 'EMA dizilimi sıralı',
    why: 'EMA20>EMA50>EMA200 (long) veya tersi (short).',
    group: 'trend',
    evaluate: (ctx, dir) => {
      const e = ctx.indicators || {};
      if (!e.ema20 || !e.ema50 || !e.ema200) return false;
      return dir === 'long' ? e.ema20 > e.ema50 && e.ema50 > e.ema200
                            : e.ema20 < e.ema50 && e.ema50 < e.ema200;
    },
  },
  {
    id: 'rsi_momentum',
    label: 'RSI momentum bandında',
    why: 'Long için RSI 50-72 (sağlıklı yükseliş), short için 28-50.',
    group: 'ind',
    evaluate: (ctx, dir) => {
      const r = ctx.indicators?.rsi;
      if (r == null) return false;
      return dir === 'long' ? (r >= 50 && r <= 72) : (r >= 28 && r <= 50);
    },
  },
  {
    id: 'macd_aligned_growing',
    label: 'MACD yönü + büyüyor',
    why: 'MACD histogram yönle aynı + son barda büyüyor (momentum güçleniyor).',
    group: 'ind',
    evaluate: (ctx, dir) => {
      const h  = ctx.indicators?.macdHist;
      const hP = ctx.indicators?.macdHistPrev;
      if (h == null) return false;
      const aligned = dir === 'long' ? h > 0 : h < 0;
      const growing = hP == null ? true : (dir === 'long' ? h > hP : h < hP);
      return aligned && growing;
    },
  },
  {
    id: 'volume_above_avg',
    label: 'Hacim ortalama üstünde',
    why: 'Son mum hacmi 20-bar SMA üstünde — katılım var.',
    group: 'ind',
    evaluate: (ctx) => {
      const v = ctx.lastVolume, avg = ctx.indicators?.volumeAvg20;
      return v && avg && v > avg;
    },
  },
  {
    id: 'adx_trending',
    label: 'ADX trend modunda',
    why: 'ADX ≥ 22 — fiyat yönlü hareket ediyor (yatay değil).',
    group: 'ind',
    evaluate: (ctx) => (ctx.indicators?.adx || 0) >= 22,
  },
  {
    id: 'combo_hit',
    label: 'Combo stratejisi tetik',
    why: 'comboStrategyService\'te en az bir Tier S/A combo aktif.',
    group: 'combo',
    evaluate: (ctx, dir) => {
      const c = ctx.combo?.bestStrategy;
      if (!c) return false;
      const sideOk = dir === 'long' ? c.side === 'boga' : c.side === 'ayi';
      const tierOk = c.tier === 'S' || c.tier === 'A';
      return sideOk && tierOk;
    },
  },
  {
    id: 'recent_breakout',
    label: 'Son 5 barda kırılım',
    why: 'Fiyat son 5 barın yüksek/düşük seviyesini kırdı (momentum başlangıcı).',
    group: 'pa',
    evaluate: (ctx, dir) => {
      const recent = ctx.recentBars || [];
      if (recent.length < 6) return false;
      const lookback = recent.slice(0, -1); // son hariç önceki 5 bar
      const last = recent[recent.length - 1];
      if (dir === 'long') {
        const maxHigh = Math.max(...lookback.map(b => b.high));
        return last.close > maxHigh;
      } else {
        const minLow = Math.min(...lookback.map(b => b.low));
        return last.close < minLow;
      }
    },
  },
  {
    id: 'news_supportive',
    label: 'Haber yön destekliyor',
    why: 'Long için son 24s pozitif haber, short için negatif haber var.',
    group: 'news',
    evaluate: (ctx, dir) => {
      if (dir === 'long') return (ctx.news?.positive24h || 0) > 0;
      return (ctx.news?.negative24h || 0) > 0;
    },
  },
];

// ───────────────────────────────────────────────────────────────────────────
// REVERSION — koşul kataloğu (10 koşul, max 10 puan)
// ───────────────────────────────────────────────────────────────────────────

const REVERSION_CONDITIONS = [
  {
    id: 'in_range_tight',
    label: 'Fiyat zone\'a yakın (≤%4)',
    why: 'Fiyat entry seviyesine ≤%4 mesafede — pullback yakın, tetik olasılığı yüksek.',
    group: 'sust',
    required: true,
    evaluate: (ctx) => {
      const d = ctx.bestZone?.priceDistancePct;
      return d != null && d <= 4;
    },
  },
  {
    id: 'recent_pivot',
    label: 'Pivot ≤30 gün',
    why: 'Zone\'un oluştuğu pivot taze — kurumsal hafıza canlı.',
    group: 'sust',
    required: true,
    evaluate: (ctx) => {
      const a = ctx.bestZone?.daysAgo;
      return a != null && a <= 30;
    },
  },
  {
    id: 'fresh_zone',
    label: 'Taze zone',
    why: 'Zone hiç test edilmedi — kurumsal emirler dolmadı.',
    group: 'pa',
    evaluate: (ctx) => ctx.bestZone?.freshness === 'fresh',
  },
  {
    id: 'gap_zone',
    label: 'Gap zone',
    why: 'HTF gap = LTF engulfing eşdeğeri — yüksek olasılıklı dönüş.',
    group: 'pa',
    evaluate: (ctx) => ctx.bestZone?.zoneType === 'gap',
  },
  {
    id: 'engulfing_at_zone',
    label: 'Engulfing teyidi',
    why: 'Zone yakınında bullish/bearish engulfing — kurumsal yutma.',
    group: 'pa',
    evaluate: (ctx, dir) => {
      const list = ctx.snr?.engulfing || [];
      const pi = ctx.bestZone?.pivotIndex;
      if (pi == null) return false;
      const tgt = dir === 'long' ? 'bullish_engulfing' : 'bearish_engulfing';
      return list.some(e => e.type === tgt && Math.abs(e.index - pi) <= 3);
    },
  },
  {
    id: 'liquidity_sweep',
    label: 'Likidite süpürmesi',
    why: 'Wick zone\'u aştı, gövde döndü — küçük yatırımcı stop\'ları temizlendi.',
    group: 'pa',
    evaluate: (ctx) => {
      const sw = ctx.snr?.sweeps || [];
      return sw.some(s => s.zoneId === ctx.bestZone?.id);
    },
  },
  {
    id: 'validated_zone',
    label: 'Onaylı zone',
    why: 'İlk dokunma 3 bar içinde gerçekleşti veya hiç test edilmedi.',
    group: 'sust',
    evaluate: (ctx) => ctx.bestZone?.validated === true,
  },
  {
    id: 'storyline_not_opposite',
    label: 'Storyline ters değil',
    why: 'Long için storyline bearish DEĞİL, short için bullish DEĞİL.',
    group: 'trend',
    evaluate: (ctx, dir) => {
      const s = ctx.snr?.storyline;
      if (!s) return true;
      return dir === 'long' ? s !== 'bearish' : s !== 'bullish';
    },
  },
  {
    id: 'rsi_extreme',
    label: 'RSI uç bölgede',
    why: 'Long support için RSI<45 (oversold), short resistance için RSI>55.',
    group: 'ind',
    evaluate: (ctx, dir) => {
      const r = ctx.indicators?.rsi;
      if (r == null) return false;
      return dir === 'long' ? r < 45 : r > 55;
    },
  },
  {
    id: 'harmonic_match',
    label: 'Harmonik patern uyumlu',
    why: 'Aktif harmonik patern (Gartley/Bat/Crab) sinyalle aynı yönde.',
    group: 'harm',
    evaluate: (ctx, dir) => {
      const h = ctx.harmonic;
      if (!h) return false;
      return (dir === 'long' && h.direction === 'Bullish') ||
             (dir === 'short' && h.direction === 'Bearish');
    },
  },
];

// ───────────────────────────────────────────────────────────────────────────
// CONDITION GROUPS — UI gruplaması için
// ───────────────────────────────────────────────────────────────────────────

const CONDITION_GROUPS = {
  trend:  { label: 'Trend',         color: 'sky' },
  pa:     { label: 'Fiyat Hareketi',color: 'amber' },
  ind:    { label: 'İndikatörler',  color: 'emerald' },
  combo:  { label: 'Combo',         color: 'fuchsia' },
  harm:   { label: 'Harmonik',      color: 'purple' },
  sust:   { label: 'Geçerlilik',    color: 'gray' },
  news:   { label: 'Haber',         color: 'rose' },
};

// ───────────────────────────────────────────────────────────────────────────
// TREND TAKİP scorer
// ───────────────────────────────────────────────────────────────────────────

function scoreTrend(ctx) {
  // Yönü Combo'dan al — combo en güçlü trend sinyali kaynağı
  const comboSide = ctx.combo?.bestStrategy?.side;
  let direction = null;
  if (comboSide === 'boga') direction = 'long';
  else if (comboSide === 'ayi') direction = 'short';
  else {
    // Combo yoksa storyline'dan tahmin et
    if (ctx.snr?.storyline === 'bullish') direction = 'long';
    else if (ctx.snr?.storyline === 'bearish') direction = 'short';
    else return null; // yön yoksa trend stratejisi yok
  }

  const last = ctx.lastClose;
  const atr = ctx.atr;
  if (!last || !atr) return null;

  // Koşulları değerlendir
  const conditions = TREND_CONDITIONS.map(c => {
    let met = false;
    try { met = !!c.evaluate(ctx, direction); } catch { met = false; }
    return {
      id: c.id, label: c.label, group: c.group, why: c.why,
      met, applicable: true, required: !!c.required,
    };
  });

  // ZORUNLU koşullar geçemediyse strateji yok
  const requiredFailed = conditions.find(c => c.required && !c.met);
  if (requiredFailed) return null;

  const totalScore = conditions.filter(c => c.met).length;
  const applicableMax = conditions.length;

  // Entry/Stop/Target — market entry, ATR bazlı
  const entry = +last.toFixed(2);
  const stop = direction === 'long'
    ? +(entry - 1.5 * atr).toFixed(2)
    : +(entry + 1.5 * atr).toFixed(2);
  const target = direction === 'long'
    ? +(entry + 2.5 * atr).toFixed(2)
    : +(entry - 2.5 * atr).toFixed(2);

  return {
    strategy: 'trend',
    direction,
    totalScore,
    applicableMax,
    ratio: +(totalScore / applicableMax).toFixed(2),
    grade: gradeFromRatio(totalScore / applicableMax),
    conditions,
    entry, stop, target,
    fillMode: 'market',     // anında tetik
    triggerZone: null,
    source: 'combo',
    bestZone: null,
    harmonic: ctx.harmonic ? {
      pattern: ctx.harmonic.pattern, direction: ctx.harmonic.direction, completion: ctx.harmonic.completion,
      detectedDate: ctx.harmonic.points?.D?.date,
    } : null,
    combo: ctx.combo?.bestStrategy ? {
      key: ctx.combo.bestStrategy.key, name: ctx.combo.bestStrategy.name,
      side: ctx.combo.bestStrategy.side, tier: ctx.combo.bestStrategy.tier,
      score: ctx.combo.bestStrategy.score,
    } : null,
    storyline: ctx.snr?.storyline || 'neutral',
    indicators: ctx.indicators ? {
      rsi: ctx.indicators.rsi, macdHist: ctx.indicators.macdHist, adx: ctx.indicators.adx,
    } : null,
    lastClose: last,
    atr,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// REVERSION scorer
// ───────────────────────────────────────────────────────────────────────────

function scoreReversion(ctx) {
  const zone = ctx.bestZone;
  if (!zone) return null;

  const direction = zone.type === 'support' ? 'long' : 'short';
  const last = ctx.lastClose;
  const atr = ctx.atr;
  if (!last || !atr || !zone.entry) return null;

  // Koşulları değerlendir
  const conditions = REVERSION_CONDITIONS.map(c => {
    let met = false;
    try { met = !!c.evaluate(ctx, direction); } catch { met = false; }
    return {
      id: c.id, label: c.label, group: c.group, why: c.why,
      met, applicable: true, required: !!c.required,
    };
  });

  // ZORUNLU koşullar geçemediyse strateji yok
  const requiredFailed = conditions.find(c => c.required && !c.met);
  if (requiredFailed) return null;

  const totalScore = conditions.filter(c => c.met).length;
  const applicableMax = conditions.length;

  // Entry / Stop / Target — zone bazlı, geniş ATR tamponu
  // Stop 1.5×ATR yapıldı (1.0×ATR'de hit_stop oranı çok yüksekti)
  const entry = +zone.entry.toFixed(2);
  const stop = direction === 'long'
    ? +(zone.bottom - 1.5 * atr).toFixed(2)
    : +(zone.top + 1.5 * atr).toFixed(2);
  const risk = Math.abs(entry - stop);
  const target = direction === 'long'
    ? +(entry + 2.0 * risk).toFixed(2)
    : +(entry - 2.0 * risk).toFixed(2);

  return {
    strategy: 'reversion',
    direction,
    totalScore,
    applicableMax,
    ratio: +(totalScore / applicableMax).toFixed(2),
    grade: gradeFromRatio(totalScore / applicableMax),
    conditions,
    entry, stop, target,
    fillMode: 'limit', // zone değiş bekler
    // Tetik aralığı: long ⇒ zone içine değiş (low ≤ top, high ≥ bottom)
    triggerZone: { top: zone.top, bottom: zone.bottom },
    source: 'snr',
    bestZone: {
      id: zone.id, type: zone.type, top: zone.top, bottom: zone.bottom,
      pivotDate: zone.pivotDate, daysAgo: zone.daysAgo,
      priceDistancePct: zone.priceDistancePct,
      score: zone.score, grade: zone.grade,
      freshness: zone.freshness, zoneType: zone.zoneType, validated: zone.validated,
    },
    harmonic: ctx.harmonic ? {
      pattern: ctx.harmonic.pattern, direction: ctx.harmonic.direction, completion: ctx.harmonic.completion,
      detectedDate: ctx.harmonic.points?.D?.date,
    } : null,
    combo: null,
    storyline: ctx.snr?.storyline || 'neutral',
    indicators: ctx.indicators ? {
      rsi: ctx.indicators.rsi, macdHist: ctx.indicators.macdHist,
    } : null,
    lastClose: last,
    atr,
  };
}

// Grade eşikleri — gerçekçi 10-koşullu sistem için.
// 7+ koşul gerçekten kuvvetli sinyal demek; 5+ koşul güçlüdür.
function gradeFromRatio(r) {
  if (r >= 0.70) return 'MUKEMMEL';
  if (r >= 0.50) return 'GUCLU';
  if (r >= 0.30) return 'ORTA';
  return 'ZAYIF';
}

// ───────────────────────────────────────────────────────────────────────────
// İki strateji birden — ana giriş noktası
// ───────────────────────────────────────────────────────────────────────────

function scoreAll(ctx) {
  const trend = scoreTrend(ctx);
  const reversion = scoreReversion(ctx);
  return { trend, reversion };
}

module.exports = {
  scoreTrend,
  scoreReversion,
  scoreAll,
  TREND_CONDITIONS,
  REVERSION_CONDITIONS,
  CONDITION_GROUPS,
};
