import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Target,
  Briefcase,
  TrendingUp,
  Building2,
  Activity,
  Search,
  Coins,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Flame,
  BellRing,
  Gem,
  CreditCard,
  Calendar,
  Sparkles,
  Crown,
  LogOut,
  KeyRound,
  Calculator,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import BrandMark from './BrandMark'

export default function Sidebar({ isOpen, onToggle }) {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef(null)

  useEffect(() => {
    if (!profileMenuOpen) return
    const handler = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [profileMenuOpen])

  const handleLogout = () => {
    setProfileMenuOpen(false)
    logout()
    navigate('/login')
  }

  const goTo = (path) => {
    setProfileMenuOpen(false)
    navigate(path)
  }

  // === SADELEŞTİRİLMİŞ NAVİGASYON ===
  // 23 sekme → 11 sekme. Tek işlevli sayfalar tek çatı altında birleşti.
  const navItems = [
    // Ana
    { path: '/',                  label: 'Piyasa Kokpiti',   icon: LayoutDashboard, group: 'core' },
    { path: '/yenilikler',        label: 'Yenilikler',       icon: Sparkles,        group: 'core', highlight: true, badge: 'v3.1' },
    { path: '/canli-heatmap',     label: 'Canlı Heatmap',    icon: Flame,           group: 'core', highlight: true },
    { path: '/kripto',            label: 'Kripto',           icon: Coins,           group: 'core', highlight: true, badge: 'YENİ' },
    { path: '/pro-analiz',        label: 'Pro Analiz',       icon: Gem,             group: 'core', highlight: true, badge: 'PRO' },

    // Analiz
    { path: '/teknik-analiz-ai',  label: 'Teknik Analiz',    icon: Activity,        group: 'analiz' },
    { path: '/sirket-analizi',    label: 'Şirket Analizi',   icon: Building2,       group: 'analiz' },
    { path: '/dcf-degerleme',     label: 'DCF Değerleme',    icon: Calculator,      group: 'analiz', highlight: true, badge: 'YENİ' },
    { path: '/kripto-degerleme',  label: 'Kripto Değerleme', icon: Coins,           group: 'analiz', highlight: true, badge: 'YENİ' },
    { path: '/tarayicilar',       label: 'Tarayıcılar',      icon: Search,          group: 'analiz' },
    { path: '/gunluk-tespitler',  label: 'Günlük Sinyaller', icon: Target,          group: 'analiz' },
    { path: '/performans',        label: 'Performans',       icon: TrendingUp,      group: 'analiz' },

    // Kişisel
    { path: '/takip-listem',      label: 'Takip Listem',     icon: Briefcase,       group: 'kisisel' },
    { path: '/notlarim',          label: 'Notlarım',         icon: BookOpen,        group: 'kisisel' },
    { path: '/ekonomik-takvim',   label: 'Ekonomik Takvim',  icon: Calendar,        group: 'kisisel' },

    // Hesap
    { path: '/abonelik',          label: 'Abonelik',         icon: CreditCard,      group: 'hesap' },
    { path: '/ayarlar',           label: 'Ayarlar',          icon: Settings,        group: 'hesap' },
    ...(user?.role === 'admin'
      ? [{ path: '/admin-bildirimler', label: 'Admin Bildirim', icon: BellRing, highlight: true, badge: 'ADMIN', group: 'hesap' }]
      : []),
  ]

  const groupLabels = {
    core:    'Hızlı Erişim',
    analiz:  'Analiz Araçları',
    kisisel: 'Kişisel',
    hesap:   'Hesap',
  }

  // Grouped order
  const groupedItems = ['core', 'analiz', 'kisisel', 'hesap'].map(g => ({
    group: g,
    label: groupLabels[g],
    items: navItems.filter(i => i.group === g),
  }))

  return (
    <aside
      className={`h-full flex flex-col overflow-hidden transition-all duration-300 z-40 relative
        ${isOpen ? 'w-64' : 'w-20'}
      `}
      style={{
        background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-base) 100%)',
        borderRight: '1px solid var(--border-main)',
      }}
    >
      {/* Subtle gold accent line on right edge */}
      <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-amber-500/25 to-transparent pointer-events-none" />

      {/* Header */}
      <div
        className="h-16 flex items-center justify-between px-4 relative flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-main)' }}
      >
        {isOpen && (
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="relative flex-shrink-0">
              <BrandMark size="md" className="glow-gold rounded-xl" />
              <Crown className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 drop-shadow-lg" style={{ color: 'var(--gold-400)' }} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-[15px] text-gold-shimmer truncate leading-tight tracking-wide">BORSA KRALI</span>
              <span className="text-[9px] uppercase tracking-[0.12em] font-medium -mt-0.5" style={{ color: 'var(--gold-400)' }}>Premium Edition</span>
            </div>
          </div>
        )}

        {!isOpen && <BrandMark size="md" className="glow-gold mx-auto rounded-xl" />}

        <button
          onClick={onToggle}
          className="flex-shrink-0 p-1.5 rounded-lg transition-all border border-transparent"
          aria-label={isOpen ? 'Menüyü daralt' : 'Menüyü genişlet'}
          style={{ color: 'var(--gold-400)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(212, 175, 55, 0.12)'
            e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.30)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-3 overflow-y-auto custom-scrollbar min-h-0">
        <ul className="space-y-3 px-2">
          {groupedItems.map((g, gIdx) => (
            <li key={g.group} className="space-y-0.5">
              {isOpen && (
                <div className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold"
                  style={{ color: 'var(--text-faint)' }}
                >
                  {g.label}
                </div>
              )}
              {!isOpen && gIdx > 0 && <div className="mx-3 my-1" style={{ borderTop: '1px solid var(--border-main)' }} />}
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        end={item.path === '/'}
                        className={({ isActive }) =>
                          `sb-link group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                          ${isActive
                            ? 'sb-link-active font-semibold'
                            : item.highlight
                              ? 'sb-link-highlight'
                              : 'sb-link-default'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {/* Left accent bar when active */}
                            {isActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-white/60 rounded-r-full" />
                            )}

                            <Icon className="w-[18px] h-[18px] flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />

                            {isOpen && (
                              <span className={`text-[13px] truncate flex-1 ${isActive ? 'font-semibold' : 'font-medium'}`}>
                                {item.label}
                              </span>
                            )}

                            {isOpen && item.badge && (
                              <span
                                className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md tracking-wider
                                  ${isActive
                                    ? 'bg-slate-950/20 text-slate-950'
                                    : item.badge === 'ADMIN'
                                      ? 'bg-red-500/20 text-red-400'
                                      : 'bg-amber-500/20 text-amber-400 badge-new'
                                  }`}
                              >
                                {item.badge}
                              </span>
                            )}

                            {isOpen && item.highlight && !item.badge && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold rounded-md tracking-wider bg-emerald-500/20 text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                LIVE
                              </span>
                            )}

                            {/* Collapsed-mode tooltip on hover */}
                            {!isOpen && (
                              <span className="sb-tooltip invisible group-hover:visible absolute left-full ml-3 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap z-50 pointer-events-none">
                                {item.label}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer card */}
      <div
        ref={profileMenuRef}
        className="flex-shrink-0 p-2 relative"
        style={{ borderTop: '1px solid var(--border-main)' }}
      >
        <button
          type="button"
          onClick={() => setProfileMenuOpen((v) => !v)}
          aria-expanded={profileMenuOpen}
          aria-haspopup="menu"
          aria-label="Profil menüsü"
          className={`relative overflow-hidden rounded-xl p-3 w-full text-left transition-all hover:brightness-105 ${isOpen ? '' : 'flex items-center justify-center'}`}
          style={{
            background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.10), rgba(212, 175, 55, 0.02))',
            border: '1px solid var(--border-gold)',
          }}
        >
          {/* Subtle shimmer overlay */}
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.06), transparent)' }}
          />

          {isOpen ? (
            <div className="relative flex items-center space-x-2.5">
              <div className="relative">
                <BrandMark size="md" className="rounded-full glow-gold" imageClassName="rounded-full" />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full"
                  style={{ background: 'var(--jade)', border: '2px solid var(--bg-card)' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                  {user?.firstName || 'Borsa Kralı'}
                  <Sparkles className="w-3 h-3" style={{ color: 'var(--gold-400)' }} />
                </div>
                <div className="text-[10px] font-medium tracking-wide truncate" style={{ color: 'var(--gold-400)' }}>
                  {user?.plan === 'lifetime' ? 'Lifetime Üyelik' :
                   user?.plan === 'pro_monthly' ? 'Pro Aylık' :
                   user?.plan === 'starter_monthly' ? 'Starter' :
                   user?.isDemo ? 'Demo Erişim' : 'Premium Platform'}
                </div>
              </div>
              <ChevronRight
                className={`w-4 h-4 flex-shrink-0 transition-transform ${profileMenuOpen ? 'rotate-90' : ''}`}
                style={{ color: 'var(--gold-400)' }}
              />
            </div>
          ) : (
            <BrandMark size="md" className="rounded-full glow-gold" imageClassName="rounded-full" />
          )}
        </button>

        {profileMenuOpen && (
          <div
            role="menu"
            className="notif-panel absolute bottom-full left-2 right-2 mb-2 z-50"
          >
            <div className="p-1.5">
              {user?.email && (
                <div className="px-3 py-2 mb-1" style={{ borderBottom: '1px solid var(--border-main)' }}>
                  <div className="text-[11.5px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{user.email}</div>
                </div>
              )}
              {[
                { icon: Settings, label: 'Ayarlar', to: '/ayarlar' },
                { icon: KeyRound, label: 'Şifre Değiştir', to: '/sifre-degistir' },
                { icon: Sparkles, label: 'Abonelik', to: '/abonelik' },
              ].map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.to}
                    role="menuitem"
                    onClick={() => goTo(item.to)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left text-[13px]"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <Icon className="w-4 h-4" style={{ color: 'var(--gold-400)' }} />
                    {item.label}
                  </button>
                )
              })}
              <div className="my-1 h-px" style={{ background: 'var(--border-main)' }} />
              <button
                role="menuitem"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left text-[13px] font-medium"
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
    </aside>
  )
}
