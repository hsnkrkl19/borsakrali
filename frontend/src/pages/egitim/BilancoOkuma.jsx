import { Link } from 'react-router-dom'
import { Calculator, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'

export default function BilancoOkuma() {
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
            <span className="text-gray-300">Bilanço Okuma</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Calculator className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                Temel
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              Bilanço Okuma Kılavuzu: Aktif, Pasif, Özkaynak
            </h1>
            <p className="text-sm text-gray-500">10 Mayıs 2026 — yaklaşık 11 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Bilanço, bir şirketin belirli bir tarihteki mali durumunu gösteren rapordur. Şirketin neye sahip
              olduğunu (varlıklarını), kime borçlu olduğunu ve sahiplerine ne kadar pay düştüğünü tek bir
              tabloda özetler. Hisse senedi yatırımcısı için bilanço okumak, bir şirketin sağlıklı olup
              olmadığını anlamanın ilk adımıdır. Bu yazıda bilançonun bölümlerini, temel eşitliği, önemli
              oranları ve KAP üzerinden bilanço okumayı adım adım ele alacağız.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bilanço Nedir?</h2>
              <p>
                Bilanço, muhasebenin üçayaklı temel raporlarından biridir; diğerleri gelir tablosu ve nakit
                akım tablosudur. Bilanço bir dönem (çeyrek veya yıl) içindeki hareketleri değil; bir tarihte
                (genelde dönem sonu) şirketin durumunu gösterir. Mart sonu, Haziran sonu, Eylül sonu ve Aralık
                sonu Borsa İstanbul şirketleri için standart bilanço tarihleridir.
              </p>
              <p className="mt-3">
                Halka açık şirketler bilançolarını Kamuyu Aydınlatma Platformu (KAP) üzerinden yayımlamak
                zorundadır. Bu yüzden THYAO, KCHOL, AKBNK ya da SAHOL gibi şirketlerin bilançoları herkese
                açık olarak kap.org.tr adresinde bulunabilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bilanço Eşitliği</h2>
              <p>Tüm bilançoların temelinde şu eşitlik vardır.</p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`Aktifler = Pasifler + Özkaynaklar

Bir şirketin sahip olduğu her şey,
ya bir borçlanma ile ya da pay sahiplerinin
koyduğu sermaye ile finanse edilmiştir.`}
              </pre>
              <p className="mt-3">
                Bu eşitlik bilançoyu başına kadar kontrollü yapar. Eğer bir kalemi ekledikten sonra eşitlik
                bozuluyorsa, ya bir borç ya da bir gelir kalemi atlanmıştır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">1. Aktifler (Varlıklar)</h2>
              <p>Aktifler ikiye ayrılır.</p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">a) Dönen Varlıklar</h3>
              <p>
                Bir yıl içinde nakde dönmesi beklenen varlıklardır. Genel kalemler:
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li><strong className="text-white">Nakit ve nakit benzerleri:</strong> Kasadaki para, banka mevduatları.</li>
                <li><strong className="text-white">Ticari alacaklar:</strong> Müşterilerin şirkete olan kısa vadeli borçları.</li>
                <li><strong className="text-white">Stoklar:</strong> Henüz satılmamış hammadde, yarı mamul ve mamul.</li>
                <li><strong className="text-white">Diğer dönen varlıklar:</strong> Peşin ödenmiş giderler, KDV alacakları vb.</li>
              </ul>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">b) Duran Varlıklar</h3>
              <p>Bir yıldan uzun sürede nakde dönmesi beklenen veya işletmede uzun süre kullanılan varlıklardır.</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li><strong className="text-white">Maddi duran varlıklar:</strong> Bina, makine, taşıt, arazi.</li>
                <li><strong className="text-white">Maddi olmayan duran varlıklar:</strong> Markalar, lisanslar, yazılım.</li>
                <li><strong className="text-white">Yatırım amaçlı gayrimenkuller</strong> ve <strong className="text-white">iştirakler.</strong></li>
                <li><strong className="text-white">Ertelenmiş vergi varlığı</strong>, uzun vadeli alacaklar vb.</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">2. Pasifler (Yabancı Kaynaklar)</h2>
              <p>Şirketin üçüncü taraflara borçları pasiflerde gösterilir. Aynen aktifler gibi vade bazında ikiye ayrılır.</p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">a) Kısa Vadeli Yükümlülükler</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li><strong className="text-white">Ticari borçlar:</strong> Tedarikçilere ödenecek tutarlar.</li>
                <li><strong className="text-white">Kısa vadeli finansal borçlar:</strong> Bankalardan alınan 1 yıl içinde geri ödenecek krediler.</li>
                <li><strong className="text-white">Personele borçlar, vergi borçları, ertelenen gelirler.</strong></li>
              </ul>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">b) Uzun Vadeli Yükümlülükler</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li><strong className="text-white">Uzun vadeli finansal borçlar:</strong> 1 yıldan uzun vadeli krediler ve tahviller.</li>
                <li><strong className="text-white">Kıdem tazminatı karşılıkları, ertelenmiş vergi yükümlülükleri.</strong></li>
              </ul>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  İpucu
                </h4>
                <p className="text-sm leading-6">
                  Kısa vadeli borçların dönen varlıklara oranı 1'in altındaysa şirket, kısa vadeli borçlarını
                  çevirmekte zorlanabilir. Bu çarpan, "cari oran" olarak adlandırılır ve likidite analizinin
                  ilk göstergesidir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">3. Özkaynaklar</h2>
              <p>
                Özkaynak, hissedarların şirket üzerindeki net hakkıdır. Şu kalemlerden oluşur:
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-6">
                <li><strong className="text-white">Ödenmiş sermaye:</strong> Hissedarların şirkete koydukları sermaye.</li>
                <li><strong className="text-white">Sermaye yedekleri:</strong> Halka arz primleri, hisse senedi ihraç primleri.</li>
                <li><strong className="text-white">Kâr yedekleri:</strong> Yasal yedek akçe ve diğer yedekler.</li>
                <li><strong className="text-white">Geçmiş yıl kârları:</strong> Önceki yıllardan birikmiş dağıtılmamış kârlar.</li>
                <li><strong className="text-white">Dönem net kârı/zararı:</strong> Cari dönemde elde edilen sonuç.</li>
              </ul>
              <p className="mt-3">
                Özkaynakların uzun yıllar içinde düzgün bir şekilde artması, şirketin kâr üretip bunu
                büyümeye/yedek akçeye yansıttığını gösterir. Tersine, özkaynakların gerilemesi ya zarar ya da
                yüksek temettü dağıtımı anlamına gelir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Önemli Bilanço Oranları</h2>
              <p>
                Bilanço kalemleri arasındaki oranlar, şirketin sağlık durumu hakkında hızlı bir okuma sunar.
                En çok kullanılan oranlar:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Cari Oran:</strong> Dönen Varlıklar / Kısa Vadeli Yükümlülükler.
                  1.5-2 aralığı sağlıklı kabul edilir.
                </li>
                <li>
                  <strong className="text-white">Asit Test (Quick Ratio):</strong> (Dönen Varlıklar - Stoklar) /
                  Kısa Vadeli Yükümlülükler. 1'in üzeri tercih edilir.
                </li>
                <li>
                  <strong className="text-white">Borç/Özkaynak Oranı:</strong> Toplam Borç / Özkaynak. Sektör
                  ortalamasının üzerinde olması risk göstergesidir.
                </li>
                <li>
                  <strong className="text-white">Net Borç:</strong> Toplam Finansal Borç - Nakit ve Benzerleri.
                  Negatifse şirket nakit fazlası ile çalışıyor demektir.
                </li>
                <li>
                  <strong className="text-white">PD/DD (Piyasa Değeri / Defter Değeri):</strong> Hissenin
                  piyasada olduğu fiyatla bilançodaki özkaynak başına değeri arasındaki oran. 1'in altında
                  defterinin altında işlem görmesi anlamına gelir.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Pratik Örnek</h2>
              <p>
                Bir holding örneği üzerinden gidelim. Diyelim KCHOL'un belirli bir dönem bilançosunda dönen
                varlıklar 380 milyar TL, kısa vadeli yükümlülükler 250 milyar TL, özkaynaklar 320 milyar TL ve
                toplam borç 480 milyar TL olsun.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Cari Oran = 380 / 250 = 1.52 (sağlıklı)</li>
                <li>Borç/Özkaynak = 480 / 320 = 1.5 (sektör ortalaması ölçülmeli)</li>
                <li>Aktif Toplamı = Pasif + Özkaynak = 480 + 320 = 800 milyar TL</li>
              </ul>
              <p className="mt-3">
                Bu rakamlar tek başlarına anlam ifade etmez; aynı şirketin geçmiş dönemleri ve sektörün aynı
                büyüklüklerdeki rakipleri ile karşılaştırılarak yorumlanır. Örneğin holding sektöründe KCHOL
                ve SAHOL'un benzer rasyolar taşıması normaldir; ancak SISE veya TUPRS gibi farklı sektördeki
                şirketlerle doğrudan karşılaştırma yanıltıcı olur.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Önemli Not
                </h4>
                <p className="text-sm leading-6">
                  Yüksek enflasyon dönemlerinde 2024 yılından itibaren TMS 29 Enflasyon Muhasebesi uygulanmaya
                  başlandı. Bu durum bilanço kalemlerinin reel olarak düzeltilmesi anlamına gelir; nominal
                  rakamlarla yapılan karşılaştırmalar yanıltıcıdır. Karşılaştırmalı yıllık analizlerde
                  enflasyon düzeltilmiş verilere bakmak şart olmuştur.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Konsolide ve Solo Bilanço Farkı</h2>
              <p>
                Bir holding şirketin (örneğin KCHOL veya SAHOL) iki tür bilançosu vardır. Solo bilanço yalnızca
                ana şirketin kalemlerini gösterir. Konsolide bilanço ise bağlı ortaklık ve iştiraklerin
                tamamının oransal birleştirmesini sunar.
              </p>
              <p className="mt-3">
                Yatırımcı için konsolide bilanço temel referans kaynağıdır; çünkü holding yapıda ana şirketin
                gerçek mali resmi bağlı ortaklıklarının toplamında gizlidir. Solo bilançoya bakmak yanlış
                değerlendirmeye yol açabilir. Sektörde tek faaliyet alanı olan şirketlerde (örneğin TUPRS gibi)
                solo ve konsolide bilanço arasındaki fark sınırlıdır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Banka Bilançosunun Farklıları</h2>
              <p>
                Bankaların bilançoları, sanayi ve hizmet şirketlerinden yapısal olarak farklıdır. AKBNK,
                GARAN, ISCTR gibi bankaların bilançosunda dönen-duran ayrımı yerine; aktif tarafta krediler,
                menkul kıymetler portföyü ve nakit; pasif tarafta mevduat, yurt dışı borçlanmalar ve diğer
                bankalara olan borçlar yer alır.
              </p>
              <p className="mt-3">Banka bilançosunda izlenen önemli rasyolar:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Sermaye Yeterlilik Oranı (SYR):</strong> Bankanın öz
                  varlığı ile risk ağırlıklı aktifler oranı. BDDK %12 yasal, %8 minimumdur.
                </li>
                <li>
                  <strong className="text-white">Takipteki Kredi Oranı (NPL):</strong> Geri dönmeyen
                  kredilerin toplam kredilere oranı. Düştüğü dönemler banka kârlılığını destekler.
                </li>
                <li>
                  <strong className="text-white">Net Faiz Marjı (NIM):</strong> Faiz geliri ile faiz gideri
                  arasındaki fark. Banka kârlılığının temel göstergesidir.
                </li>
                <li>
                  <strong className="text-white">Mevduat/Kredi Oranı:</strong> Bankanın fonlama yapısını
                  gösterir. 1 civarı sağlıklı, 1.2 üzeri risk oluşturabilir.
                </li>
              </ul>
              <p className="mt-3">
                Bu nedenle banka hisselerini analiz ederken sanayi şirketleri için kullanılan klasik oranları
                (cari oran, asit test) uygulamak yanıltıcı olur. Banka analizinin kendine özgü çerçevesi
                vardır ve BDDK aylık bülteni bunun temel kaynağıdır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kâr Dağıtımı ve Yedek Akçe</h2>
              <p>
                Bilanço okumanın önemli bir parçası, şirketin kâr dağıtım politikasını anlamaktır. Yasal yedek
                akçenin oturması sonrası şirket; kârlarını ya temettü olarak dağıtır, ya bünyede tutar
                (geçmiş yıl kârları) ya da bedelsiz sermaye artırımına çevirir.
              </p>
              <p className="mt-3">
                Düzenli temettü dağıtan şirketler (TUPRS, TTRAK, TOASO gibi yıllarda geçmişte temettü ödeyen
                isimler) genelde olgun iş modelinde yer alır. Yüksek temettü nakit çıkışına yol açar; bu
                yüzden sonraki dönem bilançosunda nakit kalemi azalmış gözükür. Bedelsiz sermaye artırımı
                hisse adedini artırır ancak özkaynakların toplam tutarı değişmez; sadece hisse başına değer
                yeniden hesaplanır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bilanço Yorumlama Sırası</h2>
              <p>
                Bilanço okumak metodolojik bir iş; başka bir deyişle alıştığımız bir sıra dahilinde
                yapılırsa anlam kazanır. Önerilen sıra:
              </p>
              <ol className="mt-3 list-decimal space-y-2 pl-6">
                <li>Toplam aktif büyüklüğüne bakın: geçen yıla göre değişim oran neyse, makul mu?</li>
                <li>Net borç pozisyonunu hesaplayın: nakit fazlası mı, borç fazlası mı?</li>
                <li>Özkaynakların geçmiş dönemlerle karşılaştırmasını yapın: gerileyip gerilemediğine bakın.</li>
                <li>Dönen varlık / kısa vadeli borç oranını çıkarın: likidite sağlıklı mı?</li>
                <li>Alacak ve stokların satışlardan hızlı büyüyüp büyümediğine bakın.</li>
                <li>Dipnotları okuyun: rehinli varlıklar, taahhütler, davalar varsa not edin.</li>
              </ol>
              <p className="mt-3">
                Bu rutini her bilanço için uyguladığınızda, kısa sürede şirketin "sağlıklı/zayıf" olduğunu
                tek bakışta anlama becerisi gelişir. Borsa Kralı AlgoritmaPerformans ve TemelAnalizAI
                ekranları bu işlemi otomatik bir filtreden geçirerek sunduğu için manuel kontrol sürecini
                kısaltır.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bilançoyu Okurken Dikkat Edilecekler</h2>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Konsolide bilançoya bakın. Tek şirketin solo bilançosu, holding seviyesinde yanıltıcı olabilir.</li>
                <li>Net borç ve nakit pozisyonunu mutlaka kontrol edin. Yüksek nakit, faiz gelirine dönüşür.</li>
                <li>Stokların hızlı şişmesi, satışlardaki yavaşlamayı haber verebilir.</li>
                <li>Ticari alacakların satışlardan daha hızlı büyümesi tahsilat sorunu işaretidir.</li>
                <li>Dipnotları mutlaka okuyun. Rehinli varlıklar, devam eden davalar ve ana şirket işlemleri burada bulunur.</li>
              </ul>
              <p className="mt-3">
                Borsa Kralı platformundaki Bilanço, Gelir Tablosu ve Oranlar sayfaları KAP'tan gelen verileri
                görsel ve karşılaştırmalı biçimde sunar. Bilançoya destek olarak{' '}
                <Link to="/egitim/bist100-rehberi" className="text-gold-400 underline-offset-2 hover:underline">
                  BIST 100 Rehberi
                </Link>{' '}
                yazımızdaki sektör dağılımını ve{' '}
                <Link to="/egitim/yatirim-stratejisi" className="text-gold-400 underline-offset-2 hover:underline">
                  Yatırım Stratejisi
                </Link>{' '}
                yazımızdaki seçim kriterlerini de inceleyebilirsiniz.
              </p>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakalı</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/bist100-rehberi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    BIST 100 Endeksi: Hesaplama, Hisseler, Tarih <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/yatirim-stratejisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Yatırım Stratejisi Oluşturma: 5 Adım <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    EMA, MACD, RSI: 3 Temel Gösterge ve Yorumu <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              </ul>
            </section>

            <p className="border-t border-white/5 pt-4 text-xs text-gray-500">
              Bu içerik yatırım tavsiyesi değildir. Yalnızca eğitim ve bilgilendirme amaçlıyla hazırlanmıştır.
              Yatırım kararlarınız için kendi araştırmanızı yapmanız ve gerekirse profesyonel destek almanız
              önerilir.
            </p>
          </article>

          <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4 text-sm">
            <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Önceki: EMA, MACD, RSI
            </Link>
            <Link to="/egitim/destek-direnc" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Destek ve Direnç <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
