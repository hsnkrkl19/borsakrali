import { Link } from 'react-router-dom'
import {
  BookOpen, TrendingUp, BarChart3, Calculator, Target, Zap, ArrowRight, Clock,
} from 'lucide-react'
import BrandMark from '../components/BrandMark'

const articles = [
  {
    slug: 'teknik-analiz-giris',
    title: 'Teknik Analize Giris: Sifirdan Baslayanlar Icin Kilavuz',
    summary:
      'Teknik analizin temellerini, grafik turlerini, trend kavramini ve yeni baslayanlarin takip edebilecegi yol haritasini ele aliyoruz.',
    category: 'Teknik',
    readingTime: '8 dk',
    icon: BookOpen,
  },
  {
    slug: 'bist100-rehberi',
    title: 'BIST 100 Endeksi: Hesaplama, Hisseler, Tarih',
    summary:
      'BIST 100 endeksinin nasil hesaplandigini, hangi hisselerin endekste yer aldigini, donemsel revizyonlari ve uzun donem performansini detayli bicimde inceliyoruz.',
    category: 'Temel',
    readingTime: '9 dk',
    icon: TrendingUp,
  },
  {
    slug: 'temel-gostergeler',
    title: 'EMA, MACD, RSI: 3 Temel Gosterge ve Yorumu',
    summary:
      'Teknik analizin en cok kullanilan uc gostergesini formulleri, parametreleri ve BIST hisselerinden gercek ornekleriyle anlatiyoruz.',
    category: 'Teknik',
    readingTime: '10 dk',
    icon: BarChart3,
  },
  {
    slug: 'bilanco-okuma',
    title: 'Bilanco Okuma Kilavuzu: Aktif, Pasif, Ozkaynak',
    summary:
      'Bir sirket bilancosunun bolumlerini tanitiyor, KAP uzerinden bilanco okumayi ve onemli oranlari ornekler uzerinden anlatiyoruz.',
    category: 'Temel',
    readingTime: '11 dk',
    icon: Calculator,
  },
  {
    slug: 'destek-direnc',
    title: 'Destek ve Direnc Seviyeleri Nasil Cizilir?',
    summary:
      'Destek-direnc cizimi, trend cizgileri, pivot noktalari, Fibonacci geri cekilmeleri ve sahte kirilim tuzaklari hakkinda pratik kilavuz.',
    category: 'Teknik',
    readingTime: '9 dk',
    icon: Target,
  },
  {
    slug: 'yatirim-stratejisi',
    title: 'Yatirim Stratejisi Olusturma: 5 Adim',
    summary:
      'Hedef belirleme, risk profili, varlik dagilimi, hisse secim kriterleri ve pozisyon yonetimi ile saglam bir strateji nasil kurulur?',
    category: 'Strateji',
    readingTime: '10 dk',
    icon: Zap,
  },
]

const categoryStyles = {
  Teknik: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  Temel: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
  Strateji: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
}

export default function Egitim() {
  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3 text-sm text-gold-400 hover:text-gold-300">
            <BrandMark size="sm" />
            Borsa Krali
          </Link>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link to="/hakkimizda" className="text-gray-400 hover:text-white">Hakkimizda</Link>
            <Link to="/iletisim" className="text-gray-400 hover:text-white">Iletisim</Link>
            <Link to="/privacy-policy" className="text-gray-400 hover:text-white">Gizlilik</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <nav aria-label="breadcrumb" className="mb-4 text-xs text-gray-500">
            <Link to="/" className="hover:text-gold-400">Borsa Krali</Link>
            <span className="mx-2 text-gray-600">/</span>
            <span className="text-gray-300">Egitim</span>
          </nav>

          <div className="mb-8 space-y-3">
            <p className="text-sm font-medium text-gold-400">Egitim Merkezi</p>
            <h1 className="text-3xl font-bold text-white">Borsa Egitim Icerikleri</h1>
            <p className="max-w-3xl text-sm leading-7 text-gray-300">
              Borsa Istanbul'da yatirim yapmaya yeni baslayanlar ve kendini gelistirmek isteyenler icin hazirlanmis
              egitim makaleleri. Teknik analiz, temel analiz ve strateji baslikli icerikler; gercek BIST hisseleri
              uzerinden ornek ve formulu gosterilen aciklamalar icerir. Buradaki yazilar yatirim tavsiyesi degildir;
              tamamen bilgilendirme amacli sunulmaktadir.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {articles.map(({ slug, title, summary, category, readingTime, icon: Icon }) => (
              <Link
                key={slug}
                to={`/egitim/${slug}`}
                className="group flex flex-col rounded-2xl border border-white/5 bg-dark-900/40 p-5 transition hover:border-gold-500/30 hover:bg-dark-900/70"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryStyles[category]}`}>
                    {category}
                  </span>
                </div>

                <h2 className="mb-2 text-lg font-semibold leading-snug text-white group-hover:text-gold-200">
                  {title}
                </h2>
                <p className="mb-4 flex-1 text-sm leading-6 text-gray-400">{summary}</p>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {readingTime} okuma
                  </span>
                  <span className="inline-flex items-center gap-1 text-gold-400 transition group-hover:gap-2">
                    Okumaya devam et <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <section className="mt-8 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-5">
            <h2 className="mb-2 text-base font-semibold text-yellow-200">Onemli Not</h2>
            <p className="text-sm leading-6 text-gray-300">
              Bu egitim merkezindeki tum icerikler yatirim tavsiyesi niteligi tasimaz. Borsa Krali bir yatirim
              danismanlik kurulusu degildir. Yatirim kararlarinizi kendi arastirmaniza, risk profilinize ve
              gerekirse profesyonel destek alarak vermeniz onerilir.
            </p>
          </section>

          <p className="mt-8 text-xs text-gray-500">Son guncelleme: 10 Mayis 2026</p>
        </div>
      </div>
    </div>
  )
}
