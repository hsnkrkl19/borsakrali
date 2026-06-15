import { useSearchParams } from 'react-router-dom'
import { Bot, Bitcoin, FlaskConical, LineChart, ArrowUpRight, ArrowUpDown, Wrench, Plus } from 'lucide-react'
import TradingBot from './TradingBot'
import KriptoBot from './KriptoBot'
import Tema34Bot from './Tema34Bot'
import PaperTrading from './PaperTrading'
import CustomBots from './CustomBots'
import { PageHeader } from '../components/ui'

// /botlar — sanal botlar merkezi.
// Kullanıcı kendi botunu oluşturabilir (CustomBots). İki ana hazır bot öne çıkar:
// BIST Botu (sadece long) + Kripto Botu (long+short). TEMA34 ve Kağıt Üzerinde
// "gelişmiş" altında durur.
const PRIMARY = [
  {
    id: 'trading', label: 'BIST Botu', icon: Bot, badge: 'Sadece AL', badgeIcon: ArrowUpRight,
    desc: 'Günlük BIST sinyallerini sanal parayla işler. Hisselerde yalnızca LONG (alış) — her işlem ne zaman, neye göre alındı ve sonucu kayıt altında.',
  },
  {
    id: 'kripto', label: 'Kripto Botu', icon: Bitcoin, badge: 'Long + Short', badgeIcon: ArrowUpDown,
    desc: 'Kripto sinyallerini sanal USD parayla işler. Yükselişe LONG, düşüşe SHORT açar — her pozisyonun gerekçesi koşul koşul gösterilir.',
  },
]
const ADVANCED = [
  { id: 'tema34', label: 'TEMA34 Botu', icon: LineChart, desc: 'Saf TEMA34 günlük-kapanış kesişim sistemi.' },
  { id: 'paper', label: 'Kağıt Üzerinde', icon: FlaskConical, desc: 'Sinyallerle elle strateji denemesi.' },
]
const CUSTOM = {
  id: 'custom', label: 'Bot Oluştur', icon: Wrench,
  desc: 'Kendi botunu oluştur: stratejini ve parametrelerini seç, çalışacağı hisseleri belirle, stop/hedef kurallarını koy ve işlemlere elle müdahale et.',
}
const ALL = [...PRIMARY, ...ADVANCED, CUSTOM]

export default function Botlar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const active = ALL.find((s) => s.id === tabParam) ? tabParam : 'trading'
  const meta = ALL.find((s) => s.id === active) || PRIMARY[0]
  const select = (id) => setSearchParams({ tab: id })

  const customOn = active === 'custom'

  return (
    <div className="space-y-4">
      <PageHeader icon={Bot} eyebrow="Sanal Botlar" title="Botlar" description={meta.desc} />

      {/* Kendi botunu oluştur — öne çıkan CTA kartı */}
      <button
        type="button"
        onClick={() => select('custom')}
        aria-pressed={customOn}
        className="group flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all"
        style={{
          borderColor: customOn ? 'var(--gold-400)' : 'var(--border-subtle)',
          background: customOn ? 'var(--bg-elevated)' : 'var(--bg-surface)',
          boxShadow: customOn ? 'var(--shadow-md)' : 'none',
        }}
      >
        <span
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: 'var(--gold-500-15, rgba(16,185,129,0.15))' }}
        >
          <Wrench className="h-5 w-5" style={{ color: 'var(--gold-400)' }} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>
            Kendi Botunu Oluştur
            <span className="inline-flex items-center gap-1 rounded-md bg-gold-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-300">Yeni</span>
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-gray-500">
            Strateji + parametre + hisse evreni + stop/hedef kurallarını sen seç. İşlemlere elle müdahale et.
          </p>
        </div>
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors"
          style={{ background: customOn ? 'var(--gold-400)' : 'var(--bg-elevated)' }}
        >
          <Plus className="h-4 w-4" style={{ color: customOn ? '#06281f' : 'var(--text-muted)' }} aria-hidden="true" />
        </span>
      </button>

      {/* İki ana bot — büyük seçim kartları */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PRIMARY.map((s) => {
          const on = active === s.id
          const Badge = s.badgeIcon
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => select(s.id)}
              aria-pressed={on}
              className="group flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all"
              style={{
                borderColor: on ? 'var(--gold-400)' : 'var(--border-subtle)',
                background: on ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                boxShadow: on ? 'var(--shadow-md)' : 'none',
              }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ background: on ? 'var(--gold-500-15, rgba(16,185,129,0.15))' : 'var(--bg-elevated)' }}
                >
                  <s.icon className="h-5 w-5" style={{ color: on ? 'var(--gold-400)' : 'var(--text-muted)' }} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[15px] font-bold" style={{ color: on ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {s.label}
                  </div>
                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-dark-700/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-300">
                    {Badge && <Badge className="h-3 w-3" aria-hidden="true" />}
                    {s.badge}
                  </span>
                </div>
              </div>
              <p className="text-[12px] leading-snug text-gray-500">{s.desc}</p>
            </button>
          )
        })}
      </div>

      {/* Gelişmiş botlar — küçük satır */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Gelişmiş:</span>
        {ADVANCED.map((s) => {
          const on = active === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => select(s.id)}
              aria-pressed={on}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-all"
              style={{
                borderColor: on ? 'var(--gold-400)' : 'var(--border-subtle)',
                background: on ? 'var(--bg-elevated)' : 'transparent',
                color: on ? 'var(--gold-400)' : 'var(--text-muted)',
              }}
            >
              <s.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {s.label}
            </button>
          )
        })}
      </div>

      {active === 'custom' ? <CustomBots />
        : active === 'kripto' ? <KriptoBot />
        : active === 'tema34' ? <Tema34Bot />
        : active === 'paper' ? <PaperTrading />
        : <TradingBot />}
    </div>
  )
}
