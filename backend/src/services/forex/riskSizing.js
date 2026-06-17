/**
 * Risk & Lot Hesabı — Forex/Parite (Borsa Krali)
 *
 * Kullanıcı kuralı (kesin):
 *   • Portföy = 10.000 USD, kaldıraç = 1:100
 *   • HİÇBİR işlem tek başına günlük %5 veya toplam %10 zarar ÜRETEMEZ.
 *   • Her işlem bu kurala uygun şekilde boyutlandırılır ("sadece lot boyutu"
 *     yaklaşımı — ayrı portföy kill-switch'i yok; güvence işlem başına garanti).
 *
 * Yöntem: stop mesafesi sabit, lot bundan türetilir. Hedef risk = portföyün
 * RISK_PER_TRADE_PCT'i (varsayılan %2 — günlük %5 / toplam %10 limitlerinin
 * rahatça altında). Hesaplanan risk üst sınırları aşamaz; ayrıca kaldıraç
 * (notional ≤ 100×equity) ve marj kullanımı tavanı ile kısılır.
 *
 * Dönen alanlar broker bağımsız "gösterge" değerlerdir; contractSize
 * enstrümana göre (forex 100k, altın 100oz, gümüş 5000oz, endeks/kripto 1).
 */

const DEFAULTS = {
  equity: 10000,            // USD portföy
  leverage: 100,            // 1:100
  riskPerTradePct: 0.02,    // hedef: işlem başına %2
  dailyMaxLossPct: 0.05,    // KURAL: günlük tek-işlem üst sınırı %5
  totalMaxLossPct: 0.10,    // KURAL: toplam tek-işlem üst sınırı %10
  marginCapPct: 0.50,       // tek işlemde kullanılacak marj ≤ equity'nin %50'si
  minStopFracOfPrice: 0.0002, // savunma tabanı (skorer zaten %0.07+ stop üretir)
};

function round(n, d = 2) {
  if (n == null || !isFinite(n)) return null;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

// Lot ondalığı — büyük contractSize'da daha hassas (forex 100k → 0.01 lot anlamlı)
function lotDecimals(contractSize) {
  if (contractSize >= 100000) return 2;
  if (contractSize >= 100) return 2;
  return 3;
}

/**
 * @param {Object} p
 * @param {Object} p.instrument  forexInstruments kaydı (contractSize, unitLabel...)
 * @param {number} p.entry       giriş fiyatı
 * @param {number} p.stop        stop fiyatı
 * @param {string} p.direction   'long' | 'short'
 * @param {Object} [opts]        DEFAULTS üzerine yazılır
 */
function computeSizing({ instrument, entry, stop, direction }, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  if (!instrument || !(entry > 0) || !(stop > 0)) return null;

  const contractSize = instrument.contractSize || 1;

  // Stop mesafesi — uçuk lot'a karşı taban uygulanır
  const floor = entry * cfg.minStopFracOfPrice;
  const stopDistance = Math.max(Math.abs(entry - stop), floor);
  const stopDistancePct = (stopDistance / entry) * 100;

  // 1) Hedef risk (USD) — kural üst sınırlarıyla kıskaçlanır (≤ %5 günlük)
  const ruleCapPct = Math.min(cfg.dailyMaxLossPct, cfg.totalMaxLossPct); // = %5
  const targetRiskPct = Math.min(cfg.riskPerTradePct, ruleCapPct);
  let riskUsd = cfg.equity * targetRiskPct;

  // 2) Birim (pozisyon büyüklüğü) = risk / stop mesafesi
  let units = riskUsd / stopDistance;

  // 3) Kaldıraç tavanı — notional ≤ equity × leverage
  const maxNotional = cfg.equity * cfg.leverage;
  if (units * entry > maxNotional) units = maxNotional / entry;

  // 4) Marj tavanı — kullanılan marj ≤ equity × marginCapPct
  const marginCapUsd = cfg.equity * cfg.marginCapPct;
  const maxUnitsByMargin = (marginCapUsd * cfg.leverage) / entry;
  if (units > maxUnitsByMargin) units = maxUnitsByMargin;

  if (!(units > 0)) return null;

  // Kıskaç sonrası gerçek değerler
  const notional = units * entry;
  const requiredMargin = notional / cfg.leverage;
  const maxLossUsd = units * stopDistance;       // stop'a değerse kayıp
  const maxLossPct = (maxLossUsd / cfg.equity) * 100;
  const lots = units / contractSize;

  return {
    direction,
    equity: cfg.equity,
    leverage: cfg.leverage,
    // Lot & büyüklük
    lots: round(lots, lotDecimals(contractSize)),
    units: round(units, contractSize >= 100 ? 0 : 4),
    unitLabel: instrument.unitLabel,
    contractSize,
    notionalUsd: round(notional, 2),
    requiredMarginUsd: round(requiredMargin, 2),
    marginPct: round((requiredMargin / cfg.equity) * 100, 2),
    // Risk
    stopDistance: round(stopDistance, 8),
    stopDistancePct: round(stopDistancePct, 3),
    riskUsd: round(maxLossUsd, 2),
    riskPct: round(maxLossPct, 2),
    // Kural uyum bayrakları (inşa gereği daima true)
    withinDailyRule: maxLossPct <= cfg.dailyMaxLossPct * 100 + 1e-6,
    withinTotalRule: maxLossPct <= cfg.totalMaxLossPct * 100 + 1e-6,
    rule: { dailyMaxLossPct: cfg.dailyMaxLossPct * 100, totalMaxLossPct: cfg.totalMaxLossPct * 100 },
  };
}

module.exports = { computeSizing, DEFAULTS };
