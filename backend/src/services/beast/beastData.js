/**
 * beastData — BEAST için birleşik OHLC veri katmanı.
 *   BTC/ETH → cryptoKlines ({SYM}-USD) ; XAU/XAG → forexKlines (GC=F/SI=F).
 * Her ikisi de Yahoo chart endpoint (Render ABD IP'de çalışan tek kaynak).
 */

'use strict';

const cryptoKlines = require('../cryptoKlines');
const forexKlines = require('../forex/forexKlines');

// Canlı tarama için yeterli derinlik (HTF resample + zero-lag warmup'ı besler)
const LIVE_LIMIT = { '1h': 1000, '4h': 700, '1d': 600 };
const TF_SEC = { '1h': 3600, '4h': 14400, '1d': 86400 };

async function fetchCandles(inst, tf, limit) {
  const lim = limit || LIVE_LIMIT[tf] || 500;
  if (inst.source === 'crypto') return cryptoKlines.fetchCandles(inst.dataSymbol, tf, lim);
  return forexKlines.fetchCandles(inst.yahoo, tf, lim);
}

// Piyasa açık mı? (metaller hafta sonu kapalı → bayat mum). Kripto 7/24.
function isFresh(candles, tf) {
  if (!candles || !candles.length) return false;
  if (!TF_SEC[tf]) return true;
  const last = candles[candles.length - 1].time;
  const nowSec = Math.floor(Date.now() / 1000);
  // Son mum, 2.5×TF içinde başlamışsa "taze" (forming bar dahil)
  return (nowSec - last) < TF_SEC[tf] * 2.5;
}

module.exports = { fetchCandles, isFresh, LIVE_LIMIT };
