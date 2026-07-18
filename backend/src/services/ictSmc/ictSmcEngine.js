'use strict';

/**
 * ICT / SMC Çoklu Strateji Motoru — ICT_SMC_Indicator.pine (Pine v6) portu.
 *
 * Pine'ın bar-bar yürütme modelini birebir yansıtır: mumlar üzerinde tek ileri
 * geçiş, kalıcı durum (`var`) JS closure değişkenleriyle, tarihsel operatör `[n]`
 * dizinlemeyle taklit edilir. Motor; yapı (internal+swing BOS/CHoCH/CHoCH+/MSS),
 * FVG/IFVG, Order Block/Breaker/Propulsion/Unicorn, likidite (EQH/EQL/PDH-PDL/
 * seans H-L), sweep/grab, CISD, SMT (tek-sembol pivot), seans/killzone, HTF bias,
 * Premium/Discount/OTE üretir. Strateji seçimi ictSmcStrategies.js'de.
 *
 * Girdi: candles = [{ time(ms), open, high, low, close, volume }], eskiden yeniye.
 * Çıktı: her bar için { i, ...engineState, events } — strateji katmanı tüketir.
 *
 * Not: request.security (HTF bias, PDH/PDL) tek-TF girdi üzerinde yaklaşık
 * hesaplanır (bias = aynı seri EMA/yapı; PDH/PDL = takvim-günü önceki H/L).
 * SMT korele sembol opsiyoneldir; verilmezse tek-sembol pivot divergence kapalı.
 */

// ───────────────────────── küçük yardımcılar ─────────────────────────
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }
function avg(a, b) { return (a + b) / 2; }

// Wilder ATR (Pine ta.atr ile uyumlu) — tüm seri için önceden hesaplanır.
function computeATR(c, len) {
  const n = c.length;
  const out = new Array(n).fill(NaN);
  if (n === 0) return out;
  let prevAtr = NaN;
  for (let i = 0; i < n; i++) {
    const h = c[i].high, l = c[i].low;
    const tr = i === 0 ? h - l : Math.max(h - l, Math.abs(h - c[i - 1].close), Math.abs(l - c[i - 1].close));
    if (i < len) {
      // ilk `len` bar: basit ortalamaya yaklaş (RMA seed)
      prevAtr = Number.isFinite(prevAtr) ? prevAtr + (tr - prevAtr) / (i + 1) : tr;
    } else {
      prevAtr = (prevAtr * (len - 1) + tr) / len;
    }
    out[i] = prevAtr;
  }
  return out;
}

function computeEMA(vals, len) {
  const n = vals.length;
  const out = new Array(n).fill(NaN);
  const k = 2 / (len + 1);
  let ema = NaN;
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    if (!Number.isFinite(v)) { out[i] = ema; continue; }
    ema = Number.isFinite(ema) ? v * k + ema * (1 - k) : v;
    out[i] = ema;
  }
  return out;
}

function computeRSI(c, len) {
  const n = c.length;
  const out = new Array(n).fill(NaN);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < n; i++) {
    const ch = c[i].close - c[i - 1].close;
    const g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (i <= len) {
      avgGain += g / len; avgLoss += l / len;
      if (i === len) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    } else {
      avgGain = (avgGain * (len - 1) + g) / len;
      avgLoss = (avgLoss * (len - 1) + l) / len;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return out;
}

function computeStdev(vals, len) {
  const n = vals.length;
  const out = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i < len - 1) continue;
    let sum = 0;
    for (let j = i - len + 1; j <= i; j++) sum += vals[j];
    const mean = sum / len;
    let v = 0;
    for (let j = i - len + 1; j <= i; j++) v += (vals[j] - mean) ** 2;
    out[i] = Math.sqrt(v / len);
  }
  return out;
}

// Pine ta.dmi(14,14) — [+DI, -DI, ADX]
function computeADX(c, diLen, adxLen) {
  const n = c.length;
  const adx = new Array(n).fill(NaN);
  const plusDI = new Array(n).fill(NaN);
  const minusDI = new Array(n).fill(NaN);
  let sTR = 0, sPlus = 0, sMinus = 0, adxVal = NaN, dxCount = 0, dxSum = 0;
  for (let i = 1; i < n; i++) {
    const up = c[i].high - c[i - 1].high;
    const dn = c[i - 1].low - c[i].low;
    const plusDM = up > dn && up > 0 ? up : 0;
    const minusDM = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    if (i <= diLen) { sTR += tr; sPlus += plusDM; sMinus += minusDM; }
    else {
      sTR = sTR - sTR / diLen + tr;
      sPlus = sPlus - sPlus / diLen + plusDM;
      sMinus = sMinus - sMinus / diLen + minusDM;
    }
    if (i >= diLen && sTR > 0) {
      const pdi = 100 * sPlus / sTR;
      const mdi = 100 * sMinus / sTR;
      plusDI[i] = pdi; minusDI[i] = mdi;
      const dx = pdi + mdi === 0 ? 0 : 100 * Math.abs(pdi - mdi) / (pdi + mdi);
      dxCount++;
      if (dxCount <= adxLen) { dxSum += dx; if (dxCount === adxLen) adxVal = dxSum / adxLen; }
      else adxVal = (adxVal * (adxLen - 1) + dx) / adxLen;
      adx[i] = adxVal;
    }
  }
  return { plusDI, minusDI, adx };
}

function computeMACDHist(c) {
  const closes = c.map((x) => x.close);
  const e12 = computeEMA(closes, 12);
  const e26 = computeEMA(closes, 26);
  const macd = e12.map((v, i) => v - e26[i]);
  const sig = computeEMA(macd, 9);
  return macd.map((v, i) => v - sig[i]);
}

// Pine ta.pivothigh(len,len): i-len barındaki tepe, ancak i barında onaylanır.
// out[i] = onaylanan pivot değeri (yoksa NaN). Değer i-len barına aittir.
function computePivots(c, len, high) {
  const n = c.length;
  const out = new Array(n).fill(NaN);
  for (let i = 2 * len; i < n; i++) {
    const p = i - len;
    const val = high ? c[p].high : c[p].low;
    let ok = true;
    for (let j = p - len; j <= p + len; j++) {
      if (j === p) continue;
      const cmp = high ? c[j].high : c[j].low;
      if (high ? cmp > val : cmp < val) { ok = false; break; }
    }
    if (ok) out[i] = val;
  }
  return out;
}

function rollingExtreme(c, len, high) {
  const n = c.length;
  const out = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - len + 1);
    let e = high ? -Infinity : Infinity;
    for (let j = from; j <= i; j++) {
      const v = high ? c[j].high : c[j].low;
      e = high ? Math.max(e, v) : Math.min(e, v);
    }
    out[i] = e;
  }
  return out;
}

function rollingSMA(vals, len) {
  const n = vals.length;
  const out = new Array(n).fill(NaN);
  let sum = 0, cnt = 0;
  const q = [];
  for (let i = 0; i < n; i++) {
    const v = Number.isFinite(vals[i]) ? vals[i] : 0;
    q.push(v); sum += v; cnt++;
    if (q.length > len) { sum -= q.shift(); cnt--; }
    if (q.length === len) out[i] = sum / len;
  }
  return out;
}

// ───────────────────────── seans/killzone (NY saati) ─────────────────
// Basit DST-farkında NY offset: Mart 2. Pazar – Kasım 1. Pazar arası UTC-4,
// aksi UTC-5. Killzone pencereleri NY yerel saatiyle.
function nyParts(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const marSecond = nthSunday(y, 2, 2); // Mart, 2. Pazar
  const novFirst = nthSunday(y, 10, 1); // Kasım, 1. Pazar
  const dst = ms >= marSecond && ms < novFirst;
  const offset = dst ? -4 : -5;
  const local = new Date(ms + offset * 3600 * 1000);
  return { hour: local.getUTCHours(), minute: local.getUTCMinutes(), day: local.getUTCDay(), dateKey: local.getUTCFullYear() * 10000 + (local.getUTCMonth() + 1) * 100 + local.getUTCDate() };
}
function nthSunday(year, monthIndex, nth) {
  const first = Date.UTC(year, monthIndex, 1);
  const dow = new Date(first).getUTCDay();
  const firstSunday = 1 + ((7 - dow) % 7);
  const day = firstSunday + (nth - 1) * 7;
  return Date.UTC(year, monthIndex, day, 7, 0, 0); // ~saat farkını nötrle: 07:00 UTC
}
function inWindow(p, startHM, endHM) {
  const t = p.hour * 60 + p.minute;
  return t >= startHM && t < endHM;
}

/**
 * Motoru mumlar üzerinde çalıştırır ve strateji katmanının ihtiyaç duyduğu
 * per-bar durumu üretir. opts ile Pine input'ları ayarlanabilir (varsayılanlar
 * Pine ile aynı).
 */
function runEngine(candles, opts = {}) {
  const O = {
    swingLen: 10, internalLen: 5, breakWick: false, dispMult: 3.0, dispBody: true,
    mssStrict: true, atrLen: 14, liqLen: 10, eqTol: 0.1, maxBreachBars: 25,
    grabWBR: 0.5, sweepValidBars: 40, biasEmaLen: 50, zoneMaxAge: 250, maxZoneKeep: 25,
    maxLiqPerSide: 10, cisdMinRun: 1, cisdValidBars: 60, cisdReqSweep: true,
    fvgMinAtr: 0.0, obVolMult: 2.0, entryValidBars: 40, useSessions: true,
    // klasik strateji ayarları
    donLen: 20, emaFastLen: 50, emaSlowLen: 200, emaPullLen: 21, rngLen: 50,
    adxTh: 20, adxRangeTh: 20, rsiOS: 35, rsiOB: 65, volMult: 1.5, volFilterOn: true,
    scalpKzOnly: true, entryMode: 'market', chochRetest: false, swpReqMss: true, smtReqStruct: true,
    ...opts,
  };
  const n = candles.length;
  const c = candles;
  const events = [];
  if (n < 30) return { bars: [], signals: [], events };

  // önden hesaplı seriler
  const atrV = computeATR(c, O.atrLen);
  const atr200 = computeATR(c, 200);
  const dispBase = c.map((x) => O.dispBody ? Math.abs(x.close - x.open) : x.high - x.low);
  const dispStd = computeStdev(dispBase, 100);
  const rsiV = computeRSI(c, 14);
  const macdHist = computeMACDHist(c);
  const { adx: adxV } = computeADX(c, 14, 14);
  const closes = c.map((x) => x.close);
  const e5 = computeEMA(closes, 5), e8 = computeEMA(closes, 8), e13 = computeEMA(closes, 13);
  const emaBias = computeEMA(closes, O.biasEmaLen);
  const hi20 = rollingExtreme(c, 20, true), lo20 = rollingExtreme(c, 20, false);
  const hi5 = rollingExtreme(c, 5, true), lo5 = rollingExtreme(c, 5, false);
  const volSma = rollingSMA(c.map((x) => x.volume || 0), 20);
  const emaF = computeEMA(closes, O.emaFastLen), emaS = computeEMA(closes, O.emaSlowLen), emaP = computeEMA(closes, O.emaPullLen);
  const donHi = rollingExtreme(c, O.donLen, true), donLo = rollingExtreme(c, O.donLen, false);
  const rngHiC = rollingExtreme(c, O.rngLen, true), rngLoC = rollingExtreme(c, O.rngLen, false);
  const swingPH = computePivots(c, O.swingLen, true), swingPL = computePivots(c, O.swingLen, false);
  const intPH = computePivots(c, O.internalLen, true), intPL = computePivots(c, O.internalLen, false);
  const liqPH = computePivots(c, O.liqLen, true), liqPL = computePivots(c, O.liqLen, false);

  // ── kalıcı durum (Pine var) ──
  const zones = { fvg: [], ifvg: [], ob: [], brk: [], prop: [], uni: [] };
  const buyLiq = [], sellLiq = [];
  const struct = { internal: newStruct(), swing: newStruct() };
  let lastBullFvg = null, lastBearFvg = null, lastBullFvgBar = -1e9, lastBearFvgBar = -1e9;
  let lastBullBrk = null, lastBearBrk = null;
  let lastBuySweepBar = -1e9, lastBuySweepExt = NaN, lastSellSweepBar = -1e9, lastSellSweepExt = NaN;
  let lastAsiaBuySwBar = -1e9, lastAsiaSellSwBar = -1e9;
  // CISD
  let dnRunLen = 0, dnRunOpen = NaN, dnRunLow = NaN, upRunLen = 0, upRunOpen = NaN, upRunHigh = NaN;
  let cisdBullLvl = NaN, cisdBullSL = NaN, cisdBullBar = -1e9, cisdBearLvl = NaN, cisdBearSL = NaN, cisdBearBar = -1e9;
  // sessions
  let prevSession = null, asiaHi = NaN, asiaLo = NaN, asiaHiF = NaN, asiaLoF = NaN;
  let ldnHi = NaN, ldnLo = NaN, nyAmHi = NaN, nyAmLo = NaN;
  let prevDateKey = null, pdH = NaN, pdL = NaN, curDayHi = -Infinity, curDayLo = Infinity;
  // liquidity EQ tracking
  let prevPhL = NaN, prevPlL = NaN;
  // seans-önceki bar bayrakları (per-run; çağrılar arası paylaşılmaz)
  let barPrevInAsia = false, barPrevInLdn = false, barPrevInNyAm = false;

  const bars = [];
  const signals = [];
  const stratState = O.strategy ? require('./ictSmcStrategies').newStratState() : null;

  function addZone(arr, kind, dir, top, bot, bornBar) {
    const z = { top, bottom: bot, dir, kind, bornBar, state: 0, flagP: false };
    arr.push(z);
    if (arr.length > O.maxZoneKeep) arr.shift();
    return z;
  }
  function addLiq(dir, price, kind) {
    if (!Number.isFinite(price)) return;
    const arr = dir === 1 ? buyLiq : sellLiq;
    for (const L of arr) {
      if (!L.swept && L.kind === kind && Math.abs(L.price - price) < (atr200[cur] || 0) * 0.03) return;
    }
    arr.push({ price, dir, kind, bornBar: cur, extreme: NaN, breached: false, breachBar: 0, swept: false, sweptBar: 0 });
    if (arr.length > O.maxLiqPerSide) {
      const idx = arr.findIndex((L) => L.kind === 1);
      arr.splice(idx >= 0 ? idx : 0, 1);
    }
  }
  function removeLiqKind(arr, kind) {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i].kind === kind) arr.splice(i, 1);
  }

  let cur = 0;
  for (let i = 0; i < n; i++) {
    cur = i;
    const bar = c[i], prev = c[i - 1] || bar;
    const A200 = atr200[i] || 0;
    const dispBull = bar.close > bar.open && dispBase[i] > (dispStd[i] || Infinity) * O.dispMult;
    const dispBear = bar.close < bar.open && dispBase[i] > (dispStd[i] || Infinity) * O.dispMult;
    const dispBullPrev = i > 0 && c[i - 1].close > c[i - 1].open && dispBase[i - 1] > (dispStd[i - 1] || Infinity) * O.dispMult;
    const dispBearPrev = i > 0 && c[i - 1].close < c[i - 1].open && dispBase[i - 1] > (dispStd[i - 1] || Infinity) * O.dispMult;
    const bodySize = Math.max(Math.abs(bar.close - bar.open), 1e-9);
    const topWick = bar.high - Math.max(bar.open, bar.close);
    const botWick = Math.min(bar.open, bar.close) - bar.low;

    // ── seans / killzone ──
    let inAsia = false, inLdn = false, inNyAm = false, inNyPm = false, inSB = false;
    let sess = null;
    if (O.useSessions && Number.isFinite(bar.time)) {
      const p = nyParts(bar.time);
      inAsia = inWindow(p, 20 * 60, 24 * 60);
      inLdn = inWindow(p, 2 * 60, 5 * 60);
      inNyAm = inWindow(p, 9 * 60 + 30, 11 * 60);
      inNyPm = inWindow(p, 13 * 60 + 30, 16 * 60);
      inSB = inWindow(p, 3 * 60, 4 * 60) || inWindow(p, 10 * 60, 11 * 60);
      sess = p;
      // Asya H/L biriktir
      if (inAsia && !barPrevInAsia) { asiaHi = bar.high; asiaLo = bar.low; }
      else if (inAsia) { asiaHi = Math.max(asiaHi, bar.high); asiaLo = Math.min(asiaLo, bar.low); }
      if (!inAsia && barPrevInAsia && Number.isFinite(asiaHi)) {
        asiaHiF = asiaHi; asiaLoF = asiaLo;
        removeLiqKind(buyLiq, 6); removeLiqKind(sellLiq, 6);
        addLiq(1, asiaHi, 6); addLiq(-1, asiaLo, 6);
      }
      // Londra
      if (inLdn && !barPrevInLdn) { ldnHi = bar.high; ldnLo = bar.low; }
      else if (inLdn) { ldnHi = Math.max(ldnHi, bar.high); ldnLo = Math.min(ldnLo, bar.low); }
      if (!inLdn && barPrevInLdn && Number.isFinite(ldnHi)) {
        removeLiqKind(buyLiq, 5); removeLiqKind(sellLiq, 5);
        addLiq(1, ldnHi, 5); addLiq(-1, ldnLo, 5);
      }
      // NY AM
      if (inNyAm && !barPrevInNyAm) { nyAmHi = bar.high; nyAmLo = bar.low; }
      else if (inNyAm) { nyAmHi = Math.max(nyAmHi, bar.high); nyAmLo = Math.min(nyAmLo, bar.low); }
      if (!inNyAm && barPrevInNyAm && Number.isFinite(nyAmHi)) {
        removeLiqKind(buyLiq, 7); removeLiqKind(sellLiq, 7);
        addLiq(1, nyAmHi, 7); addLiq(-1, nyAmLo, 7);
      }
      // PDH/PDL (takvim günü değişince önceki günün H/L)
      if (prevDateKey !== null && p.dateKey !== prevDateKey) {
        if (Number.isFinite(curDayHi) && curDayHi > -Infinity) {
          pdH = curDayHi; pdL = curDayLo;
          removeLiqKind(buyLiq, 3); removeLiqKind(sellLiq, 3);
          addLiq(1, pdH, 3); addLiq(-1, pdL, 3);
        }
        curDayHi = bar.high; curDayLo = bar.low;
      } else {
        curDayHi = Math.max(curDayHi, bar.high); curDayLo = Math.min(curDayLo, bar.low);
      }
      prevDateKey = p.dateKey;
    }
    barPrevInAsia = inAsia; barPrevInLdn = inLdn; barPrevInNyAm = inNyAm;
    const inAnyKZ = inAsia || inLdn || inNyAm || inNyPm;

    // ── yapı motoru (internal + swing) ──
    const iEv = stepStructure(struct.internal, c, i, intPH, intPL, O.internalLen, O.breakWick);
    const sEv = stepStructure(struct.swing, c, i, swingPH, swingPL, O.swingLen, O.breakWick);

    // ── Premium/Discount / OTE (swing trail) ──
    const rngPD = struct.swing.trailU - struct.swing.trailD;
    const eqLvl = avg(struct.swing.trailU, struct.swing.trailD);
    const inDisc = bar.close < eqLvl, inPrem = bar.close > eqLvl;
    const oteTopL = struct.swing.trailU - 0.62 * rngPD, oteBotL = struct.swing.trailU - 0.79 * rngPD;
    const oteBotS = struct.swing.trailD + 0.62 * rngPD, oteTopS = struct.swing.trailD + 0.79 * rngPD;

    // ── FVG / IFVG ──
    let newBullFvg = false, newBearFvg = false;
    if (i >= 2) {
      const gapUp = bar.low - c[i - 2].high, gapDn = c[i - 2].low - bar.high;
      newBullFvg = bar.low > c[i - 2].high && c[i - 1].close > c[i - 2].high && gapUp >= A200 * O.fvgMinAtr;
      newBearFvg = bar.high < c[i - 2].low && c[i - 1].close < c[i - 2].low && gapDn >= A200 * O.fvgMinAtr;
    }
    if (newBullFvg) { lastBullFvg = addZone(zones.fvg, 1, 1, bar.low, c[i - 2].high, i - 2); lastBullFvgBar = i; }
    if (newBearFvg) { lastBearFvg = addZone(zones.fvg, 1, -1, c[i - 2].low, bar.high, i - 2); lastBearFvgBar = i; }
    // FVG doluşu → IFVG
    for (let k = zones.fvg.length - 1; k >= 0; k--) {
      const z = zones.fvg[k];
      if (z.state !== 2) {
        if (z.dir === 1 && bar.low < z.bottom) { z.state = 2; addZone(zones.ifvg, 6, -1, z.top, z.bottom, i); }
        else if (z.dir === -1 && bar.high > z.top) { z.state = 2; addZone(zones.ifvg, 6, 1, z.top, z.bottom, i); }
      }
      if (i - z.bornBar > O.zoneMaxAge + 30) zones.fvg.splice(k, 1);
    }

    // ── MSS ──
    const mssBull = iEv.brkUp && (!O.mssStrict || iEv.chU) && (dispBull || dispBullPrev) && i - lastBullFvgBar <= 1;
    const mssBear = iEv.brkDn && (!O.mssStrict || iEv.chD) && (dispBear || dispBearPrev) && i - lastBearFvgBar <= 1;

    // ── Order Block (bacak taraması) ──
    if (iEv.brkUp) { const ob = scanLeg(c, i, struct.internal.lastHbar, false, atr200, O.obVolMult); if (ob) addZone(zones.ob, 2, 1, ob.top, ob.bot, ob.bar); }
    if (iEv.brkDn) { const ob = scanLeg(c, i, struct.internal.lastLbar, true, atr200, O.obVolMult); if (ob) addZone(zones.ob, 2, -1, ob.top, ob.bot, ob.bar); }
    if (sEv.brkUp) { const ob = scanLeg(c, i, struct.swing.lastHbar, false, atr200, O.obVolMult); if (ob) addZone(zones.ob, 2, 1, ob.top, ob.bot, ob.bar); }
    if (sEv.brkDn) { const ob = scanLeg(c, i, struct.swing.lastLbar, true, atr200, O.obVolMult); if (ob) addZone(zones.ob, 2, -1, ob.top, ob.bot, ob.bar); }
    // OB ihlali → Breaker
    for (let k = zones.ob.length - 1; k >= 0; k--) {
      const z = zones.ob[k];
      if (z.state !== 2) {
        if (z.dir === 1 && bar.low < z.bottom) { z.state = 2; lastBearBrk = addZone(zones.brk, 3, -1, z.top, z.bottom, i); }
        else if (z.dir === -1 && bar.high > z.top) { z.state = 2; lastBullBrk = addZone(zones.brk, 3, 1, z.top, z.bottom, i); }
      }
      // Propulsion
      if (z.state === 0 && !z.flagP && i - z.bornBar > 2) {
        const zmid = avg(z.top, z.bottom);
        if (z.dir === 1 && bar.low <= z.top && bar.low >= zmid && bar.close > prev.high && bar.close > bar.open) {
          z.flagP = true; addZone(zones.prop, 4, 1, Math.max(bar.open, bar.close), Math.min(bar.open, bar.close), i);
        } else if (z.dir === -1 && bar.high >= z.bottom && bar.high <= zmid && bar.close < prev.low && bar.close < bar.open) {
          z.flagP = true; addZone(zones.prop, 4, -1, Math.max(bar.open, bar.close), Math.min(bar.open, bar.close), i);
        }
      }
      if (i - z.bornBar > O.zoneMaxAge + 30) zones.ob.splice(k, 1);
    }
    // Unicorn: MSS + aynı yön breaker + FVG kesişimi
    if (mssBull && lastBullBrk && lastBullFvg && lastBullBrk.state === 0 && i - lastBullBrk.bornBar <= O.entryValidBars) {
      const t = Math.min(lastBullBrk.top, lastBullFvg.top), b = Math.max(lastBullBrk.bottom, lastBullFvg.bottom);
      if (t > b) addZone(zones.uni, 5, 1, t, b, i);
    }
    if (mssBear && lastBearBrk && lastBearFvg && lastBearBrk.state === 0 && i - lastBearBrk.bornBar <= O.entryValidBars) {
      const t = Math.min(lastBearBrk.top, lastBearFvg.top), b = Math.max(lastBearBrk.bottom, lastBearFvg.bottom);
      if (t > b) addZone(zones.uni, 5, -1, t, b, i);
    }
    // diğer bölge bakımları (state=2 ihlal + yaş)
    maintainZones(zones.ifvg, bar, i, O); maintainZones(zones.brk, bar, i, O);
    maintainZones(zones.prop, bar, i, O, true); maintainZones(zones.uni, bar, i, O);

    // ── likidite pivotları + EQH/EQL ──
    let eqhEvt = false, eqlEvt = false;
    if (Number.isFinite(liqPH[i])) {
      if (Number.isFinite(prevPhL) && Math.abs(liqPH[i] - prevPhL) <= A200 * O.eqTol) { eqhEvt = true; addLiq(1, Math.max(liqPH[i], prevPhL), 2); }
      else addLiq(1, liqPH[i], 1);
      prevPhL = liqPH[i];
    }
    if (Number.isFinite(liqPL[i])) {
      if (Number.isFinite(prevPlL) && Math.abs(liqPL[i] - prevPlL) <= A200 * O.eqTol) { eqlEvt = true; addLiq(-1, Math.min(liqPL[i], prevPlL), 2); }
      else addLiq(-1, liqPL[i], 1);
      prevPlL = liqPL[i];
    }

    // ── sweep / grab durum makinesi ──
    let buySweepEvt = false, sellSweepEvt = false, bullGrabEvt = false, bearGrabEvt = false;
    let asiaSweepBuyEvt = false, asiaSweepSellEvt = false;
    for (let k = buyLiq.length - 1; k >= 0; k--) {
      const L = buyLiq[k]; let dead = false;
      if (!L.swept) {
        if (!L.breached) {
          if (bar.high > L.price) {
            L.breached = true; L.breachBar = i; L.extreme = bar.high;
            if (bar.close < L.price) {
              L.swept = true; L.sweptBar = i; buySweepEvt = true; lastBuySweepBar = i; lastBuySweepExt = L.extreme;
              if (L.kind === 6) { asiaSweepBuyEvt = true; lastAsiaBuySwBar = i; }
              if (topWick / bodySize >= O.grabWBR) bearGrabEvt = true;
            }
          }
        } else {
          L.extreme = Math.max(L.extreme, bar.high);
          if (bar.close < L.price) {
            L.swept = true; L.sweptBar = i; buySweepEvt = true; lastBuySweepBar = i; lastBuySweepExt = L.extreme;
            if (L.kind === 6) { asiaSweepBuyEvt = true; lastAsiaBuySwBar = i; }
          } else if (i - L.breachBar > O.maxBreachBars) dead = true;
        }
      } else if (i - L.sweptBar > 100) dead = true;
      if (dead) buyLiq.splice(k, 1);
    }
    for (let k = sellLiq.length - 1; k >= 0; k--) {
      const L = sellLiq[k]; let dead = false;
      if (!L.swept) {
        if (!L.breached) {
          if (bar.low < L.price) {
            L.breached = true; L.breachBar = i; L.extreme = bar.low;
            if (bar.close > L.price) {
              L.swept = true; L.sweptBar = i; sellSweepEvt = true; lastSellSweepBar = i; lastSellSweepExt = L.extreme;
              if (L.kind === 6) { asiaSweepSellEvt = true; lastAsiaSellSwBar = i; }
              if (botWick / bodySize >= O.grabWBR) bullGrabEvt = true;
            }
          }
        } else {
          L.extreme = Math.min(L.extreme, bar.low);
          if (bar.close > L.price) {
            L.swept = true; L.sweptBar = i; sellSweepEvt = true; lastSellSweepBar = i; lastSellSweepExt = L.extreme;
            if (L.kind === 6) { asiaSweepSellEvt = true; lastAsiaSellSwBar = i; }
          } else if (i - L.breachBar > O.maxBreachBars) dead = true;
        }
      } else if (i - L.sweptBar > 100) dead = true;
      if (dead) sellLiq.splice(k, 1);
    }
    const sweepSellFresh = i - lastSellSweepBar <= O.sweepValidBars;
    const sweepBuyFresh = i - lastBuySweepBar <= O.sweepValidBars;

    // ── CISD ──
    const upBarC = bar.close > bar.open, dnBarC = bar.close < bar.open;
    const prevUp = i > 0 && c[i - 1].close > c[i - 1].open;
    const prevDn = i > 0 && c[i - 1].close < c[i - 1].open;
    if (dnBarC) {
      dnRunLen = prevDn ? dnRunLen + 1 : 1;
      dnRunOpen = prevDn ? dnRunOpen : bar.open;
      dnRunLow = prevDn ? Math.min(dnRunLow, bar.low) : bar.low;
    } else {
      if (prevDn && dnRunLen >= O.cisdMinRun && dnRunLow <= (lo20[i - 1] || Infinity)) {
        cisdBullLvl = dnRunOpen; cisdBullSL = dnRunLow; cisdBullBar = i;
      }
      dnRunLen = 0;
    }
    if (upBarC) {
      upRunLen = prevUp ? upRunLen + 1 : 1;
      upRunOpen = prevUp ? upRunOpen : bar.open;
      upRunHigh = prevUp ? Math.max(upRunHigh, bar.high) : bar.high;
    } else {
      if (prevUp && upRunLen >= O.cisdMinRun && upRunHigh >= (hi20[i - 1] || -Infinity)) {
        cisdBearLvl = upRunOpen; cisdBearSL = upRunHigh; cisdBearBar = i;
      }
      upRunLen = 0;
    }
    const cisdBullTrig = Number.isFinite(cisdBullLvl) && bar.close > cisdBullLvl && i - cisdBullBar <= O.cisdValidBars && (!O.cisdReqSweep || sweepSellFresh);
    const cisdBearTrig = Number.isFinite(cisdBearLvl) && bar.close < cisdBearLvl && i - cisdBearBar <= O.cisdValidBars && (!O.cisdReqSweep || sweepBuyFresh);
    const cisdBullSLevt = cisdBullSL, cisdBearSLevt = cisdBearSL;
    if (cisdBullTrig) cisdBullLvl = NaN;
    if (cisdBearTrig) cisdBearLvl = NaN;

    // HTF bias (aynı seri EMA yaklaşık)
    const htfBias = O.biasEnable === false ? 0 : (bar.close > emaBias[i] ? 1 : bar.close < emaBias[i] ? -1 : 0);

    const B = {
      i, time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      prevClose: prev.close,
      atr: atrV[i], rsi: rsiV[i], rsiPrev: rsiV[i - 1], macdHist: macdHist[i], macdHistPrev: macdHist[i - 1], adx: adxV[i],
      e5: e5[i], e8: e8[i], e13: e13[i], hi20: hi20[i], lo20: lo20[i], hi5: hi5[i], lo5: lo5[i], volSma: volSma[i], vol: bar.volume,
      emaF: emaF[i], emaS: emaS[i], emaP: emaP[i], donHi: donHi[i], donHiPrev: donHi[i - 1], donLo: donLo[i], donLoPrev: donLo[i - 1],
      donHiPrev2: donHi[i - 2], donLoPrev2: donLo[i - 2], closePrev: c[i - 1] ? c[i - 1].close : NaN,
      rngHiC: rngHiC[i - 1], rngLoC: rngLoC[i - 1], rsiX50up: rsiV[i - 1] < 50 && rsiV[i] >= 50, rsiX50dn: rsiV[i - 1] > 50 && rsiV[i] <= 50,
      dispBull, dispBear, iEv, sEv, iTrend: struct.internal.trend, swTrend: struct.swing.trend,
      iTrailU: struct.internal.trailU, iTrailD: struct.internal.trailD, trailU: struct.swing.trailU, trailD: struct.swing.trailD,
      iBrokenH: iEv.brokenH, iBrokenL: iEv.brokenL,
      rngPD, eqLvl, inDisc, inPrem, oteTopL, oteBotL, oteBotS, oteTopS,
      mssBull, mssBear, newBullFvg, newBearFvg,
      lastBullFvg, lastBearFvg, lastBuySweepExt, lastSellSweepExt,
      buySweepEvt, sellSweepEvt, bullGrabEvt, bearGrabEvt, sweepSellFresh, sweepBuyFresh,
      lastAsiaBuySwBar, lastAsiaSellSwBar, asiaHiF, asiaLoF,
      cisdBullTrig, cisdBearTrig, cisdBullSLevt, cisdBearSLevt,
      inAsia, inLdn, inNyAm, inNyPm, inSB, inAnyKZ, htfBias, session: sess,
      zones,
      buyLiq, sellLiq,
    };
    bars.push(B);

    // Strateji adımı — bölgeler/likidite CANLIYKEN çalışır (zone-retest için şart).
    if (stratState) {
      const raw = require('./ictSmcStrategies').stepStrategy(stratState, B, O);
      if (raw) signals.push(raw);
    }
  }

  return { bars, signals, options: O };
}

function newStruct() {
  return { lastH: NaN, prevH: NaN, lastHbar: 0, hAvail: false, lastL: NaN, prevL: NaN, lastLbar: 0, lAvail: false, trend: 0, hType: 0, lType: 0, trailU: -Infinity, trailD: Infinity };
}

// Pine f_structure bir bar adımı
function stepStructure(S, c, i, PH, PL, len, breakWick) {
  const bar = c[i];
  const ev = { brkUp: false, brkDn: false, chU: false, chD: false, chPU: false, chPD: false, brokenH: NaN, brokenL: NaN };
  if (Number.isFinite(PH[i])) {
    S.prevH = S.lastH; S.lastH = PH[i]; S.lastHbar = i - len; S.hAvail = true;
    S.hType = Number.isFinite(S.prevH) ? (PH[i] > S.prevH ? 1 : -1) : 0;
    S.trailU = PH[i];
  }
  if (Number.isFinite(PL[i])) {
    S.prevL = S.lastL; S.lastL = PL[i]; S.lastLbar = i - len; S.lAvail = true;
    S.lType = Number.isFinite(S.prevL) ? (PL[i] > S.prevL ? 1 : -1) : 0;
    S.trailD = PL[i];
  }
  S.trailU = Math.max(S.trailU, bar.high);
  S.trailD = Math.min(S.trailD, bar.low);
  const upPx = breakWick ? bar.high : bar.close;
  const dnPx = breakWick ? bar.low : bar.close;
  if (S.hAvail && Number.isFinite(S.lastH) && upPx > S.lastH) {
    ev.brkUp = true; ev.chU = S.trend === -1; ev.chPU = ev.chU && S.lType === 1; ev.brokenH = S.lastH;
    S.trend = 1; S.hAvail = false;
  }
  if (S.lAvail && Number.isFinite(S.lastL) && dnPx < S.lastL) {
    ev.brkDn = true; ev.chD = S.trend === 1; ev.chPD = ev.chD && S.hType === -1; ev.brokenL = S.lastL;
    S.trend = -1; S.lAvail = false;
  }
  return ev;
}

// Pine f_scanLeg: kırılan bacakta OB adayı mum
function scanLeg(c, i, fromBar, useMax, atr200, volMult) {
  let minV = NaN, maxV = NaN, idx = 0;
  const span = Math.min(i - fromBar - 1, 300);
  if (span < 1) return null;
  for (let k = 1; k <= span; k++) {
    const j = i - k;
    if (j < 0) break;
    const rngI = c[j].high - c[j].low;
    if (rngI < (atr200[j] || Infinity) * volMult) {
      const hi2 = Math.max(c[j].open, c[j].close);
      const lo2 = Math.min(c[j].open, c[j].close);
      if (useMax) { if (!Number.isFinite(maxV) || hi2 > maxV) { maxV = hi2; minV = lo2; idx = k; } }
      else { if (!Number.isFinite(minV) || lo2 < minV) { minV = lo2; maxV = hi2; idx = k; } }
    }
  }
  if (!Number.isFinite(maxV) || !Number.isFinite(minV) || maxV <= minV) return null;
  return { top: maxV, bot: minV, bar: i - idx };
}

function maintainZones(arr, bar, i, O, isProp) {
  for (let k = arr.length - 1; k >= 0; k--) {
    const z = arr[k];
    if (z.state !== 2) {
      const lo = isProp ? bar.close : bar.low;
      const hi = isProp ? bar.close : bar.high;
      if (z.dir === 1 && lo < z.bottom) z.state = 2;
      else if (z.dir === -1 && hi > z.top) z.state = 2;
    }
    if (i - z.bornBar > O.zoneMaxAge + 30) arr.splice(k, 1);
  }
}

module.exports = { runEngine, computeATR, computeRSI, computeADX, computePivots };
