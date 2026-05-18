/**
 * Opportunity List Modal — anasayfa "Bugün X fırsat bulduk" satırı tıklanınca açılır.
 *
 * Üst satırdaki sayı sadece adet gösteriyordu — kullanıcı listeyi göremiyordu. Bu modal:
 *   • Snapshot'taki TÜM trend + reversion sinyallerini tek listede gösterir
 *   • Tümü / AL / SAT filtresi
 *   • Her satır: sıra · sembol · yön · grade · strateji · skor · "neden" özeti
 *   • Satıra tıklayınca üst pencerede DecisionDetailModal açılır (z-index stack)
 */

import { useEffect, useMemo, useState } from 'react'
import { X, ChevronRight, TrendingUp, RotateCcw, Search } from 'lucide-react'

const DIRECTION_STYLES = {
  long:  { label: 'AL',  rgb: '0, 201, 138' },
  short: { label: 'SAT', rgb: '255, 59, 70' },
}

const GRADE_STYLES = {
  MUKEMMEL: { label: 'Mükemmel', rgb: '0, 201, 138' },
  GUCLU:    { label: 'Güçlü',    rgb: '56, 189, 248' },
  ORTA:     { label: 'Orta',     rgb: '212, 175, 55' },
  ZAYIF:    { label: 'Zayıf',    rgb: '148, 163, 184' },
}

const STRATEGY_ICON = {
  trend:     { Icon: TrendingUp, label: 'Trend Takip' },
  reversion: { Icon: RotateCcw,  label: 'Reversion' },
}

function flattenSnapshot(snapshot) {
  const phase = snapshot?.revision || snapshot?.premarket
  return [
    ...((phase?.trend?.signals) || []),
    ...((phase?.reversion?.signals) || []),
  ]
}

function topReason(sig) {
  const r = (sig.conditions || []).find(c => c.met && c.applicable)
  return r?.label || null
}

export default function OpportunityListModal({ snapshot, onClose, onPick }) {
  const [filter, setFilter] = useState('all') // 'all' | 'long' | 'short'
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const all = useMemo(() => flattenSnapshot(snapshot), [snapshot])

  const counts = useMemo(() => ({
    all:   all.length,
    long:  all.filter(s => s.direction === 'long').length,
    short: all.filter(s => s.direction === 'short').length,
  }), [all])

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    return all
      .filter(s => filter === 'all' ? true : s.direction === filter)
      .filter(s => q ? (s.symbol?.toUpperCase().includes(q) || s.name?.toUpperCase().includes(q)) : true)
      .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0) || (b.ratio || 0) - (a.ratio || 0))
  }, [all, filter, query])

  // Satır tıklanırsa: detay modal'ı için tone'u direction'dan türet (long=long, short=short).
  // cardTitle: bu satırın hangi "kart kategorisi"ne ait olduğunu açıklayan başlık.
  const handlePick = (sig) => {
    const tone = sig.direction === 'short' ? 'short' : 'long'
    const title = sig.direction === 'short' ? 'Riskli Bölge'
      : sig.strategy === 'reversion' ? 'Reversion Fırsatı' : 'AL Fırsatı'
    onPick(sig, tone, title)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bugünün fırsat listesi"
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] overflow-hidden flex flex-col rounded-t-2xl sm:rounded-2xl border"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-gold)',
          boxShadow: 'var(--shadow-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient top bar */}
        <div
          aria-hidden="true"
          className="h-[3px] w-full flex-shrink-0"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.85) 50%, transparent)' }}
        />

        {/* Header */}
        <div className="p-4 sm:p-5 flex items-start justify-between gap-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-main)' }}>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Bugünün <span style={{ color: 'var(--gold-400)' }}>{counts.all}</span> Fırsatı
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              BIST100 taraması — her sinyal koşullarla puanlandı. Detay için satıra tıkla.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter satırı */}
        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border-main)' }}>
          {[
            { id: 'all',   label: 'Tümü',    rgb: '212, 175, 55' },
            { id: 'long',  label: 'AL',      rgb: '0, 201, 138' },
            { id: 'short', label: 'SAT',     rgb: '255, 59, 70' },
          ].map(t => {
            const active = filter === t.id
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-all"
                style={{
                  background: active ? `rgba(${t.rgb}, 0.18)` : 'var(--bg-elevated)',
                  borderColor: active ? `rgba(${t.rgb}, 0.5)` : 'var(--border-main)',
                  color: active ? `rgba(${t.rgb}, 1)` : 'var(--text-muted)',
                }}
              >
                {t.label}
                <span className="ml-1.5 text-[10px]" style={{ color: active ? `rgba(${t.rgb}, 0.9)` : 'var(--text-faint)' }}>
                  {counts[t.id]}
                </span>
              </button>
            )
          })}

          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-1 sm:flex-initial sm:min-w-[180px]"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-main)' }}
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sembol ara..."
              className="flex-1 bg-transparent outline-none text-[12px] min-w-0"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-3 py-2">
          {filtered.length === 0 ? (
            <div className="py-10 text-center" style={{ color: 'var(--text-faint)' }}>
              <p className="text-[13px]">Bu filtreyle eşleşen fırsat yok.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((sig, idx) => {
                const dir = DIRECTION_STYLES[sig.direction] || DIRECTION_STYLES.long
                const grade = GRADE_STYLES[sig.grade] || GRADE_STYLES.ZAYIF
                const strat = STRATEGY_ICON[sig.strategy] || STRATEGY_ICON.trend
                const StratIcon = strat.Icon
                const reason = topReason(sig)
                return (
                  <li key={`${sig.symbol}-${sig.strategy}-${idx}`}>
                    <button
                      onClick={() => handlePick(sig)}
                      className="w-full text-left rounded-xl p-3 border transition-all flex items-center gap-3"
                      style={{
                        background: 'var(--bg-elevated)',
                        borderColor: 'var(--border-main)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = `rgba(${dir.rgb}, 0.06)`
                        e.currentTarget.style.borderColor = `rgba(${dir.rgb}, 0.32)`
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--bg-elevated)'
                        e.currentTarget.style.borderColor = 'var(--border-main)'
                      }}
                    >
                      <span
                        className="text-[11px] font-mono font-semibold w-6 text-center flex-shrink-0"
                        style={{ color: 'var(--text-faint)' }}
                      >
                        #{idx + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[14px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                            {sig.symbol}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full border font-bold"
                            style={{
                              background: `rgba(${dir.rgb}, 0.10)`,
                              borderColor: `rgba(${dir.rgb}, 0.35)`,
                              color: `rgba(${dir.rgb}, 1)`,
                            }}
                          >
                            {dir.label}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider"
                            style={{
                              background: `rgba(${grade.rgb}, 0.10)`,
                              borderColor: `rgba(${grade.rgb}, 0.35)`,
                              color: `rgba(${grade.rgb}, 1)`,
                            }}
                          >
                            {grade.label}
                          </span>
                          <span
                            className="text-[10px] inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
                            style={{ background: 'var(--bg-card)', color: 'var(--text-muted)' }}
                          >
                            <StratIcon className="w-2.5 h-2.5" />
                            {strat.label}
                          </span>
                        </div>
                        {(sig.name && sig.name !== sig.symbol) && (
                          <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-faint)' }}>
                            {sig.name}
                          </p>
                        )}
                        {reason && (
                          <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            <span style={{ color: 'var(--gold-400)' }}>›</span> {reason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-[16px] font-bold leading-none font-mono" style={{ color: 'var(--text-primary)' }}>
                            {sig.totalScore}
                          </div>
                          <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                            / {sig.applicableMax}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Alt footer — açıklama */}
        <div
          className="px-4 sm:px-5 py-3 border-t text-[10.5px] flex-shrink-0"
          style={{ borderColor: 'var(--border-main)', color: 'var(--text-faint)' }}
        >
          Skor = geçen koşul sayısı / uygulanabilir koşul. Listeleme skora göre büyükten küçüğe sıralı.
        </div>
      </div>
    </div>
  )
}
