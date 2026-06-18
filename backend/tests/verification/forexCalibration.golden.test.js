/**
 * GOLDEN TESTS — forexAggregator.calibrateConfidence / empiricalConfidence
 *
 * Teknik güven notunu (consensus/avgScore/ADX...) tarihsel backtest winRate'iyle
 * yeniden ağırlıklandıran kalibrasyon katmanını kilitler. Çözdüğü somut hata:
 * NAS100 1d teknik güven 75 ama backtest winRate %21 (38 örnek) iken, 1h teknik
 * 58 ama winRate %66 — yüksek teknik skor düşük gerçek isabeti maskeliyordu.
 *
 * Saf fonksiyonlar test edilir (ağ/dosya yok). Sabitler değişirse bu testler de
 * güncellenmeli — kasıtlı "golden" davranış kilidi.
 */

const { calibrateConfidence, empiricalConfidence, CAL } = require('../../src/services/forex/forexAggregator');

describe('empiricalConfidence — winRate → 0..100 empirik güven', () => {
  test('başabaş oranı (NEUTRAL_WINRATE) → 50 (nötr)', () => {
    expect(empiricalConfidence(CAL.NEUTRAL_WINRATE, 0)).toBeCloseTo(50, 5);
  });
  test('düşük winRate → 50 altı', () => {
    expect(empiricalConfidence(21.1, 0)).toBeCloseTo(18.16, 2);
  });
  test('yüksek winRate → 50 üstü', () => {
    expect(empiricalConfidence(65.7, 0)).toBeCloseTo(89.52, 2);
  });
  test('avgReturn ince ayar — negatif aşağı çeker, ±AVGRET_CLAMP ile sınırlı', () => {
    expect(empiricalConfidence(41, -2)).toBeCloseTo(47, 5);        // 50 - 2*1.5
    expect(empiricalConfidence(41, -100)).toBeCloseTo(50 - CAL.AVGRET_CLAMP * CAL.AVGRET_W, 5); // clamp
  });
  test('uç winRate 0..100 sınırına kelepçelenir', () => {
    expect(empiricalConfidence(95, 0)).toBe(100);
    expect(empiricalConfidence(0, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('calibrateConfidence — tarihsel veri yoksa NO-OP', () => {
  test('history null → ham skor aynen döner', () => {
    const r = calibrateConfidence(75, null);
    expect(r).toEqual({ confidence: 75, rawConfidence: 75, empirical: null, trust: 0, delta: 0 });
  });
  test('winRate null → kalibrasyon yok', () => {
    const r = calibrateConfidence(50, { winRate: null, sampleSize: 40, avgReturn: 1 });
    expect(r.confidence).toBe(50);
    expect(r.trust).toBe(0);
  });
  test('yetersiz örnek (<MIN_SAMPLE) → kalibrasyon yok', () => {
    const r = calibrateConfidence(75, { winRate: 21, sampleSize: CAL.MIN_SAMPLE - 1, avgReturn: 0 });
    expect(r.confidence).toBe(75);
    expect(r.trust).toBe(0);
  });
});

describe('calibrateConfidence — düşük winRate güveni AŞAĞI çeker', () => {
  test('NAS100 1d senaryosu: 75 (teknik) + %21.1/38örnek → ~41', () => {
    const r = calibrateConfidence(75, { winRate: 21.1, sampleSize: 40, avgReturn: 0 });
    expect(r.confidence).toBe(41);
    expect(r.rawConfidence).toBe(75);
    expect(r.empirical).toBe(18);
    expect(r.trust).toBe(0.6);          // tam örneklem → TRUST_MAX
    expect(r.delta).toBe(-34);
  });
  test('avgReturn negatifse ek ceza', () => {
    const r = calibrateConfidence(60, { winRate: 41, sampleSize: 40, avgReturn: -2 });
    expect(r.confidence).toBe(52);       // empirical 47, blend 0.4*60+0.6*47
  });
});

describe('calibrateConfidence — yüksek winRate güveni YUKARI çeker', () => {
  test('NAS100 1h senaryosu: 58 (teknik) + %65.7/35örnek → ~77', () => {
    const r = calibrateConfidence(58, { winRate: 65.7, sampleSize: 40, avgReturn: 0 });
    expect(r.confidence).toBe(77);
    expect(r.delta).toBe(19);
    expect(r.empirical).toBe(90);
  });
  test('uç yüksek winRate kalibre güveni 100 üstüne çıkmaz', () => {
    const r = calibrateConfidence(40, { winRate: 95, sampleSize: 40, avgReturn: 0 });
    expect(r.confidence).toBe(76);
    expect(r.empirical).toBe(100);
  });
});

describe('calibrateConfidence — örneklem büyüklüğü güveni (trust) ölçekler', () => {
  test('yarım örneklem → yarım trust → daha yumuşak düzeltme', () => {
    const r = calibrateConfidence(75, { winRate: 21.1, sampleSize: 20, avgReturn: 0 });
    expect(r.trust).toBe(0.3);           // 0.6 * 20/40
    expect(r.confidence).toBe(58);       // 0.7*75 + 0.3*18.16
  });
  test('başabaş winRate teknik skoru 50ye doğru hafifçe çeker', () => {
    const r = calibrateConfidence(60, { winRate: 41, sampleSize: 40, avgReturn: 0 });
    expect(r.confidence).toBe(54);       // empirical 50, 0.4*60+0.6*50
  });
});

describe('calibrateConfidence — TERS korelasyon hatası DÜZELİR', () => {
  test('düşük-winRate 1d, yüksek-winRate 1h ALTINA iner (sıralama tersine döner)', () => {
    const d1 = calibrateConfidence(75, { winRate: 21.1, sampleSize: 40, avgReturn: 0 }); // teknik daha yüksek
    const h1 = calibrateConfidence(58, { winRate: 65.7, sampleSize: 40, avgReturn: 0 }); // teknik daha düşük
    expect(d1.rawConfidence).toBeGreaterThan(h1.rawConfidence); // ham: 1d > 1h (hatalı sıra)
    expect(d1.confidence).toBeLessThan(h1.confidence);          // kalibre: 1d < 1h (düzeldi)
  });
  test('push eşiği (60) artık doğru tarafta: kanıtlanmış kaybeden 1d eler, kazanan 1h geçer', () => {
    const d1 = calibrateConfidence(75, { winRate: 21.1, sampleSize: 40, avgReturn: 0 });
    const h1 = calibrateConfidence(58, { winRate: 65.7, sampleSize: 40, avgReturn: 0 });
    expect(d1.confidence).toBeLessThan(60);
    expect(h1.confidence).toBeGreaterThanOrEqual(60);
  });
});
