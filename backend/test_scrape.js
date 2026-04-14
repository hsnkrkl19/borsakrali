const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeTest() {
    const symbol = 'SISE.IS';
    const url = `https://finance.yahoo.com/quote/${symbol}/financials`;

    console.log(`Scraping ${url}...`);

    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        console.log('Page loaded.');

        // Tablo başlıklarını (tarihleri) bul
        const headers = [];
        $('.tableHeader span').each((i, el) => {
            headers.push($(el).text());
        });
        console.log('Headers:', headers);

        // Satırları bul
        const rows = [];
        $('.tableBody .row').each((i, el) => { // Class isimleri farazi, yahoo sürekli değiştirir
            rows.push($(el).text());
        });

        console.log('Sample Row Length:', rows.length);

        // Alternatif: Sayfa kaynağında JSON ara
        const scriptContent = $('script').filter((i, el) => {
            return $(el).html().includes('root.App.main');
        }).html();

        if (scriptContent) {
            console.log('Found embedded JSON data!');
            // Biraz parse etmeye çalışalım
        } else {
            console.log('Embedded JSON NOT found.');
        }

    } catch (e) {
        console.error(e.message);
    }
}

scrapeTest();
