import { useEffect, useState, useRef } from 'react'

/**
 * HomeSectionNav — sağ kenarda dikey nokta navigasyonu.
 * Her nokta bir bölüme atlar; mevcut bölüm büyüyüp altın olur.
 * Sadece desktop'ta (lg+) görünür.
 *
 * Note: opacity/transform DOM ref ile yönetilir (state batching sorunları
 * preview eval'da farklı timing'lere yol açıyordu; ref direkt güvenilir).
 */
const SECTIONS = [
  { id: 'hero',         label: 'Anasayfa' },
  { id: 'philosophy',   label: 'Felsefe' },
  { id: 'depth',        label: 'Derinlik' },
  { id: 'strategies',   label: 'Stratejiler' },
  { id: 'sources',      label: 'Veri' },
  { id: 'how',          label: 'Nasıl Çalışır' },
  { id: 'education',    label: 'Eğitim' },
  { id: 'testimonials', label: 'Yorumlar' },
  { id: 'changelog',    label: 'Sürümler' },
  { id: 'faq',          label: 'S.S.S.' },
  { id: 'cockpit',      label: 'Kokpit' },
]

export default function HomeSectionNav() {
  const [activeIdx, setActiveIdx] = useState(0)
  const [hoverIdx, setHoverIdx] = useState(null)
  const navRef = useRef(null)

  useEffect(() => {
    const nav = navRef.current
    if (!nav) {
      window.__bkNavDebug = 'no-ref'
      return
    }
    window.__bkNavDebug = 'effect-ran'
    const apply = () => {
      window.__bkNavApplyCount = (window.__bkNavApplyCount || 0) + 1
      const winH = window.innerHeight
      let best = 0
      let bestDist = Infinity
      SECTIONS.forEach((s, i) => {
        const el = document.getElementById(s.id)
        if (!el) return
        const r = el.getBoundingClientRect()
        const center = r.top + r.height * 0.3
        const target = winH * 0.35
        const dist = Math.abs(center - target)
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      })
      setActiveIdx(best)
      const visible = window.scrollY > 200
      nav.style.opacity = visible ? '1' : '0'
      nav.style.transform = `translateY(-50%) translateX(${visible ? '0' : '12px'})`
      window.__bkNavLastApply = { scrollY: window.scrollY, visible, opacityNow: nav.style.opacity }
    }
    apply()
    window.addEventListener('scroll', apply, { passive: true })
    window.addEventListener('resize', apply)
    return () => {
      window.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
    }
  }, [])

  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (!el) return
    const y = el.getBoundingClientRect().top + window.scrollY - 80
    window.scrollTo({ top: y, behavior: 'smooth' })
  }

  return (
    <nav
      ref={(el) => {
        navRef.current = el
        // İlk mount stili — React style prop'u kullanmıyoruz ki re-render'lar
        // ref ile uyguladığımız değerleri ezmesin.
        if (el && !el.dataset.bkInit) {
          el.style.opacity = '0'
          el.style.transform = 'translateY(-50%) translateX(12px)'
          el.dataset.bkInit = '1'
        }
      }}
      aria-label="Bölüm navigasyonu"
      className="hidden lg:flex fixed right-5 top-1/2 z-30 flex-col items-end gap-3 pointer-events-none transition-all duration-500"
    >
      {SECTIONS.map((s, i) => {
        const isActive = i === activeIdx
        const isHover  = i === hoverIdx
        return (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            className="group flex items-center gap-2.5 pointer-events-auto cursor-pointer"
            aria-label={`${s.label} bölümüne git`}
          >
            <span
              className="text-[11px] font-semibold tracking-wide whitespace-nowrap transition-all duration-400"
              style={{
                opacity: isHover || isActive ? 1 : 0,
                transform: isHover || isActive ? 'translateX(0)' : 'translateX(8px)',
                color: isActive ? 'var(--gold-400)' : 'var(--text-secondary)',
                background: 'var(--bg-card)',
                padding: isHover || isActive ? '4px 10px' : '0',
                borderRadius: '8px',
                border: isHover || isActive ? '1px solid var(--border-gold)' : '1px solid transparent',
                boxShadow: isHover || isActive ? 'var(--shadow-md)' : 'none',
              }}
            >
              {s.label}
            </span>
            <span
              className="block rounded-full transition-all duration-400"
              style={{
                width: isActive ? 10 : 8,
                height: isActive ? 10 : 8,
                background: isActive
                  ? 'linear-gradient(135deg, var(--gold-300), var(--gold-500))'
                  : isHover ? 'var(--gold-400)' : 'var(--text-faint)',
                boxShadow: isActive ? '0 0 0 3px rgba(16,185,129,0.18), 0 0 12px rgba(16,185,129,0.45)' : 'none',
                transform: isActive ? 'scale(1.05)' : 'scale(1)',
              }}
            />
          </button>
        )
      })}
    </nav>
  )
}
