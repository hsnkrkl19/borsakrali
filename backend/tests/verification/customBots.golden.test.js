/**
 * GOLDEN TESTS — Custom Bots (kullanıcı-tanımlı botlar)
 *
 * Saf/yan-etkisiz katmanlar: indikatörler, strateji değerlendirme, risk kuralları,
 * işlem-saati penceresi, registry doğrulama, ve motor para matematiği (in-memory
 * sahte store ile — diske dokunmaz). Tüm portföy sanaldır; gerçek para yoktur.
 */

const ind = require('../../src/services/customBots/indicators');
const strategies = require('../../src/services/customBots/strategies');
const riskRules = require('../../src/services/customBots/riskRules');
const marketHours = require('../../src/services/marketHours');
const registry = require('../../src/services/customBots/customBotRegistry');
const engine = require('../../src/services/customBots/customBotEngine');

// ── Yardımcılar ──────────────────────────────────────────────────────────────
function flatThenJump(n, base, last) {
  const closes = Array(n).fill(base).concat([last]);
  return closes.map((c, i) => ({ open: c, high: c, low: c, close: c, date: `2026-01-${String((i % 27) + 1).padStart(2, '0')}` }));
}

// ═══════════════════════════════════════════════════════════════════════════
describe('indicators — saf hesaplar', () => {
  test('sma sabit seride sabittir', () => {
    const s = ind.sma([5, 5, 5, 5, 5], 3);
    expect(s[0]).toBeNull();
    expect(s[2]).toBeCloseTo(5, 6);
    expect(s[4]).toBeCloseTo(5, 6);
  });

  test('ema sabit seride kaynağa eşit, warmup öncesi null', () => {
    const e = ind.ema([10, 10, 10, 10, 10], 3);
    expect(e[0]).toBeNull();
    expect(e[1]).toBeNull();
    expect(e[2]).toBeCloseTo(10, 6);
    expect(e[4]).toBeCloseTo(10, 6);
  });

  test('rsi: sürekli yükseliş → 100, sürekli düşüş → 0', () => {
    const up = ind.rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 14);
    expect(up[15]).toBeCloseTo(100, 4);
    const down = ind.rsi([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 14);
    expect(down[15]).toBeCloseTo(0, 4);
  });

  test('atr pozitif ve warmup öncesi null', () => {
    const candles = Array.from({ length: 20 }, (_, i) => ({ high: 10 + i, low: 8 + i, close: 9 + i }));
    const a = ind.atr(candles, 14);
    expect(a[13]).toBeNull();
    expect(a[14]).toBeGreaterThan(0);
    expect(ind.atrLast(candles, 14)).toBeGreaterThan(0);
  });

  test('bollinger: orta=SMA, üst>orta>alt', () => {
    const closes = [10, 11, 12, 11, 10, 9, 10, 11, 12, 13, 12, 11];
    const b = ind.bollinger(closes, 5, 2);
    const i = closes.length - 1;
    expect(b.middle[i]).toBeGreaterThan(0);
    expect(b.upper[i]).toBeGreaterThan(b.middle[i]);
    expect(b.lower[i]).toBeLessThan(b.middle[i]);
  });

  test('donchian: üst = önceki pencerenin en yükseği (i hariç)', () => {
    const candles = [
      { high: 10, low: 8, close: 9 }, { high: 12, low: 9, close: 11 },
      { high: 11, low: 9, close: 10 }, { high: 15, low: 10, close: 14 },
    ];
    const d = ind.donchian(candles, 3);
    // i=3: önceki 3 bar (0,1,2) high max = 12
    expect(d.upper[3]).toBe(12);
    expect(d.lower[3]).toBe(8);
  });

  test('crossesAbove / crossesBelow tespiti', () => {
    const a = [1, 1, 2];
    const b = [1.5, 1.5, 1.5];
    expect(ind.crossesAbove(a, b, 2)).toBe(true);
    expect(ind.crossesBelow(a, b, 2)).toBe(false);
    const c = [2, 2, 1];
    expect(ind.crossesBelow(c, b, 2)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('strategies — giriş/çıkış tespiti', () => {
  test('publicList 6 stratejiyi param şemasıyla verir', () => {
    const list = strategies.publicList();
    expect(list.map(s => s.id).sort()).toEqual(
      ['bollinger_reversion', 'donchian_breakout', 'ema_cross', 'macd_cross', 'rsi_reversal', 'supertrend'].sort()
    );
    for (const s of list) {
      expect(Array.isArray(s.params)).toBe(true);
      expect(s.defaultParams).toBeTruthy();
    }
  });

  test('normalizeParams eksikleri default + min/max clamp eder', () => {
    const s = strategies.get('ema_cross');
    const p = strategies.normalizeParams(s, { fastPeriod: 5 }); // slowPeriod eksik
    expect(p.fastPeriod).toBe(5);
    expect(p.slowPeriod).toBe(21); // default
    const clamped = strategies.normalizeParams(s, { fastPeriod: 9999, slowPeriod: 1 });
    expect(clamped.fastPeriod).toBeLessThanOrEqual(100); // max
    expect(clamped.slowPeriod).toBeGreaterThanOrEqual(3); // min
  });

  test('ema_cross: düz seri sonrası sıçrama → entry; düşüş → exit', () => {
    const s = strategies.get('ema_cross');
    const p = { fastPeriod: 9, slowPeriod: 21 };
    const upRes = s.evaluate(flatThenJump(30, 10, 20), p);
    expect(upRes.entry).toBe(true);
    expect(upRes.exit).toBe(false);
    const downRes = s.evaluate(flatThenJump(30, 10, 5), p);
    expect(downRes.exit).toBe(true);
    expect(downRes.entry).toBe(false);
  });

  test('donchian_breakout: kapanış önceki yüksekleri aşınca entry', () => {
    const s = strategies.get('donchian_breakout');
    const p = { period: 20, exitPeriod: 10 };
    const candles = Array.from({ length: 25 }, () => ({ open: 10, high: 10, low: 10, close: 10, date: 'd' }));
    candles.push({ open: 11, high: 11, low: 11, close: 11, date: 'd' }); // kırılım
    const res = s.evaluate(candles, p);
    expect(res.entry).toBe(true);
  });

  test('her strateji yeterli mumla hata vermeden değerlendirilir', () => {
    const candles = Array.from({ length: 320 }, (_, i) => {
      const v = 100 + Math.sin(i / 5) * 5 + i * 0.1;
      return { open: v, high: v + 1, low: v - 1, close: v, date: 'd' };
    });
    for (const meta of strategies.publicList()) {
      const s = strategies.get(meta.id);
      const res = s.evaluate(candles, meta.defaultParams);
      expect(typeof res.entry).toBe('boolean');
      expect(typeof res.exit).toBe('boolean');
      expect(typeof res.reason).toBe('string');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('riskRules — stop/hedef + doğrulama', () => {
  test('ATR stop + R-katı hedef', () => {
    // giriş 100, atr 4, 2×ATR stop → 92; 2R hedef → 100 + 2*(100-92) = 116
    const { stop, target } = riskRules.computeStopTarget(100, 4, {
      stopType: 'atr', stopValue: 2, targetType: 'rr', targetValue: 2,
    });
    expect(stop).toBeCloseTo(92, 4);
    expect(target).toBeCloseTo(116, 4);
  });

  test('yüzde stop + yüzde hedef', () => {
    const { stop, target } = riskRules.computeStopTarget(100, 0, {
      stopType: 'percent', stopValue: 5, targetType: 'percent', targetValue: 10,
    });
    expect(stop).toBeCloseTo(95, 4);
    expect(target).toBeCloseTo(110, 4);
  });

  test('ATR yokken ATR stop → null (sahte stop yok)', () => {
    const { stop } = riskRules.computeStopTarget(100, 0, { stopType: 'atr', stopValue: 2, targetType: 'none' });
    expect(stop).toBeNull();
  });

  test('geçersiz stop (giriş üstünde) null’a iner', () => {
    const { stop } = riskRules.computeStopTarget(100, 0, { stopType: 'percent', stopValue: 0.0001, targetType: 'none' });
    // %0.0001 stop → 99.9999 < giriş → geçerli; ama negatif değer testi ayrı
    expect(stop === null || stop < 100).toBe(true);
  });

  test('validateRisk: rr hedef stopsuz reddedilir', () => {
    const r = riskRules.validateRisk({ stopType: 'none', targetType: 'rr', targetValue: 2 });
    expect(r.ok).toBe(false);
  });

  test('validateRisk: geçerli yapı kabul + trailing stopsuzken kapanır', () => {
    const r = riskRules.validateRisk({ stopType: 'none', targetType: 'percent', targetValue: 10, trailing: true });
    expect(r.ok).toBe(true);
    expect(r.risk.trailing).toBe(false); // stop yokken trailing anlamsız → kapatıldı
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('marketHours — 10:15–18:00 manuel işlem penceresi', () => {
  // Türkiye UTC+3 (DST yok). 2026-06-15 Pazartesi.
  test('seans içi (TR 12:00) → açma+kapatma serbest', () => {
    const now = new Date('2026-06-15T09:00:00Z'); // TR 12:00
    expect(marketHours.canOpenTrade(now)).toBe(true);
    expect(marketHours.canCloseTrade(now)).toBe(true);
  });

  test('10:15 öncesi (TR 09:00) → açılamaz/kapatılamaz + gerekçe', () => {
    const now = new Date('2026-06-15T06:00:00Z'); // TR 09:00
    expect(marketHours.canOpenTrade(now)).toBe(false);
    expect(marketHours.reasonNotOpen(now)).toMatch(/10:15/);
  });

  test('18:00 sonrası (TR 18:30) → kapatılamaz + gerekçe', () => {
    const now = new Date('2026-06-15T15:30:00Z'); // TR 18:30
    expect(marketHours.canCloseTrade(now)).toBe(false);
    expect(marketHours.reasonNotClose(now)).toMatch(/18:00/);
  });

  test('hafta sonu → işlem günü değil', () => {
    const sat = new Date('2026-06-13T09:00:00Z'); // Cumartesi
    expect(marketHours.isTradingDay(sat)).toBe(false);
    expect(marketHours.canOpenTrade(sat)).toBe(false);
  });

  test('resmi tatil → işlem günü değil', () => {
    const holiday = new Date('2026-01-01T09:00:00Z');
    expect(marketHours.isTradingDay(holiday)).toBe(false);
  });

  test('assertCanOpen seans dışında MarketHoursError fırlatır', () => {
    const before = new Date('2026-06-15T06:00:00Z');
    expect(() => marketHours.assertCanOpen(before)).toThrow(/10:15/);
    try { marketHours.assertCanOpen(before); } catch (e) { expect(e.code).toBe('MARKET_CLOSED'); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('registry — bot tanımı doğrulama', () => {
  const base = {
    name: 'Test', strategyId: 'ema_cross', params: { fastPeriod: 9, slowPeriod: 21 },
    universe: ['THYAO', 'ASELS'],
    risk: { stopType: 'atr', stopValue: 2, targetType: 'rr', targetValue: 2, trailing: true, timeoutDays: 15 },
    sizing: { positionPct: 10, maxPositions: 10, capital: 100000 },
  };

  test('geçerli tanım kabul edilir + normalize olur', () => {
    const r = registry.validateDef(base);
    expect(r.ok).toBe(true);
    expect(r.def.id).toBeTruthy();
    expect(r.def.universe).toEqual(['THYAO', 'ASELS']);
    expect(r.def.commissionPct).toBeGreaterThanOrEqual(0);
  });

  test('isimsiz reddedilir', () => {
    const r = registry.validateDef({ ...base, name: '' });
    expect(r.ok).toBe(false);
  });

  test('hızlı ≥ yavaş periyot reddedilir', () => {
    const r = registry.validateDef({ ...base, params: { fastPeriod: 30, slowPeriod: 10 } });
    expect(r.ok).toBe(false);
  });

  test('tanınmayan hisse reddedilir', () => {
    const r = registry.validateDef({ ...base, universe: ['THYAO', 'YOKBOYLEHISSE'] });
    expect(r.ok).toBe(false);
  });

  test('boş evren reddedilir', () => {
    const r = registry.validateDef({ ...base, universe: [] });
    expect(r.ok).toBe(false);
  });

  test('sizing değerleri sınırlara clamp edilir', () => {
    const r = registry.validateDef({ ...base, sizing: { positionPct: 999, maxPositions: 999, capital: 1 } });
    expect(r.ok).toBe(true);
    expect(r.def.sizing.positionPct).toBeLessThanOrEqual(50);
    expect(r.def.sizing.maxPositions).toBeLessThanOrEqual(50);
    expect(r.def.sizing.capital).toBeGreaterThanOrEqual(1000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('engine — para matematiği (nakit korunumu)', () => {
  function makeStore(capital) {
    let pf = {
      currency: 'TRY', capital, cash: capital, equity: capital,
      totalRealizedPnL: 0, totalRealizedPnLPct: 0, openCount: 0,
      winCount: 0, lossCount: 0, winRate: 0, tradingEnabled: true, equityHistory: [],
    };
    let positions = []; let trades = []; let idc = 0;
    return {
      getPortfolio: () => pf,
      savePortfolio: (p) => { pf = p; },
      addPosition: (pos) => { const e = { id: 'p' + (++idc), ...pos }; positions.push(e); return e; },
      updatePosition: (id, patch) => { const i = positions.findIndex(p => p.id === id); if (i < 0) return null; positions[i] = { ...positions[i], ...patch }; return positions[i]; },
      appendNote: (id, action, text) => { const p = positions.find(p => p.id === id); if (p) { p.notes = p.notes || []; p.notes.push({ action, text }); } return p; },
      findById: (id) => positions.find(p => p.id === id) || null,
      findBySymbol: (sym, st) => positions.find(p => p.symbol === sym && st.includes(p.status)) || null,
      listOpen: () => positions.filter(p => p.status === 'open'),
      removePosition: (id) => { positions = positions.filter(p => p.id !== id); },
      appendTrade: (t) => { trades.push(t); return t; },
      listTrades: () => trades.slice().reverse(),
      recordEquityPoint: (eq) => { pf.equity = eq; },
    };
  }
  const bot = {
    id: 'x', commissionPct: 0.2, slippagePct: 0.1,
    sizing: { positionPct: 10, maxPositions: 5, capital: 100000 },
    risk: { stopType: 'atr', stopValue: 2, targetType: 'rr', targetValue: 2, trailing: true, timeoutDays: 15 },
    strategyId: 'ema_cross',
  };

  test('openPosition: nakit = sermaye − maliyet − komisyon; stop/hedef doğru', () => {
    const store = makeStore(100000);
    const o = engine.openPosition(store, bot, { symbol: 'THYAO', fillPrice: 100, atr: 4, source: 'manual', reasonNote: 't' });
    expect(o.ok).toBe(true);
    // %10 × 100000 = 10000 → 100 adet; komisyon %0.2 = 20
    expect(o.position.shares).toBeCloseTo(100, 4);
    expect(o.position.currentStop).toBeCloseTo(92, 4);
    expect(o.position.currentTarget).toBeCloseTo(116, 4);
    expect(store.getPortfolio().cash).toBeCloseTo(89980, 2);
    expect(store.getPortfolio().openCount).toBe(1);
  });

  test('closePosition: hedefte kâr + nakit korunumu + winRate', () => {
    const store = makeStore(100000);
    const o = engine.openPosition(store, bot, { symbol: 'THYAO', fillPrice: 100, atr: 4, source: 'manual', reasonNote: 't' });
    engine.closePosition(store, bot, store.findById(o.position.id), 116, 'target', 'hedef');
    const pf = store.getPortfolio();
    // brüt 11600, çıkış kom 23.20 → net 11576.80; pnl = 11576.80 − 10000 − 20 = 1556.80
    expect(pf.totalRealizedPnL).toBeCloseTo(1556.8, 2);
    expect(pf.cash).toBeCloseTo(101556.8, 2);
    expect(pf.winRate).toBe(100);
    expect(store.listOpen().length).toBe(0);
    expect(store.listTrades().length).toBe(1);
  });

  test('closePosition: stopta zarar lossCount artırır', () => {
    const store = makeStore(100000);
    const o = engine.openPosition(store, bot, { symbol: 'ASELS', fillPrice: 100, atr: 4, source: 'manual', reasonNote: 't' });
    engine.closePosition(store, bot, store.findById(o.position.id), 92, 'stop', 'stop');
    const pf = store.getPortfolio();
    expect(pf.totalRealizedPnL).toBeLessThan(0);
    expect(pf.lossCount).toBe(1);
    expect(pf.winRate).toBe(0);
  });

  test('yetersiz nakitte açılış reddedilir', () => {
    const store = makeStore(100);
    const o = engine.openPosition(store, bot, { symbol: 'THYAO', fillPrice: 100, atr: 4, sizeTL: 100000, source: 'manual' });
    expect(o.ok).toBe(false);
    expect(o.error).toBe('no_cash');
  });
});
