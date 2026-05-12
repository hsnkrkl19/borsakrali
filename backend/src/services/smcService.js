/**
 * Smart Money Concepts (SMC) Service — BORSA KRALI
 *
 * Algorithm reference: joshyattridge/smartmoneyconcepts (Python, MIT)
 * Port: JavaScript, sade dependencies, OHLC array input.
 *
 * Tespit edilen 5 yapı:
 *   1) Swing Highs/Lows   — pivot noktaları (±swingLen)
 *   2) Fair Value Gap     — 3 bar gap (imbalance)
 *   3) Break of Structure / Change of Character — trend kırılım/dönüş
 *   4) Order Block        — agresif kırılımdan önceki son ters mum
 *   5) Liquidity Zones    — eşit seviyeli swing kümeleri (equal highs/lows) + sweep
 *
 * Çıktı:
 *   { swings, fvgs, structure, orderBlocks, liquidity,
 *     bias, signals, score, lastClose, currentPrice }
 */

// Cache: symbol+assetType -> { result, ts }
const smcCache = new Map();
const SMC_CACHE_TTL = 5 * 60 * 1000; // 5 dk

// ── Genel yardımcılar ───────────────────────────────────────────────────────
function calcATR(candles, period = 14) {
  if (candles.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const rel = trs.slice(-period);
  return rel.reduce((a, b) => a + b, 0) / Math.max(rel.length, 1);
}

// ── 1) Swing Highs / Lows ───────────────────────────────────────────────────
// len: her iki yanda kaç bar — referans Python default 50, biz daha küçük
// günlük TF için 10 makul (4-6 ay → ~120 bar içinden ~10-15 swing).
function swingHighsLows(candles, len = 10) {
  const n = candles.length;
  const points = []; // { i, time, type: 'high'|'low', level }
  for (let i = len; i < n - len; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = 1; j <= len; j++) {
      if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) isHigh = false;
      if (candles[i - j].low  <= c.low  || candles[i + j].low  <= c.low ) isLow  = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) points.push({ i, time: c.time, type: 'high', level: c.high });
    if (isLow)  points.push({ i, time: c.time, type: 'low',  level: c.low  });
  }

  // Ardışık aynı yön → güçlü olanı tut (high'ta yüksek, low'da düşük)
  const dedup = [];
  for (const p of points) {
    const last = dedup[dedup.length - 1];
    if (last && last.type === p.type) {
      if (p.type === 'high' && p.level > last.level) dedup[dedup.length - 1] = p;
      else if (p.type === 'low' && p.level < last.level) dedup[dedup.length - 1] = p;
    } else {
      dedup.push(p);
    }
  }
  return dedup;
}

// ── 2) Fair Value Gap (FVG) ─────────────────────────────────────────────────
// Bullish FVG: candle[i-1].high < candle[i+1].low (3'lü bar — i orta)
// Bearish FVG: candle[i-1].low  > candle[i+1].high
// Genellikle orta bar momentum mumu (close > open bull, close < open bear)
function detectFVG(candles, joinConsecutive = true) {
  const out = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const a = candles[i - 1], b = candles[i], c = candles[i + 1];
    // Bullish gap
    if (a.high < c.low && b.close > b.open) {
      out.push({
        i, time: b.time, type: 'bullish',
        top: c.low, bottom: a.high,
        mitigatedIndex: null,
      });
    }
    // Bearish gap
    if (a.low > c.high && b.close < b.open) {
      out.push({
        i, time: b.time, type: 'bearish',
        top: a.low, bottom: c.high,
        mitigatedIndex: null,
      });
    }
  }

  // İsteğe bağlı: ardışık aynı yöndeki FVG'leri birleştir
  if (joinConsecutive && out.length > 1) {
    const merged = [out[0]];
    for (let k = 1; k < out.length; k++) {
      const last = merged[merged.length - 1];
      if (last.type === out[k].type && out[k].i - last.i <= 2) {
        last.top = Math.max(last.top, out[k].top);
        last.bottom = Math.min(last.bottom, out[k].bottom);
        last.i = out[k].i;
      } else {
        merged.push(out[k]);
      }
    }
    out.length = 0;
    out.push(...merged);
  }

  // Mitigation: fiyat gap'i kapatmış mı?
  for (const fvg of out) {
    for (let k = fvg.i + 2; k < candles.length; k++) {
      const cd = candles[k];
      if (fvg.type === 'bullish' && cd.low <= fvg.bottom) { fvg.mitigatedIndex = k; break; }
      if (fvg.type === 'bearish' && cd.high >= fvg.top)   { fvg.mitigatedIndex = k; break; }
    }
  }
  return out;
}

// ── 3) BOS / CHoCH ──────────────────────────────────────────────────────────
// İki ardışık aynı yönlü swing arasındaki ilişkiyi kontrol et:
//   - Aynı yönde yeni high > eski high (yukarı trend devamı) → BOS bullish
//   - Aynı yönde yeni low  < eski low  (aşağı trend devamı) → BOS bearish
//   - Trend yön değiştirip karşı yön swing'i geçtiyse        → CHoCH
function detectBOSCHoCH(candles, swings) {
  const events = [];
  // Aynı tip swing'leri kronolojik olarak topla
  const highs = swings.filter(s => s.type === 'high');
  const lows  = swings.filter(s => s.type === 'low');

  // BOS bullish: ardışık high'larda yükselme
  for (let k = 1; k < highs.length; k++) {
    if (highs[k].level > highs[k - 1].level) {
      // Kırılım barını bul (close > prev high)
      const breakBar = findBreakBar(candles, highs[k - 1].i + 1, 'above', highs[k - 1].level);
      if (breakBar !== null) {
        events.push({
          type: 'bos', direction: 'bullish',
          fromIndex: highs[k - 1].i, toIndex: highs[k].i,
          breakIndex: breakBar, level: highs[k - 1].level,
          time: candles[breakBar]?.time,
        });
      }
    }
  }
  // BOS bearish: ardışık low'larda düşme
  for (let k = 1; k < lows.length; k++) {
    if (lows[k].level < lows[k - 1].level) {
      const breakBar = findBreakBar(candles, lows[k - 1].i + 1, 'below', lows[k - 1].level);
      if (breakBar !== null) {
        events.push({
          type: 'bos', direction: 'bearish',
          fromIndex: lows[k - 1].i, toIndex: lows[k].i,
          breakIndex: breakBar, level: lows[k - 1].level,
          time: candles[breakBar]?.time,
        });
      }
    }
  }

  // CHoCH: trend dönüşü — son aynı yön swing aşıldığında yön değişti mi?
  // En basit pratik tanım: önce aşağı yönlü swing yapısı varken yeni high önceki high'ı kırdı → bullish CHoCH
  // ve tam tersi.
  for (let i = 1; i < swings.length - 1; i++) {
    const a = swings[i - 1], b = swings[i], c = swings[i + 1];
    if (a.type === 'high' && b.type === 'low' && c.type === 'high') {
      // Aşağı trendde miydik? a.high'tan b.low'a düşüş, sonra c yeni high
      if (c.level > a.level && b.level < a.level) {
        const breakBar = findBreakBar(candles, b.i + 1, 'above', a.level);
        if (breakBar !== null) {
          events.push({
            type: 'choch', direction: 'bullish',
            fromIndex: a.i, toIndex: c.i,
            breakIndex: breakBar, level: a.level,
            time: candles[breakBar]?.time,
          });
        }
      }
    }
    if (a.type === 'low' && b.type === 'high' && c.type === 'low') {
      if (c.level < a.level && b.level > a.level) {
        const breakBar = findBreakBar(candles, b.i + 1, 'below', a.level);
        if (breakBar !== null) {
          events.push({
            type: 'choch', direction: 'bearish',
            fromIndex: a.i, toIndex: c.i,
            breakIndex: breakBar, level: a.level,
            time: candles[breakBar]?.time,
          });
        }
      }
    }
  }

  events.sort((x, y) => x.breakIndex - y.breakIndex);
  return events;
}

function findBreakBar(candles, fromIdx, dir, level) {
  for (let i = fromIdx; i < candles.length; i++) {
    if (dir === 'above' && candles[i].close > level) return i;
    if (dir === 'below' && candles[i].close < level) return i;
  }
  return null;
}

// ── 4) Order Blocks ─────────────────────────────────────────────────────────
// Bullish OB: agresif yukarı kırılımdan önceki SON kırmızı mum
// Bearish OB: agresif aşağı kırılımdan önceki SON yeşil mum
// Strength = (kırılım mumu range) / ATR  — büyükse kalitelidir
function detectOrderBlocks(candles, structureEvents, atr) {
  const obs = [];

  for (const ev of structureEvents) {
    if (ev.type !== 'bos' && ev.type !== 'choch') continue;
    const breakIdx = ev.breakIndex;
    if (breakIdx == null || breakIdx < 2) continue;

    const breakBar = candles[breakIdx];
    const breakRange = breakBar.high - breakBar.low;
    const aggression = atr > 0 ? breakRange / atr : 1; // büyük = güçlü hareket
    if (aggression < 0.8) continue; // çok zayıf kırılım → OB sayma

    if (ev.direction === 'bullish') {
      // Kırılım öncesi son kırmızı (close < open) mumu bul
      let obIdx = null;
      for (let k = breakIdx - 1; k >= Math.max(0, breakIdx - 10); k--) {
        if (candles[k].close < candles[k].open) { obIdx = k; break; }
      }
      if (obIdx !== null) {
        const ob = candles[obIdx];
        const obZone = {
          type: 'bullish',
          i: obIdx, time: ob.time,
          top: Math.max(ob.open, ob.close),
          bottom: ob.low, // wick dahil — likidite var
          aggression: +aggression.toFixed(2),
          source: ev.type, // 'bos' veya 'choch'
          mitigatedIndex: null,
          volume: ob.volume || 0,
        };
        // Mitigation: sonradan fiyat OB bottom'ın altına kapanırsa kırıldı
        for (let k = breakIdx + 1; k < candles.length; k++) {
          if (candles[k].close < obZone.bottom) { obZone.mitigatedIndex = k; break; }
        }
        obs.push(obZone);
      }
    } else if (ev.direction === 'bearish') {
      let obIdx = null;
      for (let k = breakIdx - 1; k >= Math.max(0, breakIdx - 10); k--) {
        if (candles[k].close > candles[k].open) { obIdx = k; break; }
      }
      if (obIdx !== null) {
        const ob = candles[obIdx];
        const obZone = {
          type: 'bearish',
          i: obIdx, time: ob.time,
          top: ob.high,
          bottom: Math.min(ob.open, ob.close),
          aggression: +aggression.toFixed(2),
          source: ev.type,
          mitigatedIndex: null,
          volume: ob.volume || 0,
        };
        for (let k = breakIdx + 1; k < candles.length; k++) {
          if (candles[k].close > obZone.top) { obZone.mitigatedIndex = k; break; }
        }
        obs.push(obZone);
      }
    }
  }
  return obs;
}

// ── 5) Liquidity Zones ──────────────────────────────────────────────────────
// Aynı seviyede kümelenen (±range*pct) 2+ swing → likidite havuzu.
// Sweep = fiyat seviyeyi briefly aştıktan sonra geri döndü (wick sweep).
function detectLiquidity(candles, swings, rangePct = 0.005) {
  if (candles.length < 5) return [];
  const allHigh = Math.max(...candles.map(c => c.high));
  const allLow  = Math.min(...candles.map(c => c.low));
  const pipRange = (allHigh - allLow) * rangePct;

  const zones = [];
  const highSwings = swings.filter(s => s.type === 'high');
  const lowSwings  = swings.filter(s => s.type === 'low');

  // High kümeleri (resistance / sell-side liquidity)
  const usedH = new Set();
  for (let i = 0; i < highSwings.length; i++) {
    if (usedH.has(i)) continue;
    const ref = highSwings[i];
    const group = [ref];
    for (let j = i + 1; j < highSwings.length; j++) {
      if (Math.abs(highSwings[j].level - ref.level) <= pipRange) {
        group.push(highSwings[j]);
        usedH.add(j);
      }
    }
    if (group.length >= 2) {
      const avg = group.reduce((a, s) => a + s.level, 0) / group.length;
      const lastI = group[group.length - 1].i;
      // Sweep: lastI sonrası ilk wick > avg ama close < avg
      let sweptIndex = null;
      for (let k = lastI + 1; k < candles.length; k++) {
        if (candles[k].high > avg && candles[k].close < avg) {
          sweptIndex = k; break;
        }
      }
      zones.push({
        type: 'sell_side', // high — short trigger
        level: avg,
        startIndex: group[0].i,
        endIndex: lastI,
        count: group.length,
        sweptIndex,
        time: group[0].time,
      });
    }
  }
  // Low kümeleri (support / buy-side liquidity)
  const usedL = new Set();
  for (let i = 0; i < lowSwings.length; i++) {
    if (usedL.has(i)) continue;
    const ref = lowSwings[i];
    const group = [ref];
    for (let j = i + 1; j < lowSwings.length; j++) {
      if (Math.abs(lowSwings[j].level - ref.level) <= pipRange) {
        group.push(lowSwings[j]);
        usedL.add(j);
      }
    }
    if (group.length >= 2) {
      const avg = group.reduce((a, s) => a + s.level, 0) / group.length;
      const lastI = group[group.length - 1].i;
      let sweptIndex = null;
      for (let k = lastI + 1; k < candles.length; k++) {
        if (candles[k].low < avg && candles[k].close > avg) {
          sweptIndex = k; break;
        }
      }
      zones.push({
        type: 'buy_side',
        level: avg,
        startIndex: group[0].i,
        endIndex: lastI,
        count: group.length,
        sweptIndex,
        time: group[0].time,
      });
    }
  }
  return zones;
}

// ── Skor & sinyal üretimi ──────────────────────────────────────────────────
function deriveSignals(state, candles, atr) {
  const last = candles[candles.length - 1];
  const lastClose = last.close;
  const lastIdx = candles.length - 1;
  const signals = [];

  // 1) Son yapı eventi → bias
  const recentStructure = [...state.structure].reverse().find(s => lastIdx - s.breakIndex <= 30);
  let bias = 'neutral';
  if (recentStructure) {
    bias = recentStructure.direction;
  }

  // 2) Aktif (mitige edilmemiş) bullish FVG → fiyat üstü retracement → "buy zone"
  const activeBullFVG = state.fvgs.filter(f => f.type === 'bullish' && !f.mitigatedIndex && f.top < lastClose);
  const activeBearFVG = state.fvgs.filter(f => f.type === 'bearish' && !f.mitigatedIndex && f.bottom > lastClose);

  // 3) Aktif OB'ler — fiyat henüz değmemiş
  const activeBullOB = state.orderBlocks.filter(o => o.type === 'bullish' && !o.mitigatedIndex);
  const activeBearOB = state.orderBlocks.filter(o => o.type === 'bearish' && !o.mitigatedIndex);

  // 4) Sweep + yapı dönüşü = en yüksek kalite giriş
  const recentSweeps = state.liquidity.filter(l => l.sweptIndex != null && lastIdx - l.sweptIndex <= 5);

  // Bullish entry: bias bullish + buy-side sweep + bullish FVG/OB altta destekliyor
  for (const ob of activeBullOB) {
    if (ob.i > lastIdx - 30 && lastClose > ob.bottom) {
      const distancePct = ((lastClose - ob.top) / lastClose) * 100;
      // Çok uzaktaki OB pratik değil
      if (distancePct < 8) {
        const score = scoreSignal({
          base: 50,
          biasAligned: bias === 'bullish' ? 20 : (bias === 'bearish' ? -15 : 0),
          fromCHoCH: ob.source === 'choch' ? 15 : 5,
          aggression: Math.min(20, ob.aggression * 10),
          confluenceFVG: activeBullFVG.some(f =>
            f.bottom <= ob.top && f.top >= ob.bottom) ? 10 : 0,
          confluenceSweep: recentSweeps.some(s => s.type === 'buy_side' &&
            Math.abs(s.level - ob.bottom) / lastClose < 0.02) ? 15 : 0,
          distancePenalty: -Math.min(15, distancePct * 1.5),
        });
        const stop = ob.bottom - 0.5 * atr;
        const entry = ob.top;
        const target = entry + 2 * (entry - stop);
        signals.push({
          type: 'long',
          source: 'order_block',
          entry, stop, target,
          score, level: ob.top, bottom: ob.bottom,
          rr: ((target - entry) / Math.max(entry - stop, 1e-9)).toFixed(2),
          obSource: ob.source,
          ageBars: lastIdx - ob.i,
        });
      }
    }
  }
  for (const ob of activeBearOB) {
    if (ob.i > lastIdx - 30 && lastClose < ob.top) {
      const distancePct = ((ob.bottom - lastClose) / lastClose) * 100;
      if (distancePct < 8) {
        const score = scoreSignal({
          base: 50,
          biasAligned: bias === 'bearish' ? 20 : (bias === 'bullish' ? -15 : 0),
          fromCHoCH: ob.source === 'choch' ? 15 : 5,
          aggression: Math.min(20, ob.aggression * 10),
          confluenceFVG: activeBearFVG.some(f =>
            f.bottom <= ob.top && f.top >= ob.bottom) ? 10 : 0,
          confluenceSweep: recentSweeps.some(s => s.type === 'sell_side' &&
            Math.abs(s.level - ob.top) / lastClose < 0.02) ? 15 : 0,
          distancePenalty: -Math.min(15, distancePct * 1.5),
        });
        const stop = ob.top + 0.5 * atr;
        const entry = ob.bottom;
        const target = entry - 2 * (stop - entry);
        signals.push({
          type: 'short',
          source: 'order_block',
          entry, stop, target,
          score, level: ob.bottom, top: ob.top,
          rr: ((entry - target) / Math.max(stop - entry, 1e-9)).toFixed(2),
          obSource: ob.source,
          ageBars: lastIdx - ob.i,
        });
      }
    }
  }

  // FVG-only sinyaller (OB yoksa)
  for (const fvg of activeBullFVG) {
    if (fvg.i > lastIdx - 25) {
      const distancePct = ((lastClose - fvg.top) / lastClose) * 100;
      if (distancePct > 0 && distancePct < 6) {
        const score = scoreSignal({
          base: 40,
          biasAligned: bias === 'bullish' ? 15 : (bias === 'bearish' ? -10 : 0),
          distancePenalty: -Math.min(10, distancePct * 2),
          confluenceSweep: recentSweeps.some(s => s.type === 'buy_side') ? 10 : 0,
        });
        const entry = fvg.top;
        const stop = fvg.bottom - 0.3 * atr;
        const target = entry + 2 * (entry - stop);
        signals.push({
          type: 'long', source: 'fvg',
          entry, stop, target, score,
          level: fvg.top, bottom: fvg.bottom,
          rr: ((target - entry) / Math.max(entry - stop, 1e-9)).toFixed(2),
          ageBars: lastIdx - fvg.i,
        });
      }
    }
  }
  for (const fvg of activeBearFVG) {
    if (fvg.i > lastIdx - 25) {
      const distancePct = ((fvg.bottom - lastClose) / lastClose) * 100;
      if (distancePct > 0 && distancePct < 6) {
        const score = scoreSignal({
          base: 40,
          biasAligned: bias === 'bearish' ? 15 : (bias === 'bullish' ? -10 : 0),
          distancePenalty: -Math.min(10, distancePct * 2),
          confluenceSweep: recentSweeps.some(s => s.type === 'sell_side') ? 10 : 0,
        });
        const entry = fvg.bottom;
        const stop = fvg.top + 0.3 * atr;
        const target = entry - 2 * (stop - entry);
        signals.push({
          type: 'short', source: 'fvg',
          entry, stop, target, score,
          level: fvg.bottom, top: fvg.top,
          rr: ((entry - target) / Math.max(stop - entry, 1e-9)).toFixed(2),
          ageBars: lastIdx - fvg.i,
        });
      }
    }
  }

  signals.sort((a, b) => b.score - a.score);

  // Grade
  signals.forEach(s => {
    s.grade = s.score >= 80 ? 'A+'
            : s.score >= 65 ? 'A'
            : s.score >= 50 ? 'B'
            : 'C';
  });

  return { bias, signals: signals.slice(0, 8) };
}

function scoreSignal(parts) {
  const sum = Object.values(parts).reduce((a, b) => a + (b || 0), 0);
  return Math.min(100, Math.max(0, Math.round(sum)));
}

// ── Ana fonksiyon ──────────────────────────────────────────────────────────
async function analyzeSMC(symbol, historicalData, opts = {}) {
  const cacheKey = `${symbol}::${opts.assetType || 'stock'}::${opts.swingLen || 'def'}`;
  const cached = smcCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SMC_CACHE_TTL) {
    return cached.result;
  }

  const candles = historicalData;
  if (!candles || candles.length < 30) {
    return { symbol, error: 'Yetersiz veri', signals: [], bias: 'neutral' };
  }

  // Swing length asset volatilitesine göre
  const swingLen = opts.swingLen ||
    (opts.assetType === 'crypto' ? 8 : 10);

  const atr = calcATR(candles);
  const swings = swingHighsLows(candles, swingLen);
  const fvgs = detectFVG(candles, true);
  const structure = detectBOSCHoCH(candles, swings);
  const orderBlocks = detectOrderBlocks(candles, structure, atr);
  const liquidity = detectLiquidity(candles, swings, 0.005);

  const state = { swings, fvgs, structure, orderBlocks, liquidity };
  const { bias, signals } = deriveSignals(state, candles, atr);

  const last = candles[candles.length - 1];
  const result = {
    symbol,
    assetType: opts.assetType || 'stock',
    atr,
    bias,
    swings: swings.slice(-20), // sadece son 20 swing — UI'da fazlası gürültü
    fvgs: fvgs.slice(-15),
    structure: structure.slice(-10),
    orderBlocks: orderBlocks.slice(-10),
    liquidity: liquidity.slice(-10),
    signals,
    lastClose: last.close,
    lastTime: last.time,
    candleCount: candles.length,
    analyzedAt: new Date().toISOString(),
  };

  smcCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

module.exports = {
  analyzeSMC,
  // expose for testing
  swingHighsLows, detectFVG, detectBOSCHoCH, detectOrderBlocks, detectLiquidity,
};
