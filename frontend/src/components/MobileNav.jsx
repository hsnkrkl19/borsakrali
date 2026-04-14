import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Flame,
  Activity,
  Star,
  MoreHorizontal,
  X,
  Target,
  Briefcase,
  TrendingUp,
  Brain,
  FileText,
  Search,
  Settings,
  BookOpen,
  Newspaper,
  BarChart3,
  ChevronRight,
  LogOut,
  Gem,
  CandlestickChart,
  CreditCard,
  StickyNote,
  Calendar,
  Table,
  Trash2,
  ShieldCheck,
  BellRing,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import BrandMark from './BrandMark'

const mainNavItems = [
  { path: '/', label: 'Ana Sayfa', icon: LayoutDashboard },
  { path: '/canli-heatmap', label: 'Heatmap', icon: Flame },
  { path: '/teknik-analiz-ai', label: 'Analiz', icon: Activity },
  { path: '/hisse-ai-skor', label: 'AI Skor', icon: Star },
]

const moreNavItems = [
  { path: '/pro-analiz', label: 'Pro Analiz', icon: Gem },
  { path: '/malaysian-snr', label: 'Malaysian SNR', icon: CandlestickChart },
  { path: '/gunluk-tespitler', label: 'Gunluk Tespitler', icon: Target },
  { path: '/takip-listem', label: 'Takip Listem', icon: Briefcase },
  { path: '/algoritma-performans', label: 'Alg. Performans', icon: TrendingUp },
  { path: '/temel-analiz-ai', label: 'Temel Analiz AI', icon: Brain },
  { path: '/mali-tablolar', label: 'Mali Tablolar', icon: Table },
  { path: '/kap-analitik', label: 'KAP Analitik', icon: FileText },
  { path: '/teknik-notlar', label: 'Teknik Notlar', icon: Newspaper },
  { path: '/ekonomik-takvim', label: 'Eko. Takvim', icon: Calendar },
  { path: '/finansal-notlar', label: 'Fin. Notlar', icon: StickyNote },
  { path: '/taramalar', label: 'Taramalar', icon: Search },
  { path: '/tarama-analiz-merkezi', label: 'Tarama Merkezi', icon: BarChart3 },
  { path: '/inceleme-kutuphanesi', label: 'Kutuphane', icon: BookOpen },
  { path: '/abonelik', label: 'Abonelik', icon: CreditCard },
  { path: '/account-deletion', label: 'Hesap Silme', icon: Trash2 },
  { path: '/ayarlar', label: 'Ayarlar', icon: Settings },
]

export default function MobileNav() {
  const [showMore, setShowMore] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const adminNavItems = user?.role === 'admin'
    ? [{ path: '/admin-bildirimler', label: 'Admin Bildirim', icon: BellRing }]
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
                  <h2 className="text-lg font-bold text-white">Menu</h2>
                  <p className="text-xs text-gray-500">Tum ozellikler</p>
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
                    <p className="text-xs text-gold-400">{user.role === 'admin' ? 'Admin Uye' : 'Premium Uye'}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-1">Sayfalar</p>
              <div className="grid grid-cols-3 gap-2">
                {allMoreNavItems.map((item) => {
                  const isActive = location.pathname === item.path
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleNavClick(item.path)}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all ${isActive
                        ? 'bg-gold-500/20 border-2 border-gold-500/50'
                        : 'bg-dark-800 border-2 border-transparent active:bg-dark-700'
                      }`}
                    >
                      <item.icon className={`w-6 h-6 mb-1.5 ${isActive ? 'text-gold-400' : 'text-gray-400'}`} />
                      <span className={`text-[10px] font-medium text-center leading-tight ${isActive ? 'text-gold-400' : 'text-gray-300'}`}>
                        {item.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="px-4 space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-1">Hizli Islemler</p>

              <div className="w-full flex items-center gap-4 p-4 bg-green-500/10 border border-green-500/30 rounded-2xl">
                <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-green-400" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium text-white">Yayin Guvenli Mod</div>
                  <div className="text-xs text-gray-400">Ilk surum icin yorum ve istek alanlari pasiflestirildi</div>
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
                  <div className="font-medium text-red-400">Cikis Yap</div>
                  <div className="text-xs text-gray-400">Hesabinizdan cikis yapin</div>
                </div>
              </button>
            </div>

            <div className="mt-8 px-4 pb-4">
              <div className="text-center p-4 bg-dark-800/50 rounded-2xl">
                <p className="text-xs text-gray-600">Borsa Krali v3.1.0</p>
                <p className="text-[10px] text-gray-700 mt-1">
                  Egitim amacli platform - Yatirim tavsiyesi degildir
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
