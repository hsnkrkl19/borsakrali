'use strict';

/**
 * closedBars — aile geneli KAPALI BAR süzgeci (forexKlines).
 *
 * (a) REGRESYON (2026-07-23, CANLI ÖLÇÜM): Yahoo, TF'ye hizalı FORMING barın
 *     ARDINA bir de "anlık kotasyon" satırı ekler. Yaygın slice(0,-1) kalıbı
 *     yalnız o satırı atar → geriye HÂLÂ OLUŞAN bar kalır ve sinyal yarım
 *     mumdan doğar. GC=F'te 75 sn arayla iki çekimde "değerlendirilen" 5m bar
 *     15:40'ın kapanışı 4054.60 → 4054.30 oldu (kapalı bar DEĞİŞEMEZ).
 *     signalId bara sabit olduğu için bar-içi geçici koşul kalıcı pozisyona ve
 *     köprüde GERÇEK MT5 emrine dönüşüyordu.
 *
 * (b) REGRESYON (aynı gün, ikinci bulgu): çözüm "hiza" (time % tfMs) ile
 *     yazılamaz. Yahoo GÜNLÜK barları epoch'a hizalı DEĞİLDİR — ölçüldü:
 *     GC=F/NQ=F/ES=F/SI=F 1d damgası 04:00 UTC, EURUSD=X 1d ise DST ile gezer.
 *     Hiza süzgeci bu serileri boşaltıp TÜM 1d botlarını SESSİZCE susturur.
 *     Bu dosya o senaryoyu açıkça korur.
 *
 * (c) İNVARYANT: çıktı HER ZAMAN slice(0,-1)'in alt kümesidir → değişiklik
 *     hiçbir bota DAHA ÖNCE GÖRMEDİĞİ bir bar gösteremez (yalnız forming
 *     barlar eksilir). Canlı sistemde tek yönlü güvenlik garantisi.
 */

const { closedBars, TF_MS, resampleHours } = require('../../src/services/forex/forexKlines');

const M5 = TF_MS['5m'];
const M15 = TF_MS['15m'];
const H1 = TF_MS['1h'];
const D1 = TF_MS['1d'];

const bar = (time, close = 100) => ({
  time, open: close, high: close + 1, low: close - 1, close, volume: 10,
});
const times = (arr) => arr.map((c) => c.time);

// Naif kalıbın birebir kendisi — testler onunla karşılaştırılır.
const naive = (all) => all.slice(0, -1);

describe('closedBars — Yahoo kotasyon satırı + forming bar', () => {
  const t0 = Date.UTC(2026, 6, 23, 15, 0);

  test('kotasyon satırı veri ucu sayılır; forming bar DA düşer', () => {
    const all = [
      bar(t0), bar(t0 + M5), bar(t0 + 2 * M5),
      bar(t0 + 3 * M5),            // 15:15 → forming
      bar(t0 + 3 * M5 + 104000),   // 15:16:44 → hizasız kotasyon satırı
    ];
    const out = closedBars(all, M5);
    expect(times(out)).toEqual([t0, t0 + M5, t0 + 2 * M5]);
  });

  test('slice(0,-1) AYNI GİRDİDE forming barı bırakır (hatanın kanıtı)', () => {
    const all = [
      bar(t0), bar(t0 + M5), bar(t0 + 2 * M5),
      bar(t0 + 3 * M5), bar(t0 + 3 * M5 + 104000),
    ];
    // Naif kalıp 15:15 forming barını "son kapalı bar" sanıyordu:
    expect(naive(all)[naive(all).length - 1].time).toBe(t0 + 3 * M5);
    // Süzgeç onu atar:
    expect(times(closedBars(all, M5))).not.toContain(t0 + 3 * M5);
  });

  test('GERÇEK GC=F 15m şekli: kotasyon satırı forming barın içinde durur', () => {
    // Ölçülen şekil (2026-07-23T19:49:12Z kotasyon, 19:45 barı forming).
    const b1930 = Date.UTC(2026, 6, 23, 19, 30);
    const all = [bar(b1930 - M15), bar(b1930), bar(b1930 + M15), bar(b1930 + M15 + 252000)];
    expect(times(closedBars(all, M15))).toEqual([b1930 - M15, b1930]);
  });
});

// (b) — hiza tabanlı çözümün öldüreceği seriler.
describe('closedBars — epoch\'a HİZASIZ günlük barlar (1d botları susmamalı)', () => {
  // GC=F/NQ=F/ES=F/SI=F: her 1d barı 04:00 UTC damgalı (time % 1d === 14400000).
  const d = (day, h = 4) => Date.UTC(2026, 6, day, h, 0);

  test('futures 1d (04:00 damgalı) — seri BOŞALMAZ, yalnız oluşan gün düşer', () => {
    const all = [d(20), d(21), d(22), d(23)].map((t) => bar(t));
    const out = closedBars(all, D1);
    expect(out.length).toBeGreaterThan(0);              // hiza süzgeci burada [] verirdi
    expect(times(out)).toEqual([d(20), d(21), d(22)]);  // 07-23 = oluşan gün
    expect(all.every((c) => c.time % D1 !== 0)).toBe(true); // hiçbiri epoch-hizalı değil
  });

  test('FX 1d (DST ile 23:00/00:00 arası GEZEN damga) — delik açılmaz', () => {
    // EURUSD=X: yazın 22:00, kışın 23:00; seride iki faz birlikte bulunabilir.
    const all = [
      bar(Date.UTC(2026, 6, 18, 23, 0)), bar(Date.UTC(2026, 6, 19, 23, 0)),
      bar(Date.UTC(2026, 6, 20, 23, 0)), bar(Date.UTC(2026, 6, 21, 23, 0)),
      bar(Date.UTC(2026, 6, 23, 20, 7)), // kotasyon satırı (gün ortası)
    ];
    const out = closedBars(all, D1);
    // 07-21T23:00 barı 07-22T23:00'te biter ⟶ veri ucundan (07-23T20:07) önce: KAPALI.
    expect(times(out)).toEqual([
      Date.UTC(2026, 6, 18, 23, 0), Date.UTC(2026, 6, 19, 23, 0),
      Date.UTC(2026, 6, 20, 23, 0), Date.UTC(2026, 6, 21, 23, 0),
    ]);
  });

  test('FX 1d: HENÜZ BİTMEMİŞ gün düşer (naif kalıp onu kapalı sanıyordu)', () => {
    // Canlı ölçüm: 07-22T23:00 barı 07-23T23:00'te biter; saat 20:07'de FORMING.
    const all = [
      bar(Date.UTC(2026, 6, 21, 23, 0)), bar(Date.UTC(2026, 6, 22, 23, 0)),
      bar(Date.UTC(2026, 6, 23, 20, 7)),
    ];
    expect(naive(all)[1].time).toBe(Date.UTC(2026, 6, 22, 23, 0)); // naif: "kapalı"
    expect(times(closedBars(all, D1))).toEqual([Date.UTC(2026, 6, 21, 23, 0)]);
  });
});

describe('closedBars — 4h/8h resample yolu (davranış DEĞİŞMEMELİ)', () => {
  test('kotasyon satırı bucket\'a kaynar; sonuç slice(0,-1) ile aynı', () => {
    // resampleHours 1h barları UTC kovalarına toplar; kotasyon satırı son kovaya
    // karışır, yani ayrı bir hizasız satır KALMAZ.
    const base = Date.UTC(2026, 6, 23, 0, 0) / 1000; // saniye (fetchCandles birimi)
    const h1 = [];
    for (let i = 0; i < 20; i++) h1.push(bar(base + i * 3600));
    h1.push(bar(base + 19 * 3600 + 2952)); // 19:49:12 kotasyon satırı
    const h4 = resampleHours(h1, 4);
    const out = closedBars(h4, TF_MS['4h']);
    expect(times(out)).toEqual(times(naive(h4)));
  });
});

describe('closedBars — invaryantlar ve sınır durumları', () => {
  const t0 = Date.UTC(2026, 6, 23, 15, 0);

  test('çıktı HER ZAMAN slice(0,-1)\'in alt kümesidir', () => {
    const shapes = [
      [bar(t0), bar(t0 + M5), bar(t0 + 2 * M5)],                          // kotasyonsuz
      [bar(t0), bar(t0 + M5), bar(t0 + 2 * M5), bar(t0 + 2 * M5 + 61000)], // kotasyonlu
      [bar(t0), bar(t0 + 3 * M5)],                                        // veri deliği
    ];
    for (const all of shapes) {
      const allowed = new Set(times(naive(all)));
      for (const t of times(closedBars(all, M5))) expect(allowed.has(t)).toBe(true);
    }
  });

  test('SABİT slice(0,-2) yanlış olurdu: kotasyon satırı yokken gerçek bar gider', () => {
    // Seans kapalı → kotasyon satırı yok. slice(0,-2) burada GERÇEK kapalı barı atar.
    const all = [bar(t0), bar(t0 + M5), bar(t0 + 2 * M5), bar(t0 + 3 * M5)];
    expect(times(closedBars(all, M5))).toContain(t0 + 2 * M5);
    expect(times(all.slice(0, -2))).not.toContain(t0 + 2 * M5);
  });

  test('saniye cinsinden time kabul edilir; DÖNEN satırlar orijinal birimde', () => {
    const s0 = Math.floor(t0 / 1000);
    const all = [bar(s0), bar(s0 + 300), bar(s0 + 600), bar(s0 + 704)];
    const out = closedBars(all, M5);
    expect(times(out)).toEqual([s0, s0 + 300]); // ms'e çevrilmiş değerler DÖNMEZ
  });

  test('1h serisinde forming bar + kotasyon satırı', () => {
    const h = Date.UTC(2026, 6, 23, 17, 0);
    const all = [bar(h), bar(h + H1), bar(h + 2 * H1), bar(h + 2 * H1 + 2952000)];
    expect(times(closedBars(all, H1))).toEqual([h, h + H1]);
  });

  test('boş/geçersiz girdi güvenli', () => {
    expect(closedBars([], M5)).toEqual([]);
    expect(closedBars(null, M5)).toEqual([]);
    expect(closedBars(undefined, M5)).toEqual([]);
    expect(closedBars([bar(t0)], 0)).toEqual([]);
    expect(closedBars([bar(t0)], undefined)).toEqual([]);
    expect(closedBars([{ time: NaN, close: 1 }], M5)).toEqual([]);
  });

  test('tek bar → kapalılık kanıtı yok → boş', () => {
    expect(closedBars([bar(t0)], M5)).toEqual([]);
  });

  test('TF_MS aile TF\'lerinin tamamını kapsar', () => {
    for (const tf of ['1m', '5m', '15m', '30m', '1h', '4h', '8h', '1d']) {
      expect(TF_MS[tf]).toBeGreaterThan(0);
    }
  });
});
