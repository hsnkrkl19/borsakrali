import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Target,
  Briefcase,
  TrendingUp,
  Brain,
  Activity,
  Star,
  FileText,
  Newspaper,
  Search,
  BarChart3,
  BookOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Flame,
  BellRing,
  Table,
  Gem,
  CandlestickChart,
  CreditCard,
  StickyNote,
  Calendar,
  Trash2,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import BrandMark from './BrandMark'

export default function Sidebar({ isOpen, onToggle }) {
  const user = useAuthStore((state) => state.user)

  const navItems = [
    { path: '/', label: 'Piyasa Kokpiti', icon: LayoutDashboard },
    { path: '/pro-analiz', label: 'Pro Analiz', icon: Gem, highlight: true, badge: 'PRO' },
    { path: '/canli-heatmap', label: 'Canli Heatmap', icon: Flame, highlight: true },
    { path: '/malaysian-snr', label: 'Malaysian SNR', icon: CandlestickChart, highlight: true, badge: 'YENI' },
    { path: '/ema34-tarayici', label: 'EMA34 Takip', icon: TrendingUp, highlight: true, badge: 'YENI' },
    { path: '/gunluk-tespitler', label: 'Gunluk Tespitler', icon: Target },
    { path: '/takip-listem', label: 'Takip Listem', icon: Briefcase },
    { path: '/algoritma-performans', label: 'Algoritma Performans', icon: TrendingUp },
    { path: '/temel-analiz-ai', label: 'Temel Analiz AI', icon: Brain },
    { path: '/mali-tablolar', label: 'Mali Tablolar', icon: Table },
    { path: '/teknik-analiz-ai', label: 'Teknik Analiz AI', icon: Activity },
    { path: '/hisse-ai-skor', label: 'Hisse AI Skor', icon: Star },
    { path: '/kap-analitik', label: 'KAP Analitik', icon: FileText },
    { path: '/teknik-notlar', label: 'Teknik Notlar', icon: Newspaper },
    { path: '/ekonomik-takvim', label: 'Ekonomik Takvim', icon: Calendar },
    { path: '/finansal-notlar', label: 'Finansal Notlar', icon: StickyNote },
    { path: '/taramalar', label: 'Taramalar', icon: Search },
    { path: '/tarama-analiz-merkezi', label: 'Tarama Analiz Merkezi', icon: BarChart3 },
    { path: '/inceleme-kutuphanesi', label: 'Inceleme Kutuphanesi', icon: BookOpen },
    { path: '/abonelik', label: 'Abonelik', icon: CreditCard },
    { path: '/account-deletion', label: 'Hesap Silme', icon: Trash2 },
    { path: '/ayarlar', label: 'Ayarlar & Takip', icon: Settings },
    ...(user?.role === 'admin'
      ? [{ path: '/admin-bildirimler', label: 'Admin Bildirim', icon: BellRing, highlight: true, badge: 'ADMIN' }]
      : []),
  ]

  return (
    <aside className={`h-full flex flex-col overflow-hidden bg-gradient-to-b from-dark-900 to-dark-950 border-r border-gold-500/10 transition-all duration-300 z-40 ${isOpen ? 'w-64' : 'w-20'}`}>
      <div className="h-16 flex items-center justify-between px-4 border-b border-gold-500/20">
        {isOpen && (
          <div className="flex items-center space-x-2">
            <BrandMark size="md" className="shadow-glow-gold" />
            <div className="flex flex-col">
              <span className="font-bold text-lg bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">BORSA KRALI</span>
              <span className="text-[10px] text-gray-500 -mt-1">Premium Platform</span>
            </div>
          </div>
        )}

        {!isOpen && <BrandMark size="md" className="shadow-glow-gold mx-auto" />}

        <button
          onClick={onToggle}
          className="p-2 hover:bg-dark-800 rounded-lg transition-colors text-gold-400"
        >
          {isOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto custom-scrollbar min-h-0">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-3 rounded-xl transition-all group relative ${isActive
                    ? 'bg-gradient-to-r from-gold-500 to-gold-600 text-dark-950 shadow-lg shadow-gold-500/30'
                    : item.highlight
                      ? 'text-gold-400 hover:bg-gold-500/10 border border-gold-500/30'
                      : 'text-gray-400 hover:bg-dark-800 hover:text-white'
                  }`
                }
              >
                <item.icon className={`w-5 h-5 flex-shrink-0 ${item.highlight ? 'text-gold-400' : ''}`} />
                {isOpen && <span className="text-sm font-medium">{item.label}</span>}
                {item.highlight && isOpen && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-gold-500/20 text-gold-400 text-[10px] rounded-full font-semibold">
                    {item.badge || 'CANLI'}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex-shrink-0 px-2 py-3 border-t border-gold-500/10">
        <div className={`bg-surface-100 rounded-xl p-3 border border-gold-500/20 ${isOpen ? '' : 'flex items-center justify-center'}`}>
          {isOpen ? (
            <div className="flex items-center space-x-3">
              <BrandMark size="md" className="rounded-full shadow-glow-gold" imageClassName="rounded-full" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">Borsa Krali</div>
                <div className="text-xs text-gold-400">Premium Platform</div>
              </div>
            </div>
          ) : (
            <BrandMark size="md" className="rounded-full shadow-glow-gold" imageClassName="rounded-full" />
          )}
        </div>
      </div>
    </aside>
  )
}
