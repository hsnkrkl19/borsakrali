/**
 * MTF Coin Chart — Borsa Krali (Faz 21)
 *
 * Lightweight-charts ile candlestick chart + giriş/stop/T1/T2 horizontal
 * line overlay. Binance public kline API direkt çağırılır (CORS açık).
 *
 * Props:
 *   symbol      — 'BTC', 'ETH'  (USDT pariteli olduğu varsayılır)
 *   timeframe   — '1m' | '5m' | ... | '1w' (Binance interval)
 *   levels      — { entry, stop, target1, target2 } horizontal line overlay
 *   direction   — 'long' | 'short' (renkler doğru olsun)
 *   height      — px (default 320)
 */

import { useEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import { RefreshCw, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'

const BINANCE_KLINES = 'https://api.binance.com/api/v3/klines'
const TF_LIMITS = { '1m': 100, '5m': 100, '15m': 100, '1h': 120, '4h': 120, '1d': 90, '1w': 60 }

async function fetchKlines(symbol, tf, limit) {
  const url = `${BINANCE_KLINES}?symbol=${symbol}USDT&interval=${tf}&limit=${limit || 120}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Binance ${res.status}`)
  const raw = await res.json()
  return raw.map(k => ({
    time: Math.floor(k[0] / 1000),
    open:  +k[1], high: +k[2], low: +k[3], close: +k[4],
    volume: +k[5],
  }))
}

export default function MTFCoinChart({ symbol, timeframe = '4h', levels = {}, direction = 'long', height = 360 }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volSeriesRef = useRef(null)
  const priceLineHandlesRef = useRef([])
  const [activeTF, setActiveTF] = useState(timeframe)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Init chart on mount + resize
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#9ca3af',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      width: containerRef.current.clientWidth,
      height,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#e11d48',
      borderUpColor: '#10b981',
      borderDownColor: '#e11d48',
      wickUpColor: '#10b981',
      wickDownColor: '#e11d48',
    })

    const volSeries = chart.addHistogramSeries({
      color: 'rgba(16, 185, 129, 0.3)',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volSeriesRef.current = volSeries

    const onResize = () => {
      if (chartRef.current && containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volSeriesRef.current = null
      priceLineHandlesRef.current = []
    }
  }, [height])

  // Load klines whenever symbol or TF changes
  useEffect(() => {
    if (!symbol || !candleSeriesRef.current) return
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchKlines(symbol, activeTF, TF_LIMITS[activeTF])
      .then(candles => {
        if (cancelled || !candleSeriesRef.current) return
        if (!candles?.length) {
          setError(`${symbol}/USDT bulunamadı`)
          return
        }
        candleSeriesRef.current.setData(candles.map(c => ({
          time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
        })))
        // Volume bars — yeşil/kırmızı
        const volBars = candles.map(c => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.35)' : 'rgba(225, 29, 72, 0.35)',
        }))
        volSeriesRef.current.setData(volBars)
        chartRef.current?.timeScale().fitContent()
      })
      .catch(e => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [symbol, activeTF])

  // Levels overlay — entry, stop, target1, target2
  useEffect(() => {
    if (!candleSeriesRef.current) return
    // Önceki price line'ları temizle
    for (const handle of priceLineHandlesRef.current) {
      try { candleSeriesRef.current.removePriceLine(handle) } catch (_) {}
    }
    priceLineHandlesRef.current = []

    const series = candleSeriesRef.current
    const add = (price, title, color, lineStyle = 0) => {
      if (price == null || !isFinite(price)) return
      const handle = series.createPriceLine({
        price,
        color,
        lineWidth: 2,
        lineStyle, // 0 = Solid, 1 = Dotted, 2 = Dashed
        axisLabelVisible: true,
        title,
      })
      priceLineHandlesRef.current.push(handle)
    }

    add(levels.entry,   'Giriş',   direction === 'long' ? '#fbbf24' : '#fbbf24', 0)
    add(levels.stop,    'Stop',    '#e11d48', 2)
    add(levels.target1, 'T1',      '#10b981', 2)
    add(levels.target2, 'T2',      '#34d399', 1)
  }, [levels.entry, levels.stop, levels.target1, levels.target2, direction])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-gray-400">Grafik:</span>
          <span className="font-mono font-bold text-white">{symbol}/USDT</span>
          {levels.entry && (
            <>
              <span className="text-gray-600">·</span>
              {direction === 'long'
                ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                : <TrendingDown className="w-3 h-3 text-rose-400" />}
              <span className={direction === 'long' ? 'text-emerald-300' : 'text-rose-300'}>
                {direction === 'long' ? 'LONG setup' : 'SHORT setup'}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-dark-700 bg-dark-800 p-0.5">
          {['1m','5m','15m','1h','4h','1d','1w'].map(tf => (
            <button
              key={tf}
              onClick={() => setActiveTF(tf)}
              className={`text-[10px] px-1.5 py-1 rounded transition-colors font-mono ${
                activeTF === tf ? 'bg-gold-500/20 text-gold-300' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-dark-700 bg-dark-900">
        <div ref={containerRef} style={{ height }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/60 backdrop-blur-sm">
            <RefreshCw className="w-5 h-5 text-gold-400 animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
            <AlertTriangle className="w-5 h-5 text-rose-400 mb-1" />
            <span className="text-[11px] text-rose-300">{error}</span>
          </div>
        )}
      </div>

      {/* Level legend */}
      {levels.entry && (
        <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-amber-400" />
            Giriş <span className="text-gray-300 font-mono">{levels.entry}</span>
          </span>
          {levels.stop && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 border-t-2 border-dashed border-rose-400" />
              Stop <span className="text-rose-300 font-mono">{levels.stop}</span>
            </span>
          )}
          {levels.target1 && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 border-t-2 border-dashed border-emerald-400" />
              T1 <span className="text-emerald-300 font-mono">{levels.target1}</span>
            </span>
          )}
          {levels.target2 && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 border-t-2 border-dotted border-emerald-300" />
              T2 <span className="text-emerald-200 font-mono">{levels.target2}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
