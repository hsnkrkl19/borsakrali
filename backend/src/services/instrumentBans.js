'use strict';

/**
 * YASAKLI ENSTRÜMANLAR — tek kaynak (2026-07-24, kullanıcı talebi).
 *
 * Kullanıcı: "gümüş paritesine işlem açmayı yasakla tüm botlara. XAGUSD işlemleri yasak."
 *
 * ⚠️ YASAK YALNIZ **YENİ POZİSYON AÇMAYI** KAPSAR. Açık pozisyonların
 * değerlendirilmesi, trail'lenmesi ve SL/TP ile KAPANMASI serbesttir — aksi hâlde
 * canlı MT5'te açık duran gümüş pozisyonları yetim kalır (çıkış motoru
 * `getInstrument(id)` null dönünce erken return eder, pozisyon asla kapanmaz).
 * Bu yüzden yasak enstrüman evreninden SİLİNEREK değil, giriş kapılarında
 * REDDEDİLEREK uygulanır.
 *
 * Sembol yazımları sistem genelinde tek biçimli değil — aynı metal şu adlarla dolaşır:
 *   XAGUSD (competition/id) · XAG/USD (forex symbol) · SI=F (Yahoo) · SILVER +
 *   XAGUSD. (FTMO broker alias'ları) · OANDA:XAGUSD (TradingView) · SILVER_USD /
 *   SILVER_TRY / XAGTRY (emtia SNR haritası) · XAGUSDm/.raw/.ecn (broker sonekleri)
 * Bu yüzden karşılaştırma normalize edilmiş biçim üzerinden ÖN EK bazlı yapılır.
 *
 * YANLIŞ POZİTİF TUZAKLARI (bilerek dışarıda bırakıldı):
 *   - BIST hissesi `SILVR` (Silverline Endüstri) — gümüş emtiası değil.
 *   - `ict-silver-bullet` stratejisi — ICT "Silver Bullet" killzone modeli,
 *     enstrümanla ilgisi yok (XAUUSD dahil her paritede çalışır).
 * Bu yüzden serbest "silver" substring eşlemesi KULLANILMAZ.
 *
 * Kill switch: INSTRUMENT_BANS_DISABLED=1 (yasağı tamamen kaldırır)
 * Genişletme:  BANNED_INSTRUMENTS='XAGUSD,USDJPY' (virgüllü, normalize edilir)
 */

// Yasağın kanonik gövdesi — normalize edilmiş biçimde ÖN EK olarak aranır.
const BANNED_PREFIXES = ['XAG', 'SILVER'];
// Tam eşleşme gereken semboller (ön ek kuralına girmeyenler).
const BANNED_EXACT = new Set(['SIF']); // Yahoo 'SI=F' → 'SIF'

/**
 * Sembolü karşılaştırılabilir biçime indirger:
 *   'XAG/USD' → 'XAGUSD' · 'SI=F' → 'SIF' · 'OANDA:XAGUSD' → 'XAGUSD'
 *   'XAGUSD.' → 'XAGUSD' · 'silver_usd' → 'SILVERUSD'
 */
function normalizeSymbol(raw) {
  let s = String(raw == null ? '' : raw).toUpperCase().trim();
  // Borsa/broker ön eki: 'OANDA:XAGUSD', 'CME_MINI:NQ1!' → gövdeyi al
  const colon = s.lastIndexOf(':');
  if (colon >= 0) s = s.slice(colon + 1);
  return s.replace(/[^A-Z0-9]/g, '');
}

function envList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((x) => normalizeSymbol(x))
    .filter(Boolean);
}

function disabled() {
  return process.env.INSTRUMENT_BANS_DISABLED === '1';
}

/**
 * Bu sembol/enstrüman kimliğine YENİ POZİSYON açmak yasak mı?
 * Her yazım biçimini kabul eder (id, symbol, yahoo, broker sembolü, tvSymbol).
 */
function isBanned(symbol) {
  if (disabled()) return false;
  const n = normalizeSymbol(symbol);
  if (!n) return false;
  if (BANNED_EXACT.has(n)) return true;
  if (BANNED_PREFIXES.some((p) => n.startsWith(p))) return true;
  return envList('BANNED_INSTRUMENTS').some((b) => n === b || n.startsWith(b));
}

/**
 * Bir enstrüman kaydının HERHANGİ bir yazımı yasaklıysa true.
 * (id 'XAGUSD' silinse bile yahoo 'SI=F' üzerinden sızmayı önler.)
 */
function isBannedInstrument(inst) {
  if (!inst) return false;
  if (typeof inst === 'string') return isBanned(inst);
  return ['id', 'symbol', 'yahoo', 'dataSymbol', 'mt5Symbol', 'instrumentId', 'tvSymbol']
    .some((k) => inst[k] && isBanned(inst[k]));
}

/** Enstrüman dizisinden yasaklıları düşürür (evren süzgeci). */
function filterInstruments(list) {
  return (Array.isArray(list) ? list : []).filter((i) => !isBannedInstrument(i));
}

/** Sembol dizisinden (string id'ler) yasaklıları düşürür. */
function filterSymbols(list) {
  return (Array.isArray(list) ? list : []).filter((s) => !isBanned(s));
}

/** Reddetme sebebi — log/skipped alanlarında tek biçimli kullanılsın diye. */
const BAN_REASON = 'instrument-banned';

module.exports = {
  isBanned,
  isBannedInstrument,
  filterInstruments,
  filterSymbols,
  normalizeSymbol,
  BAN_REASON,
};
