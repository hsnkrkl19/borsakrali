/**
 * Multi-Timeframe Service — Borsa Krali
 *
 * Faz 1: 1h / 4h / 1d / 1w timeframe'lerinde long+short sinyal üretimi +
 * çoklu zaman dilimi confluence aggregator'u.
 *
 * Mimari:
 *   1. Top 100 coin (CoinGecko) + Binance USDT spot
 *   2. Her TF için:
 *      a. Current TF candles (250 bar)
 *      b. Higher TF candles (250 bar) — macro context için
 *      c. mtfPatternDetection ile candlestick + divergence + volatilite
 *      d. mtfScorer.scoreSingleTimeframe ile long+short skor
 *   3. Confluence engine:
 *      ağırlıklı toplam = Σ (score_TF × weight_TF) yön bazında
 *      net = long_total - short_total
 *      |net| ≥ threshold → güçlü confluence
 *
 * Dış bağımlılıklar:
 *   - axios (Binance public API + CoinGecko)
 *   - cryptoSignalsService (top 100 + Binance USDT pariteleri için yeniden kullanım)
 */

const axios = require('axios');
const cryptoSignalsService = require('./cryptoSignalsService');
const mtfScorer = require('./mtfScorer');
const patterns = require('./mtfPatternDetection');
const mtfSnapshotStore = require('./mtfSnapshotStore');

// ── Yapılandırma ──────────────────────────────────────────────────────────
const TOP_LIMIT = 10;
const BATCH_SIZE = 5;
const BATCH_PAUSE_MS = 250;

// Kripto OHLC: Render prod'da Binance(451)/Bybit(403)/CoinGecko(429) kapalı →
// Yahoo Finance chart endpoint (cryptoKlines katmanı) tek güvenilir kaynak.
const cryptoKlines = require('./cryptoKlines');

// TF → bir üst TF (macro context için)
const HIGHER_TF_MAP = {
  '1m':  '5m',
  '5m':  '15m',
  '15m': '1h',
  '1h':  '4h',
  '4h':  '1d',
  '1d':  '1w',
  '1w':  '1M',  // aylık üst context
};

// TF → kapsam (kullanıcı isteği): top 10/20/30 split
//   1m/5m/15m → top 10 (en likit, scalping)
//   1h/4h     → top 20 (saatlik swing)
//   1d/1w     → top 30 (pozisyon, daha geniş kapsam)
const TF_TIER = {
  '1m':  10,
  '5m':  10,
  '15m': 10,
  '1h':  20,
  '4h':  20,
  '1d':  30,
  '1w':  30,
};

// Confluence aggregator ağırlıkları (uzun TF daha çok ağırlık)
//   1m/5m/15m: scalping — düşük ağırlık (gürültü çok)
//   1h/4h:    saatlik — orta
//   1d/1w:    swing — yüksek
const TF_WEIGHTS = {
  '1m':   2,
  '5m':   3,
  '15m':  4,
  '1h':   6,
  '4h':   8,
  '1d':  10,
  '1w':  12,
};
const TF_WEIGHTS_TOTAL = Object.values(TF_WEIGHTS).reduce((a, b) => a + b, 0);

// Klines önbellek (TF'e göre TTL — yeni mum kapanmadan tekrar fetch etmek anlamsız)
const klinesCache = new Map(); // key=`${symbol}:${tf}` -> { data, t }
const TF_CACHE_TTL = {
  '1m':  20 * 1000,        // 20 sn (1m mum 60sn'de bir kapanır)
  '5m':  60 * 1000,        // 1 dk
  '15m': 3 * 60 * 1000,    // 3 dk
  '1h':  5 * 60 * 1000,    // 5 dk
  '4h':  30 * 60 * 1000,   // 30 dk
  '1d':  2 * 3600 * 1000,  // 2 sa
  '1w':  12 * 3600 * 1000, // 12 sa
  '1M':  24 * 3600 * 1000, // 24 sa
};

async function fetchKlines(symbol, interval, limit = 250) {
  const cacheKey = `${symbol}:${interval}`;
  const now = Date.now();
  const cached = klinesCache.get(cacheKey);
  const ttl = TF_CACHE_TTL[interval] || 10 * 60 * 1000;
  if (cached && now - cached.t < ttl) return cached.data;
  const candles = await cryptoKlines.fetchCandles(symbol, interval, limit);
  klinesCache.set(cacheKey, { data: candles, t: now });
  return candles;
}

// ── İndikatör hesaplamaları (cryptoSignalsService'in light kopyası) ───────
function ema(values, period) {
  if (!values || values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values, period = 14) {
  if (!values || values.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

function rsiSeries(values, period = 14) {
  if (!values || values.length < period + 2) return [];
  const out = [];
  for (let i = period + 1; i <= values.length; i++) {
    const slice = values.slice(0, i);
    const r = rsi(slice, period);
    if (r != null) out.push(r);
  }
  return out;
}

function rsiRecentMax(values, lookback = 10, period = 14) {
  const series = rsiSeries(values, period);
  if (series.length === 0) return null;
  const recent = series.slice(-lookback);
  return +Math.max(...recent).toFixed(2);
}

function macdHistogram(values, fast = 12, slow = 26, signal = 9) {
  if (!values || values.length < slow + signal) return { hist: null, prev: null, series: [] };
  const k_fast = 2 / (fast + 1), k_slow = 2 / (slow + 1), k_sig = 2 / (signal + 1);
  let emaFast = values.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  let emaSlow = values.slice(0, slow).reduce((a, b) => a + b, 0) / slow;
  for (let i = fast; i < slow; i++) emaFast = values[i] * k_fast + emaFast * (1 - k_fast);
  const macdSeries = [];
  for (let i = slow; i < values.length; i++) {
    emaFast = values[i] * k_fast + emaFast * (1 - k_fast);
    emaSlow = values[i] * k_slow + emaSlow * (1 - k_slow);
    macdSeries.push(emaFast - emaSlow);
  }
  if (macdSeries.length < signal) return { hist: null, prev: null, series: [] };
  let sig = macdSeries.slice(0, signal).reduce((a, b) => a + b, 0) / signal;
  const hists = [];
  for (let i = signal; i < macdSeries.length; i++) {
    sig = macdSeries[i] * k_sig + sig * (1 - k_sig);
    hists.push(macdSeries[i] - sig);
  }
  return {
    hist: hists.length ? +hists[hists.length - 1].toFixed(4) : null,
    prev: hists.length >= 2 ? +hists[hists.length - 2].toFixed(4) : null,
    series: hists,
  };
}

function atr(candles, period = 14) {
  if (!candles || candles.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function sma(values, period) {
  if (!values || values.length < period) return null;
  return values.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ── Tek coin × tek TF için context oluştur ────────────────────────────────
async function buildContextForCoinTF(coin, tf) {
  const higherTF = HIGHER_TF_MAP[tf] || tf;
  const [currentCandles, higherCandles] = await Promise.allSettled([
    fetchKlines(coin.symbol, tf, 250),
    fetchKlines(coin.symbol, higherTF, 250),
  ]);

  const cur = currentCandles.status === 'fulfilled' ? currentCandles.value : null;
  const higher = higherCandles.status === 'fulfilled' ? higherCandles.value : null;
  if (!cur || cur.length < 60) return null;
  if (!higher || higher.length < 30) return null;

  const curCloses  = cur.map(c => c.close);
  const curVolumes = cur.map(c => c.volume);
  const higherCloses = higher.map(c => c.close);

  const curMacd  = macdHistogram(curCloses);
  const higherMacd = macdHistogram(higherCloses);

  const lastCandle = cur[cur.length - 1];

  // AI/Math katmanı
  const candlePatterns = patterns.detectAllPatterns(cur);
  const rsiSeriesArr = rsiSeries(curCloses, 14);
  const divergence = patterns.detectDivergence(curCloses.slice(-rsiSeriesArr.length), rsiSeriesArr, 30);
  const volatility = patterns.detectVolatilityRegime(cur);
  const momentum = patterns.detectMomentumAcceleration(curMacd.series);

  return {
    _currentTF: tf,
    _higherTF:  higherTF,
    symbol: coin.symbol,
    name:   coin.name,
    image:  coin.image,
    coinId: coin.id,
    lastClose: lastCandle.close,
    atr: atr(cur),
    current: {
      ema20:  ema(curCloses, 20),
      ema50:  ema(curCloses, 50),
      ema200: curCloses.length >= 200 ? ema(curCloses, 200) : null,
      rsi:    rsi(curCloses, 14),
      rsiRecentMax: rsiRecentMax(curCloses, 10, 14),
      macdHist: curMacd.hist,
      macdHistPrev: curMacd.prev,
      volumeAvg20: sma(curVolumes, 20),
      lastVolume: lastCandle.volume,
      lastCandle: lastCandle,
      recentBars: cur.slice(-6).map(c => ({ ...c })),
    },
    higher: {
      ema20:  ema(higherCloses, 20),
      ema50:  ema(higherCloses, 50),
      ema200: higherCloses.length >= 200 ? ema(higherCloses, 200) : null,
      rsi:    rsi(higherCloses, 14),
      macdHist: higherMacd.hist,
    },
    patterns: candlePatterns,
    divergence,
    volatility,
    momentum,
  };
}

// ── Universe taraması — TF'e göre top 10/20/30 partition'ı ────────────────
//   1m/5m/15m → top 10 (scalping, en likit)
//   1h/4h     → top 20 (saatlik swing)
//   1d/1w     → top 30 (pozisyon)
async function scanUniverseForTF(tf) {
  const tierLimit = TF_TIER[tf] || 30;
  const universe = await cryptoSignalsService.getTop100Coins();
  if (!universe.length) return { signals: [], allSignals: [], analyzedCount: 0 };

  const { spot: tradableSet } = await cryptoSignalsService.getBinanceUsdtSymbols();
  const tradable = universe.filter(c => tradableSet.has(c.symbol)).slice(0, tierLimit);

  const longList = [], shortList = [];
  let analyzedCount = 0;

  for (let i = 0; i < tradable.length; i += BATCH_SIZE) {
    const batch = tradable.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(c => buildContextForCoinTF(c, tf))
    );
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const ctx = r.value;
      analyzedCount++;
      const out = mtfScorer.scoreSingleTimeframe(ctx);
      const base = {
        symbol: ctx.symbol,
        name: ctx.name,
        image: ctx.image,
        coinId: ctx.coinId,
      };
      if (out.long)  longList.push({ ...out.long,  ...base });
      if (out.short) shortList.push({ ...out.short, ...base });
    }
    if (i + BATCH_SIZE < tradable.length) {
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  const sortFn = (a, b) => b.totalScore - a.totalScore || b.ratio - a.ratio;
  longList.sort(sortFn); shortList.sort(sortFn);

  return {
    timeframe: tf,
    higherTimeframe: HIGHER_TF_MAP[tf],
    tierLimit,
    universeSize: universe.length,
    tradableCount: tradable.length,
    analyzedCount,
    long: { signals: longList.slice(0, TOP_LIMIT), allSignals: longList },
    short: { signals: shortList.slice(0, TOP_LIMIT), allSignals: shortList },
  };
}

// ── Tek coin × tüm TF'ler ─────────────────────────────────────────────────
async function analyzeCoinAllTFs(symbol) {
  const sym = (symbol || '').toUpperCase();
  if (!sym) return null;

  const universe = await cryptoSignalsService.getTop100Coins();
  const coin = universe.find(c => c.symbol === sym);
  if (!coin) return null;

  const tfList = Object.keys(TF_WEIGHTS);
  const tfData = {};
  for (const tf of tfList) {
    const ctx = await buildContextForCoinTF(coin, tf);
    if (!ctx) {
      tfData[tf] = null;
      continue;
    }
    tfData[tf] = mtfScorer.scoreSingleTimeframe(ctx);
  }

  const confluence = computeConfluence(sym, coin.name, tfData);
  return {
    symbol: sym,
    name: coin.name,
    image: coin.image,
    timeframes: tfData,
    confluence,
    generatedAt: new Date().toISOString(),
  };
}

// ── Confluence engine — ağırlıklı multi-TF skor agregasyonu ───────────────
/**
 * Her coin için 4 TF skorlarını ağırlıklı toplam yapar:
 *   weightedLong  = Σ (long_score_TF  × weight_TF) / Σ weight_TF
 *   weightedShort = Σ (short_score_TF × weight_TF) / Σ weight_TF
 *   net = weightedLong - weightedShort  (yön ve şiddet)
 *
 * |net| ≥ 4.0  → STRONG_LONG / STRONG_SHORT
 * |net| ≥ 2.5  → LONG / SHORT
 * else        → NEUTRAL
 *
 * Ek: alignedTFs sayısı (kaç TF aynı yönde sinyal verdi)
 */
function computeConfluence(symbol, name, tfData) {
  let weightedLong = 0, weightedShort = 0, totalWeight = 0;
  let alignedLong = 0, alignedShort = 0;
  const tfDirections = {};

  for (const [tf, data] of Object.entries(tfData)) {
    const w = TF_WEIGHTS[tf] || 0;
    totalWeight += w;
    if (!data) { tfDirections[tf] = 'no_data'; continue; }
    const lScore = data.long?.totalScore  || 0;
    const sScore = data.short?.totalScore || 0;
    weightedLong  += lScore * w;
    weightedShort += sScore * w;

    if (lScore > 0 && lScore > sScore) { alignedLong++; tfDirections[tf] = 'long'; }
    else if (sScore > 0 && sScore > lScore) { alignedShort++; tfDirections[tf] = 'short'; }
    else tfDirections[tf] = 'neutral';
  }

  const normalizedLong  = totalWeight ? weightedLong  / totalWeight : 0;
  const normalizedShort = totalWeight ? weightedShort / totalWeight : 0;
  const net = +(normalizedLong - normalizedShort).toFixed(2);

  // Eşikler 12 koşul × 4 TF için kalibre edildi: max net = ±12.
  // STRONG_LONG için ortalama TF skoru ~7+ olmalı (çoğunluk koşul geçti).
  let verdict = 'NEUTRAL';
  if      (net >=  7.0) verdict = 'STRONG_LONG';
  else if (net >=  4.5) verdict = 'LONG';
  else if (net >=  2.0) verdict = 'WEAK_LONG';
  else if (net <= -7.0) verdict = 'STRONG_SHORT';
  else if (net <= -4.5) verdict = 'SHORT';
  else if (net <= -2.0) verdict = 'WEAK_SHORT';

  // Confidence (Bayesian-ish): TF agreement × score magnitude
  const totalTFs = Object.keys(TF_WEIGHTS).length;
  const agreementRatio = Math.max(alignedLong, alignedShort) / totalTFs;
  const magnitude = Math.min(Math.abs(net) / 6.0, 1.0); // 6 = orta-yüksek skor
  const confidence = +(agreementRatio * 0.6 + magnitude * 0.4).toFixed(2);

  return {
    symbol, name,
    verdict,
    net,
    weightedLong:  +normalizedLong.toFixed(2),
    weightedShort: +normalizedShort.toFixed(2),
    alignedLong,
    alignedShort,
    confidence,
    tfDirections,
  };
}

// ── Universe için confluence taraması (her TF tek tek tarandıktan sonra) ──
async function scanConfluence() {
  // Cache'ten her TF'in son taramasını oku
  const date = mtfSnapshotStore.dateKey();
  const snap = mtfSnapshotStore.read(date);
  const tfs = snap?.timeframes || {};

  // Her coin için 4 TF skorlarını birleştir
  const coinMap = new Map(); // symbol -> { name, tfData }

  for (const [tf, block] of Object.entries(tfs)) {
    if (!TF_WEIGHTS[tf]) continue;
    const allLong  = block?.scanner?.long?.allSignals  || [];
    const allShort = block?.scanner?.short?.allSignals || [];
    const handle = (sig, dir) => {
      if (!coinMap.has(sig.symbol)) {
        coinMap.set(sig.symbol, { symbol: sig.symbol, name: sig.name, image: sig.image, tfData: {} });
      }
      const entry = coinMap.get(sig.symbol);
      if (!entry.tfData[tf]) entry.tfData[tf] = { long: null, short: null, timeframe: tf };
      entry.tfData[tf][dir] = sig;
    };
    allLong.forEach(s  => handle(s, 'long'));
    allShort.forEach(s => handle(s, 'short'));
  }

  // Confluence hesapla
  const confluences = [];
  for (const entry of coinMap.values()) {
    const conf = computeConfluence(entry.symbol, entry.name, entry.tfData);
    confluences.push({ ...conf, image: entry.image });
  }

  // En güçlü mutlak net'e göre sırala
  confluences.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  return {
    generatedAt: new Date().toISOString(),
    totalCoins: confluences.length,
    strongLong:  confluences.filter(c => c.verdict === 'STRONG_LONG').length,
    long:        confluences.filter(c => c.verdict === 'LONG').length,
    strongShort: confluences.filter(c => c.verdict === 'STRONG_SHORT').length,
    short:       confluences.filter(c => c.verdict === 'SHORT').length,
    neutral:     confluences.filter(c => c.verdict === 'NEUTRAL').length,
    top: confluences.slice(0, 20),
    all: confluences,
  };
}

// ── Bir TF için tarama yap + diske yaz ────────────────────────────────────
async function runAndStore(tf) {
  if (!Object.keys(TF_WEIGHTS).includes(tf)) {
    throw new Error(`Desteklenmeyen TF: ${tf}`);
  }
  const date = mtfSnapshotStore.dateKey();
  const generatedAt = new Date().toISOString();
  const scanner = await scanUniverseForTF(tf);

  const block = { generatedAt, scanner };
  mtfSnapshotStore.setTimeframe(date, tf, block);

  // Confluence'ı her TF taraması sonrası güncelle
  try {
    const conf = await scanConfluence();
    mtfSnapshotStore.setConfluence(date, conf);
  } catch (e) {
    console.warn('[MTFService] Confluence hesaplanamadı:', e.message);
  }

  return { date, timeframe: tf, ...block };
}

module.exports = {
  scanUniverseForTF,
  analyzeCoinAllTFs,
  computeConfluence,
  scanConfluence,
  runAndStore,
  buildContextForCoinTF,
  TF_WEIGHTS,
  HIGHER_TF_MAP,
  TOP_LIMIT,
};
