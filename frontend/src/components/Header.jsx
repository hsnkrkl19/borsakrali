import { Bell, User, LogOut, Search, TrendingUp, TrendingDown, Zap } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../services/api'
import { useUsageStore, DAILY_LIMIT } from '../store/usageStore'
import BrandMark from './BrandMark'

const API_BASE = ''

// Top kripto listesi — arama için lokal eşleştirme
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

  // Endeks ve Ticker verilerini cek
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const [res100, res30, resTicker] = await Promise.all([
          apiClient.get(`${API_BASE}/market/bist100`),
          apiClient.get(`${API_BASE}/market/bist30`),
          apiClient.get(`${API_BASE}/market/stocks?limit=20&sort=volume`) // En hacimli 20 hisse
        ])
        setBist100(res100.data)
        setBist30(res30.data)
        setTickerData(resTicker.data.stocks || [])
      } catch (error) {
        console.error('Piyasa veri hatasi:', error)
      }
    }
    fetchMarketData()
    const interval = setInterval(fetchMarketData, 30000)
    return () => clearInterval(interval)
  }, [])

  // Arama — BIST + Kripto birlikte
  const handleSearch = async (query) => {
    setSearchQuery(query)
    if (query.length >= 1) {
      const q = query.toUpperCase()
      // Lokal kripto eşleştirme
      const cryptoMatches = CRYPTO_LIST.filter(c =>
        c.symbol.startsWith(q) || c.name.toUpperCase().includes(q)
      ).slice(0, 4).map(c => ({ ...c, isCrypto: true }))

      try {
        const response = await apiClient.get(`${API_BASE}/market/stocks/search?q=${query}`)
        const stockResults = (response.data.stocks || []).map(s => ({ ...s, isCrypto: false }))
        // Kripto sonuçları üstte, hisse sonuçları altta
        setSearchResults([...cryptoMatches, ...stockResults])
        setShowResults(true)
      } catch (error) {
        console.error('Arama hatasi:', error)
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

  // Piyasa durumu kontrolu
  const [isMarketOpen, setIsMarketOpen] = useState(false);
  const [marketStatusText, setMarketStatusText] = useState('Piyasa Kapalı');

  useEffect(() => {
    const checkMarketStatus = () => {
      const now = new Date();
      const day = now.getDay();
      const hour = now.getHours();

      // Haftaiçi 09:00 - 18:00 arası
      const isOpen = (day >= 1 && day <= 5) && (hour >= 9 && hour < 18);
      setIsMarketOpen(isOpen);
      setMarketStatusText(isOpen ? 'Canlı' : 'Piyasa Kapalı');
    };

    checkMarketStatus();
    const interval = setInterval(checkMarketStatus, 60000); // Her dakika kontrol et
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex h-16 w-full min-w-0 items-center justify-between gap-2 overflow-hidden border-b border-gold-500/10 bg-gradient-to-r from-dark-900 to-dark-950 px-4 lg:px-6">
      {/* Market Overview */}
      <div className="flex min-w-0 items-center space-x-2 lg:space-x-4">
        {bist100 && (
          <div className="hidden lg:flex items-center space-x-2 rounded-xl border border-gold-500/20 bg-surface-100 px-3 py-2">
            <div className="flex flex-col">
              <span className="text-gray-400 text-[10px] leading-none mb-1">BIST 100</span>
              <span className={`text-[10px] font-bold ${isMarketOpen ? 'text-green-500 animate-pulse' : 'text-red-500'}`}>
                ● {marketStatusText}
              </span>
            </div>
            <span className="text-white font-semibold">{bist100.value?.toLocaleString('tr-TR')}</span>
            <span className={`flex items-center text-sm ${bist100.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {bist100.changePercent >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {bist100.changePercent >= 0 ? '+' : ''}{bist100.changePercent?.toFixed(2)}%
            </span>
          </div>
        )}
        {/* Ticker */}
        <div className="relative mx-2 hidden h-10 min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-gold-500/10 bg-dark-800/50 xl:flex 2xl:mx-4">
          <div className="flex animate-marquee hover:pause whitespace-nowrap">
            {tickerData.length > 0 ? tickerData.map((item, idx) => (
              <div key={idx} className="flex items-center px-4 border-r border-gold-500/10">
                <span className="font-bold text-white mr-2">{item.symbol}</span>
                <span className={`font-mono ${item.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {item.price ? item.price.toFixed(2) : '-'}
                </span>
                <span className={`text-xs ml-1 ${item.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {item.changePercent ? `%${Math.abs(item.changePercent).toFixed(2)}` : '%0.00'}
                </span>
              </div>
            )) : (
              <div className="flex items-center px-4 text-gray-400 text-sm">Piyasa verileri yükleniyor...</div>
            )}
            {/* Duplicate for smooth scroll - Only if data exists */}
            {tickerData.length > 0 && tickerData.map((item, idx) => (
              <div key={`dup-${idx}`} className="flex items-center px-4 border-r border-gold-500/10">
                <span className="font-bold text-white mr-2">{item.symbol}</span>
                <span className={`font-mono ${item.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {item.price ? item.price.toFixed(2) : '-'}
                </span>
                <span className={`text-xs ml-1 ${item.changePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {item.changePercent ? `%${Math.abs(item.changePercent).toFixed(2)}` : '%0.00'}
                </span>
              </div>
            ))}
          </div>
        </div>
        {bist30 && (
          <div className="hidden 2xl:flex items-center space-x-2 rounded-xl border border-gold-500/20 bg-surface-100 px-3 py-2">
            <span className="text-gray-400 text-sm">BIST 30</span>
            <span className="text-white font-semibold">{bist30.value?.toLocaleString('tr-TR')}</span>
            <span className={`flex items-center text-sm ${bist30.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {bist30.changePercent >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
              {bist30.changePercent >= 0 ? '+' : ''}{bist30.changePercent?.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="relative mx-1 min-w-0 flex-1 max-w-[11rem] sm:max-w-xs xl:mx-4 xl:max-w-sm 2xl:max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Hisse veya kripto ara (örn: THYAO, BTC)"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
            className="w-full bg-surface-100 border border-gold-500/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
          />
        </div>

        {/* Search Results Dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-surface-100 border border-gold-500/20 rounded-xl shadow-premium overflow-hidden z-50">
            {searchResults.slice(0, 10).map((stock) => (
              <button
                key={`${stock.isCrypto ? 'crypto' : 'stock'}-${stock.symbol}`}
                onClick={() => handleStockClick(stock.symbol, stock.isCrypto)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-200 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stock.isCrypto ? 'bg-orange-500/20' : 'bg-gold-500/20'}`}>
                    <span className={`font-bold text-xs ${stock.isCrypto ? 'text-orange-400' : 'text-gold-400'}`}>
                      {stock.isCrypto ? '🪙' : stock.symbol.slice(0, 2)}
                    </span>
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold">{stock.symbol}</span>
                      {stock.isCrypto && <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">Kripto</span>}
                    </div>
                    <div className="text-gray-400 text-xs truncate max-w-[150px]">{stock.name}</div>
                  </div>
                </div>
                {stock.price && (
                  <div className="text-right">
                    <div className="text-white font-mono">{stock.price?.toFixed(2)} {stock.isCrypto ? '$' : 'TL'}</div>
                    {stock.changePercent != null && (
                      <div className={`text-xs ${stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
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
      <div className="flex shrink-0 items-center space-x-2 lg:space-x-3">
        {/* Kullanım Hakkı Göstergesi */}
        {!isPremium && (
          <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
            remaining > 3 ? 'bg-green-500/15 text-green-400' :
            remaining > 0 ? 'bg-yellow-500/15 text-yellow-400' :
                            'bg-red-500/15 text-red-400'
          }`}>
            <Zap className="w-3.5 h-3.5" />
            <span>{remaining}/{DAILY_LIMIT}</span>
          </div>
        )}

        {/* Notifications */}
        <button className="relative p-2 hover:bg-surface-100 rounded-xl transition-colors border border-transparent hover:border-gold-500/20">
          <Bell className="w-5 h-5 text-gray-400" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-gold-500 rounded-full animate-pulse"></span>
        </button>

        {/* User Menu */}
        <div className="flex items-center space-x-2 lg:space-x-3 pl-2 lg:pl-4 border-l border-gold-500/20">
          <div className="text-right hidden lg:block">
            <p className="text-sm font-medium text-white">{user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Kullanıcı'}</p>
            <p className="text-xs text-gold-400">Premium Üye</p>
          </div>

          <div className="relative group">
            <button className="hover:shadow-glow-gold transition-all rounded-2xl">
              <BrandMark size="md" />
            </button>

            {/* Dropdown */}
            <div className="absolute right-0 top-full mt-2 w-48 bg-surface-100 border border-gold-500/20 rounded-xl shadow-premium opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <div className="p-2">
                <button className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-surface-200 transition-colors text-left">
                  <User className="w-4 h-4 text-gold-400" />
                  <span className="text-sm text-gray-300">Profil</span>
                </button>
                <button
                  onClick={logout}
                  className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-surface-200 transition-colors text-left text-red-400"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm">Çıkış Yap</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
