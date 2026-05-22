/**
 * X (Twitter) Mention Analyzer — BORSA KRALI
 *
 * GERÇEK X.com scraper — @the-convocation/twitter-scraper
 *  - Türkçe odaklı sorgular (lang:tr)
 *  - Gün-bazlı persistent store (.x-mentions-store.json) — 7 günlük rolling window
 *  - Zamana yayılmış job kuyruğu (12-22 sn jitter, batch sonrası mola, daily cap)
 *  - Rate-limit savunması (auto-backoff)
 *  - Mock data YOK; credentials yoksa boş cevap döner.
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
const STORE_FILE  = path.join(__dirname, '..', '..', '.x-mentions-store.json');

// ─────────────────────────────────────────────────────────────────
// Rate / volume parametreleri — X algoritmasını rahatsız etmeden çalış
// ─────────────────────────────────────────────────────────────────
const HISTORY_DAYS              = 7;                    // 7 günlük rolling window
const MAX_TWEETS_PER_DAY_SEARCH = 100;                  // her sembol+gün sorgusu max 100 tweet
const PER_SEARCH_TIMEOUT_MS     = 25 * 1000;            // her sorgu max 25 sn

const SEARCH_INTERVAL_MIN_MS    = 12 * 1000;            // sorgular arası min 12 sn
const SEARCH_INTERVAL_MAX_MS    = 22 * 1000;            // max 22 sn (jitter — sabit interval botluk gibi durur)
const BATCH_REST_AFTER_N        = 20;                   // 20 sorgu sonrası
const BATCH_REST_MS             = 3 * 60 * 1000;        //   3 dk mola
const DAILY_SEARCH_CAP          = 4000;                 // takvim gününde max sorgu — güvenli tempo doğal ~3300/gün üretir; bu yalnızca kaçak-koruma tavanı
const RATE_LIMIT_BACKOFF_MS     = 30 * 60 * 1000;       // rate-limit hatasında 30 dk dur
const QUEUE_REENQUEUE_MS        = 60 * 60 * 1000;       // 1 saatte bir queue'yu tazele
const TODAY_REFRESH_MS          = 6 * 60 * 60 * 1000;   // bugünkü günü 6 saatte 1 yenile — 549 sembollük evren güvenli tempoda ancak bu sıklıkta tam dönülür
const HISTORICAL_MAX_AGE_MS     = 6 * 24 * 60 * 60 * 1000; // geçmiş gün dosyalanmışsa 6 gün dokunma — tüm evrende re-fetch yükü kapasiteyi aşmasın
const STORE_SAVE_INTERVAL_MS    = 60 * 1000;            // dirty store her 60 sn diske

// Frontend cache TTL'leri (store hep güncel; bunlar sadece view rebuild)
const SCANNER_CACHE_TTL = 3 * 60 * 1000;
const DETAIL_CACHE_TTL  = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────
// Universe — kripto + scanner ölçeği
// ─────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────
// Sentiment sözlüğü (Türkçe öncelikli — kripto yorumcuları İngilizce kelime
// de kullanıyor diye birkaç tane EN de var)
// ─────────────────────────────────────────────────────────────────
const POSITIVE_WORDS = [
  'yükseliş','yukarı','alım','güçlü','güzel','başarı','kar','kâr','rekor','rallı','ralli',
  'breakout','momentum','olumlu','iyileşme','potansiyel','hedef','dip','fırsat','tutunma','güven',
  'kazanç','kazanır','toparlanma','sıçrama','patlama','tavan','formasyon','kırıldı','kırdı',
  'destek','birikim','long','alındı','aldım','tuttum','tut','tutucu',
  'bullish','strong','buy','green','moon','support','accumulation','rocket',
  '🚀','🟢','📈','🔥','✅','💚',
];
const NEGATIVE_WORDS = [
  'düşüş','aşağı','satış','sat','zayıf','risk','zarar','kayıp','kötü','breakdown','panik',
  'tehlike','olumsuz','dökülme','korku','dump','dipleme','crash','reddedildi',
  'taban','direnç','kırıldı destek','tabana','dipti','dipte',
  'short','satışta','satıldı','sattım','çık','çıkın','uzak dur','tuzak',
  'bearish','sell','weak','bear','rejection','liquidation','collapse','rug','red',
  '🔴','📉','⚠️','❌','💀','💔',
];

// ─────────────────────────────────────────────────────────────────
// Scraper init — singleton, lazy
// ─────────────────────────────────────────────────────────────────
let scraperInstance = null;
let scraperReady = false;
let scraperInitPromise = null;
let scraperLastError = null;

function buildCookieStrings({ authToken, ct0, guestId }) {
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

  try { return await scraperInitPromise; }
  finally { scraperInitPromise = null; }
}

// ─────────────────────────────────────────────────────────────────
// Persistent store — gün-bazlı tweet kayıt, restart sonrası ölü değil
// ─────────────────────────────────────────────────────────────────
// store yapısı:
// {
//   bySymbol: {
//     'THYAO': {
//       assetType: 'stock'|'crypto',
//       byDate: { '2026-05-13': { tweets: [...], fetchedAt: ms, complete: bool } }
//     }
//   },
//   meta: { dailyCount: { 'YYYY-MM-DD': N }, backoffUntil: 0, lastFlushAt: 0 }
// }
let store = { bySymbol: {}, meta: { dailyCount: {}, backoffUntil: 0, lastFlushAt: 0 } };
let storeDirty = false;
let storeSaveTimer = null;

function loadStoreFromDisk() {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.bySymbol && parsed.meta) {
      store = parsed;
      pruneOldDays();
      const symCount = Object.keys(store.bySymbol).length;
      console.log(`[XMentions] Store yüklendi: ${symCount} sembol`);
    }
  } catch (e) {
    console.warn('[XMentions] Store yüklenemedi:', e.message);
  }
}

function saveStoreToDisk() {
  if (!storeDirty) return;
  try {
    store.meta.lastFlushAt = Date.now();
    fs.writeFileSync(STORE_FILE, JSON.stringify(store), 'utf8');
    storeDirty = false;
  } catch (e) {
    console.warn('[XMentions] Store kaydedilemedi:', e.message);
  }
}

function startStoreSaver() {
  if (storeSaveTimer) return;
  storeSaveTimer = setInterval(saveStoreToDisk, STORE_SAVE_INTERVAL_MS);
}

function markStoreDirty() { storeDirty = true; }

function pruneOldDays() {
  // 7 günden eski günleri sil; daily counter'da 14 günden eskileri sil
  const today = new Date();
  const validDates = new Set();
  for (let d = 0; d < HISTORY_DAYS; d++) {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() - d);
    validDates.add(dateKey(dt));
  }
  for (const sym of Object.keys(store.bySymbol)) {
    const rec = store.bySymbol[sym];
    if (!rec || !rec.byDate) continue;
    for (const d of Object.keys(rec.byDate)) {
      if (!validDates.has(d)) delete rec.byDate[d];
    }
  }
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  for (const d of Object.keys(store.meta.dailyCount || {})) {
    const ts = Date.parse(d + 'T00:00:00Z');
    if (Number.isFinite(ts) && ts < cutoff) delete store.meta.dailyCount[d];
  }
  markStoreDirty();
}

function dateKey(d) { return d.toISOString().split('T')[0]; }

function mergeDayTweets(symbol, assetType, dateStr, tweets) {
  if (!store.bySymbol[symbol]) {
    store.bySymbol[symbol] = { assetType, byDate: {} };
  }
  const rec = store.bySymbol[symbol];
  rec.assetType = assetType;
  if (!rec.byDate[dateStr]) rec.byDate[dateStr] = { tweets: [], fetchedAt: 0, complete: false };
  const day = rec.byDate[dateStr];

  // ID-bazlı dedup. Tweet objesi sade tutuluyor (storage küçük kalsın diye).
  const seen = new Set(day.tweets.map(t => t.id));
  for (const tw of tweets) {
    if (!tw || !tw.id || !tw.text) continue;
    if (seen.has(tw.id)) continue;
    seen.add(tw.id);
    day.tweets.push({
      id: tw.id,
      text: tw.text,
      username: tw.username || '',
      timestamp: tw.timestamp || Math.floor(Date.now()/1000),
      likes: tw.likes || 0,
      retweets: tw.retweets || 0,
      replies: tw.replies || 0,
      hashtags: tw.hashtags || [],
      permanentUrl: tw.permanentUrl || '',
    });
  }
  day.fetchedAt = Date.now();
  day.complete = true;
  markStoreDirty();
}

function getAllTweetsForSymbol(symbol) {
  const rec = store.bySymbol[symbol];
  if (!rec || !rec.byDate) return [];
  const all = [];
  for (const d of Object.keys(rec.byDate)) {
    all.push(...(rec.byDate[d].tweets || []));
  }
  return all;
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
  const ms = (timestamp * 1000);
  return Math.max(0, Math.floor((Date.now() - ms) / 60000));
}

function randomJitterMs() {
  return SEARCH_INTERVAL_MIN_MS + Math.floor(Math.random() * (SEARCH_INTERVAL_MAX_MS - SEARCH_INTERVAL_MIN_MS));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isRateLimitError(err) {
  const msg = (err && err.message ? err.message : '').toLowerCase();
  return msg.includes('rate limit') || msg.includes('429') || msg.includes('too many') ||
         msg.includes('throttle') || msg.includes('temporarily restricted');
}

// ─────────────────────────────────────────────────────────────────
// Düşük seviye: tek sembol+tek gün için dil-aware sorgu
//   - BIST hisseleri → lang:tr (Türk yatırımcı dili)
//   - Kripto         → lang:en (global piyasa İngilizce konuşur)
// ─────────────────────────────────────────────────────────────────
function buildSearchQuery(symbol, sinceDate, untilDate, isCrypto) {
  const lang = isCrypto ? 'lang:en' : 'lang:tr';
  // Cashtag + hashtag birlikte; retweet'leri ele; parantezler X advanced
  // search'ün operator önceliklerini doğru ayrıştırması için zorunlu.
  return `($${symbol} OR #${symbol}) ${lang} since:${sinceDate} until:${untilDate} -filter:retweets`;
}

async function searchSymbolDay(symbol, dateStr, isCrypto) {
  const scraper = await initScraper();
  const next = new Date(dateStr + 'T00:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  const untilStr = dateKey(next);

  const q = buildSearchQuery(symbol, dateStr, untilStr, isCrypto);
  const tweets = [];
  const generator = scraper.searchTweets(q, MAX_TWEETS_PER_DAY_SEARCH, ScraperLib.SearchMode?.Latest);
  const deadline = Date.now() + PER_SEARCH_TIMEOUT_MS;

  try {
    for await (const tw of generator) {
      if (Date.now() > deadline) break;
      if (!tw || !tw.text) continue;
      tweets.push(tw);
      if (tweets.length >= MAX_TWEETS_PER_DAY_SEARCH) break;
    }
  } catch (e) {
    if (isRateLimitError(e)) {
      store.meta.backoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      markStoreDirty();
      console.warn(`[XMentions] Rate-limit tetiklendi → ${RATE_LIMIT_BACKOFF_MS/60000} dk backoff`);
      throw e;
    }
    console.warn(`[XMentions] ${symbol}@${dateStr} arama hatası: ${e.message?.substring(0, 80)}`);
  }
  return tweets;
}

// ─────────────────────────────────────────────────────────────────
// Summary + Detail — store'daki tweet'lerden üret
// ─────────────────────────────────────────────────────────────────
function buildSummaryFromTweets(item, tweets, isCrypto) {
  const now = Date.now();
  const day1Ms = 24 * 60 * 60 * 1000;
  const t24 = tweets.filter(t => (now - t.timestamp*1000) <= day1Ms);
  const tYesterday = tweets.filter(t => {
    const age = now - t.timestamp*1000;
    return age > day1Ms && age <= 2*day1Ms;
  });
  const t7d = tweets;

  const mentions24h        = t24.length;
  const mentionsYesterday  = tYesterday.length;
  const mentions7d         = t7d.length;
  const change24h = mentionsYesterday > 0
    ? +(((mentions24h - mentionsYesterday) / mentionsYesterday) * 100).toFixed(1)
    : (mentions24h > 0 ? 100 : 0);

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

function buildDetailFromTweets(item, tweets, isCrypto, summary) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

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
    series.push({ date: dateStr, mentions: dayTweets.length, positive: pos, negative: neg });
  }

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
// Public — scanner & detay
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
const scannerCache = new Map();
const detailCache  = new Map();

function scanMentions(scope = 'bist100') {
  const cacheKey = `scan_${scope}`;
  const cached = scannerCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SCANNER_CACHE_TTL) return cached.result;

  const isCrypto = CRYPTO_SCOPES.has(scope);
  const items = getStockList(scope);

  const enriched = [];
  const pending = [];
  for (const it of items) {
    const tweets = getAllTweetsForSymbol(it.symbol);
    if (tweets.length === 0) {
      pending.push(it.symbol);
      enqueueSymbolBackfill(it, isCrypto, /*highPriority*/ false, /*deferSort*/ true);
      continue;
    }
    enriched.push(buildSummaryFromTweets(it, tweets, isCrypto));
  }

  // Auto-enqueue yapıldıysa kuyruğu tek sefer sırala + drainer'ı tetikle
  if (pending.length > 0) {
    jobQueue.sort((a, b) => b.priority - a.priority);
    if (!drainerRunning && Date.now() >= store.meta.backoffUntil) {
      runDrainer().catch(err => console.warn('[XMentions] Drainer trigger error:', err.message));
    }
  }

  const totalItems = items.length;
  const pendingCount = pending.length;

  if (enriched.length === 0) {
    const result = {
      success: true,
      scope,
      assetType: isCrypto ? 'crypto' : 'stock',
      scannedAt: new Date().toISOString(),
      dataSource: scraperReady ? 'x_scraper_warming' : 'x_scraper_unconfigured',
      message: scraperReady
        ? `Veri toplanıyor (${pendingCount}/${totalItems} sembol kuyrukta). Birkaç dakika sonra tekrar yükleyin.`
        : (scraperLastError || 'X credentials yapılandırılmadı.'),
      totalScanned: 0,
      totalItems,
      pendingCount,
      totalMentions24h: 0, avgMentionsPerStock: 0,
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
    dataSource: pendingCount > 0 ? 'x_scraper_partial' : 'x_scraper',
    totalScanned: enriched.length,
    totalItems,
    pendingCount,
    totalMentions24h: totalMentions,
    avgMentionsPerStock: Math.round(totalMentions / Math.max(enriched.length, 1)),
    top20, trending, bullish, bearish, all: enriched,
  };

  scannerCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

async function getMentionDetail(symbol, opts = {}) {
  const upper = symbol.toUpperCase().replace('.IS', '').replace('-USD', '');
  const forceType = opts.assetType;
  const cacheKey = `detail_${upper}_${forceType || 'auto'}`;
  const cached = detailCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DETAIL_CACHE_TTL) return cached.result;

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

  // Scraper hazır mı?
  try { await initScraper(); }
  catch (e) {
    return {
      success: false,
      error: scraperLastError || e.message,
      symbol: upper,
      dataSource: 'x_scraper_unconfigured',
    };
  }

  // Store'da varsa: oradan dön. Yoksa: bu sembolün 7 gününü yüksek-öncelikli olarak kuyruğa al.
  let tweets = getAllTweetsForSymbol(item.symbol);

  // Eğer hiç veri yoksa, "warming" cevabı dönüp arka planda doldurmaya başla.
  if (tweets.length === 0) {
    enqueueSymbolBackfill(item, isCrypto, /*highPriority*/ true);
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
      dataSource: 'x_scraper_warming',
      fetchedAt: new Date().toISOString(),
      xSearchUrl: `https://x.com/search?q=%23${item.symbol}+OR+%24${item.symbol}&src=typed_query&f=live`,
      message: 'Sembol kuyruğa alındı; veri toplanıyor. Birkaç dakika sonra tekrar yükleyin.',
    };
    detailCache.set(cacheKey, { result, ts: Date.now() });
    return result;
  }

  const summary = buildSummaryFromTweets(item, tweets, isCrypto);
  const detail = buildDetailFromTweets(item, tweets, isCrypto, summary);

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
// Job queue + drainer — zamana yayılmış arka plan tarayıcı
// ─────────────────────────────────────────────────────────────────
let jobQueue = []; // {symbol, isCrypto, item, date, priority, addedAt}
let drainerRunning = false;
let drainerSinceRest = 0;

function needsFetch(symbol, dateStr) {
  const rec = store.bySymbol[symbol];
  if (!rec || !rec.byDate || !rec.byDate[dateStr]) return true;
  const day = rec.byDate[dateStr];
  const todayKey = dateKey(new Date());
  if (dateStr === todayKey) {
    return (Date.now() - day.fetchedAt) > TODAY_REFRESH_MS;
  }
  if (!day.complete) return true;
  return (Date.now() - day.fetchedAt) > HISTORICAL_MAX_AGE_MS;
}

// Backoff + günlük cap altında kuyruk birikebilir; sınırsız büyümeyi engelle.
// Tüm evren (~549 sembol × 7 gün ≈ 3850 job) rahat sığsın diye geniş tutuldu.
const MAX_QUEUE_SIZE = 8000;
let queueOverflowLogged = false;

function enqueueIfNeeded(item, isCrypto, dateStr, priority = 0) {
  if (!needsFetch(item.symbol, dateStr)) return false;
  // Aynı job zaten kuyruktaysa skip
  for (const j of jobQueue) {
    if (j.symbol === item.symbol && j.date === dateStr) return false;
  }
  if (jobQueue.length >= MAX_QUEUE_SIZE) {
    if (!queueOverflowLogged) {
      console.warn(`[XMentions] Kuyruk sınırı doldu (${MAX_QUEUE_SIZE}) — yeni jobları reddet`);
      queueOverflowLogged = true;
    }
    return false;
  }
  if (queueOverflowLogged && jobQueue.length < MAX_QUEUE_SIZE * 0.5) {
    queueOverflowLogged = false; // sınır altına düştü, tekrar log'a izin ver
  }
  jobQueue.push({
    symbol: item.symbol,
    isCrypto,
    item,
    date: dateStr,
    priority,
    addedAt: Date.now(),
  });
  return true;
}

function enqueueSymbolBackfill(item, isCrypto, highPriority = false, deferSort = false) {
  const today = new Date();
  let added = 0;
  for (let d = 0; d < HISTORY_DAYS; d++) {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() - d);
    const dateStr = dateKey(dt);
    // Bugünkü gün ve dün yüksek öncelikli — kullanıcı en çok onları görür.
    const prio = (d === 0 ? 3 : d === 1 ? 2 : 1) + (highPriority ? 5 : 0);
    if (enqueueIfNeeded(item, isCrypto, dateStr, prio)) added++;
  }
  // deferSort: 500+ sembollük toplu çağrılarda her sembolde sort etmek event-loop'u
  // bloklar — çağıran taraf döngü bitince tek sefer sıralar.
  if (!deferSort) jobQueue.sort((a, b) => b.priority - a.priority);
  return added;
}

function enqueueWarmerCycle() {
  // Tüm evren: 510 BIST hissesi + tüm kripto. Alt-küme yok — her sembol
  // sürekli rolling olarak taranır (öncelik sırası: bugün > dün > geçmiş).
  const universe = [
    ...allBistStocks.map(s => ({ item: s, isCrypto: false })),
    ...CRYPTO_UNIVERSE.map(c => ({ item: c, isCrypto: true })),
  ];
  let added = 0;
  for (const u of universe) {
    added += enqueueSymbolBackfill(u.item, u.isCrypto, false, /*deferSort*/ true);
  }
  if (added > 0) {
    jobQueue.sort((a, b) => b.priority - a.priority);
    console.log(`[XMentions] Kuyruğa ${added} yeni gün-job eklendi (toplam: ${jobQueue.length}, evren: ${universe.length} sembol)`);
  }
}

function todayDailyCount() {
  const k = dateKey(new Date());
  return store.meta.dailyCount[k] || 0;
}
function bumpDailyCount() {
  const k = dateKey(new Date());
  store.meta.dailyCount[k] = (store.meta.dailyCount[k] || 0) + 1;
  markStoreDirty();
}

async function runDrainer() {
  if (drainerRunning) return;
  drainerRunning = true;
  try {
    await initScraper();
  } catch (e) {
    drainerRunning = false;
    console.log(`[XMentions] Drainer skip: ${e.message}`);
    return;
  }

  while (jobQueue.length > 0) {
    // Backoff aktif mi?
    if (Date.now() < store.meta.backoffUntil) {
      const wait = Math.min(60_000, store.meta.backoffUntil - Date.now());
      await sleep(wait);
      continue;
    }
    // Günlük cap?
    if (todayDailyCount() >= DAILY_SEARCH_CAP) {
      console.log(`[XMentions] Günlük cap (${DAILY_SEARCH_CAP}) doldu — 30 dk dur`);
      await sleep(30 * 60 * 1000);
      continue;
    }

    const job = jobQueue.shift();
    // Job stale mi? — Bir saatten fazla kuyrukta bekleyip durumu değişmiş olabilir.
    if (!needsFetch(job.symbol, job.date)) continue;

    try {
      const tweets = await withTimeout(
        searchSymbolDay(job.symbol, job.date, job.isCrypto),
        PER_SEARCH_TIMEOUT_MS + 5000,
        `drain ${job.symbol}@${job.date}`
      );
      mergeDayTweets(job.symbol, job.isCrypto ? 'crypto' : 'stock', job.date, tweets);
      bumpDailyCount();
      drainerSinceRest++;
      console.log(`[XMentions] ${job.symbol} ${job.date}: ${tweets.length} tweet (gün-job kalan: ${jobQueue.length})`);
      // Scanner cache'i her job'da temizlemiyoruz — TTL ile yenilensin. Aksi halde
      // 24h rolling window her API çağrısında yeniden hesaplanır ve sıralama
      // sürekli oynar. Detay cache'i ise lokal bir sembolün taze gelmiş tweetleri
      // dönsün diye temizliyoruz.
      detailCache.delete(`detail_${job.symbol}_auto`);
      detailCache.delete(`detail_${job.symbol}_${job.isCrypto ? 'crypto' : 'stock'}`);
    } catch (e) {
      // Rate-limit ise backoff zaten searchSymbolDay içinde set edildi; yumuşak hatalarda devam.
      if (isRateLimitError(e)) {
        // Job'u geri at — backoff sonrası tekrar denenir
        jobQueue.unshift(job);
      } else {
        // Geri konmazsa ölü bir günü sürekli denemeyiz; gelecek cycle yeniden enqueue eder
      }
    }

    // Jitter + periyodik mola
    if (drainerSinceRest >= BATCH_REST_AFTER_N) {
      console.log(`[XMentions] ${BATCH_REST_AFTER_N} sorgu sonrası ${BATCH_REST_MS/60000} dk mola`);
      await sleep(BATCH_REST_MS);
      drainerSinceRest = 0;
    } else {
      await sleep(randomJitterMs());
    }
  }
  drainerRunning = false;
}

// Public alias — eski API "startWarmer" ile uyumlu kal
let scheduleTimer = null;
let initialKickTimer = null;

function startWarmer() {
  if (scheduleTimer) return;
  loadStoreFromDisk();
  startStoreSaver();

  // İlk kick — 25 sn sonra (scraper init için zaman tanı)
  initialKickTimer = setTimeout(() => {
    enqueueWarmerCycle();
    runDrainer().catch(err => console.warn('[XMentions] Drainer error:', err.message));
  }, 25 * 1000);

  // Periyodik re-enqueue — bugünki günü taze tut, dropped job'ları geri ekle
  scheduleTimer = setInterval(() => {
    enqueueWarmerCycle();
    if (!drainerRunning) runDrainer().catch(err => console.warn('[XMentions] Drainer error:', err.message));
  }, QUEUE_REENQUEUE_MS);

  console.log(`[XMentions] Scheduler aktif (re-enqueue: ${QUEUE_REENQUEUE_MS/60000}dk, jitter: ${SEARCH_INTERVAL_MIN_MS/1000}-${SEARCH_INTERVAL_MAX_MS/1000}sn, daily cap: ${DAILY_SEARCH_CAP})`);
}

function stopWarmer() {
  if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null; }
  if (initialKickTimer) { clearTimeout(initialKickTimer); initialKickTimer = null; }
  if (storeSaveTimer) { clearInterval(storeSaveTimer); storeSaveTimer = null; }
  saveStoreToDisk();
}

function clearCache() {
  scannerCache.clear();
  detailCache.clear();
}

function getStatus() {
  const todayKey = dateKey(new Date());
  const symbols = Object.keys(store.bySymbol);
  let totalTweets = 0;
  for (const s of symbols) {
    totalTweets += getAllTweetsForSymbol(s).length;
  }
  return {
    scraperReady,
    scraperLastError,
    storeSymbols: symbols.length,
    storeTotalTweets: totalTweets,
    queueDepth: jobQueue.length,
    drainerRunning,
    backoffActive: Date.now() < store.meta.backoffUntil,
    backoffUntil: store.meta.backoffUntil
      ? new Date(store.meta.backoffUntil).toISOString() : null,
    dailySearchCount: store.meta.dailyCount[todayKey] || 0,
    dailySearchCap: DAILY_SEARCH_CAP,
    scannerCacheKeys: scannerCache.size,
    detailCacheKeys: detailCache.size,
    lastFlushAt: store.meta.lastFlushAt
      ? new Date(store.meta.lastFlushAt).toISOString() : null,
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
