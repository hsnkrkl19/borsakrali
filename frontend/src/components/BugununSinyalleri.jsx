/**
 * Bugünün Sinyalleri v2 — Borsa Krali
 *
 * İki ayrı strateji yan yana sunulur:
 *   • Trend Takip (ana strateji) — Combo + EMA + indikatör momentum, market entry
 *   • Reversion (deneysel)       — SNR pullback bekleyen, zone entry
 *
 * Top-10 her zaman görünür; "Tümünü Gör" tıklanınca allSignals açılır.
 * Her sinyal kartında: skor, koşullar, tarih, mesafe, revision sebep baloncuğu.
 */

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, Info, AlertCircle, CheckCircle2, Sparkles, Target, TrendingUp, RotateCcw } from 'lucide-react'
import api from '../services/api'

// ── Görsel paletler ──────────────────────────────────────────────────────
const REASON_STYLES = {
  unchanged:       { bg: 'bg-gray-500/10',    border: 'border-gray-500/30',    text: 'text-gray-300',    icon: '=' },
  recalculated:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    text: 'text-blue-300',    icon: '↻' },
  technical_shift: { bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30',  text: 'text-yellow-300',  icon: '⚙' },
  direction_flip:  { bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  text: 'text-orange-300',  icon: '↔' },
  dropped:         { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-300',     icon: '✕' },
  new:             { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', icon: '＋' },
  news_correlated: { bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  text: 'text-purple-300',  icon: '📰' },
}

const GRADE_STYLES = {
  MUKEMMEL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  GUCLU:    'bg-sky-500/20    text-sky-300    border-sky-500/40',
  ORTA:     'bg-amber-500/20  text-amber-300  border-amber-500/40',
  ZAYIF:    'bg-gray-500/20   text-gray-300   border-gray-500/40',
}

// Backtest tabanlı güven bandı — sinyale signalConfidenceService.enrichSignal ile eklenir.
const CONFIDENCE_STYLES = {
  high:    { label: 'Yüksek Güven', short: 'Yüksek', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: '✓' },
  mid:     { label: 'Orta Güven',   short: 'Orta',   cls: 'bg-amber-500/15   text-amber-300   border-amber-500/30',   icon: '~' },
  low:     { label: 'Düşük Güven',  short: 'Düşük',  cls: 'bg-rose-500/15    text-rose-300    border-rose-500/30',    icon: '!' },
  unknown: { label: 'Veri Toplanıyor', short: 'Yeni', cls: 'bg-gray-500/15   text-gray-400    border-gray-500/30',    icon: '?' },
}

const DIRECTION_STYLES = {
  long:  { label: '↑ AL',  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  short: { label: '↓ SAT', color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30' },
}

const STRATEGY_META = {
  trend: {
    label: 'Trend Takip',
    sub: 'Momentum + Market Entry',
    icon: TrendingUp,
    color: 'emerald',
    description: 'Combo + EMA + indikatör momentum. Şu anki fiyattan AL/SAT — tetik anında.',
    isExperimental: false,
  },
  reversion: {
    label: 'Reversion',
    sub: 'SNR Pullback (deneysel)',
    icon: RotateCcw,
    color: 'amber',
    description: 'SNR support/resistance zone\'una geri çekilmede tepki bekler. Pullback zorunlu.',
    isExperimental: true,
  },
}

const GROUP_LABELS = {
  trend: 'Trend',
  pa: 'Fiyat Hareketi',
  ind: 'İndikatörler',
  combo: 'Combo',
  harm: 'Harmonik',
  sust: 'Geçerlilik',
  news: 'Haber',
}

export default function BugununSinyalleri() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [activeStrategy, setActiveStrategy] = useState('trend') // 'trend' | 'reversion'
  const [showAll, setShowAll] = useState(false)
  const [expandedSymbol, setExpandedSymbol] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/daily-signals/today')
      setData(r.data)
    } catch (e) {
      setData({ premarket: null, revision: null, intraday: [], reasons: {} })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const triggerGenerate = async (phase) => {
    setGenerating(true)
    try { await api.post('/daily-signals/generate', { phase }); await load() }
    finally { setGenerating(false) }
  }

  // En güncel faz: revision varsa onu, yoksa premarket
  const phase = data?.revision || data?.premarket
  const phaseLabel = data?.revision ? '11:00 Revize' : data?.premarket ? '09:55 Pre-Market' : null
  const reasons = data?.reasons || {}

  // Aktif strateji bloğu
  const block = phase?.[activeStrategy] || null
  const signals = block?.signals || []
  const allSignals = block?.allSignals || []
  const diff = block?.diff || []
  const diffMap = new Map(diff.map(d => [d.symbol, d]))

  const visible = showAll ? allSignals : signals
  const droppedItems = diff.filter(d => d.status === 'dropped')

  if (loading) {
    return (
      <div className="card p-8 text-center">
        <RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-400">Bugünün sinyalleri yükleniyor...</p>
      </div>
    )
  }

  if (!phase) {
    return (
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-gold-400" />
          <div>
            <h3 className="text-white font-bold">Bugün için henüz sinyal üretilmedi</h3>
            <p className="text-xs text-gray-400">09:55'te pre-market sinyalleri otomatik üretilir. Şimdi manuel başlatabilirsin.</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => triggerGenerate('premarket')} disabled={generating}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
            {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Pre-Market Üret
          </button>
          <button onClick={() => triggerGenerate('revision')} disabled={generating}
            className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50">
            <RefreshCw className="w-4 h-4" />
            Revize Üret
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Üst başlık + Strateji toggle ───────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-gold-400" />
            <div>
              <h3 className="text-white font-bold flex items-center gap-2 flex-wrap">
                Bugünün Sinyalleri
                <span className="text-xs px-2 py-0.5 rounded-full bg-dark-700 text-gray-300">{phaseLabel}</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Üretildi: {new Date(phase.generatedAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                {' · '}Trend: {phase.trend?.signals?.length || 0} · Reversion: {phase.reversion?.signals?.length || 0}
              </p>
            </div>
          </div>
          <button onClick={() => triggerGenerate('revision')} disabled={generating}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Strateji toggle butonları */}
        <div className="grid grid-cols-2 gap-2">
          {['trend', 'reversion'].map(strat => {
            const meta = STRATEGY_META[strat]
            const Icon = meta.icon
            const isActive = activeStrategy === strat
            const count = phase[strat]?.signals?.length || 0
            return (
              <button
                key={strat}
                onClick={() => { setActiveStrategy(strat); setShowAll(false); setExpandedSymbol(null) }}
                className={`p-3 rounded-xl border-2 transition-all text-left ${
                  isActive
                    ? `bg-${meta.color}-500/15 border-${meta.color}-500/50`
                    : 'bg-dark-800 border-dark-700 hover:border-dark-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? `text-${meta.color}-400` : 'text-gray-400'}`} />
                    <span className={`text-sm font-bold whitespace-nowrap ${isActive ? 'text-white' : 'text-gray-300'}`}>{meta.label}</span>
                    {meta.isExperimental && (
                      <span className="hidden sm:inline-block text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30 uppercase flex-shrink-0">deney</span>
                    )}
                  </div>
                  <span className={`text-lg font-bold flex-shrink-0 ${isActive ? `text-${meta.color}-300` : 'text-gray-500'}`}>{count}</span>
                </div>
                {meta.isExperimental && (
                  <span className="sm:hidden inline-block text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30 uppercase mb-1">deney</span>
                )}
                <p className="text-[10px] text-gray-500 leading-relaxed">{meta.sub}</p>
              </button>
            )
          })}
        </div>

        {/* Diff özeti */}
        {diff.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-700">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Revize özeti:</span>
            {Object.entries(
              diff.reduce((m, d) => { m[d.status] = (m[d.status] || 0) + 1; return m }, {})
            ).map(([code, count]) => {
              const style = REASON_STYLES[code] || REASON_STYLES.unchanged
              const lbl = reasons[code]?.label || code
              return (
                <span key={code} className={`text-[10px] px-2 py-0.5 rounded-full border ${style.bg} ${style.border} ${style.text}`}>
                  {style.icon} {lbl}: {count}
                </span>
              )
            })}
          </div>
        )}

        {/* Strateji açıklama şeridi */}
        <div className="flex items-start gap-2 p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg text-[11px]">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-gray-400 leading-relaxed">
            <span className="text-white">{STRATEGY_META[activeStrategy].label}:</span>{' '}
            {STRATEGY_META[activeStrategy].description} 10 koşul üzerinden puanlanır (her geçtiği koşul = +1 puan).
            Sinyaller <span className="text-white">09:55</span> öncesi ve <span className="text-white">11:00</span>'de yeniden üretilir.
            {STRATEGY_META[activeStrategy].isExperimental && (
              <span className="text-amber-300"> ⚠ Deneysel — backtest sonuçları zayıf, dikkatli kullan.</span>
            )}
          </p>
        </div>
      </div>

      {/* ── Sinyal listesi ──────────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-400">Bu strateji için bugün sinyal yok.</p>
          <p className="text-xs text-gray-500 mt-1">Diğer stratejiyi deneyebilirsin.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((sig, idx) => (
            <SignalCard
              key={sig.symbol + idx}
              sig={sig}
              rank={idx + 1}
              diff={diffMap.get(sig.symbol)}
              reasonsCatalog={reasons}
              expanded={expandedSymbol === sig.symbol}
              onToggle={() => setExpandedSymbol(expandedSymbol === sig.symbol ? null : sig.symbol)}
            />
          ))}

          {!showAll && allSignals.length > signals.length && (
            <button onClick={() => setShowAll(true)}
              className="w-full py-3 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-xl text-sm text-gray-300 flex items-center justify-center gap-2 transition-colors">
              <ChevronDown className="w-4 h-4" />
              Tüm {allSignals.length} {STRATEGY_META[activeStrategy].label} sinyalini gör (top {signals.length} dışındakiler)
            </button>
          )}
          {showAll && (
            <button onClick={() => setShowAll(false)}
              className="w-full py-2 text-xs text-gray-500 hover:text-white flex items-center justify-center gap-1">
              <ChevronUp className="w-3 h-3" />
              Sadece top {signals.length} göster
            </button>
          )}
        </div>
      )}

      {/* ── Düşen sinyaller ─────────────────────────────────────────────── */}
      {droppedItems.length > 0 && (
        <div className="card p-4 space-y-3 border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <h4 className="text-sm font-semibold text-white">Düşen Sinyaller (09:55'te vardı, 11:00'da yok)</h4>
            <span className="text-xs text-red-300 ml-auto">{droppedItems.length} hisse</span>
          </div>
          <div className="space-y-1.5">
            {droppedItems.map(d => (
              <div key={d.symbol} className="flex items-center gap-3 text-xs p-2 bg-dark-800/50 rounded-lg">
                <span className="font-bold text-gray-300 w-16">{d.symbol}</span>
                <span className="text-gray-500 flex-1">{d.detail}</span>
                {d.prev && <span className="text-[10px] text-gray-600">Eski skor: {d.prev.totalScore}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tekil sinyal kartı ─────────────────────────────────────────────────────
function SignalCard({ sig, rank, diff, reasonsCatalog, expanded, onToggle }) {
  const dir = DIRECTION_STYLES[sig.direction] || DIRECTION_STYLES.long
  const gradeColor = GRADE_STYLES[sig.grade] || GRADE_STYLES.ZAYIF
  const confStyle = CONFIDENCE_STYLES[sig.confidence] || CONFIDENCE_STYLES.unknown
  const reasonStyle = diff ? (REASON_STYLES[diff.status] || REASON_STYLES.unchanged) : null
  const reasonLabel = diff ? (reasonsCatalog[diff.status]?.label || diff.status) : null

  const conditionsByGroup = {}
  for (const c of (sig.conditions || [])) {
    if (!c.applicable) continue
    conditionsByGroup[c.group] = conditionsByGroup[c.group] || []
    conditionsByGroup[c.group].push(c)
  }

  // "Neden bu sinyal" — geçen ilk 3 koşulu seç (özet için)
  const topReasons = (sig.conditions || [])
    .filter(c => c.met && c.applicable)
    .slice(0, 3)
    .map(c => c.label)

  const fillBadge = sig.fillMode === 'market'
    ? { label: 'Market Entry', desc: 'Şu anki fiyattan al — anında tetik', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' }
    : { label: 'Zone Entry',   desc: 'Fiyat zone\'a gelince tetiklenir',  cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' }

  return (
    <div className={`card border-2 ${expanded ? 'border-gold-500/40' : 'border-dark-700'} transition-colors`}>
      <div className="cursor-pointer" onClick={onToggle}>
        {/* Üst satır — sembol, aksiyon, puan */}
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-gray-500 font-bold w-6 text-center text-sm flex-shrink-0">#{rank}</span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-white">{sig.symbol}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${dir.bg} ${dir.border} ${dir.color}`}>
                {dir.label}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${gradeColor}`}>
                {sig.grade}
              </span>
              {/* Backtest tabanlı güven badge'i — historicalWinRate varsa winRate'i de göster */}
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1 ${confStyle.cls}`}
                title={
                  sig.historicalWinRate != null
                    ? `Geçmiş başarı %${sig.historicalWinRate} (${sig.sampleSize ?? 0} örnek). Bu sinyalin koşul kümesi backtestte bu kadarını hedefe ulaştırdı.`
                    : 'Bu strateji için henüz yeterli backtest örneklemi yok. Cron Pazar 03:00\'da günceller.'
                }
              >
                <span>{confStyle.icon}</span>
                <span>
                  {sig.historicalWinRate != null ? `%${sig.historicalWinRate} · ${confStyle.short}` : confStyle.short}
                </span>
              </span>
            </div>
            {sig.name && sig.name !== sig.symbol && (
              <p className="text-[10px] text-gray-500 truncate mt-0.5">{sig.name}</p>
            )}
          </div>

          <div className="text-right flex-shrink-0">
            <div className="text-xl sm:text-2xl font-bold text-white leading-none">{sig.totalScore}</div>
            <div className="text-[9px] sm:text-[10px] text-gray-500 mt-0.5">/ {sig.applicableMax} koşul</div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        </div>

        {/* İkincil satır — sekonder rozetler */}
        {(fillBadge.label || (reasonStyle && reasonLabel)) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-2 ml-8">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${fillBadge.cls}`} title={fillBadge.desc}>
              {fillBadge.label}
            </span>
            {reasonStyle && reasonLabel && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full border ${reasonStyle.bg} ${reasonStyle.border} ${reasonStyle.text} flex items-center gap-1`}
                title={diff?.detail}>
                <span>{reasonStyle.icon}</span>
                <span>{reasonLabel}</span>
              </span>
            )}
          </div>
        )}

        {/* Fiyat satırı — Giriş / Stop / Hedef / R/R / mesafe */}
        <div className="flex items-center gap-x-3 gap-y-1 mt-2 ml-8 text-[11px] text-gray-400 flex-wrap">
          {sig.entry != null && (
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              Giriş: <span className="text-white font-mono">{sig.entry?.toFixed(2)}</span>
            </span>
          )}
          {sig.stop != null && (
            <span className="text-red-300">Stop: <span className="font-mono">{sig.stop.toFixed(2)}</span></span>
          )}
          {sig.target != null && (
            <span className="text-emerald-300">Hedef: <span className="font-mono">{sig.target.toFixed(2)}</span></span>
          )}
          {sig.riskReward != null && (
            <span className="text-sky-300" title="Reward/Risk oranı — kazanç potansiyeli stop riskinin kaç katı">
              R/R: <span className="font-mono">{sig.riskReward.toFixed(2)}</span>
            </span>
          )}
          {sig.bestZone?.priceDistancePct != null && (
            <span>🎯 %{sig.bestZone.priceDistancePct} uzakta</span>
          )}
          {sig.bestZone?.pivotDate && (
            <span className="text-gray-500">📅 {sig.bestZone.pivotDate}{sig.bestZone.daysAgo != null && ` (${sig.bestZone.daysAgo}g)`}</span>
          )}
        </div>

        {/* "Neden bu sinyal" — 3 ana koşul, tıklamadan görünsün */}
        {topReasons.length > 0 && (
          <div className="mt-2 ml-8 flex items-start gap-1.5 text-[10px] text-gray-400">
            <span className="text-gold-400/80 font-semibold uppercase tracking-wider whitespace-nowrap pt-0.5">Neden:</span>
            <span className="leading-relaxed">{topReasons.join(' · ')}</span>
          </div>
        )}
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-dark-700 space-y-3">
          {/* Diff baloncuk detayı */}
          {diff && (
            <div className={`p-3 rounded-lg border ${reasonStyle?.bg || ''} ${reasonStyle?.border || ''} text-xs`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-base ${reasonStyle?.text}`}>{reasonStyle?.icon}</span>
                <span className={`font-bold ${reasonStyle?.text}`}>{reasonLabel}</span>
              </div>
              <p className="text-gray-300 leading-relaxed">{diff.detail}</p>
              {(diff.scoreDelta != null || diff.entryDelta != null) && (
                <div className="flex gap-4 mt-2 text-[10px] text-gray-500">
                  {diff.scoreDelta != null && diff.scoreDelta !== 0 && (
                    <span>Puan: <span className={diff.scoreDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}>{diff.scoreDelta >= 0 ? '+' : ''}{diff.scoreDelta}</span></span>
                  )}
                  {diff.entryDelta != null && diff.entryDelta > 0 && (
                    <span>Giriş kayması: <span className="text-yellow-400">%{diff.entryDelta.toFixed(2)}</span></span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Koşullar gruplandı */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
              Geçen koşullar ({sig.totalScore} / {sig.applicableMax})
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {Object.entries(conditionsByGroup).map(([group, conds]) => (
                <div key={group} className="bg-dark-800/60 rounded-lg p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">{GROUP_LABELS[group] || group}</p>
                  <div className="space-y-1">
                    {conds.map(c => (
                      <div key={c.id} className="flex items-start gap-1.5 text-[11px]" title={c.why}>
                        {c.met
                          ? <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                          : <span className="w-3 h-3 rounded-full border border-gray-600 mt-0.5 flex-shrink-0" />}
                        <span className={c.met ? 'text-gray-200' : 'text-gray-600'}>{c.label}</span>
                        {c.required && <span className="text-[9px] text-amber-400 ml-1">*</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-gray-600 mt-1.5">* yıldızlı koşullar zorunludur — geçmezse strateji listede yer almaz.</p>
          </div>

          {/* Kaynak kartları */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
            {sig.bestZone && (
              <div className="bg-dark-800/60 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">SNR Zone</p>
                <p className="text-gray-300">{sig.bestZone.type === 'support' ? 'Destek' : 'Direnç'} · Skor {sig.bestZone.score}</p>
                <p className="text-gray-500 text-[10px] mt-0.5">{sig.bestZone.pivotDate} ({sig.bestZone.daysAgo}g önce)</p>
              </div>
            )}
            {sig.harmonic && (
              <div className="bg-dark-800/60 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Harmonik</p>
                <p className="text-gray-300">{sig.harmonic.pattern} · {sig.harmonic.direction}</p>
                <p className="text-gray-500 text-[10px] mt-0.5">Tamamlanma %{sig.harmonic.completion}</p>
              </div>
            )}
            {sig.combo && (
              <div className="bg-dark-800/60 rounded-lg p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Combo Strateji</p>
                <p className="text-gray-300">{sig.combo.name} · {sig.combo.tier}</p>
                <p className="text-gray-500 text-[10px] mt-0.5">{sig.combo.side === 'boga' ? 'Boğa' : sig.combo.side === 'ayi' ? 'Ayı' : 'Nötr'}</p>
              </div>
            )}
          </div>

          {/* Haber */}
          {sig.news?.latest && (
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-2.5 text-[11px]">
              <p className="text-[10px] uppercase tracking-wider text-purple-300 mb-1">Son haber</p>
              <p className="text-gray-300 leading-relaxed">{sig.news.latest.title}</p>
              {sig.news.latest.publishedAt && (
                <p className="text-gray-500 text-[10px] mt-1">
                  {new Date(sig.news.latest.publishedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {sig.news.positive24h > 0 && <span className="ml-2 text-emerald-400">· {sig.news.positive24h} pozitif</span>}
                  {sig.news.negative24h > 0 && <span className="ml-2 text-red-400">· {sig.news.negative24h} negatif</span>}
                </p>
              )}
            </div>
          )}

          {/* Stop / Hedef kutuları + R/R */}
          {(sig.stop != null || sig.target != null) && (
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-500">▶ GİRİŞ</p>
                <p className="font-mono font-bold text-blue-300">{sig.entry?.toFixed(2)}</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-500">✕ STOP</p>
                <p className="font-mono font-bold text-red-300">{sig.stop?.toFixed(2) ?? '—'}</p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-500">★ HEDEF</p>
                <p className="font-mono font-bold text-emerald-300">{sig.target?.toFixed(2) ?? '—'}</p>
              </div>
              <div className="bg-sky-500/10 border border-sky-500/20 rounded-lg p-2 text-center">
                <p className="text-[10px] text-gray-500">↔ R/R</p>
                <p className="font-mono font-bold text-sky-300">{sig.riskReward?.toFixed(2) ?? '—'}</p>
              </div>
            </div>
          )}

          {/* Backtest tabanlı güven kartı */}
          <div className={`rounded-lg p-3 border text-xs ${confStyle.cls}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">{confStyle.icon}</span>
                <span className="font-bold">{confStyle.label}</span>
              </div>
              {sig.historicalWinRate != null && (
                <div className="flex items-center gap-3 text-[11px]">
                  <span title="Bu skor bantında geçmiş backtestlerde hedefe ulaşan sinyal oranı">
                    Win Rate: <span className="font-mono font-bold">%{sig.historicalWinRate}</span>
                  </span>
                  {sig.historicalAvgReturn != null && (
                    <span title="Ortalama getiri (tüm sinyaller, açık dahil)">
                      Ort. getiri: <span className="font-mono">{sig.historicalAvgReturn >= 0 ? '+' : ''}{sig.historicalAvgReturn}%</span>
                    </span>
                  )}
                  <span className="text-gray-400">Örnek: {sig.sampleSize ?? 0}</span>
                </div>
              )}
            </div>
            {sig.historicalWinRate == null && (
              <p className="text-[11px] opacity-80 mt-1.5">
                Bu strateji × skor kombinasyonu için yeterli backtest örneklemi yok. Pazar 03:00'da güncellenir.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
