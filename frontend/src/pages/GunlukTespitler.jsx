import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filter, TrendingUp, TrendingDown, Target, Activity, Bell, BellRing, RefreshCw, X, Volume2, VolumeX, Star, Clock, Zap, Wifi, WifiOff, Info, CheckCircle, BookOpen, HelpCircle, Sparkles, Coins, Gem, Layers, Flame, MoreVertical, Wallet, Bot, Briefcase } from 'lucide-react'
import { io } from 'socket.io-client'

import { getApiBase, getSocketBase } from '../config'
import { getStrategyMeta, formatRelativeTime } from '../lib/strategyMeta'
import SignalGuide from '../components/SignalGuide'
import TradePlanCard from '../components/TradePlanCard'
import InfoTooltip from '../components/InfoTooltip'
import BugununSinyalleri from '../components/BugununSinyalleri'
import SpotAlSinyalleri from '../components/SpotAlSinyalleri'
import BistPortfoy from '../components/BistPortfoy'
import KriptoSinyalleri from '../components/KriptoSinyalleri'
import ForexSinyalleri from '../components/ForexSinyalleri'
import Mt5Sinyalleri from '../components/Mt5Sinyalleri'
import YeniRobotSinyalleri from '../components/YeniRobotSinyalleri'
import AltinSinyalleri from '../components/AltinSinyalleri'
import BeastSinyalleri from '../components/BeastSinyalleri'
import EmtiaSinyalleri from '../components/EmtiaSinyalleri'
import MTFSinyalleri from '../components/MTFSinyalleri'
import BacktestPanel from '../components/BacktestPanel'
import LikidasyonHaritasi from '../components/LikidasyonHaritasi'
import ScrollableTabBar from '../components/ScrollableTabBar'
import { Button, Badge } from '../components/ui'
import AkilliSuzgec from '../components/AkilliSuzgec'
import CanliAlarmlar from '../components/CanliAlarmlar'
import DetayliAnaliz from '../components/DetayliAnaliz'
import useMediaQuery from '../hooks/useMediaQuery'
const API_BASE = getApiBase() + '/api'
const SOCKET_URL = getSocketBase()

// Eski tek-seviyeli tab ID'lerini yeni ana+alt yapıya çevir (URL geriye uyumluluk)
const LEGACY_TAB_MAP = {
  'today':           { tab: 'bugun',   sub: null },
  'bugun':           { tab: 'bugun',   sub: null },
  'kripto':          { tab: 'kripto',  sub: null },
  'forex':           { tab: 'forex',   sub: null },
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
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [searchParams, setSearchParams] = useSearchParams()
  const resolved = (() => {
    const rawTab = searchParams.get('tab')
    const rawSub = searchParams.get('sub')
    // 1) Yeni 5'li yapı: tab geçerli ise direkt kullan
    if (['bugun', 'sinyaller', 'yenirobot', 'beast', 'altin', 'kripto', 'forex', 'mt5', 'emtia', 'analiz', 'araclar'].includes(rawTab)) {
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
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const headerMenuRef = useRef(null)
  // Header kebab menüsü dış tıklamayla kapansın
  useEffect(() => {
    if (!showHeaderMenu) return
    const handler = (e) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target)) {
        setShowHeaderMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showHeaderMenu])

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
      if (import.meta.env.DEV) console.log('[Socket.IO] Baglanildi:', socketRef.current.id)
      setSocketConnected(true)
    })

    socketRef.current.on('disconnect', () => {
      if (import.meta.env.DEV) console.log('[Socket.IO] Baglanti koptu')
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

      if (import.meta.env.DEV) console.log('[Socket.IO] Yeni sinyal:', signal)

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
      if (import.meta.env.DEV) console.log('[Socket.IO] Son sinyaller:', signals?.length, '→ kullanılabilir:', filtered.length)
      setLiveAlerts(prev => [...filtered, ...prev].slice(0, 50))
    })

    // Baglanti bilgisini al
    socketRef.current.on('connected', (info) => {
      if (import.meta.env.DEV) console.log('[Socket.IO] Baglanti bilgisi:', info)
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
    { id: 'sinyaller', label: 'Spot Al (≥75)',     shortLabel: 'Spot Al', icon: Target, isNew: true },
    { id: 'portfoy', label: '💼 Model Portföy',    shortLabel: 'Portföy', icon: Briefcase, isNew: true },
    { id: 'yenirobot', label: '🤖 Yeni Robot',     shortLabel: 'Yeni Robot', icon: Bot, isNew: true },
    { id: 'beast',   label: '🔱 BEAST Trend',     shortLabel: 'BEAST', icon: Zap, isNew: true },
    { id: 'altin',   label: '🥇 Altın',           shortLabel: 'Altın', icon: Gem, isNew: true },
    { id: 'kripto',  label: 'Kripto',             shortLabel: 'Kripto', icon: Coins },
    { id: 'forex',   label: 'Forex / Parite',     shortLabel: 'Forex',  icon: Wallet,  isNew: true },
    { id: 'mt5',     label: '⚡ MT5 Gün-içi',      shortLabel: 'MT5',    icon: Zap,     isNew: true },
    { id: 'emtia',   label: 'Altın & Gümüş',      shortLabel: 'Emtia',  icon: Coins },
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

      {/* Aksiyon çubuğu — sayfa başlığı Fırsatlar wrapper'ında */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          {/* Canlı durum noktası — kompakt visual indicator (hep görünür) */}
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium ${socketConnected ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}
            title={socketConnected ? 'Canlı bağlantı aktif' : 'Bağlantı yok'}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${socketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="hidden sm:inline">{socketConnected ? 'Canlı' : 'Yok'}</span>
          </span>

          {/* Tara butonu — primary action */}
          <Button variant="gold" size="sm" icon={RefreshCw} loading={checking} onClick={checkSignals}>
            Tara
          </Button>

          {/* Kebab menüsü — Telegram durumu, Ses, Sinyal Rehberi */}
          <div ref={headerMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowHeaderMenu(v => !v)}
              aria-label="Diğer ayarlar"
              aria-expanded={showHeaderMenu}
              className="p-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-gray-300 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {showHeaderMenu && (
              <div className="absolute right-0 top-full mt-2 w-60 bg-dark-900 border border-dark-700 rounded-xl shadow-2xl overflow-hidden z-30">
                <button
                  type="button"
                  onClick={() => { setShowGuide(true); setShowHeaderMenu(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-200 hover:bg-dark-800 transition-colors text-left"
                >
                  <BookOpen className="w-4 h-4 text-gold-400 flex-shrink-0" />
                  <span>Sinyal Rehberi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAudioEnabled(v => !v)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-200 hover:bg-dark-800 transition-colors text-left border-t border-dark-800"
                >
                  {audioEnabled ? <Volume2 className="w-4 h-4 text-primary-400 flex-shrink-0" /> : <VolumeX className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                  <span className="flex-1">Sinyal Sesi</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${audioEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'}`}>
                    {audioEnabled ? 'AÇIK' : 'KAPALI'}
                  </span>
                </button>
                <div className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-200 border-t border-dark-800">
                  <Bell className={`w-4 h-4 flex-shrink-0 ${telegramStatus.active ? 'text-green-400' : 'text-gray-500'}`} />
                  <span className="flex-1">Telegram</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${telegramStatus.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-500/20 text-gray-400'}`}>
                    {telegramStatus.active ? 'AKTİF' : 'PASİF'}
                  </span>
                </div>
              </div>
            )}
          </div>
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
            <Button
              key={sub.id}
              data-tab-key={sub.id}
              variant={activeSubTab === sub.id ? 'gold' : 'subtle'}
              size="sm"
              icon={sub.icon}
              onClick={() => setActiveSubTab(sub.id)}
              aria-pressed={activeSubTab === sub.id}
              className="flex-shrink-0"
            >
              <span className="md:hidden">{sub.shortLabel || sub.label}</span>
              <span className="hidden md:inline">{sub.label}</span>
              {sub.isNew && activeSubTab !== sub.id && <Badge tone="gold">Yeni</Badge>}
              {sub.badge > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none text-white">
                  {sub.badge}
                </span>
              )}
            </Button>
          ))}
        </ScrollableTabBar>
      )}

      {/* Bugünün Sinyalleri Tab — pre-market 09:55 + revize 11:00 */}
      {activeTab === 'bugun' && <BugununSinyalleri />}

      {activeTab === 'sinyaller' && <SpotAlSinyalleri />}

      {activeTab === 'portfoy' && <BistPortfoy />}

      {/* Yeni Robot Tab — derin konfluans (BTC/Altın/S&P/EUR) 15m-1d + perf + log */}
      {activeTab === 'yenirobot' && <YeniRobotSinyalleri />}

      {activeTab === 'beast' && <BeastSinyalleri />}

      {/* Altın Tab — XAU/USD çoklu zaman dilimi (haftalık yön + per-TF sinyal/SR) */}
      {activeTab === 'altin' && <AltinSinyalleri />}

      {/* Kripto Tab — top 100 coin için spot/futures long/short */}
      {activeTab === 'kripto' && <KriptoSinyalleri />}

      {/* Forex / Parite Tab — 8 enstrüman gün-içi long/short + risk planı */}
      {activeTab === 'forex' && <ForexSinyalleri />}

      {/* MT5 Gün-içi Tab — 9 enstrüman × 5 TF, her dk; lot + risk bütçesi (günlük %5/toplam %10) */}
      {activeTab === 'mt5' && <Mt5Sinyalleri />}

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
        <AkilliSuzgec
          signals={signals}
          loading={loading}
          isDesktop={isDesktop}
          watchlistSymbols={watchlistSymbols}
          addingToWatchlist={addingToWatchlist}
          onAddWatchlist={addToWatchlist}
          onRescan={checkSignals}
        />
      )}

      {/* Araçlar → Canlı Alarmlar */}
      {activeTab === 'araclar' && activeSubTab === 'alarmlar' && (
        <CanliAlarmlar liveAlerts={liveAlerts} onMarkAsRead={markAsRead} />
      )}

      {/* Araçlar → Detaylı Analiz */}
      {activeTab === 'araclar' && activeSubTab === 'detay' && (
        <DetayliAnaliz signals={signals} />
      )}

      {/* Warning */}
      <div className="bg-warning-500/10 border border-warning-500/30 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <h4 className="text-sm font-semibold text-warning-500 mb-1">ÖNEMLİ YASAL UYARI</h4>
            <p className="text-xs text-gray-400">
              Bu platform yalnızca teknik analiz eğitim amaçlıdır. Burada yer alan tüm içerikler, algoritmik taramalar ve teknik analizler hiçbir şekilde yatırım tavsiyesi niteliği taşımamaktadır.
              Borsa Kralı
            </p>
          </div>
        </div>
      </div>

      {/* Sinyal Rehberi Modalı */}
      <SignalGuide open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  )
}
