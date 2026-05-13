/**
 * Crypto Quote Service — BORSA KRALI
 *
 * dexter (virattt/dexter) src/tools/finance/crypto.ts'ten esinlendi.
 * Veri kaynağı: CoinGecko ücretsiz API (auth gerektirmez, dakikada 30 istek).
 *
 * Endpoints (CoinGecko):
 *   GET  /coins/markets?vs_currency=usd&ids=bitcoin,ethereum,...
 *   GET  /search?query=...
 *   GET  /coins/{id}
 *   GET  /search/trending
 */

const axios = require('axios');

const CG_BASE = 'https://api.coingecko.com/api/v3';
const cache = new Map();
const TTL_QUOTE = 60 * 1000;        // fiyat 1 dk
const TTL_SEARCH = 5 * 60 * 1000;   // arama 5 dk
const TTL_TRENDING = 5 * 60 * 1000; // trending 5 dk

// Sembol → CoinGecko id eşleme (en popüler 75+ kripto)
// CoinGecko id'leri ufak farklarla çalışıyor: BTC → bitcoin, ETH → ethereum vb.
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
  AAVE: 'aave',           ALGO: 'algorand',        THETA: 'theta-token',
  XLM: 'stellar',         IMX: 'immutable-x',      RNDR: 'render-token',
  GRT: 'the-graph',       INJ: 'injective-protocol', EGLD: 'elrond-erd-2',
  STX: 'blockstack',      FLOW: 'flow',            SAND: 'the-sandbox',
  MANA: 'decentraland',   QNT: 'quant-network',    HBAR: 'hedera-hashgraph',
  AXS: 'axie-infinity',   CRV: 'curve-dao-token',  SNX: 'havven',
  RUNE: 'thorchain',      COMP: 'compound-governance-token',
  ENS: 'ethereum-name-service', LDO: 'lido-dao',   GMX: 'gmx',
  PEPE: 'pepe',           FLOKI: 'floki',          WLD: 'worldcoin-wld',
  BLUR: 'blur',           ID: 'space-id',          SUI: 'sui',
  SEI: 'sei-network',     TIA: 'celestia',         PYTH: 'pyth-network',
  JTO: 'jito-governance-token', JUP: 'jupiter-exchange-solana',
  WIF: 'dogwifcoin',      BONK: 'bonk',            ORDI: 'ordinals',
  SATS: 'sats-ordinals',  BOME: 'book-of-meme',    ENA: 'ethena',
  ETHFI: 'ether-fi',      REZ: 'renzo',            NOT: 'notcoin',
  ZK: 'zksync',           DEEP: 'deep',            PAXG: 'pax-gold',
};

function getId(symbol) {
  return SYMBOL_TO_ID[symbol.toUpperCase()] || null;
}

async function cgGet(path, params = {}) {
  try {
    const r = await axios.get(`${CG_BASE}${path}`, {
      params,
      timeout: 12000,
      headers: { 'User-Agent': 'BorsaKrali/1.0' },
    });
    return r.data;
  } catch (err) {
    const status = err.response?.status;
    console.warn(`[CryptoQuote] CG hata ${path} (${status}): ${err.message?.slice(0, 80)}`);
    return null;
  }
}

/**
 * Tek crypto için detaylı veri.
 */
async function getQuote(symbol) {
  const upper = symbol.toUpperCase();
  const cacheKey = `quote_${upper}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_QUOTE) return cached.data;

  const id = getId(upper);
  if (!id) {
    return { success: false, error: 'Sembol CoinGecko\'da bulunamadi', symbol: upper };
  }

  // /coins/markets daha hafif ve fiyat + temel metriği döner
  const data = await cgGet('/coins/markets', {
    vs_currency: 'usd',
    ids: id,
    price_change_percentage: '24h,7d,30d',
  });

  if (!data || !data[0]) {
    return { success: false, error: 'CoinGecko verisi alınamadı', symbol: upper };
  }

  const c = data[0];
  const result = {
    success: true,
    symbol: upper,
    id: c.id,
    name: c.name,
    image: c.image,
    rank: c.market_cap_rank,
    price: {
      usd: c.current_price,
      ath: c.ath,
      athDate: c.ath_date,
      atl: c.atl,
      atlDate: c.atl_date,
    },
    change: {
      pct24h: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h,
      pct7d: c.price_change_percentage_7d_in_currency,
      pct30d: c.price_change_percentage_30d_in_currency,
    },
    marketCap: c.market_cap,
    marketCapChange24h: c.market_cap_change_percentage_24h,
    volume24h: c.total_volume,
    supply: {
      circulating: c.circulating_supply,
      total: c.total_supply,
      max: c.max_supply,
    },
    fetchedAt: new Date().toISOString(),
    source: 'coingecko',
  };

  cache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

/**
 * Birden fazla crypto için toplu fiyat (X Gundem podyum/listesi için).
 */
async function getBatchQuotes(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) return { success: false, error: 'Sembol listesi boş' };

  const ids = symbols.map(s => getId(s.toUpperCase())).filter(Boolean);
  if (ids.length === 0) return { success: false, error: 'Hiçbir sembol eşleşmedi' };

  const cacheKey = `batch_${ids.sort().join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_QUOTE) return cached.data;

  const data = await cgGet('/coins/markets', {
    vs_currency: 'usd',
    ids: ids.join(','),
    price_change_percentage: '24h',
  });

  if (!data) return { success: false, error: 'CoinGecko verisi alınamadı' };

  const map = {};
  data.forEach(c => {
    const sym = Object.entries(SYMBOL_TO_ID).find(([, id]) => id === c.id)?.[0];
    if (sym) {
      map[sym] = {
        symbol: sym,
        name: c.name,
        image: c.image,
        priceUsd: c.current_price,
        change24h: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h,
        marketCap: c.market_cap,
        rank: c.market_cap_rank,
        volume24h: c.total_volume,
      };
    }
  });

  const result = { success: true, count: Object.keys(map).length, quotes: map, fetchedAt: new Date().toISOString() };
  cache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

/**
 * Crypto arama — adı/sembolü içerene göre.
 */
async function search(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return { success: false, error: 'Sorgu boş' };

  const cacheKey = `search_${q}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_SEARCH) return cached.data;

  const data = await cgGet('/search', { query: q });
  if (!data) return { success: false, error: 'Arama yapılamadı' };

  const result = {
    success: true,
    query: q,
    coins: (data.coins || []).slice(0, 15).map(c => ({
      id: c.id,
      symbol: c.symbol?.toUpperCase(),
      name: c.name,
      rank: c.market_cap_rank,
      thumb: c.thumb,
    })),
    fetchedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

/**
 * En çok aranan/trending kriptolar.
 */
async function getTrending() {
  const cached = cache.get('trending');
  if (cached && Date.now() - cached.ts < TTL_TRENDING) return cached.data;

  const data = await cgGet('/search/trending');
  if (!data) return { success: false, error: 'Trending verisi alınamadı' };

  const coins = (data.coins || []).slice(0, 10).map(item => ({
    id: item.item?.id,
    symbol: item.item?.symbol?.toUpperCase(),
    name: item.item?.name,
    rank: item.item?.market_cap_rank,
    priceBtc: item.item?.price_btc,
    thumb: item.item?.thumb,
    score: item.item?.score,
  }));

  const result = {
    success: true,
    trending: coins,
    fetchedAt: new Date().toISOString(),
    source: 'coingecko',
  };

  cache.set('trending', { data: result, ts: Date.now() });
  return result;
}

function clearCryptoCache() { cache.clear(); }

module.exports = {
  getQuote,
  getBatchQuotes,
  search,
  getTrending,
  getId,
  clearCryptoCache,
  SYMBOL_TO_ID,
};
