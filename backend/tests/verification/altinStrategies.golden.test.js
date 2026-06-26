/**
 * GOLDEN TESTS — ALTIN · TF-bazlı Strateji Tablosu (altinStrategies).
 *
 * Kilitlenen davranışlar:
 *   1) breakout20: son bar 20-bar tepesini kapanışla aşar + bias bull → entryAt 'long'.
 *   2) supertrend flip: trend[i-1]=-1 → trend[i]=+1 + bias bull → 'long'.
 *   3) emacross: EMA50 son barda EMA100'ü yukarı keser + bias bull → 'long'.
 *   4) pullback35: RSI <35'ten ≥35'e döner + bias bull + trendUp → 'long'.
 *   5) biasDir 'neutral' → entryAt HER ZAMAN null.
 *   6) levelsFor long: stop < entry < target; short: target < entry < stop.
 *   7) evaluateLatest: yalnız TETİK barında sinyal döndürür; <220 mum → [].
 *
 * Tüm fixture üreticileri SAF + DETERMİNİSTİK (tohumlu LCG; Date.now/Math.random YOK).
 * Mumlar doğrudan saf fonksiyonlara geçer → ağ YOK, hermetik.
 */

const altinStrategies = require('../../src/services/altin/altinStrategies');
const IND = require('../../src/services/customBots/indicators');

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
}

// Uzun yükseliş tabanı (≥220 bar → ema200/atr hazır, trendUp true).
function uptrend(seed, start, drift, n) {
  const rnd = lcg(seed);
  const c = []; const t0 = 1500000000; let price = start;
  for (let i = 0; i < n; i++) {
    const wob = (rnd() - 0.5) * Math.abs(drift) * 0.5;
    const open = price; price = +(price + drift + wob).toFixed(4); const close = price;
    const high = +(Math.max(open, close) + Math.abs(wob) * 0.4 + Math.abs(drift) * 0.3).toFixed(4);
    const low = +(Math.min(open, close) - Math.abs(wob) * 0.4 - Math.abs(drift) * 0.3).toFixed(4);
    c.push({ time: t0 + i * 86400, open: +open.toFixed(4), high, low, close, volume: 1000 });
  }
  return c;
}
function append(c, time, o, h, l, cl) { return c.concat([{ time, open: o, high: h, low: l, close: cl, volume: 1000 }]); }
function nextT(c) { return c[c.length - 1].time + 86400; }

// ── breakout20 fixture: son barda 20-bar tepesini güçlü aşar ──
function breakoutFixture() {
  const c = uptrend(11, 1500, 1.5, 240);
  const n = c.length - 1;
  let hi = -Infinity;
  for (let j = n - 20; j < n; j++) hi = Math.max(hi, c[j].high);
  const close = +(hi + 30).toFixed(2);
  c[n] = { time: c[n].time, open: c[n - 1].close, high: +(close + 5).toFixed(2), low: c[n - 1].close, close, volume: 1000 };
  return c;
}

// ── supertrend flip fixture: dip (trend -1) → güçlü toparlanma son bar (flip +1) ──
function supertrendFlipFixture() {
  let c = uptrend(22, 1500, 1.2, 235);
  let price = c[c.length - 1].close;
  for (let k = 0; k < 6; k++) {
    const t = nextT(c); price = +(price - 25).toFixed(2);
    c = append(c, t, +(price + 25).toFixed(2), +(price + 26).toFixed(2), +(price - 5).toFixed(2), price);
  }
  const t = nextT(c); const rec = +(price + 90).toFixed(2);
  c = append(c, t, price, +(rec + 5).toFixed(2), price, rec);
  return c;
}

// ── emacross fixture: dip (EMA50<EMA100) → toparlanma; SON BARDA cross olacak şekilde KIRP ──
function emacrossFixtureTrimmed() {
  let c = uptrend(33, 1500, 1.0, 200);
  let price = c[c.length - 1].close;
  for (let k = 0; k < 40; k++) { const t = nextT(c); price = +(price - 6).toFixed(2); c = append(c, t, +(price + 6).toFixed(2), +(price + 7).toFixed(2), +(price - 2).toFixed(2), price); }
  for (let k = 0; k < 60; k++) { const t = nextT(c); price = +(price + 7).toFixed(2); c = append(c, t, +(price - 7).toFixed(2), +(price + 1).toFixed(2), +(price - 8).toFixed(2), price); }
  // İlk yukarı-kesişimi bul ve seriyi o bara KIRP → kesişim son bar olur.
  const P = altinStrategies.prep(c);
  let crossIdx = -1;
  for (let x = 230; x < c.length; x++) { if (IND.crossesAbove(P.ema50, P.ema100, x)) { crossIdx = x; break; } }
  return c.slice(0, crossIdx + 1);
}

// ── pullback35 fixture: RSI <35'ten son barda ≥35'e döner, fiyat ema200*0.98 üstünde ──
function pullbackFixture() {
  let c = uptrend(44, 1500, 1.2, 230);
  let price = c[c.length - 1].close;
  for (let k = 0; k < 10; k++) { const t = nextT(c); price = +(price - 9).toFixed(2); c = append(c, t, +(price + 9).toFixed(2), +(price + 9.5).toFixed(2), +(price - 1).toFixed(2), price); }
  // tek toparlanma barı → RSI'yi 35'in altından üstüne taşır (probe: up=26 ⇒ rsi 10.86→35.33)
  const t = nextT(c); price = +(price + 26).toFixed(2);
  c = append(c, t, +(price - 26).toFixed(2), +(price + 1).toFixed(2), +(price - 27).toFixed(2), price);
  return c;
}

const BRK = breakoutFixture();
const STF = supertrendFlipFixture();
const EMC = emacrossFixtureTrimmed();
const PB = pullbackFixture();

describe('altinStrategies.entryAt — strateji tetikleri (bias bull → long)', () => {
  test('breakout20: son bar 20-bar tepesini aşar → long', () => {
    const P = altinStrategies.prep(BRK); const i = BRK.length - 1;
    expect(P.don20.upper[i]).not.toBeNull();
    expect(P.close[i]).toBeGreaterThan(P.don20.upper[i]);
    expect(altinStrategies.entryAt(P, i, 'breakout20', 'bull')).toBe('long');
  });

  test('supertrend flip: trend -1 → +1 → long', () => {
    const P = altinStrategies.prep(STF); const i = STF.length - 1;
    expect(P.st.trend[i - 1]).toBe(-1);
    expect(P.st.trend[i]).toBe(1);
    expect(altinStrategies.entryAt(P, i, 'supertrend', 'bull')).toBe('long');
  });

  test('emacross: EMA50 son barda EMA100\'ü yukarı keser → long', () => {
    const P = altinStrategies.prep(EMC); const i = EMC.length - 1;
    expect(IND.crossesAbove(P.ema50, P.ema100, i)).toBe(true);
    expect(altinStrategies.entryAt(P, i, 'emacross', 'bull')).toBe('long');
  });

  test('pullback35: RSI <35 → ≥35 → long', () => {
    const P = altinStrategies.prep(PB); const i = PB.length - 1;
    expect(P.rsi14[i - 1]).toBeLessThan(35);
    expect(P.rsi14[i]).toBeGreaterThanOrEqual(35);
    expect(altinStrategies.entryAt(P, i, 'pullback35', 'bull')).toBe('long');
  });

  test('biasDir "neutral" → HER strateji null', () => {
    for (const [fx, type] of [[BRK, 'breakout20'], [STF, 'supertrend'], [EMC, 'emacross'], [PB, 'pullback35']]) {
      const P = altinStrategies.prep(fx); const i = fx.length - 1;
      expect(altinStrategies.entryAt(P, i, type, 'neutral')).toBeNull();
    }
  });
});

describe('altinStrategies.levelsFor — SL/TP yerleşimi', () => {
  test('long: stop < entry < target', () => {
    const lv = altinStrategies.levelsFor(100, 5, { tp: 1.5, sl: 3 }, 'long');
    expect(lv.stop).toBeLessThan(lv.entry);
    expect(lv.entry).toBeLessThan(lv.target);
    expect(lv).toEqual({ entry: 100, stop: 85, target: 107.5 });
  });

  test('short: target < entry < stop', () => {
    const lv = altinStrategies.levelsFor(100, 5, { tp: 1.5, sl: 3 }, 'short');
    expect(lv.target).toBeLessThan(lv.entry);
    expect(lv.entry).toBeLessThan(lv.stop);
    expect(lv).toEqual({ entry: 100, stop: 115, target: 92.5 });
  });
});

describe('altinStrategies.evaluateLatest — yalnız tetik barında sinyal', () => {
  test('breakout fixture 1d → tek breakout20 long sinyali', () => {
    const sigs = altinStrategies.evaluateLatest(BRK, '1d', 'bull');
    expect(sigs.length).toBe(1);                  // 1d: pullback35 tetiklenmez, yalnız breakout20
    const s = sigs[0];
    expect(s.type).toBe('breakout20');
    expect(s.direction).toBe('long');
    expect(s.action).toBe('LONG');
    expect(s.confidence).toBe(70);                // 'orta'
    expect(s.stop).toBeLessThan(s.entry);
    expect(s.entry).toBeLessThan(s.target);
    expect(s.barTime).toBe(BRK[BRK.length - 1].time);
  });

  test('supertrend flip fixture 4h → supertrend long sinyali içerir', () => {
    const sigs = altinStrategies.evaluateLatest(STF, '4h', 'bull');
    expect(sigs.some(s => s.type === 'supertrend' && s.direction === 'long' && s.confidence === 82)).toBe(true);
  });

  test('bias neutral → boş', () => {
    expect(altinStrategies.evaluateLatest(BRK, '1d', 'neutral')).toEqual([]);
  });

  test('<220 mum → boş', () => {
    expect(altinStrategies.evaluateLatest(BRK.slice(0, 100), '1d', 'bull')).toEqual([]);
    expect(altinStrategies.evaluateLatest([], '1d', 'bull')).toEqual([]);
  });
});

describe('altinStrategies — sabitler + DETERMİNİZM', () => {
  test('CONF + TF_STRATEGIES tablosu', () => {
    expect(altinStrategies.CONF).toEqual({ yüksek: 82, orta: 70, düşük: 55 });
    expect(Object.keys(altinStrategies.TF_STRATEGIES)).toEqual(['1d', '8h', '4h', '1h', '15m', '5m', '1m']);
  });

  test('aynı fixture iki kez → birebir aynı sinyaller', () => {
    expect(altinStrategies.evaluateLatest(BRK, '1d', 'bull')).toEqual(altinStrategies.evaluateLatest(BRK, '1d', 'bull'));
  });
});
