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

function checkExecToken(req) {
  const need = process.env.FOREX_EXEC_TOKEN;
  if (!need) return { ok: false, code: 503, error: 'exec-feed-disabled' };
  const got = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    || req.query.token || (req.body && req.body.token);
  if (got !== need) return { ok: false, code: 401, error: 'unauthorized' };
  return { ok: true };
}

// GET /api/bridge/positions — açık competition pozisyonları (köprü feed'i).
router.get('/positions', (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, error: auth.error });
  try {
    const feed = competitionManager.bridgeFeed();
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
    res.json({ success: true, enabled: feed.enabled, generatedAt: feed.generatedAt, count: positions.length, positions });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/bridge/results — köprü MT5 deal geçmişini (gerçek kapanan işlemler)
// magic-bazlı yollar. Lider tablosu + günlük rapor bunu GERÇEK sonuç olarak kullanır.
router.post('/results', express.json({ limit: '2mb' }), (req, res) => {
  const auth = checkExecToken(req);
  if (!auth.ok) return res.status(auth.code).json({ success: false, error: auth.error });
  try {
    const realResults = require('../services/realResults/store');
    const r = realResults.ingest(req.body && req.body.deals);
    res.json({ success: true, ...r });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
