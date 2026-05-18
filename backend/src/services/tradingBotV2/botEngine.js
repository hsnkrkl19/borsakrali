/**
 * Bot Engine — Trading Bot v6
 *
 * İki ana iş:
 *   1) ingestSnapshot(snapshot)
 *      Yeni günlük sinyal snapshot'ı (premarket/revision/intraday) geldiğinde:
 *      - LONG sinyalleri append-only signal-log'a yazar (idempotent)
 *      - Trend (market) sinyali: aynı sembolde açık pozisyon yoksa hemen pozisyon açar
 *      - Reversion (limit) sinyali: triggerZone izleyecek pending pozisyon ekler
 *      - Snapshot diff'i 'dropped' veya 'direction_flip' getirdiyse ilgili açık pozisyonu kapatır
 *
 *   2) tick(opts)
 *      Her 5 dk'da bir (BIST açık saatlerinde):
 *      - Açık + pending pozisyonların live fiyatlarını çeker
 *      - Pending: triggerZone'a değen pozisyonu open'a çevirir (fill)
 *      - Open: trailingManager ile SL'i taşır; SL/TP/timeout durumunda kapatır
 *      - Pozisyon kapanışlarında portföy update + signal-log patch + trade append
 *
 *  Pozisyon Modeli — positionStore.js'in addPosition() ile saklar:
 *    id, symbol, name, strategy ('trend'|'reversion'), status ('pending'|'open'|'closed'),
 *    signalDate, signalPhase,
 *    originalEntry, originalStop, originalTarget, triggerZone,
 *    entryDate, entryPrice, shares, positionSizeTL, commissionPaid,
 *    currentStop, currentTarget, lastPrice,
 *    exitDate, exitPrice, exitReason, realizedPnL, realizedPnLPct,
 *    notes: [{ time, action, text }]
 */

const positionStore = require('./positionStore');
const trailingManager = require('./trailingManager');
const liveDataService = require('../liveDataService');

// ── Konfig ─────────────────────────────────────────────────────────────────
const CONFIG = {
  POSITION_SIZE_PCT: 0.05,        // her pozisyon portföyün %5'i
  MAX_CONCURRENT_POSITIONS: 20,
  COMMISSION_PCT: 0.002,          // BIST tipik %0.2
  SLIPPAGE_PCT: 0.001,            // %0.1 slip
  TIMEOUT_BUSINESS_DAYS: 10,
  MIN_TREND_SCORE: 6,
  MIN_REVERSION_SCORE: 7,
};

function nowISO() { return new Date().toISOString(); }

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

function buildSignalKey(s, signalDate, signalPhase, strategy) {
  return `${signalDate}::${signalPhase}::${strategy}::${s.symbol}`;
}

function buildLogEntry(s, signalDate, signalPhase, strategy) {
  return {
    key: buildSignalKey(s, signalDate, signalPhase, strategy),
    signalDate, signalPhase, strategy,
    symbol: s.symbol, name: s.name || s.symbol,
    direction: s.direction || 'long',
    entry: s.entry, stop: s.stop, target: s.target,
    triggerZone: s.triggerZone || null,
    fillMode: s.fillMode || (strategy === 'trend' ? 'market' : 'limit'),
    totalScore: s.totalScore, grade: s.grade,
    reasonText: s.reason || s.reasonText || null,
    outcome: 'signaled',              // signaled → triggered → closed_*
    positionId: null,
    triggerDate: null,
    triggerPrice: null,
    exitDate: null,
    exitPrice: null,
    exitReason: null,
    finalReturnPct: null,
    finalPnL: null,
  };
}

function pickATR(symbol) {
  // Basit: indikatör cache yoksa 0 dön — trailingManager ATR yoksa sadece R kuralı uygular
  try {
    const stock = liveDataService.getStock(symbol);
    if (stock?.atr) return stock.atr;
  } catch (_) {}
  return 0;
}

async function fetchAtrFromHistory(symbol) {
  try {
    const hist = await liveDataService.fetchHistoricalData(symbol, '3mo', '1d');
    if (!Array.isArray(hist) || hist.length < 15) return 0;
    return trailingManager.calcATR(hist.slice(-30), 14);
  } catch (_) {
    return 0;
  }
}

function isSameDayDateKey(iso) {
  if (!iso) return null;
  return iso.slice(0, 10);
}

// ── 1) ingestSnapshot ──────────────────────────────────────────────────────
async function ingestSnapshot(snapshot) {
  if (!snapshot || !snapshot.generatedAt) {
    return { ok: false, error: 'invalid snapshot' };
  }

  const signalDate = isSameDayDateKey(snapshot.generatedAt);
  const phase = snapshot.phase || 'premarket';

  // dailySignalsService output: { trend: { signals, allSignals, diff? }, reversion: { ... } }
  const groups = [
    { strategy: 'trend',     payload: snapshot.trend     },
    { strategy: 'reversion', payload: snapshot.reversion },
  ];

  const result = {
    ok: true,
    signalDate, phase,
    logged: 0,
    opened: 0,
    addedPending: 0,
    closedByDrop: 0,
    skipped: 0,
  };

  for (const { strategy, payload } of groups) {
    if (!payload) continue;
    const signals = Array.isArray(payload.signals) ? payload.signals : [];

    for (const s of signals) {
      if ((s.direction || 'long') !== 'long') {
        result.skipped++;
        continue;
      }
      if (!s.entry || !s.stop || !s.target) {
        result.skipped++;
        continue;
      }

      // 1. Append signal log (idempotent — aynı key zaten varsa skip)
      const existingLog = positionStore.findSignalLogBySymbolDatePhase(
        s.symbol, signalDate, phase, strategy
      );
      let logEntry = existingLog;
      if (!existingLog) {
        logEntry = positionStore.appendSignalLog(buildLogEntry(s, signalDate, phase, strategy));
        result.logged++;
      }

      // 2. Açık veya pending pozisyon var mı?
      const existingPos = positionStore.findBySymbol(s.symbol, ['open', 'pending']);
      if (existingPos) continue; // aynı sembolde işlem var — duplicate açma

      // 3. Slot dolu mu?
      const openOrPending = [...positionStore.listOpen(), ...positionStore.listPending()];
      if (openOrPending.length >= CONFIG.MAX_CONCURRENT_POSITIONS) {
        continue;
      }

      // 4. Bütçe ve fill kararı
      const portfolio = positionStore.getPortfolio();
      const sizeTL = portfolio.cash * CONFIG.POSITION_SIZE_PCT;
      if (sizeTL <= 0 || sizeTL > portfolio.cash) continue;

      const fillMode = s.fillMode || (strategy === 'trend' ? 'market' : 'limit');
      const baseNote = `${strategy.toUpperCase()} sinyali (skor ${s.totalScore ?? '?'}). Giriş ${s.entry?.toFixed?.(2)}, SL ${s.stop?.toFixed?.(2)}, TP ${s.target?.toFixed?.(2)}.${s.reason ? ' Gerekçe: ' + s.reason : ''}`;

      if (fillMode === 'market') {
        // Trend: hemen aç (slippage uygula)
        const fillPrice = +(s.entry * (1 + CONFIG.SLIPPAGE_PCT)).toFixed(4);
        const shares = +(sizeTL / fillPrice).toFixed(4);
        const positionSizeTL = +(shares * fillPrice).toFixed(2);
        const commission = +(positionSizeTL * CONFIG.COMMISSION_PCT).toFixed(2);

        if (portfolio.cash < positionSizeTL + commission) continue;

        portfolio.cash = +(portfolio.cash - positionSizeTL - commission).toFixed(2);
        portfolio.openCount = (portfolio.openCount || 0) + 1;
        positionStore.savePortfolio(portfolio);

        const pos = positionStore.addPosition({
          symbol: s.symbol, name: s.name || s.symbol,
          strategy, status: 'open',
          signalDate, signalPhase: phase, signalLogId: logEntry?.id || null,
          direction: 'long',
          originalEntry: s.entry,
          originalStop: s.stop,
          originalTarget: s.target,
          triggerZone: s.triggerZone || null,
          entryDate: nowISO(), entryPrice: fillPrice, shares,
          positionSizeTL, commissionPaid: commission,
          currentStop: s.stop, currentTarget: s.target,
          lastPrice: fillPrice,
          notes: [
            { time: nowISO(), action: 'signal', text: baseNote },
            { time: nowISO(), action: 'entry',  text: `Market emirle ${fillPrice.toFixed(2)} TL'den girildi (slip %${(CONFIG.SLIPPAGE_PCT*100).toFixed(2)}). ${shares.toFixed(2)} adet, komisyon ${commission.toFixed(2)} TL.` },
          ],
        });

        positionStore.updateSignalLog(logEntry.id, {
          outcome: 'triggered',
          positionId: pos.id,
          triggerDate: nowISO(),
          triggerPrice: fillPrice,
        });
        result.opened++;
      } else {
        // Reversion: pending — triggerZone'a değiş bekle
        const pos = positionStore.addPosition({
          symbol: s.symbol, name: s.name || s.symbol,
          strategy, status: 'pending',
          signalDate, signalPhase: phase, signalLogId: logEntry?.id || null,
          direction: 'long',
          originalEntry: s.entry,
          originalStop: s.stop,
          originalTarget: s.target,
          triggerZone: s.triggerZone || null,
          plannedPositionSizeTL: +sizeTL.toFixed(2),
          notes: [
            { time: nowISO(), action: 'signal', text: baseNote },
            { time: nowISO(), action: 'pending', text: `Pending: ${s.symbol} ${s.entry?.toFixed?.(2)} TL zone'a değişi bekleniyor.` },
          ],
        });

        positionStore.updateSignalLog(logEntry.id, {
          positionId: pos.id,
          outcome: 'signaled',
        });
        result.addedPending++;
      }
    }

    // 5. Diff'ten 'dropped' veya 'direction_flip' olanlar için açık pozisyon kapat
    const diff = Array.isArray(payload.diff) ? payload.diff : [];
    for (const d of diff) {
      if (!['dropped', 'direction_flip'].includes(d.status)) continue;
      const open = positionStore.findBySymbol(d.symbol, ['open']);
      if (!open || open.strategy !== strategy) continue;
      const live = liveDataService.getStock(open.symbol);
      const exitPrice = live?.price || open.lastPrice || open.entryPrice;
      await closePosition(open, exitPrice, 'signal_dropped', d.detail || 'Sinyal listesinden düştü');
      result.closedByDrop++;
    }
  }

  return result;
}

// ── 2) tick ────────────────────────────────────────────────────────────────
async function tick(opts = {}) {
  const overridePrices = opts.overridePrices || {};
  const result = {
    ok: true,
    checked: 0,
    triggered: 0,
    trailed: 0,
    closed: 0,
    errors: 0,
  };

  const open = positionStore.listOpen();
  const pending = positionStore.listPending();
  const all = [...pending, ...open];
  if (all.length === 0) {
    result.message = 'aktif pozisyon yok';
    return result;
  }

  // Eşsiz sembol seti
  const symbols = [...new Set(all.map(p => p.symbol))];

  // Live fiyatları topla (cached liveDataService — Yahoo 1dk cache)
  const priceMap = {};
  for (const sym of symbols) {
    if (overridePrices[sym] != null) {
      priceMap[sym] = overridePrices[sym];
      continue;
    }
    try {
      const stock = liveDataService.getStock(sym);
      priceMap[sym] = stock?.price ?? null;
    } catch (_) {
      priceMap[sym] = null;
    }
  }

  // ── Pending: triggerZone'a değiş kontrolü ───────────────────────────────
  for (const pos of pending) {
    result.checked++;
    const price = priceMap[pos.symbol];
    if (price == null) continue;

    let triggered = false;
    let fillPrice = null;
    if (pos.triggerZone && typeof pos.triggerZone === 'object') {
      const tz = pos.triggerZone;
      if (price <= tz.top && price >= tz.bottom) {
        triggered = true;
        fillPrice = price;
      } else if (price <= tz.top) {
        // Zone'a değen ya da içine giren long fırsat
        triggered = true;
        fillPrice = Math.min(price, tz.top);
      }
    } else {
      // Trigger zone yoksa entry seviyesine değiş
      if (price <= pos.originalEntry) {
        triggered = true;
        fillPrice = Math.min(price, pos.originalEntry);
      }
    }

    if (triggered && fillPrice) {
      const portfolio = positionStore.getPortfolio();
      const sizeTL = pos.plannedPositionSizeTL ?? portfolio.cash * CONFIG.POSITION_SIZE_PCT;
      const fillWithSlip = +(fillPrice * (1 + CONFIG.SLIPPAGE_PCT)).toFixed(4);
      const shares = +(sizeTL / fillWithSlip).toFixed(4);
      const positionSizeTL = +(shares * fillWithSlip).toFixed(2);
      const commission = +(positionSizeTL * CONFIG.COMMISSION_PCT).toFixed(2);

      if (portfolio.cash < positionSizeTL + commission) {
        positionStore.appendNote(pos.id, 'skip', 'Yetersiz bakiye, pozisyon iptal edildi.');
        positionStore.removePosition(pos.id);
        if (pos.signalLogId) {
          positionStore.updateSignalLog(pos.signalLogId, { outcome: 'no_trigger', exitReason: 'no_cash' });
        }
        continue;
      }

      portfolio.cash = +(portfolio.cash - positionSizeTL - commission).toFixed(2);
      portfolio.openCount = (portfolio.openCount || 0) + 1;
      positionStore.savePortfolio(portfolio);

      positionStore.updatePosition(pos.id, {
        status: 'open',
        entryDate: nowISO(),
        entryPrice: fillWithSlip,
        shares,
        positionSizeTL,
        commissionPaid: commission,
        currentStop: pos.originalStop,
        currentTarget: pos.originalTarget,
        lastPrice: fillWithSlip,
      });
      positionStore.appendNote(pos.id, 'trigger',
        `Zone'a değdi (fiyat ${price.toFixed(2)}). ${fillWithSlip.toFixed(2)} TL'den fill, ${shares.toFixed(2)} adet, komisyon ${commission.toFixed(2)} TL.`);

      if (pos.signalLogId) {
        positionStore.updateSignalLog(pos.signalLogId, {
          outcome: 'triggered',
          triggerDate: nowISO(),
          triggerPrice: fillWithSlip,
        });
      }
      result.triggered++;
    }
  }

  // ── Open: trailing + SL/TP/timeout ─────────────────────────────────────
  for (const pos of positionStore.listOpen()) {
    result.checked++;
    const price = priceMap[pos.symbol];
    if (price == null) continue;

    // Snapshot için lastPrice güncelle
    positionStore.updatePosition(pos.id, { lastPrice: price });

    // SL hit
    if (price <= pos.currentStop) {
      await closePosition({ ...pos, lastPrice: price }, price, 'stop',
        `Fiyat ${price.toFixed(2)} ≤ SL ${pos.currentStop.toFixed(2)} — stop tetiklendi.`);
      result.closed++;
      continue;
    }

    // TP hit
    if (price >= pos.currentTarget) {
      await closePosition({ ...pos, lastPrice: price }, price, 'target',
        `Fiyat ${price.toFixed(2)} ≥ TP ${pos.currentTarget.toFixed(2)} — hedef tetiklendi.`);
      result.closed++;
      continue;
    }

    // Timeout
    const timeoutAt = addBusinessDays(pos.signalDate || pos.entryDate, CONFIG.TIMEOUT_BUSINESS_DAYS);
    if (new Date() > timeoutAt) {
      await closePosition({ ...pos, lastPrice: price }, price, 'timeout',
        `${CONFIG.TIMEOUT_BUSINESS_DAYS} işgünü doldu, son fiyatla kapatıldı.`);
      result.closed++;
      continue;
    }

    // Trailing
    let atr = 0;
    try {
      // Tick'te her sembol için Yahoo'dan tarihçe çekmek pahalı.
      // ATR yoksa sadece R kuralı uygulanır — yine doğru çalışır.
      atr = await fetchAtrFromHistory(pos.symbol);
    } catch (_) {}

    const trail = trailingManager.computeTrailing(
      { entryPrice: pos.entryPrice, originalStop: pos.originalStop, currentStop: pos.currentStop, direction: 'long' },
      price,
      atr,
    );

    if (trail && trail.newStop > pos.currentStop) {
      positionStore.updatePosition(pos.id, { currentStop: trail.newStop });
      positionStore.appendNote(pos.id, 'trail', trail.note);
      result.trailed++;
    }
  }

  // Equity snapshot
  recomputeEquity();

  return result;
}

async function closePosition(pos, exitPrice, reason, noteText) {
  const portfolio = positionStore.getPortfolio();
  const exitCommission = +(exitPrice * pos.shares * CONFIG.COMMISSION_PCT).toFixed(2);
  const grossProceeds = +(exitPrice * pos.shares).toFixed(2);
  const netProceeds = +(grossProceeds - exitCommission).toFixed(2);
  const costBasis = +(pos.entryPrice * pos.shares).toFixed(2);
  const realizedPnL = +(netProceeds - costBasis - (pos.commissionPaid || 0)).toFixed(2);
  const realizedPnLPct = +((realizedPnL / (costBasis + (pos.commissionPaid || 0))) * 100).toFixed(2);

  // Pozisyonu güncelle ve trades'e ekle
  const closedAt = nowISO();
  const closedPos = positionStore.updatePosition(pos.id, {
    status: 'closed',
    exitDate: closedAt,
    exitPrice,
    exitReason: reason,
    realizedPnL,
    realizedPnLPct,
    closingCommission: exitCommission,
  });
  positionStore.appendNote(pos.id, 'exit',
    `${noteText} Çıkış ${exitPrice.toFixed(2)}. Net P&L: ${realizedPnL >= 0 ? '+' : ''}${realizedPnL.toFixed(2)} TL (%${realizedPnLPct.toFixed(2)}).`);

  // Trades append
  positionStore.appendTrade({ ...closedPos, ...positionStore.findById(pos.id) });
  // positions.json'dan sil — kapalı pozisyon trades.json'da yaşar
  positionStore.removePosition(pos.id);

  // Portföy güncelle
  portfolio.cash = +(portfolio.cash + netProceeds).toFixed(2);
  portfolio.openCount = Math.max(0, (portfolio.openCount || 0) - 1);
  portfolio.totalRealizedPnL = +((portfolio.totalRealizedPnL || 0) + realizedPnL).toFixed(2);
  portfolio.totalRealizedPnLPct = +(((portfolio.totalRealizedPnL) / portfolio.capital) * 100).toFixed(2);
  if (realizedPnL > 0) portfolio.winCount = (portfolio.winCount || 0) + 1;
  else if (realizedPnL < 0) portfolio.lossCount = (portfolio.lossCount || 0) + 1;
  const totalClosed = (portfolio.winCount || 0) + (portfolio.lossCount || 0);
  portfolio.winRate = totalClosed > 0 ? +((portfolio.winCount / totalClosed) * 100).toFixed(1) : 0;
  positionStore.savePortfolio(portfolio);

  // Signal log update
  if (pos.signalLogId) {
    const outcome =
      reason === 'target' ? 'closed_target' :
      reason === 'stop' ? 'closed_stop' :
      reason === 'timeout' ? 'closed_timeout' :
      reason === 'signal_dropped' ? 'closed_dropped' : 'closed_other';
    positionStore.updateSignalLog(pos.signalLogId, {
      outcome,
      exitDate: closedAt,
      exitPrice,
      exitReason: reason,
      finalReturnPct: realizedPnLPct,
      finalPnL: realizedPnL,
    });
  }
}

function recomputeEquity() {
  const portfolio = positionStore.getPortfolio();
  const open = positionStore.listOpen();
  const openValue = open.reduce((sum, p) => sum + ((p.lastPrice || p.entryPrice) * p.shares), 0);
  const equity = +(portfolio.cash + openValue).toFixed(2);
  positionStore.recordEquityPoint(equity);
}

// ── Public API ─────────────────────────────────────────────────────────────
async function getStatus() {
  const portfolio = positionStore.getPortfolio();
  const open = positionStore.listOpen();
  const pending = positionStore.listPending();
  const openValue = open.reduce((sum, p) => sum + ((p.lastPrice || p.entryPrice) * p.shares), 0);
  const unrealized = open.reduce((sum, p) => {
    const last = p.lastPrice || p.entryPrice;
    return sum + (last - p.entryPrice) * p.shares;
  }, 0);
  return {
    portfolio,
    openCount: open.length,
    pendingCount: pending.length,
    openValue: +openValue.toFixed(2),
    unrealizedPnL: +unrealized.toFixed(2),
    equity: +(portfolio.cash + openValue).toFixed(2),
    config: CONFIG,
  };
}

module.exports = {
  ingestSnapshot,
  tick,
  getStatus,
  closePosition,
  recomputeEquity,
  CONFIG,
};
