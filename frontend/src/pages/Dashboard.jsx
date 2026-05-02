import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, Activity, BarChart3, Flame, Crown, Zap, ChevronRight, RefreshCw, Sparkles, Target, Brain, Gem } from 'lucide-react'
import apiClient from '../services/api'
import { TradingViewTicker } from '../components/TradingViewChart'
import BistChart from '../components/charts/BistChart'
import InfoTooltip from '../components/InfoTooltip'
import CommodityWidget from '../components/CommodityWidget'

const API_BASE = ''

const TIPS = {
  bist100: {
    title: 'BIST 100 Endeksi',
    description: 'Borsa İstanbul\'da işlem gören en büyük 100 hissenin piyasa değeri ağırlıklı endeksidir. Türk hisse senedi piyasasının temel göstergesidir.',
    formula: 'Endeks = Σ(HisseFiyatı × DolaşımdakiLot × Katsayı) / BazDeger\nGünlük değişim 09:00–18:00 arası TL bazında hesaplanır.',
    source: 'Borsa İstanbul — BIST 100 metodolojisi'
  },
  bist30: {
    title: 'BIST 30 Endeksi',
    description: 'BIST 100\'ün en likit ve büyük 30 hissesinden oluşur. "Mavi çip" olarak adlandırılır. Kurumsal yatırımcıların en çok takip ettiği endekstir.',
    formula: 'BIST 30 ⊂ BIST 100\nSeçim kriteri: İşlem hacmi + Piyasa değeri\n3 ayda bir revize edilir.',
    source: 'Borsa İstanbul — BIST 30 metodolojisi'
  },
  signals: {
    title: 'Teknik Analiz Sinyalleri',
    description: 'Algoritmik olarak tespit edilen alım/satım fırsatlarıdır. RSI, MACD, EMA Crossover, Bollinger Breakout ve Volume Spike stratejileri kullanılarak üretilir.',
    formula: 'EMA Crossover: Kısa EMA uzun EMA\'yı geçince\nRSI Signal: RSI < 30 veya > 70\nMACD Crossover: MACD sinyal çizgisini geçince\nBollinger: Fiyat bant dışına çıkınca\nVolume Spike: Hacim ortalamanın 2×\'i üzerinde',
    source: 'Borsa Krali algoritma motoru'
  },
  sectors: {
    title: 'Sektör Performansı',
    description: 'Her sektördeki hisselerin ağırlıklı ortalama günlük değişimini gösterir. Hangi sektörlerin güçlü/zayıf olduğunu anlık takip etmenizi sağlar.',
    formula: 'Sektör değişimi = Σ(HisseDeğişimi × HissePiyasaDeğeri) / SektörToplamPiyasaDeğeri\n(Piyasa değeri ağırlıklı ortalama)',
    source: 'Borsa Krali — gerçek zamanlı sektör hesabı'
  },
  changePercent: {
    title: 'Günlük Değişim Yüzdesi',
    description: 'Bir önceki kapanışa göre anlık fiyat değişimini yüzde olarak gösterir. Piyasa açıkken canlı güncellenir, kapalıyken son kapanış fiyatı kullanılır.',
    formula: 'Değişim% = (AnlıkFiyat - ÖncekiKapanış) / ÖncekiKapanış × 100\nBist saatleri: 09:00–18:00 TSİ (hafta içi)',
    source: 'Yahoo Finance gerçek zamanlı veri'
  },
  volume: {
    title: 'İşlem Hacmi (Volume)',
    description: 'Seçilen zaman diliminde el değiştiren hisse adedini gösterir. Yüksek hacim fiyat hareketinin gücünü ve yatırımcı ilgisini gösterir.',
    formula: 'Hacim = Σ(El değiştiren hisse adedi)\nM = Milyon lot\n\nHacim Artışı + Fiyat Artışı → Güçlü trend\nHacim Düşüşü + Fiyat Artışı → Zayıf trend',
    source: 'Borsa İstanbul anlık veri'
  },
}

function StockRow({ stock, idx, type, onClick }) {
  const isUp = stock.changePercent >= 0
  const colors = {
    gainer: { badge: 'bg-emerald-500/15 text-emerald-400', accent: 'text-emerald-400' },
    loser: { badge: 'bg-red-500/15 text-red-400', accent: 'text-red-400' },
    active: { badge: 'bg-amber-500/15 text-amber-400', accent: 'text-amber-400' },
  }[type] || { badge: 'bg-amber-500/15 text-amber-400', accent: 'text-amber-400' }

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-2.5 md:p-3 rounded-xl transition-all group hover:translate-x-0.5"
      style={{
        background: 'rgba(var(--bg-input-rgb), 0.5)',
        border: '1px solid var(--border-main)',
      }}
    >
      <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold num-tabular flex-shrink-0 ${colors.badge}`}>
          {idx + 1}
        </span>
        <div className="min-w-0 text-left">
          <div className="font-semibold text-white text-[13px] md:text-sm truncate">{stock.symbol}</div>
          <div className="text-[10px] md:text-[11px] text-gray-400 truncate max-w-[80px] md:max-w-[120px]">{stock.name}</div>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-bold text-white text-[13px] md:text-sm num-tabular">
          {type === 'active'
            ? `${(stock.volume / 1_000_000)?.toFixed(1)}M`
            : stock.price?.toFixed(2)}
        </div>
        <div className={`text-[11px] md:text-xs font-semibold num-tabular ${type === 'active' ? 'text-amber-400' : colors.accent}`}>
          {type === 'active'
            ? `${stock.price?.toFixed(2)}₺`
            : `${isUp ? '+' : ''}${stock.changePercent?.toFixed(2)}%`}
        </div>
      </div>
    </button>
  )
}

function IndexCard({ data, icon: Icon, title, subtitle, tip }) {
  const isUp = data?.changePercent >= 0
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 md:p-6 group transition-all card-premium"
    >
      {/* Decorative gradient orb */}
      <div
        className="absolute top-0 right-0 w-40 h-40 rounded-full -mr-20 -mt-20 pointer-events-none"
        style={{
          background: isUp
            ? 'radial-gradient(circle, rgba(34, 197, 94, 0.15), transparent 70%)'
            : 'radial-gradient(circle, rgba(239, 68, 68, 0.15), transparent 70%)',
        }}
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center shadow-[0_4px_12px_rgba(245,158,11,0.25)]"
              style={{
                background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.25), rgba(245, 158, 11, 0.1))',
                border: '1px solid rgba(245, 158, 11, 0.3)',
              }}
            >
              <Icon className="w-5 h-5 md:w-6 md:h-6 text-amber-400" strokeWidth={2.4} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-base md:text-lg font-bold text-white">{title}</h3>
                <InfoTooltip {...tip} />
              </div>
              <p className="text-gray-400 text-[11px] md:text-xs">{subtitle}</p>
            </div>
          </div>
          <div
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold border ${
              isUp
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                : 'bg-red-500/15 text-red-400 border-red-500/25'
            }`}
          >
            {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span className="num-tabular">{isUp ? '+' : ''}{data?.changePercent?.toFixed(2)}%</span>
          </div>
        </div>

        <div className="text-3xl md:text-[2.25rem] font-bold text-white leading-none mb-2 num-tabular tracking-tight">
          {data?.value?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] md:text-xs">
          <span className="text-gray-400">
            Değişim:{' '}
            <span className={`font-semibold num-tabular ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {isUp ? '+' : ''}{data?.change?.toFixed(2)}
            </span>
          </span>
          <span className="text-gray-400">
            Önceki: <span className="text-gray-200 num-tabular">{data?.previousClose?.toLocaleString('tr-TR')}</span>
          </span>
          {data?.high && (
            <span className="hidden sm:inline text-gray-400">
              Yük: <span className="text-gray-200 num-tabular">{data.high.toLocaleString('tr-TR')}</span>
            </span>
          )}
          {data?.low && (
            <span className="hidden sm:inline text-gray-400">
              Düş: <span className="text-gray-200 num-tabular">{data.low.toLocaleString('tr-TR')}</span>
            </span>
          )}
        </div>
      </div>
    </div>
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
          <div className="relative mx-auto mb-4 w-20 h-20">
            <div className="absolute inset-0 rounded-full border-[3px] border-amber-500/20"></div>
            <div className="absolute inset-0 rounded-full border-[3px] border-t-amber-500 border-r-amber-400 border-b-transparent border-l-transparent animate-spin"></div>
            <div className="absolute inset-3 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_4px_20px_rgba(245,158,11,0.4)]">
              <Crown className="w-6 h-6 text-slate-950" />
            </div>
          </div>
          <p className="text-gold-shimmer font-semibold text-sm uppercase tracking-wider">Piyasa verileri yükleniyor</p>
          <p className="text-gray-500 text-xs mt-1">Bir kaç saniye sürebilir</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6 w-full max-w-full overflow-hidden">
      {/* TradingView Ticker */}
      <div
        className="rounded-2xl overflow-hidden w-full max-w-full shadow-card"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-main)',
        }}
      >
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

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold leading-tight flex items-center gap-2.5">
            <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 items-center justify-center shadow-[0_4px_14px_rgba(245,158,11,0.45)]">
              <Crown className="w-4.5 h-4.5 text-slate-950" />
            </span>
            <span className="text-gold-gradient">Piyasa Kokpiti</span>
          </h1>
          <p className="text-gray-400 text-[13px] mt-1 ml-12">BIST 100 ve piyasa geneline premium genel bakış</p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {lastUpdate && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-gray-400 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(var(--bg-input-rgb), 0.5)', border: '1px solid var(--border-main)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-ring" />
              Son: <span className="num-tabular text-gray-200">{lastUpdate.toLocaleTimeString('tr-TR')}</span>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3.5 py-2 rounded-xl font-medium flex items-center gap-2 transition-all disabled:opacity-50 text-[13px]"
            style={{
              background: 'rgba(var(--bg-input-rgb), 0.7)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#f59e0b',
            }}
            aria-label="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Yenile</span>
          </button>

          <button
            onClick={() => navigate('/canli-heatmap')}
            className="btn-gold flex items-center gap-2 text-[13px]"
          >
            <Flame className="w-4 h-4" />
            <span className="hidden sm:inline">Canlı Heatmap</span>
          </button>
        </div>
      </div>

      {/* BIST Indices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        <IndexCard data={bist100Data} icon={Crown} title="BIST 100" subtitle="Ana Endeks" tip={TIPS.bist100} />
        <IndexCard data={bist30Data} icon={Gem} title="BIST 30" subtitle="Mavi Çipler" tip={TIPS.bist30} />
      </div>

      {/* Gainers / Losers / Active */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        <div className="card-premium p-4 md:p-5" style={{ borderColor: 'rgba(34, 197, 94, 0.22)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-white flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center border border-emerald-500/25">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="hidden sm:inline">En Çok Yükselenler</span>
              <span className="sm:hidden">Yükselenler</span>
              <InfoTooltip {...TIPS.changePercent} />
            </h3>
            <button
              onClick={() => navigate('/taramalar')}
              className="text-amber-400 text-xs hover:text-amber-300 font-medium flex items-center gap-0.5"
            >
              Tümü <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {topGainers.map((stock, idx) => (
              <StockRow
                key={stock.symbol}
                stock={stock}
                idx={idx}
                type="gainer"
                onClick={() => handleStockNavigation(stock.symbol)}
              />
            ))}
          </div>
        </div>

        <div className="card-premium p-4 md:p-5" style={{ borderColor: 'rgba(239, 68, 68, 0.22)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-white flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center border border-red-500/25">
                <TrendingDown className="w-4 h-4 text-red-400" />
              </div>
              <span className="hidden sm:inline">En Çok Düşenler</span>
              <span className="sm:hidden">Düşenler</span>
              <InfoTooltip {...TIPS.changePercent} />
            </h3>
            <button
              onClick={() => navigate('/taramalar')}
              className="text-amber-400 text-xs hover:text-amber-300 font-medium flex items-center gap-0.5"
            >
              Tümü <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {topLosers.map((stock, idx) => (
              <StockRow
                key={stock.symbol}
                stock={stock}
                idx={idx}
                type="loser"
                onClick={() => handleStockNavigation(stock.symbol)}
              />
            ))}
          </div>
        </div>

        <div className="card-premium p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-white flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center border border-amber-500/25">
                <Activity className="w-4 h-4 text-amber-400" />
              </div>
              <span className="hidden sm:inline">En Aktif Hisseler</span>
              <span className="sm:hidden">En Aktif</span>
              <InfoTooltip {...TIPS.volume} />
            </h3>
            <button
              onClick={() => navigate('/taramalar')}
              className="text-amber-400 text-xs hover:text-amber-300 font-medium flex items-center gap-0.5"
            >
              Tümü <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {mostActive.map((stock, idx) => (
              <StockRow
                key={stock.symbol}
                stock={stock}
                idx={idx}
                type="active"
                onClick={() => handleStockNavigation(stock.symbol)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* BIST Grafikleri */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <div>
          <h3 className="text-[15px] font-semibold text-white mb-2 ml-1 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            BIST 100 — Günlük (Canlı)
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          </h3>
          <BistChart period="1D" refreshInterval={10000} />
        </div>

        <div>
          <h3 className="text-[15px] font-semibold text-white mb-2 ml-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            BIST 100 — 30 Günlük
          </h3>
          <BistChart period="30D" />
        </div>
      </div>

      {/* Sectors & Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
        <div className="card-premium p-4 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[15px] font-semibold text-white flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center border border-amber-500/25">
                <BarChart3 className="w-4 h-4 text-amber-400" />
              </div>
              Sektör Performansı
              <InfoTooltip {...TIPS.sectors} />
            </h3>
          </div>
          <div className="space-y-3.5">
            {sectors.slice(0, 6).map((sector, idx) => {
              const isUp = sector.change >= 0
              const barWidth = Math.min(Math.abs(sector.change) * 10, 100)
              return (
                <div key={idx} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] md:text-[13px] text-gray-200 font-medium truncate">{sector.sector}</span>
                      <span className={`text-[12px] font-bold num-tabular ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isUp ? '+' : ''}{sector.change?.toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          isUp ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-red-500 to-red-400'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    {sector.featuredStock?.symbol && (
                      <button
                        type="button"
                        onClick={() => handleStockNavigation(sector.featuredStock.symbol)}
                        className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] md:text-[11px] font-medium text-amber-400 transition-colors hover:text-amber-300"
                        style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}
                        title={`${sector.featuredStock.name} (${sector.featuredStock.symbol})`}
                      >
                        <span className="truncate font-semibold">{sector.featuredStock.symbol}</span>
                        <span className={`num-tabular ${sector.featuredStock.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {sector.featuredStock.change >= 0 ? '+' : ''}{sector.featuredStock.change?.toFixed(2)}%
                        </span>
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] md:text-[11px] text-gray-500 w-12 text-right flex-shrink-0 num-tabular">{sector.stockCount} hisse</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card-premium p-4 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[15px] font-semibold text-white flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center border border-amber-500/25">
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
              Aktif Sinyaller
              <InfoTooltip {...TIPS.signals} />
            </h3>
            <button
              onClick={() => navigate('/gunluk-tespitler')}
              className="text-amber-400 text-xs hover:text-amber-300 font-medium flex items-center gap-0.5"
            >
              Tümü <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-2">
            {signals.length > 0 ? signals.slice(0, 4).map((signal, idx) => (
              <button
                key={idx}
                onClick={() => navigate(`/teknik-analiz-ai?symbol=${signal.stockSymbol}`)}
                className="w-full flex items-center justify-between p-3 rounded-xl transition-all group hover:translate-x-0.5"
                style={{
                  background: 'rgba(var(--bg-input-rgb), 0.5)',
                  border: '1px solid rgba(245, 158, 11, 0.15)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[11px]"
                    style={{
                      background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(245, 158, 11, 0.1))',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      color: '#fbbf24',
                    }}
                  >
                    {signal.stockSymbol?.slice(0, 2)}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-white text-[13px]">{signal.stockSymbol}</div>
                    <div className="text-[10px] text-gray-400 font-medium">{signal.strategy}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-white text-[13px] num-tabular">{signal.currentPrice?.toFixed(2)} ₺</div>
                  <div className={`text-[11px] font-semibold num-tabular ${signal.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {signal.changePercent >= 0 ? '+' : ''}{signal.changePercent?.toFixed(2)}%
                  </div>
                </div>
              </button>
            )) : (
              <div className="text-center py-10 text-gray-400 text-sm">
                <Target className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                Aktif sinyal bulunamadı
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Emtia */}
      <div>
        <h2 className="text-base md:text-lg font-bold text-white mb-3 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center border border-amber-500/25">
            <Sparkles className="w-4 h-4 text-amber-400" />
          </span>
          Kıymetli Metaller
        </h2>
        <CommodityWidget />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {[
          { icon: Activity, label: 'Teknik Analiz', hint: 'RSI · MACD · EMA', to: '/teknik-analiz-ai' },
          { icon: Brain, label: 'Temel Analiz', hint: 'Z-Score · F-Score', to: '/temel-analiz-ai' },
          { icon: Crown, label: 'AI Skor', hint: 'Yapay zeka analizi', to: '/hisse-ai-skor' },
          { icon: Flame, label: 'Canlı Heatmap', hint: 'BIST 30 Canlı', to: '/canli-heatmap' },
        ].map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.to}
              onClick={() => navigate(action.to)}
              className="card-premium p-3 md:p-4 flex flex-col items-center justify-center text-center min-h-[90px] md:min-h-[120px] group"
            >
              <div
                className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center mb-2 md:mb-3 transition-transform group-hover:scale-110"
                style={{
                  background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.08))',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                }}
              >
                <Icon className="w-5 h-5 md:w-6 md:h-6 text-amber-400" strokeWidth={2.2} />
              </div>
              <div className="text-white font-semibold text-[11px] leading-tight md:text-sm">{action.label}</div>
              <div className="text-gray-400 text-[10px] md:text-[11px] hidden sm:block mt-0.5">{action.hint}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
