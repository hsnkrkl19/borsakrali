import { Link } from 'react-router-dom'
import { AlertOctagon, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function YatirimHatalari() {
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
            <span className="text-gray-300">Yatırımda En Sık Yapılan 10 Hata</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <AlertOctagon className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                Strateji
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Yatırımda En Sık Yapılan 10 Hata
            </h1>
            <p className="text-sm text-gray-500">20 Mayıs 2026 — yaklaşık 9 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Borsada başarılı olmanın yolu, çoğu zaman parlak hamleler yapmaktan değil, ölümcül hataları
              tekrar tekrar yapmamaktan geçer. Yeni yatırımcıların büyük kısmı aynı on hatayı yapar; üstelik
              bu hatalar zekâ eksikliğinden değil, doğal insan içgüdülerinden kaynaklanır. Aşağıda her hatayı
              üç katmanda ele alıyoruz: tam olarak ne olduğu, neden zarar verdiği ve nasıl düzeltileceği.
              Bunları bilinçli biçimde tanımak, sermayenizi koruyan en pratik beceridir.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">İlk Beş Hata</h2>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">1. Stop-Loss Kullanmamak</h3>
              <p>
                <strong className="text-white">Ne olduğu:</strong> Pozisyon açarken kaybı sınırlayacak bir
                zarar-kes seviyesi belirlememek; fiyat aleyhe gittiğinde "döner herhalde" diyerek beklemek.
              </p>
              <p className="mt-3">
                <strong className="text-white">Neden zararlı:</strong> Stop-loss olmadan küçük bir kayıp,
                kontrolden çıkmış bir felakete dönüşebilir. Matematik acımasızdır: yüzde 10 kayıptan dönmek
                için yüzde 11 kazanmak yeterken, yüzde 50 kayıptan dönmek için yüzde 100 kazanmak gerekir.
                GARAN yüzde 7 düştüğünde 1.000 TL kayıpla çıkmak yerine umutla beklemek, çoğu zaman yüzde
                30'luk bir kayıpla biter.
              </p>
              <p className="mt-3">
                <strong className="text-white">Nasıl düzeltilir:</strong> Her pozisyona, daha alım emrini
                verirken bir stop-loss seviyesi belirleyin. Stop'u teknik bir noktaya — bir desteğin altına
                veya kırılma seviyesine — koyun. Bir kez yerleştirdikten sonra aşağı çekmeyin; stop'un işlevi
                tam olarak sizi kendinizden korumaktır.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">2. Zarardaki Pozisyona Bilinçsizce Ekleme (Kötü Averaj)</h3>
              <p>
                <strong className="text-white">Ne olduğu:</strong> Düşen bir hissenin maliyetini ortalamak için
                hiçbir plan olmadan, sadece "ucuzladı" diye alt seviyelerden alım yapmak. Buna "düşen bıçağı
                yakalamak" da denir.
              </p>
              <p className="mt-3">
                <strong className="text-white">Neden zararlı:</strong> Bu davranış, kaybeden bir pozisyona
                daha fazla sermaye bağlayarak riski büyütür. EREGL 60 TL'den 45 TL'ye, oradan 32 TL'ye
                düşerken her seviyede ekleme yapan yatırımcı, en sonunda portföyünün büyük kısmını tek bir
                düşen varlığa kilitlemiş olur. Maliyet ortalama (DCA) ile karıştırılır; ancak DCA önceden
                planlanmış, kademeli ve genelde sağlam bir varlığa yapılır — bilinçsiz averaj ise plansız bir
                kurtarma çabasıdır.
              </p>
              <p className="mt-3">
                <strong className="text-white">Nasıl düzeltilir:</strong> Kayıptaki bir pozisyona, ancak
                önceden yazılmış bir planın parçasıysa ekleme yapın. Doğru soru "ucuzladı mı" değil, "bugün
                elimde nakit olsa bu varlığı yine alır mıydım, alış tezim hâlâ geçerli mi" sorusudur. Tez
                bozulduysa eklemek değil, çıkmak gerekir.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">3. Kaldıracı Kötüye Kullanmak</h3>
              <p>
                <strong className="text-white">Ne olduğu:</strong> Özellikle kripto futures işlemlerinde,
                sermayenin kaldıramayacağı büyüklükte pozisyon açmak; 10x, 20x gibi yüksek kaldıraçlarla işlem
                yapmak.
              </p>
              <p className="mt-3">
                <strong className="text-white">Neden zararlı:</strong> Kaldıraç kazancı büyüttüğü gibi kaybı da
                aynı oranda büyütür ve likidasyon riski getirir. 10x kaldıraçla açılan bir pozisyonda, fiyatın
                aleyhinize yalnızca yüzde 10 hareket etmesi tüm teminatınızı sıfırlar. Bitcoin gibi bir günde
                yüzde 8–10 oynayabilen bir varlıkta yüksek kaldıraç, doğru yönü tahmin etseniz bile, geçici
                bir dalgalanmada pozisyonunuzun kapanmasına yol açar.
              </p>
              <p className="mt-3">
                <strong className="text-white">Nasıl düzeltilir:</strong> Yeni başlayan biriyseniz kaldıraçtan
                tamamen uzak durun veya 2x–3x ile sınırlayın. Kaldıraçlı işlem yapsanız bile, risk hesabını
                kaldıraç üzerinden değil, gerçek pozisyon büyüklüğü ve stop mesafesi üzerinden yapın; tek
                işlemde sermayenizin yüzde 1–2'sinden fazlasını riske atmayın.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">4. FOMO ile Tepeden Almak</h3>
              <p>
                <strong className="text-white">Ne olduğu:</strong> Hızla yükselen bir varlığı, kazancı
                kaçırma korkusuyla, analiz yapmadan ve hareketin sonuna yakın bir noktada satın almak.
              </p>
              <p className="mt-3">
                <strong className="text-white">Neden zararlı:</strong> Bir varlık üç günde yüzde 60 yükselip
                sosyal medyada konuşulmaya başladığında, fırsatın büyük kısmı çoktan tükenmiştir. FOMO ile
                girilen pozisyonların ortak kaderi, alımdan kısa süre sonra gelen sert düzeltmedir; yatırımcı
                tepeye yakın alıp, ardından gelen düşüşte panikle satar.
              </p>
              <p className="mt-3">
                <strong className="text-white">Nasıl düzeltilir:</strong> "Herkes konuşuyorsa muhtemelen
                geç kaldım" ilkesini benimseyin. Bir varlığa ancak kendi planınızın giriş kuralları
                tetiklendiğinde girin, fiyat coştuğu için değil. Treni kaçırdıysanız bir sonraki treni
                bekleyin; piyasada fırsat hiç bitmez, kaybedilen sermaye ise zor geri gelir.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">5. Araştırmadan, Kulaktan Dolma Yatırım</h3>
              <p>
                <strong className="text-white">Ne olduğu:</strong> Bir hisseyi ya da kripto parayı, bir
                tanıdığın tavsiyesi, sosyal medya paylaşımı veya bir "uzman" yorumu yüzünden, kendi araştırmanı
                yapmadan almak.
              </p>
              <p className="mt-3">
                <strong className="text-white">Neden zararlı:</strong> Kendi araştırmanızı yapmadan girdiğiniz
                bir pozisyonda, fiyat düştüğünde elinizde tutunacak hiçbir tez olmaz. Neden aldığınızı
                bilmediğiniz için ne zaman satacağınızı da bilemezsiniz. Üstelik tavsiyeyi veren kişinin
                zaman dilimi, risk iştahı ve maliyeti sizinkinden tamamen farklı olabilir.
              </p>
              <p className="mt-3">
                <strong className="text-white">Nasıl düzeltilir:</strong> Bir fikri başlangıç noktası olarak
                kabul edin, ama asla son karar olarak değil. Hisse için bilançoya, sektör konumuna ve
                grafiğe; kripto için projenin ne işe yaradığına ve on-chain verilere kendiniz bakın. Kuralı
                basittir: anlamadığınız hiçbir şeye yatırım yapmayın.
              </p>
            </section>

            <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
              <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                <Lightbulb className="h-4 w-4" />
                İpucu
              </h4>
              <p className="text-sm leading-6">
                Bu on hatanın neredeyse tamamının ortak panzehiri yazılı bir trade planıdır. Plan; girişi,
                stop-loss'u, hedefi ve pozisyon büyüklüğünü önceden tanımladığı için, hatların büyük kısmı
                daha pozisyon açılmadan engellenir. Hata listesini ezberlemek yerine, planlı çalışma
                alışkanlığı kazanın.
              </p>
            </div>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">İkinci Beş Hata</h2>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">6. Aşırı İşlem (Overtrading)</h3>
              <p>
                <strong className="text-white">Ne olduğu:</strong> Net bir setup olmadan, sıkıldığı veya
                "bir şey yapma" dürtüsüne kapıldığı için gün içinde gereğinden çok sayıda alım-satım yapmak.
              </p>
              <p className="mt-3">
                <strong className="text-white">Neden zararlı:</strong> Her işlem komisyon, alış-satış makası
                ve vergi gibi maliyetler doğurur; bu maliyetler çok sayıda işlemde birikerek getiriyi sessizce
                eritir. Dahası, aşırı işlem genelde düşük kaliteli, gelişigüzel girişler anlamına gelir ve
                duygusal yorgunluğu artırarak karar kalitesini düşürür.
              </p>
              <p className="mt-3">
                <strong className="text-white">Nasıl düzeltilir:</strong> İşlem yapmamanın da bir pozisyon
                olduğunu kabul edin. Yalnızca planınızın kriterlerini tam karşılayan kurulumlarda işlem yapın.
                Kendinize haftalık veya günlük bir işlem sayısı sınırı koymak, niceliği değil niteliği
                ödüllendirir.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">7. Kârı Erken Kapatıp Zararı Geç Kapatmak</h3>
              <p>
                <strong className="text-white">Ne olduğu:</strong> Kazandaki bir pozisyonu, küçük bir kâr
                kaçar korkusuyla çok erken satmak; buna karşılık zarardaki bir pozisyonu, kaybı kabullenmek
                istemediği için aşırı uzun tutmak.
              </p>
              <p className="mt-3">
                <strong className="text-white">Neden zararlı:</strong> Bu davranış, kazançların küçük,
                kayıpların büyük olmasına yol açar; yani risk/ödül oranını tersine çevirir. THYAO'da yüzde 4
                kârla çıkıp, ASELS'te yüzde 25 zarara katlanan bir yatırımcı, işlemlerinin çoğunu kazansa bile
                toplamda kaybeder. Sebebi kayıptan kaçınma önyargısıdır: kaybın acısı kazancın hazzından daha
                şiddetli hissedilir.
              </p>
              <p className="mt-3">
                <strong className="text-white">Nasıl düzeltilir:</strong> Hedef ve stop seviyelerini girişte
                belirleyin ve fiyat o seviyelere ulaşana kadar kararınızı duyguya bırakmayın. En az 2:1
                risk/ödül oranını arayın. Kademeli çıkış uygulayın: bir kısmı ilk hedefte realize edin, kalanı
                takip eden stop ile taşıyın — böylece hem kâr realize eder hem de büyük harekete açık kalırsınız.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">8. Çeşitlendirmemek ya da Aşırı Çeşitlendirmek</h3>
              <p>
                <strong className="text-white">Ne olduğu:</strong> Tüm sermayeyi tek bir hisseye yığmak (yetersiz
                çeşitlendirme) ya da tam tersine, takip edemeyeceği kadar çok sayıda, örneğin 40 farklı varlığa
                dağıtmak (aşırı çeşitlendirme).
              </p>
              <p className="mt-3">
                <strong className="text-white">Neden zararlı:</strong> Tek varlığa yüklenmek, o varlığa özgü
                bir kötü haberin tüm portföyü çökertmesi riskini doğurur. Aşırı çeşitlendirme ise iki sorun
                getirir: hiçbir pozisyonu doğru dürüst takip edemezsiniz ve en iyi fikirleriniz, vasat
                pozisyonların kalabalığı içinde getiri etkisini kaybeder. KCHOL gibi tek bir hisseye yüzde 80
                bağlanmak da, 40 hisseye yüzde 2,5'er dağıtmak da yönetilemez.
              </p>
              <p className="mt-3">
                <strong className="text-white">Nasıl düzeltilir:</strong> Dengeyi arayın. Bireysel bir
                yatırımcı için genelde 8–15 farklı varlık, hem riski makul biçimde dağıtır hem de her pozisyonu
                takip edilebilir tutar. Aynı sektörde yoğunlaşmaktan kaçının; farklı sektörlere ve gerekirse
                farklı varlık sınıflarına yayılın.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">9. Başkasının Pozisyonunu Taklit Etmek</h3>
              <p>
                <strong className="text-white">Ne olduğu:</strong> Sosyal medyada ya da forumlarda paylaşılan
                bir pozisyonu, gerekçesini ve şartlarını bilmeden, birebir kopyalamak.
              </p>
              <p className="mt-3">
                <strong className="text-white">Neden zararlı:</strong> Taklit ettiğiniz kişinin giriş fiyatı,
                zaman dilimi, pozisyon büyüklüğü ve risk toleransı sizinkinden farklıdır. O kişi pozisyondan
                çıktığında bunu size bildirmek zorunda değildir; siz hâlâ içerideyken o çoktan satmış olabilir.
                Ayrıca paylaşılan pozisyonların bir kısmı, fiyatı yukarı çekmek için yapılan bilinçli bir
                yönlendirme de olabilir.
              </p>
              <p className="mt-3">
                <strong className="text-white">Nasıl düzeltilir:</strong> Başkasının fikrini bir araştırma
                başlangıcı olarak kullanın, kopyalanacak bir emir olarak değil. Bir pozisyona ancak kendi
                analiziniz onu doğruladığında ve kendi planınıza uyduğunda girin. Sorumluluğun tamamı sizdedir;
                kazanç da kayıp da size aittir.
              </p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">10. Duygusal / İntikam İşlemi</h3>
              <p>
                <strong className="text-white">Ne olduğu:</strong> Bir kaybın hemen ardından, parayı "geri
                kazanma" hırsıyla, plansız ve genelde daha büyük bir pozisyonla aceleyle yeni bir işlem açmak.
                Buna intikam işlemi (revenge trading) denir.
              </p>
              <p className="mt-3">
                <strong className="text-white">Neden zararlı:</strong> İntikam işlemi, kararın akıl yerine öfke
                ve hayal kırıklığıyla verildiği andır. Yatırımcı kaybı telafi etmek için riski artırır, stop
                kullanmaz, kötü bir setup'a girer; sonuç genellikle ilk kaybın çok daha büyüğüdür. Bir kötü
                işlem, kontrol edilmezse bir kötü güne, hatta bir kötü haftaya dönüşür.
              </p>
              <p className="mt-3">
                <strong className="text-white">Nasıl düzeltilir:</strong> Belirgin bir kayıptan sonra masadan
                kalkın. Kendinize bir kural koyun: "Üst üste iki stop yersem o gün işlem yapmam." Kayıp,
                sistemin doğal bir parçasıdır; onu kişisel bir hakaret gibi değil, bir maliyet kalemi gibi
                görün. Piyasa size karşı bir şey hissetmez; sizin de ona karşı hissetmemeniz gerekir.
              </p>
            </section>

            <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                <AlertTriangle className="h-4 w-4" />
                Önemli Not
              </h4>
              <p className="text-sm leading-6">
                Bu hataların en tehlikelisi tek başına değil, birlikte ortaya çıktıklarındadır. Tipik yıkım
                zinciri şöyledir: FOMO ile tepeden alım, stop kullanmama, düşüşte bilinçsiz averaj ve son
                olarak intikam işlemi. Tek bir hatayı fark edip durdurmak, çoğu zaman zincirin tamamını kırar.
              </p>
            </div>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Özet Kontrol Listesi</h2>
              <p>
                Her işlem öncesinde aşağıdaki soruları kendinize sorun. Hepsine net "evet" diyemiyorsanız,
                pozisyon açmadan önce durup düşünün:
              </p>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li><strong className="text-white">Stop-loss seviyem belli mi?</strong> Pozisyonu açmadan önce zararı keseceğim fiyatı yazdım mı?</li>
                <li><strong className="text-white">Bu işlemde ne kadar kaybedebilirim?</strong> Riskim sermayemin yüzde 1–2'sini aşmıyor mu?</li>
                <li><strong className="text-white">Kaldıraç kullanıyorsam makul mü?</strong> Geçici bir dalgalanma beni likide eder mi?</li>
                <li><strong className="text-white">Bu varlığı neden alıyorum?</strong> Kendi araştırmama mı, yoksa kulaktan dolma bilgiye mi dayanıyor?</li>
                <li><strong className="text-white">FOMO etkisinde miyim?</strong> Fiyat coştuğu için mi, yoksa planım tetiklendiği için mi giriyorum?</li>
                <li><strong className="text-white">Risk/ödül oranım en az 2:1 mi?</strong> Hedefim, riskimin en az iki katı mı?</li>
                <li><strong className="text-white">Çıkış planım yazılı mı?</strong> Kâr ve zarar durumunda ne yapacağımı önceden belirledim mi?</li>
                <li><strong className="text-white">Portföyüm dengeli mi?</strong> Tek varlığa aşırı yüklenmiş ya da takip edemeyecek kadar dağıtmış değil miyim?</li>
                <li><strong className="text-white">Bu işlem benim kararım mı?</strong> Başkasının pozisyonunu mu taklit ediyorum?</li>
                <li><strong className="text-white">Sakin miyim?</strong> Son kaybın öfkesiyle, intikam amaçlı işlem açmıyorum, değil mi?</li>
              </ol>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/trade-plani" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Trade Planı Oluşturma <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/risk-yonetimi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Risk Yönetimi <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/trade-plani" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Önceki: Trade Planı Oluşturma
            </Link>
            <Link to="/egitim/yatirim-stratejisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Yatırım Stratejisi Oluşturma <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
