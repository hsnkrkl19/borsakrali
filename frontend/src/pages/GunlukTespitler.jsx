import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Filter, TrendingUp, TrendingDown, Target, Activity, Bell, BellRing, RefreshCw, X, Volume2, Star, Clock, Zap, Wifi, WifiOff, Info, CheckCircle, BookOpen, ChevronDown, ChevronUp, HelpCircle, Sparkles, Coins, Layers, Flame } from 'lucide-react'
import { io } from 'socket.io-client'

import { getApiBase, getSocketBase } from '../config'
import { getStrategyMeta, formatRelativeTime } from '../lib/strategyMeta'
import SignalGuide from '../components/SignalGuide'
import TradePlanCard from '../components/TradePlanCard'
import InfoTooltip from '../components/InfoTooltip'
import BugununSinyalleri from '../components/BugununSinyalleri'
import KriptoSinyalleri from '../components/KriptoSinyalleri'
import EmtiaSinyalleri from '../components/EmtiaSinyalleri'
import MTFSinyalleri from '../components/MTFSinyalleri'
import BacktestPanel from '../components/BacktestPanel'
import LikidasyonHaritasi from '../components/LikidasyonHaritasi'
import ScrollableTabBar from '../components/ScrollableTabBar'
const API_BASE = getApiBase() + '/api'
const SOCKET_URL = getSocketBase()

// Eski tek-seviyeli tab ID'lerini yeni ana+alt yapıya çevir (URL geriye uyumluluk)
const LEGACY_TAB_MAP = {
  'today':           { tab: 'bugun',   sub: null },
  'bugun':           { tab: 'bugun',   sub: null },
  'kripto':          { tab: 'kripto',  sub: null },
  'emtia':           { tab: 'emtia',   sub: null },
  'mtf':             { tab: 'analiz',  sub: 'mtf' },
  'likidasyon':      { tab: 'analiz',  sub: 'likidasyon' },
  'backtest':        { tab: 'araclar', sub: 'backtest' },
  'akilli-suzgec':   { tab: 'araclar', sub: 'suzgec' },
  'canli-takip':     { tab: 'araclar', sub: 'alarmlar' },
  'detayli-analiz':  { tab: 'araclar', sub: 'detay' },
}

const SUB_TABS = {
  analiz:  ['mtf', 'likidasyon'],
  araclar: ['backtest', 'suzgec', 'alarmlar', 'detay'],
}

export default function GunlukTespitler() {
  const [searchParams, setSearchParams] = useSearchParams()
  const resolved = (() => {
    const rawTab = searchParams.get('tab')
    const rawSub = searchParams.get('sub')
    // 1) Yeni 5'li yapı: tab geçerli ise direkt kullan
    if (['bugun', 'kripto', 'emtia', 'analiz', 'araclar'].includes(rawTab)) {
      const validSub = SUB_TABS[rawTab]?.includes(rawSub) ? rawSub : (SUB_TABS[rawTab]?.[0] || null)
      return { tab: rawTab, sub: validSub }
    }
    // 2) Eski ID — map'le
    if (rawTab && LEGACY_TAB_MAP[rawTab]) {
      return LEGACY_TAB_MAP[rawTab]
    }
    // 3) Varsayılan
    return { tab: 'bugun', sub: null }
  })()
  const [activeTab, setActiveTab] = useState(resolved.tab)
  const [activeSubTab, setActiveSubTab] = useState(resolved.sub)
  // Ana tab değişince varsayılan alt-tab'ı ayarla
  const selectMainTab = useCallback((tabId) => {
    setActiveTab(tabId)
    const firstSub = SUB_TABS[tabId]?.[0] || null
    setActiveSubTab(firstSub)
  }, [])
  // URL güncelleme
  useEffect(() => {
    const params = activeSubTab ? { tab: activeTab, sub: activeSubTab } : { tab: activeTab }
    setSearchParams(params, { replace: true })
  }, [activeTab, activeSubTab])  // eslint-disable-line react-hooks/exhaustive-deps
  const [showInfo, setShowInfo] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [expandedSignal, setExpandedSignal] = useState(null)
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
  const [showSuzgecFilters, setShowSuzgecFilters] = useState(false)
  const activeFilterCount = (filters.strategy !== 'all' ? 1 : 0) + (filters.status !== 'all' ? 1 : 0)

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

    // Backend broadcastSignal'ı arka plan tarama tamamlandı duyuruları için de
    // kullanıyor (MTF cron tick'i, daily signals özet, kalibrasyon progress).
    // Bunların payload'unda symbol/price/description yok — kullanıcıya alarm
    // olarak gösterilirse popup boş ve liste çöp görünür. İlgili sayfalar
    // (MTFSinyalleri vs.) bu event'leri zaten ayrı dinliyor.
    const INTERNAL_STRATEGIES = new Set([
      'crypto_mtf',
      'crypto_mtf_tick',
      'mtf_calibration_progress',
      'daily_signals',
      'crypto_signals',
    ])

    // Yeni sinyal aldiginda
    socketRef.current.on('new_signal', (signal) => {
      if (signal && INTERNAL_STRATEGIES.has(signal.strategy)) return
      // Gerçek alarmlar bir sembol taşımalı; aksi halde popup boş kalır.
      if (!signal?.stockSymbol && !signal?.symbol) return

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
      const filtered = (signals || []).filter(s =>
        s && !INTERNAL_STRATEGIES.has(s.strategy) && (s.stockSymbol || s.symbol)
      )
      console.log('[Socket.IO] Son sinyaller:', signals?.length, '→ kullanılabilir:', filtered.length)
      setLiveAlerts(prev => [...filtered, ...prev].slice(0, 50))
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

  // Ana sekmeler — 5 grup. Analiz ve Araçlar alt sekmelere sahiptir.
  const tabs = [
    { id: 'bugun',   label: 'Bugünün Sinyalleri', shortLabel: 'Bugün',  icon: Sparkles },
    { id: 'kripto',  label: 'Kripto',             shortLabel: 'Kripto', icon: Coins },
    { id: 'emtia',   label: 'Altın & Gümüş',      shortLabel: 'Emtia',  icon: Coins,   isNew: true },
    { id: 'analiz',  label: 'Analiz',             shortLabel: 'Analiz', icon: Layers },
    { id: 'araclar', label: 'Araçlar',            shortLabel: 'Araçlar',icon: Filter,  badge: unreadCount },
  ]

  // Alt sekme tanımları — sadece "analiz" ve "araclar" altında görünür
  const SUB_TAB_DEFS = {
    analiz: [
      { id: 'mtf',        label: 'Çoklu Zaman',         shortLabel: 'Çoklu TF',   icon: Layers },
      { id: 'likidasyon', label: 'Likidasyon Haritası', shortLabel: 'Likidasyon', icon: Flame, isNew: true },
    ],
    araclar: [
      { id: 'backtest',  label: 'Backtest',         shortLabel: 'Backtest', icon: Activity },
      { id: 'suzgec',    label: 'Akıllı Süzgeç',    shortLabel: 'Süzgeç',   icon: Filter },
      { id: 'alarmlar',  label: 'Canlı Alarmlar',   shortLabel: 'Alarmlar', icon: BellRing, badge: unreadCount },
      { id: 'detay',     label: 'Detaylı Analiz',   shortLabel: 'Detay',    icon: Target },
    ],
  }
  const activeSubList = SUB_TAB_DEFS[activeTab] || null

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
          {/* Sinyal Rehberi Butonu */}
          <button
            onClick={() => setShowGuide(true)}
            title="Sinyal Rehberi — Sinyaller nasıl okunur?"
            className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
            style={{
              background: 'rgba(212, 175, 55, 0.10)',
              border: '1px solid var(--border-gold)',
              color: 'var(--gold-400)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212, 175, 55, 0.18)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(212, 175, 55, 0.10)' }}
          >
            <BookOpen className="w-4 h-4" />
            <span className="text-xs font-semibold hidden md:inline">Sinyal Rehberi</span>
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
              <h4 className="font-bold text-gold-400 mb-1">EMA (Hareketli Ortalamalar)</h4>
              <p className="text-xs text-gray-400">
                <span className="text-white font-semibold">Golden Cross:</span> 50 günlük ortalama, 200 günlük ortalamayı yukarı kestiğinde.<br />
                <span className="text-white font-semibold">Death Cross:</span> 50 günlük ortalama, 200 günlük ortalamayı aşağı kestiğinde.
              </p>
            </div>

            <div className="bg-dark-800 p-3 rounded-lg border border-dark-700">
              <h4 className="font-bold text-gold-400 mb-1">Bollinger Bantları</h4>
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

      {/* Ana sekmeler — 5 grup */}
      <ScrollableTabBar
        activeKey={activeTab}
        className="pb-1 border-b border-dark-700 -mx-1 px-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-tab-key={tab.id}
            onClick={() => selectMainTab(tab.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-2 md:py-3 border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
              ? 'border-primary-600 text-white'
              : 'border-transparent text-gray-400 hover:text-white'
              }`}
          >
            <tab.icon className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
            <span className="font-medium text-[12px] md:text-base">
              <span className="md:hidden">{tab.shortLabel || tab.label}</span>
              <span className="hidden md:inline">{tab.label}</span>
            </span>
            {tab.isNew && activeTab !== tab.id && (
              <span className="text-[8px] md:text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40 leading-none">
                YENİ
              </span>
            )}
            {tab.badge > 0 && (
              <span className="bg-red-500 text-white text-[10px] md:text-xs min-w-[16px] md:min-w-[18px] h-4 md:h-[18px] px-1 rounded-full flex items-center justify-center leading-none">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </ScrollableTabBar>

      {/* Alt sekmeler — sadece Analiz veya Araçlar seçili olduğunda */}
      {activeSubList && (
        <ScrollableTabBar
          activeKey={activeSubTab}
          className="bg-dark-900/60 border border-dark-700 rounded-2xl p-1 md:p-1.5 gap-1"
        >
          {activeSubList.map((sub) => (
            <button
              key={sub.id}
              data-tab-key={sub.id}
              onClick={() => setActiveSubTab(sub.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3.5 py-1.5 md:py-2 rounded-xl text-[12px] md:text-sm font-semibold whitespace-nowrap transition-all ${activeSubTab === sub.id
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-dark-950 shadow-lg shadow-amber-500/25'
                : 'text-gray-400 hover:text-white hover:bg-dark-800'
                }`}
            >
              <sub.icon className="w-3.5 h-3.5 md:w-4 md:h-4 flex-shrink-0" />
              <span className="md:hidden">{sub.shortLabel || sub.label}</span>
              <span className="hidden md:inline">{sub.label}</span>
              {sub.isNew && activeSubTab !== sub.id && (
                <span className="text-[8px] md:text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40 leading-none">YENİ</span>
              )}
              {sub.badge > 0 && (
                <span className="bg-red-500 text-white text-[10px] md:text-xs min-w-[16px] md:min-w-[18px] h-4 md:h-[18px] px-1 rounded-full flex items-center justify-center leading-none">
                  {sub.badge}
                </span>
              )}
            </button>
          ))}
        </ScrollableTabBar>
      )}

      {/* Bugünün Sinyalleri Tab — pre-market 09:55 + revize 11:00 */}
      {activeTab === 'bugun' && <BugununSinyalleri />}

      {/* Kripto Tab — top 100 coin için spot/futures long/short */}
      {activeTab === 'kripto' && <KriptoSinyalleri />}

      {/* Emtia Tab — Altın & Gümüş Malaysian SNR sinyalleri */}
      {activeTab === 'emtia' && <EmtiaSinyalleri />}

      {/* Analiz → Çoklu Zaman — 7 TF (1m-1w) MTF sinyal motoru + confluence engine */}
      {activeTab === 'analiz' && activeSubTab === 'mtf' && <MTFSinyalleri />}

      {/* Analiz → Likidasyon Haritası — Binance Futures forceOrder canlı akışı */}
      {activeTab === 'analiz' && activeSubTab === 'likidasyon' && <LikidasyonHaritasi />}

      {/* Araçlar → Backtest — geçmiş tarih + horizon ile sinyal performans testi */}
      {activeTab === 'araclar' && activeSubTab === 'backtest' && <BacktestPanel />}

      {/* Araçlar → Akıllı Süzgeç */}
      {activeTab === 'araclar' && activeSubTab === 'suzgec' && (
        <>
          {/* Üst kontrol şeridi: Arama (her zaman) + Filtreler butonu (gelişmiş seçenekleri açar) */}
          <div className="card">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Sembol ara (THYAO, GARAN...)"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="input pl-10 w-full text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowSuzgecFilters(v => !v)}
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                  showSuzgecFilters || activeFilterCount > 0
                    ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40'
                    : 'bg-dark-800 text-gray-300 border border-dark-700 hover:bg-dark-700'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filtreler
                {activeFilterCount > 0 && (
                  <span className="bg-amber-500 text-dark-950 text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center leading-none">
                    {activeFilterCount}
                  </span>
                )}
                {showSuzgecFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters({ ...filters, strategy: 'all', status: 'all' })}
                  className="text-[11px] text-gray-400 hover:text-white whitespace-nowrap"
                >
                  Filtreleri temizle
                </button>
              )}
            </div>

            {/* Gelişmiş filtreler — sadece toggle açıldığında */}
            {showSuzgecFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mt-3 pt-3 border-t border-dark-700">
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
            )}
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
                  {filteredSignals.map((signal, idx) => {
                    const meta = getStrategyMeta(signal.strategy)
                    const isExpanded = expandedSignal === (signal.id || idx)
                    const actionStyle = meta.action === 'AL'
                      ? { color: 'var(--jade)',  bg: 'rgba(0, 201, 138, 0.12)', border: 'rgba(0, 201, 138, 0.30)' }
                      : meta.action === 'SAT'
                        ? { color: 'var(--ember)', bg: 'rgba(255, 59, 70, 0.12)', border: 'rgba(255, 59, 70, 0.30)' }
                        : { color: 'var(--gold-400)', bg: 'rgba(212, 175, 55, 0.12)', border: 'rgba(212, 175, 55, 0.30)' }
                    return (
                      <div
                        key={signal.id || idx}
                        className="rounded-xl p-3"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
                              style={{ background: 'rgba(212, 175, 55, 0.15)', color: 'var(--gold-400)', border: '1px solid var(--border-gold)' }}
                            >
                              {signal.stockSymbol?.slice(0, 2)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{signal.stockSymbol}</span>
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: actionStyle.bg, color: actionStyle.color, border: `1px solid ${actionStyle.border}` }}
                                >
                                  {meta.action}
                                </span>
                              </div>
                              <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                                {formatRelativeTime(signal.detectionDate || signal.detectedAt || signal.timestamp)} · {meta.timeframe}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-semibold block" style={{ color: 'var(--text-primary)' }}>
                              {signal.currentPrice?.toFixed(2) || signal.detectionPrice?.toFixed(2)} ₺
                            </span>
                            <span className="text-xs font-bold" style={{ color: signal.changePercent >= 0 ? 'var(--jade)' : 'var(--ember)' }}>
                              {signal.changePercent >= 0 ? '+' : ''}{signal.changePercent?.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Zap className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--gold-400)' }} />
                            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{meta.label}</span>
                            <InfoTooltip
                              size="sm"
                              title={meta.label}
                              description={meta.summary + ' ' + meta.explanation}
                              formula={meta.formula}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedSignal(isExpanded ? null : (signal.id || idx))}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1"
                              style={{ background: 'rgba(212, 175, 55, 0.12)', color: 'var(--gold-400)', border: '1px solid var(--border-gold)' }}
                            >
                              Plan {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={() => addToWatchlist(signal.stockSymbol)}
                              disabled={addingToWatchlist === signal.stockSymbol || watchlistSymbols.has(signal.stockSymbol?.toUpperCase())}
                              title={watchlistSymbols.has(signal.stockSymbol?.toUpperCase()) ? 'Takip listesinde' : 'Takip listesine ekle'}
                              style={{ color: watchlistSymbols.has(signal.stockSymbol?.toUpperCase()) ? 'var(--gold-400)' : 'var(--text-muted)' }}
                            >
                              {watchlistSymbols.has(signal.stockSymbol?.toUpperCase()) ? <CheckCircle className="w-4 h-4" /> : <Star className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="mt-3">
                            <TradePlanCard signal={signal} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-main)' }}>
                        <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>TAKİP</th>
                        <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>SEMBOL</th>
                        <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>
                          AKSİYON <InfoTooltip title="Aksiyon" description="AL: Algoritma alım fırsatı tespit etti. SAT: Çıkış / kâr alma sinyali. TUT: Belirsiz, yeni işlem önerilmez." size="sm" />
                        </th>
                        <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>
                          STRATEJİ <InfoTooltip title="Strateji" description="Sinyali tetikleyen teknik gösterge. Üzerine ⓘ ile ne anlama geldiğini görebilirsiniz." size="sm" />
                        </th>
                        <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>PERİYOD</th>
                        <th className="text-right text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>FİYAT</th>
                        <th className="text-right text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>DEĞİŞİM</th>
                        <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>
                          TESPİT <InfoTooltip title="Tespit zamanı" description="Sinyalin algoritma tarafından üretildiği zaman. Eski sinyaller geçerliliğini yitirebilir; her stratejinin kendi vade süresi vardır." size="sm" />
                        </th>
                        <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>DURUM</th>
                        <th className="text-center text-[11px] font-semibold py-3 px-2" style={{ color: 'var(--text-faint)' }}>PLAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSignals.map((signal, idx) => {
                        const meta = getStrategyMeta(signal.strategy)
                        const isExpanded = expandedSignal === (signal.id || idx)
                        const actionStyle = meta.action === 'AL'
                          ? { color: 'var(--jade)',  bg: 'rgba(0, 201, 138, 0.12)', border: 'rgba(0, 201, 138, 0.30)' }
                          : meta.action === 'SAT'
                            ? { color: 'var(--ember)', bg: 'rgba(255, 59, 70, 0.12)', border: 'rgba(255, 59, 70, 0.30)' }
                            : { color: 'var(--gold-400)', bg: 'rgba(212, 175, 55, 0.12)', border: 'rgba(212, 175, 55, 0.30)' }
                        return (
                          <Fragment key={signal.id || idx}>
                          <tr
                            className="transition-colors"
                            style={{ borderBottom: '1px solid var(--border-main)' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <td className="py-3 px-3">
                              <button
                                onClick={() => addToWatchlist(signal.stockSymbol)}
                                disabled={addingToWatchlist === signal.stockSymbol || watchlistSymbols.has(signal.stockSymbol?.toUpperCase())}
                                title={watchlistSymbols.has(signal.stockSymbol?.toUpperCase()) ? 'Takip listesinde' : 'Takip listesine ekle'}
                                className="transition-colors"
                                style={{ color: watchlistSymbols.has(signal.stockSymbol?.toUpperCase()) ? 'var(--gold-400)' : 'var(--text-muted)' }}
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
                            <td className="py-3 px-3">
                              <div className="flex items-center space-x-2">
                                <div
                                  className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
                                  style={{ background: 'rgba(212, 175, 55, 0.15)', color: 'var(--gold-400)', border: '1px solid var(--border-gold)' }}
                                >
                                  {signal.stockSymbol?.slice(0, 2)}
                                </div>
                                <div>
                                  <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{signal.stockSymbol}</span>
                                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{signal.stockName || signal.sector}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className="text-[11px] font-bold px-2 py-0.5 rounded"
                                style={{ background: actionStyle.bg, color: actionStyle.color, border: `1px solid ${actionStyle.border}` }}
                              >
                                {meta.action}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5">
                                <Zap className="w-3 h-3" style={{ color: 'var(--gold-400)' }} />
                                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{meta.label}</span>
                                <InfoTooltip
                                  size="sm"
                                  title={meta.label}
                                  description={meta.summary + ' ' + meta.explanation}
                                  formula={meta.formula}
                                />
                              </div>
                              <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                                Vade: {meta.validity}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className="text-[10.5px] font-mono px-1.5 py-0.5 rounded"
                                style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-main)' }}
                              >
                                {meta.timeframe}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {signal.currentPrice?.toFixed(2) || signal.detectionPrice?.toFixed(2)} ₺
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span className="text-sm font-bold" style={{ color: signal.changePercent >= 0 ? 'var(--jade)' : 'var(--ember)' }}>
                                {signal.changePercent >= 0 ? '+' : ''}{signal.changePercent?.toFixed(2)}%
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                {formatRelativeTime(signal.detectionDate || signal.detectedAt || signal.timestamp)}
                              </div>
                              <div className="text-[10px]" style={{ color: 'var(--text-faint)' }} title={new Date(signal.detectionDate || signal.detectedAt || signal.timestamp || Date.now()).toLocaleString('tr-TR')}>
                                {new Date(signal.detectionDate || signal.detectedAt || signal.timestamp || Date.now()).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className="text-[10.5px] font-medium px-2 py-1 rounded"
                                style={
                                  signal.status === 'active'
                                    ? { background: 'rgba(0, 201, 138, 0.12)', color: 'var(--jade)', border: '1px solid rgba(0, 201, 138, 0.28)' }
                                    : { background: 'var(--bg-input)', color: 'var(--text-faint)', border: '1px solid var(--border-main)' }
                                }
                              >
                                {signal.status === 'active' ? 'AKTİF' : 'KAPANDI'}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => setExpandedSignal(isExpanded ? null : (signal.id || idx))}
                                title={isExpanded ? 'Planı gizle' : 'İşlem planını göster'}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all"
                                style={{
                                  background: isExpanded ? 'rgba(212, 175, 55, 0.18)' : 'var(--bg-input)',
                                  color: 'var(--gold-400)',
                                  border: '1px solid var(--border-gold)',
                                }}
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={10} className="px-3 pb-4 pt-1">
                                <TradePlanCard signal={signal} />
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Araçlar → Canlı Alarmlar */}
      {activeTab === 'araclar' && activeSubTab === 'alarmlar' && (
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

      {/* Araçlar → Detaylı Analiz */}
      {activeTab === 'araclar' && activeSubTab === 'detay' && (
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
                { name: 'EMA Kesisim', count: signals.filter(s => s.strategy?.includes('EMA')).length, color: 'bg-gold-400' },
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

      {/* Sinyal Rehberi Modalı */}
      <SignalGuide open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  )
}
