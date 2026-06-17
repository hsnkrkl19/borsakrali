/**
 * Malaysian SNR — mevcut snrService.analyzeSNR'ı forex mumlarında BİREBİR
 * kullanır (yeniden port yok). Cache çakışmasını önlemek için sembol `id#tf`
 * verilir. En yüksek skorlu aktif zone yön + yapısal seviye sağlar.
 */
const snrService = require('../../snrService');

async function evaluate(candles, id, tf, assetType) {
  const NEUTRAL = { technique: 'snr', label: 'Malaysian SNR', weight: 2.0, vote: 'neutral', strength: 0, score: 0, conditions: [], levels: null };
  try {
    const res = await snrService.analyzeSNR(`${id}#${tf}`, candles, { assetType });
    const sig = (res.signals || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    if (!sig) return { ...NEUTRAL, detail: { storyline: res.storyline } };
    const vote = sig.type === 'support' ? 'long' : sig.type === 'resistance' ? 'short' : 'neutral';
    return {
      technique: 'snr', label: 'Malaysian SNR', weight: 2.0,
      vote, strength: Math.min(1, (sig.score || 0) / 100), score: sig.score || 0,
      levels: (sig.entry && sig.stop && sig.target) ? { entry: sig.entry, stop: sig.stop, target: sig.target } : null,
      conditions: [{ id: 'snr_zone', label: `${sig.type === 'support' ? 'Destek' : 'Direnç'} bölgesi (${sig.grade})`, group: 'snr', met: true }],
      detail: { storyline: res.storyline, grade: sig.grade, distancePct: sig.priceDistancePct },
    };
  } catch (e) {
    return NEUTRAL;
  }
}

module.exports = { evaluate };
