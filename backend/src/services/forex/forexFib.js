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
// Kullanıcı isteği (2): SL = %61.8 geri çekilme (eski 1.8 ATR'den GENİŞ ama swing
// dibinden DAR → az stop + R/R≥1). TP'ler swing fib UZANTILARI (1.272/1.618/2.0/2.618)
// içinden R/R≥1 veren İLK seviye. SL mesafesi [2.0..4.5]·ATR'ye sığdırılır (donmasın).
// Geçerli yapı yoksa null → çağıran ATR'ye düşer.
// AMPİRİK AYAR (2026-07-21): 16 seri × 1319 örnek gerçek veride 15 yapılandırma
// yarıştırıldı (EURUSD/GBPUSD/USDJPY/XAUUSD/BTCUSD/ETHUSD/NAS100/SPX500 × 1h/4h).
// KAZANAN: stop = swing UCU (yapısal geçersizleşme) + kelepçe 2-8 ATR + TP = ≥1.3R
// veren ilk fibo uzantısı → beklenti +0.132R (t=3.78), isabet %44.1, PF 1.25.
// Referans (eski saf ATR 1.6/3.0): +0.112R, isabet %38.7, PF 1.18.
const STOP_MIN_ATR = 2.0;
const STOP_MAX_ATR = 8.0;   // 4.5 → 8.0 (ampirik: swing ucu daha geniş nefes ister)
const STOP_MODE = 'edge';   // 'edge' = swing ucu (kazanan) · 'fib618' = %61.8 geri çekilme
const TP_MIN_RR = 1.3;      // TP = bu R:R'yi veren ilk uzantı (ampirik optimum)
const EXT_RATIOS = [0.272, 0.618, 1.0, 1.618, 2.618, 4.236]; // tepe/dip ötesi uzantı oranları

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
  const pack = (e, s, a, b) => {
    const R = Math.abs(e - s); if (!(R > 0)) return null;
    return { entry: r(e), stop: r(s), target1: r(a), target2: r(b),
      rr1: +(Math.abs(a - e) / R).toFixed(2), rr2: +(Math.abs(b - e) / R).toFixed(2),
      atr: +atrVal.toFixed(precision), basis: 'fib' };
  };

  const mode = opts.stopMode || STOP_MODE;
  const minRR = opts.minRR != null ? opts.minRR : TP_MIN_RR;

  if (isLong) {
    if (entry < sw.L.price) return null;                            // yapı kırık (giriş dip altı)
    // AMPİRİK KAZANAN: stop swing DİBİNİN ötesi (yapısal geçersizleşme).
    let stop = mode === 'fib618' ? sw.H.price - 0.618 * range - buf : sw.L.price - buf;
    if (stop >= entry) stop = sw.L.price - buf;                     // güvenli düşüş
    if (stop >= entry) return null;
    let d = entry - stop;
    if (d < minD) { stop = entry - minD; d = minD; } else if (d > maxD) { stop = entry - maxD; d = maxD; }
    const exts = EXT_RATIOS.map(k => sw.H.price + k * range).filter(p => p > entry);
    const need = minRR * d;                                          // TP en az bu R:R'yi versin
    const t1 = exts.find(p => p - entry >= need) ?? entry + need;    // ≥minRR veren ilk fibo uzantısı
    const t2 = exts.find(p => p > t1) ?? t1 + 0.6 * d;
    return pack(entry, stop, t1, t2);
  } else {
    if (entry > sw.H.price) return null;
    let stop = mode === 'fib618' ? sw.L.price + 0.618 * range + buf : sw.H.price + buf;
    if (stop <= entry) stop = sw.H.price + buf;
    if (stop <= entry) return null;
    let d = stop - entry;
    if (d < minD) { stop = entry + minD; d = minD; } else if (d > maxD) { stop = entry + maxD; d = maxD; }
    const exts = EXT_RATIOS.map(k => sw.L.price - k * range).filter(p => p < entry);
    const need = minRR * d;
    const t1 = exts.find(p => entry - p >= need) ?? entry - need;
    const t2 = exts.find(p => p < t1) ?? t1 - 0.6 * d;
    return pack(entry, stop, t1, t2);
  }
}

module.exports = {
  pivots, lastSwing, fibLevels, initialStop, trailStop, tradeLevels,
  FIB_RATIOS, DEFAULT_STOP_FIB, PIVOT_LEFT, PIVOT_RIGHT,
};
