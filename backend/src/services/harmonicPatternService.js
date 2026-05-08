/**
 * Harmonic Pattern Detection — BORSA KRALI
 *
 * Gerçek harmonik patern tespiti — ZigZag swing detection + Fibonacci ratio matching.
 * Asla uydurma sayı üretmez. Sadece son 5 swing noktası (X-A-B-C-D) gerçek
 * fiyat verisinden bulunur ve bilinen harmonik patern oranlarına %tolerans
 * dahilinde uyup uymadığı kontrol edilir.
 *
 * Patern oranları kaynağı: Scott Carney, "Harmonic Trading Vol. 1-2"
 *
 *   Pattern    AB/XA       BC/AB       CD/BC               XD/XA
 *   Gartley    0.618       0.382-0.886 1.272-1.618         0.786
 *   Bat        0.382-0.500 0.382-0.886 1.618-2.618         0.886
 *   Butterfly  0.786       0.382-0.886 1.618-2.618 (or 2.0-2.24)  1.272-1.618
 *   Crab       0.382-0.618 0.382-0.886 2.618-3.618         1.618
 *   Shark      —           1.13-1.618  1.618-2.24          0.886-1.13 (5-0)
 *   Cypher     0.382-0.618 1.13-1.414  1.272-2.000         0.786
 */

const TOLERANCE = 0.06; // %6 ratio tolerance — Carney'nin önerdiği makul aralık

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
function within(value, lo, hi) {
  if (value == null || !Number.isFinite(value)) return false;
  const tlo = lo * (1 - TOLERANCE);
  const thi = hi * (1 + TOLERANCE);
  return value >= tlo && value <= thi;
}

function ratio(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.abs(a / b);
}

// ─── ZigZag swing detection ───────────────────────────────────────────────────
// Yöntem: belirlenmiş %threshold'tan büyük her ters yön hareketinde yeni pivot.
// Örn. threshold=0.04 → fiyat son pivottan %4 ters yönde hareket ettiğinde yeni
// pivot kabul edilir. Bu ZigZag'ın klasik tanımıdır (TradingView, MT4 vs.).
function zigzagPivots(candles, threshold = 0.04) {
  if (!Array.isArray(candles) || candles.length < 10) return [];

  const pivots = [];
  let direction = 0;        // +1 = yukarı, -1 = aşağı, 0 = belirsiz
  let lastPivotIdx = 0;
  let extreme = candles[0].close;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const high = c.high ?? c.close;
    const low = c.low ?? c.close;

    if (direction >= 0) {
      // Yukarı yöndeyiz → yeni high arıyoruz, ya da %threshold düşüş için low'a bak
      if (high > extreme) {
        extreme = high;
        lastPivotIdx = i;
      } else if ((extreme - low) / extreme >= threshold) {
        // Reversal aşağı → son extreme'i tepe pivot olarak kaydet
        pivots.push({ idx: lastPivotIdx, price: extreme, type: 'high', date: candles[lastPivotIdx].date });
        direction = -1;
        extreme = low;
        lastPivotIdx = i;
      }
    } else {
      // Aşağı yöndeyiz
      if (low < extreme) {
        extreme = low;
        lastPivotIdx = i;
      } else if ((high - extreme) / extreme >= threshold) {
        pivots.push({ idx: lastPivotIdx, price: extreme, type: 'low', date: candles[lastPivotIdx].date });
        direction = +1;
        extreme = high;
        lastPivotIdx = i;
      }
    }
  }

  // Son extreme'i de pivot olarak ekle (henüz reversal olmamışsa bile)
  if (lastPivotIdx > 0 && (pivots.length === 0 || pivots[pivots.length - 1].idx !== lastPivotIdx)) {
    pivots.push({
      idx: lastPivotIdx,
      price: extreme,
      type: direction >= 0 ? 'high' : 'low',
      date: candles[lastPivotIdx].date,
    });
  }

  return pivots;
}

// ─── Patern eşleştirme ────────────────────────────────────────────────────────
// XABCD = son 5 pivot; alternasyon: high-low-high-low-high VEYA low-high-low-high-low
// Bullish (D dipde) ya da Bearish (D tepede) olmasına göre yön belirlenir.
function classifyXABCD(X, A, B, C, D) {
  const types = [X.type, A.type, B.type, C.type, D.type].join('-');
  const bullish = types === 'low-high-low-high-low';
  const bearish = types === 'high-low-high-low-high';
  if (!bullish && !bearish) return null;

  // Mesafeler (mutlak)
  const XA = Math.abs(A.price - X.price);
  const AB = Math.abs(B.price - A.price);
  const BC = Math.abs(C.price - B.price);
  const CD = Math.abs(D.price - C.price);
  const XD = Math.abs(D.price - X.price);

  const r_AB_XA = ratio(AB, XA);
  const r_BC_AB = ratio(BC, AB);
  const r_CD_BC = ratio(CD, BC);
  const r_XD_XA = ratio(XD, XA);

  if (r_AB_XA == null || r_BC_AB == null || r_CD_BC == null || r_XD_XA == null) return null;

  // Patern tanımları: [name, AB/XA, BC/AB, CD/BC, XD/XA]
  const candidates = [
    { name: 'Gartley',   ab: [0.618, 0.618], bc: [0.382, 0.886], cd: [1.272, 1.618], xd: [0.786, 0.786] },
    { name: 'Bat',       ab: [0.382, 0.500], bc: [0.382, 0.886], cd: [1.618, 2.618], xd: [0.886, 0.886] },
    { name: 'Butterfly', ab: [0.786, 0.786], bc: [0.382, 0.886], cd: [1.618, 2.618], xd: [1.272, 1.618] },
    { name: 'Crab',      ab: [0.382, 0.618], bc: [0.382, 0.886], cd: [2.618, 3.618], xd: [1.618, 1.618] },
    { name: 'Cypher',    ab: [0.382, 0.618], bc: [1.130, 1.414], cd: [1.272, 2.000], xd: [0.786, 0.786] },
    { name: 'Shark',     ab: [0.000, 9.999], bc: [1.130, 1.618], cd: [1.618, 2.240], xd: [0.886, 1.130] },
  ];

  for (const p of candidates) {
    if (
      within(r_AB_XA, p.ab[0], p.ab[1]) &&
      within(r_BC_AB, p.bc[0], p.bc[1]) &&
      within(r_CD_BC, p.cd[0], p.cd[1]) &&
      within(r_XD_XA, p.xd[0], p.xd[1])
    ) {
      // Hedef ve stop seviyeleri (Carney'in PRZ — Potential Reversal Zone)
      const target = bullish ? D.price + Math.abs(C.price - D.price) * 0.618 : D.price - Math.abs(C.price - D.price) * 0.618;
      const stop = bullish ? Math.min(D.price, X.price) * 0.99 : Math.max(D.price, X.price) * 1.01;

      return {
        pattern: p.name,
        direction: bullish ? 'Bullish' : 'Bearish',
        ratios: {
          AB_XA: +r_AB_XA.toFixed(3),
          BC_AB: +r_BC_AB.toFixed(3),
          CD_BC: +r_CD_BC.toFixed(3),
          XD_XA: +r_XD_XA.toFixed(3),
        },
        points: {
          X: { date: X.date, price: +X.price.toFixed(2) },
          A: { date: A.date, price: +A.price.toFixed(2) },
          B: { date: B.date, price: +B.price.toFixed(2) },
          C: { date: C.date, price: +C.price.toFixed(2) },
          D: { date: D.date, price: +D.price.toFixed(2) },
        },
        targetPrice: +target.toFixed(2),
        stopLoss: +stop.toFixed(2),
        // Patern "completion" yüzdesi: oranların ideale ne kadar yakın olduğu
        completion: scorePattern(p, r_AB_XA, r_BC_AB, r_CD_BC, r_XD_XA),
      };
    }
  }
  return null;
}

function scorePattern(p, abxa, bcab, cdbc, xdxa) {
  const mid = (lo, hi) => (lo + hi) / 2;
  const dev = (val, lo, hi) => {
    const target = mid(lo, hi);
    if (target === 0) return 0;
    return Math.abs(val - target) / target;
  };
  const total =
    dev(abxa, p.ab[0], p.ab[1]) +
    dev(bcab, p.bc[0], p.bc[1]) +
    dev(cdbc, p.cd[0], p.cd[1]) +
    dev(xdxa, p.xd[0], p.xd[1]);
  const avg = total / 4; // ortalama sapma (0=mükemmel, 1=tolerans sınırı)
  return Math.max(50, Math.round(100 - avg * 100));
}

// ─── Tek hisse için en güncel paterni bul ─────────────────────────────────────
// Strateji: Son 12 pivot içinde "son D pivot'unun yakınında biten" 5-pivot
// dizilimlerini dene; en yüksek completion skorlu paterni döndür.
// Bu, ZigZag'ın kısa süreli noise pivot'larından (çok küçük dalgalanmalar)
// kaynaklanan kaçırılmaları azaltır.
function detectLatestHarmonic(candles, threshold = 0.05) {
  // Birden fazla threshold dene — uzun vadeli swing'leri yakalamak için.
  // Daha büyük threshold daha temiz, daha az ama daha güçlü pivots verir.
  const thresholds = [threshold, threshold * 1.5, threshold * 2.0];
  let best = null;

  for (const t of thresholds) {
    const pivots = zigzagPivots(candles, t);
    if (pivots.length < 5) continue;

    // Son 12 pivot içinde "son pivot'u D olarak alacak şekilde" 5-pivot
    // (XABCD) penceresini farklı X başlangıçlarıyla dene.
    // ZigZag bazen ek mini-pivot ekler; pencere kaydırarak gerçek paterni yakala.
    const tail = pivots.slice(-Math.min(pivots.length, 12));
    const D = tail[tail.length - 1];

    // X..C ardışık 4 pivot olmalı, D sabit son pivot
    for (let xi = 0; xi <= tail.length - 5; xi++) {
      const X = tail[xi];
      const A = tail[xi + 1];
      const B = tail[xi + 2];
      const C = tail[xi + 3];
      // D olarak hem son pivot'u hem son-1 pivot'u dene
      for (let di = xi + 4; di < tail.length; di++) {
        const Dcand = tail[di];
        const result = classifyXABCD(X, A, B, C, Dcand);
        if (result && (!best || result.completion > best.completion)) {
          best = result;
        }
      }
    }
    if (best) break; // ilk threshold'da bulunduysa diğerlerini deneme
  }
  return best;
}

module.exports = {
  zigzagPivots,
  detectLatestHarmonic,
  classifyXABCD,
};
