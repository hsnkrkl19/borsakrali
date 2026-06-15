/**
 * Rota bazlı SEO meta verisi — her sayfa için benzersiz <title>, açıklama ve
 * canonical URL.
 *
 * NEDEN: Tüm prerender edilmiş sayfalar daha önce index.html'deki tek sabit
 * başlığı ve canonical'ı (ana sayfa) miras alıyordu. Bu yüzden Google 25+
 * eğitim/araç sayfasını "ana sayfanın kopyası" sanıp indekslemiyordu →
 * AdSense "düşük değerli içerik" reddinin ana sebeplerinden biri.
 *
 * RouteSeo bileşeni (components/RouteSeo.jsx) rota değiştikçe bu haritayı
 * uygular; prerender (Playwright) DOM'u JS çalıştıktan sonra yakaladığı için
 * üretilen statik HTML'ler de doğru başlık + canonical ile yazılır.
 */

export const SITE_URL = 'https://www.borsakrali.com'
export const SITE_NAME = 'Borsa Kralı'
const SUFFIX = ` | ${SITE_NAME}`

// Ana sayfa index.html ile birebir aynı kalsın (regresyon olmasın).
export const HOME_SEO = {
  title: 'Borsa Kralı - BIST 100 Canlı Veri, AI Sinyaller ve Teknik Analiz',
  description:
    'Borsa Kralı: BIST 100 canlı fiyatları, AI destekli teknik ve temel analiz, günlük sinyaller, kripto MTF taraması, mali tablo incelemeleri ve DCF değerleme. Yatırım kararlarınızda eğitim odaklı güvenilir platform.',
}

// path (query'siz) → { title, description }
// title'lara otomatik olarak " | Borsa Kralı" eklenir (bkz. resolveSeo).
export const SEO_MAP = {
  '/ogren': {
    title: 'Eğitim Merkezi: Borsa ve Kripto Rehberleri',
    description:
      'Borsa ve kripto eğitim merkezi: teknik analiz, temel analiz, risk yönetimi ve kripto rehberleri. Ücretsiz, kapsamlı yatırım eğitimi içerikleri.',
  },

  // ── BIST / temel analiz makaleleri ──────────────────────────────────────
  '/egitim/teknik-analiz-giris': {
    title: 'Teknik Analize Giriş: Sıfırdan Başlayanlar İçin Kılavuz',
    description:
      'Teknik analizin temellerini sıfırdan öğrenin: grafik türleri, trend, destek-direnç, hacim ve mum formasyonları ile fiyat hareketlerini okuyun.',
  },
  '/egitim/bist100-rehberi': {
    title: 'BIST 100 Endeksi: Hesaplama, Hisseler, Tarihçe',
    description:
      'BIST 100 endeksi nedir, nasıl hesaplanır, hangi hisseler girer? Endeksin tarihçesi, BIST 30/50 farkı ve sektörel dağılımı tek rehberde.',
  },
  '/egitim/temel-gostergeler': {
    title: 'EMA, MACD, RSI: 3 Temel Gösterge ve Yorumu',
    description:
      'EMA, MACD ve RSI göstergelerinin hesaplanışı, yorumu ve al-sat sinyalleri. Üç temel teknik göstergeyi örneklerle adım adım öğrenin.',
  },
  '/egitim/bilanco-okuma': {
    title: 'Bilanço Okuma Kılavuzu: Aktif, Pasif, Özkaynak',
    description:
      'Şirket bilançosu nasıl okunur? Aktif, pasif ve özkaynak kalemleri, temel oranlar ve mali tablo analiziyle sağlam yatırım kararları.',
  },
  '/egitim/destek-direnc': {
    title: 'Destek ve Direnç Seviyeleri Nasıl Çizilir?',
    description:
      'Destek ve direnç seviyeleri nasıl çizilir? Doğru seviyeleri belirleme, kırılım ve dönüş stratejileri ile fiyat haritanızı oluşturun.',
  },
  '/egitim/yatirim-stratejisi': {
    title: 'Yatırım Stratejisi Oluşturma: 5 Adım',
    description:
      'Kendi yatırım stratejinizi 5 adımda oluşturun: hedef belirleme, risk profili, varlık dağılımı, giriş-çıkış kuralları ve düzenli takip.',
  },

  // ── Kripto makaleleri ───────────────────────────────────────────────────
  '/egitim/kripto-para-giris': {
    title: 'Kripto Paraya Giriş: Bitcoin, Blockchain ve Temel Kavramlar',
    description:
      'Kripto paraya giriş: Bitcoin, blockchain, cüzdanlar ve temel kavramlar. Yeni başlayanlar için sade ve kapsamlı kripto rehberi.',
  },
  '/egitim/kripto-analiz': {
    title: 'Kripto Para Nasıl Analiz Edilir: Teknik ve Temel Yaklaşım',
    description:
      'Kripto para nasıl analiz edilir? Teknik ve temel analiz yaklaşımları, on-chain veriler ve piyasa döngüleriyle coin değerlendirme.',
  },
  '/egitim/onchain-analiz': {
    title: 'On-Chain Analiz: Zincir Üstü Veriyi Okumak',
    description:
      'On-chain (zincir üstü) analiz nedir? Aktif adresler, borsa giriş-çıkışları ve ağ verileriyle kripto piyasasını derinlemesine okuyun.',
  },
  '/egitim/spot-vs-futures': {
    title: 'Spot ve Futures İşlemler: Farklar, Kaldıraç ve Riskler',
    description:
      'Spot ve futures işlemler arasındaki farklar, kaldıraç mekaniği, likidasyon ve riskler. Hangisi size uygun, örneklerle karşılaştırma.',
  },
  '/egitim/funding-rate': {
    title: 'Funding Rate ve Long/Short Dengesi',
    description:
      'Funding rate nedir, long/short dengesini nasıl gösterir? Vadeli (futures) piyasasını funding oranlarıyla okumayı öğrenin.',
  },
  '/egitim/bitcoin-dominansi': {
    title: 'Bitcoin Dominansı ve Altcoin Sezonu',
    description:
      'Bitcoin dominansı nedir ve altcoin sezonu nasıl başlar? Dominans grafiğini yorumlayarak piyasa rotasyonunu takip edin.',
  },

  // ── Strateji / risk makaleleri ──────────────────────────────────────────
  '/egitim/risk-yonetimi': {
    title: 'Risk Yönetimi: Stop-Loss, Pozisyon Büyüklüğü, Sermaye Koruma',
    description:
      'Risk yönetiminin temelleri: stop-loss, pozisyon büyüklüğü hesaplama ve sermaye koruma kurallarıyla kayıpları sınırlayın.',
  },
  '/egitim/portfoy-yonetimi': {
    title: 'Portföy Yönetimi: Dengeli Bir Portföy Nasıl Kurulur',
    description:
      'Dengeli bir yatırım portföyü nasıl kurulur? Varlık dağılımı, çeşitlendirme ve yeniden dengeleme ile uzun vadeli portföy yönetimi.',
  },
  '/egitim/maliyet-ortalama': {
    title: 'Maliyet Ortalama (DCA): Düzenli Alım Stratejisi',
    description:
      'Maliyet ortalama (DCA) stratejisi nedir? Volatil piyasalarda düzenli alım yaparak ortalama maliyeti düşürmenin avantaj ve riskleri.',
  },
  '/egitim/yatirim-psikolojisi': {
    title: 'Yatırım Psikolojisi: Korku, Açgözlülük ve Disiplin',
    description:
      'Yatırım psikolojisi: korku ve açgözlülüğü yönetmek, disiplinli kalmak ve duygusal kararlardan kaçınmak için pratik yöntemler.',
  },
  '/egitim/trade-plani': {
    title: 'Trade Planı Oluşturma: Giriş, Hedef ve Çıkış Kuralları',
    description:
      'Etkili bir trade planı nasıl oluşturulur? Giriş, hedef ve çıkış kurallarını, risk-ödül oranını ve işlem günlüğünü planlayın.',
  },
  '/egitim/yatirim-hatalari': {
    title: 'Yatırımda En Sık Yapılan 10 Hata',
    description:
      'Yatırımcıların en sık yaptığı 10 hata ve bunlardan kaçınma yolları. Daha bilinçli yatırım için yaygın tuzakları öğrenin.',
  },

  // ── Diğer herkese açık sayfalar ─────────────────────────────────────────
  '/hakkimizda': {
    title: 'Hakkımızda',
    description:
      'Borsa Kralı hakkında: BIST ve kripto piyasaları için eğitim odaklı analiz platformu. Misyonumuz ve sunduğumuz araçlar.',
  },
  '/iletisim': {
    title: 'İletişim',
    description:
      'Borsa Kralı ile iletişime geçin. Soru, öneri ve iş birliği talepleriniz için iletişim bilgilerimiz.',
  },
  '/abonelik': {
    title: 'Abonelik Planları ve Fiyatlandırma',
    description:
      'Borsa Kralı abonelik planları ve fiyatlandırma. Ücretsiz ve premium paketlerle tüm analiz araçlarına erişim.',
  },
  '/borsapy': {
    title: 'Veri Merkezi: TEFAS Fonları, TCMB Faizi, Döviz Kurları',
    description:
      'TEFAS fonları, TCMB politika faizi, devlet tahvili getirileri ve banka döviz kurları tek ekranda. Güncel finansal veri merkezi.',
  },
  '/ekonomik-takvim': {
    title: 'Ekonomik Takvim: TR ve ABD Veri Açıklamaları',
    description:
      'Türkiye ve ABD ekonomik takvimi: enflasyon, faiz kararları ve önemli veri açıklamaları. Piyasayı etkileyen olayları takip edin.',
  },
  '/oyun': {
    title: 'Hisse Yarışı: BIST Grafiğinde Araba ve Motor Oyunu',
    description:
      'BIST hisselerinin fiyat grafiğinde araba ve motor sür! Para topla, aracını geliştir (motor, lastik, süspansiyon), yeni hisse pistleri aç. Eğlenceli borsa temalı hill-climb oyunu.',
  },
  '/sinyaller': {
    title: 'Canlı Sinyaller ve Piyasa Özeti',
    description:
      'Canlı BIST ve kripto sinyalleri, piyasa özeti ve heatmap. Günlük al-sat fırsatlarını tek ekrandan takip edin.',
  },
  '/site-haritasi': {
    title: 'Site Haritası',
    description:
      'Borsa Kralı site haritası: tüm sayfalar, analiz araçları ve eğitim içeriklerine hızlı erişim.',
  },
  '/is-yatirim-veri': {
    title: 'İş Yatırım Verileri: Hisse, Endeks, Mali Tablo',
    description:
      'İş Yatırım kaynaklı hisse, endeks ve mali tablo verileri. Geçmiş fiyatları ve finansal tabloları inceleyin, CSV olarak indirin.',
  },

  // ── Yasal sayfalar (AdSense gizlilik politikası şartı) ───────────────────
  '/privacy-policy': {
    title: 'Gizlilik Politikası',
    description:
      'Borsa Kralı gizlilik politikası: hangi verileri topladığımız, nasıl kullandığımız, çerezler ve üçüncü taraf reklam (Google AdSense) bilgilendirmesi.',
  },
  '/terms-of-use': {
    title: 'Kullanım Koşulları',
    description:
      'Borsa Kralı kullanım koşulları: hizmetin kapsamı, yatırım tavsiyesi içermez uyarısı, sorumluluk sınırları ve kullanıcı yükümlülükleri.',
  },
}

/**
 * Verilen pathname için SEO verisini çözer.
 * - Query string yok sayılır (canonical sekme varyantlarını birleştirir).
 * - Bilinen rota → benzersiz başlık + açıklama.
 * - Bilinmeyen rota → marka başlığı + ana sayfa açıklaması (canonical yine
 *   kendi yoluna işaret eder; bu sayfalar prod'da zaten noindex servis edilir).
 */
export function resolveSeo(pathname) {
  const path = (pathname || '/').replace(/\/+$/, '') || '/'
  const canonical = path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`

  if (path === '/') {
    return { ...HOME_SEO, canonical }
  }

  const entry = SEO_MAP[path]
  if (entry) {
    return {
      title: `${entry.title}${SUFFIX}`,
      description: entry.description,
      canonical,
    }
  }

  // Bilinmeyen (araç/kişisel) sayfa — marka başlığı, kendi canonical'ı.
  return {
    title: HOME_SEO.title,
    description: HOME_SEO.description,
    canonical,
  }
}
