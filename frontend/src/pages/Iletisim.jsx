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
    title: "SSS'lerimize Bakin",
    text: "Sorunuzun cevabi muhtemelen asagidaki Sikca Sorulan Sorular bolumundedir. Hesap, abonelik, veri ve sinyaller, teknik sorunlar ile KVKK basliklari altinda 20'den fazla soruyu detayli sekilde cevapladik. Once orada arama yapmaniz hem zaman kazandirir hem de cogu durumda anlik cozum sunar."
  },
  {
    icon: Bug,
    title: "Hata Bildiriminde Detay Verin",
    text: "Bir hata bildiriyorsaniz lutfen tarayici turu ve surumunu, isletim sistemini, cihaz modelini ve hatanin alindigi sayfanin tam adresini ekleyin. Mumkunse ekran goruntusu veya kisa bir ekran kaydi paylasin. Bu detaylar sorunu yeniden uretip cozmemizi cok hizlandirir; aksi halde gereksiz mesajlasma kaybi yasariz."
  },
  {
    icon: FileText,
    title: "Konu Basligini Net Yazin",
    text: "Mesajinizin konu basligi gondermek istediginiz icerigi acikca ozetlemelidir; ornegin 'Yardim' yerine 'Premium abonelikten Lifetime plana gecis fiyati' gibi yazmak daha hizli yonlendirme saglar. Boylece talep dogru ekibe (teknik, abonelik veya KVKK) iletilir ve cevap suresi onemli olcude kisalir."
  },
  {
    icon: ShieldAlert,
    title: "Spam ve Otomatik Mesaj Gondermeyin",
    text: "Toplu, otomatik veya yapay zeka ile uretilmis, gercek bir destek talebi icermeyen mesajlar incelenmeden reddedilir. Ayni mesaji birden fazla kanaldan ayni anda gondermek talebinizi yavaslatir. Tek bir kanaldan acik ve net mesajla yazmaniz hem size hem de bize zaman kazandirir."
  }
]

const FAQ_CATEGORIES = [
  {
    title: 'Hesap ve Uyelik',
    items: [
      {
        q: 'Hesap acmak ucretsiz mi?',
        a: "Evet, Borsa Krali'nda temel hesap acmak tamamen ucretsizdir. Ucretsiz uyelik ile gunluk sinirli sayida tarama yapabilir, dashboard ozetini gorebilir ve temel piyasa verilerine erisebilirsiniz. Ileri seviye sinyaller, sinirsiz tarama ve premium modulleri kullanmak isterseniz abonelik planlarimizi inceleyebilirsiniz. Kayit icin sadece gecerli bir e-posta adresi yeterlidir; kredi karti istemiyoruz."
      },
      {
        q: 'Sifremi unuttum, ne yapmaliyim?',
        a: "Giris ekranindaki 'Sifremi Unuttum' baglantisina tikladiginizda kayitli e-posta adresinize sifre sifirlama linki gonderilir. Bu link 60 dakika gecerlidir. E-postayi alamadiysaniz spam veya promosyonlar klasorunu kontrol edip birkac dakika bekleyerek tekrar deneyin. Sorun devam ederse info@borsakrali.com adresinden bizimle iletisime gecip kayitli e-postanizi belirtin; manuel sifirlama yapariz."
      },
      {
        q: 'E-posta dogrulama mesaji gelmedi?',
        a: "E-posta dogrulama mesaji genellikle birkac saniye icinde inbox'a duser. Gelmediyse oncelikle spam, gereksiz veya promosyonlar klasorunu inceleyin. Yine yoksa profil sayfanizdaki 'Tekrar Gonder' butonu ile yeni bir dogrulama mesaji isteyebilirsiniz. Bazi e-posta saglayicilari geciktirme uygular; 10 dakika icinde gelmemesi durumunda destek ekibimize yazip kontrol talep edebilirsiniz."
      },
      {
        q: 'Hesabimi nasil silerim?',
        a: "Hesabinizi tamamen kapatmak icin profil sayfasinda 'Hesabi Sil' bolumunu kullanabilirsiniz. KVKK kapsaminda silme talebiniz en gec 30 gun icinde islenir; tum kullanici verileriniz, abonelik kayitlari ve gecmis sinyal bildirimleri silinir. Aktif aboneliginiz varsa once iptal etmeniz onerilir. Silme talebinizi info@borsakrali.com adresine de yazabilirsiniz; her durumda kimlik dogrulamasi yaparak sureci yurutuyoruz."
      },
      {
        q: 'Profil bilgilerimi nasil degistiririm?',
        a: "Profil sayfasindan ad, soyad, e-posta adresi, sifre ve bildirim tercihlerini guncelleyebilirsiniz. E-posta degisikligi yeni adrese gonderilen dogrulama linki ile tamamlanir. Sifre degisikligi icin mevcut sifrenizi girmeniz gerekir. Profil resmi su an icin desteklenmemekte olup roadmap'imizdedir. Hizmet sartlari geregi takma ad yerine gercek isim kullanmanizi tavsiye ederiz; bu hem fatura hem yasal yazismalar icin gereklidir."
      }
    ]
  },
  {
    title: 'Abonelik ve Odeme',
    items: [
      {
        q: 'Hangi abonelik planlari sunuluyor?',
        a: "Su anda 6 farkli plan sunuyoruz: Free (ucretsiz), Starter Aylik (50 TL/ay), Pro Aylik (300 TL/ay), Elite Tek Seferlik (50 TL), Premium Tek Seferlik (150 TL) ve Lifetime (1500 TL bir defaya mahsus). Her plan farkli kota ve ozellik kombinasyonu sunar. Detayli karsilastirma icin /abonelik sayfamizi ziyaret edebilirsiniz. Lifetime plan sahipleri ileride eklenecek tum yeni ozelliklere otomatik dahil olur."
      },
      {
        q: 'Iade ve cayma hakki var mi?',
        a: "Aylik abonelikler ilk 7 gun icinde, aktif kullanim olmamasi sartiyla iade edilebilir. Tek seferlik ve Lifetime planlar icin iade hakki, 6502 sayili Tuketicinin Korunmasi Hakkinda Kanun kapsaminda dijital hizmet alimi geregi 14 gun cayma hakkiyla sinirlidir; kullanim baslamissa iade kabul edilmez. Iade talepleriniz icin info@borsakrali.com adresinden basvurabilirsiniz; talebiniz 7 is gunu icinde cevaplanir."
      },
      {
        q: 'Fatura nasil aliyorum?',
        a: "Tum odemeleriniz icin elektronik fatura kayitli e-posta adresinize otomatik gonderilir. Sirket adina fatura kesilmesini istiyorsaniz odeme oncesinde profil sayfanizda vergi bilgilerinizi (sirket unvani, vergi dairesi, vergi numarasi, adres) doldurmaniz yeterlidir. Gecmis faturalar profil > Faturalarim sekmesinden istediginiz zaman PDF olarak indirilebilir. Fatura ile ilgili sorunlariniz icin destek ekibimize yazip duzeltme talep edebilirsiniz."
      },
      {
        q: 'Aboneligimi nasil iptal ederim?',
        a: "Aylik aboneliginizi profil > Abonelik sekmesinden tek tikla iptal edebilirsiniz. Iptal sonrasi mevcut donemin sonuna kadar premium ozellikleri kullanmaya devam edersiniz; otomatik yenileme durdurulur. Tek seferlik ve Lifetime planlar dogalari geregi iptal edilemez ancak hesap silme talep ederek tum kayitlarinizi kaldirabilirsiniz. Iptal sonrasi geri donus istediginizde ayni planla tekrar abone olabilirsiniz."
      },
      {
        q: 'Hangi odeme yontemleri kabul ediliyor?',
        a: "Kredi karti, banka karti ve havale/EFT ile odeme alabiliyoruz. Tum kart islemleri 3D Secure altyapisiyla yapilir ve kart bilgileriniz tarafimizda saklanmaz; PCI-DSS uyumlu odeme saglayicimiza dogrudan iletilir. Havale/EFT secen kullanicilarimiz icin abonelik aktivasyonu odeme bildirimi sonrasi 1 is gunu icinde gerceklesir. Apple Pay ve Google Pay entegrasyonu yakinda devreye girecek; gelistirme roadmap'imizdedir."
      }
    ]
  },
  {
    title: 'Veri ve Sinyaller',
    items: [
      {
        q: 'Veriler ne kadar gecikmeli geliyor?',
        a: "Hisse senedi fiyat verileri yaklasik 15 dakika gecikmelidir; bu sure Borsa Istanbul'un veri lisansi politikasi geregidir. Endeks verileri (BIST100, BIST30) genellikle 1-2 dakika icinde guncellenir. Bilanco, finansal tablolar ve oran verileri kuponlu sirketler icin yayim sonrasi 24 saat icinde sisteme islenir. Anlik veriye ihtiyaciniz varsa lutfen aracikuruluk platformunuzu kullanin; bizim hizmetimiz analiz odaklidir."
      },
      {
        q: 'Sinyaller hangi mantikla uretiliyor?',
        a: "Sinyallerimiz 16 farkli teknik ve temel kosulu degerlendirip puanlandiran cok faktorlu bir algoritma ile uretilir. Hareketli ortalamalar, momentum gostergeleri (RSI, MACD), hacim teyidi, destek-direnc kirilimlari, formasyonlar ve Malezya SNR olcumleri katki saglar. Her hisse 0-16 araliginda puanlanir; gunluk taramada en yuksek puanli ilk 10 sinyal yayinlanir. Detayli aciklama /gunluk-tespitler sayfasinda mevcuttur."
      },
      {
        q: 'Neden bir hisse tarananlar arasinda yok?',
        a: "Tarama BIST100 ve secili BIST30 evreniyle sinirlidir. Eger ilgi duydugunuz hisse bu evrenlerden birinde degilse otomatik taramaya dahil olmaz. Ayrica likit olmayan, ozsermayesi yetersiz veya BIST tarafindan SPK yaptirimi uygulanmis hisseler veri kalitesi acisindan filtrelenir. Hisseyi manuel olarak Teknik Analiz AI sayfasindan arayarak detayli analiz alabilirsiniz; orada kapsam sinirlamasi yoktur."
      },
      {
        q: 'Gecmis sinyalleri nereden gorebilirim?',
        a: "Gunluk Tespitler sayfasinin 'Gecmis' sekmesinde son 30 gunluk taramalarin tumunu, sinyal puanlari ve sonraki 5 gunluk fiyat performansiyla birlikte gorebilirsiniz. Algoritma Performans sayfasinda ise haftalik ve aylik bazda sinyal isabet oranlari, ortalama getiri ve risk-getiri metrikleri yer alir. Sinyal gecmisi serbest planda son 7 gunle, ucretli planlarda 90 gune kadar geriye uzanir."
      }
    ]
  },
  {
    title: 'Teknik Sorunlar',
    items: [
      {
        q: 'Sayfa acilmiyor, ne yapmaliyim?',
        a: "Once tarayici cache'inizi temizleyin (Ctrl+F5 ile sert yenileme) ve farkli bir tarayici deneyin (Chrome, Firefox veya Edge'in guncel surumu). VPN, ad-blocker veya tarayici eklentilerini gecici olarak kapatip tekrar deneyin. Sorun devam ediyorsa hata mesajinin ekran goruntusunu, tarayici turunu/surumunu ve isletim sisteminizi belirterek info@borsakrali.com adresine yazin. Cogu sayfa sorunu cache veya eklenti kaynaklidir."
      },
      {
        q: 'Mobilde sorun var, ne onerirsiniz?',
        a: "Web uygulamamiz mobil tarayicilarda calisir; en iyi deneyim icin Chrome veya Safari'nin guncel surumunu kullanin. Resmi Android uygulamamiz Google Play uzerinden indirilebilir; iOS surumu hazirlik asamasindadir. Mobilde grafik gecikmesi, dokunma gecikmesi veya layout sorunu yasiyorsaniz cihaz modeli, isletim sistemi surumu ve tarayici/uygulama surumunu belirterek bize bildirin. Boylece sorunu hizla yeniden uretebiliriz."
      },
      {
        q: 'Bildirim gelmiyor, nasil cozerim?',
        a: "Mobilde bildirim almak icin once cihaz ayarlarindan Borsa Krali uygulamasina bildirim izni verildiginden emin olun. Web tarayicisinda ise adres cubugu solundaki kilit ikonundan bildirim iznini 'Izin Ver' yapin. Hesap ayarlarinizdan bildirim tercihlerinizi (gunluk sinyal, fiyat alarmi, haber) ayri ayri acabilirsiniz. iOS Safari su an web push'u tam desteklemediginden uygulamayi indirmenizi oneririz."
      },
      {
        q: 'Push bildirimi nasil aktif edilir?',
        a: "Sayfanin sag alt kosesindeki istemci uzerinden bildirim iznini onaylayin. Ardindan hesap ayarlarinizdan hangi tur bildirimleri almak istediginizi (gunluk taramalar 09:55 ve 11:00, fiyat seviyesi alarmlari, ekonomik takvim hatirlatmalari) secin. Tarayici izni daha once reddettiyseniz adres cubugu sol tarafindaki kilit ikonuna tiklayip izni 'Izin Ver' olarak guncelleyebilirsiniz. Test bildirimi ile dogrulama yapabilirsiniz."
      }
    ]
  },
  {
    title: 'KVKK ve Gizlilik',
    items: [
      {
        q: 'Verilerim nasil korunuyor?',
        a: "Tum kullanici verileri (e-posta, sifre hash, abonelik bilgileri) sifrelenmis sekilde saklanir; sifreler bcrypt algoritmasi ile geri alinamaz bicimde hash'lenir. Sunucularimiz Avrupa lokasyonunda barindirilir, TLS 1.3 ile sifreli iletisim zorunludur. Yedekleme, denetim ve erisim kayitlari KVKK ve GDPR uyumludur. Detayli bilgi icin Gizlilik Politikamizi inceleyebilir veya bize dogrudan yazabilirsiniz."
      },
      {
        q: 'Hangi cerezler kullaniliyor?',
        a: "Sitemizde uc tur cerez bulunur: zorunlu cerezler (oturum yonetimi, guvenlik), analitik cerezler (anonim sayfa ziyaret istatistikleri, tercih edilen tema) ve reklam cerezleri (Google AdSense - onay sonrasi). Zorunlu cerezler kullanim icin gereklidir, digerlerini ilk girisinizdeki cerez tercihi pop-up'i uzerinden secebilir veya istediginiz zaman degistirebilirsiniz. Detayli liste Cerez Politikamizda mevcuttur."
      },
      {
        q: 'Reklam tercihlerimi nasil degistiririm?',
        a: "Reklam tercihlerinizi profil > Gizlilik bolumunden yonetebilirsiniz. Kisisellestirilmis reklamlari kapatabilir, ucuncu taraf izleme cerezlerini reddedebilir veya tum reklamlari premium aboneliginizle tamamen kaldirabilirsiniz. Google AdSense reklamlari icin tercihlerinizi adssettings.google.com adresinden de duzenleyebilirsiniz. Tarayicinizdan 'Do Not Track' sinyali gonderirseniz tarafimizca da saygi gosterilir."
      }
    ]
  }
]

const SOCIAL_LINKS = [
  {
    name: 'Twitter / X',
    icon: Twitter,
    url: '#',
    description: 'Gunluk piyasa yorumlari, hizli sinyal duyurulari ve seans icinde canli yorumlar.'
  },
  {
    name: 'Instagram',
    icon: Instagram,
    url: '#',
    description: 'Gorsel piyasa ozetleri, infografikler, story formatinda kisa egitim icerikleri.'
  },
  {
    name: 'YouTube',
    icon: Youtube,
    url: '#',
    description: 'Detayli teknik analiz videolari, sinyal degerlendirmeleri ve baslangic seviyesi egitim serisi.'
  },
  {
    name: 'LinkedIn',
    icon: Linkedin,
    url: '#',
    description: 'Kurumsal duyurular, yatirim sektoru makaleleri ve is birligi firsatlari.'
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
      setErrorMsg('Lutfen ad, e-posta ve mesaj alanlarini doldurun.')
      return
    }

    try {
      const body = `Ad Soyad: ${name}\nE-posta: ${email}\nKonu: ${subject}\n\n${message}`
      const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[Iletisim] ' + subject)}&body=${encodeURIComponent(body)}`
      window.location.href = mailto
      setStatus('sent')
      setMessage('')
    } catch (err) {
      setStatus('error')
      setErrorMsg('Mesaj gonderilemedi. Lutfen dogrudan ' + SUPPORT_EMAIL + ' veya ' + SECONDARY_EMAIL + ' adresine yazin.')
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
            <Link to="/hakkimizda" className="text-gray-400 hover:text-white">Hakkimizda</Link>
            <Link to="/privacy-policy" className="text-gray-400 hover:text-white">Gizlilik</Link>
            <Link to="/terms-of-use" className="text-gray-400 hover:text-white">Kullanim Kosullari</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <div className="mb-8 space-y-3">
            <p className="text-sm font-medium text-gold-400">Iletisim</p>
            <h1 className="text-3xl font-bold text-white">Bize Ulasin</h1>
            <p className="max-w-3xl text-sm leading-7 text-gray-300">
              Sorulariniz, oneriler, hata bildirimleri ve is birligi talepleri icin bize asagidaki formdan
              veya dogrudan e-posta yoluyla ulasabilirsiniz. Tum mesajlar 1-2 is gunu icinde yanitlanir.
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
              <h2 className="mb-1 text-sm font-semibold text-white">Cevap Suresi</h2>
              <p className="text-sm text-gray-300">1-2 is gunu</p>
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
                  placeholder="Adiniz Soyadiniz"
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
                <option>Ozellik Onerisi</option>
                <option>Abonelik / Odeme</option>
                <option>Reklam / Is Birligi</option>
                <option>KVKK / Gizlilik</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-300">Mesajiniz</label>
              <textarea
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/40 px-4 py-3 text-white outline-none transition focus:border-gold-500"
                placeholder="Bize iletmek istediginiz konuyu kisa ve acik sekilde yazin..."
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
                <span>E-posta uygulamaniz acildi. Mesaji gondermeyi unutmayin.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-gold-500 to-gold-600 px-4 py-3 font-semibold text-dark-950 transition hover:from-gold-400 hover:to-gold-500 disabled:opacity-60"
            >
              {status === 'sending' ? (
                <>
                  <Send className="h-4 w-4 animate-pulse" /> Gonderiliyor...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4" /> Mesaj Gonder
                </>
              )}
            </button>

            <p className="text-center text-xs text-gray-500">
              Form gonderildiginde varsayilan e-posta uygulamaniz acilir. Sorun yasarsaniz dogrudan{' '}
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
          <h2 className="mb-2 text-2xl font-bold text-white">Bize Ulasmadan Once</h2>
          <p className="mb-6 text-sm leading-6 text-gray-400">
            Talebinizi hizla cozmemiz icin once asagidaki noktalara dikkat etmenizi rica ediyoruz.
            Bu basit adimlar destek sureleri kisaltir ve dogrudan ihtiyac duydugunuz sonuca ulasmanizi saglar.
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
          <h2 className="mb-2 text-2xl font-bold text-white">Calisma Saatleri ve Yanit Suresi</h2>
          <p className="mb-6 text-sm leading-6 text-gray-400">
            Destek ekibimiz asagidaki saatler arasinda aktif olarak mesajlari yanitlar.
            Ortalama yanit sureleri tahminidir ve gunluk talep yoguluguna gore kisa sapmalar gosterebilir.
            Acil teknik konularda hafta sonu da sinirli bir kadromuz dahili kontroller yapar.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Calendar className="h-5 w-5" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-white">Hafta Ici</h3>
              <p className="mb-1 text-2xl font-bold text-gold-400">09:00 - 18:00</p>
              <p className="text-xs leading-5 text-gray-400">
                TSI (Turkiye Saati). Pazartesi - Cuma. Resmi tatiller ve dini bayramlarda mesai yapilmaz; mesajlar ertesi is gunu sirayla yanitlanir.
              </p>
            </div>
            <div className="rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-white">Hafta Sonu</h3>
              <p className="mb-1 text-2xl font-bold text-gold-400">10:00 - 16:00</p>
              <p className="text-xs leading-5 text-gray-400">
                Cumartesi ve Pazar gunleri. Sinirli bir kadroyla yalnizca acil teknik konular ve sistemsel kesintiler oncelikli olarak degerlendirilir.
              </p>
            </div>
            <div className="rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Hourglass className="h-5 w-5" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-white">Ortalama Yanit</h3>
              <p className="mb-1 text-base font-semibold text-gold-400">Hafta ici 4-8 saat</p>
              <p className="text-xs leading-5 text-gray-400">
                Hafta sonu gelen mesajlar 24 saat icinde yanitlanir. Konu basligi netse ve gerekli detaylar eklenmisse cevap suresi belirgin sekilde kisalir.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <h2 className="mb-2 text-2xl font-bold text-white">Sikca Sorulan Sorular</h2>
          <p className="mb-6 text-sm leading-6 text-gray-400">
            En cok aldigimiz sorulari kategori bazinda topladik. Aradiginizi bulamadiysaniz yukaridaki formdan veya
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold-400 hover:underline"> {SUPPORT_EMAIL}</a> adresinden bize ulasabilirsiniz.
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
            Bizi sosyal medyada takip ederek gunluk piyasa yorumlarini, hizli duyurulari ve egitim icerigini
            kacirmadan takip edebilirsiniz. Asagidaki kanallar onumuzdeki haftalarda aktif edilecektir.
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
            Yasal ve kurumsal bilgiler asagida ozetlenmistir. Ek dokumantasyon icin Gizlilik Politikasi ve Kullanim Kosullari sayfalarini inceleyebilirsiniz.
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
                <p className="text-sm leading-6 text-gray-300">Turkiye - Online hizmet</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <Briefcase className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-400" />
              <div>
                <h3 className="mb-1 text-sm font-semibold text-white">Faaliyet Konusu</h3>
                <p className="text-sm leading-6 text-gray-300">Borsa analiz ve egitim platformu (web ve mobil)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-gold-500/20 bg-dark-900/40 p-5">
              <ScrollText className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-400" />
              <div>
                <h3 className="mb-1 text-sm font-semibold text-white">Yasal Statu</h3>
                <p className="text-sm leading-6 text-gray-300">
                  Yatirim danismanlik kurulusu DEGILDIR. SPK lisansli aracilik veya portfoy yonetimi hizmeti sunmaz; sundugumuz tum analizler bilgilendirme amaclidir.
                </p>
              </div>
            </div>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-gray-500">Son guncelleme: 10 Mayis 2026</p>
      </div>
    </div>
  )
}
