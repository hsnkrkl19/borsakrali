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
    { path: '/canli-heatmap',     label: 'Canlı Heatmap',    icon: Flame,           group: 'core', highlight: true },
    { path: '/kripto',            label: 'Kripto',           icon: Coins,           group: 'core', highlight: true, badge: 'YENİ' },
    { path: '/pro-analiz',        label: 'Pro Analiz',       icon: Gem,             group: 'core', highlight: true, badge: 'PRO' },

    // Analiz
    { path: '/teknik-analiz-ai',  label: 'Teknik Analiz',    icon: Activity,        group: 'analiz' },
    { path: '/sirket-analizi',    label: 'Şirket Analizi',   icon: Building2,       group: 'analiz' },
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
      <div className="h-16 flex items-center justify-between px-4 border-b border-amber-500/15 relative flex-shrink-0">
        {isOpen && (
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="relative flex-shrink-0">
              <BrandMark size="md" className="glow-gold rounded-xl" />
              <Crown className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 text-amber-400 drop-shadow-lg" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-[15px] text-gold-shimmer truncate leading-tight tracking-wide">BORSA KRALI</span>
              <span className="text-[9px] uppercase tracking-[0.12em] text-amber-400/80 font-medium -mt-0.5">Premium Edition</span>
            </div>
          </div>
        )}

        {!isOpen && <BrandMark size="md" className="glow-gold mx-auto rounded-xl" />}

        <button
          onClick={onToggle}
          className="flex-shrink-0 p-1.5 hover:bg-amber-500/10 rounded-lg transition-all text-amber-400 hover:text-amber-300 border border-transparent hover:border-amber-500/25"
          aria-label={isOpen ? 'Menüyü daralt' : 'Menüyü genişlet'}
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
                <div className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold text-amber-400/60">
                  {g.label}
                </div>
              )}
              {!isOpen && gIdx > 0 && <div className="mx-3 my-1 border-t border-amber-500/10" />}
              <ul className="space-y-0.5">
                {g.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        end={item.path === '/'}
                        className={({ isActive }) =>
                          `group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                          ${isActive
                            ? 'bg-gradient-to-r from-amber-500/90 via-amber-500/85 to-amber-600/80 text-slate-950 shadow-[0_4px_14px_rgba(245,158,11,0.35)] font-semibold'
                            : item.highlight
                              ? 'text-amber-400 hover:bg-amber-500/10 hover:text-amber-300'
                              : 'text-gray-400 hover:bg-white/5 hover:text-white'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {/* Left accent bar when active */}
                            {isActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 bg-white/60 rounded-r-full" />
                            )}

                            <Icon
                              className={`w-[18px] h-[18px] flex-shrink-0 transition-transform duration-200
                                ${isActive ? 'text-slate-950' : item.highlight ? 'text-amber-400' : ''}
                                group-hover:scale-110
                              `}
                            />

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
                              <span className="invisible group-hover:visible absolute left-full ml-3 px-3 py-1.5 bg-slate-900 border border-amber-500/30 text-white text-xs font-medium rounded-lg shadow-premium whitespace-nowrap z-50 pointer-events-none">
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
      <div ref={profileMenuRef} className="flex-shrink-0 p-2 border-t border-amber-500/15 relative">
        <button
          type="button"
          onClick={() => setProfileMenuOpen((v) => !v)}
          aria-expanded={profileMenuOpen}
          aria-haspopup="menu"
          aria-label="Profil menüsü"
          className={`relative overflow-hidden rounded-xl p-3 w-full text-left transition-all hover:brightness-110 ${isOpen ? '' : 'flex items-center justify-center'}`}
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.02))',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}
        >
          {/* Subtle shimmer overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent pointer-events-none" />

          {isOpen ? (
            <div className="relative flex items-center space-x-2.5">
              <div className="relative">
                <BrandMark size="md" className="rounded-full glow-gold" imageClassName="rounded-full" />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[var(--bg-card)] rounded-full" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-white truncate flex items-center gap-1">
                  {user?.firstName || 'Borsa Kralı'}
                  <Sparkles className="w-3 h-3 text-amber-400" />
                </div>
                <div className="text-[10px] text-amber-400 font-medium tracking-wide truncate">
                  {user?.plan === 'lifetime' ? 'Lifetime Üyelik' :
                   user?.plan === 'pro_monthly' ? 'Pro Aylık' :
                   user?.plan === 'starter_monthly' ? 'Starter' :
                   user?.isDemo ? 'Demo Erişim' : 'Premium Platform'}
                </div>
              </div>
              <ChevronRight
                className={`w-4 h-4 text-amber-400/70 flex-shrink-0 transition-transform ${profileMenuOpen ? 'rotate-90' : ''}`}
              />
            </div>
          ) : (
            <BrandMark size="md" className="rounded-full glow-gold" imageClassName="rounded-full" />
          )}
        </button>

        {profileMenuOpen && (
          <div
            role="menu"
            className="absolute bottom-full left-2 right-2 mb-2 rounded-xl surface-glass shadow-xl z-50"
          >
            <div className="p-1.5">
              {user?.email && (
                <div className="px-3 py-2 border-b border-amber-500/15 mb-1">
                  <div className="text-[11.5px] font-medium text-slate-300 truncate">{user.email}</div>
                </div>
              )}
              <button
                role="menuitem"
                onClick={() => goTo('/ayarlar')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-amber-500/10 transition-colors text-left text-[13px] text-slate-200"
              >
                <Settings className="w-4 h-4 text-amber-400" />
                Ayarlar
              </button>
              <button
                role="menuitem"
                onClick={() => goTo('/sifre-degistir')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-amber-500/10 transition-colors text-left text-[13px] text-slate-200"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
                Şifre Değiştir
              </button>
              <button
                role="menuitem"
                onClick={() => goTo('/abonelik')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-amber-500/10 transition-colors text-left text-[13px] text-slate-200"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                Abonelik
              </button>
              <div className="my-1 h-px bg-amber-500/15" />
              <button
                role="menuitem"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-left text-[13px] text-red-400 font-medium"
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
