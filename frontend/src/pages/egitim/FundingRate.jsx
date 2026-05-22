import { Link } from 'react-router-dom'
import { Scale, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function FundingRate() {
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
            <span className="text-gray-300">Funding Rate ve Long/Short Dengesi</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Scale className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                Kripto
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Funding Rate ve Long/Short Dengesi: Futures Piyasasını Okumak
            </h1>
            <p className="text-sm text-gray-500">19 Mayıs 2026 — yaklaşık 9 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Kripto futures piyasasında çoğu yatırımcı sadece fiyat grafiğine bakar. Oysa fiyatın altında,
              piyasanın gerçek ruh halini ele veren bir gösterge çalışır: funding rate. Bu oran, futures
              piyasasındaki long ve short pozisyonların dengesini ve yatırımcıların hangi yöne aşırı
              yığıldığını gösterir. Funding rate'i okumayı öğrenen biri, bir yükselişin sağlıklı mı yoksa
              aşırı kaldıraçla şişmiş mi olduğunu, bir düşüşün panikten mi yoksa gerçek satıştan mı
              kaynaklandığını anlayabilir. Bu yazıda funding rate'in ne olduğunu, nasıl hesaplandığını ve
              piyasa okuması için nasıl kullanılacağını adım adım açıklayacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Funding Rate Nedir?</h2>
              <p>
                Funding rate, yani fonlama oranı; perpetual (süresiz) futures sözleşmelerinde long ve short
                pozisyon sahipleri arasında düzenli aralıklarla el değiştiren küçük bir ödemedir. Bu ödeme
                borsaya gitmez; doğrudan bir taraftan diğerine aktarılır. Funding rate pozitifse long'lar
                short'lara öder, negatifse short'lar long'lara öder.
              </p>
              <p className="mt-3">
                Funding rate'in tek bir görevi vardır: perpetual sözleşmenin fiyatını, varlığın gerçek spot
                fiyatına yakın tutmak. Bu mekanizmayı anlamak için önce perpetual sözleşmelerin temel
                sorununa bakmak gerekir. Perpetual ve kaldıraç mantığını hatırlamak isterseniz{' '}
                <Link to="/egitim/spot-vs-futures" className="text-gold-400 underline-offset-2 hover:underline">
                  Spot ve Futures İşlemler
                </Link>{' '}
                makalemiz iyi bir başlangıç noktasıdır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Perpetual Fiyatı Spota Neden Sabitlenir?</h2>
              <p>
                Klasik vadeli sözleşmelerin bir bitiş tarihi vardır; vade geldiğinde sözleşme fiyatı spot
                fiyata yakınsamak zorundadır. Perpetual sözleşmelerin ise vadesi yoktur. Vade olmayınca,
                sözleşme fiyatını spota çekecek doğal bir kuvvet de olmaz. Bu durumda perpetual fiyatı
                kolayca spot fiyattan kopabilir.
              </p>
              <p className="mt-3">
                Funding rate tam burada devreye girer. Perpetual fiyatı spotun üzerine çıktığında — yani
                piyasa aşırı iyimser ve long'a yığılmışken — funding pozitif olur. Pozitif funding, long
                tutmayı maliyetli hale getirir; bazı long'lar pozisyon kapatır, fiyat spota doğru iner. Tam
                tersine perpetual fiyatı spotun altına düştüğünde funding negatif olur, short tutmak
                maliyetlenir ve fiyat yukarı, spota doğru çekilir. Yani funding rate, futures fiyatını sürekli
                spota geri yaklaştıran görünmez bir lastik banttır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Pozitif Funding Ne Anlatır?</h2>
              <p>
                Funding rate pozitifse, bu perpetual fiyatının spotun üzerinde olduğu ve piyasada long
                pozisyonların baskın olduğu anlamına gelir. Yatırımcıların çoğunluğu fiyatın yükseleceğine
                bahis oynamaktadır ve bu iyimserliğin maliyetini her funding döneminde short'lara öderler.
              </p>
              <p className="mt-3">
                Düşük ve istikrarlı bir pozitif funding (örneğin yüzde 0,01 civarı) normaldir; boğa
                piyasasının doğal halidir. Ancak funding sıra dışı seviyelere — yüzde 0,1 veya üzerine —
                çıktığında bu bir uyarı işaretidir. Aşırı pozitif funding, piyasanın aşırı kaldıraçlı long
                ile dolduğunu; küçük bir düşüşün bile zincirleme long likidasyonlarını tetikleyebileceğini
                gösterir. Bitcoin sert yükselişlerin tepesinde funding genellikle aşırı pozitife gider.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Negatif Funding Ne Anlatır?</h2>
              <p>
                Funding rate negatifse, perpetual fiyatı spotun altındadır ve short pozisyonlar baskındır.
                Bu durumda short tutanlar, fiyatın düşeceğine dair bahislerinin bedelini long'lara öderler.
                Negatif funding genellikle korku, panik veya yoğun bir ayı duygusunun olduğu anlarda görülür.
              </p>
              <p className="mt-3">
                Tıpkı pozitif tarafta olduğu gibi, aşırı negatif funding da bir aşırılık işaretidir. Piyasa
                short'a aşırı yığıldığında, beklenmedik bir yükseliş short'ları zorla kapanmaya iter ve bu da
                short squeeze adı verilen sert bir yukarı hareket yaratabilir. Ethereum gibi altcoin'lerde
                derin düşüşlerin dibinde funding'in belirgin negatife geçmesi sık görülür.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Funding rate'i bir kalabalık ölçer olarak düşünün. Pozitifse kalabalık long tarafta,
                  negatifse short tarafta toplanmıştır. Piyasalarda kalabalığın aşırı yoğunlaştığı taraf,
                  çoğu zaman acı veren taraftır. Funding ekstrem bir değere ulaştığında, pozisyonunuzun
                  kalabalıkla aynı yönde olup olmadığını mutlaka sorgulayın.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Funding Ödemesinin Hesabı ve Periyodu</h2>
              <p>
                Funding ödemesi, çoğu büyük borsada her 8 saatte bir gerçekleşir; tipik olarak günde üç kez.
                Önemli bir nokta şudur: ödeme yalnızca o anda pozisyonu açık olanlar arasında yapılır.
                Funding saatinden hemen önce pozisyonu kapatan biri ödeme yapmaz veya almaz.
              </p>
              <p className="mt-3">
                Ödeme tutarı, teminatınız üzerinden değil; pozisyonunuzun toplam büyüklüğü üzerinden
                hesaplanır. Formül basittir: ödeme, pozisyon büyüklüğü ile funding rate'in çarpımına eşittir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Pozisyon büyüklüğü:</strong> 1.000 USDT teminat ve 10x
                  kaldıraç ile 10.000 USDT.
                </li>
                <li>
                  <strong className="text-white">Funding rate:</strong> Bu dönem için yüzde 0,01 olsun
                  (pozitif).
                </li>
                <li>
                  <strong className="text-white">Bir dönemlik ödeme:</strong> 10.000 × 0,0001 = 1 USDT. Long
                  iseniz bu 1 USDT'yi ödersiniz, short iseniz alırsınız.
                </li>
                <li>
                  <strong className="text-white">Günlük maliyet:</strong> Günde 3 funding dönemi olduğundan,
                  pozisyon gün boyu açıksa toplam 3 USDT. Bir ayda funding sabit kalırsa yaklaşık 90 USDT —
                  teminatınızın yüzde 9'u.
                </li>
              </ul>
              <p className="mt-3">
                Bu örnek, funding maliyetinin uzun süre açık tutulan kaldıraçlı pozisyonlarda neden ciddi
                bir yük olduğunu gösterir. Düşük gibi görünen bir oran, kaldıraç ve zaman ile birleşince
                kârı sessizce eritir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Long/Short Oranı</h2>
              <p>
                Long/short oranı, belirli bir varlıkta açık long pozisyonların açık short pozisyonlara
                bölünmesiyle elde edilir. 1'in üzerindeki bir değer long'ların, 1'in altındaki bir değer
                short'ların baskın olduğunu gösterir. Funding rate ile aynı hikâyeyi anlatır, ama doğrudan
                pozisyon sayısına bakar.
              </p>
              <p className="mt-3">
                Bu oranı yorumlarken hangi grubun ölçüldüğüne dikkat etmek gerekir. Borsalar genellikle iki
                ayrı veri sunar: tüm hesapların oranı ve yalnızca büyük (whale) hesapların oranı. Büyük
                hesaplar piyasada genellikle daha isabetli olduğundan, perakende hesapların oranı ile büyük
                hesapların oranı birbirinden ayrıştığında bu dikkate değer bir sinyaldir. Perakende ağırlıklı
                long iken büyük hesaplar short tarafta yığılıyorsa, temkinli olmakta fayda vardır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Açık Pozisyon (Open Interest) ile Birlikte Yorum</h2>
              <p>
                Açık pozisyon, yani open interest; o anda piyasada açık bulunan tüm futures sözleşmelerinin
                toplam değeridir. Tek başına yön bilgisi vermez, ama funding ve fiyat ile birlikte
                okunduğunda piyasanın yapısını ortaya koyar.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Fiyat yükselir + açık pozisyon artar:</strong> Yükselişe yeni
                  para giriyor; trend kaldıraçla destekleniyor. Funding da pozitifleşiyorsa hareket güçlü ama
                  giderek kırılgan.
                </li>
                <li>
                  <strong className="text-white">Fiyat yükselir + açık pozisyon azalır:</strong> Short
                  pozisyonlar kapanıyor (short squeeze); yükseliş yeni alımdan değil, kapatmadan besleniyor.
                  Bu tür yükselişler genelde kalıcı olmaz.
                </li>
                <li>
                  <strong className="text-white">Fiyat düşer + açık pozisyon azalır:</strong> Long
                  pozisyonlar tasfiye oluyor veya kapanıyor; kaldıraç sistemden temizleniyor. Düşüşün sonuna
                  yaklaşıldığının işareti olabilir.
                </li>
                <li>
                  <strong className="text-white">Fiyat düşer + açık pozisyon artar:</strong> Yeni short'lar
                  açılıyor; aşağı yön kaldıraçla destekleniyor.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Aşırı Funding ve Tersine Dönüş Sinyali</h2>
              <p>
                Funding rate'in en değerli kullanımı, contrarian yani kalabalığın tersine düşünme
                sinyalidir. Funding aşırı pozitife gittiğinde, piyasa aşırı kaldıraçlı long ile doludur. Bu
                noktada fiyatın küçük bir düşüşü bile bir long likidasyon dalgasını tetikleyebilir; her
                tasfiye fiyatı biraz daha aşağı iter ve zincirleme bir hareket oluşur. Sert yükselişlerin
                tepelerinde sık görülen bu yapı, uzun bahisler için riskli bölgedir.
              </p>
              <p className="mt-3">
                Tersine, funding aşırı negatife gittiğinde piyasa short ile doludur ve beklenmedik bir
                yükseliş short squeeze yaratarak hızlı bir yukarı hareket başlatabilir. Derin düşüşlerin
                diplerinde funding'in belirgin negatife geçmesi, sık görülen bir dönüş zeminidir.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Aşırı funding bir zamanlama aracı değil, bir koşul aracıdır. Funding aylarca aşırı pozitif
                  kalabilir ve fiyat bu süre boyunca yükselmeye devam edebilir. Yalnızca funding ekstrem diye
                  ters pozisyon açmak, güçlü bir trende karşı durmak demektir ve pahalıya patlayabilir.
                  Funding sinyalini her zaman fiyat hareketi, destek-direnç ve açık pozisyon ile birlikte
                  teyit edin.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Funding ile Aşırı Kaldıraç Tespiti</h2>
              <p>
                Funding rate, piyasadaki kaldıraç stresinin sıcaklık ölçeridir. Funding uzun süre yüksek
                pozitif seyrederken açık pozisyon da hızla artıyorsa, sistem aşırı kaldıraçla şişmiş demektir.
                Bu tür dönemlerde piyasa kırılgandır; tek bir sert haber, geniş çaplı bir tasfiye dalgasını
                başlatabilir.
              </p>
              <p className="mt-3">
                Profesyonel yatırımcılar bu yüzden funding'i bir risk barometresi olarak izler. Funding ve
                açık pozisyon aynı anda zirvedeyse pozisyon büyüklüğünü küçültmek, kaldıracı düşürmek veya
                zarar durdur emirlerini sıkılaştırmak akıllıcadır. Tersine, büyük bir tasfiye sonrası funding
                nötre döndüğünde ve açık pozisyon belirgin düştüğünde, piyasa kaldıraçtan arınmış ve daha
                sağlıklı bir zemine oturmuş demektir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Pratik Funding Okuma Kuralları</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>Funding'i her zaman fiyat trendi, açık pozisyon ve long/short oranıyla birlikte okuyun; tek başına yorumlamayın.</li>
                <li>Düşük ve istikrarlı pozitif funding'i normal kabul edin; bu boğa piyasasının sağlıklı halidir.</li>
                <li>Funding ekstrem pozitife gittiğinde long pozisyonlarda temkinli olun ve kâr al seviyelerinizi düşünün.</li>
                <li>Funding ekstrem negatife gittiğinde short squeeze ihtimaline karşı short pozisyonları gözden geçirin.</li>
                <li>Uzun süre açık tutacağınız kaldıraçlı pozisyonlarda funding maliyetini önceden hesaplayın.</li>
                <li>Aşırı funding bir zamanlama sinyali değildir; dönüş için mutlaka fiyat teyidi bekleyin.</li>
                <li>Funding ve açık pozisyon birlikte zirvedeyse piyasanın kaldıraçla şiştiğini ve kırılgan olduğunu bilin.</li>
                <li>Funding'i her gün takip edin; tek bir anlık değer değil, eğilim ve değişim daha anlamlıdır.</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/spot-vs-futures" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Spot ve Futures İşlemler <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/bitcoin-dominansi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Bitcoin Dominansı ve Altcoin Sezonu <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/onchain-analiz" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    On-Chain Analiz <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/bitcoin-dominansi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Bitcoin Dominansı ve Altcoin Sezonu <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
