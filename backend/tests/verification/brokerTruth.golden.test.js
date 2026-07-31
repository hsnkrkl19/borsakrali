'use strict';

/**
 * Mutabakat (A6/A7) — defter ile broker gerçeğinin sessizce ayrışamaması.
 *
 * 2026-07-31: rapor 18 işlem / −74,51 $ derken hesap 60+ işlem / −3.234,88 $
 * gösterdi. Kayıt hattındaki delikler kapatıldı, ama asıl güvence bağımsız
 * doğrulama: her gün defter toplamı brokerın kendi rakamıyla karşılaştırılır.
 */

const brokerTruth = require('../../src/services/realResults/brokerTruth');

beforeEach(() => brokerTruth.resetForTest());

describe('brokerTruth mutabakatı', () => {
  test('anlık görüntü yoksa mutabakat sessizce BAŞARILI sayılmaz', () => {
    const r = brokerTruth.reconcile(-74.51);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('broker-anlik-goruntusu-yok');
  });

  test('defter brokerla uyuşuyorsa ok', () => {
    brokerTruth.note({ realizedToday: -3234.88, balance: 197053.22, login: 1514083666, server: 'FTMO-Demo' });
    const r = brokerTruth.reconcile(-3234.88);
    expect(r.ok).toBe(true);
    expect(r.brokerNet).toBeCloseTo(-3234.88, 2);
    expect(r.diff).toBeCloseTo(0, 2);
  });

  test('2026-07-31 senaryosu: 3.160 $ fark YAKALANIR', () => {
    brokerTruth.note({ realizedToday: -3234.88, login: 1514083666, server: 'FTMO-Demo' });
    const r = brokerTruth.reconcile(-74.51);   // raporun o gün dediği
    expect(r.ok).toBe(false);
    expect(r.brokerNet).toBeCloseTo(-3234.88, 2);
    expect(r.ledgerNet).toBeCloseTo(-74.51, 2);
    expect(r.diff).toBeCloseTo(3160.37, 2);    // defter bu kadar EKSİK
  });

  test('kuruşluk yuvarlama farkı uyarı üretmez', () => {
    brokerTruth.note({ realizedToday: -100.00 });
    expect(brokerTruth.reconcile(-100.4).ok).toBe(true);
    expect(brokerTruth.reconcile(-101.5).ok).toBe(false);
  });

  test('bayat anlık görüntü kullanılmaz (yanlış güven vermez)', () => {
    brokerTruth.note({ realizedToday: -50 });
    expect(brokerTruth.reconcile(-50, { maxAgeMs: 0 }).reason)
      .toBe('broker-anlik-goruntusu-yok');
  });

  test('geçersiz snapshot yok sayılır, eski doğru veriyi bozmaz', () => {
    brokerTruth.note({ realizedToday: -120 });
    brokerTruth.note({ realizedToday: 'abc' });
    brokerTruth.note(null);
    expect(brokerTruth.current().realizedToday).toBe(-120);
  });

  test('günlük rapor mutabakat satırını içerir', () => {
    const src = require('fs').readFileSync(
      require.resolve('../../src/services/botDailyReport/index.js'), 'utf8');
    expect(src).toContain('brokerTruth');
    expect(src).toMatch(/MUTABAKATSIZLIK/);
  });
});
