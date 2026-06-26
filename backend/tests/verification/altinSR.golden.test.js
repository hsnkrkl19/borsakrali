/**
 * GOLDEN TESTS — ALTIN · Destek/Direnç + Fraktal Kırılım (altinSR).
 *
 * Kilitlenen davranışlar:
 *   1) Fraktal pivot HIGH'ı SONRADAN kapanışla aşılan seri → detectBreaks
 *      'resistance_broken' DOĞRU seviyede; lastBreak aynı olay.
 *   2) Fraktal pivot LOW'u SONRADAN kapanışla kırılan seri → 'support_broken'.
 *   3) nearestResistance > lastClose > nearestSupport (fiyatı saran seviyeler).
 *   4) srConfluence: long + direnç kırıldı → ok:true; short + destek kırıldı → ok:true;
 *      sr yoksa → ok:true (S/R yok).
 *
 * Tüm fixture'lar ELLE kurulmuş deterministik mum dizileridir (LEFT=RIGHT=3 pivot
 * onayı ile). Ağ YOK; saf fonksiyonlar → hermetik.
 */

const altinSR = require('../../src/services/altin/altinSR');
const fib = require('../../src/services/forex/forexFib');

// Mum kurucu — eski→yeni, 1 günlük adım.
function build(rows) {
  let t = 1500000000;
  return rows.map(([o, h, l, c]) => { const bar = { time: t, open: o, high: h, low: l, close: c, volume: 100 }; t += 86400; return bar; });
}

// Direnç kırılımı senaryosu: idx 8'de pivot HIGH 110, sonradan kapanış 110'u aşar.
const RES_BREAK = build([
  [100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 100],
  [101, 103, 100, 102], [102, 104, 101, 103], [103, 105, 102, 104],
  [104, 110, 103, 106],   // idx 8 — PIVOT HIGH 110
  [105, 106, 103, 104], [104, 105, 102, 103], [103, 104, 101, 102],
  [102, 103, 95, 96], [96, 97, 90, 92],
  [92, 93, 85, 88],       // idx 14 — PIVOT LOW 85
  [88, 92, 87, 91], [91, 95, 90, 94], [94, 98, 93, 97],
  [97, 112, 96, 111],     // idx 18 — kapanış 111 > 110 → DİRENÇ KIRILDI
  [111, 113, 110, 112], [112, 114, 111, 113],
]);

// Destek kırılımı senaryosu: idx 8'de pivot LOW 90, sonradan kapanış 90 altına iner.
const SUP_BREAK = build([
  [100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 100],
  [99, 100, 96, 97], [97, 98, 94, 95], [95, 96, 92, 93],
  [93, 95, 90, 94],       // idx 8 — PIVOT LOW 90
  [94, 97, 93, 96], [96, 99, 95, 98], [98, 101, 97, 100], [100, 103, 99, 102],
  [102, 105, 101, 104], [104, 107, 103, 106], [106, 108, 104, 105],
  [105, 106, 100, 101], [101, 102, 95, 96],
  [96, 97, 88, 89],       // idx 18 — kapanış 89 < 90 → DESTEK KIRILDI
  [89, 92, 87, 91], [91, 93, 89, 92],
]);

describe('altinSR.detectBreaks — fraktal kırılım olayları', () => {
  test('pivot HIGH sonradan kapanışla aşılır → resistance_broken @110', () => {
    const { highs, lows } = fib.pivots(RES_BREAK, 3, 3);
    const breaks = altinSR.detectBreaks(RES_BREAK, highs, lows, 3);
    const res = breaks.find(b => b.type === 'resistance_broken');
    expect(res).toBeDefined();
    expect(res.level).toBe(110);
    expect(res.dir).toBe('bull');
    expect(res.breakIndex).toBe(18);         // kırılım barı
    expect(res.breakIndex).toBeGreaterThan(8); // pivot oluştuktan SONRA (ileri-bakış yok)
  });

  test('pivot LOW sonradan kapanışla kırılır → support_broken @90', () => {
    const { highs, lows } = fib.pivots(SUP_BREAK, 3, 3);
    const breaks = altinSR.detectBreaks(SUP_BREAK, highs, lows, 3);
    const sup = breaks.find(b => b.type === 'support_broken');
    expect(sup).toBeDefined();
    expect(sup.level).toBe(90);
    expect(sup.dir).toBe('bear');
    expect(sup.breakIndex).toBe(18);
  });
});

describe('altinSR.analyze — rapor + lastBreak', () => {
  test('direnç kırılım serisi → lastBreak resistance_broken @110', () => {
    const sr = altinSR.analyze(RES_BREAK);
    expect(sr).not.toBeNull();
    expect(sr.lastBreak).not.toBeNull();
    expect(sr.lastBreak.type).toBe('resistance_broken');
    expect(sr.lastBreak.level).toBe(110);
    expect(sr.recentBreaks.length).toBeGreaterThan(0);
    expect(sr.lastClose).toBe(113);
  });

  test('destek kırılım serisi → en yakın seviyeler fiyatı sarar (R>lastClose>S)', () => {
    const sr = altinSR.analyze(SUP_BREAK);
    expect(sr).not.toBeNull();
    expect(sr.nearestResistance).not.toBeNull();
    expect(sr.nearestSupport).not.toBeNull();
    // nearestResistance > lastClose > nearestSupport
    expect(sr.nearestResistance.price).toBeGreaterThan(sr.lastClose);
    expect(sr.lastClose).toBeGreaterThan(sr.nearestSupport.price);
    expect(sr.lastBreak.type).toBe('support_broken');
  });

  test('çok kısa seri → null', () => {
    expect(altinSR.analyze(RES_BREAK.slice(0, 5))).toBeNull();
    expect(altinSR.analyze([])).toBeNull();
  });
});

describe('altinSR.srConfluence — yön onayı', () => {
  test('long + direnç kırıldı → ok:true ("direnç kırıldı")', () => {
    const sr = altinSR.analyze(RES_BREAK);
    const conf = altinSR.srConfluence(sr, 'long');
    expect(conf.ok).toBe(true);
    expect(conf.brokeRes).toBe(true);
    expect(conf.note).toBe('direnç kırıldı');
  });

  test('short + destek kırıldı → ok:true ("destek kırıldı")', () => {
    const sr = altinSR.analyze(SUP_BREAK);
    const conf = altinSR.srConfluence(sr, 'short');
    expect(conf.ok).toBe(true);
    expect(conf.brokeSup).toBe(true);
    expect(conf.note).toBe('destek kırıldı');
  });

  test('sr yok → ok:true (S/R yok)', () => {
    const conf = altinSR.srConfluence(null, 'long');
    expect(conf.ok).toBe(true);
    expect(conf.note).toBe('S/R yok');
  });
});

describe('altinSR — DETERMİNİZM', () => {
  test('aynı seri iki kez → birebir aynı analyze', () => {
    expect(altinSR.analyze(RES_BREAK)).toEqual(altinSR.analyze(RES_BREAK));
  });
});
