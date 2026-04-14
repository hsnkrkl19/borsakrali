const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: (msg) => logger.debug(msg),
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 10,
      min: parseInt(process.env.DB_POOL_MIN) || 0,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
      idle: parseInt(process.env.DB_POOL_IDLE) || 10000
    }
  }
);

// Import models
const User = require('./User')(sequelize);
const Stock = require('./Stock')(sequelize);
const MarketData = require('./MarketData')(sequelize);
const Signal = require('./Signal')(sequelize);
const Watchlist = require('./Watchlist')(sequelize);
const Analysis = require('./Analysis')(sequelize);
const News = require('./News')(sequelize);
const StrategyPerformance = require('./StrategyPerformance')(sequelize);

// Define associations
User.hasMany(Watchlist, { foreignKey: 'userId', onDelete: 'CASCADE' });
Watchlist.belongsTo(User, { foreignKey: 'userId' });
Watchlist.belongsTo(Stock, { foreignKey: 'stockId' });

Stock.hasMany(MarketData, { foreignKey: 'stockId', onDelete: 'CASCADE' });
MarketData.belongsTo(Stock, { foreignKey: 'stockId' });

Stock.hasMany(Signal, { foreignKey: 'stockId', onDelete: 'CASCADE' });
Signal.belongsTo(Stock, { foreignKey: 'stockId' });

Stock.hasMany(Analysis, { foreignKey: 'stockId', onDelete: 'CASCADE' });
Analysis.belongsTo(Stock, { foreignKey: 'stockId' });

Stock.hasMany(News, { foreignKey: 'stockId', onDelete: 'SET NULL' });
News.belongsTo(Stock, { foreignKey: 'stockId' });

const db = {
  sequelize,
  Sequelize,
  User,
  Stock,
  MarketData,
  Signal,
  Watchlist,
  Analysis,
  News,
  StrategyPerformance
};

module.exports = db;
