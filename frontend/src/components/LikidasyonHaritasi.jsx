import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Flame, RefreshCw, TrendingUp, TrendingDown, Activity, AlertTriangle } from 'lucide-react'
import api from '../services/api'
import InfoTooltip from './InfoTooltip'

const LIQUIDATION_TIP = {
  title: 'Likidasyon Haritası — Kurumsal Pozisyon Akışı',
  description: 'Bybit Futures `allLiquidation` canlı akışından üretilen 2D likidasyon haritası. X ekseni: zaman (sağ = şimdi), Y ekseni: fiyat. Her nokta gerçek bir likidasyon olayı; nokta boyutu likide edilen dolar miktarıyla orantılı, renk yönü gösterir. Long likidasyonları (kırmızı) destek bölgelerinde, short likidasyonları (yeşil) direnç bölgelerinde küme yapar — yoğun küme = para magneti.',
  formula: '══ Veri Kaynağı ══\n  wss://stream.bybit.com/v5/public/linear\n  allLiquidation.{SYMBOL} (top 100 USDT-perp coin, 24sa hacim)\n  taker=Sell → bir LONG pozisyonu likide edildi (kırmızı)\n  taker=Buy  → bir SHORT pozisyonu likide edildi (yeşil)\n\n══ Filtre ══\n  Notional < $100 likidasyonlar süzülür (gürültü)\n  Son 24 saatlik veri RAM\'de tutulur (process restart\'ta sıfırlanır)\n\n══ Görselleştirme ══\n  Her likidasyon = bir nokta @ (zaman, fiyat)\n  Nokta yarıçapı ∝ √(notional / maxNotional)\n  Renk = yön; opaklık ≈ yakın geçmiş\n\n══ Yorumlama ══\n  Fiyatın altındaki yoğun long küme → magneti aşağı çeker (short fırsatı)\n  Fiyatın üstündeki yoğun short küme → magneti yukarı çeker (long fırsatı)\n  Sweep sonrası dönüş = klasik likidite avı pattern\'i',
  source: 'Bybit V5 USDT-perp — public allLiquidation stream',
}

const COINS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA',
  'AVAX', 'LINK', 'POL', 'DOT', 'TON', 'NEAR', 'OP', 'ARB',
]

function fmtUsd(n) {
  if (!n) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function fmtPrice(p) {
  if (p == null) return '—'
  if (p >= 1000) return p.toFixed(0)
  if (p >= 1)    return p.toFixed(2)
  return p.toFixed(5)
}

function fmtAgo(ms) {
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'şimdi'
  if (m < 60) return `${m}d`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}sa`
  return `${Math.floor(h / 24)}g`
}

function fmtClock(ms) {
  const d = new Date(ms)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

// ── 2D Scatter Map: zaman × fiyat ──────────────────────────────────────────
function LiquidationScatterMap({ data, hours, symbol }) {
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  const layout = useMemo(() => {
    if (!data || data.empty || !data.events?.length) return null

    const events = data.events
    const { from, to } = data.timeRange
    const { min: pMin, max: pMax } = data.priceRange
    const pad = (pMax - pMin) * 0.06 || (pMax || 1) * 0.001
    const pLo = pMin - pad
    const pHi = pMax + pad
    const maxN = events.reduce((m, e) => Math.max(m, e.n), 1)

    const W = 1000, H = 520
    const M = { top: 16, right: 64, bottom: 28, left: 12 }
    const plotW = W - M.left - M.right
    const plotH = H - M.top - M.bottom

    const xOf = (t) => M.left + ((t - from) / Math.max(to - from, 1)) * plotW
    const yOf = (p) => M.top + (1 - (p - pLo) / Math.max(pHi - pLo, 1e-12)) * plotH
    const rOf = (n) => 2 + Math.sqrt(n / maxN) * 18 // 2..20 px

    return { events, from, to, pLo, pHi, maxN, W, H, M, plotW, plotH, xOf, yOf, rOf }
  }, [data])

  if (!data) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-5 h-5 text-orange-400 animate-spin mr-2" />
        <span className="text-gray-400">Yükleniyor...</span>
      </div>
    )
  }
  if (data.empty || !data.events?.length || !layout) {
    return (
      <div className="text-center py-16 text-gray-500">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-500/50" />
        <p>{symbol} için son {hours} saatte likidasyon yok</p>
        <p className="text-[11px] mt-1">Bybit WS buffer'ı bu coinde dolduğunda haritada görünür</p>
      </div>
    )
  }

  const { events, from, to, pLo, pHi, W, H, M, plotW, plotH, xOf, yOf, rOf } = layout

  // Gridlines
  const priceGrid = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => pLo + f * (pHi - pLo))
  const timeStepHrs = hours <= 1 ? 0.25 : hours <= 4 ? 1 : hours <= 12 ? 2 : 4
  const timeGrid = []
  for (let off = 0; off <= hours + 0.001; off += timeStepHrs) {
    timeGrid.push(to - off * 3600 * 1000)
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-[420px] sm:h-[480px] bg-dark-950 rounded select-none"
      >
        {/* Plot bg */}
        <rect
          x={M.left} y={M.top} width={plotW} height={plotH}
          fill="url(#liq-grad)"
        />
        <defs>
          <linearGradient id="liq-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(16,185,129,0.04)" />
            <stop offset="50%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(239,68,68,0.04)" />
          </linearGradient>
        </defs>

        {/* Price gridlines + labels */}
        {priceGrid.map((p, i) => (
          <g key={`p${i}`}>
            <line
              x1={M.left} y1={yOf(p)} x2={W - M.right} y2={yOf(p)}
              stroke="rgba(255,255,255,0.06)" strokeDasharray="3,4"
            />
            <text
              x={W - M.right + 6} y={yOf(p) + 4}
              fill="#9CA3AF" style={{ fontSize: 11, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}
            >
              {fmtPrice(p)}
            </text>
          </g>
        ))}

        {/* Time gridlines + labels */}
        {timeGrid.map((t, i) => (
          <g key={`t${i}`}>
            <line
              x1={xOf(t)} y1={M.top} x2={xOf(t)} y2={H - M.bottom}
              stroke="rgba(255,255,255,0.05)" strokeDasharray="3,4"
            />
            <text
              x={xOf(t)} y={H - M.bottom + 16}
              fill={i === 0 ? '#FBBF24' : '#6B7280'}
              textAnchor={i === 0 ? 'end' : 'middle'}
              style={{ fontSize: 11, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}
            >
              {i === 0 ? 'şimdi' : fmtClock(t)}
            </text>
          </g>
        ))}

        {/* Scatter dots — her nokta bir likidasyon */}
        {events.map((e, i) => {
          const cx = xOf(e.t)
          const cy = yOf(e.p)
          const r = rOf(e.n)
          const isLong = e.s === 'l'
          const ageRatio = (Date.now() - e.t) / (hours * 3600 * 1000)
          const opacity = 0.35 + 0.55 * (1 - Math.min(1, ageRatio))
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill={isLong ? '#EF4444' : '#10B981'}
              fillOpacity={opacity}
              stroke={isLong ? 'rgba(252,165,165,0.9)' : 'rgba(110,231,183,0.9)'}
              strokeWidth={0.6}
              onMouseEnter={() => setHover({ e, cx, cy })}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'crosshair' }}
            />
          )
        })}

        {/* Hover tooltip — SVG içinde, viewBox koordinatlarında */}
        {hover && (() => {
          const TW = 170, TH = 70
          let tx = hover.cx + 14
          let ty = hover.cy - TH - 8
          if (tx + TW > W - M.right) tx = hover.cx - TW - 14
          if (ty < M.top) ty = hover.cy + 14
          const isLong = hover.e.s === 'l'
          return (
            <g pointerEvents="none">
              <rect
                x={tx} y={ty} width={TW} height={TH} rx={6}
                fill="#0B1220" stroke="#1F2937" strokeWidth={1}
              />
              <text x={tx + 10} y={ty + 18} fill={isLong ? '#FCA5A5' : '#6EE7B7'}
                style={{ fontSize: 12, fontWeight: 700 }}>
                {isLong ? 'LONG ↓ LİKİDE' : 'SHORT ↑ LİKİDE'}
              </text>
              <text x={tx + 10} y={ty + 36} fill="#E5E7EB"
                style={{ fontSize: 11, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
                @ {fmtPrice(hover.e.p)}
              </text>
              <text x={tx + 10} y={ty + 51} fill="#FCD34D"
                style={{ fontSize: 12, fontWeight: 700, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
                {fmtUsd(hover.e.n)}
              </text>
              <text x={tx + 10} y={ty + 64} fill="#6B7280"
                style={{ fontSize: 10 }}>
                {fmtClock(hover.e.t)} · {fmtAgo(hover.e.t)} önce
              </text>
            </g>
          )
        })()}
      </svg>

      {/* Açıklama satırı */}
      <div className="px-3 pt-2 flex items-center gap-3 text-[11px] text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" /> LONG likidasyonu (taker satış)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" /> SHORT likidasyonu (taker alış)
        </span>
        <span className="ml-auto">Nokta boyutu ∝ $ büyüklüğü · noktaya dokun → detay</span>
      </div>
    </div>
  )
}

export default function LikidasyonHaritasi() {
  const [symbol, setSymbol] = useState('BTC')
  const [hours, setHours] = useState(12)
  const [mapData, setMapData] = useState(null)
  const [summary, setSummary] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (sym = symbol, hr = hours) => {
    setLoading(true)
    try {
      const [ev, s, st] = await Promise.all([
        api.get(`/liquidation/events/${sym}?hours=${hr}`),
        api.get(`/liquidation/summary?hours=${hr}&limit=20`),
        api.get('/liquidation/stats'),
      ])
      setMapData(ev.data)
      setSummary(s.data)
      setStats(st.data)
    } catch (e) {
      // sessiz — endpoint daha yeni boot ettiyse boş döner
    } finally {
      setLoading(false)
    }
  }, [symbol, hours])

  useEffect(() => { refresh(symbol, hours) }, [refresh, symbol, hours])

  // Her 15 saniyede bir otomatik yenile (akış gerçek-zamanlı)
  useEffect(() => {
    const id = setInterval(() => refresh(symbol, hours), 15000)
    return () => clearInterval(id)
  }, [refresh, symbol, hours])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card !p-0 border-orange-500/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/[0.10] to-transparent pointer-events-none" />
        <div className="relative flex items-center gap-3 p-4 sm:p-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Likidasyon Haritası
              <InfoTooltip size="lg" {...LIQUIDATION_TIP} />
            </h1>
            <p className="text-xs sm:text-sm text-gray-400">
              Bybit USDT-perp · 2D harita (zaman × fiyat) — her nokta gerçek bir likidasyon
            </p>
          </div>
          {stats && (
            <div className="hidden md:flex items-center gap-2 text-[11px]">
              <span className={`px-2 py-1 rounded-md border ${
                stats.connected
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                {stats.connected ? '● CANLI' : '○ Bağlanıyor'}
              </span>
              <span className="px-2 py-1 rounded-md bg-dark-800 border border-dark-700 text-gray-400">
                {stats.subscribedSymbols || 0} izleniyor · {stats.bufferedEvents?.toLocaleString() || 0} olay
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Üst kontroller: coin seçici + saat aralığı */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 mr-1">Coin:</span>
        <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1">
          {COINS.map(c => (
            <button
              key={c}
              onClick={() => setSymbol(c)}
              className={`px-2.5 py-1 rounded text-xs font-bold whitespace-nowrap transition-colors ${
                symbol === c
                  ? 'bg-orange-500 text-slate-950'
                  : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-500">Süre:</span>
          {[1, 4, 12, 24].map(h => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                hours === h ? 'bg-amber-500 text-slate-950' : 'bg-dark-800 text-gray-400 hover:text-white'
              }`}
            >
              {h}sa
            </button>
          ))}
          <button onClick={() => refresh()} disabled={loading} className="ml-2 btn-secondary !py-1.5 flex items-center gap-1.5 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {/* Özet kartlar */}
      {mapData?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card text-center bg-dark-800/50">
            <div className="text-2xl font-bold text-white">{mapData.summary.events?.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Likidasyon Olayı</div>
          </div>
          <div className="card text-center bg-red-500/10">
            <div className="text-2xl font-bold text-red-300">{fmtUsd(mapData.summary.longUsd)}</div>
            <div className="text-xs text-gray-500 mt-1">Long Likide</div>
          </div>
          <div className="card text-center bg-emerald-500/10">
            <div className="text-2xl font-bold text-emerald-300">{fmtUsd(mapData.summary.shortUsd)}</div>
            <div className="text-xs text-gray-500 mt-1">Short Likide</div>
          </div>
          <div className="card text-center bg-amber-500/10">
            <div className="text-2xl font-bold text-amber-300">{fmtUsd(mapData.summary.totalUsd)}</div>
            <div className="text-xs text-gray-500 mt-1">Toplam {hours}sa</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 2D Harita kolonu */}
        <div className="lg:col-span-2 card !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              {symbol}/USDT · 2D Harita · Son {hours}sa
            </h3>
            {mapData?.priceRange && !mapData.empty && (
              <span className="text-xs text-gray-500">
                {fmtPrice(mapData.priceRange.min)} → {fmtPrice(mapData.priceRange.max)}
              </span>
            )}
          </div>
          <div className="p-3">
            <LiquidationScatterMap data={mapData} hours={hours} symbol={symbol} />
          </div>
        </div>

        {/* Sağ kolon: Top Coins */}
        <div className="space-y-4">
          <div className="card !p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-dark-700">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                Top Likidasyon Coin'leri
              </h3>
              <p className="text-[11px] text-gray-500">Son {summary?.hours || hours}sa · coine tıkla → harita</p>
            </div>
            <div className="divide-y divide-dark-700/50 max-h-[28rem] overflow-y-auto custom-scrollbar">
              {(summary?.items || []).slice(0, 20).map(it => (
                <button
                  key={it.symbol}
                  onClick={() => setSymbol(it.coin)}
                  className={`w-full px-4 py-2 flex items-center gap-2 text-xs hover:bg-dark-800/40 transition-colors ${
                    it.coin === symbol ? 'bg-orange-500/10' : ''
                  }`}
                >
                  <span className="font-bold text-white w-14 text-left truncate">{it.coin}</span>
                  <div className="flex-1 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-400" />
                    <span className="text-red-300">{fmtUsd(it.longUsd)}</span>
                    <TrendingUp className="w-3 h-3 text-emerald-400 ml-2" />
                    <span className="text-emerald-300">{fmtUsd(it.shortUsd)}</span>
                  </div>
                  <span className="text-gray-300 font-mono">{fmtUsd(it.totalUsd)}</span>
                </button>
              ))}
              {(!summary?.items || summary.items.length === 0) && (
                <div className="px-4 py-6 text-center text-gray-500 text-xs">
                  Henüz veri yok — buffer doluyor...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
