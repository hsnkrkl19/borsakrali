import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Home, Sparkles, Activity, Bot, BookOpen,
} from 'lucide-react'

/**
 * MobileBottomNav — yalnızca mobile'da görünen alt sticky nav.
 * Parça 1: 5 ana yol — Sidebar ile aynı dilde: Ana / Fırsatlar / Sinyaller / Botlar / Öğren.
 * Hesabım sağ üst profil avatarı (Header) üzerinden açılır.
 */
const NAV_ITEMS = [
  { to: '/',          label: 'Ana',       icon: Home                              },
  { to: '/firsatlar', label: 'Fırsatlar', icon: Sparkles, tour: 'nav-firsatlar' },
  { to: '/sinyaller', label: 'Sinyaller', icon: Activity, tour: 'nav-sinyaller' },
  { to: '/botlar',    label: 'Botlar',    icon: Bot,      tour: 'nav-botlar'    },
  { to: '/ogren',     label: 'Öğren',     icon: BookOpen, tour: 'nav-ogren'     },
]

export default function MobileBottomNav() {
  const location = useLocation()
  const navRef = useRef(null)
  const lastScrollRef = useRef(0)
  const hiddenRef = useRef(false)

  // Scroll-direction tabanlı otomatik gizle/göster
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const apply = () => {
      const y = window.scrollY
      const prev = lastScrollRef.current
      const delta = y - prev
      // Aşağı kaydırma + sayfa başında değil → gizle
      if (delta > 8 && y > 120 && !hiddenRef.current) {
        nav.style.transform = 'translateY(calc(100% + 12px))'
        hiddenRef.current = true
      }
      // Yukarı kaydırma → göster
      else if (delta < -4 && hiddenRef.current) {
        nav.style.transform = 'translateY(0)'
        hiddenRef.current = false
      }
      lastScrollRef.current = y
    }
    window.addEventListener('scroll', apply, { passive: true })
    return () => window.removeEventListener('scroll', apply)
  }, [])

  // Route değişiminde nav göster
  useEffect(() => {
    if (!navRef.current) return
    navRef.current.style.transform = 'translateY(0)'
    hiddenRef.current = false
  }, [location.pathname])

  const isHomePath = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  return (
    <nav
      ref={navRef}
      aria-label="Alt navigasyon"
      className="lg:hidden fixed left-0 right-0 bottom-0 z-40 transition-transform duration-400 ease-out"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: `
          linear-gradient(180deg, rgba(10,16,32,0.0) 0%, rgba(10,16,32,0.85) 30%, rgba(10,16,32,0.96) 100%)
        `,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Üst kenarda altın çizgi */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent 5%, rgba(212,175,55,0.55) 50%, transparent 95%)' }}
      />

      <div className="grid grid-cols-5 gap-1 px-2 pt-2 pb-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = isHomePath(item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              data-tour={item.tour}
              className="group relative flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl transition-all"
              style={{
                color: active ? 'var(--gold-300)' : '#94a3b8',
              }}
            >
              {/* Active background — gold pill */}
              {active && (
                <span aria-hidden="true"
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: 'radial-gradient(closest-side, rgba(212,175,55,0.18), transparent 80%)',
                  }}
                />
              )}
              {/* İkon kutusu — active'de hafif scale */}
              <div
                className="relative flex items-center justify-center w-7 h-7 rounded-lg transition-transform"
                style={{
                  transform: active ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.4 : 2} />
              </div>
              <span className="relative text-[10px] font-semibold tracking-tight">
                {item.label}
              </span>
              {/* Active alt nokta */}
              {active && (
                <span aria-hidden="true"
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{
                    background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))',
                    boxShadow: '0 0 8px rgba(212,175,55,0.6)',
                  }}
                />
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
