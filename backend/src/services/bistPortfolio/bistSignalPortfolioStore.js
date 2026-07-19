/**
 * bistSignalPortfolioStore — "≥75 LONG" (ana kanal + uygulama broadcast) botunun
 * sanal portföyü. createPositionStore fabrikası → Supabase 'bot-state'/
 * 'bist-portfolio/*' + disk (botPersistence). Subdir botPersistence.SUBDIRS'de.
 */
const createPositionStore = require('../tradingBotV2/createPositionStore');

const CAPITAL = (() => { const v = Number(process.env.BIST_PORTFOLIO_CAPITAL); return Number.isFinite(v) && v > 0 ? v : 100000; })();

module.exports = createPositionStore({ subdir: 'bist-portfolio', initialCapital: CAPITAL, currency: 'TRY' });
