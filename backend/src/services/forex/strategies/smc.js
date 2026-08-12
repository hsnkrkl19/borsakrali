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
    // BIAS KAPISI (2026-08-12 otopsisi): yapı yönüne (bias) TERS OB/FVG oyu
    // tamamen elenir — bearish yapıda "bull-OB menzilde → AL" oyları düşen
    // piyasada LONG bastırıyordu. Bias yoksa eski davranış korunur.
    const bias = String(res.bias || '').toLowerCase();
    if ((vote === 'long' && bias.startsWith('bear')) || (vote === 'short' && bias.startsWith('bull'))) {
      return { ...NEUTRAL, detail: { bias: res.bias, biasTers: true } };
    }
    // MESAFE KAPISI: giriş canlı fiyattan 0.3×ATR'den uzaksa oy NÖTR (bayat bölge).
    const son = candles[candles.length - 1];
    const kapanis = Number(son && son.close) || 0;
    if (kapanis > 0 && sig.entry) {
      const n = Math.min(14, candles.length);
      let atr = 0;
      for (let i = candles.length - n; i < candles.length; i++) atr += (candles[i].high - candles[i].low);
      atr = n > 0 ? atr / n : 0;
      if (atr > 0 && Math.abs(Number(sig.entry) - kapanis) > 0.3 * atr) {
        return { ...NEUTRAL, detail: { bias: res.bias, uzak: true } };
      }
    }
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
