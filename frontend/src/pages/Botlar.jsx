import { useSearchParams } from 'react-router-dom'
import { Bot, FlaskConical, LineChart } from 'lucide-react'
import TradingBot from './TradingBot'
import Tema34Bot from './Tema34Bot'
import PaperTrading from './PaperTrading'
import { Button, PageHeader } from '../components/ui'

// Parça 1 wrapper: /botlar yeni route. Eski /trading-bot URL'i App.jsx
// REDIRECT_MAP üzerinden buraya yönlenir. Child sayfalar ?tab okumadığı
// için wrapper tek başına routing yapar.
const SECTIONS = [
  { id: 'trading', label: 'Trading Bot',    icon: Bot,          help: 'Bugünün LONG sinyallerini sanal portföyle takip eden bot — tüm kararlar log\'da.' },
  { id: 'tema34',  label: 'TEMA34 Bot',     icon: LineChart,    help: 'Saf TEMA34 günlük-kapanış kesişim botu — ayrı bir sistem.' },
  { id: 'paper',   label: 'Kağıt Üzerinde', icon: FlaskConical, help: 'Gerçek para riske atmadan strateji denemesi.' },
]

export default function Botlar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'trading'
  const active = SECTIONS.find((s) => s.id === tab) ? tab : 'trading'
  const meta = SECTIONS.find((s) => s.id === active) || SECTIONS[0]

  return (
    <div className="space-y-4">
      <PageHeader icon={meta.icon} eyebrow="Botlar" title={meta.label} description={meta.help} />

      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <Button
            key={s.id}
            variant={active === s.id ? 'outline' : 'ghost'}
            size="sm"
            icon={s.icon}
            onClick={() => setSearchParams({ tab: s.id })}
            aria-pressed={active === s.id}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {active === 'paper' ? <PaperTrading /> : active === 'tema34' ? <Tema34Bot /> : <TradingBot />}
    </div>
  )
}
