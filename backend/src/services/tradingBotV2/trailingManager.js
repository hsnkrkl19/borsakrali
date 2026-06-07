/**
 * Trailing Manager — Trading Bot v6
 *
 * Açık pozisyonların SL'ini dinamik olarak yukarı taşıyan saf fonksiyon.
 * State tutmaz; pozisyon + güncel fiyat + ATR alır, yeni SL veya null döner.
 *
 * Kural (karma — R basamağı + ATR tavanı):
 *   1) rMultiple = (currentPrice − entry) / (entry − originalStop)
 *   2) rBasedStop:
 *        +1R → SL = entry                 (breakeven)
 *        +2R → SL = entry + 1R            (1R karı kilitle)
 *        +3R → SL = entry + 2R            (2R karı kilitle)
 *        her tam R basamağı için bir adım daha yukarı
 *   3) atrBasedStop = currentPrice − 2×ATR
 *   4) newStop = max(currentStop, rBasedStop, atrBasedStop)
 *
 * SL monotonik artar — asla geri çekilmez. Yeni SL eski SL'den küçükse null döner.
 */

const ATR_TRAILING_MULTIPLE = 2.0;

/**
 * @param {object} position - {entryPrice, originalStop, currentStop, direction}
 * @param {number} currentPrice
 * @param {number} atr  - mevcut ATR (günlük). Yoksa atlanır, sadece R kuralı çalışır.
 * @returns {{ newStop: number, reason: string, rMultiple: number } | null}
 */
function computeTrailing(position, currentPrice, atr) {
  if (!position || !currentPrice || !position.entryPrice || !position.originalStop) {
    return null;
  }
  const isShort = position.direction === 'short';
  if (position.direction && position.direction !== 'long' && !isShort) {
    return null; // bilinmeyen yön
  }

  const entry = position.entryPrice;
  const origStop = position.originalStop;
  const currentStop = position.currentStop ?? origStop;

  // risk = entry ile ilk stop arasındaki mesafe (yön farketmez, pozitif)
  const riskPerShare = isShort ? (origStop - entry) : (entry - origStop);
  if (riskPerShare <= 0) return null;

  // Kâr yönünde kat edilen R sayısı (long: fiyat yukarı, short: fiyat aşağı)
  const rMultiple = isShort
    ? (entry - currentPrice) / riskPerShare
    : (currentPrice - entry) / riskPerShare;

  // R basamağı SL — long'da yukarı, short'ta aşağı taşınır
  // +1R → entry (breakeven), +2R → +1R kilitle, +3R → +2R kilitle ...
  let rBasedStop = null;
  let rBasedNote = null;
  if (rMultiple >= 1) {
    const step = Math.floor(rMultiple); // 1, 2, 3, ...
    rBasedStop = isShort
      ? entry - (step - 1) * riskPerShare
      : entry + (step - 1) * riskPerShare;
    rBasedNote = step === 1
      ? 'Breakeven (giriş seviyesi)'
      : `+${step - 1}R kilitle`;
  }

  // ATR tabanlı SL — long'da fiyatın altında, short'ta üstünde
  let atrBasedStop = null;
  if (atr && atr > 0) {
    atrBasedStop = isShort
      ? currentPrice + ATR_TRAILING_MULTIPLE * atr
      : currentPrice - ATR_TRAILING_MULTIPLE * atr;
  }

  const candidates = [];
  if (rBasedStop != null)    candidates.push({ stop: rBasedStop,    src: `R-step:${rBasedNote}` });
  if (atrBasedStop != null)  candidates.push({ stop: atrBasedStop,  src: `ATR×${ATR_TRAILING_MULTIPLE}` });
  if (candidates.length === 0) return null;

  // En sıkı candidate: long'da en YÜKSEK stop, short'ta en DÜŞÜK stop
  candidates.sort((a, b) => isShort ? a.stop - b.stop : b.stop - a.stop);
  const winner = candidates[0];

  // Monotonik: long'da sadece yükselirse, short'ta sadece düşerse uygula
  if (isShort ? winner.stop >= currentStop : winner.stop <= currentStop) return null;

  const rounded = +winner.stop.toFixed(4);

  return {
    newStop: rounded,
    rMultiple: +rMultiple.toFixed(2),
    reason: winner.src,
    note: `Fiyat ${currentPrice.toFixed(2)} (+${rMultiple.toFixed(2)}R). SL ${currentStop.toFixed(2)} → ${rounded.toFixed(2)} (${winner.src}).`,
  };
}

/**
 * Yardımcı: bir candle dizisinden 14-bar ATR hesaplar.
 * Not: dailySignalsService.calcATR ile aynı formül; oradaki helper export edilmediği
 * için burada da var (modül ayrımı temiz kalsın).
 */
function calcATR(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

module.exports = {
  computeTrailing,
  calcATR,
  ATR_TRAILING_MULTIPLE,
};
