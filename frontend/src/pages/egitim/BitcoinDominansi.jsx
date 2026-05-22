import { Link } from 'react-router-dom'
import { PieChart, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function BitcoinDominansi() {
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
            <span className="text-gray-300">Bitcoin Dominansı ve Altcoin Sezonu</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <PieChart className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                Kripto
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Bitcoin Dominansı ve Altcoin Sezonu
            </h1>
            <p className="text-sm text-gray-500">20 Mayıs 2026 — yaklaşık 8 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Kripto piyasasını yalnızca Bitcoin'in fiyatına bakarak okumak, eksik bir resim görmektir.
              Piyasada binlerce coin vardır ve sermaye sürekli olarak bunlar arasında dolaşır. Bu dolaşımı
              anlamanın en güçlü araçlarından biri Bitcoin dominansıdır. Dominansın yükselip alçalması,
              paranın Bitcoin'e mi yoksa altcoin'lere mi aktığını; piyasanın temkinli mi yoksa iştahlı mı
              olduğunu ele verir. Bu yazıda Bitcoin dominansının ne olduğunu, nasıl hesaplandığını, altcoin
              sezonu dinamiğini, sermaye rotasyonu zincirini ve dominans okumasının sınırlarını somut
              örneklerle açıklayacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bitcoin Dominansı (BTC.D) Nedir?</h2>
              <p>
                Bitcoin dominansı, kısaca BTC.D; Bitcoin'in piyasa değerinin, tüm kripto para piyasasının
                toplam değerine oranıdır. Yüzde olarak ifade edilir. Dominans yüzde 55 ise, piyasadaki tüm
                kripto sermayesinin yüzde 55'i Bitcoin'de, kalan yüzde 45'i diğer tüm coin'lerde demektir.
              </p>
              <p className="mt-3">
                Burada kritik bir incelik vardır: dominans, Bitcoin'in fiyatından bağımsız bir göstergedir.
                Bitcoin'in fiyatı yükselse bile, altcoin'ler ondan daha hızlı yükseliyorsa dominans düşer.
                Aynı şekilde Bitcoin'in fiyatı dururken altcoin'ler değer kaybederse dominans yükselir.
                Dominans mutlak fiyatı değil, sermayenin piyasa içindeki dağılımını ölçer.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Dominans Nasıl Hesaplanır?</h2>
              <p>
                Hesaplama basit bir orandır: Bitcoin'in piyasa değeri, toplam kripto piyasa değerine bölünür
                ve yüzde ile çarpılır. Bir coin'in piyasa değeri ise, fiyatının dolaşımdaki arzla
                çarpımıdır.
              </p>
              <p className="mt-3">
                Sayısal bir örnekle netleştirelim. Toplam kripto piyasası 2,4 trilyon dolar olsun. Bitcoin'in
                piyasa değeri 1,2 trilyon dolar ise dominans, 1,2 bölü 2,4 yani yüzde 50 olur. Ethereum'un
                piyasa değeri 360 milyar dolar ise ETH dominansı yüzde 15 olur. Geriye kalan yüzde 35 ise
                Bitcoin ve Ethereum dışındaki tüm coin'lerin toplam payıdır; bu gruba kısaca diğerleri ya da
                altcoin grubu denir.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Altcoin'lerin gerçek gücünü ölçmek isteyenler, sadece BTC.D'ye değil; Bitcoin ve Ethereum
                  hariç piyasa değeri grafiğine de bakar. Bu grafik genelde TOTAL3 olarak anılır. TOTAL3
                  yükselirken BTC.D düşüyorsa, sermaye gerçekten altcoin'lere akıyor demektir. Tek başına
                  dominans bazen yanıltabilir, ikisini birlikte okumak daha güvenlidir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Dominans Yükseldiğinde Piyasa Ne Anlatır?</h2>
              <p>
                Bitcoin dominansının yükselmesi, sermayenin altcoin'lerden Bitcoin'e doğru kaydığını gösterir.
                Bunun birkaç farklı nedeni olabilir ve her biri farklı bir piyasa ruh hali anlatır.
              </p>
              <p className="mt-3">
                İlk olarak, ayı piyasalarında dominans genellikle yükselir. Belirsizlik arttığında yatırımcılar
                riskli altcoin'leri satıp, görece daha güvenli kabul edilen Bitcoin'e sığınır. İkinci olarak,
                yeni bir boğa piyasasının erken aşamasında dominans yükselebilir; çünkü piyasaya giren taze
                para önce Bitcoin'e yönelir, altcoin'lere henüz dağılmamıştır. Her iki durumda da yükselen
                dominans, altcoin'ler için zorlu bir dönemin işaretidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Dominans Düştüğünde Piyasa Ne Anlatır?</h2>
              <p>
                Bitcoin dominansının düşmesi, sermayenin Bitcoin'den altcoin'lere doğru aktığını gösterir.
                Bu, piyasada risk iştahının arttığının en net işaretlerinden biridir. Yatırımcılar Bitcoin'in
                görece istikrarından, daha yüksek getiri umuduyla altcoin'lerin oynaklığına geçer.
              </p>
              <p className="mt-3">
                Dominansın düşmesinin en sağlıklı hali, Bitcoin fiyatı yatay veya hafif yükselirken
                altcoin'lerin güçlü performans göstermesidir. Bu, klasik altcoin sezonunun zeminidir. Ancak
                dominans, Bitcoin'in sert düştüğü ve altcoin'lerin daha da sert düştüğü bir ortamda da kısa
                süreli dalgalanabilir; bu yüzden dominans düşüşünü mutlaka Bitcoin'in kendi yönüyle birlikte
                okumak gerekir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Altcoin Sezonu (Altseason) Dinamiği</h2>
              <p>
                Altcoin sezonu, altcoin'lerin geniş çapta ve Bitcoin'den belirgin biçimde daha hızlı yükseldiği
                dönemdir. Bu dönemde Bitcoin dominansı düşer, altcoin grubunun toplam değeri hızla artar ve
                yatırımcı ilgisi tek tek projelere kayar.
              </p>
              <p className="mt-3">
                Altcoin sezonunun oluşması için genellikle birkaç koşulun bir araya gelmesi gerekir:
                Bitcoin'in önce güçlü bir yükseliş yapıp ardından bir istikrar bölgesine oturması, piyasada
                genel bir iyimserliğin hâkim olması ve dominansın bir tepe yapıp aşağı dönmesi. Bitcoin'in
                yatay seyre geçmesi kritiktir; çünkü Bitcoin sert hareket ettiğinde yatırımcı dikkati ve
                sermayesi ona döner, altcoin'ler geride kalır. Bitcoin sakinleştiğinde ise sermaye getiri
                arayışıyla altcoin'lere dağılır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Sermaye Rotasyonu Zinciri</h2>
              <p>
                Kripto piyasasında sermaye rastgele hareket etmez; çoğu zaman tanınabilir bir sıra izler. Bu
                sıraya sermaye rotasyonu zinciri denir ve dört aşamadan oluşur:
              </p>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>
                  <strong className="text-white">Bitcoin (BTC):</strong> Yeni para önce piyasanın en güvenli
                  ve en likit varlığına, Bitcoin'e girer. Bu aşamada Bitcoin yükselir ve dominans artar.
                </li>
                <li>
                  <strong className="text-white">Ethereum (ETH):</strong> Bitcoin'de kâr eden yatırımcılar
                  bir sonraki büyük ve görece güvenli varlığa, Ethereum'a döner. ETH güçlenir, Bitcoin'e
                  oranı yükselir.
                </li>
                <li>
                  <strong className="text-white">Büyük altcoin'ler:</strong> Sermaye ardından piyasa değeri
                  yüksek, bilinen büyük altcoin'lere yayılır. Dominans bu aşamada belirgin düşmeye başlar.
                </li>
                <li>
                  <strong className="text-white">Küçük altcoin'ler:</strong> Son aşamada para, piyasa değeri
                  düşük ve yüksek oynaklıklı küçük coin'lere akar. Bu, altcoin sezonunun en coşkulu ve aynı
                  zamanda en riskli evresidir; genelde döngünün tepesine yakındır.
                </li>
              </ol>
              <p className="mt-3">
                Bu zincir her döngüde aynı netlikte işlemez, ama genel eğilim çoğu kez bu yöndedir. Zincirin
                hangi halkasında olunduğunu anlamak, hangi tür coin'in öne çıkma ihtimalinin yüksek olduğunu
                kestirmeye yardımcı olur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Dominans ve BTC Fiyatı: Dörtlü Senaryo</h2>
              <p>
                Bitcoin dominansını tek başına değil, Bitcoin'in fiyat yönüyle birlikte okumak gerekir. İki
                değişkenin birleşimi dört temel senaryo üretir ve her birinin altcoin'lere etkisi farklıdır.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">BTC yükselir + dominans yükselir:</strong> Para Bitcoin'e
                  akıyor, altcoin'ler geride kalıyor. Boğa piyasasının erken evresi olabilir. Altcoin'ler için
                  zayıf, Bitcoin için güçlü dönem.
                </li>
                <li>
                  <strong className="text-white">BTC yükselir + dominans düşer:</strong> Hem Bitcoin yükseliyor
                  hem altcoin'ler ondan daha hızlı yükseliyor. Altcoin sezonu için en sağlıklı ve en güçlü
                  ortam budur.
                </li>
                <li>
                  <strong className="text-white">BTC düşer + dominans yükselir:</strong> Bitcoin düşüyor ama
                  altcoin'ler daha sert düşüyor. Risk kaçışı yaşanıyor; altcoin'ler için en tehlikeli senaryo.
                </li>
                <li>
                  <strong className="text-white">BTC düşer + dominans düşer:</strong> Bitcoin düşerken
                  altcoin'ler direnç gösteriyor ya da yükseliyor. Görece nadirdir; sermayenin altcoin'lere
                  seçici biçimde dağıldığı, dikkatle izlenmesi gereken bir geçiş hali olabilir.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Stablecoin Dominansı (USDT.D) ve Ters Okuması</h2>
              <p>
                Bitcoin dominansının yanında izlenmesi gereken bir başka gösterge, stablecoin dominansıdır;
                en çok USDT.D olarak takip edilir. Bu, başta USDT olmak üzere tüm stablecoin'lerin toplam
                değerinin piyasa içindeki payını gösterir. Stablecoin'ler değeri sabit varlıklar olduğundan,
                bekleyen ve henüz piyasaya girmemiş nakdi temsil ederler.
              </p>
              <p className="mt-3">
                USDT.D ters okunur. Stablecoin dominansı yükseliyorsa, yatırımcılar riskli varlıklardan çıkıp
                nakde kaçıyor demektir; bu genellikle Bitcoin ve altcoin'ler için olumsuz bir ortamdır.
                Stablecoin dominansı düşüyorsa, bekleyen nakit riskli varlıklara giriyor demektir; bu Bitcoin
                ve altcoin'ler için olumlu bir işarettir. USDT.D'nin bir tepe yapıp aşağı dönmesi, sık
                gözlenen bir piyasa dibi sinyalidir; bir dip yapıp yukarı dönmesi ise satış baskısının
                habercisi olabilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Dominansın Sınırları ve Yanılma Payı</h2>
              <p>
                Bitcoin dominansı güçlü bir göstergedir, ama mükemmel değildir ve körü körüne kullanılmamalıdır.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Tanım sorunu:</strong> Bazı dominans grafikleri Ethereum'u
                  da altcoin sayar, bazıları ayrı tutar. Stablecoin'lerin hesaba katılıp katılmadığı da
                  değişir. Hangi tanımın kullanıldığını bilmeden yorum yapmak yanıltıcıdır.
                </li>
                <li>
                  <strong className="text-white">Arz değişimleri:</strong> Yeni coin'lerin piyasaya girmesi
                  veya büyük arz değişimleri, fiyat hareket etmese bile dominansı kaydırabilir.
                </li>
                <li>
                  <strong className="text-white">Gecikmeli sinyal:</strong> Dominans çoğu zaman bir
                  doğrulama aracıdır, öncü bir sinyal değil. Altcoin sezonunu önceden bildirmez; çoğunlukla
                  başladıktan sonra teyit eder.
                </li>
              </ul>
              <p className="mt-3">
                Bu nedenle dominans, tek başına bir alım-satım sinyali olarak değil; piyasanın genel
                bağlamını anlamak için bir pusula olarak kullanılmalıdır.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Dominans düşüyor diye rastgele altcoin almak ciddi bir hatadır. Altcoin sezonunda bile tüm
                  altcoin'ler aynı oranda yükselmez; zayıf projeler geride kalır, hatta değer kaybeder.
                  Dominans size piyasanın yönünü gösterir, ama hangi coin'in alınacağını söylemez. Coin
                  seçimi ayrı bir araştırma, temel inceleme ve risk yönetimi gerektirir.
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/funding-rate" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Funding Rate ve Long/Short Dengesi <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/kripto-analiz" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Kripto Para Nasıl Analiz Edilir <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/risk-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Risk Yönetimi <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/risk-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Risk Yönetimi <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
