// ============================================================================
// HİSSE YARIŞI — Fizik & render motoru
// ----------------------------------------------------------------------------
// "Hill Climb" tarzı 2D araç fiziği. Pist (zemin) seçilen hissenin kapanış
// fiyatı grafiğinden üretilir: yüksek fiyat = yüksek tepe. Araç soldan sağa
// grafiğin üstünde sürülür.
//
// Fizik modeli: rijit şasi (konum, hız, açı, açısal hız) + 2 yaylı teker.
// Tekerler zemin yükseklik alanıyla penalty (yay) temas eder; sürüş kuvveti
// temas noktasına uygulanır → doğal "wheelie"/takla hissi. Havadayken gaz/fren
// şasiyi döndürür (klasik hill-climb kontrolü).
//
// Çerçeveden bağımsız: saf canvas + class. React tarafı setInput/start/stop
// çağırır, onState/onEnd callback'lerini dinler.
// ============================================================================

// --- Dünya & fizik sabitleri ---
const GRAV = 1750          // yerçekimi (dünya birimi / s²)
const SUBSTEPS = 6         // kare başı fizik alt-adımı (stabilite)
const SX = 110             // örnek nokta yatay aralığı (dünya birimi)
const AMP = 560            // fiyat → yükseklik genlik bandı
const MAXSTEP = AMP * 0.13 // komşu nokta max yükseklik farkı (sürülebilirlik)
const TERRAIN_POINTS = 150 // tüm grafiği tek pist'e indirgemek için örnek sayısı
const METER = 30           // dünya birimi / görüntülenen metre
const PHYS_DT_MAX = 1 / 50 // çok büyük kare atlamalarında fizik patlamasın

// Yardımcı matematik
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

function hash32(i) {
  let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return x >>> 0
}

export class RacingEngine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.stats = opts.stats                 // efektif araç istatistiği
    this.onState = opts.onState || (() => {})
    this.onEnd = opts.onEnd || (() => {})
    this.theme = opts.theme || {}
    this.soundOn = !!opts.sound

    this.input = { gas: false, brake: false }
    this.running = false
    this.over = false
    this.raf = null
    this.lastT = 0
    this.stateClock = 0

    this._buildTerrain(opts.candles || [])
    this._initVehicle()
    this._initAudio()

    this.collected = new Set()  // toplanan collectible id'leri (candle index)
    this.particles = []
    this.floatTexts = []        // "+3", "TAKLA!" gibi uçan yazılar

    // koşu istatistikleri
    this.run = { distanceM: 0, coins: 0, flips: 0, airTime: 0, maxSpeed: 0 }
    this._airAccum = 0          // havadayken biriken dönüş (takla sayımı)
    this._airTimer = 0          // mevcut sıçramanın hava süresi
    this._noGroundFuel = 0      // yakıt bitince durma sayacı
    this._wasGround = true

    this._resize()
  }

  // --------------------------------------------------------------------------
  // ZEMİN — fiyat grafiğinden yükseklik alanı
  // --------------------------------------------------------------------------
  _buildTerrain(candles) {
    let closes = candles
      .map((c) => Number(c.close))
      .filter((v) => Number.isFinite(v) && v > 0)

    if (closes.length < 8) {
      // veri yoksa hoş, oynanır bir sentetik grafik üret
      closes = Array.from({ length: 160 }, (_, i) =>
        100 * Math.exp(Math.sin(i * 0.11) * 0.35 + Math.sin(i * 0.045) * 0.5 + i * 0.003))
    }

    // LOG ÖLÇEK — kritik: Türk hisseleri 5 yılda 15-30x artıyor; lineer ölçekte
    // erken yıllar dümdüz ezilir ve tüm hisseler aynı görünür. Log ile yüzdesel
    // hareketler her yerde eşit yükseklikte → gerçek "çizgi grafik" hissi.
    const logs = closes.map((c) => Math.log(c))

    // Tüm çok-yıllık grafiği tek turda sürülebilir sayıda noktaya indir.
    // Böylece oyuncu hissenin GERÇEK hikâyesini (ralliler + düzeltmeler) sürer.
    const N = TERRAIN_POINTS
    const L = logs.length
    const res = []
    for (let i = 0; i < N; i++) {
      const t = (i * (L - 1)) / (N - 1)
      const i0 = Math.floor(t)
      const f = t - i0
      const a = logs[i0]
      const b = logs[Math.min(L - 1, i0 + 1)]
      res.push(a + (b - a) * f)
    }

    // hafif yumuşatma (tek nokta spike'larını yumuşat ama dalgalanmayı koru)
    const sm = res.map((v, i) => {
      const a = res[Math.max(0, i - 1)]
      const b = res[Math.min(N - 1, i + 1)]
      return (a + v * 2 + b) / 4
    })

    const min = Math.min(...sm)
    const max = Math.max(...sm)
    const range = max - min || 1
    const h = sm.map((v) => ((v - min) / range) * AMP)

    // eğim sınırlama (aşılamaz duvar olmasın) — ileri + geri geçiş
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

    this.heights = h
    this.N = h.length
    this.priceMin = min
    this.priceMax = max
  }

  // ping-pong döşeme → sonsuz ve dikişsiz (uç değerleri eşleşir)
  _raw(i) {
    const N = this.N
    if (N < 2) return 0
    const period = 2 * (N - 1)
    let m = ((i % period) + period) % period
    const k = m < N ? m : period - m
    return this.heights[k]
  }

  // mesafeyle hafif artan, yumuşak ek engebe (uzun turlar sıkmasın)
  _bump(x) {
    const rug = clamp(Math.abs(x) / 60000, 0, 1)
    return Math.sin(x * 0.0028) * 26 * rug + Math.sin(x * 0.0013 + 1.7) * 18 * rug
  }

  heightAt(x) {
    const s = x / SX
    const i = Math.floor(s)
    const f = s - i
    const y = catmull(this._raw(i - 1), this._raw(i), this._raw(i + 1), this._raw(i + 2), f)
    return y + this._bump(x)
  }

  // yüzey normali (yukarı yönlü)
  normalAt(x) {
    const h1 = this.heightAt(x - 3)
    const h2 = this.heightAt(x + 3)
    const slope = (h2 - h1) / 6
    const len = Math.hypot(slope, 1)
    return { x: -slope / len, y: 1 / len }
  }

  // --------------------------------------------------------------------------
  // ARAÇ
  // --------------------------------------------------------------------------
  _initVehicle() {
    const s = this.stats
    const startX = SX * 2
    this.startX = startX
    this.car = {
      x: startX,
      y: this.heightAt(startX) + 120,
      vx: 0, vy: 0,
      angle: 0, angVel: 0,
      onGround: false,
      groundN: { x: 0, y: 1 },
    }
    this.fuel = s.fuelMax
    this._prevX = this.car.x     // kare başı süpürme (swept) toplama testi için
    this._prevY = this.car.y
    this.wheelSpin = [0, 0]      // teker dönüş açısı (görsel)
    this.suspComp = [0, 0]       // süspansiyon sıkışması (görsel)

    const wb = s.wheelBase
    // yerel teker konumları (şasi merkezine göre); up ekseni +y
    this.wheels = [
      { lx: -wb / 2, ly: -s.bodyH * 0.45, r: s.wheelR, drive: true },   // arka (çekiş)
      { lx: wb / 2, ly: -s.bodyH * 0.45, r: s.wheelR, drive: true },    // ön
    ]
    this.invMass = 1 / s.mass
    // atalet momenti — yüksek tutarak gazla ANINDA takla atmayı engelliyoruz
    // (wheelie/takla yine olur ama tümsek/rampa sayesinde, düz zeminde değil).
    // Hava kontrolü açısal hızı doğrudan eklediği için bu çeviklikten etkilenmez.
    const I = s.mass * (s.bodyW * s.bodyW + s.bodyH * s.bodyH) / 12 * 4.0
    this.invI = 1 / I
  }

  setInput(name, val) {
    if (name in this.input) this.input[name] = !!val
    // ilk gerçek kullanıcı girişinde askıdaki AudioContext'i devam ettir
    if (val && this.audio && this.audio.ctx.state === 'suspended') {
      this.audio.ctx.resume().catch(() => {})
    }
  }

  // --------------------------------------------------------------------------
  // FİZİK
  // --------------------------------------------------------------------------
  _physics(dt) {
    const car = this.car
    const s = this.stats
    const gas = this.input.gas
    const brake = this.input.brake
    const hasFuel = this.fuel > 0

    // yerçekimi
    car.vy -= GRAV * dt

    let groundContacts = 0
    let avgN = { x: 0, y: 0 }

    const cosA = Math.cos(car.angle)
    const sinA = Math.sin(car.angle)
    // şasi eksenleri
    const rightX = cosA, rightY = sinA
    const upX = -sinA, upY = cosA

    const speed = Math.hypot(car.vx, car.vy)

    for (let wi = 0; wi < this.wheels.length; wi++) {
      const w = this.wheels[wi]
      const wx = car.x + w.lx * rightX + w.ly * upX
      const wy = car.y + w.lx * rightY + w.ly * upY
      const gy = this.heightAt(wx)
      const penetration = (gy + w.r) - wy   // >0 → teker zemine girmiş

      // görsel süspansiyon sıkışması
      this.suspComp[wi] = clamp(penetration, 0, w.r * 1.4)

      if (penetration > 0) {
        groundContacts++
        const n = this.normalAt(wx)
        avgN.x += n.x; avgN.y += n.y

        // süspansiyon normal kolu (teker tabanı) ve sürüş kolu (teker merkezi)
        const rx = wx - car.x
        const ry = (wy - w.r) - car.y
        const rcx = wx - car.x       // sürüş/teğet kuvveti teker merkezinden uygulanır
        const rcy = wy - car.y       // → wheelie torku daha kontrollü
        // temas noktası hızı: v + ω × r  (2B: ω×r = (-ω*ry, ω*rx))
        const vcx = car.vx - car.angVel * ry
        const vcy = car.vy + car.angVel * rx
        const vn = vcx * n.x + vcy * n.y

        // süspansiyon (yay-sönüm) normal kuvveti
        let Fn = s.suspK * penetration - s.suspDamp * vn
        if (Fn < 0) Fn = 0
        this._applyImpulse(n.x * Fn * dt, n.y * Fn * dt, rx, ry)

        // teğet (zemin boyunca, ileri = +right tarafı)
        let tx = n.y, ty = -n.x
        if (tx * rightX + ty * rightY < 0) { tx = -tx; ty = -ty }
        const vt = vcx * tx + vcy * ty

        // sürüş / fren kuvveti (yalnızca çekiş tekeri + yakıt varsa)
        let drive = 0
        if (w.drive && hasFuel) {
          if (gas) drive += s.enginePower
          if (brake) drive -= s.enginePower * 0.72   // geri/fren
        }
        // son hız yumuşak tavanı
        if (speed > s.topSpeed && drive > 0) drive = 0

        // tutuş bütçesi (lastik): |Ft| <= grip * Fn
        const maxF = s.grip * Fn
        let Ft = drive - 7 * vt          // yuvarlanma direnci / traction
        Ft = clamp(Ft, -maxF, maxF)
        this._applyImpulse(tx * Ft * dt, ty * Ft * dt, rcx, rcy)

        // teker görsel dönüşü (ileri hızla)
        this.wheelSpin[wi] += (vt / w.r) * dt

        // toz parçacığı (gazda + hızda)
        if (gas && hasFuel && speed > 120 && Math.abs(vt) > 60 && hash32((this._frame || 0) * 7 + wi) % 3 === 0) {
          this._spawnDust(wx, gy, -tx, -ty)
        }
      } else {
        this.suspComp[wi] = 0
      }
    }

    car.onGround = groundContacts > 0
    if (car.onGround) {
      car.groundN = { x: avgN.x / groundContacts, y: avgN.y / groundContacts }
    }

    // havada: gaz/fren ile dönüş kontrolü (klasik hill-climb)
    if (!car.onGround && hasFuel) {
      if (gas) car.angVel += s.airControl * dt
      if (brake) car.angVel -= s.airControl * dt
    }

    // hava direnci / açısal sönümleme
    car.vx -= car.vx * 0.16 * dt
    car.vy -= car.vy * 0.02 * dt
    const angDamp = car.onGround ? 4.5 : (0.8 / s.stability)
    car.angVel -= car.angVel * angDamp * dt
    car.angVel = clamp(car.angVel, -14, 14)

    // entegrasyon
    car.x += car.vx * dt
    car.y += car.vy * dt
    car.angle += car.angVel * dt

    // NaN koruması
    if (!Number.isFinite(car.x) || !Number.isFinite(car.y)) {
      car.x = this.startX; car.y = this.heightAt(this.startX) + 100
      car.vx = car.vy = car.angVel = 0; car.angle = 0
    }
  }

  _applyImpulse(ix, iy, rx, ry) {
    const car = this.car
    car.vx += ix * this.invMass
    car.vy += iy * this.invMass
    const torque = rx * iy - ry * ix
    car.angVel += torque * this.invI
  }

  // --------------------------------------------------------------------------
  // OYUN DURUMU GÜNCELLEME (kare başı, fizik dışı)
  // --------------------------------------------------------------------------
  _update(frameDt) {
    this._frame = (this._frame || 0) + 1
    const car = this.car
    const s = this.stats

    // yakıt tüketimi
    if (this.fuel > 0) {
      let burn = 0.6                        // rölanti
      if ((this.input.gas || this.input.brake)) burn = 7
      this.fuel = Math.max(0, this.fuel - burn * frameDt)
    }

    // mesafe & hız
    this.run.distanceM = Math.max(this.run.distanceM, (car.x - this.startX) / METER)
    const spd = Math.hypot(car.vx, car.vy)
    this.run.maxSpeed = Math.max(this.run.maxSpeed, spd)

    // hava / takla
    if (!car.onGround) {
      this._airTimer += frameDt
      this._airAccum += car.angVel * frameDt
      if (Math.abs(this._airAccum) >= Math.PI * 2) {
        this.run.flips++
        this._airAccum -= Math.sign(this._airAccum) * Math.PI * 2
        this._addFloat(car.x, car.y + 70, 'TAKLA! +' + 40, '#f59e0b')
        this._beep(660, 0.08)
      }
    } else {
      if (this._airTimer > 0.5) {
        this.run.airTime += this._airTimer
      }
      this._airTimer = 0
      this._airAccum = 0
    }

    // collectible toplama
    this._collect()

    // parçacık & uçan yazı güncelle
    this._stepParticles(frameDt)

    // motor sesi
    this._updateAudio(spd)

    // --- bitiş koşulları ---
    // 1) boyun kırılma (kafa zemine değer) → çarpma
    const cosA = Math.cos(car.angle), sinA = Math.sin(car.angle)
    const headX = car.x + (-sinA) * (s.bodyH * 0.5 + 14)
    const headY = car.y + (cosA) * (s.bodyH * 0.5 + 14)
    const headGround = this.heightAt(headX)
    if (headY < headGround - 4 && spd > 60) {
      return this._gameOver('crash')
    }

    // 2) yakıt bitti & araç durdu
    if (this.fuel <= 0) {
      if (spd < 40 && car.onGround) {
        this._noGroundFuel += frameDt
        if (this._noGroundFuel > 1.2) return this._gameOver('fuel')
      } else {
        this._noGroundFuel = 0
      }
    }

    // swept toplama için önceki konumu güncelle (bu karenin sonu)
    this._prevX = car.x
    this._prevY = car.y

    // HUD durumu (saniyede ~10 kez)
    this.stateClock += frameDt
    if (this.stateClock > 0.1) {
      this.stateClock = 0
      this._emitState()
    }
  }

  _emitState() {
    const s = this.stats
    this.onState({
      distanceM: Math.round(this.run.distanceM),
      coins: this.run.coins,
      flips: this.run.flips,
      fuel: this.fuel,
      fuelMax: s.fuelMax,
      fuelPct: clamp(this.fuel / s.fuelMax, 0, 1),
      speed: Math.round(Math.hypot(this.car.vx, this.car.vy) / METER * 3.6 * 6), // ~km/s hissi
      airborne: !this.car.onGround,
    })
  }

  _collect() {
    const car = this.car
    // SÜPÜRME (swept) testi: yüksek hızda/düşük FPS'te araç bir karede parayı
    // atlamasın diye, karenin x-aralığı [prevX..x] para x'ini kapsıyorsa topla.
    // Dikey bant korunur → yüksek paralar yine zıplamayı gerektirir.
    const prevX = this._prevX ?? car.x
    const loX = Math.min(prevX, car.x) - 28
    const hiX = Math.max(prevX, car.x) + 28
    const range = 6
    const iCar = Math.round(car.x / SX)
    for (let i = iCar - range; i <= iCar + range; i++) {
      if (i < 1) continue
      const c = this._collectibleAt(i)
      if (!c) continue
      const id = c.type === 'fuel' ? 'f' + i : 'c' + i
      if (this.collected.has(id)) continue
      const pickupY = c.type === 'fuel' ? 60 : 58
      if (c.x >= loX && c.x <= hiX && Math.abs(car.y - c.y) < pickupY) {
        this.collected.add(id)
        if (c.type === 'fuel') {
          this.fuel = Math.min(this.stats.fuelMax, this.fuel + this.stats.fuelMax * 0.3)
          this._addFloat(c.x, c.y, '+YAKIT', '#22c55e')
          this._beep(440, 0.1)
        } else {
          this.run.coins++
          this._addFloat(c.x, c.y, '+1', '#eab308')
          this._spawnSparkle(c.x, c.y)
          this._beep(880, 0.05)
        }
      }
    }
  }

  // candle index i'de collectible var mı? (deterministik)
  _collectibleAt(i) {
    if (i < 1) return null
    const x = i * SX
    if (i % 28 === 0) {
      return { type: 'fuel', x, y: this.heightAt(x) + 40 }
    }
    const h = hash32(i)
    if (h % 100 < 45) {
      // çizginin hemen üstünde — sürerken kolayca toplanır (yukarıda asılı kalmaz)
      const off = 26 + (h % 20)
      return { type: 'coin', x, y: this.heightAt(x) + off }
    }
    return null
  }

  // --------------------------------------------------------------------------
  // PARÇACIKLAR & UÇAN YAZILAR
  // --------------------------------------------------------------------------
  _spawnDust(x, y, dx, dy) {
    if (this.particles.length > 90) return
    this.particles.push({
      kind: 'dust', x, y, vx: dx * 40 + (hash32(x | 0) % 30 - 15), vy: 30 + (hash32(y | 0) % 40),
      life: 0.5, age: 0, r: 5 + (hash32((x + y) | 0) % 6),
    })
  }

  _spawnSparkle(x, y) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      this.particles.push({
        kind: 'spark', x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 + 40,
        life: 0.4, age: 0, r: 3,
      })
    }
  }

  _addFloat(x, y, text, color) {
    this.floatTexts.push({ x, y, text, color, life: 1.0, age: 0 })
  }

  _stepParticles(dt) {
    for (const p of this.particles) {
      p.age += dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      if (p.kind === 'dust') { p.vy -= 60 * dt; p.vx *= 0.92 }
      else { p.vy -= 200 * dt }
    }
    this.particles = this.particles.filter((p) => p.age < p.life)
    for (const f of this.floatTexts) { f.age += dt; f.y += 30 * dt }
    this.floatTexts = this.floatTexts.filter((f) => f.age < f.life)
  }

  // --------------------------------------------------------------------------
  // SES (WebAudio motor sesi + bip)
  // --------------------------------------------------------------------------
  _initAudio() {
    this.audio = null
    if (!this.soundOn) return
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      // autoplay politikası: context 'suspended' başlayabilir → ilk fırsatta devam ettir
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.value = 80
      gain.gain.value = 0
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      this.audio = { ctx, osc, gain }
    } catch { this.audio = null }
  }

  _updateAudio(speed) {
    if (!this.audio) return
    const throttle = (this.input.gas || this.input.brake) && this.fuel > 0
    const target = throttle ? 0.06 : 0.015
    const freq = 70 + clamp(speed / 8, 0, 180) + (throttle ? 40 : 0)
    try {
      this.audio.gain.gain.value += (target - this.audio.gain.gain.value) * 0.2
      this.audio.osc.frequency.value += (freq - this.audio.osc.frequency.value) * 0.3
    } catch { /* yoksay */ }
  }

  _beep(freq, dur) {
    if (!this.audio) return
    try {
      const ctx = this.audio.ctx
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = freq
      o.type = 'square'
      g.gain.value = 0.04
      o.connect(g); g.connect(ctx.destination)
      o.start()
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
    this.dpr = dpr
    this.viewW = w
    this.viewH = h
    this.zoom = clamp(h / 560, 0.7, 1.6)
  }

  _render() {
    const ctx = this.ctx
    const W = this.viewW, H = this.viewH
    const car = this.car
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    // kamera (aracı takip)
    const lookAhead = clamp(car.vx * 0.18, -120, 260)
    this.camX = lerp(this.camX ?? car.x, car.x + lookAhead, 0.12)
    this.camY = lerp(this.camY ?? car.y, car.y + 60, 0.08)
    const zoom = this.zoom

    // dünya→ekran
    const sx = (wx) => (wx - this.camX) * zoom + W / 2
    const sy = (wy) => H / 2 - (wy - this.camY) * zoom

    this._drawSky(ctx, W, H)
    this._drawParallax(ctx, W, H, sx)
    this._drawTerrain(ctx, W, H, sx, sy)
    this._drawCollectibles(ctx, sx, sy, zoom)
    this._drawParticles(ctx, sx, sy, zoom)
    this._drawVehicle(ctx, sx, sy, zoom)
    this._drawFloatTexts(ctx, sx, sy)
    this._drawDistanceMarkers(ctx, sx, sy, H)
  }

  _drawSky(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#d1fae5')
    g.addColorStop(0.55, '#ecfdf5')
    g.addColorStop(1, '#f0fdf4')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    // güneş
    ctx.fillStyle = 'rgba(253, 224, 71, 0.5)'
    ctx.beginPath(); ctx.arc(W * 0.82, H * 0.2, 46, 0, Math.PI * 2); ctx.fill()
  }

  _drawParallax(ctx, W, H, sx) {
    // uzak tepeler (fiyat grafiğinin yumuşatılmış gölgesi)
    const layers = [
      { k: 0.35, col: 'rgba(16,185,129,0.14)', base: H * 0.62, amp: 70 },
      { k: 0.55, col: 'rgba(5,150,105,0.18)', base: H * 0.72, amp: 95 },
    ]
    for (const L of layers) {
      ctx.fillStyle = L.col
      ctx.beginPath()
      ctx.moveTo(0, H)
      for (let px = 0; px <= W; px += 24) {
        const wx = (px - W / 2) / (this.zoom * L.k) + this.camX
        const hh = this.heightAt(wx)
        const py = L.base - hh * 0.14 - Math.sin(wx * 0.001) * L.amp * 0.2
        ctx.lineTo(px, py)
      }
      ctx.lineTo(W, H)
      ctx.closePath()
      ctx.fill()
    }
  }

  _drawTerrain(ctx, W, H, sx, sy) {
    const step = 5
    ctx.beginPath()
    let first = true
    const pts = []
    for (let px = -10; px <= W + 10; px += step) {
      const wx = (px - W / 2) / this.zoom + this.camX
      const wy = this.heightAt(wx)
      const py = sy(wy)
      pts.push([px, py])
      if (first) { ctx.moveTo(px, py); first = false } else ctx.lineTo(px, py)
    }
    ctx.lineTo(W + 10, H + 10)
    ctx.lineTo(-10, H + 10)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, sy(this.camY + 200), 0, H)
    g.addColorStop(0, '#34d399')
    g.addColorStop(0.5, '#10b981')
    g.addColorStop(1, '#047857')
    ctx.fillStyle = g
    ctx.fill()

    // yüzey "fiyat çizgisi" — kalın emerald şerit (grafik hissi)
    ctx.beginPath()
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i][0], pts[i][1])
      else ctx.lineTo(pts[i][0], pts[i][1])
    }
    ctx.strokeStyle = '#065f46'
    ctx.lineWidth = 4
    ctx.lineJoin = 'round'
    ctx.stroke()
    // üst parlak çizgi
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  _drawCollectibles(ctx, sx, sy, zoom) {
    const left = this.camX - this.viewW / (2 * zoom) - SX
    const right = this.camX + this.viewW / (2 * zoom) + SX
    const iStart = Math.max(1, Math.floor(left / SX))
    const iEnd = Math.ceil(right / SX)
    const t = (this._frame || 0) * 0.08
    for (let i = iStart; i <= iEnd; i++) {
      const c = this._collectibleAt(i)
      if (!c) continue
      const id = c.type === 'fuel' ? 'f' + i : 'c' + i
      if (this.collected.has(id)) continue
      const px = sx(c.x)
      const py = sy(c.y) + Math.sin(t + i) * 3
      if (c.type === 'fuel') {
        ctx.fillStyle = '#16a34a'
        ctx.strokeStyle = '#052e16'
        ctx.lineWidth = 2
        const sZ = 11 * zoom
        ctx.beginPath(); ctx.rect(px - sZ, py - sZ * 1.2, sZ * 2, sZ * 2.2); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#fff'; ctx.font = `bold ${10 * zoom}px sans-serif`; ctx.textAlign = 'center'
        ctx.fillText('⛽', px, py + 3 * zoom)
      } else {
        const rZ = 9 * zoom
        ctx.beginPath(); ctx.arc(px, py, rZ, 0, Math.PI * 2)
        ctx.fillStyle = '#fbbf24'; ctx.fill()
        ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2; ctx.stroke()
        ctx.fillStyle = '#92400e'; ctx.font = `bold ${10 * zoom}px sans-serif`; ctx.textAlign = 'center'
        ctx.fillText('₺', px, py + 3.5 * zoom)
      }
    }
  }

  _drawParticles(ctx, sx, sy, zoom) {
    for (const p of this.particles) {
      const px = sx(p.x), py = sy(p.y)
      const a = 1 - p.age / p.life
      if (p.kind === 'dust') {
        ctx.fillStyle = `rgba(180,160,120,${a * 0.5})`
        ctx.beginPath(); ctx.arc(px, py, p.r * zoom * (1 + p.age), 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.fillStyle = `rgba(251,191,36,${a})`
        ctx.beginPath(); ctx.arc(px, py, p.r * zoom, 0, Math.PI * 2); ctx.fill()
      }
    }
  }

  _drawFloatTexts(ctx, sx, sy) {
    for (const f of this.floatTexts) {
      const a = 1 - f.age / f.life
      ctx.globalAlpha = a
      ctx.fillStyle = f.color
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(f.text, sx(f.x), sy(f.y))
      ctx.globalAlpha = 1
    }
  }

  _drawDistanceMarkers(ctx, sx, sy, H) {
    // her 100m'de bayrak/levha
    const startM = Math.floor(((this.camX - this.viewW / this.zoom) - this.startX) / METER / 100) * 100
    for (let m = Math.max(0, startM); m < startM + 600; m += 100) {
      if (m === 0) continue
      const wx = this.startX + m * METER
      const wy = this.heightAt(wx)
      const px = sx(wx), py = sy(wy)
      if (px < -20 || px > this.viewW + 20) continue
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 42); ctx.stroke()
      ctx.fillStyle = '#ef4444'
      ctx.beginPath(); ctx.moveTo(px, py - 42); ctx.lineTo(px + 22, py - 36); ctx.lineTo(px, py - 30); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#065f46'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left'
      ctx.fillText(m + 'm', px + 3, py - 16)
    }
  }

  _drawVehicle(ctx, sx, sy, zoom) {
    const car = this.car
    const s = this.stats
    const px = sx(car.x), py = sy(car.y)
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(-car.angle)         // ekran y ters → açıyı ters çevir
    ctx.scale(zoom, zoom)

    const bw = s.bodyW, bh = s.bodyH
    const wb = s.wheelBase, wr = s.wheelR

    // gölge
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.beginPath(); ctx.ellipse(0, bh * 0.55 + wr, bw * 0.55, 8, 0, 0, Math.PI * 2); ctx.fill()

    // tekerler (+ süspansiyon)
    for (let wi = 0; wi < this.wheels.length; wi++) {
      const w = this.wheels[wi]
      const comp = this.suspComp[wi] * 0.6
      const wx = w.lx
      const wy = -w.ly + comp   // ekran: +ly aşağı; süspansiyon sıkışınca yukarı
      // süspansiyon kolu
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(wx, -bh * 0.1); ctx.lineTo(wx, wy - wr * 0.3); ctx.stroke()
      // lastik
      ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2)
      ctx.fillStyle = '#1f2937'; ctx.fill()
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3; ctx.stroke()
      // jant
      ctx.save()
      ctx.translate(wx, wy)
      ctx.rotate(this.wheelSpin[wi])
      ctx.fillStyle = '#cbd5e1'
      ctx.beginPath(); ctx.arc(0, 0, wr * 0.5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2
      for (let k = 0; k < 4; k++) {
        ctx.beginPath(); ctx.moveTo(0, 0)
        ctx.lineTo(Math.cos(k * Math.PI / 2) * wr * 0.5, Math.sin(k * Math.PI / 2) * wr * 0.5); ctx.stroke()
      }
      ctx.restore()
    }

    // gövde
    ctx.fillStyle = s.color
    ctx.strokeStyle = s.accent
    ctx.lineWidth = 3
    this._roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 8)
    ctx.fill(); ctx.stroke()

    if (!s.bike) {
      // kabin
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      this._roundRect(ctx, -bw * 0.18, -bh * 0.5 - bh * 0.55, bw * 0.5, bh * 0.6, 6)
      ctx.fill(); ctx.stroke()
    }

    // sürücü kafası
    ctx.fillStyle = '#fcd34d'
    ctx.beginPath(); ctx.arc(s.bike ? 0 : bw * 0.05, -bh * 0.5 - (s.bike ? 16 : 10), 9, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#92400e'; ctx.lineWidth = 2; ctx.stroke()
    // kask siperi
    ctx.fillStyle = '#1e293b'
    ctx.beginPath(); ctx.arc(s.bike ? 4 : bw * 0.05 + 4, -bh * 0.5 - (s.bike ? 16 : 10), 9, -0.5, 0.9); ctx.fill()

    // egzoz dumanı (gazda)
    if (this.input.gas && this.fuel > 0) {
      ctx.fillStyle = 'rgba(120,120,120,0.3)'
      ctx.beginPath(); ctx.arc(-bw / 2 - 6, bh * 0.2, 5 + Math.sin(this._frame * 0.3) * 2, 0, Math.PI * 2); ctx.fill()
    }

    ctx.restore()
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  // --------------------------------------------------------------------------
  // DÖNGÜ
  // --------------------------------------------------------------------------
  start() {
    if (this.running) return
    this.running = true
    this.over = false
    this.lastT = 0
    try { this.audio?.ctx?.resume?.() } catch { /* yoksay */ }
    this.camX = this.car.x
    this.camY = this.car.y
    const loop = (t) => {
      if (!this.running) return
      if (!this.lastT) this.lastT = t
      let frameDt = (t - this.lastT) / 1000
      this.lastT = t
      frameDt = clamp(frameDt, 0, 0.05)

      const sub = frameDt / SUBSTEPS
      for (let k = 0; k < SUBSTEPS; k++) this._physics(Math.min(sub, PHYS_DT_MAX))
      if (!this.over) this._update(frameDt)
      this._render()

      // oyun bitince son kareyi çiz ve döngüyü durdur (CPU tasarrufu) —
      // canvas son görüntüsünü korur, sonuç modalı üstünde durur
      if (this.over) { this.running = false; this.raf = null; return }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  _gameOver(reason) {
    if (this.over) return
    this.over = true
    this._emitState()
    this._stopAudio()
    this.onEnd({
      reason,
      distanceM: Math.round(this.run.distanceM),
      coins: this.run.coins,
      flips: this.run.flips,
      airTime: this.run.airTime,
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
