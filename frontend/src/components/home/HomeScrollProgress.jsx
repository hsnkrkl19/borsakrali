import { useEffect, useRef } from 'react'

/**
 * HomeScrollProgress — sayfanın en üstünde ince altın çubuk.
 * Scroll ile dolar; mat altın gradient + yumuşak glow.
 * State-free (ref ile direkt DOM manipulation — re-render yok).
 */
export default function HomeScrollProgress() {
  const barRef = useRef(null)

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const apply = () => {
      const doc = document.documentElement
      const total = (doc.scrollHeight - doc.clientHeight) || 1
      const pct = Math.max(0, Math.min(1, window.scrollY / total))
      bar.style.transform = `scaleX(${pct})`
      bar.style.opacity = pct > 0.005 ? '1' : '0'
    }
    apply()
    window.addEventListener('scroll', apply, { passive: true })
    window.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className="fixed left-0 right-0 top-0 z-50 pointer-events-none"
      style={{ height: 2.5 }}
    >
      <div
        ref={barRef}
        className="h-full origin-left transition-opacity duration-300"
        style={{
          background: 'linear-gradient(90deg, var(--gold-200) 0%, var(--gold-400) 50%, var(--gold-600) 100%)',
          boxShadow: '0 0 10px rgba(16,185,129,0.5), 0 0 2px rgba(16,185,129,0.8)',
          transform: 'scaleX(0)',
          opacity: 0,
        }}
      />
    </div>
  )
}
