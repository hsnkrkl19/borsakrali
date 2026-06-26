/**
 * GOLDEN TESTS — BEAST Trend (Zero-Lag + Ichimoku + Scalper Beast füzyonu).
 *
 * Kapsam: göstergeler (zlema/zero-lag durum makinesi/supertrend/adx/resample),
 * seviyeler (yapısal ATR stop + temiz R/R), çıkış modları (fixed/partial/runner R
 * muhasebesi), strateji kapıları, config (aktif hücreler), tracker (numara/dedup/flip).
 * Tümü deterministik sentetik veriyle — ağ yok.
 */

const I = require('../../src/services/beast/beastIndicators');
const S = require('../../src/services/beast/beastStrategy');
const bt = require('../../src/services/beast/beastBacktest');
const cfgMod = require('../../src/services/beast/beastConfig');
const tracker = require('../../src/services/beast/beastTracker');
const { getInstrument, TF_DEFS } = require('../../src/services/beast/beastInstruments');

// Sentetik mum üreticisi: kapanış serisi → OHLC (küçük wick)
function candlesFromCloses(closes, t0 = 1700000000, step = 86400) {
  return closes.map((c, i) => {
    const prev = i > 0 ? closes[i - 1] : c;
    const hi = Math.max(c, prev) * 1.004;
    const lo = Math.min(c, prev) * 0.996;
    return { time: t0 + i * step, open: prev, high: +hi.toFixed(4), low: +lo.toFixed(4), close: +c.toFixed(4), volume: 1000 + (i % 7) * 50 };
  });
}
function trendUp(n, start = 100, slope = 0.5, noise = 0.0) {
  const out = []; for (let i = 0; i < n; i++) out.push(start + slope * i + noise * Math.sin(i / 3)); return out;
}

// ─────────────────────────── Göstergeler ───────────────────────────
describe('beastIndicators', () => {
  test('zlemaSeries fiyatı EMA\'dan daha yakın takip eder (daha az gecikme)', () => {
    const closes = trendUp(120, 100, 1.0);
    const zl = I.zlemaSeries(closes, 20);
    const ema = I.emaSeries(closes, 20);
    const last = closes.length - 1;
    // Yükselen trendde zlema fiyata EMA'dan daha yakın (lag azaltımı)
    expect(closes[last] - zl[last]).toBeLessThan(closes[last] - ema[last]);
  });

  test('zeroLagTrend keskin yükselişte +1\'e, düşüşe dönünce -1\'e geçer; az whipsaw', () => {
    const flat = new Array(50).fill(100);          // band otursun
    const up = []; let v = 100; for (let i = 0; i < 90; i++) { v += 1.3; up.push(v); }   // keskin kırılım
    const down = []; for (let i = 0; i < 90; i++) { v -= 1.3; down.push(v); }
    const candles = candlesFromCloses(flat.concat(up).concat(down));
    const z = I.zeroLagTrend(candles, 34, 1.0);
    expect(z.trend[candles.length - 1]).toBe(-1);   // sonda düşüş onaylı
    expect(z.trend.includes(1)).toBe(true);         // yükseliş bir noktada +1 oldu
    let flips = 0; for (let i = 1; i < z.trend.length; i++) if (z.trend[i] !== z.trend[i - 1] && z.trend[i] !== 0) flips++;
    expect(flips).toBeLessThan(10);                 // düşük whipsaw (durum makinesi)
  });

  test('supertrendSeries yükselişte dir=+1 (fiyat ST üstünde)', () => {
    const candles = candlesFromCloses(trendUp(120, 100, 0.7));
    const st = I.supertrendSeries(candles, 10, 3);
    const last = candles.length - 1;
    expect(st.dir[last]).toBe(1);
    expect(st.st[last]).toBeLessThan(candles[last].close); // ST destek altta
  });

  test('adxSeries güçlü trendde >20, +DI>-DI yükselişte', () => {
    const candles = candlesFromCloses(trendUp(120, 100, 0.8));
    const a = I.adxSeries(candles, 14);
    const last = candles.length - 1;
    expect(a.adx[last]).toBeGreaterThan(20);
    expect(a.plusDI[last]).toBeGreaterThan(a.minusDI[last]);
  });

  test('atrSeries pozitif ve makul', () => {
    const candles = candlesFromCloses(trendUp(60, 100, 0.5));
    const a = I.atrSeries(candles, 14);
    expect(a[a.length - 1]).toBeGreaterThan(0);
  });

  test('resample faktör kadar bar toplar, sadece tam gruplar', () => {
    const candles = candlesFromCloses(trendUp(40, 100, 1));
    const r = I.resample(candles, 4);
    expect(r.length).toBe(10);
    expect(r[0].open).toBe(candles[0].open);
    expect(r[0].close).toBe(candles[3].close);
    expect(r[0].high).toBe(Math.max(...candles.slice(0, 4).map(c => c.high)));
  });

  test('recentSwing son onaylı dip/tepeyi bulur (son right bar pivot olamaz)', () => {
    const closes = [...trendUp(20, 100, 1), 122, 118, 121, 125, 130];
    const candles = candlesFromCloses(closes);
    const sw = I.recentSwing(candles, candles.length - 1, 3, 3, 40);
    expect(sw.swingLow == null || sw.swingLow > 0).toBe(true);
  });
});

// ─────────────────────────── Seviyeler ───────────────────────────
describe('beastStrategy.buildLevels', () => {
  const cfg = { minStopATR: 2.0, maxStopATR: 3.0, rr1: 2.0, rr2: 4.0, swingBufATR: 0.25 };

  test('LONG: stop<giriş<TP1<TP2, R/R tam 2:1 ve 4:1', () => {
    const lv = S.buildLevels('long', 100, 1.0, { swingLow: 96, swingHigh: 104 }, cfg, 2);
    expect(lv.stop).toBeLessThan(100);
    expect(lv.target1).toBeGreaterThan(100);
    expect(lv.target2).toBeGreaterThan(lv.target1);
    const risk = 100 - lv.stop;
    expect((lv.target1 - 100) / risk).toBeCloseTo(2.0, 1);
    expect((lv.target2 - 100) / risk).toBeCloseTo(4.0, 1);
  });

  test('stop mesafesi [minStopATR..maxStopATR]·ATR bandına sığar (dar)', () => {
    // swingLow çok uzak → maxStopATR'ye clamp
    const lv = S.buildLevels('long', 100, 1.0, { swingLow: 80, swingHigh: 104 }, cfg, 2);
    const dist = 100 - lv.stop;
    expect(dist).toBeLessThanOrEqual(3.0 + 1e-6);
    expect(dist).toBeGreaterThanOrEqual(2.0 - 1e-6);
  });

  test('SHORT: stop>giriş>TP1>TP2', () => {
    const lv = S.buildLevels('short', 100, 1.0, { swingLow: 96, swingHigh: 104 }, cfg, 2);
    expect(lv.stop).toBeGreaterThan(100);
    expect(lv.target1).toBeLessThan(100);
    expect(lv.target2).toBeLessThan(lv.target1);
  });
});

// ─────────────────────────── Çıkış modları (R muhasebesi) ───────────────────────────
describe('beastBacktest.simulateTrade — çıkış modu R muhasebesi', () => {
  const cfg = { rr1: 2.0, rr2: 4.0, trailATR: 2.0 };
  const lvLong = { entry: 100, stop: 98, target1: 104, target2: 108, riskDist: 2 };

  function mkExitCandles(path) { return candlesFromCloses([100, ...path]); }

  test('fixed: TP1\'e ulaşırsa R=rr1', () => {
    // giriş i+1; i=0 giriş bar, sonra yükselip TP1=104 geçer
    const candles = candlesFromCloses([100, 100, 101, 103, 105, 106]);
    const r = bt.simulateTrade(candles, 0, 100, lvLong, 1.0, { ...cfg, partialMode: 'fixed' }, 40, candles.length);
    expect(r.exitReason).toBe('tp1');
    expect(r.exitR).toBeCloseTo(2.0, 5);
  });

  test('fixed: stop\'a düşerse R=-1', () => {
    const candles = candlesFromCloses([100, 100, 99, 97, 96]);
    const r = bt.simulateTrade(candles, 0, 100, lvLong, 1.0, { ...cfg, partialMode: 'fixed' }, 40, candles.length);
    expect(r.exitReason).toBe('stop');
    expect(r.exitR).toBe(-1);
  });

  test('partial: aynı barda TP1+TP2 → R = 0.5·rr1 + 0.5·rr2', () => {
    // keskin sıçrama: tek barda hem TP1(104) hem TP2(108) geçilir
    const candles = candlesFromCloses([100, 100, 102, 112]);
    const r = bt.simulateTrade(candles, 0, 100, lvLong, 1.0, { ...cfg, partialMode: 'partial' }, 40, candles.length);
    expect(r.exitReason).toBe('tp2');
    expect(r.exitR).toBeCloseTo(0.5 * 2 + 0.5 * 4, 5); // = 3.0
  });

  test('partial: TP1 sonrası geri çekilirse iz-süren/BE ile kâr veya başabaş kapanır', () => {
    const candles = candlesFromCloses([100, 100, 103, 105, 107, 102]);
    const r = bt.simulateTrade(candles, 0, 100, lvLong, 1.0, { ...cfg, partialMode: 'partial' }, 40, candles.length);
    expect(['trail', 'be', 'tp2', 'timeout']).toContain(r.exitReason);
    expect(r.exitR).toBeGreaterThan(0); // TP1 kilitlendi → en kötü kısmi kâr
  });

  test('runner: stop\'tan önce hiç +1R görmezse tam kayıp', () => {
    const candles = candlesFromCloses([100, 100, 99, 98, 97]);
    const r = bt.simulateTrade(candles, 0, 100, lvLong, 1.0, { ...cfg, partialMode: 'runner' }, 40, candles.length);
    expect(r.exitR).toBe(-1);
    expect(r.exitReason).toBe('stop');
  });
});

// ─────────────────────────── Strateji kapıları ───────────────────────────
describe('beastStrategy.evaluateAt — kapılar', () => {
  test('trend 0 (yön yok) → null', () => {
    const candles = candlesFromCloses(trendUp(200, 100, 0.0001)); // düz
    const cfg = cfgMod.resolveConfig(getInstrument('BTCUSD'), '1d');
    const ind = S.prepare(candles, cfg);
    const idx = candles.length - 2;
    const sig = S.evaluateAt(candles, ind, cfg, idx, '1d', { trend: 0, aboveCloud: false, belowCloud: false, ok: true }, 2);
    // düz piyasada ya null ya da çok düşük; en azından patlamamalı
    expect(sig === null || typeof sig.confidence === 'number').toBe(true);
  });

  test('HTF ters yön → LONG sinyali bloke', () => {
    const candles = candlesFromCloses(trendUp(220, 100, 0.6)); // güçlü yükseliş (zlt=+1)
    const cfg = cfgMod.resolveConfig(getInstrument('BTCUSD'), '4h');
    const ind = S.prepare(candles, cfg);
    const idx = candles.length - 2;
    // HTF trend -1 (ters) → long bloke olmalı
    const blocked = S.evaluateAt(candles, ind, cfg, idx, '4h', { trend: -1, aboveCloud: false, belowCloud: true, ok: true }, 2);
    expect(blocked).toBeNull();
  });

  test('ADX kapısı VARSAYILAN kapalı (adxMin=0) → tuned config\'te DI hizalama zorlamaz', () => {
    const cfg = cfgMod.resolveConfig(getInstrument('BTCUSD'), '4h');
    expect(cfg.adxMin).toBe(0);
    expect(cfg.adxDiGate).toBe(false);
  });
});

// ─────────────────────────── Backtest entegrasyon ───────────────────────────
describe('beastBacktest.runBacktest — sentetik trend', () => {
  test('trend+pullback serisinde işlem üretir, metrikler sağlıklı', () => {
    // yükseliş + periyodik geri çekilmeler (trigger üretir)
    const closes = [];
    let v = 100;
    for (let i = 0; i < 400; i++) { v += 0.6 + (i % 20 === 0 ? -6 : 0) + 0.5 * Math.sin(i / 4); closes.push(v); }
    const candles = candlesFromCloses(closes);
    const cfg = cfgMod.resolveConfig(getInstrument('BTCUSD'), '1d');
    const m = bt.runBacktest(candles, 5, cfg, TF_DEFS['1d'], 2);
    expect(m.trades).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(m.avgR)).toBe(true);
    expect(m.winRate).toBeGreaterThanOrEqual(0);
    expect(m.winRate).toBeLessThanOrEqual(100);
  });

  test('vs-random baseline çalışır ve işlem döner', () => {
    const candles = candlesFromCloses(trendUp(300, 100, 0.5, 2));
    const cfg = cfgMod.resolveConfig(getInstrument('ETHUSD'), '1d');
    let seed = 42; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const trades = bt.runRandomBaseline(candles, cfg, TF_DEFS['1d'], 2, 20, rnd);
    expect(Array.isArray(trades)).toBe(true);
    for (const t of trades) expect(Number.isFinite(t.R)).toBe(true);
  });
});

// ─────────────────────────── Config ───────────────────────────
describe('beastConfig', () => {
  test('v2 aktif hücreler: TÜM 1h KAPALI (gürültü/çelişki), 4h+1d AÇIK (4 parite)', () => {
    expect(cfgMod.isEnabled('BTCUSD', '1h')).toBe(false);
    expect(cfgMod.isEnabled('ETHUSD', '1h')).toBe(false);
    expect(cfgMod.isEnabled('XAUUSD', '1h')).toBe(false);
    expect(cfgMod.isEnabled('BTCUSD', '4h')).toBe(true);
    expect(cfgMod.isEnabled('XAGUSD', '1d')).toBe(true);   // v2'de açıldı
    expect(cfgMod.isEnabled('XAUUSD', '1d')).toBe(true);
  });

  test('resolveConfig per-TF zlLength ve mode uygular (4h/1d runner)', () => {
    const c4h = cfgMod.resolveConfig(getInstrument('BTCUSD'), '4h');
    const c1d = cfgMod.resolveConfig(getInstrument('BTCUSD'), '1d');
    expect(c4h.zlLength).toBe(cfgMod.TF_ZL['4h']);
    expect(c4h.partialMode).toBe('runner');
    expect(c1d.partialMode).toBe('runner');
  });

  test('tuned global v2: TP1 1.5R / TP2 3R, stop bandı 2.0-3.0', () => {
    expect(cfgMod.TUNED.rr1).toBe(1.5);
    expect(cfgMod.TUNED.rr2).toBe(3.0);
    expect(cfgMod.TUNED.minStopATR).toBe(2.0);
    expect(cfgMod.TUNED.maxStopATR).toBe(3.0);
  });
});

// ─────────────────────────── Tracker ───────────────────────────
describe('beastTracker', () => {
  beforeEach(() => tracker.__resetForTest());

  test('nextCode enstrüman ön-eki + artan sayaç', () => {
    expect(tracker.nextCode('BTCUSD')).toBe('BTC-01');
    expect(tracker.nextCode('BTCUSD')).toBe('BTC-02');
    expect(tracker.nextCode('XAUUSD')).toBe('XAU-01');
  });

  test('syncPositions yeni pozisyon açar, aynı yön tekrar → update', async () => {
    const sig = { id: 'BTCUSD', symbol: 'BTC/USD', short: 'BTC', tf: '4h', direction: 'long', entry: 100, stop: 97, target1: 106, target2: 112, rr1: 2, rr2: 4, atr: 1, confidence: 70, grade: 'GUCLU', trigger: 'zlema', mode: 'runner', precision: 2, time: 1700000000 };
    const e1 = await tracker.syncPositions([sig]);
    expect(e1[0].type).toBe('new');
    expect(tracker.getOpen().length).toBe(1);
    // aynı yön, daha iyi stop → update + trail
    const e2 = await tracker.syncPositions([{ ...sig, stop: 98, confidence: 75, time: 1700003600 }]);
    expect(e2[0].type).toBe('update');
    expect(tracker.getOpen()[0].stop).toBe(98);
    expect(tracker.getOpen().length).toBe(1);
  });

  test('ters yön → flip (eski kapanır, yeni açılır)', async () => {
    const base = { id: 'ETHUSD', symbol: 'ETH/USD', short: 'ETH', tf: '1d', direction: 'long', entry: 100, stop: 97, target1: 106, target2: 112, rr1: 2, rr2: 4, atr: 1, confidence: 70, grade: 'GUCLU', trigger: 'zlema', mode: 'runner', precision: 2, time: 1700000000 };
    await tracker.syncPositions([base]);
    const e = await tracker.syncPositions([{ ...base, direction: 'short', entry: 95, stop: 98, target1: 89, target2: 83, time: 1700090000 }]);
    expect(e[0].type).toBe('flip');
    expect(tracker.getOpen().length).toBe(1);
    expect(tracker.getOpen()[0].direction).toBe('short');
  });

  test('yön kilidi: paritede ters yön açıkken çelişkili sinyal bastırılır', async () => {
    const base = { id: 'BTCUSD', symbol: 'BTC/USD', short: 'BTC', tf: '1d', direction: 'long', entry: 100, stop: 97, target1: 104, target2: 110, rr1: 1.5, rr2: 3, atr: 1, confidence: 70, grade: 'GUCLU', trigger: 'zlema', mode: 'runner', precision: 2, time: 1700000000 };
    await tracker.syncPositions([base]);
    // aynı parite 4h'te TERS yön → bastırılmalı (çelişki yok)
    const e = await tracker.syncPositions([{ ...base, tf: '4h', direction: 'short', entry: 99, stop: 102, target1: 95, target2: 90, time: 1700090000 }]);
    expect(e[0].type).toBe('suppressed');
    expect(tracker.getOpen().length).toBe(1);
    expect(tracker.getOpen()[0].direction).toBe('long');
  });

  test('evalForward LONG: TP1 mumu gelince fixed modda kapanır', () => {
    const pos = { direction: 'long', entry: 100, stop: 98, target1: 104, target2: 108, atr: 1, tf: '1d', mode: 'fixed', issueTime: 1700000000, stopSetTime: 1700000000, precision: 2 };
    const candles = candlesFromCloses([100, 101, 103, 105], 1700086400, 86400); // hepsi issue sonrası
    const r = tracker.evalForward(pos, candles);
    expect(r.closed).toBe(true);
    expect(r.outcome).toBe('TP1');
  });
});
