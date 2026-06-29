/**
 * GOLDEN TESTS — çok-zaman-dilimli (4h + 1d) YALNIZ-TEMA34 tarama bildirimcisi.
 *
 * Kapsam:
 *   1) tema34ScanEngine.resampleHours — 1h→4h UTC-hizalı toplama (OHLC + close).
 *   2) tema34ScannerNotifier saf kurucular — TF mesaj başlığı/bölümleri (yeni
 *      giren / sat bölgesine yeni geçen), ≤4096 parçalama, channelId, barKeyOf.
 *   3) runAndNotify / processTimeframe — TF-bazlı dedup + skip yolları
 *      (no-channel / no-crossings / disabled), doğru kanala gönderim, 4h ve 1d
 *      bağımsız ilerler.
 *
 * engine.scanAll, telegramService, store ve botPersistence mock'lanır → izole.
 */

jest.mock('../../src/services/botPersistence', () => ({
  save: () => {},
  loadAll: async () => {},
}));

// Telegram gönderimini casusla — gerçek ağ yok.
const mockTgSend = jest.fn(async () => ({ success: true, messageId: 1 }));
jest.mock('../../src/services/telegramService', () => ({
  sendMessage: (...args) => mockTgSend(...args),
}));

// engine.scanAll'ı mock'la — testler ham TF sonuçlarını doğrudan besler.
const mockScanAll = jest.fn();
jest.mock('../../src/services/tema34Scanner/tema34ScanEngine', () => {
  const real = jest.requireActual('../../src/services/tema34Scanner/tema34ScanEngine');
  return { ...real, scanAll: (...a) => mockScanAll(...a) };
});

// Store'u in-memory mock'la — diske yazmasın, testler arası TF dedup taşımasın.
let mockBars = {};
jest.mock('../../src/services/tema34Scanner/tema34ScannerStore', () => ({
  getLastBar: (tf) => mockBars[tf] || null,
  markBar: (tf, key) => { mockBars[tf] = key; },
  recordRun: () => {},
}));

const engine = require('../../src/services/tema34Scanner/tema34ScanEngine');
const notifier = require('../../src/services/tema34Scanner/tema34ScannerNotifier');

// ── 1) Engine resample ──────────────────────────────────────────────────────
describe('tema34ScanEngine.resampleHours — 1h → 4h', () => {
  test('UTC 4h sınırına hizalı toplar; close = grubun son kapanışı', () => {
    // 00:00,01:00,02:00,03:00 UTC → tek 4h bar [00-04). 04:00 → yeni bar.
    const h = (hour, close) => ({ timestamp: Date.UTC(2026, 5, 29, hour) , close, high: close + 1, low: close - 1, open: close });
    const h1 = [h(0, 10), h(1, 11), h(2, 12), h(3, 13), h(4, 20), h(5, 21)];
    const out = engine.resampleHours(h1, 4);
    expect(out).toHaveLength(2);
    expect(out[0].close).toBe(13);            // [00-04) son kapanış
    expect(out[0].high).toBe(14);             // max(11..14) = 13+1
    expect(out[1].close).toBe(21);            // [04-08)
    expect(out[0].timestamp).toBe(Date.UTC(2026, 5, 29, 0));
  });

  test('geçersiz / close=null mumları atlar', () => {
    const out = engine.resampleHours([
      { timestamp: Date.UTC(2026, 5, 29, 0), close: 10 },
      { timestamp: Date.UTC(2026, 5, 29, 1), close: null },
      { timestamp: NaN, close: 5 },
    ], 4);
    expect(out).toHaveLength(1);
    expect(out[0].close).toBe(10);
  });
});

// ── 2) Notifier saf kurucular ───────────────────────────────────────────────
describe('tema34ScannerNotifier — saf kurucular', () => {
  const tfResult = (tf = '1d') => ({
    ok: true, tf, candleDate: '2026-06-29', barTime: Date.UTC(2026, 5, 29, 12), scanned: 480, fetchErrors: 3,
    up: [{ symbol: 'THYAO', close: 312.5, line: 311, distancePct: 0.5 },
         { symbol: 'GARAN', close: 5.1, line: 5.0, distancePct: 2 }],
    down: [{ symbol: 'SISE', close: 40, line: 41, distancePct: -2 }],
  });

  test('buildTelegramSection — boş kova boş; dolu kova başlık+sayı+satır', () => {
    expect(notifier.buildTelegramSection('🟢', 'X', [])).toBe('');
    const s = notifier.buildTelegramSection('🟢', 'Yeni girenler', [{ symbol: 'THYAO', close: 312.5, distancePct: 0.5 }]);
    expect(s).toContain('Yeni girenler');
    expect(s).toContain('(1)');
    expect(s).toContain('THYAO');
    expect(s).toContain('+0.5%');
  });

  test('buildTimeframeMessages (1d) — GÜNLÜK başlık + yeni giren/sat bölgesi + footer', () => {
    const msgs = notifier.buildTimeframeMessages(tfResult('1d'));
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('TEMA34 TARAMASI — GÜNLÜK');
    expect(msgs[0]).toContain('2026-06-29');
    expect(msgs[0]).toContain('Yeni girenler (AL bölgesi)');
    expect(msgs[0]).toContain('Sat bölgesine yeni geçenler');
    expect(msgs[0]).toContain('THYAO');
    expect(msgs[0]).toContain('SISE');
    expect(msgs[0]).toContain(notifier.DEEP_LINK);
  });

  test('buildTimeframeMessages (4h) — 4 SAATLİK başlığı taşır', () => {
    const msgs = notifier.buildTimeframeMessages(tfResult('4h'));
    expect(msgs[0]).toContain('TEMA34 TARAMASI — 4 SAATLİK');
  });

  test('buildTimeframeMessages — büyük liste ≤4096 parçalara bölünür', () => {
    const big = tfResult('1d');
    big.up = Array.from({ length: 200 }, (_, i) => ({ symbol: `S${i}`, close: 100 + i, distancePct: 0.1 }));
    big.down = Array.from({ length: 200 }, (_, i) => ({ symbol: `D${i}`, close: 100 + i, distancePct: -0.1 }));
    const msgs = notifier.buildTimeframeMessages(big);
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(4096);
  });

  test('barKeyOf — 1d tarih; 4h son bar ISO zamanı', () => {
    expect(notifier.barKeyOf({ tf: '1d', candleDate: '2026-06-29' })).toBe('2026-06-29');
    expect(notifier.barKeyOf({ tf: '4h', barTime: Date.UTC(2026, 5, 29, 12) }))
      .toBe(new Date(Date.UTC(2026, 5, 29, 12)).toISOString());
  });

  test('channelId — env yokken boş, varken env değeri', () => {
    delete process.env.TELEGRAM_TEMA34_CHANNEL;
    expect(notifier.channelId()).toBe('');
    process.env.TELEGRAM_TEMA34_CHANNEL = '@tema34sinyal';
    expect(notifier.channelId()).toBe('@tema34sinyal');
    delete process.env.TELEGRAM_TEMA34_CHANNEL;
  });
});

// ── 3) runAndNotify / processTimeframe ───────────────────────────────────────
describe('tema34ScannerNotifier.runAndNotify — TF dedup + skip yolları', () => {
  const tfOk = (tf, over = {}) => ({
    ok: true, tf, candleDate: '2026-06-29', barTime: Date.UTC(2026, 5, 29, 12), scanned: 480, fetchErrors: 1,
    up: [{ symbol: 'THYAO', close: 10, line: 9, distancePct: 1 }], down: [], ...over,
  });
  const scanResult = (over = {}) => ({
    ok: true, '4h': tfOk('4h'), '1d': tfOk('1d'), ...over,
  });

  beforeEach(() => {
    mockTgSend.mockClear();
    mockScanAll.mockReset();
    mockBars = {};
    delete process.env.TELEGRAM_TEMA34_CHANNEL;
    delete process.env.TEMA34_SCANNER_DISABLED;
  });

  test('kanal yok → her iki TF no-channel, Telegram çağrılmaz', async () => {
    mockScanAll.mockResolvedValue(scanResult());
    const r = await notifier.runAndNotify();
    expect(r.ok).toBe(true);
    expect(r.timeframes['4h'].skippedReason).toBe('no-channel');
    expect(r.timeframes['1d'].skippedReason).toBe('no-channel');
    expect(r.notified).toBe(false);
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('kanal var + kırılım var → her iki TF gönderilir, doğru kanala', async () => {
    process.env.TELEGRAM_TEMA34_CHANNEL = '@tema34sinyal';
    mockScanAll.mockResolvedValue(scanResult());
    const r = await notifier.runAndNotify();
    expect(r.notified).toBe(true);
    expect(r.timeframes['4h'].notified).toBe(true);
    expect(r.timeframes['1d'].notified).toBe(true);
    expect(mockTgSend).toHaveBeenCalled();
    expect(mockTgSend.mock.calls[0][0]).toBe('@tema34sinyal');
  });

  test('TF-bazlı dedup — 1d aynı gün ikinci kez atlanır, 4h yeni bar ilerler', async () => {
    process.env.TELEGRAM_TEMA34_CHANNEL = '@tema34sinyal';
    mockScanAll.mockResolvedValue(scanResult());
    await notifier.runAndNotify();                 // ilk: ikisi de gönderildi
    mockTgSend.mockClear();

    // 4h yeni bara ilerlesin (barTime farklı), 1d aynı gün kalsın
    mockScanAll.mockResolvedValue(scanResult({
      '4h': tfOk('4h', { barTime: Date.UTC(2026, 5, 29, 16) }),
      '1d': tfOk('1d'),
    }));
    const r = await notifier.runAndNotify();
    expect(r.timeframes['1d'].skippedReason).toBe('already-notified');
    expect(r.timeframes['4h'].notified).toBe(true);   // yeni 4h barı gitti
  });

  test('TEMA34 kırılımı yok → no-crossings, Telegram çağrılmaz, bar işaretlenir', async () => {
    process.env.TELEGRAM_TEMA34_CHANNEL = '@tema34sinyal';
    mockScanAll.mockResolvedValue(scanResult({
      '4h': tfOk('4h', { up: [], down: [] }),
      '1d': tfOk('1d', { up: [], down: [] }),
    }));
    const r = await notifier.runAndNotify();
    expect(r.timeframes['4h'].skippedReason).toBe('no-crossings');
    expect(r.timeframes['1d'].skippedReason).toBe('no-crossings');
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('kill-switch → disabled, Telegram çağrılmaz', async () => {
    process.env.TELEGRAM_TEMA34_CHANNEL = '@tema34sinyal';
    process.env.TEMA34_SCANNER_DISABLED = '1';
    mockScanAll.mockResolvedValue(scanResult());
    const r = await notifier.runAndNotify();
    expect(r.timeframes['4h'].skippedReason).toBe('disabled');
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('tarama tamamen başarısız → ok=false', async () => {
    mockScanAll.mockResolvedValue({ ok: false, error: 'boom' });
    const r = await notifier.runAndNotify();
    expect(r.ok).toBe(false);
    expect(r.error).toBe('boom');
  });

  test('bir TF başarısız diğeri başarılı → başarılı olan gönderilir', async () => {
    process.env.TELEGRAM_TEMA34_CHANNEL = '@tema34sinyal';
    mockScanAll.mockResolvedValue(scanResult({
      '4h': { ok: false, tf: '4h', error: 'veri yok' },
      '1d': tfOk('1d'),
    }));
    const r = await notifier.runAndNotify();
    expect(r.timeframes['4h'].skippedReason).toBe('scan-failed');
    expect(r.timeframes['1d'].notified).toBe(true);
  });
});
