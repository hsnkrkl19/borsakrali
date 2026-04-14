/**
 * Malaysian SNR Service — BORSA KRALI
 * Body-bazli Destek/Direnc Bolgesi Tespiti
 * Kaynak: Malaysian SNR Master System algoritmasindan uyarlanmistir.
 */

// SNR cache: symbol+tf -> { zones, signals, ts }
const snrCache = new Map();
const SNR_CACHE_TTL = 5 * 60 * 1000; // 5 dakika

// ---- ATR hesaplama ----
function calcATR(candles, period = 14) {
  if (candles.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const relevant = trs.slice(-period);
  return relevant.reduce((a, b) => a + b, 0) / relevant.length;
}

// ---- EMA ----
function ema(values, period) {
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

// ---- Storyline (HTF yön) ----
function deriveStoryline(candles) {
  if (candles.length < 50) return 'neutral';
  const closes = candles.map(c => c.close);
  const ema20 = ema(closes.slice(-20), 20);
  const ema50 = ema(closes.slice(-50), 50);
  const last = closes[closes.length - 1];
  if (last > ema20 && ema20 > ema50) return 'bullish';
  if (last < ema20 && ema20 < ema50) return 'bearish';
  return 'neutral';
}

// ---- SNR Zone tespiti ----
// Bearish→Bullish geçiş = Support, Bullish→Bearish geçiş = Resistance
function detectZones(candles, atr) {
  const zones = [];
  const minBodyRatio = 0.3; // minimum body/range orani

  for (let i = 2; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];

    const prevBody = Math.abs(prev.close - prev.open);
    const currBody = Math.abs(curr.close - curr.open);
    const prevRange = prev.high - prev.low;
    const currRange = curr.high - curr.low;

    if (prevRange === 0 || currRange === 0) continue;
    if (prevBody / prevRange < minBodyRatio || currBody / currRange < minBodyRatio) continue;

    const prevBullish = prev.close > prev.open;
    const currBullish = curr.close > curr.open;

    // Bearish -> Bullish = Support zone
    if (!prevBullish && currBullish) {
      const baseTop = Math.max(prev.open, prev.close); // üst bölge sınırı
      const baseBot = Math.min(prev.open, prev.close);
      const gap = curr.open - prev.close;
      const zoneType = Math.abs(gap) >= 0.10 * atr ? 'gap' : 'classical';

      zones.push({
        id: `S_${i}`,
        type: 'support',
        zoneType,
        top: baseTop,
        bottom: baseBot,
        pivotIndex: i,
        pivotTime: curr.time,
        touchCount: 0,
        freshness: 'fresh',
        bodyTop: baseTop,
        bodyBottom: baseBot,
        score: 0,
        gap,
      });
    }

    // Bullish -> Bearish = Resistance zone
    if (prevBullish && !currBullish) {
      const baseTop = Math.max(prev.open, prev.close);
      const baseBot = Math.min(prev.open, prev.close);
      const gap = prev.close - curr.open;
      const zoneType = Math.abs(gap) >= 0.10 * atr ? 'gap' : 'classical';

      zones.push({
        id: `R_${i}`,
        type: 'resistance',
        zoneType,
        top: baseTop,
        bottom: baseBot,
        pivotIndex: i,
        pivotTime: curr.time,
        touchCount: 0,
        freshness: 'fresh',
        bodyTop: baseTop,
        bodyBottom: baseBot,
        score: 0,
        gap,
      });
    }
  }

  return zones;
}

// ---- Zone doğrulama: freshness, touch, miss ----
function validateZones(zones, candles) {
  return zones.map(zone => {
    let touches = 0;
    let firstTouchAfter = null;
    let breakout = false;

    for (let i = zone.pivotIndex + 1; i < candles.length; i++) {
      const c = candles[i];
      const inZone = c.low <= zone.top && c.high >= zone.bottom;
      const bodyTouch = c.close >= zone.bottom && c.close <= zone.top;
      const wickOnly = inZone && !bodyTouch;

      if (inZone) {
        touches++;
        if (firstTouchAfter === null) firstTouchAfter = i;
      }

      // Breakout: close belirgin şekilde zone dışına çıkarsa
      if (zone.type === 'support' && c.close < zone.bottom - 0.5 * (zone.top - zone.bottom)) {
        breakout = true;
        break;
      }
      if (zone.type === 'resistance' && c.close > zone.top + 0.5 * (zone.top - zone.bottom)) {
        breakout = true;
        break;
      }
    }

    let freshness = 'fresh';
    if (breakout) freshness = 'broken';
    else if (touches >= 3) freshness = 'used';
    else if (touches >= 1) freshness = 'tested';

    // Miss: Zone sonrası ilk 3 bar dokunmadan uzaklaştıysa validated
    let validated = false;
    if (firstTouchAfter !== null && firstTouchAfter - zone.pivotIndex <= 3) {
      validated = true;
    } else if (firstTouchAfter === null && candles.length - zone.pivotIndex > 5) {
      validated = true; // Zone test edilmedi ama oluştu
    }

    return { ...zone, touchCount: touches, freshness, validated };
  }).filter(z => z.freshness !== 'broken');
}

// ---- Engulfing tespiti ----
function detectEngulfing(candles) {
  const events = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const prevBody = { top: Math.max(prev.open, prev.close), bot: Math.min(prev.open, prev.close) };
    const currBody = { top: Math.max(curr.open, curr.close), bot: Math.min(curr.open, curr.close) };

    // Bullish engulfing
    if (curr.close > curr.open && curr.close > prevBody.top && curr.open < prevBody.bot) {
      events.push({ type: 'bullish_engulfing', index: i, time: curr.time });
    }
    // Bearish engulfing
    if (curr.close < curr.open && curr.close < prevBody.bot && curr.open > prevBody.top) {
      events.push({ type: 'bearish_engulfing', index: i, time: curr.time });
    }
  }
  return events;
}

// ---- Likidite sweep tespiti ----
function detectLiquiditySweeps(zones, candles) {
  const sweeps = [];
  zones.forEach(zone => {
    for (let i = zone.pivotIndex + 1; i < candles.length; i++) {
      const c = candles[i];
      if (zone.type === 'support') {
        // Wick zone altına girer ama close zone içinde veya üstünde
        if (c.low < zone.bottom && c.close >= zone.bottom) {
          sweeps.push({ zoneId: zone.id, index: i, type: 'support_sweep' });
        }
      } else {
        // Wick zone üstüne girer ama close zone içinde veya altında
        if (c.high > zone.top && c.close <= zone.top) {
          sweeps.push({ zoneId: zone.id, index: i, type: 'resistance_sweep' });
        }
      }
    }
  });
  return sweeps;
}

// ---- Skor hesapla ----
function scoreZones(zones, engulfing, sweeps, storyline, candles, atr) {
  return zones.map(zone => {
    let score = 40; // Base

    // Freshness bonus
    if (zone.freshness === 'fresh') score += 15;
    else if (zone.freshness === 'tested') score += 5;

    // Zone type bonus (gap > classical)
    if (zone.zoneType === 'gap') score += 10;

    // Engulfing confluence
    const nearEngulf = engulfing.some(e => {
      const isNear = Math.abs(e.index - zone.pivotIndex) <= 3;
      const aligned = (zone.type === 'support' && e.type === 'bullish_engulfing') ||
                      (zone.type === 'resistance' && e.type === 'bearish_engulfing');
      return isNear && aligned;
    });
    if (nearEngulf) score += 15;

    // Liquidity sweep bonus
    const hasSweep = sweeps.some(s => s.zoneId === zone.id);
    if (hasSweep) score += 20;

    // Storyline confluence
    const storylineAligned =
      (storyline === 'bullish' && zone.type === 'support') ||
      (storyline === 'bearish' && zone.type === 'resistance');
    if (storylineAligned) score += 20;
    else if (storyline !== 'neutral') score -= 10;

    // Touch count penalty
    score -= zone.touchCount * 5;

    // Validated bonus
    if (zone.validated) score += 5;

    score = Math.min(100, Math.max(0, score));

    // Grade
    let grade = null;
    if (score >= 80) grade = 'A+';
    else if (score >= 65) grade = 'A';
    else if (score >= 50) grade = 'B';

    // Entry/Stop/Target hesapla
    const lastClose = candles[candles.length - 1]?.close || 0;
    let entry, stop, target;
    if (zone.type === 'support') {
      entry = zone.top;
      stop = zone.bottom - 0.5 * atr;
      target = entry + 2 * (entry - stop);
    } else {
      entry = zone.bottom;
      stop = zone.top + 0.5 * atr;
      target = entry - 2 * (stop - entry);
    }

    return { ...zone, score, grade, entry, stop, target };
  });
}

// ---- Ana fonksiyon ----
async function analyzeSNR(symbol, historicalData) {
  const cacheKey = symbol;
  const cached = snrCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SNR_CACHE_TTL) {
    return cached.result;
  }

  const candles = historicalData;
  if (!candles || candles.length < 20) {
    return { zones: [], signals: [], storyline: 'neutral', error: 'Yetersiz veri' };
  }

  const atr = calcATR(candles);
  const storyline = deriveStoryline(candles);
  const rawZones = detectZones(candles, atr);
  const validZones = validateZones(rawZones, candles);
  const engulfing = detectEngulfing(candles);
  const sweeps = detectLiquiditySweeps(validZones, candles);
  const scoredZones = scoreZones(validZones, engulfing, sweeps, storyline, candles, atr);

  // Sinyaller: skor >= 50
  const signals = scoredZones
    .filter(z => z.grade !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const result = {
    symbol,
    storyline,
    atr,
    zones: scoredZones,
    signals,
    engulfing: engulfing.slice(-10),
    sweeps,
    lastClose: candles[candles.length - 1]?.close,
    lastTime: candles[candles.length - 1]?.time,
    candleCount: candles.length,
  };

  snrCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

module.exports = { analyzeSNR };
