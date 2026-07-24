'use strict';

/**
 * GOLDEN TEST — Bot Builder kalıcılığı (2026-07-24 denetiminde bulunan SESSİZ no-op).
 *
 * botPersistence.save() beyaz listede OLMAYAN dosya adı için sessizce hiçbir şey
 * yapmıyordu. 'bot-builder' SUBDIRS'te vardı ama 'state.json'/'runner.json' FILES'ta
 * YOKTU → panelden oluşturulan özel botlar ve onların açık kağıt pozisyonları
 * Supabase'e HİÇ yazılmıyordu. Render diski geçici olduğu için her deploy'da
 * kayboluyorlardı; dahası pozisyon feed'den düşünce köprü gerçek MT5 işlemini de
 * kapatıyordu (close_on_backend_close).
 *
 * ⚠️ Bu testler ESKİ kodda BAŞARISIZ olur (bucket boş kalır, bot geri gelmez).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'botbuilder-persist-'));
// botPersistence kökü ile store/runner'ın yazdığı dizin AYNI olmalı (loadAll oraya
// geri yazar). BOT_BUILDER_DATA_DIR ayrıca TEST_EPHEMERAL'i kapatır — yoksa
// persist() daha ilk satırda return eder ve test hiçbir şey ölçmez.
const PREV_ENV = { data: process.env.BOT_DATA_DIR, builder: process.env.BOT_BUILDER_DATA_DIR };
process.env.BOT_DATA_DIR = TMP;
process.env.BOT_BUILDER_DATA_DIR = path.join(TMP, 'bot-builder');

// Supabase yerine bellek-içi bucket (prod'daki TEK kalıcı yol)
const mockBucket = new Map();
jest.mock('../../src/lib/supabase', () => ({
  isSupabaseEnabled: () => true,
  supabaseAdmin: {
    storage: {
      listBuckets: async () => ({ data: [{ name: 'bot-state' }], error: null }),
      from: () => ({
        upload: async (key, body) => { mockBucket.set(key, body.toString('utf8')); return { error: null }; },
        download: async (key) => (mockBucket.has(key)
          ? { data: { text: async () => mockBucket.get(key) }, error: null }
          : { data: null, error: new Error('not found') }),
        remove: async (keys) => { for (const k of keys) mockBucket.delete(k); return { error: null }; },
      }),
    },
  },
}));

const botPersistence = require('../../src/services/botPersistence');
const store = require('../../src/services/botBuilder/store');
const runner = require('../../src/services/botBuilder/customBotRunner');

function upSeries(n = 300) {
  const c = []; let px = 100, t = 1700000000;
  for (let i = 0; i < n; i++) {
    const o = px, cl = 100 + i * 0.15 + Math.sin(i / 12) * 2 + ((i % 5) - 2) * 0.3;
    c.push({ time: t, open: o, high: Math.max(o, cl) + 0.5, low: Math.min(o, cl) - 0.5, close: cl, volume: 1000 });
    px = cl; t += 3600;
  }
  return c;
}
const DEPS = {
  forexKlines: { fetchCandles: async () => upSeries() },
  getInstrument: (id) => ({ id, symbol: id, yahoo: id }),
  ictSmc: { analyzeLatest: () => [] },
};
const BOT = { name: 'Kalıcılık Botu', indicators: ['ema', 'rsi', 'adx', 'macd'], logic: 'all', timeframes: ['1h'], pairs: ['BTCUSD'] };

/** Render deploy'u: yerel disk uçar, süreç sıfırdan başlar — kalan tek yer bucket. */
function coldStart() {
  fs.rmSync(TMP, { recursive: true, force: true });
  store._dangerouslyResetForTest();
  runner._dangerouslyResetForTest();
}

beforeEach(() => {
  mockBucket.clear();
  store._dangerouslyResetForTest();
  runner._dangerouslyResetForTest();
});
afterAll(() => {
  // env'i geri al: aynı jest worker'ında sonra çalışan botBuilder.golden.test.js
  // TEST_EPHEMERAL'i modül yüklenirken okur, sızdırırsak diske yazmaya başlar.
  if (PREV_ENV.data === undefined) delete process.env.BOT_DATA_DIR; else process.env.BOT_DATA_DIR = PREV_ENV.data;
  if (PREV_ENV.builder === undefined) delete process.env.BOT_BUILDER_DATA_DIR; else process.env.BOT_BUILDER_DATA_DIR = PREV_ENV.builder;
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('Bot Builder — Supabase kalıcılığı (deploy sonrası hayatta kalma)', () => {
  test('⭐ özel bot tanımı deploy sonrası geri gelir (state.json)', async () => {
    const bot = store.createCustom(BOT);
    store.setBotTimeframes('forex-signals', ['4h']); // 15 botun TF filtresi de aynı dosyada
    await botPersistence.flushAll();                 // debounce'u atla

    expect(mockBucket.has('bot-builder/state.json')).toBe(true); // ESKİ KODDA false

    coldStart();
    await botPersistence.loadAll();
    store.reload();
    expect(store.listCustom().map((b) => b.id)).toContain(bot.id);
    expect(store.getBotTimeframes('forex-signals')).toEqual(['4h']);
  });

  test('⭐ açık kağıt pozisyon deploy sonrası feed\'de kalır (runner.json)', async () => {
    const bot = store.createCustom(BOT);
    const r = await runner.run(DEPS);
    expect(r.opened).toBe(1);
    await botPersistence.flushAll();

    expect(mockBucket.has('bot-builder/runner.json')).toBe(true); // ESKİ KODDA false

    coldStart();
    await botPersistence.loadAll();
    store.reload();
    runner.reload();
    const feed = runner.feed();
    expect(feed.length).toBe(1);
    expect(feed[0].botId).toBe(bot.id);
    expect(feed[0].magic).toBe(bot.magic);
  });

  test('kontrol: bucket boşsa bot geri GELMEZ (test gerçekten ölçüyor)', async () => {
    store.createCustom(BOT);
    await botPersistence.flushAll();
    mockBucket.clear();

    coldStart();
    await botPersistence.loadAll();
    store.reload();
    expect(store.listCustom().length).toBe(0);
  });

  test('reload() olmadan lazy load BOŞ state\'i cache\'ler (server-live sırası şart)', async () => {
    store.createCustom(BOT);
    await runner.run(DEPS);
    await botPersistence.flushAll();

    coldStart();
    runner.feed();               // köprünün erken POST'u: loadAll bitmeden okur
    await botPersistence.loadAll();
    expect(runner.feed().length).toBe(0); // cache'lenmiş boş state
    runner.reload();                      // server-live'ın loadAll sonrası yaptığı
    expect(runner.feed().length).toBe(1);
  });
});

describe('Bot Builder — silinen botun yetim pozisyonu', () => {
  test('⭐ deleteCustom açık kağıt pozisyonları da düşürür', async () => {
    const bot = store.createCustom(BOT);
    await runner.run(DEPS);
    expect(runner.feed().length).toBe(1);

    store.deleteCustom(bot.id);

    // ESKİ KODDA 1: run() silinen botu artık gezmez → SL/TP hiç kontrol edilmez,
    // pozisyon feed'de sonsuza dek kalır, köprüdeki gerçek işlem yetim olurdu.
    expect(runner.feed().length).toBe(0);
    expect(Object.keys(runner._state().open).length).toBe(0);
  });

  test('silme yalnız o botu etkiler, diğerinin pozisyonu durur', async () => {
    const a = store.createCustom({ ...BOT, name: 'A' });
    const b = store.createCustom({ ...BOT, name: 'B', pairs: ['ETHUSD'] });
    await runner.run(DEPS);
    expect(runner.feed().length).toBe(2);

    store.deleteCustom(a.id);
    const feed = runner.feed();
    expect(feed.length).toBe(1);
    expect(feed[0].botId).toBe(b.id);
  });
});
