'use strict';

/**
 * mt5Bots — MT5/FTMO'da GERÇEKTEN işlem görebilen 15 enstrüman üzerinde çalışan
 * bot ailesi. Her preset ayrı bir yarışmacı bottur (kendi magic'i ile köprüde
 * ayrı işlem açar). Gösterge motoru botBuilder/customBotEngine'den yeniden
 * kullanılır (8 indikatör + oy birleştirme + ATR SL/TP).
 *
 * generate(presetId) → competition observeSnapshot / signalDelivery snapshot'ı.
 */

const forexKlines = require('../forex/forexKlines');
const { INSTRUMENTS } = require('../forex/forexInstruments');
const instrumentBans = require('../instrumentBans');
const { evaluate } = require('../botBuilder/customBotEngine');
const { PRESETS, getPreset } = require('./presets');

const FETCH_LIMIT = 320;

// forexKlines saniye cinsinden time verebilir; motor ve zaman damgası için ms'e çevir.
function toMsCandles(raw) {
  return (raw || [])
    .filter((c) => c && Number.isFinite(c.open) && Number.isFinite(c.close))
    .map((c) => ({
      time: c.time < 1e12 ? c.time * 1000 : c.time,
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0,
    }));
}

/**
 * Tek preset (bot) için tüm MT5 enstrümanları × TF'lerde sinyal üretir.
 * KAPALI bar kullanılır (son forming mum düşürülür) → sinyal her turda oynamaz.
 */
async function generate(presetId, options = {}) {
  const preset = getPreset(presetId);
  if (!preset) throw new Error(`Bilinmeyen MT5 bot preseti: ${presetId}`);

  // SADE ICT botu: Pine motorunun (ictSmc) tek/az stratejisi MT5 evreninde.
  if (preset.kind === 'ict') return generateIct(preset, options);

  // BK XAU Runner: MQL5 EA portu — kendi çoklu-TF verisini (5m+30m+8h) kendisi
  // çeker, bu yüzden aşağıdaki tek-TF döngüsüne girmez.
  if (preset.kind === 'bkxau') return require('./bkXau').generate(preset, options);

  const signals = [];
  const prices = {};
  // BİRLEŞİK botta indikatör yönü ICT kurulumuyla teyit edilir.
  const isCombo = preset.kind === 'combo';
  const ictSvc = isCombo ? require('../ictSmc/ictSmcService') : null;
  // KLASİK strateji botu (turtle/squeeze/rsi2/london/tsmom/holygrail/alligator/heikin).
  const isStrategy = preset.kind === 'strategy';
  const strategyEngines = isStrategy ? require('./strategyEngines') : null;
  // STRATEJİ GELİŞTİREN bot: hücre şampiyonu walk-forward ile seçilir.
  const isEvolver = preset.kind === 'evolver';
  const evolver = isEvolver ? require('./strategyEvolver') : null;
  const evolverBudget = isEvolver ? evolver.newBudget() : null;

  // Preset yalnız belirli enstrümanlarla sınırlandırılabilir (örn. RSI2 endeks+altın).
  // YASAKLI ENSTRÜMAN (2026-07-24): gümüş/XAGUSD hiçbir preset'te taranmaz —
  // hem açık `instruments` listesi olan (mt5-squeeze) hem de listesi OLMAYIP tüm
  // evreni tarayan presetler (mt5-tsmom, mt5-evolver) aynı süzgeçten geçer.
  const universe = instrumentBans.filterInstruments(
    Array.isArray(preset.instruments) && preset.instruments.length
      ? INSTRUMENTS.filter((inst) => preset.instruments.includes(inst.id))
      : INSTRUMENTS,
  );

  for (const tf of preset.tfs) {
    await Promise.all(universe.map(async (inst) => {
      try {
        const raw = await forexKlines.fetchCandles(inst.yahoo, tf, FETCH_LIMIT);
        const all = toMsCandles(raw);
        if (all.length) prices[inst.symbol || inst.id] = all[all.length - 1].close;
        // FORMING (yarım) mumu düşür — yalnız kapanmış barlarla değerlendir.
        // ⚠️ Eskiden `all.slice(0, -1)` idi ve YETMİYORDU: Yahoo forming barın
        // ARDINA bir de "anlık kotasyon" satırı ekliyor, slice yalnız onu atıp
        // yarım barı sinyal barı yapıyordu (bkz. forexKlines.closedBars).
        const candles = forexKlines.closedBars(all, forexKlines.TF_MS[tf]);
        if (candles.length < 60) return;

        let sig;
        if (isStrategy) {
          // tf + enstrüman sınıfı motora geçer (RSI2 TF-eşiği, TSMOM kripto long-only).
          sig = strategyEngines.evaluateStrategy(preset.strategyId, candles,
            { ...preset.params, tf, cls: inst.class });
        } else if (isEvolver) {
          sig = evolver.evaluateCell(inst.id, tf, candles, evolverBudget, options.nowMs);
        } else {
          let def = preset.def;
          if (isCombo) {
            // ICT teyidi: aynı yönde taze bir ICT kurulumu yoksa evaluate iptal eder.
            let ictSignals = [];
            try {
              ictSignals = ictSvc.analyzeLatest(candles, preset.ictStrategies,
                { freshBars: 3, pdFilter: true, preset: 'balanced' }) || [];
            } catch (_) { ictSignals = []; }
            if (!ictSignals.length) return;
            def = { ...preset.def, ictStrategy: true, ictSignals };
          }
          sig = evaluate(candles, def);
        }
        if (!sig) return;

        const bar = candles[candles.length - 1];
        const barIso = new Date(bar.time).toISOString();
        signals.push({
          // STABİL kimlik → competition parmak izi bunu kullanır: mum başına TEK pozisyon.
          signalId: `${inst.id}:${preset.id}:${tf}:${bar.time}`,
          instrumentId: inst.id,
          symbol: inst.id,
          yahoo: inst.yahoo,
          strategy: sig.strategy || preset.id,
          // Evolver şeffaflığı: seçilen şampiyon varyant görünür isimde taşınır.
          strategyName: sig.variantId ? `${preset.name} · ${sig.variantId}` : preset.name,
          tf,
          timeframe: tf,
          direction: sig.direction,
          entry: sig.entry,
          stop: sig.stop,
          target1: sig.target1,
          target2: sig.target2,
          confidence: sig.confidence,
          votes: sig.votes,
          candleDate: barIso,
          generatedAt: new Date(options.nowMs || Date.now()).toISOString(),
        });
      } catch (_) { /* enstrüman/TF çekilemedi — sessiz geç */ }
    }));
  }

  return {
    engine: preset.id,
    botName: preset.name,
    generatedAt: new Date(options.nowMs || Date.now()).toISOString(),
    summary: {
      signals: signals.length,
      long: signals.filter((s) => s.direction === 'long').length,
      short: signals.filter((s) => s.direction === 'short').length,
    },
    prices,
    signals,
  };
}

/**
 * SADE ICT botu: kullanıcının Pine motorunun backend portu (ictSmc) — preset'in
 * ictStrategies'i MT5 evrenindeki 15 enstrümanda, preset'in TF'lerinde çalışır.
 * Premium/Discount kuralı (discount→long, premium→short) ve 'balanced' preset açık.
 */
async function generateIct(preset, options = {}) {
  const ictSvc = require('../ictSmc/ictSmcService');
  // 8 sade ICT botu da yasaklı enstrümanı taramaz (gümüş/XAGUSD — 2026-07-24).
  const instrumentIds = instrumentBans.filterInstruments(INSTRUMENTS).map((i) => i.id);
  const signals = [];
  const prices = {};

  for (const tf of preset.tfs) {
    try {
      const snap = await ictSvc.generate({
        tf,
        strategies: preset.ictStrategies,
        instrumentIds,
        freshBars: 2,
        nowMs: options.nowMs,
      });
      Object.assign(prices, snap.prices || {});
      for (const s of snap.signals || []) {
        // Bot kimliği preset'e sabitlenir (competition positionKey/istatistik ayrışsın).
        signals.push({ ...s, strategyName: `${preset.name} · ${s.strategyName || s.strategy}` });
      }
    } catch (_) { /* TF çekilemedi — sessiz geç */ }
  }

  return {
    engine: preset.id,
    botName: preset.name,
    generatedAt: new Date(options.nowMs || Date.now()).toISOString(),
    summary: {
      signals: signals.length,
      long: signals.filter((s) => s.direction === 'long').length,
      short: signals.filter((s) => s.direction === 'short').length,
    },
    prices,
    signals,
  };
}

module.exports = { generate, generateIct, PRESETS, getPreset, toMsCandles };
