/**
 * BEAST Trend Routes — Borsa Krali
 *
 * Zero-Lag Trend (AlgoAlpha) + Ichimoku + Scalper Beast konfluans füzyonu.
 * SADECE altın/gümüş/BTC/ETH × 1h/4h/1d (aktif hücreler). Trend-DEVAMI sistemi:
 * HTF hizalama kapısı + konfluans notu + dar yapısal ATR stop + 2:1 R/R.
 * Misafir modeline uygun public (auth yok). Cron periyodik üretir; bellekte tutulur.
 */

const express = require('express');
const router = express.Router();

const engine = require('../services/beast/beastEngine');
const tracker = require('../services/beast/beastTracker');
const { INSTRUMENTS, SIGNAL_TFS } = require('../services/beast/beastInstruments');
const cfgMod = require('../services/beast/beastConfig');

router.get('/instruments', (req, res) => {
  res.json({
    success: true,
    instruments: INSTRUMENTS.map(i => ({
      id: i.id, name: i.name, symbol: i.symbol, short: i.short, class: i.class,
      tvSymbol: i.tvSymbol, enabledTfs: cfgMod.ENABLED[i.id] || [],
    })),
    tfs: SIGNAL_TFS,
  });
});

router.get('/signals', async (req, res) => {
  try {
    await tracker.load(); // kalıcı state'i (Supabase) yükle — cold-start'ta boş/yeniden-push olmasın
    let snap = engine.getLatest();
    if (!snap || !snap.generatedAt) snap = await engine.generate();
    const open = tracker.getOpen();
    const closedRecent = tracker.getClosedRecent(30);
    res.json({
      success: true,
      generatedAt: snap.generatedAt,
      signals: snap.signals,
      open, closedRecent,
      pushConfidence: require('../services/beast/beastNotifier').PUSH_CONFIDENCE,
      pushEnabled: !require('../services/beast/beastNotifier').pushDisabled(),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const snap = await engine.generate();
    res.json({ success: true, generatedAt: snap.generatedAt, signals: snap.signals });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Tuned config + backtest kenarı (şeffaflık)
router.get('/backtest', (req, res) => {
  res.json({
    success: true,
    tuned: cfgMod.TUNED,
    tfZl: cfgMod.TF_ZL,
    modeByTf: cfgMod.MODE_BY_TF,
    enabled: cfgMod.ENABLED,
    edge: cfgMod.EDGE,
    note: 'Havuzlu sweep + 70/30 OOS: OOS PF 1.86, avgR +0.354; vs-random giriş kenarı +0.229 R/işlem',
  });
});

module.exports = router;
