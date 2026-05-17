# PARÇA 3 — Trading Bot Sadeleştirme (3 Adımlı Kurulum)

> Bu prompt'u yeni bir Claude oturumuna yapıştırıp çalıştırabilirsin.
> Bağımlılık: Parça 1 (yeni `/botlar` route'u) ve Parça 5 (dil sözlüğü).

---

## Amaç

`TradingBot.jsx` — Freqtrade'in 5 stratejisini Node.js'e port etmiş, Walk-Forward + Monte Carlo + OOS + Slippage Stress sınama katmanı olan teknik bir ekran. Kullanıcı buraya bakınca **"bu bana para mı kazandıracak yoksa benim mi öğrenmem lazım?"** sorusuna takılıyor.

Hedef: kullanıcı 3 tıklamayla bot başlatacak — **risk seç, bütçe gir, başlat**. Teknik parametreler "Gelişmiş Ayarlar" akordeyonu arkasına gizlenecek.

---

## Bağlam

- **Sayfa**: `src/pages/TradingBot.jsx`
- **Backend**: `backend/src/services/tradingBot/*` (5 strateji + sınama katmanı). Detaylar: `memory/project_trading_bot.md`.
- **Yan sayfa**: `src/pages/PaperTrading.jsx` — varsayılan "Kağıt Üzerinde Dene" modu.
- **Bağlı component'lar**:
  - `components/BacktestPanel.jsx` (backtest UI — gelişmiş modda kalır)
  - `components/TradePlanCard.jsx` (al/zarar durdur/kâr hedef)

---

## Mevcut Sorun

1. **5 strateji adıyla görünüyor** (örn. `ATR_Tabanlı_Trend`, `EMA_Crossover_Long`, `Bollinger_Squeeze`, ...) — kullanıcı seçim yapamaz.
2. **Walk-Forward, Monte Carlo, OOS, Slippage Stress** sekmeleri ön planda — sayısal istatistik salatası (Sharpe, MAR, max DD, win rate, profit factor).
3. **Parametre girişleri ham**: `EMA Period (3-200)`, `RSI Threshold (10-90)`, `Stop Loss %`, `Take Profit %`, `Leverage`, `Position Size`.
4. **Risk yönetimi gizli** — kullanıcı leverage 10x set'leyip portfolio'sunun tamamını risk'e atabiliyor, uyarı yok.
5. **"Çalıştır" butonu sonrası belirsizlik**: bot çalışınca ne görünecek, nasıl durdurulacak, ne zaman para kazandıracak — net değil.

---

## Hedef Çıktı

### A. Yeni Bot Seçim Ekranı — 3 Kart

Sayfaya giriş yapan kullanıcı **tek bir soru** görüyor: "Hangi riski tercih edersin?"

```
┌────────────────────────────────────────┐
│  🟢  Güvenli Bot                       │
│                                         │
│      Düşük riskli hisseleri takip eder. │
│      Yavaş ama istikrarlı.             │
│                                         │
│      Tahmini kazanç: ayda ~%2-5        │
│      Risk seviyesi: Düşük              │
│                                         │
│      [Seç →]                            │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  🟡  Hızlı Bot                         │
│                                         │
│      Kısa hareketleri yakalamaya çalışır.│
│      Daha çok işlem, daha çok hareket. │
│                                         │
│      Tahmini kazanç: ayda ~%5-12       │
│      Risk seviyesi: Orta               │
│                                         │
│      [Seç →]                            │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│  🔴  Cesur Bot                         │
│                                         │
│      Sert hareketleri kovalar.         │
│      Yüksek kazanç, yüksek risk.       │
│                                         │
│      Tahmini kazanç: ayda ~%10-30      │
│      Risk seviyesi: Yüksek             │
│                                         │
│      [Seç →]                            │
└────────────────────────────────────────┘
```

**Arka planda** her kart şu strateji eşleşmesini yapar:
- Güvenli Bot → en düşük volatilite + en yüksek win rate'li strateji (örn. `Bollinger_Mean_Reversion`).
- Hızlı Bot → orta strateji (örn. `EMA_Crossover_Long`).
- Cesur Bot → yüksek volatilite + yüksek getiri (örn. `ATR_Breakout`).

### B. Kurulum 3 Adımı

Kart seçildikten sonra **wizard**:

**Adım 1 — Bütçe**
```
Bu bota ne kadar bütçe ayırmak istiyorsun?

[ 1.000 TL ]   [ 5.000 TL ]   [ 10.000 TL ]   [ Özel ]

ℹ Bot bu bütçenin tamamını riske atmaz, parça parça kullanır.
```

**Adım 2 — Onay**
```
✓ Cesur Bot
✓ Bütçe: 5.000 TL
✓ Para kaybı ihtimali var, lütfen sadece kaybetmeyi göze alabileceğin parayı ayır.

[ ] Anladım, bunu kabul ediyorum.

[İptal]   [Başlat →]
```

**Adım 3 — Çalışıyor**
```
🟢 Cesur Bot çalışıyor.

Bugünkü durum: Henüz işlem yok, fırsat bekleniyor.
Son işlem: 18 saat önce ASELS al — kâr +2.3%

[Durdur]   [Geçmiş işlemler]   [Ayar değiştir]
```

### C. Çalışırken Görünen Ekran (Bot Aktif)

Tek bir kart, içinde:

| Bölüm | İçerik |
|-------|--------|
| Durum | 🟢 Çalışıyor / 🟡 Bekleme / 🔴 Durduruldu |
| Bugünkü kâr/zarar | `+185 TL (+3.7%)` — büyük yazı, renkli |
| Bugünkü işlem sayısı | "Bugün 2 işlem yaptı" |
| Son işlem | "18 saat önce — ASELS al — +2.3%" |
| Risk seviyesi | "Orta — bütçenin en fazla %30'u açık pozisyonda" |
| CTA | `[Durdur]`, `[Geçmiş işlemler]`, `[Gelişmiş Ayarlar]` |

**Gelişmiş Ayarlar** akordeyon altında:
- Strateji adı (`Bollinger_Mean_Reversion`)
- EMA, RSI, MACD ham parametreleri (düzenlenebilir)
- Stop loss / take profit %
- Leverage (1x kilitli — değiştirmek için "Riski kabul ediyorum" onayı)
- Walk-forward / Monte Carlo / OOS / Slippage Stress backtesting sekmeleri (BacktestPanel.jsx)

### D. Stop Loss / Take Profit Dili

| Eski | Yeni |
|------|------|
| Stop Loss | **Zarar Durdur** — "Fiyat çok düşerse sistem çıkış yapar." |
| Take Profit | **Kâr Al** — "Hedefe ulaşınca satış yapılır." |
| Trailing Stop | **Akıllı Zarar Durdur** — "Fiyat yükselirse zarar sınırı da yükselir." |
| Position Size | **İşlem Büyüklüğü** — "Bu işleme ne kadar ayrılsın." |
| Risk/Reward Ratio = 2.34 | **Kazanç ihtimali zarardan ~2 kat fazla.** |

### E. Yeni Kullanıcı için Varsayılan: Kağıt Üzerinde Dene

İlk kez `/botlar` açan kullanıcıya **tooltip**:
> "İlk kez deniyorsan **Kağıt Üzerinde Dene** modunu seç — gerçek para kullanılmaz, sistem nasıl çalışıyor görürsün."

PaperTrading sayfasına link veya alt sekme (`?tab=paper`).

### F. Risk Uyarıları

- Cesur Bot seçildiğinde Adım 2'de kırmızı kutuda: "Bu bot büyük kazanç ihtimali olduğu kadar büyük kayıp ihtimali de taşır. Sadece kaybetmeyi göze alabileceğin parayı bağla."
- Leverage > 1x değiştirilirse: ek modal "Türev işlemler ile portfolio'nun tamamını kaybedebilirsin. Devam etmek için yazıyı yaz: ANLADIM"

### G. Sade Performans Metrikleri (Backtest sonrası)

Eski: `Sharpe: 1.8`, `MAR: 0.6`, `Max DD: -18%`, `Win Rate: 54%`, `Profit Factor: 1.4`, `Calmar: 0.8`.

Yeni:
- "Geçmiş test sonucu: yıllık ortalama **+%23** kazanç."
- "En kötü dönemde **-%18** düşüş yaşadı."
- "İşlemlerin **%54**'ü kârlı bitti."
- "1 TL zarar başına ~**1.40 TL** kazanmış."

**Sertifika rozeti**: yeşil onay "✓ Geçmiş test edildi" — detaylar tıklayınca açılır.

---

## Adım Adım Yapılacaklar

1. **`src/pages/TradingBot.jsx`** — mevcut karmaşık ekranı arşivle (içeriğini gizle, `?advanced=true` parametresiyle erişilebilir tut), yeni 3-kart seçim ekranını üste koy.
2. **Yeni component'lar**:
   - `components/BotRiskCard.jsx` — 3 risk kartından birini render eder
   - `components/BotSetupWizard.jsx` — 3 adımlı kurulum
   - `components/BotStatusCard.jsx` — çalışırken görünen tek kart
3. **Strateji eşlemesi** (`src/utils/botProfiles.js`):
   ```js
   export const BOT_PROFILES = {
     safe:    { strategyId: 'bollinger_mean_reversion', risk: 'low',  ... },
     fast:    { strategyId: 'ema_crossover_long',       risk: 'mid',  ... },
     bold:    { strategyId: 'atr_breakout',             risk: 'high', ... },
   }
   ```
   Backend strateji adları proje memory'sinde — değiştirme, sadece eşle.
4. **Backend endpoint** (varsa yok):
   - `POST /api/bot/start` — body: `{ profile: 'safe'|'fast'|'bold', budget: number }`
   - `GET /api/bot/status` — body: `{ running, todayPnL, lastTrade, openPositions }`
   - `POST /api/bot/stop`
   Mevcut endpoint'ler varsa wrapper yaz.
5. **Risk uyarı modali** — `components/RiskAcknowledgeModal.jsx` (Cesur Bot + leverage > 1x için).
6. **PaperTrading entry**: `/botlar?tab=paper` linkini Adım 1'in üstüne "İlk kez mi? Kağıt Üzerinde Dene →" şeklinde sun.
7. **BacktestPanel.jsx** — sayısal sonuçları sade Türkçe etiketlere çevir (yukarıdaki F. tablosu).
8. **TradePlanCard.jsx** — Stop Loss → "Zarar Durdur", Take Profit → "Kâr Al" yazı değişiklikleri.
9. **Risk/Reward** hesabı — "Risk/Reward = 2.34" yerine "Kazanç ihtimali zarardan ~2 kat fazla." cümle render'ı.

---

## Kabul Kriterleri

- [ ] `/botlar` sayfasında ilk görünen şey 3 risk kartı.
- [ ] EMA, RSI, MACD, ATR, Sharpe, MAR, Profit Factor kelimeleri varsayılan ekranda görünmüyor.
- [ ] Bot kurulumu 3 adımda (Risk → Bütçe → Başlat) bitiyor.
- [ ] Cesur Bot için risk onayı checkbox zorunlu.
- [ ] Leverage > 1x için yazılı onay (`ANLADIM`) zorunlu.
- [ ] Çalışırken tek kart görünüyor: durum + bugünkü kâr/zarar + son işlem + 3 CTA.
- [ ] "Stop Loss" kelimesi tüm UI'dan kalktı, "Zarar Durdur" var.
- [ ] PaperTrading entry yeni kullanıcıya görünür konumda.
- [ ] Gelişmiş ayarlar (eski ekranlar) `?advanced=true` veya akordeyon altında erişilebilir.
- [ ] `npm run build` hatasız geçiyor.

---

## AI Komut Bloğu (Kopyala-Yapıştır)

```
BorsaKrali frontend'inde Parça 3 — Trading Bot sayfasını 3 risk kartı + 3 adımlı wizard'a indir.

Dizin: C:\Users\hsnkr\Desktop\site\borsasanati-clone\frontend
Memory referans: memory/project_trading_bot.md (5 strateji + sınama katmanı detayları)

Yapılacaklar:
1. src/utils/botProfiles.js oluştur:
   export const BOT_PROFILES = {
     safe: { strategyId: <backend'deki en düşük volatilite stratejisi>, risk: 'low',  label: 'Güvenli Bot', emoji: '🟢', estReturn: '%2-5/ay', desc: 'Düşük riskli hisseleri takip eder.' },
     fast: { strategyId: <orta strateji>, risk: 'mid', label: 'Hızlı Bot', emoji: '🟡', estReturn: '%5-12/ay', desc: 'Kısa hareketleri yakalamaya çalışır.' },
     bold: { strategyId: <yüksek volatilite>, risk: 'high', label: 'Cesur Bot', emoji: '🔴', estReturn: '%10-30/ay', desc: 'Sert hareketleri kovalar.' },
   }
   Backend strateji adlarını project_trading_bot.md'den oku, gerçek strategyId'leri yaz.

2. Yeni component'lar:
   - src/components/BotRiskCard.jsx: { profile } → emoji + label + desc + estReturn + risk + [Seç] CTA
   - src/components/BotSetupWizard.jsx: 3 step state machine (risk seçildi → bütçe → onay → başlat). Bütçe pill'leri: 1.000, 5.000, 10.000, Özel.
   - src/components/BotStatusCard.jsx: GET /api/bot/status sonucundan tek kart: durum + bugünkü kâr/zarar + son işlem + [Durdur][Geçmiş][Gelişmiş]
   - src/components/RiskAcknowledgeModal.jsx: Cesur Bot + leverage>1x için "ANLADIM" yazma onayı

3. src/pages/TradingBot.jsx yeniden düzenle:
   - URL ?advanced=true ise eski karmaşık ekranı render et (backward compat)
   - Default: BotStatusCard (eğer aktif bot varsa) veya 3 BotRiskCard + "İlk kez mi? [Kağıt Üzerinde Dene →]" linki
   - Risk kartı seçilirse BotSetupWizard aç

4. Backend kontrol et: backend/src/services/tradingBot/ altında start/status/stop endpoint'leri varsa kullan, yoksa minimum:
   - POST /api/bot/start { profile, budget } → strategyId'yi BOT_PROFILES'tan al, mevcut start fonksiyonunu çağır
   - GET /api/bot/status → { running, todayPnL: number, lastTrade: { symbol, action, pctChange, timestamp }, openPositions: [] }
   - POST /api/bot/stop

5. src/components/BacktestPanel.jsx — sayısal metrikleri sade etiketlere çevir:
   - Sharpe → gizle veya "Risk-getiri dengesi: iyi/orta/zayıf"
   - Max DD → "En kötü dönemde -%X düşüş yaşadı."
   - Win Rate → "İşlemlerin %X'i kârlı bitti."
   - Profit Factor → "1 TL zarar başına ~X TL kazanmış."
   - MAR, Calmar → gizle (gelişmiş akordeyonda kalsın)

6. src/components/TradePlanCard.jsx (varsa) içinde:
   - "Stop Loss" → "Zarar Durdur"
   - "Take Profit" → "Kâr Al"
   - "Risk/Reward" → "Kazanç ihtimali zarardan ~X kat fazla."

7. Push bildirim metinleri: backend'de bot işlem bildirim metinlerini sade Türkçe'ye çevir. Örnek: "Bot opened LONG ASELS @47.20" → "Bot ASELS aldı (47.20 TL)".

Kısıtlar:
- Backend strateji mantığı değişmiyor.
- ?advanced=true ile eski ekran hep erişilebilir kalsın (kullanıcı/destek için).
- BOT_PROFILES'ta yer alan strategyId'ler backend ile bire bir uyuşmalı, yoksa start çağrısı kırılır.
- npm run build hatasız geçmeli.

Bittiğinde: BOT_PROFILES eşlemesi, yeni component listesi, ?advanced=true ile eski erişimin korunduğunu raporla.
```
