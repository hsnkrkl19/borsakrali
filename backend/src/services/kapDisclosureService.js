/**
 * KAP Disclosure Service — BORSA KRALI
 *
 * Strateji:
 *  1) Önce gerçek KAP API'si (kap.org.tr/tr/api/disclosures?lastDisclosureIndex=...)
 *     denenir. KAP Akamai/bot koruması nedeniyle çoğu zaman 666/523 verir.
 *  2) Başarısızsa, webScraperService'in canlı çektiği TÜRK EKONOMİ RSS feed'lerinden
 *     (Bloomberg HT, NTV Ekonomi, Hürriyet Ekonomi, Sabah Ekonomi, Sözcü Ekonomi)
 *     hisse-mention tabanlı GERÇEK haberler döndürülür. webScraperService zaten
 *     `detectMentionedSymbols` ile haberlerde geçen BIST sembollerini etiketliyor.
 *
 * Veritabanı YOK — sadece in-memory cache.
 * Asla uydurma/sentetik haber üretilmez. Hiçbir kaynak veri vermezse boş döner
 * + reason string'i (UI bunu açıkça gösterir).
 */

const axios = require('axios');
const webScraperService = require('./webScraperService');

const KAP_API_URL = 'https://www.kap.org.tr/tr/api/disclosures';
const TTL = 5 * 60 * 1000;
const cache = new Map();

const POSITIVE_WORDS = [
  'artış', 'yükseliş', 'büyüme', 'kâr', 'kar dağıtım', 'temettü', 'rekor',
  'başarı', 'gelişme', 'olumlu', 'pozitif', 'iyileşme', 'güçlü', 'kazanç',
  'ihale kazan', 'yatırım', 'sözleşme', 'satın alma', 'birleşme', 'bedelsiz',
  'patent', 'ödül', 'sertifika', 'genişle', 'açıldı', 'tamamlandı',
];
const NEGATIVE_WORDS = [
  'düşüş', 'azalma', 'zarar', 'kayıp', 'olumsuz', 'negatif',
  'risk', 'tehlike', 'kriz', 'sorun', 'zayıf', 'düşük',
  'iflas', 'tasfiye', 'cezai', 'ceza', 'soruşturma', 'iptal', 'fesih',
  'gerileme', 'kapatıldı', 'durduruldu', 'erteleme',
];

function analyzeSentiment(text) {
  if (!text) return { sentiment: 'neutral', score: 0.5 };
  const lower = text.toLocaleLowerCase('tr');
  let pos = 0, neg = 0;
  POSITIVE_WORDS.forEach(w => { const m = lower.match(new RegExp(w, 'g')); if (m) pos += m.length; });
  NEGATIVE_WORDS.forEach(w => { const m = lower.match(new RegExp(w, 'g')); if (m) neg += m.length; });
  const total = pos + neg;
  if (total === 0) return { sentiment: 'neutral', score: 0.5 };
  const ratio = (pos - neg) / total;
  let sentiment = 'neutral';
  if (ratio > 0.2) sentiment = 'positive';
  else if (ratio < -0.2) sentiment = 'negative';
  return { sentiment, score: 0.5 + ratio / 2 }; // 0..1
}

// ─── 1) KAP doğrudan API denemesi ────────────────────────────────────────────
async function tryKapApi() {
  try {
    const r = await axios.get(KAP_API_URL, {
      params: { lastDisclosureIndex: 0 },
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Referer': 'https://www.kap.org.tr/tr/',
        'Origin': 'https://www.kap.org.tr',
      },
      validateStatus: s => s >= 200 && s < 400,
    });

    // Bazen HTTP 200 dönmesine rağmen HTML hata sayfası gelir
    if (typeof r.data === 'string' && r.data.includes('<html')) {
      return null;
    }

    const rows = Array.isArray(r.data) ? r.data : (r.data?.data || []);
    if (!Array.isArray(rows) || rows.length === 0) return null;

    return rows.map(d => {
      const stockArr = Array.isArray(d.stockCodes) ? d.stockCodes
        : typeof d.stockCodes === 'string' ? d.stockCodes.split(/[,;\s]+/).filter(Boolean)
        : [];
      const stockSym = stockArr[0] || null;
      const title = d.subject || d.title || '';
      const summary = d.summary || title;
      const sa = analyzeSentiment(`${title} ${summary}`);
      const id = d.disclosureIndex || d.id;

      return {
        id: String(id || ''),
        stockSymbol: stockSym,
        stockSymbols: stockArr,
        title,
        summary,
        category: d.disclosureCategory || null,
        sentiment: sa.sentiment,
        sentimentScore: +sa.score.toFixed(2),
        publishDate: d.publishDate ? new Date(d.publishDate).toISOString() : new Date().toISOString(),
        url: id ? `https://www.kap.org.tr/tr/Bildirim/${id}` : 'https://www.kap.org.tr/tr/',
        source: 'KAP',
      };
    });
  } catch (err) {
    return null;
  }
}

// ─── 2) RSS fallback — webScraperService'in mevcut feed'lerinden ──────────────
async function fetchFromRssFeeds() {
  try {
    const result = await webScraperService.fetchMultipleSources('general');
    if (!result.success || !result.news?.length) return [];

    return result.news
      .filter(n => n.mentionedSymbols?.bist?.length > 0) // sadece bir BIST hissesi geçen haberler
      .map(n => {
        const stockSyms = n.mentionedSymbols.bist;
        const sa = analyzeSentiment(`${n.title} ${n.description}`);
        return {
          id: n.id,
          stockSymbol: stockSyms[0],
          stockSymbols: stockSyms,
          title: n.title,
          summary: n.description || n.title,
          category: 'haber',
          sentiment: sa.sentiment,
          sentimentScore: +sa.score.toFixed(2),
          publishDate: n.publishedAt ? (() => {
            const d = new Date(n.publishedAt);
            return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
          })() : new Date().toISOString(),
          url: n.link,
          source: n.source, // "Bloomberg HT", "NTV Ekonomi" gibi
        };
      });
  } catch (err) {
    console.warn('[KAP-RSS] Fallback hata:', err.message?.slice(0, 100));
    return [];
  }
}

/**
 * Bildirimleri çek (KAP API → RSS fallback).
 */
async function fetchDisclosures(opts = {}) {
  const days = opts.days || 7;
  const stockSymbol = opts.stockSymbol ? opts.stockSymbol.toUpperCase() : null;

  const cacheKey = `kap_${days}_${stockSymbol || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  // 1) KAP API
  let items = await tryKapApi();
  let dataSource = 'KAP API (kap.org.tr)';

  // 2) Fallback: RSS feed'leri
  if (!items || items.length === 0) {
    items = await fetchFromRssFeeds();
    dataSource = 'TR Ekonomi RSS (Bloomberg HT, NTV, Hürriyet, Sabah, Sözcü) — KAP API botbloklu';
  }

  if (!items || items.length === 0) {
    const empty = {
      success: false,
      items: [], total: 0,
      error: 'Ne KAP API ne de RSS feed\'lerinden gerçek veri alınamadı.',
      lastUpdate: new Date().toISOString(),
      source: dataSource,
    };
    return empty;
  }

  // Tarih cutoff: son N gün
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let filtered = items.filter(it => {
    const t = new Date(it.publishDate).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });

  // Sembol filtresi
  if (stockSymbol) {
    filtered = filtered.filter(it =>
      it.stockSymbol === stockSymbol ||
      (it.stockSymbols && it.stockSymbols.includes(stockSymbol))
    );
  }

  // Tarihe göre sırala (yeni → eski)
  filtered.sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));

  const result = {
    success: true,
    items: filtered,
    total: filtered.length,
    lastUpdate: new Date().toISOString(),
    source: dataSource,
  };
  cache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

/**
 * Anomali tespiti — son 7 günde haber yoğunluğu yüksek hisseler.
 * GERÇEK haber sayısından hesaplanır.
 */
async function detectAnomalies({ days = 7, threshold = 2 } = {}) {
  const cacheKey = `kap_anomaly_${days}_${threshold}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  const recent = await fetchDisclosures({ days, pageSize: 200 });
  if (!recent.success) {
    return { success: false, items: [], error: recent.error };
  }

  // Hisse başına haber sayısı + sentiment
  const byStock = {};
  recent.items.forEach(it => {
    if (!it.stockSymbol) return;
    if (!byStock[it.stockSymbol]) {
      byStock[it.stockSymbol] = { count: 0, positive: 0, negative: 0, neutral: 0 };
    }
    byStock[it.stockSymbol].count++;
    byStock[it.stockSymbol][it.sentiment]++;
  });

  // BIST evrenindeki ortalama haber sayısı (taban)
  const avgCount = Object.values(byStock).reduce((s, v) => s + v.count, 0) / Math.max(1, Object.keys(byStock).length);

  const anomalies = Object.entries(byStock)
    .filter(([_, v]) => v.count >= threshold)
    .map(([symbol, v]) => {
      const ratio = avgCount > 0 ? v.count / avgCount : 1;
      const positivePct = v.count ? +((v.positive / v.count) * 100).toFixed(1) : 0;
      const score = Math.min(1, Math.max(0, (ratio - 1) / 2));
      return {
        symbol,
        newsCount: v.count,
        avgNewsCount: +avgCount.toFixed(1),
        anomalyScore: +score.toFixed(2),
        ratio: +ratio.toFixed(2),
        positivePct,
        positiveCount: v.positive,
        negativeCount: v.negative,
        status: ratio >= 3 ? 'high' : ratio >= 1.5 ? 'medium' : 'low',
      };
    })
    .filter(a => a.ratio >= 1.2) // sadece anlamlı sapma
    .sort((a, b) => b.newsCount - a.newsCount)
    .slice(0, 20);

  const result = {
    success: true,
    items: anomalies,
    total: anomalies.length,
    days,
    lastUpdate: new Date().toISOString(),
    source: recent.source,
  };
  cache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

function clearCache() { cache.clear(); }

module.exports = {
  fetchDisclosures,
  detectAnomalies,
  analyzeSentiment,
  clearCache,
};
