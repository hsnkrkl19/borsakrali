import { Bell, LogOut, Search, Zap, KeyRound, Settings, Activity, Sparkles, Crown, Target, TrendingUp, TrendingDown, Command, Megaphone } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../services/api'
import { useUsageStore, DAILY_LIMIT } from '../store/usageStore'
import { useAnnouncementsStore, inferCategory, NOTIF_CATEGORIES } from '../store/announcementsStore'
import { formatRelativeTime } from '../lib/strategyMeta'
import BrandMark from './BrandMark'

// Parça 1: Header sadeleştirildi — logo (sidebar'da zaten var) + arama + bildirim + profil.
// Data band (BIST100, BIST30, USD/TRY, EUR/TRY, GRAM saat) ve ticker kaldırıldı;
// BIST100 değişimi Dashboard özet satırında zaten var. ThemeToggle Ayarlar'da kalır.

export default function Header() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const { getRemaining, isPremium } = useUsageStore()
  const remaining = getRemaining()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifTab, setNotifTab] = useState('announcements') // 'announcements' | 'signals'
  const [signals, setSignals] = useState([])
  const announcements = useAnnouncementsStore((s) => s.announcements)
  const markAllAnnouncementsRead = useAnnouncementsStore((s) => s.markAllRead)
  const announcementReadIds = useAnnouncementsStore((s) => s.readIds)
  const announcementHiddenIds = useAnnouncementsStore((s) => s.hiddenIds)
  const announcementPrefs = useAnnouncementsStore((s) => s.preferences)
  // Tercih + gizleme farkındalıklı görünür liste — sustur edilen kategoriler dropdown'da da gizli
  const visibleAnnouncements = announcements.filter((a) => {
    if (!a.id) return false
    if (announcementHiddenIds?.includes(a.id)) return false
    const cat = inferCategory(a)
    if (announcementPrefs && announcementPrefs[cat] === false) return false
    return true
  })
  const announcementUnread = visibleAnnouncements.filter((a) => !announcementReadIds.includes(a.id)).length
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
        const res = await apiClient.get('/market/signals?limit=6')
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

  return (
    <header
      className="relative z-30 sticky top-0"
      style={{
        background: 'linear-gradient(180deg, var(--bg-card) 0%, color-mix(in srgb, var(--bg-card) 80%, var(--bg-canvas) 20%) 100%)',
        borderBottom: '1px solid var(--border-main)',
        boxShadow: '0 1px 0 rgba(16, 185, 129, 0.08), 0 6px 24px rgba(0, 0, 0, 0.18)',
      }}
    >
      {/* Bottom hairline accent */}
      <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.35), transparent)' }}
      />

      {/* ─── TEK SATIR — MAIN HEADER ───────────────────────────────────── */}
      <div className="flex h-14 lg:h-16 w-full min-w-0 items-center justify-between gap-2 px-4 lg:px-6">
        {/* Sol boşluk — Sidebar zaten logo'yu taşıyor */}
        <div className="hidden lg:block flex-1" />

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
                      ? '0 0 8px rgba(225, 29, 72, 0.7)'
                      : '0 0 8px rgba(16, 185, 129, 0.6)',
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
                      background: notifTab === 'announcements' ? 'rgba(16, 185, 129, 0.06)' : 'transparent',
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
                      background: notifTab === 'signals' ? 'rgba(16, 185, 129, 0.06)' : 'transparent',
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
                    visibleAnnouncements.length === 0 ? (
                      <div className="px-4 py-10 text-center" style={{ color: 'var(--text-faint)' }}>
                        <Megaphone className="w-6 h-6 mx-auto mb-2 opacity-50" />
                        <div className="text-sm">
                          {announcements.length > 0 ? 'Bu kategoriler sustur edildi' : 'Henüz duyuru yok'}
                        </div>
                        <div className="text-xs mt-1">
                          {announcements.length > 0
                            ? <button onClick={() => { setNotifOpen(false); navigate('/bildirimler') }} className="underline" style={{ color: 'var(--gold-400)' }}>Tercihlerden geri aç →</button>
                            : 'Yeni duyuru gelince burada görünecek'}
                        </div>
                      </div>
                    ) : (
                      visibleAnnouncements.map((a) => {
                        const isUnread = a.id && !announcementReadIds.includes(a.id)
                        const cat = inferCategory(a)
                        const meta = NOTIF_CATEGORIES[cat] || NOTIF_CATEGORIES.general
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
                            style={isUnread ? { background: 'rgba(16, 185, 129, 0.06)' } : undefined}
                          >
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-base"
                              style={{
                                background: `${meta.color}1f`,
                                color: meta.color,
                                border: `1px solid ${meta.color}40`,
                              }}
                            >
                              {meta.icon}
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
                                background: isBuy ? 'rgba(16, 185, 129, 0.12)' : isSell ? 'rgba(225, 29, 72, 0.12)' : 'rgba(16, 185, 129, 0.12)',
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
                  onClick={() => { setNotifOpen(false); navigate(notifTab === 'announcements' ? '/bildirimler' : '/gunluk-tespitler') }}
                  className="px-3.5 py-2.5 border-t text-[12px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-80 transition-opacity"
                  style={{
                    borderColor: 'var(--border-main)',
                    background: 'rgba(16, 185, 129, 0.06)',
                    color: 'var(--gold-400)',
                  }}
                >
                  {notifTab === 'announcements' ? 'Bildirim merkezini aç →' : 'Tüm sinyalleri görüntüle →'}
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
                    { icon: Bell, label: 'Bildirimler', to: '/bildirimler' },
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
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(225, 29, 72, 0.10)'}
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
