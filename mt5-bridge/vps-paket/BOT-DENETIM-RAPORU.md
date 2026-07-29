# Bot ve MT5 yürütme denetimi — 29 Temmuz 2026

Bu rapor kaynak kod/yürütme yolu denetimidir; geçmiş kârlılık kanıtı veya yatırım
getirisi garantisi değildir. Ekonomik hedef tek tek sinyal sayısını büyütmek değil,
**spread + komisyon + slippage sonrası pozitif beklenen değer** üretmektir. Bu nedenle
aday sinyal, brokerda gerçek ticket oluşana kadar Telegram'da “işlem” sayılmaz.

## Ortak uygulanan düzen

- Normal işlem riski sinyal kalitesine göre `%0,10–%0,25`; konsensüs (en az 3
  bağımsız bot) balanced bandın üstü `%0,25` kullanır. Bot, sembol+yön ve hesap
  tavanlarını hiçbir koşulda aşamaz.
- Sembol+yön ve bot başına açık risk `%0,50`; hesap hedef açık risk `%1,50`, hard
  tavan `%2,00`. Günlük yeni emir freni `%1,50` kayıpta devreye girer.
- Günlük kayıpta `%4,00` uyarı, `%4,25` STOP_MASTER + tüm bot pozisyonlarını kapatma,
  `%4,50` hard sınır; toplam drawdown için sırasıyla `%9,00/%9,25/%9,50`.
- Başlangıç sermayesine göre toplam equity kârı `%10` olduğunda tüm işlemler
  kapatılır, kalıcı STOP_MASTER yazılır ve insan onayı olmadan yeniden başlamaz.
- Aynı underlying bütün TF ve broker ekleriyle tek pozisyondur. Güçlü ters karar
  iki gözlemle doğrulanır; konsensüs teyidi yeterliyse eski ticket brokerda kapanıp
  yokluğu görülmeden ters emir gönderilmez.
- Lot; 10k/25k/50k/100k/200k hesap tier'ı, canlı equity, tick value, SL mesafesi ve
  mevcut riskten hesaplanır. `1.0 lot` yalnız mutlak tavandır. Broker minimum lotu
  güvenli riski aşıyorsa lot yukarı çekilmez, işlem reddedilir.
- Başlangıç riski en az `$15`, beklenen brüt hedef en az `$15`, R:R en az `1:2`
  (`1:3` seçilebilir). `$15` üretemeyen küçük/parite işlemi sırf geçmiş şişirmek
  için açılmaz. Acil risk, ters dönüş ve kâr koruma kapanışları bu tabandan muaftır.
- Merkez beyin hesabı 1 saniyede bir izler. Kâr tepesi geri-verme, hızlı “hype”
  dönüşü veya hızlanan ters hareket görülürse TP/SL beklenmeden pozisyon kapatılır.
- Açılış mesajı yalnız gerçek MT5 ticketından; kapanış mesajı yalnız gerçek MT5
  deal'inden üretilir. Mesajlarda bot/magic, yön, gerçekleşen giriş, SL, TP, lot;
  kapanışta çıkış, kâr, komisyon, swap, fee ve kesin net P/L bulunur. Kalıcı outbox
  başarısız gönderimi tekrar dener, ticket/deal idempotency tekrarı engeller.

Son istekteki “işlem başına `%0,5–%1`” önce verilen `%0,5` bot ve sembol hard
tavanıyla çeliştiği için yalnız ayrı agresif opt-in profilinde aday risk bandıdır;
hard tavanlar yine `%0,5` ile sınırlar. “±%10 olmadan kapanmasın” ifadesi de günlük
`%4,5` ve toplam `%9,5` zarar sınırıyla çeliştiğinden literal uygulanmadı; kuruş
işlemler `$15` kapısıyla kesildi, acil çıkışların önüne hiçbir minimum konmadı.

## Canlı MT5'e uygun botlar — tek tek değerlendirme

| # | Bot / yürütme magic | Olumlu taraf | Temel olumsuzluk / ekonomik risk |
|---:|---|---|---|
| 1 | Forex Sinyalleri / `550055` | Adanmış köprü, çoklu-TF teyidi ve iz süren stop | Majör paritelerde küçük dolar hareketi spread/komisyonla eriyebilir; `$15` ve R:R kapısı şart |
| 2 | Pro Robot / `5702` | Birden fazla teknik teyitle seçicilik | Aynı indikatör ailesi sahte çeşitlendirme yaratabilir; ortak underlying kilidi gerekli |
| 3 | Altın Sinyalleri / `5703` | XAU'nun dolar hareketi maliyetleri karşılamaya daha elverişli | Haber anında spread, gap ve slippage çok büyür; 1 lot hiçbir zaman otomatik hedef değildir |
| 4 | Beast Trend / `5704` | Güçlü rejimde büyük trendi taşıyabilir | Deneysel ve yatay piyasada whipsaw/seri zarar riski yüksek |
| 5 | MT5 Gün İçi Tarayıcı / `550066` | Adanmış köprü, ticket eşlemesi ve 23:45 EOD kapatma | Fazla sinyal churn üretir; minimum P/L ve hesap-geneli risk olmadan maliyet şişirir |
| 6 | Kripto Sinyalleri / `5706` | 7/24 ve yüksek momentum yakalama | Hafta sonu likiditesi, gap benzeri sıçrama ve broker spreadi yüksek |
| 7 | MTF Konfluans / `5707` | Zaman dilimi teyidi yanlış sinyali azaltır | TF'ler bağımsız değildir; gecikme giriş fiyatını ve R:R'yi bozabilir |
| 12 | Dalga Tarayıcı / `5712` | Swing yapısını ve daha büyük hareketi hedefler | Dalga sınıflaması rejime duyarlı ve geç/öznel sinyal üretebilir |
| 13 | NR7 Gölge / `5713` | Sıkışma sonrası volatilite açılımını arar | “Gölge” adına rağmen canlıya uygun katalogda; false-break ve spread riski yüksek, deneysel izlenmeli |
| 14 | ICT/FVG Akışı / `5714` | Dengesizlik bölgeleriyle tanımlı giriş/stop | FVG sıklığı aşırı işlem ve hindsight seçimi doğurabilir |
| 15 | ICT/SMC Çoklu Strateji / `5715` | Farklı yapı kurulumlarını tek evrende ölçer | Aynı fiyat yapısının birden çok etiketi korelasyon ve tekrar sinyal yaratabilir |
| 16 | MT5 Trend Takip / `5716` | Uzun, yönlü rejimlerde pozitif sağ kuyruk | Yatay rejimde ardışık küçük stoplar ve gecikmeli dönüş |
| 17 | MT5 Momentum / `5717` | Güçlü hareketin devamından yararlanır | Kalabalık pozisyon/gap ve geç giriş riski |
| 18 | MT5 Aşırı Bölge Dönüşü / `5718` | Yatay/ortalama-dönen rejimde iyi giriş fiyatı | Güçlü trend karşısında “ucuz daha ucuz” olup ağır zarar üretebilir |
| 19 | MT5 Ichimoku Bulut / `5719` | Trend, yapı ve destek/direnci birlikte süzer | Yavaş ve gecikmeli; sıkışık piyasada çok sayıda yön değişimi |
| 20 | ICT 2022 / `5730` | Likidite + yapı + FVG birleşimi seçicidir | Saat/rejim ve veri kalitesine çok hassas, az örnekle overfit olabilir |
| 21 | ICT Silver Bullet / `5731` | Belirli seans penceresi churnü sınırlar | Seans penceresi dışında fırsat kaçırır; DST ve broker saat riski |
| 22 | ICT Unicorn / `5732` | Breaker ve FVG çift teyidi | Nadir sinyal, küçük örneklem ve model tanımı belirsizliği |
| 23 | ICT OTE / `5733` | Geri çekilmede daha iyi fiyat/R:R arar | Trend dönmüşse geri çekilme değil yeni rejim olabilir |
| 24 | ICT CISD / `5734` | Erken momentum dönüşünü yakalamaya çalışır | Erken sinyal gürültüsü ve flip-flop riski |
| 25 | ICT Likidite Süpürme / `5735` | Stop avı sonrası ters hareketi hedefler | Gerçek kırılımı yanlışlıkla süpürme sayıp ters kalabilir |
| 26 | ICT OB/Breaker Retest / `5736` | Tanımlı bölge stopu ve retest disiplini | Bölge seçimi çoğalırsa veri madenciliği ve tekrar işlem riski |
| 27 | ICT Yapı CHoCH/BOS / `5737` | Piyasa yapısı değişimini açık kurala bağlar | Pivot gecikmesi ve mikro yapıda çok fazla sahte kırılım |
| 28 | Trend + ICT / `5738` | Trend ile yapı teyidi yanlış pozitifleri azaltır | Filtreler korele; onay gecikmesi reward alanını azaltabilir |
| 29 | Momentum + ICT / `5739` | Hız ve likidite yapısını birlikte arar | Hızlı piyasada slippage, geç piyasada momentum çöküşü |
| 30 | Turtle Kanal Kırılımı / `5740` | Basit, denetlenebilir, büyük trendlerde güçlü | Düşük kazanma oranı ve uzun whipsaw serileri psikolojiyi zorlar |
| 31 | TTM Squeeze / `5741` | Volatilite rejim değişimini yakalar | Açılım yönü belirsiz; ilk kırılım sıkça sahte olabilir |
| 32 | RSI-2 Geri Dönüşü / `5742` | Kısa süreli aşırılığı sistematik işler | Trend filtresi zayıflarsa güçlü düşüşe karşı pozisyon biriktirir |
| 34 | Zaman Serisi Momentum / `5744` | Varlık-bazlı yön devamını yakalar | Rejim dönüşünde yavaş; korele enstrümanlarda aynı makro bahsi büyütür |
| 36 | Strateji Evrimi / `5748` | Walk-forward/OOS kapısıyla hücre bazlı uyum | Çoklu deneme ve selection bias; kanıt yoksa susması zorunlu |
| 37 | Konsensüs Radarı / `5749` | En az 3 farklı botun aynı sembol+yön kararını doğrular; daha yüksek balanced band kullanır | Botlar koreleyse “3 oy” 3 bağımsız bilgi değildir; hard risk tavanından muaf değildir |
| 38 | BK XAU Runner / `5750` scalp, `5751` swing | XAU scalp/swing ayrı kimlik ve maliyet/R filtresi | Scalp dar stopta komisyon/slippage'a en hassas akıştır; sakin piyasada reddedilmesi doğrudur |
| — | Standalone Altın Botu / `20260707` | Broker spread/marjin/tick tazeliği ve doğrulanmış strateji kapıları var | İkinci XAU kaynağıdır; merkez underlying kilidi olmazsa 5703/5750/5751 ile risk yığardı |

## Bilinçli olarak gerçek MT5 emrine bağlanmayanlar

| Bot | Neden |
|---|---|
| BIST Sinyalleri `5708`, EMA/TEMA `5709`, TEMA34 `5710`, BIST AL `5711` | Kullanılan MT5/FTMO enstrüman evreninde BIST hisseleri yok; Telegram/site takibi sürer fakat sahte sembolle emir açılmaz. |
| London Breakout `5743` | Spread sonrası kenar kanıtı yetersiz; en az 60 seans ve PF≥1,2 olmadan canlıya terfi etmez. |
| ADX Pullback/Holy Grail `5745` | Kamu/OOS kanıtı yetersiz; en az 50 paper işlem ve PF≥1,2 olmadan canlıya terfi etmez. |
| Haber Uyarıları, Hesap Raporu | Destek servisidir; emir açma yetkisi verilmesi görev ayrılığı ve güvenlik ihlali olur. |

## Sonuç

Önceki ana sorun tek tek stratejiden çok **ortak bütçe olmaması, aynı ekonomik
riski farklı bot/TF adlarıyla üst üste açma, broker sonucu yerine aday sinyali
bildirme ve kârı realize edecek hesap-geneli otorite bulunmamasıydı**. Yeni yapıda
stratejiler fikir üretir; para ve emir yetkisi yalnız deterministik merkez beyindedir.
LLM/API canlı emir otoritesi özellikle kapalıdır: ağ gecikmesi, nondeterminizm ve
denetlenemeyen çıktı finansal hard-limitlerin yerine geçemez.
