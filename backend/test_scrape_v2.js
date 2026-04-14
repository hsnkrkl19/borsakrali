const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeFinancials(symbol) {
    const url = `https://finance.yahoo.com/quote/${symbol}/financials`;
    console.log(`Scraping ${url}...`);

    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'max-age=0',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            }
        });

        const $ = cheerio.load(data);
        const title = $('title').text();
        console.log('Title:', title);

        // Tabloyu bulmaya çalışalım (Yahoo classları karışıktır, genelde 'table' veya 'div' yapısı)
        // Yeni tasarımda tablo 'table' tagi olmayabilir.

        const textContent = $('body').text();
        if (textContent.includes('Total Revenue')) {
            console.log('✅ "Total Revenue" found in content!');
        } else {
            console.log('❌ "Total Revenue" NOT found.');
        }

    } catch (e) {
        console.error('Request Error:', e.message);
    }
}

scrapeFinancials('SISE.IS');
