/**
 * Custom Bots — Stop-Loss / Take-Profit kuralları
 *
 * Kullanıcı bot oluştururken "stop ve TP noktaları neye göre belirlensin"i seçer.
 * Bu modül o seçimi somut fiyatlara çevirir ve doğrular. Tümü LONG (BIST botları
 * sadece alış yapar) varsayar: stop < giriş < hedef.
 *
 * Stop tipleri:
 *   atr     → giriş − stopValue × ATR
 *   percent → giriş × (1 − stopValue/100)
 *   none    → stop yok (yalnızca strateji-çıkışı / timeout ile kapanır)
 *
 * Hedef tipleri:
 *   rr      → giriş + targetValue × (giriş − stop)   [stop ZORUNLU]
 *   percent → giriş × (1 + targetValue/100)
 *   atr     → giriş + targetValue × ATR
 *   none    → hedef yok
 */

const STOP_TYPES = ['atr', 'percent', 'none'];
const TARGET_TYPES = ['rr', 'percent', 'atr', 'none'];

const DEFAULT_RISK = {
  stopType: 'atr',     stopValue: 2,
  targetType: 'rr',    targetValue: 2,
  trailing: true,
  timeoutDays: 15,     // 0 = zaman aşımı yok
};

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

/**
 * Bir risk yapılandırmasını normalize eder + doğrular.
 * @returns {{ ok:boolean, risk?:object, errors?:string[] }}
 */
function validateRisk(input = {}) {
  const errors = [];
  const r = { ...DEFAULT_RISK, ...(input || {}) };

  if (!STOP_TYPES.includes(r.stopType)) errors.push(`Geçersiz stop tipi: ${r.stopType}`);
  if (!TARGET_TYPES.includes(r.targetType)) errors.push(`Geçersiz hedef tipi: ${r.targetType}`);

  r.stopValue = Number(r.stopValue);
  r.targetValue = Number(r.targetValue);
  r.timeoutDays = Math.round(Number(r.timeoutDays));
  r.trailing = !!r.trailing;

  if (r.stopType !== 'none') {
    if (!isNum(r.stopValue) || r.stopValue <= 0) errors.push('Stop değeri 0’dan büyük olmalı.');
    if (r.stopType === 'percent' && r.stopValue >= 100) errors.push('Yüzde stop 100’den küçük olmalı.');
    if (r.stopType === 'atr' && r.stopValue > 20) errors.push('ATR stop çarpanı en fazla 20 olabilir.');
  }
  if (r.targetType !== 'none') {
    if (!isNum(r.targetValue) || r.targetValue <= 0) errors.push('Hedef değeri 0’dan büyük olmalı.');
    if (r.targetType === 'rr' && r.stopType === 'none') {
      errors.push('R-katı hedef için bir stop tanımlanmalı.');
    }
    if (r.targetType === 'percent' && r.targetValue > 1000) errors.push('Yüzde hedef çok büyük.');
  }
  if (!isNum(r.timeoutDays) || r.timeoutDays < 0 || r.timeoutDays > 250) {
    errors.push('Zaman aşımı 0–250 işgünü arası olmalı.');
  }
  // Trailing yalnızca stop varsa anlamlı
  if (r.trailing && r.stopType === 'none') r.trailing = false;

  if (errors.length) return { ok: false, errors };
  return { ok: true, risk: r };
}

/**
 * Giriş fiyatı + ATR + risk yapılandırmasından stop/hedef fiyatlarını üretir.
 * Geçersiz (stop ≥ giriş ya da hedef ≤ giriş) sonuçlar null'a indirilir; bot
 * o seviyeyi uygulamaz (sahte stop/hedef oluşmaz).
 *
 * @returns {{ stop:number|null, target:number|null }}
 */
function computeStopTarget(entryPrice, atrValue, risk) {
  const r = { ...DEFAULT_RISK, ...(risk || {}) };
  const atr = isNum(atrValue) && atrValue > 0 ? atrValue : null;

  // ── Stop ──
  let stop = null;
  if (r.stopType === 'atr' && atr) stop = entryPrice - r.stopValue * atr;
  else if (r.stopType === 'percent') stop = entryPrice * (1 - r.stopValue / 100);
  // ATR seçiliyken ATR yoksa stop hesaplanamaz → null (güvenli taraf)

  if (stop != null && !(stop > 0 && stop < entryPrice)) stop = null;

  // ── Hedef ──
  let target = null;
  if (r.targetType === 'rr' && stop != null) target = entryPrice + r.targetValue * (entryPrice - stop);
  else if (r.targetType === 'percent') target = entryPrice * (1 + r.targetValue / 100);
  else if (r.targetType === 'atr' && atr) target = entryPrice + r.targetValue * atr;

  if (target != null && !(target > entryPrice)) target = null;

  return {
    stop: stop != null ? +stop.toFixed(4) : null,
    target: target != null ? +target.toFixed(4) : null,
  };
}

// İnsan-okur özet (UI/notlar için).
function describe(risk) {
  const r = { ...DEFAULT_RISK, ...(risk || {}) };
  const stopTxt = r.stopType === 'atr' ? `${r.stopValue}× ATR altı`
    : r.stopType === 'percent' ? `%${r.stopValue} altı`
    : 'yok';
  const tgtTxt = r.targetType === 'rr' ? `${r.targetValue}R (risk katı)`
    : r.targetType === 'percent' ? `%${r.targetValue} üstü`
    : r.targetType === 'atr' ? `${r.targetValue}× ATR üstü`
    : 'yok';
  return { stopTxt, tgtTxt, trailing: r.trailing, timeoutDays: r.timeoutDays };
}

module.exports = {
  STOP_TYPES, TARGET_TYPES, DEFAULT_RISK,
  validateRisk, computeStopTarget, describe,
};
