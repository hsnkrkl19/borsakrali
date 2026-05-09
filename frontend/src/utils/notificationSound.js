/**
 * Web Audio API ile iki notalı, hoş bir bildirim chime'ı çalar.
 * Hiçbir external dosyaya gerek yok — sıfır byte ekler.
 *
 * Tarayıcıların autoplay policy'si: kullanıcı en az bir kez sayfayla
 * etkileşime girmiş olmalı (login, tıklama vb). Auth'lu kullanıcı zaten
 * giriş yaptığı için bu koşul fiilen sağlanmış olur.
 */

let sharedCtx = null

function getCtx() {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!sharedCtx) sharedCtx = new Ctx()
  if (sharedCtx.state === 'suspended') {
    // user gesture sonrası resume olur; öncesi sessizce başarısız olabilir
    sharedCtx.resume?.().catch(() => {})
  }
  return sharedCtx
}

/**
 * iki notalı chime — A5 (880Hz) → E6 (1318Hz). Toplam ~0.6 sn.
 */
export function playNotificationChime(volume = 0.30) {
  try {
    const ctx = getCtx()
    if (!ctx) return

    const notes = [
      { freq: 880,  start: 0,    dur: 0.32 }, // A5
      { freq: 1318, start: 0.12, dur: 0.42 }, // E6
    ]

    const now = ctx.currentTime

    for (const note of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.value = note.freq

      const startTime = now + note.start
      const stopTime = startTime + note.dur

      // Amplitude envelope: hızlı atak + üstel decay (yumuşak çan etkisi)
      gain.gain.setValueAtTime(0.0001, startTime)
      gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, stopTime)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(startTime)
      osc.stop(stopTime + 0.01)
    }
  } catch {
    /* sessizce yut — autoplay policy / context kapalı vb */
  }
}
