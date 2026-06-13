/**
 * GOLDEN TESTS — botRiskGuard (kill-switch + max-drawdown + günlük-zarar, D5)
 * Saf devre-kesici mantığı; tüm paper botlar bunu yeni giriş öncesi çağırır.
 */
const G = require('../../src/services/botRiskGuard');

describe('drawdownPct / peakEquity', () => {
  test('düşüş yok (equity = peak) → %0', () => {
    expect(G.drawdownPct({ equity: 100, capital: 100, equityHistory: [{ date: 'd', equity: 100 }] })).toBeCloseTo(0, 2);
  });
  test('tepe 120, güncel 90 → %25 düşüş', () => {
    const p = { equity: 90, capital: 100, equityHistory: [{ date: 'a', equity: 100 }, { date: 'b', equity: 120 }] };
    expect(G.drawdownPct(p)).toBeCloseTo(25, 2);
    expect(G.peakEquity(p)).toBe(120);
  });
  test('geçmiş yok → capital/equity baz', () => {
    expect(G.peakEquity({ equity: 100, capital: 100, equityHistory: [] })).toBe(100);
  });
});

describe('shouldHaltEntries', () => {
  test('sağlıklı portföy → halt YOK', () => {
    const r = G.shouldHaltEntries({ tradingEnabled: true, equity: 105, capital: 100, equityHistory: [{ date: 'a', equity: 100 }, { date: 'b', equity: 105 }] }, {});
    expect(r.halt).toBe(false);
    expect(r.reason).toBeNull();
  });
  test('manuel duraklatma → halt (manual_pause)', () => {
    const r = G.shouldHaltEntries({ tradingEnabled: false, haltReason: 'admin_pause', equity: 100, capital: 100, equityHistory: [] }, {});
    expect(r.halt).toBe(true);
    expect(r.reason).toBe('admin_pause');
  });
  test('max-drawdown aşıldı → halt', () => {
    // tepe 100, güncel 70 → %30 ≥ %25
    const r = G.shouldHaltEntries({ tradingEnabled: true, equity: 70, capital: 100, equityHistory: [{ date: 'a', equity: 100 }] }, { maxDrawdownPct: 25 });
    expect(r.halt).toBe(true);
    expect(r.reason).toMatch(/max_drawdown/);
    expect(r.drawdownPct).toBeCloseTo(30, 1);
  });
  test('drawdown sınırın hemen altında → halt YOK', () => {
    // tepe 100, güncel 80 → %20 < %25
    const r = G.shouldHaltEntries({ tradingEnabled: true, equity: 80, capital: 100, equityHistory: [{ date: 'a', equity: 100 }] }, { maxDrawdownPct: 25 });
    expect(r.halt).toBe(false);
  });
  test('günlük zarar limiti aşıldı → halt', () => {
    // bugün -15 P&L, capital 100 → %15 zarar ≥ %10
    const r = G.shouldHaltEntries({ tradingEnabled: true, equity: 95, capital: 100, equityHistory: [{ date: 'a', equity: 100 }] }, { dailyLossLimitPct: 10 }, -15);
    expect(r.halt).toBe(true);
    expect(r.reason).toMatch(/daily_loss/);
    expect(r.dailyLossPct).toBeCloseTo(15, 1);
  });
  test('günlük kâr → halt YOK (dailyLossPct negatif)', () => {
    const r = G.shouldHaltEntries({ tradingEnabled: true, equity: 110, capital: 100, equityHistory: [{ date: 'a', equity: 100 }, { date: 'b', equity: 110 }] }, { dailyLossLimitPct: 10 }, +20);
    expect(r.halt).toBe(false);
  });
});

describe('sumTodayRealizedPnL', () => {
  const trades = [
    { exitDate: '2026-06-13T10:00:00.000Z', realizedPnL: -10 },
    { exitDate: '2026-06-13', realizedPnL: -5 },         // tarih-anahtarı formatı
    { exitDate: '2026-06-12T10:00:00.000Z', realizedPnL: 100 }, // dün → sayılmaz
    { exitAt: '2026-06-13T11:00:00.000Z', realizedPnL: 3 },
  ];
  test('yalnız bugünküleri toplar (ISO + tarih-anahtarı)', () => {
    expect(G.sumTodayRealizedPnL(trades, '2026-06-13')).toBeCloseTo(-12, 2); // -10 -5 +3
  });
  test('boş/null → 0', () => {
    expect(G.sumTodayRealizedPnL(null, '2026-06-13')).toBe(0);
    expect(G.sumTodayRealizedPnL([], '2026-06-13')).toBe(0);
  });
});
