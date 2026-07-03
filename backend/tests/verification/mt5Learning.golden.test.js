/**
 * GOLDEN TESTS — MT5 gün-içi ÖĞRENME katmanı (mt5Learning + tracker/notifier entegrasyonu).
 *
 * Kapsam:
 *   1) Devre kesici: n>=12, son 20'de toplam R <= -3 ve PF < 0.85 → GÖLGE modu.
 *   2) Geri açılma: gölgede n>=10, toplam R > 0, PF >= 1.05 → GERÇEK modu
 *      (hedef pencere sıfırlanır — eski kayıp serisi anında tekrar kapatamaz).
 *   3) Risk çarpanı bantları: kanıtla x1.5 / x0.75; kanıtsız (n<15) hep 1.0.
 *   4) Kill-switch: MT5_LEARNING_DISABLED=1 → mod hep 'real', çarpan hep 1.0.
 *   5) Tracker entegrasyonu: gölge pozisyon bütçe TÜKETMEZ, getOpen'da (köprü
 *      beslemesi) GÖRÜNMEZ, gün sayaçlarına yazmaz; kapanışı sayaçları bozmaz;
 *      gölge yön kilidi gerçek pozisyonu bloklamaz.
 *   6) R-katsayısı: kapanış kaydında rMultiple = pnlUsd/riskUsd.
 *   7) Notifier: gölge açılış push edilmez (Telegram/app çağrılmaz).
 *
 * Ağ yok: forexKlines/telegram/push/botPersistence mock. Zaman: MT5_FAKE_TR_MIN.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mt5-learning-'));
process.env.BOT_DATA_DIR = TMP;
process.env.MT5_FAKE_TR_MIN = String(14 * 60); // 14:00 TR — pencere AÇIK
delete process.env.MT5_RESET;
delete process.env.MT5_LEARNING_DISABLED;

jest.mock('../../src/services/botPersistence', () => ({
  save: () => {},
  loadAll: async () => {},
}));
const mockTgSend = jest.fn(async () => ({ success: true, messageId: 1 }));
jest.mock('../../src/services/telegramService', () => ({
  sendMessage: (...args) => mockTgSend(...args),
}));
const mockAppPush = jest.fn(async () => ({ success: true }));
jest.mock('../../src/services/pushNotificationService', () => ({
  sendToUser: (...args) => mockAppPush(...args),
}));
let mockCandles = [];
jest.mock('../../src/services/forex/forexKlines', () => ({
  fetchCandles: async () => mockCandles,
}));

const nowSec = () => Math.floor(Date.now() / 1000);

function resetDisk() {
  try { fs.rmSync(path.join(TMP, 'mt5-scanner'), { recursive: true, force: true }); } catch (_) {}
}

function fresh() {
  jest.resetModules();
  resetDisk();
  return {
    learning: require('../../src/services/mt5Scanner/mt5Learning'),
    tracker: require('../../src/services/mt5Scanner/mt5Tracker'),
    notifier: require('../../src/services/mt5Scanner/mt5Notifier'),
    levels: require('../../src/services/mt5Scanner/mt5Levels'),
    getInstrument: require('../../src/services/mt5Scanner/mt5Instruments').getInstrument,
    computeSizing: require('../../src/services/forex/riskSizing').computeSizing,
  };
}

function ev(over = {}) {
  return {
    instrumentId: 'XAUUSD', tf: '15m', outcome: 'SL',
    pnlUsd: -100, riskUsd: 100, rMultiple: -1, shadow: false,
    exitTimeSec: nowSec(), ...over,
  };
}
const loseEv = (o = {}) => ev({ outcome: 'SL', pnlUsd: -100, rMultiple: -1, ...o });
const winEv = (o = {}) => ev({ outcome: 'TP1', pnlUsd: 100, rMultiple: 1, ...o });

function makeSignal(m, over = {}) {
  const inst = m.getInstrument(over.id || 'XAUUSD');
  const entry = over.entry ?? 4000;
  const stop = over.stop ?? 3980;
  const raw = m.computeSizing(
    { instrument: inst, entry, stop, direction: over.direction || 'long' },
    { equity: over.equity || 10000, riskPerTradePct: 0.01 }
  );
  const sizing = m.levels.snapSizingToBroker(raw, inst, entry, stop, { maxRiskUsd: (over.equity || 10000) * 0.05 });
  const t1 = over.target1 ?? 4020, t2 = over.target2 ?? 4035;
  return {
    id: inst.id, symbol: inst.symbol, tf: over.tf || '15m', direction: over.direction || 'long',
    precision: inst.precision, entry, stop, target1: t1, target2: t2,
    confidence: over.confidence ?? 70, rr1: 1.0, grade: 'GUCLU',
    sizing, pnl: m.levels.buildPnL(sizing.units, entry, { stop, target1: t1, target2: t2 }),
    mt5: m.levels.buildMt5(inst, over.direction || 'long', sizing.lots, { entry, stop, target1: t1, target2: t2 }, over.tf || '15m', inst.precision),
  };
}

afterEach(() => {
  delete process.env.MT5_LEARNING_DISABLED;
  delete process.env.TELEGRAM_MT5_CHANNEL;
  process.env.MT5_FAKE_TR_MIN = String(14 * 60);
  mockCandles = [];
});

// ── 1) Devre kesici ─────────────────────────────────────────────────────────
describe('mt5Learning — devre kesici', () => {
  test('12 gerçek kayıp → kombo GÖLGE moduna geçer, karar loglanır', () => {
    const m = fresh();
    for (let i = 0; i < 11; i++) m.learning.recordClose(loseEv());
    expect(m.learning.modeFor('XAUUSD', '15m')).toBe('real');   // n=11 < 12 — henüz değil
    m.learning.recordClose(loseEv());
    expect(m.learning.modeFor('XAUUSD', '15m')).toBe('shadow');
    const dec = m.learning.recentDecisions(1);
    expect(dec.length).toBe(1);
    expect(dec[0].to).toBe('shadow');
  });

  test('kayıp az ise (sumR > -3) kesilmez', () => {
    const m = fresh();
    // 12 işlem: 6 kazanç +1, 6 kayıp -1.2 → sumR = -1.2 > -3 → devre kesilmez
    for (let i = 0; i < 6; i++) {
      m.learning.recordClose(winEv());
      m.learning.recordClose(loseEv({ pnlUsd: -120, rMultiple: -1.2 }));
    }
    expect(m.learning.modeFor('XAUUSD', '15m')).toBe('real');
  });

  test('kombolar bağımsız: XAUUSD:15m gölgeyken BTCUSD:1h gerçek kalır', () => {
    const m = fresh();
    for (let i = 0; i < 12; i++) m.learning.recordClose(loseEv());
    expect(m.learning.modeFor('XAUUSD', '15m')).toBe('shadow');
    expect(m.learning.modeFor('BTCUSD', '1h')).toBe('real');
    expect(m.learning.modeFor('XAUUSD', '1h')).toBe('real');
  });
});

// ── 2) Gölgeden geri açılma ─────────────────────────────────────────────────
describe('mt5Learning — gölgeden geri açılma', () => {
  test('gölgede 10 kapanış, +R ve PF>=1.05 → gerçeğe döner; taze pencereyle', () => {
    const m = fresh();
    for (let i = 0; i < 12; i++) m.learning.recordClose(loseEv());
    expect(m.learning.modeFor('XAUUSD', '15m')).toBe('shadow');
    // gölge izleme: 7 kazanç, 3 kayıp → sumR = +4, PF 2.33
    for (let i = 0; i < 7; i++) m.learning.recordClose(winEv({ shadow: true }));
    for (let i = 0; i < 3; i++) m.learning.recordClose(loseEv({ shadow: true }));
    expect(m.learning.modeFor('XAUUSD', '15m')).toBe('real');
    // eski 12 kayıp temizlendi — bir sonraki tek kayıp anında tekrar KAPATMAZ
    m.learning.recordClose(loseEv());
    expect(m.learning.modeFor('XAUUSD', '15m')).toBe('real');
  });

  test('gölge toparlanamazsa gölgede kalır', () => {
    const m = fresh();
    for (let i = 0; i < 12; i++) m.learning.recordClose(loseEv());
    for (let i = 0; i < 10; i++) m.learning.recordClose(loseEv({ shadow: true }));
    expect(m.learning.modeFor('XAUUSD', '15m')).toBe('shadow');
  });
});

// ── 3) Risk çarpanı ─────────────────────────────────────────────────────────
describe('mt5Learning — risk çarpanı', () => {
  test('15 kazançlı işlem kanıtı → x1.5 (tavan)', () => {
    const m = fresh();
    for (let i = 0; i < 15; i++) m.learning.recordClose(winEv());
    expect(m.learning.riskMultFor('XAUUSD', '15m')).toBe(1.5);
  });

  test('PF < 1.0 (ama devre kesilmemiş) → x0.75', () => {
    const m = fresh();
    // 17 işlem sıralı l,w,... : 9 kayıp -1.1, 8 kazanç +1 → sumR -1.9 > -3, PF 0.81
    for (let i = 0; i < 9; i++) {
      m.learning.recordClose(loseEv({ pnlUsd: -110, rMultiple: -1.1 }));
      if (i < 8) m.learning.recordClose(winEv());
    }
    expect(m.learning.modeFor('XAUUSD', '15m')).toBe('real');
    expect(m.learning.riskMultFor('XAUUSD', '15m')).toBe(0.75);
  });

  test('kanıt yetersiz (n<15) → çarpan 1.0, seri ne kadar iyi olursa olsun', () => {
    const m = fresh();
    for (let i = 0; i < 14; i++) m.learning.recordClose(winEv({ rMultiple: 2 }));
    expect(m.learning.riskMultFor('XAUUSD', '15m')).toBe(1);
  });
});

// ── 4) Kill-switch ──────────────────────────────────────────────────────────
describe('mt5Learning — kill-switch', () => {
  test('MT5_LEARNING_DISABLED=1 → mod hep real, çarpan hep 1 (kayıt sürer)', () => {
    const m = fresh();
    process.env.MT5_LEARNING_DISABLED = '1';
    for (let i = 0; i < 20; i++) m.learning.recordClose(loseEv());
    expect(m.learning.modeFor('XAUUSD', '15m')).toBe('real');
    expect(m.learning.riskMultFor('XAUUSD', '15m')).toBe(1);
    // gözlem sürüyor: istatistik birikti ama eylem yok
    expect(m.learning.summary().combos['XAUUSD:15m'].real.n).toBe(20);
  });
});

// ── 5) Tracker entegrasyonu: gölge evreni ───────────────────────────────────
describe('mt5Tracker + learning — gölge pozisyonlar', () => {
  test('gölge açılış: bütçe tüketmez, köprü beslemesinde görünmez, sayaçlara yazmaz', async () => {
    const m = fresh();
    for (let i = 0; i < 12; i++) m.learning.recordClose(loseEv());   // XAUUSD:15m → gölge
    await m.tracker.load();
    const res = await m.tracker.openPosition(makeSignal(m), 10000);
    expect(res.ok).toBe(true);
    expect(res.position.shadow).toBe(true);
    expect(m.tracker.budget(10000).openRiskUsd).toBe(0);            // bütçe dokunulmadı
    expect(m.tracker.getOpen().length).toBe(0);                      // köprü beslemesi BOŞ
    expect(m.tracker.getOpenShadow().length).toBe(1);
    expect(m.tracker.getDayStats().opened).toBe(0);
    expect(m.tracker.getDayStats().shadowOpened).toBe(1);
  });

  test('gölge yön kilidi gerçek pozisyonu BLOKLAMAZ (ayrı evrenler)', async () => {
    const m = fresh();
    for (let i = 0; i < 12; i++) m.learning.recordClose(loseEv());   // 15m gölge
    await m.tracker.load();
    await m.tracker.openPosition(makeSignal(m, { tf: '15m', direction: 'long' }), 10000);
    // aynı enstrüman, GERÇEK modda kalan 1h kombosu, TERS yön → engellenmemeli
    const real = await m.tracker.openPosition(
      makeSignal(m, { tf: '1h', direction: 'short', entry: 4000, stop: 4020, target1: 3980, target2: 3965 }), 10000
    );
    expect(real.ok).toBe(true);
    expect(real.position.shadow).toBeUndefined();
  });

  test('gölge kapanış: events dışı, gün neti değişmez, öğrenmeye akar, trades.json shadow:true', async () => {
    const m = fresh();
    for (let i = 0; i < 12; i++) m.learning.recordClose(loseEv());
    await m.tracker.load();
    const res = await m.tracker.openPosition(makeSignal(m), 10000);
    const p = res.position;
    // SL vuran kapanmış mum + sonrasında bir mum daha (son mum canlı sayılır, kesilir)
    mockCandles = [
      { time: p.issueTimeSec + 300, open: 3990, high: 3992, low: 3975, close: 3979, volume: 1 },
      { time: p.issueTimeSec + 600, open: 3979, high: 3981, low: 3978, close: 3980, volume: 1 },
    ];
    const events = await m.tracker.checkClosures();
    expect(events.length).toBe(0);                                   // Telegram'a gitmez
    expect(m.tracker.getDayStats().realizedUsd).toBe(0);
    expect(m.tracker.getDayStats().shadowClosed).toBe(1);
    expect(m.learning.summary().combos['XAUUSD:15m'].shadow.n).toBe(1);
    const last = m.tracker.getRecentTrades(1)[0];
    expect(last.shadow).toBe(true);
  });

  test('gerçek kapanışta rMultiple = pnlUsd/riskUsd kaydedilir', async () => {
    const m = fresh();
    await m.tracker.load();
    const res = await m.tracker.openPosition(makeSignal(m), 10000);
    const p = res.position;
    mockCandles = [
      { time: p.issueTimeSec + 300, open: 4010, high: 4022, low: 4008, close: 4021, volume: 1 }, // TP1 4020
      { time: p.issueTimeSec + 600, open: 4021, high: 4023, low: 4019, close: 4020, volume: 1 },
    ];
    const events = await m.tracker.checkClosures();
    expect(events.length).toBe(1);
    // risk = |4000-3980| × units, kazanç = |4020-4000| × units → R ≈ +1
    expect(events[0].rMultiple).toBeCloseTo(1, 1);
    expect(m.learning.summary().combos['XAUUSD:15m'].real.n).toBe(1);
  });
});

// ── 6) Notifier: gölge push edilmez ─────────────────────────────────────────
describe('mt5Notifier + learning — gölge duyurulmaz', () => {
  test('gölge sinyal: opened=0, shadowOpened=1, Telegram/app çağrılmaz', async () => {
    const m = fresh();
    process.env.TELEGRAM_MT5_CHANNEL = '@test';
    mockTgSend.mockClear(); mockAppPush.mockClear();
    for (let i = 0; i < 12; i++) m.learning.recordClose(loseEv());
    await m.tracker.load();
    const snap = { equity: 10000, signals: [{ ...makeSignal(m), status: 'signal' }] };
    const out = await m.notifier.evaluateAndPush(snap);
    expect(out.opened).toBe(0);
    expect(out.shadowOpened).toBe(1);
    expect(mockTgSend).not.toHaveBeenCalled();
    expect(mockAppPush).not.toHaveBeenCalled();
  });

  test('gerçek sinyal aynen duyurulur (kontrol)', async () => {
    const m = fresh();
    process.env.TELEGRAM_MT5_CHANNEL = '@test';
    mockTgSend.mockClear();
    await m.tracker.load();
    const snap = { equity: 10000, signals: [{ ...makeSignal(m), status: 'signal' }] };
    const out = await m.notifier.evaluateAndPush(snap);
    expect(out.opened).toBe(1);
    expect(mockTgSend).toHaveBeenCalled();
  });
});
