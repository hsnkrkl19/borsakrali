'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-lifecycle-'));
process.env.NODE_ENV = 'test';
process.env.BOT_DATA_DIR = tempDir;
process.env.MT5_NOTIFY_DATA_DIR = path.join(tempDir, 'notify');
process.env.REAL_RESULTS_DATA_DIR = path.join(tempDir, 'results');
process.env.FOREX_EXEC_TOKEN = 'golden-secret-token';
process.env.TELEGRAM_TRADE_CHANNEL = '@test';

const mockTelegram = { sendMessage: jest.fn(async () => ({ success: true, messageId: 1 })) };
const mockCandidate = {
  botId: 'pro-robot', botName: 'Pro Robot', magic: 5702, code: 'PRO-9',
  symbol: 'EURUSD', direction: 'long', entry: 1.1, stop: 1.09, target1: 1.12,
  timeframe: '1h',
};

jest.mock('../../src/services/telegramService', () => mockTelegram);
jest.mock('../../src/services/signalDelivery', () => ({ signalChannel: () => '@fallback' }));
jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn(), loadAll: jest.fn() }));
jest.mock('../../src/services/botCompetition/competitionManager', () => ({
  bridgeFeed: jest.fn(() => ({ enabled: true, generatedAt: new Date().toISOString(), positions: [mockCandidate] })),
}));
jest.mock('../../src/services/botBuilder/store', () => ({ tfAllowed: () => true, listCustom: () => [] }));
jest.mock('../../src/services/botBuilder/customBotRunner', () => ({ feed: () => [] }));

const notifier = require('../../src/services/mt5TradeNotifier');
const realResults = require('../../src/services/realResults/store');
const lifecycleReadiness = require('../../src/services/lifecycleReadiness');
const bridgeRoutes = require('../../src/routes/bridge.routes');

const app = express();
app.use('/api/bridge', bridgeRoutes);
const auth = { Authorization: 'Bearer golden-secret-token' };
const nowSec = () => Math.floor(Date.now() / 1000);

function openRow(ticket = '7001') {
  return {
    positionTicket: ticket, magic: 5702, comment: 'A#PRO-9',
    symbol: 'EURUSD', direction: 'long', lot: 0.1,
    entryPrice: 1.1002, sl: 1.09, tp: 1.12, openedSec: nowSec(),
  };
}

beforeEach(() => {
  lifecycleReadiness.resetForTest(true);
  notifier.resetForTest();
  realResults._dangerouslyResetForTest();
  mockTelegram.sendMessage.mockReset().mockResolvedValue({ success: true, messageId: 1 });
  delete process.env.MT5_TRADE_NOTIFY_DISABLED;
});

test('boot restore gate returns retryable 503 before any lifecycle store is touched', async () => {
  lifecycleReadiness.resetForTest(false);
  const blocked = await request(app).post('/api/bridge/state').set(auth).send({ open: [openRow('7000')] });
  expect(blocked.status).toBe(503);
  expect(blocked.body).toMatchObject({
    success: false, ready: false, retryable: true,
    error: 'broker-lifecycle-restoring',
  });
  expect(mockTelegram.sendMessage).not.toHaveBeenCalled();

  lifecycleReadiness.completeRestore();
  const recovered = await request(app).post('/api/bridge/state').set(auth).send({ open: [openRow('7000')] });
  expect(recovered.status).toBe(200);
  expect(recovered.body.lifecycle.openNotified).toBe(1);
});

test('malformed broker lifecycle row is never acknowledged with 200', async () => {
  const invalid = await request(app).post('/api/bridge/state').set(auth).send({
    open: [{ positionTicket: 'bad', symbol: '', direction: 'long' }],
  });
  expect(invalid.status).toBe(503);
  expect(invalid.body).toMatchObject({
    success: false, retryable: true, error: 'invalid-broker-lifecycle-row',
    lifecycle: { invalid: 1 },
  });
  expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  for (const key of ['BOT_DATA_DIR', 'MT5_NOTIFY_DATA_DIR', 'REAL_RESULTS_DATA_DIR', 'FOREX_EXEC_TOKEN', 'TELEGRAM_TRADE_CHANNEL']) {
    delete process.env[key];
  }
});

test('bildirim kill switch: defter yazilir, 200 doner, mesaj switch kalkinca gider', async () => {
  process.env.MT5_TRADE_NOTIFY_DISABLED = '1';
  const blocked = await request(app).post('/api/bridge/state').set(auth).send({ open: [openRow('7099')] });
  // Kill switch bir TESLIMAT engelidir, defter engeli degil: 200 doner ki kopru
  // ilerlesin; kayit "bekliyor" olarak tutulur ve switch kalkinca gonderilir.
  expect(blocked.status).toBe(200);
  expect(blocked.body).toMatchObject({
    success: true, lifecycle: { openNotified: 0 },
  });
  expect(blocked.body.notifyPending).toBeGreaterThan(0);
  expect(blocked.body.lifecycle.retryableFailures).toBeGreaterThan(0);
  expect(mockTelegram.sendMessage).not.toHaveBeenCalled();

  // Kill switch kalkinca ARKA PLAN dongusu ayni kaydi teslim eder — koprunun
  // yeniden POST etmesine gerek yoktur (defter/bildirim ayrimi).
  delete process.env.MT5_TRADE_NOTIFY_DISABLED;
  const drained = await notifier.retryPending();
  expect(drained.openNotified).toBe(1);
  expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
});

test('GET feed records candidate but sends no Telegram signal', async () => {
  const res = await request(app).get('/api/bridge/positions').set(auth);
  expect(res.status).toBe(200);
  expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
  expect(notifier.auditStatus()).toMatchObject({ candidates: 1, brokerConfirmedOpens: 0 });
});

test('POST state emits one broker-confirmed opening and exposes reconciliation status', async () => {
  await request(app).get('/api/bridge/positions').set(auth);
  const first = await request(app).post('/api/bridge/state').set(auth).send({ open: [openRow()] });
  expect(first.status).toBe(200);
  expect(first.body.lifecycle).toMatchObject({ openNotified: 1, retryableFailures: 0 });
  expect(first.body.audit).toMatchObject({ notifiedOpens: 1, tradeWithoutSignal: 0 });
  // Sade mesaj (2026-08-01): kod/ticket duyurulmaz; kimlik defterde tutulur.
  expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('EURUSD');
  expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('Giriş');

  const duplicate = await request(app).post('/api/bridge/state').set(auth).send({ open: [openRow()] });
  expect(duplicate.status).toBe(200);
  expect(duplicate.body.lifecycle.openNotified).toBe(0);
  expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
});

test('teslimat hatasi kopruyu kilitlemez: 200 + notifyPending, mesaj arka planda gider', async () => {
  // 2026-07-31 REGRESYONU: Telegram hatasinda 503 donuluyordu; kopru cursor'unu
  // ilerletemedigi icin KAPANISLAR DEFTERE HIC YAZILAMIYORDU (gercek -3.234,88 $
  // iken rapor -74,51 $ dedi). Artik defter yazilir, 200 doner, mesaj sonra gider.
  mockTelegram.sendMessage.mockResolvedValueOnce({ success: false, error: 'network' });
  const failed = await request(app).post('/api/bridge/state').set(auth).send({ open: [openRow('7002')] });
  expect(failed.status).toBe(200);
  expect(failed.body.success).toBe(true);
  expect(failed.body.notifyPending).toBeGreaterThan(0);
  expect(failed.body.audit.tradeWithoutSignal).toBe(1);

  // Kopru TEKRAR gondermeden, arka plan dongusu ayni kaydi teslim eder.
  const drained = await notifier.retryPending();
  expect(drained.openNotified).toBe(1);
  expect(drained.pending).toBe(0);
});

test('kalicilik hatasi HALA 503 doner (kayit kaybolmasin)', async () => {
  // Teslimat hatasi 200'e dusuruldu ama KALICILIK hatasi dusurulemez: kayit
  // diske yazilamadiysa tekrar edilemez, kabul edilirse tamamen kaybolur.
  const originalWrite = fs.writeFileSync;
  const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation((target, ...args) => {
    if (String(target).startsWith(path.join(tempDir, 'notify'))) {
      throw new Error('simulated-read-only-notifier-disk');
    }
    return originalWrite.call(fs, target, ...args);
  });
  try {
    const res = await request(app).post('/api/bridge/state').set(auth).send({ open: [openRow('7009')] });
    expect(res.status).toBe(503);
    expect(res.body.retryable).toBe(true);
  } finally {
    spy.mockRestore();
  }
});

test('POST state never acknowledges 200 when no lifecycle persistence target succeeds', async () => {
  const originalWrite = fs.writeFileSync;
  const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation((target, ...args) => {
    if (String(target).startsWith(path.join(tempDir, 'notify'))) {
      throw new Error('simulated-read-only-notifier-disk');
    }
    return originalWrite.call(fs, target, ...args);
  });
  try {
    const failed = await request(app).post('/api/bridge/state').set(auth).send({ open: [openRow('7003')] });
    expect(failed.status).toBe(503);
    expect(failed.body).toMatchObject({
      success: false, retryable: true, error: 'trade-notification-pending',
      lifecycle: { durabilityFailures: 1 },
    });
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
  } finally {
    writeSpy.mockRestore();
  }
});

test('POST results accepts only real exit deal and announces exact net broker P/L', async () => {
  await request(app).post('/api/bridge/state').set(auth).send({ open: [openRow()] });
  mockTelegram.sendMessage.mockClear();
  const deal = {
    dealTicket: '8001', positionTicket: '7001', magic: 5702, code: 'PRO-9',
    symbol: 'EURUSD', lot: 0.1, exitPrice: 1.1199,
    profit: 10, commission: -1, swap: -0.25, fee: -0.5, pnl: 8.25,
    closedSec: nowSec(), reasonCode: 5,
  };
  const res = await request(app).post('/api/bridge/results').set(auth).send({ deals: [deal] });
  expect(res.status).toBe(200);
  expect(res.body.results).toMatchObject({ ingested: 1, invalid: 0 });
  expect(res.body.lifecycle.closeNotified).toBe(1);
  const message = mockTelegram.sendMessage.mock.calls[0][1];
  // Sade kapanis (2026-08-01): bot / parite / NET kar-zarar. Degismez, duyurulan
  // rakamin BRUT (10) degil komisyon+swap+ucret dusulmus NET (8,25) olmasi.
  expect(message).toContain('EURUSD');
  expect(message).toContain('+$8.25');
  expect(message).not.toContain('$10');    // brut kar asla duyurulmaz
  expect(message).not.toContain('Ücret');  // kalem dokumu mesajdan cikti
});

test('audit endpoint is token-protected and never echoes the token', async () => {
  const denied = await request(app).get('/api/bridge/audit');
  expect(denied.status).toBe(401);
  const ok = await request(app).get('/api/bridge/audit?details=1').set(auth);
  expect(ok.status).toBe(200);
  expect(ok.body).toHaveProperty('audit.healthy');
  expect(JSON.stringify(ok.body)).not.toContain('golden-secret-token');
});
