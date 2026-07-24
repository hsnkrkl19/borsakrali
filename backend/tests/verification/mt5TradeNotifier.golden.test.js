'use strict';

/**
 * ⭐ GOLDEN — 2026-07-24 kullanıcı talebi:
 * "botlar işlem açtığına dair bildirim atmasın. zaten bildirim attığında işlem
 *  açması lazım. bir daha bildirim atarak spam yaratıyor."
 *
 * Çift mesajın kökü: aynı işlem için İKİ bağımsız duyuru yolu vardı —
 *   (1) botun kendi sinyal bildirimi (paper pozisyon açılınca),
 *   (2) mt5TradeNotifier (köprü aynı pozisyonu MT5'te açıp geri bildirince).
 * Dedup evrenleri ayrık olduğu için çakışma GARANTİYDİ. Artık (2) susar.
 *
 * İkinci spam kaynağı: köprü her 5 dk'da SON 7 GÜNÜN kapanışlarını POST ediyor
 * (report_real_results). Backend restart'ı dedup'ı sıfırlarsa 7 günlük geçmiş
 * tek seferde Telegram'a boşalıyordu (2026-07-21 NR7 olayının aynısı).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt5-notify-'));
process.env.BOT_DATA_DIR = tempDir;
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_TRADE_CHANNEL = '@test';

const sent = [];
jest.mock('../../src/services/telegramService', () => ({
  sendMessage: jest.fn(async (chatId, text) => { sent.push(text); return true; }),
}));
jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn(), loadAll: jest.fn() }));

const notifier = require('../../src/services/mt5TradeNotifier');

const NOW_SEC = () => Math.floor(Date.now() / 1000);

function openRow(ticket, symbol = 'EURUSD') {
  return { ticket: String(ticket), magic: 5701, symbol, direction: 'long', lot: 0.1, price: 1.1, sl: 1.09, tp: 1.12 };
}
function closeRow(id, closedSec) {
  return { id: String(id), magic: 5701, pnl: 12.5, closedSec, reason: 0, symbol: 'EURUSD' };
}

// ⚠️ Temizlik DOSYA seviyesinde: describe içindeki afterAll o blok biter bitmez
// çalışır ve TELEGRAM_TRADE_CHANNEL'ı silerek sonraki bloğun mesajlarını sessizce
// düşürürdü (send() chatId bulamayınca false döner).
afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.BOT_DATA_DIR;
  delete process.env.TELEGRAM_TRADE_CHANNEL;
});

describe('mt5TradeNotifier — açılış duyurusu kapalı (çift mesaj düzeltmesi)', () => {
  beforeEach(() => {
    sent.length = 0;
    notifier.resetForTest();
    delete process.env.MT5_TRADE_NOTIFY_OPEN;
  });

  test('⭐ MT5\'te açılan işlem için İKİNCİ mesaj GİTMEZ', async () => {
    const r = await notifier.ingestState({ open: [openRow(1), openRow(2)] });
    expect(r.openNotified).toBe(0);
    expect(sent).toHaveLength(0);
  });

  test('ticket yine de işaretlenir: duyuru geri açılsa geçmiş toplu duyurulmaz', async () => {
    await notifier.ingestState({ open: [openRow(10)] });
    expect(sent).toHaveLength(0);
    process.env.MT5_TRADE_NOTIFY_OPEN = '1';
    const r = await notifier.ingestState({ open: [openRow(10)] });   // AYNI ticket
    expect(r.openNotified).toBe(0);
    expect(r.skipped).toBe(1);
    expect(sent).toHaveLength(0);
  });

  test('MT5_TRADE_NOTIFY_OPEN=1 ile açılış duyurusu geri açılabilir (kill switch)', async () => {
    process.env.MT5_TRADE_NOTIFY_OPEN = '1';
    const r = await notifier.ingestState({ open: [openRow(20)] });
    expect(r.openNotified).toBe(1);
    expect(sent[0]).toContain("MT5'te AÇILDI");
  });
});

describe('mt5TradeNotifier — bayat kapanış duyurulmaz (7 günlük pencere spam\'i)', () => {
  beforeEach(() => { sent.length = 0; notifier.resetForTest(); });

  test('TAZE kapanış duyurulur', async () => {
    const r = await notifier.ingestState({ closed: [closeRow(100, NOW_SEC() - 60)] });
    expect(r.closeNotified).toBe(1);
    expect(sent[0]).toContain('KAPANDI');
  });

  test('⭐ 3 gün önceki kapanış SESSİZCE kaydedilir (restart sonrası boşalma yok)', async () => {
    const threeDaysAgo = NOW_SEC() - 3 * 24 * 3600;
    const r = await notifier.ingestState({ closed: [closeRow(200, threeDaysAgo)] });
    expect(r.closeNotified).toBe(0);
    expect(sent).toHaveLength(0);
    // Yine de işaretlendi → ikinci turda tekrar değerlendirilmez.
    const again = await notifier.ingestState({ closed: [closeRow(200, threeDaysAgo)] });
    expect(again.skipped).toBe(1);
  });

  test('⭐ köprünün 7 GÜNLÜK toplu POST\'u yalnız taze olanları duyurur', async () => {
    const now = NOW_SEC();
    const batch = [];
    for (let d = 0; d < 7; d++) batch.push(closeRow(300 + d, now - d * 24 * 3600));
    const r = await notifier.ingestState({ closed: batch });
    expect(r.closeNotified).toBe(1);      // yalnız bugünkü (d=0)
    expect(sent).toHaveLength(1);
  });

  test('closedSec yoksa duyurulur (bilgi eksikse sessizleşme)', async () => {
    const r = await notifier.ingestState({ closed: [{ id: '400', magic: 5701, pnl: 1, symbol: 'EURUSD' }] });
    expect(r.closeNotified).toBe(1);
  });
});
