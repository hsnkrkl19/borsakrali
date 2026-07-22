'use strict';

/**
 * strategyEngines — internet araştırmasıyla doğrulanmış KLASİK strateji motorları.
 *
 * Her motor YALNIZ kapanmış barlarla çalışır ve sinyali sadece TETİK barında
 * üretir (kesişim/kırılım o barda olmalı) → competition'ın mum-başına dedup'u
 * ile birlikte yeniden-açılma çığı imkânsız olur.
 *
 * Kaynak sistemler (kanonik kurallar):
 *  - turtle      : Richard Dennis Turtle / Donchian kanal kırılımı (S1 20-bar, S2 55-bar, 2N stop)
 *  - squeeze     : John Carter TTM Squeeze (BB(20,2) ⊂ KC(20,1.5·ATR) → momentum yönünde release)
 *  - rsi2        : Larry Connors RSI(2) mean-reversion (SMA200 filtre; yalnız endeks kanıtlı)
 *  - london      : London Breakout — yalnız GÖLGE (araştırma: canlı kenar yok; MT5'e bağlanmaz)
 *  - tsmom       : Time-Series Momentum (Moskowitz-Ooi-Pedersen; 60/120/252 oy + EMA10/40 zamanlama)
 *  - holygrail   : Linda Raschke Holy Grail (ADX>30 yükselirken EMA20 pullback kırılımı; PAPER başlar)
 *  - alligator   : Bill Williams Alligator + fraktal — AYRI BOT DEĞİL (araştırma: 5. korelasyonlu
 *                  trend botu = yığılma); yalnız evolver varyant havuzunda kanıt-kapılı yaşar
 *  - heikin      : Heikin-Ashi güçlü-mum serisi — AYRI BOT DEĞİL; yalnız evolver havuzunda
 *
 * Çıktı customBotEngine.evaluate ile aynı şekildedir:
 *   { direction, side, entry, stop, target1, target2, confidence, time } | null
 */

const { ema, sma, atr, rsiSeries, dmiSeries } = require('../botBuilder/customBotEngine');

// ── ortak yardımcılar ─────────────────────────────────────────────────────────
function highestHigh(c, from, to) { let m = -Infinity; for (let j = Math.max(0, from); j <= to; j++) m = Math.max(m, c[j].high); return m; }
function lowestLow(c, from, to) { let m = Infinity; for (let j = Math.max(0, from); j <= to; j++) m = Math.min(m, c[j].low); return m; }

// Wilder SMMA/RMA — SMA(len) tohumlu.
function smma(vals, len) {
  const out = new Array(vals.length).fill(NaN);
  let s = NaN, seed = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (!Number.isFinite(v)) { out[i] = s; continue; }
    if (i < len) { seed += v; if (i === len - 1) { s = seed / len; out[i] = s; } continue; }
    s = (s * (len - 1) + v) / len;
    out[i] = s;
  }
  return out;
}

// Son değeri: delta serisinin son `len` barına en küçük kareler doğrusu uydur.
function linregLast(vals, len) {
  const n = vals.length;
  if (n < len) return NaN;
  let sx = 0, sy = 0, sxy = 0, sxx = 0, cnt = 0;
  for (let k = 0; k < len; k++) {
    const y = vals[n - len + k];
    if (!Number.isFinite(y)) return NaN;
    sx += k; sy += y; sxy += k * y; sxx += k * k; cnt++;
  }
  const denom = cnt * sxx - sx * sx;
  if (denom === 0) return NaN;
  const slope = (cnt * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / cnt;
  return intercept + slope * (len - 1);
}

function clampConf(v) { return Math.max(0, Math.min(100, Math.round(v))); }

function makeSignal(c, direction, stopDist, tp1Dist, tp2Dist, confidence) {
  const i = c.length - 1;
  const entry = c[i].close;
  if (!(stopDist > 0) || !(tp1Dist > 0)) return null;
  // Köprü R:R≥0.7 kapısı ÖN-KONTROLÜ (araştırma sentezi #5): kapıyı geçemeyecek
  // sinyal hiç üretilmez (0.714 = 0.7 + slippage payı).
  if (tp1Dist < 0.714 * stopDist) return null;
  const sign = direction === 'long' ? 1 : -1;
  return {
    direction, side: direction, entry,
    stop: entry - sign * stopDist,
    target1: entry + sign * tp1Dist,
    target2: entry + sign * (tp2Dist > tp1Dist ? tp2Dist : tp1Dist * 1.6),
    confidence: clampConf(confidence),
    time: c[i].time,
  };
}

// ── 1) TURTLE / DONCHIAN KANAL KIRILIMI ───────────────────────────────────────
// S1: kapanış önceki 20-bar ekstremini kırdığı barda giriş; stop 2N (2×ATR20).
// S2 (55-bar) da kırıldıysa "büyük kırılım" → güven bonusu.
// Araştırma (Rayner 2000-2019: çıplak 20-bar ÇÜRÜDÜ; trend filtresi isabeti
// +%4-8): kapanış EMA200 yönünde OLMALI veya ADX(14)≥15 — aksi halde sinyal yok.
// TP = 6N güvenlik tavanı (R:R 3.0; sistem aslında iz-süren çıkış sistemidir).
function evalTurtle(c, p = {}) {
  const fast = p.fast || 20, slow = p.slow || 55;
  const i = c.length - 1;
  if (i < slow + 2) return null;
  const a = atr(c, 20)[i];
  if (!(a > 0)) return null;

  const priorHigh = highestHigh(c, i - fast, i - 1);
  const priorHighPrev = highestHigh(c, i - fast - 1, i - 2);
  const priorLow = lowestLow(c, i - fast, i - 1);
  const priorLowPrev = lowestLow(c, i - fast - 1, i - 2);

  let direction = null;
  if (c[i].close > priorHigh && c[i - 1].close <= priorHighPrev) direction = 'long';
  else if (c[i].close < priorLow && c[i - 1].close >= priorLowPrev) direction = 'short';
  if (!direction) return null;

  // Çürüme önlemi (araştırma sentezi — Turtle spec): EMA200 yönü VEYA yönü
  // DI ile teyitli ADX≥15. İnceleme düzeltmeleri: (1) ema() ilk değerle tohumlar
  // — 200 bardan kısa seride "EMA200" anlamsız, o dalda kullanılmaz; (2) ADX
  // yönsüzdür — tek başına OR'lanırsa güçlü TERS trendde de kapıyı açar, bu
  // yüzden DI yönü eşleşmeden ADX alternatifi geçersizdir.
  const cl = c.map((x) => x.close);
  const e200 = i >= 200 ? ema(cl, 200)[i] : NaN;
  const { plusDI, minusDI, adx } = dmiSeries(c, 14);
  const emaOk = Number.isFinite(e200)
    && (direction === 'long' ? c[i].close > e200 : c[i].close < e200);
  const adxOk = Number.isFinite(adx[i]) && adx[i] >= 15
    && (direction === 'long' ? plusDI[i] > minusDI[i] : minusDI[i] > plusDI[i]);
  if (!emaOk && !adxOk) return null;

  const bigBreak = direction === 'long'
    ? c[i].close > highestHigh(c, i - slow, i - 1)
    : c[i].close < lowestLow(c, i - slow, i - 1);
  const conf = 62 + (bigBreak ? 8 : 0) + (Number.isFinite(adx[i]) && adx[i] > 25 ? 5 : 0);
  return makeSignal(c, direction, 2 * a, 6.0 * a, 9.0 * a, conf);
}

// ── 2) TTM SQUEEZE (Bollinger ⊂ Keltner → release) ────────────────────────────
// Sıkışma ≥ minBars (araştırma: 6; VolatilityBox 8+ bar %70 yön isabeti) sürmüş
// ve BU barda açılmışsa, Carter momentum osilatörü yönünde VE YÜKSELİRKEN giriş.
// Momentum: linreg(close − (donchianOrta20+sma20)/2, 20). SMA50 trend filtresi.
// SL = max(sıkışma aralığının karşı ucu, 1.5×ATR); 2.0×ATR'yi aşarsa sinyal ATLA
// (kovalamayı önler). TP1 1.5×ATR, TP2 3.0×ATR.
function evalSqueeze(c, p = {}) {
  const len = 20, bbStd = p.bbStd || 2, kcMult = p.kcMult || 1.5, minBars = p.minBars || 6;
  const i = c.length - 1;
  if (i < len + minBars + 2) return null;
  const cl = c.map((x) => x.close);
  const basis = sma(cl, len);
  const a = atr(c, len);

  const squeezeOn = (at) => {
    if (!Number.isFinite(basis[at]) || !(a[at] > 0)) return false;
    let sum = 0; for (let j = at - len + 1; j <= at; j++) sum += (cl[j] - basis[at]) ** 2;
    const dev = Math.sqrt(sum / len);
    return basis[at] + bbStd * dev < basis[at] + kcMult * a[at]
      && basis[at] - bbStd * dev > basis[at] - kcMult * a[at];
  };

  if (squeezeOn(i) || !squeezeOn(i - 1)) return null; // release tam BU barda olmalı
  let run = 0;
  for (let j = i - 1; j >= len && squeezeOn(j); j--) run++;
  if (run < minBars) return null;

  const delta = [];
  for (let j = 0; j <= i; j++) {
    const dm = j >= len ? (highestHigh(c, j - len + 1, j) + lowestLow(c, j - len + 1, j)) / 2 : NaN;
    delta.push(Number.isFinite(dm) && Number.isFinite(basis[j]) ? cl[j] - (dm + basis[j]) / 2 : NaN);
  }
  const mom = linregLast(delta, len);
  const momPrev = linregLast(delta.slice(0, -1), len);
  if (!Number.isFinite(mom) || !Number.isFinite(momPrev) || mom === 0) return null;
  // Momentum yönünde VE ivmeleniyor olmalı (Carter: mom > mom[1]).
  let direction = null;
  if (mom > 0 && mom > momPrev) direction = 'long';
  else if (mom < 0 && mom < momPrev) direction = 'short';
  if (!direction) return null;

  // SMA50 trend filtresi: üstünde yalnız long, altında yalnız short.
  const s50 = sma(cl, 50)[i];
  if (Number.isFinite(s50)) {
    if (direction === 'long' && c[i].close < s50) return null;
    if (direction === 'short' && c[i].close > s50) return null;
  }

  const atrNow = a[i];
  // Yakın sıkışma bandı = release öncesi son minBars bar. Kovalama koruması:
  // kapanış bant kenarını 1.5×ATR'den fazla aştıysa release kaçtı → atla.
  const bandLow = lowestLow(c, i - minBars, i - 1);
  const bandHigh = highestHigh(c, i - minBars, i - 1);
  const overshoot = direction === 'long' ? c[i].close - bandHigh : bandLow - c[i].close;
  if (overshoot > 1.5 * atrNow) return null;
  // SL referansı = bant ORTASI (TTM pratiği: release sonrası fiyatın bant
  // ortasına geri sarkması kırılımı geçersizler; karşı-uç stopu dar-koil
  // geometrilerinde yapısal olarak 2×ATR'ye sığmıyordu — inceleme bulgusu).
  // Orta nokta 2.5×ATR'den uzaksa kovalama → atla; aralıkta [1.5, 2.0]×ATR.
  const bandMid = (bandLow + bandHigh) / 2;
  const midDist = direction === 'long' ? c[i].close - bandMid : bandMid - c[i].close;
  if (midDist > 2.5 * atrNow) return null;
  const stopDist = Math.max(1.5 * atrNow, Math.min(2.0 * atrNow, midDist));

  const conf = 60 + Math.min(10, run) + (Math.abs(mom) > atrNow ? 5 : 0);
  return makeSignal(c, direction, stopDist, 1.5 * atrNow, 3.0 * atrNow, conf);
}

// ── 3) CONNORS RSI(2) MEAN-REVERSION ─────────────────────────────────────────
// SMA200 üstünde RSI2 < eşik → long. Eşik: 1d'de 10, 4h'de 5 (araştırma spec).
// SHORT varsayılan KAPALI (kanıt zayıf) — MT5_RSI2_SHORTS=1 ile açılır.
// Connors stopsuz test etti; MT5 için 3×ATR FELAKET stopu + 2.2×ATR TP
// (R:R 0.733 — köprü 0.7 kapısını makeSignal ön-kontrolüyle geçer).
function evalRsi2(c, p = {}) {
  const buyTh = p.buy || (p.tf === '4h' ? 5 : 10);
  const sellTh = p.sell || (p.tf === '4h' ? 95 : 90);
  const i = c.length - 1;
  if (i < 210) return null;
  const cl = c.map((x) => x.close);
  const sma200 = sma(cl, 200)[i];
  const r2 = rsiSeries(c, 2);
  const now = r2[i], prev = r2[i - 1];
  if (!Number.isFinite(sma200) || !Number.isFinite(now) || !Number.isFinite(prev)) return null;

  const shortsEnabled = process.env.MT5_RSI2_SHORTS === '1';
  let direction = null;
  // Tetik barı: RSI2 eşiği BU barda aşağıdan/yukarıdan kesmiş olmalı.
  if (c[i].close > sma200 && now < buyTh && prev >= buyTh) direction = 'long';
  else if (shortsEnabled && c[i].close < sma200 && now > sellTh && prev <= sellTh) direction = 'short';
  if (!direction) return null;

  const a = atr(c, 14)[i];
  if (!(a > 0)) return null;
  const extreme = direction === 'long' ? now < 5 : now > 95;
  const conf = 58 + (extreme ? 10 : 0);
  return makeSignal(c, direction, 3.0 * a, 2.2 * a, 3.2 * a, conf);
}

// ── 4) LONDON BREAKOUT (Asya range → Londra kırılımı) ────────────────────────
// ⚠️ GÖLGE DENEY (araştırma: spread sonrası ham kenar ~sıfır → MT5'e BAĞLANMAZ,
// preset'i catalog'da mt5Tradeable:false). Range: aynı UTC gününün 00:00–07:00
// barları; giriş penceresi 07:00–11:00 UTC (yaz/kış DST'yi birlikte kapsar).
// Pazartesi atlanır. Günün yalnız İLK kırılımı alınır. SL = range ORTASI
// (araştırma spec), TP1 = 1.5R, TP2 = 2.5R.
function evalLondon(c, p = {}) {
  const i = c.length - 1;
  if (i < 40) return null;
  const bar = c[i];
  const d = new Date(bar.time);
  const hour = d.getUTCHours();
  if (hour < 7 || hour >= 11) return null; // giriş penceresi dışı
  if (d.getUTCDay() === 1) return null;    // Pazartesi atla (range anlamsız)

  const dayKey = Math.floor(bar.time / 86400000);
  let rHigh = -Infinity, rLow = Infinity, bars = 0;
  const windowBars = []; // bugünün 07:00 sonrası önceki barları (ilk-kırılım kontrolü)
  for (let j = i - 1; j >= 0; j--) {
    const t = c[j].time;
    if (Math.floor(t / 86400000) !== dayKey) break;
    const h = new Date(t).getUTCHours();
    if (h >= 7) { windowBars.push(c[j]); continue; }
    rHigh = Math.max(rHigh, c[j].high);
    rLow = Math.min(rLow, c[j].low);
    bars++;
  }
  const minBars = p.minRangeBars || 12;
  if (bars < minBars || !(rHigh > rLow)) return null;

  const a = atr(c, 14)[i];
  const width = rHigh - rLow;
  if (!(a > 0) || width < 1.5 * a || width > 5 * a) return null; // araştırma bandı

  // Günün İLK kırılımı olmalı: pencere içindeki önceki bir bar zaten range
  // dışına kapandıysa (kırılım tüketildi) bugün başka işlem yok.
  for (const w of windowBars) {
    if (w.close > rHigh || w.close < rLow) return null;
  }

  let direction = null;
  if (bar.close > rHigh && c[i - 1].close <= rHigh) direction = 'long';
  else if (bar.close < rLow && c[i - 1].close >= rLow) direction = 'short';
  if (!direction) return null;

  // Kovalamayı önle: kapanış range'in çok ötesine kaçtıysa girme.
  const overshoot = direction === 'long' ? bar.close - rHigh : rLow - bar.close;
  if (overshoot > 0.5 * width) return null;

  // SL = range ortası (araştırma spec: midpoint; karşı uçtan daha dar risk).
  const mid = (rHigh + rLow) / 2;
  const stopDist = direction === 'long' ? bar.close - mid : mid - bar.close;
  const conf = 58 + (width < 3 * a ? 6 : 0);
  return makeSignal(c, direction, stopDist, 1.5 * stopDist, 2.5 * stopDist, conf);
}

// ── 5) TIME-SERIES MOMENTUM (TSMOM) ──────────────────────────────────────────
// Rejim: 60/120/252-bar getiri OYLARI — hesaplanabilenlerin ≥2/3'ü (veya
// yalnız 2'si varsa 2/2'si) aynı yönde olmalı (Moskowitz-Ooi-Pedersen çoklu
// lookback adaptasyonu, araştırma spec). Zamanlama: EMA10/EMA40 kesişimi rejim
// yönünde BU barda. Kripto SHORT YOK (spec: long-only bias). Vol-ölçekleme
// kapısı: getiri/vol oranı zayıfsa işlem yok (Kim-Tse-Wald eleştirisi).
function evalTsmom(c, p = {}) {
  const looks = [p.lookback || 60, 120, 252];
  const i = c.length - 1;
  if (i < looks[0] + 45) return null;
  const cl = c.map((x) => x.close);

  let voteLong = 0, voteShort = 0, computable = 0;
  for (const look of [...new Set(looks)]) {
    if (i < look) continue;
    computable++;
    const r = cl[i] / cl[i - look] - 1;
    if (r > 0) voteLong++; else if (r < 0) voteShort++;
  }
  if (computable < 2) return null;
  const need = computable >= 3 ? 2 : computable; // 3'te ≥2, 2'de 2/2
  let regime = null;
  if (voteLong >= need) regime = 'long';
  else if (voteShort >= need) regime = 'short';
  if (!regime) return null;
  if (regime === 'short' && p.cls === 'crypto') return null; // kripto long-only

  const f = ema(cl, 10), s = ema(cl, 40);
  if (![f[i], s[i], f[i - 1], s[i - 1]].every(Number.isFinite)) return null;
  let direction = null;
  if (regime === 'long' && f[i] > s[i] && f[i - 1] <= s[i - 1]) direction = 'long';
  else if (regime === 'short' && f[i] < s[i] && f[i - 1] >= s[i - 1]) direction = 'short';
  if (!direction) return null;

  const a = atr(c, 14)[i];
  if (!(a > 0)) return null;
  // Trend-gücü kapısı REJİM ufkunda (120 bar) ölçülür — giriş EMA kesişimi
  // pullback DİBİNDE gelir, orada kısa (60-bar) getiri yapısal olarak zayıftır;
  // kısa ufka bağlamak zamanlama tetikleyicisiyle çelişir.
  const gateLook = i >= 120 ? 120 : looks[0];
  const rocGate = cl[i] / cl[i - gateLook] - 1;
  const volAdj = Math.abs(rocGate) * cl[i] / (a * Math.sqrt(gateLook));
  if (volAdj < (p.minVolAdj ?? 0.8)) return null;

  const conf = 58 + Math.min(14, volAdj * 8) + (voteLong + voteShort === 3 && (voteLong === 3 || voteShort === 3) ? 4 : 0);
  return makeSignal(c, direction, 3.0 * a, 7.5 * a, 11.0 * a, conf);
}

// ── 6) RASCHKE HOLY GRAIL (ADX pullback) ─────────────────────────────────────
// ⚠️ Kamu backtest kanıtı YOK (araştırma) → PAPER başlar (catalog mt5Tradeable:false).
// ADX(14) > 30 ve yükseliyor (ADX[t] > ADX[t-3]); önceki bar EMA20'ye dokundu
// (kapanışı EMA20 − 0.5×ATR üstünde kalarak); BU bar önceki barın ekstremini
// kırdı → trend devam girişi. SL swing ± 0.25×ATR — [0.8, 2.0]×ATR bandı
// DIŞINDAYSA sinyal ATLA (araştırma: kelepçeleme değil atlama). TP1 = son swing
// ekstremi; R:R < 0.9 ise sinyal ÜRETME.
function evalHolyGrail(c, p = {}) {
  const adxMin = p.adxMin || 30;
  const i = c.length - 1;
  if (i < 60) return null;
  const { plusDI, minusDI, adx } = dmiSeries(c, 14);
  const cl = c.map((x) => x.close);
  const e20 = ema(cl, 20);
  const a = atr(c, 14)[i];
  if (!Number.isFinite(e20[i - 1]) || !(a > 0)) return null;

  // Trend nitelemesi PULLBACK ÖNCESİNDE ölçülür (Raschke: "güçlü trend gör,
  // pullback bekle"): son 12 barın ekstrem barında ADX ≥ eşik VE o noktada
  // yükseliyor olmalı. Giriş barında ölçmek yapısal hata olur — pullback'in
  // kendisi ADX'i düşürür ve koşul giriş anında neredeyse hiç sağlanamaz.
  const qualifiedAt = (peakIdx) => Number.isFinite(adx[peakIdx]) && peakIdx >= 3
    && adx[peakIdx] >= adxMin && adx[peakIdx] > adx[peakIdx - 3];
  let peakLong = i - 1, peakShort = i - 1;
  for (let j = i - 12; j <= i - 1; j++) {
    if (j >= 0 && c[j].high > c[peakLong].high) peakLong = j;
    if (j >= 0 && c[j].low < c[peakShort].low) peakShort = j;
  }

  let direction = null;
  if (plusDI[i] > minusDI[i] && qualifiedAt(peakLong) && c[i - 1].low <= e20[i - 1]
    && c[i - 1].close > e20[i - 1] - 0.5 * a && c[i].close > c[i - 1].high) direction = 'long';
  else if (minusDI[i] > plusDI[i] && qualifiedAt(peakShort) && c[i - 1].high >= e20[i - 1]
    && c[i - 1].close < e20[i - 1] + 0.5 * a && c[i].close < c[i - 1].low) direction = 'short';
  if (!direction) return null;

  // SL: pullback swing'i ± 0.25×ATR; [0.8, 2.0]×ATR bandı dışıysa ATLA.
  const swing = direction === 'long' ? lowestLow(c, i - 3, i - 1) : highestHigh(c, i - 3, i - 1);
  const stopDist = (direction === 'long' ? c[i].close - swing : swing - c[i].close) + 0.25 * a;
  if (stopDist < 0.8 * a || stopDist > 2.0 * a) return null;

  // TP1: son 20-bar ekstremi retesti; R:R < 0.9 ise sinyal YOK (köprü + slippage payı).
  const recent = direction === 'long' ? highestHigh(c, i - 20, i - 1) : lowestLow(c, i - 20, i - 1);
  const tp1 = direction === 'long' ? recent - c[i].close : c[i].close - recent;
  if (!(tp1 >= 0.9 * stopDist)) return null;
  const conf = 60 + Math.min(10, (adx[i] - adxMin) / 2);
  return makeSignal(c, direction, stopDist, tp1, 1.8 * tp1, conf);
}

// ── 7) BILL WILLIAMS ALLIGATOR + FRAKTAL ─────────────────────────────────────
// Alligator (median fiyat SMMA 13/8/5, shift 8/5/3) hizalı ("uyanık") iken son
// teyitli fraktalın BU barda kırılması. Fraktal: 5-bar deseni (2 bar teyit).
function evalAlligator(c, p = {}) {
  const i = c.length - 1;
  if (i < 70) return null;
  const med = c.map((x) => (x.high + x.low) / 2);
  const jaw = smma(med, 13), teeth = smma(med, 8), lips = smma(med, 5);
  const J = jaw[i - 8], T = teeth[i - 5], L = lips[i - 3];
  if (![J, T, L].every(Number.isFinite)) return null;

  // Son TEYİTLİ fraktalları bul (uç bar j, teyit j+2 ≤ i-1; son 25 bar içinde).
  let upFr = null, dnFr = null;
  for (let j = i - 3; j >= Math.max(2, i - 25); j--) {
    if (upFr === null && c[j].high > c[j - 1].high && c[j].high > c[j - 2].high
      && c[j].high > c[j + 1].high && c[j].high > c[j + 2].high) upFr = c[j].high;
    if (dnFr === null && c[j].low < c[j - 1].low && c[j].low < c[j - 2].low
      && c[j].low < c[j + 1].low && c[j].low < c[j + 2].low) dnFr = c[j].low;
    if (upFr !== null && dnFr !== null) break;
  }

  const a = atr(c, 14)[i];
  if (!(a > 0)) return null;
  const px = c[i].close;

  let direction = null;
  if (L > T && T > J && px > L && upFr !== null
    && px > upFr && c[i - 1].close <= upFr) direction = 'long';
  else if (L < T && T < J && px < L && dnFr !== null
    && px < dnFr && c[i - 1].close >= dnFr) direction = 'short';
  if (!direction) return null;

  // SL: teeth (Alligator dişleri) tercih; ATR bandına sıkıştır.
  let stopDist = direction === 'long' ? px - T : T - px;
  stopDist = Math.max(1.5 * a, Math.min(2.8 * a, stopDist));
  const spread = Math.abs(L - J) / a; // ağız açıklığı → trend gücü
  const conf = 60 + Math.min(10, spread * 4);
  return makeSignal(c, direction, stopDist, 3.0 * a, 5.0 * a, conf);
}

// ── 8) HEIKIN-ASHI GÜÇLÜ SERİ ────────────────────────────────────────────────
// EMA100 yönünde, karşı fitili olmayan (güçlü) N ardışık HA mumu; seri TAM BU
// barda N'e ulaşmalı (önceki bar serinin N-1'iydi) → her barda tekrar etmez.
function evalHeikin(c, p = {}) {
  const need = p.streak || 3, wickMax = 0.12;
  const i = c.length - 1;
  if (i < 110) return null;
  const ha = [];
  for (let j = 0; j <= i; j++) {
    const haClose = (c[j].open + c[j].high + c[j].low + c[j].close) / 4;
    const haOpen = j === 0 ? (c[j].open + c[j].close) / 2 : (ha[j - 1].open + ha[j - 1].close) / 2;
    ha.push({
      open: haOpen, close: haClose,
      high: Math.max(c[j].high, haOpen, haClose),
      low: Math.min(c[j].low, haOpen, haClose),
    });
  }
  const strong = (j, dir) => {
    const b = ha[j], range = b.high - b.low;
    if (!(range > 0)) return false;
    return dir === 'long'
      ? b.close > b.open && (b.open - b.low) <= wickMax * range
      : b.close < b.open && (b.high - b.open) <= wickMax * range;
  };
  const streakLen = (j, dir) => { let n = 0; while (j - n >= 0 && strong(j - n, dir)) n++; return n; };

  const cl = c.map((x) => x.close);
  const e100 = ema(cl, 100)[i];
  const a = atr(c, 14)[i];
  if (!Number.isFinite(e100) || !(a > 0)) return null;

  let direction = null;
  if (c[i].close > e100 && streakLen(i, 'long') === need) direction = 'long';
  else if (c[i].close < e100 && streakLen(i, 'short') === need) direction = 'short';
  if (!direction) return null;

  return makeSignal(c, direction, 2.0 * a, 3.0 * a, 5.0 * a, 62);
}

// ── katalog + dispatch ────────────────────────────────────────────────────────
const STRATEGY_ENGINES = {
  turtle: evalTurtle,
  squeeze: evalSqueeze,
  rsi2: evalRsi2,
  london: evalLondon,
  tsmom: evalTsmom,
  holygrail: evalHolyGrail,
  alligator: evalAlligator,
  heikin: evalHeikin,
};

/** Strateji kimliğiyle değerlendir → sinyal | null (bilinmeyen kimlik → null). */
function evaluateStrategy(strategyId, candles, params) {
  const fn = STRATEGY_ENGINES[strategyId];
  if (!fn || !Array.isArray(candles) || candles.length < 40) return null;
  try { return fn(candles, params || {}); } catch (_) { return null; }
}

module.exports = {
  evaluateStrategy,
  STRATEGY_ENGINES,
  // test için tekil motorlar:
  evalTurtle, evalSqueeze, evalRsi2, evalLondon, evalTsmom, evalHolyGrail, evalAlligator, evalHeikin,
  smma, linregLast,
};
