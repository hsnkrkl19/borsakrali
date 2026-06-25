/**
 * beastStrategy — BEAST Trend çekirdeği. Üç Pine kaynağının füzyonu:
 *
 *   1) Zero-Lag Trend (AlgoAlpha)  → ANA yön (volatilite bandı durum makinesi, az whipsaw)
 *   2) Ichimoku + Zero-Lag (üst TF) → SERT yön kapısı (yalnız büyük trend yönünde işlem)
 *   3) ADX/DI                       → SERT trendsizlik kapısı (chop'ta işlem yok)
 *   4) Scalper Beast 8-katman       → konfluans NOTU (giriş kalitesi)
 *
 * Mevcut iki botun hatalarının panzehiri:
 *   - Forex botu: ters-dönüş tetikleyiciler (oversold sıçraması) + ÇOK GENİŞ fibo stop
 *     → çok whipsaw, çok stop. BEAST: trend-DEVAMI tetikleyiciler + DAR yapısal stop.
 *   - Yeni Robot: 3/4 TF konfluans kilidi → neredeyse hiç sinyal yok. BEAST: tek HTF
 *     bias kapısı → sinyal akar ama hizalı kalır.
 *
 * Saf & ileri-bakışsız: tüm seriler bar i'de yalnız [0..i] veriyi kullanır.
 */

'use strict';

const I = require('./beastIndicators');

// Tüm gösterge serilerini BİR kez hesapla (backtest bar-bar yürürken yeniden hesaplamaz).
function prepare(candles, cfg) {
  const closes = candles.map(c => c.close);
  return {
    closes,
    zl: I.zeroLagTrend(candles, cfg.zlLength, cfg.zlMult),
    st: I.supertrendSeries(candles, cfg.stPeriod, cfg.stMult),
    adx: I.adxSeries(candles, cfg.atrPeriod),
    atr: I.atrSeries(candles, cfg.atrPeriod),
    macd: I.macdSeries(closes, 12, 26, 9),
    srsi: I.stochRsiSeries(closes, cfg.srsiRsiLen, cfg.srsiStochLen, cfg.srsiK, cfg.srsiD),
    emaFast: I.emaSeries(closes, cfg.emaFast),
    emaMid: I.emaSeries(closes, cfg.emaMid),
    emaSlow: I.emaSeries(closes, cfg.emaSlow),
    emaMedA: I.emaSeries(closes, cfg.emaMedA),
    emaMedB: I.emaSeries(closes, cfg.emaMedB),
    vwap: I.vwapRollingSeries(candles, cfg.volPeriod),
    avgVol: I.smaSeries(candles.map(c => c.volume || 0), cfg.volPeriod),
  };
}

// Üst-TF bias serilerini hazırla (resample edilmiş HTF candles üzerinden).
// Kısa htfZlLength kullanır — HTF veri derinliği sınırlı (özellikle 4h→1d).
function prepareHTF(htfCandles, cfg) {
  if (!htfCandles || htfCandles.length < 60) return null;
  return {
    zl: I.zeroLagTrend(htfCandles, cfg.htfZlLength || 20, cfg.zlMult),
    ich: I.ichimokuSeries(htfCandles, cfg.ichiConv, cfg.ichiBase, cfg.ichiSpanB, cfg.ichiDisp),
    candles: htfCandles, mode: 'resample',
  };
}

// 1d sinyalleri için: ayrı üst-TF yerine, AYNI seri üzerinde Ichimoku bulutu rejim
// kapısı olur (az veri ister, klasik yöntem). htf.trend = bulut tarafı.
function prepareHTFSelf(candles, cfg) {
  if (!candles || candles.length < 80) return null;
  return { ich: I.ichimokuSeries(candles, cfg.ichiConv, cfg.ichiBase, cfg.ichiSpanB, cfg.ichiDisp), mode: 'self' };
}

// HTF snapshot. resample modunda htfIdx = TAM kapanmış son üst-TF barı; self
// modunda doğrudan sinyal barı idx (aynı seri).
function htfSnapshot(htf, htfIdx) {
  if (!htf || htfIdx == null || htfIdx < 0) return { trend: 0, aboveCloud: false, belowCloud: false, ok: false };
  if (htf.mode === 'self') {
    const above = !!htf.ich.aboveCloud[htfIdx], below = !!htf.ich.belowCloud[htfIdx];
    return { trend: above ? 1 : below ? -1 : 0, aboveCloud: above, belowCloud: below, ok: true };
  }
  return {
    trend: htf.zl.trend[htfIdx] || 0,
    aboveCloud: !!htf.ich.aboveCloud[htfIdx],
    belowCloud: !!htf.ich.belowCloud[htfIdx],
    ok: true,
  };
}

// Yapısal + ATR-bantlı stop ve R-katı TP'ler. Temiz R/R garantisi.
function buildLevels(direction, entry, atr, swing, cfg, precision) {
  if (!(entry > 0) || !(atr > 0)) return null;
  const r = (v) => +v.toFixed(precision);
  const isLong = direction === 'long';
  let rawStop;
  if (isLong) rawStop = (swing && swing.swingLow != null) ? swing.swingLow - cfg.swingBufATR * atr : entry - cfg.maxStopATR * atr;
  else rawStop = (swing && swing.swingHigh != null) ? swing.swingHigh + cfg.swingBufATR * atr : entry + cfg.maxStopATR * atr;
  let dist = Math.abs(entry - rawStop);
  const minD = cfg.minStopATR * atr, maxD = cfg.maxStopATR * atr;
  if (dist < minD) dist = minD; else if (dist > maxD) dist = maxD;
  const stop = isLong ? entry - dist : entry + dist;
  const t1 = isLong ? entry + cfg.rr1 * dist : entry - cfg.rr1 * dist;
  const t2 = isLong ? entry + cfg.rr2 * dist : entry - cfg.rr2 * dist;
  return {
    entry: r(entry), stop: r(stop), target1: r(t1), target2: r(t2),
    rr1: +cfg.rr1.toFixed(2), rr2: +cfg.rr2.toFixed(2),
    riskDist: dist, atr: +atr.toFixed(precision), basis: 'beast-struct',
  };
}

// Bar idx'te değerlendir. htf = htfSnapshot() çıktısı. Sinyal yoksa null.
function evaluateAt(candles, ind, cfg, idx, tf, htf, precision = 2) {
  const i = idx;
  if (i < 2) return null;
  const close = candles[i].close;

  // ── ANA YÖN: Zero-Lag Trend ──
  const zlt = ind.zl.trend[i];
  if (!zlt) return null; // 0 = henüz yön yok
  const direction = zlt === 1 ? 'long' : 'short';
  const isLong = zlt === 1;

  // ── SERT KAPI 1: Üst-TF hizalama (ters-HTF işlemi yok) ──
  // htf.trend 0 ise (veri yetersiz) geçişe izin verilir ama güveni düşürür.
  if (htf && htf.ok && htf.trend !== 0 && htf.trend !== zlt) return null;

  // ── ADX (OPSİYONEL kapı) ──
  // ARAŞTIRMA BULGUSU (doğrulanmış backtest): ADX/DI kapısı kripto/altın trend
  // girişlerinde EXPECTANCY'i DÜŞÜRÜR (EMA kesişimi trendi ADX'ten ÖNCE yakalar →
  // kapı en iyi erken kısmı eler). Bu yüzden VARSAYILAN KAPALI; pariteye göre
  // backtest açabilir. adxMin>0 ise seviye kapısı, adxDiGate ise DI hizalama kapısı.
  const adx = ind.adx.adx[i], pdi = ind.adx.plusDI[i], mdi = ind.adx.minusDI[i];
  const diAligned = (pdi != null && mdi != null) ? (isLong ? pdi > mdi : mdi > pdi) : true;
  if (cfg.adxMin > 0) {
    if (adx == null || adx < cfg.adxMin) return null;
  }
  if (cfg.adxDiGate && !diAligned) return null;

  // ── TETİKLEYİCİ: trend-DEVAMI (oversold sıçraması DEĞİL) ──
  const stDir = ind.st.dir[i], stPrev = ind.st.dir[i - 1];
  const stFlip = stDir != null && stPrev != null && stDir !== stPrev;
  const hist = ind.macd.hist[i], histPrev = ind.macd.hist[i - 1];
  const zlEntry = isLong ? ind.zl.entryLong[i] : ind.zl.entryShort[i];
  const stTrigger = isLong ? (stDir === 1 && stFlip) : (stDir === -1 && stFlip);
  const macdTrigger = (hist != null && histPrev != null) && (isLong ? (hist > 0 && histPrev <= 0) : (hist < 0 && histPrev >= 0));
  const emaMid = ind.emaMid[i];
  const pullback = emaMid != null && (isLong
    ? (candles[i].low <= emaMid * 1.003 && close > emaMid && close >= candles[i - 1].close)
    : (candles[i].high >= emaMid * 0.997 && close < emaMid && close <= candles[i - 1].close));
  const trigger = zlEntry ? 'zlema' : stTrigger ? 'supertrend' : macdTrigger ? 'macd' : pullback ? 'pullback' : null;
  if (!trigger) return null;

  // ── KONFLUANS NOTU (Scalper Beast 8 katman, trend-ağırlıklı) ──
  const emaFast = ind.emaFast[i], emaSlow = ind.emaSlow[i], medA = ind.emaMedA[i], medB = ind.emaMedB[i];
  const vwap = ind.vwap[i], macdLine = ind.macd.macd[i], macdSig = ind.macd.signal[i];
  const k = ind.srsi.k[i], d = ind.srsi.d[i];
  const vol = candles[i].volume || 0, av = ind.avgVol[i] || 0;
  const L = {
    supertrend: stDir === zlt,
    ribbon: emaFast != null && emaMid != null && emaSlow != null && (isLong ? (emaFast > emaMid && emaMid > emaSlow) : (emaFast < emaMid && emaMid < emaSlow)),
    emaMed: medA != null && medB != null && (isLong ? medA > medB : medA < medB),
    vwap: vwap != null && (isLong ? close > vwap : close < vwap),
    macd: macdLine != null && macdSig != null && hist != null && (isLong ? (macdLine > macdSig && hist > 0) : (macdLine < macdSig && hist < 0)),
    srsi: k != null && d != null && (isLong ? (k >= d && k < 0.9) : (k <= d && k > 0.1)),
    adxStrong: adx >= cfg.adxStrong && diAligned,
    volume: av > 0 && vol > av * cfg.volMult,
  };
  const score = Object.values(L).filter(Boolean).length;
  if (score < cfg.minScore) return null;

  // ── SEVİYELER ──
  const atr = ind.atr[i];
  const swing = I.recentSwing(candles, i, cfg.swingLeft, cfg.swingRight, cfg.swingLookback);
  const levels = buildLevels(direction, close, atr, swing, cfg, precision);
  if (!levels) return null;

  // ── GÜVEN 0-100 ──
  const adxNorm = adx != null ? Math.max(0, Math.min(1, adx / (cfg.adxStrong + 10))) : 0.4;
  let htfScore = 0.5;
  if (htf && htf.ok) {
    htfScore = (htf.trend === zlt ? 0.55 : 0.35) + ((isLong ? htf.aboveCloud : htf.belowCloud) ? 0.45 : 0);
    htfScore = Math.min(1, htfScore);
  }
  const trigQ = trigger === 'zlema' ? 1.0 : trigger === 'supertrend' ? 0.95 : trigger === 'macd' ? 0.8 : 0.7;
  const rrNorm = Math.max(0, Math.min(1, (cfg.rr1 - 1) / 1.5));
  const momNorm = hist != null && atr > 0 ? Math.max(0, Math.min(1, Math.abs(hist) / (atr * 0.6))) : 0.5;
  const raw =
    0.28 * (score / 8) +
    0.18 * adxNorm +
    0.24 * htfScore +
    0.10 * trigQ +
    0.10 * rrNorm +
    0.10 * momNorm;
  const confidence = Math.round(Math.max(0, Math.min(1, raw)) * 100);

  const reasons = Object.entries(L).filter(([, v]) => v).map(([k2]) => k2);
  return {
    direction, tf, score, confidence,
    entry: levels.entry, stop: levels.stop, target1: levels.target1, target2: levels.target2,
    rr1: levels.rr1, rr2: levels.rr2, atr: levels.atr, riskDist: levels.riskDist,
    trigger, layers: L, reasons,
    htf: htf ? { trend: htf.trend, aboveCloud: htf.aboveCloud, belowCloud: htf.belowCloud } : null,
    adx: adx != null ? +adx.toFixed(1) : null, plusDI: pdi != null ? +pdi.toFixed(1) : null, minusDI: mdi != null ? +mdi.toFixed(1) : null,
    zlema: ind.zl.zlema[i] != null ? +ind.zl.zlema[i].toFixed(precision) : null,
    time: candles[i].time,
  };
}

module.exports = { prepare, prepareHTF, htfSnapshot, evaluateAt, buildLevels };
