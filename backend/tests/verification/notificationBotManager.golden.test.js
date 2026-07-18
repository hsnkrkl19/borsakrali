const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-center-'));
process.env.BOT_CENTER_DATA_DIR = dataDir;
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_FOREX_CHANNEL = '@test-channel';
delete process.env.BEAST_PUSH_DISABLED;

jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn() }));

const botPersistence = require('../../src/services/botPersistence');
const manager = require('../../src/services/botCenter/notificationBotManager');

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.BOT_CENTER_DATA_DIR;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_FOREX_CHANNEL;
  delete process.env.FOREX_PUSH_DISABLED;
  delete process.env.BEAST_PUSH_DISABLED;
});

test('exposes one simple catalog without leaking channel values', () => {
  const result = manager.summary();

  expect(result.total).toBe(16);
  expect(new Set(result.bots.map((bot) => bot.id)).size).toBe(16);
  expect(result.bots.find((bot) => bot.id === 'ict-fvg')).toEqual(expect.objectContaining({
    category: 'ICT',
    enabled: true,
  }));
  expect(result.telegram.token_configured).toBe(true);
  expect(JSON.stringify(result)).not.toContain('@test-channel');
  expect(result.bots.find((bot) => bot.id === 'beast-signals').enabled).toBe(false);
});

test('panel override updates the live kill-switch and persists across reload', () => {
  const updated = manager.setEnabled('forex-signals', false, 'admin-1');

  expect(updated.enabled).toBe(false);
  expect(process.env.FOREX_PUSH_DISABLED).toBe('1');
  expect(fs.existsSync(manager.STATE_FILE)).toBe(true);
  expect(botPersistence.save).toHaveBeenCalledWith(
    'bot-center',
    'registry.json',
    expect.objectContaining({ version: 1 }),
  );

  process.env.FOREX_PUSH_DISABLED = '0';
  const reloaded = manager.reload();
  expect(process.env.FOREX_PUSH_DISABLED).toBe('1');
  expect(reloaded.bots.find((bot) => bot.id === 'forex-signals').source).toBe('panel');
});

test('rejects unknown bots and malformed toggle values', () => {
  expect(() => manager.setEnabled('missing', true)).toThrow('Bilinmeyen bildirim botu');
  expect(() => manager.setEnabled('forex-signals', 'yes')).toThrow('true veya false');
});
