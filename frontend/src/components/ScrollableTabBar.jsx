import { useRef, useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function ScrollableTabBar({
  children,
  className = '',
  wrapperClassName = '',
  scrollAmount = 220,
  activeKey,
  fadeEdges = true,
}) {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const overflow = el.scrollWidth > el.clientWidth + 1
    setCanScrollLeft(overflow && el.scrollLeft > 4)
    setCanScrollRight(overflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateScrollButtons()
    const handleScroll = () => updateScrollButtons()
    el.addEventListener('scroll', handleScroll, { passive: true })
    const ro = new ResizeObserver(updateScrollButtons)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', handleScroll)
      ro.disconnect()
    }
  }, [updateScrollButtons])

  useEffect(() => {
    if (!activeKey) return
    const el = scrollRef.current
    if (!el) return
    const target = el.querySelector(`[data-tab-key="${CSS.escape(String(activeKey))}"]`)
    if (!target) return
    const elRect = el.getBoundingClientRect()
    const tRect = target.getBoundingClientRect()
    if (tRect.left < elRect.left + 8 || tRect.right > elRect.right - 8) {
      const max = el.scrollWidth - el.clientWidth
      const targetLeft = el.scrollLeft + ((tRect.left + tRect.right) / 2 - (elRect.left + elRect.right) / 2)
      el.scrollLeft = Math.max(0, Math.min(max, targetLeft))
    }
  }, [activeKey])

  const scrollBy = (delta) => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + delta))
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      {canScrollLeft && (
        <>
          <button
            type="button"
            onClick={() => scrollBy(-scrollAmount)}
            aria-label="Sola kaydır"
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 md:w-8 md:h-8 rounded-full bg-dark-800/95 border border-gold-500/40 text-gold-200 hover:bg-dark-700 hover:border-gold-500 hover:text-gold-100 active:scale-95 transition-all shadow-lg flex items-center justify-center backdrop-blur"
          >
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          {fadeEdges && (
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-dark-900/90 via-dark-900/40 to-transparent pointer-events-none z-10" />
          )}
        </>
      )}
      <div
        ref={scrollRef}
        className={`flex overflow-x-auto scrollbar-hide min-w-0 max-w-full ${className}`}
      >
        {children}
      </div>
      {canScrollRight && (
        <>
          {fadeEdges && (
            <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-dark-900/90 via-dark-900/40 to-transparent pointer-events-none z-10" />
          )}
          <button
            type="button"
            onClick={() => scrollBy(scrollAmount)}
            aria-label="Sağa kaydır"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-7 h-7 md:w-8 md:h-8 rounded-full bg-dark-800/95 border border-gold-500/40 text-gold-200 hover:bg-dark-700 hover:border-gold-500 hover:text-gold-100 active:scale-95 transition-all shadow-lg flex items-center justify-center backdrop-blur"
          >
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </>
      )}
    </div>
  )
}
