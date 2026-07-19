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

// Tracker artık YALNIZ cutover (adoptLegacy) için okunur — no-op mock (getOpen boş).
jest.mock('../../src/services/bistAlScanner/bistAlScannerTracker', () => ({
  getOpen: async () => [],
  registerSignals: async () => [],
  checkClosures: async () => [],
  commitClosures: () => ({ committed: 0 }),
}));

// Portföy botunu mock'la → runAndNotify'ın AL/yönet delegasyonunu izole test et
// (para matematiği + held-only invaryantı bistPortfolio.golden.test.js'te).
const mockOpenBuys = jest.fn(async () => ({ openedCount: 0, opened: [], skipped: [], telegramSent: 0, appSent: 0 }));
const mockManage = jest.fn(async () => ({ closed: 0, errors: 0 }));
const mockAdopt = jest.fn(() => ({ adopted: 0 }));
const mockDaily = jest.fn(async () => ({ sent: 0 }));
const mockSnapshot = jest.fn(() => ({ kpis: { equity: 100000 }, open: [], closed: [] }));
jest.mock('../../src/services/bistPortfolio/alPortfolioBot', () => ({
  openBuys: (...a) => mockOpenBuys(...a),
  manageAndReport: (...a) => mockManage(...a),
  adoptLegacy: (...a) => mockAdopt(...a),
  pushDailySummary: (...a) => mockDaily(...a),
  getSnapshot: (...a) => mockSnapshot(...a),
}));

// Likidite tabanını test için düşür (mum hacimleri küçük) — modül YÜKLENMEDEN önce.
process.env.BIST_AL_MIN_TURNOVER = '1000';
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

  test('düşük ciro (likidite tabanı altı) → elenir (null)', async () => {
    // Yükselen fiyat + hacim teyidi var AMA baseVol=1 → ciro≈130 TL « 1000 eşiği.
    const closes = Array.from({ length: 80 }, (_, i) => 50 + i);
    mockHist.mockResolvedValue(candleHist({ ema34Closes: closes, lastVol: 2, baseVol: 1 }));
    const r = await notifier.passesGate(sig('TINY', 85));
    expect(r).toBeNull();
  });

  test('yeterli ciro → gate.turnoverM döner', async () => {
    const closes = Array.from({ length: 80 }, (_, i) => 50 + i);
    mockHist.mockResolvedValue(candleHist({ ema34Closes: closes, lastVol: 2000, baseVol: 500 }));
    const r = await notifier.passesGate(sig('THYAO', 85));
    expect(r).not.toBeNull();
    expect(r.gate.liquid).toBe(true);
    expect(r.gate.turnoverM).toBeGreaterThan(0);
  });
});

describe('bistAlScannerNotifier.runAndNotify — aday seçimi + portföy delegasyonu', () => {
  const upCloses = Array.from({ length: 80 }, (_, i) => 50 + i); // her gate-aday geçer
  beforeEach(() => {
    mockScan.mockReset();
    mockHist.mockReset();
    mockHist.mockResolvedValue(candleHist({ ema34Closes: upCloses, lastVol: 5000, baseVol: 500 }));
    mockOpenBuys.mockClear(); mockManage.mockClear(); mockAdopt.mockClear();
  });

  test('avgScore < eşik (80) → aday yok → openBuys boş listeyle çağrılır', async () => {
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 78), sig('GARAN', 60)] });
    const r = await notifier.runAndNotify();
    expect(r.ok).toBe(true);
    expect(r.qualified).toBe(0);
    expect(mockOpenBuys).toHaveBeenCalledTimes(1);
    expect(mockOpenBuys.mock.calls[0][0]).toEqual([]);   // nitelikli aday yok
  });

  test('ADX < eşik (20) → gerçek trend yok → elenir', async () => {
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 88, { indicators: { adx: 12, rsi: 60 } })] });
    const r = await notifier.runAndNotify();
    expect(r.qualified).toBe(0);
  });

  test('RSI ≥ eşik (78) → aşırı-alım → elenir', async () => {
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 88, { indicators: { adx: 30, rsi: 82 } })] });
    const r = await notifier.runAndNotify();
    expect(r.qualified).toBe(0);
  });

  test('nitelikli adaylar → openBuys adaylarla + manageAndReport nitelik seti ile çağrılır', async () => {
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 86), sig('ASELS', 82)] });
    mockOpenBuys.mockResolvedValueOnce({ openedCount: 2, opened: [{ symbol: 'THYAO' }, { symbol: 'ASELS' }], skipped: [], telegramSent: 1 });
    mockManage.mockResolvedValueOnce({ closed: 1, errors: 0 });
    const r = await notifier.runAndNotify();
    expect(r.qualified).toBe(2);
    expect(r.opened).toBe(2);
    expect(r.closed).toBe(1);
    // openBuys nitelikli adaylarla (THYAO+ASELS) çağrıldı
    const passed = mockOpenBuys.mock.calls[0][0].map(s => s.symbol).sort();
    expect(passed).toEqual(['ASELS', 'THYAO']);
    // manageAndReport nitelik SEMBOL SETİ ile çağrıldı (held-only SAT için)
    const qset = mockManage.mock.calls[0][0];
    expect(qset instanceof Set).toBe(true);
    expect(qset.has('THYAO')).toBe(true);
  });

  test('cutover: adoptLegacy bir kez çağrılır', async () => {
    mockScan.mockResolvedValue({ scanned: 510, all: [sig('THYAO', 86)] });
    await notifier.runAndNotify();
    expect(mockAdopt).toHaveBeenCalledTimes(1);
  });
});

// ── Kapanış (TP/SL sonucu) bildirimi ─────────────────────────────────────────
describe('bistAlScannerNotifier — kapanış mesajı + push', () => {
  const ev = (over = {}) => ({ symbol: 'THYAO', outcome: 'TP1', entry: 100, exit: 110, exitDate: '2026-07-10', pnlPct: 10, score: 86, precision: 2, ...over });

  test('buildClosureBlock — TP/STOP/SÜRE başlıkları + sembol + sonuç %', () => {
    expect(notifier.buildClosureBlock(ev())).toContain('TP OLDU');
    expect(notifier.buildClosureBlock(ev())).toContain('THYAO');
    expect(notifier.buildClosureBlock(ev())).toContain('+10%');
    const sl = notifier.buildClosureBlock(ev({ outcome: 'SL', exit: 95, pnlPct: -5 }));
    expect(sl).toContain('STOP OLDU');
    expect(sl).toContain('-5%');
    expect(notifier.buildClosureBlock(ev({ outcome: 'EXPIRE' }))).toContain('SÜRE DOLDU');
  });

  test('pushClosures — kanal yoksa gönderim yok', async () => {
    mockTgSend.mockClear();
    delete process.env.TELEGRAM_BIST_AL_CHANNEL;
    const r = await notifier.pushClosures([ev()]);
    expect(r.sent).toBe(0);
    expect(r.chatSet).toBe(false);
    expect(mockTgSend).not.toHaveBeenCalled();
  });

  test('pushClosures — kill-switch açık → gönderim yok (takip yine tutulur)', async () => {
    mockTgSend.mockClear();
    process.env.TELEGRAM_BIST_AL_CHANNEL = '-100777';
    process.env.BIST_AL_SCANNER_DISABLED = '1';
    const r = await notifier.pushClosures([ev()]);
    expect(r.disabled).toBe(true);
    expect(mockTgSend).not.toHaveBeenCalled();
    delete process.env.BIST_AL_SCANNER_DISABLED;
  });

  test('pushClosures — kanal + olay → doğru kanala gönderilir', async () => {
    mockTgSend.mockClear();
    process.env.TELEGRAM_BIST_AL_CHANNEL = '-100777';
    delete process.env.BIST_AL_SCANNER_DISABLED;
    const r = await notifier.pushClosures([ev(), ev({ symbol: 'ASELS', outcome: 'SL', exit: 95, pnlPct: -5 })]);
    expect(r.sent).toBe(2);
    expect(mockTgSend.mock.calls[0][0]).toBe('-100777');
  });

  test('checkAndPushClosures — portföy yönetimine delege (STOP/TP; strateji SAT yok)', async () => {
    mockManage.mockClear();
    mockManage.mockResolvedValueOnce({ closed: 0, errors: 0 });
    const r = await notifier.checkAndPushClosures();
    expect(r.closed).toBe(0);
    // qualifiedSymbols VERİLMEZ (undefined) → tick modu: yalnız STOP/TP/timeout
    expect(mockManage).toHaveBeenCalledWith(undefined);
  });

  test('checkAndPushClosures — kapanış varsa closed sayısını döner', async () => {
    mockManage.mockClear();
    mockManage.mockResolvedValueOnce({ closed: 2, errors: 0 });
    const r = await notifier.checkAndPushClosures();
    expect(r.closed).toBe(2);
  });
});
