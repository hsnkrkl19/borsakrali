/**
 * Backtest — Bellek-içi pozisyon deposu
 *
 * `createPositionStore` ile AYNI arayüzü uygular, ama diske/Supabase'e hiç
 * dokunmaz; her şey RAM'de yaşar ve simülasyon bitince atılır. Amaç: canlı
 * `customBotEngine.openPosition` / `closePosition` para matematiğini HİÇ
 * DEĞİŞTİRMEDEN backtest'te de çalıştırmak → "backtest = canlı bot, geçmişe
 * sarılmış" garantisi. (Aynı yaklaşım customBots golden testindeki sahte store.)
 *
 * Canlı store'dan farklar (kasıtlı):
 *   - recordEquityPoint no-op'tur; equity eğrisini backtest motoru kendi
 *     simüle-bar tarihiyle tutar (canlı store "bugün" anahtarı kullanır).
 *   - patchTradeById: kapanan işlemin tarih/tutuş alanlarını simüle-bar
 *     değerlerine düzeltmek için (closePosition gerçek `new Date()` yazar).
 */

function createInMemoryStore(initialCapital = 100000, currency = 'TRY') {
  let pf = {
    currency,
    capital: initialCapital,
    cash: initialCapital,
    equity: initialCapital,
    totalRealizedPnL: 0,
    totalRealizedPnLPct: 0,
    openCount: 0,
    winCount: 0,
    lossCount: 0,
    winRate: 0,
    tradingEnabled: true,
    equityHistory: [],
  };
  let positions = [];
  let trades = [];
  let idc = 0;
  const newId = () => 'bt' + (++idc).toString(36);

  return {
    // ── Portföy ──
    getPortfolio: () => pf,
    savePortfolio: (p) => { pf = p; return p; },
    setTradingEnabled: () => ({ tradingEnabled: pf.tradingEnabled }),
    recordEquityPoint: () => {},        // backtest motoru kendi tutar — no-op

    // ── Pozisyonlar ──
    listPositions: () => positions,
    listOpen: () => positions.filter(p => p.status === 'open'),
    listPending: () => positions.filter(p => p.status === 'pending'),
    findById: (id) => positions.find(p => p.id === id) || null,
    findBySymbol: (sym, statuses = ['open', 'pending']) =>
      positions.find(p => p.symbol === sym && statuses.includes(p.status)) || null,
    addPosition: (pos) => {
      const entry = { id: pos.id || newId(), ...pos };
      positions.push(entry);
      return entry;
    },
    updatePosition: (id, patch) => {
      const i = positions.findIndex(p => p.id === id);
      if (i < 0) return null;
      positions[i] = { ...positions[i], ...patch };
      return positions[i];
    },
    appendNote: (id, action, text) => {
      const p = positions.find(p => p.id === id);
      if (p) { p.notes = Array.isArray(p.notes) ? p.notes : []; p.notes.push({ action, text }); }
      return p || null;
    },
    removePosition: (id) => { positions = positions.filter(p => p.id !== id); },

    // ── İşlemler (append-only) ──
    appendTrade: (t) => { const e = { ...t }; trades.push(e); return e; },
    // Canlı store en yeniyi başa koyup ters çevirir; backtest metrikleri için
    // kronolojik (eskiden yeniye) ham listeyi de açıyoruz.
    listTrades: (limit = 100) => trades.slice(-limit).reverse(),
    listTradesChrono: () => trades.slice(),
    patchTradeById: (id, patch) => {
      const i = trades.findIndex(t => t.id === id);
      if (i < 0) return null;
      trades[i] = { ...trades[i], ...patch };
      return trades[i];
    },
  };
}

module.exports = { createInMemoryStore };
