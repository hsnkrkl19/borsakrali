/**
 * Crypto Valuation Service — BORSA KRALI
 *
 * DCF doğrudan crypto'ya uygulanmıyor (FCF yok). Onun yerine on-chain ve
 * fiyat-temelli birden fazla model birleştirilip "composite fair value" çıkarılıyor:
 *
 *   1) Drawdown analysis   — ATH'tan ne kadar uzakta? (oversold/fair/overbought)
 *   2) MA mean reversion   — fiyat 200/50/20 günlük MA'lara göre nerede?
 *   3) Stock-to-Flow (S2F) — disinflasyonist coinler için (BTC, LTC vb.)
 *   4) NVT-proxy           — market cap / 30g volume → düşük = ucuz
 *   5) Volatility band     — son 90g fiyat dağılımına göre %25-75 percentile
 *
 * Skill referansı: virattt/dexter src/skills/dcf/SKILL.md (yöntem benzeri,
 * varlık sınıfı farklı). Tüm modeller eşit ağırlıkta birleşip 0-100 skor üretir.
 */

const axios = require('axios');

const CG_BASE = 'https://api.coingecko.com/api/v3';
const cache = new Map();
const TTL = 10 * 60 * 1000; // 10 dk

// Aynı eşleme cryptoQuoteService'tekiyle senkron tutuluyor — kopya/değiştirme
const SYMBOL_TO_ID = {
  BTC: 'bitcoin',         ETH: 'ethereum',         BNB: 'binancecoin',
  SOL: 'solana',          XRP: 'ripple',           USDC: 'usd-coin',
  ADA: 'cardano',         AVAX: 'avalanche-2',     DOGE: 'dogecoin',
  TRX: 'tron',            LINK: 'chainlink',       TON: 'the-open-network',
  MATIC: 'matic-network', DOT: 'polkadot',         LTC: 'litecoin',
  SHIB: 'shiba-inu',      BCH: 'bitcoin-cash',     NEAR: 'near',
  UNI: 'uniswap',         APT: 'aptos',            ICP: 'internet-computer',
  FIL: 'filecoin',        ATOM: 'cosmos',          OP: 'optimism',
  ARB: 'arbitrum',        VET: 'vechain',          MKR: 'maker',
  AAVE: 'aave',           ALGO: 'algorand',        XLM: 'stellar',
  IMX: 'immutable-x',     RNDR: 'render-token',    GRT: 'the-graph',
  INJ: 'injective-protocol', SUI: 'sui',           SEI: 'sei-network',
  TIA: 'celestia',        PYTH: 'pyth-network',    JUP: 'jupiter-exchange-solana',
  WIF: 'dogwifcoin',      PEPE: 'pepe',            ENA: 'ethena',
};

async function cgGet(path, params = {}) {
  const r = await axios.get(`${CG_BASE}${path}`, {
    params, timeout: 15000,
    headers: { 'User-Agent': 'BorsaKrali/1.0', Accept: 'application/json' },
  });
  return r.data;
}

function getCoinGeckoId(symbol) {
  return SYMBOL_TO_ID[symbol.toUpperCase()] || null;
}

// ─── Yardımcı: SMA, std, percentile ─────────────────────────────────────────
function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const idx = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (idx - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

// ─── 1) Drawdown sinyali (ATH'tan uzaklık) ─────────────────────────────────
function drawdownSignal(currentPrice, ath) {
  if (!ath || ath <= 0) return null;
  const drawdown = ((currentPrice - ath) / ath) * 100; // negatif → düşmüş
  let signal = 'fair', score = 50;
  if (drawdown >= 0)        { signal = 'overbought';    score = 20; }
  else if (drawdown >= -25) { signal = 'overbought';    score = 35; }
  else if (drawdown >= -50) { signal = 'fair';          score = 55; }
  else if (drawdown >= -75) { signal = 'oversold';      score = 75; }
  else                      { signal = 'deep_oversold'; score = 88; }
  return { drawdownPct: +drawdown.toFixed(2), signal, score };
}

// ─── 2) MA reversion sinyali ─────────────────────────────────────────────
function maSignal(prices, currentPrice) {
  const ma20  = sma(prices, 20);
  const ma50  = sma(prices, 50);
  const ma200 = sma(prices, 200);
  if (!ma200) return null;

  // 200 MA'dan sapma (%); +30%+ aşırı pahalı, -30%- aşırı ucuz
  const dev200 = ((currentPrice - ma200) / ma200) * 100;
  let signal = 'fair', score = 50;
  if (dev200 >= 50)        { signal = 'overheated';      score = 20; }
  else if (dev200 >= 20)   { signal = 'overbought';      score = 35; }
  else if (dev200 >= -20)  { signal = 'fair';            score = 55; }
  else if (dev200 >= -50)  { signal = 'oversold';        score = 75; }
  else                     { signal = 'deep_oversold';   score = 88; }

  return {
    ma20:  ma20  ? +ma20.toFixed(2) : null,
    ma50:  ma50  ? +ma50.toFixed(2) : null,
    ma200: +ma200.toFixed(2),
    deviationFrom200Pct: +dev200.toFixed(2),
    trend: ma50 && ma200 ? (ma50 > ma200 ? 'bullish' : 'bearish') : 'neutral',
    signal, score,
  };
}

// ─── 3) Stock-to-Flow (sadece sabit-arz coinler için anlamlı) ───────────
function stockToFlowSignal(circ, max, currentPrice, symbol) {
  if (!circ || !max || circ >= max * 0.999) return null; // tüm arz çıkmışsa S2F sonsuz
  const remaining = max - circ;
  // Yıllık issuance varsayımı: kalan arzın %1.5'u (BTC halving sonrası ~%1.7, LTC ~%2)
  // Daha doğru modeller halving takvimine bakar; biz pragmatik %1.5 kullanıyoruz.
  const annualIssuance = remaining * 0.015;
  const s2f = circ / annualIssuance;

  // PlanB BTC S2F formülü: model_price ≈ exp(c) * S2F^3.3, c ≈ -1.84
  // BTC dışı coinlere doğrudan uygulanmaz; sadece görece-ucuz/pahalı endeksi
  const modelPrice = Math.exp(-1.84) * Math.pow(s2f, 3.3);
  const ratio = currentPrice / modelPrice;

  let signal = 'fair', score = 50;
  if (ratio > 3)        { signal = 'overvalued';    score = 25; }
  else if (ratio > 1.5) { signal = 'pricey';        score = 40; }
  else if (ratio > 0.7) { signal = 'fair';          score = 55; }
  else if (ratio > 0.4) { signal = 'undervalued';   score = 75; }
  else                  { signal = 'deep_value';    score = 88; }

  return {
    circulatingSupply: circ,
    maxSupply: max,
    annualIssuanceEst: annualIssuance,
    s2f: +s2f.toFixed(1),
    modelPrice: +modelPrice.toFixed(2),
    ratio: +ratio.toFixed(2),
    signal, score,
    note: 'S2F modeli BTC/LTC gibi sabit-arz coinler için anlamlı; meme coin/altcoin için bilgilendirici değil.',
  };
}

// ─── 4) NVT-proxy (market cap / volume) ─────────────────────────────────
function nvtSignal(marketCap, volume30dAvg) {
  if (!marketCap || !volume30dAvg) return null;
  const nvt = marketCap / volume30dAvg;
  let signal = 'fair', score = 50;
  if (nvt > 200)       { signal = 'overvalued';   score = 30; }
  else if (nvt > 100)  { signal = 'pricey';       score = 42; }
  else if (nvt > 30)   { signal = 'fair';         score = 55; }
  else if (nvt > 10)   { signal = 'active';       score = 70; }
  else                 { signal = 'deep_active';  score = 80; }
  return { nvt: +nvt.toFixed(1), signal, score };
}

// ─── 5) Volatilite band sinyali (90g percentile) ────────────────────────
function volatilityBandSignal(prices, currentPrice) {
  const recent = prices.slice(-90);
  if (recent.length < 30) return null;
  const sorted = [...recent].sort((a, b) => a - b);
  const p25 = percentile(sorted, 25);
  const p50 = percentile(sorted, 50);
  const p75 = percentile(sorted, 75);

  let signal = 'fair', score = 50;
  if (currentPrice <= p25)      { signal = 'p25_under';   score = 80; }
  else if (currentPrice <= p50) { signal = 'p25_to_p50';  score = 65; }
  else if (currentPrice <= p75) { signal = 'p50_to_p75';  score = 45; }
  else                          { signal = 'p75_over';    score = 25; }

  return {
    p25: +p25.toFixed(2),
    p50: +p50.toFixed(2),
    p75: +p75.toFixed(2),
    signal, score,
  };
}

// ─── Composite verdict ──────────────────────────────────────────────────
function composeVerdict(signals) {
  const scores = signals.filter(s => s && Number.isFinite(s.score)).map(s => s.score);
  if (!scores.length) return { verdict: 'belirsiz', score: 50, upsideEst: null };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  // 0-100 skor → verdict
  let verdict = 'gercege_yakin';
  if (avg >= 80)      verdict = 'derin_iskonto';
  else if (avg >= 65) verdict = 'iskonto';
  else if (avg >= 45) verdict = 'gercege_yakin';
  else if (avg >= 30) verdict = 'pahali';
  else                verdict = 'cok_pahali';

  // Skor 50 = adil; her +1 puan ≈ %1.5 upside potansiyeli (basit lineer eşleme)
  const upsideEst = +((avg - 50) * 1.5).toFixed(2);

  return { verdict, score: +avg.toFixed(1), upsideEst };
}

// ─── Ana fonksiyon ──────────────────────────────────────────────────────
async function valuateCrypto(symbol) {
  const upper = symbol.toUpperCase();
  const cacheKey = `cryptoval_${upper}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  const id = getCoinGeckoId(upper);
  if (!id) {
    return { success: false, error: `Bilinmeyen kripto sembolü: ${upper}`, symbol: upper };
  }

  try {
    // Paralel: coin meta + 365g historical
    const [meta, chart] = await Promise.all([
      cgGet(`/coins/${id}`, { localization: false, tickers: false, community_data: false, developer_data: false, sparkline: false }),
      cgGet(`/coins/${id}/market_chart`, { vs_currency: 'usd', days: 365, interval: 'daily' }),
    ]);

    if (!meta || !chart?.prices?.length) {
      return { success: false, error: 'CoinGecko verisi alınamadı', symbol: upper };
    }

    const prices = chart.prices.map(p => p[1]);
    const volumes = chart.total_volumes.map(v => v[1]);
    const currentPrice = meta.market_data?.current_price?.usd;
    const marketCap    = meta.market_data?.market_cap?.usd;
    const ath          = meta.market_data?.ath?.usd;
    const athDate      = meta.market_data?.ath_date?.usd;
    const atl          = meta.market_data?.atl?.usd;
    const circ         = meta.market_data?.circulating_supply;
    const max          = meta.market_data?.max_supply;
    const volume30dAvg = volumes.slice(-30).reduce((a, b) => a + b, 0) / 30;

    // Sinyaller
    const sigDrawdown   = drawdownSignal(currentPrice, ath);
    const sigMA         = maSignal(prices, currentPrice);
    const sigS2F        = stockToFlowSignal(circ, max, currentPrice, upper);
    const sigNVT        = nvtSignal(marketCap, volume30dAvg);
    const sigVolBand    = volatilityBandSignal(prices, currentPrice);

    const signals = [sigDrawdown, sigMA, sigS2F, sigNVT, sigVolBand];
    const composite = composeVerdict(signals);

    // Adil fiyat tahmini: composite skor → upside%
    const fairPrice = composite.upsideEst != null
      ? +(currentPrice * (1 + composite.upsideEst / 100)).toFixed(currentPrice < 1 ? 6 : 2)
      : null;

    // Volatilite (30g return std)
    const returns = [];
    for (let i = prices.length - 30; i < prices.length - 1; i++) {
      if (i > 0 && prices[i] > 0) returns.push((prices[i + 1] - prices[i]) / prices[i]);
    }
    const vol30dPct = +(stdDev(returns) * 100).toFixed(2);

    const result = {
      success: true,
      symbol: upper,
      name: meta.name,
      coingeckoId: id,
      fetchedAt: new Date().toISOString(),
      methodology: 'composite_v1',
      inputs: {
        currentPrice,
        marketCap,
        ath, athDate, atl,
        circulatingSupply: circ,
        maxSupply: max,
        volume30dAvg,
        volatility30dPct: vol30dPct,
      },
      signals: {
        drawdown:        sigDrawdown,
        maReversion:     sigMA,
        stockToFlow:     sigS2F,
        nvt:             sigNVT,
        volatilityBand:  sigVolBand,
      },
      valuation: {
        fairPrice,
        currentPrice,
        upsidePct: composite.upsideEst,
        compositeScore: composite.score,
        verdict: composite.verdict,
      },
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.warn(`[CryptoValuation] ${upper} hata:`, err.message?.slice(0, 100));
    return { success: false, error: 'Değerleme hesaplanamadı: ' + err.message, symbol: upper };
  }
}

function clearCache() { cache.clear(); }

module.exports = { valuateCrypto, clearCache };
