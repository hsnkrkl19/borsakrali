/**
 * Parça 3 — Çalışan bot durumu.
 *
 * Backend canlı bot endpoint'i yok. localStorage'da tutulan profile + budget
 * verisini kullanır; PnL/işlem bilgilerini paper-trading portfoyundan çeker.
 *
 * Üst: durum + bugünkü kâr/zarar
 * Orta: bilgi satırları (bugün X işlem, son işlem, risk seviyesi)
 * CTA: Durdur · Geçmiş işlemler · Gelişmiş Ayarlar (?advanced=true)
 */

import { useEffect, useState } from 'react'
import { Bot, Square, History, Sliders } from 'lucide-react'
import { stopBot } from '../utils/botProfiles'
import api from '../services/api'

function fmtTL(n) {
  if (n == null || !isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`
}

function fmtPct(n) {
  if (n == null || !isFinite(n)) return null
  const sign = n > 0 ? '+' : ''
  return `${sign}%${Number(n).toFixed(2)}`
}

function timeAgo(iso) {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (!isFinite(ms) || ms < 0) return '—'
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m} dk önce`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} sa önce`
  const d = Math.floor(h / 24)
  return `${d} gün önce`
}

export default function BotStatusCard({ active, onStop, onAdvanced }) {
  const { profile, budget, startedAt } = active
  const [portfolio, setPortfolio] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    api.get('/paper-trading/portfolio')
      .then((r) => { if (live) setPortfolio(r.data || null) })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  const todayPnL = portfolio?.todayPnL ?? portfolio?.dailyPnL ?? null
  const todayPct = portfolio?.todayPnLPct ?? portfolio?.dailyPnLPct ?? null
  const lastTrade = portfolio?.lastTrade || portfolio?.trades?.[0] || null
  const openCount = (portfolio?.openPositions?.length ?? portfolio?.positions?.length ?? 0)

  const palette = profile.risk === 'high'
    ? { rgb: '255, 59, 70', cssVar: 'var(--ember)' }
    : profile.risk === 'low'
      ? { rgb: '0, 201, 138', cssVar: 'var(--jade)' }
      : { rgb: '212, 175, 55', cssVar: 'var(--gold-400)' }

  const handleStop = () => {
    if (!window.confirm('Botu durdurmak istediğine emin misin? Açık pozisyonlar kapatılır.')) return
    stopBot()
    onStop?.()
  }

  const pnlTone = todayPnL == null ? 'var(--text-faint)' : todayPnL > 0 ? 'var(--jade)' : todayPnL < 0 ? 'var(--ember)' : 'var(--text-secondary)'

  return (
    <div
      className="rounded-2xl border p-5 sm:p-6 space-y-4"
      style={{
        background: `linear-gradient(135deg, rgba(${palette.rgb}, 0.10) 0%, var(--bg-card) 60%)`,
        borderColor: `rgba(${palette.rgb}, 0.45)`,
        boxShadow: `0 0 0 1px rgba(${palette.rgb}, 0.18) inset, var(--shadow-card)`,
      }}
    >
      {/* Üst başlık */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
            style={{
              background: 'rgba(16, 185, 129, 0.12)',
              color: 'var(--jade)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--jade)' }} />
            Çalışıyor
          </span>
          <span className="text-2xl ml-1" aria-hidden="true">{profile.emoji}</span>
          <h2 className="text-lg sm:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {profile.label}
          </h2>
        </div>
        <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
          {startedAt ? timeAgo(startedAt) + ' başladı' : ''}
        </span>
      </div>

      {/* Bugünkü kâr/zarar */}
      <div
        className="rounded-xl p-4 sm:p-5 text-center"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-main)',
        }}
      >
        <p
          className="text-[11px] uppercase tracking-wider mb-1"
          style={{ color: 'var(--text-faint)' }}
        >
          Bugünkü kâr / zarar
        </p>
        <p
          className="text-3xl sm:text-4xl font-extrabold tracking-tight"
          style={{ color: pnlTone }}
        >
          {loading ? '…' : fmtTL(todayPnL)}
        </p>
        {fmtPct(todayPct) && (
          <p className="text-sm font-semibold mt-1" style={{ color: pnlTone }}>
            {fmtPct(todayPct)}
          </p>
        )}
      </div>

      {/* Bilgi satırları */}
      <ul className="space-y-2 text-[13px]">
        <li className="flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
          <span>Bugün açılan pozisyon</span>
          <strong style={{ color: 'var(--text-primary)' }}>{openCount}</strong>
        </li>
        <li className="flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
          <span>Son işlem</span>
          <strong style={{ color: 'var(--text-primary)' }}>
            {lastTrade
              ? `${lastTrade.symbol || lastTrade.asset || '—'} · ${fmtPct(lastTrade.pnlPct ?? lastTrade.changePercent) || '—'}`
              : 'Henüz işlem yok'}
          </strong>
        </li>
        <li className="flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
          <span>Bütçe</span>
          <strong style={{ color: 'var(--text-primary)' }}>{budget?.toLocaleString('tr-TR')} TL</strong>
        </li>
        <li className="flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
          <span>Risk seviyesi</span>
          <strong style={{ color: palette.cssVar }}>{profile.riskLabel}</strong>
        </li>
      </ul>

      {/* CTA */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
        <button
          type="button"
          onClick={handleStop}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold"
          style={{
            background: 'rgba(225, 29, 72, 0.10)',
            color: 'var(--ember)',
            border: '1px solid rgba(225, 29, 72, 0.4)',
          }}
        >
          <Square className="w-4 h-4" />
          Durdur
        </button>
        <a
          href="/hesabim?tab=takip"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold"
          style={{
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-main)',
          }}
        >
          <History className="w-4 h-4" />
          Geçmiş işlemler
        </a>
        <button
          type="button"
          onClick={onAdvanced}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold"
          style={{
            background: 'rgba(16, 185, 129, 0.10)',
            color: 'var(--gold-400)',
            border: '1px solid var(--border-gold)',
          }}
        >
          <Sliders className="w-4 h-4" />
          Gelişmiş Ayarlar
        </button>
      </div>
    </div>
  )
}
