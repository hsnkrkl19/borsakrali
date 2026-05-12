/**
 * X (Twitter) Mention Analyzer — BORSA KRALI
 *
 * GERÇEK X.com scraper entegrasyonu — @the-convocation/twitter-scraper
 * Mock data tamamen kaldırıldı. Credentials yoksa boş cevap döner.
 *
 * Kimlik doğrulama (env):
 *   - X_AUTH_TOKEN + X_CT0     → tarayıcı cookie'lerinden alınır (önerilen)
 *   - X_USERNAME + X_PASSWORD  → ilk login → cookie dosyasına kaydedilir
 *   - Cookie dosyası           → backend/.x-cookies.json (otomatik yönetilir)
 *
 * Per.Tgm. Hasan KIRKIL
 */

const fs = require('fs');
const path = require('path');
const { allBistStocks, bist30Stocks, bist100Stocks } = require('../data/allBistStocks');

let ScraperLib = null;
try {
  ScraperLib = require('@the-convocation/twitter-scraper');
} catch (e) {
  console.error('[XMentions] @the-convocation/twitter-scraper modülü yüklenemedi:', e.message);
}

const COOKIE_FILE = path.join(__dirname, '..', '..', '.x-cookies.json');

// Cache TTL'leri — X rate limit'i agresif olduğu için uzun tutuyoruz
const SCANNER_CACHE_TTL = 30 * 60 * 1000;   // 30 dk
const DETAIL_CACHE_TTL  = 15 * 60 * 1000;   // 15 dk
const PER_SEARCH_TIMEOUT_MS = 25 * 1000;    // her sembol için 25 sn

// Warmer ayarları (sadece BIST30 + Top 10 kripto döngüsü)
const WARMER_DELAY_MS = 9000;               // her sembol arası 9 sn
const WARMER_CYCLE_MS = 35 * 60 * 1000;     // 35 dk'da bir döngü
const MAX_TWEETS_PER_SEARCH = 50;           // her aramada max 50 tweet

const scannerCache = new Map(); // scope -> { result, ts }
const detailCache  = new Map(); // symbol+type -> { result, ts }
const itemSummaryCache = new Map(); // symbol -> { summary, ts }  // scanner için per-sembol özet

// ─── Kripto evreni (eski mock dosyasından korundu — sadece liste, değer yok) ───
const CRYPTO_UNIVERSE = [
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
  // Top 30-75 (warmer kapsamı dışında ama detail için aranabilir)
  { symbol: 'XLM',   name: 'Stellar',          category: 'Payments',   tier: 'small' },
  { symbol: 'PEPE',  name: 'Pepe',             category: 'Meme',       tier: 'mid' },
  { symbol: 'WIF',   name: 'dogwifhat',        category: 'Meme',       tier: 'mid' },
  { symbol: 'SUI',   name: 'Sui',              category: 'Layer 1',    tier: 'small' },
  { symbol: 'TIA',   name: 'Celestia',         category: 'DA',         tier: 'small' },
  { symbol: 'INJ',   name: 'Injective',        category: 'DeFi',       tier: 'small' },
  { symbol: 'IMX',   name: 'Immutable X',      category: 'Gaming',     tier: 'small' },
  { symbol: 'RNDR',  name: 'Render',           category: 'Compute',    tier: 'small' },
  { symbol: 'SEI',   name: 'Sei',              category: 'Layer 1',    tier: 'small' },
];

const TOP10_CRYPTOS = CRYPTO_UNIVERSE.slice(0, 10);
const TOP30_CRYPTOS = CRYPTO_UNIVERSE.slice(0, 30);

// ─── Sentiment sözlüğü (TR + EN) ───
const POSITIVE_WORDS = [
  'yükseliş','yukarı','alım','güçlü','güzel','iyi','başarı','kar','kâr','rekor','rally','pump','pump\'lan',
  'breakout','bullish','momentum','olumlu','iyileşme','potansiyel','hedef','dip','fırsat','tutunma','güven',
  'kazan','toparlanma','sıçrama','patlama','tavan','rally\'e','formasyon','kırıldı','positive','strong','buy',
  'green','moon','growth','support','destek','accumulation','birikim','long','rocket','🚀','🟢','📈','🔥','✅',
];
const NEGATIVE_WORDS = [
  'düşüş','aşağı','satış','sat','zayıf','risk','zarar','kayıp','kötü','breakdown','bearish','panik',
  'tehlike','olumsuz','kırıldı destek','dökülme','korku','dump','dipleme','crash','reddedildi','reject',
  'taban','direnç','rejected','negative','sell','weak','bear','rejection','liquidation','liq\'lendi','dipti',
  'short','tabana','collapse','rug','red','🔴','📉','⚠️','❌','💀',
];

// ─────────────────────────────────────────────────────────────────
// Scraper init — singleton, lazy
// ─────────────────────────────────────────────────────────────────
let scraperInstance = null;
let scraperReady = false;
let scraperInitPromise = null;
let scraperLastError = null;

function buildCookieStrings({ authToken, ct0, guestId }) {
  // x.com domain için Cookie header'a uygun string'ler
  const exp = new Date(Date.now() + 30*24*60*60*1000).toUTCString();
  const cookies = [];
  if (authToken) cookies.push(`auth_token=${authToken}; Domain=.x.com; Path=/; Expires=${exp}; Secure; HttpOnly; SameSite=None`);
  if (ct0)       cookies.push(`ct0=${ct0}; Domain=.x.com; Path=/; Expires=${exp}; Secure; SameSite=Lax`);
  if (guestId)   cookies.push(`guest_id=${guestId}; Domain=.x.com; Path=/; Expires=${exp}; Secure`);
  return cookies;
}

async function loadCookiesFromDisk() {
  if (!fs.existsSync(COOKIE_FILE)) return null;
  try {
    const raw = fs.readFileSync(COOKIE_FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr;
  } catch (e) {
    console.warn('[XMentions] Cookie dosyası okunamadı:', e.message);
  }
  return null;
}

async function saveCookiesToDisk(cookies) {
  try {
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2), 'utf8');
  } catch (e) {
    console.warn('[XMentions] Cookie dosyası yazılamadı:', e.message);
  }
}

async function initScraper() {
  if (scraperReady) return scraperInstance;
  if (scraperInitPromise) return scraperInitPromise;

  scraperInitPromise = (async () => {
    if (!ScraperLib || !ScraperLib.Scraper) {
      scraperLastError = 'twitter-scraper kütüphanesi yüklü değil';
      throw new Error(scraperLastError);
    }

    scraperInstance = new ScraperLib.Scraper();

    // 1) Disk'teki cookie dosyası
    const diskCookies = await loadCookiesFromDisk();
    if (diskCookies) {
      try {
        await scraperInstance.setCookies(diskCookies);
        const ok = await scraperInstance.isLoggedIn();
        if (ok) {
          scraperReady = true;
          console.log('[XMentions] ✓ Scraper hazır (disk cookies)');
          return scraperInstance;
        }
        console.warn('[XMentions] Disk cookies geçersiz, env / login deneniyor...');
      } catch (e) {
        console.warn('[XMentions] Disk cookies set hata:', e.message);
      }
    }

    // 2) Env'den auth_token + ct0
    const envCookies = buildCookieStrings({
      authToken: process.env.X_AUTH_TOKEN,
      ct0:       process.env.X_CT0,
      guestId:   process.env.X_GUEST_ID,
    });
    if (envCookies.length >= 2) {
      try {
        await scraperInstance.setCookies(envCookies);
        const ok = await scraperInstance.isLoggedIn();
        if (ok) {
          scraperReady = true;
          // Disk'e de yaz (sonraki restart için)
          const persisted = await scraperInstance.getCookies();
          if (persisted) await saveCookiesToDisk(persisted);
          console.log('[XMentions] ✓ Scraper hazır (env cookies)');
          return scraperInstance;
        }
        console.warn('[XMentions] Env cookies isLoggedIn=false');
      } catch (e) {
        console.warn('[XMentions] Env cookies set hata:', e.message);
      }
    }

    // 3) Username/password login
    if (process.env.X_USERNAME && process.env.X_PASSWORD) {
      try {
        await scraperInstance.login(
          process.env.X_USERNAME,
          process.env.X_PASSWORD,
          process.env.X_EMAIL || undefined,
          process.env.X_2FA_SECRET || undefined
        );
        const ok = await scraperInstance.isLoggedIn();
        if (ok) {
          scraperReady = true;
          const persisted = await scraperInstance.getCookies();
          if (persisted) await saveCookiesToDisk(persisted);
          console.log('[XMentions] ✓ Scraper hazır (username/password login)');
          return scraperInstance;
        }
      } catch (e) {
        console.warn('[XMentions] Login hata:', e.message);
      }
    }

    scraperLastError = 'X credentials yapılandırılmadı veya geçersiz (env: X_AUTH_TOKEN+X_CT0 ya da X_USERNAME+X_PASSWORD)';
    throw new Error(scraperLastError);
  })();

  try {
    return await scraperInitPromise;
  } finally {
    scraperInitPromise = null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Yardımcılar
// ─────────────────────────────────────────────────────────────────
function withTimeout(promise, ms, label = 'op') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms);
    promise.then(v => { clearTimeout(t); resolve(v); },
                 e => { clearTimeout(t); reject(e); });
  });
}

function analyzeSentiment(text) {
  if (!text) return 'neutral';
  const lower = text.toLowerCase();
  let pos = 0, neg = 0;
  for (const w of POSITIVE_WORDS) if (lower.includes(w)) pos++;
  for (const w of NEGATIVE_WORDS) if (lower.includes(w)) neg++;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

function minutesSince(timestamp) {
  if (!timestamp) return 0;
  const ms = (timestamp * 1000); // Twitter timestamp saniye cinsinden
  return Math.max(0, Math.floor((Date.now() - ms) / 60000));
}

// ─────────────────────────────────────────────────────────────────
// Tek sembol için tweet topla (son 24 saat) — düşük seviye
// ─────────────────────────────────────────────────────────────────
async function searchSymbolTweets(symbol, isCrypto, maxTweets = MAX_TWEETS_PER_SEARCH) {
  const scraper = await initScraper();
  const sinceDate = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
  // Hem cashtag ($) hem hashtag (#) — kripto için BTC genel terimi de eklenir
  // -filter:retweets orijinal mention'ları öne çıkarır
  const q = `($${symbol} OR #${symbol}) since:${sinceDate} -filter:retweets lang:tr OR lang:en`;

  const tweets = [];
  const generator = scraper.searchTweets(q, maxTweets, ScraperLib.SearchMode?.Latest);
  const deadline = Date.now() + PER_SEARCH_TIMEOUT_MS;

  try {
    for await (const tw of generator) {
      if (Date.now() > deadline) break;
      if (!tw || !tw.text) continue;
      tweets.push(tw);
      if (tweets.length >= maxTweets) break;
    }
  } catch (e) {
    // Rate limit / network — kısmi sonuçla dön
    console.warn(`[XMentions] ${symbol} arama hatası: ${e.message?.substring(0, 80)}`);
  }
  return tweets;
}

function buildSummaryFromTweets(item, tweets, isCrypto) {
  const now = Date.now();
  const day1Ms = 24 * 60 * 60 * 1000;
  const t24 = tweets.filter(t => (now - t.timestamp*1000) <= day1Ms);
  const tYesterday = tweets.filter(t => {
    const age = now - t.timestamp*1000;
    return age > day1Ms && age <= 2*day1Ms;
  });
  const t7d = tweets; // arama zaten 7 günle sınırlandı

  const mentions24h        = t24.length;
  const mentionsYesterday  = tYesterday.length;
  const mentions7d         = t7d.length;
  const change24h = mentionsYesterday > 0
    ? +(((mentions24h - mentionsYesterday) / mentionsYesterday) * 100).toFixed(1)
    : (mentions24h > 0 ? 100 : 0);

  // Sentiment (sadece 24 saat)
  let pos = 0, neg = 0, neu = 0;
  for (const t of t24) {
    const s = analyzeSentiment(t.text);
    if (s === 'positive') pos++;
    else if (s === 'negative') neg++;
    else neu++;
  }
  const total = (pos + neg + neu) || 1;
  const sentiment = {
    positive: +((pos / total) * 100).toFixed(1),
    negative: +((neg / total) * 100).toFixed(1),
    neutral:  +((neu / total) * 100).toFixed(1),
  };

  // Hashtag sayımı
  const hashCount = new Map();
  for (const t of t24) {
    for (const h of (t.hashtags || [])) {
      const key = (h || '').toLowerCase();
      if (!key) continue;
      hashCount.set(key, (hashCount.get(key) || 0) + 1);
    }
  }
  const extraTags = [...hashCount.entries()]
    .sort((a,b) => b[1] - a[1])
    .slice(0, 2)
    .map(([h]) => `#${h}`);
  const topHashtags = [`#${item.symbol}`, `$${item.symbol}`, ...extraTags].slice(0, 4);

  // Trend skoru
  const trendScore = Math.min(100, Math.round(
    Math.min(mentions24h, 100) * 0.5 +
    Math.max(0, change24h) * 0.3 +
    sentiment.positive * 0.3
  ));

  return {
    symbol: item.symbol,
    name: item.name,
    sector: isCrypto ? item.category : item.sector,
    market: isCrypto ? 'CRYPTO' : item.market,
    assetType: isCrypto ? 'crypto' : 'stock',
    ...(isCrypto ? { tier: item.tier } : {}),
    mentions24h,
    mentions7d,
    mentionsYesterday,
    change24h,
    sentiment,
    topHashtags,
    trendScore,
  };
}

// ─────────────────────────────────────────────────────────────────
// Detail için ek alanlar: 7 günlük seri + saatlik dağılım + son tweetler
// ─────────────────────────────────────────────────────────────────
function buildDetailFromTweets(item, tweets, isCrypto, summary) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // 7 günlük seri (en eski → en yeni)
  const series = [];
  for (let d = 6; d >= 0; d--) {
    const start = now - (d + 1) * dayMs;
    const end   = now - d * dayMs;
    const dayTweets = tweets.filter(t => {
      const ms = t.timestamp * 1000;
      return ms > start && ms <= end;
    });
    let pos = 0, neg = 0;
    for (const t of dayTweets) {
      const s = analyzeSentiment(t.text);
      if (s === 'positive') pos++;
      else if (s === 'negative') neg++;
    }
    const dateStr = new Date(end - 1).toISOString().split('T')[0];
    series.push({
      date: dateStr,
      mentions: dayTweets.length,
      positive: pos,
      negative: neg,
    });
  }

  // Saatlik dağılım (son 24 saat)
  const hourly = [];
  const t24 = tweets.filter(t => (now - t.timestamp*1000) <= dayMs);
  for (let h = 23; h >= 0; h--) {
    const start = now - (h + 1) * 60 * 60 * 1000;
    const end   = now - h * 60 * 60 * 1000;
    const hourTweets = t24.filter(t => {
      const ms = t.timestamp * 1000;
      return ms > start && ms <= end;
    });
    hourly.push({ hour: 23 - h, mentions: hourTweets.length });
  }

  // Son tweetler (en yeni 12)
  const recent = [...t24]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12)
    .map(t => ({
      id: t.id || `tw_${t.timestamp}`,
      author: t.username ? `@${t.username}` : '@anonymous',
      text: t.text || '',
      createdMinutesAgo: minutesSince(t.timestamp),
      metrics: {
        likes:    t.likes    || 0,
        retweets: t.retweets || 0,
        replies:  t.replies  || 0,
      },
      url: t.permanentUrl || `https://x.com/search?q=%23${item.symbol}&src=typed_query`,
    }));

  return {
    ...summary,
    series7d: series,
    hourly24h: hourly,
    recentTweets: recent,
    xSearchUrl: `https://x.com/search?q=%23${item.symbol}+OR+%24${item.symbol}&src=typed_query&f=live`,
  };
}

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────
function getStockList(scope) {
  if (scope === 'bist30')        return bist30Stocks;
  if (scope === 'all')           return allBistStocks;
  if (scope === 'crypto')        return TOP30_CRYPTOS;
  if (scope === 'crypto_top10')  return TOP10_CRYPTOS;
  if (scope === 'crypto_all')    return CRYPTO_UNIVERSE;
  return bist100Stocks;
}

const CRYPTO_SCOPES = new Set(['crypto', 'crypto_top10', 'crypto_all']);

/**
 * Tarayıcı — sadece warmer'ın doldurduğu cache'i okur, on-demand scan YAPMAZ.
 * Boşsa frontend'e "warming up" mesajı dön.
 */
function scanMentions(scope = 'bist100') {
  const cacheKey = `scan_${scope}`;
  const cached = scannerCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SCANNER_CACHE_TTL) return cached.result;

  const isCrypto = CRYPTO_SCOPES.has(scope);
  const items = getStockList(scope);

  // itemSummaryCache'ten taze olanları topla
  const enriched = [];
  for (const it of items) {
    const cs = itemSummaryCache.get(it.symbol);
    if (cs && Date.now() - cs.ts < SCANNER_CACHE_TTL) {
      enriched.push(cs.summary);
    }
  }

  if (enriched.length === 0) {
    const result = {
      success: true,
      scope,
      assetType: isCrypto ? 'crypto' : 'stock',
      scannedAt: new Date().toISOString(),
      dataSource: scraperReady ? 'x_scraper_warming' : 'x_scraper_unconfigured',
      message: scraperReady
        ? 'Veri ilk taramayı tamamlıyor. Birkaç dakika sonra tekrar yükleyin.'
        : (scraperLastError || 'X credentials yapılandırılmadı.'),
      totalScanned: 0,
      totalMentions24h: 0,
      avgMentionsPerStock: 0,
      top20: [], trending: [], bullish: [], bearish: [], all: [],
    };
    return result;
  }

  const totalMentions = enriched.reduce((a, s) => a + (s.mentions24h || 0), 0);
  const top20    = [...enriched].sort((a, b) => b.mentions24h - a.mentions24h).slice(0, 20);
  const trending = [...enriched].filter(s => s.change24h > 0)
                                .sort((a, b) => b.change24h - a.change24h).slice(0, 10);
  const bullish  = [...enriched].sort((a, b) => b.sentiment.positive - a.sentiment.positive).slice(0, 10);
  const bearish  = [...enriched].sort((a, b) => b.sentiment.negative - a.sentiment.negative).slice(0, 10);

  const result = {
    success: true,
    scope,
    assetType: isCrypto ? 'crypto' : 'stock',
    scannedAt: new Date().toISOString(),
    dataSource: 'x_scraper',
    totalScanned: enriched.length,
    totalMentions24h: totalMentions,
    avgMentionsPerStock: Math.round(totalMentions / Math.max(enriched.length, 1)),
    top20,
    trending,
    bullish,
    bearish,
    all: enriched,
  };

  scannerCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

/**
 * Detay — istenirse on-demand canlı arama (cache'lenir).
 */
async function getMentionDetail(symbol, opts = {}) {
  const upper = symbol.toUpperCase().replace('.IS', '').replace('-USD', '');
  const forceType = opts.assetType;
  const cacheKey = `detail_${upper}_${forceType || 'auto'}`;
  const cached = detailCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DETAIL_CACHE_TTL) return cached.result;

  // Sembol tipi belirle
  let item = null;
  let isCrypto = false;
  if (forceType === 'crypto') {
    item = CRYPTO_UNIVERSE.find(c => c.symbol === upper);
    isCrypto = !!item;
  } else if (forceType === 'stock') {
    item = allBistStocks.find(s => s.symbol === upper);
  } else {
    item = CRYPTO_UNIVERSE.find(c => c.symbol === upper);
    if (item) { isCrypto = true; }
    else { item = allBistStocks.find(s => s.symbol === upper); }
  }

  if (!item) {
    return { success: false, error: 'Sembol bulunamadı', symbol: upper };
  }

  // Scraper hazır değilse açıkça hata dön
  try {
    await initScraper();
  } catch (e) {
    return {
      success: false,
      error: scraperLastError || e.message,
      symbol: upper,
      dataSource: 'x_scraper_unconfigured',
    };
  }

  let tweets = [];
  try {
    tweets = await withTimeout(
      searchSymbolTweets(item.symbol, isCrypto, MAX_TWEETS_PER_SEARCH),
      PER_SEARCH_TIMEOUT_MS + 5000,
      `search ${item.symbol}`
    );
  } catch (e) {
    return {
      success: false,
      error: `X araması başarısız: ${e.message}`,
      symbol: upper,
      dataSource: 'x_scraper_error',
    };
  }

  if (tweets.length === 0) {
    const result = {
      success: true,
      symbol: item.symbol,
      name: item.name,
      sector: isCrypto ? item.category : item.sector,
      market: isCrypto ? 'CRYPTO' : item.market,
      assetType: isCrypto ? 'crypto' : 'stock',
      ...(isCrypto ? { tier: item.tier } : {}),
      mentions24h: 0, mentions7d: 0, mentionsYesterday: 0, change24h: 0,
      sentiment: { positive: 0, negative: 0, neutral: 0 },
      topHashtags: [`#${item.symbol}`, `$${item.symbol}`],
      trendScore: 0,
      series7d: [], hourly24h: [], recentTweets: [],
      dataSource: 'x_scraper_empty',
      fetchedAt: new Date().toISOString(),
      xSearchUrl: `https://x.com/search?q=%23${item.symbol}+OR+%24${item.symbol}&src=typed_query&f=live`,
      message: 'Son 7 günde bu sembol için tweet bulunamadı.',
    };
    detailCache.set(cacheKey, { result, ts: Date.now() });
    return result;
  }

  const summary = buildSummaryFromTweets(item, tweets, isCrypto);
  const detail = buildDetailFromTweets(item, tweets, isCrypto, summary);

  // Scanner cache'ine de yaz (warmer'ı tamamlar)
  itemSummaryCache.set(item.symbol, { summary, ts: Date.now() });

  const result = {
    success: true,
    dataSource: 'x_scraper',
    fetchedAt: new Date().toISOString(),
    ...detail,
  };

  detailCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

// ─────────────────────────────────────────────────────────────────
// Background warmer — yavaş yavaş BIST30 + Top10 kripto cache'ler
// ─────────────────────────────────────────────────────────────────
let warmerTimer = null;
let warmerRunning = false;

async function runWarmerCycle() {
  if (warmerRunning) return;
  warmerRunning = true;
  const startedAt = Date.now();
  try {
    await initScraper(); // hazır değilse zaten exception atar
  } catch (e) {
    warmerRunning = false;
    console.log(`[XMentions] Warmer skip: ${e.message}`);
    return;
  }

  const queue = [
    ...bist30Stocks.map(s => ({ item: s, isCrypto: false })),
    ...TOP10_CRYPTOS.map(c => ({ item: c, isCrypto: true })),
  ];

  console.log(`[XMentions] Warmer döngüsü başlıyor (${queue.length} sembol)...`);
  let okCount = 0;
  for (const entry of queue) {
    const { item, isCrypto } = entry;
    try {
      const tweets = await withTimeout(
        searchSymbolTweets(item.symbol, isCrypto, MAX_TWEETS_PER_SEARCH),
        PER_SEARCH_TIMEOUT_MS + 5000,
        `warmer ${item.symbol}`
      );
      if (tweets.length > 0) {
        const summary = buildSummaryFromTweets(item, tweets, isCrypto);
        itemSummaryCache.set(item.symbol, { summary, ts: Date.now() });
        okCount++;
      }
    } catch (e) {
      console.warn(`[XMentions] Warmer ${item.symbol}: ${e.message?.substring(0, 60)}`);
    }
    // Scanner cache'lerini de invalidate et
    scannerCache.clear();
    await new Promise(r => setTimeout(r, WARMER_DELAY_MS));
  }

  const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[XMentions] ✓ Warmer döngüsü bitti: ${okCount}/${queue.length} sembol (${dur}sn)`);
  warmerRunning = false;
}

function startWarmer() {
  if (warmerTimer) return;
  // Server boot'tan 20 sn sonra ilk döngü, sonra periyodik
  setTimeout(() => { runWarmerCycle().catch(() => {}); }, 20 * 1000);
  warmerTimer = setInterval(() => { runWarmerCycle().catch(() => {}); }, WARMER_CYCLE_MS);
  console.log('[XMentions] Warmer schedule edildi (35dk döngü)');
}

function stopWarmer() {
  if (warmerTimer) { clearInterval(warmerTimer); warmerTimer = null; }
}

function clearCache() {
  scannerCache.clear();
  detailCache.clear();
  itemSummaryCache.clear();
}

function getStatus() {
  return {
    scraperReady,
    scraperLastError,
    warmerRunning,
    cachedSymbols: itemSummaryCache.size,
    scannerCacheKeys: scannerCache.size,
    detailCacheKeys: detailCache.size,
  };
}

module.exports = {
  scanMentions,
  getMentionDetail,
  clearCache,
  startWarmer,
  stopWarmer,
  getStatus,
};
