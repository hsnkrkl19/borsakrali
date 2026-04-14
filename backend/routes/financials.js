/**
 * Finansal Veri Routes
 * Bilanço, Gelir Tablosu, Nakit Akım ve Mali Oranlar
 */

const express = require('express');
const router = express.Router();

// Mock datas - gerçek KAP API entegrasyonu için placeholder
const { generateBalanceSheet, generateIncomeStatement, generateCashFlow, generateRatios } = require('../services/financialDataService');

/**
 * Bilanço Verileri
 * GET /api/financials/:symbol/balance-sheet?period=annual&years=5
 */
router.get('/:symbol/balance-sheet', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { period = 'annual', years = 5 } = req.query;

        // TODO: KAP API'den gerçek veri çek
        const balanceSheet = await generateBalanceSheet(symbol, period, parseInt(years));

        res.json({
            success: true,
            symbol,
            period,
            data: balanceSheet,
            lastUpdate: new Date().toISOString(),
            source: 'KAP - Kamuyu Aydınlatma Platformu'
        });
    } catch (error) {
        console.error('Balance sheet error:', error);
        res.status(500).json({ success: false, error: 'Bilanço verisi alınamadı' });
    }
});

/**
 * Gelir Tablosu Verileri
 * GET /api/financials/:symbol/income-statement?period=annual&years=5
 */
router.get('/:symbol/income-statement', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { period = 'annual', years = 5 } = req.query;

        const incomeStatement = await generateIncomeStatement(symbol, period, parseInt(years));

        res.json({
            success: true,
            symbol,
            period,
            data: incomeStatement,
            lastUpdate: new Date().toISOString(),
            source: 'KAP - Kamuyu Aydınlatma Platformu'
        });
    } catch (error) {
        console.error('Income statement error:', error);
        res.status(500).json({ success: false, error: 'Gelir tablosu verisi alınamadı' });
    }
});

/**
 * Nakit Akım Tablosu
 * GET /api/financials/:symbol/cash-flow?period=annual&years=5
 */
router.get('/:symbol/cash-flow', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { period = 'annual', years = 5 } = req.query;

        const cashFlow = await generateCashFlow(symbol, period, parseInt(years));

        res.json({
            success: true,
            symbol,
            period,
            data: cashFlow,
            lastUpdate: new Date().toISOString(),
            source: 'KAP - Kamuyu Aydınlatma Platformu'
        });
    } catch (error) {
        console.error('Cash flow error:', error);
        res.status(500).json({ success: false, error: 'Nakit akım verisi alınamadı' });
    }
});

/**
 * Mali Oranlar
 * GET /api/financials/:symbol/ratios
 */
router.get('/:symbol/ratios', async (req, res) => {
    try {
        const { symbol } = req.params;

        const ratios = await generateRatios(symbol);

        res.json({
            success: true,
            symbol,
            data: ratios,
            lastUpdate: new Date().toISOString(),
            source: 'KAP - Kamuyu Aydınlatma Platformu'
        });
    } catch (error) {
        console.error('Ratios error:', error);
        res.status(500).json({ success: false, error: 'Oran verisi alınamadı' });
    }
});

/**
 * Tüm Finansal Verileri Getir
 * GET /api/financials/:symbol/all?period=annual&years=5
 */
router.get('/:symbol/all', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { period = 'annual', years = 5 } = req.query;

        const [balanceSheet, incomeStatement, cashFlow, ratios] = await Promise.all([
            generateBalanceSheet(symbol, period, parseInt(years)),
            generateIncomeStatement(symbol, period, parseInt(years)),
            generateCashFlow(symbol, period, parseInt(years)),
            generateRatios(symbol)
        ]);

        res.json({
            success: true,
            symbol,
            period,
            data: {
                balanceSheet,
                incomeStatement,
                cashFlow,
                ratios
            },
            lastUpdate: new Date().toISOString(),
            source: 'KAP - Kamuyu Aydınlatma Platformu'
        });
    } catch (error) {
        console.error('All financial data error:', error);
        res.status(500).json({ success: false, error: 'Finansal veriler alınamadı' });
    }
});

module.exports = router;
