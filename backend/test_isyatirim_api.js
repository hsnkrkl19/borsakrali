const axios = require('axios');

async function testIsYatirimAPI() {
    const url = 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo';

    // Parametreleri tam tutturmak lazım.
    // Genelde "getMaliTablo" gibi bir func adı query string'de olabilir.

    // Tam URL: https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/mali-tablolar.aspx?hisse=THYAO
    // Network tabında isteği yakalamak lazım.

    // Deneme 1: Query string ile JSON çekme (Bazı siteler buna izin verir)
    // https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo?companyCode=THYAO&period1=2024/9...

    // Deneme 2: Standart POST (Kütüphaneler bunu kullanır)
    const parameters = {
        companyCode: 'THYAO',
        exchange: 'TRY',
        financialGroup: 'XI_29', // Konsolide UFRS
        year1: 2024,
        period1: 9,
        year2: 2023,
        period2: 9,
        year3: 2024,
        period3: 6,
        year4: 2024,
        period4: 3
    };

    console.log(`Testing POST to ${url}...`);

    try {
        const { data } = await axios.post(url, parameters, {
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/mali-tablolar.aspx'
            }
        });

        console.log('Response Status: OK');
        console.log('Data Type:', typeof data);

        if (data.value && Array.isArray(data.value)) {
            console.log('✅ Success! Found data rows:', data.value.length);
            console.log('Sample Row:', data.value[0]);
        } else if (Array.isArray(data)) {
            console.log('✅ Success! Found array data:', data.length);
            console.log('Sample Row:', data[0]);
        } else {
            console.log('Data received but structure unknown:', Object.keys(data));
        }

    } catch (e) {
        console.error('Request Failed:', e.message);
        if (e.response) {
            console.error('Response Data:', e.response.data);
        }
    }
}

testIsYatirimAPI();
