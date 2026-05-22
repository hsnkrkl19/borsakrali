import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Brain, Table, FileText, Star, Building2, Calculator } from 'lucide-react'
import TemelAnalizAI from './TemelAnalizAI'
import FinancialAnalysis from './FinancialAnalysis'
import KAPAnalitik from './KAPAnalitik'
import HisseAISkor from './HisseAISkor'
import DCFDegerleme from './DCFDegerleme'
import ScrollableTabBar from '../components/ScrollableTabBar'
import { Button, Badge, PageHeader } from '../components/ui'

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
      <PageHeader
        icon={Building2}
        title="Şirket Analizi"
        description="Temel, mali ve KAP verileri tek panelde"
      />

      <ScrollableTabBar
        activeKey={active}
        className="bg-dark-900/60 border border-dark-700 rounded-2xl p-1.5 gap-1"
      >
        {TABS.map(t => {
          const isActive = active === t.id
          return (
            <Button
              key={t.id}
              data-tab-key={t.id}
              variant={isActive ? 'gold' : 'subtle'}
              size="sm"
              icon={t.icon}
              onClick={() => setTab(t.id)}
              aria-pressed={isActive}
              className="flex-shrink-0"
            >
              {t.label}
              {t.isNew && !isActive && <Badge tone="gold">Yeni</Badge>}
            </Button>
          )
        })}
      </ScrollableTabBar>

      <div className="px-1 text-xs" style={{ color: 'var(--text-faint)' }}>
        {TABS.find(t => t.id === active)?.desc}
      </div>

      <div>
        {Active && <Active />}
      </div>
    </div>
  )
}
