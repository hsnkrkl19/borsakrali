const axios = require('axios');
const cheerio = require('cheerio');

async function testIsYatirim() {
    const symbol = 'THYAO';
    // İş Yatırım Mali Tablo Endpoint'i (Genelde AJAX ile JSON dönerler ama sayfadan da bulabiliriz)
    // Direkt mali tablo sayfasına gidelim
    const url = `https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/mali-tablolar.aspx?hisse=${symbol}`;

    console.log(`Testing connection to: ${url}`);

    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Referer': 'https://www.isyatirim.com.tr/'
            }
        });

        const $ = cheerio.load(data);
        const title = $('title').text();
        console.log('Page Title:', title);

        // Tablo var mı kontrol et
        const tableCount = $('table').length;
        console.log('Tables found:', tableCount);

        // İş Yatırım verileri genelde dinamik yükler. Sayfa içinde veri var mı?
        const bodyText = $('body').text();
        if (bodyText.includes('Dönen Varlıklar')) {
            console.log('✅ "Dönen Varlıklar" text found directly in HTML!');
        } else {
            console.log('❌ "Dönen Varlıklar" not found (Data likely loaded via AJAX).');

            // Eğer AJAX ise, hangi URL'e istek atıyor onu bulmamız lazım.
            // Genelde GetMaliTabloData gibi bir endpoint vardır.
        }

    } catch (e) {
        console.error('Request Failed:', e.message);
    }
}

testIsYatirim();
