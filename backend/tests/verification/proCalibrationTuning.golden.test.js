/**
 * GOLDEN TESTS — YENİ ROBOT · Kalibrasyon (forexAggregator) + Kendini-ayar (proSelfTest).
 *
 *   1) calibrateConfidence — empirik delta ±15 ile SINIRLI (uç geçmişte bile akış çökmez).
 *   2) proSelfTest (PRO_SELFTUNE_ACTIVE=0) — getTunedWeights = BASE, getPushThreshold = env||60,
 *      run() (yeterli örnekle) applied:false (kuru-çalıştırma).
 *   3) proSelfTest (aktif) — hep kazanan bir teknik için POZİTİF ağırlık delta'sı
 *      (≤+0.15, [0.5,4.0] içinde); eşik değişimi ±2 ve [55,80] içinde.
 *
 * Saf/hermetik: forexAggregator saf; proSelfTest yalnız bellekteki proSignalLog'u okur
 * (disk/ağ yazımı no-op kalır; __resetForTest ile temiz başlar).
 */

const os = require('os');
const path = require('path');

// proSelfTest disk yazımı tmp'ye gitsin (yan etki güvenliği); ana etki __resetForTest.
process.env.PRO_OPEN_SIGNALS_FILE = path.join(os.tmpdir(), `pro-calib-test-${process.pid}.json`);

const { calibrateConfidence, CAL } = require('../../src/services/forex/forexAggregator');
const proConfluence = require('../../src/services/proSignals/proConfluence');
const proSignalLog = require('../../src/services/proSignals/proSignalLog');
const proSelfTest = require('../../src/services/proSignals/proSelfTest');

describe('forexAggregator.calibrateConfidence — ±15 ile SINIRLI delta', () => {
  test('aşırı KÖTÜ geçmiş → en çok MAX_DROP düşer (akış kurumaz)', () => {
    const r = calibrateConfidence(75, { winRate: 0, profitFactor: 0.1, expectancy: -5, sampleSize: 200 });
    expect(r.delta).toBe(-CAL.MAX_DROP);              // -15 kelepçe
    expect(CAL.MAX_DROP).toBe(15);
    expect(r.confidence).toBe(75 - CAL.MAX_DROP);
  });

  test('aşırı İYİ geçmiş → en çok MAX_RISE yükselir', () => {
    const r = calibrateConfidence(58, { winRate: 100, profitFactor: 50, expectancy: 5, sampleSize: 200 });
    expect(r.delta).toBe(CAL.MAX_RISE);               // +15 kelepçe
    expect(CAL.MAX_RISE).toBe(15);
    expect(r.confidence).toBe(58 + CAL.MAX_RISE);
  });

  test('tarihsel veri yok → NO-OP (ham güven aynen döner)', () => {
    expect(calibrateConfidence(75, null)).toEqual({ confidence: 75, rawConfidence: 75, empirical: null, trust: 0, delta: 0 });
  });
});

describe('proSelfTest — PRO_SELFTUNE_ACTIVE=0 (mutasyon kapalı)', () => {
  const prevActive = process.env.PRO_SELFTUNE_ACTIVE;
  const prevThr = process.env.PRO_PUSH_CONFIDENCE;
  beforeEach(() => {
    process.env.PRO_SELFTUNE_ACTIVE = '0';
    delete process.env.PRO_PUSH_CONFIDENCE;
    proSelfTest.__resetForTest();
    proSignalLog.__resetForTest();
  });
  afterAll(() => {
    if (prevActive === undefined) delete process.env.PRO_SELFTUNE_ACTIVE; else process.env.PRO_SELFTUNE_ACTIVE = prevActive;
    if (prevThr === undefined) delete process.env.PRO_PUSH_CONFIDENCE; else process.env.PRO_PUSH_CONFIDENCE = prevThr;
  });

  test('getTunedWeights = BASE_WEIGHTS; getPushThreshold = 60 (env yok)', () => {
    expect(proSelfTest.getTunedWeights()).toEqual(proConfluence.BASE_WEIGHTS);
    expect(proSelfTest.getPushThreshold()).toBe(60);
  });

  test('getPushThreshold env\'i okur (PRO_PUSH_CONFIDENCE)', () => {
    process.env.PRO_PUSH_CONFIDENCE = '55';
    expect(proSelfTest.getPushThreshold()).toBe(55);
    delete process.env.PRO_PUSH_CONFIDENCE;
  });

  test('run() yeterli örnekle (≥20) → applied:false, hiçbir mutasyon yok', async () => {
    for (let i = 0; i < 24; i++) {
      proSignalLog.append({
        code: 'YB' + i, instrumentId: 'BTCUSD', symbol: 'BTC/USD', direction: 'long', tfs: ['4h'], confidence: 70,
        votes: [{ technique: 'genel', vote: i < 10 ? 'long' : 'short', score: i < 10 ? 70 : 30 }],
        outcome: { result: i < 10 ? 'TP1' : 'SL', pnlPct: i < 10 ? 5 : -3 },
      });
    }
    const r = await proSelfTest.run();
    expect(r.applied).toBe(false);
    expect(r.changes).toHaveLength(0);
    expect(r.weights).toEqual(proConfluence.BASE_WEIGHTS);
    expect(r.pushThreshold).toBe(60);
  });

  test('run() yetersiz örnek (<20) → skipped', async () => {
    proSignalLog.append({ code: 'YB1', instrumentId: 'BTCUSD', direction: 'long', votes: [], outcome: { result: 'TP1', pnlPct: 1 } });
    const r = await proSelfTest.run();
    expect(r.skipped).toBe('insufficient_samples');
    expect(r.closed).toBe(1);
  });
});

describe('proSelfTest — AKTİF (sınırlı, deterministik ayar)', () => {
  const prevActive = process.env.PRO_SELFTUNE_ACTIVE;
  const prevThr = process.env.PRO_PUSH_CONFIDENCE;
  beforeEach(() => {
    process.env.PRO_SELFTUNE_ACTIVE = '1';
    delete process.env.PRO_PUSH_CONFIDENCE;
    proSelfTest.__resetForTest();
    proSignalLog.__resetForTest();
  });
  afterAll(() => {
    if (prevActive === undefined) delete process.env.PRO_SELFTUNE_ACTIVE; else process.env.PRO_SELFTUNE_ACTIVE = prevActive;
    if (prevThr === undefined) delete process.env.PRO_PUSH_CONFIDENCE; else process.env.PRO_PUSH_CONFIDENCE = prevThr;
  });

  // 12 kazanan 'genel-long' + 12 kaybeden 'genel-short' → overall 0.5;
  // 'genel' yalnız KAZANANLARDA long oy verir → techWR 100% (n=12) > overall 50%.
  function seedWinningTechnique() {
    for (let i = 0; i < 24; i++) {
      const win = i < 12;
      proSignalLog.append({
        code: 'YB' + i, instrumentId: 'BTCUSD', symbol: 'BTC/USD', direction: 'long', tfs: ['4h'], confidence: 70,
        votes: win ? [{ technique: 'genel', vote: 'long', score: 70 }] : [{ technique: 'genel', vote: 'short', score: 30 }],
        outcome: { result: win ? 'TP1' : 'SL', pnlPct: win ? 5 : -3 },
      });
    }
  }

  test('hep kazanan teknik (≥12 örnek) → POZİTİF delta, ≤+0.15, [0.5,4.0] içinde', async () => {
    seedWinningTechnique();
    const r = await proSelfTest.run();
    expect(r.applied).toBe(true);
    expect(r.overall.n).toBe(24);
    const change = r.changes.find(c => c.type === 'weight' && c.key === 'genel');
    expect(change).toBeDefined();
    const delta = change.after - change.before;
    expect(delta).toBeGreaterThan(0);                 // kazanan → ağırlık ARTAR
    expect(delta).toBeLessThanOrEqual(0.15 + 1e-9);   // ±0.15/run sınırı
    expect(r.weights.genel).toBeGreaterThanOrEqual(0.5);
    expect(r.weights.genel).toBeLessThanOrEqual(4.0); // sert bant
    expect(r.weights.genel).toBeGreaterThan(proConfluence.BASE_WEIGHTS.genel);
  });

  test('düşük genel WR (<0.48) → eşik +2 (±2 ve [55,80] içinde)', async () => {
    // 10 kazanan / 14 kaybeden → overall ~0.417 < 0.48 → bar yükselt (+2).
    for (let i = 0; i < 24; i++) {
      const win = i < 10;
      proSignalLog.append({
        code: 'YB' + i, instrumentId: 'BTCUSD', symbol: 'BTC/USD', direction: 'long', tfs: ['4h'], confidence: 70,
        votes: [{ technique: 'genel', vote: win ? 'long' : 'short', score: win ? 70 : 30 }],
        outcome: { result: win ? 'TP1' : 'SL', pnlPct: win ? 5 : -3 },
      });
    }
    const r = await proSelfTest.run();
    const thr = r.changes.find(c => c.type === 'threshold');
    expect(thr).toBeDefined();
    expect(thr.after - thr.before).toBe(2);           // |Δ| = 2
    expect(r.pushThreshold).toBe(62);
    expect(r.pushThreshold).toBeGreaterThanOrEqual(55);
    expect(r.pushThreshold).toBeLessThanOrEqual(80);
  });

  test('yüksek WR (>0.60) → eşik -2', async () => {
    for (let i = 0; i < 24; i++) {
      const win = i < 18;                              // 18/24 = 0.75
      proSignalLog.append({
        code: 'YB' + i, instrumentId: 'BTCUSD', symbol: 'BTC/USD', direction: 'long', tfs: ['4h'], confidence: 70,
        votes: [{ technique: 'genel', vote: win ? 'long' : 'short', score: win ? 70 : 30 }],
        outcome: { result: win ? 'TP1' : 'SL', pnlPct: win ? 5 : -3 },
      });
    }
    const r = await proSelfTest.run();
    const thr = r.changes.find(c => c.type === 'threshold');
    expect(thr.after - thr.before).toBe(-2);
    expect(r.pushThreshold).toBe(58);
  });
});
