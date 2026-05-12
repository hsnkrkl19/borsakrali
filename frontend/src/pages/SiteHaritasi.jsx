import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Map as MapIcon, ArrowRight, LayoutDashboard, Crosshair, Coins, Gem,
  Activity, Building2, Calculator, Search, Target, TrendingUp,
  Briefcase, BookOpen, Calendar, CreditCard, Settings, KeyRound,
  MessageCircle, Bell, Layers, BarChart3, FileText, Sparkles,
  Brain, Lock, Star, History, Shield, GraduationCap, Info, Mail,
  ChevronUp, X,
} from 'lucide-react'
import GuestCTA from '../components/GuestCTA'

const SECTIONS = [
  {
    id: 'hizli',
    title: 'Hızlı Erişim',
    description: 'Anasayfa ve canlı piyasa görüntüleyicileri',
    color: 'amber',
    items: [
      {
        path: '/',
        label: 'Piyasa Kokpiti',
        icon: LayoutDashboard,
        description: 'BIST 100 / 30, kazandıranlar, kaybettirenler, günlük sinyaller, sektör performansı.',
        usage: 'Sabah piyasa açılışını takip etmek için başlangıç noktası.',
        keywords: ['anasayfa', 'dashboard', 'bist', 'kokpit', 'home'],
      },
      {
        path: '/sinyaller',
        label: 'Sinyaller',
        icon: Crosshair,
        description: 'BIST + Kripto sinyallerinin tek noktadan özeti. Backtest tabanlı geçmiş başarı oranı ile etiketli.',
        usage: 'Günlük komuta merkezi — en güçlü 3 sinyal ve strateji bazında top 5.',
        badge: 'YENİ',
        keywords: ['sinyaller', 'komuta', 'bist', 'kripto', 'al sat', 'heatmap', 'winrate'],
      },
      {
        path: '/kripto',
        label: 'Kripto Piyasası',
        icon: Coins,
        description: 'Top kripto fiyatları, watchlist, fiyat alarmı.',
        usage: 'BTC, ETH ve diğer major coinleri takip etmek için.',
        auth: true,
        keywords: ['btc', 'ethereum', 'kripto', 'coin', 'altcoin'],
      },
      {
        path: '/pro-analiz',
        label: 'Pro Analiz',
        icon: Gem,
        description: 'Hisse + kripto için gelişmiş çok-modelli analiz konsolu.',
        usage: 'Tek ekranda derin analiz için (PRO özellik).',
        auth: true,
        badge: 'PRO',
        keywords: ['pro', 'derin analiz', 'multi'],
      },
    ],
  },
  {
    id: 'analiz',
    title: 'Analiz Araçları',
    description: 'Hisse, kripto ve şirket bazlı analiz modülleri',
    color: 'blue',
    items: [
      {
        path: '/teknik-analiz-ai',
        label: 'Teknik Analiz AI',
        icon: Activity,
        description: 'Sembol ara, RSI / MACD / Bollinger / EMA / ADX ve AI yorumu al.',
        usage: 'Bir hisseye girmeden önce teknik durumu hızlıca doğrulamak için.',
        auth: true,
        keywords: ['rsi', 'macd', 'bollinger', 'ema', 'adx', 'teknik', 'gösterge'],
      },
      {
        path: '/sirket-analizi',
        label: 'Şirket Analizi',
        icon: Building2,
        description: 'Temel analiz AI + mali tablolar + KAP duyuruları + AI skor — tek sayfada.',
        usage: 'Bir şirketin temellerini değerlendirmek istediğinizde.',
        auth: true,
        tabs: [
          { label: 'Temel AI', query: 'tab=temel-ai' },
          { label: 'Mali Tablolar', query: 'tab=mali' },
          { label: 'KAP', query: 'tab=kap' },
          { label: 'AI Skor', query: 'tab=ai-skor' },
        ],
        keywords: ['temel', 'bilanço', 'kap', 'mali', 'şirket', 'fundamental', 'ai skor'],
      },
      {
        path: '/dcf-degerleme',
        label: 'DCF Değerleme',
        icon: Calculator,
        description: '5 yıllık FCF projeksiyonu, sektör WACC, Gordon terminal, 3x3 hassasiyet matrisi.',
        usage: 'Bir BIST hissesinin içsel (adil) değerini hesaplamak için.',
        auth: true,
        badge: 'YENİ',
        keywords: ['dcf', 'wacc', 'fcf', 'değerleme', 'valuation', 'gordon'],
      },
      {
        path: '/kripto-degerleme',
        label: 'Kripto Değerleme',
        icon: Layers,
        description: '5 model composite valuation: drawdown, MA reversion, S2F, NVT, volatility band.',
        usage: 'Bir kriptonun ucuz mu pahalı mı olduğunu test etmek için.',
        auth: true,
        badge: 'YENİ',
        keywords: ['kripto', 's2f', 'nvt', 'crypto valuation', 'composite'],
      },
      {
        path: '/tarayicilar',
        label: 'Tarayıcılar',
        icon: Search,
        description: 'EMA34 Wave, TEMA34, Malaysian SNR, X Gündem, Haber Akışı ve genel tarama merkezi tek çatıda.',
        usage: 'Belirli bir setup ya da formasyon arayan hisselere ulaşmak için.',
        auth: true,
        tabs: [
          { label: 'Genel', query: 'tab=genel' },
          { label: 'EMA34 Wave', query: 'tab=ema34' },
          { label: 'TEMA34', query: 'tab=tema34' },
          { label: 'SNR', query: 'tab=snr' },
          { label: 'Tarama Merkezi', query: 'tab=merkez' },
          { label: 'X Gündem', query: 'tab=x-gundem' },
          { label: 'Haberler', query: 'tab=haberler' },
        ],
        keywords: ['tarama', 'scanner', 'ema34', 'tema34', 'wave', 'snr', 'x', 'twitter', 'haber'],
      },
      {
        path: '/gunluk-tespitler',
        label: 'Günlük Sinyaller',
        icon: Target,
        description: 'Algoritmanın canlı ürettiği al/sat sinyalleri, sesli bildirim, tarihsel kayıt.',
        usage: 'Gün içi dinamik fırsatları yakalamak için.',
        auth: true,
        tabs: [
          { label: 'Bugün', query: 'tab=bugun' },
          { label: 'MTF', query: 'tab=mtf' },
          { label: 'Kripto', query: 'tab=kripto' },
        ],
        keywords: ['sinyal', 'mtf', 'kripto sinyal', 'al sat'],
      },
      {
        path: '/gun-sonu-performans',
        label: 'Gün Sonu Performans',
        icon: BarChart3,
        description: 'Günün AL sinyallerinin gün sonu (kapanış) getirilerinin tablosu.',
        usage: 'Algoritmanın gün boyunca verdiği sinyallerin sonucunu görmek için.',
        auth: true,
        badge: 'YENİ',
        keywords: ['gün sonu', 'kapanış', 'sinyal performansı', 'eod'],
      },
      {
        path: '/performans',
        label: 'Performans & Kütüphane',
        icon: TrendingUp,
        description: 'Algoritma backtest performansı + strateji inceleme kütüphanesi.',
        usage: 'Hangi setup\'ın tarihte ne getirdiğini görmek için.',
        auth: true,
        tabs: [
          { label: 'Algoritma', query: 'tab=algoritma' },
          { label: 'Kütüphane', query: 'tab=kutuphane' },
        ],
        keywords: ['backtest', 'performans', 'kütüphane', 'strateji'],
      },
    ],
  },
  {
    id: 'kisisel',
    title: 'Kişisel Alan',
    description: 'Sizin watchlist, not, takvim ve bildirim sayfalarınız',
    color: 'emerald',
    items: [
      {
        path: '/takip-listem',
        label: 'Takip Listem',
        icon: Briefcase,
        description: 'İzlediğiniz hisseler — fiyat, değişim, kişisel notlarla.',
        usage: 'Portföyünüze veya radarınızdaki hisselere odaklanmak için.',
        auth: true,
        keywords: ['watchlist', 'takip', 'portföy'],
      },
      {
        path: '/notlarim',
        label: 'Notlarım',
        icon: BookOpen,
        description: 'Teknik analiz notları + finansal/strateji notları.',
        usage: 'Hisse bazlı kendi gözlemlerinizi kaydetmek için.',
        auth: true,
        tabs: [
          { label: 'Teknik', query: 'tab=teknik' },
          { label: 'Finansal', query: 'tab=finansal' },
        ],
        keywords: ['not', 'notlar', 'günlük', 'notebook'],
      },
      {
        path: '/ekonomik-takvim',
        label: 'Ekonomik Takvim',
        icon: Calendar,
        description: 'TR + ABD önemli veri açıklamaları — TÜFE, faiz, NFP, FOMC vs.',
        usage: 'Kritik bir veri açıklaması öncesi pozisyon ayarlamak için.',
        keywords: ['takvim', 'tüfe', 'fomc', 'nfp', 'faiz', 'pmi'],
      },
      {
        path: '/bildirimler',
        label: 'Bildirimler',
        icon: Bell,
        description: 'Sistem ve algoritma bildirimlerinin tarihsel akışı.',
        usage: 'Kaçırdığınız sinyalleri ve uyarıları geriye dönük görmek için.',
        auth: true,
        keywords: ['bildirim', 'uyarı', 'notification', 'push'],
      },
    ],
  },
  {
    id: 'egitim',
    title: 'Eğitim',
    description: 'Yatırımcının kütüphanesi — borsa rehberleri',
    color: 'rose',
    items: [
      {
        path: '/egitim',
        label: 'Eğitim Merkezi',
        icon: GraduationCap,
        description: 'Tüm rehberlere giriş — temel ve ileri seviye konular.',
        usage: 'Borsa eğitimine sistematik başlamak için.',
        badge: 'YENİ',
        keywords: ['eğitim', 'rehber', 'kütüphane', 'ders'],
      },
      {
        path: '/egitim/teknik-analiz-giris',
        label: 'Teknik Analiz Girişi',
        icon: Activity,
        description: 'Mum çubukları, trend çizgileri, hareketli ortalamalar — temel başlangıç.',
        usage: 'Teknik analize sıfırdan başlamak için.',
        keywords: ['teknik analiz', 'mum', 'trend', 'ema'],
      },
      {
        path: '/egitim/bist100-rehberi',
        label: 'BIST 100 Rehberi',
        icon: TrendingUp,
        description: 'BIST 100 endeksi nasıl çalışır, hangi sektörler ağırlıkta, nasıl yorumlanır.',
        usage: 'Endeksin yapısını anlamak için.',
        keywords: ['bist100', 'endeks', 'rehber', 'sektör'],
      },
      {
        path: '/egitim/temel-gostergeler',
        label: 'Temel Göstergeler',
        icon: BarChart3,
        description: 'RSI, MACD, Bollinger gibi temel teknik göstergelerin nasıl okunduğu.',
        usage: 'Göstergeleri öğrenmek için pratik özet.',
        keywords: ['rsi', 'macd', 'gösterge', 'indikatör', 'bollinger'],
      },
      {
        path: '/egitim/bilanco-okuma',
        label: 'Bilanço Okuma',
        icon: FileText,
        description: 'Bilanço, gelir tablosu ve nakit akış tablosunu pratik okuma rehberi.',
        usage: 'Şirket finansallarını yorumlamak için.',
        keywords: ['bilanço', 'gelir tablosu', 'nakit akış', 'finansal'],
      },
      {
        path: '/egitim/destek-direnc',
        label: 'Destek & Direnç',
        icon: Layers,
        description: 'Destek/direnç seviyelerini bulma, kırılım ve geri çekilme stratejileri.',
        usage: 'Giriş-çıkış seviyelerini belirlemek için.',
        keywords: ['destek', 'direnç', 'kırılım', 'pullback'],
      },
      {
        path: '/egitim/yatirim-stratejisi',
        label: 'Yatırım Stratejisi',
        icon: Target,
        description: 'Uzun vade, swing, momentum gibi farklı stratejilerin temel ilkeleri.',
        usage: 'Kendinize uygun bir yatırım yaklaşımı seçmek için.',
        keywords: ['strateji', 'swing', 'uzun vade', 'momentum'],
      },
    ],
  },
  {
    id: 'hesap',
    title: 'Hesap & Ayarlar',
    description: 'Abonelik, profil ve uygulama ayarları',
    color: 'purple',
    items: [
      {
        path: '/abonelik',
        label: 'Abonelik',
        icon: CreditCard,
        description: 'Plan seçimi (Free / Aylık / Lifetime), kullanım limitleri, yükseltme.',
        usage: 'Plan değiştirmek veya kalan hak görmek için.',
        keywords: ['plan', 'premium', 'abonelik', 'lifetime', 'pro'],
      },
      {
        path: '/ayarlar',
        label: 'Ayarlar',
        icon: Settings,
        description: 'Tema (açık/karanlık), font ölçeği, bildirim tercihleri.',
        usage: 'Görüntü ve bildirim tercihlerini özelleştirmek için.',
        auth: true,
        keywords: ['ayar', 'tema', 'font', 'tercih', 'karanlık'],
      },
      {
        path: '/sifre-degistir',
        label: 'Şifre Değiştir',
        icon: KeyRound,
        description: 'Hesap şifrenizi güncelleyin.',
        usage: 'Güvenliği taze tutmak için.',
        auth: true,
        keywords: ['şifre', 'parola', 'güvenlik'],
      },
      {
        path: '/istek-paneli',
        label: 'İstek Paneli',
        icon: MessageCircle,
        description: 'Yeni özellik isteği gönderin, başkalarının isteklerine oy verin.',
        usage: 'Platforma katkı sunmak ve önceliklere oy vermek için.',
        auth: true,
        keywords: ['istek', 'feedback', 'feature request', 'oy'],
      },
    ],
  },
  {
    id: 'bilgi',
    title: 'Bilgi & Yasal',
    description: 'Kurumsal ve yasal sayfalar',
    color: 'slate',
    items: [
      {
        path: '/hakkimizda',
        label: 'Hakkımızda',
        icon: Info,
        description: 'Borsa Krali ekibi, vizyon ve platform hikayesi.',
        usage: 'Platform arkasında kim olduğunu öğrenmek için.',
        keywords: ['hakkımızda', 'ekip', 'about'],
      },
      {
        path: '/iletisim',
        label: 'İletişim',
        icon: Mail,
        description: 'Geri bildirim, destek ve iletişim kanalları.',
        usage: 'Bizimle iletişime geçmek için.',
        keywords: ['iletişim', 'destek', 'mail', 'contact'],
      },
      {
        path: '/gizlilik-politikasi',
        label: 'Gizlilik Politikası',
        icon: Shield,
        description: 'Veri toplama, işleme ve gizlilik prensipleri.',
        usage: 'Hangi verilerin neden tutulduğunu öğrenmek için.',
        keywords: ['gizlilik', 'kvkk', 'privacy'],
      },
      {
        path: '/kullanim-kosullari',
        label: 'Kullanım Koşulları',
        icon: FileText,
        description: 'Hizmet şartları ve kullanım kuralları.',
        usage: 'Platformu kullanırken bağlayıcı kurallar.',
        keywords: ['kullanım', 'şart', 'koşul', 'terms'],
      },
      {
        path: '/hesap-silme',
        label: 'Hesap Silme',
        icon: X,
        description: 'Hesabınızı ve verilerinizi kalıcı olarak silme prosedürü.',
        usage: 'Hesabı tamamen kapatmak istediğinizde.',
        auth: true,
        keywords: ['hesap silme', 'kapat', 'delete'],
      },
    ],
  },
]

const COLOR_MAP = {
  amber:   { gradient: 'from-amber-500/15 to-amber-700/5',     border: 'border-amber-500/40',    text: 'text-amber-400',   icon: 'text-amber-400',   pill: 'bg-amber-500/20 text-amber-200 border-amber-500/30',     pillHover: 'hover:bg-amber-500/30'   },
  blue:    { gradient: 'from-blue-500/15 to-blue-700/5',       border: 'border-blue-500/40',     text: 'text-blue-400',    icon: 'text-blue-400',    pill: 'bg-blue-500/20 text-blue-200 border-blue-500/30',       pillHover: 'hover:bg-blue-500/30'    },
  emerald: { gradient: 'from-emerald-500/15 to-emerald-700/5', border: 'border-emerald-500/40',  text: 'text-emerald-400', icon: 'text-emerald-400', pill: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30', pillHover: 'hover:bg-emerald-500/30' },
  purple:  { gradient: 'from-purple-500/15 to-purple-700/5',   border: 'border-purple-500/40',   text: 'text-purple-400',  icon: 'text-purple-400',  pill: 'bg-purple-500/20 text-purple-200 border-purple-500/30',  pillHover: 'hover:bg-purple-500/30'  },
  rose:    { gradient: 'from-rose-500/15 to-rose-700/5',       border: 'border-rose-500/40',     text: 'text-rose-400',    icon: 'text-rose-400',    pill: 'bg-rose-500/20 text-rose-200 border-rose-500/30',       pillHover: 'hover:bg-rose-500/30'    },
  slate:   { gradient: 'from-slate-500/15 to-slate-700/5',     border: 'border-slate-500/40',    text: 'text-slate-300',   icon: 'text-slate-400',   pill: 'bg-slate-500/20 text-slate-200 border-slate-500/30',   pillHover: 'hover:bg-slate-500/30'   },
}

const FAVORITES_KEY = 'bk-sitemap-favs'
const RECENT_KEY = 'bk-sitemap-recent'
const MAX_RECENT = 6

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* noop */ }
}

const ALL_ITEMS = SECTIONS.flatMap(s => s.items.map(i => ({ ...i, _sectionId: s.id, _color: s.color })))
const ITEM_BY_PATH = Object.fromEntries(ALL_ITEMS.map(i => [i.path, i]))

export default function SiteHaritasi() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [favs, setFavs] = useState(() => loadJSON(FAVORITES_KEY, []))
  const [recent, setRecent] = useState(() => loadJSON(RECENT_KEY, []))
  const [showBackToTop, setShowBackToTop] = useState(false)
  const searchRef = useRef(null)

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA'
      if (e.key === '/' && !isTyping && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        if (query) {
          setQuery('')
        } else {
          searchRef.current?.blur()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [query])

  const toggleFav = useCallback((path) => {
    setFavs(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
      saveJSON(FAVORITES_KEY, next)
      return next
    })
  }, [])

  const go = useCallback((path) => {
    setRecent(prev => {
      const next = [path, ...prev.filter(p => p !== path)].slice(0, MAX_RECENT)
      saveJSON(RECENT_KEY, next)
      return next
    })
    navigate(path)
  }, [navigate])

  const q = query.trim().toLowerCase()

  const filteredSections = useMemo(() => {
    if (!q) return SECTIONS
    const match = (item) => {
      const hay = [
        item.label, item.description, item.usage, item.path,
        ...(item.tabs || []).map(t => t.label),
        ...(item.keywords || []),
      ].join(' ').toLowerCase()
      return hay.includes(q)
    }
    return SECTIONS
      .map(s => ({ ...s, items: s.items.filter(match) }))
      .filter(s => s.items.length > 0)
  }, [q])

  const totalCount = SECTIONS.reduce((acc, s) => acc + s.items.length, 0)
  const filteredCount = filteredSections.reduce((acc, s) => acc + s.items.length, 0)

  const favItems = favs.map(p => ITEM_BY_PATH[p]).filter(Boolean)
  const recentItems = recent.map(p => ITEM_BY_PATH[p]).filter(Boolean)

  const scrollToSection = (id) => {
    const el = document.getElementById(`section-${id}`)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 80
    window.scrollTo({ top, behavior: 'smooth' })
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      <GuestCTA />

      {/* Hero */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-700/5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
            <MapIcon className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Site Haritası</h1>
            <p className="text-sm text-amber-100/80 mt-1">
              Borsa Krali platformundaki tüm sayfalar ve ne işe yaradıkları. Bir karta veya
              alt-sekmeye tıklayarak doğrudan o noktaya gidin.
            </p>
            <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
              <span className="px-2 py-1 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/30 font-semibold">
                {totalCount} sayfa
              </span>
              <span className="px-2 py-1 rounded-md bg-blue-500/20 text-blue-200 border border-blue-500/30 font-semibold">
                {SECTIONS.length} kategori
              </span>
              <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Canlı veri
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Search + Category Jumper */}
      <div className="sticky top-0 z-20 -mx-3 px-3 py-3 bg-dark-950/85 backdrop-blur-md border-b border-dark-800 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sayfa ara… (ör. RSI, bilanço, DCF, watchlist) — / ile odaklan"
            className="w-full pl-9 pr-20 py-2.5 rounded-lg bg-dark-900/70 border border-dark-700 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30 text-sm text-white placeholder:text-gray-600"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); searchRef.current?.focus() }}
              className="absolute right-12 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-white hover:bg-dark-700"
              aria-label="Aramayı temizle"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:block absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] rounded bg-dark-700 border border-dark-600 text-gray-400">/</kbd>
        </div>

        {q ? (
          <div className="text-xs text-gray-400 flex items-center gap-2">
            <span className="font-semibold text-white">{filteredCount}</span> eşleşme bulundu
            {filteredCount === 0 && (
              <span className="text-gray-500">— başka bir anahtar kelime deneyin.</span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => {
              const c = COLOR_MAP[s.color]
              return (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${c.pill} ${c.pillHover}`}
                >
                  {s.title}
                  <span className="ml-1.5 opacity-60">{s.items.length}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Favorites */}
      {!q && favItems.length > 0 && (
        <CompactRow
          icon={Star}
          title="Favoriler"
          color="amber"
          items={favItems}
          onGo={go}
          onUnfav={toggleFav}
        />
      )}

      {/* Recent */}
      {!q && recentItems.length > 0 && (
        <CompactRow
          icon={History}
          title="Son Ziyaret"
          color="blue"
          items={recentItems}
          onGo={go}
        />
      )}

      {/* Sections */}
      {filteredSections.map((section) => {
        const colors = COLOR_MAP[section.color]
        return (
          <section key={section.title} id={`section-${section.id}`} className="space-y-3 scroll-mt-32">
            <div className="flex items-end justify-between gap-2 flex-wrap pb-2 border-b border-dark-700">
              <div>
                <h2 className={`text-lg sm:text-xl font-bold ${colors.text}`}>{section.title}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-gray-600">
                {section.items.length} sayfa
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {section.items.map((item) => (
                <Card
                  key={item.path}
                  item={item}
                  colors={colors}
                  isFav={favs.includes(item.path)}
                  onGo={go}
                  onFav={toggleFav}
                  highlight={q}
                />
              ))}
            </div>
          </section>
        )
      })}

      {/* Footer hint */}
      <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-4 text-xs text-gray-400 flex items-start gap-2">
        <Brain className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold text-white">İpucu: </span>
          Arama kutusunu odaklamak için
          <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-dark-700 border border-dark-600 text-gray-300 mx-1">/</kbd>
          tuşunu; tüm sayfa ve hisseleri açan komut paleti için
          <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-dark-700 border border-dark-600 text-gray-300 mx-1">Ctrl + K</kbd>
          tuşunu kullanın. Bir karttaki yıldıza tıklayarak favorilerinize ekleyebilirsiniz.
        </div>
      </div>

      {/* Back to top */}
      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-30 w-11 h-11 rounded-full bg-amber-500/90 hover:bg-amber-400 text-dark-950 shadow-lg shadow-amber-500/30 flex items-center justify-center transition-all"
          aria-label="Başa dön"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}

function CompactRow({ icon: Icon, title, color, items, onGo, onUnfav }) {
  const c = COLOR_MAP[color]
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${c.text}`} />
        <h3 className={`text-sm font-bold ${c.text}`}>{title}</h3>
        <span className="text-[10px] text-gray-600">{items.length}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const ItemIcon = item.icon
          return (
            <div key={item.path} className={`group inline-flex items-center gap-1.5 rounded-lg border ${c.pill} pl-2 pr-1 py-1`}>
              <button
                onClick={() => onGo(item.path)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
              >
                <ItemIcon className="w-3.5 h-3.5" />
                {item.label}
              </button>
              {onUnfav && (
                <button
                  onClick={() => onUnfav(item.path)}
                  className="opacity-60 hover:opacity-100 p-1 rounded hover:bg-white/10"
                  aria-label="Favorilerden kaldır"
                  title="Favorilerden kaldır"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Highlight({ text, query }) {
  if (!query) return text
  const q = query.trim()
  if (!q) return text
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  const idx = lower.indexOf(ql)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-500/30 text-amber-100 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

function Card({ item, colors, isFav, onGo, onFav, highlight }) {
  const Icon = item.icon
  return (
    <div
      className={`group relative text-left rounded-xl border ${colors.border} bg-gradient-to-br ${colors.gradient} p-4 transition-all hover:scale-[1.015] hover:brightness-110 cursor-pointer`}
      onClick={() => onGo(item.path)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo(item.path) } }}
    >
      {/* Top-right: fav + arrow */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onFav(item.path) }}
          className={`p-1 rounded transition-colors ${isFav ? 'text-amber-400' : 'text-gray-600 hover:text-amber-400'}`}
          aria-label={isFav ? 'Favorilerden kaldır' : 'Favorilere ekle'}
          title={isFav ? 'Favorilerden kaldır' : 'Favorilere ekle'}
        >
          <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400' : ''}`} />
        </button>
        <ArrowRight className={`w-4 h-4 ${colors.text} transition-transform group-hover:translate-x-1`} />
      </div>

      <div className="flex items-start gap-2 mb-2 pr-12">
        <div className={`w-9 h-9 rounded-lg bg-dark-900/50 border border-white/5 flex items-center justify-center flex-shrink-0 ${colors.icon}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-white flex items-center gap-1.5 flex-wrap">
            <span><Highlight text={item.label} query={highlight} /></span>
            {item.badge && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40">
                {item.badge}
              </span>
            )}
            {item.auth && (
              <Lock className="w-3 h-3 text-gray-500" title="Giriş gerektirir" />
            )}
          </div>
          <div className="text-[10px] text-gray-500 font-mono truncate">{item.path}</div>
        </div>
      </div>

      <p className="text-xs text-gray-300 leading-snug mt-2">
        <Highlight text={item.description} query={highlight} />
      </p>

      {item.usage && (
        <p className="text-[11px] text-gray-500 leading-snug mt-2 pt-2 border-t border-white/5">
          <span className={`font-semibold ${colors.text}`}>Ne zaman:</span>{' '}
          <Highlight text={item.usage} query={highlight} />
        </p>
      )}

      {item.tabs && item.tabs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5" onClick={(e) => e.stopPropagation()}>
          {item.tabs.map(t => (
            <button
              key={t.label}
              onClick={(e) => { e.stopPropagation(); onGo(`${item.path}?${t.query}`) }}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${colors.pill} ${colors.pillHover} cursor-pointer`}
              title={`${item.path}?${t.query}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
