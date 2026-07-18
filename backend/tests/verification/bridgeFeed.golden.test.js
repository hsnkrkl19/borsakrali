const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-feed-'));
process.env.BOT_COMPETITION_DATA_DIR = tempDir;

jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn() }));

const manager = require('../../src/services/botCompetition/competitionManager');

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
