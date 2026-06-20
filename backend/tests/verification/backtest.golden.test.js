/**
 * GOLDEN TESTS — Backtest Laboratuvarı
 *
 * Saf/yan-etkisiz katmanlar: metrik hesapları + motor (bellek-içi store, diske
 * dokunmaz). Motor canlı `customBotEngine.openPosition/closePosition` para
 * matematiğini yeniden kullandığı için bu testler aynı zamanda "backtest = canlı"
 * tutarlılığını da korur. Tüm portföy sanaldır; gerçek para yoktur.
 */

const metrics = require('../../src/services/backtest/metrics');
const { runBacktest, checkExit } = require('../../src/services/backtest/backtestEngine');
const { createInMemoryStore } = require('../../src/services/backtest/inMemoryStore');

// ── Yardımcılar ──────────────────────────────────────────────────────────────
let _d = 0;
function dateAt(i) {
  // sıralı ISO gün anahtarı (hafta günü önemli değil — motor sadece sıraya bakar)
  const base = new Date(Date.UTC(2024, 0, 1) + i * 86400000);
  return base.toISOString().slice(0, 10);
}
// Düz değer dizisinden OHLC mum dizisi (high/low = close ± band)
function candlesFrom(values, band = 0) {
  return values.map((v, i) => ({
    date: dateAt(i),
    open: v, high: v + band, low: v - band, close: v,
  }));
}
function baseDef(overrides = {}) {
  return {
    strategyId: 'ema_cross',
    params: { fastPeriod: 9, slowPeriod: 21 },
    universe: ['TEST'],
    risk: { stopType: 'none', stopValue: 2, targetType: 'none', targetValue: 2, trailing: false, timeoutDays: 0 },
    sizing: { positionPct: 20, maxPositions: 5, capital: 100000 },
    commissionPct: 0.2, slippagePct: 0.1,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
describe('metrics — saf tearsheet hesapları', () => {
  test('maxDrawdown: 120 tepe → 90 dip = %25', () => {
    const curve = [100, 110, 120, 105, 90, 110].map((e, i) => ({ date: dateAt(i), equity: e }));
    const dd = metrics.maxDrawdown(curve);
    expect(dd.maxDrawdownPct).toBeCloseTo(25, 4);
  });

  test('maxDrawdown: monoton artan eğride drawdown 0', () => {
    const curve = [100, 101, 102, 103].map((e, i) => ({ date: dateAt(i), equity: e }));
    expect(metrics.maxDrawdown(curve).maxDrawdownPct).toBe(0);
  });

  test('cagr: 1 yılda 100→200 ≈ %100', () => {
    const c = metrics.cagr(100, 200, '2024-01-01', '2025-01-01');
    expect(c).toBeGreaterThan(95);
    expect(c).toBeLessThan(105);
  });

  test('computeMetrics: profitFactor/winRate/expectancy', () => {
    const trades = [
      { realizedPnL: 100, realizedPnLPct: 10, exitReason: 'target', holdingBars: 3 },
      { realizedPnL: 200, realizedPnLPct: 20, exitReason: 'signal_exit', holdingBars: 5 },
      { realizedPnL: -150, realizedPnLPct: -15, exitReason: 'stop', holdingBars: 2 },
    ];
    const curve = [100000, 100100, 100300, 100150].map((e, i) => ({ date: dateAt(i), equity: e }));
    const m = metrics.computeMetrics({ initialCapital: 100000, finalEquity: 100150, equityCurve: curve, trades });
    expect(m.totalTrades).toBe(3);
    expect(m.winCount).toBe(2);
    expect(m.lossCount).toBe(1);
    expect(m.winRate).toBeCloseTo(66.7, 1);
    expect(m.profitFactor).toBeCloseTo(2, 4);          // 300 / 150
    expect(m.expectancy).toBeCloseTo(50, 4);           // (300-150)/3
    expect(m.netProfit).toBeCloseTo(150, 4);
    expect(m.exitBreakdown.stop).toBe(1);
  });

  test('computeMetrics: kayıpsız → profitFactor sonsuz bayrağı', () => {
    const m = metrics.computeMetrics({
      initialCapital: 1000, finalEquity: 1300,
      equityCurve: [{ date: dateAt(0), equity: 1000 }, { date: dateAt(1), equity: 1300 }],
      trades: [{ realizedPnL: 300, realizedPnLPct: 30, exitReason: 'target', holdingBars: 1 }],
    });
    expect(m.profitFactorInf).toBe(true);
    expect(m.profitFactor).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('checkExit — bar-bazlı SL/TP (stop önceliği + gap dolumu)', () => {
  const pos = { currentStop: 95, currentTarget: 120 };
  test('gün-içi düşük stop’a değerse stop’tan kapanır', () => {
    const ex = checkExit(pos, { open: 100, high: 101, low: 94, close: 96 });
    expect(ex.hit).toBe('stop');
    expect(ex.price).toBeCloseTo(95, 4);
  });
  test('boşluklu açılış stop’un altındaysa açılıştan kapanır', () => {
    const ex = checkExit(pos, { open: 90, high: 92, low: 88, close: 91 });
    expect(ex.hit).toBe('stop');
    expect(ex.price).toBeCloseTo(90, 4);   // gerçekçi: açılış < stop
  });
  test('yüksek hedefe değerse hedeften kapanır', () => {
    const ex = checkExit(pos, { open: 110, high: 121, low: 109, close: 119 });
    expect(ex.hit).toBe('target');
    expect(ex.price).toBeCloseTo(120, 4);
  });
  test('aynı barda hem stop hem hedef → stop önce (tutucu)', () => {
    const ex = checkExit(pos, { open: 100, high: 121, low: 94, close: 119 });
    expect(ex.hit).toBe('stop');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('runBacktest — canlı motoru geçmişe sarar', () => {
  // 30 düz (10) + tek sıçrama (13) → EMA9 EMA21’i yukarı keser = giriş
  // sonra aşağı rampa → EMA aşağı keser = strateji çıkışı (round-trip)
  function roundTripSeries() {
    const flat = Array(30).fill(10);
    const up = [13, 14, 15, 16, 17, 18, 19, 20];      // giriş tetiklenir
    const down = [18, 16, 14, 12, 10, 8, 7, 6, 5, 5, 5, 5]; // strateji çıkışı tetiklenir
    return candlesFrom([...flat, ...up, ...down]);
  }

  test('strateji girişi+çıkışı ile en az bir kapalı işlem üretir', () => {
    const res = runBacktest({ def: baseDef(), candlesBySymbol: { TEST: roundTripSeries() } });
    expect(res.ok).toBe(true);
    expect(res.trades.length).toBeGreaterThanOrEqual(1);
    const t = res.trades[0];
    expect(t.symbol).toBe('TEST');
    expect(['signal_exit', 'stop', 'target', 'timeout']).toContain(t.exitReason);
    expect(typeof t.realizedPnL).toBe('number');
  });

  test('giriş warmup’tan önce OLMAZ (look-ahead yok)', () => {
    const res = runBacktest({ def: baseDef(), candlesBySymbol: { TEST: roundTripSeries() } });
    // ema_cross minCandles = max(9,21)+5 = 26 → ilk giriş en erken 26. bar (index 25)
    const minDate = dateAt(25);
    for (const t of res.trades) {
      expect(t.entryDate.slice(0, 10) >= minDate).toBe(true);
    }
  });

  test('nakit korunumu: final equity = başlangıç + Σ realizedPnL + Σ açık-değer farkı', () => {
    const res = runBacktest({ def: baseDef(), candlesBySymbol: { TEST: roundTripSeries() } });
    const realized = res.trades.reduce((s, t) => s + t.realizedPnL, 0);
    const unreal = res.openAtEnd.reduce((s, p) => s + p.unrealizedPnL, 0);
    const finalEquity = res.equityCurve[res.equityCurve.length - 1].equity;
    expect(finalEquity).toBeCloseTo(100000 + realized + unreal, 0);
    expect(res.metrics.finalEquity).toBeCloseTo(finalEquity, 0);
  });

  test('yüzde stop: giriş sonrası sert düşüş stop’tan kapatır', () => {
    // 30 düz (100) + sıçrama (130 → giriş) + ertesi bar düşük 120 (stop 123.5’i deler)
    const values = [...Array(30).fill(100), 130, 121, 121, 121];
    const candles = candlesFrom(values, 0).map((c, i) => {
      if (i === 31) return { ...c, open: 129, high: 129, low: 120, close: 121 }; // gün-içi düşük stop’u deler
      return c;
    });
    const def = baseDef({ risk: { stopType: 'percent', stopValue: 5, targetType: 'none', targetValue: 0, trailing: false, timeoutDays: 0 } });
    const res = runBacktest({ def, candlesBySymbol: { TEST: candles } });
    expect(res.ok).toBe(true);
    expect(res.trades.length).toBeGreaterThanOrEqual(1);
    const t = res.trades[0];
    expect(t.exitReason).toBe('stop');
    expect(t.exitPrice).toBeCloseTo(123.5, 2);   // giriş 130 × 0.95
    expect(t.realizedPnL).toBeLessThan(0);
  });

  test('maxPositions=1 ile aynı anda yalnız tek pozisyon', () => {
    const def = baseDef({ sizing: { positionPct: 20, maxPositions: 1, capital: 100000 } });
    // iki sembol aynı anda giriş sinyali verir → biri açılır, diğeri slot dolu diye atlanır
    const series = candlesFrom([...Array(30).fill(10), 13, 14, 15, 16, 17, 18]);
    const res = runBacktest({ def, candlesBySymbol: { AAA: series, BBB: series } });
    expect(res.ok).toBe(true);
    // herhangi bir günde açık pozisyon hiçbir zaman 1’i geçmemeli → en fazla 1 açık-sonu
    expect(res.openAtEnd.length).toBeLessThanOrEqual(1);
  });

  test('veri yetersizse ok:false', () => {
    const res = runBacktest({ def: baseDef(), candlesBySymbol: { TEST: candlesFrom([10, 11, 12]) } });
    expect(res.ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('inMemoryStore — canlı store arayüzü taklidi', () => {
  test('addPosition/findById/listOpen/removePosition akışı', () => {
    const s = createInMemoryStore(50000);
    expect(s.getPortfolio().cash).toBe(50000);
    const p = s.addPosition({ symbol: 'X', status: 'open', shares: 10 });
    expect(s.findById(p.id).symbol).toBe('X');
    expect(s.listOpen().length).toBe(1);
    s.removePosition(p.id);
    expect(s.listOpen().length).toBe(0);
  });
  test('patchTradeById kapalı işlemin tarihini düzeltir', () => {
    const s = createInMemoryStore(1000);
    s.appendTrade({ id: 't1', symbol: 'X', realizedPnL: 5 });
    s.patchTradeById('t1', { exitDate: '2024-05-05T00:00:00.000Z', holdingBars: 3 });
    expect(s.listTradesChrono()[0].holdingBars).toBe(3);
  });
});
