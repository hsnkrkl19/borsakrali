import { Link } from 'react-router-dom'
import { Activity, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function OnchainAnaliz() {
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
            <span className="text-gray-300">On-Chain Analiz</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Activity className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                Kripto
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              On-Chain Analiz: Zincir Üstü Veriyi Okumak
            </h1>
            <p className="text-sm text-gray-500">18 Mayıs 2026 — yaklaşık 9 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              On-chain analiz, kripto'ya özgü ve geleneksel finansta benzeri olmayan bir araştırma alanıdır.
              Teknik analiz fiyat ve hacme, temel analiz projenin niteliğine bakarken; on-chain analiz
              doğrudan blok zincirinin kendisine bakar. Çünkü blok zinciri herkese açık bir defterdir: kaç
              adresin aktif olduğu, coinlerin borsalara mı aktığı yoksa borsalardan mı çekildiği, uzun süredir
              hareket etmeyen coinlerin ne kadar olduğu gibi veriler şeffaf biçimde okunabilir. Bu yazıda
              on-chain analizin ne olduğunu, en çok izlenen metrikleri (aktif adres, borsa akışları, coin
              yaşı, MVRV, SOPR), balina ve madenci davranışını, stablecoin arzının anlamını ve bu yöntemin
              sınırlarını ele alacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">On-Chain Analiz Nedir ve Neden Sadece Kripto'da Mümkün?</h2>
              <p>
                On-chain, kelime anlamıyla "zincir üzerinde" demektir. On-chain analiz, blok zincirine
                kaydedilmiş gerçek işlem verilerini inceleyerek piyasadaki katılımcıların davranışını anlamaya
                çalışır. Bir hisse senedinde, hangi yatırımcının ne zaman alıp sattığını gösteren tam ve açık
                bir kayıt yoktur; bu bilgi aracı kurumların özel veri tabanlarında durur.
              </p>
              <p className="mt-3">
                Kripto'da ise durum tersinedir. Bitcoin ya da Ethereum gibi açık zincirlerde her işlem,
                herkesin görebileceği biçimde kalıcı olarak kaydedilir. Adreslerin kimliği gizli kalsa da
                (psödonim yapı), hareketlerin kendisi tamamen şeffaftır. İşte on-chain analizin sadece
                kripto'da mümkün olmasının nedeni budur: tüm defter herkese açıktır. Bu sayede analist,
                fiyatın arkasındaki davranışı doğrudan veriden okuyabilir; rivayete veya dolaylı tahmine
                ihtiyaç duymaz.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Aktif Adres Sayısı</h2>
              <p>
                Aktif adres sayısı, belirli bir dönemde işlem gönderen veya alan benzersiz adreslerin
                sayısıdır. En sade ağ kullanım göstergelerinden biridir ve bir blok zincirinin ne kadar
                fiilen kullanıldığını ölçer.
              </p>
              <p className="mt-3">
                Yorum mantığı şöyledir: fiyat yükselirken aktif adres sayısı da artıyorsa, yükselişin
                arkasında genişleyen bir kullanıcı tabanı var demektir; bu daha sağlıklı bir tablodur.
                Buna karşılık fiyat yükselirken aktif adresler yatay kalıyor ya da düşüyorsa, yükseliş dar
                bir katılımla sürüyor olabilir ve bu zayıflık işaretidir. Tek başına aktif adres bir alım
                satım sinyali değildir; ancak ağın gerçek talep eğilimini göstermesi açısından değerlidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Borsa Giriş ve Çıkış Akışları</h2>
              <p>
                On-chain analizin en çok izlenen metriklerinden biri, coinlerin borsalara akışı (exchange
                inflow) ve borsalardan çekilişidir (exchange outflow). Mantık basit bir gözleme dayanır:
                bir kullanıcı genelde satmak niyetindeyse coinini borsaya gönderir; uzun süre tutmak
                niyetindeyse borsadan kendi cüzdanına çeker.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Yüksek borsa girişi:</strong> Çok miktarda coin borsalara
                  akıyorsa, satış baskısının artma ihtimaline işaret edebilir.
                </li>
                <li>
                  <strong className="text-white">Yüksek borsa çıkışı:</strong> Coinler borsalardan kişisel
                  cüzdanlara çekiliyorsa, yatırımcıların satmak yerine biriktirme ve uzun vadeli tutma
                  eğiliminde olduğu yorumlanabilir.
                </li>
                <li>
                  <strong className="text-white">Borsa rezervi:</strong> Borsalarda tutulan toplam coin
                  miktarının uzun süreli düşüş eğilimi, dolaşımdaki satışa hazır arzın azaldığı biçiminde
                  okunur.
                </li>
              </ul>
              <p className="mt-3">
                Bu metrikler güçlü ipuçları verir, fakat mutlak doğru değildir. Bir borsanın iç cüzdan
                düzenlemesi ya da saklama (custody) hareketleri, akış verisini geçici olarak çarpıtabilir.
                Bu yüzden borsa akışları tek bir gün değil, eğilim olarak değerlendirilmelidir.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  On-chain metrikleri tek tek değil, birlikte okuyun. Örneğin borsa rezervinin uzun süredir
                  düştüğü, aktif adreslerin arttığı ve stablecoin arzının yükseldiği bir tablo, birbirini
                  destekleyen sinyaller bütünü oluşturur. Tek bir metrik aldatıcı olabilir; uyumlu birden
                  çok metrik daha güvenilir bir resim verir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">HODL Davranışı ve Coin Yaşı</h2>
              <p>
                "HODL", kripto kültüründe "satmadan uzun süre elde tutmak" anlamında kullanılan bir terimdir.
                Blok zinciri her coinin en son ne zaman hareket ettiğini kaydettiği için, analist coinlerin
                "yaşını" ölçebilir; yani belirli bir miktar coinin ne kadar süredir hiç el değiştirmediğini
                görebilir.
              </p>
              <p className="mt-3">
                Bu veriden çıkan tipik gözlemler şunlardır: uzun süredir hareket etmeyen coin oranı
                artıyorsa, piyasada uzun vadeli ve sabırlı sahiplerin ağırlığı artıyor demektir; bu genelde
                arz tarafında bir sıkılaşma olarak yorumlanır. Tersine, uzun süredir uyuyan eski coinler
                aniden hareketlenip borsalara akmaya başlarsa, deneyimli sahiplerin satışa geçtiği biçiminde
                bir uyarı olarak okunabilir. "Coin Days Destroyed" gibi metrikler, hareket eden coinin hem
                miktarını hem de ne kadar süredir beklediğini birlikte ağırlıklandırarak bu davranışı ölçer.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">MVRV Oranı</h2>
              <p>
                MVRV, "Market Value to Realized Value" yani piyasa değerinin gerçekleşmiş değere oranıdır.
                Anlamak için iki kavramı ayırmak gerekir. Piyasa değeri, varlığın güncel fiyatla hesaplanan
                toplam değeridir. Gerçekleşmiş değer ise her coini en son hareket ettiği fiyattan
                değerleyerek bulunan, kabaca piyasanın "ortalama maliyetini" temsil eden bir büyüklüktür.
              </p>
              <p className="mt-3">
                MVRV oranı bu ikisinin bölümüdür. Oran belirgin biçimde 1'in üzerindeyse, piyasa genel
                olarak maliyetinin üstünde, yani kâğıt üzerinde kârdadır; çok yüksek değerler tarihsel
                olarak aşırı ısınma bölgeleriyle ilişkilendirilmiştir. Oran 1'in altına indiğinde ise piyasa
                ortalama olarak zarardadır; bu bölgeler geçmişte dip yapma alanlarıyla örtüşmüştür. MVRV bir
                zamanlama aracı değil, piyasanın hangi duygu evresinde olduğunu gösteren bir termometredir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">SOPR: Harcanan Çıktı Kâr Oranı</h2>
              <p>
                SOPR, "Spent Output Profit Ratio" yani harcanan çıktıların kâr oranıdır. Basitçe şu soruyu
                ölçer: bugün hareket eden (harcanan) coinler, sahibinin aldığı fiyata göre kârla mı yoksa
                zararla mı el değiştiriyor?
              </p>
              <p className="mt-3">
                SOPR 1'den büyükse, hareket eden coinler ortalama olarak kârla satılıyor demektir. 1'den
                küçükse zararına satış baskındır. Tam 1 değeri ise kâr-zarar dengesini gösterir ve bu seviye
                önemli bir psikolojik eşiktir. Yükseliş eğilimindeyken SOPR'un 1'in hemen altına gelip oradan
                tepki vermesi, "zararına satmak istemeyen" yatırımcıların desteğine işaret edebilir. Düşüş
                eğiliminde ise SOPR'un 1'in altında uzun süre kalması, teslim olma (kapitülasyon) sürecinin
                bir göstergesi olarak yorumlanır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Balina (Whale) Hareketleri</h2>
              <p>
                "Balina", piyasayı etkileyebilecek büyüklükte coin tutan adres veya kişiye verilen isimdir.
                Blok zinciri şeffaf olduğu için, büyük bakiyeli adreslerin hareketleri izlenebilir. Bu adresler
                önemli miktarda coin biriktiriyorsa "balina birikimi", coinlerini borsalara aktarıyorsa
                potansiyel "balina dağıtımı" yani satış hazırlığı olarak okunur.
              </p>
              <p className="mt-3">
                Balina takibi değerli ipuçları verir; ancak dikkatli yorumlanmalıdır. Büyük bir adres
                mutlaka tek bir kişi olmayabilir; bir borsanın soğuk cüzdanı, bir saklama hizmeti ya da bir
                fon olabilir. Ayrıca büyük bir transfer her zaman satış anlamına gelmez; cüzdanlar arası
                yeniden düzenleme de olabilir. Bu yüzden tek bir balina işlemine bakarak karar vermek yerine,
                çok sayıda büyük adresin ortak eğilimine bakmak daha sağlıklıdır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Madenci Davranışı ve Rezervleri</h2>
              <p>
                Proof of Work zincirlerinde madenciler, blok ödülü olarak sürekli yeni coin kazanan ve düzenli
                masrafları (özellikle elektrik) olan özel bir katılımcı grubudur. Madencilerin blok zincirinde
                tuttuğu coin miktarına "madenci rezervi" denir ve bu rezervin değişimi izlenir.
              </p>
              <p className="mt-3">
                Madenciler kazandıkları coini biriktiriyor, yani rezervlerini artırıyorsa, bu fiyat
                beklentilerine dair olumlu bir tutum olarak yorumlanabilir. Buna karşılık madenciler
                rezervlerini hızla borsalara aktarıyorsa, masraflarını karşılamak için satış yaptıkları ve
                arz tarafına baskı geldiği biçiminde okunur. Madenci satışı, özellikle blok ödülünün yarıya
                indiği halving dönemlerinin ardından, gelirleri düştüğü için daha yakından izlenir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Stablecoin Arzı: Kuru Barut</h2>
              <p>
                Stablecoinler, USDT gibi değeri genellikle bir itibari para birimine sabitlenmiş kripto
                varlıklardır. Kripto piyasasında stablecoinler, alım yapmak için bekleyen nakit gibi
                düşünülür. Bu nedenle blok zincirlerindeki ve borsalardaki toplam stablecoin arzı, on-chain
                analizde sık sık "kuru barut" benzetmesiyle anılır.
              </p>
              <p className="mt-3">
                Mantık şudur: borsalardaki stablecoin arzı belirgin biçimde artıyorsa, piyasada riskli
                varlıklara dönüşmeye hazır bekleyen ciddi bir alım gücü birikiyor demektir. Tersine,
                stablecoin arzı azalıyorsa, bu nakit ya kripto varlıklara çevrilmiş ya da piyasadan çekilmiş
                olabilir. Stablecoin arzındaki büyüme tek başına yükseliş garantisi vermez; ama piyasanın
                potansiyel alım kapasitesini gösteren önemli bir bağlam metriğidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">On-Chain Analizin Sınırları ve Yanılma Payı</h2>
              <p>
                On-chain analiz güçlü bir araçtır, fakat hatasız bir kristal küre değildir. Sınırlarını
                bilmek, onu doğru kullanmanın ilk şartıdır.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Yorum belirsizliği:</strong> Bir transfer, satış da
                  olabilir, basit bir cüzdan düzenlemesi de. Veri kesindir ama niyet kesin değildir.
                </li>
                <li>
                  <strong className="text-white">Borsa içi hareketler:</strong> Borsaların kendi cüzdanları
                  arasındaki transferler, akış ve rezerv metriklerini geçici olarak bozabilir.
                </li>
                <li>
                  <strong className="text-white">Zincir dışı hacim:</strong> Bazı işlemler, özellikle
                  borsaların kendi iç defterlerinde gerçekleşenler, blok zincirine yansımaz; on-chain veri
                  resmin tamamını göstermeyebilir.
                </li>
                <li>
                  <strong className="text-white">Zamanlama sorunu:</strong> Çoğu on-chain metrik, bir evreyi
                  ya da eğilimi gösterir; kesin gün ve fiyat vermez. Aşırılık bölgeleri uzun süre aşırılıkta
                  kalabilir.
                </li>
                <li>
                  <strong className="text-white">Sağlayıcı farkları:</strong> Aynı metrik, farklı veri
                  sağlayıcılarda farklı tanım ve eşiklerle hesaplanabilir; rakamları mutlak doğru saymak
                  yanıltıcıdır.
                </li>
              </ul>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  On-chain analiz, tek başına bir alım satım sistemi değildir. En verimli kullanımı, teknik
                  ve temel analizle birlikte, piyasanın genel davranışını anlamak içindir. Tek bir metriği
                  mutlak sinyal saymak ve risk yönetimini ihmal etmek, en doğru on-chain okumayla bile
                  kayıpla sonuçlanabilir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">On-Chain Veriyi Okumak İçin Yol Haritası</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>Önce metriklerin tanımını öğrenin; bir oranın ne ölçtüğünü bilmeden yorumlamayın.</li>
                <li>Tek bir günün verisine değil, haftalık ve aylık eğilimlere bakın.</li>
                <li>Metrikleri birlikte okuyun; aktif adres, borsa akışları ve stablecoin arzının ortak yönü daha güvenilirdir.</li>
                <li>Borsa rezervi ve madenci rezervi gibi arz tarafı metriklerini düzenli takip edin.</li>
                <li>MVRV ve SOPR gibi değerleme metriklerini, piyasanın duygu evresini anlamak için kullanın.</li>
                <li>Balina hareketlerini tek işlemle değil, çok sayıda büyük adresin ortak eğilimiyle değerlendirin.</li>
                <li>On-chain okumanızı her zaman teknik ve temel analizle birleştirin; tek kaynağa bağlı kalmayın.</li>
                <li>Yorumlarınızı yazılı tutun ve sonradan kontrol edin; hangi metriğin sizin için işe yaradığını zamanla görürsünüz.</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/kripto-analiz" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Kripto Para Nasıl Analiz Edilir <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/bitcoin-dominansi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Bitcoin Dominansı ve Altcoin Sezonu <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/funding-rate" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Funding Rate ve Long/Short Dengesi <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/spot-vs-futures" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Spot ve Futures İşlemler <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
