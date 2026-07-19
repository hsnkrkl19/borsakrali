/**
 * signalPortfolioBot — "≥75 LONG" (ana kanal + uygulama broadcast) botunun portföy
 * örneği. Aday seçimi bistSignalNotifier'da (güven≥75); portföy defteri + teslimat
 * burada. Broadcast her zaman açık (ana sistem davranışı korunur).
 */
const { createPortfolioBot } = require('./portfolioBot');
const store = require('./bistSignalPortfolioStore');

module.exports = createPortfolioBot({
  key: 'bist-portfolio',
  store,
  dialect: { name: 'BIST LONG (Spot Al)', scoreLabel: 'Guven', deepLink: '/firsatlar?tab=portfoy' },
  channelEnv: 'TELEGRAM_BIST_CHANNEL',
  disabledEnv: 'BIST_SIGNAL_PUSH_DISABLED',
  broadcastEnv: null,           // her zaman broadcast (mevcut ≥75 davranışı)
  competitionKey: 'bist-signals',
});
