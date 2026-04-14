const yahooFinance = require('yahoo-finance2').default;

async function testLib() {
    try {
        console.log('Testing yahoo-finance2 lib...');
        const result = await yahooFinance.quoteSummary('THYAO.IS', {
            modules: ['financialData', 'defaultKeyStatistics', 'balanceSheetHistory']
        });
        console.log('Success!');
        console.log('Financial Data:', !!result.financialData);
    } catch (e) {
        console.log('Failed:', e.message);
    }
}

testLib();
