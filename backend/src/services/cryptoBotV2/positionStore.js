/**
 * Position Store — Kripto Bot (long + short)
 *
 * BIST botuyla aynı `createPositionStore` fabrikasını kullanır; tek fark veri
 * dizini (data/crypto-bot) ve sermaye birimi/başlangıcı: 10.000 USD.
 * Kripto fiyatları USD bazlı olduğu için portföy de USD tutulur.
 */

const createPositionStore = require('../tradingBotV2/createPositionStore');

module.exports = createPositionStore({
  subdir: 'crypto-bot',
  initialCapital: 10000,
  currency: 'USD',
});
