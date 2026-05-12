import { useState, useEffect, useMemo, useCallback } from 'react'
import { Flame, RefreshCw, TrendingUp, TrendingDown, Activity, Clock, AlertTriangle } from 'lucide-react'
import api from '../services/api'
import InfoTooltip from './InfoTooltip'

const LIQUIDATION_TIP = {
  title: 'Likidasyon Haritası — Kurumsal Pozisyon Akışı',
  description: 'Binance Futures `forceOrder` canlı akışından üretilen Coinglass-tarzı ısı haritası. Her likidasyon, fiyatın o seviyeyi geçtiğinde zincirleme likidasyona yol açabilecek "para magneti"dir. Yoğunluk arttıkça fiyatın o bölgeye çekilme olasılığı yükselir. Long likidasyonları (kırmızı) destek bölgelerinde, short likidasyonları (yeşil) direnç bölgelerinde küme yapar.',
  formula: '══ Veri Kaynağı ══\n  wss://fstream.binance.com/ws/!forceOrder@arr\n  SELL force order → bir LONG pozisyonu likide edildi (kırmızı)\n  BUY  force order → bir SHORT pozisyonu likide edildi (yeşil)\n\n══ Filtre ══\n  Notional < $1000 likidasyonlar süzülür (gürültü)\n  Son 24 saatlik veri RAM\'de tutulur (process restart\'ta sıfırlanır)\n\n══ Bant Agregasyonu ══\n  Min/max fiyat aralığı 40 bant\'a bölünür\n  Her bant: longUsd + shortUsd + count\n  Renk yoğunluğu = bantUsd / maxBantUsd\n\n══ Yorumlama ══\n  Fiyatın altındaki yoğun long küme → magneti aşağı çeker (short fırsatı)\n  Fiyatın üstündeki yoğun short küme → magneti yukarı çeker (long fırsatı)\n  Sweep sonrası dönüş = klasik likidite avı pattern\'i',
  source: 'Binance Futures USDS-M API — public forceOrder stream',
}

const COINS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA',
  'AVAX', 'LINK', 'MATIC', 'DOT', 'TON', 'NEAR', 'OP', 'ARB',
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

export default function LikidasyonHaritasi() {
  const [symbol, setSymbol] = useState('BTC')
  const [hours, setHours] = useState(12)
  const [heatmap, setHeatmap] = useState(null)
  const [summary, setSummary] = useState(null)
  const [recent, setRecent] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (sym = symbol, hr = hours) => {
    setLoading(true)
    try {
      const [h, s, r, st] = await Promise.all([
        api.get(`/liquidation/heatmap/${sym}?hours=${hr}&buckets=40`),
        api.get(`/liquidation/summary?hours=${hr}&limit=20`),
        api.get(`/liquidation/recent?hours=1&limit=20&minUsd=25000`),
        api.get('/liquidation/stats'),
      ])
      setHeatmap(h.data)
      setSummary(s.data)
      setRecent(r.data?.items || [])
      setStats(st.data)
    } catch (e) {
      // sessiz — endpoint daha yeni boot ettiyse boş döner
    } finally {
      setLoading(false)
    }
  }, [symbol, hours])

  useEffect(() => { refresh(symbol, hours) }, [refresh, symbol, hours])

  // Her 20 saniyede bir otomatik yenile (akış gerçek-zamanlı)
  useEffect(() => {
    const id = setInterval(() => refresh(symbol, hours), 20000)
    return () => clearInterval(id)
  }, [refresh, symbol, hours])

  const maxBin = heatmap?.summary?.maxBinUsd || 0
  const orderedBins = useMemo(() => {
    if (!heatmap?.bins) return []
    // Üstte yüksek fiyat — alta sırala (sell-side üstte, buy-side altta)
    return [...heatmap.bins].reverse()
  }, [heatmap])

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
              Binance Futures canlı forceOrder akışı — Coinglass-tarzı para magneti
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
                {stats.bufferedSymbols} sembol · {stats.bufferedEvents?.toLocaleString()} olay
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
      {heatmap?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card text-center bg-dark-800/50">
            <div className="text-2xl font-bold text-white">{heatmap.summary.events?.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Likidasyon Olayı</div>
          </div>
          <div className="card text-center bg-red-500/10">
            <div className="text-2xl font-bold text-red-300">{fmtUsd(heatmap.summary.longUsd)}</div>
            <div className="text-xs text-gray-500 mt-1">Long Likide</div>
          </div>
          <div className="card text-center bg-emerald-500/10">
            <div className="text-2xl font-bold text-emerald-300">{fmtUsd(heatmap.summary.shortUsd)}</div>
            <div className="text-xs text-gray-500 mt-1">Short Likide</div>
          </div>
          <div className="card text-center bg-amber-500/10">
            <div className="text-2xl font-bold text-amber-300">{fmtUsd(heatmap.summary.totalUsd)}</div>
            <div className="text-xs text-gray-500 mt-1">Toplam {hours}sa</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Heatmap kolonu */}
        <div className="lg:col-span-2 card !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              {symbol}/USDT Heatmap · Son {hours}sa
            </h3>
            {heatmap?.priceRange && (
              <span className="text-xs text-gray-500">
                {fmtPrice(heatmap.priceRange.min)} → {fmtPrice(heatmap.priceRange.max)}
              </span>
            )}
          </div>

          {heatmap?.empty ? (
            <div className="text-center py-12 text-gray-500">
              <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-500/50" />
              <p>Bu sembolde {hours} saatlik veri yok</p>
              <p className="text-[11px] mt-1">WebSocket buffer dolduğunda görünecek (genelde 1-5 dk)</p>
            </div>
          ) : !heatmap ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-5 h-5 text-orange-400 animate-spin mr-2" />
              <span className="text-gray-400">Yükleniyor...</span>
            </div>
          ) : (
            <div className="p-3 space-y-0.5 font-mono text-[11px]">
              {orderedBins.map((b, idx) => {
                const total = b.longUsd + b.shortUsd
                const intensity = maxBin > 0 ? total / maxBin : 0
                const longPct = total > 0 ? b.longUsd / total : 0
                const shortPct = total > 0 ? b.shortUsd / total : 0
                const midPrice = (b.priceLow + b.priceHigh) / 2
                return (
                  <div key={idx} className="flex items-center gap-2 hover:bg-dark-800/40 rounded px-1">
                    <span className="w-16 text-right text-gray-400">{fmtPrice(midPrice)}</span>
                    <div className="flex-1 h-5 bg-dark-900 rounded overflow-hidden flex relative">
                      {b.longUsd > 0 && (
                        <div
                          className="bg-red-500/80 h-full"
                          style={{ width: `${intensity * longPct * 100}%` }}
                          title={`Long: ${fmtUsd(b.longUsd)}`}
                        />
                      )}
                      {b.shortUsd > 0 && (
                        <div
                          className="bg-emerald-500/80 h-full"
                          style={{ width: `${intensity * shortPct * 100}%` }}
                          title={`Short: ${fmtUsd(b.shortUsd)}`}
                        />
                      )}
                    </div>
                    <span className="w-20 text-right text-gray-300">{fmtUsd(total)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sağ kolon: market özeti + recent feed */}
        <div className="space-y-4">
          <div className="card !p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-dark-700">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                Top Likidasyon Coin'leri
              </h3>
              <p className="text-[11px] text-gray-500">Son {summary?.hours || hours}sa, $ olarak</p>
            </div>
            <div className="divide-y divide-dark-700/50">
              {(summary?.items || []).slice(0, 12).map(it => (
                <button
                  key={it.symbol}
                  onClick={() => setSymbol(it.coin)}
                  className={`w-full px-4 py-2 flex items-center gap-2 text-xs hover:bg-dark-800/40 transition-colors ${
                    it.coin === symbol ? 'bg-orange-500/5' : ''
                  }`}
                >
                  <span className="font-bold text-white w-12 text-left">{it.coin}</span>
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

          <div className="card !p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-dark-700">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-400" />
                Son Büyük Likidasyonlar
              </h3>
              <p className="text-[11px] text-gray-500">Min $25K, son 1 saat</p>
            </div>
            <div className="divide-y divide-dark-700/50 max-h-72 overflow-y-auto custom-scrollbar">
              {recent.slice(0, 15).map((e, idx) => (
                <div key={idx} className="px-4 py-1.5 flex items-center gap-2 text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    e.side === 'long' ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {e.side === 'long' ? 'LONG ↓' : 'SHRT ↑'}
                  </span>
                  <span className="font-bold text-white w-14">{e.symbol.replace('USDT', '')}</span>
                  <span className="font-mono text-gray-400">{fmtPrice(e.price)}</span>
                  <span className="font-mono text-amber-300 ml-auto">{fmtUsd(e.notional)}</span>
                  <span className="text-gray-500 text-[10px] w-8 text-right">{fmtAgo(e.time)}</span>
                </div>
              ))}
              {recent.length === 0 && (
                <div className="px-4 py-6 text-center text-gray-500 text-xs">
                  Son 1 saatte $25K+ likidasyon yok
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
