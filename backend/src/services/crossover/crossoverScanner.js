/**
 * Crossover Scanner — TÜM BIST'i tarar, her hisse için EMA34 ve TEMA34 günlük
 * kapanış kesişimlerini sınıflandırır.
 *
 * Tek Yahoo fetch / hisse (1y günlük mum); aynı kapanış dizisinden hem EMA34 hem
 * TEMA34 hesaplanır → her iki indikatörün "ilk kırılım" (yukarı/aşağı) sinyalleri
 * dört kovaya ayrılır:
 *   tema34.up / tema34.down  ve  ema34.up / ema34.down
 *
 * Yalnız ONAYLANMIŞ son günlük kapanışa bakar (gün-içi gürültü yok). Evren
 * tema34Bot ile aynı: data/allBistStocks (~510 hisse). Bu modül BİLDİRİM ÜRETMEZ;
 * yalnız ham tarama sonucu döner (notifier tüketir).
 */

const liveDataService = require('../liveDataService');
const { allBistStocks } = require('../../data/allBistStocks');
const { calcEMASeries, calcTEMASeries, classifyCross } = require('./crossoverIndicators');

const CONFIG = {
  PERIOD: 34,
  MIN_CANDLES: 100,   // TEMA34 warmup için (EMA34 de bu uzunlukta fazlasıyla oturur)
  FETCH_BATCH: 10,    // paralel veri çekim batch boyutu (Yahoo'yu boğmamak için)
  HISTORY_RANGE: '1y',
};

let _running = false;
function isRunning() { return _running; }

/**
 * Tek hisseyi çek + EMA34/TEMA34 durumlarını sınıflandır.
 * Veri yetersiz/bozuksa null döner (o hisse atlanır).
 */
async function analyzeSymbol(stock) {
  const symbol = stock.symbol || stock;
  const name = stock.name || symbol;
  const hist = await liveDataService.fetchHistoricalData(symbol, CONFIG.HISTORY_RANGE, '1d');
  if (!Array.isArray(hist) || hist.length < CONFIG.MIN_CANDLES) return null;

  const closes = hist.map(c => c.close).filter(Number.isFinite);
  if (closes.length < CONFIG.MIN_CANDLES) return null;

  const emaSeries = calcEMASeries(closes, CONFIG.PERIOD);
  const temaSeries = calcTEMASeries(closes, CONFIG.PERIOD);
  const ema = classifyCross(closes, emaSeries);
  const tema = classifyCross(closes, temaSeries);
  if (!ema || !tema) return null;

  const lastBar = hist[hist.length - 1];
  const candleDate = lastBar.date
    || (lastBar.timestamp ? new Date(lastBar.timestamp).toISOString().slice(0, 10) : null);

  return { symbol, name, sector: stock.sector || null, candleDate, ema, tema };
}

// Bir kova satırı — bildirimde gösterilecek sade alanlar.
function row(a, kind) {
  const ind = a[kind];
  return {
    symbol: a.symbol,
    name: a.name,
    close: ind.lastClose,
    line: ind.line,
    distancePct: ind.distancePct,
  };
}

/**
 * Tüm BIST'i tara. Dönen yapı:
 *   { candleDate, scanned, fetchErrors,
 *     tema34: { up: [...], down: [...] }, ema34: { up: [...], down: [...] } }
 * Her kova distancePct'ye göre sıralı (yukarı kırılımlar çizgiye en yakın → en taze
 * önce; aşağı kırılımlar en derin düşüş önce).
 */
async function scanAll(stocks = allBistStocks) {
  if (_running) return { ok: false, busy: true, error: 'Tarama zaten sürüyor' };
  _running = true;
  const startedAt = new Date().toISOString();
  try {
    const analyses = [];
    let fetchErrors = 0;
    for (let i = 0; i < stocks.length; i += CONFIG.FETCH_BATCH) {
      const batch = stocks.slice(i, i + CONFIG.FETCH_BATCH);
      const settled = await Promise.allSettled(batch.map(analyzeSymbol));
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) analyses.push(r.value);
        else fetchErrors++;
      }
    }
    if (analyses.length === 0) {
      return { ok: false, error: 'Hiç hisse verisi alınamadı', scanned: 0, fetchErrors, startedAt, finishedAt: new Date().toISOString() };
    }

    // İşlem günü = taranan hisselerin en güncel mum tarihi
    const candleDate = analyses.reduce(
      (m, a) => (a.candleDate && a.candleDate > m ? a.candleDate : m), '');

    const tema34 = { up: [], down: [] };
    const ema34 = { up: [], down: [] };
    for (const a of analyses) {
      if (a.tema.signal === 'cross_above') tema34.up.push(row(a, 'tema'));
      else if (a.tema.signal === 'cross_below') tema34.down.push(row(a, 'tema'));
      if (a.ema.signal === 'cross_above') ema34.up.push(row(a, 'ema'));
      else if (a.ema.signal === 'cross_below') ema34.down.push(row(a, 'ema'));
    }
    // up: çizgiye en yakın kesişim (en taze) önce; down: en derin (en negatif) önce
    tema34.up.sort((x, y) => x.distancePct - y.distancePct);
    ema34.up.sort((x, y) => x.distancePct - y.distancePct);
    tema34.down.sort((x, y) => x.distancePct - y.distancePct);
    ema34.down.sort((x, y) => x.distancePct - y.distancePct);

    return {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      candleDate,
      scanned: analyses.length,
      fetchErrors,
      tema34,
      ema34,
      counts: {
        temaUp: tema34.up.length, temaDown: tema34.down.length,
        emaUp: ema34.up.length, emaDown: ema34.down.length,
      },
    };
  } catch (e) {
    return { ok: false, error: e.message, startedAt, finishedAt: new Date().toISOString() };
  } finally {
    _running = false;
  }
}

module.exports = { scanAll, analyzeSymbol, isRunning, CONFIG };
