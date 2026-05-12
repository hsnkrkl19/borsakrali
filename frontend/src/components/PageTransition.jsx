import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import anime from 'animejs'

/**
 * PageTransition — Route değişiminde içeriği fade + hafif slide ile değiştirir.
 * Layout'un içine yerleştirilir; children rendering ona bağlıdır.
 *
 * Çalışma mantığı:
 *  - useLocation pathname değişimini izler
 *  - Pathname değiştiğinde container'ı opacity 0 + slight Y'ye getirip,
 *    yeni içerik mount edildikten sonra anime.js ile yumuşakça getirir
 *  - prefers-reduced-motion ise animasyon devre dışı
 */
export default function PageTransition({ children }) {
  const location = useLocation()
  const containerRef = useRef(null)
  const lastPathRef = useRef(location.pathname)
  const isFirstRef = useRef(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // İlk mount'ta animasyon yapma (sayfa zaten yükleniyor)
    if (isFirstRef.current) {
      isFirstRef.current = false
      lastPathRef.current = location.pathname
      el.style.opacity = '1'
      el.style.transform = 'translate3d(0, 0, 0)'
      return
    }

    // Aynı path → animasyon yok (örn. query string değişimi)
    const samePath = location.pathname === lastPathRef.current
    lastPathRef.current = location.pathname
    if (samePath) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.opacity = '1'
      el.style.transform = 'translate3d(0, 0, 0)'
      return
    }

    // Yeni route mount edildi — başlangıçtan animasyon
    anime.remove(el)
    el.style.opacity = '0'
    el.style.transform = 'translate3d(0, 14px, 0)'
    anime({
      targets: el,
      opacity: [0, 1],
      translateY: [14, 0],
      duration: 520,
      easing: 'easeOutExpo',
    })

    // Yeni sayfada en üste scroll
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
  }, [location.pathname])

  return (
    <div
      ref={containerRef}
      style={{
        opacity: 1,
        transform: 'translate3d(0, 0, 0)',
        willChange: 'opacity, transform',
        minHeight: '100%',
      }}
    >
      {children}
    </div>
  )
}
