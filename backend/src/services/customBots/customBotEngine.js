/**
 * Custom Bots — Motor
 *
 * Kullanıcının oluşturduğu her botu, TANIMINA göre çalıştırır:
 *   runDaily(bot)  — borsa kapanışından sonra evreni tarar; stratejinin GİRİŞ
 *                    sinyali verdiği hisseleri günlük kapanış fiyatından alır,
 *                    ÇIKIŞ sinyali verdiklerini satar (idempotent: bir işlem günü
 *                    iki kez işlenmez).
 *   tick(bot)      — gün-içi: açık pozisyonların SL/TP/trailing/timeout kontrolü
 *                    (BIST botuyla aynı bant-korumalı detectBistExit mantığı).
 *   manualOpen / manualClose / manualAdjust — kullanıcının işlemlere MÜDAHALESİ.
 *                    Açma/kapatma BIST işlem saatleriyle (10:15–18:00) korunur.
 *
 * Para muhasebesi BIST botuyla birebir (nakit korunumu): open → cash -= maliyet+kom;
 * close → cash += brüt − çıkış komisyonu. Tümü sanal (gerçek para yok).
 */

const liveDataService = require('../liveDataService');
const { allBistStocks } = require('../../data/allBistStocks');
const trailingManager = require('../tradingBotV2/trailingManager');
const { detectBistExit, priceInBand } = require('../tradingBotV2/botEngine');
const riskGuard = require('../botRiskGuard');
const strategies = require('./strategies');
const riskRules = require('./riskRules');
const registry = require('./customBotRegistry');
const marketHours = require('../marketHours');

const RISK_CFG = { maxDrawdownPct: 25, dailyLossLimitPct: 10 };
const MIN_POSITION_TL = 100;     // pozisyon büyüklüğü bunun altına düşerse yeni alım durur
const FETCH_BATCH = 8;           // paralel veri çekim batch'i
const HISTORY_RANGE = '2y';      // büyük periyot parametreleri için yeterli mum

const NAME_BY_SYMBOL = Object.fromEntries(allBistStocks.map(s => [s.symbol, s.name]));

function nowISO() { return new Date().toISOString(); }
function pct(p) { return (p || 0) / 100; }

function addBusinessDays(dateLike, n) {
  const d = new Date(dateLike);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}
function sameDayKey(dateLike) {
  try { return new Date(dateLike).toISOString().slice(0, 10); } catch { return null; }
}

// ── Pozisyon açma (ortak: strateji girişi + manuel) ─────────────────────────
function openPosition(store, bot, opts) {
  const { symbol, name, fillPrice, atr, source = 'strategy', reasonNote = '' } = opts;
  if (!(fillPrice > 0)) return { ok: false, error: 'Geçersiz fiyat' };

  const pf = store.getPortfolio();
  const commission = pct(bot.commissionPct);

  // Pozisyon büyüklüğü: manuel sizeTL verilmişse o, yoksa nakdin %positionPct'i
  let sizeTL = opts.sizeTL != null ? Number(opts.sizeTL) : pf.cash * pct(bot.sizing.positionPct);
  if (!(sizeTL > 0)) return { ok: false, error: 'Geçersiz tutar' };
  if (sizeTL < MIN_POSITION_TL && source === 'strategy') return { ok: false, error: 'min_position' };

  const shares = +(sizeTL / fillPrice).toFixed(4);
  const positionSizeTL = +(shares * fillPrice).toFixed(2);
  const comm = +(positionSizeTL * commission).toFixed(2);
  if (shares <= 0) return { ok: false, error: 'Adet 0' };
  if (pf.cash < positionSizeTL + comm) return { ok: false, error: 'no_cash' };

  // Stop/hedef: manuel override varsa onu kullan, yoksa risk kurallarından üret
  let stop = opts.stopOverride != null ? Number(opts.stopOverride) : null;
  let target = opts.targetOverride != null ? Number(opts.targetOverride) : null;
  if (stop == null && target == null) {
    const st = riskRules.computeStopTarget(fillPrice, atr, bot.risk);
    stop = st.stop;
    target = st.target;
  } else {
    // Manuel girilen seviyeleri geçerlilik için temizle (long: stop<giriş<hedef)
    if (stop != null && !(stop > 0 && stop < fillPrice)) stop = null;
    if (target != null && !(target > fillPrice)) target = null;
  }

  pf.cash = +(pf.cash - positionSizeTL - comm).toFixed(2);
  pf.openCount = (pf.openCount || 0) + 1;
  store.savePortfolio(pf);

  const desc = riskRules.describe(bot.risk);
  const planNote = `Plan — Stop: ${stop != null ? stop.toFixed(2) : '—'} (${desc.stopTxt}), Hedef: ${target != null ? target.toFixed(2) : '—'} (${desc.tgtTxt})${desc.trailing ? ', trailing açık' : ''}.`;

  const pos = store.addPosition({
    symbol, name: name || NAME_BY_SYMBOL[symbol] || symbol,
    strategy: bot.strategyId,
    status: 'open',
    direction: 'long',
    source,                       // 'strategy' | 'manual'
    signalDate: sameDayKey(nowISO()),
    entryDate: nowISO(),
    entryPrice: fillPrice,
    shares,
    positionSizeTL,
    commissionPaid: comm,
    originalEntry: fillPrice,
    originalStop: stop,
    originalTarget: target,
    currentStop: stop,
    currentTarget: target,
    lastPrice: fillPrice,
    notes: [
      { time: nowISO(), action: 'signal', text: reasonNote || `${source === 'manual' ? 'Manuel' : 'Strateji'} girişi.` },
      { time: nowISO(), action: 'entry', text: `${fillPrice.toFixed(2)} TL'den ${shares.toFixed(2)} adet alındı (${positionSizeTL.toFixed(2)} TL, komisyon ${comm.toFixed(2)} TL). ${planNote}` },
    ],
  });
  return { ok: true, position: pos };
}

// ── Pozisyon kapatma (ortak) ─────────────────────────────────────────────────
function closePosition(store, bot, pos, exitPrice, reason, noteText) {
  const pf = store.getPortfolio();
  const commission = pct(bot.commissionPct);
  const exitCommission = +(exitPrice * pos.shares * commission).toFixed(2);
  const grossProceeds = +(exitPrice * pos.shares).toFixed(2);
  const netProceeds = +(grossProceeds - exitCommission).toFixed(2);
  const costBasis = +(pos.entryPrice * pos.shares).toFixed(2);
  const realizedPnL = +(netProceeds - costBasis - (pos.commissionPaid || 0)).toFixed(2);
  const realizedPnLPct = +((realizedPnL / (costBasis + (pos.commissionPaid || 0))) * 100).toFixed(2);
  const closedAt = nowISO();

  const closedPos = store.updatePosition(pos.id, {
    status: 'closed',
    exitDate: closedAt,
    exitPrice,
    exitReason: reason,
    realizedPnL,
    realizedPnLPct,
    closingCommission: exitCommission,
  });
  store.appendNote(pos.id, 'exit',
    `${noteText} Çıkış ${exitPrice.toFixed(2)}. Net P&L: ${realizedPnL >= 0 ? '+' : ''}${realizedPnL.toFixed(2)} TL (%${realizedPnLPct.toFixed(2)}).`);

  store.appendTrade({ ...closedPos, ...store.findById(pos.id) });
  store.removePosition(pos.id);

  pf.cash = +(pf.cash + netProceeds).toFixed(2);
  pf.openCount = Math.max(0, (pf.openCount || 0) - 1);
  pf.totalRealizedPnL = +((pf.totalRealizedPnL || 0) + realizedPnL).toFixed(2);
  pf.totalRealizedPnLPct = +(((pf.totalRealizedPnL) / pf.capital) * 100).toFixed(2);
  if (realizedPnL > 0) pf.winCount = (pf.winCount || 0) + 1;
  else if (realizedPnL < 0) pf.lossCount = (pf.lossCount || 0) + 1;
  const totalClosed = (pf.winCount || 0) + (pf.lossCount || 0);
  pf.winRate = totalClosed > 0 ? +((pf.winCount / totalClosed) * 100).toFixed(1) : 0;
  store.savePortfolio(pf);
  return { realizedPnL, realizedPnLPct, exitPrice };
}

function recomputeEquity(store) {
  const pf = store.getPortfolio();
  const openValue = store.listOpen().reduce((s, p) => s + ((p.lastPrice || p.entryPrice) * p.shares), 0);
  store.recordEquityPoint(+(pf.cash + openValue).toFixed(2));
}

// ── Strateji değerlendirme yardımcısı ────────────────────────────────────────
async function analyzeSymbol(bot, strategy, symbol) {
  const hist = await liveDataService.fetchHistoricalData(symbol, HISTORY_RANGE, '1d');
  if (!Array.isArray(hist) || hist.length < strategy.minCandles(bot.params)) return null;
  // Mumları sayısal/temiz forma getir
  const candles = hist
    .filter(c => Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low))
    .map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close, date: c.date }));
  if (candles.length < strategy.minCandles(bot.params)) return null;
  const last = candles[candles.length - 1];
  const evald = strategy.evaluate(candles, bot.params);
  const atr = require('./indicators').atrLast(candles, 14);
  return {
    symbol,
    name: NAME_BY_SYMBOL[symbol] || symbol,
    close: +last.close.toFixed(4),
    candleDate: last.date || (candles.length ? sameDayKey(nowISO()) : null),
    atr,
    entry: evald.entry,
    exit: evald.exit,
    reason: evald.reason,
  };
}

// ── runDaily — günlük strateji taraması ──────────────────────────────────────
const _running = new Set();
function isRunning(botId) { return _running.has(botId); }

async function runDaily(bot, opts = {}) {
  if (_running.has(bot.id)) return { ok: false, busy: true, error: 'Tarama zaten sürüyor' };
  _running.add(bot.id);
  const startedAt = nowISO();
  try {
    const strategy = strategies.get(bot.strategyId);
    if (!strategy) return { ok: false, error: 'Strateji yok' };
    const store = registry.storeFor(bot);

    // 1) Evreni batch'ler hâlinde çek + strateji değerlendir
    const analyses = [];
    let fetchErrors = 0;
    for (let i = 0; i < bot.universe.length; i += FETCH_BATCH) {
      const batch = bot.universe.slice(i, i + FETCH_BATCH);
      const settled = await Promise.allSettled(batch.map(sym => analyzeSymbol(bot, strategy, sym)));
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) analyses.push(r.value);
        else fetchErrors++;
      }
    }
    if (analyses.length === 0) {
      return { ok: false, error: 'Hiç hisse verisi alınamadı', startedAt, finishedAt: nowISO(), fetchErrors };
    }

    const candleDate = analyses.reduce((m, a) => (a.candleDate && a.candleDate > m ? a.candleDate : m), '');
    const bySymbol = {};
    for (const a of analyses) bySymbol[a.symbol] = a;

    const pf0 = store.getPortfolio();
    // 2) Idempotluk: bu işlem günü zaten işlendiyse (force değilse) atla
    if (!opts.force && pf0.lastCandleDate && pf0.lastCandleDate === candleDate) {
      return {
        ok: true, skipped: true, reason: 'Bu işlem günü zaten işlendi',
        candleDate, scanned: analyses.length, fetchErrors,
        opened: 0, closed: 0, startedAt, finishedAt: nowISO(),
      };
    }

    const result = {
      ok: true, candleDate, scanned: analyses.length, fetchErrors,
      entrySignals: analyses.filter(a => a.entry).length,
      exitSignals: analyses.filter(a => a.exit).length,
      opened: 0, closed: 0, skippedHalted: 0, skippedMaxPos: 0, skippedNoCash: 0,
      startedAt,
    };

    // 3) ÇIKIŞLAR önce — strateji çıkış sinyali veren açık pozisyonları sat
    for (const pos of store.listOpen()) {
      const a = bySymbol[pos.symbol];
      if (!a) continue; // veri yoksa pozisyon korunur
      if (a.exit) {
        closePosition(store, bot, pos, a.close, 'signal_exit', `Strateji çıkış sinyali: ${a.reason}`);
        result.closed++;
      } else {
        store.updatePosition(pos.id, { lastPrice: a.close });
      }
    }

    // Kill-switch — bot duraklatılmış / drawdown / günlük-zarar → yeni giriş YOK
    const ksToday = sameDayKey(nowISO());
    const ksTodayPnL = riskGuard.sumTodayRealizedPnL(store.listTrades(300), ksToday);
    const halt = riskGuard.shouldHaltEntries(store.getPortfolio(), RISK_CFG, ksTodayPnL);
    result.halted = halt.halt;
    result.haltReason = halt.reason;
    const botPaused = bot.status === 'paused';

    // 4) GİRİŞLER — strateji giriş sinyali veren + elde olmayan hisseler
    const entryCandidates = analyses.filter(a => a.entry && !store.findBySymbol(a.symbol, ['open']));
    for (const a of entryCandidates) {
      if (halt.halt || botPaused) { result.skippedHalted++; continue; }
      if (store.listOpen().length >= bot.sizing.maxPositions) { result.skippedMaxPos++; continue; }
      const pf = store.getPortfolio();
      if (pf.cash * pct(bot.sizing.positionPct) < MIN_POSITION_TL) { result.skippedNoCash++; continue; }
      const opened = openPosition(store, bot, {
        symbol: a.symbol, name: a.name, fillPrice: a.close, atr: a.atr,
        source: 'strategy',
        reasonNote: `${strategy.label} giriş sinyali — ${a.reason}`,
      });
      if (opened.ok) result.opened++;
      else result.skippedNoCash++;
    }

    // 5) Equity + lastCandleDate güncelle
    recomputeEquity(store);
    const pf = store.getPortfolio();
    pf.lastCandleDate = candleDate;
    pf.lastRunAt = nowISO();
    store.savePortfolio(pf);

    result.finishedAt = nowISO();
    return result;
  } catch (e) {
    return { ok: false, error: e.message, startedAt, finishedAt: nowISO() };
  } finally {
    _running.delete(bot.id);
  }
}

// ── tick — gün-içi SL/TP/trailing/timeout ────────────────────────────────────
async function tick(bot, opts = {}) {
  const overridePrices = opts.overridePrices || {};
  const store = registry.storeFor(bot);
  const result = { ok: true, checked: 0, trailed: 0, closed: 0, errors: 0 };

  const open = store.listOpen();
  if (open.length === 0) { result.message = 'aktif pozisyon yok'; return result; }

  for (const pos of open) {
    result.checked++;
    let live;
    if (overridePrices[pos.symbol] != null) {
      live = { price: overridePrices[pos.symbol], previousClose: null, low: null, high: null };
    } else {
      live = liveDataService.getStock(pos.symbol) || {};
    }

    const ev = detectBistExit(pos, live);
    if (ev.lastGood != null) store.updatePosition(pos.id, { lastPrice: ev.lastGood });
    else if (ev.hit == null) { result.errors++; continue; } // bozuk okuma → pozisyonu koru

    const price = ev.lastGood ?? pos.lastPrice ?? pos.entryPrice;

    if (ev.hit === 'stop') {
      closePosition(store, bot, { ...pos, lastPrice: price }, ev.exitPrice, 'stop',
        `Gün içi ${ev.ref.toFixed(2)} ≤ SL ${pos.currentStop.toFixed(2)} — stop tetiklendi.`);
      result.closed++; continue;
    }
    if (ev.hit === 'target') {
      closePosition(store, bot, { ...pos, lastPrice: price }, ev.exitPrice, 'target',
        `Gün içi ${ev.ref.toFixed(2)} ≥ TP ${pos.currentTarget.toFixed(2)} — hedef tetiklendi.`);
      result.closed++; continue;
    }

    // Timeout (0 = kapalı)
    if (bot.risk.timeoutDays > 0) {
      const timeoutAt = addBusinessDays(pos.signalDate || pos.entryDate, bot.risk.timeoutDays);
      if (new Date() > timeoutAt) {
        closePosition(store, bot, { ...pos, lastPrice: price }, price, 'timeout',
          `${bot.risk.timeoutDays} işgünü doldu, son fiyatla kapatıldı.`);
        result.closed++; continue;
      }
    }

    // Trailing (yalnız stop varsa + risk.trailing açıksa)
    if (bot.risk.trailing && pos.currentStop != null) {
      let atr = 0;
      try {
        const hist = await liveDataService.fetchHistoricalData(pos.symbol, '3mo', '1d');
        if (Array.isArray(hist) && hist.length >= 15) atr = trailingManager.calcATR(hist.slice(-30), 14);
      } catch (_) {}
      const trail = trailingManager.computeTrailing(
        { entryPrice: pos.entryPrice, originalStop: pos.originalStop, currentStop: pos.currentStop, direction: 'long' },
        price, atr,
      );
      if (trail && trail.newStop > pos.currentStop) {
        store.updatePosition(pos.id, { currentStop: trail.newStop });
        store.appendNote(pos.id, 'trail', trail.note);
        result.trailed++;
      }
    }
  }

  recomputeEquity(store);
  return result;
}

// ── Durum ────────────────────────────────────────────────────────────────────
function getStatus(bot) {
  const store = registry.storeFor(bot);
  const pf = store.getPortfolio();
  const open = store.listOpen();
  const openValue = open.reduce((s, p) => s + ((p.lastPrice || p.entryPrice) * p.shares), 0);
  const unrealized = open.reduce((s, p) => {
    const last = p.lastPrice || p.entryPrice;
    return s + (last - p.entryPrice) * p.shares;
  }, 0);
  const today = sameDayKey(nowISO());
  const todayPnL = riskGuard.sumTodayRealizedPnL(store.listTrades(300), today);
  const risk = riskGuard.shouldHaltEntries(pf, RISK_CFG, todayPnL);
  return {
    portfolio: pf,
    openCount: open.length,
    openValue: +openValue.toFixed(2),
    unrealizedPnL: +unrealized.toFixed(2),
    equity: +(pf.cash + openValue).toFixed(2),
    running: isRunning(bot.id),
    paused: bot.status === 'paused',
    risk: { tradingEnabled: pf.tradingEnabled !== false && bot.status !== 'paused', ...risk },
  };
}

// ── MANUEL MÜDAHALE — işlem-saati korumalı ───────────────────────────────────

/** Elle pozisyon aç. BIST işlem saati 10:15–18:00 dışında reddeder. */
async function manualOpen(bot, payload = {}) {
  marketHours.assertCanOpen(); // dışarıdaysa MarketHoursError fırlatır

  const symbol = String(payload.symbol || '').toUpperCase().trim();
  if (!symbol || !registry.VALID_SYMBOLS.has(symbol)) {
    const e = new Error('Geçerli bir BIST hissesi seçin.'); e.code = 'BAD_INPUT'; throw e;
  }
  const store = registry.storeFor(bot);
  if (store.findBySymbol(symbol, ['open'])) {
    const e = new Error(`${symbol} için zaten açık pozisyon var.`); e.code = 'DUPLICATE'; throw e;
  }
  if (store.listOpen().length >= bot.sizing.maxPositions) {
    const e = new Error(`En fazla ${bot.sizing.maxPositions} açık pozisyon sınırına ulaşıldı.`); e.code = 'MAX_POS'; throw e;
  }

  // Canlı fiyat (bant-kontrollü) + ATR
  const live = liveDataService.getStock(symbol);
  let fillPrice = live?.price;
  if (!(fillPrice > 0)) { const e = new Error(`${symbol} için canlı fiyat alınamadı.`); e.code = 'NO_PRICE'; throw e; }
  if (live?.previousClose && !priceInBand(fillPrice, live.previousClose)) {
    const e = new Error(`${symbol} fiyatı bant dışı (veri hatası) — şimdi açılamaz.`); e.code = 'BAD_PRICE'; throw e;
  }
  let atr = 0;
  try {
    const hist = await liveDataService.fetchHistoricalData(symbol, '3mo', '1d');
    if (Array.isArray(hist) && hist.length >= 15) atr = trailingManager.calcATR(hist.slice(-30), 14);
  } catch (_) {}

  // Tutar: kullanıcı sizeTL verebilir, yoksa varsayılan pozisyon yüzdesi
  let sizeTL = payload.sizeTL != null ? Number(payload.sizeTL) : null;
  if (sizeTL != null && !(sizeTL > 0)) { const e = new Error('Tutar 0’dan büyük olmalı.'); e.code = 'BAD_INPUT'; throw e; }

  const opened = openPosition(store, bot, {
    symbol, name: NAME_BY_SYMBOL[symbol] || symbol,
    fillPrice: +fillPrice.toFixed(4), atr,
    source: 'manual',
    sizeTL,
    stopOverride: payload.stop != null ? Number(payload.stop) : null,
    targetOverride: payload.target != null ? Number(payload.target) : null,
    reasonNote: `Kullanıcı elle açtı — piyasa fiyatı ${(+fillPrice).toFixed(2)} TL.`,
  });
  if (!opened.ok) {
    const msg = opened.error === 'no_cash' ? 'Yetersiz bakiye.' : opened.error === 'min_position' ? 'Tutar çok küçük.' : 'Pozisyon açılamadı.';
    const e = new Error(msg); e.code = 'OPEN_FAIL'; throw e;
  }
  recomputeEquity(store);
  return opened.position;
}

/** Elle pozisyon kapat. BIST işlem saati dışında reddeder. */
async function manualClose(bot, posId, payload = {}) {
  marketHours.assertCanClose();
  const store = registry.storeFor(bot);
  const pos = store.findById(posId);
  if (!pos || pos.status !== 'open') { const e = new Error('Açık pozisyon bulunamadı.'); e.code = 'NOT_FOUND'; throw e; }

  // Çıkış fiyatı: kullanıcı verirse o, yoksa canlı/son fiyat (bant-kontrollü)
  let exitPrice = payload.price != null ? Number(payload.price) : null;
  if (exitPrice != null && !(exitPrice > 0)) { const e = new Error('Geçersiz fiyat.'); e.code = 'BAD_INPUT'; throw e; }
  if (exitPrice == null) {
    const live = liveDataService.getStock(pos.symbol);
    if (live?.price > 0 && (!live.previousClose || priceInBand(live.price, live.previousClose))) {
      exitPrice = +live.price.toFixed(4);
    } else {
      exitPrice = pos.lastPrice || pos.entryPrice;
    }
  }
  const res = closePosition(store, bot, pos, exitPrice, 'manual_close', 'Kullanıcı elle kapattı.');
  recomputeEquity(store);
  return { ...res, symbol: pos.symbol };
}

/** Açık pozisyonun SL/TP'sini elle düzenle (işlem-saati koruması gerekmez). */
function manualAdjust(bot, posId, payload = {}) {
  const store = registry.storeFor(bot);
  const pos = store.findById(posId);
  if (!pos || pos.status !== 'open') { const e = new Error('Açık pozisyon bulunamadı.'); e.code = 'NOT_FOUND'; throw e; }
  const last = pos.lastPrice || pos.entryPrice;

  const patch = {};
  const notes = [];
  if (payload.stop !== undefined) {
    const s = payload.stop === null ? null : Number(payload.stop);
    if (s !== null && !(s > 0 && s < last)) { const e = new Error(`Stop, güncel fiyatın (${last.toFixed(2)}) altında olmalı.`); e.code = 'BAD_INPUT'; throw e; }
    patch.currentStop = s;
    notes.push(`Stop elle ${s != null ? s.toFixed(2) : '—'} yapıldı.`);
  }
  if (payload.target !== undefined) {
    const t = payload.target === null ? null : Number(payload.target);
    if (t !== null && !(t > last)) { const e = new Error(`Hedef, güncel fiyatın (${last.toFixed(2)}) üstünde olmalı.`); e.code = 'BAD_INPUT'; throw e; }
    patch.currentTarget = t;
    notes.push(`Hedef elle ${t != null ? t.toFixed(2) : '—'} yapıldı.`);
  }
  if (Object.keys(patch).length === 0) { const e = new Error('Değişiklik yok.'); e.code = 'BAD_INPUT'; throw e; }
  const updated = store.updatePosition(posId, patch);
  store.appendNote(posId, 'trail', `Manuel müdahale — ${notes.join(' ')}`);
  return updated;
}

// Botu sıfırla (portföyü temizler; tanım korunur).
function reset(bot) {
  const store = registry.storeFor(bot);
  return store.reset();
}

module.exports = {
  runDaily, tick, getStatus, reset,
  manualOpen, manualClose, manualAdjust,
  openPosition, closePosition, recomputeEquity, analyzeSymbol,
  isRunning,
};
