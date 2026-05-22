import { Eye, Lightbulb, Shield, BookOpen } from 'lucide-react'
import { useScrollReveal, useHoverTilt } from '../../hooks/useAnime'

const PILLARS = [
  {
    icon: Eye,
    title: 'Şeffaflık',
    body: 'Her sinyalin altında hangi göstergenin tetiklendiğini, hangi koşulun puan getirdiğini açık biçimde görürsün. Backtest sonuçları herkese açık.',
  },
  {
    icon: Lightbulb,
    title: 'Fikir, Tavsiye Değil',
    body: 'Biz "şunu al" demiyoruz. "Şu hisse bu kriterlere göre dikkat çekiyor" diyoruz. Nihai karar — ve sorumluluk — senin.',
  },
  {
    icon: BookOpen,
    title: 'Önce Eğitim',
    body: 'Teknik analiz, bilanço okuma, RSI/MACD/EMA yorumu, destek-direnç çizimi — temel kavramları sıfırdan öğretiyoruz.',
  },
  {
    icon: Shield,
    title: 'Risk Bilinci',
    body: 'Her sinyal kazanmaz. Backtest verilerini, başarı oranını ve zarar dönemlerini saklamadan paylaşıyoruz. Bilinçli risk almanı destekliyoruz.',
  },
]

function PillarCard({ pillar }) {
  const Icon = pillar.icon
  const tiltRef = useHoverTilt({ max: 5, scale: 1.02, glare: true })
  return (
    <div
      ref={tiltRef}
      className="rounded-2xl p-5 border relative overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-main)',
        boxShadow: 'var(--shadow-sm)',
        transformStyle: 'preserve-3d',
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
        style={{
          background: 'rgba(212,175,55,0.10)',
          border: '1px solid var(--border-gold)',
        }}
      >
        <Icon className="w-5 h-5" style={{ color: 'var(--gold-400)' }} />
      </div>
      <h3 className="text-base font-bold tracking-tight mb-1.5"
        style={{ color: 'var(--text-primary)' }}
      >
        {pillar.title}
      </h3>
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {pillar.body}
      </p>
    </div>
  )
}

export default function HomePhilosophy() {
  const headRef = useScrollReveal({ selector: '> *', stagger: 90, y: 20, duration: 800 })
  const gridRef = useScrollReveal({ selector: '> *', stagger: 110, y: 28, duration: 900, delay: 100 })

  return (
    <section className="relative">
      <div ref={headRef} className="text-center mb-8 max-w-2xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Felsefemiz
        </h2>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-muted)' }}>
          Borsa Kralı, sana hangi hisseyi alacağını söyleyen bir oracle değil.
          Verinin ne anlattığını <em style={{ color: 'var(--gold-400)', fontStyle: 'normal' }}>okumayı öğreten</em> bir kaynak.
        </p>
      </div>

      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PILLARS.map((p, i) => <PillarCard key={i} pillar={p} />)}
      </div>
    </section>
  )
}
