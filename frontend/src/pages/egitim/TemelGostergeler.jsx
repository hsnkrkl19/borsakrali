import { Link } from 'react-router-dom'
import { BarChart3, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function TemelGostergeler() {
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
              EMA, MACD, RSI: 3 Temel Gösterge ve Yorumu
            </h1>
            <p className="text-sm text-gray-500">10 Mayıs 2026 — yaklaşık 10 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Teknik analizdeki yüzlerce gösterge arasından en çok kullanılan üçü EMA, MACD ve RSI'dir. Bunlar
              tek başlarına sinyal üretebildikleri gibi, birbirini destekleyici biçimde de kullanılabilirler.
              Bu yazıda üçünün de matematiksel formülü, parametrelerinin anlamı ve BIST hisselerinden gerçek
              örnekler üzerinden yorumlama yöntemini ele alacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Teknik İndikatör Nedir?</h2>
              <p>
                İndikatör, fiyat ve hacim verileri kullanılarak matematiksel olarak hesaplanan ve grafiğe
                yardımcı çizgi/eğer olarak eklenen araçlardır. İki ana sınıfa ayrılırlar.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Trend takipçi (lagging):</strong> Trendi sonradan teyit eder.
                  Hareketli ortalamalar (EMA, SMA) ve MACD bu kategoridedir.
                </li>
                <li>
                  <strong className="text-white">Öncülü (leading) / Salınım:</strong> Aşırı alım-aşırı satım
                  durumlarını önceden işaret etmeye çalışır. RSI, Stochastic, CCI bu sınıfa girer.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">EMA — Üstel Hareketli Ortalama</h2>
              <p>
                EMA (Exponential Moving Average), son fiyatlara daha fazla ağırlık vererek hesaplanan bir
                ortalamadır. Klasik SMA'ya göre trend dönüşünü daha hızlı yakalar. Genel formül şu şekildedir:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`Multiplier = 2 / (N + 1)
EMA(bugün) = (Kapanış(bugün) * Multiplier) + (EMA(dün) * (1 - Multiplier))

N = periyot sayısı (örn. 20, 50, 200)`}
              </pre>
              <p className="mt-3">
                Yatırımcıların en çok takip ettiği periyotlar 20, 50, 100, 200 günlüktür. 50 ve 200 EMA, uzun
                dönemli trendi belirleyen kritik eğilim çizgileridir. Bir hisse 200 EMA'sının üzerindeyse
                "uzun dönem yükselişte"; altında ise "uzun dönem düşüşte" sayılır.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">EMA Sinyalleri</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Golden Cross:</strong> 50 EMA, 200 EMA'nin üzerine çıktığında
                  uzun vadeli yükseliş sinyali olarak yorumlanır.
                </li>
                <li>
                  <strong className="text-white">Death Cross:</strong> 50 EMA, 200 EMA'nin altına indiğinde
                  uzun vadeli zayıflık sinyalidir.
                </li>
                <li>
                  <strong className="text-white">EMA destek/direnç:</strong> Yükselen trendde fiyat 50 EMA'ya
                  çekildiğinde tepki verebilir; bu seviye dinamik destektir.
                </li>
              </ul>

              <p className="mt-3">
                Pratik örnek: AKBNK hissesi 50 EMA'sının üzerinde seyrederken bu çizgiye düzenli olarak
                çekilip alıcı bulan bir yapıda ise, trendin sağlıklı olduğu kabul edilir. Fiyat 50 EMA'nın
                altına kapanıp orada kalırsa, kısa dönemli yapının bozulduğu yorumu yapılır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">MACD — Moving Average Convergence Divergence</h2>
              <p>
                MACD, Gerald Appel tarafından 1970'lerin sonunda geliştirilmiştir. İki farklı EMA arasındaki
                farkın değişimini ölçer. Standart parametreler 12, 26 ve 9'dur.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`MACD Çizgisi   = EMA(12) - EMA(26)
Sinyal Çizgisi = EMA(9) of MACD Çizgisi
Histogram      = MACD Çizgisi - Sinyal Çizgisi`}
              </pre>
              <p className="mt-3">
                Pozitif histogram, MACD çizgisinin sinyal çizgisinin üzerinde olduğunu ve momentumun yukarı
                yönlü olduğunu gösterir. Negatif histogram tersini ifade eder.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">MACD Sinyalleri</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Sinyal kesişimi:</strong> MACD çizgisi sinyal çizgisini
                  yukarı kesince alış, aşağı kesince satış sinyalidir.
                </li>
                <li>
                  <strong className="text-white">Sıfır çizgisi geçişi:</strong> MACD'nin sıfır çizgisinin
                  üzerine çıkması yukarı momentumun güçlenmesi olarak okunur.
                </li>
                <li>
                  <strong className="text-white">Uyumsuzluk (divergence):</strong> Fiyat yeni yüksek yaparken
                  MACD daha düşük tepe yapıyorsa olumsuz uyumsuzluk vardır; muhtemel zayıflığı haber verir.
                </li>
              </ul>

              <p className="mt-3">
                Pratik örnek: KCHOL hissesi yatay seyirden çıkarken MACD sıfır çizgisini yukarı kestiyse,
                trendin yön değiştirme olasılığı artmıştır. Yine de tek başına MACD sinyali yeterli değildir;
                hacim ve fiyat yapısı ile teyit edilmesi gerekir.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  MACD bir trend takipçi göstergedir. Yatay (range) piyasalarda çok sayıda sahte sinyal
                  üretebilir. En verimli kullanıldığı yer, belirgin trendin olduğu hisselerin günlük
                  grafikleridir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">RSI — Relative Strength Index</h2>
              <p>
                RSI, J. Welles Wilder tarafından 1978'de geliştirilmiştir. Belirli bir periyotta yukarı
                hareketler ile aşağı hareketlerin orantısını hesaplayarak 0-100 arasında bir değer üretir.
                Standart periyot 14'tür.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`RS = Ortalama Kazanç (14 periyot) / Ortalama Kayıp (14 periyot)
RSI = 100 - (100 / (1 + RS))

RSI > 70 -> aşırı alım bölgesi
RSI < 30 -> aşırı satım bölgesi`}
              </pre>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">RSI Yorumu</h3>
              <ul className="mt-2 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Aşırı alım:</strong> RSI &gt; 70. Fiyatın kısa vadede tepe
                  yapma olasılığı yükselir; ancak güçlü trendde uzun süre 70 üzerinde kalabilir.
                </li>
                <li>
                  <strong className="text-white">Aşırı satım:</strong> RSI &lt; 30. Fiyatın kısa vadede dipten
                  dönme olasılığı yükselir.
                </li>
                <li>
                  <strong className="text-white">Uyumsuzluk:</strong> Fiyat yeni düşük yaparken RSI daha
                  yüksek dip yapıyorsa pozitif uyumsuzluk vardır; dönüş sinyali olabilir.
                </li>
              </ul>

              <p className="mt-3">
                Pratik örnek: SAHOL hissesi sert düşüş sonrası RSI 25-28 aralığına indi ve birkaç gün üst üste
                bu seviyede dipler yaparken fiyat daha düşük dipler yapmadı. Bu pozitif uyumsuzluk dönüş
                hareketinin habercisi olabilir; ancak teyit için mum formasyonu ve hacim de izlenmelidir.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Aşırı alım her zaman satış sinyali, aşırı satım her zaman alım sinyali değildir. Güçlü
                  trend döneminde RSI haftalarca aşırı bölgede kalabilir ve ters işlem yapan yatırımcı büyük
                  zarar edebilir. RSI'yi her zaman trend yönü ile birlikte değerlendirin.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">3 İndikatörü Birlikte Kullanmak</h2>
              <p>
                EMA, MACD ve RSI farklı zaman eksenlerinde ve farklı yaklaşımlarla çalışır. Birlikte
                kullanıldığında birbirini teyit ederler. Örnek bir alım filtresi şu şekilde kurulabilir:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Fiyat 50 EMA'nın üzerinde olsun (uzun trend yukarı).</li>
                <li>MACD histogramı pozitife dönsün (kısa momentum yukarı).</li>
                <li>RSI 30-50 aralığından yukarı dönsün (aşırı alım olmadan momentum güçlensin).</li>
              </ul>
              <p className="mt-3">
                Borsa Kralı platformundaki Teknik Analiz AI ekranında bu üç gösterge bir arada değerlendirilir
                ve genel sinyal seviyesi olarak sunulur. Detaylı destek-direnç çizimi için{' '}
                <Link to="/egitim/destek-direnc" className="text-gold-400 underline-offset-2 hover:underline">
                  Destek ve Direnç Seviyeleri
                </Link>{' '}
                yazımıza, göstergelerin temel teorisi için{' '}
                <Link to="/egitim/teknik-analiz-giris" className="text-gold-400 underline-offset-2 hover:underline">
                  Teknik Analize Giriş
                </Link>{' '}
                yazımıza bakabilirsiniz.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">İndikatör Periyot Seçimi</h2>
              <p>
                Standart parametreler (EMA 50, RSI 14, MACD 12-26-9) endüstri kabulü olmuştur ve çoğu zaman
                yeterlidir. Ancak farklı zaman dilimlerinde farklı periyotlar daha anlamlı olabilir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Gün içi (1-15 dk grafik):</strong> Daha kısa periyotlar (EMA
                  9, EMA 21; RSI 9). Daha hızlı sinyal, daha fazla gürültü.
                </li>
                <li>
                  <strong className="text-white">Swing (1-4 saat ya da günlük):</strong> Standart parametreler
                  uygun. Çoğu kazıklı sinyal bu zaman diliminde üretilir.
                </li>
                <li>
                  <strong className="text-white">Uzun vade (haftalık):</strong> Daha uzun periyotlar (EMA 200;
                  RSI 21). Sinyaller seyraktir ama sağlamdır.
                </li>
              </ul>
              <p className="mt-3">
                Periyot uyumsuzluğu, bir sinyali iki ayrı zaman diliminde teyit etmeye çalışırken sık yapılan
                bir hatadir. Örneğin günlük grafikte alış sinyali olan bir hisse, haftalıkta hâlâ düşen
                trendde olabilir. Karar verirken bir üst zaman dilimi (haftalık) ile bir alt zaman dilimi
                (günlük) birlikte değerlendirilmelidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Çoklu İndikatör Stratejisi: Pratik Filtre</h2>
              <p>
                Tek tek indikatör anlamak yerine, bunları bir filtre olarak birleştirmek pratik kullanıma daha
                yatkındır. Aşağıda orta vadeli swing alımlar için önerilen filtre yer alır.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`ŞART 1: Haftalık kapanış 50 EMA üzerinde (uzun trend yukarı)
ŞART 2: Günlük fiyat 21 EMA üzerinde
ŞART 3: MACD histogramı pozitif ve genişliyor
ŞART 4: RSI 45-65 aralığı (ne aşırı alım ne de aşırı satım)
ŞART 5: Hacim son 20 gün ortalamasının üzerinde

Tüm şartlar sağlandı -> Aday liste
Bu adaylardan teknik destek-direnç çizimi ile en
sağlam giriş noktası olanı seçilir.`}
              </pre>
              <p className="mt-3">
                Borsa Kralı Tarama Analiz Merkezi, bu tip çoklu şart filtrelerini BIST 100 üzerinde anlık
                taratmanıza imkân verir. Filtre oluşturmak, her şeyi ayrı ayrı grafikten takip etmekten çok
                daha verimlidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bollinger Bantları ile Tamamlama</h2>
              <p>
                EMA, MACD ve RSI'nin temel üçlü olması yanında, profesyoneller çoğu zaman buna Bollinger
                Bantları'nı da ekler. Bollinger Bantları, 20 periyotluk SMA çizgisinin üzerine ve altına iki
                standart sapma kadar mesafede iki bant çizer. Bantlar fiyat volatilitesine göre daralır ve
                genişler.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Bant sıkışması (Bollinger Squeeze):</strong> Bantlar
                  daraldığı dönem volatilitenin düştüğünü gösterir; yakın gelecekte büyük bir hareket beklenir.
                </li>
                <li>
                  <strong className="text-white">Bant kırılımı:</strong> Fiyat üst banda dokunup geri dönerse
                  aşırı alım sinyali; alt banda dokunup dönerse aşırı satım sinyali olabilir.
                </li>
                <li>
                  <strong className="text-white">Bant yürümesi:</strong> Güçlü trende fiyat üst bandı takip
                  ederek yükselir; bu dönemde RSI yüksek seviyede kalmaya devam eder ve sat sinyali olarak
                  yanlış okunmamalıdır.
                </li>
              </ul>
              <p className="mt-3">
                Bollinger Bantları, RSI ile birlikte çok kullanışlı bir kombinasyon sunar: alt banda dokunan
                bir hisse aynı anda RSI'da pozitif uyumsuzluk veriyorsa, dönüş olasılığı belirgin şekilde
                artar. Tersi durumda üst banda dokunup negatif uyumsuzluk oluşan bir hissede satış baskısının
                gelmesi muhtemeldir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yaygın Hatalar</h2>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Tek bir indikatörle işlem girmek. İndikatörler arasındaki teyit çok değerlidir.</li>
                <li>5 dakikalık grafikte indikatör kullanmak ve gürültüye yakalanmak.</li>
                <li>Aşırı alım/satım seviyelerini mekanik biçimde alış-satış sinyali zannetmek.</li>
                <li>Backtest yapmadan, görmüş olduğunuz tek bir başarılı örnek üzerinden kural çıkarmak.</li>
                <li>Risk yönetimi olmadan indikatör sinyallerine göre işlem girmek.</li>
                <li>İndikatör parametrelerini sürekli değiştirip "ideal kombinasyon" aramak (data mining tuzağı).</li>
                <li>İndikatör sinyaline göre alıp mum kapanmasını beklemeden çıkış yapmak.</li>
                <li>Çok sayıda indikatörü ekrana eklemek ve birbiriyle çelişen sinyaller arasında kalmak.</li>
              </ul>
              <p className="mt-3">
                Sade kalın: iki ya da üç indikatörle başlayın, bunları uzun süre kullanın ve davranışlarını
                ezbereyleyin. İyi bir indikatör, doğru kullanılan basit bir indikatördür — gizemli bir formül
                değil.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Uyumsuzluk (Divergence) Analizi</h2>
              <p>
                MACD ve RSI'nin en değerli kullanım biçimlerinden biri uyumsuzluk (divergence) tespitidir.
                Uyumsuzluk; fiyat ile göstergenin farklı yönlerde hareket etmesidir ve çoğu zaman trendin
                bozulmaya başladığının habercisidir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Negatif (bearish) uyumsuzluk:</strong> Fiyat daha yüksek
                  tepe yapar; ancak RSI veya MACD daha düşük tepe yapar. Yükseliş zayıflıyor demektir.
                </li>
                <li>
                  <strong className="text-white">Pozitif (bullish) uyumsuzluk:</strong> Fiyat daha düşük dip
                  yapar; ancak gösterge daha yüksek dip yapar. Düşüşün yorgunluk yaşadığını ifade eder.
                </li>
                <li>
                  <strong className="text-white">Gizli (hidden) uyumsuzluk:</strong> Trend devamını işaret
                  eden uyumsuzluk türüdür. Yükselen trendde fiyat daha yüksek dip yaparken RSI daha düşük
                  dip yapıyorsa, bu trendin devam edeceğine işaret olabilir.
                </li>
              </ul>
              <p className="mt-3">
                Pratik örnek: SAHOL hissesi son tepe noktasında 80 TL görürken, bir önceki tepede 75 TL idi.
                Aralarında RSI 78'den 68'e geriledi. Bu negatif uyumsuzluk, yükselişin yorulmasını ve olası
                bir dönüş hareketini haber verebilir. Tek başına divergence işlem sinyali değildir; mum
                formasyonu, hacim ve trend çizgisi ile birlikte yorumlanmalıdır.
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
              Bu içerik yatırım tavsiyesi değildir. Yalnızca eğitim ve bilgilendirme amaçlıyla hazırlanmıştır.
              Yatırım kararlarınız için kendi araştırmanızı yapmanız ve gerekirse profesyonel destek almanız
              önerilir.
            </p>
          </article>

          <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4 text-sm">
            <Link to="/egitim/bist100-rehberi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Önceki: BIST 100 Rehberi
            </Link>
            <Link to="/egitim/bilanco-okuma" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Bilanço Okuma <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
