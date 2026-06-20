/**
 * GOLDEN TESTS — YENİ ROBOT · proBacktest (NO-LOOKAHEAD + yerel özet).
 *
 * EN KRİTİK ÖZELLİK: buildSignals geçmiş bar i için motora YALNIZ candles.slice(0,i+1)
 * (tarihsel ön ek) verir; ileri (gelecek) barları sinyal üretiminde ASLA görmez.
 *   → proConfluence.analyzeTF mock'lanır, her çağrıda aldığı mum uzunluğu kaydedilir;
 *     hiçbiri tüm seri uzunluğunu görmez ve her çağrı tam i+1 prefix'idir.
 *
 * Ayrıca summarizeLocally (JS fallback) sabit fixture'da kilitlenir:
 *   • SL önce vurulursa → loss (winRate 0, PF 0)
 *   • TP1 önce vurulursa → win  (winRate 100, PF 999 = kayıpsız)
 *
 * Sidecar devre dışı (BACKTEST_SERVICE_URL set EDİLMEZ) → buildSignals/summarize
 * saf JS yolundan koşar (ağ yok). summarizeLocally zaten ağa dokunmaz.
 */

delete process.env.BACKTEST_SERVICE_URL;

// proConfluence'i mock'la — buildSignals'a verilen mum uzunluklarını yakala.
const seenLengths = [];
jest.mock('../../src/services/proSignals/proConfluence', () => ({
  __esModule: false,
  BASE_WEIGHTS: { genel: 3.0 },
  TECHNIQUE_KEYS: ['genel'],
  analyzeTF: jest.fn(async (candles) => {
    seenLengths.push(candles.length);
    return { status: 'neutral', direction: 'neutral' };
  }),
}));

const proBacktest = require('../../src/services/proSignals/proBacktest');

function bar(time) { return { time, open: 100, high: 101, low: 99, close: 100, volume: 1 }; }
function series(n) { const c = []; for (let i = 0; i < n; i++) c.push(bar(i)); return c; }

describe('proBacktest.buildSignals — NO-LOOKAHEAD', () => {
  beforeEach(() => { seenLengths.length = 0; });

  test('analyzeTF her zaman SADECE i+1 prefix\'i görür; tüm seriyi ASLA görmez', async () => {
    const N = 300;
    const candles = series(N);
    const inst = { id: 'BTCUSD', class: 'crypto', precision: 2, yahoo: 'BTC-USD' };
    const { horizon } = await proBacktest.buildSignals(inst, '1h', candles, { lookback: 20 });

    // 1h horizon=12 → end = 300-12 = 288; start = max(220, 288-20) = 268.
    // Bar i için hist uzunluğu = i+1 → i=268..287 ⇒ uzunluklar 269..288.
    expect(horizon).toBe(12);
    expect(seenLengths.length).toBe(20);
    expect(Math.min(...seenLengths)).toBe(269);
    expect(Math.max(...seenLengths)).toBe(288);

    // İLERİ BARLAR ASLA görülmedi: hiçbir çağrı (end) ya da tüm seri (N) kadar uzun değil.
    expect(Math.max(...seenLengths)).toBeLessThan(N);
    // Çağrılar tam ardışık prefix dizisi (269,270,...,288) — atlama/sıçrama yok.
    const expected = Array.from({ length: 20 }, (_, k) => 269 + k);
    expect(seenLengths).toEqual(expected);
    // İleri değerleme penceresi (288..299) sinyal üretiminde görünmedi.
    for (const len of seenLengths) expect(len).toBeLessThanOrEqual(N - horizon);
  });
});

describe('proBacktest.summarizeLocally — TP/SL sonuç sayımı (JS fallback)', () => {
  function fwdCandle(time, high, low) { return { time, open: 100, high, low, close: 100 }; }

  test('SL önce vurulur → loss (winRate 0, PF 0, expectancy negatif)', () => {
    // long entry 100, stop 95, target 110; ileri bar low 94 → SL hit.
    const candles = [bar(0), fwdCandle(1, 100, 94), bar(2), bar(3)];
    const signals = [{ index: 0, direction: 'long', entry: 100, stop: 95, target: 110, band: 'high' }];
    const r = proBacktest.summarizeLocally(candles, signals, 3);
    expect(r.all.winRate).toBe(0);
    expect(r.all.sampleSize).toBe(1);
    expect(r.all.profitFactor).toBe(0);
    expect(r.all.avgReturn).toBe(-5);          // (95-100)/100*100
    expect(r.all.expectancy).toBe(-5);
    expect(r.high.winRate).toBe(0);            // banda da yazıldı
  });

  test('TP1 önce vurulur → win (winRate 100, PF 999 = kayıpsız)', () => {
    const candles = [bar(0), fwdCandle(1, 111, 100), bar(2), bar(3)];
    const signals = [{ index: 0, direction: 'long', entry: 100, stop: 95, target: 110, band: 'high' }];
    const r = proBacktest.summarizeLocally(candles, signals, 3);
    expect(r.all.winRate).toBe(100);
    expect(r.all.sampleSize).toBe(1);
    expect(r.all.profitFactor).toBe(999);      // kayıpsız → sidecar pariteli 999
    expect(r.all.avgReturn).toBe(10);          // (110-100)/100*100
    expect(r.all.expectancy).toBe(10);
  });

  test('aynı barda HEM SL HEM TP → tutucu: SL (loss)', () => {
    // Aynı bar low 94 (SL) ve high 111 (TP) → evalForward önce SL kontrol eder → loss.
    const candles = [bar(0), fwdCandle(1, 111, 94), bar(2), bar(3)];
    const signals = [{ index: 0, direction: 'long', entry: 100, stop: 95, target: 110, band: 'high' }];
    const r = proBacktest.summarizeLocally(candles, signals, 3);
    expect(r.all.winRate).toBe(0);
  });

  test('sinyal yok → tüm bantlar boş (null winRate)', () => {
    const r = proBacktest.summarizeLocally(series(10), [], 3);
    expect(r.all.winRate).toBeNull();
    expect(r.all.sampleSize).toBe(0);
  });
});
