import { useEffect, useRef, useState, useCallback } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react'
import { createChart } from 'lightweight-charts'
import { normalizeHistoricalQuotes } from '../../utils/chartAnalysis'
import { getChartTheme, getStoredTheme } from '../../utils/theme'

const TIMEFRAMES = [
  { label: '5dk', period: '1d', interval: '5m', key: '5m' },
  { label: '30dk', period: '5d', interval: '30m', key: '30m' },
  { label: '1sa', period: '7d', interval: '60m', key: '1h' },
  { label: 'Gunluk', period: '3mo', interval: '1d', key: '1d' },
  { label: 'Haftalik', period: '1y', interval: '1wk', key: '1wk' },
]

function getAssetQuery(assetType) {
  return assetType === 'crypto' ? '?type=crypto' : ''
}

function getChartQuery(assetType, timeframe) {
  const params = new URLSearchParams({
    period: timeframe.period,
    interval: timeframe.interval,
  })

  if (assetType === 'crypto') {
    params.set('type', 'crypto')
  }

  return params.toString()
}

function getPriceDigits(value, assetType) {
  if (assetType !== 'crypto') return 2

  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return 2
  if (numericValue >= 1000) return 2
  if (numericValue >= 1) return 4
  return 6
}

function formatAssetPrice(value, assetType) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return '-'

  const digits = getPriceDigits(numericValue, assetType)
  const formatted = numericValue.toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

  return assetType === 'crypto' ? `$${formatted}` : `${formatted} TL`
}

export default function StockChart({ symbol, assetType = 'stock' }) {
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const stockRequestIdRef = useRef(0)
  const chartRequestIdRef = useRef(0)
  const chartAbortRef = useRef(null)
  const [theme, setTheme] = useState(() => getStoredTheme())
  const [stockData, setStockData] = useState(null)
  const [chartData, setChartData] = useState([])
  const [volumeData, setVolumeData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tf, setTf] = useState(TIMEFRAMES[3])

  const palette = getChartTheme(theme)
  const assetLabel = assetType === 'crypto' ? 'Kripto' : 'Hisse'

  const fetchStockData = useCallback(async () => {
    if (!symbol) return

    const requestId = ++stockRequestIdRef.current

    try {
      setLoading(true)
      const response = await fetch(`/api/market/stock/${symbol}${getAssetQuery(assetType)}`)
      if (!response.ok) {
        throw new Error(`${assetLabel} verisi alinamadi`)
      }

      const data = await response.json()
      if (requestId !== stockRequestIdRef.current) return

      setStockData(data)
      setError(null)
    } catch {
      if (requestId === stockRequestIdRef.current) {
        setError(`${assetLabel} verisi alinamadi`)
      }
    } finally {
      if (requestId === stockRequestIdRef.current) {
        setLoading(false)
      }
    }
  }, [assetLabel, assetType, symbol])

  const fetchChartData = useCallback(async (timeframe) => {
    if (!symbol) return

    const requestId = ++chartRequestIdRef.current
    chartAbortRef.current?.abort()
    const controller = new AbortController()
    chartAbortRef.current = controller

    try {
      setError(null)
      const response = await fetch(
        `/api/market/stock/${symbol}/historical?${getChartQuery(assetType, timeframe)}`,
        { signal: controller.signal },
      )
      if (!response.ok) {
        throw new Error('Grafik verisi alinamadi')
      }

      const data = await response.json()
      const quotes = data.data || data.quotes || []
      const candles = normalizeHistoricalQuotes(quotes)

      if (requestId !== chartRequestIdRef.current) return

      setChartData(candles)
      setVolumeData(
        candles.map((candle) => ({
          time: candle.time,
          value: candle.volume,
          isUp: candle.close >= candle.open,
        })),
      )
      setError(null)
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('Chart data error:', err)
      if (requestId === chartRequestIdRef.current) {
        setChartData([])
        setVolumeData([])
        setError('Grafik verisi alinamadi')
      }
    }
  }, [assetType, symbol])

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
      height: 520,
      layout: { background: { type: 'solid', color: palette.background }, textColor: palette.textColor },
      grid: { vertLines: { color: palette.gridColor }, horzLines: { color: palette.gridColor } },
      crosshair: { mode: 1 },
      rightPriceScale: {
        borderColor: palette.borderColor,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
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

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    if (chartData.length > 0) {
      const seriesData =
        chartType === 'line'
          ? chartData.map((candle) => ({ time: candle.time, value: candle.close }))
          : chartData

      mainSeries.setData(seriesData)

      if (volumeData.length > 0) {
        volumeSeries.setData(
          volumeData.map((bar) => ({
            time: bar.time,
            value: bar.value,
            color: bar.isUp ? palette.volumeUp : palette.volumeDown,
          })),
        )
      }

      if (chartData.length >= 20) {
        const sma20 = []
        for (let i = 19; i < chartData.length; i += 1) {
          const average =
            chartData.slice(i - 19, i + 1).reduce((sum, candle) => sum + candle.close, 0) / 20
          sma20.push({ time: chartData[i].time, value: average })
        }

        const smaSeries = chart.addLineSeries({
          color: '#f59e0b',
          lineWidth: 1,
          lastValueVisible: false,
          priceLineVisible: false,
        })
        smaSeries.setData(sma20)
      }

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
  }, [
    chartData,
    palette.background,
    palette.borderColor,
    palette.gridColor,
    palette.textColor,
    palette.volumeDown,
    palette.volumeUp,
    tf.interval,
    volumeData,
  ])

  useEffect(() => {
    fetchStockData()
    fetchChartData(tf)
  }, [symbol, tf, fetchStockData, fetchChartData])

  useEffect(
    () => () => {
      chartAbortRef.current?.abort()
    },
    [],
  )

  if (!symbol) {
    return (
      <div className="bg-surface-100 rounded-xl border border-gold-500/20 h-[560px] flex items-center justify-center shadow-sm">
        <p className={palette.emptyTextClass}>{assetLabel} secin</p>
      </div>
    )
  }

  return (
    <div className="bg-surface-100 rounded-xl border border-gold-500/20 overflow-hidden shadow-sm">
      <div className={`${palette.headerClass} px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2`}>
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-gold-400" />
          <span className="font-bold text-white">{symbol}</span>
          {stockData && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xl font-bold text-white">{formatAssetPrice(stockData.price, assetType)}</span>
              <span
                className={`flex items-center gap-1 text-sm font-medium px-2 py-0.5 rounded ${
                  (stockData.changePercent || 0) >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}
              >
                {(stockData.changePercent || 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {(stockData.changePercent || 0) >= 0 ? '+' : ''}
                {(stockData.changePercent || 0).toFixed(2)}%
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
              fetchStockData()
              fetchChartData(tf)
            }}
            className={`p-1.5 rounded transition-colors ${palette.refreshButtonClass}`}
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className={`px-4 py-2 text-xs border-b ${palette.errorClass}`}>
          ! {error}
        </div>
      )}

      <div className={`${palette.subHeaderClass} flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[10px] text-gray-500 border-b`}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 bg-yellow-500 rounded"></span>
          SMA20
        </span>
      </div>

      <div ref={chartContainerRef} className="w-full h-[520px]" />

      {stockData && (
        <div className={`${palette.footerClass} px-3 py-2 border-t grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs`}>
          <div>
            <span className="text-gray-500 block">Acilis</span>
            <p className="text-white font-medium">{formatAssetPrice(stockData.open, assetType)}</p>
          </div>
          <div>
            <span className="text-gray-500 block">En Yuksek</span>
            <p className="text-green-400 font-medium">{formatAssetPrice(stockData.high ?? stockData.dayHigh, assetType)}</p>
          </div>
          <div>
            <span className="text-gray-500 block">En Dusuk</span>
            <p className="text-red-400 font-medium">{formatAssetPrice(stockData.low ?? stockData.dayLow, assetType)}</p>
          </div>
          <div>
            <span className="text-gray-500 block">Hacim</span>
            <p className="text-white font-medium">{stockData.volume?.toLocaleString('tr-TR')}</p>
          </div>
          <div>
            <span className="text-gray-500 block">Onceki</span>
            <p className="text-white font-medium">{formatAssetPrice(stockData.previousClose, assetType)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
