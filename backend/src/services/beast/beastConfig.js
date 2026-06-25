/**
 * beastConfig — BEAST Trend tuned parametreleri (TEK kaynak: canlı motor + backtest).
 *
 * Bu değerler DERİN backtest ile seçildi (4 parite × 3 TF havuzu, 70/30 zaman bölmesi):
 *   - In-sample : 136 işlem, %50.7 isabet, PF 1.34, avgR +0.156
 *   - Out-sample: 65 işlem,  %53.8 isabet, PF 1.86, avgR +0.354  (OOS in-sample'ı YENDİ → overfit değil)
 *   - vs-random : giriş kenarı +0.229 R/işlem (4965 rastgele işleme karşı)
 *
 * Araştırma uyumu: ADX kapısı KAPALI (kripto/altın expectancy'sini düşürür), 2:1 R/R,
 * 3-4 konfluans, MTF üst-TF kapısı (×4-6), trend-DEVAMI girişler (oversold sıçraması değil),
 * 1h'te partial (gürültü) / 4h-1d'de runner (trend koşar).
 */

'use strict';

// Per-TF zero-lag uzunluğu (kısa TF → kısa length)
const TF_ZL = { '1h': 34, '4h': 50, '1d': 60 };

// Çıkış modu: 1h gürültülü → partial (TP1'de %50 kilit); 4h/1d trend koşar → runner
const MODE_BY_TF = { '1h': 'partial', '4h': 'runner', '1d': 'runner' };

// Havuzlu sweep + OOS kazananı (tüm pariteler için robust global set)
const TUNED = {
  zlMult: 1.0,
  minScore: 4,
  minStopATR: 2.0, maxStopATR: 3.0,   // ATR-stop bandı (araştırma: ~2.0 tatlı nokta)
  rr1: 2.0, rr2: 4.0,                 // 2:1 ve 4:1 hedefler
  trailATR: 2.0,                      // chandelier iz-süren
  adxMin: 0, adxDiGate: false,        // ADX kapısı KAPALI
};

// Hangi parite×TF AKTİF (negatif-expectancy hücreler kapalı):
//   XAU 1h — gün-içi altın gürültüsü (PF 0.85) ; XAG 1d — az veri + negatif (PF 0.90)
const ENABLED = {
  BTCUSD: ['1h', '4h', '1d'],
  ETHUSD: ['1h', '4h', '1d'],
  XAUUSD: ['4h', '1d'],
  XAGUSD: ['1h', '4h'],
};

// Referans backtest kenarı (canlı güven gösterimi için; motor periyodik tazeler).
const EDGE = {
  'BTCUSD:1h': { winRate: 46.2, pf: 1.43, avgR: 0.224 },
  'BTCUSD:4h': { winRate: 50.0, pf: 1.32, avgR: 0.159 },
  'BTCUSD:1d': { winRate: 53.3, pf: 1.38, avgR: 0.159 },
  'ETHUSD:1h': { winRate: 46.2, pf: 1.53, avgR: 0.247 },
  'ETHUSD:4h': { winRate: 61.5, pf: 1.43, avgR: 0.167 },
  'ETHUSD:1d': { winRate: 70.6, pf: 2.58, avgR: 0.464 },
  'XAUUSD:4h': { winRate: 50.0, pf: 1.64, avgR: 0.244 },
  'XAUUSD:1d': { winRate: 90.0, pf: 13.55, avgR: 1.256 },
  'XAGUSD:1h': { winRate: 36.4, pf: 1.22, avgR: 0.114 },
  'XAGUSD:4h': { winRate: 63.6, pf: 1.43, avgR: 0.157 },
};

// Bir (enstrüman, TF) için tam çalışma config'i.
function resolveConfig(inst, tf) {
  return Object.assign({}, inst.cfg, TUNED, {
    zlLength: TF_ZL[tf] || 50,
    partialMode: MODE_BY_TF[tf] || 'runner',
  });
}

function isEnabled(id, tf) { return (ENABLED[id] || []).includes(tf); }
function edgeFor(id, tf) { return EDGE[`${id}:${tf}`] || null; }

module.exports = { TF_ZL, MODE_BY_TF, TUNED, ENABLED, EDGE, resolveConfig, isEnabled, edgeFor };
