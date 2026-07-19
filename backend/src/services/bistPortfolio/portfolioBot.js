/**
 * bistPortfolio/portfolioBot — iki "hisse önerisi" botunu (AL @borsasinyal34 ·
 * ≥75 ana kanal) TEK ortak orkestrasyonla portföye bağlar. Bot-özel kısım YALNIZ
 * aday seçimi (notifier'da) + dialect/kanal ayarı; portföy defteri + teslimat burada.
 *
 * Teslimat kararı: kapanışlar ÖNCE kesinleşir (defter = gerçek durum), SONRA
 * duyurulur (best-effort Telegram + broadcast). Kaçan tek mesaj günlük özetle
 * yakalanır. Kapanış idempotent (kapanan pozisyon open'dan silinir → tekrar
 * tetiklenemez). 15dk-scan ↔ 5dk-tick aynı store'da çakışmasın diye withLock.
 */

const engine = require('./portfolioEngine');
const M = require('./messages');
const liveDataService = require('../liveDataService');
const bistScoreEngine = require('../bistSignals/bistScoreEngine');
const telegramService = require('../telegramService');
const pushNotificationService = require('../pushNotificationService');
const logger = require('../../utils/logger');

const HARD_TIMEOUT_MS = 16000;
function withTimeout(p, ms, label) {
  return Promise.race([Promise.resolve(p), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms))]);
}
function trToday(now = new Date()) { return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }); }

/**
 * cfgFactory: () => cfg  (env her çağrıda okunur; buildConfig(overrides))
 * opts: { key, store, dialect, channelEnv, broadcastEnv, disabledEnv, competitionKey, historyRange }
 */
function createPortfolioBot(opts) {
  const { store, dialect, channelEnv, disabledEnv, broadcastEnv, competitionKey } = opts;
  const historyRange = opts.historyRange || '6mo';
  const cfg = () => engine.buildConfig({ key: opts.key, ...(opts.cfgOverrides || {}) });

  const channelId = () => process.env[channelEnv] || '';
  const disabled = () => process.env[disabledEnv] === '1';
  // broadcast varsayılan AÇIK; broadcastEnv='...DISABLED' set edilirse kapanır
  const broadcastOn = () => !broadcastEnv || process.env[broadcastEnv] !== '1';

  async function resolveCandles(symbol) {
    const hist = await liveDataService.fetchHistoricalData(symbol, historyRange, '1d');
    return { candles: Array.isArray(hist) ? hist : [] };
  }

  async function sendTelegram(messages) {
    const chatId = channelId();
    if (!chatId || disabled()) return { sent: 0, chatSet: !!chatId };
    let sent = 0;
    for (const msg of messages) {
      try { const r = await withTimeout(telegramService.sendMessage(chatId, msg), HARD_TIMEOUT_MS, 'tg'); if (r && r.success) sent++; else logger.error(`[${opts.key}] TG basarisiz: ${r && r.error}`); }
      catch (e) { logger.error(`[${opts.key}] TG hata: ${e.message}`); }
    }
    return { sent, chatSet: true };
  }

  async function sendBroadcasts(items) {
    if (disabled() || !broadcastOn()) return { app: 0 };
    let app = 0;
    for (const b of items) {
      try { const r = await withTimeout(pushNotificationService.broadcastNotification(b), 12000, 'app'); if (r && r.success) app++; }
      catch (e) { logger.error(`[${opts.key}] broadcast hata: ${e.message}`); }
    }
    return { app };
  }

  // ── AL: nitelikli adayları risk-bazlı aç + duyur ──────────────────────────
  async function openBuys(qualified, o = {}) {
    const c = cfg();
    const { opened, skipped, halted, haltReason } = engine.syncBuys(store, qualified || [], c, { now: o.now });
    engine.recomputeEquity(store);
    let telegram = { sent: 0 }, app = { app: 0 };
    if (opened.length) {
      const kpis = engine.snapshot(store, c).kpis;
      telegram = await sendTelegram(M.buildBuyMessages(opened, kpis, dialect));
      app = await sendBroadcasts(opened.map(p => M.buildBuyBroadcast(p, dialect)));
      logger.info(`🟢 ${opts.key} — ${opened.length} AL · TG ${telegram.sent} · App ${app.app}`);
    }
    return { opened: opened.map(p => ({ symbol: p.symbol, ticket: p.ticket, shares: p.shares, entry: p.entryPrice })), openedCount: opened.length, skipped, halted, haltReason, telegramSent: telegram.sent, appSent: app.app };
  }

  // ── Açık pozisyonları yönet: SAT/STOP/TP/timeout → kesinleştir → duyur ─────
  async function manageAndReport(qualifiedSymbols, o = {}) {
    return engine.withLock(opts.key, async () => {
      const c = cfg();
      let intents = [], errors = 0;
      try {
        const r = await engine.manageHeld(store, c, { qualifiedSymbols, resolve: resolveCandles, now: o.now });
        intents = r.intents; errors = r.errors;
      } catch (e) { logger.error(`[${opts.key}] manageHeld hata: ${e.message}`); return { closed: 0, errors: 1 }; }

      const { closed } = engine.commitCloses(store, c, intents, { now: o.now });   // ÖNCE kesinleş (defter=gerçek)
      engine.recomputeEquity(store);

      if (closed.length) {
        const kpis = engine.snapshot(store, c).kpis;
        await sendTelegram(M.buildExitMessages(closed, kpis, dialect));
        await sendBroadcasts(closed.map(ev => M.buildExitBroadcast(ev, dialect)));
        if (competitionKey) {
          // Bot yarışı: kapanış olaylarını ilet (symbol/exit/entry/outcome ile eşler).
          try { require('../botCompetition/competitionManager').recordClosures(competitionKey, closed); } catch (_) {}
        }
        logger.info(`📊 ${opts.key} — ${closed.length} kapandi (${closed.map(e => e.reason).join(',')})`);
      }
      return { closed: closed.length, errors };
    });
  }

  // ── Günlük portföy özeti (cron ~18:45; gün-bazlı dedup) ────────────────────
  async function pushDailySummary(o = {}) {
    const now = o.now || new Date();
    const dateKey = trToday(now);
    const pf = store.getPortfolio();
    if (!o.force && pf.lastSummaryDate === dateKey) return { skipped: 'already-sent' };
    const c = cfg();
    engine.recomputeEquity(store);
    const snap = engine.snapshot(store, c);
    const closedToday = (snap.closed || [])
      .filter(t => (t.exitDate || '').slice(0, 10) === dateKey)
      .map(t => ({ symbol: t.symbol, reason: t.exitReason, priceReturnPct: t.priceReturnPct }));
    // Hiç açık poz. + hiç işlem geçmişi yoksa (bakir portföy) sessiz
    if (!snap.open.length && !closedToday.length && (pf.winCount || 0) + (pf.lossCount || 0) === 0) {
      return { skipped: 'nothing-to-report' };
    }
    let bench = null;
    try { bench = await require('./benchmark').compare(snap.equityHistory, snap.kpis.totalReturnPct); } catch (_) {}
    const tg = await sendTelegram(M.buildDailySummaryMessages({ dateKey, snapshot: snap, closedToday, benchmark: bench }, dialect));
    await sendBroadcasts([M.buildDailySummaryBroadcast({ dateKey, snapshot: snap }, dialect)]);
    pf.lastSummaryDate = dateKey;   // gün-bazlı dedup (cron günde 1 çağırır)
    store.savePortfolio(pf);
    logger.info(`📊 ${opts.key} gunluk ozet — ${dateKey}: ozsermaye ${snap.kpis.equity} · TG ${tg.sent}`);
    return { sent: tg.sent };
  }

  function getSnapshot() { return engine.snapshot(store, cfg()); }

  // Cutover: eski tracker'ın AÇIK sinyallerini portföye BİR KEZ adopt et.
  // legacyOpen: [{symbol,name,entry,stop,target1,target2,rr1,rr2,score/avgVoteScore/confidence,issuedAt,precision}]
  function adoptLegacy(legacyOpen) {
    const c = cfg();
    let pf = store.getPortfolio();
    if (pf.migratedAt || process.env.BIST_PORTFOLIO_FRESH_START === '1') return { adopted: 0, skipped: pf.migratedAt ? 'already' : 'fresh_start' };
    let adopted = 0;
    for (const s of (legacyOpen || [])) {
      if (!s || !s.symbol || !(s.entry > 0) || !(s.stop > 0) || store.findBySymbol(s.symbol, ['open', 'pending'])) continue;
      const issued = s.issuedAt ? new Date(s.issuedAt) : new Date();
      const dk = issued.toISOString().slice(0, 10);
      const res = engine.openPosition(store, c, s, {
        source: 'adopt', fillPrice: s.entry, now: issued,
        signalDate: dk, entryDate: issued.toISOString(), stopSetDate: s.stopSetDate || dk,
      });
      if (res.ok) adopted++;
    }
    pf = store.getPortfolio();                 // openPosition sonrası taze oku (nakit güncel)
    pf.migratedAt = new Date().toISOString();
    store.savePortfolio(pf);
    engine.recomputeEquity(store);
    logger.info(`♻️ ${opts.key} cutover — ${adopted} eski acik pozisyon adopt edildi`);
    return { adopted };
  }

  return { openBuys, manageAndReport, pushDailySummary, getSnapshot, adoptLegacy, resolveCandles, cfg, channelId };
}

module.exports = { createPortfolioBot };
