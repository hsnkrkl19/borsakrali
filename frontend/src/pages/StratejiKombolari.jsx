import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import {
  Sparkles, RefreshCw, Search, TrendingUp, TrendingDown, Pause, Filter,
  Unlock, Rocket, Zap, Activity, Crosshair, ShieldCheck, Crown,
  Skull, CloudRain, AlertTriangle, ChevronsDown, ChevronDown, ChevronUp,
  Brain, Target, Award, Flame
} from 'lucide-react'
import { getApiBase } from '../config'

const API_BASE = getApiBase() + '/api'

// Icon registry — backend gönderdiği icon isimlerini lucide componentlerine eşler
const ICONS = {
  Unlock, Rocket, Sparkles, Zap, Activity, Crosshair, ShieldCheck, Crown,
  TrendingUp, TrendingDown, Skull, CloudRain, AlertTriangle, ChevronsDown, Pause,
}

const TIER_BADGE = {
  S: { label: 'S', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  A: { label: 'A', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  B: { label: 'B', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
}

const SIDE_STYLE = {
  boga: {
    border: 'border-amber-500/30',
    bg: 'from-amber-500/10 via-dark-900/60 to-dark-900/30',
    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    text: 'text-amber-300',
    label: 'BOĞA',
  },
  ayi: {
    border: 'border-rose-500/30',
    bg: 'from-rose-500/10 via-dark-900/60 to-dark-900/30',
    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    text: 'text-rose-300',
    label: 'AYI',
  },
  notr: {
    border: 'border-slate-500/30',
    bg: 'from-slate-500/10 via-dark-900/60 to-dark-900/30',
    chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    text: 'text-slate-300',
    label: 'NÖTR',
  },
}

const SCOPE_OPTIONS = [
  { id: 'bist30',  label: 'BIST30',  desc: 'Hızlı (30 hisse)',          hint: '~10 sn' },
  { id: 'bist100', label: 'BIST100', desc: 'Geniş (100 hisse)',         hint: '~30 sn', recommended: true },
  { id: 'all',     label: 'Tümü',    desc: 'Tüm BIST (~510 hisse)',     hint: '2-3 dk' },
]

export default function StratejiKombolari() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all') // all | boga | ayi | notr
  const [search, setSearch] = useState('')
  const [expandedCombo, setExpandedCombo] = useState(null)
  const [view, setView] = useState('combo') // combo | symbol | catalog
  const [scope, setScope] = useState('bist100')

  useEffect(() => { load(scope) }, [scope])

  const load = async (s = scope) => {
    try {
      setRefreshing(true)
      const res = await axios.get(`${API_BASE}/combo-strategies/scan`, { params: { scope: s } })
      setData(res.data)
    } catch (e) {
      console.error('Combo scan error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const filteredCombos = useMemo(() => {
    if (!data?.byCombo) return []
    return data.byCombo
      .filter(c => filter === 'all' || c.side === filter)
      .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.desc.toLowerCase().includes(search.toLowerCase()))
  }, [data, filter, search])

  const filteredSymbols = useMemo(() => {
    if (!data?.bySymbol) return []
    return data.bySymbol
      .filter(s => filter === 'all' || s.bias === filter)
      .filter(s => !search || s.symbol.toLowerCase().includes(search.toLowerCase()))
  }, [data, filter, search])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.08] via-dark-900/60 to-dark-900/30 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Brain className="w-6 h-6 text-dark-950" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Strateji Komboları</h1>
              <p className="text-xs sm:text-sm text-gray-400">TradingView tarzı çoklu indikatör birleşimleri — özgün isimlerle</p>
            </div>
          </div>
          <button
            onClick={() => load()}
            disabled={refreshing}
            className="px-3 py-2 rounded-xl text-sm font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Scope selector */}
        <div className="mt-4 flex flex-wrap gap-2">
          {SCOPE_OPTIONS.map(opt => {
            const isActive = scope === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => setScope(opt.id)}
                disabled={refreshing}
                className={`relative px-3 py-2 rounded-xl text-xs font-semibold border transition disabled:opacity-50 ${
                  isActive
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-lg shadow-amber-500/10'
                    : 'bg-dark-800/60 border-dark-700 text-gray-400 hover:text-white hover:border-dark-600'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold">{opt.label}</span>
                  {opt.recommended && !isActive && (
                    <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">ÖNERİ</span>
                  )}
                </div>
                <div className="text-[9px] mt-0.5 opacity-80">{opt.desc} · {opt.hint}</div>
              </button>
            )
          })}
        </div>

        {/* Stats */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            <Stat icon={Target} label="Taranan" value={data.totalScanned} color="slate" />
            <Stat icon={Sparkles} label="Sinyalli" value={data.withSignals} color="amber" />
            <Stat icon={TrendingUp} label="Boğa" value={data.bullishStocks} color="emerald" />
            <Stat icon={TrendingDown} label="Ayı" value={data.bearishStocks} color="rose" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-dark-900/60 border border-dark-700 rounded-2xl p-3 flex flex-wrap items-center gap-2">
        {/* View tabs */}
        <div className="flex gap-1 bg-dark-800/60 rounded-lg p-1">
          {[
            { id: 'combo', label: 'Combo Bazlı', icon: Sparkles },
            { id: 'symbol', label: 'Sembol Bazlı', icon: Target },
            { id: 'catalog', label: 'Katalog', icon: Award },
          ].map(t => {
            const I = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  view === t.id
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-dark-950'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <I className="w-3.5 h-3.5" /> {t.label}
              </button>
            )
          })}
        </div>

        {/* Side filter */}
        <div className="flex gap-1 bg-dark-800/60 rounded-lg p-1">
          {[
            { id: 'all', label: 'Hepsi' },
            { id: 'boga', label: '🐂 Boğa' },
            { id: 'ayi', label: '🐻 Ayı' },
            { id: 'notr', label: '⏸ Nötr' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition ${
                filter === f.id ? 'bg-dark-700 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search — DOĞRU PADDING (pl-9 ile icon'a 36px) */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/60 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Strateji veya sembol ara..."
            className="input-premium pl-9 !py-2 !text-sm w-full"
          />
        </div>
      </div>

      {/* Loading */}
      {(loading || refreshing) && (
        <div className="bg-dark-900/60 border border-dark-700 rounded-2xl p-8 text-center">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">
            {SCOPE_OPTIONS.find(s => s.id === scope)?.label || 'Liste'} taranıyor — her sembol 15 strateji + 5 indikatör birleşiminde değerlendiriliyor...
          </p>
          {scope === 'all' && (
            <p className="text-xs text-amber-400/70 mt-2">İlk taramada 2-3 dakika sürebilir. Sonuç 30 dk cache'lenir.</p>
          )}
        </div>
      )}

      {/* Combo View */}
      {!loading && view === 'combo' && (
        <div className="grid gap-3">
          {filteredCombos.map(c => (
            <ComboCard
              key={c.key}
              combo={c}
              expanded={expandedCombo === c.key}
              onToggle={() => setExpandedCombo(expandedCombo === c.key ? null : c.key)}
            />
          ))}
          {filteredCombos.length === 0 && (
            <div className="bg-dark-900/40 border border-dark-700 rounded-xl p-6 text-center text-sm text-gray-500">
              Bu filtreyle eşleşen strateji yok.
            </div>
          )}
        </div>
      )}

      {/* Symbol View */}
      {!loading && view === 'symbol' && (
        <div className="grid gap-3">
          {filteredSymbols.map(s => (
            <SymbolCard key={s.symbol} sym={s} />
          ))}
          {filteredSymbols.length === 0 && (
            <div className="bg-dark-900/40 border border-dark-700 rounded-xl p-6 text-center text-sm text-gray-500">
              Sinyal tetikleyen sembol yok.
            </div>
          )}
        </div>
      )}

      {/* Catalog View */}
      {!loading && view === 'catalog' && (
        <div className="grid sm:grid-cols-2 gap-3">
          {(data?.catalog || []).filter(c => filter === 'all' || c.side === filter).map(c => (
            <CatalogCard key={c.key} combo={c} />
          ))}
        </div>
      )}
    </div>
  )
}

// ───────────── Sub-components ─────────────

function Stat({ icon: Icon, label, value, color }) {
  const colorMap = {
    slate: 'border-slate-500/30 bg-slate-500/5 text-slate-300',
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
    emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
    rose: 'border-rose-500/30 bg-rose-500/5 text-rose-300',
  }
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${colorMap[color] || colorMap.slate}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-80">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-xl font-bold text-white mt-0.5">{value ?? '—'}</div>
    </div>
  )
}

function ComboCard({ combo, expanded, onToggle }) {
  const style = SIDE_STYLE[combo.side] || SIDE_STYLE.notr
  const tier = TIER_BADGE[combo.tier] || TIER_BADGE.B
  const Icon = ICONS[combo.icon] || Sparkles

  return (
    <div className={`rounded-2xl border ${style.border} bg-gradient-to-br ${style.bg} overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full text-left p-4 hover:bg-white/[0.02] transition"
      >
        <div className="flex items-start gap-3">
          <div className="text-3xl shrink-0">{combo.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white">{combo.name}</h3>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tier.cls}`}>{tier.label}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${style.chip} border`}>{style.label}</span>
              {combo.matchCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/10 text-white border border-white/20">
                  {combo.matchCount} EŞLEŞME
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{combo.desc}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {(combo.indicators || []).map(ind => (
                <span key={ind} className="text-[10px] px-2 py-0.5 rounded-full bg-dark-800/80 text-gray-400 border border-dark-600">
                  {ind}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-2.5 text-[11px]">
              {combo.success > 0 && <span className="text-emerald-400">✓ %{combo.success} başarı</span>}
              {combo.avgChange > 0 && <span className="text-amber-400">⌀ %{combo.avgChange}</span>}
              {combo.riskReward !== '—' && <span className="text-sky-400">R/R {combo.riskReward}</span>}
            </div>
          </div>
          <div className="shrink-0 self-center">
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>
      </button>

      {expanded && combo.matches && combo.matches.length > 0 && (
        <div className="border-t border-dark-700 p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-amber-400/80 font-bold flex items-center gap-1.5">
            <Flame className="w-3 h-3" /> Tetikleyen Semboller
          </div>
          {combo.matches.map(m => (
            <MatchRow key={m.symbol} match={m} side={combo.side} />
          ))}
        </div>
      )}
      {expanded && (!combo.matches || combo.matches.length === 0) && (
        <div className="border-t border-dark-700 p-4 text-xs text-gray-500 text-center">
          Şu anda BIST30'da bu kriteri karşılayan sembol yok.
        </div>
      )}
    </div>
  )
}

function MatchRow({ match, side }) {
  const style = SIDE_STYLE[side] || SIDE_STYLE.notr
  const dayChangeColor = match.dayChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
  return (
    <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{match.symbol}</span>
          <span className="text-xs text-gray-400">₺{match.lastPrice?.toFixed(2)}</span>
          <span className={`text-xs font-semibold ${dayChangeColor}`}>
            {match.dayChange >= 0 ? '+' : ''}{match.dayChange?.toFixed(2)}%
          </span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${style.chip} border`}>
          Skor {match.score?.toFixed(0)}
        </span>
      </div>
      {match.reasons && match.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {match.reasons.slice(0, 4).map((r, i) => (
            <li key={i} className="text-[11px] text-gray-400 leading-relaxed">• {r}</li>
          ))}
        </ul>
      )}
      {match.narrative && (
        <div className="mt-2 pt-2 border-t border-dark-700/60">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-400/70 font-bold mb-1">
            <Brain className="w-3 h-3" /> AI Yorum
          </div>
          <p className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-line">{match.narrative}</p>
        </div>
      )}
    </div>
  )
}

function SymbolCard({ sym }) {
  const style = SIDE_STYLE[sym.bias] || SIDE_STYLE.notr
  const dayChangeColor = sym.dayChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-2xl border ${style.border} bg-gradient-to-br ${style.bg} overflow-hidden`}>
      <button onClick={() => setOpen(!open)} className="w-full text-left p-4 hover:bg-white/[0.02] transition">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-dark-800/80 border border-dark-600 flex items-center justify-center text-sm font-bold text-white">
              {sym.symbol.slice(0, 4)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{sym.symbol}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${style.chip} border`}>{style.label}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-400">₺{sym.lastPrice?.toFixed(2)}</span>
                <span className={`text-xs font-semibold ${dayChangeColor}`}>
                  {sym.dayChange >= 0 ? '+' : ''}{sym.dayChange?.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {sym.hits.length} sinyal
            </span>
            {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-dark-700 p-3 space-y-2">
          {sym.hits.map(h => {
            const I = ICONS[h.icon] || Sparkles
            const hStyle = SIDE_STYLE[h.side] || SIDE_STYLE.notr
            return (
              <div key={h.key} className="rounded-xl border border-dark-700 bg-dark-900/40 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl">{h.emoji}</span>
                  <span className="text-sm font-bold text-white">{h.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${hStyle.chip} border`}>
                    Skor {h.score?.toFixed(0)}
                  </span>
                  <span className="text-[10px] text-gray-500">%{h.success} başarı · ⌀%{h.avgChange}</span>
                </div>
                {h.reasons && h.reasons.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {h.reasons.slice(0, 3).map((r, i) => (
                      <li key={i} className="text-[11px] text-gray-400 leading-relaxed">• {r}</li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          {sym.indicators && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 pt-2 border-t border-dark-700/60">
              {sym.indicators.rsi != null && <MiniStat label="RSI" value={sym.indicators.rsi?.toFixed(1)} />}
              {sym.indicators.adx != null && <MiniStat label="ADX" value={sym.indicators.adx?.toFixed(1)} />}
              {sym.indicators.ema21 != null && <MiniStat label="EMA21" value={sym.indicators.ema21?.toFixed(2)} />}
              {sym.indicators.ema50 != null && <MiniStat label="EMA50" value={sym.indicators.ema50?.toFixed(2)} />}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CatalogCard({ combo }) {
  const style = SIDE_STYLE[combo.side] || SIDE_STYLE.notr
  const tier = TIER_BADGE[combo.tier] || TIER_BADGE.B
  return (
    <div className={`rounded-2xl border ${style.border} bg-gradient-to-br ${style.bg} p-4`}>
      <div className="flex items-start gap-3">
        <div className="text-3xl">{combo.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white">{combo.name}</h3>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tier.cls}`}>{tier.label}</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">{combo.desc}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {(combo.indicators || []).map(ind => (
              <span key={ind} className="text-[10px] px-2 py-0.5 rounded-full bg-dark-800/80 text-gray-400 border border-dark-600">
                {ind}
              </span>
            ))}
          </div>
          {combo.success > 0 && (
            <div className="flex items-center gap-3 mt-2 text-[10px]">
              <span className="text-emerald-400">✓%{combo.success}</span>
              <span className="text-amber-400">⌀%{combo.avgChange}</span>
              <span className="text-sky-400">R/R {combo.riskReward}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg bg-dark-800/40 border border-dark-700 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-xs font-bold text-white">{value}</div>
    </div>
  )
}
