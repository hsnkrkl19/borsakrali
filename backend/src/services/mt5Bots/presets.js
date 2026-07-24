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

/**
 * KLASİK STRATEJİ BOTLARI (2026-07-22) — 9-ajanlı derin internet araştırması +
 * sentezle doğrulanmış sistemlerin backend portu (strategyEngines.js).
 *
 * Araştırma hükümleri (sentez raporu):
 *  • Turtle/Donchian: EN GÜÇLÜ kanıt (140 yıl akademik trend-takip + altın 28y
 *    PF 1.85) — ama FX majörlerinde kenar ÖLDÜ → FX evren dışı.
 *  • TSMOM: en sağlam akademik dayanak (JFE 2012); güç ÇEŞİTLENDİRMEDEN gelir
 *    → 15 enstrümanın tamamı, yalnız 1d, kripto long-only.
 *  • TTM Squeeze: orta-güçlü kanıt (4h PF 1.7-2.3 kripto) — tamamlayıcı bot.
 *  • RSI-2: endekslerde 29 yıl kanıt (ES PF 2.15); altın/kripto/FX'te NEGATİF
 *    kanıt → evren SADECE SPX500+NAS100, genişletme yasak.
 *  • Holy Grail: kamu kanıtı YOK → PAPER başlar (catalog mt5Tradeable:false).
 *  • London Breakout: spread sonrası kenar ~sıfır → yalnız GÖLGE deney (GBPUSD
 *    tek, mt5Tradeable:false, terfi kriteri: ≥60 seans PF≥1.2).
 *  • Alligator + Heikin-Ashi: AYRI BOT REDDEDİLDİ (5. korelasyonlu trend botu =
 *    yığılma; kanıt zayıf) — motorları evolver varyant havuzunda kanıt-kapılı.
 *
 * magic 5740-5748 (5700-5799 katalog bloğunun devamı; custom botlar 5800+).
 * 5746/5747 bilinçli BOŞ bırakıldı (reddedilen alligator/heikin'e ayrılmıştı).
 */
const STRATEGY_PRESETS = [
  {
    id: 'mt5-turtle', name: 'Turtle Kanal Kırılımı', magic: 5740, kind: 'strategy',
    tfs: ['4h', '1d'], strategyId: 'turtle', params: { fast: 20, slow: 55 },
    // Dennis/Eckhardt: 20/55-bar Donchian kırılımı, 2N stop, TP 6N tavanı,
    // EMA200-yön/ADX≥15 çürüme filtresi. FX kapalı (akademik: FX trend kenarı öldü).
    instruments: ['XAUUSD', 'BTCUSD', 'ETHUSD', 'NAS100', 'SPX500'],
  },
  {
    id: 'mt5-squeeze', name: 'TTM Squeeze Patlaması', magic: 5741, kind: 'strategy',
    tfs: ['4h', '1d'], strategyId: 'squeeze', params: { minBars: 6 },
    // John Carter TTM: ≥6 bar BB⊂KC sıkışması, momentum yönünde+yükselirken
    // release, SMA50 taraf filtresi. FX düşük öncelik → evren dışı.
    // XAGUSD 2026-07-24'te kullanıcı talebiyle ÇIKARILDI (gümüş işlemleri yasak).
    instruments: ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'NAS100', 'SPX500', 'XAUUSD'],
  },
  {
    id: 'mt5-rsi2', name: 'RSI-2 Geri Dönüşü', magic: 5742, kind: 'strategy',
    tfs: ['4h', '1d'], strategyId: 'rsi2', params: {},
    // Connors: SADECE endeksler (araştırma: altın/kripto/FX'te kanıt NEGATİF).
    // Long-only varsayılan; MT5_RSI2_SHORTS=1 ile short açılır.
    instruments: ['SPX500', 'NAS100'],
  },
  {
    id: 'mt5-london', name: 'London Breakout (Gölge)', magic: 5743, kind: 'strategy',
    tfs: ['15m'], strategyId: 'london', params: {},
    // ⚠️ GÖLGE DENEY: catalog'da mt5Tradeable:false → MT5'e ASLA bağlanmaz.
    // Terfi: ≥60 seans paper PF≥1.2 + maxDD≤%5 (araştırma kriteri).
    instruments: ['GBPUSD'],
  },
  {
    id: 'mt5-tsmom', name: 'Zaman Serisi Momentum', magic: 5744, kind: 'strategy',
    tfs: ['1d'], strategyId: 'tsmom', params: { lookback: 60 },
    // Moskowitz-Ooi-Pedersen: 60/120/252-bar oyları ≥2/3; 15 enstrümanın TAMAMI
    // (çeşitlendirme = kenarın kendisi); kripto long-only; vol-güç kapısı.
  },
  {
    id: 'mt5-holygrail', name: 'ADX Pullback (Holy Grail)', magic: 5745, kind: 'strategy',
    tfs: ['1h', '4h'], strategyId: 'holygrail', params: { adxMin: 30 },
    // ⚠️ PAPER BAŞLAR (catalog mt5Tradeable:false): kamu backtest kanıtı yok;
    // yarışta kendini kanıtlayınca (PF≥1.2, ≥50 işlem) bayrak kaldırılır.
    instruments: ['XAUUSD', 'NAS100', 'SPX500', 'BTCUSD', 'ETHUSD'],
  },
  {
    id: 'mt5-evolver', name: 'Strateji Evrimi', magic: 5748, kind: 'evolver',
    tfs: ['1h', '4h'],
    // STRATEJİ GELİŞTİREN bot: 14 varyantı (alligator/heikin dahil) her hücrede
    // walk-forward yarıştırır; yalnız kanıtlı şampiyon (PF≥1.25, ≥6 işlem,
    // netR>0) sinyal verir. Kanıt yoksa hücre SUSAR.
  },
];

/**
 * BK XAU RUNNER (2026-07-23) — kullanıcının "BorsaKrali XAU MT5 Bot Paketi
 * v1.0" MQL5 EA çiftinin (BK_XAU_Scalp M5 + BK_XAU_Swing M30) backend portu.
 * Tek yarışmacı bot (Bot 38); motor services/mt5Bots/bkXau.js — kendi çoklu-TF
 * verisini kendisi çeker (5m+30m+8h), bu yüzden kind:'bkxau' ile ayrı dispatch.
 * Runner kâr yönetimi köprünün tek-TP modelinde TP1=2R / TP2=4R'ye çevrildi
 * (köprü min_rr=1.5 kapısı 1.5R'yi tam sınırda reddedebiliyordu).
 * Kill: BK_XAU_DISABLED=1 (aile kill'i MT5_BOTS_DISABLED ayrıca geçerli).
 */
const BKXAU_PRESETS = [
  {
    id: 'bk-xau', name: 'BK XAU Runner', magic: 5750, kind: 'bkxau',
    tfs: ['5m', '30m'],
    instruments: ['XAUUSD'],
  },
];

// Gösterge tabanlı presetlere kind ekle (varsayılan)
for (const p of PRESETS) p.kind = p.kind || 'indicator';

const ALL_PRESETS = [...PRESETS, ...ICT_PRESETS, ...STRATEGY_PRESETS, ...BKXAU_PRESETS];
const BY_ID = new Map(ALL_PRESETS.map((p) => [p.id, p]));

module.exports = { PRESETS: ALL_PRESETS, INDICATOR_PRESETS: PRESETS, ICT_PRESETS, STRATEGY_PRESETS, BKXAU_PRESETS, BY_ID, getPreset: (id) => BY_ID.get(id) || null };
