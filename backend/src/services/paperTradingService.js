/**
 * Paper Trading Service — Borsa Krali (Faz 18)
 *
 * Dummy portfolio simulation: kullanıcı MTF sinyallerini "kağıt üzerinde"
 * test eder. Gerçek para riski yok. Açık pozisyonlar canlı fiyatla mark-to-
 * market hesaplanır.
 *
 * Public API:
 *   - openPosition(userId, signal)          paper pozisyon aç
 *   - closePosition(userId, posId)          manuel kapat (mevcut fiyatla)
 *   - getPortfolio(userId)                  açık pozisyonlar + geçmiş + PnL
 *   - tickAll()                             tüm pozisyonlar için stop/target kontrol
 *   - getLeaderboard(limit)                 toplam PnL sıralı
 *
 * Persistence: data/paper-trading/<userId>.json (disk-only, in-memory cache).
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '..', 'data', 'paper-trading');
// Binance prod ortamında (Render ABD IP) HTTP 451 veriyor → Bybit v5 public
const BYBIT_BASE = 'https://api.bybit.com';

const STARTING_BALANCE = 10000;  // $10,000 default başlangıç (USD)
const PER_POSITION_USD = 1000;   // Her pozisyon $1,000 fixed (margin/spot ortak)

// In-memory cache: userId → portfolio
const cache = new Map();
// Symbol price cache (kısa süreli, 30sn)
const priceCache = new Map();
const PRICE_TTL_MS = 30 * 1000;

function ensureDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    // Render ephemeral disk olabilir, EACCES vs. — sessiz geç, in-memory devam
    logger.warn(`[PaperTrading] ensureDir başarısız: ${e.message}`);
  }
}

function filePath(userId) {
  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `${safeId}.json`);
}

function defaultPortfolio() {
  return {
    balance: STARTING_BALANCE,
    cash: STARTING_BALANCE,
    positions: [],   // açık pozisyonlar
    history: [],     // kapanmış pozisyonlar
    totalPnl: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function load(userId) {
  if (cache.has(userId)) return cache.get(userId);
  ensureDir();
  const fp = filePath(userId);
  if (fs.existsSync(fp)) {
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
      cache.set(userId, data);
      return data;
    } catch (e) {
      logger.warn(`[PaperTrading] Bozuk dosya ${userId}: ${e.message}`);
    }
  }
  const p = defaultPortfolio();
  cache.set(userId, p);
  return p;
}

function save(userId) {
  const p = cache.get(userId);
  if (!p) return;
  p.updatedAt = new Date().toISOString();
  try {
    ensureDir();
    fs.writeFileSync(filePath(userId), JSON.stringify(p, null, 2), 'utf8');
  } catch (e) {
    // Disk yazma başarısızsa in-memory durum korunur, sessiz geç
    logger.warn(`[PaperTrading] save hata ${userId}: ${e.message}`);
  }
}

// Bybit current price (cache'li)
async function getCurrentPrice(symbol) {
  const now = Date.now();
  const cached = priceCache.get(symbol);
  if (cached && now - cached.t < PRICE_TTL_MS) return cached.p;
  try {
    const r = await axios.get(`${BYBIT_BASE}/v5/market/tickers`, {
      params: { category: 'spot', symbol: `${symbol}USDT` },
      timeout: 8000,
    });
    const p = parseFloat(r.data?.result?.list?.[0]?.lastPrice);
    if (isFinite(p)) {
      priceCache.set(symbol, { p, t: now });
      return p;
    }
  } catch (e) {
    // sessiz
  }
  return null;
}

// Pozisyon aç
async function openPosition(userId, signal) {
  if (!signal?.symbol || !signal?.entry || !signal?.stop || !signal?.target1) {
    return { success: false, error: 'Geçersiz sinyal (entry/stop/target1 zorunlu)' };
  }
  const portfolio = load(userId);
  if (portfolio.cash < PER_POSITION_USD) {
    return { success: false, error: `Yetersiz bakiye ($${portfolio.cash.toFixed(2)} / gerekli $${PER_POSITION_USD})` };
  }

  // Mevcut fiyatla open (entry yerine market price)
  const marketPrice = await getCurrentPrice(signal.symbol) || signal.entry;
  const direction = signal.direction || 'long';
  const positionSize = PER_POSITION_USD / marketPrice;
  const leverage = signal.leverage_suggest || 1;

  const position = {
    id: `${signal.symbol}_${Date.now()}`,
    userId,
    symbol: signal.symbol,
    direction,
    timeframe: signal.timeframe,
    openedAt: new Date().toISOString(),
    entry: marketPrice,
    stop: signal.stop,
    target1: signal.target1,
    target2: signal.target2,
    size: +positionSize.toFixed(8),
    notional: PER_POSITION_USD,
    leverage,
    score: signal.totalScore,
    grade: signal.grade,
    winProbability: signal.winProbability?.probability,
    status: 'open',
  };

  portfolio.positions.push(position);
  portfolio.cash -= PER_POSITION_USD;
  save(userId);

  return { success: true, position };
}

// Mevcut fiyatla pozisyon mark-to-market (PnL hesabı)
function calcUnrealizedPnl(pos, currentPrice) {
  if (!currentPrice) return { pnl: 0, pnlPct: 0 };
  const isLong = pos.direction === 'long';
  const diff = isLong ? (currentPrice - pos.entry) : (pos.entry - currentPrice);
  const pnlPct = (diff / pos.entry) * 100 * (pos.leverage || 1);
  const pnl = (pos.notional * pnlPct) / 100;
  return { pnl: +pnl.toFixed(2), pnlPct: +pnlPct.toFixed(2) };
}

// Pozisyon kapat (manuel veya stop/target tetiklemeli)
async function closePositionWithPrice(userId, posId, exitPrice, exitReason) {
  const portfolio = load(userId);
  const idx = portfolio.positions.findIndex(p => p.id === posId);
  if (idx === -1) return { success: false, error: 'Pozisyon bulunamadı' };

  const pos = portfolio.positions[idx];
  const isLong = pos.direction === 'long';
  const diff = isLong ? (exitPrice - pos.entry) : (pos.entry - exitPrice);
  const pnlPct = (diff / pos.entry) * 100 * (pos.leverage || 1);
  const pnl = +((pos.notional * pnlPct) / 100).toFixed(2);

  const closed = {
    ...pos,
    closedAt: new Date().toISOString(),
    exitPrice,
    exitReason,
    pnl,
    pnlPct: +pnlPct.toFixed(2),
    status: exitReason,
  };

  portfolio.positions.splice(idx, 1);
  portfolio.history.unshift(closed);
  if (portfolio.history.length > 500) portfolio.history = portfolio.history.slice(0, 500);
  portfolio.cash += PER_POSITION_USD + pnl;
  portfolio.totalPnl = +(portfolio.totalPnl + pnl).toFixed(2);
  portfolio.totalTrades += 1;
  if (pnl > 0) portfolio.wins += 1;
  else if (pnl < 0) portfolio.losses += 1;
  save(userId);

  return { success: true, position: closed };
}

async function closePosition(userId, posId) {
  const portfolio = load(userId);
  const pos = portfolio.positions.find(p => p.id === posId);
  if (!pos) return { success: false, error: 'Pozisyon bulunamadı' };
  const price = await getCurrentPrice(pos.symbol);
  if (!price) return { success: false, error: 'Mevcut fiyat alınamadı' };
  return closePositionWithPrice(userId, posId, price, 'manual_close');
}

// Tüm açık pozisyonları kontrol et — stop/target tetikleme
async function tickAll() {
  const allUsers = listUsers();
  let opened = 0, closed = 0;
  for (const userId of allUsers) {
    const p = load(userId);
    for (const pos of [...p.positions]) {
      const price = await getCurrentPrice(pos.symbol);
      if (!price) continue;
      const isLong = pos.direction === 'long';
      const stopHit = isLong ? price <= pos.stop : price >= pos.stop;
      const targetHit = isLong ? price >= pos.target1 : price <= pos.target1;
      if (stopHit) {
        await closePositionWithPrice(userId, pos.id, pos.stop, 'hit_stop');
        closed++;
      } else if (targetHit) {
        await closePositionWithPrice(userId, pos.id, pos.target1, 'hit_target');
        closed++;
      }
    }
  }
  return { opened, closed, users: allUsers.length };
}

function listUsers() {
  ensureDir();
  return fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.slice(0, -5));
}

// Portfolio'yu mark-to-market ile döndür
async function getPortfolio(userId) {
  const p = load(userId);
  const enriched = await Promise.all(
    p.positions.map(async pos => {
      const price = await getCurrentPrice(pos.symbol);
      const mtm = calcUnrealizedPnl(pos, price);
      return { ...pos, currentPrice: price, unrealizedPnl: mtm.pnl, unrealizedPnlPct: mtm.pnlPct };
    })
  );
  const totalUnrealized = enriched.reduce((s, x) => s + (x.unrealizedPnl || 0), 0);
  const totalEquity = +(p.cash + enriched.reduce((s, x) => s + x.notional + (x.unrealizedPnl || 0), 0)).toFixed(2);
  return {
    ...p,
    positions: enriched,
    totalUnrealized: +totalUnrealized.toFixed(2),
    totalEquity,
    winRate: p.totalTrades > 0 ? +(p.wins / p.totalTrades * 100).toFixed(1) : 0,
  };
}

// Leaderboard — toplam PnL sırası
async function getLeaderboard(limit = 10) {
  const users = listUsers();
  const rows = users.map(uid => {
    const p = load(uid);
    return {
      userId: uid,
      totalPnl: p.totalPnl,
      totalTrades: p.totalTrades,
      wins: p.wins,
      losses: p.losses,
      winRate: p.totalTrades > 0 ? +(p.wins / p.totalTrades * 100).toFixed(1) : 0,
    };
  });
  rows.sort((a, b) => b.totalPnl - a.totalPnl);
  return rows.slice(0, limit);
}

function reset(userId) {
  const p = defaultPortfolio();
  cache.set(userId, p);
  save(userId);
  return p;
}

module.exports = {
  openPosition,
  closePosition,
  getPortfolio,
  tickAll,
  getLeaderboard,
  reset,
  load,
  STARTING_BALANCE,
  PER_POSITION_USD,
};
