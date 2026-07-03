/**
 * forexLearning — forex sinyal sisteminin öğrenen katmanı (enstrüman düzeyi).
 *
 * Kombo = enstrümanId (forex pozisyonları çok-TF birleşik olduğundan TF-düzeyi
 * atıf belirsiz; enstrüman-düzeyi dürüst ölçek). Kapanışlar (TP1/SL/TRAIL)
 * R-katsayısıyla akar (R = fiyat-hareketi / origStopDist — lot'tan bağımsız).
 *
 *   • DEVRE KESİCİ: son 15 kapanışta n>=10, toplam R <= -4, PF < 0.85 → GÖLGE:
 *     enstrümanın YENİ pozisyonları sanal izlenir (Telegram YOK, KÖPRÜ YOK).
 *   • GERİ AÇILMA: gölgede n>=8, +R, PF >= 1.05 → gerçeğe döner.
 *   • Risk çarpanı YOK: lot kararı köprüde (güven → 0.01-0.03); burada kenar
 *     kesme/açma yeterli.
 *
 * Kill: FOREX_LEARNING_DISABLED=1. Kalıcılık: disk (forex disk-only dersi).
 */

const path = require('path');
const { createLearning } = require('../learning/outcomeLearning');

// Varsayılan: open-signals dosyasıyla aynı dizin (testler FOREX_OPEN_FILE'ı
// tmp'e yönlendirince öğrenme durumu da otomatik oraya gider)
const baseDir = process.env.FOREX_OPEN_FILE
  ? path.dirname(process.env.FOREX_OPEN_FILE)
  : path.join(__dirname, '..', '..', 'data');
const FILE = process.env.FOREX_LEARNING_FILE || path.join(baseDir, 'forex-learning.json');

module.exports = createLearning({
  name: 'forex',
  file: FILE,
  disabledEnv: 'FOREX_LEARNING_DISABLED',
  rules: {
    roll: 40,
    disableWindow: 15, disableMinN: 10, disableSumR: -4, disablePf: 0.85,
    enableMinN: 8, enablePf: 1.05,
    multEnabled: false,
  },
});
