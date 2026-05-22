import { Link } from 'react-router-dom'
import { CalendarClock, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function MaliyetOrtalama() {
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
            <span className="text-gray-300">Maliyet Ortalama (DCA)</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <CalendarClock className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                Strateji
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Maliyet Ortalama (DCA): Volatil Piyasada Düzenli Alım Stratejisi
            </h1>
            <p className="text-sm text-gray-500">17 Mayıs 2026 — yaklaşık 8 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              "En dipten alıp en tepeden satmak" herkesin hayalidir, ama gerçekte kimse dibi ve tepeyi
              tutarlı biçimde bilemez. Maliyet ortalama (DCA — dollar cost averaging) stratejisi tam da bu
              gerçeği kabul ederek doğmuştur: zamanlamayı çözmeye çalışmak yerine, düzenli ve disiplinli
              alımla riski zamana yayar. Bu yazıda DCA'nın mantığını, volatil bir senaryoda sayısal örneğini,
              tek seferde alımla karşılaştırmasını, güçlü ve zayıf yönlerini ve uygulama adımlarını ele
              alacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">DCA Nedir?</h2>
              <p>
                Maliyet ortalama, elinizdeki parayı tek seferde değil, belirli aralıklarla (genelde aylık)
                sabit tutarlarla parça parça yatırmaktır. Örneğin elinizde 60.000 TL var ve Bitcoin almak
                istiyorsunuz. DCA yaklaşımında bunu tek hamlede yatırmaz; 6 ay boyunca her ayın aynı günü
                10.000 TL'lik alım yaparsınız.
              </p>
              <p className="mt-3">
                Burada kilit detay, her ay aynı tutarı yatırmanızdır, aynı miktarda varlık almanız değil.
                Fiyat yüksekken sabit tutar size daha az adet alır; fiyat düşükken aynı tutar daha çok adet
                alır. Bu otomatik mekanizma sayesinde zaman içinde ucuz fiyatlardan daha fazla, pahalı
                fiyatlardan daha az toplamış olursunuz.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">DCA'nın Mantığı: Zamanlamayı Bırakmak</h2>
              <p>
                Piyasaya tek seferde girmenin en büyük psikolojik yükü, "ya yarın düşerse?" korkusudur. Bu
                korku çoğu yatırımcıyı felç eder; "biraz daha bekleyeyim" derken aylar geçer, fiyat yükselir
                ve bu sefer "kaçırdım, artık geç" diye giremezler. Zamanlama denemesi, çoğu bireysel
                yatırımcı için bir karar verememe tuzağına dönüşür.
              </p>
              <p className="mt-3">
                DCA bu sorunu kökünden çözer: ne zaman gireceğinize tek tek karar vermezsiniz, bunu önceden
                kurala bağlarsınız. "Her ayın 1'inde, fiyat ne olursa olsun, şu kadar alacağım." Karar
                duygulardan çıkar, takvime girer. Piyasa düştüğünde panik yapmazsınız, çünkü düşüş sizin için
                kötü değil; aynı parayla daha çok adet aldığınız bir gündür.
              </p>
              <p className="mt-3">
                Yani DCA aslında bir getiri maksimizasyon aracı değil, bir davranış aracıdır. En büyük katkısı
                matematiksel değil psikolojiktir: yatırımı sürdürülebilir, düzenli ve duygudan arınmış hale
                getirir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Sayısal Örnek: Volatil Bir Fiyat Senaryosu</h2>
              <p>
                DCA'nın ortalama maliyeti nasıl oluşturduğunu somut görelim. Bir yatırımcı 6 ay boyunca her ay
                1.000 TL ile bir varlık alıyor. Varlığın fiyatı çok oynak; aşağıdaki tablo her ayki fiyatı, o
                ay alınan adedi ve birikimi gösterir:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`Ay   Fiyat (TL)   Yatırılan   Alınan Adet
 1      100         1.000        10,00
 2       80         1.000        12,50
 3       50         1.000        20,00
 4       40         1.000        25,00
 5       80         1.000        12,50
 6      125         1.000         8,00

Toplam yatırılan : 6.000 TL
Toplam adet      : 88,00
Ortalama maliyet : 6.000 / 88 = 68,18 TL`}
              </pre>
              <p className="mt-3">
                Sonuca dikkat edin. 6 ay boyunca fiyatların basit aritmetik ortalaması (100 + 80 + 50 + 40 +
                80 + 125) / 6 = 79,17 TL'dir. Ama yatırımcının gerçek ortalama maliyeti yalnızca 68,18 TL
                oldu. Neden daha düşük? Çünkü fiyat 40-50 TL'ye indiğinde sabit 1.000 TL ile 20-25 adet
                alındı; fiyat 125 TL'ye çıktığında ise sadece 8 adet alındı. DCA otomatik olarak ucuza çok,
                pahalıya az aldırdığı için maliyet basit ortalamanın altına indi.
              </p>
              <p className="mt-3">
                6. ayın sonunda fiyat 125 TL'dir. Yatırımcının 88 adedinin değeri 88 x 125 = 11.000 TL; 6.000
                TL anaparaya karşı yaklaşık %83 kâr. Volatilite, DCA uygulayan yatırımcının düşmanı değil,
                dostudur: ara dönemde yaşanan sert düşüşler, ortalama maliyeti aşağı çeken alım fırsatlarına
                dönüştü.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">DCA mı, Tek Seferde Alım (Lump Sum) mı?</h2>
              <p>
                En sık sorulan soru budur. Tek seferde alım (lump sum), elinizdeki tüm parayı bir kerede
                yatırmaktır. İkisini dürüstçe karşılaştıralım.
              </p>
              <p className="mt-3">
                Piyasalar uzun vadede daha çok yükselen yıllar geçirir. Bu yüzden istatistiksel olarak,
                yükselen bir piyasada parayı erken ve tam yatırmak (lump sum) ortalamada DCA'dan daha yüksek
                getiri sağlar; çünkü paranızın tamamı baştan itibaren çalışır, DCA'da ise bir kısmı aylarca
                kenarda bekler. Geriye dönük çalışmalar lump sum'ın vakaların çoğunda öne çıktığını gösterir.
              </p>
              <p className="mt-3">
                Ama bu hikayenin yarısıdır. Lump sum, kötü zamanlama riskini de tamamen size yükler: tüm
                paranızı yatırdığınız hafta tepe noktası çıkarsa, derin bir düşüşü baştan sona yaşarsınız.
                DCA bu en kötü senaryoyu yumuşatır. Ayrıca lump sum, çoğu insanın psikolojik olarak
                kaldıramayacağı bir karardır; "ya hep ya hiç" baskısı yüzünden tetiği hiç çekemezler.
              </p>
              <p className="mt-3">
                Pratik özet: Elinizde toplu bir para varsa ve düşüşe psikolojik dayanıklılığınız yüksekse,
                lump sum istatistiksel olarak avantajlıdır. Ama düşen bir piyasada paniğe kapılacaksanız,
                fiyat çok yüksek görünüyorsa veya zaten her ay gelir elde edip onu yatırıyorsanız, DCA çok
                daha sürdürülebilir ve gerçekçi bir yoldur. En iyi strateji, teoride en yüksek getiriyi veren
                değil, sizin sonuna kadar uygulayabileceğinizdir.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Maaş gibi düzenli bir gelirden tasarruf ediyorsanız zaten doğal bir DCA yapıyorsunuz
                  demektir; her ay biriken parayı yatırırsınız. Bu durumda "DCA mı lump sum mı?" sorusu
                  konusuz kalır; sizin gerçek seçeneğiniz parayı düzenli yatırmak ile boşta tutmaktır ve
                  düzenli yatırmak neredeyse her zaman kazanır.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">DCA'nın Güçlü ve Zayıf Yönleri</h2>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Güçlü Yönleri</h3>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Zamanlama baskısını kaldırır:</strong> Tepeyi yakalama korkusu ortadan kalkar; karar takvime bağlanır.</li>
                <li><strong className="text-white">Duygusal hatayı azaltır:</strong> Düşüşte panikle satmak yerine, planlı alım yaparsınız.</li>
                <li><strong className="text-white">Disiplin kazandırır:</strong> Yatırımı bir alışkanlığa dönüştürür; süreklilik sağlar.</li>
                <li><strong className="text-white">Volatiliteyi lehe çevirir:</strong> Oynaklık, ortalama maliyeti aşağı çeken bir fırsat haline gelir.</li>
                <li><strong className="text-white">Düşük başlangıç eşiği:</strong> Büyük sermaye gerektirmez; küçük tutarlarla başlanabilir.</li>
              </ul>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Zayıf Yönleri</h3>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Yükselen piyasada geride kalır:</strong> Sürekli yükselen bir piyasada parayı erken yatırmak daha çok kazandırırdı.</li>
                <li><strong className="text-white">Atıl nakit maliyeti:</strong> Henüz yatırılmayan para kenarda beklerken getiri üretmez.</li>
                <li><strong className="text-white">İşlem maliyeti:</strong> Çok sık ve küçük alımlar, komisyonların toplamda yük olmasına yol açabilir.</li>
                <li><strong className="text-white">Kötü varlığı kurtarmaz:</strong> DCA bir alım yöntemidir; temelde değer kaybeden, zayıf bir varlığa düzenli para koymak zararı sadece yayar.</li>
              </ul>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  DCA yalnızca uzun vadede değer üreteceğine inandığınız sağlam varlıklarda anlamlıdır.
                  Sürekli düşen, temeli bozuk bir hisseye veya geleceği belirsiz bir altcoine düzenli alım
                  yapmak "maliyet ortalama" değil, batan bir pozisyonu büyütmektir. Yöntem ne kadar doğru
                  olursa olsun, varlık seçimi yanlışsa sonuç kötü olur. Önce neyi alacağınıza karar verin,
                  sonra DCA'yı o varlığı nasıl alacağınızın yöntemi olarak kullanın.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kripto ve BIST'te DCA Uygulaması</h2>
              <p>
                DCA, kripto piyasası için adeta biçilmiş kaftandır; çünkü Bitcoin ve Ethereum gibi varlıkların
                oynaklığı çok yüksektir ve kimse dibi tutarlı biçimde bilemez. Pek çok yatırımcı her ayın
                belirli bir günü sabit tutarda BTC veya ETH alımı yapar. Sert düşüşlerin yaşandığı kripto
                kışlarında bu yöntem, korku en yüksekken disiplinli alım yapmayı sağladığı için özellikle
                değerlidir.
              </p>
              <p className="mt-3">
                BIST tarafında DCA, özellikle uzun vadeli tutmayı düşündüğünüz sağlam şirketlerde (KCHOL,
                GARAN gibi büyük ölçekli, köklü hisseler) veya geniş bir endeks fonunda uygulanabilir. Tek
                hisse yerine endeks fonunda DCA yapmak, tek bir şirkete bağlı riski de azalttığı için yeni
                başlayanlara daha uygundur. Temettü ödeyen hisselerde, alınan temettüyü tekrar aynı hisseye
                yönlendirmek DCA mantığını güçlendirir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Değer Ortalama (Value Averaging) Varyasyonu</h2>
              <p>
                DCA'nın daha gelişmiş bir akrabası değer ortalamadır (value averaging). Klasik DCA'da her ay
                sabit tutar yatırırsınız. Değer ortalamada ise her ay sabit tutar değil, sabit bir portföy
                değeri hedeflersiniz.
              </p>
              <p className="mt-3">
                Örnek: "Portföyümün değeri her ay 10.000 TL artsın" hedefi koydunuz. 1. ay 10.000 TL
                yatırırsınız. 2. ay hedef 20.000 TL'dir; ama piyasa düştü ve mevcut pozisyonunuz 7.000 TL'ye
                geriledi. O ay 13.000 TL yatırarak hedefi yakalarsınız. Tersine, piyasa yükseldi ve
                pozisyonunuz 24.000 TL'ye çıktıysa, 3. ay hedefi 30.000 TL için yalnızca 6.000 TL yatırırsınız.
              </p>
              <p className="mt-3">
                Sonuç olarak değer ortalama, fiyat düştüğünde otomatik olarak daha çok, yükseldiğinde daha az
                yatırmanızı sağlar; yani DCA'nın "ucuza çok al" eğilimini daha da güçlendirir. Bedeli ise
                karmaşıklıktır: her ay ne kadar yatıracağınız değişir, bazı aylarda elinizde olandan fazla
                nakit gerektirebilir. Bu yüzden değer ortalama, daha disiplinli ve nakit akışı esnek olan
                yatırımcılar için uygundur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">DCA Uygulama Adımları</h2>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>Uzun vadede değer üreteceğine inandığınız sağlam bir varlık veya endeks fonu seçin.</li>
                <li>Aylık olarak rahatça ayırabileceğiniz, bütçenizi zorlamayan sabit bir tutar belirleyin.</li>
                <li>Sabit bir alım günü seçin (örneğin her ayın 1'i) ve bunu takvime kural olarak işleyin.</li>
                <li>Fiyat ne olursa olsun, o gün geldiğinde alımı yapın; haberlere ve duygulara göre ertelemeyin.</li>
                <li>Mümkünse alımı otomatikleştirin; otomatik talimat, disiplini insan iradesine bırakmaz.</li>
                <li>Her alımı kaydedin; ortalama maliyetinizi ve toplam adedinizi düzenli takip edin.</li>
                <li>Stratejiyi en az 1-2 yıl uygulayın; DCA kısa vadede değil, zamanla anlam kazanır.</li>
                <li>Varlığın temelleri bozulursa stratejiyi gözden geçirin; DCA körü körüne devam etmek değildir.</li>
              </ol>
              <p className="mt-3">
                DCA'yı doğru kullanmanın yarısı disiplin, yarısı doğru zihniyettir. Piyasa düşüşlerine
                dayanmayı öğrenmek için{' '}
                <Link to="/egitim/yatirim-psikolojisi" className="text-gold-400 underline-offset-2 hover:underline">
                  Yatırım Psikolojisi
                </Link>{' '}
                yazımıza, DCA ile aldığınız varlıkları bir bütün içinde konumlandırmak için{' '}
                <Link to="/egitim/portfoy-yonetimi" className="text-gold-400 underline-offset-2 hover:underline">
                  Portföy Yönetimi
                </Link>{' '}
                yazımıza bakmanızı öneririz.
              </p>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/portfoy-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Portföy Yönetimi: Dengeli Bir Yatırım Portföyü Nasıl Kurulur <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/yatirim-psikolojisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Yatırım Psikolojisi <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/risk-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Risk Yönetimi: Stop-Loss, Pozisyon Büyüklüğü ve Sermaye Koruma <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/portfoy-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Önceki: Portföy Yönetimi
            </Link>
            <Link to="/egitim/yatirim-psikolojisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Yatırım Psikolojisi <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
