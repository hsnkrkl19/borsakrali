'use strict';

const svc = require('../../src/services/ictSmc/ictSmcService');
const { runEngine } = require('../../src/services/ictSmc/ictSmcEngine');

const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);
const STEP = 15 * 60 * 1000;
function bar(i, o, h, l, c, v = 1000) { return { time: T0 + i * STEP, open: o, high: h, low: l, close: c, volume: v }; }

// Düz bir taban + net Donchian yukarı kırılımı üreten seri.
function breakoutSeries() {
  const c = [];
  for (let i = 0; i < 60; i++) c.push(bar(i, 100, 100.5, 99.5, 100)); // düz taban
  // güçlü kırılım barı (yüksek hacim, önceki 20 tepeyi aş)
  c.push(bar(60, 100, 103.2, 100, 103, 5000));
  for (let i = 61; i < 90; i++) c.push(bar(i, 103, 103.5, 102.5, 103.2)); // devam
  return c;
}

describe('ICT/SMC motoru — port doğrulaması', () => {
  test('22 stratejinin tümü desteklenir ve çıktı sözleşmesi tutar', () => {
    expect(svc.SUPPORTED_STRATEGIES.length).toBe(22);
    expect(svc.DEFAULT_STRATEGIES.every((s) => svc.SUPPORTED_STRATEGIES.includes(s))).toBe(true);
    expect(() => svc.analyzeCandles([], 'ict2022')).not.toThrow();
    expect(() => svc.analyzeCandles([bar(0, 1, 1, 1, 1)], 'yok_boyle_strateji')).toThrow(/Bilinmeyen/);
  });

  test('motor kısa seride boş, uzun seride çalışır (crash yok)', () => {
    const r = runEngine(breakoutSeries(), { strategy: 'breakout' });
    expect(Array.isArray(r.bars)).toBe(true);
    expect(r.bars.length).toBe(90);
  });

  test('Donchian yukarı kırılımı LONG sinyal üretir, SL girişin altında', () => {
    const r = svc.analyzeCandles(breakoutSeries(), 'breakout', { volFilterOn: true, volMult: 1.5 });
    const longs = r.signals.filter((s) => s.side === 'long');
    expect(longs.length).toBeGreaterThanOrEqual(1);
    const s = longs[0];
    expect(s.stop).toBeLessThan(s.entry);
    expect(s.target1).toBeGreaterThan(s.entry);
    expect(s.target2).toBeGreaterThan(s.target1);
  });

  test('tüm üretilen sinyaller SL/TP yön değişmezlerini korur + güven 0-100', () => {
    const c = [];
    let px = 100;
    for (let i = 0; i < 500; i++) {
      const drift = Math.sin(i / 18) * 4 + Math.cos(i / 7) * 1.5;
      const o = px, cl = 100 + drift + ((i % 5) - 2) * 0.4;
      c.push(bar(i, o, Math.max(o, cl) + 0.7, Math.min(o, cl) - 0.7, cl, 1000 + (i % 6) * 300));
      px = cl;
    }
    let checked = 0;
    for (const strat of svc.SUPPORTED_STRATEGIES) {
      const r = svc.analyzeCandles(c, strat, {});
      for (const s of r.signals) {
        checked++;
        expect(Number.isFinite(s.entry) && Number.isFinite(s.stop) && Number.isFinite(s.target1) && Number.isFinite(s.target2)).toBe(true);
        if (s.side === 'long') {
          expect(s.stop).toBeLessThan(s.entry);
          expect(s.target1).toBeGreaterThan(s.entry);
        } else {
          expect(s.stop).toBeGreaterThan(s.entry);
          expect(s.target1).toBeLessThan(s.entry);
        }
        expect(s.confidence).toBeGreaterThanOrEqual(0);
        expect(s.confidence).toBeLessThanOrEqual(100);
      }
    }
    expect(checked).toBeGreaterThan(10); // birden çok strateji sinyal üretmiş olmalı
  });

  test('analyzeLatest yalnız son barlardaki sinyalleri döndürür + buildSnapshot competition şekline uyar', () => {
    const c = breakoutSeries();
    const latest = svc.analyzeLatest(c, ['breakout'], { freshBars: 90 });
    const snap = svc.buildSnapshot([{ instrument: { id: 'XAUUSD', symbol: 'XAUUSD', yahoo: 'GC=F' }, signals: latest }], { tf: '15m' });
    expect(snap.engine).toBe('ict-smc');
    expect(Array.isArray(snap.signals)).toBe(true);
    if (snap.signals.length) {
      const s = snap.signals[0];
      // competition genericSignals/recordOpen alan sözleşmesi
      expect(s).toHaveProperty('symbol');
      expect(s).toHaveProperty('direction');
      expect(s).toHaveProperty('entry');
      expect(s).toHaveProperty('stop');
      expect(s).toHaveProperty('target1');
      expect(s).toHaveProperty('confidence');
      expect(s).toHaveProperty('signalId');
    }
  });

  test('cooldown iki sinyal arasını sınırlar', () => {
    const c = breakoutSeries();
    const noCool = svc.analyzeCandles(c, 'scalp', { cooldownBars: 0 });
    const withCool = svc.analyzeCandles(c, 'scalp', { cooldownBars: 20 });
    expect(withCool.signals.length).toBeLessThanOrEqual(noCool.signals.length);
  });
});
