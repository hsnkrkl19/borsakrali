import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'

const rules = [
  'Uygulama yalnızca eğitim, analiz ve bilgi amacıyla sunulur; yatırım tavsiyesi değildir.',
  'Kullanıcı; hukuka aykırı, tehditkar, hakaret içeren, spam veya manipüle edici içerik paylaşamaz.',
  'Yorum, not veya istek panellerine girilen içerikler denetlenebilir, kaldırılabilir veya arşivlenebilir.',
  'Hesap güvenliği kullanıcının sorumluluğundadır. Şifre ve giriş bilgileri üçüncü kişilerle paylaşılmamalıdır.',
  'Uygulama içi finansal veriler üçüncü taraf kaynaklardan gelir; gecikme, eksiklik veya hata olabilir.',
  'Kurallara aykırı kullanım durumunda hesap kısıtlanabilir veya sonlandırılabilir.'
]

export default function TermsOfUse() {
  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/login" className="inline-flex items-center gap-3 text-sm text-gold-400 hover:text-gold-300">
            <BrandMark size="sm" />
            Borsa Kralı
          </Link>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link to="/hakkimizda" className="text-gray-400 hover:text-white">Hakkımızda</Link>
            <Link to="/iletisim" className="text-gray-400 hover:text-white">İletişim</Link>
            <Link to="/privacy-policy" className="text-gray-400 hover:text-white">Gizlilik</Link>
            <Link to="/account-deletion" className="text-gray-400 hover:text-white">Hesap Silme</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <p className="text-sm font-medium text-gold-400">Kullanım Koşulları</p>
          <h1 className="mt-3 text-3xl font-bold text-white">Borsa Kralı Hizmet Kuralları</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            Bu koşullar, uygulamayı kullanan tüm kullanıcılar için geçerli genel kuralları açıklar.
            Uygulamayı kullanmaya devam ederek bu koşulları kabul etmiş sayılırsınız.
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
              Google Play incelemeleri için önemli not: Uygulama kullanıcıların paylaştığı içerikleri denetleme,
              kaldırma ve destek süreciyle yönetme hakkını saklı tutar. İhlal bildirimleri için destek@borsakrali.com
              adresi kullanılabilir.
            </p>
          </div>

          <p className="mt-8 text-xs text-gray-500">Son güncelleme: 31 Mart 2026</p>
        </div>
      </div>
    </div>
  )
}
