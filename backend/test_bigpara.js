const axios = require('axios');
const cheerio = require('cheerio');

async function testMynet() {
    const symbol = 'THYAO';
    const url = `https://finans.mynet.com/borsa/hisseler/${symbol.toLowerCase()}-turk-hava-yollari/bilanco/`;
    // Mynet URL yapısı hisse adına göre değişiyor, bu zor olabilir.

    // Daha kolayı: BigPara
    const urlBigPara = `https://bigpara.hurriyet.com.tr/borsa/hisse-fiyatlari/${symbol.toLowerCase()}-detay/mali-tablolar/`;

    console.log(`Testing BigPara: ${urlBigPara}`);

    try {
        const { data } = await axios.get(urlBigPara, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        const $ = cheerio.load(data);
        const title = $('title').text();
        console.log('Title:', title);

        if ($('body').text().includes('Dönen Varlıklar')) {
            console.log('✅ BigPara: Data Found directly!');
            // Tablo yapısını görelim
            const row = $('.maliTablo tr').first().text();
            console.log('Sample Row:', row);
        } else {
            console.log('❌ BigPara: Data missing.');
        }

    } catch (e) {
        console.log('BigPara failed:', e.message);
    }
}

testMynet();
