import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Filter, TrendingUp, TrendingDown, Target, Activity, Bell, BellRing, RefreshCw, X, Volume2, Star, Clock, Zap, Wifi, WifiOff, Info, CheckCircle } from 'lucide-react'
import { io } from 'socket.io-client'

import { getApiBase, getSocketBase } from '../config'
const API_BASE = getApiBase() + '/api'
const SOCKET_URL = getSocketBase()

export default function GunlukTespitler() {
  const [activeTab, setActiveTab] = useState('akilli-suzgec')
  const [showInfo, setShowInfo] = useState(false)
  const [signals, setSignals] = useState([])
  const [liveAlerts, setLiveAlerts] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [showAlertPopup, setShowAlertPopup] = useState(false)
  const [latestAlert, setLatestAlert] = useState(null)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [watchlistSymbols, setWatchlistSymbols] = useState(new Set())
  const [addingToWatchlist, setAddingToWatchlist] = useState(null)
  const telegramStatus = { active: false }
  const [socketConnected, setSocketConnected] = useState(false)
  const socketRef = useRef(null)
  const audioRef = useRef(null)
  const audioEnabledRef = useRef(true)
  const [filters, setFilters] = useState({
    search: '',
    strategy: 'all',
    status: 'all'
  })

  // audioEnabled degistiginde ref'i guncelle (socket yeniden olusturulmadan)
  useEffect(() => {
    audioEnabledRef.current = audioEnabled
  }, [audioEnabled])

  // Socket.IO baglantisi - sadece mount/unmount'ta olustur
  useEffect(() => {
    // Audio elementi olustur
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdHOAgICDgX57dnJ3fIOIiomGgX59e3x+gIKDg4OBf3x6eXp8foCCg4OBf3x6eXp8foCCg4OBf3x6eXp8foCCg4M=')

    // Socket.IO baglantisi olustur
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    })

    socketRef.current.on('connect', () => {
      console.log('[Socket.IO] Baglanildi:', socketRef.current.id)
      setSocketConnected(true)
    })

    socketRef.current.on('disconnect', () => {
      console.log('[Socket.IO] Baglanti koptu')
      setSocketConnected(false)
    })

    // Yeni sinyal aldiginda
    socketRef.current.on('new_signal', (signal) => {
      console.log('[Socket.IO] Yeni sinyal:', signal)

      // Listeye ekle
      setLiveAlerts(prev => [signal, ...prev].slice(0, 50))
      setUnreadCount(prev => prev + 1)

      // Popup goster
      showNewAlert(signal)

      // Ses cal (ref kullan - stale closure'dan kacin)
      if (audioEnabledRef.current && audioRef.current) {
        audioRef.current.play().catch(() => { })
      }
    })

    // Son sinyalleri al
    socketRef.current.on('recent_signals', (signals) => {
      console.log('[Socket.IO] Son sinyaller:', signals.length)
      setLiveAlerts(prev => [...signals, ...prev].slice(0, 50))
    })

    // Baglanti bilgisini al
    socketRef.current.on('connected', (info) => {
      console.log('[Socket.IO] Baglanti bilgisi:', info)
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [])

  // Watchlist sembollerini yukle
  const loadWatchlist = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/user/watchlist`)
      if (res.ok) {
        const data = await res.json()
        const symbols = (data.watchlist || []).map(s => (s.symbol || s).toUpperCase())
        setWatchlistSymbols(new Set(symbols))
      }
    } catch (e) {
      // sessiz hata
    }
  }, [])

  // Sinyal hissesini takip listesine ekle
  const addToWatchlist = async (symbol) => {
    if (!symbol || addingToWatchlist) return
    setAddingToWatchlist(symbol)
    try {
      const res = await fetch(`${API_BASE}/user/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      })
      if (res.ok) {
        setWatchlistSymbols(prev => new Set([...prev, symbol.toUpperCase()]))
      }
    } catch (e) {
      console.error('Watchlist ekleme hatası:', e)
    } finally {
      setAddingToWatchlist(null)
    }
  }

  // Sinyal ve alarm verilerini yukle
  const loadData = useCallback(async () => {
    try {
      const signalsRes = await fetch(`${API_BASE}/market/signals?limit=50`)

      // Response kontrolu
      if (signalsRes.ok) {
        const signalsData = await signalsRes.json()
        setSignals(signalsData.signals || [])
        // Eger socket baglanmamissa, market sinyallerini live alert olarak da goster
        if (!socketConnected) {
          const alerts = (signalsData.signals || []).map(s => ({
            id: s.id,
            type: s.type || 'BUY',
            symbol: s.stockSymbol || s.symbol,
            name: s.stockName || s.stockSymbol,
            strategy: s.strategy,
            description: s.description || s.strategy,
            price: s.currentPrice || s.price,
            changePercent: s.changePercent,
            timestamp: s.detectedAt || s.timestamp || new Date().toISOString(),
            sector: s.sector || '-',
            read: true
          }))
          setLiveAlerts(prev => prev.length === 0 ? alerts : prev)
        }
      }
    } catch (error) {
      console.error('Veri yukleme hatasi:', error)
    } finally {
      setLoading(false)
    }
  }, [socketConnected])


  // Manuel sinyal kontrolu yap
  const checkSignals = async () => {
    setChecking(true)
    try {
      const res = await fetch(`${API_BASE}/signals/check`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        if (data.signalsFound > 0) {
          // Yeni sinyaller bulundu, verileri yeniden yukle
          await loadData()
        }
      }
    } catch (error) {
      console.error('Sinyal kontrolu hatasi:', error)
    } finally {
      setChecking(false)
    }
  }

  // Yeni alarm popup'i goster
  const showNewAlert = (alert) => {
    setLatestAlert(alert)
    setShowAlertPopup(true)

    // 10 saniye sonra otomatik kapat
    setTimeout(() => {
      setShowAlertPopup(false)
    }, 10000)
  }

  // Alarmi okundu olarak isaretle
  const markAsRead = async (alertId) => {
    try {
      await fetch(`${API_BASE}/alerts/${alertId}/read`, { method: 'POST' })
      setUnreadCount(prev => Math.max(0, prev - 1))
      setLiveAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read: true } : a))
    } catch (error) {
      console.error('Okundu isaretle hatasi:', error)
    }
  }

  // Ilk yukleme ve periyodik guncelleme
  useEffect(() => {
    loadData()
    loadWatchlist()

    // Her 30 saniyede bir alarmlari kontrol et
    const interval = setInterval(loadData, 30000)

    return () => clearInterval(interval)
  }, [loadData, loadWatchlist])

  const tabs = [
    { id: 'akilli-suzgec', label: 'Akıllı Süzgeç', icon: Filter },
    { id: 'canli-takip', label: 'Canlı Alarmlar', icon: BellRing, badge: unreadCount },
    { id: 'detayli-analiz', label: 'Detaylı Analiz', icon: Target }
  ]

  // Filtrelenmis sinyaller
  const filteredSignals = signals.filter(signal => {
    if (filters.search && !signal.stockSymbol?.toLowerCase().includes(filters.search.toLowerCase())) {
      return false
    }
    if (filters.strategy !== 'all' && signal.strategy !== filters.strategy) {
      return false
    }
    if (filters.status !== 'all' && signal.status !== filters.status) {
      return false
    }
    return true
  })

  return (
    <div className="space-y-6 relative">
      {/* Canlı Alarm Popup */}
      {showAlertPopup && latestAlert && (
        <div className="fixed top-4 right-4 z-50 animate-pulse">
          <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl p-4 shadow-2xl border border-green-500 max-w-md">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <BellRing className="w-6 h-6 text-white animate-bounce" />
                <span className="text-white font-bold text-lg">YENİ SİNYAL!</span>
              </div>
              <button
                onClick={() => setShowAlertPopup(false)}
                className="text-white/70 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl font-bold text-white">{latestAlert.symbol}</span>
                <span className="text-xs bg-white/20 px-2 py-1 rounded text-white">
                  {latestAlert.strategy}
                </span>
              </div>
              <p className="text-white/80 text-sm mb-2">{latestAlert.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold">{latestAlert.price?.toFixed(2)} TL</span>
                <span className="text-xs text-white/60">
                  {new Date(latestAlert.timestamp).toLocaleTimeString('tr-TR')}
                </span>
              </div>
            </div>
            <button
              onClick={() => { markAsRead(latestAlert.id); setShowAlertPopup(false); }}
              className="w-full mt-3 bg-white/20 hover:bg-white/30 text-white py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Tamam
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            Günlük Tespitler
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                {unreadCount} Yeni
              </span>
            )}
          </h1>
          <p className="text-gray-400 text-xs md:text-sm mt-1">Yapay zeka destekli teknik analiz tarama sistemi</p>
        </div>

        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          {/* Bilgi Butonu */}
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${showInfo ? 'bg-blue-500 text-white' : 'bg-dark-700 text-gray-400 hover:text-white'}`}
          >
            <Info className="w-4 h-4" />
            <span className="text-xs font-semibold hidden md:inline">Sinyal Mantığı</span>
          </button>

          {/* WebSocket Durumu */}
          <div className={`flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg ${socketConnected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
            }`}>
            {socketConnected ? <Wifi className="w-3 h-3 md:w-4 md:h-4" /> : <WifiOff className="w-3 h-3 md:w-4 md:h-4" />}
            <span className="text-[10px] md:text-xs font-medium">
              {socketConnected ? 'Canlı' : 'Yok'}
            </span>
          </div>

          {/* Telegram Durumu */}
          <div className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg ${telegramStatus.active ? 'bg-green-500/20 text-green-500' : 'bg-gray-500/20 text-gray-400'
            }`}>
            <Bell className="w-4 h-4" />
            <span className="text-xs font-medium">
              Telegram {telegramStatus.active ? 'Aktif' : 'Pasif'}
            </span>
          </div>

          {/* Ses Ayari */}
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-1.5 md:p-2 rounded-lg ${audioEnabled ? 'bg-primary-500/20 text-primary-500' : 'bg-dark-700 text-gray-400'}`}
            title={audioEnabled ? 'Ses Acik' : 'Ses Kapali'}
          >
            <Volume2 className="w-4 h-4 md:w-5 md:h-5" />
          </button>

          {/* Sinyal Kontrolu */}
          <button
            onClick={checkSignals}
            disabled={checking}
            className="flex items-center gap-1 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 text-white rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3 h-3 md:w-4 md:h-4 ${checking ? 'animate-spin' : ''}`} />
            <span className="text-xs md:text-sm font-medium">Tara</span>
          </button>
        </div>
      </div>

      {/* Sinyal Mantığı Bilgi Notu */}
      {showInfo && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 md:p-6 animate-fadeIn">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-500" />
              Sinyaller Neye Göre Veriliyor?
            </h3>
            <button onClick={() => setShowInfo(false)} className="text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-dark-800 p-3 rounded-lg border border-dark-700">
              <h4 className="font-bold text-yellow-500 mb-1">RSI (Göreceli Güç Endeksi)</h4>
              <p className="text-xs text-gray-400">
                <span className="text-white font-semibold">Al Sinyali:</span> RSI değeri 30'un altına düştüğünde (Aşırı Satım).<br />
                <span className="text-white font-semibold">Sat Sinyali:</span> RSI değeri 70'in üzerine çıktığında (Aşırı Alım).
              </p>
            </div>

            <div className="bg-dark-800 p-3 rounded-lg border border-dark-700">
              <h4 className="font-bold text-blue-500 mb-1">MACD Kesişimi</h4>
              <p className="text-xs text-gray-400">
                <span className="text-white font-semibold">Bullish (Yükseliş):</span> MACD çizgisi Sinyal çizgisini yukarı kestiğinde.<br />
                <span className="text-white font-semibold">Bearish (Düşüş):</span> MACD çizgisi Sinyal çizgisini aşağı kestiğinde.
              </p>
            </div>

            <div className="bg-dark-800 p-3 rounded-lg border border-dark-700">
              <h4 className="font-bold text-purple-500 mb-1">EMA (Hareketli Ortalamalar)</h4>
              <p className="text-xs text-gray-400">
                <span className="text-white font-semibold">Golden Cross:</span> 50 günlük ortalama, 200 günlük ortalamayı yukarı kestiğinde.<br />
                <span className="text-white font-semibold">Death Cross:</span> 50 günlük ortalama, 200 günlük ortalamayı aşağı kestiğinde.
              </p>
            </div>

            <div className="bg-dark-800 p-3 rounded-lg border border-dark-700">
              <h4 className="font-bold text-purple-400 mb-1">Bollinger Bantları</h4>
              <p className="text-xs text-gray-400">
                <span className="text-white font-semibold">Alt Bant Kırılımı:</span> Fiyat alt bandın altına indiğinde (Alım Fırsatı).<br />
                <span className="text-white font-semibold">Üst Bant Kırılımı:</span> Fiyat üst bandın üzerine çıktığında (Satış Fırsatı).
              </p>
            </div>

            <div className="bg-dark-800 p-3 rounded-lg border border-dark-700">
              <h4 className="font-bold text-green-500 mb-1">Hacim Patlaması</h4>
              <p className="text-xs text-gray-400">
                Son 20 günlük ortalama hacmin <span className="text-white font-semibold">2 katına</span> çıkan anormal hacim hareketlerinde sinyal üretilir.
              </p>
            </div>
          </div>
          <div className="mt-4 text-[10px] text-gray-500 italic border-t border-dark-700 pt-2">
            * Not: Bu sinyaller tamamen matematiksel göstergelere dayalıdır ve yatırım tavsiyesi içermez. Nihai karar yatırımcıya aittir.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-x-auto pb-1 border-b border-dark-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-1 md:space-x-2 px-3 md:px-4 py-2 md:py-3 border-b-2 transition-colors relative whitespace-nowrap ${activeTab === tab.id
              ? 'border-primary-600 text-white'
              : 'border-transparent text-gray-400 hover:text-white'
              }`}
          >
            <tab.icon className="w-3 h-3 md:w-4 md:h-4" />
            <span className="font-medium text-sm md:text-base">{tab.label}</span>
            {tab.badge > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] md:text-xs w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Akilli Suzgec Tab */}
      {activeTab === 'akilli-suzgec' && (
        <>
          {/* Filters */}
          <div className="card">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {/* Search */}
              <div className="col-span-2">
                <label className="block text-[10px] md:text-xs text-gray-400 mb-1.5 md:mb-2">SEMBOL ARA</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="THYAO, GARAN..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="input pl-10 w-full text-sm"
                  />
                </div>
              </div>

              {/* Strategy Filter */}
              <div>
                <label className="block text-[10px] md:text-xs text-gray-400 mb-1.5 md:mb-2">STRATEJI</label>
                <select
                  value={filters.strategy}
                  onChange={(e) => setFilters({ ...filters, strategy: e.target.value })}
                  className="input w-full text-sm"
                >
                  <option value="all">Tümü</option>
                  <option value="RSI Signal">RSI</option>
                  <option value="MACD Crossover">MACD</option>
                  <option value="EMA Crossover">EMA</option>
                  <option value="Bollinger Oversold">Bollinger</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-[10px] md:text-xs text-gray-400 mb-1.5 md:mb-2">DURUM</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="input w-full text-sm"
                >
                  <option value="all">Tümü</option>
                  <option value="active">Aktif</option>
                  <option value="closed">Kapandı</option>
                </select>
              </div>
            </div>
          </div>

          {/* Signals Table */}
          <div className="card">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
              </div>
            ) : filteredSignals.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">Sinyal bulunamadı</p>
                <button
                  onClick={checkSignals}
                  className="mt-4 text-primary-500 hover:text-primary-400 text-sm"
                >
                  Yeni tarama baslat
                </button>
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                  {filteredSignals.map((signal, idx) => (
                    <div key={signal.id || idx} className="bg-dark-800 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-primary-600 rounded flex items-center justify-center text-white text-xs font-bold">
                            {signal.stockSymbol?.slice(0, 2)}
                          </div>
                          <div>
                            <span className="font-mono font-semibold text-white text-sm">{signal.stockSymbol}</span>
                            <p className="text-[10px] text-gray-500 truncate max-w-[80px]">{signal.stockName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-white block">
                            {signal.currentPrice?.toFixed(2) || signal.detectionPrice?.toFixed(2)} TL
                          </span>
                          <span className={`text-xs font-bold ${signal.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {signal.changePercent >= 0 ? '+' : ''}{signal.changePercent?.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-300 flex items-center gap-1">
                            <Zap className="w-3 h-3 text-yellow-500" />
                            {signal.strategy}
                          </span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${signal.rsi < 30 ? 'bg-green-500/20 text-green-500' : signal.rsi > 70 ? 'bg-red-500/20 text-red-500' : 'bg-gray-500/20 text-gray-400'}`}>
                            RSI: {signal.rsi?.toFixed(0) || '-'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${signal.status === 'active'
                            ? 'bg-green-500/20 text-green-500'
                            : 'bg-gray-500/20 text-gray-400'
                            }`}>
                            {signal.status === 'active' ? 'AKTIF' : 'KAPANDI'}
                          </span>
                          <button
                            onClick={() => addToWatchlist(signal.stockSymbol)}
                            disabled={addingToWatchlist === signal.stockSymbol || watchlistSymbols.has(signal.stockSymbol?.toUpperCase())}
                            title={watchlistSymbols.has(signal.stockSymbol?.toUpperCase()) ? 'Takip listesinde' : 'Takip listesine ekle'}
                            className={`transition-colors ${watchlistSymbols.has(signal.stockSymbol?.toUpperCase()) ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
                          >
                            {watchlistSymbols.has(signal.stockSymbol?.toUpperCase()) ? <CheckCircle className="w-4 h-4" /> : <Star className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead>
                      <tr className="border-b border-dark-700">
                        <th className="text-left text-xs font-semibold text-gray-400 py-3 px-4">TAKIP</th>
                        <th className="text-left text-xs font-semibold text-gray-400 py-3 px-4">SEMBOL</th>
                        <th className="text-left text-xs font-semibold text-gray-400 py-3 px-4">STRATEJI</th>
                        <th className="text-left text-xs font-semibold text-gray-400 py-3 px-4">SEKTOR</th>
                        <th className="text-right text-xs font-semibold text-gray-400 py-3 px-4">FIYAT</th>
                        <th className="text-right text-xs font-semibold text-gray-400 py-3 px-4">DEĞİŞİM</th>
                        <th className="text-right text-xs font-semibold text-gray-400 py-3 px-4">RSI</th>
                        <th className="text-left text-xs font-semibold text-gray-400 py-3 px-4">DURUM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSignals.map((signal, idx) => (
                        <tr key={signal.id || idx} className="border-b border-dark-800 hover:bg-dark-800 transition-colors">
                          <td className="py-3 px-4">
                            <button
                              onClick={() => addToWatchlist(signal.stockSymbol)}
                              disabled={addingToWatchlist === signal.stockSymbol || watchlistSymbols.has(signal.stockSymbol?.toUpperCase())}
                              title={watchlistSymbols.has(signal.stockSymbol?.toUpperCase()) ? 'Takip listesinde' : 'Takip listesine ekle'}
                              className={`transition-colors ${watchlistSymbols.has(signal.stockSymbol?.toUpperCase()) ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
                            >
                              {addingToWatchlist === signal.stockSymbol ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : watchlistSymbols.has(signal.stockSymbol?.toUpperCase()) ? (
                                <CheckCircle className="w-4 h-4" />
                              ) : (
                                <Star className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 bg-primary-600 rounded flex items-center justify-center text-white text-xs font-bold">
                                {signal.stockSymbol?.slice(0, 2)}
                              </div>
                              <div>
                                <span className="font-mono font-semibold text-white">{signal.stockSymbol}</span>
                                <p className="text-xs text-gray-500">{signal.stockName}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-gray-300 flex items-center gap-1">
                              <Zap className="w-3 h-3 text-yellow-500" />
                              {signal.strategy}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs bg-dark-700 px-2 py-1 rounded">{signal.sector}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm font-semibold text-white">
                              {signal.currentPrice?.toFixed(2) || signal.detectionPrice?.toFixed(2)} TL
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={`text-sm font-bold ${signal.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {signal.changePercent >= 0 ? '+' : ''}{signal.changePercent?.toFixed(2)}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className={`text-sm font-mono ${signal.rsi < 30 ? 'text-green-500' : signal.rsi > 70 ? 'text-red-500' : 'text-gray-400'
                              }`}>
                              {signal.rsi?.toFixed(0) || '-'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`text-xs px-2 py-1 rounded font-medium ${signal.status === 'active'
                              ? 'bg-green-500/20 text-green-500'
                              : 'bg-gray-500/20 text-gray-400'
                              }`}>
                              {signal.status === 'active' ? 'AKTIF' : 'KAPANDI'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Canlı Alarmlar Tab */}
      {activeTab === 'canli-takip' && (
        <div className="space-y-4">
          {/* Alarm Bilgisi */}
          <div className="bg-primary-500/10 border border-primary-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <BellRing className="w-5 h-5 text-primary-500" />
              <div>
                <h3 className="text-white font-semibold">Canlı Alarm Sistemi</h3>
                <p className="text-sm text-gray-400">
                  Yeni sinyaller tespit edildiğinde burada anlık bildirim alırsınız.
                </p>
              </div>
            </div>
          </div>

          {/* Alarm Listesi */}
          {liveAlerts.length === 0 ? (
            <div className="card text-center py-12">
              <Bell className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <h3 className="text-white font-semibold mb-2">Henüz Alarm Yok</h3>
              <p className="text-gray-400 text-sm">Yeni sinyaller tespit edildiğinde burada görünecek</p>
            </div>
          ) : (
            <div className="space-y-3">
              {liveAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`card transition-all cursor-pointer hover:border-primary-500 ${alert.read ? 'border-dark-700' : 'border-green-500 bg-green-500/5'
                    }`}
                  onClick={() => !alert.read && markAsRead(alert.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${alert.type === 'BUY' ? 'bg-green-500/20 text-green-500' :
                        alert.type === 'SELL' ? 'bg-red-500/20 text-red-500' :
                          'bg-yellow-500/20 text-yellow-500'
                        }`}>
                        {alert.type === 'BUY' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white text-lg">{alert.symbol}</span>
                          <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded">
                            {alert.strategy}
                          </span>
                          {!alert.read && (
                            <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded animate-pulse">
                              YENİ
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400">{alert.description}</p>
                        <p className="text-xs text-gray-500 mt-1">{alert.name} - {alert.sector}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-white">{alert.price?.toFixed(2)} TL</p>
                      <p className={`text-sm font-semibold ${alert.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {alert.changePercent >= 0 ? '+' : ''}{alert.changePercent?.toFixed(2)}%
                      </p>
                      <p className="text-xs text-gray-500 flex items-center justify-end gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {new Date(alert.timestamp).toLocaleString('tr-TR')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Detayli Analiz Tab */}
      {activeTab === 'detayli-analiz' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Strateji Istatistikleri */}
          <div className="card">
            <h3 className="text-white font-semibold text-sm md:text-base mb-3 md:mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 md:w-5 md:h-5 text-primary-500" />
              Strateji Istatistikleri
            </h3>
            <div className="space-y-2 md:space-y-3">
              {[
                { name: 'RSI Asiri Satim', count: signals.filter(s => s.strategy?.includes('RSI')).length, color: 'bg-green-500' },
                { name: 'MACD Kesisim', count: signals.filter(s => s.strategy?.includes('MACD')).length, color: 'bg-blue-500' },
                { name: 'EMA Kesisim', count: signals.filter(s => s.strategy?.includes('EMA')).length, color: 'bg-purple-500' },
                { name: 'Bollinger', count: signals.filter(s => s.strategy?.includes('Bollinger')).length, color: 'bg-yellow-500' }
              ].map((stat, idx) => (
                <div key={idx} className="flex items-center justify-between bg-dark-800 rounded-lg p-2.5 md:p-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${stat.color}`}></div>
                    <span className="text-gray-300 text-sm md:text-base">{stat.name}</span>
                  </div>
                  <span className="text-white font-semibold text-sm md:text-base">{stat.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sektor Dagilimi */}
          <div className="card">
            <h3 className="text-white font-semibold text-sm md:text-base mb-3 md:mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 md:w-5 md:h-5 text-primary-500" />
              Sektor Dagilimi
            </h3>
            <div className="space-y-2 md:space-y-3">
              {Object.entries(
                signals.reduce((acc, s) => {
                  const sector = s.sector || 'Diger'
                  acc[sector] = (acc[sector] || 0) + 1
                  return acc
                }, {})
              ).slice(0, 5).map(([sector, count], idx) => (
                <div key={idx} className="flex items-center justify-between bg-dark-800 rounded-lg p-2.5 md:p-3">
                  <span className="text-gray-300 text-sm md:text-base truncate max-w-[150px]">{sector}</span>
                  <span className="text-white font-semibold text-sm md:text-base">{count} sinyal</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="bg-warning-500/10 border border-warning-500/30 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h4 className="text-sm font-semibold text-warning-500 mb-1">ÖNEMLİ YASAL UYARI</h4>
            <p className="text-xs text-gray-400">
              Bu platform yalnızca teknik analiz eğitim amaçlıdır. Burada yer alan tüm içerikler, algoritmik taramalar ve teknik analizler hiçbir şekilde yatırım tavsiyesi niteliği taşımamaktadır.
              Borsa Krali
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
