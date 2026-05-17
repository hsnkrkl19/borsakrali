# PARÇA 1 — Menü Sadeleştirme + Ana Sayfa Karar Kartları

> Bu prompt'u yeni bir Claude oturumuna yapıştırıp çalıştırabilirsin.
> Bağımlılık: yok. **İlk yapılması gereken parça**.

---

## Amaç

Sidebar'ı 21 → 6 sekmeye indir. Dashboard'u "3 büyük karar kartı + altında özet" yapısına çevir. Renk paletini 4 renge (yeşil/kırmızı/sarı/gri) sadeleştir.

---

## Bağlam

- **Çalışma dizini**: `C:\Users\hsnkr\Desktop\site\borsasanati-clone\frontend`
- **Etkilenen dosyalar**:
  - `src/components/Sidebar.jsx` (21 menu item — şu an 4 grup)
  - `src/components/MobileBottomNav.jsx` (5 sekme — `Ana / Sinyaller / Eğitim / Kripto / Takip`)
  - `src/pages/Dashboard.jsx` (mevcut "Piyasa Kokpiti" — BIST100, BIST30, gainers/losers, signals)
  - `src/App.jsx` (REDIRECT_MAP'i koru, yeni yönlendirmeler ekle)
  - `src/components/Header.jsx` (üst bar — sadeleşmeli)
  - `src/index.css` veya tema dosyası (renk değişkenleri)

---

## Mevcut Sorun

1. **Sidebar boğucu**: 21 link, 4 grup başlığı, badge'ler (`YENİ`, `PRO`, `LIVE`, `ADMIN`). Yeni kullanıcı nereye bakacağını bilmiyor.
2. **Dashboard veri salatası**: BIST100 grafik + endeks kartları + gainers + losers + bugünün sinyalleri + heatmap özet — hepsi aynı ekranda. Ana soru "Şimdi ne alayım?" cevapsız kalıyor.
3. **Renk dağınıklığı**: gold, jade, ember, mor (`#7c3aed`), mavi (`#3b82f6`), pembe gradient'ler — odak dağılıyor.
4. **Header gereksiz**: ThemeToggle, ay/güneş, dil, bildirim, arama, profil — hepsi aynı anda.

---

## Hedef Çıktı

### A. Yeni Sidebar Yapısı (6 ana + 1 hesap)

```js
const allNavItems = [
  { path: '/',              label: 'Ana Sayfa',       icon: Home,       isPublic: true },
  { path: '/firsatlar',     label: 'Fırsatlar',       icon: Sparkles,   isPublic: true },
  { path: '/sinyaller',     label: 'Canlı Sinyaller', icon: Activity,   isPublic: true },
  { path: '/botlar',        label: 'Botlar',          icon: Bot                          },
  { path: '/ogren',         label: 'Öğren',           icon: BookOpen,   isPublic: true },
  { path: '/hesabim',       label: 'Hesabım',         icon: User                         },
]
```

**Gruplama kaldırılır** — 6 link tek liste olur. Group başlıkları ("Hızlı Erişim", "Analiz Araçları") silinir.

### B. URL Yönlendirmeleri (App.jsx REDIRECT_MAP'e ekle)

| Eski → Yeni |
|------|------|
| `/tarayicilar` → `/firsatlar?tab=genel` |
| `/gunluk-tespitler` → `/firsatlar?tab=gunluk` |
| `/teknik-analiz-ai` → `/sinyaller?tab=ai` |
| `/canli-heatmap` → `/sinyaller?tab=heatmap` |
| `/trading-bot` → `/botlar?tab=trading` |
| `/egitim` → `/ogren` |
| `/ayarlar` → `/hesabim?tab=ayarlar` |
| `/takip-listem` → `/hesabim?tab=takip` |
| `/notlarim` → `/hesabim?tab=notlar` |
| `/abonelik` → `/hesabim?tab=abonelik` |

**Eski path'ler hâlâ çalışmaya devam edecek** — REDIRECT_MAP buna izin verir, AdSense ve eski yer imleri bozulmaz.

### C. Yeni MobileBottomNav (5 sekme)

```js
const NAV_ITEMS = [
  { to: '/',           label: 'Ana',       icon: Home      },
  { to: '/firsatlar',  label: 'Fırsatlar', icon: Sparkles  },
  { to: '/sinyaller',  label: 'Sinyaller', icon: Activity  },
  { to: '/botlar',     label: 'Botlar',    icon: Bot       },
  { to: '/ogren',      label: 'Öğren',     icon: BookOpen  },
]
```

Hesabım → header'daki profil avatarına taşınır.

### D. Yeni Dashboard Yapısı

**ÜST**: Selamlama satırı — "Günaydın, [Ad]. Bugün **3 fırsat** bulduk."

**ORTA — 3 BÜYÜK KARAR KARTI** (mobilde dikey, masaüstünde yatay):

```
┌────────────────────────────────────────┐
│  🟢  Bugünün Güçlü Hissesi             │
│      THYAO                              │
│      AL                                 │
│      Yükseliş başladı.                 │
│      [Detay →]                          │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  🔴  Riskli Bölge                      │
│      ASELS                              │
│      ŞİMDİ GİRME                        │
│      Düşüş baskısı sürüyor.            │
│      [Detay →]                          │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  🟡  Takip Et                          │
│      EREGL                              │
│      HAREKET BEKLENİYOR                 │
│      Yatay seyir, çıkış yakın.         │
│      [Detay →]                          │
└────────────────────────────────────────┘
```

**ALT — sade özet** (tek satır):
- "BIST100 bugün **%1.2** yükseldi"
- "**5** hisse güçlü, **3** riskli, **2** takipte"
- "Tam listeyi görmek için **Fırsatlar**'a git →"

**KALDIR**: gainers/losers tabloları, mini grafikler, heatmap thumb, kripto kart (Sinyaller sayfasına taşı).

### E. Renk Temizliği

`src/index.css` veya tema dosyasında:
- Mor, pembe, mavi gradient'ler bul ve aşağıdakilerden biriyle değiştir:
  - Olumlu/Yükseliş → `var(--jade)`
  - Risk/Düşüş → `var(--ember)`
  - Vurgu/Premium → `var(--gold-400/500)`
  - Nötr → `var(--text-faint)`
- "LIVE" badge'lerinde emerald yerine `--gold-400` kullan (premium hissi).

---

## Adım Adım Yapılacaklar

1. **Yeni route iskeletleri**: `src/pages/Firsatlar.jsx`, `src/pages/Sinyaller.jsx` (mevcut), `src/pages/Botlar.jsx`, `src/pages/Ogren.jsx`, `src/pages/Hesabim.jsx` oluştur. Her biri `useSearchParams()` ile `?tab=` okuyacak ve mevcut sayfayı render edecek (kopya kod yok, sadece wrapper).
2. **App.jsx**:
   - Yeni route'ları ekle.
   - REDIRECT_MAP'e yukarıdaki yönlendirmeleri ekle.
3. **Sidebar.jsx**: `allNavItems` listesini 6 öğeye düşür. Group başlıklarını ve grouped render'ı kaldır.
4. **MobileBottomNav.jsx**: `NAV_ITEMS` listesini 5 öğeye değiştir.
5. **Dashboard.jsx**: Tüm tablo/grafik öğelerini sil, 3 karar kartı + 1 özet satırı bırak. Veri kaynağı: zaten var olan `/api/signals/today` veya `/gunluk-tespitler` endpoint'i (en yüksek skorlu 1 long, en düşük skorlu 1 short, ortada bekleyen 1 sembol).
6. **Renk taraması**: `src/` altında `grep -r "purple\|violet\|fuchsia\|pink\|indigo"` çalıştır, her birini yukarıdaki paletten birine map'le.
7. **Header.jsx**: Sadece **logo + arama + bildirim + profil** kalsın. Tema toggle masaüstünde **Ayarlar**'a, mobilde tamamen kaldırılır (sistem teması).

---

## Kabul Kriterleri

- [ ] Sidebar'da en fazla 6 link görünüyor (admin için +1).
- [ ] MobileBottomNav 5 sekme.
- [ ] Tüm eski URL'ler (`/tarayicilar`, `/gunluk-tespitler`, vb.) hâlâ çalışıyor ve doğru `?tab=` ile yeni URL'e gidiyor.
- [ ] Dashboard'da en fazla **3 büyük kart + 1 özet satır** var.
- [ ] Ekran üzerinde mor/mavi/pembe renk kalmadı.
- [ ] AdSense Layout slot'ları bozulmadı (`grep -r "AdSlot"` ile kontrol).
- [ ] Demo kullanıcı `/` üzerinde sorunsuz görünüyor (App.jsx:114 skip mantığı korundu).
- [ ] `npm run build` hatasız tamamlanıyor.

---

## AI Komut Bloğu (Kopyala-Yapıştır)

```
BorsaKrali frontend'inde Parça 1 — menü sadeleştirme ve ana sayfa karar kartlarını uygula.

Dizin: C:\Users\hsnkr\Desktop\site\borsasanati-clone\frontend

Yapılacaklar (sıralı):
1. src/pages altına Firsatlar.jsx, Botlar.jsx, Ogren.jsx, Hesabim.jsx adında wrapper sayfalar oluştur. Her biri useSearchParams ile ?tab okuyup mevcut sayfayı render edecek:
   - Firsatlar: tab=genel→Tarayicilar, tab=gunluk→GunlukTespitler (default: genel)
   - Botlar: tab=trading→TradingBot, tab=paper→PaperTrading (default: trading)
   - Ogren: doğrudan Egitim render et
   - Hesabim: tab=ayarlar→Ayarlar, tab=takip→TakipListem, tab=notlar→Notlarim, tab=abonelik→Abonelik

2. src/App.jsx içine yeni route'ları ve REDIRECT_MAP'e şu yönlendirmeleri ekle:
   /tarayicilar→/firsatlar?tab=genel, /gunluk-tespitler→/firsatlar?tab=gunluk,
   /teknik-analiz-ai→/sinyaller?tab=ai, /canli-heatmap→/sinyaller?tab=heatmap,
   /trading-bot→/botlar?tab=trading, /egitim→/ogren,
   /ayarlar→/hesabim?tab=ayarlar, /takip-listem→/hesabim?tab=takip,
   /notlarim→/hesabim?tab=notlar, /abonelik→/hesabim?tab=abonelik

3. src/components/Sidebar.jsx: allNavItems'ı 6 öğeye indir (Ana Sayfa, Fırsatlar, Canlı Sinyaller, Botlar, Öğren, Hesabım). Grouped render'ı tek listeye çevir, "Hızlı Erişim" gibi başlıkları kaldır.

4. src/components/MobileBottomNav.jsx: NAV_ITEMS'ı şuna güncelle: Ana, Fırsatlar, Sinyaller, Botlar, Öğren.

5. src/pages/Dashboard.jsx: Mevcut tüm tablo/grafiği sil. Yapısı:
   - Üstte selamlama: "Günaydın, {firstName}. Bugün {n} fırsat bulduk."
   - Ortada 3 büyük kart: Bugünün Güçlü Hissesi (yeşil, AL), Riskli Bölge (kırmızı, ŞİMDİ GİRME), Takip Et (sarı, HAREKET BEKLENİYOR).
   - Her kart: emoji + sembol + büyük etiket + tek cümle açıklama + [Detay →] linki.
   - Altta tek satır özet: BIST100 günlük değişim + "{n} güçlü, {m} riskli, {k} takipte" + [Fırsatlar →]
   - Veri: GET /api/signals/today (varsa) yoksa /api/market/signals'tan en yüksek skor (AL), en düşük (RİSKLİ), ortada (BEKLE) seç.

6. src/components/Header.jsx: ThemeToggle ve gereksiz sekmeleri kaldır. Sadece logo + arama + bildirim çanı + profil avatarı kalsın.

7. Renk temizliği: src altında grep -rn "purple\|violet\|fuchsia\|pink\|indigo\|#a855f7\|#7c3aed" çalıştır. Bulduğun her gradient/renk için:
   - Yükseliş/olumlu → var(--jade)
   - Düşüş/risk → var(--ember)
   - Vurgu → var(--gold-400) veya var(--gold-500)
   - Nötr → var(--text-faint)

Kısıtlar:
- AdSense Layout slot'larına dokunma (AdSlot component'lerini koru)
- REDIRECT_MAP'teki mevcut yönlendirmeleri sil ME — sadece ekle
- Demo kullanıcı akışını koru: App.jsx:114 isDemo/demo-token-full-access skip mantığı sabit kalsın
- "use client" / framework değişikliği yok, sadece React component refactor
- npm run build hatasız geçmeli

Bittiğinde: npm run build sonucunu, görsel olarak değişen ekranların listesini ve REDIRECT_MAP'in güncel halini raporla.
```
