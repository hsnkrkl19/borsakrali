/**
 * GOLDEN TESTS — backtesting.py sidecar köprüsü + kalibrasyon veri katmanı (Node tarafı).
 *
 * Sidecar AYRI bir Python servisidir; bu testler ağ kullanmaz. Doğrulanan:
 *   • sidecarClient env yokken devre dışı (canlı sinyaller JS'e düşer, ölmez).
 *   • forexBacktest yerel özet (JS fallback) winRate/expectancy/profitFactor doğru.
 *   • bistBacktest kova birleştirme (global kalibrasyon) ve getHistory NO-OP güvenliği.
 */

describe('sidecarClient — env yoksa devre dışı (fail-safe)', () => {
  const sidecar = require('../../src/services/backtest/sidecarClient');
  test('BACKTEST_SERVICE_URL yok → isEnabled false, available false', () => {
    expect(sidecar.isEnabled()).toBe(false);
    expect(sidecar.available()).toBe(false);
  });
  test('health devre dışıyken {ok:false, enabled:false}', async () => {
    const h = await sidecar.health();
    expect(h).toEqual({ ok: false, enabled: false });
  });
  test('backtest/batch/optimize devre dışıyken null (çağıran JS hesabına düşer)', async () => {
    expect(await sidecar.backtest({})).toBeNull();
    expect(await sidecar.batch([])).toBeNull();
    expect(await sidecar.optimize({})).toBeNull();
  });
});

describe('forexBacktest.summarizeLocally — JS fallback istatistikleri', () => {
  const fb = require('../../src/services/forex/forexBacktest');

  // 6 barlık seri; long sinyali index 0'dan: entry 100, stop 95, target 105.
  function bars(closes) {
    return closes.map((c, i) => ({ time: i, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1 }));
  }

  test('TP1 önce vurulursa WIN; expectancy & profitFactor hesaplanır', () => {
    // index1..: 101,103,106(high 106.5≥105 → win)
    const candles = bars([100, 101, 103, 106, 106, 106]);
    const signals = [{ index: 0, direction: 'long', entry: 100, stop: 95, target: 105, band: 'high' }];
    const r = fb.summarizeLocally(candles, signals, 5);
    expect(r.high.sampleSize).toBe(1);
    expect(r.high.winRate).toBe(100);
    expect(r.high.profitFactor).toBe(999);           // hiç kayıp yok
    expect(r.all.expectancy).toBeCloseTo(5, 5);      // (105-100)/100*100
  });

  test('SL önce vurulursa LOSS', () => {
    const candles = bars([100, 99, 94, 94, 94, 94]);  // low 93.5 ≤ 95 → loss
    const signals = [{ index: 0, direction: 'long', entry: 100, stop: 95, target: 105, band: 'mid' }];
    const r = fb.summarizeLocally(candles, signals, 5);
    expect(r.mid.winRate).toBe(0);
    expect(r.mid.profitFactor).toBe(0);              // kazanç yok → PF 0 (güçlü ceza)
    expect(r.mid.expectancy).toBeCloseTo(-5, 5);
  });

  test('ne SL ne TP → open (kapalı örnek 0)', () => {
    const candles = bars([100, 100, 100, 100, 100, 100]);
    const signals = [{ index: 0, direction: 'long', entry: 100, stop: 90, target: 110, band: 'low' }];
    const r = fb.summarizeLocally(candles, signals, 5);
    expect(r.low.sampleSize).toBe(0);
    expect(r.low.open).toBe(1);
  });
});

describe('bistBacktest — global kalibrasyon kova matematiği', () => {
  const bb = require('../../src/services/bistSignals/bistBacktest');

  test('bucketOf 5\'lik kovalara yuvarlar', () => {
    expect(bb.bucketOf(77)).toBe('b75');
    expect(bb.bucketOf(80)).toBe('b80');
    expect(bb.bucketOf(94.9)).toBe('b90');
  });

  test('mergeBuckets — kârlı-düşük-winRate kova doğru özetlenir', () => {
    const m = bb.mergeBuckets([{ win: 4, loss: 6, open: 0, grossWin: 40, grossLoss: 12 }]);
    expect(m.sampleSize).toBe(10);
    expect(m.winRate).toBe(40);                       // sub-50% ...
    expect(m.profitFactor).toBeCloseTo(3.333, 2);     // ... ama PF>1 (kârlı)
    expect(m.expectancy).toBeCloseTo(2.8, 5);         // (40-12)/10
  });

  test('mergeBuckets — birden çok kovayı toplar', () => {
    const m = bb.mergeBuckets([
      { win: 2, loss: 1, open: 0, grossWin: 10, grossLoss: 3 },
      { win: 3, loss: 2, open: 1, grossWin: 15, grossLoss: 6 },
    ]);
    expect(m.sampleSize).toBe(8);                     // (2+1)+(3+2)
    expect(m.profitFactor).toBeCloseTo(25 / 9, 3);
  });

  test('mergeBuckets — kapalı örnek yoksa null', () => {
    expect(bb.mergeBuckets([{ win: 0, loss: 0, open: 3, grossWin: 0, grossLoss: 0 }])).toBeNull();
    expect(bb.mergeBuckets([null])).toBeNull();
  });

  test('getHistory — veri yokken NO-OP (null) → kalibrasyon güvenli kapanır', () => {
    bb.__resetForTest();
    expect(bb.getHistory(77)).toBeNull();
  });
});
