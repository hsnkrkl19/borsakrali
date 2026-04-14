import { useEffect, useRef, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, BarChart3 } from 'lucide-react'
import { createChart } from 'lightweight-charts'
import { normalizeHistoricalQuotes } from '../../utils/chartAnalysis'
import { getChartTheme, getStoredTheme } from '../../utils/theme'

const TIMEFRAMES = [
  { label: '5dk', period: '1d', interval: '5m', key: '5m' },
  { label: '30dk', period: '5d', interval: '30m', key: '30m' },
  { label: '1sa', period: '7d', interval: '60m', key: '1h' },
  { label: 'Günlük', period: '3mo', interval: '1d', key: '1d' },
  { label: 'Haftalık', period: '1y', interval: '1wk', key: '1wk' },
]

export default function BistChart({ period: propPeriod = '1D', refreshInterval = 0 }) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const chartRequestIdRef = useRef(0)
  const chartAbortRef = useRef(null)
  const [theme, setTheme] = useState(() => getStoredTheme())
  const [bistData, setBistData] = useState(null)
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tf, setTf] = useState(() => {
    const mapped = TIMEFRAMES.find((item) => item.key === String(propPeriod).toLowerCase())
    return mapped || TIMEFRAMES[3]
  })

  const palette = getChartTheme(theme)

  const fetchBistData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/market/bist100')
      if (!response.ok) {
        throw new Error('Endeks verisi alinamadi')
      }

      const data = await response.json()
      setBistData(data)
      setError(null)
    } catch {
      setError('Baglanti hatasi')
    } finally {
      setLoading(false)
    }
  }

  const fetchChartData = useCallback(async (timeframe) => {
    const requestId = ++chartRequestIdRef.current
    chartAbortRef.current?.abort()
    const controller = new AbortController()
    chartAbortRef.current = controller

    try {
      setError(null)
      const response = await fetch(
        `/api/market/stock/XU100/historical?period=${timeframe.period}&interval=${timeframe.interval}`,
        { signal: controller.signal },
      )
      if (!response.ok) {
        throw new Error('Grafik verisi alinamadi')
      }

      const data = await response.json()
      const quotes = data.data || data.quotes || []
      const normalized = normalizeHistoricalQuotes(quotes)

      if (requestId !== chartRequestIdRef.current) return
      setChartData(normalized)
      setError(null)
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('Chart data error:', err)
      if (requestId === chartRequestIdRef.current) {
        setChartData([])
        setError('Grafik verisi alinamadi')
      }
    }
  }, [])

  useEffect(() => {
    const syncTheme = (event) => {
      setTheme(event?.detail?.theme || getStoredTheme())
    }

    window.addEventListener('bk-theme-change', syncTheme)
    window.addEventListener('storage', syncTheme)

    return () => {
      window.removeEventListener('bk-theme-change', syncTheme)
      window.removeEventListener('storage', syncTheme)
    }
  }, [])

  useEffect(() => {
    if (!chartContainerRef.current) return undefined
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
    }

    const chart = createChart(chartContainerRef.current, {
      width: Math.max(chartContainerRef.current.clientWidth || 0, 280),
      height: 420,
      layout: { background: { type: 'solid', color: palette.background }, textColor: palette.textColor },
      grid: { vertLines: { color: palette.gridColor }, horzLines: { color: palette.gridColor } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: palette.borderColor },
      timeScale: {
        borderColor: palette.borderColor,
        timeVisible: tf.interval !== '1wk',
        secondsVisible: false,
      },
    })

    const chartType = localStorage.getItem('bk-chart-type') || 'candlestick'
    let mainSeries

    if (chartType === 'line') {
      mainSeries = chart.addLineSeries({
        color: '#eab308',
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
      })
    } else if (chartType === 'bar') {
      mainSeries = chart.addBarSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
      })
    } else {
      mainSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderDownColor: '#ef4444',
        borderUpColor: '#22c55e',
        wickDownColor: '#ef4444',
        wickUpColor: '#22c55e',
      })
    }

    if (chartData.length > 0) {
      const seriesData =
        chartType === 'line'
          ? chartData.map((candle) => ({ time: candle.time, value: candle.close }))
          : chartData

      mainSeries.setData(seriesData)

      chart.timeScale().fitContent()
    }

    const handleResize = () => {
      chart.applyOptions({
        width: Math.max(chartContainerRef.current?.clientWidth || 0, 280),
      })
    }

    window.addEventListener('resize', handleResize)
    chartRef.current = chart

    return () => {
      window.removeEventListener('resize', handleResize)
      if (chartRef.current) {
        chartRef.current.remove()
        chartRef.current = null
      }
    }
  }, [chartData, palette.background, palette.borderColor, palette.gridColor, palette.textColor, tf.interval])

  useEffect(() => {
    fetchBistData()
    fetchChartData(tf)

    if (refreshInterval > 0) {
      const intervalId = setInterval(fetchBistData, refreshInterval)
      return () => clearInterval(intervalId)
    }

    return undefined
  }, [tf, refreshInterval, fetchChartData])

  useEffect(
    () => () => {
      chartAbortRef.current?.abort()
    },
    [],
  )

  return (
    <div className="bg-surface-100 rounded-xl border border-gold-500/20 overflow-hidden relative shadow-sm">
      <div className={`${palette.headerClass} px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2`}>
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-gold-400" />
          <span className="font-bold text-white">BIST 100</span>
          {bistData && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-bold text-white">
                {bistData.price?.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
              </span>
              <span
                className={`flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded ${
                  bistData.changePercent >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}
              >
                {bistData.changePercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {bistData.changePercent >= 0 ? '+' : ''}
                {bistData.changePercent?.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {TIMEFRAMES.map((item) => (
              <button
                key={item.key}
                onClick={() => setTf(item)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  tf.key === item.key
                    ? 'bg-gold-500/30 text-gold-400 border border-gold-500/50'
                    : palette.buttonClass
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              fetchBistData()
              fetchChartData(tf)
            }}
            className={`p-1.5 rounded transition-colors ${palette.refreshButtonClass}`}
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className={`absolute top-16 left-4 z-10 px-3 py-1 rounded text-xs border ${palette.errorClass}`}>
          {error}
        </div>
      )}

      <div ref={chartContainerRef} className="w-full h-[420px]" />

      {bistData && (
        <div className={`${palette.footerClass} px-3 py-2 border-t grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs`}>
          <div>
            <span className="text-gray-500 block">Acilis</span>
            <p className="text-white font-medium">{bistData.open?.toLocaleString('tr-TR')}</p>
          </div>
          <div>
            <span className="text-gray-500 block">En Yuksek</span>
            <p className="text-green-400 font-medium">{(bistData.high ?? bistData.dayHigh)?.toLocaleString('tr-TR')}</p>
          </div>
          <div>
            <span className="text-gray-500 block">En Dusuk</span>
            <p className="text-red-400 font-medium">{(bistData.low ?? bistData.dayLow)?.toLocaleString('tr-TR')}</p>
          </div>
          <div>
            <span className="text-gray-500 block">Onceki Kapanis</span>
            <p className="text-white font-medium">{bistData.previousClose?.toLocaleString('tr-TR')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
