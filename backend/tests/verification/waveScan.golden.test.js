/**
 * GOLDEN TESTS — Dalga Taraması (Elliott + SNR + Mum + Fraktal), BTC+Altın.
 *
 *   1) elliott — buildZigzag alternasyon + uç; detectSetup W2→3 / W4→5 tespiti
 *      ve bant dışı/yapı-kırık reddi.
 *   2) waveScanEngine saf yardımcılar — candleConfirm / snrConfirm / buildLevels
 *      / trendOk.
 *   3) waveScanTracker — W+ön ek numara, dedup (aynı kurulum tek sinyal),
 *      ileri-yönlü kapanış (mock 1h mum).
 *   4) waveScanNotifier — saf mesaj kurucular (özel-tarama etiketi + notlar).
 *
 * forexKlines mock'lanır; tracker diski tmp'ye yazar.
 */

const os = require('os');
const path = require('path');

process.env.WAVESCAN_FILE = path.join(os.tmpdir(), `wave-scan-test-${process.pid}.json`);
delete process.env.WAVESCAN_PUSH_DISABLED;

jest.mock('../../src/services/forex/forexKlines', () => ({ fetchCandles: jest.fn() }));
const forexKlines = require('../../src/services/forex/forexKlines');

const elliott = require('../../src/services/waveScan/elliott');
const engine = require('../../src/services/waveScan/waveScanEngine');
const tracker = require('../../src/services/waveScan/waveScanTracker');
const notifier = require('../../src/services/waveScan/waveScanNotifier');

// Kapanış yolu (open=close → temiz fraktal; TR = |high−prevClose| ile gerçekçi ATR)
function mk(start, legs) {
  const closes = [start];
  let cur = start;
  for (const lg of legs) { for (let i = 1; i <= lg.n; i++) closes.push(+(cur + (lg.to - cur) * i / lg.n).toFixed(3)); cur = lg.to; }
  const t0 = 1700000000;
  return closes.map((c, i) => ({ time: t0 + i * 3600, open: c, high: +(c * 1.002).toFixed(3), low: +(c * 0.998).toFixed(3), close: c, volume: 1000 }));
}

// ── 1) elliott ───────────────────────────────────────────────────────────────
describe('elliott.buildZigzag', () => {
  test('H/L alternan + ardışık aynı tipte uç korunur', () => {
    const c = mk(100, [{ to: 100, n: 34 }, { to: 90, n: 6 }, { to: 120, n: 8 }, { to: 102, n: 7 }, { to: 104, n: 5 }]);
    const zz = elliott.buildZigzag(c);
    expect(zz.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < zz.length; i++) expect(zz[i].type).not.toBe(zz[i - 1].type); // alternasyon
    const last3 = zz.slice(-3);
    expect(last3.map(p => p.type)).toEqual(['L', 'H', 'L']);
    expect(last3[0].price).toBeCloseTo(90, 0);
    expect(last3[1].price).toBeCloseTo(120, 0);
  });
});

describe('elliott.detectSetup', () => {
  test('Dalga 2 → 3 (long): W1 %60 düzeltme → W2W3/long', () => {
    const c = mk(100, [{ to: 100, n: 34 }, { to: 90, n: 6 }, { to: 120, n: 8 }, { to: 102, n: 7 }, { to: 104, n: 5 }]);
    const a = require('../../src/services/forex/indicators').atr(c, 14);
    const su = elliott.detectSetup(c, a);
    expect(su).not.toBeNull();
    expect(su.kind).toBe('W2W3');
    expect(su.direction).toBe('long');
    expect(su.retr).toBeGreaterThanOrEqual(0.382);
    expect(su.retr).toBeLessThanOrEqual(0.886);
    expect(su.correctivePrice).toBeCloseTo(102, 0);
  });

  test('Dalga 4 → 5 (long): 5 nokta, çakışmasız, r4≈0.5 → W4W5/long', () => {
    const c = mk(100, [{ to: 100, n: 34 }, { to: 90, n: 6 }, { to: 110, n: 7 }, { to: 100, n: 6 }, { to: 140, n: 8 }, { to: 120, n: 7 }, { to: 123, n: 5 }]);
    const a = require('../../src/services/forex/indicators').atr(c, 14);
    const su = elliott.detectSetup(c, a);
    expect(su).not.toBeNull();
    expect(su.kind).toBe('W4W5');
    expect(su.direction).toBe('long');
    expect(su.correctivePrice).toBeCloseTo(120, 0);
  });

  test('düzeltme bant DIŞI (sığ %17) → null', () => {
    const c = mk(100, [{ to: 100, n: 34 }, { to: 90, n: 6 }, { to: 120, n: 8 }, { to: 115, n: 7 }, { to: 116, n: 5 }]);
    const a = require('../../src/services/forex/indicators').atr(c, 14);
    expect(elliott.detectSetup(c, a)).toBeNull();
  });

  test('W4→W5 reddedilen impuls (dalga4 dalga1 ile ÇAKIŞIR) kuyruğu yanlış W2W3 SIZMAZ → null', () => {
    // A90 B120 C100 D150 E110: E(110) < B(120) → wave4 overlap → W4W5 RED.
    // Eski hata: (C,D,E) taze W2W3 sanılıp retr~0.8 ile ATEŞLENİYORDU.
    const c = mk(100, [{ to: 100, n: 34 }, { to: 90, n: 6 }, { to: 120, n: 7 }, { to: 100, n: 6 }, { to: 150, n: 8 }, { to: 110, n: 7 }, { to: 113, n: 5 }]);
    const a = require('../../src/services/forex/indicators').atr(c, 14);
    expect(elliott.detectSetup(c, a)).toBeNull();
  });
});

// ── 2) engine saf yardımcılar ─────────────────────────────────────────────────
describe('waveScanEngine yardımcılar', () => {
  test('candleConfirm — boğa yutan → long teyit, short null', () => {
    const c = [
      { open: 100, high: 101, low: 99, close: 100 },
      { open: 110, high: 111, low: 99, close: 100 }, // bear gövde 10
      { open: 99, high: 113, low: 98, close: 112 },  // bull gövde 13 → yutan
    ];
    expect(engine.candleConfirm(c, 'long')).toBeTruthy();
    expect(engine.candleConfirm(c, 'short')).toBeNull();
  });

  test('snrConfirm — yakın destek long teyit; uzak/yanlış tip null', () => {
    const snr = { signals: [{ type: 'support', score: 78, grade: 'GUCLU', priceDistancePct: 1.4, entry: 100, stop: 96 }] };
    const ok = engine.snrConfirm(snr, 'long');
    expect(ok).toBeTruthy();
    expect(ok.zoneStop).toBe(96);
    expect(engine.snrConfirm(snr, 'short')).toBeNull();                       // direnç yok
    expect(engine.snrConfirm({ signals: [{ type: 'support', priceDistancePct: 9 }] }, 'long')).toBeNull(); // uzak
  });

  test('buildLevels — long: stop<giriş<TP1<TP2, R/R hesaplı', () => {
    const setup = { correctivePrice: 102, prior: 120, proj: 150 };
    const lv = engine.buildLevels('long', 104, setup, 1.5, 2, 97);
    expect(lv.stop).toBeLessThan(lv.entry);
    expect(lv.target1).toBeGreaterThan(lv.entry);
    expect(lv.target2).toBeGreaterThan(lv.target1);
    expect(lv.rr1).toBeGreaterThan(1);
  });

  test('trendOk — long EMA100 üstünde ister', () => {
    const up = mk(50, [{ to: 150, n: 130 }]);   // güçlü yükseliş
    expect(engine.trendOk(up, 'long')).toBe(true);
    expect(engine.trendOk(up, 'short')).toBe(false);
  });
});

// ── 3) tracker ─────────────────────────────────────────────────────────────────
describe('waveScanTracker', () => {
  beforeEach(() => { tracker.__resetForTest(); forexKlines.fetchCandles.mockReset(); });

  const sig = (over = {}) => ({
    id: 'BTCUSD', symbol: 'BTC/USD', name: 'Bitcoin', tf: '4h', direction: 'long', wave: 'W2W3', waveLabel: 'Dalga 2→3',
    precision: 2, entry: 100, stop: 95, target1: 110, target2: 120, rr1: 2, rr2: 4, score: 80,
    notes: ['x'], mt5Symbol: 'BTCUSD', elliott: {}, correctiveTime: 1700000000, ...over,
  });

  test('nextCode — W + parite ön eki, parite başına bağımsız', () => {
    expect(tracker.nextCode('BTCUSD')).toBe('WBT01');
    expect(tracker.nextCode('BTCUSD')).toBe('WBT02');
    expect(tracker.nextCode('XAUUSD')).toBe('WAU01');
  });

  test('syncSignals — yeni → #WBT01; AYNI kurulum tekrar → sinyal YOK (dedup)', async () => {
    const ev1 = await tracker.syncSignals([sig()]);
    expect(ev1).toHaveLength(1);
    expect(ev1[0].position.code).toBe('WBT01');
    const ev2 = await tracker.syncSignals([sig()]);           // aynı correctiveTime
    expect(ev2).toHaveLength(0);
  });

  test('checkClosures — hedefe ulaşınca TP1 (ileri-yönlü, mock 1h)', async () => {
    await tracker.syncSignals([sig()]);
    const t = tracker.getOpen()[0].issueTimeSec + 3600;
    forexKlines.fetchCandles.mockResolvedValue([{ time: t, open: 100, high: 111, low: 108, close: 110 }]);
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(1);
    expect(ev[0].outcome).toBe('TP1');
    expect(ev[0].code).toBe('WBT01');
    expect(ev[0].pnlPct).toBe(10);
  });
});

// ── 4) notifier ────────────────────────────────────────────────────────────────
describe('waveScanNotifier saf kurucular', () => {
  const pos = {
    code: 'WAU01', symbol: 'XAU/USD', tf: '1d', direction: 'long', precision: 2,
    entry: 2300, stop: 2250, target1: 2400, target2: 2500, rr1: 2, rr2: 4, score: 82,
    notes: ['Elliott: Dalga 2 bitti → Dalga 3', 'SNR: Destek bölgesi', 'Mum: Boğa yutan'],
    mt5Symbol: 'XAUUSD',
  };
  test('buildNew — #NO, özel-tarama etiketi, "DEĞİLDİR", notlar, MT5', () => {
    const m = notifier.buildNew(pos);
    expect(m).toContain('#WAU01');
    expect(m).toMatch(/özel tarama/i);
    expect(m).toContain('DEĞİLDİR');
    expect(m).toContain('Boğa yutan');
    expect(m).toMatch(/MT5/);
  });
  test('buildClosure — TP1 başlık + sonuç %', () => {
    const m = notifier.buildClosure({ code: 'WAU01', symbol: 'XAU/USD', tf: '1d', direction: 'long', outcome: 'TP1', entry: 2300, exit: 2400, pnlPct: 4.35, precision: 2 });
    expect(m).toContain('#WAU01');
    expect(m).toContain('TP1 OLDU');
    expect(m).toContain('+4.35%');
  });
});
