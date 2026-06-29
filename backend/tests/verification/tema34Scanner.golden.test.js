/**
 * GOLDEN TESTS — YALNIZ TEMA34 tarama bildirim sistemi (ayrı kanal).
 *
 * Kapsam:
 *   1) tema34ScannerNotifier saf kurucular — Telegram bölüm/parçalama (YALNIZ
 *      TEMA34 kovaları), header/footer, ≤4096 parçalama, channelId env davranışı.
 *   2) runAndNotify skip yolları — kanal ayarlı değilken 'no-channel', kırılım
 *      yokken 'no-crossings' (Telegram'a HİÇ dokunmadan), kill-switch 'disabled'.
 *
 * crossoverScanner.scanAll, telegramService, store ve botPersistence mock'lanır →
 * modül izole & hızlı; ağ/Yahoo/Supabase'e dokunulmaz.
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

// Store'u in-memory mock'la — diske yazmasın, testler arası dedup state taşımasın.
let mockLastCandle = null;
jest.mock('../../src/services/tema34Scanner/tema34ScannerStore', () => ({
  getLastCandleDate: () => mockLastCandle,
  markNotified: (d) => { mockLastCandle = d; },
  recordRun: () => {},
}));

// scanAll'ı mock'la — testler ham tarama sonucunu doğrudan besler.
const mockScan = jest.fn();
jest.mock('../../src/services/crossover/crossoverScanner', () => ({
  scanAll: (...a) => mockScan(...a),
  isRunning: () => false,
  CONFIG: { PERIOD: 34 },
}));

const notifier = require('../../src/services/tema34Scanner/tema34ScannerNotifier');

// ── 1) Saf kurucular ────────────────────────────────────────────────────────
describe('tema34ScannerNotifier — saf kurucular', () => {
  const baseResult = () => ({
    candleDate: '2026-06-29', scanned: 480, fetchErrors: 3,
    tema34: {
      up: [{ symbol: 'THYAO', close: 312.5, line: 311, distancePct: 0.5 },
           { symbol: 'GARAN', close: 5.1, line: 5.0, distancePct: 2 }],
      down: [{ symbol: 'SISE', close: 40, line: 41, distancePct: -2 }],
    },
    // ema34 kovaları sonuçta bulunabilir ama bu bot onları YOK SAYAR
    ema34: { up: [{ symbol: 'ASELS', close: 50, line: 49, distancePct: 1 }], down: [] },
    counts: { temaUp: 2, temaDown: 1, emaUp: 1, emaDown: 0 },
  });

  test('buildTelegramSection — boş kova boş string; dolu kova başlık+sayı+satır', () => {
    expect(notifier.buildTelegramSection('🟢', 'X', [])).toBe('');
    const s = notifier.buildTelegramSection('🟢', 'TEMA34 Up', [{ symbol: 'THYAO', close: 312.5, distancePct: 0.5 }]);
    expect(s).toContain('TEMA34 Up');
    expect(s).toContain('(1)');
    expect(s).toContain('THYAO');
    expect(s).toContain('+0.5%');
  });

  test('buildTelegramMessages — TEMA34 başlığı + footer; TEMA hisseleri var, EMA hisseleri YOK', () => {
    const msgs = notifier.buildTelegramMessages(baseResult());
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('TEMA34 TARAMASI');
    expect(msgs[0]).toContain('2026-06-29');
    expect(msgs[0]).toContain(notifier.DEEP_LINK);
    expect(msgs[0]).toContain('THYAO');   // TEMA up
    expect(msgs[0]).toContain('SISE');    // TEMA down
    expect(msgs[0]).not.toContain('ASELS'); // EMA kovası bu bota dahil DEĞİL
  });

  test('buildTelegramMessages — çok büyük liste birden fazla mesaja bölünür (≤4096)', () => {
    const big = baseResult();
    big.tema34.up = Array.from({ length: 200 }, (_, i) => ({
      symbol: `SYM${i}`, close: 100 + i, distancePct: 0.1,
    }));
    big.tema34.down = Array.from({ length: 200 }, (_, i) => ({
      symbol: `DWN${i}`, close: 100 + i, distancePct: -0.1,
    }));
    const msgs = notifier.buildTelegramMessages(big);
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(4096);
  });

  test('channelId — env yokken boş, varken env değeri', () => {
    const prev = process.env.TELEGRAM_TEMA34_CHANNEL;
    delete process.env.TELEGRAM_TEMA34_CHANNEL;
    expect(notifier.channelId()).toBe('');
    process.env.TELEGRAM_TEMA34_CHANNEL = '-100999';
    expect(notifier.channelId()).toBe('-100999');
    if (prev === undefined) delete process.env.TELEGRAM_TEMA34_CHANNEL;
    else process.env.TELEGRAM_TEMA34_CHANNEL = prev;
  });
});

// ── 2) runAndNotify skip yolları ─────────────────────────────────────────────
describe('tema34ScannerNotifier.runAndNotify — skip yolları', () => {
  const okResult = (over = {}) => ({
    ok: true, candleDate: '2026-06-29', scanned: 480, fetchErrors: 1,
    tema34: { up: [{ symbol: 'THYAO', close: 10, line: 9, distancePct: 1 }], down: [] },
    ema34: { up: [], down: [] },
    counts: { temaUp: 1, temaDown: 0, emaUp: 0, emaDown: 0 },
    ...over,
  });

  beforeEach(() => {
    mockTgSend.mockClear();
    mockScan.mockReset();
    mockLastCandle = null;
    delete process.env.TELEGRAM_TEMA34_CHANNEL;
    delete process.env.TEMA34_SCANNER_DISABLED;
  });

  test('kanal ayarlı değil → no-channel, Telegram çağrılmaz, gün işaretlenmez', async () => {
    mockScan.mockResolvedValue(okResult());
    const r = await notifier.runAndNotify();
    expect(r.ok).toBe(true);
    expect(r.skippedReason).toBe('no-channel');
    expect(r.notified).toBe(false);
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('TEMA34 kırılımı yok → no-crossings, Telegram çağrılmaz (kanal ayarlı olsa bile)', async () => {
    process.env.TELEGRAM_TEMA34_CHANNEL = '-100999';
    mockScan.mockResolvedValue(okResult({
      tema34: { up: [], down: [] }, counts: { temaUp: 0, temaDown: 0, emaUp: 5, emaDown: 5 },
    }));
    const r = await notifier.runAndNotify();
    expect(r.skippedReason).toBe('no-crossings');
    expect(r.total).toBe(0);                 // YALNIZ TEMA sayılır — EMA göz ardı
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('kill-switch açık → disabled, Telegram çağrılmaz', async () => {
    process.env.TELEGRAM_TEMA34_CHANNEL = '-100999';
    process.env.TEMA34_SCANNER_DISABLED = '1';
    mockScan.mockResolvedValue(okResult());
    const r = await notifier.runAndNotify();
    expect(r.skippedReason).toBe('disabled');
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('kanal ayarlı + kırılım var → Telegram gönderilir, notified=true', async () => {
    process.env.TELEGRAM_TEMA34_CHANNEL = '-100999';
    mockScan.mockResolvedValue(okResult());
    const r = await notifier.runAndNotify();
    expect(r.notified).toBe(true);
    expect(r.telegramSent).toBeGreaterThan(0);
    expect(mockTgSend).toHaveBeenCalled();
    // doğru kanala gitti
    expect(mockTgSend.mock.calls[0][0]).toBe('-100999');
  });

  test('tarama başarısız (ok=false) → notified=false, hata taşınır', async () => {
    mockScan.mockResolvedValue({ ok: false, error: 'boom' });
    const r = await notifier.runAndNotify();
    expect(r.ok).toBe(false);
    expect(r.notified).toBe(false);
    expect(r.error).toBe('boom');
  });
});
