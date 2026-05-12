import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles, Users, TrendingUp, BookOpen, BellRing } from 'lucide-react'
import { useScrollReveal, useMagnetic, useHoverTilt } from '../../hooks/useAnime'
import { useAuthStore } from '../../store/authStore'

const PROOFS = [
  { icon: BellRing,   value: '10 / gün',  label: 'Top Sinyal',     desc: 'Pre-market + revize' },
  { icon: TrendingUp, value: '+102%',     label: 'Spot Backtest',  desc: '3 dönem ortalama' },
  { icon: BookOpen,   value: '6 makale',  label: 'Eğitim Rehberi', desc: 'Teknik · Temel · Strateji' },
  { icon: Users,      value: 'Ücretsiz',  label: 'Başlangıç',      desc: 'Kredi kartı gerekmez' },
]

function Proof({ p }) {
  const Icon = p.icon
  const tiltRef = useHoverTilt({ max: 5, scale: 1.025, glare: true })
  return (
    <div
      ref={tiltRef}
      className="relative rounded-2xl p-3 sm:p-4 border overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-main)',
        transformStyle: 'preserve-3d',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'rgba(212,175,55,0.10)',
            border: '1px solid var(--border-gold)',
          }}
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: 'var(--gold-400)' }} strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm sm:text-base font-bold tracking-tight num-tabular truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {p.value}
          </div>
          <div className="text-[10px] uppercase tracking-wider truncate"
            style={{ color: 'var(--text-faint)' }}
          >
            {p.label}
          </div>
        </div>
      </div>
      <div className="text-[10.5px] mt-1.5 sm:mt-2" style={{ color: 'var(--text-muted)' }}>
        {p.desc}
      </div>
    </div>
  )
}

export default function HomeGuestProof() {
  // Sadece login OLMAYAN kullanıcılar için göster
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (isAuthenticated) return null

  const proofsRef = useScrollReveal({ selector: '> *', stagger: 90, y: 18, duration: 750 })
  const ctaRef = useScrollReveal({ y: 14, duration: 700, delay: 200 })
  const btnRef = useMagnetic(0.30)

  return (
    <section className="relative">
      <div ref={proofsRef} className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-5 sm:mb-6">
        {PROOFS.map((p, i) => <Proof key={i} p={p} />)}
      </div>

      <div
        ref={ctaRef}
        className="rounded-2xl border p-4 sm:p-5 relative overflow-hidden flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5"
        style={{
          background: `
            radial-gradient(600px 240px at 0% 50%, rgba(212,175,55,0.08), transparent 60%),
            linear-gradient(135deg, rgba(212,175,55,0.04), rgba(0,201,138,0.03))
          `,
          borderColor: 'var(--border-gold)',
          boxShadow: '0 0 0 1px rgba(212,175,55,0.06) inset',
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9.5px] font-bold tracking-[0.18em] uppercase mb-2"
            style={{
              background: 'rgba(212,175,55,0.12)',
              borderColor: 'var(--border-gold)',
              color: 'var(--gold-400)',
            }}
          >
            <Sparkles className="w-2.5 h-2.5" />
            Ücretsiz Başla
          </div>
          <h3 className="text-base sm:text-lg font-bold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Sinyalleri görmek için kayıt ol — kredi kartı yok, deneme süresi yok.
          </h3>
          <p className="text-[12.5px] sm:text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Hesap açar açmaz bugünün top 10 sinyalini, MTF confluence, teknik analiz AI gibi araçları kullanırsın.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-2.5 flex-shrink-0">
          <div ref={btnRef} className="inline-block">
            <Link
              to="/register"
              className="group inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl font-semibold text-[14px] relative overflow-hidden w-full sm:w-auto"
              style={{
                background: 'linear-gradient(135deg, var(--gold-300) 0%, var(--gold-500) 100%)',
                color: '#1a1208',
                boxShadow: '0 8px 22px -6px rgba(212,175,55,0.45), inset 0 1px 0 rgba(255,255,255,0.4)',
              }}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1100ms] ease-out"
                style={{
                  background: 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)',
                }}
              />
              <span className="relative">Ücretsiz Hesap Aç</span>
              <ArrowRight className="w-4 h-4 relative transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl font-semibold text-[13.5px] border transition-colors w-full sm:w-auto"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--border-gold-strong)'
              e.currentTarget.style.color = 'var(--gold-400)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border-strong)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            Giriş Yap
          </Link>
        </div>
      </div>
    </section>
  )
}
