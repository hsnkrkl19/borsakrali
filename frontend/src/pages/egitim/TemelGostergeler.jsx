import { Link } from 'react-router-dom'
import { BarChart3, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'
import BrandMark from '../../components/BrandMark'

export default function TemelGostergeler() {
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
            <span className="text-gray-300">EMA, MACD, RSI</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <BarChart3 className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                Teknik
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              EMA, MACD, RSI: 3 Temel Gosterge ve Yorumu
            </h1>
            <p className="text-sm text-gray-500">10 Mayis 2026 — yaklasik 10 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Teknik analizdeki yuzlerce gosterge arasindan en cok kullanilan ucu EMA, MACD ve RSI'dir. Bunlar
              tek baslarina sinyal uretebildikleri gibi, birbirini destekleyici bicimde de kullanilabilirler.
              Bu yazida ucunun de matematiksel formulu, parametrelerinin anlami ve BIST hisselerinden gercek
              ornekler uzerinden yorumlama yontemini ele alacagiz.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Teknik Indikator Nedir?</h2>
              <p>
                Indikator, fiyat ve hacim verileri kullanilarak matematiksel olarak hesaplanan ve grafige
                yardimci cizgi/eger olarak eklenen araclardir. Iki ana sinifa ayrilirlar.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Trend takipci (lagging):</strong> Trendi sonradan teyit eder.
                  Hareketli ortalamalar (EMA, SMA) ve MACD bu kategoridedir.
                </li>
                <li>
                  <strong className="text-white">Onculu (leading) / Salinim:</strong> Asiri alim-asiri satim
                  durumlarini onceden isaret etmeye calisir. RSI, Stochastic, CCI bu sinifa girer.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">EMA — Ustel Hareketli Ortalama</h2>
              <p>
                EMA (Exponential Moving Average), son fiyatlara daha fazla agirlik vererek hesaplanan bir
                ortalamadir. Klasik SMA'ya gore trend donusunu daha hizli yakalar. Genel formul su sekildedir:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`Multiplier = 2 / (N + 1)
EMA(bugun) = (Kapanis(bugun) * Multiplier) + (EMA(dun) * (1 - Multiplier))

N = periyot sayisi (orn. 20, 50, 200)`}
              </pre>
              <p className="mt-3">
                Yatirimcilarin en cok takip ettigi periyotlar 20, 50, 100, 200 gunluktur. 50 ve 200 EMA, uzun
                donemli trendi belirleyen kritik egilim cizgileridir. Bir hisse 200 EMA'sinin uzerindeyse
                "uzun donem yukseliste"; altinda ise "uzun donem dususte" sayilir.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">EMA Sinyalleri</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Golden Cross:</strong> 50 EMA, 200 EMA'nin uzerine ciktiginda
                  uzun vadeli yukselis sinyali olarak yorumlanir.
                </li>
                <li>
                  <strong className="text-white">Death Cross:</strong> 50 EMA, 200 EMA'nin altina indiginde
                  uzun vadeli zayiflik sinyalidir.
                </li>
                <li>
                  <strong className="text-white">EMA destek/direnc:</strong> Yukselen trendde fiyat 50 EMA'ya
                  cekildiginde tepki verebilir; bu seviye dinamik destektir.
                </li>
              </ul>

              <p className="mt-3">
                Pratik ornek: AKBNK hissesi 50 EMA'sinin uzerinde seyrederken bu cizgiye duzenli olarak
                cekilip alici bulan bir yapida ise, trendin saglikli oldugu kabul edilir. Fiyat 50 EMA'nin
                altina kapanip orada kalirsa, kisa donemli yapinin bozuldugu yorumu yapilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">MACD — Moving Average Convergence Divergence</h2>
              <p>
                MACD, Gerald Appel tarafindan 1970'lerin sonunda gelistirilmistir. Iki farkli EMA arasindaki
                farkin degisimini olcer. Standart parametreler 12, 26 ve 9'dur.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`MACD Cizgisi   = EMA(12) - EMA(26)
Sinyal Cizgisi = EMA(9) of MACD Cizgisi
Histogram      = MACD Cizgisi - Sinyal Cizgisi`}
              </pre>
              <p className="mt-3">
                Pozitif histogram, MACD cizgisinin sinyal cizgisinin uzerinde oldugunu ve momentumun yukari
                yonlu oldugunu gosterir. Negatif histogram tersini ifade eder.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">MACD Sinyalleri</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Sinyal kesisimi:</strong> MACD cizgisi sinyal cizgisini
                  yukari kesince alis, asagi kesince satis sinyalidir.
                </li>
                <li>
                  <strong className="text-white">Sifir cizgisi gecisi:</strong> MACD'nin sifir cizgisinin
                  uzerine cikmasi yukari momentumun guclenmesi olarak okunur.
                </li>
                <li>
                  <strong className="text-white">Uyumsuzluk (divergence):</strong> Fiyat yeni yuksek yaparken
                  MACD daha dusuk tepe yapiyorsa olumsuz uyumsuzluk vardir; muhtemel zayifligi haber verir.
                </li>
              </ul>

              <p className="mt-3">
                Pratik ornek: KCHOL hissesi yatay seyirden cikarken MACD sifir cizgisini yukari kestiyse,
                trendin yon degistirme olasiligi artmistir. Yine de tek basina MACD sinyali yeterli degildir;
                hacim ve fiyat yapisi ile teyit edilmesi gerekir.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  Ipucu
                </h4>
                <p className="text-sm leading-6">
                  MACD bir trend takipci gostergedir. Yatay (range) piyasalarda cok sayida sahte sinyal
                  uretebilir. En verimli kullanildigi yer, belirgin trendin oldugu hisselerin gunluk
                  grafikleridir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">RSI — Relative Strength Index</h2>
              <p>
                RSI, J. Welles Wilder tarafindan 1978'de gelistirilmistir. Belirli bir periyotta yukari
                hareketler ile asagi hareketlerin orantisini hesaplayarak 0-100 arasinda bir deger uretir.
                Standart periyot 14'tur.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`RS = Ortalama Kazanc (14 periyot) / Ortalama Kayip (14 periyot)
RSI = 100 - (100 / (1 + RS))

RSI > 70 -> asiri alim bolgesi
RSI < 30 -> asiri satim bolgesi`}
              </pre>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">RSI Yorumu</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Asiri alim:</strong> RSI &gt; 70. Fiyatin kisa vadede tepe
                  yapma olasiligi yukselir; ancak guclu trendde uzun sure 70 uzerinde kalabilir.
                </li>
                <li>
                  <strong className="text-white">Asiri satim:</strong> RSI &lt; 30. Fiyatin kisa vadede dipten
                  donme olasiligi yukselir.
                </li>
                <li>
                  <strong className="text-white">Uyumsuzluk:</strong> Fiyat yeni dusuk yaparken RSI daha
                  yuksek dip yapiyorsa pozitif uyumsuzluk vardir; donus sinyali olabilir.
                </li>
              </ul>

              <p className="mt-3">
                Pratik ornek: SAHOL hissesi sert dusus sonrasi RSI 25-28 araligina indi ve birkac gun ust uste
                bu seviyede dipler yaparken fiyat daha dusuk dipler yapmadi. Bu pozitif uyumsuzluk donus
                hareketinin habercisi olabilir; ancak teyit icin mum formasyonu ve hacim de izlenmelidir.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Onemli Not
                </h4>
                <p className="text-sm leading-6">
                  Asiri alim her zaman satis sinyali, asiri satim her zaman alim sinyali degildir. Guclu
                  trend doneminde RSI haftalarca asiri bolgede kalabilir ve ters islem yapan yatirimci buyuk
                  zarar edebilir. RSI'yi her zaman trend yonu ile birlikte degerlendirin.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">3 Indikatoru Birlikte Kullanmak</h2>
              <p>
                EMA, MACD ve RSI farkli zaman eksenlerinde ve farkli yaklasimlarla calisir. Birlikte
                kullanildiginda birbirini teyit ederler. Ornek bir alim filtresi su sekilde kurulabilir:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Fiyat 50 EMA'nin uzerinde olsun (uzun trend yukari).</li>
                <li>MACD histogrami pozitife donsun (kisa momentum yukari).</li>
                <li>RSI 30-50 araligindan yukari donsun (asiri alim olmadan momentum guclensin).</li>
              </ul>
              <p className="mt-3">
                Borsa Krali platformundaki Teknik Analiz AI ekraninda bu uc gosterge bir arada degerlendirilir
                ve genel sinyal seviyesi olarak sunulur. Detayli destek-direnc cizimi icin{' '}
                <Link to="/egitim/destek-direnc" className="text-gold-400 underline-offset-2 hover:underline">
                  Destek ve Direnc Seviyeleri
                </Link>{' '}
                yazimiza, gostergelerin temel teorisi icin{' '}
                <Link to="/egitim/teknik-analiz-giris" className="text-gold-400 underline-offset-2 hover:underline">
                  Teknik Analize Giris
                </Link>{' '}
                yazimiza bakabilirsiniz.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Indikator Periyot Secimi</h2>
              <p>
                Standart parametreler (EMA 50, RSI 14, MACD 12-26-9) endustri kabulu olmustur ve cogu zaman
                yeterlidir. Ancak farkli zaman dilimlerinde farkli periyotlar daha anlamli olabilir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Gun ici (1-15 dk grafik):</strong> Daha kisa periyotlar (EMA
                  9, EMA 21; RSI 9). Daha hizli sinyal, daha fazla gurultu.
                </li>
                <li>
                  <strong className="text-white">Swing (1-4 saat ya da gunluk):</strong> Standart parametreler
                  uygun. Cogu kazikli sinyal bu zaman diliminde uretilir.
                </li>
                <li>
                  <strong className="text-white">Uzun vade (haftalik):</strong> Daha uzun periyotlar (EMA 200;
                  RSI 21). Sinyaller seyrektir ama saglamdir.
                </li>
              </ul>
              <p className="mt-3">
                Periyot uyumsuzlugu, bir sinyali iki ayri zaman diliminde teyit etmeye calisirken sik yapilan
                bir hatadir. Ornegin gunluk grafikte alis sinyali olan bir hisse, haftalikta hala dusen
                trendde olabilir. Karar verirken bir ust zaman dilimi (haftalik) ile bir alt zaman dilimi
                (gunluk) birlikte degerlendirilmelidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Coklu Indikator Stratejisi: Pratik Filtre</h2>
              <p>
                Tek tek indikator anlamak yerine, bunlari bir filtre olarak birlestirmek pratik kullanima daha
                yatkindir. Asagida orta vadeli swing alimlar icin onerilen filtre yer alir.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`SART 1: Haftalik kapanis 50 EMA uzerinde (uzun trend yukari)
SART 2: Gunluk fiyat 21 EMA uzerinde
SART 3: MACD histogrami pozitif ve genisliyor
SART 4: RSI 45-65 araligi (ne asiri alim ne de asiri satim)
SART 5: Hacim son 20 gun ortalamasinin uzerinde

Tum sartlar saglandi -> Aday liste
Bu adaylardan teknik destek-direnc cizimi ile en
saglam giris noktasi olani secilir.`}
              </pre>
              <p className="mt-3">
                Borsa Krali Tarama Analiz Merkezi, bu tip coklu sart filtrelerini BIST 100 uzerinde anlik
                taratmaniza imkan verir. Filtre olusturmak, her seyi ayri ayri grafikten takip etmekten cok
                daha verimlidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bollinger Bantlari ile Tamamlama</h2>
              <p>
                EMA, MACD ve RSI'nin temel uclu olmasi yaninda, profesyoneller cogu zaman buna Bollinger
                Bantlari'ni da ekler. Bollinger Bantlari, 20 periyotluk SMA cizgisinin uzerine ve altina iki
                standart sapma kadar mesafede iki bant cizer. Bantlar fiyat volatilitesine gore daralir ve
                genisler.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Bant sikismasi (Bollinger Squeeze):</strong> Bantlar
                  daraldigi donem volatilite dustugunu gosterir; yakin gelecekte buyuk bir hareket beklenir.
                </li>
                <li>
                  <strong className="text-white">Bant kirilimi:</strong> Fiyat ust banta dokunup geri donerse
                  asiri alim sinyali; alt banta dokunup donerse asiri satim sinyali olabilir.
                </li>
                <li>
                  <strong className="text-white">Bant yurumesi:</strong> Guclu trende fiyat ust bandi takip
                  ederek yukselir; bu donemde RSI yuksek seviyede kalmaya devam eder ve sat sinyali olarak
                  yanlis okunmamalidir.
                </li>
              </ul>
              <p className="mt-3">
                Bollinger Bantlari, RSI ile birlikte cok kullanisli bir kombinasyon sunar: alt banda dokunan
                bir hisse ayni anda RSI'da pozitif uyumsuzluk veriyorsa, donus olasiligi belirgin sekilde
                artar. Tersi durumda ust banda dokunup negatif uyumsuzluk olusan bir hissede satis baskisinin
                gelmesi muhtemeldir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yaygin Hatalar</h2>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Tek bir indikatorle islem girmek. Indikatorler arasindaki teyit cok degerlidir.</li>
                <li>5 dakikalik grafikte indikator kullanmak ve gurultuye yakalanmak.</li>
                <li>Asiri alim/satim seviyelerini mekanik bicimde alis-satis sinyali zannetmek.</li>
                <li>Backtest yapmadan, gormus oldugunuz tek bir basarili ornek uzerinden kural cikarmak.</li>
                <li>Risk yonetimi olmadan indikator sinyallerine gore islem girmek.</li>
                <li>Indikator parametrelerini surekli degistirip "ideal kombinasyon" aramak (data mining tuzagi).</li>
                <li>Indikator sinyaline gore alip mum kapanmasini beklemeden cikis yapmak.</li>
                <li>Cok sayida indikatoru ekrana eklemek ve birbiriyle celisen sinyaller arasinda kalmak.</li>
              </ul>
              <p className="mt-3">
                Sade kalin: iki ya da uc indikatorle baslayin, bunlari uzun sure kullanin ve davranislarini
                ezbereyleyin. Iyi bir indikator, dogru kullanilan basit bir indikatordur — gizemli bir formul
                degil.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Uyumsuzluk (Divergence) Analizi</h2>
              <p>
                MACD ve RSI'nin en degerli kullanim bicimlerinden biri uyumsuzluk (divergence) tespitidir.
                Uyumsuzluk; fiyat ile gostergenin farkli yonlerde hareket etmesidir ve cogu zaman trendin
                bozulmaya basladiginin habercisidir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Negatif (bearish) uyumsuzluk:</strong> Fiyat daha yuksek
                  tepe yapar; ancak RSI veya MACD daha dusuk tepe yapar. Yukselis zayifliyor demektir.
                </li>
                <li>
                  <strong className="text-white">Pozitif (bullish) uyumsuzluk:</strong> Fiyat daha dusuk dip
                  yapar; ancak gosterge daha yuksek dip yapar. Dususun yorgunluk yasadigini ifade eder.
                </li>
                <li>
                  <strong className="text-white">Gizli (hidden) uyumsuzluk:</strong> Trend devamini isaret
                  eden uyumsuzluk turudur. Yukselen trendde fiyat daha yuksek dip yaparken RSI daha dusuk
                  dip yapiyorsa, bu trendin devam edecegine isaret olabilir.
                </li>
              </ul>
              <p className="mt-3">
                Pratik ornek: SAHOL hissesi son tepe noktasinda 80 TL gorurken, bir onceki tepede 75 TL idi.
                Aralarinda RSI 78'den 68'e geriledi. Bu negatif uyumsuzluk, yukselisin yorulmasini ve olasi
                bir donus hareketini haber verebilir. Tek basina divergence islem sinyali degildir; mum
                formasyonu, hacim ve trend cizgisi ile birlikte yorumlanmalidir.
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
            <Link to="/egitim/bist100-rehberi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Onceki: BIST 100 Rehberi
            </Link>
            <Link to="/egitim/bilanco-okuma" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Bilanco Okuma <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
