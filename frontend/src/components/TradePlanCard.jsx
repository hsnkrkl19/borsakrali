import { Target, Shield, Zap, Clock, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import { buildTradePlan, formatRelativeTime } from '../lib/strategyMeta'

const ACTION_STYLE = {
  AL:  { color: 'var(--jade)',     bg: 'rgba(0, 201, 138, 0.12)', border: 'rgba(0, 201, 138, 0.30)', Icon: TrendingUp },
  SAT: { color: 'var(--ember)',    bg: 'rgba(255, 59, 70, 0.12)', border: 'rgba(255, 59, 70, 0.30)', Icon: TrendingDown },
  TUT: { color: 'var(--gold-400)', bg: 'rgba(212, 175, 55, 0.12)', border: 'rgba(212, 175, 55, 0.30)', Icon: Clock },
}

/**
 * Compact trade-plan card — Entry / SL / TP with explanations.
 *
 * Props:
 *  - signal:   { strategy, currentPrice, detectionPrice, detectionDate, entry?, stop?, target? }
 *  - compact:  true → tek satır kompakt; false → detaylı kart
 *  - showWhy:  true → sinyal mantığı açıklamasını göster
 */
export default function TradePlanCard({ signal, compact = false, showWhy = true, className = '' }) {
  const plan = buildTradePlan(signal)
  const style = ACTION_STYLE[plan.meta.action] || ACTION_STYLE.TUT
  const ActionIcon = style.Icon

  const fmt = (n) => n != null ? Number(n).toFixed(2) : '—'

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 text-[11px] ${className}`}
        style={{ color: 'var(--text-secondary)' }}
      >
        <span
          className="font-bold px-1.5 py-0.5 rounded text-[10px]"
          style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
        >
          {plan.meta.action}
        </span>
        <span style={{ color: 'var(--text-faint)' }}>Giriş</span>
        <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(plan.entry)}</span>
        <span style={{ color: 'var(--ember)' }}>SL</span>
        <span className="font-mono" style={{ color: 'var(--ember)' }}>{fmt(plan.sl)}</span>
        <span style={{ color: 'var(--jade)' }}>TP</span>
        <span className="font-mono" style={{ color: 'var(--jade)' }}>{fmt(plan.tp)}</span>
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl p-3.5 ${className}`}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-main)',
      }}
    >
      {/* Header: action + meta */}
      <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
          >
            <ActionIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
              >
                {plan.meta.action}
              </span>
              <span className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {plan.meta.label}
              </span>
              <InfoTooltip
                title={plan.meta.label}
                description={plan.meta.explanation}
                formula={plan.meta.formula}
              />
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10.5px]" style={{ color: 'var(--text-faint)' }}>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(signal?.detectionDate || signal?.timestamp || signal?.detectedAt)}
              </span>
              <span>·</span>
              <span>Periyod: <strong style={{ color: 'var(--text-secondary)' }}>{plan.meta.timeframe}</strong></span>
              <span>·</span>
              <span>Vade: <strong style={{ color: 'var(--text-secondary)' }}>{plan.meta.validity}</strong></span>
            </div>
          </div>
        </div>

        {plan.rrRatio && (
          <div
            className="text-[11px] font-bold px-2 py-1 rounded-lg flex-shrink-0"
            style={{
              background: 'rgba(212, 175, 55, 0.10)',
              color: 'var(--gold-400)',
              border: '1px solid var(--border-gold)',
            }}
            title={`Kazanç ihtimali zarardan ~${plan.rrRatio} kat fazla`}
          >
            Kazanç: {plan.rrRatio}×
          </div>
        )}
      </div>

      {/* Entry / SL / TP grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div
          className="rounded-lg p-2.5"
          style={{
            background: 'rgba(59, 130, 246, 0.07)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
          }}
        >
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold mb-1"
            style={{ color: 'var(--azure)' }}
          >
            <Target className="w-3 h-3" />
            <span>Giriş</span>
            <InfoTooltip
              size="sm"
              title="Giriş Fiyatı"
              description="Pozisyona girilmesi önerilen fiyat. Sinyalin tespit edildiği fiyat veya ona çok yakın bir limit emir kullan. Spread ve komisyona dikkat."
            />
          </div>
          <div className="text-[15px] font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
            {fmt(plan.entry)}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            {plan.isExplicit ? 'Algoritma önerisi' : 'Tespit fiyatı'}
          </div>
        </div>

        <div
          className="rounded-lg p-2.5"
          style={{
            background: 'rgba(255, 59, 70, 0.07)',
            border: '1px solid rgba(255, 59, 70, 0.25)',
          }}
        >
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold mb-1"
            style={{ color: 'var(--ember)' }}
          >
            <Shield className="w-3 h-3" />
            <span>Zarar Durdur</span>
            <InfoTooltip
              size="sm"
              title="Zarar Durdur"
              description="Fiyat çok düşerse sistem burada çıkış yapar. Sermayeni korumak için sınırı sabit tut, gevşetme."
              formula={`Varsayılan = Giriş × (1 - 0.03)\n            = Giriş - %3\n\nDaha güvenli: oynaklığa göre 1.5 kat aşağı veya teknik destek altı.`}
            />
          </div>
          <div className="text-[15px] font-bold font-mono" style={{ color: 'var(--ember)' }}>
            {fmt(plan.sl)}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            Risk: %{plan.entry && plan.sl ? Math.abs((plan.sl - plan.entry) / plan.entry * 100).toFixed(1) : '—'}
          </div>
        </div>

        <div
          className="rounded-lg p-2.5"
          style={{
            background: 'rgba(0, 201, 138, 0.07)',
            border: '1px solid rgba(0, 201, 138, 0.25)',
          }}
        >
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold mb-1"
            style={{ color: 'var(--jade)' }}
          >
            <Zap className="w-3 h-3" />
            <span>Kâr Al</span>
            <InfoTooltip
              size="sm"
              title="Kâr Al"
              description="Hedefe ulaşınca satış yapılır. Standart hedef: kazanç ihtimali zarardan ~2 kat fazla; güçlü sinyallerde ~3 kat veya daha fazla mümkün."
              formula={`Varsayılan Hedef = Giriş + (Risk × 2)\nKazanç/Zarar = (Hedef - Giriş) / (Giriş - Zarar Durdur)\n\nKısmi kâr: hedefin yarısında %50, kalan için akıllı zarar durdur.`}
            />
          </div>
          <div className="text-[15px] font-bold font-mono" style={{ color: 'var(--jade)' }}>
            {fmt(plan.tp)}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            Kâr: %{plan.entry && plan.tp ? Math.abs((plan.tp - plan.entry) / plan.entry * 100).toFixed(1) : '—'}
          </div>
        </div>
      </div>

      {/* When to enter / when to exit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <div
          className="rounded-lg p-2.5 text-[11.5px] leading-snug"
          style={{
            background: 'rgba(0, 201, 138, 0.05)',
            border: '1px solid rgba(0, 201, 138, 0.18)',
            color: 'var(--text-secondary)',
          }}
        >
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold mb-1"
            style={{ color: 'var(--jade)' }}
          >
            <Clock className="w-3 h-3" />
            Ne zaman girmeli?
          </div>
          <p>{plan.meta.entryRule}</p>
        </div>
        <div
          className="rounded-lg p-2.5 text-[11.5px] leading-snug"
          style={{
            background: 'rgba(255, 59, 70, 0.05)',
            border: '1px solid rgba(255, 59, 70, 0.18)',
            color: 'var(--text-secondary)',
          }}
        >
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold mb-1"
            style={{ color: 'var(--ember)' }}
          >
            <Clock className="w-3 h-3" />
            Ne zaman çıkmalı?
          </div>
          <p>{plan.meta.exitRule}</p>
        </div>
      </div>

      {showWhy && plan.meta.summary && (
        <div
          className="rounded-lg p-2.5 text-[11.5px] leading-snug flex items-start gap-2"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-main)',
            color: 'var(--text-muted)',
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold-400)' }} />
          <span>
            <strong style={{ color: 'var(--text-secondary)' }}>Neden bu sinyal?</strong> {plan.meta.summary}
            {!plan.isExplicit && (
              <span style={{ color: 'var(--text-faint)' }}>
                {' '}— Giriş/Zarar Durdur/Kâr Al değerleri standart risk yönetimine göre hesaplandı (%3 risk, kazanç ihtimali zarardan ~{plan.rrRatio} kat fazla).
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
