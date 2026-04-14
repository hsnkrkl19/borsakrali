import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, TrendingDown, Activity, BarChart3, Flame, Crown, Zap, ChevronRight, RefreshCw } from 'lucide-react'
import apiClient from '../services/api'
import { TradingViewTicker } from '../components/TradingViewChart'
import BistChart from '../components/charts/BistChart'
import InfoTooltip from '../components/InfoTooltip'
import CommodityWidget from '../components/CommodityWidget'

const API_BASE = ''

// Tooltip içerikleri
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

    return () => {
      clearInterval(interval)
    }
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

    // Load signals independently so they don't block the main dashboard
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
          <div className="w-16 h-16 border-4 border-gold-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Veriler yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6 w-full max-w-full overflow-hidden">
      {/* TradingView Ticker - Live Price Banner */}
      <div className="bg-surface-100 rounded-2xl border border-gold-500/20 overflow-hidden w-full max-w-full">
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">
            Piyasa Kokpiti
          </h1>
          <p className="text-gray-400 text-sm mt-1">BIST 100 ve piyasa geneline genel bakış</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Son Güncelleme */}
          <div className="hidden sm:flex items-center gap-2 text-sm text-gray-400">
            <span>Son: {lastUpdate?.toLocaleTimeString('tr-TR')}</span>
          </div>

          {/* Yenile Butonu */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-dark-800 border border-gold-500/30 text-gold-400 px-4 py-2 rounded-xl font-medium flex items-center gap-2 hover:bg-gold-500/10 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Yenile</span>
          </button>

          {/* Canlı Heatmap Butonu */}
          <button
            onClick={() => navigate('/canli-heatmap')}
            className="bg-gradient-to-r from-gold-500 to-gold-600 text-dark-950 px-4 py-2 rounded-xl font-semibold flex items-center gap-2 hover:shadow-glow-gold transition-all"
          >
            <Flame className="w-5 h-5" />
            <span className="hidden sm:inline">Canlı Heatmap</span>
          </button>
        </div>
      </div>

      {/* Top Section - BIST Indices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* BIST 100 Card */}
        <div className="bg-surface-100 rounded-2xl p-4 md:p-6 border border-gold-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 bg-gold-500/5 rounded-full -mr-12 -mt-12"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-gold-500/20 rounded-xl flex items-center justify-center">
                  <Crown className="w-5 h-5 md:w-6 md:h-6 text-gold-400" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-lg md:text-xl font-bold text-white">BIST 100</h3>
                    <InfoTooltip {...TIPS.bist100} />
                  </div>
                  <p className="text-gray-400 text-xs md:text-sm">Ana Endeks</p>
                </div>
              </div>
              <div className={`flex items-center gap-1 px-2 md:px-3 py-1 rounded-full text-sm ${bist100Data?.changePercent >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {bist100Data?.changePercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="font-semibold">{bist100Data?.changePercent >= 0 ? '+' : ''}{bist100Data?.changePercent?.toFixed(2)}%</span>
              </div>
            </div>
            <div className="text-3xl md:text-4xl font-bold text-white mb-2">
              {bist100Data?.value?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm">
              <span className="text-gray-400">Değişim:<span className={bist100Data?.change >= 0 ? 'text-green-400' : 'text-red-400'}>{bist100Data?.change >= 0 ? '+' : ''}{bist100Data?.change?.toFixed(2)}</span></span>
              <span className="text-gray-400 hidden sm:inline">Önceki:{bist100Data?.previousClose?.toLocaleString('tr-TR')}</span>
            </div>
          </div>
        </div>

        {/* BIST 30 Card */}
        <div className="bg-surface-100 rounded-2xl p-4 md:p-6 border border-gold-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 md:w-32 h-24 md:h-32 bg-gold-500/5 rounded-full -mr-12 -mt-12"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-gold-500/20 rounded-xl flex items-center justify-center">
                  <Zap className="w-5 h-5 md:w-6 md:h-6 text-gold-400" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-lg md:text-xl font-bold text-white">BIST 30</h3>
                    <InfoTooltip {...TIPS.bist30} />
                  </div>
                  <p className="text-gray-400 text-xs md:text-sm">Mavi Çipler</p>
                </div>
              </div>
              <div className={`flex items-center gap-1 px-2 md:px-3 py-1 rounded-full text-sm ${bist30Data?.changePercent >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {bist30Data?.changePercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="font-semibold">{bist30Data?.changePercent >= 0 ? '+' : ''}{bist30Data?.changePercent?.toFixed(2)}%</span>
              </div>
            </div>
            <div className="text-3xl md:text-4xl font-bold text-white mb-2">
              {bist30Data?.value?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs md:text-sm">
              <span className="text-gray-400">Değişim:<span className={bist30Data?.change >= 0 ? 'text-green-400' : 'text-red-400'}>{bist30Data?.change >= 0 ? '+' : ''}{bist30Data?.change?.toFixed(2)}</span></span>
              <span className="text-gray-400 hidden sm:inline">Önceki:{bist30Data?.previousClose?.toLocaleString('tr-TR')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Section - Gainers, Losers, Active */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* Top Gainers */}
        <div className="bg-surface-100 rounded-2xl p-4 md:p-5 border border-green-500/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <span className="hidden sm:inline">En Çok Yükselenler</span>
              <span className="sm:hidden">Yükselenler</span>
              <InfoTooltip {...TIPS.changePercent} />
            </h3>
            <button
              onClick={() => navigate('/taramalar')}
              className="text-gold-400 text-sm hover:text-gold-300"
            >
              Tümünü Gör
            </button>
          </div>
          <div className="space-y-2 md:space-y-3">
            {topGainers.map((stock, idx) => (
              <div
                key={stock.symbol}
                onClick={() => navigate(`/teknik-analiz-ai?symbol=${stock.symbol}`)}
                className="flex items-center justify-between p-2 md:p-3 bg-surface-200 rounded-xl hover:bg-surface-300 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 md:gap-3">
                  <span className="text-gray-500 font-mono text-xs md:text-sm w-4 md:w-5">{idx + 1}</span>
                  <div>
                    <div className="font-semibold text-white text-sm md:text-base">{stock.symbol}</div>
                    <div className="text-[10px] md:text-xs text-gray-400 truncate max-w-[60px] md:max-w-[100px]">{stock.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-white text-sm md:text-base">{stock.price?.toFixed(2)}</div>
                  <div className="text-green-400 text-xs md:text-sm font-semibold">+{stock.changePercent?.toFixed(2)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Losers */}
        <div className="bg-surface-100 rounded-2xl p-4 md:p-5 border border-red-500/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-red-400" />
              <span className="hidden sm:inline">En Çok Düşenler</span>
              <span className="sm:hidden">Düşenler</span>
              <InfoTooltip {...TIPS.changePercent} />
            </h3>
            <button
              onClick={() => navigate('/taramalar')}
              className="text-gold-400 text-sm hover:text-gold-300"
            >
              Tümünü Gör
            </button>
          </div>
          <div className="space-y-2 md:space-y-3">
            {topLosers.map((stock, idx) => (
              <div
                key={stock.symbol}
                onClick={() => navigate(`/teknik-analiz-ai?symbol=${stock.symbol}`)}
                className="flex items-center justify-between p-2 md:p-3 bg-surface-200 rounded-xl hover:bg-surface-300 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 md:gap-3">
                  <span className="text-gray-500 font-mono text-xs md:text-sm w-4 md:w-5">{idx + 1}</span>
                  <div>
                    <div className="font-semibold text-white text-sm md:text-base">{stock.symbol}</div>
                    <div className="text-[10px] md:text-xs text-gray-400 truncate max-w-[60px] md:max-w-[100px]">{stock.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-white text-sm md:text-base">{stock.price?.toFixed(2)}</div>
                  <div className="text-red-400 text-xs md:text-sm font-semibold">{stock.changePercent?.toFixed(2)}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Most Active */}
        <div className="bg-surface-100 rounded-2xl p-4 md:p-5 border border-gold-500/20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-gold-400" />
              <span className="hidden sm:inline">En Aktif Hisseler</span>
              <span className="sm:hidden">En Aktif</span>
              <InfoTooltip {...TIPS.volume} />
            </h3>
            <button
              onClick={() => navigate('/taramalar')}
              className="text-gold-400 text-sm hover:text-gold-300"
            >
              Tümünü Gör
            </button>
          </div>
          <div className="space-y-2 md:space-y-3">
            {mostActive.map((stock, idx) => (
              <div
                key={stock.symbol}
                onClick={() => navigate(`/teknik-analiz-ai?symbol=${stock.symbol}`)}
                className="flex items-center justify-between p-2 md:p-3 bg-surface-200 rounded-xl hover:bg-surface-300 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 md:gap-3">
                  <span className="text-gray-500 font-mono text-xs md:text-sm w-4 md:w-5">{idx + 1}</span>
                  <div>
                    <div className="font-semibold text-white text-sm md:text-base">{stock.symbol}</div>
                    <div className="text-[10px] md:text-xs text-gray-400 truncate max-w-[60px] md:max-w-[100px]">{stock.name}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-white text-sm md:text-base">{stock.price?.toFixed(2)}</div>
                  <div className="text-gold-400 text-xs">{(stock.volume / 1000000)?.toFixed(1)}M</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BIST Grafikleri: Canlı ve 30 Günlük */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Sol: Günlük Canlı */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-2 ml-1 flex items-center gap-2">
            <Activity className="w-5 h-5 text-gold-500" />
            BIST 100 - Günlük (Canlı)
          </h3>
          <BistChart period="1D" refreshInterval={10000} />
        </div>

        {/* Sağ: 30 Günlük */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-2 ml-1 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gold-500" />
            BIST 100 - 30 Günlük
          </h3>
          <BistChart period="30D" />
        </div>
      </div>

      {/* Bottom Section - Sectors & Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Sector Performance */}
        <div className="bg-surface-100 rounded-2xl p-4 md:p-6 border border-gold-500/20">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-gold-400" />
              Sektör Performansı
              <InfoTooltip {...TIPS.sectors} />
            </h3>
          </div>
          <div className="space-y-3 md:space-y-4">
            {sectors.slice(0, 6).map((sector, idx) => (
              <div key={idx} className="flex items-center gap-3 md:gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs md:text-sm text-gray-300 truncate max-w-[150px]">{sector.sector}</span>
                    <span className={`text-xs md:text-sm font-semibold ${sector.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {sector.change >= 0 ? '+' : ''}{sector.change?.toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-2 bg-surface-300 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${sector.change >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(Math.abs(sector.change) * 10, 100)}%` }}
                    ></div>
                  </div>
                  {sector.featuredStock?.symbol && (
                    <button
                      type="button"
                      onClick={() => handleStockNavigation(sector.featuredStock.symbol)}
                      className="mt-2 inline-flex max-w-full items-center gap-1 rounded-lg border border-gold-500/20 bg-gold-500/5 px-2 py-1 text-[10px] md:text-xs text-gold-400 transition-colors hover:border-gold-500/40 hover:text-gold-300"
                      title={`${sector.featuredStock.name} (${sector.featuredStock.symbol})`}
                      aria-label={`${sector.featuredStock.symbol} hissesi için teknik analize git`}
                    >
                      <span className="truncate">{sector.featuredStock.symbol}</span>
                      <span className={sector.featuredStock.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {sector.featuredStock.change >= 0 ? '+' : ''}{sector.featuredStock.change?.toFixed(2)}%
                      </span>
                    </button>
                  )}
                </div>
                <span className="text-[10px] md:text-xs text-gray-500 w-10 md:w-12 text-right">{sector.stockCount} hisse</span>
              </div>
            ))}
          </div>
        </div>

        {/* Active Signals */}
        <div className="bg-surface-100 rounded-2xl p-4 md:p-6 border border-gold-500/20">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-gold-400" />
              Aktif Sinyaller
              <InfoTooltip {...TIPS.signals} />
            </h3>
            <button
              onClick={() => navigate('/gunluk-tespitler')}
              className="text-gold-400 text-sm hover:text-gold-300 flex items-center gap-1"
            >
              Tümünü Gör <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 md:space-y-3">
            {signals.length > 0 ? signals.slice(0, 4).map((signal, idx) => (
              <div
                key={idx}
                onClick={() => navigate(`/teknik-analiz-ai?symbol=${signal.stockSymbol}`)}
                className="flex items-center justify-between p-3 md:p-4 bg-surface-200 rounded-xl hover:bg-surface-300 transition-colors cursor-pointer border border-gold-500/10"
              >
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-gold-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-gold-400 font-bold text-xs md:text-sm">{signal.stockSymbol?.slice(0, 2)}</span>
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm md:text-base">{signal.stockSymbol}</div>
                    <div className="text-[10px] md:text-xs text-gray-400">{signal.strategy}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-white text-sm md:text-base">{signal.currentPrice?.toFixed(2)} TL</div>
                  <div className={`text-xs ${signal.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {signal.changePercent >= 0 ? '+' : ''}{signal.changePercent?.toFixed(2)}%
                  </div>
                </div>
              </div>
            )) : (
              <div className="text-center py-8 text-gray-400">
                Aktif sinyal bulunamadı
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Kıymetli Metaller */}
      <div className="mt-2">
        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <span className="text-2xl">🏅</span> Kıymetli Metaller
        </h2>
        <CommodityWidget />
      </div>

      {/* Quick Actions - Mobile Optimized */}
      <div className="grid grid-cols-4 gap-2 md:gap-4">
        <button
          onClick={() => navigate('/teknik-analiz-ai')}
          className="bg-surface-100 p-2.5 md:p-4 rounded-xl border border-gold-500/20 hover:border-gold-500/50 transition-all group min-h-[88px] md:min-h-[120px] flex flex-col items-center justify-center text-center"
        >
          <Activity className="w-5 h-5 md:w-8 md:h-8 text-gold-400 mb-2 md:mb-3 group-hover:scale-110 transition-transform" />
          <div className="text-white font-semibold text-[11px] leading-tight sm:text-xs md:text-base">Teknik Analiz</div>
          <div className="text-gray-400 text-xs hidden lg:block">RSI, MACD, EMA...</div>
        </button>
        <button
          onClick={() => navigate('/temel-analiz-ai')}
          className="bg-surface-100 p-2.5 md:p-4 rounded-xl border border-gold-500/20 hover:border-gold-500/50 transition-all group min-h-[88px] md:min-h-[120px] flex flex-col items-center justify-center text-center"
        >
          <BarChart3 className="w-5 h-5 md:w-8 md:h-8 text-gold-400 mb-2 md:mb-3 group-hover:scale-110 transition-transform" />
          <div className="text-white font-semibold text-[11px] leading-tight sm:text-xs md:text-base">Temel Analiz</div>
          <div className="text-gray-400 text-xs hidden lg:block">Z-Score, F-Score...</div>
        </button>
        <button
          onClick={() => navigate('/hisse-ai-skor')}
          className="bg-surface-100 p-2.5 md:p-4 rounded-xl border border-gold-500/20 hover:border-gold-500/50 transition-all group min-h-[88px] md:min-h-[120px] flex flex-col items-center justify-center text-center"
        >
          <Crown className="w-5 h-5 md:w-8 md:h-8 text-gold-400 mb-2 md:mb-3 group-hover:scale-110 transition-transform" />
          <div className="text-white font-semibold text-[11px] leading-tight sm:text-xs md:text-base">AI Skor</div>
          <div className="text-gray-400 text-xs hidden lg:block">Yapay zeka analizi</div>
        </button>
        <button
          onClick={() => navigate('/canli-heatmap')}
          className="bg-surface-100 p-2.5 md:p-4 rounded-xl border border-gold-500/20 hover:border-gold-500/50 transition-all group min-h-[88px] md:min-h-[120px] flex flex-col items-center justify-center text-center"
        >
          <Flame className="w-5 h-5 md:w-8 md:h-8 text-gold-400 mb-2 md:mb-3 group-hover:scale-110 transition-transform" />
          <div className="text-white font-semibold text-sm md:text-base">Canlı Heatmap</div>
          <div className="text-gray-400 text-xs hidden sm:block">BIST 30 Canlı</div>
        </button>
      </div>
    </div>
  )
}
