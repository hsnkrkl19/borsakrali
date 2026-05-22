import { useSearchParams } from 'react-router-dom'
import { Bot, FlaskConical, LineChart } from 'lucide-react'
import TradingBot from './TradingBot'
import Tema34Bot from './Tema34Bot'
import PaperTrading from './PaperTrading'
import { PageHeader } from '../components/ui'

// /botlar wrapper. Eski /trading-bot URL'i App.jsx REDIRECT_MAP üzerinden
// buraya yönlenir. Child sayfalar ?tab okumadığı için wrapper routing yapar.
const SECTIONS = [
  { id: 'trading', label: 'Trading Bot',   short: 'Trading', icon: Bot,
    help: 'Bugünün LONG sinyallerini sanal portföyle takip eden bot — tüm kararlar kayıt altında.' },
  { id: 'tema34',  label: 'TEMA34 Bot',    short: 'TEMA34',  icon: LineChart,
    help: 'Saf TEMA34 günlük-kapanış kesişim botu — ayrı bir sistem.' },
  { id: 'paper',   label: 'Kağıt Üzerinde', short: 'Kağıt',  icon: FlaskConical,
    help: 'Gerçek parayı riske atmadan, sinyallerle elle strateji denemesi.' },
]

export default function Botlar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'trading'
  const active = SECTIONS.find((s) => s.id === tab) ? tab : 'trading'
  const meta = SECTIONS.find((s) => s.id === active) || SECTIONS[0]

  return (
    <div className="space-y-4">
      <PageHeader icon={Bot} eyebrow="Sanal Botlar" title="Botlar" description={meta.help} />

      {/* Bot seçici — segmented kontrol; içerideki alt-çizgi sekmelerden
          görsel olarak ayrışsın diye dolu-pill biçiminde. */}
      <div className="flex gap-1 rounded-xl border border-dark-700 bg-dark-900/70 p-1">
        {SECTIONS.map((s) => {
          const on = active === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSearchParams({ tab: s.id })}
              aria-pressed={on}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-semibold transition-all"
              style={{
                background: on ? 'var(--bg-elevated)' : 'transparent',
                color: on ? 'var(--gold-400)' : 'var(--text-muted)',
                boxShadow: on ? 'var(--shadow-sm)' : 'none',
              }}
            >
              <s.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          )
        })}
      </div>

      {active === 'paper' ? <PaperTrading /> : active === 'tema34' ? <Tema34Bot /> : <TradingBot />}
    </div>
  )
}
