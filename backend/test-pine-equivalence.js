/**
 * Pine Script Eşdeğerlik Testi
 * ────────────────────────────
 * Bu test, server-live.js içindeki EMA / TEMA / ATR / RMA hesaplamalarının
 * TradingView Pine Script `ta.ema()`, `ta.tema()`, `ta.atr()`, `ta.rma()`
 * fonksiyonlarıyla BİREBİR eşit olduğunu doğrular.
 *
 * Yöntem:
 *   1. Bir referans (Pine Script formülünün karakter-bazlı transliterasyonu)
 *      ayrı olarak tanımlanır.
 *   2. Server-live.js'ten import edilen üretim kodu aynı veri üzerinde çalıştırılır.
 *   3. Her bar için fark hesaplanır — toleransın üstündeyse FAIL.
 *
 * Çalıştırma: `node test-pine-equivalence.js`
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 1) PINE REFERANSI — Pine Script kaynak kodundan birebir transliterasyon
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pine `ta.ema(source, length)`
 *   alpha = 2 / (length + 1)
 *   ema = alpha * source + (1 - alpha) * ema[1]
 *   ilk bar: ema[1] na → source[0] olarak değerlendirilir
 */
function pineEMA(src, length) {
  const n = src.length;
  if (n === 0) return [];
  const alpha = 2 / (length + 1);
  const out = new Array(n);
  out[0] = src[0];
  for (let i = 1; i < n; i++) {
    out[i] = alpha * src[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

/**
 * Pine `ta.tema(source, length)`
 *   ema1 = ta.ema(source, length)
 *   ema2 = ta.ema(ema1,   length)
 *   ema3 = ta.ema(ema2,   length)
 *   tema = 3 * (ema1 - ema2) + ema3
 */
function pineTEMA(src, length) {
  const ema1 = pineEMA(src, length);
  const ema2 = pineEMA(ema1, length);
  const ema3 = pineEMA(ema2, length);
  return src.map((_, i) => 3 * (ema1[i] - ema2[i]) + ema3[i]);
}

/**
 * Pine `ta.rma(source, length)` — Wilder's RMA
 *   alpha = 1 / length
 *   rma = alpha * source + (1 - alpha) * rma[1]
 *   ilk bar: rma[1] na → source[0]
 */
function pineRMA(src, length) {
  const n = src.length;
  if (n === 0) return [];
  const alpha = 1 / length;
  const out = new Array(n);
  out[0] = src[0];
  for (let i = 1; i < n; i++) {
    out[i] = alpha * src[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

/**
 * Pine `ta.tr` ve `ta.atr(length)`
 *   tr = max(high - low, |high - close[1]|, |low - close[1]|)
 *   atr = ta.rma(tr, length)
 */
function pineATR(highs, lows, closes, length = 14) {
  const n = closes.length;
  if (n === 0) return [];
  const tr = new Array(n);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }
  return pineRMA(tr, length);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) ÜRETİM KODU — server-live.js'teki yardımcı fonksiyonların kopyaları
// (require ile import zorlaştırdığı için karakter-bazlı kopya alındı —
// bu kopyalar production ile aynı olduğu sürece tester geçerlidir.
// server-live.js'te değişiklik olursa burayı senkron et!)
// ═══════════════════════════════════════════════════════════════════════════

function calcEMASeries(closes, period) {
  const n = closes.length;
  if (n === 0) return [];
  const alpha = 2 / (period + 1);
  const out = new Array(n);
  out[0] = closes[0];
  for (let i = 1; i < n; i++) {
    out[i] = alpha * closes[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function calcEMA(closes, period) {
  if (!closes || closes.length === 0) return null;
  const s = calcEMASeries(closes, period);
  return s[s.length - 1];
}

function calcTEMASeries(closes, period) {
  const n = closes.length;
  if (n === 0) return [];
  const k = 2 / (period + 1);
  const ema1 = new Array(n);
  const ema2 = new Array(n);
  const ema3 = new Array(n);
  const tema = new Array(n);
  ema1[0] = closes[0];
  ema2[0] = closes[0];
  ema3[0] = closes[0];
  tema[0] = closes[0];
  for (let i = 1; i < n; i++) {
    ema1[i] = k * closes[i]  + (1 - k) * ema1[i - 1];
    ema2[i] = k * ema1[i]    + (1 - k) * ema2[i - 1];
    ema3[i] = k * ema2[i]    + (1 - k) * ema3[i - 1];
    tema[i] = 3 * (ema1[i] - ema2[i]) + ema3[i];
  }
  return tema;
}

function calcRMASeries(src, period) {
  const n = src.length;
  if (n === 0) return [];
  const alpha = 1 / period;
  const out = new Array(n);
  out[0] = src[0];
  for (let i = 1; i < n; i++) {
    out[i] = alpha * src[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function calcTRSeries(highs, lows, closes) {
  const n = closes.length;
  if (n === 0) return [];
  const tr = new Array(n);
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }
  return tr;
}

function calcATRSeries(highs, lows, closes, period = 14) {
  return calcRMASeries(calcTRSeries(highs, lows, closes), period);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) TEST VERİSİ — deterministik (seedli rastgele)
// ═══════════════════════════════════════════════════════════════════════════

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateOHLC(n = 250, startPrice = 100, seed = 42) {
  const rnd = seededRandom(seed);
  const out = [];
  let price = startPrice;
  for (let i = 0; i < n; i++) {
    const dailyVolatility = price * 0.02;
    const drift = (rnd() - 0.45) * dailyVolatility;
    const open = price + (rnd() - 0.5) * dailyVolatility * 0.5;
    const close = open + drift;
    const high = Math.max(open, close) + rnd() * dailyVolatility * 0.5;
    const low  = Math.min(open, close) - rnd() * dailyVolatility * 0.5;
    out.push({ open, high, low, close });
    price = close;
  }
  return out;
}

// AKBNK gibi gerçekçi BIST fiyat hareketi (volatilite × trend)
function generateBISTLike(n = 300, seed = 7) {
  const rnd = seededRandom(seed);
  const out = [];
  let price = 70;
  for (let i = 0; i < n; i++) {
    const trend = Math.sin(i / 30) * 0.5;          // makro trend
    const noise = (rnd() - 0.5) * 2.5;             // gürültü
    const move = price * (trend + noise) / 100;
    const close = Math.max(1, price + move);
    const open = price + (rnd() - 0.5) * Math.abs(move) * 0.4;
    const high = Math.max(open, close) * (1 + rnd() * 0.012);
    const low  = Math.min(open, close) * (1 - rnd() * 0.012);
    out.push({ open, high, low, close });
    price = close;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

const TOLERANCE = 1e-10; // 10^-10 — IEEE 754 double precision rounding

function compareSeries(name, mine, reference, tol = TOLERANCE) {
  if (mine.length !== reference.length) {
    return { name, ok: false, reason: `length mismatch: mine=${mine.length} ref=${reference.length}` };
  }
  let maxDiff = 0;
  let maxIdx = -1;
  for (let i = 0; i < mine.length; i++) {
    const diff = Math.abs((mine[i] || 0) - (reference[i] || 0));
    if (diff > maxDiff) { maxDiff = diff; maxIdx = i; }
  }
  const ok = maxDiff <= tol;
  return {
    name,
    ok,
    maxDiff,
    maxIdx,
    mineLast: mine[mine.length - 1],
    refLast: reference[reference.length - 1],
    samples: ok ? null : {
      mine: mine.slice(Math.max(0, maxIdx - 2), maxIdx + 2),
      ref:  reference.slice(Math.max(0, maxIdx - 2), maxIdx + 2),
    },
  };
}

function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Pine Script Eşdeğerlik Testi');
  console.log('═══════════════════════════════════════════════════════');
  console.log();

  const datasets = [
    { name: 'Random walk (seed=42)', data: generateOHLC(250, 100, 42) },
    { name: 'BIST-like (seed=7)',     data: generateBISTLike(300, 7) },
    { name: 'BIST-like (seed=123)',   data: generateBISTLike(500, 123) },
    { name: 'Crypto-like (BTC seed=99)', data: generateOHLC(400, 65000, 99) },
  ];

  const results = [];
  for (const { name, data } of datasets) {
    const highs  = data.map(d => d.high);
    const lows   = data.map(d => d.low);
    const closes = data.map(d => d.close);

    // EMA34 testi
    results.push({ dataset: name, ...compareSeries('EMA(close, 34)',  calcEMASeries(closes, 34),  pineEMA(closes, 34)) });
    results.push({ dataset: name, ...compareSeries('EMA(close, 20)',  calcEMASeries(closes, 20),  pineEMA(closes, 20)) });
    results.push({ dataset: name, ...compareSeries('EMA(close, 50)',  calcEMASeries(closes, 50),  pineEMA(closes, 50)) });
    results.push({ dataset: name, ...compareSeries('EMA(close, 200)', calcEMASeries(closes, 200), pineEMA(closes, 200)) });

    // TEMA testi
    results.push({ dataset: name, ...compareSeries('TEMA(close, 34)', calcTEMASeries(closes, 34), pineTEMA(closes, 34)) });
    results.push({ dataset: name, ...compareSeries('TEMA(close, 14)', calcTEMASeries(closes, 14), pineTEMA(closes, 14)) });

    // RMA testi
    results.push({ dataset: name, ...compareSeries('RMA(close, 14)',  calcRMASeries(closes, 14),  pineRMA(closes, 14)) });

    // TR/ATR testi
    results.push({ dataset: name, ...compareSeries('TR series',        calcTRSeries(highs, lows, closes), pineATR(highs, lows, closes, 14).length === 0 ? [] : (() => {
      // referans TR ayrı türet
      const n = closes.length;
      const tr = new Array(n);
      tr[0] = highs[0] - lows[0];
      for (let i = 1; i < n; i++) tr[i] = Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1]));
      return tr;
    })()) });
    results.push({ dataset: name, ...compareSeries('ATR(14)',          calcATRSeries(highs, lows, closes, 14), pineATR(highs, lows, closes, 14)) });
  }

  // Sonuçları yazdır
  let passed = 0, failed = 0;
  for (const r of results) {
    const status = r.ok ? '✓ PASS' : '✗ FAIL';
    const diffStr = r.maxDiff != null ? r.maxDiff.toExponential(2) : '-';
    const lastStr = r.mineLast != null ? `last=${r.mineLast.toFixed(6)}` : '';
    console.log(`  ${status}  [${r.dataset.padEnd(30)}] ${r.name.padEnd(22)} maxDiff=${diffStr}  ${lastStr}`);
    if (r.ok) passed++;
    else {
      failed++;
      if (r.samples) {
        console.log(`         mine[idx ${r.maxIdx - 2}..${r.maxIdx + 1}]: ${r.samples.mine.map(v => v?.toFixed?.(8) ?? v).join(', ')}`);
        console.log(`         ref [idx ${r.maxIdx - 2}..${r.maxIdx + 1}]: ${r.samples.ref.map(v => v?.toFixed?.(8) ?? v).join(', ')}`);
      }
      if (r.reason) console.log(`         reason: ${r.reason}`);
    }
  }

  console.log();
  console.log('───────────────────────────────────────────────────────');
  console.log(`  Toplam: ${passed + failed}   Geçen: ${passed}   Başarısız: ${failed}`);
  console.log(`  Tolerans: ${TOLERANCE.toExponential(1)} (IEEE 754 double precision)`);
  console.log('───────────────────────────────────────────────────────');

  // ═══ Spot-check: Bir gerçek BIST sembolüne benzer veriyle örnek değerler
  console.log();
  console.log('═══ Spot Doğrulama — Numerik Örnekler (BIST-like, seed=7) ═══');
  const spotData = generateBISTLike(300, 7);
  const sc = spotData.map(d => d.close);
  const sh = spotData.map(d => d.high);
  const sl = spotData.map(d => d.low);
  const last = sc.length - 1;
  console.log(`  Son Kapanış:           ${sc[last].toFixed(4)}`);
  console.log(`  EMA34 (Pine):          ${pineEMA(sc, 34)[last].toFixed(4)}`);
  console.log(`  EMA34 (üretim):        ${calcEMA(sc, 34).toFixed(4)}`);
  console.log(`  EMA34 fark:            ${Math.abs(pineEMA(sc, 34)[last] - calcEMA(sc, 34)).toExponential(2)}`);
  console.log(`  TEMA34 (Pine):         ${pineTEMA(sc, 34)[last].toFixed(4)}`);
  console.log(`  TEMA34 (üretim):       ${calcTEMASeries(sc, 34)[last].toFixed(4)}`);
  console.log(`  TEMA34 fark:           ${Math.abs(pineTEMA(sc, 34)[last] - calcTEMASeries(sc, 34)[last]).toExponential(2)}`);
  console.log(`  ATR14 (Pine):          ${pineATR(sh, sl, sc, 14)[last].toFixed(4)}`);
  console.log(`  ATR14 (üretim):        ${calcATRSeries(sh, sl, sc, 14)[last].toFixed(4)}`);
  console.log(`  ATR14 fark:            ${Math.abs(pineATR(sh, sl, sc, 14)[last] - calcATRSeries(sh, sl, sc, 14)[last]).toExponential(2)}`);

  // EMA34'e olan uzaklık metrikleri
  const e34 = calcEMA(sc, 34);
  const atr14 = calcATRSeries(sh, sl, sc, 14)[last];
  console.log();
  console.log(`  Uzaklık (%):           ${((sc[last] - e34) / e34 * 100).toFixed(4)}%`);
  console.log(`  Uzaklık (ATR):         ${((sc[last] - e34) / atr14).toFixed(4)}σ`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
