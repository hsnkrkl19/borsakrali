/**
 * SMC (Smart Money Concepts) — mevcut smcService.analyzeSMC'i forex mumlarında
 * BİREBİR kullanır. Sembol `id#tf` (cache çakışması yok). En yüksek skorlu
 * sinyal yön + yapısal seviye (OB/FVG) sağlar.
 */
const smcService = require('../../smcService');

async function evaluate(candles, id, tf, assetType) {
  const NEUTRAL = { technique: 'smc', label: 'SMC', weight: 2.0, vote: 'neutral', strength: 0, score: 0, conditions: [], levels: null };
  try {
    const res = await smcService.analyzeSMC(`${id}#${tf}`, candles, { assetType });
    const sig = (res.signals || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    if (!sig) return { ...NEUTRAL, detail: { bias: res.bias } };
    const vote = sig.type === 'long' ? 'long' : sig.type === 'short' ? 'short' : 'neutral';
    return {
      technique: 'smc', label: 'SMC', weight: 2.0,
      vote, strength: Math.min(1, (sig.score || 0) / 100), score: sig.score || 0,
      levels: (sig.entry && sig.stop && sig.target) ? { entry: sig.entry, stop: sig.stop, target: sig.target } : null,
      conditions: [{ id: `smc_${sig.source}`, label: `${sig.source === 'order_block' ? 'Order Block' : 'FVG'} ${vote === 'long' ? 'Long' : 'Short'} (R/R ${sig.rr})`, group: 'smc', met: true }],
      detail: { bias: res.bias, source: sig.source, rr: sig.rr },
    };
  } catch (e) {
    return NEUTRAL;
  }
}

module.exports = { evaluate };
