import { Link } from 'react-router-dom'
import { PieChart, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function PortfoyYonetimi() {
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
            <span className="text-gray-300">Portföy Yönetimi</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <PieChart className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                Strateji
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Portföy Yönetimi: Dengeli Bir Yatırım Portföyü Nasıl Kurulur
            </h1>
            <p className="text-sm text-gray-500">16 Mayıs 2026 — yaklaşık 10 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Tek bir hisseye veya tek bir coine tüm parasını koyan yatırımcı, aslında bir yatırım yapmıyor;
              tek bir bahis oynuyor. Portföy yönetimi, sermayenizi farklı varlıklara dağıtarak hem riski
              azaltma hem de istikrarlı büyüme arayışıdır. Bu yazıda çeşitlendirmenin neden işe yaradığını,
              varlık sınıflarını, risk profilinizi nasıl belirleyeceğinizi, çekirdek-uydu yaklaşımını, yeniden
              dengelemeyi ve aşırı çeşitlendirme tuzağını somut örneklerle ele alacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Portföy Nedir?</h2>
              <p>
                Portföy, sahip olduğunuz tüm yatırım varlıklarının bütünüdür: BIST hisseleri, kripto paralar,
                altın, döviz, nakit, fonlar ve tahviller. Önemli olan bu varlıkları tek tek değil, bir bütün
                olarak düşünmektir. Çünkü bir yatırımcının gerçek performansını belirleyen tek bir hissenin ne
                yaptığı değil, tüm portföyün toplamda ne yaptığıdır.
              </p>
              <p className="mt-3">
                Portföy yönetimi iki soruya cevap arar: "Paramı hangi varlıklara, hangi oranlarda dağıtmalıyım?"
                ve "Bu dağılımı zamanla nasıl korumalıyım?" İlk soru varlık dağılımı (asset allocation),
                ikincisi yeniden dengeleme (rebalancing) konusudur. Araştırmalar, uzun vadeli getiriyi
                belirleyen en büyük faktörün hangi hisseyi seçtiğiniz değil, varlık sınıfları arasındaki
                dağılımınız olduğunu defalarca göstermiştir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Çeşitlendirme Neden Riski Azaltır?</h2>
              <p>
                Çeşitlendirmenin (diversification) arkasındaki fikir şudur: farklı varlıklar aynı anda ve aynı
                yönde hareket etmez. Bir varlık değer kaybederken bir diğeri kazanabilir veya en azından daha
                az kaybeder. Tüm yumurtaları tek sepete koymamak deyimi tam olarak bunu anlatır.
              </p>
              <p className="mt-3">
                Somut örnek: paranızın tamamı tek bir havacılık hissesi olan THYAO'da olsun. Sektöre özel kötü
                bir haber (yakıt fiyatı şoku, küresel uçuş düşüşü) hissenizi tek başına %30 düşürebilir ve
                portföyünüz de %30 düşer. Ama paranızı THYAO, GARAN (bankacılık), ASELS (savunma sanayi) ve
                EREGL (demir-çelik) arasında dörde böldüyseniz, aynı havacılık şoku portföyünüzü yalnızca
                yaklaşık %7,5 düşürür; diğer üç hisse o haberden doğrudan etkilenmez.
              </p>
              <p className="mt-3">
                Burada kritik nokta korelasyondur. İki varlık ne kadar farklı sebeplerle hareket ediyorsa,
                birlikte tutulmaları o kadar çok risk azaltır. Dört bankacılık hissesi tutmak gerçek
                çeşitlendirme değildir; çünkü dördü de faiz kararlarına aynı yönde tepki verir. Gerçek
                çeşitlendirme farklı sektörler, farklı varlık sınıfları ve mümkünse farklı para birimleri
                gerektirir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Varlık Sınıfları</h2>
              <p>
                Dengeli bir portföy birden fazla varlık sınıfı içerir. Her birinin getiri-risk profili ve
                ekonomik koşullara tepkisi farklıdır:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">BIST hisseleri:</strong> Uzun vadede en yüksek getiri
                  potansiyeli, ama en yüksek oynaklık. Şirketlerin büyümesine ortak olursunuz; temettü de
                  alabilirsiniz. Portföyün büyüme motoru bu kısımdır.
                </li>
                <li>
                  <strong className="text-white">Kripto para:</strong> Bitcoin ve Ethereum başta olmak üzere
                  çok yüksek getiri potansiyeli sunar, ama oynaklığı hisselerden de yüksektir. Küçük bir
                  ağırlıkla portföye dahil edilmesi tipiktir.
                </li>
                <li>
                  <strong className="text-white">Altın:</strong> Genelde kriz ve enflasyon dönemlerinde değer
                  korur. Hisseler düşerken sıklıkla ters yönde hareket ettiği için portföyün dengeleyicisidir.
                </li>
                <li>
                  <strong className="text-white">Döviz:</strong> Türkiye'de yerel para biriminin değer kaybına
                  karşı bir koruma aracı olarak görülür. Portföyün bir kısmını farklı para biriminde tutmak,
                  kur riskini dengeler.
                </li>
                <li>
                  <strong className="text-white">Nakit:</strong> Getiri sağlamaz gibi görünse de iki işlevi
                  vardır: acil ihtiyaçları karşılar ve piyasa düştüğünde ucuzlayan varlıkları almak için hazır
                  güç sağlar. Nakit bir zayıflık değil, bir opsiyon değeridir.
                </li>
                <li>
                  <strong className="text-white">Tahvil ve fonlar:</strong> Devlet/şirket tahvilleri ve para
                  piyasası fonları görece düşük riskli, öngörülebilir getiri sunar. Portföyün istikrar
                  tabanını oluşturur.
                </li>
              </ul>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Yatırıma başlamadan önce 3-6 aylık giderinizi karşılayacak bir acil durum fonunu portföyün
                  dışında, ayrı tutun. Bu fon yatırım değildir; işini kaybetme veya beklenmedik gider gibi
                  durumlarda yatırımlarınızı zararla satmak zorunda kalmamanızı sağlar. Acil fonu olmayan
                  yatırımcı, en kötü anda satmaya mecbur kalır.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Risk Profilinizi Belirleyin</h2>
              <p>
                Doğru portföy dağılımı herkes için aynı değildir; sizin risk profilinize bağlıdır. Risk
                profili üç şeyin birleşimidir: risk toleransınız (düşüşe psikolojik dayanıklılığınız), risk
                kapasiteniz (maddi olarak ne kadar kayba dayanabileceğiniz) ve yatırım vadeniz (paraya ne
                zaman ihtiyacınız olacağı). Üç tipik profil vardır:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Muhafazakâr:</strong> Sermayeyi korumayı büyümenin önüne
                  koyar. Kısa vadeli hedefleri veya düşük risk toleransı vardır. Ağırlık tahvil, fon, nakit ve
                  altında; hisse ve kripto payı düşüktür.
                </li>
                <li>
                  <strong className="text-white">Dengeli:</strong> Büyüme ile istikrar arasında orta yol
                  arar. Orta-uzun vadeli yatırımcı için tipik profildir. Hisse ağırlığı belirgin ama tahvil ve
                  altınla dengelenir.
                </li>
                <li>
                  <strong className="text-white">Agresif:</strong> Yüksek getiri için yüksek oynaklığı kabul
                  eder. Genelde uzun yatırım vadesine ve sağlam gelir kaynağına sahip yatırımcıdır. Ağırlık
                  hisse ve kriptodadır.
                </li>
              </ul>
              <p className="mt-3">
                Örnek dağılımlar (yaklaşık ve esnek): Muhafazakâr profil %30 hisse, %10 altın, %10 döviz, %35
                tahvil/fon, %15 nakit. Dengeli profil %50 hisse, %10 kripto, %10 altın, %10 döviz, %15
                tahvil/fon, %5 nakit. Agresif profil %65 hisse, %20 kripto, %5 altın, %5 döviz, %5 nakit. Bu
                oranlar bir başlangıç şablonudur; kendi koşullarınıza göre ayarlanır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Çekirdek-Uydu (Core-Satellite) Yaklaşımı</h2>
              <p>
                Profesyonellerin sıkça kullandığı pratik bir yapı çekirdek-uydu modelidir. Portföy iki katmana
                ayrılır:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Çekirdek (core):</strong> Portföyün büyük kısmı, örneğin
                  %70-80. Geniş endeks fonları, BIST 100 ağırlıklı sağlam büyük şirketler (KCHOL, GARAN gibi)
                  ve istikrarlı varlıklar. Bu kısım nadiren değiştirilir, uzun vade içindir.
                </li>
                <li>
                  <strong className="text-white">Uydu (satellite):</strong> Geri kalan %20-30. Daha aktif
                  yönetilen, yüksek getiri arayan kısım: belirli bir sektör teması, küçük-orta ölçekli hisse
                  fikirleri veya kripto pozisyonları. Burada daha sık işlem yaparsınız.
                </li>
              </ul>
              <p className="mt-3">
                Bu yapının avantajı: çekirdek portföyün istikrarını ve uzun vadeli getirisini güvenceye
                alırken, uydu kısmı sizin aktif fikirlerinizi denemeye alan tanır. Bir uydu pozisyonu kötü
                giderse portföyün küçük bir kısmını etkiler; çekirdek sağlam kalır. Yeni başlayanlar için
                önerilen, önce sağlam bir çekirdek kurmak, deneyim arttıkça uydu kısmını büyütmektir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yeniden Dengeleme (Rebalancing)</h2>
              <p>
                Portföyü kurduktan sonra iş bitmez. Zamanla bazı varlıklar değer kazanır, bazıları kaybeder ve
                başlangıçtaki oranlarınız bozulur. Diyelim ki dengeli profil için %50 hisse, %10 kripto ile
                başladınız. Kripto güçlü bir ralli yaptı ve artık portföyün %25'ini oluşturuyor. Farkında
                olmadan portföyünüz "dengeli" olmaktan çıkıp "agresif" hale geldi.
              </p>
              <p className="mt-3">
                Yeniden dengeleme, varlıkları hedef oranlara geri getirme işlemidir: değer kazanıp ağırlığı
                artan varlıktan bir miktar satar, ağırlığı düşen varlıktan alırsınız. Bu, doğal olarak
                "yüksekten sat, düşükten al" disiplinini dayatır; çoğu yatırımcının duygularıyla yapamadığı
                şeyi mekanik olarak yaptırır.
              </p>
              <p className="mt-3">
                Ne zaman yapılır? İki yaygın yöntem var. Takvim yöntemi: 6 ayda bir veya yılda bir sabit
                aralıklarla. Eşik yöntemi: bir varlık hedef oranından belli bir yüzde (örneğin 5 puan)
                saptığında. Yeni başlayanlar için yılda bir-iki kez yapılan takvim yöntemi yeterlidir; çok sık
                dengeleme işlem maliyeti ve vergi yükü doğurur.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Yeniden dengeleme psikolojik olarak zordur, çünkü iyi giden varlığı satıp kötü gideni almanız
                  gerekir; bu sezgiye aykırı gelir. Tam da bu yüzden değerlidir. Ralli yapan varlık her zaman
                  ralliye devam etmez ve düşen her varlık çöpe gitmez. Dengeleme kararını duygularınıza değil,
                  önceden belirlediğiniz kurala bıraktığınızda en zor anlarda doğru olanı yaparsınız.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Aşırı Çeşitlendirme Tuzağı (Diworsification)</h2>
              <p>
                Çeşitlendirme iyidir; ama her iyi şey gibi abartıldığında zarara döner. Peter Lynch'in
                deyimiyle "diworsification", riski azaltmak yerine portföyü gereksiz yere karmaşıklaştıran ve
                getiriyi sulandıran aşırı çeşitlendirmedir.
              </p>
              <p className="mt-3">
                40 farklı hisse tutan bir bireysel yatırımcı düşünün. Hiçbirini gerçekten takip edemez,
                bilançolarını okuyamaz, neyin neden hareket ettiğini anlayamaz. Ayrıca 40 hissenin getirisi
                pratikte endeksin getirisine yaklaşır; o halde tek bir geniş endeks fonu almak hem daha ucuz
                hem daha basit olurdu. Aşırı çeşitlendirmede ödediğiniz bedel, kontrolü ve odağı kaybetmektir.
              </p>
              <p className="mt-3">
                Araştırmalar, çeşitlendirmenin getirdiği risk azalmasının büyük kısmının ilk 15-20 iyi seçilmiş
                ve farklı sektörlerden hisseyle elde edildiğini, bunun ötesinde her yeni hissenin katkısının
                hızla azaldığını gösterir. Bireysel yatırımcı için makul aralık genellikle gerçekten takip
                edebileceği 8-15 hisse artı birkaç varlık sınıfıdır. Kalite, sayıdan önemlidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Örnek BIST + Kripto Karması Portföy</h2>
              <p>
                Dengeli profilde orta-uzun vadeli bir yatırımcı için somut bir örnek portföy şöyle
                kurgulanabilir (toplam 100.000 TL üzerinden):
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Çekirdek BIST hisseleri (45.000 TL):</strong> KCHOL, GARAN, ASELS, EREGL gibi farklı sektörlerden 5-7 sağlam şirkete dağıtılmış.</li>
                <li><strong className="text-white">Kripto (10.000 TL):</strong> Ağırlıklı Bitcoin ve Ethereum; spekülatif altcoin payı sınırlı tutulur.</li>
                <li><strong className="text-white">Altın (10.000 TL):</strong> Portföyün kriz dengeleyicisi.</li>
                <li><strong className="text-white">Döviz (10.000 TL):</strong> Kur riskine karşı koruma.</li>
                <li><strong className="text-white">Tahvil / para piyasası fonu (20.000 TL):</strong> İstikrar tabanı, öngörülebilir getiri.</li>
                <li><strong className="text-white">Nakit (5.000 TL):</strong> Fırsat alımı için hazır güç.</li>
              </ul>
              <p className="mt-3">
                Bu portföyde tek bir hissenin kötü gitmesi toplamı yaklaşık %7-9 etkiler; bir varlık sınıfının
                zayıf dönemi diğerleriyle dengelenir. Borsa Kralı platformundaki takip listesi ve portföy
                araçlarıyla bu dağılımı tek ekrandan izleyebilir, oranların ne zaman bozulduğunu görebilirsiniz.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Portföy Kurma Adımları</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>Acil durum fonunuzu (3-6 aylık gider) ayırın; bu para portföye girmez.</li>
                <li>Risk profilinizi dürüstçe belirleyin: tolerans, kapasite ve yatırım vadeniz.</li>
                <li>Profilinize uygun varlık sınıfı dağılımını (hedef oranları) yazılı olarak belirleyin.</li>
                <li>Çekirdek kısmı sağlam, farklı sektörlerden varlıklarla kurun (portföyün büyük bölümü).</li>
                <li>Uydu kısmını aktif fikirleriniz için ayırın; küçük ve kontrollü tutun.</li>
                <li>Tek pozisyona aşırı yüklenmeyin; korelasyonu yüksek varlıkları toplamda sınırlayın.</li>
                <li>Yeniden dengeleme takviminizi belirleyin (yılda bir-iki kez yeterli).</li>
                <li>Portföyü düzenli izleyin ama her gün müdahale etmeyin; plan değişikliği nadir olmalı.</li>
              </ol>
              <p className="mt-3">
                Sağlam bir portföyün arkasında her zaman sağlam bir risk yönetimi vardır. Pozisyon büyüklüğü
                ve stop kullanımı için{' '}
                <Link to="/egitim/risk-yonetimi" className="text-gold-400 underline-offset-2 hover:underline">
                  Risk Yönetimi
                </Link>{' '}
                yazımıza, varlıkları zamana yayarak alma yöntemi için{' '}
                <Link to="/egitim/maliyet-ortalama" className="text-gold-400 underline-offset-2 hover:underline">
                  Maliyet Ortalama (DCA)
                </Link>{' '}
                yazımıza bakmanızı öneririz.
              </p>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/risk-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Risk Yönetimi: Stop-Loss, Pozisyon Büyüklüğü ve Sermaye Koruma <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/maliyet-ortalama" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Maliyet Ortalama (DCA): Volatil Piyasada Düzenli Alım Stratejisi <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/yatirim-stratejisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Yatırım Stratejisi Oluşturma <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/risk-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Önceki: Risk Yönetimi
            </Link>
            <Link to="/egitim/maliyet-ortalama" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Maliyet Ortalama (DCA) <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
