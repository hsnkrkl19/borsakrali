import yahooFinance from 'yahoo-finance2'; // Default import

async function test() {
    try {
        console.log('Testing Lib V2...');
        // Kütüphane default export olmayabilir, instance'a bakalım
        console.log('Lib:', yahooFinance);

        const result = await yahooFinance.default.quoteSummary('SISE.IS', { // Bazen .default.default gerekiyor
            modules: ['financialData', 'balanceSheetHistory']
        });

        console.log('Success:', result.balanceSheetHistory?.balanceSheetStatements?.[0]);

    } catch (e) {
        console.error('Error:', e);
    }
}

test();
