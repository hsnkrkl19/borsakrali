import { useEffect, useRef, useState } from 'react'

/**
 * IntersectionObserver ile alttaki ağır içerikleri sayfa scroll'una kadar mount etmez.
 * Görünür alana yaklaştığında (rootMargin ile önceden) child'ları render eder.
 *
 * Kullanım:
 *   <LazyOnScroll fallback={<div className="h-96" />}>
 *     <PahalıBileşen />
 *   </LazyOnScroll>
 */
export default function LazyOnScroll({ children, fallback = null, rootMargin = '300px', once = true }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible && once) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          if (once) obs.disconnect()
        } else if (!once) {
          setVisible(false)
        }
      },
      { rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible, once, rootMargin])

  return <div ref={ref}>{visible ? children : fallback}</div>
}
