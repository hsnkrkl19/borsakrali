/**
 * Web Scraper Service — BORSA KRALI
 *
 * dexter (virattt/dexter) src/tools/browser/browser.ts'ten esinlendi (puppeteer yerine
 * cheerio + axios; daha hafif ve sunucu için yeterli).
 *
 * Görev: Türk finansal haber kaynaklarından RSS / HTML kazıyıp normalize etmek.
 *
 * Güvenlik:
 *  - Sadece izinli domain listesinden çekim (SSRF koruması)
 *  - 10s timeout, max 5MB response
 *  - User-Agent ve Accept header'ları net
 *  - HTML script/style/svg etiketleri çıkarılır
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { XMLParser } = require('fast-xml-parser');
const { allBistStocks } = require('../data/allBistStocks');
const { SYMBOL_TO_ID: CRYPTO_SYMBOLS } = require('./cryptoQuoteService');

const cache = new Map();

// Sembol tespit için lookup setleri (büyük harf)
const BIST_SYMBOL_SET = new Set(allBistStocks.map(s => s.symbol));
const CRYPTO_SYMBOL_SET = new Set(Object.keys(CRYPTO_SYMBOLS));

// Şirket adı → sembol map'i. Şirket isminin ilk anlamlı kelimesi (4+ harf) → sembol
// Arçelik A.Ş. → "Arçelik" → ARCLK
const NAME_TO_SYMBOL = (() => {
  const map = new Map();
  for (const s of allBistStocks) {
    if (!s.name) continue;
    // İlk kelimeyi al (T.A.Ş., A.Ş. gibi sufixler hariç)
    const cleaned = s.name.replace(/(T\.?A\.?Ş\.?|A\.?Ş\.?|Sanayi|Ticaret|Holding|Yatırım|Yatirim).*$/i, '').trim();
    const firstWord = cleaned.split(/\s+/)[0];
    if (firstWord && firstWord.length >= 4) {
      const key = firstWord.toLocaleLowerCase('tr');
      if (!map.has(key)) map.set(key, s.symbol);
    }
  }
  return map;
})();

// Yaygın kripto adları (manuel) — "Bitcoin" → "BTC" gibi
const CRYPTO_NAME_TO_SYMBOL = new Map([
  ['bitcoin', 'BTC'], ['ethereum', 'ETH'], ['solana', 'SOL'], ['cardano', 'ADA'],
  ['ripple', 'XRP'], ['dogecoin', 'DOGE'], ['polkadot', 'DOT'], ['litecoin', 'LTC'],
  ['chainlink', 'LINK'], ['avalanche', 'AVAX'], ['polygon', 'MATIC'], ['uniswap', 'UNI'],
  ['aave', 'AAVE'], ['shiba', 'SHIB'], ['cosmos', 'ATOM'], ['near', 'NEAR'],
  ['filecoin', 'FIL'], ['optimism', 'OP'], ['arbitrum', 'ARB'], ['injective', 'INJ'],
  ['celestia', 'TIA'], ['worldcoin', 'WLD'], ['toncoin', 'TON'], ['stellar', 'XLM'],
  ['algorand', 'ALGO'], ['hedera', 'HBAR'], ['tether', 'USDT'],
]);

// Haber metinlerinde geçen BIST/kripto sembollerini tespit et.
// 3-6 harfli büyük kelimeleri yakala, set'lerle eşleştir, yanlış pozitifleri filtrele.
const COMMON_FALSE_POSITIVES = new Set([
  'BU', 'DA', 'DE', 'KI', 'NE', 'VE', 'YA', 'A.Ş', 'AŞ', 'TL', 'USD', 'EUR', 'TBMM',
  'AKP', 'CHP', 'MHP', 'IYI', 'HDP', 'DEM', 'TOKİ', 'TOKI', 'ABD', 'AB', 'AKBİL',
  'ATM', 'KDV', 'ÖTV', 'TÜFE', 'ÜFE', 'GSYH', 'BIST', 'TUİK', 'TUIK', 'PMI',
  'FED', 'ECB', 'IMF', 'OPEC', 'NATO', 'BM', 'BBC', 'CNN', 'AFP', 'AA',
  'PCT', 'YT', 'PV', 'EV', 'SP', 'ETF', 'IPO', 'CEO', 'CFO', 'GBP', 'JPY',
  'XAU', 'XAG', 'YTL', 'YL', 'AY', 'AL',
  // Yaygın TR ortak isim/sıfatlar — BIST sembolüyle çakışan
  'BEYAZ', 'KARA', 'YENİ', 'YENI', 'BÜYÜK', 'BUYUK', 'KÜÇÜK', 'KUCUK',
  'GENEL', 'ÖZEL', 'OZEL', 'KAMU', 'TOPLAM', 'DEVLET', 'KENT', 'KÖY', 'KOY',
  'ANA', 'EGE', 'BATI', 'DOĞU', 'DOGU', 'KUZEY', 'GÜNEY', 'GUNEY',
  'EKO', 'BİR', 'BIR', 'İKİ', 'IKI', 'ÜÇ', 'UC', 'GÜN', 'GUN', 'YIL', 'AY',
  'KART', 'NET', 'SU', 'GAZ', 'PETROL', 'DOĞA', 'DOGA',
]);

function detectMentionedSymbols(...texts) {
  const combined = texts.filter(Boolean).join(' ');
  if (!combined) return { bist: [], crypto: [] };

  const lower = combined.toLocaleLowerCase('tr');
  const bistFound = new Set();
  const cryptoFound = new Set();

  // Pattern A: Cashtag/hashtag (en güvenilir): $BTC, #BTC, $THYAO, #THYAO
  const tagged = combined.match(/[$#]([A-Z][A-Z0-9]{1,5})\b/g) || [];
  for (const t of tagged) {
    const sym = t.slice(1).toUpperCase();
    if (BIST_SYMBOL_SET.has(sym)) bistFound.add(sym);
    if (CRYPTO_SYMBOL_SET.has(sym)) cryptoFound.add(sym);
  }

  // Pattern B: Şirket adı (Türkçe). "Arçelik" → ARCLK, "Akbank" → AKBNK
  // Word boundary ile, false positive'ler için NAME map'in kendi içinde uniqueness sağlanır
  for (const [name, sym] of NAME_TO_SYMBOL) {
    // Türkçe karakterli kelimeyi metinde ara
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(lower)) bistFound.add(sym);
  }

  // Pattern C: ALL-CAPS ardışık 3-6 harf (orijinal metinde caps yazılı)
  const allCaps = combined.match(/\b[A-Z]{3,6}\b/g) || [];
  for (const word of allCaps) {
    if (COMMON_FALSE_POSITIVES.has(word)) continue;
    if (BIST_SYMBOL_SET.has(word)) bistFound.add(word);
    if (CRYPTO_SYMBOL_SET.has(word)) cryptoFound.add(word);
  }

  // Pattern D: Kripto adı (İngilizce). "Bitcoin" → BTC, "Ethereum" → ETH
  for (const [name, sym] of CRYPTO_NAME_TO_SYMBOL) {
    const re = new RegExp(`\\b${name}\\b`, 'i');
    if (re.test(lower)) cryptoFound.add(sym);
  }

  return {
    bist: [...bistFound].slice(0, 5),
    crypto: [...cryptoFound].slice(0, 5),
  };
}
const TTL_NEWS = 5 * 60 * 1000;   // 5 dk
const TTL_PAGE = 10 * 60 * 1000;  // 10 dk

// İzinli haber kaynakları — Türk finans medyası RSS feed'leri
const NEWS_SOURCES = {
  bloomberght: {
    name: 'Bloomberg HT',
    rss: 'https://www.bloomberght.com/rss',
    favicon: 'https://www.bloomberght.com/favicon.ico',
    category: 'general',
  },
  ntv_ekonomi: {
    name: 'NTV Ekonomi',
    rss: 'https://www.ntv.com.tr/ekonomi.rss',
    favicon: 'https://www.ntv.com.tr/favicon.ico',
    category: 'general',
  },
  hurriyet_ekonomi: {
    name: 'Hürriyet Ekonomi',
    rss: 'https://www.hurriyet.com.tr/rss/ekonomi',
    favicon: 'https://www.hurriyet.com.tr/favicon.ico',
    category: 'general',
  },
  sabah_ekonomi: {
    name: 'Sabah Ekonomi',
    rss: 'https://www.sabah.com.tr/rss/ekonomi.xml',
    favicon: 'https://www.sabah.com.tr/favicon.ico',
    category: 'general',
  },
  sozcu_ekonomi: {
    name: 'Sözcü Ekonomi',
    rss: 'https://www.sozcu.com.tr/feed?cat=ekonomi',
    favicon: 'https://www.sozcu.com.tr/favicon.ico',
    category: 'general',
  },
  // Kripto
  coindesk_tr: {
    name: 'Coindesk Türkçe',
    rss: 'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml',
    favicon: 'https://www.coindesk.com/favicon.ico',
    category: 'crypto',
  },
  cointelegraph: {
    name: 'Cointelegraph',
    rss: 'https://cointelegraph.com/rss',
    favicon: 'https://cointelegraph.com/favicon.ico',
    category: 'crypto',
  },
};

// İzinli domain whitelist (extract için)
const ALLOWED_DOMAINS = new Set([
  'bloomberght.com', 'www.bloomberght.com',
  'ntv.com.tr', 'www.ntv.com.tr',
  'hurriyet.com.tr', 'www.hurriyet.com.tr',
  'sabah.com.tr', 'www.sabah.com.tr',
  'sozcu.com.tr', 'www.sozcu.com.tr',
  'coindesk.com', 'www.coindesk.com',
  'cointelegraph.com',
  'kap.org.tr', 'www.kap.org.tr',
  'borsaistanbul.com', 'www.borsaistanbul.com',
  'isyatirim.com.tr', 'www.isyatirim.com.tr',
  'mynet.com', 'finans.mynet.com', 'www.mynet.com',
  'bigpara.hurriyet.com.tr',
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '__cdata',
  parseAttributeValue: false,
});

function isAllowed(url) {
  try {
    const u = new URL(url);
    return ALLOWED_DOMAINS.has(u.hostname);
  } catch {
    return false;
  }
}

function stripCdata(text) {
  if (!text) return '';
  if (typeof text !== 'string') {
    if (text.__cdata) return text.__cdata;
    if (text['#text']) return text['#text'];
    return String(text);
  }
  return text.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').trim();
}

function cleanHTML(html) {
  if (!html) return '';
  // Kısa ve hızlı: tag'leri sıyır, fazla boşlukları azalt
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function httpGet(url) {
  return axios.get(url, {
    timeout: 12000,
    maxContentLength: 5 * 1024 * 1024,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BorsaKraliBot/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml, text/html, */*',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    validateStatus: s => s >= 200 && s < 400,
  });
}

/**
 * Tek bir RSS kaynağından haber çek.
 */
async function fetchRSS(sourceKey) {
  const src = NEWS_SOURCES[sourceKey];
  if (!src) return { success: false, error: 'Bilinmeyen kaynak: ' + sourceKey };

  const cacheKey = `rss_${sourceKey}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_NEWS) return cached.data;

  try {
    const r = await httpGet(src.rss);
    const parsed = xmlParser.parse(r.data);
    const channel = parsed?.rss?.channel || parsed?.feed;
    let items = channel?.item || channel?.entry || [];
    if (!Array.isArray(items)) items = [items];

    const news = items.slice(0, 25).map((it, idx) => {
      const title = stripCdata(it.title);
      // Link Atom format'ta {@_href: '...'}, RSS'de bazen direkt string, bazen CDATA-wrapped
      const rawLink = it.link?.['@_href'] || it.link || '';
      const link = stripCdata(rawLink);
      const pubDate = stripCdata(it.pubDate || it.published || it.updated || '');
      const description = cleanHTML(stripCdata(it.description || it.summary || it['content:encoded'] || ''));
      const author = stripCdata(it.author || it['dc:creator'] || '');
      const categoryArr = it.category;
      const categories = Array.isArray(categoryArr)
        ? categoryArr.map(stripCdata)
        : (categoryArr ? [stripCdata(categoryArr)] : []);

      const mentioned = detectMentionedSymbols(title, description);

      return {
        id: `${sourceKey}_${idx}`,
        title,
        link: typeof link === 'string' ? link : '',
        publishedAt: pubDate,
        description: description.slice(0, 300),
        author,
        categories: categories.slice(0, 3),
        source: src.name,
        sourceKey,
        sourceCategory: src.category,
        mentionedSymbols: mentioned, // { bist: [...], crypto: [...] }
      };
    }).filter(n => n.title && n.link);

    const result = {
      success: true,
      source: src.name,
      sourceKey,
      category: src.category,
      total: news.length,
      news,
      fetchedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.warn(`[Scraper] RSS hata (${sourceKey}): ${err.message?.slice(0, 80)}`);
    return { success: false, error: 'RSS çekilemedi: ' + err.message, sourceKey };
  }
}

/**
 * Birden fazla kaynaktan haber birleştir, tarihe göre sırala.
 */
async function fetchMultipleSources(category = null) {
  const keys = Object.keys(NEWS_SOURCES).filter(k => !category || NEWS_SOURCES[k].category === category);
  const results = await Promise.allSettled(keys.map(fetchRSS));
  const allNews = [];
  const sources = [];

  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value.success) {
      allNews.push(...r.value.news);
      sources.push({ key: r.value.sourceKey, name: r.value.source, count: r.value.news.length });
    }
  });

  // Tarihe göre sırala (en yeni üstte)
  allNews.sort((a, b) => {
    const dA = new Date(a.publishedAt).getTime() || 0;
    const dB = new Date(b.publishedAt).getTime() || 0;
    return dB - dA;
  });

  return {
    success: true,
    category: category || 'all',
    total: allNews.length,
    sourcesUsed: sources,
    news: allNews.slice(0, 60),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Tek bir URL'in metin içeriğini çıkar (article body).
 * Sadece ALLOWED_DOMAINS izinli (SSRF koruması).
 */
async function extractPage(url) {
  if (!isAllowed(url)) {
    return { success: false, error: 'Bu domain izinli değil', url };
  }

  const cacheKey = `page_${url}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL_PAGE) return cached.data;

  try {
    const r = await httpGet(url);
    const $ = cheerio.load(r.data);

    // İstenmeyen elementleri temizle
    $('script, style, nav, footer, header, aside, iframe, .ad, .advertisement, .share, .social').remove();

    const title = $('h1').first().text().trim() || $('title').text().trim();
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const description = $('meta[name="description"]').attr('content')
      || $('meta[property="og:description"]').attr('content') || '';

    // Article body — yaygın CSS class'ları
    const candidates = [
      'article', '.article-content', '.article-body', '.post-content',
      '.entry-content', '.story-body', '.news-detail', '#article-body',
      'main',
    ];
    let body = '';
    for (const sel of candidates) {
      const el = $(sel).first();
      if (el.length) {
        body = el.text().trim().replace(/\s+/g, ' ');
        if (body.length > 200) break;
      }
    }
    if (!body) body = $('body').text().trim().replace(/\s+/g, ' ').slice(0, 3000);

    const result = {
      success: true,
      url,
      title,
      description,
      image: ogImage,
      content: body.slice(0, 5000),
      contentLength: body.length,
      fetchedAt: new Date().toISOString(),
    };

    cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.warn(`[Scraper] Page extract hata (${url}): ${err.message?.slice(0, 80)}`);
    return { success: false, error: 'Sayfa çekilemedi: ' + err.message, url };
  }
}

function listSources() {
  return Object.entries(NEWS_SOURCES).map(([key, s]) => ({
    key,
    name: s.name,
    category: s.category,
    rss: s.rss,
  }));
}

function clearScraperCache() { cache.clear(); }

module.exports = {
  fetchRSS,
  fetchMultipleSources,
  extractPage,
  listSources,
  clearScraperCache,
  NEWS_SOURCES,
  ALLOWED_DOMAINS,
};
