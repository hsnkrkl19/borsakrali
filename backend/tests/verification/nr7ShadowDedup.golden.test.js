/**
 * GOLDEN TEST — NR7 Gölge botu MÜKERRER DUYURU regresyonu (2026-07-21 olayı).
 *
 * Olay: gün içinde giriş oldu ama henüz KAPANIŞ yoktu (trades=0). load() dedup
 * sözlüğünü `p.trades.length > state.trades.length` kapısına bağladığı için
 * Supabase'ten `sent` GERİ YÜKLENMİYORDU; Render'da disk de geçici olduğundan her
 * soğuk başlangıç/deploy aynı girişi TEKRAR Telegram'a attı (yüzlerce mesaj).
 *
 * Bu test kapıyı kilitler: trades=0 iken bile dedup geri yüklenmeli ve aynı olay
 * ikinci kez duyurulmamalı.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nr7-'));
process.env.NR7_SHADOW_FILE = path.join(TMP, 'nr7-shadow.json');
// This regression suite measures the legacy sender's dedup semantics.
process.env.MT5_LEGACY_PAPER_NOTIFY = '1';

// Telegram'ı mock'la — kaç mesaj gittiğini say
const sent = [];
jest.mock('../../src/services/telegramService', () => ({
  sendMessage: async (chat, msg) => { sent.push({ chat, msg }); return { success: true }; },
}));
jest.mock('../../src/services/signalDelivery', () => ({ signalChannel: () => '-100999' }));
jest.mock('../../src/services/botCompetition/competitionManager', () => ({
  recordOpen: () => ({ ok: true }), recordClose: () => ({ ok: true }),
}));
// Mum verisi: dün NR7 (en dar aralık) + bugün kırılım
jest.mock('../../src/services/forex/forexKlines', () => ({
  ...jest.requireActual('../../src/services/forex/forexKlines'), // closedBars/TF_MS saf kalsın
  fetchCandles: async (_sym, tf) => {
    if (tf === '1d') {
      const days = [];
      for (let i = 0; i < 8; i++) {
        const wide = i < 7;
        days.push({ time: 1784400000 + i * 86400, open: 100, high: wide ? 110 : 102, low: wide ? 90 : 100, close: 101 });
      }
      days.push({ time: 1784400000 + 8 * 86400, open: 101, high: 103, low: 100, close: 102 }); // oluşan bar
      return days;
    }
    // 1h: bugüne ait kapanmış barlar — biri yukarı kırılım
    const base = Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);
    return [
      { time: base + 3600, open: 101, high: 101.5, low: 100.5, close: 101 },
      { time: base + 7200, open: 101, high: 103, low: 101, close: 102.5 },   // > hi(102) → kırılım
      { time: base + 10800, open: 102.5, high: 103, low: 102, close: 102.8 },
      { time: base + 14400, open: 102.8, high: 103, low: 102, close: 102.9 }, // oluşan (slice ile atılır)
    ];
  },
}));

const nr7 = require('../../src/services/nr7Shadow/nr7Shadow');

describe('NR7 Gölge — mükerrer duyuru regresyonu', () => {
  beforeEach(() => { sent.length = 0; });

  afterAll(() => { delete process.env.MT5_LEGACY_PAPER_NOTIFY; });

  test('aynı süreçte tekrar tick → İKİNCİ mesaj YOK (bellek-içi dedup)', async () => {
    nr7._resetForTest();
    await nr7.tick();
    const first = sent.length;
    expect(first).toBeGreaterThan(0);          // giriş duyuruldu
    await nr7.tick();
    await nr7.tick();
    expect(sent.length).toBe(first);           // tekrar duyurulmadı
  });

  test('⭐ RESTART (trades=0) → dedup diskten geri yüklenir, TEKRAR duyurmaz', async () => {
    nr7._resetForTest();
    await nr7.tick();
    const first = sent.length;
    expect(first).toBeGreaterThan(0);

    // Kaydedilen durumda kapanmış işlem YOK ama dedup anahtarı VAR (olayın özü)
    const saved = JSON.parse(fs.readFileSync(process.env.NR7_SHADOW_FILE, 'utf8'));
    expect(saved.trades.length).toBe(0);
    expect(Object.keys(saved.sent).length).toBeGreaterThan(0);

    // Süreç yeniden başladı: bellek sıfır, load() diskten okur
    nr7._resetForTest();
    nr7._setLoadedForTest(false);
    await nr7.tick();
    expect(sent.length).toBe(first);           // ⭐ mükerrer YOK
  });
});
