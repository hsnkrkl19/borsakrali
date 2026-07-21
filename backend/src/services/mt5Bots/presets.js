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

/**
 * ICT/SMC BOTLARI — kullanıcının Pine motoru (ICT_SMC_TekDosya) backend portu
 * (services/ictSmc, 23 strateji) MT5 evreninde çalıştırılır.
 *
 * kind:'ict'   → strateji SADE çalışır (her güçlü ICT kurulumu kendi botu; hangisi
 *                gerçekten kazanıyor ayrı ayrı ölçülsün).
 * kind:'combo' → indikatör oyu + ICT TEYİDİ birlikte (customBotEngine'in ictStrategy
 *                kancası): indikatörler yön verir, ICT kurulumu aynı yönde
 *                değilse sinyal iptal → en seçici, en yüksek kaliteli katman.
 *
 * magic 5730+ : custom botlar 5720'den yukarı büyüdüğü için ayrı blok.
 */
const ICT_PRESETS = [
  // ── SADE ICT stratejileri ──────────────────────────────────────────────────
  {
    id: 'ict-2022', name: 'ICT 2022 Modeli', magic: 5730, kind: 'ict',
    tfs: ['15m', '1h'], ictStrategies: ['ict2022'],
    // Pine S01: sweep → MSS → FVG retest; premium/discount kuralı gömülü.
  },
  {
    id: 'ict-silver-bullet', name: 'ICT Silver Bullet', magic: 5731, kind: 'ict',
    tfs: ['15m'], ictStrategies: ['silver_bullet'],
    // Pine S02: yalnız killzone pencerelerinde (Londra 03-04 / NY 10-11).
  },
  {
    id: 'ict-unicorn', name: 'ICT Unicorn (Breaker+FVG)', magic: 5732, kind: 'ict',
    tfs: ['15m', '1h'], ictStrategies: ['unicorn'],
    // Pine S03: Breaker ile MSS-FVG kesişimi — dar bölge, çifte teyit, yüksek R:R.
  },
  {
    id: 'ict-ote', name: 'ICT OTE (Optimal Giriş)', magic: 5733, kind: 'ict',
    tfs: ['1h', '4h'], ictStrategies: ['ote'],
    // Pine S15: trend bacağının %62-79 geri çekilme penceresi.
  },
  {
    id: 'ict-cisd', name: 'ICT CISD Dönüşü', magic: 5734, kind: 'ict',
    tfs: ['15m', '1h'], ictStrategies: ['cisd'],
    // Pine S11: teslimat değişimi — ekstremi yapan mum serisinin ilk açılışı kırılır.
  },
  {
    id: 'ict-sweep', name: 'ICT Likidite Süpürme', magic: 5735, kind: 'ict',
    tfs: ['15m', '1h'], ictStrategies: ['sweep_reversal', 'grab_reversal'],
    // Pine S09+S10: stop avı sonrası dönüş.
  },
  {
    id: 'ict-blocks', name: 'ICT OB / Breaker Retest', magic: 5736, kind: 'ict',
    tfs: ['1h', '4h'], ictStrategies: ['ob_retest', 'breaker_retest'],
    // Pine S04+S05: kurumsal emir bölgesi ve taraf değiştirmiş OB retesti.
  },
  {
    id: 'ict-structure', name: 'ICT Yapı (CHoCH/BOS)', magic: 5737, kind: 'ict',
    tfs: ['1h', '4h'], ictStrategies: ['choch_plus', 'bos_continuation'],
    // Pine S12+S14: trend devamı + güçlü karakter değişimi.
  },

  // ── BİRLEŞİK: indikatör + ICT teyidi (en seçici katman) ────────────────────
  {
    id: 'combo-trend-ict', name: 'Trend + ICT Teyidi', magic: 5738, kind: 'combo',
    tfs: ['1h', '4h'],
    def: { indicators: ['ema', 'adx', 'supertrend'], logic: 'all', atrSlMult: 1.8, atrTpMult: 3.2 },
    ictStrategies: ['ict2022', 'unicorn', 'bos_continuation', 'ob_retest'],
  },
  {
    id: 'combo-momentum-ict', name: 'Momentum + ICT Teyidi', magic: 5739, kind: 'combo',
    tfs: ['1h', '4h'],
    def: { indicators: ['macd', 'rsi', 'adx'], logic: 'majority', atrSlMult: 1.6, atrTpMult: 2.9 },
    ictStrategies: ['cisd', 'choch_plus', 'sweep_reversal', 'fvg_retest'],
  },
];

// Gösterge tabanlı presetlere kind ekle (varsayılan)
for (const p of PRESETS) p.kind = p.kind || 'indicator';

const ALL_PRESETS = [...PRESETS, ...ICT_PRESETS];
const BY_ID = new Map(ALL_PRESETS.map((p) => [p.id, p]));

module.exports = { PRESETS: ALL_PRESETS, INDICATOR_PRESETS: PRESETS, ICT_PRESETS, BY_ID, getPreset: (id) => BY_ID.get(id) || null };
