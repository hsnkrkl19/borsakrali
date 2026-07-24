'use strict';

/**
 * YASAKLI ENSTRÜMAN TAHLİYESİ — açılışta bir kez çalışır (2026-07-24).
 *
 * Kullanıcı kararı: "yasaktan önce açılmış 6 gümüş pozisyonunu HEMEN KAPAT."
 * (instrumentBans yalnız YENİ girişi engeller; zaten açık olanlar kendi
 * SL/TP'lerini bekliyordu.)
 *
 * NASIL KAPANIR — iki aşamalı, kasıtlı:
 *   1. Burada kâğıt pozisyon kapatılır (competitionManager.recordClose) →
 *      pozisyon bridgeFeed'den DÜŞER.
 *   2. VPS'teki köprü kodu feed'de bulamayınca `close_on_feed_drift` ile
 *      GERÇEK MT5 pozisyonunu piyasa emriyle kapatır (drift_confirm_turns=3 +
 *      min_hold_minutes=20 → pratikte ~20-25 dk içinde).
 * Yani backend'den MT5'e doğrudan emir gönderilmez; mevcut, test edilmiş
 * kapatma yolu kullanılır.
 *
 * ÇIKIŞ FİYATI yalnız KÂĞIT defteri (lider tablosu) içindir; gerçek K/Z
 * MT5'in kapanış fiyatından doğar ve realResults üzerinden ayrıca gelir.
 * Öncelik: köprünün bildirdiği canlı broker fiyatı → pozisyonun son işaretli
 * fiyatı → giriş fiyatı (0R).
 *
 * Bu modül tek seferliktir ama İDEMPOTENT: kapatacak pozisyon kalmayınca
 * hiçbir şey yapmaz, her açılışta güvenle çağrılabilir.
 *
 * Kill: BANNED_SWEEP_DISABLED=1
 */

const instrumentBans = require('./instrumentBans');
const logger = require('../utils/logger');
// ⚠️ ÜST SEVİYEDE require: fonksiyon içinde lazy require edilirse, modül kaydı
// sıfırlanmış bir bağlamda (testlerde jest.resetModules) BAŞKA bir
// competitionManager örneği çözülür ve tahliye boş bir deftere bakar.
// Döngüsel bağımlılık yok: competitionManager bu modülü tanımıyor.
const manager = require('./botCompetition/competitionManager');

const MAX_PER_BOT = 50;   // sonsuz döngü emniyeti

function disabled() { return process.env.BANNED_SWEEP_DISABLED === '1'; }

/** Köprünün POST ettiği canlı broker fiyatı (yoksa null). */
function brokerPriceFor(instrumentId) {
  try {
    const row = require('./forex/brokerPrices').get(instrumentId);
    const mid = row && (row.mid || ((row.bid + row.ask) / 2));
    return Number.isFinite(mid) && mid > 0 ? mid : null;
  } catch (_) { return null; }
}

/**
 * Yarışma defterindeki yasaklı pozisyonları kapatır.
 * bridgeFeed() kullanılır çünkü GERÇEK MT5 karşılığı OLAN pozisyon kümesi
 * tam olarak odur (competitionEligible + mt5Tradeable + bot açık).
 */
function sweepCompetition() {
  const closed = [];
  let feed;
  try { feed = manager.bridgeFeed(); } catch (e) {
    logger.warn(`[BanSweep] bridgeFeed okunamadı: ${e.message}`);
    return closed;
  }
  if (!feed || !feed.enabled) return closed;

  const banned = (feed.positions || []).filter((p) => instrumentBans.isBanned(p.symbol));
  for (const p of banned.slice(0, MAX_PER_BOT * 40)) {
    const exit = brokerPriceFor(p.symbol) || p.entry;
    try {
      const r = manager.recordClose(p.botId, {
        positionId: p.code,
        symbol: p.symbol,
        timeframe: p.timeframe,
        exit,
        outcome: 'instrument-banned',
      });
      if (r && r.ok) closed.push({ botId: p.botId, symbol: p.symbol, tf: p.timeframe, exit });
      else logger.warn(`[BanSweep] ${p.botId} ${p.symbol}: kapatılamadı (${r && r.skipped})`);
    } catch (e) {
      logger.warn(`[BanSweep] ${p.botId} ${p.symbol}: hata — ${e.message}`);
    }
  }
  return closed;
}

/**
 * İKİNCİ GEÇİŞ — bridgeFeed'in GÖRMEDİĞİ pozisyonlar için.
 *
 * bridgeFeed() yalnız competitionEligible + mt5Tradeable !== false + AÇIK botları
 * yayınlar. Bir bot panelden kapatılmışsa ya da katalogda köprüye kapalıysa
 * (mt5Tradeable:false) yasaklı pozisyonu ilk geçişte görünmez. Burada katalog
 * baştan sona gezilir ve recordClose "position-not-found" diyene kadar tekrarlanır.
 *
 * Çıkış fiyatı: canlı broker fiyatı yoksa rMultiple=0 (başabaş) ile kapatılır —
 * kâğıt defteri şişirmemek için ihtiyatlı taraf. Gerçek K/Z zaten MT5'in kapanış
 * fiyatından realResults üzerinden gelir.
 */
function sweepCatalog(alreadyClosed) {
  const seen = new Set(alreadyClosed.map((c) => `${c.botId}|${c.symbol}`));
  const closed = [];
  const price = brokerPriceFor('XAGUSD');
  for (const entry of manager.catalog) {
    if (!entry.competitionEligible) continue;
    for (let i = 0; i < MAX_PER_BOT; i++) {
      let r;
      try {
        r = manager.recordClose(entry.id, {
          symbol: 'XAGUSD',
          ...(price ? { exit: price } : { rMultiple: 0 }),
          outcome: 'instrument-banned',
        });
      } catch (e) {
        logger.warn(`[BanSweep] ${entry.id} katalog geçişi hata — ${e.message}`);
        break;
      }
      if (!r || !r.ok) break;
      if (!seen.has(`${entry.id}|XAGUSD`)) closed.push({ botId: entry.id, symbol: 'XAGUSD', tf: null, exit: price });
    }
  }
  return closed;
}

/**
 * Açılışta bir kez. botPersistence.loadAll() + competitionManager.reload()
 * SONRASINDA çağrılmalı — yoksa boş state'i tarar ve hiçbir şey bulamaz.
 */
function run() {
  if (disabled()) return { disabled: true, closed: [] };
  const closed = sweepCompetition();
  closed.push(...sweepCatalog(closed));
  if (closed.length) {
    const özet = closed.map((c) => `${c.botId}:${c.symbol}${c.tf ? `/${c.tf}` : ''}`).join(', ');
    logger.info(`[BanSweep] ⛔ ${closed.length} yasaklı pozisyon kâğıtta kapatıldı → köprü MT5'te kapatacak (${özet})`);
  }
  return { disabled: false, closed };
}

module.exports = { run, sweepCompetition, sweepCatalog };
