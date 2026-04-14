/**
 * Database Seeder
 * Run this script to populate database with all BIST stocks
 * Usage: node src/utils/seedDatabase.js
 */

require('dotenv').config();
const { sequelize } = require('../models');
const bistStocksService = require('../services/bistStocksService');
const logger = require('./logger');

async function seedDatabase() {
  try {
    logger.info('🌱 Starting database seeding...');
    
    // 1. Test connection
    await sequelize.authenticate();
    logger.info('✓ Database connection established');
    
    // 2. Sync models
    await sequelize.sync({ alter: true });
    logger.info('✓ Database models synchronized');
    
    // 3. Seed BIST stocks
    const result = await bistStocksService.seedStocksToDatabase();
    logger.info(`✓ Seeded ${result.count} stocks to database`);
    
    // 4. Show summary
    const sectors = await bistStocksService.getAllSectors();
    logger.info(`✓ Total sectors: ${sectors.length}`);
    logger.info(`Sectors: ${sectors.join(', ')}`);
    
    logger.info('🎉 Database seeding completed successfully!');
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ Database seeding failed:', error.message);
    process.exit(1);
  }
}

// Run seeder
seedDatabase();
