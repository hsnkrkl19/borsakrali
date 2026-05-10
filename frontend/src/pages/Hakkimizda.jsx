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

const audiences = [
  {
    icon: GraduationCap,
    title: 'Yeni Baslayanlar',
    body: 'Borsaya yeni adim atan yatirimcilar icin Borsa Krali, karmasik finans teorilerini sade ve gorsel hale getirir. Heatmap renk tonlari ile sektor performansi anlik goruluyor; tek tikla istediginiz hissenin teknik ve temel gostergelerine erisebiliyorsunuz. AI Skor\'un nasil hesaplandigi sayfanin alt kisminda adim adim aciklanir. Egitim odakli yapisi sayesinde her sinyal, neden o sonucu uretti acikca gosterilir. Terim sozlugu ve gosterge anlatimlari ile teori ve pratigi birlikte ogrenebiliyorsunuz; gercek piyasaya hazirliksiz cikmazsiniz.',
  },
  {
    icon: TrendingUp,
    title: 'Aktif Yatirimcilar',
    body: 'Gunde 5-20 islem yapan aktif yatirimcilar icin Borsa Krali zaman tasarrufu saglar. Sabah 09:55\'te gelen sinyal taramasi, gun icinde firsat kollayan hisseleri otomatik listeler. Malaysian SNR ile destek-direnc bolgelerini, EMA34 ile trend yonunu ve Pivot hesaplamalari ile gunluk hedef seviyeleri ayri ayri taranabiliyor. Hizli arama, watchlist, gercek zamanli fiyat akisi ve mobil push bildirimler ile firsatlari kacirmadan takip edebilirsiniz; her sey tek bir kokpitte toplaniyor.',
  },
  {
    icon: Briefcase,
    title: 'Profesyoneller',
    body: 'Portfoy yoneticileri, finansal analistler ve kurumsal yatirimcilar icin Borsa Krali; mali tablo, oran analizleri ve KAP haberleri konusunda uzman dostu bir arayuz sunar. Bilanco, gelir tablosu ve nakit akisi karsilastirmali olarak yan yana goruntulenir; F/K, PD/DD, ROE, ROIC, brut kar marji gibi 30\'dan fazla oran tek panelde toplanir. Algoritma performans takibi ile gecmis sinyallerin getiri istatistikleri saydam sekilde sunulur; CSV indirme ve API erisimi premium planlarda mevcuttur.',
  },
  {
    icon: BookOpen,
    title: 'Egitim Alanlar',
    body: 'Ogrenciler, finansal okuryazarlik kurslari ve borsa egitimi alan herkes icin Borsa Krali, gercek piyasa verileri uzerinde calisma olanagi sunar. Yeni Baslayanlar Akademisi, gosterge sozlugu, terim aciklamalari ve sinyal mantigi anlatim sayfalari ile teori ve pratik birlikte gelir. Calisma kayitlarinizi finansal notlar bolumunde tutabilir, hangi hisseyi neden inceledginizi yazarak ogrenme surecinizi yapilandirabilirsiniz. Ucretsiz plan kapsaminda gunde 5 hisse derinlemesine analizine erisilir.',
  },
]

const differentiators = [
  {
    icon: Zap,
    title: 'Gercek Zamanli Veri Akisi',
    body: 'Cogu ucretsiz platform 15-20 dakika gecikmeli veri sunarken, Borsa Krali aktif islem saatlerinde Yahoo Finance baglantisi uzerinden mum verilerini ortalama 30-60 saniye gecikme ile guncellemektedir. Heatmap, watchlist ve hisse detay sayfalarindaki fiyatlar WebSocket bildirimleri ile arka planda surekli yenilenir. Sayfayi manuel tazelemenize gerek yok; piyasa hareket ederken ekraniniz da hareket eder. Hizli yatirim kararlari icin saniyelerin onemli oldugu bir ortamda kritik avantaj saglar.',
  },
  {
    icon: BadgeCheck,
    title: 'Kural Bazli, Saydam Sinyal',
    body: 'Borsa Krali\'da hicbir sinyal kara kutu degildir. Tum sinyaller, 16 belirli teknik kosulun mantik kapilari ile birlestirilmesinden uretilir; her sinyalin yaninda neden verildigi adim adim aciklanir. Bir hisseye 12/16 puan verildiyse hangi 12 kosulun saglandigini, hangi 4 kosulun saglanmadigini gorebilirsiniz. Bu saydamlik, kullanicinin sinyal mantigini anlayip kendi karar surecine entegre etmesini saglar; sihir yerine matematik vardir, her hesap geri izlenebilir ve dogrulanabilir.',
  },
  {
    icon: Brain,
    title: 'AI Destekli Skor Sistemi',
    body: 'Sinyal motorunun yaninda her hisseye 0-100 araliginda bir AI Skor verilmektedir. Bu skor; teknik gostergeler, mali oranlar, momentum, sektor performansi ve haber yogunlugu faktorlerinin agirliklandirilmis toplaminin sonucudur. Skor zaman icinde geriye dogru saklanir, kullanici son 30 gunluk skor degisimini cizgi grafikte takip edebilir. Yapay zeka burada karar verici degil, yardimci bir asistan olarak rol alir; nihai karar her zaman kullanicinindir.',
  },
  {
    icon: BarChart3,
    title: 'Kapsamli Mali Tablo Arsivi',
    body: 'Cogu kullanici dostu platform yalnizca son ceyrek bilancosunu gosterirken, Borsa Krali son 5 yila ait tum bilanco, gelir tablosu ve nakit akisi tablolarini karsilastirmali olarak sunmaktadir. Yillik ve ceyreklik gorunum arasinda tek tikla geciliyor; F/K, PD/DD, ROE, ROIC ve brut kar marji gibi temel oranlar otomatik olarak hesaplanip trend cizgisinde gosterilir. KAP duyurulari mali tablolarla entegre, ozet halinde ust kismda yer alir.',
  },
  {
    icon: Wallet,
    title: 'Ucretsiz Baslangic Plani',
    body: 'Kredi karti gerektirmeden kayit olabilir, gunde 5 hisse analizine kadar tamamen ucretsiz kullanabilirsiniz. Tarama merkezi, heatmap ve dashboard tum kullanicilar icin sinirsiz aciktir. Yalnizca yogun kullanim gerektiren ozellikler (sinirsiz analiz, gercek zamanli sinyal bildirimleri, ozel taramalar) icin aylik 50 TL\'den baslayan planlar mevcuttur. Lifetime plan tek seferlik 1500 TL ile omurluk erisim sunar; tekrar tekrar abonelik yenilemekle ugrasmak zorunda degilsiniz.',
  },
  {
    icon: Smartphone,
    title: 'Mobil Uyumlu ve Native Uygulama',
    body: 'Web arayuzu, telefon ve tablet ekranlarinda eksiksiz calisir; tum sayfalar 320 piksel genisliginden itibaren optimize edilmistir. Bunun yaninda Android icin native paketlenmis APK uygulamamiz (Borsa Krali v3) push bildirim destegi, offline gorunum ve daha hizli baslangic suresi sunar. APK, Google Play disindan dogrudan platform uzerinden indirilebilmektedir. iOS native versiyonu yol haritamizda yer almaktadir; bu sirede iPhone kullanicilari Safari uzerinden web siteyi ana ekrana ekleyebilir.',
  },
]

const faqs = [
  {
    q: 'Borsa Krali ucretsiz mi?',
    a: 'Evet, Borsa Krali\'nin temel ozellikleri tamamen ucretsizdir. Kayit sonrasi gunde 5 hisse derinlemesine analizi, sinirsiz heatmap goruntuleme, BIST100 sinyallerinin gunluk ozeti ve egitim icerigi hicbir ucret talep edilmeden alinabilir. Daha yogun kullanim, gercek zamanli bildirim, sinirsiz analiz ve gelismis tarayicilar icin aylik 50 TL Starter, 300 TL Pro veya tek seferlik 1500 TL Lifetime planlari sunulmaktadir. Hicbir plan otomatik yenilenmez; istediginiz zaman iptal edebilir, plan yukseltebilir veya dusurebilirsiniz.',
  },
  {
    q: 'Sinyaller ne kadar guvenilir?',
    a: 'Sinyaller saydam ve kural bazlidir; ancak gelecegi garanti etmez. 16 teknik kosulun gecmis test sonuclari Algoritma Performans sayfasinda yayinlanir; 30 gunluk hit oranlari, ortalama getiri ve maksimum drawdown gibi metrikler aciktir. Yuksek skor, hissenin yukselecegi anlamina gelmez; yalnizca teknik kosullarin uygun oldugu noktayi gosterir. Borsa yapisi geregi her zaman beklenmedik haber, makro veri veya manipulasyon olabilir. Sinyalleri kendi arastirmaniz ve risk yonetiminizle birlikte degerlendirmeniz onemlidir.',
  },
  {
    q: 'Hangi hisseler taranir?',
    a: 'Sabah 09:55 ve 11:00 revize taramasi BIST100 endeksindeki tum hisseleri kapsar. Bunun disinda manuel arama ile BIST\'te islem goren her hissenin teknik ve temel analizine erisebilirsiniz; bu listede 500\'den fazla sirket yer alir. Sektor heatmap\'inde BIST30 agirlikli temsil edilir. Tarama merkezinde Malaysian SNR, EMA34, Pivot ve diger ozel tarayicilar BIST100 evreni uzerinde calisir. Yari mamul hisseler, varantlar ve VIOP kontratlari su an icin kapsam disindadir.',
  },
  {
    q: 'Veriler ne sikinda guncellenir?',
    a: 'Fiyat ve hacim verileri Yahoo Finance API\'si uzerinden ortalama 30-60 saniye gecikme ile guncellenir; aktif islem saatlerinde heatmap ve watchlist canli akistadir. Mali tablolar her ceyreklik bilanco aciklamasinda KAP\'tan otomatik olarak cekilir, en gec 24 saat icinde sisteme yansir. Sinyal motoru her sabah 09:55, 11:00 revize ve gun icinde saat basi tekrar calisir. Algoritma performans verileri her gun T+1 olarak guncellenir; yani bugunun sinyallerinin sonucu yarin sabah goruntulenir.',
  },
  {
    q: 'Yatirim tavsiyesi mi veriyorsunuz?',
    a: 'Hayir, kesinlikle hayir. Borsa Krali bir yatirim danismanlik kurulusu degildir; SPK lisansli yatirim danismani da degildir. Platform uzerinden sunulan tum analizler, sinyaller, skorlar ve yorumlar yalnizca egitim ve bilgi amacli sunulmaktadir. Hicbir gosterim "al" veya "sat" tavsiyesi olarak yorumlanmamali, kisisel yatirim kararlarinizin yerine gecmemelidir. Yatirim kararlarinizdan dogan tum kar veya zarardan tamamen siz sorumlusunuz. Onemli kararlardan once SPK lisansli bir profesyonele basvurmaniz onerilir.',
  },
  {
    q: 'Mobil uygulama var mi?',
    a: 'Evet, Android icin native paketlenmis APK uygulamamiz mevcuttur. APK 3.9 MB boyutunda olup borsakrali.com uzerinden direkt indirilebilir; Google Play Store onay sureci devam etmektedir. Web sitesinin tum ozelliklerine ek olarak push bildirim destegi, offline heatmap onbellegi ve daha hizli baslangic suresi sunar. iOS native uygulamasi yol haritamizda 2026 ucuncu ceyregi icin planlanmistir; bu sirede iPhone kullanicilari Safari uzerinden web siteyi ana ekrana ekleyerek uygulama benzeri deneyim yasayabilir.',
  },
  {
    q: 'Hesabim guvenli mi?',
    a: 'Hesap guvenligini ciddiye aliyoruz. Tum veri trafigi HTTPS uzerinden sifrelenir, sifreler bcrypt algoritmasi ile hash\'lenerek saklanir, asla duz metin olarak tutulmaz. Cloudflare WAF kotuye kullanim ve DDoS girisimlerini filtreler. Iki faktorlu kimlik dogrulama (2FA) yol haritamizda 2026 yili icin planlanmistir. Hicbir kullanicinin kart bilgisi sunucuda tutulmaz; odemeler PCI-DSS sertifikali odeme saglayicilari uzerinden gecirilir. Sifrenizi unutursaniz e-posta uzerinden sifirlama akisini kullanabilirsiniz.',
  },
  {
    q: 'KAP verileri ne kadar gerideki?',
    a: 'KAP duyurulari ve mali tablolar aciklanma anindan itibaren genellikle 5-15 dakika icinde sistemimize yansir; otomatik bir cron is suresi her saat KAP RSS yayinini takip eder. Onemli ozel durum aciklamalari (kar payi, cagri, ortaklik degisikligi) yatirimcinin gunluk takip listesinde isaretlenir. Bilanco aciklamalari ise genellikle aciklamadan 1-2 saat icinde sirket sayfasinda goruntulenmeye baslar. Tarihsel KAP arsivi son 5 yili kapsamaktadir; daha eski kayitlar icin KAP\'in resmi sitesini ziyaret edebilirsiniz.',
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
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <Layers className="h-5 w-5 text-gold-400" />
              Borsa Krali Nasil Calisir?
            </h2>
            <div className="space-y-4 text-sm leading-7 text-gray-300">
              <p>
                Borsa Krali, modern bir teknik altyapi uzerine kurulmustur. Sistem; React 18 ve Vite
                tabanli hizli bir on yuz, Node.js ile Express uzerinde calisan veri katmani, Yahoo Finance
                ve KAP gibi guvenilir kaynaklardan beslenen veri hatlari ve gercek zamanli WebSocket
                bildirimleri uzerinden islemektedir. Acilan her sayfa, arka planda paralel cagrilarla BIST
                hisselerinin son fiyat, hacim, gunluk degisim, teknik gosterge ve mali tablo verilerini
                ceker; sonuclari onbellekte tutar ve kullaniciya milisaniyeler icinde sunar.
              </p>
              <p>
                Sinyal motoru her sabah 09:55 oncesi BIST100 evreni uzerinde 16 farkli teknik kosulu
                calistirir. RSI, MACD, EMA34, hacim oranlari, gunluk swing yapisi ve hareketli ortalamalar
                gibi gostergelerin her biri saglandiginda artiri 1 puan getirir. Toplam puana gore hisseler
                siralanir, en yuksek skoru alan ust 10 hisse mobil bildirim olarak iletilir. 11:00 revize
                taramasi ile acilis sonrasi durum tekrar degerlendirilir; gun ici saat basi yapilan
                otomatik refresh ile yeni firsatlar atlanmaz.
              </p>
              <p>
                Tarama sonuclari, hisse detay sayfalari ve heatmap goruntuleri icin akilli onbellekleme
                kullaniyoruz. Sik istenen veriler 5 dakikalik onbellekte tutulurken, fiyat hareketleri
                kullanicinin ekraninda surekli olarak guncellenir. Boylece hem dis API gereksiz cagrilarla
                yorulmaz hem de kullanici akiskan bir deneyim yasar. Tum karmasik hesaplamalar, EMA
                ortalamalari, MACD sinyal hatti hesabi ve oran karsilastirmalari sunucu tarafinda
                yapilir; tarayicinizi yormaz.
              </p>
            </div>
          </section>

          <section className="mb-6 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-white">
              <Users className="h-5 w-5 text-gold-400" />
              Kimler Icin Tasarlandi?
            </h2>
            <p className="mb-4 text-sm leading-6 text-gray-400">
              Borsa Krali farkli yatirimci profilleri dusunulerek tasarlandi. Hangi kitleye nasil hitap
              ettigini asagidaki kartlarda inceleyebilirsiniz.
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
              Bizi Diger Platformlardan Ayiran 6 Ozellik
            </h2>
            <p className="mb-4 text-sm leading-6 text-gray-400">
              Turkiye&apos;de onlarca borsa platformu var; ancak Borsa Krali su 6 noktada belirgin
              sekilde farklilasir.
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
              Sikca Sorulan Sorular
            </h2>
            <p className="mb-4 text-sm leading-6 text-gray-400">
              Kullanicilarimizdan en cok aldigimiz sorular ve cevaplari. Daha fazla soru icin iletisim
              sayfasina yonelebilirsiniz.
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
              Surekli Gelisen Bir Platform
            </h2>
            <div className="space-y-4 text-sm leading-7 text-gray-300">
              <p>
                Borsa Krali sabit bir urun degil, surekli evrilen bir platformdur. 2026 yilinin ilk
                yarisinda v3.0 surumu ile abonelik sistemi, finansal notlar, ekonomik takvim, Malaysian
                SNR tarayicisi ve istek paneli devreye alindi. v4.0 ile gunluk sinyal sistemi 16 kosullu
                universal skorlama, 11:00 revize taramasi ve gun ici otomatik refresh ile yenilendi.
                Algoritma performans sayfasi T+1 sinyal sonucu yayini ile saydamlasti. AdSense
                entegrasyonu, gizlilik politikasi yenilemesi ve cerez onayi gibi yasal cerceve
                guncellemeleri tamamlandi.
              </p>
              <p>
                Yol haritamizda sirada bekleyenler: portfoy takip modulu (kar/zarar grafikleri, ortalama
                maliyet hesabi, ileride otomatik vergi hesabi), iki faktorlu kimlik dogrulama, iOS native
                uygulamasi, Telegram bot entegrasyonu, kullanici tanimli sinyal alarmlari ve gelismis
                backtest motoru. 2026 ucuncu ceyregine kadar Turk yatirimcilar icin haftalik makro analiz
                bultenleri ve yapay zeka destekli sektor raporlari acilacak; Avrupa ve ABD piyasalari
                entegrasyonu da uzun vadeli planlar arasindadir.
              </p>
              <p>
                Kullanicilarimizdan gelen geri bildirimleri Istek Paneli uzerinde topluyor, oy verme
                sistemi ile en cok talep goren ozellikleri once gelistiriyoruz. Yorumlariniz ve
                onerileriniz dogrudan urun yolunu sekillendirmektedir; gelisme sureklidir, durmaz.
              </p>
            </div>
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
              <a href="mailto:info@borsakrali.com" className="text-gold-400 underline-offset-2 hover:underline">
                info@borsakrali.com
              </a>{' '}
              veya{' '}
              <a href="mailto:hsnkrkl19@gmail.com" className="text-gold-400 underline-offset-2 hover:underline">
                hsnkrkl19@gmail.com
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
