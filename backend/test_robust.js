const service = require('./services/realFinancialDataService');

async function test() {
    console.log('Testing Robust Service...');
    const data = await service.fetchYahooFinancials('THYAO');
    if (data) {
        console.log('SUCCESS!');
        console.log('Balance Sheet Years:', data.balanceSheet.annual.length);
        console.log('Sample Asset:', data.balanceSheet.annual[0]?.totalAssets?.raw);
    } else {
        console.log('FAILED');
    }
}

test();
