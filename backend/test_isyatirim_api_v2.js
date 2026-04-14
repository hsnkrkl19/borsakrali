const axios = require('axios');

async function testIsYatirimAPI() {
    const url = 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/MaliTablo';

    // Doğru parametreler (UFRS - XI_29)
    const parameters = {
        companyCode: 'THYAO',
        exchange: 'TRY',
        financialGroup: 'XI_29',
        year1: 2024,
        period1: 9,
        year2: 2023,
        period2: 9,
        year3: 2023,
        period3: 12,
        year4: 2022,
        period4: 12,
    };

    console.log(`Testing POST to ${url}...`);

    try {
        const { data } = await axios.post(url, parameters, {
            headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });

        // Veri string gelebilir veya object
        let parsedData = data;
        if (typeof data === 'string') {
            try {
                parsedData = JSON.parse(data);
                console.log('✅ Parsed from string!');
            } catch (e) {
                console.log('Cannot parse string directly. Sample:', data.substring(0, 500));
                return;
            }
        }

        if (Array.isArray(parsedData) || (parsedData.value && Array.isArray(parsedData.value))) {
            const rows = Array.isArray(parsedData) ? parsedData : parsedData.value;
            console.log('✅ SUCCESS! Rows found:', rows.length);

            // İlk 3 satırı yazdıralım ki neymiş görelim
            console.log('Row 1:', JSON.stringify(rows[0], null, 2));
            console.log('Row 10:', JSON.stringify(rows[9], null, 2));
        } else {
            console.log('Structure unknown:', Object.keys(parsedData));
        }

    } catch (e) {
        console.error('Request Failed:', e.message);
    }
}

testIsYatirimAPI();
