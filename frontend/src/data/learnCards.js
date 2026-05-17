/**
 * Parça 4 — Öğren kartları.
 *
 * Kısa, tek cümleli tanım + 1 örnek + 1 "şuna dikkat" satırı.
 * Hedef: 80-100 kelime arası, 30 saniyede okunabilir.
 *
 * `detailHref` doluysa "Detaylı oku →" linki olarak Egitim alt sayfasına yönlendirir.
 */

export const LEARN_CATEGORIES = [
  { id: 'temel',  label: 'Temel Kavramlar' },
  { id: 'sistem', label: 'Sistemi Tanı' },
  { id: 'risk',   label: 'Paranı Koru' },
]

export const LEARN_CARDS = [
  // ── TEMEL KAVRAMLAR ─────────────────────────────────────────────────────
  {
    id: 'al-ne-demek',
    category: 'temel',
    title: 'AL ne demek?',
    body: 'AL etiketi, sistemin o hisse için yükseliş ihtimalinin yüksek olduğunu söylediği anlamına gelir. Yani fiyat yukarı doğru hareket etmeye başlamış olabilir.',
    example: 'Örnek: THYAO için AL çıktıysa, fiyat son günlerde dipten dönmüş ve alıcılar güçleniyor demek.',
    warning: 'Dikkat: AL "kesin kazanır" demek değil. Sadece sistem ipucu verir; bütçenin tamamını tek hisseye yatırma.',
  },
  {
    id: 'bekle-ne-demek',
    category: 'temel',
    title: 'BEKLE ne demek?',
    body: 'BEKLE, hissede şu an net bir yön olmadığı, alıcı-satıcı dengesinin sürdüğü anlamına gelir. Sistem henüz "şimdi gir" demiyor.',
    example: 'Örnek: EREGL için BEKLE çıkmışsa, fiyat yatay seyrediyor ve bir taraf çıkana kadar oturup beklemek mantıklı.',
    warning: 'Dikkat: BEKLE pasif bir tavsiye — pozisyon açmadan önce yönün netleşmesini bekleyebilirsin.',
  },
  {
    id: 'riskli-ne-demek',
    category: 'temel',
    title: 'RİSKLİ ne demek?',
    body: 'RİSKLİ etiketi, sistem o hissede düşüş baskısı görüyor demektir. Yeni alım girmek için uygun bir zaman değil.',
    example: 'Örnek: ASELS için RİSKLİ çıktıysa, fiyat son günlerde düşüyor ve satıcılar baskın.',
    warning: 'Dikkat: Elinde bu hisse varsa kâr/zararını gözden geçirmenin tam zamanı. Sistem "şimdi girme" diyor.',
  },
  {
    id: 'hisse-nedir',
    category: 'temel',
    title: 'Hisse nedir?',
    body: 'Hisse, bir şirketin küçük bir parçasıdır. Aldığında o şirketin ortaklarından biri olursun; fiyatı zamanla yükselebilir veya düşebilir.',
    example: 'Örnek: 1000 TL ile THYAO hissesi aldıysan, Türk Hava Yolları\'nın çok küçük bir parçasının sahibisin.',
    warning: 'Dikkat: Şirket kazanırsa hissen değerlenir, kötü gidiyorsa düşer. Sadece izlediğin şirketlere yatırım yap.',
  },

  // ── SİSTEMİ TANI ────────────────────────────────────────────────────────
  {
    id: 'sinyal-nedir',
    category: 'sistem',
    title: 'Sinyal nedir?',
    body: 'Sinyal, sistemin "şu hissede şu an dikkat çekici bir hareket var" demesidir. Çoğunlukla AL, BEKLE, SAT veya RİSKLİ kararlarından biriyle gelir.',
    example: 'Örnek: Sabah 09:55\'te THYAO için AL sinyali geldiyse, sistem o güne göre fırsat görüyor demek.',
    warning: 'Dikkat: Her sinyal kâr garanti etmez. Sistem geçmiş veriden öğreniyor, gelecek belirsizdir.',
  },
  {
    id: 'bot-nedir',
    category: 'sistem',
    title: 'Bot nedir?',
    body: 'Bot, senin yerine fırsat takip eden ve istersen otomatik al-sat yapan bir programdır. Riski sen seçersin, gerisini bot halleder.',
    example: 'Örnek: Güvenli Bot\'u seçip 1.000 TL bağladığında, bot düşük riskli hisselerde küçük işlemler yapar.',
    warning: 'Dikkat: Bot kâr garanti etmez. İlk denemende Kağıt Üzerinde Dene modunu kullanarak risk almadan görebilirsin.',
  },
  {
    id: 'tarama-nedir',
    category: 'sistem',
    title: 'Tarama nedir?',
    body: 'Tarama, sistemin yüzlerce hisseyi tek tek incelemesi ve içlerinden öne çıkanları senin için listelemesidir.',
    example: 'Örnek: BIST100\'deki 100 hissenin hepsini sistem her sabah tarar; en güçlü 10\'unu önüne koyar.',
    warning: 'Dikkat: Liste sıralaması skora göre — en üst sıradakini körü körüne alma, kendi araştırmanı da yap.',
  },
  {
    id: 'bildirim-nasil',
    category: 'sistem',
    title: 'Bildirim nasıl çalışır?',
    body: 'Bildirim, fırsat çıktığında telefonuna veya tarayıcına anlık olarak gelen kısa bir mesajdır. Sen başka işle uğraşırken seni uyarır.',
    example: 'Örnek: "THYAO için al sinyali — yükseliş başladı." gibi tek cümlelik bildirim alırsın.',
    warning: 'Dikkat: Bildirim için cihazına izin vermen gerekir. Ayarlar > Bildirimler\'den açabilirsin.',
  },

  // ── PARANI KORU ─────────────────────────────────────────────────────────
  {
    id: 'risk-ne-demek',
    category: 'risk',
    title: 'Risk ne demek?',
    body: 'Risk, "ne kadar para kaybedebilirim" sorusunun cevabıdır. Yüksek risk = büyük kazanç ihtimali ama büyük kayıp ihtimali de var demektir.',
    example: 'Örnek: 10.000 TL\'ni tek hisseye yatırırsan risk yüksek; 5 hisseye böldüğünde risk düşer.',
    warning: 'Dikkat: Sadece kaybetmeyi göze alabileceğin parayı yatır. Borç para ile yatırım yapma.',
  },
  {
    id: 'zarar-durdur',
    category: 'risk',
    title: 'Zarar Durdur nedir?',
    body: 'Zarar Durdur, fiyat belirli bir seviyenin altına düştüğünde sistemin otomatik satış yapması demektir. Sermayeni korur.',
    example: 'Örnek: 100 TL\'den alıp Zarar Durdur\'u 95 TL\'ye koyarsan, fiyat 95\'in altına düşerse pozisyon kapanır.',
    warning: 'Dikkat: Zarar Durdur\'u sürekli aşağı çekme. Plan başında belirle, ona uy.',
  },
  {
    id: 'butce-planla',
    category: 'risk',
    title: 'Bütçe nasıl planlanır?',
    body: 'Bütçe, "bu işe ne kadar ayıracağım" sorusudur. İyi bir yaklaşım: birikiminin sadece bir kısmını yatırıma ayır, hepsini değil.',
    example: 'Örnek: 50.000 TL birikimin varsa, en fazla 10-15 bin TL\'sini hisseye, gerisini güvenli yerlerde tut.',
    warning: 'Dikkat: Aldığın hisseyi tek bir gün izleyip karar verme — en az birkaç hafta yan yana takip et.',
  },
  {
    id: 'kar-al',
    category: 'risk',
    title: 'Kâr Al nedir?',
    body: 'Kâr Al, fiyat hedefine ulaştığında pozisyonu otomatik kapatarak kazancı sabitlemen anlamına gelir.',
    example: 'Örnek: 100\'den alıp Kâr Al\'ı 110\'a kurduysan, fiyat 110\'a ulaşınca otomatik satılır, %10 kâr cebine girer.',
    warning: 'Dikkat: Açgözlülük zarar yarattığında kaçırılmış olur. Belirlediğin hedefe ulaşınca satmak işlemin parçasıdır.',
  },
]

export function findCard(id) {
  return LEARN_CARDS.find((c) => c.id === id) || null
}
