/**
 * Stratejı meta bilgileri — sinyal kartı ve rehber modal için tek kaynak.
 * Her bir strateji girişine, sinyalin ne anlama geldiğini, ne zaman geçerli
 * olduğunu ve giriş / çıkış kurallarını yazıyoruz.
 *
 * Kullanım:
 *   import { getStrategyMeta } from '@/lib/strategyMeta'
 *   const meta = getStrategyMeta(signal.strategy)
 *   meta.action       → 'AL' | 'SAT' | 'TUT'
 *   meta.label        → "RSI Aşırı Satım"
 *   meta.timeframe    → "1G" (default — backend timeframe vermiyorsa)
 *   meta.validity     → "1-3 gün"
 *   meta.entryRule    → giriş kuralı kısa metin
 *   meta.exitRule     → çıkış kuralı kısa metin
 *   meta.explanation  → uzun açıklama (InfoTooltip için)
 *   meta.formula      → matematiksel açıklama
 *
 * Risk yönetimi defaultları:
 *   • SL = girişin %3 altı (default)
 *   • TP = girişin %6 üstü (1:2 RR)
 *   • Custom değerler buildTradePlan() ile override edilebilir.
 */

const ACTION_BUY = 'AL'
const ACTION_SELL = 'SAT'
const ACTION_HOLD = 'TUT'

const STRATEGY_TABLE = {
  // === ALIM SİNYALLERİ ============================================
  'RSI Signal': {
    action: ACTION_BUY,
    label: 'RSI Aşırı Satım',
    timeframe: '1G',
    validity: '1-3 gün',
    summary: 'Hisse aşırı satım bölgesinde — alıcılar geri dönebilir.',
    entryRule: 'RSI 30\'un altına indiyse: kapanışı bekle, ardından alım yapılabilir. Limit emir = mevcut fiyat veya %0.3 altı.',
    exitRule: 'RSI 50-60\'a yükselince ya da fiyat %6 yükselince kâr al. RSI 30\'un altında kalmaya devam ederse trend zayıf olabilir, %3 altına stop koy.',
    explanation: 'RSI (Relative Strength Index), 0-100 arası bir momentum göstergesi. 30 altı "aşırı satım" — hisse kısa vadeli olarak çok satılmış. Genellikle teknik tepki gelir; ancak ana trend düşüşse, RSI düşüş trendinde de uzun süre 30 altında kalabilir. O yüzden bu sinyal kısa vadeli (1-3 gün) bir tepki alımı için kullanılır.',
    formula: 'RSI = 100 - (100 / (1 + RS))\nRS = 14 günlük ortalama kazanç / 14 günlük ortalama kayıp\n\nAlım sinyali: RSI < 30',
    rrRatio: 2.0,
  },
  'RSI Aşırı Satım': { ref: 'RSI Signal' },
  'RSI Asiri Satim': { ref: 'RSI Signal' },
  'rsi_signal': { ref: 'RSI Signal' },

  'MACD Crossover': {
    action: ACTION_BUY,
    label: 'MACD Pozitif Kesişim',
    timeframe: '1G',
    validity: '5-10 gün',
    summary: 'MACD sinyal çizgisini yukarı kesti — yeni yükseliş trendi başlıyor olabilir.',
    entryRule: 'Kesişim sonrası ilk gün açılışında alım. Histogram pozitif olmalı (yeşil çubuklar).',
    exitRule: 'MACD tekrar sinyal çizgisini aşağı keserse veya histogram negatife dönerse çık. %3 altına stop, %6 üstüne TP.',
    explanation: 'MACD (Moving Average Convergence Divergence) iki üstel hareketli ortalama farkını gösterir. Sinyal çizgisi MACD\'nin 9 günlük ortalamasıdır. MACD sinyali yukarı keserse "momentum yukarı dönüyor" demektir; orta vadeli (5-10 gün) yükseliş başlangıcı için güvenilir bir göstergedir. Yatay piyasalarda yanlış sinyal verebilir.',
    formula: 'MACD = EMA12 − EMA26\nSignal = EMA9(MACD)\nHistogram = MACD − Signal\n\nAlım: MACD > Signal ve Histogram > 0',
    rrRatio: 2.0,
  },
  'MACD Pozitif Kesisim': { ref: 'MACD Crossover' },
  'MACD Pozitif Kesişim': { ref: 'MACD Crossover' },
  'macd_crossover': { ref: 'MACD Crossover' },

  'EMA Crossover': {
    action: ACTION_BUY,
    label: 'EMA 5/21 Pozitif Kesişim',
    timeframe: '1G',
    validity: '5-15 gün',
    summary: 'Kısa EMA, uzun EMA\'yı yukarı kesti — trend dönüşü.',
    entryRule: 'EMA5 EMA21\'i yukarı kestiği gün veya ertesi gün alım. Hacim ortalamanın üzerindeyse sinyal güçlü.',
    exitRule: 'EMA5 EMA21\'in altına düşerse çık. Stop EMA21\'in %2 altı; TP risk:ödülü 1:2 olacak şekilde.',
    explanation: 'EMA (Exponential Moving Average — Üstel Hareketli Ortalama). Kısa vadeli EMA (5 gün) uzun vadeli EMA\'yı (21 gün) yukarı keserse "altın kesişim" denir; trend yukarı dönüş işareti. Yan piyasalarda sahte sinyaller olabilir; trend belirgin piyasalarda en güvenilirdir.',
    formula: 'EMA(N) = (Bugünkü Fiyat × K) + (Dünkü EMA × (1−K))\nK = 2 / (N+1)\n\nAlım: EMA5 > EMA21 ve fiyat > EMA21',
    rrRatio: 2.0,
  },
  'EMA34 Trend': { ref: 'EMA Crossover' },
  'ema_crossover': { ref: 'EMA Crossover' },

  'Bollinger Oversold': {
    action: ACTION_BUY,
    label: 'Bollinger Alt Bant Kırılımı',
    timeframe: '1G',
    validity: '1-5 gün',
    summary: 'Fiyat alt bandın altına indi — istatistiksel olarak ucuz.',
    entryRule: 'Fiyat alt bandın altında kapandıysa: ertesi gün açılışta alım. Hacim yüksekse sinyal güçlü.',
    exitRule: 'Fiyat orta banda (20 günlük ortalama) ulaşınca yarı pozisyon kapat, üst banda ulaşınca kalan kısmı kapat. Stop alt bandın %2 altı.',
    explanation: 'Bollinger Bandları, 20 günlük ortalamanın etrafına ±2 standart sapma çizilen banttır. Fiyat istatistiksel olarak %95 olasılıkla bu bant içinde kalır. Alt bandın altına inme = aşırı sapma; ortalamaya geri dönüş beklenir. Ancak güçlü düşüş trendinde fiyat bant boyunca yürüyebilir, dikkat.',
    formula: 'OrtaBant = SMA20\nÜstBant  = SMA20 + 2σ\nAltBant  = SMA20 − 2σ\n\nAlım: Kapanış < AltBant',
    rrRatio: 2.5,
  },
  'Bollinger Alt Bant': { ref: 'Bollinger Oversold' },
  'Bollinger Breakout': { ref: 'Bollinger Oversold' },
  'bollinger_breakout': { ref: 'Bollinger Oversold' },

  'Volume Spike': {
    action: ACTION_BUY,
    label: 'Hacim Patlaması',
    timeframe: '1G',
    validity: '1-3 gün',
    summary: 'Hacim 20 günlük ortalamanın 3 katından fazla — kurumsal ilgi var.',
    entryRule: 'Hacim patlaması yeşil mumla geldiyse alım. Direnç kırılımı varsa sinyal çok güçlü.',
    exitRule: 'Hacim normale döndüğünde çık. Stop son 3 günün dibi; TP %5-8 hedef.',
    explanation: 'Anormal hacim, kurumsal yatırımcıların pozisyona girdiğinin işaretidir. Hacim patlaması fiyat hareketini sürükler — yeşil mumla gelirse alım, kırmızı mumla gelirse satıcılar baskın. Yön mum rengiyle teyit edilmeli.',
    formula: 'AnaHacim = Bugünkü Hacim\nOrtHacim = SMA20(Hacim)\n\nAlım: AnaHacim > OrtHacim × 3 ve Kapanış > Açılış',
    rrRatio: 1.8,
  },
  'volume_spike': { ref: 'Volume Spike' },
  'Hacim Patlaması': { ref: 'Volume Spike' },

  'Support Bounce': {
    action: ACTION_BUY,
    label: 'Destek Sıçraması',
    timeframe: '1G',
    validity: '5-10 gün',
    summary: 'Fiyat destek seviyesinden yukarı tepki verdi.',
    entryRule: 'Destek seviyesinin %0.5 üstünde alım. Stop desteğin %1.5 altında.',
    exitRule: 'Bir sonraki dirence kadar tut. Direncin %1 altında çık.',
    explanation: 'Destek = fiyatın daha önce birkaç kez döndüğü seviye. Burada alıcılar baskın olur. Destekten sıçrama "tutuldu" demektir. Aynı destek 3+ kez test edildiyse zayıflar; tek seferlik test daha güvenilir.',
    formula: 'Destek = Son N günlük dip noktaları\nSıçrama: Kapanış > Destek × 1.005',
    rrRatio: 2.5,
  },
  'Destek Sıçraması': { ref: 'Support Bounce' },

  // === SATIM SİNYALLERİ ============================================
  'RSI Overbought': {
    action: ACTION_SELL,
    label: 'RSI Aşırı Alım',
    timeframe: '1G',
    validity: '1-3 gün',
    summary: 'Hisse aşırı alım bölgesinde — kâr alımı / kısa pozisyon düşünülebilir.',
    entryRule: 'RSI 70 üstünde + kapanış kırmızı mum: kâr al veya açığa sat. Stop son tepe + %2.',
    exitRule: 'RSI 50\'ye dönünce kapat veya ana destek kırılınca devam ettir.',
    explanation: 'RSI 70 üstü = aşırı alım bölgesi. Genellikle düzeltme gelir; ancak yeni yükseliş başlıyorsa RSI uzun süre 70+ kalabilir. Mevcut alıcılar için: kâr realizasyonu için iyi nokta. Yeni alım için: bekle.',
    formula: 'RSI > 70 → Aşırı alım\nÇıkış: RSI < 70 ve günlük kapanış kırmızı',
    rrRatio: 1.5,
  },
  'RSI Aşırı Alım': { ref: 'RSI Overbought' },

  'MACD Bearish': {
    action: ACTION_SELL,
    label: 'MACD Negatif Kesişim',
    timeframe: '1G',
    validity: '5-10 gün',
    summary: 'MACD sinyal çizgisini aşağı kesti — düşüş trendi başlıyor olabilir.',
    entryRule: 'Kesişim sonrası: pozisyondaysan kapat / kısa pozisyon aç. Hacim düşüşü teyit eder.',
    exitRule: 'MACD tekrar pozitif kesişim yapana kadar uzak dur veya kısa pozisyonu tut.',
    explanation: 'MACD\'nin sinyali aşağı kesmesi, momentumun negatife döndüğünün işareti. Yatay piyasalarda gürültü olabilir; trend belirgin piyasalarda güvenilir.',
    formula: 'Satım: MACD < Signal ve Histogram < 0',
    rrRatio: 2.0,
  },

  // === NÖTR / BEKLE ============================================
  'Neutral': {
    action: ACTION_HOLD,
    label: 'Nötr',
    timeframe: '1G',
    validity: 'Belirsiz',
    summary: 'Belirgin yön yok — pozisyon açma veya pozisyondaysan tut.',
    entryRule: 'Açık net sinyal yok. Mevcut pozisyon korunur, yeni pozisyon önerilmez.',
    exitRule: 'Trend belirleninceye kadar bekle.',
    explanation: 'Tüm göstergeler karışık sinyal veriyor veya zıt yönde çalışıyor. Bu durumda işlem yapmamak en iyi karar olabilir; "no trade" da bir karardır.',
    formula: 'Nötr: 5 göstergenin 3+ tanesi farklı yönde sinyal veriyor.',
    rrRatio: null,
  },
  'NÖTR': { ref: 'Neutral' },
  'NEUTRAL': { ref: 'Neutral' },
}

const FALLBACK_META = {
  action: ACTION_HOLD,
  label: 'Bilinmeyen Strateji',
  timeframe: '1G',
  validity: 'Belirsiz',
  summary: 'Bu strateji hakkında detaylı açıklama tanımlanmamış.',
  entryRule: 'Lütfen ilgili göstergenin teknik analizini grafikte kontrol edin.',
  exitRule: 'Risk yönetiminizi koruyun: stop %3, hedef %5-7 makul başlangıçtır.',
  explanation: 'Bu sinyal türü açıklamalar veritabanında bulunamadı. Strateji ismini Sinyal Rehberi\'nden kontrol edin.',
  formula: '',
  rrRatio: 2.0,
}

/**
 * Bir strateji adına karşılık gelen meta nesnesini döndürür.
 * Eşleşme bulunamazsa FALLBACK_META kullanılır.
 */
export function getStrategyMeta(strategy) {
  if (!strategy) return FALLBACK_META
  const direct = STRATEGY_TABLE[strategy]
  if (!direct) {
    // Case-insensitive ara
    const key = Object.keys(STRATEGY_TABLE).find(
      k => k.toLocaleLowerCase('tr-TR') === String(strategy).toLocaleLowerCase('tr-TR')
    )
    if (key) return resolveRef(STRATEGY_TABLE[key])
    return { ...FALLBACK_META, label: strategy }
  }
  return resolveRef(direct)
}

function resolveRef(meta) {
  if (meta?.ref) return STRATEGY_TABLE[meta.ref] || FALLBACK_META
  return meta
}

/**
 * Bir sinyal nesnesi (price, strategy, type vs) için işlem planı üretir.
 * Backend explicit entry/SL/TP göndermediyse default risk yönetimiyle dolduruyoruz.
 */
export function buildTradePlan(signal, customRR) {
  const meta = getStrategyMeta(signal?.strategy)
  const price = Number(signal?.currentPrice ?? signal?.detectionPrice ?? signal?.price ?? 0)
  if (!price) return { meta, entry: null, sl: null, tp: null, rrRatio: meta.rrRatio || 2 }

  const rr = customRR ?? meta.rrRatio ?? 2

  // Direct backend values override defaults
  const explicitEntry = Number(signal?.entry || signal?.entryPrice || 0)
  const explicitStop  = Number(signal?.stop  || signal?.stopLoss  || 0)
  const explicitTP    = Number(signal?.target || signal?.takeProfit || 0)

  const entry = explicitEntry || price
  const isBuy = meta.action === 'AL'

  let sl, tp
  if (explicitStop && explicitTP) {
    sl = explicitStop
    tp = explicitTP
  } else {
    // Default: %3 risk, RR çarpanı kadar hedef
    const riskPct = 0.03
    const risk = entry * riskPct
    if (isBuy) {
      sl = entry - risk
      tp = entry + risk * rr
    } else {
      sl = entry + risk
      tp = entry - risk * rr
    }
  }

  const rrCalc = sl && tp && entry ? Math.abs((tp - entry) / (entry - sl)) : rr

  return {
    meta,
    entry,
    sl,
    tp,
    rrRatio: Number(rrCalc.toFixed(2)),
    isBuy,
    isExplicit: !!(explicitEntry && explicitStop && explicitTP),
  }
}

/**
 * Relative time formatter ("3 dk önce", "2 saat önce", vb)
 */
export function formatRelativeTime(date) {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return '—'
  const diffMs = Date.now() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 30) return 'şimdi'
  if (diffSec < 60) return `${diffSec} sn önce`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} dk önce`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} sa önce`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 30) return `${diffD} gün önce`
  return d.toLocaleDateString('tr-TR')
}

export const SIGNAL_ACTIONS = { BUY: ACTION_BUY, SELL: ACTION_SELL, HOLD: ACTION_HOLD }
