/**
 * Backtest HTTP routes — strateji geriye-dönük test laboratuvarı
 *
 *   POST   /api/backtest/run            — bir backtest koştur (botId? | def?, mode, symbol?, range)
 *   GET    /api/backtest/runs           — geçmiş koşuların özeti (?botId=&limit=)
 *   GET    /api/backtest/runs/:id       — tek koşunun tam sonucu (equity + işlemler)
 *   DELETE /api/backtest/runs/:id       — koşuyu sil
 *   GET    /api/backtest/meta           — strateji şeması + izinli aralıklar (UI)
 *
 * "Build → backtest → deploy" akışının backtest ayağı. Custom Bots ile aynı saf
 * strateji/indikatör/risk/para modüllerini geçmişe sararak çalıştırır → yeşil
 * backtest ile canlı bot tutarlı kalır. Tüm portföy sanaldır; gerçek para yoktur.
 *
 * Global model: uçlar herkese açıktır (site misafir-öncelikli; diğer bot uçlarıyla
 * aynı yaklaşım). Doğrulama runner/registry katmanında merkezîdir.
 */

const express = require('express');
const router = express.Router();

const runner = require('./../services/backtest/backtestRunner');
const store = require('./../services/backtest/backtestStore');
const strategies = require('../services/customBots/strategies');
const riskRules = require('../services/customBots/riskRules');
const registry = require('../services/customBots/customBotRegistry');

// Uzun koşuları engellememek için tek bir koşunun aynı anda dönmesini takip et
// (büyük evren × 5y CPU-yoğun; eşzamanlı spam'i yumuşatır).
let _activeRuns = 0;
const MAX_ACTIVE = 3;

router.get('/meta', (_req, res) => {
  res.json({
    ok: true,
    strategies: strategies.publicList(),
    ranges: runner.ALLOWED_RANGES.map(v => ({ value: v, label: runner.RANGE_LABEL[v] })),
    risk: { stopTypes: riskRules.STOP_TYPES, targetTypes: riskRules.TARGET_TYPES, defaults: riskRules.DEFAULT_RISK },
    limits: registry.LIMITS,
  });
});

router.get('/runs', (req, res) => {
  try {
    const botId = req.query.botId || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, store.MAX_RUNS);
    res.json({ ok: true, runs: store.listRuns({ botId, limit }) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/runs/:id', (req, res) => {
  const run = store.getRun(req.params.id);
  if (!run) return res.status(404).json({ ok: false, error: 'Backtest bulunamadı' });
  res.json({ ok: true, run });
});

router.delete('/runs/:id', (req, res) => {
  const ok = store.deleteRun(req.params.id);
  if (!ok) return res.status(404).json({ ok: false, error: 'Backtest bulunamadı' });
  res.json({ ok: true });
});

router.post('/run', async (req, res) => {
  if (_activeRuns >= MAX_ACTIVE) {
    return res.status(429).json({ ok: false, error: 'Şu an çok sayıda backtest çalışıyor — birkaç saniye sonra tekrar deneyin.' });
  }
  _activeRuns++;
  try {
    const result = await runner.run(req.body || {});
    if (!result.ok) {
      const status = Array.isArray(result.errors) ? 400 : (result.error === 'Bot bulunamadı' ? 404 : 400);
      return res.status(status).json({ ok: false, error: result.error, errors: result.errors });
    }
    res.json({ ok: true, run: result.run });
  } catch (e) {
    console.error('[Backtest] run hata:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    _activeRuns--;
  }
});

module.exports = router;
