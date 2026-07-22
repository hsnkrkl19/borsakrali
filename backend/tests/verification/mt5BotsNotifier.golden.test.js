'use strict';

/**
 * mt5Bots bildirimcisi — yeni açılan pozisyonların Telegram duyurusu.
 * Gerçek Telegram çağrısı mock'lanır; mesaj formatı + spam tavanı + kill-switch
 * + observeSnapshot.openedPositions sözleşmesi doğrulanır.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt5-notifier-'));
process.env.BOT_COMPETITION_DATA_DIR = tempDir;

jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn() }));
jest.mock('../../src/services/telegramService', () => ({ sendMessage: jest.fn().mockResolvedValue({ ok: true }) }));

const telegram = require('../../src/services/telegramService');
const manager = require('../../src/services/botCompetition/competitionManager');
const notifier = require('../../src/services/mt5Bots/notifier');

function pos(overrides = {}) {
  return {
    symbol: 'XAUUSD', timeframe: '4h', side: 'long',
    entry: 2400.5, stop: 2380.25, target: 2440.75, target2: 2465.1,
    confidence: 78,
    ...overrides,
  };
}

describe('mt5Bots bildirimcisi', () => {
  beforeEach(() => {
    telegram.sendMessage.mockClear();
    delete process.env.MT5_BOTS_PUSH_DISABLED;
    process.env.TELEGRAM_SIGNAL_CHANNEL = '@testkanal';
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.BOT_COMPETITION_DATA_DIR;
    delete process.env.TELEGRAM_SIGNAL_CHANNEL;
  });

  test('mesaj: Bot N etiketi + AL/SAT + giriş/stop/TP + enstrüman hassasiyeti', () => {
    const msg = notifier.buildMessage('mt5-trend', [pos()]);
    expect(msg).toMatch(/Bot \d+ · MT5 Trend Takip/);
    expect(msg).toContain('🟢 AL');
    expect(msg).toContain('XAU/USD');
    expect(msg).toContain('2400.50'); // XAUUSD precision 2
    expect(msg).toContain('🛡 2380.25');
    expect(msg).toContain('TP1: 2440.75');
    expect(msg).toContain('TP2: 2465.10');
  });

  test('spam tavanı: MAX_LINES üstü sinyaller "… ve N sinyal daha" olur', () => {
    const many = Array.from({ length: 7 }, (_, i) => pos({ symbol: 'EURUSD', entry: 1.1 + i * 0.01, stop: 1.05, target: 1.2 }));
    const msg = notifier.buildMessage('mt5-momentum', many);
    const blocks = msg.split('🟢 AL').length - 1;
    expect(blocks).toBe(notifier.MAX_LINES);
    expect(msg).toContain(`ve ${7 - notifier.MAX_LINES} sinyal daha`);
  });

  test('notifyOpened: tek toplu mesaj atar; kill-switch ile hiç atmaz', async () => {
    const r = await notifier.notifyOpened('mt5-trend', [pos(), pos({ symbol: 'BTCUSD', entry: 65000, stop: 64000, target: 67000 })]);
    expect(r.pushed).toBe(2);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);

    process.env.MT5_BOTS_PUSH_DISABLED = '1';
    const r2 = await notifier.notifyOpened('mt5-trend', [pos()]);
    expect(r2.disabled).toBe(true);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1); // artmadı
  });

  test('boş liste veya kanal yoksa sessiz geçer', async () => {
    expect((await notifier.notifyOpened('mt5-trend', [])).pushed).toBe(0);
    delete process.env.TELEGRAM_SIGNAL_CHANNEL;
    delete process.env.TELEGRAM_FOREX_CHANNEL;
    const r = await notifier.notifyOpened('mt5-trend', [pos()]);
    expect(r.noChannel).toBe(true);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(0);
  });

  test('observeSnapshot.openedPositions: yalnız YENİ açılan pozisyonlar döner (dedup)', () => {
    manager.resetForTest();
    const snap = {
      signals: [{
        signalId: 'XAUUSD:mt5-trend:4h:1700000000000', symbol: 'XAUUSD', tf: '4h',
        direction: 'long', entry: 2400, stop: 2380, target1: 2440, confidence: 78,
      }],
    };
    const first = manager.observeSnapshot('mt5-trend', snap, { source: 'mt5-bots' });
    expect(first.openedPositions).toHaveLength(1);
    expect(first.openedPositions[0].symbol).toBe('XAUUSD');
    expect(first.openedPositions[0].target).toBe(2440);

    // Aynı snapshot ikinci kez gözlenir → duplicate → duyurulacak pozisyon YOK.
    const second = manager.observeSnapshot('mt5-trend', snap, { source: 'mt5-bots' });
    expect(second.openedPositions).toHaveLength(0);
  });
});
