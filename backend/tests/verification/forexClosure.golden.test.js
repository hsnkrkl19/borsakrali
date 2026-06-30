/**
 * GOLDEN TESTS — Forex kapanış doğruluğu (forexSignalTracker.evalOne).
 * Kullanıcı hataları:
 *   BUG2a — oluşan (son/forming) 5m mum sahte TP/SL tetikliyordu → hayalet kapanış + yanlış %.
 *   BUG2b — çıkış SEVİYEYE pinleniyordu → hafta sonu gap'inde % olduğundan küçük görünüyordu.
 *   BUG3  — aynı mumda stop+hedef değince kazanan STOP'a yazılıyordu (kâr eksi görünüyordu).
 * Ayrıca iz-süren (TRAIL) kâr kapanışının POZİTİF kaldığını doğrular (regresyon).
 */
const os = require('os');
const path = require('path');

// Harici bağımlılıkları izole et (Supabase kapalı, disk temp, reset yok).
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.FOREX_RESET;

let mockCandles = [];
jest.mock('../../src/services/forex/forexKlines', () => ({ fetchCandles: jest.fn(async () => mockCandles) }));
jest.mock('../../src/services/forex/forexInstruments', () => ({
  getInstrument: () => ({ id: 'TEST', yahoo: 'TEST', precision: 2, class: 'metal' }),
}));

function longSig(over = {}) {
  return { id: 'TEST', symbol: 'TEST', direction: 'long', precision: 2, tf: '1h', confidence: 80,
    entry: 100, stop: 98, target1: 104, target2: 108, ...over };
}

describe('forexSignalTracker.evalOne — kapanış doğruluğu (BUG2/BUG3)', () => {
  let tracker, fileN = 0;
  beforeEach(() => {
    jest.resetModules();
    process.env.FOREX_OPEN_FILE = path.join(os.tmpdir(), `fx-open-${process.pid}-${fileN++}.json`);
    tracker = require('../../src/services/forex/forexSignalTracker');
    mockCandles = [];
  });

  const openPos = (sig) => tracker.syncPositions([sig]);

  test('oluşan (son) mum kapanışı TETİKLEMEZ; mum kapanınca tetikler (BUG2a)', async () => {
    await openPos(longSig());
    const now = Math.floor(Date.now() / 1000);
    // completed: temas yok · forming(last): TP fitili → DIŞLANMALI
    mockCandles = [
      { time: now + 300, open: 100, high: 100.2, low: 99.8, close: 100 },
      { time: now + 600, open: 100, high: 104.5, low: 99.9, close: 100 },
    ];
    expect(await tracker.checkClosures()).toEqual([]);
    // aynı fitilli mum artık KAPANMIŞ (son değil) → kapanır
    mockCandles = [
      { time: now + 300, open: 100, high: 100.2, low: 99.8, close: 100 },
      { time: now + 600, open: 100, high: 104.5, low: 99.9, close: 104 },
      { time: now + 900, open: 104, high: 104.1, low: 103.9, close: 104 },
    ];
    const cl = await tracker.checkClosures();
    expect(cl).toHaveLength(1);
    expect(cl[0].outcome).toBe('TP1');
    expect(cl[0].pnlPct).toBeCloseTo(4.0, 3);
  });

  test('aynı mumda stop+hedef: kazananı STOP\'a YAZMAZ (açılışa yakın seviye önce) (BUG3)', async () => {
    await openPos(longSig()); // entry100 stop98 tp104
    const now = Math.floor(Date.now() / 1000);
    // completed straddle: low97.5(<=98 slHit) + high104.2(>=104 tpHit); open103 hedefe yakın → TP
    mockCandles = [
      { time: now + 300, open: 103, high: 104.2, low: 97.5, close: 100 },
      { time: now + 600, open: 100, high: 100, low: 100, close: 100 },
    ];
    const cl = await tracker.checkClosures();
    expect(cl).toHaveLength(1);
    expect(cl[0].outcome).toBe('TP1');
    expect(cl[0].pnlPct).toBeGreaterThan(0);
  });

  test('gap ile seviyeyi aşan mum: çıkış SEVİYEYE değil AÇILIŞA pinlenir (BUG2b)', async () => {
    await openPos(longSig()); // entry100 stop98
    const now = Math.floor(Date.now() / 1000);
    mockCandles = [
      { time: now + 300, open: 95, high: 95.5, low: 94, close: 95 }, // gap-down completed
      { time: now + 600, open: 95, high: 95, low: 95, close: 95 },   // forming
    ];
    const cl = await tracker.checkClosures();
    expect(cl).toHaveLength(1);
    expect(cl[0].outcome).toBe('SL');
    expect(cl[0].exit).toBeCloseTo(95, 2);       // seviye 98 değil, gap açılışı 95
    expect(cl[0].pnlPct).toBeCloseTo(-5.0, 3);   // gerçek gap zararı (seviye ile -2% olurdu)
  });

  test('iz-süren stop (kilitli kâr) kapanışı POZİTİF kalır (regresyon)', async () => {
    await openPos(longSig({ stop: 102 })); // stop girişin ÜSTÜNDE → kilitli kâr
    const now = Math.floor(Date.now() / 1000);
    mockCandles = [
      { time: now + 300, open: 103, high: 103.5, low: 101, close: 102 }, // low101<=102 → stop
      { time: now + 600, open: 102, high: 102, low: 102, close: 102 },   // forming
    ];
    const cl = await tracker.checkClosures();
    expect(cl).toHaveLength(1);
    expect(cl[0].outcome).toBe('TRAIL');
    expect(cl[0].pnlPct).toBeCloseTo(2.0, 3);
  });
});
