/**
 * GOLDEN TESTS — Forex NET FIBONACCI SL/TP seviyeleri (forexFib.tradeLevels +
 * forexLevels.buildLevels). Kullanıcı: TP/SL fibo'ya bağlı, ATR'den GENİŞ (az stop),
 * lot/risk hesabı YOK. Geçerli yapı yoksa ATR'ye düşer.
 */

const fib = require('../../src/services/forex/forexFib');
const levels = require('../../src/services/forex/forexLevels');
const { atr } = require('../../src/services/forex/indicators');

// open=close → temiz fraktal; gerçekçi ATR (TR = |high−prevClose|)
function mk(start, legs) {
  const c = [start]; let x = start;
  for (const l of legs) { for (let i = 1; i <= l.n; i++) c.push(+(x + (l.to - x) * i / l.n).toFixed(3)); x = l.to; }
  const t = 1700000000;
  return c.map((v, i) => ({ time: t + i * 3600, open: v, high: +(v * 1.002).toFixed(3), low: +(v * 0.998).toFixed(3), close: v, volume: 1 }));
}

describe('forexFib.tradeLevels — net fib seviyeleri', () => {
  test('LONG geri çekilme: stop<giriş<TP1<TP2, basis fib, stop ≥2·ATR (geniş)', () => {
    const c = mk(100, [{ to: 100, n: 40 }, { to: 90, n: 6 }, { to: 120, n: 8 }, { to: 105, n: 7 }]);
    const a = atr(c, 14);
    const lv = fib.tradeLevels('long', c, 105, a, 2);
    expect(lv).not.toBeNull();
    expect(lv.basis).toBe('fib');
    expect(lv.stop).toBeLessThan(lv.entry);
    expect(lv.entry).toBeLessThan(lv.target1);
    expect(lv.target1).toBeLessThan(lv.target2);
    expect(105 - lv.stop).toBeGreaterThanOrEqual(2 * a - 0.01);   // ATR'den geniş stop (az stop)
    expect(105 - lv.stop).toBeLessThanOrEqual(6 * a + 0.01);      // ama clamp'li
  });

  test('SHORT geri çekilme: stop>giriş>TP1>TP2, basis fib', () => {
    const c = mk(120, [{ to: 120, n: 40 }, { to: 130, n: 6 }, { to: 100, n: 8 }, { to: 113, n: 7 }]);
    const a = atr(c, 14);
    const lv = fib.tradeLevels('short', c, 113, a, 2);
    expect(lv).not.toBeNull();
    expect(lv.basis).toBe('fib');
    expect(lv.stop).toBeGreaterThan(lv.entry);
    expect(lv.entry).toBeGreaterThan(lv.target1);
    expect(lv.target1).toBeGreaterThan(lv.target2);
  });

  test('geçersiz/yetersiz yapı → null', () => {
    expect(fib.tradeLevels('long', [], 100, 1, 2)).toBeNull();
    expect(fib.tradeLevels('long', mk(100, [{ to: 100, n: 20 }]), 100, 1, 2)).toBeNull(); // swing yok (düz)
  });
});

describe('forexLevels.buildLevels — fib öncelik, ATR fallback', () => {
  test('candles + geçerli yapı → basis fib', () => {
    const c = mk(100, [{ to: 100, n: 40 }, { to: 90, n: 6 }, { to: 120, n: 8 }, { to: 105, n: 7 }]);
    const a = atr(c, 14);
    expect(levels.buildLevels('long', 105, a, '4h', 2, c).basis).toBe('fib');
  });

  test('candles YOK → ATR fallback (basis atr)', () => {
    expect(levels.buildLevels('long', 105, 2.5, '4h', 2).basis).toBe('atr');
  });

  test('candles <60 bar → ATR fallback', () => {
    const c = mk(100, [{ to: 110, n: 30 }]);
    expect(levels.buildLevels('long', 110, 1.5, '4h', 2, c).basis).toBe('atr');
  });
});
