/**
 * Borsapy Veri Merkezi route'ları.
 * TEFAS, TCMB enflasyon/faiz, bono ve banka kuru endpoint'lerini
 * tek namespace altında toplar: /api/borsapy/*
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const svc = require('../services/borsapyDataService');

const router = express.Router();

// Tüm endpoint'lere makul rate limit — kaynaklar (TEFAS/canlidoviz/doviz.com)
// üst üste sorgulanırsa baniliriz. Cache zaten devrede.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Çok sık istek atıldı, biraz bekleyin.' },
});
router.use(limiter);

const ok = (res, data) => res.json({ success: true, ...data });
const fail = (res, status, error) => res.status(status).json({ success: false, error });

// ─── TEFAS ──────────────────────────────────────────────────────────
router.get('/tefas/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString();
    if (!q || q.length < 1) return fail(res, 400, 'Arama metni gerekli');
    const funds = await svc.searchTefasFunds(q);
    ok(res, { funds, count: funds.length });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

router.get('/tefas/:code', async (req, res) => {
  try {
    const detail = await svc.getTefasFundDetail(req.params.code);
    ok(res, { fund: detail });
  } catch (err) {
    fail(res, err.message === 'Fon bulunamadı' ? 404 : 500, err.message);
  }
});

router.get('/tefas/:code/history', async (req, res) => {
  try {
    const periyod = parseInt(req.query.period, 10) || 12;
    const series = await svc.getTefasFundHistory(req.params.code, periyod);
    ok(res, { code: req.params.code.toUpperCase(), period: periyod, series });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// ─── TCMB & Makro ───────────────────────────────────────────────────
router.get('/tcmb/policy-rate', async (req, res) => {
  try {
    const data = await svc.getTcmbPolicyRate();
    ok(res, { rates: data });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

router.get('/bonds/yields', async (req, res) => {
  try {
    const data = await svc.getBondYields();
    ok(res, { yields: data });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

router.post('/inflation/calculate', async (req, res) => {
  try {
    const { amount, fromYear, fromMonth, toYear, toMonth } = req.body || {};
    if (!amount || !fromYear || !fromMonth || !toYear || !toMonth) {
      return fail(res, 400, 'amount, fromYear, fromMonth, toYear, toMonth zorunlu');
    }
    const result = await svc.calculateInflation(amount, fromYear, fromMonth, toYear, toMonth);
    ok(res, { result });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// GET formu da pratiklik için
router.get('/inflation/calculate', async (req, res) => {
  try {
    const { amount, fromYear, fromMonth, toYear, toMonth } = req.query || {};
    if (!amount || !fromYear || !fromMonth || !toYear || !toMonth) {
      return fail(res, 400, 'amount, fromYear, fromMonth, toYear, toMonth zorunlu');
    }
    const result = await svc.calculateInflation(amount, fromYear, fromMonth, toYear, toMonth);
    ok(res, { result });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// ─── Banka Kurları ──────────────────────────────────────────────────
router.get('/banks/rates', async (req, res) => {
  try {
    const currency = (req.query.currency || 'USD').toString().toUpperCase();
    const data = await svc.getBankRates(currency);
    ok(res, { ...data });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// Çoklu döviz — UI tek requeste hepsini alabilsin
router.get('/banks/rates-multi', async (req, res) => {
  try {
    const list = (req.query.currencies || 'USD,EUR').toString()
      .split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 6);
    const results = {};
    await Promise.all(list.map(async (c) => {
      results[c] = await svc.getBankRates(c);
    }));
    ok(res, { results });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// ─── VIOP (Vadeli İşlem) ────────────────────────────────────────────
router.get('/viop', async (req, res) => {
  try {
    const data = await svc.getViopContracts();
    ok(res, { viop: data });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

router.get('/viop/:category', async (req, res) => {
  try {
    const valid = Object.keys(svc.VIOP_SECTIONS);
    if (!valid.includes(req.params.category)) {
      return fail(res, 400, `Geçersiz kategori. Seçenekler: ${valid.join(', ')}`);
    }
    const data = await svc.getViopByCategory(req.params.category);
    ok(res, data);
  } catch (err) {
    fail(res, 500, err.message);
  }
});

router.get('/viop/search/:symbol', async (req, res) => {
  try {
    const data = await svc.searchViopBySymbol(req.params.symbol);
    ok(res, data);
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// ─── EVDS (TCMB) ────────────────────────────────────────────────────
router.get('/evds/categories', async (req, res) => {
  try {
    const data = await svc.getEvdsCategories();
    ok(res, { data });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

router.get('/evds/series-list/:datagroup', async (req, res) => {
  try {
    const data = await svc.getEvdsSeriesList(req.params.datagroup);
    ok(res, { data });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

router.get('/evds/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString();
    if (!q) return fail(res, 400, 'Arama metni gerekli');
    const data = await svc.searchEvds(q);
    ok(res, { data });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

router.get('/evds/series/:code', async (req, res) => {
  try {
    const period = (req.query.period || '1y').toString();
    const data = await svc.getEvdsSeriesData(req.params.code, period);
    ok(res, { data });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// ─── Eurobond ───────────────────────────────────────────────────────
router.get('/eurobond/yields', async (req, res) => {
  try {
    const data = await svc.getEurobondYields();
    ok(res, { data });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// ─── Teknik Scanner ─────────────────────────────────────────────────
router.get('/scanner', async (req, res) => {
  try {
    const universe = (req.query.universe || 'bist30').toString();
    const criteria = {
      rsiBelow:      req.query.rsiBelow      != null ? Number(req.query.rsiBelow)      : null,
      rsiAbove:      req.query.rsiAbove      != null ? Number(req.query.rsiAbove)      : null,
      priceAboveSma: req.query.priceAboveSma != null ? Number(req.query.priceAboveSma) : null,
      priceBelowSma: req.query.priceBelowSma != null ? Number(req.query.priceBelowSma) : null,
      volumeMin:     req.query.volumeMin     != null ? Number(req.query.volumeMin)     : null,
      changeMin:     req.query.changeMin     != null ? Number(req.query.changeMin)     : null,
      changeMax:     req.query.changeMax     != null ? Number(req.query.changeMax)     : null,
      smaCross:      req.query.smaCross || null,
    };
    const data = await svc.scanStocks(criteria, universe);
    ok(res, data);
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// ─── Fund Watchlist (kullanıcı bazlı, in-memory) ────────────────────
const fundWatchlists = new Map(); // userId → Set<fonKodu>

function getUserKey(req) {
  // Token varsa header'dan id parse et — yoksa 'guest'
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    return `tok:${token.slice(0, 16)}`;
  }
  return req.ip || 'guest';
}

router.get('/funds/watchlist', async (req, res) => {
  try {
    const key = getUserKey(req);
    const codes = [...(fundWatchlists.get(key) || new Set())];
    // Detayları çek
    const funds = await Promise.all(codes.map(async (c) => {
      try { return await svc.getTefasFundDetail(c); }
      catch { return { code: c, error: true }; }
    }));
    ok(res, { codes, funds });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

router.post('/funds/watchlist', (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return fail(res, 400, 'Fon kodu gerekli');
    const key = getUserKey(req);
    if (!fundWatchlists.has(key)) fundWatchlists.set(key, new Set());
    fundWatchlists.get(key).add(String(code).toUpperCase());
    ok(res, { codes: [...fundWatchlists.get(key)] });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

router.delete('/funds/watchlist/:code', (req, res) => {
  try {
    const key = getUserKey(req);
    if (fundWatchlists.has(key)) fundWatchlists.get(key).delete(req.params.code.toUpperCase());
    ok(res, { codes: [...(fundWatchlists.get(key) || new Set())] });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

module.exports = router;
