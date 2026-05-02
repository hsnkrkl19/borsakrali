// yahoo-finance2 v2.14+ ESM-only paketi; CommonJS projesinde dinamik import gerekli.
let _yfPromise = null;
const getYF = () => {
  if (!_yfPromise) {
    _yfPromise = import('yahoo-finance2').then(m => m.default || m);
  }
  return _yfPromise;
};
const logger = require('../utils/logger');

class YahooFinanceService {
  constructor() {
    this.timeout = parseInt(process.env.YAHOO_FINANCE_TIMEOUT) || 30000;
  }

  /**
   * Fetch historical data for a BIST stock
   * @param {string} symbol - Stock symbol (e.g., 'THYAO')
   * @param {string} period - Time period ('1d', '5d', '1mo', '3mo', '1y', 'max')
   * @param {string} interval - Data interval ('1m', '5m', '1h', '1d', '1wk', '1mo')
   * @returns {Array} Array of OHLCV data
   */
  async getHistoricalData(symbol, period = '3mo', interval = '1d') {
    try {
      const yahooSymbol = `${symbol}.IS`; // BIST stocks end with .IS

      const yahooFinance = await getYF();
      const result = await yahooFinance.chart(yahooSymbol, {
        period1: this.getPeriodDate(period),
        interval,
      }, { timeout: this.timeout });

      if (!result || !result.quotes || result.quotes.length === 0) {
        logger.warn(`No data found for ${yahooSymbol}`);
        return null;
      }

      // Direkt olarak quotes array'ini don (analiz icin kolay kullanim)
      const quotes = result.quotes
        .filter(q => q.close !== null && q.close !== undefined)
        .map(q => ({
          date: q.date,
          open: parseFloat(q.open) || 0,
          high: parseFloat(q.high) || 0,
          low: parseFloat(q.low) || 0,
          close: parseFloat(q.close) || 0,
          volume: parseInt(q.volume) || 0
        }));

      return quotes;
    } catch (error) {
      logger.error(`Error fetching ${symbol} from Yahoo Finance:`, error.message);
      return null;
    }
  }

  /**
   * Fetch current quote for a stock
   */
  async getCurrentQuote(symbol) {
    try {
      const yahooSymbol = `${symbol}.IS`;
      const yahooFinance = await getYF();
      const quote = await yahooFinance.quote(yahooSymbol, {}, { timeout: this.timeout });

      if (!quote) return null;

      return {
        symbol,
        price: quote.regularMarketPrice,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        volume: quote.regularMarketVolume,
        previousClose: quote.regularMarketPreviousClose,
        open: quote.regularMarketOpen,
        high: quote.regularMarketDayHigh,
        low: quote.regularMarketDayLow,
        marketCap: quote.marketCap
      };
    } catch (error) {
      logger.error(`Error fetching current quote for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Fetch quotes for multiple stocks
   */
  async getBatchQuotes(symbols) {
    try {
      const yahooSymbols = symbols.map(s => `${s}.IS`);
      const yahooFinance = await getYF();
      const quotes = await yahooFinance.quote(yahooSymbols, {}, { timeout: this.timeout });

      if (!quotes) return [];

      return Object.entries(quotes).map(([symbol, data]) => ({
        symbol: symbol.replace('.IS', ''),
        price: data.regularMarketPrice,
        change: data.regularMarketChange,
        changePercent: data.regularMarketChangePercent,
        volume: data.regularMarketVolume
      }));
    } catch (error) {
      logger.error('Error fetching batch quotes:', error.message);
      return [];
    }
  }

  /**
   * Get period date for Yahoo Finance API
   */
  getPeriodDate(period) {
    const now = new Date();
    const periodMap = {
      '1d': 1,
      '5d': 5,
      '1mo': 30,
      '3mo': 90,
      '6mo': 180,
      '1y': 365,
      'ytd': null,
      'max': null
    };

    if (period === 'ytd') {
      return new Date(now.getFullYear(), 0, 1);
    }
    if (period === 'max') {
      return new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
    }

    const days = periodMap[period] || 90;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  /**
   * Get BIST 100 index data
   */
  async getBIST100() {
    try {
      const yahooFinance = await getYF();
      const quote = await yahooFinance.quote('XU100.IS', {}, { timeout: this.timeout });

      if (!quote) return null;

      return {
        symbol: 'XU100',
        name: 'BIST 100 Endeksi',
        price: quote.regularMarketPrice,
        value: quote.regularMarketPrice,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        volume: quote.regularMarketVolume,
        previousClose: quote.regularMarketPreviousClose,
        dayHigh: quote.regularMarketDayHigh,
        dayLow: quote.regularMarketDayLow,
        open: quote.regularMarketOpen
      };
    } catch (error) {
      logger.error('Error fetching BIST 100:', error.message);
      return null;
    }
  }

  /**
   * Get financial data for fundamental analysis
   */
  async getFinancialData(symbol) {
    try {
      const yahooSymbol = `${symbol}.IS`;
      const yahooFinance = await getYF();

      const [quoteSummary] = await Promise.all([
        yahooFinance.quoteSummary(yahooSymbol, {
          modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail']
        }, { timeout: this.timeout })
      ]);

      if (!quoteSummary) return null;

      const fd = quoteSummary.financialData || {};
      const ks = quoteSummary.defaultKeyStatistics || {};
      const sd = quoteSummary.summaryDetail || {};

      return {
        // Temel Oranlar
        peRatio: sd.trailingPE || ks.trailingPE,
        forwardPE: sd.forwardPE || ks.forwardPE,
        pbRatio: ks.priceToBook,
        pegRatio: ks.pegRatio,

        // Karlilik
        profitMargin: fd.profitMargins,
        operatingMargin: fd.operatingMargins,
        returnOnEquity: fd.returnOnEquity,
        returnOnAssets: fd.returnOnAssets,

        // Buyume
        revenueGrowth: fd.revenueGrowth,
        earningsGrowth: fd.earningsGrowth,

        // Deger
        enterpriseValue: ks.enterpriseValue,
        marketCap: sd.marketCap,
        bookValue: ks.bookValue,

        // Temettü
        dividendYield: sd.dividendYield,
        dividendRate: sd.dividendRate,
        payoutRatio: sd.payoutRatio,

        // Borc
        debtToEquity: fd.debtToEquity,
        currentRatio: fd.currentRatio,
        quickRatio: fd.quickRatio
      };
    } catch (error) {
      logger.error(`Error fetching financial data for ${symbol}:`, error.message);
      return null;
    }
  }
}

module.exports = new YahooFinanceService();
