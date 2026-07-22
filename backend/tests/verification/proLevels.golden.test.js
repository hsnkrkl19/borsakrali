/**
 * GOLDEN TESTS — YENİ ROBOT · Seviyeler (proLevels.buildLevels / buildLevelsRaw).
 *
 * Kilitlenen davranış: buildLevels KALİTE KAPISI rr1 < MIN_RR (1.5) kurulumları
 * DÜŞÜRÜR (null). buildLevelsRaw aynı seviyeleri kapı OLMADAN döner.
 *
 *   • 5m ATR fallback: TF_MULT tp1 1.6 / sl 1.2 → rr1 1.33 < 1.5 → buildLevels null.
 *   • 5m buildLevelsRaw → aynı seviye objesi (rr1 1.33 < 1.5 ama yine de döner).
 *   • 4h / 1d ATR fallback: rr1 ≥ 1.5 → geçerli obje.
 *   • SL doğru tarafta: long stop < giriş; short stop > giriş.
 *
 * Hermetik: seviyeler ATR'den (candles olmadan) hesaplanır → ağ yok.
 */

const proLevels = require('../../src/services/proSignals/proLevels');

describe('proLevels.MIN_RR', () => {
  test('varsayılan 1.5', () => {
    expect(proLevels.MIN_RR).toBe(1.5);
  });
});

describe('proLevels.buildLevels — rr1 < MIN_RR → null (kalite kapısı)', () => {
  test('5m artık kapıyı GEÇER (R:R düzeltmesi 2026-07-21)', () => {
    // Eskiden 5m: tp1 1.6 / sl 1.2 = 1.33 < 1.5 → null (yapısal zarar üreten tablo).
    // Yeni tablo: tp1 2.4 / sl 1.3 = 1.85 ≥ MIN_RR → geçerli kurulum döner.
    const lv = proLevels.buildLevels('long', 100, 1, '5m', 2);
    expect(lv).not.toBeNull();
    expect(lv.rr1).toBeGreaterThanOrEqual(proLevels.MIN_RR);
    expect(lv.rr1).toBeGreaterThanOrEqual(1.8);
  });

  test('entry/atr geçersiz → null', () => {
    expect(proLevels.buildLevels('long', 0, 1, '4h', 2)).toBeNull();
    expect(proLevels.buildLevels('long', 100, 0, '4h', 2)).toBeNull();
  });
});

describe('proLevels.buildLevels — rr1 >= MIN_RR → geçerli obje', () => {
  test('4h ATR fallback → rr1 ≥ 1.5, long stop<giriş<TP1<TP2', () => {
    const lv = proLevels.buildLevels('long', 100, 1, '4h', 2);
    expect(lv).not.toBeNull();
    expect(lv.rr1).toBeGreaterThanOrEqual(proLevels.MIN_RR);
    expect(lv.stop).toBeLessThan(lv.entry);          // long: stop<giriş
    expect(lv.entry).toBeLessThan(lv.target1);
    expect(lv.target1).toBeLessThan(lv.target2);
    expect(lv.basis).toBe('atr');
  });

  test('1d ATR fallback → rr1 ≥ 1.5', () => {
    const lv = proLevels.buildLevels('long', 100, 1, '1d', 2);
    expect(lv).not.toBeNull();
    expect(lv.rr1).toBeGreaterThanOrEqual(proLevels.MIN_RR);
  });

  test('4h SHORT → stop > giriş > TP1 > TP2', () => {
    const lv = proLevels.buildLevels('short', 100, 1, '4h', 2);
    expect(lv).not.toBeNull();
    expect(lv.stop).toBeGreaterThan(lv.entry);       // short: stop>giriş
    expect(lv.entry).toBeGreaterThan(lv.target1);
    expect(lv.target1).toBeGreaterThan(lv.target2);
  });
});

describe('proLevels.buildLevelsRaw — kapı YOK (rr1 < MIN_RR olabilir)', () => {
  test('raw ve gated 5m\'de artık AYNI (R:R düzeltmesi sonrası kapı takılmıyor)', () => {
    // Eskiden 5m rr1 1.33 < MIN_RR olduğu için gated null dönüyordu; yeni tabloda
    // 1.85 → kapı takılmaz. Kapının kendisi hâlâ yerinde (rr1 < MIN_RR olursa eler).
    const raw = proLevels.buildLevelsRaw('long', 100, 1, '5m', 2);
    const gated = proLevels.buildLevels('long', 100, 1, '5m', 2);
    expect(raw).not.toBeNull();
    expect(gated).not.toBeNull();
    expect(raw.rr1).toBeGreaterThanOrEqual(proLevels.MIN_RR);
    expect(gated.stop).toBe(raw.stop);
    expect(gated.target1).toBe(raw.target1);
  });

  test('4h → raw ve gated AYNI objeyi verir (rr1 zaten >= MIN_RR)', () => {
    const raw = proLevels.buildLevelsRaw('long', 100, 1, '4h', 2);
    const gated = proLevels.buildLevels('long', 100, 1, '4h', 2);
    expect(raw).toEqual(gated);
  });
});
