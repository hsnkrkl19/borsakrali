/**
 * Custom Bots — Strateji Kütüphanesi
 *
 * Her strateji, kullanıcının bot oluştururken seçebileceği bir "taktik"tir.
 * Tümü GÜNLÜK MUM üzerinde, kapanış-bazlı çalışır (TEMA34 botuyla aynı disiplin):
 * bir bot her gün borsa kapanışından sonra evrenini tarar, stratejinin GİRİŞ
 * sinyali verdiği hisseleri alır; ÇIKIŞ sinyali verdiklerini satar. Stop-loss /
 * take-profit ise ayrı (riskRules) kurallarla, gün-içi tick'te uygulanır.
 *
 * Strateji sözleşmesi:
 *   {
 *     id, label, desc,
 *     params: [{ key, label, type:'int'|'float', default, min, max, step, hint }],
 *     minCandles(params) → gereken en az mum sayısı,
 *     evaluate(candles, params) → {
 *        entry: bool,        // son barda yeni giriş sinyali
 *        exit:  bool,        // son barda strateji-bazlı çıkış sinyali
 *        reason: string,     // insan-okur gerekçe (notlara yazılır)
 *        lines: {...}        // son bardaki indikatör değerleri (UI/debug)
 *     }
 *   }
 *
 * evaluate yalnızca SON (en güncel kapanmış) bara karar verir; kesişimler i-1/i
 * ile tespit edilir → geleceğe bakmaz.
 */

const ind = require('./indicators');

function clampParam(p, raw) {
  let v = Number(raw);
  if (!Number.isFinite(v)) v = p.default;
  if (p.type === 'int') v = Math.round(v);
  if (p.min != null && v < p.min) v = p.min;
  if (p.max != null && v > p.max) v = p.max;
  return v;
}

// Bir stratejinin param'larını şemaya göre normalize eder (eksikleri default'lar).
function normalizeParams(strategy, input = {}) {
  const out = {};
  for (const p of strategy.params) {
    out[p.key] = clampParam(p, input[p.key] != null ? input[p.key] : p.default);
  }
  return out;
}

const f2 = (v) => (ind.isNum(v) ? +v.toFixed(2) : null);

// ── 1) EMA Kesişimi ──────────────────────────────────────────────────────────
const emaCross = {
  id: 'ema_cross',
  label: 'EMA Kesişimi',
  desc: 'Hızlı EMA yavaş EMA’yı yukarı kesince AL; aşağı kesince strateji çıkışı. Klasik trend-takip.',
  params: [
    { key: 'fastPeriod', label: 'Hızlı EMA', type: 'int', default: 9,  min: 2, max: 100, hint: 'Kısa dönem ortalama' },
    { key: 'slowPeriod', label: 'Yavaş EMA', type: 'int', default: 21, min: 3, max: 300, hint: 'Uzun dönem ortalama' },
  ],
  minCandles: (p) => Math.max(p.fastPeriod, p.slowPeriod) + 5,
  evaluate(candles, params) {
    const closes = candles.map(c => c.close);
    const i = closes.length - 1;
    const fast = ind.ema(closes, params.fastPeriod);
    const slow = ind.ema(closes, params.slowPeriod);
    const entry = ind.crossesAbove(fast, slow, i);
    const exit = ind.crossesBelow(fast, slow, i);
    return {
      entry, exit,
      reason: entry
        ? `Hızlı EMA(${params.fastPeriod})=${f2(fast[i])} yavaş EMA(${params.slowPeriod})=${f2(slow[i])} üzerine çıktı (yukarı kesişim).`
        : exit
          ? `Hızlı EMA(${params.fastPeriod})=${f2(fast[i])} yavaş EMA(${params.slowPeriod})=${f2(slow[i])} altına indi (aşağı kesişim).`
          : `EMA${params.fastPeriod}=${f2(fast[i])}, EMA${params.slowPeriod}=${f2(slow[i])} — kesişim yok.`,
      lines: { fast: f2(fast[i]), slow: f2(slow[i]) },
    };
  },
};

// ── 2) RSI Dönüşü ────────────────────────────────────────────────────────────
const rsiReversal = {
  id: 'rsi_reversal',
  label: 'RSI Dip Dönüşü',
  desc: 'RSI aşırı-satım bölgesinden yukarı dönünce AL; aşırı-alım bölgesine girince strateji çıkışı. Dipten dönüş.',
  params: [
    { key: 'rsiPeriod',  label: 'RSI periyodu', type: 'int', default: 14, min: 2,  max: 50,  hint: 'RSI hesap periyodu' },
    { key: 'oversold',   label: 'Aşırı satım', type: 'int', default: 30, min: 5,  max: 45,  hint: 'Bu seviyeden dönüşte al' },
    { key: 'overbought', label: 'Aşırı alım',  type: 'int', default: 70, min: 55, max: 95,  hint: 'Bu seviyede sat' },
  ],
  minCandles: (p) => p.rsiPeriod + 5,
  evaluate(candles, params) {
    const closes = candles.map(c => c.close);
    const i = closes.length - 1;
    const r = ind.rsi(closes, params.rsiPeriod);
    const now = r[i], prev = r[i - 1];
    const entry = ind.isNum(now) && ind.isNum(prev) && prev <= params.oversold && now > params.oversold;
    const exit = ind.isNum(now) && now >= params.overbought;
    return {
      entry, exit,
      reason: entry
        ? `RSI(${params.rsiPeriod}) ${f2(prev)} → ${f2(now)} ile aşırı-satım (${params.oversold}) üzerine döndü.`
        : exit
          ? `RSI(${params.rsiPeriod})=${f2(now)} aşırı-alım (${params.overbought}) bölgesinde — çıkış.`
          : `RSI(${params.rsiPeriod})=${f2(now)} — nötr bölge.`,
      lines: { rsi: f2(now) },
    };
  },
};

// ── 3) MACD Kesişimi ─────────────────────────────────────────────────────────
const macdCross = {
  id: 'macd_cross',
  label: 'MACD Kesişimi',
  desc: 'MACD çizgisi sinyal çizgisini yukarı kesince AL; aşağı kesince strateji çıkışı. Momentum.',
  params: [
    { key: 'fastPeriod',   label: 'Hızlı', type: 'int', default: 12, min: 2,  max: 100, hint: 'Hızlı EMA' },
    { key: 'slowPeriod',   label: 'Yavaş', type: 'int', default: 26, min: 3,  max: 200, hint: 'Yavaş EMA' },
    { key: 'signalPeriod', label: 'Sinyal', type: 'int', default: 9, min: 2,  max: 50,  hint: 'Sinyal EMA' },
  ],
  minCandles: (p) => p.slowPeriod + p.signalPeriod + 5,
  evaluate(candles, params) {
    const closes = candles.map(c => c.close);
    const i = closes.length - 1;
    const m = ind.macd(closes, params.fastPeriod, params.slowPeriod, params.signalPeriod);
    const entry = ind.crossesAbove(m.macd, m.signal, i);
    const exit = ind.crossesBelow(m.macd, m.signal, i);
    return {
      entry, exit,
      reason: entry
        ? `MACD=${f2(m.macd[i])} sinyal=${f2(m.signal[i])} üzerine çıktı (al kesişimi).`
        : exit
          ? `MACD=${f2(m.macd[i])} sinyal=${f2(m.signal[i])} altına indi (çıkış kesişimi).`
          : `MACD=${f2(m.macd[i])}, sinyal=${f2(m.signal[i])} — kesişim yok.`,
      lines: { macd: f2(m.macd[i]), signal: f2(m.signal[i]), hist: f2(m.hist[i]) },
    };
  },
};

// ── 4) Bollinger Geri Dönüşü ─────────────────────────────────────────────────
const bollingerReversion = {
  id: 'bollinger_reversion',
  label: 'Bollinger Geri Dönüşü',
  desc: 'Fiyat alt bandın altına sarkıp tekrar içeri girince AL; orta banda (ortalamaya) dönünce strateji çıkışı.',
  params: [
    { key: 'period',  label: 'Periyot',     type: 'int',   default: 20, min: 5, max: 100, hint: 'SMA periyodu' },
    { key: 'stdMult', label: 'Std sapma ×', type: 'float', default: 2,  min: 1, max: 4, step: 0.1, hint: 'Bant genişliği' },
  ],
  minCandles: (p) => p.period + 5,
  evaluate(candles, params) {
    const closes = candles.map(c => c.close);
    const i = closes.length - 1;
    const b = ind.bollinger(closes, params.period, params.stdMult);
    const now = closes[i], prev = closes[i - 1];
    const entry = ind.isNum(b.lower[i]) && ind.isNum(b.lower[i - 1]) &&
      prev < b.lower[i - 1] && now >= b.lower[i];
    const exit = ind.isNum(b.middle[i]) && now >= b.middle[i];
    return {
      entry, exit,
      reason: entry
        ? `Fiyat ${f2(now)} alt bandı (${f2(b.lower[i])}) içeriden geçti — dipten dönüş alımı.`
        : exit
          ? `Fiyat ${f2(now)} orta banda (${f2(b.middle[i])}) ulaştı — ortalamaya dönüş çıkışı.`
          : `Fiyat ${f2(now)} · bant [${f2(b.lower[i])} – ${f2(b.upper[i])}].`,
      lines: { lower: f2(b.lower[i]), middle: f2(b.middle[i]), upper: f2(b.upper[i]) },
    };
  },
};

// ── 5) Supertrend ────────────────────────────────────────────────────────────
const supertrendFlip = {
  id: 'supertrend',
  label: 'Supertrend',
  desc: 'Supertrend yükselişe dönünce AL; düşüşe dönünce strateji çıkışı. ATR-tabanlı trend takibi.',
  params: [
    { key: 'atrPeriod',  label: 'ATR periyodu', type: 'int',   default: 10, min: 3, max: 50, hint: 'Oynaklık periyodu' },
    { key: 'multiplier', label: 'Çarpan',       type: 'float', default: 3,  min: 1, max: 8, step: 0.5, hint: 'Band uzaklığı' },
  ],
  minCandles: (p) => p.atrPeriod + 10,
  evaluate(candles, params) {
    const i = candles.length - 1;
    const st = ind.supertrend(candles, params.atrPeriod, params.multiplier);
    const now = st.trend[i], prev = st.trend[i - 1];
    const entry = now === 1 && prev === -1;
    const exit = now === -1 && prev === 1;
    return {
      entry, exit,
      reason: entry
        ? `Supertrend düşüşten yükselişe döndü (çizgi ${f2(st.line[i])}) — alım.`
        : exit
          ? `Supertrend yükselişten düşüşe döndü (çizgi ${f2(st.line[i])}) — çıkış.`
          : `Supertrend ${now === 1 ? 'yükseliş' : 'düşüş'} (çizgi ${f2(st.line[i])}).`,
      lines: { trend: now, line: f2(st.line[i]) },
    };
  },
};

// ── 6) Donchian Kırılımı ─────────────────────────────────────────────────────
const donchianBreakout = {
  id: 'donchian_breakout',
  label: 'Donchian Kırılımı',
  desc: 'Kapanış son N günün en yükseğini geçince AL (kırılım); son M günün en düşüğünün altına inince strateji çıkışı.',
  params: [
    { key: 'period',     label: 'Kırılım penceresi', type: 'int', default: 20, min: 3, max: 200, hint: 'Giriş için yüksek penceresi' },
    { key: 'exitPeriod', label: 'Çıkış penceresi',   type: 'int', default: 10, min: 2, max: 200, hint: 'Çıkış için düşük penceresi' },
  ],
  minCandles: (p) => Math.max(p.period, p.exitPeriod) + 5,
  evaluate(candles, params) {
    const i = candles.length - 1;
    const dcEntry = ind.donchian(candles, params.period);
    const dcExit = ind.donchian(candles, params.exitPeriod);
    const close = candles[i].close;
    const entry = ind.isNum(dcEntry.upper[i]) && close > dcEntry.upper[i];
    const exit = ind.isNum(dcExit.lower[i]) && close < dcExit.lower[i];
    return {
      entry, exit,
      reason: entry
        ? `Kapanış ${f2(close)} son ${params.period} günün en yükseği (${f2(dcEntry.upper[i])}) üzerine çıktı — kırılım.`
        : exit
          ? `Kapanış ${f2(close)} son ${params.exitPeriod} günün en düşüğü (${f2(dcExit.lower[i])}) altına indi — çıkış.`
          : `Kapanış ${f2(close)} · üst ${f2(dcEntry.upper[i])} / alt ${f2(dcExit.lower[i])}.`,
      lines: { upper: f2(dcEntry.upper[i]), exitLower: f2(dcExit.lower[i]) },
    };
  },
};

const ALL = [emaCross, rsiReversal, macdCross, bollingerReversion, supertrendFlip, donchianBreakout];
const BY_ID = Object.fromEntries(ALL.map(s => [s.id, s]));

function get(id) { return BY_ID[id] || null; }

// UI için: motora ait fonksiyonlar olmadan yalın şema listesi.
function publicList() {
  return ALL.map(s => ({
    id: s.id,
    label: s.label,
    desc: s.desc,
    params: s.params,
    defaultParams: Object.fromEntries(s.params.map(p => [p.key, p.default])),
  }));
}

module.exports = { ALL, get, publicList, normalizeParams, clampParam };
