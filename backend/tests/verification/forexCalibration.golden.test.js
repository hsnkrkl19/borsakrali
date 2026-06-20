/**
 * GOLDEN TESTS — forexAggregator.calibrateConfidence / empiricalConfidence
 *
 * Teknik güven notunu (consensus/avgScore/ADX...) tarihsel backtest başarısıyla
 * düzelten kalibrasyon katmanını kilitler. backtesting.py sidecar'ı artık winRate
 * yanında **PROFIT FACTOR + EXPECTANCY** da ürettiği için empirik güven PF-temelli:
 * kârlı-ama-düşük-winRate (geniş fib stop, yüksek R/R) kurulumlar ARTIK ezilmez.
 *
 * Uygulama biçimi DEĞİŞTİ: eski "mutlak empirik seviyeye harman" akışı kurutuyordu
 * (75→41). Yeni biçim ham güveni SINIRLI delta ile düzeltir:
 *   delta = clamp((empirical-50)·trust, -MAX_DROP, +MAX_RISE)   (vars. ±15)
 * → iyi geçmiş yukarı, kötü geçmiş aşağı çeker AMA tek hamlede akışı kurutamaz.
 *
 * Saf fonksiyonlar test edilir (ağ/dosya yok). Sabitler değişirse bu testler de
 * güncellenmeli — kasıtlı "golden" davranış kilidi.
 */

const { calibrateConfidence, empiricalConfidence, CAL } = require('../../src/services/forex/forexAggregator');

describe('empiricalConfidence — winRate-tek yol (PF yoksa, geriye dönük uyum)', () => {
  test('başabaş oranı (NEUTRAL_WINRATE) → 50 (nötr)', () => {
    expect(empiricalConfidence({ winRate: CAL.NEUTRAL_WINRATE })).toBeCloseTo(50, 5);
  });
  test('konumsal imza da çalışır (winRate, avgReturn)', () => {
    expect(empiricalConfidence(CAL.NEUTRAL_WINRATE, 0)).toBeCloseTo(50, 5);
  });
  test('düşük winRate → 50 altı', () => {
    expect(empiricalConfidence({ winRate: 21.1 })).toBeCloseTo(18.16, 2);
  });
  test('yüksek winRate → 50 üstü', () => {
    expect(empiricalConfidence({ winRate: 65.7 })).toBeCloseTo(89.52, 2);
  });
  test('avgReturn ince ayar — negatif aşağı çeker, ±AVGRET_CLAMP ile sınırlı', () => {
    expect(empiricalConfidence({ winRate: 41, avgReturn: -2 })).toBeCloseTo(47, 5);   // 50 - 2*1.5
    expect(empiricalConfidence({ winRate: 41, avgReturn: -100 })).toBeCloseTo(50 - CAL.AVGRET_CLAMP * CAL.AVGRET_W, 5);
  });
  test('uç winRate 0..100 sınırına kelepçelenir', () => {
    expect(empiricalConfidence({ winRate: 95 })).toBe(100);
    expect(empiricalConfidence({ winRate: 0 })).toBeGreaterThanOrEqual(0);
  });
});

describe('empiricalConfidence — PROFIT FACTOR yolu (kârlı-düşük-winRate cezalandırılmaz)', () => {
  test('PF=1 (başabaş) → 50 nötr', () => {
    expect(empiricalConfidence({ profitFactor: 1.0 })).toBeCloseTo(50, 5);
  });
  test('KRİTİK: winRate %40 ama PF 1.3 + pozitif expectancy → 50 ÜSTÜ (winRate-tek olsaydı altı)', () => {
    const pf = empiricalConfidence({ winRate: 40, profitFactor: 1.3, expectancy: 0.5 });
    const wrOnly = empiricalConfidence({ winRate: 40 });
    expect(pf).toBeGreaterThan(50);          // kârlı → güven korunur
    expect(wrOnly).toBeLessThan(50);         // eski yol cezalandırıyordu (akışı kuruttu)
    expect(pf).toBeCloseTo(59.8, 1);
  });
  test('PF<1 (kaybeden) sert cezalandırılır', () => {
    // 50 + max(-25,(0.4-1)*50=-30→-25) + (21-41)*0.2=-4 + clamp(-1.5)*2=-3 = 18
    expect(empiricalConfidence({ winRate: 21, profitFactor: 0.4, expectancy: -1.5 })).toBeCloseTo(18, 5);
  });
  test('çok yüksek PF üst sınırı (PF_CLAMP_UP) ile sınırlı', () => {
    expect(empiricalConfidence({ profitFactor: 999 })).toBe(50 + CAL.PF_CLAMP_UP);
  });
});

describe('calibrateConfidence — tarihsel veri yoksa NO-OP', () => {
  test('history null → ham skor aynen döner', () => {
    expect(calibrateConfidence(75, null)).toEqual({ confidence: 75, rawConfidence: 75, empirical: null, trust: 0, delta: 0 });
  });
  test('winRate VE profitFactor null → kalibrasyon yok', () => {
    const r = calibrateConfidence(50, { winRate: null, profitFactor: null, sampleSize: 40, avgReturn: 1 });
    expect(r.confidence).toBe(50);
    expect(r.trust).toBe(0);
  });
  test('yetersiz örnek (<MIN_SAMPLE) → kalibrasyon yok', () => {
    const r = calibrateConfidence(75, { winRate: 21, sampleSize: CAL.MIN_SAMPLE - 1, avgReturn: 0 });
    expect(r.confidence).toBe(75);
    expect(r.trust).toBe(0);
  });
});

describe('calibrateConfidence — SINIRLI delta (akış çökmesin)', () => {
  test('NAS100 1d: 75 (teknik) + %21.1/40örnek → 60 (en çok MAX_DROP düşer)', () => {
    const r = calibrateConfidence(75, { winRate: 21.1, sampleSize: 40, avgReturn: 0 });
    expect(r.empirical).toBe(18);
    expect(r.trust).toBe(0.6);
    expect(r.delta).toBe(-CAL.MAX_DROP);     // (18.16-50)*0.6=-19.1 → -15 kelepçe
    expect(r.confidence).toBe(75 - CAL.MAX_DROP);
  });
  test('NAS100 1h: 58 (teknik) + %65.7/40örnek → 73 (en çok MAX_RISE yükselir)', () => {
    const r = calibrateConfidence(58, { winRate: 65.7, sampleSize: 40, avgReturn: 0 });
    expect(r.empirical).toBe(90);
    expect(r.delta).toBe(CAL.MAX_RISE);      // (89.52-50)*0.6=23.7 → +15 kelepçe
    expect(r.confidence).toBe(58 + CAL.MAX_RISE);
  });
  test('PF-temelli: kârlı geçmiş güveni YUKARI çeker', () => {
    const r = calibrateConfidence(78, { winRate: 40, profitFactor: 1.3, expectancy: 0.5, sampleSize: 40 });
    expect(r.empirical).toBe(60);
    expect(r.confidence).toBe(84);           // 78 + round((60-50)*0.6=6)
    expect(r.delta).toBe(6);
  });
  test('PF-temelli: kaybeden geçmiş güveni AŞAĞI (MAX_DROP) çeker', () => {
    const r = calibrateConfidence(78, { winRate: 21, profitFactor: 0.4, expectancy: -1.5, sampleSize: 40 });
    expect(r.confidence).toBe(78 - CAL.MAX_DROP);
    expect(r.delta).toBe(-CAL.MAX_DROP);
  });
});

describe('calibrateConfidence — örneklem büyüklüğü (trust) deltayı ölçekler', () => {
  test('yarım örneklem → yarım trust → daha yumuşak düzeltme', () => {
    const r = calibrateConfidence(75, { winRate: 21.1, sampleSize: 20, avgReturn: 0 });
    expect(r.trust).toBe(0.3);               // 0.6 * 20/40
    // delta_raw = (18.16-50)*0.3 = -9.55 → kelepçe içinde → 75-9.55 = 65.45 → 65
    expect(r.confidence).toBe(65);
  });
  test('başabaş winRate → delta ~0 (ham korunur)', () => {
    const r = calibrateConfidence(60, { winRate: 41, sampleSize: 40, avgReturn: 0 });
    expect(r.confidence).toBe(60);
    expect(r.delta).toBe(0);
  });
});

describe('calibrateConfidence — TERS korelasyon hatası DÜZELİR (sıralama)', () => {
  test('düşük-winRate 1d, yüksek-winRate 1h ALTINA iner (sıra tersine döner)', () => {
    const d1 = calibrateConfidence(75, { winRate: 21.1, sampleSize: 40, avgReturn: 0 });
    const h1 = calibrateConfidence(58, { winRate: 65.7, sampleSize: 40, avgReturn: 0 });
    expect(d1.rawConfidence).toBeGreaterThan(h1.rawConfidence); // ham: 1d > 1h (hatalı sıra)
    expect(d1.confidence).toBeLessThan(h1.confidence);          // kalibre: 1d < 1h (düzeldi)
  });
});
