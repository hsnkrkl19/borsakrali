import { Link } from 'react-router-dom'
import { Zap, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'
import BrandMark from '../../components/BrandMark'

export default function YatirimStratejisi() {
  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3 text-sm text-gold-400 hover:text-gold-300">
            <BrandMark size="sm" />
            Borsa Krali
          </Link>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link to="/egitim" className="text-gray-400 hover:text-white">Egitim</Link>
            <Link to="/hakkimizda" className="text-gray-400 hover:text-white">Hakkimizda</Link>
            <Link to="/iletisim" className="text-gray-400 hover:text-white">Iletisim</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <nav aria-label="breadcrumb" className="mb-4 text-xs text-gray-500">
            <Link to="/" className="hover:text-gold-400">Borsa Krali</Link>
            <span className="mx-2 text-gray-600">/</span>
            <Link to="/egitim" className="hover:text-gold-400">Egitim</Link>
            <span className="mx-2 text-gray-600">/</span>
            <span className="text-gray-300">Yatirim Stratejisi</span>
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
              Yatirim Stratejisi Olusturma: 5 Adim
            </h1>
            <p className="text-sm text-gray-500">10 Mayis 2026 — yaklasik 10 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Iyi yatirimcilarin sirri tek bir hisseyi dogru zamanda almak degildir; tutarli bir stratejiyi
              uzun yillar boyunca disiplinle uygulamaktir. Strateji, kararlarinizin onceden belirlenmis
              kurallar icinde alinmasini saglar; boylece duygulariniz piyasa ile birlikte calkalanmaz. Bu
              yazida yatirim stratejisini saglam temellere oturtmak icin uygulayabileceginiz 5 adimi adim
              adim ele alacagiz.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Strateji Neden Onemlidir?</h2>
              <p>
                Strateji olmadan yapilan yatirim, kuralsiz bir oyun gibidir. Birinin onerisi, sosyal medyada
                gordugunuz bir yorum, bir mum formasyonu — her seyin tetikleyici olabildigi bir ortamda kalan
                yatirimci, kazandiginda da kaybettiginde de neden bu sonucla karsilastigini bilemez. Strateji
                bir kuralin uzun vadeli uygulanmasidir; istikrarli sonuc icin sart kosul.
              </p>
              <p className="mt-3">
                Asagidaki 5 adim, bireysel yatirimcinin kendi stratejisini olustururken cevap vermesi gereken
                temel sorular etrafinda kurulmustur. Hicbir adimi atlamayin; tum sorulara yazili cevap
                vermek, stratejinizi sade ve uygulanabilir kilar.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">1. Adim: Yatirim Hedefini Belirleyin</h2>
              <p>
                Yatirimin neden yaptiginizi yazili olarak ifade etmek temel atim asamasidir. Hedefler net,
                olculebilir ve zamana bagli olmalidir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Kisa vade (1 yil ve alti):</strong> Acil ihtiyaclar icin biriktirilen para borsada tutulmamalidir; volatilite yuzdunden riskli olabilir.</li>
                <li><strong className="text-white">Orta vade (1-5 yil):</strong> Ev pesinati, egitim gibi belirli hedefler. Risk biraz daha alinabilir.</li>
                <li><strong className="text-white">Uzun vade (5+ yil):</strong> Emeklilik, cocugun gelecegi gibi hedefler. Volatiliteye en cok dayanikli olunabilen vade.</li>
              </ul>
              <p className="mt-3">
                Yatirim hedefiniz "X yil icinde Y kazanmak" formunda yazili olmali. Hedef nominal mi reel mi
                oldugu da belirtilmeli; ozellikle yuksek enflasyon donemlerinde nominal getiri aldatici
                olabilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">2. Adim: Risk Profilini Anlayin</h2>
              <p>
                Risk profili, kayba dayanma kapasitenizdir. Iki boyutu vardir: psikolojik tahammul ve finansal
                tahammul.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Psikolojik:</strong> Portfoyunuzun %30 dustugunu gordugunuzde uykunuz kacar mi? Eger evet ise, daha dusuk volatiliteli portfoye yonelmelisiniz.</li>
                <li><strong className="text-white">Finansal:</strong> Aniden nakde ihtiyaciniz olursa, portfoyu zararla satmak zorunda kalir misiniz? Acil fonunuz var mi?</li>
              </ul>
              <p className="mt-3">
                Risk profilinizi belirlemek icin "kaybetmeye dayanabilecegim maksimum yuzde" sorusuna durust
                bir cevap verin. Bu yuzde, portfoy yuksek riskli varliklara ne kadar agirlik vereceginizi
                belirler.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  Ipucu
                </h4>
                <p className="text-sm leading-6">
                  Risk algisi piyasa kosullariyla degisir. Yukselen piyasada herkes "ben yuksek risk
                  alabilirim" der. Asil test, dusen piyasada yapilir. Stratejinizi yukseliste degil, dusus
                  doneminin sertliginde test edin.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">3. Adim: Varlik Dagilimini Yapin</h2>
              <p>
                Varlik dagilimi (asset allocation), portfoyu farkli varlik siniflari arasinda paylastirmaktir.
                Akademik calismalar, uzun donem getirinin %80'inden fazlasinin varlik dagiliminin sonucu
                oldugunu gosterir; tek tek hisse secimi geri kalan kucuk bir paydir.
              </p>
              <p className="mt-3">Tipik varlik siniflari:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Hisse senetleri:</strong> Borsa Istanbul, yabanci borsalar.</li>
                <li><strong className="text-white">Tahvil ve sabit getirili enstrumanlar:</strong> Devlet tahvilleri, ozel sektor tahvilleri.</li>
                <li><strong className="text-white">Altin ve kiymetli madenler:</strong> Enflasyona karsi koruma.</li>
                <li><strong className="text-white">Doviz:</strong> Kur riskine karsi denge unsuru.</li>
                <li><strong className="text-white">Nakit:</strong> Firsatlari yakalamak icin saklanan likidite.</li>
                <li><strong className="text-white">Gayrimenkul ve alternatif yatirimlar.</strong></li>
              </ul>
              <p className="mt-3">
                Klasik kural: yas / 100 oraninda tahvil, geri kalan kismi hisse. 30 yasinda biri portfoyunun
                %70'ini hisseye, %30'unu tahvile koyabilir. Bu kural Turkiye'nin enflasyon ortami icin yetersiz
                olabilir; doviz ve altin agirligi mutlaka eklenmeli.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">4. Adim: Hisse Secim Kriterlerini Tanimlayin</h2>
              <p>
                Borsa Istanbul'da 500'e yakin sirket islem gorur. Hangisini almak gerektigini belirleyen,
                onceden tanimlanmis kriterlerdir.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Temel Kriterler</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li>F/K orani sektor ortalamasinin altinda olsun (degerli).</li>
                <li>PD/DD 1'in altinda veya yakin olsun.</li>
                <li>3 yillik ortalama ozkaynak karliligi (ROE) %15 uzerinde olsun.</li>
                <li>Net borc/FAVOK orani 3'un altinda olsun.</li>
                <li>Son 3 yilda her donem kar etmis olsun.</li>
              </ul>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Teknik Kriterler</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li>Fiyat 200 EMA uzerinde olsun (uzun donem trend yukari).</li>
                <li>RSI 40-60 araliginda olsun (asiri alim degil, momentum saglikli).</li>
                <li>Hacim son 30 gun ortalamasinin uzerinde olsun.</li>
                <li>Onemli direnci kirmis veya destekten tepki vermis olsun.</li>
              </ul>

              <p className="mt-3">
                Kriterleriniz sade olmali; her bir kriterin nedenini bilmelisiniz. 20 farkli kriter koymak
                yerine 5-6 ana kriter ile filtrelemek daha uygulanabilirdir. Borsa Krali platformundaki
                Tarama Analiz Merkezi tam bu amacla, kendi kriterlerinizi BIST hisseleri uzerinde
                taratmaniza imkan verir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">5. Adim: Pozisyon Yonetimi ve Risk Sinirlari</h2>
              <p>
                Bir hisseye girdigimizde "ne kadar?" sorusunun cevabini onceden vermis olmaliyiz. Pozisyon
                buyuklugu, kayba dayanma kapasitesi ile ilgilidir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Tek pozisyonda risk:</strong> Toplam portfoyun %1-2'sinden
                  fazlasini tek bir islemde kaybetmemek. Bu kural profesyonel yatirimcilarin disiplin
                  yontemidir.
                </li>
                <li>
                  <strong className="text-white">Stop seviyesi:</strong> Alim oncesinde nerede zarar
                  durduracagini belirlemek. Stop, teknik bir seviye uzerinde olmali — onceki destegin altinda
                  bir nokta gibi.
                </li>
                <li>
                  <strong className="text-white">Hedef kar (take profit):</strong> Risk-odul orani 1:2 veya
                  daha iyi olmali. Yani 100 TL risk ediyorsaniz, kar hedefi 200 TL olmali.
                </li>
                <li>
                  <strong className="text-white">Maksimum portfoy ekspozuru:</strong> Tek bir sektore portfoyun
                  %30'undan fazlasini ayirmamak. Cesitlilik tek baska sigortadir.
                </li>
              </ul>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Onemli Not
                </h4>
                <p className="text-sm leading-6">
                  Stop seviyenizi piyasa size onu test ettirdiginde tasimayin. Stopu yukari almak basarinin
                  bir parcasidir, asagi indirmek ise psikolojik bir tuzaktir. "Biraz daha bekleyim" cumlesi,
                  cogu yatirimciyi buyuk kayiplara ugratmistir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Periyodik Yatirim (Cost Averaging)</h2>
              <p>
                Borsada en sik karsilasilan psikolojik tuzak "doru yer" arayisidir. Hicbir yatirimci dipte alip
                tepede satamaz. Bu sorunu cozmek icin gelistirilmis yontem periyodik yatirim, namidiger Dollar
                Cost Averaging (DCA)'dir.
              </p>
              <p className="mt-3">
                DCA'da yatirimci, fiyat ne olursa olsun belirli araliklarla (her ay maas gunu gibi) sabit bir
                tutar yatirim yapar. Boylece dustugunde daha cok lot, ciktiginda daha az lot alinir; ortalama
                maliyet otomatik olarak optimize olur. Ozellikle uzun donem hedefli yatirimcilar icin DCA;
                duygusal hatalari minimize eden, en pratik yontemlerden biridir.
              </p>
              <p className="mt-3">
                Pratik ornek: Her ay 5.000 TL ile XU100 ETF satin almak. 12 ay boyunca uygulandiginda yil
                sonunda hangi ay daha avantajli oldu sorusu anlamsizlasir; cunku yatirimci hem dususleri hem
                yukselisleri otomatik olarak ortalamis olur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Rebalancing — Portfoy Yeniden Dengeleme</h2>
              <p>
                Varlik dagilim hedeflerinizi belirledikten sonra (ornegin %60 hisse, %30 tahvil, %10 altin),
                piyasa hareketleri bu oranlari zaman icinde bozar. Hisse senetleri %30 yukselip; tahvil ve
                altin sabit kalsa, dagilim %66 hisseye kayar. Risk profilinizden disari cikmamak icin
                periyodik olarak yeniden dengeleme yapmaniz onerilir.
              </p>
              <p className="mt-3">
                Yaygin yontemler: takvim bazli (yilda 1-2 kez) veya esik bazli (hedef oranin %5 uzerinde
                sapma olduktan sonra). Rebalancing, "yuksekken sat — duskunken al" prensibinin disiplinli
                uygulanmasidir; uzun donem getiriyi destekleyen, akademik olarak da kanitlanmis bir
                yaklasimdir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Stratejiyi Test Etme</h2>
              <p>
                Strateji yazilmadan once kagit uzerinde ya da bir backtest aracinda gecmise dogru test
                edilmelidir. Test ederken dikkat edilecekler:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Sadece basarili ornekleri secmek (cherry picking) yapilmamali; tum sinyaller dahil edilmeli.</li>
                <li>Komisyon ve vergi maliyetleri hesaba katilmali.</li>
                <li>En az 2-3 yillik veri uzerinde test edilmeli; tek bir yil yaniltici olabilir.</li>
                <li>Maksimum dususe (drawdown) bakilmali; %30 dususu olan strateji cok yatirimciya gore tasinmaz.</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Vergi ve Maliyet Yonetimi</h2>
              <p>
                Stratejinin gozardi edilen kismi maliyetlerdir. Komisyon, BSMV, varsa stopaj ve fon ucretleri
                bir yatirimcinin getirisini yillik bazda %1-3 azaltabilir. Uzun vadede bu kayip; bilesik
                getirinin sihirli yaninin tersine donmesi anlamina gelir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Komisyon:</strong> Aracilik kurumlarinin orani %0.05-%0.2
                  arasinda degisir. Cok sik islem (day trading) yapan biri yillik komisyon icin yuksek bir
                  butce ayirir.
                </li>
                <li>
                  <strong className="text-white">Stopaj:</strong> Hisse senedi kazanclari kisa vadede %0
                  stopaj uygulamasina tabidir; ancak fon kazanclari farkli oranlarla vergilenebilir. Vergi
                  rehberini her yil takip etmek onemlidir.
                </li>
                <li>
                  <strong className="text-white">Fon ucretleri:</strong> Yatirim fonlari ve ETF'ler yillik
                  yonetim ucreti alir. Pasif takip eden ETF'ler (XU100 ETF gibi) cogunlukla %0.5 alti orandadir;
                  aktif fonlar %1.5-2 araliginda olabilir.
                </li>
              </ul>
              <p className="mt-3">
                Maliyet bilinci, getirinin korunmasinin saglamayolundur. Stratejinizdeki islem sikligini
                gozetip, yillik komisyon yukunu hesaplamak buyuk fark yaratir. Ozellikle uzun vadeli
                stratejilerde, yillik portfoy donus orani (turnover) %30'u gecmemelidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yaygin Hatalar</h2>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Strateji yazmadan islem girmek.</li>
                <li>Kazaninca buyuk kayiplara dayanma kabiliyetini abartmak.</li>
                <li>Sosyal medya yorumlarina gore stratejiyi gun icinde degistirmek.</li>
                <li>Kaybeden bir hisseye orta almak ("zarari ortalama" tuzagi).</li>
                <li>Tum portfoyu tek bir hisseye yatirmak.</li>
                <li>Yuksek kaldirac kullanmak.</li>
              </ul>
              <p className="mt-3">
                Stratejinizi belirledikten sonra her ay sonu kisa bir gozden gecirme yapin. Stratejinin
                kendisini degil, ona uyup uymadiginizi gozlemleyin. Kuralinizin yanlis oldugunu degil,
                disiplin eksikliginizi gormek; yatirimcilik yolunda en degerli icgorulerden biridir.
              </p>
              <p className="mt-3">
                Stratejiyi destekleyen okumalar icin{' '}
                <Link to="/egitim/bilanco-okuma" className="text-gold-400 underline-offset-2 hover:underline">
                  Bilanco Okuma Kilavuzu
                </Link>{' '}
                ve{' '}
                <Link to="/egitim/temel-gostergeler" className="text-gold-400 underline-offset-2 hover:underline">
                  EMA, MACD, RSI
                </Link>{' '}
                yazilarimizi inceleyebilirsiniz. Teknik filtreyi olustururken{' '}
                <Link to="/egitim/destek-direnc" className="text-gold-400 underline-offset-2 hover:underline">
                  Destek ve Direnc
                </Link>{' '}
                yazimizdaki kavramlari kullanabilirsiniz.
              </p>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakali</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/bilanco-okuma" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Bilanco Okuma Kilavuzu: Aktif, Pasif, Ozkaynak <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    EMA, MACD, RSI: 3 Temel Gosterge ve Yorumu <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/destek-direnc" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Destek ve Direnc Seviyeleri Nasil Cizilir? <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              </ul>
            </section>

            <p className="border-t border-white/5 pt-4 text-xs text-gray-500">
              Bu icerik yatirim tavsiyesi degildir. Yalnizca egitim ve bilgilendirme amaciyla hazirlanmistir.
              Yatirim kararlariniz icin kendi arastirmanizi yapmaniz ve gerekirse profesyonel destek almaniz
              onerilir.
            </p>
          </article>

          <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4 text-sm">
            <Link to="/egitim/destek-direnc" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Onceki: Destek ve Direnc
            </Link>
            <Link to="/egitim" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Tum makaleler <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
