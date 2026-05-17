import { useSearchParams } from 'react-router-dom'
import { Bot, FlaskConical } from 'lucide-react'
import TradingBot from './TradingBot'
import PaperTrading from './PaperTrading'

// Parça 1 wrapper: /botlar yeni route. Eski /trading-bot URL'i App.jsx
// REDIRECT_MAP üzerinden buraya yönlenir. Child sayfalar ?tab okumadığı
// için wrapper tek başına routing yapar.
const SECTIONS = [
  { id: 'trading', label: 'Trading Bot',  icon: Bot          },
  { id: 'paper',   label: 'Kağıt Üzerinde', icon: FlaskConical },
]

export default function Botlar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'trading'
  const active = SECTIONS.find((s) => s.id === tab) ? tab : 'trading'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const isActive = active === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSearchParams({ tab: s.id })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all"
              style={{
                background: isActive ? 'rgba(212, 175, 55, 0.12)' : 'var(--bg-card)',
                border: `1px solid ${isActive ? 'var(--border-gold)' : 'var(--border-main)'}`,
                color: isActive ? 'var(--gold-400)' : 'var(--text-secondary)',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          )
        })}
      </div>
      {active === 'paper' ? <PaperTrading /> : <TradingBot />}
    </div>
  )
}
