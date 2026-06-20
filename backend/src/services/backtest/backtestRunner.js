/**
 * Backtest Runner — G/Ç orkestrasyonu (veri çek → motoru koştur → kaydet)
 *
 * Saf motor (`backtestEngine`) ile dış dünyayı (Yahoo geçmiş verisi, registry,
 * kayıt deposu) birbirine bağlar. Bir backtest isteği alır:
 *   - tanımı çözer (kayıtlı botId → registry; ya da satır-içi def → validateDef),
 *   - sembollerin günlük OHLC geçmişini çeker (batch + kısa-ömürlü cache),
 *   - motoru çağırır, sonucu zenginleştirir ve kalıcılaştırır.
 *
 * Veri kaynağı: `liveDataService.fetchHistoricalData` (raw Yahoo chart + İş Yatırım
 * fallback) — Render ABD IP'sinde çalışan kanıtlı kaynak (Binance/yahoo-crumb değil).
 */

const liveDataService = require('../liveDataService');
const registry = require('../customBots/customBotRegistry');
const strategies = require('../customBots/strategies');
const riskRules = require('../customBots/riskRules');
const { runBacktest } = require('./backtestEngine');
const store = require('./backtestStore');

const ALLOWED_RANGES = ['3mo', '6mo', '1y', '2y', '5y'];
const RANGE_LABEL = { '3mo': '3 ay', '6mo': '6 ay', '1y': '1 yıl', '2y': '2 yıl', '5y': '5 yıl' };
const FETCH_BATCH = 8;
const CACHE_TTL_MS = 10 * 60 * 1000;   // 10 dk — backtest iterasyonu hızlansın

// Çok büyük evrende ağır iş O(n²): evren büyükse aralığı sınırla.
function capRangeForUniverse(range, symbolCount) {
  if (symbolCount > 40 && (range === '5y')) return '2y';
  return range;
}

const _cache = new Map();   // `${symbol}:${range}` → { at, data }

async function fetchCandles(symbol, range) {
  const key = `${symbol}:${range}`;
  const hit = _cache.get(key);
  if (hit && (Date.now() - hit.at) < CACHE_TTL_MS) return hit.data;
  let data = null;
  try {
    data = await liveDataService.fetchHistoricalData(symbol, range, '1d');
  } catch (_) { data = null; }
  const clean = Array.isArray(data)
    ? data.filter(c => Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low))
        .map(c => ({ date: String(c.date).slice(0, 10), open: c.open, high: c.high, low: c.low, close: c.close }))
    : [];
  _cache.set(key, { at: Date.now(), data: clean });
  return clean;
}

async function fetchAll(symbols, range) {
  const out = {};
  let fetchErrors = 0;
  for (let i = 0; i < symbols.length; i += FETCH_BATCH) {
    const batch = symbols.slice(i, i + FETCH_BATCH);
    const settled = await Promise.allSettled(batch.map(s => fetchCandles(s, range)));
    settled.forEach((r, j) => {
      if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length) out[batch[j]] = r.value;
      else fetchErrors++;
    });
  }
  return { candlesBySymbol: out, fetchErrors };
}

/**
 * @param {object} req
 *   - botId?         kayıtlı botun tanımını kullan
 *   - def?           satır-içi tanım (botId yoksa) — registry.validateDef ile doğrulanır
 *   - mode           'single' | 'universe'
 *   - symbol?        mode='single' için tek hisse
 *   - range          ALLOWED_RANGES
 *   - startDate?/endDate?   opsiyonel pencere sınırı (çekilen veri içinde)
 * @returns {{ ok, run? , error?, errors? }}
 */
async function run(req = {}) {
  // 1) Tanımı çöz
  let def = null;
  let botId = null, botName = null;
  if (req.botId) {
    def = registry.get(req.botId);
    if (!def) return { ok: false, error: 'Bot bulunamadı' };
    botId = def.id; botName = def.name;
  } else if (req.def) {
    const v = registry.validateDef(req.def);
    if (!v.ok) return { ok: false, errors: v.errors };
    def = v.def; botName = def.name;
  } else {
    return { ok: false, error: 'botId veya def gerekli' };
  }

  const strategy = strategies.get(def.strategyId);
  if (!strategy) return { ok: false, error: 'Geçersiz strateji' };

  // 2) Modu + sembolleri belirle
  const mode = req.mode === 'single' ? 'single' : 'universe';
  let symbols;
  if (mode === 'single') {
    const sym = String(req.symbol || '').toUpperCase().trim();
    if (!sym || !registry.VALID_SYMBOLS.has(sym)) return { ok: false, error: 'Geçerli bir BIST hissesi seçin.' };
    symbols = [sym];
  } else {
    symbols = [...new Set(def.universe)];
    if (!symbols.length) return { ok: false, error: 'Botun hisse evreni boş.' };
  }

  // 3) Aralık
  let range = ALLOWED_RANGES.includes(req.range) ? req.range : '1y';
  range = capRangeForUniverse(range, symbols.length);

  // 4) Veri çek
  const { candlesBySymbol, fetchErrors } = await fetchAll(symbols, range);
  if (Object.keys(candlesBySymbol).length === 0) {
    return { ok: false, error: 'Hiç geçmiş veri alınamadı (kaynak geçici olarak erişilemiyor olabilir).' };
  }

  // 5) Motoru koştur
  const result = runBacktest({
    def,
    candlesBySymbol,
    options: { startDate: req.startDate || null, endDate: req.endDate || null },
  });
  if (!result.ok) return { ok: false, error: result.error };

  // 6) Zenginleştir + kaydet (motorun sonucu açıkça alanlanır — spread çakışması yok)
  const run = {
    botId, botName,
    strategyId: def.strategyId,
    strategyLabel: strategy.label,
    params: def.params,
    risk: def.risk,
    riskSummary: riskRules.describe(def.risk),
    sizing: def.sizing,
    commissionPct: def.commissionPct,
    mode,
    symbols,
    symbolsWithData: Object.keys(candlesBySymbol),
    fetchErrors,
    range,                              // istek aralığı (string: '1y' vb.)
    period: RANGE_LABEL[range] || range,
    assumptions: [
      'Komisyon canlı motordaki gibi uygulanır; slippage modellenmez.',
      'Günlük (1g) mum; SL/TP gün-içi düşük/yükseğiyle tetiklenir.',
      'Aynı barda hem stop hem hedefe değilirse stop önce kabul edilir.',
      'Drawdown kill-switch uygulanmaz — stratejinin ham performansı ölçülür.',
    ],
    // motor çıktısı (gerçek simülasyon penceresi dataRange'de):
    dataRange: result.range,
    symbolsTested: result.symbolsTested,
    counts: result.counts,
    metrics: result.metrics,
    equityCurve: result.equityCurve,
    trades: result.trades,
    openAtEnd: result.openAtEnd,
    createdAt: new Date().toISOString(),
  };

  const saved = store.saveRun(run);
  return { ok: true, run: saved };
}

module.exports = { run, ALLOWED_RANGES, RANGE_LABEL };
