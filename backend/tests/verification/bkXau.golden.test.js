'use strict';

/**
 * BK XAU Runner (Bot 38) — "BorsaKrali XAU MT5 Bot Paketi v1.0" MQL5 portu.
 *
 * Sentetik serilerle: (a) scalp/swing motorlarının doğru kurulumda tetiklendiği,
 * (b) NY seans penceresi + haber bloğu dışında SUSTUĞU, (c) SL/TP geometrisinin
 * runner çevirisine (TP1=1.5R, TP2=3R) uyduğu, (d) katalog/preset kaydının
 * Bot 38 · magic 5750 olduğu doğrulanır.
 */

// YALNIZ fetchCandles taklit edilir. Modülün tamamını stub'lamak closedBars ve
// TF_MS'i de siler; bkXau bunları modül yüklenirken destructure ettiği için
// motor sessizce çöker (aile geneli süzgeç forexKlines'a taşındıktan sonra).
jest.mock('../../src/services/forex/forexKlines', () => ({
  ...jest.requireActual('../../src/services/forex/forexKlines'),
  fetchCandles: jest.fn(),
}));

const forexKlines = require('../../src/services/forex/forexKlines');
const bkXau = require('../../src/services/mt5Bots/bkXau');
const { PRESETS, BKXAU_PRESETS, getPreset } = require('../../src/services/mt5Bots/presets');
const catalog = require('../../src/services/botCompetition/catalog');

const MIN5 = 5 * 60 * 1000;
const MIN30 = 30 * 60 * 1000;
const H8 = 8 * 3600 * 1000;

function bar(time, open, close, high, low) {
  return {
    time, open, close,
    high: high ?? Math.max(open, close),
    low: low ?? Math.min(open, close),
    volume: 1000,
  };
}

// Düz yükseliş HTF rejim serisi: close > EMA13 > EMA34 (yükselen), ayrışma bol.
function regimeSeries(endTime, stepMs, n = 120, slope = 2.0) {
  const out = []; let px = 1000;
  for (let i = 0; i < n; i++) {
    const o = px, c = px + slope;
    out.push(bar(endTime - (n - 1 - i) * stepMs, o, c, c + 0.5, o - 0.5));
    px = c;
  }
  return out;
}

// Ayna: yükselişi düşüşe çevir (aile testlerindeki 2000-x haritası).
function mirror(series) {
  return series.map((b) => ({
    time: b.time, open: 2000 - (b.open - 1000), close: 2000 - (b.close - 1000),
    high: 2000 - (b.low - 1000), low: 2000 - (b.high - 1000), volume: b.volume,
  }));
}

/**
 * Scalp sinyal serisi (5m): düz yükseliş → 2 barlık YUMUŞAK geri çekilme →
 * sinyal barı (EMA8'e dip + önceki tepenin üstünde güçlü kapanış). Dip bilerek
 * sığ tutulur: derin dipte yapı stopu 1.8×ATR tavanını aşar ve EA kuralı
 * kurulumu atlar. pullback:false → son 3 bar da düz yükseliş (dip yok → sinyal
 * beklenmez).
 */
function scalpSeries(signalBarTime, { pullback = true } = {}, n = 200) {
  const out = []; let px = 1000;
  const start = signalBarTime - (n - 1) * MIN5;
  const steady = n - 3;
  for (let i = 0; i < steady; i++) {
    const o = px, c = px + 0.4;
    out.push(bar(start + i * MIN5, o, c, c + 0.15, o - 0.15));
    px = c;
  }
  if (!pullback) {
    for (let i = 0; i < 3; i++) {
      const o = px, c = px + 0.4;
      out.push(bar(start + (steady + i) * MIN5, o, c, c + 0.15, o - 0.15));
      px = c;
    }
    return out;
  }
  for (let i = 0; i < 2; i++) { // yumuşak geri çekilme
    const o = px, c = px - 0.4;
    out.push(bar(start + (steady + i) * MIN5, o, c, o + 0.1, c - 0.05));
    px = c;
  }
  // Sinyal barı: sığ dip (EMA8 dokunuşu) + önceki tepenin üstünde güçlü kapanış.
  const o = px;
  out.push(bar(signalBarTime, o, o + 0.75, o + 0.80, o - 0.15));
  return out;
}

/**
 * Swing sinyal serisi (30m): yükseliş → 4 barlık dar konsolidasyon → kırılım barı
 * (önceki 4 barın tepesinin üstünde, gövdeli, tepeye yakın kapanış).
 */
function swingSeries(signalBarTime, n = 160) {
  const out = []; let px = 1000;
  const start = signalBarTime - (n - 1) * MIN30;
  for (let i = 0; i < n - 5; i++) {
    const o = px, c = px + 1.2;
    out.push(bar(start + i * MIN30, o, c, c + 0.4, o - 0.4));
    px = c;
  }
  const plateau = px;
  for (let i = 0; i < 4; i++) { // konsolidasyon: dar, hafif aşağı
    const o = px, c = plateau - 0.3 - i * 0.15;
    out.push(bar(start + (n - 5 + i) * MIN30, o, c, o + 0.5, c - 0.5));
    px = c;
  }
  // Kırılım barı: konsolidasyon tepesinin (≈plateau+0.5) belirgin üstünde kapanış.
  const o = px;
  out.push(bar(signalBarTime, o, plateau + 2.2, plateau + 2.5, o - 0.4));
  return out;
}

// NY (EST, Ocak) 08:00 = 13:00 UTC — Salı 2026-01-13. Scalp penceresi içinde.
const TUE_NY_0800 = Date.UTC(2026, 0, 13, 13, 0);
// NY 07:30 = 12:30 UTC — swing penceresi [02:00, 09:30) içinde.
const TUE_NY_0730 = Date.UTC(2026, 0, 13, 12, 30);

function expectRunnerGeometry(sig) {
  const risk = Math.abs(sig.entry - sig.stop);
  expect(risk).toBeGreaterThan(0);
  const sign = sig.direction === 'long' ? 1 : -1;
  expect(sig.target1).toBeCloseTo(sig.entry + sign * 2.0 * risk, 6);
  expect(sig.target2).toBeCloseTo(sig.entry + sign * 4.0 * risk, 6);
  expect(sig.confidence).toBeGreaterThanOrEqual(55); // competition MIN_CONFIDENCE kapısı
  expect(sig.confidence).toBeLessThanOrEqual(100);
  // KÖPRÜ KAPISI: config_all min_rr=1.5 → reward/risk 8 haneye yuvarlandıktan
  // SONRA da kesin 1.5 üstünde kalmalı (1.5R tam sınırda reddedilebiliyordu).
  const round8 = (v) => Math.round(v * 1e8) / 1e8;
  const feedRisk = Math.abs(round8(sig.entry) - round8(sig.stop));
  const feedReward = Math.abs(round8(sig.target1) - round8(sig.entry));
  expect(feedReward / feedRisk).toBeGreaterThan(1.5);
}

describe('bkXau — New York saati yardımcıları', () => {
  test('DST sınırları: 2026 mart 2. pazar 07:00 UTC → kasım 1. pazar 06:00 UTC', () => {
    expect(bkXau.isNyDstUtc(Date.UTC(2026, 2, 8, 6, 59))).toBe(false);
    expect(bkXau.isNyDstUtc(Date.UTC(2026, 2, 8, 7, 0))).toBe(true);
    expect(bkXau.isNyDstUtc(Date.UTC(2026, 10, 1, 5, 59))).toBe(true);
    expect(bkXau.isNyDstUtc(Date.UTC(2026, 10, 1, 6, 0))).toBe(false);
  });

  test('nyParts: kışın UTC-5, yazın UTC-4', () => {
    expect(bkXau.nyParts(TUE_NY_0800).minuteOfDay).toBe(8 * 60);
    expect(bkXau.nyParts(Date.UTC(2026, 6, 14, 13, 0)).minuteOfDay).toBe(9 * 60); // EDT
  });

  test('pencere yarı-açık [start, end) — BK_InMinuteWindow birebir', () => {
    expect(bkXau.inMinuteWindow(420, 420, 630)).toBe(true);
    expect(bkXau.inMinuteWindow(629, 420, 630)).toBe(true);
    expect(bkXau.inMinuteWindow(630, 420, 630)).toBe(false);
    expect(bkXau.inMinuteWindow(-1, 420, 630)).toBe(false);
  });

  test('Cuma NY ≥ 12:00 risk kesimi kuralı', () => {
    // 2026-01-16 Cuma: NY 12:00 = 17:00 UTC.
    expect(bkXau.isFridayRiskCut(Date.UTC(2026, 0, 16, 16, 59))).toBe(false);
    expect(bkXau.isFridayRiskCut(Date.UTC(2026, 0, 16, 17, 0))).toBe(true);
  });

  // EA'da Cuma kesimi bir ÇIKIŞ kuralıdır. Giriş kapısı yapılırsa ÖLÜ KOD olur
  // (pencereler 12:00 NY'den önce biter) ve "hafta sonu koruması var" yanılsaması
  // yaratır — gerçek koruma köprüdeki weekend_flatten'dır.
  test('Cuma kesimi GİRİŞ kapısı DEĞİL: Cuma seans içi sinyal üretilir', () => {
    // 2026-01-16 Cuma, NY 08:00 = 13:00 UTC → scalp penceresi içi.
    const friday = Date.UTC(2026, 0, 16, 13, 0);
    expect(bkXau.nyParts(friday).dayOfWeek).toBe(5);
    const sig = bkXau.evalScalp(scalpSeries(friday), regimeSeries(friday - MIN30, MIN30));
    expect(sig).toBeTruthy();
    expect(sig.direction).toBe('long');
  });
});

describe('bkXau — SCALP motoru (M5 sinyal + M30 rejim)', () => {
  const htf = regimeSeries(TUE_NY_0800 - MIN30, MIN30);

  test('rejim + pullback kırılımında LONG; geometri runner çevirisi', () => {
    const sig = bkXau.evalScalp(scalpSeries(TUE_NY_0800), htf);
    expect(sig).toBeTruthy();
    expect(sig.direction).toBe('long');
    expect(sig.stop).toBeLessThan(sig.entry);
    // Stop EA bandında: [1.10, 1.80] × ATR — ATR ~0.7 civarı → mesafe makul.
    const risk = sig.entry - sig.stop;
    expect(risk).toBeGreaterThan(0.5);
    expect(risk).toBeLessThan(2.0);
    expectRunnerGeometry(sig);
  });

  test('ayna seride SHORT', () => {
    const sig = bkXau.evalScalp(mirror(scalpSeries(TUE_NY_0800)), mirror(htf));
    expect(sig).toBeTruthy();
    expect(sig.direction).toBe('short');
    expect(sig.stop).toBeGreaterThan(sig.entry);
    expectRunnerGeometry(sig);
  });

  test('seans dışı SUSAR (NY 12:00) ve haber bloğunda SUSAR (NY 08:25-08:40)', () => {
    // Aynı kurulum, sinyal barı NY 12:00 (17:00 UTC) → pencere [07:00,10:30) dışı.
    expect(bkXau.evalScalp(scalpSeries(Date.UTC(2026, 0, 13, 17, 0)),
      regimeSeries(Date.UTC(2026, 0, 13, 17, 0) - MIN30, MIN30))).toBeNull();
    // NY 08:25 (13:25 UTC) → haber bloğu.
    expect(bkXau.evalScalp(scalpSeries(Date.UTC(2026, 0, 13, 13, 25)),
      regimeSeries(Date.UTC(2026, 0, 13, 13, 25) - MIN30, MIN30))).toBeNull();
  });

  test('rejim yoksa SUSAR (yatay/ters HTF)', () => {
    expect(bkXau.evalScalp(scalpSeries(TUE_NY_0800), mirror(htf))).toBeNull();
  });

  test('pullback yoksa SUSAR (düz yükseliş barı EMA8 dokunuşu yapmaz)', () => {
    expect(bkXau.evalScalp(scalpSeries(TUE_NY_0800, { pullback: false }), htf)).toBeNull();
  });

  test('derin dipte SUSAR (yapı stopu 1.8×ATR tavanını aşar → EA kurulumu atlar)', () => {
    const c = scalpSeries(TUE_NY_0800);
    const last = c[c.length - 1];
    // Aynı kurulum ama dip 1.4 birim derin → stop mesafesi ATR tavanını aşar.
    c[c.length - 1] = bar(last.time, last.open, last.close, last.high, last.open - 1.4);
    expect(bkXau.evalScalp(c, htf)).toBeNull();
  });
});

// Mutasyon testi (inceleme bulgusu) sentetik serilerin her eşikten ÇOK uzakta
// durduğunu, dolayısıyla ADX_MIN 20→0, MIN_ATR_RATIO 0.65→0.20, STOP_ATR_MIN
// 1.10→0.10 gibi 20 mutasyonun testleri YEŞİL bıraktığını gösterdi. Aşağıdaki
// testler eşikleri "bir tık altında SUSAR / üstünde TETİKLER" çiftiyle sabitler.
describe('bkXau — eşik sınırları çivilenir (mutasyon koruması)', () => {
  const htf = regimeSeries(TUE_NY_0800 - MIN30, MIN30);

  test('HTF ayrışma eşiği (0.20): ayrışma altındaysa rejim yok → sinyal yok', () => {
    // Düz-yatay HTF: EMA13≈EMA34, ayrışma ~0 → rejim kapısı kapalı kalmalı.
    const flatHtf = [];
    for (let i = 0; i < 120; i++) {
      const t = TUE_NY_0800 - MIN30 - (119 - i) * MIN30;
      flatHtf.push(bar(t, 1000, 1000, 1000.5, 999.5));
    }
    expect(bkXau.htfRegime(flatHtf, bkXau.SCALP.MIN_HTF_SEPARATION).bull).toBe(false);
    expect(bkXau.evalScalp(scalpSeries(TUE_NY_0800), flatHtf)).toBeNull();
  });

  test('HTF eğim koşulu: EMA34 yükselmiyorsa bull rejim YOK', () => {
    // Yükselen seriyi son barda düzleştirmek yerine, tamamen düşen seri ver:
    // slow[j] > slow[j-1] koşulu sağlanmaz.
    const falling = mirror(regimeSeries(TUE_NY_0800 - MIN30, MIN30));
    expect(bkXau.htfRegime(falling, bkXau.SCALP.MIN_HTF_SEPARATION).bull).toBe(false);
    expect(bkXau.htfRegime(falling, bkXau.SCALP.MIN_HTF_SEPARATION).bear).toBe(true);
  });

  // ADX/DI kapısının ADX bacağını uçtan uca zorlamak yapısal olarak zordur
  // (ribbon hizası + HTF rejim + kırılım zaten güçlü trend demektir, yani ADX
  // doğal olarak eşiğin üstündedir). Bu yüzden eşik DEĞERLERİ doğrudan MQL5
  // kaynağına çivilenir — ADX_MIN 20→0 gibi mutasyonları asıl öldüren budur.
  test('dondurulmuş strateji sabitleri MQL5 kaynağıyla birebir', () => {
    // BK_XAU_Scalp.mq5 "Dondurulmus strateji cekirdegi" bloğu
    expect(bkXau.SCALP).toMatchObject({
      NY_START: 7 * 60, NY_END: 10 * 60 + 30,
      NEWS_START: 8 * 60 + 25, NEWS_END: 8 * 60 + 40,
      ADX_MIN: 20, MIN_HTF_SEPARATION: 0.20,
      MIN_BODY_ATR: 0.25, MIN_CLOSE_QUALITY: 0.65,
      MIN_ATR_RATIO: 0.65, MAX_ATR_RATIO: 1.60, MAX_CANDLE_ATR: 2.50,
      STOP_ATR_MIN: 1.10, STOP_ATR_MAX: 1.80, STRUCTURE_BUFFER_ATR: 0.10,
    });
    // BK_XAU_Swing.mq5 "2018-2023 egitiminden dondurulan ana sinyal cekirdegi"
    expect(bkXau.SWING).toMatchObject({
      NY_START: 2 * 60, NY_END: 9 * 60 + 30,
      ADX_MIN: 22, MIN_HTF_SEPARATION: 0.25,
      MIN_BODY_ATR: 0.30, CLOSE_QUALITY: 0.70,
      MIN_ATR_RATIO: 0.50, MAX_ATR_RATIO: 1.80, MAX_CANDLE_ATR: 3.00,
      STOP_ATR: 1.80, TRIGGER_LEN: 4,
    });
  });

  // ADX/DI kapısı geçen kurulumda DOĞRU NEDENLE geçmeli: long sinyalinde ADX
  // eşiğin üstünde ve +DI baskın olmalı (kapı "sessizce hep açık" değil).
  // Ayna (short) kurulumunda tam tersi. Böylece kapının canlıda gerçekten
  // değerlendirildiği ve yön bacağının bağlı olduğu sabitlenir.
  test('ADX/DI kapısı doğru nedenle geçer: long→+DI baskın, short→-DI baskın', () => {
    const cLong = scalpSeries(TUE_NY_0800);
    const iL = cLong.length - 1;
    const dLong = bkXau.mt5Dmi(cLong, 14);
    expect(bkXau.evalScalp(cLong, htf).direction).toBe('long');
    expect(dLong.adx[iL]).toBeGreaterThanOrEqual(bkXau.SCALP.ADX_MIN);
    expect(dLong.plusDI[iL]).toBeGreaterThan(dLong.minusDI[iL]);

    const cShort = mirror(cLong);
    const dShort = bkXau.mt5Dmi(cShort, 14);
    expect(bkXau.evalScalp(cShort, mirror(htf)).direction).toBe('short');
    expect(dShort.adx[iL]).toBeGreaterThanOrEqual(bkXau.SCALP.ADX_MIN);
    expect(dShort.minusDI[iL]).toBeGreaterThan(dShort.plusDI[iL]);
  });

  test('ATR oranı üst kapısı (1.60): volatilite patlamasında SUSAR', () => {
    // Sakin seri + sinyal barından hemen önce ATR'yi şişiren birkaç dev bar →
    // atrRatio üst bandı aşar; kurulum geometrisi bozulmadan kapı devreye girer.
    const c = scalpSeries(TUE_NY_0800);
    for (let k = 8; k >= 4; k--) {
      const b = c[c.length - k];
      c[c.length - k] = bar(b.time, b.open, b.close, b.high + 40, b.low - 40);
    }
    const aSeries = bkXau.mt5Atr(c, 14);
    const i = c.length - 1;
    const ratio = aSeries[i] / bkXau.medianOf(aSeries.slice(i - 23, i + 1));
    expect(ratio).toBeGreaterThan(bkXau.SCALP.MAX_ATR_RATIO);
    expect(bkXau.evalScalp(c, htf)).toBeNull();
  });

  test('gövde/kapanış-kalitesi kapısı: doji sinyal barı SUSAR', () => {
    const c = scalpSeries(TUE_NY_0800);
    const last = c[c.length - 1];
    // Aynı kurulum ama gövdesiz, ortada kapanan bar (body≈0, closeLocation≈0.5).
    c[c.length - 1] = bar(last.time, last.open, last.open + 0.01, last.open + 0.8, last.open - 0.8);
    expect(bkXau.evalScalp(c, htf)).toBeNull();
  });

  test('SWING tetik penceresi 4 bar: 5. bardaki tepe kırılımı SAYILMAZ', () => {
    const c30 = swingSeries(TUE_NY_0730);
    const i = c30.length - 1;
    // Tetik penceresi (i-4..i-1) İÇİNDEKİ en yüksek tepeyi, kapanışın hemen
    // üstüne çıkar → kırılım artık yok, sinyal susmalı.
    const t = c30[i - 2];
    c30[i - 2] = bar(t.time, t.open, t.close, c30[i].close + 0.5, t.low);
    expect(bkXau.evalSwing(c30, regimeSeries(TUE_NY_0730 - H8, H8, 60, 8.0))).toBeNull();
  });

  test('ısınma kapıları: yetersiz bar sayısında SUSAR (HTF 40 bar dahil)', () => {
    const c5 = scalpSeries(TUE_NY_0800);
    // HTF tam 40 bar → htfRegime en az 41 ister; iki kapı AYNI sabite bağlı olmalı.
    expect(bkXau.evalScalp(c5, htf.slice(-40))).toBeNull();
    expect(bkXau.evalScalp(c5, htf.slice(-41))).toBeTruthy();
    // Sinyal-TF ısınması
    expect(bkXau.evalScalp(c5.slice(-60), htf)).toBeNull();
  });

  test('medianOf NaN-katılığı: ısınmamış ATR penceresinde medyan üretmez', () => {
    expect(bkXau.medianOf([1, 2, NaN, 4])).toBeNaN();
    expect(bkXau.medianOf([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('bkXau — SWING motoru (M30 sinyal + H8 rejim)', () => {
  const htf8 = regimeSeries(TUE_NY_0730 - H8, H8, 60, 8.0);

  test('H8 rejiminde 4-bar tepe kırılımında LONG; geometri 1.8×ATR stop', () => {
    const c30 = swingSeries(TUE_NY_0730);
    const sig = bkXau.evalSwing(c30, htf8);
    expect(sig).toBeTruthy();
    expect(sig.direction).toBe('long');
    expectRunnerGeometry(sig);
  });

  test('ayna seride SHORT', () => {
    const sig = bkXau.evalSwing(mirror(swingSeries(TUE_NY_0730)), mirror(htf8));
    expect(sig).toBeTruthy();
    expect(sig.direction).toBe('short');
    expectRunnerGeometry(sig);
  });

  test('seans dışı SUSAR (NY 10:00)', () => {
    const t = Date.UTC(2026, 0, 13, 15, 0); // NY 10:00 ∉ [02:00, 09:30)
    expect(bkXau.evalSwing(swingSeries(t), regimeSeries(t - H8, H8, 60, 8.0))).toBeNull();
  });

  test('kırılım yoksa SUSAR (kapanış tetik tepesinin altında)', () => {
    const c30 = swingSeries(TUE_NY_0730);
    const last = c30[c30.length - 1];
    c30[c30.length - 1] = bar(last.time, last.open, last.open + 0.1, last.open + 0.4, last.open - 0.4);
    expect(bkXau.evalSwing(c30, htf8)).toBeNull();
  });
});

// REGRESYON (2026-07-23, CANLI ÖLÇÜMLE DOĞRULANDI): Yahoo hizalı FORMING barın
// ardına bir de hizasız "anlık kotasyon" satırı ekliyor. Yaygın slice(0,-1)
// kalıbı yalnız o satırı atıyor → geriye forming bar kalıyor. GC=F'te 75 sn
// arayla iki çekimde "değerlendirilen" 5m bar 15:40'ın kapanışı 4054.60→4054.30
// değişti (kapalı bar değişemez). Sinyal yarım mumdan doğuyor, signalId bara
// sabit olduğu için bar içinde kalıcı pozisyon + GERÇEK MT5 emri açılıyordu.
// ⚠️ Süzgeç artık AİLE GENELİNDE paylaşılıyor (forexKlines.closedBars) ve bu
// dosya onu kapsayan TEK testtir — silme, taşırsan testi de taşı.
// Ölçüt SAF ZAMAN: bar kapalı ⇔ bar.time + tfMs <= serinin SON satırının zamanı.
// (Hiza `time % tfMs` ile çözülemez: Yahoo 1d barları epoch'a hizalı değildir —
// GC=F 04:00 UTC damgalı, EURUSD=X DST ile gezer.)
describe('bkXau — kapalı bar süzgeci (closedBars, paylaşımlı)', () => {
  const TF = 5 * 60000;
  const t0 = Date.UTC(2026, 0, 13, 15, 0);
  const mk = (t, c) => bar(t, c, c, c + 1, c - 1);

  test('hizasız kotasyon satırı verinin ucu sayılır, forming bar DÜŞER', () => {
    const all = [
      mk(t0, 100), mk(t0 + TF, 101), mk(t0 + 2 * TF, 102), // 15:00,15:05,15:10
      mk(t0 + 3 * TF, 103),                                 // 15:15 → forming
      mk(t0 + 3 * TF + 104000, 104),                        // 15:16:44 hizasız kotasyon
    ];
    const out = bkXau.closedBars(all, TF);
    // Veri ucu 15:16:44 → 15:15 barı 15:20'de biter → FORMING, düşmeli.
    expect(out[out.length - 1].time).toBe(t0 + 2 * TF);
    expect(out).toHaveLength(3);
  });

  test('sabit slice(0,-1) bu durumda YANLIŞ olurdu (regresyonun kanıtı)', () => {
    const all = [
      mk(t0, 100), mk(t0 + TF, 101), mk(t0 + 2 * TF, 102),
      mk(t0 + 3 * TF, 103), mk(t0 + 3 * TF + 104000, 104),
    ];
    const naive = all.slice(0, -1);
    expect(naive[naive.length - 1].time).toBe(t0 + 3 * TF);        // forming bar!
    expect(bkXau.closedBars(all, TF)).not.toContainEqual(all[3]);  // süzgeç atar
  });

  // GÜVENLİK GARANTİSİ: sonuç HER ZAMAN slice(0,-1)'in alt kümesidir → hiçbir bot
  // bu süzgeçle daha önce GÖRMEDİĞİ bir bar görmez. Bedeli: kotasyon satırı
  // yokken (seans kapalı) en taze kapalı bar bir tur bekler — slice(0,-1) zaten
  // öyle davranıyordu, yani davranış kötüleşmiyor.
  test('kotasyon satırı yokken son bar TUTUCU şekilde bekletilir', () => {
    const all = [mk(t0, 100), mk(t0 + TF, 101), mk(t0 + 2 * TF, 102)];
    const out = bkXau.closedBars(all, TF);
    expect(out).toHaveLength(2);
    expect(out[out.length - 1].time).toBe(t0 + TF);
    // Alt-küme garantisi
    expect(out.length).toBeLessThanOrEqual(all.slice(0, -1).length);
  });

  test('saniye cinsinden zaman damgaları da doğru süzülür (fetchCandles saniye verir)', () => {
    const s0 = Math.floor(t0 / 1000);
    const all = [
      mk(s0, 100), mk(s0 + 300, 101), mk(s0 + 600, 102),
      mk(s0 + 900, 103), mk(s0 + 900 + 104, 104), // forming + kotasyon
    ];
    const out = bkXau.closedBars(all, TF);
    expect(out).toHaveLength(3);
    expect(out[out.length - 1].time).toBe(s0 + 600); // birim DEĞİŞMEDEN döner
  });

  test('boş/geçersiz girdi güvenli', () => {
    expect(bkXau.closedBars([], TF)).toEqual([]);
    expect(bkXau.closedBars(null, TF)).toEqual([]);
    expect(bkXau.closedBars([mk(t0, 100)], 0)).toEqual([]);
  });
});

// MT5'in iATR/iADX'i KLASİK Wilder tanımı değildir; EA bunları kullandığı için
// port yerel MT5-eşleniklerini uygular (paylaşılan customBotEngine'e dokunmadan).
describe('bkXau — MT5 gösterge eşlenikleri', () => {
  const series = trendish();
  function trendish(n = 120) {
    const out = []; let px = 100;
    for (let i = 0; i < n; i++) {
      const o = px, c = px + (i % 7 < 4 ? 1.2 : -0.8);
      out.push(bar(1700000000000 + i * MIN5, o, c, Math.max(o, c) + 0.5, Math.min(o, c) - 0.5));
      px = c;
    }
    return out;
  }

  test('mt5Atr = TR\'nin SMA\'sı (Wilder RMA DEĞİL)', () => {
    const a = bkXau.mt5Atr(series, 14);
    const i = series.length - 1;
    // Elle SMA doğrulaması: son 14 barın TR ortalaması.
    let sum = 0;
    for (let j = i - 13; j <= i; j++) {
      sum += Math.max(series[j].high, series[j - 1].close) - Math.min(series[j].low, series[j - 1].close);
    }
    expect(a[i]).toBeCloseTo(sum / 14, 9);
    // Wilder RMA farklı bir değer verir → port artık onu kullanmıyor.
    const wilder = require('../../src/services/botBuilder/customBotEngine').atr(series, 14);
    expect(a[i]).not.toBeCloseTo(wilder[i], 6);
  });

  test('mt5Dmi: DI/ADX 0-100 aralığında ve tek-yönlü DM kuralı uygulanır', () => {
    const { plusDI, minusDI, adx } = bkXau.mt5Dmi(series, 14);
    const i = series.length - 1;
    for (const v of [plusDI[i], minusDI[i], adx[i]]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    // MT5 seviyesi Wilder'dan sistematik olarak farklıdır (kapı kararını değiştirir).
    const w = require('../../src/services/botBuilder/customBotEngine').dmiSeries(series, 14);
    expect(adx[i]).not.toBeCloseTo(w.adx[i], 6);
  });

  test('kısa seride çökmez', () => {
    expect(bkXau.mt5Dmi([], 14).adx).toEqual([]);
    expect(bkXau.mt5Atr(series.slice(0, 3), 14)[2]).toBeNaN();
  });
});

describe('bkXau — tetik-bar disiplini', () => {
  test('önceki bar da aynı yönde tetiklediyse sinyal bastırılır', () => {
    const fake = (c) => ({ direction: 'long', entry: c.length, stop: c.length - 1, target1: 0, target2: 0, time: c[c.length - 1].time });
    const series = scalpSeries(TUE_NY_0800);
    expect(bkXau.withTriggerDiscipline(fake, series, [])).toBeNull();
    // Önceki bar tetiklemiyorsa sinyal geçer.
    const onlyLast = (c) => (c.length === series.length ? fake(c) : null);
    expect(bkXau.withTriggerDiscipline(onlyLast, series, [])).toBeTruthy();
  });
});

describe('bkXau — generate (aile snapshot şekli)', () => {
  const brokerPrices = require('../../src/services/forex/brokerPrices');
  beforeEach(() => {
    forexKlines.fetchCandles.mockReset();
    brokerPrices.__resetForTest();
  });
  afterAll(() => brokerPrices.__resetForTest());

  /**
   * GERÇEK Yahoo şekli taklit edilir: her seride (a) hizalı FORMING bar, (b) onun
   * ardında hizasız "anlık kotasyon" satırı. Naif slice(0,-1) yalnız (b)'yi atıp
   * forming barı değerlendirirdi; closedBars ikisini de atmalı ve sinyal gerçek
   * KAPALI kurulum barında (signalTime) bulunmalı.
   */
  function mockFeeds({ signalTime = TUE_NY_0800, dirty5m = null } = {}) {
    const quoteAt = signalTime + MIN5 + 104000; // hizasız kotasyon (veri ucu)

    let c5 = scalpSeries(signalTime);
    if (dirty5m) c5 = dirty5m(c5);
    c5.push(bar(signalTime + MIN5, 1, 1, 1.1, 0.9)); // hizalı FORMING
    c5.push(bar(quoteAt, 1, 1, 1.1, 0.9));           // hizasız kotasyon

    // 30m: son KAPALI bar signalTime−30dk; signalTime barı forming.
    const c30 = regimeSeries(signalTime - MIN30, MIN30);
    c30.push(bar(signalTime, 1, 1, 1.1, 0.9));
    c30.push(bar(quoteAt, 1, 1, 1.1, 0.9));

    // 8h: 8 saatlik kovalar 00/08/16 UTC'ye hizalıdır → son kapalı kova 00:00.
    const lastClosed8h = Math.floor((signalTime - H8) / H8) * H8;
    const c8 = regimeSeries(lastClosed8h, H8, 60, 8.0);
    c8.push(bar(lastClosed8h + H8, 1, 1, 1.1, 0.9)); // forming kova
    c8.push(bar(quoteAt, 1, 1, 1.1, 0.9));

    forexKlines.fetchCandles.mockImplementation((yahoo, tf) => {
      if (tf === '5m') return Promise.resolve(c5);
      if (tf === '30m') return Promise.resolve(c30);
      if (tf === '8h') return Promise.resolve(c8);
      return Promise.resolve([]);
    });
  }

  test('scalp kurulumu sinyale dönüşür: kimlik + isim + fiyat beslemesi', async () => {
    mockFeeds();
    const preset = getPreset('bk-xau');
    const snap = await bkXau.generate(preset, { nowMs: TUE_NY_0800 + MIN5 });
    expect(snap.engine).toBe('bk-xau');
    expect(snap.botName).toBe('BK XAU Runner');
    expect(snap.prices.XAUUSD).toBeGreaterThan(0);
    expect(snap.signals.length).toBe(1);
    const sig = snap.signals[0];
    expect(sig.signalId).toBe(`XAUUSD:bk-xau:5m:${TUE_NY_0800}`);
    expect(sig.strategy).toBe('bk-xau-scalp');
    expect(sig.strategyName).toBe('BK XAU Runner · Scalp');
    expect(sig.symbol).toBe('XAUUSD');
    expect(sig.tf).toBe('5m');
    expect(sig.direction).toBe('long');
    expectRunnerGeometry(sig);
  });

  test('kill-switch BK_XAU_DISABLED=1: sinyal YOK ama fiyat beslemesi sürer', async () => {
    mockFeeds();
    process.env.BK_XAU_DISABLED = '1';
    try {
      const snap = await bkXau.generate(getPreset('bk-xau'));
      expect(snap.signals).toHaveLength(0);
      expect(snap.prices.XAUUSD).toBeGreaterThan(0);
    } finally {
      delete process.env.BK_XAU_DISABLED;
    }
  });

  test('veri çekilemezse sessizce boş döner (throw yok)', async () => {
    forexKlines.fetchCandles.mockRejectedValue(new Error('yahoo down'));
    const snap = await bkXau.generate(getPreset('bk-xau'));
    expect(snap.signals).toHaveLength(0);
  });

  // fetchCandles'ın GERÇEK üretim hata davranışı reject DEĞİL, `null` ile
  // RESOLVE etmektir (yetersiz/erişilemez veri). .catch() bu yolu hiç görmez.
  test('fetchCandles null döndürürse çökmez, sinyal üretmez', async () => {
    forexKlines.fetchCandles.mockResolvedValue(null);
    const snap = await bkXau.generate(getPreset('bk-xau'));
    expect(snap.signals).toHaveLength(0);
    expect(snap.prices).toEqual({});
  });

  // Kısmi veri: 5m sağlam ama üst-TF beslemesi düşmüş → rejim okunamaz, motor
  // SUSAR (yanlış rejimle işlem açmaz) ama fiyat beslemesi sürer.
  test('üst-TF beslemesi düşerse motor susar, fiyat beslemesi sürer', async () => {
    const c5 = scalpSeries(TUE_NY_0800);
    forexKlines.fetchCandles.mockImplementation((yahoo, tf) => (
      tf === '5m' ? Promise.resolve(c5) : Promise.resolve(null)
    ));
    const snap = await bkXau.generate(getPreset('bk-xau'));
    expect(snap.signals).toHaveLength(0);
    expect(snap.prices.XAUUSD).toBeGreaterThan(0);
  });

  // Fiyat beslemesi köprünün CANLI broker fiyatını tercih etmeli: Yahoo GC=F
  // ~10 dk gecikmelidir ve SL/TP'yi o gecikmeyle işlemek istatistiği çarpıtır.
  test('canlı broker fiyatı varsa SL/TP takibi onu kullanır (Yahoo yedek)', async () => {
    mockFeeds();
    const snapYahoo = await bkXau.generate(getPreset('bk-xau'));
    const yahooPrice = snapYahoo.prices.XAUUSD;

    brokerPrices.set({ XAUUSD: { bid: 4100, ask: 4100.4 } });
    const snapBroker = await bkXau.generate(getPreset('bk-xau'));
    expect(snapBroker.prices.XAUUSD).toBeCloseTo(4100.2, 6);
    expect(snapBroker.prices.XAUUSD).not.toBeCloseTo(yahooPrice, 6);
  });

  // Bozuk bar koruması: high/low doğrulanmazsa ATR sessizce ya NaN'a düşer
  // (motor tamamen susar) ya da altın fiyatı kadar şişer (kapılar bozulur).
  test('bozuk high/low taşıyan barlar süzülür (sessiz bozulma yok)', async () => {
    // Gerçek Yahoo şekli korunur (forming + kotasyon), yalnız bir bar bozulur.
    mockFeeds({ dirty5m: (c5) => c5.map((b, idx) => (idx === 40 ? { ...b, low: undefined } : b)) });
    const snap = await bkXau.generate(getPreset('bk-xau'));
    // Bozuk bar atıldığı için motor çalışmaya devam eder ve sinyali bulur.
    expect(snap.signals).toHaveLength(1);
    expect(snap.signals[0].direction).toBe('long');
  });

  // Aile dispatch'i: cronJobs mt5Bots.generate(preset.id) çağırır — kind:'bkxau'
  // dalı çalışmazsa bot canlıda SESSİZCE hiç sinyal üretmez (kapsam boşluğuydu).
  test("mt5Bots.generate('bk-xau') aile dispatch'i bkXau motoruna gider", async () => {
    mockFeeds();
    const mt5Bots = require('../../src/services/mt5Bots');
    const snap = await mt5Bots.generate('bk-xau', { nowMs: TUE_NY_0800 + MIN5 });
    expect(snap.engine).toBe('bk-xau');
    expect(snap.signals.length).toBe(1);
    expect(snap.signals[0].strategy).toBe('bk-xau-scalp');
  });
});

// REGRESYON (2026-07-23): YH_RANGE['30m'] '2mo' idi ve Yahoo bunu 422 ile
// reddediyordu ("30m data ... must be within the last 60 days") → 0 bar. bkXau
// '30m' isteyen İLK tüketici olduğu için bot canlıda SESSİZCE hiç sinyal
// üretmezdi (swing motoru + scalp'in M30 rejimi ölürdü). Canlı ölçüm:
// 2mo→422/0 bar, 1mo→1202 bar.
describe('forexKlines — Yahoo gün-içi aralık sınırı (60 gün)', () => {
  // Dosya başındaki jest.mock fetchCandles'ı taklit ediyor; sabitler için GERÇEK modül.
  const { YH_RANGE } = jest.requireActual('../../src/services/forex/forexKlines');
  const RANGE_DAYS = { '1d': 1, '5d': 5, '1mo': 30, '2mo': 60, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825 };

  test("saat-altı aralıklar Yahoo'nun 60 günlük penceresini AŞMAZ", () => {
    // Yahoo sub-hour (1m/5m/15m/30m) verisini yalnız son 60 gün için verir ve
    // '2mo' pratikte 60 günü aştığı için 422 döner → sınır 60'ın ALTINDA olmalı.
    for (const tf of ['1m', '5m', '15m', '30m']) {
      const days = RANGE_DAYS[YH_RANGE[tf]];
      expect(days).toBeDefined();
      expect(days).toBeLessThan(60);
    }
  });

  test('bkXau\'nun istediği her TF için tanımlı aralık var', () => {
    for (const tf of ['5m', '30m', '8h']) expect(YH_RANGE[tf]).toBeTruthy();
  });
});

// REGRESYON (2026-07-23): botBuilder ALL_TF'te '30m' YOKTU ama catalogMeta bk-xau
// için ['5m','30m'] ilan ediyordu. Kullanıcı panelden TF filtresine dokunduğu anda
// sanitizeTfs '30m'i atıyor → tfAllowed('bk-xau','30m')=false → SWING pozisyonları
// köprü feed'inden SESSİZCE düşüyordu (panelden geri açmanın yolu da yoktu).
describe('botBuilder ALL_TF ⊇ catalogMeta TF ilanları (invaryant)', () => {
  const { ALL_TF } = jest.requireActual('../../src/services/botBuilder/store');
  const { META } = jest.requireActual('../../src/services/botBuilder/catalogMeta');

  test('hiçbir botun ilan ettiği TF ALL_TF dışında kalmaz', () => {
    const missing = [];
    for (const [botId, meta] of Object.entries(META)) {
      for (const tf of meta.timeframes || []) {
        if (!ALL_TF.includes(tf)) missing.push(`${botId}:${tf}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("bk-xau'nun her iki TF'i panelden seçilebilir ve köprüye geçer", () => {
    const store = jest.requireActual('../../src/services/botBuilder/store');
    store._dangerouslyResetForTest();
    expect(store.setBotTimeframes('bk-xau', ['5m', '30m']).timeframes).toEqual(['5m', '30m']);
    expect(store.tfAllowed('bk-xau', '5m')).toBe(true);
    expect(store.tfAllowed('bk-xau', '30m')).toBe(true);
    store._dangerouslyResetForTest();
  });
});

describe('bkXau — preset + katalog kayıt bütünlüğü (Bot 38)', () => {
  test('katalog girişi: no=38, magic 5750, köprüye AÇIK, aile kill anahtarı', () => {
    const entry = catalog.find((e) => e.id === 'bk-xau');
    expect(entry).toBeTruthy();
    expect(entry.no).toBe(38);
    expect(entry.magic).toBe(5750);
    expect(entry.mt5Tradeable).not.toBe(false); // kullanıcı isteği: VPS'te gerçek işlem
    expect(entry.engineDisableEnv).toBe('MT5_BOTS_DISABLED');
    expect(entry.competitionEligible).toBe(true);
  });

  // REGRESYON: Scalp ve Swing tek magic paylaşırsa köprü dedup'ı (magic+sembol+
  // yön) ikinci motoru "zaten_acik_sembol" ile reddeder → iki motordan yalnız
  // biri MT5'te işlem açar. Kaynak MQL5 paketi de ayrı magic kullanır.
  test('Scalp ve Swing AYRI magic alır ve hiçbir botla çakışmaz', () => {
    const entry = catalog.find((e) => e.id === 'bk-xau');
    expect(entry.magicByStrategy).toEqual({ 'bk-xau-scalp': 5750, 'bk-xau-swing': 5751 });
    // Alt-motor magic'leri katalogdaki TÜM magic'lere karşı benzersiz olmalı.
    const others = catalog.filter((e) => e.id !== 'bk-xau' && e.magic).map((e) => e.magic);
    for (const m of Object.values(entry.magicByStrategy)) {
      expect(others).not.toContain(m);
    }
  });

  test('bridgeFeed alt motorlara doğru magic yazar', () => {
    const cm = jest.requireActual('../../src/services/botCompetition/competitionManager');
    cm.resetForTest();
    const base = { symbol: 'XAUUSD', entry: 4000, stop: 3990, target1: 4020, confidence: 70 };
    cm.recordOpen('bk-xau', { ...base, signalId: 's1', strategy: 'bk-xau-scalp', tf: '5m', direction: 'long' });
    cm.recordOpen('bk-xau', { ...base, signalId: 's2', strategy: 'bk-xau-swing', tf: '30m', direction: 'long' });
    const feed = cm.bridgeFeed();
    const rows = feed.positions.filter((p) => p.botId === 'bk-xau');
    expect(rows).toHaveLength(2);
    expect(rows.find((p) => p.strategy === 'bk-xau-scalp').magic).toBe(5750);
    expect(rows.find((p) => p.strategy === 'bk-xau-swing').magic).toBe(5751);
    cm.resetForTest();
  });

  test('preset kaydı: kind bkxau, isim/magic katalogla birebir; magic benzersiz', () => {
    expect(BKXAU_PRESETS).toHaveLength(1);
    const preset = getPreset('bk-xau');
    expect(preset.kind).toBe('bkxau');
    const entry = catalog.find((e) => e.id === 'bk-xau');
    expect(entry.name).toBe(preset.name);
    expect(entry.magic).toBe(preset.magic);
    const magics = PRESETS.map((p) => p.magic);
    expect(new Set(magics).size).toBe(magics.length);
    const catMagics = catalog.filter((e) => e.magic).map((e) => e.magic);
    expect(new Set(catMagics).size).toBe(catMagics.length);
  });
});
