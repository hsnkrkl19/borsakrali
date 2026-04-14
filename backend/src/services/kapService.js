/**
 * KAP Service - Kamuyu Aydınlatma Platformu
 * Scrapes news and disclosures from kap.org.tr
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { News, Stock } = require('../models');
const logger = require('../utils/logger');

class KAPService {
  constructor() {
    this.baseUrl = 'https://www.kap.org.tr';
    this.apiUrl = 'https://www.kap.org.tr/tr/api';
  }

  /**
   * Fetch latest disclosures from KAP
   * @param {number} limit - Number of disclosures to fetch
   */
  async fetchLatestDisclosures(limit = 50) {
    try {
      const url = `${this.apiUrl}/disclosureSearchResult`;
      
      const response = await axios.post(url, {
        fromDate: this.getDateString(-30), // Last 30 days
        toDate: this.getDateString(0),
        memberType: null,
        disclosureClass: null,
        pageNumber: 1,
        pageSize: limit,
        sortDirection: 'desc',
        sortColumn: 'disclosureDate'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });

      if (!response.data || !response.data.data) {
        return [];
      }

      const disclosures = response.data.data.map(d => ({
        disclosureId: d.basic.disclosureIndex,
        title: d.basic.subject,
        summary: d.basic.summary,
        stockCode: d.basic.stockCodes?.[0] || null,
        publishDate: new Date(d.basic.publishDate),
        category: d.basic.disclosureCategory,
        url: `${this.baseUrl}/tr/Bildirim/${d.basic.disclosureIndex}`
      }));

      return disclosures;

    } catch (error) {
      logger.error('KAP fetch error:', error.message);
      return [];
    }
  }

  /**
   * Analyze news sentiment using simple keyword analysis
   * @param {string} text - News text
   */
  analyzeSentiment(text) {
    if (!text) return { sentiment: 'neutral', score: 0 };

    const positiveWords = [
      'artış', 'yükseliş', 'büyüme', 'kâr', 'başarı', 'gelişme',
      'olumlu', 'pozitif', 'iyileşme', 'rekor', 'güçlü', 'kazanç'
    ];

    const negativeWords = [
      'düşüş', 'azalma', 'zarar', 'kayıp', 'olumsuz', 'negatif',
      'risk', 'tehlike', 'kriz', 'sorun', 'zayıf', 'düşük'
    ];

    const lowerText = text.toLowerCase();
    
    let positiveCount = 0;
    let negativeCount = 0;

    positiveWords.forEach(word => {
      const regex = new RegExp(word, 'gi');
      const matches = lowerText.match(regex);
      if (matches) positiveCount += matches.length;
    });

    negativeWords.forEach(word => {
      const regex = new RegExp(word, 'gi');
      const matches = lowerText.match(regex);
      if (matches) negativeCount += matches.length;
    });

    const total = positiveCount + negativeCount;
    if (total === 0) return { sentiment: 'neutral', score: 0 };

    const score = ((positiveCount - negativeCount) / total) * 100;
    
    let sentiment = 'neutral';
    if (score > 20) sentiment = 'positive';
    else if (score < -20) sentiment = 'negative';

    return {
      sentiment,
      score: parseFloat(score.toFixed(2)),
      positiveCount,
      negativeCount
    };
  }

  /**
   * Generate AI-like analysis (simplified)
   * @param {Object} disclosure - Disclosure object
   */
  generateAIAnalysis(disclosure) {
    const sentimentAnalysis = this.analyzeSentiment(disclosure.summary || disclosure.title);
    
    const templates = {
      positive: [
        'Bu duyuru şirket için olumlu gelişmelere işaret ediyor.',
        'Yatırımcılar için umut verici bir bildirim.',
        'Şirketin büyüme stratejisini destekleyen bir açıklama.'
      ],
      negative: [
        'Bu bildirim kısa vadede hisse fiyatı üzerinde baskı oluşturabilir.',
        'Yatırımcıların dikkatli olması gereken bir durum.',
        'Risk faktörlerinin değerlendirilmesi gerekiyor.'
      ],
      neutral: [
        'Rutin bir bildirim, önemli bir etki beklenmemektedir.',
        'Standart bir kamuyu aydınlatma duyurusu.',
        'Mevcut durumun devamını gösteren bir açıklama.'
      ]
    };

    // Deterministik seçim: bildirim başlığından seed üret (Math.random kaldırıldı)
    const titleSeed = (disclosure.title || disclosure.summary || '').split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
    const list = templates[sentimentAnalysis.sentiment];
    const randomTemplate = list[Math.abs(titleSeed) % list.length];

    return randomTemplate;
  }

  /**
   * Save disclosures to database
   */
  async saveDisclosuresToDB(disclosures) {
    try {
      let savedCount = 0;

      for (const disclosure of disclosures) {
        // Find stock if stock code exists
        let stockId = null;
        if (disclosure.stockCode) {
          const stock = await Stock.findOne({ 
            where: { symbol: disclosure.stockCode } 
          });
          if (stock) stockId = stock.id;
        }

        // Sentiment analysis
        const sentimentResult = this.analyzeSentiment(
          `${disclosure.title} ${disclosure.summary}`
        );

        // AI analysis
        const aiAnalysis = this.generateAIAnalysis(disclosure);

        // Save to database
        await News.findOrCreate({
          where: { 
            title: disclosure.title,
            publishedAt: disclosure.publishDate
          },
          defaults: {
            stockId,
            title: disclosure.title,
            content: disclosure.summary,
            summary: disclosure.summary,
            source: 'KAP',
            sourceUrl: disclosure.url,
            publishedAt: disclosure.publishDate,
            sentiment: sentimentResult.sentiment,
            sentimentScore: sentimentResult.score,
            category: disclosure.category,
            aiAnalysis
          }
        });

        savedCount++;
      }

      logger.info(`✓ Saved ${savedCount} KAP disclosures to database`);
      return savedCount;

    } catch (error) {
      logger.error('Error saving KAP disclosures:', error.message);
      throw error;
    }
  }

  /**
   * Get date string for API
   */
  getDateString(daysOffset) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('T')[0];
  }

  /**
   * Fetch and process KAP news
   */
  async updateKAPNews() {
    try {
      logger.info('🔄 Fetching KAP disclosures...');
      
      const disclosures = await this.fetchLatestDisclosures(50);
      logger.info(`Found ${disclosures.length} disclosures`);
      
      if (disclosures.length > 0) {
        await this.saveDisclosuresToDB(disclosures);
      }
      
      return disclosures;

    } catch (error) {
      logger.error('KAP update error:', error.message);
      throw error;
    }
  }

  /**
   * Get news by stock symbol
   */
  async getNewsByStock(symbol, limit = 20) {
    try {
      const stock = await Stock.findOne({ where: { symbol } });
      if (!stock) return [];

      const news = await News.findAll({
        where: { stockId: stock.id },
        order: [['publishedAt', 'DESC']],
        limit
      });

      return news;

    } catch (error) {
      logger.error(`Error getting news for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Get news by sentiment
   */
  async getNewsBySentiment(sentiment, limit = 20) {
    try {
      const news = await News.findAll({
        where: { sentiment },
        include: [{ 
          model: Stock, 
          attributes: ['symbol', 'name', 'sector'] 
        }],
        order: [['publishedAt', 'DESC']],
        limit
      });

      return news;

    } catch (error) {
      logger.error('Error getting news by sentiment:', error.message);
      return [];
    }
  }

  /**
   * Detect anomalies (unusual news volume)
   */
  async detectAnomalies() {
    try {
      const { sequelize } = require('../models');
      
      // Get news count per stock for last 7 days
      const results = await sequelize.query(`
        SELECT 
          s.symbol,
          s.name,
          COUNT(*) as news_count,
          AVG(CASE WHEN n.sentiment = 'positive' THEN 1 ELSE 0 END) * 100 as positive_pct
        FROM news n
        INNER JOIN stocks s ON s.id = n.stock_id
        WHERE n.published_at >= NOW() - INTERVAL '7 days'
        GROUP BY s.id, s.symbol, s.name
        HAVING COUNT(*) > 5
        ORDER BY news_count DESC
        LIMIT 10
      `, { type: sequelize.QueryTypes.SELECT });

      return results.map(r => ({
        symbol: r.symbol,
        name: r.name,
        newsCount: parseInt(r.news_count),
        positivePct: parseFloat(r.positive_pct).toFixed(2),
        status: r.news_count > 10 ? 'high' : 'medium'
      }));

    } catch (error) {
      logger.error('Error detecting anomalies:', error.message);
      return [];
    }
  }
}

module.exports = new KAPService();
