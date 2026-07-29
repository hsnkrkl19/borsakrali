/**
 * GOLDEN TESTS — 🥇 ALTIN öğrenme katmanı (TF-düzeyi devre kesici + gölge izleme).
 *
 * Kapsam (forexLearning.golden.test.js deseni):
 *   1) Devre kesici: bir TF'te 10 kayıplı kapanış → o TF gölgeye; yeni pozisyon
 *      shadow bayraklı açılır, notifier Telegram'a GÖNDERMEZ; diğer TF'ler gerçek.
 *   2) Gölge kapanış: manageOpen() sonucu (Telegram teyidi) BOŞ; halka açık
 *      istatistik (getStats) kirlenmez; öğrenmenin gölge defterine akar.
 *   3) Geri açılma: gölgede 8 kazançlı kapanış → TF gerçeğe döner, yeni pozisyon
 *      gerçek açılır ve push edilir.
 *   4) Kill-switch: ALTIN_LEARNING_DISABLED=1 → kayıplara rağmen gerçek mod.
 *   5) R akışı: gerçek kapanışın R'si öğrenme penceresine yazılır (R null ise atlanır).
 *   6) Karar denetimi: mod değişimleri decisions kaydına düşer.
 *
 * Ağ yok (altinData + telegramService + signalDelivery mock), disk tmp'e izole.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;

// altinData mock: testler candleStore'a TF mumları koyar.
const candleStore = {};
jest.mock('../../src/services/altin/altinData', () => ({
  getCandles: jest.fn(async (tf) => candleStore[tf] || []),
  getAll: jest.fn(async (tfs) => { const o = {}; for (const t of (tfs || [])) o[t] = candleStore[t] || []; return o; }),
  SYMBOL: 'GC=F',
}));

// Telegram + kanal mock (gerçek gönderim YOK; çağrı sayısı doğrulanır).
const mockSendMessage = jest.fn(async () => ({ success: true }));
jest.mock('../../src/services/telegramService', () => ({ sendMessage: (...a) => mockSendMessage(...a) }));
jest.mock('../../src/services/signalDelivery', () => ({
  signalChannel: () => '@test_channel',
  channelOnly: () => true,
}));

const NOW = () => Math.floor(Date.now() / 1000);

function sig(over = {}) {
  return {
    tf: '4h', symbol: 'XAU/USD', type: 'supertrend', label: '4s Supertrend',
    direction: 'long', entry: 2000, stop: 1960, target: 2060,
    atr: 20, tpAtr: 1, slAtr: 4, trail: false,
    confidence: 82, wrEst: 94, scalp: false, barTime: NOW(),
    ...over,
  };
}

describe('altın öğrenme katmanı — TF devre kesici + gölge', () => {
  let tracker, learning, notifier, fileN = 0, tmpBase;
  beforeEach(() => {
    jest.resetModules();
    mockSendMessage.mockClear();
    tmpBase = path.join(os.tmpdir(), `altin-learn-${process.pid}-${fileN++}`);
    fs.mkdirSync(tmpBase, { recursive: true });
    process.env.ALTIN_OPEN_FILE = path.join(tmpBase, 'open.json');
    process.env.ALTIN_LEARNING_FILE = path.join(tmpBase, 'learning.json');
    delete process.env.ALTIN_LEARNING_DISABLED;
    delete process.env.ALTIN_PUSH_DISABLED;
    // This suite verifies the legacy notifier after learning/shadow gates.
    process.env.MT5_LEGACY_PAPER_NOTIFY = '1';
    tracker = require('../../src/services/altin/altinTracker');
    learning = require('../../src/services/altin/altinLearning');
    notifier = require('../../src/services/altin/altinNotifier');
    tracker.__resetForTest();
    for (const k of Object.keys(candleStore)) delete candleStore[k];
  });

  afterAll(() => { delete process.env.MT5_LEGACY_PAPER_NOTIFY; });

  async function closeAtTp(tf = '4h') {
    const p = (await tracker.listOpen()).find(x => x.tf === tf);
    candleStore[tf] = [{ time: p.stopSetSec + 3600, open: 2000, high: 2065, low: 1990, close: 2055 }]; // high>=2060 → TP
    return tracker.manageOpen();
  }
  async function closeAtSl(tf = '4h') {
    const p = (await tracker.listOpen()).find(x => x.tf === tf);
    candleStore[tf] = [{ time: p.stopSetSec + 3600, open: 2000, high: 2010, low: 1955, close: 1958 }]; // low<=1960 → SL
    return tracker.manageOpen();
  }

  // ── 1) Devre kesici (TF düzeyi) ───────────────────────────────────────────
  test('10 kayıplı kapanış → TF gölgeye; yeni pozisyon shadow, Telegram YOK; diğer TF gerçek', async () => {
    // Öğrenmeye doğrudan 10 kayıp besle (n>=10, sumR=-10<=-4, PF~0 → gölge)
    for (let i = 0; i < 10; i++) learning.recordClose('4h', { r: -1, outcome: 'SL' });
    expect(learning.modeFor('4h')).toBe('shadow');
    expect(learning.modeFor('1d')).toBe('real');          // diğer TF etkilenmez

    const res = await notifier.evaluateAndPush({ signals: [sig()], bias: null, perTf: {} });
    expect(res.opened).toBe(1);
    expect(res.shadow).toBe(1);
    expect(res.telegram).toBe(0);                          // Telegram'a GİTMEDİ
    expect(mockSendMessage).not.toHaveBeenCalled();
    const open = await tracker.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0].shadow).toBe(true);

    // Gerçek TF (1d) push edilir
    const res2 = await notifier.evaluateAndPush({ signals: [sig({ tf: '1d', label: '1g Supertrend' })], bias: null, perTf: {} });
    expect(res2.telegram).toBe(1);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  // ── 2) Gölge kapanış: teyit YOK, istatistik temiz, öğrenmeye akar ──────────
  test('gölge kapanış manageOpen sonucunda YOK; getStats kirlenmez; gölge defterine akar', async () => {
    for (let i = 0; i < 10; i++) learning.recordClose('4h', { r: -1, outcome: 'SL' });
    await tracker.ingest([sig()]);
    const cl = await closeAtTp();
    expect(cl).toHaveLength(0);                            // Telegram teyidi YOK
    const stats = await tracker.getStats();
    expect(stats.totalOpened).toBe(0);                     // halka açık sayaçlar temiz
    expect(stats.totalClosed).toBe(0);
    expect(stats.byTf['4h']).toBeUndefined();
    const combo = learning.summary().combos['4h'];
    expect(combo.shadow.n).toBe(1);                        // öğrenmeye aktı
    expect(combo.shadow.sumR).toBeCloseTo(1.5, 1);         // 60 kâr / 40 risk
  });

  // ── 3) Geri açılma ─────────────────────────────────────────────────────────
  test('gölgede 8 kazanç → gerçeğe döner; yeni pozisyon gerçek ve push edilir', async () => {
    for (let i = 0; i < 10; i++) learning.recordClose('4h', { r: -1, outcome: 'SL' });
    expect(learning.modeFor('4h')).toBe('shadow');
    for (let i = 0; i < 8; i++) learning.recordClose('4h', { r: 1, outcome: 'TP', shadow: true });
    expect(learning.modeFor('4h')).toBe('real');

    const res = await notifier.evaluateAndPush({ signals: [sig()], bias: null, perTf: {} });
    expect(res.telegram).toBe(1);
    const open = await tracker.listOpen();
    expect(open[0].shadow).toBeUndefined();
  });

  // ── 4) Kill-switch ────────────────────────────────────────────────────────
  test('ALTIN_LEARNING_DISABLED=1 → kayıplara rağmen gerçek mod, pozisyon shadow DEĞİL', async () => {
    process.env.ALTIN_LEARNING_DISABLED = '1';
    for (let i = 0; i < 15; i++) learning.recordClose('4h', { r: -1, outcome: 'SL' });
    expect(learning.modeFor('4h')).toBe('real');
    const opened = await tracker.ingest([sig()]);
    expect(opened).toHaveLength(1);
    expect(opened[0].shadow).toBeUndefined();
  });

  // ── 5) R akışı: gerçek kapanış öğrenme penceresine yazılır ────────────────
  test('gerçek SL kapanışının R=-1 değeri öğrenmenin real penceresine akar', async () => {
    await tracker.ingest([sig()]);                         // entry 2000, stop 1960 → risk 40
    const cl = await closeAtSl();
    expect(cl).toHaveLength(1);                            // gerçek kapanış teyide gider
    expect(cl[0].R).toBe(-1);
    const combo = learning.summary().combos['4h'];
    expect(combo.real.n).toBe(1);
    expect(combo.real.sumR).toBeCloseTo(-1, 2);
    const stats = await tracker.getStats();
    expect(stats.byTf['4h'].long.loss).toBe(1);            // halka açık istatistik DEVAM
  });

  // ── 6) Karar denetimi ─────────────────────────────────────────────────────
  test('devre kesme + geri açılma decisions kaydına düşer', () => {
    for (let i = 0; i < 10; i++) learning.recordClose('4h', { r: -1, outcome: 'SL' });
    for (let i = 0; i < 8; i++) learning.recordClose('4h', { r: 1, outcome: 'TP', shadow: true });
    const dec = learning.recentDecisions(1);
    expect(dec.length).toBeGreaterThanOrEqual(2);
    expect(dec.some(d => d.to === 'shadow' && d.combo === '4h')).toBe(true);
    expect(dec.some(d => d.to === 'real' && d.combo === '4h')).toBe(true);
  });
});
