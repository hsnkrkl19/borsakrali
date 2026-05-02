import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Flame,
  Activity,
  Search,
  MoreHorizontal,
  X,
  Target,
  Briefcase,
  TrendingUp,
  Building2,
  BookOpen,
  Settings,
  ChevronRight,
  LogOut,
  Gem,
  Coins,
  CreditCard,
  Calendar,
  ShieldCheck,
  BellRing,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import BrandMark from './BrandMark'

// === ALT NAV: 4 EN ÖNEMLİ SEKME + DAHA FAZLA ===
const mainNavItems = [
  { path: '/',                label: 'Ana Sayfa', icon: LayoutDashboard },
  { path: '/canli-heatmap',   label: 'Heatmap',   icon: Flame },
  { path: '/teknik-analiz-ai',label: 'Analiz',    icon: Activity },
  { path: '/tarayicilar',     label: 'Tarayıcı',  icon: Search },
]

// === DAHA FAZLA MENÜSÜ — birleşik sayfalar ===
const moreNavItems = [
  { path: '/kripto',           label: 'Kripto',           icon: Coins,         color: 'from-yellow-500 to-orange-500', badge: 'YENİ' },
  { path: '/pro-analiz',       label: 'Pro Analiz',       icon: Gem,           color: 'from-amber-500 to-amber-600' },
  { path: '/sirket-analizi',   label: 'Şirket Analizi',   icon: Building2,     color: 'from-blue-500 to-blue-600' },
  { path: '/gunluk-tespitler', label: 'Sinyaller',        icon: Target,        color: 'from-red-500 to-red-600' },
  { path: '/performans',       label: 'Performans',       icon: TrendingUp,    color: 'from-emerald-500 to-emerald-600' },
  { path: '/takip-listem',     label: 'Takip Listem',     icon: Briefcase,     color: 'from-purple-500 to-purple-600' },
  { path: '/notlarim',         label: 'Notlarım',         icon: BookOpen,      color: 'from-indigo-500 to-indigo-600' },
  { path: '/ekonomik-takvim',  label: 'Eko. Takvim',      icon: Calendar,      color: 'from-rose-500 to-rose-600' },
  { path: '/abonelik',         label: 'Abonelik',         icon: CreditCard,    color: 'from-amber-500 to-orange-600' },
  { path: '/ayarlar',          label: 'Ayarlar',          icon: Settings,      color: 'from-slate-500 to-slate-600' },
]

export default function MobileNav() {
  const [showMore, setShowMore] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const adminNavItems = user?.role === 'admin'
    ? [{ path: '/admin-bildirimler', label: 'Admin Bildirim', icon: BellRing, color: 'from-red-500 to-red-700' }]
    : []
  const allMoreNavItems = [...moreNavItems, ...adminNavItems]

  const isMoreActive = allMoreNavItems.some((item) => item.path === location.pathname)

  useEffect(() => {
    setShowMore(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = showMore ? 'hidden' : 'auto'
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [showMore])

  const handleNavClick = (path) => {
    setShowMore(false)
    navigate(path)
  }

  const handleLogout = () => {
    logout()
    setShowMore(false)
    navigate('/login')
  }

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 bg-dark-900/98 backdrop-blur-xl border-t border-gold-500/20 z-50"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)' }}
      >
        <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all min-w-[60px] ${isActive
                  ? 'text-gold-400 bg-gold-500/15'
                  : 'text-gray-400 active:bg-dark-700'
                }`
              }
            >
              <item.icon className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          ))}

          <button
            onClick={() => setShowMore(true)}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all min-w-[60px] ${isMoreActive || showMore
              ? 'text-gold-400 bg-gold-500/15'
              : 'text-gray-400 active:bg-dark-700'
            }`}
          >
            <MoreHorizontal className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-medium">Daha</span>
          </button>
        </div>
      </nav>

      {showMore && (
        <div className="fixed inset-0 z-[100] bg-dark-950" style={{ touchAction: 'none' }}>
          <div className="sticky top-0 bg-dark-900 border-b border-gold-500/20 z-10">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <BrandMark size="md" className="shadow-lg" />
                <div>
                  <h2 className="text-lg font-bold text-white">Menü</h2>
                  <p className="text-xs text-gray-500">Tüm özellikler tek yerde</p>
                </div>
              </div>
              <button
                onClick={() => setShowMore(false)}
                className="w-10 h-10 bg-dark-700 rounded-xl flex items-center justify-center text-gray-400 active:bg-dark-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto h-[calc(100vh-80px)] pb-8">
            {user && (
              <div className="mx-4 mt-4 p-4 bg-gradient-to-r from-gold-500/10 to-gold-600/5 border border-gold-500/20 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-gold-400 to-gold-600 rounded-full flex items-center justify-center text-dark-950 font-bold text-lg">
                    {user.firstName?.[0] || 'U'}{user.lastName?.[0] || ''}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{user.firstName} {user.lastName}</p>
                    <p className="text-xs text-gold-400">{user.role === 'admin' ? 'Admin Üye' : 'Premium Üye'}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-1">Tüm Sayfalar</p>
              <div className="grid grid-cols-3 gap-2.5">
                {allMoreNavItems.map((item) => {
                  const isActive = location.pathname === item.path
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleNavClick(item.path)}
                      className={`relative flex flex-col items-center justify-center p-3 rounded-2xl transition-all ${isActive
                        ? 'bg-gold-500/20 border-2 border-gold-500/50'
                        : 'bg-dark-800 border-2 border-transparent active:bg-dark-700'
                      }`}
                    >
                      {item.badge && (
                        <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-gradient-to-r from-amber-400 to-amber-500 text-dark-950 text-[8px] font-bold rounded-md shadow-lg">
                          {item.badge}
                        </span>
                      )}
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-1.5 shadow-md`}>
                        <item.icon className="w-5 h-5 text-white" />
                      </div>
                      <span className={`text-[10px] font-medium text-center leading-tight ${isActive ? 'text-gold-400' : 'text-gray-300'}`}>
                        {item.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="px-4 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-1">Hızlı İşlemler</p>

              <div className="w-full flex items-center gap-4 p-4 bg-green-500/10 border border-green-500/30 rounded-2xl">
                <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-green-400" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium text-white">Yayın Güvenli Mod</div>
                  <div className="text-xs text-gray-400">Yorum ve istek alanları geçici olarak pasif</div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
              </div>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-4 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl active:bg-red-500/20"
              >
                <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-red-400" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium text-red-400">Çıkış Yap</div>
                  <div className="text-xs text-gray-400">Hesabınızdan çıkış yapın</div>
                </div>
              </button>
            </div>

            <div className="mt-8 px-4 pb-4">
              <div className="text-center p-4 bg-dark-800/50 rounded-2xl">
                <p className="text-xs text-gray-600">Borsa Kralı v3.2.0 — Sadeleştirilmiş Arayüz</p>
                <p className="text-[10px] text-gray-700 mt-1">
                  Eğitim amaçlı platform — Yatırım tavsiyesi değildir
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
