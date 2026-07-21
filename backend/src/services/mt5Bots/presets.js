'use strict';

/**
 * MT5 bot ön-ayarları — YALNIZ MT5/FTMO'da işlem görebilen 15 enstrüman üzerinde
 * çalışan botlar (BIST hisseleri ve egzotik altcoin YOK; hepsi köprüde açılabilir).
 *
 * Kullanıcı isteği (2026-07-21): "mt5 özelinde pariteleri sorgulayan veya onlara
 * açan 10-15 bot istiyorum" — BIST botları sitede kalır, MT5 yarışına bunlar girer.
 *
 * Tasarım kararları (9-ajanlı sinyal-kalitesi analizinin bulgularına göre):
 *  • Yüksek TF (1h/4h/1d) — gün-içi 5m/15m gürültüsü ve aşırı-işlem kaynağı elendi.
 *  • R:R ≥ 1.5 (atrTpMult / atrSlMult) — eski botların ~1.0-1.46 RR'si yapısal
 *    negatif beklenti üretiyordu; burada taban geniş tutuldu.
 *  • Kapalı bar — forming (yarım) mum kullanılmaz, sinyal her turda oynamaz.
 *  • Stabil signalId (enstrüman:preset:tf:barZamanı) — competition parmak-izi
 *    doğrudan bunu kullanır → mum başına TEK pozisyon, yeniden-açılma çığı yok.
 */

const PRESETS = [
  {
    id: 'mt5-trend',
    name: 'MT5 Trend Takip',
    magic: 5716,
    tfs: ['4h', '1d'],
    // EMA + ADX(DI kapılı) + Supertrend hepsi aynı yönde → güçlü trend devamı
    def: { indicators: ['ema', 'adx', 'supertrend'], logic: 'all', atrSlMult: 1.8, atrTpMult: 3.2 },
  },
  {
    id: 'mt5-momentum',
    name: 'MT5 Momentum',
    magic: 5717,
    tfs: ['1h', '4h'],
    // MACD + RSI + ADX çoğunluk → momentum dönüşleri (trendden biraz daha erken)
    def: { indicators: ['macd', 'rsi', 'adx'], logic: 'majority', atrSlMult: 1.5, atrTpMult: 2.8 },
  },
  {
    id: 'mt5-reversion',
    name: 'MT5 Aşırı Bölge Dönüşü',
    magic: 5718,
    tfs: ['1h', '4h'],
    // Bollinger bandı + Stochastic + RSI hepsi → aşırı alım/satımdan dönüş
    def: { indicators: ['bollinger', 'stoch', 'rsi'], logic: 'all', atrSlMult: 1.5, atrTpMult: 2.5 },
  },
  {
    id: 'mt5-cloud',
    name: 'MT5 Ichimoku Bulut',
    magic: 5719,
    tfs: ['4h', '1d'],
    // Ichimoku bulut + EMA + ADX → yapısal trend teyidi (en seçici)
    def: { indicators: ['ichimoku', 'ema', 'adx'], logic: 'all', atrSlMult: 2.0, atrTpMult: 3.5 },
  },
];

const BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

module.exports = { PRESETS, BY_ID, getPreset: (id) => BY_ID.get(id) || null };
