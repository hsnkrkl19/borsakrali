/**
 * altinLearning — 🥇 ALTIN botunun öğrenen katmanı (TF düzeyi).
 *
 * Kombo = TF ('1d','8h','4h','1h','15m','5m','1m'). Tek enstrüman (XAUUSD) ve
 * tracker zaten TF başına TEK pozisyon tutar (AU-<TF>-NNN, stats byTf) → atıf
 * belirsizliği yok, TF dürüst ölçek. Kapanışlar R-katsayısıyla akar (tracker
 * evalOne zaten hesaplar: R = hareket / |entry - initialStop|; mesafe yoksa null
 * → istatistiğe girmez, pnlPct'ten türetme YAPILMAZ).
 *
 *   • DEVRE KESİCİ: son 15 kapanışta n>=10, toplam R <= -4, PF < 0.85 → GÖLGE:
 *     o TF'in YENİ pozisyonları sanal izlenir (Telegram YOK, halka açık
 *     istatistik kirlenmez). Mevcut açık pozisyonlar ETKİLENMEZ.
 *   • GERİ AÇILMA: gölgede n>=8, +R, PF >= 1.05 → gerçeğe döner.
 *   • Risk çarpanı YOK (sanal portföy; kenar kesme/açma yeterli).
 *
 * Kill: ALTIN_LEARNING_DISABLED=1 (istatistik birikir, eylem durur).
 * Kalıcılık: disk + botPersistence 'altin/learning.json' (SUBDIRS/FILES
 * whitelist'inde hazır — deploy'lar arası korunur).
 */

const path = require('path');
const { createLearning } = require('../learning/outcomeLearning');

let botPersistence = null;
try { botPersistence = require('../botPersistence'); } catch (_) {}

const SUBDIR = 'altin';
// Varsayılan: botPersistence geri-yükleme yolu (data/altin/learning.json) —
// loadAll() boot'ta tam bu dosyaya restore eder. Testler ALTIN_OPEN_FILE'ı
// tmp'e yönlendirince öğrenme durumu da otomatik aynı dizine gider.
const FILE = process.env.ALTIN_LEARNING_FILE
  || (process.env.ALTIN_OPEN_FILE
    ? path.join(path.dirname(process.env.ALTIN_OPEN_FILE), 'altin-learning.json')
    : path.join(process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data'), SUBDIR, 'learning.json'));

module.exports = createLearning({
  name: 'altin',
  file: FILE,
  disabledEnv: 'ALTIN_LEARNING_DISABLED',
  rules: {
    roll: 40,
    disableWindow: 15, disableMinN: 10, disableSumR: -4, disablePf: 0.85,
    enableMinN: 8, enablePf: 1.05,
    multEnabled: false,
  },
  persist: (state) => {
    try { if (botPersistence && typeof botPersistence.save === 'function') botPersistence.save(SUBDIR, 'learning.json', state); } catch (_) {}
  },
});
