/**
 * TEMA34 Tarama Motoru — çok-zaman-dilimli (4h + 1d), YALNIZ TEMA34.
 *
 * Tüm BIST'i her zaman diliminde tarar; her hisse için TEMA34 günlük/4-saatlik
 * kapanış "ilk kırılım"larını sınıflandırır (crossover/crossoverIndicators ile
 * BİREBİR aynı formül — Pine seed). Yalnız ONAYLANMIŞ (son kapanmış) bara bakar.
 *
 * Zaman dilimleri:
 *   '1d' → Yahoo doğrudan günlük mum (range 1y).
 *   '4h' → Yahoo'da 4h YOK; 1h çekilip 4-saatlik UTC sınırına hizalı toplanır
 *          (forex/forexKlines.resampleHours ile aynı yaklaşım).
 *
 * Bu modül BİLDİRİM ÜRETMEZ; yalnız ham kova sonucu döner (notifier tüketir).
 */

const liveDataService = require('../liveDataService');
const { allBistStocks } = require('../../data/allBistStocks');
const { calcTEMASeries, classifyCross } = require('../crossover/crossoverIndicators');

const PERIOD = 34;
const MIN_CANDLES = 100;     // TEMA34 warmup
const FETCH_BATCH = 10;      // Yahoo'yu boğmamak için paralel batch

// Zaman dilimi başına Yahoo çekim ayarı. '4h' 1h'ten resample edildiği için 1h
// interval + geniş range; '1d' doğrudan.
const TF = {
  '4h': { fetchInterval: '1h', fetchRange: '6mo', resampleHours: 4 },
  '1d': { fetchInterval: '1d', fetchRange: '1y', resampleHours: null },
};
const TIMEFRAMES = ['4h', '1d'];

let _running = false;
function isRunning() { return _running; }

// 1h (veya daha küçük) mumları N-saatlik bara topla — UTC N*3600 sınırına hizalı.
// Giriş artan sırada (Yahoo öyle döner) varsayılır. close-bazlı TEMA için yeterli.
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
async function analyzeSymbolTF(stock, tf) {
  const symbol = stock.symbol || stock;
  const name = stock.name || symbol;
  const cfg = TF[tf];
  let candles = await liveDataService.fetchHistoricalData(symbol, cfg.fetchRange, cfg.fetchInterval);
  if (!Array.isArray(candles) || candles.length === 0) return null;
  if (cfg.resampleHours) candles = resampleHours(candles, cfg.resampleHours);
  if (candles.length < MIN_CANDLES) return null;

  const closes = candles.map(c => c.close).filter(Number.isFinite);
  if (closes.length < MIN_CANDLES) return null;

  const tema = classifyCross(closes, calcTEMASeries(closes, PERIOD));
  if (!tema) return null;

  const lastBar = candles[candles.length - 1];
  return {
    symbol, name,
    candleDate: lastBar.date || null,
    barTime: Number.isFinite(lastBar.timestamp) ? lastBar.timestamp : null,
    tema,
  };
}

// Bir kova satırı — bildirimde gösterilecek sade alanlar.
function row(a) {
  return { symbol: a.symbol, name: a.name, close: a.tema.lastClose, line: a.tema.line, distancePct: a.tema.distancePct };
}

// Tek zaman dilimini tara → { ok, tf, candleDate, barTime, scanned, fetchErrors, up, down }
async function scanTimeframe(tf, stocks) {
  const analyses = [];
  let fetchErrors = 0;
  for (let i = 0; i < stocks.length; i += FETCH_BATCH) {
    const batch = stocks.slice(i, i + FETCH_BATCH);
    const settled = await Promise.allSettled(batch.map(s => analyzeSymbolTF(s, tf)));
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) analyses.push(r.value);
      else fetchErrors++;
    }
  }
  if (analyses.length === 0) {
    return { ok: false, tf, error: 'Hiç hisse verisi alınamadı', scanned: 0, fetchErrors };
  }

  // İşlem barı = taranan hisselerin en güncel (max) bar zamanı / tarihi
  const barTime = analyses.reduce((m, a) => (a.barTime && a.barTime > m ? a.barTime : m), 0) || null;
  const candleDate = analyses.reduce((m, a) => (a.candleDate && a.candleDate > m ? a.candleDate : m), '') || null;

  const up = [];
  const down = [];
  for (const a of analyses) {
    if (a.tema.signal === 'cross_above') up.push(row(a));         // yeni giren (AL bölgesi)
    else if (a.tema.signal === 'cross_below') down.push(row(a));  // sat bölgesine yeni geçen
  }
  // up: çizgiye en yakın (en taze) önce; down: en derin düşüş önce
  up.sort((x, y) => x.distancePct - y.distancePct);
  down.sort((x, y) => x.distancePct - y.distancePct);

  return { ok: true, tf, candleDate, barTime, scanned: analyses.length, fetchErrors, up, down };
}

/**
 * Tüm zaman dilimlerini tara. Dönüş: { ok, startedAt, finishedAt, '4h': {...}, '1d': {...} }
 * Her TF kendi içinde bağımsız (biri başarısız olsa diğeri çalışır).
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
    // En az bir TF başarılıysa genel ok=true
    out.ok = TIMEFRAMES.some(tf => out[tf]?.ok);
    if (!out.ok) out.error = 'Tüm zaman dilimlerinde veri alınamadı';
    return out;
  } catch (e) {
    return { ok: false, error: e.message, startedAt, finishedAt: new Date().toISOString() };
  } finally {
    _running = false;
  }
}

module.exports = { scanAll, scanTimeframe, analyzeSymbolTF, resampleHours, isRunning, TIMEFRAMES, CONFIG: { PERIOD, MIN_CANDLES, FETCH_BATCH, TF } };
