/**
 * BIST Portföy Motoru — paylaşımlı, store-parametreli sanal portföy çekirdeği
 *
 * İki "hisse önerisi" botu (bistAlScanner @borsasinyal34 · bistSignals ≥75 ana
 * kanal) bu TEK motoru kullanır. Her bot = bir `createPositionStore(...)` örneği
 * + bir `cfg` nesnesi. Böylece para matematiği tek yerde yaşar, kod tekrar etmez.
 *
 * ⭐ "ELİMDE OLMAYANA SAT/STOP OLMASIN" GARANTİSİ — YAPISAL, koda gömülü değil:
 *   • Giriş (AL): `syncBuys` her aday için `store.findBySymbol(sym,['open','pending'])`
 *     ile korunur → tutulan sembole ikinci AL AÇILMAZ.
 *   • Çıkış (SAT/STOP/TP): `manageHeld` YALNIZ `store.listOpen()` üzerinde döner →
 *     tutulmayan bir sembol hiçbir çıkış döngüsüne giremez; onun için asla SAT/STOP
 *     üretilemez. (botEngine/customBotEngine ile aynı kanıtlanmış invaryant.)
 *
 * Para muhasebesi nakit-korunumlu (customBotEngine ile birebir): AL → cash -=
 * maliyet+komisyon; kapanış → cash += brüt − çıkış komisyonu. Tümü sanaldır.
 *
 * Boyutlandırma RİSK-BAZLI: her işlemde sermayenin `riskPct`'i (vars. %1 = 1R)
 * riske edilir → adet = risk_bütçesi / (giriş − stop). Dar stop aşırı-tahsis
 * etmesin diye pozisyon başına notional tavanı (`maxPositionPct × sermaye`) var.
 *
 * Çıkış tespiti (`detectDailyExit`) bistSignalTracker/bistAlScannerTracker'ın
 * KANITLANMIŞ evalOne çekirdeğinin tek, saf birleşimidir: gerçek günlük low/high,
 * ±%20 bant-dışı sahte-veri reddi, ileri-yönlü stop (stopSetDate), aynı-barda
 * SL-önce-TP. Oluşan (yarım) mum `completedCandles` ile düşürülür.
 */

const trailingManager = require('../tradingBotV2/trailingManager');
const riskGuard = require('../botRiskGuard');
const marketHours = require('../marketHours');
const analytics = require('./analytics');
const { ema } = require('../forex/indicators');

function nowISO(d) { return (d || new Date()).toISOString(); }
function sameDayKey(dateLike) {
  try { return new Date(dateLike).toISOString().slice(0, 10); } catch (_) { return null; }
}
function dateOf(c) { return c.date || (Number.isFinite(c.timestamp) ? new Date(c.timestamp).toISOString().slice(0, 10) : null); }
function num(v, def) { const n = Number(v); return Number.isFinite(n) ? n : def; }

// Sembol → sektör (allBistStocks'tan tembel harita; aday/pozisyon üzerinde
// açıkça verilmişse o kullanılır → motor test edilebilir kalır).
let _sectorMap = null;
function sectorOf(symbol, explicit) {
  if (explicit) return explicit;
  if (!_sectorMap) {
    _sectorMap = {};
    try {
      const { allBistStocks } = require('../../data/allBistStocks');
      for (const s of (allBistStocks || [])) if (s && s.symbol) _sectorMap[s.symbol] = s.sector || null;
    } catch (_) { _sectorMap = {}; }
  }
  return _sectorMap[symbol] || null;
}

// ── Konfig (env-tabanlı; bot cfg'i bunları override edebilir) ────────────────
function buildConfig(overrides = {}) {
  const capital = num(process.env.BIST_PORTFOLIO_CAPITAL, 100000);
  return {
    key: 'portfolio',
    currency: 'TRY',
    capital,
    riskPct: num(process.env.BIST_PORTFOLIO_RISK_PCT, 0.01),        // işlem başı risk (1R)
    maxPositionPct: num(process.env.BIST_PORTFOLIO_MAX_POS_PCT, 0.20), // poz. başı notional tavanı
    maxConcurrent: num(process.env.BIST_PORTFOLIO_MAX_CONCURRENT, 10),
    commissionPct: num(process.env.BIST_PORTFOLIO_COMMISSION_PCT, 0.002),
    slippagePct: num(process.env.BIST_PORTFOLIO_SLIPPAGE_PCT, 0.001),
    // 20→40 (2026-07-19, 2y/2-pencere OOS). ⚠️ ETKİLEŞİM: timeout tek başına
    // FAYDASIZ (60 tek başına baseline'ın ALTINDA kaldı); yalnız strategySell
    // KAPALIYKEN kazandırıyor. İkisi birlikte: ort. getiri %11.67→%17.86.
    timeoutDays: num(process.env.BIST_PORTFOLIO_TIMEOUT_DAYS, 40),
    minPositionTL: num(process.env.BIST_PORTFOLIO_MIN_POSITION_TL, 100),
    // Scale-out: TP1'de pozisyonun tp1Fraction'ı satılır, stop girişe (breakeven)
    // çekilir, kalan TP2'ye trailing ile koşar → kazananlar erken kesilmez.
    scaleOut: process.env.BIST_PORTFOLIO_SCALEOUT !== '0',
    tp1Fraction: num(process.env.BIST_PORTFOLIO_TP1_FRACTION, 0.5),
    // ⭐ Strateji-SAT (trend-kırılım çıkışı) VARSAYILAN KAPALI (2026-07-19 backtest).
    // 2 yıl / 2 bağımsız pencere: bu çıkış WHIPSAW üretiyor — EMA34 altına sarkan
    // hisse satılıyor, sonra toparlanıyor. Kapatınca (timeout40 ile birlikte) ort.
    // getiri %11.67→%17.86, PF 1.65→1.95 & 1.22→1.38, düşüş P2'de %9.98→%7.65.
    // Açmak için: BIST_PORTFOLIO_STRATEGY_SELL=1
    // ⚠️ KISIT: her iki test penceresi de BOĞA piyasası. Ayı rejiminde trend-kırılım
    // çıkışı koruyucu olabilir; pozisyon başına düşüş yine STOP ile sınırlı.
    strategySell: process.env.BIST_PORTFOLIO_STRATEGY_SELL === '1',
    sellConfirmDays: num(process.env.BIST_PORTFOLIO_SELL_CONFIRM_DAYS, 1),
    // "Kazananı koştur, bozulanı kes": strateji-SAT yalnız pozisyon ZARARDAYKEN
    // tetiklensin (kârdaki pozisyon trend sarsıntısında satılmasın; onu TP/trailing yönetir).
    sellOnlyWhenLosing: process.env.BIST_PORTFOLIO_SELL_ONLY_LOSING === '1',
    // Sektör konsantrasyon tavanı (0 = sınırsız). Aynı sektörden en fazla N açık
    // pozisyon — 5 bankayı birlikte tutup topluca düşmeyi önler. ⚠️ Varsayılan 0:
    // faydası backtest'te KANITLANANA kadar kapalı.
    maxPerSector: num(process.env.BIST_PORTFOLIO_MAX_PER_SECTOR, 0),
    band: 0.20,                     // sahte-stop bandı (BIST ±%20)
    maxDrawdownPct: num(process.env.BIST_PORTFOLIO_MAX_DD_PCT, 25),
    dailyLossLimitPct: num(process.env.BIST_PORTFOLIO_DAILY_LOSS_PCT, 10),
    precision: 2,
    ...overrides,
  };
}

// ── Boyutlandırma (risk-bazlı) ───────────────────────────────────────────────
// riskBudget = sermaye × riskPct → adet = riskBudget / (giriş−stop).
// notional = min(risk-notional, poz.tavanı, nakit). Dar stop → tavan bağlar
// (efektif risk %1 altına düşer; ihtiyatlı). Adet TAM SAYI (BIST lot=1).
function computeSize(cfg, { entry, stop, cash, capital }) {
  if (!(entry > 0) || !(stop > 0) || stop >= entry) return { ok: false, reason: 'invalid_stop' };
  const fillPrice = +(entry * (1 + cfg.slippagePct)).toFixed(4);
  const riskPerShare = fillPrice - stop;   // fillPrice>entry>stop ⇒ >0

  const riskBudget = capital * cfg.riskPct;
  const rawShares = riskBudget / riskPerShare;
  const riskNotional = rawShares * fillPrice;
  const notionalCap = cfg.maxPositionPct * capital;
  // Komisyona yer bırak: notional + komisyon ≤ nakit
  const cashForNotional = cash / (1 + cfg.commissionPct);
  const notional = Math.min(riskNotional, notionalCap, cashForNotional);

  const shares = Math.floor(notional / fillPrice);
  if (!(shares >= 1)) return { ok: false, reason: 'no_cash' };

  const positionSizeTL = +(shares * fillPrice).toFixed(2);
  if (positionSizeTL < cfg.minPositionTL) return { ok: false, reason: 'min_position' };
  const commission = +(positionSizeTL * cfg.commissionPct).toFixed(2);
  if (cash < positionSizeTL + commission) return { ok: false, reason: 'no_cash' };

  return { ok: true, fillPrice, shares, positionSizeTL, commission };
}

// ── Pozisyon aç ──────────────────────────────────────────────────────────────
// sig: { symbol,name,entry,stop,target1,target2,rr1,rr2, avgVoteScore/confidence/score, grade, gate?, precision? }
// opts: { now, source, fillPrice, signalDate, entryDate, stopSetDate }  (adopt için override)
function openPosition(store, cfg, sig, opts = {}) {
  const now = opts.now || new Date();
  const pf = store.getPortfolio();
  const capital = pf.capital || cfg.capital;
  const entry = Number(sig.entry);
  const stop = Number(sig.stop);
  if (!(entry > 0) || !(stop > 0) || !(stop < entry)) return { ok: false, reason: 'invalid_levels' };

  const size = computeSize(cfg, { entry, stop, cash: pf.cash, capital });
  if (!size.ok) return size;

  // Adopt/override: sabit dolum fiyatı ve tarihler geçilebilir
  const fillPrice = opts.fillPrice != null ? +Number(opts.fillPrice).toFixed(4) : size.fillPrice;
  const positionSizeTL = +(size.shares * fillPrice).toFixed(2);
  const commission = +(positionSizeTL * cfg.commissionPct).toFixed(2);
  if (pf.cash < positionSizeTL + commission) return { ok: false, reason: 'no_cash' };

  const target1 = Number(sig.target1) > fillPrice ? +Number(sig.target1).toFixed(sig.precision ?? cfg.precision) : null;
  const target2 = Number(sig.target2) > fillPrice ? +Number(sig.target2).toFixed(sig.precision ?? cfg.precision) : null;
  const score = num(sig.score ?? sig.avgVoteScore ?? sig.confidence, null);
  const riskPct = +(((fillPrice - stop) / fillPrice) * 100).toFixed(2);
  const rewardPct = target1 != null ? +(((target1 - fillPrice) / fillPrice) * 100).toFixed(2) : null;

  const signalDate = opts.signalDate || sameDayKey(now);
  const entryDate = opts.entryDate || nowISO(now);
  const stopSetDate = opts.stopSetDate || sameDayKey(now);

  pf.cash = +(pf.cash - positionSizeTL - commission).toFixed(2);
  pf.openCount = (pf.openCount || 0) + 1;
  pf.ticketCounter = (pf.ticketCounter || 0) + 1;
  const ticket = String(pf.ticketCounter).padStart(3, '0');
  store.savePortfolio(pf);

  const pos = store.addPosition({
    symbol: sig.symbol, name: sig.name || sig.symbol,
    sector: sectorOf(sig.symbol, sig.sector),
    direction: 'long', status: 'open', source: opts.source || 'strategy',
    ticket,
    signalDate, entryDate,
    entryPrice: fillPrice, shares: size.shares, positionSizeTL, commissionPaid: commission,
    originalEntry: fillPrice, originalStop: stop, originalTarget: target1,
    currentStop: stop, currentTarget: target1,
    target2, rr1: sig.rr1 ?? null, rr2: sig.rr2 ?? null,
    score, avgVoteScore: sig.avgVoteScore ?? null, confidence: sig.confidence ?? null,
    grade: sig.grade ?? null, precision: sig.precision ?? cfg.precision,
    riskPct, rewardPct,
    lastPrice: fillPrice, stopSetDate,
    notes: [{ time: nowISO(now), action: 'entry', text: `${(opts.source || 'strateji')} — ${fillPrice.toFixed(2)} TL'den ${size.shares} adet (${positionSizeTL.toFixed(2)} TL, komisyon ${commission.toFixed(2)}). Risk %${riskPct}${rewardPct != null ? `, odul %${rewardPct}` : ''}.` }],
  });

  if (typeof store.appendSignalLog === 'function') {
    try {
      store.appendSignalLog({
        symbol: sig.symbol, signalDate, signalPhase: 'scan', strategy: cfg.key,
        direction: 'long', entry: fillPrice, stop, target: target1,
        totalScore: score, grade: sig.grade ?? null, outcome: 'triggered', positionId: pos.id,
      });
    } catch (_) {}
  }
  return { ok: true, position: pos };
}

// ── Pozisyon kapat (nakit-korunumlu, iki yönlü komisyon) ─────────────────────
function closePosition(store, cfg, pos, exitPrice, reason, noteText, opts = {}) {
  const now = opts.now || new Date();
  const pf = store.getPortfolio();
  const exitCommission = +(exitPrice * pos.shares * cfg.commissionPct).toFixed(2);
  const grossProceeds = +(exitPrice * pos.shares).toFixed(2);
  const netProceeds = +(grossProceeds - exitCommission).toFixed(2);
  const costBasis = +(pos.entryPrice * pos.shares).toFixed(2);
  const realizedPnL = +(netProceeds - costBasis - (pos.commissionPaid || 0)).toFixed(2);
  const realizedPnLPct = +((realizedPnL / (costBasis + (pos.commissionPaid || 0))) * 100).toFixed(2);
  const priceReturnPct = +(((exitPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(2);
  const closedAt = nowISO(now);

  const closedPos = store.updatePosition(pos.id, {
    status: 'closed', exitDate: closedAt, exitPrice, exitReason: reason,
    realizedPnL, realizedPnLPct, priceReturnPct, closingCommission: exitCommission,
  });
  if (typeof store.appendNote === 'function') {
    store.appendNote(pos.id, 'exit', `${noteText || ''} Cikis ${exitPrice.toFixed(2)}. Net P&L: ${realizedPnL >= 0 ? '+' : ''}${realizedPnL.toFixed(2)} TL (%${realizedPnLPct}).`);
  }
  store.appendTrade({ ...(closedPos || pos), ...(store.findById ? store.findById(pos.id) : {}) });
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

  if (pos.signalLogId && typeof store.updateSignalLog === 'function') {
    const outcome = reason === 'target' ? 'closed_target' : reason === 'stop' ? 'closed_stop'
      : reason === 'signal_exit' ? 'closed_signal' : reason === 'timeout' ? 'closed_timeout' : 'closed_other';
    try { store.updateSignalLog(pos.signalLogId, { outcome, exitDate: closedAt, exitPrice, exitReason: reason, finalReturnPct: realizedPnLPct, finalPnL: realizedPnL }); } catch (_) {}
  }
  return {
    symbol: pos.symbol, name: pos.name, ticket: pos.ticket, precision: pos.precision ?? cfg.precision,
    entry: pos.entryPrice, exit: exitPrice, exitDate: opts.exitDate || sameDayKey(closedAt),
    reason, outcome: reason, shares: pos.shares, score: pos.score,
    realizedPnL, realizedPnLPct, priceReturnPct, pnlPct: priceReturnPct,
    stop: pos.currentStop, target1: pos.currentTarget,
  };
}

// ── KISMİ kapanış (scale-out): TP1'de bir kısmını sat, kalanı koştur ─────────
// Satılan kısım gerçekleşen K/Z olarak defterlenir (ayrı trade kaydı), pozisyon
// AÇIK kalır: adet azalır, stop GİRİŞE (breakeven) çekilir, hedef TP2 olur.
// Böylece kazanan pozisyon erken tam kesilmez ama risk sıfıra iner.
function partialClose(store, cfg, pos, exitPrice, fraction, reason, opts = {}) {
  const now = opts.now || new Date();
  const sellShares = Math.floor(pos.shares * fraction);
  // Bölünemiyorsa (1 adet / oran çok büyük) → tam kapat
  if (!(sellShares >= 1) || sellShares >= pos.shares) {
    return closePosition(store, cfg, pos, exitPrice, 'target', opts.note || 'TP1 (bolunemedi, tam kapandi)', opts);
  }
  const pf = store.getPortfolio();
  const exitCommission = +(exitPrice * sellShares * cfg.commissionPct).toFixed(2);
  const grossProceeds = +(exitPrice * sellShares).toFixed(2);
  const netProceeds = +(grossProceeds - exitCommission).toFixed(2);
  const costBasis = +(pos.entryPrice * sellShares).toFixed(2);
  const entryCommPortion = +(((pos.commissionPaid || 0) * sellShares) / pos.shares).toFixed(2);
  const realizedPnL = +(netProceeds - costBasis - entryCommPortion).toFixed(2);
  const realizedPnLPct = +((realizedPnL / (costBasis + entryCommPortion)) * 100).toFixed(2);
  const priceReturnPct = +(((exitPrice - pos.entryPrice) / pos.entryPrice) * 100).toFixed(2);
  const closedAt = nowISO(now);

  // Satılan kısım için trade kaydı (append-only defter)
  store.appendTrade({
    symbol: pos.symbol, name: pos.name, ticket: pos.ticket, precision: pos.precision,
    entryPrice: pos.entryPrice, entryDate: pos.entryDate, shares: sellShares,
    exitPrice, exitDate: closedAt, exitReason: 'tp1_partial', partial: true,
    realizedPnL, realizedPnLPct, priceReturnPct, score: pos.score, recordedAt: closedAt,
  });

  // Kalan pozisyon: adet/komisyon oransal düşer, stop BREAKEVEN, hedef TP2
  const remShares = pos.shares - sellShares;
  const remCommission = +(((pos.commissionPaid || 0) - entryCommPortion)).toFixed(2);
  const breakeven = Math.max(pos.currentStop, pos.entryPrice);
  const nextTarget = (pos.target2 != null && pos.target2 > pos.currentTarget) ? pos.target2 : pos.currentTarget;
  store.updatePosition(pos.id, {
    shares: remShares, commissionPaid: remCommission,
    positionSizeTL: +(remShares * pos.entryPrice).toFixed(2),
    currentStop: breakeven, currentTarget: nextTarget,
    tp1Done: true, stopSetDate: sameDayKey(now),
  });
  if (typeof store.appendNote === 'function') {
    store.appendNote(pos.id, 'tp1', `TP1 ${exitPrice.toFixed(2)} — ${sellShares} adet satildi (${realizedPnL >= 0 ? '+' : ''}${realizedPnL.toFixed(2)} TL). Stop girise ${breakeven.toFixed(2)}, hedef TP2 ${nextTarget != null ? nextTarget.toFixed(2) : '-'}. ${remShares} adet kosuyor.`);
  }

  pf.cash = +(pf.cash + netProceeds).toFixed(2);
  pf.totalRealizedPnL = +((pf.totalRealizedPnL || 0) + realizedPnL).toFixed(2);
  pf.totalRealizedPnLPct = +((pf.totalRealizedPnL / pf.capital) * 100).toFixed(2);
  if (realizedPnL > 0) pf.winCount = (pf.winCount || 0) + 1;
  else if (realizedPnL < 0) pf.lossCount = (pf.lossCount || 0) + 1;
  const totalClosed = (pf.winCount || 0) + (pf.lossCount || 0);
  pf.winRate = totalClosed > 0 ? +((pf.winCount / totalClosed) * 100).toFixed(1) : 0;
  store.savePortfolio(pf);   // openCount DEĞİŞMEZ — pozisyon açık kalır

  return {
    symbol: pos.symbol, name: pos.name, ticket: pos.ticket, precision: pos.precision ?? cfg.precision,
    entry: pos.entryPrice, exit: exitPrice, exitDate: opts.exitDate || sameDayKey(closedAt),
    reason: 'tp1_partial', outcome: 'tp1_partial', shares: sellShares, score: pos.score,
    realizedPnL, realizedPnLPct, priceReturnPct, pnlPct: priceReturnPct,
    partial: true, remainingShares: remShares, newStop: breakeven, newTarget: nextTarget,
  };
}

// ── Oluşan (yarım) mumu düşür ────────────────────────────────────────────────
// Yerel Yahoo bugünkü YARIM barı verir; borsa kapanmadan onu dışla → sahte
// TP/SL + zıplayan equity önlenir. (bistAlScannerNotifier.latestClose deseni.)
function completedCandles(candles, now = new Date()) {
  const arr = (candles || []).filter(c => c && Number.isFinite(c.close));
  if (!arr.length) return arr;
  const last = arr[arr.length - 1];
  const d = dateOf(last);
  const trToday = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  if (d === trToday && marketHours.minutesNow(now) < (marketHours.CLOSE_MIN + 5)) return arr.slice(0, -1);
  return arr;
}

// ── Tek pozisyon çıkış tespiti (STOP/TP/timeout) — SAF ───────────────────────
// candles: kronolojik, TAMAMLANMIŞ günlük barlar (çağıran completedCandles uygular).
// bistSignalTracker/bistAlScannerTracker.evalOne çekirdeğiyle birebir mantık.
function detectDailyExit(pos, candles, cfg, opts = {}) {
  const now = opts.now || new Date();
  const arr = (candles || []).filter(c => c && Number.isFinite(c.close));
  const issueDate = sameDayKey(pos.signalDate || pos.entryDate);
  const stopSince = pos.stopSetDate || issueDate;
  const band = cfg.band ?? 0.20;
  let prevClose = null;
  for (const c of arr) {
    const d = dateOf(c);
    const pc = prevClose;
    prevClose = c.close;
    if (d != null && issueDate != null && d <= issueDate) continue;   // giriş günü + öncesi yok sayılır
    const lo = c.low, hi = c.high;
    const badLow = lo == null || lo <= 0 || (pc && lo < pc * (1 - band));
    const badHigh = hi == null || (pc && hi > pc * (1 + band));
    const slHit = !badLow && (stopSince == null || d > stopSince) && lo <= pos.currentStop;
    const tpHit = !badHigh && pos.currentTarget != null && hi >= pos.currentTarget;
    if (slHit) return { hit: 'stop', exitPrice: pos.currentStop, exitDate: d, ref: lo };   // aynı barda ikisi → ihtiyatlı SL
    if (tpHit) return { hit: 'target', exitPrice: pos.currentTarget, exitDate: d, ref: hi };
  }
  // Timeout / EXPIRE
  const ageDays = (now.getTime() - new Date(pos.entryDate || pos.signalDate).getTime()) / 86400000;
  if (cfg.timeoutDays > 0 && ageDays > cfg.timeoutDays) {
    const last = arr.length ? arr[arr.length - 1] : null;
    return { hit: 'timeout', exitPrice: last ? +Number(last.close).toFixed(pos.precision ?? cfg.precision) : pos.entryPrice, exitDate: last ? dateOf(last) : null, ref: last ? last.close : null };
  }
  return { hit: null };
}

// ── Açık pozisyonları yönet — YALNIZ listOpen() (held-only invaryant) ────────
// ctx: { qualifiedSymbols:Set, resolve:async(symbol)=>({candles}), now }
// Nakit DEĞİŞTİRMEZ — kapanış NİYETLERİ döner (garantili teslim: notifier gönderince
// commitCloses ile kesinleşir). lastPrice + trailing güncellemeleri güvenle uygulanır.
async function manageHeld(store, cfg, ctx = {}) {
  const now = ctx.now || new Date();
  // qualifiedSymbols VERİLDİYSE (taze tarama sonrası) strateji-SAT değerlendirilir;
  // verilmediyse (çıplak 5dk tick, tarama YOK) YALNIZ STOP/TP/timeout — çünkü
  // "nitelik-dışı" bilgisi yalnız taramadan gelir; yoksa yanlışlıkla hepsini satarız.
  const qualified = ctx.qualifiedSymbols instanceof Set ? ctx.qualifiedSymbols
    : (Array.isArray(ctx.qualifiedSymbols) ? new Set(ctx.qualifiedSymbols) : null);
  const intents = [];
  let errors = 0;

  for (const pos of store.listOpen()) {
    let candles = null;
    try {
      if (typeof ctx.resolve === 'function') { const d = await ctx.resolve(pos.symbol); candles = d && d.candles; }
      else if (ctx.candlesBySymbol) candles = ctx.candlesBySymbol[pos.symbol];
    } catch (_) { candles = null; }

    const completed = completedCandles(candles, now);
    if (!completed || completed.length < 2) { errors++; continue; }   // veri yok → pozisyonu KORU

    const lastClose = completed[completed.length - 1].close;
    if (Number.isFinite(lastClose)) store.updatePosition(pos.id, { lastPrice: +Number(lastClose).toFixed(pos.precision ?? cfg.precision) });

    // 1) STOP / TP / timeout (fiyat-tetikli; sahte-stop korumalı)
    const cur = store.findById ? (store.findById(pos.id) || pos) : pos;
    const ev = detectDailyExit(cur, completed, cfg, { now });
    if (ev.hit === 'stop' || ev.hit === 'timeout') {
      intents.push({ pos: cur, exitPrice: ev.exitPrice, reason: ev.hit, exitDate: ev.exitDate, ref: ev.ref });
      continue;
    }
    if (ev.hit === 'target') {
      // SCALE-OUT: TP1 ilk kez vurulduysa ve koşacak bir TP2 varsa → KISMİ sat,
      // stop girişe, kalan TP2'ye koşar. Aksi halde (TP2 yok / TP1 zaten alındı) tam kapat.
      const canScale = cfg.scaleOut && !cur.tp1Done && cur.target2 != null && cur.target2 > cur.currentTarget;
      if (canScale) {
        intents.push({ pos: cur, exitPrice: ev.exitPrice, reason: 'tp1_partial', partial: true, fraction: cfg.tp1Fraction, exitDate: ev.exitDate, ref: ev.ref });
      } else {
        intents.push({ pos: cur, exitPrice: ev.exitPrice, reason: 'target', exitDate: ev.exitDate, ref: ev.ref });
      }
      continue;
    }

    // 2) Strateji SAT (held-only): nitelik-dışına düştü + tamamlanmış-bar close < EMA34
    //    + bugün girilmedi (whipsaw/aynı-gün churn önlenir).
    const enteredToday = sameDayKey(cur.entryDate) === sameDayKey(now);
    const closes = completed.map(c => c.close);
    const ema34 = ema(closes, 34);
    const dropped = qualified != null && !qualified.has(cur.symbol);
    // N gün üst üste EMA34 altı kapanış teyidi (sellConfirmDays=1 → eski davranış)
    const confirmN = Math.max(1, cfg.sellConfirmDays || 1);
    const lastN = closes.slice(-confirmN);
    const belowConfirmed = ema34 != null && lastN.length === confirmN && lastN.every(c => c < ema34);
    const losing = lastClose < cur.entryPrice;
    const sellAllowed = !cfg.sellOnlyWhenLosing || losing;
    if (cfg.strategySell !== false && sellAllowed && qualified != null && !enteredToday && dropped && belowConfirmed) {
      intents.push({
        pos: cur, exitPrice: +Number(lastClose).toFixed(cur.precision ?? cfg.precision),
        reason: 'signal_exit', exitDate: dateOf(completed[completed.length - 1]) || sameDayKey(now),
        note: `Trend kirildi (EMA34 ${(+ema34).toFixed(2)} alti) + nitelik disi`,
      });
      continue;
    }

    // 3) Trailing (yalnız yukarı; hemen uygulanır — kapanış değil)
    let atrVal = 0;
    try { atrVal = trailingManager.calcATR(completed.slice(-30), 14); } catch (_) {}
    const trail = trailingManager.computeTrailing(
      { entryPrice: cur.entryPrice, originalStop: cur.originalStop, currentStop: cur.currentStop, direction: 'long' },
      lastClose, atrVal,
    );
    if (trail && trail.newStop > cur.currentStop) {
      store.updatePosition(cur.id, { currentStop: trail.newStop, stopSetDate: sameDayKey(now) });
      if (typeof store.appendNote === 'function') store.appendNote(cur.id, 'trail', trail.note);
    }
  }
  return { intents, errors };
}

// ── Kapanış niyetlerini kesinleştir (teslim sonrası) ─────────────────────────
// Idempotent: open'da olmayan pozisyon atlanır (çift kapanış yok).
function commitCloses(store, cfg, intents, opts = {}) {
  const closed = [];
  for (const it of (intents || [])) {
    if (!it || !it.pos) continue;
    const live = store.findById ? store.findById(it.pos.id) : it.pos;
    if (!live || live.status !== 'open') continue;   // zaten kapanmış → atla
    if (it.partial) {   // scale-out: kısmi sat, pozisyon açık kalır
      closed.push(partialClose(store, cfg, live, it.exitPrice, it.fraction ?? cfg.tp1Fraction, it.reason, { now: opts.now, exitDate: it.exitDate }));
      continue;
    }
    const note = it.note || (it.reason === 'stop' ? 'Stop tetiklendi' : it.reason === 'target' ? (live.tp1Done ? 'Hedef (TP2) tetiklendi' : 'Hedef (TP1) tetiklendi') : it.reason === 'timeout' ? 'Sure doldu' : 'Cikis');
    const ev = closePosition(store, cfg, live, it.exitPrice, it.reason, note, { now: opts.now, exitDate: it.exitDate });
    closed.push(ev);
  }
  return { closed };
}

// ── Equity yeniden hesapla ───────────────────────────────────────────────────
function recomputeEquity(store) {
  const pf = store.getPortfolio();
  const openValue = store.listOpen().reduce((s, p) => s + ((p.lastPrice || p.entryPrice) * p.shares), 0);
  const equity = +(pf.cash + openValue).toFixed(2);
  if (typeof store.recordEquityPoint === 'function') store.recordEquityPoint(equity);
  return equity;
}

// ── AL: nitelikli adayları risk-bazlı pozisyona aç (held-guard + slot cap) ───
function syncBuys(store, candidates, cfg, opts = {}) {
  const now = opts.now || new Date();
  const pf = store.getPortfolio();
  const opened = [];
  const skipped = [];

  // Kill-switch / risk devre kesici — halt ise yeni giriş YOK (yönetim etkilenmez)
  if (pf.tradingEnabled === false) return { opened, skipped, halted: true, haltReason: pf.haltReason || 'manual_pause' };
  const today = sameDayKey(now);
  const todayPnL = riskGuard.sumTodayRealizedPnL(store.listTrades(300), today);
  const halt = riskGuard.shouldHaltEntries(pf, { maxDrawdownPct: cfg.maxDrawdownPct, dailyLossLimitPct: cfg.dailyLossLimitPct }, todayPnL);
  if (halt.halt) return { opened, skipped, halted: true, haltReason: halt.reason };

  const sorted = [...(candidates || [])]
    .filter(c => c && c.direction === 'long' && Number(c.entry) > 0 && Number(c.stop) > 0 && Number(c.stop) < Number(c.entry))
    .sort((a, b) => (num(b.score ?? b.avgVoteScore ?? b.confidence, 0)) - (num(a.score ?? a.avgVoteScore ?? a.confidence, 0)));

  for (const sig of sorted) {
    if (store.findBySymbol(sig.symbol, ['open', 'pending'])) continue;   // ⭐ tutulan sembole ikinci AL YOK
    if (store.listOpen().length >= cfg.maxConcurrent) break;             // slot doldu
    // Sektör konsantrasyon tavanı (aktifse)
    if (cfg.maxPerSector > 0) {
      const sec = sectorOf(sig.symbol, sig.sector);
      if (sec) {
        const inSector = store.listOpen().filter(p => sectorOf(p.symbol, p.sector) === sec).length;
        if (inSector >= cfg.maxPerSector) { skipped.push({ symbol: sig.symbol, reason: 'sector_cap', sector: sec }); continue; }
      }
    }
    const res = openPosition(store, cfg, sig, { now });
    if (res.ok) opened.push(res.position);
    else skipped.push({ symbol: sig.symbol, reason: res.reason });
  }
  return { opened, skipped };
}

// ── Portföy anlık görüntüsü (API/UI) ─────────────────────────────────────────
function snapshot(store, cfg) {
  const pf = store.getPortfolio();
  const open = store.listOpen().map(p => {
    const last = p.lastPrice || p.entryPrice;
    return {
      ...p, lastPrice: last,
      unrealizedPnL: +((last - p.entryPrice) * p.shares).toFixed(2),
      unrealizedPct: +(((last - p.entryPrice) / p.entryPrice) * 100).toFixed(2),
    };
  });
  const openValue = open.reduce((s, p) => s + p.lastPrice * p.shares, 0);
  const equity = +(pf.cash + openValue).toFixed(2);
  const unrealizedTotal = +open.reduce((s, p) => s + p.unrealizedPnL, 0).toFixed(2);
  const allTrades = (typeof store.listTrades === 'function' ? store.listTrades(500) : []);
  return {
    portfolio: pf,
    kpis: {
      equity, cash: +pf.cash.toFixed(2), capital: pf.capital,
      totalRealizedPnL: +(pf.totalRealizedPnL || 0).toFixed(2),
      totalReturnPct: +(((equity - pf.capital) / pf.capital) * 100).toFixed(2),
      unrealizedTotal, openCount: open.length,
      winCount: pf.winCount || 0, lossCount: pf.lossCount || 0, winRate: pf.winRate || 0,
      tradingEnabled: pf.tradingEnabled !== false, haltReason: pf.haltReason || null,
    },
    metrics: analytics.computeMetrics({ trades: allTrades, equityHistory: pf.equityHistory }),
    open: open.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.symbol.localeCompare(b.symbol)),
    closed: allTrades.slice(0, 50),
    equityHistory: pf.equityHistory || [],
  };
}

// ── Basit per-anahtar kilit (15dk scan ↔ 5dk tick çakışmasını serileştir) ────
const _locks = new Map();
async function withLock(key, fn) {
  while (_locks.get(key)) { try { await _locks.get(key); } catch (_) {} }
  let release;
  const p = new Promise(res => { release = res; });
  _locks.set(key, p);
  try { return await fn(); }
  finally { _locks.delete(key); release(); }
}

module.exports = {
  buildConfig, computeSize, openPosition, closePosition, partialClose,
  completedCandles, detectDailyExit, manageHeld, commitCloses,
  recomputeEquity, syncBuys, snapshot, withLock,
  // test yardımcıları
  _sameDayKey: sameDayKey, _dateOf: dateOf,
};
