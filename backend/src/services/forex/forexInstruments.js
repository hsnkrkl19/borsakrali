/**
 * Forex / Parite Enstrümanları — Borsa Krali
 *
 * USD bazlı, sürekli (forex/CFD benzeri) Yahoo fiyatları. Sembol seçimleri
 * canlı veri testiyle doğrulandı:
 *   - Altın/Gümüş → vadeli GC=F / SI=F  (XAUUSD=X / XAGUSD=X Yahoo'da 404)
 *   - Endeksler   → E-mini vadeli NQ=F / ES=F  (^NDX/^GSPC yalnız ABD seansı)
 *   - Kripto      → {SYM}-USD (7/24)
 *
 * 2026-06-18: EUR/USD (tutarlı kenar yok) ve DOGE (kenar yok — denetim) ÇIKARILDI.
 * `priority`: kullanıcı önceliği (BTC, endeksler, altın) — daha dikkatli analiz.
 * `prefix`: parite-başına sinyal NO ön eki (2 harf): BT01, AU01 ... (3 haneye çıkabilir)
 * contractSize = 1 standart lot kaç birim taban varlık (lot/risk hesabı için).
 */

const INSTRUMENTS = [
  // ── Kripto (7/24) ─────────────────────────────────────────────────────────
  { id: 'BTCUSD', name: 'Bitcoin',  symbol: 'BTC/USD', yahoo: 'BTC-USD', class: 'crypto', contractSize: 1,    unitLabel: 'coin', precision: 2, tvSymbol: 'BINANCE:BTCUSDT', alwaysOpen: true,  prefix: 'BT', priority: true  },
  { id: 'ETHUSD', name: 'Ethereum', symbol: 'ETH/USD', yahoo: 'ETH-USD', class: 'crypto', contractSize: 1,    unitLabel: 'coin', precision: 2, tvSymbol: 'BINANCE:ETHUSDT', alwaysOpen: true,  prefix: 'ET', priority: false },
  { id: 'XRPUSD', name: 'XRP',      symbol: 'XRP/USD', yahoo: 'XRP-USD', class: 'crypto', contractSize: 1,    unitLabel: 'coin', precision: 4, tvSymbol: 'BINANCE:XRPUSDT', alwaysOpen: true,  prefix: 'XR', priority: false },
  { id: 'SOLUSD', name: 'Solana',   symbol: 'SOL/USD', yahoo: 'SOL-USD', class: 'crypto', contractSize: 1,    unitLabel: 'coin', precision: 3, tvSymbol: 'BINANCE:SOLUSDT', alwaysOpen: true,  prefix: 'SO', priority: false },

  // ── Emtia (USD ons, vadeli ~7/24) ───────────────────────────────────────
  { id: 'XAUUSD', name: 'Altın',    symbol: 'XAU/USD', yahoo: 'GC=F',    class: 'metal',  contractSize: 100,  unitLabel: 'ons',  precision: 2, tvSymbol: 'OANDA:XAUUSD',    alwaysOpen: false, prefix: 'AU', priority: true  },
  { id: 'XAGUSD', name: 'Gümüş',    symbol: 'XAG/USD', yahoo: 'SI=F',    class: 'metal',  contractSize: 5000, unitLabel: 'ons',  precision: 3, tvSymbol: 'OANDA:XAGUSD',    alwaysOpen: false, prefix: 'AG', priority: false },

  // ── Endeksler (E-mini vadeli ~7/24) ─────────────────────────────────────
  { id: 'NAS100', name: 'Nasdaq 100', symbol: 'US100', yahoo: 'NQ=F',   class: 'index',  contractSize: 1,    unitLabel: 'kontrat', precision: 2, tvSymbol: 'CME_MINI:NQ1!', alwaysOpen: false, prefix: 'NQ', priority: true },
  { id: 'SPX500', name: 'S&P 500',    symbol: 'US500', yahoo: 'ES=F',   class: 'index',  contractSize: 1,    unitLabel: 'kontrat', precision: 2, tvSymbol: 'CME_MINI:ES1!', alwaysOpen: false, prefix: 'SP', priority: true },
];

const BY_ID = new Map(INSTRUMENTS.map(i => [i.id, i]));

function getInstrument(id) {
  return BY_ID.get((id || '').toUpperCase()) || null;
}

function listInstruments() {
  return INSTRUMENTS.map(i => ({ ...i }));
}

module.exports = { INSTRUMENTS, getInstrument, listInstruments };
