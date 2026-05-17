import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, TrendingUp, Waves, CandlestickChart, BarChart3, Sparkles, Brain, Hash, Newspaper,
  Coins, Bitcoin, Briefcase, Layers,
} from 'lucide-react'
import Taramalar from './Taramalar'
import EMA34Tarayici from './EMA34Tarayici'
import TEMA34Tarayici from './TEMA34Tarayici'
import MalaysianSNR from './MalaysianSNR'
import SMCTarayici from './SMCTarayici'
import TaramaAnalizMerkezi from './TaramaAnalizMerkezi'
import StratejiKombolari from './StratejiKombolari'
import XGundem from './XGundem'
import HaberAkisi from './HaberAkisi'

// ── Varlık grupları ─────────────────────────────────────────────────────────
// Her sekme bir veya birden fazla varlık grubuna ait olabilir.
// Filtre butonları: Hepsi / BIST / Kripto / Emtia
const GROUP = { ALL: 'all', BIST: 'bist', CRYPTO: 'crypto', COMMODITY: 'commodity' }

const TABS = [
  {
    id: 'genel',
    label: 'Genel Tarama',
    icon: Search,
    component: Taramalar,
    desc: '15+ teknik strateji — RSI, MACD, EMA, Ichimoku, ADX',
    groups: [GROUP.BIST, GROUP.CRYPTO, GROUP.COMMODITY],
  },
  {
    id: 'ema34',
    label: 'EMA34 Wave',
    icon: Waves,
    component: EMA34Tarayici,
    desc: 'Bill Williams 34 EMA — Trend filtresi + Pullback giriş sistemi (Wave Rider)',
    groups: [GROUP.BIST, GROUP.CRYPTO],
    isNew: true,
  },
  {
    id: 'tema34',
    label: 'TEMA34 Takip',
    icon: TrendingUp,
    component: TEMA34Tarayici,
    desc: 'Triple EMA 34 — hızlı sinyal, düşük gecikme trend takibi',
    groups: [GROUP.BIST, GROUP.CRYPTO],
  },
  {
    id: 'snr',
    label: 'Malaysian SNR',
    icon: CandlestickChart,
    component: MalaysianSNR,
    desc: 'Body-bazlı destek/direnç — BIST + Kripto + Altın/Gümüş',
    groups: [GROUP.BIST, GROUP.CRYPTO, GROUP.COMMODITY],
    isUpdated: true,
  },
  {
    id: 'smc',
    label: 'SMC (Smart Money)',
    icon: Layers,
    component: SMCTarayici,
    desc: 'Order Block · FVG · BOS/CHoCH · Likidite Sweep — ICT kurumsal akış',
    groups: [GROUP.BIST, GROUP.CRYPTO],
    isNew: true,
  },
  {
    id: 'merkez',
    label: 'Strateji Merkezi',
    icon: BarChart3,
    component: TaramaAnalizMerkezi,
    desc: 'Çoklu strateji tarama merkezi',
    groups: [GROUP.BIST],
  },
  {
    id: 'kombolar',
    label: 'Strateji Komboları',
    icon: Brain,
    component: StratejiKombolari,
    desc: 'TradingView tarzı çoklu indikatör kombosu',
    groups: [GROUP.BIST],
    isNew: true,
  },
  {
    id: 'x-gundem',
    label: 'X Gündemi',
    icon: Hash,
    component: XGundem,
    desc: 'BIST ve kripto için X.com hashtag/cashtag mention analizi',
    groups: [GROUP.BIST, GROUP.CRYPTO],
    isNew: true,
  },
  {
    id: 'haberler',
    label: 'Haber Akışı',
    icon: Newspaper,
    component: HaberAkisi,
    desc: 'Türk finans medyası + kripto kaynaklarından canlı haber kazıma',
    groups: [GROUP.BIST, GROUP.CRYPTO],
    isNew: true,
  },
]

const GROUP_FILTERS = [
  { id: GROUP.ALL,       label: 'Hepsi',  icon: Sparkles,   color: 'amber' },
  { id: GROUP.BIST,      label: 'BIST',   icon: Briefcase,  color: 'blue' },
  { id: GROUP.CRYPTO,    label: 'Kripto', icon: Bitcoin,    color: 'orange' },
  { id: GROUP.COMMODITY, label: 'Emtia',  icon: Coins,      color: 'yellow' },
]

// ── Kıymetli Metaller & Döviz Fiyat Şeridi ──────────────────────────────────
function CommodityStrip() {
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)

  const fetchPrices = async () => {
    try {
      const r = await fetch('/api/market/commodities')
      const d = await r.json()
      setData(d || {})
      setUpdatedAt(new Date())
    } catch (_) { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchPrices()
    const id = setInterval(fetchPrices, 5 * 60 * 1000) // 5 dakika
    return () => clearInterval(id)
  }, [])

  const items = [
    { key: 'gold_usd',   label: 'Altın (Ons)',  emoji: '🥇', unit: 'USD/oz' },
    { key: 'silver_usd', label: 'Gümüş (Ons)', emoji: '🥈', unit: 'USD/oz' },
    { key: 'gold_try',   label: 'Gram Altın',   emoji: '🏅', unit: 'TL/gr' },
    { key: 'usd_try',    label: 'Dolar / TL',   emoji: '💵', unit: 'TL'    },
  ]

  return (
    <div className="card !p-0 overflow-hidden border-yellow-500/20">
      <div className="px-4 py-2 border-b border-dark-700 bg-gradient-to-r from-yellow-500/5 to-transparent flex items-center justify-between">
        <p className="text-xs font-semibold text-yellow-200/90 flex items-center gap-1.5">
          <Coins className="w-3.5 h-3.5" /> Kıymetli Metaller & Döviz
        </p>
        <span className="text-[10px] text-gray-500">
          {updatedAt ? `Güncellendi: ${updatedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : '...'}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-dark-700">
        {items.map(it => {
          const d = data[it.key]
          const cp = d?.changePercent
          const up = (cp || 0) >= 0
          return (
            <div key={it.key} className="px-3 py-2.5 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <span>{it.emoji}</span>
                <span className="truncate">{it.label}</span>
              </div>
              {loading ? (
                <div className="w-20 h-4 bg-dark-700 animate-pulse rounded mt-1" />
              ) : d?.price != null ? (
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-white font-bold text-sm">
                    {d.price.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                  </span>
                  <span className={`text-[11px] font-semibold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                    {cp != null ? `${up ? '+' : ''}${cp.toFixed(2)}%` : '—'}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-gray-600 mt-1">—</p>
              )}
              <p className="text-[9px] text-gray-600">{it.unit}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Tarayicilar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initial = TABS.find(t => t.id === searchParams.get('tab'))?.id || 'genel'
  const [active, setActive] = useState(initial)
  const [group, setGroup] = useState(GROUP.ALL)

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && TABS.find(t => t.id === tab)) setActive(tab)
  }, [searchParams])

  const setTab = (id) => {
    setActive(id)
    setSearchParams({ tab: id })
  }

  // Aktif gruba göre filtrelenmiş sekmeler. 'Hepsi' seçili ise tüm sekmeler.
  const visibleTabs = group === GROUP.ALL
    ? TABS
    : TABS.filter(t => t.groups.includes(group))

  // Aktif sekme görünür değilse ilk görünür sekmeye dön
  useEffect(() => {
    if (!visibleTabs.find(t => t.id === active) && visibleTabs.length > 0) {
      setActive(visibleTabs[0].id)
    }
  }, [group]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeTab = TABS.find(t => t.id === active)
  const Active = activeTab?.component

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card !p-0 border-amber-500/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.10] to-transparent pointer-events-none" />
        <div className="relative flex items-center gap-3 p-4 sm:p-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Sparkles className="w-5 h-5 text-slate-950" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Tarayıcılar</h1>
            <p className="text-xs sm:text-sm" style={{ color: 'var(--text-muted)' }}>
              BIST · Kripto · Altın & Gümüş — tüm tarama araçları tek çatı altında
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[11px] text-gray-500">
            <span className="px-2 py-1 rounded-md bg-dark-800 border border-dark-700">{TABS.length} araç</span>
            <span className="px-2 py-1 rounded-md bg-dark-800 border border-dark-700">{visibleTabs.length} görünür</span>
          </div>
        </div>
      </div>

      {/* Kıymetli Metaller & Döviz fiyat şeridi */}
      <CommodityStrip />

      {/* Varlık grubu filtresi */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 mr-1">Varlık:</span>
        {GROUP_FILTERS.map(f => {
          const Icon = f.icon
          const isActive = group === f.id
          const count = f.id === GROUP.ALL ? TABS.length : TABS.filter(t => t.groups.includes(f.id)).length
          return (
            <button
              key={f.id}
              onClick={() => setGroup(f.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isActive
                  ? `bg-${f.color}-500/20 border-${f.color}-500/50 text-${f.color}-200`
                  : 'bg-dark-800 border-dark-700 text-gray-400 hover:text-white hover:border-dark-600'
              }`}
              style={isActive ? {
                background: f.color === 'amber' ? 'rgba(245,158,11,0.15)' :
                            f.color === 'blue' ? 'rgba(59,130,246,0.15)' :
                            f.color === 'orange' ? 'rgba(249,115,22,0.15)' :
                            'rgba(234,179,8,0.15)',
                borderColor: f.color === 'amber' ? 'rgba(245,158,11,0.5)' :
                             f.color === 'blue' ? 'rgba(59,130,246,0.5)' :
                             f.color === 'orange' ? 'rgba(249,115,22,0.5)' :
                             'rgba(234,179,8,0.5)',
                color: f.color === 'amber' ? '#fde68a' :
                       f.color === 'blue' ? '#bfdbfe' :
                       f.color === 'orange' ? '#fed7aa' :
                       '#fef08a',
              } : undefined}
            >
              <Icon className="w-3.5 h-3.5" />
              {f.label}
              <span className="text-[10px] opacity-70">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Tab pills — mobilde kompakt, aktif sekme görünüre kayar */}
      <div className="bg-dark-900/60 border border-dark-700 rounded-2xl p-1 md:p-1.5 overflow-x-auto custom-scrollbar snap-x snap-mandatory scroll-smooth">
        <div className="flex gap-1 min-w-max">
          {visibleTabs.map(t => {
            const Icon = t.icon
            const isActive = active === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`snap-start flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[12px] sm:text-sm font-semibold whitespace-nowrap transition-all
                  ${isActive
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-dark-950 shadow-lg shadow-amber-500/25'
                    : 'text-gray-400 hover:text-white hover:bg-dark-800'
                  }`}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                {t.label}
                {t.isNew && !isActive && (
                  <span className="text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40 leading-none">YENİ</span>
                )}
                {t.isUpdated && !isActive && (
                  <span className="text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 leading-none">+</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active tab description + sembol etiketleri */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-gray-500">{activeTab?.desc}</span>
        <div className="flex items-center gap-1 ml-auto">
          {activeTab?.groups?.map(g => {
            const f = GROUP_FILTERS.find(x => x.id === g)
            if (!f) return null
            return (
              <span key={g} className="px-1.5 py-0.5 rounded bg-dark-800 border border-dark-700 text-[10px] text-gray-400">
                {f.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* Active component */}
      <div>
        {Active && <Active />}
      </div>
    </div>
  )
}
