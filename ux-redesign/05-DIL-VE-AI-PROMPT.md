# PARÇA 5 — Dil Temizliği + Türkçe Tutarlılığı + Master AI Düzeltme Promptu

> Bu prompt'u yeni bir Claude oturumuna yapıştırıp çalıştırabilirsin.
> Bağımlılık: Parça 1 (menü). Parça 2/3/4 öncesi veya paralel çalıştırılabilir — diğer parçalar bu sözlüğü temel alır.

---

## Amaç

Tüm sitedeki metinleri tek bir tutarlı, sade, çocuğun bile anlayacağı Türkçeye çevir. İngilizce kaçak kelime kalmasın, devrik cümle düzelt, RSI/MACD/ATR gibi teknik kısaltmaları üst arayüzden temizle (detay panelinde kalabilir), Türkçe karakter sorunlarını gider.

---

## Bağlam

- **Tarama alanı**:
  - `borsasanati-clone/frontend/src/**/*.{jsx,js,ts,tsx}`
  - `borsasanati-clone/backend/src/**/*.js` (özellikle push notification metinleri, error response message'ları, cron log/bildirim çıktıları)
  - `borsasanati-clone/frontend/public/**/*.html`
  - Locale dosyaları varsa: `src/locales/tr.json` benzeri

- **Dahil edilmeyecek**:
  - `node_modules/`
  - Yorum satırları (kod içinde) — sadece string literal ve JSX text node
  - Console.log debug metinleri (ama push, toast, alert, throw new Error metinleri DAHİL)
  - Log dosyaları, build çıktıları

---

## Mevcut Sorun

1. **İngilizce kaçaklar**: `Loading...`, `Error`, `No data`, `Sign in`, `Subscribe`, `Buy`, `Sell`, `Cancel` gibi.
2. **Teknik kısaltmalar**: RSI, MACD, EMA, ATR, Fibonacci, ADX, Stoch, OBV — ana akışta görünüyor.
3. **Devrik/robotik cümleler**: "Sinyal tetiklendi.", "Veri yüklenemedi.", "İşlem başarısız.", "Parametre geçersiz."
4. **Tutarsız Türkçe**: aynı kavram için farklı kelime — "izle/takip et", "uyarı/alarm/bildirim", "fiyat/değer/kotasyon".
5. **Türkçe karakter sorunları**: ı/i, ş/s, ğ/g, ç/c, ö/o, ü/u eksikleri (özellikle log/debug metinlerinde).
6. **Büyük/küçük harf tutarsızlığı**: bazen "Al" bazen "AL" bazen "Satın al".

---

## Hedef — Master Kelime Sözlüğü

### Bölüm A — Aksiyon Kelimeleri

| Eski | Yeni (Standart) |
|------|-----------------|
| Buy / Long / BUY | **AL** |
| Sell / Short / SELL | **SAT** |
| Hold / Neutral / HOLD | **BEKLE** |
| Watch / Monitor | **TAKİP ET** |
| Subscribe | **Üye Ol** veya **Premium'a Geç** |
| Sign in / Login | **Giriş Yap** |
| Sign up / Register | **Kayıt Ol** |
| Logout / Sign out | **Çıkış Yap** |
| Cancel | **İptal** |
| Confirm | **Onayla** |
| Save | **Kaydet** |
| Delete / Remove | **Sil** |
| Edit | **Düzenle** |
| Add | **Ekle** |
| Refresh / Reload | **Yenile** |
| Search | **Ara** |
| Filter | **Süz** veya **Filtrele** |
| Settings | **Ayarlar** |
| Help | **Yardım** |
| Loading... | **Yükleniyor…** |
| Submit | **Gönder** |
| Continue | **Devam Et** |
| Back | **Geri** |
| Close | **Kapat** |
| Open | **Aç** |

### Bölüm B — Teknik Terimler (UI'dan SİL, detayda kalır)

| Üst arayüzde GÖSTERME | Yerine |
|-----------------------|--------|
| RSI, MACD, EMA, ATR, Stoch, OBV, ADX, CCI, Bollinger | (hiç gösterme, "indikatör" deme; etkisini cümleye çevir) |
| Indicator / Oscillator | (kullanma; ne yaptığını yaz) |
| Trend / Trend Reversal | "Yön" / "Yön değişimi" |
| Support / Resistance | "Alt sınır" / "Üst sınır" |
| Breakout | "Çıkış" |
| Breakdown | "Düşüş" |
| Divergence | "Uyumsuzluk" veya hiç gösterme |
| Volume | "Hacim" |
| Volatility | "Oynaklık" |
| Volatility regime: high / low | "Oynak piyasa" / "Sakin piyasa" |
| Momentum | "Hız" veya gösterme |
| Confluence | "Birleşik görüntü" |
| Timeframe / TF / 1m, 5m, 1h, 1d, 1w | "Kısa vade" / "Orta vade" / "Uzun vade" — sayı gösterme |
| Backtest | "Geçmiş test" (sadece sertifika rozeti olarak) |
| Walk-forward / Monte Carlo / OOS | (hiç gösterme — gelişmiş mod akordeyonu hariç) |
| Sharpe / Calmar / MAR / Profit Factor | (sade Türkçe etiket; bkz. Parça 3) |
| Confidence: 0.78 | "Güçlü" (≥0.7) / "Orta" (0.4-0.7) / "Zayıf" (<0.4) |
| Score: 14/16 | (gösterme — etikete map'le) |

### Bölüm C — Finansal Kavramlar

| Eski | Yeni |
|------|------|
| Stop Loss | **Zarar Durdur** |
| Take Profit | **Kâr Al** |
| Trailing Stop | **Akıllı Zarar Durdur** |
| Position Size | **İşlem Büyüklüğü** |
| Leverage | **Kaldıraç** (uyarı dilinde "kat sayısı") |
| Risk/Reward Ratio | "Kazanç ihtimali zarardan ~X kat fazla" |
| Drawdown / Max DD | "En kötü dönemde düşüş" |
| Win Rate | "Kârlı işlem oranı" |
| Portfolio | **Portföy** |
| Watchlist | **Takip Listesi** |
| Alert / Alarm | **Alarm** (standart — "uyarı" yerine) |
| Notification | **Bildirim** |
| Quote / Price | **Fiyat** |
| Bid / Ask | (sade kullanıcıya gösterme; gelişmiş modda kalsın) |
| Spread | (gelişmiş modda) |
| Order | **Emir** |
| Trade | **İşlem** |
| Fee / Commission | **Komisyon** |
| Margin | **Teminat** |

### Bölüm D — Durum / Hata Cümleleri

| Eski | Yeni |
|------|------|
| Error | "Bir şeyler ters gitti." |
| Failed to fetch | "Veri alınamadı." |
| Network error | "İnternet bağlantısı yok gibi görünüyor." |
| Server error (500) | "Sistemde bir sorun var, biraz sonra dene." |
| Invalid token / Unauthorized | "Oturum süren doldu, tekrar gir." |
| Forbidden / Premium required | "Bu özellik Premium üyelere özel." |
| Not found | "Aradığını bulamadık." |
| Validation failed | "Eksik veya hatalı bilgi var." |
| Rate limit | "Çok hızlı tıkladın, birkaç saniye bekle." |
| Timeout | "İşlem uzun sürdü, tekrar dener misin?" |
| No data | "Henüz veri yok." |
| No results | "Sonuç bulunamadı." |
| Coming soon | "Yakında." |
| Beta | "Deneme aşaması." |
| Premium feature | "Premium özellik." |

### Bölüm E — Bildirim/Push Metinleri

| Eski (genelde İngilizce/teknik) | Yeni |
|----------------------------------|------|
| Signal triggered: BUY THYAO @47.20 | "THYAO için al sinyali — yükseliş başladı. (47.20 TL)" |
| Daily signals ready (top 10) | "Bugünkü fırsat listesi hazır." |
| Bot opened LONG ASELS | "Bot ASELS aldı." |
| Bot closed position +2.3% | "Bot satış yaptı. Kâr: %2.3" |
| Stop loss triggered | "Zarar durdurma çalıştı, çıkıldı." |
| Take profit reached | "Kâr hedefine ulaşıldı, satıldı." |
| Alert: price crossed 45.00 | "Alarmın çaldı: ASELS 45 TL'yi geçti." |
| Subscription expiring in 3 days | "Aboneliğin 3 gün sonra bitiyor." |
| Subscription renewed | "Aboneliğin yenilendi." |
| New feature available | "Yeni bir özellik eklendi." |
| Crypto signal: BTCUSDT STRONG_LONG | "Bitcoin için al sinyali — güçlü yükseliş." |

### Bölüm F — Tutarlılık (Eşanlamlıları Tekleştir)

| Birden fazla varyant | Kanonik (tek kullan) |
|----------------------|----------------------|
| izle / takip et / monitör | **takip et** |
| uyarı / alarm / bildirim | "alarm" = manuel fiyat uyarısı, "bildirim" = sistem mesajı (push) |
| fiyat / değer / kotasyon | **fiyat** |
| zarar / kayıp | **zarar** (sermaye kaybı için), **kayıp** (genel) |
| kâr / kazanç | **kâr** (finansal), **kazanç** (genel) |
| hisse / pay senedi / pay | **hisse** |
| kripto / coin / kripto para | **kripto** (genel), **coin** (özel hayvan ismi gibi BTC/ETH için kullanma) |
| yatırım / işlem / trade | **işlem** (al/sat anı), **yatırım** (uzun vadeli pozisyon) |
| sinyal / ipucu / işaret | **sinyal** |
| AI / yapay zeka / akıllı | **akıllı** (UI'da), **yapay zeka** (eğitim/hakkımızda metinlerinde) |

### Bölüm G — Yazım Kuralları

1. **Türkçe karakter zorunlu**: ı, i, İ, I, ş, ğ, ç, ö, ü, Ş, Ğ, Ç, Ö, Ü — `i` yerine `i̇` veya ASCII fallback kullanma.
2. **Cümle sonu nokta**: tüm UI cümleleri nokta ile biter. Tek kelimelik etiketler (`AL`, `BEKLE`) bitmez.
3. **Sayı + birim arası boşluk**: `47.20 TL` (boşluk var), `%2.3` (yüzde işaretinden sonra boşluksuz).
4. **Tarih formatı**: `17 Mayıs 2026` veya `17.05.2026` — `2026-05-17` sadece sistemde, UI'da değil.
5. **Saat formatı**: `14:32` (24 saat) — `2:32 PM` kullanma.
6. **Büyük harfli etiketler**: `AL`, `SAT`, `BEKLE`, `RİSKLİ`, `TAKİP ET` — tüm harfler büyük. Diğer her şey normal case.
7. **Tırnak**: çift Türkçe tırnak `"…"` (Unicode U+201C/U+201D) yerine düz tırnak `"…"` — kod string'lerinde bozulmasın diye.
8. **Devrik cümle yasak**: "Sinyal tetiklendi." → "Hareket başladı."
9. **Pasif yapı yerine aktif**: "Veri yüklenemedi." → "Veri alamadık." veya "Veri yok."

---

## Adım Adım Yapılacaklar

1. **`src/utils/locale.js`** oluştur (veya mevcut locale dosyasını kullan). Yukarıdaki A-E sözlüklerini export et. Bunu helper olarak değil, sadece referans dosyası olarak tut — değişiklikler doğrudan kaynaklara uygulanacak.

2. **Master tarama scripti** çalıştır. AI ile her dosyayı tek tek tarayıp aşağıdaki kuralları uygula. Her değişiklikten önce ne değiştiğini logla.

3. **Backend push servis dosyaları** öncelikli (kullanıcı en çok burayı görüyor):
   - `backend/src/services/signalService.js`
   - `backend/src/services/cryptoSignalService.js`
   - `backend/src/services/mtfService.js`
   - `backend/src/services/notifications.js` (veya pushService.js)
   - Tüm `cron/` dosyaları

4. **Frontend API client** error handling:
   - `src/services/api.js` — interceptor error message map'leri
   - `src/services/auth.js` — login/register error message'ları

5. **Sayfa ve component metinleri** — JSX text node'lar ve string literal'lar:
   - `src/pages/*.jsx`
   - `src/components/*.jsx`

6. **Toast/alert/modal metinleri** — özellikle `showError`, `showSuccess`, `alert`, `confirm` çağrılarındaki string'ler.

7. **Türkçe karakter kontrolü**: `grep -rn "[a-zA-Z]" --include="*.jsx" --include="*.js"` içinden, Türkçe görünmesi gereken yerlerde ASCII fallback bul (`sifre` → `şifre`, `urun` → `ürün`, vb.)

8. **Tutarlılık taraması** — Bölüm F'deki eşanlamlıları tek varyanta indir.

---

## Master AI Düzeltme Promptu (Kopyala-Yapıştır)

```
BorsaKrali projesinde tüm UI/push/error metinlerini, aşağıdaki sözlüğe göre ultra sade Türkçe'ye çevir.

Dizin: C:\Users\hsnkr\Desktop\site\borsasanati-clone

TARAMA ALANI:
- borsasanati-clone/frontend/src/**/*.{jsx,js}
- borsasanati-clone/backend/src/**/*.js
- borsasanati-clone/frontend/public/**/*.html

DAHİL ETME:
- node_modules
- Test dosyaları (*.test.js, *.spec.js)
- Build çıktıları (dist/, build/)
- Yorum satırları (// veya /* */) — bunları DEĞİŞTİRME
- console.log debug metinleri

DAHİL ET:
- JSX text node'ları
- String literal'lar (HTML için props, button labelları, toast mesajları, alert/confirm metinleri, throw new Error mesajları)
- Push notification body/title
- API error response message field'ları

SÖZLÜK (eski → yeni — her dosyada bulduğun bu kelimeleri değiştir):

AKSİYON:
Buy/Long/BUY → AL
Sell/Short/SELL → SAT
Hold/Neutral/HOLD → BEKLE
Watch/Monitor → TAKİP ET
Subscribe → Üye Ol veya Premium'a Geç
Sign in/Login → Giriş Yap
Sign up/Register → Kayıt Ol
Logout/Sign out → Çıkış Yap
Cancel → İptal
Confirm → Onayla
Save → Kaydet
Delete/Remove → Sil
Edit → Düzenle
Add → Ekle
Refresh/Reload → Yenile
Search → Ara
Loading... → Yükleniyor…
Submit → Gönder
Continue → Devam Et
Back → Geri
Close → Kapat
Open → Aç

TEKNİK (UI'dan SİL veya cümleye çevir):
RSI, MACD, EMA, ATR, Stoch, OBV, ADX, Bollinger → cümleye çevir veya kaldır
Indicator/Oscillator → "gösterge" veya kaldır
Trend → "yön"
Support/Resistance → "alt sınır" / "üst sınır"
Breakout → "çıkış"
Volatility regime: high → "Oynak piyasa"
Volatility regime: low → "Sakin piyasa"
Momentum → "hız" veya kaldır
Confluence → "birleşik görüntü"
Timeframe/TF → "kısa vade" / "orta vade" / "uzun vade"
1m, 5m, 15m → "1 dakikalık" vs. (mümkünse "kısa vade")
1h, 4h → "orta vade"
1d, 1w → "uzun vade"
Confidence: 0.78 → "Güçlü" / "Orta" / "Zayıf"
Score: X/Y → ETIKETE MAP'LE — etiket: AL/BEKLE/TAKİP/ŞİMDİ GİRME/RİSKLİ

FİNANSAL:
Stop Loss → Zarar Durdur
Take Profit → Kâr Al
Trailing Stop → Akıllı Zarar Durdur
Position Size → İşlem Büyüklüğü
Leverage → Kaldıraç
Risk/Reward → "Kazanç ihtimali zarardan ~X kat fazla"
Max Drawdown → "En kötü dönemde düşüş"
Win Rate → "Kârlı işlem oranı"
Portfolio → Portföy
Watchlist → Takip Listesi
Alert → Alarm
Notification → Bildirim
Quote → Fiyat
Order → Emir
Trade → İşlem
Fee → Komisyon

HATA/DURUM:
Error → "Bir şeyler ters gitti."
Failed to fetch / Failed → "Veri alınamadı." veya "İşlem yapılamadı."
Network error → "İnternet bağlantısı yok gibi görünüyor."
Server error / 500 → "Sistemde bir sorun var, biraz sonra dene."
Invalid token / Unauthorized / 401 → "Oturum süren doldu, tekrar gir."
Forbidden / Premium required / 403 → "Bu özellik Premium üyelere özel."
Not found / 404 → "Aradığını bulamadık."
Validation failed → "Eksik veya hatalı bilgi var."
Rate limit / 429 → "Çok hızlı tıkladın, birkaç saniye bekle."
Timeout → "İşlem uzun sürdü, tekrar dener misin?"
No data → "Henüz veri yok."
No results → "Sonuç bulunamadı."
Coming soon → "Yakında."
Beta → "Deneme aşaması."

BİLDİRİM/PUSH (örüntü yakala, anlama göre çevir):
"Signal triggered: BUY X" → "X için al sinyali — yükseliş başladı."
"Daily signals ready" → "Bugünkü fırsat listesi hazır."
"Bot opened LONG X" → "Bot X aldı."
"Bot closed position +X%" → "Bot satış yaptı. Kâr: %X"
"Stop loss triggered" → "Zarar durdurma çalıştı, çıkıldı."
"Take profit reached" → "Kâr hedefine ulaşıldı, satıldı."
"Alert: price crossed X" → "Alarmın çaldı: {symbol} {X} TL'yi geçti."
"Subscription expiring in N days" → "Aboneliğin N gün sonra bitiyor."

TUTARLILIK (eşanlamlıları tekleştir):
"izle" + "monitör" + "takip et" → TÜMÜ "takip et"
"uyarı" + "alarm" + "bildirim" → manuel fiyat = "alarm", sistem push = "bildirim"
"fiyat" + "değer" + "kotasyon" → "fiyat"
"hisse" + "pay senedi" + "pay" → "hisse"
"sinyal" + "ipucu" + "işaret" → "sinyal"

YAZIM:
- Türkçe karakter zorunlu (ı, i, ş, ğ, ç, ö, ü)
- ASCII fallback kullanma: "sifre" → "şifre", "urun" → "ürün", "ucretsiz" → "ücretsiz", "kayit" → "kayıt"
- Cümle sonu nokta (tek kelimelik etiketler hariç)
- Sayı + TL arası boşluk: "47.20 TL"
- Yüzde işareti boşluksuz: "%2.3"
- Tarih: "17 Mayıs 2026" veya "17.05.2026"
- Saat: 24 saat formatı "14:32"
- Etiketler ALL CAPS: AL, SAT, BEKLE, RİSKLİ, TAKİP ET
- Devrik cümle yasak: "Sinyal tetiklendi." → "Hareket başladı."
- Aktif yapı: "Veri yüklenemedi." → "Veri yok." veya "Veri alamadık."

KISITLAR:
- Kod mantığını değiştirme — sadece string literal ve JSX text node.
- Variable, function, prop, type, key, id, URL, href değerlerini DEĞİŞTİRME (sadece display string'leri).
- Yorum satırlarına dokunma.
- console.log debug metinlerine dokunma.
- Backend response JSON yapısını koru — sadece `message` veya `error.message` field değerlerini Türkçeleştir, key adlarını değil.
- AdSense, push token, OAuth scope gibi sabit string'leri DEĞİŞTİRME.
- İngilizce kalmak ZORUNDA olan sabitler:
  - Plan ID'ler: 'free', 'starter_monthly', 'pro_monthly', 'lifetime' vb.
  - Event isimleri: 'click', 'submit', 'change'
  - HTML attribute değerleri: 'button', 'submit', 'checkbox'
  - URL path'leri
  - i18n key'leri (varsa)

ÇIKTI:
1. Değişen dosyaların listesi
2. Her dosyada kaç satır değişti
3. Bulduğun ama emin olmadığın 5-10 örnek (insan onayı için)
4. Etkilenen backend endpoint sayısı
5. Push notification template sayısı

ÖNCE PLAN:
İlk olarak grep ile yukarıdaki kelimelerin sayısını çıkar (kaç occurrence var her birinden). Sonra plan dosyası halinde sun. Onay aldıktan sonra değişiklikleri uygula.
```

---

## Kabul Kriterleri

- [ ] `grep -rn "Loading\.\.\.\|No data\|Failed to fetch\|Sign in\|Error:"` çıkışı boş (veya sadece debug/test).
- [ ] `grep -rn "\bRSI\b\|\bMACD\b\|\bEMA\b\|\bATR\b" src/pages src/components` çıkışı sadece detay/akordeyon panelleri.
- [ ] Türkçe karakter taraması: `grep -rn "sifre\|urun\|ucretsiz\|kayit\|isaret"` boş.
- [ ] Push bildirimleri: backend'de "triggered", "opened", "closed", "expiring" gibi İngilizce kelimeler push body'lerinde yok.
- [ ] Tutarlılık: "izle" / "monitör" tek varyanta indirilmiş.
- [ ] `npm run build` hatasız.
- [ ] Sade Türkçe okuma testi: rastgele 5 ekran kontrol et, hiçbir cümle "Sinyal tetiklendi." gibi robotik değil.

---

## Notlar

- Bu prompt **diğer 4 parçadan önce VEYA paralel** çalıştırılabilir. Eğer Parça 1 (menü) bittiyse, Parça 5'i çalıştır, sonra Parça 2/3/4 zaten doğru dilde yazılır.
- `src/utils/locale.js` ileride i18n için temel olabilir (`en/tr` switch). Şimdilik tek dil (TR) ama yapı korunsun.
- Master AI prompt'unu **küçük partilerde çalıştır** — tek seferde tüm projeyi taratırsan context taşar. Önerilen sıra:
  1. backend/src/services/ (push + cron metinleri)
  2. frontend/src/services/ (api.js, auth.js — error map'leri)
  3. frontend/src/pages/ (büyük partilere böl)
  4. frontend/src/components/ (büyük partilere böl)
  5. frontend/public/*.html (eğer varsa statik metin)
