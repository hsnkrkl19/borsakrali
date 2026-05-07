/**
 * Sektör Bazlı WACC Tablosu — BORSA KRALI
 *
 * Kaynak: virattt/dexter src/skills/dcf/sector-wacc.md tablosundan uyarlandı.
 * Damodaran sektör WACC verisi referans alındı.
 *
 * İki mod:
 *  - usd  (varsayılan): risk-free 4%, ERP 5-6% — küresel karşılaştırma için
 *  - tl   (yerel):      risk-free 28%, ERP 6%  — TL bazlı yerel hesap
 *
 * BIST sektör isimleri Türkçe (allBistStocks.js ile uyumlu).
 */

// İngilizce sektör → temel WACC (USD bazlı, 4% rf + 5-6% ERP)
const BASE_WACC_USD = {
  'Communication Services': 0.090,
  'Consumer Discretionary': 0.090,
  'Consumer Staples':       0.075,
  'Energy':                 0.100,
  'Financials':             0.090,
  'Health Care':            0.090,
  'Industrials':            0.085,
  'Information Technology': 0.100,
  'Materials':              0.090,
  'Real Estate':            0.080,
  'Utilities':              0.065,
};

// BIST Türkçe sektör isimleri → İngilizce kategori eşleme
const TR_SECTOR_MAP = {
  // Bankacılık & Finans
  'Bankacılık':         'Financials',
  'Sigorta':            'Financials',
  'Faktoring':          'Financials',
  'Leasing':            'Financials',
  'Holding':            'Financials',

  // GYO / Gayrimenkul
  'GYO':                'Real Estate',
  'Gayrimenkul':        'Real Estate',
  'İnşaat':             'Real Estate',
  'Insaat':             'Real Estate',

  // Sanayi
  'Demir Çelik':        'Materials',
  'Demir Celik':        'Materials',
  'Madencilik':         'Materials',
  'Çimento':            'Materials',
  'Cimento':            'Materials',
  'Cam':                'Materials',
  'Petrokimya':         'Materials',
  'Kimya':              'Materials',
  'Kağıt':              'Materials',
  'Kagit':              'Materials',
  'Lastik':             'Materials',

  // Enerji
  'Enerji':             'Energy',
  'Petrol':             'Energy',
  'Elektrik':           'Utilities',
  'Doğalgaz':           'Utilities',
  'Dogalgaz':           'Utilities',

  // Sanayi & Ulaştırma
  'Otomotiv':           'Consumer Discretionary',
  'Beyaz Eşya':         'Consumer Discretionary',
  'Beyaz Esya':         'Consumer Discretionary',
  'Tekstil':            'Consumer Discretionary',
  'Konfeksiyon':        'Consumer Discretionary',
  'Mobilya':            'Consumer Discretionary',
  'Havacılık':          'Industrials',
  'Havacilik':          'Industrials',
  'Ulaştırma':          'Industrials',
  'Ulastirma':          'Industrials',
  'Lojistik':           'Industrials',
  'Savunma':            'Industrials',
  'Makine':             'Industrials',
  'Elektronik':         'Information Technology',

  // Tüketim
  'Perakende':          'Consumer Staples',
  'Gıda':               'Consumer Staples',
  'Gida':               'Consumer Staples',
  'İçecek':             'Consumer Staples',
  'Icecek':             'Consumer Staples',
  'Tütün':              'Consumer Staples',
  'Tutun':              'Consumer Staples',

  // Sağlık
  'İlaç':               'Health Care',
  'Ilac':               'Health Care',
  'Sağlık':             'Health Care',
  'Saglik':             'Health Care',

  // Bilişim
  'Bilişim':            'Information Technology',
  'Bilisim':            'Information Technology',
  'Yazılım':            'Information Technology',
  'Yazilim':            'Information Technology',
  'Telekom':            'Communication Services',
  'Medya':              'Communication Services',
  'İletişim':           'Communication Services',
  'Iletisim':           'Communication Services',

  // Diğer / Bilinmiyor
  'Diğer':              'Industrials',
  'Diger':              'Industrials',
  'Turizm':             'Consumer Discretionary',
};

/**
 * Sektör WACC değerini döner.
 *
 * @param {string} trSector  - BIST Türkçe sektör adı (allBistStocks.js'ten)
 * @param {object} opts
 * @param {'usd'|'tl'} opts.mode    - hesap modu (varsayılan: 'usd')
 * @param {boolean}    opts.smallCap - küçük market cap → +1.5% premium
 * @param {boolean}    opts.highLeverage - yüksek borç → +1% premium
 * @param {boolean}    opts.marketLeader - sektör lideri → -0.75% indirim
 */
function getWACC(trSector, opts = {}) {
  const { mode = 'usd', smallCap = false, highLeverage = false, marketLeader = false } = opts;

  const englishCategory = TR_SECTOR_MAP[trSector] || 'Industrials';
  let baseWacc = BASE_WACC_USD[englishCategory] || 0.090;

  // TL modu: Türk tahvil rf'i çok yüksek olduğu için sektör WACC'a country risk premium ekle
  // Yaklaşık +20% (TR risk-free 28% - global rf 4% - ülke risk teorisi karmaşık;
  // pratik: USD WACC üstüne +20% ekleyince TL nominal WACC ~28-30% bandına düşer)
  if (mode === 'tl') {
    baseWacc = baseWacc + 0.20;
  }

  let adjustments = [];
  if (smallCap) {
    baseWacc += 0.015;
    adjustments.push({ label: 'Küçük market cap', value: '+1.5%' });
  }
  if (highLeverage) {
    baseWacc += 0.010;
    adjustments.push({ label: 'Yüksek borç', value: '+1.0%' });
  }
  if (marketLeader) {
    baseWacc -= 0.0075;
    adjustments.push({ label: 'Sektör lideri', value: '-0.75%' });
  }

  return {
    wacc: +baseWacc.toFixed(4),
    waccPct: +(baseWacc * 100).toFixed(2),
    sector: trSector,
    sectorEN: englishCategory,
    mode,
    adjustments,
  };
}

/**
 * Tüm sektör WACC'larını döner — referans tablosu için.
 */
function getAllSectorWACC(mode = 'usd') {
  const out = {};
  for (const [tr, en] of Object.entries(TR_SECTOR_MAP)) {
    let w = BASE_WACC_USD[en] || 0.090;
    if (mode === 'tl') w += 0.20;
    out[tr] = +(w * 100).toFixed(2);
  }
  return out;
}

module.exports = {
  getWACC,
  getAllSectorWACC,
  BASE_WACC_USD,
  TR_SECTOR_MAP,
};
