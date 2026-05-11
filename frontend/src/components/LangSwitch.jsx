/**
 * LangSwitch — TR / EN dil seçici. localStorage'a kaydeder.
 * Provider'sız bile çalışır (standalone).
 */

import { useI18n } from '../lib/i18n'
import { Globe } from 'lucide-react'

export default function LangSwitch({ compact = false }) {
  const { lang, setLang } = useI18n()
  const next = lang === 'tr' ? 'en' : 'tr'
  const label = lang === 'tr' ? 'TR' : 'EN'

  return (
    <button
      onClick={() => setLang(next)}
      className="text-[10px] px-2 py-1 rounded-lg border border-dark-700 bg-dark-800 text-gray-400 hover:text-white hover:border-dark-600 flex items-center gap-1"
      title={`Dili değiştir → ${next.toUpperCase()}`}
    >
      <Globe className="w-3 h-3" />
      {!compact && <span className="font-mono font-semibold">{label}</span>}
    </button>
  )
}
