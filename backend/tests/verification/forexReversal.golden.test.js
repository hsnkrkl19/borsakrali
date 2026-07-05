/**
 * GOLDEN TESTS — Forex carry/reversal-exit + akıllı trailing (FAZ 1+2).
 * Doğrulanan davranışlar:
 *   - carry KAPALI (varsayılan) → eski davranış (TP1 kapatır). [forexClosure.golden.test.js kapsar]
 *   - carry AÇIK + reversal kapalı → TP1 KAPATMAZ (target2 hard-cap kapatır). [TP-seviye anahtarı]
 *   - carry AÇIK + reversal açık + 1m veri BAYAT → FAIL-SAFE: klasik TP1'e düşer.
 *   - dropClosed → pozisyonu düşürür + cooldown (köprü desync geri-kanalı).
 * Az mumlu senaryolar: advanceSmartTrail (<15 bar) ve detectReversal (<60 bar) sessiz
 * devre-dışı → TP-seviye mantığı izole test edilir.
 */
const os = require('os');
const path = require('path');

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.FOREX_RESET;

let mock5m = [], mock1m = [];
jest.mock('../../src/services/forex/forexKlines', () => ({
  fetchCandles: jest.fn(async (_yahoo, tf) => (tf === '1m' ? mock1m : mock5m)),
}));
jest.mock('../../src/services/forex/forexInstruments', () => ({
  getInstrument: () => ({ id: 'TEST', yahoo: 'TEST', precision: 2, class: 'metal' }),
}));

function longSig(over = {}) {
  return { id: 'TEST', symbol: 'TEST', direction: 'long', precision: 2, tf: '1h', confidence: 80,
    entry: 100, stop: 98, target1: 104, target2: 108, ...over };
}

const CARRY_ENVS = ['FOREX_CARRY_TO_REVERSAL', 'FOREX_REVERSAL_DISABLED', 'FOREX_SMART_TRAIL', 'FOREX_REVERSAL_TF5M_GUARD'];

describe('forexSignalTracker — carry/reversal-exit (FAZ 1+2)', () => {
  let tracker, fileN = 0;
  beforeEach(() => {
    jest.resetModules();
    CARRY_ENVS.forEach(k => delete process.env[k]);
    process.env.FOREX_OPEN_FILE = path.join(os.tmpdir(), `fx-rev-${process.pid}-${fileN++}.json`);
    tracker = require('../../src/services/forex/forexSignalTracker');
    mock5m = []; mock1m = [];
  });
  afterEach(() => { CARRY_ENVS.forEach(k => delete process.env[k]); });

  const openPos = (sig) => tracker.syncPositions([sig]);

  test('carry AÇIK + reversal kapalı: TP1 (104) KAPATMAZ, sadece TP2 (108) kapatır', async () => {
    process.env.FOREX_CARRY_TO_REVERSAL = '1';
    process.env.FOREX_REVERSAL_DISABLED = '1'; // reversal exit'i kapat → saf TP-seviye testi
    await openPos(longSig());
    const now = Math.floor(Date.now() / 1000);
    // target1'i (104) aşan ama target2'yi (108) aşmayan mum → carry: KAPANMAZ
    mock5m = [
      { time: now + 300, open: 100, high: 104.5, low: 99, close: 104 },
      { time: now + 600, open: 104, high: 104, low: 104, close: 104 }, // forming
    ];
    expect(await tracker.checkClosures()).toEqual([]);
    // şimdi target2'yi (108) de aşar → TP2 kapanışı
    mock5m = [
      { time: now + 300, open: 100, high: 104.5, low: 99, close: 104 },
      { time: now + 600, open: 104, high: 108.5, low: 104, close: 108 },
      { time: now + 900, open: 108, high: 108, low: 108, close: 108 }, // forming
    ];
    const cl = await tracker.checkClosures();
    expect(cl).toHaveLength(1);
    expect(cl[0].outcome).toBe('TP2');
    expect(cl[0].pnlPct).toBeCloseTo(8.0, 3);
  });

  test('carry AÇIK + reversal açık + 1m veri BAYAT (yetersiz mum) → FAIL-SAFE klasik TP1', async () => {
    process.env.FOREX_CARRY_TO_REVERSAL = '1'; // reversal açık (DISABLED yok)
    await openPos(longSig());
    const now = Math.floor(Date.now() / 1000);
    mock5m = [
      { time: now + 300, open: 100, high: 104.5, low: 99, close: 104 }, // target1'i aşar
      { time: now + 600, open: 104, high: 104, low: 104, close: 104 },  // forming
    ];
    mock1m = [{ time: now, open: 100, high: 100, low: 100, close: 100 }]; // <60 mum → detectReversal stale
    const cl = await tracker.checkClosures();
    expect(cl).toHaveLength(1);
    expect(cl[0].outcome).toBe('TP1'); // bayat 1m → carry askıya, klasik TP1 kapatır (korumasız taşımaz)
    expect(cl[0].pnlPct).toBeCloseTo(4.0, 3);
  });

  test('dropClosed → pozisyonu düşürür + cooldown (köprü kapatma-teyit geri-kanalı)', async () => {
    await openPos(longSig());
    expect(tracker.getOpen()).toHaveLength(1);
    const code = tracker.getOpen()[0].code;
    const r = await tracker.dropClosed(code, 'test');
    expect(r.dropped).toBe(true);
    expect(r.instrumentId).toBe('TEST');
    expect(tracker.getOpen()).toHaveLength(0);
    // cooldown yüzünden aynı enstrüman+yön hemen yeniden AÇILMAZ
    const ev = await openPos(longSig());
    expect(ev).toEqual([]);
    // bilinmeyen kod → dropped:false
    expect((await tracker.dropClosed('YOK999', 'test')).dropped).toBe(false);
  });
});
