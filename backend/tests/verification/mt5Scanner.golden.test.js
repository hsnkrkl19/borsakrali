/**
 * GOLDEN TESTS — MT5 GÜN-İÇİ tarayıcı (9 enstrüman × 5 TF, her dk).
 *
 * Kapsam:
 *   1) mt5Levels.buildLevels — gün-içi ATR çarpanları, günlük-ATR kıskacı
 *      (TP1 ≤ 0.9×dailyATR, R/R korunur), long/short simetri.
 *   2) mt5Levels.snapSizingToBroker — lot AŞAĞI yuvarlama (risk hedefi aşılmaz),
 *      volumeMin altı → asgari lot; asgari lot kural tavanını aşarsa null;
 *      $ değerleri yuvarlanmış lottan yeniden hesap.
 *   3) mt5Tracker — risk bütçesi matematiği (günlük %5 / toplam %10, açık risk
 *      dahil), gate kuralları (dedup / yön kilidi / cooldown / pencere / bütçe),
 *      sıralı açılışta bütçe tükenmesi, NO formatı (G+prefix+sayı).
 *   4) mt5Tracker.checkClosures — yalnız KAPANMIŞ 5m mumlar; TP1 / SL / aynı
 *      mumda ikisi → açılışa yakın seviye; gap'te çıkış = mum açılışı; süresi
 *      geçen pozisyon → EOD kapanışı (son kapanmış mumun kapanışı); kapanışta
 *      cooldown + gün/toplam sayaç güncellenir.
 *   5) mt5Notifier saf kurucular — yeni sinyal mesajında lot + MUTLAK SL/TP +
 *      güven + gün-içi uyarısı; kapanış mesajında aynı NO + $ ve % sonuç.
 *
 * forexKlines, telegramService, pushNotificationService ve botPersistence
 * mock'lanır → ağ yok, izole. Zaman: MT5_FAKE_TR_MIN ile sabitlenir.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Geçici veri dizini — gerçek data/ kirlenmesin (require'lardan ÖNCE!)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mt5-golden-'));
process.env.BOT_DATA_DIR = TMP;
process.env.MT5_FAKE_TR_MIN = String(14 * 60); // 14:00 TR — pencere AÇIK
delete process.env.MT5_RESET;

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

// 5m mumları test senaryosu besler
let mockCandles = [];
jest.mock('../../src/services/forex/forexKlines', () => ({
  ...jest.requireActual('../../src/services/forex/forexKlines'), // closedBars/TF_MS saf kalsın
  fetchCandles: async () => mockCandles,
}));

const levels = require('../../src/services/mt5Scanner/mt5Levels');
const tracker = require('../../src/services/mt5Scanner/mt5Tracker');
const notifier = require('../../src/services/mt5Scanner/mt5Notifier');
const { getInstrument } = require('../../src/services/mt5Scanner/mt5Instruments');
const { computeSizing } = require('../../src/services/forex/riskSizing');

const nowSec = () => Math.floor(Date.now() / 1000);

function resetState() {
  // tracker modül-içi durumunu sıfırla: dosyayı sil + jest module registry resetle
  try { fs.rmSync(path.join(TMP, 'mt5-scanner'), { recursive: true, force: true }); } catch (_) {}
}

function makeSignal(over = {}) {
  const inst = getInstrument(over.id || 'XAUUSD');
  const entry = over.entry ?? 4000;
  const stop = over.stop ?? 3980;
  const raw = computeSizing(
    { instrument: inst, entry, stop, direction: over.direction || 'long' },
    { equity: over.equity || 10000, riskPerTradePct: 0.01 }
  );
  const sizing = levels.snapSizingToBroker(raw, inst, entry, stop, { maxRiskUsd: (over.equity || 10000) * 0.05 });
  return {
    id: inst.id, symbol: inst.symbol, tf: over.tf || '15m', direction: over.direction || 'long',
    precision: inst.precision, entry, stop, target1: over.target1 ?? 4020, target2: over.target2 ?? 4035,
    confidence: over.confidence ?? 70, rr1: 1.0, grade: 'GUCLU',
    sizing, pnl: levels.buildPnL(sizing.units, entry, { stop, target1: over.target1 ?? 4020, target2: over.target2 ?? 4035 }),
    mt5: levels.buildMt5(inst, over.direction || 'long', sizing.lots, { entry, stop, target1: over.target1 ?? 4020, target2: over.target2 ?? 4035 }, over.tf || '15m', inst.precision),
    ...over.extra,
  };
}

// ── 1) buildLevels ──────────────────────────────────────────────────────────
describe('mt5Levels.buildLevels — gün-içi seviyeler', () => {
  test('15m long: SL/TP çarpanları ve R/R doğru (R:R düzeltmesi 2026-07-21)', () => {
    const l = levels.buildLevels('long', 100, 1, '15m', 2, null);
    expect(l.entry).toBe(100);
    expect(l.stop).toBe(100 - 1.5);       // sl 1.5×ATR
    expect(l.target1).toBe(100 + 2.8);    // tp1 2.8×ATR
    expect(l.target2).toBe(100 + 4.6);    // tp2 4.6×ATR
    // Eski tablo 1.4/1.3 = 1.08 R:R veriyordu → %48 isabet gerekiyordu (yapısal
    // zarar). Yeni tablo ≥1.8: %35 isabetle bile pozitif beklenti.
    expect(l.rr1).toBeCloseTo(2.8 / 1.5, 1);
    expect(l.rr1).toBeGreaterThanOrEqual(1.8);
  });

  test('short simetrik', () => {
    const l = levels.buildLevels('short', 100, 1, '15m', 2, null);
    expect(l.stop).toBe(101.5);
    expect(l.target1).toBe(97.2);
  });

  test('günlük-ATR kıskacı: TP1 ≤ 1.7×dailyATR, oran korunur', () => {
    // 1h ATR=5 → tp1 mesafesi 3.0×5=15; dailyATR=5 → tavan 8.5 → k=8.5/15
    const l = levels.buildLevels('long', 100, 5, '1h', 2, 5);
    const k = 8.5 / 15;
    expect(Math.abs(l.target1 - 100)).toBeCloseTo(8.5, 2);
    expect(Math.abs(100 - l.stop)).toBeCloseTo(1.6 * 5 * k, 2); // sl 1.6×5×k
    const rrPlain = levels.buildLevels('long', 100, 5, '1h', 2, null);
    expect(l.rr1).toBeCloseTo(rrPlain.rr1, 2); // R/R değişmedi
  });

  test('1d: geniş stop + ≥1.8 R:R (eski 0.5×ATR dar stop kaldırıldı)', () => {
    // ESKİ: sl 0.5×ATR / tp1 0.55×ATR → R:R 1.10 ve aşırı dar stop (kuruş K/Z).
    // YENİ: sl 2.0×ATR / tp1 3.8×ATR → R:R 1.90, anlamlı mesafe.
    const l = levels.buildLevels('long', 100, 4, '1d', 2, null);
    expect(Math.abs(100 - l.stop)).toBeCloseTo(8, 5);      // 2.0×ATR
    expect(Math.abs(l.target1 - 100)).toBeCloseTo(15.2, 5); // 3.8×ATR
    expect(l.rr1).toBeGreaterThanOrEqual(1.8);
  });
});

// ── 2) snapSizingToBroker ───────────────────────────────────────────────────
describe('mt5Levels.snapSizingToBroker — MT5 lot adımı', () => {
  const xau = getInstrument('XAUUSD'); // kontrat 100, step 0.01

  test('lot AŞAĞI yuvarlanır, risk yuvarlanmış lottan hesaplanır', () => {
    // risk $100, stop mesafesi 20$ → units 5 → lot 0.05 (tam)
    const raw = computeSizing({ instrument: xau, entry: 4000, stop: 3980, direction: 'long' }, { equity: 10000, riskPerTradePct: 0.01 });
    const s = levels.snapSizingToBroker(raw, xau, 4000, 3980, { maxRiskUsd: 500 });
    expect(s.lots).toBe(0.05);
    expect(s.units).toBe(5);
    expect(s.riskUsd).toBeCloseTo(100, 0);
    expect(s.requiredMarginUsd).toBeCloseTo((5 * 4000) / 100, 2);
  });

  test('küsurat aşağı: 0.057 → 0.05 (risk hedefin ALTINDA kalır)', () => {
    const raw = { lots: 0.057, equity: 10000, leverage: 100 };
    const s = levels.snapSizingToBroker(raw, xau, 4000, 3982.5, { maxRiskUsd: 500 });
    expect(s.lots).toBe(0.05);
    expect(s.riskUsd).toBeLessThanOrEqual(0.057 * 100 * 17.5 + 1e-6);
  });

  test('REGRESYON: computeSizing yarım-yukarı lotu (0.0368→0.04) riski hedef üstüne taşımaz', () => {
    // Canlıda yakalandı: XAU 4141/4113.83 → ham units 3.68 → computeSizing
    // lots'u 0.04'e yuvarlıyordu → risk $108.68 > $100 hedef. Doğrusu 0.03.
    const raw = computeSizing({ instrument: xau, entry: 4141, stop: 4113.83, direction: 'long' }, { equity: 10000, riskPerTradePct: 0.01 });
    const s = levels.snapSizingToBroker(raw, xau, 4141, 4113.83, { maxRiskUsd: 500 });
    expect(s.lots).toBe(0.03);
    expect(s.riskUsd).toBeLessThanOrEqual(100 + 1e-6);
  });

  test('volumeMin altı: asgari lot riski tavana sığıyorsa asgari kullanılır', () => {
    const raw = { lots: 0.004, equity: 10000, leverage: 100 };
    const s = levels.snapSizingToBroker(raw, xau, 4000, 3980, { maxRiskUsd: 500 });
    expect(s.lots).toBe(0.01); // vmin
    expect(s.riskUsd).toBeCloseTo(0.01 * 100 * 20, 2); // $20
  });

  test('asgari lot bile kural tavanını aşıyorsa null (işlem verilmez)', () => {
    const eur = getInstrument('EURUSD'); // kontrat 100k
    // stop mesafesi 0.01 → asgari lot riski 0.01×100000×0.01 = $10 ≤ tavan → geçer;
    // tavanı 5$ yaparsak red
    const raw = { lots: 0.004, equity: 10000, leverage: 100 };
    expect(levels.snapSizingToBroker(raw, eur, 1.1, 1.09, { maxRiskUsd: 5 })).toBeNull();
  });
});

// ── 3) Tracker: bütçe + gate ────────────────────────────────────────────────
describe('mt5Tracker — risk bütçesi ve kapılar', () => {
  beforeEach(() => {
    jest.resetModules();
    resetState();
    process.env.MT5_FAKE_TR_MIN = String(14 * 60);
  });

  function freshTracker() {
    // jest.resetModules sonrası taze modül (module-level state sıfır)
    return require('../../src/services/mt5Scanner/mt5Tracker');
  }

  test('boş durumda bütçe: 10k → günlük $500 / toplam $1000', async () => {
    const t = freshTracker();
    await t.load();
    const b = t.budget(10000);
    expect(b.dailyCapUsd).toBe(500);
    expect(b.totalCapUsd).toBe(1000);
    expect(b.remainingDailyUsd).toBe(500);
    expect(b.remainingTotalUsd).toBe(1000);
    expect(b.windowOpen).toBe(true);
  });

  test('sıralı açılış: günlük risk bütçesi dolunca YENİ pozisyon reddedilir', async () => {
    const t = freshTracker();
    await t.load();
    // Her enstrümana KENDİ fiyat ölçeğinde giriş/stop (lot hesabı gerçekçi kalsın)
    const cases = [
      { id: 'XAUUSD', entry: 4000, stop: 3980, target1: 4020, target2: 4035 },
      { id: 'BTCUSD', entry: 60000, stop: 58000, target1: 62000, target2: 63500 },
      { id: 'EURUSD', entry: 1.10, stop: 1.099, target1: 1.101, target2: 1.102 },
      { id: 'SPX500', entry: 7500, stop: 7400, target1: 7600, target2: 7680 },
      { id: 'NAS100', entry: 30000, stop: 29600, target1: 30400, target2: 30700 },
    ];
    // ⚠️ 2026-07-24: lot tavanı 0.15'e indi → dar stoplu kurulumlarda (EURUSD,
    // SPX500) lot kırpıldığı için işlem başı $ risk DÜŞTÜ ve bütçe artık 5
    // pozisyonda dolmuyor. Test sabit sayı yerine DAVRANIŞI ölçer: bütçe eninde
    // sonunda dolar ve dolduğunda sebep 'budget-*' olur.
    const tfs = ['15m', '1h', '4h', '1d', '5m'];
    let blocked = null, opened = 0;
    for (const tf of tfs) {
      for (const c of cases) {
        const r = await t.openPosition(makeSignal({ ...c, tf }), 10000);
        if (r.ok) {
          opened++;
          expect(r.position.code).toMatch(/^G[A-Z]{2}\d{2}$/);
          // LOT TAVANI değişmezi: hiçbir pozisyon 0.15 lotu aşamaz.
          expect(r.position.lots).toBeLessThanOrEqual(0.15);
        } else if (String(r.reason || '').startsWith('budget-')) {
          blocked = r; break;
        }
      }
      if (blocked) break;
    }
    expect(opened).toBeGreaterThan(0);
    expect(blocked).not.toBeNull();
    expect(blocked.reason).toMatch(/^budget-/);
  });

  test('⭐ YASAK ENSTRÜMAN: gümüşe yeni pozisyon açılmaz (bütçe boşken bile)', async () => {
    const t = freshTracker();
    await t.load();
    const sig = makeSignal({ id: 'XAGUSD', entry: 60, stop: 59.4, target1: 60.6, target2: 61.1, tf: '15m' });
    const g = t.gate(sig, 10000);
    expect(g.ok).toBe(false);
    expect(g.reason).toBe('instrument-banned');
    const r = await t.openPosition(sig, 10000);
    expect(r.ok).toBe(false);
  });

  test('dedup + yön kilidi + pencere', async () => {
    const t = freshTracker();
    await t.load();
    const sig = makeSignal({ id: 'XAUUSD', tf: '15m', direction: 'long' });
    expect((await t.openPosition(sig, 10000)).ok).toBe(true);
    // aynı (enstrüman, TF) tekrar → open-exists
    expect(t.gate(makeSignal({ id: 'XAUUSD', tf: '15m', direction: 'long' }), 10000).reason).toBe('open-exists');
    // aynı enstrüman farklı TF ters yön → conflict (yön kilidi)
    expect(t.gate(makeSignal({ id: 'XAUUSD', tf: '1h', direction: 'short', stop: 4020, target1: 3980, target2: 3970 }), 10000).reason).toBe('conflict');
    // 23:10 TR → pencere kapalı
    process.env.MT5_FAKE_TR_MIN = String(23 * 60 + 10);
    expect(t.gate(makeSignal({ id: 'BTCUSD', tf: '15m' }), 10000).reason).toBe('window-closed');
  });
});

// ── 4) Kapanış tespiti ──────────────────────────────────────────────────────
describe('mt5Tracker.checkClosures — TP/SL/EOD', () => {
  beforeEach(() => {
    jest.resetModules();
    resetState();
    process.env.MT5_FAKE_TR_MIN = String(14 * 60);
    mockCandles = [];
  });

  function freshTracker() { return require('../../src/services/mt5Scanner/mt5Tracker'); }

  function candle(tOffsetSec, o, h, l, c) {
    return { time: nowSec() + tOffsetSec, open: o, high: h, low: l, close: c, volume: 1 };
  }

  async function openXau(t, over = {}) {
    const sig = makeSignal({ id: 'XAUUSD', tf: '15m', direction: 'long', entry: 4000, stop: 3980, target1: 4020, target2: 4035, ...over });
    const r = await t.openPosition(sig, 10000);
    expect(r.ok).toBe(true);
    return r.position;
  }

  test('TP1: kapanmış mum hedefe değince aynı NO ile kapanır, kâr POZİTİF', async () => {
    const t = freshTracker();
    await t.load();
    const pos = await openXau(t);
    mockCandles = [
      candle(60, 4005, 4025, 4004, 4022),   // hedef vuruldu (kapanmış)
      candle(360, 4022, 4023, 4021, 4022),  // son mum (oluşuyor sayılır — dışlanır)
    ];
    const evs = await t.checkClosures();
    expect(evs).toHaveLength(1);
    expect(evs[0].code).toBe(pos.code);
    expect(evs[0].outcome).toBe('TP1');
    expect(evs[0].exit).toBe(4020);
    expect(evs[0].pnlUsd).toBeGreaterThan(0);
    // kapanış cooldown başlatır
    expect(t.gate(makeSignal({ id: 'XAUUSD', tf: '15m' }), 10000).reason).toBe('cooldown');
    // gün sayaçları
    expect(t.getDayStats().tp).toBe(1);
    expect(t.getTotalStats().wins).toBe(1);
  });

  test('OLUŞAN son mum TP/SLyi TETİKLEYEMEZ (hayalet kapanış koruması)', async () => {
    const t = freshTracker();
    await t.load();
    await openXau(t);
    mockCandles = [candle(60, 4005, 4025, 4004, 4022)]; // tek mum → "oluşuyor" sayılır, dışlanır
    expect(await t.checkClosures()).toHaveLength(0);
  });

  test('gap: mum stopun ALTINDA açıldıysa çıkış = mum açılışı (gerçekçi dolum)', async () => {
    const t = freshTracker();
    await t.load();
    await openXau(t);
    mockCandles = [
      candle(60, 3960, 3965, 3955, 3958),   // stopun (3980) çok altında açılış
      candle(360, 3958, 3959, 3957, 3958),
    ];
    const evs = await t.checkClosures();
    expect(evs[0].outcome).toBe('SL');
    expect(evs[0].exit).toBe(3960);          // seviye DEĞİL, açılış
    expect(evs[0].pnlUsd).toBeLessThan(0);
  });

  test('aynı mumda SL+TP: açılışa yakın seviye kazanır', async () => {
    const t = freshTracker();
    await t.load();
    await openXau(t);
    // açılış 4018 → TP1'e (4020) 2$, SL'e (3980) 38$ → TP önce
    mockCandles = [
      candle(60, 4018, 4022, 3975, 3990),
      candle(360, 3990, 3991, 3989, 3990),
    ];
    const evs = await t.checkClosures();
    expect(evs[0].outcome).toBe('TP1');
  });

  test('EOD: süresi geçen pozisyon son kapanmış mumun kapanışıyla kapanır', async () => {
    const t = freshTracker();
    await t.load();
    // 23:30 TR'de pencere kapalı → 14:00'te aç, sonra saati 23:46'ya al
    const pos = await openXau(t);
    process.env.MT5_FAKE_TR_MIN = String(23 * 60 + 50); // eodDeadline geçti (deadline bugün 23:45'ti)
    // deadline'ı geçmiş say: pozisyonun kendi deadline'ı open anındaki saate göre
    // (14:00 + 585dk = 23:45). nowSec henüz o zamana ulaşmadı → elle geçir:
    pos.eodDeadlineSec = nowSec() - 60;
    mockCandles = [
      candle(-300, 4001, 4009, 3999, 4008), // seviyelere değmeyen mumlar
      candle(60, 4008, 4009, 4007, 4008),
    ];
    const evs = await t.checkClosures();
    expect(evs).toHaveLength(1);
    expect(evs[0].outcome).toBe('EOD');
    expect(evs[0].exit).toBe(4008);          // son KAPANMIŞ mumun kapanışı
    expect(t.getDayStats().eod).toBe(1);
  });
});

// ── 5) Notifier mesaj kurucuları ────────────────────────────────────────────
describe('mt5Notifier — mesaj formatı', () => {
  test('yeni sinyal: NO + lot + MUTLAK SL/TP + güven + gün-içi uyarı', () => {
    const sig = makeSignal({ id: 'XAUUSD', tf: '15m' });
    const pos = {
      code: 'GAU01', symbol: 'XAU/USD', tf: '15m', direction: 'long', precision: 2,
      entry: 4000, stop: 3980, target1: 4020, target2: 4035, confidence: 72,
    };
    const msg = notifier.buildNew(pos, sig, { remainingDailyUsd: 400, remainingTotalUsd: 900 });
    expect(msg).toContain('#GAU01');
    expect(msg).toContain('LONG');
    expect(msg).toContain('15m');
    expect(msg).toContain('72/100');
    expect(msg).toContain('4,000.00');       // giriş
    expect(msg).toContain('3,980.00');       // MUTLAK SL
    expect(msg).toContain('4,020.00');       // MUTLAK TP1
    expect(msg).toContain(`Lot: <b>${sig.sizing.lots}</b>`);
    expect(msg).toContain('23:45');          // gün-içi uyarısı
    expect(msg).toContain('Risk bütçesi');
  });

  test('kapanış: aynı NO + % ve $ sonuç; EOD başlığı', () => {
    const ev = {
      code: 'GAU01', symbol: 'XAU/USD', tf: '15m', direction: 'long', precision: 2,
      entry: 4000, exit: 4008, outcome: 'EOD', pnlPct: 0.2, pnlUsd: 4,
      issuedAt: new Date(Date.now() - 3600e3).toISOString(),
    };
    const msg = notifier.buildClosure(ev);
    expect(msg).toContain('GÜN SONU KAPANIŞI');
    expect(msg).toContain('#GAU01');
    expect(msg).toContain('+0.2%');
    expect(msg).toContain('+$4.00');
  });

  test('varsayılan hedef kullanıcı e-postası doğru', () => {
    expect(notifier.TARGET_USER_EMAIL).toBe('hsnkrkl19@gmail.com');
  });
});
