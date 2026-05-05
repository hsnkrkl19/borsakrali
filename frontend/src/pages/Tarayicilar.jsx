import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, TrendingUp, CandlestickChart, BarChart3, Sparkles, Brain } from 'lucide-react'
import Taramalar from './Taramalar'
import EMA34Tarayici from './EMA34Tarayici'
import MalaysianSNR from './MalaysianSNR'
import TaramaAnalizMerkezi from './TaramaAnalizMerkezi'
import StratejiKombolari from './StratejiKombolari'

const TABS = [
  { id: 'genel',    label: 'Genel Tarama',      icon: Search,           component: Taramalar,           desc: 'Hızlı sembol arama ve filtreleme' },
  { id: 'ema34',    label: 'EMA34 Takip',       icon: TrendingUp,       component: EMA34Tarayici,       desc: '34 günlük EMA trend takibi' },
  { id: 'snr',      label: 'Malaysian SNR',     icon: CandlestickChart, component: MalaysianSNR,        desc: 'Destek/direnç bölge analizi' },
  { id: 'merkez',   label: 'Strateji Merkezi',  icon: BarChart3,        component: TaramaAnalizMerkezi, desc: 'Çoklu strateji tarama merkezi' },
  { id: 'kombolar', label: 'Strateji Komboları', icon: Brain,           component: StratejiKombolari,   desc: 'TradingView tarzı çoklu indikatör kombosu — Zincir Bozan, Düşüş Treni, Sessiz Devrim ve daha fazlası', isNew: true },
]

export default function Tarayicilar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initial = TABS.find(t => t.id === searchParams.get('tab'))?.id || 'genel'
  const [active, setActive] = useState(initial)

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && TABS.find(t => t.id === tab)) setActive(tab)
  }, [searchParams])

  const setTab = (id) => {
    setActive(id)
    setSearchParams({ tab: id })
  }

  const Active = TABS.find(t => t.id === active)?.component

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-dark-900/60 to-dark-900/30 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Sparkles className="w-5 h-5 text-dark-950" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Tarayıcılar</h1>
            <p className="text-xs sm:text-sm text-gray-400">Tüm tarama araçları tek çatı altında</p>
          </div>
        </div>
      </div>

      {/* Tab pills */}
      <div className="bg-dark-900/60 border border-dark-700 rounded-2xl p-1.5 overflow-x-auto custom-scrollbar">
        <div className="flex gap-1 min-w-max">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = active === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all
                  ${isActive
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-dark-950 shadow-lg shadow-amber-500/25'
                    : 'text-gray-400 hover:text-white hover:bg-dark-800'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {t.isNew && !isActive && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40">YENİ</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active tab description */}
      <div className="text-xs text-gray-500 px-1">
        {TABS.find(t => t.id === active)?.desc}
      </div>

      {/* Active component */}
      <div>
        {Active && <Active />}
      </div>
    </div>
  )
}
