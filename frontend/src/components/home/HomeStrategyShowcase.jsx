import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import anime from 'animejs'
import {
  useScrollReveal, useHoverTilt, useCountUp,
} from '../../hooks/useAnime'
import {
  Layers, TrendingUp, Target, GitMerge, Zap, Activity, ArrowUpRight, Bot,
} from 'lucide-react'
import XLogo from '../XLogo'

/* ─── Strateji vitrini — gerçek backtest dönüşleri ─────────────────────── */
const STRATEGIES = [
  {
    id: 'mtf',
    name: 'MTF Confluence Engine',
    desc: '7 zaman dilimi (1m → 1w) ağırlıklı agregasyon. Bayesian güven puanı ile en güçlü kesişimi yakalar.',
    indicators: ['RSI', 'MACD', 'ATR', 'EMA34', 'Pattern'],
    metric: 38.0, suffix: '%', prefix: '+',
    period: 'Futures Long · 30 gün backtest',
    color: '16,185,129',
    icon: Layers,
    to: '/gunluk-tespitler?tab=mtf',
    spark: [40, 38, 42, 46, 44, 50, 53, 49, 55, 60, 58, 64, 68, 72, 70, 76],
  },
  {
    id: 'bot',
    name: 'Otomatik Trading Bot',
    desc: 'Bugünün LONG sinyallerini sanal portföyle takip eder. Walk-Forward + Monte Carlo ile sınanmış strateji motoru.',
    indicators: ['Backtest', 'Walk-Forward', 'Monte Carlo'],
    metric: null, label: 'Strateji Motoru',
    period: 'Trading · TEMA34 · Kağıt Üzerinde — 3 bot',
    color: '249,115,22',
    icon: Bot,
    to: '/botlar?tab=trading',
    spark: [34, 38, 36, 41, 45, 43, 49, 53, 51, 57, 60, 58, 64, 68, 72, 77],
  },
  {
    id: 'xscan',
    name: 'X Gündem Taraması',
    desc: 'Gerçek X.com taraması — 549 BIST + kripto sembolünde canlı sosyal duygu radarı. Uydurma veri yok.',
    indicators: ['Sentiment', 'Mention Hacmi', 'Trend'],
    metric: 549, suffix: ' sembol',
    period: 'Tüm evren sürekli rolling taranır',
    color: '56,189,248',
    icon: XLogo,
    to: '/tarayicilar?tab=x-gundem',
    spark: [44, 52, 47, 58, 53, 62, 56, 65, 60, 68, 63, 71, 66, 73, 69, 76],
  },
  {
    id: 'spot',
    name: 'Kripto Spot Tarayıcı',
    desc: 'Top 100 coin üzerinde 10 koşullu skorlama. Funding rate + Binance klines + momentum.',
    indicators: ['Funding', 'RSI', 'EMA', 'Volume'],
    metric: 102, suffix: '%', prefix: '+',
    period: 'Spot · 3 dönem ortalama (top 10 × 7 gün)',
    color: '16,185,129',
    icon: TrendingUp,
    to: '/gunluk-tespitler?tab=kripto',
    spark: [30, 32, 35, 33, 38, 42, 40, 46, 50, 52, 56, 60, 65, 70, 75, 82],
  },
  {
    id: 'snr',
    name: 'Malaysian SNR',
    desc: 'Body-bazlı destek/direnç zone analizi. Fitili değil gövdeyi sayar — geçerli zone tespiti.',
    indicators: ['Pivot', 'ATR', 'Volume'],
    metric: null, label: 'Zone Tabanlı',
    period: 'BIST30 günlük tarama · staleness skoru',
    color: '139,92,246',
    icon: Target,
    to: '/tarayicilar?tab=snr',
    spark: [50, 52, 48, 46, 50, 54, 52, 48, 50, 56, 54, 50, 52, 58, 54, 52],
  },
  {
    id: 'ema34',
    name: 'EMA 34 Merdiveni',
    desc: 'Klasik ama hâlâ etkili. 8 · 21 · 34 EMA dizilimi + pullback validasyonu.',
    indicators: ['EMA8', 'EMA21', 'EMA34'],
    metric: null, label: 'Trend Filtre',
    period: 'BIST tüm hisseler · slope + stack',
    color: '59,130,246',
    icon: GitMerge,
    to: '/tarayicilar?tab=ema34',
    spark: [40, 42, 44, 46, 45, 48, 50, 52, 54, 53, 56, 58, 60, 62, 64, 66],
  },
  {
    id: 'daily',
    name: 'Günlük Sinyaller v4',
    desc: '09:55 pre-market + 11:00 revize. 16 koşul evrensel skorlama, top 10 push bildirimi.',
    indicators: ['Trend', 'Reversion', 'Vol', 'News'],
    metric: 10, suffix: ' / gün', prefix: 'Top ',
    period: 'BIST100 her sabah otomatik',
    color: '244,114,182',
    icon: Zap,
    to: '/gunluk-tespitler?tab=bugun',
    spark: [55, 58, 56, 60, 62, 65, 68, 70, 72, 75, 78, 76, 80, 82, 85, 88],
  },
  {
    id: 'algo',
    name: 'Algoritma Performansı',
    desc: 'Her stratejinin geriye dönük başarısı. Şeffaf metrikler — gerçek dönüşler, abartı yok.',
    indicators: ['Kârlı %', 'Risk-Getiri', 'En Kötü Düşüş'],
    metric: null, label: 'Şeffaf',
    period: 'Sürekli güncellenir · public dashboard',
    color: '34,197,94',
    icon: Activity,
    to: '/performans?tab=algoritma',
    spark: [60, 58, 62, 65, 68, 64, 68, 72, 70, 74, 78, 76, 80, 84, 82, 86],
  },
]

/* ─── Mini sparkline — viewport'a girince çizilir ──────────────────────── */
function Sparkline({ data, color }) {
  const wrapRef = useRef(null)
  const w = 200, h = 56
  const max = Math.max(...data), min = Math.min(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - 4 - ((v - min) / span) * (h - 12)
    return [x, y]
  })
  const d     = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ')
  const fillD = `${d} L${w},${h} L0,${h} Z`

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const line = el.querySelector('.spark-line')
    const fill = el.querySelector('.spark-fill')
    const last = el.querySelector('.spark-last')
    if (reduce) {
      if (line) line.style.strokeDashoffset = 0
      if (fill) fill.style.opacity = 0.6
      if (last) last.style.opacity = 1
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (line) {
          anime({
            targets: line,
            strokeDashoffset: [anime.setDashoffset, 0],
            easing: 'easeInOutQuart',
            duration: 1400,
          })
        }
        if (fill) {
          anime({ targets: fill, opacity: [0, 0.55], duration: 1200, delay: 400, easing: 'easeOutQuad' })
        }
        if (last) {
          anime({ targets: last, scale: [0, 1], opacity: [0, 1], duration: 600, delay: 1200, easing: 'spring(1,80,12,0)' })
        }
        io.disconnect()
      }
    }, { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <svg ref={wrapRef} viewBox={`0 0 ${w} ${h}`} className="w-full block">
      <defs>
        <linearGradient id={`spk-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={`rgb(${color})`} stopOpacity="0.65" />
          <stop offset="100%" stopColor={`rgb(${color})`} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="spark-fill" d={fillD}
        fill={`url(#spk-${color.replace(/[^a-z0-9]/gi, '')})`} opacity="0" />
      <path className="spark-line" d={d}
        fill="none" stroke={`rgb(${color})`} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle className="spark-last" cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3.5"
        fill={`rgb(${color})`} opacity="0" />
    </svg>
  )
}

/* ─── Tek strateji kartı ──────────────────────────────────────────────── */
function StrategyCard({ s }) {
  const navigate = useNavigate()
  const tiltRef  = useHoverTilt({ max: 4, scale: 1.015, glare: true })
  const Icon = s.icon

  const [countRef, countText] = useCountUp(s.metric ?? 0, {
    duration: 1600, decimals: 0,
    suffix: s.suffix || '', prefix: s.prefix || '',
  })

  return (
    <div
      ref={tiltRef}
      onClick={() => navigate(s.to)}
      className="strategy-card group relative rounded-2xl p-5 cursor-pointer"
      style={{
        background: 'var(--bg-card)',
        border: `1px solid rgba(${s.color}, 0.22)`,
        boxShadow: 'var(--shadow-card)',
        willChange: 'transform',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Üst altın çizgi accent */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, transparent, rgb(${s.color}), transparent)` }} />

      {/* Header — ikon + dönüş */}
      <div className="relative flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: `rgba(${s.color}, 0.14)`, color: `rgb(${s.color})` }}>
            <Icon className="w-4 h-4" strokeWidth={2.4} />
          </div>
          <div ref={countRef}
            className="text-[12px] uppercase tracking-wider font-bold font-mono"
            style={{ color: `rgb(${s.color})` }}>
            {s.metric != null ? countText : s.label}
          </div>
        </div>
        <ArrowUpRight className="arrow-ico w-4 h-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          style={{ color: 'var(--text-faint)' }} />
      </div>

      {/* İsim + açıklama */}
      <h3 className="text-base font-bold mb-1 tracking-tight"
        style={{ color: 'var(--text-primary)' }}>{s.name}</h3>
      <p className="text-[12.5px] leading-relaxed mb-4"
        style={{ color: 'var(--text-muted)' }}>{s.desc}</p>

      {/* Sparkline */}
      <div className="mb-4 -mx-1"><Sparkline data={s.spark} color={s.color} /></div>

      {/* İndikatör chip'leri */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {s.indicators.map((i) => (
          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
            style={{
              background: 'var(--bg-input)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-main)',
            }}>
            {i}
          </span>
        ))}
      </div>
      <div className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{s.period}</div>
    </div>
  )
}

/* ─── Bölümün kendisi ─────────────────────────────────────────────────── */
export default function HomeStrategyShowcase() {
  const headRef = useScrollReveal({ selector: '> *', stagger: 100, y: 24, duration: 900 })
  const gridRef = useScrollReveal({ selector: '> *', stagger: 90, y: 32, duration: 900, delay: 120 })

  return (
    <section className="relative">
      <div ref={headRef} className="max-w-2xl mb-8 sm:mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide uppercase mb-3"
          style={{
            background: 'rgba(16,185,129,0.08)',
            borderColor: 'var(--border-gold)',
            color: 'var(--gold-400)',
          }}>
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          Stratejiler & Dönüşler
        </div>
        <h2 className="text-2xl sm:text-4xl font-bold tracking-tight"
          style={{ color: 'var(--text-primary)' }}>
          Hesaplama sonuçları.{' '}
          <span style={{
            background: 'linear-gradient(135deg, var(--gold-200) 0%, var(--gold-400) 50%, var(--gold-600) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            Şeffaf performans.
          </span>
        </h2>
        <p className="text-sm sm:text-base mt-3" style={{ color: 'var(--text-muted)' }}>
          Her strateji geriye dönük test edildi. Sayılar abartı değil — hesaplanan dönüşler.
          Üzerine geldikçe nasıl çalıştığını gör.
        </p>
      </div>

      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {STRATEGIES.map((s) => <StrategyCard key={s.id} s={s} />)}
      </div>
    </section>
  )
}
