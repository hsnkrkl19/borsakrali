'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const catalog = require('./catalog');
const botPersistence = require('../botPersistence');
const instrumentBans = require('../instrumentBans');
const lotLimits = require('../lotLimits');

const STARTING_EQUITY = 10_000;
const RISK_PCT = 1;
const MAX_TRADES = 4000;
const MAX_SEEN = 8000;
const DATA_DIR = process.env.BOT_COMPETITION_DATA_DIR
  || path.join(process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'bot-competition');
const REGISTRY_FILE = path.join(DATA_DIR, 'registry.json');
const TEST_EPHEMERAL = process.env.NODE_ENV === 'test' && !process.env.BOT_COMPETITION_DATA_DIR;
const BY_ID = new Map(catalog.map((entry) => [entry.id, entry]));

function nowISO() { return new Date().toISOString(); }
// Zaman dilimi metnini ms'e çevir ("15m"→900000, "1h"→3600000, "1d"→86400000).
function timeframeMs(tf) {
  const m = String(tf || '').toLowerCase().match(/^(\d+)\s*(m|h|d|w)?$/);
  if (!m) return 15 * 60000;
  const n = Number(m[1]) || 15;
  const u = m[2] || 'm';
  const unit = u === 'w' ? 604800000 : u === 'd' ? 86400000 : u === 'h' ? 3600000 : 60000;
  return Math.max(60000, n * unit);
}
// Aşırı düşük güvenli sinyalleri competition/gerçek yürütmeye sokma (kalite kapısı).
// COMPETITION_MIN_CONFIDENCE=0 ile kapatılır. Güven taşımayan sinyaller etkilenmez.
const MIN_CONFIDENCE = Number(process.env.COMPETITION_MIN_CONFIDENCE ?? 55);
// Komisyon/spread, riskin en fazla bu oranı kadar olabilir. Aşarsa kurulum
// "kuruş işlem" sayılır ve alınmaz. 0 ile kapatılır.
// KALİBRASYON (2026-07-21): 0.15 FAZLA SIKIYDI — EURUSD 20 pip stopta costR 0.171
// çıkıp MAKUL işlemleri de eliyordu (canlıda forex/scanner 0 pozisyona düştü).
// Ayrıca catalog costBps'leri gerçek FTMO maliyetinin ~2.3 katı (tutucu), yani
// kapı zaten fazladan sıkı. 0.25 → 14 pip altı elenir (kuruş), 20 pip+ geçer.
const MAX_COST_R = Number(process.env.COMPETITION_MAX_COST_R ?? 0.25);
function finite(value, fallback = null) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round(value, digits = 4) {
  const n = finite(value, 0);
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24); }
function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '');
}
function normalizeSide(value) {
  const v = String(value || '').trim().toLowerCase();
  if (['long', 'buy', 'al', 'bull', 'bullish', 'strong_long', 'strong long'].includes(v)) return 'long';
  if (['short', 'sell', 'sat', 'bear', 'bearish', 'strong_short', 'strong short'].includes(v)) return 'short';
  if (v.includes('long') || v.includes('bull') || v === 'up' || v === 'cross_above') return 'long';
  if (v.includes('short') || v.includes('bear') || v === 'down' || v === 'cross_below') return 'short';
  return '';
}
function firstFinite(...values) {
  for (const value of values) {
    const n = finite(value);
    if (n != null) return n;
  }
  return null;
}
function stageFor(count) {
  if (count < 15) return 'collecting';
  if (count < 30) return 'provisional';
  if (count < 60) return 'evaluation';
  return 'candidate';
}
function seasonId() { return `season-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`; }

function freshBot(entry) {
  return {
    id: entry.id,
    enabled: entry.competitionEligible,
    equity: STARTING_EQUITY,
    peakEquity: STARTING_EQUITY,
    realizedUsd: 0,
    maxDrawdownPct: 0,
    open: {},
    trades: [],
    seen: [],
    learning: {
      riskMultiplier: 1,
      recommendation: 'Veri toplanıyor.',
      lastAdjustedAt: null,
      lastAdjustedTradeCount: 0,
    },
    updatedAt: null,
  };
}

function freshState() {
  const bots = {};
  for (const entry of catalog) bots[entry.id] = freshBot(entry);
  return {
    version: 1,
    enabled: true,
    executionScope: 'paper_competition_only',
    season: { id: seasonId(), startedAt: nowISO(), startingEquity: STARTING_EQUITY, riskPct: RISK_PCT },
    bots,
    updatedAt: nowISO(),
  };
}

let state = freshState();
let loaded = false;

function mergeState(raw) {
  const base = freshState();
  if (!raw || typeof raw !== 'object') return base;
  base.enabled = raw.enabled !== false;
  base.season = { ...base.season, ...(raw.season || {}) };
  for (const entry of catalog) {
    const saved = raw.bots?.[entry.id];
    if (!saved) continue;
    const bot = base.bots[entry.id];
    Object.assign(bot, saved);
    bot.open = saved.open && typeof saved.open === 'object' ? saved.open : {};
    bot.trades = Array.isArray(saved.trades) ? saved.trades.slice(-MAX_TRADES) : [];
    bot.seen = Array.isArray(saved.seen) ? saved.seen.slice(-MAX_SEEN) : [];
    bot.learning = { ...freshBot(entry).learning, ...(saved.learning || {}) };
    bot.learning.riskMultiplier = clamp(finite(bot.learning.riskMultiplier, 1), 0.5, 1);
    if (!entry.competitionEligible) bot.enabled = false;
  }
  base.updatedAt = raw.updatedAt || base.updatedAt;
  return base;
}

function persist() {
  state.updatedAt = nowISO();
  if (TEST_EPHEMERAL) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) { /* Supabase write-through yine denenir */ }
  try { botPersistence.save('bot-competition', 'registry.json', state); } catch (_) {}
}

function reload() {
  let raw = null;
  try {
    if (TEST_EPHEMERAL) throw new Error('ephemeral test state');
    if (fs.existsSync(REGISTRY_FILE)) raw = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch (_) { raw = null; }
  state = mergeState(raw);
  loaded = true;
  return status();
}
function load() { if (!loaded) reload(); return state; }

function requireEntry(botId, tradingOnly = true) {
  const entry = BY_ID.get(String(botId || ''));
  if (!entry) {
    const error = new Error('Yarış botu bulunamadı.');
    error.code = 'NOT_FOUND';
    throw error;
  }
  if (tradingOnly && !entry.competitionEligible) {
    const error = new Error(`${entry.name} bir işlem stratejisi değildir.`);
    error.code = 'NOT_TRADING';
    throw error;
  }
  return entry;
}

function syntheticRiskPct(entry) {
  if (entry.category === 'BIST') return 5;
  if (entry.category === 'Kripto') return 3;
  if (entry.category === 'Forex' || entry.category === 'MT5') return 0.75;
  if (entry.category === 'Emtia' || entry.category === 'Deneysel') return 1.5;
  return 2;
}

function rawValue(raw, ...keys) {
  for (const key of keys) {
    if (raw && raw[key] != null) return raw[key];
  }
  return null;
}

function normalizeSignal(botId, input, meta = {}) {
  const entryMeta = requireEntry(botId);
  const raw = input?.position || input?.signal || input || {};
  const symbol = cleanSymbol(rawValue(raw, 'instrumentId', 'symbol', 'ticker', 'stockSymbol', 'mt5Symbol') || meta.symbol);
  const timeframe = String(rawValue(raw, 'tf', 'timeframe', 'interval') || meta.timeframe || 'default');
  const strategy = String(rawValue(raw, 'strategy', 'strategyId', 'technique', 'model') || meta.strategy || entryMeta.id);
  const side = normalizeSide(rawValue(raw, 'direction', 'side', 'type', 'verdict', 'signal') || meta.side);
  const entry = firstFinite(rawValue(raw, 'entry', 'entryPrice', 'price', 'close', 'livePrice'), meta.entry);
  if (!symbol || !side || !(entry > 0)) return null;

  let stop = firstFinite(rawValue(raw, 'stop', 'sl', 'stopLoss', 'currentStop', 'originalStop'), meta.stop);
  let target = firstFinite(rawValue(raw, 'target1', 'target', 'tp1', 'takeProfit', 'currentTarget', 'originalTarget'), meta.target);
  const validStop = side === 'long' ? stop > 0 && stop < entry : stop > entry;
  let synthetic = false;
  if (!validStop) {
    const pct = syntheticRiskPct(entryMeta) / 100;
    stop = side === 'long' ? entry * (1 - pct) : entry * (1 + pct);
    synthetic = true;
  }
  const riskDistance = Math.abs(entry - stop);
  const validTarget = side === 'long' ? target > entry : target > 0 && target < entry;
  if (!validTarget) {
    target = side === 'long' ? entry + 2 * riskDistance : entry - 2 * riskDistance;
    synthetic = true;
  }
  const externalId = String(rawValue(raw, 'signalId', 'eventId', 'setupKey', 'code', 'positionId') || meta.externalId || '');
  const sourceObservedAt = rawValue(raw, 'issuedAt', 'generatedAt', 'signalDate', 'candleDate', 'barKey', 'time') || meta.observedAt || '';
  const observedAt = String(sourceObservedAt || nowISO());
  // AŞIRI-İŞLEM KÖK ÇÖZÜMÜ: parmak izi CANLI FİYATA (entry/stop/target) bağlıydı →
  // fiyat her dakika oynadığı için aynı setup her turda YENİ parmak izi alıp tekrar
  // açılıyordu (924 işlem). Artık TF-bazlı ZAMAN KOVASI kullanılır: aynı mum
  // penceresinde aynı setup TEK parmak izi alır → dakikalık çığ biter, yeni pozisyon
  // ancak yeni mumda (setup hâlâ geçerliyse) açılır.
  const bucket = sourceObservedAt
    ? String(sourceObservedAt).slice(0, 16)
    : String(Math.floor(Date.now() / timeframeMs(timeframe)));
  const fingerprintBasis = externalId || [symbol, timeframe, strategy, side, bucket].join('|');
  return {
    botId: entryMeta.id,
    symbol,
    timeframe,
    strategy,
    side,
    entry: round(entry, 8),
    stop: round(stop, 8),
    target: round(target, 8),
    target2: firstFinite(rawValue(raw, 'target2', 'tp2')),
    confidence: firstFinite(rawValue(raw, 'confidence', 'score', 'net', 'avgScore', 'avgVoteScore')),
    externalId,
    observedAt,
    syntheticLevels: synthetic,
    fingerprint: hash(`${entryMeta.id}|${fingerprintBasis}`),
    source: String(meta.source || 'telegram-signal'),
  };
}

function positionKey(signal) {
  return [signal.strategy, signal.symbol, signal.timeframe].map((x) => String(x).toLowerCase()).join('|');
}

function findOpen(bot, raw = {}, meta = {}) {
  const code = String(rawValue(raw, 'signalId', 'eventId', 'setupKey', 'code', 'positionId') || meta.externalId || '');
  const symbol = cleanSymbol(rawValue(raw, 'instrumentId', 'symbol', 'ticker', 'stockSymbol', 'mt5Symbol') || meta.symbol);
  const tf = String(rawValue(raw, 'tf', 'timeframe', 'interval') || meta.timeframe || '');
  const strategy = String(rawValue(raw, 'strategy', 'strategyId', 'technique', 'model') || meta.strategy || '');
  const positions = Object.values(bot.open || {});
  if (code) {
    const exact = positions.find((pos) => pos.externalId === code || pos.fingerprint === code || pos.id === code);
    if (exact) return exact;
  }
  return positions.find((pos) => (!symbol || pos.symbol === symbol)
    && (!tf || pos.timeframe === tf)
    && (!strategy || pos.strategy === strategy)) || null;
}

function tradeMetrics(trades) {
  const rows = Array.isArray(trades) ? trades : [];
  const rs = rows.map((trade) => finite(trade.rMultiple, 0));
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r < 0);
  const grossWin = wins.reduce((sum, r) => sum + r, 0);
  const grossLoss = Math.abs(losses.reduce((sum, r) => sum + r, 0));
  const netR = rs.reduce((sum, r) => sum + r, 0);
  const expectancyR = rs.length ? netR / rs.length : 0;
  let equity = STARTING_EQUITY, peak = STARTING_EQUITY, maxDrawdownPct = 0;
  for (const trade of rows) {
    equity += finite(trade.pnlUsd, 0);
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - equity) / peak) * 100);
  }
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);
  const winRate = rs.length ? (wins.length / rs.length) * 100 : 0;
  const shrink = rs.length / (rs.length + 20);
  const quality = expectancyR * 38 + (Math.min(profitFactor, 3) - 1) * 8
    + (winRate - 50) * 0.12 - maxDrawdownPct * 0.35;
  return {
    closed: rs.length,
    wins: wins.length,
    losses: losses.length,
    win_rate: round(winRate, 2),
    profit_factor: round(profitFactor, 2),
    expectancy_r: round(expectancyR, 3),
    net_r: round(netR, 3),
    normalized_return_pct: round(((equity - STARTING_EQUITY) / STARTING_EQUITY) * 100, 2),
    max_drawdown_pct: round(maxDrawdownPct, 2),
    score: round(quality * shrink, 2),
    sample_stage: stageFor(rs.length),
  };
}

function dayKey(iso) {
  // closedAt ISO → YYYY-MM-DD (kapanış günü). Geçersizse null.
  const m = String(iso || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function dailySeries(trades) {
  // İşlemleri kapanış gününe göre grupla: her gün net R + pnlUsd + adet.
  const byDay = new Map();
  for (const trade of (Array.isArray(trades) ? trades : [])) {
    const key = dayKey(trade.closedAt);
    if (!key) continue;
    if (!byDay.has(key)) byDay.set(key, { day: key, net_r: 0, pnl_usd: 0, trades: 0 });
    const bucket = byDay.get(key);
    bucket.net_r += finite(trade.rMultiple, 0);
    bucket.pnl_usd += finite(trade.pnlUsd, 0);
    bucket.trades += 1;
  }
  return [...byDay.values()]
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .map((day) => ({ ...day, net_r: round(day.net_r, 3), pnl_usd: round(day.pnl_usd, 2) }));
}

// GÜN-BAZLI TUTARLILIK: kullanıcının "kâr/zarar + tutarlılık oranı" isteği.
// Pozitif-gün oranı + günlük getiri Sharpe'ı (mean/std) örnek-shrink ile 0-100.
function consistencyMetrics(trades) {
  const days = dailySeries(trades);
  const n = days.length;
  if (!n) {
    return {
      trading_days: 0, positive_days: 0, positive_day_rate: 0, avg_daily_r: 0,
      daily_r_stddev: 0, daily_sharpe: 0, worst_day_r: 0, best_day_r: 0, consistency_score: 0,
    };
  }
  const rs = days.map((day) => day.net_r);
  const positive = rs.filter((r) => r > 0).length;
  const mean = rs.reduce((sum, r) => sum + r, 0) / n;
  const variance = rs.reduce((sum, r) => sum + (r - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const sharpe = std > 1e-9 ? mean / std : (mean > 0 ? 3 : 0);
  const posRate = positive / n;
  const shrink = n / (n + 10); // az gün → düşük güven
  const raw = posRate * 60 + (clamp(sharpe, 0, 2) / 2) * 40;
  return {
    trading_days: n,
    positive_days: positive,
    positive_day_rate: round(posRate * 100, 1),
    avg_daily_r: round(mean, 3),
    daily_r_stddev: round(std, 3),
    daily_sharpe: round(sharpe, 3),
    worst_day_r: round(Math.min(...rs), 3),
    best_day_r: round(Math.max(...rs), 3),
    consistency_score: round(raw * shrink, 2),
  };
}

// ŞAMPİYON: "en iyi stratejiyi tespit et → yalnız onu geliştir". Yeterli örnekli
// (≥15 kapanış), pozitif beklenti+netR botlar arasında birleşik skoru (kalite %60
// + tutarlılık %40) en yüksek olan. Yoksa null (henüz karar için erken).
function pickChampion(board) {
  const eligible = (board || []).filter((bot) => bot.closed >= 15
    && bot.expectancy_r > 0 && bot.net_r > 0 && bot.sample_stage !== 'collecting');
  if (!eligible.length) return null;
  const ranked = eligible
    .map((bot) => ({ bot, championScore: round(finite(bot.score, 0) * 0.6 + finite(bot.consistency_score, 0) * 0.4, 2) }))
    .sort((a, b) => b.championScore - a.championScore
      || finite(b.bot.consistency_score, 0) - finite(a.bot.consistency_score, 0)
      || b.bot.net_r - a.bot.net_r);
  const top = ranked[0];
  return {
    id: top.bot.id,
    name: top.bot.name,
    champion_score: top.championScore,
    quality_score: top.bot.score,
    consistency_score: top.bot.consistency_score,
    net_r: top.bot.net_r,
    expectancy_r: top.bot.expectancy_r,
    closed: top.bot.closed,
    sample_stage: top.bot.sample_stage,
    rationale: `En yüksek birleşik skor (kalite ${top.bot.score} + tutarlılık ${top.bot.consistency_score}); `
      + `${top.bot.closed} kapanış, beklenti ${top.bot.expectancy_r}R, `
      + `pozitif-gün %${top.bot.positive_day_rate}. Geliştirme önceliği bu stratejide.`,
    contenders: ranked.slice(1, 4).map(({ bot, championScore }) => ({
      id: bot.id, name: bot.name, champion_score: championScore, closed: bot.closed,
    })),
  };
}

function updateLearning(bot) {
  const metrics = tradeMetrics(bot.trades.slice(-30));
  const learning = bot.learning || (bot.learning = freshBot({ id: bot.id, competitionEligible: true }).learning);
  const totalClosed = bot.trades.length;
  const since = totalClosed - finite(learning.lastAdjustedTradeCount, 0);
  if (totalClosed < 15) {
    learning.recommendation = 'En az 15 kapanış bekleniyor; risk değişmedi.';
    learning.riskMultiplier = clamp(finite(learning.riskMultiplier, 1), 0.5, 1);
    return;
  }
  if (since < 5) return;
  let next = clamp(finite(learning.riskMultiplier, 1), 0.5, 1);
  if (metrics.expectancy_r < 0 || metrics.profit_factor < 0.9) {
    next = clamp(next - 0.1, 0.5, 1);
    learning.recommendation = 'Negatif beklenti: yalnız bu sanal botun riski azaltıldı.';
  } else if (totalClosed >= 30 && metrics.expectancy_r >= 0.15 && metrics.profit_factor >= 1.15) {
    next = clamp(next + 0.05, 0.5, 1);
    learning.recommendation = next < 1
      ? 'Sağlamlık toparlandı: risk taban seviyeye doğru kademeli geri alındı.'
      : 'Pozitif ve yeterli örnek; araştırma adayı, otomatik terfi yok.';
  } else {
    learning.recommendation = 'Sonuç karışık; risk ve strateji sabit tutuldu.';
  }
  learning.riskMultiplier = next;
  learning.lastAdjustedAt = nowISO();
  learning.lastAdjustedTradeCount = totalClosed;
}

function recordClose(botId, raw = {}, meta = {}) {
  load();
  requireEntry(botId);
  const bot = state.bots[botId];
  const position = findOpen(bot, raw, meta);
  if (!position) return { ok: false, skipped: 'position-not-found' };
  const suppliedR = firstFinite(rawValue(raw, 'rMultiple', 'r_multiple'));
  let exit = firstFinite(rawValue(raw, 'exit', 'exitPrice', 'price', 'close'), meta.exit);
  if (!(exit > 0) && suppliedR != null) {
    const d = Math.abs(position.entry - position.stop);
    exit = position.side === 'long' ? position.entry + suppliedR * d : position.entry - suppliedR * d;
  }
  if (!(exit > 0)) return { ok: false, skipped: 'invalid-exit' };
  const riskDistance = Math.abs(position.entry - position.stop);
  const grossR = suppliedR != null
    ? suppliedR
    : (position.side === 'long' ? exit - position.entry : position.entry - exit) / riskDistance;
  const costR = ((finite(position.costBps, 0) / 10_000) * position.entry) / riskDistance;
  const rMultiple = clamp(grossR - costR, -5, 10);
  const pnlUsd = round(position.riskUsd * rMultiple, 2);
  bot.equity = round(bot.equity + pnlUsd, 2);
  bot.realizedUsd = round(bot.realizedUsd + pnlUsd, 2);
  bot.peakEquity = Math.max(finite(bot.peakEquity, STARTING_EQUITY), bot.equity);
  if (bot.peakEquity > 0) {
    bot.maxDrawdownPct = Math.max(finite(bot.maxDrawdownPct, 0), ((bot.peakEquity - bot.equity) / bot.peakEquity) * 100);
  }
  const trade = {
    id: hash(`${position.id}|${rawValue(raw, 'closedAt', 'exitTimeSec') || nowISO()}`),
    botId,
    seasonId: state.season.id,
    positionId: position.id,
    externalId: position.externalId,
    symbol: position.symbol,
    strategy: position.strategy,
    timeframe: position.timeframe,
    side: position.side,
    entry: position.entry,
    stop: position.stop,
    target: position.target,
    exit: round(exit, 8),
    rMultiple: round(rMultiple, 3),
    pnlUsd,
    outcome: String(rawValue(raw, 'outcome', 'reason', 'exitReason') || meta.reason || (rMultiple >= 0 ? 'win' : 'loss')),
    syntheticLevels: !!position.syntheticLevels,
    openedAt: position.openedAt,
    closedAt: String(rawValue(raw, 'closedAt', 'exitDate') || meta.closedAt || nowISO()),
  };
  bot.trades.push(trade);
  if (bot.trades.length > MAX_TRADES) bot.trades = bot.trades.slice(-MAX_TRADES);
  delete bot.open[position.key];
  bot.updatedAt = nowISO();
  updateLearning(bot);
  persist();
  return { ok: true, trade };
}

function recordOpen(botId, raw = {}, meta = {}) {
  load();
  const entryMeta = requireEntry(botId);
  const bot = state.bots[botId];
  const signal = normalizeSignal(botId, raw, meta);
  if (!signal) return { ok: false, skipped: 'invalid-signal' };
  if (!state.enabled || !bot.enabled) return { ok: false, skipped: 'competition-disabled' };
  if (entryMeta.engineDisableEnv && process.env[entryMeta.engineDisableEnv] === '1') {
    return { ok: false, skipped: 'engine-disabled' };
  }
  if (bot.seen.includes(signal.fingerprint)) return { ok: false, skipped: 'duplicate' };
  // YASAKLI ENSTRÜMAN (2026-07-24): gümüş/XAGUSD'ye yeni pozisyon açılmaz. Bu kapı
  // TÜM katalog botlarının ortak hunisidir (MT5 ailesi + ICT + forex-signals +
  // mt5-scanner + beast + consensus + evolver) — burada durdurulan sinyal paper
  // pozisyona hiç dönüşmediği için bridgeFeed() de onu göremez, yani gerçek MT5
  // emri kesilir. recordClose() BİLEREK muaf: açık pozisyonlar SL/TP ile kapanabilsin.
  if (instrumentBans.isBanned(signal.symbol)) {
    return { ok: false, skipped: instrumentBans.BAN_REASON };
  }
  // KALİTE KAPISI: düşük güvenli sinyaller (motor tabanı 40 junk) hem paper hem
  // GERÇEK MT5'e gidiyordu → zarar. Güven eşiği altındakini alma (0 = kapalı).
  if (MIN_CONFIDENCE > 0 && signal.confidence != null && signal.confidence < MIN_CONFIDENCE) {
    return { ok: false, skipped: 'low-confidence' };
  }
  // KURUŞ İŞLEM KAPISI (kullanıcı içgörüsü 2026-07-21): "kuruş işlemler daha fazla
  // işlem ücreti ile daha zararlı". Risk-bazlı lotta stop ne kadar darsa lot o kadar
  // büyür → komisyon R cinsinden şişer: costR = (costBps/1e4 × entry) / riskMesafesi.
  // Ampirik: dar-stop yapılandırma -0.034R maliyet, fibo-yapısal -0.019R (yarısı).
  // Maliyet riskin MAX_COST_R'sini aşıyorsa bu kurulum baştan alınmaz.
  if (MAX_COST_R > 0) {
    const riskDist = Math.abs(signal.entry - signal.stop);
    const costR = riskDist > 0 ? ((finite(entryMeta.costBps, 0) / 10_000) * signal.entry) / riskDist : Infinity;
    if (costR > MAX_COST_R) return { ok: false, skipped: 'cost-too-high' };
  }
  const key = positionKey(signal);
  const existing = bot.open[key];
  if (existing) {
    if (existing.side === signal.side) {
      bot.seen.push(signal.fingerprint);
      if (bot.seen.length > MAX_SEEN) bot.seen = bot.seen.slice(-MAX_SEEN);
      persist();
      return { ok: false, skipped: 'already-open', position: existing };
    }
    recordClose(botId, { symbol: existing.symbol, timeframe: existing.timeframe, strategy: existing.strategy, exit: signal.entry, outcome: 'signal_flip' });
  }
  const riskMultiplier = clamp(finite(bot.learning?.riskMultiplier, 1), 0.5, 1);
  const riskUsd = round(bot.equity * (RISK_PCT / 100) * riskMultiplier, 2);
  const position = {
    id: hash(`${state.season.id}|${signal.fingerprint}`),
    key,
    seasonId: state.season.id,
    ...signal,
    riskUsd,
    costBps: finite(entryMeta.costBps, 0),
    openedAt: signal.observedAt || nowISO(),
    lastPrice: signal.entry,
  };
  bot.open[key] = position;
  bot.seen.push(signal.fingerprint);
  if (bot.seen.length > MAX_SEEN) bot.seen = bot.seen.slice(-MAX_SEEN);
  bot.updatedAt = nowISO();
  persist();
  return { ok: true, position };
}

function collectPrices(snapshot) {
  const prices = new Map();
  const add = (row, forcedPrice = null) => {
    if (!row) return;
    const symbol = cleanSymbol(rawValue(row, 'instrumentId', 'symbol', 'ticker', 'stockSymbol', 'mt5Symbol', 'id'));
    const price = forcedPrice != null ? finite(forcedPrice) : firstFinite(rawValue(row, 'livePrice', 'price', 'close', 'entry'));
    if (symbol && price > 0) prices.set(symbol, price);
  };
  const lists = [
    ...(Array.isArray(snapshot) ? [snapshot] : []),
    snapshot?.signals,
    snapshot?.spot_long?.signals,
    snapshot?.futures_long?.signals,
    snapshot?.futures_short?.signals,
    snapshot?.rows,
    snapshot?.all,
    snapshot?.rawRows,
    snapshot?.instruments,
  ];
  for (const list of lists) if (Array.isArray(list)) for (const row of list) add(row);
  if (snapshot?.prices && typeof snapshot.prices === 'object') {
    for (const [symbol, price] of Object.entries(snapshot.prices)) add({ symbol }, price);
  }
  return prices;
}

function markPrices(botId, prices) {
  const bot = state.bots[botId];
  for (const position of [...Object.values(bot.open || {})]) {
    const price = prices.get(position.symbol);
    if (!(price > 0)) continue;
    position.lastPrice = price;
    const hitStop = position.side === 'long' ? price <= position.stop : price >= position.stop;
    const hitTarget = position.side === 'long' ? price >= position.target : price <= position.target;
    if (hitStop) recordClose(botId, { ...position, exit: position.stop, outcome: 'SL' });
    else if (hitTarget) recordClose(botId, { ...position, exit: position.target, outcome: 'TP1' });
  }
}

function genericSignals(snapshot) {
  if (Array.isArray(snapshot)) return snapshot;
  if (!snapshot || typeof snapshot !== 'object') return [];
  const direct = Array.isArray(snapshot.signals) ? snapshot.signals : [];
  const cryptoRows = ['spot_long', 'futures_long', 'futures_short']
    .flatMap((key) => Array.isArray(snapshot[key]?.signals) ? snapshot[key].signals : []);
  const top = direct.length ? [] : (Array.isArray(snapshot.top) ? snapshot.top : []);
  return [...direct, ...cryptoRows, ...top];
}

function specialSignals(botId, snapshot) {
  if (!snapshot || Array.isArray(snapshot)) return [];
  if (botId === 'crossover') {
    const rows = [];
    for (const [strategy, group] of [['tema34', snapshot.tema34], ['ema34', snapshot.ema34]]) {
      for (const row of group?.up || []) rows.push({ ...row, direction: 'long', strategy, candleDate: snapshot.candleDate });
      for (const row of group?.down || []) rows.push({ ...row, direction: 'short', strategy, candleDate: snapshot.candleDate, exitOnly: true });
    }
    return rows;
  }
  if (botId === 'tema34') {
    const groups = snapshot['4h'] || snapshot['1d']
      ? [['4h', snapshot['4h']], ['1d', snapshot['1d']]]
      : [['1d', snapshot.daily || snapshot]];
    return groups.flatMap(([timeframe, group]) => [
      ...(group?.up || []).map((row) => ({ ...row, direction: 'long', strategy: 'tema34', timeframe, candleDate: group.candleDate || group.barTime })),
      ...(group?.down || []).map((row) => ({ ...row, direction: 'short', strategy: 'tema34', timeframe, candleDate: group.candleDate || group.barTime, exitOnly: true })),
    ]);
  }
  if (botId === 'mtf-confluence') {
    const rows = snapshot?.confluence?.all || snapshot?.confluence?.top || snapshot?.all || [];
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

function closeDirectional(botId, raw, meta = {}) {
  const bot = state.bots[botId];
  const symbol = cleanSymbol(rawValue(raw, 'instrumentId', 'symbol', 'ticker', 'stockSymbol', 'id'));
  const strategy = String(rawValue(raw, 'strategy', 'strategyId', 'technique') || meta.strategy || '');
  const timeframe = String(rawValue(raw, 'tf', 'timeframe', 'interval') || meta.timeframe || '');
  const price = firstFinite(rawValue(raw, 'entry', 'price', 'close', 'livePrice'));
  const matches = Object.values(bot.open || {}).filter((pos) => pos.symbol === symbol
    && (!strategy || pos.strategy === strategy)
    && (!timeframe || pos.timeframe === timeframe));
  return matches.map((pos) => recordClose(botId, { ...raw, strategy: pos.strategy, timeframe: pos.timeframe, exit: price || pos.lastPrice || pos.entry, outcome: 'opposite_signal' }));
}

function observeSnapshot(botId, snapshot, meta = {}) {
  load();
  requireEntry(botId);
  const prices = collectPrices(snapshot);
  markPrices(botId, prices);
  const rows = [...genericSignals(snapshot), ...specialSignals(botId, snapshot)];
  const results = [];
  for (const row of rows) {
    const side = normalizeSide(rawValue(row, 'direction', 'side', 'type', 'verdict', 'signal'));
    if (row.exitOnly) {
      results.push(...closeDirectional(botId, row, meta));
      continue;
    }
    if (BY_ID.get(botId)?.longOnly && side === 'short') {
      results.push(...closeDirectional(botId, row, meta));
      continue;
    }
    results.push(recordOpen(botId, row, meta));
  }
  // Bu turda GERÇEKTEN yeni açılan pozisyonlar (dedup/duplicate elenmiş) —
  // bildirimciler bunu kullanır; restart-safe çünkü bot.seen kalıcıdır.
  const openedPositions = results
    .filter((result) => result?.ok && result.position && !result.trade)
    .map((result) => result.position);
  return {
    ok: true,
    observed: rows.length,
    opened: openedPositions.length,
    closed: results.filter((result) => result?.ok && result.trade).length,
    skipped: results.filter((result) => !result?.ok).length,
    openedPositions,
  };
}

function recordClosures(botId, events, meta = {}) {
  load();
  requireEntry(botId);
  const list = Array.isArray(events) ? events : [];
  const results = list.map((event) => recordClose(botId, event, meta));
  return { total: list.length, closed: results.filter((result) => result.ok).length, results };
}

function pairLeaderboard() {
  const groups = new Map();
  for (const entry of catalog.filter((item) => item.competitionEligible)) {
    for (const trade of state.bots[entry.id].trades) {
      const key = `${entry.id}|${trade.symbol}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(trade);
    }
  }
  return [...groups.entries()].map(([key, trades]) => {
    const [botId, symbol] = key.split('|');
    const entry = BY_ID.get(botId);
    return { bot_id: botId, bot_name: entry?.name || botId, symbol, ...tradeMetrics(trades) };
  }).sort((a, b) => b.score - a.score || b.net_r - a.net_r || a.bot_id.localeCompare(b.bot_id));
}

function leaderboard() {
  load();
  const pairs = pairLeaderboard();
  return catalog.filter((entry) => entry.competitionEligible).map((entry) => {
    const bot = state.bots[entry.id];
    const metrics = tradeMetrics(bot.trades);
    const consistency = consistencyMetrics(bot.trades);
    const bestPair = pairs.find((row) => row.bot_id === entry.id) || null;
    return {
      id: entry.id,
      name: entry.name,
      category: entry.category,
      enabled: !!bot.enabled,
      open: Object.keys(bot.open || {}).length,
      equity: round(bot.equity, 2),
      risk_multiplier: round(bot.learning?.riskMultiplier, 2),
      recommendation: bot.learning?.recommendation || '',
      best_pair: bestPair ? { symbol: bestPair.symbol, score: bestPair.score, net_r: bestPair.net_r, closed: bestPair.closed } : null,
      ...metrics,
      ...consistency,
    };
  }).sort((a, b) => b.score - a.score || b.net_r - a.net_r || b.closed - a.closed || a.id.localeCompare(b.id))
    .map((row, index) => ({ rank: index + 1, ...row }));
}

// GÜN-BAZLI lider tablosu: işlem-bazlı skordan farklı olarak günlük tutarlılığa
// göre sıralar (kullanıcının "GÜN bazlı + İŞLEM bazlı lider tablosu" isteği).
function dayLeaderboard(board) {
  return (board || [])
    .filter((row) => row.trading_days > 0)
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      trading_days: row.trading_days,
      positive_days: row.positive_days,
      positive_day_rate: row.positive_day_rate,
      avg_daily_r: row.avg_daily_r,
      daily_sharpe: row.daily_sharpe,
      worst_day_r: row.worst_day_r,
      best_day_r: row.best_day_r,
      consistency_score: row.consistency_score,
    }))
    .sort((a, b) => b.consistency_score - a.consistency_score
      || b.avg_daily_r - a.avg_daily_r || b.trading_days - a.trading_days || a.id.localeCompare(b.id))
    .map((row, index) => ({ day_rank: index + 1, ...row }));
}

function runtimeBlockers() {
  const blockers = [];
  if (process.env.CRON_DISABLED === 'true') blockers.push({ code: 'cron-disabled', message: 'Tüm zamanlanmış taramalar CRON_DISABLED ile kapalı.' });
  if (!state.enabled) blockers.push({ code: 'competition-paused', message: 'Bot yarışı yönetici tarafından duraklatıldı.' });
  return blockers;
}

function status() {
  load();
  const board = leaderboard();
  const pairs = pairLeaderboard();
  const support = catalog.filter((entry) => !entry.competitionEligible).map((entry) => ({
    id: entry.id, name: entry.name, category: entry.category, role: 'support', enabled: false,
    reason: 'Sinyal stratejisi değildir; yarış dışında.',
  }));
  const champion = pickChampion(board);
  const dayBoard = dayLeaderboard(board);
  const bots = catalog.filter((entry) => entry.competitionEligible).map((entry) => {
    const row = board.find((item) => item.id === entry.id);
    const engineDisabled = entry.engineDisableEnv && process.env[entry.engineDisableEnv] === '1';
    return {
      ...row,
      role: 'competitor',
      is_champion: !!champion && champion.id === entry.id,
      runtime_status: engineDisabled ? 'engine-disabled' : (row.enabled && state.enabled ? 'active' : 'paused'),
      blocker: engineDisabled ? 'Motor kill-switch ile kapalı.' : null,
    };
  });
  return {
    ok: true,
    enabled: !!state.enabled,
    execution_scope: state.executionScope,
    season: { ...state.season },
    summary: {
      competitors: bots.length,
      active: bots.filter((bot) => bot.runtime_status === 'active').length,
      open: board.reduce((sum, bot) => sum + bot.open, 0),
      closed: board.reduce((sum, bot) => sum + bot.closed, 0),
      starting_equity: STARTING_EQUITY,
      risk_pct: RISK_PCT,
    },
    blockers: runtimeBlockers(),
    warnings: process.env.FOREX_ONLY_MODE === '1' && state.enabled
      ? [{ code: 'race-feeds-exempt-from-forex-only', message: 'FOREX_ONLY_MODE korunuyor; yalnız aktif yarış botlarının sanal sinyal taramaları muaf.' }]
      : [],
    champion,
    bots,
    support,
    leaderboard: board,
    day_leaderboard: dayBoard,
    pairs,
  };
}

function setMasterEnabled(enabled, updatedBy = 'admin') {
  load();
  if (typeof enabled !== 'boolean') throw new Error('enabled boolean olmalı.');
  state.enabled = enabled;
  state.updatedBy = String(updatedBy || 'admin');
  persist();
  return status();
}

function setBotEnabled(botId, enabled, updatedBy = 'admin') {
  load();
  requireEntry(botId);
  if (typeof enabled !== 'boolean') throw new Error('enabled boolean olmalı.');
  state.bots[botId].enabled = enabled;
  state.bots[botId].updatedBy = String(updatedBy || 'admin');
  state.bots[botId].updatedAt = nowISO();
  persist();
  return status().bots.find((bot) => bot.id === botId);
}

function runtimeEnabled(botId = '') {
  load();
  if (state.enabled !== true) return false;
  if (!botId) return true;
  const entry = BY_ID.get(String(botId));
  if (!entry?.competitionEligible || state.bots[botId]?.enabled !== true) return false;
  return !(entry.engineDisableEnv && process.env[entry.engineDisableEnv] === '1');
}

function resetForTest(nextState = null) {
  state = nextState ? mergeState(nextState) : freshState();
  loaded = true;
  persist();
  return status();
}

// ── BİRLEŞİK KÖPRÜ FEED'İ ────────────────────────────────────────────────────
// borsakrali_mt5_all.py bu ucu çeker: yarışan + PANELDEN AÇIK (enabled) botların
// açık paper pozisyonlarını, her bot AYRI magic ile MT5'te açacak şekilde döndürür.
// competition = beyin (istatistik/şampiyon), köprü = kol (MT5 yürütme). Köprü,
// feed'de görünmeyen (competition kapatmış) kodu MT5'te kapatır (drift-senkron).
// GÜVENLİK: yalnız state.enabled (usta anahtar) + bot.enabled + engine açık botlar.
function bridgeFeed() {
  load();
  if (!state.enabled) return { enabled: false, generatedAt: nowISO(), count: 0, positions: [] };
  const positions = [];
  for (const entry of catalog) {
    if (!entry.competitionEligible) continue;
    // BIST botları MT5/FTMO'da bulunmayan semboller üretir (THYAO vb.) → köprüye
    // gönderme (feed'i şişirip her turda "sembol_yok" olarak boşa dönüyorlardı).
    // Sitede + Telegram BIST kanallarında çalışmaya devam ederler.
    if (entry.mt5Tradeable === false) continue;
    if (entry.engineDisableEnv && process.env[entry.engineDisableEnv] === '1') continue;
    const bot = state.bots[entry.id];
    if (!bot || !bot.enabled) continue;
    for (const pos of Object.values(bot.open || {})) {
      if (!(pos && pos.symbol && (pos.side === 'long' || pos.side === 'short'))) continue;
      if (!(pos.entry > 0) || !(pos.stop > 0)) continue;
      // ÇOK-MOTORLU BOT: bir bot birden çok bağımsız alt motor çalıştırıyorsa
      // (örn. Bot 38 BK XAU = Scalp + Swing) her alt motorun MT5'te AYRI magic'i
      // olmalı. Köprü dedup'ı (magic+sembol+yön) aynı magic'te ikinci pozisyonu
      // "zaten_acik_sembol" ile reddeder → tek magic'te alt motorlardan yalnız
      // biri gerçek emir alırdı. Kaynak MQL5 paketi de iki EA'yı ayrı magic ile
      // ayırmıştır (26072301/26072302).
      const magic = (entry.magicByStrategy && entry.magicByStrategy[pos.strategy])
        || entry.magic || 0;
      positions.push({
        botId: entry.id,
        botName: entry.name,
        magic,
        code: String(pos.id || pos.fingerprint || `${entry.id}:${pos.key}`),
        symbol: String(pos.symbol),
        category: entry.category,
        direction: pos.side,
        entry: round(pos.entry, 8),
        stop: round(pos.stop, 8),
        target1: pos.target > 0 ? round(pos.target, 8) : null,
        target2: pos.target2 > 0 ? round(pos.target2, 8) : null,
        confidence: finite(pos.confidence, null),
        strategy: pos.strategy || entry.id,
        timeframe: pos.timeframe || '',
        openedAt: pos.openedAt,
        longOnly: !!entry.longOnly,
        // LOT TAVANI (2026-07-24): köprü bu alanı okuyup lotu buna kırpar.
        // Konsensüs Radarı (Bot 37) 0.20, diğer TÜM botlar 0.15. Köprü kendi
        // trade_guard.clamp_lot'unda aynı sınırı bağımsız uyguladığı için bu
        // alan kaybolsa/eski köprü okumasa bile tavan yine geçerlidir.
        lotCap: lotLimits.lotCapFor(entry.id),
      });
    }
  }
  return { enabled: true, generatedAt: nowISO(), count: positions.length, positions };
}

// Günlük rapor için: sinceMs'ten beri kapanan işlemlerin bot-bazlı dökümü.
function dailyBreakdown(sinceMs) {
  load();
  const since = Number(sinceMs) || 0;
  const out = [];
  for (const entry of catalog) {
    if (!entry.competitionEligible) continue;
    const bot = state.bots[entry.id];
    const trades = (bot && Array.isArray(bot.trades) ? bot.trades : []).filter((t) => {
      const ts = Date.parse(t.closedAt || '');
      return Number.isFinite(ts) && ts >= since;
    });
    let tp = 0, sl = 0, profit = 0, loss = 0, net = 0;
    for (const t of trades) {
      const oc = String(t.outcome || '').toUpperCase();
      const pnl = finite(t.pnlUsd, 0);
      net += pnl;
      if (pnl > 0) profit += pnl; else if (pnl < 0) loss += pnl;
      const isTp = oc.includes('TP') ? true : oc.includes('SL') ? false : pnl >= 0;
      if (isTp) tp++; else sl++;
    }
    out.push({
      id: entry.id, no: entry.no, name: entry.name, category: entry.category,
      trades: trades.length, tp, sl,
      profit: round(profit, 2), loss: round(loss, 2), net: round(net, 2),
    });
  }
  return out;
}

module.exports = {
  catalog,
  load,
  reload,
  status,
  leaderboard,
  bridgeFeed,
  dailyBreakdown,
  runtimeEnabled,
  setMasterEnabled,
  setBotEnabled,
  observeSnapshot,
  recordOpen,
  recordClose,
  recordClosures,
  resetForTest,
  STARTING_EQUITY,
};
