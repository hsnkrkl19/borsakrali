/**
 * Altın Botu proxy rotaları — Node backend → Windows'taki Python/MT5 botu.
 *
 * TÜM uçlar admin korumalı: bot brokerın MT5 demo hesabına emir gönderdiği için
 * yalnızca admin (hsnkrkl19@gmail.com / ADMIN_EMAILS)
 * bu sayfayı görebilir ve komut gönderebilir. Tarayıcı same-origin /api/bot/*
 * çağırır; bu router bota (botClient) proxy'ler ve bot yanıtını olduğu gibi döner.
 *
 *   GET  /api/bot/status | positions | trades | events | config | stats | learn | strategies | scoreboard
 *        /api/bot/research/status | research/latest | health
 *   POST /api/bot/engine/start | engine/stop | config | account/bind_current_demo
 *        /api/bot/trade/open | trade/close | trade/close_all
 *        /api/bot/research/run | research/approve | research/rollback
 */

const express = require('express');
const router = express.Router();

const authService = require('../services/authService');
const botClient = require('../services/botClient');
const notificationBotManager = require('../services/botCenter/notificationBotManager');
const competitionManager = require('../services/botCompetition/competitionManager');
const builderStore = require('../services/botBuilder/store');
const customBotEngine = require('../services/botBuilder/customBotEngine');
const customBotRunner = require('../services/botBuilder/customBotRunner');
const { metaFor } = require('../services/botBuilder/catalogMeta');
const ictSmc = require('../services/ictSmc/ictSmcService');
const { listInstruments } = require('../services/forex/forexInstruments');
const instrumentBans = require('../services/instrumentBans');

async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ ok: false, error: 'Token gerekli' });
    }
    const token = authHeader.split(' ')[1];
    const verified = await authService.verifyToken(token);
    if (!verified.success) return res.status(401).json({ ok: false, ...verified });
    if (verified.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admin yetkisi gerekli' });
    }
    req.user = verified.user;
    return next();
  } catch (error) {
    return res.status(503).json({ ok: false, error: `Kimlik doğrulama servisi kullanılamıyor: ${error.message}` });
  }
}

// Bot çağrısını tek yerde hata-yönet: yapılandırılmamışsa 503, ulaşılamıyorsa 502.
function handle(promiseFactory) {
  return async (req, res) => {
    try {
      const data = await promiseFactory(req);
      return res.json(data);
    } catch (e) {
      if (e && e.code === 'DISABLED') {
        return res.status(503).json({ ok: false, error: `Bot API yapılandırılmadı: ${e.message}` });
      }
      const upstreamStatus = Number(e?.response?.status || 0);
      const upstreamDetail = e?.response?.data?.detail || e?.response?.data?.message;
      if (upstreamStatus === 400 || upstreamStatus === 409) {
        return res.status(upstreamStatus).json({
          ok: false,
          error: upstreamDetail || 'Bot isteği güvenlik kapısı tarafından reddedildi.',
        });
      }
      if (upstreamStatus === 401 || upstreamStatus === 403) {
        return res.status(502).json({
          ok: false,
          error: 'Bot API kimlik doğrulaması başarısız. Sunucu bağlantı anahtarını kontrol edin.',
        });
      }
      return res.status(502).json({
        ok: false,
        error: `Bota ulaşılamıyor: ${upstreamDetail || e.message}`,
      });
    }
  };
}

// VPS bu ucu çağırarak kendisine gelen site oturumunun hâlâ admin olduğunu
// doğrular. Yalnızca kimlik sonucu döner; bot verisi veya komut içermez.
router.get('/session/verify', requireAdmin, (req, res) => res.json({
  ok: true,
  role: 'admin',
  user_id: req.user.id,
}));

// TEST: her bot kendi "Bot N · İsim" etiketiyle Telegram'a bir test mesajı atar.
// requireAdmin'den ÖNCE tanımlı — kendi FOREX_EXEC_TOKEN kontrolüyle korunur
// (admin JWT olmadan da tetiklenebilsin, ama yetkisiz kimse kanalı spam'leyemesin).
router.post('/test-telegram', async (req, res) => {
  try {
    const need = process.env.FOREX_EXEC_TOKEN || '';
    const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || (req.body && req.body.token) || '';
    if (need && given !== need) return res.status(401).json({ ok: false, error: 'yetkisiz' });

    const catalog = require('../services/botCompetition/catalog');
    const { botLabel } = require('../services/botCompetition/botLabels');
    const telegram = require('../services/telegramService');
    const { signalChannel } = require('../services/signalDelivery');
    const chatId = (req.body && req.body.chatId) || signalChannel();
    if (!chatId) return res.status(400).json({ ok: false, error: 'kanal tanımsız (TELEGRAM_FOREX_CHANNEL / TELEGRAM_SIGNAL_CHANNEL)' });

    const bots = catalog.filter((e) => e.competitionEligible);
    const sent = [];
    for (const b of bots) {
      const text = `🤖 <b>${botLabel(b.id)}</b>\n🧪 <i>TEST</i> — bu bot artık sinyallerini bu isimle gönderiyor.\nKategori: ${b.category} · MT5 magic: <code>${b.magic}</code>`;
      try {
        await telegram.sendMessage(chatId, text, 'HTML');
        sent.push({ no: b.no, id: b.id, label: botLabel(b.id), ok: true });
      } catch (e) {
        sent.push({ no: b.no, id: b.id, ok: false, error: e.message });
      }
      await new Promise((r) => setTimeout(r, 500)); // Telegram kanal hız sınırı
    }
    res.json({ ok: true, chatId, total: bots.length, gonderilen: sent.filter((s) => s.ok).length, sent });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// TEŞHİS: her botun canlı durumu — çalışıyor mu, açık pozisyonu var mı, motoru
// kapalı mı, neden sinyal üretmiyor. "20 bot var ama 3'ü işlem açıyor" sorusunun
// kesin cevabı. Token korumalı (requireAdmin'den önce).
router.get('/diag', (req, res) => {
  try {
    const need = process.env.FOREX_EXEC_TOKEN || '';
    const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.query.token || '');
    if (need && given !== need) return res.status(401).json({ ok: false, error: 'yetkisiz' });

    const catalog = require('../services/botCompetition/catalog');
    const cm = require('../services/botCompetition/competitionManager');
    const { botLabel } = require('../services/botCompetition/botLabels');
    const st = cm.status();
    const byId = new Map((st.bots || []).map((b) => [b.id, b]));

    const rows = catalog.filter((e) => e.competitionEligible).map((e) => {
      const b = byId.get(e.id) || {};
      const engineOff = !!(e.engineDisableEnv && process.env[e.engineDisableEnv] === '1');
      let durum = 'çalışıyor';
      if (engineOff) durum = 'MOTOR KAPALI (' + e.engineDisableEnv + '=1)';
      else if (b.enabled === false) durum = 'BOT DURDURULMUŞ (panelden)';
      else if (!b.open && !b.closed) durum = 'henüz sinyal üretmedi';
      else if (!b.open) durum = 'açık pozisyon yok (seçici)';
      return {
        no: e.no, bot: botLabel(e.id) || e.name, id: e.id, kategori: e.category,
        acik: b.open || 0, kapanan: b.closed || 0, netR: b.net_r != null ? b.net_r : null,
        // BİRLEŞİK köprüye (borsakrali_mt5_all.py) gider mi? Adanmış köprüsü olan
        // bot GİTMEZ — gerçek emri kendi köprüsü açar (aksi halde çift pozisyon).
        kopruye_gider: e.mt5Tradeable !== false && !e.dedicatedBridgeMagic,
        adanmis_kopru_magic: e.dedicatedBridgeMagic || null,
        motor_kapali: engineOff,
        bot_acik: b.enabled !== false, durum,
      };
    });
    const ozet = {
      toplam: rows.length,
      acik_pozisyonu_olan: rows.filter((r) => r.acik > 0).length,
      hic_islem_yapmamis: rows.filter((r) => !r.acik && !r.kapanan).length,
      motoru_kapali: rows.filter((r) => r.motor_kapali).length,
      durdurulmus: rows.filter((r) => !r.bot_acik).length,
      yarisma_acik: st.summary ? st.summary.enabled !== false : null,
    };
    res.json({ ok: true, ozet, botlar: rows.sort((a, b) => (b.acik - a.acik) || (b.kapanan - a.kapanan)) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Tüm bot rotaları admin.
router.use(requireAdmin);

const bearer = (req) => req.headers.authorization;

// Telegram bildirim üreticileri site backend'inde çalışır. Bunlar VPS'e proxy
// edilmez; aynı admin kapısının arkasından tek katalog olarak yönetilir.
router.get('/notifications', (req, res) => {
  res.json(notificationBotManager.summary());
});

router.post('/notifications/:id', (req, res) => {
  try {
    const bot = notificationBotManager.setEnabled(
      String(req.params.id || ''),
      req.body?.enabled,
      req.user?.email || req.user?.id || 'admin',
    );
    return res.json({ ok: true, bot });
  } catch (error) {
    const status = error?.code === 'NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ ok: false, error: error.message });
  }
});

// Telegram stratejilerinin brokerdan tamamen ayrılmış, eşit sermayeli sanal
// yarışı. Bu uçlar R5'e emir göndermez; yalnız yarış defterini yönetir.
router.get('/competition', (req, res) => {
  res.json(competitionManager.status());
});

router.post('/competition', (req, res) => {
  try {
    const result = competitionManager.setMasterEnabled(
      req.body?.enabled,
      req.user?.email || req.user?.id || 'admin',
    );
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }
});

router.post('/competition/:id', (req, res) => {
  try {
    const bot = competitionManager.setBotEnabled(
      String(req.params.id || ''),
      req.body?.enabled,
      req.user?.email || req.user?.id || 'admin',
    );
    return res.json({ ok: true, bot });
  } catch (error) {
    const status = ['NOT_FOUND', 'NOT_TRADING'].includes(error?.code) ? 404 : 400;
    return res.status(status).json({ ok: false, error: error.message });
  }
});

// ── BOT BUILDER: 15 botun TF ayarı + 16. bot oluşturma (site-lokal, admin) ──
router.get('/builder', (req, res) => {
  try {
    const compStatus = competitionManager.status();
    const enabledById = {};
    (compStatus.bots || []).forEach((b) => { enabledById[b.id] = b.enabled; });
    const catalog = competitionManager.catalog
      .filter((e) => e.competitionEligible)
      .map((e) => {
        const m = metaFor(e.id);
        return {
          id: e.id, no: e.no, name: e.name, category: e.category, magic: e.magic || null,
          strategies: m.strategies, availableTimeframes: m.timeframes,
          enabled: enabledById[e.id] !== false,
          selectedTimeframes: builderStore.getBotTimeframes(e.id),
        };
      });
    const lb = customBotRunner.leaderboard();
    const lbById = {}; lb.forEach((x) => { lbById[x.botId] = x; });
    const customBots = builderStore.listCustom().map((b) => ({
      ...b, stats: lbById[b.id] || { trades: 0, wins: 0, netR: 0, winRate: 0, open: 0 },
    }));
    res.json({
      catalog, customBots,
      indicators: customBotEngine.INDICATORS,
      ictStrategies: Object.entries(ictSmc.STRATS).map(([id, name]) => ({ id, name })),
      // Yasaklı enstrümanlar panelde hiç gösterilmez (gümüş/XAGUSD — 2026-07-24).
      pairs: instrumentBans.filterInstruments(listInstruments())
        .map((i) => ({ id: i.id, name: i.name, symbol: i.symbol, class: i.class })),
      allTimeframes: builderStore.ALL_TF,
      customLeaderboard: lb,
      realResults: require('../services/realResults/store').aggregate(0),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// YARIŞ: gerçek MT5 sonuçları lider tablosu (bugün + genel) — site bunu yayınlar.
router.get('/race/leaderboard', (req, res) => {
  try {
    res.json({ ok: true, ...require('../services/realResults/raceReport').leaderboard() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// C1 HUNİ: her bot için sinyal → onay/ret(sebep) → dolum → kapanış sayaçları.
// Sessiz botlar da listelenir — "işlem yok"un NEDENİ burada görünür.
router.get('/funnel', (req, res) => {
  try {
    const botFunnel = require('../services/botFunnel');
    const catalog = require('../services/botCompetition/catalog');
    const days = Math.max(1, Math.min(14, Number(req.query.days) || 1));
    const data = botFunnel.funnel({ days });
    const seen = new Set();
    const rows = [];
    for (const entry of catalog) {
      if (entry.competitionEligible === false) continue;
      // Bir bot birden çok magic taşıyabilir (adanmış köprü + alt motorlar);
      // hepsi tek satırda toplanır, yoksa Bot 1/Bot 5 yine kaybolurdu.
      const magics = [...new Set([
        Number(entry.magic),
        Number(entry.dedicatedBridgeMagic),
        ...Object.values(entry.magicByStrategy || {}).map(Number),
      ].filter((m) => Number.isFinite(m) && m > 0))];
      const row = {
        botId: entry.id, no: entry.no, name: entry.name, category: entry.category,
        magics, signals: 0, accepted: 0, rejected: 0, reasons: {},
        filled: 0, closed: 0, wins: 0, losses: 0, netUsd: 0,
      };
      for (const m of magics) {
        seen.add(String(m));
        const part = data.bots[String(m)];
        if (!part) continue;
        row.signals += part.signals; row.accepted += part.accepted;
        row.rejected += part.rejected; row.filled += part.filled;
        row.closed += part.closed; row.wins += part.wins; row.losses += part.losses;
        row.netUsd = Math.round((row.netUsd + part.netUsd) * 100) / 100;
        for (const [reason, count] of Object.entries(part.reasons || {})) {
          row.reasons[reason] = (row.reasons[reason] || 0) + count;
        }
      }
      row.durum = botFunnel.explain(row);
      rows.push(row);
    }
    // Kataloğa eşlenmeyen magic'ler (özel botlar, harici EA) sessizce düşmesin.
    const orphans = Object.entries(data.bots)
      .filter(([magic]) => !seen.has(magic))
      .map(([magic, part]) => ({
        ...part, botId: null, no: null,
        name: require('../services/realResults/store').magicToBot(magic).name,
        category: 'Eşlenmemiş', magics: [Number(magic)],
        durum: botFunnel.explain(part),
      }));
    res.json({ ok: true, days: data.days, totals: data.totals, bots: rows, orphans });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// YARIŞ: günlük Telegram raporunu elle tetikle (cron 23:55 TR'de zaten atar).
router.post('/race/daily-report', async (req, res) => {
  try {
    res.json({ ok: true, ...(await require('../services/realResults/raceReport').pushDaily()) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 15 mevcut bot: zaman-dilimi filtresi + aç/kapat
router.post('/builder/settings/:id', (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (Array.isArray(req.body?.timeframes)) builderStore.setBotTimeframes(id, req.body.timeframes);
    if (typeof req.body?.enabled === 'boolean') {
      competitionManager.setBotEnabled(id, req.body.enabled, req.user?.email || 'admin');
    }
    res.json({ ok: true, id, selectedTimeframes: builderStore.getBotTimeframes(id) });
  } catch (e) {
    const status = ['NOT_FOUND', 'NOT_TRADING'].includes(e?.code) ? 404 : 400;
    res.status(status).json({ ok: false, error: e.message });
  }
});

// 16. bot: oluştur / güncelle / sil
router.post('/builder/custom', (req, res) => {
  try { res.json({ ok: true, bot: builderStore.createCustom(req.body || {}) }); }
  catch (e) { res.status(e?.code === 'LIMIT' ? 409 : 400).json({ ok: false, error: e.message }); }
});
router.patch('/builder/custom/:id', (req, res) => {
  try { res.json({ ok: true, bot: builderStore.updateCustom(req.params.id, req.body || {}) }); }
  catch (e) { res.status(e?.code === 'NOT_FOUND' ? 404 : 400).json({ ok: false, error: e.message }); }
});
router.delete('/builder/custom/:id', (req, res) => {
  try { res.json(builderStore.deleteCustom(req.params.id)); }
  catch (e) { res.status(e?.code === 'NOT_FOUND' ? 404 : 400).json({ ok: false, error: e.message }); }
});

// Günlük Telegram raporunu ELLE tetikle (test): şimdi gönder.
router.post('/daily-report/test', async (req, res) => {
  try { res.json(await require('../services/botDailyReport').run()); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});


// ── Okuma uçları ───────────────────────────────────────────────────────────
router.get('/status', handle((req) => botClient.get('/api/status', undefined, bearer(req))));
router.get('/positions', handle((req) => botClient.get('/api/positions', undefined, bearer(req))));
router.get('/trades', handle((req) => botClient.get('/api/trades', { limit: req.query.limit || 100 }, bearer(req))));
router.get('/events', handle((req) => botClient.get('/api/events', { limit: req.query.limit || 100 }, bearer(req))));
router.get('/config', handle((req) => botClient.get('/api/config', undefined, bearer(req))));
router.get('/stats', handle((req) => botClient.get('/api/stats', undefined, bearer(req))));
router.get('/learn', handle((req) => botClient.get('/api/learn', undefined, bearer(req))));
router.get('/strategies', handle((req) => botClient.get('/api/strategies', undefined, bearer(req))));
router.get('/scoreboard', handle((req) => botClient.get('/api/scoreboard', undefined, bearer(req))));
router.get('/health', handle((req) => botClient.get('/api/health', undefined, bearer(req))));
router.get('/research/status', handle((req) => botClient.get('/api/research/status', undefined, bearer(req))));
router.get('/research/latest', handle((req) => botClient.get('/api/research/latest', undefined, bearer(req))));

// ── Komut uçları ───────────────────────────────────────────────────────────
router.post('/engine/start', handle((req) => botClient.post('/api/engine/start', undefined, bearer(req))));
router.post('/engine/stop', handle((req) => botClient.post('/api/engine/stop', undefined, bearer(req))));
router.post('/config', handle((req) => botClient.post('/api/config', req.body || {}, bearer(req))));
router.post('/account/bind_current_demo', handle((req) => botClient.post('/api/account/bind_current_demo', undefined, bearer(req))));
router.post('/trade/open', handle((req) => botClient.post('/api/trade/open', req.body || {}, bearer(req))));
router.post('/trade/close', handle((req) => botClient.post('/api/trade/close', req.body || {}, bearer(req))));
router.post('/trade/close_all', handle((req) => botClient.post('/api/trade/close_all', req.body || {}, bearer(req))));
router.post('/research/run', handle((req) => botClient.post('/api/research/run', undefined, bearer(req))));
router.post('/research/approve', handle((req) => botClient.post('/api/research/approve', req.body || {}, bearer(req))));
router.post('/research/rollback', handle((req) => botClient.post('/api/research/rollback', req.body || {}, bearer(req))));

module.exports = router;
