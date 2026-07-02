/**
 * mt5Levels — GÜN-İÇİ giriş/SL/TP seviyeleri + lot yuvarlama + MT5 emri.
 *
 * Forex'ten farklar (kullanıcı kuralları):
 *   • Tüm işlemler daytrade: TP/SL gün içinde ULAŞILABİLİR olmalı → TF ATR
 *     çarpanları dar tutulur; ayrıca TP1 mesafesi günlük ATR'nin %90'ını aşarsa
 *     tüm seviyeler orantılı daraltılır (R/R korunur).
 *   • İsabet önceliği (kullanıcı tercihi): TP1 R/R ≈ 1.0-1.1 (yakın kâr-al),
 *     TP2 koşturan bacak.
 *   • Lot MT5 broker adımına yuvarlanır (0.01 step, AŞAĞI — risk hedefi asla
 *     aşılmaz); risk/marj/kâr-zarar YUVARLANMIŞ lottan yeniden hesaplanır ki
 *     mesajdaki her sayı MT5'te açılacak gerçek pozisyonla birebir olsun.
 */

const { MT5_SYMBOL } = require('../forex/forexLevels');

// Gün-içi ATR çarpanları — TP1 yakın (isabet), TP2 koşturan.
// 4h/1d yönü güçlü ama seviyeler gün-içi ölçekte: kendi ATR'lerinin küçük katı.
const TF_MULT = {
  '5m':  { sl: 1.2, tp1: 1.3, tp2: 2.2 },
  '15m': { sl: 1.3, tp1: 1.4, tp2: 2.4 },
  '1h':  { sl: 1.4, tp1: 1.5, tp2: 2.6 },
  '4h':  { sl: 1.0, tp1: 1.1, tp2: 1.9 },
  '1d':  { sl: 0.5, tp1: 0.55, tp2: 0.95 },
};
const MIN_ATR_FRAC = 0.0006;      // uçuk dar stop'a karşı taban
const DAY_ATR_TP1_CAP = 0.90;     // TP1 mesafesi ≤ günlük ATR × bu oran (gün-içi ulaşılabilirlik)

function tradeHorizon() { return 'GÜN-İÇİ'; }

/**
 * Seviyeler. dailyAtr verilirse gün-içi ulaşılabilirlik kıskacı uygulanır.
 */
function buildLevels(direction, entry, atrVal, tf, precision = 4, dailyAtr = null) {
  if (!(entry > 0) || !(atrVal > 0)) return null;
  const eff = Math.max(atrVal, entry * MIN_ATR_FRAC);
  const m = TF_MULT[tf] || TF_MULT['1h'];
  let slDist = m.sl * eff, tp1Dist = m.tp1 * eff, tp2Dist = m.tp2 * eff;

  // Gün-içi kıskaç: TP1 bir günlük tipik hareketin %90'ından uzaksa hepsini
  // orantılı daralt (R/R bozulmaz, hedef gün içinde ulaşılabilir kalır).
  if (dailyAtr > 0 && tp1Dist > DAY_ATR_TP1_CAP * dailyAtr) {
    const k = (DAY_ATR_TP1_CAP * dailyAtr) / tp1Dist;
    slDist *= k; tp1Dist *= k; tp2Dist *= k;
  }

  const r = (v) => +v.toFixed(precision);
  let sl, tp1, tp2;
  if (direction === 'long') {
    sl = r(entry - slDist); tp1 = r(entry + tp1Dist); tp2 = r(entry + tp2Dist);
  } else {
    sl = r(entry + slDist); tp1 = r(entry - tp1Dist); tp2 = r(entry - tp2Dist);
  }
  const risk = Math.abs(entry - sl);
  if (!(risk > 0)) return null;
  return {
    entry: r(entry), stop: sl, target1: tp1, target2: tp2,
    rr1: +(Math.abs(tp1 - entry) / risk).toFixed(2),
    rr2: +(Math.abs(tp2 - entry) / risk).toFixed(2),
    atr: +atrVal.toFixed(precision), basis: 'atr-intraday',
  };
}

/**
 * riskSizing.computeSizing sonucunu MT5 broker lot adımına oturt:
 * AŞAĞI yuvarla (risk hedefi aşılmasın); volumeMin altına düşerse volumeMin
 * denenir AMA volumeMin riski kural tavanını (maxRiskUsd) aşarsa null (işlem yok).
 * Tüm $ değerleri yuvarlanmış lottan yeniden hesaplanır.
 */
function snapSizingToBroker(sizing, instrument, entry, stop, { maxRiskUsd } = {}) {
  if (!sizing || !instrument) return null;
  const step = instrument.volumeStep || 0.01;
  const vmin = instrument.volumeMin || 0.01;
  const vmax = instrument.volumeMax || 100;
  const cs = instrument.contractSize || 1;
  const stopDist = Math.abs(entry - stop);
  if (!(stopDist > 0)) return null;

  // Ham lot, computeSizing'in YUVARLANMIŞ lots/units alanından DEĞİL gerçek
  // riskten türetilir (round-half-up 0.0368→0.04 yapıp riski hedefin ÜSTÜNE
  // taşıyordu): riskUsd = kıskaç sonrası gerçek risk → units = risk/stopDist.
  const rawLots = (sizing.riskUsd > 0)
    ? sizing.riskUsd / stopDist / cs
    : (sizing.lots || 0);
  let lots = Math.floor(rawLots / step + 1e-9) * step;
  lots = Math.min(lots, vmax);
  if (lots < vmin) {
    // Hesap küçük / stop geniş: brokerin asgari lotu hedef riski aşıyor.
    // Asgari lotun riski kural tavanına sığıyorsa asgariyle işlem ver; sığmıyorsa verme.
    const minRisk = vmin * cs * stopDist;
    if (maxRiskUsd != null && minRisk > maxRiskUsd) return null;
    lots = vmin;
  }
  lots = +lots.toFixed(2);

  const units = lots * cs;
  const notional = units * entry;
  const leverage = sizing.leverage || 100;
  const equity = sizing.equity;
  const requiredMargin = notional / leverage;
  const riskUsd = units * stopDist;
  return {
    ...sizing,
    lots, units: +units.toFixed(cs >= 100 ? 0 : 4),
    volumeMin: vmin, volumeStep: step,
    notionalUsd: +notional.toFixed(2),
    requiredMarginUsd: +requiredMargin.toFixed(2),
    marginPct: equity > 0 ? +((requiredMargin / equity) * 100).toFixed(2) : null,
    riskUsd: +riskUsd.toFixed(2),
    riskPct: equity > 0 ? +((riskUsd / equity) * 100).toFixed(2) : null,
  };
}

// Muhtemel kazanç/kayıp ($) — YUVARLANMIŞ units ile
function buildPnL(units, entry, levels) {
  if (!units || !levels) return null;
  return {
    slLossUsd: +(units * Math.abs(entry - levels.stop)).toFixed(2),
    tp1ProfitUsd: +(units * Math.abs(levels.target1 - entry)).toFixed(2),
    tp2ProfitUsd: +(units * Math.abs(levels.target2 - entry)).toFixed(2),
  };
}

// MT5 emir bloğu — MUTLAK seviyeler (Telegram = MT5, Invalid stops dersi)
function buildMt5(instrument, direction, lots, levels, tf, precision = 4) {
  const symbol = MT5_SYMBOL[instrument.id] || instrument.id;
  const type = direction === 'long' ? 'BUY' : 'SELL';
  const fmt = (v) => (v == null ? '-' : Number(v).toFixed(precision));
  const order = {
    symbol, type, volume: lots,
    entry: 'MARKET',
    price: levels.entry, sl: levels.stop, tp: levels.target1, tp2: levels.target2,
    comment: `BK-MT5 ${tf}`,
  };
  order.summary = `${type} ${symbol} ${lots} lot @PİYASA · SL ${fmt(levels.stop)} · TP1 ${fmt(levels.target1)} · TP2 ${fmt(levels.target2)}`;
  return order;
}

module.exports = { buildLevels, snapSizingToBroker, buildPnL, buildMt5, tradeHorizon, TF_MULT, DAY_ATR_TP1_CAP };
