import { Link } from 'react-router-dom'
import {
  Shield, BookOpen, Activity, FileWarning, Mail, MapPin, Github, Linkedin,
  AlertTriangle, Crown,
} from 'lucide-react'
import { useScrollReveal, useHoverTilt } from '../../hooks/useAnime'

/* ─── Sosyal kanıt rozetleri ─────────────────────────────────────────── */
const TRUST_BADGES = [
  { icon: Activity, label: 'Yahoo Finance + KAP', sub: 'Anlık veri kaynakları' },
  { icon: Shield,   label: 'Şeffaf Backtest',    sub: 'Tüm sonuçlar açık' },
  { icon: BookOpen, label: 'Eğitim Odaklı',      sub: '6+ rehber makale' },
]

const NAV_GROUPS = [
  {
    title: 'Platform',
    links: [
      { to: '/sinyaller',         label: 'Sinyaller' },
      { to: '/tarayicilar',       label: 'Tarayıcılar' },
      { to: '/teknik-analiz-ai',  label: 'Teknik Analiz' },
      { to: '/sirket-analizi',    label: 'Şirket Analizi' },
      { to: '/kripto',            label: 'Kripto' },
    ],
  },
  {
    title: 'Eğitim',
    links: [
      { to: '/egitim',                          label: 'Eğitim Merkezi' },
      { to: '/egitim/teknik-analiz-giris',      label: 'Teknik Analize Giriş' },
      { to: '/egitim/temel-gostergeler',        label: 'EMA · MACD · RSI' },
      { to: '/egitim/bilanco-okuma',            label: 'Bilanço Okuma' },
      { to: '/egitim/yatirim-stratejisi',       label: 'Yatırım Stratejisi' },
    ],
  },
  {
    title: 'Hesap',
    links: [
      { to: '/abonelik',          label: 'Abonelik Planları' },
      { to: '/hakkimizda',        label: 'Hakkımızda' },
      { to: '/iletisim',          label: 'İletişim' },
      { to: '/site-haritasi',     label: 'Site Haritası' },
    ],
  },
  {
    title: 'Yasal',
    links: [
      { to: '/gizlilik-politikasi',  label: 'Gizlilik Politikası' },
      { to: '/kullanim-kosullari',   label: 'Kullanım Koşulları' },
      { to: '/hesap-silme',          label: 'Hesap Silme' },
    ],
  },
]

function TrustBadge({ badge }) {
  const Icon = badge.icon
  const tiltRef = useHoverTilt({ max: 4, scale: 1.025, glare: true })
  return (
    <div ref={tiltRef}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border relative overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-main)',
      }}
    >
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(212,175,55,0.10)', border: '1px solid var(--border-gold)' }}
      >
        <Icon className="w-5 h-5" style={{ color: 'var(--gold-400)' }} />
      </div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
          {badge.label}
        </div>
        <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {badge.sub}
        </div>
      </div>
    </div>
  )
}

export default function HomeFooter() {
  const disclaimerRef = useScrollReveal({ selector: '> *', stagger: 80, y: 18, duration: 800 })
  const badgeRef      = useScrollReveal({ selector: '> *', stagger: 100, y: 16, duration: 700, delay: 100 })
  const navRef        = useScrollReveal({ selector: '> *', stagger: 70, y: 14, duration: 650, delay: 150 })

  const year = new Date().getFullYear()

  return (
    <footer className="relative mt-6 space-y-10">
      {/* ─── Eğitim disclaimer — büyük ve görünür ──────────────────────── */}
      <div
        className="rounded-2xl border p-5 sm:p-7 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(255,170,40,0.06), rgba(255,170,40,0.02))',
          borderColor: 'rgba(255,170,40,0.30)',
        }}
      >
        {/* Üst altın çizgi */}
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,170,40,0.65), transparent)' }}
        />

        <div ref={disclaimerRef} className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(255,170,40,0.15)',
              border: '1px solid rgba(255,170,40,0.40)',
            }}
          >
            <AlertTriangle className="w-6 h-6 sm:w-7 sm:h-7" style={{ color: '#ffb13d' }} strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-bold tracking-tight mb-1.5"
              style={{ color: 'var(--text-primary)' }}
            >
              Eğitim Amaçlı — Yatırım Tavsiyesi Değildir
            </h3>
            <p className="text-[13px] sm:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Borsa Kralı'nda paylaşılan sinyaller, analizler ve eğitim içerikleri tamamen{' '}
              <strong style={{ color: 'var(--text-primary)' }}>bilgilendirme ve eğitim amaçlıdır</strong>.
              Yatırım kararları kişisel sorumluluk gerektirir; herhangi bir alım-satım önerisi içermez.
              Sermaye Piyasası Kurulu (SPK) lisanslı bir yatırım danışmanına başvurmanız önerilir.
              Geçmiş performans gelecek getiri garantisi vermez.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Güven rozetleri — sosyal kanıt ────────────────────────────── */}
      <div ref={badgeRef} className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {TRUST_BADGES.map((b, i) => <TrustBadge key={i} badge={b} />)}
      </div>

      {/* ─── Navigation + Footer Bottom ────────────────────────────────── */}
      <div className="rounded-2xl p-5 sm:p-7 border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
      >
        <div ref={navRef} className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 mb-7">
          {NAV_GROUPS.map((g, i) => (
            <div key={i}>
              <h4 className="text-[10px] uppercase tracking-[0.18em] font-bold mb-3"
                style={{ color: 'var(--gold-400)' }}
              >
                {g.title}
              </h4>
              <ul className="space-y-2">
                {g.links.map((l, j) => (
                  <li key={j}>
                    <Link
                      to={l.to}
                      className="text-[12.5px] transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--gold-300)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer alt — telif + iletişim */}
        <div className="pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t"
          style={{ borderColor: 'var(--border-main)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))',
                color: '#1a1208',
              }}
            >
              <Crown className="w-4 h-4" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                Borsa Kralı
              </div>
              <div className="text-[10px] leading-tight" style={{ color: 'var(--text-faint)' }}>
                © {year} · Tüm hakları saklıdır
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]"
            style={{ color: 'var(--text-muted)' }}
          >
            <a href="mailto:iletisim@borsakrali.com" className="inline-flex items-center gap-1.5 hover:text-gold-400 transition-colors">
              <Mail className="w-3 h-3" />
              iletisim@borsakrali.com
            </a>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              İstanbul, Türkiye
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileWarning className="w-3 h-3" />
              Bilgilendirme amaçlıdır
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
