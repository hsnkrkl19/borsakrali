/**
 * GOLDEN TESTS — BIST "≥75 LONG" sinyal sistemi (bistSignals/).
 *
 * Kapsam:
 *   1) bistScoreEngine — toCandles map; scoreSymbol güçlü yükselişte LONG +
 *      0-100 güven üretir, düşüşte null (sadece spot-al/long).
 *   2) bistSignalTracker — numara (#001 artan); syncPositions yeni + iz-süren
 *      (yalnız yukarı) güncelleme; checkClosures TP/SL tespiti + SAHTE-STOP
 *      koruması (bozuk Yahoo low reddedilir).
 *   3) bistSignalNotifier — saf mesaj kurucular (Telegram + broadcast),
 *      broadcast başlık/gövde limitleri + 'signal' kategori + derin link.
 *
 * liveDataService mock'lanır (hermetik); tracker diski tmp'ye yazar.
 */

const os = require('os');
const path = require('path');

// Modül-yükleme zamanı okunan ayarlar → require'lardan ÖNCE.
process.env.BIST_SIGNAL_MIN_CONFIDENCE = '1';   // engine eşiğini düşür → long sinyali görelim
process.env.BIST_SIGNAL_DISK_FILE = path.join(os.tmpdir(), `bist-signals-test-${process.pid}.json`);
delete process.env.BIST_SIGNAL_PUSH_DISABLED;

// Yahoo fetch'i mock'la (engine + tracker aynı modülü paylaşır).
const mockHist = {};
jest.mock('../../src/services/liveDataService', () => ({
  fetchHistoricalData: async (symbol) => mockHist[symbol] || null,
}));

const engine = require('../../src/services/bistSignals/bistScoreEngine');
const tracker = require('../../src/services/bistSignals/bistSignalTracker');
const notifier = require('../../src/services/bistSignals/bistSignalNotifier');

// ── Yardımcılar ──────────────────────────────────────────────────────────────
// Lineer trend serisinden günlük historical satırları üret (engine için ≥100 bar).
function trendHist(start, step, n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const close = start + step * i;
    const open = close - step * 0.3;
    const high = Math.max(open, close) * 1.01;
    const low = Math.min(open, close) * 0.99;
    rows.push({
      date: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      timestamp: 1700000000000 + i * 86400000,
      open, high, low, close, volume: 1_000_000 + i * 1000,
    });
  }
  return rows;
}

// ── 1) bistScoreEngine ───────────────────────────────────────────────────────
describe('bistScoreEngine.toCandles', () => {
  test('historical satırlarını forex mum formatına çevirir; eksik kapanış elenir', () => {
    const c = engine.toCandles([
      { date: '2026-01-01', timestamp: 1735689600000, open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
      { date: '2026-01-02', open: null, high: 12, low: 10, close: null, volume: 50 }, // close null → elenir
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ open: 10, high: 11, low: 9, close: 10.5, volume: 100 });
    expect(c[0].time).toBe(Math.floor(1735689600000 / 1000));
  });
});

describe('bistScoreEngine.scoreSymbol', () => {
  beforeEach(() => { for (const k of Object.keys(mockHist)) delete mockHist[k]; engine.__resetForTest(); });

  test('güçlü yükseliş → LONG sinyali + 0-100 güven', async () => {
    mockHist['UPSTK'] = trendHist(50, 0.6, 220);            // istikrarlı yükseliş
    const sig = await engine.scoreSymbol({ symbol: 'UPSTK', name: 'Up Stock' });
    expect(sig).not.toBeNull();
    expect(sig.direction).toBe('long');
    expect(sig.confidence).toBeGreaterThanOrEqual(1);
    expect(sig.confidence).toBeLessThanOrEqual(100);
    expect(sig.entry).toBeGreaterThan(0);
    expect(sig.stop).toBeLessThan(sig.entry);              // long: stop girişin altında
    expect(sig.target1).toBeGreaterThan(sig.entry);        // hedef girişin üstünde
    expect(sig.symbol).toBe('UPSTK');
  });

  test('düşüş trendi → null (short sinyal spot-al değildir)', async () => {
    mockHist['DNSTK'] = trendHist(200, -0.6, 220);
    const sig = await engine.scoreSymbol({ symbol: 'DNSTK', name: 'Down Stock' });
    expect(sig).toBeNull();
  });

  test('yetersiz mum (<100) → null', async () => {
    mockHist['SHORTY'] = trendHist(50, 0.6, 40);
    expect(await engine.scoreSymbol({ symbol: 'SHORTY' })).toBeNull();
  });
});

// ── 2) bistSignalTracker ──────────────────────────────────────────────────────
describe('bistSignalTracker — numara + iz süren güncelleme', () => {
  beforeEach(() => { tracker.__resetForTest(); for (const k of Object.keys(mockHist)) delete mockHist[k]; });

  test('nextCode global artan, 3 hane padding', () => {
    expect(tracker.nextCode()).toBe('001');
    expect(tracker.nextCode()).toBe('002');
    expect(tracker.nextCode()).toBe('003');
  });

  const baseSig = () => ({ symbol: 'AAA', name: 'A A.Ş.', direction: 'long', entry: 100, stop: 95, target1: 110, target2: 120, rr1: 2, rr2: 4, confidence: 80, grade: 'MUKEMMEL', precision: 2 });

  test('yeni pozisyon → "new" olay + #001', async () => {
    const ev = await tracker.syncPositions([baseSig()]);
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('new');
    expect(ev[0].position.code).toBe('001');
    expect(ev[0].position.symbol).toBe('AAA');
  });

  test('aynı sembol daha yüksek stop/TP → iz süren "update" (yukarı)', async () => {
    await tracker.syncPositions([baseSig()]);
    const up = { ...baseSig(), stop: 97, target1: 112, target2: 122, confidence: 82 };
    const ev = await tracker.syncPositions([up]);
    expect(ev).toHaveLength(1);
    expect(ev[0].type).toBe('update');
    expect(ev[0].position.stop).toBe(97);
    expect(ev[0].position.target1).toBe(112);
    expect(ev[0].stopChanged).toBe(true);
  });

  test('aynı sembol DAHA DÜŞÜK stop → iz sürmez, olay yok', async () => {
    await tracker.syncPositions([baseSig()]);
    const down = { ...baseSig(), stop: 90, target1: 108, confidence: 80 };
    const ev = await tracker.syncPositions([down]);
    expect(ev).toHaveLength(0);
    const open = await tracker.getOpen();
    expect(open[0].stop).toBe(95);   // ilk (yüksek) stop korunur
  });
});

describe('bistSignalTracker.checkClosures — TP/SL + sahte-stop koruması', () => {
  beforeEach(() => { tracker.__resetForTest(); for (const k of Object.keys(mockHist)) delete mockHist[k]; });

  async function openOne(symbol) {
    await tracker.syncPositions([{ symbol, name: symbol, direction: 'long', entry: 100, stop: 95, target1: 110, target2: 120, rr1: 2, rr2: 4, confidence: 80, grade: 'MUKEMMEL', precision: 2 }]);
  }
  // giriş günü bugün → uzak-gelecek tarihli mumlar değerlendirilir
  const fut = (rows) => rows;

  test('hedefe ulaşınca TP1', async () => {
    await openOne('TPS');
    mockHist['TPS'] = fut([
      { date: '2099-01-02', close: 100, high: 101, low: 99 },
      { date: '2099-01-03', close: 109, high: 112, low: 104 },   // high 112 ≥ 110 → TP1
    ]);
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(1);
    expect(ev[0].outcome).toBe('TP1');
    expect(ev[0].exit).toBe(110);
    expect(ev[0].pnlPct).toBe(10);
  });

  test('stopa düşünce SL', async () => {
    await openOne('SLS');
    mockHist['SLS'] = fut([
      { date: '2099-01-02', close: 100, high: 101, low: 99 },
      { date: '2099-01-03', close: 94, high: 99, low: 93 },      // low 93 ≤ 95 → SL
    ]);
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(1);
    expect(ev[0].outcome).toBe('SL');
    expect(ev[0].exit).toBe(95);
    expect(ev[0].pnlPct).toBe(-5);
  });

  test('SAHTE-STOP: önceki kapanışın %20 altındaki bozuk low reddedilir → kapanış YOK', async () => {
    await openOne('BAD');
    mockHist['BAD'] = fut([
      { date: '2099-01-02', close: 100, high: 101, low: 99 },
      { date: '2099-01-03', close: 99, high: 101, low: 10 },     // low 10 (prevClose 100 → <%80) → bozuk, reddedilir
    ]);
    const ev = await tracker.checkClosures();
    expect(ev).toHaveLength(0);
    const open = await tracker.getOpen();
    expect(open.find(p => p.symbol === 'BAD')).toBeTruthy();     // hâlâ açık
  });
});

// ── 3) bistSignalNotifier saf kurucular ──────────────────────────────────────
describe('bistSignalNotifier — saf mesaj kurucular', () => {
  const pos = { code: '007', symbol: 'THYAO', name: 'Türk Hava Yolları', direction: 'long', precision: 2, entry: 312.5, stop: 300, target1: 340, target2: 370, rr1: 2.2, rr2: 4.6, confidence: 82, grade: 'MUKEMMEL', horizon: 'SWING' };

  test('buildNewTelegram — sembol, #no, güven, giriş içerir', () => {
    const m = notifier.buildNewTelegram(pos);
    expect(m).toContain('THYAO');
    expect(m).toContain('#007');
    expect(m).toContain('82/100');
    expect(m).toContain('LONG');
  });

  test('buildBroadcastNew — kategori signal, derin link, limitlere uyar', () => {
    const b = notifier.buildBroadcastNew(pos);
    expect(b.category).toBe('signal');
    expect(b.path).toBe(notifier.DEEP_LINK);
    expect(b.title).toContain('#007');
    expect(b.title).toContain('THYAO');
    expect(b.title.length).toBeLessThanOrEqual(120);
    expect(b.body.length).toBeLessThanOrEqual(500);
  });

  test('buildClosureTelegram — TP/SL başlık + sonuç %', () => {
    expect(notifier.buildClosureTelegram({ code: '007', symbol: 'THYAO', outcome: 'TP1', entry: 100, exit: 110, pnlPct: 10, precision: 2 })).toContain('TP OLDU');
    const sl = notifier.buildClosureTelegram({ code: '007', symbol: 'THYAO', outcome: 'SL', entry: 100, exit: 95, pnlPct: -5, precision: 2 });
    expect(sl).toContain('STOP OLDU');
    expect(sl).toContain('-5%');
  });

  test('buildBroadcastClosure — signal kategori + #no + sonuç', () => {
    const b = notifier.buildBroadcastClosure({ code: '007', symbol: 'THYAO', outcome: 'TP1', entry: 100, exit: 110, pnlPct: 10, precision: 2 });
    expect(b.category).toBe('signal');
    expect(b.title).toContain('#007');
    expect(b.body).toContain('+10%');
    expect(b.body.length).toBeLessThanOrEqual(500);
  });
});
