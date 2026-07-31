'use strict';

/**
 * C3 — kapanış toplama (kullanıcı kararı D6: açılışlar anlık ve 1:1,
 * kapanışlar toplanabilir).
 *
 * Korunan değişmezler:
 *  1. Hiçbir kapanış kaybolmaz — toplandıysa mutlaka gönderilir.
 *  2. Ters dönüşte kapanışı bekleyen bir AÇILIŞ varsa o kapanış TOPLANMAZ;
 *     yoksa açılış bildirimi de pencere kadar gecikirdi.
 *  3. Toplu mesaj başarısız olursa tüm satırlar yeniden denenebilir kalır
 *     (kısmi "gönderildi" işareti YOK).
 *  4. Süreç yeniden başlarsa toplanmış satır kilitli kalmaz.
 */

jest.mock('../../src/services/telegramService', () => ({ sendMessage: jest.fn() }));
jest.mock('../../src/services/signalDelivery', () => ({ signalChannel: () => '@test' }));

const notifier = require('../../src/services/mt5TradeNotifier');
const mockTelegram = require('../../src/services/telegramService');

const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  process.env.MT5_CLOSE_BATCH_MS = '20000';
  process.env.MT5_NOTIFY_BACKOFF_BASE_MS = '0';   // geri cekilme ayri dosyada
  process.env.MT5_CLOSE_WAIT_OPEN_MS = '0';
  notifier.resetForTest();
  mockTelegram.sendMessage.mockReset().mockResolvedValue({ success: true, messageId: 1 });
  delete process.env.MT5_TRADE_NOTIFY_DISABLED;
});

afterAll(() => { delete process.env.MT5_CLOSE_BATCH_MS; });

const openRow = (ticket, over = {}) => ({
  ticket, magic: 5702, code: `C-${ticket}`, symbol: 'EURUSD', direction: 'LONG',
  lot: 0.1, entry: 1.1, sl: 1.09, tp: 1.12, openedSec: nowSec(), ...over,
});

const closeRow = (dealId, positionTicket, pnl, over = {}) => ({
  dealTicket: dealId, positionTicket, magic: 5702, code: `C-${positionTicket}`,
  symbol: 'EURUSD', lot: 0.1, exitPrice: 1.11, pnl, netPnl: pnl,
  closedSec: nowSec(), reasonCode: 5, ...over,
});

async function openThree() {
  await notifier.ingestState({ open: [openRow('7001'), openRow('7002'), openRow('7003')] });
  mockTelegram.sendMessage.mockClear();
}

describe('kapanış toplama', () => {
  test('aynı turda gelen 3 kapanış TEK mesaj olur ve net yazılır', async () => {
    await openThree();
    await notifier.ingestState({
      closed: [
        closeRow('9001', '7001', 102),
        closeRow('9002', '7002', -414.9),
        closeRow('9003', '7003', 31.2),
      ],
    });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    const msg = mockTelegram.sendMessage.mock.calls[0][1];
    expect(msg).toContain('KAPANIŞLAR (3)');
    expect(msg).toContain('+$102.00');
    expect(msg).toContain('-$414.90');
    expect(msg).toContain('+$31.20');
    expect(msg).toContain('━ Net: <b>-$281.70</b>');
    expect(notifier.auditStatus().notifiedCloses).toBe(3);
  });

  test('tek kapanış pencerede bekler, arkadan gelen ikinciyle birleşir', async () => {
    await openThree();
    await notifier.ingestState({ closed: [closeRow('9001', '7001', 10)] });
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();   // henüz bekliyor

    await notifier.ingestState({ closed: [closeRow('9002', '7002', -4)] });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('KAPANIŞLAR (2)');
  });

  test('yalnız kalan kapanış pencere dolunca TEK SATIR olarak gider', async () => {
    await openThree();
    await notifier.ingestState({ closed: [closeRow('9001', '7001', 10)] });
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();

    const flushed = await notifier.flushCloseBatch({ force: true });
    expect(flushed.closeNotified).toBe(1);
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    // Tek kayıtta toplu başlık YOK — sade kapanış biçimi korunur.
    const msg = mockTelegram.sendMessage.mock.calls[0][1];
    expect(msg).not.toContain('KAPANIŞLAR');
    expect(msg).toContain('+$10.00');
  });

  test('bekleyen açılışı bloke eden kapanış TOPLANMAZ, anında gider', async () => {
    // Ters dönüş: yeni açılış, eski pozisyonun kapanışını bekliyor.
    await notifier.ingestState({ open: [openRow('7001')] });
    mockTelegram.sendMessage.mockClear();
    await notifier.ingestState({
      open: [openRow('7009', {
        direction: 'SHORT', code: 'REV-NEW', closeBeforeOpenTickets: ['7001'],
      })],
      closed: [closeRow('9001', '7001', -12)],
    });
    // Kapanış anında gitti (toplanmadı) -> açılış hemen arkasından gidebildi.
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('-$12.00');
    expect(mockTelegram.sendMessage.mock.calls[0][1]).not.toContain('KAPANIŞLAR');
    expect(mockTelegram.sendMessage.mock.calls[1][1]).toContain('Giriş');
  });

  test('toplu gönderim başarısızsa HİÇBİRİ gönderildi sayılmaz ve yeniden denenir', async () => {
    await openThree();
    mockTelegram.sendMessage.mockResolvedValueOnce({ success: false, error: 'network' });
    await notifier.ingestState({
      closed: [closeRow('9001', '7001', 5), closeRow('9002', '7002', 6)],
    });
    expect(notifier.auditStatus().notifiedCloses).toBe(0);
    expect(notifier.pendingCount()).toBeGreaterThanOrEqual(2);

    const retried = await notifier.retryPending();
    expect(retried.closeNotified).toBe(2);
    expect(notifier.auditStatus().notifiedCloses).toBe(2);
  });

  test('bildirim kapalıyken toplanan kapanış kilitlenmez, açılınca gider', async () => {
    await openThree();
    await notifier.ingestState({ closed: [closeRow('9001', '7001', 7)] });
    process.env.MT5_TRADE_NOTIFY_DISABLED = '1';
    const blocked = await notifier.flushCloseBatch({ force: true });
    expect(blocked.closeNotified).toBe(0);
    expect(blocked.retryableFailures).toBe(1);

    delete process.env.MT5_TRADE_NOTIFY_DISABLED;
    const retried = await notifier.retryPending();
    expect(retried.closeNotified).toBe(1);
  });

  test('12 kapanış tek mesaja sığar; 13.sü sonraki mesaja taşar, kaybolmaz', async () => {
    const opens = [];
    for (let i = 1; i <= 13; i++) opens.push(openRow(`80${i}`));
    await notifier.ingestState({ open: opens });
    mockTelegram.sendMessage.mockClear();

    const closed = [];
    for (let i = 1; i <= 13; i++) closed.push(closeRow(`90${i}`, `80${i}`, 1));
    await notifier.ingestState({ closed });
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('KAPANIŞLAR (12)');

    // Taşan 13. satır hâlâ toplu kuyrukta; zorla boşaltınca gider.
    const rest = await notifier.flushCloseBatch({ force: true });
    expect(rest.closeNotified).toBe(1);
    expect(notifier.auditStatus().notifiedCloses).toBe(13);
  });

  test('MT5_CLOSE_BATCH_MS=0 toplama davranışını tamamen kapatır', async () => {
    process.env.MT5_CLOSE_BATCH_MS = '0';
    await openThree();
    await notifier.ingestState({ closed: [closeRow('9001', '7001', 3)] });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).not.toContain('KAPANIŞLAR');
  });
});
