import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, ArrowRight, X } from 'lucide-react'
import { useMagnetic } from '../../hooks/useAnime'
import { useAuthStore } from '../../store/authStore'

/**
 * HomeStickyCTA — sayfa scroll edildiğinde üstte beliren ince çubuk.
 * Sadece login OLMAYAN kullanıcılar için gözükür.
 * Kapatma butonu var; bu oturum boyunca tekrar açılmaz.
 */
export default function HomeStickyCTA() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('bk-sticky-cta-dismissed') === '1' } catch { return false }
  })
  const btnRef = useMagnetic(0.20)
  const containerRef = useRef(null)

  // DOM manipulation — state-free, scroll'a göre opacity + transform
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const apply = () => {
      const show = window.scrollY > 600
      el.style.opacity = show ? '1' : '0'
      el.style.transform = show ? 'translateY(0)' : 'translateY(-110%)'
    }
    apply()
    window.addEventListener('scroll', apply, { passive: true })
    return () => window.removeEventListener('scroll', apply)
  }, [])

  if (isAuthenticated || dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    try { sessionStorage.setItem('bk-sticky-cta-dismissed', '1') } catch {}
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Ücretsiz kayıt çağrısı"
      className="fixed left-0 right-0 top-0 z-40 px-3 sm:px-5 pointer-events-none transition-all duration-500"
      style={{
        transform: 'translateY(-110%)',
        opacity: 0,
      }}
    >
      <div className="mx-auto mt-3 max-w-5xl pointer-events-auto rounded-2xl border overflow-hidden relative"
        style={{
          background: `
            radial-gradient(380px 120px at 0% 50%, rgba(16,185,129,0.18), transparent 60%),
            linear-gradient(135deg, rgba(10,16,32,0.92) 0%, rgba(15,23,42,0.94) 100%)
          `,
          borderColor: 'var(--border-gold)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 12px 40px -10px rgba(0,0,0,0.6), 0 0 0 1px rgba(16,185,129,0.10) inset',
        }}
      >
        {/* Üst altın çizgi */}
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.7), transparent)' }}
        />

        <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3 relative">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))',
              color: '#1a1208',
              boxShadow: '0 4px 12px -2px rgba(16,185,129,0.4)',
            }}
          >
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] sm:text-sm font-bold leading-tight" style={{ color: '#f1f5f9' }}>
              Bugünün top 10 sinyalini görmek için kayıt ol
            </div>
            <div className="hidden sm:block text-[11px] mt-0.5" style={{ color: '#94a3b8' }}>
              Ücretsiz · Kredi kartı gerekmez · 30 saniye
            </div>
          </div>
          <div ref={btnRef} className="inline-block flex-shrink-0">
            <Link
              to="/register"
              className="group inline-flex items-center gap-1.5 h-9 sm:h-10 px-3.5 sm:px-4 rounded-xl font-semibold text-[12.5px] sm:text-[13px] relative overflow-hidden whitespace-nowrap"
              style={{
                background: 'linear-gradient(135deg, var(--gold-300) 0%, var(--gold-500) 100%)',
                color: '#1a1208',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 12px -2px rgba(16,185,129,0.4)',
              }}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1100ms] ease-out"
                style={{
                  background: 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)',
                }}
              />
              <span className="relative">Ücretsiz Başla</span>
              <ArrowRight className="w-3.5 h-3.5 relative transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="Kapat"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
            style={{ color: '#94a3b8' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#f1f5f9' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
