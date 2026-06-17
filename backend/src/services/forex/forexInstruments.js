/**
 * Forex / Parite Enstrümanları — Borsa Krali
 *
 * Kullanıcının "tamamen forex fiyatları" istediği 10 enstrüman. Hepsi Yahoo
 * Finance chart endpoint'inden USD bazlı, sürekli (forex/CFD benzeri) fiyatla
 * çekilir. Yahoo sembol seçimleri canlı 1m/5m veri testiyle doğrulandı:
 *
 *   - Spot forex pariteleri  → `XXXYYY=X`  (EURUSD=X)
 *   - Altın/Gümüş            → vadeli `GC=F` / `SI=F`  (XAUUSD=X / XAGUSD=X
 *                              Yahoo'da 404; vadeli ~7/24 ve spot'a çok yakın)
 *   - Endeksler (Nasdaq/SP)  → vadeli `NQ=F` / `ES=F`  (^NDX / ^GSPC yalnız
 *                              ABD seans saatinde güncellenir → forex CFD gibi
 *                              sürekli fiyat için E-mini vadelileri kullanılır)
 *   - Kripto                 → `{SYM}-USD`  (BTC/ETH/XRP/SOL/DOGE, 7/24)
 *
 * contractSize = 1 standart lot kaç birim taban varlık içerir (lot hesabı için).
 * Broker'a göre değişebilir; piyasa standardı / yaygın CFD değerleri alındı.
 */

const INSTRUMENTS = [
  // ── Kripto (top 5, 7/24) ────────────────────────────────────────────────
  { id: 'BTCUSD',  name: 'Bitcoin',      symbol: 'BTC/USD',  yahoo: 'BTC-USD',  class: 'crypto', contractSize: 1,      unitLabel: 'coin',    precision: 2, tvSymbol: 'BINANCE:BTCUSDT', alwaysOpen: true },
  { id: 'ETHUSD',  name: 'Ethereum',     symbol: 'ETH/USD',  yahoo: 'ETH-USD',  class: 'crypto', contractSize: 1,      unitLabel: 'coin',    precision: 2, tvSymbol: 'BINANCE:ETHUSDT', alwaysOpen: true },
  { id: 'XRPUSD',  name: 'XRP',          symbol: 'XRP/USD',  yahoo: 'XRP-USD',  class: 'crypto', contractSize: 1,      unitLabel: 'coin',    precision: 4, tvSymbol: 'BINANCE:XRPUSDT', alwaysOpen: true },
  { id: 'SOLUSD',  name: 'Solana',       symbol: 'SOL/USD',  yahoo: 'SOL-USD',  class: 'crypto', contractSize: 1,      unitLabel: 'coin',    precision: 3, tvSymbol: 'BINANCE:SOLUSDT', alwaysOpen: true },
  { id: 'DOGEUSD', name: 'Dogecoin',     symbol: 'DOGE/USD', yahoo: 'DOGE-USD', class: 'crypto', contractSize: 1,      unitLabel: 'coin',    precision: 5, tvSymbol: 'BINANCE:DOGEUSDT', alwaysOpen: true },

  // ── Emtia (USD ons, vadeli ~7/24) ───────────────────────────────────────
  { id: 'XAUUSD',  name: 'Altın',        symbol: 'XAU/USD',  yahoo: 'GC=F',     class: 'metal',  contractSize: 100,    unitLabel: 'ons',     precision: 2, tvSymbol: 'OANDA:XAUUSD',   alwaysOpen: false },
  { id: 'XAGUSD',  name: 'Gümüş',        symbol: 'XAG/USD',  yahoo: 'SI=F',     class: 'metal',  contractSize: 5000,   unitLabel: 'ons',     precision: 3, tvSymbol: 'OANDA:XAGUSD',   alwaysOpen: false },

  // ── Forex paritesi ──────────────────────────────────────────────────────
  { id: 'EURUSD',  name: 'Euro / Dolar', symbol: 'EUR/USD',  yahoo: 'EURUSD=X', class: 'fx',     contractSize: 100000, unitLabel: 'birim',   precision: 5, tvSymbol: 'FX:EURUSD',      alwaysOpen: false },

  // ── Endeksler (forex CFD karşılığı, E-mini vadeli ~7/24) ────────────────
  { id: 'NAS100',  name: 'Nasdaq 100',   symbol: 'US100',    yahoo: 'NQ=F',     class: 'index',  contractSize: 1,      unitLabel: 'kontrat', precision: 2, tvSymbol: 'CME_MINI:NQ1!',  alwaysOpen: false },
  { id: 'SPX500',  name: 'S&P 500',      symbol: 'US500',    yahoo: 'ES=F',     class: 'index',  contractSize: 1,      unitLabel: 'kontrat', precision: 2, tvSymbol: 'CME_MINI:ES1!',  alwaysOpen: false },
];

const BY_ID = new Map(INSTRUMENTS.map(i => [i.id, i]));

function getInstrument(id) {
  return BY_ID.get((id || '').toUpperCase()) || null;
}

function listInstruments() {
  return INSTRUMENTS.map(i => ({ ...i }));
}

module.exports = { INSTRUMENTS, getInstrument, listInstruments };
