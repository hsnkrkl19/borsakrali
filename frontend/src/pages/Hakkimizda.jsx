import { Link } from 'react-router-dom'
import {
  Crown, Target, Activity, Building2, ShieldCheck, BookOpen, Mail,
  Layers, Users, Sparkles, HelpCircle, Rocket, GraduationCap,
  TrendingUp, Briefcase, Zap, BadgeCheck, Brain, BarChart3,
  Wallet, Smartphone,
} from 'lucide-react'
import BrandMark from '../components/BrandMark'

const features = [
  {
    icon: Activity,
    title: 'Canlı Piyasa Verileri',
    body: 'BIST 100, BIST 30, sektör performans haritaları ve canlı heatmap ile piyasanın genel resmini tek ekranda görüyorsunuz.',
  },
  {
    icon: Target,
    title: 'Günlük AI Sinyalleri',
    body: '09:55 öncesi taranan BIST100 hisseleri için 16 koşullu universal skorlama. Üst 10 sinyal mobil bildirimle iletilir.',
  },
  {
    icon: Building2,
    title: 'Şirket ve Mali Tablo Analizi',
    body: 'Bilanço, gelir tablosu, nakit akımı, oranlar ve KAP özetleri ile temel analiz; AI Skor ile sentez.',
  },
  {
    icon: BookOpen,
    title: 'Tarayıcılar ve Stratejiler',
    body: 'EMA34, Malaysian SNR, Pivot ve daha fazlası — kendi stratejinizi tarama merkezinde çalıştırabilirsiniz.',
  },
  {
    icon: ShieldCheck,
    title: 'Eğitim Odaklı',
    body: 'Tüm özellikler analiz ve eğitim için sunulur. Yatırım tavsiyesi vermeyiz; karar her zaman kullanıcınındır.',
  },
]

const audiences = [
  {
    icon: GraduationCap,
    title: 'Yeni Başlayanlar',
    body: 'Borsaya yeni adım atan yatırımcılar için Borsa Krali, karmaşık finans teorilerini sade ve görsel hale getirir. Heatmap renk tonları ile sektör performansı anlık görülüyor; tek tıkla istediğiniz hissenin teknik ve temel göstergelerine erişebiliyorsunuz. AI Skor\'un nasıl hesaplandığı sayfanın alt kısmında adım adım açıklanır. Eğitim odaklı yapısı sayesinde her sinyal, neden o sonucu üretti açıkça gösterilir. Terim sözlüğü ve gösterge anlatımları ile teori ve pratiği birlikte öğrenebiliyorsunuz; gerçek piyasaya hazırlıksız çıkmazsınız.',
  },
  {
    icon: TrendingUp,
    title: 'Aktif Yatırımcılar',
    body: 'Günde 5-20 işlem yapan aktif yatırımcılar için Borsa Krali zaman tasarrufu sağlar. Sabah 09:55\'te gelen sinyal taraması, gün içinde fırsat kollayan hisseleri otomatik listeler. Malaysian SNR ile destek-direnç bölgelerini, EMA34 ile trend yönünü ve Pivot hesaplamaları ile günlük hedef seviyeleri ayrı ayrı taranabiliyor. Hızlı arama, watchlist, gerçek zamanlı fiyat akışı ve mobil push bildirimler ile fırsatları kaçırmadan takip edebilirsiniz; her şey tek bir kokpitte toplanıyor.',
  },
  {
    icon: Briefcase,
    title: 'Profesyoneller',
    body: 'Portföy yöneticileri, finansal analistler ve kurumsal yatırımcılar için Borsa Krali; mali tablo, oran analizleri ve KAP haberleri konusunda uzman dostu bir arayüz sunar. Bilanço, gelir tablosu ve nakit akışı karşılaştırmalı olarak yan yana görüntülenir; F/K, PD/DD, ROE, ROIC, brüt kar marjı gibi 30\'dan fazla oran tek panelde toplanır. Algoritma performans takibi ile geçmiş sinyallerin getiri istatistikleri saydam şekilde sunulur; CSV indirme ve API erişimi premium planlarda mevcuttur.',
  },
  {
    icon: BookOpen,
    title: 'Eğitim Alanlar',
    body: 'Öğrenciler, finansal okuryazarlık kursları ve borsa eğitimi alan herkes için Borsa Krali, gerçek piyasa verileri üzerinde çalışma olanağı sunar. Yeni Başlayanlar Akademisi, gösterge sözlüğü, terim açıklamaları ve sinyal mantığı anlatım sayfaları ile teori ve pratik birlikte gelir. Çalışma kayıtlarınızı finansal notlar bölümünde tutabilir, hangi hisseyi neden incelediğinizi yazarak öğrenme sürecinizi yapılandırabilirsiniz. Ücretsiz plan kapsamında günde 5 hisse derinlemesine analizine erişilir.',
  },
]

const differentiators = [
  {
    icon: Zap,
    title: 'Gerçek Zamanlı Veri Akışı',
    body: 'Çoğu ücretsiz platform 15-20 dakika gecikmeli veri sunarken, Borsa Krali aktif işlem saatlerinde Yahoo Finance bağlantısı üzerinden mum verilerini ortalama 30-60 saniye gecikme ile güncellemektedir. Heatmap, watchlist ve hisse detay sayfalarındaki fiyatlar WebSocket bildirimleri ile arka planda sürekli yenilenir. Sayfayı manuel tazelemenize gerek yok; piyasa hareket ederken ekranınız da hareket eder. Hızlı yatırım kararları için saniyelerin önemli olduğu bir ortamda kritik avantaj sağlar.',
  },
  {
    icon: BadgeCheck,
    title: 'Kural Bazlı, Saydam Sinyal',
    body: 'Borsa Krali\'da hiçbir sinyal kara kutu değildir. Tüm sinyaller, 16 belirli teknik koşulun mantık kapıları ile birleştirilmesinden üretilir; her sinyalin yanında neden verildiği adım adım açıklanır. Bir hisseye 12/16 puan verildiyse hangi 12 koşulun sağlandığını, hangi 4 koşulun sağlanmadığını görebilirsiniz. Bu saydamlık, kullanıcının sinyal mantığını anlayıp kendi karar sürecine entegre etmesini sağlar; sihir yerine matematik vardır, her hesap geri izlenebilir ve doğrulanabilir.',
  },
  {
    icon: Brain,
    title: 'AI Destekli Skor Sistemi',
    body: 'Sinyal motorunun yanında her hisseye 0-100 aralığında bir AI Skor verilmektedir. Bu skor; teknik göstergeler, mali oranlar, momentum, sektör performansı ve haber yoğunluğu faktörlerinin ağırlıklandırılmış toplamının sonucudur. Skor zaman içinde geriye doğru saklanır, kullanıcı son 30 günlük skor değişimini çizgi grafikte takip edebilir. Yapay zeka burada karar verici değil, yardımcı bir asistan olarak rol alır; nihai karar her zaman kullanıcınındır.',
  },
  {
    icon: BarChart3,
    title: 'Kapsamlı Mali Tablo Arşivi',
    body: 'Çoğu kullanıcı dostu platform yalnızca son çeyrek bilançosunu gösterirken, Borsa Krali son 5 yıla ait tüm bilanço, gelir tablosu ve nakit akışı tablolarını karşılaştırmalı olarak sunmaktadır. Yıllık ve çeyreklik görünüm arasında tek tıkla geçiliyor; F/K, PD/DD, ROE, ROIC ve brüt kar marjı gibi temel oranlar otomatik olarak hesaplanıp trend çizgisinde gösterilir. KAP duyuruları mali tablolarla entegre, özet halinde üst kısımda yer alır.',
  },
  {
    icon: Wallet,
    title: 'Ücretsiz Başlangıç Planı',
    body: 'Kredi kartı gerektirmeden kayıt olabilir, günde 5 hisse analizine kadar tamamen ücretsiz kullanabilirsiniz. Tarama merkezi, heatmap ve dashboard tüm kullanıcılar için sınırsız açıktır. Yalnızca yoğun kullanım gerektiren özellikler (sınırsız analiz, gerçek zamanlı sinyal bildirimleri, özel taramalar) için aylık 50 TL\'den başlayan planlar mevcuttur. Lifetime plan tek seferlik 1500 TL ile ömürlük erişim sunar; tekrar tekrar abonelik yenilemekle uğraşmak zorunda değilsiniz.',
  },
  {
    icon: Smartphone,
    title: 'Mobil Uyumlu ve Native Uygulama',
    body: 'Web arayüzü, telefon ve tablet ekranlarında eksiksiz çalışır; tüm sayfalar 320 piksel genişliğinden itibaren optimize edilmiştir. Bunun yanında Android için native paketlenmiş APK uygulamamız (Borsa Krali v3) push bildirim desteği, offline görünüm ve daha hızlı başlangıç süresi sunar. APK, Google Play dışından doğrudan platform üzerinden indirilebilmektedir. iOS native versiyonu yol haritamızda yer almaktadır; bu sırede iPhone kullanıcıları Safari üzerinden web siteyi ana ekrana ekleyebilir.',
  },
]

const faqs = [
  {
    q: 'Borsa Krali ücretsiz mi?',
    a: 'Evet, Borsa Krali\'nin temel özellikleri tamamen ücretsizdir. Kayıt sonrası günde 5 hisse derinlemesine analizi, sınırsız heatmap görüntüleme, BIST100 sinyallerinin günlük özeti ve eğitim içeriği hiçbir ücret talep edilmeden alınabilir. Daha yoğun kullanım, gerçek zamanlı bildirim, sınırsız analiz ve gelişmiş tarayıcılar için aylık 50 TL Starter, 300 TL Pro veya tek seferlik 1500 TL Lifetime planları sunulmaktadır. Hiçbir plan otomatik yenilenmez; istediğiniz zaman iptal edebilir, plan yükseltebilir veya düşürebilirsiniz.',
  },
  {
    q: 'Sinyaller ne kadar güvenilir?',
    a: 'Sinyaller saydam ve kural bazlıdır; ancak geleceği garanti etmez. 16 teknik koşulun geçmiş test sonuçları Algoritma Performans sayfasında yayınlanır; 30 günlük hit oranları, ortalama getiri ve maksimum drawdown gibi metrikler açıktır. Yüksek skor, hissenin yükseleceği anlamına gelmez; yalnızca teknik koşulların uygun olduğu noktayı gösterir. Borsa yapısı gereği her zaman beklenmedik haber, makro veri veya manipülasyon olabilir. Sinyalleri kendi araştırmanız ve risk yönetiminizle birlikte değerlendirmeniz önemlidir.',
  },
  {
    q: 'Hangi hisseler taranır?',
    a: 'Sabah 09:55 ve 11:00 revize taraması BIST100 endeksindeki tüm hisseleri kapsar. Bunun dışında manuel arama ile BIST\'te işlem gören her hissenin teknik ve temel analizine erişebilirsiniz; bu listede 500\'den fazla şirket yer alır. Sektör heatmap\'inde BIST30 ağırlıklı temsil edilir. Tarama merkezinde Malaysian SNR, EMA34, Pivot ve diğer özel tarayıcılar BIST100 evreni üzerinde çalışır. Yarı mamul hisseler, varantlar ve VIOP kontratları şu an için kapsam dışındadır.',
  },
  {
    q: 'Veriler ne sıkında güncellenir?',
    a: 'Fiyat ve hacim verileri Yahoo Finance API\'si üzerinden ortalama 30-60 saniye gecikme ile güncellenir; aktif işlem saatlerinde heatmap ve watchlist canlı akıştadır. Mali tablolar her çeyreklik bilanço açıklamasında KAP\'tan otomatik olarak çekilir, en geç 24 saat içinde sisteme yansır. Sinyal motoru her sabah 09:55, 11:00 revize ve gün içinde saat başı tekrar çalışır. Algoritma performans verileri her gün T+1 olarak güncellenir; yani bugünün sinyallerinin sonucu yarın sabah görüntülenir.',
  },
  {
    q: 'Yatırım tavsiyesi mi veriyorsunuz?',
    a: 'Hayır, kesinlikle hayır. Borsa Krali bir yatırım danışmanlık kuruluşu değildir; SPK lisanslı yatırım danışmanı da değildir. Platform üzerinden sunulan tüm analizler, sinyaller, skorlar ve yorumlar yalnızca eğitim ve bilgi amaçlı sunulmaktadır. Hiçbir gösterim "al" veya "sat" tavsiyesi olarak yorumlanmamalı, kişisel yatırım kararlarınızın yerine geçmemelidir. Yatırım kararlarınızdan doğan tüm kar veya zarardan tamamen siz sorumlusunuz. Önemli kararlardan önce SPK lisanslı bir profesyonele başvurmanız önerilir.',
  },
  {
    q: 'Mobil uygulama var mı?',
    a: 'Evet, Android için native paketlenmiş APK uygulamamız mevcuttur. APK 3.9 MB boyutunda olup borsakrali.com üzerinden direkt indirilebilir; Google Play Store onay süreci devam etmektedir. Web sitesinin tüm özelliklerine ek olarak push bildirim desteği, offline heatmap önbelleği ve daha hızlı başlangıç süresi sunar. iOS native uygulaması yol haritamızda 2026 üçüncü çeyreği için planlanmıştır; bu sırede iPhone kullanıcıları Safari üzerinden web siteyi ana ekrana ekleyerek uygulama benzeri deneyim yaşayabilir.',
  },
  {
    q: 'Hesabım güvenli mi?',
    a: 'Hesap güvenliğini ciddiye alıyoruz. Tüm veri trafiği HTTPS üzerinden şifrelenir, şifreler bcrypt algoritması ile hash\'lenerek saklanır, asla düz metin olarak tutulmaz. Cloudflare WAF kötüye kullanım ve DDoS girişimlerini filtreler. İki faktörlü kimlik doğrulama (2FA) yol haritamızda 2026 yılı için planlanmıştır. Hiçbir kullanıcının kart bilgisi sunucuda tutulmaz; ödemeler PCI-DSS sertifikalı ödeme sağlayıcıları üzerinden geçirilir. Şifrenizi unutursanız e-posta üzerinden sıfırlama akışını kullanabilirsiniz.',
  },
  {
    q: 'KAP verileri ne kadar gerideki?',
    a: 'KAP duyuruları ve mali tablolar açıklanma anından itibaren genellikle 5-15 dakika içinde sistemimize yansır; otomatik bir cron iş süresi her saat KAP RSS yayınını takip eder. Önemli özel durum açıklamaları (kar payı, çağrı, ortaklık değişikliği) yatırımcının günlük takip listesinde işaretlenir. Bilanço açıklamaları ise genellikle açıklamadan 1-2 saat içinde şirket sayfasında görüntülenmeye başlar. Tarihsel KAP arşivi son 5 yılı kapsamaktadır; daha eski kayıtlar için KAP\'ın resmi sitesini ziyaret edebilirsiniz.',
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
            <Link to="/iletisim" className="text-gray-400 hover:text-white">İletişim</Link>
            <Link to="/privacy-policy" className="text-gray-400 hover:text-white">Gizlilik</Link>
            <Link to="/terms-of-use" className="text-gray-400 hover:text-white">Kullanım Koşulları</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <div className="mb-8 space-y-3">
            <p className="text-sm font-medium text-gold-400">Hakkımızda</p>
            <h1 className="text-3xl font-bold text-white">Borsa Krali Nedir?</h1>
            <p className="max-w-3xl text-sm leading-7 text-gray-300">
              Borsa Krali; Borsa İstanbul yatırımcıları için geliştirilmiş premium analiz platformudur.
              Canlı piyasa verileri, kural bazlı AI sinyalleri, mali tablo incelemeleri, tarayıcılar ve
              eğitim içerikleri tek bir uygulamada birleştirilmiştir. Amacımız bireysel yatırımcının,
              kurumsal seviyede araçlara hızlı ve sade bir arayüzle erişmesini sağlamaktır.
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
              Yatırım kararlarının verisel ve kural bazlı temellere dayanması gerektiğine inanıyoruz.
              Borsa Krali; karmaşık finansal kavramları sade görüntülere dönüştürerek, hem yeni başlayan
              hem de tecrübeli yatırımcının piyasayı daha hızlı okumasına yardımcı olur.
            </p>
          </section>

          <section className="mb-6 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <Layers className="h-5 w-5 text-gold-400" />
              Borsa Krali Nasıl Çalışır?
            </h2>
            <div className="space-y-4 text-sm leading-7 text-gray-300">
              <p>
                Borsa Krali, modern bir teknik altyapı üzerine kurulmuştur. Sistem; React 18 ve Vite
                tabanlı hızlı bir ön yüz, Node.js ile Express üzerinde çalışan veri katmanı, Yahoo Finance
                ve KAP gibi güvenilir kaynaklardan beslenen veri hatları ve gerçek zamanlı WebSocket
                bildirimleri üzerinden işlemektedir. Açılan her sayfa, arka planda paralel çağrılarla BIST
                hisselerinin son fiyat, hacim, günlük değişim, teknik gösterge ve mali tablo verilerini
                çeker; sonuçları önbellekte tutar ve kullanıcıya milisaniyeler içinde sunar.
              </p>
              <p>
                Sinyal motoru her sabah 09:55 öncesi BIST100 evreni üzerinde 16 farklı teknik koşulu
                çalıştırır. RSI, MACD, EMA34, hacim oranları, günlük swing yapısı ve hareketli ortalamalar
                gibi göstergelerin her biri sağlandığında artırı 1 puan getirir. Toplam puana göre hisseler
                sıralanır, en yüksek skoru alan üst 10 hisse mobil bildirim olarak iletilir. 11:00 revize
                taraması ile açılış sonrası durum tekrar değerlendirilir; gün içi saat başı yapılan
                otomatik refresh ile yeni fırsatlar atlanmaz.
              </p>
              <p>
                Tarama sonuçları, hisse detay sayfaları ve heatmap görüntüleri için akıllı önbellekleme
                kullanıyoruz. Sık istenen veriler 5 dakikalık önbellekte tutulurken, fiyat hareketleri
                kullanıcının ekranında sürekli olarak güncellenir. Böylece hem dış API gereksiz çağrılarla
                yorulmaz hem de kullanıcı akışkan bir deneyim yaşar. Tüm karmaşık hesaplamalar, EMA
                ortalamaları, MACD sinyal hattı hesabı ve oran karşılaştırmaları sunucu tarafında
                yapılır; tarayıcınızı yormaz.
              </p>
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <Users className="h-5 w-5 text-gold-400" />
              Kimler İçin Tasarlandı?
            </h2>
            <p className="mb-4 text-sm leading-6 text-gray-400">
              Borsa Krali farklı yatırımcı profilleri düşünülerek tasarlandı. Hangi kitleye nasıl hitap
              ettiğini aşağıdaki kartlarda inceleyebilirsiniz.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {audiences.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border border-white/5 bg-dark-950/40 p-4">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-gold-500/15 text-gold-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-semibold text-white">{title}</h3>
                  <p className="text-sm leading-6 text-gray-300">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <Sparkles className="h-5 w-5 text-gold-400" />
              Bizi Diğer Platformlardan Ayıran 6 Özellik
            </h2>
            <p className="mb-4 text-sm leading-6 text-gray-400">
              Türkiye&apos;de onlarca borsa platformu var; ancak Borsa Krali şu 6 noktada belirgin
              şekilde farklılaşır.
            </p>
            <div className="space-y-4">
              {differentiators.map(({ icon: Icon, title, body }, idx) => (
                <div key={title} className="flex gap-4 rounded-xl border border-white/5 bg-dark-950/40 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-500/15 text-gold-400">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-1 text-base font-semibold text-white">
                      {idx + 1}. {title}
                    </h3>
                    <p className="text-sm leading-6 text-gray-300">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <HelpCircle className="h-5 w-5 text-gold-400" />
              Sıkça Sorulan Sorular
            </h2>
            <p className="mb-4 text-sm leading-6 text-gray-400">
              Kullanıcılarımızdan en çok aldığımız sorular ve cevapları. Daha fazla soru için iletişim
              sayfasına yönelebilirsiniz.
            </p>
            <div className="space-y-3">
              {faqs.map(({ q, a }) => (
                <details
                  key={q}
                  className="group rounded-xl border border-white/5 bg-dark-950/40 p-4 open:bg-dark-950/60"
                >
                  <summary className="cursor-pointer list-none text-sm font-semibold text-gold-300 group-open:mb-3">
                    {q}
                  </summary>
                  <p className="text-sm leading-6 text-gray-300">{a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <Rocket className="h-5 w-5 text-gold-400" />
              Sürekli Gelişen Bir Platform
            </h2>
            <div className="space-y-4 text-sm leading-7 text-gray-300">
              <p>
                Borsa Krali sabit bir ürün değil, sürekli evrilen bir platformdur. 2026 yılının ilk
                yarısında v3.0 sürümü ile abonelik sistemi, finansal notlar, ekonomik takvim, Malaysian
                SNR tarayıcısı ve istek paneli devreye alındı. v4.0 ile günlük sinyal sistemi 16 koşullu
                universal skorlama, 11:00 revize taraması ve gün içi otomatik refresh ile yenilendi.
                Algoritma performans sayfası T+1 sinyal sonucu yayını ile saydamlaştı. AdSense
                entegrasyonu, gizlilik politikası yenilemesi ve çerez onayı gibi yasal çerçeve
                güncellemeleri tamamlandı.
              </p>
              <p>
                Yol haritamızda sırada bekleyenler: portföy takip modülü (kar/zarar grafikleri, ortalama
                maliyet hesabı, ileride otomatik vergi hesabı), iki faktörlü kimlik doğrulama, iOS native
                uygulaması, Telegram bot entegrasyonu, kullanıcı tanımlı sinyal alarmları ve gelişmiş
                backtest motoru. 2026 üçüncü çeyreğine kadar Türk yatırımcılar için haftalık makro analiz
                bültenleri ve yapay zeka destekli sektör raporları açılacak; Avrupa ve ABD piyasaları
                entegrasyonu da uzun vadeli planlar arasındadır.
              </p>
              <p>
                Kullanıcılarımızdan gelen geri bildirimleri İstek Paneli üzerinde topluyor, oy verme
                sistemi ile en çok talep gören özellikleri önce geliştiriyoruz. Yorumlarınız ve
                önerileriniz doğrudan ürün yolunu şekillendirmektedir; gelişme süreklidir, durmaz.
              </p>
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="mb-2 text-lg font-semibold text-white">Veri Kaynakları</h2>
            <p className="text-sm leading-7 text-gray-300">
              Fiyat, hacim, mali tablo ve haber verileri Yahoo Finance, KAP ve diğer lisanslı üçüncü taraf
              kaynaklardan toplanır. Veriler küçük gecikmelerle iletilebilir; kritik kararlardan önce
              resmi BIST kaynaklarının teyit edilmesi önerilir.
            </p>
          </section>

          <section className="mb-6 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="mb-2 text-lg font-semibold text-white">Yasal Uyarı</h2>
            <p className="text-sm leading-7 text-gray-300">
              Borsa Krali bir yatırım danışmanlık kuruluşu değildir. Platform üzerinden sunulan analizler,
              sinyaller ve skorlar yatırım tavsiyesi niteliği taşımaz; yalnızca eğitim ve bilgi amaçlı sunulur.
              Yatırım kararlarınızdan doğan sonuçlardan tamamen siz sorumlusunuz.
            </p>
          </section>

          <section className="rounded-2xl border border-gold-500/20 bg-gold-500/5 p-5">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-white">
              <Mail className="h-5 w-5 text-gold-400" />
              İletişim
            </h2>
            <p className="text-sm leading-7 text-gray-300">
              Geri bildirim, iş birliği veya destek talepleriniz için{' '}
              <a href="mailto:info@borsakrali.com" className="text-gold-400 underline-offset-2 hover:underline">
                info@borsakrali.com
              </a>{' '}
              veya{' '}
              <a href="mailto:hsnkrkl19@gmail.com" className="text-gold-400 underline-offset-2 hover:underline">
                hsnkrkl19@gmail.com
              </a>{' '}
              adresine ulaşabilirsiniz. Ayrıntılı form için{' '}
              <Link to="/iletisim" className="text-gold-400 underline-offset-2 hover:underline">
                iletişim sayfasını
              </Link>{' '}
              ziyaret edebilirsiniz.
            </p>
          </section>

          <p className="mt-8 text-xs text-gray-500">Son güncelleme: 9 Mayıs 2026</p>
        </div>
      </div>
    </div>
  )
}
