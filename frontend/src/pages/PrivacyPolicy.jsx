import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'

const sections = [
  {
    title: 'Toplanan Veriler',
    body: 'Borsa Kralı, hesap oluşturma ve giriş işlemleri için ad, soyad, e-posta adresi, telefon numarası ve şifre bilgilerini toplar. Uygulama içindeki notlar, yorumlar, istekler ve kullanıcının gönderdiği diğer metinler de ilgili özelliği çalıştırmak için işlenebilir.'
  },
  {
    title: 'Kullanım Amaçları',
    body: 'Toplanan veriler hesap yönetimi, kimlik doğrulama, destek süreçleri, uygulama içi finansal analiz özellikleri, yorum ve istek panelleri ile güvenlik kayıtları için kullanılır. Uygulama yatırım tavsiyesi vermez; veriler eğitim ve analiz deneyimini sunmak amacıyla işlenir.'
  },
  {
    title: 'Reklam ve Üçüncü Taraf Hizmetler',
    body: 'Uygulamada reklam gösterimi aktif olduğunda Google AdMob gibi reklam servisleri cihaz kimlikleri ve reklam performansına ilişkin teknik verileri işleyebilir. Ayrıca piyasa verileri uygulama içindeki finansal ekranları sunmak için üçüncü taraf veri kaynaklarından alınabilir.'
  },
  {
    title: 'Veri Güvenliği',
    body: 'Veri iletimi HTTPS üzerinden yapılır. Kullanıcı kayıtları sunucu tarafında şifreli şekilde saklanır. Yalnızca hizmeti sunmak için gerekli olan personel ve servisler veriye erişebilir.'
  },
  {
    title: 'Veri Paylaşımı',
    body: 'Kişisel veriler, uygulama işlevini yerine getirmek için kullanılan servis sağlayıcılar dışında satış veya pazarlama amacıyla paylaşılmaz. Yasal zorunluluk, dolandırıcılık önleme veya güvenlik gerekleri doğduğunda ilgili kurumlarla paylaşım yapılabilir.'
  },
  {
    title: 'Hesap ve Veri Silme',
    body: 'Kullanıcı, uygulama içindeki Ayarlar bölümünden hesabını silebilir veya web üzerinden hesap silme talebi iletebilir. Güvenlik, dolandırıcılık önleme ya da hukuki yükümlülük sebebiyle tutulması gereken belirli kayıtlar sınırlı süreyle saklanabilir.'
  },
  {
    title: 'İletişim',
    body: 'Gizlilikle ilgili talepleriniz için destek@borsakrali.com adresine ulaşabilirsiniz.'
  }
]

export default function PrivacyPolicy() {
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
            <Link to="/terms-of-use" className="text-gray-400 hover:text-white">Kullanım Koşulları</Link>
            <Link to="/account-deletion" className="text-gray-400 hover:text-white">Hesap Silme</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <div className="mb-8 space-y-3">
            <p className="text-sm font-medium text-gold-400">Gizlilik Politikası</p>
            <h1 className="text-3xl font-bold text-white">Borsa Kralı Kullanıcı Verileri</h1>
            <p className="max-w-3xl text-sm leading-6 text-gray-400">
              Bu metin, Google Play store listelemesi ve uygulama içi bilgilendirme için hazırlanmıştır.
              Hukuki gereklilikleriniz için bir hukuk danışmanıyla son kontrol yapmanız önerilir.
            </p>
          </div>

          <div className="space-y-5">
            {sections.map((section) => (
              <section key={section.title} className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
                <h2 className="mb-2 text-lg font-semibold text-white">{section.title}</h2>
                <p className="text-sm leading-6 text-gray-300">{section.body}</p>
              </section>
            ))}
          </div>

          <p className="mt-8 text-xs text-gray-500">Son güncelleme: 31 Mart 2026</p>
        </div>
      </div>
    </div>
  )
}
