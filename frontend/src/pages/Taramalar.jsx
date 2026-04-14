import { useState, useEffect, useRef } from 'react'
import {
  Target, TrendingUp, TrendingDown, AlertTriangle, Search, Filter, RefreshCw,
  ChevronRight, BarChart3, Zap, Star, AlertCircle, Cloud, Activity,
  ArrowUpRight, ArrowDownRight, Layers, Gauge, Triangle, Eye, CheckCircle, X, Play
} from 'lucide-react'
import { createChart } from 'lightweight-charts'

import { getApiBase } from '../config'
import { fetchCommodityHistory } from '../utils/commodityHistory'
const API_BASE = getApiBase() + '/api'

// ─── Kıymetli Metaller Analiz Bileşeni ────────────────────────────────────────
const COMM_ANALYSIS_LIST = [
  { key: 'gold_usd',   label: 'Altın (Ons)',   emoji: '🥇', color: '#f59e0b', unit: 'USD/oz' },
  { key: 'silver_usd', label: 'Gümüş (Ons)',   emoji: '🥈', color: '#94a3b8', unit: 'USD/oz' },
  { key: 'gold_try',   label: 'Gram Altin',     emoji: '🏅', color: '#f97316', unit: 'TL/gr' },
  { key: 'usd_try',    label: 'Dolar / TL',     emoji: '💵', color: '#22c55e', unit: 'TRY'    },
]

function CommAnalysisChart({ commKey, color }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 200,
      layout: { background: { type: 'solid', color: '#0d0d14' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: false },
      handleScroll: false,
      handleScale: false,
    })
    const series = chart.addAreaSeries({
      lineColor: color,
      topColor: color + '33',
      bottomColor: color + '00',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    })

    fetchCommodityHistory(commKey, { period: '3mo', interval: '1d' })
      .then(d => {
        if (d.data?.length) {
          series.setData(d.data.map(p => ({ time: p.time, value: p.close })))
          chart.timeScale().fitContent()
        }
      })
      .catch(() => {})

    return () => chart.remove()
  }, [commKey, color])

  return <div ref={ref} className="w-full" style={{ height: 200 }} />
}

function CommodityAnalysis() {
  const [prices, setPrices] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/market/commodities')
      .then(r => r.json())
      .then(d => { setPrices(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // 30 günlük trend yönü: changePercent zaten mevcut veriden okunabilir
  const getTrendLabel = (changePercent) => {
    if (changePercent == null) return { label: '—', cls: 'text-gray-400' }
    if (changePercent > 1)  return { label: 'Yükseliş', cls: 'text-green-400' }
    if (changePercent < -1) return { label: 'Düşüş',    cls: 'text-red-400'   }
    return { label: 'Yatay', cls: 'text-gray-400' }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {COMM_ANALYSIS_LIST.map(c => {
        const d = prices[c.key]
        const up = (d?.changePercent || 0) >= 0
        const trend = getTrendLabel(d?.changePercent)
        return (
          <div key={c.key} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{c.emoji}</span>
                <div>
                  <p className="text-white font-semibold text-sm">{c.label}</p>
                  <p className="text-gray-500 text-xs">{c.unit}</p>
                </div>
              </div>
              <div className="text-right">
                {loading ? (
                  <div className="w-20 h-5 bg-dark-700 animate-pulse rounded" />
                ) : (
                  <>
                    <p className="text-white font-bold text-lg">
                      {d?.price != null ? d.price.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '—'}
                    </p>
                    <div className="flex items-center gap-2 justify-end">
                      <span className={`text-xs font-semibold ${up ? 'text-green-400' : 'text-red-400'}`}>
                        {d?.changePercent != null ? `${up ? '+' : ''}${d.changePercent.toFixed(2)}%` : '—'}
                      </span>
                      <span className={`text-xs ${trend.cls}`}>{trend.label}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            <CommAnalysisChart commKey={c.key} color={c.color} />
          </div>
        )
      })}
    </div>
  )
}

export default function Taramalar() {
  const [activeTab, setActiveTab] = useState('stratejiler')
  const [activeCategory, setActiveCategory] = useState('tumu')

  // Çoklu seçim: Set<strategyId>
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [scanResults, setScanResults] = useState([])
  const [multiResults, setMultiResults] = useState([]) // kombinli sonuçlar
  const [scanMode, setScanMode] = useState(null) // 'single' | 'multi'

  const [loading, setLoading] = useState(false)
  const [harmonicPatterns, setHarmonicPatterns] = useState([])
  const [fibonacciLevels, setFibonacciLevels] = useState([])
  const [error, setError] = useState(null)
  const [scanMeta, setScanMeta] = useState(null)
  const [watchlistSymbols, setWatchlistSymbols] = useState(new Set())
  const [addingToWatchlist, setAddingToWatchlist] = useState(null)
  const [minMatch, setMinMatch] = useState(2) // en az kaç koşul sağlansın

  const tabs = [
    { id: 'stratejiler', label: 'Stratejiler' },
    { id: 'ichimoku', label: 'Ichimoku' },
    { id: 'harmonik', label: 'Harmonik Pattern' },
    { id: 'fibo', label: 'Fibo Dönüş' },
    { id: 'sikisan', label: 'Bollinger Sıkışma' }
  ]

  const strategyCategories = {
    tumu: 'Tümü',
    alis: 'Alış Sinyalleri',
    satis: 'Satış Sinyalleri',
    trend: 'Trend Takibi',
    momentum: 'Momentum',
    hacim: 'Hacim & VWAP'
  }

  const strategies = [
    { id: 'rsi-oversold', name: 'RSI Aşırı Satım', category: 'alis', description: 'RSI < 32 olan hisseler - Tarihsel dönüş noktaları', icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', badge: 'Klasik', badgeColor: 'bg-emerald-500/20 text-emerald-400' },
    { id: 'macd-bullish', name: 'MACD Yukarı Kesişim', category: 'alis', description: 'MACD sinyal çizgisini yukarı kesen hisseler', icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', badge: 'Trend', badgeColor: 'bg-blue-500/20 text-blue-400' },
    { id: 'ema-crossover', name: 'EMA 5/21 Kesişim', category: 'alis', description: "EMA 5 üstten EMA 21'i geçen hisseler", icon: ArrowUpRight, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30', badge: 'EMA', badgeColor: 'bg-green-500/20 text-green-400' },
    { id: 'golden-cross', name: 'Golden Cross (50/200)', category: 'alis', description: "EMA 50 EMA 200'ü yukarı kesti - Uzun vadeli boğa", icon: Star, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', badge: 'Güçlü', badgeColor: 'bg-yellow-500/20 text-yellow-400' },
    { id: 'bollinger-lower', name: 'Bollinger Alt Bant', category: 'alis', description: 'Fiyat alt Bollinger bandına değdi - Dönüş potansiyeli', icon: Target, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30', badge: 'Bounce', badgeColor: 'bg-cyan-500/20 text-cyan-400' },
    { id: 'stoch-oversold', name: 'Stokastik Aşırı Satım', category: 'alis', description: "Stokastik < 20 + %K %D'yi yukarı kesti", icon: Activity, color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/30', badge: 'Stoch', badgeColor: 'bg-teal-500/20 text-teal-400' },
    { id: 'williams-oversold', name: 'Williams %R Aşırı Satım', category: 'alis', description: 'Williams %R < -80 - Aşırı satım + geri dönüş', icon: ArrowUpRight, color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30', badge: '%R', badgeColor: 'bg-indigo-500/20 text-indigo-400' },
    { id: 'cci-oversold', name: 'CCI Aşırı Satım', category: 'alis', description: 'CCI < -100 - Commodity Channel Index dönüş bölgesi', icon: Gauge, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30', badge: 'CCI', badgeColor: 'bg-violet-500/20 text-violet-400' },
    { id: 'supertrend-buy', name: 'Supertrend Alış', category: 'alis', description: 'Supertrend alış modunda veya yeni sinyal üretti', icon: Zap, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', badge: 'ST', badgeColor: 'bg-orange-500/20 text-orange-400' },
    { id: 'rsi-overbought', name: 'RSI Aşırı Alım', category: 'satis', description: 'RSI > 70 olan hisseler - Satış baskısı bölgesi', icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', badge: 'Dikkat', badgeColor: 'bg-red-500/20 text-red-400' },
    { id: 'rsi-adx-strong', name: 'RSI + ADX Güçlü Trend', category: 'trend', description: 'ADX > 25 ve RSI 40-65 arası - Sağlıklı yükseliş trendi', icon: Layers, color: 'text-primary-400', bg: 'bg-primary-500/10 border-primary-500/30', badge: 'ADX', badgeColor: 'bg-primary-500/20 text-primary-400' },
    { id: 'volume-spike', name: 'Hacim Patlaması', category: 'hacim', description: '20 günlük ortalamanın 2 katı hacim - Kurumsal hareketler', icon: BarChart3, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', badge: 'Hacim', badgeColor: 'bg-amber-500/20 text-amber-400' },
    { id: 'price-above-vwap', name: 'VWAP Üstünde', category: 'hacim', description: 'Fiyat VWAP üstünde + RSI 45-65 - Sağlıklı yükseliş', icon: TrendingUp, color: 'text-lime-400', bg: 'bg-lime-500/10 border-lime-500/30', badge: 'VWAP', badgeColor: 'bg-lime-500/20 text-lime-400' },
    { id: 'bollinger-squeeze', name: 'Bollinger Sıkışması', category: 'momentum', description: 'Bollinger bantları daraldı - Büyük hareket bekleniyor', icon: Triangle, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30', badge: 'Sıkışma', badgeColor: 'bg-purple-500/20 text-purple-400' }
  ]

  useEffect(() => {
    if (activeTab === 'harmonik') fetchHarmonicPatterns()
    else if (activeTab === 'fibo') fetchFibonacciLevels()
    else if (activeTab === 'ichimoku') runSingleScan('ichimoku-bullish')
    else if (activeTab === 'sikisan') runSingleScan('bollinger-squeeze')
  }, [activeTab])

  // Tekli tarama (eski davranış)
  const runSingleScan = async (strategyId) => {
    setLoading(true)
    setError(null)
    setScanResults([])
    setMultiResults([])
    setScanMode('single')
    setScanMeta(null)
    try {
      const response = await fetch(`${API_BASE}/market/scans/${strategyId}`)
      if (!response.ok) throw new Error('Tarama yapılamadı')
      const data = await response.json()
      setScanResults(data.stocks || [])
      setScanMeta({ total: data.total, scanned: data.scanned, strategy: data.strategy, timestamp: data.timestamp })
    } catch {
      setError('Tarama sonuçları yüklenemedi. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  // Çoklu tarama — paralel fetch + kesişim
  const runMultiScan = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    if (ids.length === 1) {
      runSingleScan(ids[0])
      return
    }
    setLoading(true)
    setError(null)
    setScanResults([])
    setMultiResults([])
    setScanMode('multi')
    setScanMeta(null)
    try {
      const responses = await Promise.all(
        ids.map(id => fetch(`${API_BASE}/market/scans/${id}`).then(r => r.ok ? r.json() : { stocks: [] }))
      )
      // Her sembol için hangi stratejilerde göründüğünü bul
      const symbolMap = new Map()
      responses.forEach((res, si) => {
        const stratId = ids[si]
        const stratInfo = strategies.find(s => s.id === stratId)
        ;(res.stocks || []).forEach(stock => {
          const key = stock.symbol
          if (!symbolMap.has(key)) {
            symbolMap.set(key, { ...stock, matchedStrategies: [] })
          }
          symbolMap.get(key).matchedStrategies.push({
            id: stratId,
            name: stratInfo?.name || stratId,
            badge: stratInfo?.badge || stratId,
            badgeColor: stratInfo?.badgeColor || 'bg-gray-500/20 text-gray-400',
            color: stratInfo?.color || 'text-gray-400'
          })
        })
      })
      // minMatch koşulunu sağlayanları filtrele, eşleşme sayısına göre sırala
      const combined = [...symbolMap.values()]
        .filter(s => s.matchedStrategies.length >= minMatch)
        .sort((a, b) => b.matchedStrategies.length - a.matchedStrategies.length)

      setMultiResults(combined)
      setScanMeta({ scanned: responses[0]?.scanned || 30, stratCount: ids.length, minMatch })
    } catch {
      setError('Kombine tarama başarısız. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  const toggleStrategy = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    // Önceki sonuçları temizle
    setScanResults([])
    setMultiResults([])
    setScanMode(null)
    setError(null)
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setScanResults([])
    setMultiResults([])
    setScanMode(null)
  }

  const fetchHarmonicPatterns = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/market/harmonics`)
      if (!response.ok) throw new Error('Harmonik verisi alınamadı')
      const data = await response.json()
      setHarmonicPatterns(data.patterns || [])
    } catch {
      setError('Harmonik pattern verileri yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  const fetchFibonacciLevels = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/market/fibonacci`)
      if (!response.ok) throw new Error('Fibonacci verisi alınamadı')
      const data = await response.json()
      setFibonacciLevels(data.stocks || [])
    } catch {
      setError('Fibonacci seviyeleri yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  const loadWatchlist = async () => {
    try {
      const res = await fetch(`${API_BASE}/user/watchlist`)
      if (res.ok) {
        const data = await res.json()
        const syms = (data.watchlist || []).map(s => (s.symbol || s).toUpperCase())
        setWatchlistSymbols(new Set(syms))
      }
    } catch {}
  }

  const addToWatchlist = async (symbol, e) => {
    e.stopPropagation()
    if (!symbol || addingToWatchlist) return
    setAddingToWatchlist(symbol)
    try {
      const res = await fetch(`${API_BASE}/user/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol })
      })
      if (res.ok) setWatchlistSymbols(prev => new Set([...prev, symbol.toUpperCase()]))
    } catch {} finally {
      setAddingToWatchlist(null)
    }
  }

  useEffect(() => { loadWatchlist() }, [])

  const filteredStrategies = activeCategory === 'tumu'
    ? strategies
    : strategies.filter(s => s.category === activeCategory)

  // Tekli mod için seçili strateji bilgisi
  const singleStrategyInfo = selectedIds.size === 1
    ? strategies.find(s => s.id === [...selectedIds][0])
    : null

  const getRSIColor = (rsi) => {
    if (!rsi) return 'text-gray-400'
    if (rsi < 30) return 'text-emerald-400'
    if (rsi > 70) return 'text-red-400'
    if (rsi < 45) return 'text-yellow-400'
    if (rsi > 55) return 'text-blue-400'
    return 'text-gray-300'
  }

  const getRSIBg = (rsi) => {
    if (!rsi) return 'bg-gray-500/20 text-gray-400'
    if (rsi < 30) return 'bg-emerald-500/20 text-emerald-400'
    if (rsi > 70) return 'bg-red-500/20 text-red-400'
    return 'bg-gray-500/20 text-gray-300'
  }

  const selectedCount = selectedIds.size

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Piyasa Radarı</h1>
          <p className="text-gray-400 mt-1 text-sm">15+ profesyonel teknik analiz taraması - RSI, MACD, Ichimoku, ADX, Supertrend ve daha fazlası</p>
        </div>
        <div className="text-xs text-gray-500 bg-dark-800 px-3 py-1.5 rounded-lg border border-dark-700">
          30 Hisse Taranıyor
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              if (tab.id !== 'stratejiler') {
                clearSelection()
              }
            }}
            className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-medium text-sm transition-colors whitespace-nowrap ${
              activeTab === tab.id ? 'bg-primary-600 text-white' : 'bg-dark-800 text-gray-400 hover:text-white hover:bg-dark-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* === STRATEJILER TAB === */}
      {activeTab === 'stratejiler' && (
        <>
          {/* Kategori filtreleri */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(strategyCategories).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeCategory === key
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-800 text-gray-500 hover:text-gray-300 border border-dark-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Çoklu seçim bilgi çubuğu */}
          {selectedCount > 0 && (
            <div className="bg-dark-800 border border-gold-500/30 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-gold-400 font-semibold text-sm">{selectedCount} strateji seçildi</span>
                <div className="flex flex-wrap gap-1.5">
                  {[...selectedIds].map(id => {
                    const s = strategies.find(x => x.id === id)
                    return s ? (
                      <span key={id} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.badgeColor} flex items-center gap-1`}>
                        {s.badge}
                        <button onClick={() => toggleStrategy(id)} className="hover:opacity-70">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ) : null
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedCount >= 2 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">En az</span>
                    <div className="flex gap-1">
                      {[2, 3, 4].filter(n => n <= selectedCount).map(n => (
                        <button
                          key={n}
                          onClick={() => setMinMatch(n)}
                          className={`w-7 h-7 rounded text-xs font-bold transition-colors ${
                            minMatch === n ? 'bg-gold-500 text-dark-900' : 'bg-dark-700 text-gray-400 hover:text-white'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">koşul sağlasın</span>
                  </div>
                )}
                <button
                  onClick={runMultiScan}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-400 text-dark-900 font-bold text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  {selectedCount === 1 ? 'Tara' : 'Kombine Tara'}
                </button>
                <button onClick={clearSelection} className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-gray-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Strateji kartları */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredStrategies.map((strategy) => {
              const isSelected = selectedIds.has(strategy.id)
              return (
                <div
                  key={strategy.id}
                  className={`card cursor-pointer transition-all border relative ${
                    isSelected
                      ? 'border-gold-500 bg-gold-500/5 ring-1 ring-gold-500/30'
                      : `${strategy.bg} hover:border-primary-500`
                  }`}
                  onClick={() => toggleStrategy(strategy.id)}
                >
                  {/* Seçim işareti */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-gold-500 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-3.5 h-3.5 text-dark-900" />
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-2">
                    <div className={`p-2 rounded-lg ${strategy.bg}`}>
                      <strategy.icon className={`w-5 h-5 ${strategy.color}`} />
                    </div>
                    {!isSelected && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${strategy.badgeColor}`}>
                        {strategy.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-white text-sm mb-1">{strategy.name}</h3>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">{strategy.description}</p>
                  <span className={`text-xs flex items-center gap-1 ${isSelected ? 'text-gold-400' : strategy.color}`}>
                    {isSelected ? <><CheckCircle className="w-3 h-3" /> Seçildi</> : <>Seç <ChevronRight className="w-3 h-3" /></>}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* === ICHIMOKU TAB === */}
      {activeTab === 'ichimoku' && !loading && (
        <div className="space-y-4">
          <div className="bg-dark-800/60 rounded-xl p-4 border border-primary-500/20">
            <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
              <Cloud className="w-5 h-5 text-primary-400" />
              Ichimoku Bulutu Taraması
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              Ichimoku Kinko Hyo: Tenkan-Sen, Kijun-Sen, Senkou Span A/B ve Chikou Span kullanarak trend analizi.
              Fiyat bulut üstünde + TK kesişim = Güçlü boğa sinyali.
            </p>
            <div className="flex gap-2">
              <button onClick={() => runSingleScan('ichimoku-bullish')} className="btn-primary text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Boğa Sinyalleri
              </button>
              <button onClick={() => runSingleScan('ichimoku-bearish')} className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition-colors flex items-center gap-2 border border-red-500/30">
                <TrendingDown className="w-4 h-4" /> Ayı Sinyalleri
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {[
              { name: 'Tenkan-Sen', period: '9 dönem', desc: 'Kısa vadeli momentum.', color: 'text-red-400' },
              { name: 'Kijun-Sen', period: '26 dönem', desc: 'Orta vadeli yön.', color: 'text-blue-400' },
              { name: 'Senkou Span A', period: '(T+K)/2', desc: 'Bulutun üst sınırı.', color: 'text-green-400' },
              { name: 'Senkou Span B', period: '52 dönem', desc: 'Bulutun alt sınırı.', color: 'text-orange-400' },
              { name: 'Chikou Span', period: 'Kapanış -26', desc: 'Gecikmeli çizgi.', color: 'text-purple-400' },
              { name: 'Kumo (Bulut)', period: 'A-B arası', desc: 'Yeşil = Boğa, Kırmızı = Ayı', color: 'text-yellow-400' }
            ].map(item => (
              <div key={item.name} className="bg-dark-800 rounded-lg p-3 border border-dark-700">
                <span className={`font-semibold ${item.color}`}>{item.name}</span>
                <span className="text-gray-500 ml-2">({item.period})</span>
                <p className="text-gray-400 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hata */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 font-medium">Hata</p>
            <p className="text-red-300 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Yükleniyor */}
      {loading && (
        <div className="card text-center py-12">
          <RefreshCw className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-white font-medium">
            {scanMode === 'multi' ? `${selectedIds.size} strateji paralel taranıyor...` : 'Tarama yapılıyor...'}
          </p>
          <p className="text-gray-500 text-sm mt-1">30 hisse teknik indikatörlerle analiz ediliyor</p>
        </div>
      )}

      {/* === KOMBİNE SONUÇLAR (çoklu seçim) === */}
      {scanMode === 'multi' && multiResults.length > 0 && !loading && (
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-gold-400" />
                Kombine Tarama Sonuçları
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {scanMeta?.stratCount} strateji tarandı — en az {scanMeta?.minMatch} koşulu sağlayan hisseler
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 bg-dark-800 px-3 py-1.5 rounded-lg border border-dark-700">
                {multiResults.length} hisse bulundu
              </span>
              <button onClick={runMultiScan} className="p-1.5 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors" title="Yenile">
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {multiResults.map((stock, idx) => (
              <div key={idx} className="bg-dark-800 rounded-xl p-3 border border-dark-700">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-bold text-primary-400">{stock.symbol}</p>
                    <p className="text-xs text-gray-500 truncate max-w-[140px]">{stock.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-white font-medium">{stock.price?.toFixed(2)} ₺</p>
                    <p className={`text-xs font-mono font-semibold ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
                    </p>
                  </div>
                </div>
                {/* Eşleşen stratejiler */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    stock.matchedStrategies.length >= 4 ? 'bg-gold-500/30 text-gold-300 border border-gold-500/50' :
                    stock.matchedStrategies.length >= 3 ? 'bg-green-500/20 text-green-400 border border-green-500/40' :
                    'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  }`}>
                    {stock.matchedStrategies.length} koşul ✓
                  </span>
                  {stock.matchedStrategies.map((st, si) => (
                    <span key={si} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.badgeColor}`}>{st.badge}</span>
                  ))}
                </div>
                {stock.indicators?.rsi != null && (
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${getRSIBg(stock.indicators.rsi)}`}>
                    RSI {stock.indicators.rsi}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-dark-700">
                  <th className="pb-3 pl-2">#</th>
                  <th className="pb-3">Hisse</th>
                  <th className="pb-3">Fiyat</th>
                  <th className="pb-3">Değişim</th>
                  <th className="pb-3">RSI</th>
                  <th className="pb-3">Eşleşen Koşullar</th>
                  <th className="pb-3">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {multiResults.map((stock, idx) => (
                  <tr key={idx} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors">
                    <td className="py-3 pl-2 text-gray-600 text-xs">{idx + 1}</td>
                    <td className="py-3">
                      <p className="font-bold text-primary-400">{stock.symbol}</p>
                      <p className="text-xs text-gray-500 max-w-[120px] truncate">{stock.name}</p>
                    </td>
                    <td className="py-3 font-mono text-white font-medium">{stock.price?.toFixed(2)} ₺</td>
                    <td className={`py-3 font-mono font-semibold ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
                    </td>
                    <td className="py-3">
                      {stock.indicators?.rsi != null ? (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getRSIBg(stock.indicators.rsi)}`}>
                          {stock.indicators.rsi}
                        </span>
                      ) : <span className="text-gray-600">-</span>}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          stock.matchedStrategies.length >= 4 ? 'bg-gold-500/30 text-gold-300 border border-gold-500/50' :
                          stock.matchedStrategies.length >= 3 ? 'bg-green-500/20 text-green-400 border border-green-500/40' :
                          'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                        }`}>
                          {stock.matchedStrategies.length}/{selectedIds.size} ✓
                        </span>
                        {stock.matchedStrategies.map((st, si) => (
                          <span key={si} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.badgeColor}`} title={st.name}>
                            {st.badge}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3">
                      <button
                        onClick={(e) => addToWatchlist(stock.symbol, e)}
                        disabled={addingToWatchlist === stock.symbol}
                        className={`transition-colors ${watchlistSymbols.has(stock.symbol?.toUpperCase()) ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}
                        title={watchlistSymbols.has(stock.symbol?.toUpperCase()) ? 'Takip listesinde' : 'Takip listesine ekle'}
                      >
                        {watchlistSymbols.has(stock.symbol?.toUpperCase()) ? <CheckCircle className="w-4 h-4" /> : <Star className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Kombine sonuç yok */}
      {scanMode === 'multi' && multiResults.length === 0 && !loading && !error && (
        <div className="card text-center py-12">
          <Search className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Seçilen {selectedIds.size} stratejinin en az {minMatch} tanesini birden karşılayan hisse bulunamadı.</p>
          <p className="text-gray-500 text-sm mt-1">Minimum koşul sayısını azaltmayı veya farklı stratejiler seçmeyi deneyin.</p>
        </div>
      )}

      {/* === TEKLİ SONUÇLAR === */}
      {scanMode === 'single' && scanResults.length > 0 && !loading && (
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base md:text-lg font-semibold text-white flex items-center gap-2">
                {singleStrategyInfo && <singleStrategyInfo.icon className={`w-5 h-5 ${singleStrategyInfo?.color}`} />}
                {singleStrategyInfo?.name || 'Tarama'} Sonuçları
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">{singleStrategyInfo?.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 bg-dark-800 px-3 py-1.5 rounded-lg border border-dark-700">
                {scanResults.length}/{scanMeta?.scanned || 30} hisse bulundu
              </span>
              <button onClick={() => runSingleScan([...selectedIds][0])} className="p-1.5 bg-dark-800 rounded-lg hover:bg-dark-700 transition-colors" title="Yenile">
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {scanResults.map((stock, idx) => (
              <div key={idx} className="bg-dark-800 rounded-xl p-3 border border-dark-700">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-bold text-primary-400">{stock.symbol}</p>
                    <p className="text-xs text-gray-500 truncate max-w-[140px]">{stock.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-white font-medium">{stock.price?.toFixed(2)} ₺</p>
                    <p className={`text-xs font-mono font-semibold ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {stock.indicators?.rsi != null && <span className={`px-2 py-0.5 rounded font-medium ${getRSIBg(stock.indicators.rsi)}`}>RSI {stock.indicators.rsi}</span>}
                  {stock.indicators?.macd != null && <span className={`px-2 py-0.5 rounded bg-dark-700 ${stock.indicators.macd > 0 ? 'text-emerald-400' : 'text-red-400'}`}>MACD {stock.indicators.macd > 0 ? '↑' : '↓'}</span>}
                  {stock.indicators?.signal && <span className="px-2 py-0.5 rounded bg-primary-500/20 text-primary-300 truncate max-w-full">{stock.indicators.signal}</span>}
                  {stock.volumeRatio >= 1.5 && <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">Hacim {stock.volumeRatio}x</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-dark-700">
                  <th className="pb-3 pl-2">#</th>
                  <th className="pb-3">Hisse</th>
                  <th className="pb-3">Fiyat</th>
                  <th className="pb-3">Değişim</th>
                  <th className="pb-3">RSI</th>
                  <th className="pb-3">MACD</th>
                  <th className="pb-3">Hacim</th>
                  <th className="pb-3">Sinyal</th>
                  <th className="pb-3">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {scanResults.map((stock, idx) => (
                  <tr key={idx} className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors">
                    <td className="py-3 pl-2 text-gray-600 text-xs">{idx + 1}</td>
                    <td className="py-3">
                      <p className="font-bold text-primary-400">{stock.symbol}</p>
                      <p className="text-xs text-gray-500 max-w-[120px] truncate">{stock.name}</p>
                    </td>
                    <td className="py-3 font-mono text-white font-medium">{stock.price?.toFixed(2)} ₺</td>
                    <td className={`py-3 font-mono font-semibold ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
                    </td>
                    <td className="py-3">
                      {stock.indicators?.rsi != null ? (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getRSIBg(stock.indicators.rsi)}`}>{stock.indicators.rsi}</span>
                      ) : <span className="text-gray-600">-</span>}
                    </td>
                    <td className="py-3">
                      {stock.indicators?.macd != null ? (
                        <span className={`text-xs font-medium ${stock.indicators.macd > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {stock.indicators.macd > 0 ? '▲' : '▼'} {Math.abs(stock.indicators.macd).toFixed(2)}
                        </span>
                      ) : <span className="text-gray-600">-</span>}
                    </td>
                    <td className="py-3">
                      {stock.volumeRatio ? (
                        <span className={`text-xs ${stock.volumeRatio >= 2 ? 'text-amber-400 font-semibold' : 'text-gray-400'}`}>{stock.volumeRatio}x</span>
                      ) : <span className="text-gray-600">-</span>}
                    </td>
                    <td className="py-3 max-w-[160px]">
                      {stock.indicators?.signal ? (
                        <span className="text-xs text-primary-300 truncate block">{stock.indicators.signal}</span>
                      ) : stock.indicators?.adx ? (
                        <span className="text-xs text-blue-400">ADX: {stock.indicators.adx}</span>
                      ) : <span className="text-gray-600">-</span>}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={(e) => addToWatchlist(stock.symbol, e)}
                        disabled={addingToWatchlist === stock.symbol}
                        className={`transition-colors ${watchlistSymbols.has(stock.symbol?.toUpperCase()) ? 'text-yellow-400' : 'text-gray-500 hover:text-yellow-400'}`}
                      >
                        {watchlistSymbols.has(stock.symbol?.toUpperCase()) ? <CheckCircle className="w-4 h-4" /> : <Star className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ichimoku detay */}
          {scanResults.some(s => s.indicators?.tenkan) && (
            <div className="mt-4 pt-4 border-t border-dark-700">
              <p className="text-xs text-gray-500 font-medium mb-3">Ichimoku Detayları</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-dark-800">
                      <th className="text-left pb-2">Hisse</th>
                      <th className="text-right pb-2">Tenkan</th>
                      <th className="text-right pb-2">Kijun</th>
                      <th className="text-right pb-2">Span A</th>
                      <th className="text-right pb-2">Span B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanResults.map((s, i) => s.indicators?.tenkan && (
                      <tr key={i} className="border-b border-dark-800/50">
                        <td className="py-1.5 text-primary-400 font-medium">{s.symbol}</td>
                        <td className="text-right text-red-400">{s.indicators.tenkan?.toFixed(2)}</td>
                        <td className="text-right text-blue-400">{s.indicators.kijun?.toFixed(2)}</td>
                        <td className="text-right text-green-400">{s.indicators.senkouA?.toFixed(2)}</td>
                        <td className="text-right text-orange-400">{s.indicators.senkouB?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tekli boş sonuç */}
      {scanMode === 'single' && scanResults.length === 0 && !loading && !error && (
        <div className="card text-center py-12">
          <Search className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">Bu strateji için şu an tarama koşulunu karşılayan hisse bulunamadı.</p>
          <p className="text-gray-500 text-sm mt-1">Piyasa koşulları değiştikçe yeni sinyaller oluşacaktır.</p>
        </div>
      )}

      {/* Harmonik */}
      {activeTab === 'harmonik' && !loading && harmonicPatterns.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {harmonicPatterns.map((pattern, idx) => (
            <div key={idx} className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-primary-400">{pattern.symbol}</span>
                <span className={`text-xs px-2 py-1 rounded font-medium ${pattern.direction === 'Bullish' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{pattern.direction}</span>
              </div>
              <p className="text-sm text-gray-300 font-medium mb-1">{pattern.pattern}</p>
              <p className="text-xs text-gray-500 mb-3">{pattern.name}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-dark-800 rounded-lg p-2"><p className="text-gray-500">Tamamlanma</p><p className="text-white font-bold">%{pattern.completion}</p></div>
                <div className="bg-dark-800 rounded-lg p-2"><p className="text-gray-500">Hedef</p><p className="text-emerald-400 font-bold">{pattern.targetPrice} ₺</p></div>
                <div className="bg-dark-800 rounded-lg p-2"><p className="text-gray-500">RSI</p><p className={`font-bold ${getRSIColor(pattern.rsi)}`}>{pattern.rsi}</p></div>
                <div className="bg-dark-800 rounded-lg p-2"><p className="text-gray-500">Güven</p><p className="text-primary-400 font-bold">%{pattern.confidence}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fibonacci */}
      {activeTab === 'fibo' && !loading && fibonacciLevels.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fibonacciLevels.slice(0, 10).map((stock, idx) => (
            <div key={idx} className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-white">{stock.symbol}</p>
                  <p className="text-xs text-gray-500">{stock.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-primary-400 font-bold text-lg">{stock.currentPrice?.toFixed(2)} ₺</p>
                  <p className={`text-xs ${stock.trend === 'bullish' ? 'text-emerald-400' : 'text-red-400'}`}>{stock.trend === 'bullish' ? '▲ Yükseliş' : '▼ Düşüş'}</p>
                </div>
              </div>
              <div className="space-y-1">
                {Object.entries(stock.levels || {}).map(([level, price]) => {
                  const isAbove = (stock.currentPrice || 0) > (price || 0)
                  const isCurrent = Math.abs((stock.currentPrice - price) / price) < 0.02
                  return (
                    <div key={level} className={`flex items-center justify-between text-xs px-2 py-1 rounded ${isCurrent ? 'bg-primary-500/20 border border-primary-500/40' : 'bg-dark-800'}`}>
                      <span className="text-gray-400 font-medium">{level}</span>
                      <span className={`font-mono font-semibold ${isAbove ? 'text-emerald-400' : 'text-gray-300'}`}>{price?.toFixed(2)} ₺</span>
                    </div>
                  )
                })}
              </div>
              {stock.nearestFibLevel && (
                <p className="text-xs text-gray-500 mt-2 text-center">En yakın seviye: {stock.nearestFibLevel} ₺ (%{stock.distancePercent} uzakta)</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bollinger Squeeze */}
      {activeTab === 'sikisan' && !loading && scanResults.length > 0 && (
        <div>
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mb-4">
            <h3 className="font-semibold text-white mb-1 flex items-center gap-2">
              <Triangle className="w-5 h-5 text-purple-400" />
              Bollinger Sıkışması Tespit Edildi
            </h3>
            <p className="text-xs text-gray-400">Bollinger bant genişliği %6'nın altına indi. Kırılım yönüne göre AL veya SAT pozisyonu alınabilir.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scanResults.map((stock, idx) => (
              <div key={idx} className="card">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-primary-400">{stock.symbol}</span>
                  <span className={`text-xs font-semibold ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stock.changePercent >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%</span>
                </div>
                <p className="text-xs text-gray-500 mb-2">{stock.name}</p>
                <p className="text-lg font-bold text-white mb-3">{stock.price?.toFixed(2)} ₺</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-dark-800 rounded p-2"><p className="text-gray-500">Bant Genişliği</p><p className="text-purple-400 font-bold">{stock.indicators?.bandwidth?.toFixed(1)}%</p></div>
                  <div className="bg-dark-800 rounded p-2"><p className="text-gray-500">RSI</p><p className={`font-bold ${getRSIColor(stock.indicators?.rsi)}`}>{stock.indicators?.rsi || '-'}</p></div>
                  <div className="bg-dark-800 rounded p-2"><p className="text-gray-500">Üst Band</p><p className="text-red-400 font-medium">{stock.indicators?.upper?.toFixed(2)}</p></div>
                  <div className="bg-dark-800 rounded p-2"><p className="text-gray-500">Alt Band</p><p className="text-emerald-400 font-medium">{stock.indicators?.lower?.toFixed(2)}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Boş durumlar */}
      {activeTab === 'harmonik' && !loading && harmonicPatterns.length === 0 && !error && (
        <div className="card text-center py-12">
          <Activity className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Harmonik pattern verileri yükleniyor...</p>
        </div>
      )}

      {/* Kıymetli Metaller Analiz */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-xl">🏅</span> Kıymetli Metaller Analiz
        </h2>
        <CommodityAnalysis />
      </div>

      {/* Yasal uyarı */}
      <div className="bg-dark-800/40 rounded-xl p-3 border border-dark-700">
        <p className="text-xs text-gray-600 text-center">
          ⚠️ Bu taramalar yalnızca teknik analiz eğitim amaçlıdır. Yatırım tavsiyesi niteliği taşımaz.
        </p>
      </div>
    </div>
  )
}
