/**
 * beastInstruments — BEAST Trend botunun evreni: SADECE 4 enstrüman.
 *   Altın (XAU), Gümüş (XAG), Bitcoin (BTC), Ethereum (ETH).
 *
 * Veri kaynağı: BTC/ETH → cryptoKlines ({SYM}-USD), XAU/XAG → forexKlines (GC=F/SI=F).
 * Render prod (ABD IP) kısıtları nedeniyle her ikisi de Yahoo chart endpoint kullanır.
 *
 * Her enstrümanın kendi tuned parametre seti (`cfg`) var — kripto ve metal farklı
 * volatilite rejimine sahip, bu yüzden ATR-stop çarpanı / ADX eşiği / konfluans eşiği
 * pariteye göre değişir. Bu varsayılanlar backtest ile rafine edilir (beastConfig override).
 */

'use strict';

// Sinyal zaman dilimleri ve her birinin üst-TF bias çarpanı + tutma ufku (bar)
const TF_DEFS = {
  '1h': { htfFactor: 4, horizon: 48 },   // 1h sinyali, 4h bias, en çok 48 bar (~2 gün)
  '4h': { htfFactor: 6, horizon: 42 },   // 4h sinyali, 1d bias, en çok 42 bar (~7 gün)
  '8h': { htfFactor: 3, horizon: 36 },   // 8h sinyali, 1d bias (×3), en çok 36 bar (~12 gün)
  '1d': { htfFactor: 5, horizon: 30 },   // 1d sinyali, ~1w bias, en çok 30 bar (~6 hafta)
};

// Tüm pariteler için temel (base) parametreler — pariteye göre üzerine yazılır.
const BASE_CFG = {
  zlLength: 70, zlMult: 1.2,        // Zero-Lag Trend (AlgoAlpha varsayılanı)
  htfZlLength: 20,                  // üst-TF zero-lag (kısa — HTF veri derinliği sınırlı)
  atrPeriod: 14,
  stPeriod: 10, stMult: 3.0,        // SuperTrend
  adxMin: 0, adxDiGate: false,      // ADX kapısı VARSAYILAN KAPALI (araştırma: kripto/altında expectancy düşürür)
  adxStrong: 35,                    // yalnız konfluans katmanı + güven için
  emaFast: 8, emaMid: 21, emaSlow: 55, emaMedA: 21, emaMedB: 55,
  volPeriod: 20, volMult: 1.2,
  srsiRsiLen: 14, srsiStochLen: 14, srsiK: 3, srsiD: 3,
  swingLookback: 40, swingLeft: 3, swingRight: 3, swingBufATR: 0.25,
  minStopATR: 1.2, maxStopATR: 2.8, // stop mesafe bandı (forex'in 2.0-4.5'inden DAR)
  rr1: 1.5, rr2: 3.0,               // TP hedefleri (R katı)
  trailATR: 2.0,                    // iz-süren stop ATR mesafesi (chandelier)
  partialMode: 'runner',            // 'runner' = winner'lar koşar (backtest: partial/fixed'i yener)
  minScore: 4,                      // konfluans eşiği (0-8) — araştırma: 3-4 yeterli, 8 fazla
  pushConfidence: 60,
  ichiConv: 9, ichiBase: 26, ichiSpanB: 52, ichiDisp: 26,
};

function merge(over) { return Object.assign({}, BASE_CFG, over); }

const INSTRUMENTS = [
  {
    id: 'BTCUSD', name: 'Bitcoin', symbol: 'BTC/USD', short: 'BTC',
    source: 'crypto', dataSymbol: 'BTC', yahoo: 'BTC-USD',
    class: 'crypto', precision: 2, prefix: 'BTC', alwaysOpen: true,
    tvSymbol: 'BINANCE:BTCUSDT',
    cfg: merge({ zlMult: 1.2, minStopATR: 1.6, maxStopATR: 2.6, rr1: 2.0, rr2: 4.0 }),
  },
  {
    id: 'ETHUSD', name: 'Ethereum', symbol: 'ETH/USD', short: 'ETH',
    source: 'crypto', dataSymbol: 'ETH', yahoo: 'ETH-USD',
    class: 'crypto', precision: 2, prefix: 'ETH', alwaysOpen: true,
    tvSymbol: 'BINANCE:ETHUSDT',
    cfg: merge({ zlMult: 1.2, minStopATR: 1.8, maxStopATR: 2.8, rr1: 2.0, rr2: 4.0 }),
  },
  {
    id: 'XAUUSD', name: 'Ons Altın', symbol: 'XAU/USD', short: 'XAU',
    source: 'forex', dataSymbol: 'GC=F', yahoo: 'GC=F',
    class: 'metal', precision: 2, prefix: 'XAU', alwaysOpen: false,
    tvSymbol: 'OANDA:XAUUSD',
    cfg: merge({ zlMult: 1.0, minStopATR: 1.5, maxStopATR: 2.5, rr1: 2.0, rr2: 4.0 }),
  },
  {
    id: 'XAGUSD', name: 'Gümüş', symbol: 'XAG/USD', short: 'XAG',
    source: 'forex', dataSymbol: 'SI=F', yahoo: 'SI=F',
    class: 'metal', precision: 3, prefix: 'XAG', alwaysOpen: false,
    tvSymbol: 'OANDA:XAGUSD',
    cfg: merge({ zlMult: 1.1, minStopATR: 1.6, maxStopATR: 2.6, rr1: 2.0, rr2: 4.0 }),
  },
];

// v4 (kullanıcı isteği 2026-06-26): 1h + 4h + 8h + 1d hepsi aktif. Alt TF'ler isabeti
// düşürür ama sıklığı artırır; parite başına yön kilidi çelişkiyi önler.
const SIGNAL_TFS = ['1h', '4h', '8h', '1d'];

function getInstrument(id) { return INSTRUMENTS.find(i => i.id === id) || null; }

module.exports = { INSTRUMENTS, SIGNAL_TFS, TF_DEFS, BASE_CFG, getInstrument, merge };
