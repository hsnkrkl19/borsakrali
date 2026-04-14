const kapService = require('../services/kapService');
const { News, Stock } = require('../models');
const logger = require('../utils/logger');

class KAPController {
  async getNews(req, res) {
    try {
      const { sentiment, limit = 20, stockSymbol } = req.query;
      const where = {};
      if (sentiment) where.sentiment = sentiment;
      
      let query = {
        where,
        include: [{ model: Stock, attributes: ['symbol', 'name', 'sector'] }],
        order: [['publishedAt', 'DESC']],
        limit: parseInt(limit)
      };

      if (stockSymbol) {
        const stock = await Stock.findOne({ where: { symbol: stockSymbol } });
        if (stock) where.stockId = stock.id;
      }

      const news = await News.findAll(query);
      res.json({ news });
    } catch (error) {
      logger.error('Get news error:', error);
      res.status(500).json({ error: 'Failed to fetch news' });
    }
  }

  async getNewsAnalysis(req, res) {
    try {
      const { id } = req.params;
      const newsItem = await News.findByPk(id, {
        include: [{ model: Stock }]
      });
      
      if (!newsItem) {
        return res.status(404).json({ error: 'News not found' });
      }

      res.json({ news: newsItem });
    } catch (error) {
      logger.error('Get news analysis error:', error);
      res.status(500).json({ error: 'Failed to fetch news analysis' });
    }
  }

  async getAnomalies(req, res) {
    try {
      const anomalies = await kapService.detectAnomalies();
      res.json({ anomalies });
    } catch (error) {
      logger.error('Get anomalies error:', error);
      res.status(500).json({ error: 'Failed to detect anomalies' });
    }
  }

  async updateNews(req, res) {
    try {
      const disclosures = await kapService.updateKAPNews();
      res.json({ 
        success: true, 
        count: disclosures.length,
        message: `Updated ${disclosures.length} disclosures`
      });
    } catch (error) {
      logger.error('Update news error:', error);
      res.status(500).json({ error: 'Failed to update news' });
    }
  }
}

module.exports = new KAPController();
