/**
 * GOLDEN TESTS — Forex/Parite sinyal sistemi (forex/).
 *
 * Kullanıcının bildirdiği regresyonları kilitler:
 *   1) Parite-başına NO: 2 harf ön ek + 2 hane (BT01, AU01), 99 sonrası 3 hane.
 *   2) R-merdiveni stop yönetimi YALNIZ ≥4h; +1R→BE, +1.5R→+0.5R, +2R→+1R.
 *   3) syncPositions: yeni → "new" olay; aynı parite+yön → SESSİZ birleşme
 *      (stop DEĞİŞMEZ, olay YOK); zıt yön → ayrı pozisyon + ters bayrağı.
 *   4) checkClosures İLERİ-YÖNLÜ: stop konduktan ÖNCEKİ mumlar geriye dönük
 *      "sahte stop" tetiklemez (kullanıcı: "düzeltme direk stop oluyor").
 *   5) Notifier saf mesaj kurucular — kanal-tek, "lot" satırı YOK, aynı NO.
 *
 * forexKlines mock'lanır (hermetik); tracker diski tmp'ye yazar.
 */

const os = require('os');
const path = require('path');

process.env.FOREX_OPEN_SIGNALS_FILE = path.join(os.tmpdir(), `forex-open-test-${process.pid}.json`);
delete process.env.FOREX_PUSH_DISABLED;

// Yahoo mum çekimini mock'la (tracker yönetim/kapanışta kullanır).
jest.mock('../../src/services/forex/forexKlines', () => ({ fetchCandles: jest.fn() }));
const forexKlines = require('../../src/services/forex/forexKlines');

const tracker = require('../../src/services/forex/forexSignalTracker');
const notifier = require('../../src/services/forex/forexPushNotifier');

const NOW = () => Math.floor(Date.now() / 1000);

// Motor çıktısına benzer sinyal nesnesi
function sig(over = {}) {
  return {
    id: 'BTCUSD', symbol: 'BTC/USD', direction: 'long', tf: '4h', precision: 2,
    entry: 100, stop: 95, target1: 110, target2: 120, confidence: 75, rr1: 2, rr2: 4,
    mt5: { symbol: 'BTCUSD' }, sizing: { riskUsd: 100, requiredMarginUsd: 50, marginPct: 0.5 },
    ...over,
  };
}

// ── 1) Parite-başına NO ──────────────────────────────────────────────────────
describe('forexSignalTracker.nextCode — parite başına 2 harf + numara', () => {
  beforeEach(() => tracker.__resetForTest());

  test('ön ek + 2 hane, paritelere göre BAĞIMSIZ artar', () => {
    expect(tracker.nextCode('BTCUSD')).toBe('BT01');
    expect(tracker.nextCode('BTCUSD')).toBe('BT02');
    expect(tracker.nextCode('XAUUSD')).toBe('AU01');   // ayrı sayaç
    expect(tracker.nextCode('XAUUSD')).toBe('AU02');
    expect(tracker.nextCode('BTCUSD')).toBe('BT03');
  });

  test('9→10 iki hane, 99→100 üç haneye çıkar', () => {
    let last;
    for (let i = 0; i < 100; i++) last = tracker.nextCode('BTCUSD');
    expect(last).toBe('BT100');           // 100. sinyal → 3 hane
  });
});

// ── 2) R-merdiveni eşikleri + uygunluk ───────────────────────────────────────
describe('forexSignalTracker.ladderLockR — kâr kilidi kademeleri (BE@1.5R)', () => {
  // Eşik 1.5R: managed-backtest BE@1R trend beklentisini düşürdü → 1.5R seçildi.
  test('+1.5R altında dokunma; +1.5R→0(BE); +2R→0.5; +2.5R→1; +3R→1.5', () => {
    expect(tracker.ladderLockR(1.0)).toBeNull();
    expect(tracker.ladderLockR(1.4)).toBeNull();
    expect(tracker.ladderLockR(1.5)).toBe(0);   // BE
    expect(tracker.ladderLockR(1.9)).toBe(0);   // hâlâ BE (2R'ye gelmeden)
    expect(tracker.ladderLockR(2.0)).toBe(0.5);
    expect(tracker.ladderLockR(2.5)).toBe(1);
    expect(tracker.ladderLockR(3.0)).toBe(1.5);
  });
});

describe('forexSignalTracker.isManageable — yönetim yalnız ≥4h', () => {
  test('5m/15m/1h → yönetilmez; 4h/1d → yönetilir', () => {
    expect(tracker.isManageable({ tfs: ['5m', '15m'] })).toBe(false);
    expect(tracker.isManageable({ tfs: ['1h'] })).toBe(false);
    expect(tracker.isManageable({ tfs: ['4h'] })).toBe(true);
    expect(tracker.isManageable({ tfs: ['15m', '1d'] })).toBe(true);
  });
});

// ── 3) syncPositions: birleşme + ters bayrak ─────────────────────────────────
describe('forexSignalTracker.syncPositions — birleşme + ters sinyal', () => {
  beforeEach(() => tracker.__resetForTest());

  test('yeni pozisyon → "new" olay + #BT01', async () => {
    const ev = await tracker.syncPositions([sig()]);
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('new');
    expect(ev[0].position.code).toBe('BT01');
    expect(ev[0].position.units).toBeCloseTo(20);          // 100$ risk / 5 stop mesafesi
    expect(ev[0].reverseOf).toEqual([]);
  });

  test('aynı parite+yön tekrar → SESSİZ birleşme (olay YOK, stop DEĞİŞMEZ)', async () => {
    await tracker.syncPositions([sig()]);
    const ev = await tracker.syncPositions([sig({ tf: '1d', stop: 98, confidence: 90 })]);
    expect(ev).toHaveLength(0);                            // sessiz
    const open = tracker.getOpen();
    expect(open).toHaveLength(1);
    expect(open[0].stop).toBe(95);                         // ilk stop korunur (iz-süren değil)
    expect(open[0].tfs).toEqual(['4h', '1d']);            // TF'ler birleşti
    expect(open[0].confidence).toBe(90);                  // güven yükseldi
  });

  test('zıt yön → AYRI pozisyon + ters sinyal bayrağı (#BT01)', async () => {
    await tracker.syncPositions([sig()]);                  // long BT01
    const ev = await tracker.syncPositions([sig({ direction: 'short', stop: 105, target1: 90, target2: 80 })]);
    expect(ev).toHaveLength(1);
    expect(ev[0].position.code).toBe('BT02');
    expect(ev[0].position.direction).toBe('short');
    expect(ev[0].reverseOf).toContain('BT01');            // ters bayrağı
  });
});

// ── 4) manageOpenPositions: R-merdiveni ratchet ──────────────────────────────
describe('forexSignalTracker.manageOpenPositions — ≥4h kâr kilidi', () => {
  beforeEach(() => { tracker.__resetForTest(); forexKlines.fetchCandles.mockReset(); });

  test('4h long +2.5R lehte → stop +1R (105) kilitlenir; olay döner', async () => {
    await tracker.syncPositions([sig()]);                  // 4h long, entry100 stop95 (R=5)
    const t = tracker.getOpen()[0].issueTimeSec + 60;
    forexKlines.fetchCandles.mockResolvedValue([
      { time: t, open: 100, high: 112.5, low: 100, close: 110 }, // mfe 112.5 → reachedR=2.5 → lock +1R
    ]);
    const ev = await tracker.manageOpenPositions();
    expect(ev).toHaveLength(1);
    expect(ev[0].lockR).toBe(1);
    expect(ev[0].stage).toBe('+1R');
    expect(ev[0].prevStop).toBe(95);
    expect(ev[0].position.stop).toBe(105);                 // entry + 1R
  });

  test('5m/15m pozisyon → yönetilmez (olay YOK)', async () => {
    await tracker.syncPositions([sig({ tf: '5m' })]);
    forexKlines.fetchCandles.mockResolvedValue([{ time: NOW() + 60, open: 100, high: 130, low: 100, close: 130 }]);
    const ev = await tracker.manageOpenPositions();
    expect(ev).toHaveLength(0);
    expect(tracker.getOpen()[0].stop).toBe(95);            // dokunulmadı
  });

  test('kâr +1.5R altında → stop dokunulmaz', async () => {
    await tracker.syncPositions([sig()]);
    const t = tracker.getOpen()[0].issueTimeSec + 60;
    forexKlines.fetchCandles.mockResolvedValue([{ time: t, open: 100, high: 106, low: 100, close: 105 }]); // +1.2R < 1.5R
    const ev = await tracker.manageOpenPositions();
    expect(ev).toHaveLength(0);
    expect(tracker.getOpen()[0].stop).toBe(95);
  });
});

// ── 5) checkClosures: İLERİ-YÖNLÜ (regresyon kilidi) ─────────────────────────
describe('forexSignalTracker.checkClosures — ileri-yönlü stop', () => {
  beforeEach(() => { tracker.__resetForTest(); forexKlines.fetchCandles.mockReset(); });

  test('stop konmadan ÖNCEKİ dip geriye dönük STOP tetiklemez', async () => {
    await tracker.syncPositions([sig()]);
    const p = tracker.getOpen()[0];
    const now = NOW();
    p.issueTimeSec = now - 100;
    p.stopSetSec = now - 10;        // stop 10sn önce 105'e çekildi
    p.stop = 105; p.entry = 100; p.target1 = 110;
    // Mum stopSetSec'ten ÖNCE (now-50) ve 96'ya inmiş → eski stop seviyesine göre
    // tetiklememeli (ileri-yönlü koruma).
    forexKlines.fetchCandles.mockResolvedValue([{ time: now - 50, open: 100, high: 101, low: 96, close: 100 }]);
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(0);
    expect(tracker.getOpen()).toHaveLength(1);   // hâlâ açık
  });

  test('stop konduktan SONRA stop vurulursa, stop≥giriş → İZ-SÜREN (TRAIL) kârla kapanır', async () => {
    await tracker.syncPositions([sig()]);
    const p = tracker.getOpen()[0];
    const now = NOW();
    p.issueTimeSec = now - 100;
    p.stopSetSec = now - 10;
    p.stop = 105; p.entry = 100; p.target1 = 110;
    forexKlines.fetchCandles.mockResolvedValue([{ time: now - 5, open: 106, high: 106, low: 104, close: 105 }]);
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(1);
    expect(ev[0].code).toBe('BT01');
    expect(ev[0].outcome).toBe('TRAIL');         // stop(105) ≥ giriş(100)
    expect(ev[0].exit).toBe(105);
    expect(ev[0].pnlPct).toBe(5);
  });

  test('hedefe ulaşınca TP1 (aynı NO)', async () => {
    await tracker.syncPositions([sig()]);
    const t = tracker.getOpen()[0].issueTimeSec + 60;
    forexKlines.fetchCandles.mockResolvedValue([{ time: t, open: 100, high: 111, low: 108, close: 110 }]);
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(1);
    expect(ev[0].outcome).toBe('TP1');
    expect(ev[0].code).toBe('BT01');
    expect(ev[0].exit).toBe(110);
    expect(ev[0].pnlPct).toBe(10);
  });
});

// ── 6) Notifier saf kurucular — kanal-tek, "lot" yok, aynı NO ────────────────
describe('forexPushNotifier — saf mesaj kurucular', () => {
  const pos = {
    code: 'BT01', symbol: 'BTC/USD', direction: 'long', precision: 2,
    entry: 100, stop: 95, target1: 110, target2: 120, rr1: 2, rr2: 4, confidence: 78,
    tfs: ['4h', '1d'], marginUsd: 50, marginPct: 0.5, units: 20, mt5Symbol: 'BTCUSD',
  };

  test('buildNew — #NO, güven, MT5; "lot" satırı YOK', () => {
    const m = notifier.buildNew(pos, []);
    expect(m).toContain('#BT01');
    expect(m).toContain('BTC/USD');
    expect(m).toContain('78/100');
    expect(m).toContain('LONG');
    expect(m).toMatch(/MT5/);
    expect(m).not.toMatch(/lot/i);              // lot satırı tamamen kaldırıldı
  });

  test('buildNew — ters sinyal bayrağı zıt pozisyon NO ile', () => {
    const m = notifier.buildNew({ ...pos, direction: 'short' }, ['BT01']);
    expect(m).toMatch(/TERS SİNYAL/);
    expect(m).toContain('#BT01');
  });

  test('buildManage — aynı NO + kademe metni (BE / +0.5R)', () => {
    const be = notifier.buildManage({ position: { ...pos, stop: 100 }, prevStop: 95, lockR: 0, reachedR: 1.5 });
    expect(be).toContain('#BT01');
    expect(be).toMatch(/GİRİŞE/);               // BE
    const half = notifier.buildManage({ position: { ...pos, stop: 102.5 }, prevStop: 100, lockR: 0.5, reachedR: 2.0 });
    expect(half).toContain('+0.5R kilitlendi');
  });
});
