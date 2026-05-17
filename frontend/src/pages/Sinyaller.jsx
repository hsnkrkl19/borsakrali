/**
 * Sinyaller — Özet Komuta Sayfası
 *
 * BIST + Kripto sinyallerinin tek bir yerden hızlı erişim merkezi.
 * Üstte: 3 büyük "öne çıkan" kart (en yüksek skorlu BIST trend + spot_long + futures_long).
 * Altta: 4 sekme × top 5 (BIST Trend / BIST Reversion / Kripto Spot / Kripto Futures).
 *
 * Tüm sinyaller backtest tabanlı historicalWinRate + confidence band ile zenginleştirilmiş;
 * her kartta net Entry/Stop/Target/R/R/WinRate gözükür.
 *
 * Derin analiz için "Tümünü Gör → /gunluk-tespitler?tab=..." linkleri vardır.
 */

import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Target, Sparkles, Coins, RefreshCw, ChevronRight,
  AlertCircle, Zap, Shield, Activity, RotateCcw, ExternalLink, Crown, Info, Layers,
} from 'lucide-react'
import api from '../services/api'
import MTFConfluenceSummary from '../components/MTFConfluenceSummary'
import HelpBubble from '../components/HelpBubble'

// ── Stiller ───────────────────────────────────────────────────────────────
const GRADE_STYLES = {
  MUKEMMEL: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  GUCLU:    'bg-sky-500/20    text-sky-300    border-sky-500/40',
  ORTA:     'bg-amber-500/20  text-amber-300  border-amber-500/40',
  ZAYIF:    'bg-gray-500/20   text-gray-300   border-gray-500/40',
}

const CONFIDENCE_STYLES = {
  high:    { label: 'Yüksek',  cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: '✓' },
  mid:     { label: 'Orta',    cls: 'bg-amber-500/15   text-amber-300   border-amber-500/30',   icon: '~' },
  low:     { label: 'Düşük',   cls: 'bg-rose-500/15    text-rose-300    border-rose-500/30',    icon: '!' },
  unknown: { label: 'Yeni',    cls: 'bg-gray-500/15    text-gray-400    border-gray-500/30',    icon: '?' },
}

const TABS = [
  { key: 'trend',         label: 'BIST · Yön Takibi',    icon: TrendingUp,   color: 'emerald', source: 'bist',   block: 'trend' },
  { key: 'reversion',     label: 'BIST · Dönüş Bölgesi', icon: RotateCcw,    color: 'amber',   source: 'bist',   block: 'reversion' },
  { key: 'spot_long',     label: 'Kripto · Spot AL',     icon: Coins,        color: 'emerald', source: 'crypto', block: 'spot_long' },
  { key: 'futures_long',  label: 'Kripto · Yükseliş',    icon: Sparkles,     color: 'sky',     source: 'crypto', block: 'futures_long' },
  { key: 'futures_short', label: 'Kripto · Düşüş',       icon: TrendingDown, color: 'rose',    source: 'crypto', block: 'futures_short' },
]

const TOP_N_PER_TAB = 5

// USD format — kripto fiyatları geniş aralıkta
function formatUsd(value) {
  if (value == null) return '—'
  const v = Number(value)
  if (!isFinite(v)) return '—'
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  if (v >= 10)   return `$${v.toFixed(3)}`
  if (v >= 1)    return `$${v.toFixed(4)}`
  if (v >= 0.01) return `$${v.toFixed(5)}`
  return `$${v.toFixed(8)}`
}

function formatTl(value) {
  if (value == null) return '—'
  return `${Number(value).toFixed(2)} TL`
}

// ── Sayfa ─────────────────────────────────────────────────────────────────
export default function Sinyaller() {
  const navigate = useNavigate()
  const [bist, setBist] = useState(null)
  const [crypto, setCrypto] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState('trend')
  const [error, setError] = useState(null)

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      const [bistRes, cryptoRes] = await Promise.allSettled([
        api.get('/daily-signals/today'),
        api.get('/market/crypto/signals'),
      ])
      setBist(bistRes.status === 'fulfilled' ? bistRes.value.data : null)
      setCrypto(cryptoRes.status === 'fulfilled' ? cryptoRes.value.data : null)
      if (bistRes.status === 'rejected' && cryptoRes.status === 'rejected') {
        setError('Sinyaller yüklenemedi. Sunucu uyanıyor olabilir, tekrar deneyin.')
      }
    } catch (e) {
      setError('Sinyaller yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadAll()
    setRefreshing(false)
  }

  // BIST'in en güncel fazı (revision varsa, yoksa premarket)
  const bistPhase = bist?.revision || bist?.premarket || null

  // Sekmeye göre sinyalleri getir
  const getSignalsForTab = (tabKey) => {
    const tab = TABS.find(t => t.key === tabKey)
    if (!tab) return []
    if (tab.source === 'bist') {
      return bistPhase?.[tab.block]?.signals || []
    }
    return crypto?.[tab.block]?.signals || []
  }

  // En öne çıkan 3 sinyal (BIST trend + spot_long + futures_long en yüksek skorlu)
  const featuredSignals = [
    {
      tabKey: 'trend',
      tab: TABS.find(t => t.key === 'trend'),
      sig: (bistPhase?.trend?.signals || [])[0] || null,
      source: 'bist',
    },
    {
      tabKey: 'spot_long',
      tab: TABS.find(t => t.key === 'spot_long'),
      sig: (crypto?.spot_long?.signals || [])[0] || null,
      source: 'crypto',
    },
    {
      tabKey: 'futures_long',
      tab: TABS.find(t => t.key === 'futures_long'),
      sig: (crypto?.futures_long?.signals || [])[0] || null,
      source: 'crypto',
    },
  ].filter(f => f.sig)

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-gold-400 animate-spin mx-auto mb-3" />
          <p className="text-gold-400 text-sm">Sinyaller yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-1 sm:px-2 py-4 sm:py-6 space-y-5">
      {/* ── Sayfa başlığı ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 flex-wrap">
            <Crown className="w-7 h-7 text-gold-400" />
            <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">
              Sinyaller
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
              Komuta Merkezi
            </span>
            <HelpBubble text="Şu an hareket eden hisseler burada." />
          </h1>
          <p className="text-xs text-gray-400 mt-1.5 max-w-2xl leading-relaxed">
            BIST + Kripto sinyallerinin tek noktadan özeti. Her sinyal backtest tabanlı{' '}
            <span className="text-emerald-300">geçmiş başarı oranı</span> ile etiketli.
            Detaylı analiz için kartlara tıklayın.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {error && (
        <div className="card p-4 border border-rose-500/30 bg-rose-500/5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-rose-300 font-semibold">{error}</p>
            <button onClick={loadAll} className="text-xs text-gold-400 hover:underline mt-1">Tekrar dene</button>
          </div>
        </div>
      )}

      {/* ── Bilgi şeridi ──────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl text-[11px] sm:text-xs">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-gray-300 leading-relaxed">
          <span className="text-white font-semibold">Sinyal kalitesi v5</span> · Min skor sıkılaştırıldı (BIST ≥6/10, Kripto ≥6/10),
          alt-zorunlu koşullar eklendi (yapı kanıtı şart), her sinyale{' '}
          <span className="text-emerald-300">backtest geçmiş başarı oranı</span> beslendi.
          Geçmiş veriler Pazar 03:00'da güncellenir.
          <span className="text-amber-300 ml-1">⚠ Yatırım tavsiyesi değildir, eğitim amaçlıdır.</span>
        </p>
      </div>

      {/* ── Öne çıkan 3 sinyal ────────────────────────────────────────────── */}
      {featuredSignals.length > 0 && (
        <div>
          <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-2.5 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-gold-400" />
            Bugünün En Güçlü Sinyalleri
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {featuredSignals.map(({ tabKey, tab, sig, source }) => (
              <FeaturedCard
                key={tabKey}
                tab={tab}
                sig={sig}
                source={source}
                onClick={() => navigate(`/gunluk-tespitler?tab=${source === 'bist' ? 'bugun' : 'kripto'}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── MTF Confluence özeti ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-2.5 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-gold-400" />
          MTF Confluence — 7 Timeframe Birleşimi
          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gold-400/10 text-gold-400/80 border border-gold-400/30 font-semibold normal-case ml-auto sm:ml-0">
            Kendi Bayesian kalibrasyonu
          </span>
        </h2>
        <MTFConfluenceSummary navigate={navigate} />
      </div>

      {/* ── Sekme satırı ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-2.5 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-gold-400" />
          Strateji Bazında Top {TOP_N_PER_TAB}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {TABS.map(tab => {
            const Icon = tab.icon
            const signals = getSignalsForTab(tab.key)
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`p-2.5 rounded-xl border-2 transition-all text-left ${
                  isActive
                    ? `bg-${tab.color}-500/15 border-${tab.color}-500/50`
                    : 'bg-dark-800 border-dark-700 hover:border-dark-600'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? `text-${tab.color}-400` : 'text-gray-400'}`} />
                  <span className={`text-base font-bold ${isActive ? `text-${tab.color}-300` : 'text-gray-500'}`}>
                    {signals.length}
                  </span>
                </div>
                <p className={`text-[11px] mt-1 leading-tight truncate ${isActive ? 'text-white font-semibold' : 'text-gray-400'}`}>
                  {tab.label}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Aktif sekme listesi ───────────────────────────────────────────── */}
      <TabContent
        tab={TABS.find(t => t.key === activeTab)}
        signals={getSignalsForTab(activeTab).slice(0, TOP_N_PER_TAB)}
        totalCount={getSignalsForTab(activeTab).length}
      />

      {/* ── Alt navigasyon ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        <Link
          to="/gunluk-tespitler?tab=bugun"
          className="card p-4 hover:border-gold-500/40 transition-colors flex items-center justify-between group"
        >
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">BIST Detaylı Analiz</p>
            <p className="text-sm font-semibold text-white mt-0.5">Bugünün Sinyalleri · Tam Liste</p>
            <p className="text-[11px] text-gray-400 mt-1">Tüm sinyaller, diff, revize sebepleri, expanded analiz</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-gold-400 transition-colors" />
        </Link>
        <Link
          to="/gunluk-tespitler?tab=kripto"
          className="card p-4 hover:border-gold-500/40 transition-colors flex items-center justify-between group"
        >
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500">Kripto Detaylı Analiz</p>
            <p className="text-sm font-semibold text-white mt-0.5">Kripto Sinyalleri · Tam Liste</p>
            <p className="text-[11px] text-gray-400 mt-1">Spot + Futures (long/short), 10 koşul detayı, funding rate</p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-gold-400 transition-colors" />
        </Link>
      </div>

      {/* ── Footer disclaimer ───────────────────────────────────────────── */}
      <p className="text-[10px] text-gray-600 text-center pt-2">
        Sinyaller algoritmik olarak üretilir, yatırım tavsiyesi değildir. Kendi araştırmanızı yapın.
      </p>
    </div>
  )
}

// ─── Öne çıkan büyük kart ────────────────────────────────────────────────
function FeaturedCard({ tab, sig, source, onClick }) {
  const Icon = tab.icon
  const isLong = sig.direction === 'long'
  const dirLabel = isLong ? '↑ AL' : '↓ SAT'
  const dirCls = isLong
    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
    : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
  const gradeCls = GRADE_STYLES[sig.grade] || GRADE_STYLES.ZAYIF
  const confStyle = CONFIDENCE_STYLES[sig.confidence] || CONFIDENCE_STYLES.unknown
  const fmt = source === 'bist' ? formatTl : formatUsd
  const targetVal = source === 'bist' ? sig.target : sig.target1

  // İlk 2 geçen koşul — "neden bu sinyal" mini özeti
  const topReasons = (sig.conditions || []).filter(c => c.met && c.applicable).slice(0, 2).map(c => c.label)

  return (
    <button
      onClick={onClick}
      className={`card p-4 text-left hover:border-${tab.color}-500/60 transition-all border-2 border-dark-700 hover:scale-[1.01] active:scale-[0.99]`}
    >
      {/* Üst — etiket */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border bg-${tab.color}-500/10 text-${tab.color}-300 border-${tab.color}-500/30 uppercase tracking-wider flex items-center gap-1 font-semibold`}>
          <Icon className="w-3 h-3" />
          {tab.label}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${confStyle.cls}`} title={`Geçmiş başarı oranı`}>
          {confStyle.icon} {sig.historicalWinRate != null ? `%${sig.historicalWinRate}` : confStyle.label}
        </span>
      </div>

      {/* Sembol + yön + grade */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-2xl font-bold text-white">{sig.symbol}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${dirCls}`}>{dirLabel}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${gradeCls}`}>{sig.grade}</span>
        <span className="ml-auto text-right">
          <span className="text-2xl font-bold text-white">{sig.totalScore}</span>
          <span className="text-[10px] text-gray-500"> / {sig.applicableMax}</span>
        </span>
      </div>

      {sig.name && sig.name !== sig.symbol && (
        <p className="text-[11px] text-gray-500 truncate mb-2">{sig.name}</p>
      )}

      {/* Entry / Stop / Target / R/R */}
      <div className="grid grid-cols-4 gap-1.5 text-[10px] mt-2">
        <div className="bg-blue-500/10 border border-blue-500/20 rounded p-1.5 text-center">
          <p className="text-[9px] text-gray-500 uppercase">Giriş</p>
          <p className="font-mono font-bold text-blue-300 text-[11px] truncate">{fmt(sig.entry)}</p>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/20 rounded p-1.5 text-center">
          <p className="text-[9px] text-gray-500 uppercase">Stop</p>
          <p className="font-mono font-bold text-rose-300 text-[11px] truncate">{fmt(sig.stop)}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-1.5 text-center">
          <p className="text-[9px] text-gray-500 uppercase">Hedef</p>
          <p className="font-mono font-bold text-emerald-300 text-[11px] truncate">{fmt(targetVal)}</p>
        </div>
        <div className="bg-sky-500/10 border border-sky-500/20 rounded p-1.5 text-center">
          <p className="text-[9px] text-gray-500 uppercase">R/R</p>
          <p className="font-mono font-bold text-sky-300 text-[11px]">{sig.riskReward != null ? sig.riskReward.toFixed(2) : '—'}</p>
        </div>
      </div>

      {/* Neden — 2 koşul */}
      {topReasons.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
          <span className="text-gold-400/80 font-semibold">Neden: </span>
          {topReasons.join(' · ')}
        </p>
      )}
    </button>
  )
}

// ─── Sekme içeriği — kompakt sinyal listesi ──────────────────────────────
function TabContent({ tab, signals, totalCount }) {
  if (!tab) return null
  const Icon = tab.icon
  const source = tab.source

  if (signals.length === 0) {
    return (
      <div className="card p-6 text-center">
        <Icon className={`w-8 h-8 text-gray-500 mx-auto mb-2`} />
        <p className="text-sm text-gray-400">{tab.label} için şu an sinyal yok.</p>
        <p className="text-xs text-gray-500 mt-1">
          Sinyal kalitesi sıkı tutuluyor — her zaman her stratejide sinyal olmayabilir.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <p className="text-gray-400">
          <span className="text-white font-semibold">{tab.label}</span> · Top {signals.length}
          {totalCount > signals.length && (
            <span className="text-gray-500"> ({totalCount} toplam)</span>
          )}
        </p>
        <Link
          to={`/gunluk-tespitler?tab=${source === 'bist' ? 'bugun' : 'kripto'}`}
          className="text-gold-400 hover:text-gold-300 flex items-center gap-0.5"
        >
          Tümünü gör <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {signals.map((sig, idx) => (
        <CompactSignalRow key={sig.symbol + idx} sig={sig} rank={idx + 1} source={source} tab={tab} />
      ))}
    </div>
  )
}

// ─── Kompakt sinyal satırı — sekme listesi için ──────────────────────────
function CompactSignalRow({ sig, rank, source, tab }) {
  const navigate = useNavigate()
  const isLong = sig.direction === 'long'
  const dirCls = isLong
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
    : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
  const gradeCls = GRADE_STYLES[sig.grade] || GRADE_STYLES.ZAYIF
  const confStyle = CONFIDENCE_STYLES[sig.confidence] || CONFIDENCE_STYLES.unknown
  const fmt = source === 'bist' ? formatTl : formatUsd
  const targetVal = source === 'bist' ? sig.target : sig.target1

  const handleClick = () => {
    navigate(`/gunluk-tespitler?tab=${source === 'bist' ? 'bugun' : 'kripto'}`)
  }

  return (
    <div
      onClick={handleClick}
      className="card p-3 cursor-pointer hover:border-gold-500/30 transition-colors border border-dark-700"
    >
      {/* Üst satır */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-gray-500 font-bold text-xs w-5 text-center flex-shrink-0">#{rank}</span>

        {/* Coin ikonu varsa */}
        {sig.image && (
          <img src={sig.image} alt="" className="w-6 h-6 rounded-full flex-shrink-0" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        )}

        <span className="font-bold text-white text-sm">{sig.symbol}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold ${dirCls}`}>
          {isLong ? '↑ AL' : '↓ SAT'}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-bold ${gradeCls}`}>{sig.grade}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${confStyle.cls}`} title={`Backtest geçmiş başarı`}>
          {confStyle.icon} {sig.historicalWinRate != null ? `%${sig.historicalWinRate}` : confStyle.label}
        </span>

        <div className="ml-auto flex items-center gap-2 text-[11px]">
          <span className="text-white font-bold">{sig.totalScore}<span className="text-gray-500">/{sig.applicableMax}</span></span>
          <ChevronRight className="w-4 h-4 text-gray-500" />
        </div>
      </div>

      {/* Alt satır — Giriş / Stop / Hedef / R/R */}
      <div className="flex items-center gap-x-3 gap-y-1 mt-1.5 ml-7 text-[11px] flex-wrap">
        <span className="text-gray-400">
          <Target className="w-3 h-3 inline mr-0.5" /> Giriş:{' '}
          <span className="text-white font-mono">{fmt(sig.entry)}</span>
        </span>
        <span className="text-rose-300">Stop: <span className="font-mono">{fmt(sig.stop)}</span></span>
        <span className="text-emerald-300">Hedef: <span className="font-mono">{fmt(targetVal)}</span></span>
        {sig.riskReward != null && (
          <span className="text-sky-300">R/R: <span className="font-mono">{sig.riskReward.toFixed(2)}</span></span>
        )}
      </div>
    </div>
  )
}
