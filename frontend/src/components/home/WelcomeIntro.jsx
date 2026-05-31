import { ArrowRight, Sparkles } from 'lucide-react'
import HomeHero from './HomeHero'
import HomePhilosophy from './HomePhilosophy'
import HomeKnownVsUnknown from './HomeKnownVsUnknown'
import HomeStrategyShowcase from './HomeStrategyShowcase'
import HomeDataSources from './HomeDataSources'
import HomeHowItWorks from './HomeHowItWorks'
import HomeEducation from './HomeEducation'
import HomeTestimonials from './HomeTestimonials'
import HomeChangelog from './HomeChangelog'
import HomeFAQ from './HomeFAQ'

/**
 * WelcomeIntro — yeni ziyaretçilere bir kerelik "yenilikler" deneyimi.
 * Tüm home bölümlerini sıralı render eder, en altta "Siteye Devam Et" CTA'sı.
 *
 * Props:
 *  - onContinue: CTA butonu tıklandığında çağrılır (zorunlu)
 *  - ctaLabel: buton metni (varsayılan: "Siteye Devam Et")
 *  - ctaSubtitle: butonun altındaki açıklama metni
 */
export default function WelcomeIntro({
  onContinue,
  ctaLabel = 'Siteye Devam Et',
  ctaSubtitle = 'Yenilikleri daha sonra tekrar görmek için Ayarlar > Hoşgeldin Ekranı kısmından açabilirsiniz.',
}) {
  return (
    <div className="space-y-10 sm:space-y-14 lg:space-y-16">
      <div id="hero"><HomeHero /></div>
      <div id="philosophy"><HomePhilosophy /></div>
      <div id="depth"><HomeKnownVsUnknown /></div>
      <div id="strategies"><HomeStrategyShowcase /></div>
      <div id="sources"><HomeDataSources /></div>
      <div id="how"><HomeHowItWorks /></div>
      <div id="education"><HomeEducation /></div>
      <div id="testimonials"><HomeTestimonials /></div>
      <div id="changelog"><HomeChangelog /></div>
      <div id="faq"><HomeFAQ /></div>

      {/* ─── Siteye Devam Et CTA ───────────────────────────────────────── */}
      <section
        className="relative overflow-hidden rounded-3xl border p-6 sm:p-10 text-center"
        style={{
          background: `
            radial-gradient(800px 320px at 50% 0%, rgba(16,185,129,0.18), transparent 60%),
            linear-gradient(180deg, var(--bg-card) 0%, var(--bg-canvas) 100%)
          `,
          borderColor: 'var(--border-gold)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, transparent, var(--gold-400), transparent)' }}
        />

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide uppercase mb-5"
          style={{
            background: 'rgba(16,185,129,0.08)',
            borderColor: 'var(--border-gold)',
            color: 'var(--gold-400)',
          }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Hazır mısın?
        </div>

        <h2
          className="font-bold leading-tight tracking-tight mb-3"
          style={{ color: 'var(--text-primary)', fontSize: 'clamp(1.5rem, 3.4vw, 2.2rem)' }}
        >
          Krallığa{' '}
          <span style={{
            background: 'linear-gradient(135deg, var(--gold-200) 0%, var(--gold-400) 50%, var(--gold-600) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            adımını at
          </span>
        </h2>

        <p
          className="max-w-xl mx-auto text-sm sm:text-base leading-relaxed mb-7"
          style={{ color: 'var(--text-secondary)' }}
        >
          Yenilikleri inceledin. Şimdi gerçek piyasa verilerine ve AI destekli analizlere göz at.
        </p>

        <button
          onClick={onContinue}
          className="group inline-flex items-center justify-center gap-2 h-12 px-7 rounded-2xl font-semibold text-[15px] overflow-hidden relative"
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
          <span className="relative">{ctaLabel}</span>
          <ArrowRight className="w-4 h-4 relative transition-transform group-hover:translate-x-0.5" />
        </button>

        {ctaSubtitle && (
          <p
            className="text-[11px] mt-5 max-w-md mx-auto leading-relaxed"
            style={{ color: 'var(--text-faint)' }}
          >
            {ctaSubtitle}
          </p>
        )}
      </section>
    </div>
  )
}
