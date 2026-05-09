import { Link } from 'react-router-dom'
import {
  Crown, Target, Activity, Building2, ShieldCheck, BookOpen, Mail,
} from 'lucide-react'
import BrandMark from '../components/BrandMark'

const features = [
  {
    icon: Activity,
    title: 'Canli Piyasa Verileri',
    body: 'BIST 100, BIST 30, sektor performans haritalari ve canli heatmap ile piyasanin genel resmini tek ekranda goruyorsunuz.',
  },
  {
    icon: Target,
    title: 'Gunluk AI Sinyalleri',
    body: '09:55 oncesi taranan BIST100 hisseleri icin 16 koşullu universal skorlama. Ust 10 sinyal mobil bildirimle iletilir.',
  },
  {
    icon: Building2,
    title: 'Sirket ve Mali Tablo Analizi',
    body: 'Bilanco, gelir tablosu, nakit akimi, oranlar ve KAP ozetleri ile temel analiz; AI Skor ile sentez.',
  },
  {
    icon: BookOpen,
    title: 'Tarayicilar ve Stratejiler',
    body: 'EMA34, Malaysian SNR, Pivot ve daha fazlasi — kendi stratejinizi tarama merkezinde calistirabilirsiniz.',
  },
  {
    icon: ShieldCheck,
    title: 'Egitim Odakli',
    body: 'Tum ozellikler analiz ve egitim icin sunulur. Yatirim tavsiyesi vermeyiz; karar her zaman kullanicinindir.',
  },
]

export default function Hakkimizda() {
  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3 text-sm text-gold-400 hover:text-gold-300">
            <BrandMark size="sm" />
            Borsa Krali
          </Link>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link to="/iletisim" className="text-gray-400 hover:text-white">Iletisim</Link>
            <Link to="/privacy-policy" className="text-gray-400 hover:text-white">Gizlilik</Link>
            <Link to="/terms-of-use" className="text-gray-400 hover:text-white">Kullanim Kosullari</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <div className="mb-8 space-y-3">
            <p className="text-sm font-medium text-gold-400">Hakkimizda</p>
            <h1 className="text-3xl font-bold text-white">Borsa Krali Nedir?</h1>
            <p className="max-w-3xl text-sm leading-7 text-gray-300">
              Borsa Krali; Borsa Istanbul yatirimcilari icin gelistirilmis premium analiz platformudur.
              Canli piyasa verileri, kural bazli AI sinyalleri, mali tablo incelemeleri, tarayicilar ve
              egitim icerikleri tek bir uygulamada birlestirilmistir. Amacimiz bireysel yatirimcinin,
              kurumsal seviyede araclara hizli ve sade bir arayuzle erismesini saglamaktir.
            </p>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-2">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mb-2 text-lg font-semibold text-white">{title}</h2>
                <p className="text-sm leading-6 text-gray-300">{body}</p>
              </div>
            ))}
          </div>

          <section className="mb-6 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-white">
              <Crown className="h-5 w-5 text-gold-400" />
              Misyonumuz
            </h2>
            <p className="text-sm leading-7 text-gray-300">
              Yatirim kararlarinin verisel ve kural bazli temellere dayanmasi gerektigine inaniyoruz.
              Borsa Krali; karmasik finansal kavramlari sade goruntulere donusturerek, hem yeni baslayan
              hem de tecrubeli yatirimcinin piyasayi daha hizli okumasina yardimci olur.
            </p>
          </section>

          <section className="mb-6 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="mb-2 text-lg font-semibold text-white">Veri Kaynaklari</h2>
            <p className="text-sm leading-7 text-gray-300">
              Fiyat, hacim, mali tablo ve haber verileri Yahoo Finance, KAP ve diger lisansli ucuncu taraf
              kaynaklardan toplanir. Veriler kucuk gecikmelerle iletilebilir; kritik kararlardan once
              resmi BIST kaynaklarinin teyit edilmesi onerilir.
            </p>
          </section>

          <section className="mb-6 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="mb-2 text-lg font-semibold text-white">Yasal Uyari</h2>
            <p className="text-sm leading-7 text-gray-300">
              Borsa Krali bir yatirim danismanlik kurulusu degildir. Platform uzerinden sunulan analizler,
              sinyaller ve skorlar yatirim tavsiyesi niteligi tasimaz; yalnizca egitim ve bilgi amacli sunulur.
              Yatirim kararlarinizdan dogan sonuclardan tamamen siz sorumlusunuz.
            </p>
          </section>

          <section className="rounded-2xl border border-gold-500/20 bg-gold-500/5 p-5">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-white">
              <Mail className="h-5 w-5 text-gold-400" />
              Iletisim
            </h2>
            <p className="text-sm leading-7 text-gray-300">
              Geri bildirim, is birligi veya destek talepleriniz icin{' '}
              <a href="mailto:destek@borsakrali.com" className="text-gold-400 underline-offset-2 hover:underline">
                destek@borsakrali.com
              </a>{' '}
              adresine ulasabilirsiniz. Ayrintili form icin{' '}
              <Link to="/iletisim" className="text-gold-400 underline-offset-2 hover:underline">
                iletisim sayfasini
              </Link>{' '}
              ziyaret edebilirsiniz.
            </p>
          </section>

          <p className="mt-8 text-xs text-gray-500">Son guncelleme: 9 Mayis 2026</p>
        </div>
      </div>
    </div>
  )
}
