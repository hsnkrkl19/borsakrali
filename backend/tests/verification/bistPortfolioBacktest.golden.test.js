/**
 * GOLDEN TESTS — BIST Portföy backtest replay çekirdeği (SAF, ağ yok).
 * Sentetik sembol/mum/sinyal ile "backtest = canlı motor, geçmişe sarılmış"
 * doğrulaması: AL → yönet → kapat, held-only, para matematiği, metrik raporu.
 */

const bt = require('../../src/services/bistPortfolio/backtest');
const engine = require('../../src/services/bistPortfolio/portfolioEngine');

// n bar, tarihler 2026-01-01..; override ile belirli barı şekillendir
function bars(specs) {
  return specs.map((s, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: s.c, high: s.h ?? s.c, low: s.l ?? s.c, close: s.c, volume: 1000,
  }));
}
const flat = (n, c) => Array.from({ length: n }, () => ({ c }));

const CFG = engine.buildConfig({ key: 'bt', capital: 100000, riskPct: 0.01, maxPositionPct: 0.20, timeoutDays: 100000 });

describe('backtest.replay — sentetik winner + loser', () => {
  // index 5 = giriş günü (2026-01-06). 6. bar (01-07) sonucu belirler.
  // target2 YOK → TP1'de tam kapanır (scale-out devre dışı bu senaryoda)
  const winner = {
    symbol: 'WIN', candles: bars([...flat(6, 100), { c: 118, h: 120, l: 100 }, ...flat(5, 118)]),
    signals: [{ index: 5, entry: 100, stop: 90, target1: 120, target2: null, rr1: 2, confidence: 82, avgVoteScore: 82 }],
  };
  const loser = {
    symbol: 'LOS', candles: bars([...flat(6, 100), { c: 96, h: 100, l: 94 }, ...flat(5, 96)]),
    signals: [{ index: 5, entry: 100, stop: 95, target1: 130, target2: null, rr1: 2, confidence: 78, avgVoteScore: 78 }],
  };

  test('iki pozisyon açılır; biri TP (win), biri STOP (loss)', async () => {
    const sim = await bt.replay([winner, loser], CFG, { capital: 100000 });
    expect(sim.trades.length).toBe(2);
    const reasons = sim.trades.map(t => t.exitReason).sort();
    expect(reasons).toEqual(['stop', 'target']);
    const win = sim.trades.find(t => t.exitReason === 'target');
    const los = sim.trades.find(t => t.exitReason === 'stop');
    expect(win.realizedPnL).toBeGreaterThan(0);
    expect(los.realizedPnL).toBeLessThan(0);
    // equity eğrisi = timeline günü sayısı (01-06..01-12 = 7)
    expect(sim.equityHistory.length).toBe(7);
  });

  test('rapor: metrikler + getiri', async () => {
    const sim = await bt.replay([winner, loser], CFG, { capital: 100000 });
    const rep = await bt.report(sim, CFG);
    expect(rep.closedTrades).toBe(2);
    expect(rep.metrics.closedCount).toBe(2);
    expect(rep.metrics.wins).toBe(1);
    expect(rep.metrics.losses).toBe(1);
    expect(rep.metrics.winRate).toBe(50);
    expect(rep).toHaveProperty('totalReturnPct');
    expect(rep).toHaveProperty('metrics.maxDrawdownPct');
  });

  test('⭐ held-only: sinyali olmayan sembol için hiç işlem yok', async () => {
    // GHOST'un mumu var ama sinyali yok → asla AL, asla SAT
    const ghost = { symbol: 'GHOST', candles: bars([...flat(6, 50), { c: 40, h: 50, l: 38 }, ...flat(5, 40)]), signals: [] };
    const sim = await bt.replay([winner, ghost], CFG, { capital: 100000 });
    expect(sim.trades.every(t => t.symbol !== 'GHOST')).toBe(true);
    expect(sim.trades.some(t => t.symbol === 'WIN')).toBe(true);
  });

  test('boş sinyal seti → boş rapor (patlamaz)', async () => {
    const sim = await bt.replay([{ symbol: 'X', candles: bars(flat(10, 100)), signals: [] }], CFG, { capital: 100000 });
    expect(sim.trades.length).toBe(0);
    expect(sim.equityHistory.length).toBe(0);
  });

  test('SCALE-OUT backtest\'te de aktif: TP2 varsa TP1 yarı satar, kalan koşar', async () => {
    // TP1=110 (01-07 barında), sonra TP2=130 (01-09 barında) → 2 gerçekleşme
    const runner = {
      symbol: 'RUN',
      candles: bars([...flat(6, 100), { c: 112, h: 115, l: 100 }, { c: 120, h: 122, l: 112 }, { c: 128, h: 132, l: 120 }, ...flat(3, 128)]),
      signals: [{ index: 5, entry: 100, stop: 90, target1: 110, target2: 130, rr1: 2, rr2: 4, confidence: 85, avgVoteScore: 85 }],
    };
    const sim = await bt.replay([runner], engine.buildConfig({ key: 'bt', capital: 100000, scaleOut: true, tp1Fraction: 0.5, timeoutDays: 100000 }), { capital: 100000 });
    const partial = sim.trades.find(t => t.exitReason === 'tp1_partial');
    expect(partial).toBeTruthy();                    // TP1'de yarı satıldı
    expect(sim.trades.length).toBe(2);               // TP1 yarı + TP2 kalan
    expect(sim.trades.every(t => t.realizedPnL > 0)).toBe(true);
  });
});
