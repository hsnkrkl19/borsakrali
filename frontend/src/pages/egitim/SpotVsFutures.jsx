import { Link } from 'react-router-dom'
import { Layers, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function SpotVsFutures() {
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
            <span className="text-gray-300">Spot ve Futures İşlemler</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Layers className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                Kripto
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Spot ve Futures İşlemler: Farklar, Kaldıraç ve Riskler
            </h1>
            <p className="text-sm text-gray-500">18 Mayıs 2026 — yaklaşık 10 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Kripto para borsalarına ilk adımını atan herkesin karşısına çıkan iki temel işlem türü vardır:
              spot ve futures. İlk bakışta her ikisi de Bitcoin veya Ethereum alıp satmak gibi görünse de
              aralarındaki fark, bir yatırımcının kazancını da kaybını da kat kat değiştirecek kadar
              büyüktür. Spot piyasada en kötü senaryoda yatırdığınız parayı kaybedersiniz; futures
              piyasasında ise yanlış bir kaldıraç tercihi, hesabınızdaki paranın saatler içinde sıfırlanması
              anlamına gelebilir. Bu yazıda spot ile futures arasındaki farkları, kaldıraç matematiğini,
              teminat ve likidasyon kavramlarını somut sayılarla, adım adım açıklayacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Spot İşlem Nedir?</h2>
              <p>
                Spot işlem, bir varlığı güncel piyasa fiyatından doğrudan satın alıp gerçek anlamda sahip
                olmanızdır. Binance benzeri bir borsada 1.000 USDT ile 0,0125 BTC aldığınızda, bu Bitcoin
                fiilen sizin hesabınıza geçer. İsterseniz cüzdanınıza çekebilir, yıllarca tutabilir, bir
                başkasına gönderebilirsiniz. Ödediğiniz tutar ne ise riskiniz de odur: Bitcoin yarı yarıya
                düşse hesabınız yarıya iner, ama borçlanmadığınız için negatife geçemezsiniz.
              </p>
              <p className="mt-3">
                Spot piyasanın mantığı klasik hisse senedi alımına çok benzer. THYAO hissesini Borsa
                İstanbul'dan satın aldığınızda nasıl o hissenin sahibi oluyorsanız, spotta da varlığın
                gerçek sahibisinizdir. Vade, teminat çağrısı, fonlama ödemesi gibi kavramlar yoktur. Bu
                sadeliği nedeniyle uzun vadeli birikim ve yeni başlayanlar için en güvenli giriş noktasıdır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Futures (Vadeli) İşlem Nedir?</h2>
              <p>
                Futures, yani vadeli işlem, bir varlığı şimdi değil; ileri bir tarihte, bugünden belirlenen
                bir fiyattan alıp satma sözleşmesidir. Geleneksel futures sözleşmelerinin bir vade tarihi
                vardır ve o tarihte sözleşme sona erer. Burada kritik nokta şudur: futures işleminde varlığın
                kendisine sahip olmazsınız, varlığın fiyat hareketi üzerine bir pozisyon açarsınız. Bitcoin
                futures aldığınızda cüzdanınıza Bitcoin gelmez; sadece Bitcoin'in fiyatı yükselirse kazanır,
                düşerse kaybedersiniz.
              </p>
              <p className="mt-3">
                Bu yapı iki büyük olanak sağlar. Birincisi, fiyatın düşeceğini düşünüyorsanız da kazanabilir
                (short pozisyon) yani sadece yükselişten değil düşüşten de para kazanma imkânı bulursunuz.
                İkincisi, kaldıraç sayesinde elinizdeki paradan çok daha büyük bir pozisyon kontrol
                edebilirsiniz. Bu iki olanak, futures'ı güçlü ama bir o kadar da tehlikeli bir araç yapar.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Perpetual (Süresiz) Sözleşmeler</h2>
              <p>
                Kripto piyasasında en çok işlem gören futures türü, klasik vadeli sözleşmeler değil;
                perpetual yani süresiz sözleşmelerdir. Adından da anlaşılacağı gibi bu sözleşmelerin bir
                vade tarihi yoktur. Bir BTC perpetual pozisyonunu, teminatınız yettiği ve likide olmadığınız
                sürece günlerce, aylarca açık tutabilirsiniz.
              </p>
              <p className="mt-3">
                Vade tarihi olmayan bir sözleşmenin fiyatı normalde gerçek piyasadan kopabilir. Bunu
                engellemek için borsalar funding rate (fonlama oranı) adı verilen bir mekanizma kullanır. Bu
                mekanizma, perpetual fiyatını sürekli olarak spot fiyatına yaklaştırır. Funding rate, futures
                piyasasını anlamanın anahtar kavramlarından biridir ve ayrı bir yazıyı hak eder; konunun
                derinine{' '}
                <Link to="/egitim/funding-rate" className="text-gold-400 underline-offset-2 hover:underline">
                  Funding Rate ve Long/Short Dengesi
                </Link>{' '}
                makalemizde inebilirsiniz.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kaldıraç (Leverage) Mantığı</h2>
              <p>
                Kaldıraç, futures piyasasının kalbidir ve en çok yanlış anlaşılan kavramdır. Kaldıraç,
                borsadan ödünç alarak teminatınızdan daha büyük bir pozisyon açmanızı sağlar. 10x kaldıraç
                kullandığınızda, 1.000 USDT teminat ile 10.000 USDT büyüklüğünde bir pozisyon kontrol
                edersiniz. Pozisyon büyüklüğünüz arttığı için, fiyattaki her yüzdelik hareket teminatınız
                üzerinde 10 kat etki yaratır.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Kaldıraç matematiği</h3>
              <p>
                Kaldıracın temel formülü basittir: pozisyon büyüklüğü, teminat ile kaldıracın çarpımına
                eşittir. Kazanç veya kayıp ise pozisyon büyüklüğü üzerinden hesaplanır, teminat üzerinden
                değil. Önemli olan, fiyat hareketinin teminatınıza oranını anlamaktır.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Pozisyon büyüklüğü:</strong> Teminat × Kaldıraç. Örneğin
                  1.000 USDT × 10 = 10.000 USDT.
                </li>
                <li>
                  <strong className="text-white">Kâr/zarar:</strong> Pozisyon büyüklüğü × fiyat değişim
                  yüzdesi. 10.000 USDT'lik pozisyonda fiyat yüzde 5 artarsa, kazanç 500 USDT olur.
                </li>
                <li>
                  <strong className="text-white">Teminat getirisi:</strong> 500 USDT kazanç, 1.000 USDT
                  teminat üzerinden yüzde 50 getiri demektir. Yani fiyatın yüzde 5'lik hareketi, 10x
                  kaldıraçta teminatınızı yüzde 50 değiştirir.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Adım Adım Örnek Hesap</h2>
              <p>
                Sayıları somutlaştıralım. Elinizde 1.000 USDT teminat var ve Bitcoin'in yükseleceğini
                düşünüyorsunuz. 10x kaldıraçla long (alış) pozisyonu açıyorsunuz. İşte iki yönde de neler
                olduğu:
              </p>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>
                  Pozisyon büyüklüğünüz 1.000 × 10 = 10.000 USDT. Bu, yaklaşık 10.000 USDT değerinde
                  Bitcoin'e maruz kaldığınız anlamına gelir.
                </li>
                <li>
                  Bitcoin yüzde 5 <strong className="text-white">yükselirse:</strong> 10.000 × 0,05 = 500
                  USDT kâr. Teminatınız 1.500 USDT'ye çıkar — yüzde 50 kazanç.
                </li>
                <li>
                  Bitcoin yüzde 5 <strong className="text-white">düşerse:</strong> 10.000 × 0,05 = 500 USDT
                  zarar. Teminatınız 500 USDT'ye iner — yüzde 50 kayıp.
                </li>
                <li>
                  Bitcoin yüzde 10 düşerse: 1.000 USDT zarar. Teminatınızın tamamı erir ve pozisyonunuz
                  likide olur. Yani 10x kaldıraçta, varlığın yalnızca yüzde 10 ters hareketi hesabınızı
                  sıfırlamaya yeter.
                </li>
              </ol>
              <p className="mt-3">
                Bu örnekteki en çarpıcı sonuç şudur: spot piyasada Bitcoin'in yüzde 10 düşmesi sizi yalnızca
                yüzde 10 zarara uğratırken, 10x kaldıraçlı futures'ta aynı hareket tüm sermayenizi yok eder.
                Kaldıraç oranı yükseldikçe, sizi likide edecek fiyat hareketi de küçülür. 25x kaldıraçta
                yaklaşık yüzde 4, 50x kaldıraçta yaklaşık yüzde 2 ters hareket teminatı bitirir.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Kaldıracı pozisyonunuzu büyütmek için değil, riskinizi sabit tutmak için kullanın.
                  Hesabınızın yüzde 10'unu riske atmak istiyorsanız, 3x kaldıraçla küçük bir pozisyon
                  açmak; 20x ile büyük pozisyon açıp dar bir zarar durdur koymaktan çok daha sağlıklıdır.
                  Düşük kaldıraç, fiyatın normal dalgalanmasında erken likide olmanızı engeller.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Başlangıç ve Sürdürme Marjı</h2>
              <p>
                Futures pozisyonu açarken iki tür teminat seviyesi devreye girer. Bunları bilmek, ne zaman
                likide olacağınızı önceden anlamak için şarttır.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Başlangıç marjı (initial margin):</strong> Pozisyonu açmak
                  için gereken minimum teminattır. 10x kaldıraçta pozisyon büyüklüğünün onda biri kadardır.
                  10.000 USDT'lik pozisyon için 1.000 USDT başlangıç marjı gerekir.
                </li>
                <li>
                  <strong className="text-white">Sürdürme marjı (maintenance margin):</strong> Pozisyonun
                  açık kalmaya devam etmesi için hesabınızda bulunması gereken asgari teminattır. Genelde
                  pozisyon büyüklüğünün yüzde 0,5 ile yüzde 1'i civarındadır. Teminatınız bu eşiğin altına
                  düşerse borsa pozisyonu zorla kapatır.
                </li>
              </ul>
              <p className="mt-3">
                İki marj arasındaki fark, zarar için elinizdeki tampon alanıdır. Zarar büyüdükçe teminatınız
                başlangıç marjından sürdürme marjına doğru erir; sürdürme marjına değdiği an likidasyon
                tetiklenir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Likidasyon (Tasfiye) Nasıl Gerçekleşir?</h2>
              <p>
                Likidasyon, futures piyasasında en korkulan kelimedir. Pozisyonunuzun zararı, teminatınızı
                sürdürme marjı seviyesine indirdiğinde borsanın likidasyon motoru devreye girer ve
                pozisyonunuzu piyasa fiyatından otomatik olarak kapatır. Bu noktada teminatınızın tamamına
                yakını kaybolmuştur.
              </p>
              <p className="mt-3">
                Likidasyon fiyatı, pozisyon açıldığı anda bellidir ve borsanın ekranında gösterilir. 1.000
                USDT teminat, 10x kaldıraç ile açılan bir long pozisyonun likidasyon fiyatı, giriş fiyatının
                yaklaşık yüzde 9 ile yüzde 10 altındadır. Borsalar likidasyon sırasında ek bir tasfiye ücreti
                de keser; bu yüzden pratikte teminatınızın yüzde 100'ünü kaybedersiniz.
              </p>
              <p className="mt-3">
                Likidasyondan korunmanın iki yolu vardır: pozisyona ek teminat eklemek veya önceden bir
                zarar durdur (stop-loss) emri koyarak likidasyon fiyatına ulaşılmadan çıkmak. Profesyonel
                yaklaşım her zaman ikincisidir; likidasyon, risk yönetiminin başarısız olduğu noktadır.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Yüksek kaldıraç, kısa süreli ve sert fiyat sıçramalarında (wick) sizi likide edebilir.
                  Fiyat birkaç saniye için likidasyon seviyenize dokunup hemen geri dönse bile pozisyonunuz
                  kapanmış olur. Bu yüzden 50x veya 100x gibi kaldıraçlar, doğru yönde bahis yapsanız dahi
                  hesabınızı yok edebilir. Kaldıraç ne kadar yüksekse, piyasa gürültüsüne dayanma payınız o
                  kadar azdır.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Long ve Short Pozisyon</h2>
              <p>
                Futures piyasasının spota göre en belirgin üstünlüğü, iki yöne de pozisyon açabilmenizdir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Long (alış) pozisyon:</strong> Fiyatın yükseleceğine dair
                  pozisyondur. Bitcoin 60.000 USDT'den long açtıysanız ve 66.000'e çıkarsa kazanırsınız.
                  Spot alımının futures karşılığıdır.
                </li>
                <li>
                  <strong className="text-white">Short (satış) pozisyon:</strong> Fiyatın düşeceğine dair
                  pozisyondur. Bitcoin 60.000'den short açtıysanız ve 54.000'e inerse kazanırsınız. Spot
                  piyasada bu mümkün değildir; düşüşten kazanmak yalnızca futures ile yapılır.
                </li>
              </ul>
              <p className="mt-3">
                Short pozisyon, ayı piyasasında değer korumak veya elinizdeki spot varlığı korumaya almak
                (hedge) için de kullanılır. Ancak short'un teorik zararı sınırsızdır: fiyat ne kadar
                yükselebilirse zarar da o kadar büyüyebilir. Bu nedenle short pozisyonlarda zarar durdur emri
                kullanmak, long'a göre daha da kritiktir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Spot ve Futures Karşılaştırması</h2>
              <p>
                İki işlem türünü madde madde karşılaştırdığımızda temel farklar netleşir:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Sahiplik:</strong> Spotta varlığın gerçek sahibi olursunuz
                  ve cüzdana çekebilirsiniz; futures'ta yalnızca fiyat hareketine pozisyon alırsınız.
                </li>
                <li>
                  <strong className="text-white">Kaldıraç:</strong> Spotta kaldıraç yoktur, 1x'tir;
                  futures'ta tipik olarak 1x ile 125x arasında kaldıraç kullanılabilir.
                </li>
                <li>
                  <strong className="text-white">Yön:</strong> Spotta yalnızca yükselişten kazanırsınız;
                  futures'ta hem long hem short ile iki yönden de kazanç mümkündür.
                </li>
                <li>
                  <strong className="text-white">Maksimum kayıp:</strong> Spotta en kötü senaryoda yatırdığınız
                  para; futures'ta likidasyon ile teminatın tamamı, izole olmayan modda hesabın geneli risk
                  altındadır.
                </li>
                <li>
                  <strong className="text-white">Ek maliyet:</strong> Spotta yalnızca işlem komisyonu;
                  futures'ta bunun yanında her 8 saatte bir funding ödemesi devreye girer.
                </li>
                <li>
                  <strong className="text-white">Zaman baskısı:</strong> Spotta vade ve teminat çağrısı
                  yoktur, yıllarca tutabilirsiniz; futures'ta likidasyon riski pozisyonu sürekli izlemenizi
                  gerektirir.
                </li>
                <li>
                  <strong className="text-white">Uygunluk:</strong> Spot her seviyeye uygundur; futures
                  deneyim, disiplin ve aktif takip ister.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kaldıracın Gerçek Riski</h2>
              <p>
                Kaldıracın asıl tehlikesi, kayıpları büyütmesi değil; yatırımcının psikolojisini bozmasıdır.
                10x kaldıraçla açılan bir pozisyonda fiyatın yüzde 2 dalgalanması, teminatın yüzde 20'sinin
                anlık olarak yanıp sönmesi demektir. Bu oynaklık, deneyimli yatırımcıların bile sabırsız
                davranmasına, planını terk etmesine ve duygusal kararlar almasına yol açar.
              </p>
              <p className="mt-3">
                İstatistikler de bunu doğrular: yüksek kaldıraçla işlem yapan bireysel hesapların büyük
                çoğunluğu uzun vadede zarar eder. Çünkü kaldıraç, yanlış kararların maliyetini hızlandırır;
                doğru kararların ödülünü ise funding maliyeti ve likidasyon riski yer yer geri alır.
                Kaldıraç bir kazanç motoru değil, bir hız çarpanıdır — hem kâra hem zarara doğru.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kimler İçin Uygun?</h2>
              <p>
                İki piyasanın da yeri vardır, ama kullanıcı profili farklıdır:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Spot:</strong> Yeni başlayanlar, uzun vadeli birikim
                  yapanlar, kriptoyu cüzdanında saklamak isteyenler ve maliyet ortalama (DCA) yöntemini
                  uygulayanlar için doğru tercihtir.
                </li>
                <li>
                  <strong className="text-white">Futures:</strong> Piyasayı aktif takip eden, risk
                  yönetimini disiplinli uygulayan, zarar durdur emri kullanmayı alışkanlık edinmiş ve
                  oynaklığa psikolojik olarak hazır deneyimli yatırımcılar için anlamlıdır.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Futures İçin Güvenli Kullanım Kuralları</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>Futures'a başlamadan önce mutlaka spot piyasada deneyim kazanın; yürümeden koşmaya çalışmayın.</li>
                <li>Düşük kaldıraçla başlayın: 2x veya 3x, yeni başlayan için 20x'ten çok daha güvenlidir.</li>
                <li>Her pozisyonda zarar durdur (stop-loss) emrini, pozisyonu açar açmaz girin — sonra değil.</li>
                <li>Tek bir işlemde hesabınızın yüzde 1 ile yüzde 2'sinden fazlasını riske atmayın.</li>
                <li>İzole marj modunu kullanın; böylece bir pozisyonun zararı tüm hesabınızı tehdit etmez.</li>
                <li>Likidasyon fiyatınızı pozisyon açar açmaz kontrol edin ve giriş fiyatına ne kadar yakın olduğunu görün.</li>
                <li>Funding maliyetini hesaba katın; uzun süre açık tutulan pozisyonlarda funding kârı eritir.</li>
                <li>Kaybetmeyi göze alamayacağınız parayla, ödünç parayla ya da borçla asla futures işlemi yapmayın.</li>
              </ol>
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
                  <Link to="/egitim/risk-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Risk Yönetimi <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/kripto-para-giris" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Kripto Paraya Giriş <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/funding-rate" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Funding Rate ve Long/Short Dengesi <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
