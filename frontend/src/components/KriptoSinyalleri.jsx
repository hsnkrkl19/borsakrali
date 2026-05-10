/**
 * Kripto Sinyalleri — Borsa Krali
 *
 * Top 100 coin için üç ayrı strateji:
 *   • Spot Long      — kaldıraçsız trend takip (4h + 1d)
 *   • Futures Long   — momentum patlaması (kırılım + funding fırsatı)
 *   • Futures Short  — bozulan trend (RSI overbought + EMA stack ters)
 *
 * Her strateji 10 koşul üzerinden puanlanır. CoinGecko + Binance public
 * API'leri ile çalışır; yahoo-finance2 kullanılmaz.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  RefreshCw, ChevronDown, ChevronUp, Sparkles, TrendingUp, TrendingDown,
  Coins, Info, Zap, Target, Shield, AlertCircle, CheckCircle2, ExternalLink, Clock,
} from 'lucide-react'
import api from '../services/api'

// ── Stil katalogları ──────────────────────────────────────────────────────
const GRADE_STYLES = {
  MUKEMMEL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  GUCLU:    'bg-sky-500/20    text-sky-300    border-sky-500/40',
  ORTA:     'bg-amber-500/20  text-amber-300  border-amber-500/40',
  ZAYIF:    'bg-gray-500/20   text-gray-300   border-gray-500/40',
}

const STRATEGY_META = {
  spot_long: {
    label: 'Spot Long',
    sub: 'Kaldıraçsız trend takip',
    icon: TrendingUp,
    color: 'emerald',
    description: '1D EMA stack + RSI sağlıklı + 4H trend uyumu. Spot al-tut, kaldıraçsız.',
  },
  futures_long: {
    label: 'Futures Long',
    sub: 'Momentum + funding fırsatı',
    icon: Sparkles,
    color: 'sky',
    description: '4H kırılım + hacim patlaması + funding rate avantajı. Kaldıraçlı agresif long.',
  },
  futures_short: {
    label: 'Futures Short',
    sub: 'Bozulan trend, hacimli düşüş',
    icon: TrendingDown,
    color: 'rose',
    description: 'RSI overbought\'tan dönüş + EMA stack ters + 4H lower-low. Kaldıraçlı short.',
  },
}

const GROUP_LABELS = {
  trend: 'Trend',
  pa:    'Fiyat Hareketi',
  ind:   'İndikatörler',
  fund:  'Funding',
}

// USD fiyat formatı — kripto fiyatları çok geniş aralıkta
function formatUsd(value) {
  if (value == null) return '—'
  const v = Number(value)
  if (!isFinite(v)) return '—'
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (v >= 10) return `$${v.toFixed(3)}`
  if (v >= 1) return `$${v.toFixed(4)}`
  if (v >= 0.01) return `$${v.toFixed(5)}`
  return `$${v.toFixed(8)}`
}

function formatPct(value, digits = 2) {
  if (value == null) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export default function KriptoSinyalleri() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeStrategy, setActiveStrategy] = useState('spot_long')
  const [showAll, setShowAll] = useState(false)
  const [expandedSymbol, setExpandedSymbol] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/market/crypto/signals')
      setData(r.data)
    } catch (e) {
      // 503: ilk istek; cron henüz çalışmamış olabilir, kısa süre sonra dener
      const status = e.response?.status
      if (status === 503) {
        setData({ pending: true })
      } else {
        setData({ error: e.response?.data?.error || e.message })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await api.post('/market/crypto/generate', { phase: 'intraday' })
      await load()
    } catch (e) {
      // sessiz
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="card p-8 text-center">
        <RefreshCw className="w-6 h-6 text-gold-400 animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-400">Kripto sinyalleri yükleniyor...</p>
      </div>
    )
  }

  if (data?.pending) {
    return (
      <div className="card p-8 text-center space-y-3">
        <Clock className="w-8 h-8 text-amber-400 mx-auto" />
        <h3 className="text-white font-bold">Kripto sinyalleri hazırlanıyor</h3>
        <p className="text-xs text-gray-400 max-w-md mx-auto">
          İlk üretim CoinGecko + Binance verilerini topluyor. Bu işlem 1-2 dakika sürer.
        </p>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-50"
        >
          {refreshing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Şimdi üret
        </button>
      </div>
    )
  }

  if (data?.error) {
    return (
      <div className="card p-6 text-center">
        <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-300">{data.error}</p>
        <button onClick={load} className="btn-secondary text-xs mt-3">Tekrar dene</button>
      </div>
    )
  }

  const block = data?.[activeStrategy] || null
  const signals = block?.signals || []
  const allSignals = block?.allSignals || []
  const visible = showAll ? allSignals : signals

  return (
    <div className="space-y-4">
      {/* ── Üst başlık ────────────────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Coins className="w-6 h-6 text-gold-400" />
            <div>
              <h3 className="text-white font-bold flex items-center gap-2 flex-wrap">
                Kripto Sinyalleri
                {data?.phase && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-dark-700 text-gray-300 capitalize">
                    {data.phase}
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {data?.generatedAt
                  ? `Üretildi: ${new Date(data.generatedAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`
                  : '—'}
                {data?.analyzedCount != null && ` · ${data.analyzedCount}/${data.tradableCount || data.universeSize || 100} coin analiz edildi`}
              </p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* ── Strateji seçici (3 sekme) ──────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {['spot_long', 'futures_long', 'futures_short'].map(strat => {
            const meta = STRATEGY_META[strat]
            const Icon = meta.icon
            const isActive = activeStrategy === strat
            const count = data?.[strat]?.signals?.length || 0
            return (
              <button
                key={strat}
                onClick={() => { setActiveStrategy(strat); setShowAll(false); setExpandedSymbol(null) }}
                className={`p-2.5 sm:p-3 rounded-xl border-2 transition-all text-left ${
                  isActive
                    ? `bg-${meta.color}-500/15 border-${meta.color}-500/50`
                    : 'bg-dark-800 border-dark-700 hover:border-dark-600'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${isActive ? `text-${meta.color}-400` : 'text-gray-400'}`} />
                    <span className={`text-xs sm:text-sm font-bold truncate ${isActive ? 'text-white' : 'text-gray-300'}`}>{meta.label}</span>
                  </div>
                  <span className={`text-base sm:text-lg font-bold flex-shrink-0 ${isActive ? `text-${meta.color}-300` : 'text-gray-500'}`}>{count}</span>
                </div>
                <p className="text-[9px] sm:text-[10px] text-gray-500 leading-relaxed truncate">{meta.sub}</p>
              </button>
            )
          })}
        </div>

        {/* ── Strateji açıklama şeridi ──────────────────────────────── */}
        <div className="flex items-start gap-2 p-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg text-[11px]">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-gray-400 leading-relaxed">
            <span className="text-white">{STRATEGY_META[activeStrategy].label}:</span>{' '}
            {STRATEGY_META[activeStrategy].description}{' '}
            10 koşul üzerinden puanlanır. Sinyaller her gün <span className="text-white">09:00, 13:00, 19:00, 01:00</span>'de yenilenir; ara güncellemeler 30 dakikada bir.
          </p>
        </div>
      </div>

      {/* ── Sinyal listesi ──────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-gray-400">Bu strateji için şu an sinyal yok.</p>
          <p className="text-xs text-gray-500 mt-1">Diğer stratejileri deneyebilirsin.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((sig, idx) => (
            <CoinCard
              key={sig.symbol + idx}
              sig={sig}
              rank={idx + 1}
              strategy={activeStrategy}
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
    </div>
  )
}

// ─── Coin sinyal kartı ────────────────────────────────────────────────────
function CoinCard({ sig, rank, strategy, expanded, onToggle }) {
  const isLong = sig.direction === 'long'
  const dirStyle = isLong
    ? { label: '↑ LONG', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
    : { label: '↓ SHORT', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' }
  const gradeColor = GRADE_STYLES[sig.grade] || GRADE_STYLES.ZAYIF

  // Skor gauge — totalScore / 10
  const ratio = sig.totalScore / (sig.applicableMax || 10)
  const gaugeColor = ratio >= 0.7 ? 'bg-emerald-500'
                  : ratio >= 0.5 ? 'bg-sky-500'
                  : ratio >= 0.3 ? 'bg-amber-500' : 'bg-gray-500'

  // Koşulları gruplara ayır
  const conditionsByGroup = {}
  for (const c of (sig.conditions || [])) {
    if (!c.applicable) continue
    conditionsByGroup[c.group] = conditionsByGroup[c.group] || []
    conditionsByGroup[c.group].push(c)
  }

  return (
    <div className={`card border-2 ${expanded ? 'border-gold-500/40' : 'border-dark-700'} transition-colors`}>
      <div className="cursor-pointer" onClick={onToggle}>
        {/* Üst satır */}
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-gray-500 font-bold w-6 text-center text-sm flex-shrink-0">#{rank}</span>

          {/* Coin ikonu */}
          {sig.image ? (
            <img
              src={sig.image}
              alt={sig.symbol}
              className="w-8 h-8 rounded-full flex-shrink-0"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0">
              <Coins className="w-4 h-4 text-gold-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-white">{sig.symbol}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${dirStyle.bg} ${dirStyle.border} ${dirStyle.color}`}>
                {dirStyle.label}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${gradeColor}`}>
                {sig.grade}
              </span>
              {sig.leverage_suggest > 1 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30">
                  {sig.leverage_suggest}x
                </span>
              )}
            </div>
            {sig.name && sig.name !== sig.symbol && (
              <p className="text-[10px] text-gray-500 truncate mt-0.5">{sig.name}</p>
            )}
          </div>

          {/* Skor gauge */}
          <div className="flex flex-col items-end flex-shrink-0">
            <div className="text-xl sm:text-2xl font-bold text-white leading-none">{sig.totalScore}</div>
            <div className="text-[9px] sm:text-[10px] text-gray-500 mt-0.5">/ {sig.applicableMax}</div>
            <div className="w-12 h-1 bg-dark-700 rounded-full mt-1 overflow-hidden">
              <div className={`h-full ${gaugeColor} transition-all`} style={{ width: `${ratio * 100}%` }} />
            </div>
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
            : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        </div>

        {/* Fiyat satırı */}
        <div className="flex items-center gap-x-3 gap-y-1 mt-2 ml-9 text-[11px] text-gray-400 flex-wrap">
          {sig.entry != null && (
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              Giriş: <span className="text-white font-mono">{formatUsd(sig.entry)}</span>
            </span>
          )}
          {sig.stop != null && (
            <span className="text-red-300">Stop: <span className="font-mono">{formatUsd(sig.stop)}</span></span>
          )}
          {sig.target1 != null && (
            <span className="text-emerald-300">T1: <span className="font-mono">{formatUsd(sig.target1)}</span></span>
          )}
          {sig.target2 != null && (
            <span className="text-emerald-200">T2: <span className="font-mono">{formatUsd(sig.target2)}</span></span>
          )}
          {sig.change24h != null && (
            <span className={sig.change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              24s: {formatPct(sig.change24h)}
            </span>
          )}
        </div>
      </div>

      {/* ── Açılır panel — trade plan ─────────────────────────────────── */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-dark-700 space-y-3">
          {/* Trade plan özeti */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <PlanCell label="Giriş" value={formatUsd(sig.entry)} icon={Target} color="emerald" />
            <PlanCell label="Stop"  value={formatUsd(sig.stop)}  icon={Shield} color="red" />
            <PlanCell label="Hedef 1" value={formatUsd(sig.target1)} icon={Sparkles} color="sky" />
            <PlanCell label="Hedef 2" value={formatUsd(sig.target2)} icon={Sparkles} color="emerald" />
          </div>

          {/* İndikatör özeti */}
          {sig.indicators && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <Indicator label="RSI 1D" value={sig.indicators.rsi_1d} digits={0} />
              <Indicator label="RSI 4H" value={sig.indicators.rsi_4h} digits={0} />
              <Indicator label="ADX 1D" value={sig.indicators.adx_1d} digits={0} />
              <Indicator label="MACD H 4H" value={sig.indicators.macdHist_4h} digits={3} />
            </div>
          )}

          {/* Funding rate (futures'larda) */}
          {sig.funding && (
            <div className="flex items-center gap-2 p-2 bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-lg text-[11px]">
              <Zap className="w-3.5 h-3.5 text-fuchsia-300 flex-shrink-0" />
              <span className="text-gray-400">Funding rate:</span>
              <span className={`font-mono font-bold ${sig.funding.rate >= 0 ? 'text-fuchsia-300' : 'text-emerald-300'}`}>
                {sig.funding.ratePct.toFixed(4)}%
              </span>
              <span className="text-gray-500 ml-auto">/ 8 saat</span>
            </div>
          )}

          {/* Koşul rozetleri (gruplandırılmış) */}
          <div className="space-y-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">
              Koşullar ({sig.totalScore}/{sig.applicableMax} geçti)
            </div>
            {Object.entries(conditionsByGroup).map(([group, conds]) => (
              <div key={group}>
                <div className="text-[10px] text-gray-500 mb-1">{GROUP_LABELS[group] || group}</div>
                <div className="flex flex-wrap gap-1">
                  {conds.map(c => (
                    <span
                      key={c.id}
                      title={c.why}
                      className={`text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                        c.met
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-gray-500/10 text-gray-500 border-gray-500/20 line-through'
                      }`}
                    >
                      {c.met ? <CheckCircle2 className="w-2.5 h-2.5" /> : <span className="w-2.5 h-2.5">×</span>}
                      {c.label}
                      {c.required && c.met && <span className="text-[9px] opacity-60">★</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Binance trade linki */}
          <a
            href={`https://www.binance.com/en/trade/${sig.symbol}_USDT`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-gold-400 hover:text-gold-300"
          >
            <ExternalLink className="w-3 h-3" />
            Binance'te {sig.symbol}/USDT'yi aç
          </a>
        </div>
      )}
    </div>
  )
}

function PlanCell({ label, value, icon: Icon, color }) {
  const colorMap = {
    emerald: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/5',
    red:     'text-red-300 border-red-500/30 bg-red-500/5',
    sky:     'text-sky-300 border-sky-500/30 bg-sky-500/5',
  }
  return (
    <div className={`p-2 rounded-lg border ${colorMap[color] || colorMap.sky}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-70 mb-0.5">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-xs font-mono font-bold">{value}</div>
    </div>
  )
}

function Indicator({ label, value, digits = 2 }) {
  const v = value == null ? '—' : Number(value).toFixed(digits)
  return (
    <div className="p-2 rounded-lg bg-dark-800 border border-dark-700">
      <div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-xs font-mono text-white mt-0.5">{v}</div>
    </div>
  )
}
