# BORSA KRALI — TEK BİRLEŞİK ÇALIŞMA PLANI
**Tarih:** 2026-07-31 · **Kaynak:** 5 bağımsız denetim raporu · **Repo:** `C:\Users\hsnkr\Desktop\site\borsasanati-clone`

---

## 0. TEŞHİSİN TEK CÜMLESİ

Beş denetçi de aynı iki yapıya işaret ediyor:

1. **DEFTER KÖR** — Kapanan gerçek işlemleri backend'e yazan **tek** kod yolu var (`borsakrali_account_brain.py:_report_state`) ve o yolun önünde **Telegram teslimatına bağlı bir kapı** duruyor. Tek bir teslim edilemeyen mesaj → 503 → outbox boşalmaz → `if pending_opens: return False` → **o gün kapanan hiçbir işlem deftere girmez**. Buna iki bağımsız sızıntı ekleniyor: cursor'un atlanan satırların üzerinden ileri sarması (kalıcı kayıp) ve günlük raporun `dedicatedBridgeMagic`'i (Bot 1 + Bot 5) hiç sorgulamaması. Sonuç: gerçek **-3.234,88 $** ↔ rapor **-74,51 $**.
2. **RİSK TAVANSIZ** — `race_mode=true` dolar cinsinden portföy/sembol/bot havuz tavanlarının **hepsini** kaldırıyor; işlem başı risk yüzde × equity olduğu için hesap 200k'ya çıkınca sessizce **493,74 $**'a fırladı; kodda **mutlak dolar tavanı hiç yok** (grep 0 sonuç). 1.00 lot bir kaçak değil, beynin bilerek ürettiği doygunluk değeri.

Bu iki yapı bağımsız: birincisi *ölçüm* arızası, ikincisi *gerçek para* arızası. Plan önce ölçümü açar (yoksa hiçbir düzeltmenin işe yarayıp yaramadığını göremeyiz), sonra riski kısar.

### Kod doğrulaması (bu plan yazılırken teyit edildi)
- `borsakrali_account_brain.py:1291-1294` `pending_opens` kapısı **mevcut** (ayrıca `1405-1415`'te giriş bloklama ikizi var).
- `mt5_brain_adapter.py:513` `status_code != 200` **mevcut**; `broker_event_outbox_count` `447`.
- `bridge.routes.js:87` `realResults.ingest` **503'ten önce** (`90`) çalışıyor → 503'ün kendisi veri kaybettirmiyor, teyit.
- `mt5TradeNotifier/index.js` `notificationsDisabled()` dallarında `retryableFailures++` **4 yerde** (`604, 629, 754, 849`) — kill-switch tuzağı teyit.
- `dedicatedBridgeMagic` grep: `catalog.js`, `competitionManager.js`, `realResults/store.js`, `bot.routes.js`, `forex.routes.js`, `mt5Scanner.routes.js`'te var — **`botDailyReport/` içinde HİÇ YOK**. Teyit.
- `vps-paket-insa.ps1:60` `$all.race_mode = $true` — teyit.
- Mevcut test altyapısı: `backend/tests/verification/*.golden.test.js` (jest) ve `mt5-bridge/test_*.py`. **`botDailyReport` için test dosyası YOK** → F20'de yeni dosya açılacak.

---

## 1. FAZ 0 — BUGÜN, KOD YAZMADAN (kullanıcı onayı gerekir)

Bu üç adım kod değişikliği değil; düzeltmeler inene kadar zararı durdurur.

| ID | İş | Nasıl | Etki |
|---|---|---|---|
| **F0.1** | Canlı otomatik girişleri geçici durdur (veya `race_mode=false`) | VPS'te `STOP` dosyası / `config_all.json` `race_mode:false` | Yığılmayı anında keser |
| **F0.2** | `MT5_TRADE_NOTIFY_DISABLED` env'inin **Render'da 1 olup olmadığını** kontrol et | Render → Environment | 1 ise defter zaten yapısal olarak KAPALI (F1'e kadar) |
| **F0.3** | Bugünkü/dünkü gerçek işlemleri MT5 terminalinden **elle CSV export** al | MT5 → Geçmiş → Rapor | Backfill (F17) için referans; kayıp veri kurtarılabilir tek kaynak |

> ⚠️ F0.1 bir **karar**; aşağıdaki "Kullanıcıya Sorulacaklar" Q1'e bakın.

---

## 2. FAZ A — VERİ BÜTÜNLÜĞÜ (defter tutulsun)

> **Hedef invaryant:** Broker'da kapanan her pozisyon, Telegram'ın durumundan **bağımsız** olarak `realResults`'a yazılır.

---

### F1 · `MT5_TRADE_NOTIFY_DISABLED` kill-switch tuzağını kaldır
- **Boyut:** S · **Dağıtım:** yalnız backend deploy · **Devredilebilir:** EVET
- **Neden:** Bildirim kapatma anahtarı `retryableFailures++` yaptığı için **daima 503** üretiyor → outbox asla boşalmıyor → defter kalıcı kapalı. (Bulgu: "MT5_TRADE_NOTIFY_DISABLED bir bildirim anahtarı değil, tam bir DEFTER kill-switch'i")
- **Dosya:** `backend/src/services/mt5TradeNotifier/index.js` (yalnız bu)
- **Yapılacak:** `604, 629, 754, 849` satırlarındaki `if (notificationsDisabled()) retryableFailures++;` satırlarını kaldır; ilgili `record.notification`'ı `'failed'` yerine `'suppressed'` yap; `'suppressed'` audit'teki `['pending','failed']` bekleyen listesine **girmesin**.
- **Kabul kriteri:** `backend/tests/verification/mt5TradeNotifier.golden.test.js`'e yeni vaka: `MT5_TRADE_NOTIFY_DISABLED=1` iken `ingestState({closed:[...]})` çağrısı `retryableFailures === 0` döndürmeli ve kayıt `notification === 'suppressed'` olmalı. **Bu test, düzeltme öncesi kodda BAŞARISIZ olduğu kanıtlanmadan yazılmış sayılmaz** (NR7 dersi).
- **Bağımlılık:** yok
- **Brief:** `backend/src/services/mt5TradeNotifier/index.js` dosyasında `notificationsDisabled()` kontrolünün geçtiği dört yerde (`~604, 629, 754, 849`) `retryableFailures++` yapılıyor; bu, kalıcı bir konfigürasyon durumunu "geçici teslimat hatası" sayaçlarına yazıyor ve `bridge.routes.js`'in 503 dönmesine yol açarak tüm muhasebe zincirini kilitliyor. Bu artışları kaldır, kaydı `record.notification = 'suppressed'` olarak işaretle ve `suppressed` durumunun audit'teki bekleyen-bildirim listesine (`['pending','failed']` filtresi, ~911) dahil olmamasını sağla. Doğrulamayı `backend/tests/verification/mt5TradeNotifier.golden.test.js` içine, önce mevcut kodda kırmızı verdiğini gösterdiğin bir vaka ekleyerek yap. Başka dosyaya dokunma, commit'i tek başına at, **push etme**.

---

### F2 · `/api/bridge/state` 503'ünü daralt: Telegram gecikmesi artık hata değil
- **Boyut:** M · **Dağıtım:** yalnız backend deploy · **Devredilebilir:** EVET
- **Neden:** `retryableFailures > 0` iken 503 dönülüyor; ama `realResults.ingest()` **zaten 87. satırda, 503'ten önce** çalışıp veriyi kalıcılaştırıyor. Yani 503 "veri kaybettim" değil, "Telegram bekliyor" demek — köprü bunu felaket sanıp cursor'u dondurup aynı yükü 2 sn'de bir yeniden gönderiyor (livelock).
- **Dosya:** `backend/src/routes/bridge.routes.js` (yalnız bu)
- **Yapılacak:** `90` ve `119` satırlarındaki koşuldan `lifecycle.retryableFailures > 0` şartını çıkar; 503 **yalnız** `lifecycle.invalid > 0` (veri bozuk) durumunda kalsın. Bekleyen bildirim sayısı `200` gövdesinde `notificationPending: n` alanı olarak taşınsın. `results` alanı (ingested/invalid) hem 200 hem 503 gövdesinde bulunsun.
- **Neden güvenli:** `mt5TradeNotifier` bekleyen açılış/kapanışları kendi kalıcı kuyruğunda (`persistDurable` + `releaseOrderedLifecycle`) tutuyor ve sonraki çağrılarda yeniden deniyor; sıra garantisi backend içinde korunuyor, HTTP durum koduna gerek yok.
- **Kabul kriteri:** `backend/tests/verification/bridgeLifecycle.golden.test.js` — Telegram sahtesi (`telegramService`) hata döndürdüğünde `POST /api/bridge/state` **200** dönmeli, gövdede `results.ingested > 0` ve `notificationPending > 0` olmalı; `invalid` satırla çağrıldığında hâlâ 503 dönmeli.
- **Bağımlılık:** yok (F1 ile paralel gidebilir)
- **Brief:** `backend/src/routes/bridge.routes.js`'te `/state` (~90) ve `/results` (~119) uçları `lifecycle.retryableFailures > 0` olduğunda HTTP 503 `trade-notification-pending` dönüyor. Ama `realResults.ingest()` bu kontrolden ÖNCE (~87/114) çalışıp kapanış satırlarını zaten kalıcı olarak yazıyor; 503 sadece "Telegram mesajı henüz gitmedi" anlamına geliyor ve köprü tarafında sonsuz yeniden gönderim + cursor donması yaratıyor. 503 koşulunu yalnız `lifecycle.invalid > 0` ile sınırla, `retryableFailures`'ı 200 gövdesinde `notificationPending` alanı olarak bildir, `results` özetini iki durumda da gövdeye koy. Bildirim yeniden denemesi backend'in kendi kalıcı kuyruğunda zaten var, kaybolmaz. Doğrulamayı `backend/tests/verification/bridgeLifecycle.golden.test.js` içinde yap. Tek dosya, tek commit, **push etme**.

---

### F3 · `lifecycleReadiness.failRestore` kalıcı kilidine geri dönüş ekle
- **Boyut:** S · **Dağıtım:** yalnız backend deploy · **Devredilebilir:** EVET
- **Neden:** Supabase restore bir kez başarısız olursa `ready` bir daha **asla** true olmuyor; `bridge.routes.js:82/111/141/156` bu kontrolü `ingest`'ten **önce** yaptığı için o process ömrü boyunca tüm broker verisini reddediyor. Alarm da yok.
- **Dosya:** `backend/src/services/lifecycleReadiness.js` (yalnız bu)
- **Yapılacak:** `failRestore()` içine sınırlı yeniden deneme (30 sn × 10) + ilk hatada tek seferlik kritik Telegram uyarısı. 10 deneme sonunda hâlâ başarısızsa "boş state ile devam et + kalıcı uyarı bayrağı" moduna geç (veri reddetmek, veri kaybetmekten daha kötü).
- **Kabul kriteri:** Yeni birim test: `restoreFailed` sonrası sahte zamanlayıcı ileri sarıldığında `isReady()` tekrar deneniyor; 10 denemeden sonra `degraded:true` ile `ready` oluyor.
- **Bağımlılık:** yok
- **Brief:** `backend/src/services/lifecycleReadiness.js`'te `failRestore(reason)` `set(false, ...)` çağırıyor ve bunu geri alan tek şey `completeRestore()`; süre aşımı veya yeniden deneme yok. `backend/src/routes/bridge.routes.js` bu bayrağı `realResults.ingest`'ten önce kontrol ettiği için tek bir Supabase kesintisi o Render process'inin ömrü boyunca broker verisini reddediyor. `failRestore` içine 30 saniyede bir, en fazla 10 kez tetiklenen bir yeniden-restore denemesi ve ilk hatada tek seferlik kritik Telegram uyarısı ekle; 10 deneme tükenirse boş state ile `ready` olup `degraded` bayrağı taşısın. Sahte zamanlayıcıyla birim test yaz. Tek dosya, **push etme**.

---

### F4 · Telegram'a hız sınırı + 429 geri-çekilmesi
- **Boyut:** M · **Dağıtım:** yalnız backend deploy · **Devredilebilir:** EVET
- **Neden:** `telegramService.js:53-64` tek `axios.post`, retry/backoff/rate-limit **yok**. Kanal limiti ~20 msg/dk; 60 işlem × 2 mesaj bunu aşıyor → 429 yağmuru → `releaseOrderedLifecycle` O(n²) yeniden deneme → 12 sn'lik köprü timeout'u → livelock.
- **Dosya:** `backend/src/services/telegramService.js` (yalnız bu)
- **Yapılacak:** Modül içi tek kuyruk: chat başına ≤1 mesaj/saniye; 429 yanıtında `parameters.retry_after` kadar bekle; 5xx'te üstel geri çekilme (max 3 deneme). Dış API (`sendMessage(...)`) imzası **değişmesin**.
- **Kabul kriteri:** Yeni birim test: 429 + `retry_after:2` döndüren sahte axios ile 3 mesaj gönderildiğinde toplam çağrı sırası doğru, hiçbiri kaybolmuyor, çağrılar arası ≥1 sn (sahte zaman).
- **Bağımlılık:** yok
- **Brief:** `backend/src/services/telegramService.js` mesajları tek `axios.post` ile senkron ve sınırsız gönderiyor; 429 veya 5xx durumunda hiçbir geri çekilme/kuyruk yok, bu da Telegram kanal limitini (~20 mesaj/dk) aşan yoğun günlerde teslimat hatalarına ve üst katmanda livelock'a yol açıyor. Modülün içine chat_id başına seri bir kuyruk koy: mesajlar arasında en az 1 saniye, 429 yanıtında `response.data.parameters.retry_after` kadar bekleme, 5xx'te üstel geri çekilmeli en fazla 3 deneme. Dışa açık fonksiyon imzalarını ve dönüş sözleşmesini (`{success:boolean}`) değiştirme; çağıran onlarca yer var. Sahte axios + sahte zamanlayıcıyla birim test yaz. Tek dosya, **push etme**.

---

### F5 · Beyin: kapanış raporunu açılış kuyruğuna rehin verme (ASIL KATİL)
- **Boyut:** M · **Dağıtım:** ⚠️ **VPS ZIP-1** · **Devredilebilir:** EVET (ama VPS'e SEN göndermiyorsun, sadece kod)
- **Neden:** `borsakrali_account_brain.py:1291-1294` — `pending_opens` varken `return False`, üstelik `payload` **kurulmadan** önce. Sistemde `"closed"` POST eden **tek** satır (1322) bu kapının arkasında.
- **Dosya:** `mt5-bridge/borsakrali_account_brain.py` (yalnız bu)
- **Yapılacak:** `1292-1294`'teki `return False`'ı kaldır; yerine `defer_opens = True` bayrağı koy ve payload'da `payload["open"] = []` yap, `closed_rows` **her hâlükârda** POST edilsin. Bildirim sırası korunması gereken tek şey `open` bölümü. Kapanış satırları deal ticket anahtarlı ve idempotent olduğu için erken gönderim güvenli.
- **Kabul kriteri:** `mt5-bridge/test_account_brain_daemon.py`'a vaka: outbox sayacı >0 iken `_report_state` çağrıldığında sahte HTTP istemcisine **POST yapılmalı** ve gövdede `closed` dolu, `open` boş olmalı. Düzeltme öncesi kodda bu test kırmızı vermeli.
- **Bağımlılık:** yok (ama F2 canlıda olmadan tam faydayı vermez)
- **Brief:** `mt5-bridge/borsakrali_account_brain.py` içindeki `_report_state()` fonksiyonu (satır ~1282 başlıyor) gövdesinin başında `pending_opens = mt5_brain_adapter.broker_event_outbox_count(cfg)` yapıp `if pending_opens: return False` diyor; bu erken dönüş, satır ~1317'de kurulan `payload = {... "closed": closed_rows ...}`'dan ÖNCE olduğu için o turda kapanan hiçbir işlem backend'e gitmiyor — ve bu, tüm sistemde `closed` alanını POST eden tek koddur. Değişiklik: erken dönüşü kaldır, bunun yerine bir `defer_opens` bayrağı ile payload'daki `open` listesini boşalt ve `closed_rows`'u her koşulda POST et; POST 200 değilse cursor'u yine ilerletme (mevcut davranış korunsun). Kapanış satırları deal ticket anahtarlı ve backend tarafında idempotent, bu yüzden açılış bildirimlerinden önce gitmeleri sorun değil. Doğrulamayı `mt5-bridge/test_account_brain_daemon.py` içine, önce mevcut kodda başarısız olduğunu gösterdiğin bir vakayla ekle. Tek dosya, **push etme**, VPS'e dokunma.

---

### F6 · Beyin: 503 gövdesindeki `ingested`'i oku, cursor'u boşuna dondurma
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-1** · **Devredilebilir:** EVET
- **Neden:** `borsakrali_account_brain.py:1337-1339` gövdeyi hiç ayrıştırmadan `return False` diyor; backend defteri **yazmış** olsa bile aynı 40 satır 2 sn'de bir yeniden uçuyor.
- **Dosya:** `mt5-bridge/borsakrali_account_brain.py` (yalnız bu)
- **Yapılacak:** Yanıt gövdesini ayrıştır; `status_code == 503 and body.get('error') == 'trade-notification-pending' and (results.ingested > 0 or results.invalid == 0)` ise cursor'u **ilerlet** ve `True` dön. `invalid-broker-lifecycle-row` durumunda eski davranış (return False).
- **Kabul kriteri:** Daemon testine iki vaka: (a) 503 + `results.ingested=5` → cursor ilerler; (b) 503 + `error:'invalid-broker-lifecycle-row'` → cursor ilerlemez.
- **Bağımlılık:** F5 ile aynı dosya → **F5'ten sonra** yapılmalı (çakışma önleme). F2 ile gövde şekli uyumlu olmalı.
- **Brief:** `mt5-bridge/borsakrali_account_brain.py` satır ~1337'de `if response.status_code != 200: log.error(...); return False` var; yanıt gövdesi hiç okunmuyor. Oysa backend `bridge.routes.js` 503 gövdesinde `results: {ingested, invalid}` alanını taşıyor ve `realResults.ingest()` 503 kontrolünden ÖNCE çalışıp veriyi kalıcı yazıyor. Yani "defter yazıldı, sadece Telegram bekliyor" durumu "hiçbir şey olmadı" sanılıp aynı yük sonsuz tekrarlanıyor. Gövdeyi `response.json()` ile ayrıştır; `status_code == 503` ve `error == 'trade-notification-pending'` ve `results.ingested > 0` (ya da `results.invalid == 0`) ise `notificationCursorSec` ilerlesin ve fonksiyon `True` dönsün; `invalid-broker-lifecycle-row` hatasında mevcut `return False` korunsun. JSON ayrıştırma hatasına karşı `try/except` koy. `mt5-bridge/test_account_brain_daemon.py`'a iki vaka ekle. Bu dosyada F5 görevi de var, önce onun bittiğinden emin ol. **Push etme.**

---

### F7 · Adapter: 503'te outbox olayını düşür (kuyruk şişmesin)
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-1** · **Devredilebilir:** EVET
- **Neden:** `mt5_brain_adapter.py:513` — 200 dışı her yanıtta olay kuyrukta kalıyor; backend olayı zaten kaydetmiş olsa bile. Bu kuyruk aynı zamanda `1405-1415`'te **yeni girişleri de bloke ediyor** (`fail_closed:broker_event_outbox_pending`).
- **Dosya:** `mt5-bridge/mt5_brain_adapter.py` (yalnız bu)
- **Yapılacak:** `if response.status_code != 200` → `if response.status_code not in (200, 503)`; 503 gövdesinde ilgili olay için `openNotified > 0 or skipped > 0` ise olayı kuyruktan düşür. Ayrıca dead-letter: 10 turdan sonra hâlâ gönderilemeyen olay `outbox.dead.jsonl`'a taşınsın + tek seferlik uyarı.
- **Kabul kriteri:** `mt5-bridge/test_mt5_brain_adapter.py` — 503 + `openNotified:1` yanıtında `broker_event_outbox_count()` **azalmalı**; 500 yanıtında değişmemeli; 11. başarısız turda olay dead-letter'a geçmeli.
- **Bağımlılık:** F2 (gövde alanları)
- **Brief:** `mt5-bridge/mt5_brain_adapter.py` satır ~508-530'daki `flush_broker_event_outbox()` fonksiyonu `/api/bridge/state`'e POST yapıyor ve `response.status_code != 200` olan her durumda olayı kuyrukta bırakıyor. Backend 503 dönerken olayı zaten kalıcı olarak kaydetmiş olabiliyor (yanıt gövdesinde `openNotified`/`skipped` sayaçları bunu bildiriyor), bu yüzden kuyruk hiç boşalmıyor ve aynı adaptörün `evaluate()` fonksiyonu (satır ~700) dolu kuyruk yüzünden yeni girişleri de `fail_closed:broker_event_outbox_pending` ile reddediyor. Koşulu `not in (200, 503)` yap ve 503 gövdesinde ilgili olayın kaydedildiğini gösteren sayaç varsa olayı kuyruktan düşür. Ayrıca 10 tur boyunca gönderilemeyen olayları bir dead-letter dosyasına taşıyıp tek seferlik uyarı logla — kuyruk sonsuza kadar sistemi kilitleyememeli. `mt5-bridge/test_mt5_brain_adapter.py`'a vakalar ekle. Tek dosya, **push etme**.

---

### F8 · Cursor: `live` yüzünden atlanan pozisyonları "bloke" say (kalıcı satır kaybı)
- **Boyut:** S (2 satır) · **Dağıtım:** ⚠️ **VPS ZIP-1** · **Devredilebilir:** EVET
- **Neden:** `1204-1206` — pozisyon anlık görüntüde hâlâ canlı görünüyorsa `continue`, ama `blocked_position_ids`'e eklenmiyor. Cursor `latest_close` ile ileri sarınca (`1348-1351`) o satır **bir daha asla** raporlanamıyor. Toplu kapanış anlarında (EOD 23:45, stop-out zinciri, sürü kesme) kalıcı silme.
- **Dosya:** `mt5-bridge/borsakrali_account_brain.py` (yalnız bu)
- **Yapılacak:**
  ```python
  if position_ticket in live:
      blocked_position_ids.append(position_ticket)
      continue
  ```
  İkinci adım (aynı görevde): cursor'u `max(...)` yerine `min(observed, en_erken_bloke_closedSec)` ile sınırla.
- **Kabul kriteri:** Daemon testi: A pozisyonu T1'de kapanmış ama `live` sette; B pozisyonu T2>T1'de kapanmış ve raporlanmış. İkinci turda A `live`'dan çıkınca **raporlanmalı**. Düzeltme öncesi test kırmızı vermeli.
- **Bağımlılık:** F5, F6 (aynı dosya) — sırayla
- **Brief:** `mt5-bridge/borsakrali_account_brain.py` içindeki `_closed_rows` mantığında (satır ~1204) `if position_ticket in live: continue` var; bu atlama `blocked_position_ids` listesine yazılmadığı için `cursor_blocked` False kalıyor ve satır ~1348-1351'deki `state["notificationCursorSec"] = max(stored_cursor, observed, latest_close)` cursor'u atlanan pozisyonun kapanış zamanının ötesine taşıyor. Sonraki turda satır ~1197'deki `if deal.time < boundary: continue` süzgeci o pozisyonu kalıcı olarak eliyor — işlem hiçbir zaman deftere girmiyor. `live` yüzünden atlanan pozisyonu `blocked_position_ids`'e ekle ve ek olarak cursor ilerletmesini bloke edilen en erken kapanış zamanıyla sınırla. `mt5-bridge/test_account_brain_daemon.py`'a iki turlu senaryo testi yaz (ilk turda live, ikinci turda değil). Aynı dosyada başka görevler de var, çakışmamak için sırayı kontrol et. **Push etme.**

---

### F9 · Diğer sessiz `continue`'ları da bloke listesine bağla
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-1** · **Devredilebilir:** EVET
- **Neden:** `1213-1215` (close_deals yok), `1217-1218` (boundary yarışı), `1230-1231` (magic<=0) — üçü de cursor'u bloke etmiyor. F8 ile aynı sınıf hata.
- **Dosya:** `mt5-bridge/borsakrali_account_brain.py`
- **Yapılacak:** Niyeti ayır — "bu bot işlemi değil" (magic<=0, close_deals yok) sessiz atlanabilir; "**henüz göremiyorum**" (boundary yarışı, lifecycle None) `blocked_position_ids`'e girmeli. Her `continue`'un yanına niyet yorumu yaz.
- **Kabul kriteri:** Daemon testinde boundary yarışı senaryosu: cursor ilerlemiyor.
- **Bağımlılık:** F8

---

### F10 · `magic <= 0` ön-süzgecini pozisyon seviyesine taşı (manuel/stop-out kapanışları)
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-1** · **Devredilebilir:** EVET
- **Neden:** `1195` deal seviyesinde `magic<=0` eliyor; MT5'te manuel kapatma, stop-out ve `pozisyon_temizle.py` kaynaklı OUT deal'leri **magic=0** taşır. Giriş deal'i 5702 olsa bile pozisyon deftere hiç girmiyor. `1225-1231`'deki kurtarma kodu bu yüzden **ölü**.
- **Dosya:** `mt5-bridge/borsakrali_account_brain.py`
- **Yapılacak:** `1195`'i `if not _is_close_deal(deal): continue` yap. Pozisyon seviyesindeki kurtarma (`1225-1231`) zaten magic yoksa eliyor, hesap dışı işlemler yine dışarıda kalır.
- **Kabul kriteri:** Daemon testi: giriş deal'i magic=5702, çıkış deal'i magic=0 olan pozisyon **raporlanmalı**; her iki deal'i de magic=0 olan pozisyon raporlanmamalı.
- **Bağımlılık:** F8, F9

---

### F11 · Beyin POST timeout'u ve eşzamanlı uçuş kilidi
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-1** · **Devredilebilir:** EVET
- **Neden:** `timeout=12` (satır ~1334) + `report_interval_seconds: 2` → backend hâlâ ilk yükü işlerken ikincisi uçuyor; "Read timed out" canlı logda mevcut.
- **Dosya:** `mt5-bridge/borsakrali_account_brain.py`
- **Yapılacak:** `timeout=12` → `30`; aynı anda birden fazla `_report_state` POST'u uçmasın diye basit "uçuşta" bayrağı; bir POST tamamlanmadan yeni tur POST atlansın.
- **Kabul kriteri:** Daemon testi: POST 1 sn sürerken 2. tur çağrısı POST yapmıyor.
- **Bağımlılık:** F8, F9, F10 (aynı dosya)

---

### F12 · Backend: `ledgerOnly` muhasebe ucu (yedek defter yolu — 1/3)
- **Boyut:** S · **Dağıtım:** yalnız backend deploy · **Devredilebilir:** EVET
- **Neden:** Beyin **tek** kapanış kaynağı; beyin durursa defter boş kalıyor. Yedek yol yok.
- **Dosya:** `backend/src/routes/bridge.routes.js` (yalnız bu)
- **Yapılacak:** `POST /api/bridge/results` gövdesinde `ledgerOnly: true` desteği: `realResults.ingest()` çalışsın, `mt5TradeNotifier.ingestState()` **hiç çağrılmasın**, daima 200 + `{ingested, invalid}` dönsün.
- **Kabul kriteri:** `bridgeLifecycle.golden.test.js`: `ledgerOnly:true` ile POST → Telegram sahtesi **hiç çağrılmamalı**, `realResults`'ta satır olmalı, yanıt 200.
- **Bağımlılık:** F2 (aynı dosya) — sırayla
- **Brief:** `backend/src/routes/bridge.routes.js`'teki `POST /api/bridge/results` ucuna `ledgerOnly: true` gövde bayrağı ekle: bu bayrak varken yalnız `realResults.ingest(deals, body)` çağrılsın, `mt5TradeNotifier.ingestState()` hiç çalıştırılmasın ve uç bildirim durumundan bağımsız 200 + `{results:{ingested, invalid}}` dönsün. Amaç, merkezî beyin daemon'u tıkandığında köprülerin kapanan işlemleri Telegram bildirim zincirine hiç dokunmadan doğrudan deftere yazabileceği ikinci bir yol açmak; `realResults/store.js` zaten deal ticket bazlı idempotent birleştirme yapıyor (zengin alanlı kayıt sonradan gelirse korunuyor), o yüzden çift yazım riski yok. `backend/tests/verification/bridgeLifecycle.golden.test.js`'e Telegram sahtesinin hiç çağrılmadığını doğrulayan bir vaka ekle. Bu dosyada başka görev de var (503 daraltma), çakışma olmadığından emin ol. **Push etme.**

---

### F13 · Birleşik köprü: beyin açıkken de defteri besle (yedek yol — 2/3)
- **Boyut:** M · **Dağıtım:** ⚠️ **VPS ZIP-1** · **Devredilebilir:** EVET
- **Neden:** `borsakrali_mt5_all.py:744-753` ve `804-819` beyin açıkken **erken dönüyor** → tek nokta arızası.
- **Dosya:** `mt5-bridge/borsakrali_mt5_all.py` (yalnız bu)
- **Yapılacak:** `report_real_results()` içindeki erken dönüşü kaldır; beyin açıkken 5 dakikada bir `POST /api/bridge/results` **`ledgerOnly:true`** ile göndersin (Telegram'a dokunmaz, çift bildirim olmaz).
- **Kabul kriteri:** `mt5-bridge/test_bridge.py`: `central_brain_enabled=True` iken `report_real_results()` çağrısı sahte HTTP'ye `ledgerOnly:true` gövdesiyle POST yapıyor; `report_mt5_state` hâlâ erken dönüyor (o Telegram yolu, karışmamalı).
- **Bağımlılık:** F12

---

### F14 · Adanmış köprü — Forex (magic 550055) kendi kapanışlarını bildirsin (3/3a)
- **Boyut:** M · **Dağıtım:** ⚠️ **VPS ZIP-1** · **Devredilebilir:** EVET
- **Neden:** `borsakrali_mt5.py` sadece 3 uç çağırıyor (`/api/forex/positions`, `/api/forex/closed`, `/api/forex/broker-prices`); `/api/forex/closed` **muhasebe ucu değil**, tracker senkron ucu. Bot 1 sonsuza dek "işlem yok".
- **Dosya:** `mt5-bridge/borsakrali_mt5.py` (yalnız bu)
- **Yapılacak:** Kendi magic'i (550055) için `DEAL_ENTRY_OUT` kayıtlarını periyodik olarak `POST /api/bridge/results` `ledgerOnly:true` ile gönder; kendi cursor'unu ayrı state anahtarında tut.
- **Kabul kriteri:** `mt5-bridge/test_bridge_ownership.py` veya yeni vaka: sahte MT5 history ile 550055 deal'leri POST ediliyor, başka magic'ler filtreleniyor.
- **Bağımlılık:** F12

---

### F15 · Adanmış köprü — Tarayıcı (magic 550066) kendi kapanışlarını bildirsin (3/3b)
- **Boyut:** M · **Dağıtım:** ⚠️ **VPS ZIP-1** · **Devredilebilir:** EVET
- **Dosya:** `mt5-bridge/borsakrali_mt5_scanner.py`
- **Kabul kriteri:** `mt5-bridge/test_scanner_bridge.py` — 550066 deal'leri `ledgerOnly` POST ediliyor.
- **Bağımlılık:** F12 (F14 ile birebir aynı desen; F14 bitince kopyala)

---

### F16 · Gün sonu mutabakat invaryantı (defterin doğruluk kanıtı)
- **Boyut:** M · **Dağıtım:** yalnız backend deploy · **Devredilebilir:** EVET
- **Neden:** Bugün defterin eksik olduğunu **kimse fark etmedi**. Bir daha sessizce olmasın.
- **Dosya:** `backend/src/services/realResults/store.js` + `backend/src/services/cronJobs.js`
- **Yapılacak:** Günde bir kez `realResults` günlük toplamı ile köprünün bildirdiği MT5 hesap özeti (kapanan kâr + swap + komisyon) karşılaştırılsın; **sapma > %5 → kritik Telegram alarmı** ("⚠️ Defter mutabakatsız: rapor X$, hesap Y$").
- **Kabul kriteri:** `realResults.golden.test.js` — sahte özet ile %10 sapmada alarm fonksiyonu çağrılıyor, %2'de çağrılmıyor.
- **Bağımlılık:** F5..F15 (mantıken en son, ama kod olarak bağımsız)

---

### F17 · Geriye dönük kurtarma (backfill) betiği — kayıp günleri deftere geri yaz
- **Boyut:** M · **Dağıtım:** VPS'te tek seferlik çalıştırma · **Devredilebilir:** EVET
- **Neden:** Cursor ileri sardığı için 07-29 → 07-31 arasındaki işlemlerin çoğu **kalıcı olarak** deftere girmedi. Kod düzeltmeleri geçmişi geri getirmez.
- **Dosya:** `mt5-bridge/` altında **yeni** `backfill_deals.py` (tek dosya)
- **Yapılacak:** Verilen tarih aralığı için MT5 `history_deals_get`'ten tüm OUT deal'lerini çek, `ledgerOnly:true` ile POST et, cursor'a **dokunma**. `--dry-run` varsayılan.
- **Kabul kriteri:** `--dry-run` ile 07-29..07-31 aralığında beklenen ~55 işlem listeleniyor; gerçek çalıştırma sonrası `botDailyReport` toplamı MT5 hesap özetine ±%5 içinde.
- **Bağımlılık:** F12 (ledgerOnly ucu canlıda olmalı)

---

## 3. FAZ B — RİSK (para kaybını kes)

> Bu fazdaki her şey `mt5-bridge/` altında → **VPS ZIP-2** gerektirir. Kod, canlıya ancak ZIP ile çıkar.

---

### F18 · İşlem başı MUTLAK dolar risk tavanı (`max_initial_risk_usd`)
- **Boyut:** M · **Dağıtım:** ⚠️ **VPS ZIP-2** · **Devredilebilir:** EVET
- **Neden:** Kodda `min_initial_risk_usd=15` **tabanı** var, **tavan yok** (grep 0 sonuç). Geçerli risk aralığı **[15 $, 493,74 $] = 32,9 kat**. Tek işlem XAUUSD -414,90 $ ve BTCUSD -379,89 $ tam bütçe sınırında.
- **Dosya:** `mt5-bridge/account_brain.py` (yalnız bu)
- **Yapılacak:** `BrainConfig`'e `max_initial_risk_usd: float = 100.0`; `__post_init__`'e `if max <= min: raise`; `build_config`'te **yalnız aşağı çekilebilir** (repo'nun tek-yönlü güvenlik deseni); `evaluate_pretrade`'de `_safe_lot`'tan **hemen önce** `risk_budget = min(risk_budget, config.max_initial_risk_usd)`; kırpma sonrası risk `min_initial_risk_usd`in altına düşerse **REDDET**.
- **Kabul kriteri:** `mt5-bridge/test_account_brain.py`: equity=197.497, XAUUSD 4,15 $ stop → `risk_usd <= 100`; aynı senaryo düzeltme öncesi ~490 $ veriyor (kırmızı kanıtı). Ayrıca `max<min` config'i `ValueError` atmalı.
- **Bağımlılık:** yok
- **Brief:** `mt5-bridge/account_brain.py`'de `BrainConfig` yalnız alt sınır (`min_initial_risk_usd = 15.0`, `min_expected_profit_usd = 15.0`) tanımlıyor; işlem başı riskin üst sınırı hiç yok, fiilen `equity * trade_risk_pct` (197k hesapta 493,74 $) oluyor ve hesap büyüdükçe sessizce büyüyor. Simetrik bir `max_initial_risk_usd` alanı ekle (varsayılan 100), `__post_init__`'te `max <= min` durumunda `ValueError` at, ve `evaluate_pretrade` içinde `_safe_lot` çağrılmadan hemen önce `risk_budget = min(risk_budget, config.max_initial_risk_usd)` uygula; kırpmadan sonra hesaplanan gerçek risk `min_initial_risk_usd`in altına düşerse işlemi mevcut `_reject` deseniyle reddet (sessizce küçültme). Config'ten gelen değer bu tavanı yalnızca DÜŞÜREBİLSİN, yükseltemesin — repodaki diğer güvenlik parametreleri bu tek yönlü deseni kullanıyor, aynısını uygula. `mt5-bridge/test_account_brain.py`'a equity=197497 ve dar stoplu XAUUSD/EURUSD senaryolarıyla test ekle; testin düzeltme öncesi ~490 $ risk gösterip kırmızı verdiğini önce kanıtla. Tek dosya, **push etme**.

---

### F19 · `race_mode` havuz tavanlarını geri getir (portföy/hesap/sert tavan)
- **Boyut:** M · **Dağıtım:** ⚠️ **VPS ZIP-2** · **Devredilebilir:** EVET
- **Neden:** `evaluate_pretrade:469-478` — race modda `limits_usd = {"trade": ...}` tek elemanlı; `min()` anlamsız hale geliyor, **mevcut açık riskin sıfır etkisi var**. 20 pozisyon × ~450 $ = ~9.000 $ (%4,6) açık risk hiçbir katmandan itiraz almıyor. Teminat 31.201 $ (%15,8) bunu doğruluyor.
- **Dosya:** `mt5-bridge/account_brain.py` (yalnız bu)
- **Yapılacak:** Race modda **yalnız** `symbol_side` ve `bot` (rekabeti kısıtlayan sayaçlar) düşsün; `portfolio` / `account` / `hard_account` **kalsın**. Ayrıca `507`'deki `if not config.race_mode:` projeksiyon kontrolünden `account_open_risk_cap` muaf tutulmasın.
- **Kabul kriteri:** `test_account_brain.py`: race modda 8.000 $ açık risk varken yeni giriş `hard_account` limiti nedeniyle reddediliyor; 500 $ açık riskte kabul ediliyor. Rekabet (aynı sembolde çoklu bot) hâlâ serbest.
- **Bağımlılık:** F18 (aynı dosya) — sırayla

---

### F20 · Beyin daemon'unda da race-modda hard risk kontrolü çalışsın
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-2** · **Devredilebilir:** EVET
- **Neden:** `borsakrali_account_brain.py:745` `if cfg.get("race_mode") is not True:` → `openRiskPct` / `maxSymbolSideRiskPct` / `maxBotRiskPct` flatten kontrolleri atlanıyor; daemon yığılmış riski **görmüyor** bile.
- **Dosya:** `mt5-bridge/borsakrali_account_brain.py`
- **Kabul kriteri:** Daemon testi: race modda `openRiskPct` sert eşiği aşıldığında flatten/uyarı tetikleniyor.
- **Bağımlılık:** F19 (politika uyumu), F11 (aynı dosya sırası)

---

### F21 · Günlük zarar freni: yüzde + mutlak dolar ikizi
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-2** · **Devredilebilir:** EVET
- **Neden:** `daily_entry_brake_pct = 1.5` × gün-başı 200.732 = **3.010,98 $**. Gerçekleşen zarar 1,6115% — yani sistem **kaçmadı**, tasarım gereği bu kadarına izin veriyor. Eski 0,15 lot rejiminde bu eşiğe 100+ kayıp gerekirdi; şimdi 8-12 kayıp yetiyor.
- **Dosya:** `mt5-bridge/account_brain.py` + `mt5-bridge/mt5_brain_adapter.py`
- **Yapılacak:** Varsayılanı 1.5 → **0.5** (≈1.004 $); `build_config`'teki `_bounded(..., 1.5, 0.01, 1.5)` üst sınırını **0.75**'e indir (config yanlışlıkla geri açamasın); ayrıca `max_daily_loss_usd` (varsayılan 1.000 $) mutlak ikizi ekle — yüzde tabanlı fren hesap büyüdükçe sessizce gevşiyor.
- **Kabul kriteri:** `test_account_brain.py`: gün-başı 200.732, zarar 1.100 $ → `daily_entry_brake_block_new` reddi. `test_trade_guard_daily.py` regresyonu geçiyor.
- **Bağımlılık:** F18, F19 (aynı dosya)
- ⚠️ **Bu bir POLİTİKA kararı** → Kullanıcıya Sorulacaklar Q3.

---

### F22 · Konsensüs kısayolunu kaldır (agreeCount>=3 → tavan riski)
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-2** · **Devredilebilir:** EVET
- **Neden:** `mt5_brain_adapter.py:646-657` — `if confirm_count >= 3: dynamic_risk = 0.25` (tavan). Bot 37 **tanımı gereği** hep ≥3 onayla gelir → her konsensüs işlemi otomatik maksimum bütçeyle açılıyor. Konsensüs = korelasyonun ta kendisi; hem boyutu büyütüp hem korelasyon tavanını kaldırmak riski **çift** sayıyor. Bot 37 günlük raporda en aktif ve en zararlı bot (13 işlem / 9 SL) — tutarlı.
- **Dosya:** `mt5-bridge/mt5_brain_adapter.py`
- **Yapılacak:** `if confirm_count >= 3: dynamic_risk = 0.25` satırını kaldır; normal `0.10 + 0.15 * strength` eğrisi kalsın (güven zaten `strength`'te temsil ediliyor).
- **Kabul kriteri:** `test_mt5_brain_adapter.py`: `strength=0.60, confirmations=5` → `dynamic_risk ≈ 0.19`, 0.25 değil.
- **Bağımlılık:** F21 (aynı dosya)

---

### F23 · `trade_guard` kapısını `mt5_brain_adapter.enabled()` ile hizala
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-2** · **Devredilebilir:** EVET
- **Neden:** `trade_guard.lot_cap_for` `cfg.get("central_brain_enabled") is True` diyor; `mt5_brain_adapter.enabled()` ise `dry_run is not True` → canlıda **daima True**. Aynı config için iki modül "beyin açık"/"beyin kapalı" diyor. Bugün zararsız (clamp hiç çağrılmıyor) ama saatli bomba.
- **Dosya:** `mt5-bridge/trade_guard.py`
- **Kabul kriteri:** `test_ban_lot.py` / yeni vaka: `dry_run=false` + `central_brain_enabled` **yok** → `lot_cap_for` beyin tavanını (1.0) döndürüyor, 0.15'i değil.
- **Bağımlılık:** yok

---

### F24 · Beyin lotunu savunma amaçlı `clamp_lot`'tan geçir (birleşik köprü)
- **Boyut:** M · **Dağıtım:** ⚠️ **VPS ZIP-2** · **Devredilebilir:** EVET
- **Neden:** `borsakrali_mt5_all.py:422-454` — beyin açıkken `lot = brain_plan.lot`, `clamp_lot` **hiç çağrılmıyor**. `LOT_LEGACY_HARD_MAX=0.15` ölü kod; ikinci savunma katmanı yok.
- **Dosya:** `mt5-bridge/borsakrali_mt5_all.py`
- **Yapılacak:** `lot = trade_guard.clamp_lot(brain_plan.lot, info, s, cfg)`; sonuç `brain_plan.lot`'tan **küçükse işlemi REDDET** (sessizce küçültme — beynin risk/ödül hesabı bozulur, R hedefleri yalan olur).
- **Kabul kriteri:** `test_ban_lot.py`: beyin 1.00 lot planlarken guard 0.15 dediğinde emir **açılmıyor** ve sebep `lot_guard_conflict` loglanıyor.
- **Bağımlılık:** F23

---

### F25 · Aynı clamp'i iki adanmış köprüye uygula
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-2** · **Devredilebilir:** EVET
- **Dosya:** `mt5-bridge/borsakrali_mt5.py`, `mt5-bridge/borsakrali_mt5_scanner.py`
- **Kabul kriteri:** `test_bridge_ownership.py` + `test_scanner_bridge.py` regresyonu
- **Bağımlılık:** F24 (birebir aynı desen)

---

### F26 · `account_tier_max_lot` ölü kodunu ya bağla ya sil
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-2** · **Devredilebilir:** EVET
- **Neden:** `select_account_tier` 200.000 döndürüyor ama **lota sıfır etkisi**; `account_tier_max_lot` adı "tier'e göre" diyor ama tier'den türetilmiyor, config'ten sabit 1.0. Okuyan "tier lot tavanını yönetiyor" sanıyor — **yanlış güven**.
- **Dosya:** `mt5-bridge/mt5_brain_adapter.py` + `mt5-bridge/account_brain.py`
- **Yapılacak (öneri):** F18'deki dolar tavanı asıl koruma olduğu için tier tablosunu bakım yükü yapma → `select_account_tier`/`ACCOUNT_TIERS`'ı yalnız rapor etiketi olarak bırak, `account_tier_max_lot`'u **`absolute_lot_cap`** olarak yeniden adlandır ve yorumla açıkla.
- **Kabul kriteri:** grep: `account_tier_max_lot` artık yok; mevcut testler yeşil.
- **Bağımlılık:** F18

---

### F27 · Sembol sınıfı risk çarpanı (FX 1.0× / endeks 0.5× / metal 0.4× / kripto 0.3×)
- **Boyut:** M · **Dağıtım:** ⚠️ **VPS ZIP-2** · **Devredilebilir:** EVET
- **Neden:** BTCUSD 0,44 lot = -379,89 $ (planlı riskin %86'sı) — kripto 7/24 ve gap riski taşıyor ama FX ile aynı bütçeyi alıyor.
- **Dosya:** `mt5-bridge/account_brain.py`
- **Kabul kriteri:** `test_account_brain.py`: aynı stop mesafesinde BTCUSD riski EURUSD'nin 0,3 katı.
- **Bağımlılık:** F18

---

### F28 · XAUUSD çift-motor çakışması: tek sahip / ortak tavan
- **Boyut:** M · **Dağıtım:** ⚠️ **VPS ZIP-2** + config · **Devredilebilir:** HAYIR (kullanıcı kararı gerekir)
- **Neden:** `altin-botu` XAUUSD'de **0,10 lot**'u asla aşamıyor (`core/risk.py:126-128`, `core/config.py:177`); köprü/beyin yolu aynı sembolde **1.00 lot** açtı (-414,90 $). Aynı hesapta, aynı sembolde, birbirinden habersiz iki motor.
- **Dosya:** `mt5-bridge/vps-paket/altin-botu/core/risk.py` **veya** köprü tarafı sembol yasağı
- ⚠️ Kullanıcıya Sorulacaklar Q5.

---

### F29 · `mt5-bridge/config.json`'daki beyin-öncesi yanıltıcı anahtarları temizle
- **Boyut:** S · **Dağıtım:** ⚠️ ZIP değil, VPS config düzenlemesi · **Devredilebilir:** EVET (kod), uygulama kullanıcıda
- **Neden:** Canlı forex config'i `max_lot 1.1, lot_max 1.1, risk_pct_max 1.0, min_rr 0.7, max_portfolio_risk_pct 6.0` içeriyor — hiçbiri artık geçerli değil, okuyanı yanıltıyor. Ayrıca `allowed_account` hâlâ **eski hesap 1513908484** (MEMORY notu).
- **Dosya:** `mt5-bridge/config.json` (+ örnek dosyalar)
- ⚠️ `allowed_account`'ı **1514083666**'ya güncelle — bu ayrı ve acil bir tutarsızlık.

---

## 4. FAZ C — GÖRÜNÜRLÜK (raporun yalan söylememesi)

> Bu fazın tamamı `backend/` → **yalnız backend deploy**. VPS gerekmez (F34 hariç).

---

### F30 · Günlük rapor `dedicatedBridgeMagic`'i sorgulasın (Bot 1 + Bot 5)
- **Boyut:** S · **Dağıtım:** backend deploy · **Devredilebilir:** EVET
- **Neden:** `botDailyReport/index.js:53-63` yalnız `entry.magic` + `magicByStrategy` okuyor; `dedicatedBridgeMagic` **hiç geçmiyor** (grep ile teyit edildi). `realResults/store.js:37` bu magic'leri doğru eşliyor — yani deal'ler depoda doğru botla duruyor, **rapor onları bulamıyor**. Ekrandaki "çoğu tam 1.00 lot" yığını tam olarak bu iki köprünün işlemleri.
- **Dosya:** `backend/src/services/botDailyReport/index.js`
- **Yapılacak:**
  ```js
  const magics = [...new Set([
    Number(entry.magic),
    ...(entry.dedicatedBridgeMagic ? [Number(entry.dedicatedBridgeMagic)] : []),
    ...Object.values(entry.magicByStrategy || {}).map(Number),
  ].filter((m) => Number.isFinite(m) && m > 0))];
  ```
- **Kabul kriteri:** **Yeni dosya** `backend/tests/verification/botDailyReport.golden.test.js` — magic 550055'te 5 deal varken rapor "Bot 1 · Forex Sinyalleri" satırında 5 işlem göstermeli (düzeltme öncesi "işlem yok" gösterdiğini önce kanıtla).
- **Bağımlılık:** yok
- **Brief:** `backend/src/services/botDailyReport/index.js` içindeki `realFor(entry)` fonksiyonu (satır ~53-63) bir botun magic listesini `entry.magicByStrategy` veya `entry.magic`'ten kuruyor ve `entry.dedicatedBridgeMagic` alanını hiç okumuyor. `backend/src/services/botCompetition/catalog.js`'te Bot 1 (`forex-signals`, magic 5701, dedicatedBridgeMagic 550055) ve Bot 5 (`mt5-scanner`, 5705 / 550066) gerçek emirlerini adanmış köprü magic'iyle açıyor; `backend/src/services/realResults/store.js` (satır ~37) bu magic'leri doğru bota eşliyor, yani veri depoda doğru duruyor ama rapor bulamıyor ve bu iki bot sonsuza dek "işlem yok" yazıyor. `realFor` içindeki magic listesine `dedicatedBridgeMagic`'i ekle (Set ile tekilleştir, sonlu ve pozitif olanları süz). Bu servis için henüz test dosyası yok; `backend/tests/verification/botDailyReport.golden.test.js` adında yeni bir jest dosyası aç, sahte `realResults` verisiyle önce mevcut kodda "işlem yok" çıktığını kanıtla, sonra düzeltmeyle yeşile çevir. Tek dosya + tek yeni test dosyası, **push etme**.

---

### F31 · Eşleşmeyen magic'ler artık sessizce düşmesin + GÜN TOPLAMI kaynaktan hesaplansın
- **Boyut:** M · **Dağıtım:** backend deploy · **Devredilebilir:** EVET
- **Neden:** `dTrades/dNet` **yalnız basılan satırlardan** toplanıyor; katalog dışı her magic görünmez. `raceReport.js` aynı veriden `Magic X` satırlarını basıp **tümünü** topluyor → iki rapor tutmuyor. Rapor "GÜN TOPLAMI 18 işlem" derken depoda daha fazlası olabilir ve bu matematiksel olarak fark edilemez.
- **Dosya:** `backend/src/services/botDailyReport/index.js`
- **Yapılacak:** `build()` sonuna "— Eşleşmeyen Magic'ler —" bölümü (`realAgg.filter(r => !renderedMagics.has(r.magic))`); `GÜN TOPLAMI`'nı doğrudan `realAgg.reduce(...)`'dan hesapla; basılan satır toplamı ile uyuşmuyorsa "⚠️ n işlem sahipsiz" uyarısı.
- **Kabul kriteri:** `botDailyReport.golden.test.js`: katalogda olmayan magic 999999'lu 3 deal eklendiğinde rapor bu satırı basıyor ve GÜN TOPLAMI 3 işlemi içeriyor.
- **Bağımlılık:** F30 (aynı dosya)

---

### F32 · "işlem yok" tek kelimesini 5 ayrı duruma böl
- **Boyut:** M · **Dağıtım:** backend deploy · **Devredilebilir:** EVET
- **Neden:** Rapor üç tamamen farklı durumu aynı kelimeyle yazıyor: (1) hiç sinyal üretmedi, (2) sinyal üretti ama emir açılmadı, (3) emir açıldı ama sonucu deftere ulaşmadı. Ayrıca 6 bot (`mt5Tradeable:false` — BIST dörtlüsü + mt5-london + mt5-holygrail) **yapısal olarak** gerçek işlem açamaz; rapor bunu "yasak" diye değil "işlem yok" diye yazıyor.
- **Dosya:** `backend/src/services/botDailyReport/index.js`
- **Etiketler:** `MT5 dışı (BIST)` · `TF filtresi kapalı` · `sinyal yok` · `sinyal var — emir yok` · `emir var — sonuç bekliyor`
- **Kabul kriteri:** `botDailyReport.golden.test.js`: `mt5Tradeable:false` olan bot "MT5 dışı" etiketiyle basılıyor, "işlem yok" ile değil.
- **Bağımlılık:** F31

---

### F33 · `useReal` global latch'ini bot bazına indir
- **Boyut:** M · **Dağıtım:** backend deploy · **Devredilebilir:** EVET
- **Neden:** `const useReal = realAgg.length > 0` — **tek** gerçek deal varsa `competitionManager.dailyBreakdown()` hiç çağrılmıyor ve 37 botun kâğıt aktivitesi tamamen gizleniyor.
- **Dosya:** `backend/src/services/botDailyReport/index.js` (+ okuma amaçlı `competitionManager.js`)
- **Yapılacak:** Satır formatı: `Bot N · İsim — gerçek: 3 işlem net +12$ | kâğıt: 5 sinyal, 4 pozisyon`. Her ikisi de 0 ise `sinyal yok`.
- **Kabul kriteri:** `botDailyReport.golden.test.js`: 1 gerçek deal + 5 kâğıt pozisyon → her iki sütun da görünüyor.
- **Bağımlılık:** F32

---

### F34 · Gerçek veri yokken KAĞIT rakam yayınlama — alarm bas
- **Boyut:** S · **Dağıtım:** backend deploy · **Devredilebilir:** EVET
- **Neden:** Kullanıcı **-3.234 $ kaybederken -74,51 $ okudu**; sessiz geri düşüş yanlış güven veriyor.
- **Dosya:** `backend/src/services/botDailyReport/index.js`
- **Yapılacak:** `realAgg` boşken rapor başlığı "⚠️ GERÇEK MT5 verisi alınamadı — aşağıdaki rakamlar KAĞIT defterdir, hesabı yansıtmaz" olsun (gizleme değil, **açık uyarı**).
- **Bağımlılık:** F33

---

### F35 · Rapor penceresi: başlığa aralık + gece yarısı gün kapanışı
- **Boyut:** S · **Dağıtım:** backend deploy · **Devredilebilir:** EVET
- **Neden:** Cron `15 20 * * *` (TR); ama EOD flatten **23:45**, Cuma kapatma **23:45** → günün en yoğun toplu kapanış anı raporun **dışında**. Başlık ise "GÜN TOPLAMI" diyerek tam gün iddiasında.
- **Dosya:** `backend/src/services/cronJobs.js` + `backend/src/services/botDailyReport/index.js`
- **Yapılacak:** Başlığa `· 00:00–20:15 TR` kapsam yaz; ek `5 0 * * *` cronu ile bir önceki TR gününü tam kapatan ikinci rapor.
- **Kabul kriteri:** `botDailyReport.golden.test.js` başlık testi + cron kaydının varlığı.
- **Bağımlılık:** F34

---

### F36 · Huni telemetrisi — backend ucu (`/api/bridge/telemetry`)
- **Boyut:** M · **Dağıtım:** backend deploy · **Devredilebilir:** EVET
- **Neden:** Köprünün **18 farklı atlama sebebi** (`sembol_yok`, `zaten_acik_sembol`, `dusuk_rr`, `reopen_cooldown`, `sembol_yogunlugu`, `lot_sifir`, `beyin_red:*`) yalnız VPS'teki `bridge_all.log`'a yazılıyor — bot/magic kırılımı bile yok, backend'e hiç POST edilmiyor. "Kaç sinyal → kaçı emre döndü → kaçı kapandı" hunisi **hiçbir yerde kayıtlı değil**.
- **Dosya:** `backend/src/routes/bridge.routes.js` + **yeni** `backend/src/services/botFunnel/index.js`
- **Yapılacak:** `POST /api/bridge/telemetry` → `{botId, magic, gun, asama, sebep, adet}` sayaçlarını `bot-funnel/state.json`'a topla (⚠️ `botPersistence` SUBDIRS beyaz listesine **`bot-funnel` eklenmezse save no-op olur** — MEMORY notu).
- **Kabul kriteri:** Yeni test: POST sonrası `GET /api/bot/funnel` sayaçları döndürüyor; process restart sonrası Supabase'ten geri yükleniyor.
- **Bağımlılık:** yok

---

### F37 · Huni telemetrisi — köprü tarafı POST
- **Boyut:** S · **Dağıtım:** ⚠️ **VPS ZIP-3** · **Devredilebilir:** EVET
- **Dosya:** `mt5-bridge/borsakrali_mt5_all.py` (`run_once()` sonundaki `reasons` sözlüğü)
- **Yapılacak:** Mevcut `reasons` sözlüğünü tur sonunda `/api/bridge/telemetry`'e fire-and-forget POST et (bot/magic kırılımlı).
- **Kabul kriteri:** `test_bridge.py`: sahte HTTP'ye sebep sözlüğü POST ediliyor; POST hatası tur akışını **bozmuyor**.
- **Bağımlılık:** F36

---

### F38 · Bot 38 (bk-xau) swing bacağını TF filtresinden kurtar
- **Boyut:** S · **Dağıtım:** backend deploy (veri dosyası) · **Devredilebilir:** EVET
- **Neden:** `backend/src/data/bot-builder/state.json` → `botSettings = {"bk-xau":{"timeframes":["5m"]}}`; `bridge.routes.js`'teki `builderStore.tfAllowed()` süzgeci 30m swing bacağını (magic 5751) feed'den atıyor → botun yarısı sahadan silinmiş.
- **Dosya:** `backend/src/data/bot-builder/state.json` **veya** `bridge.routes.js` (magicByStrategy'li botları TF süzgecinden muaf tut)
- **Öneri:** İkincisi (yapısal); ilki tek seferlik yama.
- **Bağımlılık:** yok

---

## 5. FAZ D — AKILLI KARAR (en son; ölçüm çalışmadan anlamsız)

### F39 · Korelasyon bütçesi: aynı para birimi bacağı tek bütçe paylaşsın
- **Boyut:** L · **Dağıtım:** ⚠️ **VPS ZIP-3** · **Devredilebilir:** EVET (net brief ile)
- **Neden:** EURUSD+GBPUSD+NZDUSD+AUDUSD+USDCAD aynı yöndeyse bu **tek bir dev USD bahsi**. Korelasyon 0,7'de 20 pozisyonun etkin bağımsız bahis sayısı 1,40; günlük standart sapma 2.208 $ → **8.349 $**. "+5-6 bin / -3 bin" salınımı bunun doğrudan matematiksel sonucu.
- **Dosya:** `mt5-bridge/account_brain.py`
- **Bağımlılık:** F19, F27

### F40 · Sürü dedektörü + kâr taşıyıcı (runner) VPS'e taşınsın
- **Boyut:** M · **Dağıtım:** ⚠️ **VPS ZIP-3** · **Devredilebilir:** HAYIR (paket farkı analizi gerekir)
- **Neden:** Kod repoda (`c7bc7ee`/`baa852c`) ama **VPS paketi commit 5491374'te** — canlıda yok. ZIP kanıtı: 07-30 00:31 ZIP'i ile 07-31 kodu birebir aynı (herd/runner yok).
- **Yapılacak:** ZIP-3 hazırlanırken önce eski ZIP ile **fark ölçülecek** (`feedback_vps_zip_workflow` kuralı), sonra tek paket.

### F41 · `close_on_feed_drift` beynin R hedefini eziyor
- **Boyut:** M · **Dağıtım:** backend deploy · **Devredilebilir:** EVET
- **Neden:** Denetçi 5'in tablosu: beyin ≥3R TP ile emri açıyor, sonra pozisyonu beyin değil **backend'deki kâğıt defter** kapatıyor (`competition-kapatti`) → 3R iz süren stop **bugün hiç tetiklenmedi**, 1R kâr kilidi **nadiren** silahlandı. Hesap aritmetiği kazananların ~1,6R'de kapandığını gösteriyor, tasarım 3R.
- **Dosya:** `backend/src/services/botCompetition/competitionManager.js` (drift kapatma dalı)
- **Yapılacak:** Gerçek broker pozisyonu olan (magic eşleşen) satırlarda drift kapatması **devre dışı** — kâğıt defter gerçek emri kapatmasın.
- **Kabul kriteri:** `botCompetition.golden.test.js`: gerçek magic'li pozisyon drift eşiğini aştığında kapatma **çağrılmıyor**.
- **Bağımlılık:** F16 (mutabakat ölçümü olmadan etkisi görülemez)

### F42 · Otomatik bench: kâğıt-vs-gerçek sapma raporu
- **Boyut:** L · **Dağıtım:** backend deploy · **Devredilebilir:** EVET
- **Yapılacak:** Haftalık: her bot için kâğıt R dağılımı vs gerçek R dağılımı; sapma > belirlenen eşikte "bu botun kâğıt defteri gerçeği temsil etmiyor" uyarısı.
- **Bağımlılık:** F16, F36, F41

---

## 6. DAĞITIM MATRİSİ (kritik)

### Yalnız **backend deploy** ile canlıya çıkar (`git push origin main` → Render auto-deploy)
`F1, F2, F3, F4, F12, F16, F30, F31, F32, F33, F34, F35, F36, F38, F41, F42`

> ⚠️ Frontend'e dokunulmuyor → `npm run build` / `git add -f frontend/dist` **gerekmiyor**.

### ⚠️ **VPS ZIP** gerektirir (Masaüstü'ne zip → RDP → klasör üstüne çıkar → restart)
- **ZIP-1 (DEFTER KURTARMA — en acil):** `F5, F6, F7, F8, F9, F10, F11, F13, F14, F15`
  - Dosyalar: `borsakrali_account_brain.py`, `mt5_brain_adapter.py`, `borsakrali_mt5_all.py`, `borsakrali_mt5.py`, `borsakrali_mt5_scanner.py`
  - ⛔ ZIP'e `STOP` / `STOP_SCANNER` / `config*.json` / `scanner_state.json` **KOYMA**
  - ZIP öncesi: eski ZIP ile fark ölç (VPS genelde birkaç commit geride)
- **ZIP-2 (RİSK):** `F18, F19, F20, F21, F22, F23, F24, F25, F26, F27, F28`
- **ZIP-3 (TELEMETRİ + AKIL):** `F37, F39, F40`

### VPS config düzenlemesi (ZIP değil)
`F29` (`config.json` temizliği + **`allowed_account` → 1514083666**), `F0.1` (`race_mode`)

### Sıralama zorunluluğu
**F2 (backend) ve F5 (VPS) birlikte canlıya çıkmalı.** Yalnız biri çıkarsa kilit tam açılmaz:
- Sadece F2 → beyin hâlâ `pending_opens`'ta duruyor olabilir (outbox F7 olmadan yavaş boşalır)
- Sadece F5 → kapanışlar gider ama 503 hâlâ cursor'u dondurur (F6 yoksa)
→ **Önerilen kesişim:** `F1+F2+F3+F12` backend'e, aynı gün `ZIP-1` VPS'e.

### Commit politikası
- `git add -A` **YOK** — dosyaları açıkça stage et, ayrı ve açıklayıcı commit'ler.
- ⛔ **Paralel ajan çalışırken hiçbir ajan push ETMEZ.** Toplama+push tüm görevler bitince tek elden.
- Git: author `hsnkrkl19`, remote `borsakrali`.

---

## 7. ÖNERİLEN ÇALIŞMA SIRASI (7 dalga)

| Dalga | Görevler | Paralel? | Çıktı |
|---|---|---|---|
| **1** | F0.1–F0.3 (kullanıcı) | — | Kanama durur |
| **2** | F1, F2, F3, F4, F12 | ✅ 5 ajan paralel (farklı dosyalar; F2↔F12 aynı dosya → sıralı) | Backend deploy #1 |
| **3** | F5→F6→F8→F9→F10→F11 (tek dosya, **sıralı**) ‖ F7 ‖ F13→F14→F15 | Kısmen | **ZIP-1** |
| **4** | F17 (backfill) + F16 (mutabakat) | ✅ | Kayıp veri geri, invaryant kurulur |
| **5** | F18→F19→F21→F26→F27 (sıralı) ‖ F22 ‖ F23→F24→F25 ‖ F20 | Kısmen | **ZIP-2** |
| **6** | F30→F31→F32→F33→F34→F35 (sıralı, tek dosya) ‖ F36 ‖ F38 | Kısmen | Backend deploy #2 |
| **7** | F37, F39, F40, F41, F42 | ✅ | **ZIP-3** + backend deploy #3 |

**Kritik yol:** F2 + F5 + F6 + F8 → bunlar canlıya çıkmadan hiçbir ölçüm güvenilir değil. Diğer her şey bekleyebilir.

---

## 8. HER GÖREVDE UYULACAK KURAL (NR7 dersi)

> **Regresyon testi, hatalı kodda BAŞARISIZ olduğu kanıtlanmadan yazılmış sayılmaz.**
> Her görevde önce testi yaz → kırmızı olduğunu gör → düzelt → yeşil. Test çıktısını commit mesajında belirt.

---

# KULLANICIYA SORULACAKLAR

### Q1 — Düzeltmeler inene kadar canlı işlem ne olsun?
- **(a)** Tamamen durdur (VPS'e `STOP`) — 1-2 gün sıfır işlem
- **(b)** `race_mode=false` yap, işlemler devam etsin (havuz tavanları geri gelir, işlem sayısı düşer)
- **(c)** Aynen devam, sadece kod düzeltilsin
- **🔵 ÖNERİM: (b).** `race_mode=false` tek satırlık config değişikliği; portföy/sembol/bot dolar tavanlarını (%1,5 = ~2.962 $ toplam açık risk) anında geri getirir. (a) gereksiz agresif, (c) ise -3.011 $/gün frenine sahip bir sistemi ölçemeden çalıştırmak demek.

### Q2 — İşlem başı **mutlak** dolar risk tavanı kaç olsun? (F18)
- **(a)** 100 $ — mevcut 493,74 $'ın 1/5'i; XAUUSD -414,90 $ → ~-100 $ olurdu
- **(b)** 150 $
- **(c)** 250 $
- **(d)** Mutlak tavan koyma, sadece yüzdeyi düşür (0,25% → 0,10% = 197 $)
- **🔵 ÖNERİM: (a) 100 $.** Yüzde tabanlı tavan hesap büyüdükçe **sessizce büyüyor** (10k'da 25 $, 197k'da 494 $ = 19,7 kat) — (d) bu yapısal sorunu çözmez. 100 $ tavan, mevcut 15 $ tabanla birlikte geçerli risk aralığını 32,9 kattan **6,7 kata** indirir.

### Q3 — Günlük zarar freni? (F21)
- **(a)** 1,5% kalsın (bugünkü: **3.011 $/gün**)
- **(b)** 0,75% (**1.505 $/gün**)
- **(c)** 0,5% + mutlak 1.000 $ ikizi (**~1.004 $/gün**)
- **(d)** Sadece mutlak dolar: 750 $/gün, yüzdeyi kaldır
- **🔵 ÖNERİM: (c).** Yüzde tek başına hesap büyüdükçe gevşiyor; mutlak tek başına hesap küçülürse fazla sıkı. İkisinin `min()`'i doğru. Ayrıca `build_config` üst sınırı 0,75'e indirilmeli ki bir config yanlışlıkla 1,5'e geri açamasın.

### Q4 — Kayıp geçmiş verisi (07-29 → 07-31) geri yüklensin mi? (F17)
- **(a)** Evet, MT5 history'den tam backfill — istatistikler doğru olur ama "kötü gün" rakamlara kalıcı girer
- **(b)** Hayır, sıfırdan temiz başla (`BOT_STATS_RESET` jetonu yenilenir)
- **(c)** Backfill yap ama ayrı bir "arşiv" etiketiyle, bot skorlarına katma
- **🔵 ÖNERİM: (a).** Botların gerçek isabet oranını bilmeden hangi botun kapatılacağına karar veremeyiz; **kullanıcı İSABET odaklı** (MEMORY notu) ve eksik defter tam da isabeti yalanlıyor. -3.234 $ zaten gerçekleşti; rakamı saklamak kararı bozar. Ama ⚠️ MT5'ten export'u **siz** almalısınız (F0.3).

### Q5 — XAUUSD'de iki motor var (altın botu 0,10 lot tavanlı, köprü/beyin 1.00 lot). Ne olsun? (F28)
- **(a)** XAUUSD **yalnız** altın botunda kalsın, köprü/beyin bu sembolde işlem açmasın
- **(b)** XAUUSD yalnız köprü/beyinde, altın botu kapatılsın
- **(c)** İkisi de kalsın ama ortak 0,10 lot tavanı
- **🔵 ÖNERİM: (a).** Altın botu **platform dışı standalone** bir motor (MEMORY: çift-model canlı) ve kendi disiplinli tavanı var; günün en büyük tek kaybı (-414,90 $) köprü yolundan geldi. İki motorun aynı sembolde birbirinden habersiz pozisyon açması yapısal olarak yanlış — sahip tek olmalı.

### Q6 — Telegram bildirimleri ne olsun? (F1/F4 politikası)
- **(a)** Her işlem açılış+kapanış bildirilsin (mevcut niyet; 60 işlem/gün × 2 = 120 mesaj → kanal limiti aşılır)
- **(b)** Yalnız **kapanış** bildirilsin (açılış susturulsun) — MEMORY'deki 2026-07-24 kararıyla uyumlu
- **(c)** Bireysel işlem bildirimi kapansın, yalnız saatlik/günlük özet gitsin
- **🔵 ÖNERİM: (c) + (b) karması:** açılışlar tamamen kapalı, kapanışlar yalnız |net| > 50 $ olduğunda, ayrıca saatlik özet. Telegram kanal limiti ~20 msg/dk; yoğun günü tasarımdan çıkarmak F4'ün hız sınırlayıcısını "acil durum valfi" konumuna indirger. **Kritik not:** hangi seçenek olursa olsun **F1 önce inmeli** — şu anda bildirimi susturmak (`MT5_TRADE_NOTIFY_DISABLED=1`) defteri tamamen öldürüyor.