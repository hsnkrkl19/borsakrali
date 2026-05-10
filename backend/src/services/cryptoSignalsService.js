/**
 * Crypto Signals Service — Borsa Krali
 *
 * Top 100 coin'i CoinGecko'dan çeker, Binance kline verisi ile teknik
 * göstergeleri hesaplar ve cryptoScorer ile üç ayrı listede top 10 üretir:
 *
 *   • SPOT_LONG     — Güvenli trend takip, kaldıraçsız al-tut sinyalleri
 *   • FUTURES_LONG  — Momentum patlaması, kaldıraçlı agresif long
 *   • FUTURES_SHORT — Bozulan trend, kaldıraçlı short
 *
 * Kısıtlar:
 *   - CoinGecko free tier: 30 req/dk → 5 dk cache zorunlu (PUBLIC_GAINS sadece 1 req)
 *   - Binance public klines: rate limit yok ama Promise.all batch'te tutulur
 *   - axios kullanılır (node-fetch yerine), yahoo-finance2 KULLANILMAZ
 */

const axios = require('axios');
const cryptoScorer = require('./cryptoScorer');
const cryptoSnapshotStore = require('./cryptoSnapshotStore');

// ── Yapılandırma ──────────────────────────────────────────────────────────
const TOP_LIMIT = 10;
const COIN_UNIVERSE_SIZE = 100;
const BATCH_SIZE = 5;             // Binance batch (her batch'te 2 endpoint × 5 coin)
const BATCH_PAUSE_MS = 250;
const CACHE_TTL_MS = 5 * 60 * 1000;  // CoinGecko 5 dk (rate limit zorunlu)
const KLINES_CACHE_TTL_MS = 10 * 60 * 1000; // Binance klines 10 dk

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const BINANCE_BASE = 'https://api.binance.com';
const BINANCE_FAPI_BASE = 'https://fapi.binance.com';

// Modül-içi cache (process restart'ta sıfırlanır)
let universeCache = { data: null, t: 0 };
const klinesCache = new Map(); // key -> { data, t }

// Binance USDT spot pariteleri (process içinde cache'lenir, ilk istekte doldurulur)
let binanceSymbolsCache = { spot: null, futures: null, t: 0 };
const SYMBOLS_TTL = 60 * 60 * 1000; // 1 saat

// ── Top 100 coin listesi (CoinGecko market data) ──────────────────────────
async function getTop100Coins() {
  const now = Date.now();
  if (universeCache.data && now - universeCache.t < CACHE_TTL_MS) {
    return universeCache.data;
  }
  try {
    const res = await axios.get(`${COINGECKO_BASE}/coins/markets`, {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: COIN_UNIVERSE_SIZE,
        page: 1,
        sparkline: false,
        price_change_percentage: '24h',
      },
      timeout: 20000,
      headers: { 'User-Agent': 'BorsaKraliCryptoSignals/1.0' },
    });
    const data = (res.data || []).map(c => ({
      id: c.id,
      symbol: (c.symbol || '').toUpperCase(),
      name: c.name,
      image: c.image,
      currentPrice: c.current_price,
      marketCap: c.market_cap,
      marketCapRank: c.market_cap_rank,
      change24h: c.price_change_percentage_24h,
      volume24h: c.total_volume,
    }));
    universeCache = { data, t: now };
    return data;
  } catch (e) {
    console.error('[CryptoSignals] CoinGecko top 100 hata:', e.message);
    // Cache'te eski veri varsa onu döndür (kısa süreliğine de olsa)
    if (universeCache.data) return universeCache.data;
    return [];
  }
}

// ── Binance USDT pariteleri — geçerli sembolleri filtrele ─────────────────
async function getBinanceUsdtSymbols() {
  const now = Date.now();
  if (binanceSymbolsCache.spot && now - binanceSymbolsCache.t < SYMBOLS_TTL) {
    return binanceSymbolsCache;
  }
  try {
    const [spotRes, futRes] = await Promise.allSettled([
      axios.get(`${BINANCE_BASE}/api/v3/exchangeInfo`, { timeout: 20000 }),
      axios.get(`${BINANCE_FAPI_BASE}/fapi/v1/exchangeInfo`, { timeout: 20000 }),
    ]);
    const spot = spotRes.status === 'fulfilled'
      ? new Set(
          (spotRes.value.data?.symbols || [])
            .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
            .map(s => s.baseAsset.toUpperCase())
        )
      : new Set();
    const futures = futRes.status === 'fulfilled'
      ? new Set(
          (futRes.value.data?.symbols || [])
            .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL')
            .map(s => s.baseAsset.toUpperCase())
        )
      : new Set();
    binanceSymbolsCache = { spot, futures, t: now };
    return binanceSymbolsCache;
  } catch (e) {
    console.error('[CryptoSignals] Binance exchangeInfo hata:', e.message);
    return { spot: new Set(), futures: new Set(), t: now };
  }
}

// ── Binance klines (mum verisi) ───────────────────────────────────────────
async function fetchKlines(symbol, interval, limit = 200) {
  const cacheKey = `${symbol}:${interval}:${limit}`;
  const now = Date.now();
  const cached = klinesCache.get(cacheKey);
  if (cached && now - cached.t < KLINES_CACHE_TTL_MS) return cached.data;

  try {
    const res = await axios.get(`${BINANCE_BASE}/api/v3/klines`, {
      params: { symbol: `${symbol}USDT`, interval, limit },
      timeout: 15000,
    });
    // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
    const candles = (res.data || []).map(k => ({
      time: Math.floor(k[0] / 1000),
      open: +k[1], high: +k[2], low: +k[3], close: +k[4],
      volume: +k[5],
    }));
    klinesCache.set(cacheKey, { data: candles, t: now });
    return candles;
  } catch (e) {
    // 400 (sembol yok) — bu coin Binance'te USDT paritesinde değil
    if (e.response?.status === 400) {
      klinesCache.set(cacheKey, { data: null, t: now });
      return null;
    }
    console.error(`[CryptoSignals] Binance klines hata ${symbol}/${interval}:`, e.message);
    return null;
  }
}

// ── Funding rate (USDT-M perpetual) ───────────────────────────────────────
async function fetchFundingRate(symbol) {
  try {
    const res = await axios.get(`${BINANCE_FAPI_BASE}/fapi/v1/premiumIndex`, {
      params: { symbol: `${symbol}USDT` },
      timeout: 10000,
    });
    const d = res.data;
    if (!d || d.lastFundingRate == null) return null;
    return {
      rate: parseFloat(d.lastFundingRate),
      nextTime: d.nextFundingTime,
    };
  } catch (e) {
    return null;
  }
}

// ── İndikatörler ──────────────────────────────────────────────────────────
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

// Son N barda RSI'nin maksimumu (overbought tetik için)
function rsiRecentMax(values, lookback = 10, period = 14) {
  if (!values || values.length < period + lookback) return null;
  let max = -Infinity;
  for (let i = 0; i < lookback; i++) {
    const slice = values.slice(0, values.length - i);
    const r = rsi(slice, period);
    if (r != null && r > max) max = r;
  }
  return max === -Infinity ? null : +max.toFixed(2);
}

function macdHistogram(values, fast = 12, slow = 26, signal = 9) {
  if (!values || values.length < slow + signal) return { hist: null, prev: null };
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
  if (macdSeries.length < signal) return { hist: null, prev: null };
  let sig = macdSeries.slice(0, signal).reduce((a, b) => a + b, 0) / signal;
  const hists = [];
  for (let i = signal; i < macdSeries.length; i++) {
    sig = macdSeries[i] * k_sig + sig * (1 - k_sig);
    hists.push(macdSeries[i] - sig);
  }
  if (hists.length === 0) return { hist: null, prev: null };
  return {
    hist: +hists[hists.length - 1].toFixed(4),
    prev: hists.length >= 2 ? +hists[hists.length - 2].toFixed(4) : null,
  };
}

function adx(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;
  let plusDM = 0, minusDM = 0, trSum = 0;
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM += (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM += (downMove > upMove && downMove > 0) ? downMove : 0;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    trSum += tr;
  }
  if (trSum === 0) return 0;
  const plusDI = (plusDM / trSum) * 100;
  const minusDI = (minusDM / trSum) * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1) * 100;
  return +dx.toFixed(1);
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

// ── Tek coin için tüm veri kaynaklarını topla ─────────────────────────────
async function gatherForCoin(coin, hasFutures) {
  const symbol = coin.symbol;
  // İki paralel istek: 1d + 4h klines
  const [daily, fourH, funding] = await Promise.allSettled([
    fetchKlines(symbol, '1d', 250),
    fetchKlines(symbol, '4h', 250),
    hasFutures ? fetchFundingRate(symbol) : Promise.resolve(null),
  ]);

  const dailyCandles = daily.status === 'fulfilled' ? daily.value : null;
  const fourHCandles = fourH.status === 'fulfilled' ? fourH.value : null;
  const fundingData = funding.status === 'fulfilled' ? funding.value : null;

  if (!dailyCandles || dailyCandles.length < 60 || !fourHCandles || fourHCandles.length < 60) {
    return null; // yetersiz veri (Binance'te coin yok ya da yeni listelendi)
  }

  const dailyCloses = dailyCandles.map(c => c.close);
  const fourHCloses = fourHCandles.map(c => c.close);
  const dailyVolumes = dailyCandles.map(c => c.volume);
  const fourHVolumes = fourHCandles.map(c => c.volume);

  const lastDaily = dailyCandles[dailyCandles.length - 1];

  const dailyMacd = macdHistogram(dailyCloses);
  const fourHMacd = macdHistogram(fourHCloses);

  const ctx = {
    symbol,
    name: coin.name,
    image: coin.image,
    coinId: coin.id,
    lastClose: lastDaily.close,
    lastVolume: lastDaily.volume,
    atr: atr(dailyCandles),
    daily: {
      ema20: ema(dailyCloses, 20),
      ema50: ema(dailyCloses, 50),
      ema200: dailyCloses.length >= 200 ? ema(dailyCloses, 200) : null,
      rsi: rsi(dailyCloses, 14),
      rsiRecentMax: rsiRecentMax(dailyCloses, 10, 14),
      macdHist: dailyMacd.hist,
      macdHistPrev: dailyMacd.prev,
      volumeAvg20: sma(dailyVolumes, 20),
      adx: adx(dailyCandles),
      recentBars: dailyCandles.slice(-6).map(c => ({ high: c.high, low: c.low, close: c.close, open: c.open, volume: c.volume })),
    },
    fourH: {
      ema20: ema(fourHCloses, 20),
      ema50: ema(fourHCloses, 50),
      ema200: fourHCloses.length >= 200 ? ema(fourHCloses, 200) : null,
      rsi: rsi(fourHCloses, 14),
      macdHist: fourHMacd.hist,
      macdHistPrev: fourHMacd.prev,
      volumeAvg20: sma(fourHVolumes, 20),
      lastClose: fourHCandles[fourHCandles.length - 1].close,
      lastVolume: fourHCandles[fourHCandles.length - 1].volume,
      last20High: Math.max(...fourHCloses.slice(-21, -1)),
      last20Low: Math.min(...fourHCloses.slice(-21, -1)),
      recentBars: fourHCandles.slice(-6).map(c => ({ high: c.high, low: c.low, close: c.close, open: c.open, volume: c.volume })),
    },
    funding: fundingData,
    marketCapRank: coin.marketCapRank,
    change24h: coin.change24h,
  };

  return ctx;
}

// ── Universe taraması ─────────────────────────────────────────────────────
async function generatePhase(phase) {
  const universe = await getTop100Coins();
  if (universe.length === 0) {
    return {
      phase,
      generatedAt: new Date().toISOString(),
      spot_long: { signals: [], allSignals: [] },
      futures_long: { signals: [], allSignals: [] },
      futures_short: { signals: [], allSignals: [] },
      universeSize: 0,
      analyzedCount: 0,
      error: 'Universe boş — CoinGecko erişilemedi',
    };
  }

  const { spot, futures } = await getBinanceUsdtSymbols();

  // Yalnızca Binance'te USDT paritesi olan coin'leri analiz et
  const tradable = universe.filter(c => spot.has(c.symbol));

  const spotLongList = [];
  const futuresLongList = [];
  const futuresShortList = [];

  let analyzedCount = 0;
  for (let i = 0; i < tradable.length; i += BATCH_SIZE) {
    const batch = tradable.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(c => gatherForCoin(c, futures.has(c.symbol)))
    );
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const ctx = r.value;
      analyzedCount++;
      const all = cryptoScorer.scoreAll(ctx);

      const baseEntry = {
        symbol: ctx.symbol,
        name: ctx.name,
        image: ctx.image,
        coinId: ctx.coinId,
        marketCapRank: ctx.marketCapRank,
        change24h: ctx.change24h,
      };

      if (all.spot_long) spotLongList.push({ ...all.spot_long, ...baseEntry });
      if (all.futures_long) futuresLongList.push({ ...all.futures_long, ...baseEntry });
      if (all.futures_short) futuresShortList.push({ ...all.futures_short, ...baseEntry });
    }
    if (i + BATCH_SIZE < tradable.length) {
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  const sortFn = (a, b) => b.totalScore - a.totalScore || b.ratio - a.ratio;
  spotLongList.sort(sortFn);
  futuresLongList.sort(sortFn);
  futuresShortList.sort(sortFn);

  const generatedAt = new Date().toISOString();
  return {
    phase,
    generatedAt,
    universeSize: universe.length,
    tradableCount: tradable.length,
    analyzedCount,
    spot_long:     { signals: spotLongList.slice(0, TOP_LIMIT),     allSignals: spotLongList },
    futures_long:  { signals: futuresLongList.slice(0, TOP_LIMIT),  allSignals: futuresLongList },
    futures_short: { signals: futuresShortList.slice(0, TOP_LIMIT), allSignals: futuresShortList },
  };
}

// ── Snapshot diske yaz ────────────────────────────────────────────────────
async function runAndStore(phase) {
  const date = cryptoSnapshotStore.dateKey();
  const result = await generatePhase(phase);
  if (phase === 'intraday') {
    cryptoSnapshotStore.setPhase(date, 'intraday', result);
  } else {
    cryptoSnapshotStore.setPhase(date, phase, result);
  }
  return { date, ...result };
}

// ── Tek coin için son skor + koşullar (cache'ten ya da canlı) ─────────────
async function analyzeSingleCoin(symbol) {
  const sym = (symbol || '').toUpperCase();
  if (!sym) return null;

  // Önce snapshot'tan dene
  const date = cryptoSnapshotStore.dateKey();
  const snap = cryptoSnapshotStore.read(date);
  if (snap) {
    const phase = cryptoSnapshotStore.getCurrentPhase(snap);
    if (phase) {
      const find = (block) => (block?.allSignals || []).find(s => s.symbol === sym);
      const fromSnapshot = {
        spot_long: find(phase.spot_long),
        futures_long: find(phase.futures_long),
        futures_short: find(phase.futures_short),
      };
      if (fromSnapshot.spot_long || fromSnapshot.futures_long || fromSnapshot.futures_short) {
        return {
          symbol: sym,
          source: 'snapshot',
          phase: phase.phase,
          generatedAt: phase.generatedAt,
          ...fromSnapshot,
        };
      }
    }
  }

  // Snapshot'ta yok — canlı hesapla
  const universe = await getTop100Coins();
  const coin = universe.find(c => c.symbol === sym);
  if (!coin) return null;

  const { futures } = await getBinanceUsdtSymbols();
  const ctx = await gatherForCoin(coin, futures.has(sym));
  if (!ctx) return null;

  const all = cryptoScorer.scoreAll(ctx);
  return {
    symbol: sym,
    name: ctx.name,
    image: ctx.image,
    source: 'live',
    generatedAt: new Date().toISOString(),
    ...all,
  };
}

module.exports = {
  generatePhase,
  runAndStore,
  analyzeSingleCoin,
  getTop100Coins,
  getBinanceUsdtSymbols,
  TOP_LIMIT,
};
