import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Brain, Table, FileText, Star, Building2 } from 'lucide-react'
import TemelAnalizAI from './TemelAnalizAI'
import FinancialAnalysis from './FinancialAnalysis'
import KAPAnalitik from './KAPAnalitik'
import HisseAISkor from './HisseAISkor'

const TABS = [
  { id: 'temel-ai',  label: 'Temel Analiz AI', icon: Brain,    component: TemelAnalizAI,     desc: 'Yapay zekâ destekli temel analiz' },
  { id: 'mali',      label: 'Mali Tablolar',   icon: Table,    component: FinancialAnalysis, desc: 'Bilanço, gelir tablosu, oran analizi' },
  { id: 'kap',       label: 'KAP Bültenleri',  icon: FileText, component: KAPAnalitik,       desc: 'Kamuoyu Aydınlatma duyuruları' },
  { id: 'ai-skor',   label: 'AI Skor',         icon: Star,     component: HisseAISkor,       desc: 'Hisse skor ve öneri kartı' },
]

export default function SirketAnalizi() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initial = TABS.find(t => t.id === searchParams.get('tab'))?.id || 'temel-ai'
  const [active, setActive] = useState(initial)

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && TABS.find(t => t.id === tab)) setActive(tab)
  }, [searchParams])

  const setTab = (id) => {
    setActive(id)
    // Preserve symbol query param if present
    const symbol = searchParams.get('symbol')
    const params = { tab: id }
    if (symbol) params.symbol = symbol
    setSearchParams(params)
  }

  const Active = TABS.find(t => t.id === active)?.component

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-dark-900/60 to-dark-900/30 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Building2 className="w-5 h-5 text-dark-950" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Şirket Analizi</h1>
            <p className="text-xs sm:text-sm text-gray-400">Temel, mali ve KAP verileri tek panelde</p>
          </div>
        </div>
      </div>

      <div className="bg-dark-900/60 border border-dark-700 rounded-2xl p-1.5 overflow-x-auto custom-scrollbar">
        <div className="flex gap-1 min-w-max">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = active === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all
                  ${isActive
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-dark-950 shadow-lg shadow-amber-500/25'
                    : 'text-gray-400 hover:text-white hover:bg-dark-800'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="text-xs text-gray-500 px-1">
        {TABS.find(t => t.id === active)?.desc}
      </div>

      <div>
        {Active && <Active />}
      </div>
    </div>
  )
}
