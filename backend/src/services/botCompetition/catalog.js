'use strict';

// Telegram tarafında sinyal üreten stratejiler yarışmacıdır. Haber ve hesap
// raporu ise koruma/raporlama servisidir; işlem açmaları özellikle yasaktır.
const entries = [
  { id: 'forex-signals', name: 'Forex Sinyalleri', category: 'Forex', costBps: 3 },
  { id: 'pro-robot', name: 'Pro Robot', category: 'Forex', costBps: 3 },
  { id: 'gold-signals', name: 'Altın Sinyalleri', category: 'Emtia', costBps: 4 },
  { id: 'beast-signals', name: 'Beast Trend', category: 'Deneysel', costBps: 4 },
  { id: 'mt5-scanner', name: 'MT5 Gün İçi Tarayıcı', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_SCANNER_DISABLED' },
  { id: 'crypto-signals', name: 'Kripto Sinyalleri', category: 'Kripto', costBps: 10 },
  { id: 'mtf-confluence', name: 'MTF Konfluans', category: 'Kripto', costBps: 10, directional: true },
  { id: 'bist-signals', name: 'BIST Sinyalleri', category: 'BIST', costBps: 18 },
  { id: 'crossover', name: 'EMA/TEMA Kesişim', category: 'BIST', costBps: 18, directional: true, longOnly: true },
  { id: 'tema34', name: 'TEMA34 Tarayıcı', category: 'BIST', costBps: 18, directional: true, longOnly: true },
  { id: 'bist-buy-scanner', name: 'BIST AL Tarayıcı', category: 'BIST', costBps: 18, longOnly: true },
  { id: 'wave-scan', name: 'Dalga Tarayıcı', category: 'Tarama', costBps: 5 },
  { id: 'nr7-shadow', name: 'NR7 Gölge', category: 'Deneysel', costBps: 4, engineDisableEnv: 'NR7_SHADOW_DISABLED' },
  { id: 'ict-fvg', name: 'ICT / FVG Akışı', category: 'ICT', costBps: 6, engineDisableEnv: 'ICT_FVG_DISABLED' },
  { id: 'news-warning', name: 'Haber Uyarıları', category: 'Koruma', role: 'support' },
  { id: 'account-report', name: 'MT5 Kâr/Zarar Raporu', category: 'Rapor', role: 'support' },
];

module.exports = Object.freeze(entries.map((entry) => Object.freeze({
  role: 'competitor',
  ...entry,
  competitionEligible: entry.role !== 'support',
})));
