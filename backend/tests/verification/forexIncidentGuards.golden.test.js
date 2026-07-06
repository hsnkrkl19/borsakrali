/**
 * GOLDEN TESTS — 2026-07-06 gece olayı düzeltmeleri.
 * Olay: düşen piyasada gece boyu YALNIZ long açıldı (short sıfır), zarar ede ede
 * yeniden girildi, hiçbir fren durdurmadı (-%3.3 tek gecede). Doğrulanan düzeltmeler:
 *   1) genelTarama simetrisi: düşen piyasada SHORT oylanabiliyor (12 boğa + 12 ayı).
 *   2) forexAggregator: ADX trend gücü ters-yön sinyale güven puanı EKLEMİYOR (DI kapısı).
 *   3) forexDailyGuard: günlük gerçekleşen-zarar eşiği yeni pozisyonu blokluyor.
 *   4) tracker: günlük fren syncPositions'ta gerçek pozisyon açılmasını durduruyor.
 *   5) dropClosed: köprü kapanışları zarar olarak sınıflandırılıp öğrenmeye +
 *      kademeli frene akıyor (eskiden sessizce düşüyordu — devre kesici kördü).
 */
const os = require('os');
const path = require('path');

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.FOREX_RESET;

// ── 1) genelTarama simetrisi ────────────────────────────────────────────────
describe('genelTarama — boğa/ayı simetrisi (2026-07-06)', () => {
  const genel = require('../../src/services/forex/strategies/genelTarama');

  function mkCandles(closes) {
    return closes.map((c, i) => {
      const prev = i ? closes[i - 1] : c;
      return {
        time: 1000 + i * 300, open: prev,
        high: Math.max(prev, c) + 0.05, low: Math.min(prev, c) - 0.05,
        close: c, volume: 0,
      };
    });
  }

  test('istikrarlı düşüşte modül SHORT oylayabiliyor (eski 11/6 evrende ayı koşulları ulaşılamazdı)', () => {
    const closes = [];
    for (let i = 0; i < 120; i++) closes.push(100 - i * 0.15 + (i % 5 === 0 ? 0.03 : 0));
    const r = genel.evaluate(mkCandles(closes));
    expect(r).not.toBeNull();
    expect(r.vote).toBe('short');
    expect(r.shortHits).toBeGreaterThanOrEqual(2);
    expect(r.longHits).toBe(0);
  });

  test('ayna yükselişte LONG oyluyor (simetri bozulmadı)', () => {
    const closes = [];
    for (let i = 0; i < 120; i++) closes.push(100 + i * 0.15 - (i % 5 === 0 ? 0.03 : 0));
    const r = genel.evaluate(mkCandles(closes));
    expect(r).not.toBeNull();
    expect(r.vote).toBe('long');
    expect(r.longHits).toBeGreaterThanOrEqual(2);
    expect(r.shortHits).toBe(0);
  });
});

// ── 2) forexAggregator — ADX yön kapısı ─────────────────────────────────────
describe('forexAggregator — trend gücü yön kapısı (2026-07-06)', () => {
  const { aggregate } = require('../../src/services/forex/forexAggregator');
  const mod = (vote) => ({ technique: 't', label: 't', weight: 3, vote, strength: 1, score: 80 });

  test('güçlü DÜŞÜŞ trendi (ndi>pdi) ters-yön LONG sinyale trend puanı EKLEMEZ', () => {
    const r = aggregate([mod('long')], { adx: 40, pdi: 10, ndi: 30, rsi: 30, macdHist: -1 });
    expect(r.direction).toBe('long');
    expect(r.trendStrength).toBe(0); // eskiden 1.0 → +16 güven puanı ekliyordu
  });

  test('trend yönle UYUMLUYSA (ndi>pdi & short) puan verilir', () => {
    const r = aggregate([mod('short')], { adx: 40, pdi: 10, ndi: 30, rsi: 30, macdHist: -1 });
    expect(r.direction).toBe('short');
    expect(r.trendStrength).toBe(1);
  });

  test('DI verisi yoksa eski davranış korunur (fail-open)', () => {
    const r = aggregate([mod('long')], { adx: 40, rsi: 30, macdHist: -1 });
    expect(r.trendStrength).toBe(1);
  });
});

// ── 3+4+5) dailyGuard + tracker entegrasyonu ───────────────────────────────
describe('forexDailyGuard + tracker — günlük zarar freni & köprü-kapanış öğrenmesi', () => {
  let tracker, dailyGuard, learning, fileN = 0;
  let mock5m = [];

  beforeEach(() => {
    jest.resetModules();
    const base = path.join(os.tmpdir(), `fx-guard-${process.pid}-${fileN++}`);
    process.env.FOREX_OPEN_FILE = `${base}-open.json`;
    process.env.FOREX_DAY_GUARD_FILE = `${base}-dayguard.json`;
    process.env.FOREX_LEARNING_FILE = `${base}-learning.json`;
    process.env.FOREX_LEARNING_GLOBAL_FILE = `${base}-learning-global.json`;
    delete process.env.FOREX_DAILY_GUARD_DISABLED;
    delete process.env.FOREX_DAILY_LOSS_STOP_PCT;
    jest.doMock('../../src/services/forex/forexKlines', () => ({
      fetchCandles: jest.fn(async () => mock5m),
    }));
    jest.doMock('../../src/services/forex/forexInstruments', () => ({
      getInstrument: () => ({ id: 'TEST', yahoo: 'TEST', precision: 2, class: 'metal' }),
    }));
    tracker = require('../../src/services/forex/forexSignalTracker');
    dailyGuard = require('../../src/services/forex/forexDailyGuard');
    learning = require('../../src/services/forex/forexLearning');
    dailyGuard._resetForTest();
    mock5m = [];
  });

  const sig = (over = {}) => ({ id: 'TEST', symbol: 'TEST', direction: 'long', precision: 2, tf: '1h',
    confidence: 80, entry: 100, stop: 98, target1: 104, target2: 108, ...over });

  test('broker günlük P/L eşiği aşınca check() bloklar; veri yokken fail-open', () => {
    expect(dailyGuard.check().blocked).toBe(false); // veri yok → fail-open
    dailyGuard.noteBroker({ realizedToday: -3000, balance: 97000 }); // gün-başı 100k → -%3 ≤ -%2.5
    expect(dailyGuard.check().blocked).toBe(true);
    dailyGuard._resetForTest();
    dailyGuard.noteBroker({ realizedToday: -1000, balance: 99000 }); // -%1 → serbest
    expect(dailyGuard.check().blocked).toBe(false);
  });

  test('backend tahmini SON ÇARE: kendi USD eşiği (vars. 800) ve broker verisi varken devre dışı', () => {
    dailyGuard.recordBackendClose(-500);
    expect(dailyGuard.check().blocked).toBe(false); // -500 > -800
    dailyGuard.recordBackendClose(-350); // toplam -850 ≤ -800
    expect(dailyGuard.check().blocked).toBe(true);
    // Taze broker verisi "gün iyi" diyorsa 10k-referanslı tahmin BLOKLAYAMAZ
    // (review: gerçek hesap 100k iken sanal-portföy tahmini hayalet blok üretiyordu)
    dailyGuard.noteBroker({ realizedToday: -100, balance: 99900 });
    expect(dailyGuard.check().blocked).toBe(false);
  });

  test('köprü-kapanış kanalı (POST /closed profit) freni besler — rapor sidecar ölse bile', () => {
    dailyGuard.recordBridgeClose(-1200);
    expect(dailyGuard.check().blocked).toBe(false); // bakiye yok → mutlak eşik 2500
    dailyGuard.recordBridgeClose(-1500); // toplam -2700 ≤ -2500
    expect(dailyGuard.check().blocked).toBe(true);
    // Bakiye öğrenilince yüzdeyle değerlendirilir (100k → -2700 ≈ -%2.63 ≤ -%2.5)
    dailyGuard.noteBroker({ balance: 97300 });
    expect(dailyGuard.check().blocked).toBe(true);
  });

  test('kill-switch: FOREX_DAILY_GUARD_DISABLED=1 freni kapatır', () => {
    dailyGuard.noteBroker({ realizedToday: -9000, balance: 91000 });
    process.env.FOREX_DAILY_GUARD_DISABLED = '1';
    expect(dailyGuard.check().blocked).toBe(false);
    delete process.env.FOREX_DAILY_GUARD_DISABLED;
  });

  test('fren aktifken syncPositions GERÇEK yeni pozisyon açmaz', async () => {
    dailyGuard.noteBroker({ realizedToday: -3000, balance: 97000 });
    const ev = await tracker.syncPositions([sig()]);
    expect(ev).toEqual([]);
    expect(tracker.getOpen()).toHaveLength(0);
  });

  test('dropClosed(profit<0) → zarar sınıflandırması: cooldown + öğrenme (enstrüman + global) + günlük fren beslenir', async () => {
    await tracker.syncPositions([sig()]);
    expect(tracker.getOpen()).toHaveLength(1);
    const code = tracker.getOpen()[0].code;
    const r = await tracker.dropClosed(code, 'bridge_vanished', { profit: -50, price: 97.9 });
    expect(r.dropped).toBe(true);
    // zarar cooldown'u: aynı yön hemen yeniden AÇILMAZ
    expect(await tracker.syncPositions([sig()])).toEqual([]);
    // öğrenme penceresi beslendi (eskiden köprü kapanışları HİÇ akmıyordu → kesici kördü)
    const sum = learning.summary();
    expect(sum.combos.TEST.real.n).toBe(1);
    // price=97.9, entry=100, stop=98 → r=(97.9-100)/2 = -1.05
    expect(sum.combos.TEST.real.sumR).toBeCloseTo(-1.05, 2);
    // sistem-geneli kesici AYRI çekirdekte izler (kendi ölçekli kuralları)
    expect(learning.global.summary().combos.__ALL__.real.n).toBe(1);
    // günlük fren köprü kanalından beslendi (gerçek USD)
    expect(dailyGuard.status().bridgeRealizedUsd).toBeCloseTo(-50, 2);
  });

  test('dropClosed nötr kapanışı (haber/hafta sonu) zarar SERİSİNİ sıfırlamaz', async () => {
    // 1. gerçek zarar → seri 1
    await tracker.syncPositions([sig()]);
    let code = tracker.getOpen()[0].code;
    await tracker.dropClosed(code, 'bridge_vanished', { profit: -60, price: 97.9 });
    // cooldown'u test için sıfırla (seriye DOKUNMADAN) — nötr kapanışın etkisini izole et
    process.env.FOREX_COOLDOWN_DISABLED = '1';
    await tracker.syncPositions([sig()]);
    code = tracker.getOpen()[0].code;
    await tracker.dropClosed(code, 'news', { profit: -5, price: 99.9 }); // nötr: seri KALIR
    await tracker.syncPositions([sig()]);
    code = tracker.getOpen()[0].code;
    const r = await tracker.dropClosed(code, 'bridge_vanished', { profit: -70, price: 97.8 });
    expect(r.dropped).toBe(true);
    delete process.env.FOREX_COOLDOWN_DISABLED;
    // seri 2'ye çıktı (nötr kapanış sıfırlasaydı 1 olurdu — review: haber penceresi
    // kademeli freni deliyordu) ve cooldown yeni pozisyonu blokluyor
    expect(tracker._lossStreakFor('TEST:long')).toBe(2);
    expect(await tracker.syncPositions([sig()])).toEqual([]);
  });

  test('dropClosed hafta-sonu/haber kapanışını zarar SAYMAZ (nötr) — öğrenmeye akmaz', async () => {
    await tracker.syncPositions([sig()]);
    const code = tracker.getOpen()[0].code;
    await tracker.dropClosed(code, 'weekend', { profit: -5, price: 99.9 });
    const sum = learning.summary();
    expect((sum.combos.TEST || { real: { n: 0 } }).real.n).toBe(0);
  });
});
