'use strict';

/**
 * Birleşik köprü feed'i — borsakrali_mt5_all.py bu ucu çeker.
 *
 * botCompetition'daki TÜM yarışan + panelden AÇIK botların açık paper
 * pozisyonlarını, her bot ayrı magic ile MT5'te açılacak şekilde döndürür.
 * Aynı FOREX_EXEC_TOKEN ile korunur (mevcut köprülerle tek sır). Yalnız-okur:
 * bu uç MT5'e emir GÖNDERMEZ; köprü kararı kendi tarafında verir.
 */

const express = require('express');
const router = express.Router();
const competitionManager = require('../services/botCompetition/competitionManager');
const builderStore = require('../services/botBuilder/store');
const customBotRunner = require('../services/botBuilder/customBotRunner');
const mt5TradeNotifier = require('../services/mt5TradeNotifier');
const realResults = require('../services/realResults/store');
const lifecycleReadiness = require('../services/lifecycleReadiness');

function checkExecToken(req) {
  const need = process.env.FOREX_EXEC_TOKEN;
  if (!need) return { ok: false, code: 503, error: 'exec-feed-disabled' };
  const got = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    || req.query.token || (req.body && req.body.token);
  if (got !== need) return { ok: false, code: 401, error: 'unauthorized' };
  return { ok: true };
}

function requireLifecycleReady(res) {
  const status = lifecycleReadiness.status();
  if (status.ready) return true;
  res.status(503).json({
    success: false, ready: false, retryable: true,
    error: 'broker-lifecycle-restoring', phase: status.phase,
  });
  return false;
}

// GET /api/bridge/positions — açık competition pozisyonları (köprü feed'i).
router.get('/positions', (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, error: auth.error });
  if (!requireLifecycleReady(res)) return undefined;
  try {
    // forExecution: adanmış köprüsü olan botlar (forex-signals → borsakrali_mt5.py,
    // mt5-scanner → borsakrali_mt5_scanner.py) bu feed'e GİRMEZ. 2026-07-24
    // denetimi: giriyorlardı → aynı pozisyon iki köprüde iki ayrı magic'le
    // açılıyordu (dedup magic+sembol+yön bazlı olduğu için ikisi de geçiyordu)
    // → gerçek risk 2 katı. Otorite adanmış köprüdür (iz-süren SL / EOD kapatma
    // / kapanış geri-bildirimi yalnız orada).
    const feed = competitionManager.bridgeFeed({ forExecution: true });
    // 15 botun TF filtresi: panelde seçilen zaman dilimleri dışındaki pozisyonlar
    // köprüye gönderilmez (filtre boşsa hepsi geçer; TF bilinmiyorsa geçer).
    let positions = (feed.positions || []).filter((p) => {
      const tf = p.timeframe;
      if (!tf) return true;
      try { return builderStore.tfAllowed(p.botId, tf); } catch (_) { return true; }
    });
    // Custom botların (16., 17. ...) açık pozisyonlarını ekle.
    if (feed.enabled) {
      try { positions = positions.concat(customBotRunner.feed()); } catch (_) {}
    }
    // Executable feed rows are audit candidates, not Telegram signals.  A
    // signal is emitted only after /state contains a broker-confirmed ticket.
    try { mt5TradeNotifier.observeCandidates(positions); } catch (_) { /* execution feed remains independent */ }
    res.json({ success: true, enabled: feed.enabled, generatedAt: feed.generatedAt, count: positions.length, positions });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/bridge/results — köprü MT5 deal geçmişini (gerçek kapanan işlemler)
// magic-bazlı yollar. Lider tablosu + günlük rapor bunu GERÇEK sonuç olarak kullanır.
// POST /api/bridge/state — SİNYAL = İŞLEM (1:1). Köprü her turda MT5'teki AÇIK
// pozisyonlarını + yeni kapananları bildirir; daha önce duyurulmamış olanlar için
// Telegram mesajı atılır. Kaynak MT5'in kendisi olduğundan sinyal/işlem sapması
// yapısal olarak imkânsızdır.
router.post('/state', express.json({ limit: '2mb' }), async (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, error: auth.error });
  if (!requireLifecycleReady(res)) return undefined;
  try {
    let results = { ingested: 0, invalid: 0, total: realResults.summary().deals };
    // Kapananlar aynı yükte geldiyse gerçek-sonuç deposunu da besle (lider tablosu).
    if (Array.isArray(req.body && req.body.closed) && req.body.closed.length) {
      results = realResults.ingest(req.body.closed, req.body);
    }
    const lifecycle = await mt5TradeNotifier.ingestState(req.body || {});
    if (lifecycle.retryableFailures > 0 || lifecycle.invalid > 0
        || (lifecycle.decisions && lifecycle.decisions.invalid > 0)
        || results.invalid > 0) {
      return res.status(503).json({
        success: false, retryable: true,
        error: lifecycle.invalid > 0 || results.invalid > 0
          ? 'invalid-broker-lifecycle-row' : 'trade-notification-pending',
        ...lifecycle, results, lifecycle, audit: lifecycle.audit,
      });
    }
    // Keep the legacy top-level lifecycle counters while also returning the
    // structured result used by the reconciliation endpoint/tests.
    res.json({ success: true, ...lifecycle, results, lifecycle, audit: lifecycle.audit });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/results', express.json({ limit: '2mb' }), async (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, error: auth.error });
  if (!requireLifecycleReady(res)) return undefined;
  try {
    const deals = req.body && req.body.deals;
    const results = realResults.ingest(deals, req.body || {});
    const lifecycle = await mt5TradeNotifier.ingestState({
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
      closed: Array.isArray(deals) ? deals : [],
    });
    if (lifecycle.retryableFailures > 0 || lifecycle.invalid > 0
        || (lifecycle.decisions && lifecycle.decisions.invalid > 0)
        || results.invalid > 0) {
      return res.status(503).json({
        success: false, retryable: true,
        error: lifecycle.invalid > 0 || results.invalid > 0
          ? 'invalid-broker-lifecycle-row' : 'trade-notification-pending',
        ...results, ...lifecycle, results, lifecycle, audit: lifecycle.audit,
      });
    }
    // /results historically returned ingested/invalid/total at top level.
    res.json({ success: true, ...results, ...lifecycle, results, lifecycle, audit: lifecycle.audit });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Broker lifecycle reconciliation. Rejected execution decisions are retained as
// audit facts but never counted as Telegram signals.
router.get('/audit', (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, error: auth.error });
  if (!requireLifecycleReady(res)) return undefined;
  try {
    const details = String(req.query.details || '') === '1';
    const audit = mt5TradeNotifier.auditStatus({ details, limit: req.query.limit });
    res.json({ success: true, audit, realResults: realResults.summary() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Authenticated pre-order readiness probe. It intentionally avoids loading or
// mutating notifier stores while restoration is pending.
router.get('/ready', (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, ready: false, error: auth.error });
  if (!requireLifecycleReady(res)) return undefined;
  if (mt5TradeNotifier.notificationsDisabled()) {
    return res.status(503).json({
      success: false, ready: false, retryable: true,
      error: 'trade-notifications-disabled',
    });
  }
  return res.json({ success: true, ready: true });
});

module.exports = router;
