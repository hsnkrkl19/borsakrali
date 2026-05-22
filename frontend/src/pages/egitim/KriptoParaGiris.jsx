import { Link } from 'react-router-dom'
import { Bitcoin, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function KriptoParaGiris() {
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
            <span className="text-gray-300">Kripto Paraya Giriş</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Bitcoin className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                Kripto
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Kripto Paraya Giriş: Bitcoin, Blockchain ve Temel Kavramlar
            </h1>
            <p className="text-sm text-gray-500">16 Mayıs 2026 — yaklaşık 9 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Kripto para, kriptografi yöntemleriyle güvence altına alınan ve genellikle merkezi bir otorite
              olmadan çalışan dijital varlık sınıfıdır. Bir banka, devlet ya da aracı kurumun onayına ihtiyaç
              duymadan; internet üzerinden, uçtan uca değer transferine olanak verir. İlk başta soyut görünen
              bu fikir, aslında oldukça somut bir teknolojiye dayanır: blok zinciri. Bu yazıda blok zincirinin
              nasıl çalıştığını, Bitcoin'in nasıl doğduğunu, madenciliğin ne işe yaradığını, Ethereum'un getirdiği
              akıllı kontrat devrimini, coin ile token arasındaki farkı, cüzdan ve borsa türlerini ve kripto
              piyasasının taşıdığı temel riskleri sıfırdan ele alacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Blok Zinciri (Blockchain) Nedir?</h2>
              <p>
                Blok zinciri, işlemlerin kronolojik sırayla kaydedildiği, herkesçe görülebilen ve değiştirilmesi
                pratikte imkânsız bir dijital defterdir. İsmi tam anlamıyla yapısını anlatır: işlemler "blok"
                adı verilen paketlerde gruplanır ve her blok kendinden önceki bloğa kriptografik bir özet
                (hash) ile bağlanır, böylece bir "zincir" oluşur.
              </p>
              <p className="mt-3">
                Bu zincirin gücü şuradan gelir: bir bloğun içeriği değiştirilirse o bloğun hash değeri
                bozulur, dolayısıyla ondan sonraki tüm bloklar geçersiz hale gelir. Defterin kopyası dünya
                genelinde binlerce bilgisayarda (düğüm / node) eşzamanlı tutulduğu için, tek bir kopyayı
                değiştirmek hiçbir işe yaramaz; ağdaki çoğunluk sahte zinciri reddeder. İşte "değiştirilemezlik"
                ve "merkeziyetsizlik" kavramları bu mimariden doğar.
              </p>
              <p className="mt-3">
                Geleneksel sistemde bir banka transferinin doğruluğunu bankanın kendi veri tabanı garanti
                eder. Blok zincirinde ise doğruluğu, birbirini tanımayan binlerce katılımcının üzerinde
                uzlaştığı ortak bir kayıt garanti eder. Aradaki fark bir cümleyle özetlenebilir: güveni bir
                kuruma değil, matematiğe ve ağa devretmek.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bitcoin'in Doğuşu</h2>
              <p>
                Bitcoin'in hikâyesi 31 Ekim 2008'de, "Satoshi Nakamoto" takma adıyla yayımlanan dokuz
                sayfalık bir beyaz kâğıtla (whitepaper) başladı. "Bitcoin: A Peer-to-Peer Electronic Cash
                System" başlıklı bu belge, aracı bir finans kurumu olmadan, doğrudan kişiden kişiye çalışan
                bir elektronik nakit sistemi öneriyordu. Belgenin yayımlanması, 2008 küresel finans krizinin
                tam ortasına denk gelmesi açısından da semboliktir.
              </p>
              <p className="mt-3">
                İlk blok, "genesis bloğu" olarak bilinen blok, 3 Ocak 2009'da kazıldı. Satoshi bu bloğun
                içine o günkü bir gazete manşetini gömdü; bu, hem zaman damgası hem de bankacılık sistemine
                gönderme niteliğindeydi. Bitcoin'in gerçek dünyadaki ilk ticari kullanımı ise 2010'da, bir
                kullanıcının 10.000 BTC karşılığında iki pizza satın almasıydı. O dönem birkaç dolar değerindeki
                bu miktar, Bitcoin'in zamanla nasıl bir değer ölçeğine ulaştığını anlatan klasik bir örnektir.
              </p>
              <p className="mt-3">
                Satoshi Nakamoto'nun kimliği bugüne kadar açığa çıkmadı ve 2011 civarında projeden tamamen
                çekildi. Bu durum aslında Bitcoin felsefesiyle tutarlıdır: sistem, kurucusuna bağımlı olmadan,
                yalnızca koduyla ve ağıyla ayakta kalacak şekilde tasarlanmıştır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Merkeziyetsizlik Neden Önemli?</h2>
              <p>
                Merkeziyetsizlik, sistemin tek bir kontrol noktasına bağlı olmaması demektir. Bunun pratikte
                üç önemli sonucu vardır. Birincisi sansüre dayanıklılıktır: hiçbir kurum belirli bir adresin
                işlem yapmasını tek taraflı engelleyemez. İkincisi tek nokta arıza riskinin ortadan
                kalkmasıdır: bir veri merkezi çökse bile ağ çalışmaya devam eder. Üçüncüsü kural
                değişmezliğidir: para arzı kuralları kodla sabitlenmiştir ve bir gecede değiştirilemez.
              </p>
              <p className="mt-3">
                Buna karşılık merkeziyetsizliğin bedelleri de vardır: işlemler genelde daha yavaştır,
                ücretler dalgalanabilir ve yanlış adrese gönderilen bir transferi geri alacak bir "müşteri
                hizmetleri" yoktur. Sorumluluk tamamen kullanıcıya aittir. Kripto'yu anlamak, bu özgürlük ve
                sorumluluk takasını anlamakla başlar.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Madencilik ve Proof of Work</h2>
              <p>
                Bitcoin'de yeni blokların oluşturulması ve işlemlerin doğrulanması "madencilik" (mining) ile
                yapılır. Madenciler, güçlü donanımlarla çok sayıda matematiksel deneme yaparak belirli bir
                hash hedefini tutturmaya çalışır. Bu yarışı kazanan madenci yeni bloğu zincire ekler ve
                karşılığında blok ödülü ile işlem ücretlerini alır. Bu mekanizmaya Proof of Work (İş İspatı)
                denir.
              </p>
              <p className="mt-3">
                İş İspatı'nın amacı, defteri sahtelemeyi ekonomik olarak anlamsız kılmaktır: zinciri
                değiştirmek isteyen biri, ağdaki tüm dürüst madencilerin toplam hesaplama gücünün yarısından
                fazlasını ele geçirmek zorunda kalır ki bu pratikte muazzam bir maliyet gerektirir.
              </p>
              <p className="mt-3">
                Bitcoin'de blok ödülü yaklaşık her dört yılda bir yarıya iner; bu olaya "halving" denir.
                Başlangıçta blok başına 50 BTC olan ödül, art arda yarılanmalarla zamanla çok daha düşük
                seviyelere inmiştir. Bu programlı azalış, Bitcoin'in arz tarafının neden öngörülebilir
                olduğunu açıklayan temel unsurdur.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Tüm kripto paralar Proof of Work kullanmaz. Ethereum 2022'de Proof of Stake (Hisse İspatı)
                  modeline geçti; bu modelde blokları doğrulama hakkı, donanım gücüne değil, kilitlenen
                  (stake edilen) coin miktarına bağlıdır ve enerji tüketimi çok daha düşüktür. Bir projeyi
                  incelerken hangi uzlaşı mekanizmasını kullandığına bakmak iyi bir alışkanlıktır.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Ethereum ve Akıllı Kontratlar</h2>
              <p>
                Bitcoin temelde bir değer transferi ve değer saklama ağıdır. Ethereum ise 2015'te bir adım
                öteye geçti: blok zincirini yalnızca para göndermek için değil, programlanabilir bir platform
                olarak kullanmayı önerdi. Bu platformun yapı taşı "akıllı kontrat"tır (smart contract).
              </p>
              <p className="mt-3">
                Akıllı kontrat, belirli koşullar sağlandığında otomatik olarak çalışan, blok zincirine
                yüklenmiş bir koddur. Aracıya gerek kalmadan "şu olursa şunu yap" kuralını garanti eder.
                Bir borç verme protokolü, bir kripto borsası ya da bir koleksiyon parçası (NFT); hepsi akıllı
                kontratlar üzerinde çalışabilir. Ethereum'un yerel kripto parası ETH (Ether), bu ağda işlem
                yapmanın ve kontrat çalıştırmanın yakıtıdır; ağ üzerindeki işlem ücretine "gas" denir.
              </p>
              <p className="mt-3">
                Ethereum'un açtığı bu yol, merkeziyetsiz finans (DeFi) ve dijital varlık uygulamalarının
                tamamının temelini oluşturdu. Bugün piyasadaki binlerce token, büyük ölçüde bu programlanabilir
                zincirler sayesinde var olmaktadır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Coin, Token ve Altcoin Farkı</h2>
              <p>
                Yeni başlayanlar bu üç terimi sıkça karıştırır. Aralarındaki fark, kripto evrenini doğru
                okumak için önemlidir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Coin:</strong> Kendi bağımsız blok zincirine sahip olan
                  kripto paradır. Bitcoin kendi zincirinde çalışan bir coindir; Ether de Ethereum zincirinin
                  yerel coinidir.
                </li>
                <li>
                  <strong className="text-white">Token:</strong> Kendi zinciri olmayan, var olan bir blok
                  zinciri üzerinde (örneğin Ethereum üzerinde) akıllı kontratla oluşturulmuş varlıktır. Bir
                  projenin yönetim hakkını, bir hizmete erişimi ya da bir değeri temsil edebilir.
                </li>
                <li>
                  <strong className="text-white">Altcoin:</strong> Kelime anlamıyla "Bitcoin dışı coin"
                  demektir. Ethereum dahil, Bitcoin haricindeki tüm kripto paralar geniş anlamda altcoin
                  olarak adlandırılır.
                </li>
              </ul>
              <p className="mt-3">
                Bir örnekle netleştirelim: USDT (Tether) bir stabilcoindir ve genelde Ethereum gibi
                zincirler üzerinde token olarak dolaşır. Yani USDT bir "coin" değil, başka bir zincir
                üzerinde yaşayan bir "token"dır. Bu ayrımı bilmek, bir varlığı hangi cüzdana ve hangi ağ
                üzerinden göndereceğinizi doğru seçmenizi sağlar.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Sınırlı Arz Modeli</h2>
              <p>
                Bitcoin'in en sık konuşulan özelliklerinden biri, toplam arzının koda gömülü biçimde 21
                milyon adetle sınırlı olmasıdır. Bu üst sınır, halving mekanizması ile yeni arzın giderek
                azaltılarak asimptotik olarak 21 milyona yaklaşması şeklinde uygulanır. Yeni Bitcoin üretimi
                tahmini olarak 22. yüzyıla doğru tamamen duracaktır.
              </p>
              <p className="mt-3">
                Bu tasarımın mantığı, enflasyona karşı bir "dijital kıtlık" yaratmaktır. Bir merkez bankası
                gerektiğinde para basabilirken, Bitcoin'in arz programı kodla sabitlenmiştir. Yine de
                şu uyarı önemlidir: sınırlı arz fiyatın yükseleceğinin garantisi değildir. Bir varlığın
                değeri, arz kadar talebe de bağlıdır ve talep son derece değişkendir. Ayrıca her kripto para
                sınırlı arza sahip değildir; bazı projelerde toplam arz tanımsızdır veya enflasyonist bir
                modele dayanır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Cüzdan Türleri: Sıcak ve Soğuk</h2>
              <p>
                Kripto cüzdanı aslında "coin saklayan" bir kutu değildir; varlıklar her zaman blok zincirinde
                durur. Cüzdan, o varlıkları hareket ettirme yetkisi veren özel anahtarları (private key)
                saklar. Bu yüzden kripto dünyasında çok bilinen bir söz vardır: anahtarın yoksa, coinin de
                yoktur. Cüzdanlar internet bağlantısına göre ikiye ayrılır.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Sıcak cüzdan (hot wallet):</strong> İnternete bağlı çalışan
                  cüzdanlardır. Telefon uygulamaları, tarayıcı eklentileri ve borsa cüzdanları bu gruba
                  girer. Pratik ve hızlıdır, günlük kullanım için uygundur; ancak çevrimiçi oldukları için
                  saldırı yüzeyi daha geniştir.
                </li>
                <li>
                  <strong className="text-white">Soğuk cüzdan (cold wallet):</strong> Özel anahtarı çevrimdışı
                  tutan cüzdanlardır. Donanım cüzdanları (fiziksel bir cihaz) en yaygın örnektir. Uzun
                  vadeli ve büyük miktarlı saklama için en güvenli yöntem olarak kabul edilir.
                </li>
              </ul>
              <p className="mt-3">
                Yaygın bir yaklaşım, küçük ve aktif kullanılan bir bakiyeyi sıcak cüzdanda tutmak, büyük ve
                uzun vadeli bakiyeyi ise soğuk cüzdana taşımaktır. Her iki durumda da kurtarma kelimeleri
                (seed phrase) kâğıda yazılarak fiziksel ve gizli bir yerde saklanmalı, asla internete
                yüklenmemelidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Borsa Türleri: CEX ve DEX</h2>
              <p>
                Kripto para alıp satmanın iki ana yolu vardır ve aralarındaki fark, yeni başlayan için
                kritik öneme sahiptir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Merkezi borsa (CEX):</strong> Bir şirket tarafından
                  işletilen, hesap açma ve kimlik doğrulama gerektiren borsalardır. Kullanım kolaylığı,
                  yüksek likidite ve müşteri desteği sunar. Buna karşılık varlıklarınız borsanın kontrolünde
                  durur; borsa bir sorun yaşarsa fonlarınız etkilenebilir.
                </li>
                <li>
                  <strong className="text-white">Merkeziyetsiz borsa (DEX):</strong> Akıllı kontratlar
                  üzerinden, aracı bir şirket olmadan çalışan borsalardır. İşlemler doğrudan kullanıcı
                  cüzdanı ile yapılır; varlıkların kontrolü her an kullanıcıdadır. Buna karşılık arayüz daha
                  teknik olabilir ve hata yapan kullanıcıyı koruyacak bir merci yoktur.
                </li>
              </ul>
              <p className="mt-3">
                İşlem bittikten sonra varlıkları borsada bırakmak ile kendi cüzdanına çekmek ayrı bir
                karardır. "Borsada tut" yolu pratiktir; "kendi cüzdanına çek" yolu kontrolü tamamen size
                verir. Doğru seçim, miktara ve saklama süresine göre değişir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Volatilite ve Temel Riskler</h2>
              <p>
                Kripto piyasasının en belirgin özelliği yüksek volatilitedir. Bir kripto varlığın fiyatı tek
                bir günde çift haneli yüzdelerle yükselebilir veya düşebilir. Bu, hem fırsat hem de ciddi bir
                risktir. Yeni başlayan bir yatırımcının farkında olması gereken başlıca riskler şunlardır.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Fiyat riski:</strong> Sert ve hızlı değer kayıpları
                  yaşanabilir; geçmiş yükselişler gelecek için garanti vermez.
                </li>
                <li>
                  <strong className="text-white">Güvenlik riski:</strong> Oltalama (phishing) saldırıları,
                  sahte uygulamalar ve anahtar kaybı kalıcı fon kaybına yol açabilir.
                </li>
                <li>
                  <strong className="text-white">Proje riski:</strong> Birçok küçük projenin uzun vadede
                  hayatta kalmadığı, bazılarının ise baştan dolandırıcılık amaçlı olduğu unutulmamalıdır.
                </li>
                <li>
                  <strong className="text-white">Düzenleme riski:</strong> Ülkelerin kripto'ya yönelik
                  kuralları değişebilir ve bu durum piyasayı etkileyebilir.
                </li>
              </ul>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Kripto para yüksek riskli bir varlık sınıfıdır. Yatırıma yalnızca kaybetmeyi göze
                  alabileceğiniz tutarla başlayın. "Garantili getiri", "kesin kazanç" ya da kısa sürede
                  servet vaat eden hiçbir kanala güvenmeyin; bu vaatler kripto dünyasındaki en yaygın
                  dolandırıcılık kalıbıdır.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yeni Başlayanlar İçin Yol Haritası</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>Önce kavramları öğrenin: blok zinciri, özel anahtar, cüzdan ve gas gibi temel terimleri içselleştirmeden işlem yapmayın.</li>
                <li>Bitcoin ve Ethereum gibi büyük ve uzun süredir var olan varlıkları inceleyerek başlayın; küçük ve bilinmeyen projelerle değil.</li>
                <li>Saygın bir borsada hesap açın, kimlik doğrulamasını tamamlayın ve iki adımlı doğrulamayı (2FA) mutlaka aktif edin.</li>
                <li>Küçük bir tutarla başlayın; ilk amacınız kazanmak değil, sistemin nasıl işlediğini öğrenmek olsun.</li>
                <li>Bir cüzdan kurun, kurtarma kelimelerini kâğıda yazıp güvenli biçimde saklayın ve asla kimseyle paylaşmayın.</li>
                <li>Belirli bir miktarı kendi cüzdanınıza çekmeyi deneyerek transfer sürecini birebir tecrübe edin.</li>
                <li>Tek seferde büyük alım yerine, düzenli ve planlı alımı değerlendirin; volatiliteyi yönetmenin bilinen yollarından biridir.</li>
                <li>Her zaman bir bütçe ve risk sınırı belirleyin; portföyünüzün ne kadarının kripto olacağına önceden karar verin.</li>
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
                  <Link to="/egitim/spot-vs-futures" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Spot ve Futures İşlemler Arasındaki Fark <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/risk-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Risk Yönetimi: Sermayeni Korumanın Yolları <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/kripto-analiz" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Kripto Para Nasıl Analiz Edilir <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
