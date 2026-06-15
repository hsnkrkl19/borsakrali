/**
 * Custom Bots HTTP routes — kullanıcı-tanımlı sanal botlar
 *
 *   Meta:
 *     GET    /api/custom-bots/meta/strategies     — strateji + param şeması (UI)
 *     GET    /api/custom-bots/meta/universe       — BIST hisse listesi (seçici)
 *     GET    /api/custom-bots/meta/market-hours    — manuel işlem penceresi durumu
 *
 *   Bot tanımları:
 *     GET    /api/custom-bots                      — tüm botlar + özet durum
 *     POST   /api/custom-bots                      — yeni bot oluştur
 *     GET    /api/custom-bots/:id                  — tanım + tam durum
 *     PUT    /api/custom-bots/:id                  — tanımı güncelle
 *     DELETE /api/custom-bots/:id                  — botu sil (portföyüyle)
 *
 *   Portföy:
 *     GET    /api/custom-bots/:id/positions        — { open }
 *     GET    /api/custom-bots/:id/trades           — kapalı işlemler
 *
 *   Çalıştırma:
 *     POST   /api/custom-bots/:id/run              — günlük strateji taraması (arka plan)
 *     POST   /api/custom-bots/:id/tick             — gün-içi SL/TP kontrolü
 *     POST   /api/custom-bots/:id/pause | /resume  — duraklat / sürdür
 *     POST   /api/custom-bots/:id/reset            — portföyü sıfırla
 *
 *   MÜDAHALE (işlem-saati korumalı):
 *     POST   /api/custom-bots/:id/positions               — elle pozisyon aç
 *     POST   /api/custom-bots/:id/positions/:posId/close  — elle kapat
 *     PATCH  /api/custom-bots/:id/positions/:posId        — SL/TP düzenle
 *
 * Global model: bu uçlar herkese açıktır (site misafir-öncelikli; mevcut bot
 * uçlarıyla aynı yaklaşım). Doğrulama registry/engine katmanında merkezîdir.
 */

const express = require('express');
const router = express.Router();

const registry = require('../services/customBots/customBotRegistry');
const engine = require('../services/customBots/customBotEngine');
const strategies = require('../services/customBots/strategies');
const riskRules = require('../services/customBots/riskRules');
const marketHours = require('../services/marketHours');
const { allBistStocks } = require('../data/allBistStocks');

// Botu yükle ya da 404
function loadBot(req, res) {
  const bot = registry.get(req.params.id);
  if (!bot) { res.status(404).json({ ok: false, error: 'Bot bulunamadı' }); return null; }
  return bot;
}

// Tanımı + hafif durum özetiyle dışarı ver
function summarize(bot) {
  let status = null;
  try { status = engine.getStatus(bot); } catch (_) {}
  return {
    id: bot.id,
    name: bot.name,
    description: bot.description,
    strategyId: bot.strategyId,
    strategyLabel: strategies.get(bot.strategyId)?.label || bot.strategyId,
    universeCount: bot.universe.length,
    status: bot.status,
    sizing: bot.sizing,
    risk: bot.risk,
    riskSummary: riskRules.describe(bot.risk),
    createdAt: bot.createdAt,
    updatedAt: bot.updatedAt,
    summary: status ? {
      equity: status.equity,
      openCount: status.openCount,
      totalRealizedPnLPct: status.portfolio.totalRealizedPnLPct,
      winRate: status.portfolio.winRate,
      cash: status.portfolio.cash,
      capital: status.portfolio.capital,
      lastRunAt: status.portfolio.lastRunAt || null,
    } : null,
  };
}

// ── Meta ─────────────────────────────────────────────────────────────────────
router.get('/meta/strategies', (_req, res) => {
  res.json({ ok: true, strategies: strategies.publicList(), risk: {
    stopTypes: riskRules.STOP_TYPES, targetTypes: riskRules.TARGET_TYPES, defaults: riskRules.DEFAULT_RISK,
  }, limits: registry.LIMITS });
});

router.get('/meta/universe', (_req, res) => {
  res.json({ ok: true, stocks: allBistStocks.map(s => ({ symbol: s.symbol, name: s.name, sector: s.sector, market: s.market })) });
});

router.get('/meta/market-hours', (_req, res) => {
  res.json({ ok: true, window: marketHours.getWindowState() });
});

// ── Bot tanımları ────────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  try {
    const bots = registry.list().map(summarize);
    res.json({ ok: true, bots });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const result = registry.create(req.body || {});
    if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors });
    res.status(201).json({ ok: true, bot: summarize(result.def) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/:id', (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  try {
    res.json({ ok: true, bot, status: engine.getStatus(bot), strategy: strategies.get(bot.strategyId) ? {
      ...strategies.publicList().find(s => s.id === bot.strategyId),
    } : null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  try {
    const result = registry.update(bot.id, req.body || {});
    if (!result.ok) {
      if (result.notFound) return res.status(404).json({ ok: false, error: 'Bot bulunamadı' });
      return res.status(400).json({ ok: false, errors: result.errors });
    }
    res.json({ ok: true, bot: summarize(result.def) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  try {
    const result = registry.remove(bot.id);
    if (!result.ok) return res.status(404).json({ ok: false, error: 'Bot bulunamadı' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Portföy ──────────────────────────────────────────────────────────────────
router.get('/:id/positions', (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  try {
    const store = registry.storeFor(bot);
    res.json({ ok: true, open: store.listOpen() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/:id/trades', (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    res.json({ ok: true, trades: registry.storeFor(bot).listTrades(limit) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Çalıştırma ───────────────────────────────────────────────────────────────
router.post('/:id/run', (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  if (engine.isRunning(bot.id)) return res.json({ ok: true, started: false, busy: true });
  // Tarama uzun sürebilir (evren çekimi) → arka planda başlat, hemen dön.
  engine.runDaily(bot, { force: true }).catch(e => console.error(`[CustomBot ${bot.id}] run hata:`, e.message));
  res.json({ ok: true, started: true });
});

router.post('/:id/tick', async (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  try {
    const result = await engine.tick(bot, req.body || {});
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/:id/pause', (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  const r = registry.setStatus(bot.id, 'paused');
  res.json({ ok: true, status: r.def?.status });
});

router.post('/:id/resume', (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  const r = registry.setStatus(bot.id, 'active');
  res.json({ ok: true, status: r.def?.status });
});

router.post('/:id/reset', (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  try {
    res.json(engine.reset(bot));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── MÜDAHALE ─────────────────────────────────────────────────────────────────
function handleInterventionError(e, res) {
  if (e.code === 'MARKET_CLOSED') return res.status(409).json({ ok: false, error: e.message, code: e.code });
  if (['BAD_INPUT', 'DUPLICATE', 'MAX_POS', 'NO_PRICE', 'BAD_PRICE', 'OPEN_FAIL'].includes(e.code)) {
    return res.status(400).json({ ok: false, error: e.message, code: e.code });
  }
  if (e.code === 'NOT_FOUND') return res.status(404).json({ ok: false, error: e.message, code: e.code });
  return res.status(500).json({ ok: false, error: e.message });
}

// Elle pozisyon aç — body: { symbol, sizeTL?, stop?, target? }
router.post('/:id/positions', async (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  try {
    const position = await engine.manualOpen(bot, req.body || {});
    res.status(201).json({ ok: true, position });
  } catch (e) {
    handleInterventionError(e, res);
  }
});

// Elle kapat — body: { price? }
router.post('/:id/positions/:posId/close', async (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  try {
    const result = await engine.manualClose(bot, req.params.posId, req.body || {});
    res.json({ ok: true, result });
  } catch (e) {
    handleInterventionError(e, res);
  }
});

// SL/TP düzenle — body: { stop?, target? }  (null = kaldır)
router.patch('/:id/positions/:posId', (req, res) => {
  const bot = loadBot(req, res); if (!bot) return;
  try {
    const position = engine.manualAdjust(bot, req.params.posId, req.body || {});
    res.json({ ok: true, position });
  } catch (e) {
    handleInterventionError(e, res);
  }
});

module.exports = router;
