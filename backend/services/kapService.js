/**
 * KAP (Kamuyu Aydınlatma Platformu) Veri Servisi
 * Gerçek finansal verileri KAP'tan çeker
 * 
 * Not: Bu servis şu an mock data döndürüyor.
 * Gerçek KAP entegrasyonu için PyKap benzeri bir yaklaşım gerekir.
 */

const axios = require('axios');

// KAP API base URL (varsayılan - gerçek API key gerektirir)
const KAP_BASE_URL = 'https://www.kap.org.tr/tr/api';

/**
 * KAP'tan Finansal Tablo Verisi Çek
 * @param {string} symbol - Hisse sembolü (THYAO, GARAN, vb.)
 * @param {string} tableType - Tablo tipi (balance-sheet, income-statement, cash-flow)
 * @param {number} years - Kaç yıl geçmiş
 */
async function fetchKAPFinancialData(symbol, tableType, years = 3) {
    try {
        // TODO: Gerçek KAP API entegrasyonu
        // Şimdilik mock data döndürüyoruz

        console.log(`[KAP Service] Fetching ${tableType} for ${symbol} (${years} years)`);

        // Gerçek implementasyon için:
        // 1. KAP API key al
        // 2. Company ID'yi symbol'den bul
        // 3. Finansal tablo disclosure'ları çek
        // 4. XBRL verilerini parse et
        // 5. Standardize et ve döndür

        return null; // Şimdilik null, mock data service kullanacak

    } catch (error) {
        console.error(`[KAP Service] Error fetching ${tableType} for ${symbol}:`, error.message);
        return null;
    }
}

/**
 * Şirket Bilgilerini KAP'tan Getir
 */
async function fetchCompanyInfo(symbol) {
    // TODO: Gerçek KAP company lookup
    return {
        symbol,
        name: `${symbol} Company`,
        sector: 'Unknown',
        kapId: null
    };
}

/**
 * Son Dönem Bilançoları (2024-2026)
 */
async function getLatestBalanceSheets(symbol) {
    // 2024, 2025, 2026 yılları ve çeyrekler için
    const periods = [];
    const currentYear = 2026;

    for (let year = currentYear; year >= 2024; year--) {
        // Yıllık
        periods.push({
            year,
            period: `${year}`,
            type: 'annual'
        });

        // Çeyreklik
        for (let q = 4; q >= 1; q--) {
            periods.push({
                year,
                quarter: q,
                period: `${year}/Q${q}`,
                type: 'quarterly'
            });
        }
    }

    // TODO: Her dönem için gerçek veri çek
    return periods;
}

module.exports = {
    fetchKAPFinancialData,
    fetchCompanyInfo,
    getLatestBalanceSheets
};
