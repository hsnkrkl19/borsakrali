# PARÇA 2 — Fırsatlar (Tarayıcılar + Günlük Sinyaller) ve Canlı Sinyaller

> Bu prompt'u yeni bir Claude oturumuna yapıştırıp çalıştırabilirsin.
> Bağımlılık: Parça 1 (yeni `/firsatlar` route'u) ve Parça 5 (dil sözlüğü).

---

## Amaç

Tarayıcı sonuçlarını, bugünün sinyallerini ve canlı sinyal sayfasını **AL / SAT / BEKLE / RİSKLİ** kararına indir. Kullanıcı tablodaki herhangi bir satıra bakınca **3 saniyede** ne yapacağını anlayacak.

---

## Bağlam

- **Etkilenen sayfalar**:
  - `src/pages/Tarayicilar.jsx` (5 alt sekme: genel, ema34, tema34, snr, merkez, x-gundem, haberler)
  - `src/pages/GunlukTespitler.jsx` (BIST + Kripto + MTF — 4 mod: tarayıcı, confluence, kalibrasyon, backtest)
  - `src/pages/Sinyaller.jsx` (komuta merkezi — BIST + Kripto özet)
  - `src/pages/TeknikAnalizAI.jsx` (sembol arama + analiz)
  - `src/pages/LiveHeatmap.jsx` (artık /sinyaller?tab=heatmap'e yönlendiriliyor)

- **Component'lar**:
  - `components/BugununSinyalleri.jsx`
  - `components/KriptoSinyalleri.jsx`
  - `components/MTFSinyalleri.jsx`
  - `components/MTFConfluenceSummary.jsx`
  - `components/MTFCoinDetailModal.jsx`
  - `components/SignalGuide.jsx` (zaten var — yaygınlaştır)
  - `components/TradePlanCard.jsx`

- **Backend cevap formatı** (referans için):
  ```json
  { "symbol": "THYAO", "score": 14, "direction": "LONG",
    "indicators": { "rsi": 62, "macd": "BUY", "ema": "UP", ... },
    "confidence": 0.78 }
  ```

---

## Mevcut Sorun

1. **Tarayıcı sonuç tabloları 12+ kolon** — RSI, MACD, EMA, ATR, hacim, skor, yön, fiyat, yüzde, sinyal türü, son güncelleme, eylem. Kullanıcı bakarken donuyor.
2. **"Sinyal" kelimesi belirsiz** — bazısı uzun (BUY), bazısı kısa (SELL), bazısı bekleme (HOLD/WAIT). Etiketler tutarsız: "STRONG_LONG", "LONG", "WEAK_LONG", "NEUTRAL", "WEAK_SHORT", "SHORT", "STRONG_SHORT".
3. **Skor anlamsız**: "Skor: 14/16" kullanıcıya hiçbir şey ifade etmiyor. Eşik bilinmiyor.
4. **Filtre fazla**: Universe (BIST30/100), TF (1m/5m/.../1w), yön (long/short), skor min, ... — yeni kullanıcı kaybediyor.
5. **MTF Confluence ekranı çok teknik**: "1w×12, 1d×9, 4h×7, 1h×5, 15m×3, 5m×2.5, 1m×2" gibi ağırlıklar görünüyor.
6. **Coin/Hisse detay modali bilgi bombası**: 3 tab × 7 timeframe × 12 indicator = 252 sayısal hücre.

---

## Hedef Çıktı

### A. Yeni Sonuç Satırı (Tarayıcı + Günlük Sinyaller — tek format)

```
┌───────────────────────────────────────────────────────────┐
│ 🟢  THYAO  ──  AL                                          │
│       Yükseliş başladı. Alıcılar güçleniyor.              │
│       [Detay ↓]                                            │
└───────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│ 🔴  ASELS  ──  ŞİMDİ GİRME                                │
│       Düşüş baskısı sürüyor.                              │
│       [Detay ↓]                                            │
└───────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────┐
│ 🟡  EREGL  ──  TAKİP ET                                   │
│       Yatay seyir, hareket hazırlığı olabilir.            │
│       [Detay ↓]                                            │
└───────────────────────────────────────────────────────────┘
```

**[Detay ↓]** tıklanırsa **inline expand** açılır — orada eski tüm sayılar göründüğü gibi kalabilir (gelişmiş kullanıcı için), ama varsayılan kapalı.

### B. Skor → Etiket Eşlemesi (backend değişmiyor, frontend mapping)

| Backend `direction` + `score` | UI Etiketi | Renk | Açıklama Cümlesi |
|--------------------------------|-----------|------|------------------|
| `STRONG_LONG` / score ≥ 12 long | **AL** | 🟢 | "Güçlü yükseliş sinyali." |
| `LONG` / score 9-11 long | **AL** | 🟢 | "Yükseliş başladı." |
| `WEAK_LONG` / score 6-8 long | **TAKİP ET** | 🟡 | "Yatay seyir, çıkış olabilir." |
| `NEUTRAL` / score 0-5 | **BEKLE** | ⚪ | "Net yön yok, beklemede kal." |
| `WEAK_SHORT` / score 6-8 short | **TAKİP ET (riskli)** | 🟡 | "Zayıflama belirtisi." |
| `SHORT` / score 9-11 short | **ŞİMDİ GİRME** | 🔴 | "Düşüş baskısı var." |
| `STRONG_SHORT` / score ≥ 12 short | **RİSKLİ** | 🔴 | "Sert düşüş sinyali." |

Bu mapping'i **tek bir yardımcı dosya** yap: `src/utils/signalLabels.js`. Tüm component'ler bunu import etsin.

### C. Filtre Sadeleştirme

**KALDIR**: TF seçici (varsayılan = 1d), universe seçici (varsayılan = top tier), skor min slider, indicator filter.

**KAL**: 4 pill — "Güçlüler" / "Yeni Hareketler" / "Riskliler" / "Bugün Yükselenler". Tek tıkla aktif.

```
[Güçlüler] [Yeni Hareketler] [Riskliler] [Bugün Yükselenler]
```

Gelişmiş kullanıcı için **"Daha fazla filtre"** akordeyon'u — kapalı varsayılan.

### D. MTF Confluence Sadeleştirme

Eski:
```
1w: 12, 1d: 9, 4h: 7, 1h: 5, 15m: 3, 5m: 2.5, 1m: 2
Composite score: 41.5 / 52 → STRONG_LONG
```

Yeni:
```
🟢  BTCUSDT  ──  AL (güçlü)
    Hem kısa, hem uzun vade aynı yönde.
    Detay: Uzun vade güçlü ✓ · Orta vade güçlü ✓ · Kısa vade güçlü ✓
```

3 grup: **Uzun vade** (1w + 1d), **Orta vade** (4h + 1h), **Kısa vade** (15m + 5m + 1m). Her grup ✓ veya ✗ olarak özetlenir.

### E. Coin/Hisse Detay Modali (MTFCoinDetailModal.jsx)

Mevcut: 3 tab × 7 TF × 12 indicator.

Yeni — 2 mod:
- **Basit Mod (varsayılan)**:
  - Üstte büyük etiket: AL / BEKLE / RİSKLİ
  - Altında 3 satır: Uzun vade, Orta vade, Kısa vade — her biri ✓/✗ + tek cümle
  - "Bot ile takip et" CTA (Parça 3 ile bağlanacak)
  - "Takip listeme ekle" CTA
- **Detaylı Mod (toggle)**:
  - Mevcut 3 tab × 7 TF tablosunu olduğu gibi göster.

### F. Canlı Sinyaller Sayfası (/sinyaller)

`Sinyaller.jsx` zaten "komuta merkezi". Yeniden düzenlenmesi:
- **Üst**: 3 büyük canlı kart (Dashboard'daki gibi ama "şu an" anlık)
- **Orta**: BIST canlı tablo (yeni satır formatıyla)
- **Alt**: Kripto canlı tablo (aynı format)
- **Heatmap** alt tab olarak (`?tab=heatmap`) — sade renk skalası, mevcut LiveHeatmap.jsx olduğu gibi gömülür.

### G. Boş State

Eski: boş tablo, "No data" yazısı.

Yeni:
```
Henüz güçlü fırsat bulunamadı.
Yeni fırsat çıktığında burada göreceksin.
[Bildirim aç →]
```

---

## Adım Adım Yapılacaklar

1. **`src/utils/signalLabels.js`** oluştur. Export `mapSignalToLabel(direction, score) → { label, color, sentence }`. Yukarıdaki tabloyu uygula.
2. **Yeni `SignalRow.jsx`** component'i: emoji + sembol + etiket + cümle + [Detay ↓] expand. Inline detail'da mevcut sayısal alanları (RSI, MACD, vb.) tut.
3. **`Tarayicilar.jsx`** içindeki her alt sekme tablo render'ını `SignalRow` ile değiştir.
4. **`GunlukTespitler.jsx`** — `BugununSinyalleri`, `KriptoSinyalleri`, `MTFSinyalleri` component'lerinin satır render'ını `SignalRow`'a çevir.
5. **`MTFConfluenceSummary.jsx`** — ağırlıkları gizle, 3 grup (uzun/orta/kısa) ✓/✗ özetiyle değiştir. Ağırlık detayını "Hesaplama detayı" akordeyon altına koy.
6. **`MTFCoinDetailModal.jsx`** — Basit Mod'u varsayılan yap, eski 3-tab×7-TF görünümünü "Detaylı Mod" toggle'ı arkasına koy.
7. **Sinyaller.jsx** — üst 3 büyük canlı kart + 2 sade tablo + heatmap alt tab.
8. **Filtre pill'lerini** 4 öğeye indir (`Güçlüler/Yeni Hareketler/Riskliler/Bugün Yükselenler`). Eski filtreleri "Daha fazla filtre" akordeyon'a taşı.
9. **Boş state**: Tüm tablo render'larında veri yoksa yukarıdaki "Henüz güçlü fırsat bulunamadı..." cümlesi.
10. **Push bildirim metni**: Backend'de bildirim üreten servisleri (`backend/src/services/signalService.js`, `cryptoSignalService.js`, `mtfService.js`) bul. `"Signal triggered: BUY THYAO"` gibi metinleri `"THYAO için al sinyali — yükseliş başladı"` şeklinde insan diline çevir. (Parça 5 master prompt'u bunu yakalayacak ama burada da geç.)

---

## Kelime Sözlüğü (UI'da Görünenler)

| Eski | Yeni |
|------|------|
| BUY / STRONG_LONG | **AL** |
| SELL / STRONG_SHORT | **RİSKLİ** / **ŞİMDİ GİRME** |
| HOLD / NEUTRAL | **BEKLE** |
| Watch / WEAK_LONG | **TAKİP ET** |
| Signal triggered | "Hareket başladı" |
| Threshold exceeded | "Yön belli oldu" |
| RSI overbought | "Çok hızlı yükseldi" |
| RSI oversold | "Çok hızlı düştü" |
| MACD bullish cross | "Yükseliş onayı" |
| MACD bearish cross | "Zayıflama onayı" |
| Volume spike | "Hacim arttı" |
| Volatility regime: high | "Oynak piyasa" |
| Volatility regime: low | "Sakin piyasa" |
| Confidence: 0.78 | "Güçlü işaret" (≥0.7) / "Orta" (0.4-0.7) / "Zayıf" (<0.4) |
| Score: 14/16 | (hiç gösterme — UI etiketine map'le) |
| Timeframe / TF | "Vade" veya tamamen gizle |
| Confluence | "Birleşik görüntü" |
| Long / Short | "Yükseliş" / "Düşüş" |

---

## Kabul Kriterleri

- [ ] Hiçbir sonuç satırında ham sayı görünmüyor (RSI, MACD, ATR vb.) — sadece [Detay ↓] expand içinde.
- [ ] Her satır tek cümleyle ne yapılacağını söylüyor.
- [ ] Renk + etiket eşleşmesi: 🟢 AL, 🔴 RİSKLİ, 🟡 BEKLE/TAKİP, ⚪ Nötr.
- [ ] Filtre pill'i en fazla 4 öğe.
- [ ] MTF Confluence'da ağırlıklar (12, 9, 7, ...) varsayılan görünmüyor.
- [ ] Coin detay modali Basit Mod'da açılıyor.
- [ ] Boş state'lerde "Henüz fırsat yok" cümlesi var.
- [ ] Push bildirim metinleri sade Türkçe.
- [ ] `npm run build` hatasız geçiyor.

---

## AI Komut Bloğu (Kopyala-Yapıştır)

```
BorsaKrali frontend'inde Parça 2 — tarayıcı, günlük sinyaller ve canlı sinyaller sayfalarını AL/SAT/BEKLE etiketleriyle sadeleştir.

Dizin: C:\Users\hsnkr\Desktop\site\borsasanati-clone\frontend

Yapılacaklar:
1. src/utils/signalLabels.js oluştur. Export et: mapSignalToLabel(direction, score) → { label: 'AL'|'BEKLE'|'TAKİP ET'|'ŞİMDİ GİRME'|'RİSKLİ', color: 'jade'|'gold'|'gray'|'ember', sentence: string, emoji: '🟢'|'🟡'|'⚪'|'🔴' }. Eşleme tablosu:
   STRONG_LONG veya (LONG ve score>=12) → AL (yeşil) "Güçlü yükseliş sinyali."
   LONG (score 9-11) → AL (yeşil) "Yükseliş başladı."
   WEAK_LONG (score 6-8) → TAKİP ET (sarı) "Yatay seyir, çıkış olabilir."
   NEUTRAL (score 0-5) → BEKLE (gri) "Net yön yok, beklemede kal."
   WEAK_SHORT (6-8 short) → TAKİP ET (sarı) "Zayıflama belirtisi."
   SHORT (9-11 short) → ŞİMDİ GİRME (kırmızı) "Düşüş baskısı var."
   STRONG_SHORT veya (SHORT ve score>=12) → RİSKLİ (kırmızı) "Sert düşüş sinyali."

2. src/components/SignalRow.jsx oluştur. Props: { symbol, direction, score, advancedData (opsiyonel) }. Render:
   - Üstte: emoji + sembol (bold) + " — " + etiket (renkli, bold)
   - Altında: cümle (gri, küçük)
   - [Detay ↓] tıklanırsa accordion açılır, advancedData içindeki tüm sayıları (RSI, MACD, ATR, fiyat, hacim, vb.) göster

3. src/pages/Tarayicilar.jsx ve src/pages/GunlukTespitler.jsx içinde her sonuç tablosu render'ını SignalRow'a çevir. Mevcut sayısal kolonları sil, ama satıra tıklayınca expand'de göster.

4. src/components/MTFConfluenceSummary.jsx: ağırlık matrisini (1w×12, 1d×9, vb.) gizle. Yerine:
   - "Uzun vade" satırı: 1w + 1d ortalama yönü ✓ veya ✗
   - "Orta vade" satırı: 4h + 1h ortalama yönü ✓ veya ✗
   - "Kısa vade" satırı: 15m + 5m + 1m ortalama yönü ✓ veya ✗
   - Eski detaylı tabloyu "Hesaplama detayı" toggle altına koy.

5. src/components/MTFCoinDetailModal.jsx: Modal üstüne "Basit / Detaylı" toggle ekle (varsayılan Basit). Basit modda:
   - Büyük etiket (signalLabels'tan)
   - 3 satır (uzun/orta/kısa vade) ✓/✗ + tek cümle
   - "Bot ile takip et" ve "Takip listeme ekle" CTA butonları
   Detaylı modda mevcut 3-tab × 7-TF görünümü olduğu gibi kalsın.

6. src/pages/Sinyaller.jsx: üstte 3 büyük canlı kart (Dashboard'dakine benzer şablon), ortada BIST tablo (SignalRow), altta Kripto tablo (SignalRow), heatmap alt tab olarak (?tab=heatmap, mevcut LiveHeatmap.jsx render).

7. Filtre sadeleştirme: Tüm Tarayicilar alt sekmelerinde ve GunlukTespitler'de filtre alanını şu pill'lere indir: "Güçlüler", "Yeni Hareketler", "Riskliler", "Bugün Yükselenler". Eski filtreleri "Daha fazla filtre" accordion'a taşı.

8. Boş state metinleri: Tüm sonuç tablolarında veri yoksa "Henüz güçlü fırsat bulunamadı. Yeni fırsat çıktığında burada göreceksin." + [Bildirim aç →] linki (/hesabim?tab=ayarlar).

9. Backend push metinleri: backend/src/services/ altında signalService.js, cryptoSignalService.js, mtfService.js dosyalarını oku. "Signal triggered: X BUY" gibi push body metinlerini "X için al sinyali — yükseliş başladı" gibi sade Türkçe'ye çevir.

Kısıtlar:
- Backend response şeması değişmiyor — sadece UI mapping.
- Mevcut SignalRow'a benzer eski component'ler (BugununSinyalleri vs.) varsa, sadece satır render'ını değiştir, dış shell aynı kalsın.
- Confidence numarası gösterme — Güçlü/Orta/Zayıf string'ine map'le.
- TF/Timeframe kelimesini UI'dan tamamen kaldır (gerekirse "kısa vade", "uzun vade" de).
- npm run build hatasız geçmeli.

Bittiğinde: signalLabels.js'in kapsadığı edge case'leri, kaç dosya etkilendiğini, push metin değişikliklerini raporla.
```
