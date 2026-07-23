// ============================================================================
// HİSSE YARIŞI — Fizik & render motoru (v3: parallax şehir + yay süspansiyon)
// ----------------------------------------------------------------------------
// Pist = seçilen hissenin LOG fiyat grafiği (resample + ping-pong sonsuz).
// Sahne bir TradingView koyu grafiği + arkasında MUM ÇUBUĞU ŞEHRİ silüeti,
// bulutlar, ışık halesi ve pistte mesafe bayrakları ile canlandırılır.
//
// Fizik (v3): rijit şasi + 2 RAYCAST yay-sönüm süspansiyonu (dinlenme boyu →
// görünür yay yolu, yumuşak sürüş). Yükseltmeler aracı fiziksel BÜYÜTÜR ve
// görsel olarak değiştirir (yay/lastik/egzoz/kanat/depo/turbo). Ek: tepeden
// fırlatma, takla kombosu, iniş kalitesi, yokuş-aşağı momentum, ekran sarsıntısı,
// lastik izi, hız çizgileri, egzoz dumanı, parçacıklar.
// ============================================================================

// GRAV: 10 m/s² × METER(30) = 300 wu/s². Eskiden 1750 = 58.3 m/s² = 5.95 g (!) — gerçek
// rampalar bu yerçekiminde hava üretemediği için sahte "crest fırlatması" eklenmişti.
// Referans: Box2D testbed car.cpp ve alexzh3/hillclimbracing (SCALE=30 px/m, gravity 10).
// NOT: 1.0g (300) fizik olarak "doğru" ama 91 km/h hızlarda araba 10 m yükselip 2.5sn
// havada kalıyordu — arcade oyunlar yerçekimini bilerek abartır. 1.87g bunu yarıya indirir.
// (Sürüş/tırmanış ETKİLENMEZ: itki torqueTW·m·GRAV olduğu için itki/ağırlık sabit kalır.)
const GRAV = 680
const SUBSTEPS = 8
// DERİN UÇURUM / YÜKSEK TEPE — doğru yol: AMP ve SX'i BİRLİKTE büyütmek.
// AMP tek başına büyütülürse eğim (AMP/SX) diklenir ve araç takılır; birlikte
// büyüyünce eğim AYNI kalır, her şey büyür ve krest yarıçapı bedavaya iyileşir.
// Rölyef 22m → 53m (2.4×), maks eğim ise 47° → 30°.
// Diklik = AMP/SX oranı. SX 280→200 daraltıldı → gerçek veri ~35° dik duvarlara ulaşır
// (pistin ~%12'si ≥28°), "geçilmeze yakın". Krest eğrilik kelepçesi (R_CREST) SX'ten
// BAĞIMSIZ dünya-yarıçapı uyguladığı için SX küçülünce krestler keskinleşMEZ.
const SX = 200             // örnek nokta yatay aralığı
const AMP = 3500           // fiyat → yükseklik bandı (rölyef ~90m — uzun dik duvarlar/derin kanyon)
const TERRAIN_POINTS = 180
// Eğim artık AÇI olarak yazılıyor (AMP'ye bağlı kesir değil — o yüzden sessizce kayıyordu).
// 30°: gerçek sürülebilir tavan pitch/wheelie limiti olan 38.9°'nin güvenli altında.
// 35°: pitch/wheelie tavanına (≈38.9°) yakın → başlangıç aracıyla "geçilmeze yakın".
// climb yükseltmesi ön tekeri yerde tutup bu tavanı yükselttiği için YÜKSELTİLMİŞ araçta kolay.
const MAX_SLOPE_DEG = 35
const MAXSTEP = SX * Math.tan(MAX_SLOPE_DEG * Math.PI / 180)
// EĞRİLİK KELEPÇESİ: asıl "her tepede havalanma" sebebi keskin krestti (yarıçap 52 wu,
// dingil 78 wu → 171 wu/s'de balistik!). Kaynağında düzeltilir. Vadi yarıçapı çok daha
// büyük: keskin krest eğlencelidir (hava), keskin vadi sadece süspansiyonu patlatır (21.9 g).
const R_CREST = 2400    // doğal tepe: yumuşak → sebepsiz havalanma yok
const R_RAMP = 520      // TASARLANMIŞ rampa dudağı: keskin → hak edilmiş fırlatma/takla
const R_VALLEY = 9000   // vadi: en yumuşak (keskin vadi süspansiyonu patlatır)
const METER = 30
const PHYS_DT_MAX = 1 / 60
const AXW = 56             // sağ fiyat ekseni genişliği
const TAXH = 22            // alt zaman ekseni yüksekliği

// TradingView koyu tema renkleri
const TV = {
  bg: '#131722', bg2: '#0c0e15', grid: '#1c2030', gridV: '#191c28',
  axisText: '#787b86', axisLine: '#2a2e39', text: '#d1d4dc',
  up: '#26a69a', down: '#ef5350', blue: '#2962ff',
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t
const wrapPi = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI }

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}
function hash32(i) {
  let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16
  return x >>> 0
}

export class RacingEngine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.stats = opts.stats
    this.onState = opts.onState || (() => {})
    this.onEnd = opts.onEnd || (() => {})
    this.soundOn = !!opts.sound
    this.symbol = (opts.symbol || 'BIST').toUpperCase()
    this.assetName = opts.name || this.symbol

    // SEVİYE (v4): sonlu tur — bitiş çizgisi + checkpoint'ler + seviyeye özel başlangıç
    this.level = Math.max(1, Math.round(opts.level || 1))
    this.levelDistanceM = Math.max(120, Math.round(opts.levelDistanceM || 500))
    this.checkpointSpacingM = Math.max(60, Math.round(opts.checkpointSpacingM || 150))
    this.won = false

    // GÖRÜNÜM (v5): boya + takılı parçalar (spoiler/jant/egzoz/aksesuar)
    this.look = opts.look || { paint: { color: null, hue: 0, sat: 1 }, spoiler: 'none', wheels: 'stock', exhaust: 'single', accessory: 'none' }

    // 4 ayrı kontrol: ileri / geri (sürüş) + sol/sağ (havada takla)
    this.input = { fwd: false, rev: false, flipL: false, flipR: false }
    this.running = false
    this.over = false
    this.raf = null
    this.lastT = 0
    this.stateClock = 0

    this._buildTerrain(opts.candles || [])
    this._setupLevel()
    this._initVehicle()
    this._loadSprites()
    this._initAudio()

    this.collected = new Set()
    this.particles = []
    this.floatTexts = []
    this.trail = []
    this.shake = 0

    this.run = { distanceM: 0, coins: 0, flips: 0, airTime: 0, maxSpeed: 0, checkpoints: 0 }
    this._airAccum = 0
    this._airTimer = 0
    this._flipsThisAir = 0
    this._combo = 0
    this._comboFlash = 0
    this._noGroundFuel = 0
    this._wasGround = true
    this._wasGroundPhys = true
    this._physAirTimer = 0
    this._pendingLanding = null
    this._crashTimer = 0
    this._frame = 0

    this._resize()
  }

  // --------------------------------------------------------------------------
  // ZEMİN
  // --------------------------------------------------------------------------
  _buildTerrain(candles) {
    const valid = candles.filter((c) => Number.isFinite(Number(c.close)) && Number(c.close) > 0)
    let closes = valid.map((c) => Number(c.close))
    let times = valid.map((c) => Number(c.time))

    if (closes.length < 8) {
      // Yedek pist (veri yoksa): gerçek 2y/1d hisse verisinin DİKLİĞİNE yakın olsun diye
      // çok-oktavlı + büyük genlik (SX=200'de ~35° dik duvarlar üretir).
      closes = Array.from({ length: 220 }, (_, i) =>
        100 * Math.exp(
          Math.sin(i * 0.080) * 0.55 +
          Math.sin(i * 0.190) * 0.40 +
          Math.sin(i * 0.420) * 0.24 +
          Math.sin(i * 0.950) * 0.11 +
          i * 0.0020))
      times = closes.map((_, i) => 1.6e9 + i * 86400)
    }

    this.firstClose = closes[0]
    this.lastClose = closes[closes.length - 1]
    this.up = this.lastClose >= this.firstClose

    // LOG ölçek — yüzdesel hareketler her yerde eşit (gerçek grafik hissi)
    const logs = closes.map((c) => Math.log(c))

    // çok-yıllık grafiği sabit sayıda noktaya indir (tek turda sürülebilir)
    const N = TERRAIN_POINTS
    const L = logs.length
    const res = []
    const resDates = []
    for (let i = 0; i < N; i++) {
      const t = (i * (L - 1)) / (N - 1)
      const i0 = Math.floor(t)
      const f = t - i0
      res.push(logs[i0] + (logs[Math.min(L - 1, i0 + 1)] - logs[i0]) * f)
      resDates.push(times[Math.round(t)] ?? times[times.length - 1])
    }

    // hafif yumuşatma (sert kalsın diye zayıf ağırlıklı: a + 3v + b)
    const sm = res.map((v, i) => {
      const a = res[Math.max(0, i - 1)], b = res[Math.min(N - 1, i + 1)]
      return (a + v * 3 + b) / 5
    })

    const min = Math.min(...sm), max = Math.max(...sm), range = max - min || 1
    const h = sm.map((v) => ((v - min) / range) * AMP)

    // NOT: rampalar (kicker) ARTIK ÖNCE ekleniyor — eskiden kelepçelerden SONRA
    // ekleniyordu ve kelepçenin temizlediği dikliği geri enjekte ediyordu (ölçüm: 38°→47°).
    this._addKickers(h)

    // 1) EĞİM kelepçesi (açı tabanlı) — ileri/geri, birkaç kez
    // 2) EĞRİLİK kelepçesi — krest/vadi yarıçapı (asimetrik)
    const LC = (SX * SX) / R_CREST        // doğal krest için maks |ikinci fark|
    const LC_RAMP = (SX * SX) / R_RAMP    // rampa dudağı: çok daha keskin olabilir
    const LV = (SX * SX) / R_VALLEY       // vadi için (çok daha katı)
    for (let pass = 0; pass < 7; pass++) {   // 4 → 7: vadi eğriliği yeterince yakınsasın (süspansiyon yükü)
      for (let i = 1; i < h.length; i++) {
        const d = h[i] - h[i - 1]
        if (d > MAXSTEP) h[i] = h[i - 1] + MAXSTEP
        else if (d < -MAXSTEP) h[i] = h[i - 1] - MAXSTEP
      }
      for (let i = h.length - 2; i >= 0; i--) {
        const d = h[i] - h[i + 1]
        if (d > MAXSTEP) h[i] = h[i + 1] + MAXSTEP
        else if (d < -MAXSTEP) h[i] = h[i + 1] - MAXSTEP
      }
      for (let i = 1; i < h.length - 1; i++) {
        const d2 = h[i + 1] - 2 * h[i] + h[i - 1]
        // Rampa dudağında keskinliğe İZİN VAR (fırlatma oradan gelir); doğal tepeler yuvarlanır.
        const lc = (this._kickerIdx && this._kickerIdx.has(i)) ? LC_RAMP : LC
        if (d2 < -lc) h[i] += (d2 + lc) / 2        // fazla keskin TEPE → yuvarla
        else if (d2 > LV) h[i] += (d2 - LV) / 2    // fazla keskin VADİ → doldur
      }
    }

    // ZIPLAMA TÜMSEKLERİ — hava/takla için simetrik yumuşak tepeler (uçurum
    // DEĞİL). Dokunmazsan düz uçup güvenle inersin; gaz/fren tutarsan takla atar
    // ama ters inersen boynun kırılır. Grafiğin genel şekli korunur.
    this.heights = h
    this.N = h.length
    this._buildBridges(h)
    this.dates = resDates
    this.priceMin = min   // LOG fiyat min/max (eksen için)
    this.priceMax = max
  }

  // RAMPA (kicker) — yalnız grafiğin ZATEN YÜKSELDİĞİ yere. SX=280 olduğu için artık
  // "keskin dudak" değil UZUN rampa (4 örnek ≈ 37m): fırlatma dik eğrilikten değil
  // hız+eğimden gelir → yavaşken havalanmazsın, hızlıyken güzel uçarsın.
  _addKickers(h) {
    const N = h.length
    this._kickerIdx = new Set()     // bu noktalarda eğrilik kelepçesi GEVŞEK olacak (fırlatma dudağı)
    let bi = 10
    while (bi < N - 8) {
      const rising = h[bi] - h[bi - 3]
      if (rising > AMP * 0.02 && hash32(bi * 53 + 11) % 5 === 0) {
        const A = AMP * 0.15    // 0.085 → 0.15: takla için yeterli hava YALNIZ rampalarda
        // Yükselen giriş → dudak → arkasında BOŞLUK (atlayış) → iniş rampası.
        // Bu "her tepedeki rastgele uçurum" DEĞİL: yalnız tasarlanmış rampada,
        // arkasında düzgün iniş alanıyla → hak edilmiş hava + takla.
        h[bi - 3] += A * 0.12
        h[bi - 2] += A * 0.40
        h[bi - 1] += A * 0.78
        h[bi] += A * 1.00                 // dudak (keskinliğe izin var)
        this._kickerIdx.add(bi)
        h[bi + 1] += A * 0.22             // hızlı düşüş → boşluk
        h[bi + 2] -= A * 0.10             // hafif çukur = atlayış boşluğu
        h[bi + 3] -= A * 0.04
        h[bi + 4] += A * 0.05             // iniş rampası yükselmeye başlar
        bi += 14
      } else bi += 1
    }
  }

  // DERİN VADİLERİ bul ve üzerlerine KÖPRÜ kur (yalnız dekor — fizik yok, çizgi ARKASINA çizilir).
  // Vadi = iki tepe arasında yeterince derin çukur; köprü tabliyesi iki tepeyi birleştirir.
  _buildBridges(h) {
    this.bridges = []
    const N = h.length
    // 0.08: gerçek 2y/1d veriyle ölçüldü → GARAN 7, THYAO 10, ASELS 4 köprü
    // (0.14'te ASELS gibi düzgün seyreden hisselerde hiç köprü çıkmıyordu)
    const MIN_DEPTH = AMP * 0.08
    const MIN_SPAN = 4, MAX_SPAN = 26 // örnek adımı cinsinden açıklık

    // 1) yerel tepeleri topla (komşularından yüksek)
    const peaks = []
    for (let i = 1; i < N - 1; i++) if (h[i] >= h[i - 1] && h[i] >= h[i + 1]) peaks.push(i)

    // 2) ardışık tepe çiftleri arasında yeterince derin çukur var mı?
    for (let p = 0; p < peaks.length - 1; p++) {
      const a = peaks[p]
      for (let q = p + 1; q < peaks.length; q++) {
        const b = peaks[q]
        const span = b - a
        if (span < MIN_SPAN) continue
        if (span > MAX_SPAN) break
        let lowIdx = a
        for (let i = a + 1; i < b; i++) if (h[i] < h[lowIdx]) lowIdx = i
        const depth = Math.min(h[a], h[b]) - h[lowIdx]
        if (depth >= MIN_DEPTH) {
          this.bridges.push({
            x0: a * SX, x1: b * SX,
            y0: h[a], y1: h[b], low: h[lowIdx],
            type: span >= 10 ? 'suspension' : 'truss',   // uzun açıklık = asma köprü
          })
          p = q - 1   // çakışmasın: bu tepeden devam et
          break
        }
      }
    }
  }

  _raw(i) {
    const N = this.N
    if (N < 2) return 0
    const period = 2 * (N - 1)
    let m = ((i % period) + period) % period
    const k = m < N ? m : period - m
    return this.heights[k]
  }

  heightAt(x) {
    const s = x / SX
    const i = Math.floor(s)
    const f = s - i
    return catmull(this._raw(i - 1), this._raw(i), this._raw(i + 1), this._raw(i + 2), f)
  }

  normalAt(x) {
    const h1 = this.heightAt(x - 3), h2 = this.heightAt(x + 3)
    const slope = (h2 - h1) / 6
    const len = Math.hypot(slope, 1)
    return { x: -slope / len, y: 1 / len }
  }

  _heightToPrice(h) {
    return Math.exp(this.priceMin + (clamp(h, 0, AMP) / AMP) * (this.priceMax - this.priceMin))
  }

  _dateAtX(wx) {
    const N = this.N
    const period = 2 * (N - 1)
    let m = ((Math.round(wx / SX) % period) + period) % period
    const k = m < N ? m : period - m
    const t = this.dates && this.dates[k]
    return t ? new Date(t * 1000) : null
  }

  // --------------------------------------------------------------------------
  // SEVİYE — seviyeye göre farklı başlangıç (farklı arazi), bitiş çizgisi, checkpoint'ler
  // --------------------------------------------------------------------------
  _setupLevel() {
    const N = this.N
    const period = 2 * (N - 1) * SX
    // her seviye grafiğin FARKLI bölgesinden başlar → başlangıç/bitiş/arazi değişir
    const off = period > 1 ? (hash32(this.level * 2654435761 + 7) % Math.floor(period)) : 0
    this.startX = SX * 2 + off
    this.finishX = this.startX + this.levelDistanceM * METER
    this.checkpoints = []
    const sp = this.checkpointSpacingM * METER
    for (let cx = this.startX + sp; cx < this.finishX - sp * 0.35; cx += sp) {
      this.checkpoints.push({ x: cx, hit: false })
    }
  }

  // --------------------------------------------------------------------------
  // ARAÇ
  // --------------------------------------------------------------------------
  _initVehicle() {
    const s = this.stats
    const wb = s.wheelBase
    this.wheelR = s.wheelR
    const sus = (s.lv && s.lv.suspension) || 0
    // RAYCAST yay süspansiyonu: teker eksenden 'susRest' kadar aşağı sarkar →
    // görünür yay yolu + yumuşak sürüş. Süspansiyon yükseltmesi yolu uzatır.
    this.susRest = s.wheelR * (0.55 + 0.05 * sus)
    this.susTravel = this.susRest * 0.9

    // Yay sabiti MUTLAK değil, STATİK ÇÖKME'den (sag) türetilir → GRAV/araç/seviye
    // değişse de oran sabit kalır. Box2D testbed sag ≈ %21.6.
    const SAG = 0.22
    this.suspK = ((s.mass * GRAV) / 2) / (SAG * this.susTravel) * (s.suspStiff ?? 1)
    this.suspZeta = 0.65
    this.suspC = 2 * this.suspZeta * Math.sqrt(this.suspK * (s.mass / 2))

    // arka-çekiş ağırlıklı (doğal wheelie + daha az geriye takla) ama ön de çeker (tırmanış gücü)
    this.wheels = [
      { lx: -wb / 2, lyAxle: -s.bodyH * 0.28, drive: true, driveW: 1.0 },   // arka
      { lx: wb / 2, lyAxle: -s.bodyH * 0.28, drive: true, driveW: 0.7 },    // ön
    ]
    this.driveWSum = this.wheels.reduce((a, w) => a + (w.drive ? (w.driveW ?? 1) : 0), 0)

    const startX = this.startX   // _setupLevel'de belirlendi (seviyeye özel)
    // hafif ön-yükle → spawn'da yere oturur, drop-in spin yok
    const restY = this.heightAt(startX) + this.wheelR + this.susRest * 0.7 + s.bodyH * 0.28
    this.car = {
      x: startX, y: restY,
      vx: 0, vy: 0, angle: 0, angVel: 0,
      onGround: false, groundN: { x: 0, y: 1 },
    }
    this.fuel = s.fuelMax
    this._hasLanded = false   // ilk yere değene kadar hava kontrolü yok (spawn spin engeli)
    this._prevX = this.car.x
    this._prevY = this.car.y
    this._lastTrailX = this.car.x
    this.wheelSpin = [0, 0]
    this.suspComp = [0, 0]
    this.wheelSusLen = [this.susRest, this.susRest]
    this.invMass = 1 / s.mass
    const I = s.mass * (s.bodyW * s.bodyW + s.bodyH * s.bodyH) / 12 * 2.6   // 4.0 → 2.6: pitch görünür olsun
    this.invI = 1 / I
  }

  setInput(name, val) {
    if (name in this.input) this.input[name] = !!val
    if (val && this.audio && this.audio.ctx.state === 'suspended') {
      this.audio.ctx.resume().catch(() => {})
    }
  }

  // Gerçek CC0 araç sprite'ları (varsa) — gövde + teker ayrı PNG; yüklenene kadar çizim fallback
  _loadSprites() {
    this.sprites = null
    const sp = this.stats && this.stats.sprite
    if (!sp || typeof Image === 'undefined') return
    const mk = (src) => { try { const im = new Image(); im.src = src; return im } catch { return null } }
    this.sprites = { cfg: sp, body: mk(sp.body), wheel: mk(sp.wheel) }
  }
  _spriteReady() {
    const s = this.sprites
    return !!(s && s.body && s.body.complete && s.body.naturalWidth &&
      s.wheel && s.wheel.complete && s.wheel.naturalWidth)
  }

  // --------------------------------------------------------------------------
  // FİZİK
  // --------------------------------------------------------------------------
  _physics(dt) {
    const car = this.car
    const s = this.stats
    const fwd = this.input.fwd
    const rev = this.input.rev
    const hasFuel = this.fuel > 0

    car.vy -= GRAV * dt

    let groundContacts = 0
    let avgN = { x: 0, y: 0 }
    const cosA = Math.cos(car.angle), sinA = Math.sin(car.angle)
    const rightX = cosA, rightY = sinA
    const upX = -sinA, upY = cosA
    const speed = Math.hypot(car.vx, car.vy)

    for (let wi = 0; wi < this.wheels.length; wi++) {
      const w = this.wheels[wi]
      const axleX = car.x + w.lx * rightX + w.lyAxle * upX
      const axleY = car.y + w.lx * rightY + w.lyAxle * upY
      const gy = this.heightAt(axleX)
      const gap = axleY - gy                          // eksenden yere düşey mesafe

      // teker eksenden 'susRest' aşağı sarkar; temas = (susRest+r) > gap
      let comp = (this.susRest + this.wheelR) - gap
      let susLen = gap - this.wheelR                  // tekerin gövde altında oturduğu boy
      if (susLen > this.susRest) susLen = this.susRest
      if (susLen < this.susRest - this.susTravel) susLen = this.susRest - this.susTravel
      this.wheelSusLen[wi] = susLen
      this.suspComp[wi] = clamp(this.susRest - susLen, 0, this.susTravel)

      if (comp > 0) {
        comp = Math.min(comp, this.susTravel)
        groundContacts++
        const n = this.normalAt(axleX)
        avgN.x += n.x; avgN.y += n.y
        const rx = axleX - car.x
        const ry = axleY - car.y
        const vpx = car.vx - car.angVel * ry
        const vpy = car.vy + car.angVel * rx
        const vn = vpx * n.x + vpy * n.y

        // Asimetrik sönüm — GERÇEK amortisör gibi: sıkışırken YUMUŞAK (tümseği yut),
        // geri açılırken SERT (pogo/zıplamayı kes). Öncesi tam tersiydi (araç zıplıyordu).
        const dampC = vn < 0 ? this.suspC * 0.75 : this.suspC * 1.60
        let Fn = this.suspK * comp - dampC * vn
        if (Fn < 0) Fn = 0
        this._applyImpulse(n.x * Fn * dt, n.y * Fn * dt, rx, ry)

        let tx = n.y, ty = -n.x
        if (tx * rightX + ty * rightY < 0) { tx = -tx; ty = -ty }
        const vt = vpx * tx + vpy * ty

        // "yokuş-yukarı" miktarı (0 düz .. 1 dik yokuş) — travel yönüne göre. Zorluk buradan.
        const gUp = clamp((-n.x * (car.vx >= 0 ? 1 : -1)) / 0.5, 0, 1)  // 0.5 ≈ 30°
        const climb = s.climb || 1
        // YOKUŞ İTKİSİ climb'e bağlı: base araç dik yokuşta ×0.55 güç (thrust<gravity@35° → bogar,
        // momentum şart = "geçilmeze yakın"); yükseltilmiş araç tam güç. DÜZ sürüş ETKİLENMEZ.
        const climbFac = 0.55 + 0.45 * clamp((climb - 1) / 2.1, 0, 1)   // base 0.55 → maxed ~1.0
        const upThrust = 1 - gUp * (1 - climbFac)                       // düz=1, dik-yokuş=climbFac

        // MOTOR: sabit kuvvet + yapay hız duvarı DEĞİL — hedef-hızlı motor + kuvvet tavanı
        // (Box2D b2WheelJoint mantığı). Son hız artık EMERGENT: taper sıfırlandığı yer.
        let drive = 0
        const dir = (fwd ? 1 : 0) - (rev ? 1 : 0)
        if (w.drive && hasFuel && dir !== 0) {
          const dw = (w.driveW ?? 1) / this.driveWSum
          const Fmax = s.torqueTW * s.mass * GRAV * dw * (dir > 0 ? upThrust : 0.55)
          const vT = dir * s.topSpeed * (dir > 0 ? 1 : 0.45)
          const K = Fmax / (0.25 * s.topSpeed)
          drive = clamp((vT - vt) * K, -Fmax * 0.30, Fmax)
        }

        // Yokuş-yukarı tutuşu da 'climb' ile artar (patinaj azalır).
        const maxF = s.grip * Fn * (1 + gUp * (climb - 1) * 0.35)
        let Ft = drive
        if (dir === 0) {
          Ft -= 0.045 * Fn * Math.sign(vt)          // yuvarlanma direnci (gaz bırakınca savrulmadan yavaşla)
          if (Math.abs(vt) < 40) Ft = -vt * 9       // yokuşta tutma: durunca kaymasın
        }
        Ft = clamp(Ft, -maxF, maxF)
        this._applyImpulse(tx * Ft * dt, ty * Ft * dt, rx, ry)
        this.wheelSpin[wi] += (vt / this.wheelR) * dt

        if (fwd && hasFuel && speed > 120 && Math.abs(vt) > 60 && hash32(this._frame * 7 + wi) % 3 === 0) {
          this._spawnDust(axleX, gy, -tx, -ty)
        }
      }
    }

    car.onGround = groundContacts > 0
    if (car.onGround) car.groundN = { x: avgN.x / groundContacts, y: avgN.y / groundContacts }

    // yokuş-aşağı momentum yardımı (Hill-Climb hissi)
    if (car.onGround) {
      const fX = Math.cos(car.angle), fY = Math.sin(car.angle)
      // Yokuş-aşağı yapay itki SİLİNDİ: GRAV=300'de yerçekiminin eğim bileşeni
      // (GRAV·sinθ) zaten doğru ivmeyi veriyor — sahte kuvvete gerek yok.
      // KREST YAPIŞMASI: yalnız küçük dalgaları yut (lastik/süspansiyon uyumu yerine geçer).
      // 0.28 g — daha yüksek olursa gerçek rampalardan da havalanmayı engeller.
      const hC = this.heightAt(car.x)
      const curv = (this.heightAt(car.x - 45) + this.heightAt(car.x + 45)) / 2 - hC
      if (curv < 0) {   // konveks = tepe
        // Artık yalnız 0.12 g: krest yarıçapı ARAZİDE düzeltildiği için (R_CREST kelepçesi)
        // bu manyetiğe neredeyse gerek kalmadı. Eskiden 0.55 g idi ve gerçek rampaları da
        // yapıştırıyordu — yani hack'in kendisi oyunu bozuyordu.
        const stick = Math.min(1, Math.abs(car.vx) / 900) * Math.min(1, -curv / 45) * GRAV * 0.12
        car.vy -= stick * dt
      }
      // OTURAKLI HİS + TIRMANMA: flip tuşuna basılmadıkça aracı zemin eğimine hizala.
      // Dik yokuşta GAZ verirken ön teker kalkma eğilimindedir (wheelie) — bunu 'climb'
      // ile ölçekli bastır: yükseltilmiş araç ön tekeri yerde tutar → daha dik yokuş çıkar.
      if (this._hasLanded && !this.input.flipL && !this.input.flipR) {
        const gA = Math.atan2(car.groundN.x, car.groundN.y)   // zemin açısı (düz=0)
        const align = (-gA - car.angle)                       // hedef(zemine paralel) − mevcut
        const climb = s.climb || 1
        // yokuş yukarı (gA<0 ⇒ zemin yukarı) + gaz + burun fazla yukarıda ⇒ climb ile güçlü çek
        const wheelie = align < 0 && fwd && gA < -0.05
        const k = wheelie ? 5 + 9 * (climb - 1) : 5           // base 5, maxed ~24
        car.angVel += align * k * dt
      }
    }

    // YERDE ÖN/ARKA KALDIRMA — sürerken SOL/SAĞ ile aracın önünü/arkasını kaldır.
    // HIZA ORANTILI: dururken etkisiz, hızlandıkça daha çok kalkar.
    if (car.onGround && this._hasLanded && (this.input.flipL || this.input.flipR)) {
      // Yerde ön/arka kaldırma — kontrol hissi güçlendirildi (kullanıcı: "kontroller zayıf")
      const sf = clamp(speed / (s.topSpeed * 0.26), 0.55, 1)     // düşük hızda da tepki ver
      const target = (this.input.flipL ? 1 : -1) * 0.68 * sf     // ~39° (0.55 = 31° zayıf kalıyordu)
      car.angVel += (target - car.angle) * 26 * dt               // daha çevik servo (18 → 26)
      car.angVel -= car.angVel * 6.0 * dt
    }

    // HAVA KONTROLÜ — SOL/SAĞ = takla:
    //  • Dokunmazsan → araç düz inişe yönelir (güvenli).
    //  • SOL = geri takla, SAĞ = ön takla. Ters inersen kafan yere değer = bitiş.
    if (!car.onGround && this._hasLanded) {
      const a = wrapPi(car.angle)
      // Hava kontrolü: tork + SÖNÜM dengesi hızı belirler (sert clamp değil).
      // α=5.0, λ=1.2 → terminal ω≈3.9 rad/s, tam tur ~2.3sn (kasıtlı, hak edilmiş takla).
      const ramp = clamp(this._physAirTimer / 0.12, 0.5, 1)
      const at = (s.airTorque || 5.0) * ramp
      if (this.input.flipL) car.angVel += at * dt          // SOL → geri takla (CCW) — RİSK
      else if (this.input.flipR) car.angVel -= at * dt     // SAĞ → ön takla (CW) — RİSK
      // dokunma → düz inişe yönel. AERO artık BURAYI güçlendirir (eskiden sönümü BÖLÜP
      // aracı daha hızlı döndürüyordu = yükseltmenin vaadinin tersi).
      else car.angVel += (-a * 14 * s.stability - car.angVel * 6 * s.stability) * dt
    }

    car.vx -= car.vx * 0.035 * dt               // sürüklenme (0.16 çok yüksekti: inişleri öldürüyordu)
    car.vy -= car.vy * 0.02 * dt
    const angDamp = car.onGround ? 4.5 : 1.2    // havada sabit sönüm → dönüş hızını BU belirler
    car.angVel -= car.angVel * angDamp * dt
    car.angVel = clamp(car.angVel, -7.6, 7.6)   // yalnız emniyet ağı — oyunda bağlanmamalı

    car.x += car.vx * dt
    car.y += car.vy * dt
    car.angle += car.angVel * dt

    // kalkış / iniş kenarı
    if (this._wasGroundPhys && !car.onGround) {
      // NOT: eskiden burada "crest fırlatması" vardı (car.vy += vx*0.55+160) — her tepede
      // aracı yapay olarak havaya fırlatıyordu. KALDIRILDI: hava artık yalnızca gerçek
      // momentum + rampa şeklinden doğar (gerçek hill-climb davranışı).
      if (!this.input.flipL && !this.input.flipR) car.angVel *= 0.35
      this._physAirTimer = 0
    } else if (!this._wasGroundPhys && car.onGround) {
      this._pendingLanding = { vy: car.vy, airTime: this._physAirTimer, flips: this._flipsThisAir, angle: wrapPi(car.angle) }
    }
    if (car.onGround) this._hasLanded = true
    if (!car.onGround) this._physAirTimer += dt
    else this._physAirTimer = 0
    this._wasGroundPhys = car.onGround

    // lastik izi (çizginin üstünde, ilerledikçe)
    if (car.onGround && Math.abs(car.x - this._lastTrailX) > 9) {
      const gy = this.heightAt(car.x)
      const hard = speed > s.topSpeed * 0.5 && (fwd || rev)
      this.trail.push({ x: car.x, y: gy + 2, age: 0, hard })
      if (this.trail.length > 130) this.trail.shift()
      this._lastTrailX = car.x
    }

    if (!Number.isFinite(car.x) || !Number.isFinite(car.y)) {
      car.x = this.startX; car.y = this.heightAt(this.startX) + 100
      car.vx = car.vy = car.angVel = 0; car.angle = 0
    }
  }

  _applyImpulse(ix, iy, rx, ry) {
    const car = this.car
    car.vx += ix * this.invMass
    car.vy += iy * this.invMass
    car.angVel += (rx * iy - ry * ix) * this.invI
  }

  _addShake(mag) { this.shake = Math.min(this.shake + mag, 26) }

  // --------------------------------------------------------------------------
  // OYUN DURUMU
  // --------------------------------------------------------------------------
  _update(frameDt) {
    this._frame++
    const car = this.car
    const s = this.stats

    if (this.fuel > 0) {
      let burn = 0.5
      if (this.input.fwd || this.input.rev) burn = 5   // depo daha uzun sürer → checkpoint'e ulaşılır
      this.fuel = Math.max(0, this.fuel - burn * frameDt)
    }

    // EGZOZ DUMANI — gaz verirken, motor seviyesiyle yoğunlaşır
    if (this.input.fwd && this.fuel > 0) {
      const eng = (s.lv && s.lv.engine) || 0
      const every = Math.max(1, 3 - Math.floor(eng / 4))
      if (this._frame % every === 0) {
        const cosA = Math.cos(car.angle), sinA = Math.sin(car.angle)
        const bx = car.x - cosA * (s.bodyW * 0.5 + 4) + (-sinA) * (s.bodyH * 0.15)
        const by = car.y - sinA * (s.bodyW * 0.5 + 4) + (cosA) * (s.bodyH * 0.15)
        this._spawnSmoke(bx, by, -cosA, -sinA, eng)
      }
    }

    this.run.distanceM = Math.max(this.run.distanceM, (car.x - this.startX) / METER)
    const spd = Math.hypot(car.vx, car.vy)
    this.run.maxSpeed = Math.max(this.run.maxSpeed, spd)

    // CHECKPOINT geçişi → yakıt dolar + ödül (dağınık depo yerine buradan yakıt)
    for (const cp of this.checkpoints) {
      if (!cp.hit && car.x >= cp.x) {
        cp.hit = true
        this.run.checkpoints++
        this.fuel = s.fuelMax
        this._addFloat(cp.x, this.heightAt(cp.x) + 62, 'CHECKPOINT · YAKIT DOLDU', '#38bdf8')
        this._beep(720, 0.1); this._addShake(3); this._spawnSparkle(cp.x, this.heightAt(cp.x) + 30)
      }
    }
    // BİTİŞ çizgisi → seviye tamamlandı (SONLU tur)
    if (this._hasLanded && car.x >= this.finishX) return this._finish()

    // hava / takla kombosu
    if (!car.onGround) {
      this._airTimer += frameDt
      this._airAccum += car.angVel * frameDt
      if (Math.abs(this._airAccum) >= Math.PI * 1.3) {   // ~234° = bir tur döndü
        this._flipsThisAir++
        this._airAccum -= Math.sign(this._airAccum) * Math.PI * 1.3
        this._beep(560 + this._flipsThisAir * 110, 0.06)
        this._combo = this._flipsThisAir
        this._comboFlash = this._frame
      }
    } else {
      if (this._airTimer > 0.5) this.run.airTime += this._airTimer
      this._airTimer = 0; this._airAccum = 0; this._flipsThisAir = 0; this._combo = 0
    }

    // iniş kalitesi
    if (this._pendingLanding) {
      const Lp = this._pendingLanding; this._pendingLanding = null
      const gN = car.groundN
      const groundAngle = Math.atan2(gN.x, gN.y)
      // Kaza toleransı artık DARBE HIZINA ve süspansiyon seviyesine bağlı (sabit 88.8° değil).
      const impact = clamp(-Lp.vy / (GRAV * 1.6), 0, 1)
      const tol = (1.30 + 0.45 * ((s.landing || 1) - 1)) * (1 - 0.35 * impact)
      if (Math.abs(Lp.angle) > tol) {
        return this._gameOver('crash')     // TERS / YAN İNDİ → oyun biter
      }
      if (Lp.flips >= 1) {
        this.run.flips += Lp.flips
        car.angle = -groundAngle
        car.angVel *= 0.2
        const coin = 14 * Lp.flips
        this.run.coins += coin
        this._addFloat(car.x, car.y + 55, (Lp.flips > 1 ? Lp.flips + 'X TAKLA! +' : 'TAKLA! +') + coin, '#fbbf24')
        this._beep(1040, 0.12); this._addShake(5); this._spawnSparkle(car.x, car.y + 20)
      } else if (Lp.airTime > 0.4) {
        const misalign = Math.abs(wrapPi(car.angle + groundAngle))
        if (misalign < 0.32) {
          this.run.coins += 8
          this._addFloat(car.x, car.y + 55, 'MÜKEMMEL İNİŞ!', '#22c55e')
          this._beep(990, 0.12); this._addShake(4); this._spawnSparkle(car.x, car.y + 20)
        } else if (Lp.vy < -490) {                       // GRAV=680 ölçeğine göre
          this._addShake(clamp(-Lp.vy / 76, 4, 16))
          this._spawnPoof(car.x, this.heightAt(car.x), -Lp.vy / 55)
        }
      }
    }

    this._collect()
    this._stepParticles(frameDt)
    this.shake = Math.max(0, this.shake - this.shake * Math.min(1, 12 * frameDt))
    this._updateAudio(spd)

    // ÇARPMA — SÜRÜCÜNÜN KAFASI YERE DEĞERSE oyun ANINDA biter.
    const cosA = Math.cos(car.angle), sinA = Math.sin(car.angle)
    const headX = car.x + (-sinA) * (s.bodyH * 0.5 + 14)
    const headY = car.y + (cosA) * (s.bodyH * 0.5 + 14)
    if (this._hasLanded && headY <= this.heightAt(headX)) {
      if (!car.onGround && this._airTimer > 0.4) this.run.airTime += this._airTimer
      return this._gameOver('crash')
    }

    if (this.fuel <= 0) {
      if (spd < 40 && car.onGround) {
        this._noGroundFuel += frameDt
        if (this._noGroundFuel > 1.2) return this._gameOver('fuel')
      } else this._noGroundFuel = 0
    }

    this._prevX = car.x; this._prevY = car.y

    this.stateClock += frameDt
    if (this.stateClock > 0.08) { this.stateClock = 0; this._emitState() }
  }

  _emitState() {
    const s = this.stats
    const car = this.car
    const price = this._heightToPrice(this.heightAt(car.x))
    const dist = Math.max(0, (car.x - this.startX) / METER)
    this.onState({
      distanceM: Math.round(this.run.distanceM),
      coins: this.run.coins,
      flips: this.run.flips,
      fuel: this.fuel,
      fuelPct: clamp(this.fuel / s.fuelMax, 0, 1),
      speed: Math.round(Math.hypot(car.vx, car.vy) / 9),
      airborne: !car.onGround,
      flipsThisAir: this._flipsThisAir,
      combo: this._combo,
      comboFlash: this._comboFlash,
      price,
      // SEVİYE HUD
      level: this.level,
      levelDistanceM: this.levelDistanceM,
      progress: clamp(dist / this.levelDistanceM, 0, 1),
      remainM: Math.max(0, Math.round(this.levelDistanceM - dist)),
      checkpointsHit: this.run.checkpoints,
      checkpointsTotal: this.checkpoints.length,
    })
  }

  _finish() {
    if (this.over) return
    this.won = true
    this.run.distanceM = Math.max(this.run.distanceM, this.levelDistanceM)
    this._addFloat(this.car.x, this.car.y + 62, 'BİTİŞ! 🏁', '#22c55e')
    this._beep(1200, 0.2); this._addShake(6); this._spawnSparkle(this.car.x, this.car.y + 20)
    this._gameOver('finish')
  }

  _collect() {
    const car = this.car
    const prevX = this._prevX ?? car.x
    const loX = Math.min(prevX, car.x) - 28
    const hiX = Math.max(prevX, car.x) + 28
    const gLine = this.heightAt(car.x)
    const range = 6
    const iCar = Math.round(car.x / SX)
    for (let i = iCar - range; i <= iCar + range; i++) {
      if (i < 1) continue
      const c = this._collectibleAt(i)
      if (!c) continue
      const id = c.type === 'fuel' ? 'f' + i : 'c' + i
      if (this.collected.has(id)) continue
      const pickupY = c.type === 'fuel' ? 64 : 52
      const refY = c.high ? car.y : gLine    // alçak paralar çizgiye göre, yüksek arklar araca göre
      if (c.x >= loX && c.x <= hiX && Math.abs(refY - c.y) < pickupY) {
        this.collected.add(id)
        if (c.type === 'fuel') {
          this.fuel = Math.min(this.stats.fuelMax, this.fuel + this.stats.fuelMax * 0.3)
          this._addFloat(c.x, c.y, '+YAKIT', '#26a69a'); this._beep(440, 0.1)
        } else {
          this.run.coins += c.high ? 3 : 1
          this._addFloat(c.x, c.y, c.high ? '+3' : '+1', '#fbbf24')
          this._spawnSparkle(c.x, c.y); this._beep(880, 0.05)
        }
      }
    }
  }

  _collectibleAt(i) {
    if (i < 1) return null
    const x = i * SX
    // yalnız seviye sınırları içinde (yakıt artık checkpoint'lerden gelir, dağınık depo YOK)
    if (x < this.startX || x > this.finishX) return null
    const h = hash32(i)
    // yüksek bonus ark (zıplayarak ulaşılır) — çok seyrek
    if (h % 100 < 4) return { type: 'coin', high: true, x, y: this.heightAt(x) + 120 + (h % 40) }
    // çizginin hemen üstünde seyrek paralar
    if (h % 100 < 22) return { type: 'coin', x, y: this.heightAt(x) + 22 + (h % 16) }
    return null
  }

  // --------------------------------------------------------------------------
  // PARÇACIKLAR
  // --------------------------------------------------------------------------
  _spawnDust(x, y, dx, dy) {
    if (this.particles.length > 220) return
    this.particles.push({ kind: 'dust', x, y, vx: dx * 40 + (hash32(x | 0) % 30 - 15), vy: 30 + (hash32(y | 0) % 40), life: 0.5, age: 0, r: 5 + (hash32((x + y) | 0) % 6) })
  }
  _spawnSmoke(x, y, dx, dy, eng) {
    if (this.particles.length > 240) return
    const spd = 26 + eng * 4
    this.particles.push({ kind: 'smoke', x, y, vx: dx * spd + (hash32(this._frame) % 20 - 10), vy: -18 - (hash32(x | 0) % 18), life: 0.5 + eng * 0.02, age: 0, r: 4 + eng * 0.5 })
  }
  _spawnSparkle(x, y) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      this.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130 + 40, life: 0.45, age: 0, r: 3 })
    }
  }
  _spawnPoof(x, y, power) {
    const n = Math.round(clamp(power, 6, 16))
    for (let k = 0; k < n; k++) {
      const a = -0.3 + (k / n) * (Math.PI + 0.6)
      this.particles.push({ kind: 'dust', x, y, vx: Math.cos(a) * 160, vy: Math.abs(Math.sin(a)) * 120, life: 0.6, age: 0, r: 6 + (k % 5) })
    }
  }
  _spawnDebris() {
    const s = this.stats, car = this.car
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      this.particles.push({ kind: 'shard', x: car.x, y: car.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200 + 100, life: 1.2, age: 0, r: 4, col: k % 2 ? s.color : s.accent, rot: a })
    }
  }
  _addFloat(x, y, text, color) { this.floatTexts.push({ x, y, text, color, life: 1.1, age: 0 }) }

  _stepParticles(dt) {
    for (const p of this.particles) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt
      if (p.kind === 'dust') { p.vy -= 60 * dt; p.vx *= 0.92 }
      else if (p.kind === 'smoke') { p.vy -= 30 * dt; p.vx *= 0.94 }
      else if (p.kind === 'shard') { p.vy -= 400 * dt }
      else p.vy -= 200 * dt
    }
    this.particles = this.particles.filter((p) => p.age < p.life)
    for (const f of this.floatTexts) { f.age += dt; f.y += 32 * dt }
    this.floatTexts = this.floatTexts.filter((f) => f.age < f.life)
    for (const t of this.trail) t.age += dt
    this.trail = this.trail.filter((t) => t.age < 2.2)
  }

  // --------------------------------------------------------------------------
  // SES
  // --------------------------------------------------------------------------
  _initAudio() {
    this.audio = null
    if (!this.soundOn) return
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'; osc.frequency.value = 80; gain.gain.value = 0
      osc.connect(gain); gain.connect(ctx.destination); osc.start()
      this.audio = { ctx, osc, gain }
    } catch { this.audio = null }
  }
  _updateAudio(speed) {
    if (!this.audio) return
    const throttle = (this.input.fwd || this.input.rev) && this.fuel > 0
    const target = throttle ? 0.06 : 0.015
    const freq = 70 + clamp(speed / 8, 0, 200) + (throttle ? 40 : 0)
    try {
      this.audio.gain.gain.value += (target - this.audio.gain.gain.value) * 0.2
      this.audio.osc.frequency.value += (freq - this.audio.osc.frequency.value) * 0.3
    } catch { /* yoksay */ }
  }
  _beep(freq, dur) {
    if (!this.audio) return
    try {
      const ctx = this.audio.ctx
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = freq; o.type = 'square'; g.gain.value = 0.04
      o.connect(g); g.connect(ctx.destination); o.start()
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur)
      o.stop(ctx.currentTime + dur + 0.02)
    } catch { /* yoksay */ }
  }
  _stopAudio() {
    if (!this.audio) return
    try { this.audio.osc.stop(); this.audio.ctx.close() } catch { /* yoksay */ }
    this.audio = null
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------
  _resize() {
    const canvas = this.canvas
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = canvas.clientWidth || 800
    const h = canvas.clientHeight || 500
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    this.dpr = dpr; this.viewW = w; this.viewH = h
    // Kamera: araç net görünsün (yükseltmeler seçilsin) ama tepeler de gelirken görünsün.
    // Sürat arttıkça _render'da geri çekilir (aşağı bak).
    this.zoomBase = clamp(h / 1800, 0.23, 0.42)
    if (this._zoom == null) this._zoom = this.zoomBase
  }

  _rows(H) {
    const top = H * 0.07, bot = H - TAXH - 8
    return Array.from({ length: 6 }, (_, i) => Math.round(top + (bot - top) * (i / 5)) + 0.5)
  }

  _render(frameDt) {
    const ctx = this.ctx
    const W = this.viewW, H = this.viewH
    const car = this.car
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const spd = Math.hypot(car.vx, car.vy)
    const k = (rate) => 1 - Math.exp(-rate * Math.min(frameDt, 0.05))
    // daha çok ileriye bakan, biraz daha yumuşak kamera (yaklaşan tepeleri gör)
    const lookAhead = clamp(car.vx * 0.40 + Math.sign(car.vx) * spd * 0.05, -240, 620)
    const tgtX = car.x + lookAhead
    const tgtY = car.y + 64 + spd * 0.010 + (!car.onGround ? 70 : 0)
    this.camX = lerp(this.camX ?? car.x, tgtX, k(10))
    this.camY = lerp(this.camY ?? car.y, tgtY, k(7))
    const zTarget = this.zoomBase * clamp(1 - spd / 6000, 0.70, 1)   // hızlıyken daha çok geri çekil
    this._zoom = lerp(this._zoom ?? this.zoomBase, zTarget, k(3))
    const zoom = this._zoom

    const sh = this.shake
    const ox = sh ? (Math.random() * 2 - 1) * sh : 0
    const oy = sh ? (Math.random() * 2 - 1) * sh * 1.3 : 0
    const sx = (wx) => (wx - this.camX) * zoom + W / 2 + ox
    const sy = (wy) => H / 2 - (wy - this.camY) * zoom + oy

    // ARKA PLAN (uzaktan yakına): gökyüzü → şehir silüeti → bulut → ızgara
    this._drawSky(ctx, W, H)
    this._drawSkyline(ctx, W, H)
    this._drawClouds(ctx, W, H)
    this._drawGrid(ctx, W, H, sx)
    this._drawWatermark(ctx, W, H)
    this._drawBridges(ctx, W, H, sx, sy)      // vadi köprüleri — pist çizgisinin ARKASINDA (dekor)
    this._drawAreaLine(ctx, W, H, sx, sy)
    this._drawLevelMarkers(ctx, W, H, sx, sy)
    this._drawTrail(ctx, sx, sy, zoom)
    this._drawCollectibles(ctx, sx, sy, zoom)
    this._drawParticles(ctx, sx, sy, zoom)
    this._drawVehicle(ctx, sx, sy, zoom)
    this._drawFloatTexts(ctx, sx, sy)
    this._drawPriceTag(ctx, W, H, sx, sy)
    this._drawPriceGutter(ctx, W, H)
    this._drawTimeAxis(ctx, W, H, sx)
    this._drawLegend(ctx, W, H)
    this._drawSpeedLines(ctx, W, H, spd)
  }

  _drawSky(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#0f1420'); g.addColorStop(0.5, '#0c0f18'); g.addColorStop(1, '#090b11')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    // yumuşak ışık halesi (hafif parallax güneş/ay) — trend rengine göre tonlanır
    const gx = W * 0.74 - (this.camX * 0.02) % (W * 2)
    const rg = ctx.createRadialGradient(gx, H * 0.20, 0, gx, H * 0.20, H * 0.6)
    const tint = this.up ? '38,166,154' : '41,98,255'
    rg.addColorStop(0, `rgba(${tint},0.13)`); rg.addColorStop(0.5, `rgba(${tint},0.04)`); rg.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H)
  }

  // Arka planda MUM ÇUBUĞU ŞEHRİ silüeti — iki parallax katmanı (borsa teması)
  _drawSkyline(ctx, W, H) {
    const horizon = H * 0.72
    const layers = [
      { par: 0.09, step: 34, w: 20, alpha: 0.13, maxH: H * 0.26, salt: 17 },
      { par: 0.20, step: 42, w: 27, alpha: 0.22, maxH: H * 0.36, salt: 91 },
    ]
    for (const Ly of layers) {
      const scroll = this.camX * Ly.par
      const first = Math.floor((scroll - Ly.w) / Ly.step)
      const last = Math.ceil((scroll + W + Ly.w) / Ly.step)
      for (let i = first; i <= last; i++) {
        const hsh = hash32(i * 131 + Ly.salt)
        const x = i * Ly.step - scroll
        if (x < -Ly.w || x > W + Ly.w) continue
        const hh = (0.26 + (hsh % 1000) / 1000 * 0.74) * Ly.maxH
        const up = ((hsh >> 12) & 1) === 0
        const col = up ? '38,166,154' : '239,83,80'
        const bodyTop = horizon - hh
        const cx = x + Ly.w / 2
        // fitil
        ctx.strokeStyle = `rgba(${col},${Ly.alpha * 0.75})`; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(cx, bodyTop - hh * 0.16); ctx.lineTo(cx, horizon + 4); ctx.stroke()
        // gövde
        ctx.fillStyle = `rgba(${col},${Ly.alpha})`
        ctx.fillRect(x, bodyTop, Ly.w, hh)
      }
    }
    // ufuk çizgisi tonu (silüeti zemine bağlar)
    const hg = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 40)
    hg.addColorStop(0, 'rgba(9,11,17,0)'); hg.addColorStop(1, 'rgba(9,11,17,0.55)')
    ctx.fillStyle = hg; ctx.fillRect(0, horizon - 40, W, 80)
  }

  _drawClouds(ctx, W, H) {
    const par = 0.05, step = W * 0.66, puff = W * 0.09
    const scroll = this.camX * par
    const first = Math.floor((scroll - puff) / step) - 1
    const last = Math.ceil((scroll + W + puff) / step) + 1
    for (let i = first; i <= last; i++) {
      const hsh = hash32(i * 769 + 13)
      const x = i * step - scroll + (hsh % 90)
      const y = H * (0.07 + (hsh % 1000) / 1000 * 0.16)
      if (x < -puff * 2 || x > W + puff * 2) continue
      ctx.fillStyle = 'rgba(180,190,205,0.045)'
      for (let b = 0; b < 4; b++) {
        const bx = x + (b - 1.5) * puff * 0.44
        const br = puff * (0.5 + (hash32(i * 31 + b) % 50) / 100)
        ctx.beginPath(); ctx.ellipse(bx, y, br, br * 0.5, 0, 0, Math.PI * 2); ctx.fill()
      }
    }
  }

  _drawGrid(ctx, W, H, sx) {
    const gx = SX * 4
    const left = this.camX - W / (2 * this._zoom)
    let wx0 = Math.ceil(left / gx) * gx
    ctx.strokeStyle = TV.gridV; ctx.lineWidth = 1
    ctx.beginPath()
    for (let wx = wx0; ; wx += gx) {
      const px = Math.round(sx(wx)) + 0.5
      if (px > W) break
      if (px < 0) continue
      ctx.moveTo(px, 0); ctx.lineTo(px, H)
    }
    ctx.stroke()
    ctx.strokeStyle = TV.grid
    ctx.beginPath()
    for (const py of this._rows(H)) { ctx.moveTo(0, py); ctx.lineTo(W - AXW, py) }
    ctx.stroke()
  }

  _drawWatermark(ctx, W, H) {
    ctx.save()
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(120,123,134,0.06)'
    ctx.font = '700 64px -apple-system,Segoe UI,sans-serif'
    ctx.fillText(this.symbol, W / 2, H * 0.40)
    ctx.font = '600 16px -apple-system,Segoe UI,sans-serif'
    ctx.fillStyle = 'rgba(120,123,134,0.05)'
    ctx.fillText('BIST · 15DK', W / 2, H * 0.40 + 42)
    ctx.restore()
  }

  _drawAreaLine(ctx, W, H, sx, sy) {
    const accent = this.up ? TV.up : TV.down
    const left = this.camX - (W / 2) / this._zoom - 40
    const right = this.camX + (W / 2) / this._zoom + 40
    const stepW = Math.max(8, SX / 8)
    const pts = []
    for (let wx = left; wx <= right; wx += stepW) pts.push([sx(wx), sy(this.heightAt(wx))])
    // alan dolgu
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.lineTo(pts[pts.length - 1][0], H); ctx.lineTo(pts[0][0], H); ctx.closePath()
    const g = ctx.createLinearGradient(0, 0, 0, H)
    const rgb = this.up ? '38,166,154' : '239,83,80'
    g.addColorStop(0, `rgba(${rgb},0.32)`); g.addColorStop(0.55, `rgba(${rgb},0.09)`); g.addColorStop(1, `rgba(${rgb},0)`)
    ctx.fillStyle = g; ctx.fill()
    // çizgi (glow + crisp)
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.shadowColor = accent; ctx.shadowBlur = 10
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.stroke()
    ctx.shadowBlur = 0
  }

  // VADİ KÖPRÜLERİ — derin uçurumları geçen dekor yapılar (fizik YOK, çizgi arkasında).
  // Ping-pong arazi periyoduna göre tekrarlanır, böylece her seviyede görünür.
  _drawBridges(ctx, W, H, sx, sy) {
    if (!this.bridges || !this.bridges.length) return
    const zoom = this._zoom
    const left = this.camX - (W / 2) / zoom - SX * 2
    const right = this.camX + (W / 2) / zoom + SX * 2
    const period = 2 * (this.N - 1) * SX
    const kStart = Math.floor(left / period) - 1, kEnd = Math.ceil(right / period) + 1

    for (let k = kStart; k <= kEnd; k++) {
      const shift = k * period
      for (const b of this.bridges) {
        // ping-pong: tek periyotlarda ayna görüntüsü
        const mirror = ((k % 2) + 2) % 2 === 1
        const bx0 = mirror ? shift + (period - b.x1) : shift + b.x0
        const bx1 = mirror ? shift + (period - b.x0) : shift + b.x1
        if (bx1 < left || bx0 > right) continue
        const y0 = mirror ? b.y1 : b.y0, y1 = mirror ? b.y0 : b.y1

        const X0 = sx(bx0), X1 = sx(bx1)
        const Y0 = sy(y0), Y1 = sy(y1)
        const deckLift = 10 * zoom                      // tabliye tepe kotasının biraz üstünde
        const D0 = Y0 - deckLift, D1 = Y1 - deckLift
        const span = X1 - X0
        if (span < 6) continue
        const lowY = sy(b.low)

        ctx.save()
        ctx.globalAlpha = 0.55                          // arka planda kalsın (pist öne çıksın)

        // AYAKLAR (pylon) — vadi tabanına inen dikmeler
        ctx.strokeStyle = '#4a5162'; ctx.lineWidth = Math.max(1.5, 3.5 * zoom)
        const piers = b.type === 'suspension' ? 2 : 3
        for (let p = 1; p <= piers; p++) {
          const t = p / (piers + 1)
          const px = X0 + span * t, py = D0 + (D1 - D0) * t
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, lowY); ctx.stroke()
          // çapraz destek
          ctx.lineWidth = Math.max(1, 1.6 * zoom)
          ctx.beginPath(); ctx.moveTo(px - 6 * zoom, lowY); ctx.lineTo(px, py + (lowY - py) * 0.45); ctx.lineTo(px + 6 * zoom, lowY); ctx.stroke()
          ctx.lineWidth = Math.max(1.5, 3.5 * zoom)
        }

        if (b.type === 'suspension') {
          // ASMA KÖPRÜ: iki kule + kablo eğrisi + askı telleri
          const towerH = 46 * zoom
          for (const [tx, ty] of [[X0 + span * 0.18, D0 + (D1 - D0) * 0.18], [X0 + span * 0.82, D0 + (D1 - D0) * 0.82]]) {
            ctx.strokeStyle = '#5b6478'; ctx.lineWidth = Math.max(2, 4 * zoom)
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - towerH); ctx.stroke()
          }
          const tx0 = X0 + span * 0.18, ty0 = D0 + (D1 - D0) * 0.18 - towerH
          const tx1 = X0 + span * 0.82, ty1 = D0 + (D1 - D0) * 0.82 - towerH
          ctx.strokeStyle = 'rgba(148,163,184,0.9)'; ctx.lineWidth = Math.max(1.2, 2.2 * zoom)
          ctx.beginPath(); ctx.moveTo(X0, D0)
          ctx.quadraticCurveTo((tx0 + tx1) / 2, Math.max(ty0, ty1) + 34 * zoom, X1, D1)
          ctx.stroke()
          // askı telleri
          ctx.lineWidth = Math.max(0.6, 1 * zoom); ctx.strokeStyle = 'rgba(148,163,184,0.55)'
          for (let t = 0.12; t <= 0.88; t += 0.09) {
            const hx = X0 + span * t, hy = D0 + (D1 - D0) * t
            const cy = (1 - t) * (1 - t) * D0 + 2 * (1 - t) * t * (Math.max(ty0, ty1) + 34 * zoom) + t * t * D1
            ctx.beginPath(); ctx.moveTo(hx, cy); ctx.lineTo(hx, hy); ctx.stroke()
          }
        } else {
          // KAFES (truss) KÖPRÜ: üçgen örgü
          ctx.strokeStyle = 'rgba(120,131,150,0.85)'; ctx.lineWidth = Math.max(1, 1.8 * zoom)
          const trussH = 16 * zoom, segs = Math.max(4, Math.round(span / (26 * zoom)))
          ctx.beginPath(); ctx.moveTo(X0, D0 - trussH); ctx.lineTo(X1, D1 - trussH); ctx.stroke()
          for (let sIdx = 0; sIdx <= segs; sIdx++) {
            const t = sIdx / segs, ux = X0 + span * t, uy = D0 + (D1 - D0) * t
            ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(ux, uy - trussH); ctx.stroke()
            if (sIdx < segs) {
              const t2 = (sIdx + 1) / segs, vx = X0 + span * t2, vy = D0 + (D1 - D0) * t2
              ctx.beginPath(); ctx.moveTo(ux, uy); ctx.lineTo(vx, vy - trussH); ctx.stroke()
            }
          }
        }

        // TABLİYE (deck)
        ctx.strokeStyle = '#8b95a8'; ctx.lineWidth = Math.max(2, 4.5 * zoom)
        ctx.beginPath(); ctx.moveTo(X0, D0); ctx.lineTo(X1, D1); ctx.stroke()
        ctx.restore()
      }
    }
  }

  // CHECKPOINT bayrakları (yakıt) + BİTİŞ çizgisi (dama kapısı) — seviye pisti
  _drawLevelMarkers(ctx, W, H, sx, sy) {
    const zoom = this._zoom
    const left = this.camX - (W / 2) / zoom - SX
    const right = this.camX + (W / 2) / zoom + SX

    // checkpoint direkleri (mavi bayrak + ⛽)
    for (const cp of this.checkpoints) {
      if (cp.x < left || cp.x > right) continue
      const gy = this.heightAt(cp.x)
      const bx = sx(cp.x), by = sy(gy)
      const poleH = 50 * zoom
      ctx.strokeStyle = cp.hit ? 'rgba(56,189,248,0.45)' : 'rgba(56,189,248,0.95)'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - poleH); ctx.stroke()
      const fw = 26 * zoom, fh = 18 * zoom, fy = by - poleH
      ctx.fillStyle = cp.hit ? 'rgba(56,189,248,0.3)' : '#38bdf8'
      ctx.beginPath(); ctx.moveTo(bx, fy); ctx.lineTo(bx + fw, fy + fh * 0.5); ctx.lineTo(bx, fy + fh); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = `${13 * zoom}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('⛽', bx + fw * 0.4, fy + fh * 0.5); ctx.textBaseline = 'alphabetic'
    }

    // BİTİŞ çizgisi (dama kapısı)
    if (this.finishX >= left && this.finishX <= right) {
      const gy = this.heightAt(this.finishX)
      const bx = sx(this.finishX), by = sy(gy)
      const gateH = 120 * zoom
      ctx.strokeStyle = '#e6e9ee'; ctx.lineWidth = 5 * zoom
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - gateH); ctx.stroke()
      const cols = 2, rows = 8, cw = 11 * zoom, chh = gateH / rows
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#11151d' : '#e6e9ee'
        ctx.fillRect(bx + 2 * zoom + c * cw, by - gateH + r * chh, cw, chh)
      }
      ctx.fillStyle = '#22c55e'; ctx.font = `800 ${13 * zoom}px -apple-system,Segoe UI,sans-serif`
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
      ctx.fillText('🏁 BİTİŞ', bx + 2 * zoom, by - gateH - 6 * zoom)
    }
  }

  _drawTrail(ctx, sx, sy, zoom) {
    if (this.trail.length < 2) return
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1], b = this.trail[i]
      if (Math.abs(b.x - a.x) > SX) continue
      const al = (1 - b.age / 2.2) * 0.5
      ctx.strokeStyle = b.hard ? `rgba(10,10,14,${al})` : `rgba(20,24,34,${al * 0.8})`
      ctx.lineWidth = (b.hard ? 6 : 3.5) * zoom; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke()
    }
  }

  _drawCollectibles(ctx, sx, sy, zoom) {
    const left = this.camX - this.viewW / (2 * zoom) - SX
    const right = this.camX + this.viewW / (2 * zoom) + SX
    const iStart = Math.max(1, Math.floor(left / SX))
    const iEnd = Math.ceil(right / SX)
    const t = this._frame * 0.08
    for (let i = iStart; i <= iEnd; i++) {
      const c = this._collectibleAt(i)
      if (!c) continue
      const id = c.type === 'fuel' ? 'f' + i : 'c' + i
      if (this.collected.has(id)) continue
      const px = sx(c.x), py = sy(c.y) + Math.sin(t + i) * 3
      if (c.type === 'fuel') {
        const z = 11 * zoom
        ctx.fillStyle = TV.up; ctx.strokeStyle = '#0b3b34'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.rect(px - z, py - z * 1.2, z * 2, z * 2.2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#fff'; ctx.font = `bold ${10 * zoom}px sans-serif`; ctx.textAlign = 'center'
        ctx.fillText('⛽', px, py + 3 * zoom)
      } else {
        const r = (c.high ? 11 : 9) * zoom
        ctx.save(); ctx.shadowColor = 'rgba(251,191,36,0.7)'; ctx.shadowBlur = 8
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fillStyle = c.high ? '#f59e0b' : '#fbbf24'; ctx.fill()
        ctx.restore()
        ctx.strokeStyle = '#a16207'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke()
        ctx.fillStyle = '#7c2d12'; ctx.font = `bold ${10 * zoom}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('₺', px, py + 0.5); ctx.textBaseline = 'alphabetic'
      }
    }
  }

  _drawParticles(ctx, sx, sy, zoom) {
    for (const p of this.particles) {
      const px = sx(p.x), py = sy(p.y)
      const a = 1 - p.age / p.life
      if (p.kind === 'dust') {
        ctx.fillStyle = `rgba(120,123,134,${a * 0.45})`
        ctx.beginPath(); ctx.arc(px, py, p.r * zoom * (1 + p.age), 0, Math.PI * 2); ctx.fill()
      } else if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(120,124,134,${a * 0.32})`
        ctx.beginPath(); ctx.arc(px, py, p.r * zoom * (1 + p.age * 1.6), 0, Math.PI * 2); ctx.fill()
      } else if (p.kind === 'shard') {
        ctx.save(); ctx.translate(px, py); ctx.rotate(p.age * 8)
        ctx.fillStyle = p.col; ctx.fillRect(-3 * zoom, -1.5 * zoom, 6 * zoom, 3 * zoom); ctx.restore()
      } else {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = `rgba(251,191,36,${a})`; ctx.beginPath(); ctx.arc(px, py, p.r * zoom, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
    }
  }

  _drawFloatTexts(ctx, sx, sy) {
    for (const f of this.floatTexts) {
      const a = 1 - f.age / f.life
      ctx.globalAlpha = a; ctx.fillStyle = f.color
      ctx.font = 'bold 16px -apple-system,Segoe UI,sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(f.text, sx(f.x), sy(f.y)); ctx.globalAlpha = 1
    }
  }

  _drawPriceTag(ctx, W, H, sx, sy) {
    const car = this.car
    const px = sx(car.x), py = sy(car.y)
    const gutterX = W - AXW
    const up = this.up
    const col = up ? TV.up : TV.down
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(120,123,134,0.5)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(gutterX, py); ctx.stroke(); ctx.setLineDash([]); ctx.restore()
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
  }

  _drawPriceGutter(ctx, W, H) {
    const gutterX = W - AXW
    ctx.fillStyle = TV.bg; ctx.fillRect(gutterX, 0, AXW, H)
    ctx.strokeStyle = TV.axisLine; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(gutterX + 0.5, 0); ctx.lineTo(gutterX + 0.5, H); ctx.stroke()
    ctx.font = '11px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    for (const py of this._rows(H)) {
      const worldY = this.camY + (H / 2 - py) / this._zoom
      const price = this._heightToPrice(worldY)
      ctx.fillStyle = TV.axisText
      ctx.fillText(price >= 100 ? price.toFixed(0) : price.toFixed(2), gutterX + 6, py)
    }
    const car = this.car
    const py = clamp(H / 2 - (car.y - this.camY) * this._zoom, 12, H - TAXH - 12)
    const price = this._heightToPrice(this.heightAt(car.x))
    const col = this.up ? TV.up : TV.down
    ctx.fillStyle = col; this._roundRect(ctx, gutterX, py - 10, AXW, 20, 3); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = '700 11px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(price >= 100 ? price.toFixed(1) : price.toFixed(2), gutterX + AXW / 2, py)
    ctx.textBaseline = 'alphabetic'
  }

  _drawTimeAxis(ctx, W, H, sx) {
    const baseY = H - TAXH
    ctx.fillStyle = TV.bg; ctx.fillRect(0, baseY, W, TAXH)
    ctx.strokeStyle = TV.axisLine; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, baseY + 0.5); ctx.lineTo(W, baseY + 0.5); ctx.stroke()
    const gx = SX * 4
    const left = this.camX - W / (2 * this._zoom)
    let wx0 = Math.ceil(left / gx) * gx
    ctx.fillStyle = TV.axisText; ctx.font = '10px -apple-system,Segoe UI,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (let wx = wx0; ; wx += gx) {
      const px = sx(wx)
      if (px > W - AXW) break
      if (px < 8) continue
      const d = this._dateAtX(wx)
      if (!d) continue
      const label = d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
      ctx.fillText(label, px, baseY + TAXH / 2)
    }
  }

  _drawLegend(ctx, W, H) {
    const car = this.car
    const price = this._heightToPrice(this.heightAt(car.x))
    const base = this._heightToPrice(this.heightAt(this.startX))
    const chg = (price / base - 1) * 100
    const up = chg >= 0
    const col = up ? TV.up : TV.down
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = TV.text; ctx.font = '700 15px -apple-system,Segoe UI,sans-serif'
    ctx.fillText(this.symbol, 14, 24)
    ctx.font = '600 13px -apple-system,Segoe UI,sans-serif'; ctx.fillStyle = col
    ctx.fillText(`${price.toFixed(2)}  ${up ? '+' : ''}${chg.toFixed(2)}%`, 14, 44)
    const d = this._dateAtX(car.x)
    if (d) { ctx.fillStyle = TV.axisText; ctx.font = '11px -apple-system,Segoe UI,sans-serif'; ctx.fillText(d.toLocaleDateString('tr-TR'), 14, 62) }
  }

  _drawSpeedLines(ctx, W, H, spd) {
    const intensity = clamp((spd - 2600) / 4000, 0, 1)
    if (intensity <= 0) return
    const col = '255,255,255'
    ctx.lineWidth = 2
    for (let i = 0; i < 14; i++) {
      const y = H * 0.5 + ((hash32(i * 7) % 1000 / 1000) - 0.5) * H * 0.7
      const len = 40 + (hash32(i * 13) % 120)
      const x = W - (((this._frame * 22 + i * 180) % (W + 200)))
      ctx.strokeStyle = `rgba(${col},${0.04 + 0.13 * intensity})`
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke()
    }
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.26 * intensity})`)
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  }

  // --------------------------------------------------------------------------
  // ARAÇ ÇİZİMİ — yükseltmelere göre görsel değişir (yay/lastik/egzoz/kanat/depo)
  // --------------------------------------------------------------------------
  _drawVehicle(ctx, sx, sy, zoom) {
    const car = this.car, s = this.stats
    const Lv = s.lv || {}
    const eng = Lv.engine || 0, tir = Lv.tires || 0, sus = Lv.suspension || 0
    const gear = Lv.gearbox || 0, fuel = Lv.fuel || 0, aero = Lv.aero || 0
    const ratio = s.upgradeRatio || 0
    const px = sx(car.x), py = sy(car.y)
    const bw = s.bodyW, bh = s.bodyH, wr = this.wheelR
    const accel = this.input.fwd && this.fuel > 0
    const speed = Math.hypot(car.vx, car.vy)
    const useSprite = this._spriteReady()
    const lk = this.look || {}
    const paintCol = (lk.paint && lk.paint.color) || s.color        // stock (null) → aracın kendi rengi
    const paintAcc = (lk.paint && lk.paint.color) ? this._shade(lk.paint.color, 0.55) : s.accent
    const tintSprite = !!(lk.paint && lk.paint.color)               // sprite gövdeyi boya ile tonla

    ctx.save(); ctx.translate(px, py); ctx.rotate(-car.angle); ctx.scale(zoom, zoom)

    // gölge
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath(); ctx.ellipse(0, bh * 0.55 + wr, bw * 0.55 * (car.onGround ? 1 : 0.6), 8, 0, 0, Math.PI * 2); ctx.fill()

    // yüksek doluluk aurası — çok yükseltilmiş araç "parlar" (yalnız çizim gövdede)
    if (!useSprite && ratio > 0.45) {
      ctx.save(); ctx.shadowColor = s.color; ctx.shadowBlur = 16 * ratio
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + 0.14 * ratio})`; ctx.lineWidth = 2
      this._roundRect(ctx, -bw / 2 - 3, -bh / 2 - 3, bw + 6, bh + 6, 10); ctx.stroke(); ctx.restore()
    }

    // SPOİLER — takılı parçaya göre (arka, gövde arkasında)
    if (!s.bike) this._drawSpoiler(ctx, this.look.spoiler, bw, bh, s, paintCol, paintAcc)

    // EGZOZ — takılı parçaya göre
    this._drawExhaustPart(ctx, this.look.exhaust, bw, bh, s, accel)

    // ROKET BOOSTER — sadece roket aracı, gaz verirken
    if (s.id === 'rocket' && accel) {
      const fl = 22 + Math.abs(Math.sin(this._frame * 0.9)) * 14
      const bx = -bw * 0.5 - 4
      ctx.fillStyle = '#334155'; this._roundRect(ctx, bx - 6, -bh * 0.18, 8, bh * 0.36, 3); ctx.fill()
      const grd = ctx.createLinearGradient(bx - 6, 0, bx - 6 - fl, 0)
      grd.addColorStop(0, 'rgba(180,230,255,0.95)'); grd.addColorStop(0.4, 'rgba(90,160,255,0.8)'); grd.addColorStop(1, 'rgba(40,90,255,0)')
      ctx.fillStyle = grd
      ctx.beginPath(); ctx.moveTo(bx - 6, -bh * 0.16); ctx.lineTo(bx - 6 - fl, 0); ctx.lineTo(bx - 6, bh * 0.16); ctx.closePath(); ctx.fill()
    }

    // YAKIT DEPOSU (fuel) — arka üstte, seviyeyle büyür (yalnız çizim gövdede)
    if (!useSprite && fuel > 0 && !s.bike) {
      const tkW = bw * 0.10 + fuel * 1.3
      const tkH = bh * 0.34 + fuel * 0.7
      const tx = -bw * 0.30, ty = -bh * 0.5 - tkH * 0.5
      ctx.fillStyle = '#c3ccd8'; this._roundRect(ctx, tx - tkW / 2, ty, tkW, tkH, tkH * 0.42); ctx.fill()
      ctx.strokeStyle = '#5b6675'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = TV.up
      const fillH = (tkH - 4) * clamp(this.fuel / s.fuelMax, 0, 1)
      this._roundRect(ctx, tx - tkW / 2 + 2, ty + tkH - 2 - fillH, tkW - 4, fillH, tkH * 0.3); ctx.fill()
    }

    // TEKER + YAY SÜSPANSİYON
    for (let wi = 0; wi < this.wheels.length; wi++) {
      const w = this.wheels[wi]
      const axY = -w.lyAxle                    // gövde ekseni (aşağı +)
      const susLen = this.wheelSusLen ? this.wheelSusLen[wi] : this.susRest
      const wcx = w.lx, wcy = axY + susLen
      const springTop = -bh * 0.10
      const springBot = wcy - wr * 0.55
      // damper gövdesi (accent renkli koilover kovanı) — arkada
      ctx.strokeStyle = this._shade(s.color, 0.55); ctx.lineWidth = 5 + sus * 0.2
      ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(wcx, springTop + 2); ctx.lineTo(wcx, wcy - wr * 0.2); ctx.stroke()
      // coilover yay — parlak metalik sarım (seviyeyle daha çok sarım + kalınlık)
      const coils = 3 + Math.round(sus * 0.6)
      const amp = 4 + sus * 0.5
      ctx.strokeStyle = sus > 2 ? '#dfe6ef' : '#b6bfcc'; ctx.lineWidth = 2.2 + sus * 0.16
      ctx.beginPath()
      const segs = coils * 2
      for (let kk = 0; kk <= segs; kk++) {
        const tt = kk / segs
        const yy = springTop + (springBot - springTop) * tt
        const off = (kk === 0 || kk === segs) ? 0 : (kk % 2 ? amp : -amp)
        const xx = wcx + off
        if (kk === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy)
      }
      ctx.stroke(); ctx.lineCap = 'butt'
      // lastik — sprite varsa sprite teker (jant tonu ile), yoksa çizim (jant stiliyle)
      const wstyle = lk.wheels || 'stock'
      if (useSprite) {
        const R = wr * (this.sprites.cfg.wheelScale || 1.1)
        ctx.save(); ctx.translate(wcx, wcy); ctx.rotate(this.wheelSpin[wi])
        const wf = wstyle === 'gold' ? 'sepia(1) saturate(3) hue-rotate(5deg) brightness(1.05)'
          : wstyle === 'chrome' ? 'grayscale(1) brightness(1.35)'
          : wstyle === 'sport' ? 'saturate(1.6) hue-rotate(-20deg)'
          : 'none'
        if (wf !== 'none') ctx.filter = wf
        ctx.drawImage(this.sprites.wheel, -R, -R, R * 2, R * 2)
        if (wf !== 'none') ctx.filter = 'none'
        ctx.restore()
      } else {
        this._drawWheel(ctx, wcx, wcy, wr, tir, this.wheelSpin[wi], wstyle)
      }
    }

    // GÖVDE — sprite hazırsa gerçek araç PNG'si, yoksa çizim
    if (useSprite) {
      const bimg = this.sprites.body, cfg = this.sprites.cfg
      const dw = bw * (cfg.scale || 1.35)
      const dh = dw * bimg.naturalHeight / bimg.naturalWidth
      const yo = (cfg.yOff || 0) * bh
      if (tintSprite) ctx.filter = `hue-rotate(${lk.paint.hue || 0}deg) saturate(${lk.paint.sat || 1})`
      ctx.drawImage(bimg, -dw / 2, -dh / 2 + yo, dw, dh)
      if (tintSprite) ctx.filter = 'none'
    } else {
      const squash = 1 - 0.06 * ((this.suspComp[0] + this.suspComp[1]) / (this.susTravel * 2 || 1))
      ctx.save(); ctx.scale(1, squash)
      const bg = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2)
      bg.addColorStop(0, this._shade(paintCol, 1.3)); bg.addColorStop(0.5, paintCol); bg.addColorStop(1, this._shade(paintCol, 0.78))
      ctx.fillStyle = bg; ctx.strokeStyle = paintAcc; ctx.lineWidth = 3
      this._roundRect(ctx, -bw / 2, -bh / 2, bw, bh, s.bike ? bh * 0.42 : 9); ctx.fill(); ctx.stroke()
      // üst parlama şeridi
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-bw / 2 + 8, -bh / 2 + 2); ctx.lineTo(bw / 2 - 8, -bh / 2 + 2); ctx.stroke()
      // yan gövde çizgisi (karakter)
      ctx.strokeStyle = this._shade(paintCol, 0.6); ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(-bw / 2 + 6, bh * 0.12); ctx.lineTo(bw / 2 - 6, bh * 0.12); ctx.stroke()
      // kabin / camlar (bisiklet hariç)
      if (!s.bike) {
        ctx.fillStyle = 'rgba(200,225,255,0.88)'; ctx.strokeStyle = paintAcc; ctx.lineWidth = 3
        this._roundRect(ctx, -bw * 0.16, -bh * 0.5 - bh * 0.55, bw * 0.5, bh * 0.6, 6); ctx.fill(); ctx.stroke()
        ctx.strokeStyle = paintAcc; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(bw * 0.09, -bh * 0.5); ctx.lineTo(bw * 0.09, -bh * 0.5 - bh * 0.55); ctx.stroke()
      } else {
        ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2.5
        ctx.beginPath(); ctx.moveTo(bw * 0.30, -bh * 0.3); ctx.lineTo(bw * 0.5, -bh * 0.9); ctx.stroke()
      }
      ctx.restore()
    }
    // AKSESUAR — takılı parçaya göre (gövde üstünde)
    if (!s.bike) this._drawAccessory(ctx, lk.accessory, bw, bh, s, paintCol, paintAcc)

    // TURBO / HAVA GİRİŞİ (motor yüksek) — kaputta trapez scoop (yalnız çizim gövdede)
    if (!useSprite && eng >= 5 && !s.bike) {
      const sw = bw * 0.13, sh = bh * 0.45, sxp = bw * 0.14
      ctx.fillStyle = '#1f2937'
      ctx.beginPath()
      ctx.moveTo(sxp - sw, -bh * 0.5); ctx.lineTo(sxp + sw, -bh * 0.5)
      ctx.lineTo(sxp + sw * 0.55, -bh * 0.5 - sh); ctx.lineTo(sxp - sw * 0.55, -bh * 0.5 - sh); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#0b0e14'; ctx.fillRect(sxp - sw * 0.55, -bh * 0.5 - sh, sw * 1.1, 3)
    }

    // ŞANZIMAN rozeti (gear) — küçük vites göstergesi (yalnız çizim gövdede)
    if (!useSprite && gear > 0 && !s.bike) {
      ctx.fillStyle = 'rgba(15,23,42,0.85)'
      this._roundRect(ctx, bw * 0.16, bh * 0.02, 16, 12, 3); ctx.fill()
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 9px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('G' + Math.min(6, 1 + Math.round(gear * 0.5)), bw * 0.16 + 8, bh * 0.02 + 6)
      ctx.textBaseline = 'alphabetic'
    }

    // far / stop lambaları + sürücü kaskı — yalnız çizim gövdede (sprite kendi görünümünü taşır)
    if (!useSprite) {
      if (speed > 200) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,247,200,0.12)'
        ctx.beginPath(); ctx.moveTo(bw / 2, bh * 0.1); ctx.lineTo(bw / 2 + bw * 0.7, -bh * 0.3); ctx.lineTo(bw / 2 + bw * 0.7, bh * 0.5); ctx.closePath(); ctx.fill(); ctx.restore()
      }
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(bw * 0.46, bh * 0.02, 3.2, 0, Math.PI * 2); ctx.fill()
      if (this.input.rev) {
        ctx.save(); ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 8; ctx.fillStyle = '#ef4444'
        ctx.fillRect(-bw / 2 - 1, bh * 0.05, 3, bh * 0.3); ctx.restore()
      }
      const hx = s.bike ? 0 : bw * 0.05, hy = -bh * 0.5 - (s.bike ? 16 : 10)
      ctx.fillStyle = '#fcd34d'; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#92400e'; ctx.lineWidth = 2; ctx.stroke()
      ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(hx + 4, hy, 9, -0.5, 0.9); ctx.fill()
    }

    ctx.restore()
  }

  _drawWheel(ctx, cx, cy, r, tir, spin, style = 'stock') {
    // jant stili → renk + sırt deseni
    const RIM = {
      stock:   { a: '#e2e8f0', b: '#64748b', spoke: '#475569', hub: '#334155', spokes: 6, treadMul: 1 },
      sport:   { a: '#fca5a5', b: '#b91c1c', spoke: '#7f1d1d', hub: '#450a0a', spokes: 5, treadMul: 1 },
      offroad: { a: '#cbd5e1', b: '#475569', spoke: '#334155', hub: '#1e293b', spokes: 6, treadMul: 1.9 },
      chrome:  { a: '#ffffff', b: '#cbd5e1', spoke: '#94a3b8', hub: '#64748b', spokes: 8, treadMul: 1 },
      gold:    { a: '#fde68a', b: '#ca8a04', spoke: '#a16207', hub: '#713f12', spokes: 8, treadMul: 1 },
    }[style] || null
    const R = RIM || { a: '#e2e8f0', b: '#64748b', spoke: '#475569', hub: '#334155', spokes: 6, treadMul: 1 }
    // dış lastik
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#14171e'; ctx.fill()
    ctx.lineWidth = 2.5 + tir * 0.15; ctx.strokeStyle = '#0a0c10'; ctx.stroke()
    // sırt deseni
    const treads = 12 + tir
    ctx.strokeStyle = '#20242c'; ctx.lineWidth = (1.4 + tir * 0.28) * R.treadMul
    const treadDepth = 0.80 - (R.treadMul - 1) * 0.06
    for (let k = 0; k < treads; k++) {
      const a = spin + k / treads * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r * treadDepth, cy + Math.sin(a) * r * treadDepth)
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      ctx.stroke()
    }
    // jant
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(spin)
    const rimR = r * (0.52 - tir * 0.012)
    const hubG = ctx.createRadialGradient(0, 0, 1, 0, 0, rimR)
    hubG.addColorStop(0, R.a); hubG.addColorStop(1, R.b)
    ctx.fillStyle = hubG; ctx.beginPath(); ctx.arc(0, 0, rimR, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = R.spoke; ctx.lineWidth = 2
    for (let k = 0; k < R.spokes; k++) {
      const ang = (k / R.spokes) * Math.PI * 2
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * rimR, Math.sin(ang) * rimR); ctx.stroke()
    }
    ctx.fillStyle = R.hub; ctx.beginPath(); ctx.arc(0, 0, rimR * 0.28, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }

  // --- TAKILABİLİR PARÇALAR (kozmetik, çizim) ---------------------------------
  _drawSpoiler(ctx, id, bw, bh, s, col, acc) {
    if (!id || id === 'none') return
    col = col || s.color; acc = acc || s.accent
    const rx = -bw * 0.46
    if (id === 'lip') {
      ctx.fillStyle = this._shade(col, 0.78)
      this._roundRect(ctx, rx - 4, -bh * 0.5 - 5, bw * 0.30, 6, 2); ctx.fill()
      ctx.strokeStyle = acc; ctx.lineWidth = 1.5; ctx.stroke()
    } else if (id === 'duck') {
      ctx.fillStyle = this._shade(col, 0.72); ctx.strokeStyle = acc; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(rx, -bh * 0.45)
      ctx.quadraticCurveTo(rx - bw * 0.12, -bh * 0.9, rx + bw * 0.12, -bh * 0.82)
      ctx.lineTo(rx + bw * 0.14, -bh * 0.66)
      ctx.quadraticCurveTo(rx - bw * 0.04, -bh * 0.7, rx, -bh * 0.34)
      ctx.closePath(); ctx.fill(); ctx.stroke()
    } else if (id === 'gt' || id === 'bigwing') {
      const big = id === 'bigwing'
      const wgH = bh * (big ? 0.95 : 0.58), wgW = bw * (big ? 0.46 : 0.34), wgT = big ? 8 : 5
      const topY = -bh * 0.35 - wgH
      ctx.strokeStyle = acc; ctx.lineWidth = big ? 4 : 3
      ctx.beginPath(); ctx.moveTo(rx + wgW * 0.12, -bh * 0.35); ctx.lineTo(rx + wgW * 0.12, topY); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(rx + wgW * 0.62, -bh * 0.35); ctx.lineTo(rx + wgW * 0.62, topY); ctx.stroke()
      const g = ctx.createLinearGradient(0, topY - wgT, 0, topY + wgT)
      g.addColorStop(0, this._shade(col, 1.3)); g.addColorStop(1, this._shade(col, 0.65))
      ctx.fillStyle = g; ctx.strokeStyle = acc; ctx.lineWidth = 2
      this._roundRect(ctx, rx - wgW * 0.14, topY - wgT / 2, wgW, wgT, 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = this._shade(col, 0.55)
      this._roundRect(ctx, rx - wgW * 0.16, topY - wgT * 1.6, 3, wgT * 3.2, 1); ctx.fill()
      this._roundRect(ctx, rx + wgW * 0.80, topY - wgT * 1.6, 3, wgT * 3.2, 1); ctx.fill()
    }
  }

  _drawExhaustPart(ctx, id, bw, bh, s, accel) {
    const pipe = (ex, ppy, len, flame, big, blue) => {
      ctx.fillStyle = big ? '#4b5563' : '#3a4150'; this._roundRect(ctx, ex - len, ppy - (big ? 4 : 3), len + 2, big ? 8 : 6, 2); ctx.fill()
      ctx.fillStyle = '#12151c'; ctx.beginPath(); ctx.ellipse(ex - len, ppy, big ? 3 : 2.3, big ? 4 : 3, 0, 0, Math.PI * 2); ctx.fill()
      if (flame > 0) {
        const grd = ctx.createLinearGradient(ex - len, ppy, ex - len - flame, ppy)
        grd.addColorStop(0, blue ? 'rgba(200,235,255,0.95)' : 'rgba(255,240,150,0.95)')
        grd.addColorStop(0.5, blue ? 'rgba(90,160,255,0.85)' : 'rgba(255,150,40,0.85)')
        grd.addColorStop(1, 'rgba(255,60,20,0)')
        ctx.fillStyle = grd
        ctx.beginPath(); ctx.moveTo(ex - len, ppy - (big ? 4 : 3.2)); ctx.lineTo(ex - len - flame, ppy); ctx.lineTo(ex - len, ppy + (big ? 4 : 3.2)); ctx.closePath(); ctx.fill()
      }
    }
    const ex = -bw * 0.5 - 2
    const wob = Math.abs(Math.sin(this._frame * 0.7)) * 6
    if (id === 'dual') { pipe(ex, bh * 0.30, 9, accel ? 8 + wob : 0, false, false); pipe(ex, bh * 0.30 - bh * 0.34, 9, accel ? 8 + wob : 0, false, false) }
    else if (id === 'side') {
      ctx.fillStyle = '#3a4150'; this._roundRect(ctx, -bw * 0.34, bh * 0.34, bw * 0.52, 6, 3); ctx.fill()
      ctx.fillStyle = '#12151c'; ctx.beginPath(); ctx.ellipse(bw * 0.18, bh * 0.37, 2.3, 3, 0, 0, Math.PI * 2); ctx.fill()
      if (accel) { const g = ctx.createLinearGradient(bw * 0.18, 0, bw * 0.18 + 12, 0); g.addColorStop(0, 'rgba(255,200,80,0.8)'); g.addColorStop(1, 'rgba(255,80,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bw * 0.18, bh * 0.34); ctx.lineTo(bw * 0.18 + 12, bh * 0.37); ctx.lineTo(bw * 0.18, bh * 0.40); ctx.closePath(); ctx.fill() }
    }
    else if (id === 'race') pipe(ex, bh * 0.28, 12, accel ? 16 + wob : 5, true, true)
    else if (id === 'flame') pipe(ex, bh * 0.28, 11, accel ? 26 + wob : 9, true, false)
    else pipe(ex, bh * 0.28, 9, accel ? 10 + wob : 0, false, false)   // single (varsayılan)
  }

  _drawAccessory(ctx, id, bw, bh, s, col, acc) {
    if (!id || id === 'none') return
    acc = acc || s.accent
    const roofY = -bh * 0.5 - bh * 0.55
    if (id === 'roofrack') {
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(-bw * 0.2, roofY); ctx.lineTo(bw * 0.34, roofY); ctx.stroke()
      for (let k = 0; k < 4; k++) { const x = -bw * 0.2 + k * (bw * 0.54 / 3); ctx.beginPath(); ctx.moveTo(x, roofY); ctx.lineTo(x, roofY + 7); ctx.stroke() }
    } else if (id === 'lightbar') {
      ctx.fillStyle = '#1f2937'; this._roundRect(ctx, -bw * 0.16, roofY - 6, bw * 0.44, 7, 2); ctx.fill()
      const cols = ['#f87171', '#60a5fa', '#fbbf24', '#4ade80']
      for (let k = 0; k < 4; k++) { ctx.save(); ctx.shadowColor = cols[k]; ctx.shadowBlur = 6; ctx.fillStyle = cols[k]; ctx.beginPath(); ctx.arc(-bw * 0.16 + (k + 0.5) * (bw * 0.44 / 4), roofY - 2.5, 2.3, 0, Math.PI * 2); ctx.fill(); ctx.restore() }
    } else if (id === 'flag') {
      const fx = -bw * 0.42, fy = -bh * 0.5
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - bh * 0.9); ctx.stroke()
      const wv = Math.sin(this._frame * 0.3) * 3
      ctx.fillStyle = acc || '#ef4444'
      ctx.beginPath(); ctx.moveTo(fx, fy - bh * 0.9); ctx.lineTo(fx - bw * 0.16, fy - bh * 0.82 + wv); ctx.lineTo(fx, fy - bh * 0.72); ctx.closePath(); ctx.fill()
    } else if (id === 'spare') {
      const sx2 = -bw * 0.52, sy2 = -bh * 0.05, sr = bh * 0.34
      ctx.beginPath(); ctx.arc(sx2, sy2, sr, 0, Math.PI * 2); ctx.fillStyle = '#14171e'; ctx.fill()
      ctx.strokeStyle = '#0a0c10'; ctx.lineWidth = 2; ctx.stroke()
      ctx.beginPath(); ctx.arc(sx2, sy2, sr * 0.45, 0, Math.PI * 2); ctx.fillStyle = '#64748b'; ctx.fill()
    }
  }

  _shade(hex, f) {
    const n = parseInt(hex.slice(1), 16)
    const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255)
    const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255)
    const b = clamp(Math.round((n & 255) * f), 0, 255)
    return `rgb(${r},${g},${b})`
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }

  // --------------------------------------------------------------------------
  // DÖNGÜ
  // --------------------------------------------------------------------------
  start() {
    if (this.running) return
    this.running = true; this.over = false; this.lastT = 0
    try { this.audio?.ctx?.resume?.() } catch { /* yoksay */ }
    this.camX = this.car.x; this.camY = this.car.y; this._zoom = this.zoomBase
    const loop = (t) => {
      if (!this.running) return
      if (!this.lastT) this.lastT = t
      let frameDt = (t - this.lastT) / 1000
      this.lastT = t
      frameDt = clamp(frameDt, 0, 0.05)
      const sub = frameDt / SUBSTEPS
      for (let i = 0; i < SUBSTEPS; i++) this._physics(Math.min(sub, PHYS_DT_MAX))
      if (!this.over) this._update(frameDt)
      this._render(frameDt)
      if (this.over) { this.running = false; this.raf = null; return }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  _gameOver(reason) {
    if (this.over) return
    this.over = true
    if (reason === 'crash') { this._addShake(24); this._spawnDebris() }
    this._emitState(); this._stopAudio()
    this.onEnd({
      reason,
      distanceM: Math.round(this.run.distanceM),
      coins: this.run.coins,
      flips: this.run.flips,
      airTime: this.run.airTime,
      checkpoints: this.run.checkpoints,
      level: this.level,
      levelDistanceM: this.levelDistanceM,
      completed: reason === 'finish',
    })
  }

  stop() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = null
    this._stopAudio()
  }

  resize() { this._resize() }
}
