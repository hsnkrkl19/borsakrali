import {
  GitBranch, Sparkles, Bitcoin, Calendar, Search, BellRing, GraduationCap, Bot,
} from 'lucide-react'
import { useScrollReveal, useHoverTilt } from '../../hooks/useAnime'

/* ─── Site sürüm geçmişi — son güncellemeler ──────────────────────────── */
const RELEASES = [
  {
    version: 'v4.4',
    date: 'Mayıs 2026',
    title: 'Trading Bot & X Gündem',
    icon: Bot,
    description: 'Otomatik strateji motoru — Trading Bot, TEMA34 ve Kağıt Üzerinde botları bir arada. Gerçek X.com taraması ile 549 sembolde canlı sosyal duygu radarı.',
    highlights: ['3 bot bir arada', 'Walk-Forward + Monte Carlo', 'X.com 549 sembol'],
    accent: '249,115,22',
    badge: 'AKTİF',
  },
  {
    version: 'v4.3',
    date: 'Mayıs 2026',
    title: 'Multi-Timeframe Confluence',
    icon: GitBranch,
    description: '7 zaman çerçevesi (1d → 1h → 1g → 1h) eş zamanlı ağırlıklı agregasyon. Bayesian olasılık modeli + 12 mum formasyonu × ATR rejim filtresi.',
    highlights: ['7 TF Confluence', 'Bayesian P(win)', '4 mod (Tarayıcı · Confluence · Kalibrasyon · Backtest)'],
    accent: '16,185,129',
    badge: '',
  },
  {
    version: 'v4.2',
    date: 'Mayıs 2026',
    title: 'Kripto Sinyal Sistemi',
    icon: Bitcoin,
    description: 'Top 100 coin için 3 strateji: SPOT_LONG, FUTURES_LONG, FUTURES_SHORT. Funding rate + Binance USDT klines entegrasyonu. Doğrulanmış backtest +%102.',
    highlights: ['10 koşul × 3 strateji', '09/13/19/01 push', 'Backtest +%102 spot net'],
    accent: '16,185,129',
    badge: '',
  },
  {
    version: 'v4.0',
    date: 'Nisan 2026',
    title: 'Daily Signals Engine',
    icon: BellRing,
    description: '09:55 pre-market + 11:00 revize. BIST 100 taranır, 16 koşul evrensel skorlama, top 10 push bildirim. Trend + Reversion stratejileri eş zamanlı.',
    highlights: ['16 koşul', 'Pre-market 09:55', 'Top 10 push'],
    accent: '59,130,246',
    badge: '',
  },
  {
    version: 'v3.0',
    date: 'Mart 2026',
    title: 'Malaysian SNR + Abonelik',
    icon: Search,
    description: 'Body-bazlı destek/direnç zone analizi (fitili değil gövdeyi sayar). Tier sistemi: FREE / Starter / Pro / Lifetime. Notlar + Feature Requests.',
    highlights: ['Body-bazlı zones', '6 abonelik planı', 'Staleness skoru'],
    accent: '139,92,246',
    badge: '',
  },
  {
    version: 'v2.0',
    date: 'Şubat 2026',
    title: 'Eğitim Merkezi',
    icon: GraduationCap,
    description: '6 detaylı eğitim makalesi (Teknik · Temel · Strateji). BIST hisseleri üzerinden gerçek örnekler, formüllerle anlatım. AdSense uyumlu içerik.',
    highlights: ['6 makale', 'Real BIST örnekleri', 'AdSense uyumlu'],
    accent: '244,114,182',
    badge: '',
  },
]

function ReleaseCard({ r, isFirst }) {
  const Icon = r.icon
  const tiltRef = useHoverTilt({ max: 4, scale: 1.015, glare: true })
  return (
    <div className="grid grid-cols-[40px_1fr] sm:grid-cols-[60px_1fr] gap-3 sm:gap-5">
      {/* Sol: ikon + dikey çizgi */}
      <div className="relative flex flex-col items-center">
        {!isFirst && (
          <div className="absolute top-0 w-px h-3 -translate-y-full"
            style={{ background: `linear-gradient(180deg, transparent, rgba(${r.accent}, 0.5))` }}
          />
        )}
        <div
          className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 relative"
          style={{
            background: `linear-gradient(135deg, rgba(${r.accent}, 0.15), rgba(${r.accent}, 0.05))`,
            border: `1px solid rgba(${r.accent}, 0.45)`,
            boxShadow: isFirst ? `0 0 0 3px rgba(${r.accent}, 0.10), 0 8px 20px -6px rgba(${r.accent}, 0.30)` : 'none',
          }}
        >
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: `rgb(${r.accent})` }} strokeWidth={2.2} />
        </div>
        {/* Dikey çizgi alta */}
        <div className="w-px flex-1 mt-1"
          style={{ background: `linear-gradient(180deg, rgba(${r.accent}, 0.4), transparent)` }}
        />
      </div>

      {/* Sağ: içerik kartı */}
      <div
        ref={tiltRef}
        className="rounded-2xl p-4 sm:p-5 border mb-6 relative overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          borderColor: `rgba(${r.accent}, 0.22)`,
          boxShadow: 'var(--shadow-card)',
          transformStyle: 'preserve-3d',
        }}
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, rgba(${r.accent}, 0.55), transparent)` }}
        />

        <div className="flex items-baseline gap-2 mb-2 flex-wrap">
          <span
            className="text-[11px] font-bold tracking-wider font-mono px-2 py-0.5 rounded-md"
            style={{
              background: `rgba(${r.accent}, 0.12)`,
              color: `rgb(${r.accent})`,
              border: `1px solid rgba(${r.accent}, 0.30)`,
            }}
          >
            {r.version}
          </span>
          <span className="text-[10.5px] uppercase tracking-wider flex items-center gap-1"
            style={{ color: 'var(--text-faint)' }}
          >
            <Calendar className="w-3 h-3" />
            {r.date}
          </span>
          {r.badge && (
            <span
              className="ml-auto text-[9px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full"
              style={{
                background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))',
                color: '#1a1208',
              }}
            >
              {r.badge}
            </span>
          )}
        </div>

        <h3 className="text-base sm:text-lg font-bold tracking-tight mb-1.5"
          style={{ color: 'var(--text-primary)' }}
        >
          {r.title}
        </h3>
        <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          {r.description}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {r.highlights.map((h, i) => (
            <span key={i} className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-main)',
                color: 'var(--text-secondary)',
              }}
            >
              {h}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function HomeChangelog() {
  const headRef = useScrollReveal({ selector: '> *', stagger: 90, y: 20, duration: 800 })
  const listRef = useScrollReveal({ selector: '> *', stagger: 90, y: 22, duration: 800, delay: 150 })

  return (
    <section className="relative">
      <div ref={headRef} className="text-center mb-10 max-w-2xl mx-auto">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide uppercase mb-3"
          style={{
            background: 'rgba(16,185,129,0.08)',
            borderColor: 'var(--border-gold)',
            color: 'var(--gold-400)',
          }}
        >
          <Sparkles className="w-3 h-3" />
          Aktif Gelişim
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Sürekli iyileşen bir platform
        </h2>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-muted)' }}>
          Algoritmamız durmuyor — her sürümle yeni indikatörler, yeni stratejiler, yeni eğitim içerikleri.
        </p>
      </div>

      <div ref={listRef} className="max-w-3xl mx-auto">
        {RELEASES.map((r, i) => <ReleaseCard key={r.version} r={r} isFirst={i === 0} />)}
      </div>
    </section>
  )
}
