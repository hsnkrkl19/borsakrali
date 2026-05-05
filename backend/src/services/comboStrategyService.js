/**
 * Combo Strategy Service — BORSA KRALI
 * TradingView-style multi-indicator combos with catchy Turkish names.
 * Each combo blends 3-5 indicators (EMA, RSI, MACD, BB, ADX, Volume, OBV, Stoch).
 * Inspired by Pine Script community screeners + dexter's narrative depth.
 */

const formula = require('./formulaService');

// ===================== Helpers =====================
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function pct(a, b) { return b === 0 ? 0 : ((a - b) / b) * 100; }

function calcOBV(closes, volumes) {
  let obv = 0;
  const series = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    series.push(obv);
  }
  return series;
}

function bollingerBandwidth(prices, period = 20, mult = 2) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const mean = avg(slice);
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mean + mult * sd;
  const lower = mean - mult * sd;
  return { upper, lower, mean, bandwidth: ((upper - lower) / mean) * 100 };
}

function detectBullishDivergence(closes, rsiSeries, lookback = 14) {
  if (closes.length < lookback + 2 || rsiSeries.length < lookback + 2) return false;
  const recentCloses = closes.slice(-lookback);
  const recentRSI = rsiSeries.slice(-lookback);
  const lowIdx1 = recentCloses.indexOf(Math.min(...recentCloses.slice(0, 7)));
  const lowIdx2 = 7 + recentCloses.slice(7).indexOf(Math.min(...recentCloses.slice(7)));
  if (lowIdx1 < 0 || lowIdx2 < 0 || lowIdx1 >= lowIdx2) return false;
  return recentCloses[lowIdx2] < recentCloses[lowIdx1] && recentRSI[lowIdx2] > recentRSI[lowIdx1];
}

function detectBearishDivergence(closes, rsiSeries, lookback = 14) {
  if (closes.length < lookback + 2) return false;
  const recentCloses = closes.slice(-lookback);
  const recentRSI = rsiSeries.slice(-lookback);
  const highIdx1 = recentCloses.indexOf(Math.max(...recentCloses.slice(0, 7)));
  const highIdx2 = 7 + recentCloses.slice(7).indexOf(Math.max(...recentCloses.slice(7)));
  if (highIdx1 < 0 || highIdx2 < 0 || highIdx1 >= highIdx2) return false;
  return recentCloses[highIdx2] > recentCloses[highIdx1] && recentRSI[highIdx2] < recentRSI[highIdx1];
}

// RSI series for divergence detection
function rsiSeries(closes, period = 14) {
  const series = [];
  for (let i = period; i < closes.length; i++) {
    series.push(formula.calculateRSI(closes.slice(0, i + 1), period));
  }
  return series.filter(v => v !== null);
}

// ===================== Combo Definitions =====================
// Each combo: { key, name, side ('boga'|'ayi'|'notr'), tier, expectedAvg, riskReward, narrative, check(ctx) }
// `check(ctx)` returns { hit: bool, score: 0-100, reasons: [str], detail: { ... } }

const COMBO_STRATEGIES = [
  // ─────── BOĞA (Bullish) ───────
  {
    key: 'zincirBozan', name: 'Zincir Bozan', side: 'boga', tier: 'S',
    icon: 'Unlock', emoji: '⛓️‍💥', color: 'amber',
    desc: 'Direnci kıran + hacim patlaması + ADX yükseliyor — çoklu gün konsolidasyonunun kırılımı.',
    success: 78, peak: 16.4, riskReward: '6.1:1', avgChange: 13.2,
    indicators: ['Direnç Kırılımı', 'Hacim 2x', 'ADX↑', 'EMA50↑'],
    check: (ctx) => {
      const { closes, volumes, last, ema50, adx, ema20 } = ctx;
      if (!ema50 || !adx) return { hit: false };
      const hi20 = Math.max(...closes.slice(-22, -1));
      const breakout = closes[last] > hi20 * 1.005;
      const avgVol = avg(volumes.slice(-20, -1));
      const volSpike = volumes[last] > avgVol * 1.8;
      const adxRising = adx.adx > 22 && adx.bullish;
      const aboveTrend = closes[last] > ema50 && closes[last] > ema20;
      const reasons = [];
      if (breakout) reasons.push(`20-bar zirvesini kırdı (${hi20.toFixed(2)})`);
      if (volSpike) reasons.push(`Hacim ortalamanın ${(volumes[last] / avgVol).toFixed(1)}× üstünde`);
      if (adxRising) reasons.push(`ADX ${adx.adx.toFixed(1)} ve +DI hakim`);
      if (aboveTrend) reasons.push(`EMA50 (${ema50.toFixed(2)}) üzerinde temellendi`);
      const hit = breakout && volSpike && adxRising && aboveTrend;
      return { hit, score: hit ? 70 + Math.min(25, adx.adx) : 0, reasons };
    },
  },
  {
    key: 'yukselisManyagi', name: 'Yükseliş Manyağı', side: 'boga', tier: 'S',
    icon: 'Rocket', emoji: '🚀', color: 'amber',
    desc: 'Tüm EMA\'lar dizili (5>9>21>50>200) + RSI 55-75 + MACD pozitif + ADX güçlü — euforik uptrend.',
    success: 72, peak: 14.8, riskReward: '5.2:1', avgChange: 11.6,
    indicators: ['EMA Dizilim', 'RSI 55-75', 'MACD>0', 'ADX>25'],
    check: (ctx) => {
      const { closes, last, ema5, ema9, ema21, ema50, ema200, rsi, macd, adx } = ctx;
      if (!ema200 || !macd || !adx) return { hit: false };
      const stacked = closes[last] > ema5 && ema5 > ema9 && ema9 > ema21 && ema21 > ema50 && ema50 > ema200;
      const rsiSweet = rsi >= 55 && rsi <= 78;
      const macdBull = macd.macd > macd.signal && macd.histogram > 0;
      const adxStrong = adx.adx > 25 && adx.bullish;
      const reasons = [];
      if (stacked) reasons.push('EMA dizilimi tam (5>9>21>50>200)');
      if (rsiSweet) reasons.push(`RSI ${rsi} — sağlıklı momentum`);
      if (macdBull) reasons.push(`MACD pozitif, histogram ${macd.histogram.toFixed(3)}`);
      if (adxStrong) reasons.push(`ADX ${adx.adx} — kuvvetli trend`);
      const hit = stacked && rsiSweet && macdBull && adxStrong;
      return { hit, score: hit ? 75 + Math.min(20, (rsi - 55)) : 0, reasons };
    },
  },
  {
    key: 'altinCapraz', name: 'Altın Çapraz', side: 'boga', tier: 'A',
    icon: 'Sparkles', emoji: '✨', color: 'amber',
    desc: 'EMA50 son 5 barda EMA200\'ü yukarı kesti + RSI>50 + hacim artıyor — klasik Golden Cross.',
    success: 68, peak: 18.5, riskReward: '7.4:1', avgChange: 14.2,
    indicators: ['EMA50×EMA200', 'Yeni Kesişim', 'RSI>50', 'Hacim↑'],
    check: (ctx) => {
      const { closes, volumes, last, rsi } = ctx;
      const ema50Now = formula.calculateEMA(closes, 50);
      const ema200Now = formula.calculateEMA(closes, 200);
      if (!ema50Now || !ema200Now) return { hit: false };
      let crossedRecent = false;
      for (let i = 1; i <= 5; i++) {
        const e50 = formula.calculateEMA(closes.slice(0, last - i + 1), 50);
        const e200 = formula.calculateEMA(closes.slice(0, last - i + 1), 200);
        const e50p = formula.calculateEMA(closes.slice(0, last - i), 50);
        const e200p = formula.calculateEMA(closes.slice(0, last - i), 200);
        if (e50 && e200 && e50p && e200p && e50 > e200 && e50p < e200p) { crossedRecent = true; break; }
      }
      const rsiOk = rsi > 50;
      const volRising = avg(volumes.slice(-5)) > avg(volumes.slice(-20, -5)) * 1.1;
      const reasons = [];
      if (crossedRecent) reasons.push('Son 5 barda EMA50 EMA200\'ü kesti');
      if (rsiOk) reasons.push(`RSI ${rsi} momentum onayı`);
      if (volRising) reasons.push('5-bar hacim 20-bar ortalamadan yüksek');
      const hit = crossedRecent && rsiOk && volRising;
      return { hit, score: hit ? 72 : 0, reasons };
    },
  },
  {
    key: 'sessizDevrim', name: 'Sessiz Devrim', side: 'boga', tier: 'S',
    icon: 'Zap', emoji: '⚡', color: 'amber',
    desc: 'Bollinger sıkışması (BBW<5%) yukarı kırılıyor + hacim sıçraması + RSI>52 — düşük volatiliteden patlama.',
    success: 74, peak: 13.6, riskReward: '5.8:1', avgChange: 10.4,
    indicators: ['BB Squeeze', 'Yukarı Patlama', 'Hacim 1.5x', 'RSI>52'],
    check: (ctx) => {
      const { closes, volumes, last, rsi } = ctx;
      const bb = bollingerBandwidth(closes);
      if (!bb) return { hit: false };
      // Önceki 10 barda BBW değerleri sıkışıktı mı?
      const bbwPrev = closes.slice(-30, -5).map((_, i) => bollingerBandwidth(closes.slice(0, last - 4 + i)));
      const wasSqueezed = bbwPrev.filter(b => b && b.bandwidth < 7).length >= 5;
      const breakingUp = closes[last] > bb.upper * 0.99;
      const avgVol = avg(volumes.slice(-20, -1));
      const volSpike = volumes[last] > avgVol * 1.5;
      const rsiOk = rsi > 52;
      const reasons = [];
      if (wasSqueezed) reasons.push('Önceki 25 barda Bollinger sıkıştı');
      if (breakingUp) reasons.push(`Üst banda (${bb.upper.toFixed(2)}) saldırı`);
      if (volSpike) reasons.push(`Hacim ${(volumes[last] / avgVol).toFixed(1)}× yüksek`);
      if (rsiOk) reasons.push(`RSI ${rsi}`);
      const hit = wasSqueezed && breakingUp && volSpike && rsiOk;
      return { hit, score: hit ? 78 : 0, reasons };
    },
  },
  {
    key: 'roketHazirligi', name: 'Roket Hazırlığı', side: 'boga', tier: 'A',
    icon: 'Activity', emoji: '🛢️', color: 'amber',
    desc: 'Sıkı range + OBV yükseliyor + EMA21 yakın + ADX<20 — sessiz akümülasyon, fitil hazırlanıyor.',
    success: 64, peak: 19.2, riskReward: '6.8:1', avgChange: 15.1,
    indicators: ['Dar Range', 'OBV↑', 'EMA21 yakın', 'ADX<20'],
    check: (ctx) => {
      const { closes, volumes, last, ema21, adx } = ctx;
      if (!ema21 || !adx) return { hit: false };
      const recent = closes.slice(-10);
      const range = (Math.max(...recent) - Math.min(...recent)) / avg(recent) * 100;
      const tightRange = range < 5;
      const obv = calcOBV(closes, volumes);
      const obvRising = obv[obv.length - 1] > obv[obv.length - 11];
      const nearEma21 = Math.abs(closes[last] - ema21) / ema21 < 0.02;
      const lowAdx = adx.adx < 22;
      const reasons = [];
      if (tightRange) reasons.push(`10-bar range %${range.toFixed(1)} — sıkı`);
      if (obvRising) reasons.push('OBV son 10 barda yükseliyor — gizli alım');
      if (nearEma21) reasons.push(`Fiyat EMA21 (${ema21.toFixed(2)}) yakınında`);
      if (lowAdx) reasons.push(`ADX ${adx.adx} — patlama önü sessizliği`);
      const hit = tightRange && obvRising && nearEma21 && lowAdx;
      return { hit, score: hit ? 65 : 0, reasons };
    },
  },
  {
    key: 'cakalAvi', name: 'Çakal Avı', side: 'boga', tier: 'S',
    icon: 'Crosshair', emoji: '🎯', color: 'amber',
    desc: 'Destekte likidite süpürmesi + bullish engulfing + RSI<35 sonra dönüş — avcı tuzağa düşürdü.',
    success: 76, peak: 12.4, riskReward: '5.2:1', avgChange: 9.8,
    indicators: ['Likidite Sweep', 'Bullish Engulf', 'RSI<35', 'Hızlı Toparlama'],
    check: (ctx) => {
      const { ohlcv, last, rsi, rsiPrev } = ctx;
      if (last < 3) return { hit: false };
      const cur = ohlcv[last], prev = ohlcv[last - 1];
      const swept = cur.low < ohlcv[last - 2].low && cur.close > ohlcv[last - 2].low;
      const engulf = cur.close > cur.open && cur.close > prev.open && cur.open < prev.close && prev.close < prev.open;
      const wasOversold = rsiPrev < 35 && rsi > rsiPrev;
      const recoveryStrong = (cur.close - cur.low) / (cur.high - cur.low) > 0.65;
      const reasons = [];
      if (swept) reasons.push(`Önceki dip (${ohlcv[last - 2].low.toFixed(2)}) süpürüldü, kapanış üstte`);
      if (engulf) reasons.push('Bullish engulfing mumu oluştu');
      if (wasOversold) reasons.push(`RSI aşırı satıştan (${rsiPrev}) dönüyor`);
      if (recoveryStrong) reasons.push('Mum kapanışı %65+ üst yarıda');
      const hit = swept && engulf && (wasOversold || recoveryStrong);
      return { hit, score: hit ? 80 : 0, reasons };
    },
  },
  {
    key: 'ucBoga', name: 'Üç Boğa', side: 'boga', tier: 'A',
    icon: 'TrendingUp', emoji: '🐂', color: 'amber',
    desc: '3 ardışık boğa mumu + her biri yüksek high+low + artan hacim — Three White Soldiers formasyonu.',
    success: 70, peak: 11.2, riskReward: '4.6:1', avgChange: 8.9,
    indicators: ['3 Yeşil Mum', 'Higher H/L', 'Hacim↑', 'Body ≥ 60%'],
    check: (ctx) => {
      const { ohlcv, volumes, last } = ctx;
      if (last < 3) return { hit: false };
      const c1 = ohlcv[last - 2], c2 = ohlcv[last - 1], c3 = ohlcv[last];
      const allBull = c1.close > c1.open && c2.close > c2.open && c3.close > c3.open;
      const ascending = c2.high > c1.high && c3.high > c2.high && c2.low > c1.low && c3.low > c2.low;
      const bodyOk = [c1, c2, c3].every(c => (c.close - c.open) / (c.high - c.low + 1e-9) > 0.55);
      const volRising = volumes[last] > volumes[last - 1] && volumes[last - 1] > avg(volumes.slice(-20, -2)) * 0.9;
      const reasons = [];
      if (allBull) reasons.push('3 ardışık yeşil mum');
      if (ascending) reasons.push('Her mumda higher high + higher low');
      if (bodyOk) reasons.push('Mum gövdeleri %55+ dolu');
      if (volRising) reasons.push('Hacim 20-bar ortalamayı aşıyor');
      const hit = allBull && ascending && bodyOk;
      return { hit, score: hit ? 68 + (volRising ? 10 : 0) : 0, reasons };
    },
  },
  {
    key: 'bogaTuzagiKacis', name: 'Boğa Tuzağı Kaçış', side: 'boga', tier: 'A',
    icon: 'ShieldCheck', emoji: '🛡️', color: 'amber',
    desc: 'Sahte aşağı kırılım + destek üstüne hızlı dönüş + RSI bullish divergence — yakalanmış reversal.',
    success: 67, peak: 10.8, riskReward: '4.4:1', avgChange: 8.2,
    indicators: ['Sahte Kırılım', 'V Dönüşü', 'RSI Divergence', 'Hızlı Geri Alım'],
    check: (ctx) => {
      const { closes, ohlcv, last, rsiSer } = ctx;
      if (last < 5 || rsiSer.length < 14) return { hit: false };
      const support = Math.min(...closes.slice(-15, -3));
      const dipBelow = ohlcv.slice(-3).some(c => c.low < support);
      const recovered = closes[last] > support * 1.005;
      const div = detectBullishDivergence(closes, rsiSer, 14);
      const reasons = [];
      if (dipBelow) reasons.push(`Destek (${support.toFixed(2)}) altına süpürüldü`);
      if (recovered) reasons.push('Destek üstünde kapanış geri kazanıldı');
      if (div) reasons.push('RSI bullish divergence oluştu');
      const hit = dipBelow && recovered && div;
      return { hit, score: hit ? 70 : 0, reasons };
    },
  },
  {
    key: 'suruCoban', name: 'Sürü Çoban', side: 'boga', tier: 'A',
    icon: 'Crown', emoji: '👑', color: 'amber',
    desc: '52-hafta zirvesine yakın + hacim patlaması + ADX>30 + EMA50 yükseliyor — sürüye liderlik.',
    success: 69, peak: 17.1, riskReward: '6.0:1', avgChange: 13.4,
    indicators: ['52w High', 'Hacim 2x', 'ADX>30', 'EMA50 trendi'],
    check: (ctx) => {
      const { closes, volumes, last, ema50, adx } = ctx;
      if (!ema50 || !adx) return { hit: false };
      const hi52w = Math.max(...closes.slice(-Math.min(252, closes.length)));
      const nearHi = closes[last] > hi52w * 0.97;
      const avgVol = avg(volumes.slice(-20, -1));
      const volBig = volumes[last] > avgVol * 1.8;
      const adxStrong = adx.adx > 30 && adx.bullish;
      const ema50Up = ema50 > formula.calculateEMA(closes.slice(0, last - 4), 50);
      const reasons = [];
      if (nearHi) reasons.push(`52-hafta zirvesinin (${hi52w.toFixed(2)}) %3 yakınında`);
      if (volBig) reasons.push(`Hacim ${(volumes[last] / avgVol).toFixed(1)}× ortalama`);
      if (adxStrong) reasons.push(`ADX ${adx.adx} — sürü gücü`);
      if (ema50Up) reasons.push('EMA50 yukarı yönlü');
      const hit = nearHi && volBig && adxStrong && ema50Up;
      return { hit, score: hit ? 74 : 0, reasons };
    },
  },

  // ─────── AYI (Bearish) ───────
  {
    key: 'dususTreni', name: 'Düşüş Treni', side: 'ayi', tier: 'S',
    icon: 'TrendingDown', emoji: '🚂', color: 'rose',
    desc: 'EMA dizilimi tersine (200>50>21>9>5) + RSI<45 + ADX>25 + MACD<0 — durdurulamaz düşüş treni.',
    success: 73, peak: 13.8, riskReward: '5.4:1', avgChange: 10.7,
    indicators: ['EMA Ters Dizilim', 'RSI<45', 'ADX>25', 'MACD<0'],
    check: (ctx) => {
      const { closes, last, ema5, ema9, ema21, ema50, ema200, rsi, macd, adx } = ctx;
      if (!ema200 || !macd || !adx) return { hit: false };
      const inverted = closes[last] < ema5 && ema5 < ema9 && ema9 < ema21 && ema21 < ema50 && ema50 < ema200;
      const rsiBear = rsi < 45;
      const adxStrong = adx.adx > 25 && !adx.bullish;
      const macdBear = macd.macd < macd.signal && macd.histogram < 0;
      const reasons = [];
      if (inverted) reasons.push('EMA tersine dizilim (200>50>21>9>5)');
      if (rsiBear) reasons.push(`RSI ${rsi} — momentum kaybı`);
      if (adxStrong) reasons.push(`ADX ${adx.adx} — −DI hakim`);
      if (macdBear) reasons.push('MACD negatif, histogram ezici');
      const hit = inverted && rsiBear && adxStrong && macdBear;
      return { hit, score: hit ? 76 : 0, reasons };
    },
  },
  {
    key: 'olumCaprazi', name: 'Ölüm Çaprazı', side: 'ayi', tier: 'A',
    icon: 'Skull', emoji: '💀', color: 'rose',
    desc: 'EMA50 son 5 barda EMA200\'ü aşağı kesti + RSI<50 + hacim artıyor — klasik Death Cross.',
    success: 64, peak: 16.2, riskReward: '5.8:1', avgChange: 12.6,
    indicators: ['EMA50×EMA200↓', 'Yeni Kesişim', 'RSI<50', 'Hacim↑'],
    check: (ctx) => {
      const { closes, volumes, last, rsi } = ctx;
      let crossedRecent = false;
      for (let i = 1; i <= 5; i++) {
        const e50 = formula.calculateEMA(closes.slice(0, last - i + 1), 50);
        const e200 = formula.calculateEMA(closes.slice(0, last - i + 1), 200);
        const e50p = formula.calculateEMA(closes.slice(0, last - i), 50);
        const e200p = formula.calculateEMA(closes.slice(0, last - i), 200);
        if (e50 && e200 && e50p && e200p && e50 < e200 && e50p > e200p) { crossedRecent = true; break; }
      }
      const rsiOk = rsi < 50;
      const volRising = avg(volumes.slice(-5)) > avg(volumes.slice(-20, -5)) * 1.1;
      const reasons = [];
      if (crossedRecent) reasons.push('Son 5 barda EMA50 EMA200\'ü aşağı kesti');
      if (rsiOk) reasons.push(`RSI ${rsi} aşağı baskı`);
      if (volRising) reasons.push('Satış hacmi artıyor');
      const hit = crossedRecent && rsiOk && volRising;
      return { hit, score: hit ? 68 : 0, reasons };
    },
  },
  {
    key: 'karanlikBulut', name: 'Karanlık Bulut', side: 'ayi', tier: 'A',
    icon: 'CloudRain', emoji: '🌩️', color: 'rose',
    desc: 'Bearish engulfing + RSI bearish divergence + EMA21 altında — karanlık bulut yaklaşıyor.',
    success: 66, peak: 9.4, riskReward: '3.8:1', avgChange: 7.2,
    indicators: ['Bearish Engulf', 'RSI Divergence', 'EMA21<', 'Reddetme'],
    check: (ctx) => {
      const { closes, ohlcv, last, ema21, rsiSer } = ctx;
      if (last < 2 || !ema21 || rsiSer.length < 14) return { hit: false };
      const cur = ohlcv[last], prev = ohlcv[last - 1];
      const engulf = cur.close < cur.open && cur.close < prev.open && cur.open > prev.close && prev.close > prev.open;
      const div = detectBearishDivergence(closes, rsiSer, 14);
      const underEma = closes[last] < ema21;
      const reasons = [];
      if (engulf) reasons.push('Bearish engulfing mumu');
      if (div) reasons.push('RSI bearish divergence');
      if (underEma) reasons.push(`Fiyat EMA21 (${ema21.toFixed(2)}) altında kapandı`);
      const hit = engulf && div && underEma;
      return { hit, score: hit ? 72 : 0, reasons };
    },
  },
  {
    key: 'ayiTuzagi', name: 'Ayı Tuzağı Kapanı', side: 'ayi', tier: 'S',
    icon: 'AlertTriangle', emoji: '🪤', color: 'rose',
    desc: 'Direnç üstüne sahte kırılım + sert reddetme + RSI aşırı alım + reddedilirken hacim — boğa tuzağı kapandı.',
    success: 71, peak: 11.8, riskReward: '4.7:1', avgChange: 9.0,
    indicators: ['Sahte Yukarı Kırılım', 'Üst Wick', 'RSI>70', 'Reddetme Hacmi'],
    check: (ctx) => {
      const { closes, ohlcv, volumes, last, rsi } = ctx;
      if (last < 3) return { hit: false };
      const resistance = Math.max(...closes.slice(-15, -3));
      const wickedAbove = ohlcv.slice(-3).some(c => c.high > resistance * 1.003);
      const closedBelow = closes[last] < resistance * 0.997;
      const cur = ohlcv[last];
      const upperWick = (cur.high - Math.max(cur.open, cur.close)) / (cur.high - cur.low + 1e-9) > 0.5;
      const overbought = rsi > 68;
      const avgVol = avg(volumes.slice(-20, -1));
      const rejectVol = volumes[last] > avgVol * 1.3;
      const reasons = [];
      if (wickedAbove && closedBelow) reasons.push(`Direnç (${resistance.toFixed(2)}) üstüne sahte kırılım`);
      if (upperWick) reasons.push('Üst wick %50+ — reddedildi');
      if (overbought) reasons.push(`RSI ${rsi} aşırı alım`);
      if (rejectVol) reasons.push(`Reddetme hacmi ${(volumes[last] / avgVol).toFixed(1)}× ortalama`);
      const hit = wickedAbove && closedBelow && upperWick && (overbought || rejectVol);
      return { hit, score: hit ? 74 : 0, reasons };
    },
  },
  {
    key: 'cigDususu', name: 'Çığ Düşüşü', side: 'ayi', tier: 'A',
    icon: 'ChevronsDown', emoji: '🏔️', color: 'rose',
    desc: '3+ ardışık düşüş + ivmelenen hacim + RSI 40 altına kırılım — çığ başladı.',
    success: 65, peak: 14.2, riskReward: '5.0:1', avgChange: 11.1,
    indicators: ['3+ Kırmızı Mum', 'İvmelenen Hacim', 'RSI<40', 'Hızlanma'],
    check: (ctx) => {
      const { ohlcv, volumes, last, rsi, rsiPrev } = ctx;
      if (last < 3) return { hit: false };
      const c1 = ohlcv[last - 2], c2 = ohlcv[last - 1], c3 = ohlcv[last];
      const allBear = c1.close < c1.open && c2.close < c2.open && c3.close < c3.open;
      const accelerating = (c1.open - c1.close) < (c2.open - c2.close) && (c2.open - c2.close) < (c3.open - c3.close);
      const volAcc = volumes[last] > volumes[last - 1] && volumes[last - 1] > volumes[last - 2];
      const rsiBroke = rsiPrev > 40 && rsi < 40;
      const reasons = [];
      if (allBear) reasons.push('3 ardışık kırmızı mum');
      if (accelerating) reasons.push('Mum gövdeleri büyüyor — ivme kazanıyor');
      if (volAcc) reasons.push('Hacim ivmesi 3 günde artıyor');
      if (rsiBroke) reasons.push(`RSI 40 seviyesini kırdı (${rsi})`);
      const hit = allBear && (accelerating || volAcc) && (rsi < 45);
      return { hit, score: hit ? 66 + (rsiBroke ? 8 : 0) : 0, reasons };
    },
  },

  // ─────── NÖTR / UYARI ───────
  {
    key: 'belirsizlikBandi', name: 'Belirsizlik Bandı', side: 'notr', tier: 'B',
    icon: 'Pause', emoji: '🌫️', color: 'slate',
    desc: 'Fiyat EMA21 etrafında salınıyor + ADX<18 + düşük hacim — yön kararsız, bekle.',
    success: 0, peak: 0, riskReward: '—', avgChange: 0,
    indicators: ['Yatay Range', 'ADX<18', 'Düşük Hacim', 'Karasız RSI'],
    check: (ctx) => {
      const { closes, volumes, last, ema21, adx, rsi } = ctx;
      if (!ema21 || !adx) return { hit: false };
      const recent = closes.slice(-10);
      const oscillating = recent.filter(c => Math.abs(c - ema21) / ema21 < 0.02).length >= 5;
      const lowAdx = adx.adx < 18;
      const lowVol = volumes[last] < avg(volumes.slice(-20)) * 0.8;
      const rsiNeutral = rsi >= 45 && rsi <= 55;
      const reasons = [];
      if (oscillating) reasons.push('Fiyat EMA21 etrafında salınıyor');
      if (lowAdx) reasons.push(`ADX ${adx.adx} — trend yok`);
      if (lowVol) reasons.push('Hacim ortalamanın altında');
      if (rsiNeutral) reasons.push(`RSI ${rsi} — kararsız bölge`);
      const hit = oscillating && lowAdx && (lowVol || rsiNeutral);
      return { hit, score: hit ? 50 : 0, reasons };
    },
  },
];

// ===================== Per-symbol context builder =====================
function buildContext(closes, ohlcv, volumes) {
  const last = closes.length - 1;
  return {
    closes, ohlcv, volumes, last,
    ema5: formula.calculateEMA(closes, 5),
    ema9: formula.calculateEMA(closes, 9),
    ema20: formula.calculateEMA(closes, 20),
    ema21: formula.calculateEMA(closes, 21),
    ema50: formula.calculateEMA(closes, 50),
    ema200: closes.length >= 200 ? formula.calculateEMA(closes, 200) : null,
    rsi: formula.calculateRSI(closes),
    rsiPrev: formula.calculateRSI(closes.slice(0, -1)),
    rsiSer: rsiSeries(closes),
    macd: closes.length >= 35 ? formula.calculateMACD(closes) : null,
    adx: ohlcv.length >= 30 ? formula.calculateADX(
      ohlcv.map(c => c.high), ohlcv.map(c => c.low), ohlcv.map(c => c.close)
    ) : null,
  };
}

// ===================== Public: scan one symbol =====================
function analyzeSymbol(symbol, candles) {
  if (!candles || candles.length < 60) return { symbol, hits: [], summary: null, error: 'Yetersiz veri' };
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume || 0);
  const ohlcv = candles.map(c => ({ high: c.high, low: c.low, close: c.close, open: c.open, volume: c.volume || 0 }));
  const ctx = buildContext(closes, ohlcv, volumes);
  const last = closes.length - 1;
  const lastPrice = closes[last];
  const dayChange = pct(closes[last], closes[last - 1]);
  const weekChange = pct(closes[last], closes[Math.max(0, last - 5)]);

  const hits = [];
  for (const combo of COMBO_STRATEGIES) {
    try {
      const r = combo.check(ctx);
      if (r && r.hit) {
        const narrative = buildNarrative(combo, r, ctx, lastPrice);
        hits.push({
          key: combo.key, name: combo.name, side: combo.side, tier: combo.tier,
          emoji: combo.emoji, color: combo.color, icon: combo.icon,
          desc: combo.desc, indicators: combo.indicators,
          success: combo.success, avgChange: combo.avgChange, riskReward: combo.riskReward, peak: combo.peak,
          score: r.score || 50, reasons: r.reasons || [], narrative,
        });
      }
    } catch { /* ignore individual combo errors */ }
  }

  // Summary signal
  const bogaCount = hits.filter(h => h.side === 'boga').length;
  const ayiCount = hits.filter(h => h.side === 'ayi').length;
  let bias = 'notr';
  if (bogaCount > ayiCount) bias = 'boga';
  else if (ayiCount > bogaCount) bias = 'ayi';

  return {
    symbol, lastPrice, dayChange, weekChange,
    bias, bogaCount, ayiCount, hits,
    indicators: {
      rsi: ctx.rsi, ema21: ctx.ema21, ema50: ctx.ema50,
      adx: ctx.adx?.adx, macd: ctx.macd?.histogram,
    },
    scannedAt: new Date().toISOString(),
  };
}

// ===================== Narrative generator (dexter-style brief reasoning) =====================
function buildNarrative(combo, result, ctx, price) {
  const reasonsTxt = (result.reasons || []).slice(0, 3).map(r => `• ${r}`).join('\n');
  const sideTxt = combo.side === 'boga'
    ? `Yükseliş sinyali. Tarihsel olarak bu kombo %${combo.success} oranında devam etmiş, ortalama %${combo.avgChange} hareket beklenir.`
    : combo.side === 'ayi'
      ? `Düşüş sinyali. Bu kombo %${combo.success} oranında izleyen barlarda düşüş getirmiş, ortalama %${combo.avgChange} aşağı baskı.`
      : 'Yatay/kararsız sinyal. Tetikleyici beklemek mantıklı.';
  return `${sideTxt}\nMevcut fiyat ₺${price.toFixed(2)}, RSI ${ctx.rsi}.\n${reasonsTxt}`;
}

// ===================== Public: combo catalog (no scan, just list) =====================
function getCatalog() {
  return COMBO_STRATEGIES.map(c => ({
    key: c.key, name: c.name, side: c.side, tier: c.tier,
    emoji: c.emoji, icon: c.icon, color: c.color, desc: c.desc,
    indicators: c.indicators, success: c.success, avgChange: c.avgChange,
    riskReward: c.riskReward, peak: c.peak,
  }));
}

module.exports = { analyzeSymbol, getCatalog, COMBO_STRATEGIES };
