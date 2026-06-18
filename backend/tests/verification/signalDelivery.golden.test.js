/**
 * GOLDEN TESTS — Sinyal bildirim yönlendirmesi (kanal-tek, BIST hariç).
 *
 *   1) signalDelivery — channelOnly varsayılan AÇIK / =0 kapalı; signalChannel
 *      yalnız kanal döner, DM'e (TELEGRAM_CHAT_ID) DÜŞMEZ.
 *   2) cryptoChannelNotifier.buildMessage — bölümler, boş bölüm atlanır, boşsa null.
 *   3) mtfPushNotifier — kanal-tek modda kişisel push SUSAR.
 */

const OLD_ENV = { ...process.env };
afterEach(() => { process.env = { ...OLD_ENV }; });

const sd = require('../../src/services/signalDelivery');
const crypto = require('../../src/services/cryptoChannelNotifier');

describe('signalDelivery', () => {
  test('channelOnly varsayılan AÇIK; =0 kapatır', () => {
    delete process.env.SIGNALS_CHANNEL_ONLY; expect(sd.channelOnly()).toBe(true);
    process.env.SIGNALS_CHANNEL_ONLY = '0'; expect(sd.channelOnly()).toBe(false);
    process.env.SIGNALS_CHANNEL_ONLY = '1'; expect(sd.channelOnly()).toBe(true);
  });

  test('signalChannel kanalı döner; DM (TELEGRAM_CHAT_ID) DÖNMEZ', () => {
    process.env.TELEGRAM_FOREX_CHANNEL = '-1001234567890';
    process.env.TELEGRAM_CHAT_ID = '999999';
    expect(sd.signalChannel()).toBe('-1001234567890');
    delete process.env.TELEGRAM_FOREX_CHANNEL;
    delete process.env.TELEGRAM_SIGNAL_CHANNEL;
    expect(sd.signalChannel()).not.toBe('999999');   // DM'e düşmez
    expect(sd.signalChannel()).toBe('');
  });
});

describe('cryptoChannelNotifier.buildMessage', () => {
  test('dolu bölümler + boş bölüm atlanır + sembol/giriş/skor', () => {
    const res = {
      spot_long: { signals: [{ symbol: 'btc', entry: 105000, stop: 102000, target1: 112000, totalScore: 8, historicalWinRate: 62 }] },
      futures_long: { signals: [] },
      futures_short: { signals: [{ symbol: 'xrp', entry: 2.1, stop: 2.2, target1: 1.8, totalScore: 7 }] },
    };
    const m = crypto.buildMessage(res, '09:00');
    expect(m).toContain('KRİPTO');
    expect(m).toContain('BTC');
    expect(m).toContain('SPOT');
    expect(m).toContain('FUTURES SHORT');
    expect(m).toContain('XRP');
    expect(m).not.toContain('FUTURES LONG');           // boş bölüm atlandı
    expect(m).toMatch(/Yatırım tavsiyesi/);
  });

  test('hiç sinyal yoksa null (mesaj atılmaz)', () => {
    const empty = { spot_long: { signals: [] }, futures_long: { signals: [] }, futures_short: { signals: [] } };
    expect(crypto.buildMessage(empty, '13:00')).toBeNull();
  });
});

describe('mtfPushNotifier — kanal-tek + izinli parite filtresi (BTC/ETH)', () => {
  const mtf = require('../../src/services/mtfPushNotifier');
  beforeEach(() => {
    mtf.reset();
    process.env.SIGNALS_CHANNEL_ONLY = '1';
    process.env.MTF_CHANNEL_SYMBOLS = 'BTC,ETH';
    delete process.env.TELEGRAM_FOREX_CHANNEL; // chatId boş → testte gerçek gönderim olmaz
  });

  test('izinli parite (ETH) → kanala (FCM yok)', async () => {
    const r = await mtf.evaluateAndPush([{ symbol: 'ETHUSDT', verdict: 'STRONG_LONG', confidence: 0.9, net: 1, alignedLong: 7, alignedShort: 0 }]);
    expect(r.channel).toBe(true);
    expect(r.pushed).toBe(1);
  });

  test('izinsiz parite (DOGE) → push YOK', async () => {
    const r = await mtf.evaluateAndPush([{ symbol: 'DOGEUSDT', verdict: 'STRONG_LONG', confidence: 0.9, net: 1 }]);
    expect(r.pushed).toBe(0);
  });
});
