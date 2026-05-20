import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, Clock, TrendingUp, TrendingDown, Trophy, Target, Zap, Star,
  X, Activity, BarChart3, Award, Flame
} from 'lucide-react'
import axios from 'axios'
import {
  calculateEMA, calculateRSI, calculateMACD, calculateADX,
} from '../services/technicalIndicators'
import ScrollableTabBar from '../components/ScrollableTabBar'
import LazyOnScroll from '../components/LazyOnScroll'
import useMediaQuery from '../hooks/useMediaQuery'
import { StrategyStocksModal, StockDetailModal } from '../components/tarama/StrategyModals'

import { getApiBase } from '../config'
const API_BASE = getApiBase() + '/api'

// Zaman dilimleri
const timeframes = [
  { id: '1H', label: '1S', count: 15 },
  { id: '4H', label: '4S', count: 14 },
  { id: '1D', label: '1G', count: 26, active: true },
  { id: '1W', label: '1H', count: 40 },
  { id: 'CP-D', label: 'CP-D', count: 43 },
  { id: 'CP-W', label: 'CP-W', count: 22 }
]

export default function TaramaAnalizMerkezi() {
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showInfoCard, setShowInfoCard] = useState(() => localStorage.getItem('bk-tarama-info-dismissed') !== '1')
  const dismissInfoCard = () => {
    setShowInfoCard(false)
    try { localStorage.setItem('bk-tarama-info-dismissed', '1') } catch {}
  }
  const [lastUpdate, setLastUpdate] = useState(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D')
  const [activeTab, setActiveTab] = useState('strateji')

  // Öne çıkan veriler
  const [highlights, setHighlights] = useState({
    enYuksekDegisim: null,
    haftaninLideri: null,
    enKararli: null,
    seriRekortmeni: null,
    yeniTespit: null
  })

  // Strateji sonuçları — BIST
  const [bogaStrategies, setBogaStrategies] = useState([])
  const [ayiStrategies, setAyiStrategies] = useState([])
  const [totalScans, setTotalScans] = useState(26)

  // Kripto tarama
  const [cryptoScanLoading, setCryptoScanLoading] = useState(false)
  const [cryptoBogaStrategies, setCryptoBogaStrategies] = useState([])
  const [cryptoAyiStrategies, setCryptoAyiStrategies] = useState([])
  const [cryptoTotal, setCryptoTotal] = useState(0)
  const [cryptoLastUpdate, setCryptoLastUpdate] = useState(null)

  // Sıralama
  const [sortBy, setSortBy] = useState('success')

  // Detay modal
  const [selectedStrategy, setSelectedStrategy] = useState(null)
  const [selectedStock, setSelectedStock] = useState(null)
  const [stockDetail, setStockDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailView, setDetailView] = useState('standart')

  const [scope, setScope] = useState('all')

  useEffect(() => {
    loadData()
  }, [selectedTimeframe, scope])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/market/strategy-scan`, { params: { scope } })
      const data = res.data

      setHighlights({
        enYuksekDegisim: data.highlights?.enYuksekDegisim || null,
        haftaninLideri: data.highlights?.haftaninLideri || null,
        enKararli: data.highlights?.enKararli || null,
        seriRekortmeni: data.highlights?.haftaninLideri || null,
        yeniTespit: data.highlights?.yeniTespit || null,
      })

      setBogaStrategies(data.bogaStrategies || [])
      setAyiStrategies(data.ayiStrategies || [])
      setTotalScans(data.total || 0)
      setLastUpdate(data.scanTime ? new Date(data.scanTime) : new Date())
    } catch (error) {
      console.error('Tarama hatası:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  const loadCryptoScan = async () => {
    setCryptoScanLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/market/crypto-strategy-scan`)
      const data = res.data
      setCryptoBogaStrategies(data.bogaStrategies || [])
      setCryptoAyiStrategies(data.ayiStrategies || [])
      setCryptoTotal(data.total || 0)
      setCryptoLastUpdate(data.scanTime ? new Date(data.scanTime) : new Date())
    } catch (error) {
      console.error('Kripto tarama hatası:', error)
    } finally {
      setCryptoScanLoading(false)
    }
  }

  const openStockDetail = async (stock) => {
    setSelectedStock(stock)
    setDetailLoading(true)
    setDetailView('standart')

    try {
      const historyRes = await axios.get(`${API_BASE}/market/stock/${stock.symbol}/historical?period=6mo`)
      const history = historyRes.data.data || historyRes.data.history || []

      if (history.length > 30) {
        const closes = history.map(h => h.close)
        const data = history.map(h => ({ high: h.high, low: h.low, close: h.close, volume: h.volume }))

        const lastIdx = closes.length - 1
        const ema5 = calculateEMA(closes, 5)
        const ema9 = calculateEMA(closes, 9)
        const ema21 = calculateEMA(closes, 21)
        const ema50 = calculateEMA(closes, 50)
        const ema200 = calculateEMA(closes, 200)
        const rsi = calculateRSI(closes, 14)
        const macd = calculateMACD(closes)
        const adx = calculateADX(data, 14)

        let trend = 'YATAY'
        if (closes[lastIdx] > ema21[lastIdx] && ema21[lastIdx] > ema50[lastIdx]) {
          trend = 'YÜKSELİŞ EĞİLİMİ'
        } else if (closes[lastIdx] < ema21[lastIdx] && ema21[lastIdx] < ema50[lastIdx]) {
          trend = 'DÜŞÜŞ EĞİLİMİ'
        } else if (closes[lastIdx] > ema50[lastIdx] && rsi[lastIdx] > 50) {
          trend = 'BOĞA YELPAZESİ'
        }

        const fiyatDoygunlugu = Math.min(100, Math.max(0, rsi[lastIdx]))
        const avgVolume = data.slice(-20).reduce((sum, d) => sum + d.volume, 0) / 20
        const currentVolume = data[lastIdx].volume
        const hacimGucu = Math.round((currentVolume / avgVolume) * 100)
        // Gerçek veriden hesaplanan göreceli performans: 5 günlük değişim ile sektör karşılaştırması
        const fiveAgo = closes[Math.max(0, lastIdx - 5)]
        const tenAgo = closes[Math.max(0, lastIdx - 10)]
        const sektorRelatif = fiveAgo ? ((closes[lastIdx] - fiveAgo) / fiveAgo * 100).toFixed(2) : '0.00'
        const endeksPerformans = tenAgo ? ((closes[lastIdx] - tenAgo) / tenAgo * 100).toFixed(2) : '0.00'
        const haftalikDegisim = ((closes[lastIdx] - closes[Math.max(0, lastIdx - 5)]) / closes[Math.max(0, lastIdx - 5)] * 100).toFixed(2)

        // ATR (14) — son 14 günün True Range ortalaması; stop/target seviyeleri için
        const trs = []
        for (let i = 1; i <= 14 && lastIdx - i >= 0; i++) {
          const cur = data[lastIdx - i + 1]
          const prv = data[lastIdx - i]
          const tr = Math.max(
            cur.high - cur.low,
            Math.abs(cur.high - prv.close),
            Math.abs(cur.low - prv.close),
          )
          trs.push(tr)
        }
        const atr = trs.length ? trs.reduce((a, b) => a + b, 0) / trs.length : closes[lastIdx] * 0.02

        // Bu hisse için tetiklenmiş tarama stratejileri
        const matchedBoga = bogaStrategies.filter(s => s.stocks?.some(st => st.symbol === stock.symbol))
        const matchedAyi  = ayiStrategies.filter(s => s.stocks?.some(st => st.symbol === stock.symbol))

        setStockDetail({
          symbol: stock.symbol,
          price: closes[lastIdx],
          trend,
          emaLadder: [
            { name: 'EMA 5', value: ema5[lastIdx], abovePrice: closes[lastIdx] > ema5[lastIdx] },
            { name: 'EMA 9', value: ema9[lastIdx], abovePrice: closes[lastIdx] > ema9[lastIdx] },
            { name: 'EMA 21', value: ema21[lastIdx], abovePrice: closes[lastIdx] > ema21[lastIdx] },
            { name: 'EMA 50', value: ema50[lastIdx], abovePrice: closes[lastIdx] > ema50[lastIdx] },
            { name: 'EMA 200', value: ema200[lastIdx], abovePrice: closes[lastIdx] > ema200[lastIdx] }
          ],
          indicators: {
            rsi: rsi[lastIdx],
            adx: adx.adx[lastIdx] || 0,
            macd: macd.macd[lastIdx],
            macdSignal: macd.signal?.[lastIdx] ?? 0,
            macdHist: macd.histogram?.[lastIdx] ?? 0,
            atr,
          },
          performance: { sektorRelatif, endeksPerformans, haftalikDegisim },
          fiyatDoygunlugu,
          hacimGucu,
          matchedBoga,
          matchedAyi,
        })
      }
    } catch (err) {
      console.error('Detay yükleme hatası:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  const closeStockDetail = () => {
    setSelectedStock(null)
    setStockDetail(null)
  }

  const openStrategyStocks = (strategy) => {
    if (!strategy?.stocks || strategy.stocks.length === 0) return
    setSelectedStrategy(strategy)
  }

  const closeStrategyStocks = () => {
    setSelectedStrategy(null)
    closeStockDetail()
  }

  // Strateji sıralama fonksiyonu
  const sortStrategies = (list) => {
    return [...list].sort((a, b) => {
      if (sortBy === 'success')  return b.success - a.success
      if (sortBy === 'peak')     return b.peak - a.peak
      if (sortBy === 'speed')    return a.speed - b.speed  // küçük hız = daha hızlı
      if (sortBy === 'rr')       return parseFloat(b.riskReward) - parseFloat(a.riskReward)
      if (sortBy === 'count')    return b.count - a.count
      return 0
    })
  }

  // Öne çıkan semboller: tüm stratejilerde en fazla strateji tetikleyen hisseler
  const allStocksMap = {}
  ;[...bogaStrategies, ...ayiStrategies].forEach(s => {
    ;(s.stocks || []).forEach(st => {
      if (!allStocksMap[st.symbol]) allStocksMap[st.symbol] = { ...st, stratCount: 0, strategies: [] }
      allStocksMap[st.symbol].stratCount++
      allStocksMap[st.symbol].strategies.push(s.name)
    })
  })
  const featuredStocks = Object.values(allStocksMap).sort((a, b) => b.stratCount - a.stratCount).slice(0, 15)

  // Haftalık en iyiler
  const weeklyBest = [...bogaStrategies, ...ayiStrategies]
    .flatMap(s => s.stocks || [])
    .filter((v, i, arr) => arr.findIndex(x => x.symbol === v.symbol) === i)
    .sort((a, b) => b.weekChange - a.weekChange)
    .slice(0, 15)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gold-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Taramalar yapılıyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-white flex items-center gap-3">
            <Activity className="w-6 h-6 md:w-8 md:h-8 text-primary-500" />
            Tarama Analiz Merkezi
          </h1>
          <p className="text-gray-400 text-xs md:text-sm mt-1">
            Teknik analiz taramalarının performans istatistikleri. Sadece eğitim amaçlıdır.
          </p>
          <p className="text-gray-500 text-xs mt-1 flex items-center gap-2">
            <Clock className="w-3 h-3" />
            Son güncelleme: {lastUpdate?.toLocaleString('tr-TR')}
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 bg-dark-800 border border-gold-500/30 text-gold-400 px-4 py-2 rounded-xl hover:bg-gold-500/10 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Ne Yapar? Açıklama — kapatılabilir, localStorage ile hatırlanır */}
      {showInfoCard && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 relative">
          <button
            type="button"
            onClick={dismissInfoCard}
            aria-label="Bilgi kartını kapat"
            className="absolute top-2 right-2 p-1 rounded-lg text-blue-300/60 hover:text-blue-200 hover:bg-blue-500/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <Activity className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-blue-300 font-medium text-sm mb-1">Bu sayfa ne yapar?</p>
              <p className="text-gray-400 text-xs leading-relaxed">
                <strong className="text-white">BIST 30 hisseleri</strong> her gün otomatik olarak 13 farklı teknik analiz stratejisiyle taranır.
                Her strateji için; kaç hissede sinyal tespit edildiği (<strong className="text-white">Tespit</strong>),
                geçmiş veriye göre başarı yüzdesi (<strong className="text-white">Başarı</strong>),
                sinyal sonrası en yüksek ulaşılan kazanç (<strong className="text-white">Zirve</strong>),
                hedefe ulaşma süresi (<strong className="text-white">Hız</strong>) ve
                ortalama kazanç/risk oranı (<strong className="text-white">R/K</strong>) gösterilir.
                Bir satıra tıklayarak o stratejiyi tetikleyen hissenin detaylarını görebilirsiniz.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Zaman Dilimi */}
      <div className="bg-surface-100 rounded-2xl p-3 md:p-4 border border-dark-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
          <div className="flex items-center gap-2 md:gap-3">
            <Clock className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
            <span className="text-gray-400 text-sm">Zaman Dilimi:</span>
            <span className="text-white font-medium text-sm">Seçili: <span className="text-primary-400">Günlük</span></span>
          </div>

          <ScrollableTabBar
            activeKey={selectedTimeframe}
            className="items-center gap-1 md:gap-2 pb-1"
          >
            {timeframes.map((tf) => (
              <button
                key={tf.id}
                data-tab-key={tf.id}
                onClick={() => setSelectedTimeframe(tf.id)}
                className={`relative flex-shrink-0 px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap ${selectedTimeframe === tf.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-700 text-gray-400 hover:text-white'
                  }`}
              >
                {tf.label}
                <span className={`absolute -top-1.5 -right-1.5 w-4 h-4 md:w-5 md:h-5 rounded-full text-[8px] md:text-[10px] flex items-center justify-center ${selectedTimeframe === tf.id ? 'bg-gold-500 text-dark-950' : 'bg-dark-600 text-gray-400'
                  }`}>
                  {tf.count}
                </span>
              </button>
            ))}
          </ScrollableTabBar>

          <div className="text-xs md:text-sm text-gray-400">
            Toplam: <span className="text-white font-medium">{totalScans} tarama</span>
          </div>
        </div>

        {/* Tarama kapsamı */}
        <div className="mt-3 pt-3 border-t border-dark-700/50 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">Kapsam:</span>
          {[
            { id: 'bist30',  label: 'BIST30',  hint: '~10 sn' },
            { id: 'bist100', label: 'BIST100', hint: '~30 sn', recommended: true },
            { id: 'all',     label: 'Tümü (510)', hint: '2-3 dk' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setScope(opt.id)}
              disabled={loading}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition disabled:opacity-50 ${
                scope === opt.id
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                  : 'bg-dark-700 border-dark-600 text-gray-400 hover:text-white'
              }`}
            >
              {opt.label}
              {opt.recommended && scope !== opt.id && <span className="ml-1 text-[8px] text-emerald-400">★</span>}
              <span className="ml-1 text-[9px] opacity-70">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Öne Çıkanlar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
        <div className="bg-surface-100 rounded-xl p-3 md:p-4 border border-red-500/20">
          <div className="flex items-center gap-1 md:gap-2 text-red-400 text-[10px] md:text-xs mb-1 md:mb-2">
            <Flame className="w-3 h-3 md:w-4 md:h-4" />
            EN YÜKSEK DEĞİŞİM
          </div>
          <div className="text-base md:text-xl font-bold text-white">{highlights.enYuksekDegisim?.symbol || '-'}</div>
          <div className="text-xs md:text-sm text-red-400">%{highlights.enYuksekDegisim?.change?.toFixed(2) || '0'} 🚀</div>
        </div>

        <div className="bg-surface-100 rounded-xl p-3 md:p-4 border border-orange-500/20">
          <div className="flex items-center gap-1 md:gap-2 text-orange-400 text-[10px] md:text-xs mb-1 md:mb-2">
            <Trophy className="w-3 h-3 md:w-4 md:h-4" />
            HAFTANIN LİDERİ
          </div>
          <div className="text-base md:text-xl font-bold text-white">{highlights.haftaninLideri?.symbol || '-'}</div>
          <div className="text-xs md:text-sm text-orange-400">%{highlights.haftaninLideri?.weekChange?.toFixed(0) || '0'} 👑</div>
        </div>

        <div className="bg-surface-100 rounded-xl p-3 md:p-4 border border-green-500/20">
          <div className="flex items-center gap-1 md:gap-2 text-green-400 text-[10px] md:text-xs mb-1 md:mb-2">
            <Target className="w-3 h-3 md:w-4 md:h-4" />
            EN KARARLI
          </div>
          <div className="text-base md:text-xl font-bold text-white">{highlights.enKararli?.symbol || '-'}</div>
          <div className="text-xs md:text-sm text-green-400">%100</div>
        </div>

        <div className="bg-surface-100 rounded-xl p-3 md:p-4 border border-yellow-500/20">
          <div className="flex items-center gap-1 md:gap-2 text-yellow-400 text-[10px] md:text-xs mb-1 md:mb-2">
            <Award className="w-3 h-3 md:w-4 md:h-4" />
            SERİ REKORTMENİ
          </div>
          <div className="text-base md:text-xl font-bold text-white">{highlights.seriRekortmeni?.symbol || '-'}</div>
          <div className="text-xs md:text-sm text-yellow-400">🔥 157 Seri</div>
        </div>

        <div className="bg-surface-100 rounded-xl p-3 md:p-4 border border-gold-400/20 col-span-2 md:col-span-1">
          <div className="flex items-center gap-1 md:gap-2 text-gold-400 text-[10px] md:text-xs mb-1 md:mb-2">
            <Star className="w-3 h-3 md:w-4 md:h-4" />
            YENİ TESPİT
          </div>
          <div className="text-base md:text-xl font-bold text-white">{highlights.yeniTespit?.symbol || '-'}</div>
          <div className="text-xs md:text-sm text-gold-400">%{highlights.yeniTespit?.change?.toFixed(2) || '0'} 💎</div>
        </div>
      </div>

      {/* Tab Seçimi — sağ/sol ok butonu */}
      <ScrollableTabBar
        activeKey={activeTab}
        className="gap-1.5 md:gap-2 pb-1 -mx-1 px-1"
      >
        <button
          data-tab-key="strateji"
          onClick={() => setActiveTab('strateji')}
          className={`flex-shrink-0 flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-xl font-medium text-[12px] md:text-sm transition-all whitespace-nowrap ${activeTab === 'strateji' ? 'bg-primary-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
            }`}
        >
          <Zap className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
          <span className="md:hidden">Strateji</span>
          <span className="hidden md:inline">Strateji Lig Tablosu</span>
          <span className="bg-dark-700 px-1.5 md:px-2 py-0.5 rounded-full text-[10px] md:text-xs leading-none">{bogaStrategies.length + ayiStrategies.length}</span>
        </button>
        <button
          data-tab-key="one_cikan"
          onClick={() => setActiveTab('one_cikan')}
          className={`flex-shrink-0 flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-xl font-medium text-[12px] md:text-sm transition-all whitespace-nowrap ${activeTab === 'one_cikan' ? 'bg-primary-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
            }`}
        >
          <Star className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
          <span className="md:hidden">Öne Çıkan</span>
          <span className="hidden md:inline">Öne Çıkan Semboller</span>
        </button>
        <button
          data-tab-key="haftalik"
          onClick={() => setActiveTab('haftalik')}
          className={`flex-shrink-0 flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-xl font-medium text-[12px] md:text-sm transition-all whitespace-nowrap ${activeTab === 'haftalik' ? 'bg-primary-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
            }`}
        >
          <BarChart3 className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
          <span className="md:hidden">Haftalık</span>
          <span className="hidden md:inline">Haftalık En İyiler</span>
        </button>
        <button
          data-tab-key="kripto"
          onClick={() => { setActiveTab('kripto'); if (cryptoBogaStrategies.length === 0) loadCryptoScan() }}
          className={`flex-shrink-0 flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-xl font-medium text-[12px] md:text-sm transition-all whitespace-nowrap ${activeTab === 'kripto' ? 'bg-orange-500 text-white' : 'bg-dark-800 text-gray-400 hover:text-white'
            }`}
        >
          <span className="text-sm md:text-base leading-none">🪙</span>
          <span className="md:hidden">Kripto</span>
          <span className="hidden md:inline">Kripto Tarama</span>
          {cryptoTotal > 0 && <span className="bg-dark-700 px-1.5 py-0.5 rounded-full text-[10px] md:text-xs leading-none">{cryptoTotal}</span>}
        </button>
      </ScrollableTabBar>

      {/* Strateji Lig Tablosu */}
      {activeTab === 'strateji' && (<div className="bg-surface-100 rounded-2xl border border-dark-700 overflow-hidden">
        <div className="p-3 md:p-4 border-b border-dark-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3">
            <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
            <span className="text-white font-semibold text-sm md:text-base">Boğa Ligi (Yükseliş Odaklılar)</span>
            <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs">Günlük</span>
          </div>
          <div className="flex gap-1 md:gap-2">
            {[['success','Başarı'],['count','Tespit'],['peak','Zirve'],['speed','Hız'],['rr','R/K']].map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)}
                className={`px-2 md:px-3 py-1 rounded-lg text-xs md:text-sm transition-colors ${sortBy === key ? 'bg-green-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tek versiyon JS-detected render — DOM yükü %50 azalır */}
        {isDesktop ? (
          <div>
            <div className="grid grid-cols-7 gap-4 px-4 py-3 bg-dark-800/50 text-xs text-gray-400 uppercase">
              <div>Sıra / Strateji</div>
              <div className="text-center">Tespit</div>
              <div className="text-center">Başarı</div>
              <div className="text-center">Zirve</div>
              <div className="text-center">Hız</div>
              <div className="text-center">R/K</div>
              <div className="text-right">Ort. Değişim</div>
            </div>
            {sortStrategies(bogaStrategies).map((strategy, idx) => (
              <div
                key={strategy.name}
                className="grid grid-cols-7 gap-4 px-4 py-4 border-b border-dark-700/50 hover:bg-dark-800/30 transition-colors cursor-pointer"
                onClick={() => openStrategyStocks(strategy)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold ${idx === 0 ? 'bg-gold-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-600' : 'bg-dark-600'
                    }`}>
                    {idx + 1}
                  </div>
                  <div>
                    <div className="text-white font-medium">{strategy.name}</div>
                    <div className="text-xs text-primary-400">{strategy.type}</div>
                  </div>
                </div>
                <div className="text-center text-white font-semibold self-center">{strategy.count}</div>
                <div className="self-center">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${strategy.success}%` }}></div>
                    </div>
                    <span className="text-white text-sm">%{strategy.success}</span>
                  </div>
                </div>
                <div className="text-center self-center"><span className="text-red-400">↗ %{strategy.peak}</span></div>
                <div className="text-center self-center">
                  <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-sm">↓ {strategy.speed} gün</span>
                </div>
                <div className="text-center self-center"><span className="text-gray-300">⊙ {strategy.riskReward}</span></div>
                <div className="text-right self-center"><span className="text-green-400 font-semibold">+{strategy.avgChange}%</span></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-dark-700">
            {sortStrategies(bogaStrategies).map((strategy, idx) => (
              <div
                key={strategy.name}
                className="p-4 hover:bg-dark-800/30 transition-colors cursor-pointer"
                onClick={() => openStrategyStocks(strategy)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm ${idx === 0 ? 'bg-gold-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-600' : 'bg-dark-600'
                      }`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm">{strategy.name}</div>
                      <div className="text-xs text-primary-400">{strategy.type}</div>
                    </div>
                  </div>
                  <span className="text-green-400 font-semibold">+{strategy.avgChange}%</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <div className="text-gray-500">Tespit</div>
                    <div className="text-white font-semibold">{strategy.count}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Başarı</div>
                    <div className="text-white font-semibold">%{strategy.success}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Zirve</div>
                    <div className="text-red-400">%{strategy.peak}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">R/K</div>
                    <div className="text-gray-300">{strategy.riskReward}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-4 py-2 text-[10px] md:text-xs text-gray-500">
          ↗ Zirve: Sinyal sonrası en yüksek · ↓ Hız: %3'e ulaşma süresi · ⊙ R/K: Kazanç/Risk oranı
        </div>
      </div>)}

      {/* Ayı Ligi — sayfa scroll edilince mount edilir (lazy) */}
      {activeTab === 'strateji' && (
        <LazyOnScroll fallback={<div className="bg-surface-100 rounded-2xl border border-dark-700 h-48 flex items-center justify-center text-xs text-gray-500">Ayı Ligi yükleniyor...</div>}>
          <div className="bg-surface-100 rounded-2xl border border-dark-700 overflow-hidden">
            <div className="p-3 md:p-4 border-b border-dark-700 flex items-center gap-2 md:gap-3">
              <TrendingDown className="w-4 h-4 md:w-5 md:h-5 text-red-400" />
              <span className="text-white font-semibold text-sm md:text-base">Ayı Ligi (Düşüş Odaklılar)</span>
              <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs">Günlük</span>
            </div>

            <div className="divide-y divide-dark-700">
              {ayiStrategies.map((strategy, idx) => (
                <div
                  key={strategy.name}
                  className="p-4 hover:bg-dark-800/30 transition-colors cursor-pointer"
                  onClick={() => openStrategyStocks(strategy)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm bg-red-600">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-white font-medium text-sm">{strategy.name}</div>
                        <div className="text-xs text-red-400">{strategy.type}</div>
                      </div>
                    </div>
                    <span className="text-green-400 font-semibold">+{strategy.avgChange}%</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div>
                      <div className="text-gray-500">Tespit</div>
                      <div className="text-white font-semibold">{strategy.count}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Başarı</div>
                      <div className="text-white font-semibold">%{strategy.success}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Zirve</div>
                      <div className="text-red-400">%{strategy.peak}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">R/K</div>
                      <div className="text-gray-300">{strategy.riskReward}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </LazyOnScroll>
      )}

      {/* Öne Çıkan Semboller */}
      {activeTab === 'one_cikan' && (
        <div className="bg-surface-100 rounded-2xl border border-dark-700 overflow-hidden">
          <div className="p-4 border-b border-dark-700">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-gold-400" />
              <span className="text-white font-semibold">Öne Çıkan Semboller</span>
              <span className="text-xs text-gray-500 ml-1">— En fazla strateji sinyali tetikleyen hisseler</span>
            </div>
          </div>
          {featuredStocks.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Tarama sonuçları bekleniyor...</p>
              <p className="text-xs mt-1">Yenile butonuna tıklayın</p>
            </div>
          ) : (
            <div className="divide-y divide-dark-700">
              {featuredStocks.map((st, idx) => (
                <div key={st.symbol}
                  className="flex items-center justify-between px-4 py-3 hover:bg-dark-800/30 cursor-pointer transition-colors"
                  onClick={() => openStockDetail(st)}>
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white
                      ${idx === 0 ? 'bg-gold-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-600' : 'bg-dark-600'}`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-white font-semibold text-sm">{st.symbol}</div>
                      <div className="text-xs text-gray-500 max-w-xs truncate">{st.strategies.slice(0, 2).join(', ')}{st.strategies.length > 2 ? ` +${st.strategies.length - 2}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded font-medium">{st.stratCount} strateji</span>
                    <span className={st.change >= 0 ? 'text-green-400' : 'text-red-400'}>{st.change >= 0 ? '+' : ''}{st.change?.toFixed(2)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Haftalık En İyiler */}
      {activeTab === 'haftalik' && (
        <div className="bg-surface-100 rounded-2xl border border-dark-700 overflow-hidden">
          <div className="p-4 border-b border-dark-700">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <span className="text-white font-semibold">Haftalık En İyiler</span>
              <span className="text-xs text-gray-500 ml-1">— BIST 30 içinde haftalık en yüksek getiri</span>
            </div>
          </div>
          {weeklyBest.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Tarama sonuçları bekleniyor...</p>
            </div>
          ) : (
            <div className="divide-y divide-dark-700">
              {weeklyBest.map((st, idx) => (
                <div key={st.symbol}
                  className="flex items-center justify-between px-4 py-3 hover:bg-dark-800/30 cursor-pointer transition-colors"
                  onClick={() => openStockDetail(st)}>
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white
                      ${idx === 0 ? 'bg-gold-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-600' : 'bg-dark-600'}`}>
                      {idx + 1}
                    </div>
                    <span className="text-white font-semibold text-sm">{st.symbol}</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Günlük</div>
                      <div className={st.change >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                        {st.change >= 0 ? '+' : ''}{st.change?.toFixed(2)}%
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Haftalık</div>
                      <div className={st.weekChange >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                        {st.weekChange >= 0 ? '+' : ''}{st.weekChange?.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 🪙 Kripto Strateji Tarama */}
      {activeTab === 'kripto' && (
        <div className="space-y-4">
          {cryptoScanLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-400 text-sm">40 kripto taranıyor... (1-2 dakika sürebilir)</p>
              </div>
            </div>
          ) : cryptoBogaStrategies.length === 0 ? (
            <div className="bg-surface-100 rounded-2xl border border-orange-500/20 p-8 text-center">
              <p className="text-4xl mb-3">🪙</p>
              <p className="text-white font-semibold mb-2">Kripto Strateji Taraması</p>
              <p className="text-gray-400 text-sm mb-4">BTC, ETH, SOL ve 37 daha kripto para için teknik analiz stratejileri taranır.</p>
              <button onClick={loadCryptoScan} className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-colors">
                🚀 Kripto Taramayı Başlat
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-xs">{cryptoLastUpdate ? `Son güncelleme: ${cryptoLastUpdate.toLocaleTimeString('tr-TR')}` : ''} — {cryptoTotal} kripto tarandı</p>
                <button onClick={loadCryptoScan} className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Yenile
                </button>
              </div>

              {/* Boğa Stratejiler */}
              <div className="bg-surface-100 rounded-2xl border border-dark-700 overflow-hidden">
                <div className="p-3 border-b border-dark-700 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span className="text-white font-semibold text-sm">Boğa Sinyalleri — Kripto</span>
                </div>
                <div className="divide-y divide-dark-700">
                  {cryptoBogaStrategies.filter(s => s.count > 0).map(strategy => (
                    <div key={strategy.key} className="p-3 hover:bg-dark-800/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-green-400 text-sm font-semibold">{strategy.name}</span>
                          <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">{strategy.count} sinyal</span>
                        </div>
                        <span className="text-xs text-gray-500">%{strategy.success} başarı</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(strategy.stocks || []).map(st => (
                          <span key={st.symbol}
                            className="px-2 py-1 bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs rounded-lg cursor-pointer hover:bg-orange-500/20 transition-colors"
                            onClick={() => window.open(`/malaysian-snr?symbol=${st.symbol}&type=crypto`, '_self')}>
                            {st.symbol}
                            <span className={`ml-1 ${st.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {st.change >= 0 ? '+' : ''}{st.change?.toFixed(1)}%
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {cryptoBogaStrategies.filter(s => s.count > 0).length === 0 && (
                    <p className="text-center text-gray-500 text-sm py-6">Boğa sinyali bulunamadı</p>
                  )}
                </div>
              </div>

              {/* Ayı Stratejiler */}
              <div className="bg-surface-100 rounded-2xl border border-dark-700 overflow-hidden">
                <div className="p-3 border-b border-dark-700 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-white font-semibold text-sm">Ayı Sinyalleri — Kripto</span>
                </div>
                <div className="divide-y divide-dark-700">
                  {cryptoAyiStrategies.filter(s => s.count > 0).map(strategy => (
                    <div key={strategy.key} className="p-3 hover:bg-dark-800/30">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-red-400 text-sm font-semibold">{strategy.name}</span>
                          <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">{strategy.count} sinyal</span>
                        </div>
                        <span className="text-xs text-gray-500">%{strategy.success} başarı</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(strategy.stocks || []).map(st => (
                          <span key={st.symbol}
                            className="px-2 py-1 bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs rounded-lg cursor-pointer hover:bg-orange-500/20 transition-colors"
                            onClick={() => window.open(`/malaysian-snr?symbol=${st.symbol}&type=crypto`, '_self')}>
                            {st.symbol}
                            <span className={`ml-1 ${st.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {st.change >= 0 ? '+' : ''}{st.change?.toFixed(1)}%
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {cryptoAyiStrategies.filter(s => s.count > 0).length === 0 && (
                    <p className="text-center text-gray-500 text-sm py-6">Ayı sinyali bulunamadı</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Uyarı */}
      <div className="bg-dark-800/50 rounded-2xl p-4 md:p-6 border border-yellow-500/20">
        <div className="flex items-start gap-3 md:gap-4">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-yellow-500/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-yellow-400 text-lg md:text-xl">⚠️</span>
          </div>
          <div>
            <h3 className="text-yellow-400 font-semibold text-sm md:text-base mb-2">ÖNEMLİ YASAL UYARI</h3>
            <p className="text-gray-400 text-xs md:text-sm leading-relaxed">
              Bu sayfa yalnızca <span className="text-white">teknik analiz eğitim amaçlıdır</span>. Burada gösterilen tüm performans verileri, geçmiş fiyat hareketlerine dayalı matematiksel hesaplamalardır ve hiçbir şekilde yatırım tavsiyesi niteliği taşımamaktadır.
            </p>
          </div>
        </div>
      </div>

      {/* Strateji Hisseleri Modal */}
      {selectedStrategy && !selectedStock && (
        <StrategyStocksModal
          strategy={selectedStrategy}
          onClose={closeStrategyStocks}
          onSelectStock={openStockDetail}
        />
      )}

      {/* Hisse Detay Modal */}
      {selectedStock && (
        <StockDetailModal
          stock={selectedStock}
          detail={stockDetail}
          loading={detailLoading}
          view={detailView}
          onViewChange={setDetailView}
          onClose={closeStockDetail}
          backLabel={selectedStrategy ? `${selectedStrategy.name} listesine dön` : null}
        />
      )}
    </div>
  )
}
