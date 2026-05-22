import { Link } from 'react-router-dom'
import { Brain, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function YatirimPsikolojisi() {
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
            <span className="text-gray-300">Yatırım Psikolojisi</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Brain className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                Strateji
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Yatırım Psikolojisi: Korku, Açgözlülük ve Disiplin
            </h1>
            <p className="text-sm text-gray-500">18 Mayıs 2026 — yaklaşık 10 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Borsada uzun vadeli başarıyı belirleyen şey, çoğu yatırımcının sandığı gibi en iyi göstergeyi
              bulmak ya da en doğru hisseyi seçmek değildir. Aynı grafiğe bakan iki kişiden biri kazanırken
              diğeri kaybediyorsa, farkı yaratan analiz değil davranıştır. THYAO yüzde 8 düştüğünde panikle
              satan yatırımcı ile aynı düşüşte planına sadık kalan yatırımcı, birebir aynı bilgiye sahiptir;
              ayrıştıkları yer karar anındaki duygu durumlarıdır. Bu makalede piyasanın psikolojik döngüsünü,
              kararlarımızı sessizce çarpıtan bilişsel önyargıları ve duyguların yerine kuralları koyan
              somut alışkanlıkları işliyoruz.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Piyasanın Psikolojik Döngüsü</h2>
              <p>
                Fiyatlar matematiksel bir doğrultuda hareket etmez; milyonlarca insanın umut, korku ve
                pişmanlık duygusunun toplamını yansıtır. Bu yüzden her boğa ve ayı piyasası benzer bir
                duygusal eğriyi takip eder. Bu eğriyi tanımak, kalabalığın neresinde olduğunuzu görmenizi
                sağlar.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">İyimserlik:</strong> Fiyatlar yükselmeye başlar, ilk alıcılar temkinli biçimde pozisyon açar. Risk gerçekçi değerlendirilir.</li>
                <li><strong className="text-white">Heyecan ve coşku:</strong> Kazançlar görünür hale gelir, herkes konuşur. Coşku zirvesinde yatırımcı kendini dahi sanır; en büyük pozisyonlar tam burada, en yüksek fiyatlardan açılır.</li>
                <li><strong className="text-white">İnkâr ve endişe:</strong> İlk düşüş başlar. Yatırımcı bunu "geçici bir düzeltme" sayar, satmayı reddeder.</li>
                <li><strong className="text-white">Korku ve panik:</strong> Düşüş derinleşir, zararlar büyür. Panik satışları en dip seviyelere yakın bir noktada gerçekleşir.</li>
                <li><strong className="text-white">Umutsuzluk ve teslimiyet:</strong> Yatırımcı "bir daha borsaya bakmam" der ve genellikle tam dip bölgede satar.</li>
                <li><strong className="text-white">Toparlanma ve şüphe:</strong> Fiyatlar dipten döner ama kimse inanmaz. Akıllı para tam bu güvensizlik döneminde alım yapar.</li>
              </ul>
              <p className="mt-3">
                Bu eğrinin acımasız ironisi şudur: maksimum finansal fırsat, maksimum korku anında ortaya
                çıkar; maksimum finansal risk ise maksimum coşku anında. Duygularımız bizi tam tersini yapmaya
                iter — coşkuda alıp paniklediğimizde satarız. Döngüyü tanımak, bu doğal eğilime karşı koymanın
                ilk adımıdır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">İki Temel Duygu: Korku ve Açgözlülük</h2>
              <p>
                Piyasaları yöneten tüm karmaşık duygular nihayetinde iki ilkel dürtüye indirgenir. Açgözlülük
                kazanç ihtimaline duyulan iştahtır; korku ise kayıp ihtimaline duyulan kaçıştır. İkisi de
                hayatta kalma içgüdüsünden gelir ve ikisi de borsada yanlış zamanda devreye girer.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">FOMO: Kaçırma Korkusu</h3>
              <p>
                FOMO (Fear Of Missing Out), bir varlık hızla yükselirken "ben de kazanmalıyım" baskısıyla
                analiz yapmadan, yüksek fiyattan alım yapma dürtüsüdür. Bir kripto para üç günde yüzde 60
                yükseldiğinde sosyal medya kazanç ekran görüntüleriyle dolar; bu ortamda soğukkanlı kalmak
                zordur. Oysa FOMO ile girilen pozisyonların ortak özelliği, hareketin sonuna yakın açılmış
                olmalarıdır. Kalabalık konuşmaya başladığında fırsatın büyük kısmı çoktan tükenmiştir.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Panik Satış</h3>
              <p>
                Panik satış, korkunun karar verme yetisini ele geçirdiği andır. GARAN bir günde yüzde 7
                düştüğünde, yatırımcı çoğu zaman şirketin gerçek değeri değiştiği için değil, ekranda gördüğü
                kırmızıya dayanamadığı için satar. Sorun şudur: panik satışı genellikle düşüşün sonuna yakın
                yapılır, çünkü herkes aynı anda korkar ve fiyatı aşağı iter. Bu, döngünün "korku" aşamasını
                bireysel düzeyde yeniden yaşamaktır.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Güçlü bir duygu hissettiğiniz anda işlem yapmayın. Kendinize basit bir kural koyun: "Alım
                  veya satım dürtüsü hissettiğimde 24 saat bekleyeceğim." Bu küçük gecikme, FOMO ile yapılan
                  alımların ve panik satışların büyük çoğunluğunu otomatik olarak engeller. Karar hâlâ
                  mantıklıysa yarın da mantıklı olacaktır.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kararlarınızı Çarpıtan Bilişsel Önyargılar</h2>
              <p>
                Beynimiz hızlı karar vermek için kısayollar kullanır. Bu kısayollar günlük hayatta işe yarar
                ama belirsizlik ve para söz konusu olduğunda sistematik hatalara yol açar. Bunlara bilişsel
                önyargı denir. Önyargıyı tamamen yok edemezsiniz; ancak adını koyduğunuzda etkisini azaltabilirsiniz.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Kayıptan Kaçınma (Loss Aversion)</h3>
              <p>
                Araştırmalar, 1.000 TL kaybetmenin verdiği acının, 1.000 TL kazanmanın verdiği mutluluğun
                yaklaşık iki katı şiddetinde olduğunu gösterir. Bu asimetri yüzünden yatırımcı zarardaki bir
                pozisyonu satmayı reddeder — satış, kayıbı "gerçek" kılacaktır. Sonuçta kazançlar erken
                kapatılır, kayıplar ise umutla taşınır. Bu, kârlı bir trade'i bozan en yaygın davranıştır.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Doğrulama Önyargısı (Confirmation Bias)</h3>
              <p>
                ASELS aldıktan sonra yalnızca hisseyi öven yorumları okur, olumsuz haberleri "manipülasyon"
                diye geçiştiririz. Beyin, mevcut pozisyonunu destekleyen bilgiyi arar ve çelişen bilgiyi
                görmezden gelir. Bunun panzehiri, kendinize bilinçli olarak "Bu pozisyonda yanılıyor olsaydım
                bunu nereden anlardım?" sorusunu sormaktır.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Çıpalama (Anchoring)</h3>
              <p>
                Bir hisseyi 100 TL'den aldıysanız, zihniniz bu sayıya çıpalanır. Fiyat 70 TL'ye düştüğünde
                "100 TL'ye dönerse satarım" diye düşünürsünüz; oysa şirketin gerçek değeri artık tamamen
                farklı olabilir. Önemli olan sizin maliyetiniz değil, varlığın bugünkü adil değeri ve ileriye
                dönük potansiyelidir. Piyasa sizin alış fiyatınızı bilmez ve umursamaz.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Batık Maliyet Yanılgısı (Sunk Cost Fallacy)</h3>
              <p>
                "Bu kadar bekledim, şimdi satarsam emeğim boşa gider" düşüncesi batık maliyet yanılgısıdır.
                Geçmişte harcadığınız para ve zaman geri gelmez; bu yüzden gelecek kararını etkilememelidir.
                Doğru soru "Bugün elimde nakit olsaydı bu hisseyi yine alır mıydım?" sorusudur. Cevap hayırsa,
                onu ne kadar süredir taşıdığınızın hiçbir önemi yoktur.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Sürü Psikolojisi (Herding)</h3>
              <p>
                İnsan, kalabalığın yaptığını yapmaya programlıdır; tek başına yanılmaktansa herkesle birlikte
                yanılmak daha az tehdit edici hissettirir. Ancak borsada kalabalık zirvelerde en kalabalık,
                diplerde en seyrek hâldedir. Herkesin aynı hisseden bahsettiği an, bağımsız düşünmenin en
                değerli olduğu andır.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Aşırı Güven (Overconfidence)</h3>
              <p>
                Birkaç başarılı işlem üst üste geldiğinde yatırımcı bunu beceriye, başarısızlıkları ise şansa
                bağlama eğilimine girer. Aşırı güven, pozisyon büyüklüğünün gereksiz yere artmasına, stop-loss
                kullanmamaya ve kaldıracı kötüye kullanmaya yol açar. Boğa piyasasında herkes kendini başarılı
                sanır; gerçek beceri ancak ayı piyasasında ortaya çıkar.
              </p>
              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">Son Olay Önyargısı (Recency Bias)</h3>
              <p>
                Son yaşanan olaya gereğinden fazla ağırlık vermektir. Üç aydır yükselen bir piyasada yatırımcı
                yükselişin sonsuza kadar süreceğine inanır; sert bir düşüşten sonra ise toparlanmanın asla
                gelmeyeceğini düşünür. Oysa piyasalar döngüseldir ve hiçbir trend kalıcı değildir.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Önyargılar zekânızla ilgili değildir; en deneyimli yatırımcılar bile bunlardan etkilenir.
                  "Ben bunlara kanmam" demek, doğrulama önyargısının ta kendisidir. Tek gerçekçi savunma,
                  duygulara güvenmek yerine önceden yazılmış kurallara uymaktır.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Korku-Açgözlülük Endeksi Nasıl Okunur</h2>
              <p>
                Korku-Açgözlülük Endeksi (Fear &amp; Greed Index), piyasanın genel duygu durumunu 0 ile 100
                arasında bir sayıya indirger. Volatilite, momentum, işlem hacmi, güvenli liman talebi gibi
                bileşenleri birleştirerek hesaplanır. 0'a yakın değerler "aşırı korku", 100'e yakın değerler
                "aşırı açgözlülük" anlamına gelir.
              </p>
              <p className="mt-3">
                Bu endeksin değeri, kullanım biçiminde gizlidir. Bunu bir zamanlama sinyali değil, bir
                ters-gösterge ve refleks dengeleyici olarak okuyun. Endeks 10–20 bandında "aşırı korku"
                gösterdiğinde, kalabalık paniktedir ve fiyatlar genelde değerinin altındadır; bu, alımları
                gözden geçirmek için makul bir dönemdir. Endeks 80–90 bandında "aşırı açgözlülük" gösterdiğinde
                ise iyimserlik tavan yapmıştır ve yeni risk almak için en kötü zamandır. Efsane yatırımcı
                Warren Buffett'ın özdeyişi bu mantığı özetler: "Başkaları açgözlüyken korkulu, başkaları
                korkuluyken açgözlü olun." Endeks tek başına alım-satım emri vermez; size sadece kalabalığın
                hangi duygu içinde olduğunu ve sizin bu duyguya kapılıp kapılmadığınızı sorgulatır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Duygusal Kararların Somut Maliyeti</h2>
              <p>
                "Duygularıma kapıldım" cümlesi kulağa zararsız gelir; oysa bilançoda net bir karşılığı vardır.
                Somut bir örnekle bakalım. 100.000 TL sermayesi olan iki yatırımcı düşünün. Her ikisi de aynı
                hisseyi alıyor.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li><strong className="text-white">Disiplinli yatırımcı:</strong> Girişte yüzde 8 stop-loss belirler. Hisse düşer, stop tetiklenir, 8.000 TL kayıpla çıkar. Sermayesi 92.000 TL'dir ve bir sonraki fırsata hazırdır.</li>
                <li><strong className="text-white">Duygusal yatırımcı:</strong> Stop koymamıştır; kayıptan kaçınma yüzünden satamaz. Hisse yüzde 35 düşer. Sonunda dayanamayıp tam dipte satar, 35.000 TL kaybeder.</li>
              </ul>
              <p className="mt-3">
                Aradaki fark 27.000 TL'dir ve bu fark analizden değil, davranıştan kaynaklanmıştır. Dahası,
                matematik kayıpların aleyhinizedir: yüzde 35 kaybeden bir portföyün başa baş gelmesi için
                yüzde 54 kazanması gerekir, çünkü kalan 65.000 TL'nin 100.000 TL'ye ulaşması bu oranı
                gerektirir. Yüzde 8'lik bir kayıptan dönmek için ise yalnızca yüzde 8,7 kazanç yeterlidir.
                Disiplin, sadece para kaybını değil, telafi için gereken çabayı da küçültür.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">İşlem Günlüğü Tutmanın Faydası</h2>
              <p>
                Disiplini ölçülebilir kılan tek araç işlem günlüğüdür. Her trade için kararı verdiğiniz anda
                — sonradan değil — şu bilgileri yazın: hangi varlık, giriş fiyatı, neden girdiniz (hangi
                kurala uydunuz), stop-loss seviyesi, hedef seviye, pozisyon büyüklüğü ve o anki ruh haliniz.
                İşlem kapandığında sonucu ve "plana uydum mu" notunu ekleyin.
              </p>
              <p className="mt-3">
                Günlüğün gücü, duyguyu veriye dönüştürmesidir. Birkaç ay sonra geriye baktığınızda örüntüleri
                çıplak gözle görürsünüz: belki kayıplarınızın çoğu "sıkıldım, bir şey yapayım" notuyla açılmış
                işlemlerden geliyordur; belki en iyi getirileriniz sabırla beklenmiş kurallı girişlerden
                gelmiştir. Hafıza seçicidir ve sizi kandırır; yazılı kayıt kandırmaz. Günlük, ayrıca bir
                hesap verebilirlik mekanizmasıdır — "bu işlemi günlüğe ne yazarak gerekçelendireceğim?"
                sorusu, gerekçesiz işlemleri daha açılmadan eler.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Disiplini Kuran Alışkanlıklar: Yol Haritası</h2>
              <p>
                Disiplin bir karakter özelliği değil, bir sistemdir. Aşağıdaki adımlar duyguların yerine
                tekrarlanabilir kuralları koyar:
              </p>
              <ol className="mt-2 list-decimal space-y-2 pl-6">
                <li><strong className="text-white">İşlemden önce yazılı plan yapın.</strong> Giriş, stop-loss ve hedef seviyelerini pozisyonu açmadan önce belirleyin. Plansız işlem, duygulara açık davetiyedir.</li>
                <li><strong className="text-white">Her pozisyonda mutlaka stop-loss kullanın.</strong> Kaybı önceden tanımlamak, panik anında karar vermek zorunda kalmamanızı sağlar.</li>
                <li><strong className="text-white">Pozisyon başına riski sınırlayın.</strong> Tek bir işlemde sermayenizin yüzde 1–2'sinden fazlasını riske atmayın; böylece hiçbir kayıp sizi oyundan çıkaramaz.</li>
                <li><strong className="text-white">Güçlü duygu hissettiğinizde bekleme kuralı uygulayın.</strong> 24 saatlik gecikme, FOMO ve panik kaynaklı işlemleri büyük ölçüde eler.</li>
                <li><strong className="text-white">Ekran başında geçirdiğiniz süreyi kısıtlayın.</strong> Sürekli fiyat izlemek, gereksiz işlem dürtüsünü ve duygusal yorgunluğu artırır.</li>
                <li><strong className="text-white">İşlem günlüğü tutun ve düzenli okuyun.</strong> Ayda bir günlüğünüzü gözden geçirip tekrarlayan hatalarınızı belirleyin.</li>
                <li><strong className="text-white">Sonucu değil süreci değerlendirin.</strong> İyi bir karar kötü sonuç verebilir; kötü bir karar şansa kazanabilir. Kurala uyup uymadığınızı sorgulayın, sadece kâr-zarara bakmayın.</li>
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
                  <Link to="/egitim/yatirim-hatalari" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Yatırımda En Sık Yapılan 10 Hata <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/trade-plani" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Trade Planı Oluşturma <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
