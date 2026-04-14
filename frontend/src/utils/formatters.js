/**
 * Finansal Veri Formatlama Yardımcıları
 * TL, %, Oran formatları
 */

/**
 * Para birimi formatla (Türk Lirası)
 * @param {number} value - Değer
 * @param {boolean} shortFormat - Kısa format (Milyar, Milyon)
 */
export function formatCurrency(value, shortFormat = true) {
    if (value === null || value === undefined || isNaN(value)) return '-';

    const absValue = Math.abs(value);
    const isNegative = value < 0;
    let formatted;

    if (shortFormat) {
        if (absValue >= 1e12) {
            formatted = (absValue / 1e12).toFixed(2) + ' Tr';
        } else if (absValue >= 1e9) {
            formatted = (absValue / 1e9).toFixed(2) + ' Mly';
        } else if (absValue >= 1e6) {
            formatted = (absValue / 1e6).toFixed(2) + ' Mn';
        } else if (absValue >= 1e3) {
            formatted = (absValue / 1e3).toFixed(2) + ' Bin';
        } else {
            formatted = absValue.toFixed(2);
        }
    } else {
        formatted = absValue.toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    return `${isNegative ? '-' : ''}${formatted} ₺`;
}

/**
 * Yüzde formatla
 */
export function formatPercent(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return `%${parseFloat(value).toFixed(decimals)}`;
}

/**
 * Oran formatla
 */
export function formatRatio(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return parseFloat(value).toFixed(decimals);
}

/**
 * Sayı formatla (binlik ayraçlı)
 */
export function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return value.toLocaleString('tr-TR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * Değişim rengi (pozitif/negatif)
 */
export function getChangeColor(value) {
    if (value > 0) return 'text-green-400';
    if (value < 0) return 'text-red-400';
    return 'text-gray-400';
}

/**
 * Trend ikonu
 */
export function getTrendIcon(current, previous) {
    if (!current || !previous) return null;
    if (current > previous) return '↑';
    if (current < previous) return '↓';
    return '→';
}

export default {
    formatCurrency,
    formatPercent,
    formatRatio,
    formatNumber,
    getChangeColor,
    getTrendIcon
};
