'use strict';

// Telegram tarafında sinyal üreten stratejiler yarışmacıdır. Haber ve hesap
// raporu ise koruma/raporlama servisidir; işlem açmaları özellikle yasaktır.
// magic: birleşik köprünün (borsakrali_mt5_all.py) her botu MT5'te AYRI kimlikle
// açması için sabit sihirli numara. Böylece her bot ayrı ayrı işlem alır ve
// istatistikleri birbirine karışmaz. Support botlarının magic'i yoktur.
const entries = [
  { id: 'forex-signals', name: 'Forex Sinyalleri', category: 'Forex', costBps: 3, magic: 5701 },
  { id: 'pro-robot', name: 'Pro Robot', category: 'Forex', costBps: 3, magic: 5702 },
  { id: 'gold-signals', name: 'Altın Sinyalleri', category: 'Emtia', costBps: 4, magic: 5703 },
  { id: 'beast-signals', name: 'Beast Trend', category: 'Deneysel', costBps: 4, magic: 5704 },
  { id: 'mt5-scanner', name: 'MT5 Gün İçi Tarayıcı', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_SCANNER_DISABLED', magic: 5705 },
  { id: 'crypto-signals', name: 'Kripto Sinyalleri', category: 'Kripto', costBps: 10, magic: 5706 },
  { id: 'mtf-confluence', name: 'MTF Konfluans', category: 'Kripto', costBps: 10, directional: true, magic: 5707 },
  { id: 'bist-signals', name: 'BIST Sinyalleri', category: 'BIST', costBps: 18, magic: 5708 },
  { id: 'crossover', name: 'EMA/TEMA Kesişim', category: 'BIST', costBps: 18, directional: true, longOnly: true, magic: 5709 },
  { id: 'tema34', name: 'TEMA34 Tarayıcı', category: 'BIST', costBps: 18, directional: true, longOnly: true, magic: 5710 },
  { id: 'bist-buy-scanner', name: 'BIST AL Tarayıcı', category: 'BIST', costBps: 18, longOnly: true, magic: 5711 },
  { id: 'wave-scan', name: 'Dalga Tarayıcı', category: 'Tarama', costBps: 5, magic: 5712 },
  { id: 'nr7-shadow', name: 'NR7 Gölge', category: 'Deneysel', costBps: 4, engineDisableEnv: 'NR7_SHADOW_DISABLED', magic: 5713 },
  { id: 'ict-fvg', name: 'ICT / FVG Akışı', category: 'ICT', costBps: 6, engineDisableEnv: 'ICT_FVG_DISABLED', magic: 5714 },
  { id: 'ict-smc', name: 'ICT / SMC Çoklu Strateji', category: 'ICT', costBps: 6, engineDisableEnv: 'ICT_SMC_DISABLED', magic: 5715 },
  { id: 'news-warning', name: 'Haber Uyarıları', category: 'Koruma', role: 'support' },
  { id: 'account-report', name: 'MT5 Kâr/Zarar Raporu', category: 'Rapor', role: 'support' },
];

module.exports = Object.freeze(entries.map((entry) => Object.freeze({
  role: 'competitor',
  ...entry,
  competitionEligible: entry.role !== 'support',
})));
