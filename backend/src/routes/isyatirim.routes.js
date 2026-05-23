/**
 * İş Yatırım Veri Endpoint'leri (Python `isyatirimhisse` portu)
 *
 * GET /api/isyatirim/stock/:symbol?start=DD-MM-YYYY&end=DD-MM-YYYY
 * GET /api/isyatirim/stock?symbols=THYAO,ASELS&start=...&end=...
 * GET /api/isyatirim/index/:code?start=DD-MM-YYYY&end=DD-MM-YYYY
 * GET /api/isyatirim/index?indices=XU100,XU030&start=...&end=...
 * GET /api/isyatirim/financials/:symbol?startYear=2023&endYear=2025&exchange=TRY&group=1
 * GET /api/isyatirim/financials?symbols=THYAO,ASELS&startYear=2023...
 *
 * Tarihler dd-mm-yyyy biçiminde gelir. start yoksa son 1 yıl varsayılır.
 */

const express = require('express');
const router = express.Router();

const { fetchStockData, fetchIndexData, fetchFinancials, isoToTr } = require('../services/isYatirimDataService');

const KNOWN_INDICES = [
    { code: 'XU100', name: 'BIST 100' },
    { code: 'XU030', name: 'BIST 30' },
    { code: 'XU050', name: 'BIST 50' },
    { code: 'XBANK', name: 'BIST Bankacılık' },
    { code: 'XUSIN', name: 'BIST Sınai' },
    { code: 'XUMAL', name: 'BIST Mali' },
    { code: 'XUHIZ', name: 'BIST Hizmetler' },
    { code: 'XUTEK', name: 'BIST Teknoloji' },
    { code: 'XKMYA', name: 'BIST Kimya' },
    { code: 'XGIDA', name: 'BIST Gıda' },
    { code: 'XHOLD', name: 'BIST Holding ve Yatırım' },
    { code: 'XGMYO', name: 'BIST GMYO' },
    { code: 'XELKT', name: 'BIST Elektrik' },
    { code: 'XILTM', name: 'BIST İletişim' },
    { code: 'XINSA', name: 'BIST İnşaat' },
    { code: 'XMANA', name: 'BIST Ana Metal' },
    { code: 'XMADN', name: 'BIST Madencilik' },
    { code: 'XSPOR', name: 'BIST Spor' },
    { code: 'XTAST', name: 'BIST Taş, Toprak' },
    { code: 'XTEKS', name: 'BIST Tekstil, Deri' },
    { code: 'XTRZM', name: 'BIST Turizm' },
    { code: 'XULAS', name: 'BIST Ulaştırma' },
    { code: 'XSGRT', name: 'BIST Sigorta' },
    { code: 'XYORT', name: 'BIST Yatırım Ortaklığı' },
    { code: 'XK100', name: 'BIST 100-30' },
    { code: 'XKTUM', name: 'BIST Katılım Tümü' },
    { code: 'XSRDR', name: 'BIST Sürdürülebilirlik' },
    { code: 'XTMTU', name: 'BIST Temettü' },
    { code: 'XTM25', name: 'BIST Temettü 25' },
    { code: 'XKURY', name: 'BIST Kurumsal Yönetim' },
    { code: 'XYUZO', name: 'BIST Yıldız Pazarı' },
];

const FINANCIAL_GROUPS = [
    { value: '1', label: 'XI_29 (Yeni Düzen)' },
    { value: '2', label: 'UFRS (Eski Düzen)' },
    { value: '3', label: 'UFRS_K (Konsolide UFRS)' },
];

function defaultStart() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return isoToTr(d.toISOString());
}

function defaultEnd() {
    return isoToTr(new Date().toISOString());
}

router.get('/meta', (req, res) => {
    res.json({
        success: true,
        indices: KNOWN_INDICES,
        financialGroups: FINANCIAL_GROUPS,
        note: 'Veri kaynağı: isyatirim.com.tr — Python kütüphanesi urazakgul/isyatirimhisse Node.js portu',
    });
});

// ── Hisse ─────────────────────────────────────────────────────────────────
async function stockHandler(req, res) {
    try {
        const symbols = (req.params.symbol ? [req.params.symbol] : String(req.query.symbols || '').split(',')).map(s => s.trim()).filter(Boolean);
        if (!symbols.length) return res.status(400).json({ success: false, error: 'En az bir sembol gerekli' });
        const start = req.query.start || defaultStart();
        const end = req.query.end || defaultEnd();
        const data = await fetchStockData(symbols, start, end);
        res.json({ success: true, symbols, start, end, count: data.length, data, source: 'İş Yatırım — HisseTekil' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message || 'Hisse verisi alınamadı' });
    }
}
router.get('/stock/:symbol', stockHandler);
router.get('/stock', stockHandler);

// ── Endeks ────────────────────────────────────────────────────────────────
async function indexHandler(req, res) {
    try {
        const indices = (req.params.code ? [req.params.code] : String(req.query.indices || '').split(',')).map(s => s.trim()).filter(Boolean);
        if (!indices.length) return res.status(400).json({ success: false, error: 'En az bir endeks gerekli' });
        const start = req.query.start || defaultStart();
        const end = req.query.end || defaultEnd();
        const data = await fetchIndexData(indices, start, end);
        res.json({ success: true, indices, start, end, count: data.length, data, source: 'İş Yatırım — IndexHistoricalAll' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message || 'Endeks verisi alınamadı' });
    }
}
router.get('/index/:code', indexHandler);
router.get('/index', indexHandler);

// ── Mali Tablolar ─────────────────────────────────────────────────────────
async function financialsHandler(req, res) {
    try {
        const symbols = (req.params.symbol ? [req.params.symbol] : String(req.query.symbols || '').split(',')).map(s => s.trim()).filter(Boolean);
        if (!symbols.length) return res.status(400).json({ success: false, error: 'En az bir sembol gerekli' });
        const now = new Date();
        const startYear = parseInt(req.query.startYear || (now.getFullYear() - 2), 10);
        const endYear = parseInt(req.query.endYear || now.getFullYear(), 10);
        const exchange = (req.query.exchange === 'USD') ? 'USD' : 'TRY';
        const group = req.query.group || '1';

        const data = await fetchFinancials(symbols, startYear, endYear, exchange, group);
        res.json({
            success: true,
            symbols,
            startYear,
            endYear,
            exchange,
            group,
            count: data.length,
            data,
            source: 'İş Yatırım — MaliTablo',
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message || 'Finansal veri alınamadı' });
    }
}
router.get('/financials/:symbol', financialsHandler);
router.get('/financials', financialsHandler);

module.exports = router;
