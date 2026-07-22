'use strict';

/**
 * resampleHours (forexKlines + cryptoKlines ikizi) — 1h→4h/8h toplama.
 *
 * (a) KARAKTERİZASYON: boşluksuz 1h seride davranış SABİT (eski dizi-pozisyonu
 *     gruplamasıyla birebir aynı çıktı) — düzeltme tam veride hiçbir şeyi
 *     değiştirmemeli.
 * (b) REGRESYON (denetim 2026-07-22): aradaki eksik 1h bar (NQ=F/ES=F günlük
 *     bakım saati → 23 barlık gün, FX hafta sonu boşluğu, Yahoo veri deliği)
 *     sonraki buketlerin UTC 4h hizasını KAYDIRMAMALI. Her bar kendi zaman
 *     damgasının floor(time/4h) buketine atanır; seans-karışımlı sentetik
 *     4h bar oluşamaz.
 */

const { resampleHours } = require('../../src/services/forex/forexKlines');
const crypto = require('../../src/services/cryptoKlines');

const H = 3600;               // saniye
const H4 = 4 * H;
// 4h VE 8h UTC sınırına bölünen taban (1700006400 % 28800 === 0)
const BASE = 1700006400;

function bar(time, open, close, high, low, volume = 10) {
  return {
    time, open, close,
    high: high ?? Math.max(open, close),
    low: low ?? Math.min(open, close),
    volume,
  };
}

// [startHour, endHour) saat aralığında, skipHours'taki saatler ATLANARAK
// ardışık 1h barlar üretir. Fiyat saat indeksinden deterministik türetilir.
function hourlySeries(startSec, hoursCount, skipOffsets = []) {
  const skip = new Set(skipOffsets);
  const out = [];
  for (let i = 0; i < hoursCount; i++) {
    if (skip.has(i)) continue;
    const t = startSec + i * H;
    out.push(bar(t, 100 + i, 100.5 + i, 101 + i, 99.5 + i));
  }
  return out;
}

describe('resampleHours — boşluksuz seri (karakterizasyon)', () => {
  test('24 tam saat → 6 hizalı 4h bar, OHLCV grubun kendisinden', () => {
    const h1 = hourlySeries(BASE, 24);
    const out = resampleHours(h1, 4);

    expect(out).toHaveLength(6);
    out.forEach((b, i) => {
      expect(b.time).toBe(BASE + i * H4);
      expect(b.time % H4).toBe(0);
      expect(b.open).toBe(h1[i * 4].open);            // buketin İLK barının açılışı
      expect(b.close).toBe(h1[i * 4 + 3].close);      // buketin SON barının kapanışı
      expect(b.high).toBe(Math.max(...h1.slice(i * 4, i * 4 + 4).map(c => c.high)));
      expect(b.low).toBe(Math.min(...h1.slice(i * 4, i * 4 + 4).map(c => c.low)));
      expect(b.volume).toBe(40);                      // 4 × 10
    });
  });

  test('sınır ortasında başlayan pencere → eksik-açılışlı ilk buket düşer', () => {
    // BASE+2h'te başlar: ilk buketin (BASE) 0. ve 1. saati pencere dışında.
    const h1 = hourlySeries(BASE + 2 * H, 10);
    const out = resampleHours(h1, 4);
    expect(out[0].time).toBe(BASE + H4);              // ilk TAM buketten başlar
    out.forEach(b => expect(b.time % H4).toBe(0));
  });

  test('sondaki yarım buket (forming 4h) korunur', () => {
    const h1 = hourlySeries(BASE, 10);                // 2 tam buket + 2 saatlik kuyruk
    const out = resampleHours(h1, 4);
    expect(out).toHaveLength(3);
    expect(out[2].time).toBe(BASE + 2 * H4);
    expect(out[2].close).toBe(h1[9].close);
  });

  test('8h toplama da hizalı', () => {
    const out = resampleHours(hourlySeries(BASE, 24), 8);
    expect(out).toHaveLength(3);
    out.forEach((b, i) => expect(b.time).toBe(BASE + i * 8 * H));
  });

  test('boş/eksik girişte güvenli', () => {
    expect(resampleHours(null, 4)).toEqual([]);
    expect(resampleHours([], 4)).toEqual([]);
  });
});

describe('resampleHours — veri boşluğu hizayı KAYDIRMAMALI (regresyon, denetim 2026-07-22)', () => {
  test('endeks vadelisi bakım saati (23 barlık günler): tüm buketler 4h sınırında kalır', () => {
    // 3 gün × 24 saat; her günün 21. saati (bakım molası) EKSİK → NQ=F/ES=F düzeni.
    const skips = [21, 24 + 21, 48 + 21];
    const h1 = hourlySeries(BASE, 72, skips);
    expect(h1).toHaveLength(69);

    const out = resampleHours(h1, 4);

    // HER buket UTC 4h sınırında — eski kodda ilk delikten sonra TÜMÜ kayıyordu.
    out.forEach(b => expect(b.time % H4).toBe(0));

    // Gün başına 6 buket (20:00 buketi 3 barlık), 3 günde 18.
    expect(out).toHaveLength(18);
    for (let d = 0; d < 3; d++) {
      for (let q = 0; q < 6; q++) {
        expect(out[d * 6 + q].time).toBe(BASE + d * 24 * H + q * H4);
      }
    }
  });

  test('bakım-delikli 20:00 buketi seans karıştırmaz: kapanışı 23:00 barından, ertesi günden BAR ALMAZ', () => {
    const h1 = hourlySeries(BASE, 48, [21, 24 + 21]);   // 2 × 23 barlık gün
    const out = resampleHours(h1, 4);

    const b20 = out.find(b => b.time === BASE + 20 * H);
    const bar23 = h1.find(c => c.time === BASE + 23 * H);
    const bar22 = h1.find(c => c.time === BASE + 22 * H);
    expect(b20.close).toBe(bar23.close);                // 23:00 kapanışı (ertesi gün 00:00 DEĞİL)
    expect(b20.high).toBe(Math.max(h1.find(c => c.time === BASE + 20 * H).high, bar22.high, bar23.high));
    expect(b20.volume).toBe(30);                        // 3 bar × 10 (4 değil!)

    // Ertesi günün 00:00 buketi kendi gününün 00:00 barıyla AÇILIR.
    const day2open = out.find(b => b.time === BASE + 24 * H);
    expect(day2open.open).toBe(h1.find(c => c.time === BASE + 24 * H).open);
  });

  test('FX hafta sonu boşluğu: Pazartesi buketleri sınırda, hafta sonunu köprüleyen sentetik bar yok', () => {
    // Cuma 00:00–20:00 (21 bar) + ~51 saatlik boşluk + Pazartesi 24 saat.
    const friday = hourlySeries(BASE, 21);
    const monday = hourlySeries(BASE + 72 * H, 24);
    const out = resampleHours([...friday, ...monday], 4);

    out.forEach(b => expect(b.time % H4).toBe(0));

    // Cuma 20:00 buketi tek barlık kalır, boşluğun ötesine uzanamaz.
    const fri20 = out.find(b => b.time === BASE + 20 * H);
    expect(fri20.volume).toBe(10);
    expect(fri20.close).toBe(friday[20].close);

    // Pazartesi 00:00 buketi tam ve kendi barlarından.
    const mon0 = out.find(b => b.time === BASE + 72 * H);
    expect(mon0.open).toBe(monday[0].open);
    expect(mon0.volume).toBe(40);
  });

  test('tek barlık Yahoo veri deliği bile sonraki buketleri kaydırmaz', () => {
    const h1 = hourlySeries(BASE, 40, [7]);             // 07:00 barı yok
    const out = resampleHours(h1, 4);
    out.forEach(b => expect(b.time % H4).toBe(0));
    const b8 = out.find(b => b.time === BASE + 8 * H);
    expect(b8.open).toBe(h1.find(c => c.time === BASE + 8 * H).open);
  });
});

describe('cryptoKlines.resampleHours — forexKlines ile aynı sözleşme (ikiz kopya)', () => {
  test('bakım deliğinde hiza kaymaz', () => {
    const h1 = hourlySeries(BASE, 48, [21, 24 + 21]);
    const out = crypto.resampleHours(h1, 4);
    out.forEach(b => expect(b.time % H4).toBe(0));
    expect(out).toHaveLength(12);
  });

  test('boşluksuz seride forexKlines ile birebir aynı çıktı', () => {
    const h1 = hourlySeries(BASE, 24);
    expect(crypto.resampleHours(h1, 4)).toEqual(resampleHours(h1, 4));
  });
});
