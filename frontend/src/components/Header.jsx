import { Bell, User, LogOut, Search, TrendingUp, TrendingDown, Zap, KeyRound, Settings, Activity, Sparkles, Crown } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../services/api'
import { useUsageStore, DAILY_LIMIT } from '../store/usageStore'
import BrandMark from './BrandMark'

const API_BASE = ''

const CRYPTO_LIST = [
  { symbol: 'BTC', name: 'Bitcoin' }, { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'BNB', name: 'BNB' }, { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'XRP' }, { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'AVAX', name: 'Avalanche' }, { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'DOT', name: 'Polkadot' }, { symbol: 'LTC', name: 'Litecoin' },
  { symbol: 'LINK', name: 'Chainlink' }, { symbol: 'SHIB', name: 'Shiba Inu' },
  { symbol: 'BCH', name: 'Bitcoin Cash' }, { symbol: 'NEAR', name: 'NEAR Protocol' },
  { symbol: 'UNI', name: 'Uniswap' }, { symbol: 'MATIC', name: 'Polygon' },
  { symbol: 'TRX', name: 'TRON' }, { symbol: 'TON', name: 'Toncoin' },
  { symbol: 'APT', name: 'Aptos' }, { symbol: 'ICP', name: 'Internet Computer' },
  { symbol: 'FIL', name: 'Filecoin' }, { symbol: 'ATOM', name: 'Cosmos' },
  { symbol: 'OP', name: 'Optimism' }, { symbol: 'ARB', name: 'Arbitrum' },
  { symbol: 'INJ', name: 'Injective' }, { symbol: 'SUI', name: 'Sui' },
  { symbol: 'SEI', name: 'Sei' }, { symbol: 'TIA', name: 'Celestia' },
  { symbol: 'PEPE', name: 'Pepe' }, { symbol: 'WLD', name: 'Worldcoin' },
  { symbol: 'AAVE', name: 'Aave' }, { symbol: 'MKR', name: 'Maker' },
  { symbol: 'GRT', name: 'The Graph' }, { symbol: 'ALGO', name: 'Algorand' },
  { symbol: 'XLM', name: 'Stellar' }, { symbol: 'SAND', name: 'The Sandbox' },
]

/* Compact index cell — Bloomberg-style data band */
function IndexCell({ label, value, change, status, pulse }) {
  const up = (change ?? 0) >= 0
  const fmtVal = value != null
    ? Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 })
    : '—'
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 group">
      <div className="flex flex-col items-start leading-none">
        <span className="text-[9px] uppercase tracking-[0.16em] text-amber-400/70 font-bold">{label}</span>
        {status && (
          <span className={`text-[9px] font-bold flex items-center gap-1 mt-0.5 ${pulse ? 'text-emerald-400' : 'text-red-400'}`}>
            <span className={`status-dot ${pulse ? 'status-dot-live' : 'status-dot-off'}`} />
            {status}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-white font-bold text-[13px] num-tabular tracking-tight">{fmtVal}</span>
        {change != null && (
          <span className={`text-[10.5px] font-bold num-tabular px-1.5 py-0.5 rounded-md leading-none ${
            up ? 'bg-emerald-500/12 text-emerald-400' : 'bg-red-500/12 text-red-400'
          }`}>
            {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  )
}

export default function Header() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { getRemaining, isPremium } = useUsageStore()
  const remaining = getRemaining()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showResults, setShowResults] = useState(false)
  const [bist100, setBist100] = useState(null)
  const [bist30, setBist30] = useState(null)
  const [tickerData, setTickerData] = useState([])
  const [time, setTime] = useState(new Date())
  const searchInputRef = useRef(null)

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const [res100, res30, resTicker] = await Promise.all([
          apiClient.get(`${API_BASE}/market/bist100`),
          apiClient.get(`${API_BASE}/market/bist30`),
          apiClient.get(`${API_BASE}/market/stocks?limit=20&sort=volume`)
        ])
        setBist100(res100.data)
        setBist30(res30.data)
        setTickerData(resTicker.data.stocks || [])
      } catch (error) {
        console.error('Piyasa veri hatası:', error)
      }
    }
    fetchMarketData()
    const interval = setInterval(fetchMarketData, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Keyboard shortcut: "/" focuses search
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setShowResults(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSearch = async (query) => {
    setSearchQuery(query)
    if (query.length >= 1) {
      const q = query.toUpperCase()
      const cryptoMatches = CRYPTO_LIST.filter(c =>
        c.symbol.startsWith(q) || c.name.toUpperCase().includes(q)
      ).slice(0, 4).map(c => ({ ...c, isCrypto: true }))

      try {
        const response = await apiClient.get(`${API_BASE}/market/stocks/search?q=${query}`)
        const stockResults = (response.data.stocks || []).map(s => ({ ...s, isCrypto: false }))
        setSearchResults([...cryptoMatches, ...stockResults])
        setShowResults(true)
      } catch (error) {
        setSearchResults(cryptoMatches)
        setShowResults(cryptoMatches.length > 0)
      }
    } else {
      setSearchResults([])
      setShowResults(false)
    }
  }

  const handleStockClick = (symbol, isCrypto = false) => {
    if (isCrypto) navigate(`/kripto?symbol=${symbol}`)
    else navigate(`/teknik-analiz-ai?symbol=${symbol}`)
    setShowResults(false)
    setSearchQuery('')
  }

  const [isMarketOpen, setIsMarketOpen] = useState(false)
  useEffect(() => {
    const check = () => {
      const now = new Date()
      const day = now.getDay()
      const hour = now.getHours()
      setIsMarketOpen(day >= 1 && day <= 5 && hour >= 9 && hour < 18)
    }
    check()
    const i = setInterval(check, 60000)
    return () => clearInterval(i)
  }, [])

  const fmtTime = time.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <header
      className="relative z-30 sticky top-0"
      style={{
        background: 'linear-gradient(180deg, var(--bg-card) 0%, color-mix(in srgb, var(--bg-card) 80%, var(--bg-canvas) 20%) 100%)',
        borderBottom: '1px solid var(--border-main)',
        boxShadow: '0 1px 0 rgba(212, 175, 55, 0.08), 0 6px 24px rgba(0, 0, 0, 0.18)',
      }}
    >
      {/* Bottom hairline accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.35), transparent)' }}
      />

      {/* ─── ROW 1 — DATA BAND (Bloomberg style) ─────────────────────────── */}
      <div
        className="hidden lg:flex items-center justify-between px-4 lg:px-6 py-1.5 text-xs"
        style={{
          background: 'rgba(0, 0, 0, 0.2)',
          borderBottom: '1px solid var(--border-main)',
        }}
      >
        <div className="flex items-center divide-x divide-amber-500/10">
          {bist100 && (
            <IndexCell
              label="BIST 100"
              value={bist100.value}
              change={bist100.changePercent}
              status={isMarketOpen ? 'CANLI' : 'KAPALI'}
              pulse={isMarketOpen}
            />
          )}
          {bist30 && <IndexCell label="BIST 30" value={bist30.value} change={bist30.changePercent} />}
          <IndexCell label="USD/TRY" value="32.41" change={0.12} />
          <IndexCell label="EUR/TRY" value="35.18" change={-0.08} />
          <IndexCell label="GRAM" value="2.847" change={0.84} />
        </div>

        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1.5 text-amber-400/70 font-mono uppercase tracking-wider">
            <span className="status-dot status-dot-gold" />
            {fmtTime}
          </span>
          <span className="text-slate-500 hidden xl:inline">İstanbul · BIST</span>
        </div>
      </div>

      {/* ─── ROW 2 — MAIN HEADER ─────────────────────────────────────────── */}
      <div className="flex h-14 lg:h-16 w-full min-w-0 items-center justify-between gap-2 px-4 lg:px-6">
        {/* Left: Ticker (only on xl+) */}
        <div className="hidden xl:flex relative min-w-0 flex-1 max-w-2xl items-center h-9 overflow-hidden rounded-xl"
          style={{
            background: 'rgba(var(--bg-input-rgb), 0.5)',
            border: '1px solid var(--border-main)',
          }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(90deg, var(--bg-card), transparent)' }}
          />
          <div className="absolute right-0 top-0 bottom-0 w-10 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(-90deg, var(--bg-card), transparent)' }}
          />

          <div className="flex animate-marquee whitespace-nowrap">
            {tickerData.length > 0 ? [...tickerData, ...tickerData].map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleStockClick(item.symbol)}
                className="flex items-center gap-1.5 px-3.5 border-r border-amber-500/8 hover:bg-amber-500/5 transition-colors"
              >
                <span className="font-bold text-white text-[11.5px] tracking-tight">{item.symbol}</span>
                <span className={`font-mono text-[11.5px] num-tabular ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.price ? item.price.toFixed(2) : '-'}
                </span>
                <span className={`text-[10px] font-bold num-tabular ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.changePercent != null ? `${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(2)}%` : ''}
                </span>
              </button>
            )) : (
              <div className="flex items-center px-4 text-slate-400 text-xs">
                <Activity className="w-3 h-3 mr-1.5 animate-pulse text-amber-400" />
                Piyasa verileri yükleniyor…
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1 lg:flex-initial min-w-0 max-w-[14rem] sm:max-w-xs xl:max-w-sm">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/70 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Hisse veya kripto ara…"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              className="input-premium pl-10 pr-10 !py-2.5 !text-[13px]"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-wider text-slate-500 font-mono px-1.5 py-0.5 rounded border border-slate-700/50 hidden md:block">
              /
            </span>
          </div>

          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 overflow-hidden z-50 rounded-xl surface-glass">
              {searchResults.slice(0, 10).map((stock) => (
                <button
                  key={`${stock.isCrypto ? 'crypto' : 'stock'}-${stock.symbol}`}
                  onClick={() => handleStockClick(stock.symbol, stock.isCrypto)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-500/8 transition-colors border-b last:border-b-0 border-amber-500/5"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-[11px] flex-shrink-0 ${
                      stock.isCrypto
                        ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    }`}>
                      {stock.isCrypto ? '◎' : stock.symbol.slice(0, 2)}
                    </div>
                    <div className="text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold text-[13px]">{stock.symbol}</span>
                        {stock.isCrypto && <span className="pill pill-azure !text-[8px] !py-0">KRİPTO</span>}
                      </div>
                      <div className="text-slate-400 text-[11px] truncate max-w-[160px]">{stock.name}</div>
                    </div>
                  </div>
                  {stock.price != null && (
                    <div className="text-right">
                      <div className="text-white font-bold num-tabular text-[13px]">
                        {stock.price?.toFixed(2)} <span className="text-slate-500 text-[10px]">{stock.isCrypto ? '$' : '₺'}</span>
                      </div>
                      {stock.changePercent != null && (
                        <div className={`text-[11px] font-bold num-tabular ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </div>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right cluster */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Usage badge */}
          {!isPremium && (
            <button
              onClick={() => navigate('/abonelik')}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all hover:scale-105 ${
                remaining > 3
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                  : remaining > 0
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                    : 'bg-red-500/10 text-red-400 border-red-500/25'
              }`}
              title="Günlük kullanım hakkı"
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="num-tabular">{remaining}/{DAILY_LIMIT}</span>
            </button>
          )}

          {/* Notifications */}
          <button
            className="relative p-2 rounded-xl transition-all border border-transparent hover:border-amber-500/25 hover:bg-amber-500/8"
            aria-label="Bildirimler"
          >
            <Bell className="w-4 h-4 text-slate-400" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full status-dot-gold" />
          </button>

          {/* User menu */}
          <div className="relative group flex items-center gap-2 lg:gap-2.5 pl-2 lg:pl-2.5 border-l border-amber-500/15 ml-1">
            <div className="text-right hidden lg:block">
              <p className="text-[12.5px] font-semibold text-white leading-tight">
                {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Kullanıcı'}
              </p>
              <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1 justify-end mt-0.5 uppercase tracking-wider">
                <Crown className="w-2.5 h-2.5" />
                {user?.plan === 'lifetime' ? 'Lifetime' :
                 user?.plan === 'pro_monthly' ? 'Pro Üye' :
                 user?.isDemo ? 'Demo' : 'Premium'}
              </p>
            </div>

            <button className="hover:glow-gold transition-all rounded-2xl" aria-label="Kullanıcı menüsü">
              <BrandMark size="md" />
            </button>

            <div
              className="absolute right-0 top-full mt-2 w-56 rounded-xl surface-glass shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all translate-y-1 group-hover:translate-y-0 z-50"
            >
              <div className="p-1.5">
                <div className="px-3 py-2.5 border-b border-amber-500/15 mb-1">
                  <div className="text-[12.5px] font-semibold text-white truncate">{user?.email || 'demo@borsakrali.com'}</div>
                  <div className="text-[10px] text-amber-400 font-bold mt-0.5 uppercase tracking-wider flex items-center gap-1">
                    <Crown className="w-2.5 h-2.5" />
                    {user?.plan === 'lifetime' ? 'Lifetime' : user?.plan === 'pro_monthly' ? 'Pro Aylık' : user?.isDemo ? 'Demo Erişim' : 'Premium'}
                  </div>
                </div>
                {[
                  { icon: Settings, label: 'Ayarlar', to: '/ayarlar' },
                  { icon: KeyRound, label: 'Şifre Değiştir', to: '/sifre-degistir' },
                  { icon: Sparkles, label: 'Abonelik', to: '/abonelik' },
                ].map(item => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.to}
                      onClick={() => navigate(item.to)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-amber-500/10 transition-colors text-left text-[13px] text-slate-200"
                    >
                      <Icon className="w-4 h-4 text-amber-400" />
                      {item.label}
                    </button>
                  )
                })}
                <div className="my-1 divider-gold" />
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-left text-[13px] text-red-400"
                >
                  <LogOut className="w-4 h-4" />
                  Çıkış Yap
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
