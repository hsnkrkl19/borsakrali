/**
 * Genel Tarama — BIST "strategy-scan" stratejilerinin forex'e portu.
 *
 * ⚠️ SİMETRİ DÜZELTMESİ (2026-07-06): orijinal port 11 boğa + 6 ayı koşuluydu
 * (BIST long-only piyasa). Düşen piyasada ayının tek osilatör koşulları
 * (RSI>70, Stoch>80) HİÇ tetiklenemezken boğanın dip-alım koşulları her minik
 * sıçramada tetikleniyordu → modül düşüşte bile LONG oyladı (2026-07-06 gecesi
 * tüm işlemler ters-yön long açıldı, tamamı zarar). Artık her boğa koşulunun
 * ayı aynası var: 12 boğa + 12 ayı — iki taraf da her rejimde ulaşılabilir.
 *
 * evaluate(candles) → { vote, strength, score, conditions, longHits, shortHits, ind }
 */

const { rsi } = require('../indicators');
const { emaSeries, macdLines, supertrend, vwap, adxFull } = require('../strategyHelpers');
const { bollinger, stochastic, ichimoku } = require('../extraIndicators');

function sma(values, p) { return values.length >= p ? values.slice(-p).reduce((a, b) => a + b, 0) / p : null; }

function evaluate(candles) {
  if (!candles || candles.length < 60) return null;
  const n = candles.length - 1;
  const closes = candles.map(c => c.close);
  const vols = candles.map(c => c.volume || 0);

  const ema5 = emaSeries(closes, 5);
  const ema9 = emaSeries(closes, 9);
  const ema20 = emaSeries(closes, 20);
  const ema21 = emaSeries(closes, 21);
  const ema34 = emaSeries(closes, 34);
  const ema50 = emaSeries(closes, 50);

  const close = closes[n], closePrev = closes[n - 1];
  const rsiNow = rsi(closes, 14);
  const rsiPrev = rsi(closes.slice(0, -1), 14);
  const bb = bollinger(closes, 20, 2);
  const ich = ichimoku(candles);
  const adxF = adxFull(candles, 14);
  const st = supertrend(candles, 10, 3);
  const stoch = stochastic(candles, 14, 3);
  const macd = macdLines(closes);
  const vw = vwap(candles);
  const volNow = vols[n], avgVol20 = sma(vols, 20);
  const hasVol = vols.slice(-50).some(v => v > 0);

  // EMA34 dalga metrikleri
  const ema34Now = ema34[n], ema34Prev = ema34[n - 1];
  const ema34Base = ema34[n - 5];
  const ema34Slope = ema34Base ? ((ema34Now - ema34Base) / ema34Base) * 100 : 0;
  let consec = 0;
  for (let i = n; i >= 0; i--) {
    const above = closes[i] > ema34[i], below = closes[i] < ema34[i];
    if (above) { if (consec >= 0) consec++; else break; }
    else if (below) { if (consec <= 0) consec--; else break; }
    else break;
  }
  let touched5 = false;
  for (let i = Math.max(1, n - 4); i <= n; i++) {
    if (candles[i].low <= ema34[i] && candles[i].high >= ema34[i]) { touched5 = true; break; }
  }
  // nearEma20 son 4 barda %2.5 içinde
  let nearEma20 = false;
  for (let i = Math.max(0, n - 3); i <= n; i++) {
    if (ema20[i] && Math.abs(closes[i] - ema20[i]) / ema20[i] <= 0.025) { nearEma20 = true; break; }
  }

  const C = []; // conditions
  const add = (id, label, group, met) => C.push({ id, label, group, met: !!met });

  // ── BOĞA (12) ──
  add('duseniKirma', 'Düşeni Kırma', 'bullish',
    close > ema20[n] && closePrev < ema20[n - 1] && rsiNow != null && rsiPrev != null && rsiNow > rsiPrev && rsiNow > 40);
  add('yukselenDuzeltme', 'Yükselen Düzeltme', 'bullish',
    close > ema50[n] && nearEma20 && rsiNow > 35 && rsiNow < 55 && close > closePrev);
  add('trendDibi', 'Trend Dibi (V)', 'bullish',
    rsiNow != null && rsiNow < 35 && bb && close <= bb.lower * 1.02 && closes[n - 2] > closePrev && close > closePrev);
  add('ichimokuBullish', 'Ichimoku Boğa', 'bullish',
    ich && close > ich.cloudTop && ich.tenkan > ich.kijun && ich.senkouA > ich.senkouB);
  add('rsiAdxStrong', 'RSI+ADX Güçlü', 'bullish',
    adxF && adxF.adx > 25 && adxF.pdi > adxF.ndi && rsiNow > 40 && rsiNow < 65 && rsiNow > rsiPrev);
  add('supertrendBuy', 'Supertrend Alış', 'bullish',
    st.length >= 3 && st[n] === 1 && (st[n - 1] === -1 || st[n - 2] === -1));
  add('stochOversold', 'Stokastik Dönüş', 'bullish',
    stoch && stoch.kPrev != null && stoch.kPrev < 20 && stoch.k > 20);
  add('emaLadder', 'EMA Merdiveni', 'bullish',
    close > ema5[n] && ema5[n] > ema9[n] && ema9[n] > ema21[n] && ema21[n] > ema50[n]);
  add('vwapAbove', 'VWAP Üstü', 'bullish',
    hasVol && vw != null && close > vw && avgVol20 && volNow > avgVol20 * 1.2);
  add('ema34WaveLong', 'EMA34 Wave Long', 'bullish',
    close > ema34Now && ema34Slope > 0.3 && consec >= 3 && touched5 && close > closePrev);
  add('ema34CrossAbove', 'EMA34 Yukarı Kesişim', 'bullish',
    closePrev <= ema34Prev && close > ema34Now);
  add('macdBullish', 'MACD Altın Çapraz', 'bullish',
    macd && macd.macdPrev < macd.signalPrev && macd.macd > macd.signal);

  // ── AYI (12) — her boğa koşulunun aynası ──
  add('ichimokuBearish', 'Ichimoku Ayı', 'bearish',
    ich && close < ich.cloudBottom && ich.tenkan < ich.kijun && ich.senkouA < ich.senkouB);
  add('trendZirvesi', 'Trend Zirvesi (Λ)', 'bearish',
    rsiNow != null && rsiNow > 70 && bb && close >= bb.upper * 0.98 && closes[n - 2] < closePrev && close < closePrev);
  add('stochOverbought', 'Stokastik Zirve', 'bearish',
    stoch && stoch.kPrev != null && stoch.kPrev > 80 && stoch.k < 80);
  add('macdBearish', 'MACD Ölüm Çaprazı', 'bearish',
    macd && macd.macdPrev > macd.signalPrev && macd.macd < macd.signal);
  add('ema34WaveShort', 'EMA34 Wave Short', 'bearish',
    close < ema34Now && ema34Slope < -0.3 && consec <= -3 && touched5 && close < closePrev);
  add('ema34CrossBelow', 'EMA34 Aşağı Kesişim', 'bearish',
    closePrev >= ema34Prev && close < ema34Now);
  add('yukseleniKirma', 'Yükseleni Kırma', 'bearish',
    close < ema20[n] && closePrev > ema20[n - 1] && rsiNow != null && rsiPrev != null && rsiNow < rsiPrev && rsiNow < 60);
  add('dusenDuzeltme', 'Düşen Düzeltme', 'bearish',
    close < ema50[n] && nearEma20 && rsiNow > 45 && rsiNow < 65 && close < closePrev);
  add('rsiAdxStrongBear', 'RSI+ADX Güçlü Ayı', 'bearish',
    adxF && adxF.adx > 25 && adxF.ndi > adxF.pdi && rsiNow < 60 && rsiNow > 35 && rsiNow < rsiPrev);
  add('supertrendSell', 'Supertrend Satış', 'bearish',
    st.length >= 3 && st[n] === -1 && (st[n - 1] === 1 || st[n - 2] === 1));
  add('emaLadderBear', 'EMA Merdiveni Aşağı', 'bearish',
    close < ema5[n] && ema5[n] < ema9[n] && ema9[n] < ema21[n] && ema21[n] < ema50[n]);
  add('vwapBelow', 'VWAP Altı', 'bearish',
    hasVol && vw != null && close < vw && avgVol20 && volNow > avgVol20 * 1.2);

  const longHits = C.filter(c => c.group === 'bullish' && c.met).length;
  const shortHits = C.filter(c => c.group === 'bearish' && c.met).length;
  const net = longHits - shortHits;
  const vote = net > 0 ? 'long' : net < 0 ? 'short' : 'neutral';
  const strength = Math.min(1, Math.abs(net) / 5);
  const score = Math.max(0, Math.min(100, Math.round(50 + net * 10)));

  return {
    technique: 'genel', label: 'Genel Tarama', weight: 3.0,
    vote, strength, score,
    conditions: C.filter(c => c.met),  // sadece geçenler gösterilir
    longHits, shortHits,
    ind: {
      rsi: rsiNow, adx: adxF?.adx ?? null, pdi: adxF?.pdi ?? null, ndi: adxF?.ndi ?? null,
      macdHist: macd ? +macd.hist.toFixed(6) : null,
      stochK: stoch?.k ?? null,
      ema20: ema20[n], ema50: ema50[n],
    },
  };
}

module.exports = { evaluate };
