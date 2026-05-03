import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, Gem, TrendingUp, TrendingDown, Minus, Activity,
  BarChart3, AlertTriangle, CheckCircle, XCircle, Info,
  Zap, RefreshCw, ChevronRight, Target, Clock, Globe
} from 'lucide-react'
import { createChart } from 'lightweight-charts'
import { getApiBase } from '../config'
import { useFeatureGate } from '../hooks/useFeatureGate'
import UsageLimitModal from '../components/UsageLimitModal'

const API_BASE = getApiBase()

const QUICK_PICKS = ['THYAO', 'GARAN', 'AKBNK', 'ASELS', 'EREGL', 'BIMAS', 'KCHOL', 'TUPRS']

const CRYPTO_COINS = [
  { symbol: 'BTC', id: 'bitcoin', name: 'Bitcoin', color: '#f7931a' },
  { symbol: 'ETH', id: 'ethereum', name: 'Ethereum', color: '#627eea' },
  { symbol: 'BNB', id: 'binancecoin', name: 'BNB', color: '#f3ba2f' },
  { symbol: 'SOL', id: 'solana', name: 'Solana', color: '#9945ff' },
  { symbol: 'XRP', id: 'ripple', name: 'XRP', color: '#346aa9' },
  { symbol: 'ADA', id: 'cardano', name: 'Cardano', color: '#0d1e2d' },
  { symbol: 'AVAX', id: 'avalanche-2', name: 'Avalanche', color: '#e84142' },
  { symbol: 'DOT', id: 'polkadot', name: 'Polkadot', color: '#e6007a' },
  { symbol: 'MATIC', id: 'matic-network', name: 'Polygon', color: '#8247e5' },
  { symbol: 'LINK', id: 'chainlink', name: 'Chainlink', color: '#2a5ada' },
  { symbol: 'LTC', id: 'litecoin', name: 'Litecoin', color: '#bfbbbb' },
  { symbol: 'ATOM', id: 'cosmos', name: 'Cosmos', color: '#2e3148' },
  { symbol: 'UNI', id: 'uniswap', name: 'Uniswap', color: '#ff007a' },
  { symbol: 'DOGE', id: 'dogecoin', name: 'Dogecoin', color: '#c2a633' },
  { symbol: 'TRX', id: 'tron', name: 'Tron', color: '#eb0029' },
  { symbol: 'TON', id: 'the-open-network', name: 'TON', color: '#0098ea' },
  { symbol: 'NEAR', id: 'near', name: 'NEAR', color: '#00c08b' },
  { symbol: 'ARB', id: 'arbitrum', name: 'Arbitrum', color: '#28a0f0' },
  { symbol: 'APT', id: 'aptos', name: 'Aptos', color: '#00adf6' },
  { symbol: 'SHIB', id: 'shiba-inu', name: 'SHIB', color: '#ffa409' },
]

// --- Score Gauge (SVG circular) ---
function ScoreGauge({ score }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (score / 100) * circumference
  const color = score >= 65 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444'
  const label = score >= 65 ? 'Olumlu' : score >= 45 ? 'Nötr' : 'Olumsuz'
  return (
    <div className="relative w-36 h-36">
      <svg className="-rotate-90" viewBox="0 0 120 120" width="144" height="144">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#1f2937" strokeWidth="10" />
        <circle cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-white">{score}</span>
        <span className="text-xs text-gray-400">/ 100</span>
        <span className="text-[10px] mt-0.5" style={{ color }}>{label}</span>
      </div>
    </div>
  )
}

// --- Pro Chart (lightweight-charts with EMA overlays) ---
function ProChart({ symbol, isCrypto, chartData }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
    if (!chartData || chartData.length < 5) return

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0f172a' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#334155' },
      timeScale: { borderColor: '#334155', timeVisible: true },
      width: containerRef.current.clientWidth,
      height: 380,
    })
    chartRef.current = chart

    // Candlestick
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    })
    const candles = chartData.map(d => ({ time: d.timestamp ? Math.floor(d.timestamp / 1000) : d.date, open: d.open, high: d.high, low: d.low, close: d.close }))
      .filter(d => d.open && d.close)
      .sort((a, b) => a.time - b.time)
    candleSeries.setData(candles)

    // Volume
    const volSeries = chart.addHistogramSeries({
      color: '#3b82f680', priceFormat: { type: 'volume' }, priceScaleId: 'vol',
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    volSeries.setData(chartData.map(d => ({ time: d.timestamp ? Math.floor(d.timestamp / 1000) : d.date, value: d.volume || 0, color: d.close >= d.open ? '#22c55e40' : '#ef444440' })).filter(d => d.value >= 0).sort((a, b) => a.time - b.time))

    // EMA overlays (computed client-side)
    const closes = chartData.map(d => d.close).filter(Boolean)
    const calcEMA = (arr, period) => {
      if (arr.length < period) return []
      const k = 2 / (period + 1); let ema = arr.slice(0, period).reduce((a, b) => a + b, 0) / period
      const result = [ema]
      for (let i = period; i < arr.length; i++) { ema = arr[i] * k + ema * (1 - k); result.push(ema) }
      return result
    }
    const ema50 = calcEMA(closes, 50); const ema200 = calcEMA(closes, 200)
    const offset50 = closes.length - ema50.length; const offset200 = closes.length - ema200.length
    const timeKeys = candles.map(c => c.time)

    if (ema50.length > 0) {
      const ema50Series = chart.addLineSeries({ color: '#f59e0b', lineWidth: 2, title: 'EMA50' })
      ema50Series.setData(ema50.map((v, i) => ({ time: timeKeys[offset50 + i], value: v })).filter(d => d.time && d.value))
    }
    if (ema200.length > 0) {
      const ema200Series = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, title: 'EMA200' })
      ema200Series.setData(ema200.map((v, i) => ({ time: timeKeys[offset200 + i], value: v })).filter(d => d.time && d.value))
    }

    chart.timeScale().fitContent()
    const handleResize = () => chart.applyOptions({ width: containerRef.current?.clientWidth || 600 })
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); chartRef.current = null }
  }, [chartData])

  return <div ref={containerRef} className="w-full rounded-xl overflow-hidden" />
}

// --- Score Bar ---
function ScoreBar({ label, score, max, extra }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0
  const color = pct >= 66 ? 'bg-green-500' : pct >= 40 ? 'bg-gold-500' : 'bg-red-500'
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center justify-between gap-3 sm:w-36 sm:flex-shrink-0">
        <div className="text-xs text-gray-400">{label}</div>
        <div className="text-xs font-bold text-white sm:hidden">{score}/{max}</div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="hidden w-12 text-right text-xs font-bold text-white sm:block">{score}/{max}</div>
      </div>
      {extra && <div className="text-xs text-gray-500 sm:hidden">{extra}</div>}
      {extra && <div className="hidden text-xs text-gray-500 lg:block">{extra}</div>}
    </div>
  )
}

// --- Indicator Card ---
function IndicCard({ label, value, sub, color }) {
  return (
    <div className="bg-dark-800 rounded-xl p-3 border border-white/5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color || 'text-white'}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function fmt(v, digits = 2) {
  if (v == null || isNaN(v)) return '—'
  return Number(v).toFixed(digits)
}

function formatFibonacciLabel(level) {
  if (level === '0') return 'Dip'
  if (level === '1') return 'Tepe'
  return `%${(parseFloat(level) * 100).toFixed(1)}`
}

function getFibonacciWidth(fibonacci, price) {
  const low = Number(fibonacci?.low)
  const high = Number(fibonacci?.high)
  const value = Number(price)

  if (![low, high, value].every(Number.isFinite) || high <= low) {
    return 0
  }

  const width = ((value - low) / (high - low)) * 100
  return Math.max(0, Math.min(100, width))
}

function FibonacciLevelsCard({ fibonacci, currentPrice, isCrypto, showRange = false, showIcon = false }) {
  if (!fibonacci) return null

  return (
    <div className="card">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <h3 className="font-semibold text-white flex items-center gap-2">
          {showIcon && <Info className="w-4 h-4 text-gold-400" />}
          Fibonacci Seviyeleri
        </h3>
        {showRange && (
          <span className="text-xs text-gray-500">
            {fmt(fibonacci.low)} â€” {fmt(fibonacci.high)} aralÄ±ÄŸÄ±
          </span>
        )}
      </div>
      <div className="space-y-2">
        {Object.entries(fibonacci.levels || {}).map(([lvl, price]) => {
          const cp = Number(currentPrice) || 0
          const near = cp > 0 && Math.abs(cp - price) / cp < 0.015
          const isKey = ['0.382', '0.5', '0.618'].includes(lvl)

          return (
            <div
              key={lvl}
              className={`rounded-lg px-3 py-3 ${near ? 'bg-gold-500/20 border border-gold-500/40' : isKey ? 'bg-dark-700' : 'bg-dark-800/50'}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs font-bold ${isKey ? 'text-gold-400' : 'text-gray-400'}`}>
                  {formatFibonacciLabel(lvl)}
                </span>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className={`text-sm font-mono font-bold ${near ? 'text-gold-400' : 'text-white'}`}>
                    {isCrypto ? `$${Number(price).toLocaleString()}` : `${fmt(price)} TL`}
                  </span>
                  {near && <span className="text-[10px] bg-gold-500 text-dark-950 px-1.5 py-0.5 rounded font-bold">YAKIN</span>}
                </div>
              </div>
              <div className="mt-3 h-1.5 bg-dark-600 rounded-full overflow-hidden">
                <div className="h-full bg-gold-500/40 rounded-full" style={{ width: `${getFibonacciWidth(fibonacci, price)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ProAnaliz() {
  const [searchParams] = useSearchParams()
  const { gate, showModal, handleModalClose } = useFeatureGate()

  const [activeTab, setActiveTab] = useState('analiz')
  const [symbol, setSymbol] = useState(searchParams.get('symbol') || '')
  const [period, setPeriod] = useState('3mo')
  const [analysis, setAnalysis] = useState(null)
  const [scanner, setScanner] = useState(null)
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [error, setError] = useState(null)
  const [scanFilter, setScanFilter] = useState('')
  const [scanSort, setScanSort] = useState('alerts')

  // Auto-analyze if symbol param present
  useEffect(() => {
    const s = searchParams.get('symbol')
    if (s) { setSymbol(s); handleAnalyze(s, period) }
  }, [])

  const handleAnalyze = async (sym, per) => {
    const s = (sym || symbol).trim().toUpperCase()
    if (!s) return
    setLoading(true); setError(null); setAnalysis(null); setChartData(null)
    try {
      const res = await fetch(`${API_BASE}/api/pro-analiz/${s}?period=${per || period}`)
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Analiz hatası') }
      const data = await res.json()
      setAnalysis(data)
      // Also fetch chart data
      const cRes = await fetch(`${API_BASE}/api/market/stock/${s}/historical?period=${per || period}&interval=1d`)
      if (cRes.ok) { const cd = await cRes.json(); setChartData(cd.data || cd) }
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  const handleCryptoAnalyze = async (coinId) => {
    setLoading(true); setError(null); setAnalysis(null); setChartData(null)
    try {
      const res = await fetch(`${API_BASE}/api/pro-analiz/crypto/${coinId}`)
      if (!res.ok) {
        let msg = 'Kripto analiz hatası'
        try { const d = await res.json(); msg = d.error || msg } catch {}
        if (res.status === 429 || res.status === 503) {
          msg = 'Kripto verisi şu an yoğun — birkaç dakika sonra tekrar deneyin (3 farklı kaynak deniyoruz).'
        }
        throw new Error(msg)
      }
      const data = await res.json()
      setAnalysis(data)
      // Backend zaten OHLC döndürüyor (Yahoo/Binance/CryptoCompare fallback ile)
      if (Array.isArray(data.ohlc) && data.ohlc.length > 0) {
        setChartData(data.ohlc.map(b => ({
          timestamp: b.timestamp,
          open: b.open, high: b.high, low: b.low, close: b.close,
          volume: b.volume || 0,
        })))
      }
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  const handleScan = async () => {
    setScanLoading(true); setScanner(null)
    try {
      const res = await fetch(`${API_BASE}/api/pro-analiz/scanner`)
      if (!res.ok) throw new Error('Tarama hatası')
      setScanner(await res.json())
    } catch (e) {
      setError(e.message)
    } finally { setScanLoading(false) }
  }

  const recColor = (r) => r === 'AL' ? 'bg-green-500/20 text-green-400 border-green-500/40' : r === 'SAT' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'bg-gold-500/20 text-gold-400 border-gold-500/40'
  const alertColor = (s) => s === 'high' ? 'bg-red-500/20 text-red-400 border-red-500/30' : s === 'medium' ? 'bg-gold-500/20 text-gold-400 border-gold-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'

  const rsiColor = (v) => v < 30 ? 'text-green-400' : v > 70 ? 'text-red-400' : 'text-white'
  const trendIcon = (d) => d === 'up' ? <TrendingUp className="w-4 h-4 text-green-400" /> : d === 'down' ? <TrendingDown className="w-4 h-4 text-red-400" /> : <Minus className="w-4 h-4 text-gray-400" />

  const filteredScanResults = scanner?.results?.filter(r => {
    if (!scanFilter) return true
    const f = scanFilter.toUpperCase()
    return r.symbol.includes(f) || r.name?.toUpperCase().includes(f) || r.alerts.some(a => a.label.toUpperCase().includes(f))
  }).sort((a, b) => {
    if (scanSort === 'alerts') return b.alerts.length - a.alerts.length || b.score - a.score
    if (scanSort === 'score') return b.score - a.score
    if (scanSort === 'rsi_low') return a.rsi - b.rsi
    return 0
  }) || []

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Gem className="w-7 h-7 text-gold-400" />
            Pro Analiz
          </h1>
          <p className="text-gray-400 text-sm mt-1">Profesyonel teknik analiz, formasyon tespiti, piyasa taraması ve kripto analizi</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-xl bg-dark-800 p-1">
          {[
            { id: 'analiz', label: 'BIST Analiz', icon: Activity },
            { id: 'tarama', label: 'Piyasa Tarama', icon: Target },
            { id: 'kripto', label: 'Kripto', icon: Globe },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-gold-500 text-dark-950' : 'text-gray-400 hover:text-white'}`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div><p className="text-red-400 font-medium">Hata</p><p className="text-red-300 text-sm mt-1">{error}</p></div>
        </div>
      )}

      {/* ===== TAB: BIST Analiz ===== */}
      {activeTab === 'analiz' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="card space-y-4">
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="text" placeholder="Hisse kodu (örn: THYAO)"
                  value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                  className="input w-full pl-10" />
              </div>
              <select value={period} onChange={e => setPeriod(e.target.value)} className="input bg-dark-800">
                <option value="1mo">1 Ay</option>
                <option value="3mo">3 Ay</option>
                <option value="6mo">6 Ay</option>
                <option value="1y">1 Yıl</option>
              </select>
              <button onClick={() => gate(() => handleAnalyze())} disabled={loading || !symbol}
                className="btn-primary px-6 flex items-center gap-2">
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {loading ? 'Analiz Ediliyor...' : 'Analiz Et'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PICKS.map(s => (
                <button key={s} onClick={() => { setSymbol(s); handleAnalyze(s, period) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${symbol === s ? 'bg-gold-500/20 text-gold-400 border-gold-500/40' : 'bg-dark-700 text-gray-400 border-dark-600 hover:border-gold-500/30 hover:text-white'}`}>
                  {s}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">Bu analizler eğitim amaçlıdır, yatırım tavsiyesi değildir.</p>
          </div>

          {/* Loading */}
          {loading && (
            <div className="card text-center py-16">
              <RefreshCw className="w-10 h-10 text-gold-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Analiz hesaplanıyor...</p>
              <p className="text-xs text-gray-600 mt-2">Çoklu zaman dilimi, formasyon ve indikatör analizi yapılıyor</p>
            </div>
          )}

          {/* Results */}
          {analysis && !loading && (
            <div className="space-y-4">
              {/* Hero */}
              <div className="card bg-gradient-to-r from-dark-800 to-dark-900">
                <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                  <ScoreGauge score={analysis.score?.total || 0} />
                  <div className="flex-1 text-center md:text-left">
                    <div className="flex items-center gap-3 justify-center md:justify-start flex-wrap">
                      <h2 className="text-3xl font-black text-white">{analysis.symbol}</h2>
                      <span className={`px-3 py-1 rounded-lg text-sm font-black border ${recColor(analysis.score?.recommendation)}`}>
                        {analysis.score?.recommendation}
                      </span>
                      <span className="px-2 py-1 bg-dark-700 text-gray-400 rounded-lg text-xs">{analysis.market}</span>
                    </div>
                    <p className="text-gray-400 mt-1">{analysis.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{analysis.sector}</p>
                    <div className="flex items-center gap-4 mt-3 justify-center md:justify-start flex-wrap">
                      <span className="text-2xl font-bold text-white">
                        {analysis.isCrypto ? `$${Number(analysis.currentPrice).toLocaleString()}` : `${fmt(analysis.currentPrice)} TL`}
                      </span>
                      <span className={`flex items-center gap-1 text-sm font-semibold ${(analysis.changePercent || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(analysis.changePercent || 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {(analysis.changePercent || 0) >= 0 ? '+' : ''}{fmt(analysis.changePercent)}%
                      </span>
                    </div>
                  </div>
                  {/* MTF */}
                  {analysis.multiTimeframe && (
                    <div className="flex gap-3 flex-wrap justify-center">
                      {Object.entries(analysis.multiTimeframe).filter(([, v]) => v).map(([tf, v]) => (
                        <div key={tf} className="bg-dark-700 rounded-xl p-3 text-center min-w-[80px]">
                          <p className="text-xs text-gray-500 mb-1 uppercase">{tf}</p>
                          <div className="flex items-center justify-center gap-1">{trendIcon(v.trend)}</div>
                          <p className={`text-xs font-bold mt-1 ${rsiColor(v.rsi)}`}>RSI {v.rsi}</p>
                          <p className={`text-[10px] mt-0.5 ${v.macd === 'bullish' ? 'text-green-400' : 'text-red-400'}`}>{v.macd === 'bullish' ? '▲ MACD' : '▼ MACD'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Chart */}
              {chartData && chartData.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-gold-400" />
                    Fiyat Grafiği
                    <span className="text-xs text-gray-500 ml-2">Mum + EMA 50 (altın) + EMA 200 (mavi) + Hacim</span>
                  </h3>
                  <ProChart symbol={analysis.symbol} isCrypto={analysis.isCrypto} chartData={chartData} />
                </div>
              )}

              {/* Patterns */}
              {analysis.patterns && analysis.patterns.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-gold-400" />
                    Tespit Edilen Formasyonlar ({analysis.patterns.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {analysis.patterns.map((p, i) => (
                      <div key={i} className={`rounded-xl p-4 border ${p.bullish ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                        <div className="flex items-start gap-3">
                          {p.bullish ? <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" /> : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />}
                          <div>
                            <p className={`font-semibold text-sm ${p.bullish ? 'text-green-400' : 'text-red-400'}`}>{p.name}</p>
                            <p className="text-gray-400 text-xs mt-1">{p.description}</p>
                            <p className="text-gray-600 text-xs mt-1">Güven: %{Math.round((p.confidence || 0.7) * 100)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Commentary */}
              {analysis.commentary && (
                <div className="card border border-gold-500/30 bg-gradient-to-r from-gold-500/5 to-transparent">
                  <h3 className="font-semibold text-gold-400 mb-3 flex items-center gap-2">
                    <Gem className="w-4 h-4" /> AI Yorum
                  </h3>
                  <p className="text-gray-300 text-sm leading-relaxed">{analysis.commentary}</p>
                </div>
              )}

              {/* Score Breakdown */}
              {analysis.score?.breakdown && (
                <div className="card">
                  <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-gold-400" /> Puan Dağılımı
                  </h3>
                  <div className="space-y-3">
                    {Object.entries({
                      'Trend Gücü': [analysis.score.breakdown.trend?.score, 20, analysis.score.breakdown.trend?.label],
                      'RSI Durumu': [analysis.score.breakdown.rsi?.score, 10, analysis.score.breakdown.rsi?.label],
                      'MACD': [analysis.score.breakdown.macd?.score, 15, analysis.score.breakdown.macd?.label],
                      'Hacim': [analysis.score.breakdown.volume?.score, 15, analysis.score.breakdown.volume?.label],
                      'Fibonacci': [analysis.score.breakdown.fibonacci?.score, 15, analysis.score.breakdown.fibonacci?.label],
                      'EMA Hizalaması': [analysis.score.breakdown.emaAlignment?.score, 10, analysis.score.breakdown.emaAlignment?.label],
                      'Momentum': [analysis.score.breakdown.momentum?.score, 10, analysis.score.breakdown.momentum?.label],
                      'Formasyon Bonus': [analysis.score.breakdown.patternBonus?.score, 5, analysis.score.breakdown.patternBonus?.label],
                    }).map(([label, [score, max, extra]]) => (
                      <ScoreBar key={label} label={label} score={score || 0} max={max} extra={extra} />
                    ))}
                  </div>
                </div>
              )}

              {/* Indicators Grid */}
              {analysis.indicators && (
                <div className="card">
                  <h3 className="font-semibold text-white mb-4">Teknik İndikatörler</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    <IndicCard label="RSI (14)" value={fmt(analysis.indicators.rsi)}
                      color={rsiColor(analysis.indicators.rsi || 50)} sub={analysis.indicators.rsi < 30 ? 'Aşırı Satım' : analysis.indicators.rsi > 70 ? 'Aşırı Alım' : 'Normal'} />
                    <IndicCard label="MACD" value={fmt(analysis.indicators.macd, 3)}
                      color={(analysis.indicators.macd || 0) > (analysis.indicators.macdSignal || 0) ? 'text-green-400' : 'text-red-400'}
                      sub={`Sinyal: ${fmt(analysis.indicators.macdSignal, 3)}`} />
                    <IndicCard label="MACD Hist." value={fmt(analysis.indicators.macdHistogram, 3)}
                      color={(analysis.indicators.macdHistogram || 0) > 0 ? 'text-green-400' : 'text-red-400'} />
                    <IndicCard label="Stoch RSI %K" value={fmt(analysis.indicators.stochRsiK)}
                      color={analysis.indicators.stochRsiK < 20 ? 'text-green-400' : analysis.indicators.stochRsiK > 80 ? 'text-red-400' : 'text-white'}
                      sub={`%D: ${fmt(analysis.indicators.stochRsiD)}`} />
                    <IndicCard label="Williams %R" value={fmt(analysis.indicators.williamsR)}
                      color={(analysis.indicators.williamsR || -50) < -80 ? 'text-green-400' : (analysis.indicators.williamsR || -50) > -20 ? 'text-red-400' : 'text-white'} />
                    <IndicCard label="CCI (20)" value={fmt(analysis.indicators.cci)}
                      color={(analysis.indicators.cci || 0) < -100 ? 'text-green-400' : (analysis.indicators.cci || 0) > 100 ? 'text-red-400' : 'text-white'} />
                    <IndicCard label="ATR (14)" value={fmt(analysis.indicators.atr, 3)} sub="Volatilite" />
                    <IndicCard label="Bollinger Üst" value={fmt(analysis.indicators.bollingerUpper)} />
                    <IndicCard label="Bollinger Alt" value={fmt(analysis.indicators.bollingerLower)} />
                    <IndicCard label="OBV" value={analysis.indicators.obv ? (analysis.indicators.obv / 1000).toFixed(0) + 'K' : '—'} sub="Hacim Dengesi" />
                    <IndicCard label="Destek" value={fmt(analysis.indicators.support)} color="text-green-400" />
                    <IndicCard label="Direnç" value={fmt(analysis.indicators.resistance)} color="text-red-400" />
                    <IndicCard label="Pivot" value={fmt(analysis.indicators.pivot)} />
                    <IndicCard label="R1" value={fmt(analysis.indicators.r1)} color="text-red-300" />
                    <IndicCard label="S1" value={fmt(analysis.indicators.s1)} color="text-green-300" />
                  </div>
                </div>
              )}

              {/* EMA Table */}
              {analysis.indicators && (
                <div className="card">
                  <h3 className="font-semibold text-white mb-4">EMA / SMA Seviyeleri</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {[
                      ['EMA 5', analysis.indicators.ema5],
                      ['EMA 9', analysis.indicators.ema9],
                      ['EMA 21', analysis.indicators.ema21],
                      ['EMA 50', analysis.indicators.ema50],
                      ['EMA 100', analysis.indicators.ema100],
                      ['EMA 200', analysis.indicators.ema200],
                      ['SMA 50', analysis.indicators.sma50],
                      ['SMA 200', analysis.indicators.sma200],
                    ].filter(([, v]) => v).map(([label, value]) => {
                      const above = analysis.currentPrice > value
                      return (
                        <div key={label} className={`rounded-xl p-3 border text-center ${above ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                          <p className="text-xs text-gray-500">{label}</p>
                          <p className="font-bold text-white">{fmt(value)}</p>
                          <p className={`text-xs mt-1 font-semibold ${above ? 'text-green-400' : 'text-red-400'}`}>{above ? '▲ Üstünde' : '▼ Altında'}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <FibonacciLevelsCard
                fibonacci={analysis.fibonacci}
                currentPrice={analysis.currentPrice}
                isCrypto={analysis.isCrypto}
                showRange
                showIcon
              />
            </div>
          )}

          {/* Empty state */}
          {!analysis && !loading && !error && (
            <div className="card text-center py-16">
              <Gem className="w-14 h-14 text-gold-400/30 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Pro Analiz Başlatın</h3>
              <p className="text-gray-400 max-w-md mx-auto text-sm">Hisse kodunu girerek formasyon tespiti, Fibonacci analizi, puanlama motoru ve Türkçe otomatik yorum içeren tam analizi başlatın.</p>
            </div>
          )}
        </div>
      )}

      {/* ===== TAB: Piyasa Tarama ===== */}
      {activeTab === 'tarama' && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div>
                <h3 className="font-semibold text-white">BIST 100 Piyasa Tarayıcı</h3>
                <p className="text-gray-400 text-xs mt-1">RSI, MACD, Fibonacci, Hacim ve Golden Cross sinyalleri için 100 hisse taranıyor</p>
              </div>
              <button onClick={handleScan} disabled={scanLoading}
                className="btn-primary px-6 flex items-center gap-2 flex-shrink-0 ml-auto">
                {scanLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                {scanLoading ? 'Taranıyor...' : 'BIST 100 Tara'}
              </button>
            </div>
            {scanLoading && (
              <div className="mt-4 bg-dark-800 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-gold-400 animate-spin" />
                  <div>
                    <p className="text-white text-sm font-medium">100 hisse analiz ediliyor...</p>
                    <p className="text-gray-400 text-xs">Bu işlem 10-15 saniye sürebilir. Sonuçlar 10 dakika boyunca önbelleklenir.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {scanner && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="card text-center">
                  <p className="text-2xl sm:text-3xl font-black text-white">{scanner.total}</p>
                  <p className="text-xs text-gray-500 mt-1">Taranan Hisse</p>
                </div>
                <div className="card text-center">
                  <p className="text-3xl font-black text-gold-400">{scanner.withAlerts}</p>
                  <p className="text-xs text-gray-500 mt-1">Sinyal Bulunan</p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-gray-400 mt-1">Son Tarama</p>
                  <p className="text-sm font-bold text-white mt-1">{new Date(scanner.scannedAt).toLocaleTimeString('tr-TR')}</p>
                </div>
              </div>

              {/* Filters */}
              <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-40">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="text" placeholder="Hisse veya sinyal filtrele..." value={scanFilter}
                    onChange={e => setScanFilter(e.target.value)} className="input w-full pl-10 text-sm" />
                </div>
                <select value={scanSort} onChange={e => setScanSort(e.target.value)} className="input bg-dark-800 text-sm">
                  <option value="alerts">Sinyal Sayısı</option>
                  <option value="score">Puan</option>
                  <option value="rsi_low">En Düşük RSI</option>
                </select>
              </div>

              {/* Results Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredScanResults.map(stock => (
                  <div key={stock.symbol}
                    className="card hover:border-gold-500/30 transition-all cursor-pointer group"
                    onClick={() => { setActiveTab('analiz'); setSymbol(stock.symbol); handleAnalyze(stock.symbol, period) }}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="font-bold text-white group-hover:text-gold-400 transition-colors">{stock.symbol}</span>
                        <p className="text-xs text-gray-500 truncate max-w-[140px]">{stock.name}</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${recColor(stock.recommendation)}`}>{stock.recommendation}</span>
                          <span className="text-xs bg-dark-700 text-white px-2 py-0.5 rounded-full font-bold">{stock.score}</span>
                        </div>
                        <span className={`text-xs font-semibold ${(stock.changePercent || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {(stock.changePercent || 0) >= 0 ? '+' : ''}{fmt(stock.changePercent)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-white font-mono font-bold">{fmt(stock.price)} TL</span>
                      <span className={`text-xs ${rsiColor(stock.rsi)}`}>RSI: {fmt(stock.rsi, 1)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {stock.alerts.map((a, i) => (
                        <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${alertColor(a.severity)}`}>
                          {a.label}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-end mt-2">
                      <span className="text-xs text-gray-600 group-hover:text-gold-400 flex items-center gap-1 transition-colors">
                        Analiz Et <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
                {filteredScanResults.length === 0 && (
                  <div className="col-span-3 text-center py-12 text-gray-500">Filtre kriterlerine uyan hisse bulunamadı</div>
                )}
              </div>
            </div>
          )}

          {!scanner && !scanLoading && (
            <div className="card text-center py-16">
              <Target className="w-14 h-14 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Piyasa Taramasını Başlatın</h3>
              <p className="text-gray-400 text-sm max-w-md mx-auto">BIST 100 hisselerini RSI, MACD, Fibonacci ve hacim sinyalleri için otomatik tarar.</p>
            </div>
          )}
        </div>
      )}

      {/* ===== TAB: Kripto ===== */}
      {activeTab === 'kripto' && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-white mb-1">Kripto Para Analizi</h3>
            <p className="text-gray-400 text-xs mb-4">CoinGecko verisi ile teknik analiz — Fiyat, RSI, MACD, Fibonacci ve daha fazlası</p>
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-1.5 sm:gap-2">
              {CRYPTO_COINS.map(coin => (
                <button key={coin.id} onClick={() => handleCryptoAnalyze(coin.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${analysis?.symbol === coin.symbol && analysis?.isCrypto ? 'bg-gold-500/20 border-gold-500/40' : 'bg-dark-800 border-dark-600 hover:border-gold-500/30'}`}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-[10px]"
                    style={{ backgroundColor: coin.color + '33', border: `2px solid ${coin.color}55` }}>
                    {coin.symbol.slice(0, 3)}
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">{coin.symbol}</span>
                </button>
              ))}
            </div>
          </div>

          {loading && activeTab === 'kripto' && (
            <div className="card text-center py-12">
              <RefreshCw className="w-8 h-8 text-gold-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-400">Kripto verisi alınıyor...</p>
              <p className="text-xs text-gray-600 mt-1">CoinGecko API üzerinden 90 günlük OHLC verisi işleniyor</p>
            </div>
          )}

          {/* Re-use the same analysis display for crypto */}
          {analysis && analysis.isCrypto && !loading && (
            <div className="space-y-4">
              {/* Hero */}
              <div className="card bg-gradient-to-r from-dark-800 to-dark-900">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <ScoreGauge score={analysis.score?.total || 0} />
                  <div className="flex-1 text-center md:text-left">
                    <div className="flex items-center gap-3 justify-center md:justify-start flex-wrap">
                      <h2 className="text-3xl font-black text-white">{analysis.symbol}</h2>
                      <span className={`px-3 py-1 rounded-lg text-sm font-black border ${recColor(analysis.score?.recommendation)}`}>{analysis.score?.recommendation}</span>
                      <span className="px-2 py-1 bg-dark-700 text-gray-400 rounded-lg text-xs">CRYPTO</span>
                    </div>
                    <p className="text-gray-400 mt-1">{analysis.name}</p>
                    <div className="flex items-center gap-4 mt-3 justify-center md:justify-start flex-wrap">
                      <span className="text-2xl font-bold text-white">${Number(analysis.currentPrice).toLocaleString()}</span>
                      <span className={`flex items-center gap-1 text-sm font-semibold ${(analysis.changePercent || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(analysis.changePercent || 0) >= 0 ? '+' : ''}{fmt(analysis.changePercent)}%
                      </span>
                    </div>
                    {analysis.marketCap && (
                      <p className="text-xs text-gray-500 mt-1">Piyasa Değeri: ${(analysis.marketCap / 1e9).toFixed(2)}B</p>
                    )}
                  </div>
                </div>
              </div>

              {chartData && chartData.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-gold-400" /> Kripto Grafik (90 Gün)
                  </h3>
                  <ProChart symbol={analysis.symbol} isCrypto={true} chartData={chartData} />
                </div>
              )}

              {analysis.patterns?.length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-white mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-gold-400" />Formasyonlar</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {analysis.patterns.map((p, i) => (
                      <div key={i} className={`rounded-xl p-4 border ${p.bullish ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                        <div className="flex items-start gap-3">
                          {p.bullish ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                          <div>
                            <p className={`font-semibold text-sm ${p.bullish ? 'text-green-400' : 'text-red-400'}`}>{p.name}</p>
                            <p className="text-gray-400 text-xs mt-1">{p.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analysis.commentary && (
                <div className="card border border-gold-500/30 bg-gradient-to-r from-gold-500/5 to-transparent">
                  <h3 className="font-semibold text-gold-400 mb-3 flex items-center gap-2"><Gem className="w-4 h-4" />AI Yorum</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">{analysis.commentary}</p>
                </div>
              )}

              {analysis.score?.breakdown && (
                <div className="card">
                  <h3 className="font-semibold text-white mb-4">Puan Dağılımı</h3>
                  <div className="space-y-3">
                    {Object.entries({
                      'Trend': [analysis.score.breakdown.trend?.score, 20, analysis.score.breakdown.trend?.label],
                      'RSI': [analysis.score.breakdown.rsi?.score, 10, analysis.score.breakdown.rsi?.label],
                      'MACD': [analysis.score.breakdown.macd?.score, 15, analysis.score.breakdown.macd?.label],
                      'Hacim': [analysis.score.breakdown.volume?.score, 15, analysis.score.breakdown.volume?.label],
                      'Fibonacci': [analysis.score.breakdown.fibonacci?.score, 15, analysis.score.breakdown.fibonacci?.label],
                      'EMA Hizalaması': [analysis.score.breakdown.emaAlignment?.score, 10, analysis.score.breakdown.emaAlignment?.label],
                      'Momentum': [analysis.score.breakdown.momentum?.score, 10, analysis.score.breakdown.momentum?.label],
                      'Formasyon': [analysis.score.breakdown.patternBonus?.score, 5, analysis.score.breakdown.patternBonus?.label],
                    }).map(([label, [score, max, extra]]) => (
                      <ScoreBar key={label} label={label} score={score || 0} max={max} extra={extra} />
                    ))}
                  </div>
                </div>
              )}

              {analysis.indicators && (
                <div className="card">
                  <h3 className="font-semibold text-white mb-4">İndikatörler</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    <IndicCard label="RSI (14)" value={fmt(analysis.indicators.rsi)} color={rsiColor(analysis.indicators.rsi || 50)} />
                    <IndicCard label="MACD" value={fmt(analysis.indicators.macd, 4)} color={(analysis.indicators.macd || 0) > (analysis.indicators.macdSignal || 0) ? 'text-green-400' : 'text-red-400'} />
                    <IndicCard label="Stoch RSI %K" value={fmt(analysis.indicators.stochRsiK)} />
                    <IndicCard label="Williams %R" value={fmt(analysis.indicators.williamsR)} />
                    <IndicCard label="CCI" value={fmt(analysis.indicators.cci)} />
                    <IndicCard label="ATR" value={fmt(analysis.indicators.atr, 4)} />
                    <IndicCard label="BB Üst" value={fmt(analysis.indicators.bollingerUpper, 4)} />
                    <IndicCard label="BB Alt" value={fmt(analysis.indicators.bollingerLower, 4)} />
                  </div>
                </div>
              )}

              <FibonacciLevelsCard
                fibonacci={analysis.fibonacci}
                currentPrice={analysis.currentPrice}
                isCrypto
                showRange
              />
            </div>
          )}

          {!analysis?.isCrypto && !loading && (
            <div className="card text-center py-16">
              <Globe className="w-14 h-14 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Kripto Para Seçin</h3>
              <p className="text-gray-400 text-sm">Yukarıdaki 20 kripto paradan birini seçerek teknik analiz başlatın.</p>
            </div>
          )}
        </div>
      )}

      {showModal && <UsageLimitModal onClose={handleModalClose} />}
    </div>
  )
}
