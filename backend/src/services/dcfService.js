/**
 * DCF (Discounted Cash Flow) Değerleme Servisi — BORSA KRALI
 *
 * Metodoloji: virattt/dexter src/skills/dcf/SKILL.md'den uyarlandı.
 *  - 5 yıllık FCF projeksiyonu (CAGR %15 ile sınırlı)
 *  - Yıllık decay: 0.95, 0.90, 0.85, 0.80 (büyüme ivmesi azalır)
 *  - Gordon terminal: terminal growth %2.5
 *  - Sektör bazlı WACC (sectorWACC.js)
 *  - 3×3 sensitivity matrix: WACC ±1% × terminal growth {2%, 2.5%, 3%}
 *
 * Veri kaynağı: yahoo-finance2 quoteSummary + Yahoo v7 quote (mevcut servisler).
 * BIST hisselerinde 5y FCF history her zaman bulunmayabilir → fallback'ler:
 *   FCF → Operating CF − CapEx → Net Income × 0.85
 */

const { getWACC } = require('../data/sectorWACC');
const { allBistStocks } = require('../data/allBistStocks');

const dcfCache = new Map();
const DCF_CACHE_TTL = 30 * 60 * 1000; // 30 dk

const PROJECTION_YEARS = 5;
const GROWTH_DECAY = [1.0, 0.95, 0.90, 0.85, 0.80]; // her yıl büyüme katsayısı azalır
const FCF_GROWTH_CAP = 0.15;     // tarihsel CAGR %15 üstü kabul edilmez
const TERMINAL_GROWTH = 0.025;    // Gordon terminal: %2.5
const DEFAULT_TAX_RATE = 0.22;

// yahoo-finance2 v2.14+ ESM-only paketi; CommonJS projesinde dinamik import gerekli
let _yfPromise = null;
const getYF = () => {
  if (!_yfPromise) {
    _yfPromise = import('yahoo-finance2').then(m => m.default || m);
  }
  return _yfPromise;
};

// Yardımcı: yahoo-finance2 v2 direkt sayı döner; eski endpoint .raw'lı objeler döner
function unwrap(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && 'raw' in v) return v.raw;
  return v;
}

// USD/TRY kuru — Yahoo → exchangerate.host → frankfurter fallback zinciri
let _usdTryCache = { rate: null, ts: 0 };
const USDTRY_TTL = 10 * 60 * 1000; // 10 dk
async function fetchUsdTryRate() {
  if (_usdTryCache.rate && Date.now() - _usdTryCache.ts < USDTRY_TTL) {
    return _usdTryCache.rate;
  }

  // 1) Yahoo Finance (USDTRY=X)
  try {
    const YF = await getYF();
    const yf = typeof YF === 'function' ? new YF({ suppressNotices: ['yahooSurvey'] }) : YF;
    const q = await yf.quote('USDTRY=X');
    const rate = q?.regularMarketPrice;
    if (rate && Number.isFinite(rate) && rate > 1) {
      _usdTryCache = { rate, ts: Date.now() };
      return rate;
    }
  } catch (err) {
    console.warn('[DCF] Yahoo USD/TRY kuru alınamadı:', err.message?.slice(0, 80));
  }

  // 2) exchangerate.host (ücretsiz, anahtar gerektirmez)
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=TRY', { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const rate = j?.rates?.TRY;
    if (rate && Number.isFinite(rate) && rate > 1) {
      _usdTryCache = { rate, ts: Date.now() };
      return rate;
    }
  } catch (err) {
    console.warn('[DCF] exchangerate.host hatası:', err.message?.slice(0, 80));
  }

  // 3) frankfurter.app (ECB tabanlı, ücretsiz)
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=TRY', { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const rate = j?.rates?.TRY;
    if (rate && Number.isFinite(rate) && rate > 1) {
      _usdTryCache = { rate, ts: Date.now() };
      return rate;
    }
  } catch (err) {
    console.warn('[DCF] frankfurter.app hatası:', err.message?.slice(0, 80));
  }

  // Son çare: eski cache veya 2026 makul fallback (40 TRY — 32.5'tan çok daha doğru)
  return _usdTryCache.rate || 40;
}

// Yahoo finansal veri çekimi — yahoo-finance2 v3 quoteSummary + fundamentalsTimeSeries
// fundamentalsTimeSeries: 2022 sonrası gerçek 5y cashflow (operatingCashFlow, capitalExpenditure, freeCashFlow)
// quoteSummary: snapshot (price, marketCap, totalDebt/Cash, sharesOutstanding, netIncome history)
async function fetchFinancials(symbol) {
  const ticker = symbol.toUpperCase().endsWith('.IS') ? symbol.toUpperCase() : `${symbol.toUpperCase()}.IS`;
  let YF;
  try {
    YF = await getYF();
  } catch (err) {
    console.warn(`[DCF] yahoo-finance2 import hatası:`, err.message?.slice(0, 80));
    return null;
  }
  const yf = typeof YF === 'function' ? new YF({ suppressNotices: ['yahooSurvey', 'ripHistorical'] }) : YF;

  // Paralel: quoteSummary (snapshot) + fundamentalsTimeSeries (5y cashflow) + v7 quote (price fallback)
  const sinceYear = new Date().getFullYear() - 6;
  const [summary, ftsCash, v7quote] = await Promise.all([
    yf.quoteSummary(ticker, {
      modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail', 'price', 'incomeStatementHistory']
    }, { validateResult: false }).catch(e => { console.warn(`[DCF] quoteSummary (${ticker}):`, e.message?.slice(0, 80)); return null; }),
    yf.fundamentalsTimeSeries(ticker, {
      period1: `${sinceYear}-01-01`,
      type: 'annual',
      module: 'cash-flow'
    }, { validateResult: false }).catch(e => { console.warn(`[DCF] fundamentalsTimeSeries (${ticker}):`, e.message?.slice(0, 80)); return null; }),
    yf.quote(ticker).catch(e => { console.warn(`[DCF] quote (${ticker}):`, e.message?.slice(0, 80)); return null; }),
  ]);

  if (!summary && !ftsCash && !v7quote) return null;

  // 5y cashflow serisi → extractFCFHistory uyumlu shape: { totalCashFromOperatingActivities, capitalExpenditures, endDate }
  const cashFlowAnnual = Array.isArray(ftsCash)
    ? ftsCash
        .filter(e => e?.operatingCashFlow !== undefined || e?.freeCashFlow !== undefined)
        .map(e => ({
          totalCashFromOperatingActivities: e.operatingCashFlow,
          capitalExpenditures: e.capitalExpenditure, // already negative
          freeCashFlowDirect: e.freeCashFlow,        // Yahoo'nun hazır FCF'i (varsa)
          netIncome: e.netIncomeFromContinuingOperations,
          endDate: e.date,
        }))
    : [];

  // Income statement (netIncomeProxy fallback için)
  const incomeAnnual = (summary?.incomeStatementHistory?.incomeStatementHistory || []).map(s => ({
    netIncome: unwrap(s.netIncome),
    endDate: s.endDate,
  }));

  const fd = summary?.financialData || {};
  const ks = summary?.defaultKeyStatistics || {};
  const price = summary?.price || {};

  // currentPrice: 3 katmanlı fallback — Yahoo bazı çağrılarda price modülünü boş döndürebiliyor
  const priceCandidates = [
    unwrap(price.regularMarketPrice),
    unwrap(fd.currentPrice),
    unwrap(v7quote?.regularMarketPrice),
    unwrap(v7quote?.postMarketPrice),
    unwrap(v7quote?.preMarketPrice),
  ];
  const currentPrice = priceCandidates.find(p => Number.isFinite(p) && p > 0) || null;

  // marketCap: price modülü yoksa v7 quote'tan al
  const marketCap = unwrap(price.marketCap) || unwrap(v7quote?.marketCap) || null;

  // shares: defaultKeyStatistics → v7 quote sharesOutstanding fallback
  const shares = unwrap(ks.sharesOutstanding) || unwrap(v7quote?.sharesOutstanding) || null;

  return {
    ok: true,
    cashFlow: { annual: cashFlowAnnual },
    incomeStatement: { annual: incomeAnnual },
    financialData: fd,
    statistics: ks,
    price,
    v7quote,
    currentPrice,
    marketCap,
    shares,
    freeCashflow: unwrap(fd.freeCashflow),
    operatingCF:  unwrap(fd.operatingCashflow),
    totalDebt:    unwrap(fd.totalDebt),
    totalCash:    unwrap(fd.totalCash),
    debtToEquity: unwrap(fd.debtToEquity),
  };
}

// NOT: Eski "syntheticFinancials" / "syntheticFCFHistory" fonksiyonları kaldırıldı.
// Yahoo Finance gerçek veri vermezse artık {success:false} dönüyoruz; uydurma
// (pseudo-random) DCF değeri ÜRETMİYORUZ. — borsakrali.com fake-data temizliği.

// ─────────────────────────────────────────────────────────────────
// FCF tarihsel serisi çıkar — realFinancialDataService normalized obje
// ─────────────────────────────────────────────────────────────────
function yearOfStatement(s) {
  const ed = s?.endDate;
  if (!ed) return null;
  if (ed instanceof Date) return ed.getFullYear();
  if (typeof ed === 'number') return new Date(ed * 1000).getFullYear();
  if (ed?.fmt) return new Date(ed.fmt).getFullYear();
  if (ed?.raw) return new Date(ed.raw * 1000).getFullYear();
  return null;
}

function extractFCFHistory(financials) {
  // 1) cashFlow.annual[*]: fundamentalsTimeSeries 'cash-flow' module → her yıl OperatingCF + CapEx + (varsa) FCF
  const stmts = financials?.cashFlow?.annual || [];
  if (Array.isArray(stmts) && stmts.length >= 2) {
    const series = stmts
      .map(s => {
        const op = unwrap(s.totalCashFromOperatingActivities) || 0;
        const capex = unwrap(s.capitalExpenditures) || 0;
        // Yahoo'nun hazır freeCashFlow'u varsa onu tercih et (kendi formülü daha kapsamlı)
        const direct = unwrap(s.freeCashFlowDirect);
        const fcf = (direct !== null && Number.isFinite(direct)) ? direct : (op + capex);
        const year = yearOfStatement(s);
        return { year, fcf, op, capex };
      })
      .filter(x => x.fcf && Number.isFinite(x.fcf) && x.year)
      .sort((a, b) => a.year - b.year); // eski → yeni
    if (series.length >= 2) return { source: 'cashflow_history', series };
  }

  // 2) financialData snapshot: tek nokta freeCashflow
  const fd = financials?.financialData;
  if (fd) {
    const fcf = unwrap(fd.freeCashflow);
    if (fcf && Number.isFinite(fcf)) {
      return { source: 'snapshot_only', series: [{ year: new Date().getFullYear(), fcf, op: null, capex: null }] };
    }
  }

  return null;
}

// Net income → FCF proxy (en zayıf fallback)
function netIncomeProxy(financials) {
  const stmts = financials?.incomeStatement?.annual || [];
  if (Array.isArray(stmts) && stmts.length >= 2) {
    const series = stmts
      .map(s => {
        const ni = unwrap(s.netIncome) || 0;
        const year = yearOfStatement(s);
        return { year, fcf: ni * 0.85, op: ni, capex: 0 }; // %85 = capex/wc düzeltmesi tahmini
      })
      .filter(x => x.fcf && Number.isFinite(x.fcf))
      .reverse();
    if (series.length >= 2) return { source: 'net_income_proxy', series };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// CAGR hesabı (negatif/sıfır FCF için güvenli)
// ─────────────────────────────────────────────────────────────────
function calcCAGR(series) {
  if (!series || series.length < 2) return 0;
  const first = series[0].fcf;
  const last = series[series.length - 1].fcf;
  const years = series.length - 1;

  // Negatif → pozitif geçiş varsa CAGR tanımsız → çok temkinli %5 al
  if (first <= 0 || last <= 0) {
    return 0.05;
  }
  return Math.pow(last / first, 1 / years) - 1;
}

// ─────────────────────────────────────────────────────────────────
// FCF projeksiyonu (5 yıl, decay'li)
// ─────────────────────────────────────────────────────────────────
function projectFCF(baseFCF, growthRate) {
  // Cap %15
  const cappedGrowth = Math.min(growthRate, FCF_GROWTH_CAP);
  // Negatif FCF veya negatif büyüme → minimum %2 büyüme varsay (terminal yakını)
  const effGrowth = cappedGrowth <= 0 ? 0.02 : cappedGrowth;

  const projections = [];
  let prev = baseFCF;
  for (let i = 0; i < PROJECTION_YEARS; i++) {
    const yearGrowth = effGrowth * GROWTH_DECAY[i];
    const projected = prev * (1 + yearGrowth);
    projections.push({
      year: i + 1,
      growthRate: +(yearGrowth * 100).toFixed(2),
      fcf: projected,
    });
    prev = projected;
  }
  return { projections, cappedGrowth: +(cappedGrowth * 100).toFixed(2), effGrowth: +(effGrowth * 100).toFixed(2) };
}

// ─────────────────────────────────────────────────────────────────
// PV ve Terminal Value
// ─────────────────────────────────────────────────────────────────
function discountToPresentValue(projections, wacc) {
  let totalPV = 0;
  const pvSeries = projections.map(p => {
    const pv = p.fcf / Math.pow(1 + wacc, p.year);
    totalPV += pv;
    return { ...p, pv };
  });
  return { pvSeries, totalPV };
}

function gordonTerminal(lastProjectedFCF, wacc, terminalGrowth = TERMINAL_GROWTH) {
  if (wacc <= terminalGrowth) {
    // WACC ≤ g → Gordon model patlar; safety fallback: WACC + 1%
    wacc = terminalGrowth + 0.01;
  }
  const terminalFCF = lastProjectedFCF * (1 + terminalGrowth);
  const terminalValue = terminalFCF / (wacc - terminalGrowth);
  const terminalPV = terminalValue / Math.pow(1 + wacc, PROJECTION_YEARS);
  return { terminalValue, terminalPV, terminalGrowth };
}

// ─────────────────────────────────────────────────────────────────
// Tek hesap: enterprise value → equity value → fair price
// ─────────────────────────────────────────────────────────────────
function valuationForParams(baseFCF, growthRate, wacc, terminalGrowth, netDebt, sharesOutstanding) {
  const { projections } = projectFCF(baseFCF, growthRate);
  const { pvSeries, totalPV } = discountToPresentValue(projections, wacc);
  const lastProjected = projections[projections.length - 1].fcf;
  const { terminalValue, terminalPV } = gordonTerminal(lastProjected, wacc, terminalGrowth);

  const enterpriseValue = totalPV + terminalPV;
  const equityValue = enterpriseValue - (netDebt || 0);
  const fairPrice = sharesOutstanding > 0 ? equityValue / sharesOutstanding : null;

  return {
    pvSeries,
    totalPV,
    terminalValue,
    terminalPV,
    enterpriseValue,
    equityValue,
    fairPrice,
  };
}

// ─────────────────────────────────────────────────────────────────
// 3×3 sensitivity matrix: WACC ±1% × g {2%, 2.5%, 3%}
// ─────────────────────────────────────────────────────────────────
function buildSensitivity(baseFCF, growthRate, wacc, netDebt, shares) {
  const waccs = [wacc - 0.01, wacc, wacc + 0.01];
  const growths = [0.02, 0.025, 0.03];

  const rows = waccs.map(w => {
    const cells = growths.map(g => {
      const v = valuationForParams(baseFCF, growthRate, w, g, netDebt, shares);
      return { wacc: +(w * 100).toFixed(2), terminalGrowth: +(g * 100).toFixed(2), fairPrice: v.fairPrice };
    });
    return { wacc: +(w * 100).toFixed(2), cells };
  });

  return { waccs: waccs.map(w => +(w * 100).toFixed(2)), growths: growths.map(g => +(g * 100).toFixed(2)), rows };
}

// ─────────────────────────────────────────────────────────────────
// Ana fonksiyon
// ─────────────────────────────────────────────────────────────────
async function valuateDCF(symbol, opts = {}) {
  const upper = symbol.toUpperCase().replace('.IS', '');
  const cacheKey = `${upper}_${opts.mode || 'usd'}`;
  const cached = dcfCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DCF_CACHE_TTL) return cached.result;

  const stockMeta = allBistStocks.find(s => s.symbol === upper);
  if (!stockMeta) {
    return { success: false, error: 'Hisse bulunamadı', symbol: upper };
  }

  const fin = await fetchFinancials(upper);

  // Yahoo Finance gerçek veri vermediyse — uydurma sayı üretmek yerine açıkça reddet.
  if (!fin || (!fin.freeCashflow && !fin.marketCap && !fin.cashFlow?.annual?.length)) {
    return {
      success: false,
      symbol: upper,
      error: 'Yahoo Finance bu hisse için yeterli mali veri (FCF, marketCap, cashflow geçmişi) sağlayamadı. DCF değerlemesi yapılamıyor — sentetik/uydurma rakam üretmiyoruz.',
      reason: 'no_real_financials',
    };
  }

  // FCF tarihsel serisi: 1) gerçek 5y cashflow, 2) net income proxy. Bunlar başarısızsa reddediyoruz.
  let fcfData = extractFCFHistory(fin);          // fundamentalsTimeSeries → cashflow_history
  if (!fcfData) fcfData = netIncomeProxy(fin);   // incomeStatementHistory → net_income_proxy
  if (!fcfData) {
    return {
      success: false,
      symbol: upper,
      error: 'Yahoo Finance 5 yıllık FCF / net kâr serisi sağlamadı. DCF için yeterli geçmiş veri yok.',
      reason: 'no_fcf_history',
    };
  }
  const usingSynthetic = false;

  const baseFCF = fcfData.series[fcfData.series.length - 1].fcf;
  const cagr = calcCAGR(fcfData.series);

  // WACC ayarlamaları
  const marketCap = fin.marketCap || 0;
  const isSmallCap = marketCap > 0 && marketCap < 1e9;
  const isHighLeverage = (fin.debtToEquity || 0) > 100;

  const wInfo = getWACC(stockMeta.sector, {
    mode: opts.mode || 'usd',
    smallCap: isSmallCap,
    highLeverage: isHighLeverage,
    marketLeader: false,
  });

  const wacc = wInfo.wacc;
  const mode = opts.mode || 'usd';
  const isUSD = mode === 'usd';

  // BIST hisseleri TRY denominated; mode=usd ise tüm TRY değerlerini USD/TRY ile böl
  const usdTryRate = isUSD ? await fetchUsdTryRate() : 1;
  const div = (v) => Number.isFinite(v) ? v / usdTryRate : v;

  const netDebtRaw = (fin.totalDebt || 0) - (fin.totalCash || 0);
  const sharesAbs = fin.shares || 0;
  const currentPriceRaw = fin.currentPrice || 0;

  // FCF ve TRY tutarları için USD dönüşümü; shares ve oranlar (CAGR, WACC, growth) etkilenmez
  const baseFCFConverted = div(baseFCF);
  const netDebt = div(netDebtRaw);
  const currentPrice = div(currentPriceRaw);
  const marketCapConverted = div(marketCap);
  const fcfHistoryConverted = fcfData.series.map(h => ({ ...h, fcf: div(h.fcf) }));

  // Ana değerleme — base FCF zaten dönüştürülmüş, share count olduğu gibi
  const main = valuationForParams(baseFCFConverted, cagr, wacc, TERMINAL_GROWTH, netDebt, sharesAbs);

  // Yüzdelik fark (intrinsic vs current)
  const upside = (main.fairPrice && currentPrice > 0)
    ? +(((main.fairPrice - currentPrice) / currentPrice) * 100).toFixed(2)
    : null;

  // Karar etiketi
  let verdict = 'belirsiz';
  if (upside !== null) {
    if (upside > 25) verdict = 'derin_iskonto';
    else if (upside > 10) verdict = 'iskonto';
    else if (upside > -10) verdict = 'gercege_yakin';
    else if (upside > -25) verdict = 'pahali';
    else verdict = 'cok_pahali';
  }

  const sensitivity = buildSensitivity(baseFCFConverted, cagr, wacc, netDebt, sharesAbs);

  const result = {
    success: true,
    symbol: upper,
    name: stockMeta.name,
    sector: stockMeta.sector,
    market: stockMeta.market,
    fetchedAt: new Date().toISOString(),
    methodology: 'dexter_dcf_v1',
    currency: isUSD ? 'USD' : 'TRY',
    currencySymbol: isUSD ? '$' : '₺',
    usdTryRate: +usdTryRate.toFixed(4),
    inputs: {
      baseFCF: baseFCFConverted,
      historicalCAGR: +(cagr * 100).toFixed(2),
      cappedCAGR: Math.min(+(cagr * 100).toFixed(2), FCF_GROWTH_CAP * 100),
      projectionYears: PROJECTION_YEARS,
      growthDecay: GROWTH_DECAY,
      growthCap: FCF_GROWTH_CAP * 100,
      terminalGrowth: TERMINAL_GROWTH * 100,
      wacc: wInfo.waccPct,
      waccMode: wInfo.mode,
      waccAdjustments: wInfo.adjustments,
      sectorEN: wInfo.sectorEN,
      shares: sharesAbs,
      netDebt,
      marketCap: marketCapConverted,
      currentPrice,
      fcfHistory: fcfHistoryConverted,
      fcfSource: fcfData.source,
      synthetic: usingSynthetic,
    },
    projection: main.pvSeries,
    valuation: {
      sumPV5y: main.totalPV,
      terminalValue: main.terminalValue,
      terminalPV: main.terminalPV,
      enterpriseValue: main.enterpriseValue,
      netDebt,
      equityValue: main.equityValue,
      fairPrice: main.fairPrice,
      currentPrice,
      upsidePct: upside,
      verdict,
    },
    sensitivity,
  };

  // Cache: yalnızca tam sonuç (currentPrice > 0 ve fairPrice tanımlı). Eksik veri cache'lenmez,
  // sonraki istek tekrar Yahoo'ya gider — geçici kesintiler 30dk hapsolmasın.
  const isComplete = Number.isFinite(currentPrice) && currentPrice > 0
    && Number.isFinite(main.fairPrice) && main.fairPrice > 0;
  if (isComplete) {
    dcfCache.set(cacheKey, { result, ts: Date.now() });
  }
  return result;
}

function clearDcfCache() { dcfCache.clear(); }

module.exports = {
  valuateDCF,
  clearDcfCache,
  // test/utility
  projectFCF,
  calcCAGR,
  gordonTerminal,
  valuationForParams,
  buildSensitivity,
};
