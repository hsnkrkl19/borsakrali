const service = require('./services/realFinancialDataService');

async function debugData() {
    console.log('Fetching SISE data for inspection...');
    try {
        const data = await service.fetchYahooFinancials('SISE');

        if (!data) {
            console.log('Data is null');
            return;
        }

        console.log('--- DATA KEYS ---');
        console.log(Object.keys(data));

        if (data.balanceSheet) {
            console.log('--- BALANCE SHEET ---');
            console.log('Annual Length:', data.balanceSheet.annual?.length);
            console.log('Quarterly Length:', data.balanceSheet.quarterly?.length);

            if (data.balanceSheet.annual?.length > 0) {
                console.log('Sample Annual Item Keys:', Object.keys(data.balanceSheet.annual[0]));
                console.log('Sample Annual Item:', JSON.stringify(data.balanceSheet.annual[0], null, 2));
            }
        }

        if (data.financialData) {
            console.log('--- FINANCIAL DATA ---');
            console.log(JSON.stringify(data.financialData, null, 2));
        }

    } catch (e) {
        console.error(e);
    }
}

debugData();
