'use strict';

/**
 * F1 + F2 + F6 — 2026-08-01 düşman incelemesinin onayladığı hatalar.
 *
 * F1 · Telegram sel: "hız sınırlı" iddiası geçersizdi. RETRY_BATCH bütçesi
 *      yalnız retryPending'in ilk iki döngüsündeydi; asıl akış ingestState
 *      hiç bütçe uygulamıyordu. Kanıt: TEK POST'ta 120 mesaj, 15 dakikalık
 *      kesintide 3.784 API çağrısı. Telegram limiti ~20/dk → 429 → ban → asıl
 *      korkulan şey (bildirim kaybı) GERÇEKTEN olur.
 * F1b· `record.attempts` yazılıyor ama hiç okunmuyordu: geri çekilme yoktu.
 * F2 · Kapanış, açılış kaydı hiç görülmemişken bekletilmiyordu → kapanış
 *      açılıştan ÖNCE gidiyordu ve gecikmiş açılış mesajı (sade biçimde
 *      ticket/kod taşımadığı için) CANLI GİRİŞ SİNYALİNDEN ayırt edilemiyordu.
 * F2c· Heuristik eşleşme, hâlâ açık bir pozisyonu defterde "kapalı"
 *      işaretliyordu.
 * F6 · in-flight penceresi (20 sn) Telegram timeout'unun (15 sn) çok
 *      yakınındaydı → aynı işlem iki kez duyurulabiliyordu.
 */

const mockTelegram = { sendMessage: jest.fn(async () => ({ success: true, messageId: 1 })) };
jest.mock('../../src/services/telegramService', () => mockTelegram);
jest.mock('../../src/services/signalDelivery', () => ({ signalChannel: () => '@test' }));
jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn(), loadAll: jest.fn() }));

const notifier = require('../../src/services/mt5TradeNotifier');
const NOW = () => Math.floor(Date.now() / 1000);

const openRow = (ticket, over = {}) => ({
  ticket: String(ticket), magic: 5702, symbol: 'EURUSD', direction: 'long',
  lot: 0.1, price: 1.1, sl: 1.09, tp: 1.12, openedSec: NOW(), ...over,
});
const closeRow = (id, over = {}) => ({
  id: String(id), positionTicket: '1001', magic: 5702, symbol: 'EURUSD',
  profit: 10, commission: 0, swap: 0, price: 1.11, closedSec: NOW(), reason: 5, ...over,
});

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.TELEGRAM_TRADE_CHANNEL = '@test';
  process.env.MT5_CLOSE_BATCH_MS = '0';
  delete process.env.MT5_NOTIFY_RATE_PER_MIN;
  delete process.env.MT5_NOTIFY_BACKOFF_BASE_MS;
  delete process.env.MT5_CLOSE_WAIT_OPEN_MS;
  delete process.env.MT5_TRADE_NOTIFY_DISABLED;
  notifier.resetForTest();
  mockTelegram.sendMessage.mockReset().mockResolvedValue({ success: true, messageId: 1 });
});

afterAll(() => {
  for (const k of ['MT5_CLOSE_BATCH_MS', 'MT5_NOTIFY_RATE_PER_MIN',
    'MT5_NOTIFY_BACKOFF_BASE_MS', 'MT5_CLOSE_WAIT_OPEN_MS', 'TELEGRAM_TRADE_CHANNEL']) {
    delete process.env[k];
  }
});

describe('F1 — Telegram hız sınırı tek boğazdan geçer', () => {
  test('tek POST 60 açılış getirse bile dakika tavanını AŞMAZ', async () => {
    process.env.MT5_NOTIFY_RATE_PER_MIN = '5';
    const opens = [];
    for (let i = 1; i <= 60; i++) opens.push(openRow(`R${i}`));
    const r = await notifier.ingestState({ open: opens });

    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(5);
    expect(r.openNotified).toBe(5);
    // Kalan 55 kayıt KAYBOLMAZ; yeniden denenebilir olarak kuyrukta durur.
    expect(r.retryableFailures).toBe(55);
    expect(notifier.auditStatus()).toMatchObject({
      brokerConfirmedOpens: 60, notifiedOpens: 5, rateLimited: 55,
    });
  });

  test('hız limitine takılan kayıt sonraki pencerede teslim edilir', async () => {
    process.env.MT5_NOTIFY_RATE_PER_MIN = '2';
    process.env.MT5_NOTIFY_BACKOFF_BASE_MS = '0';
    await notifier.ingestState({ open: [openRow('A1'), openRow('A2'), openRow('A3')] });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);

    // Pencere yenilendiğinde kalan kayıt gider (jetonlar tazelenir).
    const start = Date.now();
    jest.useFakeTimers().setSystemTime(start + 61 * 1000);
    try {
      const drained = await notifier.retryPending();
      expect(drained.openNotified).toBe(1);
    } finally { jest.useRealTimers(); }
    expect(notifier.auditStatus().notifiedOpens).toBe(3);
  });

  test('toplu kapanış mesajı TEK jeton harcar (asıl kazanç)', async () => {
    process.env.MT5_CLOSE_BATCH_MS = '20000';
    process.env.MT5_NOTIFY_RATE_PER_MIN = '4';
    const opens = []; const closes = [];
    for (let i = 1; i <= 3; i++) {
      opens.push(openRow(`B${i}`));
      closes.push(closeRow(`C${i}`, { positionTicket: `B${i}` }));
    }
    await notifier.ingestState({ open: opens });          // 3 jeton
    await notifier.ingestState({ closed: closes });       // 1 jeton (toplu)
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(4);
    expect(notifier.auditStatus().notifiedCloses).toBe(3);
  });
});

describe('F1b — üstel geri çekilme', () => {
  test('başarısız teslimat hemen tekrar denenmez', async () => {
    mockTelegram.sendMessage.mockResolvedValueOnce({ success: false, error: 'network' });
    await notifier.ingestState({ open: [openRow('D1')] });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);

    // Köprü 2 sn'de bir POST eder; geri çekilme olmasa ANINDA yeniden denerdi.
    const second = await notifier.ingestState({ open: [openRow('D1')] });
    expect(second.openNotified).toBe(0);
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);

    // Süre dolunca teslim edilir — kayıt asla düşmez.
    const start = Date.now();
    jest.useFakeTimers().setSystemTime(start + 30 * 1000);
    try {
      const drained = await notifier.retryPending();
      expect(drained.openNotified).toBe(1);
    } finally { jest.useRealTimers(); }
  });

  test('sürekli başarısız kayıt TAKILMIŞ olarak görünür (sessiz kalmaz)', async () => {
    process.env.MT5_NOTIFY_BACKOFF_BASE_MS = '0';
    mockTelegram.sendMessage.mockResolvedValue({ success: false, error: 'network' });
    await notifier.ingestState({ open: [openRow('E1')] });
    for (let i = 0; i < 9; i++) await notifier.retryPending();
    const audit = notifier.auditStatus();
    expect(audit.stuckNotifications).toBeGreaterThan(0);
    expect(audit.healthy).toBe(false);
  });
});

describe('F2 — kapanış açılıştan önce gidemez', () => {
  test('açılış kaydı HİÇ görülmemişse kapanış bekletilir', async () => {
    const r = await notifier.ingestState({
      closed: [closeRow('9001', { positionTicket: 'GHOST-1', notificationRequired: true })],
    });
    expect(r.closeNotified).toBe(0);
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
  });

  test('gecikmiş açılış gelince sıra doğru olur: önce AÇILIŞ, sonra kapanış', async () => {
    await notifier.ingestState({
      closed: [closeRow('9002', { positionTicket: 'LATE-1', notificationRequired: true })],
    });
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();

    await notifier.ingestState({ open: [openRow('LATE-1')] });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('Giriş');   // açılış
    expect(mockTelegram.sendMessage.mock.calls[1][1]).not.toContain('Giriş'); // kapanış
  });

  test('açılış hiç gelmezse kapanış tavan dolunca YİNE DE duyurulur', async () => {
    process.env.MT5_CLOSE_WAIT_OPEN_MS = '1000';
    await notifier.ingestState({
      closed: [closeRow('9003', { positionTicket: 'NEVER-1', notificationRequired: true })],
    });
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();

    const start = Date.now();
    jest.useFakeTimers().setSystemTime(start + 5000);
    try {
      const drained = await notifier.retryPending();
      expect(drained.closeNotified).toBe(1);
    } finally { jest.useRealTimers(); }
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  test('kapanışı zaten duyurulmuş pozisyon için AÇILIŞ mesajı gönderilmez', async () => {
    process.env.MT5_CLOSE_WAIT_OPEN_MS = '0';   // açılış hiç görülmedi, hemen bırak
    await notifier.ingestState({
      closed: [closeRow('9004', { positionTicket: 'DEAD-1', notificationRequired: true })],
    });
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);   // kapanış gitti
    mockTelegram.sendMessage.mockClear();

    // Açılış geç geldi. Sade mesajda ticket/kod olmadığı için bu mesaj CANLI
    // GİRİŞ SİNYALİ gibi görünürdü; kullanıcı ölü bir işleme girebilirdi.
    const late = await notifier.ingestState({ open: [openRow('DEAD-1')] });
    expect(late.openNotified).toBe(0);
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    expect(notifier.auditStatus().brokerConfirmedOpens).toBe(1);   // deftere yazıldı
  });
});

describe('F2c — heuristik eşleşme canlı pozisyonu kapalı işaretlemez', () => {
  test('aynı magic+sembolde İKİ açık varken kapanış hiçbirine bağlanmaz', async () => {
    await notifier.ingestState({ open: [openRow('H1'), openRow('H2')] });
    mockTelegram.sendMessage.mockClear();
    process.env.MT5_CLOSE_WAIT_OPEN_MS = '0';

    await notifier.ingestState({
      closed: [closeRow('9005', { positionTicket: 'H-UNKNOWN', notificationRequired: true })],
    });
    // Tahmin YOK: iki aday varken hangisinin kapandığı bilinemez.
    expect(notifier.auditStatus().closeWithoutOpen).toBe(1);
  });

  test('tek aday varsa eşleşme SAYILIR ama pozisyon KAPALI işaretlenmez', async () => {
    await notifier.ingestState({ open: [openRow('H3')] });
    mockTelegram.sendMessage.mockClear();
    process.env.MT5_CLOSE_WAIT_OPEN_MS = '0';

    await notifier.ingestState({
      closed: [closeRow('9006', { positionTicket: 'H-OTHER', notificationRequired: true })],
    });
    // Kapanış mesajı gitti ve "yetim" sayılmadı...
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(notifier.auditStatus().closeWithoutOpen).toBe(0);

    // ...ama H3 hâlâ AÇIK: sonraki kesin kapanışı normal şekilde eşleşir.
    const exact = await notifier.ingestState({
      closed: [closeRow('9007', { positionTicket: 'H3', notificationRequired: true })],
    });
    expect(exact.closeNotified).toBe(1);
  });
});

describe('F6 — in-flight penceresi Telegram timeout\'unun çok üstünde', () => {
  test('varsayılan pencere en az 45 sn', () => {
    delete process.env.MT5_NOTIFY_INFLIGHT_MS;
    const src = require('fs').readFileSync(
      require.resolve('../../src/services/mt5TradeNotifier/index.js'), 'utf8');
    const m = src.match(/MT5_NOTIFY_INFLIGHT_MS \|\| (\d+)/);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(45000);
  });

  test('drenaj zamanlayıcısında tekrar-giriş kilidi var', () => {
    const src = require('fs').readFileSync(
      require.resolve('../../src/server-live.js'), 'utf8');
    expect(src).toContain('tradeNotifyDraining');
  });
});
