import { useState, useEffect, useMemo } from 'react'
import {
  Coins, Search, RefreshCw, TrendingUp, TrendingDown, Bell, Star,
  Trophy, Flame, BarChart3, ArrowUpDown,
} from 'lucide-react'
import api from '../services/api'

const TR_LOCALE = 'tr-TR'

const fmtPrice = (n) => {
  if (n == null) return '—'
  if (n >= 1)    return `$${n.toLocaleString(TR_LOCALE, { maximumFractionDigits: 2 })}`
  if (n >= 0.01) return `$${n.toLocaleString(TR_LOCALE, { maximumFractionDigits: 4 })}`
  return `$${n.toLocaleString(TR_LOCALE, { maximumFractionDigits: 8 })}`
}
const fmtBig = (n) => {
  if (n == null) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3)  return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
const fmtPct = (n) => {
  if (n == null) return null
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

// Mini sparkline SVG
function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const w = 80
  const h = 28
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const color = positive ? '#10b981' : '#ef4444'
  return (
    <svg width={w} height={h} className="block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

// Watchlist storage
const CRYPTO_WATCHLIST_KEY = 'bk-crypto-watchlist'
const PRICE_ALERTS_KEY = 'bk-price-alerts'

const loadWatchlist = () => {
  try { return JSON.parse(localStorage.getItem(CRYPTO_WATCHLIST_KEY) || '[]') } catch { return [] }
}
const saveWatchlist = (list) => {
  localStorage.setItem(CRYPTO_WATCHLIST_KEY, JSON.stringify(list))
}
const loadAlerts = () => {
  try { return JSON.parse(localStorage.getItem(PRICE_ALERTS_KEY) || '[]') } catch { return [] }
}
const saveAlerts = (alerts) => {
  localStorage.setItem(PRICE_ALERTS_KEY, JSON.stringify(alerts))
}

export default function Kripto() {
  const [coins, setCoins]       = useState([])
  const [global, setGlobal]     = useState(null)
  const [trending, setTrending] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [search, setSearch]     = useState('')
  const [sortBy, setSortBy]     = useState('rank')      // rank|price|change24h|marketCap|volume
  const [sortDir, setSortDir]   = useState('asc')
  const [filter, setFilter]     = useState('all')       // all|gainers|losers|watchlist
  const [watchlist, setWatchlist] = useState(loadWatchlist())
  const [alerts, setAlerts]     = useState(loadAlerts())
  const [showAlertFor, setShowAlertFor] = useState(null) // coin id
  const [alertPrice, setAlertPrice]     = useState('')
  const [alertDir, setAlertDir]         = useState('above')
  const [refreshTick, setRefreshTick]   = useState(0)
  const [stale, setStale]               = useState(false)
  const [lastUpdate, setLastUpdate]     = useState(null)
  const [source, setSource]             = useState('')

  // Fetch all data
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    Promise.all([
      api.get('/crypto/markets?limit=100'),
      api.get('/crypto/global'),
      api.get('/crypto/trending'),
    ])
      .then(([mk, gl, tr]) => {
        if (!active) return
        setCoins(mk.data.coins || [])
        setGlobal(gl.data || null)
        setTrending(tr.data.trending || [])
        setStale(!!mk.data.stale)
        setLastUpdate(mk.data.lastUpdate)
        setSource(mk.data.source || '')
      })
      .catch(e => {
        if (!active) return
        const status = e.response?.status
        const detail = e.response?.data?.error || e.response?.data?.detail || e.message
        if (status === 429 || status === 503) {
          setError('Kripto verisi şu an yoğunlaşmış durumda — birkaç dakika sonra tekrar deneyin (3 farklı kaynak deniyoruz).')
        } else {
          setError(detail)
        }
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [refreshTick])

  // Auto-refresh every 5 minutes (önceden 60sn idi - rate limit'e takılmamak için)
  useEffect(() => {
    const interval = setInterval(() => setRefreshTick(t => t + 1), 5 * 60_000)
    return () => clearInterval(interval)
  }, [])

  // Check alerts
  useEffect(() => {
    if (!coins.length || !alerts.length) return
    const triggered = []
    const remaining = alerts.filter(alert => {
      const coin = coins.find(c => c.id === alert.coinId)
      if (!coin) return true
      const price = coin.currentPrice
      const hit = alert.dir === 'above' ? price >= alert.price : price <= alert.price
      if (hit) {
        triggered.push({ ...alert, coin })
        return false
      }
      return true
    })
    if (triggered.length > 0) {
      saveAlerts(remaining)
      setAlerts(remaining)
      triggered.forEach(t => {
        // Browser notification
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`${t.coin.symbol} alarm! 🔔`, {
            body: `${t.coin.name} ${t.dir === 'above' ? 'üstüne çıktı' : 'altına düştü'}: ${fmtPrice(t.coin.currentPrice)}`,
            icon: t.coin.image,
          })
        }
        // In-page toast
        showToast(`🔔 ${t.coin.symbol} ${t.dir === 'above' ? 'üzerinde' : 'altında'}: ${fmtPrice(t.coin.currentPrice)}`)
      })
    }
  }, [coins, alerts])

  const showToast = (msg) => {
    const div = document.createElement('div')
    div.className = 'fixed top-4 right-4 z-[9999] bg-amber-500 text-dark-950 px-4 py-3 rounded-xl shadow-2xl font-semibold animate-slide-in'
    div.textContent = msg
    document.body.appendChild(div)
    setTimeout(() => div.remove(), 5000)
  }

  const toggleWatch = (coinId) => {
    const next = watchlist.includes(coinId)
      ? watchlist.filter(id => id !== coinId)
      : [...watchlist, coinId]
    setWatchlist(next)
    saveWatchlist(next)
  }

  const requestNotifPermission = () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }

  const setAlert = (coin) => {
    requestNotifPermission()
    const price = parseFloat(alertPrice)
    if (!price || price <= 0) return
    const newAlert = {
      id: `${coin.id}_${Date.now()}`,
      coinId: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      price,
      dir: alertDir,
      createdAt: Date.now(),
    }
    const next = [...alerts, newAlert]
    setAlerts(next)
    saveAlerts(next)
    setShowAlertFor(null)
    setAlertPrice('')
    showToast(`✅ Alarm kuruldu: ${coin.symbol} ${alertDir === 'above' ? '≥' : '≤'} ${fmtPrice(price)}`)
  }

  const removeAlert = (alertId) => {
    const next = alerts.filter(a => a.id !== alertId)
    setAlerts(next)
    saveAlerts(next)
  }

  // Filter & sort
  const displayed = useMemo(() => {
    let list = [...coins]
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(c =>
        c.symbol.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
      )
    }
    if (filter === 'gainers')   list = list.filter(c => (c.priceChangePercent24h || 0) > 0)
    if (filter === 'losers')    list = list.filter(c => (c.priceChangePercent24h || 0) < 0)
    if (filter === 'watchlist') list = list.filter(c => watchlist.includes(c.id))

    const dir = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      let av, bv
      switch (sortBy) {
        case 'price':      av = a.currentPrice;             bv = b.currentPrice;            break
        case 'change24h':  av = a.priceChangePercent24h;    bv = b.priceChangePercent24h;   break
        case 'marketCap':  av = a.marketCap;                bv = b.marketCap;               break
        case 'volume':     av = a.totalVolume;              bv = b.totalVolume;             break
        default:           av = a.marketCapRank;            bv = b.marketCapRank;
      }
      av = av ?? Number.MAX_SAFE_INTEGER
      bv = bv ?? Number.MAX_SAFE_INTEGER
      return (av - bv) * dir
    })
    return list
  }, [coins, search, sortBy, sortDir, filter, watchlist])

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir(col === 'rank' ? 'asc' : 'desc') }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-dark-900/60 to-dark-900/30 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Coins className="w-5 h-5 text-dark-950" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Kripto Piyasası</h1>
              <p className="text-xs sm:text-sm text-gray-400">
                {source === 'coingecko' && 'CoinGecko'}
                {source === 'coincap' && 'CoinCap'}
                {source === 'binance' && 'Binance'}
                {!source && 'CoinGecko/CoinCap/Binance'}
                <span> · 5 dk auto-refresh</span>
                {lastUpdate && <span className="ml-1 text-gray-500">· {new Date(lastUpdate).toLocaleTimeString('tr-TR')}</span>}
                {stale && <span className="ml-2 text-amber-400">● önbellek</span>}
              </p>
            </div>
          </div>
          <button
            onClick={() => setRefreshTick(t => t + 1)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {/* Global stats */}
      {global && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-dark-900/60 border border-dark-700 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Toplam Pazar</div>
            <div className="text-sm sm:text-base font-bold text-white">{fmtBig(global.totalMarketCapUsd)}</div>
            <div className={`text-[11px] mt-0.5 font-medium ${global.marketCapChangePercent24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPct(global.marketCapChangePercent24h)}
            </div>
          </div>
          <div className="bg-dark-900/60 border border-dark-700 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">24s Hacim</div>
            <div className="text-sm sm:text-base font-bold text-white">{fmtBig(global.totalVolumeUsd)}</div>
          </div>
          <div className="bg-dark-900/60 border border-dark-700 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">BTC Hakimiyeti</div>
            <div className="text-sm sm:text-base font-bold text-amber-400">{global.btcDominance?.toFixed(1)}%</div>
          </div>
          <div className="bg-dark-900/60 border border-dark-700 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">ETH Hakimiyeti</div>
            <div className="text-sm sm:text-base font-bold text-blue-400">{global.ethDominance?.toFixed(1)}%</div>
          </div>
        </div>
      )}

      {/* Trending strip */}
      {trending.length > 0 && (
        <div className="bg-dark-900/60 border border-dark-700 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-xs uppercase tracking-wider font-semibold text-orange-400">Trend Olanlar</span>
          </div>
          <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
            {trending.slice(0, 8).map(t => (
              <div key={t.id} className="flex-shrink-0 flex items-center gap-2 bg-dark-800 px-2.5 py-1.5 rounded-lg">
                {t.image && <img src={t.image} alt="" className="w-5 h-5 rounded-full" />}
                <span className="text-xs font-semibold text-white">{t.symbol?.toUpperCase()}</span>
                {t.marketCapRank && <span className="text-[10px] text-gray-500">#{t.marketCapRank}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active alerts */}
      {alerts.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <span className="text-xs uppercase tracking-wider font-semibold text-amber-400">Aktif Alarmlar ({alerts.length})</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {alerts.map(a => (
              <button
                key={a.id}
                onClick={() => removeAlert(a.id)}
                className="flex items-center gap-1.5 bg-dark-900 border border-amber-500/30 hover:border-red-500/50 px-2 py-1 rounded-lg text-xs text-white transition-colors group"
                title="Sil"
              >
                <span className="font-semibold">{a.symbol}</span>
                <span className="text-gray-400">{a.dir === 'above' ? '≥' : '≤'}</span>
                <span className="text-amber-400">{fmtPrice(a.price)}</span>
                <span className="text-red-400 ml-1 opacity-0 group-hover:opacity-100">×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Coin ara (BTC, Ethereum...)"
            className="w-full pl-10 pr-4 py-2.5 bg-dark-900 border border-dark-700 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <div className="flex gap-1 bg-dark-900 border border-dark-700 p-1 rounded-xl">
          {[
            { id: 'all',       label: 'Tümü',          icon: BarChart3 },
            { id: 'gainers',   label: 'Yükselenler',   icon: TrendingUp },
            { id: 'losers',    label: 'Düşenler',      icon: TrendingDown },
            { id: 'watchlist', label: 'Takip',         icon: Star },
          ].map(f => {
            const Icon = f.icon
            const active = filter === f.id
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active ? 'bg-amber-500 text-dark-950' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{f.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
          ⚠ {error}
        </div>
      )}

      {/* Coins table */}
      <div className="bg-dark-900/60 border border-dark-700 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-dark-800/60 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-2 sm:px-3 py-3 text-left w-8">#</th>
                <th className="px-2 sm:px-3 py-3 text-left">Coin</th>
                <th className="px-2 sm:px-3 py-3 text-right cursor-pointer hover:text-amber-400" onClick={() => handleSort('price')}>
                  <div className="flex items-center justify-end gap-1">Fiyat <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-2 sm:px-3 py-3 text-right cursor-pointer hover:text-amber-400 hidden md:table-cell" onClick={() => handleSort('change24h')}>
                  <div className="flex items-center justify-end gap-1">24s % <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-2 sm:px-3 py-3 text-right cursor-pointer hover:text-amber-400 hidden lg:table-cell" onClick={() => handleSort('marketCap')}>
                  <div className="flex items-center justify-end gap-1">Market Cap <ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="px-2 sm:px-3 py-3 text-center hidden sm:table-cell">7g Trend</th>
                <th className="px-2 sm:px-3 py-3 text-center w-20">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-gray-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
                  Yükleniyor...
                </td></tr>
              )}
              {!loading && displayed.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-gray-500">
                  Sonuç bulunamadı
                </td></tr>
              )}
              {!loading && displayed.map((c, i) => {
                const change = c.priceChangePercent24h
                const changeColor = change >= 0 ? 'text-emerald-400' : 'text-red-400'
                const isWatched = watchlist.includes(c.id)
                return (
                  <tr key={c.id} className="border-t border-dark-800 hover:bg-dark-800/40 transition-colors">
                    <td className="px-2 sm:px-3 py-3 text-gray-500 text-xs">{c.marketCapRank || i + 1}</td>
                    <td className="px-2 sm:px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        {c.image && <img src={c.image} alt={c.symbol} className="w-7 h-7 rounded-full" />}
                        <div className="min-w-0">
                          <div className="text-white font-semibold text-sm truncate">{c.symbol}</div>
                          <div className="text-xs text-gray-500 truncate hidden sm:block">{c.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-right text-white font-medium font-mono text-xs sm:text-sm">{fmtPrice(c.currentPrice)}</td>
                    <td className={`px-2 sm:px-3 py-3 text-right font-medium text-xs sm:text-sm hidden md:table-cell ${changeColor}`}>
                      {fmtPct(change)}
                    </td>
                    <td className="px-2 sm:px-3 py-3 text-right text-gray-300 text-xs hidden lg:table-cell">{fmtBig(c.marketCap)}</td>
                    <td className="px-2 sm:px-3 py-3 hidden sm:table-cell">
                      <div className="flex items-center justify-center">
                        <Sparkline data={c.sparkline} positive={change >= 0} />
                      </div>
                    </td>
                    <td className="px-2 sm:px-3 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => toggleWatch(c.id)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isWatched ? 'text-amber-400 bg-amber-500/15' : 'text-gray-600 hover:text-amber-400 hover:bg-amber-500/10'
                          }`}
                          title={isWatched ? 'Takipten çıkar' : 'Takibe al'}
                        >
                          <Star className="w-4 h-4" fill={isWatched ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          onClick={() => {
                            setShowAlertFor(c.id === showAlertFor ? null : c.id)
                            setAlertPrice(c.currentPrice?.toString() || '')
                          }}
                          className="p-1.5 rounded-lg text-gray-600 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                          title="Fiyat alarmı"
                        >
                          <Bell className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Alert form (inline) */}
                      {showAlertFor === c.id && (
                        <div className="absolute z-50 mt-1 right-3 bg-dark-900 border border-amber-500/40 rounded-xl p-3 shadow-2xl w-64">
                          <div className="text-xs text-amber-400 font-semibold mb-2">{c.symbol} alarm kur</div>
                          <div className="flex gap-1 mb-2">
                            {[
                              { v: 'above', l: '≥ Üstüne' },
                              { v: 'below', l: '≤ Altına' },
                            ].map(o => (
                              <button
                                key={o.v}
                                onClick={() => setAlertDir(o.v)}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${
                                  alertDir === o.v ? 'bg-amber-500 text-dark-950' : 'bg-dark-800 text-gray-400'
                                }`}
                              >{o.l}</button>
                            ))}
                          </div>
                          <input
                            type="number"
                            step="any"
                            value={alertPrice}
                            onChange={e => setAlertPrice(e.target.value)}
                            placeholder="Fiyat (USD)"
                            className="w-full px-3 py-1.5 mb-2 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => setAlert(c)}
                              className="flex-1 bg-amber-500 hover:bg-amber-600 text-dark-950 text-xs font-bold py-1.5 rounded-lg"
                            >Kur</button>
                            <button
                              onClick={() => setShowAlertFor(null)}
                              className="flex-1 bg-dark-800 text-gray-400 text-xs py-1.5 rounded-lg"
                            >İptal</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-gray-600 text-center pt-2">
        Veri: <span className="text-amber-400/70">CoinGecko API</span> · Eğitim amaçlı, yatırım tavsiyesi değildir
      </div>
    </div>
  )
}
