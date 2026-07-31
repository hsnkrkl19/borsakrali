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

  test('F4: iki taraf da SIFIR ise mutabakat ONAYLANMAZ', () => {
    // 2026-08-01 düşman incelemesi: köprü `realizedToday`'i bildirim
    // imlecinden üretiyordu; kararlı durumda değer neredeyse her zaman 0,00
    // oluyordu. Defter TAMAMEN boşken (2026-07-31 olayının tam kendisi)
    // |0−0| ≤ tolerans → "✅ Mutabakat OK" yeşil ışığı veriyordu. Emniyet ağı
    // yakalamak için yazıldığı olayı ONAYLIYORDU.
    brokerTruth.note({ realizedToday: 0, login: 1514083666 });
    const r = brokerTruth.reconcile(0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('iki-taraf-da-sifir-dogrulanamaz');
  });

  test('F4: broker 0 iken defter doluysa MUTABAKATSIZLIK (sessiz geçmez)', () => {
    brokerTruth.note({ realizedToday: 0, login: 1514083666 });
    expect(brokerTruth.reconcile(-3234.88).ok).toBe(false);
  });

  test('F4: hesap uyuşmuyorsa karşılaştırma yapılmaz', () => {
    brokerTruth.note({ realizedToday: -100, login: 1513908484 });
    const r = brokerTruth.reconcile(-100, { expectedAccount: 1514083666 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('hesap-uyusmuyor');
  });

  test('F4: köprü realizedToday değerini imleçten BAĞIMSIZ pencereden üretir', () => {
    const src = require('fs').readFileSync(
      require.resolve('../../../mt5-bridge/borsakrali_account_brain.py'), 'utf8');
    // Ayrı gün penceresi fonksiyonu olmalı ve snapshot onu kullanmalı.
    expect(src).toContain('def _day_deals()');
    expect(src).toContain('day_deals = _day_deals()');
    // Eski hata: snapshot _history() çıktısını (imleç penceresi) kullanıyordu.
    expect(src).not.toContain('realized = _realized_today(deals)');
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
