import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Brain, Table, FileText, Star, Building2, Calculator } from 'lucide-react'
import TemelAnalizAI from './TemelAnalizAI'
import FinancialAnalysis from './FinancialAnalysis'
import KAPAnalitik from './KAPAnalitik'
import HisseAISkor from './HisseAISkor'
import DCFDegerleme from './DCFDegerleme'
import ScrollableTabBar from '../components/ScrollableTabBar'

const TABS = [
  { id: 'temel-ai',  label: 'Temel Analiz AI', icon: Brain,      component: TemelAnalizAI,     desc: 'Yapay zekâ destekli temel analiz' },
  { id: 'mali',      label: 'Mali Tablolar',   icon: Table,      component: FinancialAnalysis, desc: 'Bilanço, gelir tablosu, oran analizi' },
  { id: 'kap',       label: 'KAP Bültenleri',  icon: FileText,   component: KAPAnalitik,       desc: 'Kamuoyu Aydınlatma duyuruları' },
  { id: 'ai-skor',   label: 'AI Skor',         icon: Star,       component: HisseAISkor,       desc: 'Hisse skor ve öneri kartı' },
  { id: 'dcf',       label: 'DCF Değerleme',   icon: Calculator, component: DCFDegerleme,      desc: 'İndirgenmiş Nakit Akımı ile içsel değer hesabı (dexter metodolojisi)', isNew: true },
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
      <div className="card !p-0 border-amber-500/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.10] to-transparent pointer-events-none" />
        <div className="relative flex items-center gap-3 p-4 sm:p-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Building2 className="w-5 h-5 text-slate-950" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Şirket Analizi</h1>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>Temel, mali ve KAP verileri tek panelde</p>
          </div>
        </div>
      </div>

      <ScrollableTabBar
        activeKey={active}
        className="bg-dark-900/60 border border-dark-700 rounded-2xl p-1.5 gap-1"
      >
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              data-tab-key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex-shrink-0 flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all
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
      </ScrollableTabBar>

      <div className="text-xs text-gray-500 px-1">
        {TABS.find(t => t.id === active)?.desc}
      </div>

      <div>
        {Active && <Active />}
      </div>
    </div>
  )
}
