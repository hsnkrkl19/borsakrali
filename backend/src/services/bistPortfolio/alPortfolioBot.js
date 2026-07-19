/**
 * alPortfolioBot — "kaliteli AL" (@borsasinyal34) botunun portföy örneği.
 * Aday seçimi bistAlScannerNotifier'da (avgScore≥80 + ADX/RSI/EMA34/hacim/likidite);
 * portföy defteri + AL/SAT/STOP/TP + günlük özet teslimatı burada (paylaşımlı bot).
 */
const { createPortfolioBot } = require('./portfolioBot');
const store = require('./bistAlPortfolioStore');

module.exports = createPortfolioBot({
  key: 'bist-al-portfolio',
  store,
  dialect: { name: 'BIST AL', scoreLabel: 'Guc', deepLink: '/firsatlar?tab=portfoy' },
  channelEnv: 'TELEGRAM_BIST_AL_CHANNEL',
  disabledEnv: 'BIST_AL_SCANNER_DISABLED',
  broadcastEnv: 'BIST_AL_BROADCAST_DISABLED',   // varsayılan AÇIK; =1 ile kısılır
  competitionKey: 'bist-buy-scanner',
});
