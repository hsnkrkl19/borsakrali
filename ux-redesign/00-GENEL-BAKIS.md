# BorsaKrali — Ultra Sade UX/UI Dönüşümü — GENEL BAKIŞ

> Bu dosya: tüm dönüşümün haritası, mevcut sistem fotoğrafı ve 5 parça arasındaki sıralama.
> Diğer 5 dosya bu haritanın adım adım uygulama promptlarıdır.

---

## 1. Tek Cümlelik Hedef

Siteyi finans bilen birine değil, **finans bilmeyen kullanıcıya** anlatmak. Kullanıcı ekrana baktığında düşünmek zorunda kalmadan **AL / SAT / BEKLE / RİSKLİ** kararını görmeli.

---

## 2. Mevcut Sistem Fotoğrafı (2026-05-17)

### Sayfalar (57 jsx dosyası — birleşik gruplar dahil)
- **Ana akış**: `Dashboard`, `Sinyaller`, `GunlukTespitler`, `LiveHeatmap`
- **Birleşik sayfalar**: `Tarayicilar` (5 alt sekme), `SirketAnalizi` (4 alt sekme), `Performans` (2 alt sekme), `Notlarim` (2 alt sekme)
- **Analiz**: `TeknikAnalizAI`, `DCFDegerleme`, `KriptoDegerleme`, `ProAnaliz`, `HisseAISkor`
- **Bot**: `TradingBot`, `PaperTrading`
- **Kişisel**: `TakipListem`, `Notlarim`, `EkonomikTakvim`
- **Eğitim**: `Egitim` + 6 alt sayfa (TeknikAnalizGiris, Bist100Rehberi, vb.)
- **Hesap**: `Abonelik`, `Odeme`, `Ayarlar`, `Bildirimler`, `IstekPaneli`

### Mevcut Navigasyon
- **Sidebar** (`components/Sidebar.jsx`): 21 menu item, 4 grup (`core`, `analiz`, `kisisel`, `hesap`)
- **MobileBottomNav** (`components/MobileBottomNav.jsx`): 5 sekme (`Ana / Sinyaller / Eğitim / Kripto / Takip`)
- **Command Palette** (`components/CommandPalette.jsx`): authenticated kullanıcı için Ctrl+K araması

### Mevcut Yardım Sistemi
- `components/InfoTooltip.jsx` — zaten hazır, ama yaygın kullanılmıyor
- `components/SignalGuide.jsx` — sinyal açıklayıcı
- `components/AnnouncementsManager.jsx` — duyurular

### Renk Sistemi (CSS değişkenleri)
- `--gold-400`, `--gold-500` (vurgu)
- `--jade` (yeşil/olumlu)
- `--ember` (kırmızı/risk)
- `--bg-card`, `--bg-base`, `--border-main`

---

## 3. Hedef Yapı

### Yeni Menü (21 → 6 sekme)
| # | Yeni Sekme | Mevcut Eşdeğeri |
|---|------------|-----------------|
| 1 | Ana Sayfa | `/` (Dashboard) |
| 2 | Fırsatlar | `/tarayicilar` + `/gunluk-tespitler` |
| 3 | Canlı Sinyaller | `/sinyaller` + `/teknik-analiz-ai` |
| 4 | Botlar | `/trading-bot` + `/paper-trading` |
| 5 | Öğren | `/egitim` |
| 6 | Hesabım | `/ayarlar` + `/abonelik` + `/takip-listem` + `/notlarim` |

### Yeni Mobile Bottom Nav
Aynı 6 sekmeden 5'i (Hesabım'ı sidebar/profile menüye taşı):
`Ana / Fırsatlar / Sinyaller / Botlar / Öğren`

### Yasaklı Kelimeler (UI Genelinde)
| Yasak | Yerine |
|-------|--------|
| RSI, MACD, EMA, ATR, Fibonacci | (gösterme — sadece detay panelinde) |
| momentum, oscillator, divergence | "hareket", "yön değişimi" |
| volatility, ATR rejimi | "sakin / oynak" |
| confidence score, %83 probability | "Güçlü / Orta / Riskli" |
| stop loss, take profit | "zarar durdur", "kâr al" (sade Türkçe) |
| signal triggered, threshold exceeded | "hareket başladı" |
| leverage, lot size, position sizing | "büyük / orta / küçük" |
| backtest, walk-forward, OOS | "geçmiş test", sadece sertifika rozeti olarak |
| confluence, multi-timeframe | "birleşik görüntü", "kısa+uzun vade" |

### Renk Kuralı (4 renk)
- 🟢 **Yeşil** (`--jade`): AL / Güçlü / Olumlu
- 🔴 **Kırmızı** (`--ember`): RİSKLİ / Zayıf / SAT
- 🟡 **Sarı** (gold-400): BEKLE / Takip Et
- ⚪ **Gri** (`--text-faint`): Nötr / Veri yok

Mor, turuncu, pembe, mavi gradient'ler **kaldırılacak** (premium hissi vermek için `--gold-*` zaten yeterli).

---

## 4. Parça Sıralaması (Uygulama Önerisi)

Sıra önemli — sonraki parça öncekinin üzerine kurulur.

```
PARÇA 1 (Menü + Ana Sayfa)  ←  Temel iskelet. Bu olmadan diğerlerinin yeri belli olmaz.
        ↓
PARÇA 5 (Dil Sözlüğü)        ←  Master AI prompt'u bir kez çalıştır. Tüm metinler aynı dilde
        ↓                       konuşmaya başlar. Sonraki parçalar bu dilde yazılır.
        ↓
PARÇA 2 (Tarayıcılar + Sinyaller)  ←  En çok kullanılan akış. Sonuç ekranları AL/SAT/BEKLE.
        ↓
PARÇA 3 (Bot)                ←  Tek başına büyük. Riski yüksek olduğu için en sona yakın.
        ↓
PARÇA 4 (Onboarding + Eğitim)  ←  En son. Çünkü ne öğretileceği, sistem sadeleştikten sonra belli olur.
```

---

## 5. Dosya İndeksi

| Dosya | Kapsam | Tahmini İş Yükü |
|-------|--------|-----------------|
| [01-MENU-VE-ANA-SAYFA.md](01-MENU-VE-ANA-SAYFA.md) | Sidebar 21→6 sekme, Dashboard karar kartları, renk temizliği | 1–2 gün |
| [02-TARAMALAR-SINYALLER.md](02-TARAMALAR-SINYALLER.md) | Tarayicilar + GunlukTespitler + Sinyaller — AL/SAT/BEKLE etiketleme | 2–3 gün |
| [03-TRADING-BOT.md](03-TRADING-BOT.md) | TradingBot.jsx 3 adımlı kurulum, teknik ayarları gizle | 1–2 gün |
| [04-ONBOARDING-EGITIM.md](04-ONBOARDING-EGITIM.md) | İlk giriş turu, baloncuk sistemi, Egitim kart yapısı | 1–2 gün |
| [05-DIL-VE-AI-PROMPT.md](05-DIL-VE-AI-PROMPT.md) | Master AI prompt + kelime sözlüğü + hata/bildirim metinleri | 0.5–1 gün (otomatik) |

---

## 6. Genel Kurallar (Tüm Parçalar İçin Geçerli)

1. **Her ekran tek soruya cevap verir**: "Şimdi ne yapayım?"
2. **Grafik varsayılan kapalı** — "Detay göster" tıklanırsa açılır.
3. **Hiçbir sayı çıplak gösterilmez** — yanında insan dilinde etiket olmalı (örn. "RSI 72 (Aşırı alım)" değil, "Çok yüksek — düzeltme gelebilir").
4. **Boş ekran yasak** — her boş state için cümle var: "Henüz fırsat yok. Çıkınca burada görürsün."
5. **Mobil önce** — masaüstü mobilin büyütülmüş hali, tersi değil.
6. **Hata mesajları korkutmaz** — `"Invalid token"` yerine `"Oturum süresi doldu, tekrar gir."`
7. **Renk + ikon birlikte** — renk körü kullanıcı için yeşil✓/kırmızı✕/sarı⏸ ikonu zorunlu.
8. **Premium içerik kilidi nazik** — kilit ikonu + "Premium'a geç" CTA, asla "Erişim reddedildi" değil.

---

## 7. Done Tanımı (Tüm Proje)

- [ ] Sidebar 6 sekme, MobileBottomNav 5 sekme
- [ ] Dashboard'da "Bugünün Güçlü Hissesi / Riskli Bölge / Takip Et" üç büyük kart
- [ ] Tarama sonuçlarında her satır 🟢/🔴/🟡 + tek cümle açıklama
- [ ] Bot kurulumu 3 adımda biter
- [ ] Yeni kullanıcı ilk girişte 5 adımlı tur görür
- [ ] Hiçbir yerde RSI/MACD/EMA gibi teknik kısaltma görünmüyor (detay panelleri hariç)
- [ ] Hata mesajları sade Türkçe
- [ ] Push bildirimleri sade Türkçe
- [ ] AdSense bozulmadı, mevcut yönlendirmeler (REDIRECT_MAP) korundu

---

## 8. Risk Notları

- **AdSense onayı bekliyor** (ca-pub-3010697585892821) — `Layout` slot'larını silme.
- **Mevcut REDIRECT_MAP** (App.jsx:69-94) — eski URL'leri bozma, yeni URL'lere yönlendirme.
- **Demo kullanıcı akışı** kırılgan — App.jsx:114'teki `isDemo` skip mantığını koru.
- **Push bildirim metinleri** backend'de de var (cron'lar). Sadece frontend metni değiştirmek yetmez — `backend/src/services/*Service.js` içindeki bildirim mesajlarına da bak.
