const axios = require('axios');
const cheerio = require('cheerio');

async function testInvesting() {
    const url = 'https://tr.investing.com/equities/turk-hava-yollari-balance-sheet';
    console.log(`Testing Investing: ${url}`);

    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const $ = cheerio.load(data);
        const title = $('title').text();
        console.log('Title:', title);

        const table = $('#rrtable').length > 0; // Investing eski tasarım
        const newTable = $('table').length;

        if (table || newTable > 0) {
            console.log('✅ Investing: Table FOUND!');
            // İçeriğe bak
            if ($('body').text().includes('Toplam Varlıklar')) {
                console.log('✅ Data terms found!');
            }
        } else {
            console.log('❌ Investing: No table found.');
        }

    } catch (e) {
        console.log('Investing failed:', e.message);
    }
}

testInvesting();
