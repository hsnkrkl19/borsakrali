import { useState } from 'react'
import { BookOpen, TrendingUp, BarChart3, LineChart, Activity, Target, AlertTriangle, Gauge, ChevronRight, Search, BookMarked, GraduationCap, Lightbulb, DollarSign, PieChart, Coins, Calculator, Shield, TrendingDown, Zap, Clock, Award, Star, CheckCircle } from 'lucide-react'

export default function IncelemeKutuphanesi() {
  const [activeCategory, setActiveCategory] = useState('temel')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)
  const [expandedSection, setExpandedSection] = useState(null)

  const categories = [
    { id: 'temel', label: 'Temel Analiz', icon: BarChart3 },
    { id: 'teknik', label: 'Teknik Analiz', icon: LineChart },
    { id: 'tarama', label: 'Taramalar', icon: Target },
    { id: 'egitim', label: 'Finansal Okuryazarlık', icon: GraduationCap }
  ]

  // ==================== TEMEL ANALİZ İÇERİKLERİ ====================
  const temelAnalizKonulari = [
    {
      id: 'super-skor',
      name: 'Süper Skor (AI Composite)',
      category: 'Değerleme',
      icon: Star,
      color: 'gold',
      description: 'Şirketin tüm finansal verilerini yapay zeka yardımıyla 0-100 arasında değerlendiren "genel başarı notu"dur. Şirketin hem iç faktörler (finansal tablolar) hem de dış faktörler (piyasa) açısından güçlü/zayıf yönlerini tek bir sayıda özetler.',
      details: {
        'Nasıl Hesaplanır?': 'Piotroski, GreenBlatt, Mohanram gibi modellerin ağırlıklı ortalaması alınarak en büyük şirketlere göre değerlendirilir. Bu modele, standart sektörlerarası varlık değerleme yöntemleri de dahil edilerek "Holding Analiz Modu"na geçilmektedir.',
        'Referans Aralıkları': [
          '70-100 (Çok İyi): Finansal olarak rokosunuz, likidite ve geneli tutarlı.',
          '40-69 (Orta): Bazı metrikler kaçışmış, dikkatli konuma geçilmeli.',
          '0-39 (Riskli): Finansal yapıda sorun var, gelir daralması yapılıyor.'
        ],
        'Dikkat': 'Süper Skor tek başına yatırım kararı vermek için yeterli değildir. Sektör, makro ekonomik koşullar ve şirketin stratejik planı da göz önünde bulundurulmalıdır.'
      }
    },
    {
      id: 'altman-z',
      name: 'Altman Z-Score',
      category: 'Risk Analizi',
      icon: Shield,
      color: 'red',
      description: 'Şirketin önümüzdeki 2 yıl içinde iflas edip edemeyeceğini ölçer bir göstergedir. Şirketin borçlarını çevirip-çevirmeyeceğini anlamaya yardımcı olur.',
      details: {
        'Nasıl Hesaplanır?': 'Likidite, karlılık ve borçluluk oranlarını kullanarak şirketin finansal sağlığını gösterir.',
        'Önemli Not': 'Bu gösterge sadece sanayi veyahit klasik şirketler için geçerlidir. Borsa Sanatı AI, analiz edilen şirket bir Holding ise bu göstergeyi otomatik olarak çıkartır ve yerine "Holding Analiz Modu"nu aktive ederek benzer finansal yapıya bu formüle ek değerlendirme yapıyor.',
        'Referans Aralıkları': [
          'Yeşil Bölge (Güvenli): Z > 2.99 ve Üzeri. Şirket büyük olasılıkla ifade açık.',
          'Gri Bölge (Belirsiz): Z = 1.81 - 2.98 Arası. İflas olabilir, dikkatli izleme.',
          'Kırmızı Bölge (Riskli): Z < 1.81 ve Altı. Şirket ciddi bir mali krizde/risskı eşik altı.'
        ]
      }
    },
    {
      id: 'finansal-guc',
      name: 'Finansal Güç Puanı (Holding)',
      category: 'Değerleme',
      icon: Award,
      color: 'blue',
      description: 'Holdinglerin ve yatırım şirketlerinin karmaşık bilançolarını özel olarak geliştirilmiş bir "bağımsızlık" değeri. Şirketin iştiraklarından elde ettiği gelirlerin dağılımı ile toplam değer karşılaştırma yapıyor.',
      details: {
        'Nasıl Hesaplanır?': 'Holdinglerdeki standart Altman Z-Score çalışmaları için Borsa Sanatı AI bu noktada "Holding Analiz Modu"nu başlatır. Bu puan, iştirak yarattırları, özkaynak gücü ve iştiraktaki performans bazı olmak üzere holdinglerin gerçek finansal gücünü hesaplar.',
        'Referans Aralıkları': [
          'Çok iyi: 75 ve Üzeri. Holdingin iştirakler yapısı ve nakit gücü yükseksek.',
          'Orta: 40 - 75 Arası. Standart seviye.',
          'Zayıf: 40 ve Altı. Holdingin planda/uyum yüksek olmayışını işareteler.'
        ]
      }
    },
    {
      id: 'beneish-m',
      name: 'Beneish M-Score',
      category: 'Risk Analizi',
      icon: AlertTriangle,
      color: 'orange',
      description: 'Şir şirketin, laks hesaplarını ve verilerini kandırış şeklinde düzenleyerek resmi istatistikleri olasılıkla ifade etme durumunu ölçer "Veriler yanlış güdeci" ifade.',
      details: {
        'Ne İşe Yarar?': 'Şirketin finansal tablolarında manipülasyon yapılıp yapılmadığını ortaya koymaya yardımcı istatistiksel olarak düşeyeği bu yapıyı varan, M-Score bu durumları "şibonek risk olmak" olarak aşarılmakla yapılmasının ve ödebileteli netsini çalışın şirkette düşer.',
        'Referans Aralıkları': [
          'Sınırın Güvenli: M < -2.22 Altı → Haritada küçük değişiklik, düşük potansiyel.',
          'Riskli Sınırı: M > -2.22 Üzeri → Finansal tablolarda "kreşking" olma olasılığı yüksek.'
        ]
      }
    },
    {
      id: 'piotroski',
      name: 'Piotroski F-Score',
      category: 'Kalite Analizi',
      icon: CheckCircle,
      color: 'green',
      description: 'Şirketin finansal yapısının geçen yılın görece dönem performansın 9 ölçer üzerinden puanlamva bir "başarı karşeti"dir.',
      details: {
        'Basit Tanım': 'Şirketin finansal yapısının geçen yılı göreöli dönemperforma 9 kriter üzerinden puanlanna bir "başarı karşeti".',
        'Nasıl Hesaplanır?': 'Karlılık, nakit akışı ve borçluluk gibi 8 temel veriye bakar. Şirket her bir kriterde geçiyorsa 1 puan alır. Borsa Sanatı AI, bu puanı hesaplarken şirketin "şirketler benzerde" olup olmadığını tesipli eder.',
        'Referans Aralıkları': [
          '7-8 Puan Güçlü: Şirket her sçiden çalışıyor, finansal bir sıkı olası alar.',
          '4-6 Puan Orta: Standart performans, sağlam şirkeler.',
          '0-3 Puan Zayıf: Şirketin bazlanmış kota zayıflıyor, dikkatli olunmalı.'
        ]
      }
    },
    {
      id: 'holding-analiz',
      name: 'Holding Analiz Modu',
      category: 'Özel Analiz',
      icon: PieChart,
      color: 'purple',
      description: 'Holdinglerin veyatı şirketlerinin karmaşık yapısını doğru analiz edibilmek için standart sanayi modellerini drenaj dip bırakan özelel bir "akıllı Blkiv" özellikleridir.',
      details: {
        'Nasıl Hesaplanır?': 'Standart finansal oranlar (Örn. Altman Z-Score, hazırlıkgelirin güncek alan al ve finansal veriler analitgös yapıyor ve sonuçlar "yatımcı arama" alınarak otomatik alarak Sanyi ve standart şirketler alarak gördüğü/yatgöstge ve Mali Analiz birbirineler veyebiydir işlem şirdünemeler.',
        'Ne Zaman Aktif Olur?': [
          'Holding/Yatırım Şirketleri: Standart modeller çalışmaz, özel analiz devreye girer.',
          'Karmaşık Yapılar: İştirakleri olan şirketler için otomatik aktifleşir.'
        ],
        'Not': 'Mali tablolar ve şirket yapısı sürekli değişebilir.'
      }
    },
    {
      id: 'greenblatt',
      name: 'GreenBlatt Rank (Sihirli Formül)',
      category: 'Değerleme',
      icon: Calculator,
      color: 'cyan',
      description: 'Yatırımcı Joel Greenblatt tarafından geliştirilen "Sihirli Formül" kapsamında şirketin hem krıtlarına hem de sıras kurtlaştırma çok ortalaması bir ve de brantalları krılaplışla şirketet.',
      details: {
        'Nasıl Hesaplanır?': 'Sermaye getirisi (karlılı) ve kazanç verimi (ucuzluk) kritelerlerini Birleştir. Borsa Sanatı AI, Sün İstanbul\'la tüm hisselere gör sıralama ve 1-95398 döne bestiren.',
        'Referans Aralıkları': [
          'Top %5 (Elmas): Piyasanın en kaliteli ve en ucuz şirkeler.',
          'Top %20 (Altın): Fırsat peri çok daha Güçlü şirkeler hala savde olabilir.',
          'Alt %50 (+): Yrksa çok çeşitliğ ya da çok sermayoniz veilmi kubatamnverlar.'
        ]
      }
    },
    {
      id: 'mohanram',
      name: 'Mohanram G-Score',
      category: 'Büyüme Analizi',
      icon: TrendingUp,
      color: 'emerald',
      description: 'Varlık büyük daha en hızlı büyüyen teknolyoji) ve savunma sanayil gibi "büyüme şirketleri"nin kalitesine odak şirket.',
      details: {
        'Nasıl Hesaplanır?': 'F-Score\'un aksak düşük R-Ca, yatırım harcamaları (K-Ca, yatırım harcamlaları + R) liderlerle. Borsa İstanbultaki "Büyüme Meşgya" olan şirketlerin değerlendirmesine 0-8 arası puaan bile sıraidği gösterir.',
        'Referans Aralıkları': [
          '6 - 8 Puan (Yüksek): Büyüme potansiyeli devlatikle, sağlıklı potansiyel var eder göte.',
          '3 - 5 Puan (Orta): Standartlibrazlama potansiyel.',
          '0 - 2 Puan (Düşük): Büyüme varı eden ana aşıt değişimiyaşam "bekle" elde buşpuan palet.'
        ]
      }
    },
    {
      id: 'aktran-deger',
      name: 'Aktran Değerlemesi (AI)',
      category: 'Yapay Zeka',
      icon: Zap,
      color: 'yellow',
      description: 'Borsa Sanatı AI\'nin, şirketin FiyaÖna, ana finansal oranları olarak aynı bir bekleyen olarak kurıllar "arak mi palah nı" olduğa beliristir.',
      details: {
        'Nasıl Hesaplanır?': 'Yapay zekamız (Y\'AI Algoritmiz), sadece amy pektöründe değil, büyümeb ve karlıık yapıs ve bepzer "ölçeklerin" yapılarla birbirlarla birarlıkla hesaplar.',
        'Referans Aralıkları': [
          'Prim %5 (Elmas): Piyasasın en kaliteli ve en ucuz şrikeler.',
          'Top %20 (Altın): Fırsat per çok daha güclü şirkeler hala savde olabilir.',
          'Alt %50 (Diğer): Yerka çok çeşitli ya da çok sermayeniz verimi kalyattanverlar.'
        ]
      }
    }
  ]

  // ==================== TEKNİK ANALİZ İÇERİKLERİ ====================
  const teknikGostergeler = [
    {
      id: 'rsi',
      name: 'RSI (Göreceli Güç Endeksi)',
      category: 'Momentum',
      icon: Gauge,
      color: 'primary',
      description: 'RSI, bir varlığın aşırı alım veya aşırı satım durumunu tespit etmek için kullanılan bir momentum osilatörüdür. 0-100 arasında değer alır.',
      details: {
        'Nasıl Hesaplanır?': 'RSI = 100 - (100 / (1 + RS)), RS = Ortalama Kazanç / Ortalama Kayıp',
        'Kullanımı': 'RSI 70\'in üzerindeyse aşırı alım, 30\'un altındaysa aşırı satım bölgesinde kabul edilir.',
        'Referans Aralıkları': [
          'RSI > 70: Aşırı alım - Satış fırsatı olabilir',
          'RSI 30-70: Normal bölge',
          'RSI < 30: Aşırı satım - Alış fırsatı olabilir'
        ],
        'Stratejiler': ['Diverjans analizi', 'Destek/direnç kırılımları', 'Trend doğrulama']
      }
    },
    {
      id: 'macd',
      name: 'MACD (Hareketli Ortalama Yakınsama)',
      category: 'Trend',
      icon: TrendingUp,
      color: 'green',
      description: 'MACD, kısa ve uzun vadeli hareketli ortalamalar arasındaki ilişkiyi gösteren bir trend takip göstergesidir. Trend dönüşlerini tespit etmede kullanılır.',
      details: {
        'Nasıl Hesaplanır?': 'MACD Line = EMA(12) - EMA(26), Signal Line = EMA(9) of MACD, Histogram = MACD - Signal',
        'Referans Aralıkları': [
          'MACD > Signal & Histogram pozitif: Güçlü yükseliş',
          'MACD < Signal & Histogram negatif: Güçlü düşüş',
          'Sıfır çizgisi geçişleri önemli sinyallerdir'
        ],
        'Stratejiler': ['Kesişim sinyalleri', 'Histogram analizi', 'Diverjans']
      }
    },
    {
      id: 'bollinger',
      name: 'Bollinger Bantları',
      category: 'Volatilite',
      icon: Activity,
      color: 'blue',
      description: 'Fiyat volatilitesini ölçerek piyasanın aşırı alım veya aşırı satım seviyelerine ulaşıp ulaşmadığını anlamaya yardımcı olan indikatördür.',
      details: {
        'Nasıl Hesaplanır?': 'Orta Bant = SMA(20), Üst Bant = Orta + (2 × Std Sapma), Alt Bant = Orta - (2 × Std Sapma)',
        'Kullanımı': 'Fiyat üst banda yaklaşırsa aşırı alım, alt banda yaklaşırsa aşırı satım bölgesinde olduğu düşünülebilir.',
        'Referans Aralıkları': [
          'Bantlar genişliyorsa: Volatilite artıyor',
          'Bantlar daralıyorsa: Volatilite düşüyor (Squeeze)',
          'Squeeze sonrası büyük hareketler beklenir'
        ]
      }
    },
    {
      id: 'stochastic',
      name: 'Stokastik Osilatör',
      category: 'Momentum',
      icon: Gauge,
      color: 'purple',
      description: 'Fiyatın belirli bir zaman dilimi içindeki en yüksek ve en düşük seviyelerine göre mevcut fiyatın konumunu belirleyen momentum indikatörüdür.',
      details: {
        'Nasıl Hesaplanır?': '%K = ((Close - Lowest Low) / (Highest High - Lowest Low)) × 100, %D = SMA(%K, 3)',
        'Referans Aralıkları': [
          '%K > 80: Aşırı alım bölgesi',
          '%K < 20: Aşırı satım bölgesi',
          '%K kesişimleri sinyal üretir'
        ]
      }
    },
    {
      id: 'atr',
      name: 'ATR (Ortalama Gerçek Aralık)',
      category: 'Volatilite',
      icon: AlertTriangle,
      color: 'orange',
      description: 'Piyasadaki volatiliteyi ölçmek için kullanılan indikatördür. Stop-loss seviyelerini belirlemede çok kullanışlıdır.',
      details: {
        'Nasıl Hesaplanır?': 'TR = Max(High-Low, |High-Close(prev)|, |Low-Close(prev)|), ATR = SMA(TR, 14)',
        'Kullanımı': 'Yüksek ATR değeri volatil piyasayı, düşük ATR değeri sakin piyasayı gösterir.',
        'Referans Aralıkları': [
          'ATR yüksek: Geniş stop-loss kullan',
          'ATR düşük: Dar stop-loss kullan',
          'Pozisyon boyutlandırmada önemli'
        ]
      }
    },
    {
      id: 'ichimoku',
      name: 'Ichimoku Bulutu',
      category: 'Trend',
      icon: Activity,
      color: 'cyan',
      description: 'Trend yönü, destek-direnç seviyeleri ve momentum analizi yapmak için kullanılan kapsamlı bir indikatördür.',
      details: {
        'Bileşenler': 'Tenkan-Sen (9), Kijun-Sen (26), Senkou Span A/B, Chikou Span',
        'Referans Aralıkları': [
          'Fiyat bulutun üzerinde: Yükseliş trendi',
          'Fiyat bulutun altında: Düşüş trendi',
          'Bulut rengi değişimi: Trend dönüşü sinyali'
        ]
      }
    },
    {
      id: 'vwap',
      name: 'VWAP (Hacim Ağırlıklı Ortalama)',
      category: 'Hacim',
      icon: BarChart3,
      color: 'emerald',
      description: 'Hacim ağırlıklı ortalama fiyatı belirleyerek bir varlığın adil değerini analiz etmek için kullanılan göstergedir.',
      details: {
        'Nasıl Hesaplanır?': 'VWAP = Σ(Typical Price × Volume) / Σ(Volume)',
        'Kullanımı': 'Fiyat VWAP üzerindeyse güçlü, altındaysa zayıf kabul edilir.',
        'Referans Aralıkları': [
          'Fiyat > VWAP: Alıcılar güçlü',
          'Fiyat < VWAP: Satıcılar güçlü',
          'Kurumsal yatırımcılar VWAP\'ı referans alır'
        ]
      }
    },
    {
      id: 'obv',
      name: 'OBV (Denge Hacmi)',
      category: 'Hacim',
      icon: BarChart3,
      color: 'yellow',
      description: 'Fiyat hareketlerini hacimle ilişkilendirerek trendin gücünü ölçen bir indikatördür.',
      details: {
        'Nasıl Hesaplanır?': 'Fiyat yükselirse: OBV = OBV(prev) + Volume, Fiyat düşerse: OBV = OBV(prev) - Volume',
        'Kullanımı': 'OBV yükseliyorsa alıcılar, düşüyorsa satıcılar piyasaya giriş yapıyor demektir.',
        'Referans Aralıkları': [
          'OBV ve fiyat birlikte yükseliyor: Sağlıklı trend',
          'OBV düşerken fiyat yükseliyor: Dikkat! Uyumsuzluk',
          'Kurumsal para akışını gösterir'
        ]
      }
    }
  ]

  // ==================== TARAMA STRATEJİLERİ ====================
  const taramaStratejileri = [
    {
      id: 'dusen-kirilimi',
      name: 'Düşen Kırılımı',
      category: 'Boğa Ligi',
      icon: TrendingUp,
      color: 'green',
      description: 'Düşüş trendinde olan bir hissenin, önemli bir direnç seviyesini yukarı yönde kırması.',
      details: {
        'Nasıl Tespit Edilir?': [
          'Son 20 günde EMA20 altında işlem görmüş olmalı',
          'Bugün EMA20\'yi yukarı kırmış olmalı',
          'RSI 40\'ın üzerinde ve yükseliyor olmalı',
          'Hacim ortalamanın üzerinde olmalı'
        ],
        'Risk/Ödül': '7.26:1 ortalama',
        'Başarı Oranı': '%79',
        'Ortalama Getiri': '%15.49'
      }
    },
    {
      id: 'yukselen-duzeltme',
      name: 'Yükselen Düzeltme',
      category: 'Boğa Ligi',
      icon: TrendingUp,
      color: 'green',
      description: 'Yükseliş trendindeki bir hissenin, geçici düzeltme sonrası trende devam etmesi.',
      details: {
        'Nasıl Tespit Edilir?': [
          'Genel trend yukarı (EMA50 üzerinde)',
          'Son günlerde EMA20\'ye doğru düzeltme',
          'RSI 35-55 arasında (aşırı satım değil)',
          'Bugün yukarı yönlü kapanış'
        ],
        'Risk/Ödül': '4.62:1 ortalama',
        'Başarı Oranı': '%83',
        'Ortalama Getiri': '%8.85'
      }
    },
    {
      id: 'trend-dibi',
      name: 'Trend Dibi',
      category: 'Boğa Ligi',
      icon: TrendingDown,
      color: 'blue',
      description: 'Uzun süreli düşüşten sonra dip oluşumu ve toparlanma sinyali.',
      details: {
        'Nasıl Tespit Edilir?': [
          'RSI aşırı satım bölgesinde (<35)',
          'Bollinger alt bandına yakın',
          'V formasyonu oluşumu',
          'Hacimde artış'
        ],
        'Risk/Ödül': '5.94:1 ortalama',
        'Başarı Oranı': '%69',
        'Ortalama Getiri': '%11.22'
      }
    },
    {
      id: 'trend-zirvesi',
      name: 'Trend Zirvesi',
      category: 'Ayı Ligi',
      icon: TrendingDown,
      color: 'red',
      description: 'Uzun süreli yükselişten sonra tepe oluşumu ve geri çekilme sinyali.',
      details: {
        'Nasıl Tespit Edilir?': [
          'RSI aşırı alım bölgesinde (>70)',
          'Bollinger üst bandına yakın',
          'Ters V formasyonu',
          'Hacimde azalma'
        ],
        'Risk/Ödül': '3.84:1 ortalama',
        'Başarı Oranı': '%51',
        'Dikkat': 'Düşüş yönlü stratejidir'
      }
    },
    {
      id: 'ema34-destek',
      name: 'EMA34 Desteği',
      category: 'Boğa Ligi',
      icon: LineChart,
      color: 'gold',
      description: 'EMA34\'e dokunan ve tepki veren hisseler. Profesyonel trader\'ların favori seviyesi.',
      details: {
        'Nasıl Tespit Edilir?': [
          'Son 3 günde EMA34\'e dokunuş',
          'Fiyat EMA34\'ün üzerinde kapanış',
          'Trend yukarı yönlü',
          'Hacim desteği var'
        ],
        'Neden EMA34?': 'Fibonacci sayısı (34) piyasada doğal destek/direnç oluşturur.',
        'Kullanım': 'Stop-loss EMA34\'ün %2 altında'
      }
    }
  ]

  // ==================== FİNANSAL OKURYAZARLIK İÇERİKLERİ ====================
  const finansalOkuryazarlik = [
    {
      id: 'borsa-nedir',
      name: 'Borsa Nedir?',
      level: 'Başlangıç',
      icon: DollarSign,
      description: 'Borsa, şirket hisselerinin, tahvil ve bonoların, döviz ve emtia gibi finansal araçların alınıp satıldığı organize piyasalardır.',
      content: {
        'Temel Kavramlar': [
          'Hisse Senedi: Şirket ortaklık payı',
          'Tahvil: Borçlanma aracı',
          'Endeks: Piyasa performans göstergesi (BIST 100, BIST 30)',
          'Likidite: Kolayca alım-satım yapabilme'
        ],
        'BIST Nedir?': 'Borsa İstanbul, Türkiye\'nin tek menkul kıymetler borsasıdır. 1985\'te İMKB olarak kurulmuş, 2013\'te BIST adını almıştır.',
        'Önemli Notlar': [
          'Seans saatleri: 10:00-18:10',
          'T+2 takas sistemi',
          'Minimum lot: 1 adet hisse'
        ]
      }
    },
    {
      id: 'teknik-analiz-nedir',
      name: 'Teknik Analiz Nedir?',
      level: 'Başlangıç',
      icon: LineChart,
      description: 'Teknik analiz, geçmiş fiyat hareketlerini ve işlem hacmini inceleyerek gelecekteki fiyat hareketlerini tahmin etmeye çalışan bir analiz yöntemidir.',
      content: {
        'Temel Prensipler': [
          'Piyasa her şeyi fiyatlar',
          'Fiyatlar trendler halinde hareket eder',
          'Tarih tekerrür eder'
        ],
        'Kullanılan Araçlar': [
          'Grafik türleri (mum, çizgi, bar)',
          'Destek ve direnç seviyeleri',
          'Teknik indikatörler',
          'Formasyonlar'
        ],
        'Avantajları': [
          'Her zaman diliminde uygulanabilir',
          'Objektif kararlar almayı sağlar',
          'Giriş/çıkış noktalarını belirler'
        ]
      }
    },
    {
      id: 'temel-analiz-nedir',
      name: 'Temel Analiz Nedir?',
      level: 'Orta',
      icon: BarChart3,
      description: 'Temel analiz, şirketin finansal tablolarını, sektör dinamiklerini ve makroekonomik faktörleri inceleyerek hisse senedinin gerçek değerini belirlemeye çalışan bir analiz yöntemidir.',
      content: {
        'İncelenen Veriler': [
          'Gelir tablosu',
          'Bilanço',
          'Nakit akış tablosu',
          'Finansal oranlar'
        ],
        'Önemli Oranlar': [
          'F/K (Fiyat/Kazanç)',
          'PD/DD (Piyasa Değeri/Defter Değeri)',
          'ROE (Özkaynak Karlılığı)',
          'Borç/Özkaynak'
        ],
        'Avantajları': [
          'Uzun vadeli yatırımlar için idealdir',
          'Şirketin gerçek değerini gösterir',
          'Risk değerlendirmesi sağlar'
        ]
      }
    },
    {
      id: 'risk-yonetimi',
      name: 'Risk Yönetimi',
      level: 'Orta',
      icon: Shield,
      description: 'Risk yönetimi, yatırım portföyünüzü korumak ve kayıpları minimize etmek için kullanılan stratejiler bütünüdür.',
      content: {
        'Temel Kurallar': [
          'Asla kaybetmeyi göze alamayacağınız parayla yatırım yapmayın',
          'Portföyü çeşitlendirin',
          'Stop-loss kullanın',
          'Pozisyon boyutlandırması yapın'
        ],
        'Pozisyon Boyutlandırma': [
          'Tek işlemde maksimum %2 risk',
          'Toplam açık pozisyonlarda maksimum %6 risk',
          'Korelasyonlu pozisyonlara dikkat'
        ],
        'Stop-Loss Türleri': [
          'Sabit stop-loss',
          'ATR bazlı stop-loss',
          'Trailing stop-loss',
          'Zaman bazlı stop-loss'
        ]
      }
    },
    {
      id: 'psikoloji',
      name: 'Yatırımcı Psikolojisi',
      level: 'İleri',
      icon: Lightbulb,
      description: 'Başarılı yatırımın en önemli bileşeni duygusal kontroldür. Korku ve açgözlülük, yatırımcıların en büyük düşmanlarıdır.',
      content: {
        'Kaçınılması Gereken Hatalar': [
          'FOMO (Fırsatı Kaçırma Korkusu)',
          'Kayıp pozisyonu ortalama düşürme',
          'Aşırı işlem yapma',
          'Piyasaya intikam alma'
        ],
        'Doğru Yaklaşımlar': [
          'İşlem planına sadık kalma',
          'Duygusal kararlardan kaçınma',
          'Kayıpları kabul etme',
          'Sabırlı olma'
        ],
        'Disiplin Kuralları': [
          'Günlük/haftalık işlem limiti koy',
          'Kayıp serisinde mola ver',
          'İşlem günlüğü tut',
          'Sürekli öğren ve gelişe'
        ]
      }
    },
    {
      id: 'portfoy-yonetimi',
      name: 'Portföy Yönetimi',
      level: 'İleri',
      icon: PieChart,
      description: 'Portföy yönetimi, farklı varlık sınıfları arasında optimal dağılım yaparak riski minimize edip getiriyi maksimize etmeyi amaçlar.',
      content: {
        'Çeşitlendirme': [
          'Sektörel çeşitlendirme',
          'Coğrafi çeşitlendirme',
          'Varlık sınıfı çeşitlendirmesi',
          'Zaman çeşitlendirmesi'
        ],
        'Örnek Portföy Dağılımı': [
          'Hisse senetleri: %60',
          'Tahvil/Bono: %25',
          'Altın: %10',
          'Nakit: %5'
        ],
        'Rebalancing': 'Portföyü belirli aralıklarla hedef dağılıma geri getirme işlemidir.'
      }
    }
  ]

  const filteredItems = (items) => {
    if (!searchQuery) return items
    return items.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }

  const getColorClass = (color) => {
    const colors = {
      gold: 'bg-gold-500/20 text-gold-400 border-gold-500/30',
      red: 'bg-red-500/20 text-red-400 border-red-500/30',
      blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      green: 'bg-green-500/20 text-green-400 border-green-500/30',
      orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      primary: 'bg-primary-500/20 text-primary-400 border-primary-500/30'
    }
    return colors[color] || colors.primary
  }

  const renderContent = () => {
    let items = []
    switch (activeCategory) {
      case 'temel':
        items = temelAnalizKonulari
        break
      case 'teknik':
        items = teknikGostergeler
        break
      case 'tarama':
        items = taramaStratejileri
        break
      case 'egitim':
        items = finansalOkuryazarlik
        break
      default:
        items = []
    }

    return filteredItems(items)
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
          <BookOpen className="w-6 h-6 md:w-7 md:h-7 text-primary-500" />
          İnceleme Kütüphanesi
        </h1>
        <p className="text-gray-400 text-sm mt-1">Teknik ve temel analiz göstergeleri hakkında detaylı bilgi</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        <input
          type="text"
          placeholder="Gösterge veya konu ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-surface-100 border border-dark-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
        />
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setActiveCategory(cat.id); setSelectedItem(null); }}
            className={`px-3 md:px-4 py-2 rounded-xl font-medium text-sm transition-colors flex items-center gap-2 ${activeCategory === cat.id
              ? 'bg-primary-600 text-white'
              : 'bg-dark-800 text-gray-400 hover:text-white'
            }`}
          >
            <cat.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{cat.label}</span>
            <span className="sm:hidden">{cat.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {selectedItem ? (
        // Detay Görünümü
        <div className="bg-surface-100 rounded-2xl border border-dark-700 p-4 md:p-6">
          <button
            onClick={() => setSelectedItem(null)}
            className="text-sm text-primary-500 mb-4 hover:text-primary-400 flex items-center gap-1"
          >
            ← Listeye Dön
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className={`p-3 md:p-4 rounded-xl border ${getColorClass(selectedItem.color)}`}>
              <selectedItem.icon className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white">{selectedItem.name}</h2>
              <span className="text-sm text-gray-400">{selectedItem.category}</span>
            </div>
          </div>

          <p className="text-gray-300 mb-6 leading-relaxed">{selectedItem.description}</p>

          {selectedItem.details && (
            <div className="space-y-4">
              {Object.entries(selectedItem.details).map(([key, value]) => (
                <div key={key} className="bg-dark-800 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gold-400 mb-3">{key}</h4>
                  {Array.isArray(value) ? (
                    <ul className="space-y-2">
                      {value.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                          <ChevronRight className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-300 text-sm">{value}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {selectedItem.content && (
            <div className="space-y-4">
              {Object.entries(selectedItem.content).map(([key, value]) => (
                <div key={key} className="bg-dark-800 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-gold-400 mb-3">{key}</h4>
                  {Array.isArray(value) ? (
                    <ul className="space-y-2">
                      {value.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                          <ChevronRight className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-300 text-sm">{value}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Liste Görünümü
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {renderContent().map((item) => (
            <div
              key={item.id}
              className="bg-surface-100 rounded-xl border border-dark-700 p-4 cursor-pointer hover:border-primary-500/50 transition-colors"
              onClick={() => setSelectedItem(item)}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-lg border flex-shrink-0 ${getColorClass(item.color)}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-white text-sm md:text-base">{item.name}</h3>
                    <span className="text-[10px] md:text-xs bg-dark-700 text-gray-400 px-2 py-0.5 rounded whitespace-nowrap">
                      {item.category || item.level}
                    </span>
                  </div>
                  <p className="text-xs md:text-sm text-gray-400 line-clamp-2">{item.description}</p>
                  <button className="text-xs text-primary-500 flex items-center gap-1 mt-2 hover:text-primary-400">
                    Detayları Gör <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Uyarı */}
      <div className="bg-dark-800/50 rounded-xl p-4 border border-yellow-500/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs md:text-sm text-gray-400">
              Bu kütüphanedeki içerikler yalnızca <span className="text-white">teknik analiz eğitim amaçlıdır</span>.
              Hiçbir şekilde yatırım tavsiyesi, alım-satım önerisi veya yönlendirmesi niteliği taşımamaktadır.
              Yatırım kararlarınız tamamen kendi sorumluluğunuzdadır.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
