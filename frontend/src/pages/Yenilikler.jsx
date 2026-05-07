import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Calculator, Hash, Newspaper, Bitcoin, Search, Tag,
  ArrowRight, Github, ExternalLink, Zap, TrendingUp, Globe, MessageCircle,
} from 'lucide-react'

const FEATURES = [
  {
    id: 'dcf',
    title: 'DCF Değerleme',
    badge: 'YENİ',
    badgeTone: 'amber',
    icon: Calculator,
    iconBg: 'from-amber-400 to-amber-600',
    description: 'İndirgenmiş Nakit Akımı yöntemiyle BIST hisselerinin içsel (adil) değerini hesapla. 5 yıllık FCF projeksiyonu, sektör bazlı WACC, Gordon terminal ve 3×3 sensitivity matrix.',
    bullets: [
      '5 yıllık FCF projeksiyonu (CAGR %15 ile sınırlı)',
      'Damodaran sektör WACC tablosu (USD/TL mod)',
      'Gordon terminal (g=%2.5)',
      '3×3 hassasiyet matrisi (WACC ±%1 × g)',
      'Yahoo Finance gerçek 5y FCF verisi',
      'Verdict: Derin İskonto / İskontolu / Pahalı / Çok Pahalı',
    ],
    cta: 'DCF hesapla →',
    path: '/dcf-degerleme',
    source: 'dexter src/skills/dcf/',
    location: 'Şirket Analizi → DCF Değerleme · Ana menüde standalone',
  },
  {
    id: 'xgundem',
    title: 'X Gündemi',
    badge: 'YENİ',
    badgeTone: 'amber',
    icon: Hash,
    iconBg: 'from-cyan-400 to-blue-600',
    description: 'BIST hisseleri ve kripto paraların X.com\'da hashtag/cashtag bazlı mention analizi. Hangi hisse en çok konuşulmuş, sentiment dağılımı, trend skor.',
    bullets: [
      'BIST 30/100/Tümü kapsamı',
      'Kripto modu: Top 10/30/Tümü (75+ coin)',
      'En çok konuşulanlar podyumu (top 3)',
      'Pozitif/Negatif sentiment kategorileri',
      'Tek sembol detayı: 7g seri, 24sa dağılım, örnek tweetler',
      '"X\'te aç" deep-link (X.com/search arama URL\'i)',
    ],
    cta: 'X Gündemi\'ne git →',
    path: '/tarayicilar?tab=x-gundem',
    source: 'dexter src/tools/search/x-search.ts',
    location: 'Tarayıcılar → X Gündemi',
    note: 'Şu an mock veri. Yol haritası: twscrape (kendi cookie) → RapidAPI → resmi X API v2',
  },
  {
    id: 'haberler',
    title: 'Haber Akışı',
    badge: 'YENİ',
    badgeTone: 'amber',
    icon: Newspaper,
    iconBg: 'from-blue-400 to-indigo-600',
    description: 'Türk finans medyası ve kripto kaynaklarından canlı RSS haber kazıma. Haberlerde geçen BIST/kripto sembolleri otomatik tespit edilip tıklanabilir pill olarak gösteriliyor.',
    bullets: [
      '6 RSS kaynağı: Bloomberg HT, NTV, Hürriyet, Sabah, Sözcü, Cointelegraph',
      'Genel ekonomi / Kripto kategori filtresi',
      'Kaynak bazlı filtreleme çipleri',
      'Otomatik sembol tespiti (Türkçe şirket adı + cashtag + kripto adı)',
      'Sembol pill\'ine tıkla → X Gündemi detayına git',
      '5 dakikalık önbellek',
    ],
    cta: 'Haberleri aç →',
    path: '/tarayicilar?tab=haberler',
    source: 'dexter src/tools/browser/browser.ts',
    location: 'Tarayıcılar → Haber Akışı',
  },
  {
    id: 'crypto-quote',
    title: 'Canlı Kripto Fiyat (CoinGecko)',
    badge: 'CANLI',
    badgeTone: 'green',
    icon: Bitcoin,
    iconBg: 'from-orange-400 to-orange-600',
    description: 'X Gündemi kripto detay modal\'ında CoinGecko\'dan gerçek zamanlı fiyat, market cap, hacim, dolaşım ve 24sa/7g değişim verisi.',
    bullets: [
      'CoinGecko ücretsiz API (auth gerektirmez)',
      'USD fiyat + 24h/7g/30g değişim',
      'Market cap + hacim + dolaşım sayısı',
      'CoinGecko sıralaması (rank)',
      '75+ kripto için sembol → CoinGecko ID eşleme',
      '1 dakikalık önbellek',
    ],
    cta: 'Kriptolar → BTC tıkla →',
    path: '/tarayicilar?tab=x-gundem&assetType=crypto&focus=BTC',
    source: 'dexter src/tools/finance/crypto.ts',
    location: 'X Gündemi → Kripto → Coin tıkla',
  },
  {
    id: 'header-search',
    title: 'Genişletilmiş Header Arama',
    badge: 'GELİŞTİRİLDİ',
    badgeTone: 'blue',
    icon: Search,
    iconBg: 'from-purple-400 to-purple-600',
    description: 'Üst menüdeki arama kutusu artık 35 yerel kripto + tüm CoinGecko evrenini destekliyor. PEPE, WLD, PENDLE gibi tüm coinler bulunuyor.',
    bullets: [
      '35 yerel popüler kripto (anlık eşleşme)',
      'CoinGecko search API ile geniş arama',
      'BIST hisseleri ile paralel sorgu',
      'Klavye kısayolu: "/" tuşu odaklar',
    ],
    cta: 'Header\'da "pendle" yaz →',
    path: '/',
    source: 'CoinGecko /search endpoint',
    location: 'Site geneli üst menü arama kutusu',
  },
  {
    id: 'symbol-detection',
    title: 'Akıllı Sembol Tespiti',
    badge: 'YENİ',
    badgeTone: 'amber',
    icon: Tag,
    iconBg: 'from-emerald-400 to-emerald-600',
    description: 'Haber başlık ve açıklamalarında geçen BIST hisseleri ve kriptoları 4 farklı pattern ile otomatik tespit eden sistem.',
    bullets: [
      'Cashtag/hashtag: $BTC, #THYAO',
      'Türkçe şirket adı: "Arçelik" → ARCLK, "Akbank" → AKBNK',
      'ALL-CAPS ticker yakalama',
      'Kripto adı (İngilizce): "Bitcoin" → BTC',
      'Yaygın TR kelimelerinden false positive filtresi',
      'Tıklanınca X Gündemi modal\'ı açılır',
    ],
    cta: 'Haber Akışı\'nda gör →',
    path: '/tarayicilar?tab=haberler',
    source: 'webScraperService.detectMentionedSymbols()',
    location: 'Haber Akışı kart altında pill\'ler',
  },
  {
    id: 'autocomplete',
    title: 'DCF Sembol Otomatik Tamamlama',
    badge: 'YENİ',
    badgeTone: 'amber',
    icon: Zap,
    iconBg: 'from-pink-400 to-rose-600',
    description: 'DCF Değerleme sayfasında sembol yazarken canlı öneri dropdown\'ı. Tüm BIST evrenini debounce\'lu arama ile tarar.',
    bullets: [
      '200ms debounce ile hafif sorgu',
      'Sembol + şirket adı + sektör gösterimi',
      'Mouse veya Enter ile seç',
      'Escape ile kapat',
      'Tıklanınca anında DCF hesabı başlar',
    ],
    cta: 'DCF\'de "ASEL" yaz →',
    path: '/dcf-degerleme',
    source: '/api/market/stocks/search',
    location: 'DCF Değerleme arama kutusu',
  },
]

const ROADMAP = [
  { status: 'done',     label: '✅ Adım 4: Mock UI hazır (mimari kuruldu)' },
  { status: 'pending',  label: '⏳ Adım 3: twscrape ile gerçek X scrape (kullanıcı X cookie\'si gerekli)' },
  { status: 'pending',  label: '⏳ Adım 2: RapidAPI / X API v2 (Bearer token, $0–$100/ay)' },
]

const TONE_CLASSES = {
  amber: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  green: 'bg-green-500/20 text-green-200 border-green-500/40',
  blue:  'bg-blue-500/20 text-blue-200 border-blue-500/40',
}

function FeatureCard({ feature }) {
  const navigate = useNavigate()
  const Icon = feature.icon
  const tone = TONE_CLASSES[feature.badgeTone] || TONE_CLASSES.amber

  return (
    <div className="rounded-2xl border border-dark-700 bg-gradient-to-br from-dark-900/80 to-dark-900/30 hover:border-amber-500/40 transition-all overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.iconBg} flex items-center justify-center shadow-lg shrink-0`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-white">{feature.title}</h3>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tone}`}>
                {feature.badge}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{feature.location}</p>
          </div>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed mb-3">{feature.description}</p>

        <ul className="space-y-1 mb-3">
          {feature.bullets.map((b, i) => (
            <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        {feature.note && (
          <div className="text-[11px] text-amber-200/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2 mb-3">
            ⚡ {feature.note}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2 pt-3 border-t border-dark-700">
          <div className="text-[10px] text-gray-500 font-mono">
            {feature.source}
          </div>
          <button
            onClick={() => navigate(feature.path)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-colors flex items-center gap-1.5"
          >
            {feature.cta}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Yenilikler() {
  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-orange-500/5 to-dark-900/30 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
            <Sparkles className="w-6 h-6 text-dark-950" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Yenilikler</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500 text-dark-950">v3.1</span>
            </div>
            <p className="text-sm text-gray-300 mt-1">
              Borsa Kralı'na <a href="https://github.com/virattt/dexter" target="_blank" rel="noopener noreferrer" className="text-amber-300 hover:text-amber-200 underline">virattt/dexter</a> repo'sundan port edilen ve genişletilen 7 yeni özellik
            </p>
            <a
              href="https://github.com/virattt/dexter"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white mt-2"
            >
              <Github className="w-3 h-3" />
              Kaynak repo: virattt/dexter
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="text-[10px] uppercase tracking-wider text-amber-300">Yeni Sayfa</div>
          <div className="text-2xl font-bold text-white">3</div>
          <div className="text-[10px] text-gray-400">DCF · X Gündemi · Haberler</div>
        </div>
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3">
          <div className="text-[10px] uppercase tracking-wider text-blue-300">Yeni API</div>
          <div className="text-2xl font-bold text-white">10+</div>
          <div className="text-[10px] text-gray-400">DCF · X · Crypto · Scraper</div>
        </div>
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3">
          <div className="text-[10px] uppercase tracking-wider text-orange-300">Veri Kaynağı</div>
          <div className="text-2xl font-bold text-white">8</div>
          <div className="text-[10px] text-gray-400">Yahoo · CoinGecko · 6 RSS</div>
        </div>
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3">
          <div className="text-[10px] uppercase tracking-wider text-green-300">Backend Servis</div>
          <div className="text-2xl font-bold text-white">4</div>
          <div className="text-[10px] text-gray-400">xMention · DCF · Crypto · Scraper</div>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {FEATURES.map(f => (
          <FeatureCard key={f.id} feature={f} />
        ))}
      </div>

      {/* X data roadmap */}
      <div className="rounded-2xl border border-dark-700 bg-dark-900/40 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-amber-400" />
          <h2 className="text-base font-bold text-white">X Gerçek Veri Yol Haritası</h2>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          X Gündemi şu an deterministik mock veri kullanıyor (her sembol için sabit/tutarlı). Gerçek X.com verisine geçiş için 3 adımlı plan:
        </p>
        <div className="space-y-2">
          {ROADMAP.map((r, i) => (
            <div key={i} className={`text-sm p-2.5 rounded-lg border ${
              r.status === 'done' ? 'bg-green-500/10 border-green-500/30 text-green-200' : 'bg-dark-800/50 border-dark-700 text-gray-400'
            }`}>
              {r.label}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          Mimari hazır — backend'deki <code className="text-amber-300 bg-dark-800 px-1 rounded">xMentionService.scanMentions()</code> içindeki mock generator'ı tek değişiklikle gerçek API'ya bağlamak yeterli; UI ve şema aynı kalır.
        </p>
      </div>

      {/* Tech debt notes */}
      <div className="rounded-xl border border-dark-700 bg-dark-900/30 p-3">
        <div className="text-xs text-gray-400 leading-relaxed">
          <strong className="text-amber-300">Bilinen sınırlamalar:</strong> DCF'te USD-WACC + TL-FCF kullanımı bazı hisselerde aşırı temkinli sonuç verir → TL modunu deneyin. Sembol tespitinde nadir false positive olabilir (örn. "Beyaz Eşya" → BEYAZ). Bloomberg HT haberleri 5 dakika önbelleklenir.
        </div>
      </div>
    </div>
  )
}
