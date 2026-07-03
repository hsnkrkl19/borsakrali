/**
 * GOLDEN TESTS — ALTIN · Pozisyon İzleyici (altinTracker).
 *
 * Kilitlenen davranışlar:
 *   1) nextCode: AU-<TF>-NNN, TF başına BAĞIMSIZ sayaç.
 *   2) ingest: TF başına TEK pozisyon açar (en yüksek güvenli sinyal); aynı TF'te
 *      açık varken tekrar ingest → 2. pozisyon AÇILMAZ.
 *   3) manageOpen TP çıkışı: hedef vurulunca outcome 'TP', win true.
 *   4) manageOpen SL çıkışı: stop vurulunca outcome 'SL', win false.
 *   5) İLERİ-YÖNLÜ: stop konuş-zamanından (stopSetSec) ÖNCEKİ dip STOP tetiklemez.
 *   6) getStats kapanışları (tf,yön) bazında toplar; __resetForTest temizler.
 *
 * altinData jest.mock'lanır (hermetik, ağ YOK). Tracker diski tmp'ye yazar.
 */

const os = require('os');
const path = require('path');

// Diski tmp'ye yönlendir (üretim data/ dosyalarına dokunma). Öğrenme durumu da
// izole edilir — yoksa koşular arası tmp'de birikir (paylaşılan dosya tuzağı).
process.env.ALTIN_OPEN_FILE = path.join(os.tmpdir(), `altin-open-test-${process.pid}.json`);
process.env.ALTIN_LEARNING_FILE = path.join(os.tmpdir(), `altin-learning-test-${process.pid}-${Date.now()}.json`);

// altinData mock: testler candleStore'a TF mumları koyar.
const candleStore = {};
jest.mock('../../src/services/altin/altinData', () => ({
  getCandles: jest.fn(async (tf) => candleStore[tf] || []),
  getAll: jest.fn(async (tfs) => { const o = {}; for (const t of (tfs || [])) o[t] = candleStore[t] || []; return o; }),
  SYMBOL: 'GC=F',
}));

const tracker = require('../../src/services/altin/altinTracker');
const NOW = () => Math.floor(Date.now() / 1000);

// Bias-uyumlu sinyal taslağı (motorun ürettiği biçim).
function sig(over = {}) {
  return {
    tf: '4h', symbol: 'XAU/USD', type: 'supertrend', label: '4s Supertrend',
    direction: 'long', entry: 2000, stop: 1960, target: 2060,
    atr: 20, tpAtr: 1, slAtr: 4, trail: false,
    confidence: 82, wrEst: 94, scalp: false, barTime: NOW(),
    ...over,
  };
}

describe('altinTracker.nextCode — AU-<TF>-NNN, TF başına bağımsız', () => {
  beforeEach(() => tracker.__resetForTest());

  test('TF başına ayrı sayaç + üç hane padding', () => {
    expect(tracker.nextCode('4h')).toBe('AU-4H-001');
    expect(tracker.nextCode('4h')).toBe('AU-4H-002');
    expect(tracker.nextCode('1d')).toBe('AU-1D-001');     // ayrı sayaç
    expect(tracker.nextCode('15m')).toBe('AU-15M-001');
    expect(tracker.nextCode('4h')).toBe('AU-4H-003');
  });
});

describe('altinTracker.ingest — TF başına tek pozisyon', () => {
  beforeEach(() => tracker.__resetForTest());

  test('aynı TF\'te en yüksek güvenli sinyal açılır (kod AU-4H-001)', async () => {
    const opened = await tracker.ingest([
      sig({ confidence: 70, type: 'breakout20' }),
      sig({ confidence: 82, type: 'supertrend' }),
    ]);
    expect(opened).toHaveLength(1);
    expect(opened[0].code).toBe('AU-4H-001');
    expect(opened[0].confidence).toBe(82);              // en yüksek güven seçildi
    expect(opened[0].tf).toBe('4h');
    expect(opened[0].entry).toBe(2000);
    expect((await tracker.listOpen())).toHaveLength(1);
  });

  test('aynı TF\'te açık pozisyon varken tekrar ingest → 2. pozisyon YOK', async () => {
    await tracker.ingest([sig()]);
    const again = await tracker.ingest([sig({ confidence: 95 })]);
    expect(again).toHaveLength(0);
    expect((await tracker.listOpen())).toHaveLength(1);
  });

  test('farklı TF\'ler ayrı pozisyon açar', async () => {
    const opened = await tracker.ingest([sig({ tf: '4h' }), sig({ tf: '1d' })]);
    expect(opened).toHaveLength(2);
    const codes = opened.map(o => o.code).sort();
    expect(codes).toEqual(['AU-1D-001', 'AU-4H-001']);
  });
});

describe('altinTracker.manageOpen — TP / SL çıkışı', () => {
  beforeEach(() => { tracker.__resetForTest(); candleStore['4h'] = []; });

  test('hedef vurulunca TP (win), aynı kod, pozisyon kapanır', async () => {
    await tracker.ingest([sig()]);                       // entry2000 stop1960 target2060
    const p = (await tracker.listOpen())[0];
    candleStore['4h'] = [
      { time: p.issueTimeSec - 100, open: 2000, high: 2070, low: 1900, close: 2000 }, // giriş ÖNCESİ → yok sayılır
      { time: p.stopSetSec + 3600, open: 2000, high: 2065, low: 1990, close: 2055 },  // high>=2060 → TP
    ];
    const clos = await tracker.manageOpen();
    expect(clos).toHaveLength(1);
    expect(clos[0].outcome).toBe('TP');
    expect(clos[0].exit).toBe(2060);
    expect(clos[0].win).toBe(true);
    expect(clos[0].pnlPct).toBe(3);                     // (2060-2000)/2000*100
    expect(clos[0].R).toBe(1.5);                        // 60 kâr / 40 risk
    expect(clos[0].code).toBe('AU-4H-001');
    expect((await tracker.listOpen())).toHaveLength(0);
  });

  test('stop vurulunca SL (loss)', async () => {
    await tracker.ingest([sig()]);
    const p = (await tracker.listOpen())[0];
    candleStore['4h'] = [
      { time: p.stopSetSec + 3600, open: 2000, high: 2010, low: 1955, close: 1958 }, // low<=1960 → SL
    ];
    const clos = await tracker.manageOpen();
    expect(clos).toHaveLength(1);
    expect(clos[0].outcome).toBe('SL');
    expect(clos[0].exit).toBe(1960);
    expect(clos[0].win).toBe(false);
    expect(clos[0].pnlPct).toBe(-2);                    // (1960-2000)/2000*100
    expect(clos[0].R).toBe(-1);
  });

  test('İLERİ-YÖNLÜ: stop konuş-zamanından ÖNCEKİ dip STOP tetiklemez', async () => {
    await tracker.ingest([sig()]);
    const p = (await tracker.listOpen())[0];
    // Mum, girişten SONRA ama stopSetSec'ten ÖNCE 1900'e inmiş → SL kapısı (b.time>stopSince) false.
    candleStore['4h'] = [
      { time: p.stopSetSec - 50, open: 2000, high: 2010, low: 1900, close: 1958 },
    ];
    const clos = await tracker.manageOpen();
    expect(clos).toHaveLength(0);
    expect((await tracker.listOpen())).toHaveLength(1);  // hâlâ açık
  });
});

describe('altinTracker.getStats — kapanış toplama', () => {
  beforeEach(() => { tracker.__resetForTest(); candleStore['4h'] = []; });

  test('TP kapanışı (tf,yön) istatistiğine yazılır', async () => {
    await tracker.ingest([sig()]);
    const p = (await tracker.listOpen())[0];
    candleStore['4h'] = [{ time: p.stopSetSec + 3600, open: 2000, high: 2065, low: 1990, close: 2055 }];
    await tracker.manageOpen();
    const stats = await tracker.getStats();
    expect(stats.byTf['4h'].long.win).toBe(1);
    expect(stats.byTf['4h'].long.n).toBe(1);
    expect(stats.byTf['4h'].long.winRate).toBe(100);
    expect(stats.overall.win).toBe(1);
    expect(stats.overall.n).toBe(1);
    expect(stats.totalOpened).toBe(1);
    expect(stats.totalClosed).toBe(1);
  });

  test('SL kapanışı kayıp olarak sayılır', async () => {
    await tracker.ingest([sig()]);
    const p = (await tracker.listOpen())[0];
    candleStore['4h'] = [{ time: p.stopSetSec + 3600, open: 2000, high: 2010, low: 1955, close: 1958 }];
    await tracker.manageOpen();
    const stats = await tracker.getStats();
    expect(stats.byTf['4h'].long.loss).toBe(1);
    expect(stats.byTf['4h'].long.win).toBe(0);
    expect(stats.byTf['4h'].long.winRate).toBe(0);
  });

  test('__resetForTest istatistikleri temizler', async () => {
    await tracker.ingest([sig()]);
    tracker.__resetForTest();
    const stats = await tracker.getStats();
    expect(stats.totalOpened).toBe(0);
    expect(stats.overall.n).toBe(0);
    expect((await tracker.listOpen())).toHaveLength(0);
  });
});
