/**
 * GOLDEN TESTS — Forex öğrenme katmanı + flip-flop frenleri.
 *
 * Kapsam:
 *   1) Kapanış kalıcılığı: closed-trades dosyası + rMultiple (origStopDist bazlı).
 *   2) Cooldown: kapanan enstrüman+yön 30 dk yeniden pozisyon AÇAMAZ
 *      (FOREX_COOLDOWN_DISABLED=1 ile kapanır).
 *   3) Ters-yön kilidi: zıt pozisyon açıkken yeni ters pozisyon YOK
 *      (FOREX_REVERSE_LOCK_DISABLED=1 ile eski davranış).
 *   4) Konfluans kapısı: tek-TF + güven < 80 → pozisyon YOK; 2 TF veya güven >= 80 → VAR.
 *   5) Öğrenme devre kesici: enstrüman gölgeye düşünce yeni pozisyonlar shadow,
 *      köprü beslemesinden (getOpen) çıkar; gölge kapanış events'e girmez.
 *   6) Kill-switch'ler: FOREX_LEARNING_DISABLED=1 → hep gerçek.
 *
 * Ağ yok (forexKlines mock), disk tmp'e izole (FOREX_OPEN_FILE).
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.FOREX_RESET;

let mockCandles = [];
jest.mock('../../src/services/forex/forexKlines', () => ({ fetchCandles: jest.fn(async () => mockCandles) }));
jest.mock('../../src/services/forex/forexInstruments', () => ({
  getInstrument: () => ({ id: 'TEST', yahoo: 'TEST', precision: 2, class: 'metal' }),
}));

const nowSec = () => Math.floor(Date.now() / 1000);

function longSig(over = {}) {
  return { id: 'TEST', symbol: 'TEST', direction: 'long', precision: 2, tf: '1h', confidence: 80,
    entry: 100, stop: 98, target1: 104, target2: 108, ...over };
}

describe('forex öğrenme + flip-flop frenleri', () => {
  let tracker, learning, fileN = 0, tmpBase;
  beforeEach(() => {
    jest.resetModules();
    tmpBase = path.join(os.tmpdir(), `fx-learn-${process.pid}-${fileN++}`);
    fs.mkdirSync(tmpBase, { recursive: true });
    process.env.FOREX_OPEN_FILE = path.join(tmpBase, 'open.json');
    delete process.env.FOREX_COOLDOWN_DISABLED;
    delete process.env.FOREX_REVERSE_LOCK_DISABLED;
    delete process.env.FOREX_CONFLUENCE_GATE_DISABLED;
    delete process.env.FOREX_LEARNING_DISABLED;
    tracker = require('../../src/services/forex/forexSignalTracker');
    learning = require('../../src/services/forex/forexLearning');
    mockCandles = [];
  });

  async function closeAtTp() {
    const t = nowSec();
    mockCandles = [
      { time: t + 300, open: 100, high: 104.5, low: 99.9, close: 104 },
      { time: t + 600, open: 104, high: 104.1, low: 103.9, close: 104 },
    ];
    return tracker.checkClosures();
  }
  async function closeAtSl() {
    const t = nowSec();
    mockCandles = [
      { time: t + 300, open: 99, high: 99.5, low: 97.5, close: 98 },
      { time: t + 600, open: 98, high: 98, low: 98, close: 98 },
    ];
    return tracker.checkClosures();
  }

  // ── 1) Kapanış kalıcılığı + R ─────────────────────────────────────────────
  test('kapanış closed-trades dosyasına yazılır; rMultiple = hareket/origStopDist', async () => {
    await tracker.syncPositions([longSig()]);            // entry 100, stop 98 → dist 2
    const cl = await closeAtTp();                        // TP1 @104 → +4 → R=+2
    expect(cl).toHaveLength(1);
    expect(cl[0].rMultiple).toBeCloseTo(2, 1);
    const rec = tracker.getRecentClosed(5);
    expect(rec).toHaveLength(1);
    expect(rec[0].outcome).toBe('TP1');
    expect(rec[0].rMultiple).toBeCloseTo(2, 1);
  });

  // ── 2) Cooldown ───────────────────────────────────────────────────────────
  test('kapanan enstrüman+yön cooldown süresince YENİDEN AÇILMAZ', async () => {
    await tracker.syncPositions([longSig()]);
    await closeAtTp();
    const ev = await tracker.syncPositions([longSig()]);  // hemen yeniden dene
    expect(ev).toHaveLength(0);
    expect(tracker.getOpen()).toHaveLength(0);
  });

  test('FOREX_COOLDOWN_DISABLED=1 → eski davranış (hemen yeniden açılır)', async () => {
    process.env.FOREX_COOLDOWN_DISABLED = '1';
    await tracker.syncPositions([longSig()]);
    await closeAtTp();
    const ev = await tracker.syncPositions([longSig()]);
    expect(ev).toHaveLength(1);
  });

  test('cooldown yalnız AYNI yönü kilitler: long kapanınca short açılabilir', async () => {
    await tracker.syncPositions([longSig()]);
    await closeAtSl();
    const ev = await tracker.syncPositions([longSig({ direction: 'short', stop: 102, target1: 96, target2: 92 })]);
    expect(ev).toHaveLength(1);
  });

  // ── 3) Ters-yön kilidi ────────────────────────────────────────────────────
  test('zıt pozisyon açıkken yeni ters pozisyon AÇILMAZ (hedge kaynağı kurur)', async () => {
    await tracker.syncPositions([longSig()]);
    expect(tracker.getOpen()).toHaveLength(1);
    const ev = await tracker.syncPositions([longSig({ direction: 'short', stop: 102, target1: 96, target2: 92 })]);
    expect(ev).toHaveLength(0);
    expect(tracker.getOpen()).toHaveLength(1);           // hâlâ yalnız long
  });

  test('FOREX_REVERSE_LOCK_DISABLED=1 → eski davranış (ters ayrı pozisyon)', async () => {
    process.env.FOREX_REVERSE_LOCK_DISABLED = '1';
    await tracker.syncPositions([longSig()]);
    const ev = await tracker.syncPositions([longSig({ direction: 'short', stop: 102, target1: 96, target2: 92 })]);
    expect(ev).toHaveLength(1);
    expect(ev[0].reverseOf.length).toBe(1);
  });

  // ── 4) Konfluans kapısı ───────────────────────────────────────────────────
  test('tek TF + güven < 80 → pozisyon YOK; 2 TF → VAR; tek TF güven >= 80 → VAR', async () => {
    let ev = await tracker.syncPositions([longSig({ confidence: 65 })]);
    expect(ev).toHaveLength(0);                          // tek TF, düşük güven
    ev = await tracker.syncPositions([longSig({ tf: '1h', confidence: 65 }), longSig({ tf: '4h', confidence: 62 })]);
    expect(ev).toHaveLength(1);                          // 2 TF konfluans
    expect(ev[0].position.tfs).toEqual(['1h', '4h']);
  });

  test('FOREX_CONFLUENCE_GATE_DISABLED=1 → tek TF düşük güven yine açılır', async () => {
    process.env.FOREX_CONFLUENCE_GATE_DISABLED = '1';
    const ev = await tracker.syncPositions([longSig({ confidence: 65 })]);
    expect(ev).toHaveLength(1);
  });

  // ── 5) Öğrenme devre kesici (enstrüman düzeyi) ────────────────────────────
  test('10 kayıplı kapanış → enstrüman gölgeye; yeni pozisyon shadow, köprüde görünmez', async () => {
    // Öğrenmeye doğrudan 10 kayıp besle (n>=10, sumR=-10<=-4, PF~0 → gölge)
    for (let i = 0; i < 10; i++) learning.recordClose('TEST', { r: -1, usd: -50, outcome: 'SL' });
    expect(learning.modeFor('TEST')).toBe('shadow');
    const ev = await tracker.syncPositions([longSig()]);
    expect(ev).toHaveLength(1);
    expect(ev[0].position.shadow).toBe(true);
    expect(tracker.getOpen()).toHaveLength(0);           // köprü beslemesi BOŞ
    expect(tracker.getOpenShadow()).toHaveLength(1);
    // gölge kapanış: events'e girmez (Telegram yok) ama öğrenmeye akar
    const cl = await closeAtTp();
    expect(cl).toHaveLength(0);
    expect(learning.summary().combos['TEST'].shadow.n).toBe(1);
    const rec = tracker.getRecentClosed(5);
    expect(rec[0].shadow).toBe(true);
  });

  test('gölge toparlanınca gerçeğe döner', async () => {
    for (let i = 0; i < 10; i++) learning.recordClose('TEST', { r: -1, outcome: 'SL' });
    expect(learning.modeFor('TEST')).toBe('shadow');
    for (let i = 0; i < 8; i++) learning.recordClose('TEST', { r: 1, outcome: 'TP1', shadow: true });
    expect(learning.modeFor('TEST')).toBe('real');
  });

  test('slot tahliyesi: gerçeğe dönüşte eski GÖLGE pozisyon silinir, gerçek açılır', async () => {
    for (let i = 0; i < 10; i++) learning.recordClose('TEST', { r: -1, outcome: 'SL' });
    await tracker.syncPositions([longSig()]);            // gölge pozisyon slotu tuttu
    expect(tracker.getOpenShadow()).toHaveLength(1);
    for (let i = 0; i < 8; i++) learning.recordClose('TEST', { r: 1, outcome: 'TP1', shadow: true });
    expect(learning.modeFor('TEST')).toBe('real');
    const ev = await tracker.syncPositions([longSig()]); // gerçek sinyal geldi
    expect(ev).toHaveLength(1);
    expect(ev[0].position.shadow).toBeUndefined();       // GERÇEK pozisyon açıldı
    expect(tracker.getOpen()).toHaveLength(1);
    expect(tracker.getOpenShadow()).toHaveLength(0);     // hayalet tahliye edildi
  });

  test('gölge kapanış cooldownu GERÇEK evreni kilitlemez (evren-ayrık anahtar)', async () => {
    for (let i = 0; i < 10; i++) learning.recordClose('TEST', { r: -1, outcome: 'SL' });
    await tracker.syncPositions([longSig()]);
    await closeAtTp();                                    // gölge kapanış → shadow-cooldown
    // gölge o kapanışla 1 kayıt aldı; 7 kayıt daha → geri açılma
    for (let i = 0; i < 7; i++) learning.recordClose('TEST', { r: 1, outcome: 'TP1', shadow: true });
    expect(learning.modeFor('TEST')).toBe('real');
    const ev = await tracker.syncPositions([longSig()]); // gölge cooldown'una TAKILMAMALI
    expect(ev).toHaveLength(1);
    expect(ev[0].position.shadow).toBeUndefined();
  });

  // ── 6) Kill-switch ────────────────────────────────────────────────────────
  test('FOREX_LEARNING_DISABLED=1 → kayıplara rağmen gerçek modda kalır', async () => {
    process.env.FOREX_LEARNING_DISABLED = '1';
    for (let i = 0; i < 15; i++) learning.recordClose('TEST', { r: -1, outcome: 'SL' });
    expect(learning.modeFor('TEST')).toBe('real');
    const ev = await tracker.syncPositions([longSig()]);
    expect(ev[0].position.shadow).toBeUndefined();
  });
});
