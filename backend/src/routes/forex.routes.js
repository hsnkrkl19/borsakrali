/**
 * Forex / Parite Routes — Borsa Krali (çoklu-zaman, çoklu-strateji)
 *
 * 10 enstrüman × 5 TF (5m/15m/1h/4h/1d) gün-içi+swing long/short sinyalleri,
 * güven notu + giriş/SL/TP/lot/kâr-zarar + MetaTrader5 emri. Misafir modeline
 * uygun public (auth yok). Her dk cron üretir, bellekte tutulur.
 *
 * ?equity=  → portföy değeri (varsayılan 10000). Sinyaller yeniden taranmadan
 *             lot/kâr-zarar anında ölçeklenir.
 */

const express = require('express');
const router = express.Router();

const forexEngine = require('../services/forex/forexEngineMTF');
const forexTracker = require('../services/forex/forexSignalTracker');
const brokerPrices = require('../services/forex/brokerPrices');
const accountReport = require('../services/forex/accountReport');
const dailyGuard = require('../services/forex/forexDailyGuard');
const { listInstruments } = require('../services/forex/forexInstruments');

function checkExecToken(req) {
  const need = process.env.FOREX_EXEC_TOKEN;
  if (!need) return { ok: false, code: 503, error: 'exec-feed-disabled' };
  const got = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim() || req.query.token || (req.body && req.body.token);
  if (got !== need) return { ok: false, code: 401, error: 'unauthorized' };
  return { ok: true };
}

function parseEquity(req) {
  const e = parseFloat(req.query.equity);
  if (!(e > 0)) return undefined;
  return Math.max(100, Math.min(10_000_000, e));
}

router.get('/instruments', (req, res) => {
  res.json({ success: true, instruments: listInstruments(), tfs: forexEngine.TFS });
});

router.get('/signals', async (req, res) => {
  try {
    const equity = parseEquity(req);
    let snap = forexEngine.getLatest();
    if (!snap) snap = await forexEngine.generate(equity || forexEngine.DEFAULT_EQUITY);
    else if (equity && equity !== snap.equity) snap = forexEngine.rescale(equity);
    if (!snap) return res.status(503).json({ success: false, error: 'Forex sinyalleri henüz hazır değil — birkaç saniye sonra tekrar deneyin' });
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const equity = parseEquity(req) || (parseFloat(req.body?.equity) > 0 ? parseFloat(req.body.equity) : undefined);
    const snap = await forexEngine.generate(equity || forexEngine.DEFAULT_EQUITY);
    res.json({ success: true, ...snap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Otomatik yürütme akışı (MT5 köprüsü) ────────────────────────────────────
// Tracker'ın AÇIK pozisyonları (Telegram'daki sinyallerin aynısı, #kod dahil).
// Token korumalı: FOREX_EXEC_TOKEN env yoksa 503 (kapalı); eşleşmezse 401.
router.get('/positions', async (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, error: auth.error });
  try {
    await forexTracker.load();
    const positions = forexTracker.getOpen().map(p => ({
      code: p.code, instrumentId: p.instrumentId, symbol: p.symbol, direction: p.direction,
      precision: p.precision, entry: p.entry, stop: p.stop, target1: p.target1, target2: p.target2,
      confidence: p.confidence, tfs: p.tfs, mt5Symbol: p.mt5Symbol || p.instrumentId,
      issuedAt: p.issuedAt, stopSetSec: p.stopSetSec,
    }));
    res.json({ success: true, count: positions.length, generatedAt: new Date().toISOString(), positions });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// VPS köprüsü bir pozisyonu MT5'te kapatınca (haber molası / hafta sonu / broker
// stop-out / TP2 dolumu / elle) buraya bildirir → backend "hâlâ açık" sanıp aynı
// kodu TERS fiyattan yeniden AÇMAZ (bot=telefon desync çözümü). Token korumalı.
router.post('/closed', async (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, error: auth.error });
  const code = req.body && req.body.code;
  if (!code) return res.status(400).json({ success: false, error: 'code-required' });
  try {
    // profit (gerçek USD) + price (kapanış fiyatı) opsiyonel: öğrenme/fren sınıflandırması
    // için (eski köprü göndermez — dropClosed onsuz da ihtiyatlı sınıflandırır).
    const r = await forexTracker.dropClosed(String(code), (req.body && req.body.reason) || 'bridge', {
      profit: req.body && req.body.profit,
      price: req.body && req.body.price,
    });
    res.json({ success: true, ...r });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Köprü (PC'de) canlı broker bid/ask'lerini buraya yollar → engine livePrice olarak kullanır.
router.post('/broker-prices', (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, error: auth.error });
  const n = brokerPrices.set(req.body && req.body.prices);
  res.json({ success: true, stored: n });
});

router.get('/broker-prices', (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, error: auth.error });
  res.json({ success: true, prices: brokerPrices.all() });
});

// VPS köprüsü MT5'ten okuduğu GERÇEK (broker) kâr/zararı buraya POST'lar →
// backend Telegram kanalına basar (VPS token tutmaz). kind: 'close' | 'daily'.
router.post('/account-report', async (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, error: auth.error });
  try {
    // Gerçek broker günlük P/L'i GÜNLÜK ZARAR FRENİNE besle (2026-07-06 olayı):
    // realizedToday eşiği aşarsa backend o gün yeni pozisyon üretmez.
    try { dailyGuard.noteBroker(req.body || {}); } catch (_) {}
    const r = await accountReport.push(req.body || {});
    res.json({ success: true, ...r });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/signal/:id', async (req, res) => {
  try {
    const equity = parseEquity(req) || forexEngine.DEFAULT_EQUITY;
    const result = await forexEngine.analyzeOne(req.params.id, equity);
    if (!result) return res.status(404).json({ success: false, error: `${req.params.id} forex evreninde yok` });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
