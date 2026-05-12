import { useEffect, useRef } from 'react'
import anime from 'animejs'
import {
  useScrollReveal, useHoverTilt,
} from '../../hooks/useAnime'
import {
  Waves, Activity, BarChart2, Brain, GitMerge, Compass, ArrowRight,
} from 'lucide-react'

/* ─── 6 indikatör — sol: klasik / sağ: bizim eklediğimiz derinlik ──────── */
const PAIRS = [
  {
    icon: Waves,
    indicator: 'RSI',
    known: {
      title: 'RSI 70 üstü → aşırı alım',
      body: '"Sat" kararı vermek için tek başına yeterli değildir. Trend güçlüyken RSI günlerce 70 üstünde kalabilir.',
    },
    unknown: {
      title: 'RSI Divergence — gizli dönüş',
      body: 'Fiyat yeni tepe yaparken RSI yapmıyorsa momentum tükeniyor demektir. Bunu çoğu gösterge söylemez — biz işaret ederiz.',
      metric: 'Pos / Neg divergence + slope',
    },
  },
  {
    icon: Activity,
    indicator: 'MACD',
    known: {
      title: 'MACD sinyal çizgisini kesti',
      body: 'Klasik AL/SAT yorumu. Ama trend güçlü mü, yoksa yan piyasada gürültü mü — bunu söylemez.',
    },
    unknown: {
      title: 'MACD Acceleration — ivme',
      body: 'Histogram artıyor olabilir, fakat türevi düşüyorsa trend zayıflıyordur. İvmeyi (2. türev) ölçeriz.',
      metric: '∂(histogram)/∂t · momentum gücü',
    },
  },
  {
    icon: BarChart2,
    indicator: 'ATR',
    known: {
      title: 'ATR volatilite ölçer',
      body: 'Bir sayı verir, geçer. Ama bu sayının tarihsel olarak yüksek mi düşük mü olduğunu — kıyas yok.',
    },
    unknown: {
      title: 'ATR Volatilite Rejimi',
      body: 'ATR percentile rejimi: Low / Normal / High / Extreme. Sıkışma uzun sürdüyse kırılım yakındır.',
      metric: '4 rejim · 60 gün percentile',
    },
  },
  {
    icon: Brain,
    indicator: 'Mum Formasyonu',
    known: {
      title: 'Engulfing / Hammer / Doji',
      body: 'Tek başına anlamı zayıftır. Trend yönüne göre, hacme göre, RSI bağlamına göre değişir.',
    },
    unknown: {
      title: 'Pattern + Bağlam AI',
      body: '12 pattern × trend filter × hacim doğrulaması. Aynı mum farklı bağlamda farklı sonuç verir — bağlamı ölçeriz.',
      metric: '12 pattern × 3 filter',
    },
  },
  {
    icon: GitMerge,
    indicator: 'EMA',
    known: {
      title: 'Fiyat EMA üstünde / altında',
      body: 'Yalnızca tek EMA bakışı yanıltıcı. Hangi vadede? Kısa vade güçlü, uzun vade zayıfsa ne yaparsın?',
    },
    unknown: {
      title: 'EMA Confluence (8 · 21 · 34)',
      body: 'Üç EMA aynı yöne hizalandığında ve eğimleri aynı işaretteyse — pullback fırsatları en güvenli oradan gelir.',
      metric: 'Stack + slope + distance',
    },
  },
  {
    icon: Compass,
    indicator: 'Sinyal',
    known: {
      title: '"AL" veya "SAT" çıktısı',
      body: 'Geçmişte bu sinyal kaç kez doğru çıktı? Hangi koşulda yanıldı? Genellikle bilinmez.',
    },
    unknown: {
      title: 'Bayesian Win Probability',
      body: 'Beta(α,β) posteriori. Lojistik prior + backtest güncellemesi. "Olasılık" kelimesi keyfi değil — sayıdır.',
      metric: 'P(win) = α / (α + β)',
    },
  },
]

/* ─── Tek satır ──────────────────────────────────────────────────────── */
function ComparisonRow({ pair, idx }) {
  const rowRef    = useRef(null)
  const unknownTilt = useHoverTilt({ max: 5, scale: 1.012, glare: true })
  const Icon = pair.icon

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      el.style.opacity = 1
      return
    }
    const left  = el.querySelector('.side-known')
    const arrow = el.querySelector('.row-arrow')
    const right = el.querySelector('.side-unknown')
    el.style.opacity = 0
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        anime({
          targets: el, opacity: [0, 1], duration: 500, easing: 'easeOutQuad',
        })
        anime({
          targets: left, translateX: [-32, 0], opacity: [0, 1],
          duration: 800, easing: 'easeOutExpo', delay: 80,
        })
        anime({
          targets: arrow, scale: [0, 1], opacity: [0, 1],
          duration: 600, easing: 'spring(1, 80, 12, 0)', delay: 380,
        })
        anime({
          targets: right, translateX: [32, 0], opacity: [0, 1],
          duration: 800, easing: 'easeOutExpo', delay: 460,
        })
        io.disconnect()
      }
    }, { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={rowRef} className="kvu-row relative">
      {/* Mobil: dikey · md: 3 sütun (klasik · ok · derinlik) */}
      <div className="grid md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-stretch">
        {/* SOL — Klasik */}
        <div className="side-known rounded-2xl p-5 relative"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-main)',
            opacity: 0,
          }}>
          <div className="flex items-center gap-2 mb-2">
            <Icon className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold"
              style={{ color: 'var(--text-faint)' }}>
              Bilinen · {pair.indicator}
            </span>
          </div>
          <h4 className="text-[15px] font-semibold mb-1.5"
            style={{ color: 'var(--text-secondary)' }}>
            {pair.known.title}
          </h4>
          <p className="text-[12.5px] leading-relaxed"
            style={{ color: 'var(--text-muted)' }}>
            {pair.known.body}
          </p>
        </div>

        {/* OK — sadece md+ */}
        <div className="row-arrow hidden md:flex items-center justify-center px-2"
          style={{ opacity: 0 }}>
          <div className="flex flex-col items-center gap-1">
            <div className="w-px h-6"
              style={{ background: 'linear-gradient(180deg, transparent, rgba(212,175,55,0.45))' }} />
            <ArrowRight className="w-5 h-5" style={{ color: 'var(--gold-400)' }} />
            <div className="w-px h-6"
              style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.45), transparent)' }} />
          </div>
        </div>

        {/* SAĞ — Bilinmeyen / bizim derinliğimiz */}
        <div
          ref={unknownTilt}
          className="side-unknown rounded-2xl p-5 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(212,175,55,0.06), rgba(212,175,55,0.02))',
            border: '1px solid var(--border-gold)',
            boxShadow: 'var(--shadow-card), 0 0 0 1px rgba(212,175,55,0.08) inset',
            transformStyle: 'preserve-3d',
            opacity: 0,
          }}>
          {/* arka glow */}
          <div aria-hidden className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-50 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.25), transparent 65%)' }} />

          <div className="flex items-center gap-2 mb-2 relative">
            <Icon className="w-4 h-4" style={{ color: 'var(--gold-400)' }} />
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold"
              style={{ color: 'var(--gold-400)' }}>
              Bilinmeyen · {pair.indicator}
            </span>
          </div>
          <h4 className="text-[15px] font-bold mb-1.5 relative"
            style={{ color: 'var(--text-primary)' }}>
            {pair.unknown.title}
          </h4>
          <p className="text-[12.5px] leading-relaxed mb-3 relative"
            style={{ color: 'var(--text-secondary)' }}>
            {pair.unknown.body}
          </p>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md relative"
            style={{
              background: 'var(--bg-input)',
              color: 'var(--gold-300)',
              border: '1px solid var(--border-gold)',
            }}>
            <span className="opacity-70">→</span>
            {pair.unknown.metric}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Bölüm ──────────────────────────────────────────────────────────── */
export default function HomeKnownVsUnknown() {
  const headRef = useScrollReveal({ selector: '> *', stagger: 100, y: 22, duration: 850 })

  return (
    <section className="relative">
      <div ref={headRef} className="text-center max-w-2xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide uppercase mb-3"
          style={{
            background: 'rgba(212,175,55,0.08)',
            borderColor: 'var(--border-gold)',
            color: 'var(--gold-400)',
          }}>
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          Bilinmeyeni Yansıtırız
        </div>
        <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)' }}>
          Klasik göstergelerin{' '}
          <span style={{
            background: 'linear-gradient(135deg, var(--gold-200) 0%, var(--gold-400) 50%, var(--gold-600) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            söylemediği
          </span>{' '}şeyler.
        </h2>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-muted)' }}>
          RSI 70 oldu, "aşırı alım" — herkes bilir. Peki <em>içindeki</em> divergence ne diyor?
          Bizim eklediğimiz derinlik bu.
        </p>
      </div>

      <div className="space-y-4 sm:space-y-5">
        {PAIRS.map((p, i) => <ComparisonRow key={i} pair={p} idx={i} />)}
      </div>
    </section>
  )
}
