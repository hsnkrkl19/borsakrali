# PARÇA 4 — Onboarding Turu + Yardım Baloncukları + Öğren Kart Sistemi

> Bu prompt'u yeni bir Claude oturumuna yapıştırıp çalıştırabilirsin.
> Bağımlılık: Parça 1, 2, 3 (ekranlar sadeleşmiş olmalı — neyin öğretileceği bundan sonra belli olur).

---

## Amaç

Yeni kullanıcı siteye girdiğinde:
1. **5 adımlı bir tur** kendi hızında geçer (kapatılabilir, daha sonra tekrar açılır).
2. Her sayfada **soru işareti baloncuğu** o ekranı tek cümleyle açıklar.
3. **Öğren** sayfası uzun makale yerine **kısa kart sistemi**: "AL ne demek?", "Risk ne demek?", "Bot nasıl çalışır?" gibi mikro içerikler.
4. Hata, boş ve başarı mesajları **insan dilinde** — kızgın değil, yönlendirici.

---

## Bağlam

- **Etkilenen dosyalar**:
  - `src/pages/Egitim.jsx` (uzun makale formatı — değişecek)
  - `src/pages/egitim/*.jsx` (6 alt sayfa: TeknikAnalizGiris, Bist100Rehberi, TemelGostergeler, BilancoOkuma, DestekDirenc, YatirimStratejisi)
  - `src/components/InfoTooltip.jsx` (zaten var — yaygınlaştır)
  - Yeni: `src/components/OnboardingTour.jsx`
  - Yeni: `src/components/HelpBubble.jsx`
  - `src/components/AnnouncementsManager.jsx` (mevcut duyurular — referans alınabilir)

- **State**: `useAuthStore` veya yeni `useOnboardingStore` (Zustand)
- **Persist**: `localStorage` (`bk-onboarding-completed`, `bk-onboarding-skipped`)

---

## Mevcut Sorun

1. **Onboarding yok** — kullanıcı `/` açıp 21 menü sekmesi görüyor, kendi başına geziyor.
2. **`Egitim.jsx` ve alt sayfalar uzun makale** — kullanıcı okumuyor.
3. **`InfoTooltip` az kullanılıyor** — sadece bazı yerlerde. Yeni kullanıcının dolaştığı ana akışta neredeyse hiç yok.
4. **Hata mesajları teknik**: `Invalid token`, `Request failed`, `Network error`.
5. **Bildirimler robotik**: `Signal triggered: BUY THYAO at 14:32`.
6. **Boş state'ler boş** — sadece "No data" görünüyor.
7. **Başarı bildirimi yok** — kullanıcı bir şey yaptığında "iyi gitti" sinyali almıyor.

---

## Hedef Çıktı

### A. İlk Giriş Turu — 5 Adım

`OnboardingTour.jsx` — sade overlay + spotlight. Şu 5 adımı sırayla gösterir:

| Adım | Hedef Element | Mesaj |
|------|---------------|-------|
| 1 | Dashboard'daki ilk büyük kart | "**Burada bugünün güçlü hissesini görürsün.** Sistem her gün senin için en güçlü fırsatı seçer." |
| 2 | "Fırsatlar" menü linki | "**Buradan tüm fırsatları görebilirsin.** AL, BEKLE, RİSKLİ olarak ayrılır." |
| 3 | "Canlı Sinyaller" menü linki | "**Şimdi hareket eden hisseleri burada görürsün.** Bildirim açarsan hareket başlayınca seni uyarır." |
| 4 | "Botlar" menü linki | "**Bot senin yerine fırsat arar.** İstersen sadece izle, istersen otomatik işlem yapsın." |
| 5 | "Öğren" menü linki | "**Bir şeyi anlamadın mı?** Buradan tek cümlede açıklama bulursun." |

**Kurallar**:
- Her adımın altında `[Geç] [İleri →]` butonları.
- Son adımda `[Bitir]` butonu — `localStorage.bk-onboarding-completed = '1'` yazar.
- "Geç" tuşu da aynı flag'i yazar ama farklı bir key ile (`bk-onboarding-skipped`).
- Yeniden başlatma: `/hesabim?tab=ayarlar` altında "Tanıtım turunu tekrar göster" butonu.

### B. HelpBubble — Her Sayfada Tek Cümlelik Yardım

`HelpBubble.jsx` — sayfa başlığının yanına yerleşen küçük `?` ikonu. Tıklanırsa popover açılır, **maksimum 12 kelime**.

```jsx
<h1>Fırsatlar <HelpBubble text="Sistemin bulduğu güçlü hisseleri burada görürsün." /></h1>
```

**Her sayfaya yerleştirilecek metinler**:

| Sayfa | Metin |
|-------|-------|
| Ana Sayfa (`/`) | "Bugün ne yapacağını tek bakışta görürsün." |
| Fırsatlar | "Sistem güçlü hisseleri burada listeler." |
| Canlı Sinyaller | "Şu an hareket eden hisseler burada." |
| Botlar | "Sistem senin yerine fırsat takip eder." |
| Öğren | "Anlamadığın bir şey varsa burada açıklama bulursun." |
| Takip Listem | "İzlemek istediğin hisseler burada kalır." |
| Notlarım | "Hisseler için kendi notlarını tutarsın." |
| Abonelik | "Premium özelliklere buradan erişirsin." |
| Ayarlar | "Bildirim, tema, dil ayarlarını buradan yaparsın." |
| Trading Bot (kurulum) | "Bot otomatik al-sat yapar. Riski sen seçersin." |
| Bot (çalışırken) | "Şu an aktif. Durdurmak istersen aşağıdan kapatabilirsin." |

### C. Öğren Sayfası — Kart Sistemi

`Egitim.jsx` yeniden tasarım:

**Üstte** — sade arama: "Ne öğrenmek istiyorsun?" inputu.

**Altında** — kategoriler ve kartlar:

```
TEMEL KAVRAMLAR
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ AL ne    │ │ BEKLE ne │ │ RİSKLİ   │ │ Hisse    │
│ demek?   │ │ demek?   │ │ ne demek?│ │ nedir?   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

SİSTEMİ TANI
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Sinyal   │ │ Bot      │ │ Tarama   │ │ Bildirim │
│ nedir?   │ │ nedir?   │ │ nedir?   │ │ nasıl?   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘

PARANI KORU
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Risk ne  │ │ Zarar    │ │ Bütçe    │ │ Kâr al   │
│ demek?   │ │ durdur?  │ │ planla   │ │ nedir?   │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

Her kart tıklanınca **modal veya inline expand**, içerik en fazla 80-100 kelime:
- 1 cümle tanım
- 1 örnek
- 1 "şuna dikkat"

Eski uzun makaleler (`egitim/*.jsx`) → "Detaylı oku" linki olarak kalır, default gizli.

### D. Hata Mesajları — Sade Türkçe

Tüm `try/catch` ve API hata cevaplarında string'leri değiştir:

| Eski | Yeni |
|------|------|
| `Invalid token` | "Oturum süren doldu, tekrar gir." |
| `Request failed (500)` | "Sistemde bir sorun var, biraz sonra dene." |
| `Network error` | "İnternet bağlantısı yok gibi görünüyor." |
| `Unauthorized` | "Bu özelliği görmek için giriş yapman lazım." |
| `Premium required` | "Bu özellik Premium üyelere özel." `[Premium'a Geç →]` |
| `Rate limit exceeded` | "Çok hızlı tıkladın, birkaç saniye bekle." |
| `Validation failed: email` | "E-posta adresinde bir hata var." |
| `Validation failed: password` | "Şifre en az 8 karakter olmalı." |
| `Not found` | "Aradığını bulamadık." |

**Component**: `src/components/ErrorToast.jsx` (varsa varolanı genişlet, yoksa yeni). Tüm catch'lerde bu kullanılacak.

### E. Bildirimler — İnsan Dili

`PushNotificationManager.jsx` ve backend cron'larda:

| Eski | Yeni |
|------|------|
| `Signal triggered: BUY THYAO at 14:32` | "THYAO için al sinyali — yükseliş başladı." |
| `Bot opened LONG position` | "Bot ASELS aldı (47.20 TL)." |
| `Stop loss hit` | "Zarar durdurma çalıştı, çıkıldı." |
| `Take profit reached` | "Kâr hedefine ulaşıldı, satıldı." |
| `Daily report ready` | "Bugünkü fırsat listesi hazır." |
| `Subscription expiring in 3 days` | "Aboneliğin 3 gün sonra bitiyor. [Yenile →]" |

### F. Boş State'ler

| Yer | Metin |
|-----|-------|
| Takip Listem (boş) | "Henüz takip ettiğin hisse yok. **Fırsatlar**'dan bir hisseye gir, kalp ikonuna bas." |
| Notlarım (boş) | "Henüz not eklemedin. İstediğin hissede not tutabilirsin." |
| Bildirimler (boş) | "Bildirim yok. Fırsat çıkınca burada görünür." |
| Trade history (boş) | "Henüz işlem yok. Bot ilk fırsatı bulduğunda burada görürsün." |

### G. Başarı Bildirimleri

Kullanıcı bir aksiyon yaptığında küçük yeşil toast:

| Aksiyon | Mesaj |
|---------|-------|
| Hisseyi takibe ekledi | "✓ THYAO takip listene eklendi." |
| Not kaydetti | "✓ Not kaydedildi." |
| Alarm kurdu | "✓ Alarm kuruldu. Fiyat geldiğinde haber vereceğim." |
| Bot başlattı | "✓ Bot çalışıyor. Bugün ilk fırsatı arıyor." |
| Bot durdurdu | "✓ Bot durduruldu." |
| Şifre değiştirdi | "✓ Şifren güncellendi." |

---

## Adım Adım Yapılacaklar

1. **`useOnboardingStore.js`** (Zustand) — `step`, `completed`, `skipped`, `restart()` actions.
2. **`OnboardingTour.jsx`** — overlay component:
   - Spotlight: hedef elementi `getBoundingClientRect()` ile bul, overlay'de delik aç.
   - Tooltip kart: hedefin yanına konumlan.
   - 5 adım state machine.
   - Klavye: Esc = Geç, → = İleri.
3. **`App.jsx`'e mount et**: ilk render'da `localStorage.bk-onboarding-completed` yoksa `<OnboardingTour />` render et.
4. **`HelpBubble.jsx`**:
   - `<button>?</button>` + Radix Popover veya kendi popover.
   - Props: `text` (zorunlu), `placement` (opsiyonel).
5. **Her sayfaya ekle**: Yukarıdaki tabloda listelenen 11 sayfanın `<h1>` veya page header'ına `<HelpBubble />` yerleştir.
6. **`Egitim.jsx` yeniden yaz**:
   - Üstte arama input'u (client-side filter).
   - Kart listesi: `src/data/learnCards.js` JSON dosyasından beslen (12-16 kart yeterli başlangıç için).
   - Kart tıklanınca modal: 80-100 kelime cevap.
   - "Detaylı oku" linki → mevcut `egitim/*.jsx` sayfasına gider.
7. **`ErrorToast.jsx`** — global toast helper. Tüm API client catch'lerinde error message map'le:
   - 401 → "Oturum süren doldu..."
   - 403 + planRequired → "Premium..."
   - 429 → "Çok hızlı..."
   - 5xx → "Sistemde sorun..."
   - Network → "İnternet..."
8. **`SuccessToast.jsx`** — başarı toast helper. Her store action sonrası tetikle.
9. **Backend push body'leri** — `services/notifications.js` veya `pushService.js` içinde mesajları yukarıdaki E. tablosuna göre değiştir.
10. **Boş state cümleleri** — tüm tablo/grid render'larında length === 0 dalına F. tablosundaki metinleri ekle.

---

## Kabul Kriterleri

- [ ] İlk girişte 5 adımlı tur otomatik açılıyor.
- [ ] "Geç" ve "Bitir" ikisi de turu kapatıyor.
- [ ] `/hesabim?tab=ayarlar`'da "Tanıtım turunu tekrar göster" butonu çalışıyor.
- [ ] 11 ana sayfanın hepsinde `<HelpBubble>` var.
- [ ] Öğren sayfası kart yapısına geçti, mevcut makaleler "Detaylı oku" linki olarak kaldı.
- [ ] Hiçbir hata mesajında İngilizce/teknik string yok.
- [ ] Push bildirim metinleri sade Türkçe.
- [ ] Boş ekranlar artık "No data" yerine yönlendirici cümle gösteriyor.
- [ ] Başarılı aksiyonlarda yeşil toast görünüyor.
- [ ] `npm run build` hatasız geçiyor.

---

## AI Komut Bloğu (Kopyala-Yapıştır)

```
BorsaKrali frontend'inde Parça 4 — onboarding turu, yardım baloncukları, Öğren kart sistemi, hata/boş/başarı mesajları.

Dizin: C:\Users\hsnkr\Desktop\site\borsasanati-clone\frontend

Yapılacaklar:
1. src/store/onboardingStore.js (Zustand) — state: { step, completed, skipped }, actions: next(), prev(), skip(), complete(), restart(). LocalStorage persist (bk-onboarding-completed, bk-onboarding-skipped).

2. src/components/OnboardingTour.jsx — 5 adımlı overlay:
   Adım 1: Dashboard ilk büyük kart → "Burada bugünün güçlü hissesini görürsün. Sistem her gün senin için en güçlü fırsatı seçer."
   Adım 2: Sidebar "Fırsatlar" linki → "Buradan tüm fırsatları görebilirsin. AL, BEKLE, RİSKLİ olarak ayrılır."
   Adım 3: "Canlı Sinyaller" linki → "Şimdi hareket eden hisseleri burada görürsün. Bildirim açarsan uyarır."
   Adım 4: "Botlar" linki → "Bot senin yerine fırsat arar. İstersen izle, istersen otomatik işlem yapsın."
   Adım 5: "Öğren" linki → "Bir şeyi anlamadın mı? Buradan tek cümlede açıklama bulursun."
   Her adımda [Geç] [İleri →] butonları. Esc=Geç, →=İleri.
   Hedef elementi data-tour attribute ile bul (örn. data-tour="firsatlar-link").

3. src/App.jsx — Layout altına: localStorage.getItem('bk-onboarding-completed') yoksa <OnboardingTour /> mount et.

4. src/components/HelpBubble.jsx — props: { text, placement='top' }. Küçük ? ikonu, hover'da popover. Maksimum 12 kelime sınırı.

5. Aşağıdaki sayfalarda <h1> yanına <HelpBubble text="..."> ekle:
   /: "Bugün ne yapacağını tek bakışta görürsün."
   /firsatlar: "Sistem güçlü hisseleri burada listeler."
   /sinyaller: "Şu an hareket eden hisseler burada."
   /botlar: "Sistem senin yerine fırsat takip eder."
   /ogren: "Anlamadığın bir şey varsa burada açıklama bulursun."
   /hesabim?tab=takip: "İzlemek istediğin hisseler burada kalır."
   /hesabim?tab=notlar: "Hisseler için kendi notlarını tutarsın."
   /hesabim?tab=abonelik: "Premium özelliklere buradan erişirsin."
   /hesabim?tab=ayarlar: "Bildirim, tema, dil ayarlarını buradan yaparsın."

6. src/data/learnCards.js — 12-16 kart JSON:
   { category: 'TEMEL KAVRAMLAR'|'SİSTEMİ TANI'|'PARANI KORU', title, body (80-100 kelime), detailHref (opsiyonel) }
   Başlangıç kartlar: "AL ne demek?", "BEKLE ne demek?", "RİSKLİ ne demek?", "Hisse nedir?", "Sinyal nedir?", "Bot nedir?", "Tarama nedir?", "Bildirim nasıl çalışır?", "Risk ne demek?", "Zarar durdur nedir?", "Bütçe nasıl planlanır?", "Kâr al nedir?".

7. src/pages/Egitim.jsx yeniden yaz:
   - Üstte arama input (client-side filter learnCards üzerinde)
   - Kategori başlıkları + 4'lü grid kartlar
   - Kart tıklayınca modal (Headless UI veya kendi modal): title + body + (detailHref varsa "Detaylı oku" linki)
   - Mevcut /egitim/* alt sayfaları detailHref olarak korunsun.

8. src/components/ErrorToast.jsx — global toast (react-hot-toast veya kendi):
   showError(err) helper'ı yaz. Status code'a göre map'le:
   401 → "Oturum süren doldu, tekrar gir."
   403+planRequired → "Bu özellik Premium üyelere özel." + [Premium'a Geç →] linki
   429 → "Çok hızlı tıkladın, birkaç saniye bekle."
   5xx → "Sistemde bir sorun var, biraz sonra dene."
   NetworkError → "İnternet bağlantısı yok gibi görünüyor."
   default → "Bir şeyler ters gitti, tekrar dener misin?"

9. src/components/SuccessToast.jsx — showSuccess(text). Aksiyonlardan sonra çağır:
   - Takip eklendi: "✓ {symbol} takip listene eklendi."
   - Not kaydedildi: "✓ Not kaydedildi."
   - Alarm kuruldu: "✓ Alarm kuruldu. Fiyat geldiğinde haber vereceğim."
   - Bot başladı: "✓ Bot çalışıyor."
   - Bot durdu: "✓ Bot durduruldu."

10. Backend push metinleri (backend/src/services/pushService.js veya notifications.js):
    "Signal triggered: BUY X" → "X için al sinyali — yükseliş başladı."
    "Bot opened LONG X @price" → "Bot X aldı ({price} TL)."
    "Stop loss hit" → "Zarar durdurma çalıştı, çıkıldı."
    "Take profit reached" → "Kâr hedefine ulaşıldı, satıldı."
    "Subscription expiring" → "Aboneliğin {days} gün sonra bitiyor."

11. Boş state'ler — tüm tablo/grid'lerde length===0 dalı:
    Takip Listem: "Henüz takip ettiğin hisse yok. Fırsatlar'dan bir hisseye gir, kalp ikonuna bas."
    Notlarım: "Henüz not eklemedin. İstediğin hissede not tutabilirsin."
    Bildirimler: "Bildirim yok. Fırsat çıkınca burada görünür."
    Trade history: "Henüz işlem yok. Bot ilk fırsatı bulduğunda burada görürsün."

Kısıtlar:
- data-tour attribute'leri Sidebar/Dashboard/MobileBottomNav'a eklenmeli ki OnboardingTour onları bulabilsin.
- HelpBubble text'leri 12 kelimeyi aşmasın.
- ErrorToast tüm api.js interceptor'ında tetiklensin (yerine de bırakma, merkezileştir).
- "Tanıtım turunu tekrar göster" butonu /hesabim?tab=ayarlar'a eklenmeli — restart() çağırır.
- npm run build hatasız geçmeli.

Bittiğinde: kaç sayfaya HelpBubble eklendiğini, learnCards.js'teki kart sayısını, etkilenen toast call-site'larını raporla.
```
