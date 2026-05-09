import { Bell, LogOut, Search, Zap, KeyRound, Settings, Activity, Sparkles, Crown, Target, TrendingUp, TrendingDown, Command, Megaphone } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../services/api'
import { useUsageStore, DAILY_LIMIT } from '../store/usageStore'
import { useAnnouncementsStore } from '../store/announcementsStore'
import { formatRelativeTime } from '../lib/strategyMeta'
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
        <span className="text-[9px] uppercase tracking-[0.16em] font-bold" style={{ color: 'var(--gold-400)' }}>{label}</span>
        {status && (
          <span className="text-[9px] font-bold flex items-center gap-1 mt-0.5"
            style={{ color: pulse ? 'var(--jade)' : 'var(--text-faint)' }}
          >
            <span className={`status-dot ${pulse ? 'status-dot-live' : 'status-dot-off'}`} />
            {status}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-[13px] num-tabular tracking-tight" style={{ color: 'var(--text-primary)' }}>{fmtVal}</span>
        {change != null && (
          <span className="text-[10.5px] font-bold num-tabular px-1.5 py-0.5 rounded-md leading-none"
            style={{
              background: up ? 'rgba(0, 201, 138, 0.12)' : 'rgba(255, 59, 70, 0.12)',
              color: up ? 'var(--jade)' : 'var(--ember)',
            }}
          >
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
  const [bist100, setBist100] = useState(null)
  const [bist30, setBist30] = useState(null)
  const [usdtry, setUsdtry] = useState(null)
  const [eurtry, setEurtry] = useState(null)
  const [gram, setGram] = useState(null)
  const [tickerData, setTickerData] = useState([])
  const [time, setTime] = useState(new Date())
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTab, setNotifTab] = useState('announcements') // 'announcements' | 'signals'
  const [signals, setSignals] = useState([])
  const announcements = useAnnouncementsStore((s) => s.announcements)
  const markAllAnnouncementsRead = useAnnouncementsStore((s) => s.markAllRead)
  const announcementReadIds = useAnnouncementsStore((s) => s.readIds)
  const announcementUnread = announcements.filter((a) => a.id && !announcementReadIds.includes(a.id)).length
  const userMenuRef = useRef(null)
  const notifRef = useRef(null)
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [userMenuOpen])

  useEffect(() => {
    if (!notifOpen) return
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [notifOpen])

  const handleLogout = () => {
    setUserMenuOpen(false)
    logout()
    navigate('/login')
  }

  const openCmdK = () => window.dispatchEvent(new CustomEvent('bk-open-cmdk'))

  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const [resMacro, resTicker] = await Promise.all([
          apiClient.get(`${API_BASE}/market/macro`),
          apiClient.get(`${API_BASE}/market/stocks?limit=20&sort=volume`)
        ])
        const macro = resMacro.data || {}
        if (macro.bist100) {
          setBist100({ value: macro.bist100.price, changePercent: macro.bist100.changePercent })
        }
        if (macro.bist30) {
          setBist30({ value: macro.bist30.price, changePercent: macro.bist30.changePercent })
        }
        if (macro.usdtry) {
          setUsdtry({ value: macro.usdtry.price, changePercent: macro.usdtry.changePercent })
        }
        if (macro.eurtry) {
          setEurtry({ value: macro.eurtry.price, changePercent: macro.eurtry.changePercent })
        }
        if (macro.gold) {
          setGram({ value: macro.gold.price, changePercent: macro.gold.changePercent })
        }
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

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        openCmdK()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Pull recent signals for the notifications dropdown
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await apiClient.get('/market/algorithm-signals?limit=6')
        if (cancelled) return
        const list = res.data?.signals || res.data?.stocks || res.data || []
        setSignals(Array.isArray(list) ? list.slice(0, 6) : [])
      } catch {
        if (!cancelled) setSignals([])
      }
    }
    load()
    const i = setInterval(load, 120000)
    return () => { cancelled = true; clearInterval(i) }
  }, [])

  const handleStockClick = (symbol, isCrypto = false) => {
    if (isCrypto) navigate(`/kripto?symbol=${symbol}`)
    else navigate(`/teknik-analiz-ai?symbol=${symbol}`)
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
      <div className="data-band hidden lg:flex items-center justify-between px-4 lg:px-6 py-1.5 text-xs">
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
          {usdtry && <IndexCell label="USD/TRY" value={usdtry.value} change={usdtry.changePercent} />}
          {eurtry && <IndexCell label="EUR/TRY" value={eurtry.value} change={eurtry.changePercent} />}
          {gram && <IndexCell label="GRAM" value={gram.value} change={gram.changePercent} />}
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

        {/* Search trigger — opens command palette */}
        <button
          type="button"
          onClick={openCmdK}
          aria-label="Komut paletini aç"
          title={`Komut Paleti — ${isMac ? '⌘' : 'Ctrl'} + K`}
          className="group flex-1 lg:flex-initial min-w-0 max-w-[14rem] sm:max-w-xs xl:max-w-sm flex items-center gap-2.5 h-10 pl-3.5 pr-2 rounded-xl transition-all"
          style={{
            background: 'rgba(var(--bg-input-rgb), 0.7)',
            border: '1px solid var(--border-main)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-gold)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-main)' }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--gold-400)' }} />
          <span className="flex-1 text-left text-[13px] truncate" style={{ color: 'var(--text-faint)' }}>
            Hisse, kripto veya sayfa ara…
          </span>
          <span className="hidden md:flex items-center gap-1 flex-shrink-0">
            <span className="kbd">{isMac ? '⌘' : 'Ctrl'}</span>
            <span className="kbd">K</span>
          </span>
        </button>

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
          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setNotifOpen(v => {
                  const next = !v
                  if (next) {
                    // Açılışta varsayılan olarak Duyurular sekmesini göster
                    setNotifTab(announcementUnread > 0 ? 'announcements' : (signals.length > 0 ? 'signals' : 'announcements'))
                    // Açıldığında okundu olarak işaretle
                    setTimeout(() => markAllAnnouncementsRead(), 800)
                  }
                  return next
                })
              }}
              className="relative p-2 rounded-xl transition-all border border-transparent hover:border-amber-500/25 hover:bg-amber-500/8"
              aria-label="Bildirimler"
              aria-expanded={notifOpen}
              aria-haspopup="menu"
            >
              <Bell className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              {(announcementUnread > 0 || signals.length > 0) && (
                <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{
                    background: announcementUnread > 0 ? 'var(--ember)' : 'var(--gold-400)',
                    color: announcementUnread > 0 ? '#fff' : '#1a1208',
                    boxShadow: announcementUnread > 0
                      ? '0 0 8px rgba(255, 59, 70, 0.7)'
                      : '0 0 8px rgba(212, 175, 55, 0.6)',
                  }}
                >
                  {announcementUnread > 0 ? announcementUnread : signals.length}
                </span>
              )}
            </button>

            {notifOpen && (
              <div
                role="menu"
                className="notif-panel absolute right-0 top-full mt-2 w-[22rem] max-h-[30rem] overflow-hidden flex flex-col z-50"
              >
                {/* Tab header */}
                <div
                  className="flex items-stretch flex-shrink-0"
                  style={{ borderBottom: '1px solid var(--border-main)' }}
                >
                  <button
                    type="button"
                    onClick={() => setNotifTab('announcements')}
                    className="flex-1 px-3 py-2.5 flex items-center justify-center gap-1.5 text-[12px] font-semibold transition-colors"
                    style={{
                      color: notifTab === 'announcements' ? 'var(--gold-400)' : 'var(--text-muted)',
                      borderBottom: notifTab === 'announcements' ? '2px solid var(--gold-400)' : '2px solid transparent',
                      background: notifTab === 'announcements' ? 'rgba(212, 175, 55, 0.06)' : 'transparent',
                    }}
                  >
                    <Megaphone className="w-3.5 h-3.5" />
                    Duyurular
                    {announcementUnread > 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--ember)', color: '#fff' }}>
                        {announcementUnread}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifTab('signals')}
                    className="flex-1 px-3 py-2.5 flex items-center justify-center gap-1.5 text-[12px] font-semibold transition-colors"
                    style={{
                      color: notifTab === 'signals' ? 'var(--gold-400)' : 'var(--text-muted)',
                      borderBottom: notifTab === 'signals' ? '2px solid var(--gold-400)' : '2px solid transparent',
                      background: notifTab === 'signals' ? 'rgba(212, 175, 55, 0.06)' : 'transparent',
                    }}
                  >
                    <Target className="w-3.5 h-3.5" />
                    Sinyaller
                    {signals.length > 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'var(--gold-400)', color: '#1a1208' }}>
                        {signals.length}
                      </span>
                    )}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                  {notifTab === 'announcements' ? (
                    announcements.length === 0 ? (
                      <div className="px-4 py-10 text-center" style={{ color: 'var(--text-faint)' }}>
                        <Megaphone className="w-6 h-6 mx-auto mb-2 opacity-50" />
                        <div className="text-sm">Henüz duyuru yok</div>
                        <div className="text-xs mt-1">Yeni duyuru gelince burada görünecek</div>
                      </div>
                    ) : (
                      announcements.map((a) => {
                        const isUnread = a.id && !announcementReadIds.includes(a.id)
                        return (
                          <button
                            key={a.id || a.sentAt}
                            onClick={() => {
                              setNotifOpen(false)
                              if (a.path) {
                                if (/^https?:\/\//i.test(a.path)) window.open(a.path, '_blank')
                                else navigate(a.path)
                              }
                            }}
                            className="notif-row w-full text-left"
                            style={isUnread ? { background: 'rgba(212, 175, 55, 0.06)' } : undefined}
                          >
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{
                                background: 'rgba(212, 175, 55, 0.15)',
                                color: 'var(--gold-400)',
                                border: '1px solid var(--border-gold)',
                              }}
                            >
                              <Megaphone className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{a.title}</span>
                                {isUnread && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--ember)' }} />}
                              </div>
                              <div className="text-[11.5px] mt-0.5 leading-snug line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                                {a.body}
                              </div>
                              <div className="text-[10px] mt-1 flex items-center gap-1" style={{ color: 'var(--text-faint)' }}>
                                {formatRelativeTime(a.sentAt)}
                                {a.sentBy && <> · {a.sentBy}</>}
                                {a.path && <> · <span style={{ color: 'var(--gold-400)' }}>{a.path}</span></>}
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )
                  ) : (
                    signals.length === 0 ? (
                      <div className="px-4 py-10 text-center" style={{ color: 'var(--text-faint)' }}>
                        <Target className="w-6 h-6 mx-auto mb-2 opacity-50" />
                        <div className="text-sm">Henüz sinyal yok</div>
                        <div className="text-xs mt-1">Algoritma çalışıyor — birazdan</div>
                      </div>
                    ) : (
                      signals.map((s, i) => {
                        const sig = s.signal || s.aksiyon || s.action || 'NÖTR'
                        const isBuy = ['AL', 'BUY', 'GÜÇLÜ AL'].includes(sig?.toUpperCase?.())
                        const isSell = ['SAT', 'SELL', 'GÜÇLÜ SAT'].includes(sig?.toUpperCase?.())
                        const color = isBuy ? 'var(--jade)' : isSell ? 'var(--ember)' : 'var(--gold-400)'
                        return (
                          <button
                            key={`${s.symbol}-${i}`}
                            onClick={() => {
                              setNotifOpen(false)
                              handleStockClick(s.symbol)
                            }}
                            className="notif-row w-full text-left"
                          >
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                              style={{
                                background: isBuy ? 'rgba(0, 201, 138, 0.12)' : isSell ? 'rgba(255, 59, 70, 0.12)' : 'rgba(212, 175, 55, 0.12)',
                                color,
                                border: `1px solid ${color}30`,
                              }}
                            >
                              {isBuy ? <TrendingUp className="w-4 h-4" /> : isSell ? <TrendingDown className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{s.symbol}</span>
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
                                  {sig}
                                </span>
                              </div>
                              <div className="text-[11px] num-tabular" style={{ color: 'var(--text-muted)' }}>
                                {s.price != null ? `${Number(s.price).toFixed(2)} ₺` : ''}
                                {s.changePercent != null && (
                                  <span className="ml-1 font-semibold"
                                    style={{ color: s.changePercent >= 0 ? 'var(--jade)' : 'var(--ember)' }}
                                  >
                                    {s.changePercent >= 0 ? '+' : ''}{s.changePercent.toFixed(2)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )
                  )}
                </div>

                <button
                  onClick={() => { setNotifOpen(false); navigate(notifTab === 'announcements' ? '/site-haritasi' : '/gunluk-tespitler') }}
                  className="px-3.5 py-2.5 border-t text-[12px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-80 transition-opacity"
                  style={{
                    borderColor: 'var(--border-main)',
                    background: 'rgba(212, 175, 55, 0.06)',
                    color: 'var(--gold-400)',
                  }}
                >
                  Tüm sinyalleri görüntüle →
                </button>
              </div>
            )}
          </div>

          {/* User menu */}
          <div
            ref={userMenuRef}
            className="relative flex items-center gap-2 lg:gap-2.5 pl-2 lg:pl-2.5 ml-1"
            style={{ borderLeft: '1px solid var(--border-main)' }}
          >
            <div className="text-right hidden lg:block">
              <p className="text-[12.5px] font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Kullanıcı'}
              </p>
              <p className="text-[10px] font-bold flex items-center gap-1 justify-end mt-0.5 uppercase tracking-wider"
                style={{ color: 'var(--gold-400)' }}
              >
                <Crown className="w-2.5 h-2.5" />
                {user?.plan === 'lifetime' ? 'Lifetime' :
                 user?.plan === 'pro_monthly' ? 'Pro Üye' :
                 user?.isDemo ? 'Demo' : 'Premium'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              className="hover:glow-gold transition-all rounded-2xl"
              aria-label="Kullanıcı menüsü"
              aria-expanded={userMenuOpen}
              aria-haspopup="menu"
            >
              <BrandMark size="md" />
            </button>

            {userMenuOpen && (
              <div
                role="menu"
                className="notif-panel absolute right-0 top-full mt-2 w-56 z-50"
              >
                <div className="p-1.5">
                  <div className="px-3 py-2.5 mb-1 border-b" style={{ borderColor: 'var(--border-main)' }}>
                    <div className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user?.email || 'demo@borsakrali.com'}</div>
                    <div className="text-[10px] font-bold mt-0.5 uppercase tracking-wider flex items-center gap-1"
                      style={{ color: 'var(--gold-400)' }}
                    >
                      <Crown className="w-2.5 h-2.5" />
                      {user?.plan === 'lifetime' ? 'Lifetime' : user?.plan === 'pro_monthly' ? 'Pro Aylık' : user?.isDemo ? 'Demo Erişim' : 'Premium'}
                    </div>
                  </div>
                  {[
                    { icon: Command, label: 'Komut Paleti', kbd: `${isMac ? '⌘' : 'Ctrl'}+K`, action: () => { setUserMenuOpen(false); openCmdK() } },
                    { icon: Settings, label: 'Ayarlar', to: '/ayarlar' },
                    { icon: KeyRound, label: 'Şifre Değiştir', to: '/sifre-degistir' },
                    { icon: Sparkles, label: 'Abonelik', to: '/abonelik' },
                  ].map(item => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.label}
                        role="menuitem"
                        onClick={() => {
                          if (item.action) { item.action(); return }
                          setUserMenuOpen(false); navigate(item.to)
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left text-[13px]"
                        style={{ color: 'var(--text-secondary)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <Icon className="w-4 h-4" style={{ color: 'var(--gold-400)' }} />
                        <span className="flex-1">{item.label}</span>
                        {item.kbd && <span className="kbd">{item.kbd}</span>}
                      </button>
                    )
                  })}
                  <div className="my-1 divider-gold" />
                  <button
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left text-[13px]"
                    style={{ color: 'var(--ember)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 59, 70, 0.10)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <LogOut className="w-4 h-4" />
                    Çıkış Yap
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
