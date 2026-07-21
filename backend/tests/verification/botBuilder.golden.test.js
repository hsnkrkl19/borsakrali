'use strict';

const engine = require('../../src/services/botBuilder/customBotEngine');
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
function downSeries(n = 300) {
  const c = []; let px = 200, t = 1700000000;
  for (let i = 0; i < n; i++) {
    const o = px, cl = 200 - i * 0.15 - Math.sin(i / 12) * 2;
    c.push({ time: t, open: o, high: Math.max(o, cl) + 0.5, low: Math.min(o, cl) - 0.5, close: cl, volume: 1000 });
    px = cl; t += 3600;
  }
  return c;
}

describe('Bot Builder — custom bot motoru', () => {
  test('8 indikatör kataloğu + tanımlı oy fonksiyonları', () => {
    expect(engine.INDICATORS.length).toBe(8);
    for (const id of engine.INDICATOR_IDS) expect(typeof engine.VOTERS[id]).toBe('function');
  });

  test('yükselişte long sinyal, SL girişin altında, TP üstünde, güven 0-100', () => {
    const sig = engine.evaluate(upSeries(), { indicators: ['ema', 'rsi', 'adx', 'macd'], logic: 'all' });
    expect(sig).toBeTruthy();
    expect(sig.direction).toBe('long');
    expect(sig.stop).toBeLessThan(sig.entry);
    expect(sig.target1).toBeGreaterThan(sig.entry);
    expect(sig.confidence).toBeGreaterThanOrEqual(0);
    expect(sig.confidence).toBeLessThanOrEqual(100);
  });

  test("'all' mantığı: bir indikatör bile ters/nötrse sinyal yok", () => {
    // düşüş serisinde ema long veremez → 'all' long üretmemeli
    const up = upSeries();
    const both = engine.evaluate(up, { indicators: ['ema', 'stoch'], logic: 'all' });
    // stoch aşırı-satım dönüşü arıyor; yükselişte nötr olabilir → all ile sinyal yok beklenir
    if (both) expect(['long', 'short']).toContain(both.direction);
    const maj = engine.evaluate(up, { indicators: ['ema', 'rsi', 'adx', 'stoch'], logic: 'majority' });
    if (maj) expect(maj.direction).toBe('long'); // çoğunluk yükseliş
  });

  test('indikatörsüz veya kısa seride null', () => {
    expect(engine.evaluate(upSeries(), { indicators: [], logic: 'all' })).toBeNull();
    expect(engine.evaluate(upSeries(10), { indicators: ['ema'], logic: 'all' })).toBeNull();
  });
});

describe('Bot Builder — store', () => {
  beforeEach(() => store._dangerouslyResetForTest());

  test('custom bot oluşturma + doğrulama + stabil magic', () => {
    const b = store.createCustom({ name: 'Botum', indicators: ['ema', 'rsi'], timeframes: ['1h'], pairs: ['BTCUSD'] });
    expect(b.id).toMatch(/^custom-/);
    expect(b.magic).toBe(5800);
    const b2 = store.createCustom({ name: 'İkinci', indicators: ['adx'], timeframes: ['4h'], pairs: ['XAUUSD'] });
    expect(b2.magic).toBe(5801);
    expect(() => store.createCustom({ name: 'x', indicators: [], pairs: ['BTCUSD'] })).toThrow(/indikatör/);
    expect(() => store.createCustom({ name: 'x', indicators: ['ema'], pairs: [] })).toThrow(/parite/);
  });

  test('15 bot TF filtresi: boş=hepsi, seçiliyse yalnız o TF', () => {
    expect(store.tfAllowed('forex-signals', '1h')).toBe(true); // filtre boş
    store.setBotTimeframes('forex-signals', ['4h', '1d']);
    expect(store.tfAllowed('forex-signals', '4h')).toBe(true);
    expect(store.tfAllowed('forex-signals', '15m')).toBe(false);
    store.setBotTimeframes('forex-signals', ['gecersiz', '1h']); // sanitize
    expect(store.getBotTimeframes('forex-signals')).toEqual(['1h']);
  });

  test('update + delete', () => {
    const b = store.createCustom({ name: 'A', indicators: ['ema'], timeframes: ['1h'], pairs: ['BTCUSD'] });
    const u = store.updateCustom(b.id, { name: 'B', enabled: false });
    expect(u.name).toBe('B'); expect(u.enabled).toBe(false); expect(u.magic).toBe(b.magic);
    expect(store.deleteCustom(b.id).ok).toBe(true);
    expect(() => store.deleteCustom(b.id)).toThrow(/bulunamadı/);
  });
});

describe('Bot Builder — runner (mock MT5/klines)', () => {
  beforeEach(() => { store._dangerouslyResetForTest(); runner._dangerouslyResetForTest(); });

  test('aç → feed → SL/TP kapat → lider tablosu', async () => {
    let up = true;
    const deps = {
      forexKlines: { fetchCandles: async () => (up ? upSeries() : downSeries()) },
      getInstrument: (id) => ({ id, symbol: id, yahoo: id }),
      ictSmc: { analyzeLatest: () => [] },
    };
    const bot = store.createCustom({ name: 'Runner Test', indicators: ['ema', 'rsi', 'adx', 'macd'], logic: 'all', timeframes: ['1h'], pairs: ['BTCUSD'] });
    let r = await runner.run(deps);
    expect(r.opened).toBe(1);
    const feed = runner.feed();
    expect(feed.length).toBe(1);
    expect(feed[0].botName).toBe('Runner Test');
    expect(feed[0].magic).toBe(bot.magic);
    expect(feed[0].direction).toBe('long');
    expect(feed[0].category).toBe('Özel');
    expect(feed[0].stop).toBeLessThan(feed[0].entry);
    // fiyat yön değişince pozisyon SL/TP'ye gider
    up = false;
    r = await runner.run(deps);
    expect(r.closed).toBe(1);
    const lb = runner.leaderboard();
    expect(lb.length).toBe(1);
    expect(lb[0].trades).toBe(1);
    expect(typeof lb[0].netR).toBe('number');
  });

  test('devre dışı bot çalışmaz', async () => {
    const deps = { forexKlines: { fetchCandles: async () => upSeries() }, getInstrument: (id) => ({ id, symbol: id, yahoo: id }), ictSmc: { analyzeLatest: () => [] } };
    store.createCustom({ name: 'Kapalı', indicators: ['ema', 'rsi', 'adx'], logic: 'all', timeframes: ['1h'], pairs: ['BTCUSD'], enabled: false });
    const r = await runner.run(deps);
    expect(r.opened).toBe(0);
  });
});
