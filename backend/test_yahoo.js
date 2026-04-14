const axios = require('axios');

async function testYahoo(symbol) {
    const ticker = `${symbol}.IS`;
    console.log(`Testing connection for ${ticker}...`);

    // 1. Basit Test (Sadece fiyat)
    try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}`;
        const res = await axios.get(url);
        console.log('✅ Basic Chart API: Success');
    } catch (e) {
        console.log('❌ Basic Chart API: Failed', e.message);
    }

    // 2. Kapsamlı Test (Bizim kullandığımız URL)
    try {
        const modules = ['financialData', 'defaultKeyStatistics', 'balanceSheetHistory'].join(',');
        const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}`;
        console.log(`URL: ${url}`);

        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        if (res.data.quoteSummary.result) {
            console.log('✅ QuoteSummary API: Success');
            console.log('Data found:', !!res.data.quoteSummary.result[0].balanceSheetHistory);
        } else {
            console.log('❌ QuoteSummary API: No Result');
        }
    } catch (e) {
        console.log('❌ QuoteSummary API: Failed');
        if (e.response) {
            console.log('Status:', e.response.status);
            console.log('Data:', JSON.stringify(e.response.data).substring(0, 200));
        } else {
            console.log('Error:', e.message);
        }
    }
}

testYahoo('THYAO');
