import { useMemo, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, ArrowRight, BookOpen, Target, ChevronDown } from 'lucide-react'
import anime from 'animejs'
import {
  useScrollReveal, useDrawSVG, useMagnetic, useCursorGlow,
} from '../../hooks/useAnime'
import { useAuthStore } from '../../store/authStore'

/* ─── Mock fiyat datası — hero'da çizilecek sinyal çizgisi ──────────────── */
function buildPath(width, height, points) {
  if (!points.length) return ''
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = (max - min) || 1
  const stepX = width / (points.length - 1)
  return points.map((p, i) => {
    const x = i * stepX
    const y = height - ((p - min) / span) * height * 0.85 - height * 0.075
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

/* ─── Sinyal etiketleri — eğitim hissini güçlendirmek için ──────────────── */
const SIGNAL_LABELS = [
  { x: 0.18, y: 0.52, label: 'RSI 30', tone: 'jade' },
  { x: 0.46, y: 0.30, label: 'EMA 34', tone: 'gold' },
  { x: 0.78, y: 0.18, label: 'MACD ↑', tone: 'jade' },
]

export default function HomeHero() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const headlineRef = useScrollReveal({ selector: '> *', stagger: 100, delay: 100, y: 32, duration: 1000 })
  const ctaRef = useScrollReveal({ selector: '> *', stagger: 80, delay: 500, y: 16, duration: 800 })
  const statsRef = useScrollReveal({ selector: '> *', stagger: 90, delay: 700, y: 14, duration: 700 })
  const svgRef = useDrawSVG({ duration: 2200, delay: 250, stagger: 140, selector: 'path[data-draw="line"], path[data-draw="grid"]' })
  const primaryBtnRef = useMagnetic(0.32)
  const secondaryBtnRef = useMagnetic(0.22)
  const [glowContainerRef, glowRef] = useCursorGlow()
  const pulseRef = useRef(null)
  const gridParallaxRef = useRef(null)
  const chartParallaxRef = useRef(null)

  // Scroll-based parallax — Hero görünür alanda iken arka plan ve grafik
  // farklı hızlarda hareket eder (premium derinlik hissi).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const onScroll = () => {
      const sec = glowContainerRef.current
      if (!sec) return
      const r = sec.getBoundingClientRect()
      const winH = window.innerHeight
      const center = r.top + r.height / 2
      const t = Math.max(-1, Math.min(1, (winH / 2 - center) / winH))
      if (gridParallaxRef.current) {
        gridParallaxRef.current.style.transform = `translate3d(0, ${(t * 40).toFixed(1)}px, 0)`
      }
      if (chartParallaxRef.current) {
        chartParallaxRef.current.style.transform = `translate3d(0, ${(t * -24).toFixed(1)}px, 0)`
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  // Önceden hesaplanmış path
  const W = 800, H = 320
  const lineData = useMemo(() => {
    // Düşüş → dip → toparlanma → güçlü yükseliş (eğitim açısından klasik tersine dönüş senaryosu)
    return [78, 82, 76, 70, 65, 58, 54, 52, 50, 53, 58, 62, 68, 74, 82, 88, 92, 96, 98]
  }, [])
  const linePath = buildPath(W, H, lineData)
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`

  // Sinyal noktaları
  const dots = useMemo(() => {
    return SIGNAL_LABELS.map(s => {
      const idx = Math.round(s.x * (lineData.length - 1))
      const min = Math.min(...lineData), max = Math.max(...lineData)
      const span = max - min || 1
      const stepX = W / (lineData.length - 1)
      const x = idx * stepX
      const y = H - ((lineData[idx] - min) / span) * H * 0.85 - H * 0.075
      return { ...s, cx: x, cy: y }
    })
  }, [lineData])

  // Pulse — Sinyal noktaları yumuşak nefes alıyor (viewport-aware)
  useEffect(() => {
    if (!pulseRef.current) return
    const dots = pulseRef.current.querySelectorAll('circle[data-pulse]')
    if (!dots.length) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let anim = null
    const startAnim = () => {
      if (anim) return
      anim = anime({
        targets: dots,
        r: [
          { value: 14, duration: 1200, easing: 'easeOutQuart' },
          { value: 6,  duration: 900,  easing: 'easeInQuad' },
        ],
        opacity: [
          { value: 0.0, duration: 1200, easing: 'easeOutQuart' },
          { value: 0.4, duration: 900,  easing: 'easeInQuad' },
        ],
        delay: anime.stagger(420, { start: 0 }),
        loop: true,
      })
    }
    const stopAnim = () => {
      if (anim) { anim.pause(); anim = null }
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) startAnim()
        else stopAnim()
      })
    }, { threshold: 0.1 })
    io.observe(pulseRef.current)

    // visibility — tab geri planda ise duraklat
    const onVis = () => {
      if (document.hidden) stopAnim()
      else if (pulseRef.current) {
        const r = pulseRef.current.getBoundingClientRect()
        const visible = r.bottom > 0 && r.top < window.innerHeight
        if (visible) startAnim()
      }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      stopAnim()
    }
  }, [])

  return (
    <section
      ref={glowContainerRef}
      className="relative overflow-hidden rounded-3xl border isolate"
      style={{
        background: `
          radial-gradient(1100px 600px at 12% -10%, rgba(16,185,129,0.10), transparent 55%),
          radial-gradient(900px 500px at 95% 110%, rgba(16,185,129,0.06), transparent 60%),
          linear-gradient(180deg, var(--bg-card) 0%, var(--bg-canvas) 100%)
        `,
        borderColor: 'var(--border-gold)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Cursor altın glow — yumuşak takip eder */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 w-[480px] h-[480px] rounded-full mix-blend-screen opacity-0"
        style={{
          background: 'radial-gradient(circle, rgba(16,185,129,0.22) 0%, rgba(16,185,129,0.06) 35%, transparent 65%)',
          filter: 'blur(2px)',
          zIndex: 0,
        }}
      />

      {/* Arka plan dikey çizgi grid'i — scroll'da yavaşça kayar */}
      <svg
        ref={gridParallaxRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.18]"
        style={{ zIndex: 0, willChange: 'transform' }}
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <defs>
          <linearGradient id="gridLine" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--gold-400)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--gold-400)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={i} x1={i * 8.33} x2={i * 8.33} y1="0" y2="100" stroke="url(#gridLine)" strokeWidth="0.06" />
        ))}
      </svg>

      <div className="relative grid lg:grid-cols-[1.05fr_1fr] gap-6 lg:gap-10 p-5 sm:p-8 lg:p-12" style={{ zIndex: 2 }}>
        {/* SOL — Manşet ve CTA */}
        <div className="flex flex-col justify-center">
          {/* Eğitim rozeti */}
          <div ref={headlineRef}>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border w-fit text-[11px] font-semibold tracking-wide uppercase"
              style={{
                background: 'rgba(16,185,129,0.10)',
                borderColor: 'var(--border-gold)',
                color: 'var(--gold-400)',
              }}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Eğitim Amaçlı · Yatırım Tavsiyesi Değildir
            </div>

            <h1 className="mt-5 font-bold leading-[1.05] tracking-tight"
              style={{ color: 'var(--text-primary)', fontSize: 'clamp(2rem, 5vw, 3.4rem)' }}
            >
              Piyasayı{' '}
              <span style={{
                background: 'linear-gradient(135deg, var(--gold-200) 0%, var(--gold-400) 50%, var(--gold-600) 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                anla
              </span>
              ,<br/>sinyalleri{' '}
              <span style={{
                background: 'linear-gradient(135deg, var(--gold-200) 0%, var(--gold-400) 50%, var(--gold-600) 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                oku
              </span>.
            </h1>

            <p className="mt-4 max-w-xl text-base sm:text-lg leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              BIST hisseleri ve kripto için <strong style={{ color: 'var(--text-primary)' }}>her gün otomatik sinyaller</strong> üretiyor,
              arkasındaki RSI · MACD · EMA · destek-direnç mantığını <strong style={{ color: 'var(--gold-400)' }}>adım adım açıklıyoruz</strong>.
              Sen değil veri konuşsun — fikrini biz veririz, kararı sen verirsin.
            </p>
          </div>

          {/* CTA Butonları */}
          <div ref={ctaRef} className="mt-6 sm:mt-7 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 sm:gap-3">
            <div ref={primaryBtnRef} className="inline-block w-full sm:w-auto">
              <button
                onClick={() => navigate(isAuthenticated ? '/gunluk-tespitler?tab=bugun' : '/register')}
                className="group relative inline-flex items-center justify-center gap-2 h-12 px-6 rounded-2xl font-semibold text-[15px] overflow-hidden w-full sm:w-auto"
                style={{
                  background: 'linear-gradient(135deg, var(--gold-300) 0%, var(--gold-500) 100%)',
                  color: '#1a1208',
                  boxShadow: '0 10px 30px -6px rgba(16, 185, 129, 0.45), inset 0 1px 0 rgba(255,255,255,0.4)',
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1100ms] ease-out"
                  style={{
                    background: 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)',
                  }}
                />
                <Sparkles className="w-4 h-4 relative" />
                <span className="relative">
                  {isAuthenticated ? 'Bugünün Sinyalleri' : 'Ücretsiz Başla'}
                </span>
                <ArrowRight className="w-4 h-4 relative transition-transform group-hover:translate-x-1" />
              </button>
            </div>

            <div ref={secondaryBtnRef} className="inline-block w-full sm:w-auto">
              <Link
                to="/egitim"
                className="group inline-flex items-center justify-center gap-2 h-12 px-5 rounded-2xl font-semibold text-[14.5px] border transition-colors w-full sm:w-auto"
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
                <BookOpen className="w-4 h-4 transition-transform group-hover:rotate-[-6deg]" />
                Eğitim İçeriği
              </Link>
            </div>
          </div>

          {/* Hızlı bakış stats */}
          <div ref={statsRef} className="mt-6 sm:mt-8 grid grid-cols-3 gap-2 sm:gap-3 max-w-md">
            {[
              { v: '7 TF', s: 'Multi-Timeframe', t: '1m → 1h → 1g → 1w zaman çerçevesi confluence' },
              { v: '16 koşul', s: 'Sinyal Skoru', t: 'Her sinyal 16 farklı kritere göre puanlanır' },
              { v: '09:55', s: 'Pre-Market', t: 'Borsa açılışından 5 dk önce sinyaller hazır' },
            ].map((it, i) => (
              <div key={i} className="rounded-xl p-2.5 sm:p-3 border"
                style={{ background: 'var(--bg-input)', borderColor: 'var(--border-main)' }}
                title={it.t}
              >
                <div className="text-[13px] sm:text-base lg:text-lg font-bold leading-tight" style={{ color: 'var(--gold-400)' }}>{it.v}</div>
                <div className="text-[9px] sm:text-[10px] uppercase tracking-wider mt-0.5 truncate" style={{ color: 'var(--text-faint)' }}>{it.s}</div>
              </div>
            ))}
          </div>
        </div>

        {/* SAĞ — Animasyonlu Sinyal Grafiği — scroll'da hafifçe ters kayar */}
        <div
          className="relative flex items-center justify-center"
          ref={(el) => { pulseRef.current = el; chartParallaxRef.current = el }}
          style={{ willChange: 'transform' }}
        >
          <div className="w-full max-w-[520px] aspect-[5/4] relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="lineGrad" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="var(--ember)" stopOpacity="0.7" />
                  <stop offset="35%" stopColor="var(--gold-400)" />
                  <stop offset="100%" stopColor="var(--jade)" />
                </linearGradient>
                <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold-400)" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="var(--gold-400)" stopOpacity="0.0" />
                </linearGradient>
                <filter id="glowLine">
                  <feGaussianBlur stdDeviation="3.5" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Horizontal grid çizgileri — çiziliyor */}
              {[0.25, 0.5, 0.75].map((y, i) => (
                <path
                  key={i}
                  data-draw="grid"
                  d={`M 0 ${H * y} L ${W} ${H * y}`}
                  stroke="var(--border-main)"
                  strokeWidth="1"
                  strokeDasharray="4 6"
                  fill="none"
                />
              ))}

              {/* Alt alan dolgusu */}
              <path d={areaPath} fill="url(#areaGrad)" opacity="0.85" />

              {/* Ana çizgi — çizilerek görünüyor */}
              <path
                data-draw="line"
                d={linePath}
                fill="none"
                stroke="url(#lineGrad)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glowLine)"
              />

              {/* Sinyal noktaları + pulse halkaları */}
              {dots.map((d, i) => {
                const colorVar = d.tone === 'jade' ? 'var(--jade)' : 'var(--gold-400)'
                return (
                  <g key={i}>
                    <circle data-pulse cx={d.cx} cy={d.cy} r="6" fill={colorVar} opacity="0.4" />
                    <circle cx={d.cx} cy={d.cy} r="5" fill="var(--bg-card)" stroke={colorVar} strokeWidth="2.5" />
                  </g>
                )
              })}
            </svg>

            {/* Sinyal etiketleri — overlay */}
            {dots.map((d, i) => {
              const colorVar = d.tone === 'jade' ? 'var(--jade)' : 'var(--gold-400)'
              const left = (d.cx / W) * 100
              const top = (d.cy / H) * 100
              return (
                <div
                  key={i}
                  className="absolute -translate-x-1/2 -translate-y-[160%] px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap signal-tag"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    background: d.tone === 'jade' ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.15)',
                    color: colorVar,
                    border: `1px solid ${colorVar}`,
                    opacity: 0,
                    animation: `signalIn 600ms cubic-bezier(0.22,1,0.36,1) ${1800 + i * 420}ms forwards`,
                  }}
                >
                  {d.label}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Aşağı kaydır işareti — hafif zıplama */}
      <div className="relative flex justify-center pb-4">
        <div className="flex flex-col items-center gap-1 opacity-70" style={{ color: 'var(--text-muted)' }}>
          <span className="text-[10px] uppercase tracking-widest font-semibold">Kaydır</span>
          <ChevronDown className="w-4 h-4 hero-bounce" />
        </div>
      </div>

      <style>{`
        @keyframes signalIn {
          0% { opacity: 0; transform: translate(-50%, -120%) scale(0.6); }
          100% { opacity: 1; transform: translate(-50%, -160%) scale(1); }
        }
        @keyframes heroBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(4px); }
        }
        .hero-bounce { animation: heroBounce 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .hero-bounce { animation: none !important; }
          .signal-tag { animation: none !important; opacity: 1 !important; transform: translate(-50%, -160%) !important; }
        }
      `}</style>
    </section>
  )
}
