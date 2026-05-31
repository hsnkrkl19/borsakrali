/**
 * Parça 3 — Risk kartı.
 *
 * "Hangi riski tercih edersin?" sorusuna 3 cevaptan birini seçtirir.
 * Tıklanınca onSelect(profile.id) çağrılır.
 */

import { ArrowRight } from 'lucide-react'

const RISK_COLOR = {
  low:  { rgb: '16, 185, 129', text: 'var(--jade)' },
  mid:  { rgb: '16, 185, 129', text: 'var(--gold-400)' },
  high: { rgb: '225, 29, 72', text: 'var(--ember)' },
}

export default function BotRiskCard({ profile, onSelect }) {
  const palette = RISK_COLOR[profile.risk] || RISK_COLOR.mid

  return (
    <button
      type="button"
      onClick={() => onSelect?.(profile.id)}
      className="text-left rounded-2xl p-5 border transition-transform hover:scale-[1.02] active:scale-100"
      style={{
        background: `linear-gradient(135deg, rgba(${palette.rgb}, 0.12) 0%, var(--bg-card) 70%)`,
        borderColor: `rgba(${palette.rgb}, 0.45)`,
        boxShadow: `0 0 0 1px rgba(${palette.rgb}, 0.18) inset, var(--shadow-card)`,
        minHeight: 220,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl leading-none" aria-hidden="true">{profile.emoji}</span>
        <span
          className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full"
          style={{ background: `rgba(${palette.rgb}, 0.15)`, color: palette.text, border: `1px solid rgba(${palette.rgb}, 0.4)` }}
        >
          Risk: {profile.riskLabel}
        </span>
      </div>

      <h3
        className="text-xl font-bold mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        {profile.label}
      </h3>

      <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
        {profile.desc}
      </p>

      <div className="space-y-1.5 mb-4 text-[12.5px]" style={{ color: 'var(--text-faint)' }}>
        <p>
          <span className="uppercase tracking-wider text-[10px] mr-1">Tahmini kazanç:</span>
          <span className="font-semibold" style={{ color: palette.text }}>{profile.estReturn}</span>
        </p>
        <p>
          <span className="uppercase tracking-wider text-[10px] mr-1">Strateji:</span>
          {profile.strategyName}
        </p>
      </div>

      <div
        className="inline-flex items-center gap-1 font-semibold text-[13px] px-3 py-2 rounded-lg"
        style={{ background: `rgba(${palette.rgb}, 0.15)`, color: palette.text }}
      >
        Seç <ArrowRight className="w-4 h-4" />
      </div>
    </button>
  )
}
