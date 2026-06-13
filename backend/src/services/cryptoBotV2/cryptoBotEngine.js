/**
 * Kripto Bot Engine — long + short sanal portföy
 *
 * BIST botunun (tradingBotV2/botEngine) kripto, çift-yönlü kardeşi. Aynı şeffaf
 * kayıt felsefesi: her işlem ne zaman, neye göre açıldı ve nasıl sonuçlandı —
 * hepsi pozisyon notlarında + değişmez sinyal logunda saklanır.
 *
 * Kripto BIST'ten farkları:
 *   - LONG **ve** SHORT serbest (spot_long/futures_long → long, futures_short → short)
 *   - Portföy USD bazlı (kripto fiyatları USD)
 *   - 7/24 piyasa → tick saat kısıtı yok; market girişi (limit/pending yok)
 *   - Fiyat/ATR kaynağı: cryptoKlines (Yahoo {SYM}-USD) — prod'da çalışan tek kaynak
 *
 * İki ana iş:
 *   1) ingestSnapshot(snapshot)
 *      cryptoSignalsService snapshot'ı (morning/midday/evening/night/intraday):
 *      - 3 stratejinin top sinyallerini değişmez signal-log'a yazar (idempotent)
 *      - Aynı sembolde açık pozisyon yoksa market emirle pozisyon açar (long/short)
 *
 *   2) tick(opts)
 *      Periyodik (7/24): açık pozisyonların güncel mumunu çeker
 *      - Yön-bilinçli SL/TP kontrolü (intra-day high/low; giriş günü close-only)
 *      - Zaman aşımı (7 gün)
 *      - Kâr büyüdükçe trailing stop (yön-bilinçli)
 */

const positionStore = require('./positionStore');
const trailingManager = require('../tradingBotV2/trailingManager');
const cryptoKlines = require('../cryptoKlines');
const riskGuard = require('../botRiskGuard');

// ── Konfig ─────────────────────────────────────────────────────────────────
const CONFIG = {
  POSITION_SIZE_PCT: 0.10,        // her pozisyon nakdin %10'u
  MAX_CONCURRENT_POSITIONS: 12,
  TOP_PER_STRATEGY: 5,            // her stratejiden en iyi 5 sinyal işlenir
  COMMISSION_PCT: 0.001,          // kripto tipik %0.1 taker
  SLIPPAGE_PCT: 0.0005,           // %0.05 slip
  TIMEOUT_DAYS: 7,                // 7 takvim günü (kripto 7/24)
  MIN_SCORE: 6,
  MAX_DRAWDOWN_PCT: 25,           // kill-switch: tepe-noktasından %25 düşüşte yeni giriş durur
  DAILY_LOSS_LIMIT_PCT: 10,       // kill-switch: günlük gerçekleşen zarar capital'in %10'unu aşınca durur
};

const STRATEGIES = [
  { key: 'spot_long',     direction: 'long'  },
  { key: 'futures_long',  direction: 'long'  },
  { key: 'futures_short', direction: 'short' },
];

const STRAT_LABEL = {
  spot_long:     'Spot AL (güvenli long)',
  futures_long:  'Futures Long (agresif long)',
  futures_short: 'Futures Short (düşüş)',
};

function nowISO() { return new Date().toISOString(); }
function dateKeyOf(iso) { return iso ? iso.slice(0, 10) : null; }

// Para birimi sembolü kripto için $ (USD)
function fmt(n, d = 4) {
  if (n == null || !isFinite(n)) return '?';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
}

// Sinyalin karşılanan koşullarını sade etiket listesine indirger
function metConditionLabels(conditions) {
  return (Array.isArray(conditions) ? conditions : [])
    .filter(c => c && c.met && c.applicable !== false)
    .map(c => c.label)
    .filter(Boolean);
}

// Pozisyon/UI için kompakt koşul listesi (label + why + met)
function compactConditions(conditions) {
  return (Array.isArray(conditions) ? conditions : [])
    .filter(c => c && c.applicable !== false)
    .map(c => ({ label: c.label, why: c.why, met: !!c.met, required: !!c.required }));
}

// ── 1) ingestSnapshot ──────────────────────────────────────────────────────
async function ingestSnapshot(snapshot) {
  if (!snapshot || !snapshot.generatedAt) {
    return { ok: false, error: 'invalid snapshot' };
  }

  const signalDate = dateKeyOf(snapshot.generatedAt);
  const phase = snapshot.phase || 'intraday';

  const result = {
    ok: true, signalDate, phase,
    logged: 0, opened: 0, skipped: 0,
  };

  // Kill-switch / risk devre kesici — halt ise YENİ giriş açılmaz (sinyaller yine
  // loglanır; mevcut pozisyon yönetimi/çıkış tick'te etkilenmez).
  const _pf = positionStore.getPortfolio();
  const _today = new Date().toISOString().slice(0, 10);
  const _todayPnL = riskGuard.sumTodayRealizedPnL(positionStore.listTrades(300), _today);
  const halt = riskGuard.shouldHaltEntries(
    _pf,
    { maxDrawdownPct: CONFIG.MAX_DRAWDOWN_PCT, dailyLossLimitPct: CONFIG.DAILY_LOSS_LIMIT_PCT },
    _todayPnL,
  );
  result.halted = halt.halt;
  result.haltReason = halt.reason;

  for (const { key, direction } of STRATEGIES) {
    const payload = snapshot[key];
    if (!payload) continue;
    const signals = Array.isArray(payload.signals) ? payload.signals : [];
    const top = signals.slice(0, CONFIG.TOP_PER_STRATEGY);

    for (const s of top) {
      const entry = s.entry, stop = s.stop, target = s.target1;
      if (!entry || !stop || !target) { result.skipped++; continue; }
      if ((s.totalScore ?? 0) < CONFIG.MIN_SCORE) { result.skipped++; continue; }

      // 1. Sinyal logu (idempotent)
      const existingLog = positionStore.findSignalLogBySymbolDatePhase(
        s.symbol, signalDate, phase, key
      );
      let logEntry = existingLog;
      if (!existingLog) {
        logEntry = positionStore.appendSignalLog({
          signalDate, signalPhase: phase, strategy: key,
          symbol: s.symbol, name: s.name || s.symbol,
          direction,
          entry, stop, target, target2: s.target2 ?? null,
          suggestedLeverage: s.leverage_suggest ?? 1,
          totalScore: s.totalScore, grade: s.grade,
          reasonText: metConditionLabels(s.conditions).slice(0, 4).join(', ') || null,
          outcome: 'signaled',
          positionId: null,
          triggerDate: null, triggerPrice: null,
          exitDate: null, exitPrice: null, exitReason: null,
          finalReturnPct: null, finalPnL: null,
        });
        result.logged++;
      }

      // Kill-switch: halt iken sinyal loglanır ama YENİ pozisyon açılmaz.
      if (halt.halt) { result.skipped++; continue; }

      // 2. Aynı sembolde zaten pozisyon var mı?
      if (positionStore.findBySymbol(s.symbol, ['open'])) continue;

      // 3. Slot dolu mu?
      if (positionStore.listOpen().length >= CONFIG.MAX_CONCURRENT_POSITIONS) continue;

      // 4. Bütçe
      const portfolio = positionStore.getPortfolio();
      const sizeUSD = +(portfolio.cash * CONFIG.POSITION_SIZE_PCT).toFixed(2);
      if (sizeUSD <= 0) continue;

      const isShort = direction === 'short';
      // Slippage: long girişte (alış) biraz pahalı, short girişte (satış) biraz ucuz
      const fillPrice = +(entry * (1 + (isShort ? -1 : 1) * CONFIG.SLIPPAGE_PCT)).toFixed(8);
      if (!(fillPrice > 0)) { result.skipped++; continue; }
      const shares = +(sizeUSD / fillPrice).toFixed(8);
      const margin = +(shares * fillPrice).toFixed(2);
      const commission = +(margin * CONFIG.COMMISSION_PCT).toFixed(2);
      if (portfolio.cash < margin + commission) continue;

      portfolio.cash = +(portfolio.cash - margin - commission).toFixed(2);
      portfolio.openCount = (portfolio.openCount || 0) + 1;
      positionStore.savePortfolio(portfolio);

      const metLabels = metConditionLabels(s.conditions);
      const dirWord = isShort ? 'AÇIĞA SATIŞ (short)' : 'ALIŞ (long)';
      const signalNote =
        `${STRAT_LABEL[key]} — skor ${s.totalScore ?? '?'}/${s.applicableMax ?? 10} (${s.grade || '—'}). ` +
        (metLabels.length ? `Karşılanan koşullar: ${metLabels.slice(0, 5).join(', ')}. ` : '') +
        `Giriş $${fmt(entry)}, hedef $${fmt(target)}, stop $${fmt(stop)}.`;
      const entryNote =
        `${dirWord} market emirle $${fmt(fillPrice)}'den açıldı (slip %${(CONFIG.SLIPPAGE_PCT * 100).toFixed(2)}). ` +
        `${fmt(shares)} adet, komisyon $${fmt(commission, 2)}.`;

      const pos = positionStore.addPosition({
        symbol: s.symbol, name: s.name || s.symbol, image: s.image || null, coinId: s.coinId || null,
        strategy: key, direction, status: 'open',
        signalDate, signalPhase: phase, signalLogId: logEntry?.id || null,
        originalEntry: entry, originalStop: stop, originalTarget: target, target2: s.target2 ?? null,
        suggestedLeverage: s.leverage_suggest ?? 1,
        totalScore: s.totalScore, grade: s.grade,
        signalConditions: compactConditions(s.conditions),
        entryDate: nowISO(), entryPrice: fillPrice, shares,
        positionSize: margin, commissionPaid: commission,
        currentStop: stop, currentTarget: target, lastPrice: fillPrice,
        notes: [
          { time: nowISO(), action: 'signal', text: signalNote },
          { time: nowISO(), action: 'entry',  text: entryNote },
        ],
      });

      positionStore.updateSignalLog(logEntry.id, {
        outcome: 'triggered',
        positionId: pos.id,
        triggerDate: nowISO(),
        triggerPrice: fillPrice,
      });
      result.opened++;
    }
  }

  recomputeEquity();
  return result;
}

// ── Çıkış tespiti — yön + giriş-günü korumalı ──────────────────────────────
// candle: { time(sn), open, high, low, close }
function detectExit(pos, candle) {
  const isShort = pos.direction === 'short';
  const stop = pos.currentStop;
  const target = pos.currentTarget;

  // Giriş bu mumun içinde mi? (giriş günü, mum başlamadan önceki high/low'u sayma)
  const candleStartMs = (candle.time || 0) * 1000;
  const entryMs = new Date(pos.entryDate).getTime();
  const enteredThisCandle = entryMs >= candleStartMs;

  if (enteredThisCandle) {
    // Sadece kapanış fiyatıyla kontrol (geriye dönük yanlış tetiklemeyi önler)
    const px = candle.close;
    if (isShort) {
      if (px >= stop)   return { hit: true, exitPrice: stop,   reason: 'stop' };
      if (px <= target) return { hit: true, exitPrice: target, reason: 'target' };
    } else {
      if (px <= stop)   return { hit: true, exitPrice: stop,   reason: 'stop' };
      if (px >= target) return { hit: true, exitPrice: target, reason: 'target' };
    }
    return { hit: false };
  }

  // Mum içi high/low ile kontrol — ikisi de değdiyse tutucu: önce stop
  if (isShort) {
    const stopHit   = candle.high >= stop;
    const targetHit = candle.low  <= target;
    if (stopHit)   return { hit: true, exitPrice: stop,   reason: 'stop' };
    if (targetHit) return { hit: true, exitPrice: target, reason: 'target' };
  } else {
    const stopHit   = candle.low  <= stop;
    const targetHit = candle.high >= target;
    if (stopHit)   return { hit: true, exitPrice: stop,   reason: 'stop' };
    if (targetHit) return { hit: true, exitPrice: target, reason: 'target' };
  }
  return { hit: false };
}

// ── 2) tick ────────────────────────────────────────────────────────────────
async function tick(opts = {}) {
  const overrideCandles = opts.overrideCandles || {}; // test için: { SYM: [candles] }
  const result = { ok: true, checked: 0, trailed: 0, closed: 0, errors: 0 };

  const open = positionStore.listOpen();
  if (open.length === 0) {
    result.message = 'aktif pozisyon yok';
    recomputeEquity();
    return result;
  }

  // Sembol başına güncel günlük mumları çek (SL/TP + ATR aynı veriden)
  const symbols = [...new Set(open.map(p => p.symbol))];
  const candleMap = {};
  const BATCH = 5;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const res = await Promise.allSettled(batch.map(async (sym) => {
      if (overrideCandles[sym]) return { sym, candles: overrideCandles[sym] };
      const candles = await cryptoKlines.fetchCandles(sym, '1d', 40);
      return { sym, candles };
    }));
    for (const r of res) {
      if (r.status === 'fulfilled' && r.value) candleMap[r.value.sym] = r.value.candles;
    }
    if (i + BATCH < symbols.length) await new Promise(r => setTimeout(r, 200));
  }

  for (const pos of open) {
    result.checked++;
    const candles = candleMap[pos.symbol];
    if (!Array.isArray(candles) || candles.length === 0) { result.errors++; continue; }
    const last = candles[candles.length - 1];
    const price = last.close;
    if (!(price > 0)) { result.errors++; continue; }

    // lastPrice güncelle
    positionStore.updatePosition(pos.id, { lastPrice: price });

    // SL / TP
    const exit = detectExit(pos, last);
    if (exit.hit) {
      const dirWord = pos.direction === 'short' ? 'short' : 'long';
      const reasonNote = exit.reason === 'stop'
        ? `Fiyat $${fmt(price)} → stop $${fmt(pos.currentStop)} seviyesine değdi (${dirWord}).`
        : `Fiyat $${fmt(price)} → hedef $${fmt(pos.currentTarget)} seviyesine ulaştı (${dirWord}).`;
      await closePosition({ ...pos, lastPrice: price }, exit.exitPrice, exit.reason, reasonNote);
      result.closed++;
      continue;
    }

    // Zaman aşımı
    const ageMs = Date.now() - new Date(pos.entryDate).getTime();
    if (ageMs > CONFIG.TIMEOUT_DAYS * 86400 * 1000) {
      await closePosition({ ...pos, lastPrice: price }, price, 'timeout',
        `${CONFIG.TIMEOUT_DAYS} gün doldu, güncel fiyat $${fmt(price)} ile kapatıldı.`);
      result.closed++;
      continue;
    }

    // Trailing (yön-bilinçli)
    const atr = trailingManager.calcATR(candles.slice(-30), 14);
    const trail = trailingManager.computeTrailing(
      {
        entryPrice: pos.entryPrice,
        originalStop: pos.originalStop,
        currentStop: pos.currentStop,
        direction: pos.direction,
      },
      price,
      atr,
    );
    if (trail) {
      positionStore.updatePosition(pos.id, { currentStop: trail.newStop });
      positionStore.appendNote(pos.id, 'trail', trail.note);
      result.trailed++;
    }
  }

  recomputeEquity();
  return result;
}

async function closePosition(pos, exitPriceRaw, reason, noteText) {
  const isShort = pos.direction === 'short';
  const exitPrice = +(+exitPriceRaw).toFixed(8);
  const shares = pos.shares;
  const margin = +(pos.entryPrice * shares).toFixed(2);
  const exitCommission = +(exitPrice * shares * CONFIG.COMMISSION_PCT).toFixed(2);
  const grossPnL = isShort
    ? (pos.entryPrice - exitPrice) * shares
    : (exitPrice - pos.entryPrice) * shares;
  const realizedPnL = +(grossPnL - (pos.commissionPaid || 0) - exitCommission).toFixed(2);
  const committed = margin + (pos.commissionPaid || 0);
  const realizedPnLPct = committed > 0 ? +((realizedPnL / committed) * 100).toFixed(2) : 0;
  // Nakde dönüş: margin serbest + brüt P&L − çıkış komisyonu
  const cashReturn = +(margin + grossPnL - exitCommission).toFixed(2);

  const closedAt = nowISO();
  positionStore.updatePosition(pos.id, {
    status: 'closed',
    exitDate: closedAt, exitPrice, exitReason: reason,
    realizedPnL, realizedPnLPct, closingCommission: exitCommission,
  });
  positionStore.appendNote(pos.id, 'exit',
    `${noteText} Çıkış $${fmt(exitPrice)}. Net K/Z: ${realizedPnL >= 0 ? '+' : ''}$${fmt(realizedPnL, 2)} (%${realizedPnLPct.toFixed(2)}).`);

  const finalPos = positionStore.findById(pos.id);
  positionStore.appendTrade(finalPos);
  positionStore.removePosition(pos.id);

  const portfolio = positionStore.getPortfolio();
  portfolio.cash = +(portfolio.cash + cashReturn).toFixed(2);
  portfolio.openCount = Math.max(0, (portfolio.openCount || 0) - 1);
  portfolio.totalRealizedPnL = +((portfolio.totalRealizedPnL || 0) + realizedPnL).toFixed(2);
  portfolio.totalRealizedPnLPct = +(((portfolio.totalRealizedPnL) / portfolio.capital) * 100).toFixed(2);
  if (realizedPnL > 0) portfolio.winCount = (portfolio.winCount || 0) + 1;
  else if (realizedPnL < 0) portfolio.lossCount = (portfolio.lossCount || 0) + 1;
  const totalClosed = (portfolio.winCount || 0) + (portfolio.lossCount || 0);
  portfolio.winRate = totalClosed > 0 ? +((portfolio.winCount / totalClosed) * 100).toFixed(1) : 0;
  positionStore.savePortfolio(portfolio);

  if (pos.signalLogId) {
    const outcome =
      reason === 'target'  ? 'closed_target'  :
      reason === 'stop'    ? 'closed_stop'    :
      reason === 'timeout' ? 'closed_timeout' : 'closed_other';
    positionStore.updateSignalLog(pos.signalLogId, {
      outcome,
      exitDate: closedAt, exitPrice, exitReason: reason,
      finalReturnPct: realizedPnLPct, finalPnL: realizedPnL,
    });
  }
}

function recomputeEquity() {
  const portfolio = positionStore.getPortfolio();
  const open = positionStore.listOpen();
  // Açık pozisyonların güncel öz-değeri: margin + yön-bilinçli kâr/zarar
  const openEquity = open.reduce((sum, p) => {
    const last = p.lastPrice || p.entryPrice;
    const margin = p.entryPrice * p.shares;
    const unreal = (p.direction === 'short' ? (p.entryPrice - last) : (last - p.entryPrice)) * p.shares;
    return sum + margin + unreal;
  }, 0);
  const equity = +(portfolio.cash + openEquity).toFixed(2);
  positionStore.recordEquityPoint(equity);
}

// ── Public API ─────────────────────────────────────────────────────────────
async function getStatus() {
  const portfolio = positionStore.getPortfolio();
  const open = positionStore.listOpen();
  let openValue = 0;
  let unrealized = 0;
  for (const p of open) {
    const last = p.lastPrice || p.entryPrice;
    const margin = p.entryPrice * p.shares;
    const unreal = (p.direction === 'short' ? (p.entryPrice - last) : (last - p.entryPrice)) * p.shares;
    openValue += margin + unreal;
    unrealized += unreal;
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayPnL = riskGuard.sumTodayRealizedPnL(positionStore.listTrades(300), today);
  const risk = riskGuard.shouldHaltEntries(
    portfolio,
    { maxDrawdownPct: CONFIG.MAX_DRAWDOWN_PCT, dailyLossLimitPct: CONFIG.DAILY_LOSS_LIMIT_PCT },
    todayPnL,
  );
  return {
    portfolio,
    openCount: open.length,
    pendingCount: 0,
    openValue: +openValue.toFixed(2),
    unrealizedPnL: +unrealized.toFixed(2),
    equity: +(portfolio.cash + openValue).toFixed(2),
    risk: { tradingEnabled: portfolio.tradingEnabled !== false, ...risk },
    config: CONFIG,
    strategyLabels: STRAT_LABEL,
  };
}

module.exports = {
  ingestSnapshot,
  tick,
  getStatus,
  closePosition,
  recomputeEquity,
  detectExit,
  CONFIG,
  STRAT_LABEL,
};
