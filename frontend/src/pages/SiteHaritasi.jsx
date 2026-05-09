import { useNavigate } from 'react-router-dom'
import {
  Map as MapIcon, ArrowRight, LayoutDashboard, Flame, Coins, Gem,
  Activity, Building2, Calculator, Search, Target, TrendingUp,
  Briefcase, BookOpen, Calendar, CreditCard, Settings, KeyRound,
  MessageCircle, Hash, Newspaper, Layers, BarChart3, FileText,
  Sparkles, Brain, Zap,
} from 'lucide-react'

const SECTIONS = [
  {
    title: 'Hizli Erisim',
    description: 'Anasayfa ve canli piyasa goruntuleyicileri',
    color: 'amber',
    items: [
      {
        path: '/',
        label: 'Piyasa Kokpiti',
        icon: LayoutDashboard,
        description: 'BIST 100 / 30, kazandiranlar, kaybettirenler, gunluk sinyaller, sektor performansi.',
        usage: 'Sabah piyasa acilisini takip etmek icin baslangic noktasi.',
      },
      {
        path: '/canli-heatmap',
        label: 'Canli Heatmap',
        icon: Flame,
        description: 'BIST 30 hisselerinin renk kodlu canli isi haritasi. Yesil = yukseliyor, kirmizi = dusuyor.',
        usage: 'Tek bakista piyasa atmosferini gormek icin.',
      },
      {
        path: '/kripto',
        label: 'Kripto Piyasasi',
        icon: Coins,
        description: 'Top kripto fiyatlari, watchlist, fiyat alarmi.',
        usage: 'BTC, ETH ve diger major coinleri takip etmek icin.',
      },
      {
        path: '/pro-analiz',
        label: 'Pro Analiz',
        icon: Gem,
        description: 'Hisse + kripto icin gelismis cok-modelli analiz konsolu.',
        usage: 'Tek ekranda derin analiz icin (PRO ozellik).',
      },
    ],
  },
  {
    title: 'Analiz Araclari',
    description: 'Hisse, kripto ve sirket bazli analiz modulleri',
    color: 'blue',
    items: [
      {
        path: '/teknik-analiz-ai',
        label: 'Teknik Analiz AI',
        icon: Activity,
        description: 'Sembol ara, RSI / MACD / Bollinger / EMA / ADX ve AI yorumu al.',
        usage: 'Bir hisseye girmeden once teknik durumu hizlica dogrulamak icin.',
      },
      {
        path: '/sirket-analizi',
        label: 'Sirket Analizi',
        icon: Building2,
        description: 'Temel analiz AI + mali tablolar + KAP duyurulari + AI skor — tek sayfada.',
        usage: 'Bir sirketin temellerini degerlendirmek istediginizde.',
        tabs: ['Temel AI', 'Mali Tablolar', 'KAP', 'AI Skor'],
      },
      {
        path: '/dcf-degerleme',
        label: 'DCF Degerleme',
        icon: Calculator,
        description: '5 yillik FCF projeksiyonu, sektor WACC, Gordon terminal, 3x3 hassasiyet matrisi.',
        usage: 'Bir BIST hissesinin icsel (adil) degerini hesaplamak icin.',
        badge: 'YENI',
      },
      {
        path: '/kripto-degerleme',
        label: 'Kripto Degerleme',
        icon: Layers,
        description: '5 model composite valuation: drawdown, MA reversion, S2F, NVT, volatility band.',
        usage: 'Bir kriptonun ucuz mu pahali mi oldugunu test etmek icin.',
        badge: 'YENI',
      },
      {
        path: '/tarayicilar',
        label: 'Tarayicilar',
        icon: Search,
        description: 'EMA34, Malaysian SNR, X Gundem, Haber Akisi ve genel tarama merkezi tek catida.',
        usage: 'Belirli bir setup ya da formasyon arayan hisselere ulasmak icin.',
        tabs: ['Genel', 'EMA34', 'SNR', 'Tarama Merkezi', 'X Gundem', 'Haberler'],
      },
      {
        path: '/gunluk-tespitler',
        label: 'Gunluk Sinyaller',
        icon: Target,
        description: 'Algoritmanin canli urettigi al/sat sinyalleri, sesli bildirim, tarihsel kayit.',
        usage: 'Gun ici dinamik fırsatlari yakalamak icin.',
      },
      {
        path: '/performans',
        label: 'Performans & Kutuphane',
        icon: TrendingUp,
        description: 'Algoritma backtest performansi + strateji inceleme kutuphanesi.',
        usage: 'Hangi setup\'in tarihte ne getirdigini gormek icin.',
        tabs: ['Algoritma', 'Kutuphane'],
      },
    ],
  },
  {
    title: 'Kisisel Alan',
    description: 'Sizin watchlist, not ve takvim sayfalariniz',
    color: 'emerald',
    items: [
      {
        path: '/takip-listem',
        label: 'Takip Listem',
        icon: Briefcase,
        description: 'Izlediginiz hisseler — fiyat, degisim, kisisel notlarla.',
        usage: 'Portfoyunuze veya radarinizdaki hisselere odaklanmak icin.',
      },
      {
        path: '/notlarim',
        label: 'Notlarim',
        icon: BookOpen,
        description: 'Teknik analiz notlari + finansal/strateji notlari.',
        usage: 'Hisse bazli kendi gozlemlerinizi kaydetmek icin.',
        tabs: ['Teknik', 'Finansal'],
      },
      {
        path: '/ekonomik-takvim',
        label: 'Ekonomik Takvim',
        icon: Calendar,
        description: 'TR + ABD onemli veri aciklamalari — TUFE, faiz, NFP, FOMC vs.',
        usage: 'Kritik bir veri aciklamasi oncesi pozisyon ayarlamak icin.',
      },
    ],
  },
  {
    title: 'Hesap & Ayarlar',
    description: 'Abonelik, profil ve uygulama ayarlari',
    color: 'purple',
    items: [
      {
        path: '/abonelik',
        label: 'Abonelik',
        icon: CreditCard,
        description: 'Plan secimi (Free / Aylik / Lifetime), kullanim limitleri, yukseltme.',
        usage: 'Plan degistirmek veya kalan hak gormek icin.',
      },
      {
        path: '/ayarlar',
        label: 'Ayarlar',
        icon: Settings,
        description: 'Tema (acik/karanlik), font olcegi, bildirim tercihleri.',
        usage: 'Goruntu ve bildirim tercihlerini ozellestirmek icin.',
      },
      {
        path: '/sifre-degistir',
        label: 'Sifre Degistir',
        icon: KeyRound,
        description: 'Hesap sifrenizi guncelleyin.',
        usage: 'Guvenligi taze tutmak icin.',
      },
      {
        path: '/istek-paneli',
        label: 'Istek Paneli',
        icon: MessageCircle,
        description: 'Yeni ozellik istegi gonderin, baskalarinin isteklerine oy verin.',
        usage: 'Platforma katki sunmak ve onceliklere oy vermek icin.',
      },
    ],
  },
]

const COLOR_MAP = {
  amber:   { gradient: 'from-amber-500/15 to-amber-700/5',   border: 'border-amber-500/40',   text: 'text-amber-400',   icon: 'text-amber-400'   },
  blue:    { gradient: 'from-blue-500/15 to-blue-700/5',     border: 'border-blue-500/40',    text: 'text-blue-400',    icon: 'text-blue-400'    },
  emerald: { gradient: 'from-emerald-500/15 to-emerald-700/5', border: 'border-emerald-500/40', text: 'text-emerald-400', icon: 'text-emerald-400' },
  purple:  { gradient: 'from-purple-500/15 to-purple-700/5', border: 'border-purple-500/40',  text: 'text-purple-400',  icon: 'text-purple-400'  },
}

export default function SiteHaritasi() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Hero */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-700/5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
            <MapIcon className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Site Haritasi</h1>
            <p className="text-sm text-amber-100/80 mt-1">
              Borsa Krali platformundaki tum sayfalar ve ne ise yaradiklari. Bir kart ya da
              bagaj baglantisina tiklayarak istediginiz aracta dogrudan acabilirsiniz.
            </p>
            <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
              <span className="px-2 py-1 rounded-md bg-amber-500/20 text-amber-200 border border-amber-500/30 font-semibold">
                {SECTIONS.reduce((acc, s) => acc + s.items.length, 0)} sayfa
              </span>
              <span className="px-2 py-1 rounded-md bg-blue-500/20 text-blue-200 border border-blue-500/30 font-semibold">
                {SECTIONS.length} kategori
              </span>
              <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Canli veri
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map((section) => {
        const colors = COLOR_MAP[section.color]
        return (
          <section key={section.title} className="space-y-3">
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
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`group text-left rounded-xl border ${colors.border} bg-gradient-to-br ${colors.gradient} p-4 transition-all hover:scale-[1.015] hover:brightness-110`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-9 h-9 rounded-lg bg-dark-900/50 border border-white/5 flex items-center justify-center flex-shrink-0 ${colors.icon}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                            {item.label}
                            {item.badge && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 border border-amber-500/40">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono truncate">{item.path}</div>
                        </div>
                      </div>
                      <ArrowRight className={`w-4 h-4 ${colors.text} flex-shrink-0 transition-transform group-hover:translate-x-1`} />
                    </div>

                    <p className="text-xs text-gray-300 leading-snug mt-2">{item.description}</p>

                    {item.usage && (
                      <p className="text-[11px] text-gray-500 leading-snug mt-2 pt-2 border-t border-white/5">
                        <span className={`font-semibold ${colors.text}`}>Ne zaman:</span> {item.usage}
                      </p>
                    )}

                    {item.tabs && item.tabs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.tabs.map(t => (
                          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-dark-900/40 border border-white/5 text-gray-400">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      {/* Footer hint */}
      <div className="rounded-xl border border-dark-700 bg-dark-900/40 p-4 text-xs text-gray-400 flex items-start gap-2">
        <Brain className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white">Ipucu: </span>
          Hizli gezinme icin <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-dark-700 border border-dark-600 text-gray-300 mx-1">Ctrl + K</kbd>
          tusu ile komut paletini acin — tum sayfalara ve hisselere oradan ulasabilirsiniz.
        </div>
      </div>
    </div>
  )
}
