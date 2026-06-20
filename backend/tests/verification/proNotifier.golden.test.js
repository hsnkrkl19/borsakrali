/**
 * GOLDEN TESTS — YENİ ROBOT · proPushNotifier (saf kurucular + kalite kapısı).
 *
 *   1) buildNew — "🤖 YENİ ROBOT" markası + doğru NO ön eki (#YB01); "lot" satırı YOK;
 *      ters sinyalde "TERS SİNYAL" + zıt pozisyon NO.
 *   2) qualityGate — yüksek güven + iyi/yok geçmiş PASS; güven eşik altı BLOCK;
 *      örneklem ≥12 ve geçmiş kötü → BLOCK; kapı kapalıyken (PRO_QUALITY_GATE=0)
 *      yalnız güven eşiğine bakılır.
 *
 * Hermetik: yalnız saf mesaj kurucular ve saf qualityGate çağrılır — gerçek
 * Telegram gönderimi YOK (token tanımsız → telegramService no-op; zaten evaluateAndPush
 * çağrılmaz). Mesaj string'leri doğrulanır.
 */

const notifier = require('../../src/services/proSignals/proPushNotifier');

const pos = {
  code: 'YB01', instrumentId: 'BTCUSD', symbol: 'BTC/USD', direction: 'long', precision: 2,
  entry: 100, stop: 95, target1: 110, target2: 120, rr1: 2, rr2: 4, confidence: 78,
  tfs: ['4h', '1d'], marginUsd: 50, marginPct: 0.5, units: 20, mt5Symbol: 'BTCUSD',
};

describe('proPushNotifier.buildNew — marka + NO + "lot" yok', () => {
  test('"🤖 YENİ ROBOT" başlık, #YB01, güven, MT5; "lot" satırı YOK', () => {
    const m = notifier.buildNew(pos, [], { votes: [{ technique: 'genel', vote: 'long' }, { technique: 'smc', vote: 'long' }] });
    expect(m).toContain('🤖');
    expect(m).toContain('YENİ ROBOT');
    expect(m).toContain('#YB01');
    expect(m).toContain('BTC/USD');
    expect(m).toContain('78/100');
    expect(m).toContain('LONG');
    expect(m).toMatch(/MT5/);
    expect(m).not.toMatch(/lot/i);                // lot/risk satırı yok
  });

  test('YA ön eki XAU pozisyonunda görünür', () => {
    const m = notifier.buildNew({ ...pos, code: 'YA01', instrumentId: 'XAUUSD', symbol: 'XAU/USD', mt5Symbol: 'XAUUSD' }, []);
    expect(m).toContain('#YA01');
    expect(m).toContain('XAU/USD');
  });

  test('ters sinyal → "TERS SİNYAL" + zıt pozisyon NO', () => {
    const m = notifier.buildNew({ ...pos, direction: 'short' }, ['YB01']);
    expect(m).toMatch(/TERS SİNYAL/);
    expect(m).toContain('#YB01');
    expect(m).toContain('SHORT');
  });
});

describe('proPushNotifier.qualityGate — varsayılan AÇIK', () => {
  const prev = process.env.PRO_QUALITY_GATE;
  beforeEach(() => { delete process.env.PRO_QUALITY_GATE; });
  afterAll(() => { if (prev === undefined) delete process.env.PRO_QUALITY_GATE; else process.env.PRO_QUALITY_GATE = prev; });

  test('yüksek güven + geçmiş YOK → PASS', () => {
    const g = notifier.qualityGate({ confidence: 75 }, 60);
    expect(g.passed).toBe(true);
    expect(g.reasons).toHaveLength(0);
  });

  test('güven eşik ALTI → BLOCK (gerekçe conf<thr)', () => {
    const g = notifier.qualityGate({ confidence: 50 }, 60);
    expect(g.passed).toBe(false);
    expect(g.reasons.some(r => /conf/.test(r))).toBe(true);
  });

  test('örneklem ≥12 + geçmiş KÖTÜ (wr<45 & PF<1 & exp≤0) → BLOCK', () => {
    const g = notifier.qualityGate({ confidence: 75, sampleSize: 20, historicalWinRate: 30, profitFactor: 0.5, historicalAvgReturn: -1 }, 60);
    expect(g.passed).toBe(false);
    expect(g.reasons.some(r => /bt /.test(r))).toBe(true);
  });

  test('örneklem ≥12 + geçmiş İYİ → PASS', () => {
    const g = notifier.qualityGate({ confidence: 75, sampleSize: 20, historicalWinRate: 60, profitFactor: 1.5, historicalAvgReturn: 1 }, 60);
    expect(g.passed).toBe(true);
  });

  test('örneklem AZ (<12) + kötü geçmiş → yine PASS (ısınmamış → engellenmez)', () => {
    const g = notifier.qualityGate({ confidence: 75, sampleSize: 5, historicalWinRate: 30, profitFactor: 0.5 }, 60);
    expect(g.passed).toBe(true);
  });
});

describe('proPushNotifier.qualityGate — PRO_QUALITY_GATE=0 (yalnız güven)', () => {
  const prev = process.env.PRO_QUALITY_GATE;
  beforeEach(() => { process.env.PRO_QUALITY_GATE = '0'; });
  afterAll(() => { if (prev === undefined) delete process.env.PRO_QUALITY_GATE; else process.env.PRO_QUALITY_GATE = prev; });

  test('kötü geçmiş AMA güven eşik üstü → PASS (backtest kapısı atlanır)', () => {
    const g = notifier.qualityGate({ confidence: 75, sampleSize: 20, historicalWinRate: 30, profitFactor: 0.5 }, 60);
    expect(g.passed).toBe(true);
  });

  test('güven eşik altı → yine BLOCK', () => {
    const g = notifier.qualityGate({ confidence: 40, sampleSize: 20, historicalWinRate: 90, profitFactor: 3 }, 60);
    expect(g.passed).toBe(false);
  });
});
