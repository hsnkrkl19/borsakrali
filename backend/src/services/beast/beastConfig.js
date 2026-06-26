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

// Per-TF zero-lag uzunluğu (kısa TF → kısa length).
const TF_ZL = { '1h': 34, '4h': 50, '8h': 55, '1d': 60 };

// Çıkış modu: trend koşar → runner; 1h gürültülü → partial (kâr-kilit).
const MODE_BY_TF = { '1h': 'partial', '4h': 'runner', '8h': 'runner', '1d': 'runner' };

// ⚠️ v3 (2026-06-26) — kullanıcı "isabet düşük" → İSABET ÖNCELİĞİ seçildi:
// YALNIZ GÜNLÜK (1d) sinyaller. Backtest (4 parite 1d havuz): %65.2 isabet, PF 2.40,
// avgR +0.46 (4h+1d'nin %58.7/1.69'una karşı). Az sinyal (~2/ay) ama yüksek isabet.
// v2 mirası: 1h çoklu-TF çelişkisi + cold-start re-push düzeltildi (yön kilidi + load()).
const TUNED = {
  zlMult: 1.0,
  minScore: 4,
  minStopATR: 2.0, maxStopATR: 3.0,   // ATR-stop bandı (araştırma: ~2.0 tatlı nokta)
  rr1: 1.5, rr2: 3.0,                 // TP1 1.5R (BE+trail başlar), ana hedef TP2 3R
  trailATR: 2.0,                      // chandelier iz-süren
  adxMin: 0, adxDiGate: false,        // ADX kapısı KAPALI
};

// Hangi parite×TF AKTİF — v4 (kullanıcı: 1h/4h/8h ekle). Her parite için YALNIZ
// backtest'te POZİTİF olan TF'ler açık (zarar eden hücre push edilmez). Bulgu:
//   KRİPTO (BTC/ETH) → ALT TF iyi (1h), 8h zarar; METAL (XAU/XAG) → ÜST TF iyi (4h/8h/1d), 1h zarar.
// Derin veri backtest (runner; 1h partial). Kapalı kalanlar: BTC 4h/8h, ETH 8h, XAU 1h, XAG 1h.
const ENABLED = {
  BTCUSD: ['1h', '1d'],
  ETHUSD: ['1h', '4h', '1d'],
  XAUUSD: ['4h', '8h', '1d'],
  XAGUSD: ['4h', '8h', '1d'],
};

// Referans backtest kenarı (canlı güven gösterimi için).
const EDGE = {
  'BTCUSD:1h': { winRate: 54.3, pf: 1.36, avgR: 0.17 },
  'BTCUSD:1d': { winRate: 46.2, pf: 0.99, avgR: 0.00 },
  'ETHUSD:1h': { winRate: 46.2, pf: 1.25, avgR: 0.13 },
  'ETHUSD:4h': { winRate: 64.7, pf: 2.60, avgR: 0.48 },
  'ETHUSD:1d': { winRate: 73.3, pf: 3.27, avgR: 0.61 },
  'XAUUSD:4h': { winRate: 54.5, pf: 1.98, avgR: 0.37 },
  'XAUUSD:8h': { winRate: 58.3, pf: 1.56, avgR: 0.18 },
  'XAUUSD:1d': { winRate: 90.0, pf: 13.38, avgR: 1.24 },
  'XAGUSD:4h': { winRate: 63.6, pf: 1.24, avgR: 0.09 },
  'XAGUSD:8h': { winRate: 75.0, pf: 3.51, avgR: 0.60 },
  'XAGUSD:1d': { winRate: 50.0, pf: 1.04, avgR: 0.02 },
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
