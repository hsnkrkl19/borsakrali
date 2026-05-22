import { Link } from 'react-router-dom'
import { Zap, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function YatirimStratejisi() {
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
            <span className="text-gray-300">Yatırım Stratejisi</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Zap className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-gold-400/20 bg-gold-400/10 px-2.5 py-0.5 text-xs font-medium text-gold-400">
                Strateji
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Yatırım Stratejisi Oluşturma: 5 Adım
            </h1>
            <p className="text-sm text-gray-500">10 Mayıs 2026 — yaklaşık 10 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              İyi yatırımcıların sırrı tek bir hisseyi doğru zamanda almak değildir; tutarlı bir stratejiyi
              uzun yıllar boyunca disiplinle uygulamaktır. Strateji, kararlarınızın önceden belirlenmiş
              kurallar içinde alınmasını sağlar; böylece duygularınız piyasa ile birlikte çalkalanmaz. Bu
              yazıda yatırım stratejisini sağlam temellere oturtmak için uygulayabileceğiniz 5 adımı adım
              adım ele alacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Strateji Neden Önemlidir?</h2>
              <p>
                Strateji olmadan yapılan yatırım, kuralsız bir oyun gibidir. Birinin önerisi, sosyal medyada
                gördüğünüz bir yorum, bir mum formasyonu — her şeyin tetikleyici olabildiği bir ortamda kalan
                yatırımcı, kazandığında da kaybettiğinde de neden bu sonuçla karşılaştığını bilemez. Strateji
                bir kuralın uzun vadeli uygulanmasıdır; istikrarlı sonuç için şart koşul.
              </p>
              <p className="mt-3">
                Aşağıdaki 5 adım, bireysel yatırımcının kendi stratejisini oluştururken cevap vermesi gereken
                temel sorular etrafında kurulmuştur. Hiçbir adımı atlamayın; tüm sorulara yazılı cevap
                vermek, stratejinizi sade ve uygulanabilir kılar.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">1. Adım: Yatırım Hedefini Belirleyin</h2>
              <p>
                Yatırımın neden yaptığınızı yazılı olarak ifade etmek temel atım aşamasıdır. Hedefler net,
                ölçülebilir ve zamana bağlı olmalıdır.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Kısa vade (1 yıl ve altı):</strong> Acil ihtiyaçlar için biriktirilen para borsada tutulmamalıdır; volatilite yüzünden riskli olabilir.</li>
                <li><strong className="text-white">Orta vade (1-5 yıl):</strong> Ev peşinatı, eğitim gibi belirli hedefler. Risk biraz daha alınabilir.</li>
                <li><strong className="text-white">Uzun vade (5+ yıl):</strong> Emeklilik, çocuğun geleceği gibi hedefler. Volatiliteye en çok dayanıklı olunabilen vade.</li>
              </ul>
              <p className="mt-3">
                Yatırım hedefiniz "X yıl içinde Y kazanmak" formunda yazılı olmalı. Hedef nominal mi reel mi
                olduğu da belirtilmeli; özellikle yüksek enflasyon dönemlerinde nominal getiri aldatıcı
                olabilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">2. Adım: Risk Profilini Anlayın</h2>
              <p>
                Risk profili, kayba dayanma kapasitenizdir. İki boyutu vardır: psikolojik tahammül ve finansal
                tahammül.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Psikolojik:</strong> Portföyünüzün %30 düştüğünü gördüğünüzde uykunuz kaçar mı? Eğer evet ise, daha düşük volatiliteli portföye yönelmelisiniz.</li>
                <li><strong className="text-white">Finansal:</strong> Aniden nakde ihtiyacınız olursa, portföyü zararla satmak zorunda kalır mısınız? Acil fonunuz var mı?</li>
              </ul>
              <p className="mt-3">
                Risk profilinizi belirlemek için "kaybetmeye dayanabileceiğm maksimum yüzde" sorusuna dürüst
                bir cevap verin. Bu yüzde, portföy yüksek riskli varlıklara ne kadar ağırlık vereceğinizi
                belirler.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Risk algısı piyasa koşullarıyla değişir. Yükselen piyasada herkes "ben yüksek risk
                  alabilirim" der. Asıl test, düşen piyasada yapılır. Stratejinizi yükselişte değil, düşüş
                  döneminin sertliğinde test edin.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">3. Adım: Varlık Dağılımını Yapın</h2>
              <p>
                Varlık dağılımı (asset allocation), portföyü farklı varlık sınıfları arasında paylaştırmaktır.
                Akademik çalışmalar, uzun dönem getirinin %80'inden fazlasının varlık dağılımının sonucu
                olduğunu gösterir; tek tek hisse seçimi geri kalan küçük bir paydır.
              </p>
              <p className="mt-3">Tipik varlık sınıfları:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Hisse senetleri:</strong> Borsa İstanbul, yabancı borsalar.</li>
                <li><strong className="text-white">Tahvil ve sabit getirili enstrümanlar:</strong> Devlet tahvilleri, özel sektör tahvilleri.</li>
                <li><strong className="text-white">Altın ve kıymetli madenler:</strong> Enflasyona karşı koruma.</li>
                <li><strong className="text-white">Döviz:</strong> Kur riskine karşı denge unsuru.</li>
                <li><strong className="text-white">Nakit:</strong> Fırsatları yakalamak için saklanan likidite.</li>
                <li><strong className="text-white">Gayrimenkul ve alternatif yatırımlar.</strong></li>
              </ul>
              <p className="mt-3">
                Klasik kural: yaş / 100 oranında tahvil, geri kalan kısmı hisse. 30 yaşında biri portföyünün
                %70'ini hisseye, %30'unu tahvile koyabilir. Bu kural Türkiye'nin enflasyon ortamı için yetersiz
                olabilir; döviz ve altın ağırlığı mutlaka eklenmelidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">4. Adım: Hisse Seçim Kriterlerini Tanımlayın</h2>
              <p>
                Borsa İstanbul'da 500'e yakın şirket işlem görür. Hangisini almak gerektiğini belirleyen,
                önceden tanımlanmış kriterlerdir.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Temel Kriterler</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li>F/K oranı sektör ortalamasının altında olsun (değerli).</li>
                <li>PD/DD 1'in altında veya yakın olsun.</li>
                <li>3 yıllık ortalama özkaynak kârlılığı (ROE) %15 üzerinde olsun.</li>
                <li>Net borç/FAVOK oranı 3'ün altında olsun.</li>
                <li>Son 3 yılda her dönem kâr etmiş olsun.</li>
              </ul>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Teknik Kriterler</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li>Fiyat 200 EMA üzerinde olsun (uzun dönem trend yukarı).</li>
                <li>RSI 40-60 aralığında olsun (aşırı alım değil, momentum sağlıklı).</li>
                <li>Hacim son 30 gün ortalamasının üzerinde olsun.</li>
                <li>Önemli direnci kırmış veya destekten tepki vermiş olsun.</li>
              </ul>

              <p className="mt-3">
                Kriterleriniz sade olmalı; her bir kriterin nedenini bilmelisiniz. 20 farklı kriter koymak
                yerine 5-6 ana kriter ile filtrelemek daha uygulanabilirdir. Borsa Kralı platformundaki
                Tarama Analiz Merkezi tam bu amaçla, kendi kriterlerinizi BIST hisseleri üzerinde
                taratmanıza imkân verir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">5. Adım: Pozisyon Yönetimi ve Risk Sınırları</h2>
              <p>
                Bir hisseye girdiğimizde "ne kadar?" sorusunun cevabını önceden vermiş olmalıyız. Pozisyon
                büyüklüğü, kayba dayanma kapasitesi ile ilgilidir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Tek pozisyonda risk:</strong> Toplam portföyün %1-2'sinden
                  fazlasını tek bir işlemde kaybetmemek. Bu kural profesyonel yatırımcıların disiplin
                  yöntemidir.
                </li>
                <li>
                  <strong className="text-white">Stop seviyesi:</strong> Alım öncesinde nerede zarar
                  durduracağını belirlemek. Stop, teknik bir seviye üzerinde olmalı — önceki desteğin altında
                  bir nokta gibi.
                </li>
                <li>
                  <strong className="text-white">Hedef kâr (take profit):</strong> Risk-ödül oranı 1:2 veya
                  daha iyi olmalı. Yani 100 TL risk ediyorsanız, kâr hedefi 200 TL olmalı.
                </li>
                <li>
                  <strong className="text-white">Maksimum portföy ekspozuru:</strong> Tek bir sektöre portföyün
                  %30'undan fazlasını ayırmamak. Çeşitlilik tek başına sigortadır.
                </li>
              </ul>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Stop seviyenizi piyasa size onu test ettirdiğinde taşımayın. Stopu yukarı almak başarının
                  bir parçasıdır, aşağı indirmek ise psikolojik bir tuzaktır. "Biraz daha bekleyim" cümlesi,
                  çoğu yatırımcıyı büyük kayıplara uğratmıştır.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Periyodik Yatırım (Cost Averaging)</h2>
              <p>
                Borsada en sık karşılaşılan psikolojik tuzak "doğru yer" arayışıdır. Hiçbir yatırımcı dipte alıp
                tepede satamaz. Bu sorunu çözmek için geliştirilmiş yöntem periyodik yatırım, namıdiğer Dollar
                Cost Averaging (DCA)'dir.
              </p>
              <p className="mt-3">
                DCA'da yatırımcı, fiyat ne olursa olsun belirli aralıklarla (her ay maaş günü gibi) sabit bir
                tutar yatırım yapar. Böylece düştüğünde daha çok lot, çıktığında daha az lot alınır; ortalama
                maliyet otomatik olarak optimize olur. Özellikle uzun dönem hedefli yatırımcılar için DCA;
                duygusal hataları minimize eden, en pratik yöntemlerden biridir.
              </p>
              <p className="mt-3">
                Pratik örnek: Her ay 5.000 TL ile XU100 ETF satın almak. 12 ay boyunca uygulandığında yıl
                sonunda hangi ay daha avantajlı oldu sorusu anlamsızlaşır; çünkü yatırımcı hem düşüşleri hem
                yükselişleri otomatik olarak ortalalamış olur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Rebalancing — Portföy Yeniden Dengeleme</h2>
              <p>
                Varlık dağılım hedeflerinizi belirledikten sonra (örneğin %60 hisse, %30 tahvil, %10 altın),
                piyasa hareketleri bu oranları zaman içinde bozar. Hisse senetleri %30 yükselip; tahvil ve
                altın sabit kalsa, dağılım %66 hisseye kayar. Risk profilinizden dışarı çıkmamak için
                periyodik olarak yeniden dengeleme yapmanız önerilir.
              </p>
              <p className="mt-3">
                Yaygın yöntemler: takvim bazlı (yılda 1-2 kez) veya eşik bazlı (hedef oranın %5 üzerinde
                sapma olduktan sonra). Rebalancing, "yüksekken sat — düşükteyken al" prensibinin disiplinli
                uygulanmasıdır; uzun dönem getiriyi destekleyen, akademik olarak da kanıtlanmış bir
                yaklaşımdır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Stratejiyi Test Etme</h2>
              <p>
                Strateji yazılmadan önce kağıt üzerinde ya da bir backtest aracında geçmişe doğru test
                edilmelidir. Test ederken dikkat edilecekler:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Sadece başarılı örnekleri seçmek (cherry picking) yapılmamalı; tüm sinyaller dahil edilmelidir.</li>
                <li>Komisyon ve vergi maliyetleri hesaba katılmalıdır.</li>
                <li>En az 2-3 yıllık veri üzerinde test edilmeli; tek bir yıl yanıltıcı olabilir.</li>
                <li>Maksimum düşüşe (drawdown) bakılmalı; %30 düşüşü olan strateji çok yatırımcıya göre taşınmazdır.</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Vergi ve Maliyet Yönetimi</h2>
              <p>
                Stratejinin gözardı edilen kısmı maliyetlerdir. Komisyon, BSMV, varsa stopaj ve fon ücretleri
                bir yatırımcının getirisini yıllık bazda %1-3 azaltabilir. Uzun vadede bu kayıp; bileşik
                getirinin sihirli yanının tersine dönmesi anlamına gelir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Komisyon:</strong> Aracılık kurumlarının oranı %0.05-%0.2
                  arasında değişir. Çok sık işlem (day trading) yapan biri yıllık komisyon için yüksek bir
                  bütçe ayırır.
                </li>
                <li>
                  <strong className="text-white">Stopaj:</strong> Hisse senedi kazançları kısa vadede %0
                  stopaj uygulamasına tabidir; ancak fon kazançları farklı oranlarla vergilendirilebilir. Vergi
                  rehberini her yıl takip etmek önemlidir.
                </li>
                <li>
                  <strong className="text-white">Fon ücretleri:</strong> Yatırım fonları ve ETF'ler yıllık
                  yönetim ücreti alır. Pasif takip eden ETF'ler (XU100 ETF gibi) çoğunlukla %0.5 altı orandadır;
                  aktif fonlar %1.5-2 aralığında olabilir.
                </li>
              </ul>
              <p className="mt-3">
                Maliyet bilinci, getirinin korunmasının sağlama yolundadır. Stratejinizdeki işlem sıklığını
                gözetip, yıllık komisyon yükünü hesaplamak büyük fark yaratır. Özellikle uzun vadeli
                stratejilerde, yıllık portföy dönüş oranı (turnover) %30'u geçmemelidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yaygın Hatalar</h2>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Strateji yazmadan işlem girmek.</li>
                <li>Kazanınca büyük kayıplara dayanma kabiliyetini abartmak.</li>
                <li>Sosyal medya yorumlarına göre stratejiyi gün içinde değiştirmek.</li>
                <li>Kaybeden bir hisseye orta almak ("zararı ortalama" tuzağı).</li>
                <li>Tüm portföyü tek bir hisseye yatırmak.</li>
                <li>Yüksek kaldıraç kullanmak.</li>
              </ul>
              <p className="mt-3">
                Stratejinizi belirledikten sonra her ay sonu kısa bir gözden geçirme yapın. Stratejinin
                kendisini değil, ona uyup uymadığınızı gözlemleyin. Kuralınızın yanlış olduğunu değil,
                disiplin eksikliğinizi görmek; yatırımcılık yolunda en değerli içgörülerden biridir.
              </p>
              <p className="mt-3">
                Stratejiyi destekleyen okumalar için{' '}
                <Link to="/egitim/bilanco-okuma" className="text-gold-400 underline-offset-2 hover:underline">
                  Bilanço Okuma Kılavuzu
                </Link>{' '}
                ve{' '}
                <Link to="/egitim/temel-gostergeler" className="text-gold-400 underline-offset-2 hover:underline">
                  EMA, MACD, RSI
                </Link>{' '}
                yazılarımızı inceleyebilirsiniz. Teknik filtreyi oluştururken{' '}
                <Link to="/egitim/destek-direnc" className="text-gold-400 underline-offset-2 hover:underline">
                  Destek ve Direnç
                </Link>{' '}
                yazımızdaki kavramları kullanabilirsiniz.
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
                  <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    EMA, MACD, RSI: 3 Temel Gösterge ve Yorumu <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/destek-direnc" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Destek ve Direnç Seviyeleri Nasıl Çizilir? <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/destek-direnc" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Önceki: Destek ve Direnç
            </Link>
            <Link to="/egitim" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Tüm makaleler <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
