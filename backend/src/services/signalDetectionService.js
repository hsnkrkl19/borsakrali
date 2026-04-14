/**
 * Signal Detection Service
 * Detects trading signals using technical analysis
 */

const { Stock, MarketData, Signal } = require('../models');
const formulaService = require('./formulaService');
const logger = require('../utils/logger');

class SignalDetectionService {

  /**
   * Detect signals for ALL stocks
   */
  async detectSignalsForAll() {
    try {
      logger.info('🔍 Starting signal detection for all stocks...');
      
      const stocks = await Stock.findAll({ where: { isActive: true } });
      let detectedCount = 0;

      for (const stock of stocks) {
        const signals = await this.detectSignalsForStock(stock.symbol);
        detectedCount += signals.length;
      }

      logger.info(`✓ Signal detection complete: ${detectedCount} signals detected`);
      return { success: true, count: detectedCount };

    } catch (error) {
      logger.error('Signal detection error:', error);
      throw error;
    }
  }

  /**
   * Detect signals for a single stock
   */
  async detectSignalsForStock(symbol) {
    try {
      const stock = await Stock.findOne({ where: { symbol } });
      if (!stock) return [];

      // Get last 200 days of market data
      const marketData = await MarketData.findAll({
        where: { stockId: stock.id },
        order: [['date', 'DESC']],
        limit: 200
      });

      if (marketData.length < 50) return [];

      const prices = marketData.map(d => parseFloat(d.close)).reverse();
      const highs = marketData.map(d => parseFloat(d.high)).reverse();
      const lows = marketData.map(d => parseFloat(d.low)).reverse();
      const volumes = marketData.map(d => parseInt(d.volume)).reverse();

      const signals = [];

      // Strategy 1: EMA Crossover
      const emaCrossover = this.detectEMACrossover(prices);
      if (emaCrossover) {
        signals.push({
          stockId: stock.id,
          strategy: 'ema_crossover',
          period: '1d',
          detectionPrice: prices[prices.length - 1],
          detectionDate: new Date(),
          metadata: emaCrossover
        });
      }

      // Strategy 2: RSI Oversold/Overbought
      const rsiSignal = this.detectRSISignal(prices);
      if (rsiSignal) {
        signals.push({
          stockId: stock.id,
          strategy: 'rsi_signal',
          period: '1d',
          detectionPrice: prices[prices.length - 1],
          detectionDate: new Date(),
          metadata: rsiSignal
        });
      }

      // Strategy 3: MACD Signal
      const macdSignal = this.detectMACDSignal(prices);
      if (macdSignal) {
        signals.push({
          stockId: stock.id,
          strategy: 'macd_crossover',
          period: '1d',
          detectionPrice: prices[prices.length - 1],
          detectionDate: new Date(),
          metadata: macdSignal
        });
      }

      // Strategy 4: Bollinger Breakout
      const bollingerSignal = this.detectBollingerBreakout(prices);
      if (bollingerSignal) {
        signals.push({
          stockId: stock.id,
          strategy: 'bollinger_breakout',
          period: '1d',
          detectionPrice: prices[prices.length - 1],
          detectionDate: new Date(),
          metadata: bollingerSignal
        });
      }

      // Strategy 5: Volume Spike
      const volumeSignal = this.detectVolumeSpike(volumes, prices);
      if (volumeSignal) {
        signals.push({
          stockId: stock.id,
          strategy: 'volume_spike',
          period: '1d',
          detectionPrice: prices[prices.length - 1],
          detectionDate: new Date(),
          metadata: volumeSignal
        });
      }

      // Save signals to database
      for (const signal of signals) {
        await Signal.create(signal);
      }

      return signals;

    } catch (error) {
      logger.error(`Signal detection error for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Detect EMA crossover (Golden Cross / Death Cross)
   */
  detectEMACrossover(prices) {
    const ema50 = formulaService.calculateEMA(prices, 50);
    const ema200 = formulaService.calculateEMA(prices, 200);

    if (!ema50 || !ema200) return null;

    // Golden Cross: EMA50 crosses above EMA200
    if (ema50 > ema200) {
      const prevPrices = prices.slice(0, -1);
      const prevEma50 = formulaService.calculateEMA(prevPrices, 50);
      const prevEma200 = formulaService.calculateEMA(prevPrices, 200);

      if (prevEma50 && prevEma200 && prevEma50 < prevEma200) {
        return {
          type: 'golden_cross',
          ema50,
          ema200,
          signal: 'buy'
        };
      }
    }

    // Death Cross: EMA50 crosses below EMA200
    if (ema50 < ema200) {
      const prevPrices = prices.slice(0, -1);
      const prevEma50 = formulaService.calculateEMA(prevPrices, 50);
      const prevEma200 = formulaService.calculateEMA(prevPrices, 200);

      if (prevEma50 && prevEma200 && prevEma50 > prevEma200) {
        return {
          type: 'death_cross',
          ema50,
          ema200,
          signal: 'sell'
        };
      }
    }

    return null;
  }

  /**
   * Detect RSI oversold/overbought
   */
  detectRSISignal(prices) {
    const rsi = formulaService.calculateRSI(prices, 14);
    if (!rsi) return null;

    if (rsi < 30) {
      return {
        type: 'oversold',
        rsi,
        signal: 'buy'
      };
    }

    if (rsi > 70) {
      return {
        type: 'overbought',
        rsi,
        signal: 'sell'
      };
    }

    return null;
  }

  /**
   * Detect MACD crossover
   */
  detectMACDSignal(prices) {
    const macd = formulaService.calculateMACD(prices);
    if (!macd) return null;

    // Bullish crossover: MACD crosses above signal
    if (macd.macd > macd.signal && macd.histogram > 0) {
      return {
        type: 'bullish_crossover',
        macd: macd.macd,
        signal: macd.signal,
        histogram: macd.histogram,
        signalType: 'buy'
      };
    }

    // Bearish crossover: MACD crosses below signal
    if (macd.macd < macd.signal && macd.histogram < 0) {
      return {
        type: 'bearish_crossover',
        macd: macd.macd,
        signal: macd.signal,
        histogram: macd.histogram,
        signalType: 'sell'
      };
    }

    return null;
  }

  /**
   * Detect Bollinger Band breakout
   */
  detectBollingerBreakout(prices) {
    const currentPrice = prices[prices.length - 1];
    const bollinger = formulaService.calculateBollingerBands(prices);
    
    if (!bollinger) return null;

    // Upper band breakout (potential sell)
    if (currentPrice > bollinger.upper) {
      return {
        type: 'upper_breakout',
        price: currentPrice,
        upperBand: bollinger.upper,
        middleBand: bollinger.middle,
        signal: 'sell'
      };
    }

    // Lower band breakout (potential buy)
    if (currentPrice < bollinger.lower) {
      return {
        type: 'lower_breakout',
        price: currentPrice,
        lowerBand: bollinger.lower,
        middleBand: bollinger.middle,
        signal: 'buy'
      };
    }

    return null;
  }

  /**
   * Detect volume spike
   */
  detectVolumeSpike(volumes, prices) {
    if (volumes.length < 20) return null;

    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(-20, -1).reduce((sum, v) => sum + v, 0) / 19;

    // Volume spike: 2x average
    if (currentVolume > avgVolume * 2) {
      const currentPrice = prices[prices.length - 1];
      const prevPrice = prices[prices.length - 2];
      const priceChange = ((currentPrice - prevPrice) / prevPrice) * 100;

      return {
        type: 'volume_spike',
        currentVolume,
        avgVolume,
        ratio: (currentVolume / avgVolume).toFixed(2),
        priceChange: priceChange.toFixed(2),
        signal: priceChange > 0 ? 'buy' : 'sell'
      };
    }

    return null;
  }

  /**
   * Update existing signals with current prices
   */
  async updateActiveSignals() {
    try {
      const activeSignals = await Signal.findAll({
        where: { status: 'active' },
        include: [{ model: Stock }]
      });

      for (const signal of activeSignals) {
        const latestData = await MarketData.findOne({
          where: { stockId: signal.stockId },
          order: [['date', 'DESC']]
        });

        if (latestData) {
          const currentPrice = parseFloat(latestData.close);
          const changePercent = ((currentPrice - signal.detectionPrice) / signal.detectionPrice) * 100;

          await signal.update({
            currentPrice,
            changePercent: changePercent.toFixed(2),
            status: changePercent > 0 ? 'positive' : 'negative'
          });
        }
      }

      logger.info(`✓ Updated ${activeSignals.length} active signals`);

    } catch (error) {
      logger.error('Error updating signals:', error.message);
    }
  }
}

module.exports = new SignalDetectionService();
