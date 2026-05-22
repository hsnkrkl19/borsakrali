import { Link } from 'react-router-dom'
import { LineChart, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function KriptoAnaliz() {
  return (
    <div>
      <div className="mx-auto max-w-4xl">
        <div
          className="rounded-3xl p-5 sm:p-7 md:p-8"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)', boxShadow: 'var(--shadow-lg)' }}
        >
          <nav aria-label="breadcrumb" className="mb-4 text-xs text-gray-500">
            <Link to="/" className="hover:text-gold-400">Borsa Kralı</Link>
            <span className="mx-2 text-gray-600">/</span>
            <Link to="/ogren" className="hover:text-gold-400">Öğren</Link>
            <span className="mx-2 text-gray-600">/</span>
            <span className="text-gray-300">Kripto Para Nasıl Analiz Edilir</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <LineChart className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                Kripto
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Kripto Para Nasıl Analiz Edilir: Teknik ve Temel Yaklaşım
            </h1>
            <p className="text-sm text-gray-500">17 Mayıs 2026 — yaklaşık 10 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Kripto para analizi, bir hisse senedini incelemekle hem benzeşir hem de önemli noktalarda
              ayrışır. Teknik analizin grafik mantığı büyük ölçüde aynı kalır; ancak piyasanın 7 gün 24 saat
              açık olması, volatilitenin yüksekliği ve "şirket" yerine "proje" değerlendirmesinin gelmesi
              farklı bir bakış açısı gerektirir. Bu yazıda kripto'ya özgü teknik analiz farklarını, hareketli
              ortalama, RSI ve hacmin kripto bağlamında nasıl yorumlandığını, projeyi değerlendirmeye dayalı
              "temel analizi", piyasa değeri yanılgısını, arz kavramlarını, Bitcoin korelasyonunu ve haber
              etkisini somut örneklerle ele alacağız. Sonunda kullanabileceğiniz bir kontrol listesi
              bulacaksınız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kripto'da Teknik Analiz Neden Farklı?</h2>
              <p>
                Borsa İstanbul'da işlemler belirli saatler arasında yapılır; seans kapanır, ertesi gün açılış
                bir boşlukla (gap) gelebilir. Kripto piyasası ise hiç kapanmaz. Bu durumun analize iki büyük
                etkisi vardır. Birincisi, klasik anlamda "açılış boşluğu" neredeyse oluşmaz; fiyat sürekli
                akar. İkincisi, haber akışı gece gündüz devam ettiği için sert hareketler herhangi bir saatte
                gerçekleşebilir.
              </p>
              <p className="mt-3">
                İkinci büyük fark volatilitedir. Bir BIST hissesinin günlük yüzde 5'lik hareketi dikkat
                çekerken, bir altcoin için aynı oran sıradan bir gün olabilir. Bu nedenle kripto'da daha geniş
                zarar durdur (stop) mesafeleri ve daha küçük pozisyon büyüklükleri gerekir. Aynı teknik
                göstergeler kullanılır, fakat eşik değerleri ve risk hesapları piyasanın oynaklığına göre
                ayarlanmalıdır.
              </p>
              <p className="mt-3">
                Üçüncü fark zaman dilimi seçimidir. Kripto sürekli aktığı için, çok küçük zaman dilimlerinde
                gürültü oranı yüksektir. Yeni başlayan biri için günlük (1G) ve 4 saatlik (4S) grafikler,
                trendi sağlıklı okumak adına çok daha güvenilir bir başlangıçtır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Grafik Okumanın Temeli</h2>
              <p>
                Kripto grafikleri de mum çubuklarıyla okunur: gövde açılış-kapanış aralığını, fitiller o
                periyottaki en yüksek ve en düşük noktayı gösterir. Trend okuması da aynıdır; yükselen trend
                daha yüksek tepeler ve daha yüksek dipler, düşen trend ise daha düşük tepeler ve daha düşük
                dipler üretir.
              </p>
              <p className="mt-3">
                Kripto'ya özgü pratik bir nokta, "yuvarlak sayı" seviyelerinin güçlü psikolojik destek ve
                direnç oluşturmasıdır. Örneğin Bitcoin için belirgin yuvarlak fiyat eşikleri, çok sayıda
                yatırımcının dikkatini topladığı için sık sık tepki seviyesi haline gelir. Teknik analizin
                temellerini hatırlamak isterseniz{' '}
                <Link to="/egitim/teknik-analiz-giris" className="text-gold-400 underline-offset-2 hover:underline">
                  Teknik Analize Giriş
                </Link>{' '}
                ve{' '}
                <Link to="/egitim/destek-direnc" className="text-gold-400 underline-offset-2 hover:underline">
                  Destek ve Direnç
                </Link>{' '}
                makalelerinden faydalanabilirsiniz.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Hareketli Ortalama, RSI ve Hacim Kripto'da</h2>
              <p>
                Teknik göstergeler kripto'da da çalışır, ancak yorumları piyasanın karakterine göre incelir.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Hareketli Ortalamalar</h3>
              <p>
                Uzun vadeli yatırımcılar genellikle 50 ve 200 günlük hareketli ortalamaları izler. 50 günlük
                ortalamanın 200 günlük ortalamayı yukarı kesmesi (golden cross) uzun dönemli güç, aşağı
                kesmesi (death cross) ise zayıflık sinyali olarak okunur. Kripto'da bu kesişimler güçlü
                ilgi gördüğü için kalabalığın davranışını da etkiler.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">RSI (Göreceli Güç Endeksi)</h3>
              <p>
                RSI 0-100 aralığında çalışır; klasik yorumda 70 üzeri aşırı alım, 30 altı aşırı satım kabul
                edilir. Kripto'nun kritik farkı şudur: güçlü bir boğa trendinde RSI uzun süre 70'in üzerinde
                kalabilir ve bu tek başına satış sinyali değildir. Bu nedenle kripto'da RSI'yı tek başına
                değil, trend yönü ve fiyat-gösterge uyumsuzluğu (divergence) ile birlikte değerlendirmek
                gerekir.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Hacim</h3>
              <p>
                Hacim, fiyat hareketinin gerçekliğini test eder. Yüksek hacimle gelen bir kırılım daha
                güvenilirdir; düşük hacimli kırılım sahte çıkma eğilimindedir. Kripto'da ek bir uyarı vardır:
                bazı küçük ve düşük likiditeli varlıklarda hacim verisi şişirilmiş olabilir. Bu yüzden büyük
                ve likit varlıklarda hacim okuması daha anlamlı sonuç verir.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Fiyat yeni bir zirve yaparken RSI daha düşük bir zirve yapıyorsa buna "negatif uyumsuzluk"
                  denir ve trendin zayıfladığına dair erken bir uyarıdır. Tersi durum, fiyat yeni dip
                  yaparken RSI daha yüksek dip yapması, "pozitif uyumsuzluk" olarak dipten dönüş ihtimaline
                  işaret eder. Uyumsuzluk tek başına emir değil, dikkatli olma sinyalidir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kripto'da Temel Analiz: Projeyi Değerlendirmek</h2>
              <p>
                Bir hisse senedinde temel analiz, şirketin bilançosunu, kârını ve nakit akışını incelemektir.
                Kripto'da çoğu projenin geleneksel anlamda bir bilançosu yoktur; bu yüzden "temel analiz"
                projenin kendisini değerlendirmeye dönüşür. Şu başlıklar bir kontrol çerçevesi sunar.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Ekip:</strong> Kurucular kim, geçmişleri ne, kimlikleri
                  açık mı? Tamamen anonim ve geçmişi belirsiz bir ekip ek bir risk faktörüdür.
                </li>
                <li>
                  <strong className="text-white">Beyaz kâğıt (whitepaper):</strong> Proje hangi sorunu
                  çözüyor, çözümü teknik olarak tutarlı mı, yoksa belge yalnızca pazarlama dilinden mi
                  ibaret?
                </li>
                <li>
                  <strong className="text-white">Tokenomics:</strong> Token nasıl dağıtılıyor, ne kadarı
                  ekipte, kilitler ne zaman açılıyor, arz zamanla artıyor mu? Büyük kilit açılışları satış
                  baskısı yaratabilir.
                </li>
                <li>
                  <strong className="text-white">Kullanım alanı:</strong> Token'ın ağ içinde gerçek bir
                  işlevi var mı, yoksa yalnızca spekülasyon aracı mı?
                </li>
                <li>
                  <strong className="text-white">Topluluk ve geliştirici etkinliği:</strong> Proje aktif
                  geliştiriliyor mu, topluluk gerçek ve canlı mı?
                </li>
                <li>
                  <strong className="text-white">Rakipler:</strong> Aynı sorunu çözen başka projeler var
                  mı, bu projenin onlardan farkı ne?
                </li>
              </ul>
              <p className="mt-3">
                Bu çerçeve sihirli bir formül değildir; ancak bir projenin sağlam bir temele mi yoksa salt
                hikâyeye mi dayandığını ayırt etmeye yardımcı olur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Piyasa Değeri (Market Cap) Yanılgısı</h2>
              <p>
                Yeni başlayanların en sık düştüğü hatalardan biri, "fiyatı düşük olan coin ucuzdur" sanmaktır.
                Bu yanlıştır. Bir varlığı kıyaslamak için tek başına fiyat değil, piyasa değeri kullanılır.
              </p>
              <p className="mt-3">
                Piyasa değeri basit bir çarpımdır: birim fiyat çarpı dolaşımdaki arz. Birim fiyatı 0,01
                dolar olan bir token, dolaşımda 100 milyar adet bulunuyorsa 1 milyar dolarlık bir piyasa
                değerine sahiptir. Birim fiyatı 50.000 dolar olan bir varlık ise dolaşımda yalnızca 100 bin
                adet bulunuyorsa 5 milyar dolarlık bir piyasa değerine sahiptir. Yani "kuruşluk" görünen
                token, "pahalı" görünen varlıktan daha küçük olmak zorunda değildir.
              </p>
              <p className="mt-3">
                Doğru soru "fiyatı kaç dolar" değil, "bu varlığın toplam değeri ne kadar ve bu seviyeden
                kaç kat büyümesi gerçekçi" sorusudur. Devasa bir piyasa değerine sahip bir varlığın 100
                katına çıkması, küçük bir varlığa kıyasla matematiksel olarak çok daha zordur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Dolaşımdaki Arz ve Toplam Arz</h2>
              <p>
                Arz tarafını doğru okumak için iki kavramı ayırmak gerekir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Dolaşımdaki arz (circulating supply):</strong> Şu anda
                  piyasada serbestçe alınıp satılabilen token miktarıdır. Piyasa değeri hesabında bu sayı
                  kullanılır.
                </li>
                <li>
                  <strong className="text-white">Toplam ve maksimum arz (total / max supply):</strong>
                  Toplam arz şu ana kadar üretilmiş tüm miktardır; maksimum arz ise kodla belirlenmiş üst
                  sınırdır. Bitcoin'in maksimum arzı 21 milyondur.
                </li>
              </ul>
              <p className="mt-3">
                Bu ayrım neden önemli? Dolaşımda 100 milyon, toplam arzda ise 1 milyar token bulunan bir
                projede, ileride 900 milyon token kademeli olarak piyasaya çıkacak demektir. Bu gelecekteki
                arz, ek satış baskısı anlamına gelir. "Tamamen seyreltilmiş değer" (fully diluted valuation)
                kavramı tam da bu nedenle, tüm arz dolaşıma girdiğinde varlığın değerinin ne olacağını
                gösterir ve gözden kaçırılmamalıdır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bitcoin Korelasyonu</h2>
              <p>
                Kripto piyasasının önemli bir gerçeği, çoğu altcoin'in fiyatının büyük ölçüde Bitcoin'in
                yönüne bağlı hareket etmesidir. Bitcoin sert düştüğünde, temel olarak güçlü bir altcoin bile
                aşağı sürüklenebilir; Bitcoin yükseldiğinde ise piyasa genel olarak risk iştahı kazanır.
              </p>
              <p className="mt-3">
                Bunun pratik sonucu şudur: bir altcoin'i incelerken yalnızca o varlığın grafiğine bakmak
                yetmez; Bitcoin'in genel durumu da değerlendirilmelidir. Bitcoin belirsiz veya düşüş
                eğilimindeyken alınan altcoin pozisyonları, projenin kalitesinden bağımsız olarak ek bir
                risk taşır. Korelasyonun zamanla değiştiğini, bazı dönemlerde gevşeyip bazı dönemlerde
                güçlendiğini de unutmamak gerekir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Haber ve Sosyal Medya Etkisi</h2>
              <p>
                Kripto piyasası habere ve duyguya hisse senetlerinden daha hızlı ve daha sert tepki verir.
                Bir borsaya listelenme haberi, bir ortaklık duyurusu ya da düzenleyici bir açıklama, fiyatı
                dakikalar içinde hareketlendirebilir. Sosyal medyadaki yoğun ilgi, kısa vadeli aşırı alım
                veya panik satış dalgaları yaratabilir.
              </p>
              <p className="mt-3">
                Buradaki tehlike, "herkes konuşuyor, ben de alayım" mantığıyla hareket etmektir. Yoğun
                heyecanın zirve yaptığı anlar, çoğu zaman fiyatın da yerel zirveye yakın olduğu anlardır.
                Sağlıklı yaklaşım, haberi bir veri olarak ele almak; ancak nihai kararı kendi teknik ve
                temel analizinize dayandırmaktır. Doğrulanmamış söylentilere göre işlem yapmak, kripto'da
                kayıpların sık görülen kaynaklarından biridir.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Hiçbir analiz yöntemi gelecekteki fiyatı kesin olarak bildiremez. Teknik analiz olasılık,
                  temel analiz ise nitelik değerlendirmesidir; ikisi birlikte daha güçlü bir resim sunar ama
                  garanti vermez. "Kesin yükselecek" diyen kaynaklara değil, kendi analizinize ve risk
                  planınıza güvenin.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kripto Analiz Kontrol Listesi</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>Bitcoin'in genel durumu nedir? Piyasanın geneli yükseliş, düşüş yoksa kararsız bir evrede mi?</li>
                <li>Varlığın günlük ve 4 saatlik grafikte trendi hangi yönde; daha yüksek dipler mi, daha düşük tepeler mi var?</li>
                <li>Hareketli ortalamalar, RSI ve hacim aynı yönü mü gösteriyor, yoksa aralarında uyumsuzluk mu var?</li>
                <li>Önemli destek ve direnç seviyeleri nerede; mevcut fiyat bunlara göre nerede duruyor?</li>
                <li>Projenin ekibi, beyaz kâğıdı ve gerçek bir kullanım alanı var mı; topluluk aktif mi?</li>
                <li>Tokenomics nasıl: dolaşımdaki arz ne kadar, ileride büyük kilit açılışları var mı?</li>
                <li>Piyasa değeri ve tamamen seyreltilmiş değer ne kadar; bu seviyeden büyüme beklentisi gerçekçi mi?</li>
                <li>Fiyatı son dönemde haber mi yoksa gerçek bir gelişme mi hareketlendirdi?</li>
                <li>Bu işlem için zarar durdur seviyem ve pozisyon büyüklüğüm önceden belli mi?</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/kripto-para-giris" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Kripto Paraya Giriş: Bitcoin ve Blockchain <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/onchain-analiz" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    On-Chain Analiz: Zincir Üstü Veriyi Okumak <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    EMA, MACD, RSI: 3 Temel Gösterge ve Yorumu <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              </ul>
            </section>

            <p className="border-t border-white/5 pt-4 text-xs text-gray-500">
              Bu içerik yatırım tavsiyesi değildir. Yalnızca eğitim ve bilgilendirme amacıyla hazırlanmıştır.
              Yatırım kararlarınız için kendi araştırmanızı yapmanız ve gerekirse profesyonel destek almanız
              önerilir.
            </p>
          </article>

          <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4 text-sm">
            <Link to="/ogren" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Tüm makaleler
            </Link>
            <Link to="/egitim/onchain-analiz" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: On-Chain Analiz <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
