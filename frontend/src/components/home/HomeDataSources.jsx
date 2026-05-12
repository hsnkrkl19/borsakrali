import { Database, Activity, FileText, Coins, Globe, Server } from 'lucide-react'
import { useScrollReveal, useHoverTilt } from '../../hooks/useAnime'

/* ─── Veri kaynakları — güven artırıcı entegrasyon bandı ─────────────── */
const SOURCES = [
  {
    icon: Activity,
    name: 'Yahoo Finance',
    desc: 'Anlık BIST + global fiyat akışı',
    badge: 'Anlık',
  },
  {
    icon: FileText,
    name: 'KAP',
    desc: 'Resmi şirket duyuruları',
    badge: 'Resmi',
  },
  {
    icon: Coins,
    name: 'Binance',
    desc: 'Kripto USDT klines + funding rate',
    badge: 'Spot+Futures',
  },
  {
    icon: Database,
    name: 'CoinGecko',
    desc: 'Top 100 coin verisi',
    badge: 'Crypto',
  },
  {
    icon: Globe,
    name: 'Ekonomik Takvim',
    desc: 'TR + ABD makro veriler',
    badge: 'Makro',
  },
  {
    icon: Server,
    name: 'Render Cloud',
    desc: 'Düşük gecikme + 7/24 uptime',
    badge: 'Altyapı',
  },
]

function SourceCard({ s }) {
  const Icon = s.icon
  const tiltRef = useHoverTilt({ max: 5, scale: 1.025, glare: true })
  return (
    <div
      ref={tiltRef}
      className="rounded-2xl border p-4 sm:p-5 relative overflow-hidden h-full"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-main)',
        boxShadow: 'var(--shadow-sm)',
        transformStyle: 'preserve-3d',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: 'rgba(212,175,55,0.10)',
            border: '1px solid var(--border-gold)',
          }}
        >
          <Icon className="w-5 h-5" style={{ color: 'var(--gold-400)' }} strokeWidth={2} />
        </div>
        <span
          className="text-[9px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full whitespace-nowrap"
          style={{
            background: 'rgba(212,175,55,0.10)',
            border: '1px solid var(--border-gold)',
            color: 'var(--gold-400)',
          }}
        >
          {s.badge}
        </span>
      </div>
      <h3 className="text-[14px] font-bold tracking-tight mb-1"
        style={{ color: 'var(--text-primary)' }}
      >
        {s.name}
      </h3>
      <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {s.desc}
      </p>
    </div>
  )
}

export default function HomeDataSources() {
  const headRef = useScrollReveal({ selector: '> *', stagger: 80, y: 20, duration: 750 })
  const gridRef = useScrollReveal({ selector: '> *', stagger: 70, y: 18, duration: 700, delay: 120 })

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
          <Database className="w-3 h-3" />
          Veri Kaynakları
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Algoritmalarımızın yakıtı
        </h2>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-muted)' }}>
          Sinyallerimiz havadan üretilmiyor — herkesin erişebileceği,
          doğrulanabilir kaynaklardan beslenen şeffaf bir altyapı.
        </p>
      </div>

      <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {SOURCES.map((s, i) => <SourceCard key={i} s={s} />)}
      </div>
    </section>
  )
}
