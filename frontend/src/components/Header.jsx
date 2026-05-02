import { Bell, User, LogOut, Search, TrendingUp, TrendingDown, Zap, KeyRound, Settings, Activity, Sparkles } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../services/api'
import { useUsageStore, DAILY_LIMIT } from '../store/usageStore'
import BrandMark from './BrandMark'

const API_BASE = ''

const CRYPTO_LIST = [
  { symbol: 'BTC',  name: 'Bitcoin' },
  { symbol: 'ETH',  name: 'Ethereum' },
  { symbol: 'BNB',  name: 'BNB' },
  { symbol: 'SOL',  name: 'Solana' },
  { symbol: 'XRP',  name: 'XRP' },
  { symbol: 'ADA',  name: 'Cardano' },
  { symbol: 'AVAX', name: 'Avalanche' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'DOT',  name: 'Polkadot' },
  { symbol: 'LTC',  name: 'Litecoin' },
  { symbol: 'LINK', name: 'Chainlink' },
  { symbol: 'SHIB', name: 'Shiba Inu' },
  { symbol: 'BCH',  name: 'Bitcoin Cash' },
  { symbol: 'NEAR', name: 'NEAR Protocol' },
  { symbol: 'UNI',  name: 'Uniswap' },
  { symbol: 'MATIC',name: 'Polygon' },
  { symbol: 'TRX',  name: 'TRON' },
  { symbol: 'TON',  name: 'Toncoin' },
  { symbol: 'APT',  name: 'Aptos' },
  { symbol: 'ICP',  name: 'Internet Computer' },
  { symbol: 'FIL',  name: 'Filecoin' },
  { symbol: 'ATOM', name: 'Cosmos' },
  { symbol: 'OP',   name: 'Optimism' },
  { symbol: 'ARB',  name: 'Arbitrum' },
  { symbol: 'INJ',  name: 'Injective' },
  { symbol: 'SUI',  name: 'Sui' },
  { symbol: 'SEI',  name: 'Sei' },
  { symbol: 'TIA',  name: 'Celestia' },
  { symbol: 'WIF',  name: 'dogwifhat' },
  { symbol: 'PEPE', name: 'Pepe' },
  { symbol: 'BONK', name: 'Bonk' },
  { symbol: 'JUP',  name: 'Jupiter' },
  { symbol: 'FLOKI',name: 'Floki' },
  { symbol: 'WLD',  name: 'Worldcoin' },
  { symbol: 'STX',  name: 'Stacks' },
  { symbol: 'ORDI', name: 'ORDI' },
  { symbol: 'ENA',  name: 'Ethena' },
  { symbol: 'RUNE', name: 'THORChain' },
  { symbol: 'AAVE', name: 'Aave' },
  { symbol: 'MKR',  name: 'Maker' },
  { symbol: 'GRT',  name: 'The Graph' },
  { symbol: 'ALGO', name: 'Algorand' },
  { symbol: 'VET',  name: 'VeChain' },
  { symbol: 'XLM',  name: 'Stellar' },
  { symbol: 'SAND', name: 'The Sandbox' },
  { symbol: 'MANA', name: 'Decentraland' },
  { symbol: 'AXS',  name: 'Axie Infinity' },
  { symbol: 'CRV',  name: 'Curve DAO' },
  { symbol: 'COMP', name: 'Compound' },
  { symbol: 'ZK',   name: 'zkSync' },
]

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
        console.error('Arama hatası:', error)
        setSearchResults(cryptoMatches)
        setShowResults(cryptoMatches.length > 0)
      }
    } else {
      setSearchResults([])
      setShowResults(false)
    }
  }

  const handleStockClick = (symbol, isCrypto = false) => {
    if (isCrypto) {
      navigate(`/malaysian-snr?symbol=${symbol}&type=crypto`)
    } else {
      navigate(`/teknik-analiz-ai?symbol=${symbol}`)
    }
    setShowResults(false)
    setSearchQuery('')
  }

  const [isMarketOpen, setIsMarketOpen] = useState(false)
  const [marketStatusText, setMarketStatusText] = useState('Piyasa Kapalı')

  useEffect(() => {
    const checkMarketStatus = () => {
      const now = new Date()
      const day = now.getDay()
      const hour = now.getHours()
      const isOpen = (day >= 1 && day <= 5) && (hour >= 9 && hour < 18)
      setIsMarketOpen(isOpen)
      setMarketStatusText(isOpen ? 'Canlı' : 'Kapalı')
    }

    checkMarketStatus()
    const interval = setInterval(checkMarketStatus, 60000)
    return () => clearInterval(interval)
  }, [])

  const fmtPct = (v) => v != null ? `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%` : '—'

  return (
    <header
      className="relative flex h-16 w-full min-w-0 items-center justify-between gap-2 overflow-visible border-b px-4 lg:px-6"
      style={{
        background: 'linear-gradient(180deg, var(--bg-card) 0%, color-mix(in srgb, var(--bg-card) 75%, var(--bg-base) 25%) 100%)',
        borderColor: 'var(--border-main)',
        boxShadow: '0 1px 0 rgba(245, 158, 11, 0.08), 0 4px 20px rgba(0, 0, 0, 0.15)',
      }}
    >
      {/* Top gold accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent pointer-events-none" />

      {/* Market Indices */}
      <div className="flex min-w-0 items-center gap-2 lg:gap-3">
        {bist100 && (
          <div className="hidden lg:flex items-center gap-3 rounded-xl px-3 py-2 group transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.06), rgba(245, 158, 11, 0.02))',
              border: '1px solid rgba(245, 158, 11, 0.2)',
            }}
          >
            <div className="flex flex-col">
              <span className="text-[9px] uppercase tracking-wider text-amber-400/80 font-semibold">BIST 100</span>
              <span className={`text-[10px] font-bold flex items-center gap-1 ${isMarketOpen ? 'text-emerald-400' : 'text-red-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isMarketOpen ? 'bg-emerald-400 pulse-ring' : 'bg-red-400'}`} />
                {marketStatusText}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold num-tabular text-sm">{bist100.value?.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</span>
              <span className={`flex items-center gap-0.5 text-[11px] font-semibold num-tabular px-1.5 py-0.5 rounded ${
                bist100.changePercent >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
              }`}>
                {bist100.changePercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {fmtPct(bist100.changePercent)}
              </span>
            </div>
          </div>
        )}

        {/* Ticker */}
        <div
          className="relative mx-1 hidden h-10 min-w-0 flex-1 items-center overflow-hidden rounded-lg xl:flex 2xl:mx-3"
          style={{
            background: 'rgba(var(--bg-input-rgb), 0.5)',
            border: '1px solid var(--border-main)',
          }}
        >
          {/* Gradient fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[var(--bg-card)] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--bg-card)] to-transparent z-10 pointer-events-none" />

          <div className="flex animate-marquee whitespace-nowrap">
            {tickerData.length > 0 ? tickerData.map((item, idx) => (
              <div key={idx} className="ticker-item flex items-center gap-1.5 px-4 border-r border-amber-500/10 transition-colors">
                <span className="font-bold text-white text-[12px]">{item.symbol}</span>
                <span className={`font-mono text-[12px] num-tabular ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.price ? item.price.toFixed(2) : '-'}
                </span>
                <span className={`text-[10px] font-semibold num-tabular ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.changePercent != null ? `${item.changePercent >= 0 ? '▲' : '▼'} ${Math.abs(item.changePercent).toFixed(2)}%` : ''}
                </span>
              </div>
            )) : (
              <div className="flex items-center px-4 text-gray-400 text-xs">
                <Activity className="w-3 h-3 mr-1.5 animate-pulse text-amber-400" />
                Piyasa verileri yükleniyor...
              </div>
            )}
            {tickerData.length > 0 && tickerData.map((item, idx) => (
              <div key={`dup-${idx}`} className="ticker-item flex items-center gap-1.5 px-4 border-r border-amber-500/10 transition-colors">
                <span className="font-bold text-white text-[12px]">{item.symbol}</span>
                <span className={`font-mono text-[12px] num-tabular ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.price ? item.price.toFixed(2) : '-'}
                </span>
                <span className={`text-[10px] font-semibold num-tabular ${item.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {item.changePercent != null ? `${item.changePercent >= 0 ? '▲' : '▼'} ${Math.abs(item.changePercent).toFixed(2)}%` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {bist30 && (
          <div className="hidden 2xl:flex items-center gap-2 rounded-xl px-3 py-2"
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.06), rgba(245, 158, 11, 0.02))',
              border: '1px solid rgba(245, 158, 11, 0.2)',
            }}
          >
            <span className="text-[9px] uppercase tracking-wider text-amber-400/80 font-semibold">BIST 30</span>
            <span className="text-white font-bold num-tabular text-sm">{bist30.value?.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</span>
            <span className={`flex items-center gap-0.5 text-[11px] font-semibold num-tabular ${
              bist30.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {bist30.changePercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {fmtPct(bist30.changePercent)}
            </span>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative mx-1 min-w-0 flex-1 max-w-[11rem] sm:max-w-xs xl:mx-4 xl:max-w-sm 2xl:max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/70" />
          <input
            type="text"
            placeholder="Hisse veya kripto ara…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
            className="w-full rounded-xl pl-10 pr-4 py-2.5 text-[13px] placeholder-gray-500 focus:outline-none transition-all focus-gold"
            style={{
              background: 'rgba(var(--bg-input-rgb), 0.7)',
              border: '1px solid var(--border-main)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {showResults && searchResults.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 mt-2 overflow-hidden z-50 rounded-xl glass shadow-premium"
            style={{ border: '1px solid rgba(245, 158, 11, 0.25)' }}
          >
            {searchResults.slice(0, 10).map((stock) => (
              <button
                key={`${stock.isCrypto ? 'crypto' : 'stock'}-${stock.symbol}`}
                onClick={() => handleStockClick(stock.symbol, stock.isCrypto)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-500/10 transition-colors border-b last:border-b-0 border-amber-500/5"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                    stock.isCrypto
                      ? 'bg-gradient-to-br from-orange-500/30 to-orange-600/20 text-orange-400 border border-orange-500/30'
                      : 'bg-gradient-to-br from-amber-500/30 to-amber-600/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {stock.isCrypto ? '🪙' : stock.symbol.slice(0, 2)}
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold text-sm">{stock.symbol}</span>
                      {stock.isCrypto && <span className="text-[9px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-md font-bold tracking-wide">KRİPTO</span>}
                    </div>
                    <div className="text-gray-400 text-[11px] truncate max-w-[160px]">{stock.name}</div>
                  </div>
                </div>
                {stock.price && (
                  <div className="text-right">
                    <div className="text-white font-bold num-tabular text-sm">{stock.price?.toFixed(2)} <span className="text-gray-400 text-[10px]">{stock.isCrypto ? '$' : '₺'}</span></div>
                    {stock.changePercent != null && (
                      <div className={`text-[11px] font-semibold num-tabular ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtPct(stock.changePercent)}
                      </div>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right Side */}
      <div className="flex shrink-0 items-center gap-2 lg:gap-3">
        {!isPremium && (
          <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border ${
            remaining > 3
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
              : remaining > 0
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                : 'bg-red-500/10 text-red-400 border-red-500/25'
          }`}>
            <Zap className="w-3.5 h-3.5" />
            <span className="num-tabular">{remaining}/{DAILY_LIMIT}</span>
          </div>
        )}

        <button
          className="relative p-2 hover:bg-amber-500/10 rounded-xl transition-all border border-transparent hover:border-amber-500/25"
          aria-label="Bildirimler"
        >
          <Bell className="w-4 h-4 text-gray-400 group-hover:text-amber-400" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full pulse-ring"></span>
        </button>

        <div className="flex items-center gap-2 lg:gap-3 pl-2 lg:pl-3 border-l border-amber-500/15">
          <div className="text-right hidden lg:block">
            <p className="text-[13px] font-semibold text-white leading-tight">{user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Kullanıcı'}</p>
            <p className="text-[10px] text-amber-400 font-medium flex items-center gap-1 justify-end">
              <Sparkles className="w-2.5 h-2.5" />
              Premium Üye
            </p>
          </div>

          <div className="relative group">
            <button className="hover:glow-gold transition-all rounded-2xl" aria-label="Kullanıcı menüsü">
              <BrandMark size="md" />
            </button>

            <div
              className="absolute right-0 top-full mt-2 w-52 rounded-xl glass shadow-premium opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all translate-y-1 group-hover:translate-y-0 z-50"
              style={{ border: '1px solid rgba(245, 158, 11, 0.25)' }}
            >
              <div className="p-2">
                <div className="px-3 py-2 border-b border-amber-500/15 mb-1">
                  <div className="text-[13px] font-semibold text-white truncate">{user?.email || 'demo@borsakrali.com'}</div>
                  <div className="text-[10px] text-amber-400 font-medium mt-0.5">
                    {user?.plan === 'lifetime' ? 'Lifetime' : user?.plan === 'pro_monthly' ? 'Pro Aylık' : user?.isDemo ? 'Demo Erişim' : 'Premium'}
                  </div>
                </div>
                <button
                  onClick={() => navigate('/ayarlar')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-amber-500/10 transition-colors text-left"
                >
                  <Settings className="w-4 h-4 text-amber-400" />
                  <span className="text-[13px] text-gray-200">Ayarlar</span>
                </button>
                <button
                  onClick={() => navigate('/sifre-degistir')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-amber-500/10 transition-colors text-left"
                >
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span className="text-[13px] text-gray-200">Şifre Değiştir</span>
                </button>
                <button
                  onClick={() => navigate('/abonelik')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-amber-500/10 transition-colors text-left"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-[13px] text-gray-200">Abonelik</span>
                </button>
                <div className="my-1 border-t border-amber-500/15" />
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4 text-red-400" />
                  <span className="text-[13px] text-red-400">Çıkış Yap</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
