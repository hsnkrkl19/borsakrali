/**
 * GOLDEN TESTS — YENİ ROBOT · proSignalTracker (forexSignalTracker klonu).
 *
 *   1) nextCode — enstrüman ön ekleri YB(BTC)/YA(XAU)/YS(SPX500)/YE(EURUSD);
 *      parite başına bağımsız sayaç; 99→100'de 3 haneye genişler.
 *   2) syncPositions — yeni BTC long → #YB01; aynı parite+yön tekrar → SESSİZ
 *      birleşme (tek açık, yeni kod YOK); XAU long → #YA01; zıt yön → AYRI
 *      pozisyon + ters bayrağı (forex'le birebir aynı davranış).
 *   3) manageOpenPositions — ≥4h, +2.5R lehte → stop +1R kilitlenir.
 *   4) checkClosures — hedefe ulaşınca TP1 (ileri-yönlü, mock 5m mum).
 *
 * forexKlines mock'lanır (hermetik); tracker diski tmp'ye yazar.
 */

const os = require('os');
const path = require('path');

process.env.PRO_OPEN_SIGNALS_FILE = path.join(os.tmpdir(), `pro-open-test-${process.pid}.json`);

jest.mock('../../src/services/forex/forexKlines', () => ({ fetchCandles: jest.fn() }));
const forexKlines = require('../../src/services/forex/forexKlines');

const tracker = require('../../src/services/proSignals/proSignalTracker');

const NOW = () => Math.floor(Date.now() / 1000);

function sig(over = {}) {
  return {
    id: 'BTCUSD', symbol: 'BTC/USD', direction: 'long', tf: '4h', precision: 2,
    entry: 100, stop: 95, target1: 110, target2: 120, confidence: 75, rr1: 2, rr2: 4,
    mt5: { symbol: 'BTCUSD' }, sizing: { riskUsd: 100, requiredMarginUsd: 50, marginPct: 0.5 },
    ...over,
  };
}

describe('proSignalTracker.nextCode — enstrüman ön ekleri + numara', () => {
  beforeEach(() => tracker.__resetForTest());

  test('YB/YA/YS/YE ön ekleri, paritelere göre BAĞIMSIZ artar', () => {
    expect(tracker.nextCode('BTCUSD')).toBe('YB01');
    expect(tracker.nextCode('BTCUSD')).toBe('YB02');
    expect(tracker.nextCode('XAUUSD')).toBe('YA01');   // ayrı sayaç
    expect(tracker.nextCode('SPX500')).toBe('YS01');
    expect(tracker.nextCode('EURUSD')).toBe('YE01');
    expect(tracker.nextCode('BTCUSD')).toBe('YB03');
  });

  test('99→100 üç haneye genişler', () => {
    let last;
    for (let i = 0; i < 100; i++) last = tracker.nextCode('BTCUSD');
    expect(last).toBe('YB100');
  });
});

describe('proSignalTracker.syncPositions — birleşme + ters sinyal', () => {
  beforeEach(() => tracker.__resetForTest());

  test('yeni BTC long → "new" olay + #YB01 + units', async () => {
    const ev = await tracker.syncPositions([sig()]);
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('new');
    expect(ev[0].position.code).toBe('YB01');
    expect(ev[0].position.units).toBeCloseTo(20);     // 100$ risk / 5 stop mesafesi
    expect(ev[0].reverseOf).toEqual([]);
  });

  test('aynı parite+yön tekrar → SESSİZ birleşme (olay YOK, stop DEĞİŞMEZ, TF birleşir)', async () => {
    await tracker.syncPositions([sig()]);
    const ev = await tracker.syncPositions([sig({ tf: '1d', stop: 98, confidence: 90 })]);
    expect(ev).toHaveLength(0);                        // sessiz
    const open = tracker.getOpen();
    expect(open).toHaveLength(1);
    expect(open[0].stop).toBe(95);                     // ilk stop korunur
    expect(open[0].tfs).toEqual(['4h', '1d']);        // TF'ler birleşti
    expect(open[0].confidence).toBe(90);              // güven yükseldi
  });

  test('XAU long → AYRI pozisyon #YA01', async () => {
    await tracker.syncPositions([sig()]);                                   // BTC YB01
    const ev = await tracker.syncPositions([sig({ id: 'XAUUSD', symbol: 'XAU/USD' })]);
    expect(ev).toHaveLength(1);
    expect(ev[0].position.code).toBe('YA01');
    expect(tracker.getOpen()).toHaveLength(2);
  });

  test('zıt yön → AYRI pozisyon + ters sinyal bayrağı (#YB01)', async () => {
    await tracker.syncPositions([sig()]);                                   // long YB01
    const ev = await tracker.syncPositions([sig({ direction: 'short', stop: 105, target1: 90, target2: 80 })]);
    expect(ev).toHaveLength(1);
    expect(ev[0].position.code).toBe('YB02');
    expect(ev[0].position.direction).toBe('short');
    expect(ev[0].reverseOf).toContain('YB01');         // ters bayrağı korunur
  });
});

describe('proSignalTracker.ladderLockR / isManageable — forex ile birebir', () => {
  test('ladderLockR: <1.5 null; 1.5→0(BE); 2→0.5; 2.5→1', () => {
    expect(tracker.ladderLockR(1.4)).toBeNull();
    expect(tracker.ladderLockR(1.5)).toBe(0);
    expect(tracker.ladderLockR(2.0)).toBe(0.5);
    expect(tracker.ladderLockR(2.5)).toBe(1);
  });
  test('isManageable: yalnız ≥4h', () => {
    expect(tracker.isManageable({ tfs: ['5m', '1h'] })).toBe(false);
    expect(tracker.isManageable({ tfs: ['4h'] })).toBe(true);
    expect(tracker.isManageable({ tfs: ['15m', '1d'] })).toBe(true);
  });
});

describe('proSignalTracker.manageOpenPositions — ≥4h R-merdiveni', () => {
  beforeEach(() => { tracker.__resetForTest(); forexKlines.fetchCandles.mockReset(); });

  test('4h long +2.5R lehte → stop +1R (105) kilitlenir', async () => {
    await tracker.syncPositions([sig()]);              // 4h long entry100 stop95 (R=5)
    const t = tracker.getOpen()[0].issueTimeSec + 60;
    forexKlines.fetchCandles.mockResolvedValue([
      { time: t, open: 100, high: 112.5, low: 100, close: 110 }, // mfe 112.5 → reachedR 2.5
    ]);
    const ev = await tracker.manageOpenPositions();
    expect(ev).toHaveLength(1);
    expect(ev[0].lockR).toBe(1);
    expect(ev[0].stage).toBe('+1R');
    expect(ev[0].prevStop).toBe(95);
    expect(ev[0].position.stop).toBe(105);            // entry + 1R
  });

  test('5m/15m pozisyon → yönetilmez (olay YOK)', async () => {
    await tracker.syncPositions([sig({ tf: '5m' })]);
    forexKlines.fetchCandles.mockResolvedValue([{ time: NOW() + 60, open: 100, high: 130, low: 100, close: 130 }]);
    const ev = await tracker.manageOpenPositions();
    expect(ev).toHaveLength(0);
    expect(tracker.getOpen()[0].stop).toBe(95);
  });
});

describe('proSignalTracker.checkClosures — ileri-yönlü kapanış', () => {
  beforeEach(() => { tracker.__resetForTest(); forexKlines.fetchCandles.mockReset(); });

  test('hedefe ulaşınca TP1 (aynı NO, mock 5m)', async () => {
    await tracker.syncPositions([sig()]);
    const t = tracker.getOpen()[0].issueTimeSec + 60;
    forexKlines.fetchCandles.mockResolvedValue([{ time: t, open: 100, high: 111, low: 108, close: 110 }]);
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(1);
    expect(ev[0].outcome).toBe('TP1');
    expect(ev[0].code).toBe('YB01');
    expect(ev[0].exit).toBe(110);
    expect(ev[0].pnlPct).toBe(10);
    expect(tracker.getOpen()).toHaveLength(0);        // kapandı
  });

  test('stop konmadan ÖNCEKİ dip geriye dönük STOP tetiklemez', async () => {
    await tracker.syncPositions([sig()]);
    const p = tracker.getOpen()[0];
    const now = NOW();
    p.issueTimeSec = now - 100;
    p.stopSetSec = now - 10;       // stop 10sn önce 105'e çekildi
    p.stop = 105; p.entry = 100; p.target1 = 110;
    // Mum stopSetSec'ten ÖNCE (now-50), 96'ya inmiş → ileri-yönlü koruma → tetiklemez.
    forexKlines.fetchCandles.mockResolvedValue([{ time: now - 50, open: 100, high: 101, low: 96, close: 100 }]);
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(0);
    expect(tracker.getOpen()).toHaveLength(1);
  });
});
