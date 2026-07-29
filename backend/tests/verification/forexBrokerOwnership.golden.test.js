'use strict';

/** Dedicated Forex execution remains live while central broker state owns Telegram. */

const mockSyncPositions = jest.fn();
const mockRecordOpen = jest.fn(() => Promise.resolve());
const mockRecordClosure = jest.fn(() => Promise.resolve());
const mockSendMessage = jest.fn(async () => ({ success: true }));

jest.mock('../../src/services/forex/forexSignalTracker', () => ({
  syncPositions: (...args) => mockSyncPositions(...args),
}));
jest.mock('../../src/services/forex/forexStatsStore', () => ({
  recordOpen: (...args) => mockRecordOpen(...args),
  recordClosure: (...args) => mockRecordClosure(...args),
  buildReport: jest.fn(async () => 'report'),
}));
jest.mock('../../src/services/telegramService', () => ({
  sendMessage: (...args) => mockSendMessage(...args),
}));
jest.mock('../../src/services/pushNotificationService', () => ({}));
jest.mock('../../src/services/signalDelivery', () => ({ signalChannel: () => '@test' }));
jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn(), loadAll: jest.fn() }));

const notifier = require('../../src/services/forex/forexPushNotifier');

function brokerCandidate(code) {
  return { type: 'new', position: { code, shadow: false } };
}

beforeEach(() => {
  delete process.env.MT5_LEGACY_PAPER_NOTIFY;
  delete process.env.FOREX_PUSH_DISABLED;
  mockSyncPositions.mockReset().mockResolvedValue([brokerCandidate('FX-1')]);
  mockRecordOpen.mockClear(); mockRecordClosure.mockClear(); mockSendMessage.mockClear();
});

afterAll(() => {
  delete process.env.MT5_LEGACY_PAPER_NOTIFY;
  delete process.env.FOREX_PUSH_DISABLED;
});

test('dedicated Forex tracker keeps opening while paper Telegram is suppressed', async () => {
  const result = await notifier.evaluateAndPush([{ confidence: 80 }]);
  expect(mockSyncPositions).toHaveBeenCalledTimes(1);
  expect(mockRecordOpen).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ brokerOwned: true, disabled: false, telegram: 0 });
  expect(mockSendMessage).not.toHaveBeenCalled();
});

test('FOREX_PUSH_DISABLED cannot stop tracking, and paper closures still update stats', async () => {
  process.env.FOREX_PUSH_DISABLED = '1';
  const opened = await notifier.evaluateAndPush([{ confidence: 80 }]);
  const closed = await notifier.pushClosures([{ code: 'FX-1', outcome: 'SL' }]);
  expect(mockSyncPositions).toHaveBeenCalledTimes(1);
  expect(opened).toMatchObject({ disabled: true, brokerOwned: true, telegram: 0 });
  expect(mockRecordClosure).toHaveBeenCalledTimes(1);
  expect(closed).toMatchObject({ disabled: true, brokerOwned: true, telegram: 0 });
  expect(mockSendMessage).not.toHaveBeenCalled();
});
