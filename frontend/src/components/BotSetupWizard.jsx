/**
 * Parça 3 — 3 adımlı bot kurulum wizard'ı.
 *
 * Step 1: Bütçe seç (pill: 1.000 / 5.000 / 10.000 / Özel)
 * Step 2: Onay (özet + checkbox: "Anladım, kabul ediyorum")
 * Step 3: Başlat → BotStatusCard'a geçer
 *
 * Cesur Bot için Step 2'de ek kırmızı uyarı kutusu; checkbox onayı zorunlu.
 */

import { useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { BOT_PROFILES, startBot } from '../utils/botProfiles'

const BUDGET_PILLS = [1000, 5000, 10000]

export default function BotSetupWizard({ profileId, onCancel, onStarted }) {
  const profile = BOT_PROFILES[profileId]
  const [step, setStep] = useState(1)
  const [budget, setBudget] = useState(profile?.minBudget || 1000)
  const [customMode, setCustomMode] = useState(false)
  const [ack, setAck] = useState(false)

  if (!profile) return null

  const advance = () => setStep((s) => Math.min(s + 1, 2))
  const back = () => setStep((s) => Math.max(s - 1, 1))

  const handleStart = () => {
    if (!ack) return
    const ok = startBot({ profileId: profile.id, budget })
    if (ok) onStarted?.()
  }

  const palette = profile.risk === 'high'
    ? { rgb: '255, 59, 70', cssVar: 'var(--ember)' }
    : profile.risk === 'low'
      ? { rgb: '0, 201, 138', cssVar: 'var(--jade)' }
      : { rgb: '212, 175, 55', cssVar: 'var(--gold-400)' }

  return (
    <div
      className="rounded-2xl border p-5 sm:p-6 space-y-5"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-main)',
      }}
    >
      {/* Başlık */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={step === 1 ? onCancel : back}
            aria-label={step === 1 ? 'İptal' : 'Geri'}
            className="p-1.5 rounded-lg flex-shrink-0"
            style={{ color: 'var(--text-faint)' }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-xl" aria-hidden="true">{profile.emoji}</span>
          <h2 className="text-lg sm:text-xl font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {profile.label} kurulumu
          </h2>
        </div>
        <span
          className="text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
          style={{
            background: `rgba(${palette.rgb}, 0.12)`,
            color: palette.cssVar,
            border: `1px solid rgba(${palette.rgb}, 0.4)`,
          }}
        >
          Adım {step}/2
        </span>
      </div>

      {/* Step 1 — Bütçe */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Bu bota ne kadar bütçe ayırmak istiyorsun?
            </h3>
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              ℹ Bot bu bütçenin tamamını riske atmaz, parça parça kullanır.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {BUDGET_PILLS.map((b) => {
              const active = !customMode && budget === b
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => { setCustomMode(false); setBudget(b) }}
                  className="rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
                  style={{
                    background: active ? `rgba(${palette.rgb}, 0.18)` : 'var(--bg-base)',
                    color: active ? palette.cssVar : 'var(--text-primary)',
                    border: `1px solid ${active ? palette.cssVar : 'var(--border-main)'}`,
                  }}
                >
                  {b.toLocaleString('tr-TR')} TL
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setCustomMode(true)}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
              style={{
                background: customMode ? `rgba(${palette.rgb}, 0.18)` : 'var(--bg-base)',
                color: customMode ? palette.cssVar : 'var(--text-primary)',
                border: `1px solid ${customMode ? palette.cssVar : 'var(--border-main)'}`,
              }}
            >
              Özel
            </button>
          </div>

          {customMode && (
            <div>
              <label
                className="block text-[12px] uppercase tracking-wider mb-1.5"
                style={{ color: 'var(--text-faint)' }}
              >
                Tutar (TL)
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={profile.minBudget}
                step={500}
                value={budget}
                onChange={(e) => setBudget(Math.max(profile.minBudget, Number(e.target.value) || 0))}
                className="w-full rounded-lg px-3 py-2.5 text-base font-semibold"
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-main)',
                  color: 'var(--text-primary)',
                }}
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
                Bu bot için minimum: {profile.minBudget.toLocaleString('tr-TR')} TL
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={advance}
            disabled={budget < profile.minBudget}
            className="w-full rounded-xl px-4 py-3 font-semibold text-sm transition-opacity"
            style={{
              background: budget >= profile.minBudget ? palette.cssVar : 'var(--bg-base)',
              color: budget >= profile.minBudget ? 'var(--bg-canvas)' : 'var(--text-faint)',
              opacity: budget >= profile.minBudget ? 1 : 0.6,
              cursor: budget >= profile.minBudget ? 'pointer' : 'not-allowed',
            }}
          >
            Devam et →
          </button>
        </div>
      )}

      {/* Step 2 — Onay */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Hadi son bir kontrol edelim.
          </h3>

          <ul className="space-y-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4" style={{ color: palette.cssVar }} />
              <span>{profile.emoji} {profile.label}</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4" style={{ color: palette.cssVar }} />
              <span>Bütçe: <strong style={{ color: 'var(--text-primary)' }}>{budget.toLocaleString('tr-TR')} TL</strong></span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4" style={{ color: palette.cssVar }} />
              <span>Strateji: {profile.strategyName}</span>
            </li>
          </ul>

          {profile.risk === 'high' && (
            <div
              className="rounded-xl border p-3 text-[13px]"
              style={{
                background: 'rgba(225, 29, 72, 0.08)',
                borderColor: 'rgba(225, 29, 72, 0.4)',
                color: 'var(--ember)',
              }}
            >
              ⚠ Bu bot büyük kazanç ihtimali olduğu kadar büyük kayıp ihtimali de taşır.
              Sadece kaybetmeyi göze alabileceğin parayı bağla.
            </div>
          )}

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-1 flex-shrink-0"
              style={{ accentColor: 'var(--gold-400)' }}
            />
            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              Para kaybı ihtimali olduğunu anladım ve bu seçimi kabul ediyorum.
            </span>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl px-4 py-3 font-semibold text-sm"
              style={{
                background: 'var(--bg-base)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-main)',
              }}
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleStart}
              disabled={!ack}
              className="flex-1 rounded-xl px-4 py-3 font-semibold text-sm transition-opacity"
              style={{
                background: ack ? palette.cssVar : 'var(--bg-base)',
                color: ack ? 'var(--bg-canvas)' : 'var(--text-faint)',
                opacity: ack ? 1 : 0.6,
                cursor: ack ? 'pointer' : 'not-allowed',
              }}
            >
              Başlat →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
