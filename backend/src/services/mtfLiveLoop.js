/**
 * MTF Live Loop — Borsa Krali
 *
 * Top 10 coin için 1m timeframe sinyallerini her 10 saniyede bir günceller.
 * Kullanıcı isteği: "dk lık mumlar her 10 saniyede bir güncellenecek".
 *
 * Yaklaşım:
 *   - setInterval(10s) ile multiTimeframeService.runAndStore('1m') çağrılır
 *   - 1m klines cache TTL = 20sn → ortalama ~10sn data tazeliği
 *   - Frontend de aynı tempoda polling yapar (UX uyumlu)
 *   - Süreç başlangıçta 5 sn beklenir (server boot trafiğini tıkamamak için)
 *
 * Diğer TF'ler (5m, 15m, 1h, 4h, 1d, 1w) cronJobsService altındadır;
 * bu modül sadece 1m için. Tartışmalı: 5m de ileride buraya alınabilir.
 *
 * Render free tier'da 15 dk hareketsizlikten sonra sleep olur — loop durur,
 * yeni istekle uyanır. Production-grade WebSocket için Faz 2.6'ya bırakıldı.
 */

const logger = require('../utils/logger');

const INTERVAL_MS = 10 * 1000;       // 10 saniye
const BOOT_DELAY_MS = 5 * 1000;      // boot sonrası ilk çağrı için gecikme

let intervalHandle = null;
let bootTimeout = null;
let inFlight = false;     // overlap önle (yavaş cycle, sonraki tetiklemeyi atla)
let cycleCount = 0;
let lastSuccessAt = null;
let lastError = null;

async function tick() {
  if (inFlight) return; // hâlâ önceki cycle çalışıyor → atla
  inFlight = true;
  cycleCount += 1;
  try {
    // Lazy require — circular import'ları önler
    const multiTimeframeService = require('./multiTimeframeService');
    const result = await multiTimeframeService.runAndStore('1m');
    lastSuccessAt = new Date().toISOString();
    lastError = null;

    // Frontend'e Socket.IO event gönder — polling beklemeden anlık tepki
    try {
      const socketService = require('./socketService');
      const longCount  = result?.scanner?.long?.signals?.length  || 0;
      const shortCount = result?.scanner?.short?.signals?.length || 0;
      socketService.broadcastSignal({
        strategy: 'crypto_mtf_tick',
        timeframe: '1m',
        generatedAt: result?.generatedAt,
        longCount, shortCount,
        topLong:  (result?.scanner?.long?.signals  || []).slice(0, 3).map(s => s.symbol),
        topShort: (result?.scanner?.short?.signals || []).slice(0, 3).map(s => s.symbol),
        cycleCount,
        stockSymbol: 'CRYPTO_MTF_1M',
      });
    } catch (e) {
      // socket emit başarısız olsa loop devam etsin
      logger.warn(`[MTFLoop] socket emit başarısız: ${e.message}`);
    }

    // Her 6 cycle'da bir (yaklaşık 1 dk) log — gürültü kontrol
    if (cycleCount % 6 === 0) {
      logger.info(`[MTFLoop] 1m cycle #${cycleCount} OK — last: ${lastSuccessAt}`);
    }
  } catch (e) {
    lastError = e.message;
    logger.error(`[MTFLoop] tick hatası: ${e.message}`);
  } finally {
    inFlight = false;
  }
}

function start() {
  if (intervalHandle) {
    logger.warn('[MTFLoop] Zaten çalışıyor');
    return;
  }
  logger.info(`[MTFLoop] 1m live loop başlatılıyor — her ${INTERVAL_MS / 1000}sn`);
  // Boot sırasında hemen çalışma; 5 sn bekle, sonra interval başlat
  bootTimeout = setTimeout(() => {
    tick(); // ilk cycle hemen
    intervalHandle = setInterval(tick, INTERVAL_MS);
  }, BOOT_DELAY_MS);

  // Boot sonrası 90sn beklenip ARKA PLANDA hafif calibration başlat.
  //   - Live loop'u bloklamaz (async, paralel çalışır)
  //   - Sadece 1h × 3 gün = 3 backtest (~20-30sn toplam)
  //   - Sonuçlar mtfCalibrationService'e yazılır + diske kaydedilir
  //   - Sonradan 12 saatte bir tekrar (daha geniş calibration)
  setTimeout(async () => {
    try {
      logger.info('[MTFLoop] Initial calibration başlatılıyor (1h × 3 gün)...');
      const mtfBacktestService = require('./mtfBacktestService');
      await mtfBacktestService.calibrateFromHistory({ tfs: ['1h'], daysBack: 3, save: true });
      logger.info('[MTFLoop] Initial calibration tamamlandı ✓');
    } catch (e) {
      logger.error(`[MTFLoop] Initial calibration hata: ${e.message}`);
    }
  }, 90 * 1000);

  // 12 saatte bir geniş kalibrasyon — 1h/4h/1d × 7 gün
  setInterval(async () => {
    try {
      logger.info('[MTFLoop] Periyodik calibration başlatılıyor (1h/4h/1d × 7 gün)...');
      const mtfBacktestService = require('./mtfBacktestService');
      await mtfBacktestService.calibrateFromHistory({ tfs: ['1h', '4h', '1d'], daysBack: 7, save: true });
      logger.info('[MTFLoop] Periyodik calibration tamamlandı ✓');
    } catch (e) {
      logger.error(`[MTFLoop] Periyodik calibration hata: ${e.message}`);
    }
  }, 12 * 3600 * 1000);
}

function stop() {
  if (bootTimeout)    { clearTimeout(bootTimeout);     bootTimeout = null; }
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  logger.info('[MTFLoop] Durduruldu');
}

function getStatus() {
  return {
    running: intervalHandle != null,
    intervalMs: INTERVAL_MS,
    cycleCount,
    inFlight,
    lastSuccessAt,
    lastError,
  };
}

module.exports = { start, stop, getStatus, tick };
