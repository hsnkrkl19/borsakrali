/**
 * proLearning — 🤖 YENİ ROBOT'un öğrenen katmanı (enstrüman:TF düzeyi).
 *
 * Kombo = "enstrümanId:TF" (BTC/Altın/S&P500/EURUSD × 15m/1h/4h/1d). YENİ ROBOT
 * pozisyonları çok-TF birleşik olsa da (≥3/4 konfluans), pozisyonun GİRİŞ/STOP/
 * hedef seviyeleri en yüksek güvenli sinyalin ("basis") TF'inden kurulur; R
 * ölçümü de bu seviyelere göredir → atıf o TF'e (pos.learnTf = basis.tf) DÜRÜST.
 * Kapanışlar R-katsayısıyla akar (R = fiyat-hareketi / origStopDist — lot'tan
 * bağımsız; iz-sürmüş değil ORİJİNAL stop mesafesi baz alınır).
 *
 *   • DEVRE KESİCİ: gerçek modda son 15 kapanışta n>=10, toplam R <= -4,
 *     PF < 0.85 → kombo GÖLGE: o (enstrüman:TF)'in YENİ pozisyonları sanal
 *     izlenir (Telegram YOK, halka açık istatistik kirlenmez). Mevcut açık
 *     pozisyonlar ETKİLENMEZ (kapılar yalnız yeni pozisyona uygulanır).
 *   • GERİ AÇILMA: gölgede n>=8, +R, PF >= 1.05 → gerçeğe döner (taze pencere).
 *   • Risk çarpanı YOK (multEnabled=false): kenar kesme/açma yeterli; lot kararı
 *     YENİ ROBOT'ta konfluans güvenine göre motor tarafında verilir.
 *
 * Kill: PRO_LEARNING_DISABLED=1 (istatistik birikir, eylem durur).
 * Kalıcılık: disk + botPersistence 'pro-signals/learning.json' (SUBDIRS/FILES
 * whitelist'inde hazır — deploy'lar arası korunur; loadAll boot'ta restore eder).
 */

const path = require('path');
const { createLearning } = require('../learning/outcomeLearning');

let botPersistence = null;
try { botPersistence = require('../botPersistence'); } catch (_) {}

const SUBDIR = 'pro-signals';
// Varsayılan: botPersistence geri-yükleme yolu (data/pro-signals/learning.json) —
// loadAll() boot'ta tam bu dosyaya restore eder. Testler PRO_OPEN_SIGNALS_FILE'ı
// tmp'e yönlendirince öğrenme durumu da otomatik aynı dizine gider (izole).
const FILE = process.env.PRO_LEARNING_FILE
  || (process.env.PRO_OPEN_SIGNALS_FILE
    ? path.join(path.dirname(process.env.PRO_OPEN_SIGNALS_FILE), 'pro-learning.json')
    : path.join(process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data'), SUBDIR, 'learning.json'));

module.exports = createLearning({
  name: 'pro',
  file: FILE,
  disabledEnv: 'PRO_LEARNING_DISABLED',
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
