const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-feed-'));
process.env.BOT_COMPETITION_DATA_DIR = tempDir;

jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn() }));
// Route testinde custom bot / TF filtresi katmanı gürültü yapmasın: köprü
// feed'inin YALNIZ competition tarafını ölçüyoruz.
jest.mock('../../src/services/botBuilder/store', () => ({ tfAllowed: () => true }));
jest.mock('../../src/services/botBuilder/customBotRunner', () => ({ feed: () => [] }));

const manager = require('../../src/services/botCompetition/competitionManager');
const catalog = require('../../src/services/botCompetition/catalog');
const bridgeRoutes = require('../../src/routes/bridge.routes');
const { magicToBot } = require('../../src/services/realResults/store');

function signal(id, symbol, side = 'long') {
  return {
    signalId: id, symbol, tf: '15m', direction: side, entry: 100,
    stop: side === 'long' ? 99 : 101, target1: side === 'long' ? 102 : 98,
    target2: side === 'long' ? 104 : 96, confidence: 80,
  };
}

describe('Birleşik köprü feed (bridgeFeed) — tüm botlar → MT5', () => {
  beforeEach(() => {
    delete process.env.FOREX_ONLY_MODE;
    manager.resetForTest();
  });
  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.BOT_COMPETITION_DATA_DIR;
  });

  test('açık pozisyonlar köprü formatında + her botun ayrı magic\'i var', () => {
    manager.recordOpen('forex-signals', signal('fx-1', 'EURUSD', 'long'));
    manager.recordOpen('ict-smc', signal('smc-1', 'XAUUSD', 'short'));

    const feed = manager.bridgeFeed();
    expect(feed.enabled).toBe(true);
    expect(feed.count).toBe(2);
    const fx = feed.positions.find((p) => p.botId === 'forex-signals');
    const smc = feed.positions.find((p) => p.botId === 'ict-smc');
    expect(fx.magic).toBe(5701);
    expect(smc.magic).toBe(5715);
    expect(fx.magic).not.toBe(smc.magic); // ayrı kimlik → ayrı işlem
    // sözleşme: köprünün ihtiyaç duyduğu alanlar
    for (const p of feed.positions) {
      expect(p).toHaveProperty('code');
      expect(p).toHaveProperty('symbol');
      expect(['long', 'short']).toContain(p.direction);
      expect(p.entry).toBeGreaterThan(0);
      expect(p.stop).toBeGreaterThan(0);
      expect(p.magic).toBeGreaterThan(0);
    }
    expect(smc.direction).toBe('short');
    expect(smc.stop).toBeGreaterThan(smc.entry); // short: stop > entry
  });

  test('yalnız PANELDEN AÇIK botlar feed\'de olur (disable edilen çıkar)', () => {
    manager.recordOpen('forex-signals', signal('fx-2', 'EURUSD', 'long'));
    manager.recordOpen('beast-signals', signal('beast-1', 'BTCUSD', 'long'));
    expect(manager.bridgeFeed().count).toBe(2);

    manager.setBotEnabled('beast-signals', false, 'test');
    const feed = manager.bridgeFeed();
    expect(feed.positions.some((p) => p.botId === 'beast-signals')).toBe(false);
    expect(feed.positions.some((p) => p.botId === 'forex-signals')).toBe(true);
  });

  test('usta anahtar kapalıysa feed boş (güvenli)', () => {
    manager.recordOpen('forex-signals', signal('fx-3', 'EURUSD', 'long'));
    manager.setMasterEnabled(false, 'test');
    const feed = manager.bridgeFeed();
    expect(feed.enabled).toBe(false);
    expect(feed.count).toBe(0);
  });

  test('engine env ile kapatılan bot feed\'e girmez (ICT_SMC_DISABLED)', () => {
    manager.recordOpen('ict-smc', signal('smc-2', 'XAUUSD', 'long'));
    expect(manager.bridgeFeed().count).toBe(1);
    process.env.ICT_SMC_DISABLED = '1';
    expect(manager.bridgeFeed().count).toBe(0);
    delete process.env.ICT_SMC_DISABLED;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ÇİFT GERÇEK POZİSYON REGRESYONU (2026-07-24 denetimi)
//
// HATA: forex-signals ve mt5-scanner'ın AYNI paper pozisyonu iki feed'de birden
// yayınlanıyordu — kendi adanmış köprüsünde (magic 550055 / 550066) VE birleşik
// köprüde (magic 5701 / 5705). Köprüler birbirinin pozisyonunu görmez (dedup
// magic+sembol+yön bazlı) → ikisi de açıyor, gerçek risk 2 kat, 0.15 lot tavanı
// fiilen 0.30 oluyordu.
//
// KURAL: adanmış köprüsü olan bot birleşik köprü feed'ine (forExecution)
// GİRMEZ; ama tam görünümde (konsensüs oylaması) KALIR.
// ─────────────────────────────────────────────────────────────────────────────
describe('Adanmış köprü ayrımı — çift gerçek pozisyon önleme', () => {
  const DEDICATED = ['forex-signals', 'mt5-scanner'];

  beforeEach(() => {
    delete process.env.FOREX_ONLY_MODE;
    delete process.env.MT5_SCANNER_DISABLED;
    manager.resetForTest();
  });

  test('⭐ katalog: adanmış köprü magic\'leri tanımlı ve birleşik magic\'ten farklı', () => {
    for (const id of DEDICATED) {
      const entry = catalog.find((e) => e.id === id);
      expect(entry).toBeDefined();
      expect(entry.dedicatedBridgeMagic).toBeGreaterThan(0);
      expect(entry.dedicatedBridgeMagic).not.toBe(entry.magic);
    }
    expect(catalog.find((e) => e.id === 'forex-signals').dedicatedBridgeMagic).toBe(550055);
    expect(catalog.find((e) => e.id === 'mt5-scanner').dedicatedBridgeMagic).toBe(550066);
  });

  test('⭐ HATALI KODDA DÜŞER: forExecution feed\'i adanmış botları İÇERMEZ', () => {
    manager.recordOpen('forex-signals', signal('fx-d1', 'EURUSD', 'long'));
    manager.recordOpen('mt5-scanner', signal('sc-d1', 'XAUUSD', 'short'));
    manager.recordOpen('ict-smc', signal('smc-d1', 'GBPUSD', 'long'));

    const exec = manager.bridgeFeed({ forExecution: true });
    const ids = exec.positions.map((p) => p.botId);
    expect(ids).toContain('ict-smc');           // normal bot geçer
    expect(ids).not.toContain('forex-signals'); // adanmış köprü açacak
    expect(ids).not.toContain('mt5-scanner');
    expect(exec.count).toBe(1);
    // 5701/5705 birleşik köprüye ARTIK HİÇ gitmemeli
    expect(exec.positions.some((p) => p.magic === 5701 || p.magic === 5705)).toBe(false);
  });

  test('tam görünüm (konsensüs oylaması) adanmış botları KORUR', () => {
    manager.recordOpen('forex-signals', signal('fx-d2', 'EURUSD', 'long'));
    manager.recordOpen('mt5-scanner', signal('sc-d2', 'XAUUSD', 'short'));

    const full = manager.bridgeFeed();
    const ids = full.positions.map((p) => p.botId);
    // Konsensüs Radarı (cronJobs → botConsensus) bu feed'i oy sayımında kullanır;
    // botlar gerçekten işlemdeler, yalnızca emri başka köprü açıyor → oy düşmemeli.
    expect(ids).toContain('forex-signals');
    expect(ids).toContain('mt5-scanner');
    expect(full.count).toBe(2);
    for (const p of full.positions) expect(p.dedicatedBridgeMagic).toBeGreaterThan(0);
  });

  test('⭐ HATALI KODDA DÜŞER: GET /api/bridge/positions adanmış botları vermez', async () => {
    process.env.FOREX_EXEC_TOKEN = 'test-token';
    manager.recordOpen('forex-signals', signal('fx-d3', 'EURUSD', 'long'));
    manager.recordOpen('mt5-scanner', signal('sc-d3', 'XAUUSD', 'short'));
    manager.recordOpen('ict-smc', signal('smc-d3', 'GBPUSD', 'long'));

    const app = express();
    app.use('/api/bridge', bridgeRoutes);
    const res = await request(app)
      .get('/api/bridge/positions')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    const ids = res.body.positions.map((p) => p.botId);
    expect(ids).toEqual(['ict-smc']);
    expect(res.body.count).toBe(1);
    delete process.env.FOREX_EXEC_TOKEN;
  });

  test('adanmış bot paper/yarışmada kalır (yalnız GERÇEK emri kesildi)', () => {
    manager.recordOpen('forex-signals', signal('fx-d4', 'EURUSD', 'long'));
    const bot = manager.status().bots.find((b) => b.id === 'forex-signals');
    expect(bot.enabled).toBe(true);
    expect(bot.open).toBe(1);
  });
});

describe('magic → bot eşlemesi (Telegram başlığı + lider tablosu)', () => {
  test('⭐ HATALI KODDA DÜŞER: adanmış köprü magic\'leri "Magic 550055" değil bota düşer', () => {
    expect(magicToBot(550055).botId).toBe('forex-signals');
    expect(magicToBot(550066).botId).toBe('mt5-scanner');
    expect(magicToBot(550055).kind).toBe('competitor');
  });

  test('çok-motorlu bot alt magic\'i de bota düşer (BK XAU swing 5751)', () => {
    expect(magicToBot(5751).botId).toBe('bk-xau');
    expect(magicToBot(5750).botId).toBe('bk-xau');
  });

  test('bilinmeyen magic hâlâ "Magic N" olarak işaretlenir', () => {
    expect(magicToBot(999999).kind).toBe('unknown');
  });

  test('katalogda magic çakışması yok (her magic tek bota ait)', () => {
    const seen = new Map();
    for (const e of catalog) {
      const magics = [e.magic, e.dedicatedBridgeMagic, ...Object.values(e.magicByStrategy || {})];
      for (const m of magics.filter(Boolean)) {
        if (seen.has(m)) expect(seen.get(m)).toBe(e.id);
        seen.set(m, e.id);
      }
    }
    expect(seen.get(5750)).toBe('bk-xau');
  });
});
