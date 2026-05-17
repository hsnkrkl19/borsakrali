import { useSearchParams } from 'react-router-dom'
import { Search, Sparkles } from 'lucide-react'
import Tarayicilar from './Tarayicilar'
import GunlukTespitler from './GunlukTespitler'
import HelpBubble from '../components/HelpBubble'

// Parça 1 wrapper: /firsatlar yeni route, eski /tarayicilar ve /gunluk-tespitler
// URL'lerini App.jsx REDIRECT_MAP üzerinden buraya yönlendirir. Child sayfalar
// ?tab parametresini kendileri okuduğu için wrapper sadece doğru child'a
// yönlendirir; tab değeri child'ın iç sekmesine eşleşir.
const GUNLUK_TABS = new Set([
  'gunluk', 'bugun', 'today', 'kripto', 'emtia', 'mtf',
  'likidasyon', 'backtest', 'akilli-suzgec', 'canli-takip', 'detayli-analiz',
])

const SECTIONS = [
  { id: 'tarama', label: 'Tarayıcılar',    icon: Search,    defaultTab: 'genel'  },
  { id: 'gunluk', label: 'Günlük Sinyaller', icon: Sparkles, defaultTab: 'bugun' },
]

export default function Firsatlar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'genel'
  const activeSection = GUNLUK_TABS.has(tab) ? 'gunluk' : 'tarama'

  const switchSection = (id) => {
    const next = SECTIONS.find((s) => s.id === id)
    if (!next) return
    setSearchParams({ tab: next.defaultTab })
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center" style={{ color: 'var(--text-primary)' }}>
        Fırsatlar
        <HelpBubble text="Sistem güçlü hisseleri burada listeler." />
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
