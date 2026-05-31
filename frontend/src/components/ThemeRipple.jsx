import { useEffect, useRef } from 'react'

/**
 * ThemeRipple — Tema değişiminde ekranı altın bir radial ripple ile siler.
 * `bk-theme-change` event'ini dinler; event payload içinden tıklama pozisyonunu
 * okur (yoksa ekran merkezinden başlatır).
 *
 * applyTheme fonksiyonunu değiştirmek yerine ThemeToggle'da event detail'ine
 * pozisyon eklenir. Bu component minimal — sadece overlay render eder, hiçbir
 * state tutmaz, doğrudan DOM ile çalışır.
 */
export default function ThemeRipple() {
  const overlayRef = useRef(null)

  useEffect(() => {
    const onChange = (event) => {
      const overlay = overlayRef.current
      if (!overlay) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      // Pozisyon — event'ten gelen veya merkez
      const x = event?.detail?.x ?? window.innerWidth / 2
      const y = event?.detail?.y ?? window.innerHeight / 2
      const theme = event?.detail?.theme

      // Gold tonu — dark'a geçişte daha sıcak, light'a geçişte daha soğuk
      const color = theme === 'light'
        ? 'rgba(16,185,129,0.55)'   // light: daha yumuşak gold
        : 'rgba(255,215,90,0.50)'   // dark: parlak gold

      // Ekran köşeleri arası maksimum mesafe
      const maxR = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      )

      overlay.style.background = `radial-gradient(circle ${maxR}px at ${x}px ${y}px, ${color} 0%, transparent 60%)`
      overlay.style.opacity = '1'
      overlay.style.transform = 'scale(0.4)'

      // RAF chain: önce büyüt + parla, sonra söndür
      requestAnimationFrame(() => {
        overlay.style.transition = 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1), opacity 700ms ease-out'
        overlay.style.transform = 'scale(1.4)'
        overlay.style.opacity = '0'
      })

      // Reset transition after animation
      window.setTimeout(() => {
        if (!overlay) return
        overlay.style.transition = 'none'
        overlay.style.transform = 'scale(0.4)'
        overlay.style.opacity = '0'
      }, 800)
    }

    window.addEventListener('bk-theme-change', onChange)
    return () => window.removeEventListener('bk-theme-change', onChange)
  }, [])

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="fixed inset-0 z-[1000] pointer-events-none mix-blend-screen"
      style={{
        opacity: 0,
        transform: 'scale(0.4)',
        transformOrigin: 'center',
        willChange: 'transform, opacity',
      }}
    />
  )
}
