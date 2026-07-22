/**
 * forexLevels — Giriş/SL/TP seviyeleri (TF'ye göre ATR çarpanlı), MetaTrader5
 * emir bloğu ve muhtemel kazanç/kayıp ($). Giriş = canlı fiyat (market emri);
 * SL/TP TF'ye göre ATR ile ölçeklenir (düşük TF dar, yüksek TF geniş).
 */
const { atr } = require('./indicators');

// TF → ATR çarpanları (gün-içi → swing genişler)
// R:R DÜZELTMESİ (2026-07-21): eski TP1/SL ≈ 1.33-1.56 → başabaş %39-43 isabet
// gerekiyordu, ölçülen %44-45 ile kenar spread+komisyona gidiyordu (netR -9.4).
// Yeni tablo TP1'i ≥1.85R yapar.
const TF_MULT = {
  '5m':  { sl: 1.3, tp1: 2.4, tp2: 4.0 },
  '15m': { sl: 1.4, tp1: 2.6, tp2: 4.4 },
  '1h':  { sl: 1.6, tp1: 3.0, tp2: 5.2 },
  '4h':  { sl: 1.9, tp1: 3.6, tp2: 6.0 },
  '1d':  { sl: 2.3, tp1: 4.4, tp2: 7.2 },
};
// KURUŞ İŞLEM ENGELİ (2026-07-21): 0.0006 (%0.06) → EURUSD 5m'de ~7 pip stop →
// 0.05 lotta 2-4$ K/Z; komisyon kenarı yiyordu. 0.0018 (%0.18) anlamlı taban kurar.
const MIN_ATR_FRAC = 0.0018; // çok küçük ATR'de stop tabanı (R/R korunur)

// id → MetaTrader5 sembolü (yaygın broker adlandırması)
const MT5_SYMBOL = {
  BTCUSD: 'BTCUSD', ETHUSD: 'ETHUSD', XRPUSD: 'XRPUSD', SOLUSD: 'SOLUSD', DOGEUSD: 'DOGEUSD',
  XAUUSD: 'XAUUSD', XAGUSD: 'XAGUSD', EURUSD: 'EURUSD', NAS100: 'US100', SPX500: 'US500',
};

function tradeHorizon(tf) {
  if (tf === '5m' || tf === '15m') return 'SCALP/GÜN-İÇİ';
  if (tf === '1h' || tf === '4h') return 'GÜN-İÇİ/SWING';
  return 'SWING';
}

function buildLevels(direction, entry, atrVal, tf, precision = 4) {
  if (!(entry > 0) || !(atrVal > 0)) return null;
  const eff = Math.max(atrVal, entry * MIN_ATR_FRAC);
  const m = TF_MULT[tf] || TF_MULT['1h'];
  const r = (v) => +v.toFixed(precision);
  let sl, tp1, tp2;
  if (direction === 'long') {
    sl = r(entry - m.sl * eff); tp1 = r(entry + m.tp1 * eff); tp2 = r(entry + m.tp2 * eff);
  } else {
    sl = r(entry + m.sl * eff); tp1 = r(entry - m.tp1 * eff); tp2 = r(entry - m.tp2 * eff);
  }
  const risk = Math.abs(entry - sl);
  return {
    entry: r(entry), stop: sl, target1: tp1, target2: tp2,
    rr1: risk > 0 ? +(Math.abs(tp1 - entry) / risk).toFixed(2) : null,
    rr2: risk > 0 ? +(Math.abs(tp2 - entry) / risk).toFixed(2) : null,
    atr: +atrVal.toFixed(precision), basis: 'atr',  // temiz forex = yalnız ATR (proLevels uyumu için etiket)
  };
}

// Muhtemel kazanç/kayıp ($) — units USD bazlı varlık miktarı (lot×contractSize)
function buildPnL(units, entry, levels) {
  if (!units || !levels) return null;
  return {
    slLossUsd: +(units * Math.abs(entry - levels.stop)).toFixed(2),
    tp1ProfitUsd: +(units * Math.abs(levels.target1 - entry)).toFixed(2),
    tp2ProfitUsd: +(units * Math.abs(levels.target2 - entry)).toFixed(2),
  };
}

// MetaTrader5 emir bloğu + kopyalanabilir özet
function buildMt5(instrument, direction, lots, levels, tf, precision = 4) {
  const symbol = MT5_SYMBOL[instrument.id] || instrument.id;
  const type = direction === 'long' ? 'BUY' : 'SELL';
  const fmt = (v) => v == null ? '-' : Number(v).toFixed(precision);
  const order = {
    symbol, type, volume: lots,
    entry: 'MARKET',
    price: levels.entry, sl: levels.stop, tp: levels.target1, tp2: levels.target2,
    comment: `BorsaKrali ${tf}`,
  };
  order.summary = `${type} ${symbol} @PİYASA · SL ${fmt(levels.stop)} · TP1 ${fmt(levels.target1)} · TP2 ${fmt(levels.target2)}`;
  return order;
}

module.exports = { buildLevels, buildPnL, buildMt5, tradeHorizon, TF_MULT, MT5_SYMBOL, atrOf: atr };
