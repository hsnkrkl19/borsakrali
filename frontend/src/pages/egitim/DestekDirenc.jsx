import { Link } from 'react-router-dom'
import { Target, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'
import BrandMark from '../../components/BrandMark'

export default function DestekDirenc() {
  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3 text-sm text-gold-400 hover:text-gold-300">
            <BrandMark size="sm" />
            Borsa Krali
          </Link>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link to="/egitim" className="text-gray-400 hover:text-white">Egitim</Link>
            <Link to="/hakkimizda" className="text-gray-400 hover:text-white">Hakkimizda</Link>
            <Link to="/iletisim" className="text-gray-400 hover:text-white">Iletisim</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <nav aria-label="breadcrumb" className="mb-4 text-xs text-gray-500">
            <Link to="/" className="hover:text-gold-400">Borsa Krali</Link>
            <span className="mx-2 text-gray-600">/</span>
            <Link to="/egitim" className="hover:text-gold-400">Egitim</Link>
            <span className="mx-2 text-gray-600">/</span>
            <span className="text-gray-300">Destek ve Direnc</span>
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
              Destek ve Direnc Seviyeleri Nasil Cizilir?
            </h1>
            <p className="text-sm text-gray-500">10 Mayis 2026 — yaklasik 9 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Destek ve direnc, teknik analizin en eski ve hala en degerli kavramlaridir. Onlarca indikator
              gelmis ve gitmistir; ancak destek-direnc kavrami yatirimcilarin grafige bakar bakmaz dusundugu
              ilk kavram olmaya devam eder. Bu yazida yatay destek-direnc cizimini, trend cizgilerini, pivot
              noktalarini, Fibonacci geri cekilmesini, psikolojik seviyeleri ve sahte kirilim tuzaklarini
              detayli ele alacagiz.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Destek ve Direnc Nedir?</h2>
              <p>
                Destek, fiyatin asagi yonlu hareketinde alici talebinin yogunlastigi ve dususun yavasladigi
                seviyedir. Direnc ise yukari yonlu hareketinde satici baskisinin arttigi ve yukselislerin
                kesildigi seviyedir. Bu seviyeler birer cizgi degil, aslinda ufak bir aralik (zone)
                seklindedir.
              </p>
              <p className="mt-3">
                Onemli bir kural: bir destek kirildiginda direnc, bir direnc kirildiginda ise destek haline
                gelir. Bu rol degisikligi (role reversal), profesyonellerin grafik okumalarinda en cok
                kullandigi prensiptir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yatay Destek-Direnc Cizimi</h2>
              <p>
                En basit cizim yontemidir. Gecmis grafikte fiyatin birden cok kez tepki verdigi seviyeler
                isaretlenir. Iki onemli kural vardir:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Bir seviyenin destek/direnc sayilmasi icin en az iki dokunus istenir; uc dokunus daha guclu sayilir.</li>
                <li>Cok eski ve uzun zaman test edilmemis seviyeler, geceren tasimaz; yakin gecmisteki seviyeler daha onceliklidir.</li>
              </ul>
              <p className="mt-3">
                Pratik ornek: THYAO hissesi 250 TL seviyesini gecmis 6 ay icinde uc kez test edip her seferinde
                yukari donduyse, 250 TL onemli bir destek olarak kabul edilir. Bu seviye kirildiginda fiyatin
                bir alt destek seviyesine kadar dusmesi muhtemeldir.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  Ipucu
                </h4>
                <p className="text-sm leading-6">
                  Destek-direnc seviyelerini gunluk grafikte cizmeden once haftalik grafige goz atin. Haftalik
                  grafikteki seviyeler, gunluk grafiktekilerden cok daha guclu reaksiyon uretir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Trend Cizgileri</h2>
              <p>
                Yukselen trende dokunan dipler bir trend destegi cizgisi cizer; dusen trende dokunan tepeler
                trend direnci cizgisi olusturur. Cizimde dokunma sayisi onemlidir: tek dokunusla cizgi
                gecerli sayilmaz. En az iki dokunus gerekli, ucuncu dokunusla cizgi resmen gecerli olur.
              </p>
              <p className="mt-3">
                Trend cizgisinin acisi da onemlidir. Cok dik bir trend (ornegin 60 derece uzerinde) genelde
                surdurulemez ve hizla bozulur. 30-45 derece arasi acilarla yukselen trendler, en saglikli ve
                uzun omurlu olanlardir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Pivot Noktalari</h2>
              <p>
                Pivot noktalari, bir onceki gunun yuksek, dusuk ve kapanis fiyatlarini kullanarak gun ici
                destek-direnc seviyelerini hesaplayan formul tabanli bir yontemdir. Klasik pivot noktasi
                formulu su sekildedir:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`Pivot (P) = (Onceki Gun Yuksek + Dusuk + Kapanis) / 3

Direncler:
R1 = (2 * P) - Onceki Gun Dusuk
R2 = P + (Onceki Gun Yuksek - Dusuk)
R3 = R1 + (Onceki Gun Yuksek - Dusuk)

Destekler:
S1 = (2 * P) - Onceki Gun Yuksek
S2 = P - (Onceki Gun Yuksek - Dusuk)
S3 = S1 - (Onceki Gun Yuksek - Dusuk)`}
              </pre>
              <p className="mt-3">
                Pivot noktalari ozellikle gun ici (intraday) islem yapan yatirimcilar tarafindan kullanilir.
                Fiyat pivot noktasi uzerindeyse gunun genel havasi pozitif, altindaysa negatif olarak okunur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Fibonacci Geri Cekilmesi</h2>
              <p>
                Fibonacci sayilarindan turetilen oranlar (%23.6, %38.2, %50, %61.8, %78.6) yukselen veya
                dusen bir hareketin geri cekilmesi sirasinda destek-direnc bolgeleri olarak kullanilir. Cizmek
                icin son anlamli dipten son anlamli tepeye Fibonacci aracini cekmeniz yeterlidir.
              </p>
              <p className="mt-3">
                En cok izlenen seviyeler %38.2, %50 ve %61.8'dir. Saglikli bir yukselen trendde fiyatin %50
                geri cekilme seviyesinde alici bulmasi beklenir. %61.8'in altina sarkan duzeltmeler trendin
                bozulmaya basladigina isaret edebilir.
              </p>
              <p className="mt-3">
                Pratik ornek: AKBNK hissesi 30 TL'den 50 TL'ye yukseldi. Geri cekilmede %38.2 seviyesi 42.4
                TL, %50 seviyesi 40 TL, %61.8 seviyesi 37.6 TL olur. Bu uc seviye, kisa vadeli alim icin
                potansiyel tepki bolgeleridir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Psikolojik Seviyeler</h2>
              <p>
                Yuvarlak rakamlar (50, 100, 200, 500 gibi) kalabaligin gozune carptigi icin dogal birer
                destek-direnc bolgesidir. BIST 100 endeksi 10.000 puan seviyesi yillarca onemli bir psikolojik
                esik olmustur. Hisse senedi bazinda da 100 TL seviyesi yatirimcilar icin "psikolojik" bir
                noktadir.
              </p>
              <p className="mt-3">
                Ozellikle bireysel yatirimcilarin yogun oldugu hisselerde bu psikolojik seviyeler, teknik
                seviyelerden bile daha guclu reaksiyon urettigi gozlemlenir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kirilim ve Sahte Kirilim</h2>
              <p>
                Kirilim, fiyatin destek veya direnc seviyesini guclu bir hareketle gecmesidir. Saglikli
                kirilim icin uc sart aranir:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Kapanis teyidi:</strong> Sadece gun ici degil, kapanisla seviye asilmali.</li>
                <li><strong className="text-white">Hacim teyidi:</strong> Kirilim gunu hacmi 20 gun ortalamasinin uzerinde olmali.</li>
                <li><strong className="text-white">Geri test (retest):</strong> Kirildiktan sonra fiyatin kirilan seviyeye geri donmesi ve oradan tepki vermesi en saglikli teyiddir.</li>
              </ul>
              <p className="mt-3">
                Sahte kirilim (fakeout), bu sartlar olusmadan yapilan kirilimdir. Ozellikle dusuk hacimli
                kirilimlar genelde sahtedir ve yatirimciyi tuzaga dusurmek icin kullanilan klasik bir
                manipulasyon orneklerinden biridir. Stop seviyesi yatirimcinin tam istemedigi yerde
                tetiklenir, sonra fiyat geri doner.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Onemli Not
                </h4>
                <p className="text-sm leading-6">
                  Kapanis gerceklesmeden kirilima inanmayin. Gun ici 1-2 saatlik bir asma, ozellikle dusuk
                  hacimle gerceklesiyorsa cogunlukla geri donus icindir. Saglam yatirimcilar gun ici fiyat
                  hareketine degil, kapanisa bakar.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Hacim Profili (Volume Profile)</h2>
              <p>
                Hacim profili, fiyat eksenine gore (yatay degil dikey hacim cubuklari) hangi fiyat
                seviyelerinde ne kadar islem gerceklestigini gosterir. Yuksek hacimli fiyat noktalari (HVN —
                High Volume Node) dogal destek-direnc bolgesidir; cunku bu seviyelerde cok sayida yatirimci
                pozisyon almistir ve fiyat tekrar ziyaret ettiginde hareketli reaksiyon olusur.
              </p>
              <p className="mt-3">
                Dusuk hacimli bolgeler (LVN — Low Volume Node) ise tersi bicimde calisir; fiyat bu bolgelerden
                hizla gecme egilimindedir. Hacim profili ozellikle gunluk ve haftalik grafikte etkili sonuc
                verir. Ornegin THYAO hissesinde son 3 ayin hacim profilini ekleyince, 220 TL ve 245 TL gibi
                belirgin yogunluk noktalari ortaya cikabilir; bunlar manuel cizdiginiz seviyelerle ortustugu
                taktirde guven artar.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">VWAP — Hacim Agirlikli Ortalama Fiyat</h2>
              <p>
                VWAP (Volume Weighted Average Price), gun ici islemlerde fiyat ile hacmin carpiminin toplaminin
                toplam hacme bolunmesi ile bulunur. Buyuk kurumsal yatirimcilar islemlerini VWAP cizgisine
                yakin gerceklestirmeye calisir; cunku bu seviye gun icindeki "ortalama islem fiyati"dir.
              </p>
              <p className="mt-3">
                Pratik kullanim: bir hisse VWAP cizgisinin uzerinde seyrediyorsa, gun ici alici hakimiyetinden
                soz edilir. VWAP, gun icinde dinamik bir destek-direnc gibi davranir. Ozellikle BIST 30
                hisselerinde gun ici islem yapanlar tarafindan yogun bicimde takip edilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Coklu Zaman Dilimi Analizi</h2>
              <p>
                Etkili destek-direnc analizi, en az iki zaman dilimini birlikte degerlendirmeyi gerektirir.
                Standart yaklasim:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Aylik grafik:</strong> Yapisal ana destek-direnc.</li>
                <li><strong className="text-white">Haftalik grafik:</strong> Orta vadeli yon ve seviyeler.</li>
                <li><strong className="text-white">Gunluk grafik:</strong> Giris-cikis kararlari.</li>
                <li><strong className="text-white">4 saat / 1 saat:</strong> Hassas zamanlama.</li>
              </ul>
              <p className="mt-3">
                Onemli olan, alt zaman dilimindeki kararlarinizin ust zaman dilimindeki yapiyla celismemesi.
                Aylik grafikte dusen trendde olan bir hisse icin gunluk grafikte agresif alim sinyali
                aramak; istisnai durumlar haricinde verimsizdir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Hareketli Ortalama Destek-Direnc</h2>
              <p>
                Yatay seviyelerin disinda, hareketli ortalamalar (ozellikle 50 ve 200 EMA) dinamik destek ve
                direnc gorevi gorur. Yukselen trendde fiyat 50 EMA'ya cekilip oradan tepki vermeyi tercih
                eder; dusen trendde fiyat 50 EMA'ya yukselip oradan satis goruntulu reaksiyon verir.
              </p>
              <p className="mt-3">
                200 EMA, ozellikle uzun vadeli yatirimcilar icin temel referans cizgisidir. 200 EMA'nin
                uzerinde isleyen bir hisse "uzun donemde alici hakim", altinda olan ise "uzun donemde satici
                hakim" olarak yorumlanir. Bu cizgiyi geri kazanmak veya kaybetmek; cogunlukla buyuk pozisyon
                degisikliklerine yol acar.
              </p>
              <p className="mt-3">
                Pratik ornek: AKBNK 200 EMA cizgisinin uzerinde aylar boyunca seyrederken, fiyat bu cizgiye
                cekildiginde alici talebinin geldigi gozlemlenir. Ancak bir gun bu cizgi gunluk kapanis ile
                kirilirsa; orta vadeli yatirimcilar icin bu kritik bir uyari sinyalidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Dilim Bazli Destek-Direnc</h2>
              <p>
                Bazi yatirimcilar onemli yuzde dilimlerini destek-direnc olarak kullanir. Bu yaklasimda
                bir hissenin yillik en yuksek ve en dusuk seviyesi alinarak %25, %50, %75 noktalari
                isaretlenir. %50 cizgisi (yillik orta nokta) ozellikle psikolojik etki yaratir; bir hisse
                yillik aralikinin ust yarisina geciyorsa pozitif sentiment kuvvetli, alt yarisina dusuyorsa
                zayiflama belirginlesir.
              </p>
              <p className="mt-3">
                Bu yaklasim Borsa Krali'ndaki 52 haftalik en yuksek/dusuk gostergeleriyle entegredir; tek
                bakista bir hissenin yil boyunca neredeyizini gormek icin pratik bir referans saglar.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Order Block ve Likidite Bolgeleri</h2>
              <p>
                Modern teknik analizde "order block" ve "likidite havuzu" kavramlari ozellikle kurumsal
                takipci yatirimcilar arasinda yayilmistir. Order block; buyuk emirlerin gerceklesmis oldugu
                ve sonrasinda hizli hareket olusan mum bolgeleridir. Likidite havuzu ise stop emirlerinin
                yogunlastigi alanlardir.
              </p>
              <p className="mt-3">
                Pratik anlami soyledir: bir hissenin onceki onemli dipinin hemen altinda yogun stop emri
                vardir. Manipulatif hareketlerde fiyat o seviyenin biraz altina inip stoplari toplar, sonra
                hizla yukari doner. Bu nedenle stop emirlerini onceki dibin tam altina degil; biraz uzaginda
                yerlestirmek pratik bir savunma yontemidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Pratik Cizim Adimlari</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>Haftalik grafikte ana destek-direnc bolgelerini cizin.</li>
                <li>Gunluk grafige inip ara seviyeleri ekleyin.</li>
                <li>Trend cizgilerini ekleyin (yukselen veya dusen).</li>
                <li>Son anlamli hareketin Fibonacci'sini cizin.</li>
                <li>Yuvarlak psikolojik seviyeleri isaretleyin.</li>
                <li>Pivot noktalarini gunluk olarak kontrol edin (ozellikle gun ici islemlerde).</li>
              </ol>
              <p className="mt-3">
                Borsa Krali platformunda Malaysian SNR sayfasi, vucut bazli (body-based) destek-direnc
                bolgelerini otomatik olarak hesaplar. Manuel cizimi guclendirmek icin{' '}
                <Link to="/egitim/temel-gostergeler" className="text-gold-400 underline-offset-2 hover:underline">
                  EMA, MACD, RSI
                </Link>{' '}
                yazimizdaki indikatorlerle teyit etmenizi, baslangic teorisi icin{' '}
                <Link to="/egitim/teknik-analiz-giris" className="text-gold-400 underline-offset-2 hover:underline">
                  Teknik Analize Giris
                </Link>{' '}
                yazimiza geri donmenizi oneririz.
              </p>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakali</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/teknik-analiz-giris" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Teknik Analize Giris: Sifirdan Baslayanlar Icin Kilavuz <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    EMA, MACD, RSI: 3 Temel Gosterge ve Yorumu <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/yatirim-stratejisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Yatirim Stratejisi Olusturma: 5 Adim <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              </ul>
            </section>

            <p className="border-t border-white/5 pt-4 text-xs text-gray-500">
              Bu icerik yatirim tavsiyesi degildir. Yalnizca egitim ve bilgilendirme amaciyla hazirlanmistir.
              Yatirim kararlariniz icin kendi arastirmanizi yapmaniz ve gerekirse profesyonel destek almaniz
              onerilir.
            </p>
          </article>

          <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4 text-sm">
            <Link to="/egitim/bilanco-okuma" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Onceki: Bilanco Okuma
            </Link>
            <Link to="/egitim/yatirim-stratejisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Yatirim Stratejisi <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
