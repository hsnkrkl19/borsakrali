/**
 * İş Yatırım Veri Servisi
 * Python kütüphanesi `urazakgul/isyatirimhisse`nin Node.js portu.
 *
 * Üç ana endpoint:
 *   1. HisseTekil           → hisse senedi günlük tarihsel veri
 *   2. IndexHistoricalAll   → endeks günlük tarihsel veri
 *   3. MaliTablo            → finansal tablolar (4 dönem)
 *
 * Kaynak: https://github.com/urazakgul/isyatirimhisse
 * Mevcut `backend/services/isyatirimService.js` (özel mali tablo iş mantığı)
 * kalmaya devam eder — bu modül onun yerine geçmez, yanında durur.
 */

const axios = require('axios');

const HISTORICAL_URL = 'https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/Data.aspx/HisseTekil';
const INDEX_URL      = 'https://www.isyatirim.com.tr/_Layouts/15/IsYatirim.Website/Common/ChartData.aspx/IndexHistoricalAll';
const FINANCIALS_URL = 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo';
const MAIN_PAGE      = 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
    'Referer': MAIN_PAGE,
};

// Oturum çerez önbelleği (30 dakika)
let _session = { cookie: null, ts: 0 };
const SESSION_TTL = 30 * 60 * 1000;

// Yanıt önbelleği (5 dakika)
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const FINANCIAL_GROUP_MAP = {
    '1': 'XI_29',
    '2': 'UFRS',
    '3': 'UFRS_K',
    'XI_29': 'XI_29',
    'UFRS': 'UFRS',
    'UFRS_K': 'UFRS_K',
};

async function getSessionCookie() {
    if (_session.cookie && Date.now() - _session.ts < SESSION_TTL) {
        return _session.cookie;
    }
    try {
        const resp = await axios.get(MAIN_PAGE, {
            headers: DEFAULT_HEADERS,
            timeout: 15000,
            maxRedirects: 5,
        });
        const setCookie = resp.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) {
            _session.cookie = setCookie.map(c => c.split(';')[0]).join('; ');
            _session.ts = Date.now();
        }
    } catch (_) {
        // sessizce devam — çoğu endpoint çerez gerektirmez
    }
    return _session.cookie;
}

function cacheGet(key) {
    const hit = _cache.get(key);
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
    return null;
}

function cacheSet(key, data) {
    _cache.set(key, { data, ts: Date.now() });
}

function toArray(v) {
    if (Array.isArray(v)) return v;
    if (v === undefined || v === null || v === '') return [];
    return [v];
}

function parseTrDate(d) {
    // 'dd-mm-yyyy' → Date
    const [dd, mm, yyyy] = d.split('-');
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
}

function isoToTr(iso) {
    const [yyyy, mm, dd] = iso.slice(0, 10).split('-');
    return `${dd}-${mm}-${yyyy}`;
}

function parseNumericTrDate(s) {
    // İş Yatırım stock endpoint döndürdüğü `HGDG_TARIH`: "27-01-2023"
    if (!s) return null;
    const m = String(s).match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * 1) HisseTekil — günlük hisse fiyat verisi
 * @param {string|string[]} symbols
 * @param {string} startDate 'dd-mm-yyyy'
 * @param {string} [endDate] 'dd-mm-yyyy'
 * @returns {Promise<Array>} satır başına bir gün, çoklu sembol birleştirilmiş
 */
async function fetchStockData(symbols, startDate, endDate) {
    const list = toArray(symbols).map(s => String(s).toUpperCase().trim()).filter(Boolean);
    if (!list.length) throw new Error('En az bir sembol gerekli');
    if (!startDate) throw new Error("startDate zorunlu ('dd-mm-yyyy')");
    const end = endDate || formatTrToday();

    const cookie = await getSessionCookie();

    const out = [];
    for (const sym of list) {
        const cacheKey = `stock:${sym}:${startDate}:${end}`;
        const cached = cacheGet(cacheKey);
        if (cached) { out.push(...cached); continue; }

        const url = `${HISTORICAL_URL}?hisse=${encodeURIComponent(sym)}&startdate=${startDate}&enddate=${end}`;
        try {
            const resp = await axios.get(url, {
                headers: { ...DEFAULT_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
                timeout: 25000,
            });
            const rows = resp.data?.value || [];
            const normalized = rows.map(r => ({
                symbol: sym,
                date: parseNumericTrDate(r.HGDG_TARIH) || r.HGDG_TARIH,
                close: numOrNull(r.HGDG_KAPANIS),       // düzeltilmiş kapanış
                closeRaw: numOrNull(r.HG_KAPANIS),       // ham kapanış (bedelsiz/temettü öncesi)
                high: numOrNull(r.HGDG_MAX),
                low: numOrNull(r.HGDG_MIN),
                volume: numOrNull(r.HGDG_HACIM),         // adet (düzeltilmiş)
                volumeUsd: numOrNull(r.DOLAR_HACIM),     // USD hacim
                weightedAvg: numOrNull(r.HGDG_AOF),
                marketCap: numOrNull(r.PD),
                marketCapUsd: numOrNull(r.PD_USD),
                freeFloatCap: numOrNull(r.HAO_PD),
                closeUsd: numOrNull(r.DOLAR_BAZLI_FIYAT),
                indexValue: numOrNull(r.END_DEGER),      // o gündeki BIST 100 endeks değeri
                usdRate: numOrNull(r.DD_DEGER),          // o gündeki USD/TRY
                capital: numOrNull(r.SERMAYE),
            })).sort((a, b) => (a.date < b.date ? -1 : 1));
            cacheSet(cacheKey, normalized);
            out.push(...normalized);
        } catch (e) {
            console.warn(`[IsYatirim:stock] ${sym} alınamadı: ${e.message?.substring(0, 80)}`);
        }
    }
    return out;
}

/**
 * 2) IndexHistoricalAll — endeks günlük tarihsel veri
 * @param {string|string[]} indices Ör: 'XU100', 'XU030', 'XU050', 'XBANK'
 * @param {string} startDate 'dd-mm-yyyy'
 * @param {string} [endDate] 'dd-mm-yyyy'
 * @returns {Promise<Array>}
 */
async function fetchIndexData(indices, startDate, endDate) {
    const list = toArray(indices).map(s => String(s).toUpperCase().trim()).filter(Boolean);
    if (!list.length) throw new Error('En az bir endeks gerekli');
    if (!startDate) throw new Error("startDate zorunlu ('dd-mm-yyyy')");
    const end = endDate || formatTrToday();

    const startApi = parseTrDate(startDate).toISOString().slice(0, 10).replace(/-/g, '') + '000000';
    const endApi   = parseTrDate(end).toISOString().slice(0, 10).replace(/-/g, '') + '235959';
    const cookie = await getSessionCookie();

    const out = [];
    for (const idx of list) {
        const cacheKey = `index:${idx}:${startApi}:${endApi}`;
        const cached = cacheGet(cacheKey);
        if (cached) { out.push(...cached); continue; }

        const url = `${INDEX_URL}?period=1440&from=${startApi}&to=${endApi}&endeks=${encodeURIComponent(idx)}`;
        try {
            const resp = await axios.get(url, {
                headers: { ...DEFAULT_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
                timeout: 25000,
            });
            const raw = resp.data?.data || [];
            const normalized = raw.map(pair => {
                const [ts, value] = Array.isArray(pair) ? pair : [pair?.[0], pair?.[1]];
                const d = new Date(Number(ts));
                // İş Yatırım gece yarısı UTC döndürür; Türkiye saatine +1 gün eklenir (Python ref).
                d.setUTCDate(d.getUTCDate() + 1);
                return {
                    index: idx,
                    date: d.toISOString().slice(0, 10),
                    value: numOrNull(value),
                };
            }).sort((a, b) => (a.date < b.date ? -1 : 1));
            cacheSet(cacheKey, normalized);
            out.push(...normalized);
        } catch (e) {
            console.warn(`[IsYatirim:index] ${idx} alınamadı: ${e.message?.substring(0, 80)}`);
        }
    }
    return out;
}

/**
 * 3) MaliTablo — finansal tablolar
 * @param {string|string[]} symbols
 * @param {number|string} startYear
 * @param {number|string} [endYear]  varsayılan startYear
 * @param {'TRY'|'USD'} [exchange]   varsayılan TRY
 * @param {'1'|'2'|'3'|'XI_29'|'UFRS'|'UFRS_K'} [financialGroup] varsayılan '1' (XI_29)
 * @returns {Promise<Array>} ham KALEM_KOD / KALEM_ADI satırları + dönemler
 */
async function fetchFinancials(symbols, startYear, endYear, exchange = 'TRY', financialGroup = '1') {
    const list = toArray(symbols).map(s => String(s).toUpperCase().trim()).filter(Boolean);
    if (!list.length) throw new Error('En az bir sembol gerekli');
    if (!startYear) throw new Error('startYear zorunlu');
    const sYear = parseInt(startYear, 10);
    const eYear = parseInt(endYear || startYear, 10);
    const group = FINANCIAL_GROUP_MAP[String(financialGroup)] || 'XI_29';
    const exch = (exchange === 'USD') ? 'USD' : 'TRY';

    const cookie = await getSessionCookie();

    const out = [];
    for (const sym of list) {
        for (let y = sYear; y <= eYear; y++) {
            const cacheKey = `fin:${sym}:${y}:${exch}:${group}`;
            const cached = cacheGet(cacheKey);
            if (cached) { out.push(...cached); continue; }

            const params = new URLSearchParams({
                companyCode: sym,
                exchange: exch,
                financialGroup: group,
                year1: String(y), period1: '3',
                year2: String(y), period2: '6',
                year3: String(y), period3: '9',
                year4: String(y), period4: '12',
            });

            try {
                const resp = await axios.get(`${FINANCIALS_URL}?${params.toString()}`, {
                    headers: {
                        ...DEFAULT_HEADERS,
                        ...(cookie ? { Cookie: cookie } : {}),
                    },
                    timeout: 30000,
                });
                const raw = resp.data;
                const items = raw?.d?.value || raw?.value || (Array.isArray(raw) ? raw : []);
                const rows = (items || []).map(it => ({
                    symbol: sym,
                    year: y,
                    exchange: exch,
                    financialGroup: group,
                    itemCode: it.itemCode ?? it.KALEM_KOD ?? null,
                    itemDescTr: it.itemDescTr ?? it.KALEM_ADI ?? null,
                    itemDescEng: it.itemDescEng ?? null,
                    Q1: numOrNull(it.value1 ?? it.DEGER_1),
                    Q2: numOrNull(it.value2 ?? it.DEGER_2),
                    Q3: numOrNull(it.value3 ?? it.DEGER_3),
                    Q4: numOrNull(it.value4 ?? it.DEGER_4),
                }));
                cacheSet(cacheKey, rows);
                out.push(...rows);
            } catch (e) {
                console.warn(`[IsYatirim:fin] ${sym}/${y} alınamadı: ${e.message?.substring(0, 80)}`);
            }
        }
    }
    return out;
}

function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    // İş Yatırım çoğu zaman zaten number döner, ama bazı dönüşlerde 'tr-TR' biçimli string olabilir
    const cleaned = String(v).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
}

function formatTrToday() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
}

module.exports = {
    fetchStockData,
    fetchIndexData,
    fetchFinancials,
    // dahili kullanım
    getSessionCookie,
    isoToTr,
};
