/**
 * GOLDEN TEST — NR7 Gölge: SUPABASE'ten dedup geri yükleme (2026-07-21 olayının ASIL yolu).
 *
 * Prod'da (Render) disk GEÇİCİ; tek kalıcı yol Supabase. Eski load() dedup'ı
 * `p.trades.length > state.trades.length` kapısına bağlıyordu → gün içinde giriş
 * olup henüz kapanış yokken (trades=0) `sent` GERİ YÜKLENMİYOR, her soğuk
 * başlangıç aynı girişi TEKRAR duyuruyordu.
 *
 * ⚠️ Bu test ESKİ kodda BAŞARISIZ olur (mesaj gider), yeni kodda geçer.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nr7supa-'));
process.env.NR7_SHADOW_FILE = path.join(TMP, 'nr7-shadow.json');   // BOŞ disk (Render gibi)

// Bugünün beklenen "fill" anahtarı — simDay: kırılım barından SONRAKİ barda dolum
const BASE = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);
const TODAY = new Date().toISOString().slice(0, 10);
const FILL_KEY = `${TODAY}:fill:${BASE + 10800}:1`;

// Supabase AÇIK gibi davran; uzak durumda trades BOŞ ama dedup anahtarı VAR
const mockRemote = { trades: [], sent: { [FILL_KEY]: Math.floor(Date.now() / 1000) }, open: null, version: 1 };
jest.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: () => true,
  supabaseAdmin: {
    storage: {
      from: () => ({
        download: async () => ({ data: { text: async () => JSON.stringify(mockRemote) } }),
        upload: async () => ({ error: null }),
      }),
    },
  },
}));

const sent = [];
jest.mock('../../src/services/telegramService', () => ({
  sendMessage: async (chat, msg) => { sent.push({ chat, msg }); return { success: true }; },
}));
jest.mock('../../src/services/signalDelivery', () => ({ signalChannel: () => '-100999' }));
jest.mock('../../src/services/botCompetition/competitionManager', () => ({
  recordOpen: () => ({ ok: true }), recordClose: () => ({ ok: true }),
}));
jest.mock('../../src/services/forex/forexKlines', () => ({
  fetchCandles: async (_sym, tf) => {
    if (tf === '1d') {
      const days = [];
      for (let i = 0; i < 8; i++) {
        const wide = i < 7;
        days.push({ time: 1784400000 + i * 86400, open: 100, high: wide ? 110 : 102, low: wide ? 90 : 100, close: 101 });
      }
      days.push({ time: 1784400000 + 8 * 86400, open: 101, high: 103, low: 100, close: 102 });
      return days;
    }
    const b = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);
    return [
      { time: b + 3600, open: 101, high: 101.5, low: 100.5, close: 101 },
      { time: b + 7200, open: 101, high: 103, low: 101, close: 102.5 },    // kırılım
      { time: b + 10800, open: 102.5, high: 103, low: 102, close: 102.8 }, // DOLUM barı
      { time: b + 14400, open: 102.8, high: 103, low: 102, close: 102.9 }, // oluşan (atılır)
    ];
  },
}));

const nr7 = require('../../src/services/nr7Shadow/nr7Shadow');

describe('NR7 Gölge — Supabase dedup geri yükleme (trades=0)', () => {
  test('⭐ uzakta trades=0 ama sent VAR → giriş TEKRAR duyurulmaz', async () => {
    sent.length = 0;
    nr7._resetForTest();
    nr7._setLoadedForTest(false);      // taze süreç: load() Supabase'ten okuyacak
    await nr7.tick();
    expect(sent.length).toBe(0);       // ESKİ KODDA 1 olurdu (mükerrer duyuru)
  });

  test('kontrol: uzakta sent BOŞ ise duyuru YAPILIR (test gerçekten ölçüyor)', async () => {
    sent.length = 0;
    mockRemote.sent = {};
    nr7._resetForTest();
    nr7._setLoadedForTest(false);
    await nr7.tick();
    expect(sent.length).toBeGreaterThan(0);
  });
});
