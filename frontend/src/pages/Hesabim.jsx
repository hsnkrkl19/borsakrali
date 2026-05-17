import { useSearchParams } from 'react-router-dom'
import { Settings, Briefcase, BookOpen, CreditCard } from 'lucide-react'
import Ayarlar from './Ayarlar'
import TakipListem from './TakipListem'
import Notlarim from './Notlarim'
import Abonelik from './Abonelik'
import HelpBubble from '../components/HelpBubble'

const HELP_TEXTS = {
  ayarlar:  'Bildirim, tema, dil ayarlarını buradan yaparsın.',
  takip:    'İzlemek istediğin hisseler burada kalır.',
  notlar:   'Hisseler için kendi notlarını tutarsın.',
  abonelik: 'Premium özelliklere buradan erişirsin.',
}

// Parça 1 wrapper: /hesabim 4 alt sayfayı tek çatı altında toplar. Notlarim
// kendi ?tab=teknik|finansal sub-tab'ını kullanıyor — bu wrapper o değerleri
// de Notlarim'a yönlendiriyor ki sub-tab değişimi sayfayı kırmasın.
const NOTLAR_TABS = new Set(['notlar', 'teknik', 'finansal'])

const SECTIONS = [
  { id: 'ayarlar',  label: 'Ayarlar',       icon: Settings   },
  { id: 'takip',    label: 'Takip Listem',  icon: Briefcase  },
  { id: 'notlar',   label: 'Notlarım',      icon: BookOpen   },
  { id: 'abonelik', label: 'Abonelik',      icon: CreditCard },
]

function resolveSection(tab) {
  if (tab === 'takip') return 'takip'
  if (NOTLAR_TABS.has(tab)) return 'notlar'
  if (tab === 'abonelik') return 'abonelik'
  return 'ayarlar'
}

export default function Hesabim() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'ayarlar'
  const active = resolveSection(tab)

  const switchSection = (id) => setSearchParams({ tab: id })

  return (
    <div className="space-y-3">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center" style={{ color: 'var(--text-primary)' }}>
        Hesabım
        <HelpBubble text={HELP_TEXTS[active] || 'Hesabınla ilgili her şey burada.'} />
      </h1>
      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const isActive = active === s.id
          return (
            <button
              key={s.id}
              onClick={() => switchSection(s.id)}
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
      {active === 'takip'    && <TakipListem />}
      {active === 'notlar'   && <Notlarim />}
      {active === 'abonelik' && <Abonelik />}
      {active === 'ayarlar'  && <Ayarlar />}
    </div>
  )
}
