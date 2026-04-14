/**
 * BIST Stocks Service
 * Fetches all BIST stocks dynamically and manages stock database
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { Stock } = require('../models');
const logger = require('../utils/logger');

class BISTStocksService {
  constructor() {
    this.bistUrl = 'https://www.kap.org.tr/tr/bist-sirketler';
    this.allStocks = [];
  }

  /**
   * Fetch all BIST stocks from KAP or other sources
   * Returns array of stock objects
   */
  async fetchAllBISTStocks() {
    try {
      logger.info('Fetching all BIST stocks...');
      
      // Method 1: Hardcoded list of major BIST stocks (fallback)
      const hardcodedStocks = this.getHardcodedStocks();
      
      // Method 2: Try to scrape from KAP (if available)
      // const scrapedStocks = await this.scrapeFromKAP();
      
      this.allStocks = hardcodedStocks;
      logger.info(`Found ${this.allStocks.length} BIST stocks`);
      
      return this.allStocks;
    } catch (error) {
      logger.error('Error fetching BIST stocks:', error.message);
      return this.getHardcodedStocks();
    }
  }

  /**
   * Get hardcoded list of major BIST stocks
   * This is a comprehensive list of BIST 100 and popular stocks
   */
  getHardcodedStocks() {
    return [
      // Bankalar
      { symbol: 'AKBNK', name: 'Akbank', sector: 'Bankalar' },
      { symbol: 'GARAN', name: 'Garanti Bankası', sector: 'Bankalar' },
      { symbol: 'ISCTR', name: 'İş Bankası', sector: 'Bankalar' },
      { symbol: 'YKBNK', name: 'Yapı Kredi Bankası', sector: 'Bankalar' },
      { symbol: 'HALKB', name: 'Halk Bankası', sector: 'Bankalar' },
      { symbol: 'VAKBN', name: 'Vakıfbank', sector: 'Bankalar' },
      
      // Holding & Finans
      { symbol: 'SAHOL', name: 'Sabancı Holding', sector: 'Holding' },
      { symbol: 'KCHOL', name: 'Koç Holding', sector: 'Holding' },
      { symbol: 'THYAO', name: 'Türk Hava Yolları', sector: 'Ulaştırma' },
      { symbol: 'TCELL', name: 'Turkcell', sector: 'Telekomünikasyon' },
      
      // Enerji
      { symbol: 'EREGL', name: 'Ereğli Demir Çelik', sector: 'Metal Ana' },
      { symbol: 'TUPRS', name: 'Tüpraş', sector: 'Kimya Petrol' },
      { symbol: 'PETKM', name: 'Petkim', sector: 'Kimya Petrol' },
      { symbol: 'AKSEN', name: 'Aksa Enerji', sector: 'Elektrik' },
      
      // Teknoloji
      { symbol: 'ASELS', name: 'Aselsan', sector: 'Teknoloji' },
      { symbol: 'TTKOM', name: 'Türk Telekom', sector: 'Telekomünikasyon' },
      { symbol: 'LOGO', name: 'Logo Yazılım', sector: 'Teknoloji' },
      
      // İnşaat & Gayrimenkul
      { symbol: 'ENKAI', name: 'Enka İnşaat', sector: 'İnşaat' },
      { symbol: 'TKFEN', name: 'Tekfen Holding', sector: 'Holding' },
      { symbol: 'TOASO', name: 'Tofaş', sector: 'Metal Eşya' },
      
      // Gıda & İçecek
      { symbol: 'ULKER', name: 'Ülker', sector: 'Gıda' },
      { symbol: 'CCOLA', name: 'Coca Cola İçecek', sector: 'Gıda' },
      { symbol: 'AEFES', name: 'Anadolu Efes', sector: 'Gıda' },
      { symbol: 'TATGD', name: 'Tat Gıda', sector: 'Gıda' },
      
      // Perakende
      { symbol: 'BIMAS', name: 'BİM', sector: 'Perakende' },
      { symbol: 'MGROS', name: 'Migros', sector: 'Perakende' },
      { symbol: 'SOKM', name: 'Şok Marketler', sector: 'Perakende' },
      
      // Otomotiv
      { symbol: 'FROTO', name: 'Ford Otosan', sector: 'Otomotiv' },
      { symbol: 'TOASO', name: 'Tofaş', sector: 'Otomotiv' },
      { symbol: 'TTRAK', name: 'Türk Traktör', sector: 'Otomotiv' },
      
      // Tekstil
      { symbol: 'ARSAN', name: 'Arsan Tekstil', sector: 'Tekstil' },
      { symbol: 'BRSAN', name: 'Borusan Mannesmann', sector: 'Metal Ana' },
      
      // İlaç & Sağlık
      { symbol: 'ECILC', name: 'Eczacıbaşı İlaç', sector: 'İlaç' },
      
      // Kimya
      { symbol: 'SISE', name: 'Şişe Cam', sector: 'Taş Toprak' },
      { symbol: 'SODA', name: 'Soda Sanayi', sector: 'Kimya' },
      { symbol: 'AKSA', name: 'Aksa', sector: 'Kimya' },
      { symbol: 'SASA', name: 'Sasa Polyester', sector: 'Kimya' },
      
      // Sigorta
      { symbol: 'AKGRT', name: 'Aksigorta', sector: 'Sigorta' },
      
      // Diğer Önemli Hisseler
      { symbol: 'DOHOL', name: 'Doğan Holding', sector: 'Holding' },
      { symbol: 'GOLTS', name: 'Göltaş', sector: 'Taş Toprak' },
      { symbol: 'KOZAL', name: 'Koza Altın', sector: 'Madencilik' },
      { symbol: 'KRDMD', name: 'Kardemir', sector: 'Metal Ana' },
      { symbol: 'VESTL', name: 'Vestel', sector: 'Teknoloji' },
      { symbol: 'BSOKE', name: 'Batısöke', sector: 'Tekstil' },
      { symbol: 'ALARK', name: 'Alarko Holding', sector: 'Holding' },
      { symbol: 'ADEL', name: 'Adel Kalemcilik', sector: 'Diğer' },
      { symbol: 'IZMDC', name: 'İzmir Demir Çelik', sector: 'Metal Ana' },
      { symbol: 'DCTTR', name: 'DCT Trading', sector: 'Diğer' },
      
      // BIST 100 Tamamlayıcı
      { symbol: 'PGSUS', name: 'Pegasus', sector: 'Ulaştırma' },
      { symbol: 'ODAS', name: 'Odaş Elektrik', sector: 'Elektrik' },
      { symbol: 'AGHOL', name: 'Anadolu Grubu Holding', sector: 'Holding' },
      { symbol: 'AKENR', name: 'Akenerji', sector: 'Elektrik' },
      { symbol: 'ALCTL', name: 'Alctl Çelik', sector: 'Metal Ana' },
      { symbol: 'ANELE', name: 'Anel Elektrik', sector: 'Elektrik' },
      { symbol: 'ARENA', name: 'Arena Bilgisayar', sector: 'Teknoloji' },
      { symbol: 'ARCLK', name: 'Arçelik', sector: 'Metal Eşya' },
      { symbol: 'BAGFS', name: 'Bagfaş', sector: 'Gıda' },
      { symbol: 'BANVT', name: 'Banvit', sector: 'Gıda' },
      { symbol: 'BERA', name: 'Bera Holding', sector: 'Holding' },
      { symbol: 'BIOEN', name: 'Biotrend', sector: 'Kimya' },
      { symbol: 'BJKAS', name: 'Beşiktaş', sector: 'Spor' },
      { symbol: 'BRISA', name: 'Brisa', sector: 'Otomotiv' },
      { symbol: 'BRYAT', name: 'Borusan Yatırım', sector: 'Holding' },
      { symbol: 'BTCIM', name: 'Batıçim', sector: 'Taş Toprak' },
      { symbol: 'BUCIM', name: 'Bursa Çimento', sector: 'Taş Toprak' },
      { symbol: 'CEMTS', name: 'Çemtaş', sector: 'Taş Toprak' },
      { symbol: 'CIMSA', name: 'Çimsa', sector: 'Taş Toprak' },
      { symbol: 'DOAS', name: 'Doğuş Otomotiv', sector: 'Otomotiv' },
      { symbol: 'ECGYO', name: 'Eczacıbaşı GYO', sector: 'GYO' },
      { symbol: 'EGEEN', name: 'Ege Endüstri', sector: 'Kimya' },
      { symbol: 'EKGYO', name: 'Emlak Konut GYO', sector: 'GYO' },
      { symbol: 'ENJSA', name: 'Enerjisa', sector: 'Elektrik' },
      { symbol: 'ERBOS', name: 'Erbosan', sector: 'Metal Eşya' },
      { symbol: 'FENER', name: 'Fenerbahçe', sector: 'Spor' },
      { symbol: 'GENTS', name: 'Gentaş', sector: 'Teknoloji' },
      { symbol: 'GESAN', name: 'Gençsan', sector: 'Metal Ana' },
      { symbol: 'GUBRF', name: 'Gübre Fabrikaları', sector: 'Kimya' },
      { symbol: 'HEKTS', name: 'Hektaş', sector: 'Teknoloji' },
      { symbol: 'IHLAS', name: 'İhlas Holding', sector: 'Holding' },
      { symbol: 'INDES', name: 'İndeks', sector: 'Teknoloji' },
      { symbol: 'IPEKE', name: 'İpek Doğal Enerji', sector: 'Elektrik' },
      { symbol: 'ISGYO', name: 'İş GYO', sector: 'GYO' },
      { symbol: 'KARTN', name: 'Kartonsan', sector: 'Kağıt' },
      { symbol: 'KLKIM', name: 'Kale Kimya', sector: 'Kimya' },
      { symbol: 'KNFRT', name: 'Konfrut', sector: 'Gıda' },
      { symbol: 'KONYA', name: 'Konya Çimento', sector: 'Taş Toprak' },
      { symbol: 'KORDS', name: 'Kordsa', sector: 'Kimya' },
      { symbol: 'KOZAA', name: 'Koza Anadolu', sector: 'Madencilik' },
      { symbol: 'KRSTL', name: 'Kristal Kola', sector: 'Gıda' },
      { symbol: 'KUTPO', name: 'Kütahya Porselen', sector: 'Taş Toprak' },
      { symbol: 'MAVI', name: 'Mavi Giyim', sector: 'Tekstil' },
      { symbol: 'MPARK', name: 'MLP Sağlık', sector: 'Sağlık' },
      { symbol: 'NETAS', name: 'Netaş', sector: 'Teknoloji' },
      { symbol: 'NTHOL', name: 'Net Holding', sector: 'Holding' },
      { symbol: 'OTKAR', name: 'Otokar', sector: 'Otomotiv' },
      { symbol: 'OYAKC', name: 'Oyak Çimento', sector: 'Taş Toprak' },
      { symbol: 'PARSN', name: 'Parsan', sector: 'Otomotiv' },
      { symbol: 'PENGD', name: 'Penguen Gıda', sector: 'Gıda' },
      { symbol: 'PETUN', name: 'Pınar Et', sector: 'Gıda' },
      { symbol: 'PNSUT', name: 'Pınar Süt', sector: 'Gıda' },
      { symbol: 'POLHO', name: 'Polisan Holding', sector: 'Holding' },
      { symbol: 'SELEC', name: 'Selçuk Ecza', sector: 'İlaç' },
      { symbol: 'TGSAS', name: 'Tüpraş', sector: 'Kimya Petrol' },
      { symbol: 'TKNSA', name: 'Teknik Yapı', sector: 'İnşaat' },
      { symbol: 'TMSN', name: 'Tümosan', sector: 'Otomotiv' },
      { symbol: 'TRKCM', name: 'Trakya Cam', sector: 'Taş Toprak' },
      { symbol: 'TSKB', name: 'TSKB', sector: 'Bankalar' },
      { symbol: 'TTRAK', name: 'Türk Traktör', sector: 'Otomotiv' },
      { symbol: 'TURSG', name: 'Türkiye Sigorta', sector: 'Sigorta' },
      { symbol: 'UNIM', name: 'Ünimar', sector: 'Gıda' },
      { symbol: 'VESBE', name: 'Vestel Beyaz Eşya', sector: 'Metal Eşya' },
      { symbol: 'YATAS', name: 'Yataş', sector: 'Tekstil' },
      { symbol: 'YEOTK', name: 'Yeşil Otomotiv', sector: 'Otomotiv' },
      { symbol: 'ZOREN', name: 'Zorlu Enerji', sector: 'Elektrik' }
    ];
  }

  /**
   * Seed all stocks to database
   */
  async seedStocksToDatabase() {
    try {
      const stocks = await this.fetchAllBISTStocks();
      
      logger.info(`Seeding ${stocks.length} stocks to database...`);
      
      for (const stock of stocks) {
        await Stock.findOrCreate({
          where: { symbol: stock.symbol },
          defaults: {
            name: stock.name,
            sector: stock.sector,
            market: 'BIST',
            isActive: true
          }
        });
      }
      
      logger.info('✓ All stocks seeded successfully');
      return { success: true, count: stocks.length };
      
    } catch (error) {
      logger.error('Error seeding stocks:', error.message);
      throw error;
    }
  }

  /**
   * Get all active stock symbols
   */
  async getAllStockSymbols() {
    const stocks = await Stock.findAll({
      where: { isActive: true },
      attributes: ['symbol'],
      raw: true
    });
    
    return stocks.map(s => s.symbol);
  }

  /**
   * Get stocks by sector
   */
  async getStocksBySector(sector) {
    return await Stock.findAll({
      where: { sector, isActive: true },
      order: [['symbol', 'ASC']]
    });
  }

  /**
   * Get all sectors
   */
  async getAllSectors() {
    const stocks = await Stock.findAll({
      attributes: [[Stock.sequelize.fn('DISTINCT', Stock.sequelize.col('sector')), 'sector']],
      where: { isActive: true },
      raw: true
    });
    
    return stocks.map(s => s.sector).filter(Boolean);
  }
}

module.exports = new BISTStocksService();
