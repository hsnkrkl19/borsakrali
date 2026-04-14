import { useEffect, useRef, useState } from 'react'
import { createChart } from 'lightweight-charts'
import { fetchCommodityHistory } from '../utils/commodityHistory'

const COMM_LIST = [
  { key: 'gold_usd', label: 'Altin (Ons)', short: 'AU', color: '#f59e0b', unit: 'USD' },
  { key: 'silver_usd', label: 'Gumus (Ons)', short: 'AG', color: '#94a3b8', unit: 'USD' },
  { key: 'gold_try', label: 'Gram Altin', short: 'GR', color: '#f97316', unit: 'TL/gr' },
  { key: 'usd_try', label: 'Dolar/TL', short: 'USD', color: '#22c55e', unit: 'TL' },
]

function SparkLine({ commKey, color }) {
  const ref = useRef(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return undefined

    const chart = createChart(container, {
      width: Math.max(container.clientWidth || 0, 96),
      height: 52,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: 'transparent',
      },
      watermark: { visible: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { mode: 0 },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, borderVisible: false },
      handleScroll: false,
      handleScale: false,
    })

    const series = chart.addAreaSeries({
      lineColor: color,
      topColor: `${color}26`,
      bottomColor: `${color}04`,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver((entries) => {
        const nextWidth = Math.max(entries[0]?.contentRect?.width || 0, 96)
        chart.applyOptions({ width: nextWidth })
      })
      : null

    resizeObserver?.observe(container)

    let cancelled = false

    fetchCommodityHistory(commKey, { period: '1mo', interval: '1d' })
      .then((payload) => {
        if (!cancelled && payload?.data?.length) {
          series.setData(payload.data.map((point) => ({ time: point.time, value: point.close })))
          chart.timeScale().fitContent()
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      try { chart.remove() } catch (_) {}
    }
  }, [commKey, color])

  return <div ref={ref} className="h-[52px] w-full" />
}

function CommodityCard({ commodity }) {
  const pct = commodity?.changePercent ?? null
  const up = (pct || 0) >= 0
  const price = commodity?.price

  return (
    <div className="card min-w-0 overflow-hidden p-3.5 md:p-4">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold"
              style={{ backgroundColor: `${commodity.color}22`, color: commodity.color }}
            >
              {commodity.short}
            </div>
            <span className="truncate text-xs text-gray-400 md:text-sm">{commodity.label}</span>
          </div>

          <div className="flex min-w-0 items-end gap-2">
            <div className="truncate text-base font-bold leading-tight text-white md:text-lg">
              {price != null
                ? price.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
                : <span className="text-xs text-gray-500">Yukleniyor...</span>}
            </div>
            {price != null && (
              <span className="shrink-0 pb-0.5 text-[10px] font-normal text-gray-500 md:text-xs">
                {commodity.unit}
              </span>
            )}
          </div>

          {pct != null && (
            <span className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${
              up ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
            }`}>
              {up ? '+' : ''}{pct.toFixed(2)}%
            </span>
          )}
        </div>

        <div className="hidden w-28 shrink-0 sm:block md:w-32">
          <SparkLine commKey={commodity.key} color={commodity.color} />
        </div>
      </div>
    </div>
  )
}

export default function CommodityWidget() {
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/market/commodities')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload) => {
        setData(payload)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
        setError(true)
      })
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {COMM_LIST.map((item) => (
          <div key={item.key} className="card h-24 animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="card py-4 text-center text-sm text-gray-500">
        Veri yuklenemedi. Backend'i yeniden baslatin.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {COMM_LIST.map((commodity) => (
        <CommodityCard
          key={commodity.key}
          commodity={{ ...(data[commodity.key] || {}), ...commodity }}
        />
      ))}
    </div>
  )
}
