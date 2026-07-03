/**
 * GOLDEN TESTS — BIST "≥80 kaliteli AL" tam-evren tarama bildirim sistemi
 * (ayrı yeni Telegram kanalı).
 *
 * Kapsam:
 *   1) Saf kurucular — buildSignalBlock / buildTelegramMessages (header/footer,
 *      güven/giriş/SL/TP satırları, ≤4096 parçalama), channelId env davranışı.
 *   2) SIKI KAPI (passesGate) — fiyat≤EMA34 ELER, hacim≤ortalama ELER, ikisi de
 *      geçerse zenginleştirilmiş sinyal döner.
 *   3) runAndNotify yolları — no-channel / no-signals / disabled / already-sent
 *      (günlük dedup) skip'leri ve kanal+sinyal varken gönderim + markSent.
 *
 * bistScoreEngine.scan, liveDataService, telegramService, store, botPersistence
 * mock'lanır → modül izole & hızlı; ağ/Yahoo/Supabase'e dokunulmaz.
 */

jest.mock('../../src/services/botPersistence', () => ({ save: () => {}, loadAll: async () => {} }));

const mockTgSend = jest.fn(async () => ({ success: true, messageId: 1 }));
jest.mock('../../src/services/telegramService', () => ({ sendMessage: (...a) => mockTgSend(...a) }));

// bistScoreEngine.scan'i mock'la; toCandles gerçek kalsın (saf yardımcı).
const realEngine = jest.requireActual('../../src/services/bistSignals/bistScoreEngine');
const mockScan = jest.fn();
jest.mock('../../src/services/bistSignals/bistScoreEngine', () => ({
  scan: (...a) => mockScan(...a),
  toCandles: (h) => jest.requireActual('../../src/services/bistSignals/bistScoreEngine').toCandles(h),
}));

// liveDataService.fetchHistoricalData'yı mock'la — sembol→mum dizisi enjekte et.
const mockHist = jest.fn();
jest.mock('../../src/services/liveDataService', () => ({ fetchHistoricalData: (...a) => mockHist(...a) }));

// Store'u in-memory mock'la — diske yazmasın; günlük dedup state'i kontrol edelim.
let mockSent = new Set();
let mockTradingDate = null;
jest.mock('../../src/services/bistAlScanner/bistAlScannerStore', () => ({
  sentSetFor: (d) => (d === mockTradingDate ? new Set(mockSent) : new Set()),
  markSent: (d, syms) => { mockTradingDate = d; for (const s of syms) mockSent.add(s); },
  recordRun: () => {},
}));

const notifier = require('../../src/services/bistAlScanner/bistAlScannerNotifier');

// Bir sinyal nesnesi (engine snap.all üyesi gibi). 2. arg = avgVoteScore (kalite
// ölçütü); confidence düşük kalır (BIST'te consensus-güven ~45'te takılır).
const sig = (symbol, avgVoteScore, over = {}) => ({
  symbol, name: symbol, direction: 'long', avgVoteScore, confidence: 45,
  indicators: { adx: 25, rsi: 60 },   // yeni eleyici kapıları (ADX≥20, RSI<78) GEÇEN varsayılan
  entry: 100, stop: 95, target1: 110, rr1: 2, target2: 120, rr2: 4, precision: 2, ...over,
});

// n mumluk seri üret: close sabit `close`, son hacim `lastVol`, geçmiş hacim `baseVol`.
function candleHist({ close = 100, ema34Closes = null, lastVol = 1000, baseVol = 500, n = 80 }) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const c = ema34Closes ? ema34Closes[i] : close;
    rows.push({ timestamp: (1700000000 + i * 86400) * 1000, open: c, high: c, low: c, close: c, volume: i === n - 1 ? lastVol : baseVol });
  }
  return rows;
}

describe('bistAlScannerNotifier — saf kurucular', () => {
  test('buildSignalBlock — sembol/güç(avgScore)/giriş/SL/TP + trend&hacim satırı', () => {
    const b = notifier.buildSignalBlock({ ...sig('THYAO', 86), gate: { ema34: 98.5 } });
    expect(b).toContain('THYAO');
    expect(b).toContain('Güç');
    expect(b).toContain('86/100');   // avgVoteScore gösterilir
    expect(b).toContain('Giriş');
    expect(b).toContain('TP1');
    expect(b).toContain('EMA34');
  });

  test('buildTelegramMessages — header + footer + sinyaller; çok büyük liste ≤4096 parçalanır', () => {
    const one = notifier.buildTelegramMessages({ tradingDate: '2026-06-29', scanned: 510, signals: [{ ...sig('THYAO', 86), gate: { ema34: 98 } }] });
    expect(one.length).toBe(1);
    expect(one[0]).toContain('BIST AL SİNYALLERİ');
    expect(one[0]).toContain('2026-06-29');
    expect(one[0]).toContain(notifier.DEEP_LINK);

    const big = notifier.buildTelegramMessages({
      tradingDate: '2026-06-29', scanned: 510,
      signals: Array.from({ length: 120 }, (_, i) => ({ ...sig(`SYM${i}`, 81), gate: { ema34: 98 } })),
    });
    expect(big.length).toBeGreaterThan(1);
    for (const m of big) expect(m.length).toBeLessThanOrEqual(4096);
  });

  test('channelId — env yokken boş, varken env değeri', () => {
    const prev = process.env.TELEGRAM_BIST_AL_CHANNEL;
    delete process.env.TELEGRAM_BIST_AL_CHANNEL;
    expect(notifier.channelId()).toBe('');
    process.env.TELEGRAM_BIST_AL_CHANNEL = '-100777';
    expect(notifier.channelId()).toBe('-100777');
    if (prev === undefined) delete process.env.TELEGRAM_BIST_AL_CHANNEL;
    else process.env.TELEGRAM_BIST_AL_CHANNEL = prev;
  });
});

describe('bistAlScannerNotifier.passesGate — trend + hacim kapısı', () => {
  beforeEach(() => mockHist.mockReset());

  test('fiyat EMA34 ÜSTÜ + hacim ortalamanın ÜSTÜ → geçer, gate döner', async () => {
    // Son fiyat yüksek (rally) → close > ema34; son hacim baz hacimden büyük.
    const closes = Array.from({ length: 80 }, (_, i) => 50 + i); // yükselen seri → close > ema34
    mockHist.mockResolvedValue(candleHist({ ema34Closes: closes, lastVol: 2000, baseVol: 500 }));
    const r = await notifier.passesGate(sig('THYAO', 85));
    expect(r).not.toBeNull();
    expect(r.gate.priceAboveEma).toBe(true);
    expect(r.gate.volConfirms).toBe(true);
  });

  test('fiyat EMA34 ALTINDA → elenir (null)', async () => {
    const closes = Array.from({ length: 80 }, (_, i) => 130 - i); // düşen seri → close < ema34
    mockHist.mockResolvedValue(candleHist({ ema34Closes: closes, lastVol: 2000, baseVol: 500 }));
    const r = await notifier.passesGate(sig('SISE', 85));
    expect(r).toBeNull();
  });

  test('hacim ortalamanın ALTINDA → elenir (null)', async () => {
    const closes = Array.from({ length: 80 }, (_, i) => 50 + i);
    mockHist.mockResolvedValue(candleHist({ ema34Closes: closes, lastVol: 100, baseVol: 1000 }));
    const r = await notifier.passesGate(sig('GARAN', 85));
    expect(r).toBeNull();
  });

  test('yetersiz mum → null', async () => {
    mockHist.mockResolvedValue(candleHist({ n: 10 }));
    expect(await notifier.passesGate(sig('XU100', 85))).toBeNull();
  });
});

describe('bistAlScannerNotifier.runAndNotify — skip & dedup yolları', () => {
  const upCloses = Array.from({ length: 80 }, (_, i) => 50 + i); // her gate-aday geçer
  beforeEach(() => {
    mockTgSend.mockClear();
    mockScan.mockReset();
    mockHist.mockReset();
    mockHist.mockResolvedValue(candleHist({ ema34Closes: upCloses, lastVol: 5000, baseVol: 500 }));
    mockSent = new Set();
    mockTradingDate = null;
    delete process.env.TELEGRAM_BIST_AL_CHANNEL;
    delete process.env.BIST_AL_SCANNER_DISABLED;
  });

  test('kanal ayarlı değil → no-channel, Telegram çağrılmaz', async () => {
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 86)] });
    const r = await notifier.runAndNotify();
    expect(r.ok).toBe(true);
    expect(r.skippedReason).toBe('no-channel');
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('avgScore < eşik (80) → aday yok → no-signals', async () => {
    process.env.TELEGRAM_BIST_AL_CHANNEL = '-100777';
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 78), sig('GARAN', 60)] });
    const r = await notifier.runAndNotify();
    expect(r.candidates).toBe(0);
    expect(r.skippedReason).toBe('no-signals');
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('ADX < eşik (20) → gerçek trend yok → elenir, no-signals', async () => {
    process.env.TELEGRAM_BIST_AL_CHANNEL = '-100777';
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 88, { indicators: { adx: 12, rsi: 60 } })] });
    const r = await notifier.runAndNotify();
    expect(r.candidates).toBe(0);
    expect(r.skippedReason).toBe('no-signals');
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('RSI ≥ eşik (78) → aşırı-alım → elenir, no-signals', async () => {
    process.env.TELEGRAM_BIST_AL_CHANNEL = '-100777';
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 88, { indicators: { adx: 30, rsi: 82 } })] });
    const r = await notifier.runAndNotify();
    expect(r.candidates).toBe(0);
    expect(r.skippedReason).toBe('no-signals');
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('kill-switch açık → disabled, Telegram çağrılmaz', async () => {
    process.env.TELEGRAM_BIST_AL_CHANNEL = '-100777';
    process.env.BIST_AL_SCANNER_DISABLED = '1';
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 86)] });
    const r = await notifier.runAndNotify();
    expect(r.skippedReason).toBe('disabled');
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('kanal + nitelikli sinyal → gönderir, notified=true, doğru kanal, markSent', async () => {
    process.env.TELEGRAM_BIST_AL_CHANNEL = '-100777';
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 86), sig('ASELS', 82)] });
    const r = await notifier.runAndNotify();
    expect(r.notified).toBe(true);
    expect(r.qualified).toBe(2);
    expect(r.freshCount).toBe(2);
    expect(mockTgSend).toHaveBeenCalled();
    expect(mockTgSend.mock.calls[0][0]).toBe('-100777');
    // markSent çağrıldı → ikinci tur aynı gün dedup'lar
    const r2 = await notifier.runAndNotify();
    expect(r2.skippedReason).toBe('already-sent');
  });

  test('force=true → günlük dedup atlanır (aynı hisse tekrar gider)', async () => {
    process.env.TELEGRAM_BIST_AL_CHANNEL = '-100777';
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 86)] });
    await notifier.runAndNotify();                 // gönderir + markSent
    mockTgSend.mockClear();
    const r = await notifier.runAndNotify({ force: true });
    expect(r.notified).toBe(true);                 // force → tekrar gönderildi
    expect(mockTgSend).toHaveBeenCalled();
  });
});
