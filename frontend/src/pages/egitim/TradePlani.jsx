import { Link } from 'react-router-dom'
import { ClipboardList, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function TradePlani() {
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
            <span className="text-gray-300">Trade Planı Oluşturma</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <ClipboardList className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                Strateji
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Trade Planı Oluşturma: Giriş, Hedef ve Çıkış Kuralları
            </h1>
            <p className="text-sm text-gray-500">19 Mayıs 2026 — yaklaşık 9 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Profesyonel bir trader ile sürekli kaybeden bir yatırımcı arasındaki en görünür fark, ekrana
              bakış biçimleridir. Profesyonel, pozisyonu açmadan önce ne zaman çıkacağını bilir. Kaybeden ise
              pozisyonu açtıktan sonra "bakalım ne olacak" diye bekler. İşte trade planı tam olarak bu farkı
              kuran araçtır: bir işlemin tüm kararlarını, henüz para riske girmeden ve duygular devreye
              girmeden önce kâğıda döken yazılı bir belge. Bu makalede planın neden zorunlu olduğunu,
              bileşenlerini tek tek ve doldurulmuş örnek bir şablonla işliyoruz.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Trade Planı Nedir, Plansız İşlem Neden Kumardır?</h2>
              <p>
                Trade planı; hangi varlığı, hangi koşulda alacağınızı, nerede zararı keseceğinizi, nerede kâr
                alacağınızı ve ne büyüklükte pozisyon açacağınızı önceden tanımlayan kurallar bütünüdür. Plan,
                bir işlemin tüm "eğer şu olursa şunu yaparım" senaryolarını piyasa hareket etmeden önce
                belirler.
              </p>
              <p className="mt-3">
                Plansız işlem neden kumardır? Çünkü kumarın tanımı, sonucu öngörülemeyen bir olaya karar
                anında duyguyla bahis oynamaktır. Plansız yatırımcı GARAN'ı "yükselir herhalde" diye alır;
                fiyat düşünce ne yapacağını bilmez, panikler veya umutla bekler; yükselince "biraz daha
                çıkar" diye açgözlülükle tutar. Her karar o anki duyguyla, baskı altında verilir. Planlı
                yatırımcı ise kararları sakin bir kafayla, masa başında önceden vermiştir; piyasa sadece o
                kuralları tetikler. Plan, şansı ortadan kaldırmaz ama kararı şanstan ayırır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bir Trade Planının Bileşenleri</h2>
              <p>
                İyi bir plan, aşağıdaki yedi bileşenin tamamına net bir yanıt verir. Eksik kalan her bileşen,
                karar anında duyguya bırakılmış bir boşluktur.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Varlık seçimi:</strong> Hangi hisse veya kripto parayı işlem yapacaksınız ve neden? İşlem yapılan varlığın likit, yeterli hacme sahip ve sizin tanıdığınız bir enstrüman olması gerekir.</li>
                <li><strong className="text-white">Zaman dilimi:</strong> Bu bir gün içi (intraday), birkaç günlük (swing) yoksa haftalarca sürecek bir pozisyon mu? Zaman dilimi, hangi grafiği baz alacağınızı ve stop mesafenizi belirler.</li>
                <li><strong className="text-white">Giriş tetikleyicisi (setup):</strong> Pozisyonu hangi somut koşul gerçekleşince açacaksınız? "İyi görünüyor" bir tetikleyici değildir; "fiyat 50 günlük EMA üzerinde kapanış yapar ve direnci hacimle kırarsa" bir tetikleyicidir.</li>
                <li><strong className="text-white">Stop-loss yeri:</strong> İşlemin yanlış olduğunu kabul edeceğiniz fiyat. Stop, bir destek seviyesinin biraz altına veya teknik bir kırılma noktasına konulur; gelişigüzel bir yüzdeye değil, grafiğin yapısına dayanır.</li>
                <li><strong className="text-white">Hedef / take-profit:</strong> Kârı realize etmeyi planladığınız seviye(ler). Genellikle bir sonraki direnç ya da ölçülmüş hareket projeksiyonu kullanılır.</li>
                <li><strong className="text-white">Pozisyon büyüklüğü:</strong> Kaç lot veya ne kadar tutar alacaksınız? Bu, keyfî değil; riske ettiğiniz para ve stop mesafesinden hesaplanan bir sonuçtur.</li>
                <li><strong className="text-white">Risk/ödül oranı:</strong> Riske ettiğiniz her 1 birime karşılık hedeflediğiniz kazanç kaç birim? Bu oran, işlemin yapmaya değer olup olmadığını söyler.</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Pozisyon Büyüklüğü ve Risk/Ödül Oranı</h2>
              <p>
                Pozisyon büyüklüğü çoğu yeni yatırımcının yanlış sırayla düşündüğü konudur. "Kaç lot alayım?"
                sorusu cüzdana değil, stop mesafesine bağlıdır. Mantık şudur: önce işlemde kaybetmeye razı
                olduğunuz parayı belirlersiniz, sonra bu parayı stop mesafesine bölerek lot sayısını
                bulursunuz.
              </p>
              <p className="mt-3">
                Somut bir örnek: 100.000 TL sermayeniz var ve işlem başına yüzde 1 risk kuralı uyguluyorsunuz;
                yani bu işlemde en fazla 1.000 TL kaybedebilirsiniz. THYAO'yu 300 TL'den almayı, stop-loss'u
                ise 285 TL'ye koymayı planlıyorsunuz. Hisse başına riskiniz 300 − 285 = 15 TL'dir. Pozisyon
                büyüklüğü = 1.000 TL ÷ 15 TL = yaklaşık 66 adet hisse olur. Stop tetiklenirse tam olarak
                planladığınız kadar, yani 1.000 TL kaybedersiniz; daha fazlasını değil.
              </p>
              <p className="mt-3">
                Risk/ödül oranı ise işlemin kalitesini ölçer. Yukarıdaki örnekte hedefiniz 345 TL ise,
                potansiyel kazancınız hisse başına 45 TL, riskiniz 15 TL'dir; oran 45/15 = 3:1'dir. Bu, riske
                ettiğiniz her 1 lira için 3 lira hedeflediğiniz anlamına gelir. En az 2:1 oranını arayın.
                3:1 oranıyla, işlemlerinizin yalnızca yüzde 40'ı kazansa bile uzun vadede kârda kalırsınız;
                çünkü kazançların büyüklüğü kayıpların sıklığını dengeler.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Stop-loss'u önce belirleyin, lot sayısını sonra. Çoğu yatırımcı tersini yapar — önce "şu
                  kadar alayım" der, sonra stop koyacak yer arar. Doğru sıralama, kaybınızı kontrol altında
                  tutan tek yöntemdir. Stop mesafesi genişse pozisyonunuz küçük, darsa büyük olur; risk
                  miktarı her zaman sabit kalır.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">İyi Bir Setup Tanımlamak ve Net Giriş Kuralları</h2>
              <p>
                Setup, pozisyon açmanız için piyasada gerçekleşmesi gereken belirli koşullar dizisidir. İyi
                bir setup'ın temel özelliği nesnel olmasıdır: aynı kuralı iki farklı kişiye verseniz, ikisi de
                aynı anda giriş sinyali görmelidir. "Grafik güçlü duruyor" gibi ifadeler nesnel değildir ve
                yorumlamaya açıktır.
              </p>
              <p className="mt-3">
                Net bir giriş kuralı örneği şöyle olabilir: "EREGL fiyatı, 50 günlük EMA'nın üzerindeyken, 62
                TL'deki yatay direnci günlük kapanışta ve son 20 günün ortalamasının üzerinde bir hacimle
                kırarsa alım yaparım." Bu cümlede üç doğrulanabilir koşul vardır — trend filtresi (EMA üstü),
                seviye (62 TL direnç) ve teyit (hacimli kapanış). Belirsiz bir his değil, tetiklenip
                tetiklenmediği kesin olarak söylenebilen bir kuraldır.
              </p>
              <p className="mt-3">
                Giriş kuralınız aynı zamanda "ne zaman GİRMEYECEĞİMİ" de söylemelidir. Koşullardan biri eksikse
                işlem yoktur. Sabırsızlık, eksik setup'a "yeterince iyi" deyip girmeye iter; oysa kötü bir
                girişi sonradan iyi bir yönetimle kurtarmak çok zordur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kademeli Çıkış ve Kâr Realizasyonu</h2>
              <p>
                Çıkış, çoğu yatırımcının en zayıf olduğu aşamadır; çünkü kazançtayken açgözlülük, "biraz daha"
                der. Kademeli (parçalı) çıkış bu sorunu sistematikleştirir: pozisyonu tek seferde değil,
                önceden belirlenmiş seviyelerde parça parça kapatırsınız.
              </p>
              <p className="mt-3">
                Tipik bir uygulama şöyledir. Diyelim ASELS'te 90 adet pozisyon açtınız. İlk hedefe ulaşıldığında
                pozisyonun üçte birini (30 adet) satıp ilk kârı realize edersiniz ve aynı anda kalan pozisyonun
                stop-loss'unu giriş fiyatınıza çekersiniz — bu noktadan sonra işlem en kötü ihtimalle başa baş
                kapanır, kaybetme riski sıfırlanır. İkinci hedefte bir üçte biri daha satarsınız. Kalan son
                üçte biri ise, trend devam ettiği sürece takip eden stop (trailing stop) ile taşınır ve büyük
                hareketten pay almaya çalışır.
              </p>
              <p className="mt-3">
                Bu yaklaşımın iki psikolojik faydası vardır. Birincisi, erken realize edilen kâr "kazancımı
                kaçırdım" pişmanlığını azaltır. İkincisi, stop'u maliyete çekmek pozisyonu risksiz hale
                getirdiği için kalan kısmı sakin biçimde taşıyabilirsiniz. Açgözlülük ve korku, kararın yerine
                önceden yazılmış kademeler tarafından nötralize edilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Planın Yazılı Olması Neden Şart?</h2>
              <p>
                Kafanızdaki plan, plan değildir. Yazılı olmayan kurallar, piyasa baskı uyguladığında sessizce
                değişir; zihin, o anki duyguya uyacak şekilde kuralı yeniden yorumlar. "Stop'um 285'ti ama
                aslında 280 de mantıklı" cümlesi, yazılı olmayan bir planın nasıl eridiğinin tipik örneğidir.
              </p>
              <p className="mt-3">
                Yazılı plan üç işlevi yerine getirir. Birincisi, kararı sabitler — kâğıttaki sayıyı tartışmak
                zordur. İkincisi, hesap verebilirlik sağlar; işlem kapandığında "plana uydum mu" sorusuna
                dürüstçe yanıt verebilirsiniz. Üçüncüsü, öğrenmeyi mümkün kılar; yazılı planlarınızı biriktirip
                geriye baktığınızda hangi setup'ın işe yaradığını, hangi kuralı sürekli ihlal ettiğinizi
                görürsünüz. Hafıza seçici ve hoşgörülüdür; yazılı kayıt değildir.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Pozisyon açıldıktan sonra planı değiştirmeyin. Özellikle stop-loss'u "biraz daha aşağı
                  çekmek", planı bozmanın en pahalı biçimidir; küçük bir kaybı, kontrolden çıkmış büyük bir
                  kayba dönüştürür. Plan, ancak yeni bir işlem öncesinde, sakin kafayla revize edilir; işlem
                  sürerken değil.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Geriye Dönük Test (Backtest) ile Planı Doğrulamak</h2>
              <p>
                Bir trade planı yazmak onu doğru yapmaz; plan, kanıtla desteklenmelidir. Backtest, planınızın
                giriş ve çıkış kurallarını geçmiş fiyat verisi üzerinde uygulayıp sonuçları ölçmektir. Amaç,
                "bu kurallar geçmişte tutarlı biçimde para kazandırmış mı?" sorusuna veriyle yanıt vermektir.
              </p>
              <p className="mt-3">
                Pratikte şöyle yaparsınız: setup kurallarınızı son bir veya iki yılın grafiklerinde tek tek
                tarar, kuralın tetiklendiği her noktayı işaretler ve her işlemin sonucunu kaydedersiniz.
                Sonunda elinizde anlamlı bir örneklem olur — örneğin 40 işlem. Bu örneklemden iki kritik sayı
                çıkarırsınız: kazanma oranı (kaç işlemin kârla kapandığı) ve ortalama risk/ödül oranı. Bu iki
                sayı, planınızın uzun vadede artıda mı eksiide mi olduğunu söyler. Yüzde 45 kazanma oranı ve
                ortalama 2,5:1 risk/ödül, kârlı bir sistemdir. Yüzde 70 kazanma oranı ama ortalama 0,5:1
                risk/ödül, zarar eden bir sistemdir.
              </p>
              <p className="mt-3">
                Backtest'in iki tuzağına dikkat edin. Birincisi, geçmişe bakarak kuralı süslemek (aşırı
                optimizasyon) — geçmişte mükemmel çalışan ama geleceğe genellenemeyen kurallar üretmek kolaydır.
                İkincisi, küçük örneklem — 5 işleme bakıp karar vermek istatistiksel olarak anlamsızdır. En az
                30–40 işlemlik bir örneklem hedefleyin.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Örnek Trade Planı Şablonu</h2>
              <p>
                Aşağıda doldurulmuş örnek bir swing trade planı yer alıyor. Kendi işlemlerinizde bu maddeleri
                bir not uygulamasına kopyalayıp her trade öncesi yeniden doldurabilirsiniz:
              </p>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li><strong className="text-white">Varlık:</strong> THYAO — yüksek likidite, takip ettiğim bir hisse.</li>
                <li><strong className="text-white">Zaman dilimi:</strong> Swing — günlük grafik, hedeflenen tutuş süresi 1–3 hafta.</li>
                <li><strong className="text-white">Giriş tetikleyicisi (setup):</strong> Fiyat 50 günlük EMA üzerinde; 300 TL direncini günlük kapanışta ve 20 günlük ortalama hacmin üzerinde bir hacimle kırar.</li>
                <li><strong className="text-white">Giriş fiyatı:</strong> Kırılım teyidi sonrası ~302 TL.</li>
                <li><strong className="text-white">Stop-loss:</strong> 285 TL (kırılan direncin ve son swing dibinin altı). Hisse başına risk: 17 TL.</li>
                <li><strong className="text-white">Hedef 1:</strong> 330 TL — pozisyonun 1/3'ü satılır, kalan kısmın stop'u 302 TL'ye (maliyete) çekilir.</li>
                <li><strong className="text-white">Hedef 2:</strong> 355 TL — bir 1/3 daha satılır.</li>
                <li><strong className="text-white">Kalan 1/3:</strong> Takip eden stop ile taşınır, trend bozulana kadar tutulur.</li>
                <li><strong className="text-white">Risk yönetimi:</strong> Sermaye 100.000 TL, işlem riski %1 = 1.000 TL. Pozisyon = 1.000 ÷ 17 ≈ 58 adet.</li>
                <li><strong className="text-white">Risk/ödül:</strong> Hedef 1'e göre ~1,6:1; Hedef 2'ye göre ~3,1:1. Plan onaylanır.</li>
                <li><strong className="text-white">Geçersizlik koşulu:</strong> Setup koşullarından biri eksikse veya kırılım hacimsizse işlem açılmaz.</li>
              </ol>
              <p className="mt-3">
                Plan bittiğinde tek bir görev kalır: ona sadık kalmak. Yazdığınız kurallar ancak uyguladığınız
                ölçüde işe yarar. Plana sadık kalmak, her trade'i sonucundan bağımsız olarak "kurala uydum mu"
                sorusuyla değerlendirmek demektir. Kurala uyup kaybetmek kabul edilebilir bir sonuçtur; kuralı
                ihlal edip kazanmak ise gelecekte sizi batıracak kötü bir alışkanlığın ilk adımıdır.
              </p>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/risk-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Risk Yönetimi <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/destek-direnc" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Destek ve Direnç <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/yatirim-psikolojisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Yatırım Psikolojisi <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/yatirim-psikolojisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Önceki: Yatırım Psikolojisi
            </Link>
            <Link to="/egitim/yatirim-hatalari" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Yatırımda En Sık Yapılan 10 Hata <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
