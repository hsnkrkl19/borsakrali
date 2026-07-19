/**
 * bistAlPortfolioStore — "kaliteli AL" (@borsasinyal34) botunun sanal portföyü.
 * createPositionStore fabrikası (nakit/özsermaye/gerçekleşen K/Z/equityHistory)
 * → Supabase 'bot-state'/'bist-al-portfolio/*' + disk (botPersistence, kanıtlanmış
 * kalıcılık yolu). Subdir botPersistence.SUBDIRS'e eklenmiştir.
 */
const createPositionStore = require('../tradingBotV2/createPositionStore');

const CAPITAL = (() => { const v = Number(process.env.BIST_PORTFOLIO_CAPITAL); return Number.isFinite(v) && v > 0 ? v : 100000; })();

module.exports = createPositionStore({ subdir: 'bist-al-portfolio', initialCapital: CAPITAL, currency: 'TRY' });
