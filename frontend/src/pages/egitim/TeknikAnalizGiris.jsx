import { Link } from 'react-router-dom'
import { BookOpen, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function TeknikAnalizGiris() {
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
            <Link to="/egitim" className="hover:text-gold-400">Eğitim</Link>
            <span className="mx-2 text-gray-600">/</span>
            <span className="text-gray-300">Teknik Analize Giriş</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <BookOpen className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                Teknik
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Teknik Analize Giriş: Sıfırdan Başlayanlar İçin Kılavuz
            </h1>
            <p className="text-sm text-gray-500">10 Mayıs 2026 — yaklaşık 8 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Teknik analiz, fiyat ve hacim verileri üzerinden gelecekteki olası fiyat hareketlerini tahmin etmeyi
              amaçlayan çalışma alanıdır. Şirketin defter değerine, kazanç beklentilerine ya da makro verilere
              değil; doğrudan grafiğe bakar. Yeni başlayan bir yatırımcının teknik analizle tanışması, piyasanın
              kendi dilini öğrenmesi anlamına gelir. Bu yazıda temel kavramları, grafik türlerini, trend
              kavramını, hareketli ortalamaları ve hacim analizini sade bir biçimde açıklayacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Teknik Analiz Nedir?</h2>
              <p>
                Teknik analiz, geçmiş fiyat ve hacim hareketlerinin kalıp ve yapılarını inceleyerek piyasa
                psikolojisini okumaya çalışan disiplindir. Temelinde üç varsayım vardır: piyasa her şeyi fiyatlar,
                fiyatlar trendler halinde hareket eder ve tarih kendini tekrarlama eğilimindedir. Bu varsayımlar
                Charles Dow tarafından 19. yüzyıl sonlarında formüle edilmiştir ve günümüzdeki teknik analizin
                temelini oluşturur.
              </p>
              <p className="mt-3">
                Bir hisse senedi, örneğin THYAO, fiyat grafiğinde dalgalı bir seyir gösterirken; aslında binlerce
                yatırımcının alım-satım kararının matematiksel toplamını çizer. Teknik analist bu izlerin
                arkasındaki davranışı okumaya çalışır: yatırımcı hangi seviyeden korkup sattı, hangi seviyeden
                güvenle aldı?
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Teknik Analizin Kısa Tarihi</h2>
              <p>
                Modern teknik analizin atası sayılan Charles Dow, 1880'lerde Wall Street Journal köşesinde
                piyasanın trend halinde hareket ettiğini yazıyordu. Sonradan Dow Teorisi olarak anılan bu
                yaklaşım, birincil trend, ikincil düzeltme ve günlük dalgalanma ayrımı yaparak modern teknik
                analizin temelini attı.
              </p>
              <p className="mt-3">
                20. yüzyılda Japon mum çubukları Batı piyasalarına giriş yaptı. Steve Nison'un 1991'deki kitabı
                ile Doji, Çekiç, Yutan Mum gibi formasyonlar uluslararasılaştı. Daha sonra Welles Wilder RSI,
                ATR, ADX gibi göstergeleri tanıttı. Gerald Appel MACD'yi geliştirdi. Bugün bu araçların tamamı,
                bir BIST hissesinin grafiğinde tek tıkla incelenebilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Grafik Tipleri</h2>
              <p>
                Teknik analizde üç temel grafik türü kullanılır. Her biri aynı veriyi farklı biçimde gösterir
                ve farklı detay seviyesi sunar.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">1. Çizgi Grafik</h3>
              <p>
                Yalnızca kapanış fiyatlarını noktasal olarak birleştirir. En sade görüntüdür ve uzun dönem trendleri
                görmek için idealdir. Örneğin BIST 100 endeksinin 20 yıllık seyrini çizgi grafikle bakıldığında
                ana yönün yukarı olduğu rahatça okunur.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">2. Bar (Çubuk) Grafik</h3>
              <p>
                Her çubuk; o periyottaki açılış, kapanış, en yüksek ve en düşük fiyatları (OHLC) verir. Soldaki
                çizgi açılışı, sağdaki kapanışı temsil eder. Kapanış açılışın üzerindeyse fiyat yükselmiştir.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">3. Mum (Candlestick) Grafik</h3>
              <p>
                Bugün en yaygın kullanılan grafik türüdür. Gövde açılış-kapanış arasını, fitiller en yüksek-en
                düşük noktaları gösterir. Yeşil/beyaz gövde fiyatın yükseldiğini, kırmızı/siyah gövde düştüğünü
                ifade eder. Mum formasyonları (Yutan Mum, Çekiç, Doji) tek başına sinyal üretebilir.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Yeni başlayanlar için günlük veya haftalık mum grafiği ile başlamak; daha küçük zaman
                  dilimlerine göre daha az gürültü içerir. 5 dakikalık grafik, deneyim kazanmadan bakıldığında
                  çoğu zaman zarar verir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Trend Kavramı</h2>
              <p>
                Teknik analizin en değerli ilkesi şöyledir: trend dostundur. Piyasa belirli bir yönde hareket
                etmeye başladığında, bu yön kendini bir süre sürdürme eğilimindedir. Trend üç biçimde olabilir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Yükselen trend:</strong> Daha yüksek tepeler ve daha yüksek
                  dipler. Örneğin AKBNK, 2024 başlarında 32 TL'den itibaren oluşturduğu yüksek dipler ile
                  yükselen trende girdi.
                </li>
                <li>
                  <strong className="text-white">Düşen trend:</strong> Daha düşük tepeler ve daha düşük dipler.
                  Yatırımcı genelde düşen trendde alım yapmaktan kaçınmalıdır.
                </li>
                <li>
                  <strong className="text-white">Yatay trend:</strong> Fiyat belirli bir aralıkta sıkışır.
                  Kırılım sinyali beklenir.
                </li>
              </ul>
              <p className="mt-3">
                Trend çizgileri, en az iki dibi (yükselen trend) veya iki tepeyi (düşen trend) birleştirerek
                çizilir. Geç yapılan dokunuşlar trendin geçerliliğini güçlendirir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Hareketli Ortalamalar</h2>
              <p>
                Hareketli ortalama (Moving Average), belirli sayıdaki kapanış fiyatlarının ortalamasını çizen
                bir çizgidir. Fiyatın hareketini yumuşatır ve trend yönü hakkında hızlı bir okuma sunar. İki
                temel türü vardır.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">SMA (Simple Moving Average):</strong> Basit ortalamadır. Son
                  20 günün kapanışlarının toplamının 20'ye bölünmesi 20 günlük SMA'yı verir.
                </li>
                <li>
                  <strong className="text-white">EMA (Exponential Moving Average):</strong> Son fiyatlara daha
                  fazla ağırlık verir; bu yüzden trend dönüşlerini SMA'ya göre daha hızlı yakalar.
                </li>
              </ul>
              <p className="mt-3">
                Pratik kullanım örneği: KCHOL'un 50 günlük EMA çizgisi 200 günlük EMA çizgisinin üzerine
                çıktığında buna golden cross denir ve uzun dönemli yükseliş sinyali olarak yorumlanır. Tersi
                durum (death cross) ise zayıflığı işaret edebilir. EMA, MACD ve RSI'nin daha detaylı kullanımı
                için{' '}
                <Link to="/egitim/temel-gostergeler" className="text-gold-400 underline-offset-2 hover:underline">
                  EMA, MACD, RSI: 3 Temel Gösterge ve Yorumu
                </Link>{' '}
                makalemize bakabilirsiniz.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Hacim Analizi</h2>
              <p>
                Hacim, belirli bir periyotta el değiştiren hisse adedidir. Fiyat hareketinin güvenilirliği
                konusunda kritik bilgi taşır. Genel kural: bir kırılım, ortalamadan yüksek hacimle
                gerçekleşirse anlamlıdır; düşük hacimli kırılım sahte çıkma eğilimindedir.
              </p>
              <p className="mt-3">
                Örneğin SAHOL hissesi belirgin bir direnci kırdığında, kırılım günü hacmi son 20 gün
                ortalamasının üzerindeyse alıcı talebinin gerçek olduğu varsayılır. Tersi durumda, az alıcı ile
                fiyatın direnci aşıp geri dönmesi muhtemeldir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Teknik Analize Yönelik Eleştiriler</h2>
              <p>
                Akademik dünyada Etkin Piyasalar Hipotezi savunucularına göre tüm bilgi fiyata yansımıştır ve
                teknik analiz uzun vadede getiri üretmez. Pratikte ise pek çok piyasa katılımcısı teknik
                seviyeleri gözlediği için destek-direnç gibi noktalar kendi kendini gerçekleştiren tahminler
                haline gelir. Yine de teknik analiz tek başına yeterli değildir; temel analizle birlikte
                kullanılması önerilir.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Teknik analiz olasılık bilimidir, kesinlik değil. Hiçbir formasyon yüzde 100 doğru çıkmaz.
                  Risk yönetimi olmadan yapılan teknik işlemler, doğru sinyallere rağmen kayıpla
                  sonuçlanabilir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Temel Mum Formasyonları</h2>
              <p>
                Mum formasyonları, piyasa psikolojisinin görsel özetidir. Tek bir mumun açılış-kapanış-fitil
                yapısı, yatırımcıların o periyottaki kararsızlığını, kararlılığını veya paniğini gösterir. En
                çok izlenen birkaç formasyon:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Doji:</strong> Açılış ve kapanış fiyatları neredeyse eşit.
                  Kararsızlık anlamına gelir. Yükselen trendin tepesindeki bir Doji, dönüş uyarısı olabilir.
                </li>
                <li>
                  <strong className="text-white">Çekiç (Hammer):</strong> Küçük gövdeli, alt fitili uzun bir
                  mum. Genelde düşüş sonrası oluşursa dönüşün habercisidir; alıcıların dipte devreye girdiğini
                  gösterir.
                </li>
                <li>
                  <strong className="text-white">Yutan Mum (Engulfing):</strong> İki periyotluk formasyon.
                  İkinci mumun gövdesi, birincinin gövdesini tamamen kapsar. Yön değişikliğini ifade eder.
                </li>
                <li>
                  <strong className="text-white">Vuruş (Shooting Star):</strong> Yükselen trendin tepesinde
                  uzun üst fitilli bir mum. Yorgunluk ve dönüş uyarısıdır.
                </li>
              </ul>
              <p className="mt-3">
                Mum formasyonları tek başlarına değil, mevcut trend ve destek-direnç seviyeleri ile birlikte
                yorumlanır. Örneğin GARAN hissesi önemli bir desteğe geldiğinde oluşan bir Çekiç mumu, sadece
                havada gerçekleşen bir Çekiç'ten çok daha güçlü sinyaldir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Klasik Grafik Formasyonları</h2>
              <p>
                Mum bazlı formasyonların dışında, daha uzun dönemde oluşan ve kalabalığın grafiğe çizmesini
                kolaylaştıran formasyonlar vardır.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Baş-Omuz (Head and Shoulders):</strong> Yükselen trendin
                  sonunda oluşan dönüş formasyonu. Sol omuz, baş, sağ omuz ve boyun çizgisi kavramları
                  vardır. Boyun çizgisi kırıldığında hedef, başların tepesinden boyun çizgisine olan mesafe
                  kadar aşağıya projekte edilir.
                </li>
                <li>
                  <strong className="text-white">Çifte Tepe / Çifte Dip:</strong> İki tepe veya iki dip aynı
                  seviyede tekrarlanır. M ve W harfine benzer. Boyun çizgisinin kırılması sinyaldir.
                </li>
                <li>
                  <strong className="text-white">Üçgen (Triangle):</strong> Yükselen, düşen veya simetrik
                  üçgen formasyonları sıkışmayı temsil eder. Sıkışmadan kırılım genelde güçlü hareket getirir.
                </li>
                <li>
                  <strong className="text-white">Bayrak (Flag):</strong> Hızlı yükseliş sonrası oluşan küçük
                  düzeltme kanalı. Flagin yukarı kırılımı trend devamını gösterir.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Hacim ve Fiyat İlişkisi</h2>
              <p>
                Hacim ile fiyat hareketinin yön ilişkisi, sinyallerin gücünü belirler. Klasik Wyckoff
                ilkelerine göre:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Yükselen fiyat + artan hacim: sağlıklı yükseliş (alıcı talebi gerçek).</li>
                <li>Yükselen fiyat + azalan hacim: zayıf yükseliş (yorgunluk, dönüş riski).</li>
                <li>Düşen fiyat + artan hacim: panik satış (devam riski).</li>
                <li>Düşen fiyat + azalan hacim: zayıf düşüş (dipten dönüş yakın olabilir).</li>
              </ul>
              <p className="mt-3">
                Borsa Kralı platformundaki Canlı Heatmap ekranında hacim/fiyat ilişkisini görsel olarak takip
                edebilirsiniz. Yine aynı ekranda BIST 30 hisselerinin gün içi hacim sapmaları renk bazlı
                görülür.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yeni Başlayanlar İçin Yol Haritası</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>BIST 100 endeksini günlük grafikte takip ederek görsel okuma kapasitenizi geliştirin.</li>
                <li>Mum çubuklarını ve tek tek mum formasyonlarını ezberlemek yerine grafik üzerinde tanımaya çalışın.</li>
                <li>Bir veya iki indikatörle başlayın (örn. 50 EMA + RSI). Her şeyi ekrana eklemek yerine basit kalın.</li>
                <li>Her teknik kuralınızı geçmişe doğru test edin (kağıt üzerinde de olur).</li>
                <li>Risk yönetimi olmadan asla işlem girmeyin: zarar durdur seviyesi önceden belirlenmeli.</li>
                <li>Hacim, fiyat ve trendi her zaman birlikte değerlendirin; tek başına indikatör yetmez.</li>
                <li>Defter tutun: her işlemi neden açtınız, neden kapattınız, sonucu ne oldu — yazılı kayıt becerinizi geliştirir.</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    EMA, MACD, RSI: 3 Temel Gösterge ve Yorumu <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/destek-direnc" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Destek ve Direnç Seviyeleri Nasıl Çizilir? <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/yatirim-stratejisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Yatırım Stratejisi Oluşturma: 5 Adım <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Tüm makaleler
            </Link>
            <Link to="/egitim/bist100-rehberi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: BIST 100 Rehberi <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
