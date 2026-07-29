/**
 * GOLDEN TESTS — 🤖 YENİ ROBOT öğrenme katmanı (enstrüman:TF devre-kesici + gölge).
 *
 * Kapsam (forexLearning + altinLearning + mt5Learning desenleri):
 *   1) Devre kesici: bir kombo (BTCUSD:4h) 10 kayıplı kapanış → GÖLGE; yeni
 *      pozisyon shadow bayraklı açılır, getOpen'da (Telegram/UI beslemesi)
 *      GÖRÜNMEZ, getOpenShadow'da var; gölge kapanış events dışı ama öğrenmeye akar.
 *   2) Kombo bağımsızlığı: BTCUSD:4h gölgeyken BTCUSD:1d ve XAUUSD:4h GERÇEK kalır
 *      (aynı enstrümanın sağlıklı TF'i işlem görmeye devam eder).
 *   3) Geri açılma: gölgede 8 kazançlı kapanış → kombo gerçeğe döner.
 *   4) Slot tahliyesi: kombo gerçeğe dönünce eski GÖLGE pozisyon silinir, gerçek açılır.
 *   5) R akışı: gerçek kapanışın rMultiple (hareket/origStopDist) real penceresine yazılır.
 *   6) Karar denetimi: mod değişimleri decisions kaydına düşer.
 *   7) Kill-switch: PRO_LEARNING_DISABLED=1 → kayıplara rağmen gerçek mod.
 *   8) Notifier: gölge sinyal push edilmez (Telegram sendMessage çağrılmaz, shadow sayılır).
 *
 * Ağ yok (forexKlines mock); notifier bağımlılıkları (telegram/signalDelivery/
 * statsStore/signalLog/proSelfTest) mock; disk tmp'e izole (PRO_OPEN_SIGNALS_FILE).
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;

// forexKlines mock: testler mockCandles'a 5m mumları koyar (checkClosures için).
let mockCandles = [];
jest.mock('../../src/services/forex/forexKlines', () => ({ fetchCandles: jest.fn(async () => mockCandles) }));

// Notifier bağımlılıkları — gerçek gönderim/ağ YOK; çağrı sayısı doğrulanır.
const mockSendMessage = jest.fn(async () => ({ success: true }));
jest.mock('../../src/services/telegramService', () => ({ sendMessage: (...a) => mockSendMessage(...a) }));
jest.mock('../../src/services/signalDelivery', () => ({
  signalChannel: () => '@test_channel',
  channelOnly: () => true,
}));
jest.mock('../../src/services/proSignals/proStatsStore', () => ({
  recordOpen: jest.fn(async () => {}),
  recordClosure: jest.fn(async () => {}),
  buildStatsMessage: jest.fn(async () => ''),
  getStats: jest.fn(() => ({})),
}));
jest.mock('../../src/services/proSignals/proSignalLog', () => ({
  append: jest.fn(),
  patchOutcome: jest.fn(),
  list: jest.fn(() => []),
}));
jest.mock('../../src/services/proSignals/proSelfTest', () => ({
  getPushThreshold: () => 50,
  getTunedWeights: () => null,
  getState: () => null,
}));

const nowSec = () => Math.floor(Date.now() / 1000);

function proSig(over = {}) {
  return {
    id: 'BTCUSD', symbol: 'BTC/USD', direction: 'long', tf: '4h', precision: 2,
    entry: 100, stop: 95, target1: 110, target2: 120, confidence: 80, rr1: 2, rr2: 4,
    mt5: { symbol: 'BTCUSD' }, sizing: { riskUsd: 100, requiredMarginUsd: 50, marginPct: 0.5 },
    ...over,
  };
}

describe('YENİ ROBOT öğrenme katmanı — enstrüman:TF devre kesici + gölge', () => {
  let tracker, learning, notifier, fileN = 0, tmpBase;
  beforeEach(() => {
    jest.resetModules();
    mockSendMessage.mockClear();
    mockCandles = [];
    tmpBase = path.join(os.tmpdir(), `pro-learn-${process.pid}-${fileN++}`);
    fs.mkdirSync(tmpBase, { recursive: true });
    process.env.PRO_OPEN_SIGNALS_FILE = path.join(tmpBase, 'open.json');
    delete process.env.PRO_LEARNING_FILE;
    delete process.env.PRO_LEARNING_DISABLED;
    delete process.env.PRO_PUSH_DISABLED;
    delete process.env.PRO_QUALITY_GATE;
    // This suite verifies the legacy notifier after learning/shadow gates.
    process.env.MT5_LEGACY_PAPER_NOTIFY = '1';
    tracker = require('../../src/services/proSignals/proSignalTracker');
    learning = require('../../src/services/proSignals/proLearning');
    notifier = require('../../src/services/proSignals/proPushNotifier');
    tracker.__resetForTest();
  });

  afterAll(() => { delete process.env.MT5_LEGACY_PAPER_NOTIFY; });

  // TP1 vuran 5m mum (long: high >= target1 110) → checkClosures TP1 kapatır.
  async function closeAtTp() {
    const t = nowSec();
    mockCandles = [{ time: t + 300, open: 100, high: 111, low: 108, close: 110 }];
    return tracker.checkClosures();
  }
  // SL vuran 5m mum (long: low <= stop 95) → checkClosures SL kapatır.
  async function closeAtSl() {
    const t = nowSec();
    mockCandles = [{ time: t + 300, open: 100, high: 100, low: 94, close: 96 }];
    return tracker.checkClosures();
  }

  // ── 1) Devre kesici (enstrüman:TF) ────────────────────────────────────────
  test('10 kayıplı kapanış → kombo gölgeye; yeni pozisyon shadow, getOpen BOŞ, getOpenShadow dolu; gölge kapanış öğrenmeye akar', async () => {
    for (let i = 0; i < 10; i++) learning.recordClose('BTCUSD:4h', { r: -1, outcome: 'SL' });
    expect(learning.modeFor('BTCUSD:4h')).toBe('shadow');
    expect(learning.modeFor('BTCUSD:1d')).toBe('real');       // sibling TF etkilenmez

    const ev = await tracker.syncPositions([proSig({ tf: '4h' })]);
    expect(ev).toHaveLength(1);
    expect(ev[0].position.shadow).toBe(true);
    expect(ev[0].position.learnTf).toBe('4h');
    expect(tracker.getOpen()).toHaveLength(0);                // Telegram/UI beslemesi BOŞ
    expect(tracker.getOpenShadow()).toHaveLength(1);

    // Gölge kapanış: events'e girmez (Telegram yok) ama gölge defterine akar.
    const cl = await closeAtTp();
    expect(cl).toHaveLength(0);
    const combo = learning.summary().combos['BTCUSD:4h'];
    expect(combo.shadow.n).toBe(1);
    expect(combo.shadow.sumR).toBeCloseTo(2, 1);              // (110-100)/5 = +2R
  });

  // ── 2) Kombo bağımsızlığı ─────────────────────────────────────────────────
  test('BTCUSD:4h gölgeyken sağlıklı BTCUSD:1d GERÇEK pozisyon açılır', async () => {
    for (let i = 0; i < 10; i++) learning.recordClose('BTCUSD:4h', { r: -1, outcome: 'SL' });
    expect(learning.modeFor('BTCUSD:4h')).toBe('shadow');
    expect(learning.modeFor('XAUUSD:4h')).toBe('real');       // başka enstrüman etkilenmez

    const ev = await tracker.syncPositions([proSig({ tf: '1d' })]);
    expect(ev).toHaveLength(1);
    expect(ev[0].position.shadow).toBeUndefined();            // 1d kombosu sağlıklı → gerçek
    expect(ev[0].position.learnTf).toBe('1d');
    expect(tracker.getOpen()).toHaveLength(1);
  });

  // ── 3) Geri açılma ────────────────────────────────────────────────────────
  test('gölgede 8 kazançlı kapanış → kombo gerçeğe döner', () => {
    for (let i = 0; i < 10; i++) learning.recordClose('BTCUSD:4h', { r: -1, outcome: 'SL' });
    expect(learning.modeFor('BTCUSD:4h')).toBe('shadow');
    for (let i = 0; i < 8; i++) learning.recordClose('BTCUSD:4h', { r: 1, outcome: 'TP1', shadow: true });
    expect(learning.modeFor('BTCUSD:4h')).toBe('real');
  });

  // ── 4) Slot tahliyesi ─────────────────────────────────────────────────────
  test('slot tahliyesi: gerçeğe dönüşte eski GÖLGE pozisyon silinir, gerçek açılır', async () => {
    for (let i = 0; i < 10; i++) learning.recordClose('BTCUSD:4h', { r: -1, outcome: 'SL' });
    await tracker.syncPositions([proSig({ tf: '4h' })]);      // gölge pozisyon slotu tuttu
    expect(tracker.getOpenShadow()).toHaveLength(1);
    for (let i = 0; i < 8; i++) learning.recordClose('BTCUSD:4h', { r: 1, outcome: 'TP1', shadow: true });
    expect(learning.modeFor('BTCUSD:4h')).toBe('real');
    const ev = await tracker.syncPositions([proSig({ tf: '4h' })]); // gerçek sinyal geldi
    expect(ev).toHaveLength(1);
    expect(ev[0].position.shadow).toBeUndefined();            // GERÇEK pozisyon açıldı
    expect(tracker.getOpen()).toHaveLength(1);
    expect(tracker.getOpenShadow()).toHaveLength(0);          // hayalet tahliye edildi
  });

  // ── 4b) Kombo izolasyonu: devre-kesik sibling TF gerçek pozisyonu kirletmez ─
  // (adversaryal inceleme bulgusu) BTCUSD:4h gölgeyken, açık bir GERÇEK
  // BTCUSD:1h pozisyonuna 4h sinyali SESSİZCE birleşemez — ayrı gölge açılır.
  test('devre-kesilmiş sibling TF açık GERÇEK pozisyonu KİRLETMEZ (ayrı gölge pozisyon açılır)', async () => {
    for (let i = 0; i < 10; i++) learning.recordClose('BTCUSD:4h', { r: -1, outcome: 'SL' });
    expect(learning.modeFor('BTCUSD:4h')).toBe('shadow');
    expect(learning.modeFor('BTCUSD:1h')).toBe('real');

    // Sync #1: sağlıklı 1h sinyali → GERÇEK pozisyon (learnTf 1h, tfs ['1h']).
    const e1 = await tracker.syncPositions([proSig({ tf: '1h', confidence: 70 })]);
    expect(e1).toHaveLength(1);
    expect(e1[0].position.shadow).toBeUndefined();
    expect(e1[0].position.learnTf).toBe('1h');

    // Sync #2: devre-kesik 4h sinyali (daha yüksek güven) AYNI id+yön için gelir.
    // ESKİ HATA: 4h, gerçek 1h pozisyonuna birleşir (tfs ['1h','4h'], güven 95,
    // canlı işlem + trailing). DÜZELTME: ayrı GÖLGE pozisyon; gerçek dokunulmaz.
    const e2 = await tracker.syncPositions([proSig({ tf: '4h', confidence: 95 })]);
    expect(e2).toHaveLength(1);
    expect(e2[0].position.shadow).toBe(true);
    expect(e2[0].position.learnTf).toBe('4h');

    // Gerçek 1h pozisyonu KİRLENMEDİ: tek TF, güven 70, ≥4h değil → trailing YOK.
    const real = tracker.getOpen();
    expect(real).toHaveLength(1);
    expect(real[0].tfs).toEqual(['1h']);
    expect(real[0].confidence).toBe(70);
    expect(tracker.isManageable(real[0])).toBe(false);
    expect(tracker.getOpenShadow()).toHaveLength(1);
    expect(tracker.getOpenShadow()[0].tfs).toEqual(['4h']);

    // Kapanışta atıf DOĞRU kombolara akar: TP mumu her iki long'u da kapatır.
    await closeAtTp();
    expect(learning.summary().combos['BTCUSD:1h'].real.n).toBe(1);   // gerçek → 1h defteri
    const c4 = learning.summary().combos['BTCUSD:4h'];
    expect(c4.mode).toBe('shadow');                                  // 4h hâlâ devre-kesik
    expect(c4.shadow.n).toBe(1);                                     // ama gözlem aldı → yakınsar
  });

  // ── 5) R akışı (gerçek kapanış) ───────────────────────────────────────────
  test('gerçek SL kapanışının rMultiple=-1 değeri öğrenmenin real penceresine akar', async () => {
    await tracker.syncPositions([proSig({ tf: '4h' })]);      // entry100 stop95 → origStopDist 5
    const cl = await closeAtSl();                             // SL @95 → -5/5 = -1R
    expect(cl).toHaveLength(1);
    expect(cl[0].outcome).toBe('SL');
    expect(cl[0].rMultiple).toBeCloseTo(-1, 2);
    const combo = learning.summary().combos['BTCUSD:4h'];
    expect(combo.real.n).toBe(1);
    expect(combo.real.sumR).toBeCloseTo(-1, 2);
  });

  // ── 6) Karar denetimi ─────────────────────────────────────────────────────
  test('devre kesme + geri açılma decisions kaydına düşer', () => {
    for (let i = 0; i < 10; i++) learning.recordClose('BTCUSD:4h', { r: -1, outcome: 'SL' });
    for (let i = 0; i < 8; i++) learning.recordClose('BTCUSD:4h', { r: 1, outcome: 'TP1', shadow: true });
    const dec = learning.recentDecisions(1);
    expect(dec.length).toBeGreaterThanOrEqual(2);
    expect(dec.some(d => d.to === 'shadow' && d.combo === 'BTCUSD:4h')).toBe(true);
    expect(dec.some(d => d.to === 'real' && d.combo === 'BTCUSD:4h')).toBe(true);
  });

  // ── 7) Kill-switch ────────────────────────────────────────────────────────
  test('PRO_LEARNING_DISABLED=1 → kayıplara rağmen gerçek mod, pozisyon shadow DEĞİL', async () => {
    process.env.PRO_LEARNING_DISABLED = '1';
    for (let i = 0; i < 15; i++) learning.recordClose('BTCUSD:4h', { r: -1, outcome: 'SL' });
    expect(learning.modeFor('BTCUSD:4h')).toBe('real');
    const ev = await tracker.syncPositions([proSig({ tf: '4h' })]);
    expect(ev).toHaveLength(1);
    expect(ev[0].position.shadow).toBeUndefined();
  });

  // ── 8) Notifier: gölge duyurulmaz ─────────────────────────────────────────
  test('gölge sinyal notifier tarafından push EDİLMEZ (telegram=0, shadow=1, sendMessage çağrılmaz)', async () => {
    for (let i = 0; i < 10; i++) learning.recordClose('BTCUSD:4h', { r: -1, outcome: 'SL' });
    expect(learning.modeFor('BTCUSD:4h')).toBe('shadow');
    const out = await notifier.evaluateAndPush([proSig({ tf: '4h', confidence: 80 })]);
    expect(out.telegram).toBe(0);
    expect(out.shadow).toBe(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(tracker.getOpen()).toHaveLength(0);                // gerçek beslemede yok
    expect(tracker.getOpenShadow()).toHaveLength(1);          // sanal izleniyor
  });

  test('gerçek sinyal notifier tarafından AYNEN duyurulur (kontrol)', async () => {
    const out = await notifier.evaluateAndPush([proSig({ tf: '4h', confidence: 80 })]);
    expect(out.telegram).toBe(1);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(tracker.getOpen()).toHaveLength(1);
  });

  // ── 9) GÖLGE pozisyonun stop-yönetimi (R-merdiveni) DUYURULMAZ ─────────────
  // manageOpenPositions gölge pozisyonun izini SÜRER (sanal gerçekçilik) ama
  // pushManagementUpdates kanala GÖNDERMEZ — gizli sızıntı vektörü kapalı.
  async function ratchetMgmt() {
    const p = tracker.getOpenShadow()[0] || tracker.getOpen()[0];
    mockCandles = [{ time: p.issueTimeSec + 60, open: 100, high: 112.5, low: 100, close: 110 }]; // mfe +2.5R
    return tracker.manageOpenPositions();
  }
  test('gölge 4h pozisyonun stop güncellemesi Telegram’a GİTMEZ (iz sürer, duyurulmaz)', async () => {
    for (let i = 0; i < 10; i++) learning.recordClose('BTCUSD:4h', { r: -1, outcome: 'SL' });
    await tracker.syncPositions([proSig({ tf: '4h' })]);      // gölge 4h pozisyon
    const mgmt = await ratchetMgmt();
    expect(mgmt).toHaveLength(1);                             // iz sürdü (stop +1R'ye)
    expect(mgmt[0].position.stop).toBe(105);
    const out = await notifier.pushManagementUpdates(mgmt);
    expect(out.telegram).toBe(0);                            // ama DUYURULMADI
    expect(out.shadow).toBe(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  test('gerçek 4h pozisyonun stop güncellemesi AYNEN duyurulur (kontrol)', async () => {
    await tracker.syncPositions([proSig({ tf: '4h' })]);      // gerçek 4h pozisyon
    const mgmt = await ratchetMgmt();
    expect(mgmt).toHaveLength(1);
    const out = await notifier.pushManagementUpdates(mgmt);
    expect(out.telegram).toBe(1);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});
