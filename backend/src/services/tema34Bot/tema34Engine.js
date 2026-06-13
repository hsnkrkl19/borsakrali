/**
 * TEMA34 Bot — Motor
 *
 * Saf TEMA34 (Triple Exponential Moving Average, periyot 34) kesişim botu.
 * Günde bir kez, BIST kapanışından sonra çalışır ve yalnızca GÜNLÜK MUM kullanır:
 *
 *   GİRİŞ  — Bir hissenin günlük kapanışı TEMA34'ün ÜZERİNE çıktığı gün
 *            (kesişim: önceki kapanış altında, bugünkü kapanış üstünde),
 *            o günkü kapanış fiyatından alınır.
 *   ÇIKIŞ  — Elde tutulan bir hissenin günlük kapanışı TEMA34'ün ALTINA
 *            indiği gün, o günkü kapanış fiyatından satılır.
 *
 * Stop-loss / take-profit / trailing / zaman aşımı YOKTUR — tek çıkış kuralı
 * kapanışın TEMA34 altına inmesidir. Pozisyon büyüklüğü: o anki nakdin %5'i.
 * Evren: tüm BIST (~510 hisse). Veri: tema34Store.js (data/tema34-bot/).
 */

const liveDataService = require('../liveDataService');
const { allBistStocks } = require('../../data/allBistStocks');
const store = require('./tema34Store');
const riskGuard = require('../botRiskGuard');

const CONFIG = {
  TEMA_PERIOD: 34,
  POSITION_SIZE_PCT: 0.05,        // her alımda o anki nakdin %5'i
  MAX_CONCURRENT_POSITIONS: 30,   // eşzamanlı en fazla pozisyon sayısı
  MIN_POSITION_TL: 500,           // %5 bu tutarın altına düşünce yeni alım durur
  COMMISSION_PCT: 0.002,          // BIST tipik %0.2 (alış + satış ayrı uygulanır)
  MIN_CANDLES: 100,               // TEMA34 warmup için gereken en az mum sayısı
  FETCH_BATCH: 10,                // paralel veri çekim batch boyutu
  MAX_DRAWDOWN_PCT: 25,           // kill-switch: tepe-noktasından %25 düşüşte yeni giriş durur
  DAILY_LOSS_LIMIT_PCT: 10,       // kill-switch: günlük gerçekleşen zarar capital'in %10'unu aşınca durur
};

let _running = false;

function nowISO() { return new Date().toISOString(); }
function isRunning() { return _running; }

/**
 * TEMA — Triple Exponential Moving Average (TradingView Pine v6 ile birebir).
 *   ema1 = ema(close, length); ema2 = ema(ema1, length); ema3 = ema(ema2, length)
 *   out  = 3 * (ema1 - ema2) + ema3
 * EMA ilk barda kaynağın değeri ile başlatılır (Pine Script davranışı).
 */
function calcTEMASeries(closes, period) {
  const n = closes.length;
  if (n === 0) return [];
  const k = 2 / (period + 1);
  const ema1 = new Array(n);
  const ema2 = new Array(n);
  const ema3 = new Array(n);
  const tema = new Array(n);
  ema1[0] = ema2[0] = ema3[0] = tema[0] = closes[0];
  for (let i = 1; i < n; i++) {
    ema1[i] = k * closes[i] + (1 - k) * ema1[i - 1];
    ema2[i] = k * ema1[i]   + (1 - k) * ema2[i - 1];
    ema3[i] = k * ema2[i]   + (1 - k) * ema3[i - 1];
    tema[i] = 3 * (ema1[i] - ema2[i]) + ema3[i];
  }
  return tema;
}

/**
 * Tek hisseyi çek + TEMA34 durumunu sınıflandır.
 * Veri yetersiz/bozuksa null döner (o hisse o gün atlanır).
 */
async function analyzeSymbol(stock) {
  const symbol = stock.symbol || stock;
  const name = stock.name || symbol;
  const hist = await liveDataService.fetchHistoricalData(symbol, '1y', '1d');
  if (!Array.isArray(hist) || hist.length < CONFIG.MIN_CANDLES) return null;

  const closes = hist.map(c => c.close);
  const n = closes.length;
  const lastClose = closes[n - 1];
  const prevClose = closes[n - 2];
  if (!Number.isFinite(lastClose) || !Number.isFinite(prevClose)) return null;

  const temaSeries = calcTEMASeries(closes, CONFIG.TEMA_PERIOD);
  const temaNow = temaSeries[n - 1];
  const temaPrev = temaSeries[n - 2];
  if (!Number.isFinite(temaNow) || !Number.isFinite(temaPrev)) return null;

  const aboveNow = lastClose > temaNow;
  const abovePrev = prevClose > temaPrev;
  let signal;
  if (!abovePrev && aboveNow) signal = 'cross_above';      // TEMA34 üzerine çıktı
  else if (abovePrev && !aboveNow) signal = 'cross_below'; // TEMA34 altına indi
  else if (aboveNow) signal = 'above';                     // üzerinde devam
  else signal = 'below';                                   // altında devam

  const lastBar = hist[n - 1];
  const candleDate = lastBar.date
    || (lastBar.timestamp ? new Date(lastBar.timestamp).toISOString().slice(0, 10) : null);

  return {
    symbol,
    name,
    lastClose: +lastClose.toFixed(4),
    prevClose: +prevClose.toFixed(4),
    tema: +temaNow.toFixed(4),
    temaPrev: +temaPrev.toFixed(4),
    aboveNow,
    abovePrev,
    signal,
    distancePct: +(((lastClose - temaNow) / temaNow) * 100).toFixed(2),
    candleDate,
  };
}

// O anki nakdin %5'i kadar pozisyon aç — kapanış fiyatından, slippage yok.
function openPosition(a, candleDate) {
  const pf = store.getPortfolio();
  const fillPrice = a.lastClose;
  if (!Number.isFinite(fillPrice) || fillPrice <= 0) return null;

  const sizeTL = pf.cash * CONFIG.POSITION_SIZE_PCT;
  const shares = +(sizeTL / fillPrice).toFixed(4);
  const positionSizeTL = +(shares * fillPrice).toFixed(2);
  const commission = +(positionSizeTL * CONFIG.COMMISSION_PCT).toFixed(2);
  if (shares <= 0 || pf.cash < positionSizeTL + commission) return null;

  pf.cash = +(pf.cash - positionSizeTL - commission).toFixed(2);
  pf.openCount = (pf.openCount || 0) + 1;
  store.savePortfolio(pf);

  return store.addPosition({
    symbol: a.symbol,
    name: a.name,
    status: 'open',
    entryDate: candleDate,
    entryAt: nowISO(),
    entryPrice: fillPrice,
    entryTema: a.tema,
    shares,
    positionSizeTL,
    commissionPaid: commission,
    lastPrice: fillPrice,
    lastTema: a.tema,
    lastDate: candleDate,
    notes: [
      { time: nowISO(), action: 'signal',
        text: `${a.symbol} günlük kapanışı ${fillPrice.toFixed(2)} TL — TEMA34 ${a.tema.toFixed(2)} TL'nin üzerine çıktı (kesişim).` },
      { time: nowISO(), action: 'entry',
        text: `${fillPrice.toFixed(2)} TL kapanış fiyatından alındı — ${shares} adet, ${positionSizeTL.toFixed(2)} TL, komisyon ${commission.toFixed(2)} TL.` },
    ],
  });
}

// Pozisyonu kapanış fiyatından sat, trades'e taşı, portföyü güncelle.
function closePosition(pos, a, candleDate) {
  const pf = store.getPortfolio();
  const exitPrice = a.lastClose;
  const exitCommission = +(exitPrice * pos.shares * CONFIG.COMMISSION_PCT).toFixed(2);
  const grossProceeds = +(exitPrice * pos.shares).toFixed(2);
  const netProceeds = +(grossProceeds - exitCommission).toFixed(2);
  const costBasis = +(pos.entryPrice * pos.shares).toFixed(2);
  const realizedPnL = +(netProceeds - costBasis - (pos.commissionPaid || 0)).toFixed(2);
  const realizedPnLPct = +((realizedPnL / (costBasis + (pos.commissionPaid || 0))) * 100).toFixed(2);

  store.appendTrade({
    ...pos,
    status: 'closed',
    exitDate: candleDate,
    exitAt: nowISO(),
    exitPrice,
    exitTema: a.tema,
    exitReason: 'tema34_below',
    closingCommission: exitCommission,
    realizedPnL,
    realizedPnLPct,
    lastPrice: exitPrice,
    lastTema: a.tema,
    lastDate: candleDate,
    notes: [
      ...(Array.isArray(pos.notes) ? pos.notes : []),
      { time: nowISO(), action: 'exit',
        text: `Günlük kapanış ${exitPrice.toFixed(2)} TL — TEMA34 ${a.tema.toFixed(2)} TL'nin altına indi, satıldı. Net P&L: ${realizedPnL >= 0 ? '+' : ''}${realizedPnL.toFixed(2)} TL (%${realizedPnLPct.toFixed(2)}).` },
    ],
  });
  store.removePosition(pos.id);

  pf.cash = +(pf.cash + netProceeds).toFixed(2);
  pf.openCount = Math.max(0, (pf.openCount || 0) - 1);
  pf.totalRealizedPnL = +((pf.totalRealizedPnL || 0) + realizedPnL).toFixed(2);
  pf.totalRealizedPnLPct = +((pf.totalRealizedPnL / pf.capital) * 100).toFixed(2);
  if (realizedPnL > 0) pf.winCount = (pf.winCount || 0) + 1;
  else if (realizedPnL < 0) pf.lossCount = (pf.lossCount || 0) + 1;
  const totalClosed = (pf.winCount || 0) + (pf.lossCount || 0);
  pf.winRate = totalClosed > 0 ? +((pf.winCount / totalClosed) * 100).toFixed(1) : 0;
  store.savePortfolio(pf);
}

function recomputeEquity(candleDate) {
  const pf = store.getPortfolio();
  const openValue = store.listOpen().reduce(
    (s, p) => s + ((p.lastPrice || p.entryPrice) * p.shares), 0);
  store.recordEquityPoint(+(pf.cash + openValue).toFixed(2), candleDate);
}

/**
 * Günlük tarama — tüm BIST'i çeker, TEMA34 kesişimlerine göre alım/satım yapar.
 * opts.force=true → aynı işlem günü tekrar işlense bile çalışır (admin manuel).
 */
async function runDaily(opts = {}) {
  if (_running) return { ok: false, busy: true, error: 'Tarama zaten sürüyor' };
  _running = true;
  const startedAt = nowISO();

  try {
    // 1) Tüm BIST evrenini batch'ler hâlinde çek + TEMA34 sınıflandır
    const analyses = [];
    let fetchErrors = 0;
    for (let i = 0; i < allBistStocks.length; i += CONFIG.FETCH_BATCH) {
      const batch = allBistStocks.slice(i, i + CONFIG.FETCH_BATCH);
      const settled = await Promise.allSettled(batch.map(analyzeSymbol));
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) analyses.push(r.value);
        else fetchErrors++;
      }
    }
    if (analyses.length === 0) {
      return { ok: false, error: 'Hiç hisse verisi alınamadı', startedAt, finishedAt: nowISO() };
    }

    // 2) İşlem günü = taranan hisselerin en güncel mum tarihi
    const candleDate = analyses.reduce(
      (m, a) => (a.candleDate && a.candleDate > m ? a.candleDate : m), '');

    const portfolio = store.getPortfolio();

    // 3) Idempotluk: bu işlem günü zaten işlendiyse (force değilse) atla
    if (!opts.force && portfolio.lastCandleDate && portfolio.lastCandleDate === candleDate) {
      const skippedRun = {
        runDate: new Date().toISOString().slice(0, 10),
        candleDate, startedAt, finishedAt: nowISO(),
        skipped: true, reason: 'Bu işlem günü zaten işlendi',
        scanned: analyses.length, fetchErrors,
        crossAbove: 0, crossBelow: 0, opened: 0, closed: 0,
      };
      store.appendRun(skippedRun);
      return { ok: true, ...skippedRun };
    }

    const bySymbol = {};
    for (const a of analyses) bySymbol[a.symbol] = a;

    const result = {
      ok: true,
      runDate: new Date().toISOString().slice(0, 10),
      candleDate,
      startedAt,
      scanned: analyses.length,
      fetchErrors,
      crossAbove: analyses.filter(a => a.signal === 'cross_above').length,
      crossBelow: analyses.filter(a => a.signal === 'cross_below').length,
      opened: 0,
      closed: 0,
      skippedNoData: 0,
      skippedMaxPos: 0,
      skippedNoCash: 0,
    };

    // 4) ÇIKIŞLAR önce — elde tutulup kapanışı TEMA34 altına inen tüm
    //    pozisyonlar satılır (önce çıkış → serbest kalan nakit girişleri besler).
    //    "Altında olmak" yeterli sebeptir: bir gün atlanmış olsa bile pozisyon
    //    TEMA34 altında kalmaz.
    for (const pos of store.listOpen()) {
      const a = bySymbol[pos.symbol];
      if (!a) { result.skippedNoData++; continue; } // veri yoksa pozisyon korunur
      if (!a.aboveNow) {
        closePosition(pos, a, candleDate);
        result.closed++;
      } else {
        store.updatePosition(pos.id, {
          lastPrice: a.lastClose, lastTema: a.tema, lastDate: candleDate,
        });
      }
    }

    // Kill-switch / risk devre kesici — halt ise YENİ giriş yapılmaz (çıkışlar zaten yapıldı).
    const ksToday = new Date().toISOString().slice(0, 10);
    const ksTodayPnL = riskGuard.sumTodayRealizedPnL(store.listTrades(300), ksToday);
    const halt = riskGuard.shouldHaltEntries(
      store.getPortfolio(),
      { maxDrawdownPct: CONFIG.MAX_DRAWDOWN_PCT, dailyLossLimitPct: CONFIG.DAILY_LOSS_LIMIT_PCT },
      ksTodayPnL,
    );
    result.halted = halt.halt;
    result.haltReason = halt.reason;
    result.skippedHalted = 0;

    // 5) GİRİŞLER — TEMA34 üzerine yeni çıkan (kesişim) ve elde olmayan hisseler.
    //    Nakit kısıtlıysa TEMA34'e en yakın kesişimler (en taze) önceliklidir.
    const entryCandidates = analyses
      .filter(a => a.signal === 'cross_above' && !store.findBySymbol(a.symbol))
      .sort((x, y) => x.distancePct - y.distancePct);
    for (const a of entryCandidates) {
      if (halt.halt) { result.skippedHalted++; continue; } // kill-switch: yeni giriş yok
      if (store.listOpen().length >= CONFIG.MAX_CONCURRENT_POSITIONS) {
        result.skippedMaxPos++;
        continue;
      }
      const pf = store.getPortfolio();
      if (pf.cash * CONFIG.POSITION_SIZE_PCT < CONFIG.MIN_POSITION_TL) {
        result.skippedNoCash++;
        continue;
      }
      if (openPosition(a, candleDate)) result.opened++;
      else result.skippedNoCash++;
    }

    // 6) Equity snapshot + portföy meta güncelle
    recomputeEquity(candleDate);
    const pf = store.getPortfolio();
    pf.lastCandleDate = candleDate;
    pf.lastRunAt = nowISO();
    store.savePortfolio(pf);

    result.finishedAt = nowISO();
    store.appendRun(result);
    return result;
  } catch (e) {
    return { ok: false, error: e.message, startedAt, finishedAt: nowISO() };
  } finally {
    _running = false;
  }
}

function getStatus() {
  const portfolio = store.getPortfolio();
  const open = store.listOpen();
  const openValue = open.reduce(
    (s, p) => s + ((p.lastPrice || p.entryPrice) * p.shares), 0);
  const unrealizedPnL = open.reduce((s, p) => {
    const last = p.lastPrice || p.entryPrice;
    return s + (last - p.entryPrice) * p.shares;
  }, 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayPnL = riskGuard.sumTodayRealizedPnL(store.listTrades(300), today);
  const risk = riskGuard.shouldHaltEntries(
    portfolio,
    { maxDrawdownPct: CONFIG.MAX_DRAWDOWN_PCT, dailyLossLimitPct: CONFIG.DAILY_LOSS_LIMIT_PCT },
    todayPnL,
  );
  return {
    portfolio,
    openCount: open.length,
    openValue: +openValue.toFixed(2),
    unrealizedPnL: +unrealizedPnL.toFixed(2),
    equity: +(portfolio.cash + openValue).toFixed(2),
    running: _running,
    risk: { tradingEnabled: portfolio.tradingEnabled !== false, ...risk },
    config: CONFIG,
  };
}

module.exports = {
  runDaily,
  getStatus,
  isRunning,
  reset: store.reset,
  calcTEMASeries,
  analyzeSymbol,
  CONFIG,
};
