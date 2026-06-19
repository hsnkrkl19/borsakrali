/**
 * forexFib — Fibonacci yapı tabanlı stop + iz-süren stop (yalnız ≥4h yönetim).
 *
 * Kullanıcı isteği (2026-06-18): "4 saatlikte son tepeye fibonacci çekip
 * kurallara uygun ve düzgün fibo çizerek fibo seviyelerine stop koyabiliriz.
 * kârda olan işlemlere de ona uygun yaparsın."
 *
 * Yöntem (kurallara uygun klasik fibo):
 *   1) Yapısal swing'ler fraktal pivot'la bulunur (sol/sağ K bar onayı → REPAINT YOK;
 *      son `right` bar pivot olamaz, bu yüzden ileri-bakış da yoktur).
 *   2) Yönün son impuls bacağı: LONG → son tepe(H) + ondan önceki dip(L) [L→H yukarı bacak];
 *      SHORT → son dip(L) + ondan önceki tepe(H) [H→L aşağı bacak].
 *   3) Geri çekilme seviyeleri: LONG fib(r)=H−r·(H−L), SHORT fib(r)=L+r·(H−L).
 *   4) İlk stop: seçilen fib seviyesinin (vars. %78.6) hemen ötesine konur; seviye
 *      girişi geçmişse yapı dibine (L/H) düşülür; aşırı dar/geniş ise ATR bandına sığdırılır.
 *   5) İz süren: fiyat ilerledikçe en güncel onaylı yüksek-dip (LONG) / düşük-tepe (SHORT)
 *      altına/üstüne çekilir — yalnız lehe (ratchet).
 *
 * Mum formatı: { time, open, high, low, close } (eski→yeni). Saf/yan-etkisiz.
 */

const PIVOT_LEFT = 3, PIVOT_RIGHT = 3;     // fraktal pivot penceresi (yapı TF'inde)
const DEFAULT_STOP_FIB = 0.786;            // ilk stop bu retracement'in ötesinde
const BUFFER_ATR = 0.15;                   // stop tamponu (ATR oranı) — wick avı önler
const MIN_ATR = 0.6;                       // çok dar fib stop → en az bu kadar ATR mesafe
const MAX_ATR = 6.0;                       // çok geniş fib stop → en çok bu kadar ATR mesafe
const FIB_RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786];

// Fraktal pivot'lar: i, sol `left` ve sağ `right` barın HEPSİNDEN katı uçsa pivot.
// Son `right` bar asla pivot olamaz (henüz onaylanmadı) → canlıda repaint/lookahead yok.
function pivots(candles, left = PIVOT_LEFT, right = PIVOT_RIGHT) {
  const highs = [], lows = [];
  for (let i = left; i < candles.length - right; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push({ i, price: candles[i].high, time: candles[i].time });
    if (isLow) lows.push({ i, price: candles[i].low, time: candles[i].time });
  }
  return { highs, lows };
}

// Yönün son impuls bacağı → { H:{i,price}, L:{i,price} } (H.price>L.price) | null
function lastSwing(candles, direction, opts = {}) {
  const { left = PIVOT_LEFT, right = PIVOT_RIGHT } = opts;
  const { highs, lows } = pivots(candles, left, right);
  if (direction === 'long') {
    if (!highs.length) return null;
    const H = highs[highs.length - 1];           // son tepe (kullanıcı: "son tepeye fibonacci çek")
    let L = null;
    for (const lo of lows) if (lo.i < H.i) L = lo; // tepeden önceki SON dip = bacağın başı
    if (!L) {                                      // dip pivotu yoksa: tepeden önceki en düşük
      let mp = Infinity, mi = -1;
      for (let k = 0; k < H.i; k++) if (candles[k].low < mp) { mp = candles[k].low; mi = k; }
      if (mi < 0) return null;
      L = { i: mi, price: mp, time: candles[mi].time };
    }
    return H.price > L.price ? { H, L } : null;
  } else {
    if (!lows.length) return null;
    const L = lows[lows.length - 1];             // son dip
    let H = null;
    for (const hi of highs) if (hi.i < L.i) H = hi; // dipten önceki SON tepe
    if (!H) {
      let mp = -Infinity, mi = -1;
      for (let k = 0; k < L.i; k++) if (candles[k].high > mp) { mp = candles[k].high; mi = k; }
      if (mi < 0) return null;
      H = { i: mi, price: mp, time: candles[mi].time };
    }
    return H.price > L.price ? { H, L } : null;
  }
}

// Bacaktaki tüm fib retracement fiyatları { '0.618': px, ... } (yöne göre)
function fibLevels(swing, direction) {
  if (!swing) return null;
  const range = swing.H.price - swing.L.price;
  const out = {};
  for (const r of FIB_RATIOS) {
    out[String(r)] = direction === 'long' ? swing.H.price - r * range : swing.L.price + r * range;
  }
  out['1'] = direction === 'long' ? swing.L.price : swing.H.price; // tam yapı (invalidasyon)
  return out;
}

// İlk Fibonacci stop'u. Geçerli yapı yoksa null (çağıran ATR'ye düşer).
//   direction, candles (signal anına kadar), entry (giriş fiyatı), atrVal
//   opts.stopFib (vars %78.6), opts.buffer/min/max (ATR oranları)
function initialStop(direction, candles, entry, atrVal, opts = {}) {
  if (!(entry > 0) || !(atrVal > 0)) return null;
  const stopFib = opts.stopFib != null ? opts.stopFib : DEFAULT_STOP_FIB;
  const buffer = (opts.buffer != null ? opts.buffer : BUFFER_ATR) * atrVal;
  const minD = (opts.minAtr != null ? opts.minAtr : MIN_ATR) * atrVal;
  const maxD = (opts.maxAtr != null ? opts.maxAtr : MAX_ATR) * atrVal;
  const sw = lastSwing(candles, direction, opts);
  if (!sw) return null;
  const range = sw.H.price - sw.L.price;
  if (!(range > 0)) return null;

  const isLong = direction === 'long';
  // seçilen fib seviyesi (price), sonra yapı dibi/tepesi (invalidasyon)
  const fibPx = isLong ? sw.H.price - stopFib * range : sw.L.price + stopFib * range;
  const structPx = isLong ? sw.L.price : sw.H.price;
  let stop = isLong ? fibPx - buffer : fibPx + buffer;
  // seviye girişin yanlış tarafında → yapı dibine/tepesine düş
  if (isLong ? stop >= entry : stop <= entry) stop = isLong ? structPx - buffer : structPx + buffer;
  if (isLong ? stop >= entry : stop <= entry) return null; // yapı kırık (giriş dip/tepe ötesi)

  // mesafe bandı: çok dar → minD'ye aç, çok geniş → maxD'ye sığdır (risk koruması)
  let dist = Math.abs(entry - stop);
  if (dist < minD) stop = isLong ? entry - minD : entry + minD;
  else if (dist > maxD) stop = isLong ? entry - maxD : entry + maxD;
  return stop;
}

// İz süren Fibonacci/yapı stop'u — en güncel onaylı yüksek-dip (LONG) / düşük-tepe
// (SHORT) ötesine çeker. Yalnız lehe (ratchet). İyileştirme yoksa null.
function trailStop(direction, candles, currentStop, atrVal, opts = {}) {
  if (!candles || !candles.length || !(atrVal > 0)) return null;
  const buffer = (opts.buffer != null ? opts.buffer : BUFFER_ATR) * atrVal;
  const { highs, lows } = pivots(candles, opts.left || PIVOT_LEFT, opts.right || PIVOT_RIGHT);
  const last = candles[candles.length - 1];
  const px = last.close;
  const isLong = direction === 'long';
  if (isLong) {
    let best = null;                              // en güncel, fiyat altındaki onaylı dip
    for (const lo of lows) if (lo.price < px && (!best || lo.i > best.i)) best = lo;
    if (!best) return null;
    const stop = best.price - buffer;
    return (stop > currentStop && stop < px) ? stop : null;
  } else {
    let best = null;                             // en güncel, fiyat üstündeki onaylı tepe
    for (const hi of highs) if (hi.price > px && (!best || hi.i > best.i)) best = hi;
    if (!best) return null;
    const stop = best.price + buffer;
    return (stop < currentStop && stop > px) ? stop : null;
  }
}

// İŞLEM SEVİYELERİ (giriş/SL/TP) — NET FIBONACCI değerleri (lot/risk hesabı YOK).
// Kullanıcı isteği: TP/SL fibo seviyelerine bağlansın; ATR'den geniş olsun (az stop).
//   LONG retracement: SL=swing dibi, TP1=swing tepesi, TP2=1.618 uzantı.
//   LONG kırılım (giriş tepe üstü): SL=%38.2 geri çekilme, TP1=1.618, TP2=2.0 uzantı.
//   SHORT simetrik. SL mesafesi [STOP_MIN..MAX]·ATR bandına sığdırılır (ne çok dar
//   ne absürt). Geçerli yapı yoksa null → çağıran ATR'ye düşer.
const STOP_MIN_ATR = 2.0;   // fib stop EN AZ bu kadar (eski 1.8 ATR'den geniş → az stop)
const STOP_MAX_ATR = 6.0;

function tradeLevels(direction, candles, entry, atrVal, precision = 4, opts = {}) {
  if (!(entry > 0) || !(atrVal > 0)) return null;
  const sw = lastSwing(candles, direction, opts);
  if (!sw) return null;
  const range = sw.H.price - sw.L.price;
  if (!(range > 0)) return null;
  const buf = (opts.buffer ?? BUFFER_ATR) * atrVal;
  const minD = STOP_MIN_ATR * atrVal, maxD = STOP_MAX_ATR * atrVal;
  const r = (v) => +v.toFixed(precision);
  const isLong = direction === 'long';
  let stop, t1, t2;

  if (isLong) {
    if (entry < sw.L.price) return null;                       // yapı kırık (giriş dip altı)
    if (entry <= sw.H.price) { stop = sw.L.price - buf; t1 = sw.H.price + 0.272 * range; t2 = sw.H.price + 0.618 * range; } // 1.272 / 1.618 uzantı
    else { stop = sw.H.price - 0.382 * range; t1 = sw.H.price + 0.618 * range; t2 = sw.H.price + 1.0 * range; }            // kırılım
    const d = entry - stop;
    if (d < minD) stop = entry - minD; else if (d > maxD) stop = entry - maxD;
    if (t1 <= entry) { t1 = entry + 0.382 * range; t2 = entry + 0.618 * range; }  // sıra güvencesi
    if (t2 <= t1) t2 = t1 + 0.382 * range;
  } else {
    if (entry > sw.H.price) return null;
    if (entry >= sw.L.price) { stop = sw.H.price + buf; t1 = sw.L.price - 0.272 * range; t2 = sw.L.price - 0.618 * range; } // 1.272 / 1.618 uzantı
    else { stop = sw.L.price + 0.382 * range; t1 = sw.L.price - 0.618 * range; t2 = sw.L.price - 1.0 * range; }            // kırılım
    const d = stop - entry;
    if (d < minD) stop = entry + minD; else if (d > maxD) stop = entry + maxD;
    if (t1 >= entry) { t1 = entry - 0.382 * range; t2 = entry - 0.618 * range; }  // sıra güvencesi
    if (t2 >= t1) t2 = t1 - 0.382 * range;
  }
  const R = Math.abs(entry - stop);
  if (!(R > 0)) return null;
  return {
    entry: r(entry), stop: r(stop), target1: r(t1), target2: r(t2),
    rr1: +(Math.abs(t1 - entry) / R).toFixed(2), rr2: +(Math.abs(t2 - entry) / R).toFixed(2),
    atr: +atrVal.toFixed(precision), basis: 'fib',
  };
}

module.exports = {
  pivots, lastSwing, fibLevels, initialStop, trailStop, tradeLevels,
  FIB_RATIOS, DEFAULT_STOP_FIB, PIVOT_LEFT, PIVOT_RIGHT,
};
