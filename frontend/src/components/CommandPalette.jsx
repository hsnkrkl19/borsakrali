import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, LayoutDashboard, Flame, Coins, Gem, Activity, Building2,
  Calculator, Target, TrendingUp, Briefcase, BookOpen, Calendar,
  CreditCard, Settings, Sparkles, KeyRound, LogOut, ArrowRight,
  Bell, MessageCircle, Sun, Moon, Bookmark,
} from 'lucide-react'
import apiClient from '../services/api'
import { useAuthStore } from '../store/authStore'
import { applyTheme, getStoredTheme } from '../utils/theme'

const PAGE_ITEMS = [
  { kind: 'page', label: 'Piyasa Kokpiti',     to: '/',                  icon: LayoutDashboard, hint: 'Ana sayfa' },
  { kind: 'page', label: 'Canlı Heatmap',      to: '/canli-heatmap',     icon: Flame },
  { kind: 'page', label: 'Kripto Piyasa',      to: '/kripto',            icon: Coins, hint: 'Top 100 + alarm' },
  { kind: 'page', label: 'Pro Analiz',         to: '/pro-analiz',        icon: Gem },
  { kind: 'page', label: 'Teknik Analiz AI',   to: '/teknik-analiz-ai',  icon: Activity, hint: 'RSI · MACD · EMA' },
  { kind: 'page', label: 'Şirket Analizi',     to: '/sirket-analizi',    icon: Building2, hint: 'Mali tablolar · KAP' },
  { kind: 'page', label: 'DCF Değerleme',      to: '/dcf-degerleme',     icon: Calculator },
  { kind: 'page', label: 'Kripto Değerleme',   to: '/kripto-degerleme',  icon: Coins },
  { kind: 'page', label: 'Tarayıcılar',        to: '/tarayicilar',       icon: Search, hint: 'EMA34 · SNR' },
  { kind: 'page', label: 'Günlük Sinyaller',   to: '/gunluk-tespitler',  icon: Target },
  { kind: 'page', label: 'Performans',         to: '/performans',        icon: TrendingUp },
  { kind: 'page', label: 'Takip Listem',       to: '/takip-listem',      icon: Briefcase },
  { kind: 'page', label: 'Notlarım',           to: '/notlarim',          icon: BookOpen },
  { kind: 'page', label: 'Ekonomik Takvim',    to: '/ekonomik-takvim',   icon: Calendar },
  { kind: 'page', label: 'Abonelik',           to: '/abonelik',          icon: CreditCard },
  { kind: 'page', label: 'Ayarlar',            to: '/ayarlar',           icon: Settings },
  { kind: 'page', label: 'Şifre Değiştir',     to: '/sifre-degistir',    icon: KeyRound },
  { kind: 'page', label: 'İstek Paneli',       to: '/istek-paneli',      icon: MessageCircle },
  { kind: 'page', label: 'Yenilikler',         to: '/yenilikler',        icon: Sparkles, hint: 'v3.1 değişiklikler' },
]

const POPULAR_STOCKS = [
  'THYAO', 'GARAN', 'AKBNK', 'ASELS', 'TUPRS', 'SISE', 'BIMAS',
  'EREGL', 'KRDMD', 'PETKM', 'KCHOL', 'YKBNK', 'ISCTR', 'TCELL',
  'FROTO', 'TOASO', 'ARCLK', 'TAVHL', 'PGSUS', 'EKGYO',
]
const POPULAR_CRYPTO = [
  { symbol: 'BTC',  name: 'Bitcoin' },
  { symbol: 'ETH',  name: 'Ethereum' },
  { symbol: 'SOL',  name: 'Solana' },
  { symbol: 'BNB',  name: 'BNB' },
  { symbol: 'XRP',  name: 'XRP' },
  { symbol: 'ADA',  name: 'Cardano' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'AVAX', name: 'Avalanche' },
]

const RECENT_KEY = 'bk-cmdk-recent-v1'

function readRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function pushRecent(item) {
  try {
    const all = readRecent()
    const next = [item, ...all.filter(i => !(i.kind === item.kind && i.to === item.to))].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
}

export default function CommandPalette() {
  const navigate = useNavigate()
  const { logout } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [stockResults, setStockResults] = useState([])
  const [theme, setTheme] = useState(() => (typeof window !== 'undefined' ? getStoredTheme() : 'dark'))
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const searchAbortRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const meta = isMac ? e.metaKey : e.ctrlKey
      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (open && e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    const onOpenEvent = () => setOpen(true)
    window.addEventListener('bk-open-cmdk', onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('bk-open-cmdk', onOpenEvent)
    }
  }, [open])

  useEffect(() => {
    const onTheme = (e) => {
      const next = e?.detail?.theme
      if (next === 'light' || next === 'dark') setTheme(next)
    }
    window.addEventListener('bk-theme-change', onTheme)
    return () => window.removeEventListener('bk-theme-change', onTheme)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setStockResults([])
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => {
    if (!open || query.trim().length < 1) {
      setStockResults([])
      return
    }
    if (searchAbortRef.current) searchAbortRef.current.abort?.()
    const controller = new AbortController()
    searchAbortRef.current = controller
    const t = setTimeout(async () => {
      try {
        const [stockRes, cryptoRes] = await Promise.allSettled([
          apiClient.get(`/market/stocks/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }),
          apiClient.get(`/crypto/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }),
        ])
        const stocks = stockRes.status === 'fulfilled'
          ? (stockRes.value.data.stocks || []).slice(0, 5).map(s => ({
              kind: 'stock', symbol: s.symbol, name: s.name, price: s.price, changePercent: s.changePercent,
              to: `/teknik-analiz-ai?symbol=${s.symbol}`, isCrypto: false,
            }))
          : []
        const crypto = cryptoRes.status === 'fulfilled'
          ? (cryptoRes.value.data.coins || []).slice(0, 4).map(c => ({
              kind: 'crypto', symbol: (c.symbol || '').toUpperCase(), name: c.name,
              to: `/kripto?symbol=${(c.symbol || '').toUpperCase()}`, isCrypto: true,
            }))
          : []
        setStockResults([...stocks, ...crypto])
      } catch { /* ignore */ }
    }, 180)
    return () => { clearTimeout(t); controller.abort?.() }
  }, [query, open])

  const filteredPages = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    if (!q) return PAGE_ITEMS.slice(0, 8)
    return PAGE_ITEMS.filter(p => p.label.toLocaleLowerCase('tr-TR').includes(q)).slice(0, 8)
  }, [query])

  const popularStockShortcuts = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q || q.length < 1) return []
    if (q.length < 1) return []
    if (stockResults.length > 0) return []
    return POPULAR_STOCKS.filter(s => s.startsWith(q)).slice(0, 5).map(s => ({
      kind: 'stock', symbol: s, name: s, to: `/teknik-analiz-ai?symbol=${s}`, isCrypto: false,
    }))
  }, [query, stockResults.length])

  const popularCryptoShortcuts = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q) return []
    if (stockResults.length > 0) return []
    return POPULAR_CRYPTO.filter(c => c.symbol.startsWith(q) || c.name.toUpperCase().includes(q)).slice(0, 4).map(c => ({
      kind: 'crypto', symbol: c.symbol, name: c.name, to: `/kripto?symbol=${c.symbol}`, isCrypto: true,
    }))
  }, [query, stockResults.length])

  const actionItems = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    const items = [
      {
        kind: 'action', label: theme === 'dark' ? 'Aydınlık moda geç' : 'Karanlık moda geç',
        icon: theme === 'dark' ? Sun : Moon, hint: 'Tema',
        run: () => setTheme(applyTheme(theme === 'dark' ? 'light' : 'dark')),
      },
      { kind: 'action', label: 'Piyasa verilerini yenile', icon: ArrowRight, hint: 'Refresh',
        run: () => window.dispatchEvent(new CustomEvent('bk-refresh-market')) },
      { kind: 'action', label: 'Çıkış yap', icon: LogOut, hint: 'Auth',
        run: () => { logout(); navigate('/login') } },
    ]
    if (!q) return items.slice(0, 2)
    return items.filter(i => i.label.toLocaleLowerCase('tr-TR').includes(q))
  }, [query, theme, logout, navigate])

  const recentItems = useMemo(() => (query.trim() ? [] : readRecent()), [query, open])

  const flat = useMemo(() => {
    const list = []
    if (recentItems.length) list.push({ section: 'Son ziyaret edilenler', items: recentItems })
    if (filteredPages.length) list.push({ section: 'Sayfalar', items: filteredPages })
    if (popularStockShortcuts.length) list.push({ section: 'BIST hisseleri', items: popularStockShortcuts })
    if (popularCryptoShortcuts.length) list.push({ section: 'Kripto', items: popularCryptoShortcuts })
    if (stockResults.length) list.push({ section: 'Arama sonuçları', items: stockResults })
    if (actionItems.length) list.push({ section: 'Aksiyonlar', items: actionItems })
    return list
  }, [recentItems, filteredPages, popularStockShortcuts, popularCryptoShortcuts, stockResults, actionItems])

  const flatItems = useMemo(() => flat.flatMap(s => s.items), [flat])

  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-cmdk-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const runItem = (item) => {
    if (!item) return
    setOpen(false)
    if (item.kind === 'action') {
      item.run?.()
      return
    }
    pushRecent({
      kind: item.kind,
      label: item.label || item.symbol,
      symbol: item.symbol,
      to: item.to,
      isCrypto: item.isCrypto,
    })
    if (item.to) navigate(item.to)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(flatItems.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runItem(flatItems[active])
    }
  }

  if (!open) return null

  let runningIdx = -1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Komut paleti"
      className="cmdk-backdrop fixed inset-0 z-[200] flex items-start justify-center pt-[8vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="cmdk-panel w-full max-w-xl rounded-2xl overflow-hidden"
      >
        <div className="relative border-b" style={{ borderColor: 'var(--border-main)' }}>
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--gold-400)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Hisse, kripto veya sayfa ara…"
            className="cmdk-input"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            <span className="cmdk-kbd">esc</span>
          </div>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
          {flat.length === 0 && (
            <div className="px-4 py-10 text-center" style={{ color: 'var(--text-faint)' }}>
              <Search className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <div className="text-sm">Sonuç yok</div>
              <div className="text-xs mt-1">Farklı bir kelime deneyin</div>
            </div>
          )}

          {flat.map((section) => (
            <div key={section.section} className="mb-1.5">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--text-faint)' }}
              >
                {section.section}
              </div>
              {section.items.map((item) => {
                runningIdx += 1
                const idx = runningIdx
                const Icon = item.icon || (item.isCrypto ? Coins : (item.kind === 'stock' ? Activity : Bookmark))
                return (
                  <div
                    key={`${section.section}-${item.label || item.symbol}-${item.to || idx}`}
                    data-cmdk-idx={idx}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => runItem(item)}
                    className={`cmdk-row ${active === idx ? 'is-active' : ''}`}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: item.isCrypto ? 'rgba(245, 158, 11, 0.15)' : 'rgba(212, 175, 55, 0.13)',
                        color: 'var(--gold-400)',
                        border: '1px solid rgba(212, 175, 55, 0.25)',
                      }}
                    >
                      {item.isCrypto ? <span className="text-[10px] font-bold">{(item.symbol || '').slice(0, 2)}</span>
                        : item.kind === 'stock' ? <span className="text-[9px] font-bold">{(item.symbol || '').slice(0, 3)}</span>
                          : <Icon className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {item.kind === 'stock' || item.kind === 'crypto' ? (
                          <span className="flex items-baseline gap-2">
                            <span>{item.symbol}</span>
                            {item.name && item.name !== item.symbol && (
                              <span className="text-[11px] font-normal truncate" style={{ color: 'var(--text-muted)' }}>
                                {item.name}
                              </span>
                            )}
                          </span>
                        ) : (
                          item.label
                        )}
                      </div>
                      {item.hint && (
                        <div className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>
                          {item.hint}
                        </div>
                      )}
                      {item.kind === 'stock' && item.price != null && (
                        <div className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                          {item.price?.toFixed?.(2)} ₺ {item.changePercent != null && (
                            <span style={{ color: item.changePercent >= 0 ? 'var(--jade)' : 'var(--ember)' }}>
                              {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed?.(2)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {active === idx && <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--gold-400)' }} />}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="px-3 py-2 flex items-center justify-between gap-2 border-t text-[11px]"
          style={{ borderColor: 'var(--border-main)', color: 'var(--text-faint)' }}
        >
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="cmdk-kbd">↑</span><span className="cmdk-kbd">↓</span> gezin</span>
            <span className="flex items-center gap-1"><span className="cmdk-kbd">↵</span> aç</span>
          </div>
          <span className="flex items-center gap-1">
            <span className="cmdk-kbd">Ctrl</span><span className="cmdk-kbd">K</span> ile çağır
          </span>
        </div>
      </div>
    </div>
  )
}
