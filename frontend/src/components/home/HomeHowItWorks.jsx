import { useRef } from 'react'
import { Database, Brain, Target, GraduationCap } from 'lucide-react'
import { useScrollReveal, useTimelineProgress, useHoverTilt } from '../../hooks/useAnime'

const STEPS = [
  {
    icon: Database,
    title: 'Veri',
    headline: 'Anlık piyasa verisi toplanır',
    body: 'Yahoo Finance fiyat akışı, KAP duyuruları ve makro ekonomik takvim 7/24 izlenir. BIST 100 + ilk 100 kripto için 7 farklı zaman dilimi (1d → 1h → 1g → 1h) anında alınır.',
    tone: 'gold',
    accent: 'rgba(16,185,129,0.55)',
  },
  {
    icon: Brain,
    title: 'AI Analiz',
    headline: 'Veriler çoklu modelle yorumlanır',
    body: 'RSI · MACD · EMA34 · Bollinger · ATR · destek-direnç · mum formasyonları. Bayesçi öncül + backtest sonrası güncelleme ile her sinyale olasılık atanır.',
    tone: 'jade',
    accent: 'rgba(16,185,129,0.5)',
  },
  {
    icon: Target,
    title: 'Sinyal',
    headline: '16 koşul puanlanır, en güçlüler seçilir',
    body: 'Her hisse 16 farklı kritere göre puanlanır (long & short). BIST 100 taranır, top 10 sinyal bildirim olarak gelir. Confluence motoru 7 zaman çerçevesini ağırlıklandırır.',
    tone: 'gold',
    accent: 'rgba(16,185,129,0.55)',
  },
  {
    icon: GraduationCap,
    title: 'Eğitim',
    headline: 'Her sinyalin arkasındaki mantık öğretilir',
    body: 'Sadece "AL/SAT" demiyoruz — neden, hangi göstergelerin tetiklendiğini, hangi seviyenin kritik olduğunu adım adım gösteriyoruz. Sen sinyali değil, mantığı öğreniyorsun.',
    tone: 'azure',
    accent: 'rgba(59,130,246,0.5)',
  },
]

function StepCard({ step, index, progress }) {
  const Icon = step.icon
  const tiltRef = useHoverTilt({ max: 4, scale: 1.015, glare: true })
  // Bu adım "geçildi mi?" — progress'e göre dolgu rengi
  const localProgress = Math.max(0, Math.min(1, progress * STEPS.length - index))
  const isActive = localProgress > 0.05

  return (
    <div className="grid grid-cols-[60px_1fr] sm:grid-cols-[88px_1fr] gap-4 sm:gap-6 relative">
      {/* Sol: numara + ikon */}
      <div className="relative flex flex-col items-center">
        {/* Üst dikey çizgi (ilk adım hariç) */}
        {index > 0 && (
          <div className="absolute top-0 w-px h-6 -translate-y-full" style={{
            background: `linear-gradient(180deg, transparent, ${step.accent})`,
          }} />
        )}

        {/* Numara halkası */}
        <div
          className="relative w-14 h-14 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center transition-all duration-700"
          style={{
            background: isActive
              ? `linear-gradient(135deg, ${step.accent}, rgba(255,255,255,0.02))`
              : 'var(--bg-card)',
            border: `1px solid ${isActive ? step.accent : 'var(--border-main)'}`,
            boxShadow: isActive ? `0 8px 32px -8px ${step.accent}` : 'none',
            transform: `scale(${0.94 + localProgress * 0.06})`,
          }}
        >
          <Icon
            className="w-6 h-6 sm:w-8 sm:h-8 transition-all duration-500"
            strokeWidth={2}
            style={{ color: isActive ? 'var(--gold-300)' : 'var(--text-muted)' }}
          />
          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{
              background: isActive ? 'linear-gradient(135deg, var(--gold-300), var(--gold-500))' : 'var(--bg-elevated)',
              color: isActive ? '#1a1208' : 'var(--text-muted)',
              border: '1px solid var(--border-strong)',
            }}
          >
            {String(index + 1).padStart(2, '0')}
          </div>
        </div>
      </div>

      {/* Sağ: içerik kartı */}
      <div
        ref={tiltRef}
        className="rounded-2xl p-4 sm:p-5 border transition-colors duration-500 relative overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          borderColor: isActive ? step.accent : 'var(--border-main)',
          boxShadow: isActive ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        }}
      >
        <div className="flex flex-wrap items-baseline gap-2 mb-1.5">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase"
            style={{ color: isActive ? 'var(--gold-400)' : 'var(--text-faint)' }}
          >
            Adım {index + 1}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>·</span>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            {step.title}
          </span>
        </div>
        <h3 className="text-lg sm:text-xl font-bold mb-2 tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {step.headline}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {step.body}
        </p>
      </div>
    </div>
  )
}

export default function HomeHowItWorks() {
  const [trackRef, progress] = useTimelineProgress()
  const headRef = useScrollReveal({ selector: '> *', stagger: 100, y: 22, duration: 850 })

  return (
    <section className="relative">
      {/* Başlık */}
      <div ref={headRef} className="text-center mb-10 max-w-2xl mx-auto">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide uppercase mb-4"
          style={{
            background: 'rgba(16,185,129,0.08)',
            borderColor: 'var(--border-gold)',
            color: 'var(--gold-400)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          Şeffaf Süreç
        </div>
        <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Sinyal nasıl üretiliyor?
        </h2>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-muted)' }}>
          Veriden eğitime — her adım açık. Kara kutu yok, doğrulanabilir mantık var.
        </p>
      </div>

      {/* Timeline */}
      <div ref={trackRef} className="relative max-w-3xl mx-auto">
        {/* Dikey track — tüm timeline boyunca */}
        <div
          aria-hidden="true"
          className="hidden sm:block absolute left-10 top-0 bottom-0 w-px"
          style={{
            background: 'linear-gradient(180deg, var(--border-main) 0%, var(--border-strong) 50%, var(--border-main) 100%)',
            transform: 'translateX(-0.5px)',
          }}
        />
        {/* Altın dolu kısım — scroll progress'e göre */}
        <div
          aria-hidden="true"
          className="hidden sm:block absolute left-10 top-0 w-[2px] origin-top"
          style={{
            height: `${(progress * 100).toFixed(2)}%`,
            background: 'linear-gradient(180deg, var(--gold-300), var(--gold-500))',
            boxShadow: '0 0 18px rgba(16,185,129,0.55)',
            transform: 'translateX(-1px)',
            transition: 'height 60ms linear',
          }}
        />

        <div className="space-y-8 sm:space-y-10 relative">
          {STEPS.map((step, i) => (
            <StepCard key={i} step={step} index={i} progress={progress} />
          ))}
        </div>
      </div>
    </section>
  )
}
