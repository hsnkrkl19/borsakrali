/**
 * GOLDEN TESTS — botEngine sahte-stop koruması (detectBistExit) + priceInBand
 * Faz 3 / D5. Bu testler 2026-06-07'de düzeltilen GERÇEK bug'ı (tavandaki/seyrek
 * işlemli hissede tek bozuk tick yüzünden sahte stop) regresyona karşı kilitler.
 *
 * liveDataService (ESM dynamic-import + interval) ve botPersistence (Supabase)
 * mock'lanır → modül izole & hızlı yüklenir; saf fonksiyonlar test edilir.
 */
jest.mock('../../src/services/liveDataService', () => ({
  getStock: () => null,
  fetchHistoricalData: async () => [],
}));
jest.mock('../../src/services/botPersistence', () => ({
  save: () => {},
  loadAll: async () => {},
}));

const { detectBistExit, priceInBand } = require('../../src/services/tradingBotV2/botEngine');

describe('priceInBand — BIST ±%20 veri-hatası filtresi', () => {
  test('referans (prevClose) yoksa doğrula sayılır', () => {
    expect(priceInBand(50, 0)).toBe(true);
    expect(priceInBand(50, null)).toBe(true);
  });
  test('band içi ve sınırlar geçerli', () => {
    expect(priceInBand(100, 100)).toBe(true);
    expect(priceInBand(120, 100)).toBe(true); // +%20 sınır
    expect(priceInBand(80, 100)).toBe(true);  // -%20 sınır
  });
  test('band dışı → false (veri hatası)', () => {
    expect(priceInBand(121, 100)).toBe(false);
    expect(priceInBand(79, 100)).toBe(false);
    expect(priceInBand(50, 100)).toBe(false);
  });
  test('geçersiz değerler → false', () => {
    expect(priceInBand(0, 100)).toBe(false);
    expect(priceInBand(-5, 100)).toBe(false);
    expect(priceInBand(NaN, 100)).toBe(false);
  });
});

describe('detectBistExit — çok-günlük pozisyon (gün low/high ile doğrulama)', () => {
  const pos = { entryDate: '2020-01-01T10:00:00.000Z', currentStop: 90, currentTarget: 110 };

  test('gerçek gün düşüğü stop\'a değdi → stop, tam currentStop\'tan', () => {
    const ev = detectBistExit(pos, { price: 95, previousClose: 100, low: 89, high: 101 });
    expect(ev.hit).toBe('stop');
    expect(ev.exitPrice).toBe(90);
  });
  test('gün düşüğü stop üstünde → çıkış YOK', () => {
    const ev = detectBistExit(pos, { price: 100, previousClose: 100, low: 95, high: 101 });
    expect(ev.hit).toBeNull();
  });
  test('gerçek gün yükseği hedefe ulaştı → target, tam currentTarget\'tan', () => {
    const ev = detectBistExit(pos, { price: 105, previousClose: 100, low: 99, high: 111 });
    expect(ev.hit).toBe('target');
    expect(ev.exitPrice).toBe(110);
  });

  // ── Asıl regresyon koruması ──
  test('SAHTE-STOP: bozuk tek tick (band dışı) + sağlam gün düşüğü → stop YOK', () => {
    // price 50 = %50 düşüş (fiziksel imkansız) reddedilir; gün düşüğü 95 stop üstünde
    const ev = detectBistExit(pos, { price: 50, previousClose: 100, low: 95, high: 101 });
    expect(ev.hit).toBeNull();
    expect(ev.lastGood).toBeNull(); // bozuk fiyat lastPrice'a yazılmaz
  });
  test('bozuk tick ama GERÇEK gün düşüğü stop\'u kırdı → stop yine yakalanır', () => {
    const ev = detectBistExit(pos, { price: 50, previousClose: 100, low: 88, high: 101 });
    expect(ev.hit).toBe('stop');
  });
  test('tüm veri band dışı → pozisyon korunur (hit yok, lastGood yok)', () => {
    const ev = detectBistExit(pos, { price: 50, previousClose: 100, low: 50, high: 50 });
    expect(ev.hit).toBeNull();
    expect(ev.lastGood).toBeNull();
  });
});

describe('detectBistExit — giriş günü koruması', () => {
  test('giriş bugünse gün düşüğü yok sayılır (pre-entry hareket), sadece anlık fiyat', () => {
    const pos = { entryDate: new Date().toISOString(), currentStop: 90, currentTarget: 110 };
    // gün düşüğü 85 < stop 90 AMA giriş günü → düşük yok sayılır, fiyat 100 → stop yok
    const ev = detectBistExit(pos, { price: 100, previousClose: 100, low: 85, high: 101 });
    expect(ev.hit).toBeNull();
  });
});
