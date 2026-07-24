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
const { LOT_HARD_MAX } = require('../lotLimits');

// Gün-içi ATR çarpanları — TP1 yakın (isabet), TP2 koşturan.
// 4h/1d yönü güçlü ama seviyeler gün-içi ölçekte: kendi ATR'lerinin küçük katı.
// R:R DÜZELTMESİ (2026-07-21): eski değerler TP1/SL ≈ 1.08 veriyordu → başabaş için
// %48 isabet gerekiyordu, ölçülen %44 → YAPISAL ZARAR (1025 işlem, netR -45).
// Yeni tablo TP1'i ≥1.85R yapar: %35 isabetle bile pozitif beklenti.
const TF_MULT = {
  '5m':  { sl: 1.4, tp1: 2.6, tp2: 4.2 },
  '15m': { sl: 1.5, tp1: 2.8, tp2: 4.6 },
  '1h':  { sl: 1.6, tp1: 3.0, tp2: 5.0 },
  '4h':  { sl: 1.8, tp1: 3.4, tp2: 5.6 },
  '1d':  { sl: 2.0, tp1: 3.8, tp2: 6.2 },
};
// KURUŞ İŞLEM ENGELİ (2026-07-21): 0.0006 = fiyatın %0.06'sı → EURUSD'de ~7 pip
// taban, ×1.2 = 8 pip stop → 0.05 lotta ~2-3$ K/Z. Komisyon bunu yiyordu.
// 0.0018 (%0.18) → EURUSD ~20 pip taban, ×1.6 = 32 pip stop → anlamlı mesafe.
const MIN_ATR_FRAC = 0.0018;
// 0.90 kıskacı TP1'i günlük ATR'ın altına eziyor, R:R'yi bozuyordu. 1.70 yalnız
// gerçekten absürt hedefleri kırpar.
const DAY_ATR_TP1_CAP = 1.70;

function tradeHorizon() { return 'GÜN-İÇİ'; }

/**
 * Seviyeler. dailyAtr verilirse gün-içi ulaşılabilirlik kıskacı uygulanır.
 */
function buildLevels(direction, entry, atrVal, tf, precision = 4, dailyAtr = null, candles = null) {
  if (!(entry > 0) || !(atrVal > 0)) return null;
  // ① FİBO-YAPISAL SEVİYELER (ampirik kazanan, 1319 örnekte doğrulandı):
  //    stop = swing ucunun ötesi, TP = ≥1.3R veren ilk fibo uzantısı.
  //    Geçerli swing yapısı yoksa null döner → ② ATR tablosuna düşülür.
  if (Array.isArray(candles) && candles.length >= 60) {
    try {
      const fx = require('../forex/forexFib').tradeLevels(direction, candles, entry, Math.max(atrVal, entry * MIN_ATR_FRAC), precision);
      if (fx && fx.rr1 >= 1.2) return { ...fx, basis: 'fib-struct', atr: +atrVal.toFixed(precision) };
    } catch (_) { /* fib başarısız → ATR'ye düş */ }
  }
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
  // SERT LOT TAVANI (2026-07-24, kullanıcı: "tüm botların lotu 0.01–0.15").
  // Tarayıcı zincirinde lot OTORİTESİ backend'dir — köprü feed'deki lotu aynen
  // kullanır (mt5Scanner.routes.js /positions → snap_lot). Tavan burada da
  // uygulanmazsa Telegram'da yazan lot ile MT5'te açılan lot AYRIŞIR.
  lots = Math.min(lots, vmax, LOT_HARD_MAX);
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
