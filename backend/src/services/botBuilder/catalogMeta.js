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
};

function metaFor(id) { return META[id] || { strategies: [], timeframes: [] }; }

module.exports = { META, metaFor };
