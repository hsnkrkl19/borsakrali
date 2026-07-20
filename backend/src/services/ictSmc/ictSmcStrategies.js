'use strict';

/**
 * ICT/SMC 22 strateji — ICT_SMC_Indicator.pine satır 1038-1354 portu.
 *
 * stepStrategy(state, B, O): motor döngüsünde her bar çağrılır (bölgeler CANLI).
 * B = motorun per-bar durumu; O = seçenekler (O.strategy = strateji id). Sinyal
 * varsa { i, time, side:'long'|'short', entry, slRaw, tpOverride, mode } döner,
 * yoksa null. Global filtreler (yön/killzone/bias/PD/cooldown/günlük) burada
 * uygulanır — Pine'daki sigLongF/sigShortF ile eşdeğer.
 */

const STRATS = {
  ict2022: 'ICT 2022 Model',
  silver_bullet: 'ICT Silver Bullet',
  unicorn: 'ICT Unicorn',
  ob_retest: 'Order Block Retest',
  breaker_retest: 'Breaker Retest',
  prop_retest: 'Propulsion Retest',
  fvg_retest: 'FVG Retest',
  ifvg: 'IFVG',
  sweep_reversal: 'Likidite Sweep Dönüşü',
  grab_reversal: 'Likidite Grab Dönüşü',
  cisd: 'CISD Dönüşü',
  bos_continuation: 'BOS Devam',
  choch: 'CHoCH Dönüşü',
  choch_plus: 'CHoCH+ Dönüşü',
  ote: 'OTE',
  smt: 'SMT Divergence',
  po3: 'PO3 / AMD',
  breakout: 'Klasik Breakout',
  pullback: 'Klasik Pullback',
  range: 'Klasik Range',
  momentum: 'Klasik Momentum',
  scalp: 'Klasik Scalp',
  pd_fvg: 'Premium/Discount + FVG',
};

function newStratState() {
  return {
    // ICT 2022 / SB / PO3 arming
    armZL: null, armBarL: -1e9, armSLl: NaN, armZS: null, armBarS: -1e9, armSLs: NaN,
    // CHoCH retest
    chRetLvlL: NaN, chRetBarL: -1e9, chRetSLl: NaN, chRetLvlS: NaN, chRetBarS: -1e9, chRetSLs: NaN,
    // sweep reversal arming
    swpArmLBar: -1e9, swpArmLsl: NaN, swpArmSBar: -1e9, swpArmSsl: NaN,
    // bos continuation arming
    bosArmLBar: -1e9, bosArmSBar: -1e9,
    // ote leg guard
    oteLegBarL: -1e9, oteLegBarS: -1e9,
    // cooldown / per-day
    lastSigBar: -1e9, tradesToday: 0, lastDateKey: null,
  };
}

// f_entryLvl: bölge giriş seviyesi (varsayılan %50/CE)
function entryLvl(z, mode) {
  const mid = (z.top + z.bottom) / 2;
  if (mode === 'prox') return z.dir === 1 ? z.top : z.bottom;
  if (mode === 'dist') return z.dir === 1 ? z.bottom : z.top;
  return mid;
}

// Bölge retest (market): dir yönünde, state==0, bu bar giriş seviyesine dokunup lehte kapanış
function zoneRetestLong(arr, B, O) {
  for (let k = arr.length - 1; k >= 0; k--) {
    const z = arr[k];
    if (z.dir === 1 && z.state === 0 && B.i - z.bornBar <= O.zoneMaxAge && B.i - z.bornBar >= 1) {
      const lvl = entryLvl(z, O.entryLvlMode);
      if (B.low <= lvl && B.close > lvl && B.close > B.open) { z.state = 1; return z.bottom; }
    }
  }
  return null;
}
function zoneRetestShort(arr, B, O) {
  for (let k = arr.length - 1; k >= 0; k--) {
    const z = arr[k];
    if (z.dir === -1 && z.state === 0 && B.i - z.bornBar <= O.zoneMaxAge && B.i - z.bornBar >= 1) {
      const lvl = entryLvl(z, O.entryLvlMode);
      if (B.high >= lvl && B.close < lvl && B.close < B.open) { z.state = 1; return z.top; }
    }
  }
  return null;
}

function stepStrategy(S, B, O) {
  const strat = O.strategy;
  let rawLong = false, rawShort = false, slLongRaw = NaN, slShortRaw = NaN, tpLongO = NaN, tpShortO = NaN;
  const z = B.zones;

  // ── ICT 2022 / Silver Bullet / PO3 ──
  if (strat === 'ict2022' || strat === 'silver_bullet' || strat === 'po3') {
    const isPO3 = strat === 'po3', isSB = strat === 'silver_bullet', isModel = strat === 'ict2022';
    const sweepCondL = isPO3 ? B.i - B.lastAsiaSellSwBar <= O.sweepValidBars : B.sweepSellFresh;
    const sweepCondS = isPO3 ? B.i - B.lastAsiaBuySwBar <= O.sweepValidBars : B.sweepBuyFresh;
    const sesCond = isSB ? B.inSB : isPO3 ? (B.inLdn || B.inNyAm || B.inNyPm) : true;
    if (B.mssBull && sweepCondL && sesCond && B.lastBullFvg) {
      S.armZL = B.lastBullFvg; S.armBarL = B.i;
      S.armSLl = Number.isFinite(B.lastSellSweepExt) ? B.lastSellSweepExt : B.lastBullFvg.bottom;
    }
    if (S.armZL && (S.armZL.state !== 0 || B.i - S.armBarL > O.entryValidBars || B.iEv.brkDn)) S.armZL = null;
    if (S.armZL) {
      const lvl = entryLvl(S.armZL, O.entryLvlMode);
      const pdOk = !(isModel || isSB) || lvl < B.eqLvl;
      if (pdOk && B.low <= lvl && B.close > lvl) {
        rawLong = true; slLongRaw = Math.min(S.armSLl, S.armZL.bottom); tpLongO = isPO3 ? B.asiaHiF : NaN; S.armZL = null;
      }
    }
    if (B.mssBear && sweepCondS && sesCond && B.lastBearFvg) {
      S.armZS = B.lastBearFvg; S.armBarS = B.i;
      S.armSLs = Number.isFinite(B.lastBuySweepExt) ? B.lastBuySweepExt : B.lastBearFvg.top;
    }
    if (S.armZS && (S.armZS.state !== 0 || B.i - S.armBarS > O.entryValidBars || B.iEv.brkUp)) S.armZS = null;
    if (S.armZS) {
      const lvl = entryLvl(S.armZS, O.entryLvlMode);
      const pdOk = !(isModel || isSB) || lvl > B.eqLvl;
      if (pdOk && B.high >= lvl && B.close < lvl) {
        rawShort = true; slShortRaw = Math.max(S.armSLs, S.armZS.top); tpShortO = isPO3 ? B.asiaLoF : NaN; S.armZS = null;
      }
    }
  }

  // ── Bölge retest stratejileri (Unicorn/OB/Breaker/Prop/FVG/IFVG) ──
  const retestMap = { unicorn: z.uni, ob_retest: z.ob, breaker_retest: z.brk, prop_retest: z.prop, fvg_retest: z.fvg, ifvg: z.ifvg };
  if (retestMap[strat]) {
    const arr = retestMap[strat];
    const trendOkL = strat !== 'fvg_retest' || B.iTrend === 1;
    const trendOkS = strat !== 'fvg_retest' || B.iTrend === -1;
    if (trendOkL) { const sl = zoneRetestLong(arr, B, O); if (sl != null) { rawLong = true; slLongRaw = sl; } }
    if (trendOkS) { const sl = zoneRetestShort(arr, B, O); if (sl != null) { rawShort = true; slShortRaw = sl; } }
  }

  // ── Likidite Sweep Dönüşü ──
  if (strat === 'sweep_reversal') {
    if (B.sellSweepEvt) { S.swpArmLBar = B.i; S.swpArmLsl = B.lastSellSweepExt; }
    if (B.buySweepEvt) { S.swpArmSBar = B.i; S.swpArmSsl = B.lastBuySweepExt; }
    if (O.swpReqMss) {
      if (B.i - S.swpArmLBar <= O.entryValidBars && B.iEv.brkUp) { rawLong = true; slLongRaw = S.swpArmLsl; S.swpArmLBar = -1e9; }
      if (B.i - S.swpArmSBar <= O.entryValidBars && B.iEv.brkDn) { rawShort = true; slShortRaw = S.swpArmSsl; S.swpArmSBar = -1e9; }
    } else {
      if (B.sellSweepEvt) { rawLong = true; slLongRaw = B.lastSellSweepExt; }
      if (B.buySweepEvt) { rawShort = true; slShortRaw = B.lastBuySweepExt; }
    }
  }

  // ── Likidite Grab Dönüşü ──
  if (strat === 'grab_reversal') {
    if (B.bullGrabEvt) { rawLong = true; slLongRaw = B.low; }
    if (B.bearGrabEvt) { rawShort = true; slShortRaw = B.high; }
  }

  // ── CISD Dönüşü ──
  if (strat === 'cisd') {
    if (B.cisdBullTrig) { rawLong = true; slLongRaw = B.cisdBullSLevt; }
    if (B.cisdBearTrig) { rawShort = true; slShortRaw = B.cisdBearSLevt; }
  }

  // ── BOS Devam (trend takibi) ──
  if (strat === 'bos_continuation') {
    if (B.sEv.brkUp && !B.sEv.chU) S.bosArmLBar = B.i;
    if (B.sEv.brkDn && !B.sEv.chD) S.bosArmSBar = B.i;
    if (B.i - S.bosArmLBar <= O.entryValidBars && B.swTrend === 1 && B.low <= B.eqLvl && B.close > B.open) {
      rawLong = true; slLongRaw = B.trailD; S.bosArmLBar = -1e9;
    }
    if (B.i - S.bosArmSBar <= O.entryValidBars && B.swTrend === -1 && B.high >= B.eqLvl && B.close < B.open) {
      rawShort = true; slShortRaw = B.trailU; S.bosArmSBar = -1e9;
    }
  }

  // ── CHoCH / CHoCH+ Dönüşü ──
  if (strat === 'choch' || strat === 'choch_plus') {
    const up = strat === 'choch_plus' ? B.iEv.chPU : B.iEv.chU;
    const dn = strat === 'choch_plus' ? B.iEv.chPD : B.iEv.chD;
    if (!O.chochRetest) {
      if (up) { rawLong = true; slLongRaw = B.iTrailD; }
      if (dn) { rawShort = true; slShortRaw = B.iTrailU; }
    } else {
      if (up) { S.chRetLvlL = B.iBrokenH; S.chRetBarL = B.i; S.chRetSLl = B.iTrailD; }
      if (dn) { S.chRetLvlS = B.iBrokenL; S.chRetBarS = B.i; S.chRetSLs = B.iTrailU; }
      if (Number.isFinite(S.chRetLvlL) && B.i - S.chRetBarL <= O.entryValidBars && B.i > S.chRetBarL && B.low <= S.chRetLvlL && B.close > S.chRetLvlL) {
        rawLong = true; slLongRaw = S.chRetSLl; S.chRetLvlL = NaN;
      }
      if (Number.isFinite(S.chRetLvlS) && B.i - S.chRetBarS <= O.entryValidBars && B.i > S.chRetBarS && B.high >= S.chRetLvlS && B.close < S.chRetLvlS) {
        rawShort = true; slShortRaw = S.chRetSLs; S.chRetLvlS = NaN;
      }
    }
  }

  // ── OTE ──
  if (strat === 'ote') {
    const legOkL = B.swTrend === 1 && B.rngPD > 0;
    const legOkS = B.swTrend === -1 && B.rngPD > 0;
    if (legOkL && B.low <= B.oteTopL && B.close >= B.oteBotL && B.close > B.open && B.close > B.prevClose) {
      rawLong = true; slLongRaw = B.trailD; tpLongO = B.trailU + 0.5 * B.rngPD;
    }
    if (legOkS && B.high >= B.oteBotS && B.close <= B.oteTopS && B.close < B.open && B.close < B.prevClose) {
      rawShort = true; slShortRaw = B.trailU; tpShortO = B.trailD - 0.5 * B.rngPD;
    }
  }

  // ── SMT Divergence (korele sembol yoksa motor smt event üretmez → pasif) ──
  if (strat === 'smt') {
    if (B.smtBullEvt) { rawLong = true; slLongRaw = B.smtLoPx; }
    if (B.smtBearEvt) { rawShort = true; slShortRaw = B.smtHiPx; }
  }

  // ── Klasik: Breakout ──
  if (strat === 'breakout') {
    const volOK = !O.volFilterOn || !Number.isFinite(B.volSma) || B.vol > B.volSma * O.volMult;
    if (B.close > B.donHiPrev && B.closePrev <= B.donHiPrev2 && volOK) { rawLong = true; slLongRaw = (B.donHiPrev + B.donLoPrev) / 2; }
    if (B.close < B.donLoPrev && B.closePrev >= B.donLoPrev2 && volOK) { rawShort = true; slShortRaw = (B.donHiPrev + B.donLoPrev) / 2; }
  }

  // ── Klasik: Pullback (EMA) ──
  if (strat === 'pullback') {
    const trUp = B.emaF > B.emaS && B.adx > O.adxTh;
    const trDn = B.emaF < B.emaS && B.adx > O.adxTh;
    if (trUp && B.low <= B.emaP && B.close > B.emaP && B.close > B.open) { rawLong = true; slLongRaw = B.lo5; }
    if (trDn && B.high >= B.emaP && B.close < B.emaP && B.close < B.open) { rawShort = true; slShortRaw = B.hi5; }
  }

  // ── Klasik: Range (RSI) ──
  if (strat === 'range') {
    const rH = B.rngHiC, rL = B.rngLoC, rW = rH - rL;
    const ranging = B.adx < O.adxRangeTh && rW > 0;
    if (ranging && B.low <= rL + 0.2 * rW && B.rsiPrev < O.rsiOS && B.rsi > B.rsiPrev && B.close > B.open) { rawLong = true; slLongRaw = rL; tpLongO = rH; }
    if (ranging && B.high >= rH - 0.2 * rW && B.rsiPrev > O.rsiOB && B.rsi < B.rsiPrev && B.close < B.open) { rawShort = true; slShortRaw = rH; tpShortO = rL; }
  }

  // ── Klasik: Momentum ──
  if (strat === 'momentum') {
    if (B.rsiX50up && B.macdHist > 0 && B.macdHist > B.macdHistPrev && B.adx > O.adxTh) rawLong = true;
    if (B.rsiX50dn && B.macdHist < 0 && B.macdHist < B.macdHistPrev && B.adx > O.adxTh) rawShort = true;
  }

  // ── Klasik: Scalp (EMA ribbon) ──
  if (strat === 'scalp') {
    const stackUp = B.e5 > B.e8 && B.e8 > B.e13;
    const stackDn = B.e5 < B.e8 && B.e8 < B.e13;
    const sesOk = !O.scalpKzOnly || B.inAnyKZ;
    if (stackUp && B.low <= B.e8 && B.close > B.e5 && B.close > B.open && sesOk) { rawLong = true; slLongRaw = B.e13; }
    if (stackDn && B.high >= B.e8 && B.close < B.e5 && B.close < B.open && sesOk) { rawShort = true; slShortRaw = B.e13; }
  }

  // ── Premium/Discount + FVG (kullanıcı isteği) ──
  // DISCOUNT (EQ altı, ucuz) → sadece LONG (boğa FVG retesti).
  // PREMIUM (EQ üstü, pahalı) → sadece SHORT (ayı FVG retesti).
  if (strat === 'pd_fvg') {
    if (B.inDisc) { const sl = zoneRetestLong(z.fvg, B, O); if (sl != null) { rawLong = true; slLongRaw = sl; } }
    if (B.inPrem) { const sl = zoneRetestShort(z.fvg, B, O); if (sl != null) { rawShort = true; slShortRaw = sl; } }
  }

  // ── Global filtreler (Pine longFiltOK/shortFiltOK) ──
  const dirOKL = O.dirInput !== 'short';
  const dirOKS = O.dirInput !== 'long';
  const sessOK = !O.kzOnly || B.inAnyKZ;
  const biasOKL = !O.biasEnable || B.htfBias >= 0;
  const biasOKS = !O.biasEnable || B.htfBias <= 0;
  const pdOKL = !O.pdFilter || B.inDisc;
  const pdOKS = !O.pdFilter || B.inPrem;
  const sigLong = rawLong && dirOKL && sessOK && biasOKL && pdOKL;
  const sigShort = rawShort && dirOKS && sessOK && biasOKS && pdOKS;

  // cooldown + günlük limit
  if (B.session && B.session.dateKey !== S.lastDateKey) { S.tradesToday = 0; S.lastDateKey = B.session.dateKey; }
  const coolOK = B.i - S.lastSigBar >= (O.cooldownBars || 0);
  const dayOK = !O.maxPerDay || S.tradesToday < O.maxPerDay;

  if ((sigLong || sigShort) && coolOK && dayOK) {
    S.lastSigBar = B.i; S.tradesToday += 1;
    const side = sigLong ? 'long' : 'short';
    return {
      i: B.i, time: B.time, side, entry: B.close,
      slRaw: side === 'long' ? slLongRaw : slShortRaw,
      tpOverride: side === 'long' ? tpLongO : tpShortO,
      strategy: strat, mode: 'market',
    };
  }
  return null;
}

module.exports = { newStratState, stepStrategy, STRATS };
