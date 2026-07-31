# Teshis Bulgulari - 2026-07-31 (5 denetci ajan)

> Kaynak: `bot-yarisi-derin-teshis` workflow. Onem sirasina dizildi.

**Dagilim:** kritik 17 · yuksek 21 · orta 11 · dusuk 3

---

## 1. [KRITIK] Açılış outbox'ı kuyrukta kaldığı sürece KAPANIŞ raporu hiç POST edilmiyor (asıl katil)

**Kanit:**

```
borsakrali_account_brain.py:1288-1295 —
```
mt5_brain_adapter.flush_broker_event_outbox(cfg, logger=log)
pending_opens = mt5_brain_adapter.broker_event_outbox_count(cfg)
if pending_opens:
    log.error("%s broker acilis olayi kuyrukta; kapanis raporu sirayi korumak icin beklendi", pending_opens)
    return False
```
Bu `return False` satır 1317'deki `payload = {... "closed": closed_rows ...}` KURULMADAN önce çalışır → kapanış satırları ağa hiç çıkmaz.

Kuyruğun boşalmama nedeni: mt5_brain_adapter.py:508-530 — `/api/bridge/state` 200 dışı dönerse lease bırakılır, event kuyrukta KALIR (`return False`).

503'ün nedeni: bridge.routes.js:90-99 `if (lifecycle.retryableFailures > 0 ...) return res.status(503)`; retryableFailures ise mt5TradeNotifier/index.js:773-774 (`if (await deliver('open',...)) openNotified++; else retryableFailures++`) ve 866-867 ile Telegram teslimatı başarısız olunca artar.

CANLI LOG UYUMU: 00:23-00:27 'POST 503 trade-notification-pending, openNotified 0-3, skipped 20/40, retryableFailures 22' — bunlar outbox flush POST'larıdır (yalnız `open` içerir); `_report_state` aynı anda 1295'ten sessizce dönüyordu.
```

**Kok neden:** Mesaj SIRASI garantisi (açılış Telegram'ı kapanıştan önce gitsin) ile VERİ DEFTERİ aynı kanala bağlanmış. Telegram teslimatı bir muhasebe önkoşulu haline getirilmiş: tek bir Telegram 429'u tüm hesap defterini durduruyor. Ayrıca `flush_broker_event_outbox` HTTP 200 dışını ayrım yapmadan 'teslim edilmedi' sayıyor; oysa 503 gövdesi zaten `openNotified`/`results.ingested` ile olgunun backend'e KAYDEDİLDİĞİNİ bildiriyor.

**Duzeltme:** Minimal: `_report_state` içinde outbox kapısını yalnız `open` bölümüne uygula, `closed`'a değil. Yani 1292-1295'teki `return False` yerine `payload["open"] = []` (veya `defer_opens = True`) yapıp `closed_rows`'u HER HALÜKARDA POST et; POST 200 değilse cursor'u yine ilerletme. Kapanış satırları idempotent (deal ticket anahtarlı) olduğu için erken gönderim güvenli.
İkinci minimal düzeltme: mt5_brain_adapter.py:513'te `if response.status_code != 200` yerine `if response.status_code not in (200, 503)` + 503 gövdesinde ilgili `open` satırı için `openNotified/skipped>0` ise event'i kuyruktan DÜŞÜR (olgu backend'de kalıcı; yalnız Telegram bekliyor).

**Dosyalar:** borsakrali_account_brain.py, mt5_brain_adapter.py, bridge.routes.js, index.js

---

## 2. [KRITIK] Günlük rapor `dedicatedBridgeMagic`'i sorgulamıyor → Bot 1 ve Bot 5'in TÜM işlemleri rapordan ve GÜN TOPLAMI'ndan düşüyor

**Kanit:**

```
botDailyReport/index.js:53-63 —
```
function realFor(entry) {
  const magics = entry.magicByStrategy
    ? [...new Set(Object.values(entry.magicByStrategy))]
    : [Number(entry.magic)];
  const rows = magics.map((m) => realByMagic.get(Number(m))).filter((x) => x && x.trades > 0);
```
`entry.dedicatedBridgeMagic` HİÇ okunmuyor.

catalog.js:17 `{ id:'forex-signals', ..., magic: 5701, dedicatedBridgeMagic: 550055 }`
catalog.js:26 `{ id:'mt5-scanner', ..., magic: 5705, dedicatedBridgeMagic: 550066 }`

Buna karşılık realResults/store.js:35-42 bu magic'leri CATALOG_BY_MAGIC'e EKLİYOR (lider tablosu/Telegram etiketi doğru çalışıyor), yani deal'ler depoda DOĞRU botla duruyor ama rapor onları bulamıyor.

Ayrıca botDailyReport/index.js:65-94 — `dTrades/dTp/dSl/dNet` YALNIZ ekrana basılan satırlardan toplanıyor; `aggregate()` içindeki eşlenmemiş magic satırları (ör. `magic-550055`) ne listeye ne toplama giriyor → 'GÜN TOPLAMI 18 işlem, net -74,51$' gerçeğin sadece eşlenebilen kısmı.

LOT KANITI: borsakrali_mt5.py:83 `"max_lot": 1.0`, borsakrali_mt5_scanner.py:104 `"max_lot": 1.0` → kullanıcının gördüğü 'çoğu tam 1.00 lot' kümesi bu iki adanmış köprünün tavana dayanmış işlemleri; hepsi raporda görünmez.
```

**Kok neden:** magic→bot eşlemesi iki yerde ayrı ayrı yazılmış: realResults/store.js `magicToBot()` çok-magic'i biliyor, botDailyReport kendi ters-eşlemesini (bot→magic) elle kuruyor ve `dedicatedBridgeMagic`'i unutuyor. Tek yönlü kaynak (magicToBot) kullanılmadığı için 2026-07-24'te eklenen adanmış köprü otoritesi rapora yansımadı.

**Duzeltme:** botDailyReport/index.js:54-56'da magic listesini genişlet:
```
const magics = [...new Set([
  Number(entry.magic),
  ...(entry.dedicatedBridgeMagic ? [Number(entry.dedicatedBridgeMagic)] : []),
  ...Object.values(entry.magicByStrategy || {}).map(Number),
].filter((m) => Number.isFinite(m) && m > 0))];
```
Ek emniyet (sessiz kayıp bir daha olmasın): `build()` sonunda `realAgg` içinde hiçbir satıra eşlenmemiş magic kaldıysa '— Eşlenmemiş Magic'ler —' başlığıyla listele ve GÜN TOPLAMI'na kat. Böylece rapor toplamı ile hesap gerçeği yapısal olarak ayrışamaz.

**Dosyalar:** index.js, catalog.js, store.js, borsakrali_mt5.py, borsakrali_mt5_scanner.py

---

## 3. [KRITIK] Cursor, `live` snapshot'ı yüzünden atlanan pozisyonların üzerinden atlıyor → toplu kapanışlarda KALICI satır kaybı

**Kanit:**

```
Atlama: borsakrali_account_brain.py:1204-1206 —
```
for position_ticket, recent_closes in candidates.items():
    if position_ticket in live:
        continue        # <-- blocked_position_ids.append YOK
```
Cursor ilerletme: borsakrali_account_brain.py:1348-1351 —
```
observed = int(history_cutoff_sec or time.time())
latest_close = max((int(r.get("closedSec",0) or 0) for r in closed_rows), default=0)
state["notificationCursorSec"] = max(stored_cursor, observed, latest_close)
```
Sınır süzgeci: borsakrali_account_brain.py:1197 `if int(getattr(deal,"time",0) or 0) < boundary: continue` ve 1217 aynı kontrol `latest` için.

`live` kümesi run_once:1378'de okunan `risk_positions` anlık görüntüsünden geliyor (1301-1306) ama `_report_state` döngünün SONUNDA, 1628-1630'da çağrılıyor.

SENARYO (toplu kapanış): A pozisyonu T1'de brokerda kapandı ama positions_get anlık görüntüsünde hâlâ canlı görünüyor → 1205'te atlanır, hiçbir yere 'bloke' diye kaydedilmez. Aynı turda B, T2>T1'de kapanmış ve raporlanmış → cursor = T2. Sonraki turda A'nın deal'i için 1197: T1 < T2 → `continue`. A BİR DAHA ASLA raporlanmaz.

`cursor_blocked` yalnızca `_position_history()` None dönerse set ediliyor (1207-1211); `live` yüzünden atlananlar bu koruma kapsamına HİÇ girmiyor.
```

**Kok neden:** Cursor 'işlenmiş en yüksek zaman damgası' olarak ilerletiliyor, oysa `_closed_rows` bilinçli olarak DELİKLİ (live olanı atlıyor). Yüksek-su-seviyesi (high-water mark) cursor'u ancak süzgeç deliksizse doğrudur. Ayrıca `live` kümesi, deal geçmişiyle AYNI ANDA okunmadığı için (positions_get t=1378, history t=1424, kullanım t=1628) yapısal olarak bayat.

**Duzeltme:** İki satırlık minimal düzeltme: 1205'teki `continue`'dan önce atlanan pozisyonu da bloke listesine ekle —
```
if position_ticket in live:
    blocked_position_ids.append(position_ticket)
    continue
```
Böylece `cursor_blocked=True` olur ve 1340-1343 dalı çalışıp cursor'u ilerletmez; A bir sonraki turda (artık live değilken) yakalanır. 
Daha sağlam ikinci adım: cursor'u `latest_close`/`observed` ile değil, `min(atlanmayan en eski işlenmemiş kapanış zamanı)` ile sınırla; yani `state["notificationCursorSec"] = min(observed, en_erken_bloke_closedSec)` mantığı.

**Dosyalar:** borsakrali_account_brain.py

---

## 4. [KRITIK] Beyin açıkken kapanış raporunun TEK kaynağı beyin; adanmış köprüler ve birleşik köprü tamamen susuyor (yedek yol yok)

**Kanit:**

```
borsakrali_mt5_all.py:744-753 —
```
def report_real_results(cfg, force=False):
    global _last_results_report
    if mt5_brain_adapter.enabled(cfg):
        return          # <-- ERKEN DÖNÜŞ DOĞRULANDI
```
borsakrali_mt5_all.py:804-819 `report_mt5_state` da `if mt5_brain_adapter.enabled(cfg): return`.

`grep -n "bridge/results|bridge/state|closed" borsakrali_mt5.py borsakrali_mt5_scanner.py` → HİÇBİR EŞLEŞME. Yani adanmış köprüler (magic 550055 / 550066) kapanış sonucu raporlamıyor; borsakrali_mt5.py yalnız pozisyon açıyor/kapatıyor ve `mt5_brain_adapter` üzerinden karar/açılış olayı üretiyor.

Sistemde `"closed"` alanını POST eden tek yer: borsakrali_account_brain.py:1322 (ve devre dışı borsakrali_mt5_all.py:791).
```

**Kok neden:** 2026-07-29 merkezî beyin geçişinde 'tam net K/Z'nin tek sahibi olsun' gerekçesiyle eski kapanış yolları kapatıldı ama beyin yolunun ÖNÜNE (bulgu 1) bir Telegram bağımlılığı konuldu. Tek kaynak + o kaynağın önünde ilgisiz bir kapı = tek nokta arızası. Ayrıca Bot 1/Bot 5'in 'işlem yok' görünmesinin İKİNCİ sebebi budur: kendileri hiç sonuç bildirmiyor, tamamen beyne bağımlılar (bulgu 2 ile birleşince rapora asla giremiyorlar).

**Duzeltme:** `borsakrali_mt5_all.py report_real_results` içindeki erken dönüşü 'Telegram göndermeyen, yalnız defter besleyen' moda çevir: beyin açıkken `POST /api/bridge/results` yerine sadece `realResults` besleyen bir uca (ör. `/api/bridge/results?ledgerOnly=1`, notifier'ı atlayan) 5 dk'da bir gönder. Deal ticket idempotent olduğu için beyin sonradan tam bileşenli satırı yazınca `store.js:195-201` merge mantığı zaten zengin alanları koruyor (`old.componentsExact && !d.componentsExact` dalı). Böylece beyin tıkansa bile defter asla boş kalmaz.

**Dosyalar:** borsakrali_mt5_all.py, borsakrali_mt5.py, borsakrali_mt5_scanner.py, borsakrali_account_brain.py

---

## 5. [KRITIK] Lot tavanı 1.00 sabit; hesap büyüdükçe ölçeklenmiyor ve dolar-risk tavanı hiç yok — 1.00 lot beyin-onaylı doygunluk değeri

**Kanit:**

```
account_brain._safe_lot (satır 529-542): `steps = floor((risk_budget / loss_per_lot)/volume_step)` sonra `lot = min(spec.volume_max, steps*volume_step)`. mt5_brain_adapter._symbol_spec (satır 584-597): `absolute_lot_cap = min(1.0, _value(cfg,'account_tier_max_lot','brain_max_lot', default=1.0))` ve `volume_max = min(broker.volume_max, absolute_lot_cap)`.

SAYISAL: Varlık E=197.497,32. build_config -> trade_risk_pct=0.25 (config_all `risk_pct: 0.25`), evaluate() içinde dynamic_risk = 0.10 + 0.15*strength, agreeCount>=3 ise 0.25. config_all `min_confidence: 60` olduğundan HER canlı giriş en az 0.19% alır.
  butce(0.10%) = 197,50 $ | butce(0.19%) = 375,24 $ | butce(0.2125%) = 419,68 $ | butce(0.25%) = 493,74 $

1.00 LOT DOYGUNLUK SINIRI (loss_per_lot <= 493,74 olan her stop 1.00 lot verir):
  EURUSD/GBPUSD/AUDUSD/NZDUSD (10 $/pip): stop <= 49,37 pip -> 1.00 lot
  USDCAD (~7,30 $/pip @1,37):            stop <= 67,64 pip -> 1.00 lot
  USDJPY (~6,62 $/pip @151):             stop <= 74,58 pip -> 1.00 lot
  US100.cash / US500.cash (1 $/puan):    stop <= 493,74 puan -> 1.00 lot
  BTCUSD (1 $/1 $ hareket):              stop <= 493,74 $ -> 1.00 lot
  XAUUSD (100 $/1 $ hareket):            stop <= 4,94 $ -> 1.00 lot
EURUSD 20 pip stop örneği: loss_per_lot = 0,0020/0,00001 × 1,00 = 200 $; steps = floor((493,74/200)/0,01) = 246 -> ham lot 2,46 -> min(1.00, 2.46) = **1.00 TAVANA TAKILIR**.

GERÇEK İŞLEMLERLE DOĞRULAMA: EURUSD 1.00 -287,00 $ = 28,7 pip (istenen lot 493,74/287 = 1,72 idi, tavan %42 kırptı). USDJPY 1.00 -148,05 $ ≈ 22 pip (istenen 3,34 lot). US100 1.00 -162,95 $ = 163 puan (istenen 3,03 lot). XAUUSD 1.00 -414,90 $ = 4,15 $ altın hareketi, istenen lot 1,19 — tavan neredeyse hiç kırpmadı, işlem TAM BÜTÇEYLE (~490 $) gitti.

BAĞIMSIZ ÇAPRAZ KANIT: Komisyon -552,32 $ / ~55 işlem ≈ 10 $/işlem. FTMO'da ~3 $/lot/yön × 2 yön ⇒ ortalama ~1,7 lot gidiş-dönüş ≈ 0,85 lot/işlem. Eski 0,15 lot tavanıyla aynı gün komisyon ~55 $ olurdu; 10 katı çıkması lot büyüklüğünü tek başına kanıtlıyor.

TAVAN YOK KANITI: `grep -rn 'max_initial_risk_usd|max_risk_usd|max_trade_risk_usd|risk_usd_cap' mt5-bridge/*.py backend/src` -> 0 sonuç. BrainConfig.__post_init__ (satır 136) yalnız TABAN doğruluyor: `if self.min_expected_profit_usd < 15 or self.min_initial_risk_usd < 15: raise`. Taban 15 $, fiili tavan 493,74 $ = 32,9 kat; ve tavan equity ile büyüyor (10.000 $ hesapta 25 $, 197.497 $ hesapta 493,74 $ = 19,7 kat artış, tek satır config değişmeden).
```

**Kok neden:** Lot tavanı DOLAR cinsinden değil LOT cinsinden ve sabit 1.00. Ucuz enstrümanlarda (FX, endeks) 1.00 lot hiçbir zaman bağlayıcı bir risk tavanı değil — sadece dar stoplarda devreye girer, yani riskin zaten düşük olduğu yerde. Gerçek risk tavanı yüzde × equity olduğu için hesap 200k'ya çıkınca işlem başı risk sessizce 494 $'a fırladı; kodda bunu sınırlayan mutlak bir dolar tavanı hiç yazılmamış.

**Duzeltme:** 1) BrainConfig'e `max_initial_risk_usd` ekle (öneri 100-150 $) ve evaluate_pretrade'de _safe_lot'tan HEMEN ÖNCE `risk_budget = min(risk_budget, config.max_initial_risk_usd)` uygula. Tek başına XAUUSD -414,90'ı ~-100'e, BTCUSD -379,89'u ~-100'e indirirdi. 2) Sembol sınıfına göre risk çarpanı: FX 1.0×, endeks 0.5×, metal 0.4×, kripto 0.3× (gap/7-24 maruziyeti). 3) `account_tier_max_lot`u statik 1.0 yerine tier'den türet (aşağıdaki bulguya bak).

**Dosyalar:** account_brain.py, mt5_brain_adapter.py, config_all.example.json

---

## 6. [KRITIK] race_mode limits_usd'i yalnız "trade"e indiriyor — portföy/sembol/bot havuz tavanlarının HEPSİ kalkıyor, toplam açık risk sınırsız

**Kanit:**

```
account_brain.evaluate_pretrade satır 469-478:
```
if config.race_mode:
    limits_usd = {"trade": equity * float(config.trade_risk_pct) / 100.0}
else:
    limits_usd = {"trade": ..., "symbol_side": ..., "bot": ..., "portfolio": ..., "account": ..., "hard_account": ...}
risk_budget = min(limits_usd.values())
```
race_mode'da min() tek elemanlı bir sözlük üzerinde çalışıyor: mevcut açık riskin (current_symbol/current_bot/current_account) SIFIR etkisi var. Ayrıca satır 507 `if not config.race_mode:` ile projeksiyon ihlal kontrolleri (symbol_side_hard_cap / bot_hard_cap / account_open_risk_cap) tamamen atlanıyor.

race_mode PRODÜKSİYONDA ZORLA AÇIK: vps-paket-insa.ps1 satır 60 `$all.race_mode = $true` — ZIP'e gömülen config_all.json'a yazılıyor (config_all.example.json'da `race_mode: false` olmasına rağmen).

SAYISAL (E=197.497,32): race KAPALI olsaydı ek tavanlar
  symbol_side 0.5% = 987,49 $ (mevcut sembol+yön riski düşülür)
  bot 0.5% = 987,49 $
  portfolio 1.5% = 2.962,46 $
  account 1.5% = 2.962,46 $
  hard_account 2.0% = 3.949,95 $
yani toplam açık risk 2.962 $'da (%1,5) dururdu. race AÇIK olduğu için 20 pozisyon × ~450 $ = ~9.000 $ (%4,6) açık risk hiçbir katmandan itiraz almıyor.

Sonuç ekranı bunu doğruluyor: Teminat 31.201,43 $ — 197k hesapta %15,8 kullanılmış teminat, yani aynı anda çok sayıda tam-boy pozisyon.

AYNI KÖRLÜK DAEMON'DA DA VAR: borsakrali_account_brain.py satır 745 `if cfg.get("race_mode") is not True:` ile openRiskPct / maxSymbolSideRiskPct / maxBotRiskPct flatten kontrolleri atlanıyor — yani beyin daemon'ı da yığılmış riski görmüyor.

KORELASYON TAVANI DA KAPALI: borsakrali_mt5_all.py satır 393 `if (cfg.get("race_mode") is not True and max_sym_side > 0 ...)` -> `max_per_symbol_side: 1` devre dışı; satır 968-970 `max_total = 0 if race else 20`, `max_per_bot = 0 if race else 3`. Açık pozisyonlar bunu birebir gösteriyor: EURUSD 4 pozisyon (0,46/0,29/0,27/0,23), BTCUSD 3 (0,44/0,32/0,30), ETHUSD 2 (0,64/0,62) — üstelik EURUSD+GBPUSD+NZDUSD+AUDUSD+USDCAD aynı yöndeyse bu tek bir dev USD bahsi.
```

**Kok neden:** "Yarış modu" giriş SAYISI kısıtını kaldırmak için tasarlanmışken, dolar cinsinden HAVUZ risk tavanlarını da beraberinde kaldırmış. Giriş serbestliği ile toplam maruziyet tavanı birbirine karıştırılmış: ikisi ayrı kavram.

**Duzeltme:** race_mode'da yalnız `symbol_side` ve `bot` (rekabeti kısıtlayan sayaçlar) düşsün; `portfolio`/`account`/`hard_account` KALSIN: `limits_usd = {"trade": ..., "hard_account": equity*hard_max_open_risk_pct/100 - current_account}`. Aynı şekilde borsakrali_account_brain.py:745'teki openRiskPct hard kontrolü race modunda da çalışsın. Ek olarak korelasyon bütçesi: aynı para birimi bacağındaki (USD-short) pozisyonlar tek bir sembol gibi ortak bütçe paylaşsın.

**Dosyalar:** account_brain.py, borsakrali_account_brain.py, borsakrali_mt5_all.py, vps-paket-insa.ps1

---

## 7. [KRITIK] -3.234,88 $ tasarımın İZİN VERDİĞİ zarar: günlük giriş freni tam 3.010,98 $'da — kaçak değil, ayarlanmış tolerans

**Kanit:**

```
account_brain._account_guard satır 546-577: `daily_loss = (day_start_equity - equity)/day_start_equity*100`, ardından `if daily_loss >= config.daily_entry_brake_pct: return REJECT(daily_entry_brake_block_new)`.
BrainConfig varsayılanı `daily_entry_brake_pct: 1.5`; build_config satır 133 `_bounded(..., 1.5, 0.01, 1.5)` -> config yalnız DÜŞÜREBİLİR, config_all'da bu anahtar YOK => 1.5 yürürlükte.

SAYISAL: gün-başı equity = 197.497,32 + 3.234,88 = 200.732,20 $
  giriş freni 1.5% -> 3.010,98 $
  uyarı 4.0%       -> 8.029,29 $
  flatten 4.25%    -> 8.531,12 $
  sert tavan 4.5%  -> 9.032,95 $
Gerçekleşen zarar 3.234,88 / 200.732,20 = **1,6115%**. Yani fren 3.010,98 $'da tetiklendi; aradaki 223,90 $ zaten açık olan pozisyonların kayması. Zarar frenin eşiğini yalnızca %7 aştı.

SONUÇ: sistem "kaçmadı". Gün başına 3.011 $ zarara İZİN VERECEK şekilde ayarlı. Eski 0,15 lot rejiminde bu eşiğe ulaşmak 100+ kayıp işlem gerektirirdi; 1.00 lot / 494 $ bütçe rejiminde 8-12 kayıp işlem yetiyor. Kullanıcının "dün 5-6 bin kâr, bugün 3 bin zarar" gözlemi tam da bu simetrik büyüklüğün doğal sonucu.
```

**Kok neden:** Prop-firma limitine (%4-5) göre kalibre edilmiş frenler, kullanıcının gerçek zarar toleransına göre değil. İşlem-başı risk 20 kat büyürken günlük fren yüzdesi hiç düşürülmedi; yüzde sabit kalınca dolar tutarı equity ile birlikte 3.011 $'a çıktı.

**Duzeltme:** `daily_entry_brake_pct`i 1.5 -> 0.5 yap (=1.003,66 $/gün) ve build_config'deki `_bounded(..., 1.5, 0.01, 1.5)` üst sınırını da 0.75'e indir ki config yanlışlıkla geri açamasın. Ayrıca mutlak dolar ikizi ekle: `max_daily_loss_usd` (örn. 1.000 $) — yüzde tabanlı fren hesap büyüdükçe sessizce gevşiyor.

**Dosyalar:** account_brain.py, mt5_brain_adapter.py

---

## 8. [KRITIK] KİLİTLENME: bekleyen açılış kuyruğu (outbox) kapanış raporunu tamamen durduruyor — ~40 işlemin kayıt dışı kalmasının birincil sebebi

**Kanit:**

```
borsakrali_account_brain.py `_report_state()` gövdesinin ilk satırları:
```
mt5_brain_adapter.flush_broker_event_outbox(cfg, logger=log)
pending_opens = mt5_brain_adapter.broker_event_outbox_count(cfg)
if pending_opens:
    log.error("%s broker acilis olayi kuyrukta; kapanis raporu sirayi korumak icin beklendi", pending_opens)
    return False
```
Bu erken dönüş POST'tan ÖNCE. Yani `closed` satırları BACKEND'E HİÇ GİTMEZ.
mt5_brain_adapter.flush_broker_event_outbox() (satır 508-530): `response = requests.post(base + "/api/bridge/state", ...)`; `if response.status_code != 200:` → olaylar outbox'ta TUTULUR, return False.
bridge.routes.js POST /state: `if (lifecycle.retryableFailures > 0 || lifecycle.invalid > 0 || ...) return res.status(503).json({... error: 'trade-notification-pending' })`.
→ Döngü: Telegram teslimi takılır → 503 → outbox boşalmaz → pending_opens>0 → kapanışlar hiç POST edilmez → realResults/deals.json boş kalır → botDailyReport 36 bot için 'işlem yok' yazar.
Kullanıcının gece 00:23-00:27 logu bu döngünün tam imzası: 'POST 503 trade-notification-pending, openNotified 0-3, skipped 20/40, retryableFailures 22 → 2, Read timed out'.
ÖNEMLİ AYRIM: bridge.routes.js'te `realResults.ingest(req.body.closed, ...)` 503'ten ÖNCE çalışır ve persist eder. Yani 503'ün kendisi veri kaybettirmez; veri kaybı POST'un HİÇ YAPILMAMASINDAN gelir. Bu da suçlunun kesin olarak yukarıdaki erken-dönüş olduğunu gösterir.
```

**Kok neden:** Telegram bildirim sırası (açılış mesajı kapanış mesajından önce gitmeli) ile MUHASEBE (kapanan işlemi deftere yaz) aynı endpoint'e ve aynı başarı koşuluna bağlanmış. Bildirim katmanının geçici hatası tüm istatistik altyapısını sessizce kör ediyor.

**Duzeltme:** Muhasebeyi bildirimden ayır: (a) yeni `POST /api/bridge/results-only` (veya /state'e `accountingOnly:true`) — realResults.ingest yapar, Telegram'a hiç dokunmaz, retryableFailures'a bakmadan 200 döner. (b) Beyin `_report_state`'te pending_opens varken de `closed` satırlarını bu muhasebe ucuna gönder; Telegram sırası korunacaksa yalnız bildirim yayınını beklet. (c) 503 yanıtına `ingested` sayısını koy ve köprü tarafında 503+ingested>0 durumunu 'muhasebe tamam, bildirim bekliyor' olarak kabul edip cursor'u ilerlet.

**Dosyalar:** borsakrali_account_brain.py, mt5_brain_adapter.py, bridge.routes.js, index.js

---

## 9. [KRITIK] Günlük bot raporu eşleşmeyen magic'leri SESSİZCE düşürüyor; GÜN TOPLAMI da yalnız basılan satırlardan toplanıyor

**Kanit:**

```
botDailyReport/index.js build(): `realByMagic` sözlüğü kuruluyor, sonra YALNIZ üç döngü basıyor — COMPETITORS (katalog), builderStore.listCustom(), ve realResults.GOLD_MAGIC. `dTrades += r.trades; dNet += r.net;` sayaçları da SADECE bu döngülerin içinde artıyor.
realResults.magicToBot() eşleşmeyen magic için `{ botId: 'magic-5xxx', name: 'Magic 5xxx', kind: 'unknown' }` döndürüyor — ama günlük rapor bu satırı ne basıyor ne topluyor.
Karşılaştırma: realResults/raceReport.js buildMessage() `rowLabel(row)` ile `Magic ${row.magic}` basıyor ve `today.reduce(...)` ile TÜM satırları topluyor → yarış raporu doğru, günlük bot raporu eksik. İki rapor aynı veriden farklı toplam üretiyor.
Sonuç: rapordaki 'GÜN TOPLAMI 18 işlem, net -74,51$' ifadesi, deposunda 18'den fazla deal olsa bile matematiksel olarak asla depodaki gerçek toplamı gösteremez.
```

**Kok neden:** Rapor 'katalogdan botlara doğru' (push) yazılmış; deposundaki veriden botlara doğru (pull) yazılmamış. Katalog dışı her magic görünmez oluyor: eski hesap kalıntıları, elle açılmış EA'lar, silinmiş özel botlar, magicByStrategy'si katalogda güncellenmemiş alt motorlar.

**Duzeltme:** build() sonuna 'Eşleşmeyen magic'ler' bölümü ekle: `realAgg.filter(r => !renderedMagics.has(r.magic))` satırlarını 'Magic X — n işlem · net Y$' diye bas ve dTrades/dNet'e dahil et. Ayrıca `GÜN TOPLAMI`'nı basılan satırlardan değil doğrudan `realAgg.reduce(...)`'dan hesapla; iki değer tutmuyorsa rapora '⚠️ n işlem sahipsiz' uyarısı koy.

**Dosyalar:** index.js, store.js, raceReport.js

---

## 10. [KRITIK] Tek bir gerçek işlem tüm raporu 'gerçek moda' kilitliyor; 37 botun kâğıt aktivitesi 'işlem yok'a dönüşüyor

**Kanit:**

```
botDailyReport/index.js:
```
const useReal = Array.isArray(realAgg) && realAgg.length > 0;
...
if (useReal) { for (const e of COMPETITORS) { const r = realFor(e); if (r && r.trades>0) {...} else lines.push(`<b>Bot ${e.no}</b> · ${esc(e.name)} — <i>işlem yok</i>`); } }
else { const comp = competitionManager.dailyBreakdown(sinceMs); ... }
```
Bugün TEK bir bot (Bot 2) gerçek deal ürettiyse `realAgg.length = 1 > 0` → useReal=true → `competitionManager.dailyBreakdown()` HİÇ ÇAĞRILMIYOR. Kâğıtta 10 sinyal üretmiş, 4 pozisyon açmış, 2'si SL olmuş bir bot rapora 'işlem yok' diye giriyor.
Bu yüzden rapor üç TAMAMEN FARKLI durumu aynı kelimeyle yazıyor: (1) hiç sinyal üretmedi, (2) sinyal üretti ama köprü emri açmadı, (3) emir açıldı ama sonucu deftere ulaşmadı.
```

**Kok neden:** 'Gerçek öncelikli' tasarım bot bazında değil RAPOR bazında uygulanmış — global bir latch. Kâğıt ve gerçek aynı satırda yan yana gösterilecek şekilde tasarlanmamış.

**Duzeltme:** useReal latch'ini bot bazına indir: her bot için `realFor(e)` yoksa `dailyBreakdown` satırını '(sanal)' etiketiyle bas. Satır formatı: `Bot N · İsim — gerçek: 3 işlem net +12$ | kâğıt: 5 sinyal, 4 pozisyon`. Gerçeği de kâğıdı da 0 olan bota 'sinyal yok' yaz, 'işlem yok' değil.

**Dosyalar:** index.js, competitionManager.js

---

## 11. [KRITIK] Köprünün atlama sebepleri (sembol_yok / zaten_acik / dusuk_rr / reopen_cooldown / beyin_red) backend'e HİÇ raporlanmıyor — bot bazında görünürlük sıfır

**Kanit:**

```
borsakrali_mt5_all.py run_once() sonu:
```
reasons = {}
def _bump(k): reasons[k] = reasons.get(k, 0) + 1
...
res = open_from_feed(cfg, s) or "bilinmiyor"
_bump(res)
...
atlanan = {k: v for k, v in reasons.items() if k not in ("acildi", "dry", "zaten_acik")}
log.info("📋 TUR ÖZETİ: feed %d · AÇILDI %d · zaten-açık %d%s", ...)
```
`reasons` sözlüğünde BOT/MAGIC BOYUTU YOK — yalnız sebep→adet. Ve tek çıktısı VPS'teki bridge_all.log dosyası; hiçbir yere POST edilmiyor.
open_from_feed()'in ürettiği sebep kümesi: hesap_kilidi, yasakli_sembol, dusuk_guven, kategori_disi, sembol_yok, piyasa_kapali, reopen_cooldown, zaten_acik_sembol, sembol_yogunlugu, fiyat_yok, gecersiz_stop, dusuk_rr, beyin_red:<neden>, beyin_ters_kapatma_hatasi, lot_sifir, beyin_emir_oncesi_red, no_money, algo_kapali + tur seviyesinde tavan_doldu / bot_tavani / guard_hafta_haber / stop_veya_gunluk_fren.
Bunlardan SADECE `beyin_red:*` yolu telemetri üretiyor: mt5_brain_adapter._reject(..., report=True) → _post_decision() → POST /api/bridge/state {decisions:[row]}. O da fire-and-forget: `return response.status_code == 200`, dönüş değeri kullanılmıyor, retry yok, kuyruk yok → 503 fırtınasında tamamen kayboluyor.
Backend tarafında karşılığı var ama boş: mt5TradeNotifier.observeDecisions() `state.decisions`'a yazıyor, auditStatus() `rejectedDecisions` sayısını veriyor — ancak GLOBAL sayı, bot kırılımı yok.
```

**Kok neden:** Köprü 'karar veren' taraf, backend 'raporlayan' taraf; ama karar gerekçeleri karar verilen yerde bırakılmış. Sinyal→emir hunisinin en bilgilendirici katmanı (neden emre dönüşmedi) hiçbir kalıcı deposu olmayan bir log satırı.

**Duzeltme:** Köprüye tur-sonu telemetri POST'u ekle: `POST /api/bridge/telemetry` gövdesi `{ tourId, ts, rows: [{ magic, botId, feed: n, opened: n, reasons: {dusuk_rr: 3, sembol_yok: 1, ...} }] }`. `_bump(res)` çağrısını `_bump(res, magic)` yap (bot boyutunu ekle). Endpoint muhasebe ucu olsun — Telegram'a bakmadan 200 dönsün, idempotent (tourId) olsun. `_post_decision`'ı da outbox'a al (mevcut broker_event_outbox altyapısı hazır) ki 503'te kaybolmasın.

**Dosyalar:** borsakrali_mt5_all.py, mt5_brain_adapter.py, bridge.routes.js, index.js

---

## 12. [KRITIK] Bildirim teslimi HTTP isteği içinde senkron: 40 satırlık yükte 12 sn timeout kaçınılmaz → 'Read timed out' + kalıcı 503

**Kanit:**

```
mt5TradeNotifier.deliver(): her kayıt için önce `await persistDurable()` (botPersistence.saveNow → Supabase Storage upload), sonra `await send(message)` (Telegram API), sonra tekrar `await persistDurable()`. Yani mesaj başına 2 Supabase upload + 1 Telegram çağrısı.
releaseOrderedLifecycle() bunu `limit = opens.length + closes.length` kere döngüye sokuyor — TÜM birikmiş defter üzerinde, sadece bu istekteki satırlar üzerinde değil.
borsakrali_account_brain.py POST timeout=12 (yorumda: '2026-07-30 VPS'te 8sn sahte Read timed out uretti'), mt5_brain_adapter outbox POST timeout=8.
40 açılış+kapanış × (2 upload + 1 Telegram) tek istekte 12 saniyeye sığmaz. Ayrıca Telegram kanal başına ~20 msg/dk sınırı → 429 → send() throw → `record.notification='failed'` → retryableFailures++ → 503.
Sonuç zinciri: yoğun gün → çok mesaj → timeout/429 → 503 → outbox kilidi → istatistik kaybı. Yani sistem TAM OLARAK en çok işlem yapılan günde kör kalıyor.
```

**Kok neden:** Teslimat kuyruğu yok. İstek-yanıt döngüsünün içinde sınırsız sayıda dış servis çağrısı yapılıyor ve isteğin başarısı bu çağrıların tamamının başarısına bağlanmış.

**Duzeltme:** 1) ingestState() yalnız defteri yazsın ve HEMEN 200 dönsün; teslimatı ayrı bir arka plan kuyruğu (setInterval drain, Telegram rate-limit'ine uygun ~1 msg/3sn) yapsın. 2) Her istekte teslim edilecek kayıt sayısına tavan koy (örn. 5) ve kalanı `pending` bırak — 503 yerine `200 {pending:n}`. 3) persistDurable()'ı mesaj başına değil batch sonunda çağır. 4) N'den fazla kapanış birikmişse tek özet mesaj at ('Bot 1 · 12 kapanış · net -840$') — 40 ayrı mesaj yerine.

**Dosyalar:** index.js, botPersistence.js, borsakrali_account_brain.py

---

## 13. [KRITIK] YARIS MODU beynin butun pozisyon ve risk tavanlarini kapatiyor — EURUSD 1.00 lot x7 bunun dogrudan sonucu

**Kanit:**

```
Kullaniciya verilen ZIP'in icindeki `mt5-bridge/config_all.json` dosyasinda `"race_mode": true` GOMULU geliyor (uretici: vps-paket-insa.ps1:61-62 `$all.race_mode = $true`), ve BASLAT.bat:159-169 bu degeri config.json / config_scanner.json / config_brain.json'a da isliyor. race_mode=true iken kapanan kapilar:

1) account_brain.py:442-444 — `if config.race_mode: same_asset, same_side, opposite = [], [], []` -> hemen altindaki `if same_side: return _reject("same_underlying_already_open_across_timeframes")` HIC calismaz. Ayni varlikta ayni yonde SINIRSIZ pozisyon acilabilir. `opposite` de bos oldugu icin ters-donus (CLOSE_AND_REVERSE) mantigi da olu.
2) account_brain.py:469-471 — `limits_usd = {"trade": equity * trade_risk_pct / 100.0}`; symbol_side / bot / portfolio / account / hard_account tavanlarinin HEPSI listeden cikarilir. Tek kalan sinir isleme-basina boyutlama.
3) account_brain.py:507 — `if not config.race_mode:` -> projeksiyon ihlali kontrolleri (symbol_side_hard_cap, bot_hard_cap, account_open_risk_cap) atlanir.
4) account_brain.py:769-771 — ayni varlikta ucus-halindeki rezervasyon serilestirmesi kapali; uc kopru ayni anda ayni sembolu acabilir.
5) borsakrali_account_brain.py:720 — `if cfg.get("race_mode") is not True:` -> beynin GLOBAL flatten kapilarindan open-risk-hard / symbol-side-risk-hard / bot-risk-hard uclusu atlanir.
6) borsakrali_mt5_all.py:393 — `max_per_symbol_side` yarista devre disi.
7) borsakrali_mt5_all.py:968-970 — `max_total = 0 if race`, `max_per_bot = 0 if race` (0 = sinirsiz).

Geriye kalan TEK dedup: borsakrali_mt5_all.py:380-384, ayni MAGIC'in ayni sembol+yonde ikinci pozisyonunu engeller (`zaten_acik_sembol`). 37+ bot oldugu icin bu, ayni anda 37 EURUSD long'a izin verir.

Canli kanitla birebir ortusuyor: EURUSD buy 1.00 lot 12:00 / 12:44 / 14:31 / 14:48 / 15:00 / 18:10 / 18:11 (7 farkli bot) ve ayni anda ACIK 4 EURUSD (0.46/0.29/0.27/0.23). Teminat 31.201,43 USD.
```

**Kok neden:** race_mode, kullanicinin "tum botlar islem alsin" istegini karsilamak icin (246dc4a, 169f894, 5491374) GIRIS SAYISI tavanlariyla birlikte RISK HAVUZU tavanlarini da kaldirdi. Isleme-basina %0,25 risk korunuyor ama N pozisyonun toplami sinirsiz: 197k ozvarlikta islem basi ~493$ risk x sinirsiz es-zamanli pozisyon.

**Duzeltme:** race_mode'u risk havuzundan AYIR: yalnizca `max_per_symbol_side` / `max_open_total` / `max_open_per_bot` (adet tavanlari) yarista kalksin; account_brain.py:469-471'deki `limits_usd` sozlugu ve 507'deki ihlal kontrolleri race_mode'dan MUAF olsun (portfolio/account/symbol_side risk yuzdeleri her zaman uygulansin). Ayrica ayni varlik+yon icin bir adet tavani (or. 3) yarista da kalsin. Acil pansuman: config_all.json'da `race_mode` -> false.

**Dosyalar:** account_brain.py, borsakrali_account_brain.py, borsakrali_mt5_all.py, vps-paket-insa.ps1, BASLAT.bat

---

## 14. [KRITIK] 3R/4R/5R hedefi emre YAZILIYOR ama pozisyonu beyin degil KAGIT defter kapatiyor (close_on_feed_drift) — hedef ve trail fiilen olu

**Kanit:**

```
HEDEF TARAFI SAGLAM (vaat dogrulandi):
- account_brain.py:360-368 `required_target_multiple()` -> 3.0; guc>=0.75 -> 4.0; guc>=0.90 -> 5.0; sonra `max(multiple, config.min_rr)`. Siralama dogru, 5R dali OLU DEGIL.
- mt5_brain_adapter.py:113-116 `requested_rr = _bounded(_value(cfg, "brain_min_rr", default=3.0), 3.0, 3.0, 5.0)`. Canli config_all.json'da `brain_min_rr` ANAHTARI YOK -> 3.0 taban. (Kopru configindeki `min_rr: 2.0` beyne KARISMIYOR, kod yorumu bunu acikca soyluyor.)
- borsakrali_mt5_all.py:445-448 `tp = round(max(tp, brain_tp) if is_long else min(tp, brain_tp), d)` -> TP yalniz UZAKLASIR; sonra satir ~475 `req = {... "tp": tp ...}`. Yani brokera giden TP gercekten >=3R.

CIKIS TARAFI HEDEFI EZIYOR:
- borsakrali_mt5_all.py:113 `"close_on_feed_drift": True` ve canli config_all.json'da `"close_on_feed_drift": true`.
- borsakrali_mt5_all.py:928-946: feed'de `code` ardisik `drift_confirm_turns=3` tur gorunmezse ve pozisyon `min_hold_minutes=20`'yi gectiyse -> `close_position(cfg, p, "competition-kapatti")` (PIYASA emri, TP/SL beklenmez).
- Feed'den dusme sebepleri (backend kagit defteri): competitionManager.js:577-578 kagit SL / kagit TP1 (SITE fiyatlariyla), :521 `signal_flip` (bot yon degistirince pozisyon ANINDA kapanir), :627 `opposite_signal`.
- Kagit TP1 = sinyalin kendi target1'i (~2R). Broker TP'si >=3R. Yani kagit hedef HER ZAMAN broker hedefinden DAHA YAKIN -> kazanan pozisyon, beynin hedefine varmadan once defterden dusuyor ve ~20-25 dk sonra piyasadan kapatiliyor.
- Bu zincir kodda ACIKCA tasarim olarak yaziyor: bannedPositionSweep.js:10-18 "1. kagit pozisyon kapatilir -> pozisyon bridgeFeed'den DUSER. 2. VPS'teki kopru ... close_on_feed_drift ile GERCEK MT5 pozisyonunu piyasa emriyle kapatir".
- Ekran kanitindaki kucuk kapanislar (+49, +102, -19, -46) 1.00 lotta 3R'nin (300-1500$ mertebesi) cok altinda; hicbiri TP'de kapanmamis.

KAPSAM: bu yalniz BIRLESIK kopruyu etkiliyor. config.example.json ve config_scanner.example.json'da `"close_on_backend_close": false` ve BASLAT.bat:76-92 bu ornekleri kopyaladigi icin adanmis forex/tarayici koprulerinde bu ezme YOK.
```

**Kok neden:** Iki ayri gerceklik var: (a) backend'in Yahoo fiyatiyla yurutulen kagit defteri, (b) broker fiyatiyla acilan gercek pozisyon. Kapatma otoritesi (a)'ya verilmis, hedef/trail otoritesi (b)'ye. Kagit defterin cikis kurallari (2R target1, signal_flip, opposite_signal) beynin 3R politikasindan haberdar degil.

**Duzeltme:** Beyin acikken drift-kapatma yalnizca 'yetim pozisyon temizligi' olmali, normal cikis yolu olmamali. Somut: (1) `mt5_brain_adapter.enabled(cfg)` true iken `close_on_feed_drift` varsayilani false olsun; (2) drift kapatmasi yalniz pozisyon >= X saat yasli VE beyin defterinde karsiligi yoksa calissin; (3) alternatif olarak backend feed'i, koprunun actigi pozisyon icin kagit TP1'e degil beynin uzattigi TP'ye gore kapansin (brain_plan.metadata['tp'] zaten kopruye donuyor — borsakrali_mt5_all.py:449-452). VPS logundan oran olcumu: `findstr /C:"competition-kapatti" bridge_all.log | find /c /v ""` ile toplam `findstr /C:"KAPATMA DOLUMU" | find /c /v ""` karsilastirilmali.

**Dosyalar:** borsakrali_mt5_all.py, account_brain.py, mt5_brain_adapter.py, competitionManager.js, bannedPositionSweep.js

---

## 15. [KRITIK] Gunluk rapor -74,51$ derken gercek -3.234,88$: tek teslim edilemeyen Telegram satiri butun kapanis defterini donduruyor

**Kanit:**

```
1) Beyin acikken kopru gercek sonuc beslemesini BILEREK BIRAKIYOR: borsakrali_mt5_all.py:748-753 `def report_real_results(cfg, force=False): ... if mt5_brain_adapter.enabled(cfg): return`. Yani realResults deposunun TEK yazicisi beyin daemon'u.
2) Daemon POST'u: borsakrali_account_brain.py:1325-1338 -> `POST /api/bridge/state`; `if response.status_code != 200: log.error(...); return False` — ve `state["notificationCursorSec"]` ILERLETILMEZ.
3) Backend 503 kosulu: bridge.routes.js:88-99 `if (lifecycle.retryableFailures > 0 || lifecycle.invalid > 0 || ... ) return res.status(503).json({... error: 'trade-notification-pending' ...})`. Yani TEK bir teslim edilemeyen Telegram satiri (retryableFailures=1) TUM partiyi basarisiz yapiyor.
4) `retryableFailures` uretim yerleri: mt5TradeNotifier/index.js:774 ve :867 — `if (await deliver(...)) ...; else retryableFailures++`.
5) Sonuc zinciri: 503 -> cursor donuyor -> ayni parti sonsuz tekrar -> sonraki kapanislar hic kayda girmiyor -> botDailyReport/index.js:36-40 `useReal` yalniz realResults'a dusen magic'leri gosteriyor, kalan 36 bot icin satir :73 `— islem yok` basiliyor.
6) Kullanicinin gece logu bunu birebir gosteriyor: `POST 503 trade-notification-pending, openNotified 0-3, skipped 20/40, retryableFailures 22 -> 2, Read timed out`.
7) Ayrica ayni tikaniklik ISLEM ACMAYI da kilitliyor: borsakrali_account_brain.py:1290-1295 (outbox doluysa POST'a bile gidilmez) ve mt5_brain_adapter.py:669-680 (`fail_closed:broker_lifecycle_report_stale`) + :700-705 (`fail_closed:broker_event_outbox_pending`). Sistem "muhasebe yok" ile "islem yok" arasinda salinim yapiyor.
```

**Kok neden:** Muhasebe (realResults ingest) ile bildirim (Telegram teslimati) ayni HTTP yanit koduna baglanmis. Backend gercekte `realResults.ingest()`'i 503 donmeden ONCE calistiriyor (bridge.routes.js:84-86), ama daemon 200 gormedigi icin cursor'u ilerletmiyor ve ilerideki kapanislari hic gondermiyor. Tek satirlik teslimat hatasi butun gunun defterini zehirliyor.

**Duzeltme:** Muhasebeyi bildirimden ayir: (a) backend, ingest basarili + yalniz Telegram teslimati basarisizsa 200 + `{success:true, telegramPending:n}` donsun, 503'u yalnizca `invalid > 0` veya `durabilityFailures > 0` icin sakla; (b) daemon tarafinda cursor'u 'ingest kabul edildi' bilgisine gore ilerlet (`response.json()['results']['ingested']`), Telegram kuyrugunu ayri retry etsin. Kisa vadede VPS'te `GET /api/bridge/audit?details=1` ile hangi satirin takildigini bul.

**Dosyalar:** bridge.routes.js, index.js, index.js, borsakrali_account_brain.py, borsakrali_mt5_all.py

---

## 16. [KRITIK] Kapanis defteri sirali-kilitlenme (head-of-line deadlock) ile durdu: tek Telegram hatasi tum gunun islemlerini rapordan siliyor

**Kanit:**

```
Zincir uctan uca dogrulandi: (1) borsakrali_mt5_all.py:761 `report_real_results` ve :830 `report_mt5_state` merkezi beyin acikken hemen `return` ediyor -> birlesik kopru siteyi ARTIK BESLEMIYOR, tek raporlayici beyin. (2) borsakrali_account_brain.py:1289-1296: `flush_broker_event_outbox(...)` sonrasi `if pending_opens: return False` -> acik-olay kuyrugunda TEK olay varsa kapanis payload'i hic POST EDILMIYOR. (3) mt5_brain_adapter.py:508-530: kuyruk yalnizca `response.status_code == 200` oldugunda temizleniyor; degilse lease birakilip 30sn sonra ayni batch tekrar deneniyor. (4) bridge.routes.js:90-99: `lifecycle.retryableFailures > 0` iken 503 `trade-notification-pending` donuyor; bu sayac `releaseOrderedLifecycle()` ile TUM state.opens/state.closes torbasi uzerinde her cagrida yeniden hesaplaniyor, yani KALICI/GLOBAL. (5) telegramService.js:53-66: `sendMessage` icinde 429/retry_after yonetimi ve hiz sinirlayici YOK, hata halinde sadece `{success:false}` donuyor -> `deliver()` retryableFailures++ . Kullanicinin 00:23-00:27 loglari birebir bu imzayi tasiyor: 'POST 503 trade-notification-pending, openNotified 0-3, skipped 20/40, retryableFailures 22 -> 2, Read timed out'. BAGIMSIZ ARITMETIK KANIT (loglardan bagimsiz): FTMO round-turn komisyon ~6$/lot; 552,32$ / 6$ = 92,05 round-turn lot. Rapordaki 18 islem HEPSI 1.00 lot olsa bile en fazla 18 x 6$ = 108$ komisyon uretir = gozlenenin %19,6'si. Yani komisyonun en az %80'ini ureten islemler deftere hic girmemis. Ayni sekilde rapor net -74,51$ diyor, gercek -3.234,88$ -> rapor gercegin %2,3'unu goruyor.
```

**Kok neden:** Rapor boru hatti KATI SIRALI (once acilis Telegram'i, sonra kapanis) ve sira ihlalini 'tum akisi durdur' ile cozuyor. Yaris modu ayni turda onlarca acilis uretince Telegram kanal hiz siniri (~20 mesaj/dk) kaciniilmaz sekilde asiliyor; hiz siniri yonetimi olmadigi icin bu kalici bir retryableFailure'a donusuyor ve tum defteri kilitliyor. `report_interval_seconds: 2` (borsakrali_account_brain.py:124) ile beyin tam durumu her 2 saniyede yeniden POST ediyor; backend her seferinde ayni sirali Telegram yuruyusune basliyor, cevap 12sn istemci timeout'unu asiyor ('Read timed out'), kopru bunu hata sayip 2sn sonra yeniden deniyor -> asla yakinsamayan retry livelock.

**Duzeltme:** 1) Muhasebeyi bildirimden AYIR: `realResults.ingest` zaten 503'ten once calisiyor (bridge.routes.js:87) - kapanis satirlarinin POST edilmesini Telegram basarisina BAGLAMA. borsakrali_account_brain.py:1293'teki `if pending_opens: return False` kaldirilip yerine 'acilis kuyrugu bekliyor' bayragi payload'a eklenmeli; kapanislar HER TURDA gitmeli. 2) bridge.routes.js 503'u yalnizca `invalid` (veri bozuk) icin dondursun; `retryableFailures` (Telegram gecici hatasi) 200 + `pendingNotifications: N` ile raporlansin - boylece cursor ilerler, defter kapanir, Telegram kendi kuyrugunda telafi eder. 3) telegramService.sendMessage'a 429 `retry_after` destegi + kanal basina token-bucket (>=1 mesaj/3sn) eklensin; bildirimler senkron HTTP istegi icinden CIKARILIP arka plan kuyruguna alinsin. 4) Yaris modunda pozisyon basina mesaj yerine 30-60sn'lik toplu ozet mesaji kullanilsin (60 islem/gun x 2 mesaj = 120 mesaj yerine ~30 ozet).

**Dosyalar:** borsakrali_account_brain.py, mt5_brain_adapter.py, borsakrali_mt5_all.py, bridge.routes.js, index.js, telegramService.js

---

## 17. [KRITIK] H1 DOGRULANDI: yaris modu TUM korelasyon/portfoy tavanlarini kaldirdi; geriye tek ara fren kalmadi - +5,5k / -3,2k salinimi bunun dogrudan matematigi

**Kanit:**

```
account_brain.py:442-444: `if config.race_mode: same_asset, same_side, opposite = [], [], []` -> ayni-underlying tekillik ve ters-yon mantigi TAMAMEN devre disi. account_brain.py:469-471: `limits_usd = {"trade": equity * trade_risk_pct / 100}` -> symbol_side / bot / portfolio / account / hard_account tavanlarinin HEPSI yok; hesap acik riski SINIRSIZ. account_brain.py:507 `if not config.race_mode:` -> projeksiyon ihlal kontrolleri de atlaniyor. borsakrali_account_brain.py:745-752: `_global_exit_reason` icinde openRisk %2 / symbol-side %0,5 / bot %0,5 sert tavanlari yaris modunda ATLANIYOR. borsakrali_mt5_all.py:393 max_per_symbol_side atlaniyor (commit 5491374), :968-970 max_open_total/max_open_per_bot 0 (commit 169f894). SAYISAL: risk_pct=0.25 x 197.497$ = islem basi 493,74$. Acik ekrandaki yigilma bunu dogruluyor: EURUSD x4 (0,46/0,29/0,27/0,23), XAUUSD x4, BTCUSD x3, ETHUSD x2 -> 16 pozisyon / 7 dayanak. Eski `same_underlying_one_position` kurali ile bu 7 pozisyon olurdu (2,3x yigilma). 4 EURUSD x 493,74$ = 1.975$ = eski sembol+yon tavaninin (%0,5 = 987$) 2 kati. 16-20 pozisyon x 493,74$ = 7.900-9.875$ = ozkaynagin %4,0-5,0'i = gunluk flatten esiginin (%4,25 = 8.512$) tamami. VARYANS MATEMATIGI (n=20, R=493,74$, sigma = R*sqrt(n + n(n-1)*rho)): rho=0 -> 2.208$ (%1,12); rho=0,5 -> 7.155$ (%3,62); rho=0,7 -> 8.349$ (%4,23); rho=1,0 -> 9.875$ (%5,00). Etkin bagimsiz bahis sayisi N_eff = n/(1+(n-1)rho) = 20/14,3 = 1,40 -> 20 pozisyon aslinda 1,4 bahis. Gozlenen +5.500$ ve -3.235$ degerlerinin IKISI DE rho=0,7 dagiliminin 1-sigma bandi icinde. ELEME KANITI: Masaustundeki 07-30 00:31 ZIP'i ile 07-31 ogleden onceki VPS kodu birebir ayni (asagidaki bulguya bakiniz) -> iki gun arasinda TEK fark piyasa; yani sign flip'in kaynagi kod degil, kaldirilmis cesitlendirme.
```

**Kok neden:** 38 bot 38 bagimsiz strateji DEGIL: katalogda 10 ICT botu + 2 ICT kombosu tek metodolojinin varyantlari, 7-8 trend/momentum botu (trend, momentum, cloud, turtle, squeeze, tsmom, holygrail, combo-trend) tek faktor, uzerine `consensus-radar` tanimi geregi >=3 bot ayni yonde anlastiginda aciyor - yani korelasyonun EN YUKSEK oldugu anda 1.0-korelasyonlu bir pozisyon daha ekliyor. Enstruman evreni ise yalnizca 8-13 sembol ve bunlarin cogu tek bir USD/risk-on faktorune bagli. Korelasyon tavanlari bu yapisal gercegin TEK savunmasiydi; yaris modu onu kaldirdi. Beklenen deger degismedi (maliyet yuzunden dustu), yalnizca standart sapma ~3,8-4,5x buyudu.

**Duzeltme:** Yaris modunu 'tum tavanlari kaldir' yerine 'tavanlari faktor bazina tasi' olarak yeniden tanimla: (a) KORELASYON TAVANI kalsin ama sembol yerine FAKTOR bazli olsun - {USD-majors}, {kripto-beta}, {endeks-beta}, {altin} kovalari; kova basina acik risk <= %0,5, toplam acik risk sert tavan <= %2,0 (yani account_brain.py:469-471'deki race_mode dali `symbol_side` yerine `factor_bucket` limiti ile doldurulsun, portfolio/account tavanlari ASLA kaldirilmasin). (b) Ayni dayanakta en fazla 2 pozisyon (farkli TF), ayni yonde. (c) `consensus-radar` yeni pozisyon acmasin, mevcut pozisyonlarin lotunu artirsin (cift sayim yerine olcekleme). (d) Ara fren ekle: %1,0 gunluk zararda yeni giris DUR (bugunku tek ara fren %1,5 ve hasarin %93'unden sonra devreye giriyor).

**Dosyalar:** account_brain.py, borsakrali_account_brain.py, borsakrali_mt5_all.py, catalog.js

---

## 18. [YUKSEK] `magic <= 0` ön-süzgeci manuel/stop-out kapanışlarını tamamen düşürüyor; magic kurtarma kodu ULAŞILAMAZ

**Kanit:**

```
borsakrali_account_brain.py:1194-1202 —
```
for deal in deals:
    if not _is_close_deal(deal) or int(getattr(deal, "magic", 0) or 0) <= 0:
        continue
    ...
    candidates.setdefault(position_ticket, []).append(deal)
```
Ama 1225-1231'de zaten bir kurtarma var:
```
magic = int(getattr(latest, "magic", 0) or 0)
if magic <= 0:
    magic = next((int(getattr(d,"magic",0) or 0) for d in lifecycle if int(getattr(d,"magic",0) or 0) > 0), 0)
```
Bu kurtarma ÖLÜ KOD: pozisyon 1195'teki ön-süzgeç yüzünden `candidates`'a hiç girmediği için 1204'teki döngüye ulaşamaz.

MT5'te manuel kapatma (mobil uygulama), stop-out ve `pozisyon_temizle.py` kaynaklı OUT deal'leri magic=0 taşır; giriş deal'i magic 5702/550055 olsa bile pozisyon deftere HİÇ girmez.
```

**Kok neden:** Süzgeç yanlış katmanda: 'bot işlemi mi?' sorusu DEAL seviyesinde sorulmuş, oysa doğru soru POZİSYON seviyesinde ('bu pozisyonun yaşam döngüsünde magic>0 bir deal var mı?'). Kapanış emrinin magic'i giriş emrininkinden bağımsızdır.

**Duzeltme:** 1195'teki magic süzgecini kaldır (yalnız `_is_close_deal` kalsın); pozisyon seviyesindeki 1225-1231 kurtarması zaten magic>0 yoksa `continue` ediyor (1230-1231), dolayısıyla manuel/hesap dışı işlemler yine dışarıda kalır ama bot pozisyonunun manuel kapanışı artık yakalanır:
```
if not _is_close_deal(deal):
    continue
```

**Dosyalar:** borsakrali_account_brain.py

---

## 19. [YUKSEK] Telegram teslimatı senkron, geri-çekilmesiz ve sınırsız → 429 yağmuru → 12sn timeout → sonsuz yeniden POST livelock'u

**Kanit:**

```
telegramService.js:53-64 — tek `axios.post`, `timeout: 15000`, retry/backoff/rate-limit kuyruğu YOK; 429 doğrudan `{success:false}` döner.
mt5TradeNotifier/index.js:551-553 — `success !== true` → `throw` → `deliver()` 589-594'te `notification='failed'` + `retryableFailures++`.
mt5TradeNotifier/index.js:649-662 `releaseOrderedLifecycle()` — dış döngü `limit = opens.length + closes.length`, her iterasyonda `releaseWaitingOpens()` + `releaseWaitingCloses()` TÜM bekleyen kayıtları yeniden tarıyor (O(n²) Telegram denemesi).
mt5TradeNotifier/index.js:569 ve 582 — mesaj BAŞINA iki kez `persistDurable()` (tam state diske + Supabase kuyruğuna).
borsakrali_account_brain.py:1334 `timeout=12`, config_brain.example.json:62 `report_interval_seconds: 2`.

Sonuç: 40 bekleyen kayıt × 15sn Telegram timeout ≫ 12sn HTTP timeout → beyin her seferinde 'Read timed out' alır (canlı logda var), 2 saniye sonra AYNI yükü tekrar POST eder; backend hâlâ öncekini işliyordur. Kuyruk asla boşalmaz → bulgu 1 kalıcı hale gelir.
```

**Kok neden:** Telegram bir 'best-effort bildirim' değil, senkron HTTP yanıtının parçası yapılmış. Telegram kanal limiti (~20 msg/dk) 60+ işlem × 2 mesaj (açılış+kapanış) yükünü kaldıramaz; sistemde hız sınırlayıcı, backoff, kuyruk ve 'kısmi başarı' kavramı yok.

**Duzeltme:** Minimal (backend): `ingestState` içinde Telegram gönderimini yanıt yolundan çıkar — kayıtları `pending` işaretleyip ayrı bir zamanlanmış işleyiciye (saniyede ≤1 mesaj, 429'da `retry_after` kadar bekleyen) devret; `/state` yalnız `invalid` durumunda 503 dönsün, `retryableFailures` 200 gövdesinde bilgi olarak taşınsın. Bu tek değişiklik bulgu 1'in tetikleyicisini de ortadan kaldırır.
Minimal (köprü): borsakrali_account_brain.py:1334 `timeout=12` → 30 ve `report_interval_seconds` uyumlu üst sınır ekle ki aynı yük eşzamanlı iki kez uçuşta olmasın.

**Dosyalar:** telegramService.js, index.js, borsakrali_account_brain.py

---

## 20. [YUKSEK] `MT5_TRADE_NOTIFY_DISABLED=1` bir bildirim anahtarı değil, tam bir DEFTER kill-switch'i

**Kanit:**

```
mt5TradeNotifier/index.js:767-771 (açılış) ve 860-864 (kapanış) —
```
if (notificationsDisabled()) {
  record.notification = 'failed'; record.lastError = 'MT5_TRADE_NOTIFY_DISABLED'; skipped++;
  retryableFailures++;      // <-- 503 üretir
  ...
}
```
Ayrıca 604, 629, 754, 849'da da aynı `retryableFailures++`.
→ bridge.routes.js:90-99 DAİMA 503 → mt5_brain_adapter.py:513-530 outbox asla boşalmaz → borsakrali_account_brain.py:1292-1295 `_report_state` DAİMA erken döner → hiçbir kapanış deftere girmez.

Bu, MEMORY'deki 2026-07-24 kararı ('mt5TradeNotifier açılış duyurusu kapatıldı') ile doğrudan çelişen bir tuzak: bildirimi susturmak istemek muhasebeyi öldürüyor.
```

**Kok neden:** 'Bildirim kapalı' durumu, 'teslimat başarısız, tekrar dene' durumuyla aynı sayaca yazılmış. Kapalılık kalıcı bir konfigürasyondur; retryable DEĞİLDİR.

**Duzeltme:** `notificationsDisabled()` dallarında `retryableFailures++` satırlarını kaldır ve kaydı `record.notification = 'suppressed'` yap (audit'te `pendingNotifications`'a girmesin, 911. satırdaki `['pending','failed']` listesine dahil olmasın). Böylece `/state` 200 döner, outbox boşalır, defter tutulmaya devam eder, sadece Telegram susar.

**Dosyalar:** index.js, bridge.routes.js

---

## 21. [YUKSEK] trade_guard'ın 0,15 lot tavanı canlıda ULAŞILAMAZ — beyin açıkken lot hiç clamp_lot'tan geçmiyor

**Kanit:**

```
Üç köprünün üçünde de aynı desen var:
  borsakrali_mt5_all.py satır 422-454: `if mt5_brain_adapter.enabled(cfg): ... lot = brain_plan.lot` / `else: lot = compute_lot(cfg, s, info, price, sl)`
  borsakrali_mt5.py satır 407 / 417: `lot = brain_plan.lot` vs `lot = compute_lot(...)`
  borsakrali_mt5_scanner.py satır 427 / 437: `lot = brain_plan.lot` vs `lot = snap_lot(s.get("lots"), info, cfg)`
`trade_guard.clamp_lot` YALNIZCA compute_lot (borsakrali_mt5_all.py:327, borsakrali_mt5.py:249) ve snap_lot (borsakrali_mt5_scanner.py:228) içinde çağrılıyor — yani sadece `else` dalında. brain_plan.lot hiçbir yerde yeniden clamp edilmiyor.

mt5_brain_adapter.enabled() satır 42-52:
```
if cfg.get("dry_run") is not True:
    return True
return cfg.get("central_brain_enabled") is True
```
Canlıda (dry_run=false) HER ZAMAN True döner. Dolayısıyla `else` dalı = eski 0,15/0,20 tavanlı yol canlıda hiç çalışmaz; LOT_LEGACY_HARD_MAX=0.15 (trade_guard.py:92) ölü koddur.

BEYNİ ATLAYAN YOL VAR MI: HAYIR. dry_run/enabled/central_brain_enabled hiçbir kombinasyonu canlıda beyni devre dışı bırakamıyor — `enabled()` bilinçli olarak fail-safe. Ayrıca borsakrali_mt5_all.py:172-173 `central_brain_enabled` JSON boolean değilse config'i reddediyor.

AMA GİZLİ TUTARSIZLIK: trade_guard.lot_cap_for (satır 114-147) kapıyı farklı okuyor: `brain_on = cfg.get("central_brain_enabled") is True`. Canlı forex config'i (mt5-bridge/config.json) bu anahtarı HİÇ İÇERMİYOR (dry_run=false, max_lot=1.1, lot_max=1.1, risk_pct_max=1.0, min_rr=0.7, max_portfolio_risk_pct=6.0 — beyin öncesi eski dosya). Yani aynı config için mt5_brain_adapter "beyin AÇIK" (1.00 lot'a kadar), trade_guard "beyin KAPALI" (0,15 tavan) diyor. Bugün zararsız çünkü clamp_lot çağrılmıyor; ama iki modülün gerçeklik tanımı çelişkili.
```

**Kok neden:** Merkezî beyin eklenirken lot otoritesi tek noktaya (beyin) taşındı ve savunma-derinliği katmanı (clamp_lot) devreden çıkarıldı. Böylece 0,15 -> 1,00 geçişi tek bir sabitin (LOT_BRAIN_HARD_MAX) değişmesiyle 6,7 kat büyüme yarattı ve ikinci bir kontrol kalmadı.

**Duzeltme:** 1) Beyin lotunu da savunma amaçlı clamp'ten geçir: `lot = trade_guard.clamp_lot(brain_plan.lot, info, s, cfg)`; sonuç brain_plan.lot'tan küçükse işlemi reddet (sessiz küçültme değil, açık RED — aksi halde beynin risk/ödül hesabı bozulur). 2) lot_cap_for'daki kapıyı mt5_brain_adapter.enabled(cfg) ile birebir aynı yap. 3) mt5-bridge/config.json'daki beyin-öncesi anahtarları (max_lot 1.1, lot_max 1.1, risk_pct_max 1.0, min_rr 0.7, max_portfolio_risk_pct 6.0) temizle — yanıltıcı.

**Dosyalar:** trade_guard.py, borsakrali_mt5_all.py, borsakrali_mt5.py, borsakrali_mt5_scanner.py, config.json

---

## 22. [YUKSEK] select_account_tier / ACCOUNT_TIERS lot tavanı için ÖLÜ KOD — 200k hesapta tier=200.000 döner ama lota etkisi sıfır

**Kanit:**

```
account_brain.py:28 `ACCOUNT_TIERS = (10_000, 25_000, 50_000, 100_000, 200_000)`; satır 332-336 `select_account_tier` en yakın tier'i döndürüyor.
Kullanım yerlerinin TAMAMI (grep 'tier' -> satır 238, 412-413, 418-576, 616-617) yalnızca `PreTradeDecision(tier=tier)` alanını doldurmak için. `_account_guard(snapshot, config, tier)` tier'i sadece geri yazıyor, hiçbir eşiği ölçeklemiyor.

200.732 $ başlangıç bakiyesi -> select_account_tier -> **200.000** (en yakın tier). Bu değer:
  - risk_budget hesabına girmiyor (limits_usd equity yüzdesinden geliyor)
  - spec.volume_max'a girmiyor (_symbol_spec cfg'den statik 1.0 okuyor)
  - hiçbir dolar/lot tavanını değiştirmiyor

İsim tuzağı: mt5_brain_adapter._symbol_spec satır 588-589 `account_tier_max_lot` anahtarını okuyor — adı "tier'e göre lot tavanı" diyor ama tier'den TÜRETİLMİYOR; config'ten gelen sabit bir sayı, üstelik `min(1.0, ...)` ile yalnız aşağı çekilebiliyor. config_all.example.json / config_brain.example.json / config_scanner.example.json / config.example.json ve altin-botu/config.example.json'un hepsinde değer 1.0.

SONUÇ: hesap 10.000 $ -> 200.000 $'a çıktığında işlem başı risk 25 $ -> 494 $ (19,7 kat) büyüdü, lot tavanı ise 1.00'de sabit kaldı; tier mekanizması ne büyümeyi frenledi ne de yönlendirdi.
```

**Kok neden:** Tier kavramı tasarlanmış (sabit + fonksiyon + config anahtar adı) ama boyutlama zincirine hiç bağlanmamış. Geriye yalnızca rapor etiketi kalmış; okuyan kişi "tier lot tavanını yönetiyor" sanıyor.

**Duzeltme:** _symbol_spec'i tier'den türet: `tier = account_brain.select_account_tier(start_balance)` ve `absolute_lot_cap = min(float(cfg.get('account_tier_max_lot', 1.0)), TIER_LOT_CAP[tier])` — örn. {10k:0.10, 25k:0.20, 50k:0.35, 100k:0.60, 200k:1.00}. Alternatif/ek olarak tavanı doğrudan dolar cinsinden koy (bkz. max_initial_risk_usd bulgusu) ki tier tablosu bakım yükü olmasın. Bağlanmayacaksa select_account_tier/ACCOUNT_TIERS'ı sil ve `account_tier_max_lot`u `absolute_lot_cap` olarak yeniden adlandır — yanlış güven veriyor.

**Dosyalar:** account_brain.py, mt5_brain_adapter.py

---

## 23. [YUKSEK] Kapananlarda 1.00 / açıklarda kesirli farkı aynı motorun ters-seçilim imzası: tavan tam da riskin düşük olduğu dar-stop işlemlerini maksimize ediyor

**Kanit:**

```
Formül gereği lot ile stop ters orantılı: `lot = min(1.00, butce / loss_per_lot)`. Yani DAR stop -> tavana çarpar (1.00), GENİŞ stop -> kesirli kalır.
Dar stop = düşük TF (M5/M15/H1) = en hızlı SL. Geniş stop = yüksek TF (H4/D1) = hâlâ açık. Bu yüzden KAPANAN listesi 1.00 lot ile, AÇIK listesi kesirli lotlarla doluyor — farklı motor veya config değişimi değil, aynı gün aynı motor.

AÇIK LOTLARDAN GERİYE HESAP (butce 493,74 $ ile ima edilen 1-lot zararı = stop mesafesi):
  EURUSD 0,46 -> 1.073 $ -> ~107 pip stop (D1)   | 0,29 -> 1.703 $ -> ~170 pip | 0,23 -> 2.147 $ -> ~215 pip
  BTCUSD 0,44 -> 1.122 $ stop | 0,32 -> 1.543 $ | 0,30 -> 1.646 $  (BTC ~110k'da %1-1,5 = tipik H1/H4)
  US100  0,40 -> 1.234 puan stop (D1)
  GBPUSD 0,21 -> 2.351 $ -> ~235 pip (D1/W1)
  XAUUSD 0,10 -> 49,4 $ altın stop | 0,09 -> 54,9 $ | 0,06 -> 82,3 $ (H4/D1 altın stopları — tutarlı)
Hepsi beyin formülüyle birebir örtüşüyor.

KRİTİK SONUÇ: 1.00 lot işlemler bütçenin ALTINDA risk taşıyor (EURUSD 28,7 pip -> 287 $ < 493,74 $). Kesirli lotlular ise TAM BÜTÇE taşıyor. Nitekim en büyük tek kayıplardan biri kesirli: BTCUSD 0,44 -379,89 $ (planlanan riskin ~%86'sı). Yani tavan, koruduğu yerde zaten gereksiz; korunması gereken geniş-stoplu/pahalı sembollerde hiç devreye girmiyor.

AYRI MOTOR UYARISI (XAUUSD): altin-botu ayrı bir motor ve lot tavanı 10 kat daha sıkı — vps-paket/altin-botu/core/risk.py satır 126-128 `safety_cap = safety.max_manual_lot (0.10)` ve `vmax = min(vmax, max(vmin, safety_cap))`, core/config.py satır 177 `_bounded_float(safety.max_manual_lot, 0.10, 0.01, 0.10)` — auto modda bile 0,10 lot'u ASLA aşamaz. Dolayısıyla XAUUSD 1.00 lot -414,90 $ işlemi altın botundan GELEMEZ; köprü/beyin yolundan gelmiştir. Aynı sembolde, aynı hesapta, 10 kat farklı iki tavan çalışıyor.
```

**Kok neden:** Boyutlama tek değişkene (stop mesafesi) bağlı ve tavan lot cinsinden. Bu, sistemi "stop ne kadar darsa o kadar büyük lot" davranışına kilitliyor; dar stop aynı zamanda en yüksek stop-out olasılığı demek olduğundan büyüklük ile kayıp olasılığı pozitif korele hale geliyor.

**Duzeltme:** Dolar-risk tavanı (max_initial_risk_usd) her iki tarafı da düzeltir: dar stopta lot yine 1.00 olabilir ama risk 100 $'da kilitlenir, geniş stopta da 494 $ yerine 100 $ risk alınır. Ek olarak stop mesafesi için ATR tabanlı alt sınır koy (stop < 0.5×ATR ise girişi REDDET) — dar-stop/büyük-lot kombinasyonunu kaynağında keser. Ayrıca altin-botu ile köprü/beyin arasında XAUUSD için tek bir ortak tavan tanımla; şu an iki motor birbirinden habersiz aynı sembolde pozisyon açıyor.

**Dosyalar:** account_brain.py, risk.py, config.py

---

## 24. [YUKSEK] 15 $ TABAN var, TAVAN yok: aynı BrainConfig hem 15 $ hem 494 $ riski "geçerli" sayıyor (32,9 kat aralık)

**Kanit:**

```
account_brain.BrainConfig satır 78-79: `min_expected_profit_usd: float = 15.0`, `min_initial_risk_usd: float = 15.0`.
__post_init__ satır 136: `if self.min_expected_profit_usd < 15 or self.min_initial_risk_usd < 15: raise ValueError("entry TP and initial-risk dollar floors cannot be below $15")` — yalnız TABANI koruyor.
evaluate_pretrade satır 489-492: `if risk_usd < config.min_initial_risk_usd: return _reject("safe_lot_initial_risk_below_minimum_no_upsize")` ve `if reward_usd < config.min_expected_profit_usd: return _reject("expected_profit_below_minimum")` — ikisi de ALT kontrol; simetrik bir üst kontrol yok.

SAYISAL AÇIKLIK: geçerli risk aralığı [15,00 $ ; 493,74 $] = **32,9 kat**. Aynı config, aynı gün, aynı bot iki işlem açabiliyor: biri 15 $ riskle, diğeri 494 $ riskle. Beyin ikisini de "risk_checks_passed" diyor.

Üstelik min_rr=3.0 politikası (satır 358-364 required_target_multiple: 3R, guc>=0.75 -> 4R, guc>=0.90 -> 5R) 494 $'lık riski 1.481-2.469 $'lık hedefe bağlıyor. Yani tek işlemin hedef genliği 197k hesapta 2.469 $ = %1,25. Böyle 50-60 işlem/gün varyansı yönetilemez hale getiriyor: kullanıcının "dün +5-6 bin, bugün -3 bin" gözlemi tam olarak bu genliğin istatistiksel imzası.

Doğrulayıcı grep: `max_initial_risk_usd|max_risk_usd|max_trade_risk_usd|risk_usd_cap` -> mt5-bridge/*.py ve backend/src'de 0 sonuç.
```

**Kok neden:** Politika "kuruş işlem açma" problemini çözmek için tasarlanmış (15 $ tabanı, churn önlemi) ve "dev işlem açma" problemi hiç ele alınmamış. Küçük hesapta yüzde tabanlı tavan doğal olarak küçük kaldığı için eksiklik görünmüyordu; hesap 200k olunca ortaya çıktı.

**Duzeltme:** BrainConfig'e simetrik tavanlar ekle: `max_initial_risk_usd` (varsayılan 100, config yalnız DÜŞÜREBİLİR — repo'nun tek-yönlü güvenlik deseniyle uyumlu) ve doğrulama `if self.max_initial_risk_usd <= self.min_initial_risk_usd: raise`. evaluate_pretrade'de _safe_lot öncesi bütçeyi kırp; kırpma sonrası risk hâlâ min_initial_risk_usd altına düşerse REDDET. Böylece geçerli aralık [15 $, 100 $] = 6,7 kat olur ve tek işlem -414,90 $ matematiksel olarak imkânsız hale gelir.

**Dosyalar:** account_brain.py

---

## 25. [YUKSEK] Telegram -74,51 $ derken hesap -3.234,88 $: tek teslim edilemeyen açılış olayı TÜM kapanış raporunu bloke ediyor, rapor sessizce KAĞIT deftere düşüyor

**Kanit:**

```
1) HEAD-OF-LINE BLOKAJ — borsakrali_account_brain.py `_report_state` satır 1290-1296:
```
mt5_brain_adapter.flush_broker_event_outbox(cfg, logger=log)
pending_opens = mt5_brain_adapter.broker_event_outbox_count(cfg)
if pending_opens:
    log.error("%s broker acilis olayi kuyrukta; kapanis raporu sirayi korumak icin beklendi", pending_opens)
    return False
```
TEK bir teslim edilemeyen açılış olayı, o turdaki TÜM kapanış satırlarının backend'e gitmesini engelliyor.

2) TÜMÜ-YA-HİÇ 503 — backend/src/routes/bridge.routes.js satır 89-98: `if (lifecycle.retryableFailures > 0 || lifecycle.invalid > 0 || ... ) return res.status(503).json({ error: 'trade-notification-pending' })`. 40 satırın 38'i başarılı olsa bile tüm parti 503 dönüyor.

3) `_report_state` satır 1337-1339: `if response.status_code != 200: log.error(...); return False` -> `state["notificationCursorSec"]` İLERLEMİYOR, aynı satırlar sonsuz tekrar ediliyor.

4) KULLANICI LOGLARI birebir örtüşüyor: "POST 503 trade-notification-pending, openNotified 0-3, skipped 20/40, retryableFailures 22 -> 2, Read timed out" (00:23-00:27). skipped sayacı backend/src/services/mt5TradeNotifier/index.js satır 823-848'de `record.notification === 'historical'` ve `'outside-notification-freshness-window'` durumlarını sayıyor — yani kapanmış gerçek işlemler "tarihsel" damgasıyla bildirimden düşürülüyor.

5) SESSİZ GERİ DÜŞÜŞ — backend/src/services/botDailyReport/index.js satır 38-44: `const useReal = Array.isArray(realAgg) && realAgg.length > 0;` ve etiket `useReal ? '🟢 GERÇEK MT5' : '⚪ sanal (henüz gerçek veri yok)'`. realResults hiç beslenemediği için useReal=false olmuş ve rapor KAĞIT (competition) defterini yazmış: Bot 2 +12,77 $, Bot 37 -87,28 $, kalan 36 bot "işlem yok", toplam 18 işlem / -74,51 $.

6) EK YAN ETKİ: mt5_brain_adapter.evaluate satır 700-705 outbox doluyken yeni girişleri de `fail_closed:broker_event_outbox_pending` ile reddediyor — yani aynı arıza hem raporu kör ediyor hem girişleri kilitliyor.
```

**Kok neden:** Yaşam-döngüsü raporlaması sıkı sıralı (strict-ordered) ve tümü-ya-hiç tasarlanmış; tek bir kalıcı hatalı satır hem kuyruğu hem raporu süresiz kilitliyor. Ayrıca günlük rapor gerçek veri yokluğunda UYARMADAN kağıt deftere düşerek yanlış bir güven veriyor — kullanıcı -3.234 $ kaybederken -74,51 $ okudu.

**Duzeltme:** 1) /api/bridge/state kısmi başarı dönsün (207 benzeri): başarılı satırlar kabul edilip cursor ilerlesin, yalnız hatalı ticket'lar kuyrukta kalsın. 2) `_report_state`'teki `if pending_opens: return False` blokajını satır bazlı yap — bekleyen AÇILIŞ olayı yalnız o ticket'ın kapanışını beklesin. 3) Outbox satırlarına ölüm-mektubu (dead-letter) eşiği + Telegram alarmı ekle (örn. 10 tur sonra). 4) botDailyReport gerçek veri yokken KAĞIT rakam yayınlamasın; onun yerine "GERÇEK MT5 verisi alınamadı — rapor yok" alarmı bassın (sessiz geri düşüş yanlış güven veriyor). 5) Günlük raporu MT5 hesap özeti (kapanan kâr/swap/komisyon toplamı) ile mutabakata bağla; sapma > %5 ise alarm.

**Dosyalar:** borsakrali_account_brain.py, bridge.routes.js, index.js, index.js, mt5_brain_adapter.py

---

## 26. [YUKSEK] Bot bazında gerçek durum tablosu (38 yarışmacı + 2 destek)

**Kanit:**

```
catalog.js (40 kayıt) + competitionManager.bridgeFeed() + realResults/store.js CATALOG_BY_MAGIC + botDailyReport/index.js build() birlikte okunduğunda botlar 5 sınıfa ayrılıyor:

A) GERÇEK EMİR AÇAR, KENDİ KÖPRÜSÜ VAR, İSTATİSTİĞİ KENDİ KÖPRÜSÜNDEN GELMEZ (2 bot):
  Bot 1 forex-signals magic 5701 / dedicatedBridgeMagic 550055 — borsakrali_mt5.py yalnız GET /api/forex/positions, POST /api/forex/closed, POST /api/forex/broker-prices çağırır (grep 'api/' borsakrali_mt5.py = 3 uç). /api/forex/closed → forexTracker.dropClosed(), realResults'a HİÇ yazmaz.
  Bot 5 mt5-scanner magic 5705 / 550066 — borsakrali_mt5_scanner.py yalnız GET /api/mt5-scanner/positions + POST /api/forex/broker-prices. KAPANIŞ POSTU HİÇ YOK.
  Bu ikisi bridgeFeed({forExecution:true})'da `if (forExecution && entry.dedicatedBridgeMagic) continue;` ile birleşik köprüden de çıkarılmış. Yani gerçek sonuçları YALNIZ borsakrali_account_brain.py üzerinden gelebilir.
  config.json (550055): lot_mode risk, lot_min 0.1, lot_max 1.1, max_lot 1.1, risk_pct 0.5–1.0, symbols = BTCUSD/ETHUSD/XRPUSD/SOLUSD/XAUUSD/XAGUSD/US100.cash/US500.cash/EURUSD/GBPUSD/USDJPY/AUDUSD/USDCAD/USDCHF/NZDUSD — ekran görüntüsündeki 1.00 lot sembol kümesiyle BİREBİR aynı.

B) GERÇEK EMİR AÇAR (birleşik köprü, magic 57xx) — 30 bot:
  Bot 2 pro-robot 5702, Bot 3 gold-signals 5703, Bot 4 beast 5704, Bot 6 crypto 5706, Bot 7 mtf 5707, Bot 12 wave-scan 5712, Bot 13 nr7 5713, Bot 14 ict-fvg 5714, Bot 15 ict-smc 5715, Bot 16-19 mt5-trend/momentum/reversion/cloud 5716-5719, Bot 20-27 ICT ailesi 5730-5737, Bot 28-29 combo 5738-5739, Bot 30-32 turtle/squeeze/rsi2 5740-5742, Bot 34 tsmom 5744, Bot 36 evolver 5748, Bot 37 consensus 5749, Bot 38 bk-xau 5750/5751.

C) YAPISAL OLARAK ASLA GERÇEK İŞLEM AÇAMAZ (mt5Tradeable:false) — 6 bot:
  Bot 8 bist-signals 5708, Bot 9 crossover 5709, Bot 10 tema34 5710, Bot 11 bist-buy-scanner 5711, Bot 33 mt5-london 5743, Bot 35 mt5-holygrail 5745.
  bridgeFeed'de `if (entry.mt5Tradeable === false) continue;` → bunlar GERÇEK modda HER ZAMAN 'işlem yok' yazar. Rapor bunu 'yasak' diye ayırt etmiyor, 'işlem yok' diyor.

D) PANEL FİLTRESİYLE YARISI SAHADAN SİLİNMİŞ — 1 bot:
  Bot 38 bk-xau. backend/src/data/bot-builder/state.json → botSettings = {"bk-xau":{"timeframes":["5m"]}}. bridge.routes.js /positions içindeki `builderStore.tfAllowed(p.botId, tf)` süzgeci 30m swing bacağını (magic 5751) feed'den atıyor.

E) DESTEK (numarasız, işlem yasak) — 2: news-warning, account-report.

YEREL YARIŞ DEFTERİ KANITI (backend/src/data/bot-competition/registry.json, updatedAt 2026-07-23 — bayat ama yön gösterici): maste
```

**Kok neden:** Katalog tek bir 'magic' alanı üzerinden 3 farklı yürütme yolunu (birleşik köprü / adanmış köprü / çok-motorlu magicByStrategy) temsil ediyor, ama sonuç toplama yolu yalnız BİR tanesi için (beyin daemon'u) kurulmuş. Adanmış köprüler kendi kapanışlarını muhasebeye hiç bildirmiyor.

**Duzeltme:** 1) borsakrali_mt5.py ve borsakrali_mt5_scanner.py'ye report_real_results() eşdeğeri ekle: kendi magic'lerinin (550055/550066) DEAL_ENTRY_OUT kayıtlarını POST /api/bridge/results ile yolla — /api/forex/closed muhasebe ucu DEĞİL, sadece tracker senkron ucudur. 2) Rapor satırlarına durum etiketi ekle: 'işlem yok' yerine 'MT5 dışı (BIST)', 'gölge/terfi bekliyor', 'TF filtresi kapalı', 'sinyal yok', 'sinyal var-emir yok' ayrımı. 3) bk-xau TF filtresini 5m+30m yap ya da magicByStrategy'li botları TF süzgecinden muaf tut.

**Dosyalar:** catalog.js, competitionManager.js, bridge.routes.js, forex.routes.js, borsakrali_mt5.py, borsakrali_mt5_scanner.py

---

## 27. [YUKSEK] Günlük bot raporu 20:15 TR'de çalışıyor; 20:15–00:00 arası kapanan işlemler HİÇBİR günlük rapora girmiyor

**Kanit:**

```
cronJobs.js: `const botDailyReportJob = cron.schedule('15 20 * * *', ...)`.
botDailyReport.run(): `const sinceSec = Math.floor(trDayStartMs(nowMs) / 1000);` → pencere [bugün 00:00 TR, rapor anı].
Ertesi gün rapor çalıştığında sinceSec ertesi günün 00:00'ına atlıyor → dünkü 20:15–23:59 kapanışları hiçbir günlük bot raporunda görünmüyor, kalıcı olarak kayıp.
Karşılaştırma: raceReportJob '55 23 * * *' (23:55) çalışıyor — yani iki rapor farklı pencereleri kapsıyor ve birbirini tutmuyor. Kullanıcının 00:23-00:27 loglarındaki kapanışlar zaten ertesi güne düşüyor.
```

**Kok neden:** Rapor saati (20:15) ile muhasebe penceresi (TR gün başı → şimdi) uyumsuz; gün sonu kapanışları (EOD 23:45 tahliyesi dahil) rapordan sonra gerçekleşiyor.

**Duzeltme:** botDailyReport cron'unu 23:57'ye al (EOD 23:45 kapatmasından ve raceReport 23:55'ten sonra), ya da pencereyi 'son 24 saat' yap. Alternatif: 20:15 raporunu 'ara rapor' olarak etiketle ve 23:57'de kesin gün raporu at.

**Dosyalar:** cronJobs.js, index.js

---

## 28. [YUKSEK] Tüm MT5-tradeable botların kendi Telegram kanalı susturulmuş — görünürlük tek noktaya bağlı ve o nokta sessizce kör

**Kanit:**

```
mt5TradeNotifier.paperNotificationSuppressed(botId): `return !!(entry && entry.competitionEligible && entry.mt5Tradeable !== false);` → 32 botun tamamı için true.
Çağıranlar (grep, 12 dosya): forexPushNotifier, mt5Notifier (scanner), proPushNotifier, cryptoChannelNotifier, altinNotifier, beastNotifier, ictFvgNotifier, mt5Bots/notifier, mtfPushNotifier, waveScanNotifier, nr7Shadow, botConsensus. Hepsi `if (paperNotificationSuppressed(...)) return { telegram: 0, brokerOwned: true }`.
Yani bir botun sinyal ürettiğine dair TEK kanıt broker-state akışıdır. O akış 503'te durunca kullanıcı için bot 'hiç sinyal üretmemiş' gibi görünür — oysa kâğıtta pozisyon açmış, köprü feed'ine girmiş, hatta MT5'te gerçek emir almış olabilir.
```

**Kok neden:** 'Tek sahip' (single owner) ilkesi doğru uygulanmış ama sahip düştüğünde devreye girecek bir düşüş-geri-bildirimi (degraded-mode alarm) tanımlanmamış.

**Duzeltme:** Sağlık alarmı ekle: mt5TradeNotifier.auditStatus().pendingNotifications > 0 veya realResults.summary().updatedAt > 30 dk eski ise Telegram'a tek satırlık '⚠️ İşlem defteri N dakikadır güncellenmiyor (bekleyen bildirim: M)' uyarısı at (kendi dedup'ıyla, saatte 1). Bu, gecelik sessiz körlüğü imkânsız kılar.

**Dosyalar:** index.js, store.js, cronJobs.js

---

## 29. [YUKSEK] Beyin açıkken 0.15 lot tavanı fiilen kalkıyor (1.00'a çıkıyor) ve clamp_lot atlanıyor — 1.00 lot gözlemi bununla tutarlı

**Kanit:**

```
trade_guard.py: `LOT_LEGACY_HARD_MAX = 0.15`, `LOT_BRAIN_HARD_MAX = 1.00`; `lot_cap_for()`: `cap = LOT_BRAIN_HARD_MAX if brain_on else (CONSENSUS_LOT if is_consensus(feed_row) else LOT_LEGACY_HARD_MAX)`. Ayrıca `if not brain_on and ... feed_row.get('lotCap')` → beyin açıkken backend'in gönderdiği lotCap (0.15/0.20) TAMAMEN YOK SAYILIYOR.
borsakrali_mt5_all.py open_from_feed(): beyin açıkken `lot = brain_plan.lot` — compute_lot()/clamp_lot() yolu HİÇ çalışmıyor.
mt5_brain_adapter.py: `absolute_lot_cap = min(1.0, float(_value(cfg, "account_tier_max_lot", "brain_max_lot", default=1.0)))`.
Ayrıca race_mode (kullanıcı kararı 2026-07-30) `max_per_symbol_side` korelasyon tavanını ve `max_open_total`/`max_open_per_bot` tavanlarını sıfırlıyor: `max_total = 0 if race else ...`.
config.json (adanmış forex köprüsü, magic 550055): lot_min 0.1, lot_max 1.1, max_lot 1.1 — bu köprü zaten hiç 0.15 tavanı görmemiş.
Bu bulgu istatistik denetiminin kapsamı dışında ama '1.00 lot + tek işlemde -400$' gözlemini doğrudan açıklıyor ve raporun neden -74$ derken hesabın -3.234$ dediğini büyütüyor.
```

**Kok neden:** Merkezi beyin devreye alınırken eski katmanlı savunma (feed lotCap + clamp_lot + korelasyon tavanı) 'beyin daha iyi karar verir' varsayımıyla devre dışı bırakılmış; artık tek katman kaldı.

**Duzeltme:** Bu denetimin kapsamı dışı ama kaydedilmeli: brain_plan.lot'u da trade_guard.clamp_lot()'tan geçir (beyin yalnız DÜŞÜREBİLİR ilkesi), account_tier_max_lot'u hesap büyüklüğüne göre türet, race_mode'da sembol+yön tavanını tamamen kaldırmak yerine yükselt (örn. 3→5). Karar kullanıcıya ait.

**Dosyalar:** trade_guard.py, borsakrali_mt5_all.py, mt5_brain_adapter.py, config.json, config_all.example.json

---

## 30. [YUKSEK] EKSİK TELEMETRİ LİSTESİ — huninin hangi basamağı nerede tutuluyor, hangisi hiç tutulmuyor

**Kanit:**

```
MEVCUT (kalıcı):
1. Kâğıt sinyal görüldü → competitionManager state.bots[id].seen[] (dedup parmak izi, MAX_SEEN ile budanır). Depo: bot-competition/registry.json, Supabase whitelist'te VAR (botPersistence SUBDIRS 'bot-competition' + FILES 'registry.json').
2. Kâğıt pozisyon açıldı → state.bots[id].open{}. Aynı dosya.
3. Kâğıt pozisyon kapandı → state.bots[id].trades[] (outcome, pnlUsd, closedAt). dailyBreakdown() bunu okuyor. Aynı dosya.
4. Köprü feed'ine girdi → mt5TradeNotifier.observeCandidates() → state.candidates[key] = {status:'candidate'}. Depo: mt5-notify/notified.json, whitelist'te VAR.
5. Beyin kararı → observeDecisions() → state.decisions[key] = {accepted, reason}. Aynı dosya. YALNIZ beyin reddi, köprü reddi değil.
6. Broker'da gerçekten açıldı → state.opens[key] {brokerConfirmed:true}. Aynı dosya.
7. Broker'da kapandı (net K/Z, komisyon, swap, fee) → realResults state.deals{}. Depo: real-results/deals.json, whitelist'te VAR.

EKSİK (hiçbir yerde tutulmuyor):
E1. Bot bazında 'kaç sinyal üretildi' SAYACI yok — seen[] bir dedup listesi, budanıyor, tarih taşımıyor.
E2. Köprünün emir-açmama gerekçeleri (18 farklı sebep kodu) → yalnız VPS log dosyası, backend'e sıfır.
E3. Sebep kodlarının BOT/MAGIC kırılımı → `reasons` sözlüğünde bot boyutu yok.
E4. candidates/decisions bot bazında toplanmıyor — auditStatus() yalnız global sayı veriyor (candidates, rejectedDecisions, signalWithoutTrade...).
E5. Günlük kalıcı rollup yok: candidates/decisions/opens/closes pruneBag ile budanıyor (MAX_RECORDS 12000, RECORD_TTL 60 gün, events son 2000) → geçmiş huni sorgulanamaz.
E6. realResults.aggregate() hesap (accountLogin) filtresi YOK — storageKey `login@server|dealId` ile kapsanmış ama aggregate tüm scope'ları topluyor → eski hesap (1513908484) dealleri hâlâ depodaysa toplamlara karışır.
E7. 'Sinyal üretildi ama köprüye hiç ulaşmadı' hali ölçülmüyor: bridgeFeed süzgeçleri (state.enabled, bot.enabled, mt5Tradeable, engineDisableEnv, tfAllowed) kaç satır düşürdü — sayılmıyor.
E8. Beyin adapter reddi kalıcı değil: _post_decision fire-and-forget, non-200'de kayıp (outbox'a alınmamış).
E9. Adanmış köprülerin (550055/550066) kendi karar/atlama telemetrisi yok — o dosyalarda tur özeti bile yok.
E10. 'Rapor ne zaman kör kaldı' göstergesi yok: realResults.summary().updatedAt var ama kimse eşiğe bakmıyor.
```

**Kok neden:** Sistem 'her aşamada doğru davranış' üzerine kurulmuş, 'her aşamayı ölç ve aşamalar arası farkı denetle' üzerine değil. Huninin girişi (kâğıt) ve çıkışı (broker deal) ölçülüyor; aradaki 4 eleme katmanı ölçülmüyor.

**Duzeltme:** Aşağıdaki huni-kayıt tasarımını uygula (ayrı bulgu).

**Dosyalar:** competitionManager.js, index.js, store.js, botPersistence.js, borsakrali_mt5_all.py

---

## 31. [YUKSEK] MİNİMAL HUNİ-KAYIT TASARIMI — bot × gün × aşama sayaç deposu

**Kanit:**

```
Mevcut altyapı bu tasarımın %70'ini zaten taşıyor: botPersistence whitelist mekanizması, mt5TradeNotifier candidate/decision kayıtları, realResults deal deposu ve köprünün `reasons` sözlüğü. Eksik olan tek şey bot boyutlu, gün bazlı, kalıcı bir ROLLUP ve köprü→backend telemetri kanalı.

ÖNERİLEN DEPO: backend/src/services/botFunnel/store.js
Dosya: data/bot-funnel/state.json → botPersistence SUBDIRS'e 'bot-funnel', FILES'a zaten var olan 'state.json' (yeni dosya adı GEREKMEZ).
DİKKAT: statsReset.js STAT_SUBDIRS'e de 'bot-funnel' eklenmeli, yoksa hesap değişiminde eski hesabın hunisi kalır.

ŞEMA (tek seviyeli, O(1) artırım):
{
  version: 1,
  days: {
    "2026-07-31": {                 // TR gün anahtarı
      "forex-signals": {
        magic: 5701, dedicatedMagic: 550055,
        signals: 0,                 // engine sinyal üretti (raceObserve girdisi)
        paperOpened: 0,             // competitionManager pozisyon açtı
        paperClosed: 0, paperNetUsd: 0,
        feedRows: 0,                // bridgeFeed'e girdi (forExecution görünümü)
        feedFiltered: { tf: 0, botDisabled: 0, engineDisabled: 0, notTradeable: 0, dedicated: 0 },
        bridgeSkips: { sembol_yok: 0, zaten_acik_sembol: 0, dusuk_rr: 0, reopen_cooldown: 0,
                       sembol_yogunlugu: 0, dusuk_guven: 0, lot_sifir: 0, guard_hafta_haber: 0,
                       piyasa_kapali: 0, yasakli_sembol: 0, no_money: 0, diger: 0 },
        brainRejects: { "fail_closed:*": 0, reentry_cooldown_active: 0, ... },  // serbest anahtar
        ordersSent: 0, ordersFilled: 0,   // 'acildi'
        brokerOpens: 0,                    // broker-confirmed açılış (state.opens)
        brokerCloses: 0, realNetUsd: 0, realTp: 0, realSl: 0,
        lastReasonAt: "..."
      }
    }
  },
  updatedAt: "..."
}

BESLEME NOKTALARI (5 satırlık dokunuşlar):
  • competitionManager.observeSnapshot/recordOpen/recordClose → bump(botId,'signals'|'paperOpened'|'paperClosed', pnl)
  • competitionManager.bridgeFeed() → süzülen her satır için bump(botId,'feedFiltered.<sebep>'); geçen satır için 'feedRows'
  • YENİ POST /api/bridge/telemetry (köprü tur özeti) → bump(magic→botId,'bridgeSkips.<sebep>'|'ordersFilled')
  • mt5TradeNotifier.observeDecisions() → accepted:false ise bump(...,'brainRejects.<reason>')
  • mt5TradeNotifier.ingestState() open satırı → bump(...,'brokerOpens')
  • realResults.ingest() → her deal için bump(magicToBot(magic).botId,'brokerCloses', pnl, tp/sl)

KÖPRÜ TARAFI (borsakrali_mt5_all.py):
  `_bump(k)` → `_bump(k, magic)`; tur sonunda
  POST /api/bridge/telemetry { tourId: "<pid>:<ts>"
```

**Kok neden:** —

**Duzeltme:** Yukarıdaki şemayı botFunnel/store.js olarak uygula; botPersistence SUBDIRS + statsReset STAT_SUBDIRS listelerine 'bot-funnel' ekle (unutulursa Supabase'e yazılmaz — 2026-07-24'te aynı sınıf hata botBuilder ve realResults'ta yaşandı); köprüye /api/bridge/telemetry POST'unu ekle; botDailyReport satırlarını huni formatına çevir; 23:57'de invaryant kontrolü kur.

**Dosyalar:** botPersistence.js, statsReset.js, competitionManager.js, index.js, store.js, index.js

---

## 32. [YUKSEK] KURUSLUK KAPANISLARIN CEVABI: beyin bunlari acmali miydi EVET, kapatan beyin DEGIL — ve komisyon beynin hicbir esiginde yok

**Kanit:**

```
SORU (a) 'beyin bunlari hic acmamali miydi': HAYIR, acmasi dogruydu. Giris kapilari acildigi anda saglanmisti: account_brain.py:487-491 `if risk_usd < config.min_initial_risk_usd: reject("safe_lot_initial_risk_below_minimum_no_upsize")` ve `if reward_usd < config.min_expected_profit_usd: reject("expected_profit_below_minimum")`, ikisi de mt5_brain_adapter.py:149-153'te `max(15.0, ...)` ile tabanlanmis. Yani acilan her islemin ilk riski >= $15 ve beklenen kari >= $15 idi.

SORU (b) 'erken kapatma mi': HAYIR, beynin uretebilecegi EN KUCUK iradi cikis $15. borsakrali_account_brain.py:781 `min_exit = float(cfg.get("min_discretionary_exit_usd", 15.0))`, :787 `floor = float(cfg.get("profit_lock_floor_usd", 15.0))`, :788 `locked = max(floor, peak * (1.0 - giveback))`. Kar tarafinda taban $15, zarar tarafinda `-max($15, 0.55R)`. -7,00 / -8,00 / -9,00 / +12,00 bu araligin ICINDE — beyin bu kapanislari URETEMEZ.

SORU (c) 'feed drift / competition kapatmasi mi': EVET, geriye kalan tek yol. Sebep kodlari: `competition-kapatti` (borsakrali_mt5_all.py:941) ve hafta sonu/haber kapisi (borsakrali_mt5_all.py:595-602). SURU KESIMI DEGIL: `herd_cut_loss_r = 0.10` kodu VPS'te yok (bkz. ayri bulgu).

SAYISAL KANIT: Gun komisyonu -552,32$ / ~55 islem ~= 10$ gidis-donus (1.00 lot tipik FTMO komisyonu). -7,00 / -8,00 / -9,00 kapanislari FIYAT olarak basabas, net olarak SADECE KOMISYON demektir. +12,00 / +16,00 ise birkac pip artiya komisyon dusulmus halidir. Bu, 'ac-20dk-bekle-piyasadan-kapat' churn imzasidir.

BEYNIN KOR NOKTASI: borsakrali_account_brain.py:425-426 `def _net_position_pnl(pos): return float(getattr(pos, "profit", 0) or 0) + float(getattr(pos, "swap", 0) or 0)` — KOMISYON YOK. Beynin butun esikleri ($15 taban, 1R kar-kilidi, 0.55R ters-hareket cikisi, R hesaplari) 1.00 lotta gercekten ~$10 IYIMSER bir sayi uzerinde calisiyor. 'Kurus-islem freni' olarak konan $15 taban, fiilen ~$5 net tabandir.
```

**Kok neden:** Iki ayri hata birlesmis: (1) kapatma otoritesi beynin disinda oldugu icin beynin $15 tabanlari cikis tarafinda hic devreye girmiyor; (2) beynin K/Z metrigi komisyonu iceremedigi icin, gerceklesen -552,32$'lik komisyon hem karar aninda gorunmuyor hem de gunluk defterde 'beyin bu islemi karda kapatti' gibi gorunen satirlarin bir kismi aslinda zararda kapanmis oluyor.

**Duzeltme:** (1) `_net_position_pnl`'e komisyonu ekle: acik pozisyon icin gidis-donus komisyonunu `order_calc_profit` yerine deal gecmisinden (giris deal.commission x2 tahmini) veya sembol basi bir `commission_per_lot` config'inden tureterek dus. (2) Giris kapisina NET beklenen kar sarti koy: `reward_usd - tahmini_komisyon >= min_expected_profit_usd`. (3) Cikis otoritesini beyne geri ver (bkz. close_on_feed_drift bulgusu) ki $15 taban cikista da gecerli olsun.

**Dosyalar:** borsakrali_account_brain.py, account_brain.py, mt5_brain_adapter.py, borsakrali_mt5_all.py

---

## 33. [YUKSEK] Suru ters-donus dedektoru + kar tasiyici (c7bc7ee/baa852c) VPS'TE CALISMIYOR — kullanicidaki paket commit 5491374

**Kanit:**

```
BAYT DUZEYINDE KANIT:
- `C:\Users\hsnkr\Desktop\BORSA-KRALI-VPS-MERKEZI-BEYIN-2026-07-30.zip` (30 Tem 00:31, bugun kullanilan paket) icindeki `mt5-bridge/borsakrali_account_brain.py`, commit `5491374` ile BIREBIR AYNI: `git show 5491374:mt5-bridge/borsakrali_account_brain.py | diff - <zip dosyasi>` -> 0 satir fark. `c7bc7ee` ile 255 satir, `baa852c` ile 318 satir fark.
- Ayni ZIP'te `grep -c herd_reversal_cuts` = 0 ve `grep -c _maybe_extend_runner` = 0.
- Zamanlama: ZIP 2026-07-30 00:31'de uretilmis; `c7bc7ee` 2026-07-30 01:16:25'te commit'lenmis (45 dakika SONRA). `baa852c` 2026-07-31 13:32:59.
- baa852c commit mesaji da bunu soyluyor: "Dusman incelemesi (17 ajan) bugunku iki yeni ozellikte 7 gercek hata buldu; hicbiri VPS'e gitmeden yakalandi."

MASAUSTUNDEKI YENI PAKET:
- `BORSA-KRALI-YARIS-MODU.zip` (31 Tem 13:35, 277.425 bayt) ile `BORSA-KRALI-VPS-MERKEZI-BEYIN-2026-07-31.zip` (ayni 277.425 bayt) AYNI icerik; icindeki brain `baa852c` ile BIREBIR (diff 0). Yani herd+runner+duzeltme bu ZIP'te VAR, ama ZIP bugun 13:35'te uretildigi icin islemlerin acildigi saatlerde VPS'te DEGILDI.
- Paket beyaz listesi: vps-paket-insa.ps1:30-40 (`$WHITELIST`) — 28 dosya; ZIP icerigi bu listeyle ortusuyor.

SONUC: 'suru kesimi -0.10R'de kurus kapanis yapti mi?' sorusunun cevabi kesin HAYIR — o kod VPS'te calismiyordu.
```

**Kok neden:** ZIP, ilgili iki commit'ten once uretilip Masaustune birakilmis; sonraki commit'ler icin yeni ZIP uretilmis ama kullaniciya 'bunu cikar+restart et' adimi tamamlanmamis. VPS surumu ile repo HEAD (2fc7387) arasinda 3 commit fark var.

**Duzeltme:** VPS'te calisan surumu dogrula: VPS'teki `mt5-bridge\borsakrali_account_brain.py` icinde `herd_reversal_cuts` var mi diye bak (`findstr /C:"herd_reversal_cuts"`). Yoksa `BORSA-KRALI-VPS-MERKEZI-BEYIN-2026-07-31.zip`'i RDP ile klasor uzerine cikar + BASLAT. UYARI: yeni ZIP de `dry_run: true` ile geliyor (vps-paket-insa.ps1:59), canliya gecis icin CANLIYA-GEC.bat veya BASLAT icindeki adim gerekiyor; ayrica `race_mode: true` yine gomulu geliyor (satir 61-62) — bu duzeltilmeden yeni paket ayni zarari tekrarlar.

**Dosyalar:** BORSA-KRALI-VPS-MERKEZI-BEYIN-2026-07-30.zip, BORSA-KRALI-YARIS-MODU.zip, BORSA-KRALI-VPS-MERKEZI-BEYIN-2026-07-31.zip, vps-paket-insa.ps1, borsakrali_account_brain.py

---

## 34. [YUKSEK] 45 dk yeniden-giris sogumasi: hicbir kopru ATLAMIYOR — sogutma neredeyse HIC YAZILMIYOR (ve yaris modunda zaten anlamsiz)

**Kanit:**

```
TUKETIM (soru: hangi dosyada var, hangisinde yok):
- TEK tuketim noktasi `mt5_brain_adapter.py:687-699`: `cooldown_rows = heartbeat.get("reentryCooldowns")` -> varlik (canonical_underlying) + yon eslesirse `_reject("reentry_cooldown_active")`.
- Uc koprunun UCU de bu fonksiyondan geciyor: borsakrali_mt5.py:385, borsakrali_mt5_scanner.py:406, borsakrali_mt5_all.py:423 (`mt5_brain_adapter.evaluate(...)`). Yani 'bir kopru sogumayi es geciyor' HIPOTEZI YANLIS — atlayan kopru yok.
- Heartbeat'e yayin: borsakrali_account_brain.py:667-685, suresi dolanlar temizlenip `"reentryCooldowns": active_cooldowns` olarak yaziliyor. Zincir saglam.

YAZIM TARAFI KIRIK:
- borsakrali_account_brain.py:1538-1550: sogutma SADECE `reason = _dynamic_exit_reason(...)` dolu VE `_close_position(...)` basarili oldugunda yaziliyor. Yani sogutma yalnizca BEYNIN KENDI IRADI CIKISINDA armed oluyor.
- Broker SL/TP ile kapanan, koprunun `competition-kapatti` ile kapattigi, hafta sonu/haber kapisiyla veya EOD ile kapanan pozisyonlar HIC sogutma yazmiyor. Bugunku kapanislarin buyuk cogunlugu bu ikinci gruptan (bkz. kurusluk-kapanis bulgusu) -> `reentryCooldowns` pratikte bos.

DAHA BELIRLEYICI OLAN: Ekran kanitindaki EURUSD buy 1.00 lot 12:00/12:44/14:31/14:48/15:00/18:10/18:11 dizisi YENIDEN-GIRIS DEGIL, es-zamanli YIGILMA. Kanit: ayni anda ACIK 4 adet EURUSD (0.46/0.29/0.27/0.23) duruyor. 18:10 ve 18:11 arasinda 1 dakika var — hicbir kapanis-yeniden-acilis dongusu bu kadar hizli olamaz; bunlar farkli botlarin (farkli magic) ayni yonde ayri pozizyonlaridir ve borsakrali_mt5_all.py:380-384'teki magic-bazli dedup onlari engellemez.
- Yaris modunda beynin 'ayni varlikta ikinci pozisyon yok' kurali da kapali (account_brain.py:442-448), dolayisiyla soguma kurali devreye girecek bir 'yeniden giris' olayi zaten olusmuyor.

Ayrica kopru-yerel ikinci bir soguma var ama zayif: borsakrali_mt5_all.py:963 `_reopen_until[...] = now + reopen_cooldown_minutes(30)*60`, tuketimi :378. Bu bir MODUL GLOBALI (:262) — kopru her restart'ta sifirlaniyor ve yalnizca birlesik kopruyu baglar.
```

**Kok neden:** Soguma, 'churn'u onlemek icin dogru katmana (heartbeat -> tum kopruler) konmus ama YANLIS OLAYA baglanmis: churn'u uretenler beynin iradi cikislari degil, kagit-defter kaynakli drift kapatmalari ve coklu-bot es-zamanli yigilma.

**Duzeltme:** (1) Sogutmayi kapanis SEBEBINDEN bagimsiz hale getir: beyin bir ticket'in artik acik olmadigini gordugu her seferde (deal gecmisinden kapanis tespiti, borsakrali_account_brain.py `_closed_rows` yolu) varlik+yon icin cooldown yaz — beynin kendi kapatmasi sart olmasin. (2) Yaris modunda ayni varlik+yon icin bir ADET tavani (or. 3) birak, boylece 7 es-zamanli EURUSD long olusmasin. (3) `_reopen_until`'i modul globali olmaktan cikarip diske/heartbeat'e tasi.

**Dosyalar:** borsakrali_account_brain.py, mt5_brain_adapter.py, borsakrali_mt5_all.py, borsakrali_mt5.py, borsakrali_mt5_scanner.py

---

## 35. [YUKSEK] Ikinci bagimsiz eksik sayim: gunluk rapor `dedicatedBridgeMagic` islemlerini HIC gormuyor - Bot 1 ve Bot 5 yapisal olarak 'islem yok'

**Kanit:**

```
backend/src/services/botDailyReport/index.js:53-57 `realFor(entry)`: `const magics = entry.magicByStrategy ? [...Object.values(entry.magicByStrategy)] : [Number(entry.magic)]` - `entry.dedicatedBridgeMagic` HIC OKUNMUYOR. Katalogda (catalog.js:17 ve :26) forex-signals magic 5701 + dedicatedBridgeMagic 550055, mt5-scanner magic 5705 + dedicatedBridgeMagic 550066. MEMORY kaydina gore (2026-07-24, commit fa46252) bu iki bot ARTIK YALNIZ kendi adanmis koprusunde acar, yani gercek deal'lerinin magic'i 550055/550066'dir. realResults/store.js:36-43 CATALOG_BY_MAGIC bu magic'leri DOGRU esliyor (aggregate satiri 'Forex Sinyalleri' adiyla cikiyor), ama botDailyReport `realByMagic.get(5701)` diye ariyor ve bulamiyor -> `else` dalina dusup 'islem yok' basiyor ve dTrades/dNet toplamina HIC katilmiyor (index.js:65-75). Ayni sekilde katalogda olmayan herhangi bir magic (magic-XXXX satiri) de dTrades'e girmiyor: dongu yalnizca COMPETITORS + builderStore.listCustom() + GOLD_MAGIC uzerinde. Karsilastirma: realResults/raceReport.js:56-57 TUM satirlari topluyor (`today.reduce`) - yani ayni gun icin iki Telegram raporu birbirinden FARKLI rakam verir; bu tek basina bir tutarlilik testi.
```

**Kok neden:** Rapor, deal listesini kaynak-of-truth almak yerine katalogu dolasip her bot icin tek magic sorguluyor (pull), yani katalogda tanimli olmayan veya ikinci kimlikle acilmis her islem sessizce dusuyor. store.js coklu-magic problemini cozmus ama cozum botDailyReport'a tasinmamis.

**Duzeltme:** botDailyReport `realFor` icindeki magic listesine `entry.dedicatedBridgeMagic` eklensin (store.js:36-43 ile ayni kume). Daha saglami: rapor katalogu dolasmak yerine `realResults.aggregate()` cikan TUM satirlar uzerinden toplasin ve katalogda eslesmeyenleri 'Eslesmemis magic XXXX' basligiyla GOSTERSIN (raceReport.js'in yaptigi gibi) - 'kayip islem' durumu bir daha asla sessiz olmasin. Ek olarak: rapora 'broker gun kapanis toplami vs defter toplami' mutabakat satiri eklensin; fark > %5 ise raporun basina UYARI bassin.

**Dosyalar:** index.js, catalog.js, store.js, raceReport.js

---

## 36. [YUKSEK] H4 DOGRULANDI: beyin tamamen MALIYET-KOR - komisyon/swap/spread risk modelinde hic yok; $15 tabani BRUT

**Kanit:**

```
`grep -n "spread|commission|swap" mt5-bridge/account_brain.py` -> SIFIR eslesme. account_brain.py:527-532 `_safe_lot`: `loss_per_lot = |entry-stop|/tick_size*tick_value`, `reward_per_lot = |target-entry|/tick_size*tick_value` - saf fiyat geometrisi, hicbir maliyet terimi yok. account_brain.py:489-495: `risk_usd < min_initial_risk_usd (15$)`, `reward_usd < min_expected_profit_usd (15$)`, `rr < min_rr (3.0)` - ucu de BRUT deger uzerinden. catalog.js'deki `costBps` alanlari (forex 3bp, kripto 10bp, BIST 18bp) YALNIZCA kagit yarismasi skorlamasinda kullaniliyor, canli risk yolunda hic cagrilmiyor. SAYISAL: 552,32$ komisyon + 81,58$ swap = 633,90$; ~60 islemde islem basi 10,57$ (~90 islemde 7,04$). Bu tek basina gunun toplam zararinin %19,6'si. Tabani zar zor gecen bir islem: brut hedef 15$, maliyet 10,57$ -> NET kar 4,43$ (hedefin %29'u) ve gercek net RR = (15-10,57)/(15+10,57) = 0,17 - beyin ise bu isleme 'RR 3.0 gecti' diyerek onay veriyor. Ayrica komisyon LOT ile olceklenir, RISK ile degil: dar stopta lot 1.00 tavanina dayanan bir islem, risk olarak kucuk ama komisyon olarak en pahali islemdir.
```

**Kok neden:** Merkezi beyin 'tek risk otoritesi' olarak tasarlanirken risk = fiyat mesafesi kabul edildi; islem maliyeti (komisyon + swap + spread) modelin disinda birakildi. Yaris modu islem sayisini 5'ten ~60-90'a cikarinca, tek basina ihmal edilebilir olan maliyet gunluk P/L'in besde birine dondu.

**Duzeltme:** `_safe_lot` cikisina maliyet terimi eklensin: `net_reward = reward_per_lot*lot - cost(lot, symbol)` ve `net_risk = loss_per_lot*lot + cost(lot, symbol)`; `min_rr`, `min_expected_profit_usd` ve `min_initial_risk_usd` kapilari NET degerler uzerinden calissin. cost(), sembol basina broker komisyonu (round-turn $/lot) + ortalama spread maliyeti + tahmini swap (beklenen tutma suresi x gunluk swap) toplami olsun; katalogdaki costBps zaten bu bilginin yarisini tasiyor. Pratik hizli kural: `min_expected_profit_usd >= 5 x tahmini_maliyet` (yani ~50$) yapilirsa 'kurus islem' sinifi tamamen elenir.

**Dosyalar:** account_brain.py, mt5_brain_adapter.py, catalog.js

---

## 37. [YUKSEK] Yaris modunda CLOSE_AND_REVERSE FIZIKSEL OLARAK tetiklenemiyor: trend donunce kitap kilitli hedge'e donusup maliyet akitiyor

**Kanit:**

```
account_brain.py:442-444 yaris modunda `opposite = []` olarak sabitleniyor; :519-520 `action = DecisionAction.CLOSE_AND_REVERSE if opposite else DecisionAction.ALLOW` -> `opposite` her zaman bos oldugu icin beyin ASLA ters-donus kapatmasi yapamaz, her karar ALLOW olur. Sonuc: trend dondugunde zarardaki eski pozisyonlar acik kalir, uzerine yeni ters pozisyonlar eklenir. Kullanicinin acik pozisyon ekrani bu imzayi tasiyor: ayni dayanakta coklu pozisyon (EURUSD x4, XAUUSD x4, BTCUSD x3) ve kullanilan teminat 31.201,43$ = ozkaynagin %15,80'i (serbest 165.851,79$, seviye %632) - net maruziyet kucuk gorunse bile BRUT maruziyet cok buyuk. Kilitli hedge'in mali imzasi: swap -81,58$ (gece tasinan pozisyonlar) + komisyon 552,32$ (her iki bacak da tam komisyon oder) toplam 633,90$, buna karsilik brut P/L yalnizca -2.600,98$ - yani net yon hareketi mutevazi, maliyet ise orantisiz.
```

**Kok neden:** 246dc4a commit mesajinda 'kapat-ve-dondur zorunlulugu (hedge serbest)' bilincli bir tercih olarak yazilmis; ancak 'hedge serbest' pratikte 'beyin artik ters donus goremez' demek. Ters-donus tespiti ile hedge izni ayni kod dalinda birlestirildigi icin, hedge'i acmak dedektoru de kor etti. Beyin bir pozisyonu yon degisimi nedeniyle kapatamaz hale gelince tek cikis SL/TP kaldi.

**Duzeltme:** Hedge iznini ters-donus TESPITINDEN ayir: `opposite` listesi HER ZAMAN hesaplansin (tespit icin), `race_mode` yalnizca 'CLOSE_AND_REVERSE zorunlu mu yoksa opsiyonel mi' kararini degistirsin. Yaris modunda kural su olsun: ters yonde yeni pozisyon acilabilir AMA ayni dayanakta zarardaki eski pozisyonlarin toplam R'si -1R'yi asmissa once onlar kapatilir. Ayrica 07-31'de yazilan `herd_reversal_cuts` bu ihtiyaci zaten karsiliyor - VPS'e uygulanmasi sart (asagidaki bulgu).

**Dosyalar:** account_brain.py, borsakrali_account_brain.py

---

## 38. [YUKSEK] Kullanicinin 07-30'da istedigi suru/ters-donus korumasi ZARAR GUNUNDE VPS'te HIC YOKTU - ZIP kaniti kesin

**Kanit:**

```
Masaustundeki iki paket dogrudan acilip incelendi. `BORSA-KRALI-VPS-MERKEZI-BEYIN-2026-07-30.zip` (dosya zamani 30 Tem 00:31, commit 5491374 00:31:16 ile birebir): borsakrali_account_brain.py icinde `herd_reversal_cuts` = YOK, `_maybe_extend_runner` = YOK; config_all.json -> race_mode=True, risk_pct=0.25, max_lot=1.0, allowed_account=1514083666. `BORSA-KRALI-VPS-MERKEZI-BEYIN-2026-07-31.zip` (dosya zamani 31 Tem 13:35, commit 2fc7387 13:34'ten sonra): `herd_reversal_cuts` = VAR, `_maybe_extend_runner` = VAR. Yani suru dedektoru (c7bc7ee, 30 Tem 01:16) ve duzeltmesi (baa852c, 31 Tem 13:32) 07-30 paketine GIRMEDI; 07-31 paketi ise zarar olustuktan SONRA (13:35) uretildi. Sonuc: hem +5-6 bin kar gunu hem -3.234,88$ zarar gunu TAMAMEN AYNI kod ile calisti. Bu, 'kod degisikligi zarara yol acti' hipotezini kesin olarak ELER ve gozlenen isaret degisiminin %100 piyasa kaynakli oldugunu, buyuklugunun ise kaldirilmis tavanlardan geldigini kanitlar. Not: baa852c commit mesaji 'hicbiri VPS'e gitmeden yakalandi' diyor - ZIP kaniti bunu dogruluyor, yani hatali suru dedektoru canliya cikmadi (iyi haber), ama ayni sebeple HICBIR suru korumasi da canli degildi.
```

**Kok neden:** Kullanici 07-30'da 'ani trend donusunde 10 long acik ve zarar buyuyorsa hemen kapat' dedi; kod ayni gece yazildi ama VPS paketi 00:31'de zaten uretilmisti ve yeniden paketleme/kurulum 07-31 13:35'e kadar yapilmadi. Yaris modu (tavanlarin kaldirilmasi) canliya girdi, onun telafisi olarak tasarlanan koruma girmedi - guvenlik acisindan en kotu sira.

**Duzeltme:** 1) 07-31 13:35 ZIP'i (herd + runner + baa852c duzeltmeleri) VPS'e uygulanmadan yaris modu ile canli devam EDILMEMELI. 2) Kalici kural: `race_mode=true` ile calisan bir pakette `herd_reversal_cuts` fonksiyonunun varligi BASLAT.bat icinde dogrulanip, yoksa kopru canli moda GECMESIN (fail-closed). 3) ZIP insa scriptine 'paketteki en son commit hash + surum' damgasi eklensin; beyin heartbeat'inde yayinlansin ki hangi kodun canli oldugu tahmin degil OLCUM olsun.

**Dosyalar:** BORSA-KRALI-VPS-MERKEZI-BEYIN-2026-07-30.zip, BORSA-KRALI-VPS-MERKEZI-BEYIN-2026-07-31.zip, vps-paket-insa.ps1, BASLAT.bat, borsakrali_account_brain.py

---

## 39. [ORTA] Beyin, backend'in 503 gövdesindeki 'ingested' bilgisini okumuyor; başarılı yazımı başarısız sanıp aynı yükü sonsuz tekrarlıyor

**Kanit:**

```
bridge.routes.js:84-99 — `realResults.ingest()` 503 kontrolünden ÖNCE çalışır ve sonucu 503 gövdesine konur:
```
let results = { ingested: 0, invalid: 0, ... };
if (Array.isArray(req.body.closed) && req.body.closed.length) results = realResults.ingest(req.body.closed, req.body);
const lifecycle = await mt5TradeNotifier.ingestState(req.body || {});
if (lifecycle.retryableFailures > 0 || ...) return res.status(503).json({ ..., results, lifecycle });
```
borsakrali_account_brain.py:1337-1339 —
```
if response.status_code != 200:
    log.error("broker durum POST %s: %s", response.status_code, response.text[:160])
    return False
```
Gövde okunmuyor, `results.ingested` yok sayılıyor.
Aynı körlük mt5_brain_adapter.py:513'te de var.
```

**Kok neden:** HTTP durum kodu iki farklı anlamı taşıyor: 'defter yazılmadı' ve 'Telegram bekliyor'. Köprü ikisini ayırt edemiyor, en kötü durumu varsayıyor. Bu, 2 saniyede bir aynı 40 satırın yeniden gönderilmesine ve backend'in her seferinde tüm Telegram kuyruğunu yeniden denemesine yol açıyor (bulgu 6'yı besliyor).

**Duzeltme:** borsakrali_account_brain.py:1337'de yanıt gövdesini ayrıştır: `body = response.json()`; `ledger_ok = int((body.get('results') or {}).get('ingested', 0)) > 0 or int((body.get('results') or {}).get('invalid', 0)) == 0`. `status_code == 503 and body.get('error') == 'trade-notification-pending' and ledger_ok` ise cursor'u İLERLET (defter yazıldı, yalnız Telegram bekliyor) ve `return True`. `invalid-broker-lifecycle-row` durumunda eskisi gibi `return False`.

**Dosyalar:** borsakrali_account_brain.py, bridge.routes.js, mt5_brain_adapter.py

---

## 40. [ORTA] Rapor penceresi 20:15 TR'de kesiliyor — akşam/EOD kapanışları (23:45 flatten dahil) rapora hiç girmiyor

**Kanit:**

```
cronJobs.js:1712-1721 — `cron.schedule('15 20 * * *', ...)` (TR_TZ).
botDailyReport/index.js:24-27 `trDayStartMs()` TR gece yarısı; 132-133 `sinceSec = Math.floor(trDayStartMs(nowMs)/1000)`.
realResults/store.js:222-223 `if (d.closedSec < sinceSec) continue;` — üst sınır yok ama rapor 20:15'te üretildiği için o andan sonrasını göremez.

MEMORY: mt5-scanner EOD kapatma 23:45, trade_guard Cuma 23:45 kapatma → günün en yoğun toplu kapanış anları raporun DIŞINDA. Kullanıcı MT5 mobilde gece 00:23'te 'bugün kapanan' ekranına baktığında bu blok da farka ekleniyor.
```

**Kok neden:** Rapor 'günü kapatan' değil 'gün içi ara özet' olarak zamanlanmış ama metni ('GÜN TOPLAMI', 'Her akşam güncellenir') tam gün iddiasında. Başlıkta kapsanan saat aralığı yazmıyor.

**Duzeltme:** İki seçenek: (a) cron'u `'5 0 * * *'` yapıp `nowMs`'i bir önceki güne sabitleyerek TR gününü tam kapat; (b) mevcut 20:15 kalsın ama başlığa kapsanan aralığı yaz (`botDailyReport/index.js:44` satırına `· 00:00–${saat} TR`) ve gece yarısı ikinci bir 'gün kapanışı' çalıştırması ekle. En küçük müdahale (b)'nin başlık kısmı + ikinci cron.

**Dosyalar:** cronJobs.js, index.js

---

## 41. [ORTA] `lifecycleReadiness.failRestore` kalıcı 503 latch'i — geri dönüşü yok, ingest'ten ÖNCE devrede

**Kanit:**

```
lifecycleReadiness.js:19 —
```
function failRestore(reason) { return set(false, `restore-failed:${...}`); }
```
`set(false, ...)`'tan sonra `completeRestore()` dışında hiçbir şey ready'yi true yapmıyor; süre aşımı/yeniden deneme yok.
bridge.routes.js:82 `if (!requireLifecycleReady(res)) return undefined;` — bu satır 84-88'deki `realResults.ingest`'ten ÖNCE. Yani restore başarısızsa kapanış satırları backend'e ulaşsa bile OKUNMADAN 503'lenir.
Aynı şekilde /results (111) ve /positions (44).
```

**Kok neden:** Supabase geri yükleme hatası, servisin ömrü boyunca sürecek bir kilit üretiyor; hiçbir uyarı/alarm da yok. Render deploy sırasında Supabase kısa bir kesinti yaşarsa o process kalıcı olarak broker verisini reddeder.

**Duzeltme:** `failRestore` sonrası sınırlı yeniden deneme (ör. 30sn'de bir, 10 deneme) ekle veya `botPersistence` restore'u başarısız olduğunda 'boş state ile devam et + kalıcı uyarı' moduna geç. En küçük müdahale: `failRestore` içinde `setTimeout(() => retryRestore(), 30000)` benzeri bir yeniden tetikleme ve Telegram'a tek seferlik kritik uyarı.

**Dosyalar:** lifecycleReadiness.js, bridge.routes.js

---

## 42. [ORTA] Konsensüs/güven kısayolu: agreeCount>=3 olan her sinyal doğrudan bandın TAVANINA (0.25%) atlıyor

**Kanit:**

```
mt5_brain_adapter.evaluate satır 646-657:
```
if policy.risk_profile == "balanced":
    dynamic_risk = 0.10 + 0.15 * strength
    if confirm_count >= 3:
        dynamic_risk = 0.25
    dynamic_risk = min(float(policy.trade_risk_pct), dynamic_risk)
```
`confirm_count = max(1, int(confirmations or 1))` ve confirmations feed'den `s.get("agreeCount") or s.get("confirmations") or 1` olarak geliyor (borsakrali_mt5_all.py:431).

SAYISAL: strength kaç olursa olsun agreeCount>=3 -> 0.25% -> **493,74 $**. Örneğin güven 0,60 olan bir sinyal normalde 0,19% (375,24 $) alacakken, 3 bot aynı yöne baktığı anda %32 daha büyük risk alıyor. Bot 37 konsensüs botu TANIMI GEREĞİ hep >=3 onayla gelir (memory: botConsensus/findConsensus) -> her konsensüs işlemi otomatik olarak maksimum bütçeyle açılıyor.

race_mode ile birleşince: korelasyon tavanı da kapalı olduğundan 3 botun anlaştığı sinyal hem en büyük lotu alıyor hem de aynı sembol/yönde diğer botların pozisyonlarının ÜSTÜNE biniyor. Günlük raporda Bot 37'nin 13 işlem / 9 SL ile en aktif ve en zararlı bot çıkması bununla tutarlı.
```

**Kok neden:** Konsensüs "daha yüksek olasılık" varsayımıyla ödüllendirilmiş; ama konsensüs aynı zamanda korelasyonun ta kendisi. Aynı anda hem boyutu büyütmek hem korelasyon tavanını kaldırmak riski çift sayıyor.

**Duzeltme:** Konsensüsü boyut ödülü olarak değil, korelasyon uyarısı olarak ele al: agreeCount>=3 iken risk bandının tavanına atlamak yerine, o sembol+yön için TEK bir konsensüs pozisyonu aç ve diğer botların aynı yöndeki girişlerini bloke et (race_mode'da bile). En azından `if confirm_count >= 3: dynamic_risk = 0.25` satırını kaldırıp normal `0.10 + 0.15*strength` eğrisini kullan — güven zaten strength içinde temsil ediliyor, çifte sayım oluyor.

**Dosyalar:** mt5_brain_adapter.py, borsakrali_mt5_all.py

---

## 43. [ORTA] realResults.aggregate() hesap filtresi uygulamıyor — eski hesabın (1513908484) dealleri toplamlara karışabilir

**Kanit:**

```
store.js dealStorageKey() anahtarı `login@SERVER|dealId` olarak scope'luyor, ama aggregate():
```
for (const d of Object.values(state.deals)) { if (d.closedSec < sinceSec) continue; ... by.get(d.magic) ... }
```
accountLogin'e HİÇ bakmıyor. Hesap 1513908484 → 1514083666 değişimi sonrası BOT_STATS_RESET jetonu Render'da ayarlanmadıysa (hafıza notu: 'Render'da BOT_STATS_RESET env'ini SEN eklemelisin') eski deal'ler hâlâ depoda ve `aggregate(0)` (genel toplam, /api/bot/race/leaderboard ve raceReport 'GENEL' bölümü) iki hesabı topluyor.
Günlük pencerede (sinceSec = bugün) etkisi yok; genel/lider tablosunda var.
```

**Kok neden:** Hesap kapsamı depolama anahtarına eklenmiş ama okuma yoluna eklenmemiş.

**Duzeltme:** aggregate(sinceSec, { accountLogin })'a opsiyonel hesap filtresi ekle ve raporlarda aktif hesabı (heartbeat/snapshot'tan gelen login) geçir. Ayrıca summary()'ye hesap kırılımı ekle ki karışım anında görünsün.

**Dosyalar:** store.js, raceReport.js, statsReset.js

---

## 44. [ORTA] 3R iz suren stop ve 1R kar-kilidi: kod VPS'te MEVCUT, gorunurluk VAR — ama bugun tetiklenmesi yapisal olarak imkansiz

**Kanit:**

```
KOD VPS'TE VAR (07-30 ZIP'inde dogrulandi):
- `trail_start_r: 3.0`, `trail_distance_r: 1.0` (borsakrali_account_brain.py:98 / config_brain.example.json).
- borsakrali_account_brain.py:1060 `if peak_r < float(cfg.get("trail_start_r", 3.0)): return` — 3R'den once HICBIR SEY yapmaz.
- 1R kar-kilidi: :761-762 `arm = max(arm, risk * float(cfg.get("profit_giveback_activation_r", 1.0)))` (d8e17e0, 5491374'te mevcut).

GORUNURLUK VAR — aranacak log satirlari:
- Basarili trail: :1108 `TRAIL %.2fR %s ticket=%s SL -> %s` (VPS surumunde satir 880).
- Basarisiz trail: :1119 `TRAIL basarisiz %s ticket=%s retcode=%s hata=%s (tekrar %ss sonra)` (VPS'te 889).
- Dry-run: :1085 `[DRY] TRAIL %.2fR ...`.
- Kar-kilidi cikisi kapanis sebebi olarak: `profit-giveback-peak-X-now-Y` / `fast-hype-reversal-peak-X-now-Y`.
- (RUNNER TP satiri VPS'te YOK — o kod deploy edilmedi.)

NEDEN TETIKLENMEDI: trail 3R tepe gerektiriyor; kagit defter pozisyonu ~2R'lik kendi target1'inde defterden dusuruyor ve kopru ~20-25 dk icinde piyasadan kapatiyor (bkz. close_on_feed_drift bulgusu). Yani pozisyon 3R'ye ulasacak omru bulamiyor. Ekran kanitindaki en buyuk kapanislar +102$ / +49$ mertebesinde; 1.00 lotta 3R en az birkac yuz dolar olurdu.

Ek kirilganlik: trail R'sini `meta["initialSlPrice"]` uzerinden olcuyor (:1029-1038); bu deger `state["tickets"]` icinde tutuluyor ve `_position_r` icin `initialRiskUsd` de ayni yerden geliyor. Beyin daemon'u bir ticket'i ILK kez pozisyon zaten trail'lenmis haldeyken gorurse (or. state dosyasi kaybi), taban cizgi yanlis kurulur ve 3R hicbir zaman olculmez (satir 1035-1037 `if not adverse: return`).
```

**Kok neden:** Trail ve kar-kilidi, pozisyonun omrunun beyin tarafindan yonetildigi varsayimiyla yazilmis. Fiiliyatta omru kagit defter belirliyor ve o omur 3R'ye yetmiyor.

**Duzeltme:** Once cikis otoritesini beyne geri ver. Ayrica trail'i kademeli yap: 1R'de basabas stop, 2R'de +0.5R kilit, 3R'den sonra mevcut 1R mesafeli iz surme. Dogrulama icin VPS beyin logunda `findstr /C:"TRAIL " /C:"profit-giveback" beyin.log` — bugun icin bos donmesi beklenir; bos donuyorsa teshis dogrulanmis olur.

**Dosyalar:** borsakrali_account_brain.py, config_brain.example.json

---

## 45. [ORTA] 'Cogu islem tam 1.00 lot' bir tesaduf degil: risk butcesi lot tavanini doyuruyor, yani gercek risk beynin sandigindan farkli

**Kanit:**

```
- Lot tavani: mt5_brain_adapter.py:588-595 `absolute_lot_cap = min(1.0, _value(cfg, "account_tier_max_lot", "brain_max_lot", default=1.0))` -> `volume_max = min(broker_volume_max, absolute_lot_cap)`. Canli config_all.json'da `"max_lot": 1.0` ve `"account_tier_max_lot": 1.0`.
- Lot hesabi: account_brain.py:535-537 `steps = floor((risk_budget / loss_per_lot) / volume_step)`; `lot = min(spec.volume_max, steps * volume_step)`.
- Risk butcesi (yaris modu): account_brain.py:469-471 `limits_usd = {"trade": equity * trade_risk_pct / 100.0}`. mt5_brain_adapter.py:1531-1541: balanced profilde `dynamic_risk = 0.10 + 0.15 * strength`, konsensus (>=3 teyit) ise sabit `0.25`, tavan `trade_risk_pct` (config 0.25).
- 197.053$ x %0,25 = ~493$ islem basi risk butcesi. Coğu FX/endeks kurulumunda 493$ butce 1.00 lottan FAZLASINA yeter -> tavan baglanir -> tam olarak 1.00 lot.
- Kesirli lotlu ACIK pozisyonlar (EURUSD 0.46/0.29, BTCUSD 0.44/0.32, XAUUSD 0.01-0.10) ise tavanin baglanmadigi, gercekten risk-boyutlanmis olanlar. Iki populasyon bu yuzden var.
- Tek islem zararlari da tutarli: EURUSD 1.00 lot -287,00 ve -277,00 -> ~28 pip; 1.00 lotta 493$ tam SL ~49 pip. Yani bu pozisyonlar SL'e VARMADAN kapatilmis (yine drift kapatmasi imzasi).
```

**Kok neden:** `account_tier_max_lot = 1.0` hesap buyuklugu (197k) ile birlikte dusunuldugunde artik koruyucu degil; risk-bazli boyutlamayi sabit-lot boyutlamaya donusturuyor. Yaris modunda portfoy tavani da olmadigi icin 'islem basi %0,25' garantisi 'es zamanli N x %0,25' haline geliyor.

**Duzeltme:** (1) Lot tavanini hesap ozvarligina oranla (or. `min(1.0, equity/200000)`) veya kaldirip risk tavanina guven; (2) portfoy/hesap acik-risk tavanini yaris modunda da uygula (bkz. race_mode bulgusu); (3) 1.00 lot tavaninin bagladigi islemleri logla (`lot == volume_max` durumunda INFO satiri) ki 'risk-bazli' iddiasi ne zaman gecersizlesiyor gorulsun.

**Dosyalar:** mt5_brain_adapter.py, account_brain.py, vps-paket-insa.ps1

---

## 46. [ORTA] Kagit defterin 'signal_flip' cikisi, yaris modunda gercekte HEDGE uretiyor (eski pozisyon 20+ dk daha acik kaliyor)

**Kanit:**

```
- competitionManager.js:513-521: ayni bot ayni sembol+TF'de ters yonde sinyal uretince `recordClose(botId, {..., outcome: 'signal_flip'})` ile kagit pozisyon ANINDA kapaniyor ve hemen yeni ters pozisyon aciliyor.
- Kagit taraf ANINDA doner; gercek MT5 tarafi ise borsakrali_mt5_all.py:926-946 geregi en az `min_hold_minutes = 20` dakika + `drift_confirm_turns = 3` tur beklemek zorunda.
- Ayni anda yeni ters yon emri kopruye dusuyor ve beyin onu REDDETMIYOR: yaris modunda account_brain.py:442-444 `opposite = []` oldugu icin ters-donus/atomik kapatma yolu (`DecisionAction.CLOSE_AND_REVERSE`, borsakrali_mt5_all.py:437-444 `close_for_reversal`) HIC calismaz.
- Sonuc: 20-25 dakika boyunca ayni sembolde hem long hem short gercek pozisyon acik kalir; her ikisi de spread + komisyon oder, birbirini notrlestirir, sonra eskisi piyasadan kapatilir.
- Kanitla tutarli: gun komisyonu -552,32$ ve cok sayida basabas-civari kapanis.
```

**Kok neden:** Yaris modu, ters-donus ele alma yolunu da kapatti (amac 'giris tavani yok' idi; yan etkisi 'ters yon geldiginde eskiyi kapatma' mantiginin da olmesi oldu). Kagit defterin aninda flip'i ile koprunun 20 dakikalik min-hold'u arasindaki zamanlama farki hedge penceresini aciyor.

**Duzeltme:** `race_mode` yalniz TAVANLARI kaldirsin, ters-donus yolunu KALDIRMASIN: account_brain.py:442-444'te `opposite` listesi race_mode'da da hesaplansin (yalniz `same_side` bosaltilsin). Ek olarak, feed'de bir kod ters yonde yeniden gorunduyse drift kapatmasi `min_hold_minutes` beklemeden hemen calissin (ters-yon istisnasi).

**Dosyalar:** competitionManager.js, account_brain.py, borsakrali_mt5_all.py

---

## 47. [ORTA] Tek ara fren (%1,5 gunluk giris freni) hasarin %93'unden sonra devreye giriyor; %1,5 ile %4,25 arasi tamamen korumasiz

**Kanit:**

```
account_brain.py:566-568 `if daily_loss >= config.daily_entry_brake_pct (1.5): REJECT` - bu, yaris modunda AYAKTA KALAN TEK ara frendir (openRisk %2 / symbol-side %0,5 / bot %0,5 tavanlari borsakrali_account_brain.py:745-752'de atlaniyor). SAYISAL: gun basi bakiye = 197.053,22 + 3.234,88 = 200.288,10$. %1,5 esigi = 3.004,32$. Gercek zarar 3.234,88$ = %1,615. Yani fren ancak gunun zararinin %92,9'u olustuktan SONRA silahlandi - pratikte hicbir sey korumadi. Bir sonraki kademe %4,25 = 8.512$ (hicbir zaman yaklasilmadi). Dahasi fren `snapshot.equity` uzerinden olculuyor (account_brain.py:547), yani acik pozisyonlardaki YUZEN KAR gerceklesen zarari maskeleyip freni daha da geciktirebiliyor. Karsilastirma: kaldirilan `hard_max_open_risk_pct=2.0` = 3.950$, `max_symbol_side_risk_pct=0.5` = 987$ - ikisi de bu gunde defalarca devreye girecek seviyedeydi.
```

**Kok neden:** Fren mimarisi FTMO kural ihlalini onlemek icin tasarlandi (%4,25 / %9,25), gunluk P/L'i yonetmek icin degil. Cesitlendirme tavanlari (asil gunluk koruma) kaldirilinca geriye yalnizca 'kural ihlali arifesi' frenleri kaldi ve arada ~%2,7'lik korumasiz bir bant olustu.

**Duzeltme:** Kademeli fren merdiveni: %0,75 gunluk zararda islem basi risk YARIYA insin (risk_pct 0.25 -> 0.125); %1,0'da yeni giris tamamen dursun (mevcutlar yonetilir); %1,5'te ayni yondeki en zararli 3 pozisyon kapansin; %2,0'de kitap duzlestirilsin. Ayrica fren `equity` yerine GERCEKLESEN gunluk P/L + yuzen zararin MAKSIMUMU uzerinden olculsun ki yuzen kar freni maskelemesin.

**Dosyalar:** account_brain.py, borsakrali_account_brain.py

---

## 48. [ORTA] H2 KISMEN ELENDI - ama gercek bir kusur var: beyin acikken config'teki `max_lot` SESSIZCE yok sayiliyor

**Kanit:**

```
H2'nin ELENEN kismi: lot risk-bazli hesaplaniyor (borsakrali_mt5_all.py:314-318 `lot = equity*risk_pct/100 / per_lot_risk_usd`), yani hedef dolar riski enstrumandan BAGIMSIZ esitleniyor; 1.00 tavani yalnizca KIRPMA yapar, buyutme degil (trade_guard.py:171 `raw_lot = min(lot, cap, vmax)`, :176 adima ASAGI oturtma). Acik ekrandaki kesirli lotlar bunu dogruluyor: BTCUSD 0,44 / ETHUSD 0,64 / XAUUSD 0,01-0,10 -> bu enstrumanlarda tavan hic baglamamis, risk normalizasyonu CALISIYOR. Gozlenen tek-islem zarar araligi 148,05$ (USDJPY) - 414,90$ (XAUUSD) = ~2,8x, ki bu zaten risk_pct'in izin verdigi 197$-494$ bandiyla (%0,10-%0,25) uyumlu; iddia edilen 10x YOK. H2'nin GECERLI kalan kismi ise ayri bir hata: trade_guard.py:140-143 `tier_cap = cfg.get("account_tier_max_lot", cfg.get("brain_max_lot", cap)); cfg_cap = float(cfg.get("max_lot", tier_cap) if not brain_on else tier_cap)` -> `central_brain_enabled=true` iken `cfg["max_lot"]` ifadeye HIC girmiyor. config_all.json'da `max_lot: 1.0` yazili ama bu deger canlida OLU; kullanici bunu 0.30 yapsa hicbir sey degismez. Ikinci gecerli nokta: tavan bagladigi anda (cogunlukla dar stoplu EURUSD/USDJPY/US100 - kullanicinin listesindeki '1.00 lot' kohortu) islem artik risk-normalize DEGIL, sabit-1.00-lot olur ve komisyon riskle degil LOT ile olceklenir - yani en pahali komisyonu en dusuk riskli islemler oder.
```

**Kok neden:** `lot_cap_for` beyin modunda 'dinamik risk lotunu eski 0.15 sabiti kirpmasin' amaciyla yazildi (yorum satirlari bunu soyluyor), ama ayni kosul kullanicinin ACIKCA yazdigi `max_lot` guvenlik tavanini da devre disi birakiyor. Guvenlik yonu 'config yalniz DUSUREBILIR' olarak belgelenmis ama kod bu sozlesmeyi beyin modunda uygulamiyor.

**Duzeltme:** trade_guard.py:141 `cfg_cap = min(tier_cap, cfg.get("max_lot", tier_cap))` yapilsin - `max_lot` her modda DUSURUCU yonde gecerli olsun (belgelenen sozlesme zaten bu). Ayrica tavan bagladiginda (`lot == cap`) bunu bir olay olarak logla/telemetriye yaz: 'lot_cap_bound' sayaci yuksekse risk_pct fiilen anlamsizdir ve lot-bazli komisyon rejimine gecilmistir - bu, sistemin sessizce risk-normalize olmaktan cikip sabit-lota dondugu tek gozlenebilir sinyaldir.

**Dosyalar:** trade_guard.py, borsakrali_mt5_all.py, config_all.example.json

---

## 49. [ORTA] H5 TEST EDILEMEZ (18'lik ornek hesabin ornegi degil) - ancak hesap aritmetigi kazananlarin 3R tasarima karsi ~1,6R'de kapandigini gosteriyor

**Kanit:**

```
Rapordaki 6 TP / 12 SL sadece 38 botun 2'sinden ve ~60-90 gercek kapanisin 18'inden geliyor (bkz. 1. ve 3. bulgular) -> temsil iddiasi yok, H5 bu veriyle test EDILEMEZ. Buna karsilik hesap aritmetigi bagimsiz bir sonuc veriyor: brut P/L -2.600,98$ (maliyet haric). ~60 islemde islem basi brut -43,35$. Tasarim `min_rr = 3.0` (account_brain.py:493-495, min_rr yalnizca 3/4/5 olabilir) ve islem basi risk ~250-494$. %33 kazanma orani + tam-stop kayiplari (L=300$) varsayimiyla TASARLANAN beklenen deger = 0,333x900 - 0,667x300 = +100$/islem; GOZLENEN -43$/islem. Gozlenen degeri veren kazanc buyuklugu: 0,333xW - 0,667x300 = -43 -> W = 472$ = 1,57R. Yani kazananlar ~1,6R'de kapaniyor, kaybedenler tam 1R oduyor. Bu, kar-kilidi/trail mekanigiyle uyumlu: `profit_giveback_activation_r=1.0` + `max_profit_giveback_fraction=0.25` (account_brain.py:94-95) kazanci 1R'den sonra tepe-geri-verme ile kesiyor; 3R trail'e ulasan islem sayisi cok az. Ayrica `runner_target_r=10.0` (kazanci tasiyacak mekanizma) zarar gununde VPS'te HIC YOKTU (6. bulgu).
```

**Kok neden:** Sistemin tum edge varsayimi 3R hedefe dayaniyor, ama gerceklesen odeme orani ~1,6:1. 3:1 tasarim + %33 kazanma orani karli iken, 1,6:1 + %33 kayipli bir sistemdir (0,333x1,6 - 0,667x1,0 = -0,13R/islem). Yaris modu bu negatif beklentiyi 5 islem/gun yerine 60-90 islem/gune uygulayinca zarar dogrusal olarak buyudu.

**Duzeltme:** 1) ONCE OLC: 3. bulgudaki rapor sizintilari kapatilmadan hicbir strateji karari verilmemeli - su an sistemin gercek kazanma orani ve R dagilimi BILINMIYOR. Kapatildiktan sonra `realResults` uzerinden bot bazli R-histogrami yayinlansin. 2) Kar-kilidi kalibrasyonu: `profit_giveback_activation_r` 1.0 -> 1.5 ve `max_profit_giveback_fraction` 0.25 -> 0.40 denensin (kazanani daha uzun kossun). 3) runner (`_maybe_extend_runner`) canliya alinsin. 4) Beklenti kapisi: bir botun son 30 isleminde gerceklesen ortalama R < 0 ise o bot otomatik golgeye alinsin - 38 botun hepsinin ayni anda gercek para riske etmesi icin hicbir kanit kapisi yok.

**Dosyalar:** account_brain.py, borsakrali_account_brain.py, store.js, index.js

---

## 50. [DUSUK] `_closed_rows` içinde iki sessiz `continue` daha — hiçbiri cursor'u bloke etmiyor (bulgu 3 ile aynı sınıf)

**Kanit:**

```
borsakrali_account_brain.py:1213-1215 —
```
close_deals = [deal for deal in lifecycle if _is_close_deal(deal)]
if not close_deals:
    continue
```
borsakrali_account_brain.py:1217-1218 —
```
if int(getattr(latest, "time", 0) or 0) < boundary:
    continue
```
borsakrali_account_brain.py:1230-1231 — `if magic <= 0: continue`
Üçünde de `blocked_position_ids.append(...)` YOK → `cursor_blocked` False kalır → 1348-1351 cursor'u ileri sarar → bu pozisyonlar bir daha hiç değerlendirilmez.
Ayrıca `_position_history` MT5'e pozisyon başına ayrı çağrı yapıyor (1168); 40 aday pozisyonda bu 40 senkron MT5 çağrısı demek — 2 saniyelik rapor döngüsünde gecikme/başarısızlık üretir ve 1208-1211 bloke yolunu tetikler.
```

**Kok neden:** 'Atla' ile 'bu turda işleyemedim' aynı kontrol akışıyla (`continue`) ifade edilmiş; ayrım yalnız tek bir dalda (lifecycle None) yapılmış. Fonksiyon 'deliksiz süzgeç' varsayımını sağlamıyor ama çağıran taraf öyle davranıyor.

**Duzeltme:** Her `continue` için niyeti ayır: gerçekten 'bu bir bot işlemi değil' olanlar (magic<=0 sonrası, close_deals yok) sessiz atlanabilir; 'henüz göremiyorum' olanlar (live, lifecycle None, boundary yarışı) `blocked_position_ids`'e eklenmeli. Sonra 1348-1351'i `if not cursor_blocked` dalında tutmaya devam et — mevcut yapı zaten doğru, eksik olan yalnız bloke listesinin doldurulması.

**Dosyalar:** borsakrali_account_brain.py

---

## 51. [DUSUK] realResults/store.js başlık yorumu ve magic tahsis planı gerçekle uyuşmuyor (bakım tuzağı)

**Kanit:**

```
store.js başlığı: 'magic → bot eşlemesi: 5701-5715 = 15 yarışçı (catalog), 5720+ = özel botlar (bot-builder), 20260707 = altın botu.'
Gerçek: catalog 38 yarışçı ve 5701-5719 + 5730-5745 + 5748-5751 kullanıyor. botBuilder/store.js createCustom(): `let magic = 5800; while (used.has(magic)) magic++;` ve yorumu '5700-5799 katalog botlarına ayrılmıştır'.
Yani yorumdaki '5720+' aralığı yanlış; bugün 5720-5729 ve 5746-5747 BOŞ. Bir sonraki katalog eklemesinde bu boşluklara bot koyulursa hangi belgeye güvenileceği belirsiz.
```

**Kok neden:** Katalog 15'ten 38 bota büyürken bağımlı modüllerin başlık yorumları güncellenmemiş.

**Duzeltme:** store.js başlığını gerçek aralıklarla güncelle (5701-5719, 5730-5745, 5748-5751 = katalog; 5800+ = özel botlar; 20260707 = altın; 550055/550066 = adanmış köprüler). Tercihen tahsisi kod haline getir: catalog.js'te MAGIC_RANGES sabiti + bir test (katalog magic'i özel bot aralığına taşarsa CI kırılsın).

**Dosyalar:** store.js, store.js, catalog.js

---

## 52. [DUSUK] H3 (trend/range rejimi) tetikleyici olarak GECERLI ama bagimsiz aciklama DEGIL - kayiplarin varlik siniflari arasi es-zamanliligi tek-faktor imzasi

**Kanit:**

```
Rejim degisimi zarar gununun tetikleyicisi oldugu kesin (6. bulgu: kod iki gunde birebir ayni, dolayisiyla isaret degisimi %100 piyasa). Ancak rejim TEK BASINA aciklama olamaz, cunku: (a) zararlar es zamanli olarak FX majorlerinde (EURUSD -287, -277, USDJPY -148), kriptoda (BTCUSD -379,89 ve -245,29, ETHUSD -250,40), endekste (US100 -162,95) ve altinda (XAUUSD -414,90) birden gerceklesti - 'trend mi range mi' etkisi enstruman-ozgudur, bu ise tum varlik siniflarini ayni anda vuran tek bir risk-on/USD faktor donusudur; (b) portfoyde dogal hedge olmasi gereken mean-reversion botlari (mt5-reversion 5718, mt5-rsi2 5742) mevcut ama yaris modunda ayni sembolde trend botuyla TERS pozisyon tasiyabildikleri icin (5. bulgu) hedge kara donusmuyor, yalnizca cift komisyon oduyor; (c) cesitlendirilmis bir kitapta ayni rejim donusunun maliyeti sigma=2.208$ iken, surulesmis kitapta 8.349$'dir (2. bulgu) - yani rejim GIRDI, yaris modu CARPAN.
```

**Kok neden:** Rejim riski kacinilmazdir ve elenemez; elenebilir olan sey, tek bir rejim donusunun butun kitabi ayni anda vurmasini saglayan yapisal korelasyondur. Sistemde rejim tespiti (trend/range) hicbir merkezi kapida kullanilmiyor - botlar kendi iclerinde ADX/chop kapilari tasisa da hesap seviyesinde 'bugun tum trend botlarini kis' diyen bir katman yok.

**Duzeltme:** Hesap seviyesinde rejim carpani ekle: gunluk ADX/realized-vol olcumunden 'trend' / 'range' etiketi cikarilsin; range gunlerinde trend-ailesi botlarinin (trend, momentum, cloud, turtle, squeeze, tsmom, combo-trend) islem basi riski %50 kirpilsin veya golgeye alinsin, trend gunlerinde mean-reversion ailesi kirpilsin. Bu, 2. bulgudaki faktor-kovasi tavaniyla BIRLIKTE uygulanmali - tek basina rejim filtresi korelasyon problemini cozmez, yalnizca erteler. Oncelik sirasi: (1) rapor sizintilarini kapat (olcum olmadan karar yok), (2) faktor-bazli korelasyon tavani + kademeli fren merdiveni, (3) maliyet-farkinda RR kapisi, (4) rejim filtresi.

**Dosyalar:** account_brain.py, catalog.js, strategyEngines.js
