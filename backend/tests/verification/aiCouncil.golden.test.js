'use strict';

/**
 * AI KONSEYİ — çok-modelli danışma katmanının backend sözleşmesi.
 *
 * Korunan değişmezler:
 *  1. AI kararı yalnız SAKLANIR ve rozetlenir; işlem açma yetkisi YOKTUR
 *     (o sözleşme köprü tarafında: advisory yalnız kısabilir).
 *  2. Telegram yalnız karar DEĞİŞİMİNDE gider — 10 dakikada bir gelen aynı
 *     karar spam üretmez.
 *  3. İlk "normal" kararı duyurulmaz (gürültü); ilk "temkin" duyurulur.
 *  4. Bozuk yük saklanmaz; bayat karar panele "yok" görünür.
 */

const mockTelegram = { sendMessage: jest.fn(async () => ({ success: true })) };
jest.mock('../../src/services/telegramService', () => mockTelegram);
jest.mock('../../src/services/signalDelivery', () => ({ signalChannel: () => '@test' }));

const council = require('../../src/services/aiCouncil');

beforeEach(() => {
  council.resetForTest();
  mockTelegram.sendMessage.mockClear();
  process.env.TELEGRAM_TRADE_CHANNEL = '@test';
});

const payload = (caution, over = {}) => ({
  caution,
  providers: [
    { name: 'ollama:llama3.2', temkin: caution, guven: 0.8, yorum: 'test yorumu' },
  ],
  ...over,
});

describe('AI konseyi kararı', () => {
  test('temkin AÇILINCA tek Telegram gider, tekrarında gitmez', async () => {
    await council.note(payload(true));
    await council.note(payload(true));
    await council.note(payload(true));
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('TEMKİN');
    expect(mockTelegram.sendMessage.mock.calls[0][1]).toContain('yarıya indi');
  });

  test('ilk NORMAL kararı duyurulmaz (gürültü); temkin→normal geçişi duyurulur', async () => {
    await council.note(payload(false));
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();

    await council.note(payload(true));
    await council.note(payload(false));
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(mockTelegram.sendMessage.mock.calls[1][1]).toContain('NORMAL');
  });

  test('mesaj AI sınırını açıkça söyler: yalnız kısar, işlem açmaz', () => {
    const msg = council.transitionMessage({ caution: true, providers: [] });
    expect(msg).toContain('işlem açmaz');
    expect(msg).toContain('kural gevşetemez');
  });

  test('sağlayıcı yorumları mesaja girer, HTML kaçışıyla', () => {
    const msg = council.transitionMessage({
      caution: true,
      providers: [{ name: 'gemini<x>', yorum: 'zarar & risk <b>yüksek</b>' }],
    });
    expect(msg).toContain('gemini&lt;x&gt;');
    expect(msg).toContain('&amp; risk &lt;b&gt;');
  });

  test('bozuk yük saklanmaz', async () => {
    expect(await council.note(null)).toBeNull();
    expect(await council.note({})).toBeNull();
    expect(await council.note({ caution: 'evet' })).toBeNull();
    expect(council.current()).toBeNull();
  });

  test('current() taze kararı döner, bayatı dönmez', async () => {
    await council.note(payload(true));
    const c = council.current();
    expect(c).toMatchObject({ caution: true, scale: 0.5 });
    expect(c.providers[0].name).toBe('ollama:llama3.2');
    expect(council.current(0)).toBeNull();   // 0 ms tavan = her şey bayat
  });

  test('scale her zaman kararla tutarlı: temkin=0.5, normal=1.0', async () => {
    await council.note(payload(true));
    expect(council.current().scale).toBe(0.5);
    await council.note(payload(false));
    expect(council.current().scale).toBe(1.0);
  });

  test('Telegram hatası kararın SAKLANMASINI engellemez', async () => {
    mockTelegram.sendMessage.mockResolvedValueOnce({ success: false, error: 'net' });
    const r = await council.note(payload(true));
    expect(r.stored).toBe(true);
    expect(council.current().caution).toBe(true);
  });
});

describe('köprü sözleşmesi (kaynak taraması)', () => {
  const fs = require('fs');

  test('beyin advisory yı YALNIZ kısma yönünde okur', () => {
    const src = fs.readFileSync(
      require.resolve('../../../mt5-bridge/account_brain.py'), 'utf8');
    // Kirpma: 1.0 üstü asla geçmez, taban 0.25.
    expect(src).toContain('min(1.0, max(ADVISORY_MIN_SCALE, advisory))');
    expect(src).toContain('ADVISORY_MIN_SCALE = 0.25');
    // Bayat/bozuk dosya NÖTR — fail-open nötr yönde.
    expect(src).toMatch(/def load_advisory_scale[\s\S]*?return 1\.0/);
  });

  test('konsey cevapsızlıkta dosyayı GÜNCELLEMEZ (bayatlamaya bırakır)', () => {
    const src = fs.readFileSync(
      require.resolve('../../../mt5-bridge/ai_council.py'), 'utf8');
    expect(src).toContain('bayatlamaya birakildi');
    // Atomik yazım: yarım dosya beyin tarafından okunamaz.
    expect(src).toContain('os.replace(tmp, path)');
  });
});
