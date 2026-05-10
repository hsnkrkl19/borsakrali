import { Link } from 'react-router-dom'
import { Calculator, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'
import BrandMark from '../../components/BrandMark'

export default function BilancoOkuma() {
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
            <span className="text-gray-300">Bilanco Okuma</span>
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
              Bilanco Okuma Kilavuzu: Aktif, Pasif, Ozkaynak
            </h1>
            <p className="text-sm text-gray-500">10 Mayis 2026 — yaklasik 11 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              Bilanco, bir sirketin belirli bir tarihteki mali durumunu gosteren rapordur. Sirketin neye sahip
              oldugunu (varliklarini), kime borclu oldugunu ve sahiplerine ne kadar pay dustugunu tek bir
              tabloda ozetler. Hisse senedi yatirimcisi icin bilanco okumak, bir sirketin saglikli olup
              olmadigini anlamanin ilk adimidir. Bu yazida bilanconun bolumlerini, temel esitligi, onemli
              oranlari ve KAP uzerinden bilanco okumayi adim adim ele alacagiz.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bilanco Nedir?</h2>
              <p>
                Bilanco, muhasebenin ucayakli temel raporlarindan biridir; digerleri gelir tablosu ve nakit
                akim tablosudur. Bilanco bir donem (ceyrek veya yil) icindeki hareketleri degil; bir tarihte
                (genelde donem sonu) sirketin durumunu gosterir. Mart sonu, Haziran sonu, Eylul sonu ve Aralik
                sonu Borsa Istanbul sirketleri icin standart bilanco tarihleridir.
              </p>
              <p className="mt-3">
                Halka acik sirketler bilancolarini Kamuyu Aydinlatma Platformu (KAP) uzerinden yayimlamak
                zorundadir. Bu yuzden THYAO, KCHOL, AKBNK ya da SAHOL gibi sirketlerin bilancolari herkese
                acik olarak kap.org.tr adresinde bulunabilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bilanco Esitligi</h2>
              <p>Tum bilancolarin temelinde su esitlik vardir.</p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`Aktifler = Pasifler + Ozkaynaklar

Bir sirketin sahip oldugu her sey,
ya bir borclanma ile ya da pay sahiplerinin
koydugu sermaye ile finanse edilmistir.`}
              </pre>
              <p className="mt-3">
                Bu esitlik bilancoyu basina kadar kontrollu yapar. Eger bir kalemi ekledikten sonra esitlik
                bozuluyorsa, ya bir borc ya da bir gelir kalemi atlanmistir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">1. Aktifler (Varliklar)</h2>
              <p>Aktifler ikiye ayrilir.</p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">a) Donen Varliklar</h3>
              <p>
                Bir yil icinde nakde donmesi beklenen varliklardir. Genel kalemler:
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li><strong className="text-white">Nakit ve nakit benzerleri:</strong> Kasadaki para, banka mevduatlari.</li>
                <li><strong className="text-white">Ticari alacaklar:</strong> Musterilerin sirkete olan kisa vadeli borclari.</li>
                <li><strong className="text-white">Stoklar:</strong> Henuz satilmamis hammadde, yari mamul ve mamul.</li>
                <li><strong className="text-white">Diger donen varliklar:</strong> Pesin odenmis giderler, KDV alacaklari vb.</li>
              </ul>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">b) Duran Varliklar</h3>
              <p>Bir yildan uzun surede nakde donmesi beklenen veya isletmede uzun sure kullanilan varliklardir.</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li><strong className="text-white">Maddi duran varliklar:</strong> Bina, makine, tasit, arazi.</li>
                <li><strong className="text-white">Maddi olmayan duran varliklar:</strong> Markalar, lisanslar, yazilim.</li>
                <li><strong className="text-white">Yatirim amacli gayrimenkuller</strong> ve <strong className="text-white">istirakler.</strong></li>
                <li><strong className="text-white">Ertelenmis vergi varligi</strong>, uzun vadeli alacaklar vb.</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">2. Pasifler (Yabanci Kaynaklar)</h2>
              <p>Sirketin ucuncu taraflara borclari pasiflerde gosterilir. Aynen aktifler gibi vade bazinda ikiye ayrilir.</p>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">a) Kisa Vadeli Yukumlulukler</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li><strong className="text-white">Ticari borclar:</strong> Tedarikcilere odenecek tutarlar.</li>
                <li><strong className="text-white">Kisa vadeli finansal borclar:</strong> Bankalardan alinan 1 yil icinde geri odenecek krediler.</li>
                <li><strong className="text-white">Personele borclar, vergi borclari, ertelenen gelirler.</strong></li>
              </ul>

              <h3 className="mb-2 mt-4 text-lg font-semibold text-gold-200">b) Uzun Vadeli Yukumlulukler</h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-6">
                <li><strong className="text-white">Uzun vadeli finansal borclar:</strong> 1 yildan uzun vadeli krediler ve tahviller.</li>
                <li><strong className="text-white">Kidem tazminati karsiliklari, ertelenmis vergi yukumlulukleri.</strong></li>
              </ul>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  Ipucu
                </h4>
                <p className="text-sm leading-6">
                  Kisa vadeli borclarin donen varliklara orani 1'in altindaysa sirket, kisa vadeli borclarini
                  cevirmekte zorlanabilir. Bu carpan, "cari oran" olarak adlandirilir ve likidite analizinin
                  ilk gostergesidir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">3. Ozkaynaklar</h2>
              <p>
                Ozkaynak, hissedarlarin sirket uzerindeki net hakkidir. Su kalemlerden olusur:
              </p>
              <ul className="mt-3 list-disc space-y-1.5 pl-6">
                <li><strong className="text-white">Odenmis sermaye:</strong> Hissedarlarin sirkete koyduklari sermaye.</li>
                <li><strong className="text-white">Sermaye yedekleri:</strong> Halka arz primleri, hisse senedi ihrac primleri.</li>
                <li><strong className="text-white">Kar yedekleri:</strong> Yasal yedek akce ve diger yedekler.</li>
                <li><strong className="text-white">Gecmis yil karlari:</strong> Onceki yillardan birikmis dagitilmamis karlar.</li>
                <li><strong className="text-white">Donem net kari/zarari:</strong> Cari donemde elde edilen sonuc.</li>
              </ul>
              <p className="mt-3">
                Ozkaynaklarin uzun yillar icinde duzgun bir sekilde artmasi, sirketin kar uretip bunu
                buyumeye/yedek akceye yansittigini gosterir. Tersine, ozkaynaklarin gerilemesi ya zarar ya da
                yuksek temettu dagitimi anlamina gelir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Onemli Bilanco Oranlari</h2>
              <p>
                Bilanco kalemleri arasindaki oranlar, sirketin saglik durumu hakkinda hizli bir okuma sunar.
                En cok kullanilan oranlar:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Cari Oran:</strong> Donen Varliklar / Kisa Vadeli Yukumlulukler.
                  1.5-2 araligi saglikli kabul edilir.
                </li>
                <li>
                  <strong className="text-white">Asit Test (Quick Ratio):</strong> (Donen Varliklar - Stoklar) /
                  Kisa Vadeli Yukumlulukler. 1'in uzeri tercih edilir.
                </li>
                <li>
                  <strong className="text-white">Borc/Ozkaynak Orani:</strong> Toplam Borc / Ozkaynak. Sektor
                  ortalamasinin uzerinde olmasi risk gostergesidir.
                </li>
                <li>
                  <strong className="text-white">Net Borc:</strong> Toplam Finansal Borc - Nakit ve Benzerleri.
                  Negatifse sirket nakit fazlasi ile calisiyor demektir.
                </li>
                <li>
                  <strong className="text-white">PD/DD (Piyasa Degeri / Defter Degeri):</strong> Hissenin
                  piyasada oldugu fiyatla bilancodaki ozkaynak basina degeri arasindaki oran. 1'in altinda
                  defterinin altinda islem gormesi anlamina gelir.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Pratik Ornek</h2>
              <p>
                Bir holding ornegi uzerinden gidelim. Diyelim KCHOL'un belirli bir donem bilancosunda donen
                varliklar 380 milyar TL, kisa vadeli yukumlulukler 250 milyar TL, ozkaynaklar 320 milyar TL ve
                toplam borc 480 milyar TL olsun.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Cari Oran = 380 / 250 = 1.52 (saglikli)</li>
                <li>Borc/Ozkaynak = 480 / 320 = 1.5 (sektor ortalamasi olculmeli)</li>
                <li>Aktif Toplami = Pasif + Ozkaynak = 480 + 320 = 800 milyar TL</li>
              </ul>
              <p className="mt-3">
                Bu rakamlar tek baslarina anlam ifade etmez; ayni sirketin gecmis donemleri ve sektorun ayni
                buyukluklerdeki rakipleri ile karsilastirilarak yorumlanir. Ornegin holding sektorunde KCHOL
                ve SAHOL'un benzer rasyolar tasimasi normaldir; ancak SISE veya TUPRS gibi farkli sektordeki
                sirketlerle dogrudan karsilastirma yaniltici olur.
              </p>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Onemli Not
                </h4>
                <p className="text-sm leading-6">
                  Yuksek enflasyon donemlerinde 2024 yilindan itibaren TMS 29 Enflasyon Muhasebesi uygulanmaya
                  baslandi. Bu durum bilanco kalemlerinin reel olarak duzeltilmesi anlamina gelir; nominal
                  rakamlarla yapilan karsilastirmalar yanilticidir. Karsilastirmali yillik analizlerde
                  enflasyon duzeltilmis verilere bakmak sart olmustur.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Konsolide ve Solo Bilanco Farki</h2>
              <p>
                Bir holding sirketin (ornegin KCHOL veya SAHOL) iki tur bilancosu vardir. Solo bilanco yalnizca
                ana sirketin kalemlerini gosterir. Konsolide bilanco ise bagli ortaklik ve istiraklerin
                tamaminin oransal birlestirmesini sunar.
              </p>
              <p className="mt-3">
                Yatirimci icin konsolide bilanco temel referans kaynagidir; cunku holding yapida ana sirketin
                gercek mali resmi bagli ortakliklarinin toplaminda gizlidir. Solo bilancoya bakmak yanlis
                degerlendirmeye yol acabilir. Sektorde tek faaliyet alani olan sirketlerde (ornegin TUPRS gibi)
                solo ve konsolide bilanco arasindaki fark sinirlidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Banka Bilancosunun Farklari</h2>
              <p>
                Bankalarin bilancolari, sanayi ve hizmet sirketlerinden yapisal olarak farklidir. AKBNK,
                GARAN, ISCTR gibi bankalarin bilancosunda donen-duran ayrimi yerine; aktif tarafta krediler,
                menkul kiymetler portfoyu ve nakit; pasif tarafta mevduat, yurt disi borclanmalar ve diger
                bankalara olan borclar yer alir.
              </p>
              <p className="mt-3">Banka bilancosunda izlenen onemli rasyolar:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Sermaye Yeterlilik Orani (SYR):</strong> Bankanin oz
                  varligi ile risk agirlikli aktifler orani. BDDK %12 yasal, %8 minimumdur.
                </li>
                <li>
                  <strong className="text-white">Takipteki Kredi Orani (NPL):</strong> Geri donmeyen
                  kredilerin toplam kredilere orani. Dustugu donemler banka karliligini destekler.
                </li>
                <li>
                  <strong className="text-white">Net Faiz Marji (NIM):</strong> Faiz geliri ile faiz gideri
                  arasindaki fark. Banka karliliginin temel gostergesidir.
                </li>
                <li>
                  <strong className="text-white">Mevduat/Kredi Orani:</strong> Bankanin fonlama yapisini
                  gosterir. 1 civari saglikli, 1.2 uzeri risk olusturabilir.
                </li>
              </ul>
              <p className="mt-3">
                Bu nedenle banka hisselerini analiz ederken sanayi sirketleri icin kullanilan klasik oranlari
                (cari oran, asit test) uygulamak yaniltici olur. Banka analizinin kendine ozgu cercevesi
                vardir ve BDDK aylik bulteni bunun temel kaynagidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Kar Dagitimi ve Yedek Akce</h2>
              <p>
                Bilanco okumanin onemli bir parcasi, sirketin kar dagitim politikasini anlamaktir. Yasal yedek
                akcenin oturmasi sonrasi sirket; karlarini ya temettu olarak dagitir, ya bunyede tutar
                (gecmis yil karlari) ya da bedelsiz sermaye artirimina cevirir.
              </p>
              <p className="mt-3">
                Duzenli temettu dagitan sirketler (TUPRS, TTRAK, TOASO gibi yillarda gecmiste temettu odeyen
                isimler) genelde olgun is modelinde yer alir. Yuksek temettu nakit cikisina yol acar; bu
                yuzden sonraki donem bilancosunda nakit kalemi azalmis gozukur. Bedelsiz sermaye artirimi
                hisse adedini arttirir ancak ozkaynaklarin toplam tutari degismez; sadece hisse basina deger
                yeniden hesaplanir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bilanco Yorumlama Sirasi</h2>
              <p>
                Bilanco okumak metodolojik bir is; baska bir deyisle alistigimiz bir sira dahilinde
                yapilirsa anlam kazanir. Onerilen sira:
              </p>
              <ol className="mt-3 list-decimal space-y-2 pl-6">
                <li>Toplam aktif buyuklugune bakin: gecen yila gore degisim oran neyse, makul mu?</li>
                <li>Net borc pozisyonunu hesaplayin: nakit fazlasi mi, borc fazlasi mi?</li>
                <li>Ozkaynaklarin gecmis donemlerle karsilastirmasini yapin: gerileyip gerilemedigine bakin.</li>
                <li>Donen varlik / kisa vadeli borc oranini cikarin: likidite saglikli mi?</li>
                <li>Alacak ve stoklarin satislardan hizli buyuyup buyumedigine bakin.</li>
                <li>Dipnotlari okuyun: rehinli varliklar, taahhutler, davalar varsa not edin.</li>
              </ol>
              <p className="mt-3">
                Bu rutini her bilanco icin uyguladiginizda, kisa surede sirketin "saglikli/zayif" oldugunu
                tek bakista anlama becerisi gelisir. Borsa Krali AlgoritmaPerformans ve TemelAnalizAI
                ekranlari bu islemi otomatik bir filtreden gecirerek sundugu icin manuel kontrol surecini
                kisaltir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Bilancoyu Okurken Dikkat Edilecekler</h2>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>Konsolide bilancoya bakin. Tek sirketin solo bilancosu, holding seviyesinde yaniltici olabilir.</li>
                <li>Net borc ve nakit pozisyonunu mutlaka kontrol edin. Yuksek nakit, faiz gelirine donusur.</li>
                <li>Stoklarin hizli sismesi, satislardaki yavaslamayi habercileyebilir.</li>
                <li>Ticari alacaklarin satislardan daha hizli buyumesi tahsilat sorunu isaretidir.</li>
                <li>Dipnotlari mutlaka okuyun. Rehinli varliklar, devam eden davalar ve ana sirket islemleri burada bulunur.</li>
              </ul>
              <p className="mt-3">
                Borsa Krali platformundaki Bilanco, Gelir Tablosu ve Oranlar sayfalari KAP'tan gelen verileri
                gorsel ve karsilastirmali bicimde sunar. Bilancoya destek olarak{' '}
                <Link to="/egitim/bist100-rehberi" className="text-gold-400 underline-offset-2 hover:underline">
                  BIST 100 Rehberi
                </Link>{' '}
                yazimizdaki sektor dagilimini ve{' '}
                <Link to="/egitim/yatirim-stratejisi" className="text-gold-400 underline-offset-2 hover:underline">
                  Yatirim Stratejisi
                </Link>{' '}
                yazimizdaki secim kriterlerini de inceleyebilirsiniz.
              </p>
            </section>

            <section className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Bu makaleyle alakali</h2>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/egitim/bist100-rehberi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    BIST 100 Endeksi: Hesaplama, Hisseler, Tarih <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/yatirim-stratejisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Yatirim Stratejisi Olusturma: 5 Adim <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    EMA, MACD, RSI: 3 Temel Gosterge ve Yorumu <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Onceki: EMA, MACD, RSI
            </Link>
            <Link to="/egitim/destek-direnc" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: Destek ve Direnc <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
