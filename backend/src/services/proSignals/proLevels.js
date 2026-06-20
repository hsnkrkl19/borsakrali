/**
 * YENİ ROBOT · Seviyeler — eski forexLevels/forexFib'i AYNEN kullanır
 * (yeniden hesap YOK). Tek fark KALİTE KAPISI: net Fibonacci/ATR seviyeleri
 * üretildikten sonra R/R1 < MIN_RR olan kurulumlar DÜŞÜRÜLÜR (null) — eski
 * forex'te rr1 sadece tabanlanıyordu; burada "az ama net" için elenir.
 *
 * Mum formatı: { time, open, high, low, close, volume } (eski→yeni).
 */

const forexLevels = require('../forex/forexLevels');

// Kullanıcı isteği: net/tutarlı sinyal → ödül/risk tabanı. Altı elenir.
// 1.5 seçildi: yüksek-TF ATR fallback'leri (4h≈1.56, 1d≈1.55) geçer, zayıf
// kurulumlar elenir. 1.6 yapılırsa TÜM ATR fallback'leri elenir → "sinyal
// gelmiyor" tuzağı (forex v6.3 dersi). Asıl "net" kapısı: 3/4 TF konfluans +
// güven eşiği + backtest kalite kapısı. Env ile ayarlanabilir.
const MIN_RR = Number(process.env.PRO_MIN_RR) || 1.5;

// candles → fib (yoksa ATR) seviyeleri + kalite kapısı.
// rr1 < MIN_RR ise null döner (sinyal üretilmez).
function buildLevels(direction, entry, atrVal, tf, precision = 4, candles = null) {
  const lv = forexLevels.buildLevels(direction, entry, atrVal, tf, precision, candles);
  if (!lv) return null;
  if (lv.rr1 == null || lv.rr1 < MIN_RR) return null;
  return lv;
}

// Kapısız ham seviyeler (backtest forward-eval gibi yerlerde elemeden seviye
// gerektiğinde) — yine de fib/ATR mantığı aynı.
function buildLevelsRaw(direction, entry, atrVal, tf, precision = 4, candles = null) {
  return forexLevels.buildLevels(direction, entry, atrVal, tf, precision, candles);
}

module.exports = {
  buildLevels,
  buildLevelsRaw,
  buildPnL: forexLevels.buildPnL,
  buildMt5: forexLevels.buildMt5,
  tradeHorizon: forexLevels.tradeHorizon,
  MIN_RR,
};
