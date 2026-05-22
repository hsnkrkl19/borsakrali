import { Link } from 'react-router-dom'
import { Shield, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function RiskYonetimi() {
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
            <span className="text-gray-300">Risk Yönetimi</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Shield className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                Strateji
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Risk Yönetimi: Stop-Loss, Pozisyon Büyüklüğü ve Sermaye Koruma
            </h1>
            <p className="text-sm text-gray-500">15 Mayıs 2026 — yaklaşık 11 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Çoğu yeni yatırımcı zamanını "hangi hisseyi alsam?" sorusuna ayırır. Oysa uzun vadede hayatta
              kalmayı belirleyen soru "ne kadar kaybedebilirim?" sorusudur. Piyasada başarı, en doğru tahmini
              yapmaktan değil, yanlış çıktığınızda küçük kaybetmekten geçer. Bu yazıda risk yönetiminin
              matematiğini adım adım ele alacağız: işlem başına risk kuralı, pozisyon büyüklüğü hesabı,
              stop-loss türleri, risk/ödül oranı ve R-multiple kavramı, drawdown matematiği, korelasyon riski
              ve duygusal hataların maliyeti.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Neden Risk Yönetimi 1 Numaralı Önceliktir?</h2>
              <p>
                Bir trader iki kez doğru, sekiz kez yanlış tahmin yapsa bile, kazançlarını büyütüp zararlarını
                küçük tuttuğu sürece kâr edebilir. Tam tersi de geçerlidir: sekiz kez doğru tahmin yapan biri,
                iki büyük zararla tüm kazancını silebilir. Yani sonucu belirleyen tahmin isabeti değil, kayıp
                yönetimidir.
              </p>
              <p className="mt-3">
                Bunun arkasındaki sebep basittir. Hesabınız sıfıra giderse, ne kadar iyi bir stratejiye sahip
                olduğunuzun hiçbir önemi kalmaz; çünkü oyuna devam edecek sermayeniz yoktur. Profesyonel fon
                yöneticilerinin ortak özelliği parlak alım fikirleri değil, katı kayıp disiplinidir. "Önce
                sermayeyi koru, sonra büyütmeyi düşün" ilkesi her şeyin temelidir.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Sermayenin Korunması İlkesi</h3>
              <p>
                Sermayenin korunması, her işlemde "bu işlem ters giderse hesabımın ne kadarını riske atıyorum?"
                sorusuna net bir cevabınızın olması demektir. Cevap "bilmiyorum" ise henüz risk yönetimi
                yapmıyorsunuz, sadece şansa oynuyorsunuz demektir. İyi bir yatırımcı her pozisyona girmeden
                önce maksimum kaybını rakamla bilir ve bu rakamı kabul edebileceği bir seviyede tutar.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">İşlem Başına %1-2 Risk Kuralı</h2>
              <p>
                Profesyonellerin en sık kullandığı temel kural şudur: tek bir işlemde toplam hesabınızın
                yüzde 1 ila 2'sinden fazlasını riske atmayın. Burada "risk", pozisyonun büyüklüğü değil, stop
                seviyeniz tetiklenirse uğrayacağınız zarardır.
              </p>
              <p className="mt-3">
                Örnek: 100.000 TL'lik bir hesabınız var ve işlem başına %1 risk kuralını uyguluyorsunuz. Bu,
                tek işlemde maksimum 1.000 TL kayıp kabul ediyorsunuz demektir. Pozisyonun kendisi 20.000 TL
                veya 40.000 TL olabilir; önemli olan stop tetiklendiğinde zararınızın 1.000 TL'yi aşmamasıdır.
              </p>
              <p className="mt-3">
                Bu kural neden işe yarar? Çünkü %1 risk uygulayan bir yatırımcı, üst üste 10 işlem kaybetse
                bile hesabının yalnızca yaklaşık %10'unu kaybeder ve oyunda kalmaya devam eder. Oysa işlem
                başına %20 riske giren biri, sadece 3-4 kötü işlemle hesabını yarıya indirebilir. Tecrübesiz
                yatırımcılar için %1, daha tecrübeliler için %2 makul bir tavandır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Pozisyon Büyüklüğü Nasıl Hesaplanır?</h2>
              <p>
                Risk kuralını uygulamanın yolu doğru pozisyon büyüklüğünü hesaplamaktan geçer. Temel formül
                şudur:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`Lot (adet) = Riske Edilen Sermaye / (Giriş Fiyatı - Stop Fiyatı)

Riske Edilen Sermaye = Hesap Büyüklüğü x Risk Yüzdesi
Pozisyon Tutarı     = Lot x Giriş Fiyatı`}
              </pre>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Adım Adım Worked Example</h3>
              <p>
                Diyelim ki 100.000 TL hesabınız var ve THYAO hissesi almak istiyorsunuz. İşlem başına %1 risk
                uyguluyorsunuz, yani 1.000 TL riske ediyorsunuz.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Giriş fiyatı:</strong> 250 TL</li>
                <li><strong className="text-white">Stop-loss seviyesi:</strong> 240 TL (teknik desteğin hemen altı)</li>
                <li><strong className="text-white">Hisse başına risk:</strong> 250 - 240 = 10 TL</li>
                <li><strong className="text-white">Riske edilen sermaye:</strong> 100.000 x %1 = 1.000 TL</li>
                <li><strong className="text-white">Alınacak lot:</strong> 1.000 / 10 = 100 adet THYAO</li>
                <li><strong className="text-white">Pozisyon tutarı:</strong> 100 x 250 = 25.000 TL</li>
              </ul>
              <p className="mt-3">
                Sonuç: 25.000 TL'lik bir pozisyon açarsınız, ama stop tetiklenirse zararınız tam olarak 1.000
                TL olur. Şimdi stop'u 240 yerine 245 TL'ye, yani girişe daha yakın koyarsanız, hisse başına
                risk 5 TL'ye düşer ve aynı 1.000 TL ile 200 lot alabilirsiniz (50.000 TL'lik pozisyon). Yani
                stop ne kadar dar olursa pozisyonunuz o kadar büyük, ne kadar geniş olursa o kadar küçük olur.
                Risk her durumda sabit 1.000 TL kalır.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Pozisyon büyüklüğünü her zaman stop seviyesini belirledikten sonra hesaplayın. Çoğu yeni
                  yatırımcı önce "ne kadar para yatırayım?" diye düşünür, sonra stop'u oraya uydurmaya çalışır.
                  Doğru sıralama tersidir: önce mantıklı bir stop seviyesi seçin, sonra formül size kaç lot
                  alabileceğinizi söylesin.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Stop-Loss Türleri</h2>
              <p>
                Stop-loss, pozisyon ters gittiğinde zararı önceden belirlenmiş bir seviyede sınırlayan
                emirdir. Dört temel stop türü vardır ve her birinin kendine göre avantajı bulunur.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Sabit yüzde stop:</strong> Giriş fiyatının belli bir yüzde
                  altına konur. Örneğin 250 TL'den alıp %8 sabit stop kullanırsanız stop 230 TL olur.
                  Uygulaması en basit yöntemdir ama hissenin oynaklığını dikkate almaz.
                </li>
                <li>
                  <strong className="text-white">ATR tabanlı stop:</strong> Average True Range (ortalama
                  gerçek aralık) göstergesi hissenin günlük tipik hareket genişliğini ölçer. Stop, giriş
                  fiyatının 1.5 veya 2 ATR altına konur. Oynak bir hissede stop otomatik olarak genişler,
                  sakin bir hissede daralır. Bu sayede hisseyi normal gürültüsü içinde stoplamazsınız.
                </li>
                <li>
                  <strong className="text-white">Teknik seviye tabanlı stop:</strong> Stop, anlamlı bir
                  desteğin veya son swing dibinin hemen altına yerleştirilir. THYAO 250 TL'den alındıysa ve
                  son önemli dip 242 TL ise, stop 240 TL'ye (dibin biraz altına) konur. En mantıklı yöntem
                  budur çünkü piyasanın gerçek yapısına dayanır.
                </li>
                <li>
                  <strong className="text-white">Takip eden (trailing) stop:</strong> Fiyat lehinize hareket
                  ettikçe stop da yukarı çekilir, ama hiçbir zaman aşağı inmez. Örneğin %10 trailing stop ile
                  THYAO 250'den 300'e çıkarsa stop 270'e yükselir; böylece kazancın bir kısmını kilitlersiniz.
                  Trend takip eden stratejilerde kârı korumak için idealdir.
                </li>
              </ul>
              <p className="mt-3">
                Hangi türü seçerseniz seçin, stop'u açtığınız anda belirleyin ve emir olarak sisteme girin.
                "Fiyat oraya gelirse satarım" şeklinde zihinsel stop kullanmak, baskı altında neredeyse her
                zaman başarısız olur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Risk/Ödül Oranı ve R-Multiple</h2>
              <p>
                Risk/ödül oranı, bir işlemde riske ettiğiniz tutara karşılık hedeflediğiniz kazancın oranıdır.
                Hesabı basittir: hedef fiyata olan mesafe, stop'a olan mesafeye bölünür.
              </p>
              <p className="mt-3">
                Örnek: GARAN hissesini 100 TL'den alıyorsunuz, stop 95 TL (risk 5 TL), hedef 115 TL (potansiyel
                kazanç 15 TL). Risk/ödül oranınız 15 / 5 = 3, yani 1:3'tür. Bu işlemde 1 birim riske karşılık 3
                birim kazanç hedefliyorsunuz.
              </p>
              <p className="mt-3">
                R-multiple kavramı buradan doğar. "1R" sizin tek işlemdeki risk tutarınızdır. Yukarıdaki
                örnekte 1R = 5 TL. İşlem hedefe ulaşırsa kazancınız +3R, stop yerse zararınız -1R olur.
                Sonuçları para yerine R cinsinden takip etmek çok güçlüdür: hesap büyüklüğünüzden bağımsız
                olarak stratejinizin ortalama kaç R kazandırdığını görürsünüz.
              </p>
              <p className="mt-3">
                Bu yüzden 1:2'nin altındaki risk/ödül oranlarına genelde girilmez. Eğer ortalama 1:2 oranıyla
                çalışıyorsanız, işlemlerinizin yalnızca %40'ında haklı çıksanız bile kâr edersiniz: 100 işlemde
                40 kazanç x +2R = +80R, 60 kayıp x -1R = -60R, net sonuç +20R. Düşük isabet oranıyla bile
                kazanmanın sırrı budur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Drawdown ve Toparlanma Matematiği</h2>
              <p>
                Drawdown, hesabınızın zirveden ne kadar geri çekildiğini gösteren orandır. Çoğu yatırımcının
                gözden kaçırdığı kritik gerçek şudur: bir zararı telafi etmek için gereken kazanç oranı, zarar
                oranından her zaman daha büyüktür ve aradaki fark zarar büyüdükçe hızla açılır.
              </p>
              <p className="mt-3">
                Sebebi basit: %50 kaybederseniz elinizde sermayenin yarısı kalır ve o yarıyı tekrar bütüne
                çıkarmak için onu ikiye katlamanız, yani %100 kazanmanız gerekir. Aşağıdaki tablo bu ilişkiyi
                gösterir:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`Yaşanan Zarar    Başa Dönmek İçin Gereken Kazanç
   -%10                    +%11
   -%20                    +%25
   -%30                    +%43
   -%40                    +%67
   -%50                   +%100
   -%70                   +%233
   -%90                   +%900`}
              </pre>
              <p className="mt-3">
                Tablodan çıkan ders nettir: küçük zararlar kolay telafi edilir, büyük zararlar neredeyse
                imkansız hale gelir. -%10'luk bir kaybı +%11 ile kapatırsınız; ama -%50'lik bir kayıptan sonra
                paranızı ikiye katlamanız gerekir ki bu çoğu zaman yıllar alır. İşte işlem başına %1-2 risk
                kuralı tam da bu yüzden vardır: hesabınızı asla derin drawdown bölgesine sokmamak için.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Zararını "ortalama düşürmek" için kaybeden pozisyona ekleme yapmak (averaging down),
                  drawdown matematiğinin en tehlikeli tuzağıdır. Düşen bir hisseye eklemek pozisyonunuzu
                  büyütür ve fiyat düşmeye devam ederse zararınız katlanır. Düşüşte ekleme yapmak, ancak
                  önceden planlanmış bir DCA stratejisinin parçasıysa anlamlıdır; panikle yapılan ekleme bir
                  strateji değil, kaybı kabul edememektir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Korelasyon Riski: Aynı Yöne Bahis</h2>
              <p>
                İşlem başına %1 risk kuralını uyguladığınızı düşünün. Ama aynı anda KCHOL, GARAN ve AKBNK
                pozisyonlarını birlikte açtınız. Bunların hepsi büyük bankacılık ve holding ağırlıklı, faiz
                kararlarına ve genel piyasa havasına aynı yönde tepki veren hisselerdir. Kötü bir günde üçü de
                birlikte stop olur ve toplam zararınız %1 değil %3 olur.
              </p>
              <p className="mt-3">
                Buna korelasyon riski denir. Birbirine yüksek korelasyonlu varlıklara aynı yönde pozisyon
                açtığınızda, aslında tek bir büyük bahis yapmış olursunuz. Gerçek riskiniz tek tek değil,
                toplamda ölçülmelidir. Aynı durum kripto için de geçerlidir: Bitcoin düşerken çoğu altcoin
                onunla birlikte ve genelde daha sert düşer; 5 farklı altcoin tutmak çeşitlendirme sanılır ama
                pratikte hepsi tek bir BTC bahsidir.
              </p>
              <p className="mt-3">
                Pratik çözüm: aynı anda taşıdığınız korelasyonlu pozisyonların toplam riskine bir tavan koyun.
                Örneğin tüm bankacılık hisselerinde toplam riskiniz %2-3'ü geçmesin. Farklı sektörlerden
                (havacılık, perakende, sanayi) ve farklı varlık sınıflarından seçim yapmak gerçek
                çeşitlendirme sağlar.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Stop Kaçırmanın Duygusal Maliyeti</h2>
              <p>
                Risk yönetiminin matematiği kusursuz olabilir; ama uygulanmazsa hiçbir değeri yoktur. Yeni
                yatırımcıların en pahalı hatası, fiyat stop seviyesine geldiğinde "biraz daha bekleyeyim,
                belki döner" diyerek stop'u iptal etmektir.
              </p>
              <p className="mt-3">
                Senaryoyu görelim: EREGL'i 50 TL'den aldınız, stop 46 TL'ye konmuştu, yani planlı zarar -1R.
                Fiyat 46'ya geldi, siz satmadınız. Fiyat 40'a indi. Artık zararınız -1R değil, yaklaşık
                -2.5R. Burada da satmadınız çünkü "bu kadar düştü, şimdi satmak mantıksız" diye düşündünüz.
                Fiyat 34'e indi; zarar -4R. Tek bir disiplinsiz karar, planlı küçük bir zararı hesabınızı
                sarsan bir kayba çevirdi.
              </p>
              <p className="mt-3">
                Stop'un amacı sizi haklı çıkarmak değil, yanlış olduğunuzda çıkışı garanti etmektir. Bazen
                stop olduktan sonra fiyat geri döner ve bu sinir bozucudur; ama bu, stop kullanmanın bedeli
                değil, sigorta primidir. Stop kaçıran yatırımcı birkaç kez "şanslı" çıkar, sonra bir kez
                hesabını yarılayan zarara yakalanır. Disiplin, tek tek işlemlerde değil yüzlerce işlemin
                toplamında kazandırır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Risk Yönetimi Kontrol Listesi</h2>
              <p>
                Her pozisyona girmeden önce aşağıdaki adımları sırayla uygulayın. Bu listenin tamamına "evet"
                diyemiyorsanız işleme girmeyin.
              </p>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li>İşlem başına risk yüzdemi belirledim (%1-2) ve bunun TL karşılığını biliyorum.</li>
                <li>Mantıklı bir stop-loss seviyesi seçtim (teknik seviye, ATR veya sabit yüzde).</li>
                <li>Pozisyon büyüklüğünü formülle hesapladım, fiyata uydurmadım.</li>
                <li>Risk/ödül oranım en az 1:2; hedefe olan mesafe stop mesafesinin iki katından fazla.</li>
                <li>Stop emrini sisteme girdim; zihinsel stop ile yetinmiyorum.</li>
                <li>Açık pozisyonlarımın korelasyonunu kontrol ettim; aynı yöne aşırı yüklenmiyorum.</li>
                <li>Toplam portföy riskim (tüm açık pozisyonların toplam riski) kabul edebileceğim sınırda.</li>
                <li>Stop tetiklenirse hiçbir gerekçeyle iptal etmeyeceğimi şimdiden kabul ettim.</li>
              </ol>
              <p className="mt-3">
                Bu disiplini bir kez alışkanlık haline getirdiğinizde, piyasanın kötü günleri sizi yıkmaz;
                yalnızca yıpratır ve siz oyunda kalmaya devam edersiniz. Risk yönetimini öğrendikten sonra
                doğal devam{' '}
                <Link to="/egitim/portfoy-yonetimi" className="text-gold-400 underline-offset-2 hover:underline">
                  Portföy Yönetimi
                </Link>{' '}
                yazımızdır; her işlemin parçası olduğu bütüne bakmayı öğretir.
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
                  <Link to="/egitim/trade-plani" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Trade Planı Oluşturma <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/bitcoin-dominansi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Önceki: Bitcoin Dominansı ve Altcoin Sezonu
            </Link>
            <Link to="/egitim/portfoy-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Portföy Yönetimi <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
