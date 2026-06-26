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

// ⚠️ v2 (2026-06-26) — kullanıcı geri bildirimi: "tutarsız sinyaller, isabet düşük".
// KÖK NEDEN: (1) gürültülü 1h hücreleri düşük isabet + çoklu-TF çelişkisi yarattı
// (1h long + 1d short = "tutarsız"); (2) tracker state cold-start'ta sıfırlanınca aynı
// sinyaller tekrar push edildi. FIX: 1h TAMAMEN ATILDI → yalnız 4h+1d (4h zaten 1d
// trendiyle kapılı → çelişki yok). Bu TEK BAŞINA isabeti ~%54→%58'e çıkardı.
const TUNED = {
  zlMult: 1.0,
  minScore: 4,
  minStopATR: 2.0, maxStopATR: 3.0,   // ATR-stop bandı (araştırma: ~2.0 tatlı nokta)
  rr1: 1.5, rr2: 3.0,                 // TP1 1.5R (BE+trail başlar), ana hedef TP2 3R
  trailATR: 2.0,                      // chandelier iz-süren
  adxMin: 0, adxDiGate: false,        // ADX kapısı KAPALI
};

// Hangi parite×TF AKTİF — YALNIZ 4h + 1d (1h atıldı). 4 parite de korunur.
//   Backtest (4h+1d havuz, runner): IN %59.7 PF1.75, OOS %57.7 PF1.69, avgR +0.29.
const ENABLED = {
  BTCUSD: ['4h', '1d'],
  ETHUSD: ['4h', '1d'],
  XAUUSD: ['4h', '1d'],
  XAGUSD: ['4h', '1d'],
};

// Referans backtest kenarı (canlı güven gösterimi için; motor periyodik tazeler).
// rr1=1.5 rr2=3.0 runner, 4h+1d. Günlük (1d) hücreler en yüksek isabetli.
const EDGE = {
  'BTCUSD:4h': { winRate: 50.0, pf: 1.10, avgR: 0.05 },
  'BTCUSD:1d': { winRate: 53.3, pf: 1.38, avgR: 0.16 },
  'ETHUSD:4h': { winRate: 60.0, pf: 1.45, avgR: 0.17 },
  'ETHUSD:1d': { winRate: 73.3, pf: 2.70, avgR: 0.45 },
  'XAUUSD:4h': { winRate: 50.0, pf: 1.30, avgR: 0.10 },
  'XAUUSD:1d': { winRate: 90.0, pf: 8.95, avgR: 0.80 },
  'XAGUSD:4h': { winRate: 54.5, pf: 1.10, avgR: 0.05 },
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
