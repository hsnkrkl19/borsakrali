import { useSearchParams } from 'react-router-dom'
import { Search, Sparkles } from 'lucide-react'
import Tarayicilar from './Tarayicilar'
import GunlukTespitler from './GunlukTespitler'
import HelpBubble from '../components/HelpBubble'

// /firsatlar yeni route; eski /tarayicilar ve /gunluk-tespitler URL'leri
// App.jsx REDIRECT_MAP üzerinden buraya yönlenir. Sayfa iki üst sekme barındırır:
//   • Tarayıcılar (elle filtre — EMA34/TEMA/SNR/X-gündem/News)
//   • Günlük Tespitler (otomatik tarama listesi — BIST/Kripto/MTF/Emtia)
// Başlık aktif sekmeye göre değişir, navbar'dan "Tarayıcılar" diye girmiş
// kullanıcı tutarlı bir başlık görür.
const GUNLUK_TABS = new Set([
  'gunluk', 'bugun', 'today', 'kripto', 'emtia', 'mtf',
  'likidasyon', 'backtest', 'akilli-suzgec', 'canli-takip', 'detayli-analiz',
])

const SECTIONS = [
  { id: 'tarama', label: 'Tarayıcılar',       icon: Search,    defaultTab: 'genel', help: 'EMA34 · TEMA34 · SNR · X-gündem — sen filtreyi seçiyorsun.' },
  { id: 'gunluk', label: 'Günlük Tespitler',  icon: Sparkles,  defaultTab: 'bugun', help: 'Sistem her gün BIST/Kripto/MTF tarayıp top sinyalleri listeler.' },
]

export default function Firsatlar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'genel'
  const activeSection = GUNLUK_TABS.has(tab) ? 'gunluk' : 'tarama'
  const activeMeta = SECTIONS.find(s => s.id === activeSection) || SECTIONS[0]

  const switchSection = (id) => {
    const next = SECTIONS.find((s) => s.id === id)
    if (!next) return
    setSearchParams({ tab: next.defaultTab })
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center" style={{ color: 'var(--text-primary)' }}>
        {activeMeta.label}
        <HelpBubble text={activeMeta.help} />
      </h1>
      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const active = activeSection === s.id
          return (
            <button
              key={s.id}
              onClick={() => switchSection(s.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all"
              style={{
                background: active ? 'rgba(212, 175, 55, 0.12)' : 'var(--bg-card)',
                border: `1px solid ${active ? 'var(--border-gold)' : 'var(--border-main)'}`,
                color: active ? 'var(--gold-400)' : 'var(--text-secondary)',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          )
        })}
      </div>
      {activeSection === 'gunluk' ? <GunlukTespitler /> : <Tarayicilar />}
    </div>
  )
}
