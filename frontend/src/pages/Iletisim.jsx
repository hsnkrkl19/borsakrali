import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Mail, MessageSquare, Send, CheckCircle2, AlertCircle,
  Globe, Clock, Info, Bug, FileText, ShieldAlert,
  Twitter, Instagram, Youtube, Linkedin,
  ChevronDown, ChevronUp,
  Building2, MapPin, Briefcase, ScrollText,
  Calendar, Hourglass
} from 'lucide-react'
import BrandMark from '../components/BrandMark'

const SUPPORT_EMAIL = 'info@borsakrali.com'
const SECONDARY_EMAIL = 'hsnkrkl19@gmail.com'

const PRECONTACT_TIPS = [
  {
    icon: Info,
    title: "SSS'lerimize Bakın",
    text: "Sorunuzun cevabı muhtemelen aşağıdaki Sıkça Sorulan Sorular bölümündedir. Hesap, abonelik, veri ve sinyaller, teknik sorunlar ile KVKK başlıkları altında 20'den fazla soruyu detaylı şekilde cevapladık. Önce orada arama yapmanız hem zaman kazandırır hem de çoğu durumda anlık çözüm sunar."
  },
  {
    icon: Bug,
    title: "Hata Bildiriminde Detay Verin",
    text: "Bir hata bildiriyorsanız lütfen tarayıcı türü ve sürümünü, işletim sistemini, cihaz modelini ve hatanın alındığı sayfanın tam adresini ekleyin. Mümkünse ekran görüntüsü veya kısa bir ekran kaydı paylaşın. Bu detaylar sorunu yeniden üretip çözmemizi çok hızlandırır; aksi halde gereksiz mesajlaşma kaybı yaşarız."
  },
  {
    icon: FileText,
    title: "Konu Başlığını Net Yazın",
    text: "Mesajınızın konu başlığı göndermek istediğiniz içeriği açıkça özetlemelidir; örneğin 'Yardım' yerine 'Premium abonelikten Lifetime plana geçiş fiyatı' gibi yazmak daha hızlı yönlendirme sağlar. Böylece talep doğru ekibe (teknik, abonelik veya KVKK) iletilir ve cevap süresi önemli ölçüde kısalır."
  },
  {
    icon: ShieldAlert,
    title: "Spam ve Otomatik Mesaj Göndermeyin",
    text: "Toplu, otomatik veya yapay zeka ile üretilmiş, gerçek bir destek talebi içermeyen mesajlar incelenmeden reddedilir. Aynı mesajı birden fazla kanaldan aynı anda göndermek talebinizi yavaşlatır. Tek bir kanaldan açık ve net mesajla yazmanız hem size hem de bize zaman kazandırır."
  }
]

const FAQ_CATEGORIES = [
  {
    title: 'Hesap ve Üyelik',
    items: [
      {
        q: 'Hesap açmak ücretsiz mi?',
        a: "Evet, Borsa Krali'nda temel hesap açmak tamamen ücretsizdir. Ücretsiz üyelik ile günlük sınırlı sayıda tarama yapabilir, dashboard özetini görebilir ve temel piyasa verilerine erişebilirsiniz. İleri seviye sinyaller, sınırsız tarama ve premium modülleri kullanmak isterseniz abonelik planlarımızı inceleyebilirsiniz. Kayıt için sadece geçerli bir e-posta adresi yeterlidir; kredi kartı istemiyoruz."
      },
      {
        q: 'Şifremi unuttum, ne yapmalıyım?',
        a: "Giriş ekranındaki 'Şifremi Unuttum' bağlantısına tıkladığınızda kayıtlı e-posta adresinize şifre sıfırlama linki gönderilir. Bu link 60 dakika geçerlidir. E-postayı alamadıysanız spam veya promosyonlar klasörünü kontrol edip birkaç dakika bekleyerek tekrar deneyin. Sorun devam ederse info@borsakrali.com adresinden bizimle iletişime geçip kayıtlı e-postanızı belirtin; manuel sıfırlama yaparız."
      },
      {
        q: 'E-posta doğrulama mesajı gelmedi?',
        a: "E-posta doğrulama mesajı genellikle birkaç saniye içinde inbox'a düşer. Gelmediyse öncelikle spam, gereksiz veya promosyonlar klasörünü inceleyin. Yine yoksa profil sayfanızdaki 'Tekrar Gönder' butonu ile yeni bir doğrulama mesajı isteyebilirsiniz. Bazı e-posta sağlayıcıları geciktirme uygular; 10 dakika içinde gelmemesi durumunda destek ekibimize yazıp kontrol talep edebilirsiniz."
      },
      {
        q: 'Hesabımı nasıl silerim?',
        a: "Hesabınızı tamamen kapatmak için profil sayfasında 'Hesabı Sil' bölümünü kullanabilirsiniz. KVKK kapsamında silme talebiniz en geç 30 gün içinde işlenir; tüm kullanıcı verileriniz, abonelik kayıtları ve geçmiş sinyal bildirimleri silinir. Aktif aboneliğiniz varsa önce iptal etmeniz önerilir. Silme talebinizi info@borsakrali.com adresine de yazabilirsiniz; her durumda kimlik doğrulaması yaparak süreci yürütüyoruz."
      },
      {
        q: 'Profil bilgilerimi nasıl değiştiririm?',
        a: "Profil sayfasından ad, soyad, e-posta adresi, şifre ve bildirim tercihlerini güncelleyebilirsiniz. E-posta değişikliği yeni adrese gönderilen doğrulama linki ile tamamlanır. Şifre değişikliği için mevcut şifrenizi girmeniz gerekir. Profil resmi şu an için desteklenmemekte olup roadmap'imizdedir. Hizmet şartları gereği takma ad yerine gerçek isim kullanmanızı tavsiye ederiz; bu hem fatura hem yasal yazışmalar için gereklidir."
      }
    ]
  },
  {
    title: 'Abonelik ve Ödeme',
    items: [
      {
        q: 'Hangi abonelik planları sunuluyor?',
        a: "Şu anda 6 farklı plan sunuyoruz: Free (ücretsiz), Starter Aylık (50 TL/ay), Pro Aylık (300 TL/ay), Elite Tek Seferlik (50 TL), Premium Tek Seferlik (150 TL) ve Lifetime (1500 TL bir defaya mahsus). Her plan farklı kota ve özellik kombinasyonu sunar. Detaylı karşılaştırma için /abonelik sayfamızı ziyaret edebilirsiniz. Lifetime plan sahipleri ileride eklenecek tüm yeni özelliklere otomatik dahil olur."
      },
      {
        q: 'İade ve cayma hakkı var mı?',
        a: "Aylık abonelikler ilk 7 gün içinde, aktif kullanım olmaması şartıyla iade edilebilir. Tek seferlik ve Lifetime planlar için iade hakkı, 6502 sayılı Tüketicinin Korunması Hakkında Kanun kapsamında dijital hizmet alımı gereği 14 gün cayma hakkıyla sınırlıdır; kullanım başlamışsa iade kabul edilmez. İade talepleriniz için info@borsakrali.com adresinden başvurabilirsiniz; talebiniz 7 iş günü içinde cevaplanır."
      },
      {
        q: 'Fatura nasıl alıyorum?',
        a: "Tüm ödemeleriniz için elektronik fatura kayıtlı e-posta adresinize otomatik gönderilir. Şirket adına fatura kesilmesini istiyorsanız ödeme öncesinde profil sayfanızda vergi bilgilerinizi (şirket unvanı, vergi dairesi, vergi numarası, adres) doldurmanız yeterlidir. Geçmiş faturalar profil > Faturalarım sekmesinden istediğiniz zaman PDF olarak indirilebilir. Fatura ile ilgili sorunlarınız için destek ekibimize yazıp düzeltme talep edebilirsiniz."
      },
      {
        q: 'Aboneliğimi nasıl iptal ederim?',
        a: "Aylık aboneliğinizi profil > Abonelik sekmesinden tek tıkla iptal edebilirsiniz. İptal sonrası mevcut dönemin sonuna kadar premium özellikleri kullanmaya devam edersiniz; otomatik yenileme durdurulur. Tek seferlik ve Lifetime planlar doğaları gereği iptal edilemez ancak hesap silme talep ederek tüm kayıtlarınızı kaldırabilirsiniz. İptal sonrası geri dönüş istediğinizde aynı planla tekrar abone olabilirsiniz."
      },
      {
        q: 'Hangi ödeme yöntemleri kabul ediliyor?',
        a: "Kredi kartı, banka kartı ve havale/EFT ile ödeme alabiliyoruz. Tüm kart işlemleri 3D Secure altyapısıyla yapılır ve kart bilgileriniz tarafımızda saklanmaz; PCI-DSS uyumlu ödeme sağlayıcımıza doğrudan iletilir. Havale/EFT seçen kullanıcılarımız için abonelik aktivasyonu ödeme bildirimi sonrası 1 iş günü içinde gerçekleşir. Apple Pay ve Google Pay entegrasyonu yakında devreye girecek; geliştirme roadmap'imizdedir."
      }
    ]
  },
  {
    title: 'Veri ve Sinyaller',
    items: [
      {
        q: 'Veriler ne kadar gecikmeli geliyor?',
        a: "Hisse senedi fiyat verileri yaklaşık 15 dakika gecikmelidir; bu süre Borsa İstanbul'un veri lisansı politikası gereğidir. Endeks verileri (BIST100, BIST30) genellikle 1-2 dakika içinde güncellenir. Bilanço, finansal tablolar ve oran verileri kuponlu şirketler için yayım sonrası 24 saat içinde sisteme işlenir. Anlık veriye ihtiyacınız varsa lütfen aracıkuruluk platformunuzu kullanın; bizim hizmetimiz analiz odaklıdır."
      },
      {
        q: 'Sinyaller hangi mantıkla üretiliyor?',
        a: "Sinyallerimiz 16 farklı teknik ve temel koşulu değerlendirip puanlandıran çok faktörlü bir algoritma ile üretilir. Hareketli ortalamalar, momentum göstergeleri (RSI, MACD), hacim teyidi, destek-direnç kırılımları, formasyonlar ve Malezya SNR ölçümleri katkı sağlar. Her hisse 0-16 aralığında puanlanır; günlük taramada en yüksek puanlı ilk 10 sinyal yayınlanır. Detaylı açıklama /gunluk-tespitler sayfasında mevcuttur."
      },
      {
        q: 'Neden bir hisse tarananlar arasında yok?',
        a: "Tarama BIST100 ve seçili BIST30 evreniyle sınırlıdır. Eğer ilgi duyduğunuz hisse bu evrenlerden birinde değilse otomatik taramaya dahil olmaz. Ayrıca likit olmayan, özsermayesi yetersiz veya BIST tarafından SPK yaptırımı uygulanmış hisseler veri kalitesi açısından filtrelenir. Hisseyi manuel olarak Teknik Analiz AI sayfasından arayarak detaylı analiz alabilirsiniz; orada kapsam sınırlaması yoktur."
      },
      {
        q: 'Geçmiş sinyalleri nereden görebilirim?',
        a: "Günlük Tespitler sayfasının 'Geçmiş' sekmesinde son 30 günlük taramaların tümünü, sinyal puanları ve sonraki 5 günlük fiyat performansıyla birlikte görebilirsiniz. Algoritma Performans sayfasında ise haftalık ve aylık bazda sinyal isabet oranları, ortalama getiri ve risk-getiri metrikleri yer alır. Sinyal geçmişi serbest planda son 7 günle, ücretli planlarda 90 güne kadar geriye uzanır."
      }
    ]
  },
  {
    title: 'Teknik Sorunlar',
    items: [
      {
        q: 'Sayfa açılmıyor, ne yapmalıyım?',
        a: "Önce tarayıcı cache'inizi temizleyin (Ctrl+F5 ile sert yenileme) ve farklı bir tarayıcı deneyin (Chrome, Firefox veya Edge'in güncel sürümü). VPN, ad-blocker veya tarayıcı eklentilerini geçici olarak kapatıp tekrar deneyin. Sorun devam ediyorsa hata mesajının ekran görüntüsünü, tarayıcı türünü/sürümünü ve işletim sisteminizi belirterek info@borsakrali.com adresine yazın. Çoğu sayfa sorunu cache veya eklenti kaynaklıdır."
      },
      {
        q: 'Mobilde sorun var, ne önerirsiniz?',
        a: "Web uygulamamız mobil tarayıcılarda çalışır; en iyi deneyim için Chrome veya Safari'nin güncel sürümünü kullanın. Resmi Android uygulamamız Google Play üzerinden indirilebilir; iOS sürümü hazırlık aşamasındadır. Mobilde grafik gecikmesi, dokunma gecikmesi veya layout sorunu yaşıyorsanız cihaz modeli, işletim sistemi sürümü ve tarayıcı/uygulama sürümünü belirterek bize bildirin. Böylece sorunu hızla yeniden üretebiliriz."
      },
      {
        q: 'Bildirim gelmiyor, nasıl çözerim?',
        a: "Mobilde bildirim almak için önce cihaz ayarlarından Borsa Krali uygulamasına bildirim izni verildiğinden emin olun. Web tarayıcısında ise adres çubuğu solundaki kilit ikonundan bildirim iznini 'İzin Ver' yapın. Hesap ayarlarınızdan bildirim tercihlerinizi (günlük sinyal, fiyat alarmı, haber) ayrı ayrı açabilirsiniz. iOS Safari şu an web push'u tam desteklemediğinden uygulamayı indirmenizi öneririz."
      },
      {
        q: 'Push bildirimi nasıl aktif edilir?',
        a: "Sayfanın sağ alt köşesindeki istemci üzerinden bildirim iznini onaylayın. Ardından hesap ayarlarınızdan hangi tür bildirimleri almak istediğinizi (günlük taramalar 09:55 ve 11:00, fiyat seviyesi alarmları, ekonomik takvim hatırlatmaları) seçin. Tarayıcı izni daha önce reddettiyseniz adres çubuğu sol tarafındaki kilit ikonuna tıklayıp izni 'İzin Ver' olarak güncelleyebilirsiniz. Test bildirimi ile doğrulama yapabilirsiniz."
      }
    ]
  },
  {
    title: 'KVKK ve Gizlilik',
    items: [
      {
        q: 'Verilerim nasıl korunuyor?',
        a: "Tüm kullanıcı verileri (e-posta, şifre hash, abonelik bilgileri) şifrelenmiş şekilde saklanır; şifreler bcrypt algoritması ile geri alınamaz biçimde hash'lenir. Sunucularımız Avrupa lokasyonunda barındırılır, TLS 1.3 ile şifreli iletişim zorunludur. Yedekleme, denetim ve erişim kayıtları KVKK ve GDPR uyumludur. Detaylı bilgi için Gizlilik Politikamızı inceleyebilir veya bize doğrudan yazabilirsiniz."
      },
      {
        q: 'Hangi çerezler kullanılıyor?',
        a: "Sitemizde üç tür çerez bulunur: zorunlu çerezler (oturum yönetimi, güvenlik), analitik çerezler (anonim sayfa ziyaret istatistikleri, tercih edilen tema) ve reklam çerezleri (Google AdSense - onay sonrası). Zorunlu çerezler kullanım için gereklidir, diğerlerini ilk girişinizdeki çerez tercihi pop-up'ı üzerinden seçebilir veya istediğiniz zaman değiştirebilirsiniz. Detaylı liste Çerez Politikamızda mevcuttur."
      },
      {
        q: 'Reklam tercihlerimi nasıl değiştiririm?',
        a: "Reklam tercihlerinizi profil > Gizlilik bölümünden yönetebilirsiniz. Kişiselleştirilmiş reklamları kapatabilir, üçüncü taraf izleme çerezlerini reddedebilir veya tüm reklamları premium aboneliğinizle tamamen kaldırabilirsiniz. Google AdSense reklamları için tercihlerinizi adssettings.google.com adresinden de düzenleyebilirsiniz. Tarayıcınızdan 'Do Not Track' sinyali gönderirseniz tarafımızca da saygı gösterilir."
      }
    ]
  }
]

const SOCIAL_LINKS = [
  {
    name: 'Twitter / X',
    icon: Twitter,
    url: '#',
    description: 'Günlük piyasa yorumları, hızlı sinyal duyuruları ve seans içinde canlı yorumlar.'
  },
  {
    name: 'Instagram',
    icon: Instagram,
    url: '#',
    description: 'Görsel piyasa özetleri, infografikler, story formatında kısa eğitim içerikleri.'
  },
  {
    name: 'YouTube',
    icon: Youtube,
    url: '#',
    description: 'Detaylı teknik analiz videoları, sinyal değerlendirmeleri ve başlangıç seviyesi eğitim serisi.'
  },
  {
    name: 'LinkedIn',
    icon: Linkedin,
    url: '#',
    description: 'Kurumsal duyurular, yatırım sektörü makaleleri ve iş birliği fırsatları.'
  }
]

export default function Iletisim() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('Genel')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('')
  const [openFaq, setOpenFaq] = useState(null)

  const toggleFaq = (id) => setOpenFaq((prev) => (prev === id ? null : id))

  const handleSubmit = (e) => {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus('error')
      setErrorMsg('Lütfen ad, e-posta ve mesaj alanlarını doldurun.')
      return
    }

    try {
      const body = `Ad Soyad: ${name}\nE-posta: ${email}\nKonu: ${subject}\n\n${message}`
      const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[İletişim] ' + subject)}&body=${encodeURIComponent(body)}`
      window.location.href = mailto
      setStatus('sent')
      setMessage('')
    } catch (err) {
      setStatus('error')
      setErrorMsg('Mesaj gönderilemedi. Lütfen doğrudan ' + SUPPORT_EMAIL + ' veya ' + SECONDARY_EMAIL + ' adresine yazın.')
    }
  }

  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3 text-sm text-gold-400 hover:text-gold-300">
            <BrandMark size="sm" />
            Borsa Krali
          </Link>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link to="/hakkimizda" className="text-gray-400 hover:text-white">Hakkımızda</Link>
            <Link to="/privacy-policy" className="text-gray-400 hover:text-white">Gizlilik</Link>
            <Link to="/terms-of-use" className="text-gray-400 hover:text-white">Kullanım Koşulları</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <div className="mb-8 space-y-3">
            <p className="text-sm font-medium text-gold-400">İletişim</p>
            <h1 className="text-3xl font-bold text-white">Bize Ulaşın</h1>
            <p className="max-w-3xl text-sm leading-7 text-gray-300">
              Sorularınız, öneriler, hata bildirimleri ve iş birliği talepleri için bize aşağıdaki formdan
              veya doğrudan e-posta yoluyla ulaşabilirsiniz. Tüm mesajlar 1-2 iş günü içinde yanıtlanır.
            </p>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Mail className="h-5 w-5" />
              </div>
              <h2 className="mb-1 text-sm font-semibold text-white">E-posta</h2>
              <div className="space-y-1">
                <a href={`mailto:${SUPPORT_EMAIL}`} className="block text-sm text-gold-400 hover:underline">
                  {SUPPORT_EMAIL}
                </a>
                <a href={`mailto:${SECONDARY_EMAIL}`} className="block text-sm text-gold-400 hover:underline">
                  {SECONDARY_EMAIL}
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Globe className="h-5 w-5" />
              </div>
              <h2 className="mb-1 text-sm font-semibold text-white">Web</h2>
              <p className="text-sm text-gray-300">borsakrali.com</p>
            </div>

            <div className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Clock className="h-5 w-5" />
              </div>
              <h2 className="mb-1 text-sm font-semibold text-white">Cevap Süresi</h2>
              <p className="text-sm text-gray-300">1-2 iş günü</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-gray-300">Ad Soyad</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/40 px-4 py-3 text-white outline-none transition focus:border-gold-500"
                  placeholder="Adınız Soyadınız"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-gray-300">E-posta</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/40 px-4 py-3 text-white outline-none transition focus:border-gold-500"
                  placeholder="ornek@mail.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-300">Konu</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/40 px-4 py-3 text-white outline-none transition focus:border-gold-500"
              >
                <option>Genel</option>
                <option>Hata Bildirimi</option>
                <option>Özellik Önerisi</option>
                <option>Abonelik / Ödeme</option>
                <option>Reklam / İş Birliği</option>
                <option>KVKK / Gizlilik</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-300">Mesajınız</label>
              <textarea
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/40 px-4 py-3 text-white outline-none transition focus:border-gold-500"
                placeholder="Bize iletmek istediğiniz konuyu kısa ve açık şekilde yazın..."
                required
              />
            </div>

            {status === 'error' && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {status === 'sent' && (
              <div className="flex items-start gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>E-posta uygulamanız açıldı. Mesajı göndermeyi unutmayın.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-gold-500 to-gold-600 px-4 py-3 font-semibold text-dark-950 transition hover:from-gold-400 hover:to-gold-500 disabled:opacity-60"
            >
              {status === 'sending' ? (
                <>
                  <Send className="h-4 w-4 animate-pulse" /> Gönderiliyor...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4" /> Mesaj Gönder
                </>
              )}
            </button>

            <p className="text-center text-xs text-gray-500">
              Form gönderildiğinde varsayılan e-posta uygulamanız açılır. Sorun yaşarsanız doğrudan{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold-400 hover:underline">
                {SUPPORT_EMAIL}
              </a>{' '}
              veya{' '}
              <a href={`mailto:${SECONDARY_EMAIL}`} className="text-gold-400 hover:underline">
                {SECONDARY_EMAIL}
              </a>{' '}
              adresine yazabilirsiniz.
            </p>
          </form>

        </div>

        <section className="mt-8 rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <h2 className="mb-2 text-2xl font-bold text-white">Bize Ulaşmadan Önce</h2>
          <p className="mb-6 text-sm leading-6 text-gray-400">
            Talebinizi hızla çözmemiz için önce aşağıdaki noktalara dikkat etmenizi rica ediyoruz.
            Bu basit adımlar destek süreleri kısaltır ve doğrudan ihtiyaç duyduğunuz sonuca ulaşmanızı sağlar.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {PRECONTACT_TIPS.map((tip, idx) => {
              const Icon = tip.icon
              return (
                <div key={idx} className="rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-semibold text-white">{tip.title}</h3>
                  <p className="text-sm leading-6 text-gray-300">{tip.text}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <h2 className="mb-2 text-2xl font-bold text-white">Çalışma Saatleri ve Yanıt Süresi</h2>
          <p className="mb-6 text-sm leading-6 text-gray-400">
            Destek ekibimiz aşağıdaki saatler arasında aktif olarak mesajları yanıtlar.
            Ortalama yanıt süreleri tahminidir ve günlük talep yoğunluğuna göre kısa sapmalar gösterebilir.
            Acil teknik konularda hafta sonu da sınırlı bir kadromuz dahili kontroller yapar.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Calendar className="h-5 w-5" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-white">Hafta İçi</h3>
              <p className="mb-1 text-2xl font-bold text-gold-400">09:00 - 18:00</p>
              <p className="text-xs leading-5 text-gray-400">
                TSI (Türkiye Saati). Pazartesi - Cuma. Resmi tatiller ve dini bayramlarda mesai yapılmaz; mesajlar ertesi iş günü sırayla yanıtlanır.
              </p>
            </div>
            <div className="rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-white">Hafta Sonu</h3>
              <p className="mb-1 text-2xl font-bold text-gold-400">10:00 - 16:00</p>
              <p className="text-xs leading-5 text-gray-400">
                Cumartesi ve Pazar günleri. Sınırlı bir kadroyla yalnızca acil teknik konular ve sistemsel kesintiler öncelikli olarak değerlendirilir.
              </p>
            </div>
            <div className="rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Hourglass className="h-5 w-5" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-white">Ortalama Yanıt</h3>
              <p className="mb-1 text-base font-semibold text-gold-400">Hafta içi 4-8 saat</p>
              <p className="text-xs leading-5 text-gray-400">
                Hafta sonu gelen mesajlar 24 saat içinde yanıtlanır. Konu başlığı netse ve gerekli detaylar eklenmişse cevap süresi belirgin şekilde kısalır.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <h2 className="mb-2 text-2xl font-bold text-white">Sıkça Sorulan Sorular</h2>
          <p className="mb-6 text-sm leading-6 text-gray-400">
            En çok aldığımız soruları kategori bazında topladık. Aradığınızı bulamadıysanız yukarıdaki formdan veya
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold-400 hover:underline"> {SUPPORT_EMAIL}</a> adresinden bize ulaşabilirsiniz.
          </p>
          <div className="space-y-8">
            {FAQ_CATEGORIES.map((cat, catIdx) => (
              <div key={catIdx}>
                <h3 className="mb-3 text-lg font-semibold text-gold-400">{cat.title}</h3>
                <div className="space-y-2">
                  {cat.items.map((item, itemIdx) => {
                    const id = `${catIdx}-${itemIdx}`
                    const isOpen = openFaq === id
                    return (
                      <div key={id} className="overflow-hidden rounded-2xl border border-gold-500/20 bg-dark-900/40">
                        <button
                          type="button"
                          onClick={() => toggleFaq(id)}
                          aria-expanded={isOpen}
                          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium text-white transition hover:text-gold-400"
                        >
                          <span>{item.q}</span>
                          {isOpen ? (
                            <ChevronUp className="h-4 w-4 flex-shrink-0 text-gold-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                          )}
                        </button>
                        {isOpen && (
                          <div className="border-t border-gold-500/10 px-5 py-4 text-sm leading-7 text-gray-300">
                            {item.a}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <h2 className="mb-2 text-2xl font-bold text-white">Sosyal Medya</h2>
          <p className="mb-6 text-sm leading-6 text-gray-400">
            Bizi sosyal medyada takip ederek günlük piyasa yorumlarını, hızlı duyuruları ve eğitim içeriğini
            kaçırmadan takip edebilirsiniz. Aşağıdaki kanallar önümüzdeki haftalarda aktif edilecektir.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIAL_LINKS.map((social) => {
              const Icon = social.icon
              return (
                <a
                  key={social.name}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-4 rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5 transition hover:border-gold-500/50 hover:bg-dark-900/60"
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="mb-1 text-base font-semibold text-white">{social.name}</h3>
                    <p className="text-xs leading-5 text-gray-400">{social.description}</p>
                  </div>
                </a>
              )
            })}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <h2 className="mb-2 text-2xl font-bold text-white">Kurumsal Bilgi</h2>
          <p className="mb-6 text-sm leading-6 text-gray-400">
            Yasal ve kurumsal bilgiler aşağıda özetlenmiştir. Ek dokümantasyon için Gizlilik Politikası ve Kullanım Koşulları sayfalarını inceleyebilirsiniz.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <Building2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-400" />
              <div>
                <h3 className="mb-1 text-sm font-semibold text-white">Marka</h3>
                <p className="text-sm leading-6 text-gray-300">Borsa Krali</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-400" />
              <div>
                <h3 className="mb-1 text-sm font-semibold text-white">Hizmet Adresi</h3>
                <p className="text-sm leading-6 text-gray-300">Türkiye - Online hizmet</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <Briefcase className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-400" />
              <div>
                <h3 className="mb-1 text-sm font-semibold text-white">Faaliyet Konusu</h3>
                <p className="text-sm leading-6 text-gray-300">Borsa analiz ve eğitim platformu (web ve mobil)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <ScrollText className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-400" />
              <div>
                <h3 className="mb-1 text-sm font-semibold text-white">Yasal Statü</h3>
                <p className="text-sm leading-6 text-gray-300">
                  Yatırım danışmanlık kuruluşu DEĞİLDİR. SPK lisanslı aracılık veya portföy yönetimi hizmeti sunmaz; sunduğumuz tüm analizler bilgilendirme amaçlıdır.
                </p>
              </div>
            </div>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-gray-500">Son güncelleme: 10 Mayıs 2026</p>
      </div>
    </div>
  )
}
