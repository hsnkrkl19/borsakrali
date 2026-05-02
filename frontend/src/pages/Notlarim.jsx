import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Newspaper, StickyNote, BookOpen } from 'lucide-react'
import TeknikNotlar from './TeknikNotlar'
import FinansalNotlar from './FinansalNotlar'

const TABS = [
  { id: 'teknik',   label: 'Teknik Notlar',   icon: Newspaper,  component: TeknikNotlar,  desc: 'Yayın notları ve haberler' },
  { id: 'finansal', label: 'Finansal Notlar', icon: StickyNote, component: FinansalNotlar, desc: 'Kişisel hisse notlarınız' },
]

export default function Notlarim() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initial = TABS.find(t => t.id === searchParams.get('tab'))?.id || 'teknik'
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
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-dark-900/60 to-dark-900/30 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <BookOpen className="w-5 h-5 text-dark-950" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Notlarım</h1>
            <p className="text-xs sm:text-sm text-gray-400">Tüm notlar ve günlük yorumlar tek yerde</p>
          </div>
        </div>
      </div>

      <div className="bg-dark-900/60 border border-dark-700 rounded-2xl p-1.5">
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon
            const isActive = active === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all
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
