/**
 * GOLDEN TESTS — fundamentalScoresService saf hesaplar (D4, checklist E)
 *   - calculateRatios: F/K, PD/DD, P/S, EV/EBITDA, borç/özkaynak, cari/asit-test,
 *     ROE, ROA, net/brüt/faaliyet marjı
 *   - calculateAltmanZ (fundamentalsTimeSeries data shape)
 *   - calculatePiotroskiF (2 yıllık karşılaştırma, 9 kriter)
 *   - pickField/latest/prev yardımcıları
 * Modül yalnız axios require eder (yahoo-finance2/dcfService LAZY) → mock gerekmez.
 *
 * Veri şekli: ftsBS/ftsIS/ftsCF = [{date, <field>:val}, ...]; pickField field'ı çıkarır,
 * tarihe göre yeni→eski sıralar. marketCap doğrudan data'da verilince onu kullanır.
 */
const FS = require('../../src/services/fundamentalScoresService');

const D = (y) => new Date(`${y}-12-31`);

describe('pickField / latest / prev', () => {
  const rows = [
    { date: D(2022), totalAssets: 80 },
    { date: D(2024), totalAssets: 100 },
    { date: D(2023), totalAssets: 90 },
  ];
  test('pickField yeni→eski sıralar', () => {
    const arr = FS.pickField(rows, ['totalAssets']);
    expect(arr.map(x => x.value)).toEqual([100, 90, 80]);
  });
  test('latest = en yeni, prev = bir önceki', () => {
    const arr = FS.pickField(rows, ['totalAssets']);
    expect(FS.latest(arr)).toBe(100);
    expect(FS.prev(arr)).toBe(90);
  });
  test('alternatif key fallback + Finite olmayan atlanır', () => {
    const arr = FS.pickField([{ date: D(2024), totalCurrentAssets: 50 }], ['currentAssets', 'totalCurrentAssets']);
    expect(FS.latest(arr)).toBe(50);
  });
});

describe('calculateRatios — finansal oranlar (elle türetilmiş)', () => {
  const data = {
    ftsBS: [{
      date: D(2024), totalAssets: 100, currentAssets: 40, currentLiabilities: 20,
      inventory: 10, stockholdersEquity: 60, totalLiabilitiesNetMinorityInterest: 40,
      totalDebt: 30, cashAndCashEquivalents: 15, ordinarySharesNumber: 100,
    }],
    ftsIS: [{
      date: D(2024), netIncome: 12, totalRevenue: 120,
      reconciledCostOfRevenue: 80, operatingIncome: 18, ebitda: 25,
    }],
    ftsCF: [],
    marketCap: 200,
  };
  const r = FS.calculateRatios(data);

  test('F/K = marketCap/netIncome = 200/12', () => expect(r.priceToEarnings).toBeCloseTo(16.67, 2));
  test('PD/DD = 200/60', () => expect(r.priceToBook).toBeCloseTo(3.33, 2));
  test('P/S = 200/120', () => expect(r.priceToSales).toBeCloseTo(1.67, 2));
  test('EV/EBITDA = (200+30-15)/25 = 8.6', () => expect(r.evToEbitda).toBeCloseTo(8.6, 2));
  test('Borç/Özkaynak = 30/60 = 0.5', () => expect(r.debtToEquity).toBeCloseTo(0.5, 2));
  test('Cari oran = 40/20 = 2.0', () => expect(r.currentRatio).toBeCloseTo(2.0, 2));
  test('Asit-test = (40-10)/20 = 1.5', () => expect(r.quickRatio).toBeCloseTo(1.5, 2));
  test('ROE = 12/60*100 = 20', () => expect(r.returnOnEquity).toBeCloseTo(20, 2));
  test('ROA = 12/100*100 = 12', () => expect(r.returnOnAssets).toBeCloseTo(12, 2));
  test('Net marj = 12/120*100 = 10', () => expect(r.netProfitMargin).toBeCloseTo(10, 2));
  test('Brüt marj = (120-80)/120*100 = 33.33', () => expect(r.grossProfitMargin).toBeCloseTo(33.33, 2));
  test('Faaliyet marjı = 18/120*100 = 15', () => expect(r.operatingMargin).toBeCloseTo(15, 2));

  test('negatif kâr → F/K null (bölme/işaret koruması)', () => {
    const neg = { ...data, ftsIS: [{ date: D(2024), netIncome: -5, totalRevenue: 120, reconciledCostOfRevenue: 80 }] };
    expect(FS.calculateRatios(neg).priceToEarnings).toBeNull();
    expect(FS.calculateRatios(neg).returnOnEquity).toBeCloseTo(-8.33, 2); // -5/60*100
  });
});

describe('calculateAltmanZ — fundamentalsTimeSeries shape', () => {
  const data = {
    ftsBS: [{
      date: D(2024), totalAssets: 100, currentAssets: 40, currentLiabilities: 20,
      retainedEarnings: 30, totalLiabilitiesNetMinorityInterest: 40, ordinarySharesNumber: 100,
    }],
    ftsIS: [{ date: D(2024), ebit: 10, totalRevenue: 120 }],
    marketCap: 50,
  };
  test('Z = 2.94 → Gri Bölge', () => {
    const z = FS.calculateAltmanZ(data);
    expect(z.value).toBeCloseTo(2.94, 2);
    expect(z.interpretation).toBe('Gri Bölge');
  });
  test('eksik veri → value null', () => {
    expect(FS.calculateAltmanZ({ ftsBS: [], ftsIS: [], marketCap: 50 }).value).toBeNull();
  });
});

describe('calculatePiotroskiF — 9 kriter (2 yıl)', () => {
  const data = {
    ftsIS: [
      { date: D(2024), netIncome: 12, totalRevenue: 120, reconciledCostOfRevenue: 80 },
      { date: D(2023), netIncome: 8, totalRevenue: 100, reconciledCostOfRevenue: 75 },
    ],
    ftsBS: [
      { date: D(2024), totalAssets: 100, currentAssets: 40, currentLiabilities: 20, longTermDebt: 30, ordinarySharesNumber: 100 },
      { date: D(2023), totalAssets: 95, currentAssets: 35, currentLiabilities: 22, longTermDebt: 35, ordinarySharesNumber: 100 },
    ],
    ftsCF: [
      { date: D(2024), operatingCashFlow: 15 },
      { date: D(2023), operatingCashFlow: 10 },
    ],
  };
  test('tüm 9 kriter geçer → 9/9, Güçlü', () => {
    const p = FS.calculatePiotroskiF(data);
    expect(p.value).toBe(9);
    expect(p.maxScore).toBe(9);
    expect(p.interpretation).toBe('Finansal Açıdan Güçlü');
  });
  test('çekirdek veri eksik → null', () => {
    expect(FS.calculatePiotroskiF({ ftsIS: [], ftsBS: [], ftsCF: [] }).value).toBeNull();
  });
});
