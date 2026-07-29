'use strict';

/** Golden contract: Telegram trade lifecycle is broker-confirmed and 1:1. */

const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt5-notify-'));
process.env.MT5_NOTIFY_DATA_DIR = tempDir;
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_TRADE_CHANNEL = '@test';

const mockTelegram = { sendMessage: jest.fn(async () => ({ success: true, messageId: 1 })) };
jest.mock('../../src/services/telegramService', () => mockTelegram);
jest.mock('../../src/services/signalDelivery', () => ({ signalChannel: () => '@fallback' }));
jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn(), loadAll: jest.fn() }));

const notifier = require('../../src/services/mt5TradeNotifier');

const NOW_SEC = () => Math.floor(Date.now() / 1000);
function candidate(code = 'sig-1') {
  return {
    code, botId: 'pro-robot', botName: 'Pro Robot', magic: 5702,
    symbol: 'EURUSD', direction: 'long', entry: 1.1, stop: 1.09, target1: 1.12,
  };
}
function openRow(ticket = '1001', overrides = {}) {
  return {
    ticket: String(ticket), magic: 5702, symbol: 'EURUSD', direction: 'long',
    lot: 0.1, price: 1.10025, sl: 1.09, tp: 1.12, openedSec: NOW_SEC(),
    ...overrides,
  };
}
function closeRow(id = '9001', overrides = {}) {
  return {
    id: String(id), positionTicket: '1001', magic: 5702, symbol: 'EURUSD',
    profit: 15, commission: -1.25, swap: -0.5, price: 1.1198,
    closedSec: NOW_SEC() - 30, reason: 5, ...overrides,
  };
}

beforeEach(() => {
  notifier.resetForTest();
  mockTelegram.sendMessage.mockReset().mockResolvedValue({ success: true, messageId: 1 });
  delete process.env.MT5_TRADE_NOTIFY_DISABLED;
  delete process.env.MT5_TRADE_NOTIFY_OPEN;
  delete process.env.MT5_LEGACY_PAPER_NOTIFY;
  delete process.env.MT5_RECONCILE_GRACE_MIN;
  delete process.env.MT5_NOTIFY_INFLIGHT_MS;
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.MT5_NOTIFY_DATA_DIR;
  delete process.env.TELEGRAM_TRADE_CHANNEL;
  delete process.env.MT5_TRADE_NOTIFY_DISABLED;
  delete process.env.MT5_LEGACY_PAPER_NOTIFY;
});

describe('broker-confirmed opening', () => {
  test('feed candidate is audit-only; no ticket means no Telegram signal', () => {
    const r = notifier.observeCandidates([candidate()]);
    expect(r.observed).toBe(1);
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    expect(notifier.auditStatus()).toMatchObject({ candidates: 1, brokerConfirmedOpens: 0, notifiedOpens: 0 });
  });

  test('signal-without-trade reconciliation survives restart persistence', () => {
    const start = Date.now();
    process.env.MT5_RECONCILE_GRACE_MIN = '1';
    jest.useFakeTimers().setSystemTime(start);
    try {
      notifier.observeCandidates([candidate('P-GAP')]);
      jest.setSystemTime(start + 61 * 1000);
      const audit = notifier.auditStatus({ details: true });
      expect(audit.unconfirmedCandidates).toBe(1);
      expect(audit.signalWithoutTrade).toBe(1);
      expect(audit.gaps.unconfirmedCandidates[0].reason).toBe('mt5-open-not-confirmed');
      const persisted = JSON.parse(fs.readFileSync(path.join(tempDir, 'notified.json'), 'utf8'));
      expect(persisted.candidates['P-GAP'].status).toBe('unconfirmed');
    } finally {
      jest.useRealTimers();
      delete process.env.MT5_RECONCILE_GRACE_MIN;
    }
  });

  test('real MT5 ticket emits exactly one complete opening message', async () => {
    notifier.observeCandidates([candidate('P-42')]);
    const r = await notifier.ingestState({ open: [openRow()] });
    expect(r.openNotified).toBe(1);
    expect(r.retryableFailures).toBe(0);
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    const message = mockTelegram.sendMessage.mock.calls[0][1];
    for (const value of ['Pro Robot', '5702', 'P-42', 'EURUSD', 'LONG', '1.10025', '1.09000', '1.12000', '0.10', '1001']) {
      expect(message).toContain(value);
    }
    expect(notifier.auditStatus()).toMatchObject({ brokerConfirmedOpens: 1, notifiedOpens: 1, tradeWithoutSignal: 0 });
  });

  test('central daemon owns dedicated-bridge magic and broker comment identity', async () => {
    notifier.observeCandidates([{
      code: 'FX-77', botId: 'forex-signals', magic: 550055,
      symbol: 'EUR/USD', direction: 'long', entry: 1.1, stop: 1.09, target1: 1.12,
    }]);
    const r = await notifier.ingestState({ open: [{
      positionTicket: 'D-7001', magic: 550055, comment: 'BK#FX-77',
      symbol: 'EURUSD', direction: 'long', lot: 0.1, entryPrice: 1.1003,
      sl: 1.09, tp: 1.12, openedSec: NOW_SEC(),
    }] });
    expect(r.openNotified).toBe(1);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toEqual(expect.stringContaining('FX-77'));
    expect(notifier.auditStatus()).toMatchObject({ unconfirmedCandidates: 0, notifiedOpens: 1 });
  });

  test('same broker ticket is durably idempotent in the outbox', async () => {
    await notifier.ingestState({ open: [openRow('2001')] });
    const second = await notifier.ingestState({ open: [openRow('2001')] });
    expect(second.openNotified).toBe(0);
    expect(second.skipped).toBe(1);
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(fs.readFileSync(path.join(tempDir, 'notified.json'), 'utf8'));
    expect(persisted.opens['2001'].notification).toBe('sent');
  });

  test('order ticket followed by its position ticket aliases one active open and sends once', async () => {
    const openedSec = NOW_SEC();
    const identity = {
      code: 'ORDER-POS-42', magic: 5702, symbol: 'EURUSD', direction: 'long',
      lot: 0.1, entryPrice: 1.10025, sl: 1.09, tp: 1.12, openedSec,
    };
    const order = await notifier.ingestState({
      source: 'broker-fill-outbox',
      open: [{ ...identity, ticket: 'ORDER-7001', positionTicket: 'ORDER-7001' }],
    });
    const position = await notifier.ingestState({
      source: 'account-brain',
      open: [{ ...identity, ticket: 'POSITION-9001', positionTicket: 'POSITION-9001' }],
    });

    expect(order.openNotified).toBe(1);
    expect(position.openNotified).toBe(0);
    expect(position.skipped).toBe(1);
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(notifier.auditStatus()).toMatchObject({ brokerConfirmedOpens: 1, notifiedOpens: 1 });

    const persisted = JSON.parse(fs.readFileSync(path.join(tempDir, 'notified.json'), 'utf8'));
    expect(Object.keys(persisted.opens)).toHaveLength(1);
    expect(persisted.openAliases['POSITION-9001']).toBe('ORDER-7001');
    expect(persisted.opens['ORDER-7001']).toMatchObject({
      orderTicket: 'ORDER-7001', positionTicket: 'POSITION-9001',
      ticket: 'POSITION-9001', notification: 'sent',
    });
  });

  test('position snapshot winning the network race still aliases the later order ticket', async () => {
    const identity = {
      code: 'RACE-42', magic: 5702, symbol: 'EURUSD', direction: 'long',
      lot: 0.1, entryPrice: 1.10025, sl: 1.09, tp: 1.12, openedSec: NOW_SEC(),
    };
    await notifier.ingestState({
      source: 'account-brain',
      open: [{ ...identity, ticket: 'POSITION-FIRST', positionTicket: 'POSITION-FIRST' }],
    });
    const later = await notifier.ingestState({
      source: 'broker-fill-outbox',
      open: [{ ...identity, ticket: 'ORDER-LATER', positionTicket: 'ORDER-LATER' }],
    });

    expect(later.openNotified).toBe(0);
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(notifier.auditStatus()).toMatchObject({ brokerConfirmedOpens: 1, notifiedOpens: 1 });
  });

  test('simultaneous broker outbox and account snapshot share one in-flight Telegram send', async () => {
    const identity = {
      code: 'CONCURRENT-42', magic: 5702, symbol: 'EURUSD', direction: 'long',
      lot: 0.1, entryPrice: 1.10025, sl: 1.09, tp: 1.12, openedSec: NOW_SEC(),
      accountLogin: '10001', accountServer: 'Broker-Demo',
    };
    let release;
    mockTelegram.sendMessage.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve({ success: true, messageId: 42 });
    }));

    const pending = Promise.all([
      notifier.ingestState({
        source: 'broker-fill-outbox',
        open: [{ ...identity, ticket: 'ORDER-CONCURRENT', positionTicket: 'ORDER-CONCURRENT' }],
      }),
      notifier.ingestState({
        source: 'account-brain',
        open: [{ ...identity, ticket: 'POSITION-CONCURRENT', positionTicket: 'POSITION-CONCURRENT', positionIdentifier: 'IDENT-CONCURRENT' }],
      }),
    ]);
    await Promise.resolve();
    expect(typeof release).toBe('function');
    release();
    const results = await pending;

    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(results.reduce((sum, row) => sum + row.openNotified, 0)).toBe(1);
    expect(results.reduce((sum, row) => sum + row.skipped, 0)).toBe(1);
    expect(notifier.auditStatus()).toMatchObject({ brokerConfirmedOpens: 1, notifiedOpens: 1 });
  });

  test('a persisted pending send becomes retryable immediately after restart', async () => {
    const file = path.join(tempDir, 'notified.json');
    const row = {
      ...openRow('RESTART-1'), entry: 1.10025, code: 'RESTART-CODE',
      notification: 'pending', brokerConfirmed: true,
      attempts: 1, lastAttemptAt: new Date().toISOString(),
      firstSeenMs: Date.now(), lastSeenMs: Date.now(),
    };
    fs.writeFileSync(file, JSON.stringify({
      version: 3, opens: { 'RESTART-1': row }, openAliases: {}, closes: {},
      candidates: {}, decisions: {}, events: [], updatedAt: new Date().toISOString(),
    }), 'utf8');

    notifier.reloadForTest();
    const recovered = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(recovered.opens['RESTART-1']).toMatchObject({
      notification: 'failed', lastError: 'delivery-interrupted-by-restart',
    });

    const retry = await notifier.ingestState({ open: [openRow('RESTART-1')] });
    expect(retry).toMatchObject({ openNotified: 1, retryableFailures: 0 });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).opens['RESTART-1'].notification).toBe('sent');
  });

  test('same broker ticket remains distinct across accounts and the account is visible', async () => {
    const shared = openRow('SAME-TICKET', { code: 'ACCOUNT-OPEN', positionIdentifier: 'SAME-IDENT' });
    await notifier.ingestState({ source: 'account-brain', account: { login: '111', server: 'Broker-A' }, open: [shared] });
    await notifier.ingestState({ source: 'account-brain', account: { login: '222', server: 'Broker-A' }, open: [shared] });

    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('111 @ Broker-A');
    expect(mockTelegram.sendMessage.mock.calls[1][1]).toContain('222 @ Broker-A');
    expect(notifier.auditStatus()).toMatchObject({ brokerConfirmedOpens: 2, notifiedOpens: 2 });

    mockTelegram.sendMessage.mockClear();
    const sharedClose = closeRow('SAME-DEAL', { positionTicket: 'SAME-IDENT' });
    await notifier.ingestState({ account: { login: '111', server: 'Broker-A' }, closed: [sharedClose] });
    await notifier.ingestState({ account: { login: '222', server: 'Broker-A' }, closed: [sharedClose] });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(notifier.auditStatus()).toMatchObject({ brokerConfirmedCloses: 2, notifiedCloses: 2, closeWithoutOpen: 0 });
  });

  test('position identifier resolves the exact older open instead of a same-symbol fallback', async () => {
    const account = { login: '333', server: 'Broker-B' };
    await notifier.ingestState({ source: 'account-brain', account, open: [openRow('POS-OLD', {
      code: 'IDENTITY-OLD', positionIdentifier: 'IDENT-OLD', openedSec: NOW_SEC() - 10,
    })] });
    await notifier.ingestState({ source: 'account-brain', account, open: [openRow('POS-OLD-ROLLED', {
      code: 'IDENTITY-OLD', positionIdentifier: 'IDENT-OLD', openedSec: NOW_SEC() - 10,
    })] });
    await notifier.ingestState({ source: 'account-brain', account, open: [openRow('POS-NEW', {
      code: 'IDENTITY-NEW', positionIdentifier: 'IDENT-NEW', openedSec: NOW_SEC(),
    })] });
    mockTelegram.sendMessage.mockClear();

    await notifier.ingestState({ account, closed: [closeRow('IDENT-CLOSE', {
      positionTicket: 'CHANGED-POSITION-TICKET', positionIdentifier: 'IDENT-OLD',
    })] });
    const message = mockTelegram.sendMessage.mock.calls[0][1];
    expect(message).toContain('IDENTITY-OLD');
    expect(message).toContain('POS-OLD-ROLLED');
    expect(message).not.toContain('IDENTITY-NEW');
    expect(notifier.auditStatus().closeWithoutOpen).toBe(0);
  });

  test('reversal close Telegram is sent before its dependent new-open Telegram', async () => {
    const account = { login: '444', server: 'Broker-C' };
    await notifier.ingestState({ source: 'account-brain', account, open: [openRow('REV-OLD-POS', {
      code: 'REV-OLD', direction: 'long', positionIdentifier: 'REV-OLD-IDENT',
    })] });
    mockTelegram.sendMessage.mockClear();

    const held = await notifier.ingestState({ source: 'broker-fill-outbox', account, open: [openRow('REV-NEW-ORDER', {
      code: 'REV-NEW', direction: 'short', positionIdentifier: 'REV-NEW-IDENT',
      closeBeforeOpenTickets: ['REV-OLD-IDENT'],
    })] });
    expect(held).toMatchObject({ openNotified: 0, skipped: 1 });
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();

    const closed = await notifier.ingestState({ account, closed: [closeRow('REV-CLOSE-DEAL', {
      positionTicket: 'REV-OLD-IDENT', positionIdentifier: 'REV-OLD-IDENT',
      notificationRequired: true,
    })] });
    expect(closed).toMatchObject({ closeNotified: 1, openNotified: 1, retryableFailures: 0 });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('MT5 GERÇEK KAPANIŞ');
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('REV-OLD');
    expect(mockTelegram.sendMessage.mock.calls[1][1]).toContain('MT5 GERÇEK AÇILIŞ');
    expect(mockTelegram.sendMessage.mock.calls[1][1]).toContain('REV-NEW');

    await notifier.ingestState({ account, closed: [closeRow('REV-CLOSE-DEAL', {
      positionTicket: 'REV-OLD-IDENT', positionIdentifier: 'REV-OLD-IDENT',
      notificationRequired: true,
    })] });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
  });

  test('fast reversal that already closed is ordered old-close, new-open, new-close', async () => {
    const account = { login: '445', server: 'Broker-C' };
    await notifier.ingestState({ source: 'account-brain', account, open: [openRow('FAST-OLD-POS', {
      code: 'FAST-OLD', direction: 'long', positionIdentifier: 'FAST-OLD-IDENT',
    })] });
    await notifier.ingestState({ source: 'account-brain', account, open: [openRow('FAST-NEW-POS', {
      code: 'FAST-NEW', direction: 'short', positionIdentifier: 'FAST-NEW-IDENT',
      closeBeforeOpenTickets: ['FAST-OLD-IDENT'], openedSec: NOW_SEC(),
    })] });
    mockTelegram.sendMessage.mockClear();

    const lifecycle = await notifier.ingestState({ account, closed: [
      closeRow('FAST-OLD-CLOSE', {
        positionTicket: 'FAST-OLD-IDENT', positionIdentifier: 'FAST-OLD-IDENT',
        direction: 'long', notificationRequired: true, closedSec: NOW_SEC(),
      }),
      closeRow('FAST-NEW-CLOSE', {
        positionTicket: 'FAST-NEW-IDENT', positionIdentifier: 'FAST-NEW-IDENT',
        direction: 'short', notificationRequired: true, closedSec: NOW_SEC(),
      }),
    ] });

    expect(lifecycle).toMatchObject({ closeNotified: 2, openNotified: 1, retryableFailures: 0 });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(3);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toEqual(expect.stringContaining('FAST-OLD-CLOSE'));
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toEqual(expect.stringContaining('MT5 GERÇEK KAPANIŞ'));
    expect(mockTelegram.sendMessage.mock.calls[1][1]).toEqual(expect.stringContaining('FAST-NEW'));
    expect(mockTelegram.sendMessage.mock.calls[1][1]).toEqual(expect.stringContaining('MT5 GERÇEK AÇILIŞ'));
    expect(mockTelegram.sendMessage.mock.calls[2][1]).toEqual(expect.stringContaining('FAST-NEW-CLOSE'));
    expect(mockTelegram.sendMessage.mock.calls[2][1]).toEqual(expect.stringContaining('MT5 GERÇEK KAPANIŞ'));
  });

  test('account-scoped reversal fallback bridges an unseen old ticket to its identifier close', async () => {
    const account = { login: '446', server: 'Broker-C' };
    await notifier.ingestState({ source: 'broker-fill-outbox', account, open: [openRow('UNSEEN-NEW', {
      code: 'UNSEEN-REVERSAL', direction: 'short', positionIdentifier: 'UNSEEN-NEW-IDENT',
      closeBeforeOpenTickets: ['UNSEEN-OLD-TICKET'], openedSec: NOW_SEC(),
    })] });
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();

    const lifecycle = await notifier.ingestState({ account, closed: [closeRow('UNSEEN-OLD-CLOSE', {
      positionTicket: 'UNSEEN-OLD-IDENT', positionIdentifier: 'UNSEEN-OLD-IDENT',
      direction: 'long', notificationRequired: true, closedSec: NOW_SEC(),
    })] });
    expect(lifecycle).toMatchObject({ closeNotified: 1, openNotified: 1, retryableFailures: 0 });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('UNSEEN-OLD-CLOSE');
    expect(mockTelegram.sendMessage.mock.calls[1][1]).toContain('UNSEEN-REVERSAL');
  });

  test('Telegram failure is retryable and is never marked sent', async () => {
    mockTelegram.sendMessage.mockResolvedValueOnce({ success: false, error: 'temporary network' });
    const first = await notifier.ingestState({ open: [openRow('3001')] });
    expect(first.retryableFailures).toBe(1);
    expect(first.audit.tradeWithoutSignal).toBe(1);
    const second = await notifier.ingestState({ open: [openRow('3001')] });
    expect(second.openNotified).toBe(1);
    expect(second.retryableFailures).toBe(0);
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
  });

  test('invalid/rejected decision never becomes a signal and reason stays in audit', async () => {
    const r = await notifier.ingestState({
      decisions: [{ id: 'dec-1', code: 'P-X', magic: 5702, symbol: 'EURUSD', direction: 'long', accepted: false, reason: 'broker-market-closed' }],
      open: [{ magic: 5702, symbol: 'EURUSD', direction: 'long', lot: 0.1, price: 1.1 }],
    });
    expect(r.openNotified).toBe(0);
    expect(r.invalid).toBe(1);
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    const audit = notifier.auditStatus({ details: true });
    expect(audit.rejectedDecisions).toBe(1);
    expect(audit.gaps.rejectedDecisions[0].reason).toBe('broker-market-closed');
  });
});

describe('broker exit deal closing', () => {
  test('unavailable broker fields render as missing, never invented zero prices', () => {
    const message = notifier.closeMessage({
      dealId: 'D-MISSING', magic: 5702, symbol: 'EURUSD', netPnl: 1,
      reason: 'broker-exit', profit: 1, commission: null, swap: null, fee: null,
    });
    expect(message).toContain('Çıkış: <b>—</b>');
    expect(message).toContain('Komisyon: —');
    expect(message).toContain('Swap: —');
  });

  test('real exit deal announces exact net components, exit, reason and tickets', async () => {
    await notifier.ingestState({ open: [openRow()] });
    mockTelegram.sendMessage.mockClear();
    const r = await notifier.ingestState({ closed: [closeRow()] });
    expect(r.closeNotified).toBe(1);
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    const message = mockTelegram.sendMessage.mock.calls[0][1];
    for (const value of ['MT5 GERÇEK KAPANIŞ', '9001', '1001', '1.11980', 'take-profit', '+$13.25', '15.00', '-1.25', '-0.50']) {
      expect(message).toContain(value);
    }
    expect(notifier.auditStatus()).toMatchObject({ brokerConfirmedCloses: 1, notifiedCloses: 1, closeWithoutOpen: 0 });
  });

  test('missing broker deal id/time/P&L is not a close notification', async () => {
    const r = await notifier.ingestState({ closed: [{ id: 'bad', magic: 5702, pnl: 1, symbol: 'EURUSD' }] });
    expect(r.invalid).toBe(1);
    expect(r.closeNotified).toBe(0);
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
  });

  test('same exit deal is idempotent', async () => {
    await notifier.ingestState({ closed: [closeRow('9100')] });
    await notifier.ingestState({ closed: [closeRow('9100')] });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  test('a fresh failed close remains retryable after the history freshness window', async () => {
    mockTelegram.sendMessage.mockResolvedValueOnce({ success: false, error: 'temporary outage' });
    const first = await notifier.ingestState({ closed: [closeRow('9150')] });
    expect(first.retryableFailures).toBe(1);

    const old = NOW_SEC() - 3 * 24 * 3600;
    // Retry may arrive through a poorer legacy seven-day payload. The pending
    // outbox must retain the original rich broker fields.
    const retry = await notifier.ingestState({ closed: [{
      id: '9150', positionTicket: '1001', magic: 5702, symbol: 'EURUSD',
      pnl: 999, closedSec: old, reason: 5,
    }] });
    expect(retry.closeNotified).toBe(1);
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
    const retriedMessage = mockTelegram.sendMessage.mock.calls[1][1];
    expect(retriedMessage).toContain('+$13.25');
    expect(retriedMessage).not.toContain('+$999.00');
    expect(retriedMessage).toContain('1.11980');
    expect(retriedMessage).toContain('Komisyon: -1.25');
  });

  test('historical seven-day replay is recorded silently', async () => {
    const old = NOW_SEC() - 3 * 24 * 3600;
    const r = await notifier.ingestState({ closed: [closeRow('9200', { closedSec: old })] });
    expect(r.closeNotified).toBe(0);
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    expect(notifier.auditStatus().brokerConfirmedCloses).toBe(1);
  });

  test('exact close for an already-notified open bypasses historical bootstrap suppression', async () => {
    await notifier.ingestState({ open: [openRow('OLD-NOTIFIED-OPEN')] });
    mockTelegram.sendMessage.mockClear();
    const old = NOW_SEC() - 3 * 24 * 3600;

    const lifecycle = await notifier.ingestState({ closed: [closeRow('OLD-EXACT-CLOSE', {
      positionTicket: 'OLD-NOTIFIED-OPEN', closedSec: old,
    })] });
    expect(lifecycle).toMatchObject({ closeNotified: 1, retryableFailures: 0 });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('OLD-EXACT-CLOSE');
    expect(notifier.auditStatus()).toMatchObject({ historicalCloses: 0, notifiedCloses: 1 });
  });

  test('notificationRequired promotes an established-cursor close beyond the bootstrap window', async () => {
    const old = NOW_SEC() - 3 * 24 * 3600;
    const first = await notifier.ingestState({ closed: [closeRow('9250', { closedSec: old })] });
    expect(first.closeNotified).toBe(0);
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();

    const promoted = await notifier.ingestState({
      closed: [closeRow('9250', { closedSec: old, notificationRequired: true })],
    });
    expect(promoted).toMatchObject({ closeNotified: 1, retryableFailures: 0 });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(notifier.auditStatus()).toMatchObject({ historicalCloses: 0, notifiedCloses: 1 });
  });
});

describe('notification kill switch does not control execution', () => {
  test('broker lifecycle fails closed and remains retryable while Telegram is disabled', async () => {
    process.env.MT5_TRADE_NOTIFY_DISABLED = '1';
    const r = await notifier.ingestState({ open: [openRow('5001')] });
    expect(r.notificationsDisabled).toBe(true);
    expect(r.openNotified).toBe(0);
    expect(r.retryableFailures).toBeGreaterThan(0);
    expect(r.audit.brokerConfirmedOpens).toBe(1);
    expect(r.audit.tradeWithoutSignal).toBe(1);
    expect(r.audit.pendingNotifications).toBe(1);
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();

    const closed = await notifier.ingestState({
      closed: [closeRow('9501', { positionTicket: '5001' })],
    });
    expect(closed.retryableFailures).toBeGreaterThan(0);
    expect(closed.audit.closeWithoutSignal).toBe(1);
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();

    delete process.env.MT5_TRADE_NOTIFY_DISABLED;
    const recovered = await notifier.ingestState({ open: [openRow('5001')] });
    expect(recovered).toMatchObject({ openNotified: 1, closeNotified: 1, retryableFailures: 0 });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('MT5 GERÇEK AÇILIŞ');
    expect(mockTelegram.sendMessage.mock.calls[1][1]).toContain('MT5 GERÇEK KAPANIŞ');
  });

  test('all MT5-tradeable bots suppress paper alerts; paper-only/BIST keep their owner', () => {
    expect(notifier.paperNotificationSuppressed('pro-robot')).toBe(true);
    expect(notifier.paperNotificationSuppressed('mtf-confluence')).toBe(true);
    expect(notifier.paperNotificationSuppressed('forex-signals')).toBe(true);
    expect(notifier.paperNotificationSuppressed('mt5-scanner')).toBe(true);
    expect(notifier.paperNotificationSuppressed('custom-07ce58e2c1')).toBe(true);
    expect(notifier.paperNotificationSuppressed('bist-signals')).toBe(false);
    expect(notifier.paperNotificationSuppressed('mt5-london')).toBe(false);

    process.env.MT5_LEGACY_PAPER_NOTIFY = '1';
    expect(notifier.paperNotificationSuppressed('pro-robot')).toBe(false);
  });
});
