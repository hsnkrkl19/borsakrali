/**
 * TEMA34 Tarama Motoru — çok-zaman-dilimli (4h + 1d), YALNIZ TEMA34.
 *
 * Tüm BIST'i her zaman diliminde tarar; her hisse için TEMA34 günlük/4-saatlik
 * kapanış "ilk kırılım"larını sınıflandırır (crossover/crossoverIndicators ile
 * BİREBİR aynı formül — Pine seed). Yalnız ONAYLANMIŞ (son kapanmış) bara bakar.
 *
 * ⚠️ 2026-07-19 DÜZELTMELERİ (zarar/yanlış-sinyal denetimi):
 *   • GÜN-İÇİ YARIM-MUM DÜZELTMESİ (1d): Yahoo seans içinde bugünün HENÜZ KAPANMAMIŞ
 *     günlük mumunu döndürür. Eskiden tarayıcı bunu kesin veri sanıp AL/SAT'ı
 *     gün-içi (nihai olmayan) fiyattan duyuruyor + takibe alıyordu → hisse kapanışta
 *     geri dönse bile sahte sinyal + yanlış giriş fiyatı. Artık 1d'de bugünün
 *     forming mumu SEANS KAPANANA (≈18:05 TR) kadar düşürülür → yalnız onaylanmış
 *     kapanışta sinyal (`dropFormingDaily`).
 *   • GİRİŞ FİLTRESİ (whipsaw azaltıcı, backtest-kanıtlı PF 1.69→1.87): cross_above
 *     yalnız TEMA çizgisi YÜKSELİYORken (rising) + likidite tabanı (1d ciro) geçerse
 *     "yeni giren" sayılır. Filtresiz TEMA34 yatay piyasada gel-git (whipsaw) ile
 *     kanıyordu. `TEMA34_FILTER_DISABLED=1` ile ham davranışa dönülür.
 *   • KENDİNİ-ONARAN KAPANIŞ için `belowAll` (o an çizgi altındaki TÜM hisseler)
 *     ve günlük P&L raporu için `closeBySymbol` sonuca eklenir (tracker/notifier
 *     tüketir).
 *
 * Zaman dilimleri:
 *   '1d' → Yahoo doğrudan günlük mum (range 1y).
 *   '4h' → Yahoo'da 4h YOK; 1h çekilip 4-saatlik UTC sınırına hizalı toplanır.
 *
 * Bu modül BİLDİRİM ÜRETMEZ; yalnız ham kova sonucu döner (notifier tüketir).
 */

const liveDataService = require('../liveDataService');
const marketHours = require('../marketHours');
const { allBistStocks } = require('../../data/allBistStocks');
const { calcTEMASeries, classifyCross } = require('../crossover/crossoverIndicators');

const PERIOD = 34;
const MIN_CANDLES = 100;     // TEMA34 warmup
const FETCH_BATCH = 10;      // Yahoo'yu boğmamak için paralel batch
const RISING_LOOKBACK = 5;   // TEMA çizgisi kaç bar geriye göre yükseliyor sayılır

function envNum(name, def) { const v = Number(process.env[name]); return Number.isFinite(v) ? v : def; }
// Giriş filtresi ayarları (env ile ayarlanır; TEMA34_FILTER_DISABLED=1 → ham).
function filterCfg() {
  return {
    enabled: process.env.TEMA34_FILTER_DISABLED !== '1',
    requireRising: process.env.TEMA34_REQUIRE_RISING !== '0',   // vars. AÇIK
    // Likidite tabanı (yalnız 1d): ort. 20-gün günlük TL cirosu bu eşiğin altındaysa
    // "yeni giren" sayılmaz → küçük-cap/spekülatif whipsaw kaynağı elenir.
    minTurnover: envNum('TEMA34_MIN_TURNOVER', 50000000),       // 50M TL/gün (BIST AL 200M'den gevşek)
  };
}

// Zaman dilimi başına Yahoo çekim ayarı.
const TF = {
  '4h': { fetchInterval: '1h', fetchRange: '6mo', resampleHours: 4 },
  '1d': { fetchInterval: '1d', fetchRange: '1y', resampleHours: null },
};
const TIMEFRAMES = ['4h', '1d'];

let _running = false;
function isRunning() { return _running; }

// ── Saf yardımcılar (test edilebilir) ────────────────────────────────────────

// TR takvim günü (YYYY-MM-DD).
function trDate(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}
// Bir günlük mum HENÜZ FORMING mı? Bugün (TR) tarihli VE seans daha kapanmadıysa
// (≈18:05 TR öncesi) evet → o mum nihai değildir, düşürülmeli.
function isFormingDailyBar(lastDate, now = new Date()) {
  if (!lastDate) return false;
  if (lastDate !== trDate(now)) return false;                  // geçmiş gün → nihai
  return marketHours.minutesNow(now) < (marketHours.CLOSE_MIN + 5);   // 18:05 TR öncesi → forming
}
// 1d mum dizisinden bugünün forming mumunu (varsa) düş.
function dropFormingDaily(candles, now = new Date()) {
  if (!Array.isArray(candles) || candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  const d = last.date || (Number.isFinite(last.timestamp) ? new Date(last.timestamp).toISOString().slice(0, 10) : null);
  return isFormingDailyBar(d, now) ? candles.slice(0, -1) : candles;
}
// Ort. 20-gün günlük TL cirosu (avgVol20 × son kapanış). Hacim yoksa null.
function avgTurnover(candles) {
  const vols = candles.slice(-20).map(c => c.volume).filter(Number.isFinite);
  if (vols.length < 5) return null;
  const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
  const close = candles[candles.length - 1]?.close;
  return Number.isFinite(close) ? avgVol * close : null;
}
// Bir cross_above adayı "yeni giren" (AL) olarak DUYURULUR mu? (whipsaw filtresi)
// Filtre kapalıysa her cross_above geçer (ham davranış).
function passesEntryFilter(a, tf, cfg = filterCfg()) {
  if (!cfg.enabled) return true;
  if (cfg.requireRising && a.rising !== true) return false;    // düşen çizgide alma
  if (tf === '1d' && cfg.minTurnover > 0) {
    // ciro bilinmiyorsa (null) ELEME — güvenli tarafta likidite şüphesi
    if (a.turnover == null || a.turnover < cfg.minTurnover) return false;
  }
  return true;
}

// 1h (veya daha küçük) mumları N-saatlik bara topla — UTC N*3600 sınırına hizalı.
function resampleHours(candles, hours) {
  const span = hours * 3600 * 1000;
  const map = new Map();
  for (const c of candles) {
    if (!Number.isFinite(c.timestamp) || c.close == null) continue;
    const bucket = Math.floor(c.timestamp / span) * span;
    const g = map.get(bucket);
    if (!g) {
      map.set(bucket, { timestamp: bucket, open: c.open, high: c.high, low: c.low, close: c.close });
    } else {
      if (Number.isFinite(c.high)) g.high = Math.max(g.high ?? c.high, c.high);
      if (Number.isFinite(c.low)) g.low = Math.min(g.low ?? c.low, c.low);
      g.close = c.close;   // son kapanış grubun kapanışı
    }
  }
  return [...map.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(g => ({ timestamp: g.timestamp, date: new Date(g.timestamp).toISOString().slice(0, 10), ...g }));
}

// Tek hisse + tek zaman dilimi → TEMA34 durumunu sınıflandır. Yetersiz veride null.
async function analyzeSymbolTF(stock, tf, now = new Date()) {
  const symbol = stock.symbol || stock;
  const name = stock.name || symbol;
  const cfg = TF[tf];
  let candles = await liveDataService.fetchHistoricalData(symbol, cfg.fetchRange, cfg.fetchInterval);
  if (!Array.isArray(candles) || candles.length === 0) return null;
  if (cfg.resampleHours) candles = resampleHours(candles, cfg.resampleHours);
  else if (tf === '1d') candles = dropFormingDaily(candles, now);   // gün-içi yarım mumu düş
  if (candles.length < MIN_CANDLES) return null;

  const closes = candles.map(c => c.close).filter(Number.isFinite);
  if (closes.length < MIN_CANDLES) return null;

  const temaSeries = calcTEMASeries(closes, PERIOD);
  const tema = classifyCross(closes, temaSeries);
  if (!tema) return null;

  const n = temaSeries.length;
  const rising = n > RISING_LOOKBACK
    ? temaSeries[n - 1] > temaSeries[n - 1 - RISING_LOOKBACK]
    : false;

  const lastBar = candles[candles.length - 1];
  return {
    symbol, name,
    candleDate: lastBar.date || null,
    barTime: Number.isFinite(lastBar.timestamp) ? lastBar.timestamp : null,
    tema,
    rising,
    aboveNow: tema.aboveNow,
    turnover: tf === '1d' ? avgTurnover(candles) : null,
  };
}

// Bir kova satırı — bildirimde gösterilecek sade alanlar.
function row(a) {
  return { symbol: a.symbol, name: a.name, close: a.tema.lastClose, line: a.tema.line, distancePct: a.tema.distancePct };
}

// Analiz listesinden kovaları KUR (saf → test edilebilir). Giriş filtresi `up`'a
// uygulanır (whipsaw azaltıcı); `down`/`belowAll` filtrelenmez (çıkışlar hep raporlanır).
function buildTfResult(analyses, tf, cfg = filterCfg()) {
  if (!analyses.length) {
    return { ok: false, tf, error: 'Hiç hisse verisi alınamadı', scanned: 0, fetchErrors: 0 };
  }
  const barTime = analyses.reduce((m, a) => (a.barTime && a.barTime > m ? a.barTime : m), 0) || null;
  const candleDate = analyses.reduce((m, a) => (a.candleDate && a.candleDate > m ? a.candleDate : m), '') || null;

  const up = [];
  const down = [];
  const belowAll = [];              // o an çizgi ALTINDA olan TÜM hisseler (kendini-onaran kapanış)
  const closeBySymbol = {};         // sembol → son kapanış (günlük P&L raporu)
  let filteredOut = 0;
  for (const a of analyses) {
    closeBySymbol[a.symbol] = a.tema.lastClose;
    if (a.tema.signal === 'cross_above') {
      if (passesEntryFilter(a, tf, cfg)) up.push(row(a));       // yeni giren (AL bölgesi)
      else filteredOut++;
    } else if (a.tema.signal === 'cross_below') {
      down.push(row(a));                                         // sat bölgesine yeni geçen
    }
    if (a.aboveNow === false) belowAll.push(row(a));             // cross_below + süregelen below
  }
  up.sort((x, y) => x.distancePct - y.distancePct);
  down.sort((x, y) => x.distancePct - y.distancePct);

  return { ok: true, tf, candleDate, barTime, scanned: analyses.length, up, down, belowAll, closeBySymbol, filteredOut };
}

// Tek zaman dilimini tara → buildTfResult çıktısı + fetchErrors.
async function scanTimeframe(tf, stocks, now = new Date()) {
  const analyses = [];
  let fetchErrors = 0;
  for (let i = 0; i < stocks.length; i += FETCH_BATCH) {
    const batch = stocks.slice(i, i + FETCH_BATCH);
    const settled = await Promise.allSettled(batch.map(s => analyzeSymbolTF(s, tf, now)));
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) analyses.push(r.value);
      else fetchErrors++;
    }
  }
  const res = buildTfResult(analyses, tf);
  res.fetchErrors = fetchErrors;
  return res;
}

/**
 * Tüm zaman dilimlerini tara. Dönüş: { ok, startedAt, finishedAt, '4h': {...}, '1d': {...} }
 */
async function scanAll(stocks = allBistStocks) {
  if (_running) return { ok: false, busy: true, error: 'Tarama zaten sürüyor' };
  _running = true;
  const startedAt = new Date().toISOString();
  try {
    const out = { ok: true, startedAt };
    for (const tf of TIMEFRAMES) {
      out[tf] = await scanTimeframe(tf, stocks);   // TF'ler sıralı — Yahoo'yu boğmamak için
    }
    out.finishedAt = new Date().toISOString();
    out.ok = TIMEFRAMES.some(tf => out[tf]?.ok);
    if (!out.ok) out.error = 'Tüm zaman dilimlerinde veri alınamadı';
    return out;
  } catch (e) {
    return { ok: false, error: e.message, startedAt, finishedAt: new Date().toISOString() };
  } finally {
    _running = false;
  }
}

module.exports = {
  scanAll, scanTimeframe, analyzeSymbolTF, resampleHours, isRunning, TIMEFRAMES,
  // saf yardımcılar (test)
  buildTfResult, passesEntryFilter, dropFormingDaily, isFormingDailyBar, avgTurnover, trDate,
  CONFIG: { PERIOD, MIN_CANDLES, FETCH_BATCH, RISING_LOOKBACK, TF, get filter() { return filterCfg(); } },
};
