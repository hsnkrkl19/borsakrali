// ============================================================================
// HİSSE YARIŞI — Fizik & render motoru (v2: TradingView görünümü + zengin fizik)
// ----------------------------------------------------------------------------
// Pist = seçilen hissenin LOG fiyat grafiği (resample + ping-pong sonsuz).
// Sahne gerçek bir TradingView koyu grafik ekranı gibi çizilir: ızgara, sağ
// fiyat ekseni (gerçek ₺), alt tarih ekseni, alan-dolgulu fiyat çizgisi
// (sürülen zemin), canlı fiyat etiketi/crosshair, sembol filigranı, ticker.
//
// Fizik: rijit şasi + 2 penalty-contact yaylı teker. Ek detaylar: tepeden
// fırlatma, takla kombosu, iniş kalitesi, yokuş-aşağı momentum, çarpma
// toleransı, ekran sarsıntısı, lastik izi, hız çizgileri, parçacıklar.
// ============================================================================

const GRAV = 1750
const SUBSTEPS = 6
const SX = 110              // örnek nokta yatay aralığı
const AMP = 600             // fiyat → yükseklik bandı
const MAXSTEP = AMP * 0.13
const TERRAIN_POINTS = 150
const METER = 30
const PHYS_DT_MAX = 1 / 50
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

    this.input = { gas: false, brake: false }
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

    const sm = res.map((v, i) => {
      const a = res[Math.max(0, i - 1)], b = res[Math.min(N - 1, i + 1)]
      return (a + v * 2 + b) / 4
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
    let bi = 14
    while (bi < N - 6) {
      if (hash32(bi * 53 + 11) % 5 === 0) {
        const peak = AMP * 0.16
        h[bi - 1] += peak * 0.5
        h[bi] += peak
        h[bi + 1] += peak * 0.5
        bi += 13
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
    const startX = SX * 2
    this.startX = startX
    this.car = {
      x: startX, y: this.heightAt(startX) + 45,   // zemine yakın doğ → drop-in spin yok
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

    const wb = s.wheelBase
    this.wheels = [
      { lx: -wb / 2, ly: -s.bodyH * 0.45, r: s.wheelR, drive: true },
      { lx: wb / 2, ly: -s.bodyH * 0.45, r: s.wheelR, drive: true },
    ]
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
    const gas = this.input.gas
    const brake = this.input.brake
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
      const wx = car.x + w.lx * rightX + w.ly * upX
      const wy = car.y + w.lx * rightY + w.ly * upY
      const gy = this.heightAt(wx)
      const penetration = (gy + w.r) - wy
      this.suspComp[wi] = clamp(penetration, 0, w.r * 1.4)

      if (penetration > 0) {
        groundContacts++
        const n = this.normalAt(wx)
        avgN.x += n.x; avgN.y += n.y
        const rx = wx - car.x
        const ry = (wy - w.r) - car.y
        const rcx = wx - car.x
        const rcy = wy - car.y
        const vcx = car.vx - car.angVel * ry
        const vcy = car.vy + car.angVel * rx
        const vn = vcx * n.x + vcy * n.y

        let Fn = s.suspK * penetration - s.suspDamp * vn
        if (Fn < 0) Fn = 0
        this._applyImpulse(n.x * Fn * dt, n.y * Fn * dt, rx, ry)

        let tx = n.y, ty = -n.x
        if (tx * rightX + ty * rightY < 0) { tx = -tx; ty = -ty }
        const vt = vcx * tx + vcy * ty

        let drive = 0
        if (w.drive && hasFuel) {
          if (gas) drive += s.enginePower
          if (brake) drive -= s.enginePower * 0.72
        }
        if (speed > s.topSpeed && drive > 0) drive = 0

        const maxF = s.grip * Fn
        let Ft = drive - 7 * vt
        Ft = clamp(Ft, -maxF, maxF)
        this._applyImpulse(tx * Ft * dt, ty * Ft * dt, rcx, rcy)
        this.wheelSpin[wi] += (vt / w.r) * dt

        if (gas && hasFuel && speed > 120 && Math.abs(vt) > 60 && hash32(this._frame * 7 + wi) % 3 === 0) {
          this._spawnDust(wx, gy, -tx, -ty)
        }
      } else this.suspComp[wi] = 0
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

    // HAVA KONTROLÜ (klasik Hill-Climb riski):
    //  • Havada DOKUNMAZSAN → araç düz inişe yönelir (güvenli).
    //  • Gaz/fren tutarsan → SERBEST döner (takla). Ama ters/yan inersen BOYNUN
    //    KIRILIR = oyun biter. Yani takla riskli bir ustalık hamlesi.
    if (!car.onGround && this._hasLanded) {
      const a = wrapPi(car.angle)
      const ramp = clamp(this._physAirTimer / 0.12, 0.5, 1)
      const at = s.airControl * 2.0 * ramp
      if (gas && hasFuel) car.angVel += at * dt          // geri takla — RİSK
      else if (brake && hasFuel) car.angVel -= at * dt   // ön takla — RİSK
      else car.angVel += (-a * 14 - car.angVel * 6) * dt // dokunma → düz inişe yönel
    }

    car.vx -= car.vx * 0.16 * dt
    car.vy -= car.vy * 0.02 * dt
    const angDamp = car.onGround ? 4.5 : (0.5 / s.stability)
    car.angVel -= car.angVel * angDamp * dt
    car.angVel = clamp(car.angVel, -11, 11)

    car.x += car.vx * dt
    car.y += car.vy * dt
    car.angle += car.angVel * dt

    // kalkış / iniş kenarı
    if (this._wasGroundPhys && !car.onGround) {
      // Kalkışta dönüş girişi yoksa crest'in verdiği spin'i kır → araç DÜZ uçar.
      if (!gas && !brake) car.angVel *= 0.2
      // Crest fırlatması: hızlıysan tepeden uçarsın (zıplama/takla için hava).
      const nL = this.normalAt(car.x - SX * 0.5).x
      const nR = this.normalAt(car.x + SX * 0.5).x
      if (nL < -0.05 && nR > 0.05 && car.vx > 220) car.vy += clamp(car.vx, 0, 950) * 0.12 + 40
      this._physAirTimer = 0
    } else if (!this._wasGroundPhys && car.onGround) {
      // iniş açısını yakala (clamp öncesi) → ters/yan iniş ölümcül
      this._pendingLanding = { vy: car.vy, airTime: this._physAirTimer, flips: this._flipsThisAir, angle: wrapPi(car.angle) }
    }
    if (car.onGround) this._hasLanded = true
    if (!car.onGround) this._physAirTimer += dt
    else this._physAirTimer = 0
    this._wasGroundPhys = car.onGround

    // lastik izi (çizginin üstünde, ilerledikçe)
    if (car.onGround && Math.abs(car.x - this._lastTrailX) > 9) {
      const gy = this.heightAt(car.x)
      const hard = speed > s.topSpeed * 0.5 && (this.input.gas || this.input.brake)
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
      if (this.input.gas || this.input.brake) burn = 7
      this.fuel = Math.max(0, this.fuel - burn * frameDt)
    }

    this.run.distanceM = Math.max(this.run.distanceM, (car.x - this.startX) / METER)
    const spd = Math.hypot(car.vx, car.vy)
    this.run.maxSpeed = Math.max(this.run.maxSpeed, spd)

    // hava / takla kombosu
    if (!car.onGround) {
      this._airTimer += frameDt
      this._airAccum += car.angVel * frameDt
      if (Math.abs(this._airAccum) >= Math.PI * 1.3) {   // ~234° = bir tur döndü
        // Ödül DEĞİL: sadece say. Ödül/ceza İNİŞTE belli olur (temiz in = ödül,
        // ters in = ölüm). Böylece takla gerçek bir risk.
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
      const L = this._pendingLanding; this._pendingLanding = null
      const gN = car.groundN
      const groundAngle = Math.atan2(gN.x, gN.y)
      if (Math.abs(L.angle) > 1.55) {
        // TERS / YAN İNDİ → boyun kırıldı = oyun biter (klasik Hill-Climb riski)
        return this._gameOver('crash')
      }
      if (L.flips >= 1) {
        // TAM TAKLA atıp DÜZ indi → ustalık ödülü (sadece indirilen taklalar sayılır)
        this.run.flips += L.flips
        car.angle = -groundAngle
        car.angVel *= 0.2
        const pay = 30 * L.flips
        this.run.coins += 8 * L.flips
        this._addFloat(car.x, car.y + 55, (L.flips > 1 ? L.flips + 'X TAKLA! +' : 'TAKLA! +') + pay, '#fbbf24')
        this._beep(1040, 0.12); this._addShake(5); this._spawnSparkle(car.x, car.y + 20)
      } else if (L.airTime > 0.4) {
        const misalign = Math.abs(wrapPi(car.angle + groundAngle))
        if (misalign < 0.32) {
          this.run.coins += 8
          this._addFloat(car.x, car.y + 55, 'MÜKEMMEL İNİŞ!', '#22c55e')
          this._beep(990, 0.12); this._addShake(4); this._spawnSparkle(car.x, car.y + 20)
        } else if (L.vy < -520) {
          // sert ama ÖLÜMCÜL değil — sadece sarsıntı + toz (affedici tasarım)
          this._addShake(clamp(-L.vy / 120, 4, 16))
          this._spawnPoof(car.x, this.heightAt(car.x), -L.vy / 90)
        }
      }
    }

    this._collect()
    this._stepParticles(frameDt)
    this.shake = Math.max(0, this.shake - this.shake * Math.min(1, 12 * frameDt))
    this._updateAudio(spd)

    // ÇARPMA — affedici: sadece (a) kafayı tepeye uzun süre gömersen (yüz üstü
    // dalış) ya da (b) tepetaklak olup öyle kalırsan. Kötü iniş tek başına öldürmez.
    const cosA = Math.cos(car.angle), sinA = Math.sin(car.angle)
    const headX = car.x + (-sinA) * (s.bodyH * 0.5 + 14)
    const headY = car.y + (cosA) * (s.bodyH * 0.5 + 14)
    const headBuried = headY < this.heightAt(headX) - 8
    if (headBuried) this._crashTimer += frameDt; else this._crashTimer = 0
    const crashSpd = 55 * (s.landing || 1)
    // Tek kaza yolu: hızla bir tepeye yüz-üstü saplanıp sürekli gömülü kalmak.
    // Ters dönme yerde otomatik doğrultulduğu için artık öldürmez.
    if (this._crashTimer > 0.6 && spd > crashSpd) {
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
    if (this.particles.length > 200) return
    this.particles.push({ kind: 'dust', x, y, vx: dx * 40 + (hash32(x | 0) % 30 - 15), vy: 30 + (hash32(y | 0) % 40), life: 0.5, age: 0, r: 5 + (hash32((x + y) | 0) % 6) })
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
    const throttle = (this.input.gas || this.input.brake) && this.fuel > 0
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
    this.zoomBase = clamp(h / 1060, 0.42, 0.8)   // uzaklaştırıldı → grafik/pist daha çok görünür
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
    const lookAhead = clamp(car.vx * 0.32 + Math.sign(car.vx) * spd * 0.06, -200, 520)
    const tgtX = car.x + lookAhead
    const tgtY = car.y + 52 + spd * 0.010 + (!car.onGround ? 60 : 0)
    this.camX = lerp(this.camX ?? car.x, tgtX, k(11))
    this.camY = lerp(this.camY ?? car.y, tgtY, k(8))
    const zTarget = this.zoomBase * clamp(1 - spd / 9000, 0.8, 1)
    this._zoom = lerp(this._zoom ?? this.zoomBase, zTarget, k(3))
    const zoom = this._zoom

    const sh = this.shake
    const ox = sh ? (Math.random() * 2 - 1) * sh : 0
    const oy = sh ? (Math.random() * 2 - 1) * sh * 1.3 : 0
    const sx = (wx) => (wx - this.camX) * zoom + W / 2 + ox
    const sy = (wy) => H / 2 - (wy - this.camY) * zoom + oy

    this._drawBackground(ctx, W, H, sx)
    this._drawWatermark(ctx, W, H)
    this._drawAreaLine(ctx, W, H, sx, sy)
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

  _drawBackground(ctx, W, H, sx) {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, TV.bg); g.addColorStop(1, TV.bg2)
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    // dikey ızgara (kamera ile kayar)
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
    // yatay ızgara (fiyat satırları)
    ctx.strokeStyle = TV.grid
    ctx.beginPath()
    for (const py of this._rows(H)) { ctx.moveTo(0, py); ctx.lineTo(W - AXW, py) }
    ctx.stroke()
  }

  _drawWatermark(ctx, W, H) {
    ctx.save()
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(120,123,134,0.07)'
    ctx.font = '700 64px -apple-system,Segoe UI,sans-serif'
    ctx.fillText(this.symbol, W / 2, H * 0.40)
    ctx.font = '600 16px -apple-system,Segoe UI,sans-serif'
    ctx.fillStyle = 'rgba(120,123,134,0.06)'
    ctx.fillText('BIST · 15DK', W / 2, H * 0.40 + 42)
    ctx.restore()
  }

  _drawAreaLine(ctx, W, H, sx, sy) {
    const accent = this.up ? TV.up : TV.down
    // dünya-x üzerinden ilerle + sx/sy kullan → sarsıntıda araç/çizgi birlikte oynar
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
    g.addColorStop(0, `rgba(${rgb},0.30)`); g.addColorStop(0.55, `rgba(${rgb},0.08)`); g.addColorStop(1, `rgba(${rgb},0)`)
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
    // canlı fiyat pill'i (aracın seviyesinde)
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
    // hız vignette
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75)
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.26 * intensity})`)
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  }

  _drawVehicle(ctx, sx, sy, zoom) {
    const car = this.car, s = this.stats
    const px = sx(car.x), py = sy(car.y)
    ctx.save(); ctx.translate(px, py); ctx.rotate(-car.angle); ctx.scale(zoom, zoom)

    const bw = s.bodyW, bh = s.bodyH, wb = s.wheelBase, wr = s.wheelR
    const squash = 1 - 0.05 * ((this.suspComp[0] + this.suspComp[1]) / (wr * 1.4 * 2))

    // gölge
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath(); ctx.ellipse(0, bh * 0.55 + wr, bw * 0.52 * (car.onGround ? 1 : 0.6), 7, 0, 0, Math.PI * 2); ctx.fill()

    // tekerler
    for (let wi = 0; wi < this.wheels.length; wi++) {
      const w = this.wheels[wi]
      const comp = this.suspComp[wi] * 0.6
      const wx = w.lx, wy = -w.ly + comp
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 4
      ctx.beginPath(); ctx.moveTo(wx, -bh * 0.1); ctx.lineTo(wx, wy - wr * 0.3); ctx.stroke()
      ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.fillStyle = '#15181f'; ctx.fill()
      ctx.strokeStyle = '#0a0c10'; ctx.lineWidth = 3; ctx.stroke()
      ctx.save(); ctx.translate(wx, wy); ctx.rotate(this.wheelSpin[wi])
      const hubG = ctx.createRadialGradient(0, 0, 1, 0, 0, wr * 0.55)
      hubG.addColorStop(0, '#e2e8f0'); hubG.addColorStop(1, '#64748b')
      ctx.fillStyle = hubG; ctx.beginPath(); ctx.arc(0, 0, wr * 0.5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 2
      for (let kk = 0; kk < 6; kk++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(kk * Math.PI / 3) * wr * 0.5, Math.sin(kk * Math.PI / 3) * wr * 0.5); ctx.stroke() }
      ctx.restore()
    }

    ctx.save(); ctx.scale(1, squash)
    // gövde (gradient)
    const bg = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2)
    bg.addColorStop(0, this._shade(s.color, 1.25)); bg.addColorStop(1, s.color)
    ctx.fillStyle = bg; ctx.strokeStyle = s.accent; ctx.lineWidth = 3
    this._roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 8); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(-bw / 2 + 8, -bh / 2 + 2); ctx.lineTo(bw / 2 - 8, -bh / 2 + 2); ctx.stroke()
    if (!s.bike) {
      ctx.fillStyle = 'rgba(210,230,255,0.85)'; ctx.strokeStyle = s.accent; ctx.lineWidth = 3
      this._roundRect(ctx, -bw * 0.18, -bh * 0.5 - bh * 0.55, bw * 0.5, bh * 0.6, 6); ctx.fill(); ctx.stroke()
    }
    ctx.restore()

    // far / fren ışığı
    if (Math.hypot(car.vx, car.vy) > 200) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,247,200,0.12)'
      ctx.beginPath(); ctx.moveTo(bw / 2, bh * 0.1); ctx.lineTo(bw / 2 + bw * 0.7, -bh * 0.3); ctx.lineTo(bw / 2 + bw * 0.7, bh * 0.5); ctx.closePath(); ctx.fill(); ctx.restore()
    }
    if (this.input.brake) {
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
