import yahooFinance from 'yahoo-finance2';

async function test() {
    try {
        console.log('Testing Lib...');
        // quoteSummary yerine fundamentals, veya quoteSummary modülleri
        const result = await yahooFinance.quoteSummary('SISE.IS', {
            modules: ['financialData', 'defaultKeyStatistics', 'balanceSheetHistory']
        });

        console.log('Result found!');
        if (result.balanceSheetHistory && result.balanceSheetHistory.balanceSheetStatements) {
            console.log('Balance Sheet Item:', result.balanceSheetHistory.balanceSheetStatements[0]);
        } else {
            console.log('No balance sheet data in result');
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
