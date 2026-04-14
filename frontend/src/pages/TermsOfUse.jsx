import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'

const rules = [
  'Uygulama yalnizca egitim, analiz ve bilgi amaciyla sunulur; yatirim tavsiyesi degildir.',
  'Kullanici; hukuka aykiri, tehditkar, hakaret iceren, spam veya manipule edici icerik paylasamaz.',
  'Yorum, not veya istek panellerine girilen icerikler denetlenebilir, kaldirilabilir veya arsivlenebilir.',
  'Hesap guvenligi kullanicinin sorumlulugundadir. Sifre ve giris bilgileri ucuncu kisilerle paylasilmamalidir.',
  'Uygulama ici finansal veriler ucuncu taraf kaynaklardan gelir; gecikme, eksiklik veya hata olabilir.',
  'Kurallara aykiri kullanim durumunda hesap kisitlanabilir veya sonlandirilabilir.'
]

export default function TermsOfUse() {
  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/login" className="inline-flex items-center gap-3 text-sm text-gold-400 hover:text-gold-300">
            <BrandMark size="sm" />
            Borsa Krali
          </Link>
          <div className="flex gap-4 text-sm">
            <Link to="/privacy-policy" className="text-gray-400 hover:text-white">Gizlilik</Link>
            <Link to="/account-deletion" className="text-gray-400 hover:text-white">Hesap Silme</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <p className="text-sm font-medium text-gold-400">Kullanim Kosullari</p>
          <h1 className="mt-3 text-3xl font-bold text-white">Borsa Krali Hizmet Kurallari</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            Bu kosullar, uygulamayi kullanan tum kullanicilar icin gecerli genel kurallari aciklar.
            Uygulamayi kullanmaya devam ederek bu kosullari kabul etmis sayilirsiniz.
          </p>

          <div className="mt-8 space-y-4">
            {rules.map((rule, index) => (
              <div key={rule} className="flex gap-4 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gold-500/15 text-sm font-semibold text-gold-400">
                  {index + 1}
                </div>
                <p className="text-sm leading-6 text-gray-300">{rule}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-5">
            <p className="text-sm leading-6 text-yellow-100">
              Google Play incelemeleri icin onemli not: Uygulama kullanicilarin paylastigi icerikleri denetleme,
              kaldirma ve destek sureciyle yonetme hakkini sakli tutar. Ihlal bildirimleri icin destek@borsakrali.com
              adresi kullanilabilir.
            </p>
          </div>

          <p className="mt-8 text-xs text-gray-500">Son guncelleme: 31 Mart 2026</p>
        </div>
      </div>
    </div>
  )
}
