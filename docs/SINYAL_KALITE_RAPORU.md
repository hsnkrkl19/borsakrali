# Sinyal Kalitesi ve Tutarlılık Raporu

**Rol:** Finans profesörü / kantitatif analiz
**Kapsam:** borsasanati-clone sinyal motorları (borsa, kripto, forex)
**Tarih:** 2026-07-05
**Durum:** Faz 1–4 kod olarak tamamlandı (ortak katman + 5 motora fail-safe shadow kanca + backtest maliyet/walk-forward + izleme) · 55/55 test · kalibratör tohumlandı (1.627 örnek, 17 namespace). Canlıya alma: `SINYAL_KALITE_DEPLOY.md`.

> **Önemli not:** Bu belge sinyal ÜRETİM METODOLOJİSİNİ ve mühendislik disiplinini iyileştirmeye yöneliktir. Kâr garantisi değildir ve bireysel yatırım tavsiyesi içermez. Piyasa riski her zaman mevcuttur.

---

## 0. Yönetici Özeti

Sistemde beş bağımsız sinyal motoru var: `proEngine` (BTC/altın/S&P/EURUSD konfluans), `universalScorer` (BIST/hisse), `mtfScorer` + `multiTimeframeService` (çoklu zaman dilimi), `cryptoScorer` (kripto) ve `beast` (trend). Her biri ayrı ayrı makul; ancak **tutarsızlığın kök nedeni** hepsinin farklı ölçek ve elle konmuş eşikler kullanması: bir motorda "7/12", diğerinde "6/10", bir başkasında "0–100 ham skor". Bu skorlar gerçek kazanma olasılığına kalibre edilmediği için "%70 güven" etiketi ile gerçekleşen isabet oranı birbirini tutmuyor.

Faz 1'de, canlı motorları hiç değiştirmeden çalışan, bağımsız ve **testli** bir ortak katman (`signalQuality`) kuruldu. Bu katman beş sorunu tek noktadan çözüyor: olasılık kalibrasyonu, rejim filtresi, kolinyerlik düzeltmesi, işlem maliyeti ve birleşik güven skalası. Sentetik ama örneklem-dışı doğrulamada, "ham skoru güven say" yaklaşımına kıyasla **kalibrasyon hatası (ECE) %84 azaldı** (0.137 → 0.022) ve Brier skoru %10.5 düştü. 40 birim testinin tamamı geçiyor.

---

## 1. Mevcut Mimari

| Motor | Piyasa | Skor ölçeği | BUY/SELL kararı | Seviye (SL/TP) |
|---|---|---|---|---|
| proEngine / forexAggregator | BTC, altın, S&P, EURUSD | 0–100 ham güven | ≥3/4 zaman dilimi + (4h veya 1d) konfluans, `MIN_CONFIDENCE=50` | ATR tabanlı, `MIN_RR=1.5` |
| universalScorer | BIST / hisse | 10 koşuldan oran | oran ≥0.50 ORTA, ≥0.80 MÜKEMMEL | `1.5×ATR` stop, `2.5×ATR` hedef |
| mtfScorer + multiTimeframe | Kripto/çoklu TF | 12 koşul + ağırlıklı net | `net≥7.0` STRONG_LONG, `≥4.5` LONG | TF profiline göre ATR |
| cryptoScorer | Kripto (top 100) | 10 koşul, `MIN_SCORE=6` | oran ≥0.60 GÜÇLÜ | 1.5–2.5×ATR |
| beast | BTC/ETH/XAU/XAG trend | 8 katman konfluans | ZLEMA yönü + HTF hizası + tetik | fraktal swing ± ATR, `rr1=1.5`, `rr2=3.0` |

Ortak zayıflık: Skorlar arası **ortak dil yok**. Aynı gerçek olasılığa sahip iki sinyal, hangi motordan geldiğine göre farklı işleniyor.

---

## 2. Teşhis: Tutarsızlığın Beş Kök Nedeni

### 2.1 Güven skoru olasılığa kalibre değil
Ağırlıklar elle konmuş (`BASE_WEIGHTS`: genel 3.0, smc 2.5, snr 2.0, ...) ve eşikler backtest'e göre optimize edilmemiş sihirli sayılar: `MIN_CONFIDENCE=50`, `net≥7.0`, güven karışımı `0.32·konsensüs + 0.24·avgScore + 0.16·trendGücü + ...`, kalibrasyon sigmoidi `-2.2 + 4.4·oran`. Bunların hiçbiri "bu skor gerçekte %kaç kazanır" sorusuna veriyle bağlı değil. Sonuç: güven etiketi ile gerçek isabet birbirini tutmuyor ve motordan motora anlam kayıyor.

### 2.2 İndikatör kolinyerliği → sahte konsensüs
proConfluence'ta 11 teknik çalışıyor ama çoğu aynı fiyat hareketini ölçüyor: `genel`, `ema34`, `tema34` hepsi EMA tabanlı; `rsi`, `macd`, `momentum`, `divergence` momentum ailesi. Trend piyasasında bunların korelasyonu ρ≈0.7. Her biri +1 oy sayılınca "5 teknik onayladı" görüntüsü aslında tek bir bağımsız sinyalin beş kopyası oluyor. Bu, güveni yapay olarak şişiriyor.

### 2.3 Rejim filtresi yok
Yatay/choppy piyasada zayıf sinyaller `MIN_CONFIDENCE=50` eşiğini geçip yayınlanıyor. Volatilite rejimi yalnızca güveni %15 kırpıyor (`REGIME_MULT.low=0.85`), sinyali ELEMİYOR. Oysa trend olmayan piyasada üretilen sinyaller isabet dağılımını en çok bozan gruptur.

### 2.4 Backtest dürüst değil → canlı ≠ backtest
JS backtest'lerinde (bist, forex, pro, mtf) işlem maliyeti, spread ve slippage modellenmemiş; R:R saf geometrik hesaplanıyor. Ayrıca train/test ayrımı veya walk-forward yok — her şey örnek-içi (in-sample), aşırı-uyum (overfitting) görünmez. Beklenti iyimser çıkıyor.

### 2.5 Canlı takip ile backtest farklı mantık kullanıyor
`cryptoSignalTracker` sinyali yayınlandığı andan itibaren 1 saatlik mumlarla izlerken, backtest 10 günlük ufuk kullanıyor. TP kapısında zaman koruması varken SL kapısında yok (satır ~108-109). Bu yüzden raporlanan isabet oranı ile backtest oranı yapısal olarak sapıyor.

---

## 3. "Tutarlılık" Nasıl Ölçülür

Tutarlılık öznel bir kelime; ölçülebilir hale getirmeden iyileştirilemez. Üç somut ölçüt kullanıyoruz:

**Kalibrasyon hatası (ECE / Brier).** "%70 dediğinde gerçekten ~%70 kazanıyor mu?" sorusunun cevabı. Expected Calibration Error (ECE) = tahmin ile gerçekleşen isabetin, güven kovalarındaki ağırlıklı mutlak farkı. Brier = ortalama karesel tahmin hatası. İkisi de düşükse güven etiketi güvenilirdir. Bu, "tutarlılık"ın birincil ölçütüdür.

**Canlı–backtest sapması.** Aynı sinyal mantığının canlı isabet oranı ile backtest isabet oranı arasındaki fark. Sıfıra ne kadar yakınsa metodoloji o kadar tutarlıdır.

**Rejim-bazlı stabilite.** İsabet oranının trend / yatay / yüksek-vol rejimleri arasında ne kadar oynadığı. İyi bir sistem rejimler arası nispeten kararlıdır (ya da her rejim için ayrı kalibre edilmiştir).

---

## 4. Faz 1 Teslimi: Ortak `signalQuality` Katmanı

Konum: `backend/src/services/signalQuality/`. Bağımsız, sıfır dış bağımlılık, saf fonksiyonlar. Canlı motorları DEĞİŞTİRMEZ; motorlar isteğe bağlı çağırır.

**`indicators.js`** — Test edilmiş TA çekirdeği (EMA, Wilder ATR, Wilder ADX/DI, Choppiness Index). Tek ve doğrulanmış kaynak.

**`regime.js`** — `detectRegime(candles)`: ADX + Choppiness + ATR% ile trend/chop/high-vol tespiti ve bir **gate**. Choppy rejimde sinyali bloklar, yüksek-vol rejimde geçirir ama pozisyon boyutu çarpanını düşürür (2.3'ü çözer).

**`calibration.js`** — İki katmanlı Empirical-Bayes + izotonik regresyon. Ham skoru gerçek olasılığa eşler; küçük örnekte prior'a shrinkage yapar (tek kazanç %100'e atlamaz), kovalar arası monotonluğu PAVA ile garanti eder, Beta güven aralığı verir (2.1'i çözer).

**`confluence.js`** — Kolinyerlik-farkında birleştirme. Teknikler korelasyon gruplarına ayrılır; grup içi azalan getiri, gruplar arası bağımsız pekiştirme. 3 korelasyonlu EMA oyu ~1 bağımsız oy değerinde sayılır (2.2'yi çözer).

**`costModel.js`** — Varlık sınıfı bazlı gidiş-dönüş maliyet (bps) ile net R:R, maliyetin kaç R yediği ve başabaş isabet oranı (2.4'ün maliyet ayağını çözer).

**`unifiedConfidence.js`** — Hepsini TEK sözleşmeye bağlar: `confidence` (0–100) = modellenen kazanma olasılığı × 100. Motordan bağımsız aynı anlam. Grade ve yayın kararı, keyfi eşik yerine maliyet-ayarlı başabaş oranın üstündeki **avantaja (edge = p − p*)** göre verilir.

### Doğrulama sonuçları (örneklem-dışı)

Gerçek kazanma olasılığının skorun doğrusal-olmayan fonksiyonu olduğu 6000 sentetik sinyalde, %60 eğitim / %40 test ayrımıyla:

| Ölçüt | Naive ("skor = güven") | Kalibre katman | İyileşme |
|---|---|---|---|
| ECE (kalibrasyon hatası) | 0.137 | 0.022 | **%84 azalma** |
| Brier | 0.197 | 0.176 | %10.5 azalma |

Örnek güvenilirlik satırı: gerçek olasılık %75 iken naive "%90" derken kalibre katman "%82" diyor — aşırı-güven belirgin biçimde azalıyor. Rejim kapısı testte trend piyasasını geçirdi (ADX≈100, gate açık), yatay piyasayı blokladı (ADX≈4, CI≈86, gate kapalı). 40/40 birim testi geçiyor.

---

## 5. Fazlı Yol Haritası

**Faz 1 — Ortak kalite katmanı (TAMAMLANDI).** Bağımsız, testli altyapı. Riski sıfır: canlı kod değişmedi.

**Faz 2 — Entegrasyon + veri toplama (öneri: 1–2 hafta).** Her motorun yayın anında `evaluateSignal(...)` çağırıp sonucu (namespace + qualityScore) loglaması; pozisyon kapanınca `recordOutcome(...)` ile kalibratörü beslemesi. İlk aşamada "gölge mod": kalibre güveni HESAPLA ve KAYDET ama yayın kararını değiştirme. Böylece 4–8 hafta gerçek veri birikirken hiçbir risk alınmaz. `INTEGRATION.md` her motor için tam örnek içerir.

**Faz 3 — Dürüst backtest + walk-forward (öneri: 2–3 hafta).** JS backtest'lerine `costModel` maliyetini ekle; genişleyen-pencere walk-forward doğrulaması kur (yıl 1 eğit, yıl 2 test); canlı takipçinin ufkunu backtest ufkuyla eşitle; SL/TP intrabar önceliğini tek kurala bağla (stop önce). Kalibrasyonu bu dürüst backtest çıktısıyla besle.

**Faz 4 — İzleme ve otomatik yeniden kalibrasyon (öneri: sürekli).** Haftalık ECE/Brier panosu; kalibrasyon verisine zaman-çürümesi (eski işlemleri azalt); rejim başına ayrı kalibrasyon; performans düşünce ilgili namespace'i otomatik "gölge"ye alma.

---

## 6. Riskler ve Uyarılar

Kalibrasyon geçmiş veriye dayanır; rejim değişiminde (örneğin uzun boğadan ayıya geçiş) bir süre gecikmeli kalır — bu yüzden zaman-çürümesi (Faz 4) önemlidir. Sentetik doğrulama katmanın matematiğini kanıtlar ama gerçek edge'i kanıtlamaz; onu ancak Faz 2'de birikecek canlı veri gösterir. Maliyet varsayılanları makul büyüklüklerdir, gerçek broker/borsa komisyonlarıyla kalibre edilmelidir. Ve tekrar: bu sistem metodolojiyi iyileştirir, kâr garanti etmez.
