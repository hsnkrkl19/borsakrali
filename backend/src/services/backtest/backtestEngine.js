/**
 * Backtest Motoru — canlı botu geçmişe sararak çalıştırır
 *
 * lumibot'un "write once → backtest = live" ilkesinin yerli karşılığı: canlı
 * Custom Bot ne yapıyorsa BİREBİR aynısını geçmiş mumlar üzerinde gün-gün
 * yeniden oynatır. Strateji kararları (`strategies.evaluate`), stop/hedef
 * (`riskRules`), iz-süren stop (`trailingManager`) ve PARA MATEMATİĞİ
 * (`customBotEngine.openPosition/closePosition`) AYNI modüllerden gelir — burada
 * hiçbir strateji/indikatör yeniden yazılmaz. Böylece yeşil bir backtest ile
 * canlı bot tutarlı kalır.
 *
 * Look-ahead yok:
 *   - i. barın kararı yalnızca candles[0..i] ile verilir (evaluate son bara bakar).
 *   - Giriş/strateji-çıkışı i. barın KAPANIŞINDAN doldurulur (kapanış o an bilinir).
 *   - SL/TP yalnız SONRAKİ barların gün-içi düşük/yükseğiyle tetiklenir (giriş
 *     barında stop aranmaz — pozisyon kapanıştan açıldı).
 *   - İz-süren stop i. kapanıştan hesaplanır, i+1. barı etkiler.
 *
 * Modelleme notları (UI'da kullanıcıya da gösterilir):
 *   - Komisyon canlı motordaki gibi uygulanır; SLIPPAGE modellenmez (canlı Custom
 *     Bot da uygulamıyor → backtest canlıyla doğrudan kıyaslanabilir kalsın).
 *   - SL/TP gün-içi düşük/yüksek ile; boşluklu (gap) açılışta gerçekçi dolum:
 *     açılış stop'un altındaysa açılıştan, değilse stop seviyesinden.
 *   - Aynı barda hem stop hem hedefe değilirse STOP önce kabul edilir (tutucu).
 *   - Drawdown kill-switch UYGULANMAZ: backtest stratejinin ham performansını
 *     ölçer; canlı kill-switch ayrı bir güvenlik ağıdır.
 */

const strategies = require('../customBots/strategies');
const riskRules = require('../customBots/riskRules');
const trailingManager = require('../tradingBotV2/trailingManager');
const ind = require('../customBots/indicators');
const engine = require('../customBots/customBotEngine');
const { createInMemoryStore } = require('./inMemoryStore');
const { computeMetrics } = require('./metrics');

const MIN_POSITION_TL = 100;   // customBotEngine ile aynı eşik
const ATR_PERIOD = 14;

function round(v, d = 2) { return (typeof v === 'number' && Number.isFinite(v)) ? +v.toFixed(d) : v; }
function isoOf(dateKey) { return `${dateKey}T00:00:00.000Z`; }

/**
 * Long pozisyon için bir barda SL/TP tetiklenir mi?
 * Stop önceliklidir (tutucu). Boşluklu açılışta gerçekçi dolum fiyatı seçilir.
 */
function checkExit(pos, bar) {
  const stop = pos.currentStop;
  const target = pos.currentTarget;
  if (stop != null && bar.low <= stop) {
    const price = bar.open <= stop ? bar.open : stop;
    return { hit: 'stop', price: +price.toFixed(4) };
  }
  if (target != null && bar.high >= target) {
    const price = bar.open >= target ? bar.open : target;
    return { hit: 'target', price: +price.toFixed(4) };
  }
  return { hit: null };
}

/**
 * @param {object} args
 * @param {object} args.def    normalize edilmiş bot tanımı (registry.validateDef çıktısı)
 * @param {object} args.candlesBySymbol  { SYM: [{date,open,high,low,close}], ... } artan tarihli, temiz
 * @param {object} [args.options]  { startDate?, endDate? } ISO 'YYYY-MM-DD' pencere sınırı
 * @returns backtest sonucu (metrikler + equity eğrisi + işlemler)
 */
function runBacktest({ def, candlesBySymbol, options = {} }) {
  const strategy = strategies.get(def.strategyId);
  if (!strategy) return { ok: false, error: 'Geçersiz strateji' };

  const params = def.params;
  const minBars = Math.max(2, strategy.minCandles(params));
  const positionPct = (def.sizing.positionPct || 0) / 100;
  const { startDate, endDate } = options;

  // Sembol başına: artan barlar + dateKey→index haritası (prefix dilimleme için)
  const symbols = [];
  const barsBySymbol = {};
  const idxBySymbol = {};   // SYM → Map(dateKey → barIndex)
  for (const sym of Object.keys(candlesBySymbol)) {
    let bars = (candlesBySymbol[sym] || [])
      .filter(c => Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low) && c.date)
      .map(c => ({ date: String(c.date).slice(0, 10), open: Number(c.open ?? c.close), high: Number(c.high), low: Number(c.low), close: Number(c.close) }));
    // tarih sırası garanti + tekilleştir (aynı gün tekrar gelirse sonuncuyu tut)
    bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (bars.length < minBars) continue;
    symbols.push(sym);
    barsBySymbol[sym] = bars;
    const m = new Map();
    bars.forEach((b, i) => m.set(b.date, i));
    idxBySymbol[sym] = m;
  }

  if (symbols.length === 0) {
    return { ok: false, error: 'Yeterli geçmiş veri yok (her sembolde en az ' + minBars + ' mum gerekir).' };
  }
  symbols.sort();   // deterministik giriş sırası

  // Birleşik tarih ekseni (tüm sembollerin barlarının kesişimi değil, BİRLEŞİMİ)
  const axisSet = new Set();
  for (const sym of symbols) {
    for (const b of barsBySymbol[sym]) {
      if (startDate && b.date < startDate) continue;
      if (endDate && b.date > endDate) continue;
      axisSet.add(b.date);
    }
  }
  const axis = [...axisSet].sort();
  if (axis.length === 0) return { ok: false, error: 'Seçilen tarih aralığında veri yok.' };

  const store = createInMemoryStore(def.sizing.capital);
  const bot = def;
  const entryMeta = new Map();   // posId → { entryAxisIdx, symbol }
  const equityCurve = [];
  let entrySignals = 0, exitSignals = 0;

  // sym + dateKey → o güne kadarki (dahil) bar prefix'i
  function prefixUpTo(sym, dateKey) {
    const i = idxBySymbol[sym].get(dateKey);
    if (i == null) return null;
    return barsBySymbol[sym].slice(0, i + 1);
  }
  function atrFromPrefix(prefix) {
    return ind.atrLast(prefix, ATR_PERIOD);
  }
  function lastKnownPrice(sym, dateKey) {
    // dateKey'de bar yoksa, o tarihten ÖNCEKI son kapanış (carry-forward değerleme)
    const bars = barsBySymbol[sym];
    let price = null;
    for (let k = 0; k < bars.length; k++) {
      if (bars[k].date > dateKey) break;
      price = bars[k].close;
    }
    return price;
  }

  function closeAt(pos, axisIdx, dateKey, price, reason, note) {
    const meta = entryMeta.get(pos.id);
    const holdingBars = meta ? axisIdx - meta.entryAxisIdx : null;
    engine.closePosition(store, bot, store.findById(pos.id), price, reason, note);
    store.patchTradeById(pos.id, { exitDate: isoOf(dateKey), holdingBars });
    entryMeta.delete(pos.id);
  }

  for (let axisIdx = 0; axisIdx < axis.length; axisIdx++) {
    const dateKey = axis[axisIdx];

    // ── 1) Açık pozisyon yönetimi (SL/TP → timeout → strateji-çıkış → trailing) ──
    for (const pos of store.listOpen()) {
      const sym = pos.symbol;
      const bar = barsBySymbol[sym][idxBySymbol[sym].get(dateKey) ?? -1];
      if (!bar) continue;   // bu sembol bugün işlem görmedi → pozisyonu koru
      const meta = entryMeta.get(pos.id);
      const heldBars = meta ? axisIdx - meta.entryAxisIdx : 1;

      // a) SL/TP yalnız giriş barından SONRAKI barlarda
      if (heldBars >= 1) {
        const ex = checkExit(pos, bar);
        if (ex.hit === 'stop') {
          closeAt(pos, axisIdx, dateKey, ex.price, 'stop',
            `Gün-içi düşük ${round(bar.low)} ≤ stop ${round(pos.currentStop)} — stop tetiklendi.`);
          continue;
        }
        if (ex.hit === 'target') {
          closeAt(pos, axisIdx, dateKey, ex.price, 'target',
            `Gün-içi yüksek ${round(bar.high)} ≥ hedef ${round(pos.currentTarget)} — hedef tetiklendi.`);
          continue;
        }
        // b) Zaman aşımı (işgünü ≈ eksen barı)
        if (def.risk.timeoutDays > 0 && heldBars >= def.risk.timeoutDays) {
          closeAt(pos, axisIdx, dateKey, bar.close, 'timeout',
            `${def.risk.timeoutDays} işgünü doldu — kapanışta kapatıldı.`);
          continue;
        }
      }

      // c) Strateji çıkış sinyali (kapanıştan kapat) — runDaily ile aynı
      const prefix = prefixUpTo(sym, dateKey);
      let evald = null;
      if (prefix && prefix.length >= minBars) {
        evald = strategy.evaluate(prefix, params);
        if (evald.exit) {
          exitSignals++;
          closeAt(pos, axisIdx, dateKey, bar.close, 'signal_exit', `Strateji çıkış sinyali — ${evald.reason}`);
          continue;
        }
      }
      store.updatePosition(pos.id, { lastPrice: bar.close });

      // d) İz-süren stop (i. kapanıştan; i+1. barı etkiler)
      if (def.risk.trailing && pos.currentStop != null) {
        const atr = prefix ? atrFromPrefix(prefix) : 0;
        const trail = trailingManager.computeTrailing(
          { entryPrice: pos.entryPrice, originalStop: pos.originalStop, currentStop: pos.currentStop, direction: 'long' },
          bar.close, atr,
        );
        if (trail && trail.newStop > pos.currentStop) {
          store.updatePosition(pos.id, { currentStop: trail.newStop });
          store.appendNote(pos.id, 'trail', trail.note);
        }
      }
    }

    // ── 2) Girişler (kapanıştan) — runDaily giriş mantığıyla aynı ──
    for (const sym of symbols) {
      const bIdx = idxBySymbol[sym].get(dateKey);
      if (bIdx == null) continue;
      if (store.findBySymbol(sym, ['open'])) continue;
      const prefix = barsBySymbol[sym].slice(0, bIdx + 1);
      if (prefix.length < minBars) continue;
      const evald = strategy.evaluate(prefix, params);
      if (!evald.entry) continue;
      entrySignals++;
      if (store.listOpen().length >= def.sizing.maxPositions) continue;
      const pf = store.getPortfolio();
      if (pf.cash * positionPct < MIN_POSITION_TL) continue;
      const bar = barsBySymbol[sym][bIdx];
      const atr = atrFromPrefix(prefix);
      const opened = engine.openPosition(store, bot, {
        symbol: sym, name: sym, fillPrice: bar.close, atr,
        source: 'strategy', reasonNote: `${strategy.label} giriş sinyali — ${evald.reason}`,
      });
      if (opened.ok) {
        // Giriş/sinyal tarihini simüle bara çek (timeout + ledger doğru olsun)
        store.updatePosition(opened.position.id, { entryDate: isoOf(dateKey), signalDate: dateKey });
        entryMeta.set(opened.position.id, { entryAxisIdx: axisIdx, symbol: sym });
      }
    }

    // ── 3) Gün sonu equity noktası (nakit + açık pozisyon değeri) ──
    const pf = store.getPortfolio();
    const openVal = store.listOpen().reduce((s, p) => {
      const bar = barsBySymbol[p.symbol][idxBySymbol[p.symbol].get(dateKey) ?? -1];
      const price = bar ? bar.close : (lastKnownPrice(p.symbol, dateKey) ?? p.lastPrice ?? p.entryPrice);
      return s + price * p.shares;
    }, 0);
    equityCurve.push({ date: dateKey, equity: +(pf.cash + openVal).toFixed(2) });
  }

  // ── Sonuç derleme ──
  const closedTrades = store.listTradesChrono().map(t => ({
    id: t.id,
    symbol: t.symbol,
    entryDate: t.entryDate,
    exitDate: t.exitDate,
    entryPrice: round(t.entryPrice, 4),
    exitPrice: round(t.exitPrice, 4),
    shares: t.shares,
    realizedPnL: round(t.realizedPnL),
    realizedPnLPct: round(t.realizedPnLPct),
    exitReason: t.exitReason,
    holdingBars: t.holdingBars,
  }));

  const lastEquity = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : def.sizing.capital;
  const openAtEnd = store.listOpen().map(p => {
    const price = lastKnownPrice(p.symbol, axis[axis.length - 1]) ?? p.lastPrice ?? p.entryPrice;
    const unreal = (price - p.entryPrice) * p.shares;
    return {
      symbol: p.symbol, entryDate: p.entryDate, entryPrice: round(p.entryPrice, 4),
      lastPrice: round(price, 4), shares: p.shares,
      currentStop: p.currentStop, currentTarget: p.currentTarget,
      unrealizedPnL: round(unreal),
      unrealizedPnLPct: round(p.entryPrice ? (unreal / (p.entryPrice * p.shares)) * 100 : 0),
    };
  });

  const metrics = computeMetrics({
    initialCapital: def.sizing.capital,
    finalEquity: lastEquity,
    equityCurve,
    trades: closedTrades,
  });

  return {
    ok: true,
    range: {
      from: axis[0],
      to: axis[axis.length - 1],
      tradingDays: axis.length,
    },
    symbolsTested: symbols.length,
    counts: { entrySignals, exitSignals, barsSimulated: axis.length },
    metrics,
    equityCurve,
    trades: closedTrades,
    openAtEnd,
  };
}

module.exports = { runBacktest, checkExit };
