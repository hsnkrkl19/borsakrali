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

  const signals = [];
  const prices = {};

  for (const tf of preset.tfs) {
    await Promise.all(INSTRUMENTS.map(async (inst) => {
      try {
        const raw = await forexKlines.fetchCandles(inst.yahoo, tf, FETCH_LIMIT);
        const all = toMsCandles(raw);
        if (all.length) prices[inst.symbol || inst.id] = all[all.length - 1].close;
        // FORMING (yarım) mumu düşür — yalnız kapanmış barlarla değerlendir.
        const candles = all.slice(0, -1);
        if (candles.length < 60) return;

        const sig = evaluate(candles, preset.def);
        if (!sig) return;

        const bar = candles[candles.length - 1];
        const barIso = new Date(bar.time).toISOString();
        signals.push({
          // STABİL kimlik → competition parmak izi bunu kullanır: mum başına TEK pozisyon.
          signalId: `${inst.id}:${preset.id}:${tf}:${bar.time}`,
          instrumentId: inst.id,
          symbol: inst.id,
          yahoo: inst.yahoo,
          strategy: preset.id,
          strategyName: preset.name,
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

module.exports = { generate, PRESETS, getPreset, toMsCandles };
