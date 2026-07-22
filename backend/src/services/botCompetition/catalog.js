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
  // BIST botları: sitede + Telegram BIST kanallarında AYNEN çalışır, ama BIST
  // hisseleri FTMO/MT5'te bulunmadığından köprüye (gerçek emir) GÖNDERİLMEZ.
  { id: 'bist-signals', name: 'BIST Sinyalleri', category: 'BIST', costBps: 18, magic: 5708, mt5Tradeable: false },
  { id: 'crossover', name: 'EMA/TEMA Kesişim', category: 'BIST', costBps: 18, directional: true, longOnly: true, magic: 5709, mt5Tradeable: false },
  { id: 'tema34', name: 'TEMA34 Tarayıcı', category: 'BIST', costBps: 18, directional: true, longOnly: true, magic: 5710, mt5Tradeable: false },
  { id: 'bist-buy-scanner', name: 'BIST AL Tarayıcı', category: 'BIST', costBps: 18, longOnly: true, magic: 5711, mt5Tradeable: false },
  { id: 'wave-scan', name: 'Dalga Tarayıcı', category: 'Tarama', costBps: 5, magic: 5712 },
  { id: 'nr7-shadow', name: 'NR7 Gölge', category: 'Deneysel', costBps: 4, engineDisableEnv: 'NR7_SHADOW_DISABLED', magic: 5713 },
  { id: 'ict-fvg', name: 'ICT / FVG Akışı', category: 'ICT', costBps: 6, engineDisableEnv: 'ICT_FVG_DISABLED', magic: 5714 },
  { id: 'ict-smc', name: 'ICT / SMC Çoklu Strateji', category: 'ICT', costBps: 6, engineDisableEnv: 'ICT_SMC_DISABLED', magic: 5715 },
  // MT5 bot ailesi (services/mt5Bots): YALNIZ FTMO'da işlem gören 15 enstrüman
  // (4 kripto + 2 metal + 2 endeks + 7 parite). Yüksek TF + R:R≥1.5 + kapalı bar.
  { id: 'mt5-trend', name: 'MT5 Trend Takip', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5716 },
  { id: 'mt5-momentum', name: 'MT5 Momentum', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5717 },
  { id: 'mt5-reversion', name: 'MT5 Aşırı Bölge Dönüşü', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5718 },
  { id: 'mt5-cloud', name: 'MT5 Ichimoku Bulut', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5719 },
  // ICT/SMC ailesi (kullanıcının Pine motorunun portu) — her güçlü kurulum AYRI
  // bot olarak MT5 evreninde çalışır; hangisinin gerçekten kazandığı ayrı ölçülür.
  { id: 'ict-2022', name: 'ICT 2022 Modeli', category: 'ICT', costBps: 5, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5730 },
  { id: 'ict-silver-bullet', name: 'ICT Silver Bullet', category: 'ICT', costBps: 5, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5731 },
  { id: 'ict-unicorn', name: 'ICT Unicorn (Breaker+FVG)', category: 'ICT', costBps: 5, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5732 },
  { id: 'ict-ote', name: 'ICT OTE (Optimal Giriş)', category: 'ICT', costBps: 5, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5733 },
  { id: 'ict-cisd', name: 'ICT CISD Dönüşü', category: 'ICT', costBps: 5, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5734 },
  { id: 'ict-sweep', name: 'ICT Likidite Süpürme', category: 'ICT', costBps: 5, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5735 },
  { id: 'ict-blocks', name: 'ICT OB / Breaker Retest', category: 'ICT', costBps: 5, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5736 },
  { id: 'ict-structure', name: 'ICT Yapı (CHoCH/BOS)', category: 'ICT', costBps: 5, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5737 },
  // Birleşik: indikatör oyu + ICT teyidi (en seçici katman)
  { id: 'combo-trend-ict', name: 'Trend + ICT Teyidi', category: 'ICT', costBps: 5, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5738 },
  { id: 'combo-momentum-ict', name: 'Momentum + ICT Teyidi', category: 'ICT', costBps: 5, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5739 },
  // KLASİK STRATEJİ ailesi (services/mt5Bots/strategyEngines): 9-ajanlı derin
  // internet araştırması + sentezle doğrulanmış sistemler. Alligator/Heikin
  // AYRI BOT olarak REDDEDİLDİ (yığılma riski) → evolver havuzunda yaşarlar.
  { id: 'mt5-turtle', name: 'Turtle Kanal Kırılımı', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5740 },
  { id: 'mt5-squeeze', name: 'TTM Squeeze Patlaması', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5741 },
  { id: 'mt5-rsi2', name: 'RSI-2 Geri Dönüşü', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5742 },
  // London: GÖLGE deney — araştırma "spread sonrası kenar ~sıfır" dedi; paper
  // yarışır ama köprüye GİRMEZ. Terfi: ≥60 seans PF≥1.2 → bayrağı kaldır.
  { id: 'mt5-london', name: 'London Breakout (Gölge)', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5743, mt5Tradeable: false },
  { id: 'mt5-tsmom', name: 'Zaman Serisi Momentum', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5744 },
  // Holy Grail: kamu backtest kanıtı YOK → paper'da kendini kanıtlayana kadar
  // (PF≥1.2, ≥50 işlem) köprüye girmez.
  { id: 'mt5-holygrail', name: 'ADX Pullback (Holy Grail)', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5745, mt5Tradeable: false },
  // STRATEJİ GELİŞTİREN bot: walk-forward hücre şampiyonu (kullanıcı isteği);
  // kanıt kapısı motorun kendisinde (PF≥1.25 + ≥6 işlem yoksa hücre susar).
  { id: 'mt5-evolver', name: 'Strateji Evrimi', category: 'MT5', costBps: 4, engineDisableEnv: 'MT5_BOTS_DISABLED', magic: 5748 },
  // KONSENSÜS RADARI (kullanıcı isteği 2026-07-23): N bot aynı sembol+yönde
  // işlemdeyse Telegram'a "AL verdi → alınabilir / SAT verdi → satılabilir"
  // uyarısı atar VE kendisi de o yönde işlem açar (services/botConsensus).
  // Eşik: CONSENSUS_MIN (vars. 3 farklı bot).
  { id: 'consensus-radar', name: 'Konsensüs Radarı', category: 'MT5', costBps: 4, engineDisableEnv: 'CONSENSUS_DISABLED', magic: 5749 },
  { id: 'news-warning', name: 'Haber Uyarıları', category: 'Koruma', role: 'support' },
  { id: 'account-report', name: 'MT5 Kâr/Zarar Raporu', category: 'Rapor', role: 'support' },
];

// Yarışan botlara sıra numarası (Bot 1 … Bot 15). Destek botları numarasız.
let _no = 0;
module.exports = Object.freeze(entries.map((entry) => {
  const eligible = entry.role !== 'support';
  return Object.freeze({
    role: 'competitor',
    ...entry,
    competitionEligible: eligible,
    no: eligible ? ++_no : null,
  });
}));
