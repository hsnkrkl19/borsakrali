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

const GRAV = 1750
const SUBSTEPS = 8
const SX = 110              // örnek nokta yatay aralığı
const AMP = 660             // fiyat → yükseklik bandı (biraz daha yüksek → belirgin tepeler)
const MAXSTEP = AMP * 0.19  // daha sert eğim izni ("sert pist")
const TERRAIN_POINTS = 150
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

    // 4 ayrı kontrol: ileri / geri (sürüş) + sol/sağ (havada takla)
    this.input = { fwd: false, rev: false, flipL: false, flipR: false }
    this.running = false
    this.over = false
    this.raf = null
    this.lastT = 0
    this.stateClock = 0

    this._buildTerrain(opts.candles || [])
    this._initVehicle()
    this._initAudio()

    this.collected = new Set()
    this.particles = []
    this.floatTexts = []
    this.trail = []
    this.shake = 0

    this.run = { distanceM: 0, coins: 0, flips: 0, airTime: 0, maxSpeed: 0 }
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
      closes = Array.from({ length: 160 }, (_, i) =>
        100 * Math.exp(Math.sin(i * 0.11) * 0.35 + Math.sin(i * 0.045) * 0.5 + i * 0.003))
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

    // ZIPLAMA TÜMSEKLERİ — hava/takla için simetrik yumuşak tepeler (uçurum
    // DEĞİL). Dokunmazsan düz uçup güvenle inersin; gaz/fren tutarsan takla atar
    // ama ters inersen boynun kırılır. Grafiğin genel şekli korunur.
    let bi = 12
    while (bi < N - 6) {
      if (hash32(bi * 53 + 11) % 4 === 0) {
        const peak = AMP * 0.28
        h[bi - 1] += peak * 0.5
        h[bi] += peak
        h[bi + 1] += peak * 0.5
        bi += 10
      } else bi += 1
    }

    this.heights = h
    this.N = h.length
    this.dates = resDates
    this.priceMin = min   // LOG fiyat min/max (eksen için)
    this.priceMax = max
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

    this.wheels = [
      { lx: -wb / 2, lyAxle: -s.bodyH * 0.28, drive: true },   // arka
      { lx: wb / 2, lyAxle: -s.bodyH * 0.28, drive: true },    // ön
    ]

    const startX = SX * 2
    this.startX = startX
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
    const I = s.mass * (s.bodyW * s.bodyW + s.bodyH * s.bodyH) / 12 * 4.0
    this.invI = 1 / I
  }

  setInput(name, val) {
    if (name in this.input) this.input[name] = !!val
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

        let Fn = s.suspK * comp - s.suspDamp * vn
        if (Fn < 0) Fn = 0
        this._applyImpulse(n.x * Fn * dt, n.y * Fn * dt, rx, ry)

        let tx = n.y, ty = -n.x
        if (tx * rightX + ty * rightY < 0) { tx = -tx; ty = -ty }
        const vt = vpx * tx + vpy * ty

        let drive = 0
        if (w.drive && hasFuel) {
          if (fwd) drive += s.enginePower
          if (rev) drive -= s.enginePower * 0.72   // geri vites — biraz daha zayıf
        }
        if (speed > s.topSpeed && drive > 0) drive = 0

        const maxF = s.grip * Fn
        let Ft = drive - 7 * vt
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
      const downhill = -fY
      if (downhill > 0.15 && car.vx > 80) {
        const assist = GRAV * 0.045 * downhill
        car.vx += fX * assist * dt
        car.vy += fY * assist * dt
      }
    }

    // YERDE ÖN/ARKA KALDIRMA — sürerken SOL/SAĞ ile aracın önünü/arkasını kaldır.
    // HIZA ORANTILI: dururken etkisiz, hızlandıkça daha çok kalkar.
    if (car.onGround && this._hasLanded && (this.input.flipL || this.input.flipR)) {
      const sf = clamp(speed / (s.topSpeed * 0.30), 0.45, 1)
      const target = (this.input.flipL ? 1 : -1) * 0.7 * sf      // ~40° net kaldırma (SOL=ön, SAĞ=arka)
      car.angVel += (target - car.angle) * 40 * dt               // sert hedef-açı yayı → hızlı kalkar
      car.angVel -= car.angVel * 8 * dt                          // kritik sönüm → aşmaz/devrilmez
    }

    // HAVA KONTROLÜ — SOL/SAĞ = takla:
    //  • Dokunmazsan → araç düz inişe yönelir (güvenli).
    //  • SOL = geri takla, SAĞ = ön takla. Ters inersen kafan yere değer = bitiş.
    if (!car.onGround && this._hasLanded) {
      const a = wrapPi(car.angle)
      const ramp = clamp(this._physAirTimer / 0.07, 0.75, 1)
      const at = s.airControl * 4.2 * ramp
      if (this.input.flipL) car.angVel += at * dt          // SOL → geri takla (CCW) — RİSK
      else if (this.input.flipR) car.angVel -= at * dt     // SAĞ → ön takla (CW) — RİSK
      else car.angVel += (-a * 14 - car.angVel * 6) * dt   // dokunma → düz inişe yönel
    }

    car.vx -= car.vx * 0.16 * dt
    car.vy -= car.vy * 0.02 * dt
    const angDamp = car.onGround ? 4.5 : (0.5 / s.stability)
    car.angVel -= car.angVel * angDamp * dt
    car.angVel = clamp(car.angVel, -13, 13)

    car.x += car.vx * dt
    car.y += car.vy * dt
    car.angle += car.angVel * dt

    // kalkış / iniş kenarı
    if (this._wasGroundPhys && !car.onGround) {
      if (!this.input.flipL && !this.input.flipR) car.angVel *= 0.2
      const nL = this.normalAt(car.x - SX * 0.5).x
      const nR = this.normalAt(car.x + SX * 0.5).x
      if (nL < -0.05 && nR > 0.05 && car.vx > 180) car.vy += clamp(car.vx, 0, 950) * 0.55 + 160
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
      let burn = 0.6
      if (this.input.fwd || this.input.rev) burn = 7
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
      if (Math.abs(Lp.angle) > 1.55) {
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
        } else if (Lp.vy < -520) {
          this._addShake(clamp(-Lp.vy / 120, 4, 16))
          this._spawnPoof(car.x, this.heightAt(car.x), -Lp.vy / 90)
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
    })
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
    if (i % 48 === 0) return { type: 'fuel', x, y: this.heightAt(x) + 36 }
    const h = hash32(i)
    // yüksek bonus ark (zıplayarak ulaşılır) — seyrek
    if (h % 100 < 7) return { type: 'coin', high: true, x, y: this.heightAt(x) + 120 + (h % 40) }
    // çizginin hemen üstünde toplanabilir paralar
    if (h % 100 < 48) return { type: 'coin', x, y: this.heightAt(x) + 22 + (h % 16) }
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
    this._drawAreaLine(ctx, W, H, sx, sy)
    this._drawDistanceFlags(ctx, W, H, sx, sy)
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

  // pistte mesafe bayrakları (500m aralık) — ilerleme hissi + sahne detayı
  _drawDistanceFlags(ctx, W, H, sx, sy) {
    const startX = this.startX
    const stepM = 500
    const left = this.camX - (W / 2) / this._zoom - SX
    const right = this.camX + (W / 2) / this._zoom + SX
    const zoom = this._zoom
    let firstM = Math.ceil((left - startX) / METER / stepM) * stepM
    if (firstM < stepM) firstM = stepM
    for (let m = firstM; ; m += stepM) {
      const wx = startX + m * METER
      if (wx > right) break
      if (wx < left) continue
      const gy = this.heightAt(wx)
      const bx = sx(wx), by = sy(gy)
      const poleH = 46 * zoom
      ctx.strokeStyle = 'rgba(200,205,214,0.75)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - poleH); ctx.stroke()
      const fw = 24 * zoom, fh = 15 * zoom, fy = by - poleH
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#e6e9ee' : '#11151d'
        ctx.fillRect(bx + c * fw / 3, fy + r * fh / 2, fw / 3, fh / 2)
      }
      ctx.fillStyle = 'rgba(226,232,240,0.9)'; ctx.font = `700 ${11 * zoom}px -apple-system,Segoe UI,sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
      ctx.fillText(`${m}m`, bx, fy - 5 * zoom)
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

    ctx.save(); ctx.translate(px, py); ctx.rotate(-car.angle); ctx.scale(zoom, zoom)

    // gölge
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.beginPath(); ctx.ellipse(0, bh * 0.55 + wr, bw * 0.55 * (car.onGround ? 1 : 0.6), 8, 0, 0, Math.PI * 2); ctx.fill()

    // yüksek doluluk aurası — çok yükseltilmiş araç "parlar"
    if (ratio > 0.45) {
      ctx.save(); ctx.shadowColor = s.color; ctx.shadowBlur = 16 * ratio
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + 0.14 * ratio})`; ctx.lineWidth = 2
      this._roundRect(ctx, -bw / 2 - 3, -bh / 2 - 3, bw + 6, bh + 6, 10); ctx.stroke(); ctx.restore()
    }

    // ARKA KANAT / SPOİLER (aero) — seviyeyle büyür, yan plakalı belirgin kanat
    if (aero > 0 && !s.bike) {
      const wgH = bh * 0.42 + aero * 2.6
      const wgW = bw * (0.34 + aero * 0.022)
      const wgT = 5 + aero * 0.7                    // kanat kalınlığı
      const rx = -bw * 0.46
      const topY = -bh * 0.32 - wgH
      // iki destek çubuğu
      ctx.strokeStyle = s.accent; ctx.lineWidth = 3.5
      ctx.beginPath(); ctx.moveTo(rx + wgW * 0.12, -bh * 0.32); ctx.lineTo(rx + wgW * 0.12, topY); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(rx + wgW * 0.62, -bh * 0.32); ctx.lineTo(rx + wgW * 0.62, topY); ctx.stroke()
      // yatay kanat kanadı (parlak üst kenar)
      const wg = ctx.createLinearGradient(0, topY - wgT, 0, topY + wgT)
      wg.addColorStop(0, this._shade(s.color, 1.35)); wg.addColorStop(1, this._shade(s.color, 0.7))
      ctx.fillStyle = wg; ctx.strokeStyle = s.accent; ctx.lineWidth = 2
      this._roundRect(ctx, rx - wgW * 0.14, topY - wgT / 2, wgW, wgT, 2); ctx.fill(); ctx.stroke()
      // yan plakalar (uç kanatçıklar) → spoiler'ı net gösterir
      ctx.fillStyle = this._shade(s.color, 0.6)
      this._roundRect(ctx, rx - wgW * 0.16, topY - wgT * 1.6, 3, wgT * 3, 1); ctx.fill()
      this._roundRect(ctx, rx + wgW * 0.80, topY - wgT * 1.6, 3, wgT * 3, 1); ctx.fill()
    }

    // EGZOZ (motor) — seviyeyle çift boru + alev
    {
      const pipes = eng >= 3 ? 2 : 1
      for (let p = 0; p < pipes; p++) {
        const ppy = bh * 0.30 - p * bh * 0.34
        const ex = -bw * 0.5 - 2
        ctx.fillStyle = '#3a4150'; this._roundRect(ctx, ex - 9, ppy - 3, 11, 6, 2); ctx.fill()
        ctx.fillStyle = '#12151c'; ctx.beginPath(); ctx.ellipse(ex - 9, ppy, 2.3, 3, 0, 0, Math.PI * 2); ctx.fill()
        if (accel) {
          const fl = 8 + eng * 2.4 + Math.abs(Math.sin(this._frame * 0.7 + p)) * 6
          const grd = ctx.createLinearGradient(ex - 9, ppy, ex - 9 - fl, ppy)
          grd.addColorStop(0, 'rgba(255,240,150,0.95)'); grd.addColorStop(0.5, 'rgba(255,150,40,0.8)'); grd.addColorStop(1, 'rgba(255,60,20,0)')
          ctx.fillStyle = grd
          ctx.beginPath(); ctx.moveTo(ex - 9, ppy - 3.4); ctx.lineTo(ex - 9 - fl, ppy); ctx.lineTo(ex - 9, ppy + 3.4); ctx.closePath(); ctx.fill()
        }
      }
    }

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

    // YAKIT DEPOSU (fuel) — arka üstte, seviyeyle büyür (gövde önünde çizilir → örtülür)
    if (fuel > 0 && !s.bike) {
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
      // lastik
      this._drawWheel(ctx, wcx, wcy, wr, tir, this.wheelSpin[wi])
    }

    // GÖVDE
    const squash = 1 - 0.06 * ((this.suspComp[0] + this.suspComp[1]) / (this.susTravel * 2 || 1))
    ctx.save(); ctx.scale(1, squash)
    const bg = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2)
    bg.addColorStop(0, this._shade(s.color, 1.3)); bg.addColorStop(0.5, s.color); bg.addColorStop(1, this._shade(s.color, 0.78))
    ctx.fillStyle = bg; ctx.strokeStyle = s.accent; ctx.lineWidth = 3
    this._roundRect(ctx, -bw / 2, -bh / 2, bw, bh, s.bike ? bh * 0.42 : 9); ctx.fill(); ctx.stroke()
    // üst parlama şeridi
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(-bw / 2 + 8, -bh / 2 + 2); ctx.lineTo(bw / 2 - 8, -bh / 2 + 2); ctx.stroke()
    // yan gövde çizgisi (karakter)
    ctx.strokeStyle = this._shade(s.color, 0.6); ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(-bw / 2 + 6, bh * 0.12); ctx.lineTo(bw / 2 - 6, bh * 0.12); ctx.stroke()
    // kabin / camlar (bisiklet hariç)
    if (!s.bike) {
      ctx.fillStyle = 'rgba(200,225,255,0.88)'; ctx.strokeStyle = s.accent; ctx.lineWidth = 3
      this._roundRect(ctx, -bw * 0.16, -bh * 0.5 - bh * 0.55, bw * 0.5, bh * 0.6, 6); ctx.fill(); ctx.stroke()
      // cam bölme çubuğu
      ctx.strokeStyle = s.accent; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(bw * 0.09, -bh * 0.5); ctx.lineTo(bw * 0.09, -bh * 0.5 - bh * 0.55); ctx.stroke()
    } else {
      // gidon (bisiklet)
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.moveTo(bw * 0.30, -bh * 0.3); ctx.lineTo(bw * 0.5, -bh * 0.9); ctx.stroke()
    }
    ctx.restore()

    // TURBO / HAVA GİRİŞİ (motor yüksek) — kaputta trapez scoop
    if (eng >= 5 && !s.bike) {
      const sw = bw * 0.13, sh = bh * 0.45, sxp = bw * 0.14
      ctx.fillStyle = '#1f2937'
      ctx.beginPath()
      ctx.moveTo(sxp - sw, -bh * 0.5); ctx.lineTo(sxp + sw, -bh * 0.5)
      ctx.lineTo(sxp + sw * 0.55, -bh * 0.5 - sh); ctx.lineTo(sxp - sw * 0.55, -bh * 0.5 - sh); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#0b0e14'; ctx.fillRect(sxp - sw * 0.55, -bh * 0.5 - sh, sw * 1.1, 3)
    }

    // ŞANZIMAN rozeti (gear) — küçük vites göstergesi
    if (gear > 0 && !s.bike) {
      ctx.fillStyle = 'rgba(15,23,42,0.85)'
      this._roundRect(ctx, bw * 0.16, bh * 0.02, 16, 12, 3); ctx.fill()
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 9px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('G' + Math.min(6, 1 + Math.round(gear * 0.5)), bw * 0.16 + 8, bh * 0.02 + 6)
      ctx.textBaseline = 'alphabetic'
    }

    // far ışığı
    if (speed > 200) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,247,200,0.12)'
      ctx.beginPath(); ctx.moveTo(bw / 2, bh * 0.1); ctx.lineTo(bw / 2 + bw * 0.7, -bh * 0.3); ctx.lineTo(bw / 2 + bw * 0.7, bh * 0.5); ctx.closePath(); ctx.fill(); ctx.restore()
    }
    // ön far lambası
    ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(bw * 0.46, bh * 0.02, 3.2, 0, Math.PI * 2); ctx.fill()
    // fren / geri ışığı
    if (this.input.rev) {
      ctx.save(); ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 8; ctx.fillStyle = '#ef4444'
      ctx.fillRect(-bw / 2 - 1, bh * 0.05, 3, bh * 0.3); ctx.restore()
    }

    // sürücü kafa/kask
    const hx = s.bike ? 0 : bw * 0.05, hy = -bh * 0.5 - (s.bike ? 16 : 10)
    ctx.fillStyle = '#fcd34d'; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#92400e'; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(hx + 4, hy, 9, -0.5, 0.9); ctx.fill()

    ctx.restore()
  }

  _drawWheel(ctx, cx, cy, r, tir, spin) {
    // dış lastik
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#14171e'; ctx.fill()
    ctx.lineWidth = 2.5 + tir * 0.15; ctx.strokeStyle = '#0a0c10'; ctx.stroke()
    // sırt deseni (lastik yükseldikçe kalın/çentikli)
    const treads = 12 + tir
    ctx.strokeStyle = '#20242c'; ctx.lineWidth = 1.4 + tir * 0.28
    for (let k = 0; k < treads; k++) {
      const a = spin + k / treads * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r * 0.80, cy + Math.sin(a) * r * 0.80)
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      ctx.stroke()
    }
    // jant
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(spin)
    const rimR = r * (0.52 - tir * 0.012)
    const hubG = ctx.createRadialGradient(0, 0, 1, 0, 0, rimR)
    hubG.addColorStop(0, '#e2e8f0'); hubG.addColorStop(1, '#64748b')
    ctx.fillStyle = hubG; ctx.beginPath(); ctx.arc(0, 0, rimR, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#475569'; ctx.lineWidth = 2
    for (let k = 0; k < 6; k++) {
      ctx.beginPath(); ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(k * Math.PI / 3) * rimR, Math.sin(k * Math.PI / 3) * rimR); ctx.stroke()
    }
    ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(0, 0, rimR * 0.28, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
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
