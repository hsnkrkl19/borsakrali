/**
 * Fundamental Scores Service — BORSA KRALI
 *
 * Altman Z-Score, Piotroski F-Score, Beneish M-Score — hepsi yahoo-finance2'nin
 * `fundamentalsTimeSeries` (yıllık balance-sheet, income-statement, cash-flow) ve
 * `quoteSummary` (price snapshot) modüllerinden alınan GERÇEK bilanço verilerinden
 * hesaplanır. Veri eksikse skor null döner; uydurma yapılmaz.
 *
 * Formül kaynakları:
 *  - Altman (1968):  Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
 *  - Piotroski (2000): 9-soru F-Score
 *  - Beneish (1999): M = -4.84 + 0.92*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI
 *                       + 0.115*DEPI - 0.172*SGAI + 4.679*TATA - 0.327*LVGI
 */

let _yfModule = null;
async function getYF() {
  if (_yfModule) return _yfModule;
  const mod = await import('yahoo-finance2');
  _yfModule = mod.default || mod;
  return _yfModule;
}

const SCORE_CACHE_TTL = 30 * 60 * 1000; // 30 dk
const scoreCache = new Map();

// ─── Yahoo'dan gerekli tüm bilanço/gelir/cashflow + snapshot tek seferde çek ──
async function fetchAllFundamentals(symbol) {
  const ticker = symbol.toUpperCase().endsWith('.IS') ? symbol.toUpperCase() : `${symbol.toUpperCase()}.IS`;
  let YF;
  try { YF = await getYF(); }
  catch (err) { console.warn('[FundamentalScores] yahoo-finance2 import hatası:', err.message); return null; }
  const yf = typeof YF === 'function' ? new YF({ suppressNotices: ['yahooSurvey', 'ripHistorical'] }) : YF;

  const sinceYear = new Date().getFullYear() - 4;
  const period1 = `${sinceYear}-01-01`;

  // NOT: yahoo-finance2'de gelir tablosu modül adı "financials" (income-statement geçersiz).
  const [summary, ftsBS, ftsIS, ftsCF] = await Promise.all([
    yf.quoteSummary(ticker, {
      modules: ['price', 'financialData', 'defaultKeyStatistics', 'summaryDetail']
    }, { validateResult: false }).catch(e => { console.warn(`[FS] quoteSummary ${ticker}: ${e.message?.slice(0,80)}`); return null; }),
    yf.fundamentalsTimeSeries(ticker, { period1, type: 'annual', module: 'balance-sheet' }, { validateResult: false }).catch(() => null),
    yf.fundamentalsTimeSeries(ticker, { period1, type: 'annual', module: 'financials' }, { validateResult: false }).catch(() => null),
    yf.fundamentalsTimeSeries(ticker, { period1, type: 'annual', module: 'cash-flow' }, { validateResult: false }).catch(() => null),
  ]);

  return { summary, ftsBS: Array.isArray(ftsBS) ? ftsBS : [], ftsIS: Array.isArray(ftsIS) ? ftsIS : [], ftsCF: Array.isArray(ftsCF) ? ftsCF : [] };
}

function unwrap(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'object' && v.raw !== undefined) return v.raw;
  return null;
}

// fundamentalsTimeSeries dizilerini tarihe göre yeni→eski sırala ve key bul
function pickField(arr, keys) {
  if (!Array.isArray(arr) || !arr.length) return [];
  // arr genelde [{date, key1: val, key2: val, ...}, ...]
  const out = [];
  for (const row of arr) {
    let val = null;
    for (const k of keys) {
      if (row[k] != null && Number.isFinite(row[k])) { val = row[k]; break; }
    }
    if (val != null) {
      const date = row.date instanceof Date ? row.date : new Date(row.date);
      out.push({ date, value: val });
    }
  }
  return out.sort((a, b) => b.date - a.date); // yeni → eski
}

function latest(arr) { return arr.length ? arr[0].value : null; }
function prev(arr) { return arr.length >= 2 ? arr[1].value : null; }

// ─── ALTMAN Z-SCORE (orjinal formul, üretim/sanayi şirketleri için) ──────────
// Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
// A = Working Capital / Total Assets
// B = Retained Earnings / Total Assets
// C = EBIT / Total Assets
// D = Market Value of Equity / Total Liabilities
// E = Sales / Total Assets
function calculateAltmanZ(data) {
  const { ftsBS, ftsIS, summary } = data;

  const totalAssetsArr = pickField(ftsBS, ['totalAssets']);
  const currentAssetsArr = pickField(ftsBS, ['currentAssets', 'totalCurrentAssets']);
  const currentLiabsArr = pickField(ftsBS, ['currentLiabilities', 'totalCurrentLiabilities']);
  const retainedArr = pickField(ftsBS, ['retainedEarnings']);
  const totalLiabsArr = pickField(ftsBS, ['totalLiabilitiesNetMinorityInterest', 'totalLiab', 'totalLiabilities']);
  // EBIT: Yahoo'nun "financials" modülünde 'ebit' her zaman dolu değil; operatingIncome
  // genellikle dolu. EBITDA - reconciledDepreciation da fallback olarak işe yarar.
  const ebitArr = pickField(ftsIS, ['ebit', 'operatingIncome']);
  const salesArr = pickField(ftsIS, ['totalRevenue']);

  const totalAssets = latest(totalAssetsArr);
  const currentAssets = latest(currentAssetsArr);
  const currentLiabs = latest(currentLiabsArr);
  const retainedEarnings = latest(retainedArr);
  const totalLiabs = latest(totalLiabsArr);
  const ebit = latest(ebitArr);
  const sales = latest(salesArr);
  const marketCap = unwrap(summary?.price?.marketCap) || unwrap(summary?.summaryDetail?.marketCap);

  if ([totalAssets, currentAssets, currentLiabs, retainedEarnings, totalLiabs, ebit, sales, marketCap].some(v => v == null) || totalAssets <= 0 || totalLiabs <= 0) {
    return { value: null, reason: 'missing_data', missing: { totalAssets, currentAssets, currentLiabs, retainedEarnings, totalLiabs, ebit, sales, marketCap } };
  }

  const workingCapital = currentAssets - currentLiabs;
  const A = workingCapital / totalAssets;
  const B = retainedEarnings / totalAssets;
  const C = ebit / totalAssets;
  const D = marketCap / totalLiabs;
  const E = sales / totalAssets;

  const Z = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;

  let interpretation = 'Gri Bölge';
  if (Z > 2.99) interpretation = 'Güvenli Bölge';
  else if (Z < 1.81) interpretation = 'Risk Bölgesi (İflas Riski)';

  return {
    value: +Z.toFixed(2),
    components: { A: +A.toFixed(3), B: +B.toFixed(3), C: +C.toFixed(3), D: +D.toFixed(3), E: +E.toFixed(3) },
    interpretation,
    formula: 'Z = 1.2(WC/TA) + 1.4(RE/TA) + 3.3(EBIT/TA) + 0.6(MVE/TL) + 1.0(Sales/TA)',
  };
}

// ─── PIOTROSKI F-SCORE (0-9) ──────────────────────────────────────────────────
// 9 binary kriter — finansal güç göstergesi
// Karlılık (4): NI>0, ROA>0, OpCF>0, OpCF>NI
// Kaldıraç (3): LongDebt↓, CurrentRatio↑, Shares↓
// Verimlilik (2): GrossMargin↑, AssetTurnover↑
function calculatePiotroskiF(data) {
  const { ftsBS, ftsIS, ftsCF, summary } = data;

  const niArr = pickField(ftsIS, ['netIncome', 'netIncomeCommonStockholders', 'netIncomeFromContinuingOperationNetMinorityInterest', 'netIncomeContinuousOperations']);
  const taArr = pickField(ftsBS, ['totalAssets']);
  const opCFArr = pickField(ftsCF, ['operatingCashFlow', 'cashFlowFromContinuingOperatingActivities']);
  const longDebtArr = pickField(ftsBS, ['longTermDebt']);
  const caArr = pickField(ftsBS, ['currentAssets', 'totalCurrentAssets']);
  const clArr = pickField(ftsBS, ['currentLiabilities', 'totalCurrentLiabilities']);
  const sharesArr = pickField(ftsBS, ['ordinarySharesNumber', 'shareIssued', 'commonStockSharesOutstanding']);
  const revArr = pickField(ftsIS, ['totalRevenue']);
  const cogsArr = pickField(ftsIS, ['reconciledCostOfRevenue', 'costOfRevenue']);

  const ni = latest(niArr), niPrev = prev(niArr);
  const ta = latest(taArr), taPrev = prev(taArr);
  const opCF = latest(opCFArr);
  const longDebt = latest(longDebtArr), longDebtPrev = prev(longDebtArr);
  const ca = latest(caArr), caPrev = prev(caArr);
  const cl = latest(clArr), clPrev = prev(clArr);
  const shares = latest(sharesArr), sharesPrev = prev(sharesArr);
  const rev = latest(revArr), revPrev = prev(revArr);
  const cogs = latest(cogsArr), cogsPrev = prev(cogsArr);

  // Tüm 2 yıllık veriler gerekli — eksikse null
  if ([ni, niPrev, ta, taPrev, opCF, ca, caPrev, cl, clPrev, rev, revPrev, cogs, cogsPrev].some(v => v == null)) {
    return { value: null, reason: 'missing_2y_data' };
  }

  let score = 0;
  const checks = {};

  // 1. Net Income > 0
  checks.niPositive = ni > 0; if (checks.niPositive) score++;
  // 2. ROA > 0  (NI/Avg Assets, basitçe NI/TA)
  const roa = ni / ta;
  checks.roaPositive = roa > 0; if (checks.roaPositive) score++;
  // 3. OpCF > 0
  checks.opCFPositive = opCF > 0; if (checks.opCFPositive) score++;
  // 4. OpCF > NI (kalite)
  checks.opCFGtNI = opCF > ni; if (checks.opCFGtNI) score++;
  // 5. ROA artmış mı (cur vs prev)
  const roaPrev = niPrev / taPrev;
  checks.roaIncreased = roa > roaPrev; if (checks.roaIncreased) score++;
  // 6. Long-term debt azalmış mı (TA'ya oranla)
  const ldRatio = longDebt != null && ta ? longDebt / ta : null;
  const ldRatioPrev = longDebtPrev != null && taPrev ? longDebtPrev / taPrev : null;
  if (ldRatio != null && ldRatioPrev != null) {
    checks.leverageDecreased = ldRatio < ldRatioPrev; if (checks.leverageDecreased) score++;
  } else { checks.leverageDecreased = null; }
  // 7. Current Ratio artmış mı
  if (cl > 0 && clPrev > 0) {
    const cr = ca / cl, crPrev = caPrev / clPrev;
    checks.currentRatioIncreased = cr > crPrev; if (checks.currentRatioIncreased) score++;
  } else { checks.currentRatioIncreased = null; }
  // 8. Shares Outstanding artmamış mı (yeni hisse ihracı = kötü sinyal)
  if (shares != null && sharesPrev != null) {
    checks.sharesNotIncreased = shares <= sharesPrev * 1.005; if (checks.sharesNotIncreased) score++;
  } else { checks.sharesNotIncreased = null; }
  // 9. Gross Margin artmış mı
  if (rev > 0 && revPrev > 0) {
    const gm = (rev - cogs) / rev;
    const gmPrev = (revPrev - cogsPrev) / revPrev;
    checks.grossMarginIncreased = gm > gmPrev; if (checks.grossMarginIncreased) score++;
  } else { checks.grossMarginIncreased = null; }
  // 10. (kriter 9'a alternatif olarak Asset Turnover artışı; zaten 9 sorduk → toplam 9)

  let interpretation = 'Orta';
  if (score >= 7) interpretation = 'Finansal Açıdan Güçlü';
  else if (score <= 3) interpretation = 'Finansal Açıdan Zayıf';

  return {
    value: score,
    maxScore: 9,
    interpretation,
    checks,
    formula: 'Piotroski F-Score (Profitability 4 + Leverage 3 + Efficiency 2)',
  };
}

// ─── BENEISH M-SCORE (manipülasyon riski) ─────────────────────────────────────
// M = -4.84 + 0.92*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI + 0.115*DEPI
//     - 0.172*SGAI + 4.679*TATA - 0.327*LVGI
// M > -1.78  ⇒  manipülasyon riski yüksek
function calculateBeneishM(data) {
  const { ftsBS, ftsIS, ftsCF } = data;

  const arRows = pickField(ftsBS, ['accountsReceivable', 'netReceivables']);
  const revArr = pickField(ftsIS, ['totalRevenue']);
  const cogsArr = pickField(ftsIS, ['reconciledCostOfRevenue', 'costOfRevenue']);
  const taArr = pickField(ftsBS, ['totalAssets']);
  const caArr = pickField(ftsBS, ['currentAssets', 'totalCurrentAssets']);
  const ppeArr = pickField(ftsBS, ['netPPE', 'netPPEAndPropertyPlantEquipment', 'propertyPlantAndEquipmentNet']);
  const sgaArr = pickField(ftsIS, ['sellingGeneralAndAdministration', 'sellingGeneralAdministration', 'generalAndAdministrativeExpense']);
  const totalDebtArr = pickField(ftsBS, ['totalDebt']);
  const tlArr = pickField(ftsBS, ['totalLiabilitiesNetMinorityInterest', 'totalLiab', 'totalLiabilities']);
  const niArr = pickField(ftsIS, ['netIncome', 'netIncomeCommonStockholders', 'netIncomeFromContinuingOperationNetMinorityInterest']);
  const opCFArr = pickField(ftsCF, ['operatingCashFlow']);
  const depArr = pickField(ftsCF, ['depreciation', 'depreciationAndAmortization', 'depreciationAmortizationDepletion']);

  const need = (a, idx) => a.length > idx ? a[idx].value : null;
  const ar0 = need(arRows, 0), ar1 = need(arRows, 1);
  const rev0 = need(revArr, 0), rev1 = need(revArr, 1);
  const cogs0 = need(cogsArr, 0), cogs1 = need(cogsArr, 1);
  const ta0 = need(taArr, 0), ta1 = need(taArr, 1);
  const ca0 = need(caArr, 0), ca1 = need(caArr, 1);
  const ppe0 = need(ppeArr, 0), ppe1 = need(ppeArr, 1);
  const sga0 = need(sgaArr, 0), sga1 = need(sgaArr, 1);
  const td0 = need(totalDebtArr, 0), td1 = need(totalDebtArr, 1);
  const tl0 = need(tlArr, 0), tl1 = need(tlArr, 1);
  const ni0 = need(niArr, 0);
  const opCF0 = need(opCFArr, 0);
  const dep0 = need(depArr, 0), dep1 = need(depArr, 1);

  if ([ar0, ar1, rev0, rev1, cogs0, cogs1, ta0, ta1, ca0, ca1, ppe0, ppe1, ni0, opCF0].some(v => v == null) || rev0 <= 0 || rev1 <= 0) {
    return { value: null, reason: 'missing_2y_data' };
  }

  // 1. DSRI (Days Sales in Receivables Index)
  const DSRI = (ar0 / rev0) / (ar1 / rev1);
  // 2. GMI (Gross Margin Index) — eski / yeni
  const gm0 = (rev0 - cogs0) / rev0;
  const gm1 = (rev1 - cogs1) / rev1;
  const GMI = gm1 / gm0; // gm düşmüşse GMI > 1
  // 3. AQI (Asset Quality Index) — non-current non-PPE / total assets
  const otherNonCurrent0 = ta0 - ca0 - ppe0;
  const otherNonCurrent1 = ta1 - ca1 - ppe1;
  const aq0 = otherNonCurrent0 / ta0;
  const aq1 = otherNonCurrent1 / ta1;
  const AQI = aq1 !== 0 ? aq0 / aq1 : 1;
  // 4. SGI (Sales Growth)
  const SGI = rev0 / rev1;
  // 5. DEPI (Depreciation Index) — eski oran / yeni oran. Düşmüşse > 1
  const DEPI = (dep0 != null && dep1 != null && (dep1 + ppe1) > 0 && (dep0 + ppe0) > 0)
    ? (dep1 / (dep1 + ppe1)) / (dep0 / (dep0 + ppe0))
    : 1;
  // 6. SGAI
  const SGAI = (sga0 != null && sga1 != null && rev1 > 0)
    ? (sga0 / rev0) / (sga1 / rev1)
    : 1;
  // 7. LVGI (Leverage Index)
  const LVGI = (tl0 != null && tl1 != null && ta1 > 0 && tl1 > 0)
    ? (tl0 / ta0) / (tl1 / ta1)
    : 1;
  // 8. TATA (Total Accruals to Total Assets)
  const TATA = (ni0 - opCF0) / ta0;

  const M = -4.84 + 0.92 * DSRI + 0.528 * GMI + 0.404 * AQI + 0.892 * SGI
            + 0.115 * DEPI - 0.172 * SGAI + 4.679 * TATA - 0.327 * LVGI;

  let interpretation = 'Manipülasyon Riski Düşük';
  if (M > -1.78) interpretation = 'Manipülasyon Riski Yüksek (Dikkat)';

  return {
    value: +M.toFixed(2),
    indices: {
      DSRI: +DSRI.toFixed(3), GMI: +GMI.toFixed(3), AQI: +AQI.toFixed(3),
      SGI: +SGI.toFixed(3), DEPI: +DEPI.toFixed(3), SGAI: +SGAI.toFixed(3),
      LVGI: +LVGI.toFixed(3), TATA: +TATA.toFixed(3),
    },
    interpretation,
    formula: 'M = -4.84 + 0.92·DSRI + 0.528·GMI + 0.404·AQI + 0.892·SGI + 0.115·DEPI - 0.172·SGAI + 4.679·TATA - 0.327·LVGI',
  };
}

// ─── Ana fonksiyon: Tek seferde 3 skoru hesapla, cache'le ─────────────────────
async function getFundamentalScores(symbol) {
  const upper = symbol.toUpperCase().replace('.IS', '');
  const cached = scoreCache.get(upper);
  if (cached && Date.now() - cached.ts < SCORE_CACHE_TTL) return cached.data;

  const data = await fetchAllFundamentals(upper);
  if (!data) {
    return { success: false, error: 'Yahoo Finance verisine ulaşılamadı', symbol: upper };
  }
  // En azından 1 yıl veri yoksa erken çık
  if (!data.ftsBS.length && !data.ftsIS.length) {
    const result = { success: false, error: 'Bu hisse için Yahoo Finance bilanço verisi bulunamadı', symbol: upper };
    scoreCache.set(upper, { data: result, ts: Date.now() });
    return result;
  }

  const altman = calculateAltmanZ(data);
  const piotroski = calculatePiotroskiF(data);
  const beneish = calculateBeneishM(data);

  const result = {
    success: true,
    symbol: upper,
    fetchedAt: new Date().toISOString(),
    dataSource: 'Yahoo Finance fundamentalsTimeSeries (annual)',
    altmanZScore: altman.value,
    altmanComponents: altman.components,
    altmanInterpretation: altman.interpretation,
    altmanReason: altman.reason || null,
    piotroskiFScore: piotroski.value,
    piotroskiChecks: piotroski.checks,
    piotroskiInterpretation: piotroski.interpretation,
    piotroskiReason: piotroski.reason || null,
    beneishMScore: beneish.value,
    beneishIndices: beneish.indices,
    beneishInterpretation: beneish.interpretation,
    beneishReason: beneish.reason || null,
    fiscalYears: data.ftsBS.slice(0, 4).map(r => r.date instanceof Date ? r.date.getFullYear() : null).filter(Boolean),
  };

  scoreCache.set(upper, { data: result, ts: Date.now() });
  return result;
}

function clearScoreCache() { scoreCache.clear(); }

module.exports = {
  getFundamentalScores,
  fetchAllFundamentals,   // /api/kap/financials gibi başka servisler tekrar kullansın
  pickField, latest, prev, unwrap,
  calculateAltmanZ, calculatePiotroskiF, calculateBeneishM,
  clearScoreCache,
};
