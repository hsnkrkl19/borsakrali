/**
 * YENİ ROBOT — Derin Konfluans Sinyal Sistemi · Enstrümanlar
 *
 * Eski forex motoruyla PARALEL, BAĞIMSIZ bir sistem. Yalnız 4 enstrüman:
 *   BTC, Ons Altın, S&P 500 (kullanıcı "nas500"), EUR/USD.
 *
 * Sinyal NO ön ekleri "Y" (=YENİ) ile başlar → eski forex (BT/AU/SP...) ile
 * GÖRSEL OLARAK ASLA çakışmaz. Telegram mesajları "🤖 YENİ ROBOT" başlıklı.
 *
 * Semboller eski forex testiyle doğrulanmış Yahoo karşılıkları:
 *   - Altın → vadeli GC=F (XAUUSD=X Yahoo'da 404)
 *   - S&P   → E-mini vadeli ES=F
 *   - BTC   → BTC-USD (7/24)
 *   - EURUSD→ EURUSD=X (spot forex)
 * contractSize = 1 standart lot kaç birim taban varlık (lot/risk hesabı için).
 */

const INSTRUMENTS = [
  { id: 'BTCUSD', name: 'Bitcoin',  symbol: 'BTC/USD', yahoo: 'BTC-USD',   class: 'crypto', contractSize: 1,      unitLabel: 'coin',    precision: 2, tvSymbol: 'BINANCE:BTCUSDT', alwaysOpen: true,  prefix: 'YB' },
  { id: 'XAUUSD', name: 'Ons Altın', symbol: 'XAU/USD', yahoo: 'GC=F',     class: 'metal',  contractSize: 100,    unitLabel: 'ons',     precision: 2, tvSymbol: 'OANDA:XAUUSD',    alwaysOpen: false, prefix: 'YA' },
  { id: 'SPX500', name: 'S&P 500',  symbol: 'US500',   yahoo: 'ES=F',     class: 'index',  contractSize: 1,      unitLabel: 'kontrat', precision: 2, tvSymbol: 'CME_MINI:ES1!',  alwaysOpen: false, prefix: 'YS' },
  { id: 'EURUSD', name: 'EUR/USD',  symbol: 'EUR/USD', yahoo: 'EURUSD=X', class: 'fx',     contractSize: 100000, unitLabel: 'lot',     precision: 5, tvSymbol: 'OANDA:EURUSD',    alwaysOpen: false, prefix: 'YE' },
];

const BY_ID = new Map(INSTRUMENTS.map(i => [i.id, i]));

function getInstrument(id) {
  return BY_ID.get((id || '').toUpperCase()) || null;
}

function listInstruments() {
  return INSTRUMENTS.map(i => ({ ...i }));
}

module.exports = { INSTRUMENTS, getInstrument, listInstruments };
