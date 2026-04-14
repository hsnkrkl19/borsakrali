/**
 * Bulk Data Updater Service
 * Updates market data for ALL BIST stocks dynamically
 */

const { Stock, MarketData } = require('../models');
const yahooFinanceService = require('./yahooFinanceService');
const formulaService = require('./formulaService');
const logger = require('../utils/logger');

class BulkDataUpdaterService {
  
  /**
   * Update market data for ALL stocks in database
   */
  async updateAllStocks() {
    try {
      logger.info('🔄 Starting bulk market data update for all stocks...');
      
      const stocks = await Stock.findAll({ where: { isActive: true } });
      logger.info(`📊 Found ${stocks.length} active stocks`);
      
      let successCount = 0;
      let failCount = 0;
      
      for (const stock of stocks) {
        try {
          await this.updateStockData(stock.symbol);
          successCount++;
          
          // Rate limiting - wait 500ms between requests
          await this.sleep(500);
          
        } catch (error) {
          logger.error(`Failed to update ${stock.symbol}:`, error.message);
          failCount++;
        }
      }
      
      logger.info(`✅ Bulk update completed: ${successCount} success, ${failCount} failed`);
      
      return { success: successCount, failed: failCount, total: stocks.length };
      
    } catch (error) {
      logger.error('Bulk update error:', error);
      throw error;
    }
  }

  /**
   * Update data for a SINGLE stock (dynamic)
   * @param {string} symbol - Stock symbol (e.g., 'THYAO', 'GARAN', any BIST stock)
   */
  async updateStockData(symbol) {
    try {
      // 1. Get stock from database
      let stock = await Stock.findOne({ where: { symbol } });
      
      if (!stock) {
        logger.warn(`Stock ${symbol} not found in database, skipping...`);
        return null;
      }
      
      // 2. Fetch historical data from Yahoo Finance
      const historicalData = await yahooFinanceService.getHistoricalData(symbol, '1y', '1d');
      
      if (!historicalData || !historicalData.quotes || historicalData.quotes.length === 0) {
        logger.warn(`No data available for ${symbol}`);
        return null;
      }
      
      // 3. Calculate technical indicators
      const closePrices = historicalData.quotes.map(q => q.close);
      const emas = formulaService.calculateAllEMAs(closePrices);
      const rsi = formulaService.calculateRSI(closePrices, 14);
      const macd = formulaService.calculateMACD(closePrices);
      
      // 4. Save data for each day
      for (const quote of historicalData.quotes) {
        await MarketData.upsert({
          stockId: stock.id,
          date: quote.date,
          open: quote.open,
          high: quote.high,
          low: quote.low,
          close: quote.close,
          volume: quote.volume,
          ...emas,
          rsi,
          macd: macd?.macd,
          macdSignal: macd?.signal
        });
      }
      
      logger.info(`✅ Updated ${symbol}: ${historicalData.quotes.length} records`);
      
      return {
        symbol,
        recordCount: historicalData.quotes.length,
        latestPrice: closePrices[closePrices.length - 1],
        emas,
        rsi
      };
      
    } catch (error) {
      logger.error(`Error updating ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Get current prices for ALL stocks
   */
  async getCurrentPricesForAll() {
    try {
      const stocks = await Stock.findAll({ where: { isActive: true } });
      const symbols = stocks.map(s => s.symbol);
      
      // Batch request - more efficient
      const batchSize = 50;
      const results = [];
      
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const quotes = await yahooFinanceService.getBatchQuotes(batch);
        results.push(...quotes);
        
        // Rate limiting
        if (i + batchSize < symbols.length) {
          await this.sleep(1000);
        }
      }
      
      return results;
      
    } catch (error) {
      logger.error('Error fetching current prices:', error);
      throw error;
    }
  }

  /**
   * Update ONLY current prices (fast update for live data)
   */
  async updateCurrentPrices() {
    try {
      logger.info('🔄 Updating current prices for all stocks...');
      
      const stocks = await Stock.findAll({ where: { isActive: true } });
      const symbols = stocks.map(s => s.symbol);
      
      // Use batch quotes for efficiency
      const quotes = await yahooFinanceService.getBatchQuotes(symbols);
      
      // Update each stock's latest market data
      for (const quote of quotes) {
        const stock = stocks.find(s => s.symbol === quote.symbol);
        if (!stock) continue;
        
        await MarketData.update(
          {
            close: quote.price,
            volume: quote.volume,
            updatedAt: new Date()
          },
          {
            where: {
              stockId: stock.id,
              date: new Date().toISOString().split('T')[0]
            }
          }
        );
      }
      
      logger.info(`✅ Updated current prices for ${quotes.length} stocks`);
      
      return quotes;
      
    } catch (error) {
      logger.error('Error updating current prices:', error);
      throw error;
    }
  }

  /**
   * Calculate technical indicators for ALL stocks
   */
  async calculateIndicatorsForAll() {
    try {
      logger.info('🧮 Calculating indicators for all stocks...');
      
      const stocks = await Stock.findAll({ where: { isActive: true } });
      let count = 0;
      
      for (const stock of stocks) {
        // Get last 200 days of data
        const marketData = await MarketData.findAll({
          where: { stockId: stock.id },
          order: [['date', 'DESC']],
          limit: 200
        });
        
        if (marketData.length < 50) continue;
        
        const closePrices = marketData.map(d => parseFloat(d.close)).reverse();
        
        // Calculate indicators
        const emas = formulaService.calculateAllEMAs(closePrices);
        const rsi = formulaService.calculateRSI(closePrices, 14);
        const macd = formulaService.calculateMACD(closePrices);
        const bollinger = formulaService.calculateBollingerBands(closePrices);
        const saturation = formulaService.calculatePriceSaturation(closePrices[closePrices.length - 1], emas);
        
        // Update latest record
        const latestRecord = marketData[0];
        await MarketData.update(
          {
            ema5: emas.ema5,
            ema9: emas.ema9,
            ema21: emas.ema21,
            ema50: emas.ema50,
            ema200: emas.ema200,
            rsi,
            macd: macd?.macd,
            macdSignal: macd?.signal
          },
          { where: { id: latestRecord.id } }
        );
        
        count++;
      }
      
      logger.info(`✅ Calculated indicators for ${count} stocks`);
      
      return { success: count };
      
    } catch (error) {
      logger.error('Error calculating indicators:', error);
      throw error;
    }
  }

  /**
   * Get stocks by sector (dynamic filtering)
   */
  async getStocksBySector(sector) {
    return await Stock.findAll({
      where: { sector, isActive: true }
    });
  }

  /**
   * Search stocks (dynamic search)
   */
  async searchStocks(query) {
    const { Op } = require('sequelize');
    
    return await Stock.findAll({
      where: {
        [Op.or]: [
          { symbol: { [Op.iLike]: `%${query}%` } },
          { name: { [Op.iLike]: `%${query}%` } }
        ],
        isActive: true
      },
      limit: 20
    });
  }

  /**
   * Sleep helper for rate limiting
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate if stock symbol is valid BIST stock
   */
  async isValidBistStock(symbol) {
    const stock = await Stock.findOne({ where: { symbol, isActive: true } });
    return !!stock;
  }
}

module.exports = new BulkDataUpdaterService();
