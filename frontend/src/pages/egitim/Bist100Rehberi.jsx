import { Link } from 'react-router-dom'
import { TrendingUp, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function Bist100Rehberi() {
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
            <span className="text-gray-300">BIST 100 Rehberi</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <TrendingUp className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                Temel
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              BIST 100 Endeksi: Hesaplama, Hisseler, Tarih
            </h1>
            <p className="text-sm text-gray-500">10 Mayıs 2026 — yaklaşık 9 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              BIST 100, Borsa İstanbul'da işlem gören hisselerin en çok takip edilen göstergesidir. Hem
              yatırımcıların günlük piyasa havasını ölçmek için baktıkları termometre, hem de fonların ve
              ETF'lerin referans aldığı temel endekstir. Bu yazıda endeksin nasıl hesaplandığını, hangi
              kriterlere göre hisselerin endekse girdiğini, dönemsel revizyonları, BIST 30 ve BIST 50 ile
              farkını ve uzun dönem performansını detaylı bir biçimde inceleyeceğiz.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">BIST 100 Nedir?</h2>
              <p>
                BIST 100, Borsa İstanbul Pay Piyasası'nda işlem gören ve yıldız pazarda yer alan şirketler
                arasından, belirli kriterlere göre seçilen 100 hisseyi kapsayan ana endekstir. Endeks, fiyat
                hareketinin yansısı olarak hesaplanır ve gün içinde sık aralıklarla güncellenir. Yatırımcılar
                BIST 100'u; piyasanın genel yönü, fonların getirisi ve makro güvenin göstergesi olarak
                kullanır.
              </p>
              <p className="mt-3">
                Endeksin baz değeri 1986 yılında 1 puana eşitlenmiştir. Yani BIST 100 bugün 11.000 puan
                seviyesindeyse, bu 1986'dan bu yana endeksin nominal olarak yaklaşık 11.000 katına çıktığını
                gösterir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Endeksin Tarihçesi</h2>
              <p>
                Borsa İstanbul'un eski adı İstanbul Menkul Kıymetler Borsası (IMKB) idi. 1986 yılında kurulan
                borsa, ilk yıllarında düşük hacimli ve sınırlı sayıda şirketle işlem görüyordu. 1990'ların
                başlarında yabancı yatırımcı ilgisinin artması ile birlikte endeks hızlı yükseldi; ekonomik
                krizler ve siyasi çalkantılar dönemlerinde sert düşüşler yaşandı.
              </p>
              <p className="mt-3">
                2013 yılında IMKB'nin yerini Borsa İstanbul (BIST) aldı. Endeks isimlendirmesi de bu dönemde
                BIST 100, BIST 30 olarak yeniden düzenlendi. 2020 sonrası enflasyonun yüksek seyrettiği
                dönemde nominal olarak büyük yüzdeli hareketler kaydetti; bu durum reel getiriden ziyade TL'nin
                değer kaybıyla ilgilidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">BIST 100 Nasıl Hesaplanır?</h2>
              <p>
                BIST 100; fiili dolaşımdaki payların (free-float) piyasa değerine göre ağırlıklandırılmış
                Laspeyres tipi bir endekstir. Yani endeksin hesabında her hisse, şirketin halka arz oranı ve
                piyasa değeri ile orantılı ağırlığa sahiptir. Bir şirketin piyasa değeri ne kadar büyük ve
                ne kadar fazla halka açık ise, endekste o kadar belirleyicidir.
              </p>
              <p className="mt-3">
                Genel formül şu şekildedir:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`Endeks Değeri = (Toplam Piyasa Değeri (free-float) / Bölen) * Baz Değer

Bölen, sermaye artırımı, halka arz çıkarma gibi
durumlarda endeksin sapmaması için güncellenir.`}
              </pre>
              <p className="mt-3">
                Bu yöntemin önemli sonucu, dev şirketlerin endeks üzerinde orantısız etkiye sahip olmasıdır.
                Örneğin THYAO, KCHOL, GARAN, AKBNK gibi şirketlerin yüksek piyasa değeri ve halka açıklık
                oranı sebebiyle BIST 100'un yüzünde toplam %15-25 aralığındaki bir kısmı sadece bu birkaç
                hisseden oluşur.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Bir hissenin endeks ağırlığı yüksekse, o hissedeki günlük fiyat hareketi BIST 100'un genel
                  yönü üzerinde belirleyici olur. Bu yüzden günlük piyasa yorumlarında bankalar ve holdinglerin
                  durumu mutlaka ayrı ayrı değerlendirilir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Endekse Hangi Hisseler Girer?</h2>
              <p>
                BIST, endeks bileşenlerini seçmek için aşağıdaki kriterleri esas alır.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Fiili dolaşım oranlı piyasa değeri:</strong> Halka açık
                  kısmın piyasa değeri büyük olan şirketler öne çıkar.
                </li>
                <li>
                  <strong className="text-white">Likidite:</strong> Belirli bir süre boyunca yeterli günlük
                  işlem hacmi şart.
                </li>
                <li>
                  <strong className="text-white">Pazar:</strong> Yıldız pazar veya ana pazar dahilinde olmak
                  zorunlu.
                </li>
                <li>
                  <strong className="text-white">Sürekli işlem:</strong> Sık durdurulan veya işlemden
                  kaldırılmış hisseler endekse alınmaz.
                </li>
              </ul>
              <p className="mt-3">
                Endeks bileşenleri üç ayda bir gözden geçirilir. Yeni şirketler eklenir, kriterleri
                karşılamayan şirketler çıkarılır. Bu dönemsel revizyonlar piyasa katılımcıları tarafından
                yakından izlenir, çünkü endekse giren hisseye ETF ve fonlardan otomatik talep gelir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">BIST 30, BIST 50, BIST 100 Farkı</h2>
              <p>
                Bu üç endeks, bir piramit gibi düşünülebilir. BIST 30 en büyük 30 hisseyi, BIST 50 en büyük
                50 hisseyi (BIST 30 dahil), BIST 100 ise en büyük 100 hisseyi kapsar. Tüm BIST 30 hisseleri
                aynı zamanda BIST 50 ve BIST 100 içindedir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">BIST 30:</strong> En likit ve büyük şirketler. VIOP'ta endeks
                  vadelisi ve opsiyonu olan asıl endekstir.
                </li>
                <li>
                  <strong className="text-white">BIST 50:</strong> BIST 30'a 20 şirket daha ekleyen geniş
                  çaplı endeks. Yatırım fonlarının referansı olarak kullanılır.
                </li>
                <li>
                  <strong className="text-white">BIST 100:</strong> En geniş kapsam. Piyasa hakkında en
                  sağlam bir genel resim sunar.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Sektörlere Göre Dağılım</h2>
              <p>
                BIST 100'ün sektörel dağılımı yıllara göre değişmekle birlikte; bankacılık, holding, otomotiv,
                havacılık, gıda-perakende, demir-çelik, savunma sanayi ve enerji genelde en ağırlıklı
                sektörlerdir. Banka hisselerinin (GARAN, AKBNK, ISCTR, YKBNK) tek başına endeksin %15-20
                kadarını oluşturması nadir bir durum değildir.
              </p>
              <p className="mt-3">
                Bu nedenle, BIST 100'ü yorumlarken sektör bazlı alt analiz yapmak büyük fark yaratır. Örneğin
                endeks yataya yakın gözükse de bankalar gerileyip savunma sanayi (ASELS gibi) yükseliyorsa,
                paranın sektörler arasında dolaştığı söylenebilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Endekse Yatırım Yöntemleri</h2>
              <p>
                BIST 100'e doğrudan yatırım yapmak yerine, endeksi takip eden ürünler kullanmak yaygın bir
                tercihtir. Bunlar:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Borsa Yatırım Fonları (BYF / ETF):</strong> Endeksin
                  bileşimini birebir takip eden tek bir bileşik enstrümandır. Örneğin XU100 ETF ürünleri.
                </li>
                <li>
                  <strong className="text-white">Endeks Fonları:</strong> Yatırım fonu cinsinden endeks
                  takibi sağlar; günlük pay fiyatıyla alınıp satılır.
                </li>
                <li>
                  <strong className="text-white">VIOP Endeks Vadelileri:</strong> BIST 30 vadeli kontratı
                  üzerinden kaldıraç ile pozisyon alınabilir; ancak risk yüksektir.
                </li>
              </ul>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  VIOP ürünleri kaldıraç içeren türev araçlardır ve küçük fiyat hareketleri büyük kayıplara yol
                  açabilir. Bu ürünler deneyimsiz yatırımcılar için uygun değildir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Tarihsel Performans</h2>
              <p>
                BIST 100, uzun dönemde Türk şirketlerinin reel büyümesini ve TL'nin satın alma gücünü birlikte
                yansıtır. 2003-2013 döneminde dolar bazlı getirisi yüksek seyrederken, 2018 sonrası TL'deki
                değer kaybı nominal kazancı şişirmiştir. Reel (enflasyondan arındırılmış) performansa bakmak,
                aldatıcı bir şekilde yüksek nominal getiri etkisinden uzak durmak için önemlidir.
              </p>
              <p className="mt-3">
                Örneğin endeks bir yılda %50 yükselese de, aynı dönemde TÜFE %60 ise reel getiri eksidir.
                Bu yüzden özellikle uzun vadeli yatırım değerlendirmesinde dolar veya altın bazlı getiri de
                karşılaştırma olarak göz önünde tutulur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yabancı Yatırımcı Payı</h2>
              <p>
                BIST 100'ün fiyat hareketinde belirleyici unsurlardan biri, halka açık kısmın ne kadarının
                yabancı yatırımcıların elinde olduğudur. MKK (Merkezi Kayıt Kuruluşu) tarafından haftalık
                olarak yayınlanan veriye göre, son yıllarda yabancı pay oranı %30-50 arasında dalgalanma
                göstermektedir. Yabancı yatırımcıların alıcıya geçtiği dönemlerde endeks reel olarak da
                güçlenir; sertçe satıcı olduklarında dolar bazlı getiri belirgin şekilde negatif olabilir.
              </p>
              <p className="mt-3">
                Bu durum, BIST 100'ü sadece yerli makro veriler ile yorumlamanın yetersiz olduğunu gösterir.
                Global risk iştahı, gelişmekte olan ülke borsalarına yönelik fon akımı, MSCI gibi endekslerde
                Türkiye'nin ağırlığındaki değişiklikler endeksin uzun dönem yönü üzerinde doğrudan etkilidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Endekse Giriş/Çıkış Etkisi</h2>
              <p>
                Bir hissenin BIST 100 endeksine girmesi, o hisseye yapısal alıcı taban oluşturur. ETF'ler,
                endeks fonları ve pasif yatırım araçları endekste yer alan tüm hisseyi otomatik olarak alır.
                Tarihsel olarak endekse giren bir hissede, giriş tarihinden 2-4 hafta öncesinden itibaren
                fiyat hareketinin güçlendiği gözlemlenmiştir.
              </p>
              <p className="mt-3">
                Tersi de geçerlidir: endeksten çıkan bir hisseye yönelik mekanik satış baskısı oluşur.
                Yatırımcılar üçer aylık endeks revizyon takvimini (Mart, Haziran, Eylül, Aralık dönemleri)
                yakından takip eder; çünkü BIST'in resmi duyurusu öncesinde piyasa beklentileri fiyatlanmış
                olur. Bu yapısal etkinin somut bir örneği, yeni halka arz olan ve büyüme hızı yüksek
                şirketlerin BIST 100'e girmeleriyle birlikte yapısal taban oluşumudur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">BIST 100 ile Sektör Endekslerinin İlişkisi</h2>
              <p>
                BIST 100 ana endekstir; ancak Borsa İstanbul ayrıca sektör bazlı alt endeksler de yayınlar.
                XBANK (banka), XUSIN (sanayi), XHOLD (holding), XGIDA (gıda), XINSA (inşaat), XTEKS (tekstil)
                gibi alt endeksler hangi sektörün ileri ya da geri kaldığını takip etmek için kullanılır.
              </p>
              <p className="mt-3">
                Tipik bir analiz: BIST 100 yataya yakın seyrederken XBANK %5 yükselip XUSIN %3 düşüyorsa,
                paranın sanayiden bankaya rotasyon yaptığını söyleyebiliriz. Bu rotasyonu yakalamak; tek tek
                hisse takibinin yerine sektörel para akımını görmeyi mümkün kılar.
              </p>
              <p className="mt-3">
                BIST'te sektör endeks rotasyonu makro veriyle doğrudan bağlantılıdır. TCMB faiz toplantıları
                yaklaştığında XBANK volatilitesi artar; petrol fiyatları yükseldikçe XPETK hisseleri dikkat
                çekmeye başlar. Yatırımcı, makro takvimi sektör endeksleriyle birlikte takip etmek alışkanlığı
                kazanmalıdır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Endeks Okuma Pratiği</h2>
              <p>
                Endeksin yönü, hangi hisselerin öncülük ettiği, banka-sanayi ayrışması ve hacim — bu dört
                bilgi birlikte okunduğunda piyasa hakkında sağlam bir resim verir. Borsa Kralı platformundaki
                Canlı Heatmap ve Endeks Detay ekranları bu okumayı tek bakışta kolaylaştırmak için
                tasarlanmıştır. Endekse genel bakıştan sonra alt sektörlere inip lider hisseleri ayrı ayrı
                takip etmek; piyasa rotasyonunu (sektörler arası para geçişini) yakalamanın en pratik yoludur.
              </p>
              <p className="mt-3">
                Yatırımcı, BIST 100'ü her gün rakamsal olarak takip etmek yerine; haftalık kapanışları, ayın
                son işlem günündeki kapanışı ve yıllık bazlı getirileri not etmelidir. Bu uzun dönem çerçeve,
                günlük gürültüden uzaklaşarak büyük resmi görmeyi kolaylaştırır.
              </p>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/bilanco-okuma" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Bilanço Okuma Kılavuzu: Aktif, Pasif, Özkaynak <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/yatirim-stratejisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Yatırım Stratejisi Oluşturma: 5 Adım <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/teknik-analiz-giris" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Teknik Analize Giriş: Sıfırdan Başlayanlar İçin Kılavuz <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/teknik-analiz-giris" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Önceki: Teknik Analize Giriş
            </Link>
            <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: EMA, MACD, RSI <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
