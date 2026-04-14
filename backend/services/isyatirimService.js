/**
 * İş Yatırım Mali Tablo Servisi
 * isyatirim.com.tr üzerinden BIST şirketlerinin gerçek finansal verilerini çeker
 * Türkiye'den erişilebilir - Oturum çerezi yönetimi ile
 * Per.Tgm. Hasan KIRKIL
 */

const axios = require('axios');

const BASE_URL = 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx';
const MAIN_PAGE = 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse';

// Oturum çerez önbelleği (30 dakika)
let _session = { cookie: null, ts: 0 };
const SESSION_TTL = 30 * 60 * 1000;

async function getSessionCookie() {
    if (_session.cookie && Date.now() - _session.ts < SESSION_TTL) {
        return _session.cookie;
    }
    try {
        const resp = await axios.get(MAIN_PAGE, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            },
            timeout: 15000,
            maxRedirects: 5,
        });
        const setCookie = resp.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) {
            _session.cookie = setCookie.map(c => c.split(';')[0]).join('; ');
            _session.ts = Date.now();
            console.log('[IsYatirim] ✅ Oturum çerezi alındı');
        }
    } catch (e) {
        console.warn('[IsYatirim] Çerez alınamadı:', e.message?.substring(0, 80));
    }
    return _session.cookie;
}

function buildHeaders(cookie) {
    const h = {
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://www.isyatirim.com.tr',
        'Referer': 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
    };
    if (cookie) h['Cookie'] = cookie;
    return h;
}

// Son N çeyrek dönemleri döndürür (geriden sayarak)
function getRecentQuarters(count = 4) {
    const quarterMonths = [3, 6, 9, 12];
    const now = new Date();
    let year = now.getFullYear();
    let qi = Math.floor(now.getMonth() / 3) - 1; // bir önceki çeyrek (yayınlanmış olabilir)
    if (qi < 0) { qi = 3; year--; }

    const periods = [];
    for (let i = 0; i < count; i++) {
        periods.push({ year, period: quarterMonths[qi] });
        qi--;
        if (qi < 0) { qi = 3; year--; }
    }
    return periods;
}

// Son N yıllık dönem (Aralık)
function getRecentYears(count = 4) {
    const now = new Date();
    const baseYear = now.getMonth() >= 3 ? now.getFullYear() - 1 : now.getFullYear() - 2;
    return Array.from({ length: count }, (_, i) => ({ year: baseYear - i, period: 12 }));
}

// isyatirim API'den ham veri çek
async function fetchIsYatirimRaw(symbol, periods, financialGroup = 'XI_29') {
    const p = periods.slice(0, 4); // maksimum 4 dönem
    const body = {
        companyCode: symbol.toUpperCase(),
        exchange: 'TRY',
        financialGroup,
        year1: p[0]?.year, period1: p[0]?.period,
        year2: p[1]?.year, period2: p[1]?.period,
        year3: p[2]?.year, period3: p[2]?.period,
        year4: p[3]?.year, period4: p[3]?.period,
    };

    const cookie = await getSessionCookie();
    const headers = buildHeaders(cookie);

    const response = await axios.post(`${BASE_URL}/MaliTablo`, body, {
        headers,
        timeout: 25000
    });

    // API response yapısı: { d: { value: [...] } } veya direkt array
    const raw = response.data;
    const items = raw?.d?.value || raw?.value || (Array.isArray(raw) ? raw : null);
    if (!items || !Array.isArray(items) || items.length === 0) return null;
    return { items, periods: p };
}

// Türkçe KALEM_ADI'na göre değer bul (esnekli arama)
function findValue(items, namePatterns, periodIdx = 0) {
    const key = `DEGER_${periodIdx + 1}`;
    for (const pattern of namePatterns) {
        const found = items.find(item => {
            const name = (item.KALEM_ADI || '').toLowerCase().replace(/\s+/g, ' ').trim();
            if (typeof pattern === 'string') {
                return name.includes(pattern.toLowerCase());
            } else if (pattern instanceof RegExp) {
                return pattern.test(name);
            }
            return false;
        });
        if (found) {
            const val = found[key];
            if (val !== null && val !== undefined && val !== '') {
                const num = parseFloat(String(val).replace(/\./g, '').replace(',', '.'));
                return isNaN(num) ? 0 : num;
            }
        }
    }
    return 0;
}

// Bilanço verilerini dönüştür
function transformBalanceSheet(raw) {
    if (!raw) return [];
    const { items, periods } = raw;
    const K = 1000;

    return periods.map((p, idx) => {
        const g = (patterns) => findValue(items, patterns, idx);

        const totalAssets        = g(['toplam varlık', 'toplam aktif', 'varlıklar toplamı', 'i+ii. toplam varlık']);
        const totalCurrentAssets = g(['dönen varlık toplamı', 'toplam dönen varlık', 'dönen varlıklar toplamı', 'i- dönen varlıklar', 'i.dönen varlıklar']);
        const totalLiab          = g(['toplam yükümlülük', 'yükümlülükler toplamı', 'toplam borç ve yükümlülük', 'toplam kaynak']);
        const totalCurrentLiab   = g(['kısa vadeli yükümlülük toplamı', 'toplam kısa vadeli yükümlülük', 'kısa vadeli yükümlülükler toplamı', 'iii- kısa vadeli yükümlülükler']);
        const totalEquity        = g(['toplam özkaynak', 'özkaynaklar toplamı', 'ana ortaklığa ait özkaynaklar', 'özkaynak toplamı', 'v- özkaynaklar']);
        const cash               = g(['nakit ve nakit benzeri', 'nakit ve nakite eşdeğer', 'nakit ve nakit eşdeğer', 'nakit ve nakit benzerleri']);
        const shortTermInv       = g(['kısa vadeli finansal yatırım', 'finansal yatırımlar (kısa)', 'kısa vadeli yatırım']);
        const tradeRec           = g(['ticari alacak', 'alıcılar', 'ticaret alacakları', 'ticari alacaklar (kısa)']);
        const inventory          = g(['stok', 'envanter', 'stoklar']);
        const otherCurrentAssets = g(['diğer dönen varlık', 'diğer kısa vadeli', 'diğer dönen varlıklar']);
        const ppe                = g(['maddi duran varlık', 'mülk, tesis ve ekipman', 'gayrimenkul, tesis', 'maddi duran varlıklar']);
        const intangible         = g(['maddi olmayan duran varlık', 'soyut duran varlık', 'maddi olmayan duran varlıklar']);
        const goodwill           = g(['şerefiye', 'goodwill', 'peştemallık']);
        const longTermInv        = g(['uzun vadeli finansal yatırım', 'finansal yatırımlar (uzun)']);
        const shortTermDebt      = g(['kısa vadeli finansal borç', 'kısa vadeli borçlanma', 'kısa vadeli kredi', 'kısa vadeli banka kredileri']);
        const tradePayables      = g(['ticari borç', 'satıcılar', 'ticaret borçları', 'ticari borçlar']);
        const longTermDebt       = g(['uzun vadeli finansal borç', 'uzun vadeli borçlanma', 'uzun vadeli kredi', 'uzun vadeli banka kredileri']);
        const retainedEarnings   = g(['birikmiş kâr', 'geçmiş yıllar kâr', 'geçmiş yıllar karları', 'geçmiş yıllar kârları']);
        const paidInCapital      = g(['ödenmiş sermaye', 'sermaye', /^sermaye$/]);

        const year = p.year;
        const month = p.period;
        const periodLabel = month === 12 ? `${year}` : `${year}/${String(month).padStart(2, '0')}`;

        return {
            period: periodLabel,
            year,
            date: `${year}-${String(month).padStart(2, '0')}-01`,
            assets: {
                currentAssets: {
                    total: Math.round(totalCurrentAssets / K),
                    cashAndCashEquivalents: Math.round(cash / K),
                    shortTermFinancialInvestments: Math.round(shortTermInv / K),
                    tradeReceivables: Math.round(tradeRec / K),
                    inventories: Math.round(inventory / K),
                    otherCurrentAssets: Math.round(otherCurrentAssets / K),
                },
                nonCurrentAssets: {
                    total: Math.round((totalAssets - totalCurrentAssets) / K),
                    tangibleAssets: Math.round(ppe / K),
                    intangibleAssets: Math.round(intangible / K),
                    goodwill: Math.round(goodwill / K),
                    longTermFinancialInvestments: Math.round(longTermInv / K),
                },
                total: Math.round(totalAssets / K),
            },
            liabilities: {
                currentLiabilities: {
                    total: Math.round(totalCurrentLiab / K),
                    shortTermBorrowings: Math.round(shortTermDebt / K),
                    tradePayables: Math.round(tradePayables / K),
                },
                nonCurrentLiabilities: {
                    total: Math.round((totalLiab - totalCurrentLiab) / K),
                    longTermBorrowings: Math.round(longTermDebt / K),
                },
                total: Math.round(totalLiab / K),
            },
            equity: {
                total: Math.round(totalEquity / K),
                paidInCapital: Math.round(paidInCapital / K),
                retainedEarnings: Math.round(retainedEarnings / K),
            },
        };
    }).filter(d => d.assets.total > 0 || d.equity.total > 0);
}

// Gelir Tablosunu dönüştür
function transformIncomeStatement(raw) {
    if (!raw) return [];
    const { items, periods } = raw;
    const K = 1000;

    return periods.map((p, idx) => {
        const g = (patterns) => findValue(items, patterns, idx);

        const revenue          = g(['hasılat', 'satış geliri', 'net satış', 'toplam gelir', 'satışlar', 'esas faaliyetlerden gelir']);
        const cogs             = g(['satışların maliyeti', 'satılan malın maliyeti', 'hizmet maliyeti', 'satış maliyeti', 'esas faaliyetlerden gider']);
        const grossProfit      = g(['brüt kâr', 'brüt kar', 'brüt faaliyet kârı', 'brüt kar (zarar)']);
        const operatingExpenses= g(['faaliyet gideri', 'pazarlama satış dağıtım', 'genel yönetim gideri', 'toplam faaliyet giderleri']);
        const operatingProfit  = g(['faaliyet kârı', 'esas faaliyet kârı', 'faaliyet karı (zararı)', 'esas faaliyet kar', 'faaliyet kârı (zararı)']);
        const financialIncome  = g(['finansman gelir', 'faiz gelir', 'finansal gelir', 'finansman gelirleri']);
        const financialExpense = g(['finansman gider', 'faiz gider', 'finansal gider', 'finansman giderleri']);
        const profitBeforeTax  = g(['vergi öncesi kâr', 'vergi öncesi kar (zarar)', 'sürdürülen faaliyet kâr', 'sürdürülen faaliyetler vergi öncesi kar']);
        const taxExpense       = g(['vergi gider', 'dönem vergi', 'gelir vergisi gideri', 'vergi karşılığı', 'gelir vergi gideri']);
        const netProfit        = g(['dönem net kâr', 'net dönem kârı', 'net kâr (zarar)', 'dönem net kar', 'dönem net kâr (zarar)']);

        const calcGross     = grossProfit || (revenue - Math.abs(cogs));
        const calcOperating = operatingProfit || (calcGross - Math.abs(operatingExpenses));
        const calcNetProfit = netProfit;
        const ebitda        = calcOperating > 0 ? calcOperating * 1.12 : 0;

        const year = p.year;
        const month = p.period;
        const periodLabel = month === 12 ? `${year}` : `${year}/Q${Math.ceil(month / 3)}`;

        const grossProfitMargin  = revenue > 0 ? parseFloat((calcGross / revenue * 100).toFixed(2)) : 0;
        const operatingMargin    = revenue > 0 ? parseFloat((calcOperating / revenue * 100).toFixed(2)) : 0;
        const netProfitMargin    = revenue > 0 ? parseFloat((calcNetProfit / revenue * 100).toFixed(2)) : 0;

        return {
            period: periodLabel,
            year,
            date: `${year}-${String(month).padStart(2, '0')}-01`,
            revenue:           Math.round(revenue / K),
            costOfSales:       Math.round(Math.abs(cogs) / K),
            grossProfit:       Math.round(calcGross / K),
            grossProfitMargin,
            operatingExpenses: {
                total:              Math.round(Math.abs(operatingExpenses) / K),
                marketingSales:     0,
                generalAdmin:       0,
                researchDevelopment: 0,
            },
            operatingProfit:   Math.round(calcOperating / K),
            operatingMargin,
            financialIncome:   Math.round(financialIncome / K),
            financialExpenses: Math.round(Math.abs(financialExpense) / K),
            otherIncome:  0,
            otherExpenses: 0,
            profitBeforeTax:   Math.round(profitBeforeTax / K) || Math.round(calcNetProfit * 1.2 / K),
            taxExpense:        Math.round(Math.abs(taxExpense) / K) || Math.round(calcNetProfit * 0.2 / K),
            effectiveTaxRate:  profitBeforeTax > 0 ? parseFloat((Math.abs(taxExpense) / profitBeforeTax * 100).toFixed(2)) : 22,
            netProfit:         Math.round(calcNetProfit / K),
            netProfitMargin,
            ebitda:            Math.round(ebitda / K),
            ebitdaMargin:      revenue > 0 ? parseFloat((ebitda / revenue * 100).toFixed(2)) : 0,
        };
    }).filter(d => d.revenue > 0 || d.netProfit !== 0);
}

// Nakit Akımını dönüştür
function transformCashFlow(raw) {
    if (!raw) return [];
    const { items, periods } = raw;
    const K = 1000;

    return periods.map((p, idx) => {
        const g = (patterns) => findValue(items, patterns, idx);

        const operatingCF  = g(['işletme faaliyeti', 'esas faaliyet nakit', 'faaliyetlerden nakit akışı', 'a) işletme', 'a-işletme faaliyetleri', 'a. işletme faaliyetlerinden']);
        const investingCF  = g(['yatırım faaliyeti', 'yatırım aktivitesi', 'b) yatırım', 'b-yatırım faaliyetleri', 'b. yatırım faaliyetlerinden']);
        const financingCF  = g(['finansman faaliyeti', 'finansman aktivitesi', 'c) finansman', 'c-finansman faaliyetleri', 'c. finansman faaliyetlerinden']);
        const depreciation = g(['amortisman', 'itfa', 'amortisman ve itfa', 'amortisman, tükenme ve itfa']);
        const capEx        = g(['maddi duran varlık alım', 'duran varlık satın', 'yatırım harcama', 'sermaye harcama', 'maddi ve maddi olmayan duran varlık alımı']);
        const netIncome    = g(['dönem net kâr', 'net dönem kârı', 'net kâr (zarar)']);
        const dividends    = g(['temettü ödeme', 'kar payı ödeme', 'ortaklara ödeme', 'ödenen temettüler']);
        const netCashChange= g(['nakit artış azalış', 'nakit değişim', 'nakit net değişim', 'nakit ve nakit benzeri artış/azalış']);

        const year = p.year;
        const month = p.period;
        const periodLabel = month === 12 ? `${year}` : `${year}/Q${Math.ceil(month / 3)}`;

        return {
            period: periodLabel,
            year,
            date: `${year}-${String(month).padStart(2, '0')}-01`,
            operatingActivities: {
                netProfit: Math.round(netIncome / K),
                adjustments: {
                    depreciation: Math.round(depreciation / K),
                    total: Math.round(depreciation / K),
                },
                workingCapitalChanges: { total: 0 },
                total: Math.round(operatingCF / K),
            },
            investingActivities: {
                tangibleAssetPurchases: Math.round(Math.abs(capEx) / K),
                total: Math.round(investingCF / K),
            },
            financingActivities: {
                loanProceeds: 0,
                dividendsPaid: Math.round(Math.abs(dividends) / K),
                total: Math.round(financingCF / K),
            },
            netCashChange: Math.round(netCashChange / K),
            freeCashFlow: Math.round((operatingCF - Math.abs(capEx)) / K),
        };
    }).filter(d => d.operatingActivities.total !== 0);
}

// Ana fonksiyon: tüm finansal tabloları çek
async function fetchIsYatirimAll(symbol, periodType = 'quarterly') {
    const upperSymbol = symbol.toUpperCase().trim();
    console.log(`[IsYatirim] ${upperSymbol} verisi çekiliyor (${periodType})...`);

    // Finansal grup dene: XI_29 (konsolide UFRS), XI_19 (bağımsız UFRS), XI_05 (eski format)
    const groups = ['XI_29', 'XI_19', 'XI_05'];
    const periods = periodType === 'annual' ? getRecentYears(4) : getRecentQuarters(4);

    let raw = null;
    let usedGroup = null;

    for (const group of groups) {
        try {
            const result = await fetchIsYatirimRaw(upperSymbol, periods, group);
            if (result && result.items.length >= 3) {
                raw = result;
                usedGroup = group;
                console.log(`[IsYatirim] ✅ ${upperSymbol} → Grup: ${group}, ${result.items.length} satır`);
                break;
            }
        } catch (e) {
            console.warn(`[IsYatirim] ${group} başarısız (${upperSymbol}): ${e.message?.substring(0, 80)}`);
        }
    }

    if (!raw) {
        console.log(`[IsYatirim] ❌ ${upperSymbol} için veri alınamadı`);
        return null;
    }

    return {
        symbol: upperSymbol,
        financialGroup: usedGroup,
        periodType,
        balanceSheet: raw,
        incomeStatement: raw,
        cashFlow: raw,
        source: 'isyatirim'
    };
}

// Debug: Ham KALEM_ADI listesi döndürür (test için)
async function debugRawItems(symbol) {
    const cookie = await getSessionCookie();
    const periods = getRecentQuarters(4);
    for (const group of ['XI_29', 'XI_19', 'XI_05']) {
        try {
            const result = await fetchIsYatirimRaw(symbol, periods, group);
            if (result) {
                return {
                    group,
                    count: result.items.length,
                    items: result.items.map(x => ({ name: x.KALEM_ADI, d1: x.DEGER_1, d2: x.DEGER_2 }))
                };
            }
        } catch(e) { /* continue */ }
    }
    return null;
}

module.exports = {
    fetchIsYatirimAll,
    transformBalanceSheet,
    transformIncomeStatement,
    transformCashFlow,
    debugRawItems,
};
