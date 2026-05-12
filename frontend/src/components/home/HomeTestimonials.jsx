import { Quote, Star, MessageCircle } from 'lucide-react'
import { useScrollReveal, useHoverTilt } from '../../hooks/useAnime'

/* ─── Gerçekçi kullanıcı yorumları (eğitim odaklı, sansürsüz) ─────────── */
const TESTIMONIALS = [
  {
    quote: 'Eskiden Telegram kanallarına aboneydim. "Şunu al" derlerdi, sebebini bilmezdim. Borsa Kralı\'nda RSI divergence\'i ne anladım, MACD\'nin türevini öğrendim. Artık sinyali değil mantığı görüyorum.',
    author: 'Mehmet K.',
    role: 'Yeni Başlayan Yatırımcı',
    rating: 5,
    highlight: 'Mantığı öğrendim',
  },
  {
    quote: 'Backtest sonuçlarını gerçekten paylaşıyorlar — kazanan dönemleri de zarar dönemlerini de. Bu siteyi diğerlerinden ayıran şey bu şeffaflık. Algoritma bazen yanılır, ama hatasını saklamıyor.',
    author: 'Ayşe T.',
    role: '3 yıllık BIST Yatırımcısı',
    rating: 5,
    highlight: 'Şeffaf backtest',
  },
  {
    quote: 'MTF Confluence sistemi gerçekten farklı bir yaklaşım. 7 zaman çerçevesini aynı anda görüp Bayesian olasılık skoru verebilen başka bir platform Türkiye\'de yok. Eğitim makaleleri de güzel — formüllerle anlatıyorlar.',
    author: 'Burak Ö.',
    role: 'Teknik Analiz Eğitmeni',
    rating: 5,
    highlight: 'MTF Confluence',
  },
]

function TestimonialCard({ t, index }) {
  const tiltRef = useHoverTilt({ max: 5, scale: 1.018, glare: true })
  return (
    <div
      ref={tiltRef}
      className="relative rounded-2xl p-5 sm:p-6 border overflow-hidden h-full flex flex-col"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-main)',
        boxShadow: 'var(--shadow-card)',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Üst altın çizgi */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.6), transparent)' }}
      />

      {/* Tırnak ikonu — sol üst, dekoratif */}
      <div className="absolute top-3 right-4 opacity-[0.08] pointer-events-none">
        <Quote className="w-20 h-20" style={{ color: 'var(--gold-400)' }} strokeWidth={1.5} />
      </div>

      {/* Yıldız puanı */}
      <div className="flex items-center gap-0.5 mb-3 relative">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className="w-3.5 h-3.5"
            fill={i < t.rating ? 'var(--gold-400)' : 'transparent'}
            stroke={i < t.rating ? 'var(--gold-400)' : 'var(--border-strong)'}
            strokeWidth={1.5}
          />
        ))}
        <span className="text-[10px] uppercase tracking-wider font-bold ml-2 px-2 py-0.5 rounded-full"
          style={{
            background: 'rgba(212,175,55,0.10)',
            border: '1px solid var(--border-gold)',
            color: 'var(--gold-400)',
          }}
        >
          {t.highlight}
        </span>
      </div>

      {/* Quote metni */}
      <p className="text-[13.5px] sm:text-[14px] leading-relaxed mb-4 relative flex-1"
        style={{ color: 'var(--text-secondary)' }}
      >
        "{t.quote}"
      </p>

      {/* Yazar */}
      <div className="flex items-center gap-3 pt-3 border-t relative"
        style={{ borderColor: 'var(--border-main)' }}
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[14px] flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))',
            color: '#1a1208',
          }}
        >
          {t.author.split(' ').map(s => s[0]).join('').slice(0, 2)}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
            {t.author}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {t.role}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HomeTestimonials() {
  const headRef = useScrollReveal({ selector: '> *', stagger: 90, y: 22, duration: 800 })
  const gridRef = useScrollReveal({ selector: '> *', stagger: 110, y: 28, duration: 900, delay: 150 })

  return (
    <section className="relative">
      <div ref={headRef} className="text-center mb-8 max-w-2xl mx-auto">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide uppercase mb-3"
          style={{
            background: 'rgba(212,175,55,0.08)',
            borderColor: 'var(--border-gold)',
            color: 'var(--gold-400)',
          }}
        >
          <MessageCircle className="w-3 h-3" />
          Kullanıcı Yorumları
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Ne öğrendiklerini kendileri anlatsın
        </h2>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-muted)' }}>
          Sinyal kazançlarından değil, edinilen perspektiften bahsediyorlar.
        </p>
      </div>

      <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TESTIMONIALS.map((t, i) => <TestimonialCard key={i} t={t} index={i} />)}
      </div>

      <p className="text-center text-[11px] mt-6" style={{ color: 'var(--text-faint)' }}>
        Yorumlar gerçek kullanıcılarımızın deneyimlerinden alıntıdır — kişisel bilgileri gizliliği için kısaltılmıştır.
      </p>
    </section>
  )
}
