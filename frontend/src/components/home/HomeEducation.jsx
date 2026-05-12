import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from 'animejs'
import {
  ArrowRight, Sparkles, BookOpen, Compass, Layers, TrendingUp,
  Activity, BarChart3, FileText, Target,
} from 'lucide-react'
import {
  useScrollReveal, useMagnetic, useCountUp, useHoverTilt, useDrawSVG,
} from '../../hooks/useAnime'

/* ─── 6 eğitim köprüsü — site'deki gerçek /egitim/* sayfaları ────────── */
const LESSONS = [
  { to: '/egitim/teknik-analiz-giris', label: 'Teknik Analize Giriş', icon: Activity,    tone: '212,175,55' },
  { to: '/egitim/temel-gostergeler',   label: 'Temel Göstergeler',    icon: BarChart3,   tone: '0,201,138'   },
  { to: '/egitim/destek-direnc',       label: 'Destek & Direnç',      icon: Compass,     tone: '59,130,246'  },
  { to: '/egitim/bist100-rehberi',     label: 'BIST 100 Rehberi',     icon: TrendingUp,  tone: '139,92,246'  },
  { to: '/egitim/bilanco-okuma',       label: 'Bilanço Okuma',        icon: FileText,    tone: '244,114,182' },
  { to: '/egitim/yatirim-stratejisi',  label: 'Yatırım Stratejisi',   icon: Target,      tone: '34,197,94'   },
]

/* ─── KPI count-up satırı ────────────────────────────────────────────── */
function Kpi({ target, suffix = '', prefix = '', label }) {
  const [ref, text] = useCountUp(target, { duration: 1800, decimals: 0, suffix, prefix })
  return (
    <div className="kpi rounded-xl px-3 py-2.5"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--border-main)' }}>
      <div ref={ref} className="text-xl sm:text-2xl font-bold font-mono tracking-tight"
        style={{ color: 'var(--gold-300)' }}>{text}</div>
      <div className="text-[10px] uppercase tracking-[0.18em] mt-0.5"
        style={{ color: 'var(--text-faint)' }}>{label}</div>
    </div>
  )
}

/* ─── Eğitim çip kartı — tilt + hover renk dönüşü ────────────────────── */
function LessonChip({ lesson }) {
  const navigate = useNavigate()
  const tiltRef  = useHoverTilt({ max: 8, scale: 1.035, glare: true })
  const Icon = lesson.icon
  return (
    <button
      ref={tiltRef}
      onClick={() => navigate(lesson.to)}
      className="lesson-chip group relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-left w-full overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid rgba(${lesson.tone}, 0.25)`,
        boxShadow: 'var(--shadow-sm)',
        transformStyle: 'preserve-3d',
      }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `rgba(${lesson.tone}, 0.14)`, color: `rgb(${lesson.tone})` }}>
        <Icon className="w-4 h-4" strokeWidth={2.4} />
      </div>
      <span className="text-[12.5px] font-semibold flex-1 truncate"
        style={{ color: 'var(--text-primary)' }}>{lesson.label}</span>
      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
        style={{ color: `rgb(${lesson.tone})` }} />
    </button>
  )
}

/* ─── Bölüm ──────────────────────────────────────────────────────────── */
export default function HomeEducation() {
  const navigate     = useNavigate()
  const headRef      = useScrollReveal({ selector: '> *', stagger: 90, y: 20, duration: 850 })
  const kpiRef       = useScrollReveal({ selector: '> *', stagger: 100, y: 18, duration: 700, delay: 200 })
  const chipsRef     = useScrollReveal({ selector: '> *', stagger: 80, y: 18, duration: 650, delay: 300 })
  const primaryBtn   = useMagnetic(0.34)
  const secondaryBtn = useMagnetic(0.22)
  const svgRef       = useDrawSVG({
    selector: 'path[data-cta-wave]',
    trigger: 'scroll',
    duration: 2400, delay: 200, stagger: 220,
    easing: 'easeInOutSine',
  })

  return (
    <section
      className="relative overflow-hidden rounded-3xl border isolate"
      style={{
        background:
          'radial-gradient(900px 540px at 12% -10%, rgba(212,175,55,0.10), transparent 55%),' +
          'radial-gradient(700px 460px at 95% 110%, rgba(0,201,138,0.06), transparent 60%),' +
          'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-canvas) 100%)',
        borderColor: 'var(--border-gold)',
        boxShadow: 'var(--shadow-card), 0 0 0 1px rgba(212,175,55,0.08) inset',
      }}>

      {/* Arka plan SVG dalga — scroll'la çizilir */}
      <svg
        ref={svgRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="none"
        viewBox="0 0 1200 500">
        <defs>
          <linearGradient id="cta-wave-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"  stopColor="rgba(212,175,55,0)" />
            <stop offset="50%" stopColor="rgba(212,175,55,0.5)" />
            <stop offset="100%" stopColor="rgba(212,175,55,0)" />
          </linearGradient>
        </defs>
        <path
          data-cta-wave
          d="M0,320 Q200,280 400,310 T800,290 T1200,250"
          fill="none" stroke="url(#cta-wave-grad)" strokeWidth="2"
        />
        <path
          data-cta-wave
          d="M0,380 Q220,360 440,370 T880,350 T1200,330"
          fill="none" stroke="rgba(59,130,246,0.28)" strokeWidth="1.5" strokeDasharray="4 8"
        />
        <path
          data-cta-wave
          d="M0,440 Q260,420 520,430 T1040,410 T1200,400"
          fill="none" stroke="rgba(212,175,55,0.16)" strokeWidth="1"
        />
      </svg>

      <div className="relative grid lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12 p-6 sm:p-10 lg:p-14">
        {/* SOL — manşet + KPI + CTA */}
        <div className="flex flex-col justify-center">
          <div ref={headRef}>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-[0.2em] uppercase w-fit mb-4"
              style={{
                background: 'rgba(212,175,55,0.10)',
                borderColor: 'var(--border-gold)',
                color: 'var(--gold-400)',
              }}>
              <Sparkles className="w-3.5 h-3.5" />
              Bugünden Başla
            </div>

            <h2 className="font-bold leading-[1.05] tracking-tight"
              style={{ color: 'var(--text-primary)', fontSize: 'clamp(1.75rem, 4.2vw, 2.85rem)' }}>
              Sinyali değil,{' '}
              <span style={{
                background: 'linear-gradient(135deg, var(--gold-200) 0%, var(--gold-400) 50%, var(--gold-600) 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                mantığı
              </span>{' '}öğren.
            </h2>

            <p className="mt-4 max-w-xl text-sm sm:text-base leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}>
              Her gün otomatik sinyal üretiyoruz — ama daha önemlisi,
              arkasındaki <strong className="text-amber-300/95">hesaplamayı, indikatörü, kuralı</strong> açıklıyoruz.
              Tek bir sinyale bağımlı kalma; düşünmeyi öğren.
            </p>
          </div>

          {/* KPI bandı — anime ile sayım */}
          <div ref={kpiRef} className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <Kpi target={500}  suffix="+"  label="Taranan Sembol" />
            <Kpi target={16}              label="Sinyal Koşulu" />
            <Kpi target={7}    suffix=" TF" label="Zaman Çerçevesi" />
            <Kpi target={102}  suffix="%" prefix="+" label="Spot Backtest" />
          </div>

          {/* CTA satırı */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <div ref={primaryBtn} className="inline-block">
              <button
                onClick={() => navigate('/gunluk-tespitler?tab=bugun')}
                className="group relative inline-flex items-center gap-2 h-12 px-6 rounded-2xl font-bold text-[15px] overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, var(--gold-300) 0%, var(--gold-500) 100%)',
                  color: '#1a1208',
                  boxShadow: '0 10px 30px -6px rgba(212, 175, 55, 0.45), inset 0 1px 0 rgba(255,255,255,0.4)',
                }}>
                <span aria-hidden="true"
                  className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1100ms] ease-out"
                  style={{
                    background: 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)',
                  }} />
                <Sparkles className="w-4 h-4 relative" />
                <span className="relative">Bugünün Sinyallerini Gör</span>
                <ArrowRight className="w-4 h-4 relative transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <div ref={secondaryBtn} className="inline-block">
              <button
                onClick={() => navigate('/egitim')}
                className="group inline-flex items-center gap-2 h-12 px-5 rounded-2xl font-semibold text-[14.5px] border transition-colors"
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
                }}>
                <BookOpen className="w-4 h-4 transition-transform group-hover:rotate-[-6deg]" />
                Tüm Eğitim İçerikleri
              </button>
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed max-w-md"
            style={{ color: 'var(--text-faint)' }}>
            ⚠ Eğitim amaçlıdır, yatırım tavsiyesi değildir. Tüm sinyaller ve içerikler hesaplama
            modellerinin çıktısıdır; gerçek dünyada zarar etme ihtimali her zaman vardır.
          </p>
        </div>

        {/* SAĞ — Eğitim çipleri */}
        <div className="flex flex-col justify-center">
          <div className="text-[11px] uppercase tracking-[0.25em] font-bold mb-3 flex items-center gap-2"
            style={{ color: 'var(--gold-400)' }}>
            <Layers className="w-3.5 h-3.5" />
            Eğitim Yolu
          </div>
          <div ref={chipsRef} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {LESSONS.map((l) => <LessonChip key={l.to} lesson={l} />)}
          </div>
          <p className="mt-4 text-[11.5px]"
            style={{ color: 'var(--text-muted)' }}>
            Sıfırdan başlasan da kafayı yormaya gerek yok — her ders bir öncekinin üzerine ekleniyor.
          </p>
        </div>
      </div>
    </section>
  )
}
