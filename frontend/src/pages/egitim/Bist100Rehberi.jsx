import { Link } from 'react-router-dom'
import { TrendingUp, ArrowLeft, ArrowRight, Lightbulb, AlertTriangle } from 'lucide-react'
import BrandMark from '../../components/BrandMark'

export default function Bist100Rehberi() {
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
            <span className="text-gray-300">BIST 100 Rehberi</span>
          </nav>

          <div className="mb-8 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <TrendingUp className="h-5 w-5" />
              </div>
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                Temel
              </span>
            </div>
            <h1 className="text-3xl font-bold text-white md:text-4xl">
              BIST 100 Endeksi: Hesaplama, Hisseler, Tarih
            </h1>
            <p className="text-sm text-gray-500">10 Mayis 2026 — yaklasik 9 dakika okuma</p>
          </div>

          <article className="space-y-6 text-sm leading-7 text-gray-300 md:text-base md:leading-8">
            <p>
              BIST 100, Borsa Istanbul'da islem goren hisselerin en cok takip edilen gostergesidir. Hem
              yatirimcilarin gunluk piyasa havasini olcmek icin baktiklari termometre, hem de fonlarin ve
              ETF'lerin referans aldigi temel endekstir. Bu yazida endeksin nasil hesaplandigini, hangi
              kriterlere gore hisselerin endekse girdigini, donemsel revizyonlari, BIST 30 ve BIST 50 ile
              farkini ve uzun donem performansini detayli bir bicimde inceleyecegiz.
            </p>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">BIST 100 Nedir?</h2>
              <p>
                BIST 100, Borsa Istanbul Pay Piyasasi'nda islem goren ve yildiz pazarda yer alan sirketler
                arasindan, belirli kriterlere gore secilen 100 hisseyi kapsayan ana endekstir. Endeks, fiyat
                hareketinin yansisi olarak hesaplanir ve gun icinde sik araliklarla guncellenir. Yatirimcilar
                BIST 100'u; piyasanin genel yonu, fonlarin getirisi ve makro guvenin gostergesi olarak
                kullanir.
              </p>
              <p className="mt-3">
                Endeksin baz degeri 1986 yilinda 1 puana esitlenmistir. Yani BIST 100 bugun 11.000 puan
                seviyesindeyse, bu 1986'dan bu yana endeksin nominal olarak yaklasik 11.000 katina ciktigini
                gosterir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Endeksin Tarihcesi</h2>
              <p>
                Borsa Istanbul'un eski adi Istanbul Menkul Kiymetler Borsasi (IMKB) idi. 1986 yilinda kurulan
                borsa, ilk yillarinda dusuk hacimli ve sinirli sayida sirketle islem goruyordu. 1990'larin
                baslarinda yabanci yatirimci ilgisinin artmasi ile birlikte endeks hizli yukseldi; ekonomik
                krizler ve siyasi calkantilar donemlerinde sert dususler yasandi.
              </p>
              <p className="mt-3">
                2013 yilinda IMKB'nin yerini Borsa Istanbul (BIST) aldi. Endeks isimlendirmesi de bu donemde
                BIST 100, BIST 30 olarak yeniden duzenlendi. 2020 sonrasi enflasyonun yuksek seyrettigi
                donemde nominal olarak buyuk yuzdeli hareketler kaydetti; bu durum reel getiriden ziyade TL'nin
                deger kaybiyla ilgilidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">BIST 100 Nasil Hesaplanir?</h2>
              <p>
                BIST 100; fiili dolasimdaki paylarin (free-float) piyasa degerine gore agirliklandirilmis
                Laspeyres tipi bir endekstir. Yani endeksin hesabinda her hisse, sirketin halka arz orani ve
                piyasa degeri ile orantili agirliga sahiptir. Bir sirketin piyasa degeri ne kadar buyuk ve
                ne kadar fazla halka acik ise, endekste o kadar belirleyicidir.
              </p>
              <p className="mt-3">
                Genel formul su sekildedir:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/5 bg-dark-900/60 p-4 text-xs leading-6 text-gold-200 md:text-sm">
{`Endeks Degeri = (Toplam Piyasa Degeri (free-float) / Bolen) * Baz Deger

Bolen, sermaye artirimi, halka arz cikarma gibi
durumlarda endeksin sapmamasi icin guncellenir.`}
              </pre>
              <p className="mt-3">
                Bu yontemin onemli sonucu, dev sirketlerin endeks uzerinde orantisiz etkiye sahip olmasidir.
                Ornegin THYAO, KCHOL, GARAN, AKBNK gibi sirketlerin yuksek piyasa degeri ve halka aciklik
                orani sebebiyle BIST 100'un yuzunde toplam %15-25 araligindaki bir kismi sadece bu birkac
                hisseden olusur.
              </p>

              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-yellow-200">
                  <Lightbulb className="h-4 w-4" />
                  Ipucu
                </h4>
                <p className="text-sm leading-6">
                  Bir hissenin endeks agirligi yuksekse, o hissedeki gunluk fiyat hareketi BIST 100'un genel
                  yonu uzerinde belirleyici olur. Bu yuzden gunluk piyasa yorumlarinda bankalar ve holdinglerin
                  durumu mutlaka ayri ayri degerlendirilir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Endekse Hangi Hisseler Girer?</h2>
              <p>
                BIST, endeks bilesenlerini secmek icin asagidaki kriterleri esas alir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Fiili dolasim oranli piyasa degeri:</strong> Halka acik
                  kismin piyasa degeri buyuk olan sirketler one cikar.
                </li>
                <li>
                  <strong className="text-white">Likidite:</strong> Belirli bir sure boyunca yeterli gunluk
                  islem hacmi sart.
                </li>
                <li>
                  <strong className="text-white">Pazar:</strong> Yildiz pazar veya ana pazar dahilinde olmak
                  zorunlu.
                </li>
                <li>
                  <strong className="text-white">Surekli islem:</strong> Sik durdurulan veya islemden
                  kaldirilmis hisseler endekse alinmaz.
                </li>
              </ul>
              <p className="mt-3">
                Endeks bilesenleri uc ayda bir gozden gecirilir. Yeni sirketler eklenir, kriterleri
                karsilamayan sirketler cikarilir. Bu donemsel revizyonlar piyasa katilimcilari tarafindan
                yakindan izlenir, cunku endekse giren hisseye ETF ve fonlardan otomatik talep gelir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">BIST 30, BIST 50, BIST 100 Farki</h2>
              <p>
                Bu uc endeks, bir piramit gibi dusunulebilir. BIST 30 en buyuk 30 hisseyi, BIST 50 en buyuk
                50 hisseyi (BIST 30 dahil), BIST 100 ise en buyuk 100 hisseyi kapsar. Tum BIST 30 hisseleri
                ayni zamanda BIST 50 ve BIST 100 icindedir.
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">BIST 30:</strong> En likit ve buyuk sirketler. VIOP'ta endeks
                  vadelisi ve opsiyonu olan asil endekstir.
                </li>
                <li>
                  <strong className="text-white">BIST 50:</strong> BIST 30'a 20 sirket daha ekleyen genis
                  capli endeks. Yatirim fonlarinin referansi olarak kullanilir.
                </li>
                <li>
                  <strong className="text-white">BIST 100:</strong> En genis kapsam. Piyasa hakkinda en
                  saglam bir genel resim sunar.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Sektorlere Gore Dagilim</h2>
              <p>
                BIST 100'un sektorel dagilimi yillara gore degismekle birlikte; bankacilik, holding, otomotiv,
                havacilik, gida-perakende, demir-celik, savunma sanayi ve enerji genelde en agirlikli
                sektorlerdir. Banka hisselerinin (GARAN, AKBNK, ISCTR, YKBNK) tek basina endeksin %15-20
                kadarini olusturmasi nadir bir durum degildir.
              </p>
              <p className="mt-3">
                Bu nedenle, BIST 100'u yorumlarken sektor bazli alt analiz yapmak buyuk fark yaratir. Ornegin
                endeks yataya yakin gozukse de bankalar gerileyip savunma sanayi (ASELS gibi) yukseliyorsa,
                paranin sektorler arasinda dolastigi soylenebilir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Endekse Yatirim Yontemleri</h2>
              <p>
                BIST 100'e dogrudan yatirim yapmak yerine, endeksi takip eden urunler kullanmak yaygin bir
                tercihtir. Bunlar:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-white">Borsa Yatirim Fonlari (BYF / ETF):</strong> Endeksin
                  bilesimini birebir takip eden tek bir bilesik enstrumandir. Ornegin XU100 ETF urunleri.
                </li>
                <li>
                  <strong className="text-white">Endeks Fonlari:</strong> Yatirim fonu cinsinden endeks
                  takibi saglar; gunluk pay fiyatiyla alinip satilir.
                </li>
                <li>
                  <strong className="text-white">VIOP Endeks Vadelileri:</strong> BIST 30 vadeli kontrati
                  uzerinden kaldirac ile pozisyon alinabilir; ancak risk yuksektir.
                </li>
              </ul>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <h4 className="mb-1 flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="h-4 w-4" />
                  Onemli Not
                </h4>
                <p className="text-sm leading-6">
                  VIOP urunleri kaldirac iceren turev araclardir ve kucuk fiyat hareketleri buyuk kayiplara yol
                  acabilir. Bu urunler deneyimsiz yatirimcilar icin uygun degildir.
                </p>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Tarihsel Performans</h2>
              <p>
                BIST 100, uzun donemde Turk sirketlerinin reel buyumesini ve TL'nin satin alma gucunu birlikte
                yansitir. 2003-2013 doneminde dolar bazli getirisi yuksek seyrederken, 2018 sonrasi TL'deki
                deger kaybi nominal kazanci sisirmistir. Reel (enflasyondan arindirilmis) performansa bakmak,
                aldatici bir sekilde yuksek nominal getiri etkisinden uzak durmak icin onemlidir.
              </p>
              <p className="mt-3">
                Ornegin endeks bir yilda %50 yukselse de, ayni donemde TUFE %60 ise reel getiri eksidir.
                Bu yuzden ozellikle uzun vadeli yatirim degerlendirmesinde dolar veya altin bazli getiri de
                karsilastirma olarak goz onunde tutulur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Yabanci Yatirimci Payi</h2>
              <p>
                BIST 100'un fiyat hareketinde belirleyici unsurlardan biri, halka acik kismin ne kadarinin
                yabanci yatirimcilarin elinde oldugudur. MKK (Merkezi Kayit Kurulusu) tarafindan haftalik
                olarak yayinlanan veriye gore, son yillarda yabanci pay orani %30-50 arasinda dalgalanma
                gostermektedir. Yabanci yatirimcilarin aliciya gectigi donemlerde endeks reel olarak da
                guclenir; sertce satici olduklarinda dolar bazli getiri belirgin sekilde negatif olabilir.
              </p>
              <p className="mt-3">
                Bu durum, BIST 100'u sadece yerli makro veriler ile yorumlamanin yetersiz oldugunu gosterir.
                Global risk istahi, gelismekte olan ulke borsalarina yonelik fon akimi, MSCI gibi endekslerde
                Turkiye'nin agirligindaki degisiklikler endeksin uzun donem yonu uzerinde dogrudan etkilidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Endekse Giris/Cikis Etkisi</h2>
              <p>
                Bir hissenin BIST 100 endeksine girmesi, o hisseye yapisal alici taban olusturur. ETF'ler,
                endeks fonlari ve pasif yatirim araclari endekste yer alan tum hisseyi otomatik olarak alir.
                Tarihsel olarak endekse giren bir hissede, giris tarihinden 2-4 hafta oncesinden itibaren
                fiyat hareketinin guclendigi gozlemlenmistir.
              </p>
              <p className="mt-3">
                Tersi de gecerlidir: endeksten cikan bir hisseye yonelik mekanik satis baskisi olusur.
                Yatirimcilar ucer aylik endeks revizyon takvimini (Mart, Haziran, Eylul, Aralik donemleri)
                yakindan takip eder; cunku BIST'in resmi duyurusu oncesinde piyasa beklentileri fiyatlanmis
                olur. Bu yapisal etkinin somut bir ornegi, yeni halka arz olan ve buyume hizi yuksek
                sirketlerin BIST 100'e girmeleriyle birlikte yapisal taban olusumudur.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">BIST 100 ile Sektor Endekslerinin Iliskisi</h2>
              <p>
                BIST 100 ana endekstir; ancak Borsa Istanbul ayrica sektor bazli alt endeksler de yayinlar.
                XBANK (banka), XUSIN (sanayi), XHOLD (holding), XGIDA (gida), XINSA (insaat), XTEKS (tekstil)
                gibi alt endeksler hangi sektorun ileri ya da geri kaldigini takip etmek icin kullanilir.
              </p>
              <p className="mt-3">
                Tipik bir analiz: BIST 100 yataya yakin seyrederken XBANK %5 yukselip XUSIN %3 dusuyorsa,
                paranin sanayidan bankaya rotasyon yaptigini soyleyebiliriz. Bu rotasyonu yakalamak; tek tek
                hisse takibinin yerine sektorel para akimini gormeyi mumkun kilar.
              </p>
              <p className="mt-3">
                BIST'te sektor endeks rotasyonu makro veriyle dogrudan baglantilidir. TCMB faiz toplantilari
                yaklastiginda XBANK volatilitesi artar; petrol fiyatlari yukseldikce XPETK hisseleri dikkat
                cekmeye baslar. Yatirimci, makro takvimi sektor endeksleriyle birlikte takip etmek alismaligi
                kazanmalidir.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-white">Endeks Okuma Pratigi</h2>
              <p>
                Endeksin yonu, hangi hisselerin onculuk ettigi, banka-sanayi ayrismasi ve hacim — bu dort
                bilgi birlikte okundugunda piyasa hakkinda saglam bir resim verir. Borsa Krali platformundaki
                Canli Heatmap ve Endeks Detay ekranlari bu okumayi tek bakista kolaylastirmak icin
                tasarlanmistir. Endekse genel bakistan sonra alt sektorlere inip lider hisseleri ayri ayri
                takip etmek; piyasa rotasyonunu (sektorler arasi para gecisini) yakalamanin en pratik yoludur.
              </p>
              <p className="mt-3">
                Yatirimci, BIST 100'u her gun rakamsal olarak takip etmek yerine; haftalik kapanislari, ayin
                son islem gunundeki kapanisi ve yillik bazli getirileri not etmelidir. Bu uzun donem cerceve,
                gunluk gurultuden uzaklasarak buyuk resmi gormeyi kolaylastirir.
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
                  <Link to="/egitim/yatirim-stratejisi" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Yatirim Stratejisi Olusturma: 5 Adim <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
                <li>
                  <Link to="/egitim/teknik-analiz-giris" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
                    Teknik Analize Giris: Sifirdan Baslayanlar Icin Kilavuz <ArrowRight className="h-3.5 w-3.5" />
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
            <Link to="/egitim/teknik-analiz-giris" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              <ArrowLeft className="h-4 w-4" /> Onceki: Teknik Analize Giris
            </Link>
            <Link to="/egitim/temel-gostergeler" className="inline-flex items-center gap-2 text-gold-400 hover:text-gold-300">
              Sonraki: EMA, MACD, RSI <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
