/**
 * ta4j tarzı teknik analiz katmanı (EKLEMELİ / additive).
 *
 * ta4j (https://github.com/ta4j/ta4j) bir JAVA kütüphanesidir; Node.js backend'ine
 * doğrudan kurulamaz. Bunun yerine ta4j ile aynı tasarım felsefesine sahip
 * `trading-signals` (akışkan/streaming indikatörler, özyinelemeli önbellek) paketini
 * sarıyoruz. Bu modül MEVCUT canlı sinyal indikatörlerine DOKUNMAZ — yeni bir
 * yetenek olarak yan yana durur (bkz. proje notu: "sinyal yuvarlama riski").
 *
 * Girdi: projenin standart mum şekli { time, open, high, low, close, volume }.
 * Çıktı: her indikatör için { values: (number|object|null)[], last, isStable }.
 * Tüm değerler düz JS sayısı/nesnesidir (big.js sarmalayıcı yok).
 */

const TS = require('trading-signals');

// --- Mum → indikatör girdisi eşleyicileri (kind'a göre seçilir) ---
const MAPPERS = {
  price: (c) => (typeof c === 'number' ? c : c.close),
  hl: (c) => ({ high: c.high, low: c.low }),
  hlc: (c) => ({ high: c.high, low: c.low, close: c.close }),
  hlcv: (c) => ({ high: c.high, low: c.low, close: c.close, volume: c.volume }),
  ohlcv: (c) => ({ open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }),
};

/**
 * trading-signals'ta TEMA (Triple EMA) yok; ta4j'deki TripleEMAIndicator gibi
 * üç EMA'dan elle kuruyoruz: TEMA = 3*e1 - 3*e2 + e3.
 * Akış arayüzü (.add / .isStable) diğer indikatörlerle uyumlu olsun diye sınıf.
 */
class TripleEMA {
  constructor(interval) {
    this.e1 = new TS.EMA(interval);
    this.e2 = new TS.EMA(interval);
    this.e3 = new TS.EMA(interval);
    this.isStable = false;
  }
  add(price) {
    const v1 = this.e1.add(price);
    if (v1 == null) return null;
    const v2 = this.e2.add(v1);
    if (v2 == null) return null;
    const v3 = this.e3.add(v2);
    if (v3 == null) return null;
    this.isStable = true;
    return 3 * v1 - 3 * v2 + v3;
  }
}

const num = (o, key, dflt) => {
  const v = o && o[key];
  return Number.isFinite(v) && v > 0 ? v : dflt;
};

/**
 * İndikatör kataloğu. Her giriş:
 *   kind      → MAPPERS anahtarı (girdi şekli)
 *   composite → sonuç sayı değil nesne mi (MACD/BB/Stochastic vb.)
 *   make(opt) → trading-signals örneği üreten fabrika
 *   params    → kullanıcıya gösterilen ayarlanabilir parametreler (UI/katalog için)
 */
const INDICATORS = {
  // --- Hareketli ortalamalar (kapanış) ---
  sma: { label: 'Simple MA', group: 'overlap', kind: 'price', params: { period: 20 }, make: (o = {}) => new TS.SMA(num(o, 'period', 20)) },
  ema: { label: 'Exponential MA', group: 'overlap', kind: 'price', params: { period: 20 }, make: (o = {}) => new TS.EMA(num(o, 'period', 20)) },
  wma: { label: 'Weighted MA', group: 'overlap', kind: 'price', params: { period: 20 }, make: (o = {}) => new TS.WMA(num(o, 'period', 20)) },
  wsma: { label: 'Wilder Smoothed MA (SMMA)', group: 'overlap', kind: 'price', params: { period: 14 }, make: (o = {}) => new TS.WSMA(num(o, 'period', 14)) },
  rma: { label: 'Running MA (RMA)', group: 'overlap', kind: 'price', params: { period: 14 }, make: (o = {}) => new TS.RMA(num(o, 'period', 14)) },
  dema: { label: 'Double EMA', group: 'overlap', kind: 'price', params: { period: 20 }, make: (o = {}) => new TS.DEMA(num(o, 'period', 20)) },
  tema: { label: 'Triple EMA', group: 'overlap', kind: 'price', params: { period: 20 }, make: (o = {}) => new TripleEMA(num(o, 'period', 20)) },

  // --- Momentum / osilatörler (kapanış) ---
  rsi: { label: 'RSI', group: 'momentum', kind: 'price', params: { period: 14 }, make: (o = {}) => new TS.RSI(num(o, 'period', 14)) },
  roc: { label: 'Rate of Change', group: 'momentum', kind: 'price', params: { period: 12 }, make: (o = {}) => new TS.ROC(num(o, 'period', 12)) },
  mom: { label: 'Momentum', group: 'momentum', kind: 'price', params: { period: 10 }, make: (o = {}) => new TS.MOM(num(o, 'period', 10)) },
  cg: { label: 'Center of Gravity', group: 'momentum', kind: 'price', params: { period: 10, signalPeriod: 3 }, make: (o = {}) => new TS.CG(num(o, 'period', 10), num(o, 'signalPeriod', 3)) },
  stochRsi: { label: 'Stochastic RSI', group: 'momentum', kind: 'price', params: { period: 14 }, make: (o = {}) => new TS.StochasticRSI(num(o, 'period', 14)) },
  macd: {
    label: 'MACD', group: 'momentum', kind: 'price', composite: true,
    params: { short: 12, long: 26, signal: 9 },
    make: (o = {}) => new TS.MACD(new TS.EMA(num(o, 'short', 12)), new TS.EMA(num(o, 'long', 26)), new TS.EMA(num(o, 'signal', 9))),
  },

  // --- Yön/trend gücü (HLC) ---
  adx: { label: 'ADX', group: 'trend', kind: 'hlc', params: { period: 14 }, make: (o = {}) => new TS.ADX(num(o, 'period', 14)) },
  dx: { label: 'Directional Movement (DX)', group: 'trend', kind: 'hlc', params: { period: 14 }, make: (o = {}) => new TS.DX(num(o, 'period', 14)) },
  cci: { label: 'CCI', group: 'momentum', kind: 'hlc', params: { period: 20 }, make: (o = {}) => new TS.CCI(num(o, 'period', 20)) },
  williamsR: { label: 'Williams %R', group: 'momentum', kind: 'hlc', params: { period: 14 }, make: (o = {}) => new TS.WilliamsR(num(o, 'period', 14)) },
  stochastic: {
    label: 'Stochastic Oscillator', group: 'momentum', kind: 'hlc', composite: true,
    params: { period: 14, kSmoothing: 3, dSmoothing: 3 },
    make: (o = {}) => new TS.StochasticOscillator(num(o, 'period', 14), num(o, 'kSmoothing', 3), num(o, 'dSmoothing', 3)),
  },
  psar: { label: 'Parabolic SAR', group: 'trend', kind: 'hl', params: { step: 0.02, max: 0.2 }, make: (o = {}) => new TS.PSAR({ accelerationStep: num(o, 'step', 0.02), accelerationMax: num(o, 'max', 0.2) }) },
  ao: { label: 'Awesome Oscillator', group: 'momentum', kind: 'hl', params: { short: 5, long: 34 }, make: (o = {}) => new TS.AO(num(o, 'short', 5), num(o, 'long', 34)) },
  ac: { label: 'Accelerator Oscillator', group: 'momentum', kind: 'hl', params: { short: 5, long: 34, signal: 5 }, make: (o = {}) => new TS.AC(num(o, 'short', 5), num(o, 'long', 34), num(o, 'signal', 5)) },

  // --- Volatilite ---
  atr: { label: 'ATR', group: 'volatility', kind: 'hlc', params: { period: 14 }, make: (o = {}) => new TS.ATR(num(o, 'period', 14)) },
  tr: { label: 'True Range', group: 'volatility', kind: 'hlc', params: {}, make: () => new TS.TR() },
  bb: { label: 'Bollinger Bands', group: 'volatility', kind: 'price', composite: true, params: { period: 20, multiplier: 2 }, make: (o = {}) => new TS.BollingerBands(num(o, 'period', 20), num(o, 'multiplier', 2)) },
  accelerationBands: { label: 'Acceleration Bands', group: 'volatility', kind: 'hlc', composite: true, params: { period: 20, width: 4 }, make: (o = {}) => new TS.AccelerationBands(num(o, 'period', 20), num(o, 'width', 4)) },
  mad: { label: 'Mean Abs Deviation', group: 'volatility', kind: 'price', params: { period: 20 }, make: (o = {}) => new TS.MAD(num(o, 'period', 20)) },

  // --- Hacim ---
  // OBV birikimlidir; `interval` yalnız bir önceki kapanışa erişmek için tutulan
  // pencere/min-girdi kapısıdır (toplam yine tüm geçmişte birikir). En az 2 olmalı.
  obv: { label: 'On-Balance Volume', group: 'volume', kind: 'ohlcv', params: { period: 2 }, make: (o = {}) => new TS.OBV(Math.max(2, num(o, 'period', 2))) },
  vwap: { label: 'VWAP', group: 'volume', kind: 'hlcv', params: {}, make: () => new TS.VWAP() },
};

/** Bir indikatör örneğini mum dizisi üzerinde akıtır; hizalı seri döndürür. */
function stream(indicator, candles, mapper) {
  const values = new Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    let v = null;
    try {
      v = indicator.add(mapper(candles[i]));
    } catch (_) {
      v = null; // ısınma/yetersiz veri → null
    }
    values[i] = v === undefined ? null : v;
  }
  let last = null;
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null) { last = values[i]; break; }
  }
  return { values, last, isStable: !!indicator.isStable };
}

/**
 * Tek indikatör hesapla.
 * @param {string} key   INDICATORS anahtarı (örn. 'rsi')
 * @param {Array}  candles  { time, open, high, low, close, volume } dizisi
 * @param {object} [options]  indikatöre özgü parametreler (period vb.)
 * @returns {{ key, label, group, composite, values, last, isStable }}
 */
function compute(key, candles, options = {}) {
  const def = INDICATORS[key];
  if (!def) throw new Error(`Bilinmeyen indikatör: ${key}`);
  if (!Array.isArray(candles)) throw new Error('candles bir dizi olmalı');
  const mapper = MAPPERS[def.kind];
  const indicator = def.make(options);
  const res = stream(indicator, candles, mapper);
  return { key, label: def.label, group: def.group, composite: !!def.composite, ...res };
}

/**
 * Birden çok indikatörün SON değerlerini tek geçişte topla (anlık görüntü).
 * @param {Array} candles
 * @param {object} [config]  { keys?: string[], options?: { [key]: opts } }
 * @returns {{ [key]: number|object|null }}
 */
function computeAll(candles, config = {}) {
  const keys = Array.isArray(config.keys) && config.keys.length ? config.keys : Object.keys(INDICATORS);
  const opts = config.options || {};
  const snapshot = {};
  for (const key of keys) {
    if (!INDICATORS[key]) continue;
    try {
      snapshot[key] = compute(key, candles, opts[key] || {}).last;
    } catch (_) {
      snapshot[key] = null;
    }
  }
  return snapshot;
}

/** Katalog metaverisi (UI / API /catalog ucu için). */
function listIndicators() {
  return Object.entries(INDICATORS).map(([key, d]) => ({
    key,
    label: d.label,
    group: d.group,
    kind: d.kind,
    composite: !!d.composite,
    params: d.params || {},
  }));
}

/**
 * Basit yorumlama katmanı: anlık görüntüden insan-okur sinyaller türetir.
 * (ta4j Rule/Strategy karşılığı değil — yalnız hızlı özet; sinyal üretmez.)
 */
function analyze(candles, options = {}) {
  const snap = computeAll(candles, options);
  const close = candles.length ? candles[candles.length - 1].close : null;
  const signals = [];

  if (Number.isFinite(snap.rsi)) {
    if (snap.rsi >= 70) signals.push({ indicator: 'rsi', bias: 'bearish', note: `RSI ${snap.rsi.toFixed(1)} — aşırı alım` });
    else if (snap.rsi <= 30) signals.push({ indicator: 'rsi', bias: 'bullish', note: `RSI ${snap.rsi.toFixed(1)} — aşırı satım` });
  }
  if (snap.macd && Number.isFinite(snap.macd.histogram)) {
    signals.push({ indicator: 'macd', bias: snap.macd.histogram >= 0 ? 'bullish' : 'bearish', note: `MACD histogram ${snap.macd.histogram >= 0 ? '+' : ''}${snap.macd.histogram.toFixed(4)}` });
  }
  if (Number.isFinite(snap.adx)) {
    signals.push({ indicator: 'adx', bias: 'neutral', note: `ADX ${snap.adx.toFixed(1)} — ${snap.adx >= 25 ? 'güçlü trend' : 'zayıf/yatay trend'}` });
  }
  if (Number.isFinite(close) && Number.isFinite(snap.ema)) {
    signals.push({ indicator: 'ema', bias: close >= snap.ema ? 'bullish' : 'bearish', note: `Fiyat EMA'nın ${close >= snap.ema ? 'üzerinde' : 'altında'}` });
  }
  if (snap.bb && Number.isFinite(close)) {
    if (close >= snap.bb.upper) signals.push({ indicator: 'bb', bias: 'bearish', note: 'Üst banda dokundu/aştı' });
    else if (close <= snap.bb.lower) signals.push({ indicator: 'bb', bias: 'bullish', note: 'Alt banda dokundu/aştı' });
  }

  const bull = signals.filter((s) => s.bias === 'bullish').length;
  const bear = signals.filter((s) => s.bias === 'bearish').length;
  const overall = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';

  return { close, snapshot: snap, signals, overall };
}

module.exports = {
  TS,
  INDICATORS,
  MAPPERS,
  TripleEMA,
  compute,
  computeAll,
  listIndicators,
  analyze,
};
