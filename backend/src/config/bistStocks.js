/**
 * BIST Stocks Seed Data
 * All major BIST stocks with sectors
 */

const bistStocks = [
  // Bankacılık
  { symbol: 'AKBNK', name: 'Akbank', sector: 'Bankacılık' },
  { symbol: 'GARAN', name: 'Garanti BBVA', sector: 'Bankacılık' },
  { symbol: 'ISCTR', name: 'İş Bankası (C)', sector: 'Bankacılık' },
  { symbol: 'YKBNK', name: 'Yapı Kredi', sector: 'Bankacılık' },
  { symbol: 'HALKB', name: 'Halkbank', sector: 'Bankacılık' },
  { symbol: 'VAKBN', name: 'Vakıfbank', sector: 'Bankacılık' },
  
  // Holding ve Yatırım
  { symbol: 'SAHOL', name: 'Sabancı Holding', sector: 'Holding ve Yatırım' },
  { symbol: 'KCHOL', name: 'Koç Holding', sector: 'Holding ve Yatırım' },
  { symbol: 'THYAO', name: 'Türk Hava Yolları', sector: 'Ulaştırma' },
  { symbol: 'TUPRS', name: 'Tüpraş', sector: 'Petrol' },
  { symbol: 'EREGL', name: 'Ereğli Demir Çelik', sector: 'Metal Ana' },
  
  // Teknoloji ve Telekomünikasyon
  { symbol: 'ASELS', name: 'Aselsan', sector: 'Savunma' },
  { symbol: 'TCELL', name: 'Turkcell', sector: 'Telekomünikasyon' },
  { symbol: 'TTKOM', name: 'Türk Telekom', sector: 'Telekomünikasyon' },
  
  // Enerji
  { symbol: 'ENJSA', name: 'Enerjisa', sector: 'Elektrik' },
  { symbol: 'AKSEN', name: 'Aksa Enerji', sector: 'Elektrik' },
  { symbol: 'AKENR', name: 'Akenerji', sector: 'Elektrik' },
  
  // İnşaat ve Gayrimenkul
  { symbol: 'ENKAI', name: 'Enka İnşaat', sector: 'İnşaat' },
  { symbol: 'EKGYO', name: 'Emlak Konut GYO', sector: 'Gayrimenkul' },
  
  // Perakende
  { symbol: 'BIMAS', name: 'BİM', sector: 'Perakende' },
  { symbol: 'MGROS', name: 'Migros', sector: 'Perakende' },
  
  // Otomotiv
  { symbol: 'FROTO', name: 'Ford Otosan', sector: 'Otomotiv' },
  { symbol: 'TOASO', name: 'Tofaş', sector: 'Otomotiv' },
  
  // Sanayi
  { symbol: 'SISE', name: 'Şişe Cam', sector: 'Cam' },
  { symbol: 'ARCLK', name: 'Arçelik', sector: 'Dayanıklı Tüketim' },
  { symbol: 'VESTL', name: 'Vestel', sector: 'Dayanıklı Tüketim' },
  
  // Gıda
  { symbol: 'ULKER', name: 'Ülker', sector: 'Gıda' },
  { symbol: 'CCOLA', name: 'Coca-Cola İçecek', sector: 'İçecek' },
  
  // Tekstil
  { symbol: 'BRSAN', name: 'Borusan Mannesmann', sector: 'Metal' },
  
  // Sigorta
  { symbol: 'AGESA', name: 'Agesa Hayat Emeklilik', sector: 'Sigorta' },
  
  // Kimya
  { symbol: 'PETKM', name: 'Petkim', sector: 'Kimya' },
  { symbol: 'SODA', name: 'Soda Sanayii', sector: 'Kimya' },
  
  // Madencilik
  { symbol: 'KOZAL', name: 'Koza Altın', sector: 'Madencilik' },
  { symbol: 'IPEKE', name: 'İpek Doğal Enerji', sector: 'Madencilik' },
  
  // Kağıt
  { symbol: 'MNDTR', name: 'Mondi Turkey', sector: 'Kağıt' }
];

module.exports = { bistStocks };
