/**
 * X (Twitter) Mention Analyzer — BORSA KRALI
 *
 * Mock veri katmanı — BIST hisselerinin X.com'da hashtag/cashtag bazlı
 * mention sayılarını üretir. dexter (virattt/dexter) projesindeki
 * src/tools/search/x-search.ts arayüzünden esinlenildi.
 *
 * Veri kaynağı yol haritası:
 *   1) (şu an) Deterministik mock — her hisse için sabit/tutarlı sayılar
 *   2) twscrape (vladkens/twscrape) cookie tabanlı çekim
 *   3) RapidAPI Twitter endpoint'i veya resmi X API v2 (Bearer token)
 *
 * Gerçek veriye geçince sadece fetchRawMentions() değişecek; cache + skor
 * mantığı aynı kalacak.
 */

const { allBistStocks, bist30Stocks, bist100Stocks } = require('../data/allBistStocks');

const MENTION_CACHE_TTL = 5 * 60 * 1000; // 5 dk
const mentionCache = new Map(); // key -> { result, ts }

// ─── Kripto evreni — top 100 (MalaysianSNR.jsx CRYPTO_TOP listesinden senkron) ───
const CRYPTO_UNIVERSE = [
  // Top 10 (en konuşulanlar)
  { symbol: 'BTC',   name: 'Bitcoin',          category: 'Layer 1',    tier: 'mega' },
  { symbol: 'ETH',   name: 'Ethereum',         category: 'Layer 1',    tier: 'mega' },
  { symbol: 'BNB',   name: 'Binance Coin',     category: 'Exchange',   tier: 'large' },
  { symbol: 'SOL',   name: 'Solana',           category: 'Layer 1',    tier: 'large' },
  { symbol: 'XRP',   name: 'Ripple',           category: 'Payments',   tier: 'large' },
  { symbol: 'USDC',  name: 'USD Coin',         category: 'Stablecoin', tier: 'large' },
  { symbol: 'ADA',   name: 'Cardano',          category: 'Layer 1',    tier: 'large' },
  { symbol: 'AVAX',  name: 'Avalanche',        category: 'Layer 1',    tier: 'large' },
  { symbol: 'DOGE',  name: 'Dogecoin',         category: 'Meme',       tier: 'large' },
  { symbol: 'TRX',   name: 'Tron',             category: 'Layer 1',    tier: 'large' },
  // 11-30
  { symbol: 'LINK',  name: 'Chainlink',        category: 'Oracle',     tier: 'mid' },
  { symbol: 'TON',   name: 'Toncoin',          category: 'Layer 1',    tier: 'mid' },
  { symbol: 'MATIC', name: 'Polygon',          category: 'Layer 2',    tier: 'mid' },
  { symbol: 'DOT',   name: 'Polkadot',         category: 'Interop',    tier: 'mid' },
  { symbol: 'LTC',   name: 'Litecoin',         category: 'Payments',   tier: 'mid' },
  { symbol: 'SHIB',  name: 'Shiba Inu',        category: 'Meme',       tier: 'mid' },
  { symbol: 'BCH',   name: 'Bitcoin Cash',     category: 'Payments',   tier: 'mid' },
  { symbol: 'NEAR',  name: 'Near Protocol',    category: 'Layer 1',    tier: 'mid' },
  { symbol: 'UNI',   name: 'Uniswap',          category: 'DeFi',       tier: 'mid' },
  { symbol: 'APT',   name: 'Aptos',            category: 'Layer 1',    tier: 'mid' },
  { symbol: 'ICP',   name: 'Internet Computer',category: 'Compute',    tier: 'mid' },
  { symbol: 'FIL',   name: 'Filecoin',         category: 'Storage',    tier: 'mid' },
  { symbol: 'ATOM',  name: 'Cosmos',           category: 'Interop',    tier: 'mid' },
  { symbol: 'OP',    name: 'Optimism',         category: 'Layer 2',    tier: 'mid' },
  { symbol: 'ARB',   name: 'Arbitrum',         category: 'Layer 2',    tier: 'mid' },
  { symbol: 'VET',   name: 'VeChain',          category: 'Supply',     tier: 'mid' },
  { symbol: 'MKR',   name: 'Maker',            category: 'DeFi',       tier: 'mid' },
  { symbol: 'AAVE',  name: 'Aave',             category: 'DeFi',       tier: 'mid' },
  { symbol: 'ALGO',  name: 'Algorand',         category: 'Layer 1',    tier: 'mid' },
  { symbol: 'THETA', name: 'Theta Network',    category: 'Media',      tier: 'mid' },
  // 31-60
  { symbol: 'XLM',   name: 'Stellar',          category: 'Payments',   tier: 'small' },
  { symbol: 'IMX',   name: 'Immutable X',      category: 'Gaming',     tier: 'small' },
  { symbol: 'RNDR',  name: 'Render',           category: 'Compute',    tier: 'small' },
  { symbol: 'GRT',   name: 'The Graph',        category: 'Indexing',   tier: 'small' },
  { symbol: 'INJ',   name: 'Injective',        category: 'DeFi',       tier: 'small' },
  { symbol: 'EGLD',  name: 'MultiversX',       category: 'Layer 1',    tier: 'small' },
  { symbol: 'STX',   name: 'Stacks',           category: 'BTC L2',     tier: 'small' },
  { symbol: 'FLOW',  name: 'Flow',             category: 'NFT',        tier: 'small' },
  { symbol: 'SAND',  name: 'The Sandbox',      category: 'Metaverse',  tier: 'small' },
  { symbol: 'MANA',  name: 'Decentraland',     category: 'Metaverse',  tier: 'small' },
  { symbol: 'QNT',   name: 'Quant',            category: 'Interop',    tier: 'small' },
  { symbol: 'HBAR',  name: 'Hedera',           category: 'Enterprise', tier: 'small' },
  { symbol: 'AXS',   name: 'Axie Infinity',    category: 'Gaming',     tier: 'small' },
  { symbol: 'CRV',   name: 'Curve',            category: 'DeFi',       tier: 'small' },
  { symbol: 'SNX',   name: 'Synthetix',        category: 'DeFi',       tier: 'small' },
  { symbol: 'RUNE',  name: 'THORChain',        category: 'DeFi',       tier: 'small' },
  { symbol: 'COMP',  name: 'Compound',         category: 'DeFi',       tier: 'small' },
  { symbol: 'ENS',   name: 'Ethereum Name',    category: 'Identity',   tier: 'small' },
  { symbol: 'LDO',   name: 'Lido',             category: 'Staking',    tier: 'small' },
  { symbol: 'GMX',   name: 'GMX',              category: 'DeFi',       tier: 'small' },
  // Memes & yeni nesil
  { symbol: 'PEPE',  name: 'Pepe',             category: 'Meme',       tier: 'mid' },
  { symbol: 'FLOKI', name: 'Floki',            category: 'Meme',       tier: 'small' },
  { symbol: 'WLD',   name: 'Worldcoin',        category: 'Identity',   tier: 'small' },
  { symbol: 'BLUR',  name: 'Blur',             category: 'NFT',        tier: 'small' },
  { symbol: 'ID',    name: 'SPACE ID',         category: 'Identity',   tier: 'small' },
  { symbol: 'SUI',   name: 'Sui',              category: 'Layer 1',    tier: 'small' },
  { symbol: 'SEI',   name: 'Sei',              category: 'Layer 1',    tier: 'small' },
  { symbol: 'TIA',   name: 'Celestia',         category: 'DA',         tier: 'small' },
  { symbol: 'PYTH',  name: 'Pyth',             category: 'Oracle',     tier: 'small' },
  { symbol: 'JTO',   name: 'Jito',             category: 'Liquid Stake',tier: 'small' },
  { symbol: 'JUP',   name: 'Jupiter',          category: 'DEX',        tier: 'small' },
  { symbol: 'WIF',   name: 'dogwifhat',        category: 'Meme',       tier: 'mid' },
  { symbol: 'BONK',  name: 'Bonk',             category: 'Meme',       tier: 'small' },
  { symbol: 'ORDI',  name: 'Ordinals',         category: 'BRC-20',     tier: 'small' },
  { symbol: 'SATS',  name: '1000Sats',         category: 'BRC-20',     tier: 'small' },
  { symbol: 'BOME',  name: 'BOOK OF MEME',     category: 'Meme',       tier: 'small' },
  { symbol: 'ENA',   name: 'Ethena',           category: 'Stablecoin', tier: 'small' },
  { symbol: 'ETHFI', name: 'ether.fi',         category: 'Liquid Stake',tier: 'small' },
  { symbol: 'REZ',   name: 'Renzo',            category: 'Liquid Stake',tier: 'small' },
  { symbol: 'NOT',   name: 'Notcoin',          category: 'Meme',       tier: 'small' },
  { symbol: 'ZK',    name: 'ZKsync',           category: 'Layer 2',    tier: 'small' },
];

const TOP10_CRYPTOS = CRYPTO_UNIVERSE.slice(0, 10);
const TOP30_CRYPTOS = CRYPTO_UNIVERSE.slice(0, 30);

const SAMPLE_HASHTAGS = [
  'borsa', 'bist', 'bist100', 'borsaistanbul', 'hisse',
  'yatırım', 'analiz', 'temettü', 'rapor', 'haber',
];

const SAMPLE_TWEET_TEMPLATES = [
  '#{SYM} formasyon kırılımı verdi, hedef yukarı.',
  '${SYM} bilanço sonrası tepki bekleniyor.',
  '#{SYM} hacim artışı dikkat çekiyor.',
  '${SYM} direnç seviyesinde reddedildi, yatay band.',
  '#{SYM} destek üzerinde tutunuyor, alım fırsatı olabilir.',
  '${SYM} momentum güçleniyor — RSI 55 üstünde.',
  '#{SYM} tarafında kurumsal alımlar gözleniyor.',
  '${SYM} kâr realizasyonu sonrası dip arayışı.',
];

const SAMPLE_AUTHORS = [
  'analist_ahmet', 'borsa_kralim', 'piyasa_takipcisi', 'yatirimci_x',
  'teknik_analiz', 'temel_fan', 'gunluk_trader', 'uzun_vadeli',
  'hisse_avcisi', 'bist_takip',
];

function seedFromSymbol(symbol) {
  return symbol.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
}

function pseudoRand(seed, offset) {
  const x = Math.sin(seed + offset) * 10000;
  return x - Math.floor(x);
}

function pickFromList(list, seed, offset) {
  return list[Math.floor(pseudoRand(seed, offset) * list.length)];
}

function popularityBoost(symbol, market) {
  const ultraPopular = new Set([
    'THYAO', 'ASELS', 'GARAN', 'AKBNK', 'KCHOL', 'SASA', 'EREGL', 'BIMAS',
    'SAHOL', 'TUPRS', 'ISCTR', 'KOZAA', 'KOZAL', 'PGSUS', 'HEKTS', 'FROTO',
  ]);
  if (ultraPopular.has(symbol)) return 5.0;
  if (market === 'BIST30') return 2.5;
  if (market === 'BIST100') return 1.4;
  return 1.0;
}

// Kripto popülerlik: BTC/ETH ezici, sonra tier'a göre azalır
function cryptoPopularityBoost(symbol, tier) {
  if (symbol === 'BTC') return 50.0; // BTC mention'ları her şeyi ezer
  if (symbol === 'ETH') return 35.0;
  if (symbol === 'SOL' || symbol === 'XRP' || symbol === 'DOGE') return 18.0;
  if (tier === 'mega')  return 25.0;
  if (tier === 'large') return 12.0;
  if (tier === 'mid')   return 5.0;
  return 1.5; // small
}

const CRYPTO_HASHTAGS = ['crypto', 'altcoin', 'bullish', 'bearish', 'btc', 'eth', 'defi', 'bitcoin', 'pump', 'hodl'];

const CRYPTO_TWEET_TEMPLATES = [
  '#{SYM} momentum building, watch the breakout.',
  '${SYM} just bounced off support, alts season?',
  '#{SYM} chart looking bullish on the daily.',
  '${SYM} resistance hit again, expect rejection.',
  '#{SYM} accumulation phase, smart money loading.',
  '${SYM} RSI oversold, mean reversion incoming.',
  '#{SYM} new ATH watch, FOMO levels.',
  '${SYM} losing key support, be careful.',
];

const CRYPTO_AUTHORS = [
  'cryptoanalyst', 'whale_alert', 'altcoin_hunter', 'btc_maxi',
  'defi_degen', 'chartmaster', 'onchain_dan', 'crypto_kris',
];

function generateMentionsForStock(stock) {
  const seed = seedFromSymbol(stock.symbol);
  const boost = popularityBoost(stock.symbol, stock.market);

  const mentions24h = Math.round((20 + pseudoRand(seed, 1) * 200) * boost);
  const mentions7d = Math.round(mentions24h * (4 + pseudoRand(seed, 2) * 3));
  const yesterday = Math.round(mentions24h * (0.6 + pseudoRand(seed, 3) * 0.8));
  const change24h = yesterday > 0 ? +(((mentions24h - yesterday) / yesterday) * 100).toFixed(1) : 0;

  const positiveRatio = 0.30 + pseudoRand(seed, 4) * 0.45; // 0.30 - 0.75
  const negativeRatio = (1 - positiveRatio) * (0.3 + pseudoRand(seed, 5) * 0.5);
  const neutralRatio = 1 - positiveRatio - negativeRatio;

  const sentiment = {
    positive: +(positiveRatio * 100).toFixed(1),
    negative: +(negativeRatio * 100).toFixed(1),
    neutral: +(neutralRatio * 100).toFixed(1),
  };

  const topHashtags = [
    `#${stock.symbol}`,
    `$${stock.symbol}`,
    `#${pickFromList(SAMPLE_HASHTAGS, seed, 6)}`,
    `#${pickFromList(SAMPLE_HASHTAGS, seed, 7)}`,
  ];

  // Trend skoru: hacim x değişim x pozitif sentiment
  const trendScore = Math.min(100, Math.round(
    (mentions24h / 50) * 5 +
    Math.max(0, change24h) * 0.8 +
    sentiment.positive * 0.3
  ));

  return {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    market: stock.market,
    assetType: 'stock',
    mentions24h,
    mentions7d,
    mentionsYesterday: yesterday,
    change24h,
    sentiment,
    topHashtags,
    trendScore,
  };
}

// Kripto için ayrı generator — daha agresif mention sayıları (X'te kripto çok daha fazla konuşulur)
function generateMentionsForCrypto(crypto) {
  const seed = seedFromSymbol(crypto.symbol) + 999; // farklı seed offset
  const boost = cryptoPopularityBoost(crypto.symbol, crypto.tier);

  const mentions24h = Math.round((100 + pseudoRand(seed, 1) * 800) * boost);
  const mentions7d = Math.round(mentions24h * (4 + pseudoRand(seed, 2) * 3));
  const yesterday = Math.round(mentions24h * (0.5 + pseudoRand(seed, 3) * 1.0)); // kripto daha volatile
  const change24h = yesterday > 0 ? +(((mentions24h - yesterday) / yesterday) * 100).toFixed(1) : 0;

  // Kripto sentiment daha kutuplaşmış olur — uçlara doğru
  const positiveRatio = 0.25 + pseudoRand(seed, 4) * 0.55; // 0.25 - 0.80
  const negativeRatio = (1 - positiveRatio) * (0.4 + pseudoRand(seed, 5) * 0.5);
  const neutralRatio = 1 - positiveRatio - negativeRatio;

  const sentiment = {
    positive: +(positiveRatio * 100).toFixed(1),
    negative: +(negativeRatio * 100).toFixed(1),
    neutral: +(neutralRatio * 100).toFixed(1),
  };

  const topHashtags = [
    `#${crypto.symbol}`,
    `$${crypto.symbol}`,
    `#${pickFromList(CRYPTO_HASHTAGS, seed, 6)}`,
    `#${pickFromList(CRYPTO_HASHTAGS, seed, 7)}`,
  ];

  const trendScore = Math.min(100, Math.round(
    (mentions24h / 200) * 5 + // kripto için daha yüksek baz
    Math.max(0, change24h) * 0.8 +
    sentiment.positive * 0.3
  ));

  return {
    symbol: crypto.symbol,
    name: crypto.name,
    sector: crypto.category, // sector → kripto kategorisi
    market: 'CRYPTO',
    assetType: 'crypto',
    tier: crypto.tier,
    mentions24h,
    mentions7d,
    mentionsYesterday: yesterday,
    change24h,
    sentiment,
    topHashtags,
    trendScore,
  };
}

function generateRecentTweets(item, count = 8, isCrypto = false) {
  const baseSeed = seedFromSymbol(item.symbol);
  const seed = isCrypto ? baseSeed + 999 : baseSeed;
  const templates = isCrypto ? CRYPTO_TWEET_TEMPLATES : SAMPLE_TWEET_TEMPLATES;
  const authors = isCrypto ? CRYPTO_AUTHORS : SAMPLE_AUTHORS;
  // Kripto tweetler 5-10x daha fazla etkileşim alır
  const engagementMult = isCrypto ? 8 : 1;

  const tweets = [];
  for (let i = 0; i < count; i++) {
    const tplIdx = Math.floor(pseudoRand(seed, 100 + i) * templates.length);
    const author = pickFromList(authors, seed, 200 + i);
    const minutesAgo = Math.floor(pseudoRand(seed, 300 + i) * 1440); // 0-24sa
    const likes = Math.floor(pseudoRand(seed, 400 + i) * 250 * engagementMult) + 5;
    const retweets = Math.floor(likes * (0.05 + pseudoRand(seed, 500 + i) * 0.25));
    const replies = Math.floor(likes * (0.02 + pseudoRand(seed, 600 + i) * 0.18));

    tweets.push({
      id: `mock_${item.symbol}_${i}`,
      author: `@${author}`,
      text: templates[tplIdx].replace(/\{SYM\}/g, item.symbol),
      createdMinutesAgo: minutesAgo,
      metrics: { likes, retweets, replies },
      url: `https://x.com/search?q=%23${item.symbol}&src=typed_query`,
    });
  }
  return tweets.sort((a, b) => a.createdMinutesAgo - b.createdMinutesAgo);
}

function getStockList(scope) {
  if (scope === 'bist30')      return bist30Stocks;
  if (scope === 'all')         return allBistStocks;
  if (scope === 'crypto')      return TOP30_CRYPTOS;
  if (scope === 'crypto_top10')return TOP10_CRYPTOS;
  if (scope === 'crypto_all')  return CRYPTO_UNIVERSE;
  return bist100Stocks; // varsayılan
}

const CRYPTO_SCOPES = new Set(['crypto', 'crypto_top10', 'crypto_all']);

/**
 * Tarayıcı: Tüm scope için sıralanmış mention listesi.
 * Scope'lar: bist30 | bist100 | all | crypto | crypto_top10 | crypto_all
 */
function scanMentions(scope = 'bist100') {
  const cacheKey = `scan_${scope}`;
  const cached = mentionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MENTION_CACHE_TTL) return cached.result;

  const isCrypto = CRYPTO_SCOPES.has(scope);
  const items = getStockList(scope);
  const enriched = items.map(isCrypto ? generateMentionsForCrypto : generateMentionsForStock);

  const totalMentions = enriched.reduce((a, s) => a + s.mentions24h, 0);
  const top20 = [...enriched].sort((a, b) => b.mentions24h - a.mentions24h).slice(0, 20);
  const trending = [...enriched]
    .filter(s => s.change24h > 0)
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 10);
  const bullish = [...enriched]
    .sort((a, b) => b.sentiment.positive - a.sentiment.positive)
    .slice(0, 10);
  const bearish = [...enriched]
    .sort((a, b) => b.sentiment.negative - a.sentiment.negative)
    .slice(0, 10);

  const result = {
    success: true,
    scope,
    assetType: isCrypto ? 'crypto' : 'stock',
    scannedAt: new Date().toISOString(),
    dataSource: 'mock', // ileride 'twscrape' | 'rapidapi' | 'x_api_v2' olacak
    totalScanned: items.length,
    totalMentions24h: totalMentions,
    avgMentionsPerStock: Math.round(totalMentions / items.length),
    top20,
    trending,
    bullish,
    bearish,
    all: enriched,
  };

  mentionCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

/**
 * Tek sembol detayı — BIST hissesi veya kripto otomatik tespit edilir.
 */
function getMentionDetail(symbol, opts = {}) {
  const upper = symbol.toUpperCase().replace('.IS', '').replace('-USD', '');
  const forceType = opts.assetType; // 'stock' | 'crypto' | undefined
  const cacheKey = `detail_${upper}_${forceType || 'auto'}`;
  const cached = mentionCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MENTION_CACHE_TTL) return cached.result;

  // Tip belirle: zorla tip > kripto evrenine bak > BIST'e bak
  let item = null;
  let isCrypto = false;
  if (forceType === 'crypto') {
    item = CRYPTO_UNIVERSE.find(c => c.symbol === upper);
    isCrypto = !!item;
  } else if (forceType === 'stock') {
    item = allBistStocks.find(s => s.symbol === upper);
  } else {
    // Auto-detect: önce kripto evrenine bak (BTC, ETH gibi), yoksa BIST
    item = CRYPTO_UNIVERSE.find(c => c.symbol === upper);
    if (item) {
      isCrypto = true;
    } else {
      item = allBistStocks.find(s => s.symbol === upper);
    }
  }

  if (!item) {
    return { success: false, error: 'Sembol bulunamadı', symbol: upper };
  }

  const summary = isCrypto ? generateMentionsForCrypto(item) : generateMentionsForStock(item);
  const tweets = generateRecentTweets(item, 12, isCrypto);
  const seed = seedFromSymbol(item.symbol) + (isCrypto ? 999 : 0);

  // 7 günlük zaman serisi (en eski → en yeni)
  const series = [];
  for (let d = 6; d >= 0; d--) {
    const dayBoost = 0.5 + pseudoRand(seed, 700 + d) * 1.2;
    const dailyMentions = Math.max(5, Math.round(summary.mentions24h * dayBoost));
    const date = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    series.push({
      date: date.toISOString().split('T')[0],
      mentions: dailyMentions,
      positive: Math.round(dailyMentions * (summary.sentiment.positive / 100)),
      negative: Math.round(dailyMentions * (summary.sentiment.negative / 100)),
    });
  }

  // Saatlik dağılım (son 24 saat)
  const hourly = [];
  for (let h = 23; h >= 0; h--) {
    const hourBoost = 0.3 + pseudoRand(seed, 800 + h) * 2.0;
    hourly.push({
      hour: h,
      mentions: Math.max(0, Math.round((summary.mentions24h / 24) * hourBoost)),
    });
  }

  const result = {
    success: true,
    dataSource: 'mock',
    fetchedAt: new Date().toISOString(),
    ...summary,
    series7d: series,
    hourly24h: hourly,
    recentTweets: tweets,
    xSearchUrl: `https://x.com/search?q=%23${item.symbol}+OR+%24${item.symbol}&src=typed_query&f=live`,
  };

  mentionCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

function clearCache() {
  mentionCache.clear();
}

module.exports = {
  scanMentions,
  getMentionDetail,
  clearCache,
};
