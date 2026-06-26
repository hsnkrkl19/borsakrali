import { useSearchParams } from 'react-router-dom'
import { Search, Sparkles } from 'lucide-react'
import Tarayicilar from './Tarayicilar'
import GunlukTespitler from './GunlukTespitler'
import { Button, PageHeader } from '../components/ui'

// /firsatlar yeni route; eski /tarayicilar ve /gunluk-tespitler URL'leri
// App.jsx REDIRECT_MAP üzerinden buraya yönlenir. Sayfa iki üst sekme barındırır:
//   • Tarayıcılar (elle filtre — EMA34/TEMA/SNR/X-gündem/News)
//   • Günlük Tespitler (otomatik tarama listesi — BIST/Kripto/MTF/Emtia)
// Başlık aktif sekmeye göre değişir, navbar'dan "Tarayıcılar" diye girmiş
// kullanıcı tutarlı bir başlık görür.
const GUNLUK_TABS = new Set([
  // Yeni 5'li yapı (2026-05-18) + forex/parite (2026-06-17) + spot-al ≥75 (2026-06-18)
  'gunluk', 'bugun', 'sinyaller', 'yenirobot', 'beast', 'altin', 'kripto', 'forex', 'emtia', 'analiz', 'araclar',
  // Eski tab ID'leri — GunlukTespitler içinde yeni yapıya yönlendirilir
  'today', 'mtf', 'likidasyon', 'backtest', 'akilli-suzgec', 'canli-takip', 'detayli-analiz',
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
    <div className="space-y-4">
      <PageHeader
        icon={activeMeta.icon}
        eyebrow="Fırsatlar"
        title={activeMeta.label}
        description={activeMeta.help}
      />
      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => {
          const active = activeSection === s.id
          return (
            <Button
              key={s.id}
              variant={active ? 'outline' : 'ghost'}
              size="sm"
              icon={s.icon}
              onClick={() => switchSection(s.id)}
              aria-pressed={active}
            >
              {s.label}
            </Button>
          )
        })}
      </div>
      {activeSection === 'gunluk' ? <GunlukTespitler /> : <Tarayicilar />}
    </div>
  )
}
