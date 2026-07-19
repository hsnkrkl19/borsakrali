'use strict';

/**
 * Custom Bot Motoru — kullanıcının seçtiği indikatörlerden sinyal üretir.
 *
 * Kullanıcı panelde çoktan-seçmeli indikatör (RSI/ADX/Supertrend/Ichimoku/MACD/
 * EMA/Bollinger/Stochastic) + birleştirme mantığı (hepsi/çoğunluk) + opsiyonel
 * ICT/SMC stratejisi seçer. Her indikatör son kapanmış barda bir OY verir
 * (+1 long / -1 short / 0 nötr); oylar birleştirilip yön + 0-100 güven + ATR
 * tabanlı SL/TP ile sinyal üretilir.
 *
 * Girdi: candles = [{time,open,high,low,close,volume}] eskiden yeniye.
 */

// ── İNDİKATÖR KATALOĞU (panel çoktan-seçmeli listesi) ─────────────────────────
const INDICATORS = [
  { id: 'ema', label: 'EMA Kesişimi', desc: 'Hızlı EMA yavaşı keserse trend yönü', params: { fast: 9, slow: 21 } },
  { id: 'rsi', label: 'RSI', desc: 'Aşırı alım/satım + momentum', params: { period: 14, buy: 55, sell: 45 } },
  { id: 'adx', label: 'ADX + DI', desc: 'Trend gücü + yön (DI kapılı)', params: { period: 14, min: 20 } },
  { id: 'macd', label: 'MACD', desc: 'Momentum histogramı yönü', params: { fast: 12, slow: 26, signal: 9 } },
  { id: 'supertrend', label: 'Supertrend', desc: 'ATR tabanlı trend takibi', params: { period: 10, mult: 3 } },
  { id: 'ichimoku', label: 'Ichimoku', desc: 'Bulut + Tenkan/Kijun', params: { conv: 9, base: 26, span: 52 } },
  { id: 'bollinger', label: 'Bollinger', desc: 'Banda dokunuş (dönüş)', params: { period: 20, std: 2 } },
  { id: 'stoch', label: 'Stochastic', desc: 'Aşırı bölgeden dönüş', params: { k: 14, d: 3, buy: 20, sell: 80 } },
];
const INDICATOR_IDS = INDICATORS.map((i) => i.id);

// ── temel seriler ─────────────────────────────────────────────────────────────
function ema(vals, len) {
  const out = new Array(vals.length).fill(NaN);
  const k = 2 / (len + 1);
  let e = NaN;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (!Number.isFinite(v)) { out[i] = e; continue; }
    e = Number.isFinite(e) ? v * k + e * (1 - k) : v;
    out[i] = e;
  }
  return out;
}
function sma(vals, len) {
  const out = new Array(vals.length).fill(NaN);
  let sum = 0; const q = [];
  for (let i = 0; i < vals.length; i++) {
    const v = Number.isFinite(vals[i]) ? vals[i] : 0;
    q.push(v); sum += v;
    if (q.length > len) sum -= q.shift();
    if (q.length === len) out[i] = sum / len;
  }
  return out;
}
function atr(c, len) {
  const out = new Array(c.length).fill(NaN);
  let a = NaN;
  for (let i = 0; i < c.length; i++) {
    const tr = i === 0 ? c[i].high - c[i].low
      : Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    a = i === 0 ? tr : (i < len ? a + (tr - a) / (i + 1) : (a * (len - 1) + tr) / len);
    out[i] = a;
  }
  return out;
}
function rsiSeries(c, len) {
  const out = new Array(c.length).fill(NaN);
  let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const ch = c[i].close - c[i - 1].close;
    const up = Math.max(ch, 0), dn = Math.max(-ch, 0);
    if (i <= len) { g += up / len; l += dn / len; if (i === len) out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    else { g = (g * (len - 1) + up) / len; l = (l * (len - 1) + dn) / len; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  }
  return out;
}
function dmiSeries(c, len) {
  const n = c.length;
  const plusDI = new Array(n).fill(NaN), minusDI = new Array(n).fill(NaN), adx = new Array(n).fill(NaN);
  let sTR = 0, sP = 0, sM = 0, adxV = NaN, cnt = 0, dxSum = 0;
  for (let i = 1; i < n; i++) {
    const up = c[i].high - c[i - 1].high, dn = c[i - 1].low - c[i].low;
    const pDM = up > dn && up > 0 ? up : 0, mDM = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    if (i <= len) { sTR += tr; sP += pDM; sM += mDM; }
    else { sTR = sTR - sTR / len + tr; sP = sP - sP / len + pDM; sM = sM - sM / len + mDM; }
    if (i >= len && sTR > 0) {
      const pdi = 100 * sP / sTR, mdi = 100 * sM / sTR;
      plusDI[i] = pdi; minusDI[i] = mdi;
      const dx = pdi + mdi === 0 ? 0 : 100 * Math.abs(pdi - mdi) / (pdi + mdi);
      cnt++;
      if (cnt <= len) { dxSum += dx; if (cnt === len) adxV = dxSum / len; }
      else adxV = (adxV * (len - 1) + dx) / len;
      adx[i] = adxV;
    }
  }
  return { plusDI, minusDI, adx };
}

// ── indikatör OYLARI (son kapanmış bar) → -1 / 0 / +1 ─────────────────────────
function voteEMA(c, p) {
  const cl = c.map((x) => x.close);
  const f = ema(cl, p.fast), s = ema(cl, p.slow);
  const i = c.length - 1;
  if (!Number.isFinite(f[i]) || !Number.isFinite(s[i])) return 0;
  return f[i] > s[i] ? 1 : f[i] < s[i] ? -1 : 0;
}
function voteRSI(c, p) {
  const r = rsiSeries(c, p.period);
  const v = r[c.length - 1];
  if (!Number.isFinite(v)) return 0;
  return v >= p.buy ? 1 : v <= p.sell ? -1 : 0;
}
function voteADX(c, p) {
  const { plusDI, minusDI, adx } = dmiSeries(c, p.period);
  const i = c.length - 1;
  if (!Number.isFinite(adx[i]) || adx[i] < p.min) return 0;
  return plusDI[i] > minusDI[i] ? 1 : minusDI[i] > plusDI[i] ? -1 : 0;
}
function voteMACD(c, p) {
  const cl = c.map((x) => x.close);
  const macd = ema(cl, p.fast).map((v, i) => v - ema(cl, p.slow)[i]);
  const sig = ema(macd, p.signal);
  const i = c.length - 1;
  const hist = macd[i] - sig[i], histPrev = macd[i - 1] - sig[i - 1];
  if (!Number.isFinite(hist)) return 0;
  if (hist > 0 && hist >= histPrev) return 1;
  if (hist < 0 && hist <= histPrev) return -1;
  return 0;
}
function voteSupertrend(c, p) {
  const a = atr(c, p.period);
  const n = c.length;
  let trendUp = true, finalUpper = NaN, finalLower = NaN;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(a[i])) continue;
    const mid = (c[i].high + c[i].low) / 2;
    const bUpper = mid + p.mult * a[i], bLower = mid - p.mult * a[i];
    finalUpper = Number.isFinite(finalUpper) && c[i - 1] && c[i - 1].close <= finalUpper
      ? Math.min(bUpper, finalUpper) : bUpper;
    finalLower = Number.isFinite(finalLower) && c[i - 1] && c[i - 1].close >= finalLower
      ? Math.max(bLower, finalLower) : bLower;
    if (trendUp && c[i].close < finalLower) trendUp = false;
    else if (!trendUp && c[i].close > finalUpper) trendUp = true;
  }
  return trendUp ? 1 : -1;
}
function voteIchimoku(c, p) {
  const n = c.length, i = n - 1;
  const hh = (len, at) => { let m = -Infinity; for (let j = at - len + 1; j <= at; j++) if (j >= 0) m = Math.max(m, c[j].high); return m; };
  const ll = (len, at) => { let m = Infinity; for (let j = at - len + 1; j <= at; j++) if (j >= 0) m = Math.min(m, c[j].low); return m; };
  if (i < p.span) return 0;
  const tenkan = (hh(p.conv, i) + ll(p.conv, i)) / 2;
  const kijun = (hh(p.base, i) + ll(p.base, i)) / 2;
  // Bulut: span kadar geride hesaplanan senkou A/B, şimdiki bara yansır
  const at = i - p.base;
  const spanA = (((hh(p.conv, at) + ll(p.conv, at)) / 2) + ((hh(p.base, at) + ll(p.base, at)) / 2)) / 2;
  const spanB = (hh(p.span, at) + ll(p.span, at)) / 2;
  const cloudTop = Math.max(spanA, spanB), cloudBot = Math.min(spanA, spanB);
  const price = c[i].close;
  if (price > cloudTop && tenkan >= kijun) return 1;
  if (price < cloudBot && tenkan <= kijun) return -1;
  return 0;
}
function voteBollinger(c, p) {
  const cl = c.map((x) => x.close);
  const basis = sma(cl, p.period);
  const i = c.length - 1;
  if (!Number.isFinite(basis[i])) return 0;
  let sum = 0; for (let j = i - p.period + 1; j <= i; j++) sum += (cl[j] - basis[i]) ** 2;
  const dev = Math.sqrt(sum / p.period);
  const upper = basis[i] + p.std * dev, lower = basis[i] - p.std * dev;
  if (c[i].close <= lower) return 1;   // alt banda dokunuş → dönüş long
  if (c[i].close >= upper) return -1;  // üst banda dokunuş → dönüş short
  return 0;
}
function voteStoch(c, p) {
  const i = c.length - 1;
  const kAt = (at) => {
    let hh = -Infinity, ll = Infinity;
    for (let j = at - p.k + 1; j <= at; j++) { if (j < 0) return NaN; hh = Math.max(hh, c[j].high); ll = Math.min(ll, c[j].low); }
    return hh === ll ? 50 : 100 * (c[at].close - ll) / (hh - ll);
  };
  const kVals = []; for (let j = i - p.d + 1; j <= i; j++) kVals.push(kAt(j));
  const kNow = kVals[kVals.length - 1], kPrev = kAt(i - 1);
  if (!Number.isFinite(kNow) || !Number.isFinite(kPrev)) return 0;
  if (kNow <= p.buy && kNow >= kPrev) return 1;   // aşırı satımdan dönüş
  if (kNow >= p.sell && kNow <= kPrev) return -1;  // aşırı alımdan dönüş
  return 0;
}

const VOTERS = { ema: voteEMA, rsi: voteRSI, adx: voteADX, macd: voteMACD, supertrend: voteSupertrend, ichimoku: voteIchimoku, bollinger: voteBollinger, stoch: voteStoch };

function mergedParams(id, override) {
  const base = (INDICATORS.find((x) => x.id === id) || {}).params || {};
  return { ...base, ...(override || {}) };
}

/**
 * Bir custom bot tanımını mumlar üzerinde değerlendirir → sinyal | null.
 * def: { indicators:[id], logic:'all'|'majority', params:{[id]:{...}},
 *        atrSlMult, atrTpMult, ictStrategy?, ictSignals? }
 * ictSignals: (opsiyonel) ictSmcService.analyzeLatest çıktısı — bu bar/parite için.
 */
function evaluate(candles, def) {
  const ids = (def.indicators || []).filter((id) => INDICATOR_IDS.includes(id));
  if (!candles || candles.length < 60 || ids.length === 0) return null;

  let long = 0, short = 0;
  const votes = {};
  for (const id of ids) {
    let v = 0;
    try { v = VOTERS[id](candles, mergedParams(id, (def.params || {})[id])); } catch (_) { v = 0; }
    votes[id] = v;
    if (v > 0) long++; else if (v < 0) short++;
  }

  const total = ids.length;
  let direction = null;
  const logic = def.logic === 'majority' ? 'majority' : 'all';
  if (logic === 'all') {
    // TÜM seçili indikatörler aynı yönde (nötr olan varsa sinyal yok)
    if (long === total) direction = 'long';
    else if (short === total) direction = 'short';
  } else {
    if (long > short && long > 0) direction = 'long';
    else if (short > long && short > 0) direction = 'short';
  }
  if (!direction) return null;

  // Opsiyonel ICT/SMC teyidi: aynı yönde sinyal yoksa iptal
  if (def.ictStrategy) {
    const ictOk = (def.ictSignals || []).some((s) => s.direction === direction || s.side === direction);
    if (!ictOk) return null;
  }

  const i = candles.length - 1;
  const a = atr(candles, 14)[i];
  if (!(a > 0)) return null;
  const entry = candles[i].close;
  const slMult = Number(def.atrSlMult) > 0 ? Number(def.atrSlMult) : 1.5;
  const tpMult = Number(def.atrTpMult) > 0 ? Number(def.atrTpMult) : 2.5;
  const stop = direction === 'long' ? entry - a * slMult : entry + a * slMult;
  const target1 = direction === 'long' ? entry + a * tpMult : entry - a * tpMult;
  const agree = direction === 'long' ? long : short;
  const confidence = Math.round(50 + (agree / total) * 40 + (def.ictStrategy ? 10 : 0));

  return {
    direction, side: direction, entry, stop, target1,
    target2: direction === 'long' ? entry + a * tpMult * 1.6 : entry - a * tpMult * 1.6,
    confidence: Math.max(0, Math.min(100, confidence)),
    atr: a, votes, time: candles[i].time,
  };
}

module.exports = { evaluate, INDICATORS, INDICATOR_IDS, VOTERS, ema, sma, atr, rsiSeries, dmiSeries };
