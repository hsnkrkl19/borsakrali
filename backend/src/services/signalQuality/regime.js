/**
 * signalQuality/regime.js
 * ---------------------------------------------------------------------------
 * Piyasa REJİMİ tespiti + sinyal GEÇİŞ KAPISI (gate).
 *
 * Teşhis edilen sorun: Motorlar yatay/choppy piyasada zayıf sinyalleri
 * yayınlıyor; volatilite yalnızca güveni %15 kırpıyor, sinyali ELEMİYOR.
 *
 * Çözüm: Trend gücü (ADX) + yatay ölçüsü (Choppiness) + volatilite rejimi
 * (ATR%) birlikte değerlendirilir. Gate, choppy rejimde sinyali BLOKLAR;
 * yüksek-vol rejimde geçirir ama pozisyon boyutu çarpanını düşürür.
 *
 * Saf fonksiyon: yalnız candle dizisi ({high,low,close,[time]}) alır.
 */

'use strict';

const ind = require('./indicators');

const DEFAULTS = Object.freeze({
  period: 14,
  adxTrendMin: 20, // ADX >= 20 => trend var
  adxHardFloor: 15, // ADX < 15 => rejim ne olursa olsun trend yok
  chopMax: 61.8, // Choppiness > 61.8 => yatay (Fibonacci eşiği, sektör standardı)
  volLookback: 60, // ATR% rejimi için geriye bakış
  volHighSigma: 1.0, // ATR% > ortalama + 1σ => yüksek vol
  volLowSigma: 1.0, // ATR% < ortalama - 1σ => düşük vol
  highVolSizeMult: 0.6, // yüksek volde pozisyon boyutu çarpanı
  lowVolSizeMult: 0.9,
});

/**
 * @returns {{
 *   ok: boolean, regime: string, direction: 'long'|'short'|'neutral',
 *   adx: number|null, plusDI: number|null, minusDI: number|null,
 *   choppiness: number|null, atrPct: number|null, volState: string,
 *   trending: boolean, highVol: boolean,
 *   gate: { allow: boolean, reason: string, sizeMultiplier: number },
 *   diagnostics: object
 * }}
 */
function detectRegime(candles, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const empty = {
    ok: false,
    regime: 'unknown',
    direction: 'neutral',
    adx: null,
    plusDI: null,
    minusDI: null,
    choppiness: null,
    atrPct: null,
    volState: 'unknown',
    trending: false,
    highVol: false,
    gate: { allow: false, reason: 'insufficient_data', sizeMultiplier: 0 },
    diagnostics: {},
  };
  if (!Array.isArray(candles) || candles.length < 2 * cfg.period + 1) return empty;

  const adxObj = ind.adx(candles, cfg.period);
  const chopArr = ind.choppiness(candles, cfg.period);
  const atrArr = ind.atr(candles, cfg.period);

  const adxLast = ind.lastNonNull(adxObj.adx);
  const chopLast = ind.lastNonNull(chopArr);
  const atrLast = ind.lastNonNull(atrArr);
  const closeLast = candles[candles.length - 1].close;
  const plusDI = ind.lastNonNull(adxObj.plusDI);
  const minusDI = ind.lastNonNull(adxObj.minusDI);

  if (adxLast === null || chopLast === null || atrLast === null || !closeLast) {
    return empty;
  }

  const atrPct = (atrLast / closeLast) * 100;

  // --- Volatilite rejimi: ATR%'nin kendi geçmişine göre konumu ---
  const atrPctSeries = [];
  for (let i = 0; i < candles.length; i++) {
    const a = atrArr[i];
    const c = candles[i].close;
    if (a !== null && c) atrPctSeries.push((a / c) * 100);
  }
  const tail = atrPctSeries.slice(-cfg.volLookback);
  const vMean = ind.mean(tail);
  const vStd = ind.stdev(tail);
  let volState = 'normal';
  if (vMean !== null && vStd > 0) {
    if (atrPct > vMean + cfg.volHighSigma * vStd) volState = 'high';
    else if (atrPct < vMean - cfg.volLowSigma * vStd) volState = 'low';
  }
  const highVol = volState === 'high';

  // --- Trend / yön ---
  const trending = adxLast >= cfg.adxTrendMin && chopLast < cfg.chopMax && adxLast >= cfg.adxHardFloor;
  let direction = 'neutral';
  if (plusDI !== null && minusDI !== null) {
    if (plusDI > minusDI) direction = 'long';
    else if (minusDI > plusDI) direction = 'short';
  }

  // --- Rejim etiketi ---
  let regime;
  if (!trending) {
    regime = chopLast >= cfg.chopMax || adxLast < cfg.adxHardFloor ? 'chop' : 'transition';
  } else {
    regime = direction === 'short' ? 'trend_down' : 'trend_up';
  }
  if (highVol) regime = `${regime}|high_vol`;

  // --- Gate kararı ---
  // Choppy veya ADX taban-altı => BLOKLA. Geçiş rejimi => zayıf izin (yarı boyut).
  let allow = true;
  let reason = 'trend_ok';
  let sizeMultiplier = 1;

  if (!trending) {
    if (regime.startsWith('chop')) {
      allow = false;
      reason = `chop (ADX ${adxLast.toFixed(1)} < ${cfg.adxTrendMin} / CI ${chopLast.toFixed(1)} ≥ ${cfg.chopMax})`;
      sizeMultiplier = 0;
    } else {
      // transition: trend kuruluyor olabilir; küçük boyutla izin
      allow = true;
      reason = `transition (ADX ${adxLast.toFixed(1)})`;
      sizeMultiplier = 0.5;
    }
  }

  if (allow) {
    if (highVol) sizeMultiplier *= cfg.highVolSizeMult;
    else if (volState === 'low') sizeMultiplier *= cfg.lowVolSizeMult;
    sizeMultiplier = Math.max(0, Math.min(1, sizeMultiplier));
  }

  return {
    ok: true,
    regime,
    direction,
    adx: round(adxLast),
    plusDI: round(plusDI),
    minusDI: round(minusDI),
    choppiness: round(chopLast),
    atrPct: round(atrPct, 4),
    volState,
    trending,
    highVol,
    gate: { allow, reason, sizeMultiplier: round(sizeMultiplier, 3) },
    diagnostics: {
      atrPctMean: round(vMean, 4),
      atrPctStd: round(vStd, 4),
      sampleForVol: tail.length,
    },
  };
}

function round(x, d = 2) {
  if (x === null || !Number.isFinite(x)) return null;
  const m = Math.pow(10, d);
  return Math.round(x * m) / m;
}

module.exports = { detectRegime, DEFAULTS };
