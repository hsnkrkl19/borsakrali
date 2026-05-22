import { Link } from 'react-router-dom'
import { Target, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function DestekDirenc() {
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
            <span className="text-gray-300">Destek ve Direnç</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Target className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                Teknik
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Destek ve Direnç Seviyeleri Nasıl Çizilir?
            </h1>
            <p className="text-sm text-gray-500">10 Mayıs 2026 — yaklaşık 9 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Destek ve direnç, teknik analizin en eski ve hala en değerli kavramlarıdır. Onlarca indikatör
              gelmiş ve gitmiştir; ancak destek-direnç kavramı yatırımcıların grafiğe bakar bakmaz düşündüğü
              ilk kavram olmaya devam eder. Bu yazıda yatay destek-direnç çizimini, trend çizgilerini, pivot
              noktalarını, Fibonacci geri çekilmesini, psikolojik seviyeleri ve sahte kırılım tuzaklarını
              detaylı ele alacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Destek ve Direnç Nedir?</h2>
              <p>
                Destek, fiyatın aşağı yönlü hareketinde alıcı talebinin yoğunlaştığı ve düşüşün yavaşladığı
                seviyedir. Direnç ise yukarı yönlü hareketinde satıcı baskısının arttığı ve yükselişlerin
                kesildiği seviyedir. Bu seviyeler birer çizgi değil, aslında ufak bir aralık (zone)
                şeklindedir.
              </p>
              <p className="mt-3">
                Önemli bir kural: bir destek kırıldığında direnç, bir direnç kırıldığında ise destek haline
                gelir. Bu rol değişikliği (role reversal), profesyonellerin grafik okumalarında en çok
                kullandığı prensiptir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yatay Destek-Direnç Çizimi</h2>
              <p>
                En basit çizim yöntemidir. Geçmiş grafikte fiyatın birden çok kez tepki verdiği seviyeler
                işaretlenir. İki önemli kural vardır:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Bir seviyenin destek/direnç sayılması için en az iki dokunuş istenir; üç dokunuş daha güçlü sayılır.</li>
                <li>Çok eski ve uzun zaman test edilmemiş seviyeler, geçerlen taşımaz; yakın geçmişdeki seviyeler daha önceliklidir.</li>
              </ul>
              <p className="mt-3">
                Pratik örnek: THYAO hissesi 250 TL seviyesini geçmiş 6 ay içinde üç kez test edip her seferinde
                yukarı döndüyse, 250 TL önemli bir destek olarak kabul edilir. Bu seviye kırıldığında fiyatın
                bir alt destek seviyesine kadar düşmesi muhtemeldir.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Destek-direnç seviyelerini günlük grafikte çizmeden önce haftalık grafiğe göz atın. Haftalık
                  grafikteki seviyeler, günlük grafiktekilerden çok daha güçlü reaksiyon üretir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Trend Çizgileri</h2>
              <p>
                Yükselen trende dokunan dipler bir trend desteği çizgisi çizer; düşen trende dokunan tepeler
                trend direnci çizgisi oluşturur. Çizimde dokunma sayısı önemlidir: tek dokunuşla çizgi
                geçerli sayılmaz. En az iki dokunuş gerekli, üçüncü dokunuşla çizgi resmen geçerli olur.
              </p>
              <p className="mt-3">
                Trend çizgisinin açısı da önemlidir. Çok dik bir trend (örneğin 60 derece üzerinde) genelde
                sürdürülemez ve hızla bozulur. 30-45 derece arası açılarla yükselen trendler, en sağlıklı ve
                uzun ömürlü olanlardır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Pivot Noktaları</h2>
              <p>
                Pivot noktaları, bir önceki günün yüksek, düşük ve kapanış fiyatlarını kullanarak gün içi
                destek-direnç seviyelerini hesaplayan formül tabanlı bir yöntemdir. Klasik pivot noktası
                formülü şu şekildedir:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`Pivot (P) = (Önceki Gün Yüksek + Düşük + Kapanış) / 3

Dirençler:
R1 = (2 * P) - Önceki Gün Düşük
R2 = P + (Önceki Gün Yüksek - Düşük)
R3 = R1 + (Önceki Gün Yüksek - Düşük)

Destekler:
S1 = (2 * P) - Önceki Gün Yüksek
S2 = P - (Önceki Gün Yüksek - Düşük)
S3 = S1 - (Önceki Gün Yüksek - Düşük)`}
              </pre>
              <p className="mt-3">
                Pivot noktaları özellikle gün içi (intraday) işlem yapan yatırımcılar tarafından kullanılır.
                Fiyat pivot noktası üzerindeyse günün genel havası pozitif, altındaysa negatif olarak okunur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Fibonacci Geri Çekilmesi</h2>
              <p>
                Fibonacci sayılarından türetilen oranlar (%23.6, %38.2, %50, %61.8, %78.6) yükselen veya
                düşen bir hareketin geri çekilmesi sırasında destek-direnç bölgeleri olarak kullanılır. Çizmek
                için son anlamlı dipten son anlamlı tepeye Fibonacci aracını çekmeniz yeterlidir.
              </p>
              <p className="mt-3">
                En çok izlenen seviyeler %38.2, %50 ve %61.8'dir. Sağlıklı bir yükselen trendde fiyatın %50
                geri çekilme seviyesinde alıcı bulması beklenir. %61.8'in altına sarkan düzeltmeler trendin
                bozulmaya başladığına işaret edebilir.
              </p>
              <p className="mt-3">
                Pratik örnek: AKBNK hissesi 30 TL'den 50 TL'ye yükseldi. Geri çekilmede %38.2 seviyesi 42.4
                TL, %50 seviyesi 40 TL, %61.8 seviyesi 37.6 TL olur. Bu üç seviye, kısa vadeli alım için
                potansiyel tepki bölgeleridir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Psikolojik Seviyeler</h2>
              <p>
                Yuvarlak rakamlar (50, 100, 200, 500 gibi) kalabalığın gözüne çarptığı için doğal birer
                destek-direnç bölgesidir. BIST 100 endeksi 10.000 puan seviyesi yıllarca önemli bir psikolojik
                eşik olmuştur. Hisse senedi bazında da 100 TL seviyesi yatırımcılar için "psikolojik" bir
                noktadır.
              </p>
              <p className="mt-3">
                Özellikle bireysel yatırımcıların yoğun olduğu hisselerde bu psikolojik seviyeler, teknik
                seviyelerden bile daha güçlü reaksiyon ürettiği gözlemlenir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kırılım ve Sahte Kırılım</h2>
              <p>
                Kırılım, fiyatın destek veya direnç seviyesini güçlü bir hareketle geçmesidir. Sağlıklı
                kırılım için üç şart aranır:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Kapanış teyidi:</strong> Sadece gün içi değil, kapanışla seviye aşılmalı.</li>
                <li><strong className="text-white">Hacim teyidi:</strong> Kırılım günü hacmi 20 gün ortalamasının üzerinde olmalı.</li>
                <li><strong className="text-white">Geri test (retest):</strong> Kırıldıktan sonra fiyatın kırılan seviyeye geri dönmesi ve oradan tepki vermesi en sağlıklı teyiddir.</li>
              </ul>
              <p className="mt-3">
                Sahte kırılım (fakeout), bu şartlar oluşmadan yapılan kırılımdır. Özellikle düşük hacimli
                kırılımlar genelde sahtedir ve yatırımcıyı tuzağa düşürmek için kullanılan klasik bir
                manipülasyon örneklerinden biridir. Stop seviyesi yatırımcının tam istemediği yerde
                tetiklenir, sonra fiyat geri döner.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Kapanış gerçekleşmeden kırılıma inanmayın. Gün içi 1-2 saatlik bir aşma, özellikle düşük
                  hacimle gerçekleşiyorsa çoğunlukla geri dönüş içindir. Sağlam yatırımcılar gün içi fiyat
                  hareketine değil, kapanışa bakar.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Hacim Profili (Volume Profile)</h2>
              <p>
                Hacim profili, fiyat eksenine göre (yatay değil dikey hacim çubukları) hangi fiyat
                seviyelerinde ne kadar işlem gerçekleştiğini gösterir. Yüksek hacimli fiyat noktaları (HVN —
                High Volume Node) doğal destek-direnç bölgesidir; çünkü bu seviyelerde çok sayıda yatırımcı
                pozisyon almıştır ve fiyat tekrar ziyaret ettiğinde hareketli reaksiyon oluşur.
              </p>
              <p className="mt-3">
                Düşük hacimli bölgeler (LVN — Low Volume Node) ise tersi biçimde çalışır; fiyat bu bölgelerden
                hızla geçme eğilimindedir. Hacim profili özellikle günlük ve haftalık grafikte etkili sonuç
                verir. Örneğin THYAO hissesinde son 3 ayın hacim profilini ekleyince, 220 TL ve 245 TL gibi
                belirgin yoğunluk noktaları ortaya çıkabilir; bunlar manuel çizdiğiniz seviyelerle örtüştüğü
                taktirde güven artar.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">VWAP — Hacim Ağırlıklı Ortalama Fiyat</h2>
              <p>
                VWAP (Volume Weighted Average Price), gün içi işlemlerde fiyat ile hacmin çarpımının toplamının
                toplam hacme bölünmesi ile bulunur. Büyük kurumsal yatırımcılar işlemlerini VWAP çizgisine
                yakın gerçekleştirmeye çalışır; çünkü bu seviye gün içindeki "ortalama işlem fiyatı"dır.
              </p>
              <p className="mt-3">
                Pratik kullanım: bir hisse VWAP çizgisinin üzerinde seyrediyorsa, gün içi alıcı hakimiyetinden
                söz edilir. VWAP, gün içinde dinamik bir destek-direnç gibi davranır. Özellikle BIST 30
                hisselerinde gün içi işlem yapanlar tarafından yoğun biçimde takip edilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Çoklu Zaman Dilimi Analizi</h2>
              <p>
                Etkili destek-direnç analizi, en az iki zaman dilimini birlikte değerlendirmeyi gerektirir.
                Standart yaklaşım:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Aylık grafik:</strong> Yapısal ana destek-direnç.</li>
                <li><strong className="text-white">Haftalık grafik:</strong> Orta vadeli yön ve seviyeler.</li>
                <li><strong className="text-white">Günlük grafik:</strong> Giriş-çıkış kararları.</li>
                <li><strong className="text-white">4 saat / 1 saat:</strong> Hassas zamanlama.</li>
              </ul>
              <p className="mt-3">
                Önemli olan, alt zaman dilimindeki kararlarınızın üst zaman dilimindeki yapıyla çelişmemesi.
                Aylık grafikte düşen trendde olan bir hisse için günlük grafikte agresif alım sinyali
                aramak; istisnai durumlar haricinde verimsizdir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Hareketli Ortalama Destek-Direnç</h2>
              <p>
                Yatay seviyelerin dışında, hareketli ortalamalar (özellikle 50 ve 200 EMA) dinamik destek ve
                direnç görevi görür. Yükselen trendde fiyat 50 EMA'ya çekilip oradan tepki vermeyi tercih
                eder; düşen trendde fiyat 50 EMA'ya yükselip oradan satış görünümlü reaksiyon verir.
              </p>
              <p className="mt-3">
                200 EMA, özellikle uzun vadeli yatırımcılar için temel referans çizgisidir. 200 EMA'nın
                üzerinde işleyen bir hisse "uzun dönemde alıcı hakim", altında olan ise "uzun dönemde satıcı
                hakim" olarak yorumlanır. Bu çizgiyi geri kazanmak veya kaybetmek; çoğunlukla büyük pozisyon
                değişikliklerine yol açar.
              </p>
              <p className="mt-3">
                Pratik örnek: AKBNK 200 EMA çizgisinin üzerinde aylar boyunca seyrederken, fiyat bu çizgiye
                çekildiğinde alıcı talebinin geldiği gözlemlenir. Ancak bir gün bu çizgi günlük kapanış ile
                kırılırsa; orta vadeli yatırımcılar için bu kritik bir uyarı sinyalidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Dilim Bazlı Destek-Direnç</h2>
              <p>
                Bazı yatırımcılar önemli yüzde dilimlerini destek-direnç olarak kullanır. Bu yaklaşımda
                bir hissenin yıllık en yüksek ve en düşük seviyesi alınarak %25, %50, %75 noktaları
                işaretlenir. %50 çizgisi (yıllık orta nokta) özellikle psikolojik etki yaratır; bir hisse
                yıllık aralığının üst yarısına geçiyorsa pozitif sentiment kuvvetli, alt yarısına düşüyorsa
                zayıflama belirginleşir.
              </p>
              <p className="mt-3">
                Bu yaklaşım Borsa Kralı'ndaki 52 haftalık en yüksek/düşük göstergeleriyle entegredir; tek
                bakışta bir hissenin yıl boyunca neredeyizini görmek için pratik bir referans sağlar.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Order Block ve Likidite Bölgeleri</h2>
              <p>
                Modern teknik analizde "order block" ve "likidite havuzu" kavramları özellikle kurumsal
                takipçi yatırımcılar arasında yayılmıştır. Order block; büyük emirlerin gerçekleşmiş olduğu
                ve sonrasında hızlı hareket oluşan mum bölgeleridir. Likidite havuzu ise stop emirlerinin
                yoğunlaştığı alanlardır.
              </p>
              <p className="mt-3">
                Pratik anlamı şöyledir: bir hissenin önceki önemli dibinin hemen altında yoğun stop emri
                vardır. Manipülatif hareketlerde fiyat o seviyenin biraz altına inip stopları toplar, sonra
                hızla yukarı döner. Bu nedenle stop emirlerini önceki dibin tam altına değil; biraz uzağında
                yerleştirmek pratik bir savunma yöntemidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Pratik Çizim Adımları</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>Haftalık grafikte ana destek-direnç bölgelerini çizin.</li>
                <li>Günlük grafiğe inip ara seviyeleri ekleyin.</li>
                <li>Trend çizgilerini ekleyin (yükselen veya düşen).</li>
                <li>Son anlamlı hareketin Fibonacci'sini çizin.</li>
                <li>Yuvarlak psikolojik seviyeleri işaretleyin.</li>
                <li>Pivot noktalarını günlük olarak kontrol edin (özellikle gün içi işlemlerde).</li>
              </ol>
              <p className="mt-3">
                Borsa Kralı platformunda Malaysian SNR sayfası, vucut bazlı (body-based) destek-direnç
                bölgelerini otomatik olarak hesaplar. Manuel çizimi güçlendirmek için{' '}
                <Link to="/egitim/temel-gostergeler" className="text-gold-400 underline-offset-2 hover:underline">
                  EMA, MACD, RSI
                </Link>{' '}
                yazımızdaki indikatörlerle teyit etmenizi, başlangıç teorisi için{' '}
                <Link to="/egitim/teknik-analiz-giris" className="text-gold-400 underline-offset-2 hover:underline">
                  Teknik Analize Giriş
                </Link>{' '}
                yazımıza geri dönmenizi öneririz.
              </p>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/teknik-analiz-giris" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Teknik Analize Giriş: Sıfırdan Başlayanlar İçin Kılavuz <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    EMA, MACD, RSI: 3 Temel Gösterge ve Yorumu <ArrowRight className="h-3.5 w-3.5" />
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
              Bu içerik yatırım tavsiyesi değildir. Yalnızca eğitim ve bilgilendirme amaçlıyla hazırlanmıştır.
              Yatırım kararlarınız için kendi araştırmanızı yapmanız ve gerekirse profesyonel destek almanız
              önerilir.
            </p>
          </article>

          <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4 text-sm">
            <Link to="/egitim/bilanco-okuma" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Önceki: Bilanço Okuma
            </Link>
            <Link to="/egitim/yatirim-stratejisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Yatırım Stratejisi <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
