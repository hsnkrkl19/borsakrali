/**
 * ALTIN · Destek/Direnç + Fraktal Kırılım — kullanıcı isteği:
 *   "destek direnç yerlerini tespit eden, fraktalları tespit ederek kırılan
 *    destek/direnç bilgisini de veren".
 *
 * Fraktal pivotlar forexFib.pivots ile (sol/sağ K-bar onayı → REPAINT YOK, son
 * `right` bar pivot olamaz → ileri-bakış yok). En yakın destek/direnç + EN SON
 * KIRILAN seviye (fraktal kırılımı) raporlanır. Saf/yan-etkisiz.
 */
const fib = require('../forex/forexFib');

const LEFT = 3, RIGHT = 3;

// candles: {time,open,high,low,close} eski→yeni
function analyze(candles, opts = {}) {
  const left = opts.left || LEFT, right = opts.right || RIGHT;
  if (!candles || candles.length < left + right + 5) return null;
  const { highs, lows } = fib.pivots(candles, left, right);
  const n = candles.length - 1;
  const last = candles[n].close;
  const atr = approxAtr(candles, 14);

  // En yakın direnç (fiyat üstü pivot high) ve destek (fiyat altı pivot low)
  let nearestRes = null, nearestSup = null;
  for (const h of highs) if (h.price > last && (!nearestRes || h.price < nearestRes.price)) nearestRes = h;
  for (const l of lows) if (l.price < last && (!nearestSup || l.price > nearestSup.price)) nearestSup = l;

  // EN SON FRAKTAL KIRILIMI: bir pivotun, oluştuktan SONRAki bir mumla kapanışta aşılması
  // (boğa: direnç kırıldı; ayı: destek kırıldı). En güncel olayı bul.
  const breaks = detectBreaks(candles, highs, lows, right);
  const lastBreak = breaks.length ? breaks[breaks.length - 1] : null;

  const pct = (a, b) => (b ? +(100 * (a - b) / b).toFixed(2) : null);
  return {
    lastClose: +last.toFixed(2),
    atr: atr ? +atr.toFixed(2) : null,
    nearestResistance: nearestRes ? { price: +nearestRes.price.toFixed(2), distPct: pct(nearestRes.price, last), time: nearestRes.time } : null,
    nearestSupport: nearestSup ? { price: +nearestSup.price.toFixed(2), distPct: pct(nearestSup.price, last), time: nearestSup.time } : null,
    resistances: highs.slice(-6).map(h => +h.price.toFixed(2)),
    supports: lows.slice(-6).map(l => +l.price.toFixed(2)),
    recentBreaks: breaks.slice(-4),
    lastBreak,
  };
}

// Fraktal kırılım olayları: pivot oluştuktan sonra kapanışla aşılma
function detectBreaks(candles, highs, lows, right) {
  const events = [];
  const close = candles.map(c => c.close);
  // direnç kırılımı (boğa)
  for (const h of highs) {
    const confirmIdx = h.i + right; // pivot bu bardan sonra onaylanır
    for (let j = confirmIdx + 1; j < candles.length; j++) {
      if (close[j] > h.price) { events.push({ type: 'resistance_broken', dir: 'bull', level: +h.price.toFixed(2), breakIndex: j, breakTime: candles[j].time, pivotTime: h.time }); break; }
    }
  }
  // destek kırılımı (ayı)
  for (const l of lows) {
    const confirmIdx = l.i + right;
    for (let j = confirmIdx + 1; j < candles.length; j++) {
      if (close[j] < l.price) { events.push({ type: 'support_broken', dir: 'bear', level: +l.price.toFixed(2), breakIndex: j, breakTime: candles[j].time, pivotTime: l.time }); break; }
    }
  }
  events.sort((a, b) => a.breakIndex - b.breakIndex);
  return events;
}

function approxAtr(candles, p) {
  if (candles.length < p + 1) return null;
  let s = 0, cnt = 0;
  for (let i = candles.length - p; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1] ? candles[i - 1].close : candles[i].open;
    s += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)); cnt++;
  }
  return cnt ? s / cnt : null;
}

// Yön + S/R onayı: long için en yakın destek yakınında mı / direnç kırıldı mı?
function srConfluence(sr, direction) {
  if (!sr) return { ok: true, note: 'S/R yok' };
  if (direction === 'long') {
    const brokeRes = sr.lastBreak && sr.lastBreak.type === 'resistance_broken';
    const nearSup = sr.nearestSupport && sr.nearestSupport.distPct != null && sr.nearestSupport.distPct > -3; // desteğin %3 üstünde
    return { ok: brokeRes || nearSup, note: brokeRes ? 'direnç kırıldı' : nearSup ? 'destek yakını' : 'S/R onayı zayıf', brokeRes, nearSup };
  } else {
    const brokeSup = sr.lastBreak && sr.lastBreak.type === 'support_broken';
    const nearRes = sr.nearestResistance && sr.nearestResistance.distPct != null && sr.nearestResistance.distPct < 3;
    return { ok: brokeSup || nearRes, note: brokeSup ? 'destek kırıldı' : nearRes ? 'direnç yakını' : 'S/R onayı zayıf', brokeSup, nearRes };
  }
}

module.exports = { analyze, detectBreaks, srConfluence, LEFT, RIGHT };
