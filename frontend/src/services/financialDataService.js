/**
 * Finansal Veri Servisi
 * Bilanço, Gelir Tablosu, Nakit Akış Tablosu ve Oran Analizleri
 * Fintables benzeri veri yapısı
 */

import { getApiBase } from '../config'
const API_BASE = getApiBase() + '/api'

/**
 * Şirket Bilanço Verileri
 */
export async function getBalanceSheet(symbol, period = 'annual') {
  try {
    const response = await fetch(`${API_BASE}/financials/${symbol}/balance-sheet?period=${period}`)
    const data = await response.json()
    return data.balanceSheet || generateMockBalanceSheet(symbol)
  } catch (error) {
    console.error('Bilanço verisi alınamadı:', error)
    return generateMockBalanceSheet(symbol)
  }
}

/**
 * Şirket Gelir Tablosu Verileri
 */
export async function getIncomeStatement(symbol, period = 'annual') {
  try {
    const response = await fetch(`${API_BASE}/financials/${symbol}/income-statement?period=${period}`)
    const data = await response.json()
    return data.incomeStatement || generateMockIncomeStatement(symbol)
  } catch (error) {
    console.error('Gelir tablosu verisi alınamadı:', error)
    return generateMockIncomeStatement(symbol)
  }
}

/**
 * Şirket Nakit Akış Tablosu Verileri
 */
export async function getCashFlow(symbol, period = 'annual') {
  try {
    const response = await fetch(`${API_BASE}/financials/${symbol}/cash-flow?period=${period}`)
    const data = await response.json()
    return data.cashFlow || generateMockCashFlow(symbol)
  } catch (error) {
    console.error('Nakit akış verisi alınamadı:', error)
    return generateMockCashFlow(symbol)
  }
}

/**
 * Finansal Oranlar
 */
export async function getFinancialRatios(symbol) {
  try {
    const response = await fetch(`${API_BASE}/financials/${symbol}/ratios`)
    const data = await response.json()
    return data.ratios || generateMockRatios(symbol)
  } catch (error) {
    console.error('Oran verisi alınamadı:', error)
    return generateMockRatios(symbol)
  }
}

/**
 * Tüm Finansal Verileri Getir
 */
export async function getAllFinancialData(symbol) {
  const [balanceSheet, incomeStatement, cashFlow, ratios] = await Promise.all([
    getBalanceSheet(symbol),
    getIncomeStatement(symbol),
    getCashFlow(symbol),
    getFinancialRatios(symbol)
  ])

  return {
    symbol,
    balanceSheet,
    incomeStatement,
    cashFlow,
    ratios,
    lastUpdate: new Date().toISOString()
  }
}

// ==================== MOCK VERİ ÜRETİCİLER ====================

function generateMockBalanceSheet(symbol) {
  const baseValue = Math.random() * 10000000000 + 1000000000
  const years = ['2024', '2023', '2022', '2021', '2020']

  return years.map((year, idx) => {
    const multiplier = 1 - idx * 0.08
    return {
      year,
      period: year,
      // Varlıklar
      assets: {
        currentAssets: {
          cashAndEquivalents: Math.round(baseValue * 0.15 * multiplier),
          shortTermInvestments: Math.round(baseValue * 0.05 * multiplier),
          accountsReceivable: Math.round(baseValue * 0.12 * multiplier),
          inventory: Math.round(baseValue * 0.08 * multiplier),
          otherCurrentAssets: Math.round(baseValue * 0.03 * multiplier),
          totalCurrentAssets: Math.round(baseValue * 0.43 * multiplier)
        },
        nonCurrentAssets: {
          propertyPlantEquipment: Math.round(baseValue * 0.35 * multiplier),
          goodwill: Math.round(baseValue * 0.05 * multiplier),
          intangibleAssets: Math.round(baseValue * 0.08 * multiplier),
          longTermInvestments: Math.round(baseValue * 0.04 * multiplier),
          otherNonCurrentAssets: Math.round(baseValue * 0.05 * multiplier),
          totalNonCurrentAssets: Math.round(baseValue * 0.57 * multiplier)
        },
        totalAssets: Math.round(baseValue * multiplier)
      },
      // Yükümlülükler
      liabilities: {
        currentLiabilities: {
          accountsPayable: Math.round(baseValue * 0.1 * multiplier),
          shortTermDebt: Math.round(baseValue * 0.08 * multiplier),
          currentPortionLongTermDebt: Math.round(baseValue * 0.03 * multiplier),
          otherCurrentLiabilities: Math.round(baseValue * 0.05 * multiplier),
          totalCurrentLiabilities: Math.round(baseValue * 0.26 * multiplier)
        },
        nonCurrentLiabilities: {
          longTermDebt: Math.round(baseValue * 0.18 * multiplier),
          deferredTaxLiabilities: Math.round(baseValue * 0.03 * multiplier),
          otherNonCurrentLiabilities: Math.round(baseValue * 0.03 * multiplier),
          totalNonCurrentLiabilities: Math.round(baseValue * 0.24 * multiplier)
        },
        totalLiabilities: Math.round(baseValue * 0.5 * multiplier)
      },
      // Özkaynaklar
      equity: {
        commonStock: Math.round(baseValue * 0.1 * multiplier),
        retainedEarnings: Math.round(baseValue * 0.35 * multiplier),
        accumulatedOtherComprehensiveIncome: Math.round(baseValue * 0.02 * multiplier),
        minorityInterest: Math.round(baseValue * 0.03 * multiplier),
        totalEquity: Math.round(baseValue * 0.5 * multiplier)
      }
    }
  })
}

function generateMockIncomeStatement(symbol) {
  const baseRevenue = Math.random() * 5000000000 + 500000000
  const years = ['2024', '2023', '2022', '2021', '2020']

  return years.map((year, idx) => {
    const multiplier = 1 - idx * 0.1
    const revenue = Math.round(baseRevenue * multiplier)
    const costOfRevenue = Math.round(revenue * 0.65)
    const grossProfit = revenue - costOfRevenue
    const operatingExpenses = Math.round(revenue * 0.2)
    const operatingIncome = grossProfit - operatingExpenses
    const interestExpense = Math.round(revenue * 0.02)
    const incomeBeforeTax = operatingIncome - interestExpense
    const taxExpense = Math.round(incomeBeforeTax * 0.22)
    const netIncome = incomeBeforeTax - taxExpense

    return {
      year,
      period: year,
      revenue,
      costOfRevenue,
      grossProfit,
      grossProfitMargin: ((grossProfit / revenue) * 100).toFixed(2),
      operatingExpenses: {
        researchAndDevelopment: Math.round(revenue * 0.05),
        sellingGeneralAdmin: Math.round(revenue * 0.12),
        depreciation: Math.round(revenue * 0.03),
        total: operatingExpenses
      },
      operatingIncome,
      operatingMargin: ((operatingIncome / revenue) * 100).toFixed(2),
      interestIncome: Math.round(revenue * 0.005),
      interestExpense,
      otherIncome: Math.round(revenue * 0.01),
      incomeBeforeTax,
      taxExpense,
      effectiveTaxRate: ((taxExpense / incomeBeforeTax) * 100).toFixed(2),
      netIncome,
      netProfitMargin: ((netIncome / revenue) * 100).toFixed(2),
      eps: (netIncome / 1000000000).toFixed(2),
      ebitda: operatingIncome + Math.round(revenue * 0.03)
    }
  })
}

function generateMockCashFlow(symbol) {
  const baseValue = Math.random() * 2000000000 + 200000000
  const years = ['2024', '2023', '2022', '2021', '2020']

  return years.map((year, idx) => {
    const multiplier = 1 - idx * 0.1
    const operatingCashFlow = Math.round(baseValue * multiplier)

    return {
      year,
      period: year,
      operatingActivities: {
        netIncome: Math.round(operatingCashFlow * 0.7),
        depreciation: Math.round(operatingCashFlow * 0.15),
        changesInWorkingCapital: Math.round(operatingCashFlow * 0.05),
        otherOperating: Math.round(operatingCashFlow * 0.1),
        totalOperatingCashFlow: operatingCashFlow
      },
      investingActivities: {
        capitalExpenditures: -Math.round(operatingCashFlow * 0.4),
        acquisitions: -Math.round(operatingCashFlow * 0.1),
        investmentPurchases: -Math.round(operatingCashFlow * 0.05),
        investmentSales: Math.round(operatingCashFlow * 0.08),
        totalInvestingCashFlow: -Math.round(operatingCashFlow * 0.47)
      },
      financingActivities: {
        debtRepayment: -Math.round(operatingCashFlow * 0.15),
        debtIssuance: Math.round(operatingCashFlow * 0.1),
        dividendsPaid: -Math.round(operatingCashFlow * 0.08),
        stockRepurchase: -Math.round(operatingCashFlow * 0.05),
        totalFinancingCashFlow: -Math.round(operatingCashFlow * 0.18)
      },
      netChangeInCash: Math.round(operatingCashFlow * 0.35),
      freeCashFlow: Math.round(operatingCashFlow * 0.6)
    }
  })
}

function generateMockRatios(symbol) {
  return {
    // Likidite Oranları
    liquidity: {
      currentRatio: (Math.random() * 2 + 1).toFixed(2),
      quickRatio: (Math.random() * 1.5 + 0.5).toFixed(2),
      cashRatio: (Math.random() * 0.5 + 0.1).toFixed(2)
    },
    // Karlılık Oranları
    profitability: {
      grossMargin: (Math.random() * 30 + 20).toFixed(2),
      operatingMargin: (Math.random() * 20 + 5).toFixed(2),
      netProfitMargin: (Math.random() * 15 + 3).toFixed(2),
      roe: (Math.random() * 25 + 5).toFixed(2),
      roa: (Math.random() * 12 + 2).toFixed(2),
      roic: (Math.random() * 18 + 5).toFixed(2)
    },
    // Kaldıraç Oranları
    leverage: {
      debtToEquity: (Math.random() * 1.5 + 0.3).toFixed(2),
      debtToAssets: (Math.random() * 0.5 + 0.2).toFixed(2),
      interestCoverage: (Math.random() * 10 + 2).toFixed(2)
    },
    // Faaliyet Oranları
    efficiency: {
      assetTurnover: (Math.random() * 1.5 + 0.5).toFixed(2),
      inventoryTurnover: (Math.random() * 10 + 3).toFixed(2),
      receivablesTurnover: (Math.random() * 15 + 5).toFixed(2),
      daysSalesOutstanding: Math.round(Math.random() * 60 + 20),
      daysInventory: Math.round(Math.random() * 90 + 30),
      daysPayable: Math.round(Math.random() * 60 + 20)
    },
    // Değerleme Oranları
    valuation: {
      peRatio: (Math.random() * 30 + 5).toFixed(2),
      pbRatio: (Math.random() * 5 + 1).toFixed(2),
      psRatio: (Math.random() * 3 + 0.5).toFixed(2),
      evToEbitda: (Math.random() * 15 + 5).toFixed(2),
      evToRevenue: (Math.random() * 3 + 1).toFixed(2)
    }
  }
}

/**
 * Finansal Terimler Sözlüğü
 */
export const financialTerms = {
  // Bilanço Terimleri
  'Dönen Varlıklar': 'Bir yıl içinde nakde dönüşmesi beklenen varlıklar',
  'Duran Varlıklar': 'Bir yıldan uzun süre kullanılması beklenen varlıklar',
  'Özkaynaklar': 'Şirketin toplam varlıklarından borçları çıkarıldıktan sonra kalan değer',
  'Kısa Vadeli Borçlar': 'Bir yıl içinde ödenmesi gereken yükümlülükler',
  'Uzun Vadeli Borçlar': 'Bir yıldan uzun sürede ödenmesi gereken yükümlülükler',

  // Gelir Tablosu Terimleri
  'Brüt Kar': 'Satış gelirlerinden satılan malların maliyetinin çıkarılması',
  'Faaliyet Karı': 'Brüt kardan faaliyet giderlerinin düşülmesi',
  'Net Kar': 'Tüm giderler ve vergiler sonrası kalan kar',
  'FAVÖK': 'Faiz, Amortisman ve Vergi Öncesi Kar (EBITDA)',

  // Nakit Akış Terimleri
  'İşletme Faaliyetlerinden Nakit Akışı': 'Ana faaliyetlerden elde edilen nakit',
  'Yatırım Faaliyetlerinden Nakit Akışı': 'Yatırım işlemlerinden kaynaklanan nakit akışı',
  'Finansman Faaliyetlerinden Nakit Akışı': 'Borç ve özkaynak işlemlerinden kaynaklanan nakit',
  'Serbest Nakit Akışı': 'İşletme nakit akışından yatırım harcamalarının çıkarılması',

  // Oran Analizleri
  'Cari Oran': 'Dönen Varlıklar / Kısa Vadeli Borçlar - 1.5-2 arası ideal',
  'Asit-Test Oranı': '(Dönen Varlıklar - Stoklar) / Kısa Vadeli Borçlar',
  'ROE': 'Net Kar / Özkaynaklar - Özkaynak karlılığı',
  'ROA': 'Net Kar / Toplam Varlıklar - Aktif karlılığı',
  'F/K Oranı': 'Hisse Fiyatı / Hisse Başına Kar',
  'PD/DD': 'Piyasa Değeri / Defter Değeri'
}

/**
 * Formatlama Yardımcıları
 */
export function formatCurrency(value, currency = 'TRY') {
  if (value === null || value === undefined) return '-'

  const absValue = Math.abs(value)
  let formatted

  if (absValue >= 1e12) {
    formatted = (value / 1e12).toFixed(2) + ' Trilyon'
  } else if (absValue >= 1e9) {
    formatted = (value / 1e9).toFixed(2) + ' Milyar'
  } else if (absValue >= 1e6) {
    formatted = (value / 1e6).toFixed(2) + ' Milyon'
  } else if (absValue >= 1e3) {
    formatted = (value / 1e3).toFixed(2) + ' Bin'
  } else {
    formatted = value.toFixed(2)
  }

  return currency === 'TRY' ? formatted + ' ₺' : formatted
}

export function formatPercent(value) {
  if (value === null || value === undefined) return '-'
  return '%' + parseFloat(value).toFixed(2)
}

export function formatRatio(value) {
  if (value === null || value === undefined) return '-'
  return parseFloat(value).toFixed(2)
}

export default {
  getBalanceSheet,
  getIncomeStatement,
  getCashFlow,
  getFinancialRatios,
  getAllFinancialData,
  financialTerms,
  formatCurrency,
  formatPercent,
  formatRatio
}
