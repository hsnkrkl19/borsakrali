import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TrendingUp, BookOpen, BarChart3 } from 'lucide-react'
import AlgoritmaPerformans from './AlgoritmaPerformans'
import IncelemeKutuphanesi from './IncelemeKutuphanesi'
import { Button, PageHeader } from '../components/ui'

const TABS = [
  { id: 'algoritma',  label: 'Algoritma Performans', icon: TrendingUp, component: AlgoritmaPerformans,  desc: 'Sinyal stratejileri başarı analizi' },
  { id: 'kutuphane',  label: 'İnceleme Kütüphanesi', icon: BookOpen,   component: IncelemeKutuphanesi,  desc: 'Geçmiş analiz ve yorum arşivi' },
]

export default function Performans() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initial = TABS.find(t => t.id === searchParams.get('tab'))?.id || 'algoritma'
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
      <PageHeader
        icon={BarChart3}
        title="Performans & Arşiv"
        description="Strateji başarı oranları ve geçmiş analizler"
      />

      <div
        className="rounded-2xl p-1.5"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
      >
        <div className="flex gap-1">
          {TABS.map(t => {
            const isActive = active === t.id
            return (
              <Button
                key={t.id}
                variant={isActive ? 'gold' : 'subtle'}
                size="sm"
                icon={t.icon}
                onClick={() => setTab(t.id)}
                aria-pressed={isActive}
                className="flex-1"
              >
                {t.label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="px-1 text-xs" style={{ color: 'var(--text-faint)' }}>
        {TABS.find(t => t.id === active)?.desc}
      </div>

      <div>
        {Active && <Active />}
      </div>
    </div>
  )
}
