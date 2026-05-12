import { useEffect, useRef, useState, useCallback } from 'react'
import anime from 'animejs'

/* ─── prefers-reduced-motion ────────────────────────────────────────────── */
function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * useScrollReveal — Element viewport'a girdiğinde anime.js timeline tetikler.
 * Stagger ve gecikme premium akışı için cubic-bezier eğrileriyle uyumlu.
 *
 * Kullanım:
 *   const ref = useScrollReveal({ delay: 100, y: 24, stagger: 70, selector: '> *' })
 *   <div ref={ref}> ... </div>
 */
export function useScrollReveal({
  delay = 0,
  duration = 900,
  y = 28,
  opacity = [0, 1],
  stagger = 0,
  selector = null,
  threshold = 0.15,
  once = true,
  easing = 'easeOutExpo',
} = {}) {
  const ref = useRef(null)
  const hasRun = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // `> *` Selectors Level 4 — Chrome'da bile :scope olmadan invalid.
    // Bu yüzden `>` ile başlayan selector'ları :scope prefix'i ile sarmalıyoruz.
    const resolvedSelector = selector && selector.trim().startsWith('>')
      ? `:scope ${selector.trim()}`
      : selector
    const targets = resolvedSelector ? el.querySelectorAll(resolvedSelector) : [el]

    if (prefersReducedMotion()) {
      targets.forEach(t => { t.style.opacity = 1; t.style.transform = 'none' })
      return
    }
    targets.forEach(t => {
      t.style.opacity = '0'
      t.style.transform = `translate3d(0, ${y}px, 0)`
      t.style.willChange = 'transform, opacity'
    })

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && (!once || !hasRun.current)) {
          hasRun.current = true
          anime({
            targets,
            translateY: [y, 0],
            opacity,
            duration,
            delay: stagger ? anime.stagger(stagger, { start: delay }) : delay,
            easing,
            complete: () => {
              targets.forEach(t => { t.style.willChange = 'auto' })
            },
          })
          if (once) io.unobserve(entry.target)
        }
      })
    }, { threshold, rootMargin: '0px 0px -8% 0px' })

    io.observe(el)
    return () => io.disconnect()
  }, [delay, duration, y, stagger, selector, threshold, once, easing])

  return ref
}

/**
 * useDrawSVG — SVG path'lerini "kalemle çizilir gibi" animasyonla ortaya çıkarır.
 * Hero'daki mum grafik / sinyal çizgisi için.
 *
 * Kullanım:
 *   const ref = useDrawSVG({ duration: 2200, stagger: 60, selector: 'path.draw' })
 *   <svg ref={ref}><path className="draw" .../></svg>
 */
export function useDrawSVG({
  duration = 1800,
  delay = 200,
  stagger = 40,
  selector = 'path',
  easing = 'easeInOutQuart',
  trigger = 'mount', // 'mount' | 'scroll'
  threshold = 0.2,
} = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const paths = root.querySelectorAll(selector)
    if (!paths.length) return

    if (prefersReducedMotion()) {
      paths.forEach(p => { p.style.opacity = 1; p.style.strokeDashoffset = 0 })
      return
    }

    const play = () => {
      anime({
        targets: paths,
        strokeDashoffset: [anime.setDashoffset, 0],
        opacity: [0.15, 1],
        easing,
        duration,
        delay: anime.stagger(stagger, { start: delay }),
      })
    }

    if (trigger === 'scroll') {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) { play(); io.disconnect() }
        })
      }, { threshold })
      io.observe(root)
      return () => io.disconnect()
    }

    play()
  }, [duration, delay, stagger, selector, easing, trigger, threshold])

  return ref
}

/**
 * useMagnetic — Buton'a yaklaşan imleci yumuşakça çeker (premium etki).
 * strength 0..1, ne kadar yüksekse o kadar belirgin.
 */
export function useMagnetic(strength = 0.35) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return

    let raf = null
    let target = { x: 0, y: 0 }
    let current = { x: 0, y: 0 }

    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      target.x = (e.clientX - cx) * strength
      target.y = (e.clientY - cy) * strength
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onLeave = () => {
      target.x = 0
      target.y = 0
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const tick = () => {
      // Yumuşak takip — exponential smoothing
      current.x += (target.x - current.x) * 0.18
      current.y += (target.y - current.y) * 0.18
      el.style.transform = `translate3d(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px, 0)`
      if (Math.abs(target.x - current.x) > 0.05 || Math.abs(target.y - current.y) > 0.05) {
        raf = requestAnimationFrame(tick)
      } else {
        raf = null
      }
    }

    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [strength])

  return ref
}

/**
 * useCursorGlow — Belirli bir alana özel altın yumuşak imleç takibi.
 * Hero arka planında geziniyor, fareyle birlikte yumuşakça akıyor.
 */
export function useCursorGlow() {
  const containerRef = useRef(null)
  const glowRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    const glow = glowRef.current
    if (!container || !glow || prefersReducedMotion()) return

    let raf = null
    let target = { x: 0, y: 0, active: 0 }
    let current = { x: 0, y: 0, active: 0 }
    let bounds = container.getBoundingClientRect()

    const updateBounds = () => { bounds = container.getBoundingClientRect() }
    updateBounds()

    const onMove = (e) => {
      target.x = e.clientX - bounds.left
      target.y = e.clientY - bounds.top
      target.active = 1
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onEnter = () => { target.active = 1 }
    const onLeave = () => { target.active = 0 }
    const tick = () => {
      current.x += (target.x - current.x) * 0.12
      current.y += (target.y - current.y) * 0.12
      current.active += (target.active - current.active) * 0.08
      glow.style.transform = `translate3d(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px, 0) translate(-50%, -50%)`
      glow.style.opacity = current.active.toFixed(3)
      if (
        Math.abs(target.x - current.x) > 0.1 ||
        Math.abs(target.y - current.y) > 0.1 ||
        Math.abs(target.active - current.active) > 0.005
      ) {
        raf = requestAnimationFrame(tick)
      } else {
        raf = null
      }
    }

    container.addEventListener('mousemove', onMove)
    container.addEventListener('mouseenter', onEnter)
    container.addEventListener('mouseleave', onLeave)
    window.addEventListener('resize', updateBounds)
    window.addEventListener('scroll', updateBounds, { passive: true })

    return () => {
      container.removeEventListener('mousemove', onMove)
      container.removeEventListener('mouseenter', onEnter)
      container.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('resize', updateBounds)
      window.removeEventListener('scroll', updateBounds)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return [containerRef, glowRef]
}

/**
 * useCountUp — Sayıyı hedefe yumuşakça çıkarır. Scroll'la tetiklenir.
 * Premium hissi için easeOutExpo + ondalık formatlama destekler.
 */
export function useCountUp(target = 0, { duration = 1600, decimals = 0, suffix = '', prefix = '' } = {}) {
  const ref = useRef(null)
  const [value, setValue] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (prefersReducedMotion()) {
      setValue(target)
      return
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const obj = { n: 0 }
          anime({
            targets: obj,
            n: target,
            round: decimals === 0 ? 1 : Math.pow(10, decimals),
            duration,
            easing: 'easeOutExpo',
            update: () => setValue(obj.n),
          })
          io.disconnect()
        }
      })
    }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [target, duration, decimals])

  const formatted = `${prefix}${decimals === 0
    ? Math.round(value).toLocaleString('tr-TR')
    : (value / Math.pow(10, decimals)).toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }${suffix}`

  return [ref, formatted]
}

/**
 * useHoverTilt — Kart üzerine geldiğinde hafif 3D eğilme efekti.
 * Mouse pozisyonuna göre kart yatay/dikey eğilir + parlaklık imleci takip eder.
 */
export function useHoverTilt({ max = 6, scale = 1.01, glare = true } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return

    let glareEl = null
    if (glare) {
      glareEl = document.createElement('div')
      glareEl.style.cssText = `
        position: absolute; inset: 0; pointer-events: none;
        border-radius: inherit; opacity: 0;
        background: radial-gradient(circle at var(--gx,50%) var(--gy,50%), rgba(212,175,55,0.18), transparent 45%);
        transition: opacity 240ms ease;
        z-index: 1;
      `
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
      el.appendChild(glareEl)
    }

    let raf = null
    let target = { rx: 0, ry: 0, gx: 50, gy: 50, lift: 0 }
    let current = { rx: 0, ry: 0, gx: 50, gy: 50, lift: 0 }

    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      target.ry = (px - 0.5) * max * 2
      target.rx = -(py - 0.5) * max * 2
      target.gx = px * 100
      target.gy = py * 100
      target.lift = 1
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onLeave = () => {
      target.rx = 0; target.ry = 0; target.lift = 0
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const tick = () => {
      const k = 0.18
      current.rx += (target.rx - current.rx) * k
      current.ry += (target.ry - current.ry) * k
      current.gx += (target.gx - current.gx) * k
      current.gy += (target.gy - current.gy) * k
      current.lift += (target.lift - current.lift) * 0.1
      const s = 1 + (scale - 1) * current.lift
      el.style.transform = `perspective(900px) rotateX(${current.rx.toFixed(2)}deg) rotateY(${current.ry.toFixed(2)}deg) scale(${s.toFixed(3)})`
      if (glareEl) {
        glareEl.style.setProperty('--gx', `${current.gx.toFixed(1)}%`)
        glareEl.style.setProperty('--gy', `${current.gy.toFixed(1)}%`)
        glareEl.style.opacity = current.lift.toFixed(2)
      }
      if (
        Math.abs(target.rx - current.rx) > 0.05 ||
        Math.abs(target.ry - current.ry) > 0.05 ||
        Math.abs(target.lift - current.lift) > 0.005
      ) {
        raf = requestAnimationFrame(tick)
      } else {
        raf = null
      }
    }

    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
      if (glareEl && glareEl.parentNode) glareEl.parentNode.removeChild(glareEl)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [max, scale, glare])

  return ref
}

/**
 * useTimelineProgress — Scroll konumuna göre 0..1 ilerleme döndürür.
 * "How it works" zaman çizelgesinin altın doldurma çubuğu için.
 */
export function useTimelineProgress() {
  const ref = useRef(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onScroll = () => {
      const r = el.getBoundingClientRect()
      const winH = window.innerHeight
      // El: viewport ortasına yaklaşırken 0..1 doldur
      const start = winH * 0.85
      const end = winH * 0.15
      const total = r.height + (start - end)
      const consumed = start - r.top
      const p = Math.max(0, Math.min(1, consumed / total))
      setProgress(p)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return [ref, progress]
}

/**
 * useParallax — Mouse hareketine göre çocuk katmanları farklı hızlarda kaydırır.
 * Premium derinlik hissi. Element fareye girdiğinde aktif olur, çıktığında yumuşakça sıfırlanır.
 *
 * Kullanım:
 *   const { containerRef, register } = useParallax()
 *   <div ref={containerRef}>
 *     <div ref={register(0.3)}>arka plan (yavaş)</div>
 *     <div ref={register(0.6)}>orta katman</div>
 *     <div ref={register(1.0)}>ön plan (hızlı)</div>
 *   </div>
 */
export function useParallax({ maxOffset = 18 } = {}) {
  const containerRef = useRef(null)
  const layersRef = useRef([])

  const register = useCallback((depth = 0.5) => (el) => {
    if (!el) return
    const existing = layersRef.current.find(l => l.el === el)
    if (existing) existing.depth = depth
    else layersRef.current.push({ el, depth, x: 0, y: 0, tx: 0, ty: 0 })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = null
    let target = { x: 0, y: 0 }
    const tick = () => {
      let stillMoving = false
      layersRef.current.forEach(l => {
        const desiredX = target.x * l.depth * maxOffset
        const desiredY = target.y * l.depth * maxOffset
        l.x += (desiredX - l.x) * 0.10
        l.y += (desiredY - l.y) * 0.10
        l.el.style.transform = `translate3d(${l.x.toFixed(2)}px, ${l.y.toFixed(2)}px, 0)`
        if (Math.abs(desiredX - l.x) > 0.05 || Math.abs(desiredY - l.y) > 0.05) stillMoving = true
      })
      raf = stillMoving ? requestAnimationFrame(tick) : null
    }

    const onMove = (e) => {
      const r = container.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      // -1 .. 1 normalize
      target.x = (px - 0.5) * 2
      target.y = (py - 0.5) * 2
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onLeave = () => {
      target.x = 0; target.y = 0
      if (!raf) raf = requestAnimationFrame(tick)
    }

    container.addEventListener('mousemove', onMove)
    container.addEventListener('mouseleave', onLeave)
    return () => {
      container.removeEventListener('mousemove', onMove)
      container.removeEventListener('mouseleave', onLeave)
      if (raf) cancelAnimationFrame(raf)
      layersRef.current.forEach(l => { if (l.el) l.el.style.transform = 'translate3d(0,0,0)' })
    }
  }, [maxOffset])

  return { containerRef, register }
}
