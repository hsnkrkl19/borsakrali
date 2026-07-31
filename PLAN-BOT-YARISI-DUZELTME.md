# Bot Yarışı — Onarım ve Akıllandırma Planı

> **Başlangıç:** 2026-07-31 · **Tetikleyen:** günlük rapor 18 işlem/−74,51 $ derken gerçek
> hesap 60+ işlem/−3.234,88 $ gösterdi; dün +5-6 bin $ kâr, bugün −3 bin $ zarar.
>
> **Bu dosya çalışmanın tek gerçeğidir.** Her görev bittiğinde durumu burada güncelle.
> Kesinti olursa "Sonraki adım" satırından devam et.

**Sonraki adım:** C1 (bot hunisi — "işlem yok" yerine sebep). 
**Faz A ve Faz B BİTTİ** (A4/A5 gereksiz çıktı: beyin zaten tüm magic'leri raporluyor).
VPS'e ZIP: köprü işleri bitti, **tek ZIP verilmeye hazır** (A2/A2b/B1/B2/B3/B4).

---

## 0. Kullanıcı kararları (kilitli — tartışma kapandı)

| # | Karar | Değer |
|---|---|---|
| D1 | İşlem başına risk | **En fazla 250 $** (yüzde ne derse desin, dolar tavanı üstündür) |
| D2 | Lot tavanı | **Enstrümana göre otomatik** — her enstrümanda aynı DOLAR riski hedeflenir |
| D3 | Korelasyon koruması | **Toplam açık risk tavanı** (bot sayısı sınırsız, hesap riski sınırlı) |
| D4 | Kaybeden bot | **Sadece raporla** — eleme kararı kullanıcının |
| D5 | Gerçek pozisyonu kim kapatır | **Yalnız beyin/broker** (TP, SL, trail, kâr kilidi, sürü dönüşü). Kâğıt yarışma gerçeğe karışmaz |
| D6 | Telegram | **Açılış anlık ve 1:1**, **kapanışlar toplu olabilir** |
| D7 | Günlük fren | **%4,5 kalsın** (değişiklik yok) |

---

## 1. Doğrulanmış kök nedenler

> Kanıt sütunu: dosya:satır veya gözlem. "⏳" = teşhis workflow'undan doğrulama bekliyor.

| ID | Kök neden | Etki | Kanıt |
|---|---|---|---|
| R1 | `report_real_results` beyin açıkken **erken dönüyor** → kapanış defterinin TEK sahibi beyin | Beyin tıkanırsa hiç kayıt olmaz | `borsakrali_mt5_all.py:749-753` |
| R2 | Beyin `_report_state`, açılış kuyruğu doluyken **kapanışları hiç göndermiyor** (`return False`) | Telegram tıkanınca defter durur | `borsakrali_account_brain.py` `_report_state` başı |
| R3 | Telegram teslim hatası → `/api/bridge/state` **503** → beyin cursor'u ilerletmez | Bildirim ile muhasebe **aynı kadere bağlı** | `bridge.routes.js:90-99`; gece logu `retryableFailures 22` |
| R4 | Yarış modunda risk bütçesi yalnız işlem-başı: %0,25 × 197k = **~492 $/işlem** | Lot sürekli 1.00 tavanına dayanıyor | `account_brain.py` `limits_usd` race dalı |
| R5 | `account_tier_max_lot = 1.0` **tüm enstrümanlarda aynı** | 1 lot altın ≈ 10× 1 lot EURUSD riski → −414,90 $ | `mt5_brain_adapter.py` `_symbol_spec` |
| R6 | Forex (550055) ve tarayıcı (550066) köprüleri **sonuç raporlamıyor** | Bot 1 ve Bot 5 hep "işlem yok" | `borsakrali_mt5.py`/`_scanner.py` içinde `/bridge/results` yok |
| R7 | `close_on_feed_drift` / `close_on_backend_close`: kâğıt yarışma gerçek pozisyonu kapatıyor | 3R hedef ve trail devreye giremiyor → kuruşluk kapanışlar | Gece logu `competition-kapatti` |
| **R9** | **Günlük rapor `dedicatedBridgeMagic` okumuyordu** → Bot 1 (550055) ve Bot 5 (550066) işlemleri hem listeden hem GÜN TOPLAMI'ndan düşüyordu | 18 vs 60 farkının **doğrudan sebebi** | ✅ düzeltildi `f656a2f` |
| **R10** | Cursor, `live` anlık görüntüsü yüzünden atlanan pozisyonların **üzerinden atlıyor** → toplu kapanışta kalıcı satır kaybı | Kapanış bir daha asla raporlanmaz | ⏳ A2b |
| R8 | ⏳ Bot bazlı sinyal→emir hunisi kaydı yok | 36 bot "işlem yok" mu, "sinyal verdi ama açılamadı" mı ayırt edilemiyor | teşhis bekliyor |

---

## 2. Görevler

**Okuma kılavuzu:** `Ajan?` = başka bir ajana devredilebilir mi. `Nerede canlıya çıkar`:
`BE` = yalnız backend deploy (push yeter), `VPS` = yeni ZIP + DURDUR/DEVAM gerekir.

### Faz A — VERİ BÜTÜNLÜĞÜ (defter mutlaka tutulsun)

> Amaç: Telegram, ağ, sıra, kuyruk ne olursa olsun **her gerçek işlem deftere yazılsın**.
> Bu faz bitmeden diğer ölçümlerin hiçbirine güvenilemez.

| ID | Görev | Dosyalar | Kabul kriteri | Bağımlılık | Boyut | Ajan? | Nerede |
|---|---|---|---|---|---|---|---|
| **A1** | `/api/bridge/state` ve `/results`: defter yazımını bildirimden ayır. `realResults.ingest` başarılıysa yanıt **200 + `notifyPending:true`** dönsün; 503 yalnız *geçersiz satır* için kalsın | `backend/src/routes/bridge.routes.js` | Golden test: Telegram tamamen başarısızken bile `realResults` satır sayısı artar ve HTTP 200 döner | — | S | ✅ | BE |
| **A2** | Beyin: kapanış raporunu açılış kuyruğunun arkasında bekletme. Kuyruk doluyken de `closed` gönderilsin (sıra yalnız **Telegram tarafında** korunur) | `mt5-bridge/borsakrali_account_brain.py` | Offline test: outbox'ta 5 bekleyen açılış varken `_report_state` yine de closed satırlarını POST eder | A1 | S | ✅ | VPS |
| **A3** | Beyin cursor'u: POST 200 ise ilerlet; `notifyPending` dönse bile defter yazıldığı için ilerlesin. Bildirim kuyruğu ayrı yaşasın | `mt5-bridge/borsakrali_account_brain.py` | Test: art arda 3 tur, aynı deal 2. kez gönderilmez; Telegram başarısız olsa da cursor ilerler | A2 | S | ✅ | VPS |
| **A4** | Forex köprüsü (550055) kapanış sonucu raporlasın | `mt5-bridge/borsakrali_mt5.py` | Test: kapanan 550055 işlemi `/api/bridge/results`'a düşer; Bot 1 raporda görünür | A1 | M | ✅ | VPS |
| **A5** | Tarayıcı köprüsü (550066) kapanış sonucu raporlasın | `mt5-bridge/borsakrali_mt5_scanner.py` | Test: kapanan 550066 işlemi deftere girer; Bot 5 raporda görünür | A4 | M | ✅ | VPS |
| **A6** | **Mutabakat (reconciliation) ucu**: backend belirli bir günün MT5 deal listesini köprüden isteyip kendi defteriyle karşılaştırsın; eksikleri geri doldursun | `backend/src/routes/bridge.routes.js`, `backend/src/services/realResults/store.js`, `mt5-bridge/borsakrali_account_brain.py` | `POST /api/bridge/reconcile` çağrısı bugünün eksik işlemlerini bulup ekler; rapor gerçek toplamla eşleşir | A3 | L | ✅ | VPS+BE |
| **A7** | Günlük raporun altına **mutabakat satırı**: "defterdeki net vs brokerdaki net" farkı yazsın; fark varsa uyarı | `backend/src/services/botDailyReport/index.js` | Rapor mesajında `Defter −74,51 $ · Broker −3.234,88 $ · FARK var` benzeri satır çıkar | A6 | S | ✅ | BE |

### Faz B — RİSK (zarar büyüklüğünü kontrol et)

| ID | Görev | Dosyalar | Kabul kriteri | Bağımlılık | Boyut | Ajan? | Nerede |
|---|---|---|---|---|---|---|---|
| **B1** | **D1:** işlem başına mutlak dolar risk tavanı (`max_trade_risk_usd = 250`). Yüzde hesabı bu tavanı aşamaz | `mt5-bridge/account_brain.py`, `mt5_brain_adapter.py` | Test: 197k hesap, %0,25 → risk 250 $'da kırpılır; lot buna göre küçülür | — | S | ✅ | VPS |
| **B2** | **D2:** enstrüman-normalize lot. `volume_max` sabit 1.00 yerine "250 $ riski aşmayan en büyük lot" olsun; sınıf bazlı emniyet tavanı (forex/endeks/kripto/emtia) ikinci katman | `mt5-bridge/mt5_brain_adapter.py`, `mt5-bridge/account_brain.py` | Test: XAUUSD 10 $ stopta lot ≤ 0.25; EURUSD 20 pip stopta lot ~1.2 ama dolar riski her ikisinde de ≤250 $ | B1 | M | ✅ | VPS |
| **B3** | **D3:** yarış modunda toplam açık risk tavanı geri gelsin (varsayılan %3). Tavana gelince yeni giriş **beklemeye alınır**, mevcutlar yönetilir; sebep loglanır ve heartbeat'e yazılır | `mt5-bridge/account_brain.py`, `borsakrali_account_brain.py` | Test: açık risk %3'e ulaşınca yeni aday `total_open_risk_ceiling` ile reddedilir; %2,9'da kabul edilir | B2 | M | ✅ | VPS |
| **B4** | **D5:** kâğıt yarışma gerçek pozisyonu kapatamasın. `close_on_feed_drift`/`close_on_backend_close` yarış modunda kapalı; kapatma yetkisi yalnız beyin+broker | `mt5-bridge/borsakrali_mt5_all.py`, `borsakrali_mt5.py`, `borsakrali_mt5_scanner.py` | Test: feed'den kod düşse de gerçek pozisyon kapanmaz; log "kapatma yetkisi beyinde" der | — | M | ✅ | VPS |
| **B5** | Sembol+yön yığılma sayacı **görünür** olsun (kesmese de): heartbeat ve loga "XAUUSD long ×7" yazılsın | `mt5-bridge/borsakrali_account_brain.py` | Heartbeat JSON'da `concentration` alanı; günlük raporda en yığılmış 3 sembol | B3 | S | ✅ | VPS |

### Faz C — GÖRÜNÜRLÜK (neden ne oldu, ölçülebilsin)

| ID | Görev | Dosyalar | Kabul kriteri | Bağımlılık | Boyut | Ajan? | Nerede |
|---|---|---|---|---|---|---|---|
| **C1** | **Bot hunisi**: her bot için `sinyal üretti → beyin onayladı/reddetti (sebep) → emir gitti → doldu → kapandı` sayaçları. Reddedilen kararlar zaten `/api/bridge/audit`'e gidiyor; bunu kalıcı sayaca çevir | `backend/src/services/realResults/store.js` (veya yeni `botFunnel/`), `bridge.routes.js` | `GET /api/bot/funnel` her bot için 5 sayacı döner; 24 saatlik pencere | A1 | L | ✅ | BE |
| **C2** | Günlük rapor: "işlem yok" yerine **sebep** yazsın — "sinyal yok" / "12 sinyal, hepsi reddedildi (sembol yok)" / "8 sinyal, 3 emir" | `backend/src/services/botDailyReport/index.js` | Rapor mesajında her bot için huni özeti; 36 botun neden sessiz olduğu anlaşılır | C1 | M | ✅ | BE |
| **C3** | **D6:** Telegram — açılış anlık 1:1 kalsın; kapanışlar 60 sn'lik pencerede tek mesajda toplansın (tek işlem varsa tek satır, çoksa özet + detay) | `backend/src/services/mt5TradeNotifier/index.js` | Test: 10 kapanış 60 sn içinde → 1 mesaj, 10 satır; açılışlar ayrı ayrı gider; hiçbir kapanış kaybolmaz | A1 | M | ✅ | BE |
| **C4** | Kapanış sebebi mesajda görünsün: TP / SL / iz süren stop / kâr kilidi / sürü dönüşü / gün sonu | `backend/src/services/mt5TradeNotifier/index.js`, `mt5-bridge/borsakrali_account_brain.py` | Kapanış mesajında `Sebep: iz süren stop (+2,1R)` satırı | C3 | S | ✅ | BE+VPS |
| **C5** | Site `/bot` sayfası: yarış tablosu + huni + mutabakat durumu tek ekranda | `frontend/src/pages/Bot.jsx` | Panelde bot başına işlem/net/isabet + "defter sağlıklı mı" rozeti | C1, A7 | M | ✅ | BE |

### Faz D — AKILLI KARAR (tutarlılığı yapısal hale getir)

| ID | Görev | Dosyalar | Kabul kriteri | Bağımlılık | Boyut | Ajan? | Nerede |
|---|---|---|---|---|---|---|---|
| **D1g** | **D4:** bot performans karnesi — 20+ işlemde net zararda ve isabeti düşük botları günlük raporda **"yedek adayı"** diye işaretle (otomatik eleme YOK) | `backend/src/services/realResults/raceReport.js`, `botDailyReport/index.js` | Rapor sonunda "Yedek adayları: Bot X (24 işlem, %29 isabet, −312 $)" bölümü | A6, C1 | M | ✅ | BE |
| **D2g** | Rejim farkındalığı: gün içi realize zarar belirli eşiği aşınca yeni girişlerde **risk yarıya iner** (fren değil, kısıcı). %4,5 mutlak fren aynen kalır | `mt5-bridge/borsakrali_account_brain.py`, `account_brain.py` | Test: günlük −%1,5'te yeni işlem riski 250 → 125 $ olur | B1 | M | ✅ | VPS |
| **D3g** | Enstrüman karnesi: sürekli zarar ettiren sembol+yön çiftini raporla (kesme yok, görünürlük) | `backend/src/services/realResults/raceReport.js` | Günlük raporda "En çok zarar ettiren: XAUUSD long (−820 $, 9 işlem)" | A6 | S | ✅ | BE |
| **D4g** | Beyin kararlarının **canlı gerekçe akışı**: neden açmadı/kapattı bilgisi site panelinde son 200 karar olarak görünsün | `backend/src/routes/bridge.routes.js`, `frontend/src/pages/Bot.jsx` | Panelde "Son kararlar" listesi, sebep etiketleriyle | C1 | M | ✅ | BE |

---

## 3. Uygulama sırası (kesintide buradan devam)

```
A1 → A2 → A3 → A4 → A5 → A6 → A7      (defter sağlığı; A6 sonrası rakamlar güvenilir)
B1 → B2 → B3 → B4 → B5                (risk; B4 bağımsız, erken alınabilir)
C1 → C2 → C3 → C4 → C5                (görünürlük)
D1g → D2g → D3g → D4g                 (akıllandırma)
```

**Paralelleştirme:** A ve B fazları birbirinden bağımsız — iki ajan aynı anda çalışabilir.
C fazı A1'e, D fazı A6'ya bağlı.

**VPS'e ZIP gereken görevler:** A2, A3, A4, A5, A6(kısmen), B1, B2, B3, B4, B5, C4(kısmen), D2g.
→ Bunlar bittikten sonra **tek ZIP** üretilip bir kez uygulanır (parça parça ZIP verilmez).

---

## 4. Durum takibi

| Görev | Durum | Not |
|---|---|---|
| Teşhis workflow'u | ✅ bitti | 52 bulgu → `TESHIS-BULGULARI-2026-07-31.md` |
| **A1** defter≠bildirim | ✅ bitti | `f656a2f` · 200+notifyPending, arka plan drenajı, kalıcılık hatası hâlâ 503 |
| **A2** kapanış kuyrukta beklemez | ✅ bitti | `ca1033b` |
| **A2b** cursor kalıcı satır kaybı | ✅ bitti | `ca1033b` |
| **A4/A5** köprü raporlaması | ⛔ gereksiz | Beyin zaten tüm magic'leri raporluyor; eklemek çift kayıt riski |
| **A6/A7** mutabakat | ✅ bitti | `b3fe98d` · defter vs broker farkı raporda görünür |
| **B3** toplam açık risk %3 | ✅ bitti | `0b09c97` |
| **RAPOR** dedicatedBridgeMagic | ✅ bitti | `f656a2f` · Bot 1/Bot 5 artık görünür + yetim magic bölümü |
| **B1** işlem başı 250 $ tavan | ✅ bitti | `40b901d` · dolar riski enstrümanlar arası eşitlendi |
| **B2** enstrüman-normalize lot | ✅ özü bitti | B1 ile geldi; sınıf-bazlı ikinci tavan opsiyonel kaldı |
| **B4** kâğıt yarışma kapatamaz | ✅ bitti | `4083759` · `trade_guard.paper_close_allowed` |
| A1..A7 | ⬜ başlamadı | |
| B1..B5 | ⬜ başlamadı | |
| C1..C5 | ⬜ başlamadı | |
| D1g..D4g | ⬜ başlamadı | |

Durum işaretleri: ⬜ başlamadı · 🔄 sürüyor · ✅ bitti + test yeşil · ⚠️ engellendi

---

## 5. Başka ajana devir brief'i (kopyala-yapıştır)

> Repo: `C:\Users\hsnkr\Desktop\site\borsasanati-clone`. Bu dosyayı (`PLAN-BOT-YARISI-DUZELTME.md`)
> önce oku. Sana verilen görev ID'sinin satırındaki dosyalara **yalnız o görev kadar** dokun.
> Python tarafı offline test: `cd mt5-bridge && python _offline_test_runner.py <test_dosyasi>`
> (9 paket de yeşil kalmalı). Backend: `cd backend && npx jest tests/verification --runInBand --forceExit`
> (73 dosya / 893 test yeşil kalmalı). Regresyon testini **önce hatalı kodda başarısız olduğunu
> kanıtlayarak** yaz (NR7 dersi). Commit mesajı Türkçe ve açıklayıcı; `git add -A` kullanma,
> dosyaları açıkça stage et. Bitince bu dosyadaki durum tablosunu güncelle.

---

## 6. Bilinen tuzaklar (yeni gelen ajan mutlaka okusun)

1. **Küme-kompozisyonu tuzağı:** üyeleri değişen bir küme üzerinde toplam (`sum`) metriği kullanma —
   bir üye çıkınca metrik zıplar ve yanlış karar verdirir. Pozisyon-başına ölç. (2026-07-31, sürü dedektörü)
2. **Bildirim ≠ muhasebe:** Telegram'ın başarısı defterin ön koşulu olamaz. (bu planın A1 maddesi)
3. **`brain_min_rr` ≠ `min_rr`:** beyin politikası yalnız `brain_min_rr`'den okunur; köprü `min_rr`'i
   ayrı bir bayatlama süzgecidir.
4. **SLTP yazarken karşı alanı taze oku:** SL yazarken TP'yi, TP yazarken SL'i taze pozisyondan al;
   yoksa diğer katmanın az önceki sıkılaştırmasını geri alırsın.
5. **Soğutma yazımı yalnız başarılı kapanıştan sonra**, ve mevcut daha uzun soğutma kısaltılmaz.
6. **Yarış modu ≠ korumasız:** `race_mode` giriş *sayısı* tavanlarını kaldırır; dolar-risk
   korumaları (B fazı) yarışta da geçerlidir.
