import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'

const sections = [
  {
    title: 'Toplanan Veriler',
    body: 'Borsa Krali, hesap olusturma ve giris islemleri icin ad, soyad, e-posta adresi, telefon numarasi ve sifre bilgilerini toplar. Uygulama icindeki notlar, yorumlar, istekler ve kullanicinin gonderdigi diger metinler de ilgili ozelligi calistirmak icin islenebilir.'
  },
  {
    title: 'Kullanim Amaclari',
    body: 'Toplanan veriler hesap yonetimi, kimlik dogrulama, destek surecleri, uygulama ici finansal analiz ozellikleri, yorum ve istek panelleri ile guvenlik kayitlari icin kullanilir. Uygulama yatirim tavsiyesi vermez; veriler egitim ve analiz deneyimini sunmak amaciyla islenir.'
  },
  {
    title: 'Reklam ve Ucuncu Taraf Hizmetler',
    body: 'Uygulamada reklam gosterimi aktif oldugunda Google AdMob gibi reklam servisleri cihaz kimlikleri ve reklam performansina iliskin teknik verileri isleyebilir. Ayrica piyasa verileri uygulama icindeki finansal ekranlari sunmak icin ucuncu taraf veri kaynaklarindan alinabilir.'
  },
  {
    title: 'Veri Guvenligi',
    body: 'Veri iletimi HTTPS uzerinden yapilir. Kullanici kayitlari sunucu tarafinda sifreli sekilde saklanir. Yalnizca hizmeti sunmak icin gerekli olan personel ve servisler veriye erisebilir.'
  },
  {
    title: 'Veri Paylasimi',
    body: 'Kisisel veriler, uygulama islevini yerine getirmek icin kullanilan servis saglayicilar disinda satis veya pazarlama amaciyla paylasilmaz. Yasal zorunluluk, dolandiricilik onleme veya guvenlik gerekleri dogdugunda ilgili kurumlarla paylasim yapilabilir.'
  },
  {
    title: 'Hesap ve Veri Silme',
    body: 'Kullanici, uygulama icindeki Ayarlar bolumunden hesabini silebilir veya web uzerinden hesap silme talebi iletebilir. Guvenlik, dolandiricilik onleme ya da hukuki yukumluluk sebebiyle tutulmasi gereken belirli kayitlar sinirli sureyle saklanabilir.'
  },
  {
    title: 'Iletisim',
    body: 'Gizlilikle ilgili talepleriniz icin destek@borsakrali.com adresine ulasabilirsiniz.'
  }
]

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/login" className="inline-flex items-center gap-3 text-sm text-gold-400 hover:text-gold-300">
            <BrandMark size="sm" />
            Borsa Krali
          </Link>
          <div className="flex gap-4 text-sm">
            <Link to="/terms-of-use" className="text-gray-400 hover:text-white">Kullanim Kosullari</Link>
            <Link to="/account-deletion" className="text-gray-400 hover:text-white">Hesap Silme</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <div className="mb-8 space-y-3">
            <p className="text-sm font-medium text-gold-400">Gizlilik Politikasi</p>
            <h1 className="text-3xl font-bold text-white">Borsa Krali Kullanici Verileri</h1>
            <p className="max-w-3xl text-sm leading-6 text-gray-400">
              Bu metin, Google Play store listelemesi ve uygulama ici bilgilendirme icin hazirlanmistir.
              Hukuki gereklilikleriniz icin bir hukuk danismaniyla son kontrol yapmaniz onerilir.
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

          <p className="mt-8 text-xs text-gray-500">Son guncelleme: 31 Mart 2026</p>
        </div>
      </div>
    </div>
  )
}
