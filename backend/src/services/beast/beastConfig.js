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

// Per-TF zero-lag uzunluğu (kısa TF → kısa length). 1h ARTIK KULLANILMIYOR
// (resolveConfig güvenliği için tanımlı kalır).
const TF_ZL = { '1h': 34, '4h': 50, '1d': 60 };

// Çıkış modu: 4h/1d trend koşar → runner (backtest: partial/yakın-TP winner'ı keser, daha kötü).
const MODE_BY_TF = { '1h': 'partial', '4h': 'runner', '1d': 'runner' };

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

// Hangi parite×TF AKTİF — v3: YALNIZ GÜNLÜK (1d), 4 parite. (1h/4h atıldı.)
//   Backtest (1d havuz, runner): %65.2 isabet, PF 2.40, avgR +0.46.
const ENABLED = {
  BTCUSD: ['1d'],
  ETHUSD: ['1d'],
  XAUUSD: ['1d'],
  XAGUSD: ['1d'],
};

// Referans backtest kenarı (canlı güven gösterimi için). Yalnız günlük hücreler.
const EDGE = {
  'BTCUSD:1d': { winRate: 53.3, pf: 1.38, avgR: 0.16 },
  'ETHUSD:1d': { winRate: 73.3, pf: 2.70, avgR: 0.45 },
  'XAUUSD:1d': { winRate: 90.0, pf: 8.95, avgR: 0.80 },
  'XAGUSD:1d': { winRate: 50.0, pf: 1.05, avgR: 0.04 },
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
