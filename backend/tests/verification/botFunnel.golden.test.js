'use strict';

/**
 * C1 — bot hunisi sayaçları.
 *
 * 2026-07-31: rapor 36 bot için "işlem yok" dedi; NEDENİ hiçbir yerde yoktu.
 * Huni bu boşluğu kapatır: sinyal → onay/ret(sebep) → dolum → kapanış.
 *
 * Korunan değişmezler:
 *  1. Aynı olgu iki kez sayılmaz (köprü aynı satırı tekrar tekrar POST eder).
 *  2. Geçmiş tarihli kapanış BUGÜNE yazılmaz (7 günlük tekrar penceresi).
 *  3. magic'i olmayan olgu sayaca girmez (sahte bot üretmesin).
 *  4. explain() en erken tıkanan kademeyi söyler.
 */

const funnelSvc = require('../../src/services/botFunnel');

beforeEach(() => funnelSvc.resetForTest());

const DAY_MS = 86400 * 1000;

describe('botFunnel sayaçları', () => {
  test('huni kademeleri bot bazında birikir', () => {
    funnelSvc.noteSignal(5702);
    funnelSvc.noteSignal(5702);
    funnelSvc.noteDecision(5702, true);
    funnelSvc.noteDecision(5702, false, 'risk_budget_too_small');
    funnelSvc.noteFill(5702);
    funnelSvc.noteClose(5702, 102.5);

    const row = funnelSvc.forMagic(5702);
    expect(row).toMatchObject({
      signals: 2, accepted: 1, rejected: 1, filled: 1, closed: 1, wins: 1, losses: 0,
    });
    expect(row.netUsd).toBeCloseTo(102.5, 2);
    expect(row.reasons.risk_budget_too_small).toBe(1);
  });

  test('net kâr/zarar kuruşuna kadar toplanır, kazanç/kayıp ayrılır', () => {
    funnelSvc.noteClose(550055, 13.25);
    funnelSvc.noteClose(550055, -414.9);
    funnelSvc.noteClose(550055, 0);           // başabaş: ne kazanç ne kayıp
    const row = funnelSvc.forMagic(550055);
    expect(row.closed).toBe(3);
    expect(row.wins).toBe(1);
    expect(row.losses).toBe(1);
    expect(row.netUsd).toBeCloseTo(-401.65, 2);
  });

  test('geçmiş tarihli kapanış BUGÜNE yazılmaz', () => {
    const dun = Date.now() - DAY_MS;
    funnelSvc.noteClose(5702, -50, dun);
    funnelSvc.noteClose(5702, 10);

    expect(funnelSvc.forMagic(5702, { days: 1 }).closed).toBe(1);
    expect(funnelSvc.forMagic(5702, { days: 1 }).netUsd).toBeCloseTo(10, 2);
    const iki = funnelSvc.forMagic(5702, { days: 2 });
    expect(iki.closed).toBe(2);
    expect(iki.netUsd).toBeCloseTo(-40, 2);
  });

  test('magic yoksa/geçersizse sayaç oluşmaz (hayalet bot üretmez)', () => {
    funnelSvc.noteSignal(null);
    funnelSvc.noteSignal(0);
    funnelSvc.noteSignal('abc');
    funnelSvc.noteClose(undefined, 100);
    expect(Object.keys(funnelSvc.funnel().bots)).toHaveLength(0);
    expect(funnelSvc.funnel().totals.signals).toBe(0);
  });

  test('sebep sözlüğü sınırsız büyümez', () => {
    for (let i = 0; i < 40; i++) funnelSvc.noteDecision(5702, false, `sebep_${i}`);
    const row = funnelSvc.forMagic(5702);
    expect(row.rejected).toBe(40);
    expect(Object.keys(row.reasons).length).toBeLessThanOrEqual(13); // 12 + "diğer"
    expect(row.reasons['diğer']).toBe(28);
    // Toplam sayım kaybolmaz: her ret bir yere yazılır.
    const toplam = Object.values(row.reasons).reduce((s, n) => s + n, 0);
    expect(toplam).toBe(40);
  });

  test('bilinmeyen bot için sıfırlı satır döner (null değil)', () => {
    const row = funnelSvc.forMagic(999999);
    expect(row).toMatchObject({ signals: 0, accepted: 0, rejected: 0, filled: 0, closed: 0 });
  });

  test('funnel() toplamları bot satırlarıyla tutarlı', () => {
    funnelSvc.noteSignal(5702); funnelSvc.noteSignal(5705);
    funnelSvc.noteClose(5702, 20); funnelSvc.noteClose(5705, -5);
    const f = funnelSvc.funnel();
    expect(f.totals.signals).toBe(2);
    expect(f.totals.closed).toBe(2);
    expect(f.totals.netUsd).toBeCloseTo(15, 2);
    expect(Object.keys(f.bots).sort()).toEqual(['5702', '5705']);
  });
});

describe('explain() — neden sessiz', () => {
  test('hiç sinyal yoksa', () => {
    expect(funnelSvc.explain(funnelSvc.forMagic(5702))).toBe('sinyal üretmedi');
  });

  test('sinyal var ama hepsi reddedildi → en sık sebep yazılır', () => {
    funnelSvc.noteSignal(5702); funnelSvc.noteSignal(5702); funnelSvc.noteSignal(5702);
    funnelSvc.noteDecision(5702, false, 'symbol_not_available');
    funnelSvc.noteDecision(5702, false, 'symbol_not_available');
    funnelSvc.noteDecision(5702, false, 'daily_loss_halt');
    const s = funnelSvc.explain(funnelSvc.forMagic(5702));
    expect(s).toContain('3 sinyal');
    expect(s).toContain('symbol_not_available');
    expect(s).toContain('×2');
  });

  test('emir gitti ama dolum yok', () => {
    funnelSvc.noteSignal(5702);
    funnelSvc.noteDecision(5702, true);
    expect(funnelSvc.explain(funnelSvc.forMagic(5702))).toContain('broker doldurmadı');
  });

  test('pozisyon açık, kapanan yok', () => {
    funnelSvc.noteSignal(5702); funnelSvc.noteDecision(5702, true); funnelSvc.noteFill(5702);
    expect(funnelSvc.explain(funnelSvc.forMagic(5702))).toContain('pozisyon açık');
  });

  test('kapanış varsa isabet yüzdesi yazılır', () => {
    funnelSvc.noteSignal(5702);
    funnelSvc.noteClose(5702, 10); funnelSvc.noteClose(5702, 10);
    funnelSvc.noteClose(5702, -10); funnelSvc.noteClose(5702, -10);
    expect(funnelSvc.explain(funnelSvc.forMagic(5702))).toBe('4 kapanış · %50 isabet');
  });
});

describe('notifier huniyi tekilleştirerek besler', () => {
  const notifier = require('../../src/services/mt5TradeNotifier');
  const nowSec = () => Math.floor(Date.now() / 1000);

  beforeEach(() => { notifier.resetForTest(); funnelSvc.resetForTest(); });

  const openRow = (ticket = '7001') => ({
    ticket, magic: 5702, code: 'PRO-9', symbol: 'EURUSD', direction: 'LONG',
    lot: 0.1, entry: 1.1, sl: 1.09, tp: 1.12, openedSec: nowSec(),
  });

  test('aynı açılış iki kez POST edilse de tek dolum sayılır', async () => {
    await notifier.ingestState({ open: [openRow()] });
    await notifier.ingestState({ open: [openRow()] });
    expect(funnelSvc.forMagic(5702).filled).toBe(1);
  });

  test('aynı kapanış tekrar tekrar POST edilse de tek kapanış sayılır', async () => {
    await notifier.ingestState({ open: [openRow()] });
    const deal = {
      dealTicket: '8001', positionTicket: '7001', magic: 5702, code: 'PRO-9',
      symbol: 'EURUSD', lot: 0.1, exitPrice: 1.11, profit: 10, commission: -1,
      swap: -0.25, fee: -0.5, pnl: 8.25, closedSec: nowSec(), reasonCode: 5,
    };
    await notifier.ingestState({ closed: [deal] });
    await notifier.ingestState({ closed: [deal] });
    await notifier.ingestState({ closed: [deal] });
    const row = funnelSvc.forMagic(5702);
    expect(row.closed).toBe(1);
    expect(row.netUsd).toBeCloseTo(8.25, 2);
  });

  test('aynı beslemedeki aday her turda yeniden sayılmaz', () => {
    const cand = { code: 'PRO-9', magic: 5702, symbol: 'EURUSD', direction: 'LONG', entry: 1.1 };
    notifier.observeCandidates([cand]);
    notifier.observeCandidates([cand]);
    notifier.observeCandidates([cand]);
    expect(funnelSvc.forMagic(5702).signals).toBe(1);
  });

  test('aynı karar tekrar POST edilse de tek ret sayılır', () => {
    const dec = {
      id: 'D-1', code: 'PRO-9', magic: 5702, symbol: 'EURUSD', direction: 'LONG',
      accepted: false, reason: 'risk_budget_too_small',
    };
    notifier.observeDecisions([dec]);
    notifier.observeDecisions([dec]);
    const row = funnelSvc.forMagic(5702);
    expect(row.rejected).toBe(1);
    expect(row.reasons.risk_budget_too_small).toBe(1);
  });
});
