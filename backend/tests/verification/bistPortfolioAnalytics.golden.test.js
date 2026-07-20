/**
 * GOLDEN TESTS — BIST Portföy analitiği + BIST100 kıyası (alfa)
 * Saf metrik fonksiyonları + benchmark (liveDataService mock; ağ yok).
 */

// benchmark için liveDataService mock — XU100 serisi enjekte
const mockHist = jest.fn();
jest.mock('../../src/services/liveDataService', () => ({ fetchHistoricalData: (...a) => mockHist(...a) }));

const analytics = require('../../src/services/bistPortfolio/analytics');
const benchmark = require('../../src/services/bistPortfolio/benchmark');

describe('analytics.maxDrawdown', () => {
  test('tepe sonrası dip → doğru düşüş %', () => {
    const eh = [{ equity: 100 }, { equity: 120 }, { equity: 90 }, { equity: 110 }];
    const r = analytics.maxDrawdown(eh);
    expect(r.maxDrawdownPct).toBeCloseTo(25, 2);   // 120 → 90 = %25
    expect(r.peakEquity).toBe(120);
  });
  test('sürekli artış → düşüş 0', () => {
    expect(analytics.maxDrawdown([{ equity: 100 }, { equity: 110 }, { equity: 120 }]).maxDrawdownPct).toBe(0);
  });
  test('boş → 0', () => { expect(analytics.maxDrawdown([]).maxDrawdownPct).toBe(0); });
});

describe('analytics.tradeStats', () => {
  const trades = [
    { realizedPnL: 200, priceReturnPct: 10, exitReason: 'target', entryDate: '2026-01-01', exitDate: '2026-01-05' },
    { realizedPnL: 150, priceReturnPct: 8, exitReason: 'signal_exit', entryDate: '2026-01-02', exitDate: '2026-01-08' },
    { realizedPnL: -100, priceReturnPct: -5, exitReason: 'stop', entryDate: '2026-01-03', exitDate: '2026-01-04' },
  ];
  test('kazanma oranı + profit factor + expectancy', () => {
    const s = analytics.tradeStats(trades);
    expect(s.count).toBe(3);
    expect(s.wins).toBe(2); expect(s.losses).toBe(1);
    expect(s.winRate).toBeCloseTo(66.7, 1);
    expect(s.profitFactor).toBeCloseTo(3.5, 2);   // (200+150)/100
    expect(s.avgWinPct).toBeCloseTo(9, 2);
    expect(s.avgLossPct).toBeCloseTo(-5, 2);
    expect(s.byReason).toEqual({ target: 1, signal_exit: 1, stop: 1 });
    expect(s.bestPct).toBe(10); expect(s.worstPct).toBe(-5);
    expect(s.avgHoldDays).toBeGreaterThan(0);
  });
  test('boş işlem → sıfır metrikler', () => {
    const s = analytics.tradeStats([]);
    expect(s.count).toBe(0); expect(s.profitFactor).toBe(0); expect(s.winRate).toBe(0);
  });
  test('hiç kayıp yok → profit factor tavan (999)', () => {
    const s = analytics.tradeStats([{ realizedPnL: 100, priceReturnPct: 5, exitReason: 'target' }]);
    expect(s.profitFactor).toBe(999);
  });
});

describe('analytics.sharpe / computeMetrics', () => {
  test('düz seride sharpe 0; artan seride pozitif', () => {
    expect(analytics.sharpe([{ equity: 100 }, { equity: 100 }, { equity: 100 }])).toBe(0);
    expect(analytics.sharpe([{ equity: 100 }, { equity: 101 }, { equity: 102 }, { equity: 103 }])).toBeGreaterThan(0);
  });
  test('computeMetrics birleşik özet döner', () => {
    const m = analytics.computeMetrics({
      trades: [{ realizedPnL: 100, priceReturnPct: 5, exitReason: 'target', entryDate: '2026-01-01', exitDate: '2026-01-03' }],
      equityHistory: [{ equity: 100000 }, { equity: 100100 }],
    });
    expect(m.closedCount).toBe(1);
    expect(m.profitFactor).toBe(999);
    expect(m).toHaveProperty('maxDrawdownPct');
    expect(m).toHaveProperty('expectancyTL');
  });
});

describe('analytics.scoreBuckets — hangi skor aralığı kazanıyor (şeffaflık)', () => {
  const t = (score, pnl, ret) => ({ score, realizedPnL: pnl, priceReturnPct: ret, exitReason: pnl > 0 ? 'target' : 'stop' });
  test('skorlara göre kovalar + kazanma/PF hesaplanır', () => {
    const b = analytics.scoreBuckets([
      t(82, 100, 5), t(83, 200, 8), t(81, -50, -3),   // 80-84: 2W/1L
      t(87, -100, -4), t(88, 50, 2),                   // 85-89: 1W/1L
      t(95, 300, 10),                                  // 90+: 1W
    ]);
    expect(b['80-84'].count).toBe(3);
    expect(b['80-84'].winRate).toBeCloseTo(66.7, 1);
    expect(b['80-84'].profitFactor).toBeCloseTo(6, 1);   // (100+200)/50
    expect(b['85-89'].winRate).toBe(50);
    expect(b['90+'].count).toBe(1);
    expect(b['90+'].profitFactor).toBe(999);             // kayıp yok
  });
  test('skoru olmayan işlemler kovalara girmez', () => {
    expect(analytics.scoreBuckets([{ realizedPnL: 10, priceReturnPct: 1 }])).toEqual({});
  });
});

describe('benchmark.compare — BIST100 kıyası + alfa', () => {
  beforeEach(() => { benchmark.__clearCache(); mockHist.mockReset(); });

  test('endeks getirisi + alfa hesaplanır', async () => {
    mockHist.mockResolvedValue([
      { date: '2026-01-01', close: 10000, high: 10000, low: 10000, open: 10000 },
      { date: '2026-01-15', close: 10500, high: 10500, low: 10500, open: 10500 }, // +%5
    ]);
    const eh = [{ date: '2026-01-01', equity: 100000 }, { date: '2026-01-15', equity: 112000 }];
    const r = await benchmark.compare(eh, 12);   // portföy +%12
    expect(r).not.toBeNull();
    expect(r.indexReturnPct).toBeCloseTo(5, 2);
    expect(r.alphaPct).toBeCloseTo(7, 2);        // 12 − 5
  });

  test('equityHistory < 2 → null', async () => {
    expect(await benchmark.compare([{ date: '2026-01-01', equity: 100000 }], 3)).toBeNull();
  });

  test('endeks verisi yok → null (opsiyonel, patlamaz)', async () => {
    mockHist.mockResolvedValue([]);
    const eh = [{ date: '2026-01-01', equity: 100000 }, { date: '2026-01-15', equity: 112000 }];
    expect(await benchmark.compare(eh, 12)).toBeNull();
  });
});
