/**
 * elliott — Fraktal zigzag üzerinden KURAL TABANLI Elliott dalga konumu.
 *
 * Elliott etiketleme doğası gereği yoruma açıktır; burada YÜKSEK OLASILIKLI ve
 * net tanımlı iki devam kurulumunu tespit ederiz (her iki yön):
 *   • Dalga 2 bitişi → Dalga 3 girişi   (en güçlü impuls)
 *   • Dalga 4 bitişi → Dalga 5 girişi
 * Yalnız ONAYLI fraktal pivotlar kullanılır (forexFib.pivots — son `right` bar
 * pivot olamaz → repaint/ileri-bakış yok). Saf/yan-etkisiz; test edilebilir.
 *
 * Klasik kurallar uygulanır: Dalga 2, Dalga 1'i tam geri almaz; Dalga 4,
 * Dalga 1 bölgesiyle çakışmaz; Dalga 3 en kısa değildir; Fibonacci oranları.
 */

const fib = require('../forex/forexFib');

// Fraktal pivotlardan alternan (H,L,H,L...) zigzag — ardışık aynı tip → uç korunur
function buildZigzag(candles, opts = {}) {
  const { highs, lows } = fib.pivots(candles, opts.left || fib.PIVOT_LEFT, opts.right || fib.PIVOT_RIGHT);
  const pts = [
    ...highs.map(h => ({ i: h.i, price: h.price, time: h.time, type: 'H' })),
    ...lows.map(l => ({ i: l.i, price: l.price, time: l.time, type: 'L' })),
  ].sort((a, b) => a.i - b.i);
  const zz = [];
  for (const p of pts) {
    const last = zz[zz.length - 1];
    if (!last || last.type !== p.type) { zz.push(p); continue; }
    if (p.type === 'H' ? p.price >= last.price : p.price <= last.price) zz[zz.length - 1] = p; // daha uç
  }
  return zz;
}

const W2_MIN = 0.382, W2_MAX = 0.886;   // Dalga 2 retracement bandı
const W4_MIN = 0.20, W4_MAX = 0.55;     // Dalga 4 retracement bandı
const MAX_ENTRY_ATR = 3.5;              // düzeltme pivotundan girişe azami mesafe (ATR)

function pct(part, whole) { return whole > 0 ? part / whole : null; }

// candles: sinyal anına kadar; atrVal: ATR(14). Aktif kurulum | null döner.
function detectSetup(candles, atrVal, opts = {}) {
  if (!candles || candles.length < 60 || !(atrVal > 0)) return null;
  const zz = buildZigzag(candles, opts);
  if (zz.length < 3) return null;
  const close = candles[candles.length - 1].close;
  const n = zz.length;
  const last = zz[n - 1];
  const distAtr = Math.abs(close - last.price) / atrVal;
  if (distAtr > MAX_ENTRY_ATR) return null; // pivot çok geride — taze değil

  // ── Dalga 4 → 5 (5 nokta): A(L) B(H) C(L) D(H) E(L=son) [long] / ters [short]
  if (n >= 5) {
    const [A, B, C, D, E] = [zz[n - 5], zz[n - 4], zz[n - 3], zz[n - 2], zz[n - 1]];
    // LONG: L H L H L
    if (A.type === 'L' && B.type === 'H' && C.type === 'L' && D.type === 'H' && E.type === 'L') {
      const w1 = B.price - A.price, w3 = D.price - C.price, w4 = D.price - E.price;
      const r4 = pct(w4, w3);
      if (w1 > 0 && w3 > 0 && C.price > A.price && D.price > B.price && E.price > B.price &&
          w3 >= w1 * 0.9 && r4 != null && r4 >= W4_MIN && r4 <= W4_MAX && close > E.price) {
        return setup('W4W5', 'long', { A, B, C, D, E }, { w1, w3, retr: +r4.toFixed(3), corrective: E,
          proj: E.price + w1, prior: D.price });
      }
    }
    // SHORT: H L H L H
    if (A.type === 'H' && B.type === 'L' && C.type === 'H' && D.type === 'L' && E.type === 'H') {
      const w1 = A.price - B.price, w3 = C.price - D.price, w4 = E.price - D.price;
      const r4 = pct(w4, w3);
      if (w1 > 0 && w3 > 0 && C.price < A.price && D.price < B.price && E.price < B.price &&
          w3 >= w1 * 0.9 && r4 != null && r4 >= W4_MIN && r4 <= W4_MAX && close < E.price) {
        return setup('W4W5', 'short', { A, B, C, D, E }, { w1, w3, retr: +r4.toFixed(3), corrective: E,
          proj: E.price - w1, prior: D.price });
      }
    }
  }

  // ── Dalga 2 → 3 (3 nokta): A(L) B(H) C(L=son) [long] / A(H) B(L) C(H) [short]
  // KORUMA: A→B aslında daha büyük bir impulsün 3. dalgası (uzantı) ise
  // (A = yüksek-dip ve B = önceki tepeyi aşan yüksek-yüksek), bu "taze W1-W2"
  // değildir → W4W5 reddedilen bir yapının kuyruğunu yanlış etiketlemeyi önler.
  {
    const [A, B, C] = [zz[n - 3], zz[n - 2], zz[n - 1]];
    const P5 = n >= 5 ? zz[n - 5] : null, P4 = n >= 5 ? zz[n - 4] : null;
    if (A.type === 'L' && B.type === 'H' && C.type === 'L') {
      const extension = P5 && P4 && P5.price < A.price && B.price > P4.price; // wave-3 uzantısı
      const w1 = B.price - A.price, w2 = B.price - C.price;
      const r2 = pct(w2, w1);
      if (!extension && w1 > 0 && C.price > A.price && r2 != null && r2 >= W2_MIN && r2 <= W2_MAX && close > C.price) {
        return setup('W2W3', 'long', { A, B, C }, { w1, retr: +r2.toFixed(3), corrective: C,
          proj: C.price + 1.618 * w1, prior: B.price });
      }
    }
    if (A.type === 'H' && B.type === 'L' && C.type === 'H') {
      const extension = P5 && P4 && P5.price > A.price && B.price < P4.price; // wave-3 uzantısı (aşağı)
      const w1 = A.price - B.price, w2 = C.price - B.price;
      const r2 = pct(w2, w1);
      if (!extension && w1 > 0 && C.price < A.price && r2 != null && r2 >= W2_MIN && r2 <= W2_MAX && close < C.price) {
        return setup('W2W3', 'short', { A, B, C }, { w1, retr: +r2.toFixed(3), corrective: C,
          proj: C.price - 1.618 * w1, prior: B.price });
      }
    }
  }
  return null;
}

function setup(kind, direction, points, m) {
  const waveLabel = kind === 'W2W3' ? 'Dalga 2 bitti → Dalga 3' : 'Dalga 4 bitti → Dalga 5';
  return {
    kind, direction, points, ...m,
    correctivePrice: m.corrective.price, correctiveTime: m.corrective.time, correctiveIdx: m.corrective.i,
    label: `${waveLabel} (${direction === 'long' ? 'AL' : 'SAT'})`,
    note: `Elliott: ${waveLabel}; ${kind === 'W2W3' ? 'W1' : 'W3'}'in %${Math.round((m.retr) * 100)} düzeltmesi tamamlandı, impuls devamı bekleniyor`,
  };
}

module.exports = { buildZigzag, detectSetup, W2_MIN, W2_MAX, W4_MIN, W4_MAX, MAX_ENTRY_ATR };
