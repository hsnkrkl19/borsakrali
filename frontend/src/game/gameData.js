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
export const SAVE_KEY = 'bk-hisse-yarisi-v2'   // v2: tek-araç başlangıç + %70 upgrade kapısı + yeni ekonomi

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
// price = bir önceki aracın %70-upgrade maliyetine EŞİT (cost70). costMul = bu aracın
// upgrade maliyet çarpanı. Böylece "sonraki araç = mevcut aracın %70 upgrade'i kadar"
// özdeşliği korunur (bkz. progression yardımcıları + GATE_PCT).
export const VEHICLES = {
  hatchback: {
    id: 'hatchback', name: 'Şehir Arabası', emoji: '🚗', price: 0, free: true, costMul: 0.4,
    desc: 'Dengeli başlangıç aracı. Her piste uygun.',
    torqueTW: 1.05,
    enginePower: 2400, mass: 1.0, grip: 1.0, suspK: 240, suspDamp: 26,
    fuelMax: 100, topSpeed: 760, airControl: 9, wheelBase: 78, wheelR: 24,
    bodyW: 116, bodyH: 40, color: '#10b981', accent: '#065f46',
    sprite: { body: '/game/vehicles/car_body.png', wheel: '/game/vehicles/car_wheel.png', scale: 1.4, yOff: -0.32, wheelScale: 1.15 },
  },
  motorcycle: {
    id: 'motorcycle', name: 'Motosiklet', emoji: '🏍️', price: 2340, costMul: 0.7,
    desc: 'Hafif ve hızlı. Tutuşu zayıf, kolay takla atar — usta sürücü işi.',
    torqueTW: 1.25,
    enginePower: 2750, mass: 0.62, grip: 0.82, suspK: 200, suspDamp: 20,
    fuelMax: 78, topSpeed: 900, airControl: 14, wheelBase: 70, wheelR: 22,
    bodyW: 92, bodyH: 26, color: '#f59e0b', accent: '#92400e', bike: true,
  },
  jeep: {
    id: 'jeep', name: '4x4 Jip', emoji: '🚙', price: 4080, costMul: 1.1,
    desc: 'Yüksek tutuş ve tırmanış. Sarp/oynak hisseler için ideal.',
    torqueTW: 1.15,
    enginePower: 3000, mass: 1.35, grip: 1.28, suspK: 320, suspDamp: 34,
    fuelMax: 120, topSpeed: 700, airControl: 8, wheelBase: 86, wheelR: 28,
    bodyW: 124, bodyH: 46, color: '#0ea5e9', accent: '#075985',
    sprite: { body: '/game/vehicles/orc_body.png', wheel: '/game/vehicles/orc_wheel.png', scale: 1.45, yOff: -0.34, wheelScale: 1.2 },
  },
  pickup: {
    id: 'pickup', name: 'Pikap', emoji: '🛻', price: 6600, costMul: 1.7,
    desc: 'Güçlü motor, ağır gövde. Tork canavarı.',
    torqueTW: 1.2,
    enginePower: 3300, mass: 1.5, grip: 1.18, suspK: 300, suspDamp: 32,
    fuelMax: 135, topSpeed: 720, airControl: 7, wheelBase: 92, wheelR: 27,
    bodyW: 134, bodyH: 44, color: '#8b5cf6', accent: '#4c1d95',
    sprite: { body: '/game/vehicles/monster_body.png', wheel: '/game/vehicles/monster_tire.png', scale: 1.5, yOff: -0.28, wheelScale: 1.3 },
  },
  sports: {
    id: 'sports', name: 'Spor Araba', emoji: '🏎️', price: 10080, costMul: 2.6,
    desc: 'Müthiş hız, zayıf tutuş. Düz/yükseliş trendli hisselerde uçar.',
    torqueTW: 1.4,
    enginePower: 3400, mass: 0.9, grip: 0.92, suspK: 260, suspDamp: 24,
    fuelMax: 105, topSpeed: 1180, airControl: 10, wheelBase: 92, wheelR: 22,
    bodyW: 132, bodyH: 34, color: '#ef4444', accent: '#7f1d1d',
  },
  monster: {
    id: 'monster', name: 'Canavar Kamyon', emoji: '🚚', price: 15600, costMul: 4.0,
    desc: 'Devasa tekerler. Neredeyse her tepeyi ezer geçer.',
    torqueTW: 1.3,
    enginePower: 3800, mass: 1.7, grip: 1.4, suspK: 360, suspDamp: 38,
    fuelMax: 150, topSpeed: 760, airControl: 9, wheelBase: 104, wheelR: 38,
    bodyW: 142, bodyH: 50, color: '#22c55e', accent: '#14532d',
    sprite: { body: '/game/vehicles/truck_body.png', wheel: '/game/vehicles/truck_wheel.png', scale: 1.5, yOff: -0.34, wheelScale: 1.25 },
  },
  tractor: {
    id: 'tractor', name: 'Traktör', emoji: '🚜', price: 23760, costMul: 6.0,
    desc: 'Yavaş ama durdurulamaz tork ve tutuş. Asla takılmaz.',
    torqueTW: 1.1,
    enginePower: 3600, mass: 1.6, grip: 1.55, suspK: 330, suspDamp: 40,
    fuelMax: 160, topSpeed: 560, airControl: 6, wheelBase: 96, wheelR: 34,
    bodyW: 120, bodyH: 48, color: '#84cc16', accent: '#3f6212',
  },
  tank: {
    id: 'tank', name: 'Tank', emoji: '🛡️', price: 35700, costMul: 9.0,
    desc: 'Ultra ağır, devrilmez. Her şeyi yarıp geçer.',
    torqueTW: 1.15,
    enginePower: 4200, mass: 2.4, grip: 1.7, suspK: 420, suspDamp: 48,
    fuelMax: 190, topSpeed: 600, airControl: 5, wheelBase: 112, wheelR: 30,
    bodyW: 156, bodyH: 52, color: '#64748b', accent: '#1e293b',
  },
  rocket: {
    id: 'rocket', name: 'Roketli Araba', emoji: '🚀', price: 53520, costMul: 13.0,
    desc: 'Son sınır. Akıl almaz hız ve ivme — sadece ustalar için.',
    torqueTW: 1.55,
    enginePower: 4800, mass: 0.85, grip: 1.05, suspK: 300, suspDamp: 28,
    fuelMax: 130, topSpeed: 1600, airControl: 13, wheelBase: 100, wheelR: 24,
    bodyW: 140, bodyH: 34, color: '#ec4899', accent: '#831843',
  },
  bigrig: {
    id: 'bigrig', name: 'Dev TIR', emoji: '🚛', price: 72000, costMul: 16.0,
    desc: 'Devasa çekici. Durdurulamaz güç ve tutuş — koleksiyonun tacı.',
    torqueTW: 1.25,
    enginePower: 5200, mass: 2.6, grip: 1.75, suspK: 440, suspDamp: 50,
    fuelMax: 210, topSpeed: 780, airControl: 5, wheelBase: 120, wheelR: 34,
    bodyW: 170, bodyH: 56, color: '#0891b2', accent: '#164e63',
  },
}

export const VEHICLE_ORDER = [
  'hatchback', 'motorcycle', 'jeep', 'pickup', 'sports', 'monster', 'tractor', 'tank', 'rocket', 'bigrig',
]

// ----------------------------------------------------------------------------
// YÜKSELTMELER — her araç için ayrı seviye tutulur (bol içerik / uzun ilerleme)
// ----------------------------------------------------------------------------
// Tek tip eğri (base 60, growth 1.28, max 10) → 6×10=60 toplam seviye, %70 kapısı = 42 seviye.
// Gerçek maliyet upgradeCost'ta araç costMul'u ile ölçeklenir (cost70 özdeşliği için).
export const UPGRADE_MAX = 10
export const UPGRADES = [
  { key: 'engine',     name: 'Motor',        emoji: '⚙️', desc: 'Güç + ivme. Gövde büyür, egzoz alevlenir.', baseCost: 60, growth: 1.28, max: UPGRADE_MAX },
  { key: 'tires',      name: 'Lastik',       emoji: '🛞', desc: 'Tutuş + tırmanış. Tekerler kalınlaşır.',    baseCost: 60, growth: 1.28, max: UPGRADE_MAX },
  { key: 'suspension', name: 'Süspansiyon',  emoji: '🔩', desc: 'Yumuşak iniş, dengeli ön/arka. Yaylar uzar.', baseCost: 60, growth: 1.28, max: UPGRADE_MAX },
  { key: 'gearbox',    name: 'Şanzıman',     emoji: '🔧', desc: 'Daha yüksek son hız.',                       baseCost: 60, growth: 1.28, max: UPGRADE_MAX },
  { key: 'fuel',       name: 'Yakıt Deposu', emoji: '⛽', desc: 'Uzun mesafe + kazanç. Depo büyür.',          baseCost: 60, growth: 1.28, max: UPGRADE_MAX },
  { key: 'aero',       name: 'Aerodinamik',  emoji: '🪽', desc: 'Havada kontrol + denge. Kanat/spoiler takılır.', baseCost: 60, growth: 1.28, max: UPGRADE_MAX },
]

// Yükseltme seviyesinin maliyeti (sonraki seviyeye geçiş). costMul = araca özel çarpan.
export function upgradeCost(upg, level, costMul = 1) {
  return Math.round(upg.baseCost * costMul * Math.pow(upg.growth, level) / 10) * 10
}

// ----------------------------------------------------------------------------
// GÖRÜNÜM / KİŞİSELLEŞTİRME — boya + takılabilir parçalar (kombinasyon = bol görünüm)
// ----------------------------------------------------------------------------
// 30 "eklenti": 6 performans yükseltmesi + 8 boya + 16 parça (4 slot × 4).
// Görünüm = araç(10) × boya(8) × spoiler(5) × jant(5) × egzoz(5) × aksesuar(5)
//         → binlerce kombinasyon (kolayca >150). Parçalar TÜM araçlara uyar.
// hue = kırmızı sprite gövdeye uygulanacak ton kaydırma (°); color = çizim gövde rengi.
export const PAINTS = [
  { id: 'stock',   name: 'Orijinal', color: null,     hue: 0,   sat: 1,    price: 0 },  // aracın kendi rengi
  { id: 'crimson', name: 'Kırmızı', color: '#ef4444', hue: 0,   sat: 1,    price: 150 },
  { id: 'azure',   name: 'Mavi',    color: '#3b82f6', hue: 210, sat: 1,    price: 150 },
  { id: 'violet',  name: 'Mor',     color: '#8b5cf6', hue: 262, sat: 1,    price: 220 },
  { id: 'amber',   name: 'Turuncu', color: '#f59e0b', hue: 32,  sat: 1,    price: 180 },
  { id: 'ink',     name: 'Siyah',   color: '#1f2937', hue: 0,   sat: 0.18, price: 300 },
  { id: 'pearl',   name: 'Beyaz',   color: '#e5e7eb', hue: 0,   sat: 0.12, price: 300 },
  { id: 'gold',    name: 'Altın',   color: '#eab308', hue: 46,  sat: 1.1,  price: 500 },
]

// Kozmetik slotlar — her araçta biri takılı. 'default:true' bedava başlangıç.
export const ADDONS = {
  spoiler: [
    { id: 'none',    name: 'Spoiler Yok', price: 0, default: true },
    { id: 'lip',     name: 'Lip Spoiler', price: 220 },
    { id: 'duck',    name: 'Ördek Kuyruğu', price: 320 },
    { id: 'gt',      name: 'GT Kanadı',   price: 460 },
    { id: 'bigwing', name: 'Dev Kanat',   price: 640 },
  ],
  wheels: [
    { id: 'stock',   name: 'Standart Jant', price: 0, default: true },
    { id: 'sport',   name: 'Spor Jant',     price: 260 },
    { id: 'offroad', name: 'Arazi Lastiği', price: 340 },
    { id: 'chrome',  name: 'Krom Jant',     price: 460 },
    { id: 'gold',    name: 'Altın Jant',    price: 700 },
  ],
  exhaust: [
    { id: 'single',  name: 'Tekli Egzoz',  price: 0, default: true },
    { id: 'dual',    name: 'Çiftli Egzoz', price: 240 },
    { id: 'side',    name: 'Yan Egzoz',    price: 320 },
    { id: 'race',    name: 'Yarış Egzozu', price: 420 },
    { id: 'flame',   name: 'Alev Egzozu',  price: 600 },
  ],
  accessory: [
    { id: 'none',    name: 'Aksesuar Yok', price: 0, default: true },
    { id: 'roofrack', name: 'Port Bagaj', price: 220 },
    { id: 'lightbar', name: 'Tepe Lambası', price: 340 },
    { id: 'flag',    name: 'Yarış Bayrağı', price: 180 },
    { id: 'spare',   name: 'Yedek Lastik', price: 300 },
  ],
}
export const ADDON_SLOTS = ['paint', 'spoiler', 'wheels', 'exhaust', 'accessory']
export const ADDON_SLOT_LABEL = { paint: 'Boya', spoiler: 'Spoiler', wheels: 'Jant', exhaust: 'Egzoz', accessory: 'Aksesuar' }

const PAINT_MAP = new Map(PAINTS.map((p) => [p.id, p]))
const paintById = (id) => PAINT_MAP.get(id) || PAINTS[0]
const addonById = (slot, id) => (ADDONS[slot] || []).find((a) => a.id === id) || (ADDONS[slot] || [])[0]

// Bir araç için varsayılan görünüm (bedava başlangıç parçaları).
export function defaultLook() {
  return { paint: 'stock', spoiler: 'none', wheels: 'stock', exhaust: 'single', accessory: 'none' }
}

// Kayıttan bir aracın takılı görünümü (eksikler varsayılana düşer).
export function lookFor(save, vehicleId) {
  const base = defaultLook()
  const l = (save && save.looks && save.looks[vehicleId]) || {}
  return { ...base, ...l }
}

// Görünümü motorun kullanacağı somut nesneye çöz (renk/ton + parça id'leri).
export function resolveLook(look) {
  const p = paintById(look.paint)
  return {
    paint: { id: p.id, color: p.color, hue: p.hue, sat: p.sat ?? 1 },
    spoiler: look.spoiler || 'none',
    wheels: look.wheels || 'stock',
    exhaust: look.exhaust || 'single',
    accessory: look.accessory || 'none',
  }
}

export function addonPrice(slot, id) {
  if (slot === 'paint') return paintById(id).price || 0
  return (addonById(slot, id).price) || 0
}
export function addonName(slot, id) {
  if (slot === 'paint') return paintById(id).name
  return addonById(slot, id).name
}
export function addonKey(slot, id) { return `${slot}:${id}` }

// Bir parça sahibi mi? (default'lar + satın alınanlar herkese açık)
export function ownsAddon(save, slot, id) {
  const opt = slot === 'paint' ? paintById(id) : addonById(slot, id)
  if (!opt || (opt.price || 0) === 0) return true            // bedava/default
  return !!(save && save.ownedAddons && save.ownedAddons.includes(addonKey(slot, id)))
}

// Toplam "eklenti" sayısı (kullanıcı hedefi ~30): 6 performans + boya + parçalar.
export const ADDON_TOTAL = UPGRADES.length +
  PAINTS.length +
  Object.keys(ADDONS).reduce((n, k) => n + ADDONS[k].filter((a) => !a.default).length, 0)

// ----------------------------------------------------------------------------
// EFEKTİF ARAÇ İSTATİSTİĞİ — temel stat × yükseltme seviyeleri
// ----------------------------------------------------------------------------
export function effectiveStats(vehicleId, upgradesForVehicle = {}) {
  const base = VEHICLES[vehicleId] || VEHICLES.hatchback
  const lv = (k) => Math.min(upgradesForVehicle[k] || 0, UPGRADE_MAX)   // eski kayıt seviyelerini clamp'le
  const eng = lv('engine'), tir = lv('tires'), sus = lv('suspension')
  const gear = lv('gearbox'), fuel = lv('fuel'), aero = lv('aero')
  const totalLv = eng + tir + sus + gear + fuel + aero

  // YÜKSELTMELER ARACI FİZİKSEL OLARAK BÜYÜTÜR (görsel + hitbox + atalet birlikte).
  //  motor/yakıt → gövde büyür · lastik → tekerlek büyür (daha iyi tırmanır) ·
  //  süspansiyon → daha yüksek/uzun yol · böylece dolu bir araç gözle görülür şekilde iri ve güçlüdür.
  const bodyW    = base.bodyW * (1 + 0.030 * eng + 0.018 * fuel)
  const bodyH    = base.bodyH * (1 + 0.018 * eng + 0.026 * sus)
  const wheelR   = base.wheelR * (1 + 0.048 * tir)
  const wheelBase = base.wheelBase * (1 + 0.016 * eng + 0.010 * tir)

  return {
    ...base,
    bodyW, bodyH, wheelR, wheelBase,
    // Katsayılar max=10'a göre ölçeklendi. Base hız ×1.20, motor+şanzıman hıza daha çok katkı.
    // v7 DENGE (araştırma referanslı): itki artık YERÇEKİMİNDEN BAĞIMSIZ "thrust-to-weight".
    // Box2D arcade referansı TW≈1.13, simülasyon≈0.46. Eskiden bizimki 1.97–6.36 idi →
    // araç sürekli sürtünme limitinde takılıydı, gaz analog davranmıyordu.
    torqueTW:    (base.torqueTW || 1.05) * (1 + 0.055 * eng),   // max ×1.55
    grip:        base.grip * (1 + 0.085 * tir),                 // max ×1.85
    topSpeed:    base.topSpeed * (1 + 0.012 * eng + 0.028 * gear), // max ×1.40 (eskiden ×4.08!)
    airTorque:   5.0 * (1 + 0.020 * aero),                      // rad/s² — tam takla ~2.3sn
    suspStiff:   1,                                             // yay sag'dan türetilir (motor)
    fuelMax:     base.fuelMax * (1 + 0.32 * fuel),
    airControl:  base.airControl * (1 + 0.18 * aero),
    stability:   1 + 0.06 * aero,   // max 1.60 — "bıraktığında düz in" (artık dönüşü HIZLANDIRMIYOR)
    landing:     1 + 0.045 * sus,   // max 1.45 — iniş açı toleransı (motorda KULLANILIYOR)
    // SÜSPANSİYON = ön/arka hassasiyet: yükseldikçe yay yumuşar, yol uzar, iniş sakinleşir.
    suspSoft:    1 + 0.10 * sus,    // yay yolu / yumuşaklık çarpanı (görsel + fizik)
    mass:        base.mass * (1 + 0.006 * (eng + fuel)),   // büyüdükçe biraz ağırlaşır
    // Motor render/ince-fizik için ham yükseltme seviyeleri + doluluk oranı:
    lv: { engine: eng, tires: tir, suspension: sus, gearbox: gear, fuel, aero },
    totalLv,
    upgradeRatio: totalLv / (UPGRADES.length * UPGRADE_MAX),
  }
}

// ----------------------------------------------------------------------------
// PROGRESSION KAPISI — tek araçla başla, sonraki araç ancak mevcut (en üst sahip)
// aracın upgrade'lerinin %70'i bitince açılır. Sonraki aracın fiyatı = o aracın
// %70-upgrade maliyeti (cost70) olduğundan ilerleme "tam tamına sıkı" hissedilir.
// ----------------------------------------------------------------------------
export const GATE_PCT = 0.70

// Bir aracın upgrade tamamlanma oranı (0..1) = toplam seviye / (upgrade sayısı × max).
export function vehicleUpgradeProgress(upgradesForVehicle = {}) {
  const total = UPGRADES.reduce((s, u) => s + Math.min(upgradesForVehicle[u.key] || 0, u.max), 0)
  const max = UPGRADES.reduce((s, u) => s + u.max, 0)
  return max ? total / max : 0
}

// Sahip olunan araçlar içinde VEHICLE_ORDER'daki en yüksek index.
export function highestOwnedIndex(ownedVehicles = []) {
  let idx = 0
  for (const id of ownedVehicles) {
    const i = VEHICLE_ORDER.indexOf(id)
    if (i > idx) idx = i
  }
  return idx
}

// Sıradaki (henüz alınmamış) araç id'si, ya da null (hepsi alındıysa).
export function nextVehicleId(ownedVehicles = []) {
  return VEHICLE_ORDER[highestOwnedIndex(ownedVehicles) + 1] || null
}

// Bir aracın satın alma durumu:
//  owned        → zaten sahip (veya sıradan önceki)
//  buyable      → sıradaki araç + %70 kapısı açık (fiyat ayrıca kontrol edilir)
//  locked-upgrade → sıradaki araç ama mevcut aracın %70'i bitmemiş
//  locked-order → daha ileri bir araç (önce sıradakini al)
export function vehicleGate(save, vehicleId) {
  const order = VEHICLE_ORDER.indexOf(vehicleId)
  const ownedIdx = highestOwnedIndex(save.ownedVehicles || [])
  if ((save.ownedVehicles || []).includes(vehicleId) || order <= ownedIdx) return { state: 'owned' }
  if (order > ownedIdx + 1) return { state: 'locked-order' }
  const gateVehicle = VEHICLE_ORDER[ownedIdx]
  const progress = vehicleUpgradeProgress((save.upgrades || {})[gateVehicle] || {})
  return {
    state: progress + 1e-9 >= GATE_PCT ? 'buyable' : 'locked-upgrade',
    progress, needPct: GATE_PCT, gateVehicle,
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
// v4 — para artık ÇOK daha zor kazanılır: ana gelir SEVİYE BİTİRMEK.
// Mesafe/para/takla küçük katkı; tur SONLU (bitiş çizgisi) → sonsuz farm YOK.
export const REWARD = {
  perMeter: 0.10,       // metre başı BP (küçük)
  perCoin: 1,           // toplanan para başı BP
  perFlip: 12,          // tam takla başı BP
  perAirSec: 3,         // havada geçen saniye başı BP
  perCheckpoint: 8,     // geçilen checkpoint başı BP
  finishBase: 30,       // seviye bitirme ödülü (tabana)
  finishPerLevel: 14,   // her seviye için ek bitirme ödülü
  firstClear: 50,       // seviyeyi İLK kez bitirme bonusu (bir kez)
}

export function computeEarnings({
  distanceM = 0, coins = 0, flips = 0, airTime = 0,
  checkpoints = 0, completed = false, level = 1, firstClear = false,
}) {
  let bp = distanceM * REWARD.perMeter + coins * REWARD.perCoin +
    flips * REWARD.perFlip + airTime * REWARD.perAirSec +
    checkpoints * REWARD.perCheckpoint
  if (completed) {
    bp += REWARD.finishBase + (level - 1) * REWARD.finishPerLevel
    if (firstClear) bp += REWARD.firstClear
  }
  return Math.max(0, Math.round(bp))
}

// ----------------------------------------------------------------------------
// SEVİYE SİSTEMİ (v4) — her hisse pistinde SONLU, bitiş çizgili seviyeler.
// Her seviye grafiğin FARKLI bir bölgesinden başlar (farklı arazi + farklı
// başlangıç/bitiş), checkpoint'lerle yakıt alırsın; bitiş çizgisine varınca
// seviye tamamlanır ve bir sonraki açılır. Sonsuz yakıt/sonsuz mesafe YOK.
// ----------------------------------------------------------------------------
export const LEVELS_PER_STOCK = 12
export const CHECKPOINT_SPACING_M = 130   // starter aracın depo menzili içinde → checkpoint'e ulaşılır

export function levelConfig(level = 1) {
  const lv = Math.max(1, Math.min(LEVELS_PER_STOCK, Math.round(level)))
  // seviye uzunluğu kademeli artar: 500m → ~1380m
  const distanceM = 500 + (lv - 1) * 80
  return { level: lv, distanceM, checkpointSpacingM: CHECKPOINT_SPACING_M }
}

// bir hissede oynanacak (sıradaki) seviye — 1 tabanlı
export function currentLevel(save, symbol) {
  const sym = (symbol || '').toUpperCase()
  const v = save?.level?.[sym]
  return Number.isFinite(+v) && +v >= 1 ? Math.min(LEVELS_PER_STOCK, +v) : 1
}

// bir hissede geçilmiş en yüksek seviye
export function clearedLevel(save, symbol) {
  const sym = (symbol || '').toUpperCase()
  const v = save?.cleared?.[sym]
  return Number.isFinite(+v) && +v >= 0 ? +v : 0
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
    ownedVehicles: ['hatchback'],                   // TEK araçla başla (diğerleri %70 kapısıyla açılır)
    upgrades: {},                                   // upgrades[vehicleId][key] = level
    stock: 'GARAN',
    unlockedStocks: BIST30.map(s => s.symbol),       // BIST30 ücretsiz
    stockBest: {},                                  // symbol -> best distanceM
    level: {},                                      // symbol -> oynanacak (sıradaki) seviye (1-tabanlı)
    cleared: {},                                    // symbol -> geçilmiş en yüksek seviye
    ownedAddons: [],                                // ['spoiler:gt', 'paint:azure', ...] satın alınan görünüm parçaları
    looks: {},                                      // vehicleId -> { paint, spoiler, wheels, exhaust, accessory }
    totalDistance: 0,
    totalEarned: 0,
    runs: 0,
    achievements: [],
    settings: { sound: true },
  }
}

export function loadSave() {
  try {
    let raw = localStorage.getItem(SAVE_KEY)
    let migrating = false
    if (!raw) {
      // v1 → v2 migrasyonu: cüzdan + açılan hisseler + istatistikler korunur,
      // araç/upgrade'ler yeni ekonomiye göre sıfırlanır (aşağıda).
      const legacy = localStorage.getItem('bk-hisse-yarisi-v1')
      if (legacy) { raw = legacy; migrating = true }
    }
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
    merged.level = obj(merged.level)
    merged.cleared = obj(merged.cleared)
    merged.ownedAddons = arr(merged.ownedAddons, [])
    merged.looks = obj(merged.looks)
    if (!merged.ownedVehicles.length) merged.ownedVehicles = [...base.ownedVehicles]
    if (!VEHICLES[merged.vehicle]) merged.vehicle = base.vehicle
    if (typeof merged.stock !== 'string' || !merged.stock) merged.stock = base.stock

    // v1→v2 geçişinde araç/upgrade'leri yeni ekonomiye sıfırla (eski max-20 seviyeler
    // ve bedava motor yeni costMul/%70-kapı sistemiyle uyumsuz). Cüzdan/hisse/istatistik korunur.
    if (migrating) {
      merged.vehicle = base.vehicle
      merged.ownedVehicles = [...base.ownedVehicles]
      merged.upgrades = {}
    }

    // BIST30 her zaman açık kalsın (katalog güncellenirse)
    const set = new Set([...merged.unlockedStocks, ...base.unlockedStocks])
    merged.unlockedStocks = [...set]
    // Sahiplik daima VEHICLE_ORDER'ın bitişik prefix'i (bozuk kayıt güvenliği + sıralı progression)
    merged.ownedVehicles = VEHICLE_ORDER.slice(0, highestOwnedIndex(merged.ownedVehicles) + 1)
    if (!merged.ownedVehicles.includes(merged.vehicle)) merged.vehicle = merged.ownedVehicles[0] || 'hatchback'

    if (migrating) {
      persistSave(merged)
      try { localStorage.removeItem('bk-hisse-yarisi-v1') } catch { /* yoksay */ }
    }
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
