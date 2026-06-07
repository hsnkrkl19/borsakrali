/**
 * Position Store — Trading Bot v6 (BIST)
 *
 * Disk üzerinde JSON dosyalarla sanal portföyü, açık/pending pozisyonları,
 * kapalı işlemleri ve append-only sinyal logunu yönetir.
 *
 * Tüm mantık `createPositionStore` fabrikasında (kripto botuyla paylaşılır);
 * burada sadece BIST için örneklenir: data/bot dizini, 100.000 TL başlangıç.
 * Public API birebir korunur — botEngine.js bu modülü olduğu gibi kullanır.
 */

const createPositionStore = require('./createPositionStore');

module.exports = createPositionStore({
  subdir: 'bot',
  initialCapital: 100000,
  currency: 'TRY',
});
