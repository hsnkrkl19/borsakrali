import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Activity, BarChart3, Flame, Crown, Zap, ChevronRight,
  RefreshCw, Sparkles, Target, Brain, Gem, Search, Briefcase, Coins, Building2,
} from 'lucide-react'
import apiClient from '../services/api'
import { TradingViewTicker } from '../components/TradingViewChart'
import BistChart from '../components/charts/BistChart'
import InfoTooltip from '../components/InfoTooltip'
import CommodityWidget from '../components/CommodityWidget'

const API_BASE = ''

const TIPS = {
  bist100: {
    title: 'BIST 100 Endeksi',
    description: 'Borsa İstanbul\'da işlem gören en büyük 100 hissenin piyasa değeri ağırlıklı endeksidir.',
    formula: 'Endeks = Σ(HisseFiyatı × DolaşımdakiLot × Katsayı) / BazDeger\n09:00–18:00 TSİ canlı.',
    source: 'Borsa İstanbul'
  },
  bist30: {
    title: 'BIST 30 Endeksi',
    description: 'BIST 100\'ün en likit 30 mavi-çip hissesinden oluşur.',
    formula: 'BIST 30 ⊂ BIST 100 (en yüksek hacim + piyasa değeri)',
    source: 'Borsa İstanbul'
  },
  signals: {
    title: 'AI Sinyaller',
    description: 'RSI / MACD / EMA kesişim / Bollinger / Hacim spike üzerinden algoritmik tespit.',
    formula: 'Birden fazla göstergenin uyumlu sinyali → "AL" / "SAT" tespiti',
    source: 'Borsa Kralı motoru'
  },
  sectors: {
    title: 'Sektör Performansı',
    description: 'Sektör bazlı ağırlıklı ortalama günlük değişim.',
    formula: 'Σ(HisseDeğişimi × HissePiyasaDeğeri) / SektörToplamPiyasaDeğeri',
    source: 'Canlı hesap'
  },
  changePercent: {
    title: 'Günlük Değişim',
    description: 'Önceki kapanışa göre anlık fiyat değişim yüzdesi.',
    formula: '(Fiyat - ÖncekiKapanış) / ÖncekiKapanış × 100',
    source: 'Yahoo Finance canlı'
  },
  volume: {
    title: 'Hacim',
    description: 'Seçili periyotta el değiştiren hisse adedi. Yüksek hacim hareketin gücüdür.',
    formula: 'Hacim × Fiyat = Liralık işlem hacmi',
    source: 'BIST anlık'
  },
}

/* ─── Mini sparkline (deterministic) ─────────────────────────────────────── */
function Sparkline({ direction = 1, w = 80, h = 24 }) {
  const points = useMemo(() => {
    const out = []
    let v = 50
    for (let i = 0; i < 18; i++) {
      v += (Math.sin(i * 0.7 + (direction * 1.3)) * 8) + (direction * 1.4)
      v = Math.max(5, Math.min(95, v))
      out.push(v)
    }
    return out
  }, [direction])
  const stepX = w / (points.length - 1)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${h - (p / 100) * h}`).join(' ')
  const area = `${path} L ${w} ${h} L 0 ${h} Z`
  const up = direction >= 0
  const stroke = up ? '#00c98a' : '#ff3b46'
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`sp-${direction}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp-${direction})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ─── Hero index card — large focal number with chart ──────────────────── */
function HeroIndexCard({ data, icon: Icon, title, subtitle, tip, accent }) {
  const isUp = data?.changePercent >= 0
  const fmt = (n, d = 2) => n != null ? Number(n).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'
  return (
    <div className="surface-card-gold p-6 lg:p-7 relative overflow-hidden group">
      {/* Direction-aware glow */}
      <div
        className="absolute -top-24 -right-24 w-72 h-72 rounded-full pointer-events-none transition-opacity"
        style={{
          background: isUp
            ? 'radial-gradient(circle, rgba(0, 201, 138, 0.16), transparent 70%)'
            : 'radial-gradient(circle, rgba(255, 59, 70, 0.16), transparent 70%)',
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.30), rgba(212, 175, 55, 0.05))',
                border: '1px solid rgba(212, 175, 55, 0.35)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              }}
            >
              <Icon className="w-5 h-5 text-amber-300" strokeWidth={2.4} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-[15px] font-bold text-white tracking-tight">{title}</h3>
                <InfoTooltip {...tip} />
              </div>
              <p className="text-slate-400 text-[11px] uppercase tracking-wider mt-0.5">{subtitle}</p>
            </div>
          </div>

          <div className={`pill ${isUp ? 'pill-jade' : 'pill-ember'} !text-[10.5px] !py-1`}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span className="num-tabular">{isUp ? '+' : ''}{data?.changePercent?.toFixed(2)}%</span>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <div className="text-[2.75rem] lg:text-[3.25rem] font-black tracking-tight text-white leading-[1] num-tabular">
              {fmt(data?.value)}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-[12px]">
              <span className="text-slate-400">Δ</span>
              <span className={`font-bold num-tabular ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {isUp ? '+' : ''}{fmt(data?.change)}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-500">Önceki: <span className="text-slate-300 num-tabular">{fmt(data?.previousClose, 0)}</span></span>
            </div>
          </div>

          <div className="opacity-90 hidden sm:block">
            <Sparkline direction={isUp ? 1 : -1} w={120} h={48} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-amber-500/10">
          {[
            { k: 'Yüksek', v: data?.high, c: 'text-emerald-400' },
            { k: 'Düşük', v: data?.low, c: 'text-red-400' },
            { k: 'Açılış', v: data?.open ?? data?.previousClose, c: 'text-slate-200' },
          ].map((m, i) => (
            <div key={i}>
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{m.k}</div>
              <div className={`text-[13px] font-bold num-tabular mt-1 ${m.c}`}>
                {fmt(m.v)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Stock leaderboard row with sparkline ──────────────────────────────── */
function LeaderboardRow({ stock, idx, type, onClick }) {
  const isUp = stock.changePercent >= 0
  const accentColor =
    type === 'gainer' ? 'text-emerald-400'
    : type === 'loser' ? 'text-red-400'
    : 'text-amber-400'

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl transition-all group hover:translate-x-0.5 hover:bg-amber-500/5"
      style={{
        background: 'rgba(var(--bg-input-rgb), 0.4)',
        border: '1px solid var(--border-main)',
      }}
    >
      <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black num-tabular flex-shrink-0 ${
        type === 'gainer' ? 'bg-emerald-500/15 text-emerald-400'
        : type === 'loser' ? 'bg-red-500/15 text-red-400'
        : 'bg-amber-500/15 text-amber-400'
      }`}>
        {idx + 1}
      </span>

      <div className="min-w-0 text-left flex-1">
        <div className="font-bold text-white text-[13px] tracking-tight">{stock.symbol}</div>
        <div className="text-[10px] text-slate-400 truncate">{stock.name}</div>
      </div>

      <div className="hidden sm:block">
        <Sparkline direction={isUp ? 1 : -1} w={56} h={20} />
      </div>

      <div className="text-right flex-shrink-0">
        <div className="font-bold text-white text-[13px] num-tabular">
          {type === 'active' ? `${(stock.volume / 1_000_000)?.toFixed(1)}M` : stock.price?.toFixed(2)}
        </div>
        <div className={`text-[11px] font-bold num-tabular ${type === 'active' ? 'text-amber-400' : accentColor}`}>
          {type === 'active' ? `${stock.price?.toFixed(2)}₺` : `${isUp ? '+' : ''}${stock.changePercent?.toFixed(2)}%`}
        </div>
      </div>
    </button>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [bist100Data, setBist100Data] = useState(null)
  const [bist30Data, setBist30Data] = useState(null)
  const [topGainers, setTopGainers] = useState([])
  const [topLosers, setTopLosers] = useState([])
  const [mostActive, setMostActive] = useState([])
  const [sectors, setSectors] = useState([])
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadDashboardData()
    const interval = setInterval(loadDashboardData, 60000)
    return () => clearInterval(interval)
  }, [])

  const loadDashboardData = async () => {
    try {
      const [bist100Res, bist30Res, gainersRes, losersRes, activeRes, sectorsRes] = await Promise.all([
        apiClient.get(`${API_BASE}/market/bist100`),
        apiClient.get(`${API_BASE}/market/bist30`),
        apiClient.get(`${API_BASE}/market/gainers?limit=5`),
        apiClient.get(`${API_BASE}/market/losers?limit=5`),
        apiClient.get(`${API_BASE}/market/active?limit=5`),
        apiClient.get(`${API_BASE}/market/sectors`),
      ])

      setBist100Data(bist100Res.data)
      setBist30Data(bist30Res.data)
      setTopGainers(gainersRes.data.stocks || [])
      setTopLosers(losersRes.data.stocks || [])
      setMostActive(activeRes.data.stocks || [])
      setSectors(sectorsRes.data.sectors || [])
      setLastUpdate(new Date())
      setLoading(false)
      setRefreshing(false)
    } catch (error) {
      console.error('Dashboard data load error:', error)
      setLoading(false)
      setRefreshing(false)
    }

    apiClient.get(`${API_BASE}/market/signals?limit=5`)
      .then(res => setSignals(res.data.signals || []))
      .catch(() => {})
  }

  const handleRefresh = () => {
    setRefreshing(true)
    loadDashboardData()
  }

  const handleStockNavigation = (symbol) => {
    if (!symbol) return
    navigate(`/teknik-analiz-ai?symbol=${symbol}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center">
          <div className="relative mx-auto mb-5 w-24 h-24">
            <div className="absolute inset-0 rounded-full border-2 border-amber-500/15" />
            <div className="absolute inset-0 rounded-full border-2 border-t-amber-400 border-r-amber-500 border-b-transparent border-l-transparent animate-spin" />
            <div
              className="absolute inset-3 rounded-full flex items-center justify-center glow-breath"
              style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #d4af37 50%, #8b6510 100%)',
                boxShadow: '0 8px 28px rgba(212, 175, 55, 0.45), inset 0 1px 0 rgba(255,255,255,0.5)',
              }}
            >
              <Crown className="w-7 h-7 text-slate-950" strokeWidth={2.6} />
            </div>
          </div>
          <p className="text-gold-shimmer font-bold text-sm uppercase tracking-[0.2em]">Piyasa Yükleniyor</p>
          <p className="text-slate-500 text-xs mt-1.5">Veriler senkronize ediliyor…</p>
        </div>
      </div>
    )
  }

  const breadthCount = topGainers.length + topLosers.length
  const breadthUp = topGainers.length
  const breadthRatio = breadthCount > 0 ? Math.round((breadthUp / breadthCount) * 100) : 50

  return (
    <div className="space-y-5 lg:space-y-6 w-full max-w-full overflow-hidden">

      {/* ─── PAGE HEADER ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="pill pill-gold">
              <span className="status-dot status-dot-gold" />
              CANLI PİYASA
            </span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider hidden sm:inline">
              {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
          <h1 className="text-[1.85rem] sm:text-[2.25rem] font-black leading-none tracking-tight">
            <span className="text-gold-shimmer">Piyasa Kokpiti</span>
          </h1>
          <p className="text-slate-400 text-[13px] mt-1.5">BIST 100 · BIST 30 · Sektörler · AI Sinyaller</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {lastUpdate && (
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px]"
              style={{ background: 'rgba(var(--bg-input-rgb), 0.5)', border: '1px solid var(--border-main)' }}
            >
              <span className="status-dot status-dot-live" />
              <span className="text-slate-400">Son senkron:</span>
              <span className="num-tabular text-slate-200 font-mono font-bold">{lastUpdate.toLocaleTimeString('tr-TR')}</span>
            </div>
          )}
          <button onClick={handleRefresh} disabled={refreshing} className="btn-ghost">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Yenile</span>
          </button>
          <button onClick={() => navigate('/canli-heatmap')} className="btn-gold">
            <Flame className="w-4 h-4" />
            <span className="hidden sm:inline">Canlı Heatmap</span>
          </button>
        </div>
      </div>

      {/* ─── TRADINGVIEW TICKER ──────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden surface-card !p-0">
        <TradingViewTicker
          symbols={[
            { proName: 'FOREXCOM:XAUUSD', title: 'Altın/USD' },
            { proName: 'FX_IDC:USDTRY', title: 'USD/TRY' },
            { proName: 'FX_IDC:EURTRY', title: 'EUR/TRY' },
            { proName: 'CRYPTOCAP:BTC', title: 'Bitcoin' },
            { proName: 'TVC:DXY', title: 'Dolar Endeksi' },
            { proName: 'TVC:US10Y', title: 'ABD 10Y Faiz' }
          ]}
        />
      </div>

      {/* ─── INDICES + MARKET BREADTH ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        <HeroIndexCard data={bist100Data} icon={Crown} title="BIST 100" subtitle="Ana Endeks" tip={TIPS.bist100} />
        <HeroIndexCard data={bist30Data} icon={Gem} title="BIST 30" subtitle="Mavi Çipler" tip={TIPS.bist30} />

        {/* Market breadth indicator */}
        <div className="surface-card-gold p-6 lg:p-7 relative overflow-hidden">
          <div className="flex items-center gap-3 mb-5">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.30), rgba(212, 175, 55, 0.05))',
                border: '1px solid rgba(212, 175, 55, 0.35)',
              }}
            >
              <Activity className="w-5 h-5 text-amber-300" strokeWidth={2.4} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-white tracking-tight">Piyasa Genişliği</h3>
              <p className="text-slate-400 text-[11px] uppercase tracking-wider mt-0.5">Yön Sinyali</p>
            </div>
          </div>

          <div className="text-[2.75rem] lg:text-[3.25rem] font-black tracking-tight leading-[1] mb-2 num-tabular">
            <span className={breadthRatio >= 50 ? 'price-up' : 'price-down'}>{breadthRatio}<span className="text-[1.5rem] text-slate-500">%</span></span>
          </div>
          <div className="text-[12px] text-slate-400 mb-4">
            Top 10 hisse: <span className="text-emerald-400 font-bold">{breadthUp} yükselen</span> · <span className="text-red-400 font-bold">{breadthCount - breadthUp} düşen</span>
          </div>

          {/* Breadth bar */}
          <div className="relative h-2 rounded-full overflow-hidden mt-2" style={{ background: 'var(--bg-subtle)' }}>
            <div
              className="absolute left-0 top-0 bottom-0 transition-all duration-700"
              style={{
                width: `${breadthRatio}%`,
                background: 'linear-gradient(90deg, #00c98a, #4ade80)',
              }}
            />
            <div
              className="absolute right-0 top-0 bottom-0 transition-all duration-700"
              style={{
                width: `${100 - breadthRatio}%`,
                background: 'linear-gradient(-90deg, #ff3b46, #f87171)',
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] mt-2 font-bold uppercase tracking-wider">
            <span className="text-emerald-400">{breadthUp} ▲</span>
            <span className="text-red-400">{breadthCount - breadthUp} ▼</span>
          </div>
        </div>
      </div>

      {/* ─── LEADERBOARDS ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
        {[
          { type: 'gainer', icon: TrendingUp, label: 'Yükselenler', data: topGainers, accent: 'emerald' },
          { type: 'loser', icon: TrendingDown, label: 'Düşenler', data: topLosers, accent: 'red' },
          { type: 'active', icon: Activity, label: 'En Aktifler', data: mostActive, accent: 'amber' },
        ].map(group => {
          const Icon = group.icon
          return (
            <div
              key={group.type}
              className="surface-card p-4 lg:p-5"
              style={{
                borderColor:
                  group.accent === 'emerald' ? 'rgba(0, 201, 138, 0.20)' :
                  group.accent === 'red' ? 'rgba(255, 59, 70, 0.20)' :
                  'var(--border-main)',
              }}
            >
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-[14px] font-bold text-white flex items-center gap-2 tracking-tight">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                    group.accent === 'emerald' ? 'bg-emerald-500/12 border-emerald-500/25' :
                    group.accent === 'red' ? 'bg-red-500/12 border-red-500/25' :
                    'bg-amber-500/12 border-amber-500/25'
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${
                      group.accent === 'emerald' ? 'text-emerald-400' :
                      group.accent === 'red' ? 'text-red-400' :
                      'text-amber-400'
                    }`} />
                  </div>
                  {group.label}
                  <InfoTooltip {...(group.type === 'active' ? TIPS.volume : TIPS.changePercent)} />
                </h3>
                <button
                  onClick={() => navigate('/tarayicilar')}
                  className="text-amber-400 text-[11px] hover:text-amber-300 font-bold flex items-center gap-0.5"
                >
                  Tümü <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="space-y-1.5">
                {group.data.map((stock, idx) => (
                  <LeaderboardRow
                    key={stock.symbol}
                    stock={stock}
                    idx={idx}
                    type={group.type}
                    onClick={() => handleStockNavigation(stock.symbol)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── CHARTS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        <div>
          <div className="flex items-center gap-2 mb-2 ml-1">
            <Activity className="w-4 h-4 text-amber-400" />
            <h3 className="text-[14px] font-bold text-white tracking-tight">BIST 100 — Günlük</h3>
            <span className="pill pill-jade !text-[9px] !py-0.5">
              <span className="status-dot status-dot-live" />
              CANLI
            </span>
          </div>
          <BistChart period="1D" refreshInterval={10000} />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2 ml-1">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            <h3 className="text-[14px] font-bold text-white tracking-tight">BIST 100 — 30 Günlük</h3>
          </div>
          <BistChart period="30D" />
        </div>
      </div>

      {/* ─── SECTORS + SIGNALS ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        {/* Sectors */}
        <div className="surface-card-gold p-5 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-bold text-white flex items-center gap-2 tracking-tight">
              <div className="w-7 h-7 rounded-lg bg-amber-500/12 border border-amber-500/25 flex items-center justify-center">
                <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
              </div>
              Sektör Performansı
              <InfoTooltip {...TIPS.sectors} />
            </h3>
          </div>
          <div className="space-y-3">
            {sectors.slice(0, 6).map((sector, idx) => {
              const isUp = sector.change >= 0
              const barWidth = Math.min(Math.abs(sector.change) * 10, 100)
              return (
                <div key={idx} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] text-slate-200 font-semibold truncate">{sector.sector}</span>
                      <span className={`text-[12px] font-bold num-tabular ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isUp ? '+' : ''}{sector.change?.toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${barWidth}%`,
                          background: isUp
                            ? 'linear-gradient(90deg, #00c98a, #4ade80)'
                            : 'linear-gradient(90deg, #ff3b46, #f87171)',
                        }}
                      />
                    </div>
                    {sector.featuredStock?.symbol && (
                      <button
                        type="button"
                        onClick={() => handleStockNavigation(sector.featuredStock.symbol)}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-[10.5px] font-bold text-amber-400 hover:text-amber-300"
                      >
                        <span>{sector.featuredStock.symbol}</span>
                        <span className={`num-tabular ${sector.featuredStock.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {sector.featuredStock.change >= 0 ? '+' : ''}{sector.featuredStock.change?.toFixed(2)}%
                        </span>
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 num-tabular w-12 text-right flex-shrink-0">{sector.stockCount}<span className="ml-0.5 opacity-60">·H</span></span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Signals */}
        <div className="surface-card-gold p-5 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-bold text-white flex items-center gap-2 tracking-tight">
              <div className="w-7 h-7 rounded-lg bg-amber-500/12 border border-amber-500/25 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
              </div>
              AI Sinyaller
              <InfoTooltip {...TIPS.signals} />
            </h3>
            <button
              onClick={() => navigate('/gunluk-tespitler')}
              className="text-amber-400 text-[11px] hover:text-amber-300 font-bold flex items-center gap-0.5"
            >
              Tümü <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2">
            {signals.length > 0 ? signals.slice(0, 4).map((signal, idx) => {
              const isUp = (signal.changePercent ?? 0) >= 0
              return (
                <button
                  key={idx}
                  onClick={() => navigate(`/teknik-analiz-ai?symbol=${signal.stockSymbol}`)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl transition-all hover:translate-x-0.5"
                  style={{
                    background: 'rgba(var(--bg-input-rgb), 0.45)',
                    border: '1px solid rgba(212, 175, 55, 0.15)',
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-[11px] flex-shrink-0"
                    style={{
                      background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.30), rgba(212, 175, 55, 0.08))',
                      border: '1px solid rgba(212, 175, 55, 0.35)',
                      color: '#fbbf24',
                    }}
                  >
                    {signal.stockSymbol?.slice(0, 2)}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-bold text-white text-[13px] tracking-tight">{signal.stockSymbol}</div>
                    <div className="text-[10.5px] text-slate-400 truncate">{signal.strategy}</div>
                  </div>
                  <Sparkline direction={isUp ? 1 : -1} w={48} h={20} />
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-white text-[13px] num-tabular">{signal.currentPrice?.toFixed(2)}<span className="text-slate-500 text-[10px] ml-0.5">₺</span></div>
                    <div className={`text-[11px] font-bold num-tabular ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isUp ? '+' : ''}{signal.changePercent?.toFixed(2)}%
                    </div>
                  </div>
                </button>
              )
            }) : (
              <div className="text-center py-12 text-slate-500 text-sm">
                <div
                  className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(212, 175, 55, 0.06)', border: '1px solid var(--border-gold)' }}
                >
                  <Target className="w-5 h-5 text-amber-400/50" />
                </div>
                Henüz aktif sinyal yok
                <p className="text-[11px] mt-1 text-slate-600">Algoritma piyasayı tarıyor…</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── COMMODITIES ────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3 ml-1">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h2 className="text-[14px] font-bold text-white tracking-tight">Kıymetli Metaller</h2>
        </div>
        <CommodityWidget />
      </div>

      {/* ─── QUICK ACTIONS ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3 ml-1">
          <Brain className="w-4 h-4 text-amber-400" />
          <h2 className="text-[14px] font-bold text-white tracking-tight">Analiz Araçları</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Activity, label: 'Teknik Analiz', hint: 'RSI · MACD · EMA · BB', to: '/teknik-analiz-ai' },
            { icon: Building2, label: 'Şirket Analizi', hint: 'Mali tablolar · KAP · Skor', to: '/sirket-analizi' },
            { icon: Search, label: 'Tarayıcılar', hint: 'EMA34 · SNR · Tarama', to: '/tarayicilar' },
            { icon: Coins, label: 'Kripto', hint: 'BTC · ETH · Top 50', to: '/kripto' },
          ].map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.to}
                onClick={() => navigate(action.to)}
                className="surface-card p-4 group text-left flex items-start gap-3"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.25), rgba(212, 175, 55, 0.06))',
                    border: '1px solid rgba(212, 175, 55, 0.30)',
                  }}
                >
                  <Icon className="w-5 h-5 text-amber-300" strokeWidth={2.4} />
                </div>
                <div className="min-w-0">
                  <div className="text-white font-bold text-[13px] tracking-tight">{action.label}</div>
                  <div className="text-slate-400 text-[11px] mt-0.5 leading-tight">{action.hint}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
