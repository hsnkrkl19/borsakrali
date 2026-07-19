/**
 * GOLDEN TESTS — BIST Portföy Motoru (paylaşımlı, store-parametreli)
 *
 * Saf/yan-etkisiz para matematiği in-memory sahte store ile (diske/Supabase'e
 * DOKUNMAZ). Tüm portföy sanaldır. Odak:
 *   • risk-bazlı boyutlandırma (computeSize) + notional tavanı
 *   • ⭐ "elimde olmayana SAT/STOP olmasın" YAPISAL invaryantı
 *   • gerçekleşen K/Z + nakit korunumu + winRate
 *   • sahte-stop koruması (detectDailyExit) + oluşan-bar düşürme
 *   • strateji SAT (trend kırıldı + nitelik-dışı) — held-only
 *   • cutover idempotency (çift AL yok, çift kapanış yok)
 */

const engine = require('../../src/services/bistPortfolio/portfolioEngine');
const { createInMemoryStore } = require('../../src/services/backtest/inMemoryStore');

const CFG = engine.buildConfig({ key: 'test', capital: 100000, riskPct: 0.01, maxPositionPct: 0.20, maxConcurrent: 10, commissionPct: 0.002, slippagePct: 0.001, timeoutDays: 20, minPositionTL: 100 });

// Kronolojik günlük bar dizisi kurucu (date artan)
function candles(rows, startDay = 1) {
  return rows.map((r, i) => ({
    date: `2026-01-${String(startDay + i).padStart(2, '0')}`,
    open: r.o ?? r.c, high: r.h ?? r.c, low: r.l ?? r.c, close: r.c, volume: r.v ?? 1000,
  }));
}
// Basit düz→düşüş serisi (ema34 hesaplayabilmek için ≥40 bar)
function downSeries(nFlat, base, drop) {
  const rows = [];
  for (let i = 0; i < nFlat; i++) rows.push({ c: base, h: base + 1, l: base - 1 });
  for (let i = 1; i <= drop; i++) { const c = base - i * 2; rows.push({ c, h: c + 1, l: c - 1 }); }
  return candles(rows);
}

const SIG = { symbol: 'AAA', name: 'AAA', direction: 'long', entry: 100, stop: 95, target1: 110, target2: 120, rr1: 2, rr2: 4, avgVoteScore: 85, confidence: 80, precision: 2 };

// ═══════════════════════════════════════════════════════════════════════════
describe('computeSize — risk-bazlı boyut', () => {
  test('normal: efektif risk ≈ sermaye×riskPct, adet tam sayı', () => {
    const s = engine.computeSize(CFG, { entry: 100, stop: 95, cash: 100000, capital: 100000 });
    expect(s.ok).toBe(true);
    expect(Number.isInteger(s.shares)).toBe(true);
    const effectiveRisk = s.shares * (s.fillPrice - 95);
    expect(effectiveRisk).toBeGreaterThan(900);
    expect(effectiveRisk).toBeLessThanOrEqual(1010);   // ~1000 (₺1000 = 1R)
    expect(s.positionSizeTL).toBeLessThanOrEqual(20000); // notional tavanı
  });

  test('dar stop: notional tavanı bağlar → efektif risk %1 altına iner (ihtiyatlı)', () => {
    const s = engine.computeSize(CFG, { entry: 100, stop: 99, cash: 100000, capital: 100000 });
    expect(s.ok).toBe(true);
    expect(s.positionSizeTL).toBeLessThanOrEqual(20000);
    expect(s.positionSizeTL).toBeGreaterThan(19000);    // ~20k tavan
    const effectiveRisk = s.shares * (s.fillPrice - 99);
    expect(effectiveRisk).toBeLessThan(1000);           // tavan → risk<1R
  });

  test('nakit yetersiz → no_cash (adet<1)', () => {
    const s = engine.computeSize(CFG, { entry: 100, stop: 95, cash: 50, capital: 100000 });
    expect(s.ok).toBe(false);
    expect(s.reason).toBe('no_cash');
  });

  test('pozisyon min altında → min_position', () => {
    const tiny = engine.buildConfig({ capital: 100000, maxPositionPct: 0.0006, minPositionTL: 100 });
    const s = engine.computeSize(tiny, { entry: 50, stop: 45, cash: 100000, capital: 100000 });
    expect(s.ok).toBe(false);
    expect(s.reason).toBe('min_position');
  });

  test('geçersiz stop (stop≥giriş) → invalid_stop', () => {
    const s = engine.computeSize(CFG, { entry: 100, stop: 100, cash: 100000, capital: 100000 });
    expect(s.ok).toBe(false);
    expect(s.reason).toBe('invalid_stop');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('openPosition + syncBuys — nakit korunumu + held-guard', () => {
  test('AL nakdi düşer, risk%/ödül% yazılır', () => {
    const store = createInMemoryStore(100000, 'TRY');
    const res = engine.openPosition(store, CFG, SIG);
    expect(res.ok).toBe(true);
    const pf = store.getPortfolio();
    expect(pf.cash).toBeLessThan(100000);
    expect(pf.openCount).toBe(1);
    const pos = store.listOpen()[0];
    expect(pos.riskPct).toBeCloseTo(((pos.entryPrice - 95) / pos.entryPrice) * 100, 1);
    expect(pos.rewardPct).toBeGreaterThan(0);
    expect(pos.ticket).toBe('001');
    // nakit korunumu: nakit + poz.maliyeti + komisyon = 100000
    expect(pf.cash + pos.positionSizeTL + pos.commissionPaid).toBeCloseTo(100000, 2);
  });

  test('syncBuys tutulan sembole İKİNCİ pozisyon açmaz (held-guard)', () => {
    const store = createInMemoryStore(100000, 'TRY');
    const r1 = engine.syncBuys(store, [SIG], CFG);
    expect(r1.opened.length).toBe(1);
    const r2 = engine.syncBuys(store, [SIG], CFG);   // aynı aday tekrar
    expect(r2.opened.length).toBe(0);
    expect(store.listOpen().length).toBe(1);
  });

  test('slot tavanı: maxConcurrent aşılınca yeni AL yok', () => {
    const store = createInMemoryStore(100000, 'TRY');
    const cfg = engine.buildConfig({ capital: 100000, maxConcurrent: 2 });
    const cands = ['AAA', 'BBB', 'CCC'].map((s, i) => ({ ...SIG, symbol: s, name: s, avgVoteScore: 90 - i }));
    const r = engine.syncBuys(store, cands, cfg);
    expect(r.opened.length).toBe(2);
    expect(store.listOpen().length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('⭐ HELD-ONLY invaryantı — elimde olmayana SAT/STOP olmaz', () => {
  test('manageHeld yalnız listOpen() üzerinde döner; tutulmayan sembol için niyet üretmez', async () => {
    const store = createInMemoryStore(100000, 'TRY');
    engine.openPosition(store, CFG, { ...SIG, entry: 100, stop: 95, target1: 110 }, { signalDate: '2026-01-01', entryDate: '2026-01-01T09:00:00.000Z', stopSetDate: '2026-01-01' });
    // BBB tutulmuyor; onun için stop-tetikleyen veri veriyoruz — YİNE DE kapanış olmamalı
    const bbbStopHit = candles([{ c: 100 }, { c: 90, l: 80 }, { c: 85, l: 80 }], 5);
    const aaaHold = candles([{ c: 100 }, { c: 101 }, { c: 102 }], 5);
    const { intents } = await engine.manageHeld(store, CFG, {
      qualifiedSymbols: new Set(['AAA']),
      candlesBySymbol: { AAA: aaaHold, BBB: bbbStopHit },
      now: new Date('2026-02-01T10:00:00+03:00'),
    });
    expect(intents.find(i => i.pos.symbol === 'BBB')).toBeUndefined();  // tutulmayan → asla
    expect(store.listTrades().length).toBe(0);
  });

  test('commitCloses: açık olmayan pozisyon niyeti atlanır (çift kapanış yok)', () => {
    const store = createInMemoryStore(100000, 'TRY');
    const r = engine.openPosition(store, CFG, SIG);
    const pos = r.position;
    const intent = { pos, exitPrice: 110, reason: 'target', exitDate: '2026-01-10' };
    const c1 = engine.commitCloses(store, CFG, [intent]);
    expect(c1.closed.length).toBe(1);
    const c2 = engine.commitCloses(store, CFG, [intent]);   // aynı niyet tekrar
    expect(c2.closed.length).toBe(0);
    expect(store.listTrades().length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('closePosition — gerçekleşen K/Z + nakit korunumu + winRate', () => {
  test('kârlı kapanış: nakit artar, totalRealizedPnL>0, winRate=100', () => {
    const store = createInMemoryStore(100000, 'TRY');
    const { position } = engine.openPosition(store, CFG, SIG);
    const cashAfterOpen = store.getPortfolio().cash;
    const ev = engine.closePosition(store, CFG, position, 120, 'target', 'test');
    expect(ev.realizedPnL).toBeGreaterThan(0);
    const pf = store.getPortfolio();
    expect(pf.cash).toBeGreaterThan(cashAfterOpen);
    expect(pf.totalRealizedPnL).toBeCloseTo(ev.realizedPnL, 2);
    expect(pf.winCount).toBe(1);
    expect(pf.winRate).toBe(100);
    expect(pf.openCount).toBe(0);
    // nakit korunumu: kapanış sonrası nakit = openSonrası + netHasıla
    const exitComm = +(120 * position.shares * CFG.commissionPct).toFixed(2);
    const net = +(120 * position.shares - exitComm).toFixed(2);
    expect(pf.cash).toBeCloseTo(cashAfterOpen + net, 2);
  });

  test('zararlı kapanış: lossCount artar, winRate düşer', () => {
    const store = createInMemoryStore(100000, 'TRY');
    const { position } = engine.openPosition(store, CFG, SIG);
    const ev = engine.closePosition(store, CFG, position, 90, 'stop', 'test');
    expect(ev.realizedPnL).toBeLessThan(0);
    const pf = store.getPortfolio();
    expect(pf.lossCount).toBe(1);
    expect(pf.winRate).toBe(0);
  });

  test('recomputeEquity = nakit + Σ lastPrice×shares', () => {
    const store = createInMemoryStore(100000, 'TRY');
    const { position } = engine.openPosition(store, CFG, SIG);
    store.updatePosition(position.id, { lastPrice: 105 });
    const eq = engine.recomputeEquity(store);
    const pf = store.getPortfolio();
    expect(eq).toBeCloseTo(pf.cash + 105 * position.shares, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('detectDailyExit — sahte-stop koruması', () => {
  const pos = { symbol: 'AAA', entryPrice: 100, currentStop: 90, currentTarget: 120, signalDate: '2026-01-01', entryDate: '2026-01-01', stopSetDate: '2026-01-01', precision: 2 };
  const NOEXP = engine.buildConfig({ timeoutDays: 100000 });   // timeout'u devre dışı bırak (stop mantığını izole et)

  test('bant-dışı (±%20) bozuk low reddedilir → stop yok', () => {
    const cs = candles([{ c: 100 }, { c: 100, l: 50 }, { c: 100, l: 99 }], 2); // 50 = önceki kapanış*0.5 (bozuk)
    const ev = engine.detectDailyExit(pos, cs, NOEXP, { now: new Date('2026-02-01') });
    expect(ev.hit).toBeNull();
  });

  test('geçerli low ≤ stop → stop tetiklenir', () => {
    const cs = candles([{ c: 100 }, { c: 92, l: 88 }], 2);   // 88, önceki 100 → banttan (−12%) OK, ≤90
    const ev = engine.detectDailyExit(pos, cs, CFG, { now: new Date('2026-02-01') });
    expect(ev.hit).toBe('stop');
    expect(ev.exitPrice).toBe(90);
  });

  test('giriş günü + öncesi yok sayılır', () => {
    const cs = candles([{ c: 100, l: 80 }], 1); // date 2026-01-01 = issueDate → atlanır
    const ev = engine.detectDailyExit(pos, cs, CFG, { now: new Date('2026-01-05') });
    expect(ev.hit).toBeNull();
  });

  test('ileri-yönlü stop: stopSetDate sonrası tetikler, öncesi değil', () => {
    const p2 = { ...pos, currentStop: 95, stopSetDate: '2026-01-05' };
    const cs = candles([{ c: 100 }, { c: 100, l: 94 }, { c: 100, l: 99 }], 3); // 2026-01-02 low94≤95 ama tarih<stopSetDate
    const ev = engine.detectDailyExit(p2, cs, NOEXP, { now: new Date('2026-02-01') });
    expect(ev.hit).toBeNull();   // 94 tarihli bar stopSetDate öncesi → yok sayılır
  });

  test('aynı barda SL ve TP → ihtiyatlı SL', () => {
    const cs = candles([{ c: 100 }, { c: 100, l: 88, h: 125 }], 2);
    const ev = engine.detectDailyExit(pos, cs, CFG, { now: new Date('2026-02-01') });
    expect(ev.hit).toBe('stop');
  });

  test('timeout: yaş > timeoutDays → son kapanışla kapanır', () => {
    const p3 = { ...pos, currentStop: 1, currentTarget: 9999, entryDate: '2026-01-01' };
    const cs = candles([{ c: 100 }, { c: 105 }], 2);
    const ev = engine.detectDailyExit(p3, cs, engine.buildConfig({ timeoutDays: 5 }), { now: new Date('2026-01-20') });
    expect(ev.hit).toBe('timeout');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('completedCandles — oluşan (yarım) bar düşürme', () => {
  test('bugünkü bar borsa kapanmadan düşer', () => {
    const now = new Date('2026-01-15T10:00:00+03:00'); // İstanbul 10:00 (<18:05)
    const cs = candles([{ c: 100 }, { c: 101 }], 14); // ...-01-14, -01-15
    const out = engine.completedCandles(cs, now);
    expect(out.length).toBe(1); // son (2026-01-15) düşer
  });

  test('geçmiş tarihli seride hiçbir şey düşmez', () => {
    const now = new Date('2026-02-01T10:00:00+03:00');
    const cs = candles([{ c: 100 }, { c: 101 }], 14);
    expect(engine.completedCandles(cs, now).length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('manageHeld — strateji SAT (trend kırıldı + nitelik-dışı, held-only)', () => {
  // signalDate Ocak barlarının SONRASI → hiçbir bar stop/tp için değerlendirilmez
  // (fiyat-tetikli çıkışı izole et); timeout devre dışı → yalnız strateji SAT ölçülür.
  const SELLCFG = engine.buildConfig({ timeoutDays: 100000 });
  const OPEN_OVR = { signalDate: '2026-02-01', entryDate: '2026-02-01T09:00:00.000Z', stopSetDate: '2026-02-01' };

  test('nitelik-dışı + close<EMA34 → signal_exit niyeti', async () => {
    const store = createInMemoryStore(100000, 'TRY');
    engine.openPosition(store, SELLCFG, { ...SIG, entry: 100, stop: 80, target1: 200 }, OPEN_OVR);
    const cs = downSeries(35, 100, 10); // uzun düz sonra düşüş → son kapanış EMA34 altında
    const { intents } = await engine.manageHeld(store, SELLCFG, {
      qualifiedSymbols: new Set([]),            // AAA nitelik-dışı
      candlesBySymbol: { AAA: cs },
      now: new Date('2026-03-01T10:00:00+03:00'),
    });
    const sell = intents.find(i => i.pos.symbol === 'AAA' && i.reason === 'signal_exit');
    expect(sell).toBeTruthy();
  });

  test('hâlâ nitelikliyken SAT olmaz (tutulur)', async () => {
    const store = createInMemoryStore(100000, 'TRY');
    engine.openPosition(store, SELLCFG, { ...SIG, entry: 100, stop: 80, target1: 200 }, OPEN_OVR);
    const cs = downSeries(35, 100, 10);
    const { intents } = await engine.manageHeld(store, SELLCFG, {
      qualifiedSymbols: new Set(['AAA']),       // hâlâ nitelikli
      candlesBySymbol: { AAA: cs },
      now: new Date('2026-03-01T10:00:00+03:00'),
    });
    expect(intents.find(i => i.reason === 'signal_exit')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('cutover — idempotency', () => {
  test('iki kez syncBuys → bir kez açar; teslim tekrarında çift trade yok', () => {
    const store = createInMemoryStore(100000, 'TRY');
    engine.syncBuys(store, [SIG], CFG);
    engine.syncBuys(store, [SIG], CFG);
    expect(store.listOpen().length).toBe(1);
    const pos = store.listOpen()[0];
    engine.commitCloses(store, CFG, [{ pos, exitPrice: 110, reason: 'target' }]);
    engine.commitCloses(store, CFG, [{ pos, exitPrice: 110, reason: 'target' }]);
    expect(store.listTrades().length).toBe(1);
  });
});
