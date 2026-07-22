'use strict';

/**
 * 15 yarışan botun panel metadatası — hangi stratejileri kullanıyor + hangi
 * zaman dilimlerini seçebiliriz. Kullanıcı bu TF listesinden çoklu seçim yapar;
 * seçim köprü feed'inde FİLTRE olarak uygulanır (boş = tüm TF'ler).
 */

const META = {
  'forex-signals': { strategies: ['genelTarama', 'EMA34', 'TEMA34', 'SNR', 'SMC'], timeframes: ['15m', '1h', '4h', '1d'] },
  'pro-robot': { strategies: ['11 teknik füzyon', '≥3/4 TF konfluans', 'backtest kalite kapısı'], timeframes: ['15m', '1h', '4h', '1d'] },
  'gold-signals': { strategies: ['haftalık yön', 'çoklu-TF top-down', 'S/R + fraktal kırılım'], timeframes: ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] },
  'beast-signals': { strategies: ['Zero-Lag', 'Ichimoku', 'Scalper füzyon'], timeframes: ['4h', '1d'] },
  'mt5-scanner': { strategies: ['gün-içi momentum', 'risk bütçesi', 'yön kilidi'], timeframes: ['1m', '5m', '15m', '1h', '4h'] },
  'crypto-signals': { strategies: ['SPOT', 'FUT_LONG', 'FUT_SHORT'], timeframes: ['15m'] },
  'mtf-confluence': { strategies: ['TF-generic scorer', 'confluence', 'Bayesian winProb'], timeframes: ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] },
  'bist-signals': { strategies: ['16 koşul skor (0-100)', 'LONG≥75 top10'], timeframes: ['1d'] },
  crossover: { strategies: ['EMA34/TEMA34 kesişim'], timeframes: ['1d'] },
  tema34: { strategies: ['TEMA34 giriş/çıkış bölgesi'], timeframes: ['4h', '1d'] },
  'bist-buy-scanner': { strategies: ['avgScore≥80', 'ADX/RSI', 'likidite ≥200M'], timeframes: ['1d'] },
  'wave-scan': { strategies: ['Elliott', 'SNR', 'mum + fraktal'], timeframes: ['4h', '1d'] },
  'nr7-shadow': { strategies: ['NR7 sıkışma-kırılım'], timeframes: ['1d'] },
  'ict-fvg': { strategies: ['4h yön', '1h yapı', '15m FVG', '5m teyit'], timeframes: ['5m', '15m', '1h', '4h'] },
  'ict-smc': { strategies: ['22 ICT/SMC alt stratejisi', 'yapı + likidite + bölge'], timeframes: ['15m', '1h', '4h', '1d'] },
  // MT5 bot ailesi (services/mt5Bots)
  'mt5-trend': { strategies: ['EMA', 'ADX+DI', 'Supertrend', 'hepsi aynı yön'], timeframes: ['4h', '1d'] },
  'mt5-momentum': { strategies: ['MACD', 'RSI', 'ADX', 'çoğunluk'], timeframes: ['1h', '4h'] },
  'mt5-reversion': { strategies: ['Bollinger', 'Stochastic', 'RSI'], timeframes: ['1h', '4h'] },
  'mt5-cloud': { strategies: ['Ichimoku bulut', 'EMA', 'ADX'], timeframes: ['4h', '1d'] },
  'ict-2022': { strategies: ['sweep → MSS → FVG retest'], timeframes: ['15m', '1h'] },
  'ict-silver-bullet': { strategies: ['killzone FVG (Londra/NY)'], timeframes: ['15m'] },
  'ict-unicorn': { strategies: ['Breaker + FVG kesişimi'], timeframes: ['15m', '1h'] },
  'ict-ote': { strategies: ['%62-79 optimal giriş penceresi'], timeframes: ['1h', '4h'] },
  'ict-cisd': { strategies: ['teslimat değişimi dönüşü'], timeframes: ['15m', '1h'] },
  'ict-sweep': { strategies: ['likidite süpürme dönüşü'], timeframes: ['15m', '1h'] },
  'ict-blocks': { strategies: ['OB retest', 'Breaker retest'], timeframes: ['1h', '4h'] },
  'ict-structure': { strategies: ['CHoCH+', 'BOS devamı'], timeframes: ['1h', '4h'] },
  'combo-trend-ict': { strategies: ['EMA+ADX+Supertrend', 'ICT teyidi'], timeframes: ['1h', '4h'] },
  'combo-momentum-ict': { strategies: ['MACD+RSI+ADX', 'ICT teyidi'], timeframes: ['1h', '4h'] },
  // Klasik strateji ailesi (services/mt5Bots/strategyEngines) — derin araştırmayla
  // kanıtlanmış sistemler (alligator/heikin ayrı bot olarak reddedildi → evolver'da)
  'mt5-turtle': { strategies: ['Donchian 20/55 kırılım', '2N ATR stop', 'EMA200/ADX filtre'], timeframes: ['4h', '1d'] },
  'mt5-squeeze': { strategies: ['≥6 bar BB⊂KC sıkışma', 'momentum release', 'SMA50 taraf'], timeframes: ['4h', '1d'] },
  'mt5-rsi2': { strategies: ['SMA200 filtre', 'RSI(2) ekstrem dönüş', 'yalnız endeks'], timeframes: ['4h', '1d'] },
  'mt5-london': { strategies: ['GÖLGE deney', 'Asya range → Londra 07-11 UTC'], timeframes: ['15m'] },
  'mt5-tsmom': { strategies: ['60/120/252-bar oylar', 'EMA10/40 zamanlama', 'kripto long-only'], timeframes: ['1d'] },
  'mt5-holygrail': { strategies: ['PAPER başlar', 'ADX>30 yükselen', 'EMA20 pullback'], timeframes: ['1h', '4h'] },
  'mt5-evolver': { strategies: ['14 varyant walk-forward', 'hücre şampiyonu', 'PF≥1.25 kapısı'], timeframes: ['1h', '4h'] },
};

function metaFor(id) { return META[id] || { strategies: [], timeframes: [] }; }

module.exports = { META, metaFor };
