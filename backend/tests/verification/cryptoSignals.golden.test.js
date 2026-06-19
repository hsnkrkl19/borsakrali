/**
 * GOLDEN TESTS — Kripto SÜREKLİ kanal yayını (4 faz yerine sürekli + dedup).
 *
 *   1) cryptoSignalTracker — strateji başına NO (KS/KL/KX), dedup (açık olan tekrar
 *      göndermez), maxNew kapağı, ileri-yönlü TP1 kapanış.
 *   2) cryptoChannelNotifier — flatten (strateji başına top N, geçersiz seviye elenir),
 *      buildNew (#NO + sembol + yön, "lot" yok), buildClosure (TP/SL).
 *
 * cryptoKlines mock'lanır; tracker diski tmp'ye yazar.
 */

const os = require('os');
const path = require('path');

process.env.CRYPTO_SIGNALS_FILE = path.join(os.tmpdir(), `crypto-signals-test-${process.pid}.json`);
delete process.env.CRYPTO_PUSH_DISABLED;

jest.mock('../../src/services/cryptoKlines', () => ({ fetchCandles: jest.fn() }));
const cryptoKlines = require('../../src/services/cryptoKlines');

const tracker = require('../../src/services/cryptoSignalTracker');
const notifier = require('../../src/services/cryptoChannelNotifier');

const sig = (over = {}) => ({
  symbol: 'BTC', name: 'Bitcoin', strategy: 'futures_long', direction: 'long',
  entry: 100, stop: 95, target1: 110, target2: 120, totalScore: 8, historicalWinRate: 60, ...over,
});

describe('cryptoSignalTracker', () => {
  beforeEach(() => { tracker.__resetForTest(); cryptoKlines.fetchCandles.mockReset(); });

  test('nextCode — strateji başına ön ek (KS/KL/KX) + bağımsız sayaç', () => {
    expect(tracker.nextCode('spot_long')).toBe('KS01');
    expect(tracker.nextCode('futures_long')).toBe('KL01');
    expect(tracker.nextCode('futures_short')).toBe('KX01');
    expect(tracker.nextCode('spot_long')).toBe('KS02');
  });

  test('syncSignals — yeni → #KL01; AYNI (symbol:strategy) tekrar → sinyal YOK (dedup)', async () => {
    const e1 = await tracker.syncSignals([sig()]);
    expect(e1).toHaveLength(1);
    expect(e1[0].position.code).toBe('KL01');
    const e2 = await tracker.syncSignals([sig()]);             // aynı BTC:futures_long
    expect(e2).toHaveLength(0);
    // aynı sembol FARKLI strateji → ayrı sinyal
    const e3 = await tracker.syncSignals([sig({ strategy: 'spot_long' })]);
    expect(e3).toHaveLength(1);
    expect(e3[0].position.code).toBe('KS01');
  });

  test('maxNew kapağı — bir turda en fazla N yeni', async () => {
    const many = Array.from({ length: 10 }, (_, i) => sig({ symbol: `C${i}` }));
    const ev = await tracker.syncSignals(many, { maxNew: 4 });
    expect(ev).toHaveLength(4);
  });

  test('checkClosures — hedefe ulaşınca TP1 (ileri-yönlü, mock 1h)', async () => {
    await tracker.syncSignals([sig()]);
    const t = tracker.getOpen()[0].issueTimeSec + 3600;
    cryptoKlines.fetchCandles.mockResolvedValue([{ time: t, open: 100, high: 111, low: 108, close: 110 }]);
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(1);
    expect(ev[0].outcome).toBe('TP1');
    expect(ev[0].code).toBe('KL01');
    expect(ev[0].pnlPct).toBe(10);
  });
});

describe('cryptoChannelNotifier', () => {
  test('flatten — YALNIZ forex kriptoları (BTC/ETH/XRP/SOL); diğerleri + geçersiz elenir', () => {
    const result = {
      spot_long: { signals: [{ symbol: 'BTC', entry: 100, stop: 95, target1: 110, totalScore: 9 }, { symbol: 'ETH', entry: 50, stop: 48, target1: 55, totalScore: 8 }] },
      futures_long: { signals: [{ symbol: 'DOGE', entry: 0.1, stop: 0.09, target1: 0.12, totalScore: 9 }] }, // forex'te YOK → elenir
      futures_short: { signals: [{ symbol: 'XRP', entry: 2, stop: 2.1, target1: 1.8, totalScore: 7 }, { symbol: 'BAD', entry: 0, stop: 0, target1: 0 }] },
    };
    const flat = notifier.flatten(result);
    expect(flat.map(s => s.symbol).sort()).toEqual(['BTC', 'ETH', 'XRP']); // DOGE (forex değil) + BAD (geçersiz) elendi
    expect(flat.find(s => s.symbol === 'XRP').direction).toBe('short');
  });

  test('buildNew — #NO, sembol/USDT, yön, seviyeler; "lot" YOK', () => {
    const m = notifier.buildNew({ code: 'KL01', symbol: 'btc', strategy: 'futures_long', direction: 'long', entry: 105000, stop: 102000, target1: 112000, totalScore: 8, historicalWinRate: 60 });
    expect(m).toContain('#KL01');
    expect(m).toContain('BTC/USDT');
    expect(m).toContain('LONG');
    expect(m).toContain('FUTURES LONG');
    expect(m).not.toMatch(/\blot\b/i);
  });

  test('buildClosure — TP başlık + sonuç %', () => {
    const m = notifier.buildClosure({ code: 'KX01', symbol: 'xrp', direction: 'short', outcome: 'TP1', entry: 2, exit: 1.8, pnlPct: 10 });
    expect(m).toContain('#KX01');
    expect(m).toContain('TP OLDU');
    expect(m).toContain('+10%');
  });
});
