/**
 * GOLDEN TESTS — YENİ ROBOT · Derin Konfluans skorlama (proConfluence.analyzeTF).
 *
 * Kilitlenen davranışlar:
 *   1) Temiz UPTREND fixture → status 'signal', direction 'long', dolu votes.
 *   2) DETERMİNİZM: aynı mumlarda iki kez çağırınca yön + components + votes BİREBİR.
 *   3) AYARLI AĞIRLIK etkisi: BASE_WEIGHTS'ten farklı bir weights vektörü
 *      consensus'u DEĞİŞTİRİR (avgScore agreeing-skor ortalaması → ağırlıktan
 *      bağımsız, tüm oylar long olduğundan aynı kalır).
 *   4) Temiz DOWNTREND fixture → direction 'short'.
 *   5) <60 mum / boş → status 'no_data'.
 *
 * Fixture üreticisi SAF + DETERMİNİSTİK: tohumlu LCG (Date.now/Math.random YOK).
 * Mum dizisi analyzeTF'e DOĞRUDAN geçer → ağ yok, hermetik.
 */

const proConfluence = require('../../src/services/proSignals/proConfluence');

// Deterministik sözde-rasgele (LCG) — tohum başına aynı dizi.
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
}

// Tohumlu, sabit-eğilimli trend mum fixture'ı (≥150 bar).
function trend(seed, start, drift, n = 180) {
  const rnd = lcg(seed);
  const c = [];
  const t0 = 1700000000;
  let price = start;
  for (let i = 0; i < n; i++) {
    const wob = (rnd() - 0.5) * 0.8;
    const open = price;
    price = +(price + drift + wob).toFixed(4);
    const close = price;
    const high = +(Math.max(open, close) + Math.abs(wob) * 0.5 + 0.3).toFixed(4);
    const low = +(Math.min(open, close) - Math.abs(wob) * 0.5 - 0.3).toFixed(4);
    c.push({ time: t0 + i * 3600, open: +open.toFixed(4), high, low, close, volume: 1000 + Math.floor(rnd() * 200) });
  }
  return c;
}

const UPTREND = trend(12345, 100, 0.6);
const DOWNTREND = trend(555, 300, -1.0);
const OPTS = { id: 'BTCUSD', tf: '4h', class: 'crypto' };

describe('proConfluence.analyzeTF — temiz UPTREND → long sinyal', () => {
  test('status signal + direction long + dolu votes + bileşenler', async () => {
    const a = await proConfluence.analyzeTF(UPTREND, OPTS);
    expect(a.status).toBe('signal');
    expect(a.direction).toBe('long');
    expect(Array.isArray(a.votes)).toBe(true);
    expect(a.votes.length).toBeGreaterThan(0);
    // En az bir teknik long oy vermeli (yön long olduğuna göre)
    expect(a.votes.some(v => v.vote === 'long')).toBe(true);
    // Bileşenler dolu ve sınırlar içinde
    expect(a.components.consensus).toBeGreaterThan(0);
    expect(a.components.consensus).toBeLessThanOrEqual(1);
    expect(a.components.avgScore).toBeGreaterThan(50);   // long → agreeing skor >50
    expect(a.atr).toBeGreaterThan(0);
    expect(a.regimeMultiplier).toBeGreaterThan(0);
  });
});

describe('proConfluence.analyzeTF — DETERMİNİZM', () => {
  test('aynı mumlarda iki çağrı → yön + components + votes BİREBİR', async () => {
    const a = await proConfluence.analyzeTF(UPTREND, OPTS);
    const b = await proConfluence.analyzeTF(UPTREND, OPTS);
    expect(b.direction).toBe(a.direction);
    expect(b.components).toEqual(a.components);
    expect(b.votes).toEqual(a.votes);
    expect(b.atr).toBe(a.atr);
  });
});

describe('proConfluence.analyzeTF — AYARLI AĞIRLIK etkisi', () => {
  test('BASE\'ten farklı weights → consensus DEĞİŞİR (avgScore aynı: tüm oylar long)', async () => {
    const base = await proConfluence.analyzeTF(UPTREND, OPTS);
    // Tek bir lider boğa tekniğin (genel) ağırlığını düşür → ağırlıklı net/totalW
    // payı değişir → consensus farklılaşır. Yön ve agreeing skorlar (avgScore) korunur.
    const tuned = await proConfluence.analyzeTF(UPTREND, { ...OPTS, weights: { ...proConfluence.BASE_WEIGHTS, genel: 0.5 } });
    expect(tuned.direction).toBe('long');                 // yön korunur
    expect(tuned.components.consensus).not.toBe(base.components.consensus); // consensus kaydı
    expect(tuned.components.avgScore).toBe(base.components.avgScore);        // ağırlıktan bağımsız
  });

  test('TÜM ağırlıkları eşitlemek (uniform) consensus\'u BASE\'ten farklılaştırır', async () => {
    const base = await proConfluence.analyzeTF(UPTREND, OPTS);
    const uniform = Object.fromEntries(proConfluence.TECHNIQUE_KEYS.map(k => [k, 0.5]));
    const u = await proConfluence.analyzeTF(UPTREND, { ...OPTS, weights: uniform });
    expect(u.components.consensus).not.toBe(base.components.consensus);
  });
});

describe('proConfluence.analyzeTF — temiz DOWNTREND → short', () => {
  test('direction short + en az bir short oy', async () => {
    const d = await proConfluence.analyzeTF(DOWNTREND, OPTS);
    expect(d.status).toBe('signal');
    expect(d.direction).toBe('short');
    expect(d.votes.some(v => v.vote === 'short')).toBe(true);
    expect(d.components.avgScore).toBeLessThan(50);       // short → agreeing skor <50
  });
});

describe('proConfluence — sabitler + no_data', () => {
  test('BASE_WEIGHTS nesne, TECHNIQUE_KEYS 11 anahtar', () => {
    expect(typeof proConfluence.BASE_WEIGHTS).toBe('object');
    expect(Array.isArray(proConfluence.TECHNIQUE_KEYS)).toBe(true);
    expect(proConfluence.TECHNIQUE_KEYS).toHaveLength(11);
  });

  test('<60 mum → no_data; boş → no_data', async () => {
    const few = UPTREND.slice(0, 40);
    expect((await proConfluence.analyzeTF(few, OPTS)).status).toBe('no_data');
    expect((await proConfluence.analyzeTF([], OPTS)).status).toBe('no_data');
  });
});
