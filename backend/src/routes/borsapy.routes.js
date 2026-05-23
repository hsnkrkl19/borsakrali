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
router.get('/tcmb/policy-rate', (req, res) => {
  try {
    const data = svc.getTcmbPolicyRate();
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

module.exports = router;
