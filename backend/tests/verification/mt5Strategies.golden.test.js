'use strict';

/**
 * Klasik strateji motorları (strategyEngines) + strateji-evrim botu (strategyEvolver)
 * + preset/katalog kayıt bütünlüğü.
 *
 * Sentetik serilerle her motorun (a) doğru rejimde tetiklendiği, (b) her barda
 * DEĞİL yalnız tetik barında sinyal verdiği, (c) SL/TP geometrisinin doğru
 * olduğu doğrulanır.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt5-strategies-'));
process.env.MT5_BOTS_DATA_DIR = tempDir;

jest.mock('../../src/services/botPersistence', () => ({ save: jest.fn() }));

const engines = require('../../src/services/mt5Bots/strategyEngines');
const evolver = require('../../src/services/mt5Bots/strategyEvolver');
const { PRESETS, STRATEGY_PRESETS, getPreset } = require('../../src/services/mt5Bots/presets');
const catalog = require('../../src/services/botCompetition/catalog');

// ── sentetik seri üreteçleri ─────────────────────────────────────────────────
const HOUR = 3600 * 1000;

function bar(time, open, close, hi, lo, volume = 1000) {
  return { time, open, close, high: hi ?? Math.max(open, close), low: lo ?? Math.min(open, close), volume };
}

// Deterministik sözde-rastgele (testler tekrarlanabilir kalsın).
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

// Dalgalı yükseliş: net trend + BELİRGİN periyodik geri çekilme (EMA10/40
// kesişimleri ve EMA20 pullback'leri üretir — tsmom/holygrail/heikin için).
// Dalga türevi ≈ ±0.89/bar > eğim → gerçek yerel düşüş fazları oluşur.
function trendSeries(n = 260, slope = 0.4, seed = 7) {
  const r = rng(seed);
  const out = []; let px = 100;
  for (let i = 0; i < n; i++) {
    const wave = Math.sin(i / 18) * 16 - Math.sin((i - 1) / 18) * 16;
    const drift = slope + wave + (r() - 0.5) * 0.6;
    const o = px, c = px + drift;
    out.push(bar(1700000000000 + i * HOUR, o, c, Math.max(o, c) + 0.4 + r() * 0.3, Math.min(o, c) - 0.4 - r() * 0.3));
    px = c;
  }
  return out;
}

// Düz yumuşak yükseliş + seyrek şok barı: evolver walk-forward testleri için —
// varyantların kazanması beklenen "kolay" rejim, ama arada SL yedirir
// (şampiyonluk kapısındaki kayıp-görme şartı gerçekçi kalsın).
function smoothSeries(n = 300, slope = 0.5, seed = 7) {
  const r = rng(seed);
  const out = []; let px = 100;
  for (let i = 0; i < n; i++) {
    const shock = i % 37 === 0 ? -2.5 : 0;
    const drift = slope + shock + (r() - 0.5) * 0.6;
    const o = px, c = px + drift;
    out.push(bar(1700000000000 + i * HOUR, o, c, Math.max(o, c) + 0.4 + r() * 0.3, Math.min(o, c) - 0.4 - r() * 0.3));
    px = c;
  }
  return out;
}

// Squeeze serisi: uzun dar birikim (küçük kapanış oynaması, geniş fitil →
// BB ⊂ KC) ardından ılımlı ralli (release + momentum). scanSignals 80'den
// başladığı için birikim 90 bar tutulur.
function squeezeSeries() {
  const out = []; let t = 1700000000000;
  for (let i = 0; i < 90; i++) {
    const c = 100 + ((i % 2) ? 0.1 : -0.1);
    out.push(bar(t, 100, c, c + 0.35, c - 0.35)); t += HOUR;
  }
  let px = 100.1;
  for (let i = 0; i < 14; i++) {
    const o = px, c = px + 0.45;
    out.push(bar(t, o, c, c + 0.35, o - 0.35)); px = c; t += HOUR;
  }
  return out;
}

function flatSeries(n = 260, seed = 11) {
  const r = rng(seed);
  const out = []; let px = 100;
  for (let i = 0; i < n; i++) {
    const c = 100 + (r() - 0.5) * 1.2;
    out.push(bar(1700000000000 + i * HOUR, px, c, Math.max(px, c) + 0.5, Math.min(px, c) - 0.5));
    px = c;
  }
  return out;
}

// Her barı dener → hangi barlarda sinyal çıktığını toplar (tetik-barı disiplini testi).
function scanSignals(fn, candles, params) {
  const hits = [];
  for (let i = 80; i < candles.length; i++) {
    const sig = fn(candles.slice(0, i + 1), params);
    if (sig) hits.push({ at: i, sig });
  }
  return hits;
}

function expectGeometry(sig) {
  if (sig.direction === 'long') {
    expect(sig.stop).toBeLessThan(sig.entry);
    expect(sig.target1).toBeGreaterThan(sig.entry);
    expect(sig.target2).toBeGreaterThan(sig.target1);
  } else {
    expect(sig.stop).toBeGreaterThan(sig.entry);
    expect(sig.target1).toBeLessThan(sig.entry);
    expect(sig.target2).toBeLessThan(sig.target1);
  }
  expect(sig.confidence).toBeGreaterThanOrEqual(0);
  expect(sig.confidence).toBeLessThanOrEqual(100);
}

describe('strategyEngines — klasik motorlar', () => {
  test('turtle: yatay birikimden kırılım barında long; kırılım yoksa sessiz', () => {
    // 220 bar: EMA200 gerçek anlamda hesaplanabilsin (motor i<200'de EMA200
    // dalını kullanmaz — tohumlu-EMA sapması inceleme bulgusuydu).
    const c = flatSeries(220, 3);
    // Kırılım barı: önceki 20-bar tepesinin belirgin üstünde kapanış.
    const last = c[c.length - 1];
    c.push(bar(last.time + HOUR, last.close, 104.5, 104.8, last.close - 0.2));
    const sig = engines.evalTurtle(c);
    expect(sig).toBeTruthy();
    expect(sig.direction).toBe('long');
    expectGeometry(sig);
    // Bir bar sonra (kırılım geçmişte kaldı) → tekrar sinyal YOK.
    c.push(bar(last.time + 2 * HOUR, 104.5, 104.6, 104.9, 104.2));
    expect(engines.evalTurtle(c)).toBeNull();
  });

  test('turtle: düşüş kırılımında short', () => {
    const c = flatSeries(220, 5);
    const last = c[c.length - 1];
    c.push(bar(last.time + HOUR, last.close, 95.2, last.close + 0.2, 95.0));
    const sig = engines.evalTurtle(c);
    expect(sig).toBeTruthy();
    expect(sig.direction).toBe('short');
    expectGeometry(sig);
  });

  test('rsi2: SMA200 üstünde 2 sert düşüş → RSI2 eşiği BU barda kesince long', () => {
    const c = [];
    let px = 100;
    for (let i = 0; i < 248; i++) { c.push(bar(1700000000000 + i * HOUR, px, px + 0.3, px + 0.5, px - 0.2)); px += 0.3; }
    c.push(bar(1700000000000 + 248 * HOUR, px, px - 2, px + 0.1, px - 2.2)); px -= 2;
    expect(engines.evalRsi2(c)).toBeNull(); // ilk düşüş: RSI2 hâlâ eşik üstü
    c.push(bar(1700000000000 + 249 * HOUR, px, px - 2, px + 0.1, px - 2.2));
    const sig = engines.evalRsi2(c);
    expect(sig).toBeTruthy();
    expect(sig.direction).toBe('long');
    expectGeometry(sig);
  });

  test('london: Asya range → Londra penceresinde kırılım long; pencere dışı sessiz', () => {
    const DAY0 = 1699920000000; // 2023-11-14T00:00:00Z, Salı (Pazartesi-atla kuralına takılmaz)
    const Q = 15 * 60 * 1000;
    const c = [];
    // Önceki gün dolgu (ATR ısınması): sakin küçük barlar
    for (let i = 0; i < 16; i++) {
      const t = DAY0 - 4 * HOUR + i * Q;
      const cl = 100 + ((i % 2) ? 0.05 : -0.05);
      c.push(bar(t, 100, cl, cl + 0.1, cl - 0.1));
    }
    // Asya seansı 00:00–06:45 (28 bar): çoğu bar küçük; 2 "yoklama" barı range
    // uçlarını (99.5 / 100.5) koyar → width=1.0, ATR küçük kalır (band filtresi).
    for (let i = 0; i < 28; i++) {
      const t = DAY0 + i * Q;
      const cl = 100 + ((i % 2) ? 0.08 : -0.08);
      if (i === 4) c.push(bar(t, 100, cl, cl + 0.1, 99.5));       // alt uç yoklaması
      else if (i === 14) c.push(bar(t, 100, cl, 100.5, cl - 0.1)); // üst uç yoklaması
      else c.push(bar(t, 100, cl, cl + 0.1, cl - 0.1));
    }
    // 07:00 kırılım barı: range tepesinin üstünde kapanış (overshoot < 0.5×width)
    c.push(bar(DAY0 + 7 * HOUR, 100.2, 100.9, 101.0, 100.1));
    const sig = engines.evalLondon(c);
    expect(sig).toBeTruthy();
    expect(sig.direction).toBe('long');
    expect(sig.stop).toBeCloseTo(100.0, 5); // SL = range ORTASI (araştırma spec)
    expectGeometry(sig);

    // Aynı kırılım 12:00'de olsaydı (pencere dışı) → sinyal YOK.
    const c2 = c.slice(0, -1);
    c2.push(bar(DAY0 + 12 * HOUR, 100.2, 100.9, 101.0, 100.1));
    expect(engines.evalLondon(c2)).toBeNull();

    // Günün İLK kırılımı kuralı: 07:00 barı kırılımla kapandıysa 07:15'te yeni sinyal YOK.
    const c3 = [...c, bar(DAY0 + 7 * HOUR + Q, 100.9, 101.2, 101.3, 100.8)];
    expect(engines.evalLondon(c3)).toBeNull();
  });

  test('squeeze: dar birikim + ılımlı ralli → release barında long', () => {
    const c = squeezeSeries();
    const hits = scanSignals(engines.evalSqueeze, c, { minBars: 6 });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.sig.direction).toBe('long');
      expectGeometry(h.sig);
    }
    // Saf dar birikimde (release yok) sinyal olmamalı.
    expect(engines.evalSqueeze(c.slice(0, 90), { minBars: 6 })).toBeNull();
  });

  test('tsmom/alligator/heikin: trendde tetiklenir, her barda DEĞİL; geometri doğru', () => {
    // requireLongs: alligator dalgalı seride düşüş bacaklarını da MEŞRU olarak
    // short'lar (gecikmeli trend sistemi) — onda yalnız tetiklenme aranır.
    const cases = [
      ['evalTsmom', engines.evalTsmom, { lookback: 60 }, true],
      ['evalAlligator', engines.evalAlligator, undefined, false],
      ['evalHeikin', engines.evalHeikin, { streak: 3 }, true],
    ];
    // Farklı tohumlarla birkaç dalgalı-trend serisi — her motor en az birinde
    // tetiklenmeli. 400 bar: tsmom'un 252-bar oyu ancak i≥252'de hesaplanabilir.
    const seriesPool = [trendSeries(400, 0.5, 7), trendSeries(400, 0.7, 21), trendSeries(400, 0.4, 33)];
    for (const [name, fn, params, requireLongs] of cases) {
      let total = 0, longs = 0, scannedBars = 0;
      for (const c of seriesPool) {
        const hits = scanSignals(fn, c, params);
        total += hits.length;
        scannedBars += c.length - 80;
        for (const h of hits) {
          if (h.sig.direction === 'long') longs++;
          expectGeometry(h.sig);
        }
      }
      expect(total).toBeGreaterThan(0);              // motor ölü değil
      if (requireLongs) expect(longs).toBeGreaterThan(0); // yükselen trend → long üretmeli
      expect(total).toBeLessThan(scannedBars * 0.2); // her barda ateşlemiyor
    }
  });

  test('holygrail: güçlü trend + EMA20 pullback + kırılım döngüsünde long üretir', () => {
    // El yapımı döngü: güçlü yükseliş bacağı (ADX kurulur) → düzenli pullback
    // EMA20'ye değene kadar → kırılım barı (önceki barın tepesi üstünde kapanış).
    const c = [];
    let t = 1700000000000, px = 100, emaVal = 100;
    const k = 2 / 21;
    const push = (o, cl, hi, lo) => {
      c.push(bar(t, o, cl, hi, lo)); t += HOUR;
      emaVal = cl * k + emaVal * (1 - k);
    };
    for (let i = 0; i < 30; i++) { const o = px; px += 1.2; push(o, px, px + 0.3, o - 0.3); } // ısınma
    for (let cyc = 0; cyc < 5; cyc++) {
      for (let i = 0; i < 12; i++) { const o = px; px += 1.4; push(o, px, px + 0.3, o - 0.3); } // bacak
      let guard = 0;
      while (px - 0.4 > emaVal && guard++ < 15) { const o = px; px -= 2.0; push(o, px, o + 0.3, px - 0.4); } // pullback → dokunuş
      const touch = c[c.length - 1];
      const o = px; px = touch.high + 0.6; push(o, px, px + 0.3, o - 0.2); // kırılım barı
    }
    const hits = scanSignals(engines.evalHolyGrail, c, { adxMin: 25 });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.sig.direction).toBe('long');
      expectGeometry(h.sig);
    }
  });

  test('tsmom: kripto sınıfında short sinyal YOK (long-only bias)', () => {
    // Düşen seri: trendSeries'in aynası.
    const up = trendSeries(400, 0.6, 7);
    const down = up.map((b) => ({
      time: b.time, open: 200 - (b.open - 100), close: 200 - (b.close - 100),
      high: 200 - (b.low - 100), low: 200 - (b.high - 100), volume: b.volume,
    }));
    const hitsFx = scanSignals(engines.evalTsmom, down, { lookback: 60 });
    const hitsCrypto = scanSignals(engines.evalTsmom, down, { lookback: 60, cls: 'crypto' });
    expect(hitsFx.some((h) => h.sig.direction === 'short')).toBe(true);
    expect(hitsCrypto.some((h) => h.sig.direction === 'short')).toBe(false);
  });

  test('kısa/boş seride tüm motorlar null', () => {
    for (const id of Object.keys(engines.STRATEGY_ENGINES)) {
      expect(engines.evaluateStrategy(id, [], {})).toBeNull();
      expect(engines.evaluateStrategy(id, smoothSeries(30), {})).toBeNull();
    }
    expect(engines.evaluateStrategy('bilinmeyen', smoothSeries(260), {})).toBeNull();
  });
});

// Sürüklenmesiz saf rastgele yürüyüş: hiçbir varyantın gerçek kenarı YOK —
// şampiyon üretimi = seçilim yanlılığı (inceleme regresyon testi).
function walkSeries(n = 320, seed = 5) {
  const r = rng(seed);
  const out = []; let px = 100;
  for (let i = 0; i < n; i++) {
    const o = px, c = px + (r() - 0.5) * 1.2;
    out.push(bar(1700000000000 + i * HOUR, o, c, Math.max(o, c) + 0.4 + r() * 0.3, Math.min(o, c) - 0.4 - r() * 0.3));
    px = c;
  }
  return out;
}

describe('strategyEvolver — strateji geliştiren bot', () => {
  beforeEach(() => evolver._dangerouslyResetForTest());

  test('simulate: trend serisinde işlem üretir; metrikler tutarlı', () => {
    const c = smoothSeries(300, 0.5, 7);
    const variant = evolver.VARIANTS.find((v) => v.id === 'votes-trend');
    const { stats } = evolver.simulate(variant, c);
    expect(stats.trades).toBeGreaterThan(0);
    expect(stats.wins).toBeLessThanOrEqual(stats.trades);
    expect(Number.isFinite(stats.netR)).toBe(true);
    expect(stats.pf).toBeGreaterThanOrEqual(0);
  });

  test('SEÇİLİM YANLILIĞI REGRESYONU: saf rastgele yürüyüşte şampiyon nadir olmalı', () => {
    // İlk sürümde gürültüde hücrelerin %57'si şampiyon üretiyordu (inceleme
    // ampirik bulgusu). Holdout + maliyet + kayıp-şartı sonrası ≤ 2/8 beklenir.
    let champions = 0;
    for (const seed of [5, 11, 17, 23, 31, 41, 53, 67]) {
      const { champion } = evolver.optimizeCell(walkSeries(320, seed));
      if (champion) champions++;
    }
    expect(champions).toBeLessThanOrEqual(2);
  });

  test('şampiyon kapıları: OOS teyidi + kayıp-görme şartı champion kaydında', () => {
    // Kolay rejimde şampiyon çıkarsa is/oos alanları kapı şartlarını taşımalı.
    const { champion } = evolver.optimizeCell(smoothSeries(320, 0.6, 7));
    expect(champion).toBeTruthy(); // kolay rejimde şampiyon ÇIKMALI (motor ölü değil)
    expect(champion.is.trades).toBeGreaterThanOrEqual(evolver.MIN_TRADES);
    expect(champion.is.pf).toBeGreaterThanOrEqual(evolver.IS_MIN_PF);
    // Sıfır-kayıp yalnız yeterli örneklemle kabul edilir (PF=99 deliği kapalı).
    expect(champion.is.grossLoss > 0 || champion.is.trades >= 10).toBe(true);
    expect(champion.oos.trades).toBeGreaterThanOrEqual(evolver.OOS_MIN_TRADES);
    expect(champion.oos.netR).toBeGreaterThan(0);
  });

  test('ctx iletimi: tsmom varyantı kripto hücresinde short ÜRETMEZ', () => {
    const up = trendSeries(400, 0.6, 7);
    const down = up.map((b) => ({
      time: b.time, open: 200 - (b.open - 100), close: 200 - (b.close - 100),
      high: 200 - (b.low - 100), low: 200 - (b.high - 100), volume: b.volume,
    }));
    const variant = evolver.VARIANTS.find((v) => v.id === 'tsmom-60');
    let shortsNoCtx = 0, shortsCrypto = 0;
    for (let i = 260; i < down.length; i++) {
      const s1 = evolver.evalVariant(variant, down.slice(0, i + 1), { tf: '1d' });
      const s2 = evolver.evalVariant(variant, down.slice(0, i + 1), { tf: '1d', cls: 'crypto' });
      if (s1 && s1.direction === 'short') shortsNoCtx++;
      if (s2 && s2.direction === 'short') shortsCrypto++;
    }
    expect(shortsNoCtx).toBeGreaterThan(0);
    expect(shortsCrypto).toBe(0);
  });

  test('ince veri koruması: kısa seride yeniden-optimizasyon yapılmaz, şampiyon korunur', () => {
    const c = smoothSeries(320, 0.6, 7);
    const nowMs = 1700000000000;
    evolver.evaluateCell('XAUUSD', '4h', c, evolver.newBudget(), nowMs);
    const before = evolver.summary().cells.find((x) => x.cell === 'XAUUSD:4h');
    // Şampiyon bayatladı ama veri kısa geldi → optimize edilmez, kayıt aynı kalır.
    const budget = evolver.newBudget();
    evolver.evaluateCell('XAUUSD', '4h', c.slice(0, 150), budget, nowMs + evolver.REOPT_MS + 1000);
    expect(budget.cells).toBe(evolver.newBudget().cells); // bütçe harcanmadı
    const after = evolver.summary().cells.find((x) => x.cell === 'XAUUSD:4h');
    expect(after.optimizedAt).toBe(before.optimizedAt);
    expect(after.champion).toBe(before.champion);
  });

  test('evaluateCell: şampiyon seçer, bütçe tüketir, REOPT içinde tekrar optimize etmez', () => {
    const c = smoothSeries(300, 0.6, 7);
    const budget = evolver.newBudget();
    const before = budget.cells;
    const nowMs = 1700000000000;
    evolver.evaluateCell('BTCUSD', '1h', c, budget, nowMs);
    expect(budget.cells).toBe(before - 1); // optimizasyon bütçeden düştü

    const budget2 = evolver.newBudget();
    evolver.evaluateCell('BTCUSD', '1h', c, budget2, nowMs + 60 * 1000);
    expect(budget2.cells).toBe(evolver.newBudget().cells); // taze şampiyon → yeniden optimize YOK

    const sum = evolver.summary();
    expect(sum.cells.some((x) => x.cell === 'BTCUSD:1h')).toBe(true);
  });

  test('evaluateCell: sinyal verirse strategy SABİT "evolver" + varyant şeffaf', () => {
    // Üretim akışı taklidi: şampiyon bir kez seçilir, sonra seri bar bar uzar
    // ve her turda şampiyon değerlendirilir. En az bir tohum+bar sinyal vermeli.
    let checked = 0;
    for (const seed of [7, 21, 33, 55]) {
      evolver._dangerouslyResetForTest();
      const c = smoothSeries(320, 0.6, seed);
      const nowMs = 1700000000000;
      evolver.evaluateCell('XAUUSD', '4h', c.slice(0, 280), evolver.newBudget(), nowMs);
      for (let end = 281; end <= c.length; end++) {
        const sig = evolver.evaluateCell('XAUUSD', '4h', c.slice(0, end), evolver.newBudget(), nowMs + (end - 280) * 60000);
        if (!sig) continue;
        expect(sig.strategy).toBe('evolver');
        expect(typeof sig.variantId).toBe('string');
        expect(sig.championStats.trades).toBeGreaterThanOrEqual(evolver.MIN_TRADES);
        expect(sig.championStats.pf).toBeGreaterThanOrEqual(evolver.MIN_PF);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('kanıt yoksa SUSAR: yatay/gürültülü seride şampiyon çıkmayabilir → null', () => {
    const c = flatSeries(300, 13);
    const { champion } = evolver.optimizeCell(c);
    // Şampiyon çıkarsa bile PF/işlem kapılarını geçmiş olmalı (asla çöp seçmez).
    if (champion) {
      expect(champion.pf).toBeGreaterThanOrEqual(evolver.MIN_PF);
      expect(champion.trades).toBeGreaterThanOrEqual(evolver.MIN_TRADES);
      expect(champion.netR).toBeGreaterThan(0);
    }
  });
});

describe('preset + katalog kayıt bütünlüğü', () => {
  test('7 yeni strateji preseti kayıtlı (araştırma: alligator/heikin reddedildi); magic 5740-5748', () => {
    expect(STRATEGY_PRESETS).toHaveLength(7);
    const ids = STRATEGY_PRESETS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([
      'mt5-turtle', 'mt5-squeeze', 'mt5-rsi2', 'mt5-london', 'mt5-tsmom',
      'mt5-holygrail', 'mt5-evolver',
    ]));
    expect(ids).not.toContain('mt5-alligator'); // araştırma hükmü: ayrı bot yok
    expect(ids).not.toContain('mt5-heikin');
    for (const p of STRATEGY_PRESETS) {
      expect(p.magic).toBeGreaterThanOrEqual(5740);
      expect(p.magic).toBeLessThanOrEqual(5748);
    }
  });

  test('kanıtı zayıf botlar köprüye kapalı: london + holygrail mt5Tradeable=false', () => {
    expect(catalog.find((e) => e.id === 'mt5-london').mt5Tradeable).toBe(false);
    expect(catalog.find((e) => e.id === 'mt5-holygrail').mt5Tradeable).toBe(false);
    // Kanıtı güçlü botlar köprüye açık (bayrak yok = tradeable).
    for (const id of ['mt5-turtle', 'mt5-squeeze', 'mt5-rsi2', 'mt5-tsmom', 'mt5-evolver']) {
      expect(catalog.find((e) => e.id === id).mt5Tradeable).not.toBe(false);
    }
  });

  test("tüm preset magic'leri benzersiz ve 5800 altı (custom bot bloğuna taşmaz)", () => {
    const magics = PRESETS.map((p) => p.magic);
    expect(new Set(magics).size).toBe(magics.length);
    for (const m of magics) expect(m).toBeLessThan(5800);
  });

  test("her yeni preset'in catalog girişi var; magic ve isim birebir aynı", () => {
    for (const p of STRATEGY_PRESETS) {
      const entry = catalog.find((e) => e.id === p.id);
      expect(entry).toBeTruthy();
      expect(entry.magic).toBe(p.magic);
      expect(entry.name).toBe(p.name);
      expect(entry.competitionEligible).toBe(true);
      expect(entry.engineDisableEnv).toBe('MT5_BOTS_DISABLED');
    }
  });

  test("catalog magic'leri global benzersiz", () => {
    const magics = catalog.filter((e) => e.magic).map((e) => e.magic);
    expect(new Set(magics).size).toBe(magics.length);
  });

  test('instruments filtresi olan presetler yalnız MT5 evrenindeki kimlikleri kullanır', () => {
    const { INSTRUMENTS } = require('../../src/services/forex/forexInstruments');
    const known = new Set(INSTRUMENTS.map((i) => i.id));
    for (const p of PRESETS) {
      if (!Array.isArray(p.instruments)) continue;
      for (const id of p.instruments) expect(known.has(id)).toBe(true);
    }
  });

  test('getPreset dispatch: strategy/evolver kind alanları doğru', () => {
    expect(getPreset('mt5-turtle').kind).toBe('strategy');
    expect(getPreset('mt5-turtle').strategyId).toBe('turtle');
    expect(getPreset('mt5-evolver').kind).toBe('evolver');
  });
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  delete process.env.MT5_BOTS_DATA_DIR;
});
