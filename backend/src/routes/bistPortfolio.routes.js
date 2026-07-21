/**
 * BIST Model Portföy — HTTP rotaları (iki bot: al | signals)
 *
 *   GET  /api/bist-portfolio                — her iki portföyün özeti
 *   GET  /api/bist-portfolio/:bot/snapshot  — tek portföy (portföy + açık poz.
 *                                             gerçekleşmemiş K/Z + kapananlar + equity)
 *   POST /api/bist-portfolio/:bot/tick      — açık pozisyonları yönet (admin; STOP/TP)
 *   POST /api/bist-portfolio/:bot/pause|resume|reset — admin
 *   POST /api/bist-portfolio/:bot/run       — manuel tarama+AL+yönet (admin, arka plan)
 *
 * :bot ∈ { al (@borsasinyal34, avgScore≥80) | signals (ana kanal, güven≥75) }.
 * Sanal model portföy — gerçek para yoktur.
 */

const express = require('express');
const router = express.Router();

const alBot = require('../services/bistPortfolio/alPortfolioBot');
const signalBot = require('../services/bistPortfolio/signalPortfolioBot');
const alStore = require('../services/bistPortfolio/bistAlPortfolioStore');
const signalStore = require('../services/bistPortfolio/bistSignalPortfolioStore');
const bistScoreEngine = require('../services/bistSignals/bistScoreEngine');
const bistSignalNotifier = require('../services/bistSignals/bistSignalNotifier');
const benchmark = require('../services/bistPortfolio/benchmark');
const backtest = require('../services/bistPortfolio/backtest');
const engine = require('../services/bistPortfolio/portfolioEngine');
const marketHours = require('../services/marketHours');
const cronJobs = require('../services/cronJobs');
const authService = require('../services/authService');

// Backtest sonucu cache (AL stratejisi avgSkor≥80; arka planda üretilir, herkes okur).
// KALICI: bellekte tutulanı disk/Supabase'ten tembel yükle → Render soğuk
// başlangıcında (free tier uykusu) panel boş kalmasın.
const backtestStore = require('../services/bistPortfolio/backtestStore');
let _bt = { running: false, at: null, report: null, error: null };
let _btLoaded = false;
function btState() {
  if (!_btLoaded) {
    _btLoaded = true;
    if (!_bt.report) {
      const saved = backtestStore.load();
      if (saved) { _bt = { running: false, at: saved.at, report: saved.report, error: null }; }
    }
  }
  return _bt;
}
function btSet(report) {
  const saved = backtestStore.save(report);
  _bt = { running: false, at: saved.at, report, error: null };
  _btLoaded = true;
}

async function withBenchmark(snap) {
  try { snap.benchmark = await benchmark.compare(snap.equityHistory, snap.kpis.totalReturnPct); }
  catch (_) { snap.benchmark = null; }
  return snap;
}

const BOTS = {
  al: { bot: alBot, store: alStore, label: 'BIST AL (>=80)' },
  signals: { bot: signalBot, store: signalStore, label: 'BIST LONG (>=75)' },
};

function pick(req, res) {
  const b = BOTS[req.params.bot];
  if (!b) { res.status(404).json({ ok: false, error: "bot: 'al' veya 'signals'" }); return null; }
  return b;
}

async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'Token gerekli' });
  const verified = await authService.verifyToken(authHeader.split(' ')[1]);
  if (!verified.success) return res.status(401).json({ ok: false, ...verified });
  if (verified.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin yetkisi gerekli' });
  req.user = verified.user;
  next();
}

// ── Public read ──────────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const [al, signals] = await Promise.all([withBenchmark(alBot.getSnapshot()), withBenchmark(signalBot.getSnapshot())]);
    res.json({ ok: true, al, signals });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/:bot/snapshot', async (req, res) => {
  const b = pick(req, res); if (!b) return;
  try { res.json({ ok: true, bot: req.params.bot, ...(await withBenchmark(b.bot.getSnapshot())) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Backtest (AL stratejisi avgSkor≥80 — canlı @borsasinyal34 ölçütü) ──────
// GET public (son sonucu okur); POST admin (arka planda çalıştırır ~1-2 dk).
router.get('/backtest', (_req, res) => {
  const s = btState();
  res.json({ ok: true, running: s.running, at: s.at, report: s.report, error: s.error });
});

router.post('/backtest', requireAdmin, (req, res) => {
  const s = btState();
  if (s.running) return res.json({ ok: true, started: false, message: 'Backtest zaten calisiyor' });
  const limit = Math.min(Number(req.body?.limit) || 60, 150);
  _bt = { running: true, at: s.at, report: s.report, error: null };
  backtest.run({ limit })
    .then((rep) => btSet(rep))
    .catch((e) => { _bt = { running: false, at: new Date().toISOString(), report: s.report, error: e.message }; });
  res.json({ ok: true, started: true, limit, message: 'Backtest arka planda basladi (1-2 dk). GET /backtest ile izle.' });
});

// ── Admin ────────────────────────────────────────────────────────────────────
router.post('/:bot/tick', requireAdmin, async (req, res) => {
  const b = pick(req, res); if (!b) return;
  try { const r = await b.bot.manageAndReport(undefined); res.json({ ok: true, ...r, snapshot: b.bot.getSnapshot() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/:bot/pause', requireAdmin, (req, res) => {
  const b = pick(req, res); if (!b) return;
  try { res.json({ ok: true, ...b.store.setTradingEnabled(false, 'manual_pause') }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/:bot/resume', requireAdmin, (req, res) => {
  const b = pick(req, res); if (!b) return;
  try { res.json({ ok: true, ...b.store.setTradingEnabled(true) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/:bot/reset', requireAdmin, (req, res) => {
  const b = pick(req, res); if (!b) return;
  try { res.json({ ok: true, ...b.store.reset() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── MANUEL MÜDAHALE (admin) ───────────────────────────────────────────────
// KAPATMA işlem-saati (10:15–18:00 TR) korumalıdır; SL/TP DÜZENLEME bilinçli
// olarak serbesttir (risk yönetimi seans dışında da yapılabilmeli).
// ⭐ held-only: yalnız AÇIK pozisyon kapatılabilir/düzenlenebilir (motorda zorlanır).
router.post('/:bot/positions/:posId/close', requireAdmin, (req, res) => {
  const b = pick(req, res); if (!b) return;
  try {
    marketHours.assertCanClose();          // 10:15–18:00 TR dışında reddeder
    const ev = engine.manualClose(b.store, b.bot.cfg(), req.params.posId, { price: req.body?.price });
    // Kapanisi otomatik cikislarla ayni kanaldan duyur (best-effort, yaniti bloklamaz)
    Promise.resolve(b.bot.announceClose(ev)).catch(() => {});
    res.json({ ok: true, closed: ev, snapshot: b.bot.getSnapshot() });
  } catch (e) {
    const code = e.code === 'MARKET_CLOSED' ? 409 : e.code === 'NOT_FOUND' ? 404 : e.code === 'BAD_INPUT' ? 400 : 500;
    res.status(code).json({ ok: false, error: e.message, code: e.code || null });
  }
});

router.patch('/:bot/positions/:posId', requireAdmin, (req, res) => {
  const b = pick(req, res); if (!b) return;
  try {
    const patch = {};
    if (req.body && 'stop' in req.body) patch.stop = req.body.stop;
    if (req.body && 'target' in req.body) patch.target = req.body.target;
    const pos = engine.manualAdjust(b.store, req.params.posId, patch);
    res.json({ ok: true, position: pos });
  } catch (e) {
    const code = e.code === 'NOT_FOUND' ? 404 : e.code === 'BAD_INPUT' ? 400 : 500;
    res.status(code).json({ ok: false, error: e.message, code: e.code || null });
  }
});

// İşlem penceresi durumu (UI butonlarını aktif/pasif etmek için) — public
router.get('/market-hours', (_req, res) => {
  try { res.json({ ok: true, ...marketHours.getWindowState() }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Portföy uyarılarını elle kontrol ettir (admin)
router.post('/:bot/check-alerts', requireAdmin, async (req, res) => {
  const b = pick(req, res); if (!b) return;
  try { res.json({ ok: true, ...(await b.bot.checkAlerts()) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Manuel tarama+AL+yönet — arka planda (tam BIST taraması 1-2 dk sürebilir)
router.post('/:bot/run', requireAdmin, (req, res) => {
  const b = pick(req, res); if (!b) return;
  const force = req.body?.force === true || req.query.force === 'true';
  try {
    if (req.params.bot === 'al') {
      cronJobs.triggerBistAlScanner({ force }).catch((e) => console.error('[BistPortfolio] al run:', e.message));
    } else {
      (async () => {
        const snap = await bistScoreEngine.scan({ force: true });
        await bistSignalNotifier.evaluateAndPush((snap && snap.top) || []);
      })().catch((e) => console.error('[BistPortfolio] signals run:', e.message));
    }
    res.json({ ok: true, started: true, bot: req.params.bot, message: 'Tarama arka planda basladi (1-2 dk).' });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Boot warmup (server-live) sonucu cache'e enjekte etsin diye (+ kalıcı kaydet)
router.setBacktest = (rep) => btSet(rep);
// Boot warmup: kalıcı rapor zaten varsa tekrar koşturma (soğuk başlangıç israfı)
router.hasBacktest = () => !!btState().report;

module.exports = router;
