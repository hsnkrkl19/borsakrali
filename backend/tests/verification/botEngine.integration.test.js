/**
 * INTEGRATION TEST — BIST paper bot tam döngü + kill-switch (D5, Faz 4)
 * Gerçek positionStore (geçici BOT_DATA_DIR) + mock liveDataService/botPersistence
 * ile sinyal → ingest (giriş) → tick (hedef) → kapanış (kâr) zincirini ve
 * kill-switch'in YENİ girişi durdurmasını uçtan uca doğrular. Gerçek-para yok.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

// requires'tan ÖNCE: geçici veri dizini — gerçek bot state'ine dokunma.
const TMP = path.join(os.tmpdir(), 'bk-bot-itest-' + process.pid);
process.env.BOT_DATA_DIR = TMP;

jest.mock('../../src/services/liveDataService', () => ({
  getStock: () => null,
  fetchHistoricalData: async () => [],
}));
jest.mock('../../src/services/botPersistence', () => ({ save: () => {}, loadAll: async () => {} }));

const botEngine = require('../../src/services/tradingBotV2/botEngine');
const positionStore = require('../../src/services/tradingBotV2/positionStore');

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* noop */ } });
beforeEach(() => { positionStore.reset(); });

function trendSnapshot(symbol, entry, stop, target) {
  return {
    generatedAt: new Date().toISOString(),
    phase: 'premarket',
    trend: { signals: [{ symbol, name: symbol, direction: 'long', entry, stop, target, totalScore: 8, fillMode: 'market' }] },
    reversion: { signals: [] },
  };
}

describe('Tam döngü: sinyal → giriş → tick (hedef) → kâr ile kapanış', () => {
  test('trend market girişi açar, hedefe ulaşınca target ile kapanır (P&L > 0)', async () => {
    const ing = await botEngine.ingestSnapshot(trendSnapshot('TEST', 100, 90, 110));
    expect(ing.opened).toBe(1);
    expect(ing.halted).toBe(false);

    const open = positionStore.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0].symbol).toBe('TEST');
    expect(open[0].currentTarget).toBe(110);

    // Fiyat hedefin üstünde → tick target ile kapatır
    const tick = await botEngine.tick({ overridePrices: { TEST: 115 } });
    expect(tick.closed).toBe(1);
    expect(positionStore.listOpen()).toHaveLength(0);

    const trades = positionStore.listTrades(10);
    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe('target');
    expect(trades[0].exitPrice).toBe(110);          // tam hedeften
    expect(trades[0].realizedPnL).toBeGreaterThan(0);

    // Portföy: nakit ilk sermayenin üstünde (kâr realize edildi)
    const pf = positionStore.getPortfolio();
    expect(pf.cash).toBeGreaterThan(pf.capital);
    expect(pf.winCount).toBe(1);
  });
});

describe('Kill-switch: pause YENİ girişi durdurur, mevcut pozisyon korunur', () => {
  test('pause sonrası ingest açmaz; AAA korunur; resume sonrası tekrar açar', async () => {
    await botEngine.ingestSnapshot(trendSnapshot('AAA', 100, 90, 110));
    expect(positionStore.listOpen()).toHaveLength(1);

    positionStore.setTradingEnabled(false, 'test_pause');
    const halted = await botEngine.ingestSnapshot(trendSnapshot('BBB', 50, 45, 60));
    expect(halted.halted).toBe(true);
    expect(halted.haltReason).toBe('test_pause');

    const openWhilePaused = positionStore.listOpen();
    expect(openWhilePaused).toHaveLength(1);          // BBB açılmadı
    expect(openWhilePaused[0].symbol).toBe('AAA');     // AAA korundu

    positionStore.setTradingEnabled(true);
    const resumed = await botEngine.ingestSnapshot(trendSnapshot('CCC', 50, 45, 60));
    expect(resumed.halted).toBe(false);
    expect(positionStore.listOpen()).toHaveLength(2);  // CCC açıldı
  });

  test('halt iken tick mevcut pozisyonu KAPATABİLİR (yönetim engellenmez)', async () => {
    await botEngine.ingestSnapshot(trendSnapshot('DDD', 100, 90, 110));
    positionStore.setTradingEnabled(false, 'test_pause');
    // Halt'a rağmen fiyat hedefe gelince çıkış yapılır (risk azaltma serbest)
    const tick = await botEngine.tick({ overridePrices: { DDD: 120 } });
    expect(tick.closed).toBe(1);
    expect(positionStore.listOpen()).toHaveLength(0);
  });
});
