import { Link } from 'react-router-dom'
import { BookOpen, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'
import BrandMark from '../../components/BrandMark'

export default function TeknikAnalizGiris() {
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
            <span className="text-gray-300">Teknik Analize Giris</span>
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
              Teknik Analize Giris: Sifirdan Baslayanlar Icin Kilavuz
            </h1>
            <p className="text-sm text-gray-500">10 Mayis 2026 — yaklasik 8 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Teknik analiz, fiyat ve hacim verileri uzerinden gelecekteki olasi fiyat hareketlerini tahmin etmeyi
              amaclayan calisma alanidir. Sirketin defter degerine, kazanc beklentilerine ya da makro verilere
              degil; dogrudan grafige bakar. Yeni baslayan bir yatirimcinin teknik analizle tanismasi, piyasanin
              kendi dilini ogrenmesi anlamina gelir. Bu yazida temel kavramlari, grafik turlerini, trend
              kavramini, hareketli ortalamalari ve hacim analizini sade bir bicimde aciklayacagiz.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Teknik Analiz Nedir?</h2>
              <p>
                Teknik analiz, gecmis fiyat ve hacim hareketlerinin kalip ve yapilarini inceleyerek piyasa
                psikolojisini okumaya calisan disiplindir. Temelinde uc varsayim vardir: piyasa her seyi fiyatlar,
                fiyatlar trendler halinde hareket eder ve tarih kendini tekrarlama egilimindedir. Bu varsayimlar
                Charles Dow tarafindan 19. yuzyil sonlarinda formule edilmistir ve gunumuzdeki teknik analizin
                temelini olusturur.
              </p>
              <p className="mt-3">
                Bir hisse senedi, ornegin THYAO, fiyat grafiginde dalgali bir seyir gosterirken; aslinda binlerce
                yatirimcinin alim-satim kararinin matematiksel toplamini cizer. Teknik analist bu izlerin
                arkasindaki davranisi okumaya calisir: yatirimci hangi seviyeden korkup satti, hangi seviyeden
                guvenle aldi?
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Teknik Analizin Kisa Tarihi</h2>
              <p>
                Modern teknik analizin atasi sayilan Charles Dow, 1880'lerde Wall Street Journal kosesinde
                piyasanin trend halinde hareket ettigini yaziyordu. Sonradan Dow Teorisi olarak anilan bu
                yaklasim, birincil trend, ikincil duzeltme ve gunluk dalgalanma ayrimi yaparak modern teknik
                analizin temelini atti.
              </p>
              <p className="mt-3">
                20. yuzyilda Japon mum cubuklari Bati piyasalarina giris yapti. Steve Nison'un 1991'deki kitabi
                ile Doji, Cekic, Yutan Mum gibi formasyonlar uluslararasilasti. Daha sonra Welles Wilder RSI,
                ATR, ADX gibi gostergeleri tanitti. Gerald Appel MACD'yi gelistirdi. Bugun bu araclarin tamami,
                bir BIST hissesinin grafiginde tek tikla incelenebilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Grafik Tipleri</h2>
              <p>
                Teknik analizde uc temel grafik turu kullanilir. Her biri ayni veriyi farkli bicimde gosterir
                ve farkli detay seviyesi sunar.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">1. Cizgi Grafik</h3>
              <p>
                Yalnizca kapanis fiyatlarini noktasal olarak birlestirir. En sade goruntudur ve uzun donem trendleri
                gormek icin idealdir. Ornegin BIST 100 endeksinin 20 yillik seyrini cizgi grafikle bakildiginda
                ana yonun yukari oldugu rahatca okunur.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">2. Bar (Cubuk) Grafik</h3>
              <p>
                Her cubuk; o periyottaki acilis, kapanis, en yuksek ve en dusuk fiyatlari (OHLC) verir. Soldaki
                cizgi acilisi, sagdaki kapanisi temsil eder. Kapanis acilisin uzerindeyse fiyat yukselmistir.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">3. Mum (Candlestick) Grafik</h3>
              <p>
                Bugun en yaygin kullanilan grafik turudur. Govde acilis-kapanis arasini, fitiller en yuksek-en
                dusuk noktalari gosterir. Yesil/beyaz govde fiyatin yukseldigini, kirmizi/siyah govde dustugunu
                ifade eder. Mum formasyonlari (Yutan Mum, Cekic, Doji) tek basina sinyal uretebilir.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  Ipucu
                </h4>
                <p className="text-sm leading-6">
                  Yeni baslayanlar icin gunluk veya haftalik mum grafigi ile baslamak; daha kucuk zaman
                  dilimlerine gore daha az gurultu icerir. 5 dakikalik grafik, deneyim kazanmadan bakildiginda
                  cogu zaman zarar verir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Trend Kavrami</h2>
              <p>
                Teknik analizin en degerli ilkesi soyledir: trend dostundur. Piyasa belirli bir yonde hareket
                etmeye basladiginda, bu yon kendini bir sure surdurme egilimindedir. Trend uc bicimde olabilir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Yukselen trend:</strong> Daha yuksek tepeler ve daha yuksek
                  dipler. Ornegin AKBNK, 2024 baslarinda 32 TL'den itibaren olusturdugu yuksek dipler ile
                  yukselen trende girdi.
                </li>
                <li>
                  <strong className="text-white">Dusen trend:</strong> Daha dusuk tepeler ve daha dusuk dipler.
                  Yatirimci genelde dusen trendde alim yapmaktan kacinmalidir.
                </li>
                <li>
                  <strong className="text-white">Yatay trend:</strong> Fiyat belirli bir aralikta sikisir.
                  Kirilim sinyali beklenir.
                </li>
              </ul>
              <p className="mt-3">
                Trend cizgileri, en az iki dibi (yukselen trend) veya iki tepeyi (dusen trend) birlestirerek
                cizilir. Gec yapilan dokunuslar trendin gecerliligini guclendirir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Hareketli Ortalamalar</h2>
              <p>
                Hareketli ortalama (Moving Average), belirli sayidaki kapanis fiyatlarinin ortalamasini cizen
                bir cizgidir. Fiyatin hareketini yumusatir ve trend yonu hakkinda hizli bir okuma sunar. Iki
                temel turu vardir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">SMA (Simple Moving Average):</strong> Basit ortalamadir. Son
                  20 gunun kapanislarinin toplaminin 20'ye bolunmesi 20 gunluk SMA'yi verir.
                </li>
                <li>
                  <strong className="text-white">EMA (Exponential Moving Average):</strong> Son fiyatlara daha
                  fazla agirlik verir; bu yuzden trend donuslerini SMA'ya gore daha hizli yakalar.
                </li>
              </ul>
              <p className="mt-3">
                Pratik kullanim ornegi: KCHOL'un 50 gunluk EMA cizgisi 200 gunluk EMA cizgisinin uzerine
                ciktiginda buna golden cross denir ve uzun donemli yukselis sinyali olarak yorumlanir. Tersi
                durum (death cross) ise zayifligi isaret edebilir. EMA, MACD ve RSI'nin daha detayli kullanimi
                icin{' '}
                <Link to="/egitim/temel-gostergeler" className="text-gold-400 underline-offset-2 hover:underline">
                  EMA, MACD, RSI: 3 Temel Gosterge ve Yorumu
                </Link>{' '}
                makalemize bakabilirsiniz.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Hacim Analizi</h2>
              <p>
                Hacim, belirli bir periyotta el degistiren hisse adedidir. Fiyat hareketinin guvenilirligi
                konusunda kritik bilgi tasir. Genel kural: bir kirilim, ortalamadan yuksek hacimle
                gerceklesirse anlamlidir; dusuk hacimli kirilim sahte cikma egilimindedir.
              </p>
              <p className="mt-3">
                Ornegin SAHOL hissesi belirgin bir direnci kirdiginda, kirilim gunu hacmi son 20 gun
                ortalamasinin uzerindeyse alici talebinin gercek oldugu varsayilir. Tersi durumda, az alici ile
                fiyatin direnci asip geri donmesi muhtemeldir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Teknik Analize Yonelik Elestiriler</h2>
              <p>
                Akademik dunyada Etkin Piyasalar Hipotezi savunucularina gore tum bilgi fiyata yansimistir ve
                teknik analiz uzun vadede getiri uretmez. Pratikte ise pek cok piyasa katilimcisi teknik
                seviyeleri gozledigi icin destek-direnc gibi noktalar kendi kendini gerceklestiren tahminler
                haline gelir. Yine de teknik analiz tek basina yeterli degildir; temel analizle birlikte
                kullanilmasi onerilir.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Onemli Not
                </h4>
                <p className="text-sm leading-6">
                  Teknik analiz olasilik bilimidir, kesinlik degil. Hicbir formasyon yuzde 100 dogru cikmaz.
                  Risk yonetimi olmadan yapilan teknik islemler, dogru sinyallere ragmen kayipla
                  sonuclanabilir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Temel Mum Formasyonlari</h2>
              <p>
                Mum formasyonlari, piyasa psikolojisinin gorsel ozetidir. Tek bir mumun acilis-kapanis-fitil
                yapisi, yatirimcilarin o periyottaki kararsizligini, kararliligini veya panigini gosterir. En
                cok izlenen birkac formasyon:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Doji:</strong> Acilis ve kapanis fiyatlari neredeyse esit.
                  Kararsizlik anlamina gelir. Yukselen trendin tepesindeki bir Doji, donus uyarisi olabilir.
                </li>
                <li>
                  <strong className="text-white">Cekic (Hammer):</strong> Kucuk govdeli, alt fitili uzun bir
                  mum. Genelde dusus sonrasi olusursa donusun habercisidir; alicilarin dipte devreye girdigini
                  gosterir.
                </li>
                <li>
                  <strong className="text-white">Yutan Mum (Engulfing):</strong> Iki periyotluk formasyon.
                  Ikinci mumun govdesi, birincinin govdesini tamamen kapsar. Yon degisikligini ifade eder.
                </li>
                <li>
                  <strong className="text-white">Vurus (Shooting Star):</strong> Yukselen trendin tepesinde
                  uzun ust fitilli bir mum. Yorgunluk ve donus uyarisidir.
                </li>
              </ul>
              <p className="mt-3">
                Mum formasyonlari tek baslarina degil, mevcut trend ve destek-direnc seviyeleri ile birlikte
                yorumlanir. Ornegin GARAN hissesi onemli bir destege geldiginde olusan bir Cekic mumu, sadece
                havada gerceklesen bir Cekic'ten cok daha guclu sinyaldir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Klasik Grafik Formasyonlari</h2>
              <p>
                Mum bazli formasyonlarin disinda, daha uzun donemde olusan ve kalabaligin grafige cizmesini
                kolaylastiran formasyonlar vardir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Bas-Omuz (Head and Shoulders):</strong> Yukselen trendin
                  sonunda olusan donus formasyonu. Sol omuz, bas, sag omuz ve boyun cizgisi kavramlari
                  vardir. Boyun cizgisi kirildiginda hedef, baslarin tepesinden boyun cizgisine olan mesafe
                  kadar asagiya projekte edilir.
                </li>
                <li>
                  <strong className="text-white">Cifte Tepe / Cifte Dip:</strong> Iki tepe veya iki dip ayni
                  seviyede tekrarlanir. M ve W harfine benzer. Boyun cizgisinin kirilmasi sinyaldir.
                </li>
                <li>
                  <strong className="text-white">Ucgen (Triangle):</strong> Yukselen, dusen veya simetrik
                  ucgen formasyonlari sikismayi temsil eder. Sikismadan kirilim genelde guclu hareket getirir.
                </li>
                <li>
                  <strong className="text-white">Bayrak (Flag):</strong> Hizli yukselis sonrasi olusan kucuk
                  duzeltme kanali. Flagin yukari kirilimi trend devamini gosterir.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Hacim ve Fiyat Iliskisi</h2>
              <p>
                Hacim ile fiyat hareketinin yon iliskisi, sinyallerin gucunu belirler. Klasik Wyckoff
                ilkelerine gore:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Yukselen fiyat + artan hacim: saglikli yukselis (alici talebi gercek).</li>
                <li>Yukselen fiyat + azalan hacim: zayif yukselis (yorgunluk, donus riski).</li>
                <li>Dusen fiyat + artan hacim: panik satis (devam riski).</li>
                <li>Dusen fiyat + azalan hacim: zayif dusus (dipten donus yakin olabilir).</li>
              </ul>
              <p className="mt-3">
                Borsa Krali platformundaki Canli Heatmap ekraninda hacim/fiyat iliskisini gorsel olarak takip
                edebilirsiniz. Yine ayni ekranda BIST 30 hisselerinin gun ici hacim sapmalari renk bazli
                gorulur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yeni Baslayanlar Icin Yol Haritasi</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>BIST 100 endeksini gunluk grafikte takip ederek gorsel okuma kapasitenizi gelistirin.</li>
                <li>Mum cubuklarini ve tek tek mum formasyonlarini ezberlemek yerine grafik uzerinde tanimaya calisin.</li>
                <li>Bir veya iki indikatorle baslayin (orn. 50 EMA + RSI). Her seyi ekrana eklemek yerine basit kalin.</li>
                <li>Her teknik kuralinizi gecmise dogru test edin (kagit uzerinde de olur).</li>
                <li>Risk yonetimi olmadan asla islem girmeyin: zarar durdur seviyesi onceden belirlenmeli.</li>
                <li>Hacim, fiyat ve trendi her zaman birlikte degerlendirin; tek basina indikator yetmez.</li>
                <li>Defter tutun: her islemi neden actiniz, neden kapattiniz, sonucu ne oldu — yazili kayit becerinizi gelistirir.</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakali</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    EMA, MACD, RSI: 3 Temel Gosterge ve Yorumu <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/destek-direnc" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Destek ve Direnc Seviyeleri Nasil Cizilir? <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Tum makaleler
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
