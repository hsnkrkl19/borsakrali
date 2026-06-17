// ============================================================================
// HİSSE YARIŞI — Oyun verisi & ekonomi
// ----------------------------------------------------------------------------
// "Hill Climb" tarzı fizik oyunu. Pist = seçilen BIST hissesinin fiyat
// grafiği. Araç sürerek BorsaPara (BP) kazanılır; BP ile araç/yükseltme
// satın alınır ve yeni hisseler (pistler) açılır.
//
// Bu dosya SAF veri + saf fonksiyonlardan oluşur (yan etkisi olan tek şey
// localStorage save/load). Fizik motoru RacingEngine.js'te.
// ============================================================================

// --- Kalıcı kayıt anahtarı ---
export const SAVE_KEY = 'bk-hisse-yarisi-v1'

// ----------------------------------------------------------------------------
// ARAÇLAR
// ----------------------------------------------------------------------------
// Birimler "dünya birimi" / saniye. Fizik motoru bu temel istatistikleri
// yükseltme seviyeleriyle çarpıp efektif değer üretir.
//   enginePower : sürüş kuvveti (ivme)
//   mass        : kütle (ağır = stabil ama yavaş tırmanır)
//   grip        : lastik tutuşu (traction katsayısı)
//   suspK/Damp  : süspansiyon yayı / sönümleme
//   fuelMax     : depo kapasitesi
//   topSpeed    : yumuşak hız tavanı
//   airControl  : havadayken dönüş torku
//   wheelBase   : aks açıklığı (görsel + denge)
//   wheelR      : teker yarıçapı
//   bodyW/bodyH : gövde boyutu (görsel)
// ----------------------------------------------------------------------------
export const VEHICLES = {
  hatchback: {
    id: 'hatchback', name: 'Şehir Arabası', emoji: '🚗', price: 0, free: true,
    desc: 'Dengeli başlangıç aracı. Her piste uygun.',
    enginePower: 2400, mass: 1.0, grip: 1.0, suspK: 240, suspDamp: 26,
    fuelMax: 100, topSpeed: 760, airControl: 9, wheelBase: 78, wheelR: 24,
    bodyW: 116, bodyH: 40, color: '#10b981', accent: '#065f46',
  },
  motorcycle: {
    id: 'motorcycle', name: 'Motosiklet', emoji: '🏍️', price: 0, free: true,
    desc: 'Hafif ve hızlı. Tutuşu zayıf, kolay takla atar — usta sürücü işi.',
    enginePower: 2750, mass: 0.62, grip: 0.82, suspK: 200, suspDamp: 20,
    fuelMax: 78, topSpeed: 900, airControl: 14, wheelBase: 70, wheelR: 22,
    bodyW: 92, bodyH: 26, color: '#f59e0b', accent: '#92400e', bike: true,
  },
  jeep: {
    id: 'jeep', name: '4x4 Jip', emoji: '🚙', price: 4200,
    desc: 'Yüksek tutuş ve tırmanış. Sarp/oynak hisseler için ideal.',
    enginePower: 3000, mass: 1.35, grip: 1.28, suspK: 320, suspDamp: 34,
    fuelMax: 120, topSpeed: 700, airControl: 8, wheelBase: 86, wheelR: 28,
    bodyW: 124, bodyH: 46, color: '#0ea5e9', accent: '#075985',
  },
  sports: {
    id: 'sports', name: 'Spor Araba', emoji: '🏎️', price: 12000,
    desc: 'Müthiş hız, zayıf tutuş. Düz/yükseliş trendli hisselerde uçar.',
    enginePower: 3400, mass: 0.9, grip: 0.92, suspK: 260, suspDamp: 24,
    fuelMax: 105, topSpeed: 1180, airControl: 10, wheelBase: 92, wheelR: 22,
    bodyW: 132, bodyH: 34, color: '#ef4444', accent: '#7f1d1d',
  },
  pickup: {
    id: 'pickup', name: 'Pikap', emoji: '🛻', price: 9000,
    desc: 'Güçlü motor, ağır gövde. Tork canavarı.',
    enginePower: 3300, mass: 1.5, grip: 1.18, suspK: 300, suspDamp: 32,
    fuelMax: 135, topSpeed: 720, airControl: 7, wheelBase: 92, wheelR: 27,
    bodyW: 134, bodyH: 44, color: '#8b5cf6', accent: '#4c1d95',
  },
  monster: {
    id: 'monster', name: 'Canavar Kamyon', emoji: '🚚', price: 26000,
    desc: 'Devasa tekerler. Neredeyse her tepeyi ezer geçer.',
    enginePower: 3800, mass: 1.7, grip: 1.4, suspK: 360, suspDamp: 38,
    fuelMax: 150, topSpeed: 760, airControl: 9, wheelBase: 104, wheelR: 38,
    bodyW: 142, bodyH: 50, color: '#22c55e', accent: '#14532d',
  },
  tractor: {
    id: 'tractor', name: 'Traktör', emoji: '🚜', price: 18000,
    desc: 'Yavaş ama durdurulamaz tork ve tutuş. Asla takılmaz.',
    enginePower: 3600, mass: 1.6, grip: 1.55, suspK: 330, suspDamp: 40,
    fuelMax: 160, topSpeed: 560, airControl: 6, wheelBase: 96, wheelR: 34,
    bodyW: 120, bodyH: 48, color: '#84cc16', accent: '#3f6212',
  },
  tank: {
    id: 'tank', name: 'Tank', emoji: '🛡️', price: 48000,
    desc: 'Ultra ağır, devrilmez. Her şeyi yarıp geçer.',
    enginePower: 4200, mass: 2.4, grip: 1.7, suspK: 420, suspDamp: 48,
    fuelMax: 190, topSpeed: 600, airControl: 5, wheelBase: 112, wheelR: 30,
    bodyW: 156, bodyH: 52, color: '#64748b', accent: '#1e293b',
  },
  rocket: {
    id: 'rocket', name: 'Roketli Araba', emoji: '🚀', price: 90000,
    desc: 'Son sınır. Akıl almaz hız ve ivme — sadece ustalar için.',
    enginePower: 4800, mass: 0.85, grip: 1.05, suspK: 300, suspDamp: 28,
    fuelMax: 130, topSpeed: 1600, airControl: 13, wheelBase: 100, wheelR: 24,
    bodyW: 140, bodyH: 34, color: '#ec4899', accent: '#831843',
  },
}

export const VEHICLE_ORDER = [
  'hatchback', 'motorcycle', 'jeep', 'pickup', 'sports', 'monster', 'tractor', 'tank', 'rocket',
]

// ----------------------------------------------------------------------------
// YÜKSELTMELER — her araç için ayrı seviye tutulur (bol içerik / uzun ilerleme)
// ----------------------------------------------------------------------------
export const UPGRADES = [
  { key: 'engine',     name: 'Motor',        emoji: '⚙️', desc: 'Daha fazla güç ve ivme.',            baseCost: 180, growth: 1.42, max: 20 },
  { key: 'tires',      name: 'Lastik',       emoji: '🛞', desc: 'Daha iyi tutuş, az patinaj.',         baseCost: 150, growth: 1.40, max: 20 },
  { key: 'suspension', name: 'Süspansiyon',  emoji: '🔩', desc: 'Yumuşak iniş, az takla.',             baseCost: 160, growth: 1.41, max: 20 },
  { key: 'gearbox',    name: 'Şanzıman',     emoji: '🔧', desc: 'Daha yüksek son hız.',                baseCost: 170, growth: 1.43, max: 20 },
  { key: 'fuel',       name: 'Yakıt Deposu', emoji: '⛽', desc: 'Daha uzun mesafe, daha çok kazanç.',  baseCost: 200, growth: 1.38, max: 20 },
  { key: 'aero',       name: 'Aerodinamik',  emoji: '🪽', desc: 'Havada kontrol + denge.',             baseCost: 190, growth: 1.40, max: 20 },
]

// Yükseltme seviyesinin maliyeti (sonraki seviyeye geçiş)
export function upgradeCost(upg, level) {
  return Math.round(upg.baseCost * Math.pow(upg.growth, level) / 10) * 10
}

// ----------------------------------------------------------------------------
// EFEKTİF ARAÇ İSTATİSTİĞİ — temel stat × yükseltme seviyeleri
// ----------------------------------------------------------------------------
export function effectiveStats(vehicleId, upgradesForVehicle = {}) {
  const base = VEHICLES[vehicleId] || VEHICLES.hatchback
  const lv = (k) => upgradesForVehicle[k] || 0
  const eng = lv('engine'), tir = lv('tires'), sus = lv('suspension')
  const gear = lv('gearbox'), fuel = lv('fuel'), aero = lv('aero')

  return {
    ...base,
    enginePower: base.enginePower * (1 + 0.10 * eng),
    grip:        base.grip * (1 + 0.07 * tir),
    suspK:       base.suspK * (1 + 0.06 * sus),
    suspDamp:    base.suspDamp * (1 + 0.05 * sus),
    topSpeed:    base.topSpeed * (1 + 0.035 * eng + 0.06 * gear),
    fuelMax:     base.fuelMax * (1 + 0.16 * fuel),
    airControl:  base.airControl * (1 + 0.09 * aero),
    stability:   1 + 0.07 * aero,   // havadaki açısal sönümleme
    landing:     1 + 0.06 * sus,    // çarpma toleransı (boyun kırılma eşiği)
    mass:        base.mass,
  }
}

// ----------------------------------------------------------------------------
// HİSSE KATALOĞU & FİYATLANDIRMA
// ----------------------------------------------------------------------------
// BIST30 ücretsiz. Diğerleri kademeli ücretli. Kullanıcı katalogda olmayan
// herhangi bir sembolü de arayıp açabilir (varsayılan: "other" kademesi).
export const BIST30 = [
  { symbol: 'AKBNK', name: 'Akbank', sector: 'Bankacılık' },
  { symbol: 'ARCLK', name: 'Arçelik', sector: 'Beyaz Eşya' },
  { symbol: 'ASELS', name: 'Aselsan', sector: 'Savunma' },
  { symbol: 'BIMAS', name: 'BİM', sector: 'Perakende' },
  { symbol: 'EKGYO', name: 'Emlak Konut GYO', sector: 'GYO' },
  { symbol: 'EREGL', name: 'Ereğli Demir Çelik', sector: 'Demir Çelik' },
  { symbol: 'FROTO', name: 'Ford Otosan', sector: 'Otomotiv' },
  { symbol: 'GARAN', name: 'Garanti BBVA', sector: 'Bankacılık' },
  { symbol: 'GUBRF', name: 'Gübre Fabrikaları', sector: 'Kimya' },
  { symbol: 'HEKTS', name: 'Hektaş', sector: 'Kimya' },
  { symbol: 'ISCTR', name: 'İş Bankası', sector: 'Bankacılık' },
  { symbol: 'KCHOL', name: 'Koç Holding', sector: 'Holding' },
  { symbol: 'KOZAL', name: 'Koza Altın', sector: 'Madencilik' },
  { symbol: 'KRDMD', name: 'Kardemir', sector: 'Demir Çelik' },
  { symbol: 'ODAS', name: 'Odaş Elektrik', sector: 'Enerji' },
  { symbol: 'PETKM', name: 'Petkim', sector: 'Petrokimya' },
  { symbol: 'PGSUS', name: 'Pegasus', sector: 'Havacılık' },
  { symbol: 'SAHOL', name: 'Sabancı Holding', sector: 'Holding' },
  { symbol: 'SASA', name: 'SASA Polyester', sector: 'Kimya' },
  { symbol: 'SISE', name: 'Şişecam', sector: 'Cam' },
  { symbol: 'TAVHL', name: 'TAV Havalimanları', sector: 'Havacılık' },
  { symbol: 'TCELL', name: 'Turkcell', sector: 'Telekom' },
  { symbol: 'THYAO', name: 'Türk Hava Yolları', sector: 'Havacılık' },
  { symbol: 'TKFEN', name: 'Tekfen Holding', sector: 'Holding' },
  { symbol: 'TOASO', name: 'Tofaş', sector: 'Otomotiv' },
  { symbol: 'TTKOM', name: 'Türk Telekom', sector: 'Telekom' },
  { symbol: 'TUPRS', name: 'Tüpraş', sector: 'Petrokimya' },
  { symbol: 'VESBE', name: 'Vestel Beyaz Eşya', sector: 'Beyaz Eşya' },
  { symbol: 'YKBNK', name: 'Yapı Kredi', sector: 'Bankacılık' },
  { symbol: 'KOZAA', name: 'Koza Madencilik', sector: 'Madencilik' },
]

// Popüler BIST100 (BIST30 dışı) — tier1, daha ucuz
export const TIER1 = [
  { symbol: 'AEFES', name: 'Anadolu Efes', sector: 'İçecek' },
  { symbol: 'AGHOL', name: 'AG Anadolu Grubu', sector: 'Holding' },
  { symbol: 'AKSEN', name: 'Aksa Enerji', sector: 'Enerji' },
  { symbol: 'ALARK', name: 'Alarko Holding', sector: 'Holding' },
  { symbol: 'ASTOR', name: 'Astor Enerji', sector: 'Enerji' },
  { symbol: 'BRSAN', name: 'Borusan Boru', sector: 'Demir Çelik' },
  { symbol: 'CIMSA', name: 'Çimsa', sector: 'Çimento' },
  { symbol: 'DOAS', name: 'Doğuş Otomotiv', sector: 'Otomotiv' },
  { symbol: 'ENJSA', name: 'Enerjisa', sector: 'Enerji' },
  { symbol: 'ENKAI', name: 'Enka İnşaat', sector: 'İnşaat' },
  { symbol: 'EUPWR', name: 'Europower Enerji', sector: 'Enerji' },
  { symbol: 'GESAN', name: 'Girişim Elektrik', sector: 'Enerji' },
  { symbol: 'HALKB', name: 'Halkbank', sector: 'Bankacılık' },
  { symbol: 'ISMEN', name: 'İş Yatırım', sector: 'Aracı Kurum' },
  { symbol: 'KONTR', name: 'Kontrolmatik', sector: 'Enerji' },
  { symbol: 'KONYA', name: 'Konya Çimento', sector: 'Çimento' },
  { symbol: 'MGROS', name: 'Migros', sector: 'Perakende' },
  { symbol: 'OYAKC', name: 'Oyak Çimento', sector: 'Çimento' },
  { symbol: 'PETUN', name: 'Pınar Et', sector: 'Gıda' },
  { symbol: 'SOKM', name: 'Şok Marketler', sector: 'Perakende' },
  { symbol: 'TTRAK', name: 'Türk Traktör', sector: 'Otomotiv' },
  { symbol: 'ULKER', name: 'Ülker', sector: 'Gıda' },
  { symbol: 'VAKBN', name: 'Vakıfbank', sector: 'Bankacılık' },
  { symbol: 'YEOTK', name: 'Yeo Teknoloji', sector: 'Teknoloji' },
  { symbol: 'BRYAT', name: 'Borusan Yatırım', sector: 'Holding' },
  { symbol: 'CWENE', name: 'CW Enerji', sector: 'Enerji' },
  { symbol: 'KARSN', name: 'Karsan', sector: 'Otomotiv' },
  { symbol: 'OTKAR', name: 'Otokar', sector: 'Savunma' },
  { symbol: 'SMRTG', name: 'Smart Güneş', sector: 'Enerji' },
]

// "Halk hisseleri" / volatil favoriler — tier2
export const TIER2 = [
  { symbol: 'GWIND', name: 'Galata Wind', sector: 'Enerji' },
  { symbol: 'KMPUR', name: 'Kimteks Poliüretan', sector: 'Kimya' },
  { symbol: 'EUREN', name: 'Europen Endüstri', sector: 'Sanayi' },
  { symbol: 'IZINV', name: 'İzmir Demir Çelik', sector: 'Demir Çelik' },
  { symbol: 'QUAGR', name: 'QUA Granite', sector: 'İnşaat' },
  { symbol: 'CANTE', name: 'Çan2 Termik', sector: 'Enerji' },
  { symbol: 'NATEN', name: 'Naturel Enerji', sector: 'Enerji' },
  { symbol: 'BIGCH', name: 'Bigchefs', sector: 'Yiyecek' },
  { symbol: 'MIATK', name: 'Mia Teknoloji', sector: 'Teknoloji' },
  { symbol: 'REEDR', name: 'Reeder Teknoloji', sector: 'Teknoloji' },
]

export const STOCK_CATALOG = [
  ...BIST30.map(s => ({ ...s, tier: 'free' })),
  ...TIER1.map(s => ({ ...s, tier: 'tier1' })),
  ...TIER2.map(s => ({ ...s, tier: 'tier2' })),
].map(s => ({ ...s, symbol: s.symbol.toUpperCase() }))   // sembolleri normalize et (CATALOG_MAP lookup'ı uppercase)

export const STOCK_PRICE = { free: 0, tier1: 1600, tier2: 4500, other: 6000 }
export const TIER_LABEL = { free: 'BIST 30 · Ücretsiz', tier1: 'BIST 100', tier2: 'Halk Hissesi', other: 'Diğer BIST' }

const BIST30_SET = new Set(BIST30.map(s => s.symbol))
const CATALOG_MAP = new Map(STOCK_CATALOG.map(s => [s.symbol, s]))

export function getStockTier(symbol) {
  const s = CATALOG_MAP.get((symbol || '').toUpperCase())
  return s ? s.tier : 'other'
}

export function stockUnlockPrice(symbol) {
  return STOCK_PRICE[getStockTier(symbol)] ?? STOCK_PRICE.other
}

export function isStockFree(symbol) {
  return BIST30_SET.has((symbol || '').toUpperCase())
}

export function stockMeta(symbol) {
  const sym = (symbol || '').toUpperCase()
  return CATALOG_MAP.get(sym) || { symbol: sym, name: sym, sector: 'BIST', tier: 'other' }
}

// ----------------------------------------------------------------------------
// ÖDÜL HESABI — ilerleme temposunu burası belirler
// ----------------------------------------------------------------------------
// "Biraz yavaş ama sıkmayacak" denge:
//   - mesafe ana gelir kaynağı (yakıt mesafeyi sınırlar → tur başı kazanç tavanı)
//   - paralar + takla + hava bonusu ek heyecan
export const REWARD = {
  perMeter: 0.6,    // metre başı BP (ana gelir)
  perCoin: 3,       // toplanan para başı BP
  perFlip: 60,      // tam takla başı BP (risk ödülü — takla ekstra para getirir)
  perAirSec: 10,    // havada geçen saniye başı BP
}

export function computeEarnings({ distanceM = 0, coins = 0, flips = 0, airTime = 0 }) {
  return Math.max(
    0,
    Math.round(
      distanceM * REWARD.perMeter +
      coins * REWARD.perCoin +
      flips * REWARD.perFlip +
      airTime * REWARD.perAirSec,
    ),
  )
}

// ----------------------------------------------------------------------------
// BAŞARIMLAR (hedef hissi / bitmeyen içerik)
// ----------------------------------------------------------------------------
export const ACHIEVEMENTS = [
  { id: 'first_run', name: 'İlk Tur', emoji: '🏁', desc: 'İlk yarışını tamamla.', check: (s) => s.runs >= 1 },
  { id: 'd1000', name: '1 KM', emoji: '📏', desc: 'Tek turda 1000m sür.', test: (r) => r.distanceM >= 1000 },
  { id: 'd3000', name: 'Maratoncu', emoji: '🏔️', desc: 'Tek turda 3000m sür.', test: (r) => r.distanceM >= 3000 },
  { id: 'flip3', name: 'Akrobat', emoji: '🤸', desc: 'Tek turda 3 takla at.', test: (r) => r.flips >= 3 },
  { id: 'coin50', name: 'Para Avcısı', emoji: '🪙', desc: 'Tek turda 50 para topla.', test: (r) => r.coins >= 50 },
  { id: 'rich', name: 'Borsa Kralı', emoji: '👑', desc: '50.000 BP biriktir.', check: (s) => s.wallet >= 50000 },
  { id: 'garage5', name: 'Koleksiyoner', emoji: '🏆', desc: '5 araç sahibi ol.', check: (s) => s.ownedVehicles.length >= 5 },
  { id: 'stocks10', name: 'Portföy', emoji: '📈', desc: '10 hisse pisti aç.', check: (s) => s.unlockedStocks.length >= 10 },
]

// ----------------------------------------------------------------------------
// KAYIT (localStorage)
// ----------------------------------------------------------------------------
export function defaultSave() {
  return {
    wallet: 350,                                    // başlangıç sermayesi
    vehicle: 'hatchback',
    ownedVehicles: ['hatchback', 'motorcycle'],     // araba + motor hediye
    upgrades: {},                                   // upgrades[vehicleId][key] = level
    stock: 'GARAN',
    unlockedStocks: BIST30.map(s => s.symbol),       // BIST30 ücretsiz
    stockBest: {},                                  // symbol -> best distanceM
    totalDistance: 0,
    totalEarned: 0,
    runs: 0,
    achievements: [],
    settings: { sound: true },
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return defaultSave()
    const parsed = JSON.parse(raw)
    const base = defaultSave()
    const merged = { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } }

    // Bozuk / elle düzenlenmiş kayıtlara karşı tip doğrulaması — render
    // sırasında okunan alanlar yanlış tipte gelirse beyaz ekran / NaN cüzdan
    // olmasın diye varsayılana düşürürüz.
    const num = (v, d) => (Number.isFinite(+v) ? +v : d)
    const arr = (v, d) => (Array.isArray(v) ? v : d)
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
    merged.wallet = num(merged.wallet, base.wallet)
    merged.totalDistance = num(merged.totalDistance, 0)
    merged.totalEarned = num(merged.totalEarned, 0)
    merged.runs = num(merged.runs, 0)
    merged.ownedVehicles = arr(merged.ownedVehicles, base.ownedVehicles)
    merged.unlockedStocks = arr(merged.unlockedStocks, base.unlockedStocks)
    merged.achievements = arr(merged.achievements, [])
    merged.upgrades = obj(merged.upgrades)
    merged.stockBest = obj(merged.stockBest)
    if (!merged.ownedVehicles.length) merged.ownedVehicles = [...base.ownedVehicles]
    if (!VEHICLES[merged.vehicle]) merged.vehicle = base.vehicle
    if (typeof merged.stock !== 'string' || !merged.stock) merged.stock = base.stock

    // BIST30 her zaman açık kalsın (katalog güncellenirse)
    const set = new Set([...merged.unlockedStocks, ...base.unlockedStocks])
    merged.unlockedStocks = [...set]
    if (!merged.ownedVehicles.includes(merged.vehicle)) merged.vehicle = merged.ownedVehicles[0] || 'hatchback'
    return merged
  } catch {
    return defaultSave()
  }
}

export function persistSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  } catch { /* kota dolu vb. — sessizce geç */ }
}

export function formatBP(n) {
  return Math.round(n).toLocaleString('tr-TR')
}
